import { createServer } from 'http';
import { readFile } from 'fs/promises';
import path from 'path';

const contentTypes = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
};

// Use this for E2E pages that must behave like normal web pages, especially
// content-script fixtures. The production extension only injects into HTTP(S)
// pages, so tests should wrap fixture navigation in this helper and build URLs
// from the origin passed to `testBody`.
export async function withStaticServer(rootDir, testBody) {
  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url, 'http://127.0.0.1');
    const requestPath = requestUrl.pathname === '/' ? '/panel.html' : requestUrl.pathname;
    const filePath = path.normalize(path.join(rootDir, decodeURIComponent(requestPath)));

    if (!filePath.startsWith(`${rootDir}${path.sep}`)) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }

    try {
      const content = await readFile(filePath);
      response.writeHead(200, { 'content-type': contentTypes[path.extname(filePath)] ?? 'application/octet-stream' });
      response.end(content);
    } catch (_error) {
      response.writeHead(404);
      response.end('Not found');
    }
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const address = server.address();
    await testBody(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
}
