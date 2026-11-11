import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completion } from './completion.ts';
test('missing requirements cannot be hidden by a successful process or passing checks', () => {
    for (const message of ['All tests pass', '{}', JSON.stringify({ summary: 'done', acceptanceCases: [], remaining: [] })])
        assert.equal(completion(message).complete, false);
    const report = { summary: 'Implemented cascade', acceptanceCases: [{ id: '7', status: 'incomplete', evidence: 'Project logging missing' }], remaining: [] };
    assert.equal(completion(JSON.stringify(report)).complete, false);
    report.acceptanceCases[0].status = 'complete';
    assert.equal(completion(JSON.stringify(report)).complete, true);
});

test('bare JSON and a single fenced report with prose are accepted without losing long evidence', () => {
    const report = JSON.stringify({ summary: 'Fixed', acceptanceCases: [{ id: '1', status: 'complete', evidence: 'test evidence '.repeat(2000) }], remaining: [] });
    assert.equal(completion(report).complete, true);
    assert.equal(completion('Inspected workspace.\n```json\n' + report + '\n```\nDone.').complete, true);
    assert.equal(completion('```json\n' + report + '\n```\n```json\n' + report + '\n```').complete, false);
    assert.equal(completion(report.slice(0, -10)).complete, false);
});
test('controller publication steps and approved notes do not force more coding; missing behavior still does', () => {
    const report = { summary: 'Fixed and fixtures ready', acceptanceCases: [{ id: '1', status: 'complete', evidence: 'Test passes' }], remaining: [
        { kind: 'publication', detail: 'Working-tree changes need committing by the controller' },
        { kind: 'accepted-assumption', detail: 'Use the handoff default allowing duplicates' },
        { kind: 'protected-documentation', detail: 'CLAUDE.md edit forbidden' },
    ] };
    assert.equal(completion(JSON.stringify(report)).complete, true);
    report.remaining.push({ kind: 'implementation', detail: 'Weekly-date fix still missing' });
    assert.equal(completion(JSON.stringify(report)).complete, false);
    report.remaining.pop(); report.acceptanceCases[0]!.status = 'incomplete';
    assert.equal(completion(JSON.stringify(report)).complete, false);
});
