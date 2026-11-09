export type Stage = 'queued' | 'running' | 'waiting' | 'blocked' | 'stopped';
export interface Work {
    issue: number; stage: Stage; revision: number; attempt: number; failures: number;
    agreement: string; result: string; runUrl: string;
}
export interface Ledger { version: 1; processed: string[]; work: Record<string, Work> }
export const empty = (): Ledger => ({ version: 1, processed: [], work: {} });
export function command(state: Ledger, issue: number, id: string, body: string, agreement: string) {
    const match = body.trim().match(/^\/factory (start|pause|resume|stop|retry)$/);
    if (!match || state.processed.includes(id)) return;
    state.processed.push(id);
    let work = state.work[issue];
    if (!work) {
        if (match[1] !== 'start') return;
        work = state.work[issue] = { issue, stage: 'queued', revision: 1, attempt: 0,
            failures: 0, agreement, result: '', runUrl: '' };
        return;
    }
    switch (match[1]) {
        case 'stop':
            if (work.stage !== 'stopped') { work.stage = 'stopped'; work.attempt++; }
            break;
        case 'pause':
            if (work.stage === 'queued' || work.stage === 'running') {
                work.stage = 'waiting'; work.attempt++;
            }
            break;
        case 'resume':
            if (work.stage !== 'waiting') break;
            if (work.agreement !== agreement) { work.agreement = agreement; work.revision++; }
            work.stage = 'queued'; break;
        case 'retry':
            if (work.stage === 'blocked' && work.failures < 3) work.stage = 'queued';
            break;
    }
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
    work.stage = failed ? 'blocked' : 'waiting';
    if (failed) work.failures++;
}
