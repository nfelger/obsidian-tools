import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { repositoryReader, repositoryTools } from './repository.ts';

test('repository tools expose committed text, not working files or symlink targets', () => {
    const root = mkdtempSync(join(tmpdir(), 'planner-read-'));
    const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args]);
    try {
        git('init', '-q');
        writeFileSync(join(root, 'source.ts'), 'const notice = "Moved";\nsecond line');
        symlinkSync('/etc/passwd', join(root, 'link'));
        git('add', '.');
        git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture');
        writeFileSync(join(root, 'source.ts'), 'uncommitted change');
        writeFileSync(join(root, '.env'), 'secret');
        const repo = repositoryReader(root);
        assert.match(repo.list('source'), /source.ts/);
        assert.equal(repo.list('.env'), '');
        assert.match(repo.search('Moved'), /source.ts:1:/);
        assert.equal(repo.read('source.ts', 2), '2: second line');
        assert.equal(repo.read('link', 1), '1: /etc/passwd');
        assert.throws(() => repo.read('../outside', 1));
        assert.throws(() => repo.read('.env', 1));
        assert.deepEqual(repositoryTools(root).map(tool => tool.name), ['list_files', 'read_file', 'search_files']);
    } finally { rmSync(root, { recursive: true, force: true }); }
});
