// ECHO.Builder — building what you like where you like, and the making of what it is built from.
//
//   • THE CRAFTING TREE. Everything starts from what you fell and mine (harvest.js):
//       timber → planks (by hand) → a WORKBENCH (placed) → dressed stone, arrows, an axe, a pick
//       ore → stone (at a workbench) → a FURNACE (placed) → ingots (ore and a plank to burn)
//       ingots → an ANVIL (placed) → energy cells, missiles, and a blade, a coat of mail or a
//         sidearm of your own level
//     A recipe that needs a workbench, a furnace or an anvil needs one within a few paces.
//   • BUILDING. = opens the bench of all this. Pick a piece and you are placing: the tile under
//     the mouse shows green where it can go; hold the left button and drag to lay a row, right
//     button takes a piece of yours up again (and gives back all it cost). Pieces: wooden and
//     stone walls, floors, a fence, a doorway, a torch, and the three stations.
//   • WHERE. On open ground within a few paces of you: not in a town, not on water, road or
//     rock, not where a tree or a boulder stands (fell it first), not on top of anybody.
//   • WALLS HOLD, BUT NOT FOR EVER. What cannot get at you through a wall sets about the wall:
//     wood gives way sooner than stone, and a great beast walks through either.
//   • What is built is kept in world.built (made the first time you place something, so a world
//     nobody has built in carries nothing new): one entry to a tile. It moves with the map when
//     the land grows (frontier.js shifts everything with an x and a y).
(function () {
  const { U } = ECHO;
  const TT = () => ECHO.TILE;
  const C = () => ECHO.Combat;

  const PIECES = {
    wall: { name: 'Wooden wall', cost: { planks: 2 }, solid: true, hp: 6, model: 'b_wall', h: 1.5 },
    swall: { name: 'Stone wall', cost: { stone: 2 }, solid: true, hp: 16, model: 'b_swall', h: 1.5 },
    floor: { name: 'Wooden floor', cost: { planks: 1 }, model: 'b_floor', h: 0.08 },
    sfloor: { name: 'Stone floor', cost: { stone: 1 }, model: 'b_sfloor', h: 0.08 },
    fence: { name: 'Fence', cost: { planks: 1 }, solid: true, hp: 3, model: 'b_fence', h: 0.8 },
    door: { name: 'Doorway', cost: { planks: 3 }, model: 'b_door', h: 1.7 },
    torch: { name: 'Torch', cost: { planks: 1, timber: 1 }, model: 'b_torch', h: 1.3, light: true },
    bench: { name: 'Workbench', cost: { planks: 6 }, solid: true, hp: 8, model: 'b_bench', h: 0.8, station: 'bench' },
    furnace: { name: 'Furnace', cost: { stone: 8 }, solid: true, hp: 20, model: 'b_furnace', h: 1.3, station: 'furnace' },
    anvil: { name: 'Anvil', cost: { ingots: 5 }, solid: true, hp: 30, model: 'b_anvil', h: 0.8, station: 'anvil' }
  };
  const GOODS = { timber: 'timber', ore: 'ore', planks: 'planks', stone: 'stone', ingots: 'ingots', arrows: 'arrows', cells: 'energy cells', missiles: 'missiles', axe: 'axe', pick: 'pick' };
  // what is made of what, and where
  const RECIPES = [
    { k: 'planks', name: 'Saw planks', use: { timber: 1 }, get: { planks: 4 }, desc: 'A load of timber, sawn.' },
    { k: 'stone', name: 'Dress stone', use: { ore: 1 }, get: { stone: 3 }, at: 'bench', desc: 'The rock round the ore, squared for building.' },
    { k: 'arrows', name: 'Fletch arrows', use: { planks: 1 }, get: { arrows: 8 }, at: 'bench' },
    { k: 'axe', name: 'Make an axe', use: { planks: 3, ingots: 1 }, get: { axe: 1 }, at: 'bench', once: 'axe', desc: 'Fells a tree in half the strokes.' },
    { k: 'pick', name: 'Make a pick', use: { planks: 3, ingots: 1 }, get: { pick: 1 }, at: 'bench', once: 'pick', desc: 'Breaks stone in half the strokes, and cuts living rock.' },
    { k: 'ingots', name: 'Smelt an ingot', use: { ore: 1, planks: 1 }, get: { ingots: 1 }, at: 'furnace', desc: 'Ore, and a plank to burn.' },
    { k: 'cells', name: 'Charge energy cells', use: { ingots: 1 }, get: { cells: 20 }, at: 'anvil' },
    { k: 'missiles', name: 'Build a missile', use: { ingots: 2 }, get: { missiles: 1 }, at: 'anvil' },
    { k: 'blade', name: 'Forge a blade', use: { ingots: 8, planks: 2 }, gear: 'sword', at: 'anvil', desc: 'A fine blade of your own level.' },
    { k: 'mail', name: 'Forge a coat of mail', use: { ingots: 10 }, gear: 'armor', at: 'anvil', desc: 'Fine armour of your own level.' },
    { k: 'sidearm', name: 'Build a sidearm', use: { ingots: 8, planks: 1 }, gear: 'gun', at: 'anvil', desc: 'A fine pistol of your own level.' }
  ];
  const STATION = { bench: 'a workbench', furnace: 'a furnace', anvil: 'an anvil' };

  const B = ECHO.Builder = {
    V: 1, PIECES, RECIPES, GOODS, MAX: 4000, REACH: 6.5,
    mode: null, ghost: null, _lh: false, _rh: false, _last: null, _t: 0,
    reset() { B.mode = null; B.ghost = null; B._lh = B._rh = false; B._last = null; B.bar(null); },
    // ------------------------------------------------------------ what is built
    st(world) { const S = world.built || (world.built = { v: B.V, list: [], n: 0 }); if (!S.list) S.list = []; return S; },
    index(world) {
      const S = world.built, L = S ? S.list : [], M = new Map(), W = world.W;
      for (const e of L) M.set(e.y * W + e.x, e);
      world._builtI = { M, n: L.length, sig: L.length ? L[0].x + ',' + L[0].y + ',' + W : '' };
      return world._builtI;
    },
    at(world, x, y) {
      const S = world.built;
      if (!S || !S.list || !S.list.length || x < 0 || y < 0 || x >= world.W || y >= world.H) return null;
      let I = world._builtI;
      if (!I || I.n !== S.list.length || I.sig !== S.list[0].x + ',' + S.list[0].y + ',' + world.W) I = B.index(world);
      return I.M.get(y * world.W + x) || null;
    },
    // the land knows it has changed there: paths are thought out again, and the ground drawn again
    changed(world, x, y) {
      const S = B.st(world); S.n = (S.n || 0) + 1;
      world._builtI = null;
      if (ECHO.Solids) ECHO.Solids._g = null;
      if (ECHO.Clearing) ECHO.Clearing.changed(world, [{ x0: x, y0: y, x1: x + 1, y1: y + 1 }]);
    },
    have(pl, cost) { for (const k in cost) if (!((pl.inv[k] || 0) >= cost[k])) return false; return true; },
    pay(pl, cost, back) { for (const k in cost) pl.inv[k] = (pl.inv[k] || 0) + (back ? cost[k] : -cost[k]); },
    word(k, n) { const w = GOODS[k] || k; return n === 1 && /s$/.test(w) && k !== 'cells' ? (k === 'cells' ? w : w.replace(/s$/, '')) : k === 'cells' && n === 1 ? 'energy cell' : w; },
    costText(cost) { return Object.keys(cost).map(k => `${cost[k]} ${B.word(k, cost[k])}`).join(' + '); },
    // why a piece cannot go on that tile (null: it can). who: the bodies that must not be built on.
    why(world, pl, k, x, y, who) {
      const P = PIECES[k], T = TT();
      if (!P) return 'no such piece';
      if (x < 0 || y < 0 || x >= world.W || y >= world.H) return 'off the edge of the world';
      const t = world.tiles[y * world.W + x];
      if (t === T.WATER || t === T.DEEP) return 'water';
      if (t === T.ROAD || t === T.BRIDGE || t === T.PLAZA) return 'a road';
      if (t === T.ROCK || t === T.RUINWALL || t === T.RUIN) return 'rock';
      if (t === T.TREE) return 'a tree stands there: fell it first';
      if (t === T.FARM) return 'someone\'s field';
      if (ECHO.Solids && ECHO.Solids.tileProp && ECHO.Solids.tileProp(world, x, y)) return 'something stands there: fell or break it first';
      if (B.at(world, x, y)) return 'something is built there';
      if (ECHO.World && ECHO.World.settlementAt && ECHO.World.settlementAt(world, x + 0.5, y + 0.5, 17)) return 'too near a town';
      for (const st of world.structures || []) if (Math.abs(st.x - x) < 3 && Math.abs(st.y - y) < 3) return 'too near a building';
      if (P.solid && who) for (const e of who) { if (e.dead || e.hidden) continue; const r = (e.r || 0.33) * 0.8; if (e.x > x - r && e.x < x + 1 + r && e.y > y - r && e.y < y + 1 + r) return 'someone is standing there'; }
      if (B.st(world).list.length >= B.MAX) return 'you have built all one pair of hands can keep up';
      if (!B.have(pl, P.cost)) return `needs ${B.costText(P.cost)}`;
      return null;
    },
    place(world, pl, k, x, y, who) {
      if (B.why(world, pl, k, x, y, who)) return false;
      B.pay(pl, PIECES[k].cost);
      B.st(world).list.push({ x, y, k });
      B.changed(world, x, y);
      if (pl.stats) pl.stats.built = (pl.stats.built || 0) + 1;
      return true;
    },
    // taken up again by the one who built it: all it cost comes back. Broken by something else: nothing does.
    remove(world, pl, x, y, broken) {
      const S = world.built, e = B.at(world, x, y);
      if (!S || !e) return null;
      S.list.splice(S.list.indexOf(e), 1);
      if (!broken && pl && PIECES[e.k]) B.pay(pl, PIECES[e.k].cost, true);
      B.changed(world, x, y);
      return e;
    },
    // is there a workbench (furnace, anvil) within a few paces
    near(world, x, y, station, r = 4.5) {
      const S = world.built; if (!S || !S.list) return false;
      for (const e of S.list) if (PIECES[e.k] && PIECES[e.k].station === station && Math.abs(e.x + 0.5 - x) <= r && Math.abs(e.y + 0.5 - y) <= r) return true;
      return false;
    },
    // ------------------------------------------------------------ making things
    // why a recipe cannot be made now (null: it can)
    whyNot(world, pl, R, x, y) {
      if (R.once && (pl.inv[R.once] || 0) > 0) return 'you have one';
      if (R.at && !B.near(world, x, y, R.at)) return `needs ${STATION[R.at]} within a few paces`;
      if (!B.have(pl, R.use)) return `needs ${B.costText(R.use)}`;
      return null;
    },
    // how many times it could be made with what you carry
    times(pl, R) { let n = Infinity; for (const k in R.use) n = Math.min(n, Math.floor((pl.inv[k] || 0) / R.use[k])); return R.once || R.gear ? Math.min(1, n) : n; },
    craft(game, R, n = 1) {
      const world = game.world, pl = game.pl, pe = game.pe;
      let made = 0;
      for (let i = 0; i < n; i++) {
        if (B.whyNot(world, pl, R, pe.x, pe.y)) break;
        B.pay(pl, R.use);
        if (R.get) for (const k in R.get) pl.inv[k] = (pl.inv[k] || 0) + R.get[k];
        if (R.gear) B.forge(game, R.gear);
        made++;
      }
      if (made && pl.stats) pl.stats.crafted = (pl.stats.crafted || 0) + made;
      return made;
    },
    // a piece of gear of your own level, from your own anvil
    forge(game, kind) {
      const world = game.world, pl = game.pl, Gr = ECHO.Gear, lv = ECHO.Prowess ? ECHO.Prowess.level(pl) : 1;
      const rng = { next: Math.random, int: (a, b2) => a + Math.floor(Math.random() * (b2 - a + 1)) };
      const it = Gr.make(world, rng, kind, lv, 'fine', 'your own anvil');
      if (kind === 'gun') { it.gclass = 'pistol'; it.name = 'Hand-built sidearm'; }
      it.holder = 'player';
      (it.history = it.history || []).push({ d: world.day, t: 'made by your own hand, at your own anvil' });
      if (!pl.items.includes(it.id)) pl.items.push(it.id);
      return it;
    },
    // ------------------------------------------------------------ the bench of it all (=)
    open(game) {
      const UI = ECHO.UI, pl = game.pl, world = game.world, pe = game.pe;
      if (!UI || !pl) return;
      if (pe.x >= 9000 || (ECHO.Interior && ECHO.Interior.cur)) { UI.toast('You build and craft out of doors.', 'info', 3); return; }
      const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      const mats = ['timber', 'ore', 'planks', 'stone', 'ingots'];
      const stations = ['bench', 'furnace', 'anvil'].map(s => `<span style="margin-right:14px;${B.near(world, pe.x, pe.y, s) ? 'color:#9ff6c0' : 'opacity:.55'}">${B.near(world, pe.x, pe.y, s) ? '●' : '○'} ${esc(PIECES[s].name)}</span>`).join('');
      const rec = RECIPES.map((R, i) => {
        const why = B.whyNot(world, pl, R, pe.x, pe.y), n = why ? 0 : B.times(pl, R);
        const out = R.gear ? 'a piece of gear' : B.costText(R.get);
        return `<div style="display:flex;align-items:center;gap:12px;margin:6px 0"><div style="flex:1 1 auto"><b>${esc(R.name)}</b> <span class="dim" style="font-size:12px">${esc(B.costText(R.use))} → ${esc(out)}${R.desc ? ' · ' + esc(R.desc) : ''}</span>${why ? `<div style="font-size:12px;color:#ff9a7a">${esc(U.cap(why))}</div>` : ''}</div>
          <button class="small" data-craft="${i}:1" ${why ? 'disabled' : ''}>Make</button>${!R.once && !R.gear ? `<button class="small" data-craft="${i}:${Math.max(1, n)}" ${why || n < 2 ? 'disabled' : ''}>All (${n})</button>` : ''}</div>`;
      }).join('');
      const pcs = Object.keys(PIECES).map(k => {
        const P = PIECES[k], ok = B.have(pl, P.cost);
        return `<button class="small" data-piece="${k}" style="margin:4px 6px 4px 0;text-align:left;min-width:150px${ok ? '' : ';opacity:.6'}"><b>${esc(P.name)}</b><br><span class="dim" style="font-size:11px">${esc(B.costText(P.cost))}</span></button>`;
      }).join('');
      const body = UI.openPanel('Build & craft', `
        <div class="card"><h4>What you carry</h4><div>${mats.map(k => `<span style="margin-right:16px">${esc(U.cap(GOODS[k]))} <b>${pl.inv[k] || 0}</b></span>`).join('')}</div>
          <div class="dim" style="font-size:12px;margin-top:6px">Timber comes from felling trees and ore from breaking stone (stand by one and press E). Near you: ${stations}</div></div>
        <div class="card"><h4>Build</h4><div class="dim" style="font-size:12px;margin-bottom:6px">Pick a piece, then click the ground to place it. Hold and drag to lay a row. Right-click takes a piece up again and gives back what it cost. Press = when you are done.</div>${pcs}</div>
        <div class="card"><h4>Craft</h4>${rec}</div>`, 'build');
      body.querySelectorAll('[data-piece]').forEach(b2 => b2.addEventListener('click', () => { UI.closePanel(); B.begin(game, b2.dataset.piece); }));
      body.querySelectorAll('[data-craft]').forEach(b2 => b2.addEventListener('click', () => {
        const [i, n] = b2.dataset.craft.split(':').map(Number), R = RECIPES[i], made = B.craft(game, R, n);
        if (made) { if (ECHO.Sfx) ECHO.Sfx.play('gunSwap'); UI.toast(R.gear ? `${R.name}: it is in your pack.` : `${R.name}${made > 1 ? ' ×' + made : ''}.`, 'info', 2.5); }
        B.open(game);
      }));
    },
    begin(game, k) {
      if (!PIECES[k]) return;
      B.mode = k; B._lh = B._rh = false; B._last = null;
      B.bar(game);
    },
    end() { B.mode = null; B.ghost = null; B._lh = B._rh = false; B.bar(null); },
    // the strip at the foot of the screen while you are placing
    bar(game) {
      if (typeof document === 'undefined') return;
      let el = document.getElementById('hud-build');
      if (!game || !B.mode) { if (el) el.remove(); return; }
      if (!el) {
        el = document.createElement('div'); el.id = 'hud-build';
        el.style.cssText = 'position:fixed;left:50%;bottom:86px;transform:translateX(-50%);z-index:40;background:rgba(6,16,26,0.92);border:1px solid rgba(95,242,255,0.5);border-radius:8px;padding:8px 12px;font-size:13px;color:#dff6ff;max-width:92vw;text-align:center;pointer-events:auto';
        document.body.appendChild(el);
        el.addEventListener('mousedown', ev => ev.stopPropagation());
        el.addEventListener('click', ev => {
          const b2 = ev.target.closest('[data-bp],[data-bdone],[data-bmore]'); if (!b2) return;
          if (b2.dataset.bdone != null) B.end(); else if (b2.dataset.bmore != null) { B.end(); B.open(ECHO.Game); } else B.begin(ECHO.Game, b2.dataset.bp);
        });
      }
      const pl = game.pl, P = PIECES[B.mode], key = B.mode + '|' + Object.keys(PIECES).map(k => B.have(pl, PIECES[k].cost) ? 1 : 0).join('') + '|' + Object.keys(P.cost).map(k => pl.inv[k] || 0).join(',') + '|' + (B.ghost && B.ghost.why || '');
      if (el._key === key) return;
      el._key = key;
      el.innerHTML = `<div style="margin-bottom:6px"><b>${P.name}</b> · ${Object.keys(P.cost).map(k => `${P.cost[k]} ${B.word(k, P.cost[k])} <span style="opacity:.7">(you have ${pl.inv[k] || 0})</span>`).join(' + ')}${B.ghost && B.ghost.why ? ` · <span style="color:#ff9a7a">${B.ghost.why}</span>` : ''}</div>
        <div>${Object.keys(PIECES).map(k => `<button class="small" data-bp="${k}" style="margin:2px;padding:3px 8px;font-size:11px${k === B.mode ? ';border-color:#7fe8ff;color:#fff' : B.have(pl, PIECES[k].cost) ? '' : ';opacity:.5'}">${PIECES[k].name}</button>`).join('')}</div>
        <div style="margin-top:6px;opacity:.8;font-size:12px">Left click places · drag for a row · right click takes up · <button class="small" data-bmore style="padding:2px 8px;font-size:11px">Craft…</button> <button class="small" data-bdone style="padding:2px 8px;font-size:11px">Done (=)</button></div>`;
    },
    // ------------------------------------------------------------ each frame, before you move
    input(game) {
      const In = ECHO.Input, pe = game.pe, pl = game.pl, world = game.world;
      if (!pe || !pl || !In) return;
      if (In.hit('=') && !(game.ui.blocksWorld() && !(ECHO.UI && ECHO.UI.panelKind === 'build'))) {
        if (B.mode) B.end();
        else if (ECHO.UI && ECHO.UI.panelKind === 'build' && ECHO.UI.panelOpen) ECHO.UI.closePanel();
        else B.open(game);
        return;
      }
      if (!B.mode) return;
      if (pe.dead || pe.x >= 9000 || (ECHO.Interior && ECHO.Interior.cur) || pl.flying) { B.end(); return; }
      if (game.ui.blocksWorld()) { B.ghost = null; return; }
      if (In.mpressed[0]) B._lh = true; if (In.mreleased[0]) B._lh = false;
      if (In.mpressed[2]) B._rh = true; if (In.mreleased[2]) B._rh = false;
      const over = typeof document !== 'undefined' && document.elementFromPoint ? document.elementFromPoint(In.mx, In.my) : null;
      const onUi = !!(over && over.closest && over.closest('#hud-build'));
      const m = game.screenToWorld(In.mx, In.my), x = Math.floor(m.x), y = Math.floor(m.y);
      const far = Math.hypot(x + 0.5 - pe.x, y + 0.5 - pe.y) > B.REACH;
      const why = onUi ? 'ui' : far ? 'too far: walk nearer' : B.why(world, pl, B.mode, x, y, game.ents);
      B.ghost = onUi ? null : { x, y, k: B.mode, ok: !why, why: why && why !== 'ui' ? why : null, mine: !!B.at(world, x, y) };
      if (!onUi && !far) {
        const key = x + ',' + y;
        if (B._lh && !why && B._last !== key) {
          if (B.place(world, pl, B.mode, x, y, game.ents)) { B._last = key; if (ECHO.Sfx) ECHO.Sfx.play('arrowHit', { vol: 0.5, pitch: 0.8 }); C().burst(x + 0.5, y + 0.5, '#d8c090', 5, 2, 0.25, 1); }
        } else if (B._rh && B.at(world, x, y)) {
          const e = B.remove(world, pl, x, y, false);
          if (e) { if (ECHO.Sfx) ECHO.Sfx.play('arrowHit', { vol: 0.4, pitch: 1.2 }); C().floater(x + 0.5, y, `+ ${B.costText(PIECES[e.k].cost)}`, '#9ff6c0'); }
        }
      }
      // (while you are placing, the mouse builds: it does not swing a sword or loose a bolt)
      In.mpressed[0] = In.mpressed[2] = false; In.mdown[0] = In.mdown[2] = false; In.mreleased[0] = In.mreleased[2] = false;
      B.bar(game);
    },
    // ------------------------------------------------------------ walls hold, but not for ever
    tick(game, dt) {
      const world = game.world, S = world && world.built;
      if (!S || !S.list || !S.list.length) return;
      if ((B._t -= dt) > 0) return;
      B._t = 0.5;
      const pe = game.pe;
      for (const e of game.ents) {
        if (e === pe || e.dead || e.hidden || e.isCompanion || e.pal) continue;
        if (!(e.foe ? e.aggro : e.target) || !game.hostileTo(pe, e)) continue;
        if (Math.abs(e.x - pe.x) > 16 || Math.abs(e.y - pe.y) > 16) continue;
        const tg = e.target && !e.target.dead ? e.target : pe, big = e.titan || e.type === 'boss' || e.boss2 || e.giant || (e.r || 0) > 0.8;
        if (!big && (e.moving || U.dist(e.x, e.y, tg.x, tg.y) < (e.r || 0.36) + 1.3)) continue;      // (getting on, or already at its prey)
        // the built thing between it and what it is after
        const a = Math.atan2(tg.y - e.y, tg.x - e.x), reach = (e.r || 0.36) + 0.75;
        let hit = null;
        for (const off of [0, 0.5, -0.5]) { const x = Math.floor(e.x + Math.cos(a + off) * reach), y = Math.floor(e.y + Math.sin(a + off) * reach), p = B.at(world, x, y); if (p && PIECES[p.k] && PIECES[p.k].solid) { hit = p; break; } }
        if (!hit) continue;
        const P = PIECES[hit.k];
        hit.hp = (hit.hp == null ? P.hp : hit.hp) - (big ? 99 : 1);
        C().burst(hit.x + 0.5, hit.y + 0.5, P.cost.stone || P.cost.ingots ? '#b8b4ac' : '#c9a06a', big ? 12 : 4, 3, 0.3, 1.2);
        if (ECHO.Sfx && U.dist(hit.x, hit.y, pe.x, pe.y) < 14) ECHO.Sfx.play('arrowHit', { vol: 0.6, pitch: 0.6 });
        e.dir = a;
        if (hit.hp <= 0) {
          B.remove(world, null, hit.x, hit.y, true);
          C().floater(hit.x + 0.5, hit.y, `${P.name} broken`, '#ff9a7a');
          if (U.dist(hit.x, hit.y, pe.x, pe.y) < 10) game.shake(0.12);
        }
      }
    }
  };
})();
