import { createReadTool, createGrepTool, createGlobTool, type SandboxFactory } from '@flue/runtime';
import { local } from '@flue/runtime/node';

export function plannerEnvironment(cwd: string): SandboxFactory {
    return {
        ...local({ cwd }),
        tools: sandbox => [createReadTool(sandbox), createGrepTool(sandbox), createGlobTool(sandbox)],
    };
}
