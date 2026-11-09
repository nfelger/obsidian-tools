import { runCoding } from './coding.ts';
import { publish, ensurePull } from './publication.ts';
import { githubRead } from './github-read.ts';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { reconcileDiscussion } from './discussion.ts';
import { agentResult } from './result.ts';
import { modelFor } from './models.ts';
import { claim, empty, settle, type Ledger } from './state.ts';

const repo = process.env.GITHUB_REPOSITORY!;
const owner = repo.split('/')[0];
const apiRoot = `https://api.github.com/repos/${repo}`;
async function api(path: string, method = 'GET', body?: unknown): Promise<any> {
    const headers = {
        Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
    };
    const response = method === 'GET'
        ? await githubRead(`${apiRoot}/${path}`, headers)
        : await fetch(`${apiRoot}/${path}`, { method, headers,
            body: body === undefined ? undefined : JSON.stringify(body) });
    if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
    return response.status === 204 ? null : response.json();
}
async function pages(path: string) {
    const items = [];
    for (let page = 1; ; page++) {
        const batch = await api(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
        items.push(...batch);
        if (batch.length < 100) return items;
    }
}
const statePath = 'contents/state.json?ref=factory-state';
let stored: any;
try { stored = await api(statePath); } catch (error) {
    if (!String(error).includes(': 404 ')) throw error;
    const main = await api('git/ref/heads/main');
    try {
        await api('git/refs', 'POST', { ref: 'refs/heads/factory-state', sha: main.object.sha });
    } catch (createError) {
        // A state branch may already exist without its initial file.
        if (!String(createError).includes(': 422 ')) throw createError;
    }
}
const state: Ledger = stored
    ? JSON.parse(Buffer.from(stored.content, 'base64').toString()) : empty();
if (state.version !== 1) throw new Error('Unsupported controller state version');
let saved = JSON.stringify(state);
async function save() {
    if (stored && JSON.stringify(state) === saved) return;
    const response = await api('contents/state.json', 'PUT', {
        branch: 'factory-state', sha: stored?.sha, message: 'Reconcile factory state',
        content: Buffer.from(JSON.stringify(state, null, 2) + '\n').toString('base64'),
    });
    stored = { sha: response.content.sha };
    saved = JSON.stringify(state);
}
async function reconcile() {
    const issues = await pages('issues?state=all&sort=created&direction=asc');
    for (const issue of issues.filter(item => !item.pull_request)) {
        const comments = await pages(`issues/${issue.number}/comments`);
        reconcileDiscussion(state, issue.number, issue.body ?? '', comments, owner);
        const work = state.work[issue.number];
        if (work && issue.state === 'closed' && work.stage !== 'stopped') {
            work.stage = 'stopped'; work.attempt++;
        }
    }
}
// A prior runner died after persisting its claim. Preserve that attempt as failed.
for (const work of Object.values(state.work)) {
    if (work.stage === 'running') settle(work, work.attempt, `Interrupted run: ${work.runUrl}`, true);
}
await reconcile();
const work = claim(state);
if (work) work.runUrl = `${process.env.GITHUB_SERVER_URL}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}`;
await save();
if (work && work.phase !== 'coding') {
    const attempt = work.attempt;
    const guidance = ['CLAUDE.md', 'WORKFLOW.md'].map(path =>
        `# ${path}\n${readFileSync(`../${path}`, 'utf8')}`).join('\n\n');
    const result = spawnSync('node_modules/.bin/flue', ['run', 'agent.ts', '--json', '--message',
        JSON.stringify({ agreement: work.agreement, revision: work.revision, priorHandoff: work.result, guidance })], {
        encoding: 'utf8', timeout: 120000, maxBuffer: 1024 * 1024,
        env: { PATH: process.env.PATH, HOME: process.env.RUNNER_TEMP,
            OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
            PLANNER_MODEL: modelFor('planner') },
    });
    await reconcile();
    const outcome = agentResult(result);
    if (outcome.failed && result.stderr) process.stderr.write(result.stderr);
    settle(work, attempt, outcome.message, outcome.failed);
    await save();
}
if (work?.phase === 'coding') {
    const attempt = work.attempt;
    try {
        if (work.publicationPending) {
            await ensurePull(api, repo, work, work.result);
            work.stage = 'verifying';
        } else {
        const base = work.head ?? (await api('git/ref/heads/main')).object.sha;
        const output = runCoding(repo, base, work);
        await reconcile();
        if (work.stage === 'running' && work.attempt === attempt) {
            work.result = output.message;
            await publish(api, repo, work, base, output.changes, output.message);
            work.stage = 'verifying';
            work.candidate = undefined;
        }
        }
    } catch (error) {
        settle(work, attempt, `${String(error)}\n\n${work.result}`.slice(0, 12000), true);
    }
    await save();
}
for (const current of Object.values(state.work)) {
    if (current.stage !== 'verifying' || !current.head || !current.branch) continue;
    const runs = await api(`actions/workflows/ci.yml/runs?head_sha=${current.head}&event=workflow_dispatch&per_page=100`);
    const run = runs.workflow_runs.find((item: any) => item.head_branch === current.branch);
    if (!run) {
        await api('actions/workflows/ci.yml/dispatches', 'POST', { ref: current.branch });
        continue;
    }
    if (run.status !== 'completed') continue;
    if (run.conclusion !== 'success') {
        current.stage = 'blocked'; current.failures++;
        current.result = `Candidate CI failed: ${run.html_url}\n\n${current.result}`;
        continue;
    }
    const name = `bullet-flow-${current.head.slice(0, 12)}-${run.id}-${run.run_attempt}`;
    const artifacts = await api(`actions/runs/${run.id}/artifacts`);
    if (!artifacts.artifacts.some((item: any) => item.name === name && !item.expired)) continue;
    current.stage = 'preview'; current.candidate = name;
    const preview = `https://codespaces.new/${repo}?ref=${encodeURIComponent(current.branch)}`;
    const report = `Candidate: **${name}**\nCommit: ${current.head}\n\n[Open Obsidian preview](${preview}) · [Checks](${run.html_url}) · [Draft PR](${current.pr})\n\n${current.result}\n\nTry the acceptance cases above in Obsidian, then reply here with feedback. Merge remains manual.`;
    current.result = report;
    const marker = `<!-- factory-candidate:${name} -->`;
    const comments = await pages(`issues/${current.issue}/comments`);
    if (!comments.some(item => item.user.type === 'Bot' && item.body.startsWith(marker))) {
        await api(`issues/${current.issue}/comments`, 'POST', { body: `${marker}\n${report}` });
    }
}
await save();
// One stable status comment per issue; replay repairs publication after a crash.
for (const current of Object.values(state.work)) {
    const marker = '<!-- bullet-flow-factory-status -->';
    const body = `${marker}\nFactory: **${current.stage}** · specification ${current.revision} · attempt ${current.attempt}\n\n${current.result}\n\n${current.runUrl}\n\nCommands: /factory pause, resume, stop, retry, implement (each as a separate comment).`;
    const comments = await pages(`issues/${current.issue}/comments`);
    const previous = comments.find(item => item.user.type === 'Bot' && item.body.startsWith(marker));
    if (previous?.body === body) continue;
    await api(previous ? `issues/comments/${previous.id}` : `issues/${current.issue}/comments`, previous ? 'PATCH' : 'POST', { body });
}
