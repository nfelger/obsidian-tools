# Project-Aware Task Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transfer commands (`pushTaskDown`, `pullTaskUp`, `migrateTask`, `takeProjectTask`) become project-aware on the target side: alias-aware dedup, appending under collectors, consolidating prefixed siblings under a new collector — with collector grouping enabled only for weekly/monthly/yearly targets, never daily.

**Architecture:** A pure shared routine `insertProjectTasksInSection` in `src/utils/projects.ts` implements the four insertion cases from the spec, backed by small helpers (`parseProjectPrefix`, `findCollector`, `findPrefixedProjectTasks`, `findProjectTaskMatch`, `findSliceRange`, `mergeIntoMatchedTask`). Commands detect project context source-side via `detectProjectContext` and route project tasks through the routine; non-project tasks keep their current paths. The existing three-phase order (collect → `vault.process` target → mutate source) is untouched.

**Tech Stack:** TypeScript, Obsidian plugin API, Vitest (markdown-first tests per tests/CLAUDE.md).

**Spec:** `docs/specs/2026-07-06-project-task-consolidation.md` — read it before starting. Where this plan and the spec disagree, the spec wins.

**User Verification:** NO — no user verification required.

---

## Design Reference (read first, applies to all tasks)

### Data shapes

`src/types.ts` gains (Task 6):

```typescript
/** A task headed for project-aware insertion. taskText and taskContent are
 *  project-stripped; the routine re-renders the prefix when needed. */
export interface ProjectTaskInsertItem extends TaskInsertItem {
	/** Wikilink rendered when a prefix is needed, verbatim from the source,
	 *  e.g. "[[Project|EU]]" — the task's own prefix link, or the source
	 *  collector's link. */
	linkText: string;
}
```

### The shared routine (built incrementally in Tasks 6–9)

```typescript
export interface ProjectInsertionOptions {
	targetHeading: string;       // e.g. "## Todo"
	keywords: string[];          // parseProjectKeywords(settings.projectKeywords)
	groupUnderCollector: boolean;
}

export function insertProjectTasksInSection(
	content: string,
	projectName: string,          // project note basename
	tasks: ProjectTaskInsertItem[],
	options: ProjectInsertionOptions
): { content: string; mergedCount: number; newCount: number }
```

Algorithm (all scanning scoped to the `targetHeading` section):

1. **Dedup (always, per task, against evolving content):** find a live
   (open/started/scheduled) task whose project-stripped text equals
   `task.taskText` and whose project matches — via its own alias-aware prefix
   or via a matching collector it sits under. On match: reopen `[<]`, merge
   children (`mergeIntoMatchedTask`). Merged tasks are done; the rest are
   "remaining".
2. **If `groupUnderCollector` and a collector exists:** append remaining under
   it as last items (content is already stripped); fold stray top-level
   prefixed tasks in the collector's slice under it too.
3. **If `groupUnderCollector` and top-level prefixed sibling(s) exist, all in
   one slice:** insert a new collector line at the first match's position,
   fold all matches + remaining under it. Collector: `- [ ] <keywords[0] ??
   'Push'> [[Project]]` (or `[[Project|alias]]`; alias = first target match
   with an alias, else first remaining task's linkText alias, else none).
   Matches spanning slices → skip to step 4.
4. **If `groupUnderCollector` and ≥2 remaining:** create a collector at the end
   of the section with all remaining under it (alias from first remaining).
5. **Otherwise:** append each remaining as a prefixed task at the end of the
   section (`TaskMarker.prependToContent` with the task's own `linkText`);
   creates the heading when missing.

### Matching rules

- Project identity: compare **link-target basenames** (part before `|`/`#`,
  after the last `/`) against the project note's basename. Source-side
  detection additionally requires the link to *resolve* to a note in the
  projects folder (`isProjectLink`); target-side scanning is pure string
  matching, consistent with the existing `stripProjectPrefix` convention.
- Collector line: `- <keyword> [[P]]`, `- [ ] <keyword> [[P]]`, or
  `- [/] <keyword> [[P]]` — content must be *exactly* keyword + one wikilink
  (alias allowed). `[x]`/`[>]`/`[<]` collectors don't count.
- Slice: within the section, any heading line is a boundary; a line's slice is
  `findSliceRange(lines, section, line)` and membership is
  `line > slice.start && line < slice.end`.

### Per-command grouping flag

| Command | Target | `groupUnderCollector` |
|---|---|---|
| pushTaskDown | one level down | `noteInfo.type !== 'weekly'` (weekly→daily is the only daily target) |
| pullTaskUp | one level up | `true` (never daily) |
| migrateTask | next note | parse target basename: `parseNoteType(...)?.type !== 'daily'` |
| takeProjectTask | today's daily | `false` (always daily) |

### Conventions that apply to every task

- Red → green: write the failing test, run it, watch it fail for the right
  reason, implement, watch it pass, then run `npm test` (full suite) before
  committing.
- Markdown-first template-string test cases (tests/CLAUDE.md). No planning
  comments (TODO/FIXME) in committed code. Never hardcode `'  '` — use the
  indent helpers. Task markers only via `TaskMarker`.
- Unit tests append to the existing `tests/unit/projects.test.ts` /
  `tests/unit/tasks.test.ts`, matching their existing import style.

---

### Task 1: Prefix parsing — `parseProjectPrefix`, `linkTargetBasename`, `TaskMarker.replaceContent`

**Goal:** Alias-aware parsing of a leading `[[Project]]`/`[[Project|Alias]]` prefix, and a marker-safe way to replace a task line's content. Rework `stripProjectPrefix` on top of it.

**Files:**
- Modify: `src/utils/projects.ts` (replace `stripProjectPrefix`, add the two new exports next to it)
- Modify: `src/utils/taskMarker.ts` (after `prependToContent`)
- Test: `tests/unit/projects.test.ts`, `tests/unit/tasks.test.ts`

**Acceptance Criteria:**
- [ ] `parseProjectPrefix('[[P|EU]] Task')` → `{ linkTarget: 'P', alias: 'EU', linkText: '[[P|EU]]', rest: 'Task' }`
- [ ] Path targets and `#section` handled via `parseWikilinkText`; no-rest and non-leading links → `null`
- [ ] `stripProjectPrefix` behavior preserved (existing tests stay green) and now also strips path-form prefixes
- [ ] `TaskMarker.replaceContent('- [ ] [[P]] Task', 'Task')` → `'- [ ] Task'`, preserving indent and marker

**Verify:** `npm test -- tests/unit/projects.test.ts tests/unit/tasks.test.ts`

**Steps:**

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/projects.test.ts` (extend its import from `../../src/utils/projects` with `parseProjectPrefix`, `linkTargetBasename`):

```typescript
describe('parseProjectPrefix', () => {
	it('parses a plain prefix', () => {
		expect(parseProjectPrefix('[[Migration Initiative]] Draft plan')).toEqual({
			linkTarget: 'Migration Initiative',
			alias: null,
			linkText: '[[Migration Initiative]]',
			rest: 'Draft plan'
		});
	});

	it('parses an aliased prefix', () => {
		expect(parseProjectPrefix('[[Migration Initiative|MI]] Draft plan')).toEqual({
			linkTarget: 'Migration Initiative',
			alias: 'MI',
			linkText: '[[Migration Initiative|MI]]',
			rest: 'Draft plan'
		});
	});

	it('parses a path-form prefix', () => {
		const parsed = parseProjectPrefix('[[1 Projekte/Migration Initiative]] Draft plan');
		expect(parsed?.linkTarget).toBe('1 Projekte/Migration Initiative');
		expect(linkTargetBasename(parsed!.linkTarget)).toBe('Migration Initiative');
	});

	it('treats extra pipes as part of the alias', () => {
		expect(parseProjectPrefix('[[P|a|b]] Task')?.alias).toBe('a|b');
	});

	it('returns null for a non-leading link', () => {
		expect(parseProjectPrefix('Ask about [[Migration Initiative]]')).toBeNull();
	});

	it('returns null for a pure link with no rest', () => {
		expect(parseProjectPrefix('[[Migration Initiative]]')).toBeNull();
	});
});

describe('stripProjectPrefix (alias/path-aware)', () => {
	it('strips a path-form prefix by basename', () => {
		expect(stripProjectPrefix('[[1 Projekte/Migration Initiative]] Task', 'Migration Initiative')).toBe('Task');
	});

	it('leaves a different project untouched', () => {
		expect(stripProjectPrefix('[[Other Project]] Task', 'Migration Initiative')).toBe('[[Other Project]] Task');
	});
});
```

Append to `tests/unit/tasks.test.ts` (imports `TaskMarker` already):

```typescript
describe('TaskMarker.replaceContent', () => {
	it('replaces content keeping indent and marker', () => {
		expect(TaskMarker.replaceContent('\t- [/] [[P|x]] Task text', 'Task text')).toBe('\t- [/] Task text');
	});

	it('leaves non-task lines untouched', () => {
		expect(TaskMarker.replaceContent('- just a bullet', 'Other')).toBe('- just a bullet');
	});
});
```

- [ ] **Step 2: Run and watch them fail** — `npm test -- tests/unit/projects.test.ts tests/unit/tasks.test.ts` → FAIL (missing exports).

- [ ] **Step 3: Implement**

In `src/utils/projects.ts`, import `parseWikilinkText` from `./wikilinks` and replace `stripProjectPrefix` with:

```typescript
/** A leading [[...]] prefix on a task's text. */
export interface ParsedProjectPrefix {
	/** Link target (before | and #), possibly path-form */
	linkTarget: string;
	alias: string | null;
	/** The full wikilink as written, e.g. "[[Project|EU]]" */
	linkText: string;
	/** Task text after the prefix */
	rest: string;
}

/**
 * Parse a leading wikilink prefix from task text (the part after the checkbox).
 * Returns null when the text doesn't start with a link or nothing follows it.
 */
export function parseProjectPrefix(taskText: string): ParsedProjectPrefix | null {
	const match = taskText.match(/^\[\[([^\]]+)\]\]\s+(\S.*)$/);
	if (!match) return null;
	const { linkPath, alias } = parseWikilinkText(match[1]);
	if (!linkPath) return null;
	return { linkTarget: linkPath, alias, linkText: `[[${match[1]}]]`, rest: match[2] };
}

/** The basename segment of a link target ("1 Projekte/P" → "P"). */
export function linkTargetBasename(linkTarget: string): string {
	return linkTarget.split('/').pop() ?? linkTarget;
}

/**
 * Strip a leading project-link prefix from task text when it points at the
 * given project (alias- and path-aware).
 */
export function stripProjectPrefix(taskText: string, projectName: string): string {
	const prefix = parseProjectPrefix(taskText);
	if (prefix && linkTargetBasename(prefix.linkTarget) === projectName) return prefix.rest;
	return taskText;
}
```

In `src/utils/taskMarker.ts`, after `prependToContent`:

```typescript
	/**
	 * Replace the content after the task checkbox, keeping indent and marker.
	 * e.g., replaceContent("- [ ] [[P]] Task", "Task") → "- [ ] Task"
	 */
	static replaceContent(line: string, text: string): string {
		return line.replace(/^(\s*- \[.\]\s*).*$/, `$1${text}`);
	}
```

- [ ] **Step 4: Run to green** — target files, then `npm test` (full suite; the old `stripProjectPrefix` tests must still pass).

- [ ] **Step 5: Commit** — `feat: alias-aware project prefix parsing`

---

### Task 2: Slice math — `findSliceRange`

**Goal:** Locate the innermost heading-delimited slice inside a section, so consolidation never crosses a heading boundary.

**Files:**
- Modify: `src/utils/tasks.ts` (after `findSectionRange`)
- Test: `tests/unit/tasks.test.ts`

**Acceptance Criteria:**
- [ ] A line with no sub-headings around it gets the whole section as its slice
- [ ] Sub-headings inside the section bound the slice on both sides
- [ ] Two lines separated by a sub-heading get different slices

**Verify:** `npm test -- tests/unit/tasks.test.ts`

**Steps:**

- [ ] **Step 1: Write the failing tests**

```typescript
describe('findSliceRange', () => {
	const lines = `
## Todo
- [ ] a
### Later
- [ ] b
- [ ] c
### Someday
- [ ] d
## Log
`.trim().split('\n');
	// 0:## Todo 1:a 2:### Later 3:b 4:c 5:### Someday 6:d 7:## Log
	const section = { start: 0, end: 7 };

	it('bounds a line before any sub-heading by the section itself', () => {
		expect(findSliceRange(lines, section, 1)).toEqual({ start: 0, end: 2 });
	});

	it('bounds a line between sub-headings by both', () => {
		expect(findSliceRange(lines, section, 3)).toEqual({ start: 2, end: 5 });
		expect(findSliceRange(lines, section, 4)).toEqual({ start: 2, end: 5 });
	});

	it('bounds the last slice by the section end', () => {
		expect(findSliceRange(lines, section, 6)).toEqual({ start: 5, end: 7 });
	});
});
```

- [ ] **Step 2: Run and watch fail.**

- [ ] **Step 3: Implement** in `src/utils/tasks.ts`:

```typescript
/**
 * Find the innermost heading-delimited slice of a section containing a line.
 * Any heading line inside the section is a boundary. The returned bounds are
 * the boundary lines themselves (section start / heading / section end);
 * membership of a line l is: l > start && l < end.
 */
export function findSliceRange(
	lines: string[],
	section: { start: number; end: number },
	line: number
): { start: number; end: number } {
	const headingPattern = /^#{1,6}\s/;
	let start = section.start;
	for (let i = section.start + 1; i <= line && i < section.end; i++) {
		if (headingPattern.test(lines[i])) start = i;
	}
	let end = section.end;
	for (let i = line + 1; i < section.end; i++) {
		if (headingPattern.test(lines[i])) {
			end = i;
			break;
		}
	}
	return { start, end };
}
```

- [ ] **Step 4: Green + full suite.**
- [ ] **Step 5: Commit** — `feat: sub-section slice lookup for heading-bounded consolidation`

---

### Task 3: Collector recognition — `parseCollectorLine`, `findCollector`, `findPrefixedProjectTasks`

**Goal:** Alias-aware, bullet-or-task collector detection scoped to a section, and the scan for top-level prefixed tasks (consolidation candidates).

**Files:**
- Modify: `src/utils/projects.ts` (near the old `findCollectorTask`; import `TaskMarker`, `extractTaskText` from `./tasks`)
- Test: `tests/unit/projects.test.ts`

**Acceptance Criteria:**
- [ ] Recognizes `- Push [[P]]`, `- [ ] Push [[P]]`, `- [/] Push [[P]]`, `- [ ] Push [[P|alias]]`, path-form targets
- [ ] Rejects `- [x] Push [[P]]`, trailing text after the link, partial keyword, other projects
- [ ] `findCollector` returns the first collector in the section with its alias and linkText
- [ ] `findPrefixedProjectTasks` returns only top-level (indent 0) live tasks with a matching prefix, in order

**Verify:** `npm test -- tests/unit/projects.test.ts`

**Steps:**

- [ ] **Step 1: Write the failing tests**

```typescript
describe('parseCollectorLine', () => {
	const kw = ['Push', 'Finish'];

	it.each([
		['- Push [[P]]'],
		['- [ ] Push [[P]]'],
		['- [/] Push [[P]]'],
		['- [ ] Finish [[P]]'],
		['- [ ] Push [[1 Projekte/P]]']
	])('recognizes %s', (line) => {
		expect(parseCollectorLine(line, 'P', kw)).not.toBeNull();
	});

	it('reports the alias and linkText', () => {
		expect(parseCollectorLine('- [ ] Push [[P|prio]]', 'P', kw))
			.toEqual({ alias: 'prio', linkText: '[[P|prio]]' });
	});

	it.each([
		['- [x] Push [[P]]'],
		['- [>] Push [[P]]'],
		['- [ ] Push [[P]] tomorrow'],
		['- [ ] Pushing [[P]]'],
		['- [ ] Push [[Other]]'],
		['- [ ] Push P']
	])('rejects %s', (line) => {
		expect(parseCollectorLine(line, 'P', kw)).toBeNull();
	});
});

describe('findCollector / findPrefixedProjectTasks', () => {
	const lines = `
## Todo
- [ ] [[P|x]] task one
- [ ] Push [[P|prio]]
	- [ ] nested under collector
- [<] [[P]] task two
- [ ] [[Other]] unrelated
	- [ ] [[P]] nested prefixed
## Log
`.trim().split('\n');
	const range = { start: 0, end: 7 };

	it('finds the first collector in the section with alias', () => {
		expect(findCollector(lines, range, 'P', ['Push'])).toEqual({
			line: 2, alias: 'prio', linkText: '[[P|prio]]'
		});
	});

	it('returns null when no collector matches', () => {
		expect(findCollector(lines, range, 'Other', ['Push'])).toBeNull();
	});

	it('returns the first of several collectors', () => {
		const dup = `
## Todo
- [ ] Push [[P]]
- [ ] Finish [[P]]
`.trim().split('\n');
		expect(findCollector(dup, { start: 0, end: 3 }, 'P', ['Push', 'Finish'])?.line).toBe(1);
	});

	it('lists top-level live prefixed tasks only', () => {
		expect(findPrefixedProjectTasks(lines, range, 'P')).toEqual([
			{ line: 1, alias: 'x' },
			{ line: 4, alias: null }
		]);
	});
});
```

- [ ] **Step 2: Run and watch fail.**

- [ ] **Step 3: Implement** in `src/utils/projects.ts`:

```typescript
export interface CollectorLink {
	alias: string | null;
	/** The collector's wikilink as written, e.g. "[[P|prio]]" */
	linkText: string;
}

/**
 * Check whether a line is a collector for the given project: a plain bullet
 * or live task whose content is exactly "<keyword> <wikilink>" where the
 * link's target basename is the project (alias-aware).
 */
export function parseCollectorLine(
	line: string,
	projectName: string,
	keywords: string[]
): CollectorLink | null {
	const match = line.match(/^\s*- (?:\[([ /])\] )?(.*)$/);
	if (!match) return null;
	const content = match[2].trim();
	for (const keyword of keywords) {
		if (!content.startsWith(keyword + ' ')) continue;
		const linkMatch = content.slice(keyword.length + 1).match(/^\[\[([^\]]+)\]\]$/);
		if (!linkMatch) continue;
		const { linkPath, alias } = parseWikilinkText(linkMatch[1]);
		if (linkTargetBasename(linkPath) === projectName) {
			return { alias, linkText: linkMatch[0] };
		}
	}
	return null;
}

export interface CollectorMatch extends CollectorLink {
	line: number;
}

/** Find the first collector for the project inside a section range. */
export function findCollector(
	lines: string[],
	range: { start: number; end: number },
	projectName: string,
	keywords: string[]
): CollectorMatch | null {
	for (let i = range.start + 1; i < range.end; i++) {
		const link = parseCollectorLine(lines[i], projectName, keywords);
		if (link) return { line: i, ...link };
	}
	return null;
}

export interface PrefixedTaskMatch {
	line: number;
	alias: string | null;
}

/**
 * Find top-level live tasks in a section carrying a prefix for the project.
 * Nested tasks are excluded — consolidation never restructures someone
 * else's hierarchy.
 */
export function findPrefixedProjectTasks(
	lines: string[],
	range: { start: number; end: number },
	projectName: string
): PrefixedTaskMatch[] {
	const matches: PrefixedTaskMatch[] = [];
	for (let i = range.start + 1; i < range.end; i++) {
		if (countIndent(lines[i]) > 0) continue;
		const marker = TaskMarker.fromLine(lines[i]);
		if (!marker || !(marker.isIncomplete() || marker.isScheduled())) continue;
		const prefix = parseProjectPrefix(extractTaskText(lines[i]));
		if (prefix && linkTargetBasename(prefix.linkTarget) === projectName) {
			matches.push({ line: i, alias: prefix.alias });
		}
	}
	return matches;
}
```

Note the regex in `parseCollectorLine`: the optional checkbox group only admits `[ ]`/`[/]`; on `- [x] Push [[P]]` the group fails so the content starts with `"[x] "` and the exactness check rejects it.

- [ ] **Step 4: Green + full suite.**
- [ ] **Step 5: Commit** — `feat: alias-aware collector and prefixed-task detection`

---

### Task 4: Refactor — extract `mergeIntoMatchedTask` (green-only)

**Goal:** The merge behavior of `insertMultipleTasksWithDeduplication` (reopen `[<]`, nest children with the matched task's whitespace, unit-converted) becomes a reusable export. Pure refactor guarded by the existing dedup suites — the only task without a new failing test.

**Files:**
- Modify: `src/utils/tasks.ts`

**Steps:**

- [ ] **Step 1: Run `npm test` — all green (baseline).**

- [ ] **Step 2: Extract.** In `src/utils/tasks.ts`, add above `insertMultipleTasksWithDeduplication`:

```typescript
/**
 * Merge an incoming task into an existing matched copy: reopen a scheduled
 * match as open, and nest the incoming children under it (re-rendered in the
 * target's indent unit, prefixed with the matched task's own whitespace).
 */
export function mergeIntoMatchedTask(
	content: string,
	match: TaskMatch,
	childrenContent: string
): string {
	let result = content;
	if (match.state === TaskState.Scheduled) {
		const lines = result.split('\n');
		lines[match.lineNumber] = markScheduledAsOpen(lines[match.lineNumber]);
		result = lines.join('\n');
	}
	if (childrenContent) {
		const resultLines = result.split('\n');
		const childLines = childrenContent.split('\n');
		const targetUnit = detectIndentUnit(resultLines);
		const converted = targetUnit ? convertIndentUnit(childLines, targetUnit) : childLines;
		const matchedWs = getLeadingWhitespace(resultLines[match.lineNumber]);
		const indentedChildren = indentLinesWith(converted, matchedWs).join('\n');
		result = insertChildrenUnderTask(result, match.lineNumber, indentedChildren);
	}
	return result;
}
```

Replace the corresponding body inside `insertMultipleTasksWithDeduplication`'s `if (match)` branch with:

```typescript
		if (match) {
			result = mergeIntoMatchedTask(result, match, task.childrenContent);
			mergedCount++;
		} else {
```

- [ ] **Step 3: `npm test` — still all green.**
- [ ] **Step 4: Commit** — `refactor: extract mergeIntoMatchedTask from dedup insertion`

---

### Task 5: Project-aware dedup matcher — `findProjectTaskMatch`

**Goal:** Find a live copy of a project task in a section: same stripped text, same project — via its own prefix (alias-aware) or via the collector it sits under.

**Files:**
- Modify: `src/utils/projects.ts` (import `findSectionRange`, `findTaskBlockEnd`, and type `TaskMatch` from `./tasks`)
- Test: `tests/unit/projects.test.ts`

**Acceptance Criteria:**
- [ ] Matches a prefixed copy regardless of alias on either side
- [ ] Matches an unprefixed copy under a matching collector (any depth within its block)
- [ ] Does not match: plain tasks outside collectors, other projects' prefixes, terminal (`[x]`/`[>]`) copies, other sections
- [ ] Reports the actual `TaskState` (so `[<]` can be reopened by the caller)

**Verify:** `npm test -- tests/unit/projects.test.ts`

**Steps:**

- [ ] **Step 1: Write the failing tests**

```typescript
describe('findProjectTaskMatch', () => {
	const opts = { heading: '## Todo', keywords: ['Push'] };
	const content = `
## Todo
- [ ] [[P|alias]] prefixed copy
- [ ] Push [[P]]
	- [<] under collector
	- [x] done under collector
- [ ] plain task
- [ ] [[Other]] wrong project

## Log
- [ ] [[P]] outside section
`.trim();

	it('matches a prefixed copy alias-insensitively', () => {
		expect(findProjectTaskMatch(content, 'prefixed copy', 'P', opts))
			.toEqual({ lineNumber: 1, state: ' ' });
	});

	it('matches a scheduled copy under the collector', () => {
		expect(findProjectTaskMatch(content, 'under collector', 'P', opts))
			.toEqual({ lineNumber: 3, state: '<' });
	});

	it('ignores completed copies, plain tasks, and other projects', () => {
		expect(findProjectTaskMatch(content, 'done under collector', 'P', opts)).toBeNull();
		expect(findProjectTaskMatch(content, 'plain task', 'P', opts)).toBeNull();
		expect(findProjectTaskMatch(content, 'wrong project', 'P', opts)).toBeNull();
	});

	it('ignores copies outside the section and missing sections', () => {
		expect(findProjectTaskMatch(content, 'outside section', 'P', opts)).toBeNull();
		expect(findProjectTaskMatch('- [ ] [[P]] x', 'x', 'P', opts)).toBeNull();
	});
});
```

(`state` values are the `TaskState` enum's string values: `' '` open, `'<'` scheduled — check `src/utils/taskMarker.ts` and import `TaskState` if you prefer symbolic assertions.)

- [ ] **Step 2: Run and watch fail.**

- [ ] **Step 3: Implement** in `src/utils/projects.ts`:

```typescript
/**
 * Find a live copy of a project task within a section: same stripped text and
 * same project, associated either by its own (alias-aware) prefix or by the
 * matching collector it sits under. Terminal copies never match.
 */
export function findProjectTaskMatch(
	content: string | string[],
	strippedText: string,
	projectName: string,
	options: { heading: string; keywords: string[] }
): TaskMatch | null {
	if (!strippedText) return null;
	const lines = Array.isArray(content) ? content : content.split('\n');
	const range = findSectionRange(lines, options.heading);
	if (!range) return null;

	const collectorBlocks: Array<{ start: number; end: number }> = [];
	for (let i = range.start + 1; i < range.end; i++) {
		if (parseCollectorLine(lines[i], projectName, options.keywords)) {
			collectorBlocks.push({ start: i + 1, end: Math.min(findTaskBlockEnd(lines, i), range.end) });
		}
	}
	const underCollector = (i: number) => collectorBlocks.some(b => i >= b.start && i < b.end);

	for (let i = range.start + 1; i < range.end; i++) {
		const marker = TaskMarker.fromLine(lines[i]);
		if (!marker || !(marker.isIncomplete() || marker.isScheduled())) continue;
		const text = extractTaskText(lines[i]);
		const prefix = parseProjectPrefix(text);
		if (prefix && linkTargetBasename(prefix.linkTarget) === projectName && prefix.rest === strippedText) {
			return { lineNumber: i, state: marker.state };
		}
		if (underCollector(i) && text === strippedText) {
			return { lineNumber: i, state: marker.state };
		}
	}
	return null;
}
```

- [ ] **Step 4: Green + full suite.**
- [ ] **Step 5: Commit** — `feat: project-aware task matching within a section`

---

### Task 6: `insertProjectTasksInSection` — dedup + prefixed append (grouping off)

**Goal:** The routine's skeleton: case 1 (dedup, always) and case 4 (prefixed append). With `groupUnderCollector: false` this is the complete daily-note behavior.

**Files:**
- Modify: `src/types.ts` (add `ProjectTaskInsertItem` after `TaskInsertItem`)
- Modify: `src/utils/projects.ts` (import `insertMultipleUnderTargetHeading`, `mergeIntoMatchedTask` from `./tasks`; `ProjectTaskInsertItem` from `../types`)
- Test: `tests/unit/projects.test.ts`

**Acceptance Criteria:**
- [ ] Merges into an existing copy (prefixed or under a manually created collector) — reopens `[<]`, merges children — with grouping off
- [ ] Non-merged tasks append at the end of the section as `- [ ] <linkText> <text>` (linkText verbatim, alias kept)
- [ ] Creates the heading when the section is missing
- [ ] With grouping off, an existing collector is NOT appended under
- [ ] Returns correct merged/new counts

**Verify:** `npm test -- tests/unit/projects.test.ts`

**Steps:**

- [ ] **Step 1: Write the failing tests**

```typescript
describe('insertProjectTasksInSection — grouping disabled', () => {
	const opts = { targetHeading: '## Todo', keywords: ['Push'], groupUnderCollector: false };
	const item = (taskText: string, linkText: string, childrenContent = '') => ({
		taskText,
		taskContent: childrenContent ? `- [ ] ${taskText}\n${childrenContent}` : `- [ ] ${taskText}`,
		childrenContent,
		linkText
	});

	it('merges into an existing prefixed copy, alias-insensitively', () => {
		const content = `
## Todo
- [<] [[P|other]] Review PR
`.trim();
		const result = insertProjectTasksInSection(content, 'P', [item('Review PR', '[[P]]', '\t- new note')], opts);
		expect(result.mergedCount).toBe(1);
		expect(result.content).toContain('- [ ] [[P|other]] Review PR');
		expect(result.content).toContain('\t- new note');
	});

	it('merges into a copy under a manually created collector', () => {
		const content = `
## Todo
- [ ] Push [[P]]
	- [ ] Review PR
`.trim();
		const result = insertProjectTasksInSection(content, 'P', [item('Review PR', '[[P]]')], opts);
		expect(result.mergedCount).toBe(1);
		expect(result.content.match(/Review PR/g)).toHaveLength(1);
	});

	it('appends prefixed at the end of the section, never under a collector', () => {
		const content = `
## Todo
- [ ] Push [[P]]
	- [ ] existing
- [ ] unrelated

## Log
`.trim();
		const result = insertProjectTasksInSection(content, 'P', [item('New task', '[[P|EU]]')], opts);
		expect(result.newCount).toBe(1);
		const lines = result.content.split('\n');
		expect(lines[4]).toBe('- [ ] [[P|EU]] New task');
	});

	it('creates the heading when missing', () => {
		const result = insertProjectTasksInSection('# Note', 'P', [item('Task', '[[P]]')], opts);
		expect(result.content).toContain('## Todo');
		expect(result.content).toContain('- [ ] [[P]] Task');
	});
});
```

- [ ] **Step 2: Run and watch fail.**

- [ ] **Step 3: Implement**

`src/types.ts`, after `TaskInsertItem` (copy the interface from the Design Reference).

`src/utils/projects.ts`:

```typescript
export interface ProjectInsertionOptions {
	targetHeading: string;
	keywords: string[];
	groupUnderCollector: boolean;
}

function prefixTaskContent(task: ProjectTaskInsertItem): string {
	const lines = task.taskContent.split('\n');
	lines[0] = TaskMarker.prependToContent(lines[0], task.linkText);
	return lines.join('\n');
}

/**
 * Insert one project's tasks into a note's target section, converging the
 * section toward one grouping per project. See the design spec
 * (docs/specs/2026-07-06-project-task-consolidation.md) for the case order.
 */
export function insertProjectTasksInSection(
	content: string,
	projectName: string,
	tasks: ProjectTaskInsertItem[],
	options: ProjectInsertionOptions
): { content: string; mergedCount: number; newCount: number } {
	let result = content;
	let mergedCount = 0;

	const remaining: ProjectTaskInsertItem[] = [];
	for (const task of tasks) {
		const match = findProjectTaskMatch(result, task.taskText, projectName, {
			heading: options.targetHeading,
			keywords: options.keywords
		});
		if (match) {
			result = mergeIntoMatchedTask(result, match, task.childrenContent);
			mergedCount++;
		} else {
			remaining.push(task);
		}
	}
	if (remaining.length === 0) {
		return { content: result, mergedCount, newCount: 0 };
	}

	if (options.groupUnderCollector) {
		const grouped = insertUnderProjectGrouping(result, projectName, remaining, options);
		if (grouped !== null) {
			return { content: grouped, mergedCount, newCount: remaining.length };
		}
	}

	result = insertMultipleUnderTargetHeading(result, remaining.map(prefixTaskContent), options.targetHeading);
	return { content: result, mergedCount, newCount: remaining.length };
}

/** Cases 2/3 and the multi-select rule. Returns null to fall through to the
 *  prefixed append. Implemented in the follow-up tasks. */
function insertUnderProjectGrouping(
	content: string,
	projectName: string,
	remaining: ProjectTaskInsertItem[],
	options: ProjectInsertionOptions
): string | null {
	return null;
}
```

- [ ] **Step 4: Green + full suite.**
- [ ] **Step 5: Commit** — `feat: project-aware insertion routine (dedup + prefixed append)`

---

### Task 7: Routine case 2 — append under an existing collector, fold strays

**Goal:** With grouping on, an existing collector absorbs the new tasks (as last items, content already stripped) and any stray top-level prefixed siblings in its slice.

**Files:**
- Modify: `src/utils/projects.ts` (import `findSliceRange` from `./tasks`)
- Test: `tests/unit/projects.test.ts`

**Acceptance Criteria:**
- [ ] Task appended as the collector's last child, in the file's indent unit
- [ ] Aliased and plain-bullet collectors are found
- [ ] A stray `[[P]]`-prefixed top-level task in the collector's slice moves under the collector, prefix stripped, before the new tasks
- [ ] A stray in a different sub-section stays put
- [ ] Dedup still wins: a matching copy under the collector merges instead of appending

**Verify:** `npm test -- tests/unit/projects.test.ts`

**Steps:**

- [ ] **Step 1: Write the failing tests** (same `opts`/`item` helpers, but `groupUnderCollector: true`):

```typescript
describe('insertProjectTasksInSection — existing collector (case 2)', () => {
	const opts = { targetHeading: '## Todo', keywords: ['Push'], groupUnderCollector: true };

	it('appends under the collector as the last item, stripped', () => {
		const content = `
## Todo
- [ ] Push [[P|prio]]
	- [ ] existing child
- [ ] unrelated
`.trim();
		const result = insertProjectTasksInSection(content, 'P', [item('New task', '[[P]]')], opts);
		expect(result.content.split('\n')).toEqual([
			'## Todo',
			'- [ ] Push [[P|prio]]',
			'\t- [ ] existing child',
			'\t- [ ] New task',
			'- [ ] unrelated'
		]);
	});

	it('recognizes a plain-bullet collector', () => {
		const content = `
## Todo
- Push [[P]]
`.trim();
		const result = insertProjectTasksInSection(content, 'P', [item('New task', '[[P]]')], opts);
		expect(result.content).toContain('- Push [[P]]\n\t- [ ] New task');
	});

	it('folds a stray prefixed sibling in the collector slice under it', () => {
		const content = `
## Todo
- [ ] [[P|x]] stray task
	- stray child
- [ ] Push [[P]]
	- [ ] existing child
`.trim();
		const result = insertProjectTasksInSection(content, 'P', [item('New task', '[[P]]')], opts);
		expect(result.content.split('\n')).toEqual([
			'## Todo',
			'- [ ] Push [[P]]',
			'\t- [ ] existing child',
			'\t- [ ] stray task',
			'\t\t- stray child',
			'\t- [ ] New task'
		]);
	});

	it('leaves a stray in another sub-section alone', () => {
		const content = `
## Todo
- [ ] Push [[P]]
### Someday
- [ ] [[P]] stray elsewhere
`.trim();
		const result = insertProjectTasksInSection(content, 'P', [item('New task', '[[P]]')], opts);
		expect(result.content).toContain('### Someday\n- [ ] [[P]] stray elsewhere');
	});

	it('dedup beats the collector: a matching copy under it merges instead of appending', () => {
		const content = `
## Todo
- [ ] Push [[P]]
	- [<] Review PR
`.trim();
		const result = insertProjectTasksInSection(content, 'P', [item('Review PR', '[[P]]', '\t- new note')], opts);
		expect(result.mergedCount).toBe(1);
		expect(result.newCount).toBe(0);
		expect(result.content.match(/Review PR/g)).toHaveLength(1);
		expect(result.content).toContain('- [ ] Review PR');
	});

	it('re-renders appended tasks in the target indent unit (spaces)', () => {
		const content = `
## Todo
- [ ] Push [[P]]
  - [ ] existing child
`.trim();
		const result = insertProjectTasksInSection(content, 'P', [item('New task', '[[P]]', '\t- tab child')], opts);
		expect(result.content).toContain('  - [ ] New task');
		expect(result.content).toContain('    - tab child');
		expect(result.content).not.toContain('\t');
	});
});
```

- [ ] **Step 2: Run and watch fail.**

- [ ] **Step 3: Implement.** Replace the `insertUnderProjectGrouping` stub body and add `foldIntoCollector`:

```typescript
function insertUnderProjectGrouping(
	content: string,
	projectName: string,
	remaining: ProjectTaskInsertItem[],
	options: ProjectInsertionOptions
): string | null {
	const lines = content.split('\n');
	const range = findSectionRange(lines, options.targetHeading);
	if (!range) return null;

	const collector = findCollector(lines, range, projectName, options.keywords);
	if (collector) {
		const slice = findSliceRange(lines, range, collector.line);
		const strays = findPrefixedProjectTasks(lines, range, projectName)
			.filter(s => s.line > slice.start && s.line < slice.end);
		return foldIntoCollector(lines, collector.line, strays, remaining);
	}

	return null;
}

/**
 * Move stray prefixed task blocks under a collector (prefixes stripped) and
 * append the remaining new tasks after them, as the collector's last items.
 */
function foldIntoCollector(
	lines: string[],
	collectorLine: number,
	strays: PrefixedTaskMatch[],
	remaining: ProjectTaskInsertItem[]
): string {
	const strayBlocks: string[] = [];
	const ranges: Array<{ start: number; end: number }> = [];
	for (const stray of strays) {
		const end = findTaskBlockEnd(lines, stray.line);
		const block = lines.slice(stray.line, end);
		const prefix = parseProjectPrefix(extractTaskText(block[0]));
		if (prefix) block[0] = TaskMarker.replaceContent(block[0], prefix.rest);
		strayBlocks.push(block.join('\n'));
		ranges.push({ start: stray.line, end });
	}
	let adjustedCollector = collectorLine;
	for (const range of [...ranges].reverse()) {
		lines.splice(range.start, range.end - range.start);
		if (range.end <= adjustedCollector) adjustedCollector -= range.end - range.start;
	}
	const block = [...strayBlocks, ...remaining.map(t => t.taskContent)].join('\n');
	return insertUnderCollectorTask(lines.join('\n'), adjustedCollector, block);
}
```

- [ ] **Step 4: Green + full suite.**
- [ ] **Step 5: Commit** — `feat: append under existing collectors, folding stray prefixed siblings`

---

### Task 8: Routine case 3 — consolidate prefixed siblings under a new collector

**Goal:** With grouping on and no collector, one-or-more same-slice top-level prefixed siblings consolidate under a new `- [ ] <keyword> [[P]]` collector at the first match's position; cross-slice matches fall through to the prefixed append.

**Files:**
- Modify: `src/utils/projects.ts`
- Test: `tests/unit/projects.test.ts`

**Acceptance Criteria:**
- [ ] Collector created at the first match's position; all matches + the new task nested under it, prefixes stripped, original order kept
- [ ] Alias preference: first target match with an alias → collector uses it; else first remaining task's linkText alias; else none
- [ ] Keyword is `keywords[0]`, falling back to `'Push'`
- [ ] Matches spanning sub-sections → no consolidation, prefixed append instead
- [ ] Nested prefixed tasks are not consolidation candidates

**Verify:** `npm test -- tests/unit/projects.test.ts`

**Steps:**

- [ ] **Step 1: Write the failing tests**

```typescript
describe('insertProjectTasksInSection — consolidation (case 3)', () => {
	const opts = { targetHeading: '## Todo', keywords: ['Push'], groupUnderCollector: true };

	it('consolidates a single prefixed sibling with the incoming task', () => {
		const content = `
## Todo
- [ ] unrelated
- [ ] [[P]] existing task
	- child
`.trim();
		const result = insertProjectTasksInSection(content, 'P', [item('New task', '[[P]]')], opts);
		expect(result.content.split('\n')).toEqual([
			'## Todo',
			'- [ ] unrelated',
			'- [ ] Push [[P]]',
			'\t- [ ] existing task',
			'\t\t- child',
			'\t- [ ] New task'
		]);
	});

	it('prefers the target alias over the incoming alias', () => {
		const content = `
## Todo
- [ ] [[P|target]] existing task
`.trim();
		const result = insertProjectTasksInSection(content, 'P', [item('New task', '[[P|incoming]]')], opts);
		expect(result.content).toContain('- [ ] Push [[P|target]]');
	});

	it('uses the incoming alias when no target task has one', () => {
		const content = `
## Todo
- [ ] [[P]] existing task
`.trim();
		const result = insertProjectTasksInSection(content, 'P', [item('New task', '[[P|incoming]]')], opts);
		expect(result.content).toContain('- [ ] Push [[P|incoming]]');
	});

	it('consolidates multiple same-slice siblings in order', () => {
		const content = `
## Todo
- [ ] [[P]] first
- [ ] between
- [ ] [[P]] second
`.trim();
		const result = insertProjectTasksInSection(content, 'P', [item('New task', '[[P]]')], opts);
		expect(result.content.split('\n')).toEqual([
			'## Todo',
			'- [ ] Push [[P]]',
			'\t- [ ] first',
			'\t- [ ] second',
			'\t- [ ] New task',
			'- [ ] between'
		]);
	});

	it('does not consolidate across sub-section boundaries', () => {
		const content = `
## Todo
- [ ] [[P]] this week
### Someday
- [ ] [[P]] someday task
`.trim();
		const result = insertProjectTasksInSection(content, 'P', [item('New task', '[[P|EU]]')], opts);
		expect(result.content).not.toContain('Push [[P');
		expect(result.content).toContain('- [ ] [[P|EU]] New task');
	});

	it('does not consolidate a nested prefixed task', () => {
		const content = `
## Todo
- [ ] some parent
	- [ ] [[P]] nested elsewhere
`.trim();
		const result = insertProjectTasksInSection(content, 'P', [item('New task', '[[P]]')], opts);
		expect(result.content).not.toContain('Push [[P');
		expect(result.content).toContain('\t- [ ] [[P]] nested elsewhere');
		expect(result.content).toContain('- [ ] [[P]] New task');
	});
});
```

- [ ] **Step 2: Run and watch fail.**

- [ ] **Step 3: Implement.** In `insertUnderProjectGrouping`, after the collector branch, before `return null`:

```typescript
	const matches = findPrefixedProjectTasks(lines, range, projectName);
	if (matches.length > 0) {
		const firstSlice = findSliceRange(lines, range, matches[0].line);
		const sameSlice = matches.every(m => m.line > firstSlice.start && m.line < firstSlice.end);
		if (sameSlice) {
			const alias = matches.find(m => m.alias)?.alias ?? aliasFromLinkText(remaining[0].linkText);
			const keyword = options.keywords[0] ?? 'Push';
			const link = alias ? `[[${projectName}|${alias}]]` : `[[${projectName}]]`;
			lines.splice(matches[0].line, 0, `- [ ] ${keyword} ${link}`);
			const shifted = matches.map(m => ({ ...m, line: m.line + 1 }));
			return foldIntoCollector(lines, matches[0].line, shifted, remaining);
		}
	}
```

And the small helper:

```typescript
function aliasFromLinkText(linkText: string): string | null {
	const match = linkText.match(/^\[\[([^\]]+)\]\]$/);
	if (!match) return null;
	return parseWikilinkText(match[1]).alias;
}
```

- [ ] **Step 4: Green + full suite.**
- [ ] **Step 5: Commit** — `feat: consolidate prefixed siblings under a new collector`

---

### Task 9: Routine — multi-select collector creation

**Goal:** With grouping on and cases 1–3 missed, two or more new tasks get a fresh collector at the end of the section instead of two prefixed siblings.

**Files:**
- Modify: `src/utils/projects.ts`
- Test: `tests/unit/projects.test.ts`

**Acceptance Criteria:**
- [ ] Two new tasks into an empty/unrelated section → one collector at the section end, both nested, alias from the first task's linkText
- [ ] Also applies when the section is missing (heading gets created) and when case-3 matches spanned slices
- [ ] A single new task still appends prefixed
- [ ] With grouping off, two new tasks stay two prefixed appends

**Verify:** `npm test -- tests/unit/projects.test.ts`

**Steps:**

- [ ] **Step 1: Write the failing tests**

```typescript
describe('insertProjectTasksInSection — multi-select collector creation', () => {
	const opts = { targetHeading: '## Todo', keywords: ['Push'], groupUnderCollector: true };

	it('creates a collector for two new tasks', () => {
		const content = `
## Todo
- [ ] unrelated
`.trim();
		const result = insertProjectTasksInSection(
			content, 'P',
			[item('first', '[[P|EU]]'), item('second', '[[P]]')],
			opts
		);
		expect(result.newCount).toBe(2);
		expect(result.content.split('\n')).toEqual([
			'## Todo',
			'- [ ] unrelated',
			'- [ ] Push [[P|EU]]',
			'\t- [ ] first',
			'\t- [ ] second'
		]);
	});

	it('creates heading and collector when the section is missing', () => {
		const result = insertProjectTasksInSection('# Note', 'P', [item('a', '[[P]]'), item('b', '[[P]]')], opts);
		expect(result.content).toContain('## Todo');
		expect(result.content).toContain('- [ ] Push [[P]]');
	});

	it('keeps a single new task as a prefixed append', () => {
		const result = insertProjectTasksInSection('## Todo', 'P', [item('only', '[[P]]')], opts);
		expect(result.content).toContain('- [ ] [[P]] only');
		expect(result.content).not.toContain('Push');
	});

	it('never creates a collector with grouping disabled', () => {
		const off = { ...opts, groupUnderCollector: false };
		const result = insertProjectTasksInSection('## Todo', 'P', [item('a', '[[P]]'), item('b', '[[P]]')], off);
		expect(result.content).toContain('- [ ] [[P]] a');
		expect(result.content).toContain('- [ ] [[P]] b');
		expect(result.content).not.toContain('Push');
	});
});
```

- [ ] **Step 2: Run and watch fail.**

- [ ] **Step 3: Implement.** In `insertUnderProjectGrouping`: change the missing-section early return and add the final branch, so the function ends:

```typescript
	if (!range) {
		if (remaining.length >= 2) {
			return insertNewCollectorBlock(content, projectName, remaining, options);
		}
		return null;
	}
	// ... collector branch (Task 7) ...
	// ... consolidation branch (Task 8) ...
	if (remaining.length >= 2) {
		return insertNewCollectorBlock(lines.join('\n'), projectName, remaining, options);
	}
	return null;
```

With:

```typescript
/** Create a fresh collector at the end of the section holding all tasks. */
function insertNewCollectorBlock(
	content: string,
	projectName: string,
	remaining: ProjectTaskInsertItem[],
	options: ProjectInsertionOptions
): string {
	const alias = aliasFromLinkText(remaining[0].linkText);
	const keyword = options.keywords[0] ?? 'Push';
	const link = alias ? `[[${projectName}|${alias}]]` : `[[${projectName}]]`;
	const taskLines = remaining.flatMap(t => t.taskContent.split('\n'));
	const contentLines = content.split('\n');
	const unit = detectIndentUnit(contentLines) ?? detectIndentUnit(taskLines) ?? '\t';
	const indented = indentLinesWith(convertIndentUnit(taskLines, unit), unit);
	const block = [`- [ ] ${keyword} ${link}`, ...indented].join('\n');
	return insertMultipleUnderTargetHeading(content, [block], options.targetHeading);
}
```

- [ ] **Step 4: Green + full suite.**
- [ ] **Step 5: Commit** — `feat: create a collector when inserting multiple project tasks at once`

---

### Task 10: Source-side detection — `detectProjectContext`

**Goal:** One helper answering "does this task belong to a project, and with which link?" — own leading prefix (must resolve to a project note) first, then ancestor chain.

**Files:**
- Modify: `src/utils/projects.ts`
- Test: `tests/unit/projects.test.ts`

**Acceptance Criteria:**
- [ ] Own leading prefix resolving to a project note → `hasOwnPrefix: true`, verbatim `linkText`, stripped text
- [ ] Task under a collector/project bullet → ancestor's `matchText` as `linkText`, full text as `strippedText`
- [ ] Mid-line (non-leading) project link on the task's own line → `null`
- [ ] Leading link that doesn't resolve to the projects folder → falls through to ancestors, else `null`

**Verify:** `npm test -- tests/unit/projects.test.ts`

**Steps:**

- [ ] **Step 1: Write the failing tests.** Use `parseMarkdownToListItems` from `tests/helpers/markdownParser.js` and a stub resolver (see `findProjectLinkInAncestors` tests in this file for the established pattern; reuse their resolver-stub style):

```typescript
describe('detectProjectContext', () => {
	const resolver = {
		resolve: (linkPath: string) => {
			const basename = linkPath.split('/').pop()!;
			if (['P', 'Other'].includes(basename)) {
				return { path: `1 Projekte/${basename}.md`, basename, extension: 'md', index: 0, matchText: '', inner: '' };
			}
			return null;
		}
	};
	const setup = (markdown: string) => {
		const content = markdown.replace(/^\n/, '').replace(/\n$/, '');
		const listItems = parseMarkdownToListItems(content) as ListItem[];
		return { editor: { getLine: (n: number) => content.split('\n')[n] }, listItems };
	};

	it('detects an own aliased prefix', () => {
		const { editor, listItems } = setup(`
- [ ] [[P|EU]] Draft plan
`);
		expect(detectProjectContext(editor, listItems, 0, 'daily.md', resolver)).toEqual({
			projectName: 'P',
			linkText: '[[P|EU]]',
			strippedText: 'Draft plan',
			hasOwnPrefix: true
		});
	});

	it('detects a collector ancestor', () => {
		const { editor, listItems } = setup(`
- [ ] Push [[P|EU]]
	- [ ] Draft plan
`);
		expect(detectProjectContext(editor, listItems, 1, 'daily.md', resolver)).toEqual({
			projectName: 'P',
			linkText: '[[P|EU]]',
			strippedText: 'Draft plan',
			hasOwnPrefix: false
		});
	});

	it('ignores a mid-line project link on the task line itself', () => {
		const { editor, listItems } = setup(`
- [ ] Ask about [[P]] tomorrow
`);
		expect(detectProjectContext(editor, listItems, 0, 'daily.md', resolver)).toBeNull();
	});

	it('ignores a leading link that is not a project note', () => {
		const { editor, listItems } = setup(`
- [ ] [[Some Note]] Draft plan
`);
		expect(detectProjectContext(editor, listItems, 0, 'daily.md', resolver)).toBeNull();
	});
});
```

- [ ] **Step 2: Run and watch fail.**

- [ ] **Step 3: Implement** in `src/utils/projects.ts`:

```typescript
export interface ProjectTaskContext {
	/** Project note basename */
	projectName: string;
	/** Link to render when a prefix is needed, verbatim from the source */
	linkText: string;
	/** Task text without the prefix */
	strippedText: string;
	hasOwnPrefix: boolean;
}

/**
 * Determine whether a task belongs to a project: its own leading prefix
 * (which must resolve into the projects folder) wins, then the ancestor
 * chain (collectors, project bullets). A mid-line link on the task's own
 * line does not make it a project task.
 */
export function detectProjectContext(
	editor: { getLine: (line: number) => string },
	listItems: ListItem[],
	taskLine: number,
	sourcePath: string,
	resolver: LinkResolver,
	settings: BulletFlowSettings = DEFAULT_SETTINGS
): ProjectTaskContext | null {
	const taskText = extractTaskText(editor.getLine(taskLine));
	const prefix = parseProjectPrefix(taskText);
	if (prefix) {
		const resolved = resolver.resolve(prefix.linkTarget, sourcePath);
		if (resolved && isProjectLink(resolved, settings)) {
			return {
				projectName: resolved.basename,
				linkText: prefix.linkText,
				strippedText: prefix.rest,
				hasOwnPrefix: true
			};
		}
	}
	const ancestor = findProjectLinkInAncestors(editor, listItems, taskLine, sourcePath, resolver, settings);
	if (ancestor && ancestor.line !== taskLine) {
		return {
			projectName: ancestor.link.basename,
			linkText: ancestor.link.matchText,
			strippedText: taskText,
			hasOwnPrefix: false
		};
	}
	return null;
}
```

- [ ] **Step 4: Green + full suite.**
- [ ] **Step 5: Commit** — `feat: source-side project context detection for transfer commands`

---

### Task 11: Wire `pushTaskDown`

**Goal:** Project tasks route through the routine; grouping off for weekly→daily, on for the other hops. Non-project behavior unchanged.

**Files:**
- Modify: `src/commands/pushTaskDown.ts`
- Modify: `tests/helpers/pushTaskDownPluginTestHelper.ts`
- Test: `tests/integration/pushTaskDown.plugin.test.ts`

**Steps:**

- [ ] **Step 1: Extend the helper.** Add `projectNotes?: string[]` (names) to `TestPushTaskDownOptions`, default `[]`. After `allFiles.push(mockSourceFile)`, register each project (mirror `completeProjectTaskPluginTestHelper.ts`):

```typescript
	const linkDests = new Map<string, any>();
	for (const name of projectNotes) {
		const projectFile = createMockFile({ path: `1 Projekte/${name}.md`, basename: name });
		allFiles.push(projectFile);
		linkDests.set(`${name}|${sourcePath}`, projectFile);
		linkDests.set(name, projectFile);
	}
```

and pass `linkDests` into `createMockMetadataCache({ fileCache, linkDests })`. Leave `mockVault.getAbstractFileByPath` as is (the command never opens the project file).

- [ ] **Step 2: Write the failing integration tests.** New describe block in `tests/integration/pushTaskDown.plugin.test.ts`:

```typescript
	describe('project-aware insertion', () => {
		it('weekly→daily: a task under a collector arrives prefixed with the collector link', async () => {
			const result = await testPushTaskDownPlugin({
				source: `
- [ ] Push [[Migration Initiative|MI]]
	- [ ] Draft plan
`,
				sourceFileName: '2026-01-W04',
				targetContent: '## Todo',
				today: new Date(2026, 0, 22),
				cursorLine: 1,
				projectNotes: ['Migration Initiative']
			});

			expect(result.source).toContain('- [<] Draft plan');
			expect(result.target).toContain('- [ ] [[Migration Initiative|MI]] Draft plan');
			expect(result.target!.match(/Push \[\[/g)).toBeNull();
		});

		it('weekly→daily: never groups under an existing collector in the daily note', async () => {
			const result = await testPushTaskDownPlugin({
				source: `
- [ ] [[Migration Initiative]] Draft plan
`,
				sourceFileName: '2026-01-W04',
				targetContent: `
## Todo
- [ ] Push [[Migration Initiative]]
	- [ ] other task
`,
				today: new Date(2026, 0, 22),
				cursorLine: 0,
				projectNotes: ['Migration Initiative']
			});

			const lines = result.target!.split('\n');
			expect(lines).toContain('- [ ] [[Migration Initiative]] Draft plan');
			expect(lines).not.toContain('\t- [ ] Draft plan');
		});

		it('weekly→daily: merges alias-insensitively into an existing prefixed copy', async () => {
			const result = await testPushTaskDownPlugin({
				source: `
- [ ] [[Migration Initiative|MI]] Draft plan
	- new note
`,
				sourceFileName: '2026-01-W04',
				targetContent: `
## Todo
- [<] [[Migration Initiative]] Draft plan
`,
				today: new Date(2026, 0, 22),
				cursorLine: 0,
				projectNotes: ['Migration Initiative']
			});

			expect(result.target!.match(/Draft plan/g)).toHaveLength(1);
			expect(result.target).toContain('- [ ] [[Migration Initiative]] Draft plan');
			expect(result.target).toContain('- new note');
		});

		it('monthly→weekly: consolidates with a prefixed sibling under a new collector', async () => {
			const result = await testPushTaskDownPlugin({
				source: `
- [ ] [[Migration Initiative]] New goal
`,
				sourceFileName: '2026-01 Jan',
				targetContent: `
## Todo
- [ ] [[Migration Initiative|MI]] Existing goal
`,
				today: new Date(2026, 0, 22),
				cursorLine: 0,
				projectNotes: ['Migration Initiative']
			});

			const lines = result.target!.split('\n');
			const collectorIdx = lines.indexOf('- [ ] Push [[Migration Initiative|MI]]');
			expect(collectorIdx).toBeGreaterThan(-1);
			expect(lines[collectorIdx + 1]).toBe('\t- [ ] Existing goal');
			expect(lines[collectorIdx + 2]).toBe('\t- [ ] New goal');
		});

		it('monthly→weekly: appends under an existing collector, stripped', async () => {
			const result = await testPushTaskDownPlugin({
				source: `
- [ ] [[Migration Initiative]] New goal
`,
				sourceFileName: '2026-01 Jan',
				targetContent: `
## Todo
- [ ] Push [[Migration Initiative]]
	- [ ] Existing goal
`,
				today: new Date(2026, 0, 22),
				cursorLine: 0,
				projectNotes: ['Migration Initiative']
			});

			const lines = result.target!.split('\n');
			expect(lines).toContain('\t- [ ] New goal');
			expect(lines).not.toContain('- [ ] [[Migration Initiative]] New goal');
		});
	});
```

- [ ] **Step 3: Run and watch fail** (`npm test -- tests/integration/pushTaskDown.plugin.test.ts`).

- [ ] **Step 4: Implement.** In `src/commands/pushTaskDown.ts`:

Imports: add `ObsidianLinkResolver` from `../utils/wikilinks`; `detectProjectContext`, `insertProjectTasksInSection`, `parseProjectKeywords` from `../utils/projects`; `ProjectTaskInsertItem` to the `../types` type import.

Phase 1 — before the loop:

```typescript
		const resolver = new ObsidianLinkResolver(plugin.app.metadataCache, plugin.app.vault);
		const projectGroups = new Map<string, ProjectTaskInsertItem[]>();
```

Inside the loop, after `taskContent` is built, replace `collectedTasks.push(...)` with:

```typescript
			const ctx = detectProjectContext(editor, listItems, taskLine, file.path, resolver, plugin.settings);
			if (ctx) {
				const strippedLine = ctx.hasOwnPrefix
					? TaskMarker.replaceContent(parentLineForTarget, ctx.strippedText)
					: parentLineForTarget;
				const group = projectGroups.get(ctx.projectName) ?? [];
				group.push({
					taskText: ctx.strippedText,
					taskContent: buildTaskContent(strippedLine, childrenContent ? childrenContent.split('\n') : []),
					childrenContent,
					linkText: ctx.linkText
				});
				projectGroups.set(ctx.projectName, group);
			} else {
				collectedTasks.push({ taskText, taskContent, childrenContent });
			}
```

Phase 2 — after `collectedTasks.reverse()` add `for (const items of projectGroups.values()) items.reverse();`, and replace the `vault.process` callback with:

```typescript
		const keywords = parseProjectKeywords(plugin.settings.projectKeywords);
		const groupUnderCollector = noteInfo.type !== 'weekly';
		await plugin.app.vault.process(targetFile, (data: string) => {
			let result = data;
			if (collectedTasks.length > 0) {
				const r = insertMultipleTasksWithDeduplication(result, collectedTasks, targetHeading);
				result = r.content;
				mergedCount += r.mergedCount;
				newCount += r.newCount;
			}
			for (const [name, items] of projectGroups) {
				const r = insertProjectTasksInSection(result, name, items, { targetHeading, keywords, groupUnderCollector });
				result = r.content;
				mergedCount += r.mergedCount;
				newCount += r.newCount;
			}
			return result;
		});
```

(`mergedCount`/`newCount` declarations stay; the notice code is unchanged.)

- [ ] **Step 5: Green** — pushTaskDown suite, then `npm test` (the pre-existing pushTaskDown tests must all still pass).
- [ ] **Step 6: Commit** — `feat: project-aware push task down`

---

### Task 12: Wire `pullTaskUp`

**Goal:** Same wiring, grouping always on. This is where tasks pulled out from under a collector stop losing their project.

**Files:**
- Modify: `src/commands/pullTaskUp.ts`
- Modify: `tests/helpers/pullTaskUpPluginTestHelper.ts` (same `projectNotes` extension as Task 11 Step 1)
- Test: `tests/integration/pullTaskUp.plugin.test.ts`

**Steps:**

- [ ] **Step 1: Extend the helper** exactly as in Task 11 Step 1.

- [ ] **Step 2: Write the failing tests** — new describe block, cases (markdown-first, mirroring the Task 11 shapes; source is a daily note like `2026-01-22 Thu`, target the weekly note):
	1. *Keeps project context:* task under `- [ ] Push [[Migration Initiative|MI]]` in the daily note, empty weekly `## Todo` → arrives as `- [ ] [[Migration Initiative|MI]] <text>`; source `[<]`.
	2. *Appends under existing weekly collector, stripped* (target has `- [ ] Push [[Migration Initiative]]` with a child).
	3. *Consolidates with a prefixed sibling* in the weekly note under a new collector (assert exact line layout as in Task 11).
	4. *Merges alias-insensitively* into an existing prefixed weekly copy (no duplicate, children merged).

- [ ] **Step 3: Run and watch fail.**

- [ ] **Step 4: Implement.** Same edits as Task 11 Step 4, except: `pullTaskUp.ts` needs the `ObsidianLinkResolver` import (it has none today), `TaskMarker` added to its `../utils/tasks` import, and the flag is a constant:

```typescript
		const groupUnderCollector = true;
```

(Keep the constant — it documents the target-type rule at the call site.)

- [ ] **Step 5: Green + full suite.**
- [ ] **Step 6: Commit** — `feat: project-aware pull task up`

---

### Task 13: Wire `migrateTask`

**Goal:** Replace the prefix-prepend special case with the shared routine. Grouping follows the target note type: off for daily→daily (mid-week), on for boundary migrations.

**Files:**
- Modify: `src/commands/migrateTask.ts`
- Modify: `tests/helpers/migrateTaskPluginTestHelper.ts` (same `projectNotes` extension)
- Test: `tests/integration/migrateTask.plugin.test.ts`

**Steps:**

- [ ] **Step 1: Extend the helper** as in Task 11 Step 1.

- [ ] **Step 2: Write the failing tests** — new describe block:
	1. *daily→daily never groups:* source `2026-01-22 Thu` (migrates to `2026-01-23 Fri`), task under a collector, target contains `- [ ] Push [[Migration Initiative]]` → task arrives as a top-level prefixed task, NOT under the collector; source `[>]`.
	2. *daily→weekly groups:* source `2026-01-25 Sun` (last day of ISO week 4 → migrates to `2026-01-W05`), target has `- [ ] [[Migration Initiative]] existing` → consolidated under `- [ ] Push [[Migration Initiative]]`.
	3. *project task merges:* prefixed task whose stripped text already exists prefixed in the target → merged, not duplicated (this is new dedup behavior for migrate).
	4. *non-project tasks keep no-dedup:* a plain task whose text already exists in the target is still appended a second time (regression pin for current behavior).

	Check the existing migrate tests for one that asserts the old prepend behavior (task under a project bullet gets `[[Project]]` prepended). It must still pass — the routine's prefixed append produces the same line. If its target-content setup now triggers consolidation, adjust its assertions to the new, spec-correct output and note that in the commit message.

- [ ] **Step 3: Run and watch fail.**

- [ ] **Step 4: Implement.** In `src/commands/migrateTask.ts`:
	- Delete the prepend block (the `projectLink && projectLink.line !== taskLine` block) and the now-unused `findProjectLinkInAncestors` import; add `detectProjectContext`, `insertProjectTasksInSection`, `parseProjectKeywords` imports and `ProjectTaskInsertItem`/`TaskInsertItem` types.
	- Collect project tasks into `projectGroups` (as in Task 11) keeping `collectedContent: string[]` for plain tasks.
	- Grouping flag from the computed target path:

```typescript
		const targetBasename = targetPath.split('/').pop()!.replace(/\.md$/, '');
		const targetInfo = noteService.parseNoteType(targetBasename);
		const groupUnderCollector = targetInfo ? targetInfo.type !== 'daily' : true;
```

	- Phase 2: keep `insertMultipleUnderTargetHeading(data, collectedContent, targetHeading)` for plain tasks, then run `insertProjectTasksInSection` per group over the result (same callback shape as Task 11; migrate has no merged/new counters — the notice stays as is).

- [ ] **Step 5: Green + full suite.**
- [ ] **Step 6: Commit** — `feat: project-aware migrate task with daily-target exception`

---

### Task 14: Rework `takeProjectTask` — prefixed-only, alias-aware dedup

**Goal:** Grouping always off (daily target). Deliberately reverses two shipped behaviors: no insertion under existing collectors, no collector creation on multi-take. Gains alias-aware dedup including copies under manually created collectors.

**Files:**
- Modify: `src/commands/takeProjectTask.ts`
- Test: `tests/integration/takeProjectTask.plugin.test.ts`

**Steps:**

- [ ] **Step 1: Rewrite the affected tests first.** In `tests/integration/takeProjectTask.plugin.test.ts`:
	- Replace the `collector task matching` describe with `never groups in the daily note`: taking a task while the daily note contains `- [ ] Push [[<project>]]` (with an existing child) now yields a **top-level prefixed** task; the collector and its children are untouched. Cover the `Finish` keyword case the old tests covered by the same assertion (still no insertion under it).
	- Replace the multi-select collector tests (`groups multiple taken tasks under a created collector`, `preserves original order under created collector`, `preserves original order under collector task`) with: multi-take yields all tasks prefixed at the end of `## Todo`, original order preserved, no `Push [[` anywhere in the target.
	- Keep `keeps single-task takes under the heading with project link (no collector)` as is (still correct).
	- Add dedup tests: (a) re-taking a task whose prefixed copy exists as `[<]` in the daily → reopened + children merged, no duplicate; (b) re-taking a task whose copy sits under a manual `- [ ] Push [[<project>]]` collector → merged under the collector, no new top-level task; (c) an aliased daily copy `[[<project>|X]] <text>` matches too.
	- Leave `basic functionality`, `validation`, `started tasks`, `transactional safety` untouched.

- [ ] **Step 2: Run and watch the new/changed tests fail** (old behavior still active).

- [ ] **Step 3: Implement.** In `src/commands/takeProjectTask.ts`:
	- Drop imports: `findCollectorTask`, `insertUnderCollectorTask`, `insertUnderTargetHeading`; add `insertProjectTasksInSection` (keep `parseProjectKeywords`) and `ProjectTaskInsertItem`.
	- Phase 1: remove `parentLineWithLink`, `taskTextWithLink`, `taskContentForCollector`. Collect:

```typescript
			collectedTasks.push({
				taskText,
				taskContent: buildTaskContent(parentLineForTarget, childrenContent ? childrenContent.split('\n') : []),
				childrenContent,
				linkText: `[[${projectName}]]`
			});
```

	  with `collectedTasks: ProjectTaskInsertItem[]`.
	- Phase 2: replace the whole collector-branching callback with:

```typescript
		await plugin.app.vault.process(dailyFile, (data: string) => {
			const result = insertProjectTasksInSection(data, projectName, collectedTasks, {
				targetHeading,
				keywords,
				groupUnderCollector: false
			});
			mergedCount = result.mergedCount;
			newCount = result.newCount;
			return result.content;
		});
```

- [ ] **Step 4: Green + full suite** (`npm test`). The notice logic is unchanged.
- [ ] **Step 5: Commit** — `feat!: taken tasks always arrive prefixed in the daily note`

---

### Task 15: Cleanup, docs, final verification

**Goal:** Remove dead code, document the change, verify everything.

**Files:**
- Modify: `src/utils/projects.ts`, `tests/unit/projects.test.ts`, `CHANGELOG.md`, `docs/key-insights.md`

**Steps:**

- [ ] **Step 1: Remove `findCollectorTask`.** Confirm nothing imports it (`grep -rn findCollectorTask src/ tests/`), delete the function and its unit tests. `insertUnderCollectorTask` stays (used by the routine); if its unit tests referenced `findCollectorTask` for setup, inline the line numbers instead.

- [ ] **Step 2: CHANGELOG** — add under `## [Unreleased]` (create it if missing), user-facing wording only, e.g.:

```markdown
### Changed

- Project tasks now converge to one grouping per project when moved between
  notes: pushing, pulling, or migrating a project task merges with existing
  copies (aliases understood), joins an existing `Push [[Project]]` collector,
  or consolidates loose `[[Project]]`-prefixed tasks under one — in weekly,
  monthly, and yearly notes. Daily notes never group: tasks taken or pushed
  into today's note always arrive individually, prefixed with their project
  link. Taking multiple tasks no longer creates a collector in the daily note.
```

- [ ] **Step 3: docs/key-insights.md** — append a short subsection under "Transfer Command Ordering" (or a sibling heading) stating: target-side project insertion goes through `insertProjectTasksInSection` (`src/utils/projects.ts`); the grouping flag derives from the **target note type** (daily = never group); matching is by link-target basename, alias-insensitive. No statistics, no line counts.

- [ ] **Step 4: Full verification**

```bash
npm test          # all suites green
npm run build     # tsc -noEmit + esbuild, no errors
```

- [ ] **Step 5: Commit** — `chore: remove findCollectorTask, document project task consolidation`
