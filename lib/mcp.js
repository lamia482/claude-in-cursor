const fs = require('fs');
const path = require('path');
const { log } = require('./log');
const { runAllowFail } = require('./exec');
const { askQuestion } = require('./prompt');
const { secureWriteFile } = require('./secure-fs');
const {
  getAgentsSkillsStorageDir,
  getAgentsMcpPath,
  getSettingsPath,
  ensureClaudeDir,
} = require('./paths');
const {
  ensureMcpLayout,
  readMcpConfigFile,
  writeAgentsMcpConfig,
  ensureAgentsMcpFile,
} = require('./agents-layout');

const ACADEMIC_SEARCH_SERVER = 'academic-search';
const NATURE_SKILLS_NAME = 'nature-skills';

function getNatureSkillsDir() {
  return path.join(getAgentsSkillsStorageDir(), NATURE_SKILLS_NAME);
}

function getAcademicSearchServerPath() {
  return path.join(
    getNatureSkillsDir(),
    'skills',
    'nature-academic-search',
    'mcp-server',
    'academic_search_server.py',
  );
}

function getAcademicSearchRequirementsPath() {
  return path.join(
    getNatureSkillsDir(),
    'skills',
    'nature-academic-search',
    'mcp-server',
    'requirements.txt',
  );
}

function loadMcpConfig() {
  ensureAgentsMcpFile();
  return readMcpConfigFile(getAgentsMcpPath()) || { mcpServers: {} };
}

function saveMcpConfig(cfg) {
  writeAgentsMcpConfig(cfg);
}

function mergeMcpServer(name, entry) {
  const cfg = loadMcpConfig();
  cfg.mcpServers = cfg.mcpServers || {};
  cfg.mcpServers[name] = entry;
  saveMcpConfig(cfg);
  return cfg;
}

function removeMcpServer(name) {
  const cfg = loadMcpConfig();
  if (!cfg.mcpServers?.[name]) return false;
  delete cfg.mcpServers[name];
  saveMcpConfig(cfg);
  return true;
}

function installPythonDeps(requirementsPath) {
  if (!fs.existsSync(requirementsPath)) {
    log(`⚠️ 未找到 Python 依赖文件: ${requirementsPath}`, 'yellow');
    return false;
  }

  log('安装 nature-academic-search Python 依赖...', 'blue');
  const pipFlags = '--user';
  if (runAllowFail(`pip3 install ${pipFlags} -r "${requirementsPath}"`, { stdio: 'inherit' })) {
    log('✓ Python 依赖已安装', 'green');
    return true;
  }

  if (runAllowFail(`pip install ${pipFlags} -r "${requirementsPath}"`, { stdio: 'inherit' })) {
    log('✓ Python 依赖已安装 (pip)', 'green');
    return true;
  }

  log('⚠️ Python 依赖安装失败，请手动执行: pip3 install -r ...', 'yellow');
  return false;
}

async function resolvePubmedEmail(config, { interactive = true } = {}) {
  if (process.env.PUBMED_EMAIL?.trim()) {
    return process.env.PUBMED_EMAIL.trim();
  }
  if (config.pubmedEmail?.trim()) {
    return config.pubmedEmail.trim();
  }
  if (interactive && process.stdin.isTTY) {
    const answer = (await askQuestion('PubMed 联系邮箱 (PUBMED_EMAIL，回车跳过): ')).trim();
    if (answer) return answer;
  }
  log('⚠️ 未设置 PUBMED_EMAIL，使用占位邮箱 user@example.com', 'yellow');
  return 'user@example.com';
}

function buildAcademicSearchEntry(serverPath, pubmedEmail) {
  const env = { PUBMED_EMAIL: pubmedEmail };
  if (process.env.NCBI_API_KEY?.trim()) {
    env.NCBI_API_KEY = process.env.NCBI_API_KEY.trim();
  }

  return {
    command: 'python3',
    args: [serverPath],
    env,
  };
}

function enableClaudeMcpServer(serverName) {
  ensureClaudeDir();
  const settingsPath = getSettingsPath();
  let settings = {};

  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch {
      log(`⚠️ 无法解析 ${settingsPath}，跳过 enabledMcpjsonServers`, 'yellow');
      return false;
    }
  }

  const enabled = settings.enabledMcpjsonServers || [];
  if (enabled.includes(serverName)) {
    return true;
  }

  settings.enabledMcpjsonServers = [...enabled, serverName];
  secureWriteFile(settingsPath, JSON.stringify(settings, null, 2));
  log(`✓ 已在 settings.json 启用 MCP: ${serverName}`, 'green');
  return true;
}

function disableClaudeMcpServer(serverName) {
  const settingsPath = getSettingsPath();
  if (!fs.existsSync(settingsPath)) return false;

  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch {
    return false;
  }

  const enabled = settings.enabledMcpjsonServers;
  if (!Array.isArray(enabled) || !enabled.includes(serverName)) {
    return false;
  }

  settings.enabledMcpjsonServers = enabled.filter(name => name !== serverName);
  secureWriteFile(settingsPath, JSON.stringify(settings, null, 2));
  log(`✓ 已从 settings.json 移除 MCP: ${serverName}`, 'green');
  return true;
}

async function configureNatureMcp(config, { interactive = true } = {}) {
  if (config.natureMcp === false) {
    log('跳过 nature MCP 配置 (natureMcp=false)', 'blue');
    return { skipped: true };
  }

  ensureMcpLayout();

  const natureDir = getNatureSkillsDir();
  const serverPath = getAcademicSearchServerPath();
  const requirementsPath = getAcademicSearchRequirementsPath();

  if (!fs.existsSync(serverPath)) {
    log(`⚠️ nature-skills 未安装或缺少 MCP server: ${serverPath}`, 'yellow');
    log('  请先运行 node update.js --skills-only 同步 nature-skills', 'yellow');
    return { skipped: true, reason: 'missing-nature-skills' };
  }

  installPythonDeps(requirementsPath);

  const pubmedEmail = await resolvePubmedEmail(config, { interactive });
  const entry = buildAcademicSearchEntry(path.resolve(serverPath), pubmedEmail);
  mergeMcpServer(ACADEMIC_SEARCH_SERVER, entry);
  enableClaudeMcpServer(ACADEMIC_SEARCH_SERVER);

  log(`✓ academic-search MCP 已写入 ~/.agents/mcp.json`, 'green');
  return { skipped: false, serverPath: path.resolve(serverPath) };
}

function purgeAcademicSearchMcp() {
  const removed = removeMcpServer(ACADEMIC_SEARCH_SERVER);
  disableClaudeMcpServer(ACADEMIC_SEARCH_SERVER);
  if (removed) {
    log('✓ 已从 ~/.agents/mcp.json 移除 academic-search', 'green');
  } else {
    log('⚠️ ~/.agents/mcp.json 中无 academic-search 条目', 'yellow');
  }
  return removed;
}

function verifyNatureMcp() {
  const checks = {
    natureSkills: false,
    mcpEntry: false,
    serverScript: false,
  };

  const readerSkill = path.join(getNatureSkillsDir(), 'skills', 'nature-reader', 'SKILL.md');
  checks.natureSkills = fs.existsSync(readerSkill);

  const serverPath = getAcademicSearchServerPath();
  checks.serverScript = fs.existsSync(serverPath);

  const cfg = loadMcpConfig();
  checks.mcpEntry = Boolean(cfg.mcpServers?.[ACADEMIC_SEARCH_SERVER]);

  return checks;
}

module.exports = {
  ACADEMIC_SEARCH_SERVER,
  getNatureSkillsDir,
  getAcademicSearchServerPath,
  loadMcpConfig,
  saveMcpConfig,
  mergeMcpServer,
  removeMcpServer,
  configureNatureMcp,
  purgeAcademicSearchMcp,
  verifyNatureMcp,
  enableClaudeMcpServer,
  disableClaudeMcpServer,
};
