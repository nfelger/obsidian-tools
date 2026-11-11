import { vi } from 'vitest';
import { createMockFile, createMockVault } from '../mocks/obsidian.js';

/** An in-memory vault: the files it holds and their current content. */
export interface MemoryVault {
	/** The mock vault to hand to the plugin */
	vault: any;
	/** Current content of every file, by path */
	contents: Map<string, string>;
	/** The mock files, by path */
	files: Map<string, any>;
	/** Add a file, or replace the content of one that exists */
	write(path: string, content: string): any;
}

/**
 * Build an in-memory vault for a test.
 *
 * @param initial - Content of the files the vault starts with, by path
 * @param options.failPath - A path whose writes throw
 */
export function createMemoryVault(
	initial: Record<string, string> = {},
	options: { failPath?: string } = {}
): MemoryVault {
	const contents = new Map<string, string>();
	const files = new Map<string, any>();

	const write = (path: string, content: string) => {
		contents.set(path, content);
		const file = createMockFile({
			path,
			basename: path.split('/').pop()!.replace(/\.md$/, '')
		});
		files.set(path, file);
		return file;
	};

	for (const [path, content] of Object.entries(initial)) write(path, content);

	const vault = createMockVault({ files: [...files.values()] });
	vault.getAbstractFileByPath = vi.fn((path: string) => files.get(path) ?? null);
	vault.read = vi.fn(async (file: any) => contents.get(file.path) ?? '');
	vault.create = vi.fn(async (path: string, content: string) => write(path, content));
	vault.createFolder = vi.fn(async () => undefined);
	vault.process = vi.fn(async (file: any, processFn: (data: string) => string) => {
		if (options.failPath && file.path === options.failPath) {
			throw new Error('Simulated write failure');
		}
		const next = processFn(contents.get(file.path) ?? '');
		contents.set(file.path, next);
		return next;
	});

	return { vault, contents, files, write };
}
