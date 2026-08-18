import { defineConfig, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Playwright's CLI can't take node's --env-file, so load .env here. Keeps the
// secret key out of the specs and out of any committed config.
for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

if (!process.env.FPCLONE_PAGE_URL) {
  throw new Error('FPCLONE_PAGE_URL is not set in .env — nothing to test against.');
}

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  // Serial: identify is rate-limited per public key, and the multi-account
  // assertions read a per-visitor counter that concurrent runs would race.
  workers: 1,
  // No local server. Every client — desktop, phone browser, Android and iOS
  // WebView — loads the SAME deployed page, so the desktop suite tests that
  // exact artifact rather than a local copy that could drift from it.
  use: { baseURL: process.env.FPCLONE_PAGE_URL },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
