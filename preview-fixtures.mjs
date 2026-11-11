import { readdirSync, readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import moment from 'moment';

export function seedFixtures(source, target, now = new Date()) {
    const date = moment(now);
    const tokens = { today: date.format('YYYY-MM-DD'), week: date.format('GGGG-[W]WW'), month: date.format('YYYY-MM'), year: date.format('YYYY') };
    const expand = text => text.replace(/\{\{(today|week|month|year)\}\}/g, (_, name) => tokens[name]);
    for (const entry of readdirSync(source, { withFileTypes: true })) {
        const input = join(source, entry.name), output = join(target, expand(entry.name));
        if (entry.isDirectory()) seedFixtures(input, output, now);
        else {
            mkdirSync(dirname(output), { recursive: true });
            if (entry.name.endsWith('.md')) writeFileSync(output, expand(readFileSync(input, 'utf8')));
            else cpSync(input, output);
        }
    }
}
