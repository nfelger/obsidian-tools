import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// Exercise the real entry point with only external processes and GitHub replaced.
function runController(stage: string, phase = 'planning', succeeds = false, loseSaveResponse = false, branchMoves = false, plannerTimeouts = 0, factoryChange = false) {
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
import { writeFileSync, readFileSync } from 'node:fs';
const work = { issue: 1, stage: ${JSON.stringify(stage)}, phase: ${JSON.stringify(phase)},
    turn: '42', revision: 1, attempt: 1, failures: 0, agreement: '', result: 'Prior handoff', runUrl: '',
    head: 'candidate', branch: 'factory/issue-1' };
let state = { version: 1, processed: [], work: { 1: work } };
let storedContent = Buffer.from(JSON.stringify(state)).toString('base64');
const comments = [];
let lostResponse = false;
let reads = 0;
const passes = [];
function record() { writeFileSync(${JSON.stringify(trace)}, JSON.stringify({ state, comments, passes })); }
globalThis.fetch = async (url, options = {}) => {
    const path = new URL(url).pathname.replace('/repos/owner/repo/', '');
    const body = options.body && JSON.parse(options.body);
    let value;
    if (path === 'contents/state.json' && options.method === 'PUT') {
        storedContent = body.content; state = JSON.parse(Buffer.from(body.content, 'base64')); record();
        if (${loseSaveResponse} && state.work[1].stage === 'failed' && !lostResponse) {
            lostResponse = true; throw new TypeError('fetch failed', { cause: new Error('write EPIPE') });
        }
        value = { content: { sha: 'saved' } };
    } else if (path === 'contents/state.json') {
        value = { sha: 'initial', content: storedContent };
    } else if (path === 'git/ref/heads/factory/issue-1') value = { object: { sha: ++reads === 1 ? 'live-head' : 'advanced' } };
    else if (path === 'git/commits/advanced') value = { tree: { sha: 'original-tree' } };
    else if (path === 'git/trees') value = { sha: 'combined-tree' };
    else if (path === 'git/commits' && body.parents[0] === 'advanced') value = { sha: 'combined' };
    else if (path === 'git/refs/heads/factory/issue-1' && body.sha === 'combined' && body.force === false) value = {};
    else if (path === 'pulls') value = [{ html_url: 'example/pr' }];
    else if (path.startsWith('contents/')) {
        if (${factoryChange}) throw new Error('Unexpected release metadata read');
        const files = { 'CHANGELOG.md': '## [0.1.1] - 2026-11-24\\n\\n- Fixed example.', 'manifest.json': '{"version":"0.1.0","minAppVersion":"1"}',
            'package.json': '{}', 'package-lock.json': '{"packages":{"":{}}}', 'versions.json': '{}' };
        value = { content: Buffer.from(files[path.slice(9)]).toString('base64') };
    }
    else if (path === 'issues') value = [{ number: 1, state: 'open', body: '' }];
    else if (path === 'issues/1/comments' && options.method === 'POST') {
        comments.push(body.body); record(); value = {};
    } else if (path === 'issues/1/comments') value = comments.map((body, i) => ({ id: i+1, user: { login: 'github-actions[bot]', type: 'Bot' }, body }));
    else if (path === 'issues/comments/1' && options.method === 'PATCH') { comments[0] = body.body; record(); value = {}; }
    else if (path === ${JSON.stringify(factoryChange ? 'actions/workflows/factory-check.yml/runs' : 'actions/workflows/ci.yml/runs')}) {
        value = { workflow_runs: [{ id: 7, head_branch: 'factory/issue-1', status: 'completed',
            conclusion: ${branchMoves ? "'success'" : "'failure'"}, html_url: 'https://example.test/ci' }] };
    } else if (path === 'actions/runs/7/artifacts') value = { artifacts: [] };
    else throw new Error('Unexpected GitHub call: ' + path);
    return new Response(JSON.stringify(value), { status: 200 });
};
cp.execFileSync = () => '';
cp.spawnSync = (command, args, options) => {
    if (command === 'docker') {
        if (args[args.indexOf('--user') + 1] !== process.getuid() + ':' + process.getgid())
            throw new Error('Coding container must use the runner identity');
        if (${branchMoves}) {
            const input = args.find(v => v.endsWith(':/input:ro')).slice(0, -10);
            const output = args.find(v => v.endsWith(':/output')).slice(0, -8);
            const { verifyOnly } = JSON.parse(readFileSync(input + '/pass.json'));
            const { candidateHead } = JSON.parse(readFileSync(input + '/agreement.json'));
            passes.push({ verifyOnly, candidateHead });
            writeFileSync(output + '/result.json', JSON.stringify({ complete: true, message: 'done',
                changes: [{ path: ${JSON.stringify(factoryChange ? 'factory/state.ts' : 'src/update.ts')}, content: 'combined' }] }));
            return { status: 0, stdout: '', stderr: '' };
        }
        return { status: 1, stdout: '', stderr: 'npm error EACCES /workspace/node_modules' };
    }
    passes.push({ timeout: options.timeout, comment: comments.at(-1) });
    if (passes.length <= ${plannerTimeouts}) return { status: null, stdout: '', stderr: 'planner trace',
        error: Object.assign(new Error('spawn ETIMEDOUT'), { code: 'ETIMEDOUT' }) };
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

test('coding setup failure saves failed state and status before exiting unsuccessfully', () => {
    const result = runController('queued', 'coding');
    assert.equal(result.status, 1);
    assert.equal(result.state.work[1].stage, 'failed');
    assert.equal(result.state.work[1].failures, 1);
    assert.match(result.comments.at(-1), /failed/);
    assert.match(result.comments.at(-1), /EACCES/);
});

test('planner failure and candidate CI failure make the controller fail', () => {
    for (const stage of ['queued', 'verifying']) {
        const result = runController(stage);
        assert.equal(result.status, 1);
        assert.equal(result.state.work[1].stage, 'failed');
        assert.match(result.comments.at(-1), /Provider unavailable|Candidate CI failed/);
    }
});

test('successful planning and idle reconciliation of an old failed issue stay green', () => {
    const success = runController('queued', 'planning', true);
    assert.equal(success.status, 0, success.stderr);
    assert.equal(success.state.work[1].stage, 'waiting');
    const idle = runController('failed');
    assert.equal(idle.status, 0, idle.stderr);
    assert.equal(idle.state.work[1].failures, 0);
});

test('recovering an interrupted attempt reports a failed run after publishing status', () => {
    const result = runController('running');
    assert.equal(result.status, 1);
    assert.equal(result.state.work[1].stage, 'failed');
    assert.match(result.comments.at(-1), /Interrupted run/);
});

test('lost failure-save response still publishes the actual failure and exits red', () => {
    const result = runController('queued', 'coding', false, true);
    assert.equal(result.status, 1);
    assert.equal(result.state.work[1].stage, 'failed');
    assert.equal(result.state.work[1].failures, 1);
    assert.match(result.comments.at(-1), /EACCES/);
    assert.doesNotMatch(result.comments.at(-1), /Interrupted run/);
});

test('the starting acknowledgement becomes the result for the same turn', () => {
    const result = runController('queued', 'planning', true);
    assert.equal(result.comments.length, 1);
    assert.match(result.comments[0], /factory-turn:42/);
    assert.match(result.comments[0], /New handoff/);
});

test('publication race recovers the completed change and verifies again without a second model call', () => {
    const result = runController('queued', 'coding', true, false, true);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.passes, [
        { verifyOnly: false, candidateHead: 'live-head' },
        { verifyOnly: true, candidateHead: 'advanced' },
    ]);
    assert.equal(result.state.work[1].head, 'combined');
    assert.equal(result.state.work[1].stage, 'verifying');
    assert.equal(result.state.work[1].checkpoint, undefined);
});

test('planning retries a timeout once in the same turn, with five minutes per pass', () => {
    for (const timeouts of [1, 2]) {
        const run = runController('queued', 'planning', true, false, false, timeouts);
        assert.deepEqual(run.passes.map((pass: { timeout: number }) => pass.timeout), [300000, 300000]);
        assert.match(run.passes[1].comment, /Retrying once automatically/);
        assert.equal(run.comments.length, 1);
        assert.equal(run.status, timeouts === 1 ? 0 : 1);
        assert.equal(run.state.work[1].stage, timeouts === 1 ? 'waiting' : 'failed');
        assert.match(run.comments[0], timeouts === 1 ? /New handoff/ : /timed out twice.*factory retry/);
    }
});

test('factory-only retries publish without release metadata and report controller checks on the final commit', () => {
    const run = runController('queued', 'coding', true, false, true, 0, true);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.state.work[1].stage, 'preview');
    assert.match(run.comments.at(-1), /Factory checks passed for combined/);
    assert.doesNotMatch(run.comments.at(-1), /Obsidian/);
});
