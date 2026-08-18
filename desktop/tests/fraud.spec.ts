import { test, expect } from '@playwright/test';
import { verify } from '../../verify/cli.mjs';

const PAGE_URL = process.env.FPCLONE_PAGE_URL as string;
import { identify, makeSignals } from '../../attacker/device.mjs';

// WHY: multi-account-on-one-device is the headline fraud signal, scored as
// min(max(distinctLinkedIds - 1, 0) * 10, 15).
//
// Two constraints shaped these tests, both learned by watching them fail:
//   1. The harness runs against the LIVE database, so assert deltas, never
//      absolute scores — a visitor carries every prior run's state.
//   2. distinctLinkedIds is cumulative per visitor and never resets, so the
//      +10/+5/0 shape is observable exactly ONCE per device. A real browser
//      cannot supply a virgin visitor, so that assertion uses a synthetic
//      device whose fingerprint we mint fresh for each run.

test('a virgin device shows the full multi-account curve, then caps', async () => {
  const run = String(Date.now());
  // Unique thumbmark => a visitor that has never been seen, every run.
  const device = makeSignals({
    thumbmark: {
      thumbmark: `curve-${run}`,
      components: { canvas: `canvas-${run}`, audio: `audio-${run}` },
      version: '0.20.0',
    },
  });

  const scoreFor = async (linkedId: string) => {
    const { status, body } = await identify({ signals: device, linkedId });
    expect(status).toBe(200);
    return (await verify(body.requestId)).threatIntel.suspectScore;
  };

  const one = await scoreFor('acct_1');
  const two = await scoreFor('acct_2');
  const three = await scoreFor('acct_3');
  const four = await scoreFor('acct_4');

  expect(two - one).toBe(10); // second account on one device
  expect(three - two).toBe(5); // third — the +15 cap bites here
  expect(four - three).toBe(0); // fourth adds nothing; capped
});

test('a real browser round-trips linkedId to the verified event', async ({ page }) => {
  // The browser-specific half: whatever the page passes to identify() must come
  // back on the secret-key lookup, or the linking feature is silently broken.
  await page.goto(PAGE_URL);
  await page.waitForFunction(() => typeof (window as any).__simRun === 'function');

  const linkedId = `browser_${Date.now()}`;
  const res = await page.evaluate((id) => (window as any).__simRun(id), linkedId);
  const event = await verify(res.requestId);

  expect(event.threatIntel.linkedId).toBe(linkedId);
  expect(event.visitorId).toBe(res.visitorId);
});

test('genuinely different device signals produce different visitors', async () => {
  // The counterpart to the identity suite: that proves one device stays one
  // visitor, this proves two devices do not collapse into one.
  const run = Date.now();
  const mk = (tag: string) =>
    makeSignals({
      thumbmark: { thumbmark: `sep-${tag}-${run}`, components: { canvas: `c-${tag}-${run}` }, version: '0.20.0' },
    });

  const a = await identify({ signals: mk('A'), linkedId: 'user_solo' });
  const b = await identify({ signals: mk('B'), linkedId: 'user_solo' });

  expect(a.status).toBe(200);
  expect(b.status).toBe(200);
  expect(b.body.visitorId).not.toBe(a.body.visitorId);
});
