/**
 * mmr-workflow: Multi-stage Workflow Extension for Pi
 */

import { loadWorkflow, listWorkflows, validateWorkflow } from "../../core/config.js";

// ─── Minimal Pi types ────────────────────────────────────────────────────────

interface PiAPI {
  registerCommand(name: string, options: { description?: string; handler: (args: string) => Promise<void> }): void;
  sendUserMessage(content: string, options?: { deliverAs?: "steer" | "followUp" }): void;
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
      pi.sendUserMessage([
        "## Available Workflows",
        "",
        ...workflows.map((w) => `- **${w.name}**: ${w.description}`),
        "",
        'Use `/workflow <name> <input>` to execute.',
      ].join("\n"));
    },
  });

  pi.registerCommand("/workflow", {
    description: "Execute a multi-stage workflow with different models per stage",
    handler: async (args: string) => {
      const parts = args.trim().split(/\s+/);
      if (parts.length < 2) {
        pi.sendUserMessage([
          "Usage: `/workflow <name> <input>`",
          "",
          "Examples:",
          '  `/workflow feature-dev "Implement JWT auth"`',
          '  `/workflow bug-hunt "Orders stuck in PAYING"`',
          "",
          "Use `/workflows` to list available workflows.",
        ].join("\n"));
        return;
      }

      const workflowName = parts[0];
      const input = parts.slice(1).join(" ");

      const workflow = loadWorkflow(workflowName);
      if (!workflow) {
        const available = listWorkflows().map((w) => w.name).join(", ");
        pi.sendUserMessage(`Workflow "${workflowName}" not found. Available: ${available || "none"}`);
        return;
      }

      const errors = validateWorkflow(workflow);
      if (errors.length > 0) {
        pi.sendUserMessage(`Workflow "${workflowName}" validation errors:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
        return;
      }

      const stageList = workflow.stages.map((s) => {
        const deps = s.dependsOn.length > 0 ? ` (depends: ${s.dependsOn.join(", ")})` : "";
        return `- **${s.id}**: ${s.provider}/${s.model} (${s.thinking})${deps}`;
      }).join("\n");

      pi.sendUserMessage([
        `**Workflow: ${workflow.name}** — ${workflow.description}`,
        "",
        `**Input**: ${input}`,
        "",
        "**Stages**:",
        stageList,
        "",
        "Execute each stage sequentially using pi-mmr Task subagents with the specified model settings.",
      ].join("\n"));
    },
  });

  pi.registerCommand("/workflow-validate", {
    description: "Validate a workflow definition",
    handler: async (args: string) => {
      const name = args.trim();
      if (!name) { pi.sendUserMessage("Usage: /workflow-validate <name>"); return; }
      const workflow = loadWorkflow(name);
      if (!workflow) { pi.sendUserMessage(`Workflow "${name}" not found.`); return; }
      const errors = validateWorkflow(workflow);
      if (errors.length === 0) {
        pi.sendUserMessage(`✅ Workflow "${name}" valid. ${workflow.stages.length} stage(s), ${workflow.stages.reduce((sum, s) => sum + s.dependsOn.length, 0)} dependencies.`);
      } else {
        pi.sendUserMessage(`❌ Validation errors:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
      }
    },
  });
}
