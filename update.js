#!/usr/bin/env node

const { log } = require('./lib/log');
const { platform, arch } = require('./lib/platform');
const { loadConfig, hasUserConfig } = require('./lib/config');
const { checkNode, checkNpm } = require('./lib/checks');
const claude = require('./lib/claude');
const ccswitch = require('./lib/ccswitch');
const skills = require('./lib/skills');
const { ensureMcpLayout } = require('./lib/agents-layout');
const { configureNatureMcp } = require('./lib/mcp');
const { writeProviderConfig } = require('./lib/settings');
const { resolveApiKeyFromEnv } = require('./lib/apikey');
const { verifySetup } = require('./lib/verify');

function parseArgs(argv) {
  return {
    claudeOnly: argv.includes('--claude-only'),
    ccsOnly: argv.includes('--ccs-only'),
    configOnly: argv.includes('--config-only'),
    skillsOnly: argv.includes('--skills-only'),
    local: argv.includes('--local'),
    skipMcp: argv.includes('--skip-mcp'),
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
  await ccswitch.use(config.profileId);
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
    if (args.local) {
      const mergeResult = skills.syncLocalToManifest();
      log(
        `本地合并: 新增 ${mergeResult.added.length}，已有 ${mergeResult.unchanged.length}，跳过 ${mergeResult.skipped.length}`,
        'blue',
      );
    }

    const results = [];
    if (args.skillsOnly || args.local) {
      results.push(skills.upgrade());
    } else {
      if (!args.ccsOnly) results.push(claude.upgrade());
      if (!args.claudeOnly) results.push(ccswitch.upgrade());
      if (!args.claudeOnly && !args.ccsOnly) results.push(skills.upgrade());
    }
    if (results.length > 0 && results.every(result => result.skipped)) {
      log('\n无需升级，所有组件均已是最新版本', 'green');
    }

    if (!args.skipMcp && !args.configOnly) {
      ensureMcpLayout();
      await configureNatureMcp(config, { interactive: false });
    }
  }

  const skipConfigRefresh = args.claudeOnly || args.ccsOnly || args.skillsOnly;
  if (!skipConfigRefresh) {
    if (hasUserConfig() || args.configOnly) {
      await refreshConfig(config);
    } else {
      log('\n⚠️ 未找到 config.json，跳过配置刷新（使用内置默认配置时无需刷新）', 'yellow');
    }
  }

  await verifySetup(config);
  log('\n✅ 升级完成！\n', 'green');
})();
