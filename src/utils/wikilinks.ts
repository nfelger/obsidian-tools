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
 *   "[[Note#Section]]" -> "Note"
 */
export function stripWikilinksToDisplayText(text: string): string {
	const wikiRegex = /\[\[([^\]]+)\]\]/g;
	return text.replace(wikiRegex, (_match, inner) => {
		const parsed = parseWikilinkText(inner);

		// If alias exists, use it
		if (parsed.alias) {
			return parsed.alias.trim();
		}

		// Otherwise use link path (without section)
		return parsed.linkPath.trim();
	});
}
