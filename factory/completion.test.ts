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
