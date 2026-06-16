# pi-fusion

> 为 [Pi 编程智能体](https://github.com/earendil-works/pi) 提供的多模型 MoA 融合与工作流编排。

[English](./README.md)

**pi-fusion** 为 Pi 增加了两项能力：

1. **MoA（智能体混合）** — `/moa` 将你的问题并行分发给多个 LLM，然后由合成模型产出最佳答案。
2. **工作流流水线** — `/workflow` 执行多阶段开发流水线，每个阶段使用针对该任务优化的不同模型。

---

## 为什么选择 pi-fusion

### 问题

每个 LLM 都有盲区。单模型再强，也受限于训练数据、架构和推理偏好：

- **DeepSeek V4** 推理极深，但可能遗漏某些编码习惯
- **Kimi-for-coding** 编码优化，但架构设计不够全面
- **MiniMax M3** 能发现别人忽略的边缘情况，但编码速度不占优

你可以手动向每个模型提问再对比。但太慢、太繁琐，而且你永远不知道综合多个视角是否会有更好的答案。

### pi-fusion 的解决方案

两个经过验证的多模型协作模式，直接在你的终端里运行：

| 模式 | 原理 | 实际例子 |
|------|------|---------|
| **MoA 融合** `/moa` | DeepSeek + Kimi 并行分析同一问题 → DeepSeek 合成最佳答案 | *"这个微服务划分合理吗？"* — 同时获得推理视角 + 编码落地视角，合并为一个答案 |
| **工作流流水线** `/workflow` | 每个阶段用最擅长的模型 | *feature-dev*：DeepSeek 规划 → Kimi 编码 → MiniMax 审查 → Kimi 修复 → MiniMax 测试 |

### 对比

| | pi-fusion | 原生 Pi | pi-mmr | OpenRouter Fusion |
|---|---|---|---|---|
| **多模型协作** | ✅ 2+ 模型协同 | ❌ 单模型 | ⚠️ 一次一个 | ✅ 云端融合 |
| **离线配置文件** | ✅ YAML + Markdown | — | ✅ JSON | ❌ 仅 Web UI |
| **自有 API Key** | ✅ 无加价 | ✅ | ✅ | ❌ 平台抽成 |
| **编程场景优化** | ✅ 专门设计 | ✅ | ✅ | ❌ 通用场景 |
| **模型多样性** | ✅ DeepSeek/Kimi/MiniMax | ❌ | ⚠️ | 固定 provider |
| **工作流管道** | ✅ DAG 编排 | ❌ | ⚠️ 仅 subagent | ❌ |
| **零 Fork** | ✅ 纯扩展 | — | ✅ | — |

### 核心优势

1. **打破单模型上限** — 不同模型看到不同问题，MoA 呈现所有视角
2. **合适的模型做合适的事** — DeepSeek 做推理，Kimi 写代码，MiniMax 做审查。没有万能模型
3. **配置驱动，非代码驱动** — 换 panelist、模型、流水线阶段，改 YAML/Markdown 即可，无需重新部署
4. **与 pi-mmr 协同** — pi-fusion 是 pi 扩展，与 pi-mmr 并行运行。pi-mmr 管模型切换，pi-fusion 管模型协作
5. **国产模型深度优化** — DeepSeek、Kimi、MiniMax 一线支持，针对国内模型生态调优
6. **核心引擎与框架解耦** — MoA 和 Workflow 引擎不依赖 pi 内部实现，仅接收 LLM 回调，可独立测试、可移植

---

## 快速开始

### 前置条件

- 已安装 [Pi](https://github.com/earendil-works/pi) (`pi --version`)
- 已安装 [pi-mmr](https://github.com/5omeOtherGuy/pi-mmr) (`pi install pi-mmr`)

### 安装

```bash
pi install git:github.com/zerochc/pi-fusion
```

### 配置

```bash
# 复制示例配置
mkdir -p ~/.pi/moa ~/.pi/workflows
cp config-examples/moa-config.yaml ~/.pi/moa/config.yaml
cp config-examples/*.workflow.md ~/.pi/workflows/

# 编辑 ~/.pi/moa/config.yaml，改成你用的模型
```

### 运行

```bash
# 启动 pi 并加载 pi-fusion
pi -e pi-fusion

# MoA — 多个模型并行回答，合成一个最优答案
/moa 这个实时数据管道应该用什么架构？

# 工作流 — 运行一个多阶段流水线
/workflow feature-dev "实现 JWT 认证登录接口"

# 列出可用工作流
/workflows
```

---

## 命令

### MoA（`mmr-moa`）

| 命令 | 说明 |
|------|------|
| `/moa <问题>` | 对一个问题运行 MoA 融合 |
| `/moa-config` | 查看当前 panelist 和合成器配置 |
| `/moa-reload` | 重新从磁盘加载配置 |

### 工作流（`mmr-workflow`）

| 命令 | 说明 |
|------|------|
| `/workflows` | 列出所有可用工作流定义 |
| `/workflow <名称> <输入>` | 执行一个工作流 |
| `/workflow-validate <名称>` | 验证一个工作流定义 |

---

## 配置

### MoA 配置（`~/.pi/moa/config.yaml`）

```yaml
panelists:
  - role: reasoning          # 推理视角
    provider: deepseek
    model: deepseek-v4-pro
    thinking: xhigh

  - role: engineering        # 工程视角
    provider: google
    model: gemini-3.1-pro
    thinking: high

synthesizer:
  provider: google
  model: gemini-3.1-pro
  thinking: high

strategy:
  mode: parallel          # "parallel" 并行 / "sequential" 串行
  timeout_seconds: 120    # 单个 panelist 超时（秒）
  max_panelists: 3        # 最大并行 panelist 数量
```

### 工作流定义（`~/.pi/workflows/*.workflow.md`）

```markdown
---
type: workflow
name: my-workflow
description: 这个工作流的用途
version: "1.0"

stages:
  - id: analyze
    provider: deepseek
    model: deepseek-v4-pro
    thinking: xhigh
    tools: [read, grep, find]
    prompt: |
      分析问题，输出发现。

  - id: solve
    provider: google
    model: gemini-3.1-pro
    thinking: high
    tools: [read, write, edit]
    depends_on: [analyze]
    prompt: |
      基于上述分析进行解决。
```

**Stage 字段说明：**

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | ✅ | 唯一阶段标识符 |
| `provider` | ✅ | LLM 服务商 |
| `model` | ✅ | 模型 ID |
| `thinking` | ✅ | 思考级别（`off`/`minimal`/`low`/`medium`/`high`/`xhigh`） |
| `tools` | ✅ | 该阶段可用的工具列表 |
| `depends_on` | — | 必须先完成的阶段 ID |
| `prompt` | ✅ | 该阶段的系统提示词 |

**Prompt 模板变量：**
- `{{requirement}}` — 工作流的原始输入
- `{{stageId}}` — 某个前置阶段的输出

---

## 内置工作流示例

| 工作流 | 阶段 | 说明 |
|--------|------|------|
| `feature-dev` | plan → implement → review → fix → test | 完整功能开发周期 |
| `bug-hunt` | diagnose → root-cause → fix → verify | 系统化 Bug 排查修复 |
| `code-review` | security-review + performance-review + design-review → aggregate | 并行多视角代码审查 |

---

## 推荐模型搭配

基于模型多样性和能力互补的分析：

| Panelist A | Panelist B | 多样性 | 最适合 |
|-----------|-----------|--------|--------|
| DeepSeek V4 Pro | Gemini 3.1 Pro | ⭐⭐⭐⭐⭐ | 通用编程、架构设计 |
| DeepSeek V4 Pro | MiniMax M3 | ⭐⭐⭐ | 编码 + 多模态任务 |
| Gemini 3.1 Pro | MiniMax M3 | ⭐⭐⭐ | 工程任务 |

**为什么 DeepSeek + Gemini 效果好：**
- 训练数据不同（中文互联网 vs 全球互联网）
- 架构不同（MoE vs Gemini）
- 优势不同（深度推理 vs 软件工程）
- 编码规范和库偏好不同

---

## 架构

```
pi-fusion/
├── src/
│   ├── types.ts                    # 共享类型定义
│   ├── index.ts                    # 包入口
│   ├── core/
│   │   ├── config.ts              # YAML/MD 配置加载 + 解析器
│   │   ├── moa-engine.ts          # MoA 并行编排
│   │   └── workflow-engine.ts     # 工作流 DAG 执行
│   └── extensions/
│       ├── mmr-moa/index.ts       # /moa 命令注册
│       └── mmr-workflow/index.ts  # /workflow 命令注册
├── config-examples/
│   ├── moa-config.yaml
│   ├── feature-dev.workflow.md
│   ├── bug-hunt.workflow.md
│   └── code-review.workflow.md
└── README.md
```

**核心引擎**（`moa-engine.ts`、`workflow-engine.ts`）与框架无关——它们接收 LLM 回调，不导入 pi 或 pi-mmr 的内部实现。这使得它们可以独立测试、也可移植到其他智能体框架。

**Pi 扩展**（`mmr-moa`、`mmr-workflow`）是薄适配层，负责注册命令并将引擎接入 pi 的运行时。

---

## 依赖

- **Pi**（`@earendil-works/pi-coding-agent`、`@earendil-works/pi-agent-core`）— peer 依赖
- **pi-mmr**（`pi-mmr`）— 可选 peer 依赖（用于 `selectMmrModelRoute` 模型解析）

零 npm 第三方依赖。不依赖 YAML 解析库（手写解析器以保证可移植性）。

---

## 许可证

MIT — 自由使用、fork、构建。

---

## 相关项目

- [Pi](https://github.com/earendil-works/pi) — 终端编程智能体
- [pi-mmr](https://github.com/5omeOtherGuy/pi-mmr) — Pi 的模块化多模型路由
- [OpenRouter Fusion](https://openrouter.ai) — MoA 模式的灵感来源
