import { expect } from '@wdio/globals';
import { describe, it, before } from 'mocha';
import {
    createVaultFile, readVaultFile, openFileAtLine, runCommand
} from '../helpers/vault';
import { todayDailyPath, thisWeeklyPath } from '../helpers/paths';

describe('pushTaskDown', () => {
    before(async () => {
        // Source: this week's weekly note with an open task
        await createVaultFile(thisWeeklyPath(), [
            '## Todo',
            '',
            '- [ ] Weekly task to push down',
        ].join('\n'));

        // Target: today's daily note must exist
        await createVaultFile(todayDailyPath(), [
            '## Todo',
        ].join('\n'));
    });

    it('copies task to today\'s daily note and marks weekly note as scheduled', async () => {
        // Open weekly note, cursor on the task (line 2, 0-indexed)
        await openFileAtLine(thisWeeklyPath(), 2);
        await runCommand('push-task-down');

        // Source: task marked [<]
        const weekly = await readVaultFile(thisWeeklyPath());
        expect(weekly).toContain('- [<] Weekly task to push down');

        // Target: task appears as [ ]
        const daily = await readVaultFile(todayDailyPath());
        expect(daily).toContain('- [ ] Weekly task to push down');
    });
});
