const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { log } = require('./log');
const { loadConfig } = require('./config');
const { resolveProxyConfig } = require('./proxy-config');

function probeHealth(baseUrl, timeoutMs = 500) {
  return new Promise(resolve => {
    const url = new URL('/health', `${baseUrl.replace(/\/$/, '')}/`);
    const req = http.get(url, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          resolve(false);
          return;
        }
        try {
          const data = JSON.parse(body);
          resolve(Boolean(data.ok));
        } catch {
          resolve(false);
        }
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

async function waitForProxy(baseUrl, attempts = 20, intervalMs = 250) {
  for (let i = 0; i < attempts; i += 1) {
    if (await probeHealth(baseUrl)) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  return false;
}

function spawnProxyProcess() {
  const projectRoot = path.join(__dirname, '..');
  const proxyScript = path.join(projectRoot, 'proxy.js');
  const child = spawn(process.execPath, [proxyScript], {
    detached: true,
    stdio: 'ignore',
    cwd: projectRoot,
  });
  child.unref();
}

async function ensureProxyRunning(config = loadConfig()) {
  const proxyConfig = resolveProxyConfig(config);
  if (!proxyConfig.enabled) {
    return false;
  }

  const proxyBaseUrl = proxyConfig.baseUrl;
  if (await probeHealth(proxyBaseUrl)) {
    log(`✓ cc-switch 兼容代理已运行 (${proxyBaseUrl})`, 'green');
    return true;
  }

  log('通过 cc-switch 启动 DeepSeek 兼容代理（修复 system 角色问题）...', 'blue');
  spawnProxyProcess();

  const ready = await waitForProxy(proxyBaseUrl);
  if (!ready) {
    log('✗ 兼容代理启动失败，请执行: node change.js deepseek', 'red');
    return false;
  }

  log(`✓ cc-switch 兼容代理已启动 (${proxyBaseUrl})`, 'green');
  return true;
}

module.exports = {
  probeHealth,
  ensureProxyRunning,
};
