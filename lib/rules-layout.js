const fs = require('fs');
const os = require('os');
const path = require('path');
const { log } = require('./log');
const {
  ensureAgentsDir,
  ensureClaudeDir,
  getAgentsRulesDir,
  getAgentsGlobalDocPath,
  getRulesSeedDir,
  getGlobalRulesDirLinkPath,
  getGlobalRulesFileLinkTargets,
  getProjectRuleLinkNames,
  getProjectRoot,
} = require('./paths');

const RULES_DIR_LINK_LABEL = '~/.claude/rules';
const GLOBAL_FILE_LINK_LABELS = {
  claudeMd: '~/.claude/CLAUDE.md',
  codexMd: '~/.codex/AGENTS.md',
};

const SEED_RULE_FILES = ['document-skills.mdc', 'pathology-ml.mdc'];
const SEED_GLOBAL_FILE = 'AGENTS.global.md';

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

function ensureParentDir(filePath) {
  const parent = path.dirname(filePath);
  if (!fs.existsSync(parent)) {
    fs.mkdirSync(parent, { recursive: true });
  }
}

function symlinkTypeDir() {
  return os.platform() === 'win32' ? 'junction' : 'dir';
}

function symlinkFile(source, linkPath) {
  ensureParentDir(linkPath);
  const relative = path.relative(path.dirname(linkPath), source);
  fs.symlinkSync(relative, linkPath, 'file');
}

function isSymlinkToTarget(linkPath, expectedTarget) {
  if (!fs.existsSync(linkPath) || !fs.lstatSync(linkPath).isSymbolicLink()) {
    return false;
  }
  const resolved = resolveRealPath(linkPath);
  return Boolean(resolved && resolved === path.resolve(expectedTarget));
}

function removePathIfExists(targetPath) {
  if (!fs.existsSync(targetPath)) return;
  const stat = fs.lstatSync(targetPath);
  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  } else {
    fs.rmSync(targetPath, { force: true });
  }
}

function seedFileIfMissing(targetPath, seedFileName, { force = false } = {}) {
  const seedPath = path.join(getRulesSeedDir(), seedFileName);
  if (!fs.existsSync(seedPath)) {
    log(`⚠️ 缺少种子文件: ${seedPath}`, 'yellow');
    return { seeded: false };
  }
  if (fs.existsSync(targetPath) && !force) {
    return { seeded: false, existed: true };
  }
  if (fs.existsSync(targetPath) && force) {
    fs.rmSync(targetPath, { force: true });
  }
  fs.copyFileSync(seedPath, targetPath);
  log(`写入规则种子: ${path.basename(targetPath)} → ${targetPath}`, 'blue');
  return { seeded: true };
}

function seedRulesIfMissing({ force = false } = {}) {
  ensureAgentsDir();
  const rulesDir = getAgentsRulesDir();
  if (!fs.existsSync(rulesDir)) {
    fs.mkdirSync(rulesDir, { recursive: true });
  }

  const results = [];
  for (const name of SEED_RULE_FILES) {
    results.push(
      seedFileIfMissing(path.join(rulesDir, name), name, { force }),
    );
  }

  const globalPath = getAgentsGlobalDocPath();
  results.push(
    seedFileIfMissing(globalPath, SEED_GLOBAL_FILE, { force }),
  );

  return results;
}

function ensureRulesDirLink(linkPath, agentsRulesDir, { force = false } = {}) {
  ensureClaudeDir();
  ensureParentDir(linkPath);

  if (isSymlinkToTarget(linkPath, agentsRulesDir)) {
    return { linked: false, label: RULES_DIR_LINK_LABEL };
  }

  if (fs.existsSync(linkPath)) {
    if (!force) {
      log(
        `⚠️ ${RULES_DIR_LINK_LABEL} 已存在且未指向 ~/.agents/rules，使用 --force-rules-link 替换`,
        'yellow',
      );
      return { linked: false, label: RULES_DIR_LINK_LABEL, skipped: true };
    }
    log(`替换 ${RULES_DIR_LINK_LABEL} 为 ~/.agents/rules 软链接`, 'yellow');
    removePathIfExists(linkPath);
  }

  fs.symlinkSync(agentsRulesDir, linkPath, symlinkTypeDir());
  log(`创建目录软链接: ${RULES_DIR_LINK_LABEL} → ~/.agents/rules`, 'blue');
  return { linked: true, label: RULES_DIR_LINK_LABEL };
}

function ensureGlobalFileLink(linkPath, sourcePath, label, { force = false } = {}) {
  ensureParentDir(linkPath);

  if (isSymlinkToTarget(linkPath, sourcePath)) {
    return { linked: false, label };
  }

  if (fs.existsSync(linkPath)) {
    const stat = fs.lstatSync(linkPath);
    if (stat.isSymbolicLink()) {
      if (!force) {
        log(`⚠️ ${label} 软链接目标不一致，使用 --force-rules-link 替换`, 'yellow');
        return { linked: false, label, skipped: true };
      }
    } else if (!force) {
      log(`⚠️ ${label} 已存在实体文件，使用 --force-rules-link 替换为软链接`, 'yellow');
      return { linked: false, label, skipped: true };
    }
    removePathIfExists(linkPath);
  }

  symlinkFile(sourcePath, linkPath);
  log(`创建文件软链接: ${label} → ~/.agents/AGENTS.global.md`, 'blue');
  return { linked: true, label };
}

function ensureGlobalRulesLinks({ force = false } = {}) {
  const agentsRulesDir = getAgentsRulesDir();
  const agentsGlobal = getAgentsGlobalDocPath();

  const results = [
    ensureRulesDirLink(getGlobalRulesDirLinkPath(), agentsRulesDir, { force }),
  ];

  for (const { linkPath, label } of getGlobalRulesFileLinkTargets()) {
    results.push(ensureGlobalFileLink(linkPath, agentsGlobal, label, { force }));
  }

  return results;
}

function ensureProjectRuleLink(projectRoot, ruleFileName, { force = false } = {}) {
  const source = path.join(getAgentsRulesDir(), ruleFileName);
  const linkPath = path.join(projectRoot, '.cursor', 'rules', ruleFileName);

  if (!fs.existsSync(source)) {
    log(`⚠️ 跳过项目规则链（源不存在）: ${source}`, 'yellow');
    return { linked: false, name: ruleFileName, reason: 'missing-source' };
  }

  ensureParentDir(linkPath);

  if (isSymlinkToTarget(linkPath, source)) {
    return { linked: false, name: ruleFileName };
  }

  if (fs.existsSync(linkPath)) {
    const stat = fs.lstatSync(linkPath);
    if (!stat.isSymbolicLink() && !force) {
      log(
        `⚠️ ${linkPath} 为实体文件，使用 --force-rules-link 替换为 ~/.agents/rules/${ruleFileName}`,
        'yellow',
      );
      return { linked: false, name: ruleFileName, skipped: true };
    }
    removePathIfExists(linkPath);
  }

  symlinkFile(source, linkPath);
  log(`创建项目规则软链接: .cursor/rules/${ruleFileName} → ~/.agents/rules/${ruleFileName}`, 'blue');
  return { linked: true, name: ruleFileName };
}

function ensureProjectRuleLinks(projectRoot, { force = false } = {}) {
  const results = [];
  for (const name of getProjectRuleLinkNames()) {
    results.push(ensureProjectRuleLink(projectRoot, name, { force }));
  }
  return results;
}

function ensureCodexFallbackConfig() {
  const codexDir = path.join(os.homedir(), '.codex');
  const configPath = path.join(codexDir, 'config.toml');
  const fallbackKey = 'project_doc_fallback_filenames';
  const desired = '["CLAUDE.md"]';

  if (!fs.existsSync(codexDir)) {
    fs.mkdirSync(codexDir, { recursive: true });
  }

  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(
      configPath,
      `# Managed by claude-in-cursor setup\n${fallbackKey} = ${desired}\n`,
      'utf8',
    );
    log(`创建 ~/.codex/config.toml 并设置 ${fallbackKey}`, 'blue');
    return { updated: true };
  }

  const content = fs.readFileSync(configPath, 'utf8');
  if (content.includes('CLAUDE.md')) {
    return { updated: false };
  }

  const appended = `${content.trimEnd()}\n\n# Added by claude-in-cursor\n${fallbackKey} = ${desired}\n`;
  fs.writeFileSync(configPath, appended, 'utf8');
  log(`已在 ~/.codex/config.toml 追加 ${fallbackKey}`, 'blue');
  return { updated: true };
}

function parseForceRulesLink(argv) {
  return argv.includes('--force-rules-link');
}

function ensureRulesLayout(options = {}) {
  const {
    projectRoot = getProjectRoot(),
    force = false,
    seedGlobal = true,
    linkProject = true,
    codexFallback = true,
  } = options;

  if (seedGlobal) {
    seedRulesIfMissing({ force: false });
  }

  const linkResults = ensureGlobalRulesLinks({ force });

  if (linkProject && projectRoot) {
    ensureProjectRuleLinks(projectRoot, { force });
  }

  if (codexFallback) {
    ensureCodexFallbackConfig();
  }

  return linkResults;
}

function verifyRulesLinks(projectRoot = getProjectRoot()) {
  const agentsRules = resolveRealPath(getAgentsRulesDir());
  const agentsGlobal = resolveRealPath(getAgentsGlobalDocPath());
  const links = [];
  let allOk = true;

  const dirLink = getGlobalRulesDirLinkPath();
  if (!fs.existsSync(dirLink)) {
    links.push({ label: RULES_DIR_LINK_LABEL, ok: false, reason: 'missing' });
    allOk = false;
  } else {
    const real = resolveRealPath(dirLink);
    if (real && agentsRules && real === agentsRules) {
      links.push({ label: RULES_DIR_LINK_LABEL, ok: true });
    } else {
      links.push({ label: RULES_DIR_LINK_LABEL, ok: false, reason: 'not-linked' });
      allOk = false;
    }
  }

  for (const { linkPath, label } of getGlobalRulesFileLinkTargets()) {
    if (!fs.existsSync(linkPath)) {
      links.push({ label, ok: false, reason: 'missing' });
      allOk = false;
      continue;
    }
    const real = resolveRealPath(linkPath);
    if (real && agentsGlobal && real === agentsGlobal) {
      links.push({ label, ok: true });
    } else {
      links.push({ label, ok: false, reason: 'not-linked' });
      allOk = false;
    }
  }

  for (const name of getProjectRuleLinkNames()) {
    const linkPath = path.join(projectRoot, '.cursor', 'rules', name);
    const source = path.join(getAgentsRulesDir(), name);
    const label = `.cursor/rules/${name}`;
    if (!fs.existsSync(linkPath)) {
      links.push({ label, ok: false, reason: 'missing' });
      allOk = false;
    } else {
      const real = resolveRealPath(linkPath);
      const srcReal = resolveRealPath(source);
      if (real && srcReal && real === srcReal) {
        links.push({ label, ok: true });
      } else {
        links.push({ label, ok: false, reason: 'not-linked' });
        allOk = false;
      }
    }
  }

  return { ok: allOk, links };
}

module.exports = {
  SEED_RULE_FILES,
  seedRulesIfMissing,
  ensureGlobalRulesLinks,
  ensureProjectRuleLinks,
  ensureCodexFallbackConfig,
  ensureRulesLayout,
  verifyRulesLinks,
  parseForceRulesLink,
};
