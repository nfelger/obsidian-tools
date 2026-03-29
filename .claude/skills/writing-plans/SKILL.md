---
name: writing-plans
description: Use when you have a spec or requirements for a multi-step task, before touching code
---

# Writing Plans

## CRITICAL CONSTRAINTS — Read Before Anything Else

**You MUST NOT call `EnterPlanMode` or `ExitPlanMode` at any point during this skill.** This skill operates in normal mode and manages its own completion flow via `AskUserQuestion`. Calling `EnterPlanMode` traps the session in plan mode where Write/Edit are restricted. Calling `ExitPlanMode` breaks the workflow and skips the user's execution choice. If you feel the urge to call either, STOP — follow this skill's instructions instead.

## Overview

Write comprehensive implementation plans assuming the engineer has zero context for our codebase and questionable taste. Document everything they need to know: which files to touch for each task, code, testing, docs they might need to check, how to test it. Give them the whole plan as bite-sized tasks. DRY. YAGNI. TDD. Frequent commits.

Assume they are a skilled developer, but know almost nothing about our toolset or problem domain. Assume they don't know good test design very well.

**Announce at start:** "I'm using the writing-plans skill to create the implementation plan."

**Context:** This should be run in a dedicated worktree (created by brainstorming skill).

**Save plans to:** `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`
- (User preferences for plan location override this default)

## Scope Check

If the spec covers multiple independent subsystems, it should have been broken into sub-project specs during brainstorming. If it wasn't, suggest breaking this into separate plans — one per subsystem. Each plan should produce working, testable software on its own.

## File Structure

Before defining tasks, map out which files will be created or modified and what each one is responsible for. This is where decomposition decisions get locked in.

- Design units with clear boundaries and well-defined interfaces. Each file should have one clear responsibility.
- You reason best about code you can hold in context at once, and your edits are more reliable when files are focused. Prefer smaller, focused files over large ones that do too much.
- Files that change together should live together. Split by responsibility, not by technical layer.
- In existing codebases, follow established patterns. If the codebase uses large files, don't unilaterally restructure - but if a file you're modifying has grown unwieldy, including a split in the plan is reasonable.

This structure informs the task decomposition. Each task should produce self-contained changes that make sense independently.

## REQUIRED FIRST STEP: Initialize Task Tracking

**BEFORE exploring code or writing the plan, you MUST:**

1. Call `TaskList` to check for existing tasks from brainstorming
2. If tasks exist: you will enhance them with implementation details as you write the plan
3. If no tasks: you will create them with `TaskCreate` as you write each plan task

**Do not proceed to exploration until TaskList has been called.**

```
TaskList
```

## Task Granularity

**Each task is a coherent unit of work that produces a testable, committable outcome.**

See `skills/shared/task-format-reference.md` for the full granularity guide.

Key principle: TDD cycles happen WITHIN tasks, not as separate tasks. A task is "Implement X with tests" — the red-green-refactor steps are execution detail inside the task, not task boundaries.

**Scope test:**
1. Can it be verified independently? (if no → too small)
2. Does it touch more than one concern? (if yes → too big)
3. Would it get its own commit? (if no → merge with adjacent task)

## Plan Document Header

**Every plan MUST start with this header:**

```markdown
# [Feature Name] Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

**User Verification:** [YES — what the user wants verified, by whom, and when] or [NO — no user verification required]

---
```

**The User Verification field is mandatory.** Re-read the original prompt/spec and answer: does it require any form of user feedback, user confirmation, human sign-off, or human-in-the-loop validation? This is about intent, not exact keywords. Examples:
- "verify with the user after each module" → YES — user confirms each module's output before proceeding
- "terugkoppeling van users hoeveel foutmeldingen die ziet" → YES — user reports observed error count
- "add a caching layer" → NO

If YES: every task that requires user verification MUST include the standard verification block (see User Verification Enforcement section below). If you write YES here but create no verification tasks, the HARD-GATE before Execution Handoff will catch the gap.

## Task Structure

````markdown
### Task N: [Component Name]

**Goal:** [One sentence — what this task produces]

**Files:**
- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py:123-145`
- Test: `tests/exact/path/to/test.py`

**Acceptance Criteria:**
- [ ] [Concrete, testable criterion]
- [ ] [Another criterion]

**Verify:** `exact test command` → expected output

**Steps:**

- [ ] **Step 1: Write the failing test**

```python
def test_specific_behavior():
    result = function(input)
    assert result == expected
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/path/test.py::test_name -v`
Expected: FAIL with "function not defined"

- [ ] **Step 3: Write minimal implementation**

```python
def function(input):
    return expected
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/path/test.py::test_name -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/path/test.py src/path/file.py
git commit -m "feat: add specific feature"
```
````

## No Placeholders

Every step must contain the actual content an engineer needs. These are **plan failures** — never write them:
- "TBD", "TODO", "implement later", "fill in details"
- "Add appropriate error handling" / "add validation" / "handle edge cases"
- "Write tests for the above" (without actual test code)
- "Similar to Task N" (repeat the code — the engineer may be reading tasks out of order)
- Steps that describe what to do without showing how (code blocks required for code steps)
- References to types, functions, or methods not defined in any task

## Remember
- Exact file paths always
- Complete code in every step — if a step changes code, show the code
- Exact commands with expected output
- DRY, YAGNI, TDD, frequent commits

## Self-Review

After writing the complete plan, look at the spec with fresh eyes and check the plan against it. This is a checklist you run yourself — not a subagent dispatch.

**1. Spec coverage:** Skim each section/requirement in the spec. Can you point to a task that implements it? List any gaps.

**2. Placeholder scan:** Search your plan for red flags — any of the patterns from the "No Placeholders" section above. Fix them.

**3. Type consistency:** Do the types, method signatures, and property names you used in later tasks match what you defined in earlier tasks? A function called `clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 is a bug.

**4. Verification requirement scan:** Answer this question with YES or NO:

> Does the original prompt/spec require **any form of** user verification, user feedback, user confirmation, user approval, human sign-off, or human-in-the-loop validation of the work's outcome?

This is about **intent**, not exact keywords. All of these qualify:
- "plan must include user feedback on error count" → YES
- "terugkoppeling van users hoeveel foutmeldingen die ziet" → YES
- "verify with the user that latency improved" → YES
- "add a caching layer" → NO (no human verification requested)

**If YES:** Call `TaskList`. At least one task MUST have `requiresUserVerification: true` in its `json:metadata`. If no such task exists → you have a gap. **Do not proceed.** Create a dedicated verification task now using the standard format below.

If you find issues, fix them inline. No need to re-review — just fix and move on. If you find a spec requirement with no task, add the task.

## User Verification Enforcement

When the original prompt/spec requires any form of user verification (detected in Self-Review step 4 above), the plan MUST include dedicated verification task(s). This is not optional — it is the mechanism that ensures user feedback requirements survive from prompt through to execution.

### What makes a verification task

A verification task has three mandatory elements:

1. `"requiresUserVerification": true` in the task's `json:metadata`
2. `"userVerificationPrompt"` set to the specific question for the user
3. The **standard verification block** in the task description (copy verbatim):

~~~markdown
**User Verification Required:**
Before marking this task complete, you MUST call AskUserQuestion:
```yaml
AskUserQuestion:
  question: "[specific question derived from the prompt's verification requirement]"
  header: "Verification"
  options:
    - label: "[positive outcome]"
      description: "[what this means]"
    - label: "[negative outcome / needs rework]"
      description: "[what happens next]"
```
~~~

**If the user selects the negative option:** The task is NOT complete. Rework, then re-verify with AskUserQuestion again.

### Where verification tasks go

- **Dedicated task** when the verification is a standalone checkpoint (e.g., "ask the user how many errors they see")
- **Added to an existing task** when the verification is part of that task's scope (e.g., "implement fix AND verify with user that it works")

Either way, the three mandatory elements above must be present.

### Example

Prompt: "Fix hook errors. Plan must include user feedback on error count."

The plan must include a task like:

> **Task N: Verify error reduction with user**
>
> **Goal:** Get user confirmation that hook errors have decreased from baseline.
>
> **User Verification Required:**
> Before marking this task complete, you MUST call AskUserQuestion:
> ```yaml
> AskUserQuestion:
>   question: "How many hook errors do you see per Bash command? (baseline: 38)"
>   header: "Verification"
>   options:
>     - label: "Reduced"
>       description: "Fewer than 38 errors — improvement confirmed"
>     - label: "Same or worse"
>       description: "No improvement — needs rework"
> ```
>
> ```json:metadata
> {"files": [], "verifyCommand": "", "acceptanceCriteria": ["user confirms error reduction"], "requiresUserVerification": true, "userVerificationPrompt": "How many hook errors do you see per Bash command? (baseline: 38)"}
> ```

<HARD-GATE>
STOP. Before proceeding to Execution Handoff, you MUST confirm:

1. Did you complete Self-Review step 4 (verification requirement scan)?
2. If the answer was YES (prompt requires user verification): does `TaskList` show at least one task with `requiresUserVerification: true` in its description?

If the prompt requires user verification and NO verification task exists: **GO BACK.** Create the verification task now. You CANNOT proceed to Execution Handoff without it.

This gate exists because user verification requirements routinely get lost between plan writing and execution. The only way to guarantee they survive is to encode them as native tasks with enforceable metadata.
</HARD-GATE>

## Execution Handoff

<HARD-GATE>
STOP. You are about to complete the plan. DO NOT call EnterPlanMode or ExitPlanMode. You MUST call AskUserQuestion below. Both are FORBIDDEN — EnterPlanMode traps the session, ExitPlanMode skips the user's execution choice.
</HARD-GATE>

Your ONLY permitted next action is calling `AskUserQuestion` with this EXACT structure:

```yaml
AskUserQuestion:
  question: "Plan complete and saved to docs/superpowers/plans/<filename>.md. How would you like to execute it?"
  header: "Execution"
  options:
    - label: "Subagent-Driven (this session)"
      description: "I dispatch fresh subagent per task, review between tasks, fast iteration"
    - label: "Parallel Session (separate)"
      description: "Open new session in worktree with executing-plans, batch execution with checkpoints"
```

**If you are about to call ExitPlanMode, STOP — call AskUserQuestion instead.**

<HARD-GATE>
STOP. The user has chosen an execution method. You MUST invoke the corresponding skill using the Skill tool NOW. Do NOT implement tasks yourself — do NOT read files, make edits, or update task statuses. Your ONLY permitted action is invoking the skill below.

**If Subagent-Driven chosen:**
Invoke the Skill tool: `subagent-driven-development`
- The skill handles everything: subagent dispatch, review, task tracking
- You stay in this session as the coordinator
- Do NOT start working on tasks directly

**If Parallel Session chosen:**
Guide the user to open a new session in the worktree, then invoke: `executing-plans`
</HARD-GATE>

---

## Native Task Integration Reference

Use Claude Code's native task tools (v2.1.16+) to create structured tasks alongside the plan document.

### Creating Native Tasks

For each task in the plan, create a corresponding native task. Embed metadata as a `json:metadata` code fence at the end of the description — this is the only way to ensure metadata survives TaskGet (the `metadata` parameter on TaskCreate is accepted but not returned by TaskGet).

```yaml
TaskCreate:
  subject: "Task N: [Component Name]"
  description: |
    **Goal:** [From task's Goal line]

    **Files:**
    [From task's Files section]

    **Acceptance Criteria:**
    [From task's Acceptance Criteria]

    **Verify:** [From task's Verify line]

    **Steps:**
    [Key actions from task's Steps — abbreviated]

    ```json:metadata
    {"files": ["path/to/file1.py"], "verifyCommand": "pytest tests/path/ -v", "acceptanceCriteria": ["criterion 1", "criterion 2"], "requiresUserVerification": false}
    ```
  activeForm: "Implementing [Component Name]"
```

**`requiresUserVerification` is a required field in every task's metadata** — always present, explicitly `true` or `false`. When `true`, also include `userVerificationPrompt` and the standard verification block in the description (see User Verification Enforcement section). This forces an active decision per task rather than allowing verification to be silently omitted.

### Why Embedded Metadata

The `metadata` parameter on TaskCreate is accepted but **not returned by TaskGet**. Embedding it as a `json:metadata` code fence in the description ensures:
- TaskGet returns the full metadata (it's part of the description)
- Cross-session resume can parse it from .tasks.json
- Subagent dispatch can extract it for implementer prompts

See `skills/shared/task-format-reference.md` for the full metadata schema.

### Setting Dependencies

After all tasks created, set blockedBy relationships:

```
TaskUpdate:
  taskId: [task-id]
  addBlockedBy: [prerequisite-task-ids]
```

### During Execution

Update task status as work progresses:

```
TaskUpdate:
  taskId: [task-id]
  status: in_progress  # when starting

TaskUpdate:
  taskId: [task-id]
  status: completed    # when done
```

---

## Task Persistence

At plan completion, write the task persistence file **in the same directory as the plan document**.

If the plan is saved to `docs/superpowers/plans/2026-01-15-feature.md`, the tasks file MUST be saved to `docs/superpowers/plans/2026-01-15-feature.md.tasks.json`.

```json
{
  "planPath": "docs/superpowers/plans/2026-01-15-feature.md",
  "tasks": [
    {
      "id": 0,
      "subject": "Task 0: ...",
      "status": "pending",
      "description": "**Goal:** ...\n\n**Files:**\n...\n\n```json:metadata\n{\"files\": [\"path/to/file.py\"], \"verifyCommand\": \"pytest tests/ -v\", \"acceptanceCriteria\": [\"criterion 1\"]}\n```"
    },
    {
      "id": 1,
      "subject": "Task 1: ...",
      "status": "pending",
      "blockedBy": [0],
      "description": "**Goal:** ...\n\n```json:metadata\n{\"files\": [], \"verifyCommand\": \"\", \"acceptanceCriteria\": []}\n```"
    }
  ],
  "lastUpdated": "<timestamp>"
}
```

Both the plan `.md` and `.tasks.json` must be co-located in `docs/superpowers/plans/`.

### Resuming Work

Any new session can resume by running:
```
/executing-plans <plan-path>
```

The skill reads the `.tasks.json` file and continues from where it left off.
