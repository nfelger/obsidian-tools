import { expect } from '@wdio/globals';
import { describe, it, before } from 'mocha';
import {
    createVaultFile, waitForCacheReady, readVaultFile, openFileAtLine, runCommand
} from '../helpers/vault';
import { todayDailyPath, tomorrowDailyPath } from '../helpers/paths';

describe('migrateTask', () => {
    before(async () => {
        await createVaultFile(todayDailyPath(), [
            '## Todo',
            '',
            '- [ ] Task to migrate',
        ].join('\n'));

        await createVaultFile(tomorrowDailyPath(), [
            '## Todo',
        ].join('\n'));

        // migrateTask resolves the target note via PeriodicNoteService — wait for both
        await waitForCacheReady(todayDailyPath());
        await waitForCacheReady(tomorrowDailyPath());
    });

    it('copies task to next daily note and marks source as migrated', async () => {
        await openFileAtLine(todayDailyPath(), 2);
        await runCommand('migrate-task');

        const today = await readVaultFile(todayDailyPath());
        expect(today).toContain('- [>] Task to migrate');

        const tomorrow = await readVaultFile(tomorrowDailyPath());
        expect(tomorrow).toContain('- [ ] Task to migrate');
    });
});
