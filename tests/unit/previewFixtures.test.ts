import { it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedFixtures } from '../../preview-fixtures.mjs';

it('materializes current-period fixture paths and content while preserving plugin configuration', () => {
    const root = mkdtempSync(join(tmpdir(), 'fixtures-'));
    try {
        const source = join(root, 'source'), target = join(root, 'target');
        mkdirSync(join(source, '.obsidian'), { recursive: true });
        writeFileSync(join(source, '{{week}}.md'), '[[{{today}}]] {{month}} {{year}}');
        writeFileSync(join(source, '.obsidian/data.json'), '{"enabled":true}');
        seedFixtures(source, target, new Date(2026, 10, 11, 12));
        expect(readFileSync(join(target, '2026-W46.md'), 'utf8')).toBe('[[2026-11-11]] 2026-11 2026');
        expect(readFileSync(join(target, '.obsidian/data.json'), 'utf8')).toBe('{"enabled":true}');
    } finally { rmSync(root, { recursive: true, force: true }); }
});
