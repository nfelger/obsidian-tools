/**
 * Toggle one project's tasks between the two shapes the consolidation rules
 * already produce: grouped under a collector (`- [ ] Push [[Project]]` with
 * bare task children) or flattened into individually prefixed tasks
 * (`- [ ] [[Project]] Task`).
 *
 * Both directions are text transformations confined to the innermost
 * heading-delimited slice around the cursor — the same boundary insertion
 * respects, so a toggle never moves a task across a heading. This is the only
 * place a collector is created, filled or removed: commands that bring tasks
 * into a note always leave them individually prefixed.
 */

import type { BulletFlowSettings, LinkResolver } from '../types';
import { countIndent } from './indent';
import {
	TaskMarker,
	dedentLinesByAmount,
	extractTaskText,
	findSliceRange,
	findTaskBlockEnd
} from './tasks';
import {
	detectCollectorContext,
	detectProjectContext,
	findCollector,
	findPrefixedProjectTasks,
	foldIntoCollector,
	groupUnderNewCollector,
	linkTargetBasename,
	parseProjectKeywords,
	parseProjectPrefix,
	renderCollectorLine
} from './projects';

export interface ToggleContext {
	/** Path of the note being toggled, for link resolution */
	sourcePath: string;
	resolver: LinkResolver;
	settings: BulletFlowSettings;
}

/** Inclusive line range the user has selected; start === end for a cursor. */
export interface Selection {
	start: number;
	end: number;
}

export type ToggleFailureReason =
	/** The cursor is not on a collector or a project task */
	| 'no-project-task'
	/** The collector or task sits under another item */
	| 'nested'
	/** A collector with no task children to ungroup */
	| 'no-tasks'
	/**
	 * Nothing in the section matched the project by link-target basename —
	 * reachable when the cursor's task links through a frontmatter alias,
	 * which resolves to the project but does not name it.
	 */
	| 'no-matching-tasks';

export interface ToggleSuccess {
	ok: true;
	content: string;
	direction: 'grouped' | 'ungrouped';
	projectName: string;
	/** Tasks that changed shape */
	taskCount: number;
	/** Body of the slice the toggle rewrote, [start, end) in the input */
	range: { start: number; end: number };
}

export type ToggleResult = ToggleSuccess | { ok: false; reason: ToggleFailureReason };

type ToggleTarget =
	| { kind: 'collector'; line: number; projectName: string; linkText: string }
	| { kind: 'task'; line: number; projectName: string }
	| { kind: 'none'; reason: ToggleFailureReason };

/**
 * The top-level (zero-indent) line the cursor's block hangs from, or -1 when
 * nothing precedes it. Blank lines are skipped — a list block may contain them
 * between children.
 */
function findTopLevelRoot(lines: string[], line: number): number {
	for (let i = line; i >= 0; i--) {
		if (lines[i].trim() === '') continue;
		if (countIndent(lines[i]) === 0) return i;
	}
	return -1;
}

/**
 * Read a line as one end of the toggle: a collector for a resolvable project,
 * or a task carrying its own project prefix. Anything else is neither.
 */
function classifyLine(lines: string[], line: number, ctx: ToggleContext): ToggleTarget | null {
	const collector = detectCollectorContext(lines[line], ctx.sourcePath, ctx.resolver, ctx.settings);
	if (collector) {
		return { kind: 'collector', line, projectName: collector.projectName, linkText: collector.linkText };
	}

	const editor = { getLine: (n: number) => lines[n] };
	const project = detectProjectContext(editor, [], line, ctx.sourcePath, ctx.resolver, ctx.settings);
	if (project?.hasOwnPrefix) {
		return { kind: 'task', line, projectName: project.projectName };
	}

	return null;
}

/**
 * Clamp a selection to lines that exist. Every lookup downstream indexes
 * `lines` directly, so this is what keeps a cursor past the end (or a
 * negative one) from reading undefined.
 */
function clampToDocument(lines: string[], selection: Selection): Selection {
	return {
		start: Math.max(0, selection.start),
		end: Math.min(lines.length - 1, selection.end)
	};
}

/**
 * The top-level lines the selection reaches into — a line's own root when it
 * is nested, itself when it is already top-level. This is the set the toggle
 * acts on: selecting a task's note child selects that task.
 */
function selectedRoots(lines: string[], selection: Selection): Set<number> {
	const { start, end } = clampToDocument(lines, selection);
	const roots = new Set<number>();
	for (let i = start; i <= end; i++) {
		const root = findTopLevelRoot(lines, i);
		if (root >= 0) roots.add(root);
	}
	return roots;
}

/**
 * Decide what the selection is pointing at: the first selected line that
 * reads as a collector or a project task wins. A cursor anywhere inside a
 * collector's block picks that collector, so the user need not land on the
 * collector line itself.
 */
function detectToggleTarget(lines: string[], selection: Selection, ctx: ToggleContext): ToggleTarget {
	const { start, end } = clampToDocument(lines, selection);

	for (let i = start; i <= end; i++) {
		const root = findTopLevelRoot(lines, i);
		if (root < 0) continue;
		const target = classifyLine(lines, root, ctx);
		if (target) return target;
	}

	// A collector or prefixed task the selection covers directly, but nested
	// under something else: regrouping it would restructure a hierarchy that
	// isn't this project's to reshape.
	for (let i = start; i <= end; i++) {
		if (classifyLine(lines, i, ctx)) return { kind: 'none', reason: 'nested' };
	}

	return { kind: 'none', reason: 'no-project-task' };
}

/**
 * Split a collector's children into direct-child groups: each is one direct
 * child plus its own descendants. Blank lines stay with the group they follow.
 */
function splitDirectChildGroups(lines: string[], start: number, end: number): string[][] {
	const groups: string[][] = [];
	let baseIndent: number | null = null;

	for (let i = start; i < end; i++) {
		const line = lines[i];
		if (line.trim() === '') {
			if (groups.length > 0) groups[groups.length - 1].push(line);
			continue;
		}
		// The first non-blank child sets the direct-child depth, so it always
		// opens a group; anything deeper belongs to the group above it.
		if (baseIndent === null) baseIndent = countIndent(line);
		if (countIndent(line) <= baseIndent) {
			groups.push([line]);
		} else {
			groups[groups.length - 1].push(line);
		}
	}

	return groups;
}

/**
 * Prefix a hoisted task with the collector's link, unless it already carries
 * a prefix for the same project (someone wrote one by hand under the
 * collector).
 */
function addProjectPrefix(line: string, linkText: string, projectName: string): string {
	const prefix = parseProjectPrefix(extractTaskText(line));
	if (prefix && linkTargetBasename(prefix.linkTarget) === projectName) return line;
	return TaskMarker.prependToContent(line, linkText);
}

type Transformed = { content: string; taskCount: number } | { reason: ToggleFailureReason };

/**
 * Hoist a collector's task children to the collector's own level, each
 * carrying the collector's link as its prefix — completed and migrated ones
 * included, so the whole group travels rather than leaving history behind.
 *
 * Non-task children have no prefix to identify them by, so they stay put and
 * the collector line stays with them; a collector left holding nothing is
 * removed.
 */
function ungroupCollector(
	lines: string[],
	target: { line: number; projectName: string; linkText: string }
): Transformed {
	const blockEnd = findTaskBlockEnd(lines, target.line);
	const groups = splitDirectChildGroups(lines, target.line + 1, blockEnd);

	const hoisted: string[] = [];
	const kept: string[] = [];
	let taskCount = 0;

	for (const group of groups) {
		if (!TaskMarker.fromLine(group[0])) {
			kept.push(...group);
			continue;
		}
		// The collector is top-level by construction (detectToggleTarget
		// refuses a nested one), so a child sheds exactly its own indent.
		const dedented = dedentLinesByAmount(group, countIndent(group[0]));
		dedented[0] = addProjectPrefix(dedented[0], target.linkText, target.projectName);
		hoisted.push(...dedented);
		taskCount++;
	}

	if (taskCount === 0) return { reason: 'no-tasks' };

	const replacement = kept.length > 0 ? [lines[target.line], ...kept, ...hoisted] : hoisted;
	const content = [...lines.slice(0, target.line), ...replacement, ...lines.slice(blockEnd)].join('\n');
	return { content, taskCount };
}

/**
 * Fold the **selected** top-level prefixed tasks for the project under a
 * collector — the existing one when the slice already has it (so a second
 * collector is never created), otherwise a fresh one at the first task's
 * position.
 *
 * Only what the user pointed at moves. A task for the same project sitting
 * elsewhere in the section is left alone: it may be loose deliberately, and
 * sweeping it in would be the command deciding something the user didn't ask
 * for. Pointing at the collector instead is how you ask for all of them
 * (`toggleCollector`).
 */
function groupProjectTasks(
	lines: string[],
	target: { line: number; projectName: string },
	scope: { slice: { start: number; end: number }; roots: Set<number> },
	ctx: ToggleContext
): Transformed {
	const { slice, roots } = scope;
	const keywords = parseProjectKeywords(ctx.settings.projectKeywords);
	const matches = findPrefixedProjectTasks(lines, slice, target.projectName)
		.filter(m => roots.has(m.line));
	if (matches.length === 0) return { reason: 'no-matching-tasks' };

	const collector = findCollector(lines, slice, target.projectName, keywords);
	if (collector) {
		return { content: foldIntoCollector(lines, collector.line, matches), taskCount: matches.length };
	}

	const alias = matches.find(m => m.alias)?.alias ?? null;
	const collectorLine = renderCollectorLine(target.projectName, alias, keywords[0] ?? 'Push');
	return { content: groupUnderNewCollector(lines, matches, collectorLine), taskCount: matches.length };
}

/**
 * A collector is toggled as a whole group, in two steps: while loose tasks
 * for its project remain in the slice it gathers them all; once it is the
 * project's only shape left it dissolves. So a half-grouped section takes one
 * press to become grouped and a second to go flat, and the collector is never
 * dissolved while a task it should be holding is still lying next to it.
 *
 * This is the one gesture that sweeps the slice rather than the selection:
 * pointing at the collector *is* pointing at the whole group. Pointing at an
 * individual task keeps its narrower extent (`groupProjectTasks`).
 */
function toggleCollector(
	lines: string[],
	target: { line: number; projectName: string; linkText: string },
	slice: { start: number; end: number }
): { transformed: Transformed; direction: 'grouped' | 'ungrouped' } {
	const strays = findPrefixedProjectTasks(lines, slice, target.projectName);
	if (strays.length > 0) {
		return {
			transformed: { content: foldIntoCollector(lines, target.line, strays), taskCount: strays.length },
			direction: 'grouped'
		};
	}
	return { transformed: ungroupCollector(lines, target), direction: 'ungrouped' };
}

/**
 * Toggle the project grouping the selection points at.
 *
 * Pointing at a task groups that task (and any other selected). Pointing at a
 * collector acts on the whole group: gather the project's loose tasks, or —
 * when there are none left — spread the collector's children back out.
 *
 * @param content - The note's full text
 * @param selection - Inclusive line range; start === end for a bare cursor
 */
export function toggleProjectGrouping(
	content: string,
	selection: Selection,
	ctx: ToggleContext
): ToggleResult {
	const lines = content.split('\n');
	const target = detectToggleTarget(lines, selection, ctx);
	if (target.kind === 'none') return { ok: false, reason: target.reason };

	const slice = findSliceRange(lines, { start: -1, end: lines.length }, target.line);
	const { transformed, direction } = target.kind === 'collector'
		? toggleCollector(lines, target, slice)
		: {
			transformed: groupProjectTasks(lines, target, { slice, roots: selectedRoots(lines, selection) }, ctx),
			direction: 'grouped' as const
		};
	if ('reason' in transformed) return { ok: false, reason: transformed.reason };

	return {
		ok: true,
		content: transformed.content,
		direction,
		projectName: target.projectName,
		taskCount: transformed.taskCount,
		range: { start: slice.start + 1, end: slice.end }
	};
}
