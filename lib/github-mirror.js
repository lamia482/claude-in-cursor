const DEFAULT_GITHUB_MIRROR_PREFIX = 'https://ghfast.top/';

function normalizeMirrorPrefix(prefix) {
  if (!prefix || typeof prefix !== 'string') return null;
  const trimmed = prefix.trim();
  if (!trimmed) return null;
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

function isGithubHttpsUrl(url) {
  return Boolean(url && /^https:\/\/github\.com\//i.test(url));
}

/**
 * Build ghfast-style mirror URL: https://ghfast.top/https://github.com/org/repo.git
 */
function toGithubMirrorUrl(httpsUrl, mirrorPrefix = DEFAULT_GITHUB_MIRROR_PREFIX) {
  const prefix = normalizeMirrorPrefix(mirrorPrefix);
  if (!prefix || !isGithubHttpsUrl(httpsUrl)) return null;
  if (httpsUrl.startsWith(prefix)) return null;
  return `${prefix}${httpsUrl}`;
}

function resolveGithubMirrorPrefix(config) {
  if (!config || config.githubMirror === false) return null;
  const raw = config.githubMirrorPrefix ?? config.githubMirrorUrl ?? DEFAULT_GITHUB_MIRROR_PREFIX;
  return normalizeMirrorPrefix(raw);
}

/** Default true when githubMirror is enabled: try mirror before direct github.com HTTPS. */
function preferGithubMirrorFirst(config) {
  if (!config || config.githubMirror === false) return false;
  return config.githubMirrorFirst !== false;
}

module.exports = {
  DEFAULT_GITHUB_MIRROR_PREFIX,
  normalizeMirrorPrefix,
  isGithubHttpsUrl,
  toGithubMirrorUrl,
  resolveGithubMirrorPrefix,
  preferGithubMirrorFirst,
};
