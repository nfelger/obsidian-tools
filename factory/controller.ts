import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { command, claim, empty, settle, type Ledger } from './state.ts';

const repo = process.env.GITHUB_REPOSITORY!;
const owner = repo.split('/')[0];
const apiRoot = `https://api.github.com/repos/${repo}`;
async function api(path: string, method = 'GET', body?: unknown): Promise<any> {
    const response = await fetch(`${apiRoot}/${path}`, { method, headers: {
        Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
    }, body: body === undefined ? undefined : JSON.stringify(body) });
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
        for (const comment of comments) {
            if (comment.user.login !== owner || comment.user.type === 'Bot') continue;
            command(state, issue.number, String(comment.id), comment.body, issue.body ?? '');
        }
        const work = state.work[issue.number];
        if (work && issue.state === 'closed' && work.stage !== 'stopped') {
            work.stage = 'stopped'; work.attempt++;
        }
    }
}
await reconcile();
// A prior runner died after persisting its claim. Preserve that attempt as failed.
for (const work of Object.values(state.work)) {
    if (work.stage === 'running') settle(work, work.attempt, `Interrupted run: ${work.runUrl}`, true);
}
const work = claim(state);
if (work) work.runUrl = `${process.env.GITHUB_SERVER_URL}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}`;
await save();
if (work) {
    const attempt = work.attempt;
    const guidance = readFileSync('../CLAUDE.md', 'utf8');
    const result = spawnSync('node_modules/.bin/flue', ['run', 'agent.ts', '--message',
        JSON.stringify({ agreement: work.agreement, revision: work.revision, guidance })], {
        encoding: 'utf8', timeout: 120000, maxBuffer: 1024 * 1024,
        env: { PATH: process.env.PATH, HOME: process.env.RUNNER_TEMP,
            OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
            OPENROUTER_MODEL: process.env.OPENROUTER_MODEL },
    });
    await reconcile();
    settle(work, attempt, (result.stdout || result.stderr || String(result.error)).slice(0, 12000), result.status !== 0);
    await save();
}
// One stable status comment per issue; replay repairs publication after a crash.
for (const current of Object.values(state.work)) {
    const marker = '<!-- bullet-flow-factory-status -->';
    const body = `${marker}\nFactory: **${current.stage}** · specification ${current.revision} · attempt ${current.attempt}\n\n${current.result}\n\n${current.runUrl}\n\nCommands: /factory pause, resume, stop, retry (each as a separate comment).`;
    const comments = await pages(`issues/${current.issue}/comments`);
    const previous = comments.find(item => item.user.type === 'Bot' && item.body.startsWith(marker));
    if (previous?.body === body) continue;
    await api(previous ? `issues/comments/${previous.id}` : `issues/${current.issue}/comments`, previous ? 'PATCH' : 'POST', { body });
}
