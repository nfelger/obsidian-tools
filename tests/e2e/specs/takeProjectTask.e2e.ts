import { expect } from '@wdio/globals';
import { describe, it, before } from 'mocha';
import {
    createVaultFile, readVaultFile, openFileAtLine, runCommand
} from '../helpers/vault';
import { todayDailyPath, PROJECT_NOTE_PATH } from '../helpers/paths';

describe('takeProjectTask', () => {
    before(async () => {
        // Source: project note with an open task under ## Todo
        await createVaultFile(PROJECT_NOTE_PATH, [
            '# My Project',
            '',
            '## Todo',
            '',
            '- [ ] Project task to take',
        ].join('\n'));

        // Target: today's daily note must exist
        await createVaultFile(todayDailyPath(), [
            '## Todo',
        ].join('\n'));
    });

    it('copies task to daily note with project link and marks source as scheduled', async () => {
        // Open project note, cursor on the task (line 4, 0-indexed)
        await openFileAtLine(PROJECT_NOTE_PATH, 4);
        await runCommand('take-project-task');

        // Source: task marked [<]
        const project = await readVaultFile(PROJECT_NOTE_PATH);
        expect(project).toContain('- [<] Project task to take');

        // Target: task appears with [[My Project]] prefix
        const daily = await readVaultFile(todayDailyPath());
        expect(daily).toContain('[[My Project]]');
        expect(daily).toContain('Project task to take');
    });
});
