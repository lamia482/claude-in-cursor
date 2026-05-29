const { execSync } = require('child_process');
const os = require('os');
const { log } = require('./log');

const platform = os.platform();

function run(cmd, options = {}) {
  const { allowFail = false, stdio = 'inherit', ...rest } = options;
  try {
    return execSync(cmd, { stdio, encoding: 'utf8', shell: true, ...rest });
  } catch (e) {
    if (allowFail) return null;
    log(`命令执行失败: ${cmd}`, 'red');
    process.exit(1);
  }
}

function runQuiet(cmd) {
  try {
    return execSync(cmd, { stdio: 'pipe', encoding: 'utf8', shell: true }).trim();
  } catch {
    return null;
  }
}

function runAllowFail(cmd, options = {}) {
  try {
    execSync(cmd, { stdio: 'inherit', encoding: 'utf8', shell: true, ...options });
    return true;
  } catch {
    return false;
  }
}

function isCommandAvailable(cmd) {
  const checker = platform === 'win32'
    ? `where ${cmd}`
    : `command -v ${cmd}`;
  return runQuiet(checker) !== null;
}

module.exports = { run, runQuiet, runAllowFail, isCommandAvailable };
