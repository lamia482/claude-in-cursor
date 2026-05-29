const fs = require('fs');
const { log } = require('./log');
const { runQuiet } = require('./exec');
const { getSettingsPath } = require('./paths');
const claude = require('./claude');
const ccswitch = require('./ccswitch');

function verifySetup(config) {
  log('\n🔍 验证安装...', 'blue');
  const claudeVersion = claude.getVersion();
  const ccsVersion = ccswitch.getVersion();

  if (claudeVersion) log(`✓ claude ${claudeVersion}`, 'green');
  else log('✗ claude 命令不可用', 'red');

  if (ccsVersion) log(`✓ cc-switch ${ccsVersion}`, 'green');
  else log('✗ cc-switch 命令不可用', 'red');

  const settingsPath = getSettingsPath();
  if (fs.existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      if (settings.env?.ANTHROPIC_BASE_URL) {
        const label = config.profileName || config.provider || 'Provider';
        log(`✓ ${label} 配置已就绪 (${settings.env.ANTHROPIC_BASE_URL})`, 'green');
      }
      if (settings.env?.ANTHROPIC_API_KEY) {
        log('⚠️ settings.json 仍含 ANTHROPIC_API_KEY，建议运行 update.js 刷新配置', 'yellow');
      }
    } catch {
      log('⚠️ settings.json 存在但无法解析', 'yellow');
    }
  }
}

module.exports = { verifySetup };
