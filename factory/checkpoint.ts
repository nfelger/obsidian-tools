import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateChanges, type Change } from './changes.ts';
import type { Work } from './state.ts';

export interface CheckpointRef { run: string; revision: number; attempt: number; base: string; artifact?: string }
export interface Patch { changes: Change[]; complete: boolean; message: string }

// Older controllers kept the completed patch and ledger in the same evidence archive.
export function legacyCheckpoint(work: Work): CheckpointRef | undefined {
    const run = work.runUrl.match(/\/actions\/runs\/(\d+)$/)?.[1];
    if (run && work.head && work.result === 'Error: Issue branch changed during coding; refusing to overwrite it.')
        return { run, revision: work.revision, attempt: work.attempt, base: work.head };
}

export function loadCheckpoint(repo: string, work: Work, ref: CheckpointRef): Patch {
    const dir = mkdtempSync(join(tmpdir(), 'factory-recover-'));
    try {
        const name = ref.artifact ?? `coding-evidence-${ref.run}-*`;
        execFileSync('gh', ['run', 'download', ref.run, '--repo', repo, ref.artifact ? '--name' : '--pattern', name, '--dir', dir]);
        // gh extracts pattern matches into per-artifact directories.
        const roots = ref.artifact ? [dir] : [dir, ...readdirSync(dir, { withFileTypes: true })
            .filter(entry => entry.isDirectory() && entry.name.startsWith('coding-evidence-')).map(entry => join(dir, entry.name))];
        for (const root of roots) {
            const files = readdirSync(root);
            let report;
            if (ref.artifact) {
                report = JSON.parse(readFileSync(join(root, 'factory-patch.json'), 'utf8'));
                if (report.base !== ref.base || report.issue !== work.issue ||
                    report.revision !== work.revision || report.attempt !== ref.attempt) continue;
            } else {
                if (!files.includes('factory-state-checkpoint.json')) continue;
                const saved = JSON.parse(readFileSync(join(root, 'factory-state-checkpoint.json'), 'utf8')).work[work.issue];
                if (saved?.revision !== work.revision || saved.attempt !== ref.attempt || saved.branch !== work.branch) continue;
                const outputs = files.filter(path => path.startsWith('factory-code-'));
                if (saved.head !== ref.base || outputs.length !== 1) continue;
                report = JSON.parse(readFileSync(join(root, outputs[0], 'output/result.json'), 'utf8'));
                if (report.failed || report.complete !== true) continue;
            }
            return { changes: validateChanges(report.changes), complete: report.complete === true, message: String(report.message) };
        }
        throw new Error('Checkpoint evidence does not match this issue attempt.');
    } finally { rmSync(dir, { recursive: true, force: true }); }
}

// Build the saved change against its original tree. Git then merges that change
// into the checked-out live head, retaining conflicts in the index for repair.
export function applyCheckpoint(workspace: string, original: string, patch: Patch) {
    const git = (args: string[], input?: string) => execFileSync('git', ['-C', workspace, ...args], { encoding: 'utf8', input });
    const live = git(['rev-parse', 'HEAD']).trim();
    git(['read-tree', original]);
    for (const file of validateChanges(patch.changes)) {
        if (file.content === null) git(['update-index', '--force-remove', '--', file.path]);
        else {
            const blob = git(['hash-object', '-w', '--stdin'], file.content).trim();
            git(['update-index', '--add', '--cacheinfo', '100644', blob, file.path]);
        }
    }
    const tree = git(['write-tree']).trim();
    const commit = git(['-c', 'user.name=Factory', '-c', 'user.email=factory@localhost', 'commit-tree', tree, '-p', original, '-m', 'Recover coding checkpoint']).trim();
    git(['read-tree', live]);
    try { git(['cherry-pick', '--no-commit', commit]); }
    catch (error) {
        const conflicts = git(['diff', '--name-only', '--diff-filter=U']).trim();
        if (!conflicts) throw error;
        return `Resolve and stage the cherry-pick conflicts in these files, preserving incoming changes and approved behavior. Inspect git diff ${original} HEAD for incoming edits and git show ${commit} for the original patch:\n${conflicts}. If the requirements contradict the incoming behavior, report the decision needed.`;
    }
    return '';
}
