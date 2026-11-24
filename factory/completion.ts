import type { CodingStep } from './coding-loop.ts';

// Accept one explicit fenced report with surrounding commentary, or a bare JSON
// report. Never guess between multiple reports or silently repair broken JSON.
export function completion(message: string): CodingStep {
    try {
        const fences = [...message.matchAll(/```(?:json)?\s*\n([\s\S]*?)```/g)];
        if (fences.length > 1) throw new Error('Multiple completion reports');
        const report = JSON.parse(fences.length === 1 ? fences[0]![1]! : message);
        if (!report || typeof report.summary !== 'string' || !report.summary.trim()
            || !Array.isArray(report.acceptanceCases) || !report.acceptanceCases.length
            || !report.acceptanceCases.every((item: any) => item && typeof item.id === 'string' && item.id.trim()
                && typeof item.evidence === 'string' && item.evidence.trim()
                && ['complete', 'incomplete'].includes(item.status))
            || new Set(report.acceptanceCases.map((item: any) => item.id)).size !== report.acceptanceCases.length
            || !Array.isArray(report.remaining)) throw new Error('Invalid report schema');
        const kinds = ['implementation', 'publication', 'accepted-assumption', 'protected-documentation'];
        if (!report.remaining.every((item: any) => typeof item === 'string' ||
            (item && kinds.includes(item.kind) && typeof item.detail === 'string' && item.detail.trim())))
            throw new Error('Invalid remaining-work entry');
        // Legacy strings remain blockers: do not infer completion from prose.
        const blockers = report.remaining.filter((item: any) => typeof item === 'string' || item.kind === 'implementation')
            .map((item: any) => typeof item === 'string' ? item : item.detail);
        for (const item of report.acceptanceCases) {
            if (item.status === 'incomplete') blockers.push(`${item.id}: ${item.evidence}`);
        }
        return { failed: false, complete: blockers.length === 0,
            message: blockers.length ? `Required work remains:\n${blockers.join('\n')}` : report.summary };
    } catch {
        return { failed: false, complete: false,
            message: 'Invalid completion report. Return one JSON object with summary, acceptanceCases and remaining; use the required schema. Do not repeat the full prior transcript.' };
    }
}
