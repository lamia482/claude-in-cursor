#!/usr/bin/env node

const { log } = require('./lib/log');
const { platform, arch } = require('./lib/platform');
const { hasUserConfig, loadConfig } = require('./lib/config');
const { checkNode, checkNpm, checkGit, requireGitOnWindows } = require('./lib/checks');
const claude = require('./lib/claude');
const ccswitch = require('./lib/ccswitch');
const skills = require('./lib/skills');
const { ensureMcpLayout } = require('./lib/agents-layout');
const { ensureRulesLayout, parseForceRulesLink } = require('./lib/rules-layout');
const { configureNatureMcp } = require('./lib/mcp');
const { writeProviderConfig } = require('./lib/settings');
const { resolveApiKey } = require('./lib/apikey');
const { verifySetup } = require('./lib/verify');
const { printProviderModelSummary } = require('./lib/model-summary');
const { askChoice } = require('./lib/prompt');
const { getProviderPreset, hasProvider, listProviders } = require('./lib/providers');

function parseArgs(argv) {
  const args = { provider: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--provider' && argv[i + 1]) {
      args.provider = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function providerHasApiKeyEnv(provider) {
  return (provider.apiKeyEnv || []).some(name => (process.env[name] || '').trim());
}

function detectProviderFromEnv() {
  const matched = listProviders().filter(providerHasApiKeyEnv);
  return matched.length === 1 ? matched[0].provider : null;
}

async function askProviderId() {
  const providers = listProviders();
  const options = providers.map((provider, index) => ({
    id: String(index + 1),
    providerId: provider.provider,
    label: `${provider.provider} - ${provider.profileName} (${provider.baseUrl})`,
  }));

  while (true) {
    const answer = await askChoice('请选择 API 来源', options);
    const byIndex = options.find(option => option.id === answer);
    const byProvider = providers.find(provider => provider.provider === answer);
    const providerId = byIndex?.providerId || byProvider?.provider;
    if (providerId) return providerId;
    log(`无效选择: ${answer}`, 'red');
  }
}

async function resolveSetupConfig(argv) {
  const args = parseArgs(argv);
  if (args.provider) {
    if (!hasProvider(args.provider)) {
      log(`✗ 不支持的 API 来源: ${args.provider}`, 'red');
      log(`  可用来源: ${listProviders().map(provider => provider.provider).join(', ')}`, 'yellow');
      process.exit(1);
    }
    return loadConfig({ provider: args.provider });
  }

  if (hasUserConfig()) {
    return loadConfig();
  }

  const envProvider = detectProviderFromEnv();
  const provider = envProvider || await askProviderId();
  const preset = getProviderPreset(provider);
  log(`已选择 API 来源: ${preset.profileName} (${provider})`, 'green');
  return loadConfig({ provider });
}

async function configureProvider(config) {
  log(`\n🔑 配置 ${config.profileName || config.provider} API`, 'blue');
  const apiKey = await resolveApiKey(config);
  writeProviderConfig(apiKey, config);
  await ccswitch.use(config.profileId);
}

(async () => {
  const skipMcp = process.argv.includes('--skip-mcp');
  const forceRulesLink = parseForceRulesLink(process.argv);
  const baseConfig = loadConfig();

  log(`检测到系统: ${platform} / ${arch}`, 'blue');
  checkNode();
  checkNpm();
  const gitOk = checkGit();

  log('\n========================================', 'blue');
  log('  Claude Code + cc-switch 一键配置', 'blue');
  log('========================================\n', 'blue');

  requireGitOnWindows(gitOk);
  if (skills.loadSkillManifest().length > 0 && !gitOk) {
    log('✗ 安装 skills 需要 Git，请先安装 Git 后重试', 'red');
    process.exit(1);
  }

  claude.install();
  ccswitch.install();
  skills.install();
  ensureRulesLayout({ force: forceRulesLink });
  if (!skipMcp) {
    ensureMcpLayout();
    await configureNatureMcp(baseConfig);
  } else {
    log('跳过 MCP 配置 (--skip-mcp)', 'blue');
  }

  const config = await resolveSetupConfig(process.argv.slice(2));
  await configureProvider(config);
  await verifySetup(config);
  printProviderModelSummary(config);

  log('\n✅ 配置完成！', 'green');
  log('\n使用说明：', 'yellow');
  console.log('  1. 在任意目录运行 `claude` 即可使用');
  console.log(`  2. 使用 \`node change.js ${config.profileId}\` 切换当前 profile`);
  console.log('  3. 使用 `node change.js --providers` 查看支持的 API 来源');
  console.log('  4. 非交互模式: export ZHIPU_API_KEY=... && node setup.js --provider zhipu');
  console.log('  5. 可选覆盖: cp config.example.json config.json 自定义参数');
  log('\n🎉 享受你的 AI 编程助手吧！\n', 'green');
})();
