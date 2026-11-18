(function () {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // ---------- Ikoner (tynne linjer) ----------
  const svg = (d, w = 1.35) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON = {
    heart: svg('<path d="M12 20.3s-7.4-4.5-9.1-9.2C1.7 7.6 4 4.6 7.3 4.6c2 0 3.6 1.1 4.7 2.8 1.1-1.7 2.7-2.8 4.7-2.8 3.3 0 5.6 3 4.4 6.5-1.7 4.7-9.1 9.2-9.1 9.2z"/>'),
    more: svg('<circle cx="5.5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.3" fill="currentColor" stroke="none"/>'),
    scissors: svg('<circle cx="6" cy="7" r="2.6"/><circle cx="6" cy="17" r="2.6"/><path d="M8.2 8.5 20 17M8.2 15.5 20 7"/>'),
    trash: svg('<path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l.9 12.2c.1.8.7 1.3 1.5 1.3h6.2c.8 0 1.4-.5 1.5-1.3L17.5 7M10.2 10.5v6.5M13.8 10.5v6.5"/>'),
    shuffle: svg('<path d="M3.5 7.5h2.8c2.4 0 3.7 1.5 5.1 4.5s2.7 4.5 5.1 4.5h3.8M3.5 16.5h2.8c1.2 0 2.1-.4 2.9-1.1M14.6 8.6c.8-.7 1.7-1.1 2.9-1.1h3M18.5 5l2.5 2.5-2.5 2.5M18.5 14l2.5 2.5-2.5 2.5"/>'),
    list: svg('<path d="M4.5 7h15M4.5 12h10M4.5 17h6"/>'),
    close: svg('<path d="M7 7l10 10M17 7L7 17"/>', 1.6),
    quote: svg('<path d="M5 17.5v-4.6C5 9 6.7 6.7 9.7 5.8M5 12.9h3.8v4.6H5M13.5 17.5v-4.6c0-3.9 1.7-6.2 4.7-7.1M13.5 12.9h3.8v4.6h-3.8"/>'),
    books: svg('<path d="M5 4.8h3.3v14.4H5zM10.3 4.8h3.3v14.4h-3.3zM15.4 5.6l3.2-.8 3 13.9-3.2.8z" transform="translate(-.8 0)"/>'),
    arrowUp: svg('<path d="M12 18V6.5M7 11l5-5 5 5"/>', 1.6),
    arrowRight: svg('<path d="M5 12h13M13 7l5 5-5 5"/>', 1.6),
  };
  const hydrateIcons = (root = document) =>
    $$('[data-icon]', root).forEach((el) => { if (!el.firstChild) el.innerHTML = ICON[el.dataset.icon] || ''; });

  // ---------- Lagring (samme nøkler som v1, så dataene deles) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignorer */ } },
  };
  const KEY = { hl: 'kh:highlights:v1', fav: 'kh:favorites:v1', del: 'kh:deleted:v1' };

  let highlights = store.get(KEY.hl, []);
  let favs = store.get(KEY.fav, {});
  let deleted = store.get(KEY.del, {}); // id -> slettet highlight (så den ikke kommer tilbake ved ny import)
  const byId = new Map();
  const reindex = () => { byId.clear(); highlights.forEach((h) => byId.set(h.id, h)); };
  reindex();

  function save() {
    if (!(store.set(KEY.hl, highlights) && store.set(KEY.fav, favs) && store.set(KEY.del, deleted))) toast('Kunne ikke lagre. Lagringsplassen kan være full.');
  }

  // ---------- Hjelpere ----------
  function hash(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761);
      h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
  }
  const hueCache = new Map();
  // Hver bok får en farge fra en fast palett uten grønt:
  // murstein, terrakotta, rav, oker, rosa, plomme, fiolett, indigo og stålblå.
  const PALETTE = [8, 18, 30, 42, 345, 322, 282, 238, 212];
  const hue = (book) => {
    if (!hueCache.has(book)) hueCache.set(book, PALETTE[parseInt(hash(book).slice(0, 6), 16) % PALETTE.length]);
    return hueCache.get(book);
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lenClass = (t) => (t.length < 110 ? 's' : t.length < 260 ? 'm' : t.length < 480 ? 'l' : 'xl');
  const pad = (n) => String(n).padStart(String(order.length).length < 2 ? 2 : String(order.length).length, '0');
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const stripQuotes = (t) => t.replace(/^[\s“”"«»„]+|[\s“”"«»]+$/g, '');

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function spreadBooks(a) {
    for (let i = 1; i < a.length; i++) {
      if (a[i].book !== a[i - 1].book) continue;
      for (let j = i + 1; j < Math.min(a.length, i + 60); j++) {
        if (a[j].book !== a[i - 1].book) { [a[i], a[j]] = [a[j], a[i]]; break; }
      }
    }
    return a;
  }

  // ---------- Toast ----------
  const toastEl = $('#toast');
  let toastTimer;
  function toast(msg, action) {
    clearTimeout(toastTimer);
    toastEl.hidden = true;
    toastEl.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button" class="press">${esc(action.label)}</button>` : ''}`;
    void toastEl.offsetWidth;
    toastEl.hidden = false;
    if (action) $('button', toastEl).onclick = () => { toastEl.hidden = true; action.run(); };
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, action ? 5000 : 3000);
  }

  // ---------- Favoritter ----------
  function favButtonState(b, on) {
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', on ? 'Fjern fra favoritter' : 'Lagre som favoritt');
    const label = $('.fav-text', b);
    if (label) label.textContent = on ? 'Lagret' : 'Lagre';
  }
  function setFav(id, on) {
    if (on) favs[id] = favs[id] || Date.now();
    else delete favs[id];
    save();
    $$(`[data-id="${id}"] .fav`).forEach((b) => {
      favButtonState(b, !!on);
      if (on) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
    });
    updateCounts();
  }
  function removeFavWithUndo(id, el) {
    const ts = favs[id];
    const finish = () => { setFav(id, false); renderFavs(false); };
    if (el && !reduceMotion.matches) { el.classList.add('leaving'); setTimeout(finish, 180); } else finish();
    toast('Fjernet fra favoritter', { label: 'Angre', run: () => { favs[id] = ts; save(); updateCounts(); renderFavs(false); } });
  }

  // ---------- Bokomslag ----------
  // Slås opp i Open Library (med Google Books som reserve). Bare boktittel og forfatter sendes.
  const COVER_KEY = 'kh:covers:v1';
  const covers = store.get(COVER_KEY, {}); // bok -> { url, t }
  const coverQueue = [];
  const coverQueued = new Set();
  let coverRunning = 0;

  const cleanTitle = (t) => t.replace(/\s*[([].*?[)\]]\s*/g, ' ').split(/[:–—]| - /)[0].replace(/\s+/g, ' ').trim();
  const initials = (t) => cleanTitle(t).split(' ').filter((w) => /^[\p{L}\d]/u.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

  function coverHTML(book, size = 'm') {
    const c = covers[book];
    const inner = c && c.url
      ? `<img src="${esc(c.url)}" alt="" loading="lazy" decoding="async">`
      : `<span class="cover-fb"><span>${esc(initials(book) || '“')}</span></span>`;
    return `<span class="cover cover-${size}" data-cover="${esc(book)}" style="--hue:${hue(book)}" aria-hidden="true">${inner}</span>`;
  }
  function applyCover(book) {
    const html = (size) => coverHTML(book, size);
    $$(`[data-cover="${CSS.escape(book)}"]`).forEach((el) => {
      const size = (el.className.match(/cover-(\w+)/) || [])[1] || 'm';
      el.outerHTML = html(size);
    });
  }
  // Bytt til reserveomslag hvis bildet ikke laster.
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.closest('.cover')) return;
    const book = img.closest('.cover').dataset.cover;
    if (covers[book]) covers[book] = { url: null, t: Date.now() };
    store.set(COVER_KEY, covers);
    applyCover(book);
  }, true);

  function wantCover(book, author) {
    const c = covers[book];
    if (c && (c.url || Date.now() - c.t < 7 * 864e5)) return; // prøv igjen etter en uke hvis ingen ble funnet
    if (coverQueued.has(book)) return;
    coverQueued.add(book);
    coverQueue.push({ book, author });
    pumpCovers();
  }
  function pumpCovers() {
    while (coverRunning < 2 && coverQueue.length) {
      const job = coverQueue.shift();
      coverRunning++;
      fetchCover(job.book, job.author).finally(() => { coverRunning--; coverQueued.delete(job.book); pumpCovers(); });
    }
  }
  async function fetchCover(book, author) {
    const title = cleanTitle(book);
    const a = (author || '').split(',')[0].trim();
    const enc = encodeURIComponent;
    let url = null;
    let reached = false;
    try {
      const r = await fetch(`https://openlibrary.org/search.json?title=${enc(title)}${a ? `&author=${enc(a)}` : ''}&limit=5&fields=cover_i`);
      if (r.ok) {
        reached = true;
        const d = ((await r.json()).docs || []).find((x) => x.cover_i);
        if (d) url = `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg`;
      }
    } catch { /* prøv neste kilde */ }
    if (!url) {
      try {
        const q = `intitle:${title}${a ? ` inauthor:${a}` : ''}`;
        const r = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${enc(q)}&maxResults=5&fields=items(volumeInfo/imageLinks)`);
        if (r.ok) {
          reached = true;
          const it = ((await r.json()).items || []).find((x) => x.volumeInfo && x.volumeInfo.imageLinks && x.volumeInfo.imageLinks.thumbnail);
          if (it) url = it.volumeInfo.imageLinks.thumbnail.replace(/^http:/, 'https:').replace('&edge=curl', '');
        }
      } catch { /* uten nett: prøv igjen senere */ }
    }
    if (!reached) return; // ingen svar (f.eks. uten nett) – ikke husk resultatet
    covers[book] = { url, t: Date.now() };
    store.set(COVER_KEY, covers);
    if (url) applyCover(book);
  }

  // ---------- Feed: en bunke kort du sveiper til siden ----------
  // Sveip til høyre: kortet flyr ut og legger seg bakerst i bunken.
  // Sveip til venstre: forrige kort kommer tilbake øverst. Bunken går i ring.
  const feed = $('#feed');
  const track = $('#track');
  const deckActions = $('#deckActions');
  const deckFav = $('#deckFav');
  let filterBook = null;
  let order = [];
  let pos = 0; // løpende teller (kan bli større enn antall kort, fordi bunken går i ring)
  const cardEls = new Map(); // k -> element
  const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

  const W = () => feed.clientWidth || window.innerWidth;
  const idx = (k) => { const n = order.length; return ((k % n) + n) % n; };
  const itemAt = (k) => order[idx(k)];
  const currentH = () => (order.length ? itemAt(pos) : null);
  const canCycle = () => order.length > 1;

  function buildFeed() {
    order = filterBook
      ? highlights.filter((h) => h.book === filterBook).sort((a, b) => (a.loc ?? a.n) - (b.loc ?? b.n) || a.n - b.n)
      : spreadBooks(shuffle(highlights.slice()));
    pos = 0;
    renderDeck(true);
    $('#feedEmpty').hidden = highlights.length > 0;
    feed.hidden = highlights.length === 0;
    deckActions.hidden = highlights.length === 0;
    updateChrome();
  }

  function cardHTML(h, k) {
    const meta = [h.page ? `s. ${esc(h.page)}` : '', h.loc != null ? `pos. ${h.loc}` : ''].filter(Boolean);
    const isNote = h.kind === 'note';
    return `<article class="card" data-id="${h.id}" data-k="${k}" style="--hue:${hue(h.book)}">
      <div class="slip">
        <div class="shell"><div class="core">
          <span class="spine"></span>
          <div class="slip-head">
            <span class="eyebrow">${idx(k) + 1} av ${order.length}</span>
            ${isNote ? '<span class="eyebrow kind-tag">Notat</span>' : meta.length ? `<span class="eyebrow">${meta.join(' · ')}</span>` : ''}
          </div>
          <div class="card-scroll">
            <blockquote class="quote len-${lenClass(h.text)}" translate="no">${isNote ? '' : '<span class="om">“</span>'}${esc(stripQuotes(h.text))}${isNote ? '' : '<span class="om">”</span>'}</blockquote>
            ${h.note ? `<p class="note"><span class="note-label">ditt notat</span>${esc(h.note)}</p>` : ''}
          </div>
          <button class="book" type="button" aria-label="Les flere fra ${esc(h.book)}">
            ${coverHTML(h.book, 'm')}
            <span class="book-meta">
              <span class="book-title">${esc(h.book)}</span>
              ${h.author ? `<span class="book-author">${esc(h.author)}</span>` : ''}
              <span class="book-go">Les fra denne boka ${ICON.arrowRight}</span>
            </span>
          </button>
        </div></div>
      </div>
      <div class="burst" aria-hidden="true">${ICON.heart}</div>
    </article>`;
  }

  // Hvert kort får sin egen lille skråstilling, så bunken ser håndlagt ut.
  const tiltFor = (k, h) => {
    const x = parseInt(hash(h.id + ':' + k).slice(0, 4), 16);
    return (x % 2 ? 1 : -1) * (1.3 + (x % 9) / 10);
  };

  // Hvor et kort ligger, ut fra plassen i bunken (rel = k - pos).
  function pose(rel, t) {
    const w = W();
    if (rel <= -1) return { x: w * 1.15, y: -24, r: 16, s: 1, o: rel === -1 ? 1 : 0, z: 40 }; // ute til høyre
    if (rel === 0) return { x: 0, y: 0, r: 0, s: 1, o: 1, z: 30 };                              // øverst
    if (rel === 1) return { x: t * 2.5, y: 10, r: t * 0.9, s: 0.98, o: 1, z: 20 };
    if (rel === 2) return { x: -t * 3, y: 18, r: -t * 1.1, s: 0.96, o: 1, z: 10 };
    return { x: 0, y: 26, r: 0, s: 0.93, o: 0, z: 5 };                                           // gjemt bakerst
  }
  const mix = (a, b, f) => ({
    x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, r: a.r + (b.r - a.r) * f,
    s: a.s + (b.s - a.s) * f, o: a.o + (b.o - a.o) * f, z: a.z,
  });
  function place(el, p, ms) {
    el.style.transition = ms ? `transform ${ms}ms ${EASE}, opacity ${Math.round(ms * 0.6)}ms ${EASE}` : 'none';
    el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) rotate(${p.r.toFixed(2)}deg) scale(${p.s.toFixed(3)})`;
    el.style.opacity = p.o;
    el.style.zIndex = p.z;
  }
  function layout(ms) {
    cardEls.forEach((el, k) => {
      el.classList.toggle('current', k === pos);
      el.classList.toggle('behind', k > pos);
      place(el, pose(k - pos, +el.dataset.tilt), ms);
    });
  }

  // Holder bare de få kortene som synes (forrige, øverste og tre bak) i DOM-en.
  function renderDeck(full) {
    if (full) { track.innerHTML = ''; cardEls.clear(); }
    if (!order.length) return;
    const lo = pos - (canCycle() ? 1 : 0);
    const hi = pos + Math.min(3, order.length - 1);
    for (const [k, el] of cardEls) if (k < lo || k > hi) { el.remove(); cardEls.delete(k); }
    const added = [];
    for (let k = lo; k <= hi; k++) {
      if (cardEls.has(k)) continue;
      const h = itemAt(k);
      track.insertAdjacentHTML('beforeend', cardHTML(h, k));
      const el = track.lastElementChild;
      el.dataset.tilt = tiltFor(k, h);
      el.classList.toggle('behind', k > pos);
      place(el, pose(k - pos, +el.dataset.tilt), 0);
      cardEls.set(k, el);
      added.push(el);
      wantCover(h.book, h.author);
    }
    markLongCards(added);
    if (full) layout(0);
    syncCurrent();
  }

  // Krymper skriften til sitatet får plass. Bare veldig lange sitater blir rullbare inni kortet.
  const SIZES = ['s', 'm', 'l', 'xl', 'xxl'];
  function markLongCards(cards = [...cardEls.values()]) {
    cards.forEach((c) => {
      const el = $('.card-scroll', c);
      const q = $('.quote', c);
      el.classList.remove('scrolls');
      let i = SIZES.indexOf(lenClass(q.textContent));
      q.className = q.className.replace(/len-\w+/, 'len-' + SIZES[i]);
      while (el.scrollHeight > el.clientHeight + 1 && i < SIZES.length - 1) {
        i++;
        q.className = q.className.replace(/len-\w+/, 'len-' + SIZES[i]);
      }
      el.classList.toggle('scrolls', el.scrollHeight > el.clientHeight + 1);
    });
  }
  window.addEventListener('resize', () => { markLongCards(); layout(0); });

  // Oppdaterer det som står stille: knappene og fargen i toppen.
  function syncCurrent() {
    const h = currentH();
    if (!h) return;
    deckActions.dataset.id = h.id;
    favButtonState(deckFav, !!favs[h.id]);
    deckFav.classList.remove('pop');
    $('#brand').style.setProperty('--hue', hue(h.book));
    deckActions.style.setProperty('--hue', hue(h.book));
  }

  function go(k, animate = true) {
    if (!order.length) return;
    pos = canCycle() ? k : 0;
    renderDeck(false);
    layout(animate && !reduceMotion.matches ? 520 : 0);
  }

  // --- Dra og sveip (felles for berøring og mus) ---
  let drag = null;
  let lastSwipeAt = 0;
  const canScroll = (sc, dy) => {
    if (!sc) return false;
    const canUp = sc.scrollTop > 0;
    const canDown = sc.scrollTop + sc.clientHeight < sc.scrollHeight - 1;
    return (dy < 0 && canDown) || (dy > 0 && canUp);
  };

  function dragStart(x, y, t) {
    drag = canCycle() ? { x0: x, y0: y, mode: null, samples: [{ x, t }] } : null;
  }
  // Returnerer true når bevegelsen brukes til å bla (så standardrulling skal stoppes).
  function dragMove(x, y, t) {
    if (!drag) return false;
    const dx = x - drag.x0;
    const dy = y - drag.y0;
    if (!drag.mode) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return false;
      // Tydelig loddrette bevegelser er til å rulle lange sitater; alt annet blar.
      if (Math.abs(dy) > Math.abs(dx) * 1.2) { drag.mode = 'ignore'; return false; }
      drag.mode = 'page';
      drag.x0 = x;
      drag.y0 = y;
    }
    if (drag.mode !== 'page') return false;
    drag.samples.push({ x, t });
    if (drag.samples.length > 8) drag.samples.shift();
    const ddx = x - drag.x0;
    const ddy = y - drag.y0;
    const top = cardEls.get(pos);
    const next = cardEls.get(pos + 1);
    const prev = cardEls.get(pos - 1);
    if (ddx >= 0) {
      // Det øverste kortet følger fingeren mot høyre; neste kort løfter seg litt fram.
      if (prev) place(prev, pose(-1, 0), 0);
      if (top) place(top, { x: ddx, y: ddy * 0.25, r: ddx * 0.045, s: 1, o: 1, z: 30 }, 0);
      if (next) place(next, mix(pose(1, +next.dataset.tilt), pose(0, 0), Math.min(1, ddx / (W() * 0.7)) * 0.7), 0);
    } else {
      // Forrige kort glir inn igjen fra høyre og legger seg øverst.
      if (top) place(top, pose(0, 0), 0);
      if (next) place(next, pose(1, +next.dataset.tilt), 0);
      if (prev) {
        const start = pose(-1, 0);
        const px = Math.max(0, start.x + ddx * 1.25);
        const f = px / start.x;
        place(prev, { x: px, y: start.y * f, r: start.r * f, s: 1, o: 1, z: 40 }, 0);
      }
    }
    return true;
  }
  function dragEnd(x, t) {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.mode !== 'page') return;
    const dx = x - d.x0;
    const recent = d.samples.filter((p) => t - p.t < 100);
    const first = recent[0] || d.samples[0];
    const v = (x - first.x) / Math.max(8, t - first.t); // px per ms
    let dir = 0;
    if (dx > 0 && (v > 0.3 || dx > W() * 0.25)) dir = 1;       // til høyre: neste
    else if (dx < 0 && (v < -0.3 || dx < -W() * 0.25)) dir = -1; // til venstre: tilbake
    lastSwipeAt = Date.now();
    if (dir) go(pos + dir); else layout(reduceMotion.matches ? 0 : 420);
  }

  // Berøring
  feed.addEventListener('touchstart', (e) => {
    if (e.touches.length > 1) { drag = null; return; }
    const p = e.touches[0];
    dragStart(p.clientX, p.clientY, e.timeStamp);
  }, { passive: true });
  feed.addEventListener('touchmove', (e) => {
    const p = e.touches[0];
    if (dragMove(p.clientX, p.clientY, e.timeStamp) && e.cancelable) e.preventDefault();
  }, { passive: false });
  const touchEnd = (e) => { const p = e.changedTouches[0]; dragEnd(p.clientX, e.timeStamp); };
  feed.addEventListener('touchend', touchEnd);
  feed.addEventListener('touchcancel', touchEnd);

  // Mus: dra kortet til siden
  feed.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || e.target.closest('button')) return;
    dragStart(e.clientX, e.clientY, e.timeStamp);
    if (drag) drag.pointerId = e.pointerId;
  });
  feed.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || !drag || drag.pointerId !== e.pointerId) return;
    if (dragMove(e.clientX, e.clientY, e.timeStamp) && !feed.classList.contains('grabbing')) {
      try { feed.setPointerCapture(e.pointerId); } catch { /* pekeren er allerede borte */ }
      feed.classList.add('grabbing');
    }
  });
  const pointerEnd = (e) => {
    if (e.pointerType !== 'mouse' || !drag || drag.pointerId !== e.pointerId) return;
    feed.classList.remove('grabbing');
    dragEnd(e.clientX, e.timeStamp);
  };
  feed.addEventListener('pointerup', pointerEnd);
  feed.addEventListener('pointercancel', pointerEnd);

  // --- Styreflate og mushjul ---
  // Tofingersveip mot høyre (eller rull ned) = neste, mot venstre (eller rull opp) = tilbake.
  // Ett sveip = ett kort: etterglidningen avtar jevnt, så et nytt sveip kjennes på at utslaget øker igjen.
  let wheelAcc = 0;
  let wheelLast = 0;
  let wheelPrevAbs = 0;
  let wheelArmed = true;
  feed.addEventListener('wheel', (e) => {
    const horiz = Math.abs(e.deltaX) > Math.abs(e.deltaY);
    if (!horiz && canScroll(e.target.closest('.card-scroll.scrolls'), -e.deltaY)) return;
    e.preventDefault();
    if (!canCycle()) return;
    const unit = e.deltaMode === 1 ? 30 : e.deltaMode === 2 ? W() : 1;
    const d = (horiz ? -e.deltaX : e.deltaY) * unit;
    const now = performance.now();
    const abs = Math.abs(d);
    const pause = now - wheelLast > 140;
    const rising = abs > 6 && abs > wheelPrevAbs * 1.6 + 3;
    const reversed = wheelAcc !== 0 && Math.sign(d) !== Math.sign(wheelAcc);
    if (pause || rising || reversed) { wheelAcc = 0; wheelArmed = true; }
    wheelLast = now;
    wheelPrevAbs = abs;
    if (!wheelArmed) return;
    wheelAcc += d;
    if (Math.abs(wheelAcc) > 24) {
      go(pos + (wheelAcc > 0 ? 1 : -1));
      wheelAcc = 0;
      wheelArmed = false;
    }
  }, { passive: false });

  // --- Trykk på kortet ---
  let lastTap = { t: 0, id: null };
  feed.addEventListener('click', (e) => {
    if (Date.now() - lastSwipeAt < 300) return;
    const card = e.target.closest('.card');
    if (!card || !card.classList.contains('current')) return;
    const id = card.dataset.id;
    if (e.target.closest('.book')) return setFilter(byId.get(id).book);
    if (e.target.closest('button')) return;
    const now = Date.now();
    if (lastTap.id === id && now - lastTap.t < 350) {
      if (!favs[id]) setFav(id, true);
      const b = $('.burst', card);
      b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
      lastTap = { t: 0, id: null };
    } else lastTap = { t: now, id };
  });

  deckActions.addEventListener('click', (e) => {
    const h = currentH();
    if (!h) return;
    if (e.target.closest('.fav')) return setFav(h.id, !favs[h.id]);
    if (e.target.closest('.more')) return openMenu(h.id);
  });

  function setFilter(book) {
    closeSheet();
    showView('feed');
    if (book === filterBook) return;
    filterBook = book;
    buildFeed();
  }

  // ---------- Favorittliste ----------
  const favList = $('#favList');
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); revealObserver.unobserve(en.target); } });
  }, { threshold: 0.12 });

  function renderFavs(animate = true) {
    const ids = Object.keys(favs).filter((id) => byId.has(id)).sort((a, b) => favs[b] - favs[a]);
    favList.innerHTML = ids.map((id, i) => {
      const h = byId.get(id);
      return `<article class="fav-item shell ${animate ? 'reveal' : ''}" data-id="${id}" style="--hue:${hue(h.book)};--d:${Math.min(i, 5) * 50}">
        <div class="core">
          <span class="spine"></span>
          <blockquote translate="no">${esc(stripQuotes(h.text))}</blockquote>
          ${h.note ? `<p class="note"><span class="note-label">ditt notat</span>${esc(h.note)}</p>` : ''}
          <div class="fav-foot">
            <button class="book" type="button" aria-label="Les flere fra ${esc(h.book)}">
              ${coverHTML(h.book, 's')}
              <span class="book-meta">
                <span class="book-title">${esc(h.book)}</span>
                ${h.author ? `<span class="book-author">${esc(h.author)}</span>` : ''}
              </span>
            </button>
            <div class="actions">
              <button class="icon-pill more press" type="button" aria-label="Endre eller slett">${ICON.more}</button>
              <button class="icon-pill fav fav-only press" type="button" aria-pressed="true" aria-label="Fjern fra favoritter">${ICON.heart}</button>
            </div>
          </div>
        </div>
      </article>`;
    }).join('');
    if (animate) $$('.reveal', favList).forEach((el) => revealObserver.observe(el));
    ids.forEach((id) => { const h = byId.get(id); wantCover(h.book, h.author); });
    $('#favEmpty').hidden = ids.length > 0;
    $('#favCount').textContent = ids.length ? String(ids.length).padStart(2, '0') : '';
  }
  favList.addEventListener('click', (e) => {
    const item = e.target.closest('.fav-item');
    if (!item) return;
    const id = item.dataset.id;
    if (e.target.closest('.fav')) return removeFavWithUndo(id, item);
    if (e.target.closest('.more')) return openMenu(id);
    if (e.target.closest('.book')) return setFilter(byId.get(id).book);
  });

  // ---------- Bokvelger ----------
  const sheet = $('#sheet');
  function openSheet() {
    const counts = new Map();
    highlights.forEach((h) => {
      const c = counts.get(h.book) || { n: 0, author: h.author };
      c.n++;
      counts.set(h.book, c);
    });
    const books = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], 'no'));
    $('#bookList').innerHTML =
      `<button class="book-row${filterBook ? '' : ' current'}" type="button" data-book="" style="--d:0">
        <span class="swatch all"></span><span class="book-text"><span class="book-title">Alle bøker, blandet</span></span>
        <span class="count">${highlights.length}</span></button>` +
      books.map(([b, c], i) => `<div class="book-line" style="--hue:${hue(b)};--d:${Math.min(i + 1, 7) * 35}">
        <button class="book-row${b === filterBook ? ' current' : ''}" type="button" data-book="${esc(b)}">
          ${coverHTML(b, 'xs')}
          <span class="book-text"><span class="book-title">${esc(b)}</span>${c.author ? `<span class="book-author">${esc(c.author)}</span>` : ''}</span>
          <span class="count">${c.n}</span>
        </button>
        <button class="row-del press" type="button" data-del-book="${esc(b)}" aria-label="Slett ${esc(b)}">${ICON.trash}</button>
      </div>`).join('');
    $('#bookList').classList.toggle('empty-list', books.length === 0);
    books.forEach(([b, c]) => wantCover(b, c.author));
    sheet.classList.remove('closing');
    sheet.hidden = false;
    $('.book-row.current', sheet)?.focus({ preventScroll: true });
  }
  function closeSheet() {
    if (sheet.hidden || sheet.classList.contains('closing')) return;
    const done = () => {
      sheet.hidden = true;
      sheet.classList.remove('closing');
      if (sheet.contains(document.activeElement) || document.activeElement === document.body) $('#booksBtn').focus({ preventScroll: true });
    };
    if (reduceMotion.matches) return done();
    sheet.classList.add('closing');
    setTimeout(done, 210);
  }
  // Hold tastaturfokus inne i bokvelgeren mens den er åpen.
  sheet.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const items = $$('button', sheet);
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
    else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
  });
  sheet.addEventListener('click', (e) => {
    const del = e.target.closest('[data-del-book]');
    if (del) return confirmDeleteBook(del.dataset.delBook);
    const row = e.target.closest('.book-row');
    if (row) return setFilter(row.dataset.book || null);
    if (e.target === sheet || e.target.closest('[data-action="close-sheet"]')) closeSheet();
  });

  // ---------- Slett en hel bok ----------
  function confirmDeleteBook(book) {
    const n = highlights.filter((h) => h.book === book).length;
    askConfirm({
      title: `Slette «${book}»?`,
      text: `${plural(n, 'highlight', 'highlights')} fra denne boka fjernes, også favoritter. De kommer ikke tilbake ved ny import, men du kan gjenopprette dem i Bibliotek.`,
      yes: 'Slett boka',
    }).then((ok) => { if (ok) deleteBook(book); });
  }
  function deleteBook(book) {
    const gone = highlights.filter((h) => h.book === book);
    const favTs = {};
    gone.forEach((h) => { deleted[h.id] = h; if (favs[h.id]) { favTs[h.id] = favs[h.id]; delete favs[h.id]; } });
    highlights = highlights.filter((h) => h.book !== book);
    reindex();
    if (filterBook === book) filterBook = null;
    save();
    buildFeed();
    updateCounts();
    if (!sheet.hidden) { if (highlights.length) openSheet(); else closeSheet(); }
    if (currentView === 'favs') renderFavs(false);
    toast(`Slettet «${book}»`, {
      label: 'Angre',
      run: () => {
        gone.forEach((h) => { delete deleted[h.id]; if (!byId.has(h.id)) highlights.push(h); });
        Object.assign(favs, favTs);
        reindex();
        save();
        buildFeed();
        updateCounts();
        if (!sheet.hidden) openSheet();
        if (currentView === 'favs') renderFavs(false);
      },
    });
  }

  // ---------- Bekreftelse i appen (i stedet for nettleserens confirm) ----------
  const confirmSheet = $('#confirmSheet');
  let confirmResolve = null;
  function askConfirm({ title, text, yes }) {
    if (confirmResolve) confirmResolve(false);
    $('#confirmTitle').textContent = title;
    $('#confirmText').textContent = text;
    $('#confirmYes').textContent = yes;
    openPanel(confirmSheet, '[data-confirm="no"]');
    return new Promise((resolve) => { confirmResolve = resolve; });
  }
  function answerConfirm(ok) {
    if (!confirmResolve) return;
    const r = confirmResolve;
    confirmResolve = null;
    closePanel(confirmSheet);
    r(ok);
  }
  confirmSheet.addEventListener('click', (e) => {
    const b = e.target.closest('[data-confirm]');
    if (b) return answerConfirm(b.dataset.confirm === 'yes');
    if (e.target === confirmSheet) answerConfirm(false);
  });

  // ---------- Felles for skuffene (åpne/lukke med animasjon) ----------
  function openPanel(el, focusSel) {
    el.classList.remove('closing');
    el.hidden = false;
    if (focusSel) $(focusSel, el)?.focus({ preventScroll: true });
  }
  function closePanel(el) {
    if (el.hidden || el.classList.contains('closing')) return;
    if (reduceMotion.matches) { el.hidden = true; return; }
    el.classList.add('closing');
    setTimeout(() => { el.hidden = true; el.classList.remove('closing'); }, 210);
  }

  // ---------- Valgmeny: endre utsnitt / slett ----------
  const menuSheet = $('#menuSheet');
  const editSheet = $('#editSheet');
  let menuId = null;

  function openMenu(id) {
    const h = byId.get(id);
    if (!h) return;
    menuId = id;
    menuSheet.style.setProperty('--hue', hue(h.book));
    $('#menuPreview').textContent = stripQuotes(h.text);
    $('#menuBook').textContent = h.book;
    openPanel(menuSheet, '[data-menu="edit"]');
  }
  menuSheet.addEventListener('click', (e) => {
    const b = e.target.closest('[data-menu]');
    if (!b && e.target !== menuSheet) return;
    closePanel(menuSheet);
    if (!b) return;
    if (b.dataset.menu === 'edit') setTimeout(() => openEdit(menuId), reduceMotion.matches ? 0 : 160);
    if (b.dataset.menu === 'delete') deleteHighlight(menuId);
  });

  // Oppdaterer et kort som allerede vises (etter at utsnittet er endret).
  function refreshHighlight() {
    renderDeck(true);
    if (currentView === 'favs') renderFavs(false);
  }

  function deleteHighlight(id) {
    const h = byId.get(id);
    if (!h) return;
    const hIdx = highlights.indexOf(h);
    const favTs = favs[id];
    const oi = order.indexOf(h);

    highlights.splice(hIdx, 1);
    byId.delete(id);
    delete favs[id];
    deleted[id] = h;
    if (oi >= 0) {
      const ci = idx(pos);
      order.splice(oi, 1);
      pos = order.length ? (oi < ci ? ci - 1 : Math.min(ci, order.length - 1)) : 0;
    }
    save();
    updateCounts();
    if (!highlights.length) buildFeed();
    else renderDeck(true);
    if (currentView === 'favs') renderFavs(false);

    toast('Highlight slettet', {
      label: 'Angre',
      run: () => {
        delete deleted[id];
        highlights.splice(Math.min(hIdx, highlights.length), 0, h);
        byId.set(id, h);
        if (favTs) favs[id] = favTs;
        save();
        if (highlights.length === 1) buildFeed();
        else if (oi >= 0) {
          order.splice(oi, 0, h);
          pos = oi;
          renderDeck(true);
        }
        updateCounts();
        if (currentView === 'favs') renderFavs(false);
      },
    });
  }

  // Ordvelger: første trykk = første ord, andre trykk = siste ord.
  let edit = null;
  const words = (s) => s.split(/\s+/).filter(Boolean);

  function openEdit(id) {
    const h = byId.get(id);
    if (!h) return;
    const all = words(h.original || h.text);
    const cur = words(h.text);
    let start = 0;
    for (let i = 0; i + cur.length <= all.length; i++) {
      if (all.slice(i, i + cur.length).join(' ') === cur.join(' ')) { start = i; break; }
    }
    edit = { id, all, start, end: Math.min(all.length - 1, start + cur.length - 1), next: 'start' };
    editSheet.style.setProperty('--hue', hue(h.book));
    $('#editBook').textContent = h.book;
    renderEdit();
    openPanel(editSheet, '[data-edit="save"]');
  }
  function renderEdit() {
    const { all, start, end } = edit;
    $('#editWords').innerHTML = all.map((w, i) => {
      const cls = ['w'];
      if (i < start || i > end) cls.push('out');
      if (i === start) cls.push('first');
      if (i === end) cls.push('last');
      return `<button type="button" class="${cls.join(' ')}" data-i="${i}">${esc(w)}</button>`;
    }).join(' ');
    const n = end - start + 1;
    $('#editStep').textContent = edit.next === 'start' ? 'Trykk på første ord' : 'Trykk nå på siste ord';
    $('#editCount').textContent = n === all.length ? `Hele teksten · ${all.length} ord` : `${n} av ${all.length} ord`;
    $('[data-edit="reset"]', editSheet).disabled = n === all.length;
  }
  editSheet.addEventListener('click', (e) => {
    if (e.target === editSheet || e.target.closest('[data-edit="cancel"]')) return closePanel(editSheet);
    const w = e.target.closest('.w');
    if (w) {
      const i = +w.dataset.i;
      if (edit.next === 'start') {
        edit.start = i;
        edit.end = edit.all.length - 1;
        edit.next = 'end';
      } else {
        if (i < edit.start) { edit.end = edit.start; edit.start = i; } else edit.end = i;
        edit.next = 'start';
      }
      return renderEdit();
    }
    if (e.target.closest('[data-edit="reset"]')) { edit.start = 0; edit.end = edit.all.length - 1; edit.next = 'start'; return renderEdit(); }
    if (e.target.closest('[data-edit="save"]')) {
      const h = byId.get(edit.id);
      const full = h.original || h.text;
      const text = edit.all.slice(edit.start, edit.end + 1).join(' ');
      if (text === words(full).join(' ')) { h.text = full; delete h.original; }
      else { h.original = full; h.text = text; }
      save();
      closePanel(editSheet);
      refreshHighlight(edit.id);
      toast('Utsnittet er lagret');
    }
  });

  // ---------- Visninger ----------
  let currentView = 'feed';
  const VIEWS = ['feed', 'favs', 'library'];
  function showView(v) {
    currentView = v;
    document.body.dataset.view = v;
    $$('.view').forEach((el) => el.classList.toggle('active', el.id === 'view-' + v));
    $$('.tab').forEach((el) => {
      el.classList.toggle('active', el.dataset.view === v);
      if (el.dataset.view === v) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
    });
    $('.tab-island').style.setProperty('--tab-i', VIEWS.indexOf(v));
    if (v === 'favs') renderFavs();
    if (v === 'library') updateCounts();
    updateChrome();
  }
  function updateChrome() {
    const filtered = !!filterBook;
    $('#brand').hidden = filtered;
    const chip = $('#filterChip');
    chip.hidden = !filtered;
    if (filtered) {
      chip.style.setProperty('--hue', hue(filterBook));
      $('#filterLabel').textContent = filterBook;
    }
    $('#feedActions').hidden = highlights.length === 0;
    $('#shuffleBtn').hidden = filtered;
  }
  function updateCounts() {
    const nf = new Intl.NumberFormat('nb-NO');
    $('#statHl').textContent = nf.format(highlights.length);
    $('#statBooks').textContent = nf.format(new Set(highlights.map((h) => h.book)).size);
    $('#statFavs').textContent = nf.format(Object.keys(favs).filter((id) => byId.has(id)).length);
    const nDel = Object.keys(deleted).length;
    $('#restoreBtn').hidden = nDel === 0;
    $('#restoreBtn').textContent = `Gjenopprett slettede (${nf.format(nDel)})`;
  }

  $$('.tab').forEach((t) => t.addEventListener('click', () => {
    if (t.dataset.view === currentView && currentView === 'feed') go(0);
    showView(t.dataset.view);
  }));
  $('#filterChip').addEventListener('click', () => { filterBook = null; buildFeed(); });
  $('#booksBtn').addEventListener('click', openSheet);
  $('#shuffleBtn').addEventListener('click', () => {
    const b = $('#shuffleBtn svg');
    if (b && !reduceMotion.matches) b.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(180deg)' }], { duration: 420, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    buildFeed();
    toast('Blandet på nytt');
  });

  // ---------- Import ----------
  // ---------- Duplikatsjekk ved import ----------
  // Løs sammenligning: ignorerer store/små bokstaver, tegnsetting, anførselstegn og mellomrom,
  // så samme highlight fra My Clippings, HTML og CSV gjenkjennes.
  const loose = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, '');
  const looseBook = (b) => loose(String(b).replace(/\s*[([].*?[)\]]\s*/g, ' ').split(/[:–—]| - /)[0]);
  const sameBook = (a, b) => {
    const x = looseBook(a), y = looseBook(b);
    return x === y || (x.length > 3 && y.length > 3 && (x.startsWith(y) || y.startsWith(x)));
  };
  const nearLoc = (a, b) => a.loc == null || b.loc == null || Math.abs(a.loc - b.loc) < 15;

  function merge(items) {
    const now = Date.now();
    let added = 0, skipped = 0, updated = 0;
    const books = new Set();
    // Alt vi kjenner fra før, også slettede highlights (de skal ikke komme tilbake).
    const known = [];
    const exact = new Map();
    const remember = (h, del) => { const k = { h, t: loose(h.original || h.text), del }; known.push(k); exact.set(k.t, k); return k; };
    highlights.forEach((h) => remember(h, false));
    Object.values(deleted).forEach((h) => remember(h, true));

    for (const it of items) {
      const t = loose(it.text);
      if (!t) continue;
      const id = hash(it.book + '\u0000' + it.text.replace(/\s+/g, ' ').trim().toLowerCase());

      // 1) Finnes allerede (samme tekst i samme bok).
      let match = exact.get(t);
      if (match && !sameBook(match.h.book, it.book)) match = null;
      if (!match && (byId.has(id) || deleted[id])) match = { h: byId.get(id) || deleted[id], del: !byId.has(id) };
      if (match) {
        if (!match.del) {
          if (it.note && !match.h.note) match.h.note = it.note;
          if (it.starred && !favs[match.h.id]) favs[match.h.id] = now;
        }
        skipped++;
        continue;
      }

      // 2) En kortere eller lengre versjon av samme highlight (f.eks. utvidet på Kindlen).
      const overlap = t.length > 15 && known.find((k) => k.t.length > 15 && sameBook(k.h.book, it.book) && nearLoc(k.h, it) && (k.t.includes(t) || t.includes(k.t)));
      if (overlap) {
        if (overlap.del || overlap.t.includes(t)) { skipped++; continue; } // vi har allerede den lengre versjonen
        const h = overlap.h; // den nye er lengre: oppdater den eksisterende og behold favoritt og utsnitt
        if (h.original) h.original = it.text; else h.text = it.text;
        if (it.loc != null) { h.loc = it.loc; h.locEnd = it.locEnd; }
        if (it.page) h.page = it.page;
        if (it.note && !h.note) h.note = it.note;
        if (it.starred && !favs[h.id]) favs[h.id] = now;
        exact.delete(overlap.t);
        overlap.t = t;
        exact.set(t, overlap);
        updated++;
        continue;
      }

      // 3) Ny highlight.
      if (it.starred && !favs[id]) favs[id] = now;
      const h = {
        id, book: it.book, author: it.author, text: it.text, note: it.note || '',
        loc: it.loc, locEnd: it.locEnd, page: it.page, date: it.date, kind: it.kind,
        added: now, n: highlights.length,
      };
      highlights.push(h);
      byId.set(id, h);
      remember(h, false);
      added++;
      books.add(it.book);
    }
    save();
    return { added, books: books.size, skipped, updated };
  }

  function importMessage(res) {
    if (!res.added && !res.updated) return res.skipped === 1 ? "Ingen nye highlights. Den fantes fra før." : res.skipped ? `Ingen nye highlights. Alle ${res.skipped} fantes fra før.` : 'Fant ingen highlights i filen.';
    const parts = [];
    if (res.added) parts.push(`La til ${plural(res.added, 'ny highlight', 'nye highlights')} fra ${plural(res.books, 'bok', 'bøker')}`);
    if (res.updated) parts.push(`${res.updated} oppdatert`);
    if (res.skipped) parts.push(`${res.skipped} fantes fra før`);
    return parts.join(' · ');
  }

  function afterImport(res) {
    filterBook = null;
    showView('feed');
    buildFeed();
    toast(importMessage(res));
  }

  // ---------- Sikkerhetskopi (for å flytte alt til en annen enhet) ----------
  function backupData() {
    return {
      source: 'lesebok-backup', version: 1, exported: new Date().toISOString(),
      highlights, favorites: favs, deleted,
      covers: store.get(COVER_KEY, {}),
    };
  }
  async function exportBackup() {
    const d = new Date();
    const name = `lesebok-sikkerhetskopi-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
    const file = new File([JSON.stringify(backupData())], name, { type: 'application/json' });
    // På iPhone/Mac: del-arket gir AirDrop direkte. Ellers: last ned fila.
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Lesebok – sikkerhetskopi' }); return; }
      catch (e) { if (e && e.name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('Sikkerhetskopien er lastet ned.');
  }
  // Legger sammen sikkerhetskopien med det som finnes. Ingenting du har fra før blir borte.
  function restoreBackup(obj) {
    let added = 0;
    (obj.highlights || []).forEach((h) => {
      if (!h || !h.id || byId.has(h.id) || deleted[h.id]) return;
      h.n = highlights.length;
      highlights.push(h);
      byId.set(h.id, h);
      added++;
    });
    Object.entries(obj.favorites || {}).forEach(([id, ts]) => { if (byId.has(id) && !favs[id]) favs[id] = ts; });
    Object.entries(obj.deleted || {}).forEach(([id, h]) => { if (!byId.has(id) && !deleted[id]) deleted[id] = h; });
    Object.entries(obj.covers || {}).forEach(([b, c]) => { if (!covers[b]) covers[b] = c; });
    store.set(COVER_KEY, covers);
    save();
    filterBook = null;
    showView('feed');
    buildFeed();
    updateCounts();
    const books = new Set(highlights.map((h) => h.book)).size;
    const inFile = (obj.highlights || []).length;
    toast(added
      ? `Gjenopprettet ${plural(added, 'highlight', 'highlights')}. Du har nå ${plural(highlights.length, 'highlight', 'highlights')} fra ${plural(books, 'bok', 'bøker')}.`
      : inFile
        ? `Alle ${plural(inFile, 'highlight', 'highlights')} i sikkerhetskopien fantes fra før.`
        : 'Sikkerhetskopien er tom. Eksporter den fra Leseboka der bøkene dine ligger.');
  }

  async function importFiles(files) {
    let all = [];
    const errors = [];
    for (const f of files) {
      try {
        const text = await f.text();
        if (/^\s*\{/.test(text) && text.includes('"lesebok-backup"')) { restoreBackup(JSON.parse(text)); continue; }
        all = all.concat(KindleParsers.parse(text, f.name));
      } catch (e) { errors.push(`${f.name}: ${e.message}`); }
    }
    if (!all.length && !errors.length) return;
    if (!all.length && errors.length) return toast(`${errors[0]}. Velg My Clippings.txt, eller en HTML- eller CSV-eksport fra Kindle-appen.`);
    afterImport(merge(all));
  }

  const fileInput = $('#fileInput');
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) importFiles([...fileInput.files]);
    fileInput.value = '';
  });

  async function loadSample() {
    try {
      const res = await fetch('sample-clippings.txt');
      afterImport(merge(KindleParsers.parse(await res.text(), 'My Clippings.txt')));
    } catch {
      toast('Kunne ikke laste eksempeldata');
    }
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-action]');
    if (!a) return;
    const act = a.dataset.action;
    if (act === 'import') fileInput.click();
    else if (act === 'sample') loadSample();
    else if (act === 'copy-bookmarklet') copyBookmarklet();
    else if (act === 'export-backup') exportBackup();
    else if (act === 'restore') {
      const list = Object.values(deleted);
      if (!list.length) return;
      list.forEach((h) => { if (!byId.has(h.id)) { highlights.push(h); byId.set(h.id, h); } });
      deleted = {};
      save();
      filterBook = null;
      buildFeed();
      updateCounts();
      toast(`Gjenopprettet ${plural(list.length, 'highlight', 'highlights')}`);
    }
    else if (act === 'clear') {
      if (!highlights.length && !Object.keys(deleted).length) return toast('Det er ingenting å slette');
      askConfirm({
        title: 'Slette alle data?',
        text: `Alle ${plural(highlights.length, 'highlight', 'highlights')}, favoritter og slettede highlights fjernes fra denne enheten, i begge variantene av appen. Dette kan ikke angres.`,
        yes: 'Slett alt',
      }).then((ok) => { if (ok) clearAll(); });
    }
  });

  function clearAll() {
      highlights = [];
      favs = {};
      deleted = {};
      store.del(KEY.hl);
      store.del(KEY.fav);
      store.del(KEY.del);
      reindex();
      filterBook = null;
      buildFeed();
      updateCounts();
      toast('Alt er slettet');
  }

  document.addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('dragging'); });
  document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    document.body.classList.remove('dragging');
    if (e.dataTransfer.files.length) importFiles([...e.dataTransfer.files]);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (confirmResolve) return answerConfirm(false);
      closeSheet(); closePanel(menuSheet); closePanel(editSheet);
    }
    if (currentView !== 'feed' || !sheet.hidden || !menuSheet.hidden || !editSheet.hidden || !confirmSheet.hidden) return;
    if (e.target.closest && e.target.closest('input, textarea')) return;
    if (['ArrowRight', 'ArrowDown', 'j', 'PageDown'].includes(e.key)) { go(pos + 1); e.preventDefault(); }
    if (['ArrowLeft', 'ArrowUp', 'k', 'PageUp'].includes(e.key)) { go(pos - 1); e.preventDefault(); }
  });

  // ---------- Hent rett fra Kindle (bokmerke på Amazons notatbokside) ----------
  const APP_URL = location.origin + location.pathname.replace(/[^/]*$/, '');
  let bookmarkletCode = '';
  fetch('kindle-sync.js').then((r) => r.text()).then((src) => {
    // Fjern kommentarer og innrykk, sett inn appens adresse, og pakk inn i void(...)
    // så nettleseren aldri bytter ut siden med resultatet.
    const code = src.split('__APP_URL__').join(APP_URL)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s+/gm, '')
      .replace(/\n{2,}/g, '\n')
      .trim()
      .replace(/;$/, '');
    bookmarkletCode = 'javascript:void(' + encodeURIComponent(code) + ')';
    $('#bookmarklet').setAttribute('href', bookmarkletCode);
  }).catch(() => {});

  $('#bookmarklet').addEventListener('click', (e) => {
    e.preventDefault();
    toast('Dra knappen opp til bokmerkelinjen, og bruk den på Amazons notatbokside.');
  });

  async function copyBookmarklet() {
    if (!bookmarkletCode) return toast('Koden er ikke klar ennå. Prøv igjen om et øyeblikk.');
    try {
      await navigator.clipboard.writeText(bookmarkletCode);
      toast('Koden er kopiert. Lim den inn som adresse i et bokmerke.');
    } catch {
      toast('Kunne ikke kopiere. Trykk og hold på knappen «Hent til Lesebok» og velg Kopier lenke.');
    }
  }

  // Tar imot highlights fra bokmerket. Godtar bare meldinger fra Amazons notatbokside (og appen selv).
  const handledImports = new Set();
  const trustedOrigin = (o) => o === location.origin || /^https:\/\/(read|lesen|lire|leer|leggi|ler)\.amazon\.[a-z.]+$/.test(o);
  window.addEventListener('message', (e) => {
    if (!trustedOrigin(e.origin) || !e.data || e.data.type !== 'lesebok-import' || !e.data.payload) return;
    const payload = e.data.payload;
    const reply = (message) => { try { e.source.postMessage({ type: 'lesebok-received', message }, e.origin); } catch { /* fanen er lukket */ } };
    if (handledImports.has(payload.id)) return reply('Highlightsene er allerede lagt inn.');
    handledImports.add(payload.id);
    try {
      const res = merge(KindleParsers.parseNotebookJSON(payload));
      const books = (payload.books || []).length;
      const found = (payload.books || []).reduce((n, b) => n + (b.highlights || []).length, 0);
      const summary = `${importMessage(res).replace(/\.$/, '')}. Hentet ${plural(found, 'highlight', 'highlights')} fra ${plural(books, 'bok', 'bøker')} hos Amazon.`;
      afterImport(res);
      toast(summary);
      reply(summary);
    } catch (err) {
      toast('Kunne ikke lese dataene fra Kindle: ' + err.message);
      reply('Leseboka kunne ikke lese dataene.');
    }
  });
  // Si fra til Amazon-fanen at appen er klar.
  // Direkte lenker: …/#bibliotek og …/#favoritter
  const HASH_VIEWS = { '#bibliotek': 'library', '#favoritter': 'favs', '#les': 'feed' };
  const openFromHash = () => { if (HASH_VIEWS[location.hash]) showView(HASH_VIEWS[location.hash]); };
  window.addEventListener('hashchange', openFromHash);
  setTimeout(openFromHash, 0);
  if (location.hash === '#kindle') {
    try { if (window.opener) window.opener.postMessage({ type: 'lesebok-ready' }, '*'); } catch { /* ingen kontakt */ }
    history.replaceState(null, '', location.pathname);
  }

  // ---------- Utseende ----------
  const THEME_KEY = 'kh:theme';
  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
  let themePref = (() => { try { return localStorage.getItem(THEME_KEY) || 'dark'; } catch { return 'dark'; } })();
  function applyTheme() {
    const dark = themePref === 'dark' || (themePref === 'system' && darkQuery.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    $('#themeColor').content = dark ? '#2a1f18' : '#eadfcd';
    $$('[data-theme-pref]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.themePref === themePref)));
  }
  $$('[data-theme-pref]').forEach((b) => b.addEventListener('click', () => {
    themePref = b.dataset.themePref;
    try { localStorage.setItem(THEME_KEY, themePref); } catch { /* ignorer */ }
    applyTheme();
  }));
  darkQuery.addEventListener('change', () => { if (themePref === 'system') applyTheme(); });
  applyTheme();

  // ---------- Start ----------
  hydrateIcons();
  buildFeed();
  updateCounts();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
