// Server-side verification: exchanges a requestId for the trusted event record.
// The SECRET key lives only here and in .env — never in page/ or mobile/.
import { pathToFileURL } from 'node:url';

const API = process.env.FPCLONE_API_URL;
const SECRET = process.env.FPCLONE_SECRET_KEY;

export async function verify(requestId) {
  const res = await fetch(`${API}/v1/events/${requestId}`, {
    headers: { Authorization: `Bearer ${SECRET}` },
  });
  const body = await res.json();
  if (!res.ok) {
    const err = new Error(`verify failed: ${res.status} ${body.error ?? ''}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

function line(k, v) {
  return `  ${k.padEnd(18)} ${v}`;
}

export function format(e) {
  const t = e.threatIntel;
  const loc = [e.ipLocation.city, e.ipLocation.region, e.ipLocation.country].filter(Boolean).join(', ');
  return [
    line('visitorId', e.visitorId),
    line('requestId', e.requestId),
    line('linkedId', t.linkedId ?? '—'),
    line('device', `${e.browser.name} ${e.browser.version} · ${e.os.name} ${e.os.version} · ${e.deviceType ?? '?'}`),
    line('ip', `${e.ipAddress}  ${loc || '—'}`),
    line('network', `asn ${t.asn ?? '?'} ${t.asnOrg ?? ''} tor:${t.isTor} vpn:${t.isVpn} dc:${t.isDatacenter}`),
    line('bot', `${t.botScore ?? '?'} (${t.botClassification ?? '?'})`),
    line('tamper', String(t.tamperSuspected)),
    line('suspectScore', `${t.suspectScore}  ${t.suspectScore >= 60 ? 'HIGH' : t.suspectScore >= 30 ? 'ELEVATED' : 'low'}`),
  ].join('\n');
}

// CLI entry. Guarded on being the entrypoint: without this the block runs on
// every import, and a Playwright worker's argv[2] gets read as a requestId.
// argv[1] is undefined under `node -e`, where pathToFileURL would throw — so
// the guard has to tolerate not being run as a script at all, not just not
// being the entrypoint.
const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entrypoint !== null && import.meta.url === entrypoint) {
  const requestId = process.argv[2];
  if (!requestId) {
    console.error('usage: npm run verify -- <requestId>');
    process.exit(1);
  }
  try {
    console.log('\n' + format(await verify(requestId)) + '\n');
  } catch (err) {
    console.error(`\n  ${err.message}`);
    if (err.status === 404) {
      console.error('  -> requestId not found, wrong tenant, or older than the 600s lookup window.\n');
    }
    process.exit(1);
  }
}
