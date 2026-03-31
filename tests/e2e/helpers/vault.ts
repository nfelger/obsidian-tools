import { browser } from '@wdio/globals';

/**
 * Create (or overwrite) a file in the live Obsidian vault via Obsidian's API.
 * Creates parent folders as needed. Waits for the vault to index the file.
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
                    // May already exist due to race; ignore
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
 * Waits for the editor to be ready before returning.
 */
export async function openFileAtLine(relPath: string, line: number): Promise<void> {
    await browser.execute(async (filePath: string, lineNum: number) => {
        const app = (window as any).app;
        const file = app.vault.getAbstractFileByPath(filePath);
        if (!file) throw new Error(`openFileAtLine: file not found: ${filePath}`);
        const leaf = app.workspace.getLeaf(false);
        await leaf.openFile(file);
        const editor = app.workspace.activeEditor?.editor
            ?? (app.workspace.activeLeaf?.view as any)?.editor;
        if (editor) {
            editor.setCursor({ line: lineNum, ch: 0 });
        }
    }, relPath, line);
    // Allow Obsidian to finish rendering and indexing
    await browser.pause(800);
}

/**
 * Execute a bullet-flow command by its short ID (without the 'bullet-flow:' prefix).
 * Waits for the async command to settle before returning.
 */
export async function runCommand(commandId: string): Promise<void> {
    await browser.execute((id: string) => {
        (window as any).app.commands.executeCommandById(`bullet-flow:${id}`);
    }, commandId);
    await browser.pause(800);
}
