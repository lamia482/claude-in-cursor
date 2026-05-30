const fs = require('fs');
const os = require('os');
const path = require('path');
const { log } = require('./log');
const { runQuiet, runAllowFail, isCommandAvailable } = require('./exec');
const {
  getAgentsSkillsDir,
  getSkillLinkDirs,
  getSkillManifestPath,
} = require('./paths');

const DEFAULT_BRANCH = 'main';
const LINK_DIR_LABELS = {
  claude: '~/.claude/skills',
  cursor: '~/.cursor/skills',
  codex: '~/.codex/skills',
};

function parseSkillManifest(text) {
  const skills = [];
  let current = null;
  let inSkills = false;

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed === 'skills:') {
      inSkills = true;
      continue;
    }
    if (!inSkills) continue;

    if (trimmed.startsWith('- name:')) {
      if (current) skills.push(current);
      current = { name: trimmed.slice('- name:'.length).trim(), branch: DEFAULT_BRANCH };
      continue;
    }
    if (!current) continue;

    if (trimmed.startsWith('url:')) {
      current.url = trimmed.slice('url:'.length).trim();
    } else if (trimmed.startsWith('ssh_url:')) {
      current.ssh_url = trimmed.slice('ssh_url:'.length).trim();
    } else if (trimmed.startsWith('branch:')) {
      current.branch = trimmed.slice('branch:'.length).trim();
    }
  }

  if (current) skills.push(current);
  return skills.filter(skill => skill.name && skill.url);
}

function serializeSkillManifest(skills) {
  const lines = ['skills:'];
  for (const skill of skills) {
    lines.push(`  - name: ${skill.name}`);
    lines.push(`    url: ${skill.url}`);
    if (skill.ssh_url) lines.push(`    ssh_url: ${skill.ssh_url}`);
    if (skill.branch && skill.branch !== DEFAULT_BRANCH) {
      lines.push(`    branch: ${skill.branch}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

function loadSkillManifest() {
  const manifestPath = getSkillManifestPath();
  if (!fs.existsSync(manifestPath)) return [];
  try {
    return parseSkillManifest(fs.readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    log(`skill.yaml 解析失败: ${e.message}`, 'red');
    process.exit(1);
  }
}

function writeSkillManifest(skills) {
  fs.writeFileSync(getSkillManifestPath(), serializeSkillManifest(skills), 'utf8');
}

function httpsToSsh(url) {
  const match = url.match(/^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?\/?$/);
  if (!match) return null;
  return `git@github.com:${match[1]}/${match[2].replace(/\.git$/, '')}.git`;
}

function sshToHttps(url) {
  const match = url.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
  if (!match) return null;
  return `https://github.com/${match[1]}/${match[2].replace(/\.git$/, '')}.git`;
}

function normalizeToHttps(url) {
  if (!url) return null;
  if (url.startsWith('https://')) return url.endsWith('.git') ? url : `${url}.git`;
  if (url.startsWith('git@')) {
    const https = sshToHttps(url);
    return https || url;
  }
  return url;
}

function getLinkDirLabel(linkDir) {
  if (linkDir.includes(`${path.sep}.claude${path.sep}`)) return LINK_DIR_LABELS.claude;
  if (linkDir.includes(`${path.sep}.cursor${path.sep}`)) return LINK_DIR_LABELS.cursor;
  if (linkDir.includes(`${path.sep}.codex${path.sep}`)) return LINK_DIR_LABELS.codex;
  return linkDir;
}

function ensureLinkDir(linkDir) {
  if (!fs.existsSync(linkDir)) fs.mkdirSync(linkDir, { recursive: true });
}

function materializeAgentsSkillsDir() {
  const agentsDir = getAgentsSkillsDir();
  if (!fs.existsSync(agentsDir)) {
    fs.mkdirSync(agentsDir, { recursive: true });
    return agentsDir;
  }

  const stat = fs.lstatSync(agentsDir);
  if (!stat.isSymbolicLink()) {
    return agentsDir;
  }

  const legacyStorage = fs.realpathSync(agentsDir);
  log(`将 ~/.agents/skills 设为实际目录（原 symlink → ${legacyStorage}）`, 'yellow');
  fs.unlinkSync(agentsDir);
  fs.mkdirSync(agentsDir, { recursive: true });

  for (const entry of fs.readdirSync(legacyStorage, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const src = path.join(legacyStorage, entry.name);
    const dest = path.join(agentsDir, entry.name);
    if (fs.existsSync(dest)) continue;
    if (fs.lstatSync(src).isSymbolicLink()) continue;
    fs.renameSync(src, dest);
  }

  return agentsDir;
}

function ensureSkillLinkParentDir(linkDir) {
  const agentsDir = path.resolve(getAgentsSkillsDir());
  const label = getLinkDirLabel(linkDir);

  if (path.resolve(linkDir) === agentsDir) return;

  if (!fs.existsSync(linkDir)) {
    fs.mkdirSync(linkDir, { recursive: true });
    return;
  }

  if (fs.lstatSync(linkDir).isSymbolicLink()) {
    const target = fs.realpathSync(linkDir);
    log(`将 ${label} 设为实际目录（原 symlink → ${target}）`, 'yellow');
    fs.unlinkSync(linkDir);
    fs.mkdirSync(linkDir, { recursive: true });
  }
}

function ensureSkillsLayout() {
  materializeAgentsSkillsDir();
  for (const linkDir of getSkillLinkDirs()) {
    ensureSkillLinkParentDir(linkDir);
  }
}

function resolveRealPath(targetPath) {
  try {
    return fs.realpathSync(targetPath);
  } catch {
    return null;
  }
}

function symlinkType() {
  return os.platform() === 'win32' ? 'junction' : 'dir';
}

function syncSkillLink(skillName) {
  const agentsDir = path.resolve(getAgentsSkillsDir());
  const source = path.join(agentsDir, skillName);
  if (!fs.existsSync(source)) return { linked: [], skipped: [] };

  const sourceReal = resolveRealPath(source);
  const sourceRemote = runQuiet(`git -C "${source}" remote get-url origin`);
  const linked = [];
  const skipped = [];

  for (const linkDir of getSkillLinkDirs()) {
    if (path.resolve(linkDir) === agentsDir) continue;

    const label = getLinkDirLabel(linkDir);
    ensureLinkDir(linkDir);
    const linkPath = path.join(linkDir, skillName);

    if (fs.existsSync(linkPath)) {
      const stat = fs.lstatSync(linkPath);
      if (stat.isSymbolicLink()) {
        const currentReal = resolveRealPath(linkPath);
        if (currentReal && sourceReal && currentReal === sourceReal) {
          linked.push(label);
          continue;
        }
        fs.rmSync(linkPath, { force: true });
      } else if (stat.isDirectory()) {
        const legacyRemote = runQuiet(`git -C "${linkPath}" remote get-url origin`);
        const sameRemote = legacyRemote && sourceRemote
          && normalizeToHttps(legacyRemote) === normalizeToHttps(sourceRemote);
        if (sameRemote) {
          log(`替换 legacy 目录为软链接: ${label}/${skillName}`, 'yellow');
          fs.rmSync(linkPath, { recursive: true, force: true });
        } else {
          log(`⚠️ 跳过链接 ${label}/${skillName}：已存在非 symlink 目录`, 'yellow');
          skipped.push(label);
          continue;
        }
      } else {
        log(`⚠️ 跳过链接 ${label}/${skillName}：路径已存在`, 'yellow');
        skipped.push(label);
        continue;
      }
    }

    if (fs.existsSync(linkPath)) {
      fs.rmSync(linkPath, { recursive: true, force: true });
    }
    fs.symlinkSync(source, linkPath, symlinkType());
    linked.push(label);
  }

  return { linked, skipped };
}

function syncAllSkillLinks(manifest) {
  for (const skill of manifest) {
    syncSkillLink(skill.name);
  }
}

function syncAllAgentsSkillLinks() {
  const agentsDir = getAgentsSkillsDir();
  if (!fs.existsSync(agentsDir)) return;

  for (const entry of fs.readdirSync(agentsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    syncSkillLink(entry.name);
  }
}

function getSkillDest(skillName) {
  return path.join(getAgentsSkillsDir(), skillName);
}

function cleanupBrokenSkillPath(skillName) {
  const dest = getSkillDest(skillName);
  try {
    fs.lstatSync(dest);
  } catch {
    return false;
  }

  try {
    fs.realpathSync(dest);
    return false;
  } catch {
    log(`移除损坏的 skill symlink: ${skillName}`, 'yellow');
    fs.rmSync(dest, { force: true });
    return true;
  }
}

function migrateLegacySkillIfNeeded(skillName) {
  cleanupBrokenSkillPath(skillName);
  const agentsDest = getSkillDest(skillName);
  if (fs.existsSync(agentsDest)) return false;

  for (const linkDir of getSkillLinkDirs()) {
    const legacyPath = path.join(linkDir, skillName);
    if (!fs.existsSync(legacyPath)) continue;

    const stat = fs.lstatSync(legacyPath);
    if (stat.isSymbolicLink()) continue;

    const legacyReal = resolveRealPath(legacyPath);
    const agentsReal = resolveRealPath(getAgentsSkillsDir());
    if (legacyReal && agentsReal && legacyReal.startsWith(`${agentsReal}${path.sep}`)) continue;
    if (!fs.existsSync(path.join(legacyPath, '.git'))) continue;

    log(
      `迁移 ${getLinkDirLabel(linkDir)}/${skillName} → ~/.agents/skills/${skillName}`,
      'yellow',
    );
    fs.renameSync(legacyPath, agentsDest);
    return true;
  }

  return false;
}

function resolveUrls(skill) {
  const httpsUrl = normalizeToHttps(skill.url);
  const sshUrl = skill.ssh_url || httpsToSsh(httpsUrl) || null;
  const branch = skill.branch || DEFAULT_BRANCH;
  return { httpsUrl, sshUrl, branch };
}

function isHttpsRemote(url) {
  return url && url.startsWith('https://');
}

function gitClone(httpsUrl, sshUrl, branch, dest) {
  const branchArg = `-b ${branch}`;
  log(`  clone ${httpsUrl} → ${dest}`, 'blue');
  if (runAllowFail(`git clone --depth 1 ${branchArg} "${httpsUrl}" "${dest}"`, { stdio: 'inherit' })) {
    return { ok: true, via: 'https' };
  }

  if (!sshUrl) return { ok: false };

  log('  HTTPS clone 失败，尝试 SSH...', 'yellow');
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }
  log(`  clone ${sshUrl} → ${dest}`, 'blue');
  if (runAllowFail(`git clone --depth 1 ${branchArg} "${sshUrl}" "${dest}"`, { stdio: 'inherit' })) {
    return { ok: true, via: 'ssh' };
  }
  return { ok: false };
}

function getOriginRemote(dest) {
  return runQuiet(`git -C "${dest}" remote get-url origin`);
}

function gitSyncWithFallback(dest, sshUrl) {
  runAllowFail(`git -C "${dest}" fetch`, { stdio: 'inherit' });

  if (runAllowFail(`git -C "${dest}" pull --ff-only`, { stdio: 'inherit' })) {
    const remote = getOriginRemote(dest);
    return { ok: true, via: isHttpsRemote(remote) ? 'https' : 'ssh' };
  }

  const remote = getOriginRemote(dest);
  if (!remote || !sshUrl || !isHttpsRemote(remote)) {
    return { ok: false };
  }

  log('  HTTPS pull 失败，尝试切换 SSH remote...', 'yellow');
  runAllowFail(`git -C "${dest}" remote set-url origin "${sshUrl}"`, { stdio: 'pipe' });
  runAllowFail(`git -C "${dest}" fetch`, { stdio: 'inherit' });
  if (runAllowFail(`git -C "${dest}" pull --ff-only`, { stdio: 'inherit' })) {
    return { ok: true, via: 'ssh' };
  }
  return { ok: false };
}

function gitCloneWithFallback(skill, dest) {
  const { httpsUrl, sshUrl, branch } = resolveUrls(skill);
  const result = gitClone(httpsUrl, sshUrl, branch, dest);
  if (!result.ok) {
    log(`✗ skill "${skill.name}" clone 失败（HTTPS 与 SSH 均不可用）`, 'red');
    process.exit(1);
  }
  return result.via;
}

function requireGitForSkills() {
  if (!isCommandAvailable('git')) {
    log('✗ 安装 skills 需要 Git，请先安装 Git 后重试', 'red');
    process.exit(1);
  }
}

function discoverLocalSkills() {
  const discovered = new Map();
  const skipped = [];
  const scanDirs = [getAgentsSkillsDir()];

  for (const skillsDir of scanDirs) {
    if (!fs.existsSync(skillsDir)) continue;

    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      if (discovered.has(entry.name)) continue;

      const dest = path.join(skillsDir, entry.name);
      if (fs.existsSync(dest) && fs.lstatSync(dest).isSymbolicLink()) continue;

      const gitDir = path.join(dest, '.git');
      if (!fs.existsSync(gitDir)) {
        if (skillsDir === getAgentsSkillsDir()) {
          log(`⚠️ 跳过 ${entry.name}：非 git 仓库`, 'yellow');
          skipped.push({ name: entry.name, reason: 'no-git' });
        }
        continue;
      }

      const remote = runQuiet(`git -C "${dest}" remote get-url origin`);
      if (!remote) {
        if (skillsDir === getAgentsSkillsDir()) {
          log(`⚠️ 跳过 ${entry.name}：无 origin remote`, 'yellow');
          skipped.push({ name: entry.name, reason: 'no-remote' });
        }
        continue;
      }

      const branch = runQuiet(`git -C "${dest}" branch --show-current`) || DEFAULT_BRANCH;
      const httpsUrl = normalizeToHttps(remote);
      const skill = { name: entry.name, url: httpsUrl, branch };
      if (remote.startsWith('git@') && httpsUrl) {
        skill.ssh_url = remote.endsWith('.git') ? remote : `${remote}.git`;
      }
      discovered.set(entry.name, skill);
    }
  }

  return { skills: [...discovered.values()], skipped };
}

function mergeWithManifest(yamlSkills, localSkills) {
  const byName = new Map(yamlSkills.map(skill => [skill.name, { ...skill }]));
  const added = [];
  const unchanged = [];

  for (const local of localSkills) {
    if (byName.has(local.name)) {
      unchanged.push(local.name);
      continue;
    }
    byName.set(local.name, { ...local });
    added.push(local.name);
  }

  return {
    merged: [
      ...yamlSkills.map(skill => byName.get(skill.name)),
      ...added.map(name => byName.get(name)),
    ],
    added,
    unchanged,
  };
}

function syncLocalToManifest() {
  log('\n📂 扫描 ~/.agents/skills 并合并 skill.yaml...', 'blue');
  requireGitForSkills();
  ensureSkillsLayout();

  const { skills: localSkills, skipped } = discoverLocalSkills();
  const yamlSkills = loadSkillManifest();
  const { merged, added, unchanged } = mergeWithManifest(yamlSkills, localSkills);

  if (added.length > 0) {
    writeSkillManifest(merged);
    for (const name of added) {
      log(`✓ 已追加到 skill.yaml: ${name}`, 'green');
    }
  } else {
    log('skill.yaml 无需追加新条目', 'blue');
  }

  return { added, unchanged, skipped, merged };
}

function installOne(skill) {
  migrateLegacySkillIfNeeded(skill.name);
  cleanupBrokenSkillPath(skill.name);
  const dest = getSkillDest(skill.name);
  const { sshUrl } = resolveUrls(skill);

  let hasRepo = false;
  try {
    hasRepo = fs.existsSync(path.join(dest, '.git'));
  } catch {
    hasRepo = false;
  }

  if (hasRepo) {
    log(`\n🔄 skill "${skill.name}" 已存在，fetch/pull...`, 'blue');
    const syncResult = gitSyncWithFallback(dest, sshUrl);
    syncSkillLink(skill.name);
    if (syncResult.ok) {
      log(`✓ skill "${skill.name}" 已同步 (${syncResult.via})`, 'green');
      return {
        name: skill.name,
        action: syncResult.via === 'ssh' ? 'pulled-ssh' : 'pulled',
        via: syncResult.via,
      };
    }
    log(`⚠️ skill "${skill.name}" 同步失败，请手动处理`, 'yellow');
    return { name: skill.name, action: 'warn' };
  }

  if (fs.existsSync(dest)) {
    log(`⚠️ 跳过 ${skill.name}：目录存在但非 git 仓库`, 'yellow');
    syncSkillLink(skill.name);
    return { name: skill.name, action: 'warn' };
  }

  log(`\n📥 安装 skill: ${skill.name}`, 'blue');
  const via = gitCloneWithFallback(skill, dest);
  syncSkillLink(skill.name);
  log(`✓ skill "${skill.name}" 安装完成 (${via})`, 'green');
  return { name: skill.name, action: via === 'ssh' ? 'cloned-ssh' : 'cloned', via };
}

function install() {
  const manifest = loadSkillManifest();
  if (manifest.length === 0) return { skipped: true, results: [] };

  log('\n📦 安装 skills 到 ~/.agents/skills 并链接到 Claude/Cursor/Codex...', 'blue');
  requireGitForSkills();
  ensureSkillsLayout();

  const results = manifest.map(skill => installOne(skill));
  syncAllAgentsSkillLinks();
  return { skipped: false, results };
}

function upgradeOne(skill) {
  migrateLegacySkillIfNeeded(skill.name);
  cleanupBrokenSkillPath(skill.name);
  const dest = getSkillDest(skill.name);
  const { sshUrl } = resolveUrls(skill);

  let hasRepo = false;
  try {
    hasRepo = fs.existsSync(path.join(dest, '.git'));
  } catch {
    hasRepo = false;
  }

  if (!hasRepo) {
    if (fs.existsSync(dest)) {
      log(`⚠️ 跳过 ${skill.name}：目录存在但非 git 仓库`, 'yellow');
      syncSkillLink(skill.name);
      return { name: skill.name, action: 'warn' };
    }

    log(`\n📥 skill "${skill.name}" 不存在，开始 clone...`, 'blue');
    const via = gitCloneWithFallback(skill, dest);
    syncSkillLink(skill.name);
    return { name: skill.name, action: via === 'ssh' ? 'cloned-ssh' : 'cloned', via };
  }

  log(`\n🔄 更新 skill: ${skill.name}`, 'blue');
  const syncResult = gitSyncWithFallback(dest, sshUrl);
  syncSkillLink(skill.name);
  if (syncResult.ok) {
    log(`✓ skill "${skill.name}" 已更新 (${syncResult.via})`, 'green');
    return {
      name: skill.name,
      action: syncResult.via === 'ssh' ? 'pulled-ssh' : 'pulled',
      via: syncResult.via,
    };
  }

  log(`⚠️ skill "${skill.name}" 更新失败，请手动处理（可能有本地修改或非 fast-forward）`, 'yellow');
  return { name: skill.name, action: 'warn' };
}

function upgrade() {
  const manifest = loadSkillManifest();
  if (manifest.length === 0) return { skipped: true, results: [] };

  log('\n📦 同步 ~/.agents/skills 并刷新 Claude/Cursor/Codex 链接...', 'blue');
  requireGitForSkills();
  ensureSkillsLayout();

  const results = manifest.map(skill => upgradeOne(skill));
  syncAllAgentsSkillLinks();
  const skipped = results.every(r => r.action === 'skipped');
  return { skipped, results };
}

function countInstalledSkills(manifest) {
  const skillsDir = getAgentsSkillsDir();
  if (!fs.existsSync(skillsDir)) return { total: manifest.length, installed: 0 };

  let installed = 0;
  for (const skill of manifest) {
    if (fs.existsSync(path.join(skillsDir, skill.name))) installed += 1;
  }
  return { total: manifest.length, installed };
}

module.exports = {
  loadSkillManifest,
  writeSkillManifest,
  discoverLocalSkills,
  mergeWithManifest,
  syncLocalToManifest,
  install,
  upgrade,
  countInstalledSkills,
  requireGitForSkills,
};
