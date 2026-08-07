/**
 * handleNewNote.js
 *
 * Templater user script that prompts for a destination folder
 * when creating new notes, then recreates the note there.
 *
 * Usage in template: <% tp.user.handleNewNote(tp) %>
 */

/*
 * Two paths in this flow can fire Obsidian's "create" event, which is what
 * Templater's "Trigger Templater on new file creation" setting listens on:
 *
 *   - the note this script places, when its destination folder is mapped to
 *     the template that calls this script;
 *   - the note this script clears out, if Templater writes its rendered output
 *     back afterwards and recreates the file at that path.
 *
 * Either one re-runs the whole flow: another picker, another note. Both paths
 * are claimed below, so a re-triggered run recognises this script's own work
 * and steps aside. The window bounds how long a path stays claimed, so a note
 * the user later creates by hand at the same path is still handled normally.
 */
/*
 * The two claims get different windows because they race different things.
 * The placed path waits on Templater noticing a genuinely new file, which can
 * lag. The cleared path waits only on Templater's own write finishing, which
 * follows within milliseconds — and Obsidian hands the *same* placeholder name
 * to the next new note once this one is moved away, so a generous window there
 * would swallow the picker for a note the user deliberately created moments
 * later. Short enough to miss that, long enough to catch the rewrite.
 */
const PLACED_WINDOW_MS = 5000;
const CLEARED_WINDOW_MS = 750;

const claimedPaths = new Map();

function claimPath(path, windowMs) {
    claimedPaths.set(path, { at: Date.now(), windowMs });
}

function isOwnPath(path) {
    const now = Date.now();

    for (const [claimedPath, claim] of claimedPaths) {
        if (now - claim.at > claim.windowMs) {
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

    claimPath(newPath, PLACED_WINDOW_MS);
    const newFile = await app.vault.create(newPath, '');

    // 7. Delete the original, claiming its path in case Templater's write
    //    lands after the delete and recreates the file there
    claimPath(currentFile.path, CLEARED_WINDOW_MS);
    await app.vault.delete(currentFile);

    // 8. Open the new note
    await app.workspace.getLeaf(false).openFile(newFile);

    return '';
}

// Export main function directly for Templater compatibility
// Attach as property for consistent access pattern
module.exports = handleNewNote;
module.exports.handleNewNote = handleNewNote;
