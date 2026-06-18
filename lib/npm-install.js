const { log } = require('./log');
const { runAllowFail, runQuiet } = require('./exec');
const { loadConfig } = require('./config');
const os = require('os');
const path = require('path');
const fs = require('fs');

const DEFAULT_NPM_REGISTRIES = ['default', 'https://registry.npmmirror.com'];

function normalizeRegistry(registry) {
  if (!registry || registry === 'default' || registry === 'npm') return null;
  return registry;
}

function getNpmRegistries() {
  const config = loadConfig();
  const list = Array.isArray(config.npmRegistries) && config.npmRegistries.length > 0
    ? config.npmRegistries
    : DEFAULT_NPM_REGISTRIES;
  return list.map(normalizeRegistry);
}

function registryLabel(registry) {
  return registry || 'npm 默认源';
}

function getUserNpmPrefix() {
  return path.join(os.homedir(), '.npm-global');
}

function getUserNpmBinDir() {
  const prefix = getUserNpmPrefix();
  return os.platform() === 'win32' ? prefix : path.join(prefix, 'bin');
}

function ensurePathIncludes(dir) {
  const paths = (process.env.PATH || '').split(path.delimiter);
  if (!paths.includes(dir)) {
    process.env.PATH = [dir, ...paths].filter(Boolean).join(path.delimiter);
  }
}

function getDefaultNpmPrefix() {
  return runQuiet('npm prefix -g');
}

function canWriteDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function shouldUseUserPrefixFirst() {
  if (process.env.CLAUDE_IN_CURSOR_NPM_PREFIX) return process.env.CLAUDE_IN_CURSOR_NPM_PREFIX;
  const prefix = getDefaultNpmPrefix();
  if (!prefix) return null;
  if (canWriteDir(prefix)) return null;
  return getUserNpmPrefix();
}

function parseVersion(versionOutput) {
  if (!versionOutput) return null;
  const match = String(versionOutput).match(/(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)/);
  return match ? match[1] : String(versionOutput).trim();
}

function getLatestVersion(packageName) {
  const registries = getNpmRegistries();
  for (const registry of registries) {
    const registryFlag = registry ? ` --registry=${registry}` : '';
    const version = runQuiet(`npm view ${packageName} version${registryFlag}`);
    if (version) return version.trim();
  }
  return null;
}

function isLatestVersion(installedRaw, packageName) {
  const installed = parseVersion(installedRaw);
  const latest = getLatestVersion(packageName);
  if (!installed || !latest) return { upToDate: false, installed, latest };
  return { upToDate: installed === latest, installed, latest };
}

function tryNpmInstall(packageSpec, registry, prefix) {
  const registryFlag = registry ? ` --registry=${registry}` : '';
  const prefixFlag = prefix ? ` --prefix "${prefix}"` : '';
  const cmd = `npm install -g ${packageSpec}${registryFlag}${prefixFlag}`;
  return runAllowFail(cmd);
}

function npmInstallGlobal(packageName, { upgrade = false, label } = {}) {
  const registries = getNpmRegistries();
  const packageSpec = upgrade ? `${packageName}@latest` : packageName;
  const displayName = label || packageName;
  const userPrefix = getUserNpmPrefix();
  const userBinDir = getUserNpmBinDir();
  const preferredPrefix = shouldUseUserPrefixFirst();

  if (preferredPrefix) {
    ensurePathIncludes(os.platform() === 'win32' ? preferredPrefix : path.join(preferredPrefix, 'bin'));
    log(`  npm 全局目录无写权限，使用用户目录: ${preferredPrefix}`, 'yellow');
  }

  for (let i = 0; i < registries.length; i += 1) {
    const registry = registries[i];
    const source = registryLabel(registry);

    if (i === 0) {
      log(`  使用源: ${source}`, 'yellow');
    } else {
      log(`\n⚠️ 安装失败，尝试备用源: ${source}`, 'yellow');
    }

    if (tryNpmInstall(packageSpec, registry, preferredPrefix)) {
      if (i > 0) log(`✓ 已通过备用源安装: ${source}`, 'green');
      if (preferredPrefix) log(`✓ 已安装到用户目录: ${preferredPrefix}`, 'green');
      return true;
    }

    if (!preferredPrefix) {
      log(`  全局目录可能无写权限，尝试用户目录: ${userPrefix}`, 'yellow');
    }
    if (!preferredPrefix && tryNpmInstall(packageSpec, registry, userPrefix)) {
      ensurePathIncludes(userBinDir);
      log(`✓ 已安装到用户目录: ${userPrefix}`, 'green');
      log(`  若新终端找不到命令，请加入 PATH: export PATH="${userBinDir}:$PATH"`, 'yellow');
      return true;
    }
  }

  log(`✗ ${displayName} 安装失败，已尝试 ${registries.length} 个源`, 'red');
  log('  可在 config.json 添加 npmRegistries 自定义备用源', 'yellow');
  log('  或手动: npm config set registry https://registry.npmmirror.com', 'yellow');
  log(`  权限问题可手动执行: npm install -g ${packageSpec} --prefix "${userPrefix}"`, 'yellow');
  process.exit(1);
}

module.exports = {
  DEFAULT_NPM_REGISTRIES,
  getNpmRegistries,
  parseVersion,
  getLatestVersion,
  isLatestVersion,
  npmInstallGlobal,
};
