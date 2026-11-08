// The Endless Deep: a way down with no bottom.
//
// One in every world, a walk from your home and marked on your map from the start (an older
// world gets it when it is loaded). It is a dungeon like the others — iron doors, keybearers,
// caches, strongboxes, traps — but:
//   • it has no bottom: there is always a stair further down;
//   • each floor is harder than the last. A floor's level follows you (about 0.85 of your level
//     on the first floor, and 3.5% of you more on every floor below it), and is never less than
//     8 + 4 a floor; past the greatest level there is, it keeps getting stronger regardless;
//   • every floor below the first has its twists — one, two from floor 10, three from floor 25:
//     the Swarm, Ironhide, Frenzy, Bloodthirst, Glass and Fury, Champions, Lightless, the
//     Gauntlet, the Stalker — and now and then a kind one (Gilded: twice the coin);
//   • every fifth floor a Warden of the Deep waits in the far room with its hoard; beat it and
//     that floor's stair-gate is open to you for ever after: next time you may start below it;
//   • each new floor you reach on a descent pays you coin by its level and depth, and your
//     deepest floor is kept (and told, every fifth one);
//   • it is never the same twice: every time you go down from the surface the halls shift.
// Kept: the site in world.sites (kind 'abyss': run, runTop, hoards, wardenDown), and pl.deep
// {best, runs, wardens, gates, bestDay}, made the first time they are needed — nothing else in
// a save changes.
(function () {
  const { U } = ECHO;
  const X = () => ECHO.Explore, Q = () => ECHO.Quests, UI = () => ECHO.UI, P = () => ECHO.Prowess;

  const TWISTS = {
    swarm: { name: 'The Swarm', d: 'half as many again', col: '#ff9a6a' },
    iron: { name: 'Ironhide', d: 'blades and arrows bite a quarter less', col: '#c8c0b0' },
    frenzy: { name: 'Frenzy', d: 'they move and strike faster', col: '#ffcf5a' },
    thirst: { name: 'Bloodthirst', d: 'they heal from the blows they land', col: '#ff5a6a' },
    glass: { name: 'Glass and Fury', d: 'a third less life, two-fifths more harm', col: '#bfe8ff' },
    champions: { name: 'Champions', d: 'every one of them hulking', col: '#ffc04a' },
    dark: { name: 'Lightless', d: 'the lamps burn low', col: '#8a8aa8' },
    gauntlet: { name: 'The Gauntlet', d: 'traps in every passage', col: '#ffb08a' },
    stalker: { name: 'The Stalker', d: 'something strong is already hunting you', col: '#ff6a4a' },
    gilded: { name: 'Gilded', d: 'twice the coin', col: '#ffe08a', good: true }
  };
  const BAD = ['swarm', 'iron', 'frenzy', 'thirst', 'glass', 'champions', 'dark', 'gauntlet', 'stalker'];
  const WARDENS = ['golem', 'ogre', 'necromancer', 'queen', 'warlord'];

  const D = ECHO.Deep = {
    KIND: 'abyss', TWISTS, WARDENS,
    is(site) { return !!site && site.kind === 'abyss'; },
    st(pl) { return pl.deep || (pl.deep = { best: 0, runs: 0, wardens: 0, gates: 0, bestDay: null }); },
    site(world) { return (world && world.sites || []).find(s => s.kind === 'abyss') || null; },
    // one in every world, a walk from your home, on open ground
    ensure(world) {
      if (!world || !world.sites || !world.settlements || !world.settlements.length) return null;
      world._abyss = 1;
      const had = D.site(world);
      if (had) return had;
      const T = ECHO.TILE, W = ECHO.World, OK = [T.GRASS, T.FOREST, T.HILL];
      const home = (world.player && ECHO.Sim.settlement(world, world.player.homeId)) || world.settlements.find(s => s.kind === 'capital') || world.settlements[0];
      const rng = new ECHO.RNG((world.seed ^ 0xab55) >>> 0);
      let spot = null;
      for (let k = 0; k < 900 && !spot; k++) {
        const a = rng.next() * Math.PI * 2, d = 17 + rng.next() * (k < 400 ? 16 : 40);
        const x = Math.round(home.x + Math.cos(a) * d), y = Math.round(home.y + Math.sin(a) * d);
        if (!OK.includes(W.tile(world, x, y)) || W.isSolid(world, x + 0.5, y + 0.5)) continue;
        if (world.settlements.some(o => U.dist(o.x, o.y, x, y) < (k < 600 ? 15 : 11)) || world.sites.some(o => U.dist(o.x, o.y, x, y) < 8) || (world.lairs || []).some(l => U.dist(l.x, l.y, x, y) < 10) || (world.camps || []).some(c => U.dist(c.x, c.y, x, y) < 9) || (ECHO.Gates && ECHO.Gates.inMenace && ECHO.Gates.inMenace(world, x, y))) continue;
        let wet = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (W.isSolid(world, x + dx + 0.5, y + dy + 0.5)) wet++;
        if (wet > 1) continue;
        // out in the open: no one's fields, streets or road under its pillars
        let tame = false; for (let dy = -4; dy <= 4 && !tame; dy++) for (let dx = -4; dx <= 4; dx++) { const t = W.tile(world, x + dx, y + dy); if (t === T.FARM || t === T.ROAD || t === T.PLAZA || t === T.BRIDGE) { tame = true; break; } }
        if (tame && k < 800) continue;
        spot = { x, y };
      }
      if (!spot) return null;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (W.tile(world, spot.x + dx, spot.y + dy) === T.TREE) W.setTile(world, spot.x + dx, spot.y + dy, T.FOREST);
      const s = { id: 'site_abyss', cat: 'delve', kind: 'abyss', name: 'the Endless Deep', x: spot.x + 0.5, y: spot.y + 0.5, found: true, seen: true, cleared: false, used: {}, level: 8, lv2: 1, run: 0, reached: 0 };
      world.sites.push(s);
      W.rebuildBlocked(world);
      world._tileEpoch = (world._tileEpoch || 0) + 1;
      return s;
    },
    plv() { const G = ECHO.Game, pl = G && G.pl; return pl && P() ? P().level(pl) : 1; },
    // how strong a floor is (depth from 0)
    want(depth) { return Math.max(8 + 4 * depth, D.plv() * (0.85 + 0.035 * depth)); },
    level(depth) { const MAX = (P() && P().MAX) || 1500; return Math.min(MAX, Math.round(D.want(depth || 0))); },
    // past the greatest level there is, it keeps getting stronger regardless (0: not yet)
    beyond(depth) { const MAX = (P() && P().MAX) || 1500; return Math.max(0, D.want(depth || 0) / MAX - 1); },
    floors(site) { return Math.max(2, (site.reached || 0) + 2, (site.runTop || 0) + 2); },
    isWarden(depth) { return (depth + 1) % 5 === 0; },
    // a floor's twists: fixed for the descent, so going up and down again finds the same
    twists(site, depth) {
      if (!(depth > 0)) return [];
      const rng = new ECHO.RNG(ECHO.hashStr('abyss:' + (site.run || 0) + ':' + depth));
      const n = depth >= 24 ? 3 : depth >= 9 ? 2 : 1, pool = BAD.slice(), out = [];
      if (rng.next() < 0.12) out.push('gilded');
      for (let i = 0; i < n && pool.length; i++) out.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
      return out;
    },
    has(L, k) { return !!(L && L.twists && L.twists.includes(k)); },
    ord(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); },

    // ------------------------------------------------------------ going down
    // at the mouth of it: start on the first floor, or at any stair-gate you have opened
    chooseFloor(game, site) {
      const s = D.st(game.pl), choices = [];
      choices.push({ label: `Floor 1 · Lv ${D.level(0)}`, onPick: () => Q().enterDelve(game, site, 0) });
      const gates = []; for (let g = 5; g <= s.gates; g += 5) gates.push(g);
      for (const g of gates.slice(-6)) choices.push({ label: `The stair-gate below the ${D.ord(g / 5)} Warden · floor ${g + 1} · Lv ${D.level(g)}`, onPick: () => Q().enterDelve(game, site, g) });
      choices.push({ label: 'Not now', onPick: () => {} });
      UI().modal({ title: 'The Endless Deep', html: `<p class="prose">${esc(X().DELVES.abyss.desc)}</p><p>${s.best ? `Your deepest: <b class="gold">floor ${s.best}</b>${s.bestDay != null ? ` (day ${s.bestDay})` : ''} · ${s.wardens} Warden${s.wardens === 1 ? '' : 's'} beaten · ${s.runs} descent${s.runs === 1 ? '' : 's'}.` : 'You have never been down it.'}</p><p class="dim">Every floor is harder than the last, each with its twists; every fifth floor a Warden waits with its hoard, and beating one opens a stair-gate you may start from next time. Each new floor you reach pays you. The halls are never the same twice.</p>`, choices });
    },
    // you go in (Quests.enterDelve): a new descent from the surface, or a stair within one
    onEnter(game, site, depth) {
      const L = ECHO.Interior.cur, inside = !!(L && L.site === site), s = D.st(game.pl);
      if (!inside) {
        site.run = (site.run || 0) + 1; site.runTop = depth;
        site.floorsDone = {}; site.keys = {}; site.doors = {}; site.caches = {}; site.treasure = {}; site.picked = {}; site.hoards = {}; site.wardenDown = {}; site.chestTaken = false; site.cleared = false;
        s.runs++;
        if (!game.pl._deepTip) { game.pl._deepTip = true; UI().toast('The Endless Deep: every floor is harder than the last, each with its own twists, and a Warden every fifth floor. Every new floor you reach pays you; your deepest is kept. There is no bottom.', 'study', 9); }
        D.record(game, site, depth);
        return;
      }
      if (depth > (site.runTop || 0)) {
        site.runTop = depth;
        const lvl = D.level(depth), gold = D.pay(depth);
        game.pl.gold += gold;
        UI().toast(`Floor ${depth + 1} of the Endless Deep · Lv ${lvl}. Reaching it pays ${gold.toLocaleString('en-US')} crowns.`, 'legend', 5);
        D.record(game, site, depth);
      }
    },
    pay(depth) { return Math.round(30 * D.level(depth) * (1 + depth / 8)); },
    record(game, site, depth) {
      const s = D.st(game.pl), world = game.world, pl = game.pl;
      if (depth + 1 <= s.best) return false;
      const was = s.best;
      s.best = depth + 1; s.bestDay = world.day;
      if (was) {
        pl.renown = (pl.renown || 0) + 1;
        later(() => UI().banner(`Floor ${s.best}`, 'the deepest you have ever been', true), 900);
      }
      if (s.best % 5 === 0 && ECHO.Chronicle) ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} went down to the ${D.ord(s.best)} floor of the Endless Deep.`, importance: s.best >= 25 ? 2 : 1, x: site.x, y: site.y, rep: 2, tag: 'brave' });
      return true;
    },

    // ------------------------------------------------------------ a floor (Quests.layout / populate)
    onLayout(game, L, f, rng) {
      const site = L.site, depth = L.depth || 0, G = L.G;
      L.twists = D.twists(site, depth);
      L.warden = D.isWarden(depth);
      if (D.has(L, 'dark')) for (const l of L.lights) l.a = (l.a || 1) * 0.35;
      if (D.has(L, 'gauntlet')) {
        const ct = ECHO.DGen.corridorTiles(G).filter(t => !G.gap.some(g => g.x === t.x && g.y === t.y) && Math.abs(t.x - G.doorX) + Math.abs(t.y - (L.H - 2)) > 5 && !L.traps.some(o => Math.floor(o.x) === t.x && Math.floor(o.y) === t.y));
        const n = Math.min(ct.length, 6 + depth);
        for (let i = 0; i < n; i++) { const t = ct.splice(rng.int(0, ct.length - 1), 1)[0]; if (t) L.traps.push({ x: t.x + 0.5, y: t.y + 0.5, phase: rng.next() * 3, kind: rng.next() < 0.5 ? 'flame' : 'spikes', cycle: -1 }); }
      }
      if (L.warden) {
        const fr = L.farRoom;
        site.hoards = site.hoards || {};
        L.hoard = f('chest', fr.x0 + 1.5, fr.y0 + 1.4, { action: 'deephoard', label: site.hoards[depth] ? 'An empty hoard' : 'The Warden\'s hoard', colors: { metal: '#9fb8ff' }, light: { r: 4, a: 1, color: '#6a8aff', h: 0.8 } });
      }
      L.deepName = `The Endless Deep — floor ${depth + 1} · Lv ${D.level(depth)}${L.warden ? ' · a Warden waits' : ''}`;
    },
    onPopulate(game, L, lvl, free, tag, pick) {
      const site = L.site, depth = L.depth || 0, BASE = ECHO.Interior.BASE, M = ECHO.Monsters, MAX = (P() && P().MAX) || 1500;
      const mine = () => game.ents.filter(e => !e.dead && e.delve === site.id && e.floor === depth);
      // the Swarm: half as many again, beside those already there
      if (D.has(L, 'swarm')) for (const e of mine()) {
        if (e.keybearer || Math.random() >= 0.5) continue;
        const sp = ECHO.Ent.freeSpot(game.world, e.x + (Math.random() - 0.5) * 2, e.y + (Math.random() - 0.5) * 2, 2);
        if (sp) game.ents.push(tag(M.make(game, pick(), sp.x, sp.y, lvl, {})));
      }
      // a Warden in the far room, before its hoard
      if (L.warden && !(site.hoards || {})[depth] && !(site.wardenDown || {})[depth]) {
        const fr = L.farRoom, k = WARDENS[Math.floor(depth / 5) % WARDENS.length];
        const e = tag(M.make(game, k, BASE + fr.mx, fr.my - 0.5, Math.min(MAX, lvl + 2), { noElite: true }));
        e.deepWarden = true; e.label = `Warden of the Deep · ${U.cap(((M.DEFS[k] || {}).name || k).replace(/^the /i, ''))}`;
        e.hp = e.maxHp = Math.round(e.maxHp * (2.5 + depth * 0.05)); e.dmgMul = (e.dmgMul || 1) * 1.15; e.scale = (e.scale || 1) * 1.15;
        game.ents.push(e);
      }
      // the Stalker: strong, awake, and already coming
      if (D.has(L, 'stalker')) {
        const rooms = L.G.rooms.filter(r => r !== L.G.entrance && r !== L.farRoom), r = rooms[Math.floor(Math.random() * rooms.length)] || L.farRoom, sp = free(r).pop();
        if (sp) {
          const e = tag(M.make(game, pick(), BASE + sp.x + 0.5, sp.y + 0.5, Math.min(MAX, lvl + 4), { noElite: true }));
          e.hp = e.maxHp = Math.round(e.maxHp * 4); e.dmgMul = (e.dmgMul || 1) * 1.3; e.scale = (e.scale || 1) * 1.3; e.label = 'the Stalker'; e.stalker = true; e.aggro = true;
          game.ents.push(e);
        }
      }
      // every twist, on everything on the floor; and past the greatest level, stronger regardless
      const bey = D.beyond(depth);
      for (const e of mine()) D.twist(L, e, bey);
      if (L.twists && L.twists.length) later(() => UI().toast(`Floor ${depth + 1}: ${L.twists.map(k => TWISTS[k].name + ' — ' + TWISTS[k].d).join('; ')}.`, D.has(L, 'gilded') && L.twists.length === 1 ? 'legend' : 'warn', 7), 900);
    },
    twist(L, e, bey) {
      if (e._twisted) return;
      e._twisted = true;
      if (bey > 0) { e.hp = e.maxHp = Math.round(e.maxHp * (1 + 2 * bey)); e.dmgMul = (e.dmgMul || 1) * (1 + bey); }
      if (D.has(L, 'iron')) { e.resist = Object.assign({}, e.resist || {}); e.resist.melee = Math.min(0.85, (e.resist.melee || 0) + 0.25); e.resist.ranged = Math.min(0.85, (e.resist.ranged || 0) + 0.25); }
      if (D.has(L, 'frenzy')) { e.speed = (e.speed || 3) * 1.3; e.cdMul = (e.cdMul || 1) * 0.75; if (e.foe) e.foe = Object.assign({}, e.foe, { wind: (e.foe.wind || 0.5) * 0.8 }); }
      if (D.has(L, 'thirst')) e.ab = Object.assign({}, e.ab || {}, { drain: 0.25 });
      if (D.has(L, 'glass')) { e.hp = e.maxHp = Math.max(1, Math.round(e.maxHp * 0.65)); e.dmgMul = (e.dmgMul || 1) * 1.4; }
      if (D.has(L, 'champions') && !e.deepWarden && !e.stalker && !e.elite && !e.boss2) {
        e.elite = 'hulking'; e.hp = e.maxHp = Math.round(e.maxHp * 1.8); e.dmgMul = (e.dmgMul || 1) * 1.2; e.scale = (e.scale || 1) * 1.18;
        if (!e.keybearer) e.label = `Hulking ${(((ECHO.Monsters && ECHO.Monsters.DEFS[e.species]) || {}).name || e.label || 'thing').toLowerCase()}`;
      }
      if (D.has(L, 'gilded')) e.gilded = true;
    },

    // ------------------------------------------------------------ a Warden, and its hoard
    wardenDown(game, e) {
      const site = D.site(game.world), pl = game.pl, s = D.st(pl), depth = e.floor || 0, gate = depth + 1;
      if (site) { site.wardenDown = site.wardenDown || {}; site.wardenDown[depth] = site.run || 1; }
      s.wardens++;
      const opened = gate > s.gates;
      if (opened) s.gates = gate;
      pl.renown = (pl.renown || 0) + 2;
      later(() => UI().banner('A Warden of the Deep is beaten', opened ? `Its hoard is yours — and the stair-gate below floor ${gate} is open to you for good` : 'Its hoard is yours', true), 1200);
    },
    hoard(game, it) {
      const L = ECHO.Interior.cur, site = L.site, depth = L.depth || 0, pl = game.pl;
      site.hoards = site.hoards || {};
      if (site.hoards[depth]) return UI().toast('The hoard is empty.', 'info', 2);
      if (!(site.wardenDown || {})[depth]) return UI().toast('Not while its Warden stands.', 'warn', 2);
      site.hoards[depth] = game.world.day; it.label = 'An empty hoard';
      const lvl = D.level(depth), gold = Math.round(250 * lvl * (1 + depth / 6)), out = [`${gold.toLocaleString('en-US')} crowns`];
      pl.gold += gold;
      const B = ECHO.Interior.BASE, x = B + it.x, y = it.y + 1.3, where = `in a Warden's hoard on floor ${depth + 1} of the Endless Deep`;
      if (ECHO.Arcana) { ECHO.Arcana.drop(game, x + 0.9, y, lvl + 2, { boost: 30 + depth * 4, floor: depth >= 24 ? 'legendary' : depth >= 9 ? 'epic' : 'rare', where }); out.push('a relic (on the floor)'); }
      ECHO.Monsters.dropGear(game, x, y, lvl + 2, 30 + depth * 4, where); out.push('a piece of gear (on the floor)');
      if (depth >= 9) { ECHO.Monsters.dropGear(game, x - 0.9, y, lvl + 2, 40 + depth * 4, where); out.push('another, finer still'); }
      if (ECHO.Hidden) { const m = ECHO.Hidden.giveMap(game, game.pe.x, game.pe.y, 'in the Warden\'s hoard', true); if (m) out.push('a treasure map to a hidden place'); if (Math.random() < 0.5) { pl.inv.vaultkey = (pl.inv.vaultkey || 0) + 1; out.push('a vault key of old bronze'); } }
      if (ECHO.Well && depth >= 4) { const add = ECHO.Well.core(game, { x: game.pe.x, y: game.pe.y, big: depth >= 14, evo: 1 + Math.min(5, Math.floor(depth / 10)), lv: lvl }); out.push(`a deep-core: your mana +${add} for good`); }
      ECHO.Sfx.play('coin'); if (ECHO.Music) ECHO.Music.stinger('star');
      UI().modal({ title: `The Warden's hoard · floor ${depth + 1}`, html: `<ul>${out.map(g => `<li>${esc(g)}</li>`).join('')}</ul><p class="dim">The stair goes on down.</p>`, choices: [{ label: 'Take it all', onPick: () => {} }] });
    },

    // ------------------------------------------------------------ shown
    html(game) {
      const s = D.st(game.pl), site = D.site(game.world);
      if (!site) return '';
      const pe = game.pe, dist = pe ? Math.round(U.dist(pe.x, pe.y, site.x, site.y)) : 0;
      return `<div class="card"><h4 style="color:#9fb8ff">▼ The Endless Deep</h4><div style="font-size:13px">${s.best ? `Your deepest: <b class="gold">floor ${s.best}</b> · ${s.wardens} Warden${s.wardens === 1 ? '' : 's'} beaten · ${s.runs} descent${s.runs === 1 ? '' : 's'}${s.gates ? ` · you may start at floor ${s.gates + 1}` : ''}` : 'You have never been down it.'}</div><div class="dim" style="font-size:12px">${ECHO.Interior && ECHO.Interior.cur ? '' : `${dist} leagues ${ECHO.Purpose ? ECHO.Purpose.dirTo(game.world, pe || game.pl, site) : ''} · `}no bottom: each floor harder, a Warden every fifth floor. Floor 1 is Lv ${D.level(0)}.</div></div>`;
    }
  };
  const later = (f, ms) => (typeof setTimeout === 'function' ? setTimeout(f, ms) : f());
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
})();
