/**
 * Run oxlint and rewrite its findings with project-specific self-correction
 * guidance from lint-guidance.mjs.
 *
 * Usage: node lint-guided.mjs [paths...]
 * Exits non-zero when oxlint reports errors; warnings alone exit 0.
 */

import { spawnSync } from 'child_process';
import { GUIDANCE, ruleOf } from './lint-guidance.mjs';

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
