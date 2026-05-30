const fs = require('fs');
const path = require('path');
const { log } = require('./log');
const { run, runQuiet, runAllowFail, isCommandAvailable } = require('./exec');
const {
  getSkillsDir,
  getSkillManifestPath,
  ensureSkillsDir,
} = require('./paths');

const DEFAULT_BRANCH = 'main';

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

function gitPullWithFallback(dest, sshUrl) {
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
  const skillsDir = getSkillsDir();
  if (!fs.existsSync(skillsDir)) return { skills: [], skipped: [] };

  const skills = [];
  const skipped = [];
  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

    const dest = path.join(skillsDir, entry.name);
    const gitDir = path.join(dest, '.git');

    if (!fs.existsSync(gitDir)) {
      log(`⚠️ 跳过 ${entry.name}：非 git 仓库`, 'yellow');
      skipped.push({ name: entry.name, reason: 'no-git' });
      continue;
    }

    const remote = runQuiet(`git -C "${dest}" remote get-url origin`);
    if (!remote) {
      log(`⚠️ 跳过 ${entry.name}：无 origin remote`, 'yellow');
      skipped.push({ name: entry.name, reason: 'no-remote' });
      continue;
    }

    const branch = runQuiet(`git -C "${dest}" branch --show-current`) || DEFAULT_BRANCH;
    const httpsUrl = normalizeToHttps(remote);
    const skill = { name: entry.name, url: httpsUrl, branch };
    if (remote.startsWith('git@') && httpsUrl) {
      skill.ssh_url = remote.endsWith('.git') ? remote : `${remote}.git`;
    }
    skills.push(skill);
  }

  return { skills, skipped };
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
  log('\n📂 扫描本地 skills 并合并 skill.yaml...', 'blue');
  requireGitForSkills();

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

function install() {
  const manifest = loadSkillManifest();
  if (manifest.length === 0) return { skipped: true, results: [] };

  log('\n📦 安装 Claude skills...', 'blue');
  requireGitForSkills();
  ensureSkillsDir();

  const results = [];
  for (const skill of manifest) {
    const dest = path.join(getSkillsDir(), skill.name);
    if (fs.existsSync(dest)) {
      log(`✓ skill "${skill.name}" 已存在，跳过`, 'green');
      results.push({ name: skill.name, action: 'skipped' });
      continue;
    }

    log(`\n📥 安装 skill: ${skill.name}`, 'blue');
    const via = gitCloneWithFallback(skill, dest);
    log(`✓ skill "${skill.name}" 安装完成 (${via})`, 'green');
    results.push({ name: skill.name, action: via === 'ssh' ? 'cloned-ssh' : 'cloned', via });
  }

  return { skipped: false, results };
}

function upgradeOne(skill) {
  const dest = path.join(getSkillsDir(), skill.name);
  const { sshUrl } = resolveUrls(skill);

  if (!fs.existsSync(dest)) {
    log(`\n📥 skill "${skill.name}" 不存在，开始 clone...`, 'blue');
    const via = gitCloneWithFallback(skill, dest);
    return { name: skill.name, action: via === 'ssh' ? 'cloned-ssh' : 'cloned', via };
  }

  const gitDir = path.join(dest, '.git');
  if (!fs.existsSync(gitDir)) {
    log(`⚠️ 跳过 ${skill.name}：目录存在但非 git 仓库`, 'yellow');
    return { name: skill.name, action: 'warn' };
  }

  log(`\n🔄 更新 skill: ${skill.name}`, 'blue');
  const pullResult = gitPullWithFallback(dest, sshUrl);
  if (pullResult.ok) {
    log(`✓ skill "${skill.name}" 已更新 (${pullResult.via})`, 'green');
    return {
      name: skill.name,
      action: pullResult.via === 'ssh' ? 'pulled-ssh' : 'pulled',
      via: pullResult.via,
    };
  }

  log(`⚠️ skill "${skill.name}" 更新失败，请手动处理（可能有本地修改或非 fast-forward）`, 'yellow');
  return { name: skill.name, action: 'warn' };
}

function upgrade() {
  const manifest = loadSkillManifest();
  if (manifest.length === 0) return { skipped: true, results: [] };

  log('\n📦 同步 Claude skills...', 'blue');
  requireGitForSkills();
  ensureSkillsDir();

  const results = manifest.map(skill => upgradeOne(skill));
  const skipped = results.every(r => r.action === 'skipped');
  return { skipped, results };
}

function countInstalledSkills(manifest) {
  const skillsDir = getSkillsDir();
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
