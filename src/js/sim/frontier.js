// The land goes on. When you reach the far shore of the old island, or walk
// near the edge of any land found since, the map grows another band of
// country on that side: its own hills, forests, lakes and rivers, regions
// with names, villages full of people with families and trades, roads back
// to the old towns, a great beast in its lair, ruins, delves and deep
// dungeons, wonders to chart, caches, rare herbs, caves, wrecks, stone
// circles and hermits. The old world keeps living alongside it.
//
// Growing west or north moves everything already on the map, so the world is
// re-read afterwards exactly as if it had just been loaded from a save.
(function () {
  const { U, RNG, makeNoise, hash2 } = ECHO;
  const TT = () => ECHO.TILE;
  const Wd = () => ECHO.World;

  const BAND = { h: 80, v: 76 };          // tiles added east/west, north/south (multiples of 4: the fog grid)
  const MAX = 1200;                        // the world stops growing at this many tiles a side
  const SIDES = { e: 'east', w: 'west', n: 'north', s: 'south' };
  const NOT_COORDS = new Set(['tiles', 'blocked', 'regions', 'wind', 'dir', 'vel', 'look', 'offset', 'colors']);

  const Fr = ECHO.Frontier = {
    BAND, MAX, SIDES,
    state(world) {
      return world.frontier || (world.frontier = { W0: world.W, H0: world.H, ox: 0, oy: 0, sides: { e: 0, w: 0, n: 0, s: 0 }, n: 0, lands: [] });
    },
    canGrow(world, side) {
      return side === 'e' || side === 'w' ? world.W + BAND.h <= MAX : world.H + BAND.v <= MAX;
    },

    // ------------------------------------------------------------ growing the map
    // side: 'e' | 'w' | 'n' | 's'. opts.from: where the traveller stands (before the move).
    expand(world, side, opts = {}) {
      if (!SIDES[side] || !Fr.canGrow(world, side)) return null;
      // whatever the old world places lazily is placed now, over the old land only
      if (ECHO.Explore) ECHO.Explore.sites(world);
      if (ECHO.Secrets && ECHO.Secrets.ensure) ECHO.Secrets.ensure(world);
      const F = Fr.state(world);
      const rng = new RNG(ECHO.hashStr('frontier:' + world.seed + ':' + side + ':' + F.n));
      const first = !F.sides[side];
      const dx = side === 'w' ? BAND.h : 0, dy = side === 'n' ? BAND.v : 0;
      const W0 = world.W, H0 = world.H;
      const W1 = W0 + (side === 'e' || side === 'w' ? BAND.h : 0), H1 = H0 + (side === 'n' || side === 's' ? BAND.v : 0);
      // 1. derived caches go: everything is rebuilt as after a load
      for (const k of Object.keys(world)) if (k[0] === '_' && world[k] && typeof world[k] === 'object') delete world[k];
      // 2. what is indexed by tile
      const remap = i => { const x = i % W0, y = (i / W0) | 0; return (y + dy) * W1 + x + dx; };
      for (const r of world.roads) if (Array.isArray(r.path)) r.path = r.path.map(remap);
      for (const j of world.journeys || []) if (Array.isArray(j.path) && typeof j.path[0] === 'number') j.path = j.path.map(remap);
      const ocw = Math.ceil(W0 / 4), och = Math.ceil(H0 / 4), ncw = Math.ceil(W1 / 4), nch = Math.ceil(H1 / 4);
      const regrid = a => {
        if (!Array.isArray(a) || a.length !== ocw * och) return a;
        const out = new Array(ncw * nch).fill(0);
        for (let cy = 0; cy < och; cy++) for (let cx = 0; cx < ocw; cx++) if (a[cy * ocw + cx]) out[(cy + dy / 4) * ncw + cx + dx / 4] = a[cy * ocw + cx];
        return out;
      };
      if (world.player) world.player.explored = regrid(world.player.explored);
      for (const c of world.characters || []) if (c && typeof c === 'object' && c.explored) c.explored = regrid(c.explored);
      const tiles = new Uint8Array(W1 * H1);          // all deep water until made
      for (let y = 0; y < H0; y++) tiles.set(world.tiles.subarray(y * W0, (y + 1) * W0), (y + dy) * W1 + dx);
      // 3. everything with a place on the map moves with it
      if (dx || dy) {
        Fr.shift(world, dx, dy);
        for (const r of world.regions) { r.x0 += dx; r.x1 += dx; r.y0 += dy; r.y1 += dy; }
      }
      world.W = W1; world.H = H1; world.tiles = tiles;
      F.ox += dx; F.oy += dy;
      Wd().rebuildBlocked(world);
      const R = side === 'e' ? { x0: W0, y0: 0, x1: W1, y1: H1 } : side === 'w' ? { x0: 0, y0: 0, x1: BAND.h, y1: H1 } : side === 'n' ? { x0: 0, y0: 0, x1: W1, y1: BAND.v } : { x0: 0, y0: H0, x1: W1, y1: H1 };
      // 4. the land itself
      Fr.terrain(world, R, rng);
      if (first) Fr.blend(world, side);
      Fr.rivers(world, R, rng);
      const bar = first && opts.from ? Fr.causeway(world, side, R, { x: opts.from.x + dx, y: opts.from.y + dy }) : 0;
      Wd().rebuildBlocked(world);
      // 5. who and what lives there
      const regions = Fr.regions(world, R, side, rng);
      const towns = Fr.towns(world, R, rng);
      Fr.wilds(world, R, towns, regions, rng);
      for (const r of regions) if (ECHO.Ecology && ECHO.Ecology.initRegion) ECHO.Ecology.initRegion(world, r, rng);
      Wd().rebuildBlocked(world);
      world._tileEpoch = (world._tileEpoch || 0) + 1;
      F.sides[side]++; F.n++;
      const land = { n: F.n, side, day: world.day, regions: regions.map(r => r.id), towns: towns.map(t => t.id) };
      F.lands.push(land);
      if (ECHO.Chronicle) {
        const c = towns[0] || { x: (R.x0 + R.x1) / 2, y: (R.y0 + R.y1) / 2 };
        ECHO.Chronicle.add(world, { text: `Travellers brought word of country past the ${first ? 'old shore' : 'last known land'} to the ${SIDES[side]}: ${regions.slice(0, 3).map(r => r.name).join(', ')}${towns.length ? `, and the villages of ${towns.map(t => t.name).join(', ')}` : ''}.`, kind: 'era', importance: 2, x: c.x, y: c.y });
      }
      if (ECHO.Realm && ECHO.Realm.reshaped) ECHO.Realm.reshaped(world);
      return { side, first, bar, dx, dy, regions: regions.map(r => r.name), towns: towns.map(t => t.name), land };
    },

    // Move every map position in the world by (dx, dy).
    shift(world, dx, dy) {
      const seen = new Set();
      const walk = (o, depth) => {
        if (!o || typeof o !== 'object' || depth > 16 || seen.has(o) || ArrayBuffer.isView(o)) return;
        seen.add(o);
        if (Array.isArray(o)) { for (const v of o) if (v && typeof v === 'object') walk(v, depth + 1); return; }
        if (typeof o.x === 'number' && typeof o.y === 'number' && o.x < 9000 && o.y < 9000) { o.x += dx; o.y += dy; }
        for (const [a, b] of [['tx', 'ty'], ['sx', 'sy'], ['cx', 'cy']]) if (typeof o[a] === 'number' && typeof o[b] === 'number' && o[a] < 9000) { o[a] += dx; o[b] += dy; }
        for (const k of Object.keys(o)) { const v = o[k]; if (v && typeof v === 'object' && !NOT_COORDS.has(k)) walk(v, depth + 1); }
      };
      for (const k of Object.keys(world)) if (!NOT_COORDS.has(k) && k[0] !== '_') walk(world[k], 0);
    },

    // ------------------------------------------------------------ terrain
    // New land carries on the old noise without the island's falloff, so the
    // bands meet each other seamlessly; the north grows colder and the south drier.
    noise(world) {
      if (!Fr._nz || Fr._nz.seed !== world.seed) Fr._nz = { seed: world.seed, el: makeNoise(world.seed), mo: makeNoise(world.seed ^ 0x9e3779b9), cl: makeNoise((world.seed ^ 0x51c0) >>> 0) };
      return Fr._nz;
    },
    elevInf(world, xo, yo) {
      const G = Wd().gen(world), nz = Fr.noise(world);
      const a = (G.hill - 0.31) / 0.388, b = 0.31 - 0.432 * a;
      return a * (nz.el(xo / G.freq, yo / G.freq) * 1.25 + 0.02) + b;
    },
    elevOld(world, xo, yo) {
      const G = Wd().gen(world), F = world.frontier, nz = Fr.noise(world);
      const nx = xo / F.W0 - 0.5, ny = yo / F.H0 - 0.5;
      const d = Math.sqrt(nx * nx * 1.1 + ny * ny * 1.4) * 2;
      return nz.el(xo / G.freq, yo / G.freq) * 1.25 - Math.pow(d, 2.4) * (0.62 - G.land * 3) + 0.02 - G.land * 0.25;
    },
    classify(world, e, xo, yo) {
      const T = TT(), G = Wd().gen(world), F = world.frontier, nz = Fr.noise(world);
      const m = nz.mo(xo / 38 + 50, yo / 38 + 50);
      let t;
      if (e < 0.25) t = T.DEEP;
      else if (e < 0.31) t = T.WATER;
      else if (e < 0.335) t = T.SAND;
      else if (e > G.rock) t = T.ROCK;
      else if (e > G.hill) t = yo < F.H0 * 0.24 ? T.SNOW : T.HILL;
      else if (m > 0.6 && e < 0.42) t = T.SWAMP;
      else if (m > 0.52) t = hash2(xo, yo, world.seed) < 0.42 ? T.TREE : T.FOREST;
      else t = T.GRASS;
      const north = -yo / F.H0, south = yo / F.H0 - 1;
      if (north > 0.08 && t !== T.DEEP && t !== T.WATER && t !== T.ROCK) {
        // snowfields come in drifts, thicker the further north
        const k = U.clamp((north - 0.08) * 1.6, 0, 0.85);
        if (t === T.HILL || (t !== T.TREE && nz.cl(xo / 17, yo / 17) < 0.2 + k * 0.6)) t = T.SNOW;
      }
      if (south > 0.1 && t === T.GRASS && m < 0.47 && nz.cl(xo / 21 + 40, yo / 21 + 40) < 0.2 + U.clamp((south - 0.1) * 2, 0, 0.75) * 0.6) t = T.SAND;
      return t;
    },
    terrain(world, R, rng) {
      const F = world.frontier, W = world.W;
      for (let y = R.y0; y < R.y1; y++) for (let x = R.x0; x < R.x1; x++) {
        const xo = x - F.ox, yo = y - F.oy;
        world.tiles[y * W + x] = Fr.classify(world, Fr.elevInf(world, xo, yo), xo, yo);
      }
      void rng;
    },
    // The old island's sea, on the side that grew, shallows into the new coast.
    blend(world, side) {
      const T = TT(), F = world.frontier, W = world.W, M = 64;
      const x0 = F.ox, y0 = F.oy, x1 = F.ox + F.W0, y1 = F.oy + F.H0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const d = side === 'e' ? x1 - 1 - x : side === 'w' ? x - x0 : side === 'n' ? y - y0 : y1 - 1 - y;
        if (d >= M) continue;
        const i = y * W + x, t = world.tiles[i];
        if (t !== T.DEEP && t !== T.WATER) continue;
        const xo = x - F.ox, yo = y - F.oy;
        const eo = Fr.elevOld(world, xo, yo);
        if (t === T.WATER && eo >= 0.31) continue;          // a river or a lake, not the sea
        const k = 1 - d / M, w = k * k * (3 - 2 * k);
        const e = eo + (Fr.elevInf(world, xo, yo) - eo) * w;
        if (e < 0.25) continue;
        world.tiles[i] = e < 0.31 ? T.WATER : Fr.classify(world, e, xo, yo);
      }
    },
    rivers(world, R, rng) {
      const T = TT(), W = world.W, F = world.frontier;
      const n = Math.max(1, Math.round((R.x1 - R.x0) * (R.y1 - R.y0) / 9000));
      const inR = (x, y) => x >= R.x0 + 1 && y >= R.y0 + 1 && x < R.x1 - 1 && y < R.y1 - 1;
      const E = (x, y) => Fr.elevInf(world, x - F.ox, y - F.oy);
      const sources = [];
      for (let i = 0; i < 600 && sources.length < n; i++) {
        const x = rng.int(R.x0 + 6, R.x1 - 7), y = rng.int(R.y0 + 6, R.y1 - 7);
        const t = world.tiles[y * W + x];
        if (E(x, y) > 0.56 && t !== T.ROCK && sources.every(s => U.dist(s[0], s[1], x, y) > 30)) sources.push([x, y]);
      }
      for (const [sx, sy] of sources) {
        let x = sx, y = sy;
        const seen = new Set();
        let wet = false, steps = 0;
        for (; steps < 260; steps++) {
          const i = y * W + x;
          if (seen.has(i)) break;
          seen.add(i);
          const t = world.tiles[i];
          if ((t === T.WATER || t === T.DEEP) && steps > 3) { wet = true; break; }
          if (steps > 2 && t !== T.ROCK) world.tiles[i] = T.WATER;
          let best = null, be = Infinity;
          for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + ddx, ny = y + ddy;
            if (!inR(nx, ny) || seen.has(ny * W + nx)) continue;
            const ee = E(nx, ny) + rng.next() * 0.02;
            if (ee < be) { be = ee; best = [nx, ny]; }
          }
          if (!best) break;
          [x, y] = best;
        }
        // a river that finds no sea ends in a mere
        if (!wet && steps > 16) for (let ddy = -2; ddy <= 2; ddy++) for (let ddx = -3; ddx <= 3; ddx++) {
          if (ddx * ddx / 9 + ddy * ddy / 4 > 1.05 || !inR(x + ddx, y + ddy)) continue;
          world.tiles[(y + ddy) * W + x + ddx] = Math.abs(ddx) + Math.abs(ddy) <= 1 ? T.DEEP : T.WATER;
        }
      }
    },
    // A sandbar across the strait, from where you stand to the new land.
    causeway(world, side, R, from) {
      const T = TT(), W = world.W;
      const land = (x, y) => { const t = Wd().tile(world, x, y); return t !== T.DEEP && t !== T.WATER && t !== T.ROCK; };
      let sx = Math.floor(from.x), sy = Math.floor(from.y);
      if (!land(sx, sy)) {
        let best = null, bd = Infinity;
        for (let r = 1; r < 40 && !best; r++) for (let ddy = -r; ddy <= r; ddy++) for (let ddx = -r; ddx <= r; ddx++) {
          if (Math.max(Math.abs(ddx), Math.abs(ddy)) !== r || !land(sx + ddx, sy + ddy)) continue;
          const d = ddx * ddx + ddy * ddy; if (d < bd) { bd = d; best = [sx + ddx, sy + ddy]; }
        }
        if (best) [sx, sy] = best;
      }
      // aim for solid ground well inside the new band, level with the traveller
      const along = side === 'e' || side === 'w';
      const deep = side === 'e' ? R.x0 + 14 : side === 'w' ? R.x1 - 15 : side === 'n' ? R.y1 - 15 : R.y0 + 14;
      let tx = along ? deep : U.clamp(sx, R.x0 + 8, R.x1 - 9), ty = along ? U.clamp(sy, R.y0 + 8, R.y1 - 9) : deep;
      for (let r = 0; r < 30 && !land(tx, ty); r++) { if (along) ty += (r % 2 ? r : -r); else tx += (r % 2 ? r : -r); }
      if (!land(tx, ty)) return 0;
      const cost = (x, y, i) => { const t = world.tiles[i]; return t === T.DEEP ? 3.2 : t === T.WATER ? 2.4 : t === T.ROCK ? 6 : t === T.TREE ? 1.4 : 1; };
      const path = Wd().findPath(world, sx, sy, tx, ty, cost, 900000);
      if (!path) return 0;
      let made = 0;
      for (const i of path) {
        const x = i % W, y = (i / W) | 0;
        for (const [ddx, ddy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const j = (y + ddy) * W + x + ddx, t = world.tiles[j];
          if (t === T.DEEP || t === T.WATER) { world.tiles[j] = ddx || ddy ? T.SAND : (made % 7 === 3 ? T.GRASS : T.SAND); made++; }
          else if (t === T.ROCK && !ddx && !ddy) world.tiles[j] = T.HILL;
        }
      }
      return made;
    },

    // ------------------------------------------------------------ regions
    regions(world, R, side, rng) {
      const T = TT();
      const along = side === 'e' || side === 'w';
      const bw = R.x1 - R.x0, bh = R.y1 - R.y0;
      const cols = along ? 2 : Math.max(1, Math.round(bw / 40)), rows = along ? Math.max(1, Math.round(bh / 38)) : 2;
      const cw = bw / cols, ch = bh / rows;
      const used = new Set(world.regions.map(r => r.name));
      const out = [];
      for (let ry = 0; ry < rows; ry++) for (let rx = 0; rx < cols; rx++) {
        const x0 = R.x0 + rx * cw, y0 = R.y0 + ry * ch, x1 = x0 + cw, y1 = y0 + ch;
        let land = 0, forest = 0, farm = 0, hill = 0, swamp = 0, n = 0;
        for (let y = Math.floor(y0); y < Math.floor(y1); y += 2) for (let x = Math.floor(x0); x < Math.floor(x1); x += 2) {
          const t = Wd().tile(world, x, y); n++;
          if (t !== T.WATER && t !== T.DEEP) land++;
          if (t === T.FOREST || t === T.TREE) forest++;
          if (t === T.FARM) farm++;
          if (t === T.HILL || t === T.ROCK || t === T.SNOW) hill++;
          if (t === T.SWAMP) swamp++;
        }
        const r = {
          id: world.regions.length, name: ECHO.makeRegionName(rng, used), x0, y0, x1, y1,
          land: land / Math.max(1, n), forest: forest / Math.max(1, land), farm: farm / Math.max(1, land), hill: hill / Math.max(1, land), swamp: swamp / Math.max(1, land),
          apex: null, eco: null, history: [], breed: 1, frontier: world.frontier.n + 1
        };
        used.add(r.name);
        world.regions.push(r); out.push(r);
      }
      delete world._rgrid; delete world._rnb;
      return out;
    },

    // ------------------------------------------------------------ villages
    towns(world, R, rng) {
      const T = TT();
      let landN = 0;
      for (let y = R.y0; y < R.y1; y += 2) for (let x = R.x0; x < R.x1; x += 2) { const t = world.tiles[y * world.W + x]; if (t !== T.DEEP && t !== T.WATER && t !== T.ROCK) landN++; }
      const want = U.clamp(Math.round(landN * 4 / 5200), 1, 5);
      const cands = [];
      for (let i = 0; i < 900; i++) {
        const x = rng.int(R.x0 + 13, R.x1 - 14), y = rng.int(R.y0 + 13, R.y1 - 14);
        const t = Wd().tile(world, x, y);
        if (t !== T.GRASS && t !== T.FOREST) continue;
        const sc = Wd().siteScore(world, x, y);
        if (sc > 95) cands.push({ x, y, sc: sc + rng.next() * 30 });
      }
      cands.sort((a, b) => b.sc - a.sc);
      const sites = [];
      for (const c of cands) {
        if (sites.length >= want) break;
        if (world.settlements.some(s => U.dist(s.x, s.y, c.x, c.y) < 26) || sites.some(s => U.dist(s.x, s.y, c.x, c.y) < 26)) continue;
        sites.push(c);
      }
      if (!sites.length) return [];
      const F = world.frontier;
      const used = new Set(world.settlements.map(s => s.name));
      const kingdoms = Object.values(world.factions).filter(f => f.type === 'kingdom' && !f.fallen && f.capital);
      const old = world.settlements.slice();
      const made = [], pops = [];
      sites.forEach((c, i) => {
        const caps = kingdoms.map(f => ({ f, s: ECHO.Sim.settlement(world, f.capital) })).filter(o => o.s).sort((a, b) => U.dist(a.s.x, a.s.y, c.x, c.y) - U.dist(b.s.x, b.s.y, c.x, c.y));
        const fac = caps.length ? caps[0].f.id : 'valdren';
        const s = {
          id: 'sf' + F.n + '_' + i, name: ECHO.makePlaceName(rng, used), x: c.x, y: c.y, kind: 'village', faction: fac, founder: fac, founded: world.day - rng.int(400, 4000),
          buildings: [], farmTiles: 0, stock: { food: 70, ore: 8, arms: 6, herbs: 6, timber: 40 }, prices: {}, priceHistory: [], unrest: 5, prosperity: 45, hunger: 0, garrison: 0,
          residents: [], events: [], knownRumors: [], lastFamineDay: -999, ruler: null, statueOf: [], prison: [], wealth: 100, techLook: 0, works: {}, frontier: F.n + 1
        };
        used.add(s.name);
        world.settlements.push(s);
        const pop = rng.int(22, 30);
        Wd().layoutSettlement(world, s, rng, pop);
        made.push(s); pops.push(pop);
      });
      Wd().rebuildBlocked(world);
      // their people: families, trades, an innkeeper and a smith — made as the first towns were
      const all = world.settlements;
      world.settlements = made;
      try {
        ECHO.People.populate(world, rng, pops);
        if (ECHO.Economy) ECHO.Economy.init(world, rng);
      } finally { world.settlements = all; delete world._sById; }
      for (const s of made) {
        const res = ECHO.People.residents(world, s).filter(n => n.status === 'alive' && ECHO.People.age(world, n) > 25 && n.prof !== 'child');
        const reeve = res.sort((a, b) => (b.renown + b.wealth * 0.1) - (a.renown + a.wealth * 0.1))[0];
        if (reeve) { s.ruler = reeve.id; reeve.title = 'Reeve'; }
        if (ECHO.Production) ECHO.Production.ensureTown(world, s, rng);
      }
      // roads home: each new village to the nearest place already on the roads
      const joined = old.filter(s => s.faction !== 'ashfang');
      for (const s of made) {
        const to = joined.slice().sort((a, b) => U.dist(a.x, a.y, s.x, s.y) - U.dist(b.x, b.y, s.x, s.y))[0];
        if (to) Wd().connectRoad(world, to, s, 900000);
        joined.push(s);
      }
      world._graph = null; world._routes = {};
      return made;
    },

    // ------------------------------------------------------------ the wild places
    wilds(world, R, towns, regions, rng) {
      const T = TT(), Wo = Wd();
      const area = (R.x1 - R.x0) * (R.y1 - R.y0), k = area / 12000;
      const n = base => { const f = base * k; return Math.floor(f) + (rng.next() < f - Math.floor(f) ? 1 : 0); };
      const STAND = [T.GRASS, T.FOREST, T.HILL, T.SAND, T.SNOW, T.SWAMP];
      const sites = world.sites || (world.sites = []);
      const near = (x, y, r, set) => { let c = 0; for (let ddy = -r; ddy <= r; ddy++) for (let ddx = -r; ddx <= r; ddx++) if (set.includes(Wo.tile(world, x + ddx, y + ddy))) c++; return c; };
      const clear = (x, y, d) => world.settlements.every(s => U.dist(s.x, s.y, x, y) > d) && world.lairs.every(l => U.dist(l.x, l.y, x, y) > 12) && world.ruins.every(r => U.dist(r.x, r.y, x, y) > 10) && sites.every(o => U.dist(o.x, o.y, x, y) > 13) && world.camps.every(c => U.dist(c.x, c.y, x, y) > 9);
      const spot = (d, score, tries = 700, margin = 8) => {
        let best = null, bs = -Infinity;
        for (let i = 0; i < tries; i++) {
          const x = rng.int(R.x0 + margin, R.x1 - margin - 1), y = rng.int(R.y0 + margin, R.y1 - margin - 1);
          if (!STAND.includes(Wo.tile(world, x, y)) || Wo.isSolid(world, x + 0.5, y + 0.5) || !clear(x, y, d)) continue;
          const sc = rng.next() * 2 + (score ? score(x, y) : 0);
          if (sc > bs) { bs = sc; best = { x, y }; }
        }
        return best;
      };
      const room = p => { for (let ddy = -1; ddy <= 1; ddy++) for (let ddx = -1; ddx <= 1; ddx++) if (Wo.tile(world, p.x + ddx, p.y + ddy) === T.TREE) Wo.setTile(world, p.x + ddx, p.y + ddy, T.FOREST); };
      const regionName = p => { const r = Wo.regionAt(world, p.x, p.y); return r ? r.name : 'the wilds'; };
      const usedNames = new Set(sites.map(s => s.name));
      const nameFor = (def, p) => {
        let nm = (def.names || []).find(x => !usedNames.has(x));
        if (!nm) nm = `the ${def.label.toLowerCase()} of ${regionName(p)}`;
        usedNames.add(nm); return nm;
      };
      // a great beast, near the first new village
      const v = towns[0];
      if (v && world.lairs.length < 40) {
        let lp = null;
        for (let i = 0; i < 700 && !lp; i++) {
          const a = rng.next() * Math.PI * 2, d = rng.range(17, 32);
          const x = Math.round(v.x + Math.cos(a) * d), y = Math.round(v.y + Math.sin(a) * d);
          if (x < R.x0 + 9 || y < R.y0 + 9 || x > R.x1 - 10 || y > R.y1 - 10) continue;
          if (world.settlements.some(s => U.dist(s.x, s.y, x, y) < 16) || world.lairs.some(l => U.dist(l.x, l.y, x, y) < 24)) continue;
          let wet = 0;
          for (let ddy = -5; ddy <= 5; ddy++) for (let ddx = -5; ddx <= 5; ddx++) { const t = Wo.tile(world, x + ddx, y + ddy); if (t === T.WATER || t === T.DEEP || t === T.ROAD || t === T.PLAZA) wet++; }
          if (!wet && STAND.includes(Wo.tile(world, x, y))) lp = { x, y };
        }
        if (lp) {
          for (let ddy = -7; ddy <= 7; ddy++) for (let ddx = -7; ddx <= 7; ddx++) {
            if (ddx * ddx + ddy * ddy > 49) continue;
            const t = Wo.tile(world, lp.x + ddx, lp.y + ddy);
            if (t !== T.WATER && t !== T.DEEP && t !== T.ROAD && t !== T.BRIDGE) Wo.setTile(world, lp.x + ddx, lp.y + ddy, T.RUIN);
          }
          const rocks = [];
          for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + rng.next() * 0.4; rocks.push({ x: lp.x + Math.round(Math.cos(a) * 4.2), y: lp.y + Math.round(Math.sin(a) * 4.2), hp: 60 }); }
          const AK = Wo.APEX_KINDS, ak = AK[world.lairs.length % AK.length];
          const region = Wo.regionAt(world, lp.x, lp.y);
          const hp = 420 + world.lairs.length * 60 + world.frontier.n * 40;
          const lair = {
            id: 'lair' + world.lairs.length, x: lp.x, y: lp.y, rocks, regionId: region.id, villageId: v.id,
            boss: {
              id: 'boss' + world.lairs.length, name: rng.pick(ak.base.filter(b => !world.lairs.some(l => l.boss.name === b)).concat(ak.base).slice(0, 4)), title: ak.title, kind: ak.kind,
              maxHp: hp, hp, alive: true, fled: false, absentUntil: -1, armor: { melee: 0, ranged: 0, fire: 0 }, scars: [],
              memory: { encounters: 0, dodge: { left: 0, right: 0, back: 0 }, blocks: 0, attacksSeen: 0, rangedTime: 0, meleeTime: 0, damageBy: { melee: 0, ranged: 0, fire: 0 }, knownFoes: {} },
              kills: 0, bornDay: world.day - rng.int(300, 2000)
            }
          };
          region.apex = lair.id;
          world.lairs.push(lair);
          if (ECHO.Ecology && ECHO.Ecology.huntRegions) for (const rid of ECHO.Ecology.huntRegions(world, lair)) {
            const lr = world.regions[rid]; if (!lr) continue;
            lr.breed = 2.6;
            for (const nb of Wo.regionNeighbors(world, lr)) nb.breed = Math.max(nb.breed || 1, 1.35);
          }
        }
      }
      // ruins of whoever lived here before
      const RN = ['Vault', 'Barrow', 'Spire', 'Undercroft', 'Sanctum', 'Cairn', 'Observatory'];
      for (let r = 0, want = Math.max(1, n(1.4)); r < want; r++) {
        const p = spot(22, null, 500, 13);
        if (!p) continue;
        for (let ddy = -4; ddy <= 4; ddy++) for (let ddx = -5; ddx <= 5; ddx++) {
          const edge = Math.abs(ddx) === 5 || Math.abs(ddy) === 4;
          const tt = Wo.tile(world, p.x + ddx, p.y + ddy);
          if (tt === T.WATER || tt === T.DEEP) continue;
          if (edge && hash2(p.x + ddx, p.y + ddy, world.seed + 3) < 0.55 && !(ddy === 4 && Math.abs(ddx) <= 1)) Wo.setTile(world, p.x + ddx, p.y + ddy, T.RUINWALL);
          else Wo.setTile(world, p.x + ddx, p.y + ddy, T.RUIN);
        }
        const used = new Set(world.ruins.map(x => x.name));
        let nm = null;
        for (let t = 0; t < 12 && (!nm || used.has(nm)); t++) nm = 'the ' + rng.pick(['Sunken', 'Silent', 'First', 'Shattered', 'Drowned', 'Hollow', 'Starless', 'Forgotten', 'Outer', 'Farther', 'Last']) + ' ' + rng.pick(RN);
        if (used.has(nm)) nm += ' of ' + regionName(p);
        world.ruins.push({ id: 'ruin' + world.ruins.length, name: nm, x: p.x, y: p.y, tablet: null, relics: [], visited: false, studied: 0 });
      }
      Wo.rebuildBlocked(world);
      const X = ECHO.Explore;
      if (X) {
        const pick = (keys, c) => rng.shuffle(keys.slice()).slice(0, c);
        // landmarks and delves
        for (const kind of pick(Object.keys(X.LANDMARKS).filter(k => k !== 'wreck'), Math.max(2, n(3.2)))) {
          const p = spot(14, kind === 'lookout' ? (x, y) => near(x, y, 3, [T.HILL, T.ROCK, T.SNOW]) * 0.3 : kind === 'oak' ? (x, y) => near(x, y, 3, [T.TREE, T.FOREST]) * 0.2 : null);
          if (!p) continue;
          room(p);
          sites.push({ id: 'site' + sites.length, cat: 'landmark', kind, name: nameFor(X.LANDMARKS[kind], p), x: p.x + 0.5, y: p.y + 0.5, found: false, cleared: false, used: {} });
        }
        const delves = pick(['barrow', 'cave', 'hideout', 'crypt'], Math.max(1, n(2.4))).concat(pick(X.DUNGEONS.map(d => d[0]), Math.max(1, n(1.6))));
        for (const kind of delves) {
          const p = spot(15, (x, y) => near(x, y, 3, [T.HILL, T.ROCK, T.SNOW]) * (kind === 'forge' || kind === 'trollden' ? 0.35 : 0.05));
          if (!p) continue;
          room(p);
          const site = { id: 'site' + sites.length, cat: 'delve', kind, name: nameFor(X.DELVES[kind], p), x: p.x + 0.5, y: p.y + 0.5, found: false, cleared: false, used: {} };
          sites.push(site);
          X.level(world, site);
        }
      }
      const D = ECHO.Discover;
      if (D) {
        // a wonder nobody has charted
        const wk = rng.pick(Object.keys(D.WONDERS));
        const wp = spot(18, (x, y) => wk === 'falls' ? (near(x, y, 2, [T.WATER]) ? 3 : -6) : wk === 'ring' ? near(x, y, 3, [T.FOREST, T.TREE]) * 0.3 : near(x, y, 3, [T.HILL, T.ROCK]) * 0.3);
        if (wp) { room(wp); sites.push({ id: 'site' + sites.length, cat: 'wonder', kind: wk, name: D.WONDERS[wk].unnamed, unnamed: true, x: wp.x + 0.5, y: wp.y + 0.5, found: false, cleared: false, used: {} }); }
        // caches under stones and in hollow trees
        const caches = world.caches || (world.caches = []);
        for (let i = 0, made = 0, want = n(7); i < 900 && made < want; i++) {
          const x = rng.int(R.x0 + 8, R.x1 - 9), y = rng.int(R.y0 + 8, R.y1 - 9);
          const t = Wo.tile(world, x, y);
          if (!STAND.includes(t) || Wo.isSolid(world, x + 0.5, y + 0.5) || !clear(x, y, 9) || caches.some(c => U.dist(c.x, c.y, x, y) < 11)) continue;
          caches.push({ id: 'cache' + caches.length, kind: t === T.FOREST && rng.chance(0.6) ? 'hollow' : rng.chance(0.5) ? 'cairn' : 'loose', x: x + 0.5, y: y + 0.5, found: false });
          made++;
        }
        // rare herbs where the ground suits them
        const herbs = world.herbs || (world.herbs = []);
        const TN = Object.keys(T);
        for (let i = 0, made = 0, want = n(18); i < 1400 && made < want; i++) {
          const x = rng.int(R.x0 + 6, R.x1 - 7), y = rng.int(R.y0 + 6, R.y1 - 7);
          const t = Wo.tile(world, x, y);
          if (!STAND.includes(t) || Wo.isSolid(world, x + 0.5, y + 0.5) || herbs.some(h => U.dist(h.x, h.y, x, y) < 6) || world.settlements.some(s => U.dist(s.x, s.y, x, y) < 9)) continue;
          const tn = TN.find(kk => T[kk] === t);
          const fits = Object.keys(D.HERBS).filter(kk => D.HERBS[kk].tiles.includes(tn) && (!D.HERBS[kk].nearWater || near(x, y, 2, [T.WATER])));
          if (!fits.length) continue;
          herbs.push({ k: fits[rng.int(0, fits.length - 1)], x: x + 0.5 + (rng.next() - 0.5) * 0.4, y: y + 0.5 + (rng.next() - 0.5) * 0.4, picked: -99 });
          made++;
        }
      }
      // caves, wrecks, stone circles and hermits' huts
      if (ECHO.Secrets && world.secrets && ECHO.Secrets.placeIn) {
        ECHO.Secrets.placeIn(world, rng, R, { cave: Math.max(1, n(4)), wreck: n(2), circle: Math.max(1, n(1.3)), hut: Math.max(1, n(1.6)) }, towns.map(t => t.id));
      }
      void regions;
    },

    // ------------------------------------------------------------ while you play
    // Near an edge — or on the old island's last shore with open sea ahead — the land grows.
    tick(game, dt) {
      Fr._t = (Fr._t || 0) + dt;
      if (Fr._t < 0.8 || Fr.busy) return;
      Fr._t = 0;
      const w = game.world, pe = game.pe;
      if (!w || !pe || ECHO.Interior.cur || game.ff || (ECHO.UI && ECHO.UI.screenOpen) || pe.inBoat === 'ferry' || pe.dead) return;
      for (const side of ['e', 'w', 'n', 's']) {
        if (!Fr.canGrow(w, side)) continue;
        const d = side === 'e' ? w.W - pe.x : side === 'w' ? pe.x : side === 'n' ? pe.y : w.H - pe.y;
        if (d > 95) continue;
        const grown = w.frontier && w.frontier.sides[side];
        if (d < 26 || (!grown && Fr.seaAhead(w, pe, side))) return Fr.go(game, side);
      }
    },
    // Standing near the water, and nothing but sea between here and the edge.
    seaAhead(world, pe, side) {
      const T = TT();
      const ux = side === 'e' ? 1 : side === 'w' ? -1 : 0, uy = side === 's' ? 1 : side === 'n' ? -1 : 0;
      const px = Math.floor(pe.x), py = Math.floor(pe.y);
      let shore = false;
      for (let k = 1; k <= 9 && !shore; k++) { const t = Wd().tile(world, px + ux * k, py + uy * k); if (t === T.WATER || t === T.DEEP) shore = true; }
      if (!shore) return false;
      for (const off of [-5, 0, 5]) {
        for (let k = 12; ; k++) {
          const x = px + ux * k + (uy ? off : 0), y = py + uy * k + (ux ? off : 0);
          if (x < 0 || y < 0 || x >= world.W || y >= world.H) break;
          const t = Wd().tile(world, x, y);
          if (t !== T.WATER && t !== T.DEEP) return false;
        }
      }
      return true;
    },
    go(game, side) {
      Fr.busy = true;
      const fromSea = !(game.world.frontier && game.world.frontier.sides[side]);
      game.ui.toast(fromSea ? `Far out across the water to the ${SIDES[side]}, a dark line of land...` : `The land goes on to the ${SIDES[side]}...`, 'legend', 3);
      setTimeout(() => {
        try {
          const w = game.world, pl = game.pl, pe = game.pe;
          if (game.world !== w || ECHO.Interior.cur) return;
          pl.x = pe.x; pl.y = pe.y; pl.hp = pe.hp;
          const boat = pe.inBoat === true && pl.boat;
          if (boat) { pl.boat.x = pe.x; pl.boat.y = pe.y; pl.boat.dir = pe.dir || 0; }
          const info = Fr.expand(w, side, { from: { x: pe.x, y: pe.y } });
          if (!info) return;
          game.start(w);
          if (boat && ECHO.Boats) ECHO.Boats.board(game);
          if (ECHO.Save) ECHO.Save.save(w);
          const what = info.towns.length ? ` Villages: ${info.towns.join(', ')}.` : '';
          game.ui.toast(`New land to the ${SIDES[side]}: ${info.regions.slice(0, 3).join(', ')}.${what}${info.bar > 12 ? ' A sandbar runs out across the strait.' : ''}`, 'legend', 9);
        } catch (err) { console.error('ECHO: the land could not grow', err); }
        finally { Fr.busy = false; }
      }, 60);
    }
  };
})();
