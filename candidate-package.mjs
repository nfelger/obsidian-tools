import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';

const quality = JSON.parse(readFileSync('build/checked/quality.json', 'utf8'));
const { GITHUB_SHA: sha, GITHUB_RUN_ID: runId, GITHUB_RUN_ATTEMPT: attempt,
    GITHUB_REPOSITORY: repository, GITHUB_SERVER_URL: server = 'https://github.com',
    E2E_RESULT: e2eResult } = process.env;
if (!/^[a-f0-9]{40}$/.test(sha ?? '') || quality.sourceSha !== sha) {
    throw new Error('Build evidence does not match this workflow commit.');
}
if (!/^\d+$/.test(runId ?? '') || !/^\d+$/.test(attempt ?? '') ||
    !/^[\w.-]+\/[\w.-]+$/.test(repository ?? '') || e2eResult !== 'success') {
    throw new Error('Candidate requires a successful E2E job and valid workflow identity.');
}
const expected = ['lint', 'test:coverage', 'test:crap', 'audit:code', 'build'];
if (!expected.every(command => quality.checks.some(check =>
    check.command === `npm run ${command}` && check.status === 'passed'))) {
    throw new Error('Required quality evidence is missing.');
}
const names = ['main.js', 'manifest.json', 'styles.css'];
for (const name of names) {
    const actual = createHash('sha256').update(readFileSync(`build/checked/${name}`)).digest('hex');
    if (actual !== quality.assets[name]) throw new Error(`Build asset changed: ${name}`);
}
const candidate = `bullet-flow-${sha.slice(0, 12)}-${runId}-${attempt}`;
const runUrl = `${server}/${repository}/actions/runs/${runId}/attempts/${attempt}`;
rmSync('build/candidate', { recursive: true, force: true });
mkdirSync('build/candidate', { recursive: true });
for (const name of [...names, 'quality.json']) {
    copyFileSync(`build/checked/${name}`, `build/candidate/${name}`);
}
writeFileSync('build/candidate/candidate.json', JSON.stringify({
    candidate, sourceSha: sha, runUrl, e2e: 'passed', assets: quality.assets,
}, null, 2) + '\n');
const instructions = `# Bullet Flow candidate\n\n` +
    `Candidate: ${candidate}\nCommit: ${sha}\nChecks: ${runUrl}\n\n` +
    `Lint, coverage, code audit, build, and desktop Obsidian E2E passed. ` +
    `Mobile behavior and manual installation have not been verified by this run.\n\n` +
    `## Install this exact build\n\n` +
    `Use a disposable test vault first. Disable Bullet Flow and remove this repository ` +
    `from BRAT tracking in that vault (this does not uninstall the plugin). ` +
    `Save the currently installed main.js, manifest.json and styles.css. ` +
    `Copy these three candidate files into <vault>/.obsidian/plugins/bullet-flow/, ` +
    `replacing the existing files, then reload Obsidian and enable Bullet Flow. ` +
    `Keep data.json unchanged. The manifest retains the stable base version; ` +
    `candidate.json identifies this exact candidate.\n\n` +
    `## Return to stable\n\n` +
    `Disable Bullet Flow, restore the three saved files (or download them from a ` +
    `specific stable release), then reload Obsidian. Re-enable BRAT tracking if desired. ` +
    `If historical development releases exist, freeze BRAT to the chosen stable tag ` +
    `rather than selecting latest. A plugin rollback does not undo changes to notes.\n\n` +
    `Candidates are Actions artifacts, not GitHub Releases, and never auto-update. ` +
    `Download this bundle before artifact retention expires. ` +
    `See docs/AUTO-DEPLOY.md for device checks and installation details.\n`;
writeFileSync('build/candidate/INSTALL.md', instructions);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `name=${candidate}\n`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, instructions);
