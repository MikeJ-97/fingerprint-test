// Simulator page controller. Every client (desktop browser, phone browser,
// Android/iOS WebView) loads this exact page — the client is the variable
// under test, not the code.
const $ = (id) => document.getElementById(id);
const history = [];

// Loud warning for the trap that silently ruins mobile results: outside a secure
// context navigator.mediaDevices and navigator.permissions are undefined, so the
// SDK records mediaDevices:[] and permissions:{} with no error. Those live inside
// `custom`, which IS hashed into the fingerprint — so the same phone produces a
// DIFFERENT visitorId over http than over https.
function secureContextCheck() {
  if (window.isSecureContext) return null;
  return `INSECURE CONTEXT (${location.protocol}//) — mediaDevices and permissions ` +
         `will be empty, so this visitorId will NOT match the one this device ` +
         `produces over https. Serve this page over https before trusting results.`;
}

function platformLine() {
  const warn = secureContextCheck();
  const bits = [
    navigator.platform || 'unknown platform',
    `${screen.width}x${screen.height}`,
    `touch:${navigator.maxTouchPoints}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ];
  $('platform').textContent = bits.join(' · ');
  if (warn) {
    const el = document.createElement('div');
    el.className = 'flag err';
    el.style.cssText = 'display:block;margin-top:8px;padding:10px;line-height:1.4';
    el.textContent = warn;
    $('platform').after(el);
    console.warn('[sim]', warn);
  }
}

function render(res) {
  $('result').hidden = false;
  $('copy').hidden = false;
  $('flags').innerHTML =
    `<span class="flag ${res.isNewVisitor ? 'new' : 'ret'}">` +
    `${res.isNewVisitor ? 'NEW VISITOR' : 'RETURNING'}</span>`;
  $('vid').textContent = res.visitorId;
  $('rid').textContent = res.requestId;
  const loc = res.ipLocation || {};
  $('meta').innerHTML = [
    ['browser', `${res.browserInfo.name} ${res.browserInfo.version}`],
    ['os', res.browserInfo.os],
    ['ip location', [loc.city, loc.region, loc.country].filter(Boolean).join(', ') || '—'],
    ['linkedId sent', res.__linkedId || '—'],
    ['timestamp', res.timestamp],
  ].map(([k, v]) => `<tr><td>${k}</td><td class="mono">${v}</td></tr>`).join('');

  history.unshift(res);
  $('historyCard').hidden = false;
  $('history').innerHTML = history
    .map((h) => `<tr><td>${h.__linkedId || '—'}</td><td class="mono">${h.requestId}</td></tr>`)
    .join('');
}

function renderError(err) {
  $('result').hidden = false;
  $('flags').innerHTML = '<span class="flag err">FAILED</span>';
  $('vid').textContent = err.message || String(err);
  $('rid').textContent = err.body ? JSON.stringify(err.body) : '—';
  $('meta').innerHTML = '';
}

// Exposed for the Playwright suite so desktop tests drive the real SDK without
// clicking, and get the parsed result back directly.
window.__simRun = async function simRun(linkedId) {
  const opts = linkedId ? { linkedId } : undefined;
  const res = await window.Fingerprint.identify(opts);
  res.__linkedId = linkedId || null;
  window.__last = res;
  render(res);
  return res;
};

async function waitForSdk(timeoutMs = 15000) {
  const started = Date.now();
  while (!window.Fingerprint) {
    if (Date.now() - started > timeoutMs) throw new Error('SDK failed to load from /sdk/v1.js');
    await new Promise((r) => setTimeout(r, 50));
  }
}

(async function boot() {
  platformLine();
  try {
    await waitForSdk();
  } catch (err) {
    $('go').textContent = 'SDK load failed';
    renderError(err);
    return;
  }
  $('go').disabled = false;
  $('go').textContent = 'Identify';

  $('go').addEventListener('click', async () => {
    $('go').disabled = true;
    $('go').textContent = 'Identifying…';
    try {
      await window.__simRun($('user').value);
    } catch (err) {
      console.error('[sim] identify failed', err);
      renderError(err);
    } finally {
      $('go').disabled = false;
      $('go').textContent = 'Identify';
    }
  });

  $('copy').addEventListener('click', async () => {
    const text = $('rid').textContent;
    try {
      await navigator.clipboard.writeText(text);
      $('copy').textContent = 'Copied ✓';
    } catch {
      // Clipboard API needs a secure context too; fall back to selection so the
      // value is still liftable off a phone.
      const r = document.createRange();
      r.selectNodeContents($('rid'));
      getSelection().removeAllRanges();
      getSelection().addRange(r);
      $('copy').textContent = 'Selected — long-press to copy';
    }
    setTimeout(() => ($('copy').textContent = 'Copy requestId'), 2000);
  });
})();
