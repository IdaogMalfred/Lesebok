/*
 * Parsere for Kindle-eksporter.
 *  - "My Clippings.txt" fra Kindle-enheten
 *  - "Eksporter notatbok" (HTML) fra Kindle-appen
 *  - CSV-eksport fra Kindle-appen
 * Returnerer en liste med { book, author, text, note, loc, locEnd, page, date, kind, starred, seq }.
 */
(function (global) {
  'use strict';

  const NOTE_RE = /\b(note|notat|notiz|nota|remarque|notitie|anteckning)\b/i;
  const HIGHLIGHT_RE = /(highlight|markering|utheving|markierung|surlign|subrayado|evidenziazione|destaque)/i;
  const BOOKMARK_RE = /(bookmark|bokmerke|lesezeichen|marcador|signet|segnalibro|bladwijzer|bokmärke)/i;
  const LOC_RE = /(?:location|loc\.?|posisjon|position|emplacement|posición|posizione|posição|positie|plats)\s*([\d,.]+)(?:\s*[-–]\s*([\d,.]+))?/i;
  const PAGE_RE = /(?:page|side|seite|página|pagina|sida)\s*([\dívxlc]+)/i;
  const DATE_PREFIX_RE = /^(added on|lagt til|hinzugefügt am|ajouté le|añadido el|aggiunto il|toegevoegd op|tillagd)\s*/i;

  const num = (s) => (s ? parseInt(String(s).replace(/[^\d]/g, ''), 10) : null);
  const squash = (s) => s.replace(/\s+/g, ' ').trim();

  function decodeEntities(s) {
    return s
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
      .replace(/&nbsp;/g, ' ')
      .replace(/&quot;/g, '"')
      .replace(/&apos;|&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .trim();
  }

  // "Aurelius, Marcus" -> "Marcus Aurelius"; flere forfattere skilles med ";"
  function cleanAuthor(a) {
    return a
      .split(';')
      .map((s) => {
        s = s.trim();
        const parts = s.split(',');
        if (parts.length === 2 && parts[1].trim()) return parts[1].trim() + ' ' + parts[0].trim();
        return s;
      })
      .filter(Boolean)
      .join(', ');
  }

  function splitTitleAuthor(line) {
    line = line.replace(/^﻿/, '').trim();
    const m = line.match(/^(.*\S)\s*\(([^()]+)\)$/);
    if (m) return { book: m[1].trim(), author: cleanAuthor(m[2]) };
    return { book: line, author: '' };
  }

  function metaInfo(meta) {
    const l = meta.match(LOC_RE);
    const p = meta.match(PAGE_RE);
    const loc = l ? num(l[1]) : null;
    return { loc, locEnd: l && l[2] ? num(l[2]) : loc, page: p ? p[1] : null };
  }

  function kindOf(meta) {
    if (BOOKMARK_RE.test(meta)) return 'bookmark';
    if (NOTE_RE.test(meta) && !HIGHLIGHT_RE.test(meta)) return 'note';
    return 'highlight';
  }

  // Fjerner duplikater (Kindle lagrer en ny kopi når du utvider en markering)
  // og fester notater til markeringen de hører til.
  function finalize(raw) {
    const hls = raw.filter((r) => r.kind === 'highlight').map((r) => ({ ...r, text: squash(r.text) }));
    const notes = raw.filter((r) => r.kind === 'note');

    const near = (a, b) =>
      a.loc == null || b.loc == null || (a.loc <= (b.locEnd ?? b.loc) + 5 && (a.locEnd ?? a.loc) >= b.loc - 5);

    const byBook = new Map();
    hls.forEach((h) => {
      if (!byBook.has(h.book)) byBook.set(h.book, []);
      byBook.get(h.book).push(h);
    });

    const keep = [];
    for (const list of byBook.values()) {
      for (const h of list) {
        const lower = h.text.toLowerCase();
        const dominated = list.some(
          (o) =>
            o !== h &&
            o.text.length >= h.text.length &&
            (o.text.length > h.text.length || o.seq > h.seq) &&
            o.text.toLowerCase().includes(lower) &&
            near(h, o)
        );
        if (!dominated) keep.push(h);
      }
    }

    for (const n of notes) {
      const text = n.text.trim();
      if (!text) continue;
      const cands = keep.filter(
        (h) => h.book === n.book && h.kind === 'highlight' && h.loc != null && n.loc != null &&
          n.loc >= h.loc - 1 && n.loc <= (h.locEnd ?? h.loc) + 1
      );
      if (cands.length) {
        const h = cands.reduce((a, b) => (Math.abs((b.locEnd ?? b.loc) - n.loc) < Math.abs((a.locEnd ?? a.loc) - n.loc) ? b : a));
        h.note = h.note ? h.note + '\n' + text : text;
      } else {
        keep.push({ ...n, text: squash(text) });
      }
    }

    return keep.sort((a, b) => a.seq - b.seq).map((h) => ({
      book: h.book || 'Ukjent bok',
      author: h.author || '',
      text: h.text,
      note: h.note || '',
      loc: h.loc,
      locEnd: h.locEnd,
      page: h.page,
      date: h.date || '',
      kind: h.kind,
      starred: !!h.starred,
      seq: h.seq,
    }));
  }

  function parseClippings(text) {
    const raw = [];
    text
      .replace(/\r\n?/g, '\n')
      .split(/^==========\s*$/m)
      .forEach((chunk, i) => {
        const lines = chunk.split('\n');
        while (lines.length && !lines[0].trim()) lines.shift();
        if (lines.length < 2) return;
        const meta = lines[1].trim();
        if (!meta.startsWith('-')) return;
        const kind = kindOf(meta);
        const body = lines.slice(2).join('\n').trim();
        if (kind === 'bookmark' || !body) return;
        const parts = meta.split('|');
        const date = parts.length > 1 ? parts[parts.length - 1].trim().replace(DATE_PREFIX_RE, '') : '';
        raw.push({ ...splitTitleAuthor(lines[0]), ...metaInfo(meta), kind, text: body, date, seq: i });
      });
    return finalize(raw);
  }

  function parseNotebookHTML(html) {
    // Kindle-eksporten har ugyldig HTML (f.eks. <div class='noteText'>…</h3>), så vi leser den med regex.
    const re = /<(?:div|h\d)[^>]*class\s*=\s*["']?(bookTitle|authors|noteHeading|noteText)\b[^>]*>([\s\S]*?)(?=<\/?(?:div|h\d)\b|$)/gi;
    const raw = [];
    let book = '';
    let author = '';
    let heading = null;
    let seq = 0;
    let m;
    while ((m = re.exec(html))) {
      const cls = m[1];
      const val = decodeEntities(m[2]);
      if (cls === 'bookTitle') book = val;
      else if (cls === 'authors') author = cleanAuthor(val);
      else if (cls === 'noteHeading') heading = val;
      else if (cls === 'noteText' && heading != null) {
        const kind = kindOf(heading);
        if (kind !== 'bookmark' && val) raw.push({ book, author, ...metaInfo(heading), kind, text: val, date: '', seq: seq++ });
        heading = null;
      }
    }
    return finalize(raw);
  }

  function parseCSVRows(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; } else q = false;
        } else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  function parseKindleCSV(text) {
    const rows = parseCSVRows(text.replace(/^﻿/, ''));
    const hi = rows.findIndex((r) => r.some((c) => /annotation type/i.test(c)));
    if (hi < 0) throw new Error('Fant ikke kolonnen «Annotation Type» i CSV-filen');
    const header = rows[hi].map((c) => c.trim().toLowerCase());
    const col = (re, fallback) => { const i = header.findIndex((h) => re.test(h)); return i < 0 ? fallback : i; };
    const typeCol = col(/type/, 0);
    const locCol = col(/location|page/, 1);
    const starCol = col(/starred/, -1);
    const textCol = col(/^annotation$/, header.length - 1);

    const pre = rows.slice(0, hi).map((r) => (r[0] || '').trim()).filter(Boolean);
    const notesFor = pre.findIndex((l) => /notes for/i.test(l));
    const book = (notesFor >= 0 ? pre[notesFor + 1] : pre[0]) || 'Ukjent bok';
    const authorLine = pre.find((l) => /^(by|av)\s+/i.test(l));
    const author = authorLine ? cleanAuthor(authorLine.replace(/^(by|av)\s+/i, '')) : '';

    const raw = [];
    rows.slice(hi + 1).forEach((r, i) => {
      const type = r[typeCol] || '';
      const t = (r[textCol] || '').trim();
      if (!t) return;
      const kind = kindOf(type);
      if (kind === 'bookmark') return;
      raw.push({
        book, author, ...metaInfo(r[locCol] || ''), kind, text: t, date: '', seq: i,
        starred: starCol >= 0 && /^(yes|ja|true|1|\*)$/i.test((r[starCol] || '').trim()),
      });
    });
    return finalize(raw);
  }

  // Data fra «Hent til Lesebok»-bokmerket (Amazons notatbokside), som objekt eller JSON-tekst.
  function parseNotebookJSON(data) {
    const obj = typeof data === 'string' ? JSON.parse(data) : data;
    if (!obj || obj.source !== 'kindle-notebook' || !Array.isArray(obj.books)) throw new Error('Ukjent dataformat fra Kindle');
    const raw = [];
    let seq = 0;
    obj.books.forEach((b) => {
      const book = String(b.title || '').trim() || 'Ukjent bok';
      const author = cleanAuthor(String(b.author || ''));
      (b.highlights || []).forEach((h) => {
        const text = String(h.text || '').trim();
        const note = String(h.note || '').trim();
        const loc = Number.isFinite(h.location) ? h.location : null;
        const base = { book, author, loc, locEnd: loc, page: h.page || null, date: '', seq: seq++ };
        if (text) raw.push({ ...base, kind: 'highlight', text, note });
        else if (note) raw.push({ ...base, kind: 'note', text: note });
      });
    });
    return finalize(raw);
  }

  function parse(text, filename = '') {
    const name = filename.toLowerCase();
    if (/^\s*\{/.test(text) && text.includes('kindle-notebook')) return parseNotebookJSON(text);
    if (/\.html?$/.test(name) || /class\s*=\s*["']?noteHeading/i.test(text)) return parseNotebookHTML(text);
    if (/^==========\s*$/m.test(text)) return parseClippings(text);
    if (/annotation type/i.test(text) || name.endsWith('.csv')) return parseKindleCSV(text);
    throw new Error('Fant ingen Kindle-highlights i filen');
  }

  const api = { parse, parseClippings, parseNotebookHTML, parseKindleCSV, parseNotebookJSON };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.KindleParsers = api;
})(typeof window !== 'undefined' ? window : globalThis);
