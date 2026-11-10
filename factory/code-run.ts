import { readFileSync, writeFileSync, lstatSync } from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
import type { CodingStep } from './coding-loop.ts';
import { completion } from './completion.ts';
import { validateChanges } from './changes.ts';
import { agentResult } from './result.ts';
import { modelFor } from './models.ts';

// Invoked inside the coding container, from the trusted runtime directory.
const agreement = readFileSync('/input/agreement.json', 'utf8');
const input = JSON.parse(readFileSync('/input/pass.json', 'utf8'));
const remaining = () => Math.max(1, input.deadline - Date.now());
const timeout = Math.min(20 * 60 * 1000, remaining() - 5 * 60 * 1000);
if (timeout <= 0) throw new Error('Coding budget exhausted; verification time reserved.');
const run = spawnSync('node_modules/.bin/flue', ['run', 'coder.ts', '--json', '--message',
    JSON.stringify({ agreement, feedback: input.feedback, deadline: new Date(Date.now() + timeout - 60000).toISOString() })], {
    encoding: 'utf8', timeout, maxBuffer: 4 * 1024 * 1024,
    env: { PATH: process.env.PATH, HOME: '/tmp', OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
        CODING_MODEL: modelFor(input.role) },
});
if (run.stderr) process.stderr.write(run.stderr);
const outcome = agentResult(run);
let result: CodingStep = outcome.failed ? outcome : completion(outcome.message);
if ((run.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT') {
    result = { failed: false, complete: false, message: 'Previous pass timed out. Inspect the existing workspace and finish the remaining requirements.' };
}
if (!result.failed && result.complete) {
    const check = spawnSync('npm', ['run', 'check'], {
        cwd: '/workspace', encoding: 'utf8', timeout: Math.min(5 * 60 * 1000, remaining()), maxBuffer: 4 * 1024 * 1024,
        env: { PATH: process.env.PATH, HOME: '/tmp' },
    });
    if (check.status !== 0) result = { failed: false, complete: false,
        message: `${result.message}\nChecks failed:\n${(check.stdout + check.stderr + (check.error?.message ?? '')).slice(-24000)}` };
}
let changes: { path: string; content: string | null }[] = [];
{
    const git = (args: string[]) => execFileSync('git', ['-C', '/workspace', ...args], { encoding: 'utf8' });
    git(['add', '-N', '.']);
    changes = git(['diff', '--name-only', '-z', 'HEAD']).split('\0').filter(Boolean).map(path => {
        let content: string | null;
        try {
            if (!lstatSync(`/workspace/${path}`).isFile()) throw new Error('Only regular files may be published.');
            content = readFileSync(`/workspace/${path}`, 'utf8');
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            content = null;
        }
        return { path, content };
    });
}
if (!result.failed) {
    try { validateChanges(changes); } catch (error) {
        result = { failed: false, complete: false, message: `${result.message}\n${String(error)} Revert protected-file edits before continuing.` };
    }
}
writeFileSync('/output/result.json', JSON.stringify({ ...result, changes }));
process.exitCode = result.failed ? 1 : 0;
