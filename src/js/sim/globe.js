// The world is round.
//
// Every world is a globe, 2,880 tiles around the middle and 1,440 from pole to
// pole — a hundred times the old island. It has no edge: walk (or sail, or fly)
// far enough east and you come back from the west; walk over the top of the world
// and you come down its far side. Only what someone has come near is made: the
// rest is uncharted, and the land is raised a stretch at a time (a "cell", about
// a hundred tiles a side) as you travel toward it — its ground, its rivers, its
// regions with names, villages with their people, beasts, ruins and deep places —
// so a world costs nothing for the parts of it no one has seen.
//
// The ground is one piece everywhere: the same noise the old island's far lands
// were drawn from. North of the old island the cold comes on fast and it is the
// Frozen Crown to the pole; to the south the land dries; past the middle of the
// world it cools again toward the southern ice. Both poles are sheets of ice you
// can walk across. Opposite the old island, on the far side of the globe, lies the
// World-Sea, with two long strands of sand running across it.
//
// An old save is moved onto the globe once (everything on it shifts together, as
// when the land used to grow west or north) and keeps everything it had.
(function () {
  const { U, RNG, hash2 } = ECHO;
  const TT = () => ECHO.TILE, Wd = () => ECHO.World, Fr = () => ECHO.Frontier;
  const DIRS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];

  const Gl = ECHO.Globe = {
    P: 2880, HG: 1440, C: 96, NEAR: 120, SEAM: 110,

    on(world) { return !!(world && world.globe); },
    wrapX(world, x) { const P = world.W; return ((x % P) + P) % P; },
    // the short way round from a to b, east positive
    dx(world, a, b) { let d = b - a; if (!world.globe) return d; const P = world.W; d = ((d % P) + P) % P; return d > P / 2 ? d - P : d; },
    dist(world, ax, ay, bx, by) { return Math.hypot(Gl.dx(world, ax, bx), by - ay); },
    // latitude and longitude, for the map (the old island near 25°N, 0°)
    latLon(world, x, y) {
      const G = world.globe; if (!G) return null;
      const lat = 90 - (y / G.HG) * 180, cx = (G.old.x0 + G.old.x1) / 2;
      const lon = Gl.dx(world, cx, x) / G.P * 360;
      return { lat, lon };
    },
    fmtLatLon(world, x, y) {
      const p = Gl.latLon(world, x, y); if (!p) return '';
      return `${Math.abs(Math.round(p.lat))}°${p.lat >= 0 ? 'N' : 'S'} ${Math.abs(Math.round(p.lon))}°${p.lon >= 0 ? 'E' : 'W'}`;
    },

    // ------------------------------------------------------------ onto the globe
    ensure(world, opts = {}) {
      if (!world || !world.tiles || world.globe) return world && world.globe;
      const P = opts.P || Gl.P, HG = opts.HG || Gl.HG, C = opts.C || Gl.C;
      const W0 = world.W, H0 = world.H;
      if (W0 > P - 256 || H0 > HG - 192) return null;
      // whatever the old world places lazily is placed now, on the old land
      if (ECHO.Explore) ECHO.Explore.sites(world);
      if (ECHO.Secrets && ECHO.Secrets.ensure) ECHO.Secrets.ensure(world);
      if (ECHO.Gates && ECHO.Gates.ensure) ECHO.Gates.ensure(world);
      if (ECHO.Titans && ECHO.Titans.ensure) ECHO.Titans.ensure(world);
      if (ECHO.Discover && ECHO.Discover.ensure) ECHO.Discover.ensure(world);
      const F = Fr().state(world);
      // the old island in the middle of the map, a quarter of the way down from the north pole
      const icx = F.ox + F.W0 / 2, icy = F.oy + F.H0 / 2;
      const r16 = v => Math.round(v / 16) * 16, f16 = v => Math.floor(v / 16) * 16;
      const gx = U.clamp(r16(P / 2 - icx), 128, f16(P - 128 - W0));
      const gy = U.clamp(r16(HG * 0.36 - icy), 96, f16(HG - 96 - H0));
      Gl.relocate(world, gx, gy, P, HG);
      const old = { x0: gx, y0: gy, x1: gx + W0, y1: gy + H0 };
      const xs = Gl.bounds(old.x0, old.x1, P, C), ys = Gl.bounds(old.y0, old.y1, HG, C);
      const nx = xs.length - 1, ny = ys.length - 1, made = new Array(nx * ny).fill(0);
      for (let cy = 0; cy < ny; cy++) for (let cx = 0; cx < nx; cx++) if (xs[cx] >= old.x0 && xs[cx + 1] <= old.x1 && ys[cy] >= old.y0 && ys[cy + 1] <= old.y1) made[cy * nx + cx] = 1;
      world.globe = { v: 1, P, HG, C, xs, ys, made, old, bridged: {}, n: 0 };
      // the old shores, where the land never grew, shallow toward the new country
      for (const side of ['e', 'w', 'n', 's']) {
        if (F.sides[side]) { world.globe.bridged[side] = 1; continue; }
        Fr().blend(world, side);
      }
      Wd().rebuildBlocked(world);
      world._tileEpoch = (world._tileEpoch || 0) + 1;
      if (ECHO.Chronicle) ECHO.Chronicle.add(world, { text: `The navigators of ${world.name} agreed at last that the world is round, and that the known lands are a small part of it.`, kind: 'era', importance: 2, x: icx + gx, y: icy + gy });
      return world.globe;
    },
    // Move the whole map to (dx, dy) on a bigger one (as the old land growth did).
    relocate(world, dx, dy, W1, H1) {
      const F = Fr().state(world), W0 = world.W, H0 = world.H;
      for (const k of Object.keys(world)) if (k[0] === '_' && world[k] && typeof world[k] === 'object') delete world[k];
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
      const tiles = new Uint8Array(W1 * H1);
      for (let y = 0; y < H0; y++) tiles.set(world.tiles.subarray(y * W0, (y + 1) * W0), (y + dy) * W1 + dx);
      Fr().shift(world, dx, dy);
      for (const r of world.regions) { r.x0 += dx; r.x1 += dx; r.y0 += dy; r.y1 += dy; }
      world.W = W1; world.H = H1; world.tiles = tiles;
      F.ox += dx; F.oy += dy;
    },
    // cell edges along one axis: the old land is one cell, the rest about C apart
    bounds(a, b, N, C) {
      const out = new Set([0, a, b, N]);
      for (let x = a - C; x > C / 2; x -= C) out.add(x);
      for (let x = b + C; x < N - C / 2; x += C) out.add(x);
      return [...out].sort((p, q) => p - q);
    },
    find(arr, v) { let lo = 0, hi = arr.length - 2; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (arr[m] <= v) lo = m; else hi = m - 1; } return lo; },
    cellAt(world, x, y) {
      const G = world.globe; if (!G) return -1;
      const cx = Gl.find(G.xs, Gl.wrapX(world, Math.floor(x))), cy = Gl.find(G.ys, U.clamp(Math.floor(y), 0, G.HG - 1));
      return cy * (G.xs.length - 1) + cx;
    },
    rect(world, ci) { const G = world.globe, nx = G.xs.length - 1, cx = ci % nx, cy = (ci / nx) | 0; return { x0: G.xs[cx], x1: G.xs[cx + 1], y0: G.ys[cy], y1: G.ys[cy + 1] }; },
    made(world, x, y) { const G = world.globe; return !G || !!G.made[Gl.cellAt(world, x, y)]; },
    // the cells within r of (x, y) that have not been made yet
    unmade(world, x, y, r) {
      const G = world.globe, out = new Set();
      if (!G) return [];
      for (let yy = Math.max(0, y - r); yy <= Math.min(G.HG - 1, y + r); yy += 16) for (let xx = x - r; xx <= x + r; xx += 16) {
        const ci = Gl.cellAt(world, xx, yy); if (!G.made[ci]) out.add(ci);
      }
      for (const [xx, yy] of [[x - r, y - r], [x + r, y - r], [x - r, y + r], [x + r, y + r], [x, Math.max(0, y - r)], [x, Math.min(G.HG - 1, y + r)]]) { const ci = Gl.cellAt(world, xx, U.clamp(yy, 0, G.HG - 1)); if (!G.made[ci]) out.add(ci); }
      return [...out];
    },
    // somewhere at random on land that has been made (for things placed by chance)
    spot(world, rng, lx, hx, ly, hy) {
      const G = world.globe;
      if (!G) return { x: rng.int(lx, world.W - hx), y: rng.int(ly, world.H - hy) };
      let L = world._spots;
      const nMade = G.made.reduce((a, b) => a + b, 0);
      if (!L || L.n !== nMade) {
        L = world._spots = { n: nMade, list: [], tot: 0 };
        G.made.forEach((m, ci) => { if (!m) return; const R = Gl.rect(world, ci), a = (R.x1 - R.x0) * (R.y1 - R.y0); L.tot += a; L.list.push([L.tot, R]); });
      }
      const r = rng.next() * L.tot;
      let R = L.list[L.list.length - 1][1];
      for (const [c, Rc] of L.list) if (r < c) { R = Rc; break; }
      return { x: U.clamp(rng.int(R.x0, R.x1 - 1), lx, world.W - hx), y: U.clamp(rng.int(R.y0, R.y1 - 1), ly, world.H - hy) };
    },

    // ------------------------------------------------------------ the ground of the globe
    tileAt(world, x, y) {
      const T = TT(), G = world.globe, F = world.frontier, nz = Fr().noise(world);
      const xo = x - F.ox, yo = y - F.oy;
      let e = Fr().elevInf(world, xo, yo);
      // the World-Sea, opposite the old island
      const ds = Math.min(x, G.P - x), S = Gl.SEAM;
      if (ds < S) { const k = U.clamp(1 - (ds - 30) / (S - 30), 0, 1); e -= 0.75 * k * k * (3 - 2 * k); }
      let t = Fr().classify(world, e, xo, yo);
      // the far south cools toward its own ice
      const sp = (y - G.HG * 0.7) / (G.HG * 0.2);
      if (sp > 0 && t !== T.DEEP && t !== T.WATER && t !== T.ROCK) {
        if (t === T.SAND && e > 0.34) t = T.GRASS;
        const kk = U.clamp(sp, 0, 0.85);
        if (t === T.HILL || (t !== T.TREE && nz.cl(xo / 17 + 9, yo / 17 + 9) < 0.2 + kk * 0.6)) t = T.SNOW;
      }
      // the poles: sheets of ice over land and sea alike, broken pack ice round them
      const dp = Math.min(y, G.HG - 1 - y);
      if (dp < 44) { if (t !== T.ROCK) t = T.SNOW; }
      else if (dp < 90) {
        if ((t === T.DEEP || t === T.WATER) && nz.cl(x / 9 + 3, y / 9 + 3) < (90 - dp) / 46 * 0.75) t = T.SNOW;
        else if ((t === T.TREE || t === T.FOREST || t === T.GRASS) && dp < 66) t = T.SNOW;
      }
      // two strands of sand run across the World-Sea
      if (ds < S + 12 && (t === T.DEEP || t === T.WATER)) {
        for (const row of [0.36, 0.6]) {
          const a = x / G.P * Math.PI * 2, yc = G.HG * row + Math.sin(a * 20) * 6 + Math.sin(a * 62) * 1.6;   // (whole waves round the world, so they meet themselves)
          const w = 1.3 + (hash2(x, 7, world.seed) - 0.5) * 0.8;
          if (Math.abs(y - yc) < w) { t = hash2(x, y, world.seed + 5) < 0.12 ? T.GRASS : T.SAND; break; }
          if (Math.abs(y - yc) < w + 1.6 && t === T.DEEP) { t = T.WATER; break; }
        }
      }
      return t;
    },

    // ------------------------------------------------------------ making the land
    make(world, cells) {
      const G = world.globe, F = Fr().state(world);
      if (!G || !cells.length) return null;
      cells = cells.filter(ci => !G.made[ci]);
      if (!cells.length) return null;
      const dirty = world._hcDirty || [], mdirty = world._mapDirty || [];
      delete world._landCells;
      for (const k of Object.keys(world)) if (k[0] === '_' && world[k] && typeof world[k] === 'object') delete world[k];
      const W = world.W, rects = cells.map(ci => ({ ci, R: Gl.rect(world, ci) }));
      // 1. the ground of all of them first, so each sees its neighbours
      for (const { R } of rects) for (let y = R.y0; y < R.y1; y++) for (let x = R.x0; x < R.x1; x++) world.tiles[y * W + x] = Gl.tileAt(world, x, y);
      for (const { ci } of rects) G.made[ci] = 1;
      for (const { ci, R } of rects) Fr().rivers(world, R, new RNG(ECHO.hashStr('globe-r:' + world.seed + ':' + ci)));
      Wd().rebuildBlocked(world);
      // 2. who and what lives there
      const allRegions = [], allTowns = [];
      const ic = { x: (G.old.x0 + G.old.x1) / 2, y: (G.old.y0 + G.old.y1) / 2 };
      for (const { ci, R } of rects) {
        const rng = new RNG(ECHO.hashStr('globe:' + world.seed + ':' + ci));
        const dxx = Gl.dx(world, ic.x, (R.x0 + R.x1) / 2), dyy = (R.y0 + R.y1) / 2 - ic.y;
        const side = Math.abs(dxx) > Math.abs(dyy) ? (dxx > 0 ? 'e' : 'w') : (dyy > 0 ? 's' : 'n');
        let land = 0;
        for (let y = R.y0; y < R.y1; y += 3) for (let x = R.x0; x < R.x1; x += 3) { const t = world.tiles[y * W + x]; if (t !== TT().DEEP && t !== TT().WATER) land++; }
        const big = (R.x1 - R.x0) * (R.y1 - R.y0) / 9;
        if (land < big * 0.04) { F.n++; continue; }                // open sea: nothing to found
        const regions = Fr().regions(world, R, side === 'e' || side === 'w' ? 'n' : side, rng);
        const towns = Fr().towns(world, R, rng);
        Fr().wilds(world, R, towns, regions, rng);
        for (const r of regions) if (ECHO.Ecology && ECHO.Ecology.initRegion) ECHO.Ecology.initRegion(world, r, rng);
        if (ECHO.Wildwood && world.wild) ECHO.Wildwood.grow(world, R);
        F.n++;
        F.lands.push({ n: F.n, side, day: world.day, regions: regions.map(r => r.id), towns: towns.map(t => t.id), cell: ci });
        allRegions.push(...regions); allTowns.push(...towns);
      }
      Wd().rebuildBlocked(world);
      world._tileEpoch = (world._tileEpoch || 0) + 1;
      world._hcDirty = dirty.concat(rects.map(r => r.R));          // (the renderer redraws the heights of only these,
      world._mapDirty = mdirty.concat(rects.map(r => r.R));        //  and the chart repaints only these)
      G.n = (G.n || 0) + cells.length;
      if (ECHO.Chronicle && (allRegions.length || allTowns.length)) {
        const c = allTowns[0] || allRegions[0];
        const a = Math.atan2((c.y != null ? c.y : (c.y0 + c.y1) / 2) - ic.y, Gl.dx(world, ic.x, c.x != null ? c.x : (c.x0 + c.x1) / 2)), dir = DIRS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
        ECHO.Chronicle.add(world, { text: `Travellers brought word of country far to the ${dir}: ${allRegions.slice(0, 3).map(r => r.name).join(', ')}${allTowns.length ? `, and the villages of ${allTowns.map(t => t.name).join(', ')}` : ''}.`, kind: 'era', importance: 2, x: c.x != null ? c.x : (c.x0 + c.x1) / 2, y: c.y != null ? c.y : (c.y0 + c.y1) / 2 });
      }
      if (ECHO.Realm && ECHO.Realm.reshaped) ECHO.Realm.reshaped(world);
      return { regions: allRegions.map(r => r.name), towns: allTowns.map(t => t.name) };
    },
    // the old island's last shore, the sea before you, and land past it: a sandbar across
    bridge(world, pe) {
      const G = world.globe, T = TT(), O = G.old;
      if (pe.x < O.x0 || pe.x >= O.x1 || pe.y < O.y0 || pe.y >= O.y1) return null;
      const px = Math.floor(pe.x), py = Math.floor(pe.y);
      for (const side of ['e', 'w', 'n', 's']) {
        if (G.bridged[side]) continue;
        const ux = side === 'e' ? 1 : side === 'w' ? -1 : 0, uy = side === 's' ? 1 : side === 'n' ? -1 : 0;
        const edge = side === 'e' ? O.x1 - px : side === 'w' ? px - O.x0 : side === 'n' ? py - O.y0 : O.y1 - py;
        if (edge > 95) continue;
        let shore = false;
        for (let k = 1; k <= 9 && !shore; k++) { const t = Wd().tile(world, px + ux * k, py + uy * k); if (t === T.WATER || t === T.DEEP) shore = true; }
        if (!shore) continue;
        let far = null;
        for (let k = 12; k < 200 && !far; k++) {
          const x = px + ux * k, y = py + uy * k, t = Wd().tile(world, x, y);
          if (t !== T.WATER && t !== T.DEEP) { if (x < O.x0 || x >= O.x1 || y < O.y0 || y >= O.y1) far = { x, y }; else break; }
        }
        if (!far) continue;
        const R = side === 'e' ? { x0: O.x1, x1: O.x1 + 96, y0: Math.max(0, py - 60), y1: Math.min(G.HG, py + 60) } : side === 'w' ? { x0: O.x0 - 96, x1: O.x0, y0: Math.max(0, py - 60), y1: Math.min(G.HG, py + 60) }
          : side === 'n' ? { x0: px - 60, x1: px + 60, y0: O.y0 - 96, y1: O.y0 } : { x0: px - 60, x1: px + 60, y0: O.y1, y1: O.y1 + 96 };
        const n = Fr().causeway(world, side, R, { x: pe.x, y: pe.y });
        G.bridged[side] = 1;
        if (n) {
          Wd().rebuildBlocked(world); world._tileEpoch = (world._tileEpoch || 0) + 1;
          (world._mapDirty = world._mapDirty || []).push({ x0: Math.min(px, R.x0) - 4, x1: Math.max(px, R.x1) + 4, y0: Math.min(py, R.y0) - 4, y1: Math.max(py, R.y1) + 4 });
          const R3 = ECHO.Renderer3D;
          if (R3 && R3.world === world && R3.hc) { R3.buildHeights(world, { x0: Math.min(px, R.x0) - 4, x1: Math.max(px, R.x1) + 4, y0: Math.min(py, R.y0) - 4, y1: Math.max(py, R.y1) + 4 }); R3.buildWater(world); }
          return { side, n };
        }
      }
      return null;
    },

    // ------------------------------------------------------------ while you play
    tick(game, dt) {
      Gl._t = (Gl._t || 0) + dt;
      if (Gl.busy) return;
      const w = game.world, pe = game.pe, pl = game.pl;
      if (!w || !w.globe || !pe || ECHO.Interior.cur || game.ff || pe.dead || pe.inBoat === 'ferry') return;
      // round the world: off one side of the map and onto the other
      const flying = !!pl.flying;
      if (pe.x < 0 || pe.x >= w.W) return Gl.cross(game, Gl.wrapX(w, pe.x), pe.y, null);
      // over the pole and down its far side
      const lim = flying ? 3.4 : 0.9, now = performance.now();
      if (now - (Gl._poleAt || 0) > 5000 && (pe.y < lim || pe.y > w.H - lim)) {
        Gl._poleAt = now;
        const north = pe.y < lim;
        Gl.cross(game, Gl.wrapX(w, pe.x + w.W / 2), north ? lim + 2.2 : w.H - lim - 2.2, north
          ? 'You have walked over the top of the world, and are coming down its far side: every way from here is south.'
          : 'You have crossed the bottom of the world, and are coming up its far side: every way from here is north.', north);
        // keep going the way you were going: while you hold the keys, they carry you on, not back
        Gl.flip = true; Gl.flipIdle = 0;
        return;
      }
      if (Gl._t < 0.8 || (ECHO.UI && ECHO.UI.screenOpen)) return;
      Gl._t = 0;
      // the old island's shore: a sandbar out to the new land
      const b = Gl.bridge(w, pe);
      if (b) game.ui.toast(`The tide has fallen far out: a sandbar runs from here across the water to the ${{ e: 'east', w: 'west', n: 'north', s: 'south' }[b.side]}.`, 'legend', 7);
      // land not yet made, coming within sight
      const need = Gl.unmade(w, Math.floor(pe.x), Math.floor(pe.y), Gl.NEAR);
      if (need.length) {
        // the nearest first, two at a time, so the world never stops for long
        const px = pe.x, py = pe.y, d = ci => { const R = Gl.rect(w, ci); return Math.hypot(Gl.dx(w, px, (R.x0 + R.x1) / 2), (R.y0 + R.y1) / 2 - py); };
        Gl.go(game, need.sort((a, b) => d(a) - d(b)).slice(0, 2));
      }
    },
    go(game, cells) {
      Gl.busy = true;
      setTimeout(() => {
        try {
          const w = game.world, pl = game.pl, pe = game.pe;
          if (ECHO.Interior.cur || !w.globe) return;
          const t0 = performance.now();
          const info = Gl.make(w, cells);
          if (!info) return;
          Gl.refresh(game);
          void pe;
          if (info.towns.length) game.ui.toast(`New country ahead: ${info.regions.slice(0, 3).join(', ')}. Villages: ${info.towns.join(', ')}.`, 'legend', 8);
          Gl.lastMs = Math.round(performance.now() - t0);
          void pl;
        } catch (err) { console.error('ECHO: the land could not be made', err); for (const ci of cells) if (game.world.globe) game.world.globe.made[ci] = 1; }
        finally { Gl.busy = false; }
      }, 30);
    },
    // new land made while you play: the game takes it in where it stands, without starting over
    refresh(game) {
      const w = game.world, R3 = ECHO.Renderer3D;
      if (ECHO.Wildwood) ECHO.Wildwood.ensure(w);
      if (R3 && R3.world === w && R3.hc) {
        for (const r of w._hcDirty || []) R3.buildHeights(w, r);
        w._hcDirty = null;
        R3.buildWater(w); R3.sitesT = 0;
      }
      if (ECHO.Explore) ECHO.Explore.sites(w);
      if (ECHO.UI) ECHO.UI.mapDirty = true;
      if (ECHO.WorldMap) ECHO.WorldMap._mf = null;
    },
    // start the world again with you at (x, y), in your boat or on your dragon if you were
    restart(game, x, y) {
      const w = game.world, pl = game.pl, pe = game.pe, A = ECHO.Apex;
      const boat = pe.inBoat === true && pl.boat;
      const F = pl.flying && A && A.fly ? { id: pl.flying, dir: A.fly.dir, v: A.fly.v, h: A.fly.h, z: A.fly.z, alt: pe.alt } : null;
      pl.x = x; pl.y = y; pl.hp = pe.hp;
      if (boat) { pl.boat.x = x; pl.boat.y = y; pl.boat.dir = pe.dir || 0; }
      game.start(w);
      if (boat && ECHO.Boats) ECHO.Boats.board(game);
      if (F && A) {
        const t = ECHO.Titans.byId(w, F.id), e = t && A.spawnTamed(game, t, true);
        if (e) {
          e.x = game.pe.x; e.y = game.pe.y; A.mount(game, e);
          if (A.fly) { A.fly.phase = 'fly'; A.fly.t = 2; A.fly.dir = F.dir; A.fly.v = F.v; A.fly.vx = Math.cos(F.dir) * F.v; A.fly.vy = Math.sin(F.dir) * F.v; A.fly.h = F.h; A.fly.z = F.z; game.pe.alt = F.alt; }
        }
      }
    },
    cross(game, x, y, msg, north) {
      Gl.busy = true;
      try {
        const w = game.world;
        const need = Gl.unmade(w, Math.floor(x), Math.floor(y), Gl.NEAR);
        if (need.length) Gl.make(w, need);
        const In = ECHO.Input, held = In && In.down ? new Set(In.down) : null;   // (the keys still held carry you on)
        Gl.restart(game, x, y);
        if (held && In.down) for (const k of held) In.down.add(k);
        if (msg) { game.ui.toast(msg, 'legend', 7); game.ui.banner(north === false ? 'The bottom of the world' : 'The top of the world', Gl.fmtLatLon(w, x, y), true); }
      } catch (err) { console.error('ECHO: could not go round the world', err); }
      finally { Gl.busy = false; }
    }
  };
})();
