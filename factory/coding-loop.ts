export interface CodingStep { failed: boolean; message: string; complete?: boolean }
export async function codingLoop(
    implement: (role: 'implementer' | 'escalation', feedback: string) => Promise<CodingStep>,
    check: () => Promise<CodingStep>,
    beforePass: () => Promise<void> = async () => {},
): Promise<CodingStep> {
    let feedback = '';
    for (const role of ['implementer', 'implementer', 'implementer', 'escalation'] as const) {
        await beforePass();
        const result = await implement(role, feedback);
        if (result.failed) return result;
        if (result.complete === false) {
            feedback += `\nUnfinished requirements; continue in this workspace:\n${result.message}\n`;
            continue;
        }
        const verification = await check();
        if (!verification.failed) return { failed: false, message: result.message };
        feedback += `\nPrevious implementation: ${result.message}\nChecks failed:\n${verification.message}\n`;
    }
    return { failed: true, message: `Repair budget exhausted.\n${feedback}` };
}
