import { vi } from 'vitest';
import { normalizeMarkdown } from './markdownParser.js';
import {
	createMockApp,
	createMockEditor,
	createMockFile,
	createMockMetadataCache,
	createMockVault,
	createMockWorkspace
} from '../mocks/obsidian.js';
import type { BulletFlowSettings } from '../../src/types';
import { DEFAULT_SETTINGS } from '../../src/types';
import type BulletFlowPlugin from '../../src/main';

interface TestFinishProjectOptions {
	source: string;
	sourceFileName: string;
	sourcePath?: string;
	projectsFolder?: string;
	projectArchiveFolder?: string;
	today?: Date;
	archiveFolderExists?: boolean;
}

interface TestFinishProjectResult {
	content: string;
	renamePath: string | null;
	folderCreated: string | null;
	error: string | null;
	notice: string | null;
	notices: string[];
}

export async function testFinishProjectPlugin({
	source,
	sourceFileName,
	sourcePath: sourcePathOverride,
	projectsFolder = '1 Projekte',
	projectArchiveFolder = '4 Archive',
	today = new Date(2026, 1, 18),
	archiveFolderExists = false
}: TestFinishProjectOptions): Promise<TestFinishProjectResult> {
	const normalizedSource = normalizeMarkdown(source);
	let fileContent = normalizedSource;

	const settings: BulletFlowSettings = {
		...DEFAULT_SETTINGS,
		projectsFolder,
		projectArchiveFolder
	};

	const sourcePath = sourcePathOverride || `${projectsFolder}/${sourceFileName}.md`;

	const mockEditor = createMockEditor({ content: fileContent });
	const mockSourceFile = createMockFile({
		path: sourcePath,
		basename: sourceFileName
	});

	const mockVault = createMockVault({ files: [mockSourceFile] });

	mockVault.process = vi.fn(async (_file: any, processFn: (data: string) => string) => {
		const newContent = await processFn(fileContent);
		fileContent = newContent;
		return newContent;
	});

	let renamePath: string | null = null;
	let folderCreated: string | null = null;

	mockVault.getAbstractFileByPath = vi.fn((path: string) => {
		if (path === sourcePath) return mockSourceFile;
		if (path === projectArchiveFolder && archiveFolderExists) return { path: projectArchiveFolder };
		return null;
	});

	mockVault.createFolder = vi.fn(async (path: string) => {
		folderCreated = path;
	});

	const mockMetadataCache = createMockMetadataCache({ fileCache: {} });
	const mockWorkspace = createMockWorkspace({
		editor: mockEditor,
		file: mockSourceFile
	});
	const mockApp = createMockApp({
		workspace: mockWorkspace,
		metadataCache: mockMetadataCache,
		vault: mockVault
	});

	mockApp.fileManager = {
		renameFile: vi.fn(async (_file: any, newPath: string) => {
			renamePath = newPath;
		})
	};

	const notices: string[] = [];
	const errors: string[] = [];
	vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn() } });

	const NoticeModule = await import('obsidian');
	const NoticeSpy = vi.spyOn(NoticeModule, 'Notice').mockImplementation(function(this: any, msg: string) {
		notices.push(msg);
		if (msg.includes('ERROR') || msg.includes('error')) {
			errors.push(msg);
		}
		this.message = msg;
		return this;
	} as any);

	const mockPlugin = {
		app: mockApp,
		settings,
		getToday: () => today
	} as unknown as BulletFlowPlugin;

	const { finishProject } = await import('../../src/commands/finishProject');
	await finishProject(mockPlugin);

	NoticeSpy.mockRestore();

	return {
		content: fileContent,
		renamePath,
		folderCreated,
		error: errors[0] || null,
		notice: notices[0] || null,
		notices
	};
}
