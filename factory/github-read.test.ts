import { test } from 'node:test';
import assert from 'node:assert/strict';
import { githubRead } from './github-read.ts';

test('transient GitHub read failures retry within the same call', async () => {
    let calls = 0;
    const result = await githubRead('https://api.github.com/test', {}, async () => {
        calls++;
        if (calls === 1) throw new TypeError('fetch failed');
        if (calls === 2) return new Response('unavailable', { status: 503 });
        return new Response('[1]');
    }, async () => {});
    assert.equal(calls, 3);
    assert.deepEqual(await result.json(), [1]);
});
test('read retries are bounded and permission/conflict errors are not retried', async () => {
    for (const status of [401, 403, 404, 409, 429]) {
        let calls = 0;
        assert.equal((await githubRead('https://api.github.com/test', {}, async () => {
            calls++; return new Response('error', { status });
        }, async () => {})).status, status);
        assert.equal(calls, 1);
    }
    let calls = 0;
    await assert.rejects(githubRead('https://api.github.com/test', {}, async () => {
        calls++; throw new TypeError('fetch failed');
    }, async () => {}));
    assert.equal(calls, 3);
});
