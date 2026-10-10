// World generation: terrain, rivers, settlements, roads, regions, lairs, ruins,
// and the founding population. Produces a plain serializable `world` object.
(function () {
  const { RNG, U, makeNoise, hash2 } = ECHO;

  const TILE = ECHO.TILE = {
    DEEP: 0, WATER: 1, SAND: 2, GRASS: 3, FOREST: 4, TREE: 5, HILL: 6, ROCK: 7,
    FARM: 8, ROAD: 9, SWAMP: 10, SNOW: 11, RUIN: 12, BRIDGE: 13, PLAZA: 14, RUINWALL: 15
  };
  const SOLID_TILES = new Set([TILE.DEEP, TILE.WATER, TILE.TREE, TILE.ROCK, TILE.RUINWALL]);
  const MOVE_COST = { [TILE.WATER]: 0.5, [TILE.DEEP]: 0.55, [TILE.TREE]: 0.7, [TILE.FOREST]: 0.78, [TILE.SWAMP]: 0.6, [TILE.HILL]: 0.82, [TILE.SNOW]: 0.75, [TILE.SAND]: 0.92, [TILE.ROAD]: 1.15, [TILE.BRIDGE]: 1.15, [TILE.PLAZA]: 1.1 };

  // Dimensions belong to each world (old worlds are 200×150; vast ones are larger).
  // The generator works on the active world's size, set by World.use().
  let W = 200, H = 150;
  let REGION_COLS = 5, REGION_ROWS = 4;
  // How a world of each size is laid out.
  const SIZES = {
    standard: { W: 200, H: 150, RC: 5, RR: 4, villages: 5, lairs: 3, ruins: 6, camps: 2, rivers: 4, land: 0, cands: 4000, spread: 46, freq: 46, rock: 0.70, hill: 0.615, extraRoads: 2 },
    vast: { W: 320, H: 240, RC: 8, RR: 6, villages: 12, lairs: 6, ruins: 11, camps: 4, rivers: 8, land: 0.075, cands: 9000, spread: 52, freq: 52, rock: 0.79, hill: 0.66, extraRoads: 8 }
  };
  let GEN = SIZES.standard;

  const World = ECHO.World = {
    W, H, REGION_COLS, REGION_ROWS, SIZES,
    // Make this world the one the generator and the overlay work on.
    use(world) {
      W = world.W || 200; H = world.H || 150; REGION_COLS = world.RC || 5; REGION_ROWS = world.RR || 4;
      World.W = W; World.H = H; World.REGION_COLS = REGION_COLS; World.REGION_ROWS = REGION_ROWS;
    },
    scale(world) { return world.size === 'vast' ? 2 : 1; },
    gen(world) { return SIZES[world.size] || SIZES.standard; },
    idx: (x, y) => y * W + x,
    inBounds: (x, y) => x >= 0 && y >= 0 && x < W && y < H,
    tile(world, x, y) {
      if (x >= 9000 && ECHO.Interior) return ECHO.Interior.tile(x, y);
      x |= 0; y |= 0;
      const ww = world.W || 200;
      if (x < 0 || y < 0 || x >= ww || y >= (world.H || 150)) return TILE.DEEP;
      return world.tiles[y * ww + x];
    },
    setTile(world, x, y, t) { const ww = world.W || 200; if (x >= 0 && y >= 0 && x < ww && y < (world.H || 150)) world.tiles[y * ww + x] = t; },
    isSolid(world, x, y) {
      if (x >= 9000 && ECHO.Interior) return ECHO.Interior.isSolid(x, y);
      const fx = x, fy = y;
      x = Math.floor(x); y = Math.floor(y);
      const ww = world.W || 200;
      if (x < 0 || y < 0 || x >= ww || y >= (world.H || 150)) return true;
      const i = y * ww + x;
      if (world.blocked[i] === 1) return true;
      const t = world.tiles[i];
      // A tree only blocks at its trunk, so you can thread between them.
      if (t === TILE.TREE) { const tr = World.trunk(world, x, y); return (fx - tr.x) ** 2 + (fy - tr.y) ** 2 < 0.2 * 0.2; }
      return SOLID_TILES.has(t);
    },
    // Where the trunk stands in a tree tile (the 3D renderer plants it here too).
    trunk(world, x, y) {
      return { x: x + 0.5 + (ECHO.hash2(x, y, world.seed + 32) - 0.5) * 0.5, y: y + 0.5 + (ECHO.hash2(x, y, world.seed + 33) - 0.5) * 0.5 };
    },
    speedAt(world, x, y) { return MOVE_COST[World.tile(world, x, y)] || 1; },
    regionAt(world, x, y) {
      if (world.frontier) return World.regionGrid(world, x, y);
      const RC = world.RC || 5, RR = world.RR || 4;
      const rx = U.clamp(Math.floor(x / ((world.W || 200) / RC)), 0, RC - 1);
      const ry = U.clamp(Math.floor(y / ((world.H || 150) / RR)), 0, RR - 1);
      return world.regions[ry * RC + rx];
    },
    // Once the land has grown past its first edges, regions are rectangles of
    // any size: look them up through a coarse grid built from their bounds.
    regionGrid(world, x, y) {
      const S = 4, cw = Math.ceil(world.W / S), ch = Math.ceil(world.H / S);
      let G = world._rgrid;
      if (!G || G.cw !== cw || G.ch !== ch || G.n !== world.regions.length) {
        G = world._rgrid = { cw, ch, n: world.regions.length, ids: new Int32Array(cw * ch).fill(-1) };
        for (const r of world.regions) {
          const x0 = Math.max(0, Math.floor(r.x0 / S)), x1 = Math.min(cw, Math.ceil(r.x1 / S)), y0 = Math.max(0, Math.floor(r.y0 / S)), y1 = Math.min(ch, Math.ceil(r.y1 / S));
          for (let gy = y0; gy < y1; gy++) for (let gx = x0; gx < x1; gx++) {
            const cx = gx * S + S / 2, cy = gy * S + S / 2;
            if (cx >= r.x0 && cx < r.x1 && cy >= r.y0 && cy < r.y1) G.ids[gy * cw + gx] = r.id;
            else if (G.ids[gy * cw + gx] < 0) G.ids[gy * cw + gx] = r.id;
          }
        }
      }
      const gx = U.clamp(Math.floor(x / S), 0, cw - 1), gy = U.clamp(Math.floor(y / S), 0, ch - 1);
      const id = G.ids[gy * cw + gx];
      return world.regions[id >= 0 ? id : 0];
    },
    regionNeighbors(world, region) {
      if (world.frontier) {
        const nb = world._rnb || (world._rnb = {});
        if (nb._n !== world.regions.length) { for (const k of Object.keys(nb)) delete nb[k]; nb._n = world.regions.length; }
        if (!nb[region.id]) {
          const touch = (a, b) => (Math.abs(a.x1 - b.x0) < 0.6 || Math.abs(b.x1 - a.x0) < 0.6) && a.y0 < b.y1 - 1 && b.y0 < a.y1 - 1 ||
            (Math.abs(a.y1 - b.y0) < 0.6 || Math.abs(b.y1 - a.y0) < 0.6) && a.x0 < b.x1 - 1 && b.x0 < a.x1 - 1;
          nb[region.id] = world.regions.filter(r => r !== region && touch(region, r)).map(r => r.id);
        }
        return nb[region.id].map(id => world.regions[id]);
      }
      const out = [];
      const RC = world.RC || 5, RR = world.RR || 4;
      const rx = region.id % RC, ry = Math.floor(region.id / RC);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = rx + dx, ny = ry + dy;
        if (nx >= 0 && ny >= 0 && nx < RC && ny < RR) out.push(world.regions[ny * RC + nx]);
      }
      return out;
    },
    settlementAt(world, x, y, radius = 13) {
      let best = null, bd = radius;
      for (const s of world.settlements) {
        const d = U.dist(x, y, s.x, s.y);
        if (d < bd) { bd = d; best = s; }
      }
      return best;
    },
    nearestSettlement(world, x, y, filter) {
      let best = null, bd = Infinity;
      for (const s of world.settlements) {
        if (filter && !filter(s)) continue;
        const d = U.dist(x, y, s.x, s.y);
        if (d < bd) { bd = d; best = s; }
      }
      return best;
    },
    // Rebuild the collision overlay from buildings and structures.
    rebuildBlocked(world) {
      World.use(world);
      world.blocked = new Uint8Array(W * H);
      const mark = (x, y, w, h) => {
        for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (World.inBounds(xx, yy)) world.blocked[yy * W + xx] = 1;
      };
      for (const s of world.settlements) for (const b of s.buildings) {
        if (b.ruined) continue;
        mark(b.x, b.y, b.w, b.h);
      }
      for (const st of world.structures) if (st.solid) mark(Math.floor(st.x), Math.floor(st.y), st.w || 1, st.h || 1);
      for (const l of world.lairs) for (const r of l.rocks) if (r.hp > 0) mark(Math.floor(r.x), Math.floor(r.y), 1, 1);
    },
    // A* over tiles. Used for roads at generation and for travel at runtime.
    findPath(world, sx, sy, tx, ty, costFn, maxIter = 60000) {
      const W = world.W || 200, H = world.H || 150;
      sx |= 0; sy |= 0; tx |= 0; ty |= 0;
      if (sx < 0 || sy < 0 || tx < 0 || ty < 0 || sx >= W || sy >= H || tx >= W || ty >= H) return null;
      const N = W * H;
      const g = new Float32Array(N).fill(Infinity);
      const came = new Int32Array(N).fill(-1);
      const closed = new Uint8Array(N);
      const heap = [];
      const push = (i, f) => {
        heap.push([f, i]);
        let c = heap.length - 1;
        while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; }
      };
      const pop = () => {
        const top = heap[0], last = heap.pop();
        if (heap.length) {
          heap[0] = last; let c = 0;
          for (;;) {
            const l = 2 * c + 1, r = l + 1; let m = c;
            if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
            if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
            if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m;
          }
        }
        return top;
      };
      const start = sy * W + sx, goal = ty * W + tx;
      g[start] = 0; push(start, 0);
      let iter = 0;
      while (heap.length && iter++ < maxIter) {
        const [, cur] = pop();
        if (cur === goal) break;
        if (closed[cur]) continue;
        closed[cur] = 1;
        const cx = cur % W, cy = (cur / W) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const ni = ny * W + nx;
          if (closed[ni]) continue;
          const c = costFn(nx, ny, ni);
          if (!isFinite(c)) continue;
          const ng = g[cur] + c;
          if (ng < g[ni]) { g[ni] = ng; came[ni] = cur; push(ni, ng + (Math.abs(nx - tx) + Math.abs(ny - ty)) * 0.9); }
        }
      }
      if (came[goal] === -1 && start !== goal) return null;
      const path = [];
      for (let c = goal; c !== -1; c = came[c]) { path.push(c); if (c === start) break; }
      return path.reverse();
    }
  };

  // ------------------------------------------------------------------ Factions
  function makeFactions() {
    return {
      valdren: { id: 'valdren', name: 'Kingdom of Valdren', short: 'Valdren', type: 'kingdom', culture: 'valdren', color: '#6f8fc4', banner: '#2b3f66', treasury: 900, relations: {}, ruler: null, capital: null, tech: { era: 0, points: 0, arcane: 0, mech: 0, path: null, inventions: [] }, doctrines: {}, atWar: {}, taxRate: 0.12 },
      ashmere: { id: 'ashmere', name: 'Ashmere Dominion', short: 'Ashmere', type: 'kingdom', culture: 'ashmere', color: '#5fae84', banner: '#24523b', treasury: 900, relations: {}, ruler: null, capital: null, tech: { era: 0, points: 0, arcane: 0, mech: 0, path: null, inventions: [] }, doctrines: {}, atWar: {}, taxRate: 0.1 },
      lantern: { id: 'lantern', name: 'Order of the Lantern', short: 'the Lantern', type: 'order', culture: 'lantern', color: '#e6c06a', banner: '#6b5320', treasury: 600, relations: {}, ruler: null, capital: null, tech: { era: 0, points: 0, arcane: 0, mech: 0, path: null, inventions: [] }, doctrines: {}, atWar: {}, taxRate: 0.05 },
      ashfang: { id: 'ashfang', name: 'the Ashfang', short: 'Ashfang', type: 'bandits', culture: 'valdren', color: '#d0563c', banner: '#5a1d12', treasury: 120, relations: {}, ruler: null, capital: null, tech: { era: 0, points: 0, arcane: 0, mech: 0, path: null, inventions: [] }, doctrines: {}, atWar: {}, taxRate: 0 },
      wild: { id: 'wild', name: 'the Wild', short: 'the Wild', type: 'wild', culture: 'valdren', color: '#9b7bb5', banner: '#3a2a47', treasury: 0, relations: {}, ruler: null, capital: null, tech: { era: 0, points: 0, arcane: 0, mech: 0, path: null, inventions: [] }, doctrines: {}, atWar: {}, taxRate: 0 }
    };
  }

  // ------------------------------------------------------------------ Terrain
  function genTerrain(world, rng) {
    const elev = makeNoise(world.seed);
    const moist = makeNoise(world.seed ^ 0x9e3779b9);
    const tiles = new Uint8Array(W * H);
    const E = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const nx = x / W - 0.5, ny = y / H - 0.5;
        const d = Math.sqrt(nx * nx * 1.1 + ny * ny * 1.4) * 2;
        let e = elev(x / GEN.freq, y / GEN.freq) * 1.25 - Math.pow(d, 2.4) * (0.62 - GEN.land * 3) + 0.02 - GEN.land * 0.25;
        const m = moist(x / 38 + 50, y / 38 + 50);
        E[y * W + x] = e;
        let t;
        if (e < 0.25) t = TILE.DEEP;
        else if (e < 0.31) t = TILE.WATER;
        else if (e < 0.335) t = TILE.SAND;
        else if (e > GEN.rock) t = TILE.ROCK;
        else if (e > GEN.hill) t = (y < H * 0.24) ? TILE.SNOW : TILE.HILL;
        else if (m > 0.6 && e < 0.42) t = TILE.SWAMP;
        else if (m > 0.52) t = (hash2(x, y, world.seed) < 0.42 ? TILE.TREE : TILE.FOREST);
        else t = TILE.GRASS;
        if (t === TILE.HILL && y < H * 0.2 && e > 0.66) t = TILE.SNOW;
        tiles[y * W + x] = t;
      }
    }
    world.tiles = tiles;
    // Rivers: walk downhill from high points to the sea.
    const sources = [];
    for (let i = 0; i < 400 * GEN.rivers && sources.length < GEN.rivers; i++) {
      const x = rng.int(10, W - 10), y = rng.int(10, H - 10);
      if (E[y * W + x] > 0.6 && sources.every(s => U.dist(s[0], s[1], x, y) > 40)) sources.push([x, y]);
    }
    for (const [sx, sy] of sources) {
      let x = sx, y = sy;
      const seen = new Set();
      for (let step = 0; step < 400; step++) {
        const i = y * W + x;
        if (seen.has(i)) break;
        seen.add(i);
        if (tiles[i] === TILE.DEEP || (tiles[i] === TILE.WATER && step > 3)) break;
        if (step > 2) tiles[i] = TILE.WATER;
        let best = null, be = Infinity;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (!World.inBounds(nx, ny) || seen.has(ny * W + nx)) continue;
          const ee = E[ny * W + nx] + rng.next() * 0.02;
          if (ee < be) { be = ee; best = [nx, ny]; }
        }
        if (!best) break;
        [x, y] = best;
      }
    }
    world._elev = E;
  }

  function largestLandComponent(world) {
    const comp = new Int32Array(W * H).fill(-1);
    let bestId = -1, bestSize = 0, id = 0;
    const walk = t => !SOLID_TILES.has(t) || t === TILE.TREE;
    for (let i = 0; i < W * H; i++) {
      if (comp[i] !== -1 || !walk(world.tiles[i])) continue;
      const stack = [i]; comp[i] = id; let size = 0;
      while (stack.length) {
        const c = stack.pop(); size++;
        const cx = c % W, cy = (c / W) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (!World.inBounds(nx, ny)) continue;
          const ni = ny * W + nx;
          if (comp[ni] === -1 && walk(world.tiles[ni])) { comp[ni] = id; stack.push(ni); }
        }
      }
      if (size > bestSize) { bestSize = size; bestId = id; }
      id++;
    }
    return { comp, main: bestId };
  }

  // ------------------------------------------------------------------ Settlements
  function siteScore(world, x, y) {
    let s = 0;
    for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) {
      const t = World.tile(world, x + dx, y + dy);
      if (t === TILE.GRASS) s += 1.0;
      else if (t === TILE.FOREST || t === TILE.TREE) s += 0.5;
      else if (t === TILE.SAND || t === TILE.HILL) s += 0.2;
      else if (t === TILE.WATER) s += 0.1;
      else s -= 1.2;
    }
    return s;
  }

  function placeSettlements(world, rng, comp, main) {
    const cands = [];
    for (let i = 0; i < GEN.cands; i++) {
      const x = rng.int(14, W - 15), y = rng.int(12, H - 13);
      const t = World.tile(world, x, y);
      if (comp[y * W + x] !== main || (t !== TILE.GRASS && t !== TILE.FOREST)) continue;
      cands.push({ x, y, score: siteScore(world, x, y) });
    }
    cands.sort((a, b) => b.score - a.score);
    const good = cands.slice(0, Math.max(80, cands.length >> 1));
    const chosen = [];
    // Capital of Valdren: north half. Ashmere: south half, far away.
    const north = good.filter(c => c.y < H * 0.45);
    const south = good.filter(c => c.y > H * 0.55);
    const capA = north[0] || good[0];
    chosen.push({ ...capA, kind: 'capital', faction: 'valdren' });
    let capB = null, bd = 0;
    for (const c of (south.length ? south : good).slice(0, 60)) {
      const d = U.dist(c.x, c.y, capA.x, capA.y);
      if (d > bd) { bd = d; capB = c; }
    }
    chosen.push({ ...capB, kind: 'capital', faction: 'ashmere' });
    // Temple town: roughly between them, off to one side.
    let temple = null, tb = -Infinity;
    const mx = (capA.x + capB.x) / 2, my = (capA.y + capB.y) / 2;
    for (const c of good) {
      const dA = U.dist(c.x, c.y, capA.x, capA.y), dB = U.dist(c.x, c.y, capB.x, capB.y);
      if (dA < 32 || dB < 32) continue;
      const sc = -Math.abs(dA - dB) - U.dist(c.x, c.y, mx, my) * 0.5 + c.score * 0.3;
      if (sc > tb) { tb = sc; temple = c; }
    }
    chosen.push({ ...(temple || good[5]), kind: 'temple', faction: 'lantern' });
    // Villages: farthest point sampling.
    for (let k = 0; k < GEN.villages; k++) {
      let best = null, bscore = -Infinity;
      for (const c of good) {
        const md = Math.min(...chosen.map(o => U.dist(o.x, o.y, c.x, c.y)));
        if (md < 26) continue;
        const sc = Math.min(md, GEN.spread) + c.score * 0.25 + rng.next() * 6;
        if (sc > bscore) { bscore = sc; best = c; }
      }
      if (!best) break;
      chosen.push({ ...best, kind: 'village', faction: null });
    }
    // Villages swear to the nearer capital.
    for (const c of chosen) if (!c.faction) {
      c.faction = U.dist(c.x, c.y, capA.x, capA.y) < U.dist(c.x, c.y, capB.x, capB.y) ? 'valdren' : 'ashmere';
    }
    const used = new Set();
    world.settlements = chosen.map((c, i) => ({
      id: 's' + i, name: ECHO.makePlaceName(rng, used), x: c.x, y: c.y, kind: c.kind, faction: c.faction,
      founder: c.faction, buildings: [], farmTiles: 0, stock: { food: 0, ore: 0, arms: 0, herbs: 0, timber: 0 },
      prices: {}, priceHistory: [], unrest: 8, prosperity: 50, hunger: 0, garrison: 0, residents: [],
      events: [], knownRumors: [], lastFamineDay: -999, ruler: null, statueOf: [], prison: [],
      wealth: 300, techLook: 0
    }));
  }

  function layoutSettlement(world, s, rng, residentsCount) {
    const r = s.kind === 'capital' ? 6 : 5;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r * r + 2) {
        const t = World.tile(world, s.x + dx, s.y + dy);
        if (t !== TILE.WATER && t !== TILE.DEEP) World.setTile(world, s.x + dx, s.y + dy, TILE.PLAZA);
      }
    }
    const occ = new Set();
    const free = (x, y, w, h) => {
      for (let yy = y - 1; yy <= y + h; yy++) for (let xx = x - 1; xx <= x + w; xx++) {
        if (occ.has(yy * W + xx)) return false;
        const t = World.tile(world, xx, yy);
        if (t === TILE.WATER || t === TILE.DEEP || t === TILE.ROCK) return false;
      }
      return true;
    };
    const claim = (x, y, w, h) => {
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
        occ.add(yy * W + xx);
        const t = World.tile(world, xx, yy);
        if (t === TILE.TREE || t === TILE.FOREST || t === TILE.SWAMP) World.setTile(world, xx, yy, TILE.GRASS);
      }
    };
    const place = (type, w, h, minR, maxR, extra = {}) => {
      for (let tries = 0; tries < 200; tries++) {
        const a = rng.next() * Math.PI * 2, d = rng.range(minR, maxR);
        const x = Math.round(s.x + Math.cos(a) * d - w / 2), y = Math.round(s.y + Math.sin(a) * d - h / 2);
        if (free(x, y, w, h)) {
          claim(x, y, w, h);
          const b = { id: s.id + '_b' + s.buildings.length, type, x, y, w, h, ...extra };
          s.buildings.push(b);
          return b;
        }
      }
      return null;
    };
    // keep the plaza centre open
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) occ.add((s.y + dy) * W + s.x + dx);
    place('well', 1, 1, 0, 0.1);
    occ.delete(s.y * W + s.x);
    if (s.kind === 'capital') place('keep', 6, 5, 5, 8);
    if (s.kind === 'temple') place('temple', 6, 5, 4, 7);
    place('inn', 5, 4, 4, 8);
    place('market', 4, 3, 3, 7);
    place('smithy', 4, 3, 5, 10);
    place('board', 1, 1, 3, 4);
    if (s.kind !== 'temple') place('shrine', 3, 3, 6, 11);
    if (s.kind !== 'village') place('archive', 4, 4, 6, 11);
    const houses = Math.ceil(residentsCount / 3.2);
    for (let i = 0; i < houses; i++) place('house', 3, 3, 6, 13 + i * 0.25);
    // lamps (lit at night, upgraded with technology)
    for (let i = 0; i < 4; i++) place('lamp', 1, 1, 3, 7);
    // Farms ring
    let farm = 0;
    for (let dy = -17; dy <= 17; dy++) for (let dx = -17; dx <= 17; dx++) {
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 10 || d > 16.5) continue;
      const x = s.x + dx, y = s.y + dy;
      const t = World.tile(world, x, y);
      if ((t === TILE.GRASS || t === TILE.FOREST) && !occ.has(y * W + x) && hash2(x >> 1, y >> 2, world.seed + 7) < 0.62) {
        World.setTile(world, x, y, TILE.FARM); farm++;
      }
    }
    s.farmTiles = farm;
  }

  function roadCost(world) {
    return (x, y, i) => {
      const t = world.tiles[i];
      if (world.blocked && world.blocked[i]) return Infinity;
      switch (t) {
        case TILE.ROAD: case TILE.BRIDGE: return 0.35;
        case TILE.PLAZA: return 0.6;
        case TILE.GRASS: case TILE.FARM: return 1;
        case TILE.SAND: return 1.4;
        case TILE.FOREST: return 1.8;
        case TILE.TREE: return 2.6;
        case TILE.HILL: case TILE.SNOW: return 3;
        case TILE.SWAMP: return 3.2;
        case TILE.WATER: return 14;
        case TILE.DEEP: return 60;
        case TILE.ROCK: return Infinity;
        default: return 2;
      }
    };
  }
  // Lay a road between two settlements (used at creation, and when a new village is founded).
  function connectRoad(world, a, b, maxIter = 120000) {
    const path = World.findPath(world, a.x, a.y + 1, b.x, b.y + 1, roadCost(world), maxIter);
    if (!path) return null;
    for (const p of path) {
      const t = world.tiles[p];
      if (t === TILE.WATER || t === TILE.DEEP) world.tiles[p] = TILE.BRIDGE;
      else if (t !== TILE.PLAZA) world.tiles[p] = TILE.ROAD;
    }
    const r = { id: 'r' + world.roads.length, a: a.id, b: b.id, path, len: path.length, danger: 0 };
    world.roads.push(r);
    return r;
  }
  function buildRoads(world) {
    const S = world.settlements;
    // MST edges + a few extra for loops
    const edges = [];
    for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) edges.push([U.dist(S[i].x, S[i].y, S[j].x, S[j].y), i, j]);
    edges.sort((a, b) => a[0] - b[0]);
    const parent = S.map((_, i) => i);
    const find = i => parent[i] === i ? i : (parent[i] = find(parent[i]));
    const chosen = [];
    for (const e of edges) { const a = find(e[1]), b = find(e[2]); if (a !== b) { parent[a] = b; chosen.push(e); } }
    let extra = 0;
    for (const e of edges) { if (extra >= GEN.extraRoads) break; if (!chosen.includes(e) && e[0] < 75) { chosen.push(e); extra++; } }
    world.roads = [];
    for (const [, i, j] of chosen) connectRoad(world, S[i], S[j]);
  }
  World.connectRoad = connectRoad;
  World.siteScore = (world, x, y) => siteScore(world, x, y);
  World.layoutSettlement = (world, s, rng, n) => layoutSettlement(world, s, rng, n);

  // ------------------------------------------------------------------ Regions
  function buildRegions(world, rng) {
    const used = new Set();
    world.regions = [];
    const rw = W / REGION_COLS, rh = H / REGION_ROWS;
    for (let ry = 0; ry < REGION_ROWS; ry++) for (let rx = 0; rx < REGION_COLS; rx++) {
      let land = 0, forest = 0, farm = 0, hill = 0, swamp = 0, n = 0;
      for (let y = Math.floor(ry * rh); y < Math.floor((ry + 1) * rh); y += 2) for (let x = Math.floor(rx * rw); x < Math.floor((rx + 1) * rw); x += 2) {
        const t = World.tile(world, x, y); n++;
        if (t !== TILE.WATER && t !== TILE.DEEP) land++;
        if (t === TILE.FOREST || t === TILE.TREE) forest++;
        if (t === TILE.FARM) farm++;
        if (t === TILE.HILL || t === TILE.ROCK || t === TILE.SNOW) hill++;
        if (t === TILE.SWAMP) swamp++;
      }
      const landF = land / n;
      const region = {
        id: ry * REGION_COLS + rx, name: ECHO.makeRegionName(rng, used),
        x0: rx * rw, y0: ry * rh, x1: (rx + 1) * rw, y1: (ry + 1) * rh,
        land: landF, forest: forest / Math.max(1, land), farm: farm / Math.max(1, land), hill: hill / Math.max(1, land), swamp: swamp / Math.max(1, land),
        apex: null, eco: null, history: []
      };
      world.regions.push(region);
    }
  }

  // ------------------------------------------------------------------ Lairs (apex monsters)
  const APEX_KINDS = [
    { kind: 'drake', title: 'the Fen Drake', base: ['Marrowjaw', 'Gristlemaw', 'Old Sorrow', 'Bilecrown'] },
    { kind: 'wyrm', title: 'the Thornback', base: ['Hollowcoil', 'Rotfang', 'the Grey Widow', 'Saltgrave'] },
    { kind: 'stag', title: 'the Antlered Dread', base: ['Mournhorn', 'Ninebranch', 'Ashantler', 'the Pale Hart'] }
  ];
  World.APEX_KINDS = APEX_KINDS;

  function placeLairs(world, rng, comp, main) {
    world.lairs = [];
    const villages = rng.shuffle(world.settlements.filter(s => s.kind === 'village').slice());
    const want = Math.min(GEN.lairs, Math.max(2, villages.length));
    const clearOf = (x, y, r, bad) => {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (bad.has(World.tile(world, x + dx, y + dy))) return false;
      return true;
    };
    const WET = new Set([TILE.WATER, TILE.DEEP, TILE.BRIDGE]);
    const ROADY = new Set([TILE.ROAD, TILE.PLAZA]);
    const pools = villages.length ? villages : world.settlements.filter(s => s.kind !== 'capital');
    let k = 0;
    for (const strict of [7, 5, 3]) {
      for (const v of pools) {
        if (world.lairs.length >= want) break;
        if (world.lairs.some(l => l.villageId === v.id)) continue;
        let spot = null;
        for (let tries = 0; tries < 900 && !spot; tries++) {
          const a = rng.next() * Math.PI * 2, d = rng.range(17, 34);
          const x = Math.round(v.x + Math.cos(a) * d), y = Math.round(v.y + Math.sin(a) * d);
          if (x < 10 || y < 10 || x > W - 10 || y > H - 10) continue;
          if (comp[y * W + x] !== main) continue;
          if (world.settlements.some(s => U.dist(s.x, s.y, x, y) < 16)) continue;
          if (world.lairs.some(l => U.dist(l.x, l.y, x, y) < 24)) continue;
          const t = World.tile(world, x, y);
          if (WET.has(t) || ROADY.has(t) || t === TILE.ROCK) continue;
          if (!clearOf(x, y, strict, WET) || !clearOf(x, y, 4, ROADY)) continue;
          spot = { x, y };
        }
        if (!spot) continue;
          // Clear an arena with destructible cover stones.
          const R = 7;
          for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
            if (dx * dx + dy * dy > R * R) continue;
            const t = World.tile(world, spot.x + dx, spot.y + dy);
            if (t !== TILE.WATER && t !== TILE.DEEP && t !== TILE.ROAD && t !== TILE.BRIDGE) World.setTile(world, spot.x + dx, spot.y + dy, TILE.RUIN);
          }
          const rocks = [];
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 + rng.next() * 0.4;
            rocks.push({ x: spot.x + Math.round(Math.cos(a) * 4.2), y: spot.y + Math.round(Math.sin(a) * 4.2), hp: 60 });
          }
          const ak = APEX_KINDS[k % APEX_KINDS.length];
          k++;
          const region = World.regionAt(world, spot.x, spot.y);
          const lair = {
            id: 'lair' + world.lairs.length, x: spot.x, y: spot.y, rocks, regionId: region.id, villageId: v.id,
            boss: {
              id: 'boss' + world.lairs.length, name: rng.pick(ak.base), title: ak.title, kind: ak.kind,
              maxHp: 420 + world.lairs.length * 60, hp: 420 + world.lairs.length * 60, alive: true, fled: false, absentUntil: -1,
              armor: { melee: 0, ranged: 0, fire: 0 }, scars: [],
              memory: { encounters: 0, dodge: { left: 0, right: 0, back: 0 }, blocks: 0, attacksSeen: 0, rangedTime: 0, meleeTime: 0, damageBy: { melee: 0, ranged: 0, fire: 0 }, knownFoes: {} },
              kills: 0, bornDay: -rng.int(300, 2000)
            }
          };
          region.apex = lair.id;
          world.lairs.push(lair);
      }
    }
  }

  // ------------------------------------------------------------------ Ruins
  function placeRuins(world, rng, comp, main) {
    world.ruins = [];
    const used = new Set();
    const names = ['Vault', 'Barrow', 'Spire', 'Undercroft', 'Sanctum', 'Cairn', 'Observatory'];
    for (let tries = 0; tries < 3000 * (GEN.ruins / 6) && world.ruins.length < GEN.ruins; tries++) {
      const x = rng.int(12, W - 13), y = rng.int(12, H - 13);
      if (comp[y * W + x] !== main) continue;
      const t = World.tile(world, x, y);
      if (t === TILE.ROAD || t === TILE.PLAZA || t === TILE.FARM) continue;
      if (world.settlements.some(s => U.dist(s.x, s.y, x, y) < 22)) continue;
      if (world.lairs.some(l => U.dist(l.x, l.y, x, y) < 16)) continue;
      if (world.ruins.some(r => U.dist(r.x, r.y, x, y) < 24)) continue;
      // Draw broken walls
      for (let dy = -4; dy <= 4; dy++) for (let dx = -5; dx <= 5; dx++) {
        const edge = Math.abs(dx) === 5 || Math.abs(dy) === 4;
        const tt = World.tile(world, x + dx, y + dy);
        if (tt === TILE.WATER || tt === TILE.DEEP) continue;
        if (edge && hash2(x + dx, y + dy, world.seed + 3) < 0.55 && !(dy === 4 && Math.abs(dx) <= 1)) World.setTile(world, x + dx, y + dy, TILE.RUINWALL);
        else World.setTile(world, x + dx, y + dy, TILE.RUIN);
      }
      const nm = rng.pick(['Sunken', 'Silent', 'First', 'Shattered', 'Drowned', 'Hollow', 'Starless', 'Forgotten']) + ' ' + rng.pick(names);
      if (used.has(nm)) continue; used.add(nm);
      world.ruins.push({ id: 'ruin' + world.ruins.length, name: 'the ' + nm, x, y, tablet: null, relics: [], visited: false, studied: 0 });
    }
  }

  function placeCamps(world, rng, comp, main) {
    world.camps = [];
    for (let k = 0; k < GEN.camps; k++) ECHO.Politics.foundCamp(world, rng, null, true);
  }

  // ------------------------------------------------------------------ Generate
  ECHO.generateWorld = function (opts) {
    const seed = (opts.seed >>> 0) || ECHO.hashStr(String(Math.random()));
    const rng = new RNG(seed);
    const size = SIZES[opts.size] ? opts.size : 'standard';
    GEN = SIZES[size];
    const world = {
      version: 1, id: opts.id || ('w' + seed.toString(36)), name: opts.name || 'Unnamed World', seed,
      createdAt: Date.now(), playSeconds: 0,
      W: GEN.W, H: GEN.H, RC: GEN.RC, RR: GEN.RR, size, day: 0, minute: 8 * 60,
      factions: makeFactions(), settlements: [], roads: [], regions: [], lairs: [], ruins: [], camps: [],
      structures: [], npcs: {}, items: {}, caravans: [], armies: [], plights: [], chronicle: [], legends: [],
      intel: null, lang: null, player: null, characters: [], nextNpc: 1, nextItem: 1, stats: { births: 0, deaths: 0, wars: 0, famines: 0 },
      rift: null, worldVisitors: []
    };
    World.use(world);
    genTerrain(world, rng);
    const { comp, main } = largestLandComponent(world);
    placeSettlements(world, rng, comp, main);
    const pops = world.settlements.map(s => s.kind === 'capital' ? rng.int(46, 54) : s.kind === 'temple' ? rng.int(28, 32) : rng.int(24, 32));
    world.settlements.forEach((s, i) => layoutSettlement(world, s, rng, pops[i]));
    World.rebuildBlocked(world);
    buildRoads(world);
    buildRegions(world, rng);
    placeLairs(world, rng, comp, main);
    placeRuins(world, rng, comp, main);
    World.rebuildBlocked(world);
    // Capitals of factions
    for (const s of world.settlements) {
      if (s.kind === 'capital' || s.kind === 'temple') world.factions[s.faction].capital = s.id;
    }
    // Founding population and every system's initial state
    ECHO.People.populate(world, rng, pops);
    ECHO.Ecology.init(world, rng);
    ECHO.Economy.init(world, rng);
    ECHO.Politics.init(world, rng);
    placeCamps(world, rng, comp, main);
    ECHO.Intel.init(world);
    ECHO.Mysteries.generate(world, rng);
    ECHO.Civ.init(world);
    world.rngState = rng.state;
    delete world._elev;
    ECHO.Chronicle.add(world, { text: `The chronicle of ${world.name} begins. ${world.factions.valdren.name} and ${world.factions.ashmere.name} keep an uneasy peace; the ${world.factions.lantern.name.replace('Order of the ', 'Lantern Order ')} tends the flame at ${ECHO.Sim.settlement(world, world.factions.lantern.capital).name}.`, kind: 'era', importance: 3 });
    // Pre-history: let the world live a while before the player arrives.
    const prehistory = opts.prehistoryDays == null ? 30 : opts.prehistoryDays;
    for (let d = 0; d < prehistory; d++) ECHO.Sim.dailyTick(world, true);
    return world;
  };
})();
