import { it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

it('loads the nvm Node installation for noninteractive startup and forwards reset', () => {
    const dir = mkdtempSync(join(tmpdir(), 'preview-startup-'));
    try {
        mkdirSync(join(dir, '.devcontainer'));
        mkdirSync(join(dir, 'nvm/bin'), { recursive: true });
        cpSync('.devcontainer/run-preview.sh', join(dir, '.devcontainer/run-preview.sh'));
        writeFileSync(join(dir, 'nvm/nvm.sh'), 'export PATH="$NVM_DIR/bin:$PATH"\n');
        writeFileSync(join(dir, 'nvm/bin/node'), '#!/bin/bash\nprintf "%s\\n" "$@" > arguments\n', { mode: 0o755 });
        const result = spawnSync('bash', ['.devcontainer/run-preview.sh', '--reset'], {
            cwd: dir, encoding: 'utf8', env: { ...process.env, NVM_DIR: join(dir, 'nvm') },
        });
        expect(result.stderr).toBe('');
        expect(result.status).toBe(0);
        expect(readFileSync(join(dir, 'arguments'), 'utf8')).toBe('preview-launch.mjs\n--reset\n');
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

it('starts one detached preview via the actual start and attach hooks', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'preview-hooks-'));
    try {
        cpSync('.devcontainer', join(dir, '.devcontainer'), { recursive: true });
        mkdirSync(join(dir, 'bin'));
        writeFileSync(join(dir, 'bin/node'), '#!/bin/bash\necho launched >> launches\nsleep 2\n', { mode: 0o755 });
        const hooks = JSON.parse(readFileSync(join(dir, '.devcontainer/devcontainer.json'), 'utf8'));
        const env = { ...process.env, HOME: dir, NVM_DIR: join(dir, 'unused'), PATH: join(dir, 'bin') + ':' + process.env.PATH };
        for (const hook of [hooks.postStartCommand, hooks.postAttachCommand]) {
            expect(spawnSync('bash', ['-c', hook], { cwd: dir, env }).status).toBe(0);
        }
        await expect.poll(() => readFileSync(join(dir, '.preview/session.log'), 'utf8')).toContain('already running');
        await expect.poll(() => readFileSync(join(dir, 'launches'), 'utf8')).toBe('launched\n');
    } finally { rmSync(dir, { recursive: true, force: true }); }
});
