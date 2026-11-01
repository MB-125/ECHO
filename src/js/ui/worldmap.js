// The world map: a parchment chart that pans and zooms, with every place you
// know drawn as an icon you can tell apart at a glance — dungeons above all,
// ringed in the colour of their danger to you — a list of the dungeons you
// know, a card for whatever you click, and a waypoint the line at the top of
// the screen will follow.
(function () {
  const { U } = ECHO;
  const Globe = () => ECHO.Globe;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const T = () => ECHO.TILE;
  const PARCH = '#d8c7a0', INK = '#3a2a18';
  const LAYERS = [['dungeons', 'Dungeons'], ['towns', 'Towns'], ['gates', 'Gates'], ['danger', 'Camps & lairs'], ['places', 'Landmarks'], ['wonders', 'Wonders & ruins'], ['quests', 'Quests'], ['regions', 'Region names']];
  const DIRS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];

  const WM = ECHO.WorldMap = {
    layers: null, view: null, sel: null, hover: null, feats: [],
    _base: null, _baseKey: null,

    // ------------------------------------------------------------ the land, drawn once
    // A painted chart: several pixels to a tile, colours blended between tiles,
    // relief shaded from the north-west off a smoothed height of the land, crisp
    // shorelines with the shallows lighter, the woods dotted with trees, the deep
    // woods dark, and the trails worn through the forests.
    base(world) {
      const key = world.id + '|' + (world._tileEpoch || 0) + '|' + world.W + '|' + world.H + '|' + (world._trail ? 1 : 0);
      if (WM._base && WM._baseKey === key) return WM._base;
      const W = world.W, H = world.H;
      const S = U.clamp(Math.floor(2600 / Math.max(W, H)), 1, 4);
      // a round world is made a piece at a time: paint only the new pieces
      const dirty = world._mapDirty;
      if (WM._base && WM._baseOf === world && WM._baseWH === W + 'x' + H && WM.baseScale === S && Array.isArray(dirty) && dirty.length) {
        const g = WM._base.getContext('2d'), M = 12;
        for (const r of dirty) {
          const x0 = Math.max(0, Math.floor(r.x0) - M), y0 = Math.max(0, Math.floor(r.y0) - M), x1 = Math.min(W, Math.ceil(r.x1) + M), y1 = Math.min(H, Math.ceil(r.y1) + M);
          const ix0 = Math.max(0, Math.floor(r.x0) - 2), iy0 = Math.max(0, Math.floor(r.y0) - 2), ix1 = Math.min(W, Math.ceil(r.x1) + 2), iy1 = Math.min(H, Math.ceil(r.y1) + 2);
          g.putImageData(WM.paint(world, x0, y0, x1, y1, S), x0 * S, y0 * S, (ix0 - x0) * S, (iy0 - y0) * S, (ix1 - ix0) * S, (iy1 - iy0) * S);
        }
        world._mapDirty = null; WM._baseKey = key;
        return WM._base;
      }
      WM.baseScale = S;
      const c = document.createElement('canvas'); c.width = W * S; c.height = H * S;
      c.getContext('2d').putImageData(WM.paint(world, 0, 0, W, H, S), 0, 0);
      world._mapDirty = null;
      WM._base = c; WM._baseKey = key; WM._baseOf = world; WM._baseWH = W + 'x' + H;
      return c;
    },
    // The painted chart of the tiles from (X0, Y0) to (X1, Y1), S pixels to a tile.
    // Land no one has come near yet (on a round world) is a pale uncharted mist.
    paint(world, X0, Y0, X1, Y1, S) {
      const Tl = T(), WW = world.W, W = X1 - X0, H = Y1 - Y0, N = W * H;
      const COL = { 0: [30, 58, 96], 1: [64, 112, 152], 2: [226, 206, 152], 3: [126, 156, 84], 4: [86, 122, 62], 5: [60, 96, 50], 6: [156, 146, 104],
        7: [128, 122, 114], 8: [190, 164, 96], 9: [176, 148, 104], 10: [92, 108, 76], 11: [238, 242, 244], 12: [146, 138, 122], 13: [150, 116, 76], 14: [182, 164, 124], 15: [116, 110, 100] };
      const HGT = { 0: -1.5, 1: -0.4, 2: 0.6, 3: 1.2, 4: 1.5, 5: 1.7, 6: 3.4, 7: 5.6, 8: 1.2, 9: 1.2, 10: 0.9, 11: 6.2, 12: 1.4, 13: 1.0, 14: 1.2, 15: 1.8 };
      const hsh = ECHO.hash2, wet = k => k === Tl.WATER || k === Tl.DEEP;
      const tiles = new Uint8Array(N), wd0 = world._wd, tr0 = world._trail, wd = wd0 ? new Uint8Array(N) : null, tr = tr0 ? new Uint8Array(N) : null;
      for (let y = 0; y < H; y++) { const o = (y + Y0) * WW + X0; tiles.set(world.tiles.subarray(o, o + W), y * W); if (wd) wd.set(wd0.subarray(o, o + W), y * W); if (tr) tr.set(tr0.subarray(o, o + W), y * W); }
      // which tiles are uncharted (not yet made)
      const G = world.globe && !world._filled ? world.globe : null, mist = G ? new Uint8Array(N) : null;   // (once the whole globe is drawn, there is nothing uncharted to paint)
      if (G) {
        const nx = G.xs.length - 1, cxs = new Int32Array(W), Gl = ECHO.Globe;
        for (let x = 0; x < W; x++) cxs[x] = Gl.find(G.xs, x + X0);
        for (let y = 0; y < H; y++) { const cy = Gl.find(G.ys, y + Y0); for (let x = 0; x < W; x++) if (!G.made[cy * nx + cxs[x]]) mist[y * W + x] = 1; }
      }
      // the height of the land, smoothed twice
      let h = new Float32Array(N);
      for (let i = 0; i < N; i++) h[i] = (HGT[tiles[i]] != null ? HGT[tiles[i]] : 1) + hsh(i % W + X0, ((i / W) | 0) + Y0, 13) * 0.35;
      for (let pass = 0; pass < 2; pass++) {
        const o = new Float32Array(N);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          let s = 0, n = 0;
          for (let dy = -1; dy <= 1; dy++) { const yy = y + dy; if (yy < 0 || yy >= H) continue; for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx < 0 || xx >= W) continue; s += h[yy * W + xx]; n++; } }
          o[y * W + x] = s / n;
        }
        h = o;
      }
      // how far out to sea each water tile is (for the shallows)
      const sea = new Uint8Array(N).fill(255), q = [];
      for (let i = 0; i < N; i++) if (!wet(tiles[i])) { sea[i] = 0; q.push(i); }
      for (let k = 0; k < q.length; k++) { const i = q[k], x = i % W, y = (i / W) | 0, d = sea[i] + 1; if (d > 8) continue; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const j = yy * W + xx; if (sea[j] > d) { sea[j] = d; q.push(j); } } }
      // the colour of each tile, with what lies on it
      const col = new Float32Array(N * 3), land = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const k = tiles[i], c = COL[k] || [255, 0, 255], x = i % W + X0, y = ((i / W) | 0) + Y0;
        let r = c[0], g = c[1], b = c[2];
        if (mist && mist[i]) {
          const n = hsh(x >> 3, y >> 3, 77) * 0.6 + hsh(x >> 1, y >> 1, 78) * 0.4;
          r = 196 + n * 20; g = 182 + n * 18; b = 148 + n * 14;
          col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b; land[i] = 0.5; continue;
        }
        if (wet(k)) { const s = Math.min(sea[i], 8) / 8; const sh = [92, 150, 182], dp = [28, 56, 94]; r = sh[0] + (dp[0] - sh[0]) * s; g = sh[1] + (dp[1] - sh[1]) * s; b = sh[2] + (dp[2] - sh[2]) * s; }
        else land[i] = 1;
        if (tr && tr[i]) { r = r * 0.35 + 168 * 0.65; g = g * 0.35 + 140 * 0.65; b = b * 0.35 + 96 * 0.65; }
        if (wd && wd[i]) { const f = 0.62 - wd[i] * 0.08; r = r * f + 22 * (1 - f); g = g * f + 34 * (1 - f); b = b * f + 30 * (1 - f); }
        const j = S >= 3 ? 0.99 + hsh(x, y, 31) * 0.02 : 0.975 + hsh(x, y, 31) * 0.05;   // (painted close: the grain is per pixel instead, below)
        col[i * 3] = r * j; col[i * 3 + 1] = g * j; col[i * 3 + 2] = b * j;
      }
      const img = new ImageData(W * S, H * S), D = img.data;
      const at = (a, x, y) => a[U.clamp(y, 0, H - 1) * W + U.clamp(x, 0, W - 1)];
      for (let py = 0; py < H * S; py++) {
        const fy = (py + 0.5) / S - 0.5, y0 = Math.floor(fy), ty0 = fy - y0;
        // painted large, each tile keeps its own colour, blended with its neighbour only along a thin edge
        const sharp = S >= 4 ? t => U.clamp((t - 0.5) / 0.16 + 0.5, 0, 1) : t => t, ty = sharp(ty0);
        for (let px = 0; px < W * S; px++) {
          const fx = (px + 0.5) / S - 0.5, x0 = Math.floor(fx), tx = sharp(fx - x0);
          const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
          const i00 = U.clamp(y0, 0, H - 1) * W + U.clamp(x0, 0, W - 1), i10 = U.clamp(y0, 0, H - 1) * W + U.clamp(x0 + 1, 0, W - 1), i01 = U.clamp(y0 + 1, 0, H - 1) * W + U.clamp(x0, 0, W - 1), i11 = U.clamp(y0 + 1, 0, H - 1) * W + U.clamp(x0 + 1, 0, W - 1);
          const o = (py * W * S + px) * 4;
          if (mist && mist[i00] && mist[i10] && mist[i01] && mist[i11]) { D[o] = col[i00 * 3]; D[o + 1] = col[i00 * 3 + 1]; D[o + 2] = col[i00 * 3 + 2]; D[o + 3] = 255; continue; }
          // land or sea, by the blend (with a little wobble, so coasts are not stepped)
          const L = land[i00] * w00 + land[i10] * w10 + land[i01] * w01 + land[i11] * w11 + (hsh((px + X0 * S) >> 1, (py + Y0 * S) >> 1, 5) - 0.5) * 0.18;
          const isLand = L > 0.5;
          // blend only among tiles of the same side of the shore
          let r = 0, gg = 0, b = 0, ws = 0;
          for (const [ii, ww] of [[i00, w00], [i10, w10], [i01, w01], [i11, w11]]) { if ((land[ii] > 0.5) !== isLand && !(mist && mist[ii])) continue; r += col[ii * 3] * ww; gg += col[ii * 3 + 1] * ww; b += col[ii * 3 + 2] * ww; ws += ww; }
          if (ws > 0) { r /= ws; gg /= ws; b /= ws; } else { const ii = U.clamp(Math.round(fy), 0, H - 1) * W + U.clamp(Math.round(fx), 0, W - 1); r = col[ii * 3]; gg = col[ii * 3 + 1]; b = col[ii * 3 + 2]; }
          let f = 1;
          if (isLand) {
            // relief: the slope against light from the north-west
            const hx = (at(h, x0 + 1, y0) - at(h, x0 - 1, y0)) * (1 - ty) + (at(h, x0 + 1, y0 + 1) - at(h, x0 - 1, y0 + 1)) * ty;
            const hy = (at(h, x0, y0 + 1) - at(h, x0, y0 - 1)) * (1 - tx) + (at(h, x0 + 1, y0 + 1) - at(h, x0 + 1, y0 - 1)) * tx;
            f *= U.clamp(1 - (hx + hy) * 0.11, 0.62, 1.32);
            if (Math.abs(L - 0.5) < 0.09) f *= 0.72;                // the shoreline, inked
          } else if (L > 0.36 && !(mist && (mist[i00] || mist[i11]))) { r = r * 0.6 + 214 * 0.4; gg = gg * 0.6 + 226 * 0.4; b = b * 0.6 + 222 * 0.4; }   // surf on the shallows
          if (S >= 3) {
            // close up, the ground has a grain to it — grass and stone and sand — not a smooth smear
            const gx = px + X0 * S, gy = py + Y0 * S, n1 = hsh(gx, gy, 91), n2 = hsh(gx >> 1, gy >> 1, 92);
            f *= isLand ? 0.9 + n1 * 0.1 + n2 * 0.08 : 0.97 + n1 * 0.04 + n2 * 0.03;
          }
          D[o] = Math.min(255, r * f); D[o + 1] = Math.min(255, gg * f); D[o + 2] = Math.min(255, b * f); D[o + 3] = 255;
        }
      }
      // the trees: a dark crown with a lit edge, where each one stands
      if (S >= 2) {
        const dot = (cx, cy, rad, rgb, a) => {
          for (let yy = Math.floor(cy - rad); yy <= Math.ceil(cy + rad); yy++) for (let xx = Math.floor(cx - rad); xx <= Math.ceil(cx + rad); xx++) {
            if (xx < 0 || yy < 0 || xx >= W * S || yy >= H * S || (xx - cx) ** 2 + (yy - cy) ** 2 > rad * rad) continue;
            const o = (yy * W * S + xx) * 4; D[o] = D[o] * (1 - a) + rgb[0] * a; D[o + 1] = D[o + 1] * (1 - a) + rgb[1] * a; D[o + 2] = D[o + 2] * (1 - a) + rgb[2] * a;
          }
        };
        for (let i = 0; i < N; i++) {
          const k = tiles[i], gx = i % W + X0, gy = ((i / W) | 0) + Y0; if (k !== Tl.TREE && !(k === Tl.FOREST && hsh(gx, gy, world.seed + 31) < 0.22)) continue;
          if (tr && tr[i]) continue;
          const p = ECHO.World.trunk(world, gx, gy), deep = wd && wd[i], px = (p.x - X0) * S, py = (p.y - Y0) * S;
          const rad = S * (k === Tl.TREE ? 0.42 : 0.3);
          dot(px + rad * 0.25, py + rad * 0.3, rad, [12, 20, 10], 0.35);                          // its shadow
          dot(px, py, rad, deep ? [30, 34, 30] : gy < world.H * 0.3 ? [38, 70, 48] : [48, 84, 40], 0.85);
          if (!deep) dot(px - rad * 0.3, py - rad * 0.35, rad * 0.45, [118, 150, 82], 0.5);
        }
      }
      return img;
    },
    // the whole map shown (the default), or only what you have walked
    revealed(pl) { return pl.mapReveal !== false; },
    // Unwalked land, as soft-edged parchment.
    fog(world, pl) {
      const cw = Math.ceil(world.W / 4), ch = Math.ceil(world.H / 4);
      const c = document.createElement('canvas'); c.width = cw + 2; c.height = ch + 2;
      const g = c.getContext('2d');
      g.fillStyle = PARCH; g.fillRect(0, 0, cw + 2, ch + 2);
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) if (pl.explored[y * cw + x]) g.clearRect(x + 1, y + 1, 1, 1);
      return c;
    },
    regionCentres(world, pl) {
      const out = [];
      for (const r of world.regions) {
        if (r.land < 0.25) continue;
        let sx = 0, sy = 0, n = 0, seen = 0;
        for (let y = Math.floor(r.y0); y < r.y1; y += 3) for (let x = Math.floor(r.x0); x < r.x1; x += 3) {
          const k = ECHO.World.tile(world, x, y);
          if (k === T().WATER || k === T().DEEP) continue;
          sx += x; sy += y; n++;
          if (ECHO.Game.explored(x, y)) seen++;
        }
        if (n && (WM.revealed(pl) || seen / n > 0.3)) out.push({ name: r.name, x: sx / n, y: sy / n, land: ECHO.Lands ? ECHO.Lands.of(world, r) : null });
      }
      return out;
    },

    // ------------------------------------------------------------ what is on the map
    features(game) {
      const world = game.world, pl = game.pl, out = [], all = WM.revealed(pl), seen = (x, y) => all || game.explored(x, y);
      const Pw = ECHO.Prowess, me = Pw ? Pw.level(pl) : 1;
      for (const s of world.settlements) if (seen(s.x, s.y)) out.push({ layer: 'towns', kind: s.kind === 'capital' ? 'capital' : 'town', x: s.x, y: s.y, name: s.name, color: world.factions[s.faction] ? world.factions[s.faction].color : '#ccc', pri: s.kind === 'capital' ? 9 : 7, ref: s,
        sub: `${s.kind === 'capital' ? 'Capital' : s.kind === 'village' ? 'Village' : 'Town'} of ${world.factions[s.faction] ? world.factions[s.faction].name : 'no one'}${s.warden === pl.charId ? ' · yours' : ''}` });
      for (const site of ECHO.Explore.sites(world)) {
        if (!site.found && !site.seen && !all) continue;
        if (site.cat === 'delve') {
          const told = site.found || site.starter || all, L = ECHO.Explore.level(world, site), fl = ECHO.Explore.floors(site), done = Math.min(fl, Object.keys(site.floorsDone || {}).length);
          const D = Pw ? Pw.diff(L, me) : { color: '#e0a070', word: '' };
          out.push({ layer: 'dungeons', kind: site.cleared ? 'dungeon-cleared' : told ? 'dungeon' : 'dungeon-unknown', x: site.x, y: site.y, name: told ? site.name : 'An uncharted dungeon', color: site.cleared ? '#9a9080' : told ? D.color : '#a89c88', pri: 10, ref: site,
            stars: told ? ECHO.Explore.stars(site) : '?', sub: !told ? 'A way down, glimpsed from afar' : `${ECHO.Explore.label(site)} · ${ECHO.Explore.stars(site)} · ${fl} floor${fl > 1 ? 's' : ''}${site.cleared ? ' · cleared' : done ? ` · ${done}/${fl} floors cleared` : ''}`, diff: site.cleared ? 'Cleared — it will fill again in time' : site.found || all ? `${D.word} for you (monsters about level ${L}–${L + Math.floor((fl - 1) / 2) + 1})` : 'Seen from afar. Go closer to learn more.' });
        } else if (site.cat === 'wonder') out.push({ layer: 'wonders', kind: 'wonder', x: site.x, y: site.y, name: site.found || all ? site.name : 'Something strange', color: '#ffd38a', pri: 5, ref: site, sub: site.found ? 'A wonder of the wild' : all ? 'A wonder of the wild · not yet visited' : 'Seen from afar' });
        else out.push({ layer: 'places', kind: 'landmark', x: site.x, y: site.y, name: site.found || all ? site.name : 'A landmark', color: '#a8e0c0', pri: 4, ref: site, sub: site.found || all ? ECHO.Explore.label(site) + (site.found ? '' : ' · not yet visited') : 'Seen from afar' });
      }
      for (const cp of world.camps) if ((cp.seen || all) && cp.alive) out.push({ layer: 'danger', kind: 'camp', x: cp.x, y: cp.y, name: cp.name || 'Outlaw camp', color: '#e0563c', pri: 6, ref: cp, sub: 'Outlaws camp here' });
      for (const l of world.lairs) if (l.seen || all) out.push({ layer: 'danger', kind: l.boss.alive ? 'lair' : 'lair-dead', x: l.x, y: l.y, name: `The lair of ${l.boss.name}`, color: l.boss.alive ? '#ff6a4a' : '#9a9080', pri: 8, ref: l, sub: l.boss.alive ? 'A great beast sleeps here' : 'Its master is dead' });
      for (const r of world.ruins) if (r.visited || seen(r.x, r.y)) out.push({ layer: 'wonders', kind: 'ruin', x: r.x + 0.5, y: r.y + 0.5, name: r.name || 'Ruins', color: '#c8c0b0', pri: 3, ref: r, sub: r.visited ? 'Ruins you have read' : 'Old ruins' });
      if (world.lang && world.lang.vault && world.lang.vault.revealed && !world.lang.vault.opened) out.push({ layer: 'wonders', kind: 'vault', x: world.lang.vault.x, y: world.lang.vault.y, name: 'The sealed vault', color: '#9fd3ff', pri: 8, sub: 'Its door waits for the words' });
      // the titans: every hunter in the realm knows where the dragons nest, and talks of the great beasts
      if (world.titans && ECHO.Titans) for (const t of world.titans.list) {
        if (!t.alive || t.bound) continue;
        const sp = ECHO.Titans.sp(t), D = Pw ? Pw.diff(t.lvl, me) : { color: '#ff6a4a', skulls: 0 };
        out.push({ layer: 'danger', kind: 'lair', x: t.x, y: t.y, name: `${t.name} ${t.title}`, color: D.color, pri: 9, ref: t, sub: `${t.mig ? `On the move ${ECHO.Calamity.whither(world, t)} · ` : t.seen ? '' : 'Said to range here · '}${sp.flies ? 'A dragon' : 'A great beast'} · level ${t.lvl}${ECHO.Calamity ? ' · ' + ECHO.Calamity.label(t) : ''}`, diff: D.skulls >= 2 ? 'Far beyond you: keep off its range' : 'Beat it down and bind it' });
      }
      // the deep woods: every woodsman warns you off them
      if (world.wild && ECHO.Wildwood) for (const w of world.wild.woods) {
        const L1 = ECHO.Wildwood.level(world, 1), L4 = ECHO.Wildwood.level(world, 4), D = Pw ? Pw.diff(L1, me) : { color: '#8aff6a', skulls: 3 };
        out.push({ layer: 'danger', kind: 'lair', x: w.x, y: w.y, name: U.cap(w.name), color: '#9ac86a', pri: 10, ref: w, sub: `A deep wood · beasts of level ${L1} at its edge, worse further in · ${ECHO.Wildwood.lordAlive(world, w) ? `${U.cap(w.lord.name)} (level ${L4}) at its heart` : `its lord is dead, for now`}`, diff: D.skulls >= 2 ? 'Deadly for you: keep out from under its trees' : 'Its trails lead to the heart' });
      }
      // the gates: everyone knows where they are
      if (world.gates) for (const g of world.gates.list) {
        const th = ECHO.Gates.THEMES[g.theme], weak = me < ECHO.Gates.MIN;
        out.push({ layer: 'gates', kind: 'gate', x: g.x, y: g.y, name: U.cap(g.name), color: th.color, pri: 11, ref: g, sub: `A gate to ${th.world} · held by the National Guard`, diff: weak ? `Deadly: below level ${ECHO.Gates.MIN} its menace kills (within ${ECHO.Gates.R_HURT} leagues)` : `Beasts of level ${ECHO.Gates.MIN}–${ECHO.Gates.TOP} beyond it` });
      }
      // what has got out of them, while the Guard runs it down
      if (ECHO.GuardWork && world.gates) for (const b of ECHO.GuardWork.openBreaches(world)) out.push({ layer: 'gates', kind: 'lair', x: b.x, y: b.y, name: `${ECHO.GuardWork.aBeast(b.kind, true)} out of ${b.gateName}`, color: '#ff4a3a', pri: 10, ref: b, sub: `Level ${b.lv} · loose since day ${b.day} · the National Guard is hunting it`, diff: me < ECHO.Gates.MIN ? 'Far beyond you: keep clear' : 'Run it down' });
      const wst = world.wonders;
      if (wst) {
        for (const e of wst.echoes || []) if ((e.revealed || all) && !e.found) out.push({ layer: 'wonders', kind: 'echo', x: e.x, y: e.y, name: 'An echo of the old world', color: '#bfe8ff', pri: 5, sub: 'Shown to you by the wisps' });
        for (const st of wst.stars || []) if (!st.taken) out.push({ layer: 'wonders', kind: 'star', x: st.x, y: st.y, name: 'A fallen star', color: '#ffffff', pri: 6, sub: 'Star-iron lies here' });
      }
      // with the whole map shown: the hidden places too
      if (all && world.secrets && world.secrets.list) {
        const NM = { cave: 'A hidden cave', shrine: 'A forgotten shrine', wreck: 'A wreck', circle: 'A ring of standing stones', hut: 'A hermit\'s hut' };
        for (const s of world.secrets.list) if (!s.done) out.push({ layer: 'places', kind: 'landmark', x: s.x, y: s.y, name: s.name || NM[s.kind] || 'Something hidden', color: s.found ? '#a8e0c0' : '#8ac8b0', pri: 3, ref: s, sub: s.found ? 'You have found it' : 'Not yet found' });
      }
      if (all) for (const ch of world.caches || []) if (!ch.found) out.push({ layer: 'wonders', kind: 'star', x: ch.x, y: ch.y, name: 'A buried cache', color: '#e8c86a', pri: 2, ref: ch, sub: 'Something is hidden here' });
      if (all && world.lang && world.lang.vault && !world.lang.vault.revealed && !world.lang.vault.opened) out.push({ layer: 'wonders', kind: 'vault', x: world.lang.vault.x, y: world.lang.vault.y, name: 'The sealed vault', color: '#9fd3ff', pri: 8, sub: 'Its door waits for words no one remembers' });
      return out;
    },

    // ------------------------------------------------------------ open the map
    open(game) {
      const world = game.world, pl = game.pl, UI = ECHO.UI;
      WM.layers = WM.layers || Object.fromEntries(LAYERS.map(([k]) => [k, true])); if (WM.layers.gates == null) WM.layers.gates = true;
      if (ECHO.Tutorial) ECHO.Tutorial.flag('map');
      const body = UI.openPanel(`Map of ${world.name}`, `<div class="wmap"><div class="wmap-main"><canvas id="worldmap"></canvas><div id="map-tip" class="hidden"></div>
          <div class="wmap-ctl"><button data-z="1" title="Zoom in">＋</button><button data-z="-1" title="Zoom out">－</button><button data-me="1" title="Centre on you">◎</button><button data-fit="1" title="The whole world">⤢</button>${world.globe ? '<button data-globe="1" title="Globe or flat chart">🌐</button>' : ''}</div>
          <div class="wmap-hint">Scroll to zoom · drag to ${world.globe ? 'turn the world' : 'move'} · click a place for details</div></div>
        <div class="wmap-side"><div class="wmap-find"><input id="map-find" type="text" placeholder="Find a place…" autocomplete="off"><div id="map-found"></div></div>
          <div class="wmap-layers"><button class="small ${WM.revealed(pl) ? 'on' : ''}" data-reveal="1" title="Show the whole world, or only the land you have walked">${WM.revealed(pl) ? 'Whole map shown' : 'Only what you have walked'}</button>${LAYERS.map(([k, l]) => `<button class="small ${WM.layers[k] ? 'on' : ''}" data-layer="${k}">${l}</button>`).join('')}</div>
          <div id="map-sel"></div><h4 class="gold">Dungeons you know</h4><div id="map-dlist"></div><h4 class="gold">Key</h4><div id="map-key"></div></div></div>`, 'map');
      const c = body.querySelector('#worldmap'), main = body.querySelector('.wmap-main');
      // a round world opens on the globe (🌐 switches to the flat chart and back)
      WM.mode = world.globe ? (WM.mode || 'globe') : 'chart';
      if (world.globe) WM.globeInit(main, c);
      const fit = () => { c.width = main.clientWidth; c.height = main.clientHeight; if (WM.G && world.globe) WM.globeSize(c); };
      fit();
      WM.globeShow(main);
      const zFit = Math.min(c.width / world.W, c.height / world.H);
      WM.view = WM.view && WM.view.world === world.id ? WM.view : { world: world.id, cx: pl.x, cy: pl.y, z: Math.max(zFit, 3) };
      WM.view.cx = pl.x; WM.view.cy = pl.y;
      WM.view.min = zFit * 0.9; WM.view.max = 14;
      WM.fogC = WM.fog(world, pl);
      if (world.globe) { WM.globeTex(game); if (!WM.G.opened) { WM.G.opened = true; WM.G.dist = 3.9; } WM.globeFocus(pl.x, pl.y, null, true); }
      WM.regions = WM.regionCentres(world, pl);
      WM.feats = WM.features(game);
      WM.sel = null; WM.hover = null;
      const V = WM.view;
      UI.mapView = { toScreen: (x, y) => WM.toScreen(c, x, y), view: V };
      // ---- input
      let drag = null;
      c.addEventListener('wheel', ev => {
        ev.preventDefault();
        const r = c.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top;
        if (WM.isGlobe(world)) {
          // in toward the ground (by height above it, so the last of the way is as smooth as the first),
          // keeping the place under the pointer under it
          const G = WM.G, before = WM.gWorld(c, mx, my);
          G.dist = 1 + U.clamp((G.dist - 1) * (ev.deltaY < 0 ? 0.84 : 1.19), G.min - 1, G.max - 1); G.anim = null;
          if (before.x >= 0) { WM.globeStep(); const after = WM.gWorld(c, mx, my); if (after.x >= 0) { G.yaw += (Globe().dx(world, after.x, before.x)) / world.W * Math.PI * 2 * -1; G.pitch = U.clamp(G.pitch - (Globe().lat(world, after.y) - Globe().lat(world, before.y)), -1.45, 1.45); } }
          WM.draw(game, c); return;
        }
        const before = WM.toWorld(c, mx, my);
        V.z = U.clamp(V.z * (ev.deltaY < 0 ? 1.25 : 0.8), V.min, V.max);
        const after = WM.toWorld(c, mx, my);
        V.cx += before.x - after.x; V.cy += before.y - after.y;
        WM.draw(game, c);
      }, { passive: false });
      c.addEventListener('mousedown', ev => { if (ev.button !== 0) return; drag = { x: ev.clientX, y: ev.clientY, cx: V.cx, cy: V.cy, moved: false, yaw: WM.G && WM.G.yaw, pitch: WM.G && WM.G.pitch }; if (WM.G) WM.G.anim = null; });
      const move = ev => {
        const r = c.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top;
        if (drag) {
          const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
          if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
          if (drag.moved && WM.isGlobe(world)) {
            const G = WM.G, k = 0.0042 * (G.dist - 1) * 0.95;
            G.yaw = drag.yaw + dx * k; G.pitch = U.clamp(drag.pitch + dy * k, -1.45, 1.45);
            WM.draw(game, c); c.style.cursor = 'grabbing'; return;
          }
          if (drag.moved) { V.cx = drag.cx - dx / V.z; V.cy = drag.cy - dy / V.z; WM.draw(game, c); c.style.cursor = 'grabbing'; return; }
        }
        const f = WM.hit(c, mx, my);
        if (WM.isGlobe(world)) {
          // the reading under the pointer: where on the globe, and what land
          const p = WM.gWorld(c, mx, my), was = WM._hoverLL;
          WM._hoverLL = p.x < 0 ? null : `${ECHO.Globe.fmtLatLon(world, p.x, p.y)}${ECHO.Globe.made(world, p.x, p.y) ? ' · ' + U.cap(((ECHO.World.regionAt(world, p.x, p.y) || {}).name) || '') : ' · uncharted'}`;
          if (WM._hoverLL !== was && f === WM.hover) WM.draw(game, c);
        }
        if (f !== WM.hover) { WM.hover = f; WM.draw(game, c); }
        WM.tip(game, f, mx, my);
        c.style.cursor = f ? 'pointer' : 'grab';
      };
      const up = ev => {
        if (!drag) return;
        const was = drag; drag = null; c.style.cursor = 'grab';
        if (was.moved) return;
        const r = c.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top;
        const f = WM.hit(c, mx, my);
        if (f) WM.select(game, f);
        else { const p = WM.toWorld(c, mx, my); if (p.x >= 0 && p.y >= 0 && p.x < world.W && p.y < world.H && (WM.revealed(pl) || game.explored(p.x, p.y))) WM.select(game, { kind: 'mark', x: p.x, y: p.y, name: 'A spot you marked', sub: (ECHO.World.regionAt(world, p.x, p.y) || {}).name || '', color: '#ffe08a' }); else { WM.sel = null; WM.side(game, c); } }
        WM.draw(game, c);
      };
      c.addEventListener('mousemove', move);
      c.addEventListener('mouseleave', () => { WM.hover = null; WM.tip(game, null); WM.draw(game, c); });
      window.addEventListener('mouseup', up);
      const stop = () => { if (!UI.panelOpen || UI.panelKind !== 'map') { window.removeEventListener('mouseup', up); window.removeEventListener('resize', rs); clearInterval(tick); } };
      const rs = () => { if (UI.panelKind === 'map') { fit(); WM.draw(game, c); } };
      window.addEventListener('resize', rs);
      const tick = setInterval(() => { stop(); if (UI.panelKind === 'map') WM.draw(game, c); }, 250);
      body.querySelectorAll('[data-z]').forEach(b => b.addEventListener('click', () => { if (WM.isGlobe(world)) { WM.G.dist = U.clamp(WM.G.dist * (+b.dataset.z > 0 ? 0.8 : 1.25), WM.G.min, WM.G.max); WM.G.anim = null; } else V.z = U.clamp(V.z * (+b.dataset.z > 0 ? 1.4 : 0.7), V.min, V.max); WM.draw(game, c); }));
      body.querySelector('[data-me]').addEventListener('click', () => { V.cx = pl.x; V.cy = pl.y; if (WM.isGlobe(world)) WM.globeFocus(pl.x, pl.y, Math.min(WM.G.dist, 2.2)); WM.draw(game, c); });
      body.querySelector('[data-fit]').addEventListener('click', () => { V.cx = world.W / 2; V.cy = world.H / 2; V.z = Math.min(c.width / world.W, c.height / world.H) * 0.98; if (WM.isGlobe(world)) WM.globeFocus(pl.x, pl.y, 4.2); WM.draw(game, c); });
      const gb = body.querySelector('[data-globe]');
      if (gb) gb.addEventListener('click', () => {
        if (WM.mode === 'globe') { const p = WM.gWorld(c, c.width / 2, c.height / 2); WM.mode = 'chart'; if (p.x >= 0) { V.cx = p.x; V.cy = p.y; } V.z = Math.max(V.z, 2.5); }
        else { WM.mode = 'globe'; WM.globeTex(game); WM.globeFocus(V.cx, V.cy, null, true); }
        WM.globeShow(main); WM.draw(game, c);
      });
      body.querySelector('[data-reveal]').addEventListener('click', ev => {
        pl.mapReveal = !WM.revealed(pl);
        ev.currentTarget.classList.toggle('on', WM.revealed(pl)); ev.currentTarget.textContent = WM.revealed(pl) ? 'Whole map shown' : 'Only what you have walked';
        WM.regions = WM.regionCentres(world, pl); WM.feats = WM.features(game); WM._mf = null;
        if (world.globe && WM.G) { WM.fogC = WM.fog(world, pl); WM.globeTex(game); }
        WM.side(game, c); WM.draw(game, c);
      });
      // find a place by name
      const fin = body.querySelector('#map-find'), found = body.querySelector('#map-found');
      const places = () => WM.feats.concat(WM.regions.map(r => ({ layer: 'regions', kind: 'region', x: r.x, y: r.y, name: U.cap(r.name), color: '#efe3c8', sub: 'A region' })));
      fin.addEventListener('keydown', ev => ev.stopPropagation());
      fin.addEventListener('input', () => {
        const q = fin.value.trim().toLowerCase();
        if (q.length < 2) { found.innerHTML = ''; return; }
        const hits = places().filter(f => f.name.toLowerCase().includes(q)).sort((a, b) => a.name.toLowerCase().indexOf(q) - b.name.toLowerCase().indexOf(q) || U.dist(a.x, a.y, pl.x, pl.y) - U.dist(b.x, b.y, pl.x, pl.y)).slice(0, 8);
        found.innerHTML = hits.length ? hits.map((f, i) => `<div class="dl" data-hit="${i}"><span class="dot" style="border-color:${f.color}"></span><span class="nm">${esc(f.name)}</span><span class="dd">${WM.dist(game, f).d}</span></div>`).join('') : '<div class="dim" style="font-size:12px">Nothing by that name.</div>';
        found.querySelectorAll('[data-hit]').forEach(el => el.addEventListener('click', () => { const f = hits[+el.dataset.hit]; V.cx = f.x; V.cy = f.y; V.z = Math.max(V.z, 5); if (WM.isGlobe(world)) WM.globeFocus(f.x, f.y, Math.min(WM.G.dist, 1.7)); if (f.kind !== 'region') WM.select(game, f); WM.draw(game, c); }));
      });
      body.querySelectorAll('[data-layer]').forEach(b => b.addEventListener('click', () => { WM.layers[b.dataset.layer] = !WM.layers[b.dataset.layer]; b.classList.toggle('on', WM.layers[b.dataset.layer]); WM.draw(game, c); }));
      WM.side(game, c);
      WM.key(body);
      WM.draw(game, c);
    },
    toScreen(c, x, y) { if (WM.isGlobe()) return WM.gScreen(c, x, y); const V = WM.view; return { x: (x - V.cx) * V.z + c.width / 2, y: (y - V.cy) * V.z + c.height / 2 }; },
    toWorld(c, sx, sy) { if (WM.isGlobe()) return WM.gWorld(c, sx, sy); const V = WM.view; return { x: (sx - c.width / 2) / V.z + V.cx, y: (sy - c.height / 2) / V.z + V.cy }; },
    visible() { return WM.feats.filter(f => WM.layers[f.layer]); },
    hit(c, mx, my) {
      let best = null, bd = 14;
      for (const f of WM.visible()) { const p = WM.toScreen(c, f.x, f.y), d = Math.hypot(p.x - mx, p.y - my) - (f.layer === 'dungeons' ? 3 : 0); if (d < bd) { bd = d; best = f; } }
      return best;
    },
    dist(game, f) { const pl = game.pl, ddx = ECHO.Globe ? ECHO.Globe.dx(game.world, pl.x, f.x) : f.x - pl.x; const d = Math.hypot(ddx, f.y - pl.y), a = Math.atan2(f.y - pl.y, ddx); return { d: Math.round(d), dir: DIRS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8] }; },
    tip(game, f, mx, my) {
      const el = document.getElementById('map-tip');
      if (!el) return;
      if (!f) { el.classList.add('hidden'); return; }
      const D = WM.dist(game, f);
      el.innerHTML = `<b style="color:${f.color}">${esc(f.name)}</b><div>${esc(f.sub || '')}</div>${f.diff ? `<div style="color:${f.color}">${esc(f.diff)}</div>` : ''}<div class="dim">${D.d < 3 ? 'You are here' : `${D.d} leagues ${D.dir}`}${game.world.globe ? ' · ' + ECHO.Globe.fmtLatLon(game.world, f.x, f.y) : ''}</div>`;
      el.classList.remove('hidden');
      el.style.left = Math.min(mx + 16, el.parentElement.clientWidth - 240) + 'px'; el.style.top = Math.max(4, my - 10) + 'px';
    },
    trackId(f) {
      if (f.kind && f.kind.startsWith('dungeon')) return 'site:' + f.ref.id;
      return `mark:${f.x.toFixed(1)}:${f.y.toFixed(1)}:${f.name}`;
    },
    select(game, f) { WM.sel = f; WM.side(game, document.getElementById('worldmap')); },
    // The side panel: the selected place, and the dungeons you know.
    side(game, c) {
      const pl = game.pl, world = game.world;
      const sel = document.getElementById('map-sel'), list = document.getElementById('map-dlist');
      if (!sel || !list) return;
      const f = WM.sel;
      if (f) {
        const D = WM.dist(game, f), id = WM.trackId(f), on = pl.tracked === id || (pl.tracked && f.kind === 'mark' && pl.tracked.startsWith('mark:') && pl.tracked.endsWith(':' + f.name) && Math.abs(parseFloat(pl.tracked.split(':')[1]) - f.x) < 0.2);
        sel.innerHTML = `<div class="card"><h4 style="color:${f.color}">${esc(f.name)}</h4><div>${esc(f.sub || '')}</div>${f.diff ? `<div style="color:${f.color}">${esc(f.diff)}</div>` : ''}<div class="dim">${D.d < 3 ? 'You are here' : `${D.d} leagues ${D.dir}`}</div>
          ${f.kind === 'dungeon-cleared' ? '' : `<div class="row"><button class="small" data-track="1">${on ? 'Stop guiding' : 'Guide me there'}</button></div>`}</div>`;
        const b = sel.querySelector('[data-track]');
        if (b) b.addEventListener('click', () => { pl.tracked = on ? null : id; ECHO.Purpose._html = null; ECHO.Purpose.t = 0; if (!on) ECHO.UI.toast(`The line at the top of the screen now points to ${f.name}.`, 'info', 3); WM.side(game, c); WM.draw(game, c); });
      } else sel.innerHTML = '<p class="dim" style="font-size:13px">Click any place on the map for details, or empty land you have walked to mark a spot — then <b>Guide me there</b> and the line at the top of the screen will point the way.</p>';
      const ds = WM.feats.filter(x => x.layer === 'dungeons').sort((a, b) => U.dist(a.x, a.y, pl.x, pl.y) - U.dist(b.x, b.y, pl.x, pl.y));
      const total = ECHO.Explore.sites(world).filter(s => s.cat === 'delve').length;
      list.innerHTML = ds.length ? ds.map((x, i) => `<div class="dl ${WM.sel === x ? 'on' : ''}" data-goto="${i}"><span class="dot" style="border-color:${x.color}"></span><span class="nm">${esc(x.name)}</span><span class="st">${x.kind === 'dungeon-cleared' ? '✓' : x.stars}</span><span class="dd">${WM.dist(game, x).d}</span></div>`).join('') + `<div class="dim" style="font-size:12px;margin-top:4px">${total - ds.length} more lie uncharted.</div>`
        : '<p class="dim" style="font-size:13px">None yet. Explore — hilltop lookouts show you what lies around them.</p>';
      list.querySelectorAll('[data-goto]').forEach(el => el.addEventListener('click', () => { const x = ds[+el.dataset.goto]; WM.view.cx = x.x; WM.view.cy = x.y; WM.view.z = Math.max(WM.view.z, 5); if (WM.isGlobe(world)) WM.globeFocus(x.x, x.y, Math.min(WM.G.dist, 1.7)); WM.select(game, x); WM.draw(game, c); }));
    },
    key(body) {
      const el = body.querySelector('#map-key');
      const items = [['dungeon', '#ffc04a', 'Dungeon (ring: danger to you)'], ['dungeon-cleared', '#9a9080', 'Cleared dungeon'], ['dungeon-unknown', '#a89c88', 'Seen, not yet charted'], ['capital', '#c8a85a', 'Capital'], ['town', '#6f8fc4', 'Town or village'],
        ['gate', '#c86aff', 'A gate (level 150+)'], ['camp', '#e0563c', 'Outlaw camp'], ['lair', '#ff6a4a', 'Lair of a great beast'], ['landmark', '#a8e0c0', 'Landmark'], ['wonder', '#ffd38a', 'Wonder'], ['ruin', '#c8c0b0', 'Ruins'], ['player', '#ffffff', 'You'], ['flag', '#ffe08a', 'Where you are headed']];
      el.innerHTML = items.map(([k, col, t]) => { const c = document.createElement('canvas'); c.width = 26; c.height = 26; const g = c.getContext('2d'); WM.icon(g, k, 13, 14, col, 1, 0); return `<div class="kr"><img src="${c.toDataURL()}" alt="">${t}</div>`; }).join('')
        + `<div class="kr dim" style="font-size:12px">Danger rings: <span style="color:#8fe08a">easy</span> · <span style="color:#f0e6d0">even</span> · <span style="color:#ffc04a">hard</span> · <span style="color:#ff7a4a">deadly</span> · <span style="color:#ff3a3a">run</span></div>`;
    },

    // ------------------------------------------------------------ drawing
    icon(g, kind, x, y, col, k = 1, t = 0) {
      const line = (w) => { g.lineWidth = w; g.strokeStyle = 'rgba(20,14,8,0.95)'; };
      g.save(); g.translate(x, y); g.scale(k, k);
      switch (kind) {
        case 'dungeon': case 'dungeon-cleared': case 'dungeon-unknown': {
          // a dark badge with a stair-mouth inside, ringed in the colour of its danger
          if (kind === 'dungeon' && t) { g.globalAlpha = 0.35 + 0.25 * Math.sin(t * 4); g.fillStyle = col; g.beginPath(); g.arc(0, 0, 13, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
          g.fillStyle = '#1a130e'; g.beginPath(); g.arc(0, 0, 9.5, 0, Math.PI * 2); g.fill();
          g.lineWidth = 3; g.strokeStyle = col; if (kind === 'dungeon-unknown') g.setLineDash([3, 2]); g.stroke(); g.setLineDash([]);
          if (kind === 'dungeon-unknown') { g.fillStyle = col; g.font = 'bold 12px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 0, 1); break; }
          g.fillStyle = kind === 'dungeon-cleared' ? '#6a6258' : col;
          g.beginPath(); g.moveTo(-5.5, 5); g.lineTo(-5.5, -1); g.arc(0, -1, 5.5, Math.PI, 0); g.lineTo(5.5, 5); g.closePath(); g.fill();
          g.fillStyle = '#0a0705'; g.beginPath(); g.moveTo(-3.5, 5); g.lineTo(-3.5, 0); g.arc(0, 0, 3.5, Math.PI, 0); g.lineTo(3.5, 5); g.closePath(); g.fill();
          g.fillStyle = kind === 'dungeon-cleared' ? '#6a6258' : col; g.fillRect(-2.5, 2.5, 5, 1); g.fillRect(-1.5, 0.5, 3, 1);
          if (kind === 'dungeon-cleared') { g.strokeStyle = '#8fe08a'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(3, 6); g.lineTo(6, 9); g.lineTo(11, 2); g.stroke(); }
          break;
        }
        case 'capital': case 'town': {
          const s = kind === 'capital' ? 1.25 : 1;
          g.scale(s, s);
          g.fillStyle = col; line(2);
          g.beginPath(); g.moveTo(-6, 6); g.lineTo(-6, -1); g.lineTo(0, -7); g.lineTo(6, -1); g.lineTo(6, 6); g.closePath(); g.fill(); g.stroke();
          g.fillStyle = 'rgba(20,14,8,0.85)'; g.fillRect(-1.5, 1.5, 3, 4.5);
          if (kind === 'capital') { g.fillStyle = '#f2c84a'; g.beginPath(); g.moveTo(-4, -8); g.lineTo(-4, -12); g.lineTo(-2, -10); g.lineTo(0, -13); g.lineTo(2, -10); g.lineTo(4, -12); g.lineTo(4, -8); g.closePath(); g.fill(); line(1); g.stroke(); }
          break;
        }
        case 'camp': g.fillStyle = col; line(2); g.beginPath(); g.moveTo(0, -7); g.lineTo(7, 6); g.lineTo(-7, 6); g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#1a0e08'; g.beginPath(); g.moveTo(0, 0); g.lineTo(2.5, 6); g.lineTo(-2.5, 6); g.closePath(); g.fill(); break;
        case 'lair': case 'lair-dead':
          g.fillStyle = '#1a0e0a'; g.beginPath(); g.moveTo(0, -9); g.lineTo(9, 0); g.lineTo(0, 9); g.lineTo(-9, 0); g.closePath(); g.fill(); g.lineWidth = 2.5; g.strokeStyle = col; g.stroke();
          g.strokeStyle = col; g.lineWidth = 1.6; for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(i * 2.6 - 1.5, -4); g.lineTo(i * 2.6 + 1.5, 4); g.stroke(); }
          break;
        case 'landmark': g.fillStyle = col; line(1.5); g.beginPath(); g.moveTo(0, -6); g.lineTo(5.5, 4.5); g.lineTo(-5.5, 4.5); g.closePath(); g.fill(); g.stroke(); break;
        case 'wonder': case 'star': case 'echo': {
          g.fillStyle = col; line(1.5); g.beginPath();
          for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 2.8 : 7; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
          g.closePath(); g.fill(); g.stroke(); break;
        }
        case 'ruin': case 'vault': g.fillStyle = col; line(1.5); g.beginPath(); g.moveTo(0, -6); g.lineTo(6, 0); g.lineTo(0, 6); g.lineTo(-6, 0); g.closePath(); g.fill(); g.stroke(); break;
        case 'gate': {
          if (t) { g.globalAlpha = 0.3 + 0.25 * Math.sin(t * 3); g.fillStyle = col; g.beginPath(); g.arc(0, 0, 14, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
          g.fillStyle = '#120c14'; g.beginPath(); g.arc(0, 0, 10, 0, Math.PI * 2); g.fill(); g.lineWidth = 2.5; g.strokeStyle = col; g.stroke();
          g.fillStyle = '#e8e0f0'; g.fillRect(-6, -6, 2.4, 11); g.fillRect(3.6, -6, 2.4, 11); g.fillRect(-6.5, -7.5, 13, 2.2);
          g.fillStyle = col; g.fillRect(-3.4, -4.5, 6.8, 9.5);
          break;
        }
        case 'mark': case 'flag': g.strokeStyle = 'rgba(20,14,8,0.95)'; g.lineWidth = 3; g.beginPath(); g.moveTo(-3, 8); g.lineTo(-3, -8); g.stroke(); g.strokeStyle = '#f0e6d0'; g.lineWidth = 1.5; g.stroke(); g.fillStyle = col; line(1.5); g.beginPath(); g.moveTo(-3, -8); g.lineTo(7, -4.5); g.lineTo(-3, -1); g.closePath(); g.fill(); g.stroke(); break;
        case 'player': g.rotate(t); g.fillStyle = '#ffffff'; line(2.5); g.beginPath(); g.moveTo(9, 0); g.lineTo(-6, 6.5); g.lineTo(-3, 0); g.lineTo(-6, -6.5); g.closePath(); g.stroke(); g.fill(); break;
      }
      g.restore();
    },
    draw(game, c) {
      if (!c || !c.isConnected) return;
      const world = game.world, pl = game.pl, V = WM.view, g = c.getContext('2d');
      const now = performance.now() / 1000;
      WM._later = [];
      g.setTransform(1, 0, 0, 1, 0, 0);
      const globe = WM.isGlobe(world);
      let o = { x: 0, y: 0 };
      if (globe) {
        // the globe, drawn in 3D underneath; everything else on top of it
        const G = WM.G;
        WM.globeStep(); WM.globeDetail(game, c); G.r.render(G.sc, G.cam);
        g.clearRect(0, 0, c.width, c.height);
        const Rpx = (c.height / 2) / Math.tan(G.cam.fov * Math.PI / 360) / Math.sqrt(Math.max(0.02, G.dist * G.dist - 1));
        V.z = Rpx * Math.PI * 2 / world.W;
      } else {
        g.fillStyle = PARCH; g.fillRect(0, 0, c.width, c.height);
        o = WM.toScreen(c, 0, 0);
        g.imageSmoothingEnabled = true;
        g.drawImage(WM.base(world), o.x, o.y, world.W * V.z, world.H * V.z);
      }
      const all = WM.revealed(pl), seenAt = (x, y) => all || game.explored(x, y);
      // roads: drawn as roads, a pale verge under a brown way
      const RP = WM._rp || (WM._rp = new WeakMap());
      const rpts = r => { let e = RP.get(r.path); if (!e || e.W !== world.W) { e = { W: world.W, pts: r.path.map(i => ({ x: i % world.W + 0.5, y: ((i / world.W) | 0) + 0.5 })) }; RP.set(r.path, e); } return e.pts; };
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (const pass of globe ? [] : [0, 1]) {
        g.strokeStyle = pass ? 'rgba(122,88,50,0.95)' : 'rgba(236,222,186,0.55)'; g.lineWidth = Math.max(1, V.z * (pass ? 0.42 : 0.75));
        for (const r of world.roads) {
          if (!Array.isArray(r.path) || r.path.length < 2) continue;
          const pts = rpts(r); g.beginPath(); let on = false;
          for (let k = 0; k < pts.length; k += V.z > 3 ? 1 : 2) { const q = pts[k]; if (!seenAt(q.x, q.y)) { on = false; continue; } const p = WM.toScreen(c, q.x, q.y); if (!on) { g.moveTo(p.x, p.y); on = true; } else g.lineTo(p.x, p.y); }
          g.stroke();
        }
      }
      // the deep woods: a dark line round them and their names
      if (world.wild && !globe) for (const w of world.wild.woods) {
        if (!seenAt(w.x, w.y)) continue;
        const p = WM.toScreen(c, w.x, w.y), rr = w.r * V.z;
        if (p.x < -rr - 60 || p.y < -rr - 60 || p.x > c.width + rr + 60 || p.y > c.height + rr + 60) continue;
        g.strokeStyle = 'rgba(30,40,24,0.7)'; g.lineWidth = 1.5; g.setLineDash([4, 4]); g.beginPath(); g.arc(p.x, p.y, rr * 0.92, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
        if (V.z >= 1.2) (WM._later = WM._later || []).push({ text: U.cap(w.name), x: p.x, y: p.y + rr * 0.98, font: `italic bold ${Math.round(U.clamp(V.z * 3.6, 12, 20))}px "Cormorant Garamond", Georgia, serif`, fill: '#b8e09a', stroke: 'rgba(14,20,12,0.85)', pri: 2 });
      }
      // the gates' menace
      if (world.gates && !globe) for (const gt of world.gates.list) { const p = WM.toScreen(c, gt.x, gt.y); g.strokeStyle = 'rgba(200,40,40,0.55)'; g.lineWidth = 1.5; g.setLineDash([5, 4]); g.beginPath(); g.arc(p.x, p.y, ECHO.Gates.R_HURT * V.z, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); }
      // the unwalked, as parchment with soft edges (unless the whole map is shown)
      g.imageSmoothingEnabled = true;
      if (!all && !globe) g.drawImage(WM.fogC, o.x - 4 * V.z, o.y - 4 * V.z, WM.fogC.width * 4 * V.z, WM.fogC.height * 4 * V.z);
      // region names
      g.textAlign = 'center'; g.textBaseline = 'middle';
      if (WM.layers.regions && V.z >= 1.6 && V.z < 9) {
        const font = `italic ${Math.round(U.clamp(V.z * 3.4, 11, 19))}px "Cormorant Garamond", Georgia, serif`;
        for (const r of WM.regions) { const p = WM.toScreen(c, r.x, r.y); if (r.land && r.land.roster) (WM._later = WM._later || []).push({ text: r.land.short, x: p.x, y: p.y + Math.round(U.clamp(V.z * 3.4, 11, 19)) * 0.95, font: `${Math.round(U.clamp(V.z * 2.6, 9, 14))}px "Pixelify Sans", monospace`, fill: r.land.col, stroke: 'rgba(20,14,8,0.7)', pri: 0 }); (WM._later = WM._later || []).push({ text: U.cap(r.name).toUpperCase().split('').join(String.fromCharCode(8202)), x: p.x, y: p.y, font, fill: 'rgba(58,42,24,0.66)', stroke: 'rgba(236,226,196,0.5)', pri: 0 }); }
      }
      // the way there: the planned route, or a straight line if there is none yet
      const goal = ECHO.Purpose && ECHO.Purpose.current(game);
      if (globe) { /* (on the globe: the flag alone) */ }
      else if (goal && goal.where && goal.where.x != null && ECHO.Nav && ECHO.Nav.drawOnMap(g, (x, y) => WM.toScreen(c, x, y), null, 3)) { /* drawn */ }
      else if (goal && goal.where && goal.where.x != null) {
        const a = WM.toScreen(c, pl.x, pl.y), b = WM.toScreen(c, goal.where.x, goal.where.y);
        g.strokeStyle = 'rgba(255,224,138,0.85)'; g.lineWidth = 2; g.setLineDash([6, 5]); g.lineDashOffset = -now * 12; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); g.setLineDash([]);
      }
      // quest rings
      WM.rings(game, c, g);
      // icons, least important first; labels where they fit
      const feats = WM.visible().slice().sort((a, b) => a.pri - b.pri);
      const k = U.clamp(0.75 + V.z * 0.09, 0.8, 1.35);
      const rects = [];
      const fits = (x, y, w, h) => { for (const r of rects) if (x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y) return false; rects.push({ x, y, w, h }); return true; };
      const pos = feats.map(f => ({ f, p: WM.toScreen(c, f.x, f.y) })).filter(({ p }) => p.x > -30 && p.y > -30 && p.x < c.width + 30 && p.y < c.height + 30);
      const sug = ECHO.Guide && ECHO.Guide.suggestDungeon(world, pl);
      for (const { f, p } of pos) {
        const hi = f === WM.hover || f === WM.sel;
        const pulse = (f.ref && sug && f.ref === sug) || (pl.tracked === 'site:' + (f.ref && f.ref.id));
        WM.icon(g, f.kind, p.x, p.y, f.color, k * (hi ? 1.25 : 1), pulse ? now : 0);
        rects.push({ x: p.x - 9 * k, y: p.y - 9 * k, w: 18 * k, h: 18 * k });
      }
      // labels: dungeons and towns first
      const lblOrder = pos.slice().sort((a, b) => (b.f === WM.sel || b.f === WM.hover) - (a.f === WM.sel || a.f === WM.hover) || b.f.pri - a.f.pri);
      for (const { f, p } of lblOrder) {
        const hi = f === WM.hover || f === WM.sel;
        const show = hi || f.layer === 'towns' || (f.layer === 'dungeons' && f.kind !== 'dungeon-unknown' && V.z >= (WM.revealed(pl) ? 4.5 : 2.2)) || (V.z >= 5 && f.pri >= 5) || V.z >= 8;
        if (!show) continue;
        const size = Math.round(U.clamp(9 + V.z * 0.9, 11, 16) * (f.kind === 'capital' ? 1.12 : 1));
        g.font = `${f.layer === 'towns' ? 'bold ' : ''}${size}px "Pixelify Sans", monospace`;
        const text = f.layer === 'dungeons' && f.kind === 'dungeon' ? `${f.name} ${f.stars}` : f.name;
        const w = g.measureText(text).width, y = p.y + 13 * k + size * 0.6;
        if (!hi && !fits(p.x - w / 2 - 2, y - size / 2, w + 4, size)) continue;
        g.lineWidth = 3; g.strokeStyle = 'rgba(20,14,8,0.85)'; g.strokeText(text, p.x, y);
        g.fillStyle = f.layer === 'dungeons' ? f.color : f.layer === 'towns' ? '#fff4dc' : '#efe3c8'; g.fillText(text, p.x, y);
      }
      // the names of the land, where they fit among the rest
      for (const L of (WM._later || []).sort((a, b) => b.pri - a.pri)) {
        g.font = L.font; const w = g.measureText(L.text).width, hh = parseInt(L.font.match(/(\d+)px/)[1], 10);
        if (!fits(L.x - w / 2, L.y - hh / 2, w, hh) && L.pri < 2) continue;
        g.lineWidth = 3; g.strokeStyle = L.stroke; g.strokeText(L.text, L.x, L.y); g.fillStyle = L.fill; g.fillText(L.text, L.x, L.y);
      }
      WM._later = [];
      // where you are headed, and you
      if (goal && goal.where && goal.where.x != null) { const b = WM.toScreen(c, goal.where.x, goal.where.y); WM.icon(g, 'flag', b.x, b.y - 6, '#ffe08a', 1.2); }
      const me = WM.toScreen(c, pl.x, pl.y);
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.arc(me.x, me.y, 14 + Math.sin(now * 3) * 2, 0, Math.PI * 2); g.fill();
      WM.icon(g, 'player', me.x, me.y, '#fff', 1.15, ECHO.Interior.cur ? 0 : (game.pe && game.pe.dir) || 0);
      if (globe) { WM.globeFrame(game, c, g); return; }
      // the chart's edge, darkened as old paper is
      const vg = g.createRadialGradient(c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.45, c.width / 2, c.height / 2, Math.max(c.width, c.height) * 0.75);
      vg.addColorStop(0, 'rgba(60,40,20,0)'); vg.addColorStop(1, 'rgba(60,40,20,0.35)'); g.fillStyle = vg; g.fillRect(0, 0, c.width, c.height);
      // the world's name, in a cartouche
      g.font = 'italic bold 18px "Cormorant Garamond", Georgia, serif'; const tw = g.measureText(world.name).width + 36;
      g.fillStyle = 'rgba(236,224,190,0.88)'; g.strokeStyle = 'rgba(58,42,24,0.85)'; g.lineWidth = 1.5; g.fillRect(c.width / 2 - tw / 2, 8, tw, 28); g.strokeRect(c.width / 2 - tw / 2 + 3, 11, tw - 6, 22);
      g.fillStyle = '#3a2a18'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(world.name, c.width / 2, 22);
      // compass and scale
      g.save(); g.translate(c.width - 34, 34); g.fillStyle = 'rgba(20,14,8,0.6)'; g.beginPath(); g.arc(0, 0, 20, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#e8c86a'; g.beginPath(); g.moveTo(0, -16); g.lineTo(5, 0); g.lineTo(-5, 0); g.closePath(); g.fill(); g.fillStyle = '#a89c88'; g.beginPath(); g.moveTo(0, 16); g.lineTo(5, 0); g.lineTo(-5, 0); g.closePath(); g.fill();
      g.fillStyle = '#fff4dc'; g.font = 'bold 11px sans-serif'; g.fillText('N', 0, -24 + 30); g.restore();
      const lg = 20, px = lg * V.z;
      g.fillStyle = 'rgba(20,14,8,0.6)'; g.fillRect(10, c.height - 28, px + 70, 20);
      g.fillStyle = '#efe3c8'; g.fillRect(16, c.height - 16, px, 3); g.font = '11px "Pixelify Sans", monospace'; g.textAlign = 'left'; g.fillText(`${lg} leagues`, 22 + px, c.height - 15);
      g.textAlign = 'center';
      void INK;
    },
    // ------------------------------------------------------------ the globe
    isGlobe(world) { world = world || (ECHO.Game && ECHO.Game.world); return WM.mode === 'globe' && !!WM.G && !!world && !!world.globe; },
    globeInit(main, c) {
      let G = WM.G;
      if (!G) {
        const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        r.outputEncoding = THREE.sRGBEncoding;
        const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(32, 1, 0.01, 300);
        sc.add(new THREE.AmbientLight('#c8d4ff', 0.5));
        const sun = new THREE.DirectionalLight('#fff4e4', 0.95); sun.position.set(-3, 2.4, 4); sc.add(sun);
        const tilt = new THREE.Group(), spin = new THREE.Group(); tilt.add(spin); sc.add(tilt);
        const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92, metalness: 0 });
        const wd = ECHO.Game.world, ball = new THREE.Mesh(WM.ballGeo(wd, 1, 0, wd.W, 0, wd.H, 192, 120), mat); spin.add(ball);
        // the sky round its rim
        const halo = new THREE.Mesh(new THREE.SphereGeometry(1.12, 96, 48), new THREE.ShaderMaterial({ transparent: true, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending,
          vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
          fragmentShader: 'varying vec3 vN; void main(){ float k = pow(max(0.0, 0.7 - dot(vN, vec3(0.0, 0.0, 1.0))), 3.0); gl_FragColor = vec4(0.42, 0.66, 1.0, 1.0) * k * 1.6; }' }));
        sc.add(halo);
        // and the stars past it
        const N = 2200, sp = new Float32Array(N * 3);
        for (let i = 0; i < N; i++) { const a = Math.random() * Math.PI * 2, z = Math.random() * 2 - 1, rr = Math.sqrt(1 - z * z), d = 90 + Math.random() * 60; sp[i * 3] = Math.cos(a) * rr * d; sp[i * 3 + 1] = z * d; sp[i * 3 + 2] = Math.sin(a) * rr * d; }
        const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
        sc.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: '#d8e0ff', size: 0.35, sizeAttenuation: true, transparent: true, opacity: 0.8 })));
        G = WM.G = { r, sc, cam, tilt, spin, ball, mat, sun, yaw: 0, pitch: 0, dist: 3.9, min: 1.09, max: 7, ray: new THREE.Raycaster(), anim: null };
      }
      G.r.domElement.className = 'wmap-globe';
      main.insertBefore(G.r.domElement, c);
      return G;
    },
    globeSize(c) { const G = WM.G; G.r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); G.r.setSize(c.width, c.height); G.cam.aspect = c.width / Math.max(1, c.height); G.cam.updateProjectionMatrix(); },
    globeShow(main) { const on = WM.isGlobe(); main.classList.toggle('globe', on); if (WM.G) WM.G.r.domElement.style.display = on ? 'block' : 'none'; },
    // The world's chart, wrapped round the ball: the painted land, the roads you know, what you
    // have not walked (unless the whole map is shown), and lines of latitude and longitude.
    globeTex(game) {
      const world = game.world, pl = game.pl, G = WM.G, base = WM.base(world);
      const TW = Math.min(4096, (G.r.capabilities && G.r.capabilities.maxTextureSize) || 4096), TH = TW / 2, k = TW / world.W, ky = TH / world.H;
      const cv = G.cv || (G.cv = document.createElement('canvas')); cv.width = TW; cv.height = TH;
      const g = cv.getContext('2d'); g.imageSmoothingEnabled = true;
      g.drawImage(base, 0, 0, TW, TH);
      const all = WM.revealed(pl), seenAt = (x, y) => all || ECHO.Game.explored(x, y);
      g.lineCap = 'round'; g.strokeStyle = 'rgba(122,88,50,0.85)'; g.lineWidth = Math.max(1, k * 0.7);
      for (const r of world.roads) {
        if (!Array.isArray(r.path) || r.path.length < 2) continue;
        g.beginPath(); let on = false, lx = 0;
        for (let i = 0; i < r.path.length; i += 2) { const t = r.path[i], x = t % world.W + 0.5, y = ((t / world.W) | 0) + 0.5; if (!seenAt(x, y) || (on && Math.abs(x - lx) > 40)) { on = false; continue; } if (!on) { g.moveTo(x * k, y * ky); on = true; } else g.lineTo(x * k, y * ky); lx = x; }
        g.stroke();
      }
      if (!all) { g.globalAlpha = 0.55; g.drawImage(WM.fogC, -4 * k, -4 * ky, WM.fogC.width * 4 * k, WM.fogC.height * 4 * ky); g.globalAlpha = 1; }   // (on the globe the unwalked land shows through, paler)
      // the lines of the globe: every fifteen degrees, the equator and the old island's meridian a little stronger
      g.lineWidth = 1;
      for (let i = 0; i <= 24; i++) { g.strokeStyle = 'rgba(90,62,30,0.2)'; g.beginPath(); g.moveTo(i * TW / 24, 0); g.lineTo(i * TW / 24, TH); g.stroke(); }
      for (let i = 1; i < 12; i++) { g.strokeStyle = i === 6 ? 'rgba(150,60,30,0.38)' : 'rgba(90,62,30,0.2)'; g.lineWidth = i === 6 ? 1.6 : 1; g.beginPath(); g.moveTo(0, i * TH / 12); g.lineTo(TW, i * TH / 12); g.stroke(); }
      if (world.globe) { const mx = (world.globe.old.x0 + world.globe.old.x1) / 2 * k; g.strokeStyle = 'rgba(255,232,180,0.26)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(mx, 0); g.lineTo(mx, TH); g.stroke(); }
      if (!G.tex) { G.tex = new THREE.CanvasTexture(cv); G.tex.encoding = THREE.sRGBEncoding; G.tex.anisotropy = G.r.capabilities.getMaxAnisotropy ? G.r.capabilities.getMaxAnisotropy() : 1; G.mat.map = G.tex; G.mat.needsUpdate = true; }
      else G.tex.needsUpdate = true;
      G.texKey = WM._baseKey; WM.globeSegsClear();
    },
    // The globe, sharp wherever you look. The ball is cut into pieces 90 tiles a side; each
    // piece facing you is painted again, sharper, as you come closer (two, four or eight
    // pixels to a tile), nearest the middle of the view first, a piece at a time between
    // frames, so the globe is as crisp as the chart however close you come. Pieces you have
    // turned away from are let go when there are too many.
    SEG: 90,
    globeDetail(game, c) {
      const G = WM.G, world = game.world, SEG = WM.SEG;
      if (!world.globe) return;
      const nx = Math.ceil(world.W / SEG), ny = Math.ceil(world.H / SEG), w = c.width, h = c.height;
      const segs = G.segs || (G.segs = new Map());
      G.frame = (G.frame || 0) + 1;
      const on = p => !p.hidden && p.x > -w * 0.25 && p.x < w * 1.25 && p.y > -h * 0.25 && p.y < h * 1.25;
      const want = [];
      // close in, a piece can be bigger than the view: look where the screen itself falls on the ground
      const under = new Map();
      for (let iy = 0; iy <= 8; iy++) for (let ix = 0; ix <= 10; ix++) {
        const p = WM.gWorld(c, ix / 10 * w, iy / 8 * h); if (p.x < 0) continue;
        const s0 = WM.gScreen(c, p.x, p.y), q = WM.gScreen(c, p.x + 2, p.y), r = WM.gScreen(c, p.x, Math.min(world.H - 0.01, p.y + 2));
        let pp = 0; if (!s0.hidden) { if (!q.hidden) pp = Math.max(pp, Math.hypot(q.x - s0.x, q.y - s0.y) / 2); if (!r.hidden) pp = Math.max(pp, Math.hypot(r.x - s0.x, r.y - s0.y) / 2); }
        const k = Math.floor(p.x / SEG) + ',' + Math.floor(p.y / SEG), d = Math.hypot(ix / 10 * w - w / 2, iy / 8 * h - h / 2);
        const u = under.get(k); if (!u) under.set(k, { pp, d }); else { u.pp = Math.max(u.pp, pp); u.d = Math.min(u.d, d); }
      }
      for (let sy = 0; sy < ny; sy++) for (let sx = 0; sx < nx; sx++) {
        const x0 = sx * SEG, y0 = sy * SEG, x1 = Math.min(world.W, x0 + SEG), y1 = Math.min(world.H, y0 + SEG);
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, key = sx + ',' + sy, cur = segs.get(key);
        const p = WM.gScreen(c, cx, cy), un = under.get(key);
        const seen = !!un || on(p) || [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].some(([a, b]) => on(WM.gScreen(c, a, b)));
        if (!seen) { if (cur) cur.mesh.visible = false; continue; }
        // how many pixels of the screen a tile takes here
        let ppt = un ? un.pp : 0;
        if (!p.hidden) { const q = WM.gScreen(c, cx + 3, cy), r = WM.gScreen(c, cx, cy + 3); if (!q.hidden) ppt = Math.max(ppt, Math.hypot(q.x - p.x, q.y - p.y) / 3); if (!r.hidden) ppt = Math.max(ppt, Math.hypot(r.x - p.x, r.y - p.y) / 3); }
        const S = ppt < 1.1 ? 0 : ppt < 2.2 ? 2 : ppt < 4.5 ? 4 : 8;
        if (cur) { cur.mesh.visible = S > 0 || cur.S <= 2; cur.used = G.frame; }
        if (S > 0 && (!cur || cur.S < S)) want.push({ key, sx, sy, x0, y0, x1, y1, S, d: un ? un.d : p.hidden ? 1e9 : Math.hypot(p.x - w / 2, p.y - h / 2) });
      }
      want.sort((a, b) => a.d - b.d);
      G.segQ = want;
      if (want.length && !G.segRun) {
        G.segRun = setTimeout(function work() {
          G.segRun = null;
          const cc = document.getElementById('worldmap');
          if (!cc || !WM.isGlobe() || !G.segQ || !G.segQ.length) return;
          const t0 = performance.now();
          while (G.segQ.length && performance.now() - t0 < 30) { const job = G.segQ.shift(); try { WM.globeSeg(game, job); } catch (err) { console.error('ECHO: map detail', err); G.segQ = []; } }
          WM.draw(game, cc);
        }, 20);
      }
    },
    globeSeg(game, j) {
      const world = game.world, pl = game.pl, G = WM.G, W = world.W, H = world.H, S = j.S;
      const M = 4, px0 = Math.max(0, j.x0 - M), py0 = Math.max(0, j.y0 - M), px1 = Math.min(W, j.x1 + M), py1 = Math.min(H, j.y1 + M);
      const cv = document.createElement('canvas'); cv.width = (j.x1 - j.x0) * S; cv.height = (j.y1 - j.y0) * S;
      const g = cv.getContext('2d');
      g.putImageData(WM.paint(world, px0, py0, px1, py1, S), (px0 - j.x0) * S, (py0 - j.y0) * S, (j.x0 - px0) * S, (j.y0 - py0) * S, cv.width, cv.height);
      // the roads you know, and (unless the whole map is shown) the unwalked, paler
      const all = WM.revealed(pl), seenAt = (x, y) => all || ECHO.Game.explored(x, y);
      if (!G.roadBox || G.roadBoxN !== world.roads.length) { G.roadBoxN = world.roads.length; G.roadBox = world.roads.map(r => { let a = 1e9, b = 1e9, c2 = -1, d = -1; if (Array.isArray(r.path)) for (const t of r.path) { const x = t % W, y = (t / W) | 0; if (x < a) a = x; if (x > c2) c2 = x; if (y < b) b = y; if (y > d) d = y; } return [a, b, c2, d]; }); }
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (const pass of [0, 1]) {
        g.strokeStyle = pass ? 'rgba(122,88,50,0.95)' : 'rgba(236,222,186,0.55)'; g.lineWidth = Math.max(1, S * (pass ? 0.42 : 0.75));
        world.roads.forEach((r, i) => {
          const bb = G.roadBox[i]; if (!bb || bb[2] < j.x0 - 2 || bb[0] > j.x1 + 2 || bb[3] < j.y0 - 2 || bb[1] > j.y1 + 2 || r.path.length < 2) return;
          g.beginPath(); let onr = false;
          for (const t of r.path) { const x = t % W + 0.5, y = ((t / W) | 0) + 0.5; if (x < j.x0 - 2 || x > j.x1 + 2 || y < j.y0 - 2 || y > j.y1 + 2 || !seenAt(x, y)) { onr = false; continue; } const qx = (x - j.x0) * S, qy = (y - j.y0) * S; if (!onr) { g.moveTo(qx, qy); onr = true; } else g.lineTo(qx, qy); }
          g.stroke();
        });
      }
      if (!all) { g.imageSmoothingEnabled = true; g.globalAlpha = 0.55; g.drawImage(WM.fogC, (-4 - j.x0) * S, (-4 - j.y0) * S, WM.fogC.width * 4 * S, WM.fogC.height * 4 * S); g.globalAlpha = 1; }
      const tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = G.r.capabilities.getMaxAnisotropy ? G.r.capabilities.getMaxAnisotropy() : 1;
      let cur = G.segs.get(j.key);
      if (!cur) {
        const geo = WM.ballGeo(world, 1.0004, j.x0, j.x1, j.y0, j.y1, 20, 20);
        const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
        G.spin.add(mesh);
        cur = { mesh, S: 0, px: 0 }; G.segs.set(j.key, cur);
      }
      if (cur.mesh.material.map) cur.mesh.material.map.dispose();
      cur.mesh.material.map = tex; cur.mesh.material.needsUpdate = true; cur.mesh.visible = true;
      cur.S = S; cur.px = cv.width * cv.height; cur.used = G.frame;
      // let go of the least lately seen when the pieces hold too much
      let tot = 0; for (const v of G.segs.values()) tot += v.px;
      if (tot > 42e6) {
        const old = [...G.segs.entries()].filter(([, v]) => v !== cur).sort((a, b) => a[1].used - b[1].used);
        for (const [k, v] of old) { if (tot <= 32e6) break; tot -= v.px; v.mesh.material.map.dispose(); v.mesh.material.dispose(); v.mesh.geometry.dispose(); G.spin.remove(v.mesh); G.segs.delete(k); }
      }
    },
    globeSegsClear() {
      const G = WM.G; if (!G || !G.segs) return;
      for (const v of G.segs.values()) { if (v.mesh.material.map) v.mesh.material.map.dispose(); v.mesh.material.dispose(); v.mesh.geometry.dispose(); G.spin.remove(v.mesh); }
      G.segs.clear(); G.segQ = [];
    },
    // a place on the ball (unturned), from a place in the world
    gPoint(world, x, y) { const ph = x / world.W * Math.PI * 2, th = Math.PI / 2 - ECHO.Globe.lat(world, y); return new THREE.Vector3(-Math.cos(ph) * Math.sin(th), Math.cos(th), Math.sin(ph) * Math.sin(th)); },
    // a piece of the ball for the tiles (x0..x1, y0..y1), its rows at their latitudes (Globe.lat)
    ballGeo(world, r, x0, x1, y0, y1, nx, ny) {
      const pos = [], nor = [], uv = [], idx = [];
      for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
        const x = x0 + (x1 - x0) * i / nx, y = y0 + (y1 - y0) * j / ny, p = WM.gPoint(world, x, y);
        pos.push(p.x * r, p.y * r, p.z * r); nor.push(p.x, p.y, p.z); uv.push(i / nx, 1 - j / ny);
      }
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeBoundingSphere();
      return g;
    },
    // turn the globe to bring (x, y) to face you, slowly or at once
    globeFocus(x, y, dist, now) {
      const G = WM.G, world = ECHO.Game.world;
      const yaw = Math.PI / 2 - x / world.W * Math.PI * 2, pitch = U.clamp(ECHO.Globe.lat(world, y), -1.45, 1.45);
      let dy = ((yaw - G.yaw) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
      const to = { yaw: G.yaw + dy, pitch, dist: dist != null ? U.clamp(dist, G.min, G.max) : G.dist };
      if (now) { G.yaw = to.yaw; G.pitch = to.pitch; G.dist = to.dist; G.anim = null; return; }
      G.anim = { from: { yaw: G.yaw, pitch: G.pitch, dist: G.dist }, to, t0: performance.now(), dur: 650 };
      const step = () => { if (!G.anim) return; const c = document.getElementById('worldmap'); if (c && ECHO.Game) WM.draw(ECHO.Game, c); if (G.anim) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    },
    globeStep() {
      const G = WM.G;
      if (G.anim) {
        const a = G.anim, t = U.clamp((performance.now() - a.t0) / a.dur, 0, 1), e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        G.yaw = a.from.yaw + (a.to.yaw - a.from.yaw) * e; G.pitch = a.from.pitch + (a.to.pitch - a.from.pitch) * e; G.dist = a.from.dist + (a.to.dist - a.from.dist) * e;
        if (t >= 1) G.anim = null;
      }
      if (ECHO.Game && ECHO.Game.world) { WM.base(ECHO.Game.world); if (G.texKey !== WM._baseKey) WM.globeTex(ECHO.Game); }
      // Coming down toward the ground the view leans forward, as a bird's would, so the round
      // edge of the world and the sky beyond it stay in sight above the land you are looking at
      // (which is kept in the middle of the view: the globe turns to keep it there).
      const d = G.dist, hz = Math.asin(Math.min(1, 1 / d)), half = G.cam.fov * Math.PI / 360;
      const lean = U.clamp((1.35 - (d - 1)) / 0.6, 0, 1) * Math.max(0, hz - half + 0.07);
      const beta = Math.asin(Math.min(1, d * Math.sin(lean))) - lean;
      G.lean = lean;
      G.spin.rotation.y = G.yaw; G.tilt.rotation.x = G.pitch - beta;
      G.cam.position.set(0, 0, d); G.cam.lookAt(0, 0, 0); G.cam.rotateX(lean); G.cam.updateMatrixWorld(true);
      G.sc.updateMatrixWorld(true);
      // the sun stands over the place where it is noon (by the hour where you are), north of the middle in summer
      const game = ECHO.Game, world = game && game.world;
      if (world && world.globe && game.pl) {
        const hr = world.minute / 60, si = ECHO.TIME.dateOf(world.day).seasonIdx;
        const sx = game.pl.x - (hr - 12) / 24 * world.W, lat = [0, 23, 0, -23][si] || 0;
        const d = WM.gPoint(world, ((sx % world.W) + world.W) % world.W, world.H / 2 - lat / 180 * world.H).transformDirection(G.spin.matrixWorld);
        G.sun.position.copy(d.multiplyScalar(10));
      }
    },
    gScreen(c, x, y) {
      const G = WM.G, p = WM.gPoint(ECHO.Game.world, x, y).applyMatrix4(G.spin.matrixWorld);
      const facing = p.z * G.dist - 1;                                   // (seen only from the near side of the ball)
      if (facing < 0.05 * (G.dist - 1)) return { x: -9999, y: -9999, hidden: true };
      const q = p.project(G.cam);
      return { x: (q.x + 1) / 2 * c.width, y: (1 - q.y) / 2 * c.height };
    },
    gWorld(c, sx, sy) {
      const G = WM.G, world = ECHO.Game.world;
      G.ray.setFromCamera(new THREE.Vector2(sx / c.width * 2 - 1, -(sy / c.height * 2 - 1)), G.cam);
      const hit = G.ray.intersectObject(G.ball, false)[0];
      if (!hit || !hit.uv) return { x: -1, y: -1 };
      return { x: U.clamp(hit.uv.x * world.W, 0, world.W - 0.01), y: U.clamp((1 - hit.uv.y) * world.H, 0, world.H - 0.01) };
    },
    // what goes round the globe on the screen: its name, a compass rose of the poles, the reading under the pointer
    globeFrame(game, c, g) {
      const world = game.world, G = WM.G;
      g.font = 'italic bold 18px "Cormorant Garamond", Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const label = world.name, tw = g.measureText(label).width + 36;
      g.fillStyle = 'rgba(236,224,190,0.88)'; g.strokeStyle = 'rgba(58,42,24,0.85)'; g.lineWidth = 1.5; g.fillRect(c.width / 2 - tw / 2, 8, tw, 28); g.strokeRect(c.width / 2 - tw / 2 + 3, 11, tw - 6, 22);
      g.fillStyle = '#3a2a18'; g.fillText(label, c.width / 2, 22);
      // the poles, where they can be seen
      for (const [yy, t] of [[0.5, 'N'], [world.H - 0.5, 'S']]) {
        const p = WM.gScreen(c, world.W / 2, yy); if (p.hidden) continue;
        g.fillStyle = 'rgba(20,14,8,0.6)'; g.beginPath(); g.arc(p.x, p.y, 9, 0, Math.PI * 2); g.fill(); g.fillStyle = '#e8c86a'; g.font = 'bold 11px sans-serif'; g.fillText(t, p.x, p.y + 0.5);
      }
      // how much of the world is known
      const Gd = world.globe, made = Gd ? Gd.made.reduce((a, b) => a + b, 0) : 0, tot = Gd ? Gd.made.length : 1;
      const a = WM._hoverLL;
      g.font = '12px "Pixelify Sans", monospace'; g.textAlign = 'left';
      const lines = [`${Math.max(1, Math.round(made / tot * 100))}% of the world's country known`, a ? a : 'Drag to turn the world · scroll to come closer'];
      const bw = Math.max(...lines.map(t => g.measureText(t).width)) + 16;
      g.fillStyle = 'rgba(20,14,8,0.62)'; g.fillRect(c.width - bw - 10, 10, bw, 38);
      g.fillStyle = '#efe3c8'; lines.forEach((t, i) => g.fillText(t, c.width - bw - 2, 21 + i * 16));
      if (ECHO.Updates && ECHO.Updates.build) { g.font = '11px "Pixelify Sans", monospace'; g.fillStyle = 'rgba(239,227,200,0.55)'; g.fillText('ECHO ' + ECHO.Updates.build, 14, c.height - 14); }
      g.textAlign = 'center';
      void G;
    },
    rings(game, c, g) {
      if (!WM.layers.quests) return;
      const world = game.world, pl = game.pl, V = WM.view;
      const ring = (x, y, r, dash) => { const p = WM.toScreen(c, x, y); g.strokeStyle = 'rgba(255,224,138,0.9)'; g.lineWidth = 2; g.setLineDash(dash ? [5, 4] : []); g.beginPath(); g.arc(p.x, p.y, Math.max(8, r * V.z), 0, Math.PI * 2); g.stroke(); g.setLineDash([]); };
      const EX = world.expedition;
      if (EX && EX.next) ring(EX.next.x + (ECHO.hash2(EX.next.x | 0, 7, 3) - 0.5) * 10, EX.next.y + (ECHO.hash2(EX.next.y | 0, 8, 3) - 0.5) * 10, 9, true);
      const inv = pl.investigating && ECHO.Watch && ECHO.Watch.byId(world, pl.investigating);
      if (inv && inv.status === 'open') ring(inv.x, inv.y, 3);
      for (const p of world.plights) {
        if (p.status !== 'open' || !pl.accepted.includes(p.id)) continue;
        const camp = p.campId && world.camps.find(c2 => c2.id === p.campId);
        const lair = p.lairId && world.lairs.find(l => l.id === p.lairId);
        const site = p.siteId && ECHO.Explore.byId(world, p.siteId);
        const t = camp || lair || (site && site.found ? site : null);
        if (t) ring(t.x, t.y, 3);
        else if (site) ring(site.x + (ECHO.hash2(site.x | 0, 3, 7) - 0.5) * 16, site.y + (ECHO.hash2(site.y | 0, 4, 7) - 0.5) * 16, 14, true);
        else if (p.kind === 'treasure') ring(p.x + (ECHO.hash2(p.x | 0, 5, 7) - 0.5) * 8, p.y + (ECHO.hash2(p.y | 0, 6, 7) - 0.5) * 8, 7, true);
        else if (p.kind === 'lost' || p.kind === 'hunt') ring(p.x, p.y, p.kind === 'lost' ? 9 : 11, true);
        else if (p.kind === 'clearsite' && p.x != null) ring(p.x, p.y, 4);
        else if (p.kind === 'courier' || p.kind === 'envoy') {
          const to = p.kind === 'courier' ? ECHO.Sim.settlement(world, p.toSid) : world.factions[p.toFaction] && ECHO.Sim.settlement(world, world.factions[p.toFaction].capital);
          if (to) ring(to.x, to.y, 4);
        }
      }
    },

    // ------------------------------------------------------------ the minimap
    // Below ground: the floor as you have seen it.
    miniDungeon(game, c) {
      const L = ECHO.Interior.cur, g = c.getContext('2d'), B = ECHO.Interior.BASE, pe = game.pe;
      const s = Math.min((c.width - 8) / L.W, (c.height - 8) / L.H), ox = (c.width - L.W * s) / 2, oy = (c.height - L.H * s) / 2;
      g.fillStyle = '#0a0806'; g.fillRect(0, 0, c.width, c.height);
      for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) {
        if (L.rock[y * L.W + x] || !L.seen[y * L.W + x]) continue;
        const lord = L.lordRoom && x >= L.lordRoom.x0 && x < L.lordRoom.x1 && y >= L.lordRoom.y0 && y < L.lordRoom.y1;
        g.fillStyle = lord ? '#6a3a30' : '#8a7c66'; g.fillRect(ox + x * s, oy + y * s, Math.ceil(s), Math.ceil(s));
      }
      const mark = (x, y, col, r = 2.2) => { if (!L.seen[Math.floor(y) * L.W + Math.floor(x)]) return; g.fillStyle = col; g.beginPath(); g.arc(ox + x * s, oy + y * s, r, 0, Math.PI * 2); g.fill(); };
      for (const f of L.furn) {
        if (f.action === 'delvedown' || f.action === 'delveup') mark(f.x, f.y, '#9fd3ff', 3);
        else if (f.tag === 'door') mark(f.x, f.y, '#d8b04a', 2.4);
        else if (f.action === 'delvechest' || f.action === 'delvetreasure' || f.action === 'delvecache') mark(f.x, f.y, '#ffe08a', 2.2);
      }
      for (const t of L.traps || []) mark(t.x, t.y, '#ff6a4a', 1.4);
      for (const e of game.ents) if (!e.dead && e.delve && L.seen[Math.floor(e.y) * L.W + Math.floor(e.x - B)] && U.dist(e.x, e.y, pe.x, pe.y) < 9) mark(e.x - B, e.y, e.boss2 ? '#ffcf5a' : e.keybearer ? '#ffd84a' : '#e05a4a', e.boss2 ? 3.2 : 1.8);
      mark(L.inside.x - B, L.inside.y + 0.5, '#fff0c0', 2.6);
      WM.icon(g, 'player', ox + (pe.x - B) * s, oy + pe.y * s, '#fff', 0.55, pe.dir || 0);
    },
    // the world beyond a gate: its regions, you, your mentor, the way home
    miniGate(game, c) {
      const L = ECHO.Interior.cur, g = c.getContext('2d'), B = ECHO.Interior.BASE, pe = game.pe;
      if (!L._mini) {
        const cv = L._mini = document.createElement('canvas'); cv.width = L.W; cv.height = L.H;
        const x = cv.getContext('2d'), img = x.createImageData(L.W, L.H), P = L.pal;
        const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
        const fl = hex(P.floor[1]), rk = hex('#0a0806'), lq = hex(P.liquid2);
        for (let i = 0; i < L.W * L.H; i++) {
          const c0 = L.rock[i] ? rk : L.liquid[i] ? lq : fl, z = L.zone[i], k = L.rock[i] ? 1 : 1 + z * 0.12;
          img.data[i * 4] = Math.min(255, c0[0] * k); img.data[i * 4 + 1] = Math.min(255, c0[1] * k); img.data[i * 4 + 2] = Math.min(255, c0[2] * k); img.data[i * 4 + 3] = 255;
        }
        x.putImageData(img, 0, 0);
      }
      const s = Math.min((c.width - 6) / L.W, (c.height - 6) / L.H), ox = (c.width - L.W * s) / 2, oy = (c.height - L.H * s) / 2;
      g.fillStyle = '#0a0806'; g.fillRect(0, 0, c.width, c.height);
      g.imageSmoothingEnabled = false; g.drawImage(L._mini, ox, oy, L.W * s, L.H * s);
      const dot = (x, y, col, r) => { g.fillStyle = col; g.beginPath(); g.arc(ox + x * s, oy + y * s, r, 0, Math.PI * 2); g.fill(); };
      dot(L.inside.x - B, L.inside.y + 2, '#fff0c0', 2.6);
      dot(L.heart.x, L.heart.y, '#ff5a3a', 2.8);
      for (const e of game.ents) if (!e.dead && !e.hidden && e.gateMon && U.dist(e.x, e.y, pe.x, pe.y) < 14) dot(e.x - B, e.y, e.sovereign ? '#ffcf5a' : '#e05a4a', 1.4);
      const m = game.ents.find(e => e.mentor && !e.dead);
      if (m) dot(m.x - B, m.y, '#8fd0ff', 2.4);
      WM.icon(g, 'player', ox + (pe.x - B) * s, oy + pe.y * s, '#fff', 0.5, pe.dir || 0);
    },
    mini(game, c) {
      if (ECHO.Interior.cur && ECHO.Interior.cur.type === 'gate') return WM.miniGate(game, c);
      if (ECHO.Interior.cur && ECHO.Interior.cur.carved) return WM.miniDungeon(game, c);
      const world = game.world, pl = game.pl, g = c.getContext('2d');
      const pe = ECHO.Interior.cur ? { x: pl.x, y: pl.y, dir: game.pe ? game.pe.dir : 0 } : game.pe;
      const scale = 2.2, sx = pe.x - c.width / scale / 2, sy = pe.y - c.height / scale / 2;
      const P = (x, y) => ({ x: (x - sx) * scale, y: (y - sy) * scale });
      g.imageSmoothingEnabled = false;
      g.fillStyle = PARCH; g.fillRect(0, 0, c.width, c.height);
      const bs = WM.base(world), S = WM.baseScale || 1;
      g.imageSmoothingEnabled = true;
      for (const k of world.globe ? [0, world.W, -world.W] : [0]) g.drawImage(bs, (sx + k) * S, sy * S, c.width / scale * S, c.height / scale * S, 0, 0, c.width, c.height);   // (round the world: the other side, past the edge)
      const cw = Math.ceil(world.W / 4);
      g.fillStyle = PARCH;
      if (!WM.revealed(pl)) for (let y = Math.floor(sy / 4); y <= Math.ceil((sy + c.height / scale) / 4); y++) for (let x = Math.floor(sx / 4); x <= Math.ceil((sx + c.width / scale) / 4); x++) {
        if (x < 0 || y < 0 || x >= cw || !pl.explored[y * cw + x]) g.fillRect((x * 4 - sx) * scale, (y * 4 - sy) * scale, 4 * scale + 1, 4 * scale + 1);
      }
      const inView = p => p.x > -8 && p.y > -8 && p.x < c.width + 8 && p.y < c.height + 8;
      if (!WM._mf || game.time - WM._mfT > 1 || game.time < WM._mfT) { WM._mf = WM.features(game); WM._mfT = game.time; }
      for (const f of WM._mf) {
        if (f.layer !== 'towns' && f.layer !== 'dungeons' && f.layer !== 'danger' && f.layer !== 'gates') continue;
        const p = P(f.x, f.y);
        if (!inView(p)) continue;
        WM.icon(g, f.kind, p.x, p.y, f.color, f.layer === 'dungeons' ? 0.62 : 0.55, 0);
      }
      // Tracker (Hunter rank 2): what hunts near you, as red marks
      if (ECHO.Lore) for (const e of ECHO.Lore.tracked(game)) { const p = P(e.x, e.y); if (!inView(p)) continue; g.fillStyle = e.titan || e.type === 'boss' ? '#ff4a2a' : '#e05a4a'; g.beginPath(); g.arc(p.x, p.y, e.titan ? 4 : 2.2, 0, Math.PI * 2); g.fill(); g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 1; g.stroke(); }
      // the way ahead
      if (ECHO.Nav && !ECHO.Interior.cur) ECHO.Nav.drawOnMap(g, P, 120, 2);
      // where you are headed: on the map, or an arrow at the edge
      const goal = ECHO.Purpose && ECHO.Purpose.goal;
      if (goal && goal.where && goal.where.x != null && !goal.where.vague) {
        const p = P(goal.where.x, goal.where.y);
        if (p.x > 6 && p.y > 6 && p.x < c.width - 6 && p.y < c.height - 6) WM.icon(g, 'flag', p.x, p.y - 4, '#ffe08a', 0.75);
        else {
          const a = Math.atan2(p.y - c.height / 2, p.x - c.width / 2);
          const ex = c.width / 2 + Math.cos(a) * (c.width / 2 - 9), ey = c.height / 2 + Math.sin(a) * (c.height / 2 - 9);
          g.save(); g.translate(U.clamp(ex, 9, c.width - 9), U.clamp(ey, 9, c.height - 9)); g.rotate(a);
          g.fillStyle = '#ffe08a'; g.strokeStyle = '#1a120a'; g.lineWidth = 2; g.beginPath(); g.moveTo(7, 0); g.lineTo(-5, 5); g.lineTo(-5, -5); g.closePath(); g.stroke(); g.fill(); g.restore();
        }
      }
      WM.icon(g, 'player', c.width / 2, c.height / 2, '#fff', 0.8, pe.dir || 0);
    }
  };
})();
