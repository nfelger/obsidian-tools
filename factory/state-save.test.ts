import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveState } from './state-save.ts';
const content = Buffer.from('new state').toString('base64');
const noWait = async () => {};
test('EPIPE retries preserve payload; lost successful responses do not duplicate writes', async () => {
    for (const committed of [false, true]) {
        let writes = 0;
        const sha = await saveState(async (_path, method, body: any) => {
            if (method !== 'PUT') return { sha: committed ? 'new' : 'old', content: committed ? content + '\n' : 'old-content' };
            assert.equal(body.sha, 'old');
            assert.equal(body.content, content);
            if (++writes === 1) throw new TypeError('fetch failed', { cause: new Error('EPIPE') });
            return { content: { sha: 'new' } };
        }, 'old', content, noWait);
        assert.equal(sha, 'new');
        assert.equal(writes, committed ? 1 : 2);
    }
});
test('concurrent update is never overwritten', async () => {
    let writes = 0;
    await assert.rejects(saveState(async (_path, method) => {
        if (method === 'PUT') { writes++; throw new TypeError('fetch failed'); }
        return { sha: 'someone-else', content: 'different' };
    }, 'old', content, noWait), /refusing to overwrite/);
    assert.equal(writes, 1);
});
test('transient failures are bounded and permanent errors are not retried', async () => {
    for (const [message, expected] of [['PUT contents/state.json: 503 unavailable', 3], ['PUT contents/state.json: 403 denied', 1]] as const) {
        let writes = 0;
        await assert.rejects(saveState(async (_path, method) => {
            if (method !== 'PUT') return { sha: 'old', content: 'old-content' };
            writes++; throw new Error(message);
        }, 'old', content, noWait));
        assert.equal(writes, expected);
    }
});
