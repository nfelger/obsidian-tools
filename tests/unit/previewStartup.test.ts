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
