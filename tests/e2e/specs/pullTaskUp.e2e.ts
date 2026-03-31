import { expect } from '@wdio/globals';
import { describe, it, before } from 'mocha';
import {
    createVaultFile, waitForCacheReady, readVaultFile, openFileAtLine, runCommand
} from '../helpers/vault';
import { todayDailyPath, thisWeeklyPath } from '../helpers/paths';

describe('pullTaskUp', () => {
    before(async () => {
        await createVaultFile(todayDailyPath(), [
            '## Todo',
            '',
            '- [ ] Daily task to pull up',
        ].join('\n'));

        await createVaultFile(thisWeeklyPath(), [
            '## Todo',
        ].join('\n'));

        await waitForCacheReady(todayDailyPath());
        await waitForCacheReady(thisWeeklyPath());
    });

    it('copies task to weekly note and marks daily note as scheduled', async () => {
        await openFileAtLine(todayDailyPath(), 2);
        await runCommand('pull-task-up');

        const daily = await readVaultFile(todayDailyPath());
        expect(daily).toContain('- [<] Daily task to pull up');

        const weekly = await readVaultFile(thisWeeklyPath());
        expect(weekly).toContain('- [ ] Daily task to pull up');
    });
});
