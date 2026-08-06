/**
 * Project-specific remedies for lint rules, keyed by oxlint rule name.
 *
 * Oxlint's own `help` text is generic, and some rules (notably `complexity`)
 * ship with none at all. A finding that only states the violation leaves the
 * reader — human or agent — to guess the intended remedy, and the cheapest
 * guess is usually to raise the threshold. Each entry says what to do instead,
 * in terms of this codebase's own patterns.
 *
 * Shared by lint-guided.mjs (CLI) and .claude/hooks/lint-edited-file.mjs (agent
 * feedback), so the same wording reaches a human and an agent.
 */

export const GUIDANCE = {
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

/** Pull the bare rule name out of an oxlint code like `eslint(max-lines)`. */
export function ruleOf(code) {
	return (code ?? '').replace(/^.*\(/, '').replace(/\)$/, '');
}
