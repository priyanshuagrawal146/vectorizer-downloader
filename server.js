const http = require('http');
const fs = require('fs');
const path = require('path');
const { extractVectorImage } = require('./extractor');

const PORT = process.env.PORT || 3847;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // CORS headers for development flexibility
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // API: Extract with Server-Sent Events (SSE) for real-time progress
  if (pathname === '/api/extract-stream' && req.method === 'GET') {
    const inputUrl = parsedUrl.searchParams.get('url');
    const groupBy = parsedUrl.searchParams.get('groupBy') || 'none';
    if (!inputUrl) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Missing "url" parameter' }));
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive'
    });

    const sendSSE = (event, data) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      sendSSE('progress', { stage: 'init', percent: 2, message: 'Initializing extractor...' });
      const result = await extractVectorImage(inputUrl, { groupBy }, (progress) => {
        sendSSE('progress', progress);
      });
      sendSSE('complete', result);
    } catch (err) {
      sendSSE('error', { message: err.message || 'Extraction failed' });
    } finally {
      res.end();
    }
    return;
  }

  // API: Direct JSON extract (POST)
  if (pathname === '/api/extract' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { url, groupBy = 'none' } = JSON.parse(body || '{}');
        if (!url) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Missing "url" in request body' }));
        }

        const result = await extractVectorImage(url, { groupBy });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message || 'Extraction failed' }));
      }
    });
    return;
  }

  // Static File Serving
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  const ext = path.extname(filePath).toLowerCase();

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('404 Not Found');
    }

    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`
\x1b[1;32m✓ Vectorizer SVG UI Server Running!\x1b[0m
----------------------------------------
🌐 Local URL : \x1b[1;36mhttp://localhost:${PORT}\x1b[0m
📁 UI Root   : ${PUBLIC_DIR}
----------------------------------------
Press Ctrl+C to stop.
`);
});
