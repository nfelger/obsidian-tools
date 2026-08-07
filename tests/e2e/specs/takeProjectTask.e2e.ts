import { expect } from '@wdio/globals';
import { describe, it, before } from 'mocha';
import {
    createVaultFile, waitForCacheReady, readVaultFile, openFileAtLine, startCommand, pickPeriod
} from '../helpers/vault';
import { todayDailyPath, thisWeeklyPath, PROJECT_NOTE_PATH } from '../helpers/paths';

describe('takeProjectTask', () => {
    before(async () => {
        await createVaultFile(PROJECT_NOTE_PATH, [
            '# My Project',
            '',
            '## Todo',
            '',
            '- [ ] Project task to take',
            '- [ ] Project task for the week',
        ].join('\n'));

        await createVaultFile(todayDailyPath(), [
            '## Todo',
        ].join('\n'));

        await createVaultFile(thisWeeklyPath(), [
            '## Todo',
        ].join('\n'));

        await waitForCacheReady(PROJECT_NOTE_PATH);
        await waitForCacheReady(todayDailyPath());
        await waitForCacheReady(thisWeeklyPath());
    });

    it('copies task to daily note with project link and marks source as scheduled', async () => {
        await openFileAtLine(PROJECT_NOTE_PATH, 4);
        await startCommand('take-project-task');
        await pickPeriod('daily');

        const project = await readVaultFile(PROJECT_NOTE_PATH);
        expect(project).toContain('- [<] Project task to take');

        const daily = await readVaultFile(todayDailyPath());
        expect(daily).toContain('[[My Project]]');
        expect(daily).toContain('Project task to take');
    });

    it('copies task to the weekly note when the week is picked', async () => {
        await openFileAtLine(PROJECT_NOTE_PATH, 5);
        await startCommand('take-project-task');
        await pickPeriod('weekly');

        const project = await readVaultFile(PROJECT_NOTE_PATH);
        expect(project).toContain('- [<] Project task for the week');

        const weekly = await readVaultFile(thisWeeklyPath());
        expect(weekly).toContain('[[My Project]]');
        expect(weekly).toContain('Project task for the week');
    });
});
