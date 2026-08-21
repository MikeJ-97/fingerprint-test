// Shared payload builder for the non-browser clients. These exist because a
// real browser CANNOT produce them: no browser will omit its User-Agent, reuse
// a spent nonce, or backdate collectedAt.
const API = process.env.FPCLONE_API_URL;
const PUBLIC_KEY = process.env.FPCLONE_PUBLIC_KEY;

export const ORIGIN = 'http://localhost:5174';
export const UA_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

// A fixed device. Identity is sha256 over {thumbmark, custom} only, so holding
// these constant means every scenario below is provably the SAME device — the
// only thing varying is the attack.
export function makeSignals(overrides = {}) {
  return {
    thumbmark: {
      thumbmark: 'attacker-fixed-0001',
      components: { canvas: 'atk-canvas', audio: 'atk-audio', webgl: 'atk-webgl', fonts: 'atk-fonts' },
      version: '0.20.0',
    },
    creep: { fingerprint: 'atk-creep', lieScore: 0, lies: [], trustScore: 100 },
    automation: { webdriver: false },
    custom: {
      timezone: { offset: -480, name: 'Asia/Kuala_Lumpur' },
      languages: ['en-US', 'en'],
      hardwareConcurrency: 8,
      deviceMemory: 8,
      touchSupport: { maxTouchPoints: 0, touchEvent: false },
      mediaDevices: ['audioinput', 'audiooutput', 'videoinput'],
      permissions: { notifications: 'prompt' },
    },
    meta: { sdkVersion: 'attacker-0.0.1', collectedAt: Date.now(), schemaVersion: 1 },
    ...overrides,
  };
}

export async function getNonce() {
  const res = await fetch(`${API}/v1/challenge?publicKey=${PUBLIC_KEY}`, {
    headers: { Origin: ORIGIN },
  });
  if (!res.ok) throw new Error(`challenge failed: ${res.status}`);
  return (await res.json()).nonce;
}

export async function identify({ signals, ua = UA_CHROME, nonce, token, linkedId, origin = ORIGIN }) {
  // ua: null means send NO User-Agent at all, which fetch cannot do -- undici
  // injects `User-Agent: node`. That silently invalidated this scenario: the
  // server recorded "node", not an absent header, so the case being tested was
  // never actually exercised. node:https sends only the headers it is given.
  if (ua === null) return identifyWithoutUserAgent({ signals, nonce, token, linkedId, origin });

  const headers = { 'Content-Type': 'application/json', Origin: origin };
  headers['User-Agent'] = ua;
  if (token) headers['X-FP-Integrity'] = token;

  const body = JSON.stringify({
    publicKey: PUBLIC_KEY,
    signals: signals ?? makeSignals(),
    schemaVersion: 1,
    ...(nonce ? { nonce } : {}),
    ...(linkedId ? { linkedId } : {}),
  });

  const res = await fetch(`${API}/v1/identify`, { method: 'POST', headers, body });
  return { status: res.status, body: await res.json() };
}

/** Sends a request with genuinely no User-Agent header. Uses node:https rather
 *  than fetch because undici always supplies a default, and a default is
 *  exactly what this scenario must not have. */
async function identifyWithoutUserAgent({ signals, nonce, token, linkedId, origin }) {
  const { request } = await import('node:https');
  const api = new URL(API);
  const payload = JSON.stringify({
    publicKey: PUBLIC_KEY,
    signals: signals ?? makeSignals(),
    schemaVersion: 1,
    ...(nonce ? { nonce } : {}),
    ...(linkedId ? { linkedId } : {}),
  });

  const headers = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    Origin: origin,
  };
  if (token) headers['X-FP-Integrity'] = token;

  return new Promise((resolve, reject) => {
    const req = request(
      { hostname: api.hostname, port: api.port || 443, path: '/v1/identify', method: 'POST', headers },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode, body: { error: 'unparseable', raw } });
          }
        });
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}
