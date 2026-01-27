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
import { parseNoteType, getHigherNotePath } from '../../src/utils/periodicNotes';

interface TestPullUpOptions {
	source: string;
	sourceFileName: string;
	targetContent?: string | null;
	cursorLine?: number;
	selectionStartLine?: number | null;
	selectionEndLine?: number | null;
	diaryFolder?: string;
}

interface TestPullUpResult {
	source: string;
	target: string | null;
	targetPath: string | null;
	error: string | null;
	notice: string | null;
	notices: string[];
}

/**
 * Test pullUp with markdown-first approach
 *
 * @param options - Test configuration
 * @returns Result with source, target, notices
 */
export async function testPullUpPlugin({
	source,
	sourceFileName,
	targetContent = '',
	cursorLine = 0,
	selectionStartLine = null,
	selectionEndLine = null,
	diaryFolder = '+Diary'
}: TestPullUpOptions): Promise<TestPullUpResult> {
	// Normalize markdown
	const normalizedSource = normalizeMarkdown(source);

	// Parse source markdown → listItems
	const listItems = parseMarkdownToListItems(normalizedSource) as ListItem[];

	// Track content state
	let sourceContent = normalizedSource;
	let targetContentState = targetContent !== null ? normalizeMarkdown(targetContent) : null;
	const targetExists = targetContent !== null;

	// Build settings with custom diary folder
	const settings: BulletFlowSettings = { ...DEFAULT_SETTINGS, diaryFolder };

	// Calculate paths
	const noteInfo = parseNoteType(sourceFileName, settings);

	// Build source path based on note type
	let sourcePath: string;
	if (noteInfo) {
		const { type, year, month } = noteInfo;
		const yearStr = String(year);
		const monthStr = month ? String(month).padStart(2, '0') : '';

		switch (type) {
			case 'daily':
				sourcePath = `${diaryFolder}/${yearStr}/${monthStr}/${sourceFileName}.md`;
				break;
			case 'weekly':
				sourcePath = `${diaryFolder}/${yearStr}/${monthStr}/${sourceFileName}.md`;
				break;
			case 'monthly':
				sourcePath = `${diaryFolder}/${yearStr}/${sourceFileName}.md`;
				break;
			case 'yearly':
				sourcePath = `${diaryFolder}/${yearStr}/${sourceFileName}.md`;
				break;
			default:
				sourcePath = `${sourceFileName}.md`;
		}
	} else {
		sourcePath = `${sourceFileName}.md`;
	}

	// Calculate target path (higher level note)
	let calculatedTargetPath: string | null = null;
	if (noteInfo) {
		calculatedTargetPath = getHigherNotePath(noteInfo, settings);
	}
	const actualTargetFileName = calculatedTargetPath ? calculatedTargetPath.split('/').pop() : null;
	const targetPath = calculatedTargetPath ? `${calculatedTargetPath}.md` : null;

	// Create editor that tracks modifications
	const hasSelection = selectionStartLine !== null && selectionEndLine !== null;
	const mockEditor = createMockEditor({
		content: sourceContent,
		cursor: { line: cursorLine, ch: 0 },
		selectionStart: hasSelection ? { line: selectionStartLine, ch: 0 } : null,
		selectionEnd: hasSelection ? { line: selectionEndLine, ch: 0 } : null
	});

	// Override editor methods to track changes
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

	// Add target file cache if it exists
	if (targetExists && targetPath) {
		const targetLines = normalizeMarkdown(targetContentState!).split('\n');
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
		fileCache[targetPath] = { headings };
	}

	// Setup files
	const allFiles: any[] = [];
	const mockSourceFile = createMockFile({
		path: sourcePath,
		basename: sourceFileName
	});
	allFiles.push(mockSourceFile);

	let mockTargetFile: any = null;
	if (targetExists && actualTargetFileName) {
		mockTargetFile = createMockFile({
			path: targetPath!,
			basename: actualTargetFileName
		});
		allFiles.push(mockTargetFile);
	}

	// Create vault that tracks modifications
	const mockVault = createMockVault({ files: allFiles });

	// Override getAbstractFileByPath to check if target exists
	mockVault.getAbstractFileByPath = vi.fn((path: string) => {
		if (path === targetPath && targetExists) {
			return mockTargetFile;
		}
		if (path === sourcePath) {
			return mockSourceFile;
		}
		return null;
	});

	mockVault.process = vi.fn(async (file: any, processFn: (data: string) => string) => {
		if (file === mockTargetFile || file?.path === targetPath) {
			const currentContent = targetContentState || '';
			const newContent = await processFn(currentContent);
			targetContentState = newContent;
			return newContent;
		}
		return '';
	});

	// Create metadata cache
	const mockMetadataCache = createMockMetadataCache({
		fileCache
	});

	// Create workspace
	const mockWorkspace = createMockWorkspace({
		editor: mockEditor,
		file: mockSourceFile
	});

	// Create app
	const mockApp = createMockApp({
		workspace: mockWorkspace,
		metadataCache: mockMetadataCache,
		vault: mockVault
	});

	// Setup globals
	const notices: string[] = [];
	const errors: string[] = [];
	vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn() } });

	// Spy on Notice constructor to track messages
	const NoticeModule = await import('obsidian');
	const NoticeSpy = vi.spyOn(NoticeModule, 'Notice').mockImplementation(function(this: any, msg: string) {
		notices.push(msg);
		if (msg.includes('ERROR') || msg.includes('error')) {
			errors.push(msg);
		}
		this.message = msg;
		return this;
	} as any);

	// Create mock plugin
	const mockPlugin = {
		app: mockApp,
		settings
	} as unknown as BulletFlowPlugin;

	// Import and run pullUp
	const { pullUp } = await import('../../src/commands/pullUp');
	await pullUp(mockPlugin);

	// Cleanup
	NoticeSpy.mockRestore();

	// Return clean result
	return {
		source: normalizeMarkdown(sourceContent),
		target: targetContentState ? normalizeMarkdown(targetContentState) : null,
		targetPath: calculatedTargetPath,
		error: errors[0] || null,
		notice: notices[0] || null,
		notices
	};
}
