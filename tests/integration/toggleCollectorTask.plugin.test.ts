import { describe, it, expect, beforeEach, vi } from 'vitest';
import { testToggleCollectorTaskPlugin } from '../helpers/toggleCollectorTaskPluginTestHelper';

describe('toggleCollectorTask — ungrouping', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('flattens a collector into individually prefixed tasks', async () => {
		const result = await testToggleCollectorTaskPlugin({
			source: `
## Todo

- [ ] Push [[Migration Initiative]]
	- [ ] Ask Samir for cost estimates
	- [ ] Draft the rollback plan
- [ ] Book the retro

## Log

- morning standup
`,
			cursorLine: 2
		});

		expect(result.source).toBe(`## Todo

- [ ] [[Migration Initiative]] Ask Samir for cost estimates
- [ ] [[Migration Initiative]] Draft the rollback plan
- [ ] Book the retro

## Log

- morning standup`);
		expect(result.notice).toBe(
			'Toggle collector task: 2 tasks ungrouped from Migration Initiative.'
		);
	});

	it('flattens from the cursor on one of the collector\'s children', async () => {
		const result = await testToggleCollectorTaskPlugin({
			source: `
## Todo

- [ ] Push [[Migration Initiative|MI]]
	- [ ] Ask Samir for cost estimates
		- he is out until Tuesday
	- [ ] Draft the rollback plan
`,
			cursorLine: 4
		});

		expect(result.source).toBe(`## Todo

- [ ] [[Migration Initiative|MI]] Ask Samir for cost estimates
	- he is out until Tuesday
- [ ] [[Migration Initiative|MI]] Draft the rollback plan`);
	});

	it('leaves notes under the collector and hoists only the tasks', async () => {
		const result = await testToggleCollectorTaskPlugin({
			source: `
## Todo

- [ ] Push [[Migration Initiative]]
	- rollout is blocked on legal review
	- [ ] Draft the rollback plan
`,
			cursorLine: 2
		});

		expect(result.source).toBe(`## Todo

- [ ] Push [[Migration Initiative]]
	- rollout is blocked on legal review
- [ ] [[Migration Initiative]] Draft the rollback plan`);
		expect(result.notice).toBe(
			'Toggle collector task: 1 task ungrouped from Migration Initiative.'
		);
	});

	it('reports a collector with nothing to ungroup', async () => {
		const result = await testToggleCollectorTaskPlugin({
			source: `
## Todo

- [ ] Push [[Migration Initiative]]
`,
			cursorLine: 2
		});

		expect(result.source).toBe(`## Todo

- [ ] Push [[Migration Initiative]]`);
		expect(result.notice).toBe('Toggle collector task: Collector has no tasks to ungroup.');
	});
});

describe('toggleCollectorTask — grouping', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('folds the selected prefixed tasks under a new collector', async () => {
		const result = await testToggleCollectorTaskPlugin({
			source: `
## Todo

- [ ] Book the retro
- [ ] [[Migration Initiative]] Ask Samir for cost estimates
- [ ] [[Engineering Update]] Send the draft
- [ ] [[Migration Initiative|MI]] Draft the rollback plan

## Log

- morning standup
`,
			cursorLine: 3,
			selectionStartLine: 3,
			selectionEndLine: 5,
			projects: ['Migration Initiative', 'Engineering Update']
		});

		expect(result.source).toBe(`## Todo

- [ ] Book the retro
- [ ] Push [[Migration Initiative|MI]]
	- [ ] Ask Samir for cost estimates
	- [ ] Draft the rollback plan
- [ ] [[Engineering Update]] Send the draft

## Log

- morning standup`);
		expect(result.notice).toBe(
			'Toggle collector task: 2 tasks grouped under Migration Initiative.'
		);
	});

	it('leaves the project\'s other tasks where the user left them', async () => {
		const result = await testToggleCollectorTaskPlugin({
			source: `
## Todo

- [ ] [[Migration Initiative]] Ask Samir for cost estimates
- [ ] [[Migration Initiative]] Draft the rollback plan
- [ ] [[Migration Initiative]] Book the retro
`,
			cursorLine: 3
		});

		expect(result.source).toBe(`## Todo

- [ ] [[Migration Initiative]] Ask Samir for cost estimates
- [ ] Push [[Migration Initiative]]
	- [ ] Draft the rollback plan
- [ ] [[Migration Initiative]] Book the retro`);
		expect(result.notice).toBe(
			'Toggle collector task: 1 task grouped under Migration Initiative.'
		);
	});

	it('folds into the collector the section already has', async () => {
		const result = await testToggleCollectorTaskPlugin({
			source: `
## Todo

- [ ] Push [[Migration Initiative]]
	- [ ] Ask Samir for cost estimates
- [ ] [[Migration Initiative]] Draft the rollback plan
`,
			cursorLine: 4
		});

		expect(result.source).toBe(`## Todo

- [ ] Push [[Migration Initiative]]
	- [ ] Ask Samir for cost estimates
	- [ ] Draft the rollback plan`);
	});

	it('keeps tasks in the sub-section they were written in', async () => {
		const result = await testToggleCollectorTaskPlugin({
			source: `
## Todo

- [ ] [[Migration Initiative]] Ask Samir for cost estimates

### Later

- [ ] [[Migration Initiative]] Draft the rollback plan
`,
			cursorLine: 2,
			selectionStartLine: 0,
			selectionEndLine: 6
		});

		expect(result.source).toBe(`## Todo

- [ ] Push [[Migration Initiative]]
	- [ ] Ask Samir for cost estimates

### Later

- [ ] [[Migration Initiative]] Draft the rollback plan`);
	});

	it('uses the first configured keyword', async () => {
		const result = await testToggleCollectorTaskPlugin({
			source: '- [ ] [[Migration Initiative]] Draft the rollback plan',
			cursorLine: 0,
			projectKeywords: '"Advance", "Finish"'
		});

		expect(result.source).toBe(`- [ ] Advance [[Migration Initiative]]
	- [ ] Draft the rollback plan`);
	});
});

describe('toggleCollectorTask — round trip', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns the note to its original shape', async () => {
		const grouped = `## Todo

- [ ] Push [[Migration Initiative|MI]]
	- [ ] Ask Samir for cost estimates
	- [x] Draft the rollback plan
- [ ] Book the retro`;

		const ungrouped = await testToggleCollectorTaskPlugin({ source: grouped, cursorLine: 2 });
		expect(ungrouped.source).toBe(`## Todo

- [ ] [[Migration Initiative|MI]] Ask Samir for cost estimates
- [x] [[Migration Initiative|MI]] Draft the rollback plan
- [ ] Book the retro`);

		const regrouped = await testToggleCollectorTaskPlugin({
			source: ungrouped.source,
			cursorLine: 2,
			selectionStartLine: 2,
			selectionEndLine: 3
		});
		expect(regrouped.source).toBe(grouped);
	});
});

describe('toggleCollectorTask — nothing to toggle', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('leaves a plain task alone', async () => {
		const result = await testToggleCollectorTaskPlugin({
			source: `
## Todo

- [ ] Book the retro
`,
			cursorLine: 2
		});

		expect(result.source).toBe(`## Todo

- [ ] Book the retro`);
		expect(result.notice).toBe('Toggle collector task: Cursor is not on a project task or collector.');
	});

	it('leaves a link that is not a project note alone', async () => {
		const result = await testToggleCollectorTaskPlugin({
			source: '- [ ] [[Some Note]] Read this',
			cursorLine: 0
		});

		expect(result.source).toBe('- [ ] [[Some Note]] Read this');
		expect(result.notice).toBe('Toggle collector task: Cursor is not on a project task or collector.');
	});

	it('refuses to restructure a nested project task', async () => {
		const result = await testToggleCollectorTaskPlugin({
			source: `
## Todo

- [ ] Prepare the review
	- [ ] [[Migration Initiative]] Ask Samir for cost estimates
`,
			cursorLine: 3
		});

		expect(result.source).toBe(`## Todo

- [ ] Prepare the review
	- [ ] [[Migration Initiative]] Ask Samir for cost estimates`);
		expect(result.notice).toBe(
			'Toggle collector task: Only top-level collectors and project tasks can be toggled.'
		);
	});
});
