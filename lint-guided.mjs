/**
 * Run oxlint and rewrite its findings with project-specific self-correction
 * guidance.
 *
 * Oxlint's own `help` text is generic, and some rules (notably `complexity`)
 * ship with none at all. A finding that only states the violation leaves the
 * reader — human or agent — to guess the intended remedy, and the cheapest
 * guess is usually to raise the threshold. Each entry in GUIDANCE below says
 * what to do instead, in terms of this codebase's own patterns.
 *
 * Usage: node lint-guided.mjs [paths...]
 * Exits non-zero when oxlint reports errors; warnings alone exit 0.
 */

import { spawnSync } from 'child_process';

const GUIDANCE = {
	complexity:
		'Extract cohesive steps into named helpers in src/utils/. The transfer commands ' +
		'already follow a phase order (collect -> write target -> mutate source); splitting ' +
		'along those phase boundaries usually removes the branching. Raising the threshold ' +
		'is a last resort, not the fix.',

	'max-lines-per-function':
		'Split along the collect / write-target / mutate-source phases described in ' +
		'docs/key-insights.md. Prefer moving pure computation into src/utils/ where it can ' +
		'be unit-tested directly.',

	'max-lines':
		'This file is doing too much. Look for a cohesive group of functions that could ' +
		'become their own module in src/utils/, as projectCompletion.ts was split out of ' +
		'completeProjectTask.ts.',

	'max-params':
		'Wrap the related arguments in a single options object and add its type to ' +
		'src/types.ts. Long parameter lists are the usual side effect of splitting a large ' +
		'function, so fix this rather than threading more arguments through call sites.',

	'max-depth':
		'Use early returns or guard clauses instead of nesting. Most of this codebase ' +
		'validates preconditions up front and returns early.',

	'no-unused-vars':
		'Delete it. If it is deliberately unused (a required signature position or an ' +
		'ignored catch binding), prefix the name with an underscore.',

	'no-useless-escape':
		'Remove the redundant backslash. Inside a character class, `[` needs no escaping.',
};

const args = process.argv.slice(2);
const targets = args.length > 0 ? args : ['src', 'tests', 'scripts'];

const run = spawnSync(
	'npx',
	['oxlint', '--format', 'json', ...targets],
	{ encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
);

if (run.error) {
	console.error(`Could not run oxlint: ${run.error.message}`);
	process.exit(2);
}

let report;
try {
	report = JSON.parse(run.stdout);
} catch {
	// Nothing parseable to enrich — surface oxlint's own output verbatim so the
	// failure is still visible rather than swallowed.
	process.stdout.write(run.stdout);
	process.stderr.write(run.stderr ?? '');
	process.exit(run.status ?? 2);
}

const diagnostics = report.diagnostics ?? [];
const ruleOf = (code) => (code ?? '').replace(/^.*\(/, '').replace(/\)$/, '');

let errors = 0;
let warnings = 0;

for (const d of diagnostics) {
	const rule = ruleOf(d.code);
	const where = d.labels?.[0]?.span;
	const at = where ? `${d.filename}:${where.line}:${where.column}` : d.filename;

	if (d.severity === 'error') errors++;
	else warnings++;

	console.log(`${d.severity === 'error' ? 'ERROR' : 'warn '} ${at}  ${rule}`);
	console.log(`      ${d.message}`);

	const guidance = GUIDANCE[rule] ?? d.help;
	if (guidance) console.log(`      -> ${guidance}`);
	console.log('');
}

const total = errors + warnings;
if (total === 0) {
	console.log(`No lint findings in ${targets.join(', ')}.`);
} else {
	console.log(`${errors} error(s), ${warnings} warning(s).`);
	if (warnings > 0 && errors === 0) {
		console.log(
			'Warnings do not fail the build. They are the ratchet: when a file drops below ' +
			'a threshold, tighten it in .oxlintrc.json so it cannot drift back.'
		);
	}
}

process.exit(errors > 0 ? 1 : 0);
