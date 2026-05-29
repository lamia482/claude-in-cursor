const fs = require('fs');
const { log } = require('./log');

function secureWriteFile(filePath, content) {
  fs.writeFileSync(filePath, content);
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    log(`⚠️ 无法将 ${filePath} 权限设为 600，请手动检查文件权限`, 'yellow');
  }
}

module.exports = { secureWriteFile };
