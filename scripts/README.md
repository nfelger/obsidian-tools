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

Crucially, Templater does not match the destination folder alone.
`get_new_file_template_for_folder` walks *up* the parent chain and takes the first
mapping it finds, so a template mapped to an ancestor — including the vault root —
applies to every folder beneath it. A root mapping therefore re-triggers the flow
for **every** destination you could pick.

The script claims the path it places and steps aside when a run targets it, so the
re-triggered run recognises its own work. The claim expires after a few seconds;
Templater waits 300ms before acting on a new file, so that is ample.

Two things are worth knowing when the flow still surprises you:

- A folder template on the *destination* fires on placement. That is deliberate —
  it is how filing into a project folder picks up the project template. It works
  because this script creates the note empty, and Templater only applies a folder
  template to a file whose content is empty.
- A non-empty new note takes a different branch entirely: Templater parses the
  note's **own content** as a template. That is not this flow, but it is why
  pasting template syntax into a new note can execute it.

## Why Keep This File?

This script is preserved for:
- Historical reference
- Users who may still be using the Templater workflow
- Understanding the evolution of the plugin

**For new installations, use the Bullet Flow plugin instead.**
