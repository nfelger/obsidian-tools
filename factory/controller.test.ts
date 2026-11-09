import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// Exercise the real entry point with only external processes and GitHub replaced.
function runController(stage: string, phase = 'planning', succeeds = false) {
    const root = mkdtempSync(join(tmpdir(), 'controller-test-'));
    const trace = join(root, 'trace.json');
    const preload = join(root, 'external.mjs');
    const cwd = join(root, 'factory');
    mkdirSync(cwd);
    writeFileSync(join(root, 'CLAUDE.md'), 'Test guidance');
    writeFileSync(join(root, 'WORKFLOW.md'), 'Test workflow');
    writeFileSync(preload, `
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { writeFileSync } from 'node:fs';
const work = { issue: 1, stage: ${JSON.stringify(stage)}, phase: ${JSON.stringify(phase)},
    revision: 1, attempt: 1, failures: 0, agreement: '', result: 'Prior handoff', runUrl: '',
    head: 'candidate', branch: 'factory/issue-1' };
let state = { version: 1, processed: [], work: { 1: work } };
const comments = [];
function record() { writeFileSync(${JSON.stringify(trace)}, JSON.stringify({ state, comments })); }
globalThis.fetch = async (url, options = {}) => {
    const path = new URL(url).pathname.replace('/repos/owner/repo/', '');
    const body = options.body && JSON.parse(options.body);
    let value;
    if (path === 'contents/state.json' && options.method === 'PUT') {
        state = JSON.parse(Buffer.from(body.content, 'base64')); record();
        value = { content: { sha: 'saved' } };
    } else if (path === 'contents/state.json') {
        value = { sha: 'initial', content: Buffer.from(JSON.stringify(state)).toString('base64') };
    } else if (path === 'issues') value = [{ number: 1, state: 'open', body: '' }];
    else if (path === 'issues/1/comments' && options.method === 'POST') {
        comments.push(body.body); record(); value = {};
    } else if (path === 'issues/1/comments') value = [];
    else if (path === 'actions/workflows/ci.yml/runs') {
        value = { workflow_runs: [{ head_branch: 'factory/issue-1', status: 'completed',
            conclusion: 'failure', html_url: 'https://example.test/ci' }] };
    } else throw new Error('Unexpected GitHub call: ' + path);
    return new Response(JSON.stringify(value), { status: 200 });
};
cp.execFileSync = () => '';
cp.spawnSync = (command, args) => {
    if (command === 'docker') {
        if (args[args.indexOf('--user') + 1] !== process.getuid() + ':' + process.getgid())
            throw new Error('Coding container must use the runner identity');
        return { status: 1, stdout: '', stderr: 'npm error EACCES /workspace/node_modules' };
    }
    return { status: ${succeeds ? 0 : 1}, stdout: JSON.stringify(${succeeds ? "{ outcome: 'completed', message: 'New handoff' }" : "{ outcome: 'failed', error: { message: 'Provider unavailable' } }"}), stderr: '' };
};
syncBuiltinESMExports();
record();
`);
    try {
        const result = spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), '--import', preload, resolve('controller.ts')], {
            cwd, encoding: 'utf8', env: { ...process.env, GITHUB_REPOSITORY: 'owner/repo', RUNNER_TEMP: root },
        });
        return { ...result, ...JSON.parse(readFileSync(trace, 'utf8')) };
    } finally { rmSync(root, { recursive: true, force: true }); }
}

test('coding setup failure saves blocked state and status before exiting unsuccessfully', () => {
    const result = runController('queued', 'coding');
    assert.equal(result.status, 1);
    assert.equal(result.state.work[1].stage, 'blocked');
    assert.equal(result.state.work[1].failures, 1);
    assert.match(result.comments.at(-1), /blocked/);
    assert.match(result.comments.at(-1), /EACCES/);
});

test('planner failure and candidate CI failure make the controller fail', () => {
    for (const stage of ['queued', 'verifying']) {
        const result = runController(stage);
        assert.equal(result.status, 1);
        assert.equal(result.state.work[1].stage, 'blocked');
        assert.match(result.comments.at(-1), /Provider unavailable|Candidate CI failed/);
    }
});

test('successful planning and idle reconciliation of an old blocked issue stay green', () => {
    const success = runController('queued', 'planning', true);
    assert.equal(success.status, 0, success.stderr);
    assert.equal(success.state.work[1].stage, 'waiting');
    const idle = runController('blocked');
    assert.equal(idle.status, 0, idle.stderr);
    assert.equal(idle.state.work[1].failures, 0);
});

test('recovering an interrupted attempt reports a failed run after publishing status', () => {
    const result = runController('running');
    assert.equal(result.status, 1);
    assert.equal(result.state.work[1].stage, 'blocked');
    assert.match(result.comments.at(-1), /Interrupted run/);
});
