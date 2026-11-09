// The look of the world. "Arcanotech" (the default): the towns are built of the new things — white
// ceramic walls, roofs of dark sun-glass laid in cells, doors framed in light, a line of light
// round the foot of every wall and the eaves of every roof, a beacon on every spire — while the
// wild, the ruins and the deep places stay as old and strange as they ever were. "Classic": the
// world as it was drawn before. Only how things are drawn changes: nothing in a save does, and
// the setting lives with the other settings (echo.settings), not in the world.
//
// Models.bake asks: tech(name) — is this one built new? remap() — its colour for each of the
// stuff it is made of; kind() — what the surface shader draws on that stuff (panels, sun-glass,
// metal); trims() — the lines of light to add, found from the model's own shape.
(function () {
  const T = ECHO.Theme = {
    on() { const s = ECHO.UI && ECHO.UI.settings; return !(s && s.look === 'classic'); },
    // the halls and houses (and the things in the streets) that are built new
    BUILD: new Set(['house', 'inn', 'market', 'smithy', 'board', 'shrine', 'archive', 'keep', 'temple', 'well', 'statue', 'mill', 'mine', 'lumber', 'stocks',
      'h_ash', 'h_lan', 'h_nor', 'h_sar', 'h_sar2', 'h_kes', 'h_aur', 'k_ash', 'k_nor', 'k_sar', 'k_kes', 'k_aur']),
    STREET: new Set(['lamp', 'brazier', 'lanternpost', 'fountain', 'stall', 'post', 'npost', 'barrel', 'crate']),
    LIGHTS: new Set(['lamp', 'brazier', 'lanternpost']),
    // (no lines of light on these: they are small, or are not buildings)
    PLAIN: new Set(['statue', 'board', 'well', 'stocks', 'post', 'npost', 'stall', 'fountain', 'lamp', 'brazier', 'lanternpost', 'barrel', 'crate']),
    // parts that are lit: a canister's bands, a cargo case's straps
    LIT: { barrel: { iron: '#2fc8d8' }, crate: { darkwood: '#2fc8d8' } },
    lit(name, mname) { const L = T.LIT[name]; return L && L[mname] || null; },
    tech(name) { return T.on() && (T.BUILD.has(name) || T.STREET.has(name)); },

    hex(c) { return '#' + c.clone().convertLinearToSRGB().getHexString(); },
    hsl(hex) { const o = {}; new THREE.Color(hex).getHSL(o); return o; },
    fromHsl(h, s, l) { return '#' + new THREE.Color().setHSL(((h % 1) + 1) % 1, Math.max(0, Math.min(1, s)), Math.max(0, Math.min(1, l))).getHexString(); },
    // what each stuff becomes (sRGB hex in, out)
    MAP: {
      wall: (o) => [o.h, o.s * 0.35, 0.6 + o.l * 0.32],
      plaster: (o) => [o.h, o.s * 0.3, 0.64 + o.l * 0.3],
      marble: (o) => [o.h, o.s * 0.2, 0.7 + o.l * 0.26],
      stone: (o) => [0.58 + (((o.h - 0.58 + 1.5) % 1) - 0.5) * 0.5, o.s * 0.3 + 0.04, 0.1 + o.l * 0.82],
      darkstone: (o) => [0.6, o.s * 0.3 + 0.05, 0.1 + o.l * 0.6],
      roof: (o) => [o.h, Math.min(1, o.s * 1.05 + 0.1), 0.16 + o.l * 0.3],
      dome: (o) => [o.h, Math.min(1, o.s + 0.12), 0.24 + o.l * 0.34],
      wood: (o) => [0.6, o.s * 0.15 + 0.04, 0.27 + o.l * 0.3],
      darkwood: (o) => [0.6, o.s * 0.15 + 0.05, 0.13 + o.l * 0.22],
      awning: (o) => o.s < 0.12 ? [0.52, 0.1, Math.max(o.l, 0.82)] : [o.h, Math.max(o.s, 0.78), Math.min(0.58, Math.max(0.44, o.l))],
      awning2: (o) => [o.h, o.s * 0.4, Math.max(o.l, 0.82)],
      banner: (o) => [o.h, Math.max(o.s, 0.75), Math.min(0.58, Math.max(0.42, o.l))],
      band: (o) => [o.h, Math.max(o.s, 0.75), Math.min(0.58, Math.max(0.42, o.l))],
      canvas: (o) => [o.h, o.s * 0.35, Math.max(o.l, 0.78)],
      metal: (o) => [0.58, o.s * 0.3 + 0.05, Math.max(o.l, 0.76)],
      darkmetal: (o) => [0.6, 0.08, 0.22 + o.l * 0.35],
      iron: (o) => [0.6, 0.08, 0.2 + o.l * 0.4],
      gold: (o) => [o.h, Math.max(o.s, 0.75), Math.min(0.72, o.l + 0.05)]
    },
    remap(name, mname, hex) {
      if (T.LIGHTS.has(name) && (mname === 'glow' || mname === 'flame')) return mname === 'glow' ? '#8ff6ff' : '#d4fbff';
      if (mname === 'window') return '#16303c';
      const f = T.MAP[mname];
      if (!f) return hex;
      const [h, s, l] = f(T.hsl(hex));
      return T.fromHsl(h, s, l);
    },
    // what the surface shader draws: 1 panels, 2 sun-glass, 3 metal
    kind(mname) {
      return mname === 'wall' || mname === 'plaster' || mname === 'marble' || mname === 'stone' || mname === 'darkstone' ? 1
        : mname === 'roof' || mname === 'dome' ? 2 : mname === 'metal' || mname === 'darkmetal' || mname === 'iron' || mname === 'gold' ? 3 : 0;
    },
    // the colour of a town's light: its banner's, made bright; cyan where it has none
    accent(colors) {
      if (colors && colors.trim) return colors.trim;
      const b = colors && (colors.banner || colors.band);
      if (!b) return '#4ff0ff';
      const o = T.hsl(b);
      if (o.s < 0.1) return '#4ff0ff';
      return T.fromHsl(o.h, 0.95, 0.6);
    },

    // ------------------------------------------------------------ lines of light
    // The model's pieces (each box, prism, cone or drum it is made of), found by the triangles
    // that share corners; for each: what it is made of, its bounds, its corners.
    pieces(mname, g) {
      const P = g.attributes.position.array, nt = P.length / 9;
      if (nt > 4000) return [];
      const par = new Int32Array(nt);
      for (let i = 0; i < nt; i++) par[i] = i;
      const find = (i) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
      const seen = new Map();
      for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) {
        const o = (t * 3 + k) * 3, key = Math.round(P[o] * 500) + ',' + Math.round(P[o + 1] * 500) + ',' + Math.round(P[o + 2] * 500);
        const j = seen.get(key);
        if (j === undefined) seen.set(key, t); else { const a = find(t), b = find(j); if (a !== b) par[a] = b; }
      }
      const by = new Map();
      for (let t = 0; t < nt; t++) { const r = find(t); let L = by.get(r); if (!L) by.set(r, L = []); L.push(t); }
      const out = [];
      for (const L of by.values()) {
        const pts = [];
        let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
        for (const t of L) for (let k = 0; k < 3; k++) {
          const o = (t * 3 + k) * 3, x = P[o], y = P[o + 1], z = P[o + 2];
          pts.push(x, y, z);
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
        }
        out.push({ m: mname, pts, x0, y0, z0, x1, y1, z1 });
      }
      return out;
    },
    // the outline (seen from above) of a piece's corners at a level: its convex hull in x, z
    hull(pts, yMax) {
      const P = [];
      const seen = new Set();
      for (let i = 0; i < pts.length; i += 3) {
        if (pts[i + 1] > yMax) continue;
        const key = Math.round(pts[i] * 200) + ',' + Math.round(pts[i + 2] * 200);
        if (seen.has(key)) continue;
        seen.add(key); P.push([pts[i], pts[i + 2]]);
      }
      if (P.length < 3) return null;
      P.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
      const lo = [], up = [];
      for (const p of P) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 1e-9) lo.pop(); lo.push(p); }
      for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 1e-9) up.pop(); up.push(p); }
      up.pop(); lo.pop();
      const H = lo.concat(up);
      return H.length >= 3 ? H : null;
    },
    piece(geo, hex) {
      const g = geo.index ? geo.toNonIndexed() : geo;
      const c = new THREE.Color(hex).convertSRGBToLinear(), n = g.attributes.position.count, col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
      return { pos: g.attributes.position.array, nor: g.attributes.normal.array, col, tech: 0 };
    },
    // a bar from (ax, az) to (bx, bz) at height y: w across, h high, pushed out by `out` along n
    bar(list, hex, ax, az, bx, bz, y, w, h, ext) {
      const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
      if (len < 0.02) return;
      const g = new THREE.BoxGeometry(len + (ext || 0), h, w);
      g.applyMatrix4(new THREE.Matrix4().makeRotationY(-Math.atan2(dz, dx)));
      g.translate((ax + bx) / 2, y, (az + bz) / 2);
      list.push(T.piece(g, hex));
    },
    // an upright of light from y0 to y1
    post(list, hex, x, z, y0, y1, w) {
      const g = new THREE.BoxGeometry(w, y1 - y0, w);
      g.translate(x, (y0 + y1) / 2, z);
      list.push(T.piece(g, hex));
    },
    // a line of light round an outline, a little out from it
    ring(list, hex, H, y, out, w, h) {
      let cx = 0, cz = 0;
      for (const p of H) { cx += p[0]; cz += p[1]; }
      cx /= H.length; cz /= H.length;
      for (let i = 0; i < H.length; i++) {
        const a = H[i], b = H[(i + 1) % H.length];
        const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz) || 1;
        let nx = dz / len, nz = -dx / len;
        const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
        if ((mx - cx) * nx + (mz - cz) * nz < 0) { nx = -nx; nz = -nz; }
        const o = out + w / 2;
        T.bar(list, hex, a[0] + nx * o, a[1] + nz * o, b[0] + nx * o, b[1] + nz * o, y, w, h, w * 1.6);
      }
    },
    // the lines of light for a building (glow) and the masts that hold its beacons (base)
    trims(name, pieces, hex) {
      const glow = [], base = [];
      if (T.PLAIN.has(name)) return { glow, base };
      let beacons = 0;
      for (const p of pieces) {
        const sx = p.x1 - p.x0, sy = p.y1 - p.y0, sz = p.z1 - p.z0;
        const k = T.kind(p.m);
        if (k === 1) {
          // a wall standing on the ground: a line of light round its foot
          if (sy < 0.45 || Math.max(sx, sz) < 0.9 || Math.min(sx, sz) < 0.1 || p.y0 > 0.35) continue;
          const H = T.hull(p.pts, p.y0 + 0.03);
          if (H) T.ring(glow, hex, H, p.y0 + 0.13, 0.012, 0.03, 0.045);
        } else if (k === 2) {
          if (Math.max(sx, sz) < 0.5) continue;
          // its eaves, all round
          const H = T.hull(p.pts, p.y0 + 0.02);
          if (H) T.ring(glow, hex, H, p.y0 + 0.02, 0.018, 0.045, 0.045);
          if (sy < 0.22) continue;
          // its ridge, or a beacon on its peak
          let ax = 1e9, az = 1e9, bx = -1e9, bz = -1e9, n = 0;
          for (let i = 0; i < p.pts.length; i += 3) {
            if (p.pts[i + 1] < p.y1 - 0.02) continue;
            n++; ax = Math.min(ax, p.pts[i]); bx = Math.max(bx, p.pts[i]); az = Math.min(az, p.pts[i + 2]); bz = Math.max(bz, p.pts[i + 2]);
          }
          if (!n) continue;
          const ex = bx - ax, ez = bz - az;
          if (Math.max(ex, ez) > 0.3 && Math.min(ex, ez) < 0.15) {
            if (ex >= ez) T.bar(glow, hex, ax, (az + bz) / 2, bx, (az + bz) / 2, p.y1 + 0.012, 0.06, 0.05, 0.06);
            else T.bar(glow, hex, (ax + bx) / 2, az, (ax + bx) / 2, bz, p.y1 + 0.012, 0.06, 0.05, 0.06);
          } else if (Math.max(ex, ez) <= 0.3 && beacons < 3) {
            beacons++;
            const cx = (ax + bx) / 2, cz = (az + bz) / 2;
            const mast = new THREE.BoxGeometry(0.035, 0.34, 0.035); mast.translate(cx, p.y1 + 0.17, cz);
            base.push(Object.assign(T.piece(mast, '#2a3040'), { tech: 3 }));
            const orb = new THREE.OctahedronGeometry(0.075, 0); orb.translate(cx, p.y1 + 0.38, cz);
            glow.push(T.piece(orb, hex));
          }
        } else if (p.m === 'darkwood' || p.m === 'wood') {
          // a door: thin, man-high, at the foot of the wall: framed in light
          const thin = Math.min(sx, sz), wide = Math.max(sx, sz);
          if (thin > 0.11 || sy < 0.45 || sy > 1.5 || wide < 0.25 || wide > 1.1 || p.y0 > 0.12) continue;
          const alongX = sx >= sz, cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2;
          const s = alongX ? Math.sign(cz) || -1 : Math.sign(cx) || -1;
          const fx = alongX ? 0 : s * (thin / 2 + 0.012), fz = alongX ? s * (thin / 2 + 0.012) : 0;
          const hw = wide / 2 + 0.025, y0 = p.y0, y1 = p.y1 + 0.03;
          for (const e of [-1, 1]) T.post(glow, hex, alongX ? cx + e * hw : cx + fx, alongX ? cz + fz : cz + e * hw, y0, y1, 0.03);
          if (alongX) T.bar(glow, hex, cx - hw, cz + fz, cx + hw, cz + fz, y1, 0.03, 0.03, 0.03);
          else T.bar(glow, hex, cx + fx, cz - hw, cx + fx, cz + hw, y1, 0.03, 0.03, 0.03);
        }
      }
      return { glow, base };
    }
  };
})();
