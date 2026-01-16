# Obsidian Workflow

A lightweight, BuJo-inspired knowledge system built in Obsidian. Designed to survive real-world chaos while supporting deep thinking and rapid context-switching in a demanding leadership role.

## What This Is

This is a personal knowledge management system that blends the simplicity and constraints of analog bullet journaling with the searchability and structure of Obsidian. It solves three problems that traditional systems (GTD, PARA, task apps) struggle with:

1. **Capture friction** — Most systems force you to decide *where* something goes before you can write it down. This one doesn't.
2. **Review collapse** — Scheduled reviews fail when life gets chaotic. This system weaves reflection into the natural workflow.
3. **Retrieval failure** — Analog BuJo is great for thinking but terrible for finding things later. Digital search fixes this.
4. **Infinite inbox** — Digital systems encourage infinite accumulation. This system requires deliberate migration decisions, preventing the endless growth that makes task lists unusable.

The result: a system that works on disciplined days *and* chaotic ones.

## Core Philosophy

The workflow is governed by 10 principles:

1. **Simplicity** — Start simple; complexity emerges only when needed
2. **Frictionless Capture** — One entry point, no decisions required
3. **Expect Chaos** — Messiness is allowed; transformation happens later
4. **Continuous Review** — Reflection is woven in, not scheduled separately
5. **Resilience** — The system works when life is chaotic, not just when I'm disciplined
6. **Lightness** — No guilt, no overdue backlogs, no psychological drag
7. **Findability** — If I can't find it fast, it doesn't exist
8. **Text over Logic** — Clarity beats abstraction; redundancy is acceptable
9. **One System** — Work and life live together; no artificial boundaries
10. **Flexibility** — Structure adapts to context-switching, not the other way around

These principles reflect hard-won lessons: complex systems collapse under stress, scheduled reviews fail, and guilt-driven workflows create more problems than they solve.

## How It Works

### Morning: Opening the Daily Note

The day starts in the daily note — a file named `YYYY-MM-DD ddd` (e.g., `2025-01-14 Tue`) containing one empty bullet and nothing else. No metadata, no templates.

The morning routine is simple:
1. Capture overnight thoughts
2. Review yesterday's migrated tasks (if migration happened at all)
3. Check the weekly note for today's planned items
4. Scan Google Calendar and note meetings
5. Choose 1–3 **MITs** (Most Important Tasks) and tag them in the log

The MIT list appears automatically at the top via dynamic embed. Research shows that identifying a single meaningful task improves follow-through and reduces decision fatigue.

### Throughout the Day: Rapid Logging

Everything flows into the daily note as a running log:
- Tasks
- Meeting notes
- Ideas, questions, decisions
- Inputs from Slack, Asana, email, Calendar
- Project updates, quick reflections

**No categorization happens upfront.** The log is messy by design.

Semantic bullets (from Minimal Theme) provide visual structure without requiring extra effort:
- Plain bullets for notes
- Checkboxes for tasks
- Custom markers for ideas, questions, meetings

Indentation creates lightweight hierarchy: meeting notes nest under meetings, sub-tasks under main tasks.

**Example mid-day log:**
```
- Revisit draft for engineering update
- [ ] Ask Samir about cost estimates
- ◆ Delivery sync
    - discussing migration timeline
    - need to follow up on monitoring gaps
- ○ Idea: rethink "project health" check-in format
- New Asana task: review accessibility audit
- [x] Send contract draft to procurement
- ? who else needs to see the proposal?
- Slack: incident review scheduled for Thu
```

Nothing is organized ahead of time. The goal: **capture first, think later.**

### Reflection Passes: Turning Logs Into Meaning

Reflection happens *ad hoc* throughout the day — between meetings, during breaks, when switching contexts. These mini-passes keep the log coherent without requiring scheduled reviews.

The key question: **"Is this only relevant today, or does it belong somewhere longer?"**

Most items stay ephemeral. When something has lasting value, it gets **extracted** into the relevant Project or Area note. Extraction is lightweight:
1. Select the bullet and its children
2. Move to target file (Project or Area)
3. Update link in daily note
4. Keep going

No templates, no ceremony.

### Meetings in the Flow

Meetings aren't separate — they're just top-level bullets in the daily log with nested notes underneath. Most stay entirely in the daily note. If content has lasting relevance (project decisions, architectural insights), it gets extracted during a reflection pass.

### Afternoon: The Workflow Under Stress

Afternoons bring interruptions, urgent tasks, shifting priorities. The system absorbs this. New items get logged as bullets; context-switching doesn't break anything because everything shares one capture space.

MITs might adjust if the day takes a turn, or they stay as reminders to return to what matters once the dust settles. The system doesn't fight chaos — it accommodates it.

### End of Day: Migration (BuJo Style)

A quick skim of the daily note:
- What got done?
- What needs to move forward?
- What can be dropped?

Tasks that matter get migrated to tomorrow, next week, or next month. **Dropping tasks is intentional, not failure** — it's a pressure-release valve that keeps the system light.

If migration doesn't happen for a few days, nothing breaks. The log still provides enough context to continue. The Calendar plugin helps surface which notes have unhandled tasks, making it easy to identify days that need migration decisions without requiring a rigid schedule.

### Weekly, Monthly, Yearly Notes

These notes serve as flexible containers for distributing tasks across different time horizons. Rather than being reflective spaces, they're practical tools for task allocation:

- **Weekly notes** — Hold tasks scheduled for specific days in the coming week
- **Monthly notes** — Collect tasks planned for later in the month
- **Yearly notes** — Store longer-term tasks and commitments

The structure is flexible. A task might live in a weekly note until it becomes relevant, then get migrated to a specific daily note when the day arrives. This keeps daily notes focused on today's reality while providing a lightweight way to schedule future work.

### Extraction: From Chaos to Structure

The extraction logic is what makes this system work at scale. It transforms messy daily logs into durable knowledge without requiring upfront organization.

**What gets extracted:**
- Project-specific notes, decisions, analyses
- Area-level reflections, insights, recurring patterns
- Meeting outputs with ongoing impact
- Anything worth preserving beyond today

**What stays ephemeral:**
- Scratch thoughts, operational fragments
- Notes meant only to support thinking
- Items whose value expires with the day

Extraction happens during reflection passes. It's the bridge between BuJo's "think in the moment" philosophy and digital knowledge management's "find it later" requirement.

## Vault Structure

The vault is organized around **PARA-lite** — a simplified version of PARA that doesn't enforce rigid rules:

```
Daily Notes/
├── 2025-01-14 Tue.md
├── 2025-01-15 Wed.md
└── ...

Weekly Notes/
├── 2025-W02.md
└── ...

Monthly Notes/
├── 2025-01.md
└── ...

Yearly Notes/
└── 2025.md

Projects/
├── Migration Initiative.md
├── Engineering Update.md
└── ...

Areas/
├── Engineering Leadership.md
├── Product Strategy.md
├── Team Development.md
└── ...

Resources/ (optional, evolving)
Archives/ (optional, evolving)
```

### Projects
Time-bound efforts with clear outcomes. They collect extracted material from daily notes. A project note grows only when the work produces content worth keeping.

### Areas
Ongoing responsibilities that don't end. They accumulate higher-level reflections, recurring insights, and decisions that define how you operate in that domain.

### Daily Notes
The center of gravity. Everything starts here. One timeline, one bulleted list, everything flows into it.

### Temporal Notes (Weekly/Monthly/Yearly)
Provide structure at different timescales without becoming burdensome. Used only as much as needed.

## Why This Works

This system works not because it's perfect, but because it stays usable when life isn't. It provides:

1. **One place to capture everything** — No decisions, no friction
2. **Simple way to surface what matters** — MITs, reflection passes
3. **Lightweight path from noise to structure** — Extraction and migration
4. **Resilience under stress** — Works on chaotic days, not just disciplined ones
5. **Findability without maintenance** — Search, backlinks, and extracted notes

The system evolves with changing needs without becoming heavier. It's a practical companion, not a rigid method — a way to stay oriented, think clearly, and move through complicated days with a little more ease.
