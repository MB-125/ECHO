// The land, changed by hand. A tree felled leaves a stump, and in a season or two a
// sapling, and in time a tree again where it stood (unless someone has built or
// ploughed there since). A stone or a boulder broken is gone for good; the living
// rock of a mountain cut away is gone for good too, and the way through it stays.
//
// What was taken is kept in world.cut (made the first time anything is felled or
// broken, so a world nobody has touched carries nothing new): a short list, one
// entry to a tile, which moves with the map when the land grows. The collision test,
// the renderer and the map all ask Clearing.at() whether a tile's natural prop is
// still standing; a derived index answers that quickly and is made again after a
// load. Where one pair of hands takes enough from one place, the place gets a name.
(function () {
  const { U } = ECHO;
  const TT = () => ECHO.TILE;
  const h2 = (x, y, s) => ECHO.hash2(x, y, s);

  const WOOD = { tree: 1, oak: 1 }, STONE = { stone: 1, boulder: 1, crag: 1 };

  const Cl = ECHO.Clearing = {
    V: 1, WOOD, STONE,
    st(world) {
      const S = world.cut || (world.cut = { v: Cl.V, list: [], felled: 0, mined: 0, places: [] });
      if (!S.list) S.list = [];
      if (!S.places) S.places = [];
      return S;
    },
    // tile index → entry, made from the list (a derived thing: not saved, made again on load,
    // and dropped with the other caches when the land grows)
    index(world) {
      const M = new Map(), S = world.cut, W = world.W, H = world.H;
      if (S && S.list) for (const e of S.list) if (e && e.x >= 0 && e.y >= 0 && e.x < W && e.y < H) M.set(e.y * W + e.x, e);
      world._cutI = M;
      return M;
    },
    // what was taken from this tile, if anything (asked many times a frame: kept quick)
    at(world, x, y) {
      if (!world.cut || x < 0 || y < 0 || x >= world.W || y >= world.H) return null;
      const M = world._cutI || Cl.index(world);
      return M.size ? M.get(y * world.W + x) || null : null;
    },
    // On a load (or once a round world has drawn its far ground again): ground that came back as
    // it was first made is changed again as it was left.
    ensure(world) {
      const S = world.cut;
      if (!S) return 0;
      Cl.st(world);
      let n = 0;
      for (const e of S.list) {
        if (e.t == null || e.to == null) continue;
        if (e.x < 0 || e.y < 0 || e.x >= world.W || e.y >= world.H) continue;
        const i = e.y * world.W + e.x;
        if (world.tiles[i] === e.t) { world.tiles[i] = e.to; n++; }
      }
      Cl.index(world);
      if (n) world._tileEpoch = (world._tileEpoch || 0) + 1;
      return n;
    },

    // ------------------------------------------------------------ what can be taken
    // The natural thing standing on a tile that a pair of hands can take down: the same hashes
    // the collision test and the renderer place them with. Null if there is nothing, or it is
    // already gone.
    target(world, x, y) {
      if (x < 0 || y < 0 || x >= world.W || y >= world.H) return null;
      const T = TT(), i = y * world.W + x, t = world.tiles[i];
      if (t !== T.TREE && t !== T.FOREST && t !== T.GRASS && t !== T.HILL && t !== T.SNOW && t !== T.ROCK) return null;
      if (Cl.at(world, x, y)) return null;
      if (world.blocked && world.blocked[i] === 1) return null;   // (under a building, a wall, a standing stone)
      const s = world.seed, a = h2(x, y, s + 31), b = h2(x, y, s + 32), c = h2(x, y, s + 33);
      const px = x + 0.5 + (b - 0.5) * 0.5, py = y + 0.5 + (c - 0.5) * 0.5;
      const trail = world._trail ? world._trail[i] : 0, deep = world._wd ? world._wd[i] : 0;
      const So = ECHO.Solids, RAD = So ? So.RAD : { rock: 0.3 };
      const rockOn = So ? So.rockOn(world, t, y) : 0.18;
      if (t === T.TREE) { if (trail) return null; return { k: 'tree', x, y, px, py, r: deep ? 0.22 : 0.17, deep, big: !deep && b > 0.62 }; }
      if (t === T.FOREST) { if (trail || !(a < 0.22)) return null; return { k: 'oak', x, y, px, py, r: 0.15, deep }; }
      if (t === T.GRASS) { if (!(a >= 0.32 && a < 0.335)) return null; return { k: 'stone', x, y, px, py, r: RAD.rock * (0.5 + b * 0.4), s: 0.5 + b * 0.4 }; }
      if (t === T.HILL || t === T.SNOW) { if (!(a < rockOn)) return null; return { k: 'boulder', x, y, px, py, r: RAD.rock * (0.8 + b), s: 0.8 + b, snow: t === T.SNOW }; }
      if (t === T.ROCK) return { k: 'crag', x, y, px: x + 0.5, py: y + 0.5, r: 0.5 };
      return null;
    },
    // how many strokes it takes, before the craft and the tool are counted
    strokes(tg) {
      switch (tg.k) {
        case 'tree': return 8 + (tg.deep ? 4 : 0) + (tg.big ? 2 : 0);
        case 'oak': return 5 + (tg.deep ? 2 : 0);
        case 'stone': return 4;
        case 'boulder': return 6 + (tg.s > 1.4 ? 2 : 0);
        case 'crag': return 10;
      }
      return 6;
    },
    // what comes of it (the counts only; the caller puts them in a pack)
    yields(tg, o) {
      const rng = o.rng || Math.random, lv = o.lv || 1, got = {};
      const add = (k, n) => { if (n > 0) got[k] = (got[k] || 0) + n; };
      if (WOOD[tg.k]) {
        add('timber', (tg.k === 'tree' ? 2 + (tg.big ? 1 : 0) + (tg.deep ? 1 : 0) : 1) + (lv >= 5 ? 1 : 0));
        if (lv >= 7 && rng() < (tg.deep ? 0.3 : tg.big ? 0.16 : tg.k === 'tree' ? 0.07 : 0.03)) add('burl', 1);
      } else {
        const gem = lv >= 7 ? 2 : 1;
        if (tg.k === 'stone') add('ore', rng() < 0.35 ? 1 : 0);
        else if (tg.k === 'boulder') add('ore', 1 + (rng() < 0.4 ? 1 : 0) + (lv >= 5 ? 1 : 0));
        else add('ore', 2 + (rng() < 0.5 ? 1 : 0) + (lv >= 5 ? 1 : 0));
        if (tg.k !== 'stone') {
          const deep = tg.k === 'crag' ? 1 : 0.4;
          if (rng() < 0.05 * deep * gem) add('nugget', 1);
          if (rng() < 0.045 * deep * gem) add('garnet', 1);
          if (rng() < 0.018 * deep * gem) add('sapphire', 1);
        }
      }
      return got;
    },
    // what the living rock becomes once it is cut away: the ground most like it round about
    under(world, x, y) {
      const T = TT();
      let hill = 0, snow = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const t = ECHO.World.tile(world, x + dx, y + dy);
        if (t === T.SNOW) snow++; else if (t === T.HILL) hill++;
      }
      return snow > hill ? T.SNOW : T.HILL;
    },
    // how long a felled tree takes to stand again (days)
    regrowDays(world, tg) {
      const h = h2(tg.x, tg.y, world.seed + 611);
      return tg.k === 'tree' ? 48 + Math.floor(h * 40) : 30 + Math.floor(h * 24);
    },

    // ------------------------------------------------------------ taking it
    // Fell, break or cut what stands at tg. Changes the land and returns { got, entry, place }.
    // o: { lv, rng, who: { first, last } } (yours), or { town: id } (a town's woodcutters)
    take(world, tg, o = {}) {
      const T = TT(), S = Cl.st(world), day = world.day;
      const got = Cl.yields(tg, o);
      const e = { x: tg.x, y: tg.y, k: tg.k, d: day };
      if (o.who) e.p = 1;
      if (o.town != null) e.w = o.town;
      if (o.m) e.m = o.m;
      if (o.s) e.s = Math.round(o.s * 100) / 100;
      if (tg.k === 'tree') {
        e.t = T.TREE; e.to = T.GRASS; e.g = day + Cl.regrowDays(world, tg);
        ECHO.World.setTile(world, tg.x, tg.y, T.GRASS);
      } else if (tg.k === 'oak') {
        e.g = day + Cl.regrowDays(world, tg);
      } else if (tg.k === 'crag') {
        e.t = T.ROCK; e.to = Cl.under(world, tg.x, tg.y);
        ECHO.World.setTile(world, tg.x, tg.y, e.to);
      }
      S.list.push(e);
      (world._cutI || Cl.index(world)).set(tg.y * world.W + tg.x, e);
      if (o.who) { if (WOOD[tg.k]) S.felled = (S.felled || 0) + 1; else S.mined = (S.mined || 0) + 1; }
      Cl.changed(world, [{ x0: tg.x, y0: tg.y, x1: tg.x + 1, y1: tg.y + 1 }], tg.k === 'crag');
      const place = Cl.name(world, e, o.who);
      return { got, entry: e, place };
    },
    // The land changed in these rectangles: the caches that read it are told where.
    changed(world, rects, heights) {
      if (!rects.length) return;
      world._tileEpoch = (world._tileEpoch || 0) + 1;
      const pad = rects.map(r => ({ x0: r.x0 - 1, y0: r.y0 - 1, x1: r.x1 + 1, y1: r.y1 + 1 }));
      world._tileLog = (world._tileLog || []).concat([{ e: world._tileEpoch, rects: pad }]).slice(-64);
      world._mapDirty = (Array.isArray(world._mapDirty) ? world._mapDirty : []).concat(pad);
      const R3 = ECHO.Renderer3D;
      if (heights && R3 && R3.hc && R3.world === world && R3.buildHeights) for (const r of pad) R3.buildHeights(world, r);
    },
    // A place many trees (or much stone) came out of is known by the name of whoever did it.
    name(world, e, who) {
      const S = Cl.st(world), fam = WOOD[e.k] ? 'wood' : 'stone';
      if (!who || !who.last) return null;
      const R = 7, R2 = R * R;
      if (S.places.some(p => p.f === fam && (p.x - e.x) ** 2 + (p.y - e.y) ** 2 < 144)) return null;
      let n = 0, crag = 0;
      for (const q of S.list) {
        if (!q.p || (WOOD[q.k] ? 'wood' : 'stone') !== fam || (q.x - e.x) ** 2 + (q.y - e.y) ** 2 > R2) continue;
        n++; if (q.k === 'crag') crag++;
      }
      if (n < 12) return null;
      const kind = fam === 'wood' ? 'Clearing' : crag * 2 >= n ? 'Cut' : 'Quarry';
      const p = { x: e.x, y: e.y, f: fam, name: `${who.last}'s ${kind}`, d: world.day, by: `${who.first} ${who.last}` };
      S.places.push(p);
      const town = ECHO.World.nearestSettlement && ECHO.World.nearestSettlement(world, e.x, e.y);
      const near = town && U.dist(town.x, town.y, e.x, e.y) < 40 ? ` near ${town.name}` : '';
      const did = fam === 'wood' ? `felled so many trees${near} that the place is a clearing now` : kind === 'Cut' ? `cut a way into the rock${near}` : `broke so much stone${near} that the place is a quarry now`;
      if (ECHO.Chronicle) ECHO.Chronicle.add(world, { text: `${p.by} ${did}. Folk call it ${p.name}.`, kind: 'deed', importance: 1, x: e.x, y: e.y });
      if (ECHO.Renown && world.player) ECHO.Renown.add(world, 'reliable', 1, `${p.name}`);
      return p;
    },
    placeAt(world, x, y, r = 9) {
      const S = world.cut;
      if (!S || !S.places) return null;
      return S.places.find(p => (p.x - x) ** 2 + (p.y - y) ** 2 < r * r) || null;
    },

    // ------------------------------------------------------------ growing back
    // How far a felled tree has come back: 0 just felled .. 1 a tree again.
    grown(world, e) {
      if (!e.g) return 0;
      return U.clamp((world.day - e.d) / Math.max(1, e.g - e.d), 0, 1);
    },
    dailyTick(world) {
      Cl.woodcutters(world);
      const S = world.cut;
      if (!S || !S.list || !S.list.length) return 0;
      const T = TT(), day = world.day, keep = [], rects = [];
      let n = 0;
      for (const e of S.list) {
        if (!e.g || day < e.g) { keep.push(e); continue; }
        const i = e.y * world.W + e.x, t = world.tiles[i];
        if (e.k === 'tree') {
          // only if the ground is as it was left: nobody has built, ploughed or paved it since
          const clear = t === e.to && !(world.blocked && world.blocked[i] === 1) && !(world._trail && world._trail[i]) && !Cl.standing(world, e.x, e.y);
          if (clear) { world.tiles[i] = T.TREE; n++; }
        } else if (e.k === 'oak' && t === T.FOREST) n++;
        rects.push({ x0: e.x, y0: e.y, x1: e.x + 1, y1: e.y + 1 });
      }
      if (rects.length) {
        S.list = keep;
        Cl.index(world);
        Cl.changed(world, rects, false);
      }
      return n;
    },
    // The woodcutters of a town with a working lumber camp fell a tree most days in the woods
    // round it: stumps and saplings ring every lumber camp, and the woods come back about as
    // fast as they are cut (they stop when a ring of stumps is all round them).
    woodcutters(world) {
      const Pr = ECHO.Production;
      if (!Pr || !Pr.facility || !world.settlements) return 0;
      let n = 0;
      for (const s of world.settlements) {
        const f = Pr.facility(world, s, 'lumber');
        if (!f || !f.fac || (f.fac.state !== 'working' && f.fac.state !== 'damaged')) continue;
        const rng = new ECHO.RNG(ECHO.hashStr('fell:' + world.seed + ':' + world.day + ':' + s.id));
        if (rng.next() < 0.4) continue;
        const cx = f.x + (f.w || 2) / 2, cy = f.y + (f.h || 2) / 2, S = world.cut;
        let stumps = 0;
        if (S && S.list) for (const e of S.list) if (e.w === s.id) stumps++;
        if (stumps >= 22) continue;
        for (let k = 0; k < 24; k++) {
          const a = rng.next() * 6.2832, r = 3 + rng.next() * 13, x = Math.floor(cx + Math.cos(a) * r), y = Math.floor(cy + Math.sin(a) * r);
          const tg = Cl.target(world, x, y);
          if (!tg || !WOOD[tg.k] || tg.deep) continue;
          Cl.take(world, tg, { rng: () => rng.next(), town: s.id });
          n++;
          break;
        }
      }
      return n;
    },
    // something built stands on this tile (a structure, a camp, your homestead)
    standing(world, x, y) {
      for (const st of world.structures || []) if (Math.floor(st.x) <= x && x < Math.floor(st.x) + (st.w || 1) && Math.floor(st.y) <= y && y < Math.floor(st.y) + (st.h || 1)) return true;
      const pl = world.player, sd = pl && pl.stead;
      if (sd && Math.abs(sd.x - x - 0.5) < 6 && Math.abs(sd.y - y - 0.5) < 6) return true;
      return false;
    }
  };
})();
