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

interface Line {
  raw: string;
  indent: number;
  trimmed: string;
}

function getIndent(line: string): number {
  let indent = 0;
  for (const ch of line) {
    if (ch === " ") indent++;
    else if (ch === "\t") indent += 2;
    else break;
  }
  return indent;
}

function splitLines(content: string): Line[] {
  return content.split("\n").map((raw) => ({
    raw,
    indent: getIndent(raw),
    trimmed: raw.trim(),
  }));
}

function parseScalar(value: string): unknown {
  const trimmed = value.trim();
  const wasQuoted = /^["'].+["']$/.test(trimmed);
  const unquoted = trimmed.replace(/^["']|["']$/g, "");
  if (unquoted === "") return "";
  if (!wasQuoted) {
    if (!isNaN(Number(unquoted))) return Number(unquoted);
    if (unquoted === "true" || unquoted === "false") return unquoted === "true";
  }
  return unquoted;
}

function parseInlineArray(value: string): string[] | undefined {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return undefined;
  const inner = trimmed.slice(1, -1).trim();
  if (inner === "") return [];
  return inner.split(",").map((s) => s.trim().replace(/^["']|["']$/g, ""));
}

function isCommentOrBlank(line: Line): boolean {
  return !line.trimmed || line.trimmed.startsWith("#");
}

/**
 * Parse a multi-line scalar value (after `key: |` or `key:` with indented body).
 * Returns the scalar and the index of the first line after the value.
 */
function parseMultilineScalar(lines: Line[], start: number, baseIndent: number): { value: string; nextIndex: number } {
  const parts: string[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (isCommentOrBlank(line)) {
      i++;
      continue;
    }
    if (line.indent <= baseIndent && line.trimmed) break;
    if (line.raw.length > line.indent) {
      parts.push(line.raw.slice(line.indent));
    } else {
      parts.push("");
    }
    i++;
  }
  return { value: parts.join("\n").trim(), nextIndex: i };
}

/**
 * Parse an object body starting at `start` with items indented relative to `baseIndent`.
 * Returns the object and the index of the first line after the object.
 */
function parseObject(lines: Line[], start: number, baseIndent: number): { obj: Record<string, unknown>; nextIndex: number } {
  const obj: Record<string, unknown> = {};
  let i = start;

  while (i < lines.length) {
    const line = lines[i];
    if (isCommentOrBlank(line)) {
      i++;
      continue;
    }
    if (line.indent <= baseIndent && line.trimmed) break;

    const kvMatch = line.trimmed.match(/^(\w[\w-]*)\s*:\s*(.*)$/);
    if (!kvMatch) {
      i++;
      continue;
    }

    const [, key, rawValue] = kvMatch;
    const value = rawValue.trim();
    i++;

    if (value === "" || value === "|" || value === ">") {
      const { value: multiValue, nextIndex } = parseMultilineScalar(lines, i, line.indent);
      obj[key] = multiValue;
      i = nextIndex;
    } else {
      const inlineArray = parseInlineArray(value);
      if (inlineArray !== undefined) {
        obj[key] = inlineArray;
      } else {
        obj[key] = parseScalar(value);
      }
    }
  }

  return { obj, nextIndex: i };
}

/**
 * Parse an array body starting at `start`.
 * Items begin with `- ` at the same indentation level as the first item.
 * Returns the array and the index of the first line after the array.
 */
function parseArray(lines: Line[], start: number): { array: unknown[]; nextIndex: number } {
  const array: unknown[] = [];
  const baseIndent = lines[start].indent;
  let i = start;

  while (i < lines.length) {
    const line = lines[i];
    if (isCommentOrBlank(line)) {
      i++;
      continue;
    }
    if (line.indent !== baseIndent || !line.trimmed.startsWith("- ")) break;

    const itemContent = line.trimmed.slice(2).trim();
    i++;

    if (itemContent.includes(":")) {
      // Object item: `- key: value` followed by indented fields.
      const kvMatch = itemContent.match(/^(\w[\w-]*)\s*:\s*(.*)$/);
      const obj: Record<string, unknown> = {};
      if (kvMatch) {
        const [, key, rawValue] = kvMatch;
        const value = rawValue.trim();
        if (value === "" || value === "|" || value === ">") {
          const { value: multiValue, nextIndex } = parseMultilineScalar(lines, i, line.indent + 2);
          obj[key] = multiValue;
          i = nextIndex;
        } else {
          const inlineArray = parseInlineArray(value);
          obj[key] = inlineArray !== undefined ? inlineArray : parseScalar(value);
        }
      }

      // Parse any additional indented fields belonging to this object.
      while (i < lines.length) {
        const nested = lines[i];
        if (isCommentOrBlank(nested)) {
          i++;
          continue;
        }
        if (nested.indent <= baseIndent) break;
        if (nested.indent === baseIndent && nested.trimmed.startsWith("- ")) break;

        const nestedKv = nested.trimmed.match(/^(\w[\w-]*)\s*:\s*(.*)$/);
        if (!nestedKv) {
          i++;
          continue;
        }

        const [, nkey, nrawValue] = nestedKv;
        const nvalue = nrawValue.trim();
        i++;

        if (nvalue === "" || nvalue === "|" || nvalue === ">") {
          if (i < lines.length && lines[i].trimmed.startsWith("- ")) {
            const { array: nestedArray, nextIndex } = parseArray(lines, i);
            obj[nkey] = nestedArray;
            i = nextIndex;
          } else if (i < lines.length && /^\w[\w-]*\s*:/.test(lines[i].trimmed)) {
            const { obj: nestedObj, nextIndex } = parseObject(lines, i, nested.indent);
            obj[nkey] = nestedObj;
            i = nextIndex;
          } else {
            const { value: multiValue, nextIndex } = parseMultilineScalar(lines, i, nested.indent);
            obj[nkey] = multiValue;
            i = nextIndex;
          }
        } else {
          const inlineArray = parseInlineArray(nvalue);
          obj[nkey] = inlineArray !== undefined ? inlineArray : parseScalar(nvalue);
        }
      }

      array.push(obj);
    } else {
      // Scalar item: `- value`
      array.push(parseScalar(itemContent));
    }
  }

  return { array, nextIndex: i };
}

function parseSimpleYaml(content: string): Record<string, unknown> {
  const lines = splitLines(content);
  const result: Record<string, unknown> = {};
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (isCommentOrBlank(line)) {
      i++;
      continue;
    }

    // Only top-level keys are parsed here; everything else belongs to the value.
    if (line.indent > 0) {
      i++;
      continue;
    }

    const kvMatch = line.trimmed.match(/^(\w[\w-]*)\s*:\s*(.*)$/);
    if (!kvMatch) {
      i++;
      continue;
    }

    const [, key, rawValue] = kvMatch;
    const value = rawValue.trim();
    i++;

    if (value === "" || value === "|" || value === ">") {
      // Peek ahead to decide between an array, a nested object, or a multi-line scalar.
      if (i < lines.length && lines[i].trimmed.startsWith("- ")) {
        const { array, nextIndex } = parseArray(lines, i);
        result[key] = array;
        i = nextIndex;
      } else if (i < lines.length && /^\w[\w-]*\s*:/.test(lines[i].trimmed)) {
        const { obj, nextIndex } = parseObject(lines, i, line.indent);
        result[key] = obj;
        i = nextIndex;
      } else {
        const { value: multiValue, nextIndex } = parseMultilineScalar(lines, i, line.indent);
        result[key] = multiValue;
        i = nextIndex;
      }
    } else {
      const inlineArray = parseInlineArray(value);
      if (inlineArray !== undefined) {
        result[key] = inlineArray;
      } else {
        result[key] = parseScalar(value);
      }
    }
  }

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
        const wf = parseWorkflowMarkdown(name, content);
        return {
          name,
          description: String(wf.description || "(no description)"),
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
  // Workflow files may use either standard frontmatter delimiters (`---` ... `---`)
  // or a single opening `---` followed by YAML content. Strip the leading delimiter
  // and parse everything as YAML; parseSimpleYaml ignores non-YAML body lines.
  const yamlContent = content.startsWith("---\n") ? content.slice(4) : content;
  const raw = parseSimpleYaml(yamlContent) as Record<string, unknown>;

  const stages: WorkflowStage[] = (raw.stages as Array<Record<string, unknown>> || []).map((s: Record<string, unknown>) => ({
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
    description: String(raw.description || ""),
    version: String(raw.version || "1.0"),
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
