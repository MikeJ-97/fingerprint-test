// Run: node --test verify/policy.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide } from './policy.mjs';

const ev = (threatIntel, deviceType = 'desktop') => ({
  deviceType,
  threatIntel: {
    linkedId: null, tamperSuspected: false, botClassification: 'clean',
    isTor: false, isVpn: false, isDatacenter: false, botScore: 0,
    suspectScore: 0, ...threatIntel,
  },
});

test('a clean device is allowed', () => {
  assert.equal(decide(ev({ suspectScore: 8 })).action, 'allow');
});

test('automation blocks, because no human is present to review for', () => {
  assert.equal(decide(ev({ botClassification: 'automated', suspectScore: 53 })).action, 'block');
  assert.equal(decide(ev({}, 'bot')).action, 'block');
});

test('tamper reviews rather than blocks — an expired nonce is not proof of forgery', () => {
  // The costly failure this encodes: a real user on a slow connection whose
  // nonce expired must not be locked out of their own account.
  assert.equal(decide(ev({ tamperSuspected: true, suspectScore: 35 })).action, 'review');
});

test('a high composite score blocks, since no single signal can reach 60 alone', () => {
  assert.equal(decide(ev({ suspectScore: 60, isTor: true })).action, 'block');
});

test('multi-account reviews and names itself, never blocks', () => {
  // Shared devices are ordinary. Blocking would punish families and offices to
  // catch a minority, and the +15 cap means this can never reach 'high' anyway.
  const v = decide(ev({ linkedId: 'user_9930', suspectScore: 35 }));
  assert.equal(v.action, 'review');
  assert.match(v.reason, /linked account/);
});

test('automation outranks tamper when both fire', () => {
  const v = decide(ev({ botClassification: 'automated', tamperSuspected: true, suspectScore: 78 }));
  assert.equal(v.action, 'block');
});
