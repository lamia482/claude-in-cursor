const fs = require('fs');
const { log } = require('./log');
const { runQuiet } = require('./exec');
const { getSettingsPath } = require('./paths');
const { probeHealth } = require('./proxy-lifecycle');
const { resolveProxyConfig } = require('./proxy-config');
const claude = require('./claude');
const ccswitch = require('./ccswitch');
const skills = require('./skills');
const { verifyMcpLinks } = require('./agents-layout');
const { verifyNatureMcp } = require('./mcp');
const { verifyRulesLinks } = require('./rules-layout');
const { getProjectRoot } = require('./paths');

async function verifySetup(config) {
  log('\n🔍 验证安装...', 'blue');
  const claudeVersion = claude.getVersion();
  const ccsVersion = ccswitch.getVersion();

  if (claudeVersion) log(`✓ claude ${claudeVersion}`, 'green');
  else log('✗ claude 命令不可用', 'red');

  if (ccsVersion) log(`✓ cc-switch ${ccsVersion}`, 'green');
  else log('✗ cc-switch 命令不可用', 'red');

  const manifest = skills.loadSkillManifest();
  if (manifest.length > 0) {
    const { total, installed } = skills.countInstalledSkills(manifest);
    if (installed === total) {
      log(`✓ skills ${installed}/${total} 已就绪 (~/.agents/skills)`, 'green');
    } else {
      log(`⚠️ skills ${installed}/${total} 已就绪，运行 node update.js 同步缺失项`, 'yellow');
    }
  }

  const rulesLinks = verifyRulesLinks(getProjectRoot());
  if (rulesLinks.ok) {
    log('✓ Rules 软链接已就绪 (~/.agents/rules)', 'green');
  } else {
    for (const link of rulesLinks.links) {
      if (link.ok) continue;
      log(`⚠️ ${link.label} 未链接到 ~/.agents/rules，运行 node setup.js 或 node update.js 修复`, 'yellow');
    }
  }

  const mcpLinks = verifyMcpLinks();
  if (mcpLinks.ok) {
    log('✓ MCP 配置软链接已就绪 (~/.agents/mcp.json)', 'green');
  } else {
    for (const link of mcpLinks.links) {
      if (link.ok) continue;
      log(`⚠️ ${link.label} 未链接到 ~/.agents/mcp.json，运行 node update.js 修复`, 'yellow');
    }
  }

  if (config.natureMcp !== false) {
    const nature = verifyNatureMcp();
    if (nature.natureSkills) {
      log('✓ nature-skills 已安装', 'green');
    }
    if (nature.mcpEntry && nature.serverScript) {
      log('✓ academic-search MCP 已配置', 'green');
    } else if (nature.natureSkills) {
      log('⚠️ academic-search MCP 未完整配置，运行 node update.js --skills-only', 'yellow');
    }
  }

  const settingsPath = getSettingsPath();
  if (fs.existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      if (settings.env?.ANTHROPIC_BASE_URL) {
        const label = config.profileName || config.provider || 'Provider';
        log(`✓ ${label} 配置已就绪 (${settings.env.ANTHROPIC_BASE_URL})`, 'green');
      }

      const proxyConfig = resolveProxyConfig(config);
      if (proxyConfig.enabled) {
        const healthy = await probeHealth(proxyConfig.baseUrl);
        if (healthy) {
          log(`✓ cc-switch 兼容代理运行中 (${proxyConfig.baseUrl})`, 'green');
        } else {
          log('⚠️ cc-switch 兼容代理未运行，请执行: node change.js deepseek', 'yellow');
        }
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
