import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { validateChanges } from './changes.ts';
import type { Work } from './state.ts';

export function runCoding(repo: string, base: string, work: Work) {
    const root = mkdtempSync(join(process.env.RUNNER_TEMP || tmpdir(), 'factory-code-'));
    const workspace = join(root, 'workspace');
    const input = join(root, 'input');
    const output = join(root, 'output');
    mkdirSync(input); mkdirSync(output);
    execFileSync('git', ['clone', '--no-checkout', `https://github.com/${repo}.git`, workspace]);
    execFileSync('git', ['-C', workspace, 'checkout', '--detach', base]);
    writeFileSync(join(input, 'agreement.json'), JSON.stringify({ agreement: work.agreement, approvedHandoff: work.approvedHandoff, priorResult: work.result, candidateHead: work.head }));
    const result = spawnSync('docker', ['run', '--rm', '--init', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
        '--cpus', '2', '--memory', '6g', '-e', 'OPENROUTER_API_KEY', '-e', 'IMPLEMENTER_MODEL', '-e', 'ESCALATION_MODEL',
        '-v', `${resolve('.')}:/runtime:ro`, '-v', `${workspace}:/workspace`, '-v', `${input}:/input:ro`, '-v', `${output}:/output`,
        'node:22-bookworm', 'bash', '-c', `cp -a --no-preserve=ownership /runtime /tmp/factory && export HOME=/tmp &&
        git config --global --add safe.directory /workspace && cd /workspace && npm ci --ignore-scripts &&
        cd /tmp/factory && node --import tsx code-run.ts`], {
        encoding: 'utf8', timeout: 60 * 60 * 1000, maxBuffer: 8 * 1024 * 1024,
        env: { PATH: process.env.PATH, OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
            IMPLEMENTER_MODEL: process.env.IMPLEMENTER_MODEL, ESCALATION_MODEL: process.env.ESCALATION_MODEL },
    });
    if (result.stderr) process.stderr.write(result.stderr);
    const report = JSON.parse(readFileSync(join(output, 'result.json'), 'utf8'));
    if (result.status !== 0 || report.failed) throw new Error(String(report.message || result.error || 'Coding run failed'));
    return { message: String(report.message).slice(0, 12000), changes: validateChanges(report.changes) };
}
