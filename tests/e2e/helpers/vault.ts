import { browser } from '@wdio/globals';

/**
 * Create (or overwrite) a file in the live Obsidian vault via Obsidian's API.
 * Creates parent folders as needed.
 */
export async function createVaultFile(relPath: string, content: string): Promise<void> {
    await browser.execute(async (filePath: string, fileContent: string) => {
        const app = (window as any).app;

        // Create parent folders recursively
        const parts = filePath.split('/');
        parts.pop();
        for (let i = 1; i <= parts.length; i++) {
            const folderPath = parts.slice(0, i).join('/');
            if (folderPath && !app.vault.getAbstractFileByPath(folderPath)) {
                try {
                    await app.vault.createFolder(folderPath);
                } catch (_e) {
                    // May already exist; ignore
                }
            }
        }

        const existing = app.vault.getAbstractFileByPath(filePath);
        if (existing) {
            await app.vault.modify(existing, fileContent);
        } else {
            await app.vault.create(filePath, fileContent);
        }
    }, relPath, content);
}

/**
 * Wait for a file to be indexed in Obsidian's metadataCache.
 * Must be called after createVaultFile for files the command needs to resolve links into.
 */
export async function waitForCacheReady(relPath: string): Promise<void> {
    await browser.waitUntil(
        () => browser.execute((filePath: string) => {
            const app = (window as any).app;
            return app.vault.getAbstractFileByPath(filePath) !== null
                && app.metadataCache.getFileCache(
                    app.vault.getAbstractFileByPath(filePath)
                ) !== null;
        }, relPath),
        { timeout: 10000, interval: 100, timeoutMsg: `Timed out waiting for cache: ${relPath}` }
    );
}

/**
 * Read a file from the live Obsidian vault. Returns null if the file doesn't exist.
 */
export async function readVaultFile(relPath: string): Promise<string | null> {
    return browser.execute(async (filePath: string) => {
        const app = (window as any).app;
        const file = app.vault.getAbstractFileByPath(filePath);
        if (!file) return null;
        return await app.vault.read(file);
    }, relPath);
}

/**
 * Check whether a path exists in the live Obsidian vault.
 */
export async function vaultPathExists(relPath: string): Promise<boolean> {
    return browser.execute((filePath: string) => {
        const app = (window as any).app;
        return app.vault.getAbstractFileByPath(filePath) !== null;
    }, relPath);
}

/**
 * Open a vault file in Obsidian and position the cursor at the given line (0-indexed).
 * Waits until the active editor is ready before returning.
 */
export async function openFileAtLine(relPath: string, line: number): Promise<void> {
    await browser.execute(async (filePath: string) => {
        const app = (window as any).app;
        const file = app.vault.getAbstractFileByPath(filePath);
        if (!file) throw new Error(`openFileAtLine: file not found: ${filePath}`);
        const leaf = app.workspace.getLeaf(false);
        await leaf.openFile(file);
    }, relPath);

    // Wait until the editor is active and showing this file
    await browser.waitUntil(
        () => browser.execute((filePath: string) => {
            const app = (window as any).app;
            const editor = app.workspace.activeEditor?.editor
                ?? (app.workspace.activeLeaf?.view as any)?.editor;
            const activeFile = app.workspace.getActiveFile();
            return !!(editor && activeFile?.path === filePath);
        }, relPath),
        { timeout: 10000, interval: 100, timeoutMsg: `Timed out waiting for editor: ${relPath}` }
    );

    // Set cursor position
    await browser.execute((filePath: string, lineNum: number) => {
        const app = (window as any).app;
        const editor = app.workspace.activeEditor?.editor
            ?? (app.workspace.activeLeaf?.view as any)?.editor;
        if (editor) {
            editor.setCursor({ line: lineNum, ch: 0 });
        }
    }, relPath, line);

    // Allow metadataCache to index the open file
    await browser.pause(500);
}

/**
 * Execute a bullet-flow command by its short ID (without the 'bullet-flow:' prefix).
 * Throws if the command is not found. Waits for async command to settle.
 */
export async function runCommand(commandId: string): Promise<void> {
    await (browser as any).executeObsidianCommand(`bullet-flow:${commandId}`);
    await browser.pause(1000);
}
