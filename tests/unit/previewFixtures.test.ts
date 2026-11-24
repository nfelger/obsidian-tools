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

it('seeds the shipped vault with the README layout and disables core Daily Notes', () => {
    const root = mkdtempSync(join(tmpdir(), 'preview-layout-'));
    try {
        seedFixtures('.devcontainer/vault', root, new Date(2026, 10, 17, 12));
        const daily = '+Diary/2026/11/2026-11-17 Tue';
        expect(readFileSync(join(root, daily + '.md'), 'utf8')).toContain('Preview project');
        expect(readFileSync(join(root, 'Start here.md'), 'utf8')).toContain('[[' + daily + ']]');
        expect(JSON.parse(readFileSync(join(root, '.obsidian/core-plugins.json'), 'utf8'))).not.toContain('daily-notes');
        const config = JSON.parse(readFileSync(join(root, '.obsidian/plugins/periodic-notes/data.json'), 'utf8'));
        for (const granularity of ['daily', 'weekly', 'monthly', 'yearly'])
            expect(config[granularity]).toMatchObject({ enabled: true, folder: '+Diary' });
    } finally { rmSync(root, { recursive: true, force: true }); }
});

it('names the weekly note using Thursday when an ISO week crosses a month boundary', () => {
    const root = mkdtempSync(join(tmpdir(), 'preview-week-'));
    try {
        mkdirSync(join(root, 'source'));
        writeFileSync(join(root, 'source/{{weeklyPath}}.md'), '[[{{monthlyPath}}]]');
        seedFixtures(join(root, 'source'), join(root, 'target'), new Date(2026, 7, 31, 12));
        expect(readFileSync(join(root, 'target/+Diary/2026/09/2026-09-W36.md'), 'utf8')).toBe('[[+Diary/2026/2026-08 Aug]]');
    } finally { rmSync(root, { recursive: true, force: true }); }
});
