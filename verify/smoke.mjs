// End-to-end smoke test with no browser involved: POST a schema-valid identify,
// then verify it with the secret key. Proves the key, allowed-origins, and
// endpoint config are correct before any client is built on top of them.
import { verify, format } from './cli.mjs';

const API = process.env.FPCLONE_API_URL;
const PUBLIC_KEY = process.env.FPCLONE_PUBLIC_KEY;
const ORIGIN = 'http://localhost:5174';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const signals = {
  thumbmark: {
    thumbmark: 'smoke-fixed-thumbmark-0001',
    components: { canvas: 'smoke-canvas-a', audio: 'smoke-audio-a', webgl: 'smoke-webgl-a', fonts: 'smoke-fonts-a' },
    version: '0.20.0',
  },
  creep: { fingerprint: 'smoke-creep-a', lieScore: 0, lies: [], trustScore: 100 },
  automation: { webdriver: false },
  custom: {
    timezone: { offset: -480, name: 'Asia/Kuala_Lumpur' },
    languages: ['en-US', 'en'],
    hardwareConcurrency: 8,
    deviceMemory: 8,
    touchSupport: { maxTouchPoints: 0, touchEvent: false },
    mediaDevices: ['audioinput', 'audiooutput', 'videoinput'],
    permissions: { notifications: 'prompt', geolocation: 'prompt' },
  },
  meta: { sdkVersion: 'smoke-0.0.1', collectedAt: Date.now(), schemaVersion: 1 },
};

const res = await fetch(`${API}/v1/identify`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'User-Agent': UA },
  body: JSON.stringify({ publicKey: PUBLIC_KEY, signals, schemaVersion: 1, linkedId: 'user_smoke' }),
});
const body = await res.json();

if (!res.ok) {
  console.error(`\n  identify FAILED: ${res.status}`);
  console.error('  ' + JSON.stringify(body));
  if (body.error === 'origin_not_allowed') {
    console.error(`  → add "${new URL(ORIGIN).host}" to the key's allowed origins.\n`);
  }
  process.exit(1);
}

console.log(`\n  identify OK  visitor=${body.visitorId}  new=${body.isNewVisitor}`);
console.log('\n  --- server-side verification ---');
console.log(format(await verify(body.requestId)) + '\n');
