/**
 * mmr-proxy: Provider Proxy Extension for Pi
 *
 * Routes providers through custom endpoints via environment variables.
 * Set any of these to override the default provider baseUrl:
 *
 *   PI_GOOGLE_BASE_URL   → Google Gemini proxy
 *   PI_DEEPSEEK_BASE_URL → DeepSeek proxy
 *   PI_OPENAI_BASE_URL   → OpenAI proxy
 */

interface ProviderOverride {
  baseUrl?: string;
  headers?: Record<string, string>;
}

interface PiExtensionAPI {
  registerProvider(provider: string, override: ProviderOverride): void;
  registerCommand(name: string, options: { description?: string; handler: (args: string, ctx: { sendMessage(msg: string): Promise<unknown> }) => Promise<void> }): void;
}

export default function mmrProxyExtension(pi: PiExtensionAPI): void {
  const overrides: Record<string, { env: string }> = {
    google: { env: "PI_GOOGLE_BASE_URL" },
    deepseek: { env: "PI_DEEPSEEK_BASE_URL" },
    openai: { env: "PI_OPENAI_BASE_URL" },
    anthropic: { env: "PI_ANTHROPIC_BASE_URL" },
    minimax: { env: "PI_MINIMAX_BASE_URL" },
    groq: { env: "PI_GROQ_BASE_URL" },
    "kimi-coding": { env: "PI_KIMI_BASE_URL" },
  };

  let applied = 0;
  for (const [provider, { env }] of Object.entries(overrides)) {
    const baseUrl = process.env[env];
    if (baseUrl) {
      console.error(`[pi-fusion:proxy] ${provider} → ${baseUrl}`);
      pi.registerProvider(provider, { baseUrl });
      applied++;
    }
  }
  console.error(`[pi-fusion:proxy] loaded, ${applied} proxy override(s) applied`);

  pi.registerCommand("/proxy-status", {
    description: "Show current proxy overrides",
    handler: async (_args: string, ctx: { sendMessage(msg: string): Promise<unknown> }) => {
      const lines = ["## Proxy Overrides", ""];
      for (const [provider, { env }] of Object.entries(overrides)) {
        const val = process.env[env];
        lines.push(`- **${provider}**: ${val ? `\`${val}\`` : "not set"}`);
      }
      await ctx.sendMessage(lines.join("\n"));
    },
  });
}
