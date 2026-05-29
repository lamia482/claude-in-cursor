#!/usr/bin/env node

const { log } = require('./lib/log');
const { loadConfig } = require('./lib/config');
const claude = require('./lib/claude');
const ccswitch = require('./lib/ccswitch');
const { removeProfile, purgeEnv, purgeBackups } = require('./lib/settings');
const { askChoice, askConfirm } = require('./lib/prompt');

const MENU_OPTIONS = [
  { id: '1', label: '卸载 Claude Code (npm global)', action: 'claude' },
  { id: '2', label: '卸载 cc-switch (npm global)', action: 'ccs' },
  { id: '3', label: '移除本工具创建的 profile', action: 'profile' },
  { id: '4', label: '清除 settings.json 中的 provider env 变量', action: 'env' },
  { id: '5', label: '全部执行 (1+2+3+4)', action: 'all' },
  { id: '6', label: '清理 cc-switch 备份（可能含 token）', action: 'backups' },
  { id: '0', label: '取消', action: 'cancel' },
];

const ACTION_LABELS = {
  claude: '卸载 Claude Code (npm global)',
  ccs: '卸载 cc-switch (npm global)',
  profile: '移除本工具创建的 profile',
  env: '清除 settings.json 中的 provider env 变量',
  backups: '清理 cc-switch 备份（可能含 token）',
};

function parseArgs(argv) {
  return {
    tools: argv.includes('--tools'),
    config: argv.includes('--config'),
    backups: argv.includes('--backups'),
    all: argv.includes('--all'),
    yes: argv.includes('--yes'),
  };
}

function actionsFromFlag(args) {
  if (args.all) return ['claude', 'ccs', 'profile', 'env'];
  if (args.tools) return ['claude', 'ccs'];
  if (args.config) return ['profile', 'env'];
  if (args.backups) return ['backups'];
  return null;
}

async function confirmActions(actions, skipConfirm) {
  if (skipConfirm) return true;

  log('\n将执行以下操作:', 'yellow');
  actions.forEach(action => {
    const label = ACTION_LABELS[action] || action;
    console.log(`  - ${label}`);
  });
  return askConfirm('确认继续?');
}

async function runActions(actions, config) {
  for (const action of actions) {
    switch (action) {
      case 'claude':
        claude.uninstall();
        break;
      case 'ccs':
        ccswitch.uninstall();
        break;
      case 'profile':
        removeProfile(config.profileId);
        break;
      case 'env':
        purgeEnv();
        break;
      case 'backups':
        purgeBackups();
        break;
      default:
        break;
    }
  }
}

function resolveMenuChoice(choice) {
  const option = MENU_OPTIONS.find(o => o.id === choice);
  if (!option || option.action === 'cancel') return [];
  if (option.action === 'all') return ['claude', 'ccs', 'profile', 'env'];
  return [option.action];
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();

  log('\n========================================', 'blue');
  log('  Claude Code 按需卸载', 'blue');
  log('========================================', 'blue');

  let actions = actionsFromFlag(args);

  if (!actions) {
    const choice = await askChoice('请选择要执行的操作:', MENU_OPTIONS);
    actions = resolveMenuChoice(choice);
    if (actions.length === 0) {
      log('\n已取消。', 'yellow');
      return;
    }
  }

  const confirmed = await confirmActions(actions, args.yes);
  if (!confirmed) {
    log('\n已取消。', 'yellow');
    return;
  }

  await runActions(actions, config);
  log('\n✅ 清理完成！\n', 'green');
})();
