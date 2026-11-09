interface ProcessResult {
    stdout: string | null;
    status: number | null;
    signal?: string | null;
    error?: Error;
}

export function agentResult(result: ProcessResult): { failed: boolean; message: string } {
    const fail = (message: string) => ({ failed: true, message: message.slice(0, 12000) });
    if (result.error) return fail(`Agent process failed: ${result.error.message}`);
    if (result.signal) return fail(`Agent process terminated by ${result.signal}.`);
    let envelope;
    try { envelope = JSON.parse(result.stdout ?? ''); }
    catch { return fail(`Agent returned invalid JSON (exit ${result.status ?? 'unknown'}). See the workflow run.`); }
    if (envelope?.outcome === 'completed') {
        if (result.status !== 0) return fail(`Agent reported completion but exited with ${result.status ?? 'unknown status'}.`);
        if (typeof envelope.message !== 'string' || !envelope.message.trim()) return fail('Agent completed without a handoff.');
        return { failed: false, message: envelope.message.slice(0, 12000) };
    }
    if (['failed', 'aborted', 'error'].includes(envelope?.outcome)) {
        const detail = typeof envelope.error?.message === 'string' ? envelope.error.message : 'See the workflow run.';
        return fail(`Agent ${envelope.outcome}: ${detail}`);
    }
    return fail('Agent returned an unrecognized result. See the workflow run.');
}
