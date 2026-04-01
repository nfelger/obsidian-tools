import { expect } from '@wdio/globals';
import { describe, it, before } from 'mocha';
import {
    createVaultFile, waitForCacheReady, readVaultFile, openFileAtLine, runCommand
} from '../helpers/vault';
import { todayDailyPath, AREA_NOTE_PATH } from '../helpers/paths';

describe('extractLog', () => {
    before(async () => {
        await createVaultFile(todayDailyPath(), [
            '## Log',
            '',
            '- [[My Area]] notes from today',
            '  - Child item 1',
            '  - Child item 2',
        ].join('\n'));

        await createVaultFile(AREA_NOTE_PATH, [
            '# My Area',
            '',
            '## Log',
        ].join('\n'));

        // Wait for metadataCache to index both files:
        // - source daily note: extractLog needs listItems from cache to find children
        // - target area note: needed to resolve [[My Area]] wikilink
        await waitForCacheReady(todayDailyPath());
        await waitForCacheReady(AREA_NOTE_PATH);
    });

    it('moves children to the linked note and updates the wikilink', async () => {
        await openFileAtLine(todayDailyPath(), 2);
        await runCommand('extract-log');

        const daily = await readVaultFile(todayDailyPath());
        expect(daily).not.toContain('Child item 1');
        expect(daily).toContain('[[My Area#');

        const area = await readVaultFile(AREA_NOTE_PATH);
        expect(area).toContain('Child item 1');
        expect(area).toContain('Child item 2');
        expect(area).toContain('## Log');
    });
});
