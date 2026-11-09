export async function githubRead(
    url: string, headers: HeadersInit,
    request: typeof fetch = fetch,
    wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
        try {
            const response = await request(url, { headers, signal: AbortSignal.timeout(15000) });
            // Buffer the body too: a socket can close after headers have arrived.
            const body = await response.text();
            if (![502, 503, 504].includes(response.status) || attempt === 2) {
                return new Response(body, { status: response.status, headers: response.headers });
            }
        } catch (error) {
            if (attempt === 2) throw error;
        }
        await wait(500 * (attempt + 1));
    }
}
