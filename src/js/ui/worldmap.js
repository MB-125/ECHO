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
  const KIND_NAME = { dungeon: 'Dungeon', 'dungeon-cleared': 'Dungeon · cleared', 'dungeon-unknown': 'Dungeon · uncharted', capital: 'Capital', town: 'Town', gate: 'Gate', camp: 'Outlaw camp', lair: 'Lair', 'lair-dead': 'Lair · empty', landmark: 'Landmark', wonder: 'Wonder', ruin: 'Ruins', vault: 'Vault', mark: 'Waypoint', titan: 'Great beast', region: 'Region', fallen: 'Fallen adventurer' };
  const DIR_S = { east: 'E', 'south-east': 'SE', south: 'S', 'south-west': 'SW', west: 'W', 'north-west': 'NW', north: 'N', 'north-east': 'NE' };
  const LAYER_COL = { dungeons: '#ffc04a', towns: '#8fb4ff', gates: '#c86aff', danger: '#ff6a4a', places: '#a8e0c0', wonders: '#ffd38a', quests: '#ffe08a', regions: '#efe3c8' };
  // the console's light
  const HOLO = 'rgba(95,242,255,', AMBER = 'rgba(255,207,106,';

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
      const qa = new Int32Array(N); let qn = 0; for (const i of q) qa[qn++] = i;
      for (let k = 0; k < qn; k++) {
        const i = qa[k], x = i % W, y = (i / W) | 0, d = sea[i] + 1; if (d > 8) continue;
        if (x + 1 < W && sea[i + 1] > d) { sea[i + 1] = d; qa[qn++] = i + 1; }
        if (x > 0 && sea[i - 1] > d) { sea[i - 1] = d; qa[qn++] = i - 1; }
        if (y + 1 < H && sea[i + W] > d) { sea[i + W] = d; qa[qn++] = i + W; }
        if (y > 0 && sea[i - W] > d) { sea[i - W] = d; qa[qn++] = i - W; }
      }
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
          // (four neighbours, written out: this runs for every pixel, and must make no garbage)
          if ((land[i00] > 0.5) === isLand || (mist && mist[i00])) { r += col[i00 * 3] * w00; gg += col[i00 * 3 + 1] * w00; b += col[i00 * 3 + 2] * w00; ws += w00; }
          if ((land[i10] > 0.5) === isLand || (mist && mist[i10])) { r += col[i10 * 3] * w10; gg += col[i10 * 3 + 1] * w10; b += col[i10 * 3 + 2] * w10; ws += w10; }
          if ((land[i01] > 0.5) === isLand || (mist && mist[i01])) { r += col[i01 * 3] * w01; gg += col[i01 * 3 + 1] * w01; b += col[i01 * 3 + 2] * w01; ws += w01; }
          if ((land[i11] > 0.5) === isLand || (mist && mist[i11])) { r += col[i11 * 3] * w11; gg += col[i11 * 3 + 1] * w11; b += col[i11 * 3 + 2] * w11; ws += w11; }
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
          if (world.cut && ECHO.Clearing && ECHO.Clearing.at(world, gx, gy)) continue;     // (felled)
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
    features(game, box) {
      // (box: only what lies within it — the little map needs only what is around you)
      const world = game.world, R3 = ECHO.Renderer3D, im = box && world.globe && R3 && R3._imF ? R3.img : null;   // (round the world, and over a pole: the copy nearest you)
      const pl = game.pl, out = [], add = f => { if (!box) return out.push(f); const I = im ? im(f.x, f.y) : f; if (I.x > box.x0 && I.x < box.x1 && I.y > box.y0 && I.y < box.y1) out.push(f); }, all = WM.revealed(pl), seen = (x, y) => all || game.explored(x, y);
      const Pw = ECHO.Prowess, me = Pw ? Pw.level(pl) : 1;
      for (const s of world.settlements) if (seen(s.x, s.y)) add({ layer: 'towns', kind: s.kind === 'capital' ? 'capital' : 'town', x: s.x, y: s.y, name: s.name, color: world.factions[s.faction] ? world.factions[s.faction].color : '#ccc', pri: s.kind === 'capital' ? 9 : 7, ref: s,
        sub: `${s.kind === 'capital' ? 'Capital' : s.kind === 'village' ? 'Village' : 'Town'} of ${world.factions[s.faction] ? world.factions[s.faction].name : 'no one'}${s.warden === pl.charId ? ' · yours' : ''}${s.char && s.char.kind !== 'village' && ECHO.TownLife ? ' · ' + ECHO.TownLife.KINDS[s.char.kind].name.toLowerCase() : ''}` });
      for (const site of ECHO.Explore.sites(world)) {
        if (!site.found && !site.seen && !all) continue;
        if (site.cat === 'delve') {
          const told = site.found || site.starter || all, L = ECHO.Explore.level(world, site), fl = ECHO.Explore.floors(site), done = Math.min(fl, Object.keys(site.floorsDone || {}).length);
          const D = Pw ? Pw.diff(L, me) : { color: '#e0a070', word: '' };
          add({ layer: 'dungeons', kind: site.cleared ? 'dungeon-cleared' : told ? 'dungeon' : 'dungeon-unknown', x: site.x, y: site.y, name: told ? site.name : 'An uncharted dungeon', color: site.cleared ? '#9a9080' : told ? D.color : '#a89c88', pri: 10, ref: site,
            life: told && site.life ? site : null,
            stars: told ? ECHO.Explore.stars(site) : '?', sub: !told ? 'A way down, glimpsed from afar' : `${ECHO.Explore.label(site)} · ${ECHO.Explore.stars(site)} · ${fl} floor${fl > 1 ? 's' : ''}${site.cleared ? ' · cleared' : done ? ` · ${done}/${fl} floors cleared` : ''}${site.life && site.life.state !== 'dormant' && ECHO.DungeonLife ? ' · ' + ECHO.DungeonLife.STATES[site.life.state].name : ''}${site.sleeper ? ' · the Sleeper\'s seat' : site.bloom ? ' · Bloomed' : ''}`, diff: site.cleared ? 'Cleared — it will fill again in time' : site.found || all ? `${D.word} for you (monsters about level ${L}–${L + Math.floor((fl - 1) / 2) + 1})` : 'Seen from afar. Go closer to learn more.' });
        } else if (site.cat === 'wonder') add({ layer: 'wonders', kind: 'wonder', x: site.x, y: site.y, name: site.found || all ? site.name : 'Something strange', color: '#ffd38a', pri: 5, ref: site, sub: site.found ? 'A wonder of the wild' : all ? 'A wonder of the wild · not yet visited' : 'Seen from afar' });
        else add({ layer: 'places', kind: 'landmark', x: site.x, y: site.y, name: site.found || all ? site.name : 'A landmark', color: '#a8e0c0', pri: 4, ref: site, sub: site.found || all ? ECHO.Explore.label(site) + (site.found ? '' : ' · not yet visited') : 'Seen from afar' });
      }
      if (ECHO.Guild) for (const c of ECHO.Guild.caches(world)) add({ layer: 'danger', kind: 'fallen', x: c.x, y: c.y, name: `Where ${c.name} fell`, color: '#d8c8a0', pri: 5, ref: c, sub: `${c.rank}-rank of the Guild${c.items.length ? ' · gear still on the body' : ''}` });
      for (const cp of world.camps) if ((cp.seen || all) && cp.alive) add({ layer: 'danger', kind: 'camp', x: cp.x, y: cp.y, name: cp.name || 'Outlaw camp', color: '#e0563c', pri: 6, ref: cp, sub: 'Outlaws camp here' });
      for (const l of world.lairs) if (l.seen || all) add({ layer: 'danger', kind: l.boss.alive ? 'lair' : 'lair-dead', x: l.x, y: l.y, name: `The lair of ${l.boss.name}`, color: l.boss.alive ? '#ff6a4a' : '#9a9080', pri: 8, ref: l, sub: l.boss.alive ? 'A great beast sleeps here' : 'Its master is dead' });
      for (const r of world.ruins) if (r.visited || seen(r.x, r.y)) add({ layer: 'wonders', kind: 'ruin', x: r.x + 0.5, y: r.y + 0.5, name: r.name || 'Ruins', color: '#c8c0b0', pri: 3, ref: r, sub: r.visited ? 'Ruins you have read' : 'Old ruins' });
      if (world.lang && world.lang.vault && world.lang.vault.revealed && !world.lang.vault.opened) add({ layer: 'wonders', kind: 'vault', x: world.lang.vault.x, y: world.lang.vault.y, name: 'The sealed vault', color: '#9fd3ff', pri: 8, sub: 'Its door waits for the words' });
      // the titans: every hunter in the realm knows where the dragons nest, and talks of the great beasts
      if (world.titans && ECHO.Titans) for (const t of world.titans.list) {
        if (!t.alive || t.bound) continue;
        const sp = ECHO.Titans.sp(t), D = Pw ? Pw.diff(t.lvl, me) : { color: '#ff6a4a', skulls: 0 };
        add({ layer: 'danger', kind: 'lair', x: t.x, y: t.y, name: `${t.name} ${t.title}`, color: D.color, pri: 9, ref: t, sub: `${t.mig ? `On the move ${ECHO.Calamity.whither(world, t)} · ` : t.seen ? '' : 'Said to range here · '}${sp.flies ? 'A dragon' : 'A great beast'} · level ${t.lvl}${ECHO.Calamity ? ' · ' + ECHO.Calamity.label(t) : ''}`, diff: D.skulls >= 2 ? 'Far beyond you: keep off its range' : 'Beat it down and bind it' });
      }
      // the deep woods: every woodsman warns you off them
      if (world.wild && ECHO.Wildwood) for (const w of world.wild.woods) {
        const L1 = ECHO.Wildwood.level(world, 1), L4 = ECHO.Wildwood.level(world, 4), D = Pw ? Pw.diff(L1, me) : { color: '#8aff6a', skulls: 3 };
        add({ layer: 'danger', kind: 'lair', x: w.x, y: w.y, name: U.cap(w.name), color: '#9ac86a', pri: 10, ref: w, sub: `A deep wood · beasts of level ${L1} at its edge, worse further in · ${ECHO.Wildwood.lordAlive(world, w) ? `${U.cap(w.lord.name)} (level ${L4}) at its heart` : `its lord is dead, for now`}`, diff: D.skulls >= 2 ? 'Deadly for you: keep out from under its trees' : 'Its trails lead to the heart' });
      }
      // the gates: everyone knows where they are
      if (world.gates) for (const g of world.gates.list) {
        const th = ECHO.Gates.THEMES[g.theme], weak = me < ECHO.Gates.MIN;
        add({ layer: 'gates', kind: 'gate', x: g.x, y: g.y, name: U.cap(g.name), color: th.color, pri: 11, ref: g, sub: `A gate to ${th.world} · held by the National Guard`, diff: weak ? `Deadly: below level ${ECHO.Gates.MIN} its menace kills (within ${ECHO.Gates.R_HURT} leagues)` : `Beasts of level ${ECHO.Gates.MIN}–${ECHO.Gates.TOP} beyond it` });
      }
      // what has got out of them, while the Guard runs it down
      if (ECHO.GuardWork && world.gates) for (const b of ECHO.GuardWork.openBreaches(world)) add({ layer: 'gates', kind: 'lair', x: b.x, y: b.y, name: `${ECHO.GuardWork.aBeast(b.kind, true)} out of ${b.gateName}`, color: '#ff4a3a', pri: 10, ref: b, sub: `Level ${b.lv} · loose since day ${b.day} · the National Guard is hunting it`, diff: me < ECHO.Gates.MIN ? 'Far beyond you: keep clear' : 'Run it down' });
      const wst = world.wonders;
      if (wst) {
        for (const e of wst.echoes || []) if ((e.revealed || all) && !e.found) add({ layer: 'wonders', kind: 'echo', x: e.x, y: e.y, name: 'An echo of the old world', color: '#bfe8ff', pri: 5, sub: 'Shown to you by the wisps' });
        for (const st of wst.stars || []) if (!st.taken) add({ layer: 'wonders', kind: 'star', x: st.x, y: st.y, name: 'A fallen star', color: '#ffffff', pri: 6, sub: 'Star-iron lies here' });
      }
      // with the whole map shown: the hidden places too
      if (all && world.secrets && world.secrets.list) {
        const NM = { cave: 'A hidden cave', shrine: 'A forgotten shrine', wreck: 'A wreck', circle: 'A ring of standing stones', hut: 'A hermit\'s hut' };
        for (const s of world.secrets.list) if (!s.done) add({ layer: 'places', kind: 'landmark', x: s.x, y: s.y, name: s.name || NM[s.kind] || 'Something hidden', color: s.found ? '#a8e0c0' : '#8ac8b0', pri: 3, ref: s, sub: s.found ? 'You have found it' : 'Not yet found' });
      }
      if (all) for (const ch of world.caches || []) if (!ch.found) add({ layer: 'wonders', kind: 'star', x: ch.x, y: ch.y, name: 'A buried cache', color: '#e8c86a', pri: 2, ref: ch, sub: 'Something is hidden here' });
      if (all && world.lang && world.lang.vault && !world.lang.vault.revealed && !world.lang.vault.opened) add({ layer: 'wonders', kind: 'vault', x: world.lang.vault.x, y: world.lang.vault.y, name: 'The sealed vault', color: '#9fd3ff', pri: 8, sub: 'Its door waits for words no one remembers' });
      return out;
    },

    // ------------------------------------------------------------ open the map
    open(game) {
      const world = game.world, pl = game.pl, UI = ECHO.UI;
      WM.layers = WM.layers || Object.fromEntries(LAYERS.map(([k]) => [k, true])); if (WM.layers.gates == null) WM.layers.gates = true;
      if (ECHO.Tutorial) ECHO.Tutorial.flag('map');
      const round = !!world.globe;
      WM.tab = WM.tab || 'near';
      const chip = ([k, l]) => `<button class="chip ${WM.layers[k] ? 'on' : ''}" data-layer="${k}"><i style="background:${LAYER_COL[k] || '#9fe8ff'}"></i>${l}</button>`;
      const body = UI.openPanel(round ? `Navigation · ${world.name}` : `Map of ${world.name}`, `<div class="wmap holo${WM.sideHidden ? ' noside' : ''}"><div class="wmap-main"><canvas id="worldmap"></canvas><div id="map-tip" class="hidden"></div>
          <div class="wmap-search"><span class="ic">⌕</span><input id="map-find" type="text" placeholder="Search places…" autocomplete="off" spellcheck="false"><kbd>/</kbd><div id="map-found"></div></div>
          <div class="wmap-ctl">
            <button data-z="1" title="Zoom in  (E or +)">＋</button><button data-z="-1" title="Zoom out  (Q or −)">－</button><i></i>
            <button data-me="1" title="Find me  (Space)">◎<span>Me</span></button>
            <button data-goal="1" title="Your destination  (G)">⚑<span>Goal</span></button>
            <button data-fit="1" title="The whole world  (H)">◍<span>World</span></button>
            ${round ? `<button data-globe="1" title="Globe or flat chart  (T)">◐<span>${WM.mode === 'chart' ? 'Globe' : 'Chart'}</span></button>` : ''}<i></i>
            <button data-help="1" title="Controls  (?)">?</button>
          </div>
          <button class="wmap-fold" data-fold="1" title="Hide or show the side panel">${WM.sideHidden ? '⟨' : '⟩'}</button>
          <div class="wmap-help hidden"><h5>Controls</h5>
            <div><kbd>Drag</kbd><span>turn the world (let go mid-drag and it spins on)</span></div>
            <div><kbd>Scroll</kbd><kbd>E</kbd><kbd>Q</kbd><span>come closer · go higher (or drag the altitude ruler on the right)</span></div>
            <div><kbd>W A S D</kbd><kbd>Arrows</kbd><span>turn the world</span></div>
            <div><kbd>Click</kbd><span>a place: its details, and Guide me there</span></div>
            <div><kbd>Double-click</kbd><span>fly in to it</span></div>
            <div><kbd>Right-click</kbd><span>set a waypoint there and be guided to it</span></div>
            <div><kbd>Space</kbd><span>find yourself</span><kbd>G</kbd><span>your destination</span><kbd>H</kbd><span>the whole world</span></div>
            <div><kbd>/</kbd><span>search</span>${round ? '<kbd>T</kbd><span>globe or flat chart</span>' : ''}<kbd>M</kbd><span>close</span></div>
            <button data-help="1">Got it</button></div>
          <div class="wmap-hint"><b>Drag</b> turn · <b>Scroll</b> zoom · <b>Double-click</b> fly in · <b>Right-click</b> waypoint · <b>Space</b> me · <b>G</b> goal · <b>?</b> help</div></div>
        <div class="wmap-side">
          <div id="map-dest"></div>
          <div id="map-sel"></div>
          <div class="wmap-sec"><span>Layers</span><button class="link ${WM.revealed(pl) ? 'on' : ''}" data-reveal="1" title="Show the whole world, or only the land you have walked">${WM.revealed(pl) ? '◉ Whole world shown' : '○ Only land you have walked'}</button></div>
          <div class="wmap-layers">${LAYERS.map(chip).join('')}</div>
          <div class="wmap-tabs"><button data-tab="near">Nearby</button><button data-tab="dun">Dungeons</button><button data-tab="key">Key</button></div>
          <div id="map-list"></div>
        </div></div>`, 'map');
      const c = body.querySelector('#worldmap'), main = body.querySelector('.wmap-main'), wrap = body.querySelector('.wmap');
      // a round world opens on the globe (◐ switches to the flat chart and back)
      WM.mode = round ? (WM.mode || 'globe') : 'chart';
      if (round) WM.globeInit(main, c);
      const fit = () => { c.width = main.clientWidth; c.height = main.clientHeight; if (WM.G && round) WM.globeSize(c); };
      fit();
      WM.globeShow(main);
      const zFit = Math.min(c.width / world.W, c.height / world.H);
      WM.view = WM.view && WM.view.world === world.id ? WM.view : { world: world.id, cx: pl.x, cy: pl.y, z: Math.max(zFit, 3) };
      WM.view.cx = pl.x; WM.view.cy = pl.y;
      WM.view.min = zFit * 0.9; WM.view.max = 14;
      WM.fogC = WM.fog(world, pl);
      if (round) {
        WM.globeTex(game);
        if (!WM.G.opened) { WM.G.opened = true; WM.G.dist = 3.2; }
        // coming in: from a little higher and further round, down onto where you are
        const to = WM.G.dist; WM.globeFocus(pl.x, pl.y, to + 1.4, true); WM.G.yaw -= 0.5;
        WM.globeFocus(pl.x, pl.y, to, false, 1000);
      }
      WM._bootT = performance.now();
      WM.regions = WM.regionCentres(world, pl);
      WM.feats = WM.features(game);
      WM.sel = null; WM.hover = null;
      const V = WM.view;
      UI.mapView = { toScreen: (x, y) => WM.toScreen(c, x, y), view: V };
      const globe = () => WM.isGlobe(world);
      const ptr = ev => { const r = c.getBoundingClientRect(); return { mx: ev.clientX - r.left, my: ev.clientY - r.top }; };
      const poke = () => { if (WM.G) WM.G.lastInput = performance.now(); WM.drawSoon(game, c); };
      // ---- zoom
      const zoomAt = (f, mx, my) => {
        if (globe()) {
          // in toward the ground (by height above it, so the last of the way is as smooth as the first),
          // keeping the place under the pointer under it
          const G = WM.G, before = mx != null ? WM.gWorld(c, mx, my) : { x: -1 };
          G.dist = 1 + U.clamp((G.dist - 1) * f, G.min - 1, G.max - 1); G.anim = null;
          if (before.x >= 0) { WM.globeStep(); const after = WM.gWorld(c, mx, my); if (after.x >= 0) { G.yaw += (Globe().dx(world, after.x, before.x)) / world.W * Math.PI * 2 * -1; G.pitch = U.clamp(G.pitch - (Globe().lat(world, after.y) - Globe().lat(world, before.y)), -1.45, 1.45); } }
          return poke();
        }
        const cx = mx != null ? mx : c.width / 2, cy = my != null ? my : c.height / 2, before = WM.toWorld(c, cx, cy);
        V.z = U.clamp(V.z / f, V.min, V.max);
        const after = WM.toWorld(c, cx, cy);
        V.cx += before.x - after.x; V.cy += before.y - after.y;
        poke();
      };
      c.addEventListener('wheel', ev => { ev.preventDefault(); const { mx, my } = ptr(ev); zoomAt(ev.deltaY < 0 ? 0.84 : 1.19, mx, my); }, { passive: false });
      // ---- turning: drag (it spins on when you let go mid-drag), the altitude ruler, the keys
      let drag = null;
      c.addEventListener('mousedown', ev => {
        if (ev.button !== 0) return;
        const { mx, my } = ptr(ev), Rr = WM._ruler;
        if (globe() && Rr && mx > Rr.x - 14 && mx < Rr.x + 14 && my > Rr.y0 - 8 && my < Rr.y1 + 8) { drag = { ruler: true }; WM.rulerSet(c, my); poke(); return; }
        drag = { x: ev.clientX, y: ev.clientY, cx: V.cx, cy: V.cy, moved: false, yaw: WM.G && WM.G.yaw, pitch: WM.G && WM.G.pitch, trail: [] };
        if (WM.G) { WM.G.anim = null; WM.G.spinV = null; }
      });
      const move = ev => {
        const { mx, my } = ptr(ev);
        if (drag && drag.ruler) { WM.rulerSet(c, my); poke(); return; }
        if (drag) {
          const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
          if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
          drag.trail.push({ t: performance.now(), x: ev.clientX, y: ev.clientY }); if (drag.trail.length > 8) drag.trail.shift();
          if (drag.moved && globe()) {
            const G = WM.G, k = 0.0042 * (G.dist - 1) * 0.95;
            G.yaw = drag.yaw + dx * k; G.pitch = U.clamp(drag.pitch + dy * k, -1.45, 1.45);
            c.style.cursor = 'grabbing'; return poke();
          }
          if (drag.moved) { V.cx = drag.cx - dx / V.z; V.cy = drag.cy - dy / V.z; c.style.cursor = 'grabbing'; return poke(); }
        }
        const f = WM.hit(c, mx, my);
        if (globe()) {
          // the reading under the pointer: where on the globe, and what land
          const p = WM.gWorld(c, mx, my), was = WM._hoverLL;
          WM._hoverLL = p.x < 0 ? null : { ll: ECHO.Globe.fmtLatLon(world, p.x, p.y), land: ECHO.Globe.made(world, p.x, p.y) ? U.cap(((ECHO.World.regionAt(world, p.x, p.y) || {}).name) || '') : 'Uncharted', x: p.x, y: p.y };
          if (WM._hoverLL !== was && f === WM.hover) WM.drawSoon(game, c);
        }
        if (f !== WM.hover) { WM.hover = f; WM.drawSoon(game, c); }
        WM.tip(game, f, mx, my);
        const Rr = WM._ruler;
        c.style.cursor = f ? 'pointer' : globe() && Rr && mx > Rr.x - 14 && mx < Rr.x + 14 && my > Rr.y0 - 8 && my < Rr.y1 + 8 ? 'ns-resize' : 'grab';
      };
      const up = ev => {
        if (!drag) return;
        const was = drag; drag = null; c.style.cursor = 'grab';
        if (was.ruler) return;
        if (was.moved) {
          // let go while still moving: the world spins on, slowing
          if (globe() && was.trail.length > 1) {
            const now = performance.now(), recent = was.trail.filter(p => now - p.t < 90);
            if (recent.length > 1) { const a = recent[0], b = recent[recent.length - 1], dt = Math.max(16, b.t - a.t), G = WM.G, k = 0.0042 * (G.dist - 1) * 0.95; G.spinV = { yaw: (b.x - a.x) / dt * k, pitch: (b.y - a.y) / dt * k }; if (Math.hypot(G.spinV.yaw, G.spinV.pitch) < 0.00012) G.spinV = null; }
          }
          return;
        }
        const { mx, my } = ptr(ev);
        // an arrow at the edge: to where it points
        const E = (WM._edge || []).find(e => Math.hypot(e.x - mx, e.y - my) < 26);
        if (E) { if (E.what === 'goal') WM.goGoal(game, c); else WM.flyTo(game, pl.x, pl.y, globe() ? Math.min(WM.G.dist, 2.0) : null); return; }
        const f = WM.hit(c, mx, my);
        if (f) WM.select(game, f);
        else { const p = WM.toWorld(c, mx, my); if (p.x >= 0 && p.y >= 0 && p.x < world.W && p.y < world.H && (WM.revealed(pl) || game.explored(p.x, p.y))) WM.select(game, { kind: 'mark', x: p.x, y: p.y, name: 'A spot you marked', sub: (ECHO.World.regionAt(world, p.x, p.y) || {}).name || '', color: '#ffe08a' }); else { WM.sel = null; WM.side(game, c); } }
        WM.draw(game, c);
      };
      // double-click: fly in to it
      c.addEventListener('dblclick', ev => {
        const { mx, my } = ptr(ev), f = WM.hit(c, mx, my), p = f || WM.toWorld(c, mx, my);
        if (p.x < 0) return;
        if (f) WM.select(game, f);
        WM.flyTo(game, p.x, p.y, globe() ? Math.max(WM.G.min + 0.04, 1 + (WM.G.dist - 1) * 0.42) : null);
      });
      // right-click: a waypoint, and the way there
      c.addEventListener('contextmenu', ev => {
        ev.preventDefault();
        const { mx, my } = ptr(ev), f = WM.hit(c, mx, my), p = f || WM.toWorld(c, mx, my);
        if (p.x < 0 || p.y < 0 || p.x >= world.W || p.y >= world.H) return;
        if (f && f.isGoal) { WM.guide(game, f, false); return; }     // (right-click it again: gone)
        const m = f || { kind: 'mark', x: p.x, y: p.y, name: 'Your waypoint', sub: (ECHO.World.regionAt(world, p.x, p.y) || {}).name || '', color: '#ffe08a' };
        if (m.kind === 'dungeon-cleared') return;
        WM.select(game, m); WM.guide(game, m, true);
      });
      c.addEventListener('mousemove', ev => { if (!drag) move(ev); });
      c.addEventListener('mouseleave', () => { if (drag) return; WM.hover = null; WM.tip(game, null); WM._hoverLL = null; WM.drawSoon(game, c); });
      const wmove = ev => { if (drag) move(ev); };
      window.addEventListener('mousemove', wmove);
      window.addEventListener('mouseup', up);
      // ---- the keys (while the map is open and you are not typing)
      const held = WM._held = new Set();
      const isOpen = () => UI.panelOpen && UI.panelKind === 'map';
      const kd = ev => {
        if (!isOpen()) return;
        if (ev.target && (ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA')) return;
        const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
        if (['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'q', 'e', '+', '=', '-', '_'].includes(k)) { held.add(k); ev.preventDefault(); return; }
        if (k === ' ' || k === 'c') { ev.preventDefault(); WM.flyTo(game, pl.x, pl.y, globe() ? Math.min(WM.G.dist, 2.0) : null); }
        else if (k === 'g') { ev.preventDefault(); WM.goGoal(game, c); }
        else if (k === 'h') { ev.preventDefault(); body.querySelector('[data-fit]').click(); }
        else if (k === 't' && round) { ev.preventDefault(); body.querySelector('[data-globe]').click(); }
        else if (k === '/' || k === 'f') { ev.preventDefault(); fin.focus(); fin.select(); }
        else if (k === '?') { ev.preventDefault(); help(); }
      };
      const ku = ev => { const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key; held.delete(k); };
      window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
      // ---- every frame while the map is open: keys held, a spin let go, the globe's own slow life
      let last = performance.now(), lastDraw = 0;
      const loop = () => {
        if (!isOpen() || !c.isConnected) { stop(); return; }
        const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
        let moved = false;
        if (held.size) {
          const ax = (held.has('a') || held.has('ArrowLeft') ? 1 : 0) - (held.has('d') || held.has('ArrowRight') ? 1 : 0);
          const ay = (held.has('w') || held.has('ArrowUp') ? 1 : 0) - (held.has('s') || held.has('ArrowDown') ? 1 : 0);
          const az = (held.has('e') || held.has('+') || held.has('=') ? 1 : 0) - (held.has('q') || held.has('-') || held.has('_') ? 1 : 0);
          if (globe()) {
            const G = WM.G, k = 1.5 * (G.dist - 1) * dt;
            if (ax || ay) { G.anim = null; G.spinV = null; G.yaw += ax * k; G.pitch = U.clamp(G.pitch + ay * k, -1.45, 1.45); moved = true; }
            if (az) { G.anim = null; G.dist = 1 + U.clamp((G.dist - 1) * Math.exp(-az * 1.6 * dt), G.min - 1, G.max - 1); moved = true; }
          } else {
            if (ax || ay) { V.cx -= ax * 420 * dt / V.z; V.cy -= ay * 420 * dt / V.z; moved = true; }
            if (az) { V.z = U.clamp(V.z * Math.exp(az * 1.6 * dt), V.min, V.max); moved = true; }
          }
        }
        const G = WM.G;
        if (globe() && G.spinV && !drag) {
          G.yaw += G.spinV.yaw * dt * 1000; G.pitch = U.clamp(G.pitch + G.spinV.pitch * dt * 1000, -1.45, 1.45);
          const f = Math.exp(-dt * 3.2); G.spinV.yaw *= f; G.spinV.pitch *= f;
          if (Math.hypot(G.spinV.yaw, G.spinV.pitch) < 0.00004) G.spinV = null;
          moved = true;
        }
        if (moved && G) G.lastInput = now;
        // the globe lives (its sweep, the pings round you): a frame thirty times a second; the flat chart four
        const every = moved || (G && G.anim) ? 0 : globe() ? 33 : 250;
        if (now - lastDraw >= every) { lastDraw = now; WM.draw(game, c); }
        WM._raf2 = requestAnimationFrame(loop);
      };
      let stopped = false;
      const stop = () => {
        if (stopped) return; stopped = true;
        window.removeEventListener('mouseup', up); window.removeEventListener('mousemove', wmove); window.removeEventListener('resize', rs); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku);
        cancelAnimationFrame(WM._raf2); held.clear(); if (WM.G) WM.G.spinV = null;
      };
      WM.isOpen = isOpen;
      const rs = () => { if (isOpen()) { fit(); WM.draw(game, c); } };
      window.addEventListener('resize', rs);
      cancelAnimationFrame(WM._raf2); WM._raf2 = requestAnimationFrame(loop);
      // ---- the buttons
      body.querySelectorAll('[data-z]').forEach(b => b.addEventListener('click', () => zoomAt(+b.dataset.z > 0 ? 0.7 : 1.4)));
      body.querySelector('[data-me]').addEventListener('click', () => WM.flyTo(game, pl.x, pl.y, globe() ? Math.min(WM.G.dist, 2.0) : null));
      body.querySelector('[data-goal]').addEventListener('click', () => WM.goGoal(game, c));
      body.querySelector('[data-fit]').addEventListener('click', () => { V.cx = world.W / 2; V.cy = world.H / 2; V.z = Math.min(c.width / world.W, c.height / world.H) * 0.98; if (globe()) WM.globeFocus(pl.x, pl.y, 3.6); WM.draw(game, c); });
      const gb = body.querySelector('[data-globe]');
      if (gb) gb.addEventListener('click', () => {
        if (WM.mode === 'globe') { const p = WM.gWorld(c, c.width / 2, c.height / 2); WM.mode = 'chart'; if (p.x >= 0) { V.cx = p.x; V.cy = p.y; } V.z = Math.max(V.z, 2.5); }
        else { WM.mode = 'globe'; WM.globeTex(game); WM.globeFocus(V.cx, V.cy, null, true); }
        gb.querySelector('span').textContent = WM.mode === 'chart' ? 'Globe' : 'Chart';
        WM.globeShow(main); WM.draw(game, c);
      });
      const helpEl = body.querySelector('.wmap-help');
      const help = on => { const show = on != null ? on : helpEl.classList.contains('hidden'); helpEl.classList.toggle('hidden', !show); if (!show) { try { localStorage.setItem('echo.mapHelp', '1'); } catch (e) { /* (only a reminder) */ } } };
      body.querySelectorAll('[data-help]').forEach(b => b.addEventListener('click', () => help()));
      let seenHelp = false; try { seenHelp = !!localStorage.getItem('echo.mapHelp'); } catch (e) { seenHelp = true; }
      if (!seenHelp) help(true);
      body.querySelector('[data-fold]').addEventListener('click', ev => { WM.sideHidden = !WM.sideHidden; wrap.classList.toggle('noside', WM.sideHidden); ev.currentTarget.textContent = WM.sideHidden ? '⟨' : '⟩'; requestAnimationFrame(() => { fit(); WM.draw(game, c); }); });
      body.querySelector('[data-reveal]').addEventListener('click', ev => {
        pl.mapReveal = !WM.revealed(pl);
        ev.currentTarget.classList.toggle('on', WM.revealed(pl)); ev.currentTarget.textContent = WM.revealed(pl) ? '◉ Whole world shown' : '○ Only land you have walked';
        WM.regions = WM.regionCentres(world, pl); WM.feats = WM.features(game); WM._mf = null;
        if (world.globe && WM.G) { WM.fogC = WM.fog(world, pl); WM.globeTex(game); }
        WM.side(game, c); WM.draw(game, c);
      });
      body.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { WM.tab = b.dataset.tab; WM.side(game, c); }));
      // ---- find a place by name (Enter: the first)
      const fin = body.querySelector('#map-find'), found = body.querySelector('#map-found');
      const places = () => WM.feats.concat(WM.regions.map(r => ({ layer: 'regions', kind: 'region', x: r.x, y: r.y, name: U.cap(r.name), color: '#efe3c8', sub: 'A region' })));
      let hits = [];
      const go = f => { fin.blur(); found.innerHTML = ''; fin.value = f.name; if (f.kind !== 'region') WM.select(game, f); WM.flyTo(game, f.x, f.y, globe() ? Math.min(WM.G.dist, 1.6) : Math.max(V.z, 5)); };
      fin.addEventListener('keydown', ev => {
        ev.stopPropagation();
        if (ev.key === 'Enter' && hits.length) go(hits[0]);
        if (ev.key === 'Escape') { fin.value = ''; found.innerHTML = ''; fin.blur(); ev.preventDefault(); }
      });
      fin.addEventListener('input', () => {
        const q = fin.value.trim().toLowerCase();
        if (q.length < 2) { found.innerHTML = ''; hits = []; return; }
        const dd = f => WM.dist(game, f).d;
        hits = places().filter(f => f.name.toLowerCase().includes(q)).sort((a, b) => a.name.toLowerCase().indexOf(q) - b.name.toLowerCase().indexOf(q) || dd(a) - dd(b)).slice(0, 8);
        found.innerHTML = hits.length ? hits.map((f, i) => { const D = WM.dist(game, f); return `<div class="dl" data-hit="${i}"><span class="dot" style="background:${f.color}"></span><span class="nm">${esc(f.name)}</span><span class="dd">${D.d < 3 ? 'here' : D.d + ' lg ' + DIR_S[D.dir]}</span></div>`; }).join('') : '<div class="none">Nothing by that name.</div>';
        found.querySelectorAll('[data-hit]').forEach(el => el.addEventListener('mousedown', ev => { ev.preventDefault(); go(hits[+el.dataset.hit]); }));
      });
      body.querySelectorAll('[data-layer]').forEach(b => b.addEventListener('click', () => { WM.layers[b.dataset.layer] = !WM.layers[b.dataset.layer]; b.classList.toggle('on', WM.layers[b.dataset.layer]); WM.side(game, c); WM.draw(game, c); }));
      WM.side(game, c);
      WM.draw(game, c);
    },
    // fly the view to (x, y): over the globe in an arc (up, across, down), or across the chart
    flyTo(game, x, y, dist) {
      const c = document.getElementById('worldmap'), world = game.world;
      if (WM.isGlobe(world)) WM.globeFocus(x, y, dist, false);
      else { WM.view.cx = x; WM.view.cy = y; if (dist) WM.view.z = U.clamp(dist, WM.view.min, WM.view.max); }
      if (c) WM.draw(game, c);
    },
    // to where you are headed (or, with nowhere chosen, say so)
    goGoal(game, c) {
      const goal = ECHO.Purpose && ECHO.Purpose.current(game);
      if (!goal || !goal.where || goal.where.x == null) { ECHO.UI.toast('Nowhere chosen yet. Click a place and Guide me there — or right-click anywhere for a waypoint.', 'info', 4); return; }
      WM.flyTo(game, goal.where.x, goal.where.y, WM.isGlobe(game.world) ? Math.min(WM.G.dist, 1.9) : Math.max(WM.view.z, 4));
      void c;
    },
    // follow the line at the top of the screen to f (or stop)
    guide(game, f, on) {
      const pl = game.pl, id = f.isGoal ? pl.tracked : WM.trackId(f);
      pl.tracked = on ? id : 'off';      // (off: nothing marked at all, not your road's next step instead)
      ECHO.Purpose._html = null; ECHO.Purpose.t = 0; if (ECHO.Nav) ECHO.Nav.route = null;
      ECHO.Purpose.goal = ECHO.Purpose.current(game);
      if (on) ECHO.UI.toast(`Waypoint set: ${f.name}. The arrow at the edge of the screen and the minimap point the way.`, 'info', 3);
      else ECHO.UI.toast(`${f.isGoal || f.kind === 'mark' ? 'Waypoint removed' : 'No longer guiding you to ' + f.name}. Nothing is marked now.`, 'info', 3);
      if (!on && WM.sel && (WM.sel.isGoal || WM.sel === f)) WM.sel = f.isGoal ? null : WM.sel;
      const c = document.getElementById('worldmap'); WM.side(game, c); if (c) WM.draw(game, c);
    },
    // the altitude ruler: where on it is how high
    rulerSet(c, my) {
      const R = WM._ruler, G = WM.G; if (!R || !G) return;
      const t = U.clamp((R.y1 - my) / (R.y1 - R.y0), 0, 1), lo = Math.log(G.min - 1), hi = Math.log(G.max - 1);
      G.anim = null; G.spinV = null; G.dist = 1 + Math.exp(lo + (hi - lo) * t);
    },
    toScreen(c, x, y) { if (WM.isGlobe()) return WM.gScreen(c, x, y); const V = WM.view; return { x: (x - V.cx) * V.z + c.width / 2, y: (y - V.cy) * V.z + c.height / 2 }; },
    toWorld(c, sx, sy) { if (WM.isGlobe()) return WM.gWorld(c, sx, sy); const V = WM.view; return { x: (sx - c.width / 2) / V.z + V.cx, y: (sy - c.height / 2) / V.z + V.cy }; },
    visible() { const g = WM.goalFeat(); return WM.feats.filter(f => WM.layers[f.layer]).concat(g ? [g] : []); },
    // where you are headed, as a place on the map (click it to see it, and to take the mark away)
    goalFeat() {
      const game = ECHO.Game, goal = game && ECHO.Purpose && ECHO.Purpose.current(game);
      if (!goal || !goal.where || goal.where.x == null || ECHO.Interior.cur) { WM._gf = null; return null; }
      const w = goal.where, key = `${w.x}|${w.y}|${w.name}`;
      if (!WM._gf || WM._gf.key !== key) WM._gf = { key, isGoal: true, layer: 'goal', kind: 'flag', pri: 9, x: w.x, y: w.y, name: w.name || 'Your destination', sub: goal.kind === 'track' ? 'Where you are headed' : 'Your road\'s next step', color: '#ffcf6a' };
      return WM._gf;
    },
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
      el.style.setProperty('--c', f.color);
      el.innerHTML = `<div class="k">${esc(KIND_NAME[f.kind] || 'Place')}</div><b>${esc(f.name)}</b>${f.sub ? `<div>${esc(f.sub)}</div>` : ''}${f.diff ? `<div style="color:${f.color}">${esc(f.diff)}</div>` : ''}<div class="m">${D.d < 3 ? 'You are here' : `${D.d} leagues ${D.dir}`}${game.world.globe ? ' · ' + ECHO.Globe.fmtLatLon(game.world, f.x, f.y) : ''}</div><div class="h">Click · details  ·  Double-click · fly in  ·  Right-click · guide me</div>`;
      el.classList.remove('hidden');
      el.style.left = Math.min(mx + 16, el.parentElement.clientWidth - 240) + 'px'; el.style.top = Math.max(4, my - 10) + 'px';
    },
    trackId(f) {
      if (f.kind && f.kind.startsWith('dungeon')) return 'site:' + f.ref.id;
      return `mark:${f.x.toFixed(1)}:${f.y.toFixed(1)}:${f.name}`;
    },
    select(game, f) { WM.sel = f; WM.side(game, document.getElementById('worldmap')); },
    // The side panel: the selected place, then what is near (or the dungeons you know, or the key).
    side(game, c) {
      const pl = game.pl, world = game.world;
      const sel = document.getElementById('map-sel'), list = document.getElementById('map-list');
      if (!sel || !list) return;
      const f = WM.sel, round = !!world.globe;
      if (f) {
        const D = WM.dist(game, f), id = WM.trackId(f), on = f.isGoal || pl.tracked === id || (pl.tracked && f.kind === 'mark' && pl.tracked.startsWith('mark:') && pl.tracked.endsWith(':' + f.name) && Math.abs(parseFloat(pl.tracked.split(':')[1]) - f.x) < 0.2);
        sel.innerHTML = `<div class="card${on ? ' on' : ''}" style="--c:${f.color}"><div class="kind">${esc(KIND_NAME[f.kind] || f.layer || 'Place')}</div><h4>${esc(f.name)}</h4>${f.sub ? `<div class="sub">${esc(f.sub)}</div>` : ''}${f.diff ? `<div class="diff" style="color:${f.color}">${esc(f.diff)}</div>` : ''}${f.life && ECHO.DungeonLife ? ECHO.DungeonLife.card(world, f.life) : ''}
          <div class="read"><span><b>${D.d < 3 ? '—' : D.d}</b>${D.d < 3 ? 'you are here' : 'leagues ' + D.dir}</span>${round ? `<span><b>${esc(ECHO.Globe.fmtLatLon(world, f.x, f.y))}</b>position</span>` : ''}</div>
          <div class="row">${f.kind === 'dungeon-cleared' ? '' : `<button class="go${on ? ' on' : ''}" data-track="1">${on ? (f.isGoal || f.kind === 'mark' ? '✕ Remove waypoint' : '■ Stop guiding') : '➤ Guide me there'}</button>`}<button data-fly="1" title="Fly the view there (double-click does too)">◎ Fly to</button><button data-unsel="1" title="Close">✕</button></div></div>`;
        const b = sel.querySelector('[data-track]');
        if (b) b.addEventListener('click', () => WM.guide(game, f, !on));
        sel.querySelector('[data-fly]').addEventListener('click', () => WM.flyTo(game, f.x, f.y, WM.isGlobe(world) ? Math.min(WM.G.dist, 1.6) : Math.max(WM.view.z, 5)));
        sel.querySelector('[data-unsel]').addEventListener('click', () => { WM.sel = null; WM.side(game, c); if (c) WM.draw(game, c); });
      } else sel.innerHTML = `<div class="card idle"><div class="kind">Navigation</div><p>Click a place for its details, then <b>Guide me there</b> — the arrow at the edge of the screen and the minimap point the way. Or <b>right-click</b> anywhere for a waypoint (right-click it again to take it away).</p></div>`;
      // where you are headed, always in sight here, with a way to clear it
      const dest = document.getElementById('map-dest');
      if (dest) {
        const gf = WM.goalFeat();
        if (gf) {
          const D = WM.dist(game, gf);
          dest.innerHTML = `<div class="dest"><div class="l1"><span class="k">Headed to</span><span class="dd">${D.d < 3 ? 'here' : `${D.d} LG ${DIR_S[D.dir]}`}</span></div><div class="l2"><span class="nm"><i>◆</i>${esc(gf.name)}</span><button data-dfly="1" title="Fly the view there">◎</button><button data-dclear="1" title="Clear it: nothing marked">✕ Clear</button></div></div>`;
          dest.querySelector('[data-dfly]').addEventListener('click', () => { WM.select(game, gf); WM.flyTo(game, gf.x, gf.y, WM.isGlobe(world) ? Math.min(WM.G.dist, 1.6) : Math.max(WM.view.z, 5)); });
          dest.querySelector('[data-dclear]').addEventListener('click', () => WM.guide(game, gf, false));
        } else dest.innerHTML = `<div class="dest none"><div class="l1"><span class="k">Headed to</span></div><div class="l2"><span class="nm dim">Nothing marked — right-click the map for a waypoint</span></div></div>`;
      }
      document.querySelectorAll('.wmap-tabs [data-tab]').forEach(t => t.classList.toggle('on', t.dataset.tab === (WM.tab || 'near')));
      const rowOf = (x, i, extra) => { const D = WM.dist(game, x); return `<div class="dl ${WM.sel === x ? 'on' : ''}" data-goto="${i}"><span class="dot" style="background:${x.color}"></span><span class="nm">${esc(x.name)}</span>${extra || ''}<span class="dd">${D.d < 3 ? 'here' : `${D.d}<i>${DIR_S[D.dir]}</i>`}</span></div>`; };
      const wire = arr => list.querySelectorAll('[data-goto]').forEach(el => el.addEventListener('click', () => { const x = arr[+el.dataset.goto]; WM.select(game, x); WM.flyTo(game, x.x, x.y, WM.isGlobe(world) ? Math.min(WM.G.dist, 1.6) : Math.max(WM.view.z, 5)); }));
      const tab = WM.tab || 'near';
      if (tab === 'key') { list.innerHTML = '<div id="map-key"></div>'; WM.key(list); return; }
      if (tab === 'dun') {
        const ds = WM.feats.filter(x => x.layer === 'dungeons').sort((a, b) => WM.dist(game, a).d - WM.dist(game, b).d);
        const total = ECHO.Explore.sites(world).filter(s => s.cat === 'delve').length;
        list.innerHTML = ds.length ? ds.map((x, i) => rowOf(x, i, `<span class="st">${x.kind === 'dungeon-cleared' ? '✓' : x.stars}</span>`)).join('') + `<div class="none">${total - ds.length} more lie uncharted.</div>`
          : '<div class="none">None yet. Explore — hilltop lookouts show you what lies around them.</div>';
        return wire(ds);
      }
      // what is near: the places shown on the map, nearest first
      const near = WM.visible().filter(x => x.layer !== 'regions').map(x => ({ x, d: WM.dist(game, x).d })).sort((a, b) => a.d - b.d).slice(0, 40).map(o => o.x);
      list.innerHTML = near.length ? near.map((x, i) => rowOf(x, i)).join('') : '<div class="none">Nothing known nearby yet — or every layer is off.</div>';
      wire(near);
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
        case 'fallen': { g.strokeStyle = 'rgba(20,14,8,0.9)'; g.lineWidth = 4; g.beginPath(); g.moveTo(-6, -6); g.lineTo(6, 6); g.moveTo(6, -6); g.lineTo(-6, 6); g.stroke(); g.strokeStyle = col; g.lineWidth = 2; g.stroke(); break; }   // (crossed blades)
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
        WM.globeStep();
        // the sharper painting is worked out only once the view is still (turning and zooming stay smooth)
        if (performance.now() - (G.lastInput || 0) > 180) WM.globeDetail(game, c);
        else if (!G._settle) G._settle = setTimeout(() => { G._settle = null; const cc = document.getElementById('worldmap'); if (cc) WM.drawSoon(game, cc); }, 200);
        WM.globeFxStep(G);
        G.r.render(G.sc, G.cam);
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
        for (const r of WM.regions) { const p = WM.toScreen(c, r.x, r.y); if (r.land && r.land.roster) (WM._later = WM._later || []).push({ text: r.land.short, x: p.x, y: p.y + Math.round(U.clamp(V.z * 3.4, 11, 19)) * 0.95, font: `600 ${Math.round(U.clamp(V.z * 2.6, 9, 14))}px Inter, system-ui, sans-serif`, fill: r.land.col, stroke: 'rgba(20,14,8,0.7)', pri: 0 }); (WM._later = WM._later || []).push({ text: U.cap(r.name).toUpperCase().split('').join(String.fromCharCode(8202)), x: p.x, y: p.y, font, fill: 'rgba(58,42,24,0.66)', stroke: 'rgba(236,226,196,0.5)', pri: 0 }); }
      }
      // the way there: the planned route, or a straight line if there is none yet
      const goal = ECHO.Purpose && ECHO.Purpose.current(game);
      if (globe) { if (goal && goal.where && goal.where.x != null) WM.gRoute(game, c, g, goal, now); }
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
        if (f.isGoal) continue;
        const hi = f === WM.hover || f === WM.sel;
        const pulse = (f.ref && sug && f.ref === sug) || (pl.tracked === 'site:' + (f.ref && f.ref.id));
        WM.icon(g, f.kind, p.x, p.y, f.color, k * (hi ? 1.25 : 1), pulse ? now : 0);
        rects.push({ x: p.x - 9 * k, y: p.y - 9 * k, w: 18 * k, h: 18 * k });
      }
      // what the pointer is over, and what is chosen: rings of light round them
      for (const { f, p } of pos) {
        if (f === WM.hover && f !== WM.sel) { g.strokeStyle = HOLO + '0.85)'; g.lineWidth = 1.5; g.shadowColor = HOLO + '0.9)'; g.shadowBlur = 8; g.beginPath(); g.arc(p.x, p.y, 15 * k, 0, Math.PI * 2); g.stroke(); g.shadowBlur = 0; }
        if (f === WM.sel) {
          g.strokeStyle = HOLO + '0.95)'; g.lineWidth = 2; g.shadowColor = HOLO + '0.9)'; g.shadowBlur = 10;
          for (let i = 0; i < 4; i++) { const a = now * 1.4 + i * Math.PI / 2; g.beginPath(); g.arc(p.x, p.y, 19 * k, a, a + 0.9); g.stroke(); }
          g.shadowBlur = 0; g.globalAlpha = 0.5 + 0.5 * Math.sin(now * 5); g.beginPath(); g.arc(p.x, p.y, 24 * k + (now * 18) % 10, 0, Math.PI * 2); g.lineWidth = 1; g.stroke(); g.globalAlpha = 1;
        }
      }
      // labels: dungeons and towns first
      const lblOrder = pos.slice().sort((a, b) => (b.f === WM.sel || b.f === WM.hover) - (a.f === WM.sel || a.f === WM.hover) || b.f.pri - a.f.pri);
      for (const { f, p } of lblOrder) {
        if (f.isGoal) continue;
        const hi = f === WM.hover || f === WM.sel;
        const show = hi || f.layer === 'towns' || (f.layer === 'dungeons' && f.kind !== 'dungeon-unknown' && V.z >= (WM.revealed(pl) ? 4.5 : 2.2)) || (V.z >= 5 && f.pri >= 5) || V.z >= 8;
        if (!show) continue;
        const size = Math.round(U.clamp(9 + V.z * 0.9, 11, 16) * (f.kind === 'capital' ? 1.12 : 1));
        g.font = `${f.layer === 'towns' ? 700 : 600} ${size}px Inter, system-ui, sans-serif`;
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
      WM._edge = [];
      if (goal && goal.where && goal.where.x != null) WM.gGoal(game, c, g, goal, now);
      WM.gMe(game, c, g, now);
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
      g.fillStyle = '#efe3c8'; g.fillRect(16, c.height - 16, px, 3); g.font = '600 11px Inter, system-ui, sans-serif'; g.textAlign = 'left'; g.fillText(`${lg} leagues`, 22 + px, c.height - 15);
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
          fragmentShader: 'varying vec3 vN; void main(){ float k = pow(max(0.0, 0.7 - dot(vN, vec3(0.0, 0.0, 1.0))), 3.0); gl_FragColor = vec4(0.3, 0.78, 1.0, 1.0) * k * 1.7; }' }));
        sc.add(halo);
        // and the stars past it
        const N = 2200, sp = new Float32Array(N * 3);
        for (let i = 0; i < N; i++) { const a = Math.random() * Math.PI * 2, z = Math.random() * 2 - 1, rr = Math.sqrt(1 - z * z), d = 90 + Math.random() * 60; sp[i * 3] = Math.cos(a) * rr * d; sp[i * 3 + 1] = z * d; sp[i * 3 + 2] = Math.sin(a) * rr * d; }
        const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
        sc.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: '#d8e0ff', size: 0.35, sizeAttenuation: true, transparent: true, opacity: 0.8 })));
        G = WM.G = { r, sc, cam, tilt, spin, ball, mat, sun, yaw: 0, pitch: 0, dist: 3.9, min: 1.09, max: 7, ray: new THREE.Raycaster(), anim: null };
        try { WM.globeFx(G, wd); } catch (err) { console.error('ECHO: map light', err); }
      }
      G.r.domElement.className = 'wmap-globe';
      main.insertBefore(G.r.domElement, c);
      return G;
    },
    // The console's light on the globe: lines of latitude and longitude every fifteen degrees
    // (the equator and the prime meridian brighter), a bright rim, a slow sweep round it, and
    // two rings in orbit with their satellites — faded as you come down toward the ground.
    globeFx(G, world) {
      const R = 1.0016, pts = [], strong = [];
      const P = (lat, lon) => { const c = Math.cos(lat), ph = lon; return [-Math.cos(ph) * c * R, Math.sin(lat) * R, Math.sin(ph) * c * R]; };
      const d2r = Math.PI / 180;
      for (let la = -75; la <= 75; la += 15) { const out = la === 0 ? strong : pts; for (let i = 0; i < 144; i++) out.push(...P(la * d2r, i / 144 * Math.PI * 2), ...P(la * d2r, (i + 1) / 144 * Math.PI * 2)); }
      for (let lo = 0; lo < 360; lo += 15) { const out = lo === 0 ? strong : pts; for (let j = 0; j < 72; j++) out.push(...P((-87 + j * 174 / 72) * d2r, lo * d2r), ...P((-87 + (j + 1) * 174 / 72) * d2r, lo * d2r)); }
      const mk = (arr, op) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#5ff2ff', transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending })); };
      G.grid = mk(pts, 0.16); G.gridS = mk(strong, 0.42); G.spin.add(G.grid); G.spin.add(G.gridS);
      // the rim: a thin bright edge where the ball turns away from you
      G.rim = new THREE.Mesh(new THREE.SphereGeometry(1.003, 96, 48), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uK: { value: 1 } },
        vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'uniform float uK; varying vec3 vN; varying vec3 vV; void main(){ float f = 1.0 - max(0.0, dot(vN, vV)); gl_FragColor = vec4(0.37, 0.95, 1.0, 1.0) * pow(f, 4.0) * 0.9 * uK; }' }));
      G.sc.add(G.rim);
      // the sweep: a line of light going round the world, a fading trail behind it
      G.sweep = new THREE.Mesh(new THREE.SphereGeometry(1.004, 96, 48), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uT: { value: 0 }, uK: { value: 1 } },
        vertexShader: 'varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'uniform float uT; uniform float uK; varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ float a = atan(vP.z, vP.x); float d = mod(uT - a + 6.2831853, 6.2831853); float line = smoothstep(0.035, 0.0, min(d, 6.2831853 - d)); float trail = d < 3.14159 ? exp(-d * 2.2) * 0.22 : 0.0; float face = 0.35 + 0.65 * pow(1.0 - max(0.0, dot(vN, vV)), 1.5); gl_FragColor = vec4(0.37, 0.95, 1.0, 1.0) * (line * 0.55 + trail) * face * uK; }' }));
      G.tilt.add(G.sweep);
      // rings in orbit, and what goes round on them
      G.orbits = new THREE.Group();
      G.sats = [];
      for (const [r, rx, rz, n, sp] of [[1.42, 1.18, 0.32, 3, 0.11], [1.68, 1.42, -0.5, 2, -0.07]]) {
        const o = new THREE.Group(); o.rotation.set(rx, 0, rz);
        const pts2 = []; for (let i = 0; i <= 256; i++) { const a = i / 256 * Math.PI * 2; pts2.push(Math.cos(a) * r, 0, Math.sin(a) * r); }
        const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts2, 3));
        o.add(new THREE.Line(lg, new THREE.LineDashedMaterial({ color: '#5ff2ff', transparent: true, opacity: 0.32, dashSize: 0.04, gapSize: 0.03, depthWrite: false })));
        o.children[0].computeLineDistances();
        for (let i = 0; i < n; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshBasicMaterial({ color: i ? '#bff8ff' : '#ffcf6a' })); s.userData = { r, a: i / n * Math.PI * 2, sp }; o.add(s); G.sats.push(s); }
        G.orbits.add(o);
      }
      G.sc.add(G.orbits);
      void world;
    },
    // the light's life, every drawing: the sweep goes round, the satellites along their rings,
    // and all of it fades as you come down to the ground (where it would be in the way)
    globeFxStep(G) {
      if (!G.grid) return;
      const t = performance.now() / 1000, far = U.clamp((G.dist - 1.25) / 1.1, 0, 1), mid = U.clamp((G.dist - 1.08) / 0.5, 0, 1);
      G.grid.material.opacity = 0.05 + 0.13 * mid; G.gridS.material.opacity = 0.14 + 0.3 * mid;
      G.rim.material.uniforms.uK.value = 0.35 + 0.65 * mid;
      G.sweep.material.uniforms.uT.value = (t * 0.45) % (Math.PI * 2) - Math.PI; G.sweep.material.uniforms.uK.value = far; G.sweep.visible = far > 0.01;
      G.orbits.visible = far > 0.02;
      for (const o of G.orbits.children) { const ln = o.children[0]; ln.material.opacity = 0.3 * far; }
      for (const s of G.sats) { const u = s.userData, a = u.a + t * u.sp * 6; s.position.set(Math.cos(a) * u.r, 0, Math.sin(a) * u.r); s.material.transparent = true; s.material.opacity = far; }
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
      // (the lines of latitude and longitude are drawn in light over the globe: see globeFx)
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
        const S = ppt < 1.1 ? 0 : ppt < 2.2 ? 2 : 4;            // (closer than four pixels a tile, the card's tiles are simply drawn larger, crisp)
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
          // (not while you are turning or zooming: then wait, and go on after)
          if (performance.now() - (G.lastInput || 0) < 180) { G.segRun = setTimeout(work, 120); return; }
          const t0 = performance.now();
          while (G.segQ.length && performance.now() - t0 < 24) { const job = G.segQ.shift(); try { WM.globeSeg(game, job); } catch (err) { console.error('ECHO: map detail', err); G.segQ = []; } }
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
      const tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding;
      if (S >= 4) tex.magFilter = THREE.NearestFilter;      // (seen close, each painted pixel stays sharp) tex.anisotropy = G.r.capabilities.getMaxAnisotropy ? G.r.capabilities.getMaxAnisotropy() : 1;
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
    globeFocus(x, y, dist, now, dur) {
      const G = WM.G, world = ECHO.Game.world;
      const yaw = Math.PI / 2 - x / world.W * Math.PI * 2, pitch = U.clamp(ECHO.Globe.lat(world, y), -1.45, 1.45);
      let dy = ((yaw - G.yaw) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
      const to = { yaw: G.yaw + dy, pitch, dist: dist != null ? U.clamp(dist, G.min, G.max) : G.dist };
      if (now) { G.yaw = to.yaw; G.pitch = to.pitch; G.dist = to.dist; G.anim = null; return; }
      G.spinV = null;
      // a long way round: up, across and down again, as a flight would go
      const ang = Math.hypot(dy * Math.cos((pitch + G.pitch) / 2), pitch - G.pitch), arc = ang > 0.25 ? Math.min(1.6, ang * 0.55) * Math.max(0.4, Math.min(G.dist, to.dist) - 0.6) : 0;
      G.anim = { from: { yaw: G.yaw, pitch: G.pitch, dist: G.dist }, to, arc, t0: performance.now(), dur: dur || U.clamp(600 + ang * 380, 600, 1500) };
      const step = () => { if (!G.anim) return; const c = document.getElementById('worldmap'); if (c && ECHO.Game) WM.draw(ECHO.Game, c); if (G.anim) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    },
    globeStep() {
      const G = WM.G;
      if (G.anim) {
        const a = G.anim, t = U.clamp((performance.now() - a.t0) / a.dur, 0, 1), e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        G.yaw = a.from.yaw + (a.to.yaw - a.from.yaw) * e; G.pitch = a.from.pitch + (a.to.pitch - a.from.pitch) * e; G.dist = a.from.dist + (a.to.dist - a.from.dist) * e + (a.arc || 0) * Math.sin(Math.PI * e);
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
      (G.invSpin = G.invSpin || new THREE.Matrix4()).copy(G.spin.matrixWorld).invert();
      // the sun stands over the place where it is noon (by the hour where you are), north of the middle in summer
      const game = ECHO.Game, world = game && game.world;
      if (world && world.globe && game.pl) {
        const hr = world.minute / 60, si = ECHO.TIME.dateOf(world.day).seasonIdx;
        const sx = game.pl.x - (hr - 12) / 24 * world.W, lat = [0, 23, 0, -23][si] || 0;
        const d = WM.gPoint(world, ((sx % world.W) + world.W) % world.W, world.H / 2 - lat / 180 * world.H).transformDirection(G.spin.matrixWorld);
        G.sun.position.copy(d.multiplyScalar(10));
      }
    },
    gScreen(c, x, y) { return WM.gScreenV(c, WM.gPoint(ECHO.Game.world, x, y)); },
    // a point of the ball (unturned) on the screen, or hidden behind it
    gScreenV(c, v) {
      const G = WM.G, p = (G._sv = G._sv || new THREE.Vector3()).copy(v).applyMatrix4(G.spin.matrixWorld);
      const facing = p.z * G.dist - 1;                                   // (seen only from the near side of the ball)
      if (facing < 0.05 * (G.dist - 1)) return { x: -9999, y: -9999, hidden: true };
      const q = p.project(G.cam);
      return { x: (q.x + 1) / 2 * c.width, y: (1 - q.y) / 2 * c.height };
    },
    // the place in the world under a point of the screen: the ray meets the ball (worked out,
    // not searched for among its triangles), turned back into the ball's own latitude and longitude
    gWorld(c, sx, sy) {
      const G = WM.G, world = ECHO.Game.world;
      G.ray.setFromCamera(G._v2 = (G._v2 || new THREE.Vector2()).set(sx / c.width * 2 - 1, -(sy / c.height * 2 - 1)), G.cam);
      const o = G.ray.ray.origin, d = G.ray.ray.direction, b = o.dot(d), disc = b * b - (o.lengthSq() - 1);
      if (disc < 0) return { x: -1, y: -1 };
      const t = -b - Math.sqrt(disc);
      if (t < 0) return { x: -1, y: -1 };
      const p = (G._v3 = G._v3 || new THREE.Vector3()).copy(o).addScaledVector(d, t).applyMatrix4(G.invSpin || G.spin.matrixWorld.clone().invert());
      const th = Math.acos(U.clamp(p.y, -1, 1)), ph = Math.atan2(p.z, -p.x);
      const x = ((ph / (Math.PI * 2)) % 1 + 1) % 1 * world.W;
      return { x: U.clamp(x, 0, world.W - 0.01), y: U.clamp(ECHO.Globe.rowOf(world, Math.PI / 2 - th), 0, world.H - 0.01) };
    },
    // one drawing a frame, however many things ask for it
    drawSoon(game, c) {
      if (WM._raf) return;
      WM._raf = requestAnimationFrame(() => { WM._raf = 0; WM.draw(game, c); });
    },
    // ---- on the map, over the land
    // The way there: along the planned route, or (with none, or from the sky) the short way over
    // the ball, a great circle; a glow under a bright line whose dashes run toward the goal.
    gRoute(game, c, g, goal, now) {
      const world = game.world, pl = game.pl, R = ECHO.Nav && ECHO.Nav.route, globe = WM.isGlobe(world);
      let scr = [];
      if (R && R.ok && !R.air && R.pts && R.pts.length > 1) scr = [{ x: pl.x, y: pl.y }].concat(R.pts.slice(R.i + 1)).map(q => WM.toScreen(c, q.x, q.y));
      else if (globe) {
        const a = WM.gPoint(world, pl.x, pl.y), b = WM.gPoint(world, goal.where.x, goal.where.y), om = Math.acos(U.clamp(a.dot(b), -1, 1)), n = Math.max(2, Math.ceil(om * 90)), so = Math.sin(om) || 1;
        for (let i = 0; i <= n; i++) { const t = i / n, ka = Math.sin((1 - t) * om) / so, kb = Math.sin(t * om) / so; scr.push(WM.gScreenV(c, (WM._rv = WM._rv || new THREE.Vector3()).set(a.x * ka + b.x * kb, a.y * ka + b.y * kb, a.z * ka + b.z * kb))); }
      } else return;
      const path = () => { g.beginPath(); let on = false; for (const p of scr) { if (p.hidden) { on = false; continue; } if (!on) { g.moveTo(p.x, p.y); on = true; } else g.lineTo(p.x, p.y); } };
      g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
      path(); g.strokeStyle = HOLO + '0.16)'; g.lineWidth = 9; g.stroke();
      path(); g.strokeStyle = HOLO + '0.95)'; g.lineWidth = 2.2; g.setLineDash([10, 7]); g.lineDashOffset = -now * 28; g.shadowColor = HOLO + '0.9)'; g.shadowBlur = 6; g.stroke();
      g.restore();
    },
    // where you are headed: a beacon of light over it, and (off the screen, or round the far side
    // of the world) an arrow at the edge pointing the way to it
    gGoal(game, c, g, goal, now) {
      const world = game.world, b = WM.toScreen(c, goal.where.x, goal.where.y), D = WM.dist(game, { x: goal.where.x, y: goal.where.y });
      const w = c.width, h = c.height, inView = !b.hidden && b.x > 20 && b.y > 20 && b.x < w - 20 && b.y < h - 20;
      if (inView) {
        const top = b.y - 46, gr = g.createLinearGradient(0, b.y, 0, top);
        gr.addColorStop(0, AMBER + '0.95)'); gr.addColorStop(1, AMBER + '0)');
        g.strokeStyle = gr; g.lineWidth = 3; g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(b.x, top); g.stroke();
        const ph = (now * 0.9) % 1; g.strokeStyle = AMBER + (0.8 * (1 - ph)).toFixed(3) + ')'; g.lineWidth = 1.5; g.beginPath(); g.ellipse(b.x, b.y, 6 + ph * 22, (6 + ph * 22) * 0.45, 0, 0, Math.PI * 2); g.stroke();
        g.save(); g.translate(b.x, b.y - 26); g.rotate(Math.PI / 4); g.fillStyle = AMBER + '1)'; g.shadowColor = AMBER + '0.9)'; g.shadowBlur = 10; g.fillRect(-5, -5, 10, 10); g.restore();
        g.font = '600 11px ui-monospace, Consolas, monospace'; g.textAlign = 'center'; g.fillStyle = AMBER + '1)'; g.strokeStyle = 'rgba(4,10,18,0.9)'; g.lineWidth = 3;
        const t = (goal.where.name || 'Goal') + (D.d >= 3 ? `  ${D.d} LG` : '');
        g.strokeText(t.toUpperCase(), b.x, top - 9); g.fillText(t.toUpperCase(), b.x, top - 9);
        return;
      }
      WM.edgeArrow(c, g, goal.where.x, goal.where.y, AMBER, `GOAL ${D.d} LG`, 'goal');
      void world;
    },
    // an arrow at the edge of the view toward a place that is not in it
    edgeArrow(c, g, x, y, col, label, what) {
      const w = c.width, h = c.height, cx = w / 2, cy = h / 2;
      let a;
      if (WM.isGlobe()) {
        const G = WM.G, p = WM.gPoint(ECHO.Game.world, x, y).applyMatrix4(G.spin.matrixWorld), q = p.clone().project(G.cam);
        a = Math.atan2(-q.y * h, q.x * w);
        if (Math.hypot(q.x, q.y) < 0.02) a = Math.atan2(-p.y, p.x);   // (straight behind the world: the way it leans)
      } else { const s = WM.toScreen(c, x, y); a = Math.atan2(s.y - cy, s.x - cx); }
      const rx = w / 2 - 70, ry = h / 2 - 64;
      // (two arrows the same way: the second steps along the edge)
      for (let k = 0; k < 4 && (WM._edge || []).some(e => Math.hypot(e.x - (cx + Math.cos(a) * rx), e.y - (cy + Math.sin(a) * ry)) < 46); k++) a += 0.16;
      const ex = cx + Math.cos(a) * rx, ey = cy + Math.sin(a) * ry;
      g.save(); g.translate(ex, ey); g.rotate(a);
      g.fillStyle = col + '0.95)'; g.shadowColor = col + '0.9)'; g.shadowBlur = 10;
      g.beginPath(); g.moveTo(14, 0); g.lineTo(-6, 9); g.lineTo(-2, 0); g.lineTo(-6, -9); g.closePath(); g.fill();
      g.restore();
      g.font = '600 10px ui-monospace, Consolas, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const lx = ex - Math.cos(a) * 26, ly = ey - Math.sin(a) * 18;
      g.lineWidth = 3; g.strokeStyle = 'rgba(4,10,18,0.9)'; g.strokeText(label, lx, ly); g.fillStyle = col + '1)'; g.fillText(label, lx, ly);
      (WM._edge = WM._edge || []).push({ x: ex, y: ey, what });
    },
    // you: pings going out round you, the way you face as a cone of light, and your arrow
    gMe(game, c, g, now) {
      const pl = game.pl, pe = game.pe, me = WM.toScreen(c, pl.x, pl.y), w = c.width, h = c.height;
      const inView = !me.hidden && me.x > 10 && me.y > 10 && me.x < w - 10 && me.y < h - 10;
      if (!inView) { WM.edgeArrow(c, g, pl.x, pl.y, HOLO, 'YOU', 'me'); return; }
      const dir = ECHO.Interior.cur ? 0 : (pe && pe.dir) || 0, ah = WM.toScreen(c, pl.x + Math.cos(dir) * 4, pl.y + Math.sin(dir) * 4);
      const a = ah.hidden ? dir : Math.atan2(ah.y - me.y, ah.x - me.x);
      for (let i = 0; i < 2; i++) { const ph = (now * 0.7 + i * 0.5) % 1; g.strokeStyle = HOLO + (0.7 * (1 - ph)).toFixed(3) + ')'; g.lineWidth = 1.5; g.beginPath(); g.arc(me.x, me.y, 8 + ph * 34, 0, Math.PI * 2); g.stroke(); }
      const cone = g.createRadialGradient(me.x, me.y, 4, me.x, me.y, 46);
      cone.addColorStop(0, HOLO + '0.42)'); cone.addColorStop(1, HOLO + '0)');
      g.fillStyle = cone; g.beginPath(); g.moveTo(me.x, me.y); g.arc(me.x, me.y, 46, a - 0.45, a + 0.45); g.closePath(); g.fill();
      g.shadowColor = HOLO + '1)'; g.shadowBlur = 12;
      WM.icon(g, 'player', me.x, me.y, '#fff', 1.15, a);
      g.shadowBlur = 0;
    },
    // ---- the console round the globe: corner marks, the middle's reticle, a compass that turns
    // with the world, the altitude ruler (drag it), a scale, and what lies under the pointer
    globeFrame(game, c, g) {
      const world = game.world, G = WM.G, w = c.width, h = c.height, now = performance.now() / 1000;
      g.save(); g.textBaseline = 'middle';
      const mono = (px, wt) => `${wt || 500} ${px}px ui-monospace, "Cascadia Mono", Consolas, "Courier New", monospace`;
      // corners
      g.strokeStyle = HOLO + '0.55)'; g.lineWidth = 2;
      for (const [x, y, sx, sy] of [[10, 10, 1, 1], [w - 10, 10, -1, 1], [10, h - 10, 1, -1], [w - 10, h - 10, -1, -1]]) { g.beginPath(); g.moveTo(x, y + sy * 26); g.lineTo(x, y); g.lineTo(x + sx * 26, y); g.stroke(); }
      // the reticle in the middle
      const cx = w / 2, cy = h / 2;
      g.strokeStyle = HOLO + '0.32)'; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, 15, 0, Math.PI * 2); g.stroke();
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; g.beginPath(); g.moveTo(cx + Math.cos(a) * 20, cy + Math.sin(a) * 20); g.lineTo(cx + Math.cos(a) * 28, cy + Math.sin(a) * 28); g.stroke(); }
      g.fillStyle = HOLO + '0.6)'; g.fillRect(cx - 1, cy - 1, 2, 2);
      // the compass: north as the world is turned
      const p0 = WM.gWorld(c, cx, cy);
      let aN = -Math.PI / 2;
      if (p0.x >= 0) { const q0 = WM.gScreen(c, p0.x, p0.y), q = WM.gScreen(c, p0.x, Math.max(0.01, p0.y - 8)); if (!q.hidden && !q0.hidden && Math.hypot(q.x - q0.x, q.y - q0.y) > 0.5) aN = Math.atan2(q.y - q0.y, q.x - q0.x); }
      const kx = w - 54, ky = 54, kr = 30;
      g.fillStyle = 'rgba(4,12,22,0.72)'; g.beginPath(); g.arc(kx, ky, kr + 6, 0, Math.PI * 2); g.fill();
      g.strokeStyle = HOLO + '0.6)'; g.lineWidth = 1.2; g.beginPath(); g.arc(kx, ky, kr, 0, Math.PI * 2); g.stroke();
      g.save(); g.translate(kx, ky); g.rotate(aN + Math.PI / 2);
      for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, r0 = i % 6 ? kr - 4 : kr - 8; g.strokeStyle = HOLO + (i % 6 ? '0.35)' : '0.8)'); g.beginPath(); g.moveTo(Math.sin(a) * r0, -Math.cos(a) * r0); g.lineTo(Math.sin(a) * kr, -Math.cos(a) * kr); g.stroke(); }
      g.fillStyle = AMBER + '1)'; g.beginPath(); g.moveTo(0, -kr + 9); g.lineTo(5, 0); g.lineTo(-5, 0); g.closePath(); g.fill();
      g.fillStyle = HOLO + '0.5)'; g.beginPath(); g.moveTo(0, kr - 9); g.lineTo(5, 0); g.lineTo(-5, 0); g.closePath(); g.fill();
      g.font = mono(10, 700); g.textAlign = 'center'; g.fillStyle = AMBER + '1)'; g.fillText('N', 0, -kr - 9 + 18 - 18);
      g.restore();
      // what lies under the pointer (or in the middle of the view)
      const Hv = WM._hoverLL, at = Hv || (p0.x >= 0 ? { ll: ECHO.Globe.fmtLatLon(world, p0.x, p0.y), land: ECHO.Globe.made(world, p0.x, p0.y) ? U.cap(((ECHO.World.regionAt(world, p0.x, p0.y) || {}).name) || '') : 'Uncharted' } : null);
      const Gd = world.globe, made = Gd ? Gd.made.reduce((a, b) => a + b, 0) : 0, tot = Gd ? Gd.made.length : 1;
      g.textAlign = 'center';
      const l1 = world.name.toUpperCase().split('').join(String.fromCharCode(8202)), l2 = `${Math.max(1, Math.round(made / tot * 100))}% CHARTED${at ? `   ◇ ${at.ll}${at.land ? '  ·  ' + at.land.toUpperCase() : ''}` : ''}`;
      g.font = mono(11); const bw = Math.max(180, g.measureText(l2).width + 34), bx = Math.max(Math.min(cx - bw / 2, w - 150 - bw), Math.min(380, cx - bw / 2));
      g.fillStyle = 'rgba(4,12,22,0.78)'; g.strokeStyle = HOLO + '0.3)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(bx + 10, 8); g.lineTo(bx + bw - 10, 8); g.lineTo(bx + bw, 18); g.lineTo(bx + bw, 40); g.lineTo(bx + bw - 10, 50); g.lineTo(bx + 10, 50); g.lineTo(bx, 40); g.lineTo(bx, 18); g.closePath(); g.fill(); g.stroke();
      const tx = bx + bw / 2;
      g.font = mono(13, 700); g.fillStyle = '#d8fbff'; g.shadowColor = HOLO + '0.8)'; g.shadowBlur = 8; g.fillText(l1, tx, 21); g.shadowBlur = 0;
      g.font = mono(11); g.fillStyle = Hv ? HOLO + '1)' : HOLO + '0.75)'; g.fillText(l2, tx, 38);
      // the altitude ruler: drag it to come down or go up
      const rx = w - 30, y0 = 132, y1 = Math.max(y0 + 80, h - 92);
      WM._ruler = { x: rx, y0, y1 };
      const lo = Math.log(G.min - 1), hi = Math.log(G.max - 1), t = U.clamp((Math.log(Math.max(1e-4, G.dist - 1)) - lo) / (hi - lo), 0, 1), my = y1 - (y1 - y0) * t;
      g.strokeStyle = HOLO + '0.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(rx, y0); g.lineTo(rx, y1); g.stroke();
      for (let i = 0; i <= 20; i++) { const yy = y0 + (y1 - y0) * i / 20; g.beginPath(); g.moveTo(rx - (i % 5 ? 3 : 7), yy); g.lineTo(rx + (i % 5 ? 3 : 7), yy); g.stroke(); }
      g.fillStyle = HOLO + '0.25)'; g.fillRect(rx - 2, my, 4, y1 - my);
      g.fillStyle = '#d8fbff'; g.shadowColor = HOLO + '1)'; g.shadowBlur = 8; g.beginPath(); g.moveTo(rx - 9, my); g.lineTo(rx - 18, my - 6); g.lineTo(rx - 18, my + 6); g.closePath(); g.fill(); g.shadowBlur = 0;
      const alt = Math.round((G.dist - 1) * world.W / (Math.PI * 2));
      g.font = mono(10, 600); g.textAlign = 'right'; g.fillStyle = HOLO + '0.9)';
      g.fillText('ALT', rx - 22, my - 8); g.fillText(`${alt.toLocaleString()} LG`, rx - 22, my + 6);
      g.textAlign = 'center'; g.fillStyle = HOLO + '0.55)'; g.fillText('ORBIT', rx, y0 - 14); g.fillText('GROUND', rx, y1 + 14);
      // the scale: a round number of leagues across
      const V = WM.view, nice = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000];
      let lg = nice[0]; for (const n of nice) { lg = n; if (n * V.z > 70) break; }
      const px = Math.min(220, lg * V.z), sx = 22, sy = h - 34;
      g.strokeStyle = HOLO + '0.85)'; g.lineWidth = 2; g.beginPath(); g.moveTo(sx, sy - 5); g.lineTo(sx, sy); g.lineTo(sx + px, sy); g.lineTo(sx + px, sy - 5); g.stroke();
      g.font = mono(11, 600); g.textAlign = 'left'; g.fillStyle = HOLO + '0.95)'; g.fillText(`${lg} LEAGUE${lg > 1 ? 'S' : ''}`, sx, sy - 14);
      if (ECHO.Updates && ECHO.Updates.build) { g.font = mono(10); g.textAlign = 'right'; g.fillStyle = HOLO + '0.4)'; g.fillText('ECHO ' + ECHO.Updates.build, w - 18, h - 18); }
      // coming in: a line of light passes down the view
      const bt = (performance.now() - (WM._bootT || 0)) / 900;
      if (bt < 1) {
        const yy = bt * h, gr = g.createLinearGradient(0, yy - 60, 0, yy);
        gr.addColorStop(0, HOLO + '0)'); gr.addColorStop(1, HOLO + (0.35 * (1 - bt)).toFixed(3) + ')');
        g.fillStyle = gr; g.fillRect(0, yy - 60, w, 60); g.fillStyle = HOLO + (0.9 * (1 - bt)).toFixed(3) + ')'; g.fillRect(0, yy, w, 1.5);
      }
      g.restore();
      void now;
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
    // the scope's frame below ground: dark glass, a light edge, a faint grid, a label
    miniFrame(g, c, label) {
      const W = c.width, H = c.height, r = Math.min(W, H) * 0.06;
      g.clearRect(0, 0, W, H);
      g.save();
      g.beginPath(); if (g.roundRect) g.roundRect(4, 4, W - 8, H - 8, r); else g.rect(4, 4, W - 8, H - 8);
      g.fillStyle = 'rgba(2,10,18,0.86)'; g.fill();
      g.clip();
      g.strokeStyle = 'rgba(95,242,255,0.06)'; g.lineWidth = 1;
      const step = Math.max(10, Math.round(W / 14));
      for (let x = 4; x < W; x += step) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, H); g.stroke(); }
      for (let y = 4; y < H; y += step) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); g.stroke(); }
      g.restore();
      g.beginPath(); if (g.roundRect) g.roundRect(4.5, 4.5, W - 9, H - 9, r); else g.rect(4.5, 4.5, W - 9, H - 9);
      g.strokeStyle = 'rgba(95,242,255,0.45)'; g.lineWidth = 1.2; g.stroke();
      g.strokeStyle = 'rgba(95,242,255,0.95)'; g.lineWidth = 2;
      const k = Math.min(W, H) * 0.12;
      g.beginPath(); g.moveTo(4, 4 + k); g.lineTo(4, 4 + r * 0.6); g.quadraticCurveTo(4, 4, 4 + r * 0.6, 4); g.lineTo(4 + k, 4); g.stroke();
      g.beginPath(); g.moveTo(W - 4, H - 4 - k); g.lineTo(W - 4, H - 4 - r * 0.6); g.quadraticCurveTo(W - 4, H - 4, W - 4 - r * 0.6, H - 4); g.lineTo(W - 4 - k, H - 4); g.stroke();
      if (label) { g.font = `700 ${Math.round(H * 0.045)}px Rajdhani, Inter, sans-serif`; g.fillStyle = 'rgba(95,242,255,0.85)'; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(label.split('').join(String.fromCharCode(8202)), 12, 11); }
    },
    miniDungeon(game, c) {
      const L = ECHO.Interior.cur, g = c.getContext('2d'), B = ECHO.Interior.BASE, pe = game.pe;
      const s = Math.min((c.width - 20) / L.W, (c.height - 30) / L.H), ox = (c.width - L.W * s) / 2, oy = (c.height - L.H * s) / 2 + 5;
      WM.miniFrame(g, c, L.depth != null ? `FLOOR ${(L.depth || 0) + 1}${L.floors ? ' / ' + L.floors : ''}` : 'BELOW');
      for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) {
        if (L.rock[y * L.W + x] || !L.seen[y * L.W + x]) continue;
        const lord = L.lordRoom && x >= L.lordRoom.x0 && x < L.lordRoom.x1 && y >= L.lordRoom.y0 && y < L.lordRoom.y1;
        g.fillStyle = lord ? 'rgba(255,95,109,0.55)' : 'rgba(95,242,255,0.34)'; g.fillRect(ox + x * s, oy + y * s, Math.ceil(s), Math.ceil(s));
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
      const s = Math.min((c.width - 20) / L.W, (c.height - 30) / L.H), ox = (c.width - L.W * s) / 2, oy = (c.height - L.H * s) / 2 + 5;
      WM.miniFrame(g, c, 'BEYOND THE GATE');
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
      if (!c) return;
      if (!c._wired) {
        // scroll on it to range in or out; click it for the full map
        c._wired = true;
        c.addEventListener('wheel', ev => { ev.preventDefault(); WM.miniZ = U.clamp((WM.miniZ || 2) * (ev.deltaY < 0 ? 1.2 : 1 / 1.2), 0.7, 6); WM.mini(ECHO.Game, c); }, { passive: false });
        c.addEventListener('click', () => { if (ECHO.UI && !ECHO.UI.paused()) ECHO.UI.openMap(); });
      }
      const inside = ECHO.Interior.cur;
      if (inside && (inside.type === 'gate' || inside.carved)) {
        // below ground and through the gates: the old flat sketch, on the scope's own canvas
        const dpr = 1; if (c.width !== 212 * dpr || c.height !== 240 * dpr) { c.width = 212 * dpr; c.height = 240 * dpr; }
        const g = c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height);
        return inside.type === 'gate' ? WM.miniGate(game, c) : WM.miniDungeon(game, c);
      }
      // the view turned about (over a pole): the scope turns with it
      return WM.miniOut(game, c, game.pl && game.pl.viewTurn && !inside ? Math.PI : 0);
    },
    // The nav-scope: a round radar of the land about you, north up (or turned with the view),
    // its bezel marked in degrees; the way ahead in light, where you are headed as a diamond (on
    // the rim, with its distance, when it lies beyond), what hunts you as blips, a sweep going
    // round; under it, your heading and where on the world you stand.
    miniOut(game, c, rot) {
      const world = game.world, pl = game.pl, dpr = Math.min(2, window.devicePixelRatio || 1);
      const CW = 212, CH = 240;
      if (c.width !== Math.round(CW * dpr) || c.height !== Math.round(CH * dpr)) { c.width = Math.round(CW * dpr); c.height = Math.round(CH * dpr); }
      const g = c.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, CW, CH);
      const pe = ECHO.Interior.cur ? { x: pl.x, y: pl.y, dir: game.pe ? game.pe.dir : 0 } : game.pe;
      const now = performance.now() / 1000, cx = CW / 2, cy = 104, RO = 100, R = 87, scale = WM.miniZ || 2;
      const R3 = ECHO.Renderer3D, im = world.globe && !ECHO.Interior.cur && R3 && R3._imF ? R3.img : null;
      // a place → the scope (about you, before the turn): its copy nearest you, as it is drawn
      const P = (x, y) => { const I = im ? im(x, y) : { x, y }; return { x: (I.x - pe.x) * scale, y: (I.y - pe.y) * scale }; };
      const inR = (p, m) => p.x * p.x + p.y * p.y < (R - (m || 0)) ** 2;
      // ---- the land, in the round
      g.save();
      g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip();
      g.fillStyle = '#04101c'; g.fillRect(cx - R, cy - R, R * 2, R * 2);
      g.translate(cx, cy); if (rot) g.rotate(rot);
      const vw = R * 2 / scale, sx = pe.x - vw / 2, sy = pe.y - vw / 2;
      const bs = WM.base(world), S = WM.baseScale || 1;
      g.imageSmoothingEnabled = scale < 3;
      for (const k of world.globe ? [0, world.W, -world.W] : [0]) g.drawImage(bs, (sx + k) * S, sy * S, vw * S, vw * S, -R, -R, R * 2, R * 2);   // (round the world: the other side, past the edge)
      // past a pole: the far side of the world, turned about (as the land itself is drawn)
      if (world.globe && (sy < 0 || sy + vw > world.H)) {
        const north = sy < 0, Tm = ECHO.Globe ? ECHO.Globe.poleT(world, north, pe.x) : 2 * pe.x + world.W / 2, T = pe.x + ((((Tm - pe.x) % world.W) + world.W) % world.W), Zc = north ? 0 : 2 * world.H;
        g.save();
        g.beginPath();
        if (north) g.rect(-R, -R, R * 2, (0 - pe.y) * scale + R); else g.rect(-R, (world.H - pe.y) * scale, R * 2, R * 2);
        g.clip();
        g.transform(-scale / S, 0, 0, -scale / S, (T - pe.x) * scale, (Zc - pe.y) * scale);
        const u0 = T - (sx + vw), v0 = north ? 0 : Zc - (sy + vw);
        for (const k of [0, world.W, -world.W, 2 * world.W]) g.drawImage(bs, (u0 - k) * S, v0 * S, vw * S, vw * S, (u0 - k) * S + k * S, v0 * S, vw * S, vw * S);
        g.restore();
      }
      // the unwalked, dark
      const cw = Math.ceil(world.W / 4), chH = Math.ceil(world.H / 4);
      if (!WM.revealed(pl)) {
        g.fillStyle = 'rgba(3,10,18,0.86)';
        for (let y = Math.floor(sy / 4); y <= Math.ceil((sy + vw) / 4); y++) for (let x = Math.floor(sx / 4); x <= Math.ceil((sx + vw) / 4); x++) {
          // (round the world, and past a pole: the cell of the world that is drawn there)
          let X = x, Y = y;
          if (world.globe && (Y < 0 || Y >= chH) && ECHO.Globe) { const north = Y < 0, T = ECHO.Globe.poleT(world, north, pe.x), wx = T - (x * 4 + 2), wy = north ? -(y * 4 + 2) : 2 * world.H - (y * 4 + 2); X = Math.floor(wx / 4); Y = Math.floor(wy / 4); }
          if (world.globe) X = ((X % cw) + cw) % cw;
          if (X < 0 || Y < 0 || X >= cw || Y >= chH || !pl.explored[Y * cw + X]) g.fillRect((x * 4 - pe.x) * scale, (y * 4 - pe.y) * scale, 4 * scale + 0.6, 4 * scale + 0.6);
        }
      }
      // the console's light over it: a cool wash, a grid that moves with the land, faint scan lines
      g.fillStyle = 'rgba(4,22,40,0.32)'; g.fillRect(-R, -R, R * 2, R * 2);
      const step = 10 * scale, gx = -(((pe.x % 10) + 10) % 10) * scale, gy = -(((pe.y % 10) + 10) % 10) * scale;
      g.strokeStyle = HOLO + '0.10)'; g.lineWidth = 1; g.beginPath();
      for (let x = gx - Math.ceil(R / step) * step; x <= R; x += step) { g.moveTo(x, -R); g.lineTo(x, R); }
      for (let y = gy - Math.ceil(R / step) * step; y <= R; y += step) { g.moveTo(-R, y); g.lineTo(R, y); }
      g.stroke();
      // ---- what is about you
      if (!WM._mf || game.time - WM._mfT > 1 || game.time < WM._mfT) { WM._mf = WM.features(game, { x0: pe.x - 120, x1: pe.x + 120, y0: pe.y - 120, y1: pe.y + 120 }); WM._mfT = game.time; }
      for (const f of WM._mf) {
        if (f.layer !== 'towns' && f.layer !== 'dungeons' && f.layer !== 'danger' && f.layer !== 'gates' && f.layer !== 'wonders') continue;
        const p = P(f.x, f.y); if (!inR(p, 4)) continue;
        g.save(); g.translate(p.x, p.y); if (rot) g.rotate(-rot);
        g.shadowColor = f.color; g.shadowBlur = 6;
        WM.icon(g, f.kind, 0, 0, f.color, f.layer === 'dungeons' ? 0.55 : 0.5, 0);
        g.restore();
      }
      // the way ahead, in light
      const goal = ECHO.Purpose && ECHO.Purpose.goal;
      if (ECHO.Nav && !ECHO.Interior.cur) {
        const Rt = ECHO.Nav.route;
        if (Rt && Rt.ok && Rt.pts && Rt.pts.length > 1) {
          const pts = [{ x: pe.x, y: pe.y }].concat(Rt.pts.slice(Rt.i + 1, Rt.i + 140)).map(q => P(q.x, q.y));
          g.lineCap = 'round'; g.lineJoin = 'round';
          const line = () => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); };
          line(); g.strokeStyle = HOLO + '0.18)'; g.lineWidth = 6; g.stroke();
          line(); g.strokeStyle = HOLO + '0.95)'; g.lineWidth = 1.8; g.setLineDash([5, 4]); g.lineDashOffset = -now * 16; g.shadowColor = HOLO + '1)'; g.shadowBlur = 6; g.stroke(); g.setLineDash([]); g.shadowBlur = 0;
        }
      }
      // what hunts you: red blips
      if (ECHO.Lore) for (const e of ECHO.Lore.tracked(game)) {
        const p = P(e.x, e.y); if (!inR(p, 3)) continue;
        const big = e.titan || e.type === 'boss';
        g.fillStyle = big ? '#ff4a2a' : '#ff5a4a'; g.shadowColor = '#ff3a2a'; g.shadowBlur = 8; g.beginPath(); g.arc(p.x, p.y, big ? 3.6 : 2.2, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0;
        const ph = (now * 1.3 + (e.id || 0) * 0.17) % 1; g.strokeStyle = `rgba(255,80,60,${(0.7 * (1 - ph)).toFixed(3)})`; g.lineWidth = 1; g.beginPath(); g.arc(p.x, p.y, 3 + ph * 7, 0, Math.PI * 2); g.stroke();
      }
      // where you are headed
      let goalOut = null;
      if (goal && goal.where && goal.where.x != null && !goal.where.vague) {
        const p = P(goal.where.x, goal.where.y);
        if (inR(p, 8)) {
          const ph = (now * 0.9) % 1;
          g.strokeStyle = AMBER + (0.85 * (1 - ph)).toFixed(3) + ')'; g.lineWidth = 1.2; g.beginPath(); g.arc(p.x, p.y, 4 + ph * 10, 0, Math.PI * 2); g.stroke();
          g.save(); g.translate(p.x, p.y); g.rotate(Math.PI / 4); g.fillStyle = AMBER + '1)'; g.shadowColor = AMBER + '1)'; g.shadowBlur = 10; g.fillRect(-3.5, -3.5, 7, 7); g.restore();
        } else goalOut = Math.atan2(p.y, p.x);
      } else if (goal && goal.where && goal.where.x != null) {
        const p = P(goal.where.x, goal.where.y);
        if (inR(p, 0)) { g.setLineDash([3, 3]); g.strokeStyle = AMBER + '0.7)'; g.lineWidth = 1.2; g.beginPath(); g.arc(p.x, p.y, Math.max(8, 10 * scale), 0, Math.PI * 2); g.stroke(); g.setLineDash([]); }
        else goalOut = Math.atan2(p.y, p.x);
      }
      g.restore();
      // ---- the sweep, going round (on the screen, not the land)
      g.save(); g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip();
      const sa = (now * 1.1) % (Math.PI * 2);
      if (g.createConicGradient) {
        const cg = g.createConicGradient(sa - 1.2, cx, cy);
        cg.addColorStop(0, HOLO + '0)'); cg.addColorStop(1.2 / (Math.PI * 2), HOLO + '0.16)'); cg.addColorStop(1.2 / (Math.PI * 2) + 0.001, HOLO + '0)'); cg.addColorStop(1, HOLO + '0)');
        g.fillStyle = cg; g.fillRect(cx - R, cy - R, R * 2, R * 2);
      }
      g.strokeStyle = HOLO + '0.45)'; g.lineWidth = 1; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(sa) * R, cy + Math.sin(sa) * R); g.stroke();
      // range rings, and how far the inner one is
      g.strokeStyle = HOLO + '0.22)'; g.setLineDash([2, 3]);
      for (const k of [1 / 3, 2 / 3]) { g.beginPath(); g.arc(cx, cy, R * k, 0, Math.PI * 2); g.stroke(); }
      g.setLineDash([]);
      g.font = '600 8px ui-monospace, Consolas, monospace'; g.fillStyle = HOLO + '0.6)'; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(`${Math.round(R * 2 / 3 / scale)}`, cx + 3, cy - R * 2 / 3 + 6);
      g.restore();
      // ---- you, in the middle: the way you face as a cone of light
      const hd = (game.pl && game.pl.flying && ECHO.Apex && ECHO.Apex.fly ? ECHO.Apex.fly.dir : pe.dir) || 0, ha = hd + (rot || 0);
      const cone = g.createRadialGradient(cx, cy, 2, cx, cy, 34);
      cone.addColorStop(0, HOLO + '0.45)'); cone.addColorStop(1, HOLO + '0)');
      g.fillStyle = cone; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, 34, ha - 0.5, ha + 0.5); g.closePath(); g.fill();
      g.save(); g.translate(cx, cy); g.rotate(ha); g.shadowColor = HOLO + '1)'; g.shadowBlur = 10;
      g.fillStyle = '#e6fdff'; g.beginPath(); g.moveTo(8, 0); g.lineTo(-5, 5.5); g.lineTo(-2.5, 0); g.lineTo(-5, -5.5); g.closePath(); g.fill(); g.restore();
      // ---- the bezel: a ring marked every ten degrees, the four quarters named
      g.save();
      g.lineWidth = RO - R; g.strokeStyle = 'rgba(4,12,22,0.86)'; g.beginPath(); g.arc(cx, cy, (RO + R) / 2, 0, Math.PI * 2); g.stroke();
      g.lineWidth = 1; g.strokeStyle = HOLO + '0.55)'; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = HOLO + '0.3)'; g.beginPath(); g.arc(cx, cy, RO, 0, Math.PI * 2); g.stroke();
      for (let i = 0; i < 36; i++) {
        const a = i / 36 * Math.PI * 2 + (rot || 0) - Math.PI / 2, big = i % 9 === 0, mid = i % 3 === 0;
        g.strokeStyle = big ? HOLO + '0.95)' : mid ? HOLO + '0.6)' : HOLO + '0.3)'; g.lineWidth = big ? 1.6 : 1;
        const r0 = R + 1, r1 = R + (big ? 7 : mid ? 5 : 3);
        g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.stroke();
      }
      g.font = '700 9px ui-monospace, Consolas, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
      ['N', 'E', 'S', 'W'].forEach((t, i) => { const a = i * Math.PI / 2 + (rot || 0) - Math.PI / 2; const x = cx + Math.cos(a) * (RO - 6), y = cy + Math.sin(a) * (RO - 6); g.fillStyle = 'rgba(4,12,22,0.95)'; g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill(); g.fillStyle = t === 'N' ? AMBER + '1)' : HOLO + '0.95)'; g.fillText(t, x, y + 0.5); });
      // where you are headed, beyond the scope: a mark on the rim, and how far
      if (goalOut != null) {
        const a = goalOut + (rot || 0), D = WM.dist(game, { x: goal.where.x, y: goal.where.y }), bx = cx + Math.cos(a) * (R + 5), by = cy + Math.sin(a) * (R + 5);
        g.save(); g.translate(bx, by); g.rotate(a); g.fillStyle = AMBER + '1)'; g.shadowColor = AMBER + '1)'; g.shadowBlur = 10;
        g.beginPath(); g.moveTo(6, 0); g.lineTo(-4, 5); g.lineTo(-1.5, 0); g.lineTo(-4, -5); g.closePath(); g.fill(); g.restore();
        const tx = cx + Math.cos(a) * (R - 15), ty = cy + Math.sin(a) * (R - 12);
        g.font = '700 9px ui-monospace, Consolas, monospace'; g.lineWidth = 3; g.strokeStyle = 'rgba(2,8,14,0.9)'; g.strokeText(`${D.d}`, tx, ty); g.fillStyle = AMBER + '1)'; g.fillText(`${D.d}`, tx, ty);
      }
      g.restore();
      // ---- the readout under the scope: your heading, and where on the world you are
      const brg = ((Math.round((hd * 180 / Math.PI + 90) % 360) + 360) % 360), card = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(brg / 45) % 8];
      const y0 = CH - 30;
      g.fillStyle = 'rgba(4,12,22,0.82)'; g.strokeStyle = HOLO + '0.35)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(14, y0); g.lineTo(CW - 14, y0); g.lineTo(CW - 6, y0 + 8); g.lineTo(CW - 6, y0 + 26); g.lineTo(6, y0 + 26); g.lineTo(6, y0 + 8); g.closePath(); g.fill(); g.stroke();
      g.font = '700 11px ui-monospace, Consolas, monospace'; g.textBaseline = 'middle'; g.textAlign = 'left';
      g.fillStyle = HOLO + '0.6)'; g.fillText('HDG', 13, y0 + 14); g.fillStyle = '#e6fdff'; g.fillText(`${String(brg).padStart(3, '0')}°`, 40, y0 + 14); g.fillStyle = HOLO + '0.85)'; g.fillText(card, 80, y0 + 14);
      g.textAlign = 'right'; g.font = '600 10px ui-monospace, Consolas, monospace'; g.fillStyle = HOLO + '0.9)';
      g.fillText(world.globe && ECHO.Globe && !ECHO.Interior.cur ? ECHO.Globe.fmtLatLon(world, pe.x, pe.y) : `${Math.round(pe.x)}, ${Math.round(pe.y)}`, CW - 12, y0 + 14);
    }
  };
})();
