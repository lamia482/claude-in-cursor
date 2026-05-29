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

module.exports = {
  getProjectRoot,
  getClaudeDir,
  getSettingsPath,
  getProfilesDir,
  getProfilePath,
  getBackupsDir,
  ensureClaudeDir,
  ensureProfilesDir,
};
