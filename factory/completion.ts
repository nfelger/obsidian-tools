import type { CodingStep } from './coding-loop.ts';
// Fail closed: process completion does not mean the requirements are complete.
export function completion(message: string): CodingStep {
    try {
        const report = JSON.parse(message.replace(/^```(?:json)?\s*|\s*```$/g, ''));
        if (typeof report.summary !== 'string' || !Array.isArray(report.acceptanceCases)
            || !report.acceptanceCases.length || !report.acceptanceCases.every((item: any) =>
                typeof item.id === 'string' && typeof item.evidence === 'string' && item.evidence.trim()
                && ['complete', 'incomplete'].includes(item.status))
            || !Array.isArray(report.remaining) || !report.remaining.every((item: unknown) => typeof item === 'string')) throw new Error();
        const complete = report.remaining.length === 0 && report.acceptanceCases.every((item: any) => item.status === 'complete');
        return { failed: false, complete, message: complete ? report.summary : JSON.stringify(report) };
    } catch {
        return { failed: false, complete: false, message: `Return the required JSON completion report covering every approved acceptance case. Previous handoff: ${message}` };
    }
}
