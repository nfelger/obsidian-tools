# Legacy Templater Script

⚠️ **This folder contains a deprecated Templater script that is no longer maintained.**

## Current Implementation

The functionality previously provided by Templater scripts has been migrated to the Bullet Flow plugin:

- `handleNewNote.js` → This script is kept for reference but may be deprecated in the future

## Installation

See the main [README.md](../README.md) for plugin installation via BRAT.

## Templater Trigger Interaction

`handleNewNote.js` places a note by creating it at the chosen path. That creation
fires Obsidian's `create` event, which is what Templater's **Trigger Templater on
new file creation** setting listens on — so if the destination folder is mapped to
the very template that calls this script, Templater runs the flow again on the note
just placed, and the folder picker reappears.

There is a second, less obvious route to the same loop. After the calling template
runs, Templater writes its rendered output back to the target file — the file this
script has just deleted. That write recreates the note at the original path, which
is itself a `create` event, which re-matches the folder template that started the
flow. This one fires whatever destination you pick, so it looks like the picker
simply always runs twice.

The script defends against both: it claims the path it places and the path it
clears, and steps aside when a run targets either. The two claims expire on
different timers — the cleared path is released quickly, because Obsidian hands
that same placeholder name to the next new note once this one is moved away, and a
long claim there would swallow the picker for a note you deliberately created a
moment later.

Two things are worth knowing when the flow still surprises you:

- A folder template on the *destination* fires on placement. That is deliberate —
  it is how filing into a project folder picks up the project template.
- Do **not** add `await` to the `tp.user.handleNewNote(tp)` call in the calling
  template. It reads like a missing keyword, but awaiting it moves Templater's
  write-back to strictly after the delete, turning the recreation from a race into
  a certainty.

## Why Keep This File?

This script is preserved for:
- Historical reference
- Users who may still be using the Templater workflow
- Understanding the evolution of the plugin

**For new installations, use the Bullet Flow plugin instead.**
