// Static server for the simulation page. This is the only long-running process
// in the harness — everything else is a script — and it exists so the page can
// be deployed on its own origin, away from the production dashboard.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT ?? 3000);
const ROOT = fileURLToPath(new URL('./page/', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

createServer((req, res) => {
  void (async () => {
    const path = (req.url ?? '/').split('?')[0];

    // Container health check. Coolify polls this to decide whether the deploy
    // succeeded; without it a healthy container can be marked failed.
    if (path === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
      return;
    }

    // normalize() collapses any ../ segments before join sees them, and the
    // prefix check below is the actual guard: whatever the URL claims, a
    // resolved path outside page/ is refused rather than read.
    const file = join(ROOT, normalize(path === '/' ? '/index.html' : path));
    if (!file.startsWith(ROOT)) {
      res.writeHead(403).end('forbidden');
      return;
    }

    try {
      const body = await readFile(file);
      res.writeHead(200, {
        'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
        // The page is a live test surface; a cached copy would hide changes and
        // make a failed deploy look like a successful one.
        'Cache-Control': 'no-store',
      });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  })();
}).listen(PORT, '0.0.0.0', () => {
  console.log(`sim page listening on :${String(PORT)}`);
});
