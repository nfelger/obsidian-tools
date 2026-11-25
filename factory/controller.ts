import { loadCheckpoint, legacyCheckpoint, type Patch } from './checkpoint.ts';
import { releaseChanges } from './release.ts';
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
import { agreementBody, agreementMarker, applyTriage, claim, empty, needsOwnerDecision, reviseAgreement, settle, type Ledger, type Work } from './state.ts';

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
// Older ledgers used "blocked" for process and CI failures.
for (const work of Object.values(state.work)) {
    if (work.stage === 'blocked' && !needsOwnerDecision(work.result)) work.stage = 'failed';
}
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
const triaging = work?.phase === 'coding' && work.triage === true;
if (work && (work.phase !== 'coding' || triaging)) {
    const attempt = work.attempt;
    const guidance = ['CLAUDE.md', 'WORKFLOW.md'].map(path =>
        `# ${path}\n${readFileSync(`../${path}`, 'utf8')}`).join('\n\n');
    for (let pass = 1; pass <= 2; pass++) {
        const result = spawnSync('node_modules/.bin/flue', ['run', 'agent.ts', '--json', '--message',
            JSON.stringify(triaging
                ? { mode: 'triage', agreement: work.agreement, approvedRevision: work.approvedRevision ?? 1, approvedHandoff: work.approvedHandoff, candidateReport: work.result, guidance }
                : { agreement: work.agreement, revision: work.revision, agreementRevision: work.agreementRevision ?? 0, priorHandoff: work.result, guidance })], {
            encoding: 'utf8', timeout: 5 * 60 * 1000, maxBuffer: 1024 * 1024,
            env: { PATH: process.env.PATH, HOME: process.env.RUNNER_TEMP,
                OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
                PLANNER_MODEL: modelFor('planner') },
        });
        await reconcile();
        if (work.stage !== 'running' || work.attempt !== attempt) break;
        const timedOut = (result.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT';
        const outcome = agentResult(result);
        if (outcome.failed && result.stderr) process.stderr.write(result.stderr);
        if (timedOut && pass === 1) {
            await updateTurn(work, false, 'Planning reached its five-minute limit. Retrying once automatically.');
            continue;
        }
        const message = timedOut
            ? "Planning timed out twice before a plan was ready. Coding hasn’t started. Use `/factory retry` to try again."
            : outcome.message;
        if (triaging && !outcome.failed && !timedOut) {
            if (applyTriage(work, message)) break;
            break;
        }
        settle(work, attempt, message, outcome.failed);
        if ((work.stage as string) === 'waiting') reviseAgreement(work, message);
        break;
    }
    await save();
}
if (work?.phase === 'coding' && work.stage === 'running') {
    const attempt = work.attempt;
    try {
        await upsertAgreement(work);
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
                    const readAt = async (path: string, ref: string) => {
                        const blob = await api(`contents/${path}?ref=${ref}`);
                        return Buffer.from(blob.content, 'base64').toString('utf8');
                    };
                    const changes = output.factoryOnly ? output.changes : await releaseChanges(
                        JSON.parse(await readAt('manifest.json', 'main')).version, output.changes, path => readAt(path, base));
                    work.factoryOnly = output.factoryOnly;
                    await publish(api, repo, work, base, changes, output.message);
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
    const workflow = current.factoryOnly ? 'factory-check.yml' : 'ci.yml';
    const runs = await api(`actions/workflows/${workflow}/runs?head_sha=${current.head}&event=workflow_dispatch&per_page=100`);
    const run = runs.workflow_runs.find((item: any) => item.head_branch === current.branch);
    if (!run) {
        await api(`actions/workflows/${workflow}/dispatches`, 'POST', { ref: current.branch });
        continue;
    }
    if (run.status !== 'completed') continue;
    if (run.conclusion !== 'success') {
        current.stage = 'failed'; current.failures++;
        current.result = `Candidate CI failed: ${run.html_url}\n\n${current.result}`;
        continue;
    }
    if (current.factoryOnly) {
        current.stage = 'preview';
        current.result = `Factory checks passed · builds revision ${current.approvedRevision ?? 1}\n\nFactory checks passed for ${current.head}. Review the [draft PR](${current.pr}) and [checks](${run.html_url}).\n\n${current.result}`;
        continue;
    }
    const name = `bullet-flow-${current.head.slice(0, 12)}-${run.id}-${run.run_attempt}`;
    const artifacts = await api(`actions/runs/${run.id}/artifacts`);
    if (!artifacts.artifacts.some((item: any) => item.name === name && !item.expired)) continue;
    current.stage = 'preview'; current.candidate = name; current.candidates = (current.candidates ?? 0) + 1;
    const preview = `https://codespaces.new/${repo}?ref=${encodeURIComponent(current.branch)}`;
    const report = `Candidate ${current.candidates} · builds revision ${current.approvedRevision ?? 1}\n\nCandidate: **${name}**\nCommit: ${current.head}\n\n[Open Obsidian preview](${preview}) · [Checks](${run.html_url}) · [Draft PR](${current.pr})\n\n${current.result}\n\nTry the acceptance cases above in Obsidian, then reply here with feedback. Merge remains manual.`;
    current.result = report;
}
// State precedes publication so replay can repair a lost comment or response.
await save();
for (const current of Object.values(state.work)) {
    await upsertAgreement(current);
    await updateTurn(current);
}

// Comments can be published again from saved state on the next reconciliation.
async function deliverComment<T>(issue: number, publish: () => Promise<T>): Promise<T | undefined> {
    try {
        return await publish();
    } catch (error) {
        console.warn(`Factory comment delivery deferred for #${issue}: ${error}`);
    }
}

async function upsertAgreement(current: Work) {
    if (!current.agreementText) return;
    const id = await deliverComment(current.issue, async () => {
        const body = agreementBody(current);
        const comments = await pages(`issues/${current.issue}/comments`);
        const existing = comments.find(item => item.user.type === 'Bot' && item.body.startsWith(agreementMarker));
        if (existing?.body === body) return existing.id;
        const saved = await api(existing ? `issues/comments/${existing.id}` : `issues/${current.issue}/comments`, existing ? 'PATCH' : 'POST', { body });
        return existing?.id ?? saved?.id;
    });
    if (id && current.agreementComment !== id) { current.agreementComment = id; await save(); }
}
async function updateTurn(current: Work, acknowledgeOnly = false, progress?: string) {
    await deliverComment(current.issue, () => publishTurn(current, acknowledgeOnly, progress));
}
async function publishTurn(current: Work, acknowledgeOnly: boolean, progress?: string) {
    const marker = current.turn ? `<!-- factory-turn:${current.turn} -->` : '<!-- bullet-flow-factory-status -->';
    const starting = ['queued', 'running'].includes(current.stage);
    const agreementLink = current.agreementComment ? `[current agreement](#issuecomment-${current.agreementComment})` : 'current agreement';
    const planned = current.phase !== 'coding' && current.stage === 'waiting' && current.agreementText === current.result;
    const detail = progress ?? current.notice ?? (starting ? (current.stage === 'queued' ? 'Queued to start.' : 'Starting work.')
        : planned ? `Revision ${current.agreementRevision} is ready in the ${agreementLink} and awaits your approval. Post /factory implement to approve it.` : current.result);
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
// Report failure only after saving state and attempting to publish status.
const failed = Object.values(state.work).filter(work => work.failures > (failuresBefore.get(work.issue) ?? 0));
if (failed.length) {
    console.error(`Factory work failed for issue(s): ${failed.map(work => `#${work.issue}`).join(', ')}. See issue status for details.`);
    process.exitCode = 1;
}
