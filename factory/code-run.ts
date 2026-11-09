import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
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
writeFileSync('/output/result.json', JSON.stringify(result));
process.exitCode = result.failed ? 1 : 0;
