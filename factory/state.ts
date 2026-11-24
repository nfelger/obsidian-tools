import type { CheckpointRef } from './checkpoint.ts';
export type Stage = 'queued' | 'running' | 'waiting' | 'paused' | 'verifying' | 'preview' | 'failed' | 'blocked' | 'stopped';
export interface Work {
    issue: number; stage: Stage; revision: number; attempt: number; failures: number;
    agreement: string; result: string; runUrl: string;
    phase?: 'planning' | 'coding'; approvedHandoff?: string;
    turn?: string;
    checkpoint?: CheckpointRef;
    factoryOnly?: boolean; publicationPending?: boolean; branch?: string; head?: string; pr?: string; candidate?: string;
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
            if (work.stage !== 'waiting' || !work.result.trim() || work.agreement !== agreement) break;
            work.phase = 'coding'; work.approvedHandoff = work.result; work.stage = 'queued';
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
    work.result = result;
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
    if (work.stage === 'running') work.attempt++;
    work.turn = id;
    work.stage = 'queued';
}
