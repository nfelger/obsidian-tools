import { vi } from 'vitest';
import { parseMarkdownToListItems, normalizeMarkdown } from './markdownParser.js';
import {
	createMockApp,
	createMockEditor,
	createMockFile,
	createMockMetadataCache,
	createMockVault,
	createMockWorkspace
} from '../mocks/obsidian.js';
import type { ListItem, BulletFlowSettings } from '../../src/types';
import { DEFAULT_SETTINGS } from '../../src/types';
import type BulletFlowPlugin from '../../src/main';

interface TestDropTaskToProjectOptions {
	source: string;
	sourceFileName: string;
	sourcePath: string;
	projectNotes?: Record<string, string>;
	cursorLine?: number;
	selectionStartLine?: number | null;
	selectionEndLine?: number | null;
	projectsFolder?: string;
	/** Project name the user picks in the selection dialog, or null to simulate cancellation. */
	pickerSelection?: string | null;
}

interface TestDropTaskToProjectResult {
	source: string;
	project: (name: string) => string | null;
	error: string | null;
	notice: string | null;
	notices: string[];
}

export async function testDropTaskToProjectPlugin({
	source,
	sourceFileName,
	sourcePath,
	projectNotes = {},
	cursorLine = 0,
	selectionStartLine = null,
	selectionEndLine = null,
	projectsFolder = '1 Projekte',
	pickerSelection
}: TestDropTaskToProjectOptions): Promise<TestDropTaskToProjectResult> {
	const normalizedSource = normalizeMarkdown(source);
	const listItems = parseMarkdownToListItems(normalizedSource) as ListItem[];

	let sourceContent = normalizedSource;
	const projectContents = new Map<string, string>();

	const settings: BulletFlowSettings = {
		...DEFAULT_SETTINGS,
		projectsFolder
	};

	// Initialize project note contents
	for (const [name, content] of Object.entries(projectNotes)) {
		projectContents.set(name, normalizeMarkdown(content));
	}

	// Create editor
	const hasSelection = selectionStartLine !== null && selectionEndLine !== null;
	const mockEditor = createMockEditor({
		content: sourceContent,
		cursor: { line: cursorLine, ch: 0 },
		selectionStart: hasSelection ? { line: selectionStartLine, ch: 0 } : null,
		selectionEnd: hasSelection ? { line: selectionEndLine, ch: 0 } : null
	});

	mockEditor.replaceRange = vi.fn((text: string, from: any, to: any) => {
		const lines = sourceContent.split('\n');
		const beforeLines = lines.slice(0, from.line);
		const afterLines = lines.slice(to.line);
		const newLines = text === '' ? [] : text.split('\n');
		sourceContent = [...beforeLines, ...newLines, ...afterLines].join('\n');
	});

	mockEditor.setLine = vi.fn((lineNum: number, text: string) => {
		const lines = sourceContent.split('\n');
		lines[lineNum] = text;
		sourceContent = lines.join('\n');
	});

	// Build file cache
	const fileCache: Record<string, any> = {
		[sourcePath]: { listItems }
	};

	// Setup project notes in cache
	const linkDests = new Map<string, any>();
	const allFiles: any[] = [];
	const mockSourceFile = createMockFile({
		path: sourcePath,
		basename: sourceFileName
	});
	allFiles.push(mockSourceFile);

	for (const [name, content] of Object.entries(projectNotes)) {
		const projectPath = `${projectsFolder}/${name}.md`;
		const targetLines = normalizeMarkdown(content).split('\n');
		const headings: any[] = [];
		targetLines.forEach((line, idx) => {
			const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
			if (headingMatch) {
				headings.push({
					level: headingMatch[1].length,
					heading: headingMatch[2],
					position: { start: { line: idx } }
				});
			}
		});
		fileCache[projectPath] = { headings };

		const projectFile = createMockFile({ path: projectPath, basename: name });
		allFiles.push(projectFile);
		linkDests.set(`${name}|${sourcePath}`, projectFile);
		linkDests.set(name, projectFile);
	}

	const mockVault = createMockVault({ files: allFiles });

	mockVault.getAbstractFileByPath = vi.fn((path: string) => {
		for (const file of allFiles) {
			if (file.path === path) return file;
		}
		return null;
	});

	mockVault.process = vi.fn(async (file: any, processFn: (data: string) => string) => {
		const projectName = file.basename;
		const currentContent = projectContents.get(projectName) || '';
		const newContent = await processFn(currentContent);
		projectContents.set(projectName, newContent);
		return newContent;
	});

	const mockMetadataCache = createMockMetadataCache({ fileCache, linkDests });
	const mockWorkspace = createMockWorkspace({
		editor: mockEditor,
		file: mockSourceFile
	});
	const mockApp = createMockApp({
		workspace: mockWorkspace,
		metadataCache: mockMetadataCache,
		vault: mockVault
	});

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

	// Build mock picker function
	const mockPickProject = vi.fn(async () => {
		if (pickerSelection === undefined) {
			// No pickerSelection provided — picker should not be needed.
			// Return null to simulate "no selection" (shouldn't be called for linked tasks).
			return null;
		}
		if (pickerSelection === null) {
			// User cancelled the picker
			return null;
		}
		// User selected a project — find it in the mock files
		const projectPath = `${projectsFolder}/${pickerSelection}.md`;
		const file = allFiles.find((f: any) => f.path === projectPath);
		return file || null;
	});

	const mockPlugin = {
		app: mockApp,
		settings
	} as unknown as BulletFlowPlugin;

	const { dropTaskToProject } = await import('../../src/commands/dropTaskToProject');
	await dropTaskToProject(mockPlugin, mockPickProject);

	NoticeSpy.mockRestore();

	return {
		source: normalizeMarkdown(sourceContent),
		project: (name: string) => {
			const content = projectContents.get(name);
			return content ? normalizeMarkdown(content) : null;
		},
		error: errors[0] || null,
		notice: notices[0] || null,
		notices
	};
}
