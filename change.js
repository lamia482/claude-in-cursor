#!/usr/bin/env node

const { log } = require('./lib/log');
const ccswitch = require('./lib/ccswitch');
const { listProviders } = require('./lib/providers');

function parseArgs(argv) {
  const listOnly = argv.includes('--list') || argv.includes('-l');
  const providersOnly = argv.includes('--providers') || argv.includes('--api-sources');
  const positional = argv.filter(arg => !arg.startsWith('-'));
  return { listOnly, providersOnly, profileId: positional[0] || null };
}

function printProviders() {
  log('\n📋 支持的 API 来源', 'blue');
  for (const provider of listProviders()) {
    console.log(`${provider.provider}\t${provider.profileName}\t${provider.baseUrl}`);
  }
  log('\n使用方式:', 'yellow');
  console.log('  node setup.js --provider deepseek');
  console.log('  node setup.js --provider zhipu');
}

(async () => {
  const args = parseArgs(process.argv.slice(2));

  if (args.providersOnly) {
    printProviders();
    return;
  }

  if (!ccswitch.getCommand()) {
    log('✗ 未安装 cc-switch，请先运行 node setup.js', 'red');
    process.exit(1);
  }

  if (args.profileId) {
    await ccswitch.use(args.profileId);
    log('');
    ccswitch.current();
    return;
  }

  if (args.listOnly) {
    log('\n📋 当前配置', 'blue');
    ccswitch.current();

    log('\n📋 可用 profile', 'blue');
    ccswitch.list();

    log('\n切换方式:', 'yellow');
    console.log('  node change.js              # 交互式选择（默认）');
    console.log('  node change.js <profileId>  # 直接切换');
    console.log('  node change.js --providers  # 查看内置 API 来源');
    return;
  }

  await ccswitch.use(null, { interactive: true });
})();
