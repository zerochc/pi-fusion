/**
 * mmr-workflow: Multi-stage Workflow Extension for Pi
 *
 * Provides /workflows, /workflow, /workflow-validate commands.
 * Registered as a pi extension via default export factory.
 */

import { loadWorkflow, listWorkflows, validateWorkflow } from "../../core/config.js";

// ─── Pi ExtensionAPI types (subset of actual API) ────────────────────────────

interface PiCommandContext {
  sendMessage<T = unknown>(
    message: string,
    options?: { role?: "user"; includeInHistory?: boolean; metadata?: T }
  ): Promise<{ id: string }>;
}

interface CommandOptions {
  description?: string;
  handler: (args: string, ctx: PiCommandContext) => Promise<void>;
}

interface PiExtensionAPI {
  registerCommand(name: string, options: CommandOptions): void;
}

// ─── Extension Factory ───────────────────────────────────────────────────────

export default function mmrWorkflowExtension(pi: PiExtensionAPI): void {
  pi.registerCommand("/workflows", {
    description: "List available workflow definitions",
    handler: async (_args: string, ctx: PiCommandContext) => {
      const workflows = listWorkflows();
      if (workflows.length === 0) {
        await ctx.sendMessage(
          "No workflows found. Add .workflow.md files to ~/.pi/workflows/"
        );
        return;
      }
      const lines = [
        "## Available Workflows",
        "",
        ...workflows.map(
          (w) => `- **${w.name}**: ${w.description}`
        ),
        "",
        'Use `/workflow <name> <input>` to execute. Example: `/workflow feature-dev "Implement JWT authentication"`',
      ];
      await ctx.sendMessage(lines.join("\n"));
    },
  });

  pi.registerCommand("/workflow", {
    description:
      "Execute a multi-stage workflow with different models per stage",
    handler: async (args: string, ctx: PiCommandContext) => {
      const parts = args.trim().split(/\s+/);
      if (parts.length < 2) {
        await ctx.sendMessage(
          [
            'Usage: `/workflow <name> <input>`\n',
            "Examples:",
            '  `/workflow feature-dev "Implement JWT authentication"`',
            '  `/workflow bug-hunt "Orders stuck in PAYING status"`',
            '  `/workflow code-review "Review the auth module"`',
            "",
            "Use `/workflows` to list available workflows.",
          ].join("\n")
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
        await ctx.sendMessage(
          `Workflow "${workflowName}" not found. Available: ${available || "none"}`
        );
        return;
      }

      const errors = validateWorkflow(workflow);
      if (errors.length > 0) {
        await ctx.sendMessage(
          `Workflow "${workflowName}" has validation errors:\n${errors.map((e) => `  - ${e}`).join("\n")}`
        );
        return;
      }

      // Build stage summary
      const stageList = workflow.stages
        .map((s) => {
          const deps = s.dependsOn.length > 0 ? ` (depends: ${s.dependsOn.join(", ")})` : "";
          return `- **${s.id}**: ${s.provider}/${s.model} (thinking: ${s.thinking})${deps}`;
        })
        .join("\n");

      const prompt = [
        `**Workflow: ${workflow.name}** — ${workflow.description}`,
        "",
        `**Input**: ${input}`,
        "",
        "**Stages** (executed in dependency order):",
        stageList,
        "",
        "Execute each stage sequentially using pi-mmr Task subagents:",
        "1. For each stage, create a Task with the specified provider/model/thinking settings",
        "2. Pass outputs from dependency stages as context",
        "3. After all stages complete, present a summary",
        "",
        "Use the exact stage prompts and tool allowlists defined in the workflow spec.",
      ].join("\n");

      await ctx.sendMessage(prompt);
    },
  });

  pi.registerCommand("/workflow-validate", {
    description: "Validate a workflow definition",
    handler: async (args: string, ctx: PiCommandContext) => {
      const name = args.trim();
      if (!name) {
        await ctx.sendMessage("Usage: /workflow-validate <name>");
        return;
      }

      const workflow = loadWorkflow(name);
      if (!workflow) {
        await ctx.sendMessage(`Workflow "${name}" not found in ~/.pi/workflows/`);
        return;
      }

      const errors = validateWorkflow(workflow);
      if (errors.length === 0) {
        await ctx.sendMessage(
          `✅ Workflow "${name}" is valid. ${workflow.stages.length} stage(s), ${workflow.stages.reduce((sum, s) => sum + s.dependsOn.length, 0)} dependencies.`
        );
      } else {
        await ctx.sendMessage(
          `❌ Validation errors:\n${errors.map((e) => `  - ${e}`).join("\n")}`
        );
      }
    },
  });
}
