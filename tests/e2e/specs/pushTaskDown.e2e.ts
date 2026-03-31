import { expect } from '@wdio/globals';
import { describe, it, before } from 'mocha';
import {
    createVaultFile, waitForCacheReady, readVaultFile, openFileAtLine, runCommand
} from '../helpers/vault';
import { todayDailyPath, thisWeeklyPath } from '../helpers/paths';

describe('pushTaskDown', () => {
    before(async () => {
        await createVaultFile(thisWeeklyPath(), [
            '## Todo',
            '',
            '- [ ] Weekly task to push down',
        ].join('\n'));

        await createVaultFile(todayDailyPath(), [
            '## Todo',
        ].join('\n'));

        await waitForCacheReady(thisWeeklyPath());
        await waitForCacheReady(todayDailyPath());
    });

    it('copies task to today\'s daily note and marks weekly note as scheduled', async () => {
        await openFileAtLine(thisWeeklyPath(), 2);
        await runCommand('push-task-down');

        const weekly = await readVaultFile(thisWeeklyPath());
        expect(weekly).toContain('- [<] Weekly task to push down');

        const daily = await readVaultFile(todayDailyPath());
        expect(daily).toContain('- [ ] Weekly task to push down');
    });
});
