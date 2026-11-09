import { command, type Ledger } from './state.ts';

interface Comment {
    id: number;
    body: string;
    user: { login: string; type: string };
}

export function reconcileDiscussion(
    state: Ledger, issue: number, request: string, comments: Comment[], owner: string,
) {
    const replies: { id: number; body: string }[] = [];
    for (const comment of comments) {
        if (comment.user.login !== owner || comment.user.type === 'Bot') continue;
        if (comment.body.trim().startsWith('/factory')) {
            command(state, issue, String(comment.id), comment.body, JSON.stringify({ request, replies }));
        } else if (comment.body.trim()) {
            replies.push({ id: comment.id, body: comment.body });
        }
    }
}
