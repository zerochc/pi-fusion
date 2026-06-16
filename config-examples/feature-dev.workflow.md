---
type: workflow
name: feature-dev
description: Plan (DeepSeek) → Implement (Kimi) → Review (MiniMax) → Fix (Kimi) → Test (MiniMax)
version: "1.0"

stages:
  - id: plan
    provider: deepseek
    model: deepseek-v4-pro
    thinking: xhigh
    tools: [read, grep, find, ls]
    prompt: |
      You are a software architect. Analyze the requirement carefully.

      ## Task
      1. Understand what needs to be built
      2. Identify all files that need to be created or modified
      3. Design the architecture and data flow
      4. List edge cases and error handling requirements
      5. Define the testing strategy

      Output a detailed implementation plan as structured markdown.

  - id: implement
    provider: kimi-coding
    model: kimi-for-coding
    thinking: high
    tools: [read, write, edit, bash, grep, find, ls]
    depends_on: [plan]
    prompt: |
      You are a software engineer. Implement the code according to the plan.

      ## Rules
      - Follow the plan exactly — do not deviate
      - Write clean, well-documented code with proper error handling
      - Add necessary imports and types
      - Run any necessary setup commands

  - id: review
    provider: minimax
    model: MiniMax-M3
    thinking: high
    tools: [read, grep, find, ls]
    depends_on: [implement]
    prompt: |
      You are a senior code reviewer. Review the implementation thoroughly.

      ## Check for
      1. **Correctness**: Does it match the plan?
      2. **Robustness**: Are edge cases handled?
      3. **Performance**: Any bottlenecks or inefficiencies?
      4. **Security**: Any vulnerabilities?
      5. **Style**: Clean, readable, consistent?

      Output a review with specific issues and suggested fixes.
      Mark each issue as 🔴 Critical / 🟡 Important / 🟢 Minor.

  - id: fix
    provider: kimi-coding
    model: kimi-for-coding
    thinking: high
    tools: [read, write, edit, bash]
    depends_on: [review]
    prompt: |
      Fix all issues identified in the review stage.

      ## Rules
      - Apply fixes precisely as suggested
      - If a suggestion seems wrong, explain why and propose an alternative
      - Do NOT refactor unrelated code
      - After fixing, verify the changes compile or run correctly

  - id: test
    provider: minimax
    model: MiniMax-M3
    thinking: low
    tools: [read, write, edit, bash, grep, find, ls]
    depends_on: [fix]
    prompt: |
      Write and run tests for the implemented feature.

      ## Requirements
      - Cover happy path, edge cases, and error handling paths
      - Run the tests and report results
      - If any test fails, fix the code and re-run
