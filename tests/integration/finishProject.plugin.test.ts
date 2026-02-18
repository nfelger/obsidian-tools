import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { testFinishProjectPlugin } from '../helpers/finishProjectPluginTestHelper';

describe('finishProject (plugin)', () => {
	beforeEach(() => {
		vi.resetModules();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	describe('validation', () => {
		it('rejects when not a project note', async () => {
			const result = await testFinishProjectPlugin({
				source: `# Some Note`,
				sourceFileName: 'Some Note',
				sourcePath: '+Diary/2026/02/2026-02-18 Wed.md'
			});

			expect(result.notice).toBe('finishProject: Not a project note.');
			expect(result.renamePath).toBeNull();
		});

		it('rejects when project already has checkmark prefix', async () => {
			const result = await testFinishProjectPlugin({
				source: `# Already Done`,
				sourceFileName: '✅ Already Done'
			});

			expect(result.notice).toBe('finishProject: Project is already finished.');
			expect(result.renamePath).toBeNull();
		});
	});

	describe('frontmatter', () => {
		it('creates frontmatter with completed date when none exists', async () => {
			const result = await testFinishProjectPlugin({
				source: `# My Project

- [ ] Task 1`,
				sourceFileName: 'My Project',
				today: new Date(2026, 1, 18)
			});

			expect(result.content).toContain('---');
			expect(result.content).toContain('completed: 2026-02-18');
		});

		it('appends completed date to existing frontmatter', async () => {
			const result = await testFinishProjectPlugin({
				source: `---
tags: project
---
# My Project`,
				sourceFileName: 'My Project',
				today: new Date(2026, 1, 18)
			});

			expect(result.content).toContain('tags: project');
			expect(result.content).toContain('completed: 2026-02-18');
		});

		it('updates existing completed date', async () => {
			const result = await testFinishProjectPlugin({
				source: `---
completed: 2025-01-01
---
# My Project`,
				sourceFileName: 'My Project',
				today: new Date(2026, 1, 18)
			});

			expect(result.content).toContain('completed: 2026-02-18');
			expect(result.content).not.toContain('2025-01-01');
		});
	});

	describe('rename and archive', () => {
		it('renames file with checkmark prefix and moves to archive folder', async () => {
			const result = await testFinishProjectPlugin({
				source: `# Migration Initiative`,
				sourceFileName: 'Migration Initiative'
			});

			expect(result.renamePath).toBe('4 Archive/✅ Migration Initiative.md');
		});

		it('creates archive folder when it does not exist', async () => {
			const result = await testFinishProjectPlugin({
				source: `# My Project`,
				sourceFileName: 'My Project',
				archiveFolderExists: false
			});

			expect(result.folderCreated).toBe('4 Archive');
			expect(result.renamePath).toBe('4 Archive/✅ My Project.md');
		});

		it('does not create archive folder when it already exists', async () => {
			const result = await testFinishProjectPlugin({
				source: `# My Project`,
				sourceFileName: 'My Project',
				archiveFolderExists: true
			});

			expect(result.folderCreated).toBeNull();
			expect(result.renamePath).toBe('4 Archive/✅ My Project.md');
		});

		it('uses custom archive folder from settings', async () => {
			const result = await testFinishProjectPlugin({
				source: `# My Project`,
				sourceFileName: 'My Project',
				projectArchiveFolder: 'Done'
			});

			expect(result.renamePath).toBe('Done/✅ My Project.md');
		});
	});

	describe('notice', () => {
		it('shows success notice with project name', async () => {
			const result = await testFinishProjectPlugin({
				source: `# Migration Initiative`,
				sourceFileName: 'Migration Initiative'
			});

			expect(result.notice).toBe('finishProject: Migration Initiative archived.');
		});
	});
});
