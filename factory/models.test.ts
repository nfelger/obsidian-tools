import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { modelFor } from './models.ts';

test('roles have independent defaults and overrides; empty Actions variables use defaults', () => {
    assert.equal(modelFor('planner', {}), 'anthropic/claude-opus-5.5');
    assert.equal(modelFor('implementer', {}), 'minimax/minimax-m3.1-flash');
    assert.equal(modelFor('escalation', {}), 'anthropic/claude-opus-5.5');
    assert.equal(modelFor('utility', {}), 'openai/gpt-6-luna');
    assert.equal(modelFor('planner', { PLANNER_MODEL: ' custom/model ' }), 'custom/model');
    assert.equal(modelFor('planner', { PLANNER_MODEL: ' ', OPENROUTER_MODEL: 'old/model' }), 'anthropic/claude-opus-5.5');
    assert.equal(modelFor('implementer', { PLANNER_MODEL: 'custom/model' }), 'minimax/minimax-m3.1-flash');
});
