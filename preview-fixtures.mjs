import { readdirSync, readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import moment from 'moment';

export function seedFixtures(source, target, now = new Date(), settings = JSON.parse(readFileSync(new URL('./.devcontainer/vault/.obsidian/plugins/periodic-notes/data.json', import.meta.url), 'utf8'))) {
    const date = moment(now);
    const tokens = { today: date.format('YYYY-MM-DD'), week: date.format('GGGG-[W]WW'), month: date.format('YYYY-MM'), year: date.format('YYYY') };
    for (const [token, period] of Object.entries({ dailyPath: 'daily', weeklyPath: 'weekly', monthlyPath: 'monthly', yearlyPath: 'yearly' })) {
        const config = settings[period];
        const anchor = period === 'weekly' ? date.clone().isoWeekday(4) : date;
        tokens[token] = config.folder + '/' + anchor.locale('en').format(config.format);
    }
    const expand = text => text.replace(/\{\{(today|week|month|year|dailyPath|weeklyPath|monthlyPath|yearlyPath)\}\}/g, (_, name) => tokens[name]);
    for (const entry of readdirSync(source, { withFileTypes: true })) {
        const input = join(source, entry.name), output = join(target, expand(entry.name));
        if (entry.isDirectory()) seedFixtures(input, output, now, settings);
        else {
            mkdirSync(dirname(output), { recursive: true });
            if (entry.name.endsWith('.md')) writeFileSync(output, expand(readFileSync(input, 'utf8')));
            else cpSync(input, output);
        }
    }
}
