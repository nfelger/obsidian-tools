import type { TFile, MetadataCache } from 'obsidian';
import type { WikiLink } from '../types';
import { stripListPrefix } from './listItems';

export interface ParsedWikilink {
	linkPath: string;
	section: string | null;
	alias: string | null;
}

export interface WikilinkMatch {
	index: number;
	matchText: string;
	inner: string;
}

/**
 * Parse the inner text of a wikilink.
 * Examples:
 *   "Note Name" -> { linkPath: "Note Name", section: null, alias: null }
 *   "Note#Section" -> { linkPath: "Note", section: "Section", alias: null }
 *   "Note|Alias" -> { linkPath: "Note", section: null, alias: "Alias" }
 *   "Note#Section|Alias" -> { linkPath: "Note", section: "Section", alias: "Alias" }
 */
export function parseWikilinkText(inner: string): ParsedWikilink {
	// Split on | first to get alias
	const parts = inner.split('|');
	const left = parts[0];
	const alias = parts.length > 1 ? parts.slice(1).join('|') : null;

	// Split left part on # to get section
	const linkParts = left.split('#');
	const linkPath = linkParts[0];
	const section = linkParts.length > 1 ? linkParts.slice(1).join('#') : null;

	return { linkPath, section, alias };
}

/**
 * Find all wikilink matches in a line of text.
 * Ignores embeds (![[...]]).
 */
export function findWikilinkMatches(lineText: string): WikilinkMatch[] {
	const wikiRegex = /\[\[([^\]]+)\]\]/g;
	const matches: WikilinkMatch[] = [];
	let match;

	while ((match = wikiRegex.exec(lineText)) !== null) {
		const index = match.index;

		// Ignore embeds (![[...]])
		if (index > 0 && lineText.charAt(index - 1) === '!') {
			continue;
		}

		matches.push({
			index,
			matchText: match[0],
			inner: match[1]
		});
	}

	return matches;
}

/**
 * Replace wikilinks in text with their display text.
 * Used when creating section anchors to avoid nested brackets.
 *
 * Examples:
 *   "[[Note]]" -> "Note"
 *   "[[Note|Alias]]" -> "Alias"
 *   "[[Note#Section]]" -> "Section" (use section name!)
 */
export function stripWikilinksToDisplayText(text: string): string {
	const wikiRegex = /\[\[([^\]]+)\]\]/g;
	return text.replace(wikiRegex, (_match, inner) => {
		const parsed = parseWikilinkText(inner);

		// If alias exists, use it
		if (parsed.alias) {
			return parsed.alias.trim();
		}

		// If section exists, use section name (not page name!)
		if (parsed.section && parsed.section.trim() !== '') {
			return parsed.section.trim();
		}

			// Otherwise use link path
		return parsed.linkPath.trim();
	});
}

/**
 * Find the first valid wikilink in a line and resolve it to a TFile.
 * Ignores embeds (![[...]]).
 * Returns null if no valid markdown file link found.
 */
export function findFirstWikiLink(
	lineText: string,
	sourcePath: string,
	metadataCache: MetadataCache
): WikiLink | null {
	const wikiRegex = /\[\[([^\]]+)\]\]/g;
	let match;

	while ((match = wikiRegex.exec(lineText)) !== null) {
		const index = match.index;
		// Ignore embeds (![[...]])
		if (index > 0 && lineText.charAt(index - 1) === '!') {
			continue;
		}

		const inner = match[1];
		const parts = inner.split('|');
		const left = parts[0]; // Note[#Section]
		const linkParts = left.split('#');
		const linkPath = linkParts[0];

		if (!linkPath) continue;

		const tfile = metadataCache.getFirstLinkpathDest(linkPath, sourcePath);
		if (tfile && tfile.extension === 'md') {
			return {
				tfile,
				index,
				matchText: match[0],
				wikiInner: inner
			};
		}
	}

	return null;
}

/**
 * Check if a bullet line is a "pure link bullet" - only markers + one wikilink.
 * Examples:
 *   "- [[Note]]" -> true
 *   "  - [[Project]]" -> true
 *   "- [[Note]] with text" -> false
 *   "- Text with [[Note]]" -> false
 */
export function isPureLinkBullet(parentText: string, firstLink: WikiLink | null): boolean {
	if (!firstLink) return false;

	// Remove list prefix (bullet + optional checkbox)
	const stripped = stripListPrefix(parentText).trim();

	// Must be exactly the first wikilink text and nothing else
	if (stripped !== firstLink.matchText) return false;

	// Ensure there is only one wikilink on the line
	const wikiRegex = /\[\[/g;
	let count = 0;
	while (wikiRegex.exec(parentText) !== null) {
		count++;
	}
	return count === 1;
}
