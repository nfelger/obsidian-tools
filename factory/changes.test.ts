import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateChanges } from './changes.ts';
test('publication accepts product text changes and deletion, rejecting control files and traversal', () => {
    assert.equal(validateChanges([{ path: 'src/main.ts', content: 'new' }, { path: 'tests/old.ts', content: null }]).length, 2);
    for (const path of ['factory/coder.ts', '.github/workflows/ci.yml', 'package.json', 'src/../package.json', '/src/main.ts', 'src//main.ts']) {
        assert.throws(() => validateChanges([{ path, content: 'bad' }]));
    }
    assert.throws(() => validateChanges([]));
    assert.throws(() => validateChanges([{ path: 'src/a', content: 'x'.repeat(1024 * 1024 + 1) }]));
});
