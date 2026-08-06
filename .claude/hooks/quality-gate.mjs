#!/usr/bin/env node
/**
 * Stop hook: refuse to let a turn end with lint errors or a failing test suite.
 *
 * This is the backpressure the rest of the tooling lacks. Lint and tests already
 * existed, but nothing made an agent run them before declaring itself finished,
 * so a human was the feedback loop. Blocking the stop puts the failure back in
 * front of the agent while it still has the context to fix it.
 *
 * Three properties matter, and each one is a bug if missing:
 *
 * 1. It skips when no source or test file has changed since the last green run.
 *    Stop fires at the end of *every* turn, including conversational ones, and a
 *    gate that re-runs the suite each time trains people to disable it.
 * 2. It blocks by returning `decision: block`, which hands `reason` to the agent.
 * 3. It blocks a given failure only once. An agent that cannot fix something must
 *    not be trapped in a loop, so a repeat of the same failure is allowed through
 *    with a warning to the human instead.
 *
 * Coverage thresholds deliberately do not run here — instrumenting the suite is
 * slower than running it, and a floor is a release concern rather than a
 * per-turn one. CI owns that.
 */

import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import path from 'path';

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const WATCHED = ['src', 'tests'];
const SOURCE_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

/** Exit without blocking and without saying anything. */
function quiet() {
	process.exit(0);
}

function emit(payload) {
	process.stdout.write(JSON.stringify(payload));
	process.exit(0);
}

function readStdin() {
	try {
		return JSON.parse(readFileSync(0, 'utf8'));
	} catch {
		return {};
	}
}

/**
 * Fingerprint the watched trees by path, size and mtime.
 *
 * Cheaper than hashing contents and does not depend on git, so it also notices
 * edits to files that were never staged.
 */
function fingerprint() {
	const parts = [];

	const walk = (dir) => {
		let entries;
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(full);
			} else if (SOURCE_RE.test(entry.name)) {
				const s = statSync(full);
				parts.push(`${path.relative(projectDir, full)}:${s.size}:${s.mtimeMs}`);
			}
		}
	};

	for (const dir of WATCHED) walk(path.join(projectDir, dir));
	parts.sort();
	return createHash('sha1').update(parts.join('\n')).digest('hex');
}

const stateDir = path.join(projectDir, '.claude', 'hooks', '.state');
const input = readStdin();
const sessionId = String(input.session_id ?? 'unknown').replace(/[^A-Za-z0-9_-]/g, '');
const stateFile = path.join(stateDir, `${sessionId}.json`);

function loadState() {
	try {
		return JSON.parse(readFileSync(stateFile, 'utf8'));
	} catch {
		return { lastPassed: null, blocked: [] };
	}
}

function saveState(state) {
	try {
		mkdirSync(stateDir, { recursive: true });
		writeFileSync(stateFile, JSON.stringify(state));
	} catch {
		// A state file we cannot write only costs a redundant run.
	}
}

// Nothing to gate if the project has no watched sources (or we are not in it).
if (!WATCHED.some((d) => existsSync(path.join(projectDir, d)))) quiet();

const current = fingerprint();
const state = loadState();
if (state.lastPassed === current) quiet();

// --- Sensor 1: lint errors ------------------------------------------------

const lint = spawnSync('npx', ['oxlint', '--format', 'json', 'src', 'tests', 'scripts'], {
	cwd: projectDir,
	encoding: 'utf8',
	maxBuffer: 32 * 1024 * 1024,
});

let lintErrors = [];
if (!lint.error && typeof lint.stdout === 'string') {
	try {
		const report = JSON.parse(lint.stdout);
		lintErrors = (report.diagnostics ?? []).filter((d) => d.severity === 'error');
	} catch {
		// Unparseable output is not a licence to invent a failure.
	}
}

// --- Sensor 2: the test suite ---------------------------------------------
//
// The JSON reporter is used rather than console output on purpose. Several
// suites deliberately exercise failure paths and log stack traces to stderr
// while passing, so a raw tail of the output reports those instead of the
// actual failure — misleading precisely when the agent most needs accuracy.

const resultsFile = path.join(stateDir, `${sessionId}-vitest.json`);
mkdirSync(stateDir, { recursive: true });

const tests = spawnSync(
	'npx',
	['vitest', 'run', '--reporter=json', `--outputFile=${resultsFile}`],
	{ cwd: projectDir, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
);

const testsFailed = tests.status !== 0;

// --- Sensor 3: findings this change introduced ------------------------------
//
// `fallow audit` attributes each finding to the changeset or to the inherited
// baseline, and `gate: new-only` in .fallowrc.json means only the former count.
// That distinction is what makes this reportable at all: the repo carries real
// duplication and complexity today, and nagging about inherited debt would be
// the "warnings are a backlog" rule violated by the tooling itself.

/** Introduced findings, as "what: where — numbers", plus fallow's own actions. */
function introducedFindings() {
	const audit = spawnSync('npx', ['fallow', 'audit', '--format', 'json', '--quiet'], {
		cwd: projectDir,
		encoding: 'utf8',
		maxBuffer: 32 * 1024 * 1024,
	});

	if (audit.error || typeof audit.stdout !== 'string') return [];

	let report;
	try {
		report = JSON.parse(audit.stdout);
	} catch {
		return [];
	}

	// Anything other than an explicit failed verdict is not ours to act on:
	// a validation or network error must not masquerade as a code problem.
	if (report.verdict !== 'fail') return [];

	const label = { dead_code: 'dead code', complexity: 'complexity', duplication: 'duplication' };
	const found = [];
	for (const section of ['dead_code', 'complexity', 'duplication']) {
		for (const group of Object.values(report[section] ?? {})) {
			if (!Array.isArray(group)) continue;
			for (const f of group) {
				if (f?.introduced !== true) continue;
				const name = f.name ?? f.export_name ?? '(unnamed)';
				const where = f.path ? `${f.path}:${f.line ?? '?'}` : 'unknown location';
				const metrics = [
					f.cyclomatic != null ? `cyclomatic ${f.cyclomatic}` : null,
					f.cognitive != null ? `cognitive ${f.cognitive}` : null,
					f.crap != null ? `CRAP ${f.crap}` : null,
					f.line_count != null ? `${f.line_count} lines` : null,
				].filter(Boolean);
				const actions = (f.actions ?? [])
					.map((a) => a.type)
					.filter((t) => t && t !== 'suppress-line');

				found.push(
					`- [${label[section]}] ${name} at ${where}` +
						(metrics.length ? ` (${metrics.join(', ')})` : '') +
						(actions.length ? `\n  Suggested: ${actions.join(', ')}` : '')
				);
			}
		}
	}
	return found;
}

const introduced = introducedFindings();

/**
 * Trim a broken runner's output down to the part that explains the break.
 *
 * Vitest's own banner, the deprecation notice and the report-written line are
 * always present and never the cause, so leading with them buries the error.
 */
function runnerNoise(output) {
	const skip = /CJS build of Vite|JSON report written|^\s*RUN\s+v|^\s*$/;
	// Built from a char code rather than a literal escape, so the pattern stays
	// free of control characters.
	const ansi = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
	return output
		.replace(ansi, '')
		.split('\n')
		.filter((line) => !skip.test(line))
		.slice(0, 20)
		.join('\n')
		.trim();
}

/**
 * The failures, as "what broke: why".
 *
 * Covers both shapes the reporter uses: individual failed assertions, and a
 * whole file that never ran (an unresolvable import, a module-level throw).
 * The second shape carries its reason on the file entry and reports zero failed
 * tests, so reading assertions alone loses the error entirely.
 */
function failedTests() {
	let results;
	try {
		results = JSON.parse(readFileSync(resultsFile, 'utf8'));
	} catch {
		return [];
	}

	const firstLine = (text) => String(text ?? '').split('\n')[0].trim();
	const failures = [];

	for (const file of results.testResults ?? []) {
		const assertions = file.assertionResults ?? [];
		const failed = assertions.filter((a) => a.status === 'failed');

		for (const assertion of failed) {
			const name = (assertion.fullName || assertion.title || 'unnamed test').trim();
			failures.push(`- ${name}\n  ${firstLine((assertion.failureMessages ?? [])[0])}`);
		}

		if (failed.length === 0 && file.status === 'failed' && file.message) {
			const name = file.name ? path.relative(projectDir, file.name) : 'unknown file';
			failures.push(`- ${name} (did not run)\n  ${firstLine(file.message)}`);
		}
	}

	return failures;
}

if (lintErrors.length === 0 && !testsFailed && introduced.length === 0) {
	saveState({ ...state, lastPassed: current });
	quiet();
}

// --- Report ---------------------------------------------------------------

const sections = [];

if (lintErrors.length > 0) {
	const listed = lintErrors.slice(0, 10).map((d) => {
		const span = d.labels?.[0]?.span;
		const at = span ? `${d.filename}:${span.line}:${span.column}` : d.filename;
		return `- ${at} ${d.message}`;
	});
	sections.push(
		[
			`Lint errors (${lintErrors.length}):`,
			...listed,
			lintErrors.length > 10 ? `- ...and ${lintErrors.length - 10} more` : null,
			'Run `npm run lint:guided` for the suggested fix for each.',
		]
			.filter(Boolean)
			.join('\n')
	);
}

if (testsFailed) {
	const failures = failedTests();
	if (failures.length > 0) {
		sections.push(
			[
				`Failing tests (${failures.length}):`,
				...failures.slice(0, 10),
				failures.length > 10 ? `- ...and ${failures.length - 10} more` : null,
			]
				.filter(Boolean)
				.join('\n')
		);
	} else {
		// Non-zero exit with no failed assertions means the run itself broke —
		// a syntax error, a bad import, a config problem.
		sections.push(
			`The test run did not complete (exit ${tests.status}):\n\n` +
				runnerNoise(`${tests.stderr ?? ''}\n${tests.stdout ?? ''}`)
		);
	}
}

if (introduced.length > 0) {
	sections.push(
		[
			`New maintainability findings introduced by this change (${introduced.length}):`,
			...introduced.slice(0, 8),
			introduced.length > 8 ? `- ...and ${introduced.length - 8} more` : null,
			'These are attributed to your changes, not inherited debt — `npm run audit:code`',
			'reproduces them.',
		]
			.filter(Boolean)
			.join('\n')
	);
}

const report = sections.join('\n\n');
const signature = createHash('sha1')
	.update(`${lintErrors.length}|${testsFailed}|${introduced.length}|${report.slice(0, 2000)}`)
	.digest('hex');

// Already reported this exact failure once — let the turn end rather than
// looping, and make sure a human hears about it.
if (state.blocked?.includes(signature)) {
	emit({
		systemMessage:
			'Quality gate still failing after a previous attempt ' +
			`(${lintErrors.length} lint error(s), tests ${testsFailed ? 'failing' : 'passing'}, ` +
			`${introduced.length} new finding(s)). ` +
			'Allowing the turn to end so the session does not loop — this needs a look.',
	});
}

saveState({ ...state, blocked: [...(state.blocked ?? []), signature] });

emit({
	decision: 'block',
	reason: [
		'Do not finish yet — the quality gate is failing on changes from this session.',
		'',
		report,
		'',
		'Fix the cause rather than the check: do not relax a threshold, delete a test,',
		'or narrow an assertion to get past this. If a finding genuinely cannot be',
		'refactored — the complexity is the design — suppress that single line with a',
		'`-- reason` explaining why, and say so in your reply. A documented exception',
		'is fine; a loosened shared limit is not.',
	].join('\n'),
});
