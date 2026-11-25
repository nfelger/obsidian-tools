import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateChanges } from './changes.ts';
test('publication accepts product text changes and deletion, rejecting control files and traversal', () => {
    assert.equal(validateChanges([{ path: 'src/main.ts', content: 'new' }, { path: 'tests/old.ts', content: null }]).length, 2);
    for (const path of ['factory/package.json', 'factory/review-exceptions.mjs', 'factory/AGENTS.md', 'factory/node_modules/bad.ts', '.github/workflows/ci.yml', 'package.json', 'src/../package.json', '/src/main.ts', 'src//main.ts']) {
        assert.throws(() => validateChanges([{ path, content: 'bad' }]));
    }
    for (const path of ['factory/state.ts', 'factory/state.test.ts', 'factory/README.md'])
        validateChanges([{ path, content: 'reviewed change' }]);
    assert.throws(() => validateChanges([]));
    assert.throws(() => validateChanges([{ path: 'src/a', content: 'x'.repeat(1024 * 1024 + 1) }]));
});
test('product docs are allowed but nested agent guidance remains protected with exact diagnostics', () => {
    validateChanges([{ path: 'CHANGELOG.md', content: 'entry' }, { path: 'README.md', content: 'usage' }]);
    for (const path of ['CLAUDE.md', '.fallowrc.json'])
        validateChanges([{ path, content: 'architecture update' }]);
    for (const path of ['claude.md', 'AGENTS.md', 'WORKFLOW.md', '.oxlintrc.json', 'tests/CLAUDE.md', 'src/AGENTS.md'])
        assert.throws(() => validateChanges([{ path, content: 'instructions' }]), error => String(error).includes(path));
});
test('preview fixture Markdown is publishable but hidden config and scripts are protected', () => {
    validateChanges([{ path: '.devcontainer/vault/Weekly/{{week}}.md', content: 'sample' }]);
    for (const path of ['.devcontainer/start.sh', '.devcontainer/vault/.obsidian/data.md', '.devcontainer/vault/a/.hidden.md', '.devcontainer/vault/script.js', '.devcontainer/vault/CLAUDE.md'])
        assert.throws(() => validateChanges([{ path, content: 'bad' }]));
});
