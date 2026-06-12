/**
 * Count leading whitespace (spaces and tabs) in a line.
 */
export function countIndent(line: string): number {
	let i = 0;
	while (i < line.length) {
		const c = line.charAt(i);
		if (c === ' ' || c === '\t') {
			i++;
		} else {
			break;
		}
	}
	return i;
}

/**
 * Get the leading whitespace of a line (spaces and tabs, verbatim).
 */
export function getLeadingWhitespace(line: string): string {
	return line.slice(0, countIndent(line));
}

/**
 * Detect the indentation unit used by a block of lines.
 *
 * Returns '\t' if any line starts with a tab, otherwise the smallest
 * positive space indent found, or null when no line is indented.
 */
export function detectIndentUnit(lines: string[]): string | null {
	let minSpaces = Infinity;
	for (const line of lines) {
		if (line.trim() === '') continue;
		const ws = getLeadingWhitespace(line);
		if (!ws) continue;
		if (ws.includes('\t')) return '\t';
		minSpaces = Math.min(minSpaces, ws.length);
	}
	return isFinite(minSpaces) ? ' '.repeat(minSpaces) : null;
}

/**
 * Re-render the leading indentation of a block in a different unit,
 * preserving each line's depth. Partial indents (smaller than one source
 * unit) round up to a full unit so children stay children.
 *
 * Lines keep their content untouched; only leading whitespace changes.
 */
export function convertIndentUnit(lines: string[], toUnit: string): string[] {
	const fromUnit = detectIndentUnit(lines);
	if (!fromUnit || fromUnit === toUnit) return lines.slice();

	return lines.map(line => {
		if (line.trim() === '') return line;
		const ws = getLeadingWhitespace(line);
		if (!ws) return line;

		let depth = 0;
		let i = 0;
		while (ws.startsWith(fromUnit, i)) {
			depth++;
			i += fromUnit.length;
		}
		if (i < ws.length) depth++; // partial indent → one level deeper
		return toUnit.repeat(depth) + line.slice(ws.length);
	});
}

/**
 * Prefix all non-blank lines with the given whitespace string.
 */
export function indentLinesWith(lines: string[], prefix: string): string[] {
	if (!lines || lines.length === 0 || !prefix) return lines.slice();
	return lines.map(line => line.trim() === '' ? line : prefix + line);
}

/**
 * Remove the minimal common leading indent from all non-blank lines,
 * preserving relative indentation.
 */
export function dedentLines(lines: string[]): string[] {
	let minIndent: number | null = null;

	// Find minimal indentation
	for (const line of lines) {
		if (line.trim() === '') continue;
		const ind = countIndent(line);
		if (minIndent === null || ind < minIndent) {
			minIndent = ind;
		}
	}

	// No indentation to remove
	if (minIndent === null || minIndent === 0) {
		return lines.slice();
	}

	// Remove minIndent from each line
	const out: string[] = [];
	for (const l of lines) {
		if (l.trim() === '') {
			out.push('');
		} else {
			let remove = minIndent;
			let k = 0;
			while (k < l.length && remove > 0) {
				const ch = l.charAt(k);
				if (ch === ' ' || ch === '\t') {
					k++;
					remove--;
				} else {
					break;
				}
			}
			out.push(l.slice(k));
		}
	}
	return out;
}
