# fpclone simulation harness

Multi-platform clients that exercise the deployed fpclone API
(`https://fingerprint-api.maxwinvault.xyz`) against a dedicated `simulation`
tenant.

Every client loads the **same page**, served by the dashboard at
`https://fingerprint-admin.maxwinvault.xyz/sim/`, with the **real SDK** from
`/sdk/v1.js`. The client is the variable under test — the code is not.

The page itself lives in the product repo at `apps/dashboard/public/sim/` so it
is served over HTTPS on an existing certificate. There is deliberately no second
local copy: two copies drift, and the desktop suite must exercise the exact
artifact the phones load.

## Setup

```bash
npm install
npx playwright install            # chromium is installed; add firefox + webkit
```

Keys live in `.env` (gitignored). The **secret key never leaves this machine** —
it is used only by `verify/` and `attacker/`, never by `page/` or `mobile/`.

## Commands

| Command | What it does |
|---|---|
| `npm run smoke` | End-to-end check with no browser: identify + verify. Run this first. |
| `npm run verify -- r_xxx` | Server-side lookup of one requestId. Use for phone runs. |
| `npm run test:desktop` | Playwright suite (chromium / firefox / webkit). |
| `cd mobile && npm run build:android` | Builds the installable `.apk` via EAS. |
| `cd mobile && npm run build:ios` | Builds the `.ipa` via EAS (needs an Apple account). |
| `node --env-file=.env attacker/forge.mjs` | Integrity, tamper and replay scenarios. |
| `node --env-file=.env attacker/bot.mjs` | Bot and automation scenarios. |

## Testing from a phone

1. Open `FPCLONE_PAGE_URL` on the device — or install the app from `mobile/`.
2. Pick a user, tap **Identify**.
3. Tap **Copy requestId**, then on this machine run `npm run verify -- <id>`.

The page warns loudly if it is not on `https`. That is not cosmetic: outside a
secure context `navigator.mediaDevices` and `navigator.permissions` are
undefined, the SDK records them as empty, and since they are hashed into the
fingerprint the device produces a **different visitorId than it would in
production**.

## Things learned the hard way (do not undo these)

- **Assert deltas, never absolute scores.** The harness runs against the live
  database; a visitor carries state from every previous run, and every client
  here shares one IP so a shared-IP penalty is always present.
- **`distinctLinkedIds` never resets.** The multi-account curve (+10, +5, 0) is
  observable exactly once per visitor, so that test mints a fresh synthetic
  device each run. A real browser cannot supply a virgin visitor.
- **`verify/cli.mjs` guards its CLI block** on being the entrypoint. Without it
  the block runs on import and a Playwright worker's argv is read as a
  requestId.

## Known gaps found by this harness

Observed on the live deployment, not yet fixed in the product:

- `HeadlessChrome`, `curl/8.4.0`, and a **missing User-Agent** all classify as
  `desktop` / `clean`, botScore 0. Only the UA-parser's bot list, the
  `webdriver` flag, and CreepJS `lieScore` currently move botScore.
- GeoIP and ASN enrichment return null (`country`, `region`, `city`, `asn` all
  empty) for real public IPs — the `cron` worker's shared volume looks
  unpopulated on the deployment.
