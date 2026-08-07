#!/usr/bin/env node
/**
 * Stop hook: refuse to let a turn end with lint errors or a failing test suite.
 *
 * This is the backpressure the rest of the tooling lacks. Lint and tests already
 * existed, but nothing made an agent run them before declaring itself finished,
 * so a human was the feedback loop. Blocking the stop puts the failure back in
 * front of the agent while it still has the context to fix it.
 *
 * Four properties matter, and each one is a bug if missing:
 *
 * 1. It skips entirely when nothing under src/, tests/ or scripts/ has changed
 *    since the last green run. Stop fires at the end of *every* turn, including purely
 *    conversational ones, and a gate that re-runs the suite each time trains
 *    people to disable it.
 * 2. It never repeats a test run someone else already did. Agents run `npm test`
 *    themselves; npm's posttest hook records the tree the suite passed on, so the
 *    gate trusts that result instead of paying for it twice. Lint and audit still
 *    run — they cost milliseconds and nobody runs them out of habit.
 * 3. It blocks by returning `decision: block`, which hands `reason` to the agent.
 * 4. It blocks a given failure only once. An agent that cannot fix something must
 *    not be trapped in a loop, so a repeat of the same failure is allowed through
 *    with a warning to the human instead.
 *
 * Coverage thresholds deliberately do not run here — instrumenting the suite is
 * slower than running it, and a floor is a release concern rather than a
 * per-turn one. CI owns that.
 */

import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
// Must cover every directory the lint sensor below scans: a path the gate
// lints but does not fingerprint can change without ever waking the gate.
const WATCHED = ['src', 'tests', 'scripts'];

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
 * Content hash of the working tree under the watched directories.
 *
 * Git does the work: the diff against HEAD covers every tracked change, and the
 * contents of untracked files cover new ones. Two simpler versions are wrong,
 * and both were tried first:
 *
 *   - `git status --porcelain` alone. Editing a tracked file twice produces
 *     identical porcelain output both times, so the second edit reads as
 *     "nothing changed" and skips the gate.
 *   - Hashing path, size and mtime. Then `npm ci`, a checkout, or any tool that
 *     rewrites a file unchanged looks like an edit and pays for a full run.
 *
 * Returns null when git cannot answer, which callers treat as "assume changed".
 */
function fingerprint() {
	const git = (args) =>
		spawnSync('git', args, { cwd: projectDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

	const diff = git(['diff', 'HEAD', '--', ...WATCHED]);
	if (diff.error || diff.status !== 0) return null;

	const untracked = git(['ls-files', '-o', '--exclude-standard', '--', ...WATCHED]);
	if (untracked.error || untracked.status !== 0) return null;

	const hash = createHash('sha1').update(diff.stdout);
	for (const file of untracked.stdout.split('\n').filter(Boolean)) {
		hash.update(file);
		try {
			hash.update(readFileSync(path.join(projectDir, file)));
		} catch {
			// Vanished between listing and reading; the path alone still marks it.
		}
	}
	return hash.digest('hex');
}

const stateDir = path.join(projectDir, '.claude', 'hooks', '.state');

/**
 * Where a passing test run is recorded, against the tree it passed on.
 *
 * Shared rather than per-session on purpose: the fingerprint describes the
 * working tree, so whoever last ran the suite — this hook, an agent via
 * `npm test`, or a person — answers the question for everyone.
 */
const greenFile = path.join(stateDir, 'tests-green.json');

function readJson(file, fallback) {
	try {
		return JSON.parse(readFileSync(file, 'utf8'));
	} catch {
		return fallback;
	}
}

function writeJson(file, value) {
	try {
		mkdirSync(stateDir, { recursive: true });
		writeFileSync(file, JSON.stringify(value));
	} catch {
		// State we cannot write only costs a redundant run.
	}
}

// `--stamp-tests-green`: record that the suite passed on the current tree. Wired
// to npm's posttest hooks, which run only when the tests actually passed, so an
// agent's own `npm test` spares the gate from repeating it.
if (process.argv.includes('--stamp-tests-green')) {
	const fp = fingerprint();
	if (fp) writeJson(greenFile, { fingerprint: fp });
	process.exit(0);
}

const input = readStdin();
const sessionId = String(input.session_id ?? 'unknown').replace(/[^A-Za-z0-9_-]/g, '');
const stateFile = path.join(stateDir, `${sessionId}.json`);

const loadState = () => readJson(stateFile, { lastPassed: null, blocked: [] });
const saveState = (state) => writeJson(stateFile, state);

// Nothing to gate if the project has no watched sources (or we are not in it).
if (!WATCHED.some((d) => existsSync(path.join(projectDir, d)))) quiet();

const current = fingerprint();
const state = loadState();
if (current !== null && state.lastPassed === current) quiet();

// Skip only the expensive sensor when the suite already passed on this exact
// tree. Lint and audit still run: they cost milliseconds.
const testsAlreadyGreen = current !== null && readJson(greenFile, {}).fingerprint === current;

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

const tests = testsAlreadyGreen
	? { status: 0, skipped: true }
	: spawnSync('npx', ['vitest', 'run', '--reporter=json', `--outputFile=${resultsFile}`], {
			cwd: projectDir,
			encoding: 'utf8',
			maxBuffer: 32 * 1024 * 1024,
		});

const testsFailed = tests.status !== 0;

// Record the pass so a later turn on the same tree need not repeat it.
if (!testsFailed && !tests.skipped) writeJson(greenFile, { fingerprint: current });

// --- Sensor 3: findings this change introduced ------------------------------
//
// `fallow audit` attributes each finding to the changeset or to the inherited
// baseline, and `gate: new-only` in .fallowrc.json means only the former count.
// That distinction is what makes this reportable at all: the repo carries real
// duplication and complexity today, and nagging about inherited debt would be
// the "warnings are a backlog" rule violated by the tooling itself.

const SECTIONS = { dead_code: 'dead code', complexity: 'complexity', duplication: 'duplication' };

/** One finding as a bullet: what it is, where, its numbers, and how to fix it. */
function describeFinding(section, finding) {
	const name = finding.name ?? finding.export_name ?? '(unnamed)';
	const where = finding.path ? `${finding.path}:${finding.line ?? '?'}` : 'unknown location';

	const metrics = [
		['cyclomatic', finding.cyclomatic],
		['cognitive', finding.cognitive],
		['CRAP', finding.crap],
	]
		.filter(([, v]) => v != null)
		.map(([k, v]) => `${k} ${v}`);
	if (finding.line_count != null) metrics.push(`${finding.line_count} lines`);

	// suppress-line is dropped deliberately: it is always offered, and leading
	// with it invites silencing the finding instead of reading it.
	const actions = (finding.actions ?? [])
		.map((a) => a.type)
		.filter((t) => t && t !== 'suppress-line');

	return (
		`- [${SECTIONS[section]}] ${name} at ${where}` +
		(metrics.length ? ` (${metrics.join(', ')})` : '') +
		(actions.length ? `\n  Suggested: ${actions.join(', ')}` : '')
	);
}

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

	const found = [];
	for (const section of Object.keys(SECTIONS)) {
		for (const group of Object.values(report[section] ?? {})) {
			if (!Array.isArray(group)) continue;
			for (const finding of group) {
				if (finding?.introduced === true) found.push(describeFinding(section, finding));
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
