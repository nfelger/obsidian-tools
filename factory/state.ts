import type { CheckpointRef } from './checkpoint.ts';
export type Stage = 'queued' | 'running' | 'waiting' | 'paused' | 'verifying' | 'preview' | 'failed' | 'blocked' | 'stopped';
export interface Work {
    issue: number; stage: Stage; revision: number; attempt: number; failures: number;
    agreement: string; result: string; runUrl: string;
    phase?: 'planning' | 'coding'; approvedHandoff?: string;
    turn?: string;
    checkpoint?: CheckpointRef;
    factoryOnly?: boolean; publicationPending?: boolean; branch?: string; head?: string; pr?: string; candidate?: string;
    agreementRevision?: number; approvedRevision?: number; agreementText?: string; previousAgreement?: string;
    triage?: boolean; resumeStage?: Stage; repair?: string; notice?: string; candidates?: number; agreementComment?: number;
}
export const agreementMarker = '<!-- factory-agreement -->';
/** Record a planner handoff as the current agreement; only changed text makes a new revision. */
export function reviseAgreement(work: Work, handoff: string) {
    if (work.agreementText === handoff) return false;
    if (work.agreementText !== undefined) work.previousAgreement = work.agreementText;
    work.agreementText = handoff;
    work.agreementRevision = (work.agreementRevision ?? 0) + 1;
    return true;
}
export function agreementBody(work: Work) {
    const revision = work.agreementRevision ?? 1;
    const status = work.approvedRevision === revision ? 'approved, being built' : 'awaiting your approval';
    const previous = work.previousAgreement === undefined ? ''
        : `\n\n<details>\n<summary>Revision ${revision - 1}</summary>\n\n${work.previousAgreement}\n\n</details>`;
    return `${agreementMarker}\n**Current agreement · Revision ${revision} · ${status}**\n\n${work.agreementText ?? ''}${previous}`;
}
export type Verdict = 'repair' | 'proposed' | 'question' | 'none';
export function triageVerdict(text: string): Verdict | undefined {
    const first = text.trimStart().split('\n', 1)[0].trim();
    if (/^Repair against revision \d+$/.test(first)) return 'repair';
    if (/^Proposed revision \d+$/.test(first)) return 'proposed';
    if (first === 'Question') return 'question';
    if (first === 'No change') return 'none';
}
/** Apply a planner triage of an owner reply received during coding. Returns true when coding should run. */
export function applyTriage(work: Work, text: string) {
    const verdict = triageVerdict(text);
    const body = text.trimStart().split('\n').slice(1).join('\n').trim();
    work.triage = false;
    if (verdict === 'repair') {
        work.repair = body; work.notice = undefined;
        return true;
    }
    if (verdict === 'proposed') {
        reviseAgreement(work, body);
        work.phase = 'planning'; work.result = body; work.stage = 'waiting'; work.notice = undefined;
        return false;
    }
    if (verdict === 'question') { work.notice = body; work.stage = 'waiting'; return false; }
    if (!verdict) {
        work.notice = `Could not classify the reply. ${text}`.trim(); work.stage = 'failed'; work.failures++;
        return false;
    }
    const resume = work.resumeStage ?? 'preview';
    // A reply that changes nothing must not start another coding pass; the interrupted build waits for /factory resume.
    const interrupted = resume === 'running' || resume === 'queued';
    work.stage = interrupted ? 'paused' : resume;
    work.notice = interrupted
        ? `${body}\n\nThe build of revision ${work.approvedRevision ?? 1} was interrupted to read your reply and is paused. Post /factory resume to continue it.`.trim()
        : body;
    return false;
}
export interface Ledger { version: 1; processed: string[]; work: Record<string, Work> }
export const empty = (): Ledger => ({ version: 1, processed: [], work: {} });
export function command(state: Ledger, issue: number, id: string, body: string, agreement: string) {
    const match = body.trim().match(/^\/factory (start|pause|resume|stop|retry|implement)$/);
    if (!match || state.processed.includes(id)) return;
    state.processed.push(id);
    let work = state.work[issue];
    if (!work) {
        if (match[1] !== 'start') return;
        work = state.work[issue] = { issue, stage: 'queued', turn: id, revision: 1, attempt: 0,
            failures: 0, agreement, result: '', runUrl: '' };
        return;
    }
    const previousStage = work.stage;
    switch (match[1]) {
        case 'implement':
            if (work.phase === 'coding') break;
            if ((work.stage === 'waiting' && work.agreement !== agreement) || ((work.stage === 'queued' || work.stage === 'running') && work.result.trim())) {
                const approved = work.agreementRevision ?? 1;
                work.notice = `Your /factory implement covered revision ${approved}, but a newer reply arrived first. Revision ${approved + 1} is being drafted and will be the one awaiting your approval.`;
                break;
            }
            if (work.stage !== 'waiting' || !work.result.trim()) break;
            work.phase = 'coding'; work.approvedHandoff = work.result; work.stage = 'queued';
            work.approvedRevision = work.agreementRevision ?? 1; work.repair = undefined; work.notice = undefined;
            break;
        case 'stop':
            if (work.stage !== 'stopped') { work.stage = 'stopped'; work.attempt++; }
            break;
        case 'pause':
            if (work.stage === 'queued' || work.stage === 'running' || work.stage === 'waiting' || work.stage === 'verifying' || work.stage === 'preview') {
                work.stage = 'paused'; work.attempt++;
            }
            break;
        case 'resume':
            if (work.stage !== 'waiting' && work.stage !== 'paused') break;
            if (work.agreement !== agreement) { work.agreement = agreement; work.revision++; }
            work.stage = 'queued'; break;
        case 'retry':
            // A fresh owner command authorizes one bounded attempt; keep failure history.
            if (work.stage === 'failed' || work.stage === 'blocked') work.stage = 'queued';
            break;
    }
    if (work.stage !== previousStage) work.turn = id;
}
export function claim(state: Ledger): Work | undefined {
    if (Object.values(state.work).some(work => work.stage === 'running')) return;
    const next = Object.values(state.work).find(work => work.stage === 'queued');
    if (next) { next.stage = 'running'; next.attempt++; }
    return next;
}
export function settle(work: Work, attempt: number, result: string, failed: boolean) {
    if (work.stage !== 'running' || work.attempt !== attempt) return;
    work.result = result; work.notice = undefined;
    work.stage = failed ? 'failed' : 'waiting';
    if (!failed && work.phase !== 'coding' && needsOwnerDecision(result)) work.stage = 'blocked';
    if (failed) work.failures++;
}

export function needsOwnerDecision(handoff: string) {
    return handoff.trimStart().split('\n', 1)[0].trimEnd() === 'Blocking decision';
}

export function feedback(state: Ledger, issue: number, id: string, agreement: string) {
    if (state.processed.includes(id)) return;
    state.processed.push(id);
    const work = state.work[issue];
    if (!work || !['waiting', 'blocked', 'queued', 'running', 'verifying', 'preview'].includes(work.stage)) return;
    if (work.agreement !== agreement) { work.agreement = agreement; work.revision++; }
    if (work.stage === 'running' || work.stage === 'verifying') work.attempt++;
    work.turn = id;
    if (work.phase === 'coding') {
        // A reply against approved work may be a defect or a new expectation; the planner triages it first.
        if (!work.triage && work.stage !== 'waiting') work.resumeStage = work.stage;
        work.triage = true;
    }
    work.stage = 'queued';
}
