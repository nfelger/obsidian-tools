import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileDiscussion } from './discussion.ts';
import { empty, claim, settle } from './state.ts';

const comment = (id: number, body: string, login = 'owner', type = 'User') =>
    ({ id, body, user: { login, type } });

function waiting() {
    const state = empty();
    const comments = [comment(1, '/factory start')];
    reconcileDiscussion(state, 1, 'Show the destination', comments, 'owner');
    const work = claim(state)!;
    settle(work, work.attempt, 'Which destination format?', false);
    return { state, comments };
}

test('owner answers resume automatically once across fresh runners; replay stays idle', () => {
    let { state, comments } = waiting();
    state = JSON.parse(JSON.stringify(state));
    comments.push(comment(2, 'Use the full note path.'), comment(3, 'Include the heading too.'));
    reconcileDiscussion(state, 1, 'Show the destination', comments, 'owner');
    const work = claim(state)!;
    assert.deepEqual(JSON.parse(work.agreement).replies, [
        { id: 2, body: 'Use the full note path.' }, { id: 3, body: 'Include the heading too.' },
    ]);
    settle(work, work.attempt, 'Revised handoff', false);
    const revision = work.revision;
    reconcileDiscussion(state, 1, 'Show the destination', comments, 'owner');
    assert.equal(work.revision, revision);
    assert.equal(claim(state), undefined);
});

test('only owner human replies can resume work', () => {
    const { state, comments } = waiting();
    comments.push(comment(2, 'Untrusted reply', 'other'), comment(3, 'Bot reply', 'owner', 'Bot'));
    reconcileDiscussion(state, 1, 'Show the destination', comments, 'owner');
    assert.equal(claim(state), undefined);
    assert.deepEqual(JSON.parse(state.work[1].agreement).replies, []);
});

test('owner replies preserve pause, stop and failure states', () => {
    for (const command of ['pause', 'stop', 'blocked']) {
        const { state, comments } = waiting();
        if (command === 'blocked') state.work[1].stage = 'blocked';
        else comments.push(comment(2, `/factory ${command}`));
        comments.push(comment(3, 'New answer'));
        reconcileDiscussion(state, 1, 'Show the destination', comments, 'owner');
        assert.equal(claim(state), undefined);
        assert.equal(state.work[1].stage, command === 'pause' ? 'paused' : command === 'stop' ? 'stopped' : 'blocked');
        if (command === 'pause') {
            comments.push(comment(4, '/factory resume'));
            reconcileDiscussion(state, 1, 'Show the destination', comments, 'owner');
            assert.equal(claim(state)?.stage, 'running');
            assert.deepEqual(JSON.parse(state.work[1].agreement).replies, [{ id: 3, body: 'New answer' }]);
        }
    }
});

test('reply during a model call invalidates its result and queues revised context', () => {
    const { state, comments } = waiting();
    comments.push(comment(2, 'First answer'));
    reconcileDiscussion(state, 1, 'Show the destination', comments, 'owner');
    const work = claim(state)!;
    const attempt = work.attempt;
    comments.push(comment(3, 'Correction'));
    reconcileDiscussion(state, 1, 'Show the destination', comments, 'owner');
    settle(work, attempt, 'Stale answer', false);
    assert.equal(work.stage, 'queued');
    assert.notEqual(work.result, 'Stale answer');
    assert.equal(JSON.parse(claim(state)!.agreement).replies.at(-1).body, 'Correction');
});

test('existing command-only state does not replay old replies as new work', () => {
    const { state, comments } = waiting();
    comments.push(comment(2, 'Old answer'), comment(3, '/factory resume'));
    state.processed.push('3');
    reconcileDiscussion(state, 1, 'Show the destination', comments, 'owner');
    assert.equal(claim(state), undefined);
    comments.push(comment(4, 'New answer'));
    reconcileDiscussion(state, 1, 'Show the destination', comments, 'owner');
    assert.equal(claim(state)?.stage, 'running');
});
