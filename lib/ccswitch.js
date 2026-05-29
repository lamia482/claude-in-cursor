const { log } = require('./log');
const { run, runQuiet } = require('./exec');
const { resolveCcsCommand, printPathHint } = require('./platform');
const { npmInstallGlobal, isLatestVersion, parseVersion } = require('./npm-install');

const PACKAGE = '@supertiny99/cc-switch';

function getVersion() {
  return runQuiet('ccs --version') || runQuiet('cc-switch --version');
}

function getCommand() {
  return resolveCcsCommand();
}

function requireCommand() {
  const cmd = getCommand();
  if (!cmd) {
    log('✗ 未找到 ccs / cc-switch 命令', 'red');
    printPathHint('ccs');
    process.exit(1);
  }
  return cmd;
}

function install() {
  const installedVersion = getVersion();
  if (installedVersion) {
    log(`✓ cc-switch 已安装 (${installedVersion})`, 'green');
    return installedVersion;
  }

  log('\n📦 安装 cc-switch...', 'blue');
  npmInstallGlobal(PACKAGE, { label: 'cc-switch' });

  const version = getVersion();
  if (!version) {
    log('cc-switch 安装后未在 PATH 中找到', 'red');
    printPathHint('ccs');
    process.exit(1);
  }
  log(`✓ cc-switch 安装完成 (${version})`, 'green');
  return version;
}

function upgrade() {
  const before = getVersion();
  if (!before) {
    log('\n📦 cc-switch 未安装，开始安装...', 'blue');
    const installed = install();
    return { before: null, after: installed, skipped: false };
  }

  log('\n📦 检查 cc-switch 更新...', 'blue');
  const { upToDate, installed, latest } = isLatestVersion(before, PACKAGE);
  if (upToDate) {
    log(`✓ cc-switch 已是最新版本 (${installed})`, 'green');
    return { before, after: before, skipped: true };
  }

  if (latest) {
    log(`  可升级: ${installed} → ${latest}`, 'yellow');
  } else {
    log('  无法获取远程版本，尝试执行升级...', 'yellow');
  }

  npmInstallGlobal(PACKAGE, { upgrade: true, label: 'cc-switch' });
  const after = getVersion();
  if (!after) {
    log('cc-switch 升级后未在 PATH 中找到', 'red');
    printPathHint('ccs');
    process.exit(1);
  }
  const afterVer = parseVersion(after);
  if (afterVer === installed) {
    log(`⚠️ 执行升级后版本未变化 (${afterVer})，请检查 npm 全局 PATH`, 'yellow');
    return { before, after, skipped: false, unchanged: true };
  }
  log(`✓ cc-switch 已升级: ${installed} → ${afterVer}`, 'green');
  return { before, after, skipped: false };
}

function uninstall() {
  if (!getVersion()) {
    log('⚠️ cc-switch 未安装，跳过', 'yellow');
    return false;
  }
  run(`npm uninstall -g ${PACKAGE}`);
  if (getVersion()) {
    log('⚠️ cc-switch 卸载后命令仍可用，请手动检查 PATH', 'yellow');
    return false;
  }
  log('✓ cc-switch 已卸载', 'green');
  return true;
}

function use(profileId, { interactive = false } = {}) {
  const cmd = getCommand();
  if (!cmd) {
    log('⚠️ 未找到 ccs 命令，跳过 profile 激活', 'yellow');
    return false;
  }

  const args = interactive ? `${cmd} use` : `${cmd} use ${profileId}`;
  const result = run(args, {
    allowFail: true,
    stdio: interactive ? 'inherit' : 'pipe',
    input: interactive ? undefined : 'n\n',
  });

  if (result === null && !interactive) {
    log('⚠️ cc-switch 激活失败，但 settings.json 已配置，可直接使用 claude', 'yellow');
    return false;
  }

  if (!interactive) {
    log(`✓ 已通过 cc-switch 激活 ${profileId} 配置`, 'green');
  }
  return true;
}

function list() {
  const cmd = requireCommand();
  run(`${cmd} list`);
}

function current() {
  const cmd = requireCommand();
  run(`${cmd} current`);
}

module.exports = {
  PACKAGE,
  getVersion,
  getCommand,
  requireCommand,
  install,
  upgrade,
  uninstall,
  use,
  list,
  current,
};
