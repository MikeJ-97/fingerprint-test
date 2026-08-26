// Test console. Every suite runs on the server; this file only asks for runs
// and renders what comes back. Nothing here ever sees the secret key.
const $ = (id) => document.getElementById(id);

async function api(path, options) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

function show(el, visible) {
  el.classList.toggle('hidden', !visible);
}

// ---------- suites ----------

function suiteCard(suite) {
  const card = document.createElement('div');
  card.className = 'card';
  // Skeleton only — no interpolation. Every value is written with textContent
  // below, so nothing that later becomes dynamic can inject markup.
  card.innerHTML = `
    <div class="suite">
      <div>
        <div class="suite__name" data-role="name"></div>
        <div class="suite__blurb" data-role="blurb"></div>
      </div>
      <div class="row">
        <span class="pill hidden" data-role="status"></span>
        <button class="ghost" type="button" data-role="run">Run</button>
      </div>
    </div>
    <pre class="hidden" data-role="out"></pre>`;
  card.querySelector('[data-role="name"]').textContent = suite.label;
  card.querySelector('[data-role="blurb"]').textContent = suite.blurb;

  const status = card.querySelector('[data-role="status"]');
  const out = card.querySelector('[data-role="out"]');
  const btn = card.querySelector('[data-role="run"]');

  async function run() {
    btn.disabled = true;
    status.className = 'pill pill--run';
    status.textContent = 'running';
    show(status, true);
    show(out, false);

    const { status: code, body } = await api(`/api/run/${suite.key}`, { method: 'POST' });

    if (code === 401) {
      // The session expired mid-use. Say so rather than reporting the suite
      // itself as failed, which would send you debugging the wrong thing.
      status.className = 'pill pill--bad';
      status.textContent = 'signed out';
      out.textContent = 'Your session expired. Reload the page and sign in again.';
      show(out, true);
      btn.disabled = false;
      return false;
    }

    const ok = body.ok === true;
    status.className = `pill ${ok ? 'pill--ok' : 'pill--bad'}`;
    status.textContent = `${ok ? 'passed' : 'failed'} · ${Math.round((body.durationMs ?? 0) / 100) / 10}s`;
    out.textContent = body.output ?? '(no output)';
    show(out, true);
    btn.disabled = false;
    return ok;
  }

  btn.addEventListener('click', () => void run());
  return { card, run };
}

let runners = [];

function renderSuites(suites) {
  const host = $('suites');
  host.textContent = '';
  runners = suites.map((s) => {
    const r = suiteCard(s);
    host.appendChild(r.card);
    return r;
  });
}

// ---------- downloads ----------

function renderDownloads(files) {
  const host = $('downloads');
  host.textContent = '';

  for (const f of files) {
    const card = document.createElement('div');
    card.className = 'card';
    // Built with DOM methods rather than a template string. The filenames are
    // server-side constants today, but this is precisely the function someone
    // would later change to read the directory — at which point a template
    // string would become an injection point. Removing the trap is cheaper
    // than remembering not to fall into it.
    const row = document.createElement('div');
    row.className = 'suite';

    const text = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'suite__name';
    name.textContent = f.label;
    const blurb = document.createElement('div');
    blurb.className = 'suite__blurb';
    text.append(name, blurb);

    if (f.available) {
      const mb = Math.round((f.bytes / 1024 / 1024) * 10) / 10;
      blurb.textContent = f.builtAt ? `${String(mb)} MB · built ${f.builtAt}` : `${String(mb)} MB`;

      const link = document.createElement('a');
      // href comes from the server: a local path when the file is hosted here,
      // or the EAS CDN URL when it is linked rather than committed.
      link.href = f.href;
      if (f.href.startsWith('/')) link.setAttribute('download', '');
      else link.rel = 'noopener';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Download';
      link.appendChild(btn);
      row.append(text, link);
    } else {
      // Explaining WHY it is missing matters more than hiding it: the build
      // needs an account only the operator can create.
      blurb.textContent =
        f.platform === 'Android'
          ? 'Not built yet. Run `cd mobile && npm run build:android` (needs a free Expo account), put the .apk in downloads/ and redeploy.'
          : 'Not built yet. Run `cd mobile && npm run build:ios` (needs an Apple Developer account), put the .ipa in downloads/ and redeploy.';

      const pill = document.createElement('span');
      pill.className = 'pill pill--bad';
      pill.textContent = 'missing';
      row.append(text, pill);
    }

    card.appendChild(row);
    host.appendChild(card);
  }
}

// ---------- boot ----------

async function refresh() {
  const { body } = await api('/api/session');
  show($('login'), !body.authed);
  show($('app'), body.authed === true);
  if (body.authed) {
    renderSuites(body.suites ?? []);
    const dl = await api('/api/downloads');
    renderDownloads(dl.body.files ?? []);
  }
}

$('loginBtn').addEventListener('click', () => {
  void (async () => {
    const err = $('loginErr');
    show(err, false);
    const { status } = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ password: $('password').value }),
    });
    if (status === 200) {
      $('password').value = '';
      await refresh();
    } else {
      err.textContent = status === 401 ? 'Wrong password.' : 'Could not sign in.';
      show(err, true);
    }
  })();
});

$('password').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('loginBtn').click();
});

$('runAll').addEventListener('click', () => {
  void (async () => {
    $('runAll').disabled = true;
    // Sequential, not parallel: these hit rate-limited endpoints, and running
    // them at once would make a 429 look like a failing suite.
    for (const r of runners) await r.run();
    $('runAll').disabled = false;
  })();
});

void refresh();
