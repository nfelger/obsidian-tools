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
 * event — the same event Templater's "Trigger Templater on new file creation"
 * setting listens on. When the destination folder is mapped to the template
 * that calls this script, that second trigger runs the whole flow again on the
 * note we just placed: another picker, another note. These paths record what
 * this script placed so the re-triggered run can recognise its own work and
 * step aside. The window bounds how long a path stays claimed, so a note the
 * user later creates by hand at the same path is still handled normally.
 */
const placedPaths = new Map();
const PLACEMENT_WINDOW_MS = 5000;

function claimPlacement(path) {
    placedPaths.set(path, Date.now());
}

function isOwnPlacement(path) {
    const now = Date.now();

    for (const [placedPath, placedAt] of placedPaths) {
        if (now - placedAt > PLACEMENT_WINDOW_MS) {
            placedPaths.delete(placedPath);
        }
    }

    if (!placedPaths.has(path)) {
        return false;
    }

    placedPaths.delete(path);
    return true;
}

async function handleNewNote(tp) {
    // 1. Capture the current note's title before we delete it
    const noteTitle = tp.file.title;
    const currentFile = tp.config.target_file;

    // 2. Step aside if this run is Templater re-triggering us on our own output
    if (currentFile && isOwnPlacement(currentFile.path)) {
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

    // 6. Delete the current note
    await app.vault.delete(currentFile);

    // 7. Create new note in chosen folder
    const newPath = chosenFolder === '/'
        ? `${noteTitle}.md`
        : `${chosenFolder}/${noteTitle}.md`;

    claimPlacement(newPath);
    const newFile = await app.vault.create(newPath, '');

    // 8. Open the new note
    await app.workspace.getLeaf(false).openFile(newFile);

    return '';
}

// Export main function directly for Templater compatibility
// Attach as property for consistent access pattern
module.exports = handleNewNote;
module.exports.handleNewNote = handleNewNote;
