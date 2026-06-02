const fs = require('fs');
const path = require('path');
const { log } = require('./log');
const { getProjectRoot } = require('./paths');

const DEFAULT_CONFIG = {
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.com/anthropic',
  useProxy: true,
  proxyPort: 19876,
  proxyListenHost: '127.0.0.1',
  model: 'deepseek-v4-pro[1m]',
  opusModel: 'deepseek-v4-pro[1m]',
  sonnetModel: 'deepseek-v4-pro[1m]',
  haikuModel: 'deepseek-v4-flash',
  subagentModel: 'deepseek-v4-flash',
  effortLevel: 'max',
  claudeModelTier: 'opus',
  profileId: 'deepseek',
  profileName: 'DeepSeek',
  profileDescription: 'DeepSeek Anthropic-compatible API',
  profileIcon: '🐋',
  apiKeyEnv: ['DEEPSEEK_API_KEY', 'ANTHROPIC_AUTH_TOKEN'],
  npmRegistries: ['default', 'https://registry.npmmirror.com'],
  pubmedEmail: '',
  natureMcp: true,
};

const MANAGED_ENV_KEYS = [
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'CLAUDE_CODE_SUBAGENT_MODEL',
  'CLAUDE_CODE_EFFORT_LEVEL',
];

function loadConfig() {
  const configPath = path.join(getProjectRoot(), 'config.json');
  if (!fs.existsSync(configPath)) return { ...DEFAULT_CONFIG };

  try {
    const userConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const forbidden = ['apiKey', 'api_key', 'token', 'secret'];
    for (const key of forbidden) {
      if (key in userConfig) {
        log(`config.json 不应包含 "${key}" 字段。请使用环境变量或交互输入提供 API Key`, 'red');
        log('  推荐: export DEEPSEEK_API_KEY=... && node setup.js', 'yellow');
        process.exit(1);
      }
    }
    return { ...DEFAULT_CONFIG, ...userConfig };
  } catch (e) {
    log(`config.json 解析失败: ${e.message}`, 'red');
    process.exit(1);
  }
}

function hasUserConfig() {
  return fs.existsSync(path.join(getProjectRoot(), 'config.json'));
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
    ANTHROPIC_DEFAULT_OPUS_MODEL: config.opusModel,
    ANTHROPIC_DEFAULT_SONNET_MODEL: config.sonnetModel,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: config.haikuModel,
    CLAUDE_CODE_SUBAGENT_MODEL: config.subagentModel,
    CLAUDE_CODE_EFFORT_LEVEL: config.effortLevel,
  };
}

module.exports = {
  DEFAULT_CONFIG,
  MANAGED_ENV_KEYS,
  loadConfig,
  hasUserConfig,
  getProxyBaseUrl,
  getAnthropicBaseUrl,
  buildProviderEnv,
};
