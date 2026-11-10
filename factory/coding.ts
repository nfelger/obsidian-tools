import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { validateChanges } from './changes.ts';
import { codingLoop } from './coding-loop.ts';
import type { Work } from './state.ts';

export async function runCoding(repo: string, base: string, work: Work, beforePass: () => Promise<void> = async () => {}) {
    const root = mkdtempSync(join(process.env.RUNNER_TEMP || tmpdir(), 'factory-code-'));
    const workspace = join(root, 'workspace');
    const input = join(root, 'input');
    const output = join(root, 'output');
    mkdirSync(input); mkdirSync(output);
    try {
        execFileSync('git', ['clone', '--no-checkout', `https://github.com/${repo}.git`, workspace]);
        execFileSync('git', ['-C', workspace, 'checkout', '--detach', base]);
        writeFileSync(join(input, 'agreement.json'), JSON.stringify({ agreement: work.agreement, approvedHandoff: work.approvedHandoff, priorResult: work.result, candidateHead: work.head }));
        const deadline = Date.now() + 45 * 60 * 1000;
        let changes: ReturnType<typeof validateChanges> = [];
        const outcome = await codingLoop(async (role, feedback) => {
            writeFileSync(join(input, 'pass.json'), JSON.stringify({ role, feedback, deadline }));
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
            if (report.complete === true) changes = validateChanges(report.changes);
            return { failed: false, complete: report.complete === true, message: String(report.message) };
        }, async () => ({ failed: false, message: 'Verified in the container after final edits.' }), async () => {
            await beforePass();
            if (deadline - Date.now() <= 6 * 60 * 1000) throw new Error('45-minute coding budget exhausted. No candidate published.');
        });
        if (outcome.failed) throw new Error(outcome.message);
        return { message: outcome.message.slice(0, 12000), changes };
    } finally { rmSync(workspace, { recursive: true, force: true }); }
}
