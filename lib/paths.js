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

function getAgentsSkillsDir() {
  return path.join(os.homedir(), '.agents', 'skills');
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

module.exports = {
  getProjectRoot,
  getClaudeDir,
  getSettingsPath,
  getProfilesDir,
  getProfilePath,
  getBackupsDir,
  getAgentsSkillsDir,
  getAgentsSkillsStorageDir,
  getSkillLinkDirs,
  getSkillsDir,
  getSkillManifestPath,
  ensureClaudeDir,
  ensureProfilesDir,
  ensureAgentsSkillsDir,
  ensureSkillsDir,
};
