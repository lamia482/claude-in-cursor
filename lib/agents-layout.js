const fs = require('fs');
const path = require('path');
const { log } = require('./log');
const {
  ensureAgentsDir,
  getAgentsMcpPath,
  getMcpLinkPaths,
  getClaudeDir,
} = require('./paths');

const MCP_LINK_LABELS = {
  claude: '~/.claude/.mcp.json',
  cursor: '~/.cursor/mcp.json',
  codex: '~/.codex/mcp.json',
};

const EMPTY_MCP_CONFIG = { mcpServers: {} };

function getMcpLinkLabel(linkPath) {
  if (linkPath.includes(`${path.sep}.claude${path.sep}`)) return MCP_LINK_LABELS.claude;
  if (linkPath.includes(`${path.sep}.cursor${path.sep}`)) return MCP_LINK_LABELS.cursor;
  if (linkPath.includes(`${path.sep}.codex${path.sep}`)) return MCP_LINK_LABELS.codex;
  return linkPath;
}

function resolveSymlinkTarget(linkPath) {
  try {
    const target = fs.readlinkSync(linkPath);
    return path.resolve(path.dirname(linkPath), target);
  } catch {
    return null;
  }
}

function resolveRealPath(targetPath) {
  try {
    return fs.realpathSync(targetPath);
  } catch {
    return null;
  }
}

function isSymlinkToAgentsMcp(linkPath) {
  if (!fs.existsSync(linkPath) || !fs.lstatSync(linkPath).isSymbolicLink()) {
    return false;
  }
  const agentsMcp = path.resolve(getAgentsMcpPath());
  const target = resolveSymlinkTarget(linkPath);
  return Boolean(target && path.resolve(target) === agentsMcp);
}

function readMcpConfigFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!data || typeof data !== 'object') return null;
    if (!data.mcpServers || typeof data.mcpServers !== 'object') {
      return { mcpServers: {} };
    }
    return data;
  } catch {
    log(`⚠️ 无法解析 MCP 配置: ${filePath}`, 'yellow');
    return null;
  }
}

function mergeMcpConfigs(base, incoming) {
  const merged = {
    mcpServers: { ...(base?.mcpServers || {}) },
  };
  for (const [name, entry] of Object.entries(incoming?.mcpServers || {})) {
    merged.mcpServers[name] = entry;
  }
  return merged;
}

function writeAgentsMcpConfig(cfg) {
  const agentsMcp = getAgentsMcpPath();
  ensureAgentsDir();
  fs.writeFileSync(agentsMcp, `${JSON.stringify(cfg, null, 2)}\n`, 'utf8');
}

function ensureAgentsMcpFile() {
  ensureAgentsDir();
  const agentsMcp = getAgentsMcpPath();
  if (!fs.existsSync(agentsMcp)) {
    writeAgentsMcpConfig({ ...EMPTY_MCP_CONFIG });
    return { ...EMPTY_MCP_CONFIG };
  }

  const existing = readMcpConfigFile(agentsMcp);
  if (!existing) {
    writeAgentsMcpConfig({ ...EMPTY_MCP_CONFIG });
    return { ...EMPTY_MCP_CONFIG };
  }
  return existing;
}

function ensureParentDir(filePath) {
  const parent = path.dirname(filePath);
  if (!fs.existsSync(parent)) {
    fs.mkdirSync(parent, { recursive: true });
  }
}

function migrateLegacyMcpConfig(linkPath) {
  if (!fs.existsSync(linkPath)) return false;

  const stat = fs.lstatSync(linkPath);
  if (stat.isSymbolicLink()) return false;

  const legacy = readMcpConfigFile(linkPath);
  if (!legacy) return false;

  const agentsCfg = ensureAgentsMcpFile();
  const merged = mergeMcpConfigs(agentsCfg, legacy);
  writeAgentsMcpConfig(merged);
  log(
    `合并 ${getMcpLinkLabel(linkPath)} → ~/.agents/mcp.json (${Object.keys(legacy.mcpServers).length} 个 server)`,
    'yellow',
  );
  fs.rmSync(linkPath, { force: true });
  return true;
}

function symlinkFile(source, linkPath) {
  ensureParentDir(linkPath);
  const relative = path.relative(path.dirname(linkPath), source);
  fs.symlinkSync(relative, linkPath, 'file');
}

function ensureMcpLink(linkPath) {
  const agentsMcp = getAgentsMcpPath();
  ensureAgentsMcpFile();

  if (isSymlinkToAgentsMcp(linkPath)) {
    return { linked: false, label: getMcpLinkLabel(linkPath) };
  }

  if (fs.existsSync(linkPath)) {
    migrateLegacyMcpConfig(linkPath);
  }

  if (fs.existsSync(linkPath)) {
    log(`MCP 配置与 ~/.agents/mcp.json 不一致，替换为软链接: ${getMcpLinkLabel(linkPath)}`, 'yellow');
    fs.rmSync(linkPath, { force: true });
  }

  symlinkFile(agentsMcp, linkPath);
  log(`创建 MCP 软链接: ${getMcpLinkLabel(linkPath)} → ~/.agents/mcp.json`, 'blue');
  return { linked: true, label: getMcpLinkLabel(linkPath) };
}

function syncAllMcpLinks() {
  const results = [];
  for (const linkPath of getMcpLinkPaths()) {
    results.push(ensureMcpLink(linkPath));
  }
  return results;
}

function ensureMcpLayout() {
  ensureAgentsDir();
  ensureClaudeDirExists();
  ensureAgentsMcpFile();
  return syncAllMcpLinks();
}

function ensureClaudeDirExists() {
  const claudeDir = getClaudeDir();
  if (!fs.existsSync(claudeDir)) {
    fs.mkdirSync(claudeDir, { recursive: true });
  }
}

function verifyMcpLinks() {
  const agentsMcp = resolveRealPath(getAgentsMcpPath());
  if (!agentsMcp) return { ok: false, links: [] };

  const links = [];
  let allOk = true;

  for (const linkPath of getMcpLinkPaths()) {
    const label = getMcpLinkLabel(linkPath);
    if (!fs.existsSync(linkPath)) {
      links.push({ label, ok: false, reason: 'missing' });
      allOk = false;
      continue;
    }

    const real = resolveRealPath(linkPath);
    if (real && real === agentsMcp) {
      links.push({ label, ok: true });
    } else {
      links.push({ label, ok: false, reason: 'not-linked' });
      allOk = false;
    }
  }

  return { ok: allOk, links };
}

module.exports = {
  EMPTY_MCP_CONFIG,
  readMcpConfigFile,
  mergeMcpConfigs,
  writeAgentsMcpConfig,
  ensureAgentsMcpFile,
  ensureMcpLayout,
  syncAllMcpLinks,
  verifyMcpLinks,
  isSymlinkToAgentsMcp,
};
