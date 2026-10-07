// The Realm: how rulers govern, grow and scheme.
//
// Every king or queen pursues an agenda shaped by who they are and what their
// kingdom needs — expansion, building, conquest, trade, faith or security —
// and acts on it with real coin from the treasury:
//   • Expansion: surveyors pick good land on the frontier; a royal commission
//     goes up to clear it; settlers set out from the most crowded town and
//     found a new village, with its own name, roads, fields and reeve.
//   • Works: palisades, granaries, new houses, paved roads, watchtowers and
//     statues of the ruler change the towns and the map.
//   • Decrees: bounties on outlaws, conscription, taxes, grain doles,
//     curfews, bans on fire, amnesties — posted and enforced.
//   • Diplomacy: trade pacts, royal marriages, joint campaigns against the
//     Ashfang, the Lantern brokering peace, tribute paid by the loser.
//   • Plots: ambitious nobles conspire against unpopular rulers. Coups succeed
//     or are crushed — and the player can expose, join or profit from them.
(function () {
  const { U } = ECHO;
  const P = () => ECHO.People;
  const S = () => ECHO.Sim;
  const T = ECHO.TIME;

  const AGENDAS = {
    expand: { name: 'Expansion', desc: 'settling the frontier and founding new villages' },
    build: { name: 'Building', desc: 'palisades, granaries, houses and roads' },
    conquer: { name: 'Conquest', desc: 'taking land from rivals by the sword' },
    trade: { name: 'Trade', desc: 'pacts, caravans and full coffers' },
    faith: { name: 'Faith', desc: 'shrines, alms and the favour of the Lantern' },
    secure: { name: 'Security', desc: 'garrisons, patrols and hunting outlaws' }
  };
  const WORKS = {
    walls: { name: 'a palisade', cost: 260, days: 8 },
    granary: { name: 'a granary', cost: 180, days: 6 },
    houses: { name: 'new houses', cost: 120, days: 4 },
    statue: { name: 'a statue of the ruler', cost: 150, days: 6 },
    watch: { name: 'a watchtower', cost: 140, days: 5 },
    road: { name: 'a paved road', cost: 170, days: 7 }
  };
  const EDICTS = {
    bounty: { name: 'Bounty on outlaws', desc: 'The crown pays 10 crowns for every Ashfang outlaw slain in its lands.', days: 30 },
    conscription: { name: 'Conscription', desc: 'Able farmers are called to the spear.', days: 20 },
    taxup: { name: 'A new tax', desc: 'Taxes are raised to fill the treasury.', days: 30 },
    taxdown: { name: 'Taxes eased', desc: 'Taxes are lowered to quiet the towns.', days: 30 },
    dole: { name: 'Grain dole', desc: 'Grain from the royal stores goes to the hungry towns.', days: 10 },
    curfew: { name: 'Royal curfew', desc: 'No one abroad between midnight and dawn, in every town of the realm.', days: 20 },
    fireban: { name: 'Ban on fire-casting', desc: 'Casting fire is forbidden in every town of the realm.', days: 30 },
    amnesty: { name: 'Amnesty', desc: 'Old crimes are pardoned in the ruler\'s mercy.', days: 5 }
  };

  const R = ECHO.Realm = {
    AGENDAS, WORKS, EDICTS,
    st(f) {
      const r = f.realm = f.realm || {};
      r.edicts = r.edicts || []; r.pacts = r.pacts || {}; r.founded = r.founded || []; r.works = r.works || [];
      return r;
    },
    kingdoms(world) { return Object.values(world.factions).filter(f => f.type === 'kingdom' && !f.fallen); },
    ruler(world, f) { const r = f.ruler && world.npcs[f.ruler]; return r && r.status === 'alive' ? r : null; },
    edict(world, fid, kind) {
      const f = world.factions[fid];
      if (!f || !f.realm) return null;
      return f.realm.edicts.find(e => e.kind === kind && e.until > world.day) || null;
    },
    towns(world, f) { return world.settlements.filter(s => s.faction === f.id); },
    has(s, work) { return !!(s.works && s.works[work]); },

    // ------------------------------------------------------------ agenda
    chooseAgenda(world, f, rng) {
      const r = R.ruler(world, f);
      const has = t => r && P().has(r, t);
      const towns = R.towns(world, f);
      const crowd = Math.max(0, ...towns.map(s => P().residents(world, s).length / Math.max(12, s.foundingPop || 25))) - 1;
      const raids = (f.raidLog || []).filter(d => world.day - d < 40).length;
      const rival = R.kingdoms(world).find(o => o !== f);
      const rel = rival ? (f.relations[rival.id] || 0) : 0;
      const weaker = rival && R.towns(world, rival).length < towns.length;
      const w = {
        expand: 0.9 + Math.max(0, crowd) * 4 + (f.treasury > 600 ? 1 : 0) + (has('ambitious') ? 1.2 : 0) + (has('generous') ? 0.4 : 0),
        build: 0.9 + (has('patient') || has('kind') ? 1 : 0) + (f.treasury > 500 ? 0.8 : 0),
        conquer: 0.25 + (has('ambitious') ? 1.2 : 0) + (has('hot-headed') ? 1 : 0) + (has('cruel') ? 0.8 : 0) + (rel < -40 ? 1.2 : 0) + (weaker ? 0.8 : 0) + (Object.keys(f.atWar).length ? 1.5 : 0),
        trade: 0.6 + (has('greedy') ? 1.2 : 0) + (has('generous') ? 0.5 : 0) + (rel > -15 ? 0.8 : 0),
        faith: 0.3 + (has('pious') ? 2.2 : 0) + (has('kind') ? 0.3 : 0),
        secure: 0.5 + raids * 0.5 + (has('cowardly') ? 1.2 : 0) + (has('patient') ? 0.3 : 0)
      };
      let tot = 0; for (const k in w) tot += w[k];
      let x = rng.next() * tot;
      for (const k in w) { x -= w[k]; if (x <= 0) return k; }
      return 'build';
    },
    // ------------------------------------------------------------ daily
    dailyTick(world, rng) {
      for (const f of R.kingdoms(world)) {
        const st = R.st(f);
        const ruler = R.ruler(world, f);
        if (!st.agenda || st.agendaRuler !== f.ruler || world.day - st.agendaDay >= 45) {
          const a = R.chooseAgenda(world, f, rng);
          const changed = a !== st.agenda;
          st.agenda = a; st.agendaDay = world.day; st.agendaRuler = f.ruler;
          if (changed && ruler) ECHO.Chronicle.add(world, { text: `${P().fullTitle(world, ruler)} turns ${f.short} toward ${AGENDAS[a].name.toLowerCase()}: ${AGENDAS[a].desc}.`, kind: 'politics', importance: 1, sid: f.capital, npcs: [ruler.id] });
        }
        st.edicts = st.edicts.filter(e => e.until > world.day - 30);
        R.works(world, f, rng);
        R.expansion(world, f, rng);
        R.decrees(world, f, rng);
        R.plots(world, f, rng);
        // tribute owed after a lost war
        if (st.tribute && st.tribute.until > world.day) {
          const to = world.factions[st.tribute.to];
          const amt = Math.min(st.tribute.amt, Math.max(0, f.treasury));
          f.treasury -= amt; if (to) to.treasury += amt;
        }
      }
      R.diplomacy(world, rng);
      R.defendTheFaithful(world, rng);
      R.wardens(world);
    },

    // ------------------------------------------------------------ works
    works(world, f, rng) {
      const st = R.st(f);
      // finish what is building
      for (const w of st.works) {
        if (w.done || world.day < w.ready) continue;
        w.done = true;
        const s = S().settlement(world, w.sid);
        if (!s || s.faction !== f.id) continue;
        R.completeWork(world, f, s, w, rng);
      }
      st.works = st.works.filter(w => !w.done || world.day - w.ready < 90);
      // granaries open in hard times
      for (const s of R.towns(world, f)) if (s.works && s.works.granary && s.hunger > 0.25 && world.day - (s._granaryDay || -99) > 12) { s._granaryDay = world.day; s.stock.food += 30; s.hunger = Math.max(0, s.hunger - 0.08); }
      if (st.works.some(w => !w.done)) return;
      const p = (st.agenda === 'build' ? 0.12 : st.agenda === 'faith' || st.agenda === 'secure' ? 0.05 : 0.025) * (1 + Math.min(2, f.treasury / 4000));
      if (!rng.chance(p)) return;
      const towns = R.towns(world, f);
      const opts = [];
      for (const s of towns) {
        const pop = P().residents(world, s).length;
        const houses = s.buildings.filter(b => b.type === 'house').length;
        if (!R.has(s, 'walls') && (s.kind === 'capital' || (f.raidLog || []).length > 2 || st.agenda === 'secure')) opts.push({ s, k: 'walls', w: s.kind === 'capital' ? 2 : 1 });
        if (!R.has(s, 'granary') && (s.hunger > 0.1 || s.lastFamineDay > world.day - 60 || st.agenda === 'build')) opts.push({ s, k: 'granary', w: 1.5 });
        if (pop / Math.max(1, houses) > 3.4 && world.day - (s._noRoom || -999) > 120) {
          if (R.placeBuilding(world, s, 'house', 3, 3, 5, 15, true)) opts.push({ s, k: 'houses', w: 2 });
          else s._noRoom = world.day; // hemmed in: the overflow will have to go and found a village
        }
        if (!R.has(s, 'watch') && world.camps.some(c => c.alive && U.dist(c.x, c.y, s.x, s.y) < 40)) opts.push({ s, k: 'watch', w: st.agenda === 'secure' ? 2 : 0.7 });
      }
      const cap = S().settlement(world, f.capital);
      const ruler = R.ruler(world, f);
      if (cap && ruler && (P().has(ruler, 'ambitious') || P().has(ruler, 'greedy') || P().has(ruler, 'cruel')) && !cap.buildings.some(b => b.type === 'statue' && b.of === ruler.id)) opts.push({ s: cap, k: 'statue', w: 1 });
      // a paved road between two of our towns that have none
      for (const a of towns) for (const b of towns) {
        if (a.id >= b.id || U.dist(a.x, a.y, b.x, b.y) > 70) continue;
        if (world.roads.some(r => (r.a === a.id && r.b === b.id) || (r.a === b.id && r.b === a.id))) continue;
        if (S().route(world, a.id, b.id) && S().roadDistance(world, a.id, b.id) < U.dist(a.x, a.y, b.x, b.y) * 1.8) continue;
        opts.push({ s: a, k: 'road', to: b.id, w: 1.5 });
      }
      const affordable = opts.filter(o => f.treasury > WORKS[o.k].cost + 150);
      if (!affordable.length) return;
      let tot = 0; for (const o of affordable) tot += o.w;
      let x = rng.next() * tot, pick = affordable[0];
      for (const o of affordable) { x -= o.w; if (x <= 0) { pick = o; break; } }
      const W = WORKS[pick.k];
      f.treasury -= W.cost;
      st.works.push({ k: pick.k, sid: pick.s.id, to: pick.to || null, start: world.day, ready: world.day + W.days, done: false });
      const to = pick.to && S().settlement(world, pick.to);
      ECHO.Chronicle.add(world, { text: `By order of ${ruler ? P().fullTitle(world, ruler) : f.name}, work has begun on ${W.name}${to ? ` from ${pick.s.name} to ${to.name}` : ` in ${pick.s.name}`}.`, kind: 'politics', importance: 1, sid: pick.s.id });
      // the commission needs materials: a supply plea
      if (pick.k !== 'statue' && rng.chance(0.6)) ECHO.Plights.post(world, { kind: 'supply', sid: pick.s.id, good: pick.k === 'walls' || pick.k === 'houses' || pick.k === 'watch' ? 'timber' : pick.k === 'road' ? 'ore' : 'food', need: 8 + rng.int(0, 6), deadline: world.day + W.days + 3, reward: 40 + rng.int(0, 30), requester: pick.s.ruler || null, text: `The masons at ${pick.s.name} are short of ${pick.k === 'road' ? 'stone and ore' : pick.k === 'granary' ? 'grain to fill it' : 'timber'} for ${W.name}. The crown will pay for deliveries.` });
    },
    completeWork(world, f, s, w, rng) {
      s.works = s.works || {};
      const W = WORKS[w.k];
      let note = '';
      if (w.k === 'houses') { const n = R.placeBuilding(world, s, 'house', 3, 3, 5, 15) ? 1 : 0; const m = R.placeBuilding(world, s, 'house', 3, 3, 5, 16) ? 1 : 0; if (ECHO.Property && world._prop) ECHO.Property.assignTown(world, s); note = n + m ? '' : ' (there was no room left to build)'; }
      else if (w.k === 'statue') { const r = R.ruler(world, f); const b = R.placeBuilding(world, s, 'statue', 1, 1, 3, 8); if (b && r) { b.of = r.id; b.inscription = `${P().fullTitle(world, r)}, who raised this city.`; s.statueOf = (s.statueOf || []).concat([r.id]); } }
      else if (w.k === 'road') { const to = S().settlement(world, w.to); if (to) { ECHO.World.connectRoad(world, s, to); world._graph = null; world._routes = {}; R.reshaped(world); } }
      else if (w.k === 'granary') { s.works.granary = world.day; s.stock.food += 60; }
      else if (w.k === 'watch') { const b = R.placeBuilding(world, s, 'lamp', 1, 1, 7, 12); if (b) b.tower = true; }
      if (w.k !== 'houses' && w.k !== 'road') s.works[w.k] = world.day;
      if (w.k === 'walls') s.works.walls = world.day;
      R.reshaped(world);
      ECHO.Chronicle.add(world, { text: `${U.cap(W.name)} ${w.k === 'houses' ? 'were' : 'was'} finished ${w.k === 'road' ? `between ${s.name} and ${(S().settlement(world, w.to) || {}).name}` : `in ${s.name}`}${note}.`, kind: 'politics', importance: 1, sid: s.id });
      void rng;
    },
    // Find room for a new building in a town (no overlap, on open ground).
    placeBuilding(world, s, type, w, h, minR, maxR, dry) {
      const Tl = ECHO.TILE, W = world.W;
      const occ = (x, y) => world.blocked[y * W + x] || s.buildings.some(b => x >= b.x - 1 && x < b.x + b.w + 1 && y >= b.y - 1 && y < b.y + b.h + 1);
      for (let t = 0; t < 300; t++) {
        const a = (t * 2.399) % (Math.PI * 2), d = minR + (t / 300) * (maxR - minR);
        const x = Math.round(s.x + Math.cos(a) * d - w / 2), y = Math.round(s.y + Math.sin(a) * d - h / 2);
        let ok = true;
        for (let yy = y - 1; yy <= y + h && ok; yy++) for (let xx = x - 1; xx <= x + w && ok; xx++) {
          const tt = ECHO.World.tile(world, xx, yy);
          if (tt === Tl.WATER || tt === Tl.DEEP || tt === Tl.ROCK || tt === Tl.ROAD || tt === Tl.BRIDGE || tt === Tl.FARM || occ(xx, yy)) ok = false;
        }
        if (!ok) continue;
        if (dry) return true;
        for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) { const tt = ECHO.World.tile(world, xx, yy); if (tt === Tl.TREE || tt === Tl.FOREST || tt === Tl.SWAMP || tt === Tl.FARM) ECHO.World.setTile(world, xx, yy, Tl.GRASS); }
        const b = { id: s.id + '_b' + s.buildings.length + '_' + world.day, type, x, y, w, h };
        s.buildings.push(b);
        ECHO.World.rebuildBlocked(world);
        return b;
      }
      return null;
    },
    reshaped(world) { world._tileEpoch = (world._tileEpoch || 0) + 1; ECHO.emit('world:reshaped', {}); },

    // ------------------------------------------------------------ expansion
    expansion(world, f, rng) {
      const st = R.st(f);
      const plan = st.plan;
      if (plan) {
        if (plan.stage === 'planned' && (world.day >= plan.setOut || plan.cleared)) R.sendSettlers(world, f, plan, rng);
        return;
      }
      if (world.settlements.length >= 16 || world.day - (st.lastFound || -99) < 40) return;
      const towns = R.towns(world, f);
      const crowded = towns.filter(s => P().residents(world, s).length > Math.max(30, (s.foundingPop || 25) * 1.15));
      const want = st.agenda === 'expand' ? 0.08 : crowded.length ? 0.02 : 0.004;
      if (f.treasury < 380 || !rng.chance(want)) return;
      const site = R.findSite(world, f, rng);
      if (!site) { st.lastFound = world.day - 25; return; }
      const from = (crowded.length ? crowded : towns).sort((a, b) => U.dist(a.x, a.y, site.x, site.y) - U.dist(b.x, b.y, site.x, site.y))[0];
      if (!from) return;
      f.treasury -= 200;
      const region = ECHO.World.regionAt(world, site.x, site.y);
      const ruler = R.ruler(world, f);
      const danger = (region.eco && region.eco.wolfDanger > 0.8) ? 'wolves' : world.camps.some(c => c.alive && U.dist(c.x, c.y, site.x, site.y) < 30) ? 'outlaws' : rng.chance(0.5) ? 'wolves' : 'outlaws';
      st.plan = { x: site.x, y: site.y, region: region.id, from: from.id, day: world.day, setOut: world.day + 10, stage: 'planned', danger, cleared: false };
      ECHO.Chronicle.add(world, { text: `${ruler ? P().fullTitle(world, ruler) : f.name} has sent surveyors to the frontier: a new village is to be founded in ${region.name}.`, kind: 'politics', importance: 2, sid: f.capital });
      const cap = S().settlement(world, f.capital);
      const p = ECHO.Plights.post(world, { kind: 'clearsite', sid: cap ? cap.id : from.id, requester: ruler ? ruler.id : null, faction: f.id, x: site.x, y: site.y, danger, deadline: world.day + 10, reward: 140 + rng.int(0, 60),
        text: `${ruler ? P().fullTitle(world, ruler) : 'The crown'} seeks someone to clear the land in ${region.name} of ${danger === 'wolves' ? 'the duskwolves denning there' : 'the outlaws camped there'} before the settlers arrive. Whoever does it will be honoured in the new village.` });
      st.plan.commission = p.id;
    },
    findSite(world, f, rng) {
      const Tl = ECHO.TILE;
      const own = R.towns(world, f);
      let best = null, bs = -Infinity;
      for (let i = 0; i < 2500; i++) {
        const x = rng.int(14, world.W - 15), y = rng.int(12, world.H - 13);
        const t = ECHO.World.tile(world, x, y);
        if (t !== Tl.GRASS && t !== Tl.FOREST) continue;
        const near = Math.min(...world.settlements.map(s => U.dist(s.x, s.y, x, y)));
        if (near < 26) continue;
        if (world.camps.some(c => c.alive && U.dist(c.x, c.y, x, y) < 12) || world.lairs.some(l => U.dist(l.x, l.y, x, y) < 16) || world.ruins.some(r => U.dist(r.x, r.y, x, y) < 12)) continue;
        if (world.wonders && world.wonders.echoes && world.wonders.echoes.some(e => U.dist(e.x, e.y, x, y) < 10)) continue;
        if (world.sites && world.sites.some(e => U.dist(e.x, e.y, x, y) < 10)) continue;
        const sc = ECHO.World.siteScore(world, x, y);
        if (sc < 70) continue;
        const ownD = Math.min(...own.map(s => U.dist(s.x, s.y, x, y)));
        const rivalD = Math.min(99, ...world.settlements.filter(s => s.faction !== f.id).map(s => U.dist(s.x, s.y, x, y)));
        const score = sc * 0.3 - ownD * 0.8 + Math.min(rivalD, 40) * 0.3 + rng.next() * 8;
        if (ownD > 60) continue;
        if (score > bs) { bs = score; best = { x, y }; }
      }
      if (!best) return null;
      // it has to be reachable from the kingdom
      const from = own.sort((a, b) => U.dist(a.x, a.y, best.x, best.y) - U.dist(b.x, b.y, best.x, best.y))[0];
      const cost = (x, y, i) => { const t = world.tiles[i]; return t === Tl.ROCK || t === Tl.DEEP ? Infinity : t === Tl.WATER ? 12 : 1; };
      if (!from || !ECHO.World.findPath(world, from.x, from.y + 1, best.x, best.y + 1, cost, 40000)) return null;
      return best;
    },
    sendSettlers(world, f, plan, rng) {
      const st = R.st(f);
      const from = S().settlement(world, plan.from);
      const p = plan.commission && ECHO.Plights.byId(world, plan.commission);
      if (!from || from.faction !== f.id) { st.plan = null; return; }
      // Uncleared land is dangerous: the settlers may be driven back.
      if (!plan.cleared && rng.chance(0.3)) {
        st.plan = null; st.lastFound = world.day;
        if (p && p.status === 'open') ECHO.Plights.close(world, p, 'failed', null);
        const lost = P().residents(world, from).filter(n => n.prof === 'farmer').slice(0, rng.int(0, 2));
        for (const n of lost) P().kill(world, n, plan.danger === 'wolves' ? 'killed by duskwolves on the frontier' : 'killed by outlaws on the frontier');
        ECHO.Chronicle.add(world, { text: `Settlers from ${from.name} were driven back from ${world.regions[plan.region].name} by ${plan.danger === 'wolves' ? 'duskwolves' : 'outlaws'}${lost.length ? '; ' + U.listJoin(lost.map(n => n.first)) + ' did not come home' : ''}. The new village will have to wait.`, kind: 'politics', importance: 2, sid: from.id });
        return;
      }
      R.found(world, f, plan, rng);
      if (p && p.status === 'open' && !plan.cleared) ECHO.Plights.close(world, p, 'resolved', null);
    },
    // A new village is founded.
    found(world, f, plan, rng) {
      const st = R.st(f);
      const from = S().settlement(world, plan.from);
      const res = P().residents(world, from).filter(n => n.status === 'alive');
      // families first: young couples and their children; a guard or two; a craftsman
      const settlers = [];
      const add = n => { if (n && !settlers.includes(n) && n.status === 'alive' && !n.journey && n.id !== f.ruler && n.id !== from.ruler) settlers.push(n); };
      const couples = res.filter(n => n.spouse && n.prof === 'farmer' && P().age(world, n) < 40).sort(() => rng.next() - 0.5);
      for (const n of couples) { if (settlers.length >= 9) break; add(n); add(world.npcs[n.spouse]); for (const k of n.kids) { const kid = world.npcs[k]; if (kid && kid.prof === 'child') add(kid); } }
      for (const n of res.filter(n => n.prof === 'guard' && n.rank < 2).slice(0, 2)) add(n);
      for (const prof of ['herbalist', 'smith', 'hunter', 'woodcutter']) add(res.find(n => n.prof === prof && !settlers.includes(n)));
      while (settlers.length < 8) { const n = res.find(x => !settlers.includes(x) && x.prof !== 'ruler' && x.id !== from.ruler && P().age(world, x) > 16); if (!n) break; add(n); }
      if (settlers.length < 5) { st.plan = null; return null; }
      const used = new Set(world.settlements.map(s => s.name));
      const name = plan.name || ECHO.makePlaceName(rng, used);
      const s = {
        id: 's' + world.settlements.length + '_' + world.day, name, x: plan.x, y: plan.y, kind: 'village', faction: f.id, founder: f.id, founded: world.day,
        buildings: [], farmTiles: 0, stock: { food: 70, ore: 8, arms: 6, herbs: 6, timber: 40 }, prices: {}, priceHistory: [], unrest: 5, prosperity: 45, hunger: 0, garrison: 0,
        residents: [], events: [], knownRumors: [], lastFamineDay: -999, ruler: null, statueOf: [], prison: [], wealth: 120, techLook: 0, works: {}
      };
      world.settlements.push(s);
      ECHO.World.layoutSettlement(world, s, rng, settlers.length + 6);
      ECHO.World.rebuildBlocked(world);
      ECHO.World.connectRoad(world, from, s);
      world._graph = null; world._routes = {};
      for (const n of settlers) {
        from.residents = from.residents.filter(id => id !== n.id);
        n.home = s.id; n.loc = s.id; n.journey = null; n.house = null; n.lodge = null;
        s.residents.push(n.id);
        P().remember(world, n, `helped found ${s.name}`, 'pride', null, 4);
      }
      const reeve = settlers.filter(n => P().age(world, n) > 22 && n.prof !== 'child').sort((a, b) => (b.renown + b.wealth * 0.1) - (a.renown + a.wealth * 0.1))[0];
      if (reeve) { s.ruler = reeve.id; reeve.title = 'Reeve'; if (reeve.prof !== 'guard') reeve.prof = 'reeve'; }
      s.foundingPop = settlers.length;
      s._farmers = settlers.filter(n => n.prof === 'farmer').length;
      ECHO.Economy.updatePrices(world, s);
      if (ECHO.Production) ECHO.Production.ensureTown(world, s, rng);
      if (ECHO.Property && world._prop) ECHO.Property.assignTown(world, s);
      ECHO.World.rebuildBlocked(world);
      R.reshaped(world);
      st.plan = null; st.lastFound = world.day; st.founded.push(s.id);
      const ruler = R.ruler(world, f);
      const region = ECHO.World.regionAt(world, s.x, s.y);
      ECHO.Chronicle.add(world, { text: `Settlers from ${from.name} founded the village of ${s.name} in ${region.name}${ruler ? ', by order of ' + P().fullTitle(world, ruler) : ''}.`, kind: 'politics', importance: 2, sid: s.id, npcs: settlers.map(n => n.id).slice(0, 6) });
      if (plan.warden) {
        s.warden = plan.warden;
        const pl = world.player;
        if (pl && pl.charId === plan.warden) {
          pl.wardenOf = (pl.wardenOf || []).concat([s.id]);
          for (const n of settlers) n.op[pl.charId] = Math.max(n.op[pl.charId] || 0, 45);
          ECHO.Chronicle.add(world, { text: `${pl.first} ${pl.last}, who cleared the land, was named warden of ${s.name}.`, kind: 'politics', importance: 2, sid: s.id, char: pl.charId });
        }
      }
      return s;
    },
    // The player's own villages pay their warden a share each season.
    wardens(world) {
      const pl = world.player;
      if (!pl || !pl.alive || !pl.wardenOf || !pl.wardenOf.length) return;
      if (T.dateOf(world.day).dayOfSeason !== 15) return;
      let total = 0; const names = [];
      for (const sid of pl.wardenOf) {
        const s = S().settlement(world, sid);
        if (!s || s.warden !== pl.charId) continue;
        const pay = Math.round(P().residents(world, s).length * 1.2 + (s.prosperity || 40) * 0.3);
        total += pay; names.push(s.name);
      }
      if (!total) return;
      pl.gold += total;
      if (ECHO.Letters) ECHO.Letters.add(world, { key: 'ward' + world.day, fromName: `the reeve of ${names[0]}`, kind: 'joy', title: `Your share from ${U.listJoin(names)}`, text: `Warden,\n\nThe season's accounts are done. Your share of the village dues comes to ${total} crowns; it has been sent on to you.\n\nThe fields are in and the people are well. They ask after you.` });
    },

    // ------------------------------------------------------------ decrees
    decree(world, f, kind, o = {}) {
      const st = R.st(f);
      if (R.edict(world, f.id, kind)) return null;
      const E = EDICTS[kind];
      const e = { kind, d: world.day, until: world.day + (o.days || E.days), ...o };
      st.edicts.push(e);
      const ruler = R.ruler(world, f);
      ECHO.Chronicle.add(world, { text: `${ruler ? P().fullTitle(world, ruler) : f.name} decreed: ${E.name.toLowerCase()}. ${E.desc}`, kind: 'politics', importance: 1, sid: f.capital });
      return e;
    },
    decrees(world, f, rng) {
      if (!rng.chance(0.06)) return;
      const st = R.st(f), ruler = R.ruler(world, f);
      const has = t => ruler && P().has(ruler, t);
      const towns = R.towns(world, f);
      const raids = (f.raidLog || []).filter(d => world.day - d < 30).length;
      const hungry = towns.filter(s => s.hunger > 0.3);
      const unrest = towns.length ? U.sum(towns.map(s => s.unrest)) / towns.length : 0;
      if (hungry.length && f.treasury > 250) {
        if (R.decree(world, f, 'dole')) { f.treasury -= 150; for (const s of hungry) { s.stock.food += 150 / hungry.length; s.hunger = Math.max(0, s.hunger - 0.1); } }
        return;
      }
      if ((raids >= 2 || st.agenda === 'secure') && rng.chance(0.6)) { R.decree(world, f, 'bounty'); return; }
      if ((st.agenda === 'conquer' || st.agenda === 'secure') && f.treasury > 300 && rng.chance(0.5)) {
        if (R.decree(world, f, 'conscription')) {
          let n = 0;
          for (const s of towns) for (const x of P().residents(world, s)) {
            if (n >= 6) break;
            if (x.prof === 'farmer' && P().age(world, x) > 17 && P().age(world, x) < 40 && rng.chance(0.15)) { x.prof = 'guard'; x.skill.fight = Math.max(x.skill.fight, 16); n++; P().remember(world, x, 'was called to the spear by royal decree', 'change', null, 2); }
          }
          for (const s of towns) s.unrest = Math.min(100, s.unrest + 4);
        }
        return;
      }
      if (f.treasury < 150 && f.taxRate < 0.2) { if (R.decree(world, f, 'taxup')) { f.taxRate = U.round1((f.taxRate + 0.03) * 100) / 100; for (const s of towns) s.unrest = Math.min(100, s.unrest + 6); } return; }
      if ((unrest > 45 || st.agenda === 'trade' || f.treasury > 4000) && f.taxRate > 0.07 && rng.chance(0.5)) { if (R.decree(world, f, 'taxdown')) { f.taxRate = Math.max(0.05, U.round1((f.taxRate - 0.03) * 100) / 100); for (const s of towns) s.unrest = Math.max(0, s.unrest - 8); } return; }
      if ((has('cruel') || st.plotExposed > world.day - 20) && rng.chance(0.5)) { R.decree(world, f, 'curfew'); return; }
      if ((st.agenda === 'faith' || has('pious')) && rng.chance(0.4)) { R.decree(world, f, 'fireban'); return; }
      if ((has('kind') || has('generous')) && rng.chance(0.15) && world.day - (st.lastAmnesty || -999) > 120) {
        if (R.decree(world, f, 'amnesty')) {
          st.lastAmnesty = world.day;
          for (const c of (world.crimes || [])) if (c.status === 'open' && c.faction === f.id && c.kind !== 'murder') c.status = 'pardoned';
          const pl = world.player;
          if (pl && pl.wanted && pl.wanted[f.id] && pl.wanted[f.id] < 90) delete pl.wanted[f.id];
        }
      }
    },
    // Paid out by the game when the player kills an outlaw in the realm's lands.
    bountyFor(world, x, y) {
      const s = ECHO.World.nearestSettlement(world, x, y, t => t.faction !== 'ashfang');
      if (!s || U.dist(s.x, s.y, x, y) > 45) return null;
      return R.edict(world, s.faction, 'bounty') ? world.factions[s.faction] : null;
    },

    // ------------------------------------------------------------ diplomacy
    diplomacy(world, rng) {
      const ks = Object.values(world.factions).filter(f => (f.type === 'kingdom' || f.type === 'order') && !f.fallen);
      for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
        const a = ks[i], b = ks[j];
        const sa = R.st(a), sb = R.st(b);
        const rel = a.relations[b.id] || 0;
        const war = a.atWar[b.id];
        const pact = sa.pacts[b.id];
        // pacts warm relations; war breaks them
        if (war && pact) { delete sa.pacts[b.id]; delete sb.pacts[a.id]; ECHO.Chronicle.add(world, { text: `The ${pact.kind === 'marriage' ? 'marriage alliance' : pact.kind + ' pact'} between ${a.short} and ${b.short} is broken by war.`, kind: 'politics', importance: 2 }); continue; }
        if (pact && !war) { a.relations[b.id] = b.relations[a.id] = U.clamp(rel + (pact.kind === 'marriage' ? 0.2 : 0.12), -100, 100); }
        if (war) {
          // the Lantern brokers peace in long wars
          if (a.type === 'kingdom' && b.type === 'kingdom' && a.warDays > 20 && rng.chance(0.02)) R.brokerPeace(world, a, b, rng);
          continue;
        }
        if (a.type !== 'kingdom' || b.type !== 'kingdom') continue;
        const ra = R.ruler(world, a), rb = R.ruler(world, b);
        // the crown wants a sealed letter carried to a rival court by someone it can trust
        if (!pact && rel > -30 && rel < 40 && ra && rng.chance(0.012) && !world.plights.some(p => p.kind === 'envoy' && p.status === 'open')) {
          const [snd, rcv] = rng.chance(0.5) ? [a, b] : [b, a];
          const ruler = R.ruler(world, snd);
          const rcap = S().settlement(world, rcv.capital);
          if (ruler && S().settlement(world, snd.capital) && rcap) {
            ECHO.Plights.post(world, { kind: 'envoy', sid: snd.capital, requester: ruler.id, faction: snd.id, toFaction: rcv.id, deadline: world.day + 16, reward: 70 + rng.int(0, 30),
              text: `${P().fullTitle(world, ruler)} needs a sealed letter carried to the court at ${rcap.name} — by someone who is not a royal servant, and so will not be watched. Present it at the keep.` });
            continue;
          }
        }
        // a trade pact
        if (!pact && rel > 12 && (sa.agenda === 'trade' || sb.agenda === 'trade' || rel > 35) && rng.chance(0.04)) {
          sa.pacts[b.id] = sb.pacts[a.id] = { kind: 'trade', d: world.day };
          R.envoy(world, a, b);
          ECHO.Chronicle.add(world, { text: `${a.name} and ${b.name} signed a trade pact. Their caravans will travel under each other's protection.`, kind: 'politics', importance: 2, sid: a.capital });
          continue;
        }
        // a royal marriage
        if ((!pact || pact.kind === 'trade') && rel > 5 && ra && rb && rng.chance(0.012)) {
          const kin = r => [...r.kids].map(id => world.npcs[id]).filter(k => k && k.status === 'alive' && !k.spouse && P().age(world, k) >= 17 && P().age(world, k) < 35);
          const ka = kin(ra), kb = kin(rb);
          const pairA = ka.find(x => kb.some(y => y.sex !== x.sex));
          const pairB = pairA && kb.find(y => y.sex !== pairA.sex);
          if (pairA && pairB) {
            P().marry(world, pairA, pairB, true);
            // the bride or groom of the weaker house moves to the other court
            const mover = R.towns(world, a).length <= R.towns(world, b).length ? pairA : pairB;
            const dest = S().settlement(world, (mover === pairA ? b : a).capital);
            if (dest) { const old = S().settlement(world, mover.home); if (old) old.residents = old.residents.filter(x => x !== mover.id); mover.home = dest.id; mover.loc = dest.id; mover.faction = dest.faction; if (!dest.residents.includes(mover.id)) dest.residents.push(mover.id); }
            sa.pacts[b.id] = sb.pacts[a.id] = { kind: 'marriage', d: world.day };
            a.relations[b.id] = b.relations[a.id] = U.clamp(rel + 30, -100, 100);
            ECHO.Chronicle.add(world, { text: `A royal wedding: ${P().name(pairA)} of ${a.short} and ${P().name(pairB)} of ${b.short} were married, binding the two houses.`, kind: 'politics', importance: 3, npcs: [pairA.id, pairB.id] });
            continue;
          }
        }
        // a joint campaign against the outlaws
        const raidsA = (a.raidLog || []).filter(d => world.day - d < 30).length, raidsB = (b.raidLog || []).filter(d => world.day - d < 30).length;
        if (raidsA >= 2 && raidsB >= 1 && rel > -20 && world.day - (sa.jointDay || -99) > 40 && rng.chance(0.08)) {
          const camp = world.camps.filter(c => c.alive).sort((x, y) => y.members.length - x.members.length)[0];
          if (camp) {
            sa.jointDay = sb.jointDay = world.day;
            a.relations[b.id] = b.relations[a.id] = U.clamp(rel + 10, -100, 100);
            ECHO.Politics.punitiveExpedition(world, a, camp, rng);
            ECHO.Politics.punitiveExpedition(world, b, camp, rng);
            ECHO.Chronicle.add(world, { text: `${a.short} and ${b.short} have agreed to march together against the Ashfang of ${camp.name}.`, kind: 'politics', importance: 2 });
          }
        }
      }
    },
    // When the Lantern's towns are raided, the friendliest kingdom sends soldiers.
    defendTheFaithful(world, rng) {
      const L = world.factions.lantern;
      if (!L || L.fallen) return;
      const raids = (L.raidLog || []).filter(d => world.day - d < 25).length;
      if (raids < 2 || world.day - (R.st(L).defendedDay || -99) < 30 || !rng.chance(0.3)) return;
      const k = R.kingdoms(world).sort((x, y) => (y.relations.lantern || 0) - (x.relations.lantern || 0))[0];
      const temple = S().settlement(world, L.capital);
      if (!k || !temple) return;
      const camp = world.camps.filter(c => c.alive).sort((x, y) => U.dist(x.x, x.y, temple.x, temple.y) - U.dist(y.x, y.y, temple.x, temple.y))[0];
      if (!camp) return;
      R.st(L).defendedDay = world.day;
      ECHO.Politics.punitiveExpedition(world, k, camp, rng);
      k.relations.lantern = L.relations[k.id] = U.clamp((k.relations.lantern || 0) + 8, -100, 100);
      ECHO.Chronicle.add(world, { text: `${k.name} sends soldiers to protect the Lantern's people from the Ashfang of ${camp.name}.`, kind: 'politics', importance: 2, sid: temple.id });
    },
    brokerPeace(world, a, b, rng) {
      const lantern = world.factions.lantern;
      const wick = lantern && R.ruler(world, lantern);
      const loser = (a.casualties || 0) - R.towns(world, a).length * 4 > (b.casualties || 0) - R.towns(world, b).length * 4 ? a : b;
      const winner = loser === a ? b : a;
      ECHO.Politics.makePeace(world, a, b, true);
      const amt = Math.round(Math.max(2, loser.treasury * 0.006));
      R.st(loser).tribute = { to: winner.id, amt, until: world.day + 30 };
      ECHO.Chronicle.add(world, { text: `${wick ? P().fullTitle(world, wick) : 'The Lantern'} brought the envoys of ${a.short} and ${b.short} together at the temple and brokered a peace. ${loser.short} will pay ${winner.short} a tribute of ${amt} crowns a day for a month.`, kind: 'war', importance: 3, sid: lantern ? lantern.capital : null });
      R.envoy(world, loser, winner);
      void rng;
    },
    envoy(world, a, b) {
      const ca = S().settlement(world, a.capital), cb = S().settlement(world, b.capital);
      if (!ca || !cb) return;
      const env = P().residents(world, ca).find(n => n.prof === 'guard' && n.rank >= 1 && !n.journey) || P().residents(world, ca).find(n => n.prof === 'scholar' && !n.journey);
      if (env) S().startJourney(world, { kind: 'envoy', npcs: [env.id], from: ca.id, to: cb.id, speed: 3.4, meta: { envoy: true, fromFaction: a.id } });
    },

    // ------------------------------------------------------------ plots
    plots(world, f, rng) {
      const st = R.st(f), ruler = R.ruler(world, f);
      const cap = S().settlement(world, f.capital);
      if (!ruler || !cap) { st.plot = null; return; }
      const plot = st.plot;
      if (!plot) {
        const hated = (cap.unrest > 40 ? 1 : 0) + (P().has(ruler, 'cruel') ? 1 : 0) + (P().has(ruler, 'greedy') ? 0.5 : 0) + (f.taxRate > 0.14 ? 0.5 : 0) + (Object.keys(f.atWar).length && f.casualties > 8 ? 0.6 : 0);
        if (!rng.chance(0.0008 + hated * 0.0016)) return;
        const kin = new Set([...ruler.kids, ruler.spouse, ...ruler.parents].filter(Boolean));
        const cands = P().residents(world, cap).filter(n => n.id !== ruler.id && !kin.has(n.id) && n.prof !== 'child' && P().age(world, n) > 24 && (n.rel[ruler.id] || 0) < 25 &&
          (P().has(n, 'ambitious') || P().has(n, 'hot-headed') || n.renown > 25 || (n.mind && n.mind.goal && n.mind.goal.kind === 'lead')));
        if (!cands.length) return;
        const by = cands.sort((a, b) => (b.renown + b.rank * 10 + b.wealth * 0.05) - (a.renown + a.rank * 10 + a.wealth * 0.05))[0];
        st.plot = { by: by.id, d: world.day, strength: 8 + by.renown * 0.4 + by.rank * 6, playerJoined: false, rumoured: false };
        return;
      }
      const by = world.npcs[plot.by];
      if (!by || by.status !== 'alive' || by.home !== cap.id) { st.plot = null; return; }
      plot.strength += 0.8 + cap.unrest / 50 + (P().has(ruler, 'cruel') ? 0.5 : 0) + (plot.playerJoined ? 2.5 : 0);
      if (!plot.rumoured && plot.strength > 22) {
        plot.rumoured = true;
        ECHO.Chronicle.add(world, { text: `Whispers in ${cap.name}: someone at court is plotting against ${P().fullTitle(world, ruler)}.`, kind: 'politics', importance: 1, sid: cap.id });
        const captain = P().residents(world, cap).filter(n => n.prof === 'guard').sort((a, b) => b.rank - a.rank)[0];
        const p = ECHO.Plights.post(world, { kind: 'plot', sid: cap.id, requester: captain ? captain.id : ruler.id, faction: f.id, plotter: by.id, deadline: world.day + 14, reward: 150,
          text: `${captain ? P().fullTitle(world, captain) : 'The captain of the guard'} believes someone close to the throne is plotting treason, and wants proof. Listen at court — talk to the ambitious, and find the traitor.` });
        plot.commission = p.id;
      }
      // the crown's spies may find it first
      const spies = 0.016 + (P().has(ruler, 'deceitful') ? 0.01 : 0) + (P().has(ruler, 'cruel') ? 0.008 : 0);
      if (rng.chance(spies) && !plot.playerJoined) return R.exposePlot(world, f, null);
      if (plot.strength > 70 && rng.chance(0.15)) R.coup(world, f, rng);
    },
    exposePlot(world, f, byPlayer) {
      const st = R.st(f), plot = st.plot;
      if (!plot) return;
      const by = world.npcs[plot.by], ruler = R.ruler(world, f);
      st.plot = null; st.plotExposed = world.day;
      if (by && by.status === 'alive') {
        if (ruler && P().has(ruler, 'kind')) { by.jailUntil = world.day + 30; by.title = ''; P().remember(world, by, 'was thrown in the cells for treason', 'trauma', null, 5); }
        else P().kill(world, by, 'executed for treason');
      }
      ECHO.Chronicle.add(world, { text: `A plot against ${ruler ? P().fullTitle(world, ruler) : 'the crown'} was uncovered${byPlayer ? ' by ' + byPlayer : ''}. ${by ? P().name(by) : 'The traitor'} ${by && by.status === 'dead' ? 'was executed' : 'was thrown in the cells'}.`, kind: 'politics', importance: 2, sid: f.capital });
      const p = plot.commission && ECHO.Plights.byId(world, plot.commission);
      if (p && p.status === 'open' && !byPlayer) ECHO.Plights.close(world, p, 'resolved', null);
    },
    coup(world, f, rng) {
      const st = R.st(f), plot = st.plot;
      const by = world.npcs[plot.by], ruler = R.ruler(world, f);
      const cap = S().settlement(world, f.capital);
      const guard = cap ? ECHO.Politics.settlementStrength(world, cap) * 0.5 : 40;
      const win = rng.chance(plot.strength / (plot.strength + guard * (ruler && P().has(ruler, 'brave') ? 1.2 : 1)));
      const pl = world.player;
      st.plot = null;
      const p = plot.commission && ECHO.Plights.byId(world, plot.commission);
      if (win && by) {
        if (ruler) { if (rng.chance(0.6)) P().kill(world, ruler, 'killed in the coup'); else { ruler.title = ''; ruler.prof = 'elder'; P().remember(world, ruler, 'lost the throne in a coup', 'trauma', null, 5); } }
        ECHO.Politics.crown(world, f, by, `seized the throne of ${f.short} in a palace coup`);
        if (plot.playerJoined && pl && pl.alive) {
          pl.gold += 250; pl.renown += 15; pl.knighted = f.id;
          by.op[pl.charId] = Math.max(by.op[pl.charId] || 0, 80);
          ECHO.Chronicle.add(world, { text: `${P().fullTitle(world, by)} rewarded ${pl.first} ${pl.last} with a knighthood and a purse of gold for their part in the coup.`, kind: 'politics', importance: 2, char: pl.charId, sid: f.capital });
          if (ECHO.Letters) ECHO.Letters.add(world, { key: 'coup' + world.day, from: by.id, kind: 'joy', title: 'The throne is ours', text: `${pl.first},\n\nIt is done. ${f.short} has a new ${by.sex === 'f' ? 'queen' : 'king'}, and you have a friend on the throne. A knighthood, and 250 crowns, with my thanks. Come to the keep when you can.\n\n— ${by.first}` });
        }
        if (p && p.status === 'open') ECHO.Plights.close(world, p, 'failed', null);
      } else {
        if (by) P().kill(world, by, 'executed after a failed coup');
        ECHO.Chronicle.add(world, { text: `A coup against ${ruler ? P().fullTitle(world, ruler) : 'the crown'} failed in the halls of ${cap ? cap.name : 'the capital'}. The traitors were put to death.`, kind: 'politics', importance: 3, sid: f.capital });
        if (plot.playerJoined && pl && pl.alive) { pl.wanted = pl.wanted || {}; pl.wanted[f.id] = Math.min(200, (pl.wanted[f.id] || 0) + 120); ECHO.Chronicle.add(world, { text: `${pl.first} ${pl.last} is named a traitor to ${f.short} for their part in the failed coup.`, kind: 'politics', importance: 2, char: pl.charId }); }
        if (p && p.status === 'open') ECHO.Plights.close(world, p, 'resolved', null);
      }
    },
    // The player confronts a plotter. choice: expose | join | blackmail
    confrontPlot(world, f, choice) {
      const st = R.st(f), plot = st.plot, pl = world.player;
      if (!plot) return null;
      const by = world.npcs[plot.by];
      const p = plot.commission && ECHO.Plights.byId(world, plot.commission);
      if (choice === 'expose') {
        R.exposePlot(world, f, `${pl.first} ${pl.last}`);
        pl.gold += 150; pl.renown += 8;
        const ruler = R.ruler(world, f);
        if (ruler) ruler.op[pl.charId] = U.clamp((ruler.op[pl.charId] || 0) + 50, -100, 100);
        if (p && p.status === 'open') { p.status = 'done'; p.closed = world.day; p.outcome = `${pl.first} ${pl.last} uncovered the plot against the crown.`; }
        ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} uncovered a plot against the throne of ${f.short}.`, importance: 2, sid: f.capital, rep: 5, factionRep: { [f.id]: 12 }, tag: 'protect' });
        return 'exposed';
      }
      if (choice === 'join') {
        plot.playerJoined = true; plot.strength += 18;
        if (by) by.op[pl.charId] = U.clamp((by.op[pl.charId] || 0) + 40, -100, 100);
        ECHO.Character.behave(pl, 'betrayal', 0.4);
        return 'joined';
      }
      if (choice === 'blackmail' && by) {
        const pay = Math.round(Math.min(120, 30 + by.wealth * 0.4));
        by.wealth = Math.max(0, by.wealth - pay); pl.gold += pay;
        by.op[pl.charId] = -60;
        P().remember(world, by, `was blackmailed by ${pl.first} ${pl.last}`, 'trauma', null, 4);
        ECHO.Character.behave(pl, 'cruelty', 0.3);
        return pay;
      }
      return null;
    },
    plotBy(world, npcId) {
      for (const f of R.kingdoms(world)) { const p = R.st(f).plot; if (p && p.by === npcId) return f; }
      return null;
    },

    // ------------------------------------------------------------ for the player to read
    describe(world, f) {
      const st = R.st(f), ruler = R.ruler(world, f);
      const towns = R.towns(world, f);
      const pop = U.sum(towns.map(s => P().residents(world, s).length));
      const pacts = Object.entries(st.pacts).map(([k, v]) => `${v.kind === 'marriage' ? 'bound by marriage to' : 'a trade pact with'} ${world.factions[k].short}`);
      const wars = Object.keys(f.atWar).map(k => `at war with ${world.factions[k].short}`);
      const edicts = st.edicts.filter(e => e.until > world.day).map(e => EDICTS[e.kind].name);
      const building = st.works.filter(w => !w.done).map(w => `${WORKS[w.k].name} in ${(S().settlement(world, w.sid) || {}).name}`);
      return { ruler, agenda: st.agenda ? AGENDAS[st.agenda] : null, towns, pop, pacts, wars, edicts, building, plan: st.plan, tribute: st.tribute && st.tribute.until > world.day ? st.tribute : null, coffers: f.treasury > 900 ? 'overflowing' : f.treasury > 400 ? 'full' : f.treasury > 120 ? 'thin' : 'empty' };
    }
  };
})();
