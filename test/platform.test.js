const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

function loadPlatformFresh() {
  const modulePath = require.resolve('../lib/platform');
  delete require.cache[modulePath];
  return require('../lib/platform');
}

test('getCandidateGlobalBins includes nvm node version bins', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-in-cursor-nvm-'));
  const previousNvmDir = process.env.NVM_DIR;
  const nvmDir = path.join(tmpDir, '.nvm');
  const nodeBin = path.join(nvmDir, 'versions', 'node', 'v24.14.0', 'bin');

  fs.mkdirSync(nodeBin, { recursive: true });

  try {
    process.env.NVM_DIR = nvmDir;
    const { getCandidateGlobalBins } = loadPlatformFresh();

    assert.ok(getCandidateGlobalBins().includes(nodeBin));
  } finally {
    if (previousNvmDir === undefined) delete process.env.NVM_DIR;
    else process.env.NVM_DIR = previousNvmDir;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
