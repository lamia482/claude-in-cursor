const assert = require('node:assert/strict');
const test = require('node:test');
const { buildProviderEnv } = require('../lib/config');
const { getProviderPreset } = require('../lib/providers');

test('zhipu env includes cc-switch GUI compatible model fields', () => {
  const config = getProviderPreset('zhipu');
  const env = buildProviderEnv('test-key', config);

  assert.equal(env.ANTHROPIC_AUTH_TOKEN, 'test-key');
  assert.equal(env.ANTHROPIC_MODEL, 'glm-5.2');
  assert.equal(env.ANTHROPIC_DEFAULT_FABLE_MODEL, 'glm-5.2[1M]');
  assert.equal(env.ANTHROPIC_DEFAULT_FABLE_MODEL_NAME, 'glm-5.2');
  assert.equal(env.ANTHROPIC_DEFAULT_OPUS_MODEL_NAME, 'glm-5.2');
  assert.equal(env.ANTHROPIC_DEFAULT_SONNET_MODEL_NAME, 'glm-5.2');
  assert.equal(env.ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME, 'glm-5.2');
  assert.equal(env.ENABLE_TOOL_SEARCH, 'true');
});
