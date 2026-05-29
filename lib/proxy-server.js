const http = require('http');
const https = require('https');
const { URL } = require('url');

function collectTextContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';

  return content
    .filter(block => block && block.type === 'text' && block.text)
    .map(block => block.text)
    .join('\n');
}

function mergeSystemValue(parts, value) {
  if (!value) return;

  if (typeof value === 'string') {
    parts.push(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const block of value) {
      if (block && block.type === 'text' && block.text) {
        parts.push(block.text);
      }
    }
  }
}

function fixAnthropicRequest(body) {
  const data = JSON.parse(body);
  const systemParts = [];

  mergeSystemValue(systemParts, data.system);

  const messages = [];
  for (const message of data.messages || []) {
    if (message.role === 'system' || message.role === 'developer') {
      mergeSystemValue(systemParts, message.content);
      continue;
    }

    if (message.role === 'user' || message.role === 'assistant') {
      messages.push(message);
      continue;
    }

    messages.push(message);
  }

  data.messages = messages;
  if (systemParts.length > 0) {
    data.system = systemParts.join('\n\n');
  } else {
    delete data.system;
  }

  return JSON.stringify(data);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function joinUpstreamUrl(upstreamBaseUrl, requestUrl) {
  const base = upstreamBaseUrl.replace(/\/$/, '');
  const path = requestUrl.startsWith('/') ? requestUrl : `/${requestUrl}`;
  return `${base}${path}`;
}

function forwardRequest({ req, res, upstreamBaseUrl, body }) {
  const upstreamUrl = new URL(joinUpstreamUrl(upstreamBaseUrl, req.url));
  const headers = { ...req.headers, host: upstreamUrl.host };

  delete headers['content-length'];

  const transport = upstreamUrl.protocol === 'https:' ? https : http;
  const proxyReq = transport.request(
    upstreamUrl,
    {
      method: req.method,
      headers,
    },
    proxyRes => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on('error', error => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
    }
    res.end(JSON.stringify({
      type: 'error',
      error: {
        type: 'proxy_error',
        message: `Upstream request failed: ${error.message}`,
      },
    }));
  });

  if (body && body.length > 0) {
    proxyReq.write(body);
  }
  proxyReq.end();
}

function startProxyServer({ host = '127.0.0.1', port = 19876, upstream }) {
  if (!upstream) {
    throw new Error('proxy upstream base URL is required');
  }

  const upstreamBaseUrl = upstream.replace(/\/$/, '');
  const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, upstream: upstreamBaseUrl }));
      return;
    }

    try {
      let body = await readRequestBody(req);
      const contentType = req.headers['content-type'] || '';
      const shouldFixBody = req.method === 'POST'
        && contentType.includes('application/json')
        && req.url.includes('/messages')
        && body.length > 0;

      if (shouldFixBody) {
        body = Buffer.from(fixAnthropicRequest(body.toString('utf8')), 'utf8');
      }

      forwardRequest({ req, res, upstreamBaseUrl, body });
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        type: 'error',
        error: {
          type: 'proxy_error',
          message: error.message,
        },
      }));
    }
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, host, () => {
      resolve({
        host,
        port,
        upstream: upstreamBaseUrl,
        close: () => new Promise(closeResolve => server.close(closeResolve)),
      });
    });
  });
}

module.exports = {
  collectTextContent,
  fixAnthropicRequest,
  startProxyServer,
};
