const os = require('os');
const path = require('path');
const { runQuiet } = require('./exec');

const platform = os.platform();
const arch = os.arch();

function getNpmGlobalBin() {
  const prefix = runQuiet('npm prefix -g');
  if (!prefix) return null;
  return platform === 'win32' ? prefix : path.join(prefix, 'bin');
}

function printPathHint(commandName) {
  const binDir = getNpmGlobalBin();
  if (platform === 'win32') {
    logHint('Windows 通常为: %APPDATA%\\npm');
    return;
  }
  if (binDir) {
    logHint(`请将 ${binDir} 加入 PATH，或执行: export PATH="${binDir}:$PATH"`);
  } else {
    logHint('可执行: npm bin -g  查看全局 bin 路径');
  }
}

function logHint(msg) {
  const { log } = require('./log');
  log(msg, 'yellow');
}

function resolveCcsCommand() {
  const { isCommandAvailable } = require('./exec');
  if (isCommandAvailable('ccs')) return 'ccs';
  if (isCommandAvailable('cc-switch')) return 'cc-switch';
  return null;
}

module.exports = {
  platform,
  arch,
  getNpmGlobalBin,
  printPathHint,
  resolveCcsCommand,
};
