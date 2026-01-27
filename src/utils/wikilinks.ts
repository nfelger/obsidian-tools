import type { TFile, MetadataCache, Vault } from 'obsidian';
import type { WikiLink, ParsedWikilink, WikilinkMatch, ResolvedLink, LinkResolver } from '../types';
import { stripListPrefix } from './listItems';

// === Link Resolver Implementation ===

/**
 * Obsidian implementation of the LinkResolver interface.
 * Wraps MetadataCache to provide link resolution.
 */
export class ObsidianLinkResolver implements LinkResolver {
	constructor(
		private readonly metadataCache: MetadataCache,
		private readonly vault: Vault
	) {}

	resolve(linkPath: string, sourcePath: string): ResolvedLink | null {
		const tfile = this.metadataCache.getFirstLinkpathDest(linkPath, sourcePath);
		if (!tfile || tfile.extension !== 'md') {
			return null;
		}
		return {
			path: tfile.path,
			basename: tfile.basename,
			extension: tfile.extension,
			index: 0,
			matchText: '',
			inner: ''
		};
	}

	/**
	 * Get the underlying TFile for legacy code.
	 * @deprecated Use resolve() for new code
	 */
	resolveToTFile(linkPath: string, sourcePath: string): TFile | null {
		const tfile = this.metadataCache.getFirstLinkpathDest(linkPath, sourcePath);
		return (tfile && tfile.extension === 'md') ? tfile : null;
	}
}

/**
 * Find the first valid wikilink in a line and resolve it using LinkResolver.
 * Domain-friendly version that doesn't expose TFile.
 */
export function findFirstResolvedLink(
	lineText: string,
	sourcePath: string,
	resolver: LinkResolver
): ResolvedLink | null {
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
		const left = parts[0];
		const linkParts = left.split('#');
		const linkPath = linkParts[0];

		if (!linkPath) continue;

		const resolved = resolver.resolve(linkPath, sourcePath);
		if (resolved) {
			return {
				...resolved,
				index,
				matchText: match[0],
				inner
			};
		}
	}

	return null;
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
