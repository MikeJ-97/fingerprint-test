// Serves two things:
//
//   /          the simulation page every client loads (phones, WebViews, Playwright)
//   /console   a password-gated web UI that runs the test suites on the server
//
// The console exists so the suites can be run by clicking rather than by typing
// commands. It runs them server-side deliberately: the suites need the SECRET
// key, and that must never reach a browser. The browser sees only the output.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { timingSafeEqual, randomBytes } from 'node:crypto';

const PORT = Number(process.env.PORT ?? 3000);
const ROOT = fileURLToPath(new URL('./', import.meta.url));
const PAGE_DIR = join(ROOT, 'page');
const CONSOLE_DIR = join(ROOT, 'console');
const DOWNLOAD_DIR = join(ROOT, 'downloads');

// Fail closed. An unset password disables the console entirely rather than
// leaving an open door: its output contains real event data — visitor ids, IP
// addresses, locations — which must not be readable by whoever finds the URL.
const PASSWORD = process.env.TEST_CONSOLE_PASSWORD?.trim() ?? '';
const CONSOLE_ENABLED = PASSWORD.length > 0;

// Sessions live in memory: a restart logging everyone out is the correct
// behaviour for a test console, and it keeps the whole auth story in one file.
const sessions = new Set();

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.apk': 'application/vnd.android.package-archive',
  '.ipa': 'application/octet-stream',
  '.json': 'application/json; charset=utf-8',
};

/** The suites the container can actually run. Playwright is absent on purpose:
 *  no browsers are installed here, and adding them costs about a gigabyte for
 *  something that belongs on a machine with a real screen anyway. */
const SUITES = {
  smoke: {
    label: 'Smoke',
    args: ['--env-file=.env', 'verify/smoke.mjs'],
    blurb: 'One identify, then verify it with the secret key.',
  },
  bots: {
    label: 'Bots',
    args: ['--env-file=.env', 'attacker/bot.mjs'],
    blurb: 'Seven client shapes: headless, curl, Googlebot, no user-agent, webdriver.',
  },
  forge: {
    label: 'Forgery',
    args: ['--env-file=.env', 'attacker/forge.mjs'],
    blurb: 'Five forgery attempts against the integrity layer.',
  },
  policy: {
    label: 'Policy',
    args: ['--test', 'verify/policy.test.mjs'],
    blurb: 'Unit tests for your allow / review / block rules.',
  },
};

function constantTimeEqual(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  // Length is compared separately because timingSafeEqual throws on a mismatch.
  // The length of a password is not the secret; its contents are.
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function sessionFrom(req) {
  const raw = req.headers.cookie ?? '';
  const match = /(?:^|;\s*)tc=([A-Za-z0-9_-]+)/.exec(raw);
  return match?.[1] ?? null;
}

function authed(req) {
  const id = sessionFrom(req);
  return id !== null && sessions.has(id);
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readBody(req, limit = 4096) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > limit) throw new Error('body too large');
  }
  return raw ? JSON.parse(raw) : {};
}

/** Runs one suite and returns its combined output. Suites are chosen from a
 *  fixed map rather than taken from the request, so nothing the browser sends
 *  can become a command. */
function runSuite(key) {
  const suite = SUITES[key];
  return new Promise((resolve) => {
    const started = Date.now();
    execFile(
      process.execPath,
      suite.args,
      { cwd: ROOT, timeout: 180_000, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => {
        resolve({
          ok: !err,
          durationMs: Date.now() - started,
          // Both streams: node --test writes results to stdout, but a crashing
          // suite explains itself on stderr, and hiding that would turn a
          // diagnosable failure into a blank panel.
          output: `${stdout}${stderr}`.trimEnd() || '(no output)',
        });
      },
    );
  });
}

async function serveFile(res, dir, urlPath, fallback) {
  const safe = normalize(urlPath === '' || urlPath === '/' ? `/${fallback}` : urlPath);
  const file = join(dir, safe);
  // The prefix check is the real guard: whatever the URL claims, a resolved
  // path outside the directory is refused rather than read.
  if (!file.startsWith(dir)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}

createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;

    if (path === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
      return;
    }

    // ---- console API ----
    if (path.startsWith('/api/')) {
      if (!CONSOLE_ENABLED) {
        json(res, 503, { error: 'console_disabled' });
        return;
      }

      if (path === '/api/login' && req.method === 'POST') {
        let body;
        try {
          body = await readBody(req);
        } catch {
          json(res, 400, { error: 'bad_request' });
          return;
        }
        if (typeof body.password !== 'string' || !constantTimeEqual(body.password, PASSWORD)) {
          json(res, 401, { error: 'wrong_password' });
          return;
        }
        const id = randomBytes(24).toString('base64url');
        sessions.add(id);
        res.writeHead(200, {
          'Content-Type': 'application/json',
          // HttpOnly so a script on the page cannot read it; SameSite=Strict so
          // another site cannot make an authenticated request on your behalf.
          'Set-Cookie': `tc=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`,
        });
        res.end('{"ok":true}');
        return;
      }

      if (path === '/api/session') {
        json(res, 200, { authed: authed(req), suites: describeSuites() });
        return;
      }

      if (path.startsWith('/api/run/') && req.method === 'POST') {
        if (!authed(req)) {
          json(res, 401, { error: 'unauthorised' });
          return;
        }
        const key = path.slice('/api/run/'.length);
        if (!Object.hasOwn(SUITES, key)) {
          json(res, 404, { error: 'unknown_suite' });
          return;
        }
        json(res, 200, await runSuite(key));
        return;
      }

      if (path === '/api/downloads') {
        json(res, 200, { files: await listDownloads() });
        return;
      }

      json(res, 404, { error: 'not_found' });
      return;
    }

    // ---- console UI ----
    if (path === '/console' || path.startsWith('/console/')) {
      if (!CONSOLE_ENABLED) {
        res
          .writeHead(404, { 'Content-Type': 'text/plain' })
          .end('console disabled (TEST_CONSOLE_PASSWORD not set)');
        return;
      }
      const rest = path === '/console' || path === '/console/' ? '' : path.slice('/console'.length);
      await serveFile(res, CONSOLE_DIR, rest, 'index.html');
      return;
    }

    // ---- app downloads ----
    if (path.startsWith('/downloads/')) {
      await serveFile(res, DOWNLOAD_DIR, path.slice('/downloads'.length), 'index.html');
      return;
    }

    // ---- the simulator page, unchanged at the root so every existing client
    // (phones, the WebView apps, FPCLONE_PAGE_URL) keeps working ----
    await serveFile(res, PAGE_DIR, path, 'index.html');
  })();
}).listen(PORT, '0.0.0.0', () => {
  console.log(`sim page   -> http://localhost:${String(PORT)}/`);
  console.log(
    CONSOLE_ENABLED
      ? `console    -> http://localhost:${String(PORT)}/console`
      : 'console    -> disabled (set TEST_CONSOLE_PASSWORD to enable)',
  );
});

function describeSuites() {
  return Object.entries(SUITES).map(([key, s]) => ({
    key,
    label: s.label,
    blurb: s.blurb,
  }));
}

async function listDownloads() {
  // Artifacts are LINKED, not committed. An APK is ~58 MB, and a public git
  // repo keeps every copy forever -- a few rebuilds would outweigh the entire
  // rest of the project, unremovable without rewriting history. EAS already
  // hosts the file on a CDN, so downloads/manifest.json records the URL and the
  // console links to it. A locally-placed file still works and takes priority,
  // for anyone who would rather host it themselves.
  const wanted = [
    { key: 'android', file: 'fpclone-sim.apk', label: 'Android APK', platform: 'Android' },
    { key: 'ios', file: 'fpclone-sim.ipa', label: 'iOS IPA', platform: 'iOS' },
  ];

  let manifest = {};
  try {
    manifest = JSON.parse(await readFile(join(DOWNLOAD_DIR, 'manifest.json'), 'utf8'));
  } catch {
    // No manifest is normal: nothing has been built yet.
  }

  const out = [];
  for (const w of wanted) {
    let local = null;
    try {
      const s = await stat(join(DOWNLOAD_DIR, w.file));
      local = s.size;
    } catch {
      // Not present locally; fall through to the manifest.
    }

    const entry = manifest[w.key];
    if (local !== null) {
      out.push({ ...w, available: true, bytes: local, href: `/downloads/${w.file}` });
    } else if (entry?.url) {
      out.push({
        ...w,
        available: true,
        bytes: entry.bytes ?? 0,
        href: entry.url,
        builtAt: entry.builtAt ?? null,
      });
    } else {
      // Reported as unavailable rather than omitted, so the page can explain
      // what is missing instead of silently showing nothing.
      out.push({ ...w, available: false, bytes: 0, href: null });
    }
  }
  return out;
}
