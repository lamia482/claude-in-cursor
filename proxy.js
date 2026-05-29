#!/usr/bin/env node

const { log } = require('./lib/log');
const { resolveProxyConfig } = require('./lib/proxy-config');
const { startProxyServer } = require('./lib/proxy-server');

(async () => {
  const proxyConfig = resolveProxyConfig();
  if (!proxyConfig.enabled) {
    log('当前 cc-switch profile 未启用兼容代理', 'yellow');
    process.exit(0);
  }

  const server = await startProxyServer({
    host: proxyConfig.host,
    port: proxyConfig.port,
    upstream: proxyConfig.upstream,
  });
  log(`cc-switch 兼容代理已监听 http://${server.host}:${server.port}`, 'green');
  log(`上游地址: ${server.upstream}`, 'blue');
})();
