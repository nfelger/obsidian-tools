import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { plannerEnvironment } from './environment.ts';

test('planner exposes only Flue read/search tools and they inspect repository text', async () => {
    const root = mkdtempSync(join(tmpdir(), 'planner-env-'));
    try {
        writeFileSync(join(root, 'extractLog.ts'), 'const notice = "Moved";\n');
        const factory = plannerEnvironment(root);
        const sandbox = await factory.createSandbox({ id: 'test' });
        const tools = factory.tools!(sandbox, { subagents: {} });
        assert.deepEqual(tools.map(tool => tool.name), ['read', 'grep', 'glob']);
        const read = await tools[0].execute('read-test', { path: 'extractLog.ts' });
        assert.match(JSON.stringify(read.content), /Moved/);
        const grep = await tools[1].execute('grep-test', { pattern: 'Moved', path: '.' });
        assert.match(JSON.stringify(grep.content), /extractLog.ts/);
        const glob = await tools[2].execute('glob-test', { pattern: '*.ts', path: '.' });
        assert.match(JSON.stringify(glob.content), /extractLog.ts/);
    } finally { rmSync(root, { recursive: true, force: true }); }
});
