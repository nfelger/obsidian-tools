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
 * Add a fixed amount of leading whitespace to all non-blank lines.
 *
 * @param lines - Lines to indent
 * @param amount - Number of spaces to prepend
 * @returns Indented lines
 */
export function indentLines(lines: string[], amount: number): string[] {
	if (!lines || lines.length === 0 || amount <= 0) return lines.slice();

	const prefix = ' '.repeat(amount);
	return lines.map(line => line.trim() === '' ? '' : prefix + line);
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
