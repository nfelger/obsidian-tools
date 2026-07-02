import { Notice, TFile } from 'obsidian';
import type BulletFlowPlugin from '../main';
import {
	findFirstResolvedLink,
	ObsidianLinkResolver,
	isPureLinkBullet,
	stripWikilinksToDisplayText
} from '../utils/wikilinks';
import { dedentLines } from '../utils/indent';
import { findChildrenBlockFromListItems, getListItemAtLine, stripListPrefix } from '../utils/listItems';
import { getActiveMarkdownFile, getListItems } from '../utils/commandSetup';
import { NOTICE_TIMEOUT_SUCCESS, NOTICE_TIMEOUT_ERROR } from '../config';
import { insertBlockAfterHeading, parseTargetHeading } from '../utils/tasks';

/**
 * Copy text to clipboard with error handling.
 */
async function copyToClipboard(text: string): Promise<void> {
	try {
		if (typeof navigator !== 'undefined' &&
			navigator.clipboard &&
			navigator.clipboard.writeText) {
			await navigator.clipboard.writeText(text);
		}
	} catch (e) {
		// Silently fail - clipboard not critical
		console.error('copyToClipboard error:', e);
	}
}

/**
 * Extract log command (Complete version with all edge cases).
 *
 * Extracts nested bullet content from current line to a linked note.
 * - Handles pure link bullets (inherits parent context)
 * - Creates target section if missing
 * - Updates wikilink with section anchor
 * - Preserves exact display text with aliases
 * - Falls back to file picker if no wikilink found
 */
export async function extractLog(plugin: BulletFlowPlugin): Promise<void> {
	try {
		const context = getActiveMarkdownFile(plugin);
		if (!context) return;

		const { editor, file } = context;
		const sourcePath = file.path;
		const dailyNoteName = file.basename;

		const cursor = editor.getCursor();
		const parentLine = cursor.line;
		const parentText = editor.getLine(parentLine);

		const listItems = getListItems(plugin, file);
		if (listItems.length === 0) {
			new Notice('Extract log error: No listItems metadata in this file.');
			return;
		}

		// Find children
		const children = findChildrenBlockFromListItems(editor, listItems, parentLine);
		if (!children) {
			new Notice('Extract log: No children under current bullet (no-op).');
			return;
		}

		// Dedent children
		const childrenLines = children.lines.slice();
		const dedentedChildrenLines = dedentLines(childrenLines);

		// Copy dedented block to clipboard
		const clipboardText = dedentedChildrenLines.join('\n');
		if (clipboardText.trim() !== '') {
			await copyToClipboard(clipboardText);
		}

		// Target note & heading suffix logic
		const linkResolver = new ObsidianLinkResolver(plugin.app.metadataCache, plugin.app.vault);
		const firstLink = findFirstResolvedLink(parentText, sourcePath, linkResolver);
		let targetFile: TFile | null = null;
		let headingSuffix = '';

		if (firstLink) {
			targetFile = plugin.app.vault.getAbstractFileByPath(firstLink.path) as TFile;

			// CASE 1: Pure link bullet - inherit parent context
			if (isPureLinkBullet(parentText, firstLink)) {
				const currentItem = getListItemAtLine(listItems, parentLine);
				if (
					currentItem &&
					typeof currentItem.parent === 'number' &&
					currentItem.parent >= 0
				) {
					const parentListLine = currentItem.parent;
					const parentListText = editor.getLine(parentListLine);
					// Remove bullet/checkbox from parent line
					headingSuffix = stripListPrefix(parentListText).trim();
				}
			} else {
				// CASE 2: Non-pure link - use the whole line without the link,
				// so "Checkin mit Chris zu [[Project]]" keeps its meaning
				const beforeLinkRaw = stripListPrefix(parentText.slice(0, firstLink.index));
				const afterLinkRaw = parentText.slice(
					firstLink.index + firstLink.matchText.length
				);
				headingSuffix = `${beforeLinkRaw.trim()} ${afterLinkRaw.trim()}`.trim();
			}
		} else {
			new Notice('Extract log error: No wikilink found on current line.');
			return;
		}

		// Build heading line (can contain wikilinks)
		// Use one level deeper than the target heading
		const { level: targetLevel, text: targetText } = parseTargetHeading(plugin.settings.logExtractionTargetHeading);
		const subHeadingPrefix = '#'.repeat(targetLevel + 1);
		const rawHeadingLineSuffix = headingSuffix ? ` ${headingSuffix}` : '';
		const headingLine = `${subHeadingPrefix} [[${dailyNoteName}]]${rawHeadingLineSuffix}`;

		// For section anchor, strip wikilinks to avoid nested brackets
		const rawHeadingTextForLink = dailyNoteName + rawHeadingLineSuffix;
		const headingTextForLink = stripWikilinksToDisplayText(rawHeadingTextForLink).trim();

		// Compute the updated wikilink for the parent bullet (applied after the
		// target write succeeds). Keep visible text exactly as before via alias.
		const inner = firstLink.inner;
		const p = inner.split('|');
		const left = p[0]; // original link target (page[#section])
		const aliasPart = p.length > 1 ? p.slice(1).join('|') : null;

		// Base page name (drop any old section)
		const lp = left.split('#');
		const page = lp[0];

		// New target with updated section
		const newLeft = `${page}#${headingTextForLink}`;

		// Visible text should stay exactly the same as before:
		// - if there was an alias, use that
		// - otherwise use the original left part as-is
		const displayTextOriginal = aliasPart ? aliasPart : left;

		const newLink = `[[${newLeft}|${displayTextOriginal}]]`;
		const updatedParentText =
			parentText.slice(0, firstLink.index) +
			newLink +
			parentText.slice(firstLink.index + firstLink.matchText.length);

		// Build block that goes into target section (with blank lines around heading)
		const blockLines = ['', headingLine, ''].concat(dedentedChildrenLines);

		// Update target file using vault.process (atomic). The heading is
		// located in the live content, not the metadata cache, so a stale
		// cache cannot misplace the block.
		await plugin.app.vault.process(targetFile, (data: string) =>
			insertBlockAfterHeading(data, blockLines, plugin.settings.logExtractionTargetHeading)
		);

		// Target write succeeded — now update the source: remove the extracted
		// children and point the wikilink at the new section
		editor.replaceRange(
			'',
			{ line: children.startLine, ch: 0 },
			{ line: children.endLine, ch: 0 }
		);
		editor.setLine(parentLine, updatedParentText);

		new Notice(
			`Extract log: moved child block to "${targetFile.basename}" > ${targetText}`,
			NOTICE_TIMEOUT_SUCCESS
		);

	} catch (e: any) {
		new Notice(`Extract log error: ${e.message}`, NOTICE_TIMEOUT_ERROR);
		console.error('extractLog error:', e);
	}
}
