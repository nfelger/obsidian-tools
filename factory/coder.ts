import './openrouter.ts';
import { useModel, useSandbox } from '@flue/runtime';
import { local } from '@flue/runtime/node';

export function Coder() {
    useModel(`openrouter/${process.env.CODING_MODEL}`);
    useSandbox(local({ cwd: '/workspace' }));
    return `Implement the supplied approved requirements in /workspace. Read CLAUDE.md,
WORKFLOW.md and relevant tests before editing. Write behavior tests first. Use the
existing architecture and smallest useful change. Do not alter quality gates,
factory code, workflows, dependencies or repository guidance. Do not publish,
commit or merge. Explain unresolved product decisions rather than guessing.
The message includes a UTC deadline: finish and return your handoff before it.
Use date -u to check the remaining time between substantial steps. Reserve the
last minute for the handoff. Run focused tests as needed; the controller runs the
full verification after you finish. Once checks pass, return immediately: do not
repeat full checks or start another review/refactoring cycle. If time is short,
return a concise description of incomplete work and uncertainty. Return a concise summary of
changes, acceptance cases and remaining uncertainty. If repairing, use the check
output and failed approaches supplied with this message.`;
}
