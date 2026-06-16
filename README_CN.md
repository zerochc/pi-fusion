# pi-fusion

> 为 [Pi 编程智能体](https://github.com/earendil-works/pi) 提供的多模型 MoA 融合与工作流编排。

[English](./README.md)

**pi-fusion** 为 Pi 增加了两项能力：

1. **MoA（智能体混合）** — `/moa` 将你的问题并行分发给多个 LLM，然后由合成模型产出最佳答案。
2. **工作流流水线** — `/workflow` 执行多阶段开发流水线，每个阶段使用针对该任务优化的不同模型。

---

## 为什么需要

Pi 是单模型编程智能体——简单但每轮只能用一个模型的视角。pi-mmr 增加了多模型路由，但仍然一次只用一个模型。

pi-fusion 增加了两种互补模式：

| 模式 | 做什么 | 最适合 |
|------|--------|--------|
| **MoA** | N 个模型回答同一个问题 → 合成器选出最佳 | 架构决策、Bug 根因分析、代码审查 |
| **工作流** | N 个模型处理不同阶段 → 流水线串联 | 完整功能开发、Bug 修复、多视角审查 |

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
