import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileDiscussion } from './discussion.ts';
import { agreementBody, applyTriage, claim, empty, reviseAgreement, settle, type Ledger } from './state.ts';

// Shared #48 example: ticking a weekly task under a project parent lands with the project prefix.
const request = 'Ticking `- [ ] Draft agenda` under `- [[Migration Initiative]]` lands as `- [x] [[Migration Initiative]] Draft agenda`.';
const revision1 = 'Ticked tasks land in today\'s log.\n\nReady for /factory implement';
const revision2 = 'Changed since revision 1\n- Keep the project prefix.\n\n`- [x] [[Migration Initiative]] Draft agenda`\n\nReady for /factory implement';
const comment = (id: number, body: string) => ({ id, body, user: { login: 'owner', type: 'User' } });

function plan(state: Ledger, comments: ReturnType<typeof comment>[], handoff: string) {
    reconcileDiscussion(state, 1, request, comments, 'owner');
    const work = claim(state)!;
    settle(work, work.attempt, handoff, false);
    reviseAgreement(work, handoff);
    return work;
}

function approvedRevision2() {
    const state = empty();
    const comments = [comment(1, '/factory start')];
    plan(state, comments, revision1);
    comments.push(comment(2, 'Keep the project prefix on the logged task.'));
    const work = plan(state, comments, revision2);
    comments.push(comment(3, '/factory implement'));
    reconcileDiscussion(state, 1, request, comments, 'owner');
    claim(state);
    work.stage = 'preview'; work.branch = 'factory/issue-1';
    work.result = `Candidate 2 · builds revision ${work.approvedRevision}`;
    return { state, comments, work };
}

test('a planning correction edits one agreement into revision 2 and replay leaves it unchanged', () => {
    const state = empty();
    const comments = [comment(1, '/factory start')];
    const work = plan(state, comments, revision1);
    assert.equal(work.agreementRevision, 1);
    comments.push(comment(2, 'Keep the project prefix on the logged task.'));
    plan(state, comments, revision2);
    assert.equal(work.agreementRevision, 2);
    const body = agreementBody(work);
    assert.match(body, /^<!-- factory-agreement -->\n\*\*Current agreement · Revision 2 · awaiting your approval\*\*/);
    assert.match(body, /Changed since revision 1/);
    assert.match(body, /<summary>Revision 1<\/summary>\n\nTicked tasks land/);
    const snapshot = JSON.stringify(work);
    reconcileDiscussion(state, 1, request, comments, 'owner');
    assert.equal(reviseAgreement(work, revision2), false);
    assert.equal(JSON.stringify(work), snapshot);
    assert.equal(agreementBody(work), body);
    assert.equal(claim(state), undefined);
});

test('implement approves revision 2; a newer reply first explains both revisions', () => {
    const { work } = approvedRevision2();
    assert.equal(work.approvedRevision, 2);
    assert.equal(work.phase, 'coding');
    assert.match(agreementBody(work), /Revision 2 · approved, being built/);

    const state = empty();
    const comments = [comment(1, '/factory start')];
    const stale = plan(state, comments, revision1);
    comments.push(comment(2, 'Keep the project prefix.'), comment(3, '/factory implement'));
    reconcileDiscussion(state, 1, request, comments, 'owner');
    assert.notEqual(stale.phase, 'coding');
    assert.equal(stale.approvedRevision, undefined);
    assert.match(stale.notice!, /covered revision 1.*Revision 2 is being drafted/);
});

test('a defect report repairs against revision 2 without a new approval', () => {
    const { state, comments, work } = approvedRevision2();
    comments.push(comment(4, 'It landed as `- [x] Draft agenda`, without the project link.'));
    reconcileDiscussion(state, 1, request, comments, 'owner');
    assert.equal(work.triage, true);
    assert.equal(claim(state), work);
    assert.equal(applyTriage(work, 'Repair against revision 2\nRestore the `[[Migration Initiative]]` prefix.'), true);
    assert.equal(work.stage, 'running');
    assert.equal(work.phase, 'coding');
    assert.equal(work.approvedRevision, 2);
    assert.equal(work.agreementRevision, 2);
    assert.match(work.repair!, /Migration Initiative/);
});

test('unlisted breakage is a repair whose fix is listed under also fixed', () => {
    const { state, comments, work } = approvedRevision2();
    comments.push(comment(4, 'The project log has the entry twice.'));
    reconcileDiscussion(state, 1, request, comments, 'owner');
    claim(state);
    assert.equal(applyTriage(work, 'Repair against revision 2\nAlso fixed: the project log entry is written once.'), true);
    assert.match(work.repair!, /Also fixed: the project log entry is written once/);
    assert.equal(work.approvedRevision, 2);
});

test('a changed expectation drafts revision 3 and waits; approval builds revision 3', () => {
    const { state, comments, work } = approvedRevision2();
    const oldReport = work.result;
    comments.push(comment(4, "Leave the project link off in today's log."));
    reconcileDiscussion(state, 1, request, comments, 'owner');
    claim(state);
    const revision3 = 'Changed since revision 2\n- Today\'s log omits the project link.\n\n`- [x] Draft agenda`\n\nReady for /factory implement';
    assert.equal(applyTriage(work, `Proposed revision 3\n${revision3}`), false);
    assert.equal(work.agreementRevision, 3);
    assert.equal(work.approvedRevision, 2);
    assert.equal(work.stage, 'waiting');
    assert.equal(claim(state), undefined);
    assert.match(agreementBody(work), /Revision 3 · awaiting your approval[\s\S]*`- \[x\] Draft agenda`/);
    assert.match(oldReport, /builds revision 2/);
    comments.push(comment(5, '/factory implement'));
    reconcileDiscussion(state, 1, request, comments, 'owner');
    assert.equal(work.approvedRevision, 3);
    assert.equal(work.approvedHandoff, revision3);
    assert.equal(work.branch, 'factory/issue-1');
    assert.equal(claim(state)?.phase, 'coding');
});

test('an ambiguous reply asks one question; the answer is triaged again', () => {
    const { state, comments, work } = approvedRevision2();
    comments.push(comment(4, 'The project link looks wrong.'));
    reconcileDiscussion(state, 1, request, comments, 'owner');
    claim(state);
    assert.equal(applyTriage(work, 'Question\nShould the link be restored, or left off from now on?'), false);
    assert.equal(work.stage, 'waiting');
    assert.equal(work.agreementRevision, 2);
    assert.match(work.notice!, /restored, or left off/);
    assert.equal(claim(state), undefined);
    comments.push(comment(5, 'Restore it.'));
    reconcileDiscussion(state, 1, request, comments, 'owner');
    assert.equal(work.triage, true);
    claim(state);
    assert.equal(applyTriage(work, 'Repair against revision 2\nRestore the prefix.'), true);
    assert.equal(work.approvedRevision, 2);
});

test('a mixed reply makes one new revision awaiting approval', () => {
    const { state, comments, work } = approvedRevision2();
    comments.push(comment(4, 'The entry is duplicated, and also drop the link.'));
    reconcileDiscussion(state, 1, request, comments, 'owner');
    claim(state);
    applyTriage(work, 'Proposed revision 3\nChanged since revision 2\n- Drop the link.\n- Write the entry once.');
    assert.equal(work.agreementRevision, 3);
    assert.equal(work.stage, 'waiting');
    assert.equal(claim(state), undefined);
});

test('"Looks good" answers without coding', () => {
    const { state, comments, work } = approvedRevision2();
    comments.push(comment(4, 'Looks good'));
    reconcileDiscussion(state, 1, request, comments, 'owner');
    claim(state);
    assert.equal(applyTriage(work, 'No change\nThanks. Merge the draft PR when ready.'), false);
    assert.equal(work.stage, 'preview');
    assert.equal(claim(state), undefined);
});

test('"Looks good" during a running build pauses it instead of coding again', () => {
    const { state, comments, work } = approvedRevision2();
    work.stage = 'queued';
    claim(state);
    comments.push(comment(4, 'Looks good'));
    reconcileDiscussion(state, 1, request, comments, 'owner');
    claim(state);
    assert.equal(applyTriage(work, 'No change\nThanks.'), false);
    assert.equal(work.stage, 'paused');
    assert.match(work.notice ?? '', /revision 2 was interrupted.*\/factory resume/);
    assert.equal(claim(state), undefined);
});

test('a change during a running build stops that attempt and drafts', () => {
    const { state, comments, work } = approvedRevision2();
    work.stage = 'queued';
    claim(state);
    const attempt = work.attempt;
    comments.push(comment(4, "Leave the project link off in today's log."));
    reconcileDiscussion(state, 1, request, comments, 'owner');
    assert.equal(work.attempt, attempt + 1);
    settle(work, attempt, 'stale build', false);
    assert.notEqual(work.result, 'stale build');
    claim(state);
    applyTriage(work, 'Proposed revision 3\nLeave the link off.');
    assert.equal(work.phase, 'planning');
    assert.equal(work.stage, 'waiting');
});
