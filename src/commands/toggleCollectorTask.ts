import { Notice, Editor } from 'obsidian';
import type { EditorPosition, EditorSelection } from 'obsidian';
import type BulletFlowPlugin from '../main';
import { getActiveMarkdownFile } from '../adapters/commandSetup';
import { ObsidianLinkResolver } from '../utils/wikilinks';
import { toggleProjectGrouping } from '../utils/collectorToggle';
import type { ToggleFailureReason, ToggleSuccess } from '../utils/collectorToggle';
import { formatToggleNotice } from '../utils/notices';
import { NOTICE_TIMEOUT_ERROR } from '../config';

const COMMAND_LABEL = 'Toggle collector task';

const FAILURE_MESSAGES: Record<ToggleFailureReason, string> = {
	'no-project-task': 'Cursor is not on a project task or collector.',
	'nested': 'Only top-level collectors and project tasks can be toggled.',
	'no-tasks': 'Collector has no tasks to ungroup.',
	'no-matching-tasks': 'No top-level tasks for that project in this section.'
};

/**
 * Write back only the region the toggle rewrote, so the rest of the note —
 * and the cursor sitting outside it — is left alone.
 */
function applyToggle(editor: Editor, before: string, result: ToggleSuccess): void {
	const oldLines = before.split('\n');
	const newLines = result.content.split('\n');
	const { start, end } = result.range;
	const newEnd = end + (newLines.length - oldLines.length);

	editor.replaceRange(
		newLines.slice(start, newEnd).join('\n'),
		{ line: start, ch: 0 },
		{ line: end - 1, ch: oldLines[end - 1].length }
	);
}

/**
 * Move a position recorded before the rewrite into the note as it now is. The
 * toggle changes both the line count and the lengths of the lines it touched,
 * so a position kept verbatim can point past the end of the note.
 */
function clampToEditor(editor: Editor, pos: EditorPosition): EditorPosition {
	const line = Math.min(Math.max(pos.line, 0), editor.lineCount() - 1);
	return { line, ch: Math.min(Math.max(pos.ch, 0), editor.getLine(line).length) };
}

/**
 * Put the cursor and any selection back where the user had them. Writing the
 * rewritten slice back as one range leaves the editor with that whole range
 * selected, which is not a selection the user made.
 */
function restoreSelections(editor: Editor, selections: EditorSelection[]): void {
	if (selections.length === 0) return;

	editor.setSelections(selections.map(({ anchor, head }) => ({
		anchor: clampToEditor(editor, anchor),
		head: clampToEditor(editor, head)
	})));
}

/**
 * Toggle a project's tasks between grouped and flattened shape, in place.
 *
 * With the cursor on a prefixed project task, that task folds under a
 * collector — select more lines to fold more; tasks outside the selection stay
 * where they are. With the cursor anywhere inside a collector's block, the
 * whole group toggles: any loose tasks for its project in the section are
 * gathered in first, and only once there are none left do its children rise
 * back to top level, each prefixed with the collector's link.
 *
 * Commands that bring tasks into a note never group them, so this is the only
 * way a collector is created, filled or removed.
 *
 * @param plugin - BulletFlow plugin instance
 */
export function toggleCollectorTask(plugin: BulletFlowPlugin): void {
	try {
		const context = getActiveMarkdownFile(plugin);
		if (!context) return;

		const { editor, file } = context;
		const content = editor.getValue();
		const resolver = new ObsidianLinkResolver(plugin.app.metadataCache, plugin.app.vault);

		const from = editor.getCursor('from');
		const to = editor.getCursor('to');
		const selections = editor.listSelections();

		const result = toggleProjectGrouping(content, { start: from.line, end: to.line }, {
			sourcePath: file.path,
			resolver,
			settings: plugin.settings
		});

		if (!result.ok) {
			new Notice(`${COMMAND_LABEL}: ${FAILURE_MESSAGES[result.reason]}`);
			return;
		}

		applyToggle(editor, content, result);
		restoreSelections(editor, selections);
		new Notice(formatToggleNotice(COMMAND_LABEL, result.direction, result.projectName, result.taskCount));
	} catch (e: any) {
		new Notice(`${COMMAND_LABEL} error: ${e.message}`, NOTICE_TIMEOUT_ERROR);
		console.error('toggleCollectorTask error:', e);
	}
}
