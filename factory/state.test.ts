import { test } from 'node:test';
import assert from 'node:assert/strict';
import { empty, command, claim, settle } from './state.ts';
test('duplicate start and second issue cannot claim active slot', () => {
    const state = empty();
    command(state, 1, '1', '/factory start', 'first');
    const work = claim(state)!;
    command(state, 1, '1', '/factory start', 'changed');
    command(state, 2, '2', '/factory start', 'second');
    assert.equal(claim(state), undefined);
    assert.equal(work.agreement, 'first');
    settle(work, work.attempt, 'done', false);
    assert.equal(claim(state)?.issue, 2);
});
test('fresh-runner pause/resume revises agreement and rejects stale completion', () => {
    let state = empty();
    command(state, 1, '1', '/factory start', 'first');
    const attempt = claim(state)!.attempt;
    state = JSON.parse(JSON.stringify(state));
    command(state, 1, '2', '/factory pause', 'first');
    settle(state.work[1], attempt, 'stale', false);
    assert.equal(state.work[1].result, '');
    command(state, 1, '3', '/factory resume', 'revised');
    assert.equal(state.work[1].revision, 2);
    assert.equal(claim(state)?.stage, 'running');
    command(state, 1, '4', '/factory stop', 'revised');
    settle(state.work[1], state.work[1].attempt - 1, 'stale', false);
    assert.equal(state.work[1].stage, 'stopped');
});
test('retries are bounded and evidence survives exhaustion', () => {
    const state = empty();
    command(state, 1, 'start', '/factory start', 'first');
    for (let i = 0; i < 3; i++) {
        const work = claim(state)!;
        settle(work, work.attempt, `failure ${i}`, true);
        command(state, 1, `retry-${i}`, '/factory retry', 'first');
    }
    assert.equal(claim(state), undefined);
    assert.equal(state.work[1].result, 'failure 2');
});
test('idle reconciliation never claims waiting, blocked or stopped work', () => {
    const state = empty();
    assert.equal(claim(state), undefined);
    command(state, 1, 'start', '/factory start', 'first');
    const work = claim(state)!;
    settle(work, work.attempt, 'handoff', false);
    for (const stage of ['waiting', 'blocked', 'stopped'] as const) {
        work.stage = stage;
        command(state, 1, 'start', '/factory start', 'first');
        assert.equal(claim(JSON.parse(JSON.stringify(state))), undefined);
    }
});
