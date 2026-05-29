#!/usr/bin/env node

const { log } = require('./lib/log');
const ccswitch = require('./lib/ccswitch');

function parseArgs(argv) {
  const listOnly = argv.includes('--list') || argv.includes('-l');
  const positional = argv.filter(arg => !arg.startsWith('-'));
  return { listOnly, profileId: positional[0] || null };
}

(async () => {
  const args = parseArgs(process.argv.slice(2));

  if (!ccswitch.getCommand()) {
    log('✗ 未安装 cc-switch，请先运行 node setup.js', 'red');
    process.exit(1);
  }

  if (args.profileId) {
    ccswitch.use(args.profileId);
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
    return;
  }

  ccswitch.use(null, { interactive: true });
})();
