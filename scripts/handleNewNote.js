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

    // 5. Create new note in chosen folder
    const newPath = chosenFolder === '/'
        ? `${noteTitle}.md`
        : `${chosenFolder}/${noteTitle}.md`;

    const newFile = await app.vault.create(newPath, '');

    // 6. Open the new note
    await app.workspace.getLeaf(false).openFile(newFile);

    // 7. Delete the original, now that the editor has moved off it. Deleting a
    //    note while it is still open makes Obsidian flush the outgoing editor
    //    buffer back to disk, recreating the file at the path just cleared.
    await app.vault.delete(currentFile);

    return '';
}

// Export main function directly for Templater compatibility
// Attach as property for consistent access pattern
module.exports = handleNewNote;
module.exports.handleNewNote = handleNewNote;
