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
import { formatDailyPath } from '../../src/utils/periodicNotes';

interface TestTakeProjectTaskOptions {
	source: string;
	sourceFileName: string;
	sourcePath?: string;
	dailyNoteContent?: string | null;
	today: Date;
	cursorLine?: number;
	selectionStartLine?: number | null;
	selectionEndLine?: number | null;
	projectsFolder?: string;
	projectKeywords?: string;
}

interface TestTakeProjectTaskResult {
	source: string;
	daily: string | null;
	dailyPath: string | null;
	error: string | null;
	notice: string | null;
	notices: string[];
}

export async function testTakeProjectTaskPlugin({
	source,
	sourceFileName,
	sourcePath: sourcePathOverride,
	dailyNoteContent = '',
	today,
	cursorLine = 0,
	selectionStartLine = null,
	selectionEndLine = null,
	projectsFolder = '1 Projekte',
	projectKeywords = '"Push", "Finish"'
}: TestTakeProjectTaskOptions): Promise<TestTakeProjectTaskResult> {
	const normalizedSource = normalizeMarkdown(source);
	const listItems = parseMarkdownToListItems(normalizedSource) as ListItem[];

	let sourceContent = normalizedSource;
	let dailyContentState = dailyNoteContent !== null ? normalizeMarkdown(dailyNoteContent) : null;
	const dailyExists = dailyNoteContent !== null;

	const settings: BulletFlowSettings = {
		...DEFAULT_SETTINGS,
		projectsFolder,
		projectKeywords
	};

	// Calculate daily note path
	const dailyPath = formatDailyPath(today, settings) + '.md';
	const sourcePath = sourcePathOverride || `${projectsFolder}/${sourceFileName}.md`;

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

	if (dailyExists) {
		const dailyLines = normalizeMarkdown(dailyContentState!).split('\n');
		const headings: any[] = [];
		dailyLines.forEach((line, idx) => {
			const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
			if (headingMatch) {
				headings.push({
					level: headingMatch[1].length,
					heading: headingMatch[2],
					position: { start: { line: idx } }
				});
			}
		});
		fileCache[dailyPath] = { headings };
	}

	// Setup files
	const allFiles: any[] = [];
	const mockSourceFile = createMockFile({
		path: sourcePath,
		basename: sourceFileName
	});
	allFiles.push(mockSourceFile);

	let mockDailyFile: any = null;
	if (dailyExists) {
		mockDailyFile = createMockFile({
			path: dailyPath,
			basename: dailyPath.split('/').pop()!.replace('.md', '')
		});
		allFiles.push(mockDailyFile);
	}

	const mockVault = createMockVault({ files: allFiles });

	mockVault.getAbstractFileByPath = vi.fn((path: string) => {
		if (path === dailyPath && dailyExists) return mockDailyFile;
		if (path === sourcePath) return mockSourceFile;
		return null;
	});

	mockVault.process = vi.fn(async (file: any, processFn: (data: string) => string) => {
		if (file === mockDailyFile || file?.path === dailyPath) {
			const currentContent = dailyContentState || '';
			const newContent = await processFn(currentContent);
			dailyContentState = newContent;
			return newContent;
		}
		return '';
	});

	const mockMetadataCache = createMockMetadataCache({ fileCache });
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

	const mockPlugin = {
		app: mockApp,
		settings,
		getToday: () => today
	} as unknown as BulletFlowPlugin;

	const { takeProjectTask } = await import('../../src/commands/takeProjectTask');
	await takeProjectTask(mockPlugin);

	NoticeSpy.mockRestore();

	return {
		source: normalizeMarkdown(sourceContent),
		daily: dailyContentState ? normalizeMarkdown(dailyContentState) : null,
		dailyPath,
		error: errors[0] || null,
		notice: notices[0] || null,
		notices
	};
}
