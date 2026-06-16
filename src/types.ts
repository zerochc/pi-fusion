/**
 * pi-fusion type definitions
 *
 * Shared types for MoA fusion and workflow orchestration.
 * Framework-agnostic - these types don't depend on pi or pi-mmr internals.
 */

// ─── MoA Types ───────────────────────────────────────────────────────────────

export interface PanelistConfig {
  /** Human-readable role label (e.g. "reasoning", "engineering") */
  role: string;
  /** Provider name (e.g. "deepseek", "google", "openai") */
  provider: string;
  /** Model ID (e.g. "deepseek-v4-pro", "gemini-3.1-pro") */
  model: string;
  /** Thinking level: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" */
  thinking: string;
}

export interface SynthesizerConfig {
  /** Provider for the synthesizer model */
  provider: string;
  /** Model ID for the synthesizer */
  model: string;
  /** Thinking level */
  thinking: string;
  /** Custom system prompt for synthesis (optional) */
  systemPrompt?: string;
}

export interface MoaStrategy {
  /** Execution mode: "parallel" or "sequential" */
  mode: "parallel" | "sequential";
  /** Max seconds per panelist before timeout */
  timeoutSeconds: number;
  /** Max number of concurrent panelists */
  maxPanelists: number;
}

export interface MoaConfig {
  panelists: PanelistConfig[];
  synthesizer: SynthesizerConfig;
  strategy: MoaStrategy;
}

export interface PanelistResult {
  role: string;
  provider: string;
  model: string;
  response: string;
  error?: string;
  durationMs: number;
}

export interface MoaResult {
  question: string;
  panelistResults: PanelistResult[];
  synthesis: string;
  totalDurationMs: number;
}

// ─── Workflow Types ──────────────────────────────────────────────────────────

export interface WorkflowStage {
  /** Unique stage identifier */
  id: string;
  /** Provider name */
  provider: string;
  /** Model ID */
  model: string;
  /** Thinking level */
  thinking: string;
  /** Allowed tools for this stage */
  tools: string[];
  /** Stage names this stage depends on (must complete before this runs) */
  dependsOn: string[];
  /** System prompt for this stage */
  prompt: string;
}

export interface WorkflowDefinition {
  /** Unique workflow name (from filename) */
  name: string;
  /** Human-readable description */
  description: string;
  /** Semantic version */
  version: string;
  /** Ordered stages */
  stages: WorkflowStage[];
}

export interface StageResult {
  stageId: string;
  provider: string;
  model: string;
  input: string;
  output: string;
  error?: string;
  durationMs: number;
  toolCalls?: number;
}

export interface WorkflowResult {
  workflow: string;
  stages: StageResult[];
  totalDurationMs: number;
}
