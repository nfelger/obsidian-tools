// Retrying a Contents PUT blindly can conflict after a lost successful response.
// Read back first, accept our exact payload, and never overwrite a different writer.
export async function saveState(
    api: (path: string, method?: string, body?: unknown) => Promise<any>,
    previousSha: string | undefined, content: string,
    wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
): Promise<string> {
    for (let attempt = 0; ; attempt++) {
        try {
            const response = await api('contents/state.json', 'PUT', {
                branch: 'factory-state', sha: previousSha,
                message: 'Reconcile factory state', content,
            });
            return response.content.sha;
        } catch (error) {
            // Only network errors and transient server errors merit a retry.
            if (!(error instanceof TypeError) && !/TimeoutError|PUT .*: (502|503|504) /.test(String(error))) throw error;
            const latest = await api('contents/state.json?ref=factory-state').catch(readError => {
                if (!previousSha && String(readError).includes(': 404 ')) return { sha: undefined, content: '' };
                throw readError;
            });
            if (latest.content.replace(/\s/g, '') === content) return latest.sha;
            if (latest.sha !== previousSha) throw new Error('Factory state changed during save; refusing to overwrite it.', { cause: error });
            if (attempt === 2) throw error;
            await wait(500 * (attempt + 1));
        }
    }
}
