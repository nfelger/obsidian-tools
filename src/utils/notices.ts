/**
 * Notice text for the commands that report task counts — the transfer
 * commands (push/pull/take), which all share the merged/new shape, and the
 * collector toggle.
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

/**
 * Format the completion notice for the collector toggle, naming the shape the
 * tasks ended up in.
 *
 * @param commandLabel - Notice prefix, e.g. "Toggle collector task"
 * @param direction - Where the tasks landed
 */
export function formatToggleNotice(
	commandLabel: string,
	direction: 'grouped' | 'ungrouped',
	projectName: string,
	taskCount: number
): string {
	const tasks = taskCount === 1 ? '1 task' : `${taskCount} tasks`;
	const shape = direction === 'grouped'
		? `grouped under ${projectName}`
		: `ungrouped from ${projectName}`;
	return `${commandLabel}: ${tasks} ${shape}.`;
}
