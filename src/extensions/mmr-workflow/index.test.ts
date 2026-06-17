/**
 * Tests for mmr-workflow extension.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import mmrWorkflowExtension from "./index.js";

interface MockModel {
	provider: string;
	id: string;
}

function createMockCtx() {
	let currentModel: MockModel | undefined = { provider: "default", id: "default-model" };
	let currentThinking = "medium";
	let currentTools: string[] = ["read", "edit"];
	const sentMessages: string[] = [];
	const modelCalls: MockModel[] = [];
	const thinkingCalls: string[] = [];
	const toolCalls: string[][] = [];

	return {
		get model() {
			return currentModel;
		},
		modelRegistry: {
			find: (provider: string, modelId: string) => {
				return { provider, id: modelId };
			},
			getAvailable: () => [
				{ provider: "deepseek", id: "deepseek-v4-pro" },
				{ provider: "kimi-coding", id: "kimi-for-coding" },
			],
			hasConfiguredAuth: () => true,
		},
		setModel: async (model: MockModel) => {
			currentModel = model;
			modelCalls.push(model);
			return true;
		},
		getThinkingLevel: () => currentThinking,
		setThinkingLevel: (level: string) => {
			currentThinking = level;
			thinkingCalls.push(level);
		},
		getActiveTools: () => [...currentTools],
		setActiveTools: (tools: string[]) => {
			currentTools = [...tools];
			toolCalls.push([...tools]);
		},
		sendUserMessage: async (content: string) => {
			sentMessages.push(content);
		},
		waitForIdle: async () => {
			/* no-op */
		},
		sessionManager: {
			buildSessionContext: () => ({
				messages: [
					{
						role: "assistant",
						content: [{ type: "text", text: `Output for ${currentModel?.provider}/${currentModel?.id}` }],
					},
				],
			}),
		},
		get currentModel() {
			return currentModel;
		},
		get currentThinking() {
			return currentThinking;
		},
		get currentTools() {
			return currentTools;
		},
		get sentMessages() {
			return sentMessages;
		},
		get modelCalls() {
			return modelCalls;
		},
		get thinkingCalls() {
			return thinkingCalls;
		},
		get toolCalls() {
			return toolCalls;
		},
	};
}

describe("mmr-workflow extension", () => {
	it("executes workflow stages and switches model/thinking/tools per stage", async () => {
		const workflowDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-fusion-workflow-test-"));
		const workflowFile = path.join(workflowDir, "feature-dev.workflow.md");
		fs.writeFileSync(
			workflowFile,
			`---
type: workflow
name: feature-dev
description: Test workflow
version: "1.0"

stages:
  - id: plan
    provider: deepseek
    model: deepseek-v4-pro
    thinking: xhigh
    tools: [read, grep]
    prompt: Plan the feature.

  - id: implement
    provider: kimi-coding
    model: kimi-for-coding
    thinking: high
    tools: [read, write, edit]
    depends_on: [plan]
    prompt: Implement the feature.
---
`,
		);

		const originalWorkflowDir = process.env.WORKFLOW_DIR;
		process.env.WORKFLOW_DIR = workflowDir;

		try {
			const commands = new Map<string, { handler: (args: string, ctx: any) => Promise<void> }>();
			const sentUserMessages: string[] = [];

			const pi = {
				registerCommand: (name: string, options: { handler: (args: string, ctx: any) => Promise<void> }) => {
					commands.set(name, options);
				},
				sendUserMessage: (content: string) => {
					sentUserMessages.push(content);
				},
			};

			mmrWorkflowExtension(pi as any);

			const workflowCommand = commands.get("/workflow");
			assert.ok(workflowCommand, "/workflow command should be registered");

			const ctx = createMockCtx();
			await workflowCommand.handler("feature-dev implement auth", ctx as any);

			// Two stages should have been executed.
			assert.equal(ctx.sentMessages.length, 2, "two user prompts should be sent to the agent");
			assert.ok(ctx.sentMessages[0].includes("Plan the feature"), "first prompt should be plan");
			assert.ok(ctx.sentMessages[1].includes("Implement the feature"), "second prompt should be implement");

			// Model should switch per stage, then restore the original model afterwards.
			assert.deepEqual(ctx.modelCalls, [
				{ provider: "deepseek", id: "deepseek-v4-pro" },
				{ provider: "kimi-coding", id: "kimi-for-coding" },
				{ provider: "default", id: "default-model" },
			]);
			assert.deepEqual(ctx.currentModel, { provider: "default", id: "default-model" }, "original model should be restored");

			// Thinking level should follow the stages and then restore.
			assert.deepEqual(ctx.thinkingCalls, ["xhigh", "high", "medium"]);
			assert.equal(ctx.currentThinking, "medium", "original thinking level should be restored");

			// Tools should follow the stages and then restore.
			assert.deepEqual(ctx.toolCalls, [
				["read", "grep"],
				["read", "write", "edit"],
				["read", "edit"],
			]);
			assert.deepEqual(ctx.currentTools, ["read", "edit"], "original tools should be restored");

			// Summary should be sent.
			assert.ok(sentUserMessages.some((m) => m.includes("Workflow: feature-dev")), "summary should be sent");
			assert.ok(sentUserMessages.some((m) => m.includes("deepseek-v4-pro")), "summary should mention first model");
			assert.ok(sentUserMessages.some((m) => m.includes("kimi-for-coding")), "summary should mention second model");
		} finally {
			if (originalWorkflowDir !== undefined) {
				process.env.WORKFLOW_DIR = originalWorkflowDir;
			} else {
				delete process.env.WORKFLOW_DIR;
			}
			fs.rmSync(workflowDir, { recursive: true, force: true });
		}
	});
});
