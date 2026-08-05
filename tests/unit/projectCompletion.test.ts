import { describe, it, expect } from 'vitest';
import { completionSubHeading, isCompletionLogged } from '../../src/utils/projectCompletion';

describe('completionSubHeading', () => {
	it('sits one level below the log heading', () => {
		expect(completionSubHeading('## Log', '2026-07-02 Thu')).toBe('### [[2026-07-02 Thu]]');
		expect(completionSubHeading('# Journal', '2026-07-02 Thu')).toBe('## [[2026-07-02 Thu]]');
	});
});

describe('isCompletionLogged', () => {
	const project = `
## Todo

- [<] Draft rollout plan

## Log

### [[2026-07-02 Thu]]

- [x] Draft rollout plan
	- agreed on phased approach
- [x] Reworded on the fly

### [[2026-07-01 Tue]]

- [x] Weekly report
`.trim();

	const logged = (taskText: string, subHeading = '### [[2026-07-02 Thu]]') =>
		isCompletionLogged(project, taskText, '## Log', subHeading);

	it('finds a completion under the source note sub-heading', () => {
		expect(logged('Draft rollout plan')).toBe(true);
		expect(logged('Reworded on the fly')).toBe(true);
	});

	it('does not match a completion filed under another day', () => {
		expect(logged('Weekly report')).toBe(false);
		expect(logged('Weekly report', '### [[2026-07-01 Tue]]')).toBe(true);
	});

	it('does not match a task that was never logged', () => {
		expect(logged('Something else entirely')).toBe(false);
		expect(logged('')).toBe(false);
	});

	it('does not match the live copy in the Todo section', () => {
		const onlyTodo = `
## Todo

- [<] Draft rollout plan

## Log
`.trim();
		expect(isCompletionLogged(onlyTodo, 'Draft rollout plan', '## Log', '### [[2026-07-02 Thu]]')).toBe(false);
	});

	it('returns false when the log heading or sub-heading is missing', () => {
		expect(isCompletionLogged('## Todo\n- [ ] Something', 'Something', '## Log', '### [[X]]')).toBe(false);
		expect(logged('Draft rollout plan', '### [[2026-08-05 Wed]]')).toBe(false);
	});
});
