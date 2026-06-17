/**
 * mmr-workflow: Multi-stage Workflow Extension for Pi
 *
 * Loads .workflow.md definitions from ~/.pi/workflows and executes each stage
 * using the provider/model/thinking/tools specified in the workflow file.
 */

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";
import { loadWorkflow, listWorkflows, validateWorkflow } from "../../core/config.js";
import { formatWorkflowSummary, runWorkflow } from "../../core/workflow-engine.js";
import type { StageResult } from "../../types.js";

// ─── Minimal Pi API surface used by this extension ───────────────────────────

interface ModelRegistry {
	find(provider: string, modelId: string): Model<any> | undefined;
	getAvailable(): Model<any>[];
	hasConfiguredAuth(model: Model<any>): boolean;
}

interface SessionManager {
	buildSessionContext(): { messages: AgentMessage[] };
}

interface PiCommandContext {
	model: Model<any> | undefined;
	modelRegistry: ModelRegistry;
	setModel(model: Model<any>): Promise<boolean>;
	getThinkingLevel(): string;
	setThinkingLevel(level: string): void;
	getActiveTools(): string[];
	setActiveTools(toolNames: string[]): void;
	sendUserMessage(content: string): Promise<void>;
	waitForIdle(): Promise<void>;
	sessionManager: SessionManager;
}

interface PiAPI {
	registerCommand(
		name: string,
		options: {
			description?: string;
			handler: (args: string, ctx: PiCommandContext) => Promise<void>;
		},
	): void;
	sendUserMessage(content: string, options?: { deliverAs?: "steer" | "followUp" }): void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extract plain text from the most recent assistant message.
 * Thinking blocks and tool calls are intentionally excluded from the stage
 * output that gets passed to downstream stages.
 */
function extractAssistantText(messages: AgentMessage[]): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (msg.role !== "assistant") continue;
		const texts: string[] = [];
		for (const part of msg.content) {
			if (part.type === "text") {
				texts.push(part.text);
			}
		}
		return texts.join("\n").trim();
	}
	return "";
}

function normalizeModelId(id: string): string {
	return id.toLowerCase().trim();
}

function resolveStageModel(
	provider: string,
	modelId: string,
	registry: ModelRegistry,
): Model<any> | undefined {
	// Exact match first.
	const exact = registry.find(provider, modelId);
	if (exact) return exact;

	// Fallback: case-insensitive match within the requested provider only.
	// We intentionally do NOT match by bare model id across providers, because
	// that would silently switch to the wrong provider when two providers
	// expose a model with the same id.
	const normalizedModel = normalizeModelId(modelId);
	const normalizedProvider = normalizeModelId(provider);
	const available = registry.getAvailable();

	return available.find((m) => {
		return (
			normalizeModelId(m.provider) === normalizedProvider &&
			normalizeModelId(m.id) === normalizedModel
		);
	});
}

// ─── Extension Factory ───────────────────────────────────────────────────────

export default function mmrWorkflowExtension(pi: PiAPI): void {
	pi.registerCommand("/workflows", {
		description: "List available workflow definitions",
		handler: async () => {
			const workflows = listWorkflows();
			if (workflows.length === 0) {
				pi.sendUserMessage("No workflows found. Add .workflow.md files to ~/.pi/workflows/");
				return;
			}
			pi.sendUserMessage(
				[
					"## Available Workflows",
					"",
					...workflows.map((w) => `- **${w.name}**: ${w.description}`),
					"",
					'Use `/workflow <name> <input>` to execute.',
				].join("\n"),
			);
		},
	});

	pi.registerCommand("/workflow", {
		description: "Execute a multi-stage workflow with different models per stage",
		handler: async (args: string, ctx: PiCommandContext) => {
			const parts = args.trim().split(/\s+/);
			if (parts.length < 2) {
				pi.sendUserMessage(
					[
						"Usage: `/workflow <name> <input>`",
						"",
						"Examples:",
						'  `/workflow feature-dev "Implement JWT auth"`',
						'  `/workflow bug-hunt "Orders stuck in PAYING"`',
						"",
						"Use `/workflows` to list available workflows.",
					].join("\n"),
				);
				return;
			}

			const workflowName = parts[0];
			const input = parts.slice(1).join(" ");

			const workflow = loadWorkflow(workflowName);
			if (!workflow) {
				const available = listWorkflows()
					.map((w) => w.name)
					.join(", ");
				pi.sendUserMessage(`Workflow "${workflowName}" not found. Available: ${available || "none"}`);
				return;
			}

			const errors = validateWorkflow(workflow);
			if (errors.length > 0) {
				pi.sendUserMessage(
					`Workflow "${workflowName}" validation errors:\n${errors.map((e) => `  - ${e}`).join("\n")}`,
				);
				return;
			}

			const stageList = workflow.stages
				.map((s) => {
					const deps = s.dependsOn.length > 0 ? ` (depends: ${s.dependsOn.join(", ")})` : "";
					return `- **${s.id}**: ${s.provider}/${s.model} (${s.thinking})${deps}`;
				})
				.join("\n");

			pi.sendUserMessage(
				[
					`**Workflow: ${workflow.name}** — ${workflow.description}`,
					"",
					`**Input**: ${input}`,
					"",
					"**Stages**:",
					stageList,
					"",
					"Executing workflow...",
				].join("\n"),
			);

			// Capture current session state so we can restore it after the workflow.
			const originalModel = ctx.model;
			const originalThinking = ctx.getThinkingLevel();
			const originalTools = ctx.getActiveTools();

			try {
				const result = await runWorkflow({
					workflow,
					input,
					llmCall: async (stageParams) => {
						const { provider, model: modelId, thinking, tools, userMessage, signal } = stageParams;

						if (signal?.aborted) {
							throw new Error("Workflow stage aborted");
						}

						const model = resolveStageModel(provider, modelId, ctx.modelRegistry);
						if (!model) {
							throw new Error(`Model "${provider}/${modelId}" not found or not available`);
						}
						if (!ctx.modelRegistry.hasConfiguredAuth(model)) {
							throw new Error(`No API key configured for "${model.provider}/${model.id}"`);
						}

						const switched = await ctx.setModel(model);
						if (!switched) {
							throw new Error(`Failed to switch to "${model.provider}/${model.id}"`);
						}

						if (signal?.aborted) {
							throw new Error("Workflow stage aborted");
						}

						ctx.setThinkingLevel(thinking);
						ctx.setActiveTools(tools ?? []);

						await ctx.sendUserMessage(userMessage);

						// Pi does not currently expose a way to cancel an in-flight
						// sendUserMessage, so we only check for abort before waiting.
						if (signal?.aborted) {
							throw new Error("Workflow stage aborted");
						}
						await ctx.waitForIdle();

						const { messages } = ctx.sessionManager.buildSessionContext();
						return extractAssistantText(messages);
					},
					onStageStart: (stageId) => {
						pi.sendUserMessage(`🔹 Starting stage: **${stageId}**`);
					},
					onStageComplete: (stageResult: StageResult) => {
						const status = stageResult.error ? "❌ FAILED" : "✅ OK";
						pi.sendUserMessage(
							`🔸 Stage **${stageResult.stageId}** ${status} (${stageResult.provider}/${stageResult.model}) — ${(stageResult.durationMs / 1000).toFixed(1)}s`,
						);
					},
				});

				pi.sendUserMessage(formatWorkflowSummary(result));
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				pi.sendUserMessage(`Workflow "${workflowName}" failed: ${message}`);
			} finally {
				// Restore the session state that existed before the workflow ran.
				if (originalModel) {
					await ctx.setModel(originalModel).catch(() => {
						// Best-effort restore; don't mask the original workflow error.
						});
				}
				ctx.setThinkingLevel(originalThinking);
				ctx.setActiveTools(originalTools);
			}
		},
	});

	pi.registerCommand("/workflow-validate", {
		description: "Validate a workflow definition",
		handler: async (args: string) => {
			const name = args.trim();
			if (!name) {
				pi.sendUserMessage("Usage: /workflow-validate <name>");
				return;
			}
			const workflow = loadWorkflow(name);
			if (!workflow) {
				pi.sendUserMessage(`Workflow "${name}" not found.`);
				return;
			}
			const errors = validateWorkflow(workflow);
			if (errors.length === 0) {
				pi.sendUserMessage(
					`✅ Workflow "${name}" valid. ${workflow.stages.length} stage(s), ${workflow.stages.reduce((sum, s) => sum + s.dependsOn.length, 0)} dependencies.`,
				);
			} else {
				pi.sendUserMessage(`❌ Validation errors:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
			}
		},
	});
}
