// ==UserScript==
// @name         Blocket Search CSV Capture (stable UI + counter + download + itemId)
// @namespace    http://tampermonkey.net/
// @version      2026-02-08
// @description  Capture Blocket listings into per-query storage, show counter, download on demand
// @author       You
// @match        https://www.blocket.se/recommerce/forsale/search*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  const UI_ID = 'blocket-capture-ui';
  const STORE_PREFIX = 'blocket_csv_store_v4:'; // bump so old hash-ids don't mix
  const CSV_COLUMNS = ['id', 'title', 'price_sek', 'place', 'lifetime', 'link'];

  // ---------------------------
  // UI
  // ---------------------------
  function ensureUI() {
    if (document.getElementById(UI_ID)) return;

    const wrap = document.createElement('div');
    wrap.id = UI_ID;

    wrap.style.position = 'fixed';
    wrap.style.right = '16px';
    wrap.style.bottom = '16px';
    wrap.style.zIndex = '2147483647';
    wrap.style.display = 'flex';
    wrap.style.gap = '8px';
    wrap.style.alignItems = 'center';
    wrap.style.padding = '10px';
    wrap.style.borderRadius = '12px';
    wrap.style.border = '1px solid rgba(0,0,0,0.15)';
    wrap.style.background = 'rgba(255,255,255,0.95)';
    wrap.style.boxShadow = '0 10px 26px rgba(0,0,0,0.18)';

    const btnCapture = makeBtn('Capture', '#111', '#fff');
    btnCapture.addEventListener('click', onCaptureClicked);

    const adsLabel = document.createElement('div');
    adsLabel.id = 'blocket-ads-counter';
    adsLabel.textContent = 'Ads: 0';
    adsLabel.style.fontSize = '14px';
    adsLabel.style.fontWeight = '700';
    adsLabel.style.color = '#111';
    adsLabel.style.padding = '10px 10px';
    adsLabel.style.borderRadius = '10px';
    adsLabel.style.border = '1px solid rgba(0,0,0,0.12)';
    adsLabel.style.background = '#fff';

    const btnClear = makeBtn('Clear', '#fff', '#111');
    btnClear.title = 'Clear stored rows for this query';
    btnClear.addEventListener('click', onClearClicked);

    const btnDownload = makeBtn('Download', '#111', '#fff');
    btnDownload.addEventListener('click', onDownloadClicked);

    wrap.appendChild(btnCapture);
    wrap.appendChild(adsLabel);
    wrap.appendChild(btnClear);
    wrap.appendChild(btnDownload);

    document.body.appendChild(wrap);
    updateCounter();
  }

  function makeBtn(text, bg, fg) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = text;
    btn.style.padding = '10px 12px';
    btn.style.borderRadius = '10px';
    btn.style.border = '1px solid rgba(0,0,0,0.2)';
    btn.style.background = bg;
    btn.style.color = fg;
    btn.style.fontSize = '14px';
    btn.style.fontWeight = '700';
    btn.style.cursor = 'pointer';
    btn.style.boxShadow = '0 6px 18px rgba(0,0,0,0.12)';
    btn.addEventListener('mouseenter', () => (btn.style.opacity = '0.9'));
    btn.addEventListener('mouseleave', () => (btn.style.opacity = '1'));
    return btn;
  }

  function setCounter(n) {
    const el = document.getElementById('blocket-ads-counter');
    if (el) el.textContent = `Ads: ${n}`;
  }

  function updateCounter() {
    const store = loadStore(getStoreKey());
    setCounter(store.rows.length);
  }

  // ---------------------------
  // Actions
  // ---------------------------
  async function onCaptureClicked() {
    const storeKey = getStoreKey();
    const store = loadStore(storeKey);

    const freshRows = extractListingsFromPage();
    if (!freshRows.length) return;

    for (const r of freshRows) {
      // Prefer Blocket's own item id from the link
      const itemId = extractItemIdFromLink(r.link);
      r.id = itemId || await sha256Hex(r.link || `${r.title}|${r.price_sek}|${r.place}|${r.lifetime}`);

      if (!store.ids.has(r.id)) {
        store.ids.add(r.id);
        store.rows.push(r);
      }
    }

    saveStore(storeKey, store);
    setCounter(store.rows.length);
  }

  function onClearClicked() {
    localStorage.removeItem(getStoreKey());
    setCounter(0);
  }

  function onDownloadClicked() {
    const query = getSearchQuery();
    const filename = buildFilename(query);

    const store = loadStore(getStoreKey());
    if (!store.rows.length) return;

    const csv = toCsv(store.rows);
    downloadTextFile(csv, filename, 'text/csv;charset=utf-8');
  }

  // ---------------------------
  // Extraction
  // ---------------------------
  function extractListingsFromPage() {
    const cards = Array.from(document.querySelectorAll('article.sf-search-ad'));
    const out = [];

    for (const card of cards) {
      const a = card.querySelector('a.sf-search-ad-link');
      const title = a ? a.textContent.trim() : '';
      const link = a ? absolutizeUrl(a.getAttribute('href')) : '';

      const priceSek = extractPriceSek(card);
      const { place, lifetime } = extractPlaceAndLifetime(card);

      if (!title && !link) continue;

      out.push({
        id: '',
        title: title || '',
        price_sek: Number.isFinite(priceSek) ? priceSek : '',
        place: place || '',
        lifetime: lifetime || '',
        link: link || ''
      });
    }

    return out;
  }

  function extractPriceSek(card) {
    const textNodes = Array.from(card.querySelectorAll('span, div'))
      .map(el => (el && el.textContent ? el.textContent.trim() : ''))
      .filter(Boolean);

    for (const t of textNodes) {
      const norm = t.replace(/\u00A0/g, ' ');
      const m = norm.match(/([0-9][0-9 \u00A0]*)\s*kr\b/i);
      if (m) {
        const digits = m[1].replace(/[^\d]/g, '');
        if (digits) return parseInt(digits, 10);
      }
    }
    return NaN;
  }

  function extractPlaceAndLifetime(card) {
    const metaDiv = card.querySelector('div.s-text-subtle');
    if (metaDiv) {
      const spans = Array.from(metaDiv.querySelectorAll('span'))
        .map(s => s.textContent.trim())
        .filter(Boolean);

      if (spans.length >= 2) return { place: spans[0], lifetime: spans[1] };
    }

    const spans = Array.from(card.querySelectorAll('span'))
      .map(s => s.textContent.trim())
      .filter(Boolean);

    const lifetimeIdx = spans.findIndex(t => /\b(min|tim|dag|veck|mån)\b/i.test(t));
    if (lifetimeIdx > 0) return { place: spans[lifetimeIdx - 1], lifetime: spans[lifetimeIdx] };

    return { place: '', lifetime: '' };
  }

  // ---------------------------
  // Store
  // ---------------------------
  function getSearchQuery() {
    const url = new URL(window.location.href);
    const q = (url.searchParams.get('q') || 'blocket').trim();
    return q || 'blocket';
  }

  function getStoreKey() {
    return STORE_PREFIX + getSearchQuery().toLowerCase();
  }

  function loadStore(key) {
    const raw = localStorage.getItem(key);
    if (!raw) return { rows: [], ids: new Set() };

    try {
      const parsed = JSON.parse(raw);
      const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
      const ids = new Set(Array.isArray(parsed.ids) ? parsed.ids : []);
      return { rows, ids };
    } catch {
      return { rows: [], ids: new Set() };
    }
  }

  function saveStore(key, store) {
    localStorage.setItem(key, JSON.stringify({
      rows: store.rows,
      ids: Array.from(store.ids)
    }));
  }

  // ---------------------------
  // CSV + download
  // ---------------------------
  function csvEscape(value) {
    const s = String(value ?? '');
    return `"${s.replace(/"/g, '""')}"`;
  }

  function toCsv(rows) {
    const header = CSV_COLUMNS.join(',');
    const lines = rows.map(r => [
      csvEscape(r.id),
      csvEscape(r.title),
      (r.price_sek === '' ? '' : String(r.price_sek)),
      csvEscape(r.place),
      csvEscape(r.lifetime),
      csvEscape(r.link),
    ].join(','));

    return [header, ...lines].join('\n') + '\n';
  }

  function buildFilename(query) {
    const safeQ = query
      .replace(/\s+/g, '_')
      .replace(/[^\w\-åäöÅÄÖ]/g, '_')
      .slice(0, 80);
    return `${safeQ}.csv`;
  }

  function downloadTextFile(text, filename, mime) {
    const blob = new Blob([text], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 250);
  }

  // ---------------------------
  // Utils
  // ---------------------------
  function absolutizeUrl(href) {
    if (!href) return '';
    try { return new URL(href, window.location.origin).toString(); }
    catch { return ''; }
  }

  // Extracts "20689928" from ".../item/20689928" (also handles trailing slashes / query)
  function extractItemIdFromLink(link) {
    if (!link) return '';
    try {
      const u = new URL(link);
      const parts = u.pathname.split('/').filter(Boolean);
      const itemIdx = parts.findIndex(p => p === 'item');
      if (itemIdx >= 0 && parts[itemIdx + 1] && /^\d+$/.test(parts[itemIdx + 1])) {
        return parts[itemIdx + 1];
      }
      // fallback: last numeric segment
      for (let i = parts.length - 1; i >= 0; i--) {
        if (/^\d+$/.test(parts[i])) return parts[i];
      }
    } catch {
      // ignore
    }
    return '';
  }

  async function sha256Hex(input) {
    const data = new TextEncoder().encode(String(input));
    const hashBuf = await crypto.subtle.digest('SHA-256', data);
    const hashArr = Array.from(new Uint8Array(hashBuf));
    return hashArr.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // ---------------------------
  // Keep UI alive without melting the page
  // ---------------------------
  ensureUI();

  let scheduled = false;
  const obs = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      if (!document.getElementById(UI_ID)) ensureUI();
    });
  });

  if (document.body) {
    obs.observe(document.body, { childList: true, subtree: true });
  }
})();

