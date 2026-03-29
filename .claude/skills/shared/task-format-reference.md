# Native Task Format Reference

Skills that create native tasks (TaskCreate) MUST follow this format.

## Task Description Template

Every TaskCreate description MUST follow this structure:

### Required Sections

**Goal:** One sentence — what this task produces (not how).

**Files:**
- Create/Modify/Delete: `exact/path/to/file.py` (with line ranges for modifications)

**Acceptance Criteria:**
- [ ] Concrete, testable criterion
- [ ] Another criterion

**Verify:** `exact command to run` → expected output summary

### Optional Sections (include when relevant)

**Context:** Why this task exists, what depends on it, architectural notes.
Only needed when the task can't be understood from Goal + Files alone.

**Steps:** Ordered implementation steps (only for multi-step tasks where order matters).
TDD cycles happen WITHIN steps, not as separate steps.

## Metadata Schema

Embed metadata as a `json:metadata` code fence at the end of the TaskCreate description. The `metadata` parameter on TaskCreate is accepted but **not returned by TaskGet** — embedding in the description is the only reliable way.

| Key | Type | Required | Purpose |
|-----|------|----------|---------|
| `files` | string[] | yes | Paths to create/modify/delete |
| `verifyCommand` | string | yes | Command to verify task completion |
| `acceptanceCriteria` | string[] | yes | List of testable criteria |
| `estimatedScope` | "small" \| "medium" \| "large" | no | Relative effort indicator |
| `requiresUserVerification` | boolean | **yes** | Whether task completion requires explicit user approval via AskUserQuestion. Always present — explicitly `true` or `false`. Forces active decision per task. |
| `userVerificationPrompt` | string | conditional | The specific question to ask the user. **Required when `requiresUserVerification` is `true`.** Used by execution skills to construct the AskUserQuestion call. |

### Example

```yaml
TaskCreate:
  subject: "Add JIT selection prompt to /hame Pre-flight"
  description: |
    **Goal:** Replace auto-latest JIT selection with interactive 3-option prompt.

    **Files:**
    - Modify: `.claude/commands/hame-optimal-cycle-inspection.md:45-60`

    **Acceptance Criteria:**
    - [ ] AskUserQuestion presents 3 most recent JIT messages
    - [ ] Selected JIT's SOC and schedule are parsed into variables
    - [ ] --jit override bypasses the prompt (backwards compat)

    **Verify:** Read the Pre-flight Step 2 section and confirm AskUserQuestion block with 3 JIT options

    ```json:metadata
    {"files": [".claude/commands/hame-optimal-cycle-inspection.md"], "verifyCommand": "grep -A 20 'Step 2' .claude/commands/hame-optimal-cycle-inspection.md", "acceptanceCriteria": ["AskUserQuestion with 3 JIT options", "SOC + schedule parsed from selection", "--jit override bypasses prompt"]}
    ```
```

### Verification Task Example

When a plan prompt contains user verification requirements (e.g., "verify with user", "confirm with user", "get user approval"), the task metadata encodes this so execution skills know to gate completion on explicit user approval.

```yaml
TaskCreate:
  subject: "Verify hook error reduction with user"
  description: |
    **Goal:** Get user confirmation that hook errors have been reduced after applying fixes.

    **Acceptance Criteria:**
    - [ ] Hook error count has been measured post-fix
    - [ ] User has explicitly confirmed the reduction
    - [ ] Verification result is recorded in task update

    **User Verification Required:**
    Before marking this task complete, you MUST call AskUserQuestion:
    ```yaml
    AskUserQuestion:
      question: "Hook error count was 38 before the fix. How many hook errors do you see now?"
      header: "Verification"
      options:
        - label: "Reduced (fewer than 38)"
          description: "Error count has improved — verification passed"
        - label: "Same or worse"
          description: "No improvement observed — needs rework"
    ```

    ```json:metadata
    {"files": [], "verifyCommand": "echo 'Requires user verification'", "acceptanceCriteria": ["User confirms hook error reduction", "Verification result recorded"], "requiresUserVerification": true, "userVerificationPrompt": "Hook error count was 38 before the fix. How many hook errors do you see now?"}
    ```
```

## Task Granularity

### The Right Scope

A task is **a coherent unit of work that produces a testable, committable outcome**.

**Scope test — ask these questions:**
1. Does this task produce something I can verify independently? (if no → too small)
2. Does it touch more than one concern? (if yes → too big)
3. Would it get its own commit? (if no → too small; if commit message needs bullet points → too big)

### Examples

| Scope | Example | Why |
|-------|---------|-----|
| Too small | "Write failing test for X" | Not independently verifiable — needs implementation |
| Too small | "Run pytest" | Verification step, not a task |
| Too small | "Add import statement" | Part of a larger change |
| **Right** | "Implement WebSocket protocol layer with tests" | Coherent unit, testable, one commit |
| **Right** | "Add JIT selection prompt to Pre-flight" | Single concern, verifiable, one commit |
| **Right** | "Create optimizer test class for SOC 73% case" | Complete test suite for one scenario |
| Too big | "Implement entire auth system" | Multiple concerns, multiple commits |
| Too big | "Fix all /hame output issues" | Multiple independent changes |

### TDD Within Tasks (Not Across Tasks)

TDD cycles (write test → verify fail → implement → verify pass) happen WITHIN a single task, not as separate tasks. The task is "Implement X with tests" — the TDD steps are execution detail, not task boundaries.

### Commit Boundary = Task Boundary

Each task should produce exactly one commit. If a task needs multiple commits, split it. If separate tasks share a commit, merge them.
