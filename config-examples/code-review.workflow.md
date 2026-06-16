---
type: workflow
name: code-review
description: Deep multi-model code review with different perspectives
version: "1.0"

stages:
  - id: security-review
    provider: deepseek
    model: deepseek-v4-pro
    thinking: xhigh
    tools:
      - read
      - grep
      - find
    prompt: |
      Review the code for SECURITY issues only.

      ## Check for
      - Injection vulnerabilities (SQL, command, etc.)
      - Authentication and authorization gaps
      - Sensitive data exposure
      - Insecure dependencies or configurations
      - Input validation gaps

      Output findings organized by severity.

  - id: performance-review
    provider: google
    model: gemini-3.1-pro
    thinking: high
    tools:
      - read
      - grep
      - find
    prompt: |
      Review the code for PERFORMANCE issues only.

      ## Check for
      - N+1 queries or unnecessary loops
      - Missing caching opportunities
      - Memory leaks or excessive allocations
      - Blocking operations that could be async
      - Inefficient data structures

      Output findings organized by impact.

  - id: design-review
    provider: deepseek
    model: deepseek-v4-pro
    thinking: xhigh
    tools:
      - read
      - grep
      - find
    prompt: |
      Review the code for DESIGN quality.

      ## Check for
      - SOLID principles violations
      - Tight coupling or missing abstractions
      - Over-engineering or under-engineering
      - Naming clarity and consistency
      - Testability

      Output findings with suggested improvements.

  - id: aggregate
    provider: google
    model: gemini-3.1-pro
    thinking: high
    tools: []
    depends_on:
      - security-review
      - performance-review
      - design-review
    prompt: |
      Aggregate the three review perspectives above into one comprehensive review report.

      ## Format
      1. **Executive Summary** — one paragraph overview
      2. **Critical Issues** — must fix before merge
      3. **Important Issues** — should fix soon
      4. **Minor Issues** — nice to fix
      5. **Overall Verdict** — Approve / Approve with Changes / Reject
