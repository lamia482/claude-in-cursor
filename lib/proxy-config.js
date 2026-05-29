const fs = require('fs');
const { loadConfig } = require('./config');
const { getSettingsPath, getProfilePath } = require('./paths');

function readCurrentProfileId(config) {
  const settingsPath = getSettingsPath();
  if (!fs.existsSync(settingsPath)) {
    return config.profileId;
  }

  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    return settings['cc-switch-current-profile'] || config.profileId;
  } catch {
    return config.profileId;
  }
}

function readProfileMeta(profileId) {
  const profilePath = getProfilePath(profileId);
  if (!fs.existsSync(profilePath)) {
    return null;
  }

  try {
    const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    return profile.claudeInCursor || null;
  } catch {
    return null;
  }
}

function resolveProxyConfig(config = loadConfig()) {
  const profileId = readCurrentProfileId(config);
  const meta = readProfileMeta(profileId) || {};
  const useProxy = meta.useProxy !== undefined ? meta.useProxy : config.useProxy;

  if (useProxy === false) {
    return { enabled: false, profileId };
  }

  const host = meta.proxyListenHost || config.proxyListenHost || '127.0.0.1';
  const port = meta.proxyPort || config.proxyPort || 19876;

  return {
    enabled: true,
    profileId,
    host,
    port,
    upstream: meta.upstreamBaseUrl || config.baseUrl,
    baseUrl: `http://${host}:${port}`,
  };
}

function buildProfileProxyMeta(config) {
  if (config.useProxy === false) {
    return { useProxy: false };
  }

  return {
    useProxy: true,
    upstreamBaseUrl: config.baseUrl,
    proxyPort: config.proxyPort || 19876,
    proxyListenHost: config.proxyListenHost || '127.0.0.1',
  };
}

module.exports = {
  readCurrentProfileId,
  readProfileMeta,
  resolveProxyConfig,
  buildProfileProxyMeta,
};
