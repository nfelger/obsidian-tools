import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/types';
import type { LinkResolver } from '../../src/types';
import { toggleProjectGrouping } from '../../src/utils/collectorToggle';

const resolver: LinkResolver = {
	resolve: (linkPath: string) => {
		const basename = linkPath.split('/').pop()!;
		if (['P', 'Other'].includes(basename)) {
			return { path: `1 Projekte/${basename}.md`, basename, extension: 'md', index: 0, matchText: '', inner: '' };
		}
		return null;
	}
};

const ctx = { sourcePath: '+Diary/2026-08-07 Fri.md', resolver, settings: DEFAULT_SETTINGS };

/**
 * Run the toggle on markdown written as a template string. A number is a bare
 * cursor; a pair is an inclusive selection range.
 */
function toggle(markdown: string, at: number | [number, number], settings = DEFAULT_SETTINGS) {
	const selection = typeof at === 'number' ? { start: at, end: at } : { start: at[0], end: at[1] };
	return toggleProjectGrouping(markdown.trim(), selection, { ...ctx, settings });
}

describe('toggleProjectGrouping — ungrouping a collector', () => {
	it('hoists each task child to top level, prefixed with the collector link', () => {
		const result = toggle(`
## Todo

- [ ] Push [[P]]
	- [ ] Ask Samir for numbers
	- [ ] Draft update
- [ ] Unrelated task
`, 2);

		expect(result).toMatchObject({ ok: true, direction: 'ungrouped', projectName: 'P', taskCount: 2 });
		expect((result as any).content).toBe(`## Todo

- [ ] [[P]] Ask Samir for numbers
- [ ] [[P]] Draft update
- [ ] Unrelated task`);
	});

	it('carries the collector alias into each prefix', () => {
		const result = toggle(`
- [ ] Push [[P|EU]]
	- [ ] Draft update
`, 0);

		expect((result as any).content).toBe('- [ ] [[P|EU]] Draft update');
	});

	it('keeps each task subtree with its task, dedented one level', () => {
		const result = toggle(`
- [ ] Push [[P]]
	- [ ] Ask Samir for numbers
		- he is out until Tuesday
		- [ ] chase the finance sheet
	- [ ] Draft update
`, 0);

		expect((result as any).content).toBe(`- [ ] [[P]] Ask Samir for numbers
	- he is out until Tuesday
	- [ ] chase the finance sheet
- [ ] [[P]] Draft update`);
	});

	it('hoists completed and migrated children too, so the group stays together', () => {
		const result = toggle(`
- [ ] Push [[P]]
	- [x] Ask Samir for numbers
	- [>] Draft update
	- [ ] Book the review
`, 0);

		expect((result as any).taskCount).toBe(3);
		expect((result as any).content).toBe(`- [x] [[P]] Ask Samir for numbers
- [>] [[P]] Draft update
- [ ] [[P]] Book the review`);
	});

	it('leaves non-task children under the collector, which stays', () => {
		const result = toggle(`
- [ ] Push [[P]]
	- rollout is blocked on legal
	- [ ] Draft update
`, 0);

		expect((result as any).taskCount).toBe(1);
		expect((result as any).content).toBe(`- [ ] Push [[P]]
	- rollout is blocked on legal
- [ ] [[P]] Draft update`);
	});

	it('keeps a blank line separating two task children', () => {
		const result = toggle(`
- [ ] Push [[P]]
	- [ ] Ask Samir for numbers

	- [ ] Draft update
`, 0);

		expect((result as any).content).toBe(`- [ ] [[P]] Ask Samir for numbers

- [ ] [[P]] Draft update`);
	});

	it('finds the collector from a cursor parked on a blank line inside its block', () => {
		const result = toggle(`
- [ ] Push [[P]]
	- [ ] Ask Samir for numbers

	- [ ] Draft update
`, 2);

		expect(result).toMatchObject({ direction: 'ungrouped', taskCount: 2 });
	});

	it('drops a blank line sitting directly under the collector', () => {
		const result = toggle(`
- [ ] Push [[P]]

	- [ ] Draft update
`, 0);

		expect((result as any).content).toBe('- [ ] [[P]] Draft update');
	});

	it('does not double-prefix a child that already carries the project prefix', () => {
		const result = toggle(`
- [ ] Push [[P]]
	- [ ] [[P]] Draft update
`, 0);

		expect((result as any).content).toBe('- [ ] [[P]] Draft update');
	});

	it('still prefixes a child carrying another project\'s link', () => {
		const result = toggle(`
- [ ] Push [[P]]
	- [ ] [[Other]] Filed here by mistake
`, 0);

		expect((result as any).content).toBe('- [ ] [[P]] [[Other]] Filed here by mistake');
	});

	it('treats a whitespace-only line between children as blank', () => {
		const result = toggle([
			'- [ ] Push [[P]]',
			'\t- [ ] Ask Samir for numbers',
			'\t',
			'\t- [ ] Draft update'
		].join('\n'), 0);

		expect((result as any).taskCount).toBe(2);
		expect((result as any).content).toBe(`- [ ] [[P]] Ask Samir for numbers

- [ ] [[P]] Draft update`);
	});

	it('works from the cursor on a child of the collector', () => {
		const result = toggle(`
- [ ] Push [[P]]
	- [ ] Ask Samir for numbers
	- [ ] Draft update
`, 2);

		expect(result).toMatchObject({ direction: 'ungrouped', taskCount: 2 });
	});

	it('works from the cursor on a note nested under a task child', () => {
		const result = toggle(`
- [ ] Push [[P]]
	- [ ] Ask Samir for numbers
		- he is out until Tuesday
`, 2);

		expect(result).toMatchObject({ direction: 'ungrouped', taskCount: 1 });
	});

	it('reports no tasks when the collector holds only notes', () => {
		const result = toggle(`
- [ ] Push [[P]]
	- rollout is blocked on legal
`, 0);

		expect(result).toEqual({ ok: false, reason: 'no-tasks' });
	});

	it('reports no tasks for a childless collector', () => {
		expect(toggle('- [ ] Push [[P]]', 0)).toEqual({ ok: false, reason: 'no-tasks' });
	});

	it('recognises a plain-bullet collector and a non-default keyword', () => {
		const settings = { ...DEFAULT_SETTINGS, projectKeywords: '"Advance"' };
		const result = toggle(`
- Advance [[P]]
	- [ ] Draft update
`, 0, settings);

		expect((result as any).content).toBe('- [ ] [[P]] Draft update');
	});
});

describe('toggleProjectGrouping — grouping prefixed tasks', () => {
	it('creates a collector at the first selected task and folds them under it', () => {
		const result = toggle(`
## Todo

- [ ] Unrelated task
- [ ] [[P]] Ask Samir for numbers
- [ ] [[Other]] Something else
- [ ] [[P]] Draft update
`, [3, 6]);

		expect(result).toMatchObject({ ok: true, direction: 'grouped', projectName: 'P', taskCount: 2 });
		expect((result as any).content).toBe(`## Todo

- [ ] Unrelated task
- [ ] Push [[P]]
	- [ ] Ask Samir for numbers
	- [ ] Draft update
- [ ] [[Other]] Something else`);
	});

	it('leaves the project\'s unselected tasks in the section alone', () => {
		const result = toggle(`
## Todo

- [ ] [[P]] Ask Samir for numbers
- [ ] [[P]] Draft update
- [ ] [[P]] Book the review
`, 2);

		expect((result as any).taskCount).toBe(1);
		expect((result as any).content).toBe(`## Todo

- [ ] Push [[P]]
	- [ ] Ask Samir for numbers
- [ ] [[P]] Draft update
- [ ] [[P]] Book the review`);
	});

	it('groups only what the selection covers', () => {
		const result = toggle(`
- [ ] [[P]] Ask Samir for numbers
- [ ] [[P]] Draft update
- [ ] [[P]] Book the review
`, [0, 1]);

		expect((result as any).taskCount).toBe(2);
		expect((result as any).content).toBe(`- [ ] Push [[P]]
	- [ ] Ask Samir for numbers
	- [ ] Draft update
- [ ] [[P]] Book the review`);
	});

	it('reaches a task through a child the selection covers', () => {
		const result = toggle(`
- [ ] [[P]] Ask Samir for numbers
	- he is out until Tuesday
- [ ] [[P]] Draft update
`, 1);

		expect((result as any).taskCount).toBe(1);
		expect((result as any).content).toBe(`- [ ] Push [[P]]
	- [ ] Ask Samir for numbers
		- he is out until Tuesday
- [ ] [[P]] Draft update`);
	});

	it('uses the first alias found and the first configured keyword', () => {
		const settings = { ...DEFAULT_SETTINGS, projectKeywords: '"Advance", "Finish"' };
		const result = toggle(`
- [ ] [[P]] Ask Samir for numbers
- [ ] [[P|EU]] Draft update
`, [0, 1], settings);

		expect((result as any).content).toBe(`- [ ] Advance [[P|EU]]
	- [ ] Ask Samir for numbers
	- [ ] Draft update`);
	});

	it('falls back to "Push" when no keywords are configured', () => {
		const settings = { ...DEFAULT_SETTINGS, projectKeywords: '' };
		const result = toggle('- [ ] [[P]] Draft update', 0, settings);

		expect((result as any).content).toBe(`- [ ] Push [[P]]
	- [ ] Draft update`);
	});

	it('folds into an existing collector rather than creating a second one', () => {
		const result = toggle(`
- [ ] Push [[P]]
	- [ ] Ask Samir for numbers
- [ ] [[P]] Draft update
`, 2);

		expect(result).toMatchObject({ direction: 'grouped', taskCount: 1 });
		expect((result as any).content).toBe(`- [ ] Push [[P]]
	- [ ] Ask Samir for numbers
	- [ ] Draft update`);
	});

	it('folds a stray written above the existing collector down into it', () => {
		const result = toggle(`
- [ ] [[P]] Draft update
- [ ] Push [[P]]
	- [ ] Ask Samir for numbers
`, 0);

		expect((result as any).content).toBe(`- [ ] Push [[P]]
	- [ ] Ask Samir for numbers
	- [ ] Draft update`);
	});

	it('groups completed and migrated copies alongside the live ones', () => {
		const result = toggle(`
- [x] [[P]] Ask Samir for numbers
- [ ] [[P]] Draft update
`, [0, 1]);

		expect((result as any).taskCount).toBe(2);
		expect((result as any).content).toBe(`- [ ] Push [[P]]
	- [x] Ask Samir for numbers
	- [ ] Draft update`);
	});

	it('carries each task subtree under the collector', () => {
		const result = toggle(`
- [ ] [[P]] Ask Samir for numbers
	- he is out until Tuesday
`, 0);

		expect((result as any).content).toBe(`- [ ] Push [[P]]
	- [ ] Ask Samir for numbers
		- he is out until Tuesday`);
	});

	it('groups a single task when that is all the section has', () => {
		const result = toggle('- [ ] [[P]] Draft update', 0);

		expect(result).toMatchObject({ direction: 'grouped', taskCount: 1 });
		expect((result as any).content).toBe(`- [ ] Push [[P]]
	- [ ] Draft update`);
	});

	it('never crosses a heading boundary', () => {
		const result = toggle(`
## Todo

- [ ] [[P]] Ask Samir for numbers

### Later

- [ ] [[P]] Draft update
`, 2);

		expect((result as any).taskCount).toBe(1);
		expect((result as any).content).toBe(`## Todo

- [ ] Push [[P]]
	- [ ] Ask Samir for numbers

### Later

- [ ] [[P]] Draft update`);
	});

	it('leaves a prefixed task nested under something else where it is', () => {
		const result = toggle(`
- [ ] Some parent
	- [ ] [[P]] Nested copy
- [ ] [[P]] Draft update
`, 2);

		expect((result as any).taskCount).toBe(1);
		expect((result as any).content).toBe(`- [ ] Some parent
	- [ ] [[P]] Nested copy
- [ ] Push [[P]]
	- [ ] Draft update`);
	});

	it('matches by link target, so a path-form link groups with a plain one', () => {
		const result = toggle(`
- [ ] [[1 Projekte/P]] Ask Samir for numbers
- [ ] [[P]] Draft update
`, [0, 1]);

		expect((result as any).taskCount).toBe(2);
	});

	it('renders the group in the note\'s own indent unit', () => {
		const result = toggle(`
- [ ] Some parent
  - a two-space note
- [ ] [[P]] Draft update
`, 2);

		expect((result as any).content).toBe(`- [ ] Some parent
  - a two-space note
- [ ] Push [[P]]
  - [ ] Draft update`);
	});
});

describe('toggleProjectGrouping — a collector gathers before it dissolves', () => {
	const halfGrouped = `## Todo

- [ ] Push [[P]]
	- [ ] Ask Samir for numbers
- [ ] [[P]] Draft update
- [ ] Unrelated task`;

	it('first press folds the project\'s loose tasks under the collector', () => {
		const result = toggle(halfGrouped, 2);

		expect(result).toMatchObject({ ok: true, direction: 'grouped', projectName: 'P', taskCount: 1 });
		expect((result as any).content).toBe(`## Todo

- [ ] Push [[P]]
	- [ ] Ask Samir for numbers
	- [ ] Draft update
- [ ] Unrelated task`);
	});

	it('second press ungroups everything, the gathered task included', () => {
		const gathered = (toggle(halfGrouped, 2) as any).content;
		const result = toggleProjectGrouping(gathered, { start: 2, end: 2 }, ctx);

		expect(result).toMatchObject({ ok: true, direction: 'ungrouped', taskCount: 2 });
		expect((result as any).content).toBe(`## Todo

- [ ] [[P]] Ask Samir for numbers
- [ ] [[P]] Draft update
- [ ] Unrelated task`);
	});

	it('gathers every loose task for the project, not just the selected one', () => {
		const result = toggle(`
- [ ] Push [[P]]
	- [ ] First
- [ ] [[P]] Second
- [ ] [[P|EU]] Third
`, 0);

		expect(result).toMatchObject({ direction: 'grouped', taskCount: 2 });
		expect((result as any).content).toBe(`- [ ] Push [[P]]
	- [ ] First
	- [ ] Second
	- [ ] Third`);
	});

	it('gathers terminal copies too, so the group keeps its history', () => {
		const result = toggle(`
- [ ] Push [[P]]
	- [ ] Live
- [x] [[P]] Done earlier
`, 0);

		expect((result as any).content).toBe(`- [ ] Push [[P]]
	- [ ] Live
	- [x] Done earlier`);
	});

	it('fills a childless collector instead of reporting nothing to ungroup', () => {
		const result = toggle(`
- [ ] Push [[P]]
- [ ] [[P]] Draft update
`, 0);

		expect(result).toMatchObject({ ok: true, direction: 'grouped' });
		expect((result as any).content).toBe(`- [ ] Push [[P]]
	- [ ] Draft update`);
	});

	it('does not reach a loose task on the far side of a heading', () => {
		const result = toggle(`
## Todo

- [ ] Push [[P]]
	- [ ] Ask Samir for numbers

### Someday

- [ ] [[P]] Later idea
`, 2);

		expect(result).toMatchObject({ direction: 'ungrouped' });
		expect((result as any).content).toContain('### Someday\n\n- [ ] [[P]] Later idea');
	});
});

describe('toggleProjectGrouping — round trip', () => {
	const grouped = `- [ ] Push [[P|EU]]
	- [ ] Ask Samir for numbers
	- [x] Draft update`;

	it('ungroup then group restores the original', () => {
		const ungrouped = toggle(grouped, 0);
		expect((ungrouped as any).content).toBe(`- [ ] [[P|EU]] Ask Samir for numbers
- [x] [[P|EU]] Draft update`);

		const regrouped = toggleProjectGrouping((ungrouped as any).content, { start: 0, end: 1 }, ctx);
		expect((regrouped as any).content).toBe(grouped);
	});
});

describe('toggleProjectGrouping — nothing to toggle', () => {
	it('reports no project task for a plain task', () => {
		expect(toggle('- [ ] Buy milk', 0)).toEqual({ ok: false, reason: 'no-project-task' });
	});

	it('reports no project task for a link that is not a project note', () => {
		expect(toggle('- [ ] [[Some Note]] Draft update', 0)).toEqual({ ok: false, reason: 'no-project-task' });
	});

	it('reports no project task for a mid-line project link', () => {
		expect(toggle('- [ ] Ask about [[P]] tomorrow', 0)).toEqual({ ok: false, reason: 'no-project-task' });
	});

	it('reports no project task for a heading', () => {
		expect(toggle('## Todo', 0)).toEqual({ ok: false, reason: 'no-project-task' });
	});

	it('reports no project task for a cursor line outside the document', () => {
		const source = '- [ ] [[P]] Draft update';

		expect(toggle(source, 7)).toEqual({ ok: false, reason: 'no-project-task' });
		// One past the last line, and before the first
		expect(toggle(source, 1)).toEqual({ ok: false, reason: 'no-project-task' });
		expect(toggle(source, -1)).toEqual({ ok: false, reason: 'no-project-task' });
	});

	it('refuses a collector with nothing above it to hang from', () => {
		// Indented with no parent above it — malformed, but the toggle must
		// not treat it as top-level.
		const result = toggleProjectGrouping(
			'\t- [ ] Push [[P]]\n\t\t- [ ] Draft update',
			{ start: 0, end: 0 },
			ctx
		);

		expect(result).toEqual({ ok: false, reason: 'nested' });
	});

	it('reports no match when the task links through an alias the section does not name', () => {
		// [[Codename]] resolves to the project note, but matching in the
		// section goes by link-target basename, which no task carries.
		const aliasResolver: LinkResolver = {
			resolve: (linkPath: string) =>
				linkPath === 'Codename'
					? { path: '1 Projekte/P.md', basename: 'P', extension: 'md', index: 0, matchText: '', inner: '' }
					: null
		};

		const result = toggleProjectGrouping('- [ ] [[Codename]] Draft update', { start: 0, end: 0 }, {
			...ctx,
			resolver: aliasResolver
		});

		expect(result).toEqual({ ok: false, reason: 'no-matching-tasks' });
	});

	it('refuses a nested collector', () => {
		const result = toggle(`
- [ ] Some parent
	- [ ] Push [[P]]
		- [ ] Draft update
`, 1);

		expect(result).toEqual({ ok: false, reason: 'nested' });
	});

	it('refuses a nested prefixed task', () => {
		const result = toggle(`
- [ ] Some parent
	- [ ] [[P]] Draft update
`, 1);

		expect(result).toEqual({ ok: false, reason: 'nested' });
	});
});

describe('toggleProjectGrouping — rewritten range', () => {
	it('spans the body of the slice around the cursor', () => {
		const result = toggle(`
## Todo

- [ ] [[P]] Draft update

## Log

- something else
`, 2);

		expect((result as any).range).toEqual({ start: 1, end: 4 });
	});

	it('starts at line 0 when no heading precedes the cursor', () => {
		const result = toggle('- [ ] [[P]] Draft update', 0);

		expect((result as any).range).toEqual({ start: 0, end: 1 });
	});
});
