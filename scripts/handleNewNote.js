/**
 * handleNewNote.js
 *
 * Templater user script that prompts for a destination folder
 * when creating new notes, then recreates the note there.
 *
 * Usage in template: <% tp.user.handleNewNote(tp) %>
 */

async function handleNewNote(tp) {
    // 1. Capture the current note's title before we delete it
    const noteTitle = tp.file.title;
    const currentFile = tp.config.target_file;

    // 2. Gather all folders, excluding those starting with "."
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

    // 3. Display folder picker
    const displayNames = folders.map(f => f === '/' ? '/ (root)' : f);
    const chosenFolder = await tp.system.suggester(displayNames, folders, true, 'Choose folder for new note...');

    // 4. If user cancelled, we're done
    if (chosenFolder === null) {
        return '';
    }

    // 5. Move the note to the chosen folder.
    //
    //    This is a rename, not a delete-and-recreate. Obsidian saves an idle
    //    editor buffer a couple of seconds after the last edit, and deleting
    //    the note does not cancel a write already queued for it — that write
    //    lands afterwards and recreates the note at the path just cleared,
    //    inside the folder whose template started this flow, which triggers
    //    the whole thing again. Renaming carries the file, and any queued
    //    write, to the new path, leaving nothing behind to be recreated.
    const newPath = chosenFolder === '/'
        ? `${noteTitle}.md`
        : `${chosenFolder}/${noteTitle}.md`;

    await app.fileManager.renameFile(currentFile, newPath);

    // 6. Keep the note focused at its new home
    await app.workspace.getLeaf(false).openFile(currentFile);

    return '';
}

// Export main function directly for Templater compatibility
// Attach as property for consistent access pattern
module.exports = handleNewNote;
module.exports.handleNewNote = handleNewNote;
