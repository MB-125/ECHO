// Solid things in the open world. The ground grid already blocks water, rock,
// walls and buildings; this adds everything that stands on the ground: tree
// trunks, boulders on the hills, the stones and pillars of old places, tents,
// carts, wells, huts, cairns, your homestead's walls and fences. Bodies are
// circles, things are circles or boxes, and a walker is stopped by any of them.
(function () {
  const { U } = ECHO;
  const TT = () => ECHO.TILE;
  const h2 = (x, y, s) => ECHO.hash2(x, y, s);

  // Footprint radius of each model at scale 1 (measured from the models).
  const RAD = { boulder: 0.46, rock: 0.3, pillar: 0.28, tent: 0.7, crate: 0.32, barrel: 0.28, well: 0.46, tablet: 0.33, standard: 0.12, anvil: 0.22, cage: 0.55, ruinwall: 0.45, shrine: 1.05 };

  const So = ECHO.Solids = {
    RAD,
    // What stands on a tile by nature (the same hashes the 3D renderer plants with).
    tileProp(world, x, y) {
      if (x < 0 || y < 0 || x >= world.W || y >= world.H) return null;
      const T = TT(), t = world.tiles[y * world.W + x];
      if (t !== T.TREE && t !== T.FOREST && t !== T.GRASS && t !== T.HILL && t !== T.SNOW && t !== T.RUIN) return null;
      const s = world.seed, a = h2(x, y, s + 31), b = h2(x, y, s + 32), c = h2(x, y, s + 33);
      const px = x + 0.5 + (b - 0.5) * 0.5, py = y + 0.5 + (c - 0.5) * 0.5;
      if (t === T.TREE) return { x: px, y: py, r: 0.2, k: 'trunk' };
      if (t === T.FOREST) return a < 0.22 ? { x: px, y: py, r: 0.15, k: 'oak', s: 0.6 + b * 0.25 } : null;
      if (t === T.GRASS) return a >= 0.32 && a < 0.335 ? { x: px, y: py, r: RAD.rock * (0.5 + b * 0.4), k: 'rock', s: 0.5 + b * 0.4 } : null;
      if (t === T.HILL || t === T.SNOW) return a < 0.18 ? { x: px, y: py, r: RAD.rock * (0.8 + b), k: 'rock', s: 0.8 + b } : null;
      if (t === T.RUIN && a < 0.06 && world.ruins.some(r => Math.abs(r.x - x) <= 6 && Math.abs(r.y - y) <= 5)) return { x: px, y: py, r: 0.25, k: 'pillar', s: 0.9 };
      return null;
    },

    // ------------------------------------------------------------ placed things
    // shapes: { c: [x, y, r] } or { b: [x0, y0, x1, y1] }
    shapesOf(world, pl) {
      const out = [];
      const C = (x, y, r) => { if (r > 0.12) out.push({ c: [x, y, r] }); };
      const B = (x0, y0, x1, y1) => out.push({ b: [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)] });
      const M = (x, y, model, sc = 1) => C(x, y, (RAD[model] || 0.3) * sc);
      for (const c of world.camps) {
        if (!c.alive && !c.captives.length) continue;
        for (const [dx, dy] of [[-2.5, -1.5], [2, -2.2], [-2.8, 2], [2.4, 2.2]]) M(c.x + dx, c.y + dy, 'tent');
        if (c.captives.length) M(c.x + 2.5, c.y - 1.2, 'cage');
      }
      for (const r of world.ruins) { M(r.x + 0.5, r.y - 1, 'tablet'); if (r.relics.length) M(r.x + 3, r.y + 1, 'rock', 0.7); }
      for (const st of world.structures) if (st.type === 'vaultstone') C(st.x + 0.5, st.y + 0.5, 0.5);
      for (const s of world.sites || []) {
        if (s.secret) continue;
        const m = (model, dx, dy, sc = 1) => M(s.x + dx, s.y + dy, model, sc);
        switch (s.kind) {
          case 'stones': for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; m('pillar', Math.cos(a) * 2.3, Math.sin(a) * 2.3, 0.9); } m('tablet', 0, 0); break;
          case 'lookout': m('boulder', -0.8, 0.2, 1.2); m('boulder', 0.9, -0.2, 0.9); m('standard', 0, -0.6); break;
          case 'moonwell': m('well', 0, 0, 1.2); break;
          case 'oak': C(s.x, s.y, 0.45); break;
          case 'battlefield': m('standard', 0.5, 0.3, 0.9); B(s.x - 1.7, s.y - 0.9, s.x - 0.3, s.y - 0.7); break;
          case 'wayshrine': m('shrine', 0, 0, 0.42); break;
          case 'wreck': C(s.x - 0.3, s.y, 0.62); m('barrel', 1.2, 0.6, 0.9); m('crate', -1, 0.8, 0.9); break;
          case 'barrow': m('boulder', -1.4, -0.6, 1.8); m('boulder', 1.4, -0.6, 1.8); m('pillar', -0.6, 0.2, 0.8); m('pillar', 0.6, 0.2, 0.8); break;
          case 'cave': case 'nest': m('boulder', -1.3, -0.4, 1.6); m('boulder', 1.3, -0.4, 1.5); m('boulder', 0, -1.2, 1.7); break;
          case 'hideout': m('crate', -1, 0); m('crate', -1.1, 0.9, 0.8); m('barrel', 1, 0.2); m('tent', 0.2, -1.4, 0.8); break;
          case 'crypt': m('ruinwall', -1.2, -0.5, 0.9); m('ruinwall', 1.2, -0.5, 0.9); m('pillar', -0.7, 0.3, 0.7); m('pillar', 0.7, 0.3, 0.7); break;
          case 'catacomb': m('ruinwall', -1.5, -0.8, 1.1); m('ruinwall', 1.5, -0.8, 1.1); m('pillar', -0.8, 0.4); m('pillar', 0.8, 0.4); break;
          case 'warren': m('boulder', -1.5, -0.6, 1.4); m('boulder', 1.4, -0.9, 1.3); m('standard', 1, 0.6, 0.8); break;
          case 'trollden': m('boulder', -1.9, -0.7, 2.4); m('boulder', 1.9, -0.7, 2.3); m('boulder', 0, -1.9, 2.6); break;
          case 'sanctum': m('ruinwall', -1.4, -0.6); m('ruinwall', 1.4, -0.6); m('pillar', -0.7, 0.4, 1.1); m('pillar', 0.7, 0.4, 1.1); break;
          case 'forge': m('boulder', -1.7, -0.9, 2.2); m('boulder', 1.7, -0.9, 2.1); m('pillar', -0.8, 0.2, 1.2); m('pillar', 0.8, 0.2, 1.2); m('anvil', 1.4, 1.2); break;
          case 'falls': m('boulder', -1.6, -1.4, 2.2); m('boulder', 1.6, -1.4, 2.1); m('boulder', 0, -2.2, 2.4); break;
          case 'springs': for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; m('rock', Math.cos(a) * 1.6, Math.sin(a) * 1.2, 0.55); } break;
          case 'grotto': m('boulder', -1.4, -0.6, 1.7); m('boulder', 1.3, -0.7, 1.6); m('boulder', 0, -1.4, 1.8); break;
          case 'bones': C(s.x + 2.8, s.y + 0.2, 0.8); break;
        }
      }
      for (const c of world.caches || []) { if (c.kind === 'cairn') C(c.x, c.y, 0.18); else if (c.kind === 'hollow') C(c.x, c.y, 0.48); }
      const EX = world.expedition;
      if (EX && EX.camp) { M(EX.camp.x - 1.6, EX.camp.y - 1.2, 'tent', 0.85); M(EX.camp.x + 1.4, EX.camp.y - 0.6, 'crate', 0.8); }
      // caves, shrines, wrecks, stone circles and huts
      if (world.secrets) for (const o of world.secrets.list) {
        const h = ECHO.hashStr(o.id), r = k => ((h >> k) % 100) / 100;
        if (o.kind === 'cave') { C(o.x - 0.7, o.y - 0.4, 1.0); C(o.x + 0.7, o.y - 0.4, 1.0); C(o.x + 1.3, o.y + 0.2, 0.62); }
        else if (o.kind === 'shrine') C(o.x, o.y, 0.42);
        else if (o.kind === 'wreck') {
          const a = r(2) * 3, ux = Math.cos(a), uy = -Math.sin(a), L = o.boat ? 0.65 : 0.45;
          C(o.x + ux * L, o.y + uy * L, o.boat ? 0.46 : 0.5); C(o.x - ux * L, o.y - uy * L, o.boat ? 0.46 : 0.5);
        } else if (o.kind === 'circle') for (const a of [-Math.PI / 2, 0, Math.PI / 2, Math.PI]) C(o.x + Math.cos(a) * 2.4, o.y + Math.sin(a) * 2.4, 0.27);
        else if (o.kind === 'hut') { B(o.x - 1.1, o.y - 0.9, o.x + 1.1, o.y + 0.9); C(o.x + 1.4, o.y + 0.6, 0.3); }
      }
      // your homestead
      const s = pl && pl.stead, H = ECHO.Homestead;
      if (s && H) {
        const at = k => ({ x: s.x + H.BUILDS[k].at[0], y: s.y + H.BUILDS[k].at[1] });
        const box = (k, w, d) => { const p = at(k); B(p.x - w / 2, p.y - d / 2, p.x + w / 2, p.y + d / 2); };
        const bd = s.builds;
        if (bd.tent) C(s.x, s.y, 0.75);
        if (bd.cabin) box('cabin', 3, 2.4);
        if (bd.fence) {
          const x0 = s.x - 5.2, x1 = s.x + 5.2, y0 = s.y - 6.4, y1 = s.y + 6.0, w = 0.09;
          B(x0, y0 - w, x1, y0 + w); B(x1 - w, y0, x1 + w, y1); B(x0 - w, y0, x0 + w, y1); B(x0, y1 - w, s.x - 0.8, y1 + w); B(s.x + 0.8, y1 - w, x1, y1 + w);
        }
        if (bd.well) C(at('well').x, at('well').y, 0.55);
        if (bd.coop) box('coop', 1.1, 0.8);
        if (bd.pen) { const p = at('pen'), w = 0.06; B(p.x - 1.3, p.y - 1.1 - w, p.x + 1.3, p.y - 1.1 + w); B(p.x - 1.3, p.y + 1.1 - w, p.x + 1.3, p.y + 1.1 + w); B(p.x - 1.3 - w, p.y - 1.1, p.x - 1.3 + w, p.y + 1.1); B(p.x + 1.3 - w, p.y - 1.1, p.x + 1.3 + w, p.y + 1.1); }
        if (bd.workshop) box('workshop', 2, 1.6);
        if (bd.shop) box('shop', 1.6, 0.8);
        if (bd.barn) box('barn', 3.6, 2.6);
      }
      return out;
    },
    // a coarse grid of shapes, rebuilt when the things in the world change
    grid(world, pl) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      let G = So._g;
      if (G && G.world === world && now - G.t < 400) return G;
      const s = pl && pl.stead;
      const key = [world.W, world.H, (world.sites || []).length, world.secrets ? world.secrets.list.length : 0, (world.caches || []).length, world.ruins.length, world.structures.length,
        world.camps.map(c => (c.alive ? 1 : 0) + (c.captives.length ? 2 : 0)).join(''), world.expedition && world.expedition.camp ? 1 : 0,
        s ? s.x + ',' + s.y + ':' + Object.keys(s.builds).sort().join('.') : '', (world.sites || []).filter(x => x.secret).length].join('|');
      if (G && G.world === world && G.key === key) { G.t = now; return G; }
      const CS = 8, cells = new Map();
      for (const sh of So.shapesOf(world, pl)) {
        // inflated by the widest body, so a lookup in one cell sees everything it could touch
        const P = 0.8, bx0 = (sh.c ? sh.c[0] - sh.c[2] : sh.b[0]) - P, by0 = (sh.c ? sh.c[1] - sh.c[2] : sh.b[1]) - P, bx1 = (sh.c ? sh.c[0] + sh.c[2] : sh.b[2]) + P, by1 = (sh.c ? sh.c[1] + sh.c[2] : sh.b[3]) + P;
        for (let cy = Math.floor(by0 / CS); cy <= Math.floor(by1 / CS); cy++) for (let cx = Math.floor(bx0 / CS); cx <= Math.floor(bx1 / CS); cx++) {
          const k = cy * 100000 + cx;
          let l = cells.get(k); if (!l) cells.set(k, l = []);
          l.push(sh);
        }
      }
      G = So._g = { world, key, t: now, CS, cells };
      return G;
    },
    // Does a body of radius r at (x, y) overlap anything solid?
    hit(world, x, y, r, pl) {
      if (x >= 9000 || !world.tiles) return false;
      const fx = Math.floor(x), fy = Math.floor(y);
      for (let ty = fy - 1; ty <= fy + 1; ty++) for (let tx = fx - 1; tx <= fx + 1; tx++) {
        const p = So.tileProp(world, tx, ty);
        if (p && (p.x - x) ** 2 + (p.y - y) ** 2 < (p.r + r) ** 2) return true;
      }
      const G = So.grid(world, pl || (ECHO.Game && ECHO.Game.world === world ? ECHO.Game.pl : null));
      const l = G.cells.get(Math.floor(y / G.CS) * 100000 + Math.floor(x / G.CS));
      if (!l) return false;
      for (const sh of l) {
        if (sh.c) { if ((sh.c[0] - x) ** 2 + (sh.c[1] - y) ** 2 < (sh.c[2] + r) ** 2) return true; }
        else {
          const nx = U.clamp(x, sh.b[0], sh.b[2]), ny = U.clamp(y, sh.b[1], sh.b[3]);
          if ((nx - x) ** 2 + (ny - y) ** 2 < r * r) return true;
        }
      }
      return false;
    },
    // A tile the path-finder should go around.
    blocksTile(world, x, y) { return So.hit(world, x + 0.5, y + 0.5, 0.05); }
  };
})();
