/**
 * handleNewNote.js
 *
 * Templater user script that prompts for a destination folder
 * when creating new notes, then recreates the note there.
 *
 * Usage in template: <% tp.user.handleNewNote(tp) %>
 */

/*
 * Placing a note calls app.vault.create(), which fires Obsidian's "create"
 * event — what Templater's "Trigger Templater on new file creation" setting
 * listens on. Templater walks up from the note's folder looking for a folder
 * template, so a mapping on the destination or any ancestor of it applies.
 * When that resolves back to the template calling this script, the whole flow
 * runs again on the note just placed: another picker, another note.
 *
 * The placed path is claimed below so the re-triggered run recognises this
 * script's own work and steps aside. The window comfortably clears the 300ms
 * Templater waits before acting on a new file, while staying short enough
 * that a note the user creates afterwards at that path is handled normally.
 */
const CLAIM_WINDOW_MS = 2000;

const claimedPaths = new Map();

function claimPath(path) {
    claimedPaths.set(path, Date.now());
}

function isOwnPath(path) {
    const now = Date.now();

    for (const [claimedPath, claimedAt] of claimedPaths) {
        if (now - claimedAt > CLAIM_WINDOW_MS) {
            claimedPaths.delete(claimedPath);
        }
    }

    if (!claimedPaths.has(path)) {
        return false;
    }

    claimedPaths.delete(path);
    return true;
}

async function handleNewNote(tp) {
    // 1. Capture the current note's title before we delete it
    const noteTitle = tp.file.title;
    const currentFile = tp.config.target_file;

    // 2. Step aside if this run is Templater re-triggering us on our own output
    if (currentFile && isOwnPath(currentFile.path)) {
        return '';
    }

    // 3. Gather all folders, excluding those starting with "."
    const allFolders = app.vault.getAllFolders();
    const folders = allFolders
        .filter(folder => {
            const hidden = folder.path.split('/').some(part => part.startsWith('.'));
            const journal = folder.path.startsWith('+Diary/');
            const oldNotes = folder.path.startsWith('4 Archive/Alte Notes-Systeme');

            return !hidden && !journal && !oldNotes;
        })

        .map(folder => folder.path)
        .sort();

    // Add root folder option
    folders.unshift('/');

    // 4. Display folder picker
    const displayNames = folders.map(f => f === '/' ? '/ (root)' : f);
    const chosenFolder = await tp.system.suggester(displayNames, folders, false, 'Choose folder for new note...');

    // 5. If user cancelled, leave the note where it is
    if (chosenFolder === null || chosenFolder === undefined) {
        return '';
    }

    // 6. Create the note at its destination before touching the original, so a
    //    failure here leaves the user's note where it is rather than losing it
    const newPath = chosenFolder === '/'
        ? `${noteTitle}.md`
        : `${chosenFolder}/${noteTitle}.md`;

    claimPath(newPath);
    const newFile = await app.vault.create(newPath, '');

    // 7. Move the editor onto the new note *before* removing the old one.
    //    Deleting a file that is still open makes Obsidian flush the outgoing
    //    editor buffer back to disk, recreating the note at its old path.
    await app.workspace.getLeaf(false).openFile(newFile);

    // 8. Delete the original
    await app.vault.delete(currentFile);

    return '';
}

// Export main function directly for Templater compatibility
// Attach as property for consistent access pattern
module.exports = handleNewNote;
module.exports.handleNewNote = handleNewNote;
