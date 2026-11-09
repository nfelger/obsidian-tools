export const modelRoles = {
    planner: { variable: 'PLANNER_MODEL', default: 'anthropic/claude-opus-5.5' },
    implementer: { variable: 'IMPLEMENTER_MODEL', default: 'minimax/minimax-m3.1-flash' },
    escalation: { variable: 'ESCALATION_MODEL', default: 'anthropic/claude-opus-5.5' },
    utility: { variable: 'UTILITY_MODEL', default: 'openai/gpt-6-luna' },
} as const;

export function modelFor(role: keyof typeof modelRoles, env: NodeJS.ProcessEnv = process.env) {
    const config = modelRoles[role];
    return env[config.variable]?.trim() || config.default;
}
