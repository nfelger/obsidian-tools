import { expect } from '@wdio/globals';
import { describe, it, before } from 'mocha';
import {
    createVaultFile, waitForCacheReady, vaultPathExists, readVaultFile, openFileAtLine, runCommand
} from '../helpers/vault';
import { PROJECT_NOTE_PATH } from '../helpers/paths';

describe('finishProject', () => {
    before(async () => {
        await createVaultFile(PROJECT_NOTE_PATH, [
            '---',
            'status: active',
            '---',
            '',
            '# My Project',
            '',
            '## Todo',
        ].join('\n'));

        await waitForCacheReady(PROJECT_NOTE_PATH);
    });

    it('moves project to archive with completed date in frontmatter', async () => {
        await openFileAtLine(PROJECT_NOTE_PATH, 0);
        await runCommand('finish-project');

        expect(await vaultPathExists(PROJECT_NOTE_PATH)).toBe(false);

        const archivedPath = '4 Archive/✅ My Project.md';
        expect(await vaultPathExists(archivedPath)).toBe(true);

        const archived = await readVaultFile(archivedPath);
        expect(archived).toContain('completed:');
    });
});
