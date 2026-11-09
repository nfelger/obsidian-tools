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
The controller runs verification after you finish. Return a concise summary of
changes, acceptance cases and remaining uncertainty. If repairing, use the check
output and failed approaches supplied with this message.`;
}
