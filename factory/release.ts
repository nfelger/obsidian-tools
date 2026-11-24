import type { Change } from './changes.ts';

// The model owns the editorial decision. Only the controller can write version files.
export async function releaseChanges(baseVersion: string, changes: Change[], read: (path: string) => Promise<string>) {
    const entry = changes.find(change => change.path === 'CHANGELOG.md');
    const log = entry ? entry.content : await read('CHANGELOG.md');
    const heading = log?.split(/^## /m)[1];
    const version = heading?.match(/^\[(\d+\.\d+\.\d+)\] - \d{4}-\d{2}-\d{2}\s*\n/)?.[1];
    const [a,b,c] = baseVersion.split('.').map(Number);
    if (!version || !heading || !/^- /m.test(heading) ||
        ![`${a}.${b}.${c+1}`, `${a}.${b+1}.0`, `${a+1}.0.0`].includes(version))
        throw new Error('Release needs a dated changelog entry and a semantic bump from ' + baseVersion);
    const result = [...changes];
    const manifest = JSON.parse(await read('manifest.json'));
    for (const path of ['manifest.json','package.json','package-lock.json','versions.json']) {
        const source = await read(path);
        const value = JSON.parse(source);
        if (path === 'versions.json') {
            value[version] = manifest.minAppVersion;
        } else {
            value.version = version;
            if (path === 'package-lock.json') value.packages[''].version = version;
        }
        const content = JSON.stringify(value, null, source.match(/\n([ \t]+)"/)?.[1] ?? '  ') + (source.endsWith('\n') ? '\n' : '');
        if (content !== source) result.push({ path, content });
    }
    return result;
}
