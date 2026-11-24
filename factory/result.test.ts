import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agentResult } from './result.ts';

const run = (value: unknown, status: number | null = 0) => ({ stdout: JSON.stringify(value), status });
test('only a successful completed envelope supplies a handoff', () => {
    assert.deepEqual(agentResult(run({ outcome: 'completed', message: 'Acceptance cases' })),
        { failed: false, message: 'Acceptance cases' });
    assert.equal(agentResult(run({ outcome: 'completed', message: 'Partial' }, 1)).failed, true);
    assert.equal(agentResult(run({ outcome: 'completed' })).failed, true);
    assert.equal(agentResult(run({ outcome: 'completed', message: '  ' })).failed, true);
});
test('structured failure, abort and setup errors produce concise diagnostics', () => {
    for (const outcome of ['failed', 'aborted', 'error']) {
        const result = agentResult(run({ outcome, error: { message: 'Provider unavailable', details: 'private detail' } }, 1));
        assert.equal(result.failed, true);
        assert.match(result.message, /Provider unavailable/);
        assert.doesNotMatch(result.message, /private detail/);
    }
    assert.equal(agentResult(run({ outcome: 'aborted' }, 130)).failed, true);
});
test('timeouts, signals and malformed output cannot masquerade as a successful reply', () => {
    for (const stdout of ['', 'not JSON', '{"outcome":', 'null', '[]', '{"outcome":"unknown"}']) {
        assert.equal(agentResult({ stdout, status: 0 }).failed, true);
    }
    assert.match(agentResult({ stdout: '', status: null, error: new Error('spawn ETIMEDOUT') }).message, /ETIMEDOUT/);
    assert.match(agentResult({ stdout: '', status: null, signal: 'SIGTERM' }).message, /SIGTERM/);
});

test('structured coding reports are not truncated before completion parsing', () => {
    const message = JSON.stringify({ summary: 'done', acceptanceCases: [{ id: '1', status: 'complete', evidence: 'x'.repeat(15000) }], remaining: [] });
    const result = agentResult({ status: 0, stdout: JSON.stringify({ outcome: 'completed', message }) });
    assert.equal(result.failed, false);
    assert.equal(result.message, message);
    assert.equal(agentResult({ status: 0, stdout: JSON.stringify({ outcome: 'completed', message: 'x'.repeat(1024 * 1024 + 1) }) }).failed, true);
});
