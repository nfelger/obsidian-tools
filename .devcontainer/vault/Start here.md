# Bullet Flow preview

This is real Obsidian with a disposable vault. Open [[Candidate]] for the exact build and CI evidence.

## Try it

1. Open [[Daily/2026-11-07]]. Put the cursor on the log bullet referencing Preview project.
2. Open the command palette (Ctrl+P), search Bullet Flow and run Extract log.
3. Open [[Preview project]]. Expect the log entry under Log and a visible reference left in the daily note.
4. Undo and repeat; confirm the notes remain understandable as plain Markdown.

Use the issue's acceptance cases for feature-specific testing. These are only smoke checks.

## Try it: ticking a task in a weekly, monthly or yearly note files it down to today's daily log

This preview vault has only the core **Daily Notes** plugin (folder `Daily`, format `YYYY-MM-DD`); **Periodic Notes is not installed**. Bullet Flow therefore uses its built-in defaults for the other periods: folder `+Diary`, week `gggg/MM/gggg-MM-[W]WW`, month `YYYY/YYYY-MM MMM`, year `YYYY/YYYY`. The fixtures below use exactly those paths, so the cascade lands in them instead of creating new notes. A note whose name doesn't match its period format (for example a file literally called `{{week}}`) is not a periodic note, and ticking in it only completes the task.

The week, month and year fixtures are for **week 47, November 2026** (16–22 Nov 2026). If you test on another date, those notes are outside today's period and behave like scenario 5; rename them to the current week/month/year to retry.

Fixture notes:

- [[Daily/{{today}}]] — today's daily note (`Daily/YYYY-MM-DD`), with `## Todo` and `## Log`. If the name was not expanded to today's date, the cascade creates `Daily/<today>.md` itself; open that one.
- [[+Diary/2026/11/2026-11-W47]] — this week's note
- [[+Diary/2026/2026-11 Nov]] — this month's note
- [[+Diary/2026/2026]] — this year's note
- [[+Diary/2020/01/2020-01-W01]] — a week in the past (edge case)
- [[+Diary/2020/2020-01 Jan]] — a month in the past (edge case)

### 1. Weekly task — happy path

1. Open [[+Diary/2026/11/2026-11-W47]] (switch to editing / live preview mode) and tick `- [ ] Call Sam`.
2. Expect the line in the week to read `- [<] Call Sam` — scheduled, not deleted.
3. Expect the open child `- [ ] Ask about pricing` to travel with it, and the completed child `- [x] Send the invoice` to stay in the week under the `[<]` line.
4. Expect today's daily note to hold `- [x] Call Sam` under `## Log`, with `- [ ] Ask about pricing` under it.

### 2. A ticked subtask moves on its own

1. In [[+Diary/2026/11/2026-11-W47]], tick `- [ ] Confirm the time` (the child under `- [ ] Prepare the handover`).
2. Expect `- [ ] Prepare the handover` to stay open in the week and `Confirm the time` to read `- [<] Confirm the time`.
3. Expect `- [x] Confirm the time` in today's daily log.

### 3. A project task

1. In [[+Diary/2026/11/2026-11-W47]], tick `- [ ] [[Preview project]] Draft the rollout plan`.
2. Expect `- [<] [[Preview project]] Draft the rollout plan` in the week — its child travels to the project.
3. Expect today's daily log to hold `- [x] [[Preview project]] Draft the rollout plan`, without the child.
4. Expect [[Preview project]] to hold one log entry under a heading that links today's daily note (`### [[<today's date>]]`), containing `- [x] Draft the rollout plan` and `- [ ] Agree on a phased approach`. The copy under `## Todo` is gone.

### 4. Monthly and yearly notes cascade one level at a time

1. In [[+Diary/2026/2026-11 Nov]], tick `- [ ] Renew the insurance`.
2. Expect `- [<] Renew the insurance` in the month, `- [<] Renew the insurance` under `## Todo` in [[+Diary/2026/11/2026-11-W47]], and `- [x] Renew the insurance` in today's daily log.
3. In [[+Diary/2026/2026]], tick `- [ ] Plan the roadmap`: expect `- [<]` in the year, the month and the week, and `- [x] Plan the roadmap` in today's daily log.

### 5. Today is not in the note's period — nothing moves

1. Open [[+Diary/2020/01/2020-01-W01]] and tick `- [ ] Task from a week that is long gone`.
2. Expect a notice saying today is not in this period, the line to stay `- [x]`, and no other note to change.
3. Repeat in [[+Diary/2020/2020-01 Jan]] with `- [ ] Task from a month that is long gone`; expect the same.

### 6. A started task does nothing

1. In [[+Diary/2026/11/2026-11-W47]], under `## Notes`, change `- [ ] Start the migration` to `- [/] Start the migration` (type `/` between the brackets).
2. Expect nothing to move and no notice.

### 7. Daily notes behave as before

1. In [[Daily/{{today}}]], tick `- [ ] Water the plants` under `## Todo`.
2. Expect it to move to `## Log` as `- [x] Water the plants`, exactly as before this change.

## Reset and finish

Close Obsidian, then right-click the desktop and choose **Reset preview** to restore these sample notes and reopen the same candidate.

[Stop or delete the Codespace](https://github.com/codespaces) when finished. Closing this browser tab does not stop the machine. Delete it to release storage. Copy feedback to the GitHub issue before deleting.
