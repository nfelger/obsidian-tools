import { expect } from '@wdio/globals';
import { describe, it } from 'mocha';
import {
    createVaultFile, waitForCacheReady, readVaultFile, openFileAtLine, runCommand
} from '../helpers/vault';

describe('migrateTask', () => {
    const cases = [
        {
            name: 'copies a Monday task to Tuesday and marks the source as migrated',
            source: '+Diary/2026/11/2026-11-09 Mon.md',
            target: '+Diary/2026/11/2026-11-10 Tue.md',
        },
        {
            name: 'copies a Sunday task to the next weekly note and marks the source as migrated',
            source: '+Diary/2026/11/2026-11-08 Sun.md',
            target: '+Diary/2026/11/2026-11-W46.md',
        },
    ];

    for (const scenario of cases) {
        it(scenario.name, async () => {
            await createVaultFile(scenario.source, `## Todo

- [ ] Task to migrate`);
            await createVaultFile(scenario.target, '## Todo');
            await waitForCacheReady(scenario.source);
            await waitForCacheReady(scenario.target);

            await openFileAtLine(scenario.source, 2);
            await runCommand('migrate-task');

            expect(await readVaultFile(scenario.source)).toContain('- [>] Task to migrate');
            expect(await readVaultFile(scenario.target)).toContain('- [ ] Task to migrate');
        });
    }
});
