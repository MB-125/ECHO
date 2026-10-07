// Production chains: the economy runs through real places worked by real
// people. Grain becomes flour at the mill; ore comes out of the mine; timber
// from the lumber camp; the smith turns ore and charcoal into arms. Kill the
// miners and the ore stops; burn the mill and bread doubles in price until
// the reeve can find the timber and coin to rebuild it.
(function () {
  const { U } = ECHO;
  const TILE = ECHO.TILE;
  const P = () => ECHO.People;

  const KINDS = {
    mill: { label: 'mill', prof: 'miller', w: 2, h: 2, rmin: 6, rmax: 14, cost: 70, timber: 30 },
    mine: { label: 'mine', prof: 'miner', w: 2, h: 2, rmin: 7, rmax: 22, cost: 60, timber: 25 },
    lumber: { label: 'lumber camp', prof: 'woodcutter', w: 2, h: 2, rmin: 6, rmax: 20, cost: 30, timber: 10 }
  };
  const OK_TILES = new Set([TILE.GRASS, TILE.FOREST, TILE.HILL, TILE.SAND, TILE.SNOW]);

  const Pr = ECHO.Production = {
    KINDS,
    facilities(world, s) { return s.buildings.filter(b => b.fac); },
    facility(world, s, kind) { return s.buildings.find(b => b.fac && b.type === kind); },
    near(world, x, y, r, types) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (types.has(ECHO.World.tile(world, x + dx, y + dy))) return true;
      return false;
    },
    findSpot(world, s, k, want) {
      const K = KINDS[k];
      const taken = (x, y) => world.blocked[y * world.W + x] === 1;
      let best = null, bs = Infinity;
      for (let r = K.rmin; r <= K.rmax; r++) for (let a = 0; a < 24; a++) {
        const x = Math.round(s.x + Math.cos(a / 24 * Math.PI * 2) * r), y = Math.round(s.y + Math.sin(a / 24 * Math.PI * 2) * r);
        let ok = true;
        for (let yy = y - 1; yy <= y + K.h && ok; yy++) for (let xx = x - 1; xx <= x + K.w && ok; xx++) {
          const t = ECHO.World.tile(world, xx, yy);
          const inside = yy >= y && yy < y + K.h && xx >= x && xx < x + K.w;
          if (inside && (!OK_TILES.has(t) || taken(xx, yy))) ok = false;
          if (!inside && (t === TILE.WATER || t === TILE.DEEP || taken(xx, yy))) ok = false;
        }
        if (!ok) continue;
        if (want && !Pr.near(world, x + 1, y + 1, 3, want)) continue;
        const score = r + (want ? 0 : 0);
        if (score < bs) { bs = score; best = { x, y }; }
        if (best) break;
      }
      return best;
    },
    // Put the workplaces into a world that doesn't have them yet.
    ensure(world) {
      if (world._prod >= 1) return;
      world._prod = 1;
      const rng = new ECHO.RNG(ECHO.hashStr('prod' + world.seed));
      for (const s of world.settlements) Pr.ensureTown(world, s, rng);
      ECHO.World.rebuildBlocked(world);
      world._tileEpoch = (world._tileEpoch || 0) + 1;
    },
    // Workplaces and stocks for one town (new towns get theirs when founded).
    ensureTown(world, s, rng) {
      {
        const region = ECHO.World.regionAt(world, s.x, s.y);
        const want = { mill: null, mine: new Set([TILE.ROCK, TILE.HILL]), lumber: new Set([TILE.TREE]) };
        for (const k of ['mill', 'mine', 'lumber']) {
          if (k === 'mill' && (s.farmTiles || 0) < 6) continue;
          if (k === 'mine' && !Pr.near(world, s.x, s.y, 20, want.mine)) continue;
          if (k === 'lumber' && !Pr.near(world, s.x, s.y, 18, want.lumber)) continue;
          const spot = Pr.findSpot(world, s, k, want[k]);
          if (!spot) continue;
          const K = KINDS[k];
          for (let yy = spot.y; yy < spot.y + K.h; yy++) for (let xx = spot.x; xx < spot.x + K.w; xx++) ECHO.World.setTile(world, xx, yy, TILE.GRASS);
          s.buildings.push({ id: s.id + '_' + k, type: k, x: spot.x, y: spot.y, w: K.w, h: K.h, fac: { state: 'working', hp: 100, since: world.day } });
        }
        // The town stocks, in the square.
        if (s.faction !== 'ashfang' && !s.buildings.some(b => b.type === 'stocks')) {
          let spot = null;
          for (let r = 2; r <= 5 && !spot; r++) for (let a = 0; a < 12 && !spot; a++) {
            const x = Math.round(s.x + Math.cos(a / 12 * Math.PI * 2) * r), y = Math.round(s.y + Math.sin(a / 12 * Math.PI * 2) * r);
            const t = ECHO.World.tile(world, x, y);
            if ((t === TILE.PLAZA || t === TILE.GRASS || t === TILE.ROAD) && !world.blocked[y * world.W + x] && !ECHO.World.isSolid(world, x + 0.5, y + 1.5)) spot = { x, y };
          }
          if (spot) s.buildings.push({ id: s.id + '_stocks', type: 'stocks', x: spot.x, y: spot.y, w: 1, h: 1 });
        }
        // Someone has to work them: a miller for the mill, and so on.
        const res = P().residents(world, s);
        const adults = res.filter(n => n.prof === 'farmer' && P().age(world, n) > 18 && P().age(world, n) < 55);
        if (Pr.facility(world, s, 'mill') && !res.some(n => n.prof === 'miller') && adults.length > 3) {
          const m = rng.pick(adults); m.prof = 'miller';
        }
        if (Pr.facility(world, s, 'mine') && !res.some(n => n.prof === 'miner') && adults.length > 8) {
          const m = rng.pick(adults.filter(n => n.prof === 'farmer')); if (m) m.prof = 'miner';
        }
        void region;
      }
    },

    // How well each workplace is running today: 0 = stopped, 1 = full.
    status(world, s) {
      const counts = s._counts || {};
      const st = k => {
        const f = Pr.facility(world, s, k);
        if (!f) return null;
        const workers = counts[KINDS[k].prof] || 0;
        if (f.fac.state === 'burned' || f.fac.state === 'rebuilding' || f.fac.state === 'ruined') return { f, run: 0, workers, why: f.fac.state };
        if (!workers && k === 'mill' && (counts.farmer || 0) > 0) return { f, run: 0.55, workers: 0, why: 'no miller — the farmers grind their own' };
        if (!workers) return { f, run: 0, workers, why: 'no one to work it' };
        return { f, run: (f.fac.state === 'damaged' ? 0.5 : 1) * Math.min(1, 0.6 + workers * 0.25), workers };
      };
      return { mill: st('mill'), mine: st('mine'), lumber: st('lumber') };
    },
    // Multipliers the economy applies to raw output.
    factors(world, s) {
      const st = Pr.status(world, s);
      return {
        // Without a working mill, grain is ground by hand: much less flour.
        flour: st.mill ? 0.72 + 0.36 * st.mill.run : 1,
        ore: st.mine ? 0.25 + 1.2 * st.mine.run : (ECHO.World.regionAt(world, s.x, s.y).hill > 0.06 ? 1.0 : 0.35),
        timber: st.lumber ? 0.5 + 1.0 * st.lumber.run : 1,
        st
      };
    },

    dailyTick(world, rng) {
      for (const s of world.settlements) {
        for (const b of Pr.facilities(world, s)) {
          const f = b.fac;
          // Upkeep: a workplace without timber for repairs slowly falls apart.
          if (f.state === 'working' || f.state === 'damaged') {
            if (s.stock.timber > 1) { s.stock.timber -= 0.15; f.hp = Math.min(100, f.hp + (f.state === 'damaged' ? 2 : 0.5)); if (f.state === 'damaged' && f.hp >= 80) f.state = 'working'; }
            else f.hp -= 0.6;
            if (f.hp <= 0) { f.state = 'ruined'; ECHO.Chronicle.add(world, { text: `The ${KINDS[b.type].label} of ${s.name} has fallen into ruin.`, kind: 'economy', importance: 1, sid: s.id }); }
          }
          // The reeve rebuilds what was lost, if the town can afford it.
          if (f.state === 'burned' || f.state === 'ruined') {
            const K = KINDS[b.type];
            const fac = world.factions[s.faction];
            const purse = (s.wealth || 0) + (fac && fac.type !== 'bandits' ? Math.max(0, fac.treasury) * 0.3 : 0);
            if (world.day - (f.lostDay || 0) > 4 && purse >= K.cost && s.stock.timber >= K.timber && rng.chance(0.25)) {
              s.stock.timber -= K.timber;
              if (s.wealth >= K.cost) s.wealth -= K.cost; else if (fac) fac.treasury -= K.cost;
              f.state = 'rebuilding'; f.days = rng.int(10, 18);
              ECHO.Chronicle.add(world, { text: `${s.name} has begun rebuilding its ${K.label}.`, kind: 'economy', importance: 1, sid: s.id });
            }
          } else if (f.state === 'rebuilding' && --f.days <= 0) {
            f.state = 'working'; f.hp = 100;
            ECHO.Chronicle.add(world, { text: `The new ${KINDS[b.type].label} of ${s.name} is working again.`, kind: 'economy', importance: 1, sid: s.id });
          }
        }
        // The labour market: when bread is dear and there is land to work,
        // people leave other trades for the plough.
        {
          const need = ECHO.Economy.need(world, s);
          const farmers = (s._counts || {}).farmer || 0;
          const cap = Math.max(4, (s.farmTiles || 0) / 5);
          if (farmers < cap && (s.prices.food > ECHO.GOODS.food.base * 2 || s.stock.food < need * 6) && rng.chance(0.25)) {
            const pool = P().residents(world, s).filter(n => ['hunter', 'woodcutter', 'merchant', 'wanderer', 'miner', 'herbalist', 'scholar', 'inventor'].includes(n.prof) && P().age(world, n) > 16 && P().age(world, n) < 56 && !n.sick);
            if (pool.length) {
              const n = rng.pick(pool);
              n.prof = 'farmer';
              P().remember(world, n, 'took up the plough because bread was dear', 'change', null, 1);
            }
          }
        }
        // Empty jobs get filled — slowly — by people looking for work.
        const st = Pr.status(world, s);
        for (const k of ['mill', 'mine', 'lumber']) {
          const x = st[k];
          if (!x || x.workers > 0 || x.run === 0 && x.why !== 'no one to work it') continue;
          if (!rng.chance(0.04) || s.hunger > 0.1) continue;
          // only hands the fields can spare
          const farmers = (s._counts || {}).farmer || 0;
          if (k !== 'mill' && farmers < Math.max(4, (s.farmTiles || 0) / 5) * 0.9) continue;
          const cand = P().residents(world, s).filter(n => (n.prof === 'farmer' || n.prof === 'wanderer') && P().age(world, n) > 16 && P().age(world, n) < 48);
          if (!cand.length) continue;
          const n = rng.pick(cand);
          n.prof = KINDS[k].prof;
          P().remember(world, n, `took work at the ${KINDS[k].label}`, 'change', null, 2);
          if (rng.chance(0.4)) ECHO.Chronicle.add(world, { text: `${P().name(n)} took up work at the empty ${KINDS[k].label} of ${s.name}.`, kind: 'economy', importance: 0, sid: s.id, npcs: [n.id] });
        }
      }
    },

    // Fire: by your hand, a raid, or the war.
    burn(world, s, b, byName) {
      const f = b.fac;
      if (!f || f.state === 'burned') return false;
      f.state = 'burned'; f.hp = 0; f.lostDay = world.day;
      s.unrest = Math.min(100, (s.unrest || 0) + 6);
      if (b.type === 'mill') s.stock.food *= 0.8;
      ECHO.Chronicle.add(world, { text: `The ${KINDS[b.type].label} of ${s.name} burned to the ground${byName ? ' — set alight by ' + byName : ''}.`, kind: 'economy', importance: 2, sid: s.id, x: b.x + 1, y: b.y + 1 });
      return true;
    },
    // A few words for shop and dialogue text.
    describe(world, s) {
      const st = Pr.status(world, s);
      const out = [];
      for (const k of ['mill', 'mine', 'lumber']) {
        const x = st[k];
        if (!x) continue;
        if (x.run === 0) out.push(`the ${KINDS[k].label} ${x.why === 'burned' ? 'is a burned shell' : x.why === 'rebuilding' ? 'is being rebuilt' : x.why === 'ruined' ? 'lies in ruin' : 'stands idle — ' + x.why}`);
      }
      return out;
    }
  };
})();
