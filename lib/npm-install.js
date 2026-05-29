const { log } = require('./log');
const { runAllowFail, runQuiet } = require('./exec');
const { loadConfig } = require('./config');

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

function npmInstallGlobal(packageName, { upgrade = false, label } = {}) {
  const registries = getNpmRegistries();
  const packageSpec = upgrade ? `${packageName}@latest` : packageName;
  const displayName = label || packageName;

  for (let i = 0; i < registries.length; i += 1) {
    const registry = registries[i];
    const source = registryLabel(registry);

    if (i === 0) {
      log(`  使用源: ${source}`, 'yellow');
    } else {
      log(`\n⚠️ 安装失败，尝试备用源: ${source}`, 'yellow');
    }

    const registryFlag = registry ? ` --registry=${registry}` : '';
    const cmd = `npm install -g ${packageSpec}${registryFlag}`;
    if (runAllowFail(cmd)) {
      if (i > 0) log(`✓ 已通过备用源安装: ${source}`, 'green');
      return true;
    }
  }

  log(`✗ ${displayName} 安装失败，已尝试 ${registries.length} 个源`, 'red');
  log('  可在 config.json 添加 npmRegistries 自定义备用源', 'yellow');
  log('  或手动: npm config set registry https://registry.npmmirror.com', 'yellow');
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
