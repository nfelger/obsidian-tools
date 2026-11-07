import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

describe('preview candidate verification', () => {
    it.each(['valid', 'modified', 'wrong commit', 'failed e2e'])('handles %s candidate', scenario => {
        const dir = mkdtempSync(join(tmpdir(), 'preview-'));
        try {
            const assets: Record<string, string> = {};
            for (const name of ['main.js', 'manifest.json', 'styles.css']) {
                writeFileSync(join(dir, name), name);
                assets[name] = createHash('sha256').update(name).digest('hex');
            }
            writeFileSync(join(dir, 'candidate.json'), JSON.stringify({
                sourceSha: scenario === 'wrong commit' ? 'b'.repeat(40) : 'a'.repeat(40),
                e2e: scenario === 'failed e2e' ? 'failed' : 'passed', assets,
            }));
            if (scenario === 'modified') writeFileSync(join(dir, 'main.js'), 'changed');
            const result = spawnSync(process.execPath, ['preview-verify.mjs', dir, 'a'.repeat(40)]);
            expect(result.status).toBe(scenario === 'valid' ? 0 : 1);
        } finally { rmSync(dir, { recursive: true, force: true }); }
    });
});
