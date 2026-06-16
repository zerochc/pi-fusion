/**
 * mmr-moa: MoA (Mixture of Agents) Fusion Extension for Pi
 *
 * Provides /moa, /moa-config, /moa-reload commands.
 * Registered as a pi extension via default export factory.
 */

import { loadMoaConfig } from "../../core/config.js";
import type { MoaConfig } from "../../types.js";

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

// ─── State ───────────────────────────────────────────────────────────────────

let moaConfig: MoaConfig = loadMoaConfig();

// ─── Extension Factory ───────────────────────────────────────────────────────

export default function mmrMoaExtension(pi: PiExtensionAPI): void {
  pi.registerCommand("/moa", {
    description:
      "Multi-model MoA fusion — send your question to multiple LLMs in parallel, get a synthesized answer",
    handler: async (args: string, ctx: PiCommandContext) => {
      const question = args.trim();
      if (!question) {
        await ctx.sendMessage(
          "/moa requires a question. Example: /moa What architecture should I use for this API?"
        );
        return;
      }

      const panelistList = moaConfig.panelists
        .map(
          (p) =>
            `- **${p.role}**: \`${p.provider}/${p.model}\` (thinking: ${p.thinking})`
        )
        .join("\n");

      const prompt = [
        "**MoA Fusion Analysis Request**",
        "",
        `**Question**: ${question}`,
        "",
        "**Panelists** (will be called in parallel):",
        panelistList,
        "",
        `**Synthesizer**: \`${moaConfig.synthesizer.provider}/${moaConfig.synthesizer.model}\``,
        "",
        "Please use pi-mmr background tasks to:",
        "1. Send the question to each panelist model in parallel",
        "2. Collect all responses",
        "3. Feed them to the synthesizer model for final aggregation",
        "4. Present the synthesized answer",
        "",
        "Use `background: true` on Task calls with different `model` settings per call.",
      ].join("\n");

      await ctx.sendMessage(prompt);
    },
  });

  pi.registerCommand("/moa-config", {
    description: "Show current MoA panelist and synthesizer configuration",
    handler: async (_args: string, ctx: PiCommandContext) => {
      const lines = [
        "## MoA Configuration",
        "",
        "**Panelists:**",
        ...moaConfig.panelists.map(
          (p) =>
            `- \`${p.role}\`: ${p.provider}/${p.model} (thinking: ${p.thinking})`
        ),
        "",
        `**Synthesizer:** ${moaConfig.synthesizer.provider}/${moaConfig.synthesizer.model} (thinking: ${moaConfig.synthesizer.thinking})`,
        "",
        `**Strategy:** ${moaConfig.strategy.mode} | timeout: ${moaConfig.strategy.timeoutSeconds}s | max panelists: ${moaConfig.strategy.maxPanelists}`,
        "",
        `Config: ~/.pi/moa/config.yaml — edit and /moa-reload to apply.`,
      ];
      await ctx.sendMessage(lines.join("\n"));
    },
  });

  pi.registerCommand("/moa-reload", {
    description: "Reload MoA configuration from ~/.pi/moa/config.yaml",
    handler: async (_args: string, ctx: PiCommandContext) => {
      moaConfig = loadMoaConfig();
      const msg = `MoA config reloaded. ${moaConfig.panelists.length} panelist(s), synthesizer: ${moaConfig.synthesizer.provider}/${moaConfig.synthesizer.model}`;
      await ctx.sendMessage(msg);
    },
  });
}
