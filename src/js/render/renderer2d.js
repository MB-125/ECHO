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

    draw(game, dt) {
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
        objs.push({ y: y + 1, draw: () => R.img(game, S.tree(kind, season, (h * 7) | 0), x + 0.5, y + 1, 12, 33) });
      }
      for (const s of world.settlements) {
        if (Math.abs(s.x - cam.x) > halfW + 20 || Math.abs(s.y - cam.y) > halfH + 20) continue;
        for (const b of s.buildings) {
          objs.push({ y: b.y + b.h, draw: () => R.building(game, b, s, night) });
          if (night && (b.type === 'house' || b.type === 'inn' || b.type === 'keep' || b.type === 'temple')) game.light(b.x + b.w / 2, b.y + b.h, b.type === 'house' ? 1.6 : 2.6, 0.55, '#ffcf80');
          if (b.type === 'lamp' && (night || T.daylight(world.minute) < 0.6)) {
            const era = world.factions[s.faction] ? world.factions[s.faction].tech.era : 0;
            game.light(b.x + 0.5, b.y + 0.4, era >= 4 ? 7 : 3.2, 0.85, era >= 4 && world.factions[s.faction].tech.path === 'arcane' ? '#bfe8ff' : '#ffd08a');
          }
          if (b.type === 'smithy' && Math.random() < dt * 3) ECHO.Combat.fx.push({ kind: 'smoke', x: b.x + b.w - 0.6, y: b.y - 0.2, vx: 0.2, vy: -0.6, t: 0, life: 2.2, size: 3 });
        }
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
      if (world.rift && Math.abs(world.rift.x - cam.x) < halfW + 6 && Math.abs(world.rift.y - cam.y) < halfH + 6) {
        objs.push({ y: world.rift.y + 1, draw: () => R.rift(game, world.rift) });
        game.light(world.rift.x + 0.5, world.rift.y, 6, 0.9, '#b48aff');
      }
      for (const e of game.ents) {
        if (e.hidden) continue;
        if (Math.abs(e.x - cam.x) > halfW + 3 || Math.abs(e.y - cam.y) > halfH + 3) continue;
        objs.push({ y: e.y, draw: () => R.entity(game, e) });
        if (e.gear && e.gear.torch && !e.dead) game.light(e.x, e.y - 0.6, 4, 0.8, '#ffb060');
        if (e.burn > 0) game.light(e.x, e.y - 0.4, 2.5, 0.6, '#ff8a2a');
        if (e.mutation === 'glasshorn' && night) game.light(e.x, e.y - 0.5, 2, 0.6, '#cfefff');
      }
      objs.sort((a, b) => a.y - b.y);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      for (const o of objs) o.draw();
      // Projectiles & effects
      R.drawLock(game);
      R.drawFx(game);
      // Lighting
      R.drawLighting(game, dt);
      // Season
      if (season === 3) R.drawSnow(game, dt);
      // Overlays: labels, bubbles, floaters
      R.drawLabels(game);
    },

    // Simple top-down room view for the 2D renderer.
    FURN_COL: { bed: '#8a3a3a', table: '#7a5634', chair: '#6a4a2c', stool: '#6a4a2c', counter: '#5a3e26', barrel: '#6e4a28', crate: '#8a6a3a', hearth: '#5a554e', shelf: '#4a3420', desk: '#6a4a2c', lectern: '#5a3e26', altar: '#d8d0c0', throne: '#c8a040', bench: '#6a4a2c', rug: '#7a2e2e', anvil: '#3a3a40', forge: '#4a4440', rack: '#5a4a3a', chest: '#7a5a2a', candles: '#f0e0b0', standard: '#6f8fc4', pillar: '#a8a094' },
    drawRoom(game, L) {
      const ctx = R.ctx, B = ECHO.Interior.BASE, Z = R.Z;
      const floorCol = { wood: '#6e4c2e', stone: '#6a655d', marble: '#cfc8ba' }[L.floor];
      const wallCol = { plaster: '#b8a47e', stone: '#5e5850', marble: '#bdb5a6' }[L.wall];
      for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) {
        const p = R.toScreen(game, B + x, y);
        const edge = x === 0 || y === 0 || x === L.W - 1 || y === L.H - 1;
        ctx.fillStyle = edge ? (x === L.doorX && y === L.H - 1 ? '#2a1c12' : wallCol) : ((x + y) % 2 ? floorCol : R.shade(floorCol));
        ctx.fillRect(Math.round(p.x), Math.round(p.y), Math.ceil(TS * Z), Math.ceil(TS * Z));
      }
      const objs = [];
      for (const f of L.furn) objs.push({ y: f.y + f.h / 2, draw: () => {
        const p = R.toScreen(game, B + f.x - f.w / 2 * f.scale, f.y - f.h / 2 * f.scale);
        const w = f.w * TS * Z * f.scale * 0.92, h = f.h * TS * Z * f.scale * 0.92;
        ctx.fillStyle = (f.colors && f.colors.banner && f.model !== 'throne') ? f.colors.banner : (R.FURN_COL[f.model] || '#6a4a2c');
        ctx.fillRect(Math.round(p.x), Math.round(p.y), w, h);
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(Math.round(p.x), Math.round(p.y + h - 3 * Z), w, 3 * Z);
        if (f.light) game.light(B + f.x, f.y, f.light.r * 0.6, 0.5, f.light.color);
      } });
      for (const e of game.ents) if (!e.hidden) objs.push({ y: e.y, draw: () => R.entity(game, e) });
      objs.sort((a, b) => a.y - b.y);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      for (const o of objs) o.draw();
      R.drawLock(game);
      R.drawFx(game);
      R.drawLabels(game);
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

    entity(game, e) {
      const world = game.world;
      const p = R.toScreen(game, e.x, e.y);
      const ctx = R.ctx;
      ctx.setTransform(R.Z, 0, 0, R.Z, Math.round(p.x), Math.round(p.y));
      if (e.dead) { ctx.globalAlpha = Math.max(0, 1 - (e.deathT || 0) / 3); ctx.rotate(Math.PI / 2 * Math.min(1, (e.deathT || 0) * 4)); }
      if (e.hurtT > 0) ctx.filter = 'brightness(2.2)';
      if (e.iframes > 0 && e === game.pe) ctx.globalAlpha = 0.55;
      if (e.type === 'creature') S.creature(ctx, e, game.time);
      else if (e.type === 'boss') S.boss(ctx, e, game.time);
      else {
        const npc = e.npcId ? world.npcs[e.npcId] : null;
        if (e.gear && e.gear.cart) { ctx.save(); ctx.translate(e.flip ? 9 : -9, 0); S.cart(ctx); ctx.restore(); }
        if (!e.flip) S.person(ctx, e, npc, world, game.time);
        else { ctx.scale(-1, 1); S.person(ctx, { ...e, flip: false }, npc, world, game.time); }
      }
      ctx.filter = 'none';
      ctx.globalAlpha = 1;
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
        const col = { meat: '#d88a8a', hide: '#8a6a4a', gold: '#f2d14b', item: '#f2e6b0', food: '#d8b86a', ore: '#8a8a92', arms: '#a8a8b0', herbs: '#7ac87a', timber: '#8a6a42' }[l.kind] || '#fff';
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
      const text = (t, x, y, col, bg) => {
        const w = ctx.measureText(t).width;
        if (bg) { ctx.fillStyle = bg; ctx.fillRect(x - w / 2 - 4 * R.dpr, y - fs - 3 * R.dpr, w + 8 * R.dpr, fs + 5 * R.dpr); }
        ctx.lineWidth = 3 * R.dpr; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.strokeText(t, x, y);
        ctx.fillStyle = col; ctx.fillText(t, x, y);
      };
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
        if (e.type === 'boss') { text(e.label, p.x, top, '#ffcf8a'); continue; }
        if (e.yielded) { text('yields — [E] to spare', p.x, top, '#9fe0c8'); continue; }
        if (e.sleeping && hover) { text('asleep', p.x, top, '#9fb7d8'); continue; }
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
        } else if (e.type === 'creature' && hover) {
          const reg = world.regions[e.regionId];
          text(ECHO.Ecology.speciesName(world, reg, e.species), p.x, top, game.hostileTo(game.pe, e) ? '#ffb0a0' : '#e0e0d0');
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
