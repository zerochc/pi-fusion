/**
 * mmr-workflow: Multi-stage Workflow Extension for Pi
 *
 * Provides /workflow and /workflows commands for executing
 * multi-model, multi-stage development pipelines.
 *
 * Usage:
 *   /workflows                    List available workflows
 *   /workflow <name> <input>      Execute a workflow
 *   /workflow-validate <name>     Validate a workflow definition
 */

import type { LlmCallFn } from "../../core/moa-engine.js";
import { runWorkflow, formatWorkflowSummary, getFinalOutput } from "../../core/workflow-engine.js";
import {
  loadWorkflow,
  listWorkflows,
  validateWorkflow,
} from "../../core/config.js";
import type { StageResult } from "../../types.js";

// ─── Pi Extension Interface ───────────────────────────────────────────────────

interface PiExtensionContext {
  registerCommand(command: {
    name: string;
    description: string;
    handler: (args: string) => Promise<string>;
  }): void;
  llm?: {
    call(params: {
      provider: string;
      model: string;
      thinking: string;
      systemPrompt: string;
      userMessage: string;
      signal?: AbortSignal;
    }): Promise<string>;
  };
  print(message: string): void;
}

// ─── Activation ──────────────────────────────────────────────────────────────

export function activate(ctx: PiExtensionContext): void {
  // /workflows command — list available workflows
  ctx.registerCommand({
    name: "/workflows",
    description: "List available workflow definitions",
    handler: async () => {
      const workflows = listWorkflows();
      if (workflows.length === 0) {
        return "No workflows found. Add .workflow.md files to ~/.pi/workflows/";
      }
      const lines = ["## Available Workflows", ""];
      for (const wf of workflows) {
        lines.push(`- **${wf.name}**: ${wf.description}`);
      }
      lines.push("", "Use `/workflow <name> <input>` to execute.");
      return lines.join("\n");
    },
  });

  // /workflow command — execute a workflow
  ctx.registerCommand({
    name: "/workflow",
    description:
      "Execute a multi-stage workflow with different models per stage",
    handler: async (args: string) => {
      const parts = args.trim().split(/\s+/);
      if (parts.length < 2) {
        return [
          "Usage: /workflow <name> <input>",
          "",
          "Examples:",
          "  /workflow feature-dev \"Implement JWT authentication\"",
          "  /workflow bug-hunt \"Orders stuck in PAYING status\"",
          "",
          "Use /workflows to list available workflows.",
        ].join("\n");
      }

      const workflowName = parts[0];
      const input = parts.slice(1).join(" ");

      const workflow = loadWorkflow(workflowName);
      if (!workflow) {
        const available = listWorkflows()
          .map((w) => w.name)
          .join(", ");
        return `Workflow "${workflowName}" not found. Available: ${available || "none"}`;
      }

      // Validate
      const errors = validateWorkflow(workflow);
      if (errors.length > 0) {
        return `Workflow validation failed:\n${errors.map((e) => `  - ${e}`).join("\n")}`;
      }

      // Build LLM callback
      const llmCall: LlmCallFn = async (params) => {
        if (ctx.llm?.call) {
          return ctx.llm.call(params);
        }
        throw new Error("LLM call not available in this pi context");
      };

      ctx.print(`\n🔄 Workflow: ${workflow.name} (${workflow.stages.length} stages)\n`);

      try {
        const result = await runWorkflow({
          workflow,
          input,
          llmCall,
          onStageStart: (stageId: string) => {
            ctx.print(`  ⏳ Stage: ${stageId}...`);
          },
          onStageComplete: (sr: StageResult) => {
            const status = sr.error ? "❌" : "✅";
            const dur = (sr.durationMs / 1000).toFixed(1);
            ctx.print(`  ${status} Stage: ${sr.stageId} (${sr.provider}/${sr.model}) — ${dur}s`);
          },
        });

        ctx.print(`\n✨ Workflow complete — ${(result.totalDurationMs / 1000).toFixed(1)}s total\n`);
        return formatWorkflowSummary(result);
      } catch (err) {
        return `Workflow failed: ${err instanceof Error ? err.message : "Unknown error"}`;
      }
    },
  });

  // /workflow-validate command — validate a workflow definition
  ctx.registerCommand({
    name: "/workflow-validate",
    description: "Validate a workflow definition",
    handler: async (args: string) => {
      const name = args.trim();
      if (!name) return "Usage: /workflow-validate <name>";

      const workflow = loadWorkflow(name);
      if (!workflow) return `Workflow "${name}" not found.`;

      const errors = validateWorkflow(workflow);
      if (errors.length === 0) {
        return `Workflow "${name}" is valid. ${workflow.stages.length} stages, ${workflow.stages.reduce((sum, s) => sum + s.dependsOn.length, 0)} dependencies.`;
      }
      return `Validation errors:\n${errors.map((e) => `  - ${e}`).join("\n")}`;
    },
  });
}

// ─── Pi Package Manifest Export ──────────────────────────────────────────────

const extension = { activate };
export default extension;
