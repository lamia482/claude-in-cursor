#!/usr/bin/env node

const { log } = require('./lib/log');
const { platform, arch } = require('./lib/platform');
const { loadConfig } = require('./lib/config');
const { checkNode, checkNpm, checkGit, requireGitOnWindows } = require('./lib/checks');
const claude = require('./lib/claude');
const ccswitch = require('./lib/ccswitch');
const { writeProviderConfig } = require('./lib/settings');
const { resolveApiKey } = require('./lib/apikey');
const { verifySetup } = require('./lib/verify');

async function configureProvider(config) {
  log(`\n🔑 配置 ${config.profileName || config.provider} API`, 'blue');
  const apiKey = await resolveApiKey(config);
  writeProviderConfig(apiKey, config);
  ccswitch.use(config.profileId);
}

(async () => {
  const config = loadConfig();

  log(`检测到系统: ${platform} / ${arch}`, 'blue');
  checkNode();
  checkNpm();
  const gitOk = checkGit();

  log('\n========================================', 'blue');
  log('  Claude Code + cc-switch + DeepSeek 一键配置', 'blue');
  log('========================================\n', 'blue');

  requireGitOnWindows(gitOk);

  claude.install();
  ccswitch.install();
  await configureProvider(config);
  verifySetup(config);

  log('\n✅ 配置完成！', 'green');
  log('\n使用说明：', 'yellow');
  console.log('  1. 在任意目录运行 `claude` 即可使用');
  console.log('  2. 使用 `node change.js` 交互式切换模型');
  console.log('  3. 非交互模式: export DEEPSEEK_API_KEY=... && node setup.js');
  console.log('  4. 可选覆盖: cp config.example.json config.json 自定义参数');
  log('\n🎉 享受你的 AI 编程助手吧！\n', 'green');
})();
