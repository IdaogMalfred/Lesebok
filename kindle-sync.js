/* Lesebok · «Hent til Lesebok»-bokmerket.
   Kjøres på read.amazon.com/notebook (eller tilsvarende Amazon-domene).
   Henter alle bøker og highlights fra notatboka og sender dem til Leseboka.
   Appen bygger bokmerket fra denne fila og setter inn sin egen adresse.
   Skriptet bruker ikke innerHTML eller DOMParser, fordi Amazon-sider kan ha
   sikkerhetsregler (Trusted Types) som stopper slikt. */
(async () => {
  const VERSION = 3;

  /* Statusboks først, så du alltid ser at bokmerket har startet. */
  const old = document.getElementById('lesebok-status');
  if (old) old.remove();
  const box = document.createElement('div');
  box.id = 'lesebok-status';
  box.style.cssText = 'position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:340px;padding:16px 18px;border-radius:16px;background:#f3e7d3;color:#2f241b;font:16px/1.45 Georgia,serif;box-shadow:0 16px 40px -12px rgba(0,0,0,.45);text-align:left';
  (document.body || document.documentElement).appendChild(box);
  const el = (tag, text, css) => { const e = document.createElement(tag); if (text) e.textContent = text; if (css) e.style.cssText = css; return e; };
  const say = (...parts) => {
    box.textContent = '';
    box.appendChild(el('div', 'Lesebok', 'font-style:italic;color:#957e66;margin-bottom:4px'));
    parts.forEach((p) => box.appendChild(typeof p === 'string' ? el('div', p) : p));
    const close = el('button', '×', 'position:absolute;top:6px;right:10px;border:0;background:none;font:22px Georgia,serif;color:#957e66;cursor:pointer');
    close.onclick = () => box.remove();
    box.appendChild(close);
  };
  const link = (text, href, opts = {}) => {
    const a = el('a', text, 'display:inline-block;margin-top:8px;padding:0;border:0;border-radius:0;background:none;box-shadow:none;color:#b0603a;font:bold 16px/1.45 Georgia,serif;text-decoration:underline');
    a.href = href;
    if (opts.download) a.download = opts.download;
    return a;
  };
  say('Starter…');

  const APP = '__APP_URL__';
  let APP_ORIGIN = '';
  try { APP_ORIGIN = new URL(APP).origin; } catch (e) {
    say('Bokmerket mangler adressen til Leseboka. Lag bokmerket på nytt fra Bibliotek i appen.');
    return;
  }

  if (!/^(read|lesen|lire|leer|leggi|ler)\.amazon\./.test(location.hostname) && !window.__lesebokTest) {
    say('Bokmerket virker. Bruk det på Kindle-notatboka hos Amazon.', link('Åpne read.amazon.com/notebook', 'https://read.amazon.com/notebook'));
    return;
  }
  if (window.__lesebokRunning) return;
  window.__lesebokRunning = true;

  /* Åpne Leseboka med en gang (mens trykket fortsatt teller), så den ikke blokkeres som popup. */
  let win = null;
  try { win = window.open(APP + '#kindle', 'lesebok'); } catch (e) { win = null; }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const txt = (e) => (e ? e.textContent.replace(/\s+/g, ' ').trim() : '');
  const val = (root, sel) => { const e = root.querySelector(sel); return e ? e.value || e.getAttribute('value') || '' : ''; };
  const base = location.origin + location.pathname.replace(/\/[^/]*$/, '/') + 'notebook';
  /* Henter en side som ferdig tolket dokument (uten innerHTML/DOMParser).
     Sender samme hode som Amazons egen side, så vi får samme svar som når du klikker på en bok. */
  const lastGet = { status: 0, size: 0 };
  const get = (url) => new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('GET', url);
    x.responseType = 'document';
    x.withCredentials = true;
    x.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    x.setRequestHeader('Accept', 'text/html');
    x.onload = () => {
      lastGet.status = x.status;
      lastGet.size = x.response && x.response.documentElement ? x.response.documentElement.outerHTML.length : 0;
      if (x.status >= 200 && x.status < 300 && x.response) resolve(x.response);
      else reject(new Error('Amazon svarte med feil ' + x.status));
    };
    x.onerror = () => reject(new Error('Fikk ikke kontakt med Amazon'));
    x.send();
  });

  /* Leser highlights og notater uansett hvordan radene er pakket inn. */
  const rowsFrom = (root) => {
    const area = root.querySelector('#kp-notebook-annotations') || root;
    const seen = new Set();
    const items = [];
    area.querySelectorAll('[id="highlight"], .kp-notebook-highlight, [id="note"], .kp-notebook-note').forEach((n) => {
      const row = n.closest('#kp-notebook-annotations > div') || n.closest('.a-spacing-base') || n.parentElement;
      if (!row || seen.has(row)) return;
      seen.add(row);
      const text = txt(row.querySelector('[id="highlight"]') || row.querySelector('.kp-notebook-highlight'));
      const note = txt(row.querySelector('[id="note"]') || row.querySelector('.kp-notebook-note'));
      if (!text && !note) return;
      const header = txt(row.querySelector('[id="annotationHighlightHeader"], [id="annotationNoteHeader"], .kp-notebook-metadata'));
      const locRaw = val(row, '[id="kp-annotation-location"], input[id*="location"]') || (header.match(/(?:location|posisjon|position|posición|posizione)\s*:?\s*([\d.,]+)/i) || [])[1] || '';
      const page = (header.match(/(?:page|side|seite|página|pagina)\s*:?\s*([\dIVXLCivxlc]+)/i) || [])[1] || '';
      items.push({ text, note, location: locRaw ? parseInt(String(locRaw).replace(/[^\d]/g, ''), 10) : null, page });
    });
    return items;
  };
  const keyOf = (it) => it.text + '\u0000' + it.note + '\u0000' + it.location;

  /* Plan A: spør Amazon direkte, side for side. */
  const viaRequest = async (b) => {
    const items = [];
    let token = '';
    let state = '';
    for (let guard = 0; guard < 100; guard++) {
      const url = base + '?asin=' + encodeURIComponent(b.asin) + (token ? '&token=' + encodeURIComponent(token) : '') + '&contentLimitState=' + encodeURIComponent(state) + '&';
      const d = await get(url);
      if (!b.title) b.title = txt(d.querySelector('h3.kp-notebook-metadata'));
      if (!b.author) b.author = txt(d.querySelector('p.kp-notebook-metadata')).replace(/^(by|av)\s*:?\s*/i, '');
      const rows = rowsFrom(d);
      if (guard === 0) b.diag = 'svar ' + lastGet.status + ', ' + Math.round(lastGet.size / 1024) + ' kB, notatområde: ' + (d.querySelector('#kp-notebook-annotations') ? 'ja' : 'nei') + ', rader: ' + rows.length;
      items.push(...rows);
      const next = val(d, '.kp-notebook-annotations-next-page-start');
      state = val(d, '.kp-notebook-content-limit-state') || state;
      if (!next || next === token || !rows.length) break;
      token = next;
    }
    return items;
  };

  /* Plan B: klikk på boka i lista, slik du ville gjort selv, og les fra siden. Rull for å laste alle. */
  const viaClick = async (b) => {
    const item = document.getElementById(b.asin);
    if (!item) return [];
    const target = item.querySelector('a') || item.querySelector('[role="button"]') || item.querySelector('.a-declarative') || item;
    target.click();
    const want = (b.title || '').slice(0, 18).toLowerCase();
    for (let t = 0; t < 40; t++) {
      await sleep(250);
      const h3 = txt(document.querySelector('h3.kp-notebook-metadata')).toLowerCase();
      if (want && h3.includes(want)) break;
    }
    await sleep(700);
    const area = document.querySelector('#kp-notebook-annotations');
    let scroller = area;
    while (scroller && scroller !== document.body && !(scroller.scrollHeight > scroller.clientHeight + 5 && /(auto|scroll)/.test(getComputedStyle(scroller).overflowY))) scroller = scroller.parentElement;
    let last = -1;
    let still = 0;
    for (let k = 0; k < 80 && still < 3; k++) {
      const n = rowsFrom(document).length;
      still = n === last ? still + 1 : 0;
      last = n;
      if (scroller && scroller !== document.body) scroller.scrollTop = scroller.scrollHeight;
      window.scrollTo(0, document.documentElement.scrollHeight);
      await sleep(600);
    }
    const rows = rowsFrom(document);
    b.diag = (b.diag ? b.diag + '; ' : '') + 'klikk: ' + rows.length + ' rader';
    return rows;
  };

  try {
    say('Leter etter bøkene dine…');

    /* 1) Bøkene i lista til venstre (henter flere sider hvis lista er lang) */
    const books = new Map();
    const addBooks = (doc) => doc.querySelectorAll('.kp-notebook-library-each-book').forEach((b) => {
      const asin = b.id;
      if (!asin || books.has(asin)) return;
      const title = txt(b.querySelector('h2, .kp-notebook-searchable'));
      const author = txt(b.querySelector('p')).replace(/^(by|av|von|par|de|di|door|af)\s*:?\s*/i, '');
      books.set(asin, { asin, title, author });
    });
    addBooks(document);
    let libToken = val(document, '.kp-notebook-library-next-page-start');
    for (let guard = 0; libToken && guard < 60; guard++) {
      const d = await get(base + '?library=list&token=' + encodeURIComponent(libToken));
      addBooks(d);
      const next = val(d, '.kp-notebook-library-next-page-start');
      if (!next || next === libToken) break;
      libToken = next;
    }
    if (!books.size) throw new Error('Fant ingen bøker på siden. Er du logget inn, og vises bøkene dine i lista til venstre?');

    /* 2) Highlights og notater for hver bok */
    const out = [];
    let i = 0;
    let firstDiag = '';
    for (const b of books.values()) {
      i++;
      say('Henter bok ' + i + ' av ' + books.size, el('i', b.title));
      let items = [];
      try { items = await viaRequest(b); } catch (e) { b.diag = 'forespørsel feilet: ' + e.message; }
      if (!items.length) {
        say('Henter bok ' + i + ' av ' + books.size, el('i', b.title), el('div', 'Leser rett fra siden…', 'color:#957e66'));
        items = await viaClick(b);
      }
      if (!firstDiag) firstDiag = b.diag || '';
      const seen = new Set();
      items = items.filter((it) => { const k = keyOf(it); if (seen.has(k)) return false; seen.add(k); return true; });
      if (items.length) out.push({ title: b.title, author: b.author, asin: b.asin, highlights: items });
      await sleep(150); /* litt pause mellom bøkene, så vi ikke maser på Amazon */
    }
    if (!out.length) {
      throw new Error('Fant ' + books.size + ' bøker, men ingen highlights. Teknisk info: ' + firstDiag);
    }

    const total = out.reduce((n, b) => n + b.highlights.length, 0);
    const payload = { source: 'kindle-notebook', version: VERSION, id: Date.now() + '-' + Math.random().toString(36).slice(2), fetched: new Date().toISOString(), books: out };
    say('Fant ' + total + ' highlights i ' + out.length + ' bøker.', 'Sender til Leseboka…');

    /* 3) Send til Leseboka og vent på svar */
    let done = false;
    window.addEventListener('message', (e) => {
      if (e.origin !== APP_ORIGIN || !e.data || typeof e.data !== 'object') return;
      if (e.data.type === 'lesebok-ready' && win) win.postMessage({ type: 'lesebok-import', payload }, APP_ORIGIN);
      if (e.data.type === 'lesebok-received') {
        done = true;
        say('Ferdig! ' + (e.data.message || ''), el('div', 'Du kan lukke denne fanen.', 'color:#957e66'));
      }
    });
    for (let t = 0; t < 40 && !done && win && !win.closed; t++) {
      try { win.postMessage({ type: 'lesebok-import', payload }, APP_ORIGIN); } catch (e) { /* prøv igjen */ }
      await sleep(500);
    }

    /* Reserve: last ned som fil, som kan importeres i Leseboka */
    if (!done) {
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload)], { type: 'application/json' }));
      say('Fant ' + total + ' highlights, men fikk ikke kontakt med Leseboka.', link('Last ned fila', url, { download: 'kindle-highlights.json' }), el('div', 'Importer den i Leseboka under Bibliotek → Importer fil.', 'color:#957e66;margin-top:6px'));
    }
  } catch (err) {
    say('Noe gikk galt:', el('div', String((err && err.message) || err), 'color:#a8341f'));
  } finally {
    window.__lesebokRunning = false;
  }
})();
