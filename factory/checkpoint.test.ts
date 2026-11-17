import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyCheckpoint } from './checkpoint.ts';

test('integrates saved work on top of a live branch and surfaces overlapping edits for repair', () => {
    const root = mkdtempSync(join(tmpdir(), 'factory-cherry-pick-'));
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
    const file = join(root, 'src/file.ts');
    try {
        git('init', '-q'); git('config', 'user.name', 'test'); git('config', 'user.email', 'test@example.org');
        mkdirSync(join(root, 'src'));
        const initial = 'one\ntwo\nthree\nfour\nfive\n';
        writeFileSync(file, initial);
        git('add', '.'); git('commit', '-qm', 'base');
        const base = git('rev-parse', 'HEAD');
        writeFileSync(file, initial.replace('five', 'incoming'));
        git('commit', '-qam', 'incoming changes');
        const live = git('rev-parse', 'HEAD');
        const apply = (content: string) => applyCheckpoint(root, base, { changes: [{ path: 'src/file.ts', content }],
            complete: true, message: 'previous attempt' });
        assert.equal(apply(initial.replace('one', 'recovered')), '');
        assert.equal(readFileSync(file, 'utf8'), 'recovered\ntwo\nthree\nfour\nincoming\n');
        assert.equal(git('rev-parse', 'HEAD'), live);
        git('reset', '--hard', 'HEAD');
        assert.match(apply(initial.replace('five', 'conflicting')), /src\/file.ts/);
        assert.equal(git('diff', '--diff-filter=U', '--name-only'), 'src/file.ts');
    } finally { rmSync(root, { recursive: true, force: true }); }
});
