import { expect } from '@wdio/globals';
import { describe, it, before } from 'mocha';
import {
    createVaultFile, readVaultFile, openFileAtLine, runCommand
} from '../helpers/vault';
import { todayDailyPath, PROJECT_NOTE_PATH } from '../helpers/paths';

describe('dropTaskToProject', () => {
    before(async () => {
        // Source: today's daily note with a task that has a [[My Project]] wikilink
        await createVaultFile(todayDailyPath(), [
            '## Todo',
            '',
            '- [ ] [[My Project]] Task to drop',
        ].join('\n'));

        // Target: project note with ## Todo section
        await createVaultFile(PROJECT_NOTE_PATH, [
            '# My Project',
            '',
            '## Todo',
        ].join('\n'));
    });

    it('adds task to project note and removes it from the daily note', async () => {
        // Open daily note, cursor on the task (line 2, 0-indexed)
        await openFileAtLine(todayDailyPath(), 2);
        await runCommand('drop-task-to-project');

        // Source: task line deleted
        const daily = await readVaultFile(todayDailyPath());
        expect(daily).not.toContain('Task to drop');

        // Target: task added under ## Todo
        const project = await readVaultFile(PROJECT_NOTE_PATH);
        expect(project).toContain('Task to drop');
        expect(project).toContain('## Todo');
    });
});
