// Automation / bot scenarios. Each varies ONE thing against the same device so
// the resulting botScore change is attributable.
import { identify, makeSignals, UA_CHROME } from './device.mjs';
import { verify } from '../verify/cli.mjs';

const UA_HEADLESS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/130.0.0.0 Safari/537.36';
const UA_CURL = 'curl/8.4.0';
const UA_GOOGLEBOT =
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

const cases = [
  { name: 'honest desktop Chrome (control)', ua: UA_CHROME },
  { name: 'webdriver flag set', ua: UA_CHROME, webdriver: true },
  { name: 'HeadlessChrome user-agent', ua: UA_HEADLESS },
  { name: 'curl user-agent', ua: UA_CURL },
  { name: 'Googlebot user-agent', ua: UA_GOOGLEBOT },
  { name: 'no User-Agent header at all', ua: null },
  { name: 'self-declared liar (lieScore 80)', ua: UA_CHROME, lieScore: 80 },
];

console.log('\n  BOTS / AUTOMATION\n');
console.log(`  ${'scenario'.padEnd(34)} ${'device'.padEnd(9)} ${'bot'.padEnd(5)} class      score`);

for (const c of cases) {
  const signals = makeSignals({
    automation: { webdriver: c.webdriver ?? false },
    creep: { fingerprint: 'atk-creep', lieScore: c.lieScore ?? 0, lies: [], trustScore: 100 },
  });
  const { status, body } = await identify({ signals, ua: c.ua });
  if (status !== 200) {
    console.log(`  ${c.name.padEnd(34)} HTTP ${status} ${body.error ?? ''}`);
    continue;
  }
  const e = await verify(body.requestId);
  const t = e.threatIntel;
  console.log(
    `  ${c.name.padEnd(34)} ${String(e.deviceType ?? '—').padEnd(9)} ` +
    `${String(t.botScore ?? '—').padEnd(5)} ${String(t.botClassification ?? '—').padEnd(10)} ${t.suspectScore}`,
  );
}
console.log('');
