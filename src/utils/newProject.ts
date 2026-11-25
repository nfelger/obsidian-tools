/**
 * Pure parts of the New project command: input validation, the project
 * note's path, the link inserted at the cursor and the alias merge.
 */

import type { NewProjectInput } from '../types';

/** Characters a project name cannot hold, because it becomes a filename. */
const INVALID_NAME_CHARS = /[/\\:*?"<>|]/;

/**
 * Trim the form's fields and check the full name can be a filename.
 *
 * @returns The trimmed input, or an error message for a notice
 */
export function validateNewProjectInput(
	input: NewProjectInput
): { ok: true; value: NewProjectInput } | { ok: false; error: string } {
	const name = input.name.trim();
	const alias = input.alias.trim();
	if (!name) return { ok: false, error: 'Project name is empty.' };
	if (INVALID_NAME_CHARS.test(name)) {
		return { ok: false, error: `"${name}" contains characters a filename can't hold (/ \\ : * ? " < > |).` };
	}
	return { ok: true, value: { name, alias } };
}

/** The alias worth recording: blank or the full name itself means none. */
export function effectiveAlias(name: string, alias: string): string | null {
	const trimmed = alias.trim();
	return trimmed && trimmed !== name ? trimmed : null;
}

/** Vault path of a project note directly inside the projects folder. */
export function projectNotePath(projectsFolder: string, name: string): string {
	const folder = projectsFolder.replace(/\/+$/, '');
	return folder ? `${folder}/${name}.md` : `${name}.md`;
}

/**
 * The wikilink inserted at the cursor: `[[target|alias]]`, or `[[target]]`
 * when there is no alias worth showing.
 */
export function buildProjectLink(linkTarget: string, alias: string | null): string {
	return alias ? `[[${linkTarget}|${alias}]]` : `[[${linkTarget}]]`;
}

/**
 * Add an alias to a frontmatter object's `aliases` list in place, keeping
 * aliases already there and never duplicating one.
 */
export function mergeAliasIntoFrontmatter(frontmatter: Record<string, unknown>, alias: string): void {
	const existing = frontmatter.aliases;
	const list: unknown[] = Array.isArray(existing)
		? [...existing]
		: typeof existing === 'string' && existing.trim() ? [existing] : [];
	if (!list.includes(alias)) list.push(alias);
	frontmatter.aliases = list;
}
