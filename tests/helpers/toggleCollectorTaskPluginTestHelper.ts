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

interface TestToggleCollectorTaskOptions {
	source: string;
	/** Line the cursor sits on, zero-based, counting from the trimmed source */
	cursorLine: number;
	sourcePath?: string;
	/** Project note basenames that exist in the vault */
	projects?: string[];
	projectsFolder?: string;
	projectKeywords?: string;
}

interface TestToggleCollectorTaskResult {
	source: string;
	notice: string | null;
	notices: string[];
}

export async function testToggleCollectorTaskPlugin({
	source,
	cursorLine,
	sourcePath = '+Diary/2026/08/2026-08-07 Fri.md',
	projects = ['Migration Initiative'],
	projectsFolder = '1 Projekte',
	projectKeywords = '"Push", "Finish"'
}: TestToggleCollectorTaskOptions): Promise<TestToggleCollectorTaskResult> {
	let sourceContent = normalizeMarkdown(source);

	const settings: BulletFlowSettings = {
		...DEFAULT_SETTINGS,
		projectsFolder,
		projectKeywords
	};

	const mockEditor = createMockEditor({
		content: sourceContent,
		cursor: { line: cursorLine, ch: 0 }
	});

	// The editor mocks are re-derived from the live content on every call, so
	// the command sees its own edits — the whole command is one in-place
	// rewrite of the note.
	mockEditor.getValue = vi.fn(() => sourceContent);
	mockEditor.getLine = vi.fn((n: number) => sourceContent.split('\n')[n] ?? '');
	mockEditor.replaceRange = vi.fn((text: string, from: any, to: any) => {
		const lines = sourceContent.split('\n');
		const head = [...lines.slice(0, from.line), lines[from.line].slice(0, from.ch)].join('\n');
		const tail = [lines[to.line].slice(to.ch), ...lines.slice(to.line + 1)].join('\n');
		sourceContent = head + text + tail;
	});

	const sourceFile = createMockFile({
		path: sourcePath,
		basename: sourcePath.split('/').pop()!.replace(/\.md$/, '')
	});

	const projectFiles = projects.map(name =>
		createMockFile({ path: `${projectsFolder}/${name}.md`, basename: name })
	);

	const mockVault = createMockVault({ files: [sourceFile, ...projectFiles] });
	mockVault.getAbstractFileByPath = vi.fn((path: string) =>
		[sourceFile, ...projectFiles].find(f => f.path === path) ?? null
	);

	const linkDests = new Map<string, any>();
	for (const file of projectFiles) {
		linkDests.set(file.basename, file);
		linkDests.set(file.path.replace(/\.md$/, ''), file);
	}

	const mockApp = createMockApp({
		workspace: createMockWorkspace({ editor: mockEditor, file: sourceFile }),
		metadataCache: createMockMetadataCache({ linkDests }),
		vault: mockVault
	});

	const notices: string[] = [];
	const NoticeModule = await import('obsidian');
	const NoticeSpy = vi.spyOn(NoticeModule, 'Notice').mockImplementation(function(this: any, msg: string) {
		notices.push(msg);
		this.message = msg;
		return this;
	} as any);

	const mockPlugin = { app: mockApp, settings } as unknown as BulletFlowPlugin;

	const { toggleCollectorTask } = await import('../../src/commands/toggleCollectorTask');
	toggleCollectorTask(mockPlugin);

	NoticeSpy.mockRestore();

	return {
		source: sourceContent,
		notice: notices[0] || null,
		notices
	};
}
