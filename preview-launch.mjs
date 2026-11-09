import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import ObsidianLauncher from 'obsidian-launcher';

const root = resolve('.preview');
const candidateDir = resolve(root, 'candidate');
const vault = resolve(root, 'vault');
const repo = 'nfelger/obsidian-tools';
const run = (command, args) => execFileSync(command, args, { encoding: 'utf8' }).trim();
const api = endpoint => JSON.parse(run('gh', ['api', endpoint]));
mkdirSync(root, { recursive: true });
const pinFile = resolve(root, 'commit');
const sha = existsSync(pinFile) ? readFileSync(pinFile, 'utf8').trim() : run('git', ['rev-parse', 'HEAD']);

async function downloadCandidate() {
    const endpoint = `repos/${repo}/actions/workflows/ci.yml/runs?head_sha=${sha}&status=success`;
    for (let attempt = 0; attempt < 60; attempt++) {
        const runs = api(endpoint).workflow_runs;
        for (const ci of runs) {
            if (!['push', 'workflow_dispatch'].includes(ci.event) || ci.head_sha !== sha) continue;
            const name = `bullet-flow-${sha.slice(0, 12)}-${ci.id}-${ci.run_attempt}`;
            const artifacts = api(`repos/${repo}/actions/runs/${ci.id}/artifacts`).artifacts;
            if (!artifacts.some(item => item.name === name && !item.expired)) continue;
            rmSync(candidateDir, { recursive: true, force: true });
            run('gh', ['run', 'download', String(ci.id), '--repo', repo, '--name', name, '--dir', candidateDir]);
            return;
        }
        console.log(`Waiting for a successful CI candidate for ${sha}...`);
        await new Promise(done => setTimeout(done, 10000));
    }
    throw new Error('No successful candidate after ten minutes. Check GitHub Actions, then restart the preview.');
}

if (!existsSync(pinFile)) await downloadCandidate();
run(process.execPath, ['preview-verify.mjs', candidateDir, sha]);
writeFileSync(pinFile, sha);
if (process.argv.includes('--reset')) rmSync(vault, { recursive: true, force: true });
if (!existsSync(vault)) cpSync('.devcontainer/vault', vault, { recursive: true });
const candidate = JSON.parse(readFileSync(resolve(candidateDir, 'candidate.json'), 'utf8'));
writeFileSync(resolve(vault, 'Candidate.md'), `# Tested candidate\n\n${candidate.candidate}\n\nCommit: ${sha}\n\n[CI evidence](${candidate.runUrl})\n\n[Stop or delete this Codespace](https://github.com/codespaces)\n`);
const env = Object.fromEntries(['HOME', 'PATH', 'DISPLAY', 'USER', 'LANG', 'XDG_RUNTIME_DIR', 'DBUS_SESSION_BUS_ADDRESS'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
const launcher = new ObsidianLauncher();
const { proc } = await launcher.launch({
    appVersion: 'latest', vault, plugins: [candidateDir],
    args: ['--disable-dev-shm-usage'],
    spawnOptions: { env, stdio: 'inherit' },
});
proc.on('exit', code => { process.exitCode = code ?? 1; });
