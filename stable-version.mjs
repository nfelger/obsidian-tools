// First-parent distance assigns each main revision a stable, repeatable version.
// A deliberate manifest version change starts the next release series.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(manifest.version);
if (!match) throw new Error('Expected a stable source version');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const anchor = git('log', '--first-parent', '-1', '--format=%H',
    '--pickaxe-regex', '-S', '"version"[[:space:]]*:[[:space:]]*"' + manifest.version.replaceAll('.', '[.]') + '"', '--', 'manifest.json');
if (!anchor) throw new Error('Missing release series in main history');
const distance = Number(git('rev-list', '--first-parent', '--count', anchor + '..HEAD'));
manifest.version = [match[1], match[2], Number(match[3]) + distance].join('.');
writeFileSync('manifest.json', JSON.stringify(manifest, null, '\t') + '\n');
console.log('Stable build version', manifest.version);
