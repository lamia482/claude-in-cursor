const { log } = require('./log');
const { askSecret } = require('./prompt');

function resolveApiKeyFromEnv(config, { silent = false } = {}) {
  const envNames = config.apiKeyEnv || ['DEEPSEEK_API_KEY', 'ANTHROPIC_AUTH_TOKEN'];
  for (const name of envNames) {
    const value = (process.env[name] || '').trim();
    if (value) {
      if (!silent) log(`✓ 已从环境变量 ${name} 读取 API Key`, 'green');
      return value;
    }
  }
  return null;
}

async function resolveApiKey(config, { interactive = true, promptLabel } = {}) {
  const fromEnv = resolveApiKeyFromEnv(config);
  if (fromEnv) return fromEnv;

  if (!interactive) return null;

  const label = promptLabel || `请输入你的 ${config.profileName || config.provider} API Key: `;
  const apiKey = (await askSecret(label)).trim();
  if (!apiKey) {
    const envHint = (config.apiKeyEnv || ['DEEPSEEK_API_KEY']).join(' / ');
    log(`API Key 不能为空。可设置环境变量 ${envHint} 后重试`, 'red');
    process.exit(1);
  }
  return apiKey;
}

module.exports = { resolveApiKeyFromEnv, resolveApiKey };
