import { execFileSync } from 'node:child_process';
import { defineTool } from '@flue/runtime';
import * as v from 'valibot';

export function repositoryReader(root: string) {
    const git = (args: string[]) => execFileSync('git', ['-C', root, ...args], { maxBuffer: 2 * 1024 * 1024 });
    const files = git(['ls-tree', '-r', '--name-only', '-z', 'HEAD']).toString().split('\0').filter(Boolean);
    function read(path: string) {
        if (!files.includes(path)) throw new Error('Choose a tracked path returned by list_files.');
        const content = git(['show', `HEAD:${path}`]);
        if (content.includes(0)) throw new Error('Binary file; choose a text file.');
        return content.toString();
    }
    return {
        list: (query: string) => files.filter(path => path.includes(query)).slice(0, 200).join('\n'),
        read: (path: string, start: number) => read(path).split('\n').slice(start - 1, start + 149)
            .map((line, index) => `${start + index}: ${line}`).join('\n').slice(0, 24000),
        search: (query: string) => {
            if (!query.trim()) throw new Error('Provide a nonempty literal search string.');
            const matches: string[] = [];
            for (const path of files) {
                let content: string;
                try { content = read(path); } catch { continue; }
                for (const [index, line] of content.split('\n').entries()) {
                    if (line.includes(query)) matches.push(`${path}:${index + 1}: ${line.slice(0, 300)}`);
                    if (matches.length === 50) return matches.join('\n') + '\n[Result limit reached; narrow the query.]';
                }
            }
            return matches.join('\n') || 'No matches in readable tracked text files.';
        },
    };
}

export function repositoryTools(root: string) {
    const repo = repositoryReader(root);
    return [
        defineTool({ name: 'list_files', description: 'List up to 200 tracked repository paths containing query. Use a directory or filename fragment to narrow results.',
            input: v.object({ query: v.string() }), run: ({ data }) => repo.list(data.query) }),
        defineTool({ name: 'read_file', description: 'Read up to 150 numbered lines from a tracked text file at the checked-out commit. Increase startLine for more.',
            input: v.object({ path: v.string(), startLine: v.pipe(v.number(), v.integer(), v.minValue(1)) }),
            run: ({ data }) => repo.read(data.path, data.startLine) }),
        defineTool({ name: 'search_files', description: 'Literal search across readable tracked text files, returning up to 50 path:line matches.',
            input: v.object({ query: v.string() }), run: ({ data }) => repo.search(data.query) }),
    ];
}
