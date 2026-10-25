// The woods: trails through them, and the deep woods where something lives.
//
// • Trails: every forest of any size has paths worn through it — from the
//   meadows and roads at its edges, winding in to its deepest part — with the
//   trees cleared off them, so the woods can be walked and explored at a good
//   pace instead of fought through trunk by trunk.
// • The deep woods: the two or three greatest forests of the land (grown
//   thicker where they were thin) hold a wood that is not like the others. The
//   trees there are dead or old beyond telling, the light does not come down,
//   and the things that live in it are the strongest in the land outside the
//   gates: the deeper in, the worse, and at its heart a clearing where its lord
//   waits. Its trails lead in, and caches of those who went before lie along
//   them.
//
// Everything is kept on `world.wild` (small: runs of tiles, relative to where
// the map's first corner is, so a map that grows west or north keeps it) and
// re-read into tile masks on load (`world._trail`, `world._wd`).
(function () {
  const { U, RNG, hash2 } = ECHO;
  const T = () => ECHO.TILE;
  const Wd = () => ECHO.World;

  const NAMES = ['the Hollow Wood', 'the Weeping Dark', 'Gallowmere Wood', 'the Thornwild', 'Grimhollow', 'the Whispering Deep', 'Mourningwood', 'the Gloaming', 'Blackbough', 'the Witchwood', 'Hangman\'s Weald', 'the Nightwood'];
  const LORDS = [
    { name: 'the Erlking', title: 'Lord of the Wild Hunt' },
    { name: 'the Antlered King', title: 'He Who Rides the Dark' },
    { name: 'the Erlking of the Thorns', title: 'Hunter of Lost Children' }
  ];
  const TIER_NAME = ['', 'the Fringe', 'the Deep', 'the Heart'];

  const WW = ECHO.Wildwood = {
    NAMES, TIER_NAME, V: 2,
    isForest(t) { const X = T(); return t === X.FOREST || t === X.TREE; },
    origin(world) { const F = world.frontier; return F ? { ox: F.ox || 0, oy: F.oy || 0 } : { ox: 0, oy: 0 }; },

    // ------------------------------------------------------------ on load / on start
    ensure(world) {
      if (!world || !world.tiles) return null;
      if (!world.wild || world.wild.v !== WW.V) WW.build(world);
      if (!world._trail || world._trail.length !== world.W * world.H) WW.index(world);
      return world.wild;
    },
    // the masks the game reads every frame
    index(world) {
      const N = world.W * world.H, W = world.W, H = world.H, S = world.wild;
      const trail = world._trail = new Uint8Array(N), wd = world._wd = new Uint8Array(N), wi = world._wdi = new Int8Array(N).fill(-1);
      if (!S) return;
      const o = WW.origin(world), dx = o.ox - S.ox, dy = o.oy - S.oy;
      const runs = (a, f) => { for (let k = 0; k + 2 < a.length; k += 3) { const y = a[k] + dy; if (y < 0 || y >= H) continue; for (let x = a[k + 1] + dx, e = x + a[k + 2]; x < e; x++) if (x >= 0 && x < W) f(y * W + x); } };
      runs(S.trails || [], i => { trail[i] = 1; });
      S.woods.forEach((w, n) => {
        runs(w.rows || [], i => { wi[i] = n; wd[i] = 1; });
        runs(w.clear || [], i => { trail[i] = 2; });
        // how deep: by the distance from the heart, against how far the wood reaches
        const R = Math.max(6, w.r || 14);
        runs(w.rows || [], i => {
          const x = i % W, y = (i / W) | 0, d = U.dist(x + 0.5, y + 0.5, w.x, w.y) / R;
          wd[i] = d < 0.33 ? 3 : d < 0.66 ? 2 : 1;
        });
      });
    },
    // run-length rows of a set of tile indices, relative to the map's first corner
    toRows(world, idx) {
      const W = world.W, c = WW.origin(world), S = world.wild || c, o = { ox: c.ox - (S.ox || 0), oy: c.oy - (S.oy || 0) }, out = [];
      const s = [...idx].sort((a, b) => a - b);
      for (let k = 0; k < s.length;) {
        const i = s[k], y = (i / W) | 0; let x = i % W, n = 1;
        while (k + n < s.length && s[k + n] === i + n && ((s[k + n] / W) | 0) === y) n++;
        out.push(y - o.oy, x - o.ox, n);
        k += n;
      }
      return out;
    },

    // ------------------------------------------------------------ making them
    build(world, area) {
      const X = T(), W = world.W, H = world.H, N = W * H, tiles = world.tiles;
      const S = world.wild && world.wild.v === WW.V && area ? world.wild : (world.wild = { v: WW.V, ...WW.origin(world), trails: [], woods: [] });
      const rng = new RNG(ECHO.hashStr('wild:' + world.seed + ':' + (area ? `${area.x0},${area.y0}` : 'all')));
      const inArea = i => { if (!area) return true; const x = i % W, y = (i / W) | 0; return x >= area.x0 && x < area.x1 && y >= area.y0 && y < area.y1; };
      const towns = world.settlements || [];
      const nearTown = (x, y, r) => towns.some(s => Math.abs(s.x - x) < r && Math.abs(s.y - y) < r && U.dist(s.x, s.y, x, y) < r);
      const pl = world.player;
      const avoid = [...(world.sites || []), ...((world.gates && world.gates.list) || []), ...(world.lairs || []), ...(world.ruins || []), ...(world.camps || []), ...(world.caches || []), ...((world.titans && world.titans.list) || []), ...((world.secrets && world.secrets.list) || []), ...(pl ? [pl, pl.stead] : []), ...(world.characters || []).filter(c => c && c.x != null)].filter(p => p && typeof p.x === 'number');
      const nearThing = (x, y, r) => avoid.some(p => Math.abs(p.x - x) < r && Math.abs(p.y - y) < r);
      const big = [...(world.sites || []).filter(s => s.cat === 'delve'), ...((world.gates && world.gates.list) || []), ...(world.lairs || []), ...((world.titans && world.titans.list) || []), ...(world.camps || [])].filter(p => p && typeof p.x === 'number');
      const nearBig = (x, y, r) => big.some(p => Math.abs(p.x - x) < r && Math.abs(p.y - y) < r) || (pl && pl.x != null && Math.abs(pl.x - x) < 8 && Math.abs(pl.y - y) < 8);
      // ---- 1. the forests as they are
      let { comp, sizes, edge } = WW.components(world, inArea);
      // ---- 2. the deep woods: the greatest forests, far from any town
      const want = area ? (rng.chance(0.5) ? 1 : 0) : (world.size === 'vast' ? 3 : 2);
      const R0 = world.size === 'vast' ? 30 : 23;   // (how far a deep wood reaches from its heart)
      // how much room for a wood there is round a spot (and how much is wood already)
      const room = (cx, cy) => {
        let n = 0, f = 0;
        for (let y = Math.floor(cy - R0); y <= cy + R0; y += 2) for (let x = Math.floor(cx - R0); x <= cx + R0; x += 2) {
          if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1 || U.dist(x, y, cx, cy) > R0) continue;
          const t = tiles[y * W + x];
          if (t === X.GRASS) n++; else if (WW.isForest(t)) { n++; f++; }
        }
        return { n: n * 4, f: f * 4 };
      };
      const area0 = Math.PI * R0 * R0;
      const cands = [];
      const consider = (x, y, bonus) => {
        if (nearTown(x, y, 18) || nearBig(x, y, 8)) return;
        const r = room(x, y);
        if (r.n < area0 * 0.34) return;
        cands.push({ x, y, sc: r.n + r.f * 0.8 + bonus });
      };
      for (let c = 0; c < sizes.length; c++) {
        if (sizes[c] < 120) continue;
        let best = -1, bd = -1;
        for (let i = 0; i < N; i++) if (comp[i] === c && (edge[i] > bd || (edge[i] === bd && hash2(i % W, (i / W) | 0, world.seed + 71) > 0.5))) { bd = edge[i]; best = i; }
        consider(best % W + 0.5, ((best / W) | 0) + 0.5, 40 + bd * 6);
      }
      const ax0 = area ? area.x0 : 0, ay0 = area ? area.y0 : 0, ax1 = area ? area.x1 : W, ay1 = area ? area.y1 : H;
      for (let k = 0; k < 500; k++) {
        const x = ax0 + R0 + rng.next() * Math.max(1, ax1 - ax0 - 2 * R0), y = ay0 + R0 + rng.next() * Math.max(1, ay1 - ay0 - 2 * R0);
        if (WW.isForest(Wd().tile(world, x, y)) || Wd().tile(world, x, y) === X.GRASS) consider(x, y, 0);
      }
      cands.sort((a, b) => b.sc - a.sc);
      const hubs = [];
      const gap = world.size === 'vast' ? 64 : 46;
      for (const h of cands) { if (hubs.length >= want) break; if (hubs.some(o => U.dist(o.x, o.y, h.x, h.y) < gap) || S.woods.some(o => U.dist(o.x, o.y, h.x, h.y) < gap)) continue; hubs.push(h); }
      // grow them thick: the meadows round the heart go to wood
      for (const h of hubs) {
        const r = R0;
        for (let y = Math.floor(h.y - r); y <= Math.ceil(h.y + r); y++) for (let x = Math.floor(h.x - r); x <= Math.ceil(h.x + r); x++) {
          if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
          const d = U.dist(x + 0.5, y + 0.5, h.x, h.y) / r, wob = (hash2(x >> 1, y >> 1, world.seed + 77) - 0.5) * 0.35;
          if (d + wob > 1) continue;
          const i = y * W + x, t = tiles[i];
          if (t !== X.GRASS && t !== X.FOREST && t !== X.TREE) continue;
          if (nearTown(x, y, 11) || nearThing(x, y, 4) || world.blocked[i]) continue;
          let road = false; for (let yy = y - 1; yy <= y + 1 && !road; yy++) for (let xx = x - 1; xx <= x + 1; xx++) { const tt = tiles[yy * W + xx]; if (tt === X.ROAD || tt === X.BRIDGE || tt === X.FARM || tt === X.PLAZA) { road = true; break; } }
          if (road) continue;
          tiles[i] = hash2(x, y, world.seed + 78) < 0.44 ? X.TREE : X.FOREST;
        }
      }
      if (hubs.length) ({ comp, sizes, edge } = WW.components(world, inArea));
      const woods = [];
      for (const h of hubs) {
        const hi = Math.floor(h.y) * W + Math.floor(h.x), c = comp[hi];
        if (c < 0) continue;
        const r = R0 * 1.15, rows = new Set();
        // the wood itself: its forest round the heart, short of the outermost trees
        const q = [hi], seen = new Set([hi]);
        while (q.length) {
          const i = q.pop(), x = i % W, y = (i / W) | 0;
          if (edge[i] >= 2 && !nearTown(x + 0.5, y + 0.5, 13)) rows.add(i);
          for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const xx = x + ax, yy = y + ay; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const k = yy * W + xx;
            if (seen.has(k) || comp[k] !== c || U.dist(xx + 0.5, yy + 0.5, h.x, h.y) > r) continue;
            seen.add(k); q.push(k);
          }
        }
        if (rows.size < 60) continue;
        // its heart: a clearing in the dark
        const clear = new Set();
        for (let y = Math.floor(h.y - 4); y <= Math.ceil(h.y + 4); y++) for (let x = Math.floor(h.x - 4); x <= Math.ceil(h.x + 4); x++) {
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          if (U.dist(x + 0.5, y + 0.5, h.x, h.y) > 3.6) continue;
          const i = y * W + x; if (!WW.isForest(tiles[i])) continue;
          tiles[i] = X.FOREST; clear.add(i); rows.add(i);
        }
        const n = S.woods.length + woods.length;
        const used = new Set(S.woods.map(w => w.name).concat(woods.map(w => w.name)));
        const nm = NAMES.filter(x => !used.has(x))[rng.int(0, NAMES.filter(x => !used.has(x)).length - 1)] || NAMES[n % NAMES.length];
        const L = LORDS[n % LORDS.length];
        woods.push({ id: 'ww' + n, name: nm, x: h.x, y: h.y, r, c, rows: WW.toRows(world, rows), clear: WW.toRows(world, clear), lord: { name: L.name, title: L.title, slain: null, kills: 0 }, caches: [], _set: rows });
      }
      // ---- 3. trails, through every forest of any size
      const trail = new Set();
      for (let c = 0; c < sizes.length; c++) {
        if (sizes[c] < 36) continue;
        const wood = woods.find(w => w.c === c);
        // its deepest point (or its heart)
        let hub = -1, bd = -1;
        if (wood) hub = Math.floor(wood.y) * W + Math.floor(wood.x);
        else for (let i = 0; i < N; i++) if (comp[i] === c && edge[i] > bd) { bd = edge[i]; hub = i; }
        if (hub < 0) continue;
        // ways in: tiles at its edge beside open land (by a road first), well spread
        const doors = [];
        for (let i = 0; i < N; i++) {
          if (comp[i] !== c || edge[i] !== 1) continue;
          const x = i % W, y = (i / W) | 0; let open = 0, road = 0;
          for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const t = Wd().tile(world, x + ax, y + ay); if (t === X.ROAD || t === X.BRIDGE) road++; else if (t === X.GRASS || t === X.FARM || t === X.SAND || t === X.HILL || t === X.SNOW || t === X.PLAZA || t === X.RUIN) open++; }
          if (open || road) doors.push({ i, x, y, road });
        }
        if (!doors.length) continue;
        const k = U.clamp(Math.round(sizes[c] / 140), 1, wood ? 5 : 4) + (wood ? 1 : 0);
        const pick = [];
        const roadside = doors.filter(d => d.road);
        pick.push(roadside.length ? roadside[rng.int(0, roadside.length - 1)] : doors[rng.int(0, doors.length - 1)]);
        while (pick.length < Math.min(k, doors.length)) {
          let far = null, fd = -1;
          for (let s = 0; s < Math.min(doors.length, 300); s++) { const d = doors[(s * 7919 + pick.length * 31) % doors.length]; const m = Math.min(...pick.map(p => Math.abs(p.x - d.x) + Math.abs(p.y - d.y))); if (m > fd) { fd = m; far = d; } }
          if (!far || fd < 6) break;
          pick.push(far);
        }
        const hx = hub % W, hy = (hub / W) | 0;
        for (const d of pick) {
          const path = Wd().findPath(world, d.x, d.y, hx, hy, (x, y, i) => {
            if (comp[i] !== c) return Infinity;
            if (trail.has(i)) return 0.45;                           // (join a trail already worn)
            return 1 + hash2(x >> 1, y >> 1, world.seed + 91) * 1.6 + (tiles[i] === X.TREE ? 0.2 : 0);
          }, 40000);
          if (path) for (const i of path) trail.add(i);
        }
      }
      // clear the trees off them, and a little to either side here and there
      for (const i of trail) {
        if (tiles[i] === X.TREE) tiles[i] = X.FOREST;
        const x = i % W, y = (i / W) | 0;
        for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = (y + ay) * W + x + ax; if (tiles[k] === X.TREE && hash2(x + ax, y + ay, world.seed + 93) < 0.3) tiles[k] = X.FOREST; }
      }
      S.trails = S.trails.concat(WW.toRows(world, trail));
      // ---- 4. along the trails of the deep woods: what those before you left
      for (const w of woods) {
        const along = [...trail].filter(i => w._set.has(i));
        for (let k = 0; k < 4 && along.length; k++) {
          const i = along[rng.int(0, along.length - 1)], x = i % W, y = (i / W) | 0;
          if (U.dist(x, y, w.x, w.y) < 5 || w.caches.some(c => U.dist(c.x, c.y, x, y) < 7)) continue;
          // a step off the trail
          for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const xx = x + ax, yy = y + ay, j = yy * W + xx;
            if (!WW.isForest(tiles[j]) || trail.has(j)) continue;
            tiles[j] = X.FOREST;
            w.caches.push({ id: w.id + 'c' + k, x: xx + 0.5, y: yy + 0.5, kind: ['bones', 'camp', 'cage', 'bones'][k], opened: false });
            break;
          }
        }
        delete w._set; delete w.c;
        S.woods.push(w);
      }
      world._tileEpoch = (world._tileEpoch || 0) + 1;
      WW.index(world);
      return S;
    },
    // the forests: their pieces, sizes and how far each tile is from the edge
    components(world, inArea) {
      const W = world.W, H = world.H, N = W * H, tiles = world.tiles;
      const comp = new Int32Array(N).fill(-1), sizes = [], edge = new Int16Array(N);
      for (let i = 0; i < N; i++) {
        if (comp[i] >= 0 || !WW.isForest(tiles[i]) || !inArea(i)) continue;
        const id = sizes.length; let n = 0; const q = [i]; comp[i] = id;
        while (q.length) {
          const j = q.pop(); n++;
          const x = j % W, y = (j / W) | 0;
          for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const xx = x + ax, yy = y + ay; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const k = yy * W + xx;
            if (comp[k] < 0 && WW.isForest(tiles[k]) && inArea(k)) { comp[k] = id; q.push(k); }
          }
        }
        sizes.push(n);
      }
      // distance in from the edge (1 = an edge tile)
      let q = [];
      for (let i = 0; i < N; i++) {
        if (comp[i] < 0) continue;
        const x = i % W, y = (i / W) | 0;
        let e = false;
        for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + ax, yy = y + ay; if (xx < 0 || yy < 0 || xx >= W || yy >= H || comp[yy * W + xx] < 0) { e = true; break; } }
        if (e) { edge[i] = 1; q.push(i); }
      }
      for (let h = 0; h < q.length; h++) {
        const i = q[h], x = i % W, y = (i / W) | 0;
        for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + ax, yy = y + ay; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const k = yy * W + xx;
          if (comp[k] >= 0 && !edge[k]) { edge[k] = edge[i] + 1; q.push(k); }
        }
      }
      return { comp, sizes, edge };
    },
    // new land from the frontier: its own trails, and perhaps a deep wood
    grow(world, R) {
      if (!world.wild) return WW.ensure(world);
      WW.build(world, R);
    },

    // ------------------------------------------------------------ reading them
    trailAt(world, x, y) { const t = world._trail; if (!t) return 0; x = Math.floor(x); y = Math.floor(y); if (x < 0 || y < 0 || x >= world.W || y >= world.H) return 0; return t[y * world.W + x]; },
    tierAt(world, x, y) { const t = world._wd; if (!t) return 0; x = Math.floor(x); y = Math.floor(y); if (x < 0 || y < 0 || x >= world.W || y >= world.H) return 0; return t[y * world.W + x]; },
    woodAt(world, x, y) {
      const t = world._wdi; if (!t || !world.wild) return null;
      x = Math.floor(x); y = Math.floor(y); if (x < 0 || y < 0 || x >= world.W || y >= world.H) return null;
      const n = t[y * world.W + x]; return n >= 0 ? world.wild.woods[n] : null;
    },
    // how near the nearest deep wood is (0 inside its heart, growing outward)
    nearest(world, x, y) {
      let best = null, bd = 1e9;
      for (const w of (world.wild && world.wild.woods) || []) { const d = U.dist(x, y, w.x, w.y) - w.r; if (d < bd) { bd = d; best = w; } }
      return best ? { wood: best, d: bd } : null;
    },
    // how strong what lives there is: deadly, always, and worse the deeper
    era(world) { return ECHO.Powers ? ECHO.Powers.era(world, ECHO.Powers.plLv(world)) : (world.player && ECHO.Prowess ? ECHO.Prowess.level(world.player) : 1); },
    level(world, tier) {
      const e = WW.era(world);
      const L = tier >= 4 ? Math.max(480, e * 2.4) : tier === 3 ? Math.max(300, e * 1.8) : tier === 2 ? Math.max(150, e * 1.3) : Math.max(70, e * 0.9);
      return Math.min(1500, Math.round(L));
    },
    lordAlive(world, w) { return !(w.lord.slain != null && world.day - w.lord.slain < 20); },

    // ------------------------------------------------------------ every day
    dailyTick(world, rng) {
      const S = world.wild;
      if (!S) return;
      for (const w of S.woods) {
        if (w.lord.slain != null && world.day - w.lord.slain === 20 && ECHO.Chronicle) ECHO.Chronicle.add(world, { text: `Woodsmen say the hunting horn is heard again in ${w.name} at night. ${U.cap(w.lord.name)} has come back to its heart.`, kind: 'nature', importance: 2, x: w.x, y: w.y });
        // the caches fill again, in time, with what the next fools carried
        for (const c of w.caches) if (c.opened && world.day - c.opened > 30 && rng.chance(0.05)) c.opened = false;
        // and now and then the wood takes someone who went too near
        if (rng.chance(0.02)) {
          const s = Wd().nearestSettlement(world, w.x, w.y);
          if (s && U.dist(s.x, s.y, w.x, w.y) < 60) {
            const res = (s.residents || []).map(id => world.npcs[id]).filter(n => n && n.status === 'alive' && ['hunter', 'woodcutter', 'herbalist', 'wanderer'].includes(n.prof));
            if (res.length) {
              const n = res[rng.int(0, res.length - 1)];
              ECHO.People.kill(world, n, `lost in ${w.name}`, null, null);
              if (ECHO.Chronicle) ECHO.Chronicle.add(world, { text: `${ECHO.People.name(n)} of ${s.name} went into ${w.name} after ${n.prof === 'hunter' ? 'a white stag' : n.prof === 'woodcutter' ? 'old timber' : n.prof === 'herbalist' ? 'nightcap mushrooms' : 'something they heard calling'} and did not come out.`, kind: 'nature', importance: 1, sid: s.id, npcs: [n.id] });
            }
          }
        }
      }
    }
  };
})();
