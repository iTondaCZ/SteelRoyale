import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createDevServer } from '../server.js';

function get(port, rawPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: rawPath, method: 'GET' }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.end();
  });
}

async function withServer(fn) {
  const server = createDevServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    await fn(server.address().port);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

test('serves the game page and scripts', async () => {
  await withServer(async (port) => {
    assert.equal(await get(port, '/'), 200);
    assert.equal(await get(port, '/js/main.js'), 200);
    assert.equal(await get(port, '/lib/three.module.min.js'), 200);
  });
});

test('a null byte in the path is rejected and does not crash the server', async () => {
  await withServer(async (port) => {
    assert.equal(await get(port, '/%00'), 400);
    assert.equal(await get(port, '/js/%00main.js'), 400);
    assert.equal(await get(port, '/'), 200, 'server still alive afterwards');
  });
});

test('dot-files and dot-folders such as .git are never served', async () => {
  await withServer(async (port) => {
    assert.equal(await get(port, '/.git/config'), 404);
    assert.equal(await get(port, '/.git/HEAD'), 404);
    assert.equal(await get(port, '/.gitignore'), 404);
    assert.equal(await get(port, '/.claude/launch.json'), 404);
    assert.equal(await get(port, '/js/%2e%2e/.git/config'), 404);
  });
});

test('paths outside the project folder are not served', async () => {
  await withServer(async (port) => {
    assert.equal(await get(port, '/../package.json'), 200); // URL parsing normalises this to /package.json
    assert.equal(await get(port, '/%2e%2e/%2e%2e/Windows/win.ini'), 404);
    assert.equal(await get(port, '/..%5c..%5cWindows%5cwin.ini'), 404);
  });
});
