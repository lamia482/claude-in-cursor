const fs = require('fs');
const path = require('path');
const { log } = require('./log');
const { getProjectRoot } = require('./paths');
const { getProviderPreset } = require('./providers');

const DEFAULT_CONFIG = getProviderPreset('deepseek');

const MANAGED_ENV_KEYS = [
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_FABLE_MODEL',
  'ANTHROPIC_DEFAULT_FABLE_MODEL_NAME',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL_NAME',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL_NAME',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME',
  'CLAUDE_CODE_SUBAGENT_MODEL',
  'CLAUDE_CODE_EFFORT_LEVEL',
  'ENABLE_TOOL_SEARCH',
];

function getConfigPath() {
  return path.join(getProjectRoot(), 'config.json');
}

function assertNoSecrets(config) {
  const forbidden = ['apiKey', 'api_key', 'token', 'secret'];
  for (const key of forbidden) {
    if (key in config) {
      log(`config.json 不应包含 "${key}" 字段。请使用环境变量或交互输入提供 API Key`, 'red');
      log('  推荐: export DEEPSEEK_API_KEY=... 或 export ZHIPU_API_KEY=... 后重试', 'yellow');
      process.exit(1);
    }
  }
}

function mergeWithProviderPreset(userConfig = {}, providerOverride) {
  const providerId = providerOverride || userConfig.provider || DEFAULT_CONFIG.provider;
  const preset = getProviderPreset(providerId) || DEFAULT_CONFIG;
  return { ...preset, ...userConfig, provider: providerId };
}

function loadConfig(options = {}) {
  const { provider } = options;
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) return mergeWithProviderPreset({}, provider);

  try {
    const userConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assertNoSecrets(userConfig);
    return mergeWithProviderPreset(userConfig, provider);
  } catch (e) {
    log(`config.json 解析失败: ${e.message}`, 'red');
    process.exit(1);
  }
}

function hasUserConfig() {
  return fs.existsSync(getConfigPath());
}

function getProxyBaseUrl(config) {
  const host = config.proxyListenHost || DEFAULT_CONFIG.proxyListenHost;
  const port = config.proxyPort || DEFAULT_CONFIG.proxyPort;
  return `http://${host}:${port}`;
}

function getAnthropicBaseUrl(config) {
  if (config.useProxy === false) {
    return config.baseUrl;
  }
  return getProxyBaseUrl(config);
}

function buildProviderEnv(apiKey, config) {
  return {
    ANTHROPIC_BASE_URL: getAnthropicBaseUrl(config),
    ANTHROPIC_AUTH_TOKEN: apiKey,
    ANTHROPIC_API_KEY: '',
    ANTHROPIC_MODEL: config.model,
    ANTHROPIC_DEFAULT_FABLE_MODEL: config.fableModel || config.model,
    ANTHROPIC_DEFAULT_FABLE_MODEL_NAME: config.fableModelName || config.modelName || config.model,
    ANTHROPIC_DEFAULT_OPUS_MODEL: config.opusModel,
    ANTHROPIC_DEFAULT_OPUS_MODEL_NAME: config.opusModelName || config.modelName || config.opusModel,
    ANTHROPIC_DEFAULT_SONNET_MODEL: config.sonnetModel,
    ANTHROPIC_DEFAULT_SONNET_MODEL_NAME: config.sonnetModelName || config.modelName || config.sonnetModel,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: config.haikuModel,
    ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME: config.haikuModelName || config.modelName || config.haikuModel,
    CLAUDE_CODE_SUBAGENT_MODEL: config.subagentModel,
    CLAUDE_CODE_EFFORT_LEVEL: config.effortLevel,
    ENABLE_TOOL_SEARCH: String(config.enableToolSearch !== false),
  };
}

module.exports = {
  DEFAULT_CONFIG,
  MANAGED_ENV_KEYS,
  getConfigPath,
  mergeWithProviderPreset,
  loadConfig,
  hasUserConfig,
  getProxyBaseUrl,
  getAnthropicBaseUrl,
  buildProviderEnv,
};
