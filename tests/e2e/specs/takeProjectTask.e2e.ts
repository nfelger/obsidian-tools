import { expect } from '@wdio/globals';
import { describe, it, before } from 'mocha';
import {
    createVaultFile, waitForCacheReady, readVaultFile, openFileAtLine, runCommand
} from '../helpers/vault';
import { todayDailyPath, PROJECT_NOTE_PATH } from '../helpers/paths';

describe('takeProjectTask', () => {
    before(async () => {
        await createVaultFile(PROJECT_NOTE_PATH, [
            '# My Project',
            '',
            '## Todo',
            '',
            '- [ ] Project task to take',
        ].join('\n'));

        await createVaultFile(todayDailyPath(), [
            '## Todo',
        ].join('\n'));

        await waitForCacheReady(PROJECT_NOTE_PATH);
        await waitForCacheReady(todayDailyPath());
    });

    it('copies task to daily note with project link and marks source as scheduled', async () => {
        await openFileAtLine(PROJECT_NOTE_PATH, 4);
        await runCommand('take-project-task');

        const project = await readVaultFile(PROJECT_NOTE_PATH);
        expect(project).toContain('- [<] Project task to take');

        const daily = await readVaultFile(todayDailyPath());
        expect(daily).toContain('[[My Project]]');
        expect(daily).toContain('Project task to take');
    });
});
