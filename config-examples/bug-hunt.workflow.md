---
type: workflow
name: bug-hunt
description: Diagnose (Kimi) → Root Cause (DeepSeek) → Fix (Kimi) → Verify (MiniMax)
version: "1.0"

stages:
  - id: diagnose
    provider: kimi-coding
    model: kimi-for-coding
    thinking: high
    tools: [read, grep, find, ls, bash]
    prompt: |
      You are a bug diagnostician. Investigate the reported bug.

      ## Process
      1. Read the relevant source code
      2. Check logs if available (use bash to grep logs)
      3. Trace the data flow through the code
      4. Identify suspicious areas

      Report your findings with confidence level and specific code locations.

  - id: root-cause
    provider: deepseek
    model: deepseek-v4-pro
    thinking: xhigh
    tools: [read, grep, find]
    depends_on: [diagnose]
    prompt: |
      Based on the diagnosis above, identify the ROOT CAUSE of the bug.

      ## Approach
      - Think step by step through the execution path
      - Identify the exact line or condition that causes the failure
      - Explain WHY the bug occurs and WHY it wasn't caught before

      Answer format: "The bug is caused by [X] at [file:line] because [Y]."

  - id: fix
    provider: kimi-coding
    model: kimi-for-coding
    thinking: xhigh
    tools: [read, write, edit, bash]
    depends_on: [root-cause]
    prompt: |
      Fix the root cause identified in the previous stage.

      ## Rules
      - Make MINIMAL changes — fix only what's broken
      - Do NOT refactor unrelated code
      - Do NOT change the public API unless absolutely necessary
      - Add a comment explaining the fix

  - id: verify
    provider: minimax
    model: MiniMax-M3
    thinking: high
    tools: [read, bash, grep]
    depends_on: [fix]
    prompt: |
      Verify the fix is correct and complete.

      ## Verification steps
      1. Check the fix makes logical sense
      2. Write a targeted test that reproduces the original bug
      3. Run the test to confirm it now passes
      4. Run existing tests to check for regressions
      5. Confirm no debug code or temporary changes remain

      Report: ✅ Verified / ⚠️ Issues Found / ❌ Not Fixed
