const { log } = require('./log');
const { run, runQuiet } = require('./exec');
const { printPathHint } = require('./platform');
const { npmInstallGlobal, isLatestVersion, parseVersion } = require('./npm-install');

const PACKAGE = '@anthropic-ai/claude-code';
const COMMAND = 'claude';

function getVersion() {
  return runQuiet(`${COMMAND} --version`);
}

function install() {
  const installedVersion = getVersion();
  if (installedVersion) {
    log(`✓ Claude Code 已安装 (${installedVersion})`, 'green');
    return installedVersion;
  }

  log('\n📦 安装 Claude Code (npm)...', 'blue');
  log('  使用 npm 安装，避免 claude.ai 地区限制导致安装脚本不可用', 'yellow');
  npmInstallGlobal(PACKAGE, { label: 'Claude Code' });

  const version = getVersion();
  if (!version) {
    log('Claude Code 安装后未在 PATH 中找到，请确认 npm 全局 bin 目录已加入 PATH', 'red');
    printPathHint(COMMAND);
    process.exit(1);
  }
  log(`✓ Claude Code 安装完成 (${version})`, 'green');
  return version;
}

function upgrade() {
  const before = getVersion();
  if (!before) {
    log('\n📦 Claude Code 未安装，开始安装...', 'blue');
    const installed = install();
    return { before: null, after: installed, skipped: false };
  }

  log('\n📦 检查 Claude Code 更新...', 'blue');
  const { upToDate, installed, latest } = isLatestVersion(before, PACKAGE);
  if (upToDate) {
    log(`✓ Claude Code 已是最新版本 (${installed})`, 'green');
    return { before, after: before, skipped: true };
  }

  if (latest) {
    log(`  可升级: ${installed} → ${latest}`, 'yellow');
  } else {
    log('  无法获取远程版本，尝试执行升级...', 'yellow');
  }

  npmInstallGlobal(PACKAGE, { upgrade: true, label: 'Claude Code' });
  const after = getVersion();
  if (!after) {
    log('Claude Code 升级后未在 PATH 中找到', 'red');
    printPathHint(COMMAND);
    process.exit(1);
  }
  const afterVer = parseVersion(after);
  if (afterVer === installed) {
    log(`⚠️ 执行升级后版本未变化 (${afterVer})，请检查 npm 全局 PATH`, 'yellow');
    return { before, after, skipped: false, unchanged: true };
  }
  log(`✓ Claude Code 已升级: ${installed} → ${afterVer}`, 'green');
  return { before, after, skipped: false };
}

function uninstall() {
  if (!getVersion()) {
    log('⚠️ Claude Code 未安装，跳过', 'yellow');
    return false;
  }
  run(`npm uninstall -g ${PACKAGE}`);
  if (getVersion()) {
    log('⚠️ Claude Code 卸载后命令仍可用，请手动检查 PATH', 'yellow');
    return false;
  }
  log('✓ Claude Code 已卸载', 'green');
  return true;
}

module.exports = {
  PACKAGE,
  COMMAND,
  getVersion,
  install,
  upgrade,
  uninstall,
};
