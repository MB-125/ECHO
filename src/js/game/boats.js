// Boats, ferries and currents.
//
// Rivers run to the sea, and you can feel it: a swimmer is carried
// downstream, faster in a narrow channel and faster still after heavy rain,
// and the ripples drift with the flow. Towns on the water keep a jetty, and a
// ferryman will row you (and your horse and companion) across to another
// town's jetty on the same water for a few crowns. Stables sell a rowboat of
// your own: it waits at the shore, you row it with the movement keys (it
// glides, and the current takes it if you stop), and you beach it wherever
// you step ashore.
(function () {
  const { U } = ECHO;
  const T = () => ECHO.TILE;
  const isW = t => t === T().WATER || t === T().DEEP;

  const B = ECHO.Boats = {
    _key: null, ferry: null,
    // ------------------------------------------------------------ the water's shape
    prepare(world) {
      const key = world.seed + '|' + (world._tileEpoch || 0) + '|' + world.W + 'x' + world.H;
      if (B._key === key) return;
      B._key = key;
      const W = world.W || 200, H = world.H || 150, N = W * H, tiles = world.tiles;
      // distance to the open sea through water, from every water tile
      const dist = new Int32Array(N).fill(-1), q = new Int32Array(N);
      let qh = 0, qt = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (tiles[i] === T().DEEP && (x === 0 || y === 0 || x === W - 1 || y === H - 1)) { dist[i] = 0; q[qt++] = i; }
      }
      while (qh < qt) {
        const c = q[qh++], cx = c % W, cy = (c / W) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const n = ny * W + nx; if (dist[n] >= 0 || !isW(tiles[n])) continue;
          dist[n] = dist[c] + 1; q[qt++] = n;
        }
      }
      // components of connected water, for ferries
      const comp = new Int32Array(N).fill(-1); let id = 0;
      for (let i = 0; i < N; i++) {
        if (comp[i] >= 0 || !isW(tiles[i])) continue;
        const st = [i]; comp[i] = id;
        while (st.length) { const c = st.pop(), cx = c % W, cy = (c / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const n = ny * W + nx; if (comp[n] < 0 && isW(tiles[n])) { comp[n] = id; st.push(n); } } }
        id++;
      }
      // the flow: toward the sea, strongest where the channel is narrow
      const fx = new Float32Array(N), fy = new Float32Array(N);
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        const i = y * W + x; if (!isW(tiles[i]) || dist[i] <= 0) continue;
        let vx = 0, vy = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = (y + dy) * W + x + dx; if (dist[n] >= 0 && dist[n] < dist[i]) { vx += dx; vy += dy; } }
        const L = Math.hypot(vx, vy); if (!L) continue;
        let wide = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (isW(ECHO.World.tile(world, x + dx, y + dy))) wide++;
        const k = U.clamp((22 - wide) / 14, 0, 1) * 1.3;    // a river runs; a lake barely moves
        fx[i] = vx / L * k; fy[i] = vy / L * k;
      }
      B.F = { W, H, fx, fy, comp };
      // jetties: each town on the water keeps one
      B.docks = [];
      for (const s of world.settlements) {
        let best = null, bd = Infinity;
        for (let dy = -14; dy <= 14; dy++) for (let dx = -14; dx <= 14; dx++) {
          const x = Math.floor(s.x) + dx, y = Math.floor(s.y) + dy;
          if (!isW(ECHO.World.tile(world, x, y))) continue;
          for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const lx = x + ox, ly = y + oy, lt = ECHO.World.tile(world, lx, ly);
            if (isW(lt) || ECHO.World.isSolid(world, lx + 0.5, ly + 0.5) || lt === T().BRIDGE) continue;
            const d = Math.hypot(dx, dy);
            if (d < bd) { bd = d; best = { sid: s.id, name: s.name, land: { x: lx + 0.5, y: ly + 0.5 }, water: { x: x + 0.5, y: y + 0.5 }, dir: Math.atan2(-oy, -ox), comp: comp[y * W + x] }; }
          }
        }
        if (best) B.docks.push(best);
      }
      // ferry crossings: only where the water route is reasonably direct (no rowing round half the coast)
      const cost = (x, y, i) => isW(tiles[i]) ? 1 : Infinity;
      for (const d of B.docks) {
        d.to = []; d.routes = {};
        const cands = B.docks.filter(o => o !== d && o.comp === d.comp && U.dist(o.water.x, o.water.y, d.water.x, d.water.y) > 10 && U.dist(o.water.x, o.water.y, d.water.x, d.water.y) < 90)
          .sort((a, b) => U.dist(a.water.x, a.water.y, d.water.x, d.water.y) - U.dist(b.water.x, b.water.y, d.water.x, d.water.y));
        for (const o of cands) {
          if (d.to.length >= 3) break;
          const straight = U.dist(o.water.x, o.water.y, d.water.x, d.water.y);
          const p = ECHO.World.findPath(world, d.water.x, d.water.y, o.water.x, o.water.y, cost, 30000);
          if (!p || p.length > straight * 1.7 + 15) continue;
          const pts = p.map(i => ({ x: (i % W) + 0.5, y: ((i / W) | 0) + 0.5 }));
          d.routes[o.sid] = pts.filter((q, i) => i === 0 || i === pts.length - 1 || i % 3 === 0);
          d.to.push(o);
        }
      }
    },
    flow(world, x, y) {
      if (x >= 9000) return { x: 0, y: 0 };
      B.prepare(world);
      const F = B.F, ix = Math.floor(x), iy = Math.floor(y);
      if (ix < 0 || iy < 0 || ix >= F.W || iy >= F.H) return { x: 0, y: 0 };
      const i = iy * F.W + ix, swell = ECHO.Climate && ECHO.Climate.swollen(world, x, y) ? 1.8 : 1;
      if (ECHO.Climate && ECHO.Climate.frozen(world, x, y, true)) return { x: 0, y: 0 };
      return { x: F.fx[i] * swell, y: F.fy[i] * swell };
    },
    // ------------------------------------------------------------ every frame
    update(game, dt) {
      const world = game.world, pe = game.pe, pl = game.pl;
      if (!pe || !pl) return;
      B.prepare(world);
      if (ECHO.Interior.cur) return;
      // currents carry swimmers (and drift the ripples)
      for (const e of game.ents) {
        if (e.dead || e.hidden || !e._inWater || e.inBoat || e.aquatic) continue;
        const f = B.flow(world, e.x, e.y), k = e._inWater === 'deep' ? 1 : 0.25;
        if (f.x || f.y) ECHO.Ent.move(world, e, f.x * k * dt, f.y * k * dt);
      }
      for (const r of ECHO.Water.ripples) { if (r.fx == null) { const f = B.flow(world, r.x, r.y); r.fx = f.x * 0.8; r.fy = f.y * 0.8; } r.x += r.fx * dt; r.y += r.fy * dt; }
      // a few flecks of foam riding the current near you
      if (Math.random() < dt * 6) { const a = Math.random() * 6.28, r = 2 + Math.random() * 10, x = pe.x + Math.cos(a) * r, y = pe.y + Math.sin(a) * r; const f = B.flow(world, x, y); if (Math.hypot(f.x, f.y) > 0.4) ECHO.Water.ripple(x, y, 0.18, 1.6); }
      if (B.ferry) B.ferryTick(game, dt);
    },
    // ------------------------------------------------------------ your rowboat
    placeBoat(game, s) {
      const world = game.world; B.prepare(world);
      const d = B.docks.find(d => d.sid === s.id);
      let spot = d ? d.water : null;
      if (!spot) { for (let r = 2; r < 30 && !spot; r++) for (let a = 0; a < 24 && !spot; a++) { const x = s.x + Math.cos(a / 24 * 6.28) * r, y = s.y + Math.sin(a / 24 * 6.28) * r; if (ECHO.Water.kind(world, x, y)) spot = { x: Math.floor(x) + 0.5, y: Math.floor(y) + 0.5 }; } }
      return spot;
    },
    buyBoat(game, s) {
      const pl = game.pl;
      if (pl.gold < 80) return 'A rowboat: 80 crowns.';
      const spot = B.placeBoat(game, s);
      if (!spot) return 'There is no water near enough here to keep a boat.';
      pl.gold -= 80; pl.boat = { x: spot.x, y: spot.y, dir: 0 };
      return null;
    },
    board(game) {
      const pe = game.pe, pl = game.pl;
      if (pl.mounted) ECHO.Life.mount(game, false);
      pe.inBoat = true; pe.x = pl.boat.x; pe.y = pl.boat.y; pe.dir = pl.boat.dir || 0;
      B.row = { vx: 0, vy: 0, dir: pe.dir, stroke: 0 };
      ECHO.Water.splash(pe.x, pe.y, 6, 0.6); ECHO.Sfx.play('wade', { vol: 0.6 });
    },
    // step ashore onto the nearest dry ground; the boat stays beached where it is
    ashore(game) {
      const world = game.world, pe = game.pe, pl = game.pl;
      let land = null, bd = Infinity;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const x = Math.floor(pe.x) + dx + 0.5, y = Math.floor(pe.y) + dy + 0.5; if (!ECHO.Water.kind(world, x, y) && ECHO.Ent.fits(world, x, y)) { const d = U.dist(x, y, pe.x, pe.y); if (d < bd) { bd = d; land = { x, y }; } } }
      if (!land) return ECHO.UI.toast('No dry ground close enough to step onto.', 'warn', 2);
      pl.boat = { x: pe.x, y: pe.y, dir: pe.dir };
      pe.inBoat = false; pe.x = land.x; pe.y = land.y; B.row = null; pe.rowing = false;
      for (const e of game.ents) if (e.isCompanion) { e.inBoat = false; const sp = ECHO.Ent.freeSpot(world, land.x - 0.8, land.y + 0.4, 3) || land; e.x = sp.x; e.y = sp.y; }
      ECHO.Sfx.play('wade', { vol: 0.5 });
    },
    // Rowing: the boat glides, turns slowly, and drifts with the current when you rest.
    rowTick(game, mx, my, len, dt) {
      const world = game.world, pe = game.pe, pl = game.pl;
      const R = B.row || (B.row = { vx: 0, vy: 0, dir: pe.dir, stroke: 0 });
      const f = B.flow(world, pe.x, pe.y);
      if (len) {
        const a = Math.atan2(my, mx);
        R.dir += U.clamp(U.angleDiff(R.dir, a), -dt * 2.2, dt * 2.2);
        const pull = Math.max(0, Math.cos(U.angleDiff(R.dir, a))) * 3.4 * (pl.stamina > 2 ? 1 : 0.5);
        R.vx += (Math.cos(R.dir) * pull - R.vx) * Math.min(1, dt * 1.4);
        R.vy += (Math.sin(R.dir) * pull - R.vy) * Math.min(1, dt * 1.4);
        R.stroke += dt * 2.2;
        pl.stamina = Math.max(0, pl.stamina - dt * 1.5);
        if (Math.sin(R.stroke * Math.PI * 2) > 0.95 && !R._s) { R._s = true; ECHO.Sfx.play('wade', { vol: 0.35, pitch: 1.2 }); ECHO.Water.ripple(pe.x - Math.sin(R.dir) * 0.5, pe.y + Math.cos(R.dir) * 0.5, 0.5); ECHO.Water.ripple(pe.x + Math.sin(R.dir) * 0.5, pe.y - Math.cos(R.dir) * 0.5, 0.5); }
        if (Math.sin(R.stroke * Math.PI * 2) < 0) R._s = false;
      } else { R.vx *= Math.exp(-dt * 0.6); R.vy *= Math.exp(-dt * 0.6); }
      const bx = pe.x, by = pe.y;
      ECHO.Ent.move(world, pe, (R.vx + f.x) * dt, (R.vy + f.y) * dt);
      if (Math.hypot(pe.x - bx, pe.y - by) < Math.hypot(R.vx, R.vy) * dt * 0.3) { R.vx *= 0.5; R.vy *= 0.5; }   // ran aground
      pe.dir = R.dir; pe.moving = len > 0; pe.rowing = len > 0;
      // your companion sits in the stern
      for (const e of game.ents) if (e.isCompanion && !e.dead) { e.inBoat = 'passenger'; e.x = pe.x - Math.cos(R.dir) * 0.65; e.y = pe.y - Math.sin(R.dir) * 0.65; e.dir = R.dir; e.moving = false; }
      const sp = Math.hypot(R.vx, R.vy);
      if (sp > 0.8 && Math.random() < dt * 6) ECHO.Water.ripple(pe.x - Math.cos(R.dir) * 0.8, pe.y - Math.sin(R.dir) * 0.8, 0.7, 1.2);
    },
    // ------------------------------------------------------------ the ferry
    ferryTo(game, from, to) {
      const pl = game.pl, pe = game.pe, world = game.world;
      const fare = 5 + Math.round(U.dist(from.water.x, from.water.y, to.water.x, to.water.y) / 5);
      if (pl.gold < fare) return ECHO.UI.toast(`The ferryman wants ${fare} crowns.`, 'warn', 3);
      const route = from.routes && from.routes[to.sid];
      if (!route) return ECHO.UI.toast('The ferryman shakes his head: no way across from here today.', 'warn', 3);
      pl.gold -= fare;
      if (pl.mounted) ECHO.Life.mount(game, false);
      B.ferry = { route, i: 1, from, to, horse: !!(pl.horse && pl.horseAt && U.dist(pl.horseAt.x, pl.horseAt.y, pe.x, pe.y) < 14) || false };
      pe.inBoat = 'ferry'; pe.x = from.water.x; pe.y = from.water.y;
      ECHO.UI.toast(`You pay ${fare} crowns. The ferryman pushes off for ${to.name}${B.ferry.horse ? ' — your horse stands in the bow' : ''}.`, 'info', 4);
      ECHO.Sfx.play('wade', { vol: 0.7, pitch: 0.8 });
    },
    ferryTick(game, dt) {
      const F = B.ferry, pe = game.pe, pl = game.pl;
      const t = F.route[F.i];
      if (!t) {
        pe.inBoat = false; pe.x = F.to.land.x; pe.y = F.to.land.y; pe.moving = false;
        if (F.horse && pl.horseAt) { pl.horseAt.x = F.to.land.x + 0.8; pl.horseAt.y = F.to.land.y + 0.4; }
        for (const e of game.ents) if (e.isCompanion) { e.x = F.to.land.x - 0.8; e.y = F.to.land.y + 0.4; e.inBoat = false; }
        ECHO.UI.toast(`The ferry bumps against the jetty at ${F.to.name}.`, 'info', 3);
        B.ferry = null; return;
      }
      const a = Math.atan2(t.y - pe.y, t.x - pe.x), d = U.dist(t.x, t.y, pe.x, pe.y);
      const step = Math.min(d, 5 * dt);
      pe.x += Math.cos(a) * step; pe.y += Math.sin(a) * step; pe.dir = a; pe.moving = true;
      if (d < 0.3) F.i++;
      for (const e of game.ents) if (e.isCompanion) { e.x = pe.x - Math.cos(a) * 0.8; e.y = pe.y - Math.sin(a) * 0.8; e.inBoat = 'ferry'; e._ferryT = 0.5; }
      if (Math.random() < dt * 5) ECHO.Water.ripple(pe.x - Math.cos(a) * 1.2, pe.y - Math.sin(a) * 1.2, 0.9, 1.3);
    },
    // ------------------------------------------------------------ what you can do here
    interactables(game) {
      const world = game.world, pe = game.pe, pl = game.pl, out = [];
      if (ECHO.Interior.cur || B.ferry) return out;
      B.prepare(world);
      if (pe.inBoat) {
        let landNear = false;
        for (let dy = -1; dy <= 1 && !landNear; dy++) for (let dx = -1; dx <= 1 && !landNear; dx++) if (!ECHO.Water.kind(world, pe.x + dx * 1.2, pe.y + dy * 1.2) && !ECHO.World.isSolid(world, pe.x + dx * 1.2, pe.y + dy * 1.2)) landNear = true;
        if (landNear) out.push({ kind: 'act', label: 'Step ashore (beach the boat)', d: 0.5, act: () => B.ashore(game) });
        return out;
      }
      if (pl.boat && U.dist(pl.boat.x, pl.boat.y, pe.x, pe.y) < 2.2) out.push({ kind: 'act', label: 'Get into your boat', d: U.dist(pl.boat.x, pl.boat.y, pe.x, pe.y), act: () => B.board(game) });
      for (const d of B.docks) {
        if (U.dist(d.land.x, d.land.y, pe.x, pe.y) > 2.4) continue;
        for (const to of d.to) {
          const fare = 5 + Math.round(U.dist(d.water.x, d.water.y, to.water.x, to.water.y) / 5);
          out.push({ kind: 'act', label: `Take the ferry to ${to.name} (${fare} cr)`, d: U.dist(d.land.x, d.land.y, pe.x, pe.y) + 0.1, act: () => B.ferryTo(game, d, to) });
        }
      }
      return out;
    }
  };
})();
