/**
 * pi-fusion
 *
 * Multi-model MoA fusion and workflow orchestration for Pi coding agent.
 *
 * @packageDocumentation
 */

// ─── Extensions (pi default export factories) ───────────────────────────────

export { default as mmrMoaExtension } from "./extensions/mmr-moa/index.js";
export { default as mmrWorkflowExtension } from "./extensions/mmr-workflow/index.js";

// ─── Core Engines ────────────────────────────────────────────────────────────

export { runMoa } from "./core/moa-engine.js";
export type { LlmCallFn, MoaEngineOptions } from "./core/moa-engine.js";

export {
  runWorkflow,
  formatWorkflowSummary,
  getFinalOutput,
} from "./core/workflow-engine.js";
export type { WorkflowEngineOptions } from "./core/workflow-engine.js";

// ─── Configuration ────────────────────────────────────────────────────────────

export {
  loadMoaConfig,
  loadWorkflow,
  listWorkflows,
  validateWorkflow,
  topologicalSort,
} from "./core/config.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type {
  PanelistConfig,
  SynthesizerConfig,
  MoaStrategy,
  MoaConfig,
  PanelistResult,
  MoaResult,
  WorkflowStage,
  WorkflowDefinition,
  StageResult,
  WorkflowResult,
} from "./types.js";
