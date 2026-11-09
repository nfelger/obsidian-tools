import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codingLoop } from './coding-loop.ts';

test('two failed repair cycles lead to one escalation with accumulated evidence', async () => {
    const roles: string[] = [];
    let checks = 0;
    const result = await codingLoop(async (role, feedback) => {
        roles.push(role);
        if (role === 'escalation') assert.match(feedback, /failure 3/);
        return { failed: false, message: `approach ${roles.length}` };
    }, async () => ({ failed: ++checks < 4, message: `failure ${checks}` }));
    assert.deepEqual(roles, ['implementer', 'implementer', 'implementer', 'escalation']);
    assert.equal(result.failed, false);
});
test('success stops immediately; execution errors do not consume coding repair calls', async () => {
    let calls = 0;
    const success = await codingLoop(async () => ({ failed: false, message: 'done' }),
        async () => ({ failed: false, message: 'passed' }));
    assert.equal(success.failed, false);
    const failed = await codingLoop(async () => { calls++; return { failed: true, message: 'provider down' }; },
        async () => { throw new Error('Must not verify a failed agent run'); });
    assert.equal(failed.failed, true);
    assert.equal(calls, 1);
});
test('failed escalation exhausts the budget', async () => {
    let calls = 0;
    const result = await codingLoop(async () => { calls++; return { failed: false, message: 'attempt' }; },
        async () => ({ failed: true, message: 'still failing' }));
    assert.equal(calls, 4);
    assert.equal(result.failed, true);
});
