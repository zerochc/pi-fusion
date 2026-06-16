# pi-fusion

> Multi-model MoA fusion and workflow orchestration for the [Pi coding agent](https://github.com/earendil-works/pi).

**pi-fusion** adds two capabilities to Pi:

1. **MoA (Mixture of Agents)** — `/moa` sends your question to multiple LLMs in parallel, then a synthesizer model produces the best answer.
2. **Workflow Pipelines** — `/workflow` executes multi-stage development pipelines, where each stage runs with a different model optimized for that task.

---

## Why

Pi is a single-model coding agent — great for simplicity, but limited to one model's perspective per turn. pi-mmr adds multi-model routing but still uses one model at a time.

pi-fusion adds two complementary patterns:

| Pattern | What it does | Best for |
|---------|-------------|----------|
| **MoA** | N models answer the SAME question → synthesizer picks the best | Architecture decisions, bug root cause, code review |
| **Workflow** | N models handle DIFFERENT stages → pipeline chains them | Full feature dev, bug fixing, multi-perspective review |

---

## Quick Start

### Prerequisites

- [Pi coding agent](https://github.com/earendil-works/pi) installed (`pi --version`)
- [pi-mmr](https://github.com/5omeOtherGuy/pi-mmr) installed (`pi install pi-mmr`)

### Install

```bash
pi install git:github.com/zerochc/pi-fusion
```

### Configure

```bash
# Copy example configs
mkdir -p ~/.pi/moa ~/.pi/workflows
cp config-examples/moa-config.yaml ~/.pi/moa/config.yaml
cp config-examples/*.workflow.md ~/.pi/workflows/

# Edit to use your providers/models
# Edit ~/.pi/moa/config.yaml
```

### Run

```bash
# Start pi with pi-fusion loaded
pi -e pi-fusion

# MoA — ask multiple models, get one synthesized answer
/moa What architecture would you recommend for a real-time data pipeline?

# Workflow — run a multi-stage pipeline
/workflow feature-dev "Add JWT authentication to the API"

# List available workflows
/workflows
```

---

## Commands

### MoA (`mmr-moa`)

| Command | Description |
|---------|-------------|
| `/moa <question>` | Run MoA fusion on a question |
| `/moa-config` | Show current panelist and synthesizer config |
| `/moa-reload` | Reload config from disk |

### Workflow (`mmr-workflow`)

| Command | Description |
|---------|-------------|
| `/workflows` | List available workflow definitions |
| `/workflow <name> <input>` | Execute a workflow |
| `/workflow-validate <name>` | Validate a workflow definition |

---

## Configuration

### MoA Config (`~/.pi/moa/config.yaml`)

```yaml
panelists:
  - role: reasoning
    provider: deepseek
    model: deepseek-v4-pro
    thinking: xhigh

  - role: engineering
    provider: google
    model: gemini-3.1-pro
    thinking: high

synthesizer:
  provider: google
  model: gemini-3.1-pro
  thinking: high

strategy:
  mode: parallel          # "parallel" or "sequential"
  timeout_seconds: 120
  max_panelists: 3
```

### Workflow Definitions (`~/.pi/workflows/*.workflow.md`)

```markdown
---
type: workflow
name: my-workflow
description: What this workflow does
version: "1.0"

stages:
  - id: analyze
    provider: deepseek
    model: deepseek-v4-pro
    thinking: xhigh
    tools: [read, grep, find]
    prompt: |
      Analyze the problem. Output findings.

  - id: solve
    provider: google
    model: gemini-3.1-pro
    thinking: high
    tools: [read, write, edit]
    depends_on: [analyze]
    prompt: |
      Solve based on the analysis above.
```

**Stage fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `id` | ✅ | Unique stage identifier |
| `provider` | ✅ | LLM provider |
| `model` | ✅ | Model ID |
| `thinking` | ✅ | Thinking level (`off`/`minimal`/`low`/`medium`/`high`/`xhigh`) |
| `tools` | ✅ | Allowed tools for this stage |
| `depends_on` | — | Stage IDs that must complete first |
| `prompt` | ✅ | System prompt for this stage |

**Template variables** in prompts:
- `{{requirement}}` — the original workflow input
- `{{stageId}}` — output from a specific previous stage

---

## Included Workflow Examples

| Workflow | Stages | Description |
|----------|--------|-------------|
| `feature-dev` | plan → implement → review → fix → test | Full feature development cycle |
| `bug-hunt` | diagnose → root-cause → fix → verify | Systematic bug investigation and fix |
| `code-review` | security-review + performance-review + design-review → aggregate | Parallel multi-perspective code review |

---

## Recommended Model Pairings

Based on analysis of model diversity and complementary strengths:

| Panelist A | Panelist B | Diversity | Best for |
|-----------|-----------|-----------|----------|
| DeepSeek V4 Pro | Gemini 3.1 Pro | ⭐⭐⭐⭐⭐ | General coding, architecture |
| DeepSeek V4 Pro | MiniMax M3 | ⭐⭐⭐ | Coding + multimodal tasks |
| Gemini 3.1 Pro | MiniMax M3 | ⭐⭐⭐ | Engineering tasks |

**Why DeepSeek + Gemini works well:**
- Different training data (Chinese vs global web)
- Different architectures (MoE vs Gemini)
- Different strengths (reasoning vs engineering)
- Different coding conventions and library preferences

---

## Architecture

```
pi-fusion/
├── src/
│   ├── types.ts                    # Shared type definitions
│   ├── index.ts                    # Package entry point
│   ├── core/
│   │   ├── config.ts              # YAML/MD config loader + parser
│   │   ├── moa-engine.ts          # MoA parallel orchestration
│   │   └── workflow-engine.ts     # Workflow DAG execution
│   └── extensions/
│       ├── mmr-moa/index.ts       # /moa command registration
│       └── mmr-workflow/index.ts  # /workflow command registration
├── config-examples/
│   ├── moa-config.yaml
│   ├── feature-dev.workflow.md
│   ├── bug-hunt.workflow.md
│   └── code-review.workflow.md
└── README.md
```

The **core engines** (`moa-engine.ts`, `workflow-engine.ts`) are framework-agnostic — they take LLM callbacks and don't import pi or pi-mmr internals. This makes them testable independently and portable to other agent frameworks.

The **pi extensions** (`mmr-moa`, `mmr-workflow`) are thin adapters that register commands and wire the engines to pi's runtime.

---

## Dependencies

- **Pi** (`@earendil-works/pi-coding-agent`, `@earendil-works/pi-agent-core`) — peer dependency
- **pi-mmr** (`pi-mmr`) — optional peer dependency (for `selectMmrModelRoute` model resolution)

Zero npm dependencies beyond pi's own packages. No YAML parser dependency (hand-rolled for portability).

---

## License

MIT — use it, fork it, build on it.

---

## Related

- [Pi coding agent](https://github.com/earendil-works/pi) — the terminal coding harness
- [pi-mmr](https://github.com/5omeOtherGuy/pi-mmr) — modular multi-model routing for Pi
- [OpenRouter Fusion](https://openrouter.ai) — inspiration for the MoA pattern
