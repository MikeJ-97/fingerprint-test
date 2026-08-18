# Mobile simulation clients

A WebView wrapper around the same page every other client loads
(`https://fingerprint-admin.maxwinvault.xyz/sim/`).

**Why a WebView and not a native client:** the fingerprint SDK reads canvas,
WebGL, audio and `navigator`. Those APIs exist only in a web engine — a Swift or
Kotlin client would have nothing to measure. The app therefore adds the *install
experience*, not a different fingerprint. What it does give you that a phone
browser does not: a real WebView engine, app-scoped storage, and the exact
distribution path a customer's app would use.

Loading the page from local assets (`file://`) is not an option — that sends
`Origin: null`, which `apps/ingest/src/middleware/origin.ts` cannot parse, so
every identify would 403.

## Cleartext HTTP exceptions — remove these once the page is on HTTPS

`app.json` sets `android.usesCleartextTraffic` and iOS `NSAllowsArbitraryLoads`.
Both are **only** there because the deployed page is currently served over plain
HTTP from a Coolify `sslip.io` domain; without them Android and iOS refuse the
connection outright and the WebView shows nothing.

They are a workaround, not a design choice, and they carry a real cost beyond
the security flags: an HTTP page is not a secure context, so
`navigator.mediaDevices` and `navigator.permissions` are undefined, the SDK
records them empty, and — because both are hashed into the fingerprint — **the
visitorId this app produces will not match what the same device produces in
production over HTTPS.** Fingerprint *stability* can be tested through it;
fingerprint *accuracy* cannot.

Delete both flags the moment the page has an HTTPS domain.

## Android — buildable from Windows today

```bash
cd mobile
npm install
npm install -g eas-cli && eas login       # free Expo account
npm run build:android                     # → .apk download link
```

Install: transfer the `.apk` to the phone, allow "install unknown apps", open.

## iOS — needs an Apple Developer account (~$99/yr)

Cannot be compiled on Windows; EAS compiles it on their Macs.

```bash
eas device:create      # register the iPhone's UDID (one time)
npm run build:ios      # → .ipa, ~10 min
```

Install the `.ipa`, then on the phone:
**Settings → General → VPN & Device Management → Trust the developer**.

## Verifying a run

The app has no secret key and cannot verify itself — by design. Tap **Identify**,
tap **Copy requestId**, then on your PC:

```bash
npm run verify -- r_xxxxxxxx
```
