export interface CodingStep { failed: boolean; message: string }
export async function codingLoop(
    implement: (role: 'implementer' | 'escalation', feedback: string) => Promise<CodingStep>,
    check: () => Promise<CodingStep>,
): Promise<CodingStep> {
    let feedback = '';
    for (const role of ['implementer', 'implementer', 'implementer', 'escalation'] as const) {
        const result = await implement(role, feedback);
        if (result.failed) return result;
        const verification = await check();
        if (!verification.failed) return { failed: false, message: result.message };
        feedback += `\nPrevious implementation: ${result.message}\nChecks failed:\n${verification.message}\n`;
    }
    return { failed: true, message: `Repair budget exhausted.\n${feedback}` };
}
