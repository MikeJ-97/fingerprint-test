# fpclone simulation harness

Multi-platform clients that exercise the deployed fpclone API
(`https://fingerprint-api.maxwinvault.xyz`) against a dedicated `simulation`
tenant.

Every client loads the **same page** — `page/index.html`, deployed as its own
Coolify resource — which pulls the **real SDK** from the dashboard's
`/sdk/v1.js`. The client is the variable under test; the code is not.

The page is deployed rather than served locally so that phones, the Android APK
and the iOS app all load the identical artifact the desktop suite tests. It is served over HTTPS at
`https://fingerprint-sim.maxwinvault.xyz/` — a secure context, which the
fingerprint depends on.

**It must be served over HTTPS.** Outside a secure context
`navigator.mediaDevices` and `navigator.permissions` are undefined, the SDK
records them empty, and because they are hashed into the fingerprint the same
device yields a different `visitorId` than it would in production. The page
warns on screen when this is wrong.

## Setup

```bash
npm install
npx playwright install            # chromium is installed; add firefox + webkit
```

Keys live in `.env` (gitignored). The **secret key never leaves this machine** —
it is used only by `verify/` and `attacker/`, never by `page/` or `mobile/`.

## Commands

| Command | What it does | What it proves |
|---|---|---|
| `npm run smoke` | One identify + one server-side verify, no browser | The key, origin and endpoint all work |
| `npm run bots` | Seven client shapes: headless, curl, Googlebot, no UA, webdriver, liar | Automation is scored, honest browsers are not |
| `npm run forge` | Five forgery attempts: no nonce, replayed nonce, bad HMAC, stale clock | The integrity layer notices |
| `npm run test:desktop` | Playwright: identity stability, multi-account curve | Same device stays one visitor; different devices do not merge |
| `npm run test:policy` | Unit tests for `verify/policy.mjs` | Your allow/review/block rules behave as intended |
| `npm run verify -- r_xxx` | Look up one requestId with the secret key | Used for phone runs, where the browser cannot verify itself |
| `npm run serve` | Serves `page/` locally on :3000 | Same code the deployed container runs |

## Test console (web UI)

`/console` on the deployed host runs the suites server-side and shows the
output, so they can be run by clicking instead of typing. The suites need the
SECRET key, which is why they run on the server — the browser only ever sees
their output.

It is **password-gated and fails closed**: with `TEST_CONSOLE_PASSWORD` unset
the console 404s entirely. Its output contains real event data (visitor ids,
IPs, locations), so an open one would be worse than the terminal it replaces.

Container environment:

| Variable | Purpose |
|---|---|
| `TEST_CONSOLE_PASSWORD` | Enables the console. Unset = disabled. |
| `FPCLONE_API_URL` | Which deployment the suites hit |
| `FPCLONE_PUBLIC_KEY` | Safe to expose |
| `FPCLONE_SECRET_KEY` | Server-side only, never sent to the browser |

The Playwright suite is **not** available there — no browsers are installed in
the image, and adding them costs about a gigabyte. Run it locally.

## Deployment

`page/` is deployed by Coolify from this repo's `Dockerfile` (project **UAT
Deployment**, environment **fingerprint-test**). The image contains only the
page and a dependency-free static server; `/healthz` is the container health
check.

The deployed origin must be listed in the `sim-clients` API key's **allowed
origins**, or every identify returns 403 `origin_not_allowed`.

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
