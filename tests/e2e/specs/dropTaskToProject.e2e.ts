import { expect } from '@wdio/globals';
import { describe, it, before } from 'mocha';
import {
    createVaultFile, waitForCacheReady, readVaultFile, openFileAtLine, runCommand
} from '../helpers/vault';
import { todayDailyPath, PROJECT_NOTE_PATH } from '../helpers/paths';

describe('dropTaskToProject', () => {
    before(async () => {
        await createVaultFile(todayDailyPath(), [
            '## Todo',
            '',
            '- [ ] [[My Project]] Task to drop',
        ].join('\n'));

        await createVaultFile(PROJECT_NOTE_PATH, [
            '# My Project',
            '',
            '## Todo',
        ].join('\n'));

        // The command resolves [[My Project]] via metadataCache — wait for both files
        await waitForCacheReady(PROJECT_NOTE_PATH);
        await waitForCacheReady(todayDailyPath());
    });

    it('adds task to project note and removes it from the daily note', async () => {
        await openFileAtLine(todayDailyPath(), 2);
        await runCommand('drop-task-to-project');

        const daily = await readVaultFile(todayDailyPath());
        expect(daily).not.toContain('Task to drop');

        const project = await readVaultFile(PROJECT_NOTE_PATH);
        expect(project).toContain('Task to drop');
        expect(project).toContain('## Todo');
    });
});
