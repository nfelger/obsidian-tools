import path from 'path';
import type { Options } from '@wdio/types';

const VAULT_PATH = path.resolve(__dirname, 'fixtures/vault');

export const config: Options.Testrunner = {
    runner: 'local',
    specs: [path.join(__dirname, 'specs/**/*.e2e.ts')],
    maxInstances: 1,
    capabilities: [{
        browserName: 'obsidian',
        'wdio:obsidianOptions': {
            appVersion: 'latest',
            plugins: [path.resolve(__dirname, '../..')],
            vault: VAULT_PATH,
        },
    }],
    framework: 'mocha',
    reporters: ['spec'],
    mochaOpts: {
        ui: 'bdd',
        timeout: 120000,
    },
    services: ['obsidian'],
    injectGlobals: false,
    cacheDir: path.resolve(__dirname, '../../.obsidian-cache'),
    logLevel: 'info',
    before: async function(_capabilities, _specs, browser) {
        const hasPlugin = await browser.execute(() => {
            return !!(window as any).app?.plugins?.plugins?.['bullet-flow'];
        });
        if (!hasPlugin) {
            throw new Error('bullet-flow plugin failed to load in Obsidian');
        }
        console.log('bullet-flow plugin loaded successfully');
    },
};
