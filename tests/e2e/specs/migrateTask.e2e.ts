import { expect } from '@wdio/globals';
import { describe, it, before } from 'mocha';
import {
    createVaultFile, readVaultFile, openFileAtLine, runCommand
} from '../helpers/vault';
import { todayDailyPath, tomorrowDailyPath } from '../helpers/paths';

describe('migrateTask', () => {
    before(async () => {
        // Source: today's daily note with an open task
        await createVaultFile(todayDailyPath(), [
            '## Todo',
            '',
            '- [ ] Task to migrate',
        ].join('\n'));

        // Target: tomorrow's daily note must exist
        await createVaultFile(tomorrowDailyPath(), [
            '## Todo',
        ].join('\n'));
    });

    it('copies task to next daily note and marks source as migrated', async () => {
        // Open today's daily, cursor on the task (line 2, 0-indexed)
        await openFileAtLine(todayDailyPath(), 2);
        await runCommand('migrate-task');

        // Source: task marked [>]
        const today = await readVaultFile(todayDailyPath());
        expect(today).toContain('- [>] Task to migrate');

        // Target: task copied as [ ]
        const tomorrow = await readVaultFile(tomorrowDailyPath());
        expect(tomorrow).toContain('- [ ] Task to migrate');
    });
});
