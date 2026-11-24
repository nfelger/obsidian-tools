import { loadCheckpoint, legacyCheckpoint, type Patch } from './checkpoint.ts';
import { runCoding } from './coding.ts';
import { publish, ensurePull } from './publication.ts';
import { githubRead } from './github-read.ts';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { saveState } from './state-save.ts';
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
            body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
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
const acknowledgeOnly = process.argv.includes('--acknowledge');
const statePath = 'contents/state.json?ref=factory-state';
let stored: any;
try { stored = await api(statePath); } catch (error) {
    if (!String(error).includes(': 404 ')) throw error;
    if (!acknowledgeOnly) {
        const main = await api('git/ref/heads/main');
        try {
            await api('git/refs', 'POST', { ref: 'refs/heads/factory-state', sha: main.object.sha });
        } catch (createError) {
            // A state branch may already exist without its initial file.
            if (!String(createError).includes(': 422 ')) throw createError;
        }
    }
}
const state: Ledger = stored
    ? JSON.parse(Buffer.from(stored.content, 'base64').toString()) : empty();
if (state.version !== 1) throw new Error('Unsupported controller state version');
let saved = JSON.stringify(state);
async function save() {
    if (stored && JSON.stringify(state) === saved) return;
    const content = JSON.stringify(state, null, 2) + '\n';
    // Keep the actual outcome as evidence even if GitHub remains unavailable.
    writeFileSync(join(process.env.RUNNER_TEMP ?? '/tmp', 'factory-state-checkpoint.json'), content);
    stored = { sha: await saveState(api, stored?.sha, Buffer.from(content).toString('base64')) };
    saved = JSON.stringify(state);
}
// The owner-event job runs outside the coding queue so even a busy runner can acknowledge a turn.
if (acknowledgeOnly) {
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH!, 'utf8'));
    if (event.issue.state === 'open') {
        const comments = await pages(`issues/${event.issue.number}/comments`);
        reconcileDiscussion(state, event.issue.number, event.issue.body ?? '',
            comments.filter(item => item.id <= event.comment.id), owner);
        const current = state.work[event.issue.number];
        if (current?.turn === String(event.comment.id)) await updateTurn(current, true);
    }
    process.exit(0);
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
const failuresBefore = new Map(Object.values(state.work).map(work => [work.issue, work.failures]));
for (const work of Object.values(state.work)) {
    if (work.stage === 'running') settle(work, work.attempt, `Interrupted run: ${work.runUrl}`, true);
}
await reconcile();
for (const item of Object.values(state.work)) {
    if (item.stage === 'queued' && item.phase === 'coding' && !item.checkpoint) item.checkpoint = legacyCheckpoint(item);
}
const work = claim(state);
if (work) work.runUrl = `${process.env.GITHUB_SERVER_URL}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}`;
await save();
if (work) await updateTurn(work);
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
            const revision = work.revision;
            const guard = async () => {
                await reconcile();
                await save();
                if (work.stage !== 'running' || work.attempt !== attempt || work.revision !== revision)
                    throw new Error('Coding attempt superseded by newer issue instructions.');
            };
            const issueBranch = work.branch ?? `factory/issue-${work.issue}`;
            const live = async (): Promise<string> => {
                try {
                    const ref = await api(`git/ref/heads/${issueBranch}`);
                    work.branch = issueBranch;
                    return ref.object.sha;
                } catch (error) {
                    if (work.branch || !String(error).includes(': 404 ')) throw error;
                    return (await api('git/ref/heads/main')).object.sha;
                }
            };
            const budget = { modelPasses: 0 };
            const deadline = Date.now() + 45 * 60 * 1000;
            const ref = work.checkpoint;
            let recovery = ref?.revision === revision ? { base: ref.base, patch: loadCheckpoint(repo, work, ref) } : undefined;
            for (;;) {
                const base = await live();
                const checkpoint = async (patch: Patch) => {
                    writeFileSync(join(process.env.RUNNER_TEMP ?? '/tmp', 'factory-patch.json'),
                        JSON.stringify({ ...patch, base, issue: work.issue, revision, attempt }));
                    const run = process.env.GITHUB_RUN_ID!;
                    work.checkpoint = { base, revision, attempt, run, artifact: `coding-evidence-${run}-${process.env.GITHUB_RUN_ATTEMPT}` };
                    await save();
                };
                const output = await runCoding(repo, base, work, guard, { deadline, recovery, checkpoint, budget });
                await guard();
                try {
                    await publish(api, repo, work, base, output.changes, output.message);
                } catch (error) {
                    if (work.publicationPending || await live() === base) throw error;
                    // Another writer advanced the branch. Reapply our delta, then verify again.
                    if (output.changes.length) recovery = { base, patch: { ...output, complete: true } };
                    if (deadline - Date.now() <= 6 * 60 * 1000) throw new Error('Branch advanced at the coding deadline. Retry to integrate the saved checkpoint.');
                    continue;
                }
                work.result = output.message;
                work.stage = 'verifying';
                work.candidate = undefined;
                work.checkpoint = undefined;
                break;
            }
        }
    } catch (error) {
        settle(work, attempt, String(error).slice(0, 12000), true);
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
}
// State precedes publication so replay can repair a lost comment or response.
await save();
for (const current of Object.values(state.work)) await updateTurn(current);

async function updateTurn(current: import('./state.ts').Work, acknowledgeOnly = false) {
    const marker = current.turn ? `<!-- factory-turn:${current.turn} -->` : '<!-- bullet-flow-factory-status -->';
    const starting = ['queued', 'running'].includes(current.stage);
    const detail = starting ? (current.stage === 'queued' ? 'Queued to start.' : 'Starting work.') : current.result;
    const body = `${marker}\nFactory: **${current.stage}** · attempt ${current.attempt}\n\n${detail}\n\n${current.stage === 'queued' ? '' : current.runUrl}`.trimEnd();
    const comments = await pages(`issues/${current.issue}/comments`);
    if (!acknowledgeOnly && current.turn) {
        for (const item of comments) {
            const prior = /^<!-- factory-turn:(\d+) -->\nFactory: \*\*(queued|running|verifying)\*\*/.exec(item.body);
            if (item.user.type === 'Bot' && prior && Number(prior[1]) < Number(current.turn)) {
                await api(`issues/comments/${item.id}`, 'PATCH', { body: `<!-- factory-turn:${prior[1]} -->\nSuperseded by a newer issue turn.` });
            }
        }
    }
    const matches = comments.filter(item => item.user.type === 'Bot' && item.body.startsWith(marker));
    const [previous, ...duplicates] = matches;
    // A scheduled replay can overlap the fast acknowledgement. Keep the oldest reply.
    if (!acknowledgeOnly) for (const duplicate of duplicates) await api(`issues/comments/${duplicate.id}`, 'DELETE');
    if ((acknowledgeOnly && previous) || previous?.body === body) return;
    await api(previous ? `issues/comments/${previous.id}` : `issues/${current.issue}/comments`, previous ? 'PATCH' : 'POST', { body });
}
// Report failure only after durable state and the user-facing status are saved.
const failed = Object.values(state.work).filter(work => work.failures > (failuresBefore.get(work.issue) ?? 0));
if (failed.length) {
    console.error(`Factory work failed for issue(s): ${failed.map(work => `#${work.issue}`).join(', ')}. See issue status for details.`);
    process.exitCode = 1;
}
