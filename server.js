// Tiny zero-dependency static server for Holy Poker.
// Run: node server.js  ->  http://localhost:8437
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8437;
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url.endsWith('/')) url += 'index.html';
  // dev helper: accept base64 png screenshots from the page
  if (req.method === 'POST' && url === '/shot') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const name = 'shot-' + Date.now() + '.png';
        const b64 = body.replace(/^data:image\/png;base64,/, '');
        fs.mkdirSync(path.join(ROOT, 'shots'), { recursive: true });
        fs.writeFileSync(path.join(ROOT, 'shots', name), Buffer.from(b64, 'base64'));
        res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end(name);
      } catch (e) { res.writeHead(500); res.end(String(e)); }
    });
    return;
  }
  let file = path.join(ROOT, path.normalize(url));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  try { if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html'); } catch (e) { /* falls through to 404 */ }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`Holy Poker at http://localhost:${PORT}`));
