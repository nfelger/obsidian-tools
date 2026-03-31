import { browser, expect } from '@wdio/globals';
import { describe, it } from 'mocha';

describe('smoke', () => {
    it('loads bullet-flow plugin in Obsidian', async function() {
        const hasPlugin = await browser.execute(() => {
            return !!(window as any).app?.plugins?.plugins?.['bullet-flow'];
        });
        expect(hasPlugin).toBe(true);
    });
});
