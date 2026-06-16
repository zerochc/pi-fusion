---
type: workflow
name: bug-hunt
description: Diagnose → Root Cause → Fix → Verify pipeline for bug fixing
version: "1.0"

stages:
  - id: diagnose
    provider: google
    model: gemini-3.1-pro
    thinking: high
    tools:
      - read
      - grep
      - find
      - ls
      - bash
    prompt: |
      You are a bug diagnostician. Investigate the reported bug.

      ## Process
      1. Read the relevant source code
      2. Check logs if available (use bash to grep logs)
      3. Trace the data flow through the code
      4. Identify suspicious areas
      5. Reproduce the bug conditions mentally

      Report your findings with:
      - What you observed
      - Confidence level (🔴 high / 🟡 medium / 🟢 low)
      - Specific code locations (file:line)

  - id: root-cause
    provider: deepseek
    model: deepseek-v4-pro
    thinking: xhigh
    tools:
      - read
      - grep
      - find
    depends_on:
      - diagnose
    prompt: |
      Based on the diagnosis above, identify the ROOT CAUSE of the bug.

      ## Approach
      - Think step by step through the execution path
      - Identify the exact line or condition that causes the failure
      - Explain WHY the bug occurs
      - Explain WHY it wasn't caught before (missing test? edge case?)

      Your answer should be a single root cause statement like:
      "The bug is caused by [X] at [file:line] because [Y]."

  - id: fix
    provider: google
    model: gemini-3.1-pro
    thinking: medium
    tools:
      - read
      - write
      - edit
      - bash
    depends_on:
      - root-cause
    prompt: |
      Fix the root cause identified in the previous stage.

      ## Rules
      - Make MINIMAL changes — fix only what's broken
      - Do NOT refactor unrelated code
      - Do NOT change the public API unless absolutely necessary
      - If the fix requires changes in multiple files, do them all
      - Add a comment explaining the fix

  - id: verify
    provider: deepseek
    model: deepseek-v4-pro
    thinking: low
    tools:
      - read
      - bash
      - grep
    depends_on:
      - fix
    prompt: |
      Verify the fix is correct and complete.

      ## Verification steps
      1. Check the fix makes logical sense
      2. Write a targeted test that reproduces the original bug
      3. Run the test to confirm it now passes
      4. Run existing tests to check for regressions
      5. Confirm no debug code or temporary changes remain

      Report: ✅ Verified / ⚠️ Issues Found / ❌ Not Fixed
