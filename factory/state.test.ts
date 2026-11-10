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
test('each fresh owner retry permits exactly one attempt without erasing failures', () => {
    const state = empty();
    command(state, 1, 'start', '/factory start', 'first');
    for (let i = 0; i < 5; i++) {
        const work = claim(state)!;
        settle(work, work.attempt, `failure ${i}`, true);
        assert.equal(claim(state), undefined);
        command(state, 1, `retry-${i}`, '/factory retry', 'first');
        const retry = claim(state)!;
        assert.ok(retry);
        settle(retry, retry.attempt, 'retry failed', true);
        command(state, 1, `retry-${i}`, '/factory retry', 'first');
        assert.equal(claim(state), undefined);
        command(state, 1, `next-${i}`, '/factory retry', 'first');
    }
    assert.equal(state.work[1].failures, 10);
    assert.equal(state.work[1].result, 'retry failed');
});
test('idle reconciliation never claims waiting, blocked or stopped work', () => {
    const state = empty();
    assert.equal(claim(state), undefined);
    command(state, 1, 'start', '/factory start', 'first');
    const work = claim(state)!;
    settle(work, work.attempt, 'handoff', false);
    for (const stage of ['waiting', 'paused', 'blocked', 'stopped'] as const) {
        work.stage = stage;
        command(state, 1, 'start', '/factory start', 'first');
        assert.equal(claim(JSON.parse(JSON.stringify(state))), undefined);
    }
});
test('pause cannot revive stopped work or bypass an exhausted retry budget', () => {
    const state = empty();
    command(state, 1, 'start', '/factory start', 'first');
    const work = claim(state)!;
    settle(work, work.attempt, 'failed', true);
    work.failures = 3;
    command(state, 1, 'pause', '/factory pause', 'first');
    command(state, 1, 'resume', '/factory resume', 'first');
    assert.equal(work.stage, 'blocked');
    assert.equal(claim(state), undefined);
    command(state, 1, 'stop', '/factory stop', 'first');
    command(state, 1, 'pause-again', '/factory pause', 'first');
    command(state, 1, 'resume-again', '/factory resume', 'first');
    assert.equal(work.stage, 'stopped');
    assert.equal(claim(state), undefined);
});
test('implementation requires the current completed handoff and fixes the coding phase', () => {
    const state = empty();
    command(state, 1, 'start', '/factory start', 'agreement');
    command(state, 1, 'early', '/factory implement', 'agreement');
    assert.equal(state.work[1].phase, undefined);
    const work = claim(state)!;
    settle(work, work.attempt, 'Approved acceptance cases', false);
    command(state, 1, 'changed', '/factory implement', 'new agreement');
    assert.equal(work.phase, undefined);
    command(state, 1, 'implement', '/factory implement', 'agreement');
    assert.equal(work.phase, 'coding');
    assert.equal(work.approvedHandoff, 'Approved acceptance cases');
    assert.equal(claim(state)?.stage, 'running');
});
test('owner feedback supersedes CI without allowing an old candidate to become current', async () => {
    const { feedback } = await import('./state.ts');
    const state = empty();
    command(state, 1, 'start', '/factory start', 'agreement');
    const work = state.work[1];
    work.phase = 'coding'; work.stage = 'verifying'; work.head = 'old';
    feedback(state, 1, 'reply', 'revised');
    assert.equal(work.stage, 'queued');
    assert.equal(work.phase, 'coding');
    assert.equal(work.agreement, 'revised');
    command(state, 1, 'stop', '/factory stop', 'revised');
    assert.equal(claim(state), undefined);
});
