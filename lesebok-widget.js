// Lesebok · dagens sitat
// Widget for Scriptable-appen på iPhone.
// Leser den nyeste sikkerhetskopien fra Leseboka (lesebok-….json) i iCloud Drive → Scriptable,
// og viser et nytt sitat hver dag. Skriv «favoritter» som parameter for å bare vise favoritter.

const APP_URL = '__APP_URL__';
const C = {
  paper: new Color('#f3e7d3'),
  ink: new Color('#2f241b'),
  muted: new Color('#8c7660'),
  accent: new Color('#c06a3e'),
};
const SIZE = {
  small: { quote: 13, title: 10.5, author: 9.5, lines: 6, max: 130 },
  medium: { quote: 15, title: 11.5, author: 10.5, lines: 5, max: 230 },
  large: { quote: 18, title: 13, author: 12, lines: 15, max: 650 },
  extraLarge: { quote: 18, title: 13, author: 12, lines: 15, max: 650 },
};

const family = config.widgetFamily || 'medium';
const S = SIZE[family] || SIZE.medium;
const onlyFavs = /favoritt/i.test(args.widgetParameter || '');

// Leter i både iCloud Drive → Scriptable og På min iPhone → Scriptable, og bruker den nyeste fila.
async function loadBackup() {
  const found = [];
  const places = [];
  try { places.push(FileManager.iCloud()); } catch (e) { /* iCloud er av */ }
  places.push(FileManager.local());
  for (const fm of places) {
    let dir;
    try { dir = fm.documentsDirectory(); } catch (e) { continue; }
    let names = [];
    try { names = fm.listContents(dir); } catch (e) { continue; }
    names.filter((n) => /^lesebok.*\.json$/i.test(n)).forEach((n) => {
      const path = fm.joinPath(dir, n);
      found.push({ fm, path, date: fm.modificationDate(path) || new Date(0) });
    });
  }
  if (!found.length) return null;
  found.sort((a, b) => b.date - a.date);
  const { fm, path } = found[0];
  if (fm.isFileDownloaded && !fm.isFileDownloaded(path)) await fm.downloadFileFromiCloud(path);
  const data = JSON.parse(fm.readString(path));
  if (!data || data.source !== 'lesebok-backup') return null;
  return data;
}

// Dagens dato som tall (lokal tid), brukt til å velge dagens sitat.
const todayNum = () => { const n = new Date(); return Math.floor(new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime() / 86400000); };

// Sitatet du har valgt med «Et annet sitat» huskes resten av dagen.
const CHOSEN_KEY = 'lesebok-valgt-sitat';
function chosenToday() {
  try {
    if (!Keychain.contains(CHOSEN_KEY)) return null;
    const c = JSON.parse(Keychain.get(CHOSEN_KEY));
    return c && c.day === todayNum() ? c.id : null;
  } catch (e) { return null; }
}
function rememberChoice(id) {
  try { Keychain.set(CHOSEN_KEY, JSON.stringify({ day: todayNum(), id })); } catch (e) { /* ignorer */ }
}

// Samme sitat hele dagen, nytt sitat neste dag (eller det du har valgt selv i dag).
function pickForToday(data) {
  let list = (data.highlights || []).filter((h) => h && h.text && h.kind !== 'note');
  const favs = data.favorites || {};
  if (onlyFavs) {
    const f = list.filter((h) => favs[h.id]);
    if (f.length) list = f;
  }
  if (!list.length) return null;
  const chosen = chosenToday();
  const picked = chosen && list.find((h) => h.id === chosen);
  if (picked) return picked;
  list.sort((a, b) => (a.id < b.id ? -1 : 1));
  return list[((todayNum() * 2654435761) >>> 0) % list.length];
}

const clean = (t) => String(t).replace(/^[\s“”"«»„]+|[\s“”"«»]+$/g, '');

function message(w, text) {
  const t = w.addText(text);
  t.font = new Font('Georgia', 13);
  t.textColor = C.ink;
  t.minimumScaleFactor = 0.6;
}

const w = new ListWidget();
w.backgroundColor = C.paper;
w.setPadding(16, 18, 14, 18);
// Trykk på widgeten åpner Scriptable, som viser hele sitatet på et papirkort (se nederst).

let data = null;
let h = null;
try {
  data = await loadBackup();
  h = data && pickForToday(data);
  if (!data) {
    message(w, 'Lagre en sikkerhetskopi fra Leseboka i mappen Scriptable (i iCloud Drive eller På min iPhone), så dukker dagens sitat opp her.');
  } else if (!h) {
    message(w, onlyFavs ? 'Ingen favoritter ennå. Lagre noen i Leseboka, og ta en ny sikkerhetskopi.' : 'Fant ingen highlights i sikkerhetskopien.');
  } else {
    const mark = w.addText('“');
    mark.font = new Font('Georgia-Bold', S.quote * 1.5);
    mark.textColor = C.accent;
    mark.lineLimit = 1;

    const q = w.addText(clean(h.text) + '”');
    q.font = new Font('Georgia', S.quote);
    q.textColor = C.ink;
    q.lineLimit = S.lines;
    q.minimumScaleFactor = 0.65;

    w.addSpacer();

    const title = w.addText(h.book || '');
    title.font = new Font('Georgia-Italic', S.title);
    title.textColor = C.ink;
    title.lineLimit = 1;
    title.minimumScaleFactor = 0.8;
    if (h.author && family !== 'small') {
      const a = w.addText(h.author);
      a.font = new Font('Georgia', S.author);
      a.textColor = C.muted;
      a.lineLimit = 1;
    }
  }
} catch (e) {
  message(w, 'Kunne ikke lese sikkerhetskopien: ' + e.message);
}

// Oppdater ofte (iPhone bestemmer selv nøyaktig når), så et nytt valg vises raskt og nytt sitat kommer ved midnatt.
const soon = new Date(Date.now() + 10 * 60 * 1000);
const midnight = new Date();
midnight.setHours(24, 0, 30, 0);
w.refreshAfterDate = soon < midnight ? soon : midnight;

if (config.runsInWidget) {
  Script.setWidget(w);
} else {
  // Trykk på widgeten (eller kjøring i appen): vis hele sitatet på et papirkort.
  await showCard(data, h);
}
Script.complete();

function pool(d) {
  let list = ((d && d.highlights) || []).filter((x) => x && x.text && x.kind !== 'note');
  const favs = (d && d.favorites) || {};
  if (onlyFavs) { const f = list.filter((x) => favs[x.id]); if (f.length) list = f; }
  return list.map((x) => ({ id: x.id, t: clean(x.text), b: x.book || '', a: x.author || '' }));
}

async function showCard(d, today) {
  const all = pool(d);
  const first = today ? { id: today.id, t: clean(today.text), b: today.book || '', a: today.author || '' } : null;
  const json = JSON.stringify({ first, all }).replace(/</g, '\\u003c');
  const html = `<!doctype html><html lang="no"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>
  html,body{margin:0;height:100%;background:#2a1f18;color:#2f241b;font-family:Georgia,serif;-webkit-text-size-adjust:100%}
  body{display:flex;flex-direction:column;justify-content:center;padding:calc(env(safe-area-inset-top) + 28px) 26px calc(env(safe-area-inset-bottom) + 28px);box-sizing:border-box}
  .stack{position:relative;max-width:560px;width:100%;margin:0 auto}
  .stack::before{content:"";position:absolute;inset:0;border-radius:20px;background:#e3d1b6;transform:rotate(-2.2deg) translate(-4px,10px);box-shadow:0 14px 30px -12px rgba(0,0,0,.6)}
  .card{position:relative;background:#f3e7d3;border-radius:20px;padding:30px 26px 24px;box-shadow:0 1px 2px rgba(0,0,0,.3),0 20px 40px -16px rgba(0,0,0,.6)}
  .mark{color:#c06a3e;font-size:56px;line-height:.6;height:26px}
  .q{font-size:22px;line-height:1.42;margin:0 0 26px;white-space:pre-wrap}
  .b{font-style:italic;font-size:17px;padding-top:16px;border-top:1px dashed rgba(90,60,30,.25)}
  .a{color:#8c7660;font-size:15px;margin-top:3px}
  .lbl{color:#ad987f;font-style:italic;font-size:15px;text-align:center;margin:0 0 14px}
  button{display:block;margin:26px auto 0;font:500 17px Georgia,serif;color:#2f241b;background:#f3e7d3;border:0;border-radius:999px;padding:14px 26px;box-shadow:0 10px 22px -10px rgba(0,0,0,.6)}
  .empty{color:#f2e6d4;text-align:center;font-size:18px;line-height:1.5}
</style></head><body>
<p class="lbl" id="lbl">Dagens sitat</p>
<div class="stack" id="stack"><div class="card"><div class="mark">“</div><p class="q" id="q"></p><div class="b" id="b"></div><div class="a" id="a"></div></div></div>
<button id="next" type="button">Et annet sitat</button>
<script>
  const D = ${json};
  const set = (x) => { document.getElementById('q').textContent = x.t + '”'; document.getElementById('b').textContent = x.b; document.getElementById('a').textContent = x.a; };
  if (D.first) set(D.first);
  else { document.body.innerHTML = '<p class="empty">Fant ingen sitater. Lagre en sikkerhetskopi fra Leseboka i mappen Scriptable.</p>'; }
  let last = -1;
  document.getElementById('next').onclick = () => {
    if (D.all.length < 2) return;
    let i; do { i = Math.floor(Math.random() * D.all.length); } while (i === last);
    last = i; set(D.all[i]); document.getElementById('lbl').textContent = 'Dagens sitat (valgt av deg)';
    location.href = 'lesebok://valgt/' + encodeURIComponent(D.all[i].id);
  };
</script></body></html>`;
  const wv = new WebView();
  // Når du bytter sitat, sender kortet en «lesebok://valgt/…»-adresse som vi fanger opp og husker.
  wv.shouldAllowRequest = (req) => {
    const u = String(req.url || '');
    if (u.startsWith('lesebok://valgt/')) {
      rememberChoice(decodeURIComponent(u.slice('lesebok://valgt/'.length)));
      return false;
    }
    return true;
  };
  await wv.loadHTML(html);
  await wv.present(true);
}
