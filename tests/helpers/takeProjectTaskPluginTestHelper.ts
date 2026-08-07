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
import type { ListItem, BulletFlowSettings, PeriodicGranularity } from '../../src/types';
import { DEFAULT_SETTINGS } from '../../src/types';
import type BulletFlowPlugin from '../../src/main';
import { formatPeriodPath } from '../../src/utils/periodicNotes';
import { periodicConfigWithFolder, asInterfaceSettings } from './periodicConfig';

// The period picker is Obsidian UI — stand in for the user's answer, and
// record the hints they were shown.
const picker = vi.hoisted(() => ({
	answer: 'daily' as PeriodicGranularity | null,
	hints: null as Record<string, string> | null
}));

vi.mock('../../src/adapters/periodPicker', () => ({
	promptForPeriod: vi.fn(async (_app: unknown, hints: Record<string, string>) => {
		picker.hints = hints;
		return picker.answer;
	})
}));

interface TestTakeProjectTaskOptions {
	source: string;
	sourceFileName: string;
	sourcePath?: string;
	targetNoteContent?: string | null;
	/** What the user picks in the period modal; null = dismissed it */
	period?: PeriodicGranularity | null;
	today: Date;
	cursorLine?: number;
	selectionStartLine?: number | null;
	selectionEndLine?: number | null;
	projectsFolder?: string;
	projectKeywords?: string;
	failTargetWrite?: boolean;
}

interface TestTakeProjectTaskResult {
	source: string;
	target: string | null;
	targetPath: string;
	/** Target note names the picker offered, keyed by granularity */
	pickerHints: Record<string, string> | null;
	error: string | null;
	notice: string | null;
	notices: string[];
}

export async function testTakeProjectTaskPlugin({
	source,
	sourceFileName,
	sourcePath: sourcePathOverride,
	targetNoteContent = '',
	period = 'daily',
	today,
	cursorLine = 0,
	selectionStartLine = null,
	selectionEndLine = null,
	projectsFolder = '1 Projekte',
	projectKeywords = '"Push", "Finish"',
	failTargetWrite = false
}: TestTakeProjectTaskOptions): Promise<TestTakeProjectTaskResult> {
	const normalizedSource = normalizeMarkdown(source);
	const listItems = parseMarkdownToListItems(normalizedSource) as ListItem[];

	let sourceContent = normalizedSource;
	let targetContentState = targetNoteContent !== null ? normalizeMarkdown(targetNoteContent) : null;
	const targetExists = targetNoteContent !== null;

	const settings: BulletFlowSettings = {
		...DEFAULT_SETTINGS,
		projectsFolder,
		projectKeywords
	};

	picker.answer = period;
	picker.hints = null;

	// Calculate the path of the note the picked period resolves to
	const periodicConfig = periodicConfigWithFolder('+Diary');
	const targetPath = formatPeriodPath(today, period ?? 'daily', periodicConfig) + '.md';
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

	if (targetExists) {
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
	if (targetExists) {
		mockTargetFile = createMockFile({
			path: targetPath,
			basename: targetPath.split('/').pop()!.replace('.md', '')
		});
		allFiles.push(mockTargetFile);
	}

	const mockVault = createMockVault({ files: allFiles });

	mockVault.getAbstractFileByPath = vi.fn((path: string) => {
		if (path === targetPath && (targetExists || mockTargetFile)) return mockTargetFile;
		if (path === sourcePath) return mockSourceFile;
		return null;
	});

	mockVault.createFolder = vi.fn(async () => {});
	mockVault.create = vi.fn(async (path: string, content: string) => {
		if (path !== targetPath) throw new Error(`unexpected create: ${path}`);
		mockTargetFile = createMockFile({ path, basename: path.split('/').pop()!.replace('.md', '') });
		targetContentState = content;
		return mockTargetFile;
	});

	mockVault.process = vi.fn(async (file: any, processFn: (data: string) => string) => {
		if (failTargetWrite) throw new Error('Simulated write failure');
		if (file === mockTargetFile || file?.path === targetPath) {
			const currentContent = targetContentState || '';
			const newContent = await processFn(currentContent);
			targetContentState = newContent;
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

	(globalThis as any).__periodicNoteSettings = asInterfaceSettings(periodicConfig);

	const { takeProjectTask } = await import('../../src/commands/takeProjectTask');
	await takeProjectTask(mockPlugin);

	(globalThis as any).__periodicNoteSettings = undefined;

	NoticeSpy.mockRestore();

	return {
		source: normalizeMarkdown(sourceContent),
		target: targetContentState ? normalizeMarkdown(targetContentState) : null,
		targetPath,
		pickerHints: picker.hints,
		error: errors[0] || null,
		notice: notices[0] || null,
		notices
	};
}
