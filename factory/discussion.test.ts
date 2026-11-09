import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileDiscussion } from './discussion.ts';
import { empty, claim, settle } from './state.ts';

const comment = (id: number, body: string, login = 'owner', type = 'User') =>
    ({ id, body, user: { login, type } });

test('comment answers enter the next resumed snapshot without starting work themselves', () => {
    let state = empty();
    const comments = [comment(1, '/factory start')];
    reconcileDiscussion(state, 1, 'Show the destination', comments, 'owner');
    const work = claim(state)!;
    settle(work, work.attempt, 'Which destination format?', false);
    comments.push(comment(2, 'Use the full note path.'));
    reconcileDiscussion(state, 1, 'Show the destination', comments, 'owner');
    assert.equal(claim(state), undefined);
    assert.equal(work.revision, 1);

    state = JSON.parse(JSON.stringify(state));
    comments.push(comment(3, '/factory resume'), comment(4, 'Later clarification.'));
    reconcileDiscussion(state, 1, 'Show the destination', comments, 'owner');
    assert.deepEqual(JSON.parse(state.work[1].agreement), {
        request: 'Show the destination', replies: [{ id: 2, body: 'Use the full note path.' }],
    });
    assert.equal(state.work[1].revision, 2);
    reconcileDiscussion(state, 1, 'Show the destination', comments, 'owner');
    assert.equal(state.work[1].revision, 2);
    assert.equal(claim(state)?.stage, 'running');
});

test('foreign comments, bot replies and workflow commands are excluded from requirements', () => {
    const state = empty();
    reconcileDiscussion(state, 1, 'Request', [
        comment(1, 'Untrusted reply', 'someone-else'),
        comment(2, 'Bot reply', 'owner', 'Bot'),
        comment(3, '/factory typo'),
        comment(4, 'Owner clarification'),
        comment(5, '/factory start'),
    ], 'owner');
    assert.deepEqual(JSON.parse(state.work[1].agreement), {
        request: 'Request', replies: [{ id: 4, body: 'Owner clarification' }],
    });
});
