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

function getSkillsDir() {
  return path.join(getClaudeDir(), 'skills');
}

function getSkillManifestPath() {
  return path.join(getProjectRoot(), 'skill.yaml');
}

function ensureSkillsDir() {
  const skillsDir = getSkillsDir();
  if (!fs.existsSync(skillsDir)) fs.mkdirSync(skillsDir, { recursive: true });
  return skillsDir;
}

module.exports = {
  getProjectRoot,
  getClaudeDir,
  getSettingsPath,
  getProfilesDir,
  getProfilePath,
  getBackupsDir,
  getSkillsDir,
  getSkillManifestPath,
  ensureClaudeDir,
  ensureProfilesDir,
  ensureSkillsDir,
};
