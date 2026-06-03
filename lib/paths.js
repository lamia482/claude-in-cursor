const fs = require('fs');
const os = require('os');
const path = require('path');

function getProjectRoot() {
  return path.join(__dirname, '..');
}

function getClaudeDir() {
  return path.join(os.homedir(), '.claude');
}

function getSettingsPath() {
  return path.join(getClaudeDir(), 'settings.json');
}

function getProfilesDir() {
  return path.join(getClaudeDir(), 'profiles');
}

function getProfilePath(profileId) {
  return path.join(getProfilesDir(), `${profileId}.json`);
}

function getBackupsDir() {
  return path.join(getClaudeDir(), 'cc-switch-backups');
}

function ensureClaudeDir() {
  const claudeDir = getClaudeDir();
  if (!fs.existsSync(claudeDir)) fs.mkdirSync(claudeDir, { recursive: true });
  return claudeDir;
}

function ensureProfilesDir() {
  const profilesDir = getProfilesDir();
  if (!fs.existsSync(profilesDir)) fs.mkdirSync(profilesDir, { recursive: true });
  return profilesDir;
}

function getAgentsDir() {
  return path.join(os.homedir(), '.agents');
}

function getAgentsSkillsDir() {
  return path.join(getAgentsDir(), 'skills');
}

function getAgentsSkillsStorageDir() {
  const agentsDir = getAgentsSkillsDir();
  if (!fs.existsSync(agentsDir)) {
    fs.mkdirSync(agentsDir, { recursive: true });
    return agentsDir;
  }
  const stat = fs.lstatSync(agentsDir);
  if (stat.isSymbolicLink()) {
    return fs.realpathSync(agentsDir);
  }
  return agentsDir;
}

function getSkillLinkDirs() {
  return [
    path.join(os.homedir(), '.claude', 'skills'),
    path.join(os.homedir(), '.cursor', 'skills'),
    path.join(os.homedir(), '.codex', 'skills'),
  ];
}

function getSkillsDir() {
  return getAgentsSkillsStorageDir();
}

function getSkillManifestPath() {
  return path.join(getProjectRoot(), 'skill.yaml');
}

function getAgentsMcpPath() {
  return path.join(getAgentsDir(), 'mcp.json');
}

function getMcpLinkPaths() {
  return [
    path.join(os.homedir(), '.claude', '.mcp.json'),
    path.join(os.homedir(), '.cursor', 'mcp.json'),
    path.join(os.homedir(), '.codex', 'mcp.json'),
  ];
}

function ensureAgentsDir() {
  const agentsDir = getAgentsDir();
  if (!fs.existsSync(agentsDir)) {
    fs.mkdirSync(agentsDir, { recursive: true });
  }
  return agentsDir;
}

function ensureAgentsSkillsDir() {
  const agentsDir = getAgentsSkillsDir();
  if (!fs.existsSync(agentsDir)) {
    fs.mkdirSync(agentsDir, { recursive: true });
  }
  return getAgentsSkillsStorageDir();
}

function ensureSkillsDir() {
  return ensureAgentsSkillsDir();
}

function getAgentsRulesDir() {
  return path.join(getAgentsDir(), 'rules');
}

function getAgentsGlobalDocPath() {
  return path.join(getAgentsDir(), 'AGENTS.global.md');
}

function getRulesSeedDir() {
  return path.join(__dirname, 'rules-seed');
}

function getGlobalRulesDirLinkPath() {
  return path.join(getClaudeDir(), 'rules');
}

function getGlobalRulesFileLinkTargets() {
  return [
    {
      linkPath: path.join(getClaudeDir(), 'CLAUDE.md'),
      label: '~/.claude/CLAUDE.md',
    },
    {
      linkPath: path.join(os.homedir(), '.codex', 'AGENTS.md'),
      label: '~/.codex/AGENTS.md',
    },
  ];
}

function getProjectRuleLinkNames() {
  return ['document-skills.mdc', 'pathology-ml.mdc'];
}

function ensureAgentsRulesDir() {
  ensureAgentsDir();
  const rulesDir = getAgentsRulesDir();
  if (!fs.existsSync(rulesDir)) {
    fs.mkdirSync(rulesDir, { recursive: true });
  }
  return rulesDir;
}

module.exports = {
  getProjectRoot,
  getClaudeDir,
  getSettingsPath,
  getProfilesDir,
  getProfilePath,
  getBackupsDir,
  getAgentsDir,
  getAgentsSkillsDir,
  getAgentsSkillsStorageDir,
  getSkillLinkDirs,
  getSkillsDir,
  getSkillManifestPath,
  getAgentsMcpPath,
  getMcpLinkPaths,
  ensureClaudeDir,
  ensureProfilesDir,
  ensureAgentsSkillsDir,
  ensureAgentsDir,
  ensureSkillsDir,
  getAgentsRulesDir,
  getAgentsGlobalDocPath,
  getRulesSeedDir,
  getGlobalRulesDirLinkPath,
  getGlobalRulesFileLinkTargets,
  getProjectRuleLinkNames,
  ensureAgentsRulesDir,
};
