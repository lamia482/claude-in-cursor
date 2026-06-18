const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('setup resolves API provider immediately before provider configuration', () => {
  const setupPath = path.join(__dirname, '..', 'setup.js');
  const source = fs.readFileSync(setupPath, 'utf8');

  const resolveIndex = source.indexOf('const config = await resolveSetupConfig');
  const configureMcpIndex = source.indexOf('await configureNatureMcp');
  const configureProviderIndex = source.indexOf('await configureProvider(config)');

  assert.ok(resolveIndex > configureMcpIndex);
  assert.ok(resolveIndex < configureProviderIndex);
});
