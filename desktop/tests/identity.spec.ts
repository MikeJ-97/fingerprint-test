import { test, expect } from '@playwright/test';
import { verify } from '../../verify/cli.mjs';

const PAGE_URL = process.env.FPCLONE_PAGE_URL as string;

// WHY these assertions matter: the entire product promise is "same device ->
// same visitorId, without cookies". A test that only checked "a visitorId came
// back" would pass even if the server minted a fresh id on every request, which
// is the exact failure that makes the product worthless.

async function identify(page, linkedId: string | null = null) {
  await page.goto(PAGE_URL);
  await page.waitForFunction(() => typeof (window as any).__simRun === 'function');
  return page.evaluate((id) => (window as any).__simRun(id), linkedId);
}

test('the same browser gets the same visitorId across a full reload', async ({ page }) => {
  const first = await identify(page);
  const second = await identify(page);

  expect(second.visitorId).toBe(first.visitorId);
  expect(second.requestId).not.toBe(first.requestId); // each call is its own event
  expect(second.isNewVisitor).toBe(false); // only the first sighting is "new"
});

test('a fresh incognito context still resolves to the same device', async ({ browser }) => {
  // No shared cookies or storage between contexts — if the id survives this,
  // it is genuinely derived from device signals and not from stored state.
  const a = await browser.newContext();
  const b = await browser.newContext();
  const first = await identify(await a.newPage());
  const second = await identify(await b.newPage());
  await a.close();
  await b.close();

  expect(second.visitorId).toBe(first.visitorId);
});

test('the browser-reported visitorId matches what the server will attest to', async ({ page }) => {
  // Guards the rule in docs/INTEGRATION.md:25 — the browser value must never be
  // trusted, so it has to agree with the secret-key lookup or the SDK is lying.
  const res = await identify(page, 'user_4821');
  const event = await verify(res.requestId);

  expect(event.visitorId).toBe(res.visitorId);
  expect(event.threatIntel.linkedId).toBe('user_4821');
  expect(event.isVerified).toBe(true);
});

test('the real SDK passes the integrity check', async ({ page }) => {
  // The raw smoke script trips tamperSuspected (no nonce, no HMAC). The genuine
  // bundle performs the /v1/challenge handshake, so a clean run proves the
  // deployed SDK secret and the ingest secret actually match.
  const res = await identify(page);
  const event = await verify(res.requestId);

  expect(event.threatIntel.tamperSuspected).toBe(false);
});
