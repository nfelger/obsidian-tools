import { describe, it, expect } from 'vitest';
import { addCompletedDate, formatDate } from '../../src/commands/finishProject';

describe('formatDate', () => {
	it('formats a date as YYYY-MM-DD', () => {
		expect(formatDate(new Date(2026, 1, 18))).toBe('2026-02-18');
	});

	it('zero-pads single-digit month and day', () => {
		expect(formatDate(new Date(2026, 0, 5))).toBe('2026-01-05');
	});

	it('handles December correctly', () => {
		expect(formatDate(new Date(2025, 11, 31))).toBe('2025-12-31');
	});
});

describe('addCompletedDate', () => {
	it('creates frontmatter when none exists', () => {
		const content = `# My Project

Some content here.`;

		const result = addCompletedDate(content, '2026-02-18');

		expect(result).toBe(`---
completed: 2026-02-18
---
# My Project

Some content here.`);
	});

	it('appends to existing frontmatter', () => {
		const content = `---
tags: project
---
# My Project

Some content here.`;

		const result = addCompletedDate(content, '2026-02-18');

		expect(result).toBe(`---
tags: project
completed: 2026-02-18
---
# My Project

Some content here.`);
	});

	it('updates existing completed date', () => {
		const content = `---
completed: 2025-01-01
tags: project
---
# My Project`;

		const result = addCompletedDate(content, '2026-02-18');

		expect(result).toBe(`---
completed: 2026-02-18
tags: project
---
# My Project`);
	});

	it('handles empty content', () => {
		const result = addCompletedDate('', '2026-02-18');

		expect(result).toBe(`---
completed: 2026-02-18
---
`);
	});

	it('preserves content after frontmatter', () => {
		const content = `---
status: active
---
# Project

- [ ] Task 1
- [ ] Task 2`;

		const result = addCompletedDate(content, '2026-02-18');

		expect(result).toContain('completed: 2026-02-18');
		expect(result).toContain('status: active');
		expect(result).toContain('- [ ] Task 1');
		expect(result).toContain('- [ ] Task 2');
	});
});
