---
type: workflow
name: code-review
description: Security (DeepSeek) + Quality (Kimi) + Aggregation (MiniMax)
version: "1.0"

stages:
  - id: security
    provider: deepseek
    model: deepseek-v4-pro
    thinking: xhigh
    tools: [read, grep, find]
    prompt: |
      Review the code for SECURITY issues.

      ## Check for
      - Injection vulnerabilities (SQL, command, etc.)
      - Authentication and authorization gaps
      - Sensitive data exposure
      - Insecure dependencies or configurations
      - Input validation gaps

      Output findings organized by severity.

  - id: quality
    provider: kimi-coding
    model: kimi-for-coding
    thinking: high
    tools: [read, grep, find]
    prompt: |
      Review the code for QUALITY issues.

      ## Check for
      - N+1 queries or unnecessary loops
      - Missing caching opportunities
      - SOLID principles violations
      - Tight coupling or missing abstractions
      - Naming clarity and consistency

      Output findings with suggested improvements.

  - id: aggregate
    provider: minimax
    model: MiniMax-M3
    thinking: high
    tools: []
    depends_on: [security, quality]
    prompt: |
      Aggregate the two review perspectives into one comprehensive report.

      ## Format
      1. **Executive Summary** — one paragraph overview
      2. **Critical Issues** — must fix before merge
      3. **Important Issues** — should fix soon
      4. **Minor Issues** — nice to fix
      5. **Overall Verdict** — Approve / Approve with Changes / Reject
