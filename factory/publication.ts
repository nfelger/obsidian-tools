import type { Change } from './changes.ts';
import type { Work } from './state.ts';
type Api = (path: string, method?: string, body?: unknown) => Promise<any>;
export async function publish(api: Api, repo: string, work: Work, base: string, changes: Change[], summary: string) {
    const branch = work.branch ?? `factory/issue-${work.issue}`;
    if (work.branch) {
        const ref = await api(`git/ref/heads/${branch}`);
        if (ref.object.sha !== base) throw new Error('Issue branch changed during coding; refusing to overwrite it.');
    }
    const parent = await api(`git/commits/${base}`);
    const tree = await api('git/trees', 'POST', { base_tree: parent.tree.sha,
        tree: changes.map(file => file.content === null
            ? { path: file.path, mode: '100644', type: 'blob', sha: null }
            : { path: file.path, mode: '100644', type: 'blob', content: file.content }) });
    const commit = await api('git/commits', 'POST', { message: `Implement issue #${work.issue} (revision ${work.revision})`,
        tree: tree.sha, parents: [base] });
    if (work.branch) {
        const ref = await api(`git/ref/heads/${branch}`);
        if (ref.object.sha !== base) throw new Error('Issue branch changed during coding; refusing to overwrite it.');
        await api(`git/refs/heads/${branch}`, 'PATCH', { sha: commit.sha, force: false });
    } else {
        await api('git/refs', 'POST', { ref: `refs/heads/${branch}`, sha: commit.sha });
    }
    // Persist the branch identity in memory even if PR publication fails.
    work.branch = branch; work.head = commit.sha;
    work.publicationPending = true;
    await ensurePull(api, repo, work, summary);
}
export async function ensurePull(api: Api, repo: string, work: Work, summary: string) {
    const branch = work.branch!;
    const pulls = await api(`pulls?state=open&head=${encodeURIComponent(repo.split('/')[0] + ':' + branch)}`);
    const pr = pulls[0] ?? await api('pulls', 'POST', { base: 'main', head: branch, draft: true,
        title: `Factory: issue #${work.issue}`, body: `Implements #${work.issue}.\n\n${summary}\n\nManual review and merge required.` });
    work.pr = pr.html_url; work.publicationPending = false;
}
