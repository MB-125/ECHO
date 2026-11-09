// Gear & inventory: your hero in 3D wearing what you wear, the slots round them, and everything
// you carry in a grid — each piece framed in the colour of its rarity, with what it is worth to
// you at a glance (▲ better than what you wear). Hover a piece to compare it with what you wear
// (its power, and what it would do to your damage, armour, life and mana); click it, or drag it
// onto its slot, to put it on; drag a worn piece back to the grid to take it off; right-click
// for the rest (give it away, keep it). Arrow keys and Enter work too.
// Opened with I, or the character page's Gear tab. Nothing new is saved: it is a way of looking
// at (and changing) what you already have.
(function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const G = () => ECHO.Gear, A = () => ECHO.Arcana;
  const FILTERS = [['all', 'All'], ['sword', 'Weapons'], ['bow', 'Bows'], ['armor', 'Armour'], ['relic', 'Relics']];
  const SORTS = [['best', 'Best'], ['rarity', 'Rarity'], ['new', 'Newest']];
  const SLOT_OF = { sword: 'weapon', bow: 'bow', armor: 'armor', relic: 'relic' };
  const short = n => { n = Math.round(n || 0); return n >= 1e9 ? (n / 1e9).toFixed(n >= 1e10 ? 0 : 1) + 'b' : n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'm' : n >= 1e4 ? (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'k' : String(n); };
  const fmt = n => Math.round(n || 0).toLocaleString('en-US');

  const Inv = ECHO.Inv = {
    filter: 'all', sort: 'best', sel: null, seen: new Set(), pick: null,
    // ------------------------------------------------------------ what is what
    kind(it) { return it && SLOT_OF[it.kind] ? it.kind : 'other'; },
    rank(it) { const R = G().RARITY || []; const i = R.findIndex(r => r.k === (it && it.rarity)); return i < 0 ? 0 : i; },
    power(it) {
      if (!it) return 0;
      if (it.kind === 'relic') return A() ? A().eff(A().pw(it)) : 0;
      return G().power(it);
    },
    worn(pl, it) {
      if (!it) return false;
      if (it.kind === 'relic') return !!(A() && A().worn(pl, it.id));
      return it.id === pl.weapon || it.id === pl.bow || it.id === pl.armor;
    },
    // what it would replace
    against(game, it) {
      const pl = game.pl, W = game.world;
      if (!it) return null;
      if (it.kind === 'sword') return W.items[pl.weapon] || null;
      if (it.kind === 'bow') return W.items[pl.bow] || null;
      if (it.kind === 'armor') return (pl.armor && W.items[pl.armor]) || null;
      if (it.kind === 'relic' && A()) {
        const worn = A().wornItems(pl, W).map(w => w.it);
        return worn.find(w => w.relic === it.relic) || (A().slots(pl).slice(0, A().nslots(pl)).indexOf(null) >= 0 ? null : worn.slice().sort((a, b) => A().pw(a) - A().pw(b))[0]) || null;
      }
      return null;
    },
    better(game, it) {
      if (Inv.worn(game.pl, it)) return 0;
      const o = Inv.against(game, it), a = Inv.power(it), b = Inv.power(o);
      return !o ? 1 : a > b * 1.0001 ? 1 : a < b * 0.9999 ? -1 : 0;
    },
    list(game) {
      const pl = game.pl, W = game.world;
      let L = (pl.items || []).map(id => W.items[id]).filter(it => it && SLOT_OF[it.kind]);
      if (Inv.filter !== 'all') L = L.filter(it => it.kind === Inv.filter);
      const order = new Map((pl.items || []).map((id, i) => [id, i]));
      if (Inv.sort === 'new') L.sort((a, b) => order.get(b.id) - order.get(a.id));
      else if (Inv.sort === 'rarity') L.sort((a, b) => Inv.rank(b) - Inv.rank(a) || Inv.power(b) - Inv.power(a));
      else L.sort((a, b) => (Inv.worn(pl, b) - Inv.worn(pl, a)) || Inv.power(b) - Inv.power(a));
      return L;
    },
    // ------------------------------------------------------------ what you would be, wearing it
    stats(game) {
      const PC = ECHO.PlayerCtl, D = PC && PC.derived, pl = game.pl, W = game.world;
      if (!D) return null;
      return { dmg: D.meleeDmg, bow: D.bowDmg, turned: 1 - G().taken(W, pl, 'melee'), hp: D.maxHp, mana: D.maxMana, speed: D.speed };
    },
    // the same, as it would be with this piece on (worked out, and everything put back as it was)
    simulate(game, it) {
      const PC = ECHO.PlayerCtl, pl = game.pl;
      if (!PC || !PC.computeDerived || !it || Inv.worn(pl, it)) return null;
      const keep = { weapon: pl.weapon, bow: pl.bow, armor: pl.armor, relics: Array.isArray(pl.relics) ? pl.relics.slice() : pl.relics, hp: pl.hp, maxHp: pl.maxHp, maxSta: pl.maxSta, maxMana: pl.maxMana, D: PC.derived };
      let out = null;
      try {
        Inv.put(game, it, null, true);
        PC.computeDerived(game);
        out = Inv.stats(game);
      } catch (e) { out = null; }
      finally {
        pl.weapon = keep.weapon; pl.bow = keep.bow; pl.armor = keep.armor; pl.relics = keep.relics;
        pl.hp = keep.hp; pl.maxHp = keep.maxHp; pl.maxSta = keep.maxSta; pl.maxMana = keep.maxMana; PC.derived = keep.D;
      }
      return out;
    },
    // ------------------------------------------------------------ putting on and taking off
    put(game, it, slot, quiet) {
      const pl = game.pl;
      if (!it) return false;
      if (it.kind === 'sword') pl.weapon = it.id;
      else if (it.kind === 'bow') pl.bow = it.id;
      else if (it.kind === 'armor') pl.armor = it.id;
      else if (it.kind === 'relic' && A()) {
        if (slot == null) {
          // its own kind's slot if one is worn, else the first free, else in place of the weakest
          const S = A().slots(pl), n = A().nslots(pl), W = game.world;
          const same = S.slice(0, n).findIndex(id => id && W.items[id] && W.items[id].relic === it.relic);
          slot = same >= 0 ? same : S.slice(0, n).indexOf(null);
          if (slot < 0) { let lo = Infinity; S.slice(0, n).forEach((id, i) => { const p = W.items[id] ? A().pw(W.items[id]) : 0; if (p < lo) { lo = p; slot = i; } }); }
        }
        if (!A().wear(pl, it.id, slot)) return false;
      } else return false;
      if (!quiet) Inv.changed(game, it, true);
      return true;
    },
    takeOff(game, it) {
      const pl = game.pl;
      if (!it) return false;
      if (it.kind === 'armor' && pl.armor === it.id) pl.armor = null;
      else if (it.kind === 'relic' && A() && A().worn(pl, it.id)) A().takeOff(pl, it.id);
      else { if (ECHO.UI) ECHO.UI.toast(it.kind === 'bow' ? 'You keep a bow at your back: put another on in its place.' : 'You always carry a weapon: put another in its place.', 'info', 3); return false; }
      Inv.changed(game, it, false);
      return true;
    },
    changed(game, it, on) {
      const PC = ECHO.PlayerCtl;
      if (PC) { PC.derivedT = 0; try { PC.computeDerived(game); } catch (e) { /* the frame will */ } }
      if (ECHO.Progress && ECHO.Progress.lookOf && game.pe) game.pe.gearLook = ECHO.Progress.lookOf(game.world, game.pl);
      if (ECHO.Sfx) ECHO.Sfx.play(on ? (it.kind === 'armor' ? 'shieldBlock' : 'block') : 'dodge', { vol: 0.35, pitch: on ? 1.25 : 1.4 });
      Inv.flash = it.id;
    },
    // ------------------------------------------------------------ drawn
    tile(game, it) {
      const pl = game.pl, R = G().rarity(it.rarity), b = Inv.better(game, it), worn = Inv.worn(pl, it);
      const icon = ECHO.GearArt ? ECHO.GearArt.img(it, 'inv-ic') : '';
      const isNew = !Inv.seen.has(it.id) && Inv._seenReady;
      const T = ECHO.Temper && ECHO.Temper.ok(it) && it.temper ? ECHO.Temper.lv(it) : 0;
      return `<div class="inv-tile r-${esc(it.rarity || 'common')}${worn ? ' worn' : ''}${Inv.sel === it.id ? ' sel' : ''}${Inv.flash === it.id ? ' flash' : ''}" style="--rc:${R.color}" draggable="true" data-id="${esc(it.id)}" tabindex="-1">
        ${icon}${it.plus ? `<span class="inv-plus">+${it.plus}</span>` : ''}${T ? `<span class="inv-tmp" title="Tempered in battle">✦${T}</span>` : ''}
        <span class="inv-pw">${short(Inv.power(it))}</span>${worn ? '<span class="inv-eq">E</span>' : b > 0 ? '<span class="inv-up">▲</span>' : b < 0 ? '<span class="inv-dn">▼</span>' : ''}${isNew ? '<span class="inv-new">NEW</span>' : ''}</div>`;
    },
    slotHtml(game, key, label, it, glyph, extra) {
      const R = it ? G().rarity(it.rarity) : null;
      return `<div class="inv-slot${it ? ' full' : ''}${extra && extra.locked ? ' locked' : ''}" data-slot="${key}" ${R ? `style="--rc:${R.color}"` : ''} ${it ? `data-id="${esc(it.id)}" draggable="true"` : ''} title="${esc(extra && extra.title || '')}">
        ${it ? (ECHO.GearArt ? ECHO.GearArt.img(it, 'inv-ic') : '') : `<span class="inv-glyph">${glyph}</span>`}
        ${it && it.plus ? `<span class="inv-plus">+${it.plus}</span>` : ''}<span class="inv-sl">${esc(label)}</span>${extra && extra.key ? `<b class="inv-key">${esc(extra.key)}</b>` : ''}</div>`;
    },
    statsHtml(game, now, then) {
      if (!now) return '';
      const row = (k, label, v, f, pct) => {
        let d = '';
        if (then) {
          const a = then[k] - v, rel = v ? a / v : 0;
          if (Math.abs(rel) > 0.0005 || (pct && Math.abs(a) > 0.0005)) d = `<span class="${a > 0 ? 'up' : 'dn'}">${a > 0 ? '▲' : '▼'} ${pct ? Math.abs(Math.round(a * 1000) / 10) + '%' : fmt(Math.abs(a))}</span>`;
        }
        return `<div class="inv-st"><span>${label}</span><b>${f(v)}</b>${d}</div>`;
      };
      return row('dmg', 'Damage', now.dmg, fmt) + row('bow', 'Bow', now.bow, fmt) + row('turned', 'Armour', now.turned, v => Math.round(v * 1000) / 10 + '% turned', true) +
        row('hp', 'Life', now.hp, fmt) + row('mana', 'Mana', now.mana, fmt) + row('speed', 'Pace', now.speed, v => v.toFixed(2));
    },
    html(game) {
      const pl = game.pl, W = game.world, MW = ECHO.ManaWear;
      const L = Inv.list(game), all = (pl.items || []).map(id => W.items[id]).filter(it => it && SLOT_OF[it.kind]);
      const n = k => k === 'all' ? all.length : all.filter(it => it.kind === k).length;
      const ring = MW && MW.worn(pl, 'ring'), amu = MW && MW.worn(pl, 'amulet');
      const jewel = (k, P, glyph) => `<div class="inv-slot jewel${P ? ' full' : ''}" title="${esc(P ? `${P.name}: ${MW.line(k, P)}` : `No ${k}: a jeweller in any town sells them`)}" ${P ? `style="--rc:${P.col}"` : ''}><span class="inv-glyph" style="${P ? `color:${P.col}` : ''}">${glyph}</span><span class="inv-sl">${k === 'ring' ? 'Ring' : 'Amulet'}</span></div>`;
      const relS = A() ? A().slots(pl) : [], nOpen = A() ? A().nslots(pl) : 0;
      const relics = A() ? relS.map((id, i) => i < nOpen ? Inv.slotHtml(game, 'relic:' + i, 'Relic', id && W.items[id], '◇', { key: i < 3 ? A().keyName(i) : 'auto', title: i < 3 ? 'Press its key to use it; it wakes by itself in a fight too' : 'Works by itself' }) : Inv.slotHtml(game, 'relic:' + i, 'Locked', null, '🔒', { locked: true, title: 'Opens as you grow stronger' })).join('') : '';
      const cells = L.map(it => Inv.tile(game, it)).join('') + Array.from({ length: Math.max(0, 24 - L.length) + ((L.length > 24) ? (6 - L.length % 6) % 6 : 0) }, () => '<div class="inv-tile empty"></div>').join('');
      const mats = G().mats(pl);
      const sum = A() ? A().passiveSummary(pl) : [];
      return `<div class="inv tidy-skip">
        <div class="inv-left">
          <div class="inv-hero"><div class="inv-3d-slot"></div><div class="inv-hint">Drag to turn</div></div>
          <div class="inv-slots">
            ${Inv.slotHtml(game, 'weapon', 'Weapon', W.items[pl.weapon], '⚔')}
            ${Inv.slotHtml(game, 'bow', 'Bow', W.items[pl.bow], '➶')}
            ${Inv.slotHtml(game, 'armor', 'Armour', pl.armor && W.items[pl.armor], '⛨')}
            ${MW ? jewel('ring', ring, '◍') + jewel('amulet', amu, '◈') : ''}
          </div>
          ${relics ? `<div class="inv-sub">Relics</div><div class="inv-relics">${relics}</div>${sum.length ? `<div class="inv-sum">${sum.map(esc).join(' · ')}</div>` : ''}` : ''}
          <div class="inv-stats" data-stats>${Inv.statsHtml(game, Inv.stats(game), null)}</div>
        </div>
        <div class="inv-right">
          <div class="inv-bar">
            <div class="inv-chips">${FILTERS.map(([k, l]) => `<button class="inv-chip${Inv.filter === k ? ' on' : ''}" data-if="${k}">${l}<i>${n(k)}</i></button>`).join('')}</div>
            <div class="inv-sort">${SORTS.map(([k, l]) => `<button class="inv-chip small${Inv.sort === k ? ' on' : ''}" data-is="${k}">${l}</button>`).join('')}${A() && all.some(it => it.kind === 'relic') ? '<button class="inv-chip small" data-ibest="1" title="Put on the strongest relics you carry, one of each kind first">Best relics</button>' : ''}</div>
          </div>
          <div class="inv-grid" data-grid>${cells}</div>
          ${mats.length ? `<div class="inv-mats">${mats.map(m => `<span title="${esc(m.name)}"><i style="color:${m.color}">◆</i>${m.n} ${esc(m.name)}</span>`).join('')}</div>` : ''}
          <div class="inv-help">Click to put on · Drag onto a slot · Drag a worn piece back here to take it off · Right-click for more · Arrow keys and Enter work too</div>
        </div>
      </div>`;
    },
    // the tooltip: what it is, against what you wear
    tipHtml(game, it) {
      const pl = game.pl, R = G().rarity(it.rarity), o = Inv.against(game, it), worn = Inv.worn(pl, it);
      const p = Inv.power(it), q = Inv.power(o);
      const kindName = it.kind === 'sword' ? ((G().wclass(it) || {}).name || 'Weapon') : it.kind === 'bow' ? 'Bow' : it.kind === 'armor' ? 'Armour' : 'Relic';
      let cmp = '';
      if (worn) cmp = '<div class="tip-cmp now">Worn now</div>';
      else if (o) { const d = p - q, rel = q ? d / q : 0; cmp = `<div class="tip-cmp ${d > 0 ? 'up' : d < 0 ? 'dn' : ''}">${d > 0 ? '▲' : d < 0 ? '▼' : '='} ${fmt(Math.abs(d))}${q ? ` (${d >= 0 ? '+' : '−'}${Math.abs(Math.round(rel * 100))}%)` : ''} against <span style="color:${G().rarity(o.rarity).color}">${esc(o.name)}</span></div>`; }
      else cmp = `<div class="tip-cmp up">▲ Fills an empty slot</div>`;
      const D = it.kind === 'relic' && A() ? A().RELICS[it.relic] : null;
      const line = it.kind === 'relic' && A() ? `${esc(D ? D.what : '')} — ${esc(A().descOf(it))}<br><b>${esc(D ? D.pas : '')}</b> — ${esc(D ? D.pasText(A().gift(it)) : '')}` : esc(G().line(it));
      const T = ECHO.Temper && ECHO.Temper.ok(it) ? `<div class="tip-tmp">${esc(ECHO.Temper.line(it))}<div class="tip-bar"><i style="width:${Math.round(100 * Math.min(1, ((it.temper && it.temper.xp) || 0) / ECHO.Temper.need(ECHO.Temper.lv(it))))}%"></i></div></div>` : '';
      const hist = (it.history || []).slice(-2).map(h => `${ECHO.TIME ? ECHO.TIME.fmtShort(h.d) : ''}: ${esc(h.t)}`).join('<br>');
      const act = worn ? (it.kind === 'armor' || it.kind === 'relic' ? 'Drag to the grid to take it off' : 'Worn — put another on in its place') : `Click to ${it.kind === 'sword' ? 'wield' : it.kind === 'bow' ? 'string' : 'put on'}`;
      return `<div class="tip-name" style="color:${R.color}">${esc(it.name)}${it.plus ? ' +' + it.plus : ''}</div>
        <div class="tip-sub">${esc(R.name)} ${esc(kindName.toLowerCase())}${it.level ? ` · level ${it.level}` : ''}${ECHO.UI && ECHO.UI.kept && ECHO.UI.kept(pl, it) ? ' · 🔒 kept' : ''}</div>
        <div class="tip-pow"><b>${fmt(p)}</b> ${it.kind === 'armor' ? 'armour' : 'power'}</div>${cmp}
        <div class="tip-line">${line}</div>${T}${hist ? `<div class="tip-hist">${hist}</div>` : ''}<div class="tip-act">${act} · right-click for more</div>`;
    },
    // ------------------------------------------------------------ on the page
    mount(host, game) {
      if (!host) return;
      if (!Inv._seenReady) { Inv._seenReady = true; for (const id of game.pl.items || []) Inv.seen.add(id); }
      host.innerHTML = Inv.html(game);
      Inv.bind(host, game);
      Inv.Preview.attach(host.querySelector('.inv-3d-slot'), game);
      Inv.flash = null;
      // what you have now seen is no longer new (next time)
      setTimeout(() => { for (const id of game.pl.items || []) Inv.seen.add(id); }, 0);
    },
    refresh(host, game) { const g = host.querySelector('[data-grid]'), y = g ? g.scrollTop : 0; Inv.mount(host, game); const g2 = host.querySelector('[data-grid]'); if (g2) g2.scrollTop = y; },
    open(game) {
      if (ECHO.UI) { ECHO.UI._csec = 'gear'; ECHO.UI.openCharacter(); }
    },
    tip(on, it, x, y, game) {
      let t = document.getElementById('inv-tip');
      if (!t) { t = document.createElement('div'); t.id = 'inv-tip'; t.className = 'inv-tip'; document.body.appendChild(t); }
      if (!on || !it) { t.classList.remove('on'); return; }
      if (t.dataset.id !== it.id) { t.innerHTML = Inv.tipHtml(game, it); t.dataset.id = it.id; t.style.setProperty('--rc', G().rarity(it.rarity).color); }
      t.classList.add('on');
      const w = t.offsetWidth, h = t.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
      t.style.left = Math.max(8, Math.min(vw - w - 8, x + 18)) + 'px';
      t.style.top = Math.max(8, Math.min(vh - h - 8, y - h / 3)) + 'px';
    },
    showStats(host, game, it) {
      const el = host.querySelector('[data-stats]');
      if (!el) return;
      el.innerHTML = Inv.statsHtml(game, Inv.stats(game), it ? Inv.simulate(game, it) : null);
    },
    menu(host, game, it, x, y) {
      Inv.closeMenu();
      const pl = game.pl, UI = ECHO.UI, worn = Inv.worn(pl, it), m = document.createElement('div');
      m.className = 'inv-menu'; m.id = 'inv-menu';
      const items = [];
      if (!worn) items.push([it.kind === 'sword' ? 'Wield' : it.kind === 'bow' ? 'String this bow' : 'Put on', () => { Inv.put(game, it); Inv.refresh(host, game); }]);
      if (worn && (it.kind === 'armor' || it.kind === 'relic')) items.push(['Take off', () => { Inv.takeOff(game, it); Inv.refresh(host, game); }]);
      if (it.kind === 'relic' && worn) items.push([it.auto === false ? 'Let it wake by itself in a fight' : 'Only when I press its key', () => { if (it.auto === false) delete it.auto; else it.auto = false; Inv.refresh(host, game); }]);
      if (UI && UI.canGive && UI.canGive(pl, it)) items.push(['Give away…', () => UI.giveAway(it)]);
      if (UI && UI.toggleKeep) items.push([UI.kept(pl, it) ? '🔓 Unlock (may be sold)' : '🔒 Keep (never sold in bulk)', () => { UI.toggleKeep(pl, it.id); Inv.refresh(host, game); }]);
      m.innerHTML = `<div class="inv-menu-h" style="color:${G().rarity(it.rarity).color}">${esc(it.name)}</div>` + items.map((r, i) => `<button data-mi="${i}">${esc(r[0])}</button>`).join('');
      document.body.appendChild(m);
      m.style.left = Math.min(window.innerWidth - m.offsetWidth - 8, x) + 'px'; m.style.top = Math.min(window.innerHeight - m.offsetHeight - 8, y) + 'px';
      m.querySelectorAll('button[data-mi]').forEach(b => b.addEventListener('click', ev => { ev.stopPropagation(); Inv.closeMenu(); items[+b.dataset.mi][1](); }));
      setTimeout(() => document.addEventListener('mousedown', Inv._away = e => { if (!m.contains(e.target)) Inv.closeMenu(); }, { once: false }), 0);
    },
    closeMenu() { const m = document.getElementById('inv-menu'); if (m) m.remove(); if (Inv._away) { document.removeEventListener('mousedown', Inv._away); Inv._away = null; } },
    bind(host, game) {
      const W = game.world, itemOf = el => el && el.dataset.id ? W.items[el.dataset.id] : null;
      const tiles = host.querySelectorAll('.inv-tile[data-id], .inv-slot[data-id]');
      tiles.forEach(el => {
        const it = itemOf(el);
        el.addEventListener('mouseenter', ev => { Inv.tip(true, it, ev.clientX, ev.clientY, game); if (el.classList.contains('inv-tile')) Inv.showStats(host, game, it); });
        el.addEventListener('mousemove', ev => Inv.tip(true, it, ev.clientX, ev.clientY, game));
        el.addEventListener('mouseleave', () => { Inv.tip(false); Inv.showStats(host, game, null); });
        el.addEventListener('contextmenu', ev => { ev.preventDefault(); Inv.tip(false); Inv.menu(host, game, it, ev.clientX, ev.clientY); });
        el.addEventListener('dragstart', ev => { Inv.tip(false); Inv.drag = it.id; ev.dataTransfer.effectAllowed = 'move'; try { ev.dataTransfer.setData('text/plain', it.id); } catch (e) { /* fine */ } el.classList.add('dragging'); host.classList.add('inv-dragging'); host.querySelectorAll('.inv-slot').forEach(s => s.classList.toggle('accept', Inv.accepts(s, it))); });
        el.addEventListener('dragend', () => { el.classList.remove('dragging'); host.classList.remove('inv-dragging'); host.querySelectorAll('.inv-slot').forEach(s => s.classList.remove('accept', 'over')); Inv.drag = null; });
      });
      host.querySelectorAll('.inv-tile[data-id]').forEach(el => el.addEventListener('click', () => {
        const it = itemOf(el); Inv.sel = it.id;
        if (!Inv.worn(game.pl, it) && Inv.put(game, it)) { Inv.tip(false); Inv.refresh(host, game); }
        else { host.querySelectorAll('.inv-tile.sel').forEach(x => x.classList.remove('sel')); el.classList.add('sel'); }
      }));
      // slots take what fits them
      host.querySelectorAll('.inv-slot[data-slot]').forEach(s => {
        s.addEventListener('dragover', ev => { const it = W.items[Inv.drag]; if (it && Inv.accepts(s, it)) { ev.preventDefault(); s.classList.add('over'); } });
        s.addEventListener('dragleave', () => s.classList.remove('over'));
        s.addEventListener('drop', ev => {
          ev.preventDefault(); s.classList.remove('over');
          const it = W.items[Inv.drag]; if (!it || !Inv.accepts(s, it)) return;
          const k = s.dataset.slot, slot = k.startsWith('relic:') ? +k.slice(6) : null;
          if (Inv.put(game, it, slot)) Inv.refresh(host, game);
        });
      });
      // the grid takes back what is worn
      const grid = host.querySelector('[data-grid]');
      if (grid) {
        grid.addEventListener('dragover', ev => { const it = W.items[Inv.drag]; if (it && Inv.worn(game.pl, it)) { ev.preventDefault(); grid.classList.add('over'); } });
        grid.addEventListener('dragleave', ev => { if (!grid.contains(ev.relatedTarget)) grid.classList.remove('over'); });
        grid.addEventListener('drop', ev => { ev.preventDefault(); grid.classList.remove('over'); const it = W.items[Inv.drag]; if (it && Inv.worn(game.pl, it) && Inv.takeOff(game, it)) Inv.refresh(host, game); });
      }
      host.querySelectorAll('[data-if]').forEach(b => b.addEventListener('click', () => { Inv.filter = b.dataset.if; Inv.refresh(host, game); }));
      host.querySelectorAll('[data-is]').forEach(b => b.addEventListener('click', () => { Inv.sort = b.dataset.is; Inv.refresh(host, game); }));
      host.querySelectorAll('[data-ibest]').forEach(b => b.addEventListener('click', () => { if (A()) { A().best(game.pl, W); Inv.changed(game, { kind: 'relic', id: '' }, true); Inv.refresh(host, game); } }));
      Inv._host = host; Inv._game = game;
    },
    accepts(slotEl, it) {
      const k = slotEl.dataset.slot || '';
      if (slotEl.classList.contains('locked') || !k) return false;
      if (k.startsWith('relic:')) return it.kind === 'relic';
      return SLOT_OF[it.kind] === k;
    },
    // arrow keys and Enter, while the page is open (ui.js calls this)
    key(k) {
      const host = Inv._host, game = Inv._game;
      if (!host || !host.isConnected || !game) return false;
      const tiles = [...host.querySelectorAll('.inv-tile[data-id]')];
      if (!tiles.length) return false;
      let i = tiles.findIndex(t => t.dataset.id === Inv.sel);
      const cols = Math.max(1, Math.round(host.querySelector('[data-grid]').clientWidth / (tiles[0].offsetWidth + 6)));
      if (k === 'Enter') { if (i < 0) return false; const it = game.world.items[tiles[i].dataset.id]; if (Inv.put(game, it)) Inv.refresh(host, game); return true; }
      const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[k];
      if (d == null) return false;
      i = i < 0 ? 0 : Math.max(0, Math.min(tiles.length - 1, i + d));
      const el = tiles[i]; Inv.sel = el.dataset.id;
      tiles.forEach(t => t.classList.toggle('sel', t === el));
      el.scrollIntoView({ block: 'nearest' });
      const r = el.getBoundingClientRect(), it = game.world.items[el.dataset.id];
      Inv.tip(true, it, r.right - 10, r.top + r.height / 2, game); Inv.showStats(host, game, it);
      return true;
    },

    // ------------------------------------------------------------ you, in 3D, in what you wear
    Preview: {
      canvas: null, renderer: null, scene: null, cam: null, inst: null, key: '', yaw: Math.PI / 2 - 0.4, spin: 0.25, drag: null, raf: 0, t: 0,   // (facing you, a little turned: the model looks along its own −x)
      attach(slot, game) {
        const P = Inv.Preview;
        if (!slot) return;
        if (typeof THREE === 'undefined' || !ECHO.Models || !ECHO.Models.ready || !ECHO.Renderer3D || !ECHO.Renderer3D.configure) { slot.innerHTML = ECHO.GearArt && ECHO.GearArt.doll ? `<img class="inv-doll" src="${ECHO.GearArt.doll(ECHO.Progress.lookOf(game.world, game.pl))}" alt="">` : ''; return; }
        try {
          if (!P.canvas) {
            P.canvas = document.createElement('canvas'); P.canvas.className = 'inv-3d';
            const r = P.renderer = new THREE.WebGLRenderer({ canvas: P.canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
            r.outputEncoding = THREE.sRGBEncoding; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.1;
            r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
            const s = P.scene = new THREE.Scene();
            s.add(new THREE.HemisphereLight('#cfe6ff', '#2a2218', 0.9));
            const key = new THREE.DirectionalLight('#fff2e0', 1.5); key.position.set(2.5, 4, 3); s.add(key);
            const rim = new THREE.DirectionalLight('#7fd8ff', 1.1); rim.position.set(-3, 2.5, -2.5); s.add(rim);
            const disc = P.disc = new THREE.Mesh(new THREE.CircleGeometry(0.75, 40), new THREE.MeshBasicMaterial({ color: '#7fd8ff', transparent: true, opacity: 0.22, depthWrite: false }));
            disc.rotation.x = -Math.PI / 2; disc.position.y = 0.002; s.add(disc);
            P.cam = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
            P.canvas.addEventListener('pointerdown', ev => { P.drag = { x: ev.clientX, yaw: P.yaw }; P.canvas.setPointerCapture(ev.pointerId); });
            P.canvas.addEventListener('pointermove', ev => { if (P.drag) { P.yaw = P.drag.yaw + (ev.clientX - P.drag.x) * 0.012; P.spin = 0; } });
            P.canvas.addEventListener('pointerup', () => { P.drag = null; P.spinAt = performance.now(); });
          }
          slot.appendChild(P.canvas);
          P.dress(game);
          P.size();
          if (!P.raf) { P.last = performance.now(); P.raf = requestAnimationFrame(P.frame); }
        } catch (e) { console.error('ECHO inventory preview', e); slot.innerHTML = ''; }
      },
      // the model, made again only when what you wear changes
      dress(game) {
        const P = Inv.Preview, L = ECHO.Progress.lookOf(game.world, game.pl), pe = game.pe || {};
        const key = (L && L.key) + '|' + (game.pl.look ? JSON.stringify(game.pl.look) : '') + '|' + (game.pl.bow || '') + '|' + (game.pl.weapon || '');
        if (P.inst && P.key === key) return;
        if (P.inst) { P.scene.remove(P.inst.root); for (const m of P.inst.mats) m.dispose(); }
        const inst = ECHO.Models.instance('person');
        if (!inst) return;
        const e = { type: 'player', look: pe.look || game.pl.look || {}, gear: Object.assign({}, pe.gear || {}, { bow: !!game.pl.bow, torch: false }), gearLook: L, id: -1 };
        ECHO.Renderer3D.configure(game, e, { inst });
        if (inst.parts.torch) inst.parts.torch.visible = false;
        P.scene.add(inst.root);
        P.inst = inst; P.key = key; P.by0 = null;
        // the glow under you: the colour of the rarest thing you wear
        const W = game.world, worn = [W.items[game.pl.weapon], W.items[game.pl.bow], game.pl.armor && W.items[game.pl.armor]].filter(Boolean);
        const top = worn.sort((a, b) => Inv.rank(b) - Inv.rank(a))[0];
        if (P.disc) P.disc.material.color.set(top ? G().rarity(top.rarity).color : '#7fd8ff');
      },
      size() {
        const P = Inv.Preview, c = P.canvas;
        if (!c || !c.parentNode) return;
        const w = Math.max(80, c.parentNode.clientWidth || 220), h = Math.max(120, c.parentNode.clientHeight || 300);
        if (P._w === w && P._h === h) return;
        P._w = w; P._h = h;
        P.renderer.setSize(w, h, false); c.style.width = w + 'px'; c.style.height = h + 'px';
        P.cam.aspect = w / h; P.cam.updateProjectionMatrix();
      },
      frame(now) {
        const P = Inv.Preview;
        if (!P.canvas || !P.canvas.isConnected) { P.raf = 0; return; }   // (the page closed: it waits, ready, until it opens again)
        P.raf = requestAnimationFrame(P.frame);
        const dt = Math.min(0.05, (now - (P.last || now)) / 1000); P.last = now; P.t += dt;
        P.size();
        if (!P.drag && P.spinAt && now - P.spinAt > 2500) P.spin = Math.min(0.25, P.spin + dt * 0.1);
        P.yaw += P.spin * dt;
        const inst = P.inst;
        if (inst) {
          inst.root.rotation.y = P.yaw;
          // standing at ease: breathing, a little sway, the hands loose
          const Pp = inst.parts, b = Math.sin(P.t * 1.6);
          if (Pp.body) Pp.body.position.y = (P.by0 == null ? (P.by0 = Pp.body.position.y) : P.by0) + b * 0.008;
          if (Pp.armL) Pp.armL.rotation.z = 0.08 + Math.sin(P.t * 1.6 + 0.4) * 0.03;
          if (Pp.armR) Pp.armR.rotation.z = -0.08 - Math.sin(P.t * 1.6 + 0.9) * 0.03;
          if (Pp.head) Pp.head.rotation.y = Math.sin(P.t * 0.4) * 0.18;
        }
        P.cam.position.set(0, 1.05, 3.6); P.cam.lookAt(0, 0.62, 0);
        try { P.renderer.render(P.scene, P.cam); } catch (e) { P.raf = 0; }
      }
    }
  };
})();
