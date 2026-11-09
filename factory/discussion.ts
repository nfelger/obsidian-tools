import { command, feedback, type Ledger } from './state.ts';

interface Comment {
    id: number;
    body: string;
    user: { login: string; type: string };
}

export function reconcileDiscussion(
    state: Ledger, issue: number, request: string, comments: Comment[], owner: string,
) {
    const ownerComments = comments.filter(comment =>
        comment.user.login === owner && comment.user.type !== 'Bot');
    const lastCommand = ownerComments.filter(comment =>
        state.processed.includes(String(comment.id)) &&
        /^\/factory (start|pause|resume|stop|retry)$/.test(comment.body.trim())).at(-1);
    const work = state.work[issue];
    if (work?.stage === 'waiting' && lastCommand?.body.trim() === '/factory pause') {
        work.stage = 'paused';
    }
    const replies: { id: number; body: string }[] = [];
    for (const comment of ownerComments) {
        if (comment.body.trim().startsWith('/factory')) {
            command(state, issue, String(comment.id), comment.body, JSON.stringify({ request, replies }));
        } else if (comment.body.trim()) {
            replies.push({ id: comment.id, body: comment.body });
            if (comment.id > (lastCommand?.id ?? 0)) {
                feedback(state, issue, String(comment.id), JSON.stringify({ request, replies }));
            }
        }
    }
}
