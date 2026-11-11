# Bullet Flow preview

This is real Obsidian with a disposable vault. Open [[Candidate]] for the exact build and CI evidence.

## Try it

1. Open [[Daily/2026-11-07]]. Put the cursor on the log bullet referencing Preview project.
2. Open the command palette (Ctrl+P), search Bullet Flow and run Extract log.
3. Open [[Preview project]]. Expect the log entry under Log and a visible reference left in the daily note.
4. Undo and repeat; confirm the notes remain understandable as plain Markdown.

Use the issue's acceptance cases for feature-specific testing. These are only smoke checks.

## Try it: ticking a task in a weekly, monthly or yearly note files it down to today's daily log

Fixture notes — the file names are expanded to the current day, week, month and year when the preview vault is seeded:

- [[Daily/{{today}}]] — today's daily note, with a `## Log` section
- [[Weekly/{{week}}]] — this week's note
- [[Monthly/{{month}}]] — this month's note
- [[Yearly/{{year}}]] — this year's note
- [[Weekly/2020-01-W01]] — a week in the past (edge case)
- [[Monthly/2020-01 Jan]] — a month in the past (edge case)

Bullet Flow recognises a note's period from its file name, so the names have to match the filename formats of your Daily Notes / Periodic Notes plugins. With the plugin defaults those are `YYYY-MM-DD ddd` (day), `gggg-MM-[W]WW` (week), `YYYY-MM MMM` (month) and `YYYY` (year). If your vault uses different formats, change them in the plugin settings or rename the fixture file — the content stays the same.

The daily note the task lands in is today's daily note as your Daily Notes plugin names it; the cascade creates it when it doesn't exist yet. If that is a different file than [[Daily/{{today}}]], open that one instead.

### 1. Weekly task — happy path

1. Open [[Weekly/{{week}}]] and tick `- [ ] Call Sam`.
2. Expect the line in the week to read `- [<] Call Sam` — scheduled, not deleted.
3. Expect the open child `- [ ] Ask about pricing` to travel with it, and the completed child `- [x] Send the invoice` to stay in the week.
4. Expect today's daily note to hold `- [x] Call Sam` under `## Log`, with `- [ ] Ask about pricing` under it.

### 2. A ticked subtask moves on its own

1. In [[Weekly/{{week}}]], tick `- [ ] Confirm the time` (the child under `- [ ] Prepare the handover`).
2. Expect `- [ ] Prepare the handover` to stay open in the week.
3. Expect `- [x] Confirm the time` in today's daily log.

### 3. A project task

1. In [[Weekly/{{week}}]], tick `- [ ] [[Preview project]] Draft the rollout plan`.
2. Expect `- [<] [[Preview project]] Draft the rollout plan` in the week — its child travels to the project.
3. Expect today's daily log to hold `- [x] [[Preview project]] Draft the rollout plan`, without the child.
4. Expect [[Preview project]] to hold one log entry under a heading that links today's daily note (`### [[<name of today's daily note>]]`), containing `- [x] Draft the rollout plan` and `- [ ] Agree on a phased approach`. The copy under `## Todo` is gone.

### 4. Monthly and yearly notes cascade one level at a time

1. In [[Monthly/{{month}}]], tick `- [ ] Renew the insurance`.
2. Expect `- [<] Renew the insurance` in the month, `- [<] Renew the insurance` in [[Weekly/{{week}}]], and `- [x] Renew the insurance` in today's daily log.
3. Do the same in [[Yearly/{{year}}]]: expect `- [<]` in the year, the month and the week, and `- [x]` in today's daily log.

### 5. Today is not in the note's period — nothing moves

1. Open [[Weekly/2020-01-W01]] and tick `- [ ] Task from a week that is long gone`.
2. Expect a notice saying today is not in this period, the line to stay `- [x]`, and no other note to change.

### 6. A started task does nothing

1. In [[Weekly/{{week}}]], set the `## Notes` bullet `- [/] Start the migration` to started.
2. Expect nothing to move and no notice.

## Reset and finish

Close Obsidian, then right-click the desktop and choose **Reset preview** to restore these sample notes and reopen the same candidate.

[Stop or delete the Codespace](https://github.com/codespaces) when finished. Closing this browser tab does not stop the machine. Delete it to release storage. Copy feedback to the GitHub issue before deleting.
