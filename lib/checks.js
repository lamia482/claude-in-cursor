const { log } = require('./log');
const { runQuiet } = require('./exec');
const { platform } = require('./platform');

function checkNode() {
  const nodeVersion = process.version.slice(1);
  const major = parseInt(nodeVersion.split('.')[0], 10);
  if (major < 18) {
    log(`Node.js 版本过低 (当前 ${nodeVersion})，请升级到 18 或更高版本`, 'red');
    process.exit(1);
  }
  log(`✓ Node.js ${nodeVersion} 符合要求`, 'green');
}

function checkNpm() {
  const version = runQuiet('npm --version');
  if (!version) {
    log('✗ npm 未安装，请先安装 Node.js (含 npm)', 'red');
    process.exit(1);
  }
  log(`✓ npm ${version} 已安装`, 'green');
}

function checkGit() {
  if (runQuiet('git --version')) {
    log('✓ Git 已安装', 'green');
    return true;
  }

  log('⚠️ Git 未安装', 'yellow');
  if (platform === 'win32') {
    log('Windows 安装 Claude Code 需要 Git: https://git-scm.com/download/win', 'yellow');
    return false;
  }
  log('建议安装 Git，但可继续通过 npm 安装 Claude Code', 'yellow');
  return false;
}

function requireGitOnWindows(gitOk) {
  if (platform === 'win32' && !gitOk) {
    log('Windows 请先安装 Git 后重新运行本脚本', 'red');
    process.exit(1);
  }
}

module.exports = {
  checkNode,
  checkNpm,
  checkGit,
  requireGitOnWindows,
};
