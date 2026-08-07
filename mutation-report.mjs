/**
 * Query a Stryker mutation report from the command line.
 *
 * The raw JSON embeds the full source of every mutated file, so it runs to
 * megabytes — too large to read directly, and ruinous to hand to an agent. This
 * exposes the parts worth acting on and nothing else.
 *
 * What a surviving mutant means: Stryker changed the code and the suite still
 * passed, so nothing asserted on that behaviour. That is a different signal from
 * coverage, which only says the line executed.
 *
 * Usage:
 *   node mutation-report.mjs summary
 *   node mutation-report.mjs files [--top N] [--changed]
 *   node mutation-report.mjs hotspots --file src/utils/tasks.ts [--top N]
 *
 * Defaults to reports/mutation/mutation.json; pass --report <path> to override.
 */

import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const command = args.find((a) => !a.startsWith('--')) ?? 'summary';

function flag(name, fallback = undefined) {
	const i = args.indexOf(`--${name}`);
	if (i === -1) return fallback;
	const value = args[i + 1];
	return value && !value.startsWith('--') ? value : true;
}

const reportPath = flag('report', 'reports/mutation/mutation.json');

let report;
try {
	report = JSON.parse(readFileSync(reportPath, 'utf8'));
} catch {
	console.error(`No readable report at ${reportPath}. Run \`npm run test:mutation\` first.`);
	process.exit(2);
}

/** Files changed against the merge-base, so a run can be narrowed to this branch. */
function changedFiles() {
	try {
		const base = execFileSync('git', ['merge-base', 'HEAD', 'origin/main'], {
			encoding: 'utf8',
		}).trim();
		const out = execFileSync('git', ['diff', '--name-only', base, '--', 'src'], {
			encoding: 'utf8',
		});
		return new Set(out.split('\n').filter(Boolean));
	} catch {
		return null;
	}
}

const relative = (p) => path.relative(report.projectRoot ?? process.cwd(), p);

/** Per-file tallies, plus the score and the action the numbers imply. */
function fileStats() {
	const stats = [];
	for (const [file, data] of Object.entries(report.files ?? {})) {
		const tally = { Killed: 0, Survived: 0, Timeout: 0, NoCoverage: 0, CompileError: 0, RuntimeError: 0 };
		for (const m of data.mutants ?? []) tally[m.status] = (tally[m.status] ?? 0) + 1;

		// Stryker's definition: timeouts count as killed, uncovered mutants do not.
		const killed = tally.Killed + tally.Timeout;
		const detected = killed + tally.Survived + tally.NoCoverage;
		const score = detected === 0 ? 100 : (killed / detected) * 100;

		// Which problem dominates decides the advice: code the tests never reach
		// needs tests, code they reach without checking needs assertions.
		const action =
			tally.NoCoverage > tally.Survived
				? 'add tests — mutants here are never executed'
				: tally.Survived > 0
					? 'strengthen assertions — tests run this code without checking its effect'
					: 'nothing to do';

		stats.push({ file: relative(file), score, total: detected, ...tally, action });
	}
	return stats.sort((a, b) => a.score - b.score);
}

function overall(stats) {
	const killed = stats.reduce((n, s) => n + s.Killed + s.Timeout, 0);
	const detected = stats.reduce((n, s) => n + s.total, 0);
	return {
		score: detected === 0 ? 100 : (killed / detected) * 100,
		killed,
		survived: stats.reduce((n, s) => n + s.Survived, 0),
		noCoverage: stats.reduce((n, s) => n + s.NoCoverage, 0),
		detected,
	};
}

const pct = (n) => `${n.toFixed(1)}%`;

if (command === 'summary') {
	const stats = fileStats();
	const o = overall(stats);
	const t = report.thresholds ?? {};
	console.log(`Mutation score: ${pct(o.score)}  (high ${t.high ?? '-'} / low ${t.low ?? '-'})`);
	console.log(`${o.killed} killed · ${o.survived} survived · ${o.noCoverage} not covered · ${o.detected} total`);
	console.log('');
	console.log('Weakest files:');
	for (const s of stats.slice(0, 5)) {
		console.log(`  ${pct(s.score).padStart(6)}  ${s.file}  (${s.Survived} survived, ${s.NoCoverage} uncovered)`);
	}
	console.log('');
	console.log('Next: `node mutation-report.mjs hotspots --file <path>` for the exact lines.');
	process.exit(0);
}

if (command === 'files') {
	let stats = fileStats();

	if (flag('changed')) {
		const changed = changedFiles();
		if (changed === null) {
			console.error('Could not resolve the git merge-base; showing all files.');
		} else {
			stats = stats.filter((s) => changed.has(s.file));
			if (stats.length === 0) {
				console.log('No mutated files changed on this branch.');
				process.exit(0);
			}
		}
	}

	const top = Number(flag('top', stats.length));
	for (const s of stats.slice(0, top)) {
		console.log(`${pct(s.score).padStart(6)}  ${s.file}`);
		console.log(`        ${s.Killed + s.Timeout} killed · ${s.Survived} survived · ${s.NoCoverage} uncovered`);
		if (s.action !== 'nothing to do') console.log(`        -> ${s.action}`);
	}
	process.exit(0);
}

if (command === 'hotspots') {
	const target = flag('file');
	if (typeof target !== 'string') {
		console.error('hotspots needs --file <path>.');
		process.exit(2);
	}

	const entry = Object.entries(report.files ?? {}).find(([f]) => relative(f) === target || f.endsWith(target));
	if (!entry) {
		console.error(`${target} is not in the report. \`files\` lists what is.`);
		process.exit(2);
	}

	// Group by line: one weak line usually explains several survivors, so the
	// line is the actionable unit rather than the individual mutant.
	const byLine = new Map();
	for (const m of entry[1].mutants ?? []) {
		if (m.status !== 'Survived' && m.status !== 'NoCoverage') continue;
		const line = m.location?.start?.line ?? 0;
		if (!byLine.has(line)) byLine.set(line, { line, survived: 0, noCoverage: 0, mutators: new Set() });
		const g = byLine.get(line);
		if (m.status === 'Survived') g.survived++;
		else g.noCoverage++;
		g.mutators.add(m.mutatorName);
	}

	const lines = [...byLine.values()].sort(
		(a, b) => b.survived + b.noCoverage - (a.survived + a.noCoverage) || a.line - b.line
	);
	if (lines.length === 0) {
		console.log(`No survivors in ${target} — every mutant was killed.`);
		process.exit(0);
	}

	const top = Number(flag('top', 20));
	console.log(`${target}: ${lines.length} line(s) with unkilled mutants`);
	for (const g of lines.slice(0, top)) {
		const what = [g.survived ? `${g.survived} survived` : null, g.noCoverage ? `${g.noCoverage} uncovered` : null]
			.filter(Boolean)
			.join(', ');
		console.log(`  line ${String(g.line).padStart(4)}  ${what}  [${[...g.mutators].join(', ')}]`);
	}
	process.exit(0);
}

console.error(`Unknown command "${command}". Use summary, files, or hotspots.`);
process.exit(2);
