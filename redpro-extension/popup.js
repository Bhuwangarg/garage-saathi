/* The popup: where things stand, Sync now, and the token. */
const $ = (id) => document.getElementById(id);
const LABELS = { assignments: 'Bus & driver', reviews: 'Reviews', complaints: 'Complaints', services: 'Service list' };
const EVERY = { assignments: 'hourly', reviews: '06:15 · 18:15', complaints: '07:30 · 13:30 · 19:30', services: '05:30' };
const hm = (t) => { const d = new Date(t); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const send = (msg) => new Promise((r) => chrome.runtime.sendMessage(msg, r));

function text(el, s) { el.textContent = s; return el; }

async function render() {
  const st = await send({ type: 'status' });
  if (chrome.runtime.lastError || !st) {
    const p = $('problem'); p.hidden = false;
    text(p, 'The extension is not answering. Open chrome://extensions and click the reload arrow on Mahalaxmi redPro Sync.');
    return;
  }
  const s = st.state || {};
  const p = $('problem');
  p.hidden = !s.problem && st.hasToken;
  text(p, s.problem || (!st.hasToken ? 'Paste the Garage Saathi token under Settings.' : ''));
  if (!st.servicewiseKnown && st.hasToken) {
    $('headline').textContent = 'Tip: open redPro → Ratings & Reviews once, so the service list can be learned.';
  }
  const jobs = $('jobs');
  jobs.replaceChildren();
  for (const k of ['assignments', 'reviews', 'complaints', 'services']) {
    const j = s[k] || {};
    const row = document.createElement('div'); row.className = 'job';
    const name = document.createElement('b'); text(name, LABELS[k]);
    const when = document.createElement('span'); when.className = 'when';
    text(when, `${j.last ? hm(j.last) : 'not yet'} · ${EVERY[k]}`);
    const res = document.createElement('span');
    const failed = j.error && (!j.last || (j.errorAt || 0) > j.last);
    res.className = 'res' + (failed ? ' err' : '');
    text(res, failed ? j.error : (j.result || ''));
    row.append(name, when, res);
    jobs.append(row);
  }
  $('sync').disabled = !!st.running;
  $('sync').textContent = st.running ? 'Syncing…' : 'Sync now';
  const pr = $('progress'); pr.hidden = !st.running; text(pr, st.progress || 'Starting…');
  const { settings = {} } = await chrome.storage.local.get('settings');
  if (document.activeElement !== $('gs')) $('gs').value = settings.gsUrl || st.gsUrl;
  $('settings').open = !st.hasToken;
}

$('sync').addEventListener('click', async () => {
  $('sync').disabled = true; $('sync').textContent = 'Syncing…';
  const r = await send({ type: 'syncNow' });
  if (chrome.runtime.lastError || !r) {
    const p = $('problem'); p.hidden = false;
    text(p, 'The extension did not answer. Open chrome://extensions and click the reload arrow on Mahalaxmi redPro Sync.');
  }
  render();
});

$('save').addEventListener('click', async () => {
  const { settings = {} } = await chrome.storage.local.get('settings');
  const token = $('token').value.trim();
  const gsUrl = $('gs').value.trim().replace(/\/$/, '');
  const next = Object.assign({}, settings, { gsUrl: gsUrl || settings.gsUrl });
  if (token) next.token = token;
  await chrome.storage.local.set({ settings: next });
  $('token').value = '';
  $('saved').textContent = token ? 'Saved.' : 'Saved (token unchanged).';
  render();
});

render();
setInterval(render, 1000);   // follow a running sync
