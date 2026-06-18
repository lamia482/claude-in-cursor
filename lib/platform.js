const os = require('os');
const fs = require('fs');
const path = require('path');
const { runQuiet } = require('./exec');

const platform = os.platform();
const arch = os.arch();

function getNpmGlobalBin() {
  const prefix = runQuiet('npm prefix -g');
  if (!prefix) return null;
  return platform === 'win32' ? prefix : path.join(prefix, 'bin');
}

function getUserNpmGlobalBin() {
  const prefix = path.join(os.homedir(), '.npm-global');
  return platform === 'win32' ? prefix : path.join(prefix, 'bin');
}

function getNvmGlobalBins() {
  if (platform === 'win32') return [];

  const nvmDir = process.env.NVM_DIR || path.join(os.homedir(), '.nvm');
  const nodeVersionsDir = path.join(nvmDir, 'versions', 'node');
  if (!fs.existsSync(nodeVersionsDir)) return [];

  try {
    return fs.readdirSync(nodeVersionsDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => path.join(nodeVersionsDir, entry.name, 'bin'))
      .filter(binDir => fs.existsSync(binDir));
  } catch {
    return [];
  }
}

function getCandidateGlobalBins() {
  return [...new Set([
    getNpmGlobalBin(),
    getUserNpmGlobalBin(),
    ...getNvmGlobalBins(),
  ].filter(Boolean))];
}

function printPathHint(commandName) {
  const binDirs = getCandidateGlobalBins();
  if (platform === 'win32') {
    logHint('Windows 通常为: %APPDATA%\\npm');
    return;
  }
  if (binDirs.length > 0) {
    const joined = binDirs.join(':');
    logHint(`请将 ${joined} 加入 PATH，或执行: export PATH="${joined}:$PATH"`);
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
  for (const binDir of getCandidateGlobalBins()) {
    for (const command of ['ccs', 'cc-switch']) {
      const fullPath = path.join(binDir, command);
      if (fs.existsSync(fullPath)) return fullPath;
      if (platform === 'win32' && fs.existsSync(`${fullPath}.cmd`)) return `${fullPath}.cmd`;
    }
  }
  return null;
}

module.exports = {
  platform,
  arch,
  getNpmGlobalBin,
  getUserNpmGlobalBin,
  getNvmGlobalBins,
  getCandidateGlobalBins,
  printPathHint,
  resolveCcsCommand,
};
