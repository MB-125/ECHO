// Tidy: every page shows the least you need, and the rest when you ask for it.
//
// Whatever a panel draws (the journal, the character page, a town's notice board, a shop, the
// chronicle…), Tidy goes over it as it appears:
//   • a row of more than seven tabs shows the first few and the one you are on, and "More ▾";
//   • a long note at the head of a page shows its first line (click it for the rest);
//   • a long card shows its title, its first line and its buttons, and "More ▾" for the rest;
//   • a long list shows its first six, and "Show N more".
// What you open stays open while you play. Esc → Gameplay → Pages: "Simple" (this) or "Everything"
// (as it was). Nothing is taken out: it is all one click away.
(function () {
  const TIDY = ECHO.Tidy = {
    open: new Set(),
    TABS: 7, LIST: 8, LIST_SHOW: 6, CARD: 240, NOTE: 120,
    on() { const s = ECHO.UI && ECHO.UI.settings; return !s || s.pages !== 'all'; },
    key(el) { const h = el.querySelector && el.querySelector('h3, h4, h5, b'); return ((h ? h.textContent : el.textContent) || '').trim().slice(0, 70); },
    acts(el) { return el.matches('button, input, select, textarea, .row, .tabs, canvas, img') || !!el.querySelector('button, input, select, textarea, canvas'); },
    bar(el) { const h = parseFloat(el.style && el.style.height); return (h && h <= 8) || el.classList.contains('xp') || el.classList.contains('t'); },
    inside(el, sel) { return !!el.closest(sel); },

    apply(root) {
      if (!root || !TIDY.on()) return;
      const panel = root.closest && root.closest('#panel');
      if (panel && panel.dataset.kind === 'map') return;     // (the map is its own console)
      try { TIDY.tabs(root); TIDY.sections(root); TIDY.notes(root); TIDY.cards(root); TIDY.lists(root); } catch (err) { console.error('ECHO tidy', err); }
    },
    // ------------------------------------------------------------ a long row of tabs
    tabs(root) {
      for (const row of root.querySelectorAll('.tabs')) {
        if (row.dataset.tidy) continue;
        const bs = Array.from(row.children).filter(b => b.tagName === 'BUTTON');
        if (bs.length <= TIDY.TABS) continue;
        row.dataset.tidy = '1';
        const on = bs.find(b => b.classList.contains('on')), keep = new Set(bs.slice(0, TIDY.TABS - 2));
        if (on) keep.add(on);
        for (const b of bs) if (!keep.has(b)) b.classList.add('tidy-x');
        const more = document.createElement('button');
        more.className = 'tidy-tabmore'; more.type = 'button';
        const n = bs.filter(b => b.classList.contains('tidy-x')).length;
        more.textContent = `More ▾ (${n})`;
        more.addEventListener('click', ev => { ev.stopPropagation(); const o = row.classList.toggle('tidy-open'); more.textContent = o ? 'Fewer ▴' : `More ▾ (${n})`; });
        row.appendChild(more);
      }
    },
    // ------------------------------------------------------------ a long page of many parts
    // (the first two parts open; each of the rest folded under its heading, a click away)
    sections(root) {
      const parents = new Set();
      for (const h of root.querySelectorAll('h3')) if (!h.closest('.card, #modal, .tidy-skip, section[data-csec], .tidy-sec')) parents.add(h.parentElement);
      for (const par of parents) {
        if (!par) continue;
        const hs = Array.from(par.children).filter(c => c.tagName === 'H3');
        if (hs.length < 5 || hs.some(h => h.dataset.tidy)) continue;   // (marked on the headings, which are new each time a page is drawn)
        for (const h of hs) h.dataset.tidy = '1';
        hs.slice(2).forEach(h => {
          const box = document.createElement('div'); box.className = 'tidy-sec';
          let n = h.nextSibling;
          while (n && !(n.nodeType === 1 && n.tagName === 'H3')) { const nx = n.nextSibling; box.appendChild(n); n = nx; }
          h.after(box);
          const k = 's:' + (h.textContent || '').trim().slice(0, 50);
          h.classList.add('tidy-fold');
          const set = o => { box.classList.toggle('tidy-hide', !o); h.classList.toggle('open', o); if (o) TIDY.open.add(k); else TIDY.open.delete(k); };
          h.addEventListener('click', () => set(!h.classList.contains('open')));
          set(TIDY.open.has(k));
        });
      }
    },
    // ------------------------------------------------------------ a long note at the head of a page
    notes(root) {
      for (const el of root.querySelectorAll('p.dim, p.prose, div.dim, p')) {
        if (el.dataset.tidy || el.closest('.card, .tabs, .row, button, .tidy-skip, .gear-slot, .prowess-card, .skill, #modal')) continue;
        if ((el.textContent || '').length < TIDY.NOTE || el.querySelector('button, input, a, select')) continue;
        el.dataset.tidy = '1';
        const k = 'n:' + (el.textContent || '').slice(0, 60);
        el.classList.add('tidy-clamp'); el.title = 'Click to read it all';
        if (TIDY.open.has(k)) el.classList.add('open');
        el.addEventListener('click', () => { const o = el.classList.toggle('open'); if (o) TIDY.open.add(k); else TIDY.open.delete(k); });
      }
    },
    // ------------------------------------------------------------ a long card
    cards(root) {
      for (const card of root.querySelectorAll('.card')) {
        if (card.dataset.tidy || card.classList.contains('idle') || card.closest('#modal, .tidy-skip')) continue;
        card.dataset.tidy = '1';
        let box = card;
        // (a card laid out as a picture and a column: the column is what has the words)
        const kids0 = Array.from(card.children);
        if (kids0.length <= 2) { const main = kids0.filter(k => !k.matches('img, canvas, svg')).sort((a, b) => (b.textContent || '').length - (a.textContent || '').length)[0]; if (main && main.children.length > 2) box = main; }
        const kids = Array.from(box.children);
        if ((card.textContent || '').length < TIDY.CARD || kids.length < 3) continue;
        const head = kids.find(k => k.matches('h3, h4, h5')) || kids[0];
        const hide = [];
        let first = true;
        for (const k of kids) {
          if (k === head || TIDY.acts(k) || TIDY.bar(k)) continue;
          if (first) { first = false; if ((k.textContent || '').length > 90) k.classList.add('tidy-clamp2'); continue; }
          hide.push(k);
        }
        if (!hide.length) continue;
        const k = 'c:' + TIDY.key(card);
        const more = document.createElement('button');
        more.className = 'tidy-more'; more.type = 'button';
        const set = o => { for (const h of hide) h.classList.toggle('tidy-hide', !o); card.classList.toggle('tidy-open', o); more.textContent = o ? 'Less ▴' : 'More ▾'; if (o) TIDY.open.add(k); else TIDY.open.delete(k); };
        more.addEventListener('click', ev => { ev.stopPropagation(); set(!card.classList.contains('tidy-open')); });
        // (the button goes after the words, before the buttons, so it sits where you are reading)
        const firstAct = kids.find(x => x !== head && TIDY.acts(x));
        if (firstAct) box.insertBefore(more, firstAct); else box.appendChild(more);
        set(TIDY.open.has(k));
      }
    },
    // ------------------------------------------------------------ a long list
    lists(root) {
      const seen = new Set();
      for (const card of root.querySelectorAll('.card, .dl')) {
        const par = card.parentElement;
        if (!par || seen.has(par) || par.closest('#modal, .tidy-skip')) continue;
        seen.add(par);
        const items = Array.from(par.children).filter(c => c.matches('.card, .dl'));
        if (items.length <= TIDY.LIST || items[0].dataset.tidyL) continue;
        for (const it of items) it.dataset.tidyL = '1';
        const rest = items.slice(TIDY.LIST_SHOW), k = 'l:' + TIDY.key(items[0]) + ':' + items.length;
        if (TIDY.open.has(k)) continue;
        for (const it of rest) it.classList.add('tidy-hide');
        const more = document.createElement('button');
        more.className = 'tidy-more tidy-list'; more.type = 'button';
        more.textContent = `Show ${rest.length} more ▾`;
        more.addEventListener('click', ev => { ev.stopPropagation(); for (const it of rest) it.classList.remove('tidy-hide'); TIDY.open.add(k); more.remove(); });
        rest[rest.length - 1].after(more);
      }
      // a long table: its first rows
      for (const tb of root.querySelectorAll('table tbody, table')) {
        if (tb.closest('#modal, .tidy-skip') || (tb.tagName === 'TABLE' && tb.querySelector('tbody'))) continue;
        const rows = Array.from(tb.children).filter(r => r.tagName === 'TR' && !r.querySelector('th'));
        if (rows.length <= TIDY.LIST || rows[0].dataset.tidyL) continue;
        for (const r of rows) r.dataset.tidyL = '1';
        const rest = rows.slice(TIDY.LIST_SHOW), k = 't:' + (rows[0].textContent || '').slice(0, 50) + ':' + rows.length;
        if (TIDY.open.has(k)) continue;
        for (const r of rest) r.classList.add('tidy-hide');
        const tr = document.createElement('tr'), td = document.createElement('td'), more = document.createElement('button');
        td.colSpan = 20; more.className = 'tidy-more tidy-list'; more.type = 'button'; more.textContent = `Show ${rest.length} more ▾`;
        more.addEventListener('click', ev => { ev.stopPropagation(); for (const r of rest) r.classList.remove('tidy-hide'); TIDY.open.add(k); tr.remove(); });
        td.appendChild(more); tr.appendChild(td); tb.appendChild(tr);
      }
    },
    // ------------------------------------------------------------ watching the panels
    watch() {
      if (TIDY._obs || typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;
      const targets = ['#panel .panel-body'].map(s => document.querySelector(s)).filter(Boolean);
      if (!targets.length) return;
      const obs = TIDY._obs = new MutationObserver(() => { for (const t of targets) TIDY.apply(t); obs.takeRecords(); });
      for (const t of targets) obs.observe(t, { childList: true, subtree: true });
    }
  };
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => TIDY.watch());
    else TIDY.watch();
  }
})();
