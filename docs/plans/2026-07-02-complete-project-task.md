# Complete Project Task Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Complete project task" command that, from a daily (or any non-project) note, marks the task done in both the daily note and the project note and appends a log entry to the project note.

**Architecture:** New command `src/commands/completeProjectTask.ts` following the three-phase convention (collect → write project notes via `vault.process` → mutate source). Two small domain helpers back it: `TaskMarker.toCompleted()` and a section-scoped task matcher in `src/utils/tasks.ts`. Registration in `main.ts`, `config.ts` (`HOTKEY_BINDINGS`, key `c`), and `HotkeyModal`.

**Tech Stack:** TypeScript, Obsidian plugin API, Vitest (markdown-first integration tests per tests/CLAUDE.md).

**Spec:** `docs/specs/2026-07-02-complete-project-task-design.md`

**User Verification:** NO — no user verification required.

---

### Task 1: Domain helpers — `TaskMarker.toCompleted()` and `findMatchingTaskInSection()`

**Goal:** Pure helpers the command needs: create a Completed marker, and match a task by text inside one heading section, distinguishing open/scheduled/completed matches.

**Files:**
- Modify: `src/utils/taskMarker.ts` (after `toOpen()`, ~line 114)
- Modify: `src/utils/tasks.ts` (after `findMatchingTask`, ~line 255)
- Test: `tests/unit/tasks.test.ts` (append new describe blocks)

**Acceptance Criteria:**
- [ ] `TaskMarker.toCompleted()` returns a marker rendering `[x]`
- [ ] `findMatchingTaskInSection` only matches inside the given section
- [ ] Returns state `'open'` for `[ ]`/`[/]`, `'scheduled'` for `[<]`, `'completed'` for `[x]`
- [ ] Prefers an open/scheduled match over a completed one; falls back to completed; null when nothing matches or section missing

**Verify:** `npm test -- tests/unit/tasks.test.ts` → all pass

**Steps:**

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/tasks.test.ts` (it already imports from `../../src/utils/tasks`; extend the import list with `findMatchingTaskInSection` and `TaskMarker`, matching the file's existing import style):

```typescript
describe('TaskMarker.toCompleted', () => {
	it('renders [x] and applies to a line', () => {
		const marker = TaskMarker.fromLine('- [<] Draft rollout plan')!;
		expect(marker.toCompleted().render()).toBe('[x]');
		expect(marker.toCompleted().applyToLine('- [<] Draft rollout plan')).toBe('- [x] Draft rollout plan');
	});
});

describe('findMatchingTaskInSection', () => {
	const content = `
# Project

## Todo
- [<] Draft rollout plan
- [ ] Write runbook
- [x] Old finished thing

## Log
- [<] Draft rollout plan
`.trim();

	it('finds a scheduled task inside the section', () => {
		const match = findMatchingTaskInSection(content, 'Draft rollout plan', '## Todo');
		expect(match).toEqual({ lineNumber: 3, state: 'scheduled' });
	});

	it('finds an open task inside the section', () => {
		const match = findMatchingTaskInSection(content, 'Write runbook', '## Todo');
		expect(match).toEqual({ lineNumber: 4, state: 'open' });
	});

	it('reports a completed match when no open/scheduled copy exists', () => {
		const match = findMatchingTaskInSection(content, 'Old finished thing', '## Todo');
		expect(match).toEqual({ lineNumber: 5, state: 'completed' });
	});

	it('prefers the open/scheduled copy over a completed duplicate', () => {
		const dup = `
## Todo
- [x] Draft rollout plan
- [<] Draft rollout plan
`.trim();
		const match = findMatchingTaskInSection(dup, 'Draft rollout plan', '## Todo');
		expect(match).toEqual({ lineNumber: 2, state: 'scheduled' });
	});

	it('ignores matches outside the section', () => {
		const match = findMatchingTaskInSection(content, 'Draft rollout plan', '## Somewhere Else');
		expect(match).toBeNull();
	});

	it('returns null when the section is missing', () => {
		expect(findMatchingTaskInSection('- [ ] Draft rollout plan', 'Draft rollout plan', '## Todo')).toBeNull();
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/unit/tasks.test.ts`
Expected: FAIL — `findMatchingTaskInSection` is not exported; `toCompleted` is not a function.

- [ ] **Step 3: Implement**

In `src/utils/taskMarker.ts`, after `toOpen()`:

```typescript
	/**
	 * Create a completed marker.
	 */
	toCompleted(): TaskMarker {
		return new TaskMarker(TaskState.Completed);
	}
```

In `src/utils/tasks.ts`, after `findMatchingTask` (uses `TaskState`, already imported):

```typescript
/**
 * Find a matching task by text within a single heading section.
 *
 * Unlike findMatchingTask, this also reports completed matches so callers
 * can distinguish "not found" from "already completed". Open/scheduled
 * matches win over completed ones.
 *
 * @param content - The file content to search
 * @param taskText - The task text to find (without checkbox)
 * @param heading - The section heading (e.g., "## Todo")
 * @returns Match with file-absolute line number and state, or null
 */
export function findMatchingTaskInSection(
	content: string,
	taskText: string,
	heading: string
): { lineNumber: number; state: 'open' | 'scheduled' | 'completed' } | null {
	if (!taskText) return null;

	const lines = content.split('\n');
	const range = findSectionRange(lines, heading);
	if (!range) return null;

	let completedMatch: { lineNumber: number; state: 'completed' } | null = null;
	for (let i = range.start + 1; i < range.end; i++) {
		if (extractTaskText(lines[i]) !== taskText) continue;
		const marker = TaskMarker.fromLine(lines[i]);
		if (!marker) continue;
		if (marker.isIncomplete()) return { lineNumber: i, state: 'open' };
		if (marker.state === TaskState.Scheduled) return { lineNumber: i, state: 'scheduled' };
		if (marker.state === TaskState.Completed && !completedMatch) {
			completedMatch = { lineNumber: i, state: 'completed' };
		}
	}
	return completedMatch;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/unit/tasks.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/taskMarker.ts src/utils/tasks.ts tests/unit/tasks.test.ts
git commit -m "feat: section-scoped task matching and completed-marker transition"
```

---

### Task 2: The `completeProjectTask` command with integration tests

**Goal:** The command itself: resolve project per task, mark the project copy `[x]`, append a log entry, complete the source task in place.

**Files:**
- Create: `src/commands/completeProjectTask.ts`
- Create: `tests/helpers/completeProjectTaskPluginTestHelper.ts`
- Test: `tests/integration/completeProjectTask.plugin.test.ts`

**Acceptance Criteria:**
- [ ] Happy path: `[<]` copy in project becomes `[x]`; log entry appears under the log heading with a `### [[<source note>]]` sub-heading; source task becomes `[x]` and stays in place with its children
- [ ] Project link resolved from own line or ancestors (incl. `Push [[Project]]` collector)
- [ ] Mismatches (no match / already `[x]`) still log and complete the source, with a notice
- [ ] Multi-select groups per project; one sub-heading per project per run
- [ ] Log heading created at end of file when missing
- [ ] Entry re-indented to the project note's indent unit
- [ ] Project write failure leaves the source untouched

**Verify:** `npm test -- tests/integration/completeProjectTask.plugin.test.ts` → all pass

**Steps:**

- [ ] **Step 1: Create the test helper**

`tests/helpers/completeProjectTaskPluginTestHelper.ts` — mirrors `dropTaskToProjectPluginTestHelper.ts` exactly (same mocks, same result shape) with the command import swapped and no unused pieces changed:

```typescript
import { vi } from 'vitest';
import { parseMarkdownToListItems, normalizeMarkdown } from './markdownParser.js';
import {
	createMockApp,
	createMockEditor,
	createMockFile,
	createMockMetadataCache,
	createMockVault,
	createMockWorkspace
} from '../mocks/obsidian.js';
import type { ListItem, BulletFlowSettings } from '../../src/types';
import { DEFAULT_SETTINGS } from '../../src/types';
import type BulletFlowPlugin from '../../src/main';

interface TestCompleteProjectTaskOptions {
	source: string;
	sourceFileName: string;
	sourcePath: string;
	projectNotes?: Record<string, string>;
	cursorLine?: number;
	selectionStartLine?: number | null;
	selectionEndLine?: number | null;
	projectsFolder?: string;
	failTargetWrite?: boolean;
}

interface TestCompleteProjectTaskResult {
	source: string;
	project: (name: string) => string | null;
	error: string | null;
	notice: string | null;
	notices: string[];
}

export async function testCompleteProjectTaskPlugin({
	source,
	sourceFileName,
	sourcePath,
	projectNotes = {},
	cursorLine = 0,
	selectionStartLine = null,
	selectionEndLine = null,
	projectsFolder = '1 Projekte',
	failTargetWrite = false
}: TestCompleteProjectTaskOptions): Promise<TestCompleteProjectTaskResult> {
	const normalizedSource = normalizeMarkdown(source);
	const listItems = parseMarkdownToListItems(normalizedSource) as ListItem[];

	let sourceContent = normalizedSource;
	const projectContents = new Map<string, string>();

	const settings: BulletFlowSettings = {
		...DEFAULT_SETTINGS,
		projectsFolder
	};

	for (const [name, content] of Object.entries(projectNotes)) {
		projectContents.set(name, normalizeMarkdown(content));
	}

	const hasSelection = selectionStartLine !== null && selectionEndLine !== null;
	const mockEditor = createMockEditor({
		content: sourceContent,
		cursor: { line: cursorLine, ch: 0 },
		selectionStart: hasSelection ? { line: selectionStartLine, ch: 0 } : null,
		selectionEnd: hasSelection ? { line: selectionEndLine, ch: 0 } : null
	});

	mockEditor.replaceRange = vi.fn((text: string, from: any, to: any) => {
		const lines = sourceContent.split('\n');
		const beforeLines = lines.slice(0, from.line);
		const afterLines = lines.slice(to.line);
		const newLines = text === '' ? [] : text.split('\n');
		sourceContent = [...beforeLines, ...newLines, ...afterLines].join('\n');
	});

	mockEditor.setLine = vi.fn((lineNum: number, text: string) => {
		const lines = sourceContent.split('\n');
		lines[lineNum] = text;
		sourceContent = lines.join('\n');
	});

	const fileCache: Record<string, any> = {
		[sourcePath]: { listItems }
	};

	const linkDests = new Map<string, any>();
	const allFiles: any[] = [];
	const mockSourceFile = createMockFile({
		path: sourcePath,
		basename: sourceFileName
	});
	allFiles.push(mockSourceFile);

	for (const [name, content] of Object.entries(projectNotes)) {
		const projectPath = `${projectsFolder}/${name}.md`;
		const targetLines = normalizeMarkdown(content).split('\n');
		const headings: any[] = [];
		targetLines.forEach((line, idx) => {
			const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
			if (headingMatch) {
				headings.push({
					level: headingMatch[1].length,
					heading: headingMatch[2],
					position: { start: { line: idx } }
				});
			}
		});
		fileCache[projectPath] = { headings };

		const projectFile = createMockFile({ path: projectPath, basename: name });
		allFiles.push(projectFile);
		linkDests.set(`${name}|${sourcePath}`, projectFile);
		linkDests.set(name, projectFile);
	}

	const mockVault = createMockVault({ files: allFiles });

	mockVault.getAbstractFileByPath = vi.fn((path: string) => {
		for (const file of allFiles) {
			if (file.path === path) return file;
		}
		return null;
	});

	mockVault.process = vi.fn(async (file: any, processFn: (data: string) => string) => {
		if (failTargetWrite) throw new Error('Simulated write failure');
		const projectName = file.basename;
		const currentContent = projectContents.get(projectName) || '';
		const newContent = await processFn(currentContent);
		projectContents.set(projectName, newContent);
		return newContent;
	});

	const mockMetadataCache = createMockMetadataCache({ fileCache, linkDests });
	const mockWorkspace = createMockWorkspace({
		editor: mockEditor,
		file: mockSourceFile
	});
	const mockApp = createMockApp({
		workspace: mockWorkspace,
		metadataCache: mockMetadataCache,
		vault: mockVault
	});

	const notices: string[] = [];
	const errors: string[] = [];
	vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn() } });

	const NoticeModule = await import('obsidian');
	const NoticeSpy = vi.spyOn(NoticeModule, 'Notice').mockImplementation(function(this: any, msg: string) {
		notices.push(msg);
		if (msg.includes('ERROR') || msg.includes('error')) {
			errors.push(msg);
		}
		this.message = msg;
		return this;
	} as any);

	const mockPlugin = {
		app: mockApp,
		settings
	} as unknown as BulletFlowPlugin;

	const { completeProjectTask } = await import('../../src/commands/completeProjectTask');
	await completeProjectTask(mockPlugin);

	NoticeSpy.mockRestore();

	return {
		source: normalizeMarkdown(sourceContent),
		project: (name: string) => {
			const content = projectContents.get(name);
			return content ? normalizeMarkdown(content) : null;
		},
		error: errors[0] || null,
		notice: notices[0] || null,
		notices
	};
}
```

- [ ] **Step 2: Write the failing integration tests**

`tests/integration/completeProjectTask.plugin.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { testCompleteProjectTaskPlugin } from '../helpers/completeProjectTaskPluginTestHelper';

describe('completeProjectTask', () => {
	describe('happy path', () => {
		it('marks the [<] copy done, logs to the project, and completes the daily task in place', async () => {
			const result = await testCompleteProjectTaskPlugin({
				source: `
- [ ] [[Migration Initiative]] Draft rollout plan
  - agreed on phased approach
`,
				sourceFileName: '2026-07-02 Thu',
				sourcePath: '+Diary/2026/07/2026-07-02 Thu.md',
				projectNotes: {
					'Migration Initiative': `
## Todo
- [<] Draft rollout plan

## Log
`
				},
				cursorLine: 0
			});

			// Source: task completed IN PLACE, children untouched
			expect(result.source).toContain('- [x] [[Migration Initiative]] Draft rollout plan');
			expect(result.source).toContain('agreed on phased approach');

			// Project: [<] copy flipped to [x]
			const project = result.project('Migration Initiative')!;
			expect(project).toContain('- [x] Draft rollout plan');
			expect(project).not.toContain('[<]');

			// Project: log entry with sub-heading, completed task line, and children copy
			expect(project).toContain('### [[2026-07-02 Thu]]');
			const logIdx = project.indexOf('## Log');
			expect(project.indexOf('### [[2026-07-02 Thu]]')).toBeGreaterThan(logIdx);
			expect(project.slice(logIdx)).toContain('- [x] Draft rollout plan');
			expect(project.slice(logIdx)).toContain('agreed on phased approach');
		});

		it('resolves the project from a Push [[Project]] collector ancestor', async () => {
			const result = await testCompleteProjectTaskPlugin({
				source: `
- [ ] Push [[Migration Initiative]]
	- [ ] Draft rollout plan
`,
				sourceFileName: '2026-07-02 Thu',
				sourcePath: '+Diary/2026/07/2026-07-02 Thu.md',
				projectNotes: {
					'Migration Initiative': `
## Todo
- [<] Draft rollout plan

## Log
`
				},
				cursorLine: 1
			});

			expect(result.source).toContain('- [x] Draft rollout plan');
			// Collector itself stays open
			expect(result.source).toContain('- [ ] Push [[Migration Initiative]]');

			const project = result.project('Migration Initiative')!;
			expect(project).toContain('- [x] Draft rollout plan');
			expect(project).toContain('### [[2026-07-02 Thu]]');
		});

		it('completes a started [/] task as [x] everywhere', async () => {
			const result = await testCompleteProjectTaskPlugin({
				source: `
- [/] [[Migration Initiative]] Draft rollout plan
`,
				sourceFileName: '2026-07-02 Thu',
				sourcePath: '+Diary/2026/07/2026-07-02 Thu.md',
				projectNotes: {
					'Migration Initiative': `
## Todo
- [<] Draft rollout plan

## Log
`
				},
				cursorLine: 0
			});

			expect(result.source).toContain('- [x] [[Migration Initiative]] Draft rollout plan');
			const project = result.project('Migration Initiative')!;
			expect(project.slice(project.indexOf('## Log'))).toContain('- [x] Draft rollout plan');
		});

		it('inserts new entries directly after the log heading (reverse-chronological)', async () => {
			const result = await testCompleteProjectTaskPlugin({
				source: `
- [ ] [[Migration Initiative]] Draft rollout plan
`,
				sourceFileName: '2026-07-02 Thu',
				sourcePath: '+Diary/2026/07/2026-07-02 Thu.md',
				projectNotes: {
					'Migration Initiative': `
## Todo
- [<] Draft rollout plan

## Log

### [[2026-07-01 Wed]]

- older entry
`
				},
				cursorLine: 0
			});

			const project = result.project('Migration Initiative')!;
			expect(project.indexOf('### [[2026-07-02 Thu]]')).toBeLessThan(project.indexOf('### [[2026-07-01 Wed]]'));
		});

		it('creates the log heading at the end of the file when missing', async () => {
			const result = await testCompleteProjectTaskPlugin({
				source: `
- [ ] [[Migration Initiative]] Draft rollout plan
`,
				sourceFileName: '2026-07-02 Thu',
				sourcePath: '+Diary/2026/07/2026-07-02 Thu.md',
				projectNotes: {
					'Migration Initiative': `
## Todo
- [<] Draft rollout plan
`
				},
				cursorLine: 0
			});

			const project = result.project('Migration Initiative')!;
			expect(project).toContain('## Log');
			expect(project.indexOf('## Log')).toBeGreaterThan(project.indexOf('## Todo'));
			expect(project.slice(project.indexOf('## Log'))).toContain('### [[2026-07-02 Thu]]');
		});

		it('re-indents copied children to the project note indent unit', async () => {
			const result = await testCompleteProjectTaskPlugin({
				source: `
- [ ] [[Migration Initiative]] Draft rollout plan
  - two-space child
`,
				sourceFileName: '2026-07-02 Thu',
				sourcePath: '+Diary/2026/07/2026-07-02 Thu.md',
				projectNotes: {
					'Migration Initiative': `
## Todo
- [<] Draft rollout plan
\t- tab-indented existing child

## Log
`
				},
				cursorLine: 0
			});

			const project = result.project('Migration Initiative')!;
			expect(project).toContain('\t- two-space child');
			expect(project).not.toContain('  - two-space child');
		});
	});

	describe('mismatches', () => {
		it('still logs and completes the source when no matching task exists in the project', async () => {
			const result = await testCompleteProjectTaskPlugin({
				source: `
- [ ] [[Migration Initiative]] Draft rollout plan
`,
				sourceFileName: '2026-07-02 Thu',
				sourcePath: '+Diary/2026/07/2026-07-02 Thu.md',
				projectNotes: {
					'Migration Initiative': `
## Todo
- [ ] Something unrelated

## Log
`
				},
				cursorLine: 0
			});

			expect(result.source).toContain('- [x] [[Migration Initiative]] Draft rollout plan');
			const project = result.project('Migration Initiative')!;
			expect(project).toContain('### [[2026-07-02 Thu]]');
			expect(project).toContain('- [ ] Something unrelated');
			expect(result.notices.some(n => n.includes('no matching task'))).toBe(true);
		});

		it('does not double-mark an already completed project copy', async () => {
			const result = await testCompleteProjectTaskPlugin({
				source: `
- [ ] [[Migration Initiative]] Draft rollout plan
`,
				sourceFileName: '2026-07-02 Thu',
				sourcePath: '+Diary/2026/07/2026-07-02 Thu.md',
				projectNotes: {
					'Migration Initiative': `
## Todo
- [x] Draft rollout plan

## Log
`
				},
				cursorLine: 0
			});

			expect(result.source).toContain('- [x] [[Migration Initiative]] Draft rollout plan');
			const project = result.project('Migration Initiative')!;
			// Only the Todo copy plus the log entry copy — no extra markings
			expect(project.slice(project.indexOf('## Log'))).toContain('- [x] Draft rollout plan');
			expect(result.notices.some(n => n.includes('already completed'))).toBe(true);
		});
	});

	describe('multi-select', () => {
		it('groups tasks per project with one sub-heading per project per run', async () => {
			const result = await testCompleteProjectTaskPlugin({
				source: `
- [ ] [[Migration Initiative]] Draft rollout plan
- [ ] [[Migration Initiative]] Write runbook
- [ ] [[Engineering Update]] Collect metrics
`,
				sourceFileName: '2026-07-02 Thu',
				sourcePath: '+Diary/2026/07/2026-07-02 Thu.md',
				projectNotes: {
					'Migration Initiative': `
## Todo
- [<] Draft rollout plan
- [<] Write runbook

## Log
`,
					'Engineering Update': `
## Todo
- [<] Collect metrics

## Log
`
				},
				selectionStartLine: 0,
				selectionEndLine: 2
			});

			expect(result.source).toContain('- [x] [[Migration Initiative]] Draft rollout plan');
			expect(result.source).toContain('- [x] [[Migration Initiative]] Write runbook');
			expect(result.source).toContain('- [x] [[Engineering Update]] Collect metrics');

			const migration = result.project('Migration Initiative')!;
			expect(migration.match(/### \[\[2026-07-02 Thu\]\]/g)).toHaveLength(1);
			const migrationLog = migration.slice(migration.indexOf('## Log'));
			expect(migrationLog).toContain('- [x] Draft rollout plan');
			expect(migrationLog).toContain('- [x] Write runbook');
			expect(migration).not.toContain('[<]');

			const engineering = result.project('Engineering Update')!;
			expect(engineering.slice(engineering.indexOf('## Log'))).toContain('- [x] Collect metrics');
		});
	});

	describe('validation and safety', () => {
		it('errors when cursor is not on an incomplete task', async () => {
			const result = await testCompleteProjectTaskPlugin({
				source: `
- [x] [[Migration Initiative]] Done task
`,
				sourceFileName: '2026-07-02 Thu',
				sourcePath: '+Diary/2026/07/2026-07-02 Thu.md',
				projectNotes: {
					'Migration Initiative': '## Todo'
				},
				cursorLine: 0
			});

			expect(result.notice).toContain('not on an incomplete task');
			expect(result.source).toContain('- [x] [[Migration Initiative]] Done task');
		});

		it('refuses to run inside a project note', async () => {
			const result = await testCompleteProjectTaskPlugin({
				source: `
- [ ] Draft rollout plan
`,
				sourceFileName: 'Migration Initiative',
				sourcePath: '1 Projekte/Migration Initiative.md',
				cursorLine: 0
			});

			expect(result.notice).toContain('Already in a project note');
		});

		it('notices when a task has no project link', async () => {
			const result = await testCompleteProjectTaskPlugin({
				source: `
- [ ] Task without any link
`,
				sourceFileName: '2026-07-02 Thu',
				sourcePath: '+Diary/2026/07/2026-07-02 Thu.md',
				cursorLine: 0
			});

			expect(result.notices.some(n => n.includes('No project link'))).toBe(true);
			expect(result.source).toContain('- [ ] Task without any link');
		});

		it('leaves the source untouched when the project write fails', async () => {
			const result = await testCompleteProjectTaskPlugin({
				source: `
- [ ] [[Migration Initiative]] Draft rollout plan
`,
				sourceFileName: '2026-07-02 Thu',
				sourcePath: '+Diary/2026/07/2026-07-02 Thu.md',
				projectNotes: {
					'Migration Initiative': `
## Todo
- [<] Draft rollout plan
`
				},
				cursorLine: 0,
				failTargetWrite: true
			});

			expect(result.source).toContain('- [ ] [[Migration Initiative]] Draft rollout plan');
			expect(result.error).toContain('Simulated write failure');
		});
	});
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- tests/integration/completeProjectTask.plugin.test.ts`
Expected: FAIL — cannot resolve `../../src/commands/completeProjectTask`.

- [ ] **Step 4: Implement the command**

`src/commands/completeProjectTask.ts`:

```typescript
import { Notice, TFile } from 'obsidian';
import type BulletFlowPlugin from '../main';
import {
	dedentLinesByAmount,
	extractTaskText,
	findMatchingTaskInSection,
	findSectionRange,
	parseTargetHeading,
	TaskMarker
} from '../utils/tasks';
import { findChildrenBlockFromListItems } from '../utils/listItems';
import { countIndent, detectIndentUnit, convertIndentUnit } from '../utils/indent';
import { getActiveMarkdownFile, getListItems, findSelectedTaskLines } from '../utils/commandSetup';
import { findProjectLinkInAncestors, isProjectNote } from '../utils/projects';
import { ObsidianLinkResolver } from '../utils/wikilinks';
import { NOTICE_TIMEOUT_ERROR } from '../config';

interface CompletionEntry {
	/** Task text without any [[Project]] prefix, for matching in the project note */
	taskText: string;
	/** Log entry lines: the [x] task line at zero indent plus its children */
	entryLines: string[];
}

/**
 * Complete a project task from the daily note (or any non-project note).
 *
 * Closes the project loop opened by takeProjectTask:
 * 1. In the project note: mark the matching Todo-section copy [x] and append
 *    a log entry (extract-log shape) copying the completed task and children.
 * 2. In the source note: mark the task [x] in place — children stay; in daily
 *    notes the auto-move extension carries it to the log as usual.
 *
 * Mismatches (no matching copy / already [x]) still log and complete the
 * source; the log is the paper trail, the [<] flip is best-effort.
 *
 * @param plugin - BulletFlow plugin instance
 */
export async function completeProjectTask(plugin: BulletFlowPlugin): Promise<void> {
	try {
		const context = getActiveMarkdownFile(plugin);
		if (!context) return;

		const { editor, file } = context;

		if (isProjectNote(file.path, plugin.settings)) {
			new Notice('Complete project task: Already in a project note.');
			return;
		}

		const listItems = getListItems(plugin, file);
		const resolver = new ObsidianLinkResolver(plugin.app.metadataCache, plugin.app.vault);

		const taskLines = findSelectedTaskLines(editor, listItems, 'Complete project task');
		if (!taskLines) return;

		// Phase 1: Collect (read-only). Group entries by project file. No source
		// lines are deleted, so line numbers stay valid in document order.
		const entriesByProject = new Map<string, { file: TFile; projectName: string; entries: CompletionEntry[] }>();
		const sourceCompletions: Array<{ taskLine: number; completedLine: string }> = [];

		for (const taskLine of taskLines) {
			const lineText = editor.getLine(taskLine);

			const projectLink = findProjectLinkInAncestors(
				editor,
				listItems,
				taskLine,
				file.path,
				resolver,
				plugin.settings
			);
			if (!projectLink) {
				new Notice(`Complete project task: No project link found for task on line ${taskLine + 1}.`);
				continue;
			}

			const projectFile = plugin.app.vault.getAbstractFileByPath(projectLink.link.path) as TFile;
			if (!projectFile) {
				new Notice(`Complete project task: Project note not found: ${projectLink.link.path}`);
				continue;
			}

			// Task text for matching: strip the [[Project]] prefix if present
			let taskText = extractTaskText(lineText);
			const linkPrefix = `[[${projectLink.link.basename}]] `;
			if (taskText.startsWith(linkPrefix)) {
				taskText = taskText.slice(linkPrefix.length);
			}

			// Log entry: the task line rendered [x] at zero indent, link stripped
			const parentIndent = countIndent(lineText);
			const marker = TaskMarker.fromLine(lineText);
			if (!marker) continue;
			const completedLine = marker.toCompleted().applyToLine(lineText);
			const strippedLine = TaskMarker.stripProjectLink(
				completedLine.slice(parentIndent),
				projectLink.link.basename
			);

			// All children are copied verbatim — this is a log entry, not a
			// transfer, so completed subtrees are part of the record too
			const children = findChildrenBlockFromListItems(editor, listItems, taskLine);
			let childLines = children ? children.lines.slice() : [];
			if (childLines.length > 0 && childLines[childLines.length - 1] === '') {
				childLines = childLines.slice(0, -1);
			}
			const entryLines = [strippedLine, ...dedentLinesByAmount(childLines, parentIndent)];

			const projectPath = projectLink.link.path;
			if (!entriesByProject.has(projectPath)) {
				entriesByProject.set(projectPath, {
					file: projectFile,
					projectName: projectLink.link.basename,
					entries: []
				});
			}
			entriesByProject.get(projectPath)!.entries.push({ taskText, entryLines });

			sourceCompletions.push({ taskLine, completedLine });
		}

		if (sourceCompletions.length === 0) return;

		// Phase 2: Write each project note — flip the Todo copy, append the log
		const todoHeading = plugin.settings.projectNoteTaskTargetHeading;
		const logHeading = plugin.settings.logExtractionTargetHeading;
		const { level: logLevel } = parseTargetHeading(logHeading);
		const subHeadingPrefix = '#'.repeat(logLevel + 1);
		const mismatches: string[] = [];

		for (const [, { file: projectFile, projectName, entries }] of entriesByProject) {
			await plugin.app.vault.process(projectFile, (data: string) => {
				let content = data;

				for (const entry of entries) {
					const match = findMatchingTaskInSection(content, entry.taskText, todoHeading);
					if (!match) {
						mismatches.push(`"${entry.taskText}" has no matching task in [[${projectName}]]`);
						continue;
					}
					if (match.state === 'completed') {
						mismatches.push(`"${entry.taskText}" is already completed in [[${projectName}]]`);
						continue;
					}
					const lines = content.split('\n');
					const lineMarker = TaskMarker.fromLine(lines[match.lineNumber]);
					if (!lineMarker) continue;
					lines[match.lineNumber] = lineMarker.toCompleted().applyToLine(lines[match.lineNumber]);
					content = lines.join('\n');
				}

				// Append the log entry after the heading (reverse-chronological),
				// re-rendered in the project note's own indent unit
				const contentLines = content.split('\n');
				const targetUnit = detectIndentUnit(contentLines);
				const rawEntryLines = entries.flatMap(e => e.entryLines);
				const entryLines = targetUnit ? convertIndentUnit(rawEntryLines, targetUnit) : rawEntryLines;
				const blockLines = ['', `${subHeadingPrefix} [[${file.basename}]]`, ''].concat(entryLines);

				const range = findSectionRange(contentLines, logHeading);
				if (range) {
					contentLines.splice(range.start + 1, 0, ...blockLines);
				} else {
					if (contentLines.length > 0 && contentLines[contentLines.length - 1].trim() !== '') {
						contentLines.push('');
					}
					contentLines.push(logHeading, ...blockLines);
				}
				return contentLines.join('\n');
			});
		}

		// Phase 3: Complete the source tasks in place
		for (const completion of sourceCompletions) {
			editor.setLine(completion.taskLine, completion.completedLine);
		}

		const count = sourceCompletions.length;
		const projectNames = [...entriesByProject.values()].map(p => `[[${p.projectName}]]`);
		const base = count === 1
			? `Complete project task: Task completed and logged to ${projectNames[0]}.`
			: `Complete project task: ${count} tasks completed and logged to ${projectNames.join(', ')}.`;
		if (mismatches.length > 0) {
			new Notice(`${base} Mismatches: ${mismatches.join('; ')}`, NOTICE_TIMEOUT_ERROR);
		} else {
			new Notice(base);
		}
	} catch (e: any) {
		new Notice(`Complete project task error: ${e.message}`, NOTICE_TIMEOUT_ERROR);
		console.error('completeProjectTask error:', e);
	}
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/integration/completeProjectTask.plugin.test.ts`
Expected: PASS. Then run the full suite: `npm test` → all pass.

- [ ] **Step 6: Commit**

```bash
git add src/commands/completeProjectTask.ts tests/helpers/completeProjectTaskPluginTestHelper.ts tests/integration/completeProjectTask.plugin.test.ts
git commit -m "feat: complete project task from the daily note"
```

---

### Task 3: Registration — command, hotkey `c`, CHANGELOG

**Goal:** Wire the command into `main.ts`, the leader-key modal (`c`), and document it for users.

**Files:**
- Modify: `src/config.ts:69-77` (`HOTKEY_BINDINGS`)
- Modify: `src/ui/HotkeyModal.ts:20-28` (`COMMAND_REGISTRY`)
- Modify: `src/main.ts` (register command after Drop Task to Project)
- Modify: `CHANGELOG.md` (new Unreleased section)
- Test: `tests/unit/hotkeyModal.test.ts`

**Acceptance Criteria:**
- [ ] `c` appears in the hotkey modal between `p` and `f` and invokes the command
- [ ] Command palette shows "Complete project task"
- [ ] hotkeyModal tests updated for 8 bindings
- [ ] CHANGELOG has a user-facing Unreleased entry

**Verify:** `npm test` → all pass; `npm run build` (if configured, else `npx tsc --noEmit`) → no type errors

**Steps:**

- [ ] **Step 1: Update the failing hotkey modal tests first**

In `tests/unit/hotkeyModal.test.ts`:

Add with the other command mocks:

```typescript
vi.mock('../../src/commands/completeProjectTask', () => ({
	completeProjectTask: vi.fn()
}));
```

```typescript
import { completeProjectTask } from '../../src/commands/completeProjectTask';
```

Add binding tests and update the counts:

```typescript
		it('should have binding for complete project task (c)', () => {
			const bindings = modal.getBindings();
			const completeBinding = bindings.find(b => b.key === 'c');

			expect(completeBinding).toBeDefined();
			expect(completeBinding?.label).toBe('Complete project task');
		});

		it('should have exactly 8 bindings', () => {
			const bindings = modal.getBindings();
			expect(bindings).toHaveLength(8);
		});
```

(Replace the existing `should have exactly 7 bindings` test with the 8-binding version.)

Update the key-registration expectation:

```typescript
			expect(modal.scope.keys).toHaveLength(8);
			expect(modal.scope.keys.map((k: any) => k.key)).toEqual(['m', 'd', 'u', 'x', 't', 'p', 'c', 'f']);
```

Add the execution test:

```typescript
		it('should execute completeProjectTask when c is pressed', () => {
			modal.open();

			const handler = modal.scope.keys.find((k: any) => k.key === 'c');
			const mockEvent = { preventDefault: vi.fn() } as unknown as KeyboardEvent;

			handler?.callback(mockEvent);

			expect(completeProjectTask).toHaveBeenCalledWith(mockPlugin);
		});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/unit/hotkeyModal.test.ts`
Expected: FAIL — no `c` binding, length 7 ≠ 8.

- [ ] **Step 3: Register everywhere**

`src/config.ts` — insert into `HOTKEY_BINDINGS` between `dropTaskToProject` and `finishProject`:

```typescript
	{ key: 'c', label: 'Complete project task', commandId: 'completeProjectTask' },
```

`src/ui/HotkeyModal.ts` — import and add to `COMMAND_REGISTRY`:

```typescript
import { completeProjectTask } from '../commands/completeProjectTask';
```

```typescript
	'completeProjectTask': completeProjectTask,
```

`src/main.ts` — import and register after the Drop Task to Project command:

```typescript
import { completeProjectTask } from './commands/completeProjectTask';
```

```typescript
		// Complete Project Task command
		this.addCommand({
			id: 'complete-project-task',
			name: 'Complete project task',
			callback: () => completeProjectTask(this)
		});
```

- [ ] **Step 4: CHANGELOG entry**

Insert after the header block in `CHANGELOG.md` (before `## [0.12.1]`):

```markdown
## [Unreleased]

### Added

- Complete project task: finishing a task taken into the daily note now closes
  the loop in one step — the project's `[<]` copy is marked done and a log
  entry with the task and its notes is added to the project note (`c` in the
  command menu)
```

- [ ] **Step 5: Run full verification**

Run: `npm test`
Expected: all tests pass.
Run: `npx tsc --noEmit -p tsconfig.json` (or `npm run build` if defined)
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/config.ts src/ui/HotkeyModal.ts src/main.ts CHANGELOG.md tests/unit/hotkeyModal.test.ts
git commit -m "feat: register complete project task command and hotkey"
```
