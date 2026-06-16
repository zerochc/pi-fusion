/**
 * mmr-moa: MoA (Mixture of Agents) Fusion Extension for Pi
 *
 * Provides the /moa command that fans out a question to multiple
 * LLM panelists in parallel, then synthesizes their responses.
 *
 * Usage:
 *   /moa <question>              Run MoA with default config
 *   /moa-config                  Show current MoA configuration
 *   /moa-reload                  Reload MoA config from disk
 */

import type { LlmCallFn } from "../../core/moa-engine.js";
import { runMoa } from "../../core/moa-engine.js";
import { loadMoaConfig } from "../../core/config.js";
import type { MoaConfig, PanelistResult } from "../../types.js";

// ─── Pi Extension Interface ───────────────────────────────────────────────────
// This is the expected interface from pi's extension API.
// Actual types are from @earendil-works/pi-agent-core

interface PiExtensionContext {
  registerCommand(command: {
    name: string;
    description: string;
    handler: (args: string) => Promise<string>;
  }): void;
  /** Access to pi's LLM calling capability */
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
  /** Write output to the pi session */
  print(message: string): void;
}

// ─── State ───────────────────────────────────────────────────────────────────

let moaConfig: MoaConfig = loadMoaConfig();

// ─── Activation ──────────────────────────────────────────────────────────────

export function activate(ctx: PiExtensionContext): void {
  // /moa command
  ctx.registerCommand({
    name: "/moa",
    description:
      "Multi-model MoA fusion — sends your question to multiple LLMs in parallel and synthesizes the best answer",
    handler: async (args: string) => {
      const question = args.trim();
      if (!question) return "Usage: /moa <your question>";

      // Build LLM callback using pi's native API
      const llmCall: LlmCallFn = async (params) => {
        if (ctx.llm?.call) {
          return ctx.llm.call(params);
        }
        throw new Error("LLM call not available in this pi context");
      };

      ctx.print(`\n🎯 MoA Fusion — ${moaConfig.panelists.length} panelists\n`);

      try {
        const result = await runMoa({
          config: moaConfig,
          llmCall,
          question,
          onPanelistComplete: (pr: PanelistResult) => {
            const status = pr.error ? "❌" : "✅";
            const dur = (pr.durationMs / 1000).toFixed(1);
            ctx.print(`  ${status} ${pr.role} (${pr.provider}/${pr.model}) — ${dur}s`);
          },
        });

        ctx.print(`\n✨ Synthesized by ${moaConfig.synthesizer.provider}/${moaConfig.synthesizer.model}\n`);
        return result.synthesis;
      } catch (err) {
        return `MoA failed: ${err instanceof Error ? err.message : "Unknown error"}`;
      }
    },
  });

  // /moa-config command
  ctx.registerCommand({
    name: "/moa-config",
    description: "Show current MoA configuration",
    handler: async () => {
      const lines = [
        "## MoA Configuration",
        "",
        "### Panelists",
        ...moaConfig.panelists.map(
          (p) => `- ${p.role}: ${p.provider}/${p.model} (thinking: ${p.thinking})`
        ),
        "",
        "### Synthesizer",
        `- ${moaConfig.synthesizer.provider}/${moaConfig.synthesizer.model} (thinking: ${moaConfig.synthesizer.thinking})`,
        "",
        "### Strategy",
        `- Mode: ${moaConfig.strategy.mode}`,
        `- Timeout: ${moaConfig.strategy.timeoutSeconds}s`,
        `- Max panelists: ${moaConfig.strategy.maxPanelists}`,
      ];
      return lines.join("\n");
    },
  });

  // /moa-reload command
  ctx.registerCommand({
    name: "/moa-reload",
    description: "Reload MoA configuration from ~/.pi/moa/config.yaml",
    handler: async () => {
      moaConfig = loadMoaConfig();
      return `MoA config reloaded. ${moaConfig.panelists.length} panelists, synthesizer: ${moaConfig.synthesizer.provider}/${moaConfig.synthesizer.model}`;
    },
  });
}

// ─── Pi Package Manifest Export ──────────────────────────────────────────────

// Pi extensions export a default object with the activate function.
// When installed as a pi package, pi calls activate() at startup.
const extension = { activate };
export default extension;
