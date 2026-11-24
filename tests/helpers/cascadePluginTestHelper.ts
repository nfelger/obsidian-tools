import { vi } from 'vitest';
import { normalizeMarkdown } from './markdownParser.js';
import { createMockApp, createMockMetadataCache } from '../mocks/obsidian.js';
import { createMemoryVault } from './memoryVault';
import { DEFAULT_SETTINGS } from '../../src/types';
import type { BulletFlowSettings } from '../../src/types';
import type BulletFlowPlugin from '../../src/main';

/** The day every cascade scenario happens on (a Thursday). */
const CASCADE_TODAY = new Date(2026, 6, 2);

/** Where the periodic notes of that day live. */
export const CASCADE_NOTE_PATHS = {
	daily: 'Diary/2026-07-02 Thu.md',
	weekly: 'Diary/2026-W27.md',
	monthly: 'Diary/2026-07.md',
	yearly: 'Diary/2026.md'
};

interface TestCascadeOptions {
	/** Content of the note the task was ticked in */
	source: string;
	/** Path of the note the task was ticked in */
	sourcePath: string;
	/** Content of the other notes, keyed by path */
	notes?: Record<string, string>;
	/** Content of project notes, keyed by name */
	projectNotes?: Record<string, string>;
	projectsFolder?: string;
	/** Make the daily note write throw, to check the source is left alone */
	failDailyWrite?: boolean;
	/** The line the user just ticked */
	tickedLine?: string;
}

interface TestCascadeResult {
	source: string;
	note: (path: string) => string | null;
	project: (name: string) => string | null;
	notices: string[];
}

/**
 * Run the auto-move extension over a periodic note, as if the user had just
 * ticked a checkbox in it.
 */
export async function testCascade({
	source,
	sourcePath,
	notes = {},
	projectNotes = {},
	projectsFolder = '1 Projekte',
	failDailyWrite = false,
	tickedLine
}: TestCascadeOptions): Promise<TestCascadeResult> {
	const settings: BulletFlowSettings = { ...DEFAULT_SETTINGS, projectsFolder };

	const initial: Record<string, string> = { [sourcePath]: normalizeMarkdown(source) };
	for (const [path, content] of Object.entries(notes)) {
		initial[path] = normalizeMarkdown(content);
	}
	for (const [name, content] of Object.entries(projectNotes)) {
		initial[`${projectsFolder}/${name}.md`] = normalizeMarkdown(content);
	}

	const memory = createMemoryVault(initial, {
		failPath: failDailyWrite ? CASCADE_NOTE_PATHS.daily : undefined
	});

	// Project links resolve to the project notes in the vault
	const linkDests = new Map<string, any>();
	for (const name of Object.keys(projectNotes)) {
		const file = memory.files.get(`${projectsFolder}/${name}.md`);
		linkDests.set(name, file);
		linkDests.set(`${projectsFolder}/${name}`, file);
		linkDests.set(`${name}|${sourcePath}`, file);
	}

	const mockApp = createMockApp({
		metadataCache: createMockMetadataCache({ linkDests }),
		vault: memory.vault
	});

	const notices: string[] = [];
	const NoticeModule = await import('obsidian');
	const NoticeSpy = vi.spyOn(NoticeModule, 'Notice').mockImplementation(function (this: any, msg: string) {
		notices.push(msg);
		this.message = msg;
		return this;
	} as any);

	(globalThis as any).__periodicNoteSettings = {
		day: { format: 'YYYY-MM-DD ddd', folder: 'Diary', template: '' },
		week: { format: 'gggg-[W]WW', folder: 'Diary', template: '' },
		month: { format: 'YYYY-MM', folder: 'Diary', template: '' },
		year: { format: 'YYYY', folder: 'Diary', template: '' }
	};

	const mockPlugin = {
		app: mockApp,
		settings,
		getToday: () => CASCADE_TODAY
	} as unknown as BulletFlowPlugin;

	let sourceContent = initial[sourcePath];
	const completedLine = tickedLine
		?? sourceContent.split('\n').find(line => /^\s*- \[x\] /.test(line))
		?? null;

	try {
		const { runAutoMove } = await import('../../src/events/autoMoveCompleted');
		await runAutoMove(
			mockPlugin,
			memory.files.get(sourcePath),
			{
				getText: () => sourceContent,
				dispatch: (changes) => {
					for (const change of changes) {
						const head = sourceContent.slice(0, change.from);
						const tail = sourceContent.slice(change.to);
						sourceContent = head + change.insert + tail;
					}
				}
			},
			completedLine
		);
	} finally {
		NoticeSpy.mockRestore();
		(globalThis as any).__periodicNoteSettings = undefined;
	}

	const read = (path: string): string | null => {
		const content = memory.contents.get(path);
		return content === undefined ? null : normalizeMarkdown(content);
	};

	return {
		source: normalizeMarkdown(sourceContent),
		note: read,
		project: (name: string) => read(`${projectsFolder}/${name}.md`),
		notices
	};
}
