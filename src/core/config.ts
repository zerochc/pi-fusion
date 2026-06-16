/**
 * Configuration loader for pi-fusion
 *
 * Reads MoA YAML config and Workflow Markdown definitions from disk.
 * Framework-agnostic - pure file I/O and parsing.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { MoaConfig, WorkflowDefinition, WorkflowStage } from "../types.js";

// ─── Paths ───────────────────────────────────────────────────────────────────

const PI_HOME = path.join(os.homedir(), ".pi");

export function moaConfigPath(): string {
  return process.env.MOA_CONFIG_PATH || path.join(PI_HOME, "moa", "config.yaml");
}

export function workflowDir(): string {
  return process.env.WORKFLOW_DIR || path.join(PI_HOME, "workflows");
}

// ─── YAML Parser (zero-dependency, hand-rolled for portability) ──────────────

function parseSimpleYaml(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let currentKey = "";
  let currentArray: unknown[] = [];
  let inArray = false;

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Top-level key: value
    const kvMatch = trimmed.match(/^(\w[\w-]*)\s*:\s*(.*)$/);
    if (kvMatch && !trimmed.startsWith(" ") && !trimmed.startsWith("\t")) {
      if (inArray) {
        if (currentKey) result[currentKey] = currentArray;
        inArray = false;
        currentArray = [];
      }
      const [, key, value] = kvMatch;
      const trimmedVal = value.trim().replace(/^["']|["']$/g, "");
      if (trimmedVal === "") {
        currentKey = key;
        inArray = true;
        currentArray = [];
      } else if (!isNaN(Number(trimmedVal))) {
        result[key] = Number(trimmedVal);
      } else if (trimmedVal === "true" || trimmedVal === "false") {
        result[key] = trimmedVal === "true";
      } else {
        result[key] = trimmedVal;
      }
      continue;
    }

    // Array item: - value or - key: value
    if (inArray) {
      const itemMatch = trimmed.match(/^-\s+(.*)$/);
      const nestedMatch = trimmed.match(/^\s{2}(\w[\w-]*)\s*:\s*(.*)$/);

      if (itemMatch && !trimmed.startsWith("  ")) {
        currentArray.push(itemMatch[1].trim().replace(/^["']|["']$/g, ""));
      } else if (nestedMatch) {
        // If current item is an object, handle nested fields
        const [, nkey, nval] = nestedMatch;
        const nv = nval.trim().replace(/^["']|["']$/g, "");
        const lastIdx = currentArray.length - 1;
        if (lastIdx >= 0 && typeof currentArray[lastIdx] === "object") {
          (currentArray[lastIdx] as Record<string, unknown>)[nkey] = isNaN(Number(nv)) ? nv : Number(nv);
        } else if (currentKey === "panelists") {
          // Start new panelist object
          const obj: Record<string, unknown> = {};
          if (!isNaN(Number(nv))) {
            (obj as any)[nkey === "thinkingBudget" ? "thinkingBudget" : nkey] = Number(nv);
          } else {
            (obj as any)[nkey] = nv;
          }
          currentArray.push(obj);
        }
      }
    }
  }

  if (inArray && currentKey) result[currentKey] = currentArray;
  return result;
}

// ─── MoA Config ──────────────────────────────────────────────────────────────

export function loadMoaConfig(): MoaConfig {
  const configPath = moaConfigPath();

  if (!fs.existsSync(configPath)) {
    return defaultMoaConfig();
  }

  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = parseSimpleYaml(raw);
    return normalizeMoaConfig(parsed);
  } catch {
    return defaultMoaConfig();
  }
}

function normalizeMoaConfig(raw: Record<string, unknown>): MoaConfig {
  const panelists = (raw.panelists as Array<Record<string, unknown>> || []).map((p: Record<string, unknown>) => ({
    role: String(p.role || "panelist"),
    provider: String(p.provider || ""),
    model: String(p.model || ""),
    thinking: String(p.thinking || "high"),
  }));

  const synthRaw = raw.synthesizer as Record<string, unknown> || {};
  const synthesizer = {
    provider: String(synthRaw.provider || panelists[0]?.provider || ""),
    model: String(synthRaw.model || panelists[0]?.model || ""),
    thinking: String(synthRaw.thinking || "high"),
    systemPrompt: synthRaw.systemPrompt ? String(synthRaw.systemPrompt) : undefined,
  };

  const stratRaw = raw.strategy as Record<string, unknown> || {};
  const strategy = {
    mode: (stratRaw.mode === "sequential" ? "sequential" : "parallel") as "parallel" | "sequential",
    timeoutSeconds: Number(stratRaw.timeout_seconds || stratRaw.timeoutSeconds || 120),
    maxPanelists: Number(stratRaw.max_panelists || stratRaw.maxPanelists || 3),
  };

  return { panelists, synthesizer, strategy };
}

function defaultMoaConfig(): MoaConfig {
  return {
    panelists: [
      { role: "reasoning", provider: "deepseek", model: "deepseek-v4-pro", thinking: "xhigh" },
      { role: "engineering", provider: "google", model: "gemini-3.1-pro", thinking: "high" },
    ],
    synthesizer: {
      provider: "google",
      model: "gemini-3.1-pro",
      thinking: "high",
      systemPrompt: `You are a synthesizer. You will receive responses from multiple AI models analyzing the same problem. Your job:
1. Identify where models agree and disagree
2. Select the best reasoning from each perspective
3. Produce a single, coherent final answer
4. If models disagree, explain the trade-offs and make a clear recommendation`,
    },
    strategy: {
      mode: "parallel",
      timeoutSeconds: 120,
      maxPanelists: 3,
    },
  };
}

// ─── Workflow Config ─────────────────────────────────────────────────────────

export function loadWorkflow(name: string): WorkflowDefinition | null {
  const dir = workflowDir();
  const filePath = path.join(dir, `${name}.workflow.md`);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return parseWorkflowMarkdown(name, content);
  } catch {
    return null;
  }
}

export function listWorkflows(): { name: string; description: string }[] {
  const dir = workflowDir();
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter(f => f.endsWith(".workflow.md"))
    .map(f => {
      const name = f.replace(".workflow.md", "");
      const filePath = path.join(dir, f);
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const fm = parseFrontmatter(content);
        return {
          name,
          description: String(fm.description || "(no description)"),
        };
      } catch {
        return { name, description: "(parse error)" };
      }
    });
}

function parseFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  return parseSimpleYaml(match[1]);
}

function parseWorkflowMarkdown(name: string, content: string): WorkflowDefinition {
  const fm = parseFrontmatter(content);

  // Parse stages from the YAML frontmatter + markdown body
  const raw = parseSimpleYaml(content.split("---").slice(1).join("---")) as Record<string, unknown>;

  const stages: WorkflowStage[] = (fm.stages as Array<Record<string, unknown>> || []).map((s: Record<string, unknown>) => ({
    id: String(s.id || ""),
    provider: String(s.provider || ""),
    model: String(s.model || ""),
    thinking: String(s.thinking || "high"),
    tools: Array.isArray(s.tools) ? s.tools.map(String) : [],
    dependsOn: Array.isArray(s.depends_on || s.dependsOn) ? ((s.depends_on || s.dependsOn) as unknown[]).map(v => String(v)) : [],
    prompt: String(s.prompt || "").trim(),
  }));

  return {
    name,
    description: String(fm.description || ""),
    version: String(fm.version || "1.0"),
    stages,
  };
}

// ─── Topological Sort for DAG ────────────────────────────────────────────────

export function topologicalSort(stages: WorkflowStage[]): WorkflowStage[][] {
  const stageMap = new Map(stages.map(s => [s.id, s]));
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const s of stages) {
    inDegree.set(s.id, s.dependsOn.length);
    for (const dep of s.dependsOn) {
      if (!adj.has(dep)) adj.set(dep, []);
      adj.get(dep)!.push(s.id);
    }
  }

  const levels: WorkflowStage[][] = [];
  let current = stages.filter(s => inDegree.get(s.id) === 0);

  while (current.length > 0) {
    levels.push(current);
    const next: WorkflowStage[] = [];

    for (const s of current) {
      for (const neighbor of adj.get(s.id) || []) {
        const newDegree = (inDegree.get(neighbor) || 1) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          const stage = stageMap.get(neighbor);
          if (stage) next.push(stage);
        }
      }
    }
    current = next;
  }

  return levels;
}

export function validateWorkflow(wf: WorkflowDefinition): string[] {
  const errors: string[] = [];
  const ids = new Set(wf.stages.map(s => s.id));

  if (wf.stages.length === 0) {
    errors.push("Workflow must have at least one stage");
  }

  for (const s of wf.stages) {
    if (!s.id) errors.push("Stage missing 'id'");
    if (!s.model) errors.push(`Stage '${s.id}' missing 'model'`);
    if (!s.provider) errors.push(`Stage '${s.id}' missing 'provider'`);
    if (!s.prompt) errors.push(`Stage '${s.id}' missing 'prompt'`);
    for (const dep of s.dependsOn) {
      if (!ids.has(dep)) {
        errors.push(`Stage '${s.id}' depends on unknown stage '${dep}'`);
      }
    }
  }

  // Check for cycles: if topological sort doesn't cover all stages
  const sorted = topologicalSort(wf.stages);
  const sortedIds = new Set(sorted.flat().map(s => s.id));
  if (sortedIds.size !== wf.stages.length) {
    errors.push("Workflow contains a dependency cycle");
  }

  return errors;
}
