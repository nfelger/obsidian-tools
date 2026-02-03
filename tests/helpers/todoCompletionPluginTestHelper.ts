import { vi } from 'vitest';
import { normalizeMarkdown } from './markdownParser.js';
import {
	createMockApp,
	createMockFile,
	createMockMetadataCache,
	createMockVault,
} from '../mocks/obsidian.js';
import { DEFAULT_SETTINGS } from '../../src/types';
import type { BulletFlowSettings } from '../../src/types';

interface TestTodoCompletionOptions {
	content: string;
	fileName?: string;
	settings?: Partial<BulletFlowSettings>;
	isDailyNote?: boolean;
}

interface TestTodoCompletionResult {
	content: string;
	changed: boolean;
}

/**
 * Test the todo completion tracking flow.
 *
 * Simulates the metadataCache 'changed' event by directly calling
 * moveAllCompletedTodosToLog via vault.process, matching what
 * handleTodoCompletion does in main.ts.
 */
export async function testTodoCompletion({
	content,
	fileName = '2026-02-02 Mon',
	settings = {},
	isDailyNote = true
}: TestTodoCompletionOptions): Promise<TestTodoCompletionResult> {
	const normalizedContent = normalizeMarkdown(content);
	const mergedSettings = { ...DEFAULT_SETTINGS, ...settings };

	// If not a daily note, use a non-matching filename
	const actualFileName = isDailyNote ? fileName : 'Project Note';
	const filePath = isDailyNote
		? `${mergedSettings.diaryFolder}/2026/02/${actualFileName}.md`
		: `${actualFileName}.md`;

	const mockFile = createMockFile({
		path: filePath,
		basename: actualFileName,
		extension: 'md'
	});

	// Track file content through vault.process
	let fileContent = normalizedContent;
	let wasProcessed = false;

	const mockVault = createMockVault({ files: [mockFile] });
	mockVault.process = vi.fn(async (_file: any, processFn: (data: string) => string) => {
		const newContent = await processFn(fileContent);
		if (newContent !== fileContent) {
			wasProcessed = true;
			fileContent = newContent;
		}
		return newContent;
	});

	const mockMetadataCache = createMockMetadataCache({});

	// Add the 'on' method to metadataCache for event registration
	const eventHandlers: Record<string, Array<(...args: any[]) => any>> = {};
	(mockMetadataCache as any).on = vi.fn((event: string, handler: (...args: any[]) => any) => {
		if (!eventHandlers[event]) eventHandlers[event] = [];
		eventHandlers[event].push(handler);
		return { event, handler };
	});

	const mockApp = createMockApp({
		vault: mockVault,
		metadataCache: mockMetadataCache
	});

	// Import and use the actual functions
	const { PeriodicNoteService } = await import('../../src/utils/periodicNotes');
	const { moveAllCompletedTodosToLog } = await import('../../src/utils/todoCompletionTracker');

	// Simulate what handleTodoCompletion does
	const noteService = new PeriodicNoteService(mergedSettings);
	const noteInfo = noteService.parseNoteType(mockFile.basename);

	if (!noteInfo || noteInfo.type !== 'daily') {
		return { content: normalizedContent, changed: false };
	}

	// Simulate vault.process as the handler does
	await mockVault.process(mockFile, (currentContent: string) => {
		const result = moveAllCompletedTodosToLog(
			currentContent,
			'## Todo',
			mergedSettings.periodicNoteTaskTargetHeading
		);
		return result ?? currentContent;
	});

	return {
		content: fileContent,
		changed: wasProcessed
	};
}
