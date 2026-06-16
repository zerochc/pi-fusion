/**
 * Workflow Engine
 *
 * Executes multi-stage pipelines defined in .workflow.md files.
 * Framework-agnostic - takes LLM callbacks, doesn't import pi internals.
 */

import type {
  WorkflowDefinition,
  WorkflowStage,
  StageResult,
  WorkflowResult,
} from "../types.js";
import { topologicalSort } from "./config.js";
import type { LlmCallFn } from "./moa-engine.js";

// ─── Context Builder ─────────────────────────────────────────────────────────

interface StageContext {
  /** The original workflow input */
  requirement: string;
  /** Results from previous stages, keyed by stage id */
  previousResults: Map<string, StageResult>;
}

function buildStagePrompt(
  stage: WorkflowStage,
  context: StageContext
): string {
  // Build dependency context
  const depResults = stage.dependsOn
    .map((depId) => {
      const result = context.previousResults.get(depId);
      if (!result) return "";
      return `### Output from "${depId}" stage\n${result.output}`;
    })
    .filter(Boolean)
    .join("\n\n---\n\n");

  let prompt = stage.prompt;

  // Inject requirement
  prompt = prompt.replace("{{requirement}}", context.requirement);

  // Inject previous stage outputs
  for (const [id, result] of context.previousResults) {
    prompt = prompt.replace(`{{${id}}}`, result.output);
  }

  // Append dependency context if not already in prompt
  if (depResults && !prompt.includes(depResults)) {
    prompt += `\n\n## Context from previous stages\n${depResults}`;
  }

  // Append original requirement for context
  if (!prompt.includes(context.requirement)) {
    prompt += `\n\n## Original Requirement\n${context.requirement}`;
  }

  return prompt;
}

// ─── Engine ──────────────────────────────────────────────────────────────────

export interface WorkflowEngineOptions {
  workflow: WorkflowDefinition;
  input: string;
  llmCall: LlmCallFn;
  onStageStart?: (stageId: string) => void;
  onStageComplete?: (result: StageResult) => void;
  signal?: AbortSignal;
}

export async function runWorkflow(
  options: WorkflowEngineOptions
): Promise<WorkflowResult> {
  const { workflow, input, llmCall, onStageStart, onStageComplete, signal } =
    options;
  const startTime = Date.now();
  const stageResults: StageResult[] = [];
  const previousResults = new Map<string, StageResult>();

  // Topological sort stages into execution levels
  const levels = topologicalSort(workflow.stages);

  if (levels.length === 0) {
    return {
      workflow: workflow.name,
      stages: [],
      totalDurationMs: 0,
    };
  }

  for (const level of levels) {
    // Stages within the same level can run in parallel
    const levelResults = await Promise.allSettled(
      level.map((stage) =>
        executeStage(stage, { requirement: input, previousResults }, llmCall, signal)
      )
    );

    for (let i = 0; i < level.length; i++) {
      const stage = level[i];
      const result = levelResults[i];
      onStageStart?.(stage.id);

      let stageResult: StageResult;

      if (result.status === "fulfilled") {
        stageResult = result.value;
      } else {
        stageResult = {
          stageId: stage.id,
          provider: stage.provider,
          model: stage.model,
          input: "",
          output: "",
          error:
            result.reason instanceof Error
              ? result.reason.message
              : "Stage failed",
          durationMs: 0,
        };
      }

      stageResults.push(stageResult);
      previousResults.set(stage.id, stageResult);
      onStageComplete?.(stageResult);
    }
  }

  return {
    workflow: workflow.name,
    stages: stageResults,
    totalDurationMs: Date.now() - startTime,
  };
}

async function executeStage(
  stage: WorkflowStage,
  context: StageContext,
  llmCall: LlmCallFn,
  signal?: AbortSignal
): Promise<StageResult> {
  const startTime = Date.now();
  const prompt = buildStagePrompt(stage, context);

  try {
    const output = await llmCall({
      provider: stage.provider,
      model: stage.model,
      thinking: stage.thinking,
      systemPrompt: `You are executing the "${stage.id}" stage of a workflow. Complete your task precisely.`,
      userMessage: prompt,
      signal,
    });

    return {
      stageId: stage.id,
      provider: stage.provider,
      model: stage.model,
      input: prompt,
      output,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    return {
      stageId: stage.id,
      provider: stage.provider,
      model: stage.model,
      input: prompt,
      output: "",
      error: err instanceof Error ? err.message : "Unknown error",
      durationMs: Date.now() - startTime,
    };
  }
}

// ─── Result Formatting ───────────────────────────────────────────────────────

export function formatWorkflowSummary(result: WorkflowResult): string {
  const lines: string[] = [
    `# Workflow: ${result.workflow}`,
    `Total duration: ${(result.totalDurationMs / 1000).toFixed(1)}s`,
    `Stages: ${result.stages.length}`,
    "",
  ];

  for (const stage of result.stages) {
    const status = stage.error ? "❌ FAILED" : "✅ OK";
    const duration = (stage.durationMs / 1000).toFixed(1);
    lines.push(
      `## ${stage.stageId} (${stage.provider}/${stage.model}) — ${status} — ${duration}s`
    );

    if (stage.error) {
      lines.push(`\n**Error**: ${stage.error}\n`);
    } else {
      // Truncate long outputs in summary
      const preview =
        stage.output.length > 500
          ? stage.output.slice(0, 500) + "..."
          : stage.output;
      lines.push(`\n${preview}\n`);
    }
  }

  return lines.join("\n");
}

export function getFinalOutput(result: WorkflowResult): string {
  const lastStage = result.stages[result.stages.length - 1];
  return lastStage?.output || "Workflow produced no output.";
}
