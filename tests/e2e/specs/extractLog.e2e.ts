import { expect } from '@wdio/globals';
import { describe, it, before } from 'mocha';
import {
    createVaultFile, readVaultFile, openFileAtLine, runCommand
} from '../helpers/vault';
import { todayDailyPath, AREA_NOTE_PATH } from '../helpers/paths';

describe('extractLog', () => {
    before(async () => {
        // Source: today's daily note with a wikilink bullet that has children
        await createVaultFile(todayDailyPath(), [
            '## Log',
            '',
            '- [[My Area]] notes from today',
            '  - Child item 1',
            '  - Child item 2',
        ].join('\n'));

        // Target: area note with a ## Log heading
        await createVaultFile(AREA_NOTE_PATH, [
            '# My Area',
            '',
            '## Log',
        ].join('\n'));
    });

    it('moves children to the linked note and updates the wikilink', async () => {
        // Open daily note, cursor on the wikilink line (line 2, 0-indexed)
        await openFileAtLine(todayDailyPath(), 2);
        await runCommand('extract-log');

        // Source: children removed, wikilink updated with section anchor
        const daily = await readVaultFile(todayDailyPath());
        expect(daily).not.toContain('Child item 1');
        expect(daily).toContain('[[My Area#');

        // Target: children appear under ## Log
        const area = await readVaultFile(AREA_NOTE_PATH);
        expect(area).toContain('Child item 1');
        expect(area).toContain('Child item 2');
        expect(area).toContain('## Log');
    });
});
