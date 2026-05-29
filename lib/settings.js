const fs = require('fs');
const path = require('path');
const { log } = require('./log');
const { buildProviderEnv, MANAGED_ENV_KEYS } = require('./config');
const { secureWriteFile } = require('./secure-fs');
const {
  ensureClaudeDir,
  ensureProfilesDir,
  getSettingsPath,
  getProfilePath,
  getBackupsDir,
} = require('./paths');

function mergeProviderEnv(existingEnv, apiKey, config) {
  const nextEnv = { ...(existingEnv || {}) };
  for (const key of MANAGED_ENV_KEYS) {
    delete nextEnv[key];
  }
  return { ...nextEnv, ...buildProviderEnv(apiKey, config) };
}

function writeSettings(apiKey, config) {
  ensureClaudeDir();
  const settingsPath = getSettingsPath();
  let settings = {};

  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch {
      log(`⚠️ 无法解析 ${settingsPath}，将覆盖写入 env 部分`, 'yellow');
    }
  }

  settings.env = mergeProviderEnv(settings.env, apiKey, config);
  secureWriteFile(settingsPath, JSON.stringify(settings, null, 2));
  log(`✓ 配置已写入 ${settingsPath}`, 'green');
}

function writeProfile(apiKey, config) {
  ensureProfilesDir();
  const profilePath = getProfilePath(config.profileId);
  const profile = {
    id: config.profileId,
    name: config.profileName,
    description: config.profileDescription || `${config.profileName} Anthropic-compatible API`,
    icon: config.profileIcon || '🔌',
    config: {
      env: buildProviderEnv(apiKey, config),
    },
  };

  secureWriteFile(profilePath, JSON.stringify(profile, null, 2));
  log(`✓ cc-switch profile 已写入 ${profilePath}`, 'green');
}

function removeProfile(profileId) {
  const profilePath = getProfilePath(profileId);
  if (!fs.existsSync(profilePath)) {
    log(`⚠️ profile 不存在: ${profilePath}`, 'yellow');
    return false;
  }
  fs.unlinkSync(profilePath);
  log(`✓ 已移除 profile ${profilePath}`, 'green');
  return true;
}

function purgeEnv() {
  const settingsPath = getSettingsPath();
  if (!fs.existsSync(settingsPath)) {
    log('⚠️ settings.json 不存在，跳过', 'yellow');
    return false;
  }

  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch {
    log(`⚠️ 无法解析 ${settingsPath}，跳过 env 清理`, 'yellow');
    return false;
  }

  if (!settings.env) {
    log('⚠️ settings.json 中无 env 配置，跳过', 'yellow');
    return false;
  }

  const nextEnv = { ...settings.env };
  let removed = 0;
  for (const key of MANAGED_ENV_KEYS) {
    if (key in nextEnv) {
      delete nextEnv[key];
      removed += 1;
    }
  }

  if (removed === 0) {
    log('⚠️ 未找到本工具管理的 env 变量', 'yellow');
    return false;
  }

  settings.env = nextEnv;
  secureWriteFile(settingsPath, JSON.stringify(settings, null, 2));
  log(`✓ 已从 settings.json 清除 ${removed} 个 provider env 变量`, 'green');
  return true;
}

function backupHasToken(filePath) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const env = data.env || data.config?.env || {};
    return Boolean(env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY);
  } catch {
    return false;
  }
}

function purgeBackups() {
  const backupsDir = getBackupsDir();
  if (!fs.existsSync(backupsDir)) {
    log('⚠️ cc-switch 备份目录不存在，跳过', 'yellow');
    return false;
  }

  const files = fs.readdirSync(backupsDir).filter(name => name.endsWith('.json'));
  if (files.length === 0) {
    log('⚠️ cc-switch 备份目录为空，跳过', 'yellow');
    return false;
  }

  let removed = 0;
  for (const name of files) {
    const filePath = path.join(backupsDir, name);
    if (!backupHasToken(filePath)) continue;
    fs.unlinkSync(filePath);
    removed += 1;
    log(`✓ 已删除备份 ${filePath}`, 'green');
  }

  if (removed === 0) {
    log('⚠️ 未找到含 token 的备份文件', 'yellow');
    return false;
  }

  log(`✓ 共清理 ${removed} 个含 token 的备份文件`, 'green');
  return true;
}

function writeProviderConfig(apiKey, config) {
  writeSettings(apiKey, config);
  writeProfile(apiKey, config);
}

module.exports = {
  mergeProviderEnv,
  writeSettings,
  writeProfile,
  removeProfile,
  purgeEnv,
  purgeBackups,
  writeProviderConfig,
};
