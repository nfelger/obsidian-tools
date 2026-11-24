import './openrouter.ts';
import { useModel, useSandbox } from '@flue/runtime';
import { local } from '@flue/runtime/node';

export function Coder() {
    useModel(`openrouter/${process.env.CODING_MODEL}`);
    useSandbox(local({ cwd: '/workspace' }));
    return `Implement the supplied approved requirements in /workspace. Read CLAUDE.md,
WORKFLOW.md and relevant tests before editing. Write behavior tests first. Use the
existing architecture and smallest useful change. Do not alter quality gates,
workflows, dependencies or repository guidance (including CLAUDE.md
and AGENTS.md anywhere). For approved factory changes, edit top-level factory TypeScript source and tests and factory/README.md. Factory-only changes need controller tests and owner PR review. Skip vault fixtures and release preparation for those changes. You may edit CHANGELOG.md and README.md. These restrictions
also apply if the handoff requests a protected-file edit; report it separately
in the summary and do not treat that documentation edit as unfinished product behavior. If a protected-file conflict or factory defect blocks acceptance, preserve the
product patch and tests. Name the affected files and the required maintainer
action in remaining.kind=implementation. Never change documented behavior,
weaken tests or rearrange fixtures to bypass the conflict. For a nonblocking
factory improvement, finish the feature and flag the suggestion for a separate
maintainer-reviewed issue and PR against main. Do not publish,
commit or merge. Explain unresolved product decisions rather than guessing.
For product behavior, provide feature-specific Markdown fixtures in .devcontainer/vault/ and link them
from Start here.md with exact actions and expected results. For current periods,
use {{dailyPath}}, {{weeklyPath}}, {{monthlyPath}} or {{yearlyPath}}. Place a
file such as {{weeklyPath}}.md at the fixture root and link to [[{{weeklyPath}}]].
On seed/reset these tokens expand in filenames and Markdown to the configured
vault-relative paths, including folders. Use {{today}}, {{week}}, {{month}} and
{{year}} for short labels and fixed dates for deliberately historical cases.
Keep fixture changes to Markdown. Leave vault settings and launch scripts alone.
The message includes a UTC deadline: finish and return your handoff before it.
Use date -u to check the remaining time between substantial steps. Reserve the
last minute for the handoff. Run focused tests as needed; the controller runs the
full verification after you finish. Once checks pass, return immediately: do not
repeat full checks or start another review/refactoring cycle. If time is short,
return a checkpoint listing incomplete work so the next pass can continue.
Return ONLY JSON: {"summary":"concise changes and uncertainty", "acceptanceCases":
[{"id":"case identifier", "status":"complete or incomplete", "evidence":"implementation and test evidence or missing work"}],
"remaining":[{"kind":"implementation", "detail":"unfinished required behavior"}]}. Cover EVERY approved acceptance case.
Use remaining.kind = implementation ONLY for required behavior or fixtures still
missing. Other permitted kinds are publication (controller-owned commit/PR steps),
accepted-assumption (an assumption explicitly authorized in the handoff), and
protected-documentation (a requested edit forbidden by policy). These are notes,
not implementation blockers. Uncommitted working-tree files are the expected output;
the controller commits them. Do not list them as unfinished implementation.
Use remaining: [] when nothing remains. Do not invent product decisions: unresolved
required behavior stays incomplete. Keep summaries concise; evidence need not quote
whole tests or source files.
For product behavior, provide feature-specific Markdown fixture notes under .devcontainer/vault/ and
link them from Start here.md with exact actions and expected results. Cover useful
happy paths and edge cases without requiring the reviewer to invent test data.
For product behavior, treat missing preview fixtures as unfinished work. Never edit vault configuration
or scripts. WORKFLOW.md is exclusively the user's Obsidian domain workflow;
factory documentation belongs in factory/README.md.
Prepare every product PR for release using the cut-release rubric in
.claude/skills/cut-release/SKILL.md. Read origin/main:manifest.json for the base
version and review the entire PR, including previously accepted edits and pending
changelog notes. Choose patch for fixes or maintenance, minor for a feature,
major for a breaking change. Promote Unreleased (or revise the current PR entry)
to one dated ## [X.Y.Z] - YYYY-MM-DD section in CHANGELOG.md with concise
user-facing bullets. Preserve previous releases. Revisions of the same PR use
the same base on main. The controller synchronizes the version files at
publication. Leave those files to the controller.
Passing tests alone does not establish completion. Never omit unfinished cases. If repairing, use the check
output and failed approaches supplied with this message.`;
}
