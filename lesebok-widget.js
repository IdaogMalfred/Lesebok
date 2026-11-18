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

const fm = FileManager.iCloud();
const dir = fm.documentsDirectory();

async function loadBackup() {
  const files = fm.listContents(dir).filter((n) => /^lesebok.*\.json$/i.test(n));
  if (!files.length) return null;
  files.sort((a, b) => fm.modificationDate(fm.joinPath(dir, b)) - fm.modificationDate(fm.joinPath(dir, a)));
  const path = fm.joinPath(dir, files[0]);
  if (!fm.isFileDownloaded(path)) await fm.downloadFileFromiCloud(path);
  const data = JSON.parse(fm.readString(path));
  if (!data || data.source !== 'lesebok-backup') return null;
  return data;
}

// Samme sitat hele dagen, nytt sitat neste dag.
function pickForToday(data) {
  let list = (data.highlights || []).filter((h) => h && h.text && h.kind !== 'note');
  const favs = data.favorites || {};
  if (onlyFavs) {
    const f = list.filter((h) => favs[h.id]);
    if (f.length) list = f;
  }
  const fitting = list.filter((h) => h.text.length <= S.max);
  if (fitting.length >= 3) list = fitting;
  if (!list.length) return null;
  list.sort((a, b) => (a.id < b.id ? -1 : 1));
  const now = new Date();
  const day = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 86400000);
  return list[((day * 2654435761) >>> 0) % list.length];
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
if (APP_URL.startsWith('http')) w.url = APP_URL;

try {
  const data = await loadBackup();
  const h = data && pickForToday(data);
  if (!data) {
    message(w, 'Lagre en sikkerhetskopi fra Leseboka i iCloud Drive → Scriptable, så dukker dagens sitat opp her.');
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

// Oppdater rett etter midnatt
const next = new Date();
next.setHours(24, 0, 30, 0);
w.refreshAfterDate = next;

if (config.runsInWidget) Script.setWidget(w);
else await w.presentMedium();
Script.complete();
