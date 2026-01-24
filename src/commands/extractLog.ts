import { MarkdownView, Notice, TFile } from 'obsidian';
import type BulletFlowPlugin from '../main';
import { findWikilinkMatches, parseWikilinkText, stripWikilinksToDisplayText } from '../utils/wikilinks';
import { dedentLines } from '../utils/indent';
import { findChildrenBlockFromListItems } from '../utils/listItems';

/**
 * Extract log command (MVP version).
 *
 * Extracts nested bullet content from current line to a linked note.
 * Creates ## Log section if missing, adds extraction with heading and anchor.
 */
export async function extractLog(plugin: BulletFlowPlugin): Promise<void> {
	try {
		// Get active markdown view
		const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) {
			new Notice('extractLog: No active markdown view');
			return;
		}

		const editor = view.editor;
		const file = view.file;
		if (!file) {
			new Notice('extractLog: No active file');
			return;
		}

		// Get cursor position
		const cursor = editor.getCursor();
		const parentLine = cursor.line;
		const parentText = editor.getLine(parentLine);

		// Find first wikilink
		const matches = findWikilinkMatches(parentText);
		if (matches.length === 0) {
			new Notice('extractLog: No wikilink found on current line');
			return;
		}

		const firstMatch = matches[0];
		const parsed = parseWikilinkText(firstMatch.inner);

		// Resolve wikilink to file
		const targetFile = plugin.app.metadataCache.getFirstLinkpathDest(
			parsed.linkPath,
			file.path
		);

		if (!targetFile || targetFile.extension !== 'md') {
			new Notice(`extractLog: Could not resolve wikilink: ${parsed.linkPath}`);
			return;
		}

		// Get list items from metadata cache
		const sourceCache = plugin.app.metadataCache.getFileCache(file);
		const listItems = sourceCache?.listItems || [];

		// Find children
		const children = findChildrenBlockFromListItems(editor, listItems, parentLine);
		if (!children) {
			new Notice('extractLog: No children found');
			return;
		}

		// Build extraction content
		const dailyNoteName = file.basename;
		const headingLine = `### [[${dailyNoteName}]]`;
		const headingTextForLink = stripWikilinksToDisplayText(dailyNoteName).trim();

		// Dedent children and build extraction
		const dedented = dedentLines(children.lines);
		const extractionLines = [headingLine, ...dedented, ''];
		const extraction = extractionLines.join('\n');

		// Copy to clipboard
		await navigator.clipboard.writeText(extraction);

		// Remove children from source
		editor.replaceRange(
			'',
			{ line: children.startLine, ch: 0 },
			{ line: children.endLine, ch: 0 }
		);

		// Update wikilink in parent to point to section
		const newLink = `[[${parsed.linkPath}#${headingTextForLink}|${firstMatch.inner}]]`;
		const updatedParentText =
			parentText.slice(0, firstMatch.index) +
			newLink +
			parentText.slice(firstMatch.index + firstMatch.matchText.length);
		editor.setLine(parentLine, updatedParentText);

		// Find or create ## Log section in target
		const targetContent = await plugin.app.vault.read(targetFile);
		const targetLines = targetContent.split('\n');

		// Simple approach: find ## Log or append at end
		let logIndex = targetLines.findIndex(line => line.trim() === '## Log');

		if (logIndex === -1) {
			// No ## Log section, create it at the end
			targetLines.push('', '## Log', '');
			logIndex = targetLines.length - 1;
		}

		// Insert extraction after ## Log heading
		const insertIndex = logIndex + 1;
		targetLines.splice(insertIndex, 0, ...extractionLines);

		// Write back to target file
		await plugin.app.vault.modify(targetFile, targetLines.join('\n'));

		new Notice(`✅ Extracted to ${targetFile.basename} (copied to clipboard)`);

	} catch (e) {
		new Notice(`extractLog ERROR: ${e.message}`);
		console.error('extractLog ERROR', e);
	}
}
