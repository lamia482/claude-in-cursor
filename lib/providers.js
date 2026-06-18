const COMMON_PROVIDER_CONFIG = {
  useProxy: true,
  proxyPort: 19876,
  proxyListenHost: '127.0.0.1',
  effortLevel: 'max',
  claudeModelTier: 'opus',
  enableToolSearch: true,
  npmRegistries: ['default', 'https://registry.npmmirror.com'],
  pubmedEmail: '',
  natureMcp: true,
  githubMirror: true,
  githubMirrorFirst: true,
  githubMirrorPrefix: 'https://ghfast.top/',
};

const SUPPORTED_PROVIDERS = {
  deepseek: {
    ...COMMON_PROVIDER_CONFIG,
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com/anthropic',
    model: 'deepseek-v4-pro[1m]',
    opusModel: 'deepseek-v4-pro[1m]',
    sonnetModel: 'deepseek-v4-pro[1m]',
    haikuModel: 'deepseek-v4-flash',
    subagentModel: 'deepseek-v4-flash',
    profileId: 'deepseek',
    profileName: 'DeepSeek',
    profileDescription: 'DeepSeek Anthropic-compatible API',
    profileIcon: '🐋',
    apiKeyEnv: ['DEEPSEEK_API_KEY', 'ANTHROPIC_AUTH_TOKEN'],
  },
  zhipu: {
    ...COMMON_PROVIDER_CONFIG,
    provider: 'zhipu',
    baseUrl: 'https://open.bigmodel.cn/api/anthropic',
    model: 'glm-5.2',
    modelName: 'glm-5.2',
    fableModel: 'glm-5.2[1M]',
    fableModelName: 'glm-5.2',
    opusModel: 'glm-5.2',
    opusModelName: 'glm-5.2',
    sonnetModel: 'glm-5.2',
    sonnetModelName: 'glm-5.2',
    haikuModel: 'glm-4.5-air',
    haikuModelName: 'glm-5.2',
    subagentModel: 'glm-4.5-air',
    profileId: 'zhipu',
    profileName: 'Zhipu GLM',
    profileDescription: 'Zhipu GLM Anthropic-compatible API',
    profileIcon: '🧠',
    apiKeyEnv: ['ZHIPU_API_KEY', 'ANTHROPIC_AUTH_TOKEN'],
  },
};

function getProviderPreset(providerId) {
  if (!providerId) return null;
  const preset = SUPPORTED_PROVIDERS[providerId];
  return preset ? { ...preset } : null;
}

function listProviders() {
  return Object.values(SUPPORTED_PROVIDERS).map(provider => ({ ...provider }));
}

function hasProvider(providerId) {
  return Boolean(SUPPORTED_PROVIDERS[providerId]);
}

module.exports = {
  COMMON_PROVIDER_CONFIG,
  SUPPORTED_PROVIDERS,
  getProviderPreset,
  listProviders,
  hasProvider,
};
