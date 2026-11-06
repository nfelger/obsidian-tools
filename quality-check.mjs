import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// A failed run must never leave an earlier successful bundle available to upload.
rmSync('build/checked', { recursive: true, force: true });
const commands = ['lint', 'test:coverage', 'test:crap', 'audit:code', 'build'];
for (const command of commands) {
    const result = spawnSync('npm', ['run', '--ignore-scripts', command], { stdio: 'inherit' });
    if (result.error || result.status !== 0) {
        console.error(`Quality gate failed: ${command}`, result.error ?? '');
        process.exit(result.status || 1);
    }
}

const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
mkdirSync('build/checked', { recursive: true });
const assets = {};
for (const name of ['main.js', 'manifest.json', 'styles.css']) {
    const bytes = readFileSync(name);
    assets[name] = createHash('sha256').update(bytes).digest('hex');
    copyFileSync(name, `build/checked/${name}`);
}
writeFileSync('build/checked/quality.json', JSON.stringify({
    sourceSha,
    auditBase: process.env.FALLOW_AUDIT_BASE || 'origin/main',
    checks: commands.map(command => ({ command: `npm run ${command}`, status: 'passed' })),
    assets,
}, null, 2) + '\n');
