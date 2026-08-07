/**
 * Third-party libraries that Obsidian vendors and re-exports.
 *
 * Obsidian ships its own moment instance, and plugins are expected to use it
 * rather than bundling a second copy — that keeps the bundle small and the
 * locale configuration shared with the app.
 *
 * Importing it through here rather than directly from `obsidian` keeps the rule
 * in CLAUDE.md literally true: domain code under `src/utils/` never imports the
 * Obsidian API. This is library access, not a boundary crossing, so it is
 * deliberately not part of `src/adapters/`.
 */

export { moment } from 'obsidian';
