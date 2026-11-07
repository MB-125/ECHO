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
      // On a big (round) world only the water within a few hundred tiles of you is worked out —
      // the whole globe would take seconds, every time new country is made — and it is worked
      // out again when you move on (or a few seconds after the land changes).
      const W = world.W || 200, H = world.H || 150, G = ECHO.Game, pe = G && G.world === world ? G.pe : null;
      let x0 = 0, y0 = 0, x1 = W, y1 = H;
      if (W * H > 250000) {
        const px = pe && pe.x < 9000 ? pe.x : (G && G.pl ? G.pl.x : W / 2), py = pe && pe.x < 9000 ? pe.y : (G && G.pl ? G.pl.y : H / 2);
        const g = 64, R = 200, cx = Math.floor(px / g) * g, cy = Math.floor(py / g) * g;
        x0 = Math.max(0, cx - R); y0 = Math.max(0, cy - R); x1 = Math.min(W, cx + g + R); y1 = Math.min(H, cy + g + R);
        // (still well inside the stretch already worked out: keep it, rather than work it all out again every 64 paces)
        const F = B.F, M = 90;
        if (F && B._wh === W + 'x' + H && (px - F.x0 > M || F.x0 === 0) && (F.x0 + F.w - px > M || F.x0 + F.w === W) && (py - F.y0 > M || F.y0 === 0) && (F.y0 + F.h - py > M || F.y0 + F.h === H)) { x0 = F.x0; y0 = F.y0; x1 = F.x0 + F.w; y1 = F.y0 + F.h; }
      }
      if (B.F && G && G.pl && G.pl.flying) return;      // (in the sky the currents below can wait)
      const key = world.seed + '|' + W + 'x' + H + '|' + x0 + ',' + y0, ep = world._tileEpoch || 0, now = Date.now();
      if (B._key === key && (B._ep === ep || now - (B._at || 0) < 4000)) return;
      // the land changed, but not the water (a tree felled, a field dug): the currents stand as they were
      if (B._key === key && B.F && B.F.tiles && ECHO.Nav && ECHO.Nav.forget) {
        const F = B.F; let wet = false;
        const ok = ECHO.Nav.forget(world, B._ep, (ax, ay, bx, by) => {
          for (let y = Math.max(ay, F.y0); y < Math.min(by, F.y0 + F.h) && !wet; y++) for (let x = Math.max(ax, F.x0); x < Math.min(bx, F.x0 + F.w); x++) if (isW(world.tiles[y * W + x]) !== isW(F.tiles[(y - F.y0) * F.w + (x - F.x0)])) { wet = true; break; }
        });
        if (ok && !wet) { B._ep = ep; return; }
      }
      B._key = key; B._ep = ep; B._at = now; B._wh = W + 'x' + H;
      const w = x1 - x0, h = y1 - y0, N = w * h, tiles = new Uint8Array(N);
      for (let y = 0; y < h; y++) tiles.set(world.tiles.subarray((y + y0) * W + x0, (y + y0) * W + x1), y * w);
      // distance to the open sea through water, from every water tile
      const dist = new Int32Array(N).fill(-1), q = new Int32Array(N);
      let qh = 0, qt = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (tiles[i] === T().DEEP && (x === 0 || y === 0 || x === w - 1 || y === h - 1)) { dist[i] = 0; q[qt++] = i; }
      }
      const step = (c, n) => { if (dist[n] < 0 && isW(tiles[n])) { dist[n] = dist[c] + 1; q[qt++] = n; } };
      while (qh < qt) {
        const c = q[qh++], cx = c % w, cy = (c / w) | 0;
        if (cx + 1 < w) step(c, c + 1); if (cx > 0) step(c, c - 1); if (cy + 1 < h) step(c, c + w); if (cy > 0) step(c, c - w);
      }
      // components of connected water, for ferries
      const comp = new Int32Array(N).fill(-1); let id = 0;
      const st = new Int32Array(N);
      for (let i = 0; i < N; i++) {
        if (comp[i] >= 0 || !isW(tiles[i])) continue;
        let sp = 0; st[sp++] = i; comp[i] = id;
        while (sp) {
          const c = st[--sp], cx = c % w, cy = (c / w) | 0;
          if (cx + 1 < w && comp[c + 1] < 0 && isW(tiles[c + 1])) { comp[c + 1] = id; st[sp++] = c + 1; }
          if (cx > 0 && comp[c - 1] < 0 && isW(tiles[c - 1])) { comp[c - 1] = id; st[sp++] = c - 1; }
          if (cy + 1 < h && comp[c + w] < 0 && isW(tiles[c + w])) { comp[c + w] = id; st[sp++] = c + w; }
          if (cy > 0 && comp[c - w] < 0 && isW(tiles[c - w])) { comp[c - w] = id; st[sp++] = c - w; }
        }
        id++;
      }
      // the flow: toward the sea, strongest where the channel is narrow
      const fx = new Float32Array(N), fy = new Float32Array(N);
      for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
        const i = y * w + x; if (!isW(tiles[i]) || dist[i] <= 0) continue;
        let vx = 0, vy = 0; const di = dist[i];
        if (dist[i + 1] >= 0 && dist[i + 1] < di) vx++; if (dist[i - 1] >= 0 && dist[i - 1] < di) vx--;
        if (dist[i + w] >= 0 && dist[i + w] < di) vy++; if (dist[i - w] >= 0 && dist[i - w] < di) vy--;
        const L = Math.hypot(vx, vy); if (!L) continue;
        let wide = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (isW(tiles[i + dy * w + dx])) wide++;
        const k = U.clamp((22 - wide) / 14, 0, 1) * 1.3;    // a river runs; a lake barely moves
        fx[i] = vx / L * k; fy[i] = vy / L * k;
      }
      B.F = { x0, y0, w, h, fx, fy, comp, tiles };
      // jetties: each town on the water keeps one
      B.docks = [];
      for (const s of world.settlements) {
        if (s.x < x0 + 15 || s.y < y0 + 15 || s.x >= x1 - 15 || s.y >= y1 - 15) continue;   // (only the towns in the water worked out)
        let best = null, bd = Infinity;
        for (let dy = -14; dy <= 14; dy++) for (let dx = -14; dx <= 14; dx++) {
          const x = Math.floor(s.x) + dx, y = Math.floor(s.y) + dy;
          if (!isW(ECHO.World.tile(world, x, y))) continue;
          for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const lx = x + ox, ly = y + oy, lt = ECHO.World.tile(world, lx, ly);
            if (isW(lt) || ECHO.World.isSolid(world, lx + 0.5, ly + 0.5) || lt === T().BRIDGE) continue;
            const d = Math.hypot(dx, dy);
            if (d < bd) { bd = d; best = { sid: s.id, name: s.name, land: { x: lx + 0.5, y: ly + 0.5 }, water: { x: x + 0.5, y: y + 0.5 }, dir: Math.atan2(-oy, -ox), comp: comp[(y - y0) * w + x - x0] }; }
          }
        }
        if (best) B.docks.push(best);
      }
      // ferry crossings: only where the water route is reasonably direct (no rowing round half the coast)
      const cost = (x, y, i) => isW(world.tiles[i]) ? 1 : Infinity;
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
      const F = B.F, ix = Math.floor(x) - F.x0, iy = Math.floor(y) - F.y0;
      if (ix < 0 || iy < 0 || ix >= F.w || iy >= F.h) return { x: 0, y: 0 };
      const i = iy * F.w + ix, swell = ECHO.Climate && ECHO.Climate.swollen(world, x, y) ? 1.8 : 1;
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
