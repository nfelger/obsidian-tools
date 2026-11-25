import { describe, it, expect } from 'vitest';
import {
	buildProjectLink,
	effectiveAlias,
	mergeAliasIntoFrontmatter,
	projectNotePath,
	validateNewProjectInput
} from '../../src/utils/newProject';

describe('validateNewProjectInput', () => {
	it('trims both fields', () => {
		expect(validateNewProjectInput({ name: '  Website Relaunch ', alias: ' relaunch  ' }))
			.toEqual({ ok: true, value: { name: 'Website Relaunch', alias: 'relaunch' } });
	});

	it('rejects a blank name', () => {
		expect(validateNewProjectInput({ name: '   ', alias: 'x' }).ok).toBe(false);
	});

	it.each(['A/B', 'A\\B', 'A:B', 'A*B', 'A?B', 'A"B', 'A<B', 'A>B', 'A|B'])(
		'rejects %s, which cannot be a filename',
		name => {
			const result = validateNewProjectInput({ name, alias: '' });
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.error).toContain(name);
		}
	);
});

describe('effectiveAlias', () => {
	it('keeps a distinct alias', () => {
		expect(effectiveAlias('Website Relaunch', ' relaunch ')).toBe('relaunch');
	});

	it('drops a blank alias or one equal to the name', () => {
		expect(effectiveAlias('Website Relaunch', '  ')).toBeNull();
		expect(effectiveAlias('Website Relaunch', 'Website Relaunch')).toBeNull();
	});
});

describe('projectNotePath', () => {
	it('puts the note directly inside the projects folder', () => {
		expect(projectNotePath('1 Projekte', 'Website Relaunch')).toBe('1 Projekte/Website Relaunch.md');
		expect(projectNotePath('1 Projekte/', 'P')).toBe('1 Projekte/P.md');
	});
});

describe('buildProjectLink', () => {
	it('shows the alias when there is one', () => {
		expect(buildProjectLink('Website Relaunch', 'relaunch')).toBe('[[Website Relaunch|relaunch]]');
	});

	it('is a plain wikilink without an alias', () => {
		expect(buildProjectLink('Website Relaunch', null)).toBe('[[Website Relaunch]]');
	});
});

describe('mergeAliasIntoFrontmatter', () => {
	it('starts an aliases list', () => {
		const fm: Record<string, unknown> = {};
		mergeAliasIntoFrontmatter(fm, 'relaunch');
		expect(fm).toEqual({ aliases: ['relaunch'] });
	});

	it('appends to an existing list and keeps other keys', () => {
		const fm: Record<string, unknown> = { tags: ['project'], aliases: ['web'] };
		mergeAliasIntoFrontmatter(fm, 'relaunch');
		expect(fm).toEqual({ tags: ['project'], aliases: ['web', 'relaunch'] });
	});

	it('does not duplicate an alias already present', () => {
		const fm: Record<string, unknown> = { aliases: ['relaunch'] };
		mergeAliasIntoFrontmatter(fm, 'relaunch');
		expect(fm.aliases).toEqual(['relaunch']);
	});

	it('turns a single-string alias into a list', () => {
		const fm: Record<string, unknown> = { aliases: 'web' };
		mergeAliasIntoFrontmatter(fm, 'relaunch');
		expect(fm.aliases).toEqual(['web', 'relaunch']);
	});
});
