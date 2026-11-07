import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const [directory, sha] = process.argv.slice(2);
const candidate = JSON.parse(readFileSync(join(directory, 'candidate.json'), 'utf8'));
if (!/^[a-f0-9]{40}$/.test(sha) || candidate.sourceSha !== sha || candidate.e2e !== 'passed') {
    throw new Error('Candidate does not match this commit or has not passed E2E.');
}
for (const name of ['main.js', 'manifest.json', 'styles.css']) {
    const hash = createHash('sha256').update(readFileSync(join(directory, name))).digest('hex');
    if (hash !== candidate.assets[name]) throw new Error(`Candidate integrity failed: ${name}`);
}
console.log(`Verified candidate for ${sha}`);
