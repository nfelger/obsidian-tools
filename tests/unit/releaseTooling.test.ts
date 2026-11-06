import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = process.cwd();
const sha = 'a'.repeat(40);
const dirs: string[] = [];
function workspace() {
    const dir = mkdtempSync(path.join(tmpdir(), 'bullet-flow-release-'));
    dirs.push(dir);
    return dir;
}
afterEach(() => dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })));

function checkedBuild(dir: string) {
    mkdirSync(path.join(dir, 'build/checked'), { recursive: true });
    const assets: Record<string, string> = {};
    for (const [name, content] of Object.entries({
        'main.js': 'module.exports = {};', 'manifest.json': '{"id":"bullet-flow","version":"0.19.1"}',
        'styles.css': '.bullet-flow {}',
    })) {
        writeFileSync(path.join(dir, 'build/checked', name), content);
        assets[name] = createHash('sha256').update(content).digest('hex');
    }
    const report = {
        sourceSha: sha, assets,
        checks: ['lint', 'test:coverage', 'test:crap', 'audit:code', 'build'].map(command =>
            ({ command: `npm run ${command}`, status: 'passed' })),
    };
    writeFileSync(path.join(dir, 'build/checked/quality.json'), JSON.stringify(report));
    return report;
}
function packageBuild(dir: string, env: Record<string, string> = {}) {
    return spawnSync(process.execPath, [path.join(root, 'candidate-package.mjs')], {
        cwd: dir, encoding: 'utf8', env: {
            ...process.env, GITHUB_SHA: sha, GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1',
            GITHUB_REPOSITORY: 'nfelger/obsidian-tools', E2E_RESULT: 'success',
            GITHUB_OUTPUT: '', GITHUB_STEP_SUMMARY: '', ...env,
        },
    });
}

describe('candidate integrity', () => {
    it('packages the exact checked bytes with evidence and rollback instructions', () => {
        const dir = workspace();
        checkedBuild(dir);
        expect(packageBuild(dir).status).toBe(0);
        expect(readFileSync(path.join(dir, 'build/candidate/main.js')))
            .toEqual(readFileSync(path.join(dir, 'build/checked/main.js')));
        const candidate = JSON.parse(readFileSync(path.join(dir, 'build/candidate/candidate.json'), 'utf8'));
        expect(candidate.sourceSha).toBe(sha);
        expect(candidate.candidate).toContain('-123-1');
        expect(readFileSync(path.join(dir, 'build/candidate/INSTALL.md'), 'utf8')).toContain('Return to stable');
    });
    it.each([
        { GITHUB_SHA: 'b'.repeat(40) }, { E2E_RESULT: 'failure' }, { E2E_RESULT: 'skipped' },
    ])('rejects stale identity or incomplete E2E: %j', env => {
        const dir = workspace();
        checkedBuild(dir);
        expect(packageBuild(dir, env).status).not.toBe(0);
        expect(existsSync(path.join(dir, 'build/candidate'))).toBe(false);
    });
    it('rejects altered assets', () => {
        const dir = workspace();
        checkedBuild(dir);
        writeFileSync(path.join(dir, 'build/checked/main.js'), 'modified after checking');
        expect(packageBuild(dir).stderr).toContain('Build asset changed');
    });
    it('rejects missing gate evidence', () => {
        const dir = workspace();
        const report = checkedBuild(dir);
        report.checks = report.checks.filter(check => check.command !== 'npm run audit:code');
        writeFileSync(path.join(dir, 'build/checked/quality.json'), JSON.stringify(report));
        expect(packageBuild(dir).stderr).toContain('Required quality evidence is missing');
    });
    it('uses a new identity for a rerun instead of replacing an earlier candidate', () => {
        const dir = workspace();
        checkedBuild(dir);
        expect(packageBuild(dir, { GITHUB_RUN_ATTEMPT: '2' }).status).toBe(0);
        const candidate = JSON.parse(readFileSync(path.join(dir, 'build/candidate/candidate.json'), 'utf8'));
        expect(candidate.candidate).toContain('-123-2');
    });
});

describe('quality gate failure', () => {
    it.each(['lint', 'test:coverage', 'test:crap', 'audit:code', 'build'])(
        'stops at %s and removes stale publishable output', failed => {
            const dir = workspace();
            checkedBuild(dir);
            mkdirSync(path.join(dir, 'bin'));
            writeFileSync(path.join(dir, 'bin/npm'),
                '#!/bin/sh\nprintf "%s\\n" "$3" >> invoked\n[ "$3" != "$FAIL_AT" ]\n', { mode: 0o755 });
            const result = spawnSync(process.execPath, [path.join(root, 'quality-check.mjs')], {
                cwd: dir, encoding: 'utf8',
                env: { ...process.env, PATH: `${dir}/bin:${process.env.PATH}`, FAIL_AT: failed },
            });
            expect(result.status).not.toBe(0);
            expect(result.stderr).toContain(`Quality gate failed: ${failed}`);
            expect(readFileSync(path.join(dir, 'invoked'), 'utf8').trim().split('\n').at(-1)).toBe(failed);
            expect(existsSync(path.join(dir, 'build/checked'))).toBe(false);
        },
    );
});
