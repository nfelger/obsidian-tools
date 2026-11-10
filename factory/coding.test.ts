import { test } from 'node:test';
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { writeFileSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { runCoding } from './coding.ts';
import type { Work } from './state.ts';

test('passes reuse one checkout; later attempts start fresh and recheck issue state', async () => {
    const originalSpawn = cp.spawnSync, originalExec = cp.execFileSync;
    const originalNow = Date.now;
    const roots = new Set<string>();
    const mounts: string[] = [];
    let guards = 0, passes = 0;
    try {
        cp.execFileSync = (() => '') as unknown as typeof cp.execFileSync;
        cp.spawnSync = ((_command: string, args: string[]) => {
            const output = args.find(value => value.endsWith(':/output'))!.slice(0, -8);
            const input = args.find(value => value.endsWith(':/input:ro'))!.slice(0, -10);
            roots.add(dirname(output));
            mounts.push(args.find(value => value.endsWith(':/workspace'))!);
            const pass = JSON.parse(readFileSync(join(input, 'pass.json'), 'utf8'));
            assert.ok(pass.deadline > Date.now());
            assert.equal(guards, ++passes);
            if (passes === 2) assert.match(pass.feedback, /missing logging/);
            writeFileSync(join(output, 'result.json'), JSON.stringify({ failed: false, complete: passes !== 1,
                message: passes === 1 ? 'missing logging' : 'done', changes: [{ path: 'src/a.ts', content: 'new' }] }));
            return { status: 0, stderr: '', stdout: '' };
        }) as typeof cp.spawnSync;
        syncBuiltinESMExports();
        const work = { agreement: 'approved', result: '', approvedHandoff: 'cases' } as Work;
        await runCoding('owner/repo', 'base', work, async () => { guards++; });
        await runCoding('owner/repo', 'base', work, async () => { guards++; });
        assert.equal(mounts[0], mounts[1]);
        assert.notEqual(mounts[1], mounts[2]);
        await assert.rejects(runCoding('owner/repo', 'base', work, async () => { throw new Error('superseded'); }), /superseded/);
        assert.equal(passes, 3);
        await assert.rejects(runCoding('owner/repo', 'base', work, async () => {
            Date.now = () => originalNow() + 45 * 60 * 1000;
        }), /budget exhausted/);
        assert.equal(passes, 3);
    } finally {
        Date.now = originalNow;
        cp.spawnSync = originalSpawn; cp.execFileSync = originalExec; syncBuiltinESMExports();
        for (const root of roots) rmSync(root, { recursive: true, force: true });
    }
});
