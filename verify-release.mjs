import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';

const base = process.argv[2];
const changed = execFileSync('git', ['diff', '--no-renames', '--name-only', '-z', base, 'HEAD', '--'],
    { encoding: 'utf8' }).split('\0').filter(Boolean);
const tooling = new Set([
    'verify-release.mjs',
    '.github/CODEOWNERS',
    '.github/workflows/factory-review.yml',
    '.github/workflows/factory.yml',
    '.github/workflows/factory-check.yml',
    '.github/workflows/ci.yml',
    '.github/workflows/release-on-push.yml',
]);
const releaseRequired = changed.some(path => !path.startsWith('factory/') && !tooling.has(path));
if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `release_required=${releaseRequired}\n`);
}
if (!releaseRequired) {
    console.log('No plugin release required for factory and CI tooling changes.');
    process.exit(0);
}

const json = name => JSON.parse(readFileSync(name, 'utf8'));
const previous = JSON.parse(execFileSync('git', ['show', base + ':manifest.json'], { encoding: 'utf8' })).version;
const [major, minor, patch] = previous.split('.').map(Number);
const { version, minAppVersion } = json('manifest.json');
assert.ok([`${major}.${minor}.${patch+1}`, `${major}.${minor+1}.0`, `${major+1}.0.0`].includes(version),
    'Release preparation must select a patch, minor or major bump from ' + previous);
const lock = json('package-lock.json');
for (const actual of [json('package.json').version, lock.version, lock.packages[''].version]) assert.equal(actual, version);
assert.equal(json('versions.json')[version], minAppVersion);
const firstSection = readFileSync('CHANGELOG.md', 'utf8').split(/^## /m)[1];
assert.ok(firstSection?.startsWith('[' + version + '] - ') && /^- /m.test(firstSection), 'Missing dated release notes');
