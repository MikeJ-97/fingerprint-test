// Decision policy: turn a verified event into an action your backend would take.
//
// This is the piece the simulation exists to exercise. Every scenario in the
// suite (multi-account, bots, forged integrity) ends here — the test asserts
// that a given simulated device produces the verdict you intended.
//
// Reference — how the server builds suspectScore (packages/shared/src/scoring.ts):
//   tor           +30   |  vpn / datacenter  +20
//   shared IP     +10 each, capped at 25
//   bot score     scaled from botScore
//   multi-account +10 per extra linkedId, capped at 15
//   tamper        +25
//   buckets: >=60 'high', >=30 'elevated', else 'low'
//
// Signals available on `event`:
//   event.threatIntel.suspectScore     number 0-100
//   event.threatIntel.tamperSuspected  boolean
//   event.threatIntel.botClassification 'clean' | ... | null
//   event.threatIntel.isTor / isVpn / isDatacenter   boolean | null
//   event.threatIntel.linkedId         string | null
//   event.deviceType                   'desktop' | 'mobile' | 'tablet' | 'bot' | null

/**
 * @param {object} event  the verified /v1/events/:requestId response
 * @returns {{ action: 'allow' | 'review' | 'block', reason: string }}
 */
export function decide(event) {
  // TODO(you): implement the policy.
  //
  // Things worth deciding, because they have real trade-offs:
  //   - Is tamperSuspected alone enough to block? It fires on any non-SDK
  //     client — including a legitimate one whose nonce expired on a slow
  //     network. Blocking is safe but costs real users.
  //   - Does a 'high' bucket (>=60) block, or only queue for review?
  //   - Should a bot classification block outright, or does your product
  //     have legitimate bot traffic (uptime monitors, previews) to allow?
  //   - Multi-account maxes out at +15 — never enough to reach 'high' on its
  //     own. Do you want to escalate it separately?
  throw new Error('policy not implemented');
}
