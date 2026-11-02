// Great events: the few things that change the shape of the world.
//
//   The Great Migration  a great beast comes into a country, and everything that can run, runs —
//                        the wolf packs of every country round it, the herds, and the villagers
//   The Dungeon Bloom    the deep places of a whole region wake at once, deeper and worse
//   The Broken Crown     a crown passes and someone will not kneel: the kingdom splits, town by
//                        town, and there is war until one of them holds it all
//   The Sleeping God     the whole realm dreams the same dream, of something vast asleep under the
//                        stone; the ground shakes, people walk away from their homes to sing to it,
//                        and if no one goes down and sings it back to sleep, it turns over
//
// They are rare (each has a long cooldown; the god comes once in a world), they leave the world
// different from how they found it, and the world goes on without you if you do nothing.
//
// (Its own dice; all of it kept with the world, made the first time it is needed.)
(function () {
  const { U } = ECHO;
  const P = () => ECHO.People, X = () => ECHO.Explore, Ti = () => ECHO.Titans, DL = () => ECHO.DungeonLife;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const KINDS = {
    migration: { name: 'The Great Migration', every: 200, chance: 1 / 260, from: 50 },
    bloom: { name: 'The Dungeon Bloom', every: 120, chance: 1 / 170, from: 40 },
    crown: { name: 'The Broken Crown', every: 260, chance: 1 / 600, from: 90 },
    sleeper: { name: 'The Sleeping God', every: 1e9, chance: 1 / 320, from: 100 }
  };
  const GODS = ['Ulgrath', 'Vey-Amon', 'Oshtar', 'the Grey Mother', 'Hask', 'Ymmerith', 'Old Thole'];
  const DREAMS = [
    'You dream you are standing on a plain of black glass, and under it, very far down, something is breathing. Each breath takes a year. It is nearly time for the next.',
    'You dream of a door in the ground the size of a valley, and of singing on the other side of it — hundreds of voices, and one of them is yours.',
    'You dream of a hand of stone opening, slowly, in the dark under the hills. When you wake your own hand aches as if you had held it shut all night.'
  ];
  const mid = r => ({ x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 });
  const gdx = (world, a, b) => (world.globe && ECHO.Globe ? ECHO.Globe.dx(world, a, b) : b - a);
  const gd = (world, ax, ay, bx, by) => Math.hypot(gdx(world, ax, bx), by - ay);

  const WE = ECHO.WorldEvents = {
    KINDS,
    st(world) { return world.wev || (world.wev = { list: [], last: {}, seq: 0 }); },
    active(world, kind) { return WE.st(world).list.filter(e => !e.over && (!kind || e.kind === kind)); },
    byId(world, id) { return WE.st(world).list.find(e => e.id === id) || null; },
    // ------------------------------------------------------------ every day
    dailyTick(world) {
      if (!world.player) return;
      const S = WE.st(world), rng = new ECHO.RNG(ECHO.hashStr('wev:' + world.seed + ':' + world.day));
      for (const e of WE.active(world)) { try { WE.step(world, rng, e); } catch (err) { e.over = true; console.warn('world event', e.kind, err); } }
      if (WE.active(world).length >= 2) return;
      for (const [k, K] of Object.entries(KINDS)) {
        if (world.day < K.from || world.day - (S.last[k] == null ? -1e9 : S.last[k]) < K.every || WE.active(world, k).length) continue;
        if (k === 'sleeper' && S.godDone) continue;
        if (rng.chance(K.chance)) { WE.start(world, rng, k); break; }
      }
      if (S.list.length > 30) S.list.splice(0, S.list.length - 30);
    },
    start(world, rng, kind, o) {
      const S = WE.st(world);
      const e = WE['begin_' + kind](world, rng, o || {});
      if (!e) return null;
      e.id = 'we' + (++S.seq); e.kind = kind; e.day = world.day; e.name = KINDS[kind].name;
      S.list.push(e); S.last[kind] = world.day;
      ECHO.Chronicle.add(world, { text: `${e.name}. ${e.headline}`, kind: 'event', importance: 3, x: e.x, y: e.y });
      WE.news(world, e, e.headline);
      return e;
    },
    force(world, kind, o) { return WE.start(world, new ECHO.RNG(ECHO.hashStr('wevf:' + world.seed + ':' + world.day + ':' + kind + ':' + WE.st(world).seq)), kind, o); },
    step(world, rng, e) { const f = WE['step_' + e.kind]; if (f) f(world, rng, e); },
    end(world, e, text, imp) {
      e.over = true; e.ended = world.day;
      if (text) { e.outcome = text; ECHO.Chronicle.add(world, { text, kind: 'event', importance: imp || 2, x: e.x, y: e.y }); WE.news(world, e, text); }
    },
    // the player hears of it at once, wherever they are
    news(world, e, text) {
      e.log = e.log || [];
      if (text) { e.log.push({ day: world.day, text }); if (e.log.length > 12) e.log.shift(); }
      if (text && ECHO.UI && ECHO.Game && ECHO.Game.world === world) ECHO.UI.toast(`${e.name}: ${text}`, 'legend', 9);
    },

    // ------------------------------------------------------------ the Great Migration
    begin_migration(world, rng, o) {
      const wild = Ti() ? Ti().wild(world).filter(t => (ECHO.Calamity ? ECHO.Calamity.cls(t).n >= 2 : t.lvl > 60)) : [];
      const t = o.titan || wild[rng.int(0, Math.max(0, wild.length - 1))];
      if (!t) return null;
      const name = `${t.name} ${t.title}`, R = 75;
      const regs = world.regions.filter(r => r.eco && gd(world, t.x, t.y, mid(r).x, mid(r).y) < R).sort((a, b) => gd(world, t.x, t.y, mid(a).x, mid(a).y) - gd(world, t.x, t.y, mid(b).x, mid(b).y));
      let packs = 0;
      for (const r of regs.slice(0, 7)) {
        if (ECHO.Migrations && r.eco.wolf >= 1 && ECHO.Migrations.depart(world, r, { total: 2, cause: { kind: 'titan', name, ref: t.id } }, 0.8, { x: t.x, y: t.y })) packs++;
        // the herds go too: they turn up in the next country over
        const nb = ECHO.World.regionNeighbors(world, r).filter(n => n.eco && gd(world, t.x, t.y, mid(n).x, mid(n).y) > gd(world, t.x, t.y, mid(r).x, mid(r).y))[0];
        const moved = r.eco.hare * 0.55; r.eco.hare -= moved; if (nb) nb.eco.hare += moved * 0.8;
      }
      // and the people: a quarter of the villages near it take to the roads
      const away = world.settlements.filter(s => s.faction !== 'ashfang' && gd(world, t.x, t.y, s.x, s.y) > 60);
      let fled = 0; const towns = [];
      for (const s of world.settlements.filter(s => s.faction !== 'ashfang' && gd(world, t.x, t.y, s.x, s.y) < 45)) {
        const to = away.slice().sort((a, b) => gd(world, s.x, s.y, a.x, a.y) - gd(world, s.x, s.y, b.x, b.y))[0];
        if (!to) continue;
        const go = P().residents(world, s).filter(n => n.prof !== 'child' && n.id !== s.ruler && !n.title && !n.adv && !n.ng && !n.ngAux && !n.journey && n.id !== world.player.companion && P().age(world, n) > 17);
        let k = 0;
        for (const n of go) { if (k >= Math.min(8, Math.ceil(go.length * 0.25))) break; if (!n.journey && n.loc === s.id && rng.chance(0.5)) { ECHO.Sim.migrate(world, n, s, to, 'beast'); k++; } }
        if (k) { fled += k; towns.push(s.name); s.prosperity = Math.max(0, (s.prosperity || 50) - 5); s.unrest = Math.min(100, (s.unrest || 0) + 6); }
      }
      const reg = ECHO.World.regionAt(world, t.x, t.y);
      return { x: t.x, y: t.y, titan: t.id, until: world.day + 14, packs, fled, towns,
        headline: `${name} has come into ${reg ? reg.name : 'the country'}, and everything that can run is running from it: ${packs ? `the wolf packs of ${packs} countries` : 'the wolves'}, the herds${fled ? `, and ${fled} people of ${U.listJoin(towns.slice(0, 3))}` : ''}. The roads are full.` };
    },
    step_migration(world, rng, e) {
      if (world.day >= e.until) WE.end(world, e, `The Great Migration is over. The beasts have found new country, and the land has settled into a new shape around ${(Ti() && Ti().byId(world, e.titan)) ? Ti().byId(world, e.titan).name : 'the great beast'}.`, 2);
    },
    // a great beast settles on new ground (Calamity.arrive): sometimes the land empties before it
    onTitanSettles(world, t) {
      if (!world.player || !ECHO.Calamity || ECHO.Calamity.cls(t).n < 3) return;
      const S = WE.st(world);
      if (world.day - (S.last.migration == null ? -1e9 : S.last.migration) < KINDS.migration.every || WE.active(world, 'migration').length) return;
      const rng = new ECHO.RNG(ECHO.hashStr('wevt:' + world.seed + ':' + world.day + ':' + t.id));
      if (rng.chance(0.5)) WE.start(world, rng, 'migration', { titan: t });
    },

    // ------------------------------------------------------------ the Dungeon Bloom
    begin_bloom(world, rng, o) {
      const all = X().sites(world).filter(s => DL() && DL().ok(s) && !s.starter && !s.sleeper);
      if (all.length < 3) return null;
      let best = null;
      for (let k = 0; k < 12; k++) {
        const c = o.at || all[rng.int(0, all.length - 1)];
        const near = all.filter(s => gd(world, c.x, c.y, s.x, s.y) < 90).sort((a, b) => gd(world, c.x, c.y, a.x, a.y) - gd(world, c.x, c.y, b.x, b.y)).slice(0, 6);
        if (near.length >= 3 && (!best || near.length > best.length)) best = near;
        if (o.at) break;
      }
      if (!best) return null;
      const c = best[0];
      best.forEach((s, i) => {
        DL().life(world, s);
        if (s.cleared) { s.cleared = false; s.chestTaken = false; s.floorsDone = {}; s.caches = {}; s.keys = {}; s.doors = {}; s.treasure = {}; s.round = (s.round || 0) + 1; }
        s.grow = Math.max(s.grow || 0, 45); s.bloom = true;
        if (i < 2) DL().awaken(world, s); else DL().set(world, s, 'infested', null);
        // the towns near it ask for someone to go down
        const t = ECHO.World.nearestSettlement(world, s.x, s.y, x => x.faction !== 'ashfang');
        if (t && !world.plights.some(p => p.status === 'open' && p.kind === 'delve' && p.siteId === s.id)) ECHO.Plights.post(world, { kind: 'delve', sid: t.id, siteId: s.id, deadline: world.day + 30, reward: 120 + rng.int(0, 80), text: `${U.cap(s.name)} has bloomed with the others: things are pouring out of it at night. The town will pay well for anyone who goes down and puts an end to it.` });
      });
      const reg = ECHO.World.regionAt(world, c.x, c.y);
      return { x: c.x, y: c.y, sites: best.map(s => s.id), until: world.day + 30, mine: 0,
        headline: `The deep places around ${reg ? reg.name : 'the land'} have woken all at once — ${U.listJoin(best.map(s => s.name))}. ${best.length} dungeons, deeper and worse than they were, and things coming out of all of them.` };
    },
    step_bloom(world, rng, e) {
      if (world.day < e.until) return;
      const ss = e.sites.map(id => X().byId(world, id)).filter(Boolean);
      const done = ss.filter(s => s.cleared).length;
      for (const s of ss) s.bloom = false;
      if (e.mine >= 2 && ECHO.Renown) ECHO.Renown.add(world, 'hero', 6, `put down ${e.mine} of the bloomed dungeons`);
      WE.end(world, e, `The Dungeon Bloom has passed. ${done} of the ${ss.length} bloomed dungeons were put down${e.mine ? ` (${e.mine} of them by ${world.player.first} ${world.player.last})` : ''}; the rest sink back into their usual dark, still worse than they were.`, 2);
    },
    // a dungeon emptied (DungeonLife.cleared)
    onCleared(world, site, byPlayer) {
      if (site.bloom && byPlayer) for (const e of WE.active(world, 'bloom')) if (e.sites.includes(site.id)) e.mine++;
      if (site.sleeper) { const e = WE.byId(world, site.sleeper); if (e && !e.over) WE.seal(world, e, byPlayer ? 'you' : (site.clearedBy || 'adventurers')); }
    },

    // ------------------------------------------------------------ the Broken Crown
    begin_crown(world, rng, o) {
      const kings = Object.values(world.factions).filter(f => f.type === 'kingdom' && f.ruler && world.npcs[f.ruler] && world.npcs[f.ruler].status === 'alive');
      const f = o.faction || kings[rng.int(0, Math.max(0, kings.length - 1))];
      if (!f || !f.ruler) return null;
      const a = world.npcs[f.ruler];
      const towns = world.settlements.filter(s => s.faction === f.id);
      if (towns.length < 2 || !a) return null;
      const pool = P().alive(world).filter(n => n.faction === f.id && n.id !== a.id && n.status === 'alive' && n.prof !== 'child' && P().age(world, n) > 24 && !n.ng && !n.adv && n.loc).sort((x, y) => (y.renown + (y.rank || 0) * 12 + (y.skill && y.skill.fight || 0) * 0.2) - (x.renown + (x.rank || 0) * 12 + (x.skill && x.skill.fight || 0) * 0.2));
      const b = o.pretender || pool[0];
      if (!b) return null;
      const bHome = ECHO.Sim.settlement(world, b.loc || b.home) || towns[towns.length - 1];
      // the towns choose: the capital holds with the crown; the pretender's own town and the unhappy go over
      const sides = {};
      for (const s of towns) sides[s.id] = s.id === f.capital ? 'a' : s.id === (bHome && bHome.id) ? 'b' : ((s.unrest || 0) > 35 || gd(world, s.x, s.y, bHome.x, bHome.y) < gd(world, s.x, s.y, (ECHO.Sim.settlement(world, f.capital) || s).x, (ECHO.Sim.settlement(world, f.capital) || s).y)) && rng.chance(0.7) ? 'b' : 'a';
      if (!Object.values(sides).includes('b')) sides[towns.find(s => s.id !== f.capital).id] = 'b';
      if (!Object.values(sides).includes('a')) sides[f.capital] = 'a';
      for (const s of towns) s.unrest = Math.min(100, (s.unrest || 0) + 10);
      b.title = b.title || 'Pretender';
      P().remember(world, b, `claimed the crown of ${f.short}`, 'pride', null, 5);
      const cap = ECHO.Sim.settlement(world, f.capital);
      const bt = towns.filter(s => sides[s.id] === 'b').map(s => s.name);
      return { fid: f.id, a: a.id, b: b.id, sides, seat: bHome ? bHome.id : null, x: cap ? cap.x : 0, y: cap ? cap.y : 0, until: world.day + 40 + rng.int(0, 20), battles: 0, dead: 0, side: null, fought: -99, str: { a: 0, b: 0 },
        headline: `${P().fullTitle(world, b)} will not kneel to ${P().fullTitle(world, a)}: ${f.name} is split. ${U.listJoin(bt)} ${bt.length > 1 ? 'have' : 'has'} declared for ${b.first}. There will be war until one of them holds it all.` };
    },
    strength(world, e, side) {
      let v = 0;
      for (const [sid, sd] of Object.entries(e.sides)) {
        if (sd !== side) continue;
        const s = ECHO.Sim.settlement(world, sid);
        if (!s) continue;
        v += P().residents(world, s).filter(n => n.prof === 'guard' || n.prof === 'soldier').length * 2 + (s.prosperity || 50) / 20 + (s.kind === 'capital' ? 6 : 0);
      }
      if (e.side === side) v *= 1.15 + (ECHO.Renown ? ECHO.Renown.get(world, 'influence') / 250 : 0);
      return v + (e.bonus && e.bonus[side] || 0);
    },
    step_crown(world, rng, e) {
      const f = world.factions[e.fid], a = world.npcs[e.a], b = world.npcs[e.b];
      if (!f) return WE.end(world, e, null);
      if (!a || a.status !== 'alive') return WE.crownEnd(world, e, 'b', `${a ? a.first : 'The crown'} is dead`);
      if (!b || b.status !== 'alive') return WE.crownEnd(world, e, 'a', `${b ? b.first : 'The pretender'} is dead`);
      e.str = { a: WE.strength(world, e, 'a'), b: WE.strength(world, e, 'b') };
      for (const sid of Object.keys(e.sides)) { const s = ECHO.Sim.settlement(world, sid); if (s) { s.prosperity = Math.max(0, (s.prosperity || 50) - 0.3); if (s.stock) s.stock.food = Math.max(0, s.stock.food - 0.5); } }
      // a battle on the border between the two halves
      if (rng.chance(0.28)) WE.battle(world, rng, e, null);
      const vals = Object.values(e.sides);
      if (!vals.includes('b')) return WE.crownEnd(world, e, 'a', 'Every town has gone back to the crown');
      if (!vals.includes('a')) return WE.crownEnd(world, e, 'b', 'Every town has gone over');
      if (world.day >= e.until) return WE.crownEnd(world, e, e.str.a >= e.str.b ? 'a' : 'b', 'The war has worn both sides down');
    },
    battle(world, rng, e, withYou) {
      const A = Object.keys(e.sides).filter(id => e.sides[id] === 'a').map(id => ECHO.Sim.settlement(world, id)).filter(Boolean);
      const B = Object.keys(e.sides).filter(id => e.sides[id] === 'b').map(id => ECHO.Sim.settlement(world, id)).filter(Boolean);
      if (!A.length || !B.length) return null;
      let pair = null, pd = Infinity;
      for (const x of A) for (const y of B) { const d = gd(world, x.x, x.y, y.x, y.y); if (d < pd) { pd = d; pair = [x, y]; } }
      const sa = WE.strength(world, e, 'a') + (withYou === 'a' ? withYou && e.youPow : 0), sb = WE.strength(world, e, 'b') + (withYou === 'b' ? e.youPow : 0);
      const pa = sa / Math.max(1, sa + sb), win = rng.next() < pa ? 'a' : 'b';
      const lose = win === 'a' ? 'b' : 'a', at = win === 'a' ? pair[1] : pair[0], from = win === 'a' ? pair[0] : pair[1];
      // the dead, on both sides
      let dead = 0;
      for (const [s, n0] of [[pair[0], win === 'a' ? 1 : 2], [pair[1], win === 'b' ? 1 : 2]]) {
        const fighters = P().residents(world, s).filter(n => (n.prof === 'guard' || n.prof === 'soldier') && !n.ng && !n.adv && n.id !== e.a && n.id !== e.b);
        for (let k = 0; k < n0 && fighters.length; k++) { const n = fighters.splice(rng.int(0, fighters.length - 1), 1)[0]; if (rng.chance(0.6)) { P().kill(world, n, `fell in the war of the Broken Crown, at ${pair[0] === s ? pair[1].name : pair[0].name}`); dead++; } }
      }
      e.battles++; e.dead += dead;
      // a town that loses badly goes over
      const flips = rng.chance(withYou ? 0.6 : 0.35) && at.id !== world.factions[e.fid].capital && at.id !== e.seat;   // (the crown's seat and the pretender's own town hold to the end)
      if (flips) e.sides[at.id] = win;
      const side = x => x === 'a' ? world.npcs[e.a] : world.npcs[e.b];
      const text = `${side(win) ? side(win).first + '\'s' : 'The'} people won a battle ${flips ? 'for' : 'outside'} ${at.name}${flips ? `, and it has gone over to ${side(win) ? side(win).first : 'them'}` : ''}. ${dead ? dead + ' dead.' : ''}`;
      ECHO.Chronicle.add(world, { text, kind: 'war', importance: flips ? 2 : 1, sid: at.id });
      e.log = e.log || []; e.log.push({ day: world.day, text }); if (e.log.length > 12) e.log.shift();
      void lose; void from;
      return { win, at, flips, dead, text };
    },
    crownEnd(world, e, win, why) {
      const f = world.factions[e.fid], a = world.npcs[e.a], b = world.npcs[e.b], pl = world.player;
      const W0 = win === 'a' ? a : b, L0 = win === 'a' ? b : a;
      if (win === 'b' && b && b.status === 'alive' && ECHO.Politics && ECHO.Politics.crown) ECHO.Politics.crown(world, f, b, `took the crown of ${f.short} in the war of the Broken Crown`);
      if (L0 && L0.status === 'alive') { if (Math.random() < 0.5 && L0 !== world.npcs[f.ruler]) P().kill(world, L0, win === 'a' ? 'executed for rebellion after the war of the Broken Crown' : 'put to death when the crown was lost'); else { L0.title = ''; P().remember(world, L0, 'lost the war of the Broken Crown', 'trauma', null, 5); } }
      if (b && win === 'a' && b.status === 'alive' && b.title === 'Pretender') b.title = '';
      for (const sid of Object.keys(e.sides)) { const s = ECHO.Sim.settlement(world, sid); if (s) s.unrest = Math.max(0, (s.unrest || 0) - 8); }
      // and you, if you chose a side
      if (pl && e.side) {
        if (e.side === win) {
          pl.gold += 200 + e.battlesYou * 60;
          if (ECHO.Renown) { ECHO.Renown.add(world, 'influence', 10, `stood with ${W0 ? W0.first : 'the winner'} in the war of the Broken Crown`); ECHO.Renown.add(world, 'honor', 2, null, true); }
          for (const sid of Object.keys(e.sides)) { const s = ECHO.Sim.settlement(world, sid); if (s) { s.rep = s.rep || {}; s.rep[pl.charId] = U.clamp((s.rep[pl.charId] || 0) + 12, -100, 100); } }
          if (!pl.knighted && e.battlesYou >= 2) { pl.knighted = f.id; pl.renown += 10; }
        } else {
          pl.wanted = pl.wanted || {}; pl.wanted[f.id] = Math.min(200, (pl.wanted[f.id] || 0) + 60);
          if (ECHO.Renown) ECHO.Renown.add(world, 'infamy', 5, `stood with the losing side in the war of the Broken Crown`);
        }
      }
      WE.end(world, e, `The war of the Broken Crown is over. ${why}: ${W0 ? P().fullTitle(world, W0) : 'one side'} holds ${f.short}. ${e.dead} died in ${e.battles} battle${e.battles === 1 ? '' : 's'}.${pl && e.side ? (e.side === win ? ` ${pl.first} ${pl.last} stood on the winning side.` : ` ${pl.first} ${pl.last} chose the losing side, and is wanted in ${f.short}.`) : ''}`, 3);
    },
    // you choose a side, or fight in the next battle
    declare(world, id, side) {
      const e = WE.byId(world, id);
      if (!e || e.over || e.side) return false;
      e.side = side; e.battlesYou = 0;
      const n = world.npcs[side === 'a' ? e.a : e.b];
      ECHO.Chronicle.deed(world, { text: `${world.player.first} ${world.player.last} declared for ${n ? P().fullTitle(world, n) : 'one side'} in the war of the Broken Crown.`, importance: 2, rep: 0 });
      return true;
    },
    fight(game, id) {
      const world = game.world, e = WE.byId(world, id), pl = game.pl;
      if (!e || e.over || !e.side) return null;
      if (world.day - e.fought < 3) return { wait: 3 - (world.day - e.fought) };
      e.fought = world.day;
      const lv = ECHO.Prowess ? ECHO.Prowess.level(pl) : 1, era = ECHO.Powers ? ECHO.Powers.era(world, lv) : lv;
      e.youPow = 6 + 20 * U.clamp(lv / Math.max(10, era), 0.3, 3) + (ECHO.Tame ? ECHO.Tame.pack(pl).filter(r => r.out).length * 4 : 0);
      const rng = new ECHO.RNG(ECHO.hashStr('wefight:' + world.seed + ':' + world.day + ':' + e.id));
      const r = WE.battle(world, rng, e, e.side);
      if (!r) return null;
      e.battlesYou++;
      e.bonus = e.bonus || {}; if (r.win === e.side) e.bonus[e.side] = (e.bonus[e.side] || 0) + 3;
      pl.hp = Math.max(1, Math.round(pl.hp * (r.win === e.side ? 0.75 : 0.5)));
      if (game.pe) game.pe.hp = pl.hp;
      if (ECHO.Renown) { ECHO.Renown.add(world, 'hero', r.win === e.side ? 2 : 1, `fought in the war of the Broken Crown, at ${r.at.name}`); ECHO.Renown.add(world, 'fear', 1, null, true); }
      if (ECHO.Prowess && ECHO.Prowess.gain) try { ECHO.Prowess.gain(pl, Math.round(ECHO.Prowess.need(lv) * 0.12)); } catch (err) { /* (only a bonus) */ }
      return r;
    },
    // a crown passes (Politics.succession): sometimes someone will not kneel
    onSuccession(world, f, dead, heir) {
      if (!world.player || f.type !== 'kingdom' || !heir) return;
      const S = WE.st(world);
      if (world.day - (S.last.crown == null ? -1e9 : S.last.crown) < 120 || WE.active(world, 'crown').length) return;
      const rng = new ECHO.RNG(ECHO.hashStr('wevc:' + world.seed + ':' + world.day + ':' + f.id));
      const young = P().age(world, heir) < 25 || !(dead.kids || []).includes(heir.id);
      if (rng.chance(young ? 0.55 : 0.15)) WE.start(world, rng, 'crown', { faction: f });
    },

    // ------------------------------------------------------------ the Sleeping God
    begin_sleeper(world, rng, o) {
      const towns = world.settlements, far = s => Math.min(...towns.map(t => gd(world, t.x, t.y, s.x, s.y)));
      const ok = X().sites(world).filter(s => DL() && DL().ok(s) && !s.starter && !s.bloom);
      let pool = [];
      for (const lim of [30, 22, 15, 0]) { pool = ok.filter(s => (lim ? !X().small(s) : true) && far(s) > lim); if (pool.length) break; }
      pool.sort((a, b) => (['sanctum', 'forge', 'barrow', 'catacomb', 'crypt'].includes(b.kind) - ['sanctum', 'forge', 'barrow', 'catacomb', 'crypt'].includes(a.kind)) || ((b.level || 0) - (a.level || 0)));
      const s = o.site || pool[rng.int(0, Math.min(3, pool.length - 1))];
      if (!s) return null;
      const god = GODS[rng.int(0, GODS.length - 1)];
      DL().life(world, s);
      s.sleeper = 'we' + (WE.st(world).seq + 1); s.found = true; s.seen = true;
      if (s.cleared) { s.cleared = false; s.chestTaken = false; s.floorsDone = {}; s.keys = {}; s.doors = {}; s.treasure = {}; s.caches = {}; }
      s.roster = [['cultist', 4], ['wraith', 2], ['golemling', 1]];
      DL().awaken(world, s);
      s.life.hist = `Under ${s.name} sleeps ${god}, older than the kingdoms, older than the Hollow King's world. It has slept so long the hills have grown over it. It is waking. Those who dream of it walk away from their homes to go down and sing to it — and if enough of them sing, it will wake.`;
      // the whole realm dreams the same dream
      let dreamers = 0;
      for (const n of P().alive(world)) if (n.status === 'alive' && n.prof !== 'child' && rng.chance(0.3)) { P().remember(world, n, `dreamt of ${god}, asleep under the stone`, 'fear', null, 2); dreamers++; }
      const reg = ECHO.World.regionAt(world, s.x, s.y);
      return { x: s.x, y: s.y, site: s.id, god, wake: world.day + 50 + rng.int(0, 15), stage: 1, choir: [], tremor: world.day, dreamers, dream: DREAMS[rng.int(0, DREAMS.length - 1)],
        headline: `All across the realm, ${dreamers} people dreamt the same dream last night: something vast asleep under ${s.name}, in ${reg ? reg.name : 'the wild'}. They say its name is ${god}. They say it is waking.` };
    },
    step_sleeper(world, rng, e) {
      const s = X().byId(world, e.site);
      if (!s) return WE.end(world, e, null);
      const left = e.wake - world.day;
      // the ground shakes
      if (world.day - e.tremor >= (left < 20 ? 2 : 4)) {
        e.tremor = world.day;
        const near = world.settlements.filter(t => gd(world, t.x, t.y, s.x, s.y) < 80);
        for (const t of near) t.prosperity = Math.max(0, (t.prosperity || 50) - (left < 20 ? 1.5 : 0.7));
        if (near.length) ECHO.Chronicle.add(world, { text: `The ground shook at ${U.listJoin(near.slice(0, 3).map(t => t.name))}. ${left < 20 ? 'Cracks ran across the roads, and the wells went foul for a day.' : 'Pots fell from the shelves. The dogs would not stop howling.'}`, kind: 'event', importance: 1, x: s.x, y: s.y });
      }
      // the dreamers walk away from their homes to sing to it
      if (rng.chance(left < 20 ? 0.3 : 0.15)) {
        const cand = P().alive(world).filter(n => n.status === 'alive' && n.loc && n.prof !== 'child' && !n.title && !n.ng && !n.adv && !n.journey && n.id !== world.player.companion && P().age(world, n) > 16 && (n.prof === 'priest' || n.prof === 'wanderer' || n.prof === 'herbalist' || rng.chance(0.25)) && gd(world, (ECHO.Sim.settlement(world, n.loc) || s).x, (ECHO.Sim.settlement(world, n.loc) || s).y, s.x, s.y) < 140);
        const n = cand[rng.int(0, Math.max(0, cand.length - 1))];
        if (n) {
          const from = ECHO.Sim.settlement(world, n.loc);
          n.choir = e.id; n.choirFrom = n.loc; n.loc = null; n.journey = 'choir';
          e.choir.push(n.id);
          P().remember(world, n, `walked away from ${from ? from.name : 'home'} to sing to ${e.god}`, 'change', null, 5);
          if (e.choir.length === 1 || e.choir.length % 3 === 0) ECHO.Chronicle.add(world, { text: `${n.first} ${n.last} of ${from ? from.name : 'the realm'} walked out of town in the night, singing, toward ${s.name}. ${e.choir.length > 1 ? e.choir.length + ' have gone now.' : ''}`, kind: 'event', importance: 1, sid: from ? from.id : null });
        }
      }
      // it stirs
      if (e.stage === 1 && left <= 20) {
        e.stage = 2;
        const others = X().sites(world).filter(x => x !== s && DL().ok(x) && gd(world, x.x, x.y, s.x, s.y) < 90).slice(0, 2);
        for (const x of others) DL().awaken(world, x);
        WE.news(world, e, `${e.god} stirs. ${others.length ? U.cap(U.listJoin(others.map(x => x.name))) + ' woke with it. ' : ''}The scholars say there are ${left} days left, perhaps fewer. Someone has to go down into ${s.name} and sing it back to sleep — reach the bottom and take what it guards.`);
        ECHO.Chronicle.add(world, { text: `${e.god} stirs under ${s.name}.`, kind: 'event', importance: 3, x: s.x, y: s.y });
      }
      // the Guild's best may try
      if (ECHO.Guild && left > 0 && rng.chance(0.03)) {
        const pw = X().floorLevel(s, X().floors(s) - 1);
        const team = ECHO.Guild.available(world).filter(n => ['A', 'S'].includes(ECHO.Guild.rank(world, n))).slice(0, 3);
        if (team.length >= 2) {
          const p = team.reduce((a, n) => a + ECHO.Delvers.power(world, n), 0) / team.length + team.length;
          if (rng.next() < 0.25 + (p - pw) * 0.04) { s.cleared = true; s.clearedDay = world.day; s.clearedBy = team.map(n => n.first).join(', '); for (const n of team) { n.adv.fame += 15; n.adv.wins++; } WE.seal(world, e, `${U.listJoin(team.map(n => ECHO.Guild.name(n)))} of the Guild`); return; }
          const lost = team[rng.int(0, team.length - 1)];
          ECHO.Guild.fall(world, rng, lost, { x: s.x + 4, y: s.y + 3 }, `killed in ${s.name}, going down to face ${e.god}`, `the Sleeper under ${s.name}`);
        }
      }
      if (left <= 0) WE.wake(world, rng, e, s);
    },
    seal(world, e, by) {
      const s = X().byId(world, e.site), pl = world.player;
      for (const id of e.choir) { const n = world.npcs[id]; if (n && n.status === 'alive' && n.choir === e.id) { n.choir = null; n.journey = null; n.loc = n.choirFrom || n.home; P().remember(world, n, `woke up in the dark under ${s ? s.name : 'the stone'}, and came home`, 'trauma', null, 4); } }
      if (by === 'you' && pl) {
        if (ECHO.Renown) { ECHO.Renown.add(world, 'hero', 12, `sang ${e.god} back to sleep`); ECHO.Renown.add(world, 'knowledge', 8, null, true); }
        pl.renown += 20;
      }
      if (s) { s.sleeper = null; s.roster = null; }
      WE.st(world).godDone = true;
      WE.end(world, e, `${e.god} sleeps on. ${by === 'you' && pl ? `${pl.first} ${pl.last}` : by} went down to the bottom of ${s ? s.name : 'the deep place'} and sang it back to sleep. The dreams have stopped${e.choir.length ? `, and the ${e.choir.length} who went down to sing to it are walking home` : ''}.`, 3);
    },
    wake(world, rng, e, s) {
      let dead = 0;
      for (const t of world.settlements.filter(t => gd(world, t.x, t.y, s.x, s.y) < 85)) {
        t.prosperity = Math.max(0, (t.prosperity || 50) - 15); t.unrest = Math.min(100, (t.unrest || 0) + 10);
        const res = P().residents(world, t);
        for (let k = 0; k < rng.int(1, 3) && res.length; k++) { P().kill(world, res.splice(rng.int(0, res.length - 1), 1)[0], `killed when ${e.god} turned over and the earth opened`); dead++; }
      }
      for (const x of X().sites(world).filter(x => DL().ok(x) && gd(world, x.x, x.y, s.x, s.y) < 100)) DL().awaken(world, x);
      for (const id of e.choir) { const n = world.npcs[id]; if (n && n.status === 'alive') P().kill(world, n, `swallowed when ${e.god} woke`); }
      let herald = null;
      if (ECHO.Powers) {
        const lv = Math.max(60, Math.round((ECHO.Powers.era ? ECHO.Powers.era(world, ECHO.Prowess ? ECHO.Prowess.level(world.player) : 1) : 30) * 1.6));
        herald = ECHO.Powers.rise(world, { kind: 'golem', name: `the Herald of ${e.god}`, epi: 'out of the opened earth', lv, x: s.x + 6, y: s.y + 4, why: 'rose', amb: 'dominion', infl: 30, text: `Out of the opened earth over ${s.name} walked the Herald of ${e.god}.` });
      }
      if (s) s.sleeper = null;
      WE.st(world).godDone = true;
      WE.end(world, e, `${e.god} turned over in its sleep. The earth opened for a day's ride round ${s.name}; ${dead} died, every deep place for a hundred leagues woke, and ${herald ? 'the Herald of ' + e.god + ' walked out of the ground' : 'something walked out of the ground'}. Then it slept again — for now.`, 3);
    },
    // the choir, waiting in the dark (Quests.populate)
    inDelve(game, L, site, free, tag) {
      if (!site.sleeper || (L.depth || 0) < Math.max(0, L.floors - 2)) return;
      const e = WE.byId(game.world, site.sleeper);
      if (!e || e.over) return;
      const ids = e.choir.filter(id => game.world.npcs[id] && game.world.npcs[id].status === 'alive').slice(0, 6);
      const rooms = L.G.rooms.filter(r => r !== L.G.entrance);
      ids.forEach((id, i) => {
        const n = game.world.npcs[id], r = rooms[i % rooms.length], sp = free(r).pop();
        if (!sp || !ECHO.Monsters) return;
        const m = tag(ECHO.Monsters.make(game, 'cultist', ECHO.Interior.BASE + sp.x + 0.5, sp.y + 0.5, X().floorLevel(site, L.depth), { noElite: true }));
        m.label = `${n.first} ${n.last}, of the Choir`; m.choirOf = id;
        game.ents.push(m);
      });
      if (ids.length) setTimeout(() => ECHO.UI.toast(`Singing, somewhere below — people you might know, their eyes open and empty. (${ids.length} of the Choir are here.)`, 'warn', 6), 1800);
    },
    // a member of the choir killed down there
    onKill(world, e) { const n = e && e.choirOf && world.npcs[e.choirOf]; if (n && n.status === 'alive') P().kill(world, n, `killed in the dark, singing to the Sleeper`); },

    // ------------------------------------------------------------ in the world
    update(game, dt) {
      const world = game.world, pe = game.pe;
      if (!world || !pe || !world.wev) return;
      WE._t = (WE._t || 0) - dt;
      if (WE._t > 0) return;
      WE._t = 2;
      for (const e of WE.active(world)) {
        const d = gd(world, pe.x, pe.y, e.x, e.y);
        if (e.kind === 'sleeper') {
          if (!e.dreamt) { e.dreamt = 1; ECHO.UI.modal({ title: 'A dream', html: `<p class="prose">${esc(e.dream)}</p><p class="dim">When you wake, the name ${esc(e.god)} is in your mouth. You are not the only one: half the realm dreamt it too. (The place is on your map: ${esc((X().byId(world, e.site) || {}).name || '')}.)</p>`, choices: [{ label: 'Get up', onPick: () => {} }] }); }
          if (d < 110 && !ECHO.Interior.cur && Math.random() < (e.wake - world.day < 20 ? 0.1 : 0.04)) { game.shake && game.shake(d < 40 ? 0.7 : 0.35); if (ECHO.Sfx) ECHO.Sfx.play('stomp', { pitch: 0.5 }); if (!e._rumble || game.time - e._rumble > 120) { e._rumble = game.time; ECHO.UI.toast('The ground rolls under your feet, slow and deep, like something turning over.', 'warn', 4); } }
        }
        if (e.kind === 'migration' && d < 90 && !ECHO.Interior.cur && !(game.pl && game.pl.flying) && Math.random() < 0.25 && ECHO.Spawner && ECHO.Spawner.makeCreature) {
          // the herds go by, running from it
          const a = Math.atan2(pe.y - e.y, gdx(world, e.x, pe.x)), ox = pe.x - Math.cos(a) * 14 + (Math.random() - 0.5) * 10, oy = pe.y - Math.sin(a) * 14 + (Math.random() - 0.5) * 10;
          if (!ECHO.World.isSolid(world, ox, oy) && game.ents.filter(x => x._fleeHerd && !x.dead).length < 10) {
            for (let k = 0; k < 3; k++) { try { const h = ECHO.Spawner.makeCreature(game, 'hare', ox + Math.random() * 2, oy + Math.random() * 2); if (h) { h._fleeHerd = 1; h.state = 'flee'; h.fleeFrom = { x: e.x, y: e.y }; game.addEnt ? game.addEnt(h) : game.ents.push(h); } } catch (err) { break; } }
            if (!e._herdTold) { e._herdTold = 1; ECHO.UI.toast('Hares, deer, foxes — all running the same way, past you, not caring that you are there.', 'info', 5); }
          }
        }
      }
    },
    // ------------------------------------------------------------ the notice board's page
    html(game, s) {
      const world = game.world, act = WE.active(world), past = WE.st(world).list.filter(e => e.over && world.day - e.ended < 60).slice(-4).reverse();
      const card = e => {
        let body = '';
        if (e.kind === 'crown') {
          const f = world.factions[e.fid], a = world.npcs[e.a], b = world.npcs[e.b];
          const side = sd => Object.keys(e.sides).filter(id => e.sides[id] === sd).map(id => (ECHO.Sim.settlement(world, id) || {}).name).filter(Boolean);
          body += `<div>${esc(f ? f.name : '')} is at war with itself. For <b>${esc(a ? P().fullTitle(world, a) : '?')}</b>: ${esc(U.listJoin(side('a')))}. For <b>${esc(b ? P().fullTitle(world, b) : '?')}</b>: ${esc(U.listJoin(side('b')))}.</div><div class="dim">${e.battles} battle${e.battles === 1 ? '' : 's'}, ${e.dead} dead. Strength ${Math.round(WE.strength(world, e, 'a'))} against ${Math.round(WE.strength(world, e, 'b'))}.</div>`;
          if (!e.side) body += `<div class="row"><button class="small" data-we="${e.id}" data-weside="a">Declare for ${esc(a ? a.first : 'the crown')}</button><button class="small" data-we="${e.id}" data-weside="b">Declare for ${esc(b ? b.first : 'the pretender')}</button></div><p class="dim" style="font-size:12px">Choose a side and you can fight in its battles. If your side wins: gold, influence, and perhaps a knighthood. If it loses, you are wanted in ${esc(f ? f.short : 'the kingdom')}.</p>`;
          else { const wait = 3 - (world.day - e.fought); body += `<div class="gold">You stand with ${esc((e.side === 'a' ? a : b) ? (e.side === 'a' ? a : b).first : '')}. You have fought in ${e.battlesYou} of its battles.</div><div class="row"><button class="small" data-wefight="${e.id}" ${wait > 0 ? 'disabled' : ''}>${wait > 0 ? `Next battle in ${wait} day${wait > 1 ? 's' : ''}` : 'March to the next battle'}</button></div>`; }
        } else if (e.kind === 'bloom') {
          body += `<div>${e.sites.map(id => { const x = X().byId(world, id); return x ? `${esc(x.name)} — ${x.cleared ? '<span class="gold">put down</span>' : `<span class="ember">${esc(DL().STATES[(x.life || {}).state || 'active'].name)}</span>`} <button class="small" data-wemark="${id}">Mark it</button>` : ''; }).join('<br>')}</div><div class="dim">${Math.max(0, e.until - world.day)} days left. You have put down ${e.mine}.</div>`;
        } else if (e.kind === 'sleeper') {
          const x = X().byId(world, e.site), left = e.wake - world.day;
          body += `<div>${esc(e.god)} sleeps under <b>${esc(x ? x.name : '?')}</b> — and is waking. ${e.choir.length} have walked away from their homes to sing to it.</div><div class="${left < 20 ? 'ember' : 'dim'}">The scholars guess ${left} days before it wakes. Reach the bottom of ${esc(x ? x.name : 'it')} and take what it guards, and it will sleep on.</div><div class="row"><button class="small" data-wemark="${e.site}">Mark it</button></div>`;
        } else if (e.kind === 'migration') {
          body += `<div>${e.packs} packs on the move, ${e.fled} people on the roads${e.towns.length ? ' from ' + esc(U.listJoin(e.towns.slice(0, 3))) : ''}. ${Math.max(0, e.until - world.day)} days until the land settles.</div>`;
        }
        return `<div class="card we-card"><h4 class="gold">${esc(e.name)}</h4><div class="dim" style="font-size:13px">${esc(e.headline)}</div>${body}${(e.log || []).length > 1 ? `<div class="dim" style="font-size:12px;margin-top:6px">${e.log.slice(-4).reverse().map(l => `day ${l.day} · ${esc(l.text)}`).join('<br>')}</div>` : ''}</div>`;
      };
      return `<p class="dim">The great events of the age, as the realm hears of them.</p>${act.length ? act.map(card).join('') : '<p class="dim">Nothing out of the ordinary — for now.</p>'}${past.length ? `<h3 class="gold">Lately</h3><div class="dim" style="font-size:13px">${past.map(e => `<b>${esc(e.name)}</b> — ${esc(e.outcome || '')}`).join('<br>')}</div>` : ''}`;
    },
    bind(body, game, render) {
      const world = game.world;
      body.querySelectorAll('button[data-weside]').forEach(b => b.addEventListener('click', () => { WE.declare(world, b.dataset.we, b.dataset.weside); render(); }));
      body.querySelectorAll('button[data-wefight]').forEach(b => b.addEventListener('click', () => {
        const r = WE.fight(game, b.dataset.wefight);
        if (r && r.text) ECHO.UI.modal({ title: 'The battle', html: `<p class="prose">You march with them and fight in the line. ${esc(r.text)}</p><p class="dim">You come out of it ${r.win ? 'bloodied' : 'badly hurt'}.</p>`, choices: [{ label: 'Go on', onPick: () => {} }] });
        render();
      }));
      body.querySelectorAll('button[data-wemark]').forEach(b => b.addEventListener('click', () => { const x = X().byId(world, b.dataset.wemark); if (!x) return; game.pl.tracked = 'site:' + x.id; if (ECHO.Purpose) { ECHO.Purpose._html = null; ECHO.Purpose.t = 0; } ECHO.UI.toast(`Marked: ${x.name}.`, 'info', 3); render(); }));
    }
  };
})();
