// Procedural pixel art. Everything is painted with rectangles at 16px/tile so
// the world can show its state: crops thin when vermin eat them, trees turn
// with the seasons, towns modernise with each era, and creatures wear their
// evolution and scars.
(function () {
  const { hash2 } = ECHO;
  const TILE = ECHO.TILE;
  const TS = 16;

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
    else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    return '#' + ((1 << 24) + (Math.round(r) << 16) + (Math.round(g) << 8) + Math.round(b)).toString(16).slice(1);
  }
  function mix(a, b, t) {
    const na = parseInt(a.slice(1), 16), nb = parseInt(b.slice(1), 16);
    const r = ((na >> 16) & 255) * (1 - t) + ((nb >> 16) & 255) * t;
    const g = ((na >> 8) & 255) * (1 - t) + ((nb >> 8) & 255) * t;
    const bl = (na & 255) * (1 - t) + (nb & 255) * t;
    return '#' + ((1 << 24) + (Math.round(r) << 16) + (Math.round(g) << 8) + Math.round(bl)).toString(16).slice(1);
  }

  const SEASON_GRASS = ['#5b8a3c', '#4f8a3a', '#7a8a3a', '#7d8f86'];
  const SEASON_FOREST = ['#3e6430', '#365f2b', '#5a5a2a', '#5f6f6a'];

  const S = ECHO.Sprites = {
    TS, shade, mix,

    // ---------------------------------------------------------------- Tiles
    paintTile(ctx, world, x, y, px, py, season, cropFactor) {
      const t = world.tiles[y * world.W + x];
      const h = (k) => hash2(x * 7 + k, y * 13 + k * 3, world.seed);
      const R = (c, ax, ay, w, hh) => { ctx.fillStyle = c; ctx.fillRect(px + ax, py + ay, w, hh); };
      const specks = (base, n, cols) => { for (let i = 0; i < n; i++) R(cols[i % cols.length], (h(i) * 16) | 0, (h(i + 40) * 16) | 0, 1, 1); };
      const grass = SEASON_GRASS[season];
      switch (t) {
        case TILE.DEEP: R('#1d3a5f', 0, 0, 16, 16); specks('', 3, ['#24466f']); break;
        case TILE.WATER: R('#2e5f8c', 0, 0, 16, 16); specks('', 4, ['#3a6e9c', '#28557e']); break;
        case TILE.SAND: R('#d6c08a', 0, 0, 16, 16); specks('', 8, ['#c8b07a', '#e3cf9c']); break;
        case TILE.GRASS: case TILE.TREE: case TILE.FOREST: {
          const base = t === TILE.GRASS ? grass : SEASON_FOREST[season];
          R(base, 0, 0, 16, 16);
          specks('', 10, [shade(base, -0.12), shade(base, 0.1), shade(base, -0.2)]);
          if (t === TILE.GRASS && h(99) < 0.08) { const fc = season === 3 ? '#f0f4f7' : ['#f2d14b', '#e88bb0', '#f5f5f5', '#9fb7ff'][(h(98) * 4) | 0]; R(fc, ((h(97) * 13) | 0) + 1, ((h(96) * 13) | 0) + 1, 2, 2); }
          if (t === TILE.GRASS && h(95) < 0.25) { const tx = ((h(94) * 12) | 0) + 2, ty = ((h(93) * 12) | 0) + 2; R(shade(base, 0.18), tx, ty, 1, 2); R(shade(base, 0.18), tx + 2, ty + 1, 1, 2); }
          if (t !== TILE.GRASS && h(92) < 0.3) R(season === 2 ? '#a0682a' : shade(base, -0.25), (h(91) * 14) | 0, (h(90) * 14) | 0, 2, 1);
          if (season === 3) specks('', 6, ['#e8eef2', '#dfe7ec']);
          break;
        }
        case TILE.HILL: {
          R('#7b7a55', 0, 0, 16, 16); specks('', 10, ['#6c6b49', '#8b8a63', '#5f5e40']);
          if (h(80) < 0.35) { R('#8e8b80', ((h(81) * 10) | 0) + 2, ((h(82) * 10) | 0) + 3, 4, 3); R('#a6a398', ((h(81) * 10) | 0) + 2, ((h(82) * 10) | 0) + 3, 4, 1); }
          if (season === 3) specks('', 8, ['#e8eef2']);
          break;
        }
        case TILE.ROCK: {
          R('#6b6762', 0, 0, 16, 16);
          specks('', 8, ['#5c5853', '#7a7671', '#4f4c48']);
          const above = y > 0 ? world.tiles[(y - 1) * world.W + x] : TILE.ROCK;
          if (above !== TILE.ROCK) { R('#8c8883', 0, 0, 16, 3); R('#a19d97', 0, 0, 16, 1); }
          const below = y < world.H - 1 ? world.tiles[(y + 1) * world.W + x] : TILE.ROCK;
          if (below !== TILE.ROCK) { R('#46433f', 0, 12, 16, 4); R('#3a3734', 0, 15, 16, 1); }
          if (h(70) < 0.4) R('#4a4743', ((h(71) * 12) | 0) + 2, ((h(72) * 8) | 0) + 3, 1, 4);
          if (season === 3 || y < world.H * 0.25) { if (above !== TILE.ROCK) R('#eef2f4', 0, 0, 16, 2); }
          break;
        }
        case TILE.SNOW: R('#e4eaed', 0, 0, 16, 16); specks('', 6, ['#cfd9df', '#f6f9fa']); break;
        case TILE.SWAMP: {
          R('#41533a', 0, 0, 16, 16); specks('', 8, ['#36472f', '#4f6345']);
          if (h(60) < 0.55) { const w = 5 + ((h(61) * 6) | 0); R('#2a3b36', (h(62) * 8) | 0, ((h(63) * 10) | 0) + 2, w, 3); R('#3a5050', ((h(62) * 8) | 0) + 1, ((h(63) * 10) | 0) + 2, w - 2, 1); }
          if (h(64) < 0.25) { R('#6f8f4a', (h(65) * 14) | 0, (h(66) * 10) | 0, 1, 4); }
          break;
        }
        case TILE.FARM: {
          const soil = season === 3 ? '#6e5c47' : '#6b4d2c';
          R(soil, 0, 0, 16, 16);
          // Crop rows. Vermin damage shows as gaps; harvest turns gold.
          const crop = season === 0 ? '#5d8a3a' : season === 1 ? '#6fa142' : season === 2 ? '#d1a93a' : null;
          for (let cx = 1; cx < 16; cx += 4) {
            R(shade(soil, -0.18), cx + 2, 0, 1, 16);
            if (!crop) continue;
            for (let cy = 0; cy < 16; cy += 2) {
              const alive = hash2(x * 16 + cx, y * 16 + cy, world.seed + 5) < cropFactor + 0.05;
              if (alive) { R(crop, cx, cy, 2, 2); if (season === 2) R('#e8c45a', cx, cy, 1, 1); }
              else if (cropFactor < 0.7) R('#4d3a24', cx, cy + 1, 2, 1);
            }
          }
          if (season === 3) specks('', 6, ['#e8eef2']);
          break;
        }
        case TILE.ROAD: {
          R('#97815d', 0, 0, 16, 16); specks('', 9, ['#87724f', '#a8936d', '#7c6848']);
          const g = (dx, dy) => { const nt = ECHO.World.tile(world, x + dx, y + dy); return nt === TILE.GRASS || nt === TILE.FOREST || nt === TILE.FARM || nt === TILE.TREE; };
          if (g(0, -1)) R(shade(grass, -0.05), 0, 0, 16, 2);
          if (g(0, 1)) R(shade(grass, -0.05), 0, 14, 16, 2);
          if (g(-1, 0)) R(shade(grass, -0.05), 0, 0, 2, 16);
          if (g(1, 0)) R(shade(grass, -0.05), 14, 0, 2, 16);
          break;
        }
        case TILE.BRIDGE: {
          R('#2e5f8c', 0, 0, 16, 16);
          const horiz = ECHO.World.tile(world, x - 1, y) === TILE.BRIDGE || ECHO.World.tile(world, x + 1, y) === TILE.BRIDGE || ECHO.World.tile(world, x - 1, y) === TILE.ROAD || ECHO.World.tile(world, x + 1, y) === TILE.ROAD;
          if (horiz) { R('#8a6a42', 0, 2, 16, 12); for (let i = 0; i < 16; i += 3) R('#6e532f', i, 2, 1, 12); R('#5a4326', 0, 2, 16, 1); R('#5a4326', 0, 13, 16, 1); }
          else { R('#8a6a42', 2, 0, 12, 16); for (let i = 0; i < 16; i += 3) R('#6e532f', 2, i, 12, 1); R('#5a4326', 2, 0, 1, 16); R('#5a4326', 13, 0, 1, 16); }
          break;
        }
        case TILE.PLAZA: {
          R('#8b857a', 0, 0, 16, 16);
          for (let yy = 0; yy < 16; yy += 4) for (let xx = (yy / 4) % 2 ? 2 : 0; xx < 16; xx += 4) { R(h(xx + yy) < 0.5 ? '#958f84' : '#827c71', xx, yy, 3, 3); }
          if (season === 3) specks('', 4, ['#e8eef2']);
          break;
        }
        case TILE.RUIN: {
          R('#77726a', 0, 0, 16, 16);
          R('#6a655e', 0, 7, 16, 1); R('#6a655e', 7, 0, 1, 7); R('#6a655e', 11, 8, 1, 8);
          specks('', 6, ['#5d7a44', '#848077', '#5f5a53']);
          break;
        }
        case TILE.RUINWALL: {
          R('#5b5750', 0, 0, 16, 16);
          for (let yy = 0; yy < 16; yy += 4) { R('#4a4741', 0, yy, 16, 1); for (let xx = (yy / 4) % 2 ? 4 : 0; xx < 16; xx += 8) R('#4a4741', xx, yy, 1, 4); }
          R('#6f6b63', 0, 0, 16, 2);
          specks('', 4, ['#5d7a44']);
          break;
        }
        default: R('#ff00ff', 0, 0, 16, 16);
      }
      // Shorelines
      if (t === TILE.WATER || t === TILE.DEEP) {
        const land = (dx, dy) => { const nt = ECHO.World.tile(world, x + dx, y + dy); return nt !== TILE.WATER && nt !== TILE.DEEP && nt !== TILE.BRIDGE; };
        if (land(0, -1)) { R('#9cc0d8', 0, 0, 16, 1); R('#5f8fb6', 0, 1, 16, 1); }
        if (land(0, 1)) R('#9cc0d8', 0, 15, 16, 1);
        if (land(-1, 0)) R('#9cc0d8', 0, 0, 1, 16);
        if (land(1, 0)) R('#9cc0d8', 15, 0, 1, 16);
        if (t === TILE.DEEP && !land(0, -1)) { /* fine */ }
      }
    },

    // ---------------------------------------------------------------- Trees
    treeCache: {},
    tree(kind, season, variant) {
      const key = kind + season + variant;
      if (S.treeCache[key]) return S.treeCache[key];
      const c = document.createElement('canvas');
      c.width = 24; c.height = 34;
      const g = c.getContext('2d');
      const R = (col, x, y, w, h) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
      R('rgba(0,0,0,0.25)', 5, 30, 14, 3);
      if (kind === 'pine') {
        R('#4a3420', 10, 24, 4, 8);
        const greens = season === 3 ? ['#2f4a3a', '#3c5c48', '#e9eff2'] : ['#244a2f', '#2f5c3a', '#3d7048'];
        for (let i = 0; i < 4; i++) {
          const w = 18 - i * 4, y = 22 - i * 6;
          R(greens[0], 12 - w / 2, y, w, 6);
          R(greens[1], 12 - w / 2 + 1, y, w - 3, 3);
          if (season === 3) R(greens[2], 12 - w / 2 + 1, y, w - 4, 1);
        }
        R(greens[1], 11, 2, 2, 3);
      } else if (kind === 'willow') {
        R('#4a3a26', 10, 20, 4, 12);
        const col = season === 3 ? '#6b7550' : season === 2 ? '#8a8a3a' : '#5d7d3a';
        R(col, 3, 6, 18, 12); R(shade(col, 0.15), 5, 6, 12, 4);
        for (let i = 0; i < 9; i++) R(shade(col, -0.15), 3 + i * 2, 14, 1, 8 + (i % 3) * 2);
      } else {
        R('#5a3e25', 10, 20, 4, 12); R('#6b4a2c', 11, 20, 1, 12);
        if (season === 3 && variant % 2 === 0) {
          // bare branches
          R('#5a3e25', 6, 12, 1, 9); R('#5a3e25', 17, 10, 1, 11); R('#5a3e25', 8, 8, 8, 1); R('#5a3e25', 11, 4, 1, 16);
          R('#e9eff2', 6, 12, 2, 1); R('#e9eff2', 16, 10, 2, 1);
        } else {
          const pal = season === 2 ? (variant % 3 === 0 ? ['#a8541f', '#c8702a', '#e09a3a'] : ['#b8862a', '#d8a83a', '#ecc85a']) : season === 3 ? ['#3f5a3a', '#4f6a48', '#e9eff2'] : season === 1 ? ['#2f6a2a', '#3f8a35', '#5aa845'] : ['#3a6e30', '#4d8a3c', '#78b04e'];
          R(pal[0], 3, 6, 18, 15); R(pal[0], 6, 3, 12, 3); R(pal[0], 5, 21, 14, 2);
          R(pal[1], 5, 5, 13, 11); R(pal[1], 8, 3, 8, 2);
          R(pal[2], 7, 5, 6, 4); R(pal[2], 14, 9, 3, 2);
          if (season === 1 && variant % 2) { R('#f2c6d6', 6, 9, 2, 2); R('#f2c6d6', 15, 13, 2, 2); R('#f2c6d6', 10, 16, 2, 2); }
        }
      }
      S.treeCache[key] = c;
      return c;
    },

    // ---------------------------------------------------------------- Buildings
    bCache: {},
    FACTION_ROOF: { valdren: ['#4a5a78', '#5f7194'], ashmere: ['#9a4a35', '#b8613f'], lantern: ['#b08a3a', '#cfa64a'], ashfang: ['#5a3a2a', '#6e4a36'] },
    building(b, s, world) {
      const fac = s ? s.faction : 'valdren';
      const era = s ? (world.factions[fac] ? world.factions[fac].tech.era : 0) : 0;
      const path = s && world.factions[fac] ? world.factions[fac].tech.path : null;
      const key = [b.type, b.w, b.h, fac, era, path, b.legend ? 1 : 0, b.ruined ? 1 : 0, b.id.length % 3, b.fac ? b.fac.state : ''].join('|');
      if (S.bCache[key]) return S.bCache[key];
      const W = b.w * 16, H = b.h * 16 + 14;
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d');
      const R = (col, x, y, w, h) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
      const roof = S.FACTION_ROOF[fac] || S.FACTION_ROOF.valdren;
      const top = 14;
      const wallH = Math.max(14, Math.round(b.h * 16 * 0.55));
      const wy = H - wallH;
      const stoneWall = era >= 2 || b.type === 'keep' || b.type === 'archive' || b.type === 'temple';
      const wall = stoneWall ? '#a49a88' : '#b89a72';
      const wallDark = shade(wall, -0.2);
      const drawWall = () => {
        R(wall, 0, wy, W, wallH);
        if (!stoneWall) { for (let x = 0; x < W; x += 6) R(wallDark, x, wy, 1, wallH); R('#6e5234', 0, wy, W, 2); R('#6e5234', 0, H - 2, W, 2); }
        else { for (let y = wy; y < H; y += 4) { R(wallDark, 0, y, W, 1); for (let x = (y / 4) % 2 ? 3 : 0; x < W; x += 7) R(wallDark, x, y, 1, 4); } }
      };
      const drawRoof = (col) => {
        const rh = wy - 2;
        for (let y = 0; y < rh; y++) {
          const inset = Math.max(0, Math.round((rh - y) * 0.0));
          R(y % 3 === 0 ? shade(col[0], -0.15) : (y < rh / 2 ? col[1] : col[0]), inset, y + 2, W - inset * 2, 1);
        }
        R(shade(col[0], -0.35), 0, wy - 1, W, 3);
        R(shade(col[1], 0.2), 2, 2, W - 4, 1);
      };
      const door = (x, col = '#4a3420') => { R(col, x, H - 11, 6, 11); R(shade(col, 0.2), x + 1, H - 10, 4, 1); R('#d8b860', x + 4, H - 6, 1, 1); };
      const window_ = (x, y) => { R('#2a2a33', x, y, 4, 4); R('#4a5a6a', x, y, 4, 1); };
      const burnt = b.fac && (b.fac.state === 'burned' || b.fac.state === 'ruined');
      const ch = c2 => burnt ? shade('#3a3430', 0) : c2;
      switch (b.type) {
        case 'mill': {
          R(ch('#d8ccb0'), 8, 10, W - 16, H - 10); R(ch('#a89a80'), 8, H - 4, W - 16, 4);
          for (let y = 0; y < 10; y++) R(ch(roof[0]), 10 + (10 - y) / 2, y, W - 20 - (10 - y), 1);
          R('#4a3420', W / 2 - 3, H - 9, 6, 9);
          if (!burnt) { g.save(); g.translate(W / 2, 14); g.strokeStyle = '#4a3420'; g.lineWidth = 2; for (let k = 0; k < 4; k++) { g.rotate(Math.PI / 2); g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 13); g.stroke(); g.fillStyle = '#e8dcc0'; g.fillRect(1, 3, 4, 9); } g.restore(); }
          break;
        }
        case 'mine': {
          R(ch('#8a857c'), 0, 8, W, H - 8); R(ch('#6e6a62'), 2, 4, W - 6, 8);
          R('#15130f', W / 2 - 6, H - 14, 12, 14); R(ch('#7a5a36'), W / 2 - 8, H - 16, 16, 3); R(ch('#7a5a36'), W / 2 - 8, H - 16, 2, 16); R(ch('#7a5a36'), W / 2 + 6, H - 16, 2, 16);
          break;
        }
        case 'lumber': {
          for (let i = 0; i < 3; i++) for (let k = 0; k < 3 - i; k++) { R(ch('#6e4a2c'), 2 + k * 7 + i * 3, H - 6 - i * 5, 7, 5); R(ch('#c8a070'), 2 + k * 7 + i * 3, H - 6 - i * 5, 2, 5); }
          R(ch('#7a5a36'), W - 14, H - 18, 12, 2); R(ch('#4a3420'), W - 13, H - 16, 2, 16); R(ch('#4a3420'), W - 4, H - 16, 2, 16);
          break;
        }
        case 'stocks': {
          R('#4a3420', 1, H - 3, W - 2, 3); R('#6e4a2c', 3, H - 14, 2, 12); R('#6e4a2c', W - 5, H - 14, 2, 12); R('#7a5a36', 1, H - 12, W - 2, 4);
          break;
        }
        case 'house': {
          drawRoof(b.legend ? ['#6a6a7a', '#8a8a9a'] : roof);
          drawWall();
          door(Math.floor(W / 2) - 3);
          window_(3, wy + 4); window_(W - 7, wy + 4);
          if (b.legend) { R('#d8c070', W / 2 - 4, wy - 6, 8, 4); R('#8a6a2a', W / 2 - 4, wy - 6, 8, 1); }
          if (era >= 3) R('#5a5a5a', W - 8, 0, 3, 6);
          break;
        }
        case 'inn': {
          drawRoof(roof); drawWall();
          door(Math.floor(W / 2) - 3, '#5a3a20');
          window_(4, wy + 5); window_(W - 8, wy + 5); window_(14, wy + 5);
          R('#3a2a18', W - 6, wy - 2, 1, 10); R('#c89a4a', W - 12, wy + 2, 8, 6); R('#6a3a1a', W - 11, wy + 4, 6, 2);
          R('#5a5a5a', 6, 0, 4, 8);
          break;
        }
        case 'market': {
          // open stalls with striped awnings
          const aw = fac === 'ashmere' ? ['#c8573a', '#eadfc8'] : fac === 'lantern' ? ['#d8a83a', '#f1e6c8'] : ['#4a6aa8', '#e6e2d6'];
          for (let x = 0; x < W; x += 4) R(aw[(x / 4) % 2], x, H - 26, 4, 7);
          R(shade(aw[0], -0.3), 0, H - 19, W, 1);
          R('#7a5a36', 2, H - 19, 2, 19); R('#7a5a36', W - 4, H - 19, 2, 19);
          R('#8a6a42', 4, H - 9, W - 8, 4);
          R('#d8b84a', 7, H - 11, 3, 2); R('#7aa84a', 13, H - 11, 3, 2); R('#b84a3a', 20, H - 11, 3, 2); R('#e6e2d6', 26, H - 12, 3, 3);
          break;
        }
        case 'smithy': {
          drawRoof(['#4a4a4a', '#5f5f5f']); drawWall();
          R('#3a2a1a', 4, H - 12, 12, 12); R('#c8501a', 6, H - 7, 8, 3); R('#ffb347', 8, H - 6, 4, 1);
          R('#4a4a52', W - 14, H - 8, 9, 3); R('#3a3a42', W - 12, H - 5, 5, 5);
          R('#4a4a4a', W - 9, 0, 5, wy);
          break;
        }
        case 'shrine': {
          R('#b8b0a0', 2, H - 22, W - 4, 22); R('#d8d0c0', 2, H - 22, W - 4, 2);
          R(roof[1], 0, H - 28, W, 6); R(roof[0], 4, H - 32, W - 8, 4);
          R('#2a2218', W / 2 - 4, H - 14, 8, 14);
          R('#ffd66a', W / 2 - 1, H - 11, 2, 3);
          break;
        }
        case 'temple': {
          R('#c8bca4', 0, wy, W, wallH); for (let x = 3; x < W; x += 9) { R('#e2d8c2', x, wy, 4, wallH); R('#a89c84', x + 4, wy, 1, wallH); }
          R('#cfa64a', 4, wy - 22, W - 8, 22); R('#e6c060', 8, wy - 30, W - 16, 10); R('#f2d47a', W / 2 - 6, wy - 38, 12, 9);
          R('#fff2b0', W / 2 - 1, 0, 2, 6);
          door(W / 2 - 4, '#4a3018'); R('#4a3018', W / 2 - 4, H - 13, 8, 13);
          break;
        }
        case 'archive': {
          R('#a49a88', 0, wy, W, wallH); for (let x = 2; x < W; x += 8) { R('#ddd4c2', x, wy + 2, 3, wallH - 2); }
          R(roof[0], 0, wy - 10, W, 10); R(roof[1], 4, wy - 16, W - 8, 6); R(shade(roof[1], 0.2), 4, wy - 16, W - 8, 1);
          door(W / 2 - 3, '#3a2a1a');
          if (path === 'arcane' && era >= 2) { R('#9fd3ff', W / 2 - 2, wy - 22, 4, 6); }
          if (path === 'mech' && era >= 2) { R('#8a8a8a', W - 10, wy - 24, 6, 14); R('#c8c8c8', W - 12, wy - 26, 10, 2); }
          break;
        }
        case 'keep': {
          R('#8f897e', 0, 18, W, H - 18);
          for (let y = 18; y < H; y += 5) { R('#7b756b', 0, y, W, 1); for (let x = (y / 5) % 2 ? 4 : 0; x < W; x += 9) R('#7b756b', x, y, 1, 5); }
          for (let x = 0; x < W; x += 8) R('#8f897e', x, 12, 5, 6);
          R('#8f897e', 0, 0, 14, 20); R('#8f897e', W - 14, 0, 14, 20);
          for (let x = 0; x < 14; x += 5) { R('#a39d92', x, 0, 3, 3); R('#a39d92', W - 14 + x, 0, 3, 3); }
          R('#3a2a1a', W / 2 - 6, H - 16, 12, 16); R('#2a1a10', W / 2 - 6, H - 16, 12, 2);
          const ban = world && s ? world.factions[fac].banner : '#2b3f66';
          const bcol = world && s ? world.factions[fac].color : '#6f8fc4';
          R(ban, 4, 22, 6, 12); R(bcol, 5, 24, 4, 4); R(ban, W - 10, 22, 6, 12); R(bcol, W - 9, 24, 4, 4);
          R('#4a3a2a', W / 2, 0, 1, 12); R(bcol, W / 2 + 1, 1, 6, 4);
          if (era >= 4) { R('#ffe9a0', 6, 4, 2, 2); R('#ffe9a0', W - 8, 4, 2, 2); }
          break;
        }
        case 'well': {
          R('#8a8478', 2, H - 10, 12, 10); R('#2a3a4a', 4, H - 9, 8, 3); R('#5a4326', 2, H - 22, 2, 12); R('#5a4326', 12, H - 22, 2, 12); R('#7a5a36', 1, H - 23, 14, 2);
          break;
        }
        case 'board': {
          R('#5a4326', 2, H - 14, 2, 14); R('#5a4326', 12, H - 14, 2, 14); R('#8a6a42', 0, H - 24, 16, 12); R('#e8dcc0', 2, H - 22, 5, 6); R('#e8dcc0', 9, H - 21, 5, 7); R('#c8b898', 4, H - 15, 6, 3);
          break;
        }
        case 'lamp': {
          if (era >= 4) { R('#3a3a42', 7, H - 26, 2, 26); R('#5a5a62', 4, H - 28, 8, 3); R(path === 'arcane' ? '#bfe8ff' : '#fff0a0', 5, H - 26, 6, 3); }
          else { R('#4a3420', 7, H - 18, 2, 18); R('#2a2a2a', 5, H - 22, 6, 5); R('#ffb347', 6, H - 21, 4, 3); }
          break;
        }
        case 'statue': {
          R('#7a766e', 1, H - 8, 14, 8); R('#9a968e', 1, H - 8, 14, 1);
          R('#b8b4aa', 5, H - 26, 6, 18); R('#cfcbc2', 5, H - 30, 6, 5); R('#cfcbc2', 4, H - 22, 8, 2); R('#a8a49a', 11, H - 32, 1, 14);
          R('#d8c070', 3, H - 6, 10, 2);
          break;
        }
      }
      if (b.ruined) { g.globalCompositeOperation = 'source-atop'; R('rgba(40,30,20,0.55)', 0, 0, W, H); g.globalCompositeOperation = 'source-over'; }
      c.anchorY = H;
      S.bCache[key] = c;
      return c;
    },

    // ---------------------------------------------------------------- People
    PROF_COL: {
      farmer: ['#7a8a4a', '#5a4a30'], hunter: ['#5a6a3a', '#4a3a2a'], miner: ['#6a6058', '#3a3430'], woodcutter: ['#8a4a3a', '#4a3a2a'],
      smith: ['#4a4a4a', '#6a4a2a'], herbalist: ['#5a8a6a', '#4a3a2a'], merchant: ['#7a4a8a', '#3a2a4a'], innkeeper: ['#9a7a5a', '#5a4030'],
      priest: ['#e8dcc0', '#c8a85a'], scholar: ['#4a5a8a', '#2a3050'], ruler: ['#8a2a3a', '#d8b84a'], reeve: ['#6a5a3a', '#3a3020'],
      child: ['#b8885a', '#5a4a3a'], elder: ['#8a8070', '#5a5040'], bandit: ['#5a2a24', '#2a1a18'], wanderer: ['#5a5a6a', '#3a3a3a'], inventor: ['#8a6a3a', '#4a4a5a'], guard: ['#6f8fc4', '#3a3a3a']
    },
    person(g, e, npc, world, time, scale = 1) {
      // Draws centred at (0,0) = feet. Units: art pixels.
      const R = (col, x, y, w, h) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
      const look = e.look || { skin: '#e0ac85', hair: '#4a3020', hairStyle: 0 };
      const prof = npc ? npc.prof : 'player';
      let cols = S.PROF_COL[prof] || ['#3a7a7a', '#2a4a4a'];
      if (prof === 'guard' && npc) { const f = world.factions[npc.faction]; cols = [f ? f.color : '#6f8fc4', f ? f.banner : '#2b3f66']; }
      if (prof === 'child' && npc) { const kc = ['#c8574a', '#4a8ac8', '#d8b84a', '#6aa85a', '#9a5ac8', '#d87a3a']; cols = [kc[ECHO.hashStr(npc.id) % kc.length], '#4a3a2a']; }
      if (prof === 'farmer' && npc && ECHO.hashStr(npc.id) % 2) cols = ['#8a6a3a', '#4a3a24'];
      const GL = e.type === 'player' ? e.gearLook : null;
      if (e.type === 'player') cols = GL && GL.armor ? [GL.armor.body, GL.armor.trim] : ['#2f7f86', '#1f4f56'];
      if (e.isCompanion) cols = [shade(cols[0], 0.1), cols[1]];
      const walk = e.moving ? Math.sin(e.anim * 12) : 0;
      const child = npc && prof === 'child';
      const sc = child ? 0.72 : 1;
      g.save();
      g.scale(scale * sc, scale * sc);
      if (e.yielded) g.translate(0, 3);
      const sleeping = e.sleeping;
      if (sleeping) { g.rotate(-Math.PI / 2); g.translate(-4, 2); }
      // shadow
      R('rgba(0,0,0,0.25)', -5, -1, 10, 2);
      // legs
      const l1 = Math.round(walk * 1.5), l2 = -l1;
      R(cols[1], -3, -6 + Math.max(0, l1), 2, 6 - Math.max(0, l1)); R(cols[1], 1, -6 + Math.max(0, l2), 2, 6 - Math.max(0, l2));
      R('#2a2018', -3, -1, 2, 1); R('#2a2018', 1, -1, 2, 1);
      // body
      const robe = prof === 'priest' || prof === 'scholar' || prof === 'ruler';
      R(cols[0], -4, -13, 8, robe ? 11 : 8);
      R(shade(cols[0], -0.2), -4, -6, 8, 1);
      if (prof === 'smith') R('#3a2a1a', -3, -11, 6, 6);
      if (prof === 'guard' || e.role === 'soldier') { R(shade(cols[0], 0.25), -1, -12, 2, 6); }
      if (prof === 'bandit') { R('#2a1a18', -4, -13, 8, 2); }
      if (e.type === 'player') {
        R(GL && GL.rank ? shade(GL.rank.color, -0.4) : '#1f4f56', -5, -13, 2, 9); R('#c8b46a', -1, -12, 2, 1);
        const A = GL && GL.armor;
        if (A) {
          for (let i = 0; i < Math.min(5, A.plus); i++) R(A.gold ? '#f2c84a' : A.metal, -3 + i * 1.5, -10, 1, 1);
          if (A.pauldrons) { R(A.gold ? '#d8b04a' : A.metal, -6, -13, 3, 2); R(A.gold ? '#d8b04a' : A.metal, 3, -13, 3, 2); }
        }
      }
      // arms
      const sw = e.attackT ? 1 : 0;
      R(look.skin, -6, -12 + Math.round(-walk), 2, 5); R(look.skin, 4, -12 + Math.round(walk) - sw * 2, 2, 5);
      // head
      R(look.skin, -3, -19, 6, 6);
      R('#1a1410', -2 + (e.flip ? 0 : 2), -17, 1, 1);
      // hair / helmet / hood
      const elderHair = prof === 'elder' ? '#d8d4cc' : look.hair;
      if (GL && GL.armor && GL.armor.helm) { R(shade(GL.armor.metal, -0.25), -3, -20, 6, 3); R(GL.armor.metal, -3, -20, 6, 1); if (GL.armor.crest) R(GL.armor.glowCol, -1, -22, 2, 2); }
      else if (e.gear && e.gear.helm) { R('#8a8a92', -3, -20, 6, 3); R('#a8a8b0', -3, -20, 6, 1); }
      else if (prof === 'bandit') { R('#3a1a16', -4, -20, 8, 4); R('#3a1a16', -4, -17, 1, 3); R('#3a1a16', 3, -17, 1, 3); }
      else if (prof === 'priest') { R('#e8dcc0', -4, -20, 8, 3); }
      else {
        R(elderHair, -3, -20, 6, 2);
        if (look.hairStyle === 1 || look.female) { R(elderHair, -4, -19, 1, 5); R(elderHair, 3, -19, 1, 5); }
        if (look.hairStyle === 2) R(elderHair, -3, -21, 6, 1);
        if (look.beard) R(elderHair, -2, -14, 4, 2);
      }
      if (npc && npc.title && (npc.prof === 'ruler')) { R('#e8c84a', -3, -22, 6, 2); R('#e8c84a', -3, -23, 1, 1); R('#e8c84a', 0, -23, 1, 1); R('#e8c84a', 2, -23, 1, 1); }
      // gear
      if (e.gear) {
        if (e.gear.shield) { R('#7a5a36', e.flip ? 3 : -8, -13, 5, 7); R('#c8a85a', e.flip ? 5 : -6, -11, 1, 3); R(shade('#7a5a36', -0.3), e.flip ? 3 : -8, -13, 5, 1); }
        if (e.gear.fireward) { R('#7a8a8a', -4, -13, 8, 2); }
        if (e.gear.spear) { R('#6a4a2a', e.flip ? -7 : 6, -22, 1, 18); R('#c8c8d0', e.flip ? -7 : 6, -24, 1, 3); }
        else if (e.gear.bow) { R(e.gear.crossbow ? '#5a5a5a' : '#6a4a2a', e.flip ? -7 : 6, -16, 1, 9); R('#d8d0c0', e.flip ? -6 : 5, -15, 1, 7); }
        if (e.gear.torch) { R('#5a3a1a', e.flip ? 5 : -7, -17, 1, 6); R('#ffb347', e.flip ? 4 : -8, -19, 3, 2); R('#ffe28a', e.flip ? 5 : -7, -20, 1, 1); }
      }
      // weapon in hand
      if (e.type === 'player' || e.carrying || prof === 'guard' || prof === 'bandit' || prof === 'wanderer' || e.role === 'soldier') {
        if (!(e.gear && (e.gear.spear || e.gear.bow))) {
          const legendary = e.carrying && world.items[e.carrying] && (world.items[e.carrying].legend || world.items[e.carrying].history.some(h => h.t.includes('taken by')));
          const blade = legendary ? '#f2dc8a' : '#d8dce4';
          const B = GL && GL.blade;
          if (B && B.wclass === 'spear') { const bx = e.flip ? -7 : 6; R('#6a4a2a', bx, -24, 1, 20); R(B.metal, bx, -27 - Math.min(3, B.plus), 1, 3 + Math.min(3, B.plus)); if (B.glow > 0.15) R(B.glowCol, bx - 1, -26, 3, 2); }
          else if (B && B.wclass === 'staff') { const bx = e.flip ? -7 : 6; R(B.gold ? '#8a6a2a' : '#5a3e26', bx, -20, 1, 18); R(B.glowCol || '#ff9a3c', bx - 1, -23, 3, 3); if (B.glow > 0.15) { g.globalAlpha = 0.4; R(B.glowCol, bx - 2, -24, 5, 5); g.globalAlpha = 1; } }
          else if (B && B.wclass === 'axe') { const bx = e.flip ? -7 : 6; R('#6a4a2a', bx, -16, 1, 8); R(B.metal, e.flip ? bx - 3 : bx, -18, 4, 4); for (let i = 0; i < B.gems; i++) R(B.glowCol, bx, -14 + i, 1, 1); }
          else if (B) {
            const len = 8 + Math.min(4, B.plus) + (B.rarity === 'legendary' ? 1 : 0), bx = e.flip ? -7 : 6;
            if (B.glow > 0.15) { g.globalAlpha = 0.25 + B.glow * 0.35; R(B.glowCol, bx - 1, -10 - len, 3, len); g.globalAlpha = 1; }
            R(B.metal, bx, -10 - len, 1, len); R(B.gold ? '#f2c84a' : '#6a4a2a', e.flip ? -8 : 5, -10, 3, 1);
            for (let i = 0; i < B.gems; i++) R(B.glowCol, bx, -9 - len + 2 + i * 2, 1, 1);
          } else if (e.type !== 'player' || ECHO.Game.pl && ECHO.Game.pl.weapon) { R(blade, e.flip ? -7 : 6, -18, 1, 8); R('#6a4a2a', e.flip ? -8 : 5, -10, 3, 1); }
        }
      }
      if (prof === 'elder' || (e.gear && e.gear.staff)) { R('#6a4a2a', e.flip ? -7 : 6, -14, 1, 14); if (e.gear && e.gear.staff) R('#ff9a3c', e.flip ? -8 : 5, -16, 3, 2); }
      g.restore();
      void time; void child;
    },
    cart(g) {
      const R = (col, x, y, w, h) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
      R('rgba(0,0,0,0.25)', -11, -1, 22, 3);
      R('#7a5a36', -10, -12, 20, 8); R('#5a4326', -10, -12, 20, 1); R('#e6dcc0', -9, -16, 18, 5); R('#c8bca0', -9, -16, 18, 1);
      R('#3a2a1a', -8, -5, 5, 5); R('#3a2a1a', 4, -5, 5, 5); R('#7a6a5a', -7, -4, 3, 3); R('#7a6a5a', 5, -4, 3, 3);
    },

    // ---------------------------------------------------------------- Creatures
    STRAIN_TINT: { Ashen: '#9a9a96', Ironhide: '#5a4632', Swift: null },
    creature(g, e, time) {
      const R = (col, x, y, w, h) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
      const sp = e.species;
      if (sp === 'hind') {
        // the White Hind: slender, pale, a faint shine about her
        const walk = e.moving ? Math.sin(e.anim * 14) : 0;
        g.save(); if (e.flip) g.scale(-1, 1);
        R('rgba(0,0,0,0.2)', -8, -1, 16, 2);
        const l = Math.round(walk * 1.5);
        R('#d8d4c8', -6, -8 + Math.max(0, l), 2, 8 - Math.max(0, l)); R('#d8d4c8', -3, -8, 2, 8); R('#d8d4c8', 3, -8 + Math.max(0, -l), 2, 8 - Math.max(0, -l)); R('#d8d4c8', 5, -8, 2, 8);
        R('#f4f2ea', -7, -14, 15, 7); R('#ffffff', -6, -14, 11, 2); R('#e2ddd0', -7, -8, 15, 1);
        const graze = e.state === 'graze' && Math.sin(time * 0.7 + e.id) > 0.3;
        if (graze) { R('#f4f2ea', 7, -12, 3, 3); R('#f4f2ea', 9, -9, 4, 3); R('#9fd3ff', 11, -9, 1, 1); }
        else { R('#f4f2ea', 6, -19, 3, 7); R('#f4f2ea', 7, -21, 6, 4); R('#e8c8c8', 7, -24, 1, 3); R('#e8c8c8', 9, -24, 1, 3); R('#9fd3ff', 11, -20, 1, 1); }
        R('#ffffff', -9, -14, 2, 2);
        g.restore();
        return;
      }
      const walk = e.moving ? Math.sin(e.anim * 16) : 0;
      let base = ECHO.SPECIES[sp].color;
      if (e.strain && S.STRAIN_TINT[e.strain]) base = mix(base, S.STRAIN_TINT[e.strain], 0.65);
      if (e.mutation === 'mirrorback') base = '#b8c4d4';
      if (e.mutation === 'emberfur') base = mix(base, '#c8501a', 0.5);
      if (e.mutation === 'paleshade') g.globalAlpha = 0.55;
      const dark = shade(base, -0.3), light = shade(base, 0.25);
      g.save();
      if (e.flip) g.scale(-1, 1);
      if (e.state === 'windup' && sp === 'wolf') g.translate(-1, 1);
      if (sp === 'gnawer') {
        R('rgba(0,0,0,0.25)', -5, -1, 10, 2);
        R(base, -4, -6, 8, 5); R(light, -3, -6, 5, 1); R(base, 3, -5, 3, 3); R('#1a1010', 5, -5, 1, 1); R('#e8e0c0', 6, -3, 1, 1);
        R(dark, -6, -3, 3, 1); R(dark, -7, -2, 1, 1);
        R(dark, -3, -1 + (walk > 0 ? 0 : 0), 1, 1); R(dark, 2, -1, 1, 1);
        if (e.mutation === 'twinjaw') R('#e8e0c0', 5, -2, 2, 1);
      } else if (sp === 'hare') {
        R('rgba(0,0,0,0.25)', -5, -1, 10, 2);
        const hop = e.moving ? Math.abs(walk) * 2 : 0;
        g.translate(0, -hop);
        R(base, -4, -7, 8, 6); R(light, -3, -7, 5, 2); R(base, 2, -9, 4, 4); R('#1a1010', 4, -8, 1, 1);
        R(base, 2, -13, 1, 4); R(base, 4, -13, 1, 4); R('#e8c0c0', 2, -12, 1, 2);
        for (let i = -3; i < 2; i += 2) R(dark, i, -9, 1, 2);
        R('#f0ece0', -5, -5, 2, 2);
        if (e.mutation === 'glasshorn') { R('#d8f4ff', 3, -15, 1, 3); }
      } else if (sp === 'wolf') {
        R('rgba(0,0,0,0.3)', -8, -1, 16, 2);
        R(base, -7, -9, 12, 6); R(light, -6, -9, 9, 2); R(dark, -7, -4, 12, 1);
        R(base, 4, -11, 5, 5); R(base, 8, -9, 3, 2); R('#1a1010', 10, -9, 1, 1);
        R(e.state === 'windup' || e.state === 'lunge' ? '#ff4a3a' : '#d8c050', 6, -10, 1, 1);
        R(base, 4, -13, 1, 2); R(base, 6, -13, 1, 2);
        R(base, -10, -9, 4, 2); R(dark, -11, -8, 2, 1);
        const lg = Math.round(walk * 1.5);
        R(dark, -6 + lg, -3, 2, 3); R(dark, -3 - lg, -3, 2, 3); R(dark, 1 + lg, -3, 2, 3); R(dark, 3 - lg, -3, 2, 3);
        if (e.strain === 'Ironhide') { R('#3a2a1a', -5, -9, 2, 1); R('#3a2a1a', -1, -9, 2, 1); R('#3a2a1a', 2, -9, 2, 1); }
        if (e.mutation === 'hollowsong') { R('#7aa8d8', -6, -8, 1, 4); R('#7aa8d8', -2, -8, 1, 4); R('#7aa8d8', 2, -8, 1, 4); }
        if (e.mutation === 'glasshorn') R('#d8f4ff', 7, -15, 1, 3);
      }
      g.restore();
      g.globalAlpha = 1;
      void time;
    },

    // ---------------------------------------------------------------- Bosses
    boss(g, e, time) {
      const R = (col, x, y, w, h) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
      const b = e.boss;
      const k = ECHO.Boss.KIND[b.kind];
      const base = k.color;
      const dark = shade(base, -0.35), light = shade(base, 0.25);
      const walk = e.moving ? Math.sin(e.anim * 8) : 0;
      const breathe = Math.sin(time * 2) * 0.6;
      g.save();
      if (e.flip) g.scale(-1, 1);
      R('rgba(0,0,0,0.35)', -16, -2, 32, 4);
      if (e.state === 'windup' || e.state === 'feint') g.translate(-2, 0);
      if (b.kind === 'drake') {
        R(base, -14, -20 + breathe, 24, 14); R(light, -12, -20 + breathe, 18, 3); R(dark, -14, -7, 24, 2);
        R(base, 8, -24 + breathe, 10, 9); R(base, 16, -20 + breathe, 6, 4); R('#e8e0c0', 18, -17, 1, 2); R('#e8e0c0', 20, -17, 1, 2);
        R('#ffcf3a', 14, -22 + breathe, 2, 2);
        R(dark, -22, -16, 9, 4); R(dark, -26, -14, 5, 3);
        R(shade(base, -0.15), -8, -32 + breathe, 12, 12); R(dark, -8, -32 + breathe, 12, 1); for (let i = 0; i < 4; i++) R(dark, -7 + i * 3, -31 + breathe, 1, 10);
        const lg = Math.round(walk * 2);
        R(dark, -11 + lg, -7, 4, 7); R(dark, 4 - lg, -7, 4, 7);
      } else if (b.kind === 'wyrm') {
        for (let i = 0; i < 6; i++) { const yy = -10 - Math.sin(time * 3 + i) * 2; R(i % 2 ? base : light, -18 + i * 5, yy, 7, 8); R(dark, -18 + i * 5, yy + 7, 7, 1); }
        R(base, 10, -22 + breathe, 10, 10); R(light, 11, -22 + breathe, 8, 2); R('#c8e85a', 16, -19 + breathe, 2, 2); R('#e8e0c0', 19, -14, 1, 3);
        for (let i = 0; i < 5; i++) R(dark, -14 + i * 6, -14, 2, 2);
      } else {
        R(base, -12, -22 + breathe, 22, 12); R(light, -10, -22 + breathe, 16, 3);
        const lg = Math.round(walk * 2);
        R(dark, -10 + lg, -10, 3, 10); R(dark, -4 - lg, -10, 3, 10); R(dark, 3 + lg, -10, 3, 10); R(dark, 7 - lg, -10, 3, 10);
        R(base, 8, -28 + breathe, 7, 10); R(base, 13, -24 + breathe, 6, 4); R('#1a1010', 14, -25, 1, 1);
        const ant = '#d8cdb0';
        R(ant, 8, -36, 1, 9); R(ant, 5, -38, 4, 1); R(ant, 4, -42, 1, 5); R(ant, 12, -38, 1, 11); R(ant, 13, -42, 4, 1); R(ant, 16, -46, 1, 5); R(ant, 9, -44, 1, 4);
      }
      // Adaptations are visible.
      if (b.armor.melee > 0.05) { for (let i = 0; i < 5; i++) R('#e2dccb', -12 + i * 5, -21, 4, 3); }
      if (b.armor.fire > 0.05) { R('#7a6a52', -10, -16, 8, 5); R('#6a5a44', 0, -14, 7, 4); R('#7a6a52', -6, -10, 9, 3); }
      if (b.armor.ranged > 0.05) { for (let i = 0; i < 6; i++) R(shade(base, -0.45), -13 + i * 4, -18 + (i % 2) * 2, 3, 2); }
      for (let i = 0; i < b.scars.length && i < 4; i++) { R('#c8a0a0', -8 + i * 6, -19 + i * 2, 1, 6); R('#c8a0a0', -7 + i * 6, -18 + i * 2, 1, 4); }
      g.restore();
    }
  };
})();
