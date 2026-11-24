import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const json = name => JSON.parse(readFileSync(name, 'utf8'));
const previous = JSON.parse(execFileSync('git', ['show', process.argv[2] + ':manifest.json'], { encoding: 'utf8' })).version;
const [major, minor, patch] = previous.split('.').map(Number);
const { version, minAppVersion } = json('manifest.json');
assert.ok([`${major}.${minor}.${patch+1}`, `${major}.${minor+1}.0`, `${major+1}.0.0`].includes(version),
    'Release preparation must select a patch, minor or major bump from ' + previous);
const lock = json('package-lock.json');
for (const actual of [json('package.json').version, lock.version, lock.packages[''].version]) assert.equal(actual, version);
assert.equal(json('versions.json')[version], minAppVersion);
const firstSection = readFileSync('CHANGELOG.md', 'utf8').split(/^## /m)[1];
assert.ok(firstSection?.startsWith('[' + version + '] - ') && /^- /m.test(firstSection), 'Missing dated release notes');
