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

The script defends against this itself: it remembers the paths it places and steps
aside when a run targets one of them. Two vault-side settings still shape the
behaviour, and are worth checking when the flow surprises you:

- A **folder template** mapping the new-note default folder to the template that
  calls this script is what starts the flow. Picking that same folder in the picker
  is the self-triggering case.
- A folder template on the *destination* still fires on placement — that is
  deliberate, and how filing into a project folder picks up the project template.

## Why Keep This File?

This script is preserved for:
- Historical reference
- Users who may still be using the Templater workflow
- Understanding the evolution of the plugin

**For new installations, use the Bullet Flow plugin instead.**
