import { Notice, TFile } from 'obsidian';
import type BulletFlowPlugin from '../main';
import {
	findFirstWikiLink,
	isPureLinkBullet,
	stripWikilinksToDisplayText
} from '../utils/wikilinks';
import { dedentLines } from '../utils/indent';
import { findChildrenBlockFromListItems, getListItemAtLine, stripListPrefix } from '../utils/listItems';
import { getActiveMarkdownFile, getListItems } from '../utils/commandSetup';

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
		console.log('Clipboard copy failed:', e);
	}
}

/**
 * Extract log command (Complete version with all edge cases).
 *
 * Extracts nested bullet content from current line to a linked note.
 * - Handles pure link bullets (inherits parent context)
 * - Creates ## Log section if missing
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
			new Notice('extractLog ERROR: No listItems metadata in this file.');
			return;
		}

		// Find children
		const children = findChildrenBlockFromListItems(editor, listItems, parentLine);
		if (!children) {
			new Notice('extractLog: No children under current bullet (no-op).');
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
		const firstLink = findFirstWikiLink(parentText, sourcePath, plugin.app.metadataCache);
		let targetFile: TFile | null = null;
		let headingSuffix = '';

		if (firstLink) {
			targetFile = firstLink.tfile;

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
				// CASE 2: Non-pure link - use text after the link
				const afterLinkRaw = parentText.slice(
					firstLink.index + firstLink.matchText.length
				);
				headingSuffix = afterLinkRaw.trim();
			}
		} else {
			// CASE 3: No link - show file picker (NOTE: requires tp.system.suggester)
			// For now, just error out. TODO: Add suggester support in future
			new Notice('extractLog ERROR: No wikilink found on current line.');
			return;
		}

		// Remove children from source
		editor.replaceRange(
			'',
			{ line: children.startLine, ch: 0 },
			{ line: children.endLine, ch: 0 }
		);

		// Build heading line (can contain wikilinks)
		const rawHeadingLineSuffix = headingSuffix ? ` ${headingSuffix}` : '';
		const headingLine = `### [[${dailyNoteName}]]${rawHeadingLineSuffix}`;

		// For section anchor, strip wikilinks to avoid nested brackets
		const rawHeadingTextForLink = dailyNoteName + rawHeadingLineSuffix;
		const headingTextForLink = stripWikilinksToDisplayText(rawHeadingTextForLink).trim();

		// Update wikilink in parent bullet to point to this heading
		// Keep visible text exactly as before using an alias
		if (firstLink) {
			const inner = firstLink.wikiInner;
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

			const newInner = `${newLeft}|${displayTextOriginal}`;
			const newLink = `[[${newInner}]]`;

			const updatedParentText =
				parentText.slice(0, firstLink.index) +
				newLink +
				parentText.slice(firstLink.index + firstLink.matchText.length);

			editor.setLine(parentLine, updatedParentText);
		}

		// Find ## Log in target via metadataCache
		const targetCache = plugin.app.metadataCache.getFileCache(targetFile);
		let logHeadingLine: number | null = null;

		if (targetCache && targetCache.headings) {
			for (const heading of targetCache.headings) {
				if (heading.level === 2 && heading.heading === 'Log') {
					logHeadingLine = heading.position.start.line;
					break;
				}
			}
		}

		// Build block that goes into ## Log (with blank lines around heading)
		const blockLines = ['', headingLine, ''].concat(dedentedChildrenLines);

		// Update target file using vault.process (atomic)
		await plugin.app.vault.process(targetFile, (data: string) => {
			const lines = data.split('\n');

			if (logHeadingLine !== null && logHeadingLine < lines.length) {
				// ## Log exists - insert after it
				const insertAt = logHeadingLine + 1;
				lines.splice(insertAt, 0, ...blockLines);
				return lines.join('\n');
			} else {
				// No ## Log - create it at the end
				const newLines = lines.slice();
				if (
					newLines.length > 0 &&
					newLines[newLines.length - 1].trim() !== ''
				) {
					newLines.push('');
				}
				newLines.push('## Log');
				newLines.push(...blockLines);
				return newLines.join('\n');
			}
		});

		new Notice(
			`extractLog: moved child block to "${targetFile.basename}" > Log`,
			4000
		);

	} catch (e) {
		new Notice(`extractLog ERROR: ${e.message}`, 8000);
		console.log('extractLog ERROR', e);
	}
}
