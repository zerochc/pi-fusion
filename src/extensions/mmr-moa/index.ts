/**
 * mmr-moa: MoA (Mixture of Agents) Fusion Extension for Pi
 */

import { loadMoaConfig } from "../../core/config.js";
import type { MoaConfig } from "../../types.js";

// ─── Minimal Pi types ────────────────────────────────────────────────────────

interface PiAPI {
  registerCommand(name: string, options: { description?: string; handler: (args: string) => Promise<void> }): void;
  sendUserMessage(content: string, options?: { deliverAs?: "steer" | "followUp" }): void;
}

// ─── State ───────────────────────────────────────────────────────────────────

let moaConfig: MoaConfig = loadMoaConfig();

// ─── Extension Factory ───────────────────────────────────────────────────────

export default function mmrMoaExtension(pi: PiAPI): void {
  pi.registerCommand("/moa", {
    description: "Multi-model MoA fusion — parallel LLM analysis with synthesis",
    handler: async (args: string) => {
      const question = args.trim();
      if (!question) {
        pi.sendUserMessage("/moa requires a question. Example: /moa What architecture should I use?");
        return;
      }

      const panelistList = moaConfig.panelists
        .map((p) => `- **${p.role}**: \`${p.provider}/${p.model}\` (thinking: ${p.thinking})`)
        .join("\n");

      pi.sendUserMessage([
        "**MoA Fusion Analysis**",
        "",
        `**Question**: ${question}`,
        "",
        "**Panelists**:",
        panelistList,
        "",
        `**Synthesizer**: \`${moaConfig.synthesizer.provider}/${moaConfig.synthesizer.model}\``,
        "",
        "Use pi-mmr background tasks to send this question to each panelist in parallel, then synthesize.",
      ].join("\n"));
    },
  });

  pi.registerCommand("/moa-config", {
    description: "Show MoA configuration",
    handler: async () => {
      pi.sendUserMessage([
        "## MoA Configuration",
        "",
        "**Panelists:**",
        ...moaConfig.panelists.map((p) => `- \`${p.role}\`: ${p.provider}/${p.model} (thinking: ${p.thinking})`),
        "",
        `**Synthesizer:** ${moaConfig.synthesizer.provider}/${moaConfig.synthesizer.model} (thinking: ${moaConfig.synthesizer.thinking})`,
        "",
        `**Strategy:** ${moaConfig.strategy.mode} | timeout: ${moaConfig.strategy.timeoutSeconds}s | max: ${moaConfig.strategy.maxPanelists}`,
        "",
        "Config: ~/.pi/moa/config.yaml",
      ].join("\n"));
    },
  });

  pi.registerCommand("/moa-reload", {
    description: "Reload MoA config from disk",
    handler: async () => {
      moaConfig = loadMoaConfig();
      pi.sendUserMessage(`MoA config reloaded. ${moaConfig.panelists.length} panelist(s), synthesizer: ${moaConfig.synthesizer.provider}/${moaConfig.synthesizer.model}`);
    },
  });
}
