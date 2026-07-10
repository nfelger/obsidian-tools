/**
 * Shared notice text for transfer commands (push/pull/take), which all
 * report the same merged/new task counts in the same shape.
 */

/**
 * Format the completion notice for a transfer command.
 *
 * @param commandLabel - Notice prefix, e.g. "Push task down"
 * @param pastVerb - Past-tense transfer verb, e.g. "pushed"
 * @param destination - Target note description, e.g. "lower note"
 */
export function formatTransferNotice(
	commandLabel: string,
	pastVerb: string,
	destination: string,
	taskCount: number,
	mergedCount: number,
	newCount: number
): string {
	if (taskCount === 1) {
		return mergedCount > 0
			? `${commandLabel}: Task merged with existing in ${destination}.`
			: `${commandLabel}: Task ${pastVerb} to ${destination}.`;
	}

	const parts: string[] = [];
	if (newCount > 0) parts.push(`${newCount} new`);
	if (mergedCount > 0) parts.push(`${mergedCount} merged`);
	return `${commandLabel}: ${taskCount} tasks ${pastVerb} to ${destination} (${parts.join(', ')}).`;
}
