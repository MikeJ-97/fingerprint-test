// Decision policy: turn a verified event into an action your backend would take.
//
// This is the piece the simulation exists to exercise. Every scenario in the
// suite (multi-account, bots, forged integrity) ends here — the tests assert
// that a given simulated device produces the verdict you intended.
//
// Reference — how the server builds suspectScore (packages/shared/src/scoring.ts):
//   tor           +30   |  vpn / datacenter  +20
//   shared IP     +10 each, capped at 25
//   bot score     scaled from botScore
//   multi-account +10 per extra linkedId, capped at 15
//   tamper        +25
//   buckets: >=60 'high', >=30 'elevated', else 'low'

/** @typedef {{ action: 'allow' | 'review' | 'block', reason: string }} Verdict */

/**
 * @param {object} event  the verified /v1/events/:requestId response
 * @returns {Verdict}
 */
export function decide(event) {
  const t = event.threatIntel;

  // 1. Automation blocks outright. Unlike every other signal here, a declared
  //    `webdriver` or a bot-classified device is not a judgement call about a
  //    human's behaviour — it is a statement that no human is present. Nothing
  //    downstream benefits from routing that to a human reviewer.
  if (t.botClassification === 'automated' || event.deviceType === 'bot') {
    return { action: 'block', reason: `automation detected (${t.botClassification ?? 'bot UA'})` };
  }

  // 2. Tamper does NOT block on its own — deliberately.
  //    tamperSuspected fires on any request that failed the integrity handshake,
  //    which includes a legitimate user whose nonce expired on a slow mobile
  //    connection or whose clock drifted past the 120s freshness window. It is
  //    strong evidence, not proof, so it earns a human look rather than a
  //    refusal. This is the single most consequential choice in this file:
  //    blocking here is safer against forgery and directly costs real logins.
  if (t.tamperSuspected) {
    return { action: 'review', reason: 'integrity check failed — possible forged client' };
  }

  // 3. High composite score blocks. Reaching 60 requires several independent
  //    signals to agree (e.g. Tor + shared IP + bot score); no single component
  //    can get there alone, which is what makes it safe to act on automatically.
  if (t.suspectScore >= 60) {
    return { action: 'block', reason: `suspect score ${String(t.suspectScore)} (high)` };
  }

  // 4. Multi-account is reviewed, never blocked. It caps at +15, so it can
  //    never reach 'high' by itself — and that is correct: shared devices are
  //    genuinely common (families, offices, hot-desks). Blocking here would
  //    punish ordinary users to catch a minority. Checked before the generic
  //    'elevated' branch so the reason names the real cause.
  if (t.linkedId !== null && t.suspectScore >= 30) {
    return { action: 'review', reason: `elevated score ${String(t.suspectScore)} on a linked account` };
  }

  if (t.suspectScore >= 30) {
    return { action: 'review', reason: `suspect score ${String(t.suspectScore)} (elevated)` };
  }

  return { action: 'allow', reason: `suspect score ${String(t.suspectScore)} (low)` };
}

/**
 * Convenience for the suites: assert an event lands on an expected action.
 * Returns the verdict so a caller can also inspect the reason.
 * @param {object} event
 * @param {'allow' | 'review' | 'block'} expected
 * @returns {Verdict}
 */
export function expectAction(event, expected) {
  const verdict = decide(event);
  if (verdict.action !== expected) {
    throw new Error(
      `expected "${expected}" but policy returned "${verdict.action}" (${verdict.reason})`,
    );
  }
  return verdict;
}
