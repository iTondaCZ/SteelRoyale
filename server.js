// Tiny zero-dependency static file server for local development.
// Usage: node server.js          →   http://localhost:8080
//        node server.js --open   →   also opens your default browser (play.bat does this)
// Listens on this computer only. To test from another device on your network,
// run with HOST=0.0.0.0 (dot-files such as .git are never served either way).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2',
};

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

export function createDevServer(root = ROOT) {
  return http.createServer((req, res) => {
    let urlPath;
    try {
      urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    } catch {
      return send(res, 400, 'Bad request');
    }
    // Null bytes make fs calls throw; reject them up front.
    if (urlPath.includes('\0')) return send(res, 400, 'Bad request');
    // Never serve dot-files or dot-folders (.git, .claude, .env, …) or ".." segments.
    if (urlPath.split(/[\\/]/).some((segment) => segment.startsWith('.'))) return send(res, 404, 'Not found');
    if (urlPath.endsWith('/')) urlPath += 'index.html';

    const filePath = path.resolve(root, '.' + urlPath);
    // Never serve anything outside the project folder.
    if (filePath !== root && !filePath.startsWith(root + path.sep)) return send(res, 404, 'Not found');

    try {
      fs.stat(filePath, (err, stat) => {
        if (err || !stat.isFile()) return send(res, 404, 'Not found');
        const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size, 'Cache-Control': 'no-store' });
        const stream = fs.createReadStream(filePath);
        stream.on('error', () => res.destroy());
        stream.pipe(res);
      });
    } catch {
      send(res, 400, 'Bad request');
    }
  });
}

/** Open a URL in the default browser. */
function openBrowser(url) {
  const opts = { detached: true, stdio: 'ignore' };
  if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '""', url], { ...opts, windowsVerbatimArguments: true });
  else if (process.platform === 'darwin') spawn('open', [url], opts);
  else spawn('xdg-open', [url], opts);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const url = `http://localhost:${PORT}`;
  const open = process.argv.includes('--open');
  const server = createDevServer();
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${PORT} is already in use, so SteelRoyale is probably already running at ${url}`);
      console.log('(To use another port: set PORT=8081 before starting.)');
      if (open) openBrowser(url);
      process.exitCode = 1;
      return;
    }
    throw err;
  });
  server.listen(PORT, HOST, () => {
    console.log(`SteelRoyale running at ${url}`);
    console.log('Keep this window open while you play. Close it (or press Ctrl+C) to stop the server.');
    if (open) openBrowser(url);
  });
}
