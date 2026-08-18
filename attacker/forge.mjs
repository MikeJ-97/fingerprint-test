// Integrity / tamper / replay scenarios.
//
// HONEST LIMIT: we cannot mint a VALID X-FP-Integrity token here, because that
// needs the server's SDK_SIGNING_SECRET. That is the point of the feature. So
// every case below is a negative case, and the pass condition is that the
// server NOTICES. The positive case is covered by the real SDK, in
// desktop/tests/identity.spec.ts ("the real SDK passes the integrity check").
import { identify, getNonce, makeSignals } from './device.mjs';
import { verify } from '../verify/cli.mjs';

const results = [];
async function scenario(name, expectation, run) {
  try {
    const outcome = await run();
    const pass = expectation(outcome);
    results.push({ name, pass, detail: outcome.detail });
  } catch (err) {
    results.push({ name, pass: false, detail: `threw: ${err.message}` });
  }
}

async function identifyAndVerify(args) {
  const { status, body } = await identify(args);
  if (status !== 200) return { status, detail: `HTTP ${status} ${body.error ?? ''}` };
  const event = await verify(body.requestId);
  return {
    status,
    tamper: event.threatIntel.tamperSuspected,
    score: event.threatIntel.suspectScore,
    detail: `tamper=${event.threatIntel.tamperSuspected} score=${event.threatIntel.suspectScore}`,
  };
}

await scenario('no nonce, no integrity token', (o) => o.tamper === true, () =>
  identifyAndVerify({}));

await scenario('valid nonce but no integrity token', (o) => o.tamper === true, async () =>
  identifyAndVerify({ nonce: await getNonce() }));

await scenario('valid nonce with forged HMAC', (o) => o.tamper === true, async () =>
  identifyAndVerify({ nonce: await getNonce(), token: 'de'.repeat(32) }));

await scenario('stale collectedAt (10 minutes old)', (o) => o.tamper === true, async () =>
  identifyAndVerify({
    nonce: await getNonce(),
    signals: makeSignals({ meta: { sdkVersion: 'attacker-0.0.1', collectedAt: Date.now() - 600_000, schemaVersion: 1 } }),
  }));

// Replay: a nonce is single-use. Spend it, then present it again.
await scenario('replayed nonce', (o) => o.status === 409, async () => {
  const nonce = await getNonce();
  await identify({ nonce });
  const { status, body } = await identify({ nonce });
  return { status, detail: `HTTP ${status} ${body.error ?? ''}` };
});

console.log('\n  INTEGRITY / TAMPER / REPLAY\n');
for (const r of results) {
  console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name.padEnd(34)} ${r.detail}`);
}
const failed = results.filter((r) => !r.pass).length;
console.log(`\n  ${results.length - failed}/${results.length} detected\n`);
process.exit(failed ? 1 : 0);
