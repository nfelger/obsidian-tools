import { setProvider } from '@flue/runtime';
import type { Model } from '@earendil-works/pi-ai';
import { openrouterProvider } from '@earendil-works/pi-ai/providers/openrouter';

// Temporary compatibility shim: before extending or adding model definitions here,
// check the latest Flue and Pi releases and prefer a compatible dependency upgrade.
// Pi 1.5.x includes this model but removes Type, which Flue 2.3.0 still imports.
// Remove this shim once compatible releases supply the model in the built-in catalog.
// The pinned Pi catalog predates this model. Metadata from OpenRouter's model
// page and endpoints API; costs are list-price estimates in USD per million tokens.
const flash: Model<'openai-completions'> = {
    id: 'minimax/minimax-m3.1-flash',
    name: 'MiniMax: MiniMax M3.1 Flash',
    provider: 'openrouter',
    api: 'openai-completions',
    baseUrl: 'https://openrouter.ai/api/v1',
    reasoning: true,
    input: ['text', 'image'],
    contextWindow: 1000000,
    maxTokens: 524288,
    cost: { input: 0.15, output: 0.60, cacheRead: 0.015, cacheWrite: 0 },
    compat: {
        supportsDeveloperRole: false,
        thinkingFormat: 'openrouter',
        supportsStrictMode: false,
        sendSessionAffinityHeaders: true,
    },
};

export function factoryOpenRouterProvider() {
    const builtin = openrouterProvider();
    if (builtin.getModels().some(model => model.id === flash.id)) return builtin;
    return {
        ...builtin,
        getModels: () => [...builtin.getModels(), flash],
        getAllModels: () => [...builtin.getAllModels!(), flash],
    };
}

// flue run loads the agent module, so both agent entry points import this module.
setProvider(factoryOpenRouterProvider());
