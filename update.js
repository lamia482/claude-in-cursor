#!/usr/bin/env node

const { log } = require('./lib/log');
const { platform, arch } = require('./lib/platform');
const { loadConfig, hasUserConfig } = require('./lib/config');
const { checkNode, checkNpm } = require('./lib/checks');
const claude = require('./lib/claude');
const ccswitch = require('./lib/ccswitch');
const { writeProviderConfig } = require('./lib/settings');
const { resolveApiKeyFromEnv } = require('./lib/apikey');
const { verifySetup } = require('./lib/verify');

function parseArgs(argv) {
  return {
    claudeOnly: argv.includes('--claude-only'),
    ccsOnly: argv.includes('--ccs-only'),
    configOnly: argv.includes('--config-only'),
  };
}

async function refreshConfig(config) {
  const apiKey = resolveApiKeyFromEnv(config, { silent: true });
  if (!apiKey) {
    log('⚠️ 未找到 API Key 环境变量，跳过配置刷新', 'yellow');
    log(`  可设置: ${(config.apiKeyEnv || []).join(' / ')}`, 'yellow');
    return false;
  }

  log('\n🔄 刷新 provider 配置...', 'blue');
  writeProviderConfig(apiKey, config);
  ccswitch.use(config.profileId);
  return true;
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();

  log(`检测到系统: ${platform} / ${arch}`, 'blue');
  checkNode();
  checkNpm();

  log('\n========================================', 'blue');
  log('  Claude Code + cc-switch 升级', 'blue');
  log('========================================\n', 'blue');

  if (!args.configOnly) {
    const results = [];
    if (!args.ccsOnly) results.push(claude.upgrade());
    if (!args.claudeOnly) results.push(ccswitch.upgrade());
    if (results.length > 0 && results.every(result => result.skipped)) {
      log('\n无需升级，所有组件均已是最新版本', 'green');
    }
  }

  if (!args.claudeOnly && !args.ccsOnly) {
    if (hasUserConfig() || args.configOnly) {
      await refreshConfig(config);
    } else {
      log('\n⚠️ 未找到 config.json，跳过配置刷新（使用内置默认配置时无需刷新）', 'yellow');
    }
  }

  verifySetup(config);
  log('\n✅ 升级完成！\n', 'green');
})();
