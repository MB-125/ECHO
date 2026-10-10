// Renderer: chunked terrain, y-sorted objects, effects, lighting.
(function () {
  const { U } = ECHO;
  const S = ECHO.Sprites;
  const TS = 16, CH = 16;
  const T = ECHO.TIME;

  const R = ECHO.Renderer2D = {
    canvas: null, ctx: null, light: null, lctx: null, Z: 3, dpr: 1, cw: 0, ch: 0,
    chunks: {}, world: null, snow: [], mapCanvas: null,

    init(canvas) {
      R.canvas = canvas;
      R.ctx = canvas.getContext('2d');
      R.light = document.createElement('canvas');
      R.lctx = R.light.getContext('2d');
      window.addEventListener('resize', R.resize);
      R.resize();
      for (let i = 0; i < 140; i++) R.snow.push({ x: Math.random(), y: Math.random(), s: 0.5 + Math.random(), d: Math.random() });
    },
    resize() {
      R.dpr = window.devicePixelRatio || 1;
      R.cw = Math.floor(window.innerWidth * R.dpr);
      R.ch = Math.floor(window.innerHeight * R.dpr);
      R.canvas.width = R.cw; R.canvas.height = R.ch;
      R.canvas.style.width = window.innerWidth + 'px'; R.canvas.style.height = window.innerHeight + 'px';
      R.light.width = R.cw; R.light.height = R.ch;
      const zoomPref = (ECHO.UI && ECHO.UI.settings && ECHO.UI.settings.zoom) || 0;
      R.Z = Math.max(2, Math.round(R.cw / (TS * (30 - zoomPref * 4))));
    },
    setWorld(world) {
      R.world = world; R.chunks = {}; R.mapCanvas = null;
      S.bCache = {};
    },
    // ---- coordinates (tiles ↔ device pixels)
    camOffset(game) {
      let sx = 0, sy = 0;
      if (game.shakeT > 0) { sx = (Math.random() - 0.5) * game.shakeA * 0.6; sy = (Math.random() - 0.5) * game.shakeA * 0.6; }
      return { x: game.cam.x + sx, y: game.cam.y + sy };
    },
    // a burnt-out house: soot over walls and roof, the beams showing through
    scorch(game, b) {
      const ctx = R.ctx, a = R.toScreen(game, b.x, b.y - 1.6), c = R.toScreen(game, b.x + b.w, b.y + b.h);
      ctx.save();
      ctx.fillStyle = 'rgba(22,16,12,0.62)'; ctx.fillRect(a.x, a.y, c.x - a.x, c.y - a.y);
      ctx.fillStyle = 'rgba(40,28,20,0.9)';
      const n = Math.max(3, Math.round(b.w * 1.2)), w = Math.max(2, (c.x - a.x) * 0.04);
      for (let i = 0; i < n; i++) { const x = a.x + (c.x - a.x) * (i + 0.5) / n; ctx.fillRect(x - w / 2, a.y - w * 2 + (i % 2) * w * 3, w, (c.y - a.y) * 0.55); }
      ctx.restore();
    },
    toScreen(game, x, y) {
      const c = R._cam || game.cam;
      return { x: (x - c.x) * TS * R.Z + R.cw / 2, y: (y - c.y) * TS * R.Z + R.ch / 2 };
    },
    screenToWorld(game, sx, sy) {
      const c = game.cam;
      return { x: (sx * R.dpr - R.cw / 2) / (TS * R.Z) + c.x, y: (sy * R.dpr - R.ch / 2) / (TS * R.Z) + c.y };
    },
    onScreen(game, x, y, pad = 0) {
      const p = R.toScreen(game, x, y);
      const m = pad * TS * R.Z;
      return p.x > -m && p.y > -m && p.x < R.cw + m && p.y < R.ch + m;
    },

    // ---- terrain chunks
    chunk(cx, cy, epoch) {
      const key = cx + ',' + cy;
      let c = R.chunks[key];
      if (c && c.epoch === epoch) return c.canvas;
      const world = R.world;
      const canvas = c ? c.canvas : document.createElement('canvas');
      canvas.width = CH * TS; canvas.height = CH * TS;
      const g = canvas.getContext('2d');
      const season = T.dateOf(world.day).seasonIdx;
      for (let ty = 0; ty < CH; ty++) for (let tx = 0; tx < CH; tx++) {
        const x = cx * CH + tx, y = cy * CH + ty;
        if (x >= world.W || y >= world.H) { g.fillStyle = '#1d3a5f'; g.fillRect(tx * TS, ty * TS, TS, TS); continue; }
        const region = ECHO.World.regionAt(world, x, y);
        const crop = region && region.eco ? region.eco.crop : 1;
        S.paintTile(g, world, x, y, tx * TS, ty * TS, season, crop);
      }
      R.chunks[key] = { canvas, epoch };
      return canvas;
    },

    // fade in and out instead of popping (newcomers, folk going through doors)
    fadeDraw(game, e) {
      R.alpha = R.alpha || new WeakMap();
      const quiet = (game.noFadeUntil && game.time < game.noFadeUntil) || (R.frames || 0) < 5;
      let a = R.alpha.get(e);
      if (a == null) a = quiet || e === game.pe ? 1 : 0;
      a = e === game.pe || e.dead ? 1 : Math.max(0, Math.min(1, a + (e.hidden ? -1 : 1) * (R.dt || 0.016) * 3.2));
      R.alpha.set(e, a);
      if (a <= 0.01) return null;
      if (a >= 0.99) return () => R.entity(game, e);
      return () => { const c = R.ctx, ga = c.globalAlpha; c.globalAlpha = ga * a; R.entity(game, e); R.ctx.globalAlpha = ga; };
    },
    draw(game, dt) {
      R.dt = dt; R.frames = (R.frames || 0) + 1;
      const ctx = R.ctx, world = game.world;
      const Z = R.Z;
      R._cam = R.camOffset(game);
      const cam = R._cam;
      // Lights from this frame's update, plus scene lights added below.
      game.lights = (game._updLights || []).slice();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#0b0a0f';
      ctx.fillRect(0, 0, R.cw, R.ch);
      if (ECHO.Interior && ECHO.Interior.cur) return R.drawRoom(game, ECHO.Interior.cur);
      const halfW = R.cw / 2 / (TS * Z), halfH = R.ch / 2 / (TS * Z);
      const x0 = Math.floor(cam.x - halfW) - 1, x1 = Math.ceil(cam.x + halfW) + 1;
      const y0 = Math.floor(cam.y - halfH) - 1, y1 = Math.ceil(cam.y + halfH) + 3;
      const epoch = world.day + '|' + (world._tileEpoch || 0);
      // Terrain
      for (let cy = Math.max(0, Math.floor(y0 / CH)); cy <= Math.min(Math.ceil(world.H / CH) - 1, Math.floor(y1 / CH)); cy++) {
        for (let cx = Math.max(0, Math.floor(x0 / CH)); cx <= Math.min(Math.ceil(world.W / CH) - 1, Math.floor(x1 / CH)); cx++) {
          const c = R.chunk(cx, cy, epoch);
          const p = R.toScreen(game, cx * CH, cy * CH);
          ctx.drawImage(c, Math.round(p.x), Math.round(p.y), CH * TS * Z, CH * TS * Z);
        }
      }
      // Water shimmer
      const tt = game.time;
      ctx.fillStyle = 'rgba(180,215,240,0.18)';
      for (let y = Math.max(0, y0); y < Math.min(world.H, y1); y++) for (let x = Math.max(0, x0); x < Math.min(world.W, x1); x++) {
        const t = world.tiles[y * world.W + x];
        if (t !== ECHO.TILE.WATER && t !== ECHO.TILE.DEEP) continue;
        const ph = (ECHO.hash2(x, y, 3) * 6 + tt * 1.3) % 6;
        if (ph < 1.2) {
          const p = R.toScreen(game, x, y);
          ctx.fillRect(Math.round(p.x + ((ph * 8) | 0) * Z), Math.round(p.y + (4 + ECHO.hash2(x, y, 4) * 8 | 0) * Z), 4 * Z, Z);
        }
      }
      // Winter ice over the water, footprints in mud and snow
      if (ECHO.Climate && !ECHO.Interior.cur) {
        const C = ECHO.Climate, iceS = C.frozen(world, game.pe.x, game.pe.y, false), iceD = C.frozen(world, game.pe.x, game.pe.y, true);
        if (iceS) for (let y = Math.max(0, y0); y < Math.min(world.H, y1); y++) for (let x = Math.max(0, x0); x < Math.min(world.W, x1); x++) {
          const t = world.tiles[y * world.W + x];
          if (t !== ECHO.TILE.WATER && !(t === ECHO.TILE.DEEP && iceD)) continue;
          const p = R.toScreen(game, x, y);
          ctx.fillStyle = 'rgba(214,232,242,0.82)'; ctx.fillRect(Math.round(p.x), Math.round(p.y), Math.ceil(16 * Z), Math.ceil(16 * Z));
          if (ECHO.hash2(x, y, 9) < 0.3) { ctx.fillStyle = 'rgba(150,175,195,0.6)'; ctx.fillRect(Math.round(p.x + 3 * Z), Math.round(p.y + (5 + ECHO.hash2(x, y, 7) * 6) * Z), 8 * Z, Z); }
        }
        if (ECHO.WildWater) for (const f of ECHO.WildWater.fish) {
          const p = R.toScreen(game, f.x, f.y);
          ctx.fillStyle = 'rgba(40,60,70,0.55)';
          ctx.fillRect(Math.round(p.x - 1.5 * Z), Math.round(p.y), Math.ceil(3 * Z), Math.ceil(Z));
        }
        for (const pr of C.prints) {
          const p = R.toScreen(game, pr.x, pr.y);
          ctx.fillStyle = pr.snow ? `rgba(140,155,170,${(0.6 * Math.min(1, (pr.life - pr.t) / 8)).toFixed(2)})` : `rgba(40,30,20,${(0.5 * Math.min(1, (pr.life - pr.t) / 8)).toFixed(2)})`;
          ctx.fillRect(Math.round(p.x - Z), Math.round(p.y), Math.ceil(2 * Z), Math.ceil(Z));
        }
      }
      // Ground layer: telegraphs, loot, camp ground
      R.drawGround(game);
      // Y-sorted objects
      const objs = [];
      const night = game.isNight();
      const season = T.dateOf(world.day).seasonIdx;
      for (let y = Math.max(0, y0); y < Math.min(world.H, y1); y++) for (let x = Math.max(0, x0); x < Math.min(world.W, x1); x++) {
        if (world.tiles[y * world.W + x] !== ECHO.TILE.TREE) continue;
        const h = ECHO.hash2(x, y, world.seed + 11);
        const kind = y < world.H * 0.3 || h < 0.18 ? 'pine' : ECHO.World.regionAt(world, x, y).swamp > 0.2 && h < 0.5 ? 'willow' : 'oak';
        const tr = ECHO.World.trunk(world, x, y);
        objs.push({ y: tr.y + 0.5, draw: () => R.img(game, S.tree(kind, season, (h * 7) | 0), tr.x, tr.y + 0.5, 12, 33) });
      }
      for (const s of world.settlements) {
        if (Math.abs(s.x - cam.x) > halfW + 20 || Math.abs(s.y - cam.y) > halfH + 20) continue;
        for (const b of s.buildings) {
          objs.push({ y: b.y + b.h, draw: () => { R.building(game, b, s, night); if (b.gutted != null) R.scorch(game, b); } });
          if (night && b.gutted == null && (b.type === 'house' || b.type === 'inn' || b.type === 'keep' || b.type === 'temple')) game.light(b.x + b.w / 2, b.y + b.h, b.type === 'house' ? 1.6 : 2.6, 0.55, '#ffcf80');
          if (b.type === 'lamp' && (night || T.daylight(world.minute) < 0.6)) {
            const era = world.factions[s.faction] ? world.factions[s.faction].tech.era : 0;
            game.light(b.x + 0.5, b.y + 0.4, era >= 4 ? 7 : 3.2, 0.85, era >= 4 && world.factions[s.faction].tech.path === 'arcane' ? '#bfe8ff' : '#ffd08a');
          }
          if (b.type === 'smithy' && Math.random() < dt * 3) ECHO.Combat.fx.push({ kind: 'smoke', x: b.x + b.w - 0.6, y: b.y - 0.2, vx: 0.2, vy: -0.6, t: 0, life: 2.2, size: 3 });
          else if (ECHO.Fauna) { const cr = ECHO.Fauna.chimney(world, b); if (cr && Math.random() < dt * cr) ECHO.Combat.fx.push({ kind: 'smoke', x: b.x + b.w * 0.7, y: b.y - 0.1, vx: 0.15, vy: -0.5, t: 0, life: 2.6, size: 2.5 }); }
        }
      }
      if (ECHO.Fauna && !ECHO.Interior.cur) for (const f of ECHO.Fauna.flocks) for (const b of f.birds) {
        if (Math.abs(b.x - cam.x) > halfW + 2 || Math.abs(b.y - cam.y) > halfH + 2) continue;
        objs.push({ y: b.y + (b.z > 0.3 ? 50 : 0), draw: () => R.bird(game, f, b) });
      }
      if (ECHO.Pastimes && !ECHO.Interior.cur) for (const n of ECHO.Pastimes.nodes) {
        if (Math.abs(n.x - cam.x) > halfW + 2 || Math.abs(n.y - cam.y) > halfH + 2) continue;
        objs.push({ y: n.y, draw: () => R.forage(game, n) });
      }
      const fly = ECHO.Events && ECHO.Events.fly;
      if (fly && !ECHO.Interior.cur) objs.push({ y: 1e9, draw: () => R.dragonShadow(game, fly) });
      const myc = ECHO.Camp && ECHO.Camp.fire;
      if (myc && !ECHO.Interior.cur) {
        objs.push({ y: myc.by, draw: () => R.bedroll(game, myc) });
        objs.push({ y: myc.y + 0.3, draw: () => myc.out ? R.campRuin(game, { x: myc.x, y: myc.y }) : R.campfire(game, myc.x, myc.y) });
      }
      for (const c of world.camps) {
        if (Math.abs(c.x - cam.x) > halfW + 6 || Math.abs(c.y - cam.y) > halfH + 6) continue;
        if (!c.alive && !c.captives.length) { objs.push({ y: c.y, draw: () => R.campRuin(game, c) }); continue; }
        const tents = [[-2.5, -1.5], [2, -2.2], [-2.8, 2], [2.4, 2.2]];
        tents.forEach(([dx, dy], i) => objs.push({ y: c.y + dy + 0.5, draw: () => R.tent(game, c.x + dx, c.y + dy, i) }));
        objs.push({ y: c.y + 0.3, draw: () => R.campfire(game, c.x, c.y) });
        game.light(c.x, c.y, 5.5, 0.9, '#ff9a4a');
        if (c.captives.length) objs.push({ y: c.y - 0.5, draw: () => R.cage(game, c.x + 2.5, c.y - 1.2) });
      }
      for (const l of world.lairs) {
        if (Math.abs(l.x - cam.x) > halfW + 10 || Math.abs(l.y - cam.y) > halfH + 10) continue;
        for (const r of l.rocks) if (r.hp > 0) objs.push({ y: r.y + 1, draw: () => R.boulder(game, r) });
        objs.push({ y: l.y - 3, draw: () => R.bones(game, l) });
      }
      for (const r of world.ruins) {
        if (Math.abs(r.x - cam.x) > halfW + 8 || Math.abs(r.y - cam.y) > halfH + 8) continue;
        objs.push({ y: r.y - 1.2, draw: () => R.tablet(game, r) });
        if (r.relics.length) objs.push({ y: r.y + 1.3, draw: () => R.rubble(game, r.x + 3, r.y + 1) });
      }
      for (const st of world.structures) {
        if (Math.abs(st.x - cam.x) > halfW + 4 || Math.abs(st.y - cam.y) > halfH + 4) continue;
        objs.push({ y: st.y + 1, draw: () => R.structure(game, st) });
      }
      if (ECHO.Explore) for (const s of ECHO.Explore.sites(world)) {
        if (Math.abs(s.x - cam.x) > halfW + 4 || Math.abs(s.y - cam.y) > halfH + 4) continue;
        objs.push({ y: s.y + 0.5, draw: () => R.site(game, s) });
      }
      for (const c of world.caches || []) {
        if (Math.abs(c.x - game.cam.x) > 22 || Math.abs(c.y - game.cam.y) > 16) continue;
        objs.push({ y: c.y, draw: () => R.site(game, { kind: 'cache_' + c.kind, x: c.x, y: c.y - 0.5, used: {} }) });
      }
      const EX = world.expedition;
      if (EX && EX.camp && Math.abs(EX.camp.x - game.cam.x) < 22 && Math.abs(EX.camp.y - game.cam.y) < 16) {
        objs.push({ y: EX.camp.y + 0.5, draw: () => R.site(game, { kind: 'expcamp', x: EX.camp.x, y: EX.camp.y, used: {} }) });
      }
      for (const s of world.settlements) {
        if (!s.works || !s.works.walls || Math.abs(s.x - cam.x) > halfW + 20 || Math.abs(s.y - cam.y) > halfH + 20) continue;
        const rad = s.kind === 'capital' ? 17 : 14.5, n = Math.round(rad * 2 * Math.PI / 0.7);
        for (let i = 0; i < n; i++) {
          const a = i / n * Math.PI * 2, x = s.x + Math.cos(a) * rad, y = s.y + Math.sin(a) * rad;
          const t = ECHO.World.tile(world, x, y);
          if (t === ECHO.TILE.ROAD || t === ECHO.TILE.BRIDGE || t === ECHO.TILE.WATER || t === ECHO.TILE.DEEP || ECHO.World.isSolid(world, x, y)) continue;
          objs.push({ y, draw: () => { const g = R.art(game, x, y); g.fillStyle = '#6a4a2c'; g.fillRect(-1, -14, 3, 14); g.fillStyle = '#8a6a44'; g.fillRect(-1, -15, 3, 2); R.ctx.setTransform(1, 0, 0, 1, 0, 0); } });
        }
      }
      if (world.rift && Math.abs(world.rift.x - cam.x) < halfW + 6 && Math.abs(world.rift.y - cam.y) < halfH + 6) {
        objs.push({ y: world.rift.y + 1, draw: () => R.rift(game, world.rift) });
        game.light(world.rift.x + 0.5, world.rift.y, 6, 0.9, '#b48aff');
      }
      for (const e of game.ents) {
        if (Math.abs(e.x - cam.x) > halfW + 3 || Math.abs(e.y - cam.y) > halfH + 3) continue;
        const fd = R.fadeDraw(game, e);
        if (!fd) continue;
        objs.push({ y: e.y, draw: fd });
        if (e.gear && e.gear.torch && !e.dead) game.light(e.x, e.y - 0.6, 4, 0.8, '#ffb060');
        if (e.burn > 0) game.light(e.x, e.y - 0.4, 2.5, 0.6, '#ff8a2a');
        if (e.mutation === 'glasshorn' && night) game.light(e.x, e.y - 0.5, 2, 0.6, '#cfefff');
      }
      if (ECHO.Water && !ECHO.Interior.cur) for (const r of ECHO.Water.ripples) if (Math.abs(r.x - cam.x) < halfW + 2 && Math.abs(r.y - cam.y) < halfH + 2) objs.push({ y: r.y - 0.6, draw: () => {
        const p = R.toScreen(game, r.x, r.y), ctx = R.ctx, k = r.t / r.life;
        ctx.setTransform(R.Z, 0, 0, R.Z, Math.round(p.x), Math.round(p.y));
        ctx.strokeStyle = `rgba(230,244,248,${(0.6 * (1 - k) * (1 - k)).toFixed(3)})`; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.ellipse(0, 0, Math.max(0.5, r.size * 10 * (0.15 + 0.85 * k)), Math.max(0.3, r.size * 5 * (0.15 + 0.85 * k)), 0, 0, Math.PI * 2); ctx.stroke();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      } });
      { const pl = game.pl, h = pl && pl.horse && !pl.mounted && pl.horseAt;
        if (h && !ECHO.Interior.cur && Math.abs(h.x - cam.x) < halfW + 3 && Math.abs(h.y - cam.y) < halfH + 3) objs.push({ y: h.y, draw: () => R.freeHorse(game, h) });
        if (ECHO.Boats && !ECHO.Interior.cur) {
          const B = ECHO.Boats, drawB = (x, y, kind, dir) => objs.push({ y, draw: () => { const p = R.toScreen(game, x, y), ctx = R.ctx; ctx.setTransform(R.Z, 0, 0, R.Z, Math.round(p.x), Math.round(p.y)); if (Math.cos(dir) < 0) ctx.scale(-1, 1); R.boat2d(ctx, kind, false, game.time); ctx.setTransform(1, 0, 0, 1, 0, 0); } });
          if (pl && pl.boat && !game.pe.inBoat && Math.abs(pl.boat.x - cam.x) < halfW + 3 && Math.abs(pl.boat.y - cam.y) < halfH + 3) drawB(pl.boat.x, pl.boat.y, 'row', pl.boat.dir || 0);
          for (const d of B.docks || []) {
            if (Math.abs(d.water.x - cam.x) > halfW + 4 || Math.abs(d.water.y - cam.y) > halfH + 4) continue;
            objs.push({ y: d.land.y - 0.4, draw: () => { const a = R.toScreen(game, d.land.x, d.land.y), b = R.toScreen(game, d.water.x, d.water.y), ctx = R.ctx; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.strokeStyle = '#7a5a3a'; ctx.lineWidth = 6 * R.Z; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x + (b.x - a.x) * 0.4, b.y + (b.y - a.y) * 0.4); ctx.stroke(); } });
            if (d.to.length && !(B.ferry && B.ferry.from === d)) drawB(d.water.x + Math.cos(d.dir) * 0.6, d.water.y + Math.sin(d.dir) * 0.6, 'ferry', d.dir + Math.PI / 2);
          }
        }
        if (ECHO.Riders && !ECHO.Interior.cur) for (const lh of ECHO.Riders.loose) if (Math.abs(lh.x - cam.x) < halfW + 3 && Math.abs(lh.y - cam.y) < halfH + 3) objs.push({ y: lh.y, draw: () => R.freeHorse(game, lh, 'loose' + lh.id, lh.breed) }); }
      // Festival dressing: the bonfire, lantern poles, the stall, contest targets
      if (ECHO.Fest) for (const L of ECHO.Fest.near(game)) {
        for (const p of L.poles) objs.push({ y: p.y, draw: () => { const g = R.art(game, p.x, p.y); g.fillStyle = '#5a3e26'; g.fillRect(-1, -38, 2, 38); R.ctx.setTransform(1, 0, 0, 1, 0, 0); } });
        objs.push({ y: L.stall.y, draw: () => R.festStall(game, L) });
        if (L.live) objs.push({ y: L.fire.y + 0.3, draw: () => R.bonfire(game, L.fire.x, L.fire.y) });
      }
      if (ECHO.Fest && ECHO.Fest.contest) for (const t of ECHO.Fest.contest.targets) objs.push({ y: t.y, draw: () => R.target(game, t) });
      objs.sort((a, b) => a.y - b.y);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      for (const o of objs) o.draw();
      // lantern strings between the poles
      if (ECHO.Fest) for (const L of ECHO.Fest.near(game)) {
        ctx.strokeStyle = 'rgba(40,30,20,0.8)'; ctx.lineWidth = Math.max(1, R.Z * 0.5);
        for (let i = 0; i < L.poles.length; i++) {
          const a = L.poles[i], b = L.poles[(i + 1) % L.poles.length];
          if (U.dist(a.x, a.y, b.x, b.y) > 7) continue;
          ctx.beginPath();
          for (let k = 0; k <= 6; k++) { const t = k / 6, p = R.toScreen(game, U.lerp(a.x, b.x, t), U.lerp(a.y, b.y, t)); const yy = p.y - (38 - Math.sin(t * Math.PI) * 8) * R.Z; if (k) ctx.lineTo(p.x, yy); else ctx.moveTo(p.x, yy); }
          ctx.stroke();
        }
      }
      // Projectiles & effects
      R.drawLock(game);
      R.drawFx(game);
      // Lighting
      R.drawLighting(game, dt);
      R.drawGlows(game);
      // Weather
      const wx = ECHO.Weather ? ECHO.Weather.here(world, game.pe.x, game.pe.y) : { today: 'clear' };
      if (season === 3 || wx.today === 'snow' || wx.today === 'blizzard') { if (wx.today !== 'clear' || season === 3) R.drawSnow(game, dt); }
      if (wx.today === 'rain' || wx.today === 'storm') {
        const ctx2 = R.ctx; ctx2.setTransform(1, 0, 0, 1, 0, 0);
        ctx2.fillStyle = 'rgba(30,40,60,0.18)'; ctx2.fillRect(0, 0, R.cw, R.ch);
        ctx2.strokeStyle = 'rgba(180,200,230,0.35)'; ctx2.lineWidth = 1;
        ctx2.beginPath();
        const n = wx.today === 'storm' ? 220 : 130, tt = game.time;
        for (let i = 0; i < n; i++) { const x = (ECHO.hash2(i, 1, 7) * R.cw + tt * 60) % R.cw, y = (ECHO.hash2(i, 2, 7) * R.ch + tt * (500 + i % 5 * 40)) % R.ch; ctx2.moveTo(x, y); ctx2.lineTo(x + 4, y + 14); }
        ctx2.stroke();
      } else if (wx.today === 'fog' || wx.today === 'cloudy') { R.ctx.setTransform(1, 0, 0, 1, 0, 0); R.ctx.fillStyle = wx.today === 'fog' ? 'rgba(200,205,210,0.25)' : 'rgba(40,45,55,0.12)'; R.ctx.fillRect(0, 0, R.cw, R.ch); }
      // Overlays: labels, bubbles, floaters
      R.drawLabels(game);
    },

    // Simple top-down room view for the 2D renderer.
    FURN_COL: { bed: '#8a3a3a', table: '#7a5634', chair: '#6a4a2c', stool: '#6a4a2c', counter: '#5a3e26', barrel: '#6e4a28', crate: '#8a6a3a', hearth: '#5a554e', shelf: '#4a3420', desk: '#6a4a2c', lectern: '#5a3e26', altar: '#d8d0c0', throne: '#c8a040', bench: '#6a4a2c', rug: '#7a2e2e', anvil: '#3a3a40', forge: '#4a4440', rack: '#5a4a3a', chest: '#7a5a2a', candles: '#f0e0b0', standard: '#6f8fc4', pillar: '#a8a094', stairs: '#2a282e', door: '#4a4a54', tablet: '#8a867c', campfire: '#ff9a4a', boulder: '#6a655c', rock: '#c8c0b0' },
    drawRoom(game, L) {
      const ctx = R.ctx, B = ECHO.Interior.BASE, Z = R.Z;
      const floorCol = { wood: '#6e4c2e', stone: '#6a655d', marble: '#cfc8ba', cave: '#4a443c', crypt: '#55524c' }[L.floor];
      const wallCol = { plaster: '#b8a47e', stone: '#5e5850', marble: '#bdb5a6', rock: '#3e3a33' }[L.wall];
      if (L.carved && !L._wall2d) {
        const k = L._wall2d = new Uint8Array(L.W * L.H), rk = (x, y) => x < 0 || y < 0 || x >= L.W || y >= L.H || L.rock[y * L.W + x];
        for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) { if (!rk(x, y)) { k[y * L.W + x] = 0; continue; } let w = 2; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!rk(x + dx, y + dy)) w = 1; k[y * L.W + x] = w; }
      }
      for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) {
        const p = R.toScreen(game, B + x, y);
        if (L.carved) {
          const k = L._wall2d[y * L.W + x];
          if (k === 2) continue;
          const inR = r => r && x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1;
          ctx.fillStyle = k === 1 ? wallCol : inR(L.lordRoom) ? ((x + y) % 2 ? '#6a5a50' : '#5e5048') : ((x + y) % 2 ? floorCol : R.shade(floorCol));
          ctx.fillRect(Math.round(p.x), Math.round(p.y), Math.ceil(TS * Z), Math.ceil(TS * Z));
          continue;
        }
        const edge = x === 0 || y === 0 || x === L.W - 1 || y === L.H - 1;
        ctx.fillStyle = edge ? (x === L.doorX && y === L.H - 1 ? '#2a1c12' : wallCol) : ((x + y) % 2 ? floorCol : R.shade(floorCol));
        ctx.fillRect(Math.round(p.x), Math.round(p.y), Math.ceil(TS * Z), Math.ceil(TS * Z));
      }
      if (L.webs) {
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.strokeStyle = 'rgba(238,240,255,0.45)'; ctx.lineWidth = Math.max(1, Z * 0.6);
        for (const w of L.webs) {
          const p = R.toScreen(game, B + w.x, w.y), r = w.r * TS * Z;
          for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r * 0.6); ctx.stroke(); }
          for (const k of [0.4, 0.75]) { ctx.beginPath(); ctx.ellipse(p.x, p.y, r * k, r * k * 0.6, 0, 0, Math.PI * 2); ctx.stroke(); }
        }
      }
      for (const t of L.traps || []) {
        const st = ECHO.Quests.trapState(game, t), p = R.toScreen(game, B + t.x - 0.45, t.y - 0.45), w = 0.9 * TS * Z;
        ctx.fillStyle = st === 'warn' ? (t.kind === 'flame' ? '#a03a08' : '#7a6a48') : '#3a3430'; ctx.fillRect(Math.round(p.x), Math.round(p.y), w, w);
        if (st === 'up') { ctx.fillStyle = t.kind === 'flame' ? '#ff9a3a' : '#d8d4cc'; if (t.kind === 'flame') ctx.fillRect(Math.round(p.x + w * 0.2), Math.round(p.y - w * 0.8), w * 0.6, w * 1.4); else for (let i = 0; i < 4; i++) ctx.fillRect(Math.round(p.x + (i % 2 ? 0.6 : 0.2) * w), Math.round(p.y + (i < 2 ? 0.15 : 0.55) * w - 3 * Z), Math.max(1, Z), 5 * Z); }
      }
      const objs = [];
      for (const f of L.furn) objs.push({ y: f.y + f.h / 2, draw: () => {
        if (f.model === 'frame') {
          const p = R.toScreen(game, B + f.x - 0.3, f.y - 0.45), w = 0.6 * TS * Z, h = 0.9 * TS * Z;
          ctx.fillStyle = '#4a3020'; ctx.fillRect(Math.round(p.x), Math.round(p.y), w, h);
          if (f.img) { R.imgs = R.imgs || {}; let im = R.imgs[f.img.length + f.label]; if (!im) { im = new Image(); im.src = f.img; R.imgs[f.img.length + f.label] = im; } if (im.complete) ctx.drawImage(im, Math.round(p.x + 2 * Z), Math.round(p.y + 2 * Z), w - 4 * Z, h - 4 * Z); }
          return;
        }
        const p = R.toScreen(game, B + f.x - f.w / 2 * f.scale, f.y - f.h / 2 * f.scale);
        const w = f.w * TS * Z * f.scale * 0.92, h = f.h * TS * Z * f.scale * 0.92;
        ctx.fillStyle = (f.colors && f.colors.banner && f.model !== 'throne') ? f.colors.banner : (R.FURN_COL[f.model] || '#6a4a2c');
        ctx.fillRect(Math.round(p.x), Math.round(p.y), w, h);
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(Math.round(p.x), Math.round(p.y + h - 3 * Z), w, 3 * Z);
        if (f.model === 'stairs') { ctx.fillStyle = '#5a5660'; for (let i = 0; i < 4; i++) ctx.fillRect(Math.round(p.x + 2 * Z), Math.round(p.y + (f.action === 'delveup' ? i : 3 - i) * h / 4), w - 4 * Z, Math.max(1, h / 10)); }
        if (f.light) game.light(B + f.x, f.y, f.light.r * 0.6, 0.5, f.light.color);
      } });
      for (const e of game.ents) { const d = R.fadeDraw(game, e); if (d) objs.push({ y: e.y, draw: d }); }
      objs.sort((a, b) => a.y - b.y);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      for (const o of objs) o.draw();
      R.drawLock(game);
      R.drawFx(game);
      if (L.cave) {
        // below ground: dark, but for the torches and whatever you carry
        const l = R.lctx; l.setTransform(1, 0, 0, 1, 0, 0); l.globalCompositeOperation = 'source-over'; l.clearRect(0, 0, R.cw, R.ch);
        l.fillStyle = 'rgba(4,4,10,0.72)'; l.fillRect(0, 0, R.cw, R.ch); l.globalCompositeOperation = 'destination-out';
        const lights = L.lights.concat([{ x: game.pe.x, y: game.pe.y, r: 5, a: 0.9 }], game._updLights || []);
        for (const Lg of lights) { const p = R.toScreen(game, Lg.x, Lg.y), rr = Lg.r * TS * R.Z; const g = l.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr); g.addColorStop(0, `rgba(0,0,0,${Math.min(1, Lg.a)})`); g.addColorStop(1, 'rgba(0,0,0,0)'); l.fillStyle = g; l.fillRect(p.x - rr, p.y - rr, rr * 2, rr * 2); }
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(R.light, 0, 0);
      }
      R.drawLabels(game);
    },
    // Landmarks and the mouths of delves, drawn simply.
    site(game, s) {
      const g = R.art(game, s.x, s.y + 0.5);
      const R2 = (c, x, y, w, h) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
      R2('rgba(0,0,0,0.25)', -12, -1, 24, 3);
      switch (s.kind) {
        case 'stones': for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2, x = Math.cos(a) * 26, y = Math.sin(a) * 14; R2('#8a867c', x - 3, y - 18, 6, 18); R2('#a29e94', x - 3, y - 18, 6, 2); } break;
        case 'lookout': R2('#7a756c', -14, -12, 14, 12); R2('#8a857b', 0, -9, 12, 9); R2('#5a3e26', -1, -26, 2, 16); R2('#c8a85a', 1, -26, 8, 5); break;
        case 'moonwell': R2('#a8b8c8', -8, -8, 16, 8); R2('#4a6a8a', -6, -9, 12, 3); break;
        case 'oak': R2('#4a3420', -5, -26, 10, 26); g.fillStyle = '#3a6a2a'; g.beginPath(); g.arc(0, -36, 24, 0, Math.PI * 2); g.fill(); g.fillStyle = '#4a7a32'; g.beginPath(); g.arc(-6, -42, 14, 0, Math.PI * 2); g.fill(); break;
        case 'battlefield': for (let i = 0; i < 7; i++) R2('#e2dccb', Math.cos(i * 2.2) * 24, Math.sin(i * 1.7) * 12, 4, 2); R2('#5a3e26', 6, -22, 2, 22); R2('#5a2a22', 8, -22, 8, 6); break;
        case 'wayshrine': R2('#8a8070', -5, -14, 10, 14); R2('#5a4a3a', -6, -16, 12, 3); R2('#ffd08a', -1, -9, 2, 3); break;
        case 'wreck': R2('#4a3a2a', -16, -8, 32, 8); R2('#3a2a1a', -14, -12, 4, 4); R2('#6a4a28', 10, -10, 6, 6); break;
        case 'barrow': g.fillStyle = '#5a6a4a'; g.beginPath(); g.ellipse(0, -6, 26, 14, 0, Math.PI, 0); g.fill(); R2('#8a867c', -7, -14, 3, 14); R2('#8a867c', 4, -14, 3, 14); R2('#0a0a10', -4, -11, 8, 11); break;
        case 'cave': g.fillStyle = '#6a655c'; g.beginPath(); g.ellipse(0, -8, 22, 16, 0, Math.PI, 0); g.fill(); R2('#0a0a10', -7, -12, 14, 12); R2('#e2dccb', 12, -2, 4, 2); break;
        case 'hideout': R2('#7a5a3a', -16, -10, 10, 10); R2('#6a4a2a', 6, -8, 8, 8); R2('#0a0a10', -4, -6, 8, 6); break;
        case 'falls': R2('#6a655c', -22, -34, 14, 34); R2('#6a655c', 8, -34, 14, 34); R2('#dff2ff', -8, -34, 16, 30); R2('#3f8fb0', -18, -4, 36, 6); R2('#ffffff', -10, -6, 20, 2); break;
        case 'springs': g.fillStyle = '#5fb8b0'; g.beginPath(); g.ellipse(0, -3, 18, 7, 0, 0, Math.PI * 2); g.fill(); for (let i = 0; i < 6; i++) R2('#8a857b', Math.cos(i) * 18 - 2, Math.sin(i) * 7 - 4, 5, 4); g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(-6, -20, 4, 14); g.fillRect(3, -24, 4, 16); break;
        case 'grotto': g.fillStyle = '#6a655c'; g.beginPath(); g.ellipse(0, -8, 22, 16, 0, Math.PI, 0); g.fill(); R2('#0a0a10', -6, -10, 12, 10); for (let i = 0; i < 5; i++) R2(i % 2 ? '#8ff0ff' : '#c8f8ff', -10 + i * 5, -6 - (i % 3) * 4, 3, 6 + (i % 3) * 4); break;
        case 'bones': for (let i = 0; i < 6; i++) { g.strokeStyle = '#ece4d0'; g.lineWidth = 3; g.beginPath(); g.arc(-18 + i * 7, 0, 14 - Math.abs(i - 2.5) * 2, Math.PI, 0); g.stroke(); } g.fillStyle = '#ece4d0'; g.beginPath(); g.ellipse(26, -6, 9, 7, 0, 0, Math.PI * 2); g.fill(); break;
        case 'crater': g.fillStyle = '#3a332c'; g.beginPath(); g.ellipse(0, -2, 26, 11, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#2a2420'; g.beginPath(); g.ellipse(0, -2, 17, 7, 0, 0, Math.PI * 2); g.fill(); if (!Object.keys(s.used).length) R2('#fff0c0', -2, -6, 4, 4); break;
        case 'ring': for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, x = Math.cos(a) * 22, y = Math.sin(a) * 10; R2('#e8e0d0', x - 1, y - 4, 2, 4); R2('#d8d0e8', x - 3, y - 6, 6, 3); } break;
        case 'cache_cairn': R2('#8a857b', -6, -4, 12, 4); R2('#9a958b', -4, -8, 8, 4); R2('#aaa59b', -2, -11, 4, 3); break;
        case 'cache_hollow': R2('#5a4028', -6, -14, 12, 14); R2('#120c08', -2, -9, 4, 4); break;
        case 'cache_loose': for (let i = 0; i < 5; i++) R2('#8a857b', Math.cos(i * 2.4) * 7 - 2, Math.sin(i * 2.4) * 3 - 3, 4, 3); break;
        case 'expcamp': R2('#2a2a2a', -4, -3, 8, 3); R2('#6a6050', -24, -14, 14, 12); R2('#7a5a3a', 12, -8, 8, 8); break;
        case 'catacomb': R2('#6a655d', -20, -20, 7, 20); R2('#6a655d', 13, -20, 7, 20); R2('#5a554e', -20, -22, 40, 4); R2('#0a0a10', -8, -10, 16, 10); for (let i = 0; i < 5; i++) R2('#e2dccb', -16 + i * 8, 2, 4, 3); break;
        case 'warren': g.fillStyle = '#7a6a4a'; g.beginPath(); g.ellipse(0, -6, 28, 14, 0, Math.PI, 0); g.fill(); R2('#0a0a10', -6, -9, 12, 9); R2('#0a0a10', -22, -4, 6, 4); R2('#0a0a10', 16, -4, 6, 4); R2('#5a3e26', 10, -24, 2, 18); R2('#5a7a2a', 12, -24, 7, 5); R2('#ff9a4a', -2, 4, 4, 3); break;
        case 'nest': g.fillStyle = '#6a655c'; g.beginPath(); g.ellipse(0, -8, 22, 16, 0, Math.PI, 0); g.fill(); R2('#0a0a10', -7, -12, 14, 12); g.strokeStyle = 'rgba(244,244,255,0.7)'; g.lineWidth = 1; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(-8, -12 + i * 2); g.lineTo(8, -4 - i * 2); g.stroke(); } break;
        case 'trollden': g.fillStyle = '#5a554c'; g.beginPath(); g.ellipse(0, -10, 30, 22, 0, Math.PI, 0); g.fill(); R2('#0a0a10', -10, -16, 20, 16); for (let i = 0; i < 5; i++) R2(i % 2 ? '#e2dccb' : '#7a756c', -24 + i * 11, 1, 5, 3); break;
        case 'sanctum': R2('#4a4458', -18, -18, 7, 18); R2('#4a4458', 11, -18, 7, 18); R2('#3a3448', -18, -20, 36, 3); R2('#0a0a10', -6, -10, 12, 10); R2('#b48aff', -1, -15, 2, 3); g.fillStyle = 'rgba(58,42,90,0.6)'; g.beginPath(); g.ellipse(0, 2, 18, 5, 0, 0, Math.PI * 2); g.fill(); break;
        case 'forge': R2('#3a3438', -22, -26, 44, 26); R2('#1a1414', -8, -18, 16, 18); R2('#ff7a2a', -6, -3, 12, 2); R2('#5a5458', -24, -28, 48, 3); break;
        case 'crypt': R2('#6a655d', -16, -16, 6, 16); R2('#6a655d', 10, -16, 6, 16); R2('#5a554e', -16, -18, 32, 3); R2('#0a0a10', -6, -8, 12, 8); break;
      }
      R.ctx.setTransform(1, 0, 0, 1, 0, 0);
    },
    drawLock(game) {
      const e = ECHO.PlayerCtl.lock;
      if (!e) return;
      const ctx = R.ctx, Z = R.Z, p = R.toScreen(game, e.x, e.y);
      const rr = (e.type === 'boss' ? 30 : 11) * Z, t = game.time * 3;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.strokeStyle = 'rgba(255,90,60,0.9)'; ctx.lineWidth = 2 * Z;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, rr, rr * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ff5a3c';
      for (let i = 0; i < 4; i++) { const a = t + i * Math.PI / 2, x = p.x + Math.cos(a) * (rr + 4 * Z), y = p.y + Math.sin(a) * (rr + 4 * Z) * 0.5; ctx.fillRect(x - 2 * Z, y - 2 * Z, 4 * Z, 4 * Z); }
      const top = p.y - (e.type === 'boss' ? 60 : e.type === 'creature' ? 22 : 34) * Z + Math.sin(t * 2) * 2 * Z;
      ctx.beginPath(); ctx.moveTo(p.x - 5 * Z, top - 6 * Z); ctx.lineTo(p.x + 5 * Z, top - 6 * Z); ctx.lineTo(p.x, top); ctx.closePath(); ctx.fill();
    },
    shade(hex) { const n = parseInt(hex.slice(1), 16); const f = c => Math.max(0, Math.round(c * 0.92)); return '#' + ((f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, '0'); },
    img(game, canvas, x, y, ax, ay, flip) {
      const p = R.toScreen(game, x, y);
      const Z = R.Z;
      if (flip) {
        R.ctx.save(); R.ctx.translate(Math.round(p.x), Math.round(p.y)); R.ctx.scale(-1, 1);
        R.ctx.drawImage(canvas, -ax * Z, -ay * Z, canvas.width * Z, canvas.height * Z);
        R.ctx.restore();
      } else R.ctx.drawImage(canvas, Math.round(p.x - ax * Z), Math.round(p.y - ay * Z), canvas.width * Z, canvas.height * Z);
    },
    // Set a transform so that art pixels can be drawn at world position (x,y).
    art(game, x, y) {
      const p = R.toScreen(game, x, y);
      R.ctx.setTransform(R.Z, 0, 0, R.Z, Math.round(p.x), Math.round(p.y));
      return R.ctx;
    },
    building(game, b, s, night) {
      const c = S.building(b, s, game.world);
      R.img(game, c, b.x, b.y + b.h, 0, c.height);
      if (night && (b.type === 'house' || b.type === 'inn')) {
        const g = R.art(game, b.x, b.y + b.h);
        g.fillStyle = 'rgba(255,210,120,0.95)';
        const wallH = Math.max(14, Math.round(b.h * 16 * 0.55));
        g.fillRect(3, -wallH + 4, 4, 4); g.fillRect(b.w * 16 - 7, -wallH + 4, 4, 4);
        R.ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      if (b.type === 'statue' || (b.type === 'house' && b.legend)) {
        // nothing extra; the plaque is read via interaction
      }
    },
    tent(game, x, y, i) {
      const g = R.art(game, x, y);
      const col = ['#8a3a2a', '#6a4a3a', '#7a5a3a', '#5a3a2a'][i % 4];
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(-12, 0, 24, 3);
      for (let r = 0; r < 14; r++) { g.fillStyle = r % 4 === 0 ? S.shade(col, -0.2) : col; g.fillRect(-r * 0.85 - 1, -14 + r, r * 1.7 + 2, 1); }
      g.fillStyle = '#2a1a14'; g.fillRect(-2, -6, 4, 6);
      g.fillStyle = '#4a3420'; g.fillRect(0, -17, 1, 4);
      R.ctx.setTransform(1, 0, 0, 1, 0, 0);
    },
    campfire(game, x, y) {
      const g = R.art(game, x, y);
      const t = game.time;
      g.fillStyle = '#4a4a4a'; g.fillRect(-6, -2, 12, 3);
      g.fillStyle = '#5a3a1a'; g.fillRect(-5, -3, 10, 2);
      const f = Math.sin(t * 13) * 1.5;
      g.fillStyle = '#ff6a2a'; g.fillRect(-3, -9 - f, 6, 7 + f);
      g.fillStyle = '#ffb347'; g.fillRect(-2, -7 - f, 4, 5 + f);
      g.fillStyle = '#ffe28a'; g.fillRect(-1, -5, 2, 3);
      R.ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (Math.random() < 0.05) ECHO.Combat.fx.push({ kind: 'smoke', x, y: y - 0.6, vx: 0.1, vy: -0.7, t: 0, life: 2, size: 2 });
    },
    forage(game, n) {
      const g = R.art(game, n.x, n.y);
      const R2 = (c, x, y, w, h) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
      if (n.k === 'berries') { R2('#3e6a2e', -5, -7, 10, 7); R2('#4e7a3a', -4, -8, 8, 2); for (const [x, y] of [[-3, -5], [1, -6], [3, -3], [-1, -3], [2, -7]]) R2(x > 1 ? '#3a3a9a' : '#c0203a', x, y, 1, 1); }
      if (n.k === 'mushrooms') { R2('#e8dcc0', -3, -3, 1, 3); R2('#b0402a', -4, -5, 3, 2); R2('#e8dcc0', 1, -2, 1, 2); R2('#8a5a3a', 0, -4, 3, 2); }
      if (n.k === 'herbs') { R2('#6aa84a', -3, -5, 1, 5); R2('#6aa84a', 0, -6, 1, 6); R2('#6aa84a', 2, -4, 1, 4); R2('#d8c8ff', 0, -7, 1, 1); R2('#d8c8ff', -3, -6, 1, 1); }
      if (n.k === 'honey') { R2('#5a3e26', -4, -4, 8, 4); R2('#c89a3a', -2, -9, 5, 5); R2('#a07a2a', -2, -7, 5, 1); }
      if (n.k === 'eggs') { R2('#7a6040', -4, -2, 8, 2); R2('#efe8d8', -2, -3, 2, 2); R2('#efe8d8', 1, -3, 2, 2); }
      R.ctx.setTransform(1, 0, 0, 1, 0, 0);
    },
    dragonShadow(game, f) {
      const g = R.art(game, f.x, f.y);
      g.rotate(Math.atan2(f.dy, f.dx));
      const flap = 1 + Math.sin(f.t * 4.5) * 0.12;
      g.scale(1.3 * 16, 1.3 * 16 * flap);
      g.globalAlpha = 0.35 * Math.min(1, f.t, f.dur - f.t);
      g.fillStyle = '#000';
      const P = [[3.2, 0], [2.2, 0.5], [1.0, 0.7], [0.4, 1.4], [-0.4, 3.4], [-1.2, 6.8], [-1.6, 5.2], [-2.2, 4.6], [-2.4, 3.2], [-3.0, 2.6], [-2.4, 1.2], [-2.6, 0.5], [-5.0, 0.25]];
      g.beginPath(); g.moveTo(P[0][0], P[0][1]);
      for (let i = 1; i < P.length; i++) g.lineTo(P[i][0], P[i][1]);
      for (let i = P.length - 1; i >= 0; i--) g.lineTo(P[i][0], -P[i][1]);
      g.fill();
      g.globalAlpha = 1;
      R.ctx.setTransform(1, 0, 0, 1, 0, 0);
    },
    bird(game, f, b) {
      const g = R.art(game, b.x, b.y);
      const col = f.kind === 'crow' ? '#1e1e22' : f.kind === 'gull' ? '#eeeeea' : '#7a5a3a';
      const flying = f.up && !(b.delay > 0);
      if (b.z < 0.4) { g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(-1, 0, 3, 1); }
      g.translate(0, -b.z * 16);
      g.fillStyle = col;
      const fl = Math.cos(b.dir) < 0 ? -1 : 1;
      if (flying) { const w = Math.sin(b.flap) > 0 ? -2 : 1; g.fillRect(-1, -1, 3, 2); g.fillRect(-3, w - 1, 2, 1); g.fillRect(2, w - 1, 2, 1); }
      else { const pk = b.peck < 0 && Math.sin(game.time * 6 + b.x * 9) > 0.4 ? 1 : 0; g.fillRect(-1, -2 + pk, 3, 2); g.fillRect(fl > 0 ? 2 : -2, -3 + pk * 2, 1, 1); g.fillStyle = f.kind === 'sparrow' ? '#c8a878' : col; g.fillRect(0, -1 + pk, 1, 1); }
      R.ctx.setTransform(1, 0, 0, 1, 0, 0);
    },
    bedroll(game, c) {
      const g = R.art(game, c.bx, c.by);
      g.rotate(-c.rot + Math.PI / 2);
      g.fillStyle = '#6a3e30'; g.fillRect(-12, -5, 24, 10);
      g.fillStyle = '#c8a860'; g.fillRect(3, -5, 2, 10);
      g.fillStyle = '#8a7a5a'; g.fillRect(-13, -4, 4, 8);
      R.ctx.setTransform(1, 0, 0, 1, 0, 0);
    },
    campRuin(game, c) {
      const g = R.art(game, c.x, c.y);
      g.fillStyle = '#3a3a3a'; g.fillRect(-6, -2, 12, 3); g.fillStyle = '#2a2a2a'; g.fillRect(-4, -3, 8, 2);
      g.fillStyle = '#5a3a2a'; g.fillRect(-30, -10, 10, 2); g.fillRect(20, 6, 9, 2);
      R.ctx.setTransform(1, 0, 0, 1, 0, 0);
    },
    cage(game, x, y) {
      const g = R.art(game, x, y + 1);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(-10, -1, 20, 3);
      g.fillStyle = '#4a3420'; g.fillRect(-9, -22, 18, 2); g.fillRect(-9, -2, 18, 2);
      for (let i = -9; i <= 8; i += 3) g.fillRect(i, -22, 1, 22);
      R.ctx.setTransform(1, 0, 0, 1, 0, 0);
    },
    boulder(game, r) {
      const g = R.art(game, r.x + 0.5, r.y + 1);
      const dmg = r.hp < 40;
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(-8, -1, 16, 3);
      g.fillStyle = '#7a756c'; g.fillRect(-7, -13, 14, 13); g.fillRect(-5, -16, 10, 3);
      g.fillStyle = '#9a958b'; g.fillRect(-5, -15, 7, 3); g.fillRect(-6, -12, 3, 6);
      g.fillStyle = '#5a564f'; g.fillRect(-7, -2, 14, 2);
      if (dmg) { g.fillStyle = '#3a3630'; g.fillRect(-2, -14, 1, 10); g.fillRect(1, -9, 4, 1); }
      R.ctx.setTransform(1, 0, 0, 1, 0, 0);
    },
    bones(game, l) {
      const g = R.art(game, l.x, l.y);
      g.fillStyle = '#e2dccb';
      g.fillRect(-20, 30, 6, 2); g.fillRect(14, -20, 2, 5); g.fillRect(30, 16, 5, 2); g.fillRect(-36, -12, 3, 3); g.fillRect(-8, 44, 7, 2);
      R.ctx.setTransform(1, 0, 0, 1, 0, 0);
    },
    tablet(game, r) {
      const g = R.art(game, r.x + 0.5, r.y - 1);
      const lang = game.world.lang;
      const tab = lang && lang.tablets[r.tablet];
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(-7, -1, 14, 3);
      g.fillStyle = '#6e6a62'; g.fillRect(-6, -24, 12, 24); g.fillRect(-4, -26, 8, 2);
      g.fillStyle = '#8a867d'; g.fillRect(-6, -24, 12, 2);
      const glow = tab && tab.key && lang.vault && lang.vault.revealed;
      g.fillStyle = glow ? '#bfe8ff' : '#4a4740';
      for (let i = 0; i < 5; i++) { g.fillRect(-4, -20 + i * 4, 3 + (i * 7) % 5, 1); g.fillRect(1, -20 + i * 4, 2 + (i * 3) % 3, 1); }
      R.ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (glow) game.light(r.x + 0.5, r.y - 2, 2.5, 0.6, '#bfe8ff');
    },
    rubble(game, x, y) {
      const g = R.art(game, x, y + 0.5);
      g.fillStyle = '#6a665e'; g.fillRect(-7, -4, 6, 4); g.fillRect(0, -3, 7, 3); g.fillRect(-3, -7, 5, 3);
      if (Math.sin(game.time * 3) > 0.6) { g.fillStyle = '#fff6c8'; g.fillRect(2, -6, 1, 1); g.fillRect(1, -5, 3, 1); g.fillRect(2, -4, 1, 1); }
      R.ctx.setTransform(1, 0, 0, 1, 0, 0);
    },
    structure(game, st) {
      const g = R.art(game, st.x + 0.5, st.y + 1);
      if (st.type === 'vaultstone') {
        const rev = game.world.lang.vault.revealed;
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(-8, -1, 16, 3);
        g.fillStyle = '#5a5a62'; g.fillRect(-7, -14, 14, 14);
        g.fillStyle = '#74747e'; g.fillRect(-7, -14, 14, 2);
        g.fillStyle = rev ? '#9fd3ff' : '#3e3e46';
        g.fillRect(-4, -11, 8, 1); g.fillRect(-1, -11, 2, 7); g.fillRect(-4, -6, 8, 1);
        if (rev) game.light(st.x + 0.5, st.y + 0.5, 3, 0.7, '#9fd3ff');
      } else if (st.type === 'vaultopen') {
        g.fillStyle = '#1a1a22'; g.fillRect(-7, -10, 14, 10);
        g.fillStyle = '#4a4a54'; for (let i = 0; i < 4; i++) g.fillRect(-6 + i, -9 + i * 2, 12 - i * 2, 1);
        game.light(st.x + 0.5, st.y + 0.5, 2.5, 0.5, '#9fd3ff');
      }
      R.ctx.setTransform(1, 0, 0, 1, 0, 0);
    },
    rift(game, rf) {
      const g = R.art(game, rf.x + 0.5, rf.y + 1);
      const t = game.time;
      for (let i = 0; i < 18; i++) {
        const a = t * 1.5 + i * 0.35;
        const rr = 10 + Math.sin(t * 2 + i) * 2;
        g.fillStyle = i % 3 === 0 ? '#e0c8ff' : i % 3 === 1 ? '#8a5aff' : '#5af0e0';
        g.fillRect(Math.cos(a) * rr * 0.6 - 1, -16 + Math.sin(a) * rr - 1, 3, 3);
      }
      g.fillStyle = 'rgba(20,0,40,0.85)'; g.fillRect(-4, -26, 8, 20);
      g.fillStyle = 'rgba(200,170,255,0.7)'; g.fillRect(-1, -24, 2, 16);
      R.ctx.setTransform(1, 0, 0, 1, 0, 0);
    },

    // Spiders and slimes, drawn by hand.
    drawShape(ctx, e, t) {
      const s = e.scale || 1;
      ctx.save(); ctx.scale(s, s);
      if (e.flip) ctx.scale(-1, 1);
      if (e.shape === 'spider') {
        const col = e.species === 'queen' ? '#3a1a2a' : '#2a2228', mv = e.moving ? Math.sin(t * 18) * 2 : 0;
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-7, 0, 14, 2);
        ctx.strokeStyle = col; ctx.lineWidth = 1;
        for (let i = 0; i < 4; i++) { const x = -3 + i * 2; ctx.beginPath(); ctx.moveTo(x, -4); ctx.lineTo(x - 4 + (i % 2 ? mv : -mv), 0); ctx.moveTo(x, -4); ctx.lineTo(x + 4 + (i % 2 ? -mv : mv), 0); ctx.stroke(); }
        ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(3, -6, 5, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(-3, -5, 3, 2.5, 0, 0, Math.PI * 2); ctx.fill();
        if (e.species === 'queen') { ctx.fillStyle = '#c83a3a'; ctx.fillRect(2, -8, 3, 2); }
        ctx.fillStyle = '#ff3a2a'; ctx.fillRect(-6, -6, 1, 1); ctx.fillRect(-5, -6, 1, 1);
      } else {
        const q = Math.sin(t * (e.moving ? 9 : 3) + e.id) * 0.1;
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-6, 0, 12, 2);
        ctx.fillStyle = e.species === 'slimeling' ? 'rgba(160,232,160,0.85)' : e.elite ? 'rgba(232,200,74,0.85)' : 'rgba(111,208,138,0.85)';
        ctx.beginPath(); ctx.ellipse(0, -4, 7 * (1 + q), 5 * (1 - q), 0, Math.PI, 0); ctx.lineTo(7, 0); ctx.lineTo(-7, 0); ctx.fill();
        ctx.fillStyle = '#103010'; ctx.fillRect(-3, -6, 1, 1); ctx.fillRect(1, -6, 1, 1);
      }
      ctx.restore();
    },
    // One gait state for the 2D horse, stepped once per frame.
    horseGait(game, v, key = 'player') {
      const G = R._hg || (R._hg = {}), T = R._hgT || (R._hgT = {});
      const st = G[key] || (G[key] = ECHO.Gait.make());
      const dt = T[key] == null ? 0 : Math.max(0, Math.min(0.1, game.time - T[key]));
      if (dt > 0) {
        ECHO.Gait.update(st, v, dt);
        const h = game.pl.horseAt, far = !game.pl.mounted && h && U.dist(h.x, h.y, game.pe.x, game.pe.y) > 16;
        if (!far) for (const i of st.hoofDown) ECHO.Sfx.play('hoof', { vol: (st.gait === 'gallop' ? 0.6 : 0.35) * (key === 'player' ? 1 : 0.5), pitch: i < 2 ? 1.05 : 0.95 });
      }
      T[key] = game.time;
      return st;
    },
    freeHorse(game, h, key = 'player', breed) {
      const p = R.toScreen(game, h.x, h.y), ctx = R.ctx;
      ctx.setTransform(R.Z, 0, 0, R.Z, Math.round(p.x), Math.round(p.y));
      const st = R.horseGait(game, h.v || 0, key);
      if (Math.cos(h.dir) < 0) ctx.scale(-1, 1);
      ECHO.Horse2D.draw(ctx, breed || game.pl.horse.breed, st, game.time, false);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    },
    // A boat, side on: a rowboat with oars dipping, or the broad ferry with its ferryman.
    boat2d(ctx, kind, rowing, t) {
      const ferry = kind === 'ferry', L = ferry ? 30 : 20;
      ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(-L / 2, 1, L, 2);
      ctx.fillStyle = ferry ? '#6a4a2e' : '#7a5636';
      ctx.beginPath(); ctx.moveTo(-L / 2 - 2, -5); ctx.lineTo(L / 2 + 2, -5); ctx.lineTo(L / 2 - 2, 1); ctx.lineTo(-L / 2 + 2, 1); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#9a7650'; ctx.fillRect(-L / 2, -5, L, 1);
      ctx.fillStyle = '#3a2818'; ctx.fillRect(-L / 2 + 2, -3, L - 4, 1);
      if (!ferry) {
        const a = rowing ? Math.sin(t * 2.2 * Math.PI * 2) * 0.5 : 0.2;
        ctx.strokeStyle = '#9a7650'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(1, -5); ctx.lineTo(1 + Math.cos(a + 2.2) * 12, -5 + Math.sin(a + 2.2) * 6 + 6); ctx.stroke();
      } else {
        ctx.fillStyle = '#5a4a3a'; ctx.fillRect(-L / 2 + 2, -14, 4, 9); ctx.fillStyle = '#e0ac85'; ctx.fillRect(-L / 2 + 2, -17, 4, 3);
        ctx.strokeStyle = '#9a7650'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-L / 2 + 1, -20); ctx.lineTo(-L / 2 - 6 + Math.sin(t * 1.4) * 2, 2); ctx.stroke();
      }
    },
    entity(game, e) {
      const world = game.world;
      const p = R.toScreen(game, e.x, e.y);
      const ctx = R.ctx;
      ctx.setTransform(R.Z, 0, 0, R.Z, Math.round(p.x), Math.round(p.y));
      if (e.dead) { ctx.globalAlpha = Math.max(0, 1 - (e.deathT || 0) / 3); ctx.rotate(Math.PI / 2 * Math.min(1, (e.deathT || 0) * 4)); }
      if (e.hurtT > 0) ctx.filter = 'brightness(2.2)';
      if (e.iframes > 0 && e === game.pe) ctx.globalAlpha = 0.55;
      if (e.type === 'ghost' || e.species === 'hind') { ctx.globalAlpha = Math.max(0, Math.min(1, e.alpha == null ? 1 : e.alpha)); if (e.type === 'ghost') ctx.filter = 'grayscale(1) brightness(1.9) sepia(0.3) hue-rotate(170deg)'; }
      if (e.type === 'person' && e.dancing) ctx.translate(0, -Math.abs(Math.sin(game.time * 7 + e.id)) * 2);
      // work and street life read as a rhythm in the sprite: the stroke of a hoe, a cheer, a bow of the head
      if (e.type === 'person' && e.chore && !e.moving) {
        const c = e.chore, ct = e.choreT || game.time;
        if (c === 'hoe' || c === 'chop' || c === 'hammer') { const k = (ct / (c === 'hammer' ? 0.85 : 1.4)) % 1; ctx.translate(0, k < 0.6 ? -k * 2 : -(1 - k) * 3); }
        else if (c === 'cheer') ctx.translate(0, -Math.abs(Math.sin(game.time * 9 + e.id)) * 2.5);
        else if (c === 'gather' || c === 'mourn' || c === 'pray') ctx.translate(0, c === 'gather' ? 3 : 1);
        else if (c === 'bucket' || c === 'sweep') ctx.translate(Math.sin(game.time * 5.5 + e.id) * 1.2, 0);
      }
      if (e.swimming) ctx.translate(0, 10 + Math.sin(game.time * 3) * 0.6);
      if (e.inBoat && !e.dead && e.inBoat !== 'passenger') { ctx.save(); if (e.flip) ctx.scale(-1, 1); R.boat2d(ctx, e.inBoat === 'ferry' ? 'ferry' : 'row', e === game.pe && e.rowing, game.time); ctx.restore(); ctx.translate(0, 3); }
      const mountedHere = (e === game.pe && e.mounted && game.pl.horse) || (e !== game.pe && e.mounted && !e.dead);
      if (mountedHere) {
        const me = e === game.pe;
        let v2 = me ? (e.rideV != null ? e.rideV : (e.moving ? 4 : 0)) : 0;
        if (!me) { const k = R._cv || (R._cv = {}); const c = k[e.id] || (k[e.id] = { x: e.x, y: e.y, t: game.time, v: 0 }); const dt2 = game.time - c.t; if (dt2 > 0.03) { c.v += (Math.hypot(e.x - c.x, e.y - c.y) / dt2 - c.v) * 0.5; c.x = e.x; c.y = e.y; c.t = game.time; } v2 = c.v; }
        const hs = R.horseGait(game, v2, me ? 'player' : 'c' + e.id);
        ctx.save(); if (e.flip) ctx.scale(-1, 1);
        const r = ECHO.Horse2D.draw(ctx, me ? game.pl.horse.breed : (e.horseBreed || 'pony'), hs, game.time, true);
        ctx.restore();
        ctx.translate(0, r.seat + 7.5);
      }
      if (e.shape === 'spider' || e.shape === 'slime') R.drawShape(ctx, e, game.time);
      else if (e.shape === 'rat') { ctx.scale(e.scale || 1, e.scale || 1); if (e.elite) ctx.filter = 'sepia(1) hue-rotate(-30deg)'; S.creature(ctx, { ...e, species: 'gnawer' }, game.time); }
      else if (e.humanoid && e.foe && e.foe.vis) {
        const V = e.foe.vis;
        ctx.filter = V.f2d || 'none';
        const fake = { prof: (V.show || []).includes('robe') ? 'priest' : 'bandit', id: 'f' + e.id, faction: 'wild' };
        const sc = e.scale || 1;
        if (!e.flip) S.person(ctx, e, fake, world, game.time, sc);
        else { ctx.scale(-1, 1); S.person(ctx, { ...e, flip: false }, fake, world, game.time, sc); }
      } else if (e.humanoid) {
        const lk = e.foe ? e.foe.look : 'brigand', dead = lk === 'wight' || lk === 'king';
        if (dead) ctx.filter = 'grayscale(0.6) hue-rotate(90deg) brightness(1.2)';
        const fake = { prof: dead ? 'priest' : 'bandit', id: 'f' + e.id, faction: 'wild' };
        if (!e.flip) S.person(ctx, e, fake, world, game.time, e.foe && e.foe.elite ? 1.15 : 1);
        else { ctx.scale(-1, 1); S.person(ctx, { ...e, flip: false }, fake, world, game.time, e.foe && e.foe.elite ? 1.15 : 1); }
      } else if (e.type === 'creature') { if (e.scale) ctx.scale(e.scale, e.scale); S.creature(ctx, e, game.time); }
      else if (e.type === 'boss') S.boss(ctx, e, game.time);
      else {
        const npc = e.npcId ? world.npcs[e.npcId] : null;
        if (e.gear && e.gear.cart) { ctx.save(); ctx.translate(e.flip ? 9 : -9, 0); S.cart(ctx); ctx.restore(); }
        if (!e.flip) S.person(ctx, e, npc, world, game.time);
        else { ctx.scale(-1, 1); S.person(ctx, { ...e, flip: false }, npc, world, game.time); }
      }
      ctx.filter = 'none';
      ctx.globalAlpha = 1;
      // In the water: the surface hides your legs, or all but your head and shoulders
      if (e._inWater && !e.dead) {
        ctx.setTransform(R.Z, 0, 0, R.Z, Math.round(p.x), Math.round(p.y));
        const deep = e._inWater === 'deep', top = deep ? -2 : -5, w = e.mounted || (e === game.pe && game.pl.mounted) ? 26 : 14;
        ctx.fillStyle = deep ? 'rgba(26,62,96,0.92)' : 'rgba(52,104,128,0.78)';
        ctx.fillRect(-w / 2, top, w, (deep ? 13 : 3) - top);
        ctx.fillStyle = 'rgba(223,242,255,0.75)';
        const ph = game.time * 4 + e.id;
        for (let i = 0; i < w; i += 3) ctx.fillRect(-w / 2 + i, top + Math.round(Math.sin(ph + i * 0.7) * 0.6), 2, 1);
      }
      // Bow draw / flame charge indicator
      if (e === game.pe && (ECHO.PlayerCtl.drawing || ECHO.PlayerCtl.charging)) {
        ctx.setTransform(R.Z, 0, 0, R.Z, Math.round(p.x), Math.round(p.y));
        const v = ECHO.PlayerCtl.drawing ? ECHO.PlayerCtl.draw : Math.min(1, ECHO.PlayerCtl.charge / 1.25);
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(-8, 3, 16, 2);
        ctx.fillStyle = ECHO.PlayerCtl.drawing ? '#e8d9a0' : ECHO.PlayerCtl.charge > 1 ? '#ff5a1f' : '#ffb347'; ctx.fillRect(-8, 3, 16 * v, 2);
      }
      if (e === game.pe && ECHO.PlayerCtl.studyT > 0) {
        ctx.setTransform(R.Z, 0, 0, R.Z, Math.round(p.x), Math.round(p.y));
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(-8, 3, 16, 2);
        ctx.fillStyle = '#9fe0c8'; ctx.fillRect(-8, 3, 16 * Math.min(1, ECHO.PlayerCtl.studyT / 1.6), 2);
      }
      // Health bars for wounded foes
      if (!e.dead && e !== game.pe && e.type !== 'boss' && e.hp < e.maxHp && e.type !== 'player') {
        ctx.setTransform(R.Z, 0, 0, R.Z, Math.round(p.x), Math.round(p.y));
        const w = e.type === 'creature' && e.species === 'wolf' ? 14 : 10;
        const top = e.type === 'creature' ? (e.species === 'wolf' ? -17 : -14) : -26;
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(-w / 2, top, w, 2);
        ctx.fillStyle = game.hostileTo(game.pe, e) ? '#d8463a' : '#c8b46a'; ctx.fillRect(-w / 2, top, w * Math.max(0, e.hp / e.maxHp), 2);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    },

    drawGround(game) {
      const ctx = R.ctx, Z = R.Z;
      for (const f of ECHO.Combat.fx) {
        if (f.kind !== 'tele') continue;
        if (f.follow && !f.follow.dead && f.shape !== 'circle') { f.x = f.follow.x; f.y = f.follow.y; }
        const prog = Math.min(1, f.t / f.life);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = f.color;
        ctx.strokeStyle = f.color.replace(/[\d.]+\)$/, '0.9)');
        ctx.lineWidth = Z;
        if (f.shape === 'circle') {
          const p = R.toScreen(game, f.cx != null ? f.cx : f.x, f.cy != null ? f.cy : f.y);
          ctx.beginPath(); ctx.arc(p.x, p.y, f.radius * TS * Z, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.arc(p.x, p.y, f.radius * TS * Z * prog, 0, Math.PI * 2); ctx.fill();
        } else if (f.shape === 'cone') {
          const p = R.toScreen(game, f.x, f.y);
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.arc(p.x, p.y, f.len * TS * Z, f.angle - f.arc / 2, f.angle + f.arc / 2); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.arc(p.x, p.y, f.len * TS * Z * prog, f.angle - f.arc / 2, f.angle + f.arc / 2); ctx.closePath(); ctx.fill();
        } else if (f.shape === 'line') {
          const p = R.toScreen(game, f.x, f.y);
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(f.angle);
          const w = (f.width || 0.6) * TS * Z, L = f.len * TS * Z;
          ctx.fillRect(0, -w / 2, L, w); ctx.strokeRect(0, -w / 2, L, w);
          ctx.fillRect(0, -w / 2, L * prog, w);
          ctx.restore();
        }
      }
      // loot
      for (const l of game.loot) {
        const g = R.art(game, l.x, l.y);
        const bob = Math.sin(game.time * 4 + l.x) * 1;
        const col = { meat: '#d88a8a', hide: '#8a6a4a', gold: '#f2d14b', item: (l.itemId && ECHO.Game.world.items[l.itemId] && ECHO.Gear.rarity(ECHO.Game.world.items[l.itemId].rarity).color) || '#f2e6b0', food: '#d8b86a', ore: '#8a8a92', arms: '#a8a8b0', herbs: '#7ac87a', timber: '#8a6a42' }[l.kind] || (ECHO.Gear.MATS[l.kind] || {}).color || '#fff';
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(-3, 1, 6, 2);
        g.fillStyle = col;
        if (l.kind === 'item') { g.fillRect(-5, -2 + bob, 10, 1); g.fillRect(-1, -4 + bob, 1, 5); if (Math.sin(game.time * 5) > 0.7) { g.fillStyle = '#fff'; g.fillRect(3, -4 + bob, 1, 1); } }
        else g.fillRect(-2, -3 + bob, 4, 3);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    },

    drawFx(game) {
      const ctx = R.ctx, Z = R.Z;
      for (const p of ECHO.Combat.proj) {
        const g = R.art(game, p.x, p.y);
        if (p.kind === 'arrow' || p.kind === 'bolt') {
          g.rotate(p.angle);
          g.fillStyle = '#d8c8a0'; g.fillRect(-5, 0, 8, 1);
          g.fillStyle = '#c8c8d0'; g.fillRect(3, -1, 2, 3);
          g.fillStyle = '#e8e0d0'; g.fillRect(-6, -1, 2, 1); g.fillRect(-6, 1, 2, 1);
        } else if (p.kind === 'fire') {
          const s = 3 + p.radius * 1.5;
          g.fillStyle = p.star ? '#bfe3ff' : '#ff6a2a'; g.fillRect(-s / 2, -s / 2 - 4, s, s);
          g.fillStyle = p.star ? '#ffffff' : '#ffd36a'; g.fillRect(-s / 4, -s / 4 - 4, s / 2, s / 2);
          game.light(p.x, p.y - 0.25, 2.8 + p.radius, 0.9, p.star ? '#bfe3ff' : '#ff9a3c');
        } else if (p.kind === 'orb') {
          g.fillStyle = p.color || '#b48aff'; g.beginPath(); g.arc(0, -4, 2.5, 0, Math.PI * 2); g.fill();
          g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(-1, -5, 1, 1);
        } else if (p.kind === 'spit') {
          g.fillStyle = '#9ad84a'; g.fillRect(-2, -6, 4, 4);
        }
      }
      for (const f of ECHO.Combat.fx) {
        const prog = f.t / f.life;
        if (f.kind === 'p') {
          const g = R.art(game, f.x, f.y);
          g.globalAlpha = Math.max(0, 1 - prog);
          g.fillStyle = f.color; g.fillRect(-f.size / 2, -f.size / 2, f.size, f.size);
          g.globalAlpha = 1;
        } else if (f.kind === 'smoke') {
          f.x += f.vx * 0.016; f.y += f.vy * 0.016;
          const g = R.art(game, f.x, f.y);
          g.globalAlpha = Math.max(0, 0.35 * (1 - prog));
          g.fillStyle = '#9a9a9a'; const s = f.size + prog * 4; g.fillRect(-s / 2, -s / 2, s, s);
          g.globalAlpha = 1;
        } else if (f.kind === 'slash') {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          const p = R.toScreen(game, f.x, f.y);
          ctx.strokeStyle = f.color; ctx.globalAlpha = 1 - prog;
          ctx.lineWidth = 2 * Z;
          ctx.beginPath(); ctx.arc(p.x, p.y, f.range * TS * Z * (0.7 + prog * 0.3), f.angle - f.arc / 2, f.angle + f.arc / 2); ctx.stroke();
          ctx.globalAlpha = 1;
        } else if (f.kind === 'ring') {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          const p = R.toScreen(game, f.x, f.y);
          ctx.strokeStyle = f.color; ctx.globalAlpha = 1 - prog; ctx.lineWidth = 2 * Z;
          ctx.beginPath(); ctx.arc(p.x, p.y, f.radius * TS * Z * (0.3 + prog * 0.7), 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = 1;
        } else if (f.kind === 'echo') {
          const g = R.art(game, f.x, f.y);
          g.globalAlpha = 0.5 * (1 - prog);
          g.filter = 'hue-rotate(160deg) brightness(1.4)';
          S.person(g, { ...game.pe, flip: f.flip, moving: false }, null, game.world, game.time);
          g.filter = 'none'; g.globalAlpha = 1;
        }
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    },

    drawLighting(game, dt) {
      const world = game.world;
      const dl = T.daylight(world.minute);
      const ctx = R.ctx;
      if (dl < 0.999) {
        const l = R.lctx;
        l.setTransform(1, 0, 0, 1, 0, 0);
        l.globalCompositeOperation = 'source-over';
        l.clearRect(0, 0, R.cw, R.ch);
        const dark = (1 - dl) * 0.84;
        l.fillStyle = `rgba(8,10,28,${dark})`;
        l.fillRect(0, 0, R.cw, R.ch);
        l.globalCompositeOperation = 'destination-out';
        const flick = 1 + Math.sin(game.time * 9) * 0.03;
        for (const L of game.lights) {
          if (!R.onScreen(game, L.x, L.y, L.r + 2)) continue;
          const p = R.toScreen(game, L.x, L.y);
          const rr = L.r * TS * R.Z * flick;
          const g = l.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr);
          g.addColorStop(0, `rgba(0,0,0,${L.a})`);
          g.addColorStop(0.55, `rgba(0,0,0,${L.a * 0.55})`);
          g.addColorStop(1, 'rgba(0,0,0,0)');
          l.fillStyle = g;
          l.fillRect(p.x - rr, p.y - rr, rr * 2, rr * 2);
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(R.light, 0, 0);
        // warm glow
        ctx.globalCompositeOperation = 'lighter';
        for (const L of game.lights) {
          if (!R.onScreen(game, L.x, L.y, L.r)) continue;
          const p = R.toScreen(game, L.x, L.y);
          const rr = L.r * TS * R.Z * 0.6;
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr);
          g.addColorStop(0, R.rgba(L.color, 0.16 * (1 - dl) * L.a));
          g.addColorStop(1, R.rgba(L.color, 0));
          ctx.fillStyle = g;
          ctx.fillRect(p.x - rr, p.y - rr, rr * 2, rr * 2);
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      // dusk / dawn warmth
      const m = world.minute;
      const dusk = (m > 1050 && m < 1260) ? 1 - Math.abs(m - 1155) / 105 : (m > 300 && m < 450) ? 1 - Math.abs(m - 375) / 75 : 0;
      if (dusk > 0) { ctx.fillStyle = `rgba(255,120,50,${0.1 * dusk})`; ctx.fillRect(0, 0, R.cw, R.ch); }
      void dt;
    },
    // Wisps, fireflies, lanterns, fallen stars: soft lights drawn over the dark.
    drawGlows(game) {
      const list = (ECHO.Marvels ? ECHO.Marvels.glows : []).concat(ECHO.Fest ? ECHO.Fest.glows : [], ECHO.Quests ? ECHO.Quests.glows : [], ECHO.Patrol ? ECHO.Patrol.glows : [], ECHO.Finds ? ECHO.Finds.glows : [], ECHO.Purpose ? ECHO.Purpose.glows : [], ECHO.Progress ? ECHO.Progress.glows : [], ECHO.Jobs ? ECHO.Jobs.glows : []);
      if (!list.length) return;
      const ctx = R.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      for (const g of list) {
        if (!R.onScreen(game, g.x, g.y, 4)) continue;
        const p = R.toScreen(game, g.x, g.y);
        const y = p.y - g.h * TS * R.Z * 0.85, rr = Math.max(2, g.s * TS * R.Z * 0.75);
        const gr = ctx.createRadialGradient(p.x, y, 0, p.x, y, rr);
        gr.addColorStop(0, R.rgba(g.c, Math.min(1, g.a))); gr.addColorStop(0.35, R.rgba(g.c, g.a * 0.45)); gr.addColorStop(1, R.rgba(g.c, 0));
        ctx.fillStyle = gr; ctx.fillRect(p.x - rr, y - rr, rr * 2, rr * 2);
      }
      ctx.globalCompositeOperation = 'source-over';
    },
    bonfire(game, x, y) {
      const g = R.art(game, x, y);
      const t = game.time;
      g.fillStyle = '#3a3a3a'; g.fillRect(-10, -2, 20, 4);
      g.fillStyle = '#5a3a1a'; g.fillRect(-9, -4, 18, 3); g.fillRect(-6, -7, 3, 5); g.fillRect(3, -7, 3, 5);
      const f = Math.sin(t * 13) * 2, f2 = Math.sin(t * 9 + 1) * 1.5;
      g.fillStyle = '#ff5a1f'; g.fillRect(-6, -18 - f, 12, 15 + f);
      g.fillStyle = '#ff9a3c'; g.fillRect(-4, -15 - f2, 8, 12 + f2);
      g.fillStyle = '#ffe28a'; g.fillRect(-2, -10, 4, 7);
      R.ctx.setTransform(1, 0, 0, 1, 0, 0);
    },
    festStall(game, L) {
      const g = R.art(game, L.stall.x, L.stall.y);
      const c = L.f.colors;
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(-14, -1, 28, 3);
      g.fillStyle = '#6a4a2c'; g.fillRect(-12, -10, 24, 10); g.fillRect(-13, -24, 2, 24); g.fillRect(11, -24, 2, 24);
      for (let i = 0; i < 6; i++) { g.fillStyle = c[i % c.length]; g.fillRect(-14 + i * 5, -28, 5, 6); }
      g.fillStyle = '#e8d9a0'; g.fillRect(-8, -13, 4, 3); g.fillRect(2, -13, 5, 3);
      R.ctx.setTransform(1, 0, 0, 1, 0, 0);
    },
    target(game, t) {
      const g = R.art(game, t.x, t.y);
      g.fillStyle = '#5a3e26'; g.fillRect(-5, -6, 2, 6); g.fillRect(3, -6, 2, 6);
      const rings = ['#e8e0d0', '#c8463a', '#e8e0d0', '#c8463a', '#f2d060'];
      for (let i = 0; i < 5; i++) { const r = 8 - i * 1.6; g.fillStyle = t.flash > 0 && i === 4 ? '#ffffff' : rings[i]; g.beginPath(); g.arc(0, -14, r, 0, Math.PI * 2); g.fill(); }
      R.ctx.setTransform(1, 0, 0, 1, 0, 0);
    },
    rgba(hex, a) {
      const n = parseInt(hex.slice(1), 16);
      return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
    },
    drawSnow(game, dt) {
      const ctx = R.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = 'rgba(235,242,250,0.8)';
      for (const f of R.snow) {
        f.y += dt * 0.05 * f.s; f.x += dt * 0.012 * Math.sin(game.time + f.d * 6);
        if (f.y > 1) { f.y = 0; f.x = Math.random(); }
        const s = Math.max(1, R.dpr * (1 + f.s));
        ctx.fillRect(((f.x + 1) % 1) * R.cw, f.y * R.ch, s, s);
      }
      ctx.fillStyle = 'rgba(200,220,255,0.05)'; ctx.fillRect(0, 0, R.cw, R.ch);
    },

    drawLabels(game) {
      const ctx = R.ctx, world = game.world;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const fs = Math.round(11 * R.dpr * Math.max(1, R.Z / 3));
      ctx.font = `${fs}px "Pixelify Sans", monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      const mouse = game.screenToWorld(ECHO.Input.mx, ECHO.Input.my);
      // shop signs
      const st = ECHO.World.settlementAt(world, game.pe.x, game.pe.y, 26);
      if (st) for (const b of st.buildings) {
        const info = ECHO.UI.shopInfo(b, st);
        if (!info || U.dist(b.x + b.w / 2, b.y + b.h / 2, game.pe.x, game.pe.y) > 18) continue;
        const p = R.toScreen(game, b.x + b.w / 2, b.y - 0.3);
        const t1 = info.icon + ' ' + info.title, w = Math.max(ctx.measureText(t1).width, ctx.measureText(info.sub).width) + 12 * R.dpr;
        ctx.fillStyle = 'rgba(28,20,12,0.82)'; ctx.fillRect(p.x - w / 2, p.y - fs * 2 - 10 * R.dpr, w, fs * 2 + 8 * R.dpr);
        ctx.strokeStyle = 'rgba(230,192,106,0.85)'; ctx.strokeRect(p.x - w / 2, p.y - fs * 2 - 10 * R.dpr, w, fs * 2 + 8 * R.dpr);
        ctx.fillStyle = '#f2d47a'; ctx.fillText(t1, p.x, p.y - fs - 6 * R.dpr);
        ctx.fillStyle = '#e8dcc0'; ctx.fillText(info.sub, p.x, p.y - 4 * R.dpr);
      }
      const text = (t, x, y, col, bg) => {
        const w = ctx.measureText(t).width;
        if (bg) { ctx.fillStyle = bg; ctx.fillRect(x - w / 2 - 4 * R.dpr, y - fs - 3 * R.dpr, w + 8 * R.dpr, fs + 5 * R.dpr); }
        ctx.lineWidth = 3 * R.dpr; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.strokeText(t, x, y);
        ctx.fillStyle = col; ctx.fillText(t, x, y);
      };
      if (ECHO.Progress) for (const ll of ECHO.Progress.lootLabels(game)) { if (!R.onScreen(game, ll.x, ll.y)) continue; const p = R.toScreen(game, ll.x, ll.y); text(ll.text, p.x, p.y - 8 * R.Z, ll.color); }
      if (ECHO.Progress) for (const sl of ECHO.Progress.siteLabels(game)) { if (!R.onScreen(game, sl.x, sl.y)) continue; const p = R.toScreen(game, sl.x, sl.y); ctx.globalAlpha = sl.a; text(sl.text, p.x, p.y - 30 * R.Z, sl.color); ctx.globalAlpha = 1; }
      for (const e of game.ents) {
        if (e.dead || e.hidden || e === game.pe) continue;
        if (!R.onScreen(game, e.x, e.y)) continue;
        const p = R.toScreen(game, e.x, e.y);
        const top = p.y - (e.type === 'boss' ? 48 : e.type === 'creature' ? 18 : 28) * R.Z;
        const hover = U.dist(mouse.x, mouse.y, e.x, e.y - 0.5) < 0.8;
        if (e.say && e.sayT > 0) {
          const w = ctx.measureText(e.say).width;
          ctx.fillStyle = 'rgba(250,244,228,0.95)';
          ctx.fillRect(p.x - w / 2 - 6 * R.dpr, top - fs - 10 * R.dpr, w + 12 * R.dpr, fs + 8 * R.dpr);
          ctx.fillStyle = '#2a2420'; ctx.fillText(e.say, p.x, top - 5 * R.dpr);
          continue;
        }
        if (e.type === 'boss') { const lb = ECHO.Progress ? ECHO.Progress.label(game, e) : { text: e.label, color: '#ffcf8a' }; text(lb.text, p.x, top, lb.color); continue; }
        if (e.marvel) { if (e.label && U.dist(e.x, e.y, game.pe.x, game.pe.y) < 6) text(e.label, p.x, top, '#bfe8ff'); continue; }
        if (e.yielded) { text('yields — [E] to spare', p.x, top, '#9fe0c8'); continue; }
        if (e.sleeping && hover) { text('asleep', p.x, top, '#9fb7d8'); continue; }
        const foeish = ECHO.Progress && (e.type === 'creature' || e.type === 'person') && e.species !== 'hare' && e.species !== 'gnawer' && e.species !== 'hind' && ECHO.Progress.counts(game, e);
        if (foeish) {
          if (hover || e === ECHO.PlayerCtl.lock || e.boss2 || e.beast || U.dist(e.x, e.y, game.pe.x, game.pe.y) < 9) {
            const lb = ECHO.Progress.label(game, e);
            text(lb.text, p.x, top, lb.color);
            if (e.hp < e.maxHp && e.type === 'creature') { const bw = 44 * R.dpr, bh = 4 * R.dpr; ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(p.x - bw / 2, top + 4 * R.dpr, bw, bh); ctx.fillStyle = e.boss2 ? '#ffcf5a' : '#e05a4a'; ctx.fillRect(p.x - bw / 2, top + 4 * R.dpr, bw * Math.max(0, e.hp / e.maxHp), bh); }
          }
          continue;
        }
        if (e.type === 'person' && (hover || (e.carrying && U.dist(e.x, e.y, game.pe.x, game.pe.y) < 6))) {
          const npc = world.npcs[e.npcId];
          if (!npc) continue;
          let label = ECHO.People.fullTitle(world, npc);
          const it = e.carrying && world.items[e.carrying];
          const col = game.hostileTo(game.pe, e) ? '#ff8a7a' : e.isCompanion ? '#9fe0c8' : '#f0e6d0';
          text(label, p.x, top, col);
          if (it) {
            const yours = game.pl && it.history.some(h => h.t.includes(game.pl.first + ' ' + game.pl.last));
            text(yours ? '(carrying your sword)' : it.legend ? `(carrying ${it.name})` : '', p.x, top + fs + 2 * R.dpr, '#f2d47a');
          }
        } else if (e.type === 'creature' && e.lvl && !e.dead) {
          if (hover || e.label || U.dist(e.x, e.y, game.pe.x, game.pe.y) < 8) {
            text(`${e.label || e.foe.name} · lv ${e.lvl}`, p.x, top, e.boss2 ? '#ffcf5a' : e.elite ? '#ff9a7a' : '#ffb0a0');
            if (e.hp < e.maxHp) { const bw = 44 * R.dpr, bh = 4 * R.dpr; ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(p.x - bw / 2, top + 4 * R.dpr, bw, bh); ctx.fillStyle = e.boss2 ? '#ffcf5a' : '#e05a4a'; ctx.fillRect(p.x - bw / 2, top + 4 * R.dpr, bw * Math.max(0, e.hp / e.maxHp), bh); }
          }
        } else if (e.type === 'creature' && e.label && !e.marvel) {
          if (hover || (e.foe && e.foe.elite) || e.beast || U.dist(e.x, e.y, game.pe.x, game.pe.y) < 7) text(e.label, p.x, top, '#ffb0a0');
        } else if (e.type === 'creature' && hover) {
          const reg = world.regions[e.regionId];
          text(e.humanoid ? e.foe.name : e.fname || ECHO.Ecology.speciesName(world, reg, e.species), p.x, top, game.hostileTo(game.pe, e) ? '#ffb0a0' : '#e0e0d0');
        }
      }
      // floaters
      for (const f of ECHO.Combat.floaters) {
        if (!R.onScreen(game, f.x, f.y)) continue;
        const p = R.toScreen(game, f.x, f.y);
        ctx.globalAlpha = Math.max(0, 1 - f.t / f.life);
        if (f.big) ctx.font = `${Math.round(fs * 1.35)}px "Pixelify Sans", monospace`;
        text(f.text, p.x, p.y, f.color);
        if (f.big) ctx.font = `${fs}px "Pixelify Sans", monospace`;
        ctx.globalAlpha = 1;
      }
      if (ECHO.Marvels && !ECHO.Interior.cur) { ECHO.Marvels.drawSky(ctx, game, R.cw, R.ch); ECHO.Marvels.drawHints(ctx, game, (x, y) => R.toScreen(game, x, y), R.cw, R.ch); }
      if (ECHO.Fest) ECHO.Fest.drawHUD(ctx, game, R.cw);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      // interaction prompt
      if (game.pl && !ECHO.UI.blocksWorld()) {
        const its = game.interactables();
        game._interact = its[0] || null;
        if (its[0]) {
          const p = R.toScreen(game, game.pe.x, game.pe.y);
          text(`[E] ${its[0].label}`, p.x, p.y + 14 * R.Z, '#ffe8a8', 'rgba(20,16,12,0.75)');
        }
      }
    },

    // A whole-world map image, 1px per tile.
    mapImage(world) {
      const c = document.createElement('canvas');
      c.width = world.W; c.height = world.H;
      const g = c.getContext('2d');
      const img = g.createImageData(world.W, world.H);
      const COL = {
        0: [29, 58, 95], 1: [46, 95, 140], 2: [214, 192, 138], 3: [86, 132, 62], 4: [62, 100, 48], 5: [45, 80, 40], 6: [123, 122, 85],
        7: [107, 103, 98], 8: [150, 120, 70], 9: [151, 129, 93], 10: [65, 83, 58], 11: [228, 234, 237], 12: [119, 114, 106], 13: [138, 106, 66], 14: [139, 133, 122], 15: [91, 87, 80]
      };
      for (let i = 0; i < world.W * world.H; i++) {
        const c3 = COL[world.tiles[i]] || [255, 0, 255];
        img.data[i * 4] = c3[0]; img.data[i * 4 + 1] = c3[1]; img.data[i * 4 + 2] = c3[2]; img.data[i * 4 + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      return c;
    }
  };
})();
