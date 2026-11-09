export interface Change { path: string; content: string | null }
export function validateChanges(value: unknown): Change[] {
    if (!Array.isArray(value) || !value.length || value.length > 100) throw new Error('Expected 1–100 changed product files.');
    let bytes = 0;
    const seen = new Set<string>();
    for (const file of value) {
        if (!file || typeof file.path !== 'string' || !/^(src\/|tests\/|styles\.css$)/.test(file.path)
            || file.path.split('/').some((part: string) => !part || part === '.' || part === '..')
            || seen.has(file.path) || (file.content !== null && typeof file.content !== 'string')) {
            throw new Error('Coding output contains an unsupported path or content.');
        }
        seen.add(file.path);
        bytes += Buffer.byteLength(file.content ?? '');
    }
    if (bytes > 1024 * 1024) throw new Error('Coding changes exceed 1 MiB.');
    return value;
}
