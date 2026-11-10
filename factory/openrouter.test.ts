import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createModels } from '@earendil-works/pi-ai';
import { openrouterProvider } from '@earendil-works/pi-ai/providers/openrouter';
import { factoryOpenRouterProvider } from './openrouter.ts';
import { modelRoles, modelFor } from './models.ts';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('the registered OpenRouter provider resolves every factory default', () => {
    const models = createModels();
    models.setProvider(factoryOpenRouterProvider());
    for (const role of Object.keys(modelRoles) as (keyof typeof modelRoles)[]) {
        const model = models.getModel('openrouter', modelFor(role, {}));
        assert.ok(model, `${role} default must resolve before a paid request`);
        assert.equal(model.provider, 'openrouter');
        assert.equal(new URL(model.baseUrl).origin, 'https://openrouter.ai');
        assert.ok(model.contextWindow > 0);
        assert.ok(model.maxTokens > 0);
    }
    const flash = models.getModel('openrouter', modelFor('implementer', {}))!;
    assert.equal(flash.api, 'openai-completions');
    assert.equal(flash.reasoning, true);
    assert.ok(flash.input.includes('image'));
});

test('the supplement preserves built-in models and protocol dispatch without duplicates', () => {
    const builtin = openrouterProvider();
    const provider = factoryOpenRouterProvider();
    for (const model of builtin.getAllModels!()) {
        assert.deepEqual(provider.getAllModels!().find(item => item.id === model.id && item.type === model.type), model);
    }
    const ids = provider.getModels().map(model => model.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(provider.getAllModels!().some(model => model.id === modelFor('implementer', {})));
    assert.equal(typeof provider.stream, 'function');
    assert.equal(provider.auth.apiKey?.name, builtin.auth.apiKey?.name);
});

test('flue run loads the coder registration and sends Flash through the OpenRouter protocol', () => {
    const root = mkdtempSync(join(tmpdir(), 'model-probe-'));
    const preload = join(root, 'fetch.mjs');
    const request = join(root, 'request.json');
    writeFileSync(preload, `
import { writeFileSync } from 'node:fs';
globalThis.fetch = async (url, options) => {
    if (String(url) !== 'https://openrouter.ai/api/v1/chat/completions')
        throw new Error('Unexpected network request: ' + url);
    writeFileSync(${JSON.stringify(request)}, options.body);
    const chunk = { id: 'probe', object: 'chat.completion.chunk', created: 1,
        model: 'minimax/minimax-m3.1-flash', choices: [{ index: 0,
        delta: { role: 'assistant', content: 'OK' }, finish_reason: null }] };
    const end = { ...chunk, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } };
    return new Response('data: ' + JSON.stringify(chunk) + '\\n\\n' +
        'data: ' + JSON.stringify(end) + '\\n\\ndata: [DONE]\\n\\n',
        { headers: { 'Content-Type': 'text/event-stream' } });
};
`);
    try {
        const result = spawnSync(process.execPath, ['--import', preload,
            'node_modules/@flue/cli/bin/flue.mjs', 'run', 'coder.ts', '--json', '--message', 'Test'], {
            encoding: 'utf8', timeout: 30000,
            env: { ...process.env, OPENROUTER_API_KEY: 'test-key', CODING_MODEL: modelFor('implementer', {}) },
        });
        assert.equal(result.status, 0, result.stderr + result.stdout);
        assert.equal(JSON.parse(readFileSync(request, 'utf8')).model, modelFor('implementer', {}));
        assert.equal(JSON.parse(result.stdout).outcome, 'completed');
    } finally { rmSync(root, { recursive: true, force: true }); }
});
