import { expect } from '@wdio/globals';
import { describe, it, before } from 'mocha';
import {
    createVaultFile, vaultPathExists, openFileAtLine, runCommand, readVaultFile
} from '../helpers/vault';
import { PROJECT_NOTE_PATH } from '../helpers/paths';

describe('finishProject', () => {
    before(async () => {
        // Project note with YAML frontmatter
        await createVaultFile(PROJECT_NOTE_PATH, [
            '---',
            'status: active',
            '---',
            '',
            '# My Project',
            '',
            '## Todo',
        ].join('\n'));
    });

    it('moves project to archive with completed date in frontmatter', async () => {
        // Open project note (cursor position doesn't matter for this command)
        await openFileAtLine(PROJECT_NOTE_PATH, 0);
        await runCommand('finish-project');

        // Original path no longer exists
        expect(await vaultPathExists(PROJECT_NOTE_PATH)).toBe(false);

        // Archived at new path with ✅ prefix
        const archivedPath = '4 Archive/✅ My Project.md';
        expect(await vaultPathExists(archivedPath)).toBe(true);

        const archived = await readVaultFile(archivedPath);
        expect(archived).toContain('completed:');
    });
});
