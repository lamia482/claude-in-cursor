const assert = require('node:assert/strict');
const test = require('node:test');
const { getProviderModelSummaryLines } = require('../lib/model-summary');
const { getProviderPreset } = require('../lib/providers');

test('model summary shows selected provider models and edit instructions', () => {
  const config = getProviderPreset('zhipu');
  const output = getProviderModelSummaryLines(config).join('\n');

  assert.match(output, /Zhipu GLM \(zhipu\)/);
  assert.match(output, /ANTHROPIC_MODEL: glm-5\.2/);
  assert.match(output, /Fable: glm-5\.2\[1M\]/);
  assert.match(output, /Opus: glm-5\.2/);
  assert.match(output, /Sonnet: glm-5\.2/);
  assert.match(output, /Haiku: glm-4\.5-air/);
  assert.match(output, /Subagent: glm-4\.5-air/);
  assert.match(output, /Tool Search: true/);
  assert.match(output, /config\.json/);
  assert.match(output, /node setup\.js --provider zhipu/);
});
