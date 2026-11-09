import { readFileSync, writeFileSync, lstatSync } from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
import { codingLoop } from './coding-loop.ts';
import { agentResult } from './result.ts';
import { modelFor } from './models.ts';

// Invoked inside the coding container, from the trusted runtime directory.
const agreement = readFileSync('/input/agreement.json', 'utf8');
const result = await codingLoop(async (role, feedback) => {
    const run = spawnSync('node_modules/.bin/flue', ['run', 'coder.ts', '--json', '--message',
        JSON.stringify({ agreement, feedback })], {
        encoding: 'utf8', timeout: 10 * 60 * 1000, maxBuffer: 4 * 1024 * 1024,
        env: { PATH: process.env.PATH, HOME: '/tmp',
            OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY, CODING_MODEL: modelFor(role) },
    });
    if (run.stderr) process.stderr.write(run.stderr);
    return agentResult(run);
}, async () => {
    const run = spawnSync('npm', ['run', 'check'], {
        cwd: '/workspace', encoding: 'utf8', timeout: 5 * 60 * 1000, maxBuffer: 4 * 1024 * 1024,
        env: { PATH: process.env.PATH, HOME: '/tmp' },
    });
    return { failed: run.status !== 0, message: (run.stdout + run.stderr + (run.error?.message ?? '')).slice(-24000) };
});
let changes: { path: string; content: string | null }[] = [];
if (!result.failed) {
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
writeFileSync('/output/result.json', JSON.stringify({ ...result, changes }));
process.exitCode = result.failed ? 1 : 0;
