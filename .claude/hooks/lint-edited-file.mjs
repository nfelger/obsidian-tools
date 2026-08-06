#!/usr/bin/env node
/**
 * PostToolUse hook: lint the file an agent just wrote and hand any errors back
 * to it, so it can self-correct before moving on.
 *
 * Reports **errors only**. The complexity and size thresholds are configured as
 * warnings recording where the code is today (see CLAUDE.md, "Quality limits
 * only tighten"); repeating them on every edit would invite exactly the
 * opportunistic refactoring that policy rules out. Errors are different — an
 * unused import is never a deliberate intermediate state.
 *
 * Never blocks the edit. Findings travel as `additionalContext`, which the
 * agent sees next to the tool result; at exit 0 a hook's stdout is otherwise
 * only written to the debug log, so this is the one channel that reaches it.
 *
 * Usage: lint-edited-file.mjs <file-path>   (wired via args in settings.json)
 */

import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { GUIDANCE, ruleOf } from '../../lint-guidance.mjs';

/** Exit silently: nothing to say about this edit. */
function quiet() {
	process.exit(0);
}

const filePath = process.argv[2];
if (!filePath) quiet();

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const absolute = path.resolve(projectDir, filePath);

// Only lint sources oxlint understands, and only inside the project.
if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(absolute)) quiet();
if (!absolute.startsWith(path.resolve(projectDir))) quiet();
if (!existsSync(absolute)) quiet();

const relative = path.relative(projectDir, absolute);

const run = spawnSync(
	'npx',
	['oxlint', '--format', 'json', relative],
	{ cwd: projectDir, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
);

// A hook must never be the reason a session stalls: if oxlint is missing or
// its output is unreadable, say nothing rather than inventing a failure.
if (run.error || typeof run.stdout !== 'string') quiet();

let report;
try {
	report = JSON.parse(run.stdout);
} catch {
	quiet();
}

const errors = (report.diagnostics ?? []).filter((d) => d.severity === 'error');
if (errors.length === 0) quiet();

const lines = errors.map((d) => {
	const rule = ruleOf(d.code);
	const span = d.labels?.[0]?.span;
	const at = span ? `${relative}:${span.line}:${span.column}` : relative;
	const remedy = GUIDANCE[rule] ?? d.help ?? '';
	return `- ${at} [${rule}] ${d.message}${remedy ? `\n  Fix: ${remedy}` : ''}`;
});

const context = [
	`Lint errors in ${relative}, introduced by the edit you just made:`,
	'',
	...lines,
	'',
	'Fix these now, while the file is fresh. Do not suppress them: these are',
	'correctness-level findings, not the advisory complexity thresholds.',
].join('\n');

process.stdout.write(
	JSON.stringify({
		hookSpecificOutput: {
			hookEventName: 'PostToolUse',
			additionalContext: context,
		},
	})
);
process.exit(0);
