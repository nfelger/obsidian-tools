import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { validateChanges } from './changes.ts';
import { codingLoop } from './coding-loop.ts';
import { applyCheckpoint, type Patch } from './checkpoint.ts';
import type { Work } from './state.ts';

export async function runCoding(repo: string, base: string, work: Work, beforePass: () => Promise<void> = async () => {},
    options: { deadline?: number; budget?: { modelPasses: number }; recovery?: { base: string; patch: Patch }; checkpoint?: (patch: Patch) => Promise<void> } = {}) {
    const root = mkdtempSync(join(process.env.RUNNER_TEMP || tmpdir(), 'factory-code-'));
    const workspace = join(root, 'workspace');
    const input = join(root, 'input');
    const output = join(root, 'output');
    mkdirSync(input); mkdirSync(output);
    try {
        execFileSync('git', ['clone', '--no-checkout', `https://github.com/${repo}.git`, workspace]);
        execFileSync('git', ['-C', workspace, 'checkout', '--detach', base]);
        const recovery = options.recovery;
        let repair = recovery ? applyCheckpoint(workspace, recovery.base, recovery.patch) : '';
        const verifyRecovered = recovery?.patch.complete === true && !repair;
        if (recovery && !verifyRecovered) repair += '\nContinue the recovered implementation: ' + recovery.patch.message;
        writeFileSync(join(input, 'agreement.json'), JSON.stringify({ agreement: work.agreement, approvedHandoff: work.approvedHandoff, priorResult: work.result, candidateHead: base }));
        const deadline = options.deadline ?? Date.now() + 45 * 60 * 1000;
        let changes: ReturnType<typeof validateChanges> = [];
        const budget = options.budget ?? { modelPasses: 0 };
        const pass = async (feedback: string, verifyOnly = false) => {
            if (!verifyOnly && ++budget.modelPasses > 4) throw new Error('Repair budget exhausted. Retry to continue from the saved checkpoint.');
            const role = budget.modelPasses >= 4 ? 'escalation' : 'implementer';
            writeFileSync(join(input, 'pass.json'), JSON.stringify({ role, feedback: [repair, feedback].filter(Boolean).join('\n'), deadline,
                verifyOnly, summary: recovery?.patch.message }));
            repair = '';
            rmSync(join(output, 'result.json'), { force: true });
            const result = spawnSync('docker', ['run', '--rm', '--init', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
                '--user', `${process.getuid!()}:${process.getgid!()}`,
                '--cpus', '2', '--memory', '6g', '-e', 'OPENROUTER_API_KEY', '-e', 'IMPLEMENTER_MODEL', '-e', 'ESCALATION_MODEL',
                '-v', `${resolve('.')}:/runtime:ro`, '-v', `${workspace}:/workspace`, '-v', `${input}:/input:ro`, '-v', `${output}:/output`,
                'node:22-bookworm', 'bash', '-c', `cp -a --no-preserve=ownership /runtime /tmp/factory && export HOME=/tmp &&
                git config --global --add safe.directory /workspace && cd /workspace && if [ ! -d node_modules ]; then npm ci --ignore-scripts; fi &&
                cd /tmp/factory && node --import tsx code-run.ts`], {
                encoding: 'utf8', timeout: Math.max(1, deadline - Date.now()), maxBuffer: 8 * 1024 * 1024,
                env: { PATH: process.env.PATH, OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
                    IMPLEMENTER_MODEL: process.env.IMPLEMENTER_MODEL, ESCALATION_MODEL: process.env.ESCALATION_MODEL },
            });
            if (result.stderr) process.stderr.write(result.stderr);
            let report;
            try { report = JSON.parse(readFileSync(join(output, 'result.json'), 'utf8')); }
            catch (error) {
                throw new Error(`Coding container produced no readable result (exit ${result.status}, signal ${result.signal ?? 'none'}).\n${result.error?.message ?? ''}\n${result.stderr ?? ''}\n${result.stdout ?? ''}\n${String(error)}`.slice(-12000));
            }
            if (result.status !== 0 || report.failed) throw new Error(String(report.message || result.error || 'Coding run failed'));
            let valid;
            if (report.changes?.length) {
                try { valid = validateChanges(report.changes); }
                catch (error) { if (report.complete) throw error; }
            }
            if (valid) await options.checkpoint?.({ changes: valid, message: String(report.message), complete: report.complete === true });
            if (report.complete === true) changes = verifyOnly && Array.isArray(report.changes) && !report.changes.length
                ? [] : valid ?? validateChanges(report.changes);
            return { failed: false, complete: report.complete === true, message: String(report.message) };
        };
        const guard = async () => {
            await beforePass();
            if (deadline - Date.now() <= 6 * 60 * 1000) throw new Error('45-minute coding budget exhausted. No candidate published.');
        };
        if (verifyRecovered) {
            await guard();
            const result = await pass('', true);
            if (result.complete) return { message: result.message.slice(0, 12000), changes };
            repair = result.message;
        }
        const outcome = await codingLoop((_role, feedback) => pass(feedback),
            async () => ({ failed: false, message: 'Verified in the container after final edits.' }), guard);
        if (outcome.failed) throw new Error(outcome.message);
        return { message: outcome.message.slice(0, 12000), changes };
    } finally { rmSync(workspace, { recursive: true, force: true }); }
}
