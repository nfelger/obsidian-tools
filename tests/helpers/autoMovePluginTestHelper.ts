import { vi } from 'vitest';
import { normalizeMarkdown } from './markdownParser.js';
import {
	createMockApp,
	createMockFile,
	createMockMetadataCache,
	createMockVault
} from '../mocks/obsidian.js';
import { periodicConfigWithFolder, asInterfaceSettings } from './periodicConfig';
import type { BulletFlowSettings } from '../../src/types';
import { DEFAULT_SETTINGS } from '../../src/types';
import type BulletFlowPlugin from '../../src/main';

interface TestAutoMoveOptions {
	/** Content of the note the task was ticked in */
	source: string;
	/** Basename of the source note (a daily note filename by default) */
	sourceFileName?: string;
	diaryFolder?: string;
	projectNotes?: Record<string, string>;
	projectsFolder?: string;
	/** Make the project-note write throw, to check the source is left alone */
	failProjectWrite?: boolean;
	/** Rewrite the source while the project write is in flight */
	editDuringProjectWrite?: (text: string) => string;
	/**
	 * The line the user just ticked, as the editor extension captures it.
	 * Defaults to the first `[x]` line in the source — the tick the scenario
	 * describes. Pass explicitly to disambiguate when there are several.
	 */
	tickedLine?: string;
}

interface TestAutoMoveResult {
	source: string;
	project: (name: string) => string | null;
	notice: string | null;
	notices: string[];
}

/**
 * Apply a CM6 change set to text. Changes are non-overlapping and sorted
 * ascending, so applying them back-to-front keeps offsets valid.
 */
function applyChanges(
	text: string,
	changes: Array<{ from: number; to: number; insert: string }>
): string {
	let result = text;
	for (const change of [...changes].sort((a, b) => b.from - a.from)) {
		result = result.slice(0, change.from) + change.insert + result.slice(change.to);
	}
	return result;
}

/**
 * Run the auto-move extension's document logic over a note, as if the user had
 * just ticked a checkbox in it.
 */
export async function testAutoMove({
	source,
	sourceFileName = '2026-07-02 Thu',
	diaryFolder = '+Diary',
	projectNotes = {},
	projectsFolder = '1 Projekte',
	failProjectWrite = false,
	editDuringProjectWrite,
	tickedLine
}: TestAutoMoveOptions): Promise<TestAutoMoveResult> {
	const sourcePath = `${diaryFolder}/${sourceFileName}.md`;
	let sourceContent = normalizeMarkdown(source);

	const settings: BulletFlowSettings = { ...DEFAULT_SETTINGS, projectsFolder };

	const projectContents = new Map<string, string>();
	const linkDests = new Map<string, any>();
	const allFiles: any[] = [];

	const mockSourceFile = createMockFile({ path: sourcePath, basename: sourceFileName });
	allFiles.push(mockSourceFile);

	for (const [name, content] of Object.entries(projectNotes)) {
		projectContents.set(name, normalizeMarkdown(content));
		const projectFile = createMockFile({ path: `${projectsFolder}/${name}.md`, basename: name });
		allFiles.push(projectFile);
		linkDests.set(`${name}|${sourcePath}`, projectFile);
		linkDests.set(name, projectFile);
		// Obsidian resolves path-form targets too
		linkDests.set(`${projectsFolder}/${name}`, projectFile);
	}

	const mockVault = createMockVault({ files: allFiles });
	mockVault.getAbstractFileByPath = vi.fn((path: string) =>
		allFiles.find(file => file.path === path) ?? null
	);
	mockVault.read = vi.fn(async (file: any) => projectContents.get(file.basename) || '');
	mockVault.process = vi.fn(async (file: any, processFn: (data: string) => string) => {
		if (failProjectWrite) throw new Error('Simulated write failure');
		const newContent = processFn(projectContents.get(file.basename) || '');
		projectContents.set(file.basename, newContent);
		if (editDuringProjectWrite) {
			sourceContent = normalizeMarkdown(editDuringProjectWrite(sourceContent));
		}
		return newContent;
	});

	// No workspace: runAutoMove works off the file and document it is handed,
	// not the active view
	const mockApp = createMockApp({
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

	(globalThis as any).__periodicNoteSettings = asInterfaceSettings(periodicConfigWithFolder(diaryFolder));

	const mockPlugin = { app: mockApp, settings } as unknown as BulletFlowPlugin;

	const completedLine = tickedLine
		?? sourceContent.split('\n').find(line => /^\s*- \[x\] /.test(line))
		?? null;

	try {
		const { runAutoMove } = await import('../../src/events/autoMoveCompleted');
		await runAutoMove(mockPlugin, mockSourceFile as any, {
			getText: () => sourceContent,
			dispatch: (changes) => {
				sourceContent = applyChanges(sourceContent, changes);
			}
		}, completedLine);
	} finally {
		NoticeSpy.mockRestore();
		(globalThis as any).__periodicNoteSettings = undefined;
	}

	return {
		source: normalizeMarkdown(sourceContent),
		project: (name: string) => {
			const content = projectContents.get(name);
			return content ? normalizeMarkdown(content) : null;
		},
		notice: notices[0] || null,
		notices
	};
}
