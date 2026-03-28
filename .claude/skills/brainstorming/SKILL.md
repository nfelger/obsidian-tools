---
name: brainstorming
description: "You MUST use this before any creative work - creating features, building components, adding functionality, or modifying behavior."
---

# Brainstorming

**HARD GATE: Do NOT write any code or invoke implementation skills until design is presented and the user approves.**

## When to Use

Any time you're about to create something new or modify behavior:
- New features or commands
- New UI components
- Architectural changes
- Behavior modifications
- Significant refactors

## The Process

### Step 1: Explore Context
- Read relevant existing code
- Understand current patterns and conventions
- Check CLAUDE.md and WORKFLOW.md for project-specific guidance
- Identify constraints and dependencies

### Step 2: Ask Clarifying Questions
- **One question at a time** — don't overwhelm with a list
- Prefer multiple choice (2-3 options) over open-ended questions
- Each question should meaningfully narrow the design space
- Stop asking when you have enough to propose approaches

### Step 3: Propose 2-3 Approaches
For each approach, present:
- **What it does** — one-sentence summary
- **How it works** — key technical decisions
- **Trade-offs** — pros and cons
- **Effort** — relative complexity

Let the user pick or combine approaches.

### Step 4: Present Design
Present the chosen approach as a structured design:
- **Goal** — what we're building and why
- **Scope** — what's in and what's explicitly out
- **Key decisions** — the non-obvious choices and their rationale
- **Interface** — how users interact with it
- **Implementation sketch** — high-level structure (not code)

### Step 5: Write Design Doc
Save to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`

### Step 6: Self-Review
Before presenting to user:
- Does the design follow existing project patterns?
- Is the scope well-bounded?
- Are there edge cases we haven't addressed?
- Is this the simplest approach that works?

### Step 7: User Reviews
Present the design doc for approval. Wait for explicit approval before proceeding.

### Step 8: Transition to Planning
After approval, invoke the **writing-plans** skill. Never jump directly to implementation.

## Design Principles

- **YAGNI ruthlessly** — don't design for hypothetical futures
- **Follow existing patterns** — in an existing codebase, consistency > novelty
- **Smaller units** — prefer multiple small, well-defined pieces over one large thing
- **Clear interfaces** — every component should have an obvious API
- **Only improve what's relevant** — don't refactor adjacent code

## Red Flags

- Proposing code before design approval → STOP
- Designing for "future extensibility" → YAGNI
- One monolithic approach instead of 2-3 options → rethink
- Asking 5+ questions at once → slow down, one at a time

## Terminal State

The ONLY next skill after brainstorming is **writing-plans**. Never jump to implementation skills.
