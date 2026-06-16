/**
 * MoA (Mixture of Agents) Engine
 *
 * Orchestrates parallel model calls and synthesis.
 * Framework-agnostic core - takes LLM callbacks, doesn't import pi internals.
 */

import type {
  MoaConfig,
  PanelistConfig,
  PanelistResult,
  MoaResult,
  SynthesizerConfig,
} from "../types.js";

// ─── LLM Callback Interface ──────────────────────────────────────────────────

/** Callback that external code (pi extension) provides to call an LLM */
export interface LlmCallFn {
  (params: {
    provider: string;
    model: string;
    thinking: string;
    systemPrompt: string;
    userMessage: string;
    signal?: AbortSignal;
  }): Promise<string>;
}

// ─── Synthesizer Prompt ──────────────────────────────────────────────────────

const DEFAULT_SYNTHESIZER_PROMPT = `You are a synthesizer. You will receive responses from multiple AI models analyzing the same problem.

Your job:
1. Identify where models agree and disagree
2. Select the best reasoning from each perspective
3. Produce a single, coherent final answer
4. If models disagree, explain the trade-offs and make a clear recommendation`;

function buildSynthesisPrompt(
  question: string,
  panelistResults: PanelistResult[],
  synthesizerConfig: SynthesizerConfig
): string {
  const panelistSections = panelistResults
    .map(
      (r) =>
        `### Panelist: ${r.role} (${r.provider}/${r.model})
${r.error ? `**ERROR**: ${r.error}` : r.response}`
    )
    .join("\n\n---\n\n");

  return `${synthesizerConfig.systemPrompt || DEFAULT_SYNTHESIZER_PROMPT}

## Original Question
${question}

## Panelist Responses

${panelistSections}

## Instructions
Synthesize the above responses into one final answer. Be concise and decisive.`;
}

// ─── Panelist Prompt ─────────────────────────────────────────────────────────

function buildPanelistPrompt(question: string, role: string): string {
  return `You are acting as a "${role}" specialist.

Analyze the following question from your perspective and provide your best answer. Be thorough and specific.

## Question
${question}

Provide your analysis:`;
}

// ─── Engine ──────────────────────────────────────────────────────────────────

export interface MoaEngineOptions {
  config: MoaConfig;
  llmCall: LlmCallFn;
  question: string;
  onPanelistComplete?: (result: PanelistResult) => void;
  signal?: AbortSignal;
}

export async function runMoa(options: MoaEngineOptions): Promise<MoaResult> {
  const { config, llmCall, question, onPanelistComplete, signal } = options;
  const startTime = Date.now();

  // Phase 1: Fan out to panelists
  const panelistResults: PanelistResult[] = [];

  if (config.strategy.mode === "parallel") {
    const results = await runPanelistsParallel(
      config.panelists,
      question,
      llmCall,
      config.strategy.timeoutSeconds,
      signal
    );
    panelistResults.push(...results);
  } else {
    for (const panelist of config.panelists) {
      const result = await runSinglePanelist(panelist, question, llmCall, config.strategy.timeoutSeconds, signal);
      panelistResults.push(result);
      onPanelistComplete?.(result);
    }
  }

  for (const r of panelistResults) {
    onPanelistComplete?.(r);
  }

  // Check if we have any successful results
  const successful = panelistResults.filter((r) => !r.error);
  if (successful.length === 0) {
    return {
      question,
      panelistResults,
      synthesis: "All panelists failed to produce a response.",
      totalDurationMs: Date.now() - startTime,
    };
  }

  // Phase 2: Synthesize
  const synthesisPrompt = buildSynthesisPrompt(
    "", // question is already embedded in the panelist prompts
    panelistResults,
    config.synthesizer
  );

  // Include the original question context in the synthesis call
  const synthesis = await llmCall({
    provider: config.synthesizer.provider,
    model: config.synthesizer.model,
    thinking: config.synthesizer.thinking,
    systemPrompt: config.synthesizer.systemPrompt || DEFAULT_SYNTHESIZER_PROMPT,
    userMessage: synthesisPrompt,
    signal,
  });

  return {
    question,
    panelistResults,
    synthesis,
    totalDurationMs: Date.now() - startTime,
  };
}

// ─── Panelist Execution ──────────────────────────────────────────────────────

async function runSinglePanelist(
  panelist: PanelistConfig,
  question: string,
  llmCall: LlmCallFn,
  timeoutSeconds: number,
  signal?: AbortSignal
): Promise<PanelistResult> {
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutSeconds * 1000);

    // Combine external signal with our timeout
    const combinedSignal = signal
      ? combineSignals(signal, controller.signal)
      : controller.signal;

    const response = await llmCall({
      provider: panelist.provider,
      model: panelist.model,
      thinking: panelist.thinking,
      systemPrompt: `You are a "${panelist.role}" specialist. Provide expert analysis from your perspective.`,
      userMessage: buildPanelistPrompt(question, panelist.role),
      signal: combinedSignal,
    });

    clearTimeout(timeoutId);

    return {
      role: panelist.role,
      provider: panelist.provider,
      model: panelist.model,
      response,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    return {
      role: panelist.role,
      provider: panelist.provider,
      model: panelist.model,
      response: "",
      error: err instanceof Error ? err.message : "Unknown error",
      durationMs: Date.now() - startTime,
    };
  }
}

async function runPanelistsParallel(
  panelists: PanelistConfig[],
  question: string,
  llmCall: LlmCallFn,
  timeoutSeconds: number,
  signal?: AbortSignal
): Promise<PanelistResult[]> {
  const results = await Promise.allSettled(
    panelists.map((p) => runSinglePanelist(p, question, llmCall, timeoutSeconds, signal))
  );

  return results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    return {
      role: panelists[i].role,
      provider: panelists[i].provider,
      model: panelists[i].model,
      response: "",
      error: r.reason instanceof Error ? r.reason.message : "Rejected",
      durationMs: 0,
    };
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function combineSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  a.addEventListener("abort", onAbort, { once: true });
  b.addEventListener("abort", onAbort, { once: true });
  if (a.aborted || b.aborted) controller.abort();
  return controller.signal;
}

// ─── Question extraction ─────────────────────────────────────────────────────

/**
 * Override panelist prompts with the actual user question.
 * Called after the initial MoA call to inject the real question.
 */
export function injectQuestion(
  result: MoaResult,
  question: string
): MoaResult {
  return { ...result, question };
}
