import { expect } from '@wdio/globals';
import { describe, it, before } from 'mocha';
import {
    createVaultFile, readVaultFile, openFileAtLine, runCommand
} from '../helpers/vault';
import { todayDailyPath, thisWeeklyPath } from '../helpers/paths';

describe('pullTaskUp', () => {
    before(async () => {
        // Source: today's daily note with an open task
        await createVaultFile(todayDailyPath(), [
            '## Todo',
            '',
            '- [ ] Daily task to pull up',
        ].join('\n'));

        // Target: this week's weekly note must exist
        await createVaultFile(thisWeeklyPath(), [
            '## Todo',
        ].join('\n'));
    });

    it('copies task to weekly note and marks daily note as scheduled', async () => {
        // Open today's daily, cursor on the task (line 2, 0-indexed)
        await openFileAtLine(todayDailyPath(), 2);
        await runCommand('pull-task-up');

        // Source: task marked [<]
        const daily = await readVaultFile(todayDailyPath());
        expect(daily).toContain('- [<] Daily task to pull up');

        // Target: task appears as [ ]
        const weekly = await readVaultFile(thisWeeklyPath());
        expect(weekly).toContain('- [ ] Daily task to pull up');
    });
});
