// Run from the base checkout. Read candidate blobs as data only.
import { execFileSync } from 'node:child_process';
import { releaseChanges } from './release.ts';

const [base, head] = process.argv.slice(2);
for (const sha of [base, head]) {
    if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Expected full Git commit IDs');
}
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
const ancestor = git('merge-base', base, head).trim();
const read = (sha, path) => git('show', sha + ':' + path);
const paths = git('diff', '--name-only', '--no-renames', '-z', ancestor, head).split('\0').filter(Boolean);
const releasePaths = ['manifest.json', 'package.json', 'package-lock.json', 'versions.json'];
const exceptional = paths.filter(path =>
    /(^|\/)(agents|claude|workflow)\.md$/i.test(path) &&
    !/(^|\/)(AGENTS|CLAUDE|WORKFLOW)\.md$/.test(path) ||
    path.startsWith('.devcontainer/vault/') && path.endsWith('.md') &&
    path.slice('.devcontainer/vault/'.length).split('/').some(part => part.startsWith('.'))
);
if (paths.some(path => releasePaths.includes(path))) {
    try {
        const baseVersion = JSON.parse(read(ancestor, 'manifest.json')).version;
        const expected = await releaseChanges(baseVersion,
            [{ path: 'CHANGELOG.md', content: read(head, 'CHANGELOG.md') }],
            path => Promise.resolve(read(ancestor, path)));
        for (const path of releasePaths) {
            const generated = expected.find(file => file.path === path);
            const mode = sha => git('ls-tree', sha, '--', path).split(' ')[0];
            if (!generated || read(head, path) !== generated.content || mode(head) !== mode(ancestor)) {
                exceptional.push(path);
            }
        }
    } catch {
        exceptional.push('release metadata');
    }
}
console.log(exceptional.length ? 'true' : 'false');
