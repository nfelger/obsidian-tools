import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publish } from './publication.ts';
import { command, empty } from './state.ts';

test('publication creates a draft PR and refuses a concurrently changed issue branch', async () => {
    const state = empty();
    command(state, 1, 'start', '/factory start', 'agreement');
    const work = state.work[1];
    const writes: { path: string; body: any }[] = [];
    const api = async (path: string, method = 'GET', body?: any) => {
        if (method !== 'GET') writes.push({ path, body });
        if (path === 'git/commits/base') return { tree: { sha: 'tree' } };
        if (path === 'git/trees') return { sha: 'new-tree' };
        if (path === 'git/commits') return { sha: 'new-commit' };
        if (path.startsWith('pulls?')) return [];
        if (path === 'pulls') return { html_url: 'https://example.test/pr' };
        if (path.startsWith('git/ref/heads/')) return { object: { sha: 'someone-elses-commit' } };
        return {};
    };
    await publish(api, 'owner/repo', work, 'base', [{ path: 'src/file.ts', content: 'new' }], 'summary');
    assert.equal(work.head, 'new-commit');
    assert.equal(work.pr, 'https://example.test/pr');
    assert.equal(writes.find(item => item.path === 'pulls')?.body.draft, true);
    await assert.rejects(publish(api, 'owner/repo', work, 'base', [], 'summary'), /changed during coding/);
    assert.equal(writes.some(item => item.path.startsWith('git/refs/heads')), false);
});
