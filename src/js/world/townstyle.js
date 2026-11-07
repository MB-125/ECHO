// Every people builds its own way, and every crown its own towns.
//
// A town is laid out by the people who hold it (or, out in the far lands, the people who live
// there): its street plan, the shape of its houses, the stone and timber and plaster they are made
// of, the colour of the roofs, its paving, its walls, the trees in its gardens.
//
//   Valdren (the northern iron kingdom): stone towns on a grid of streets, slate roofs, braziers.
//   Ashmere (the southern river kingdom): white villas round a circle, terracotta roofs, gardens.
//   The Lantern (the holy order): a cross of processional ways about the temple, lanterns.
//   The Norren (the cold north): longhouses round a green about the great hall, turf roofs.
//   The Sarrad (the dry south): close-packed flat-roofed houses, domes, palms, a fountain square.
//   The Kesh (the eastern steppe): rings of round felt yurts on open ground, standards.
//   The Auren (the old western cities): a forum and colonnades, red tile, cypresses, statues.
//
// Each people has two plans, and each crown keeps to one of them (a duchy that broke away from
// Valdren builds Valdren's way, but its towns are not laid out like the old kingdom's), with
// roofs of its own colour.
//
// A town's way is kept on it (`s.style`: its people and plan); a world from before is laid out
// again once, as it loads: every building keeps what it is and who owns it, and your house,
// what you own, the statues to legends and the mills, mines and lumber camps stay where they are.
(function () {
  const { U } = ECHO;
  const T = () => ECHO.TILE;
  const Wd = () => ECHO.World;
  const h2 = (x, y, s) => ECHO.hash2(x, y, s);

  // ---------------------------------------------------------------- how each people builds
  const ARCH = {
    valdren: {
      name: 'Valdren stone', plans: ['grid', 'terraces'], pave: '#7c7a76', walls: 'stone', tree: 'pine', lamp: 'brazier', well: 'well',
      pal: {},
      roofs: ['#4a5a78', '#3e4654', '#5a4e6a'], house: ['house'], keep: 'keep', decor: ['brazier', 'standard']
    },
    ashmere: {
      name: 'Ashmere villas', plans: ['radial', 'garden'], pave: '#bcae90', walls: 'hedge', tree: 'willow', lamp: 'lamp', well: 'fountain',
      pal: { wall: '#ece4d4', plaster: '#efe6d6', stone: '#cabea8', wood: '#8a6a48', darkwood: '#5a4030', awning: '#5fae84' },
      roofs: ['#9a4a35', '#b8623a', '#8a3a2e'], house: ['h_ash'], keep: 'k_ash', decor: ['flowers', 'bush']
    },
    lantern: {
      name: 'Lantern halls', plans: ['cross'], pave: '#cbbf9e', walls: 'low', tree: 'oak', lamp: 'lanternpost', well: 'fountain',
      pal: { wall: '#e6dcc4', plaster: '#eee2c8', stone: '#b8ab8e', wood: '#7a5a3a', darkwood: '#4a3424', awning: '#e6c06a' },
      roofs: ['#b08a3a', '#c09a48'], house: ['h_lan'], keep: 'keep', decor: ['lanternpost', 'flowers']
    },
    norren: {
      name: 'Norren longhouses', plans: ['ring', 'rows'], pave: '#6e6252', earth: true, walls: 'stakes', tree: 'pine', lamp: 'brazier', well: 'well',
      pal: { wall: '#5e4a36', plaster: '#6a5440', stone: '#6a6660', wood: '#5a4432', darkwood: '#2e241c', awning: '#8a3a2a' },
      roofs: ['#5d6a3e', '#4e5a34', '#6a5a3a'], house: ['h_nor'], keep: 'k_nor', decor: ['totem', 'brazier']
    },
    sarrad: {
      name: 'Sarrad clay', plans: ['courtyard', 'oasis'], pave: '#d6c094', walls: 'mud', tree: 'palm', lamp: 'lamp', well: 'fountain',
      pal: { wall: '#d8bf94', plaster: '#e2cca2', stone: '#c4a878', wood: '#8a6440', darkwood: '#5a3e28', awning: '#c8503a' },
      roofs: ['#c8ae80', '#b89a6c'], domes: ['#3a7ab0', '#c8a040', '#e8e0d0'], house: ['h_sar', 'h_sar2'], keep: 'k_sar', decor: ['palm', 'awning']
    },
    kesh: {
      name: 'Kesh yurts', plans: ['camp', 'horde'], pave: '#8a7a5a', earth: true, walls: 'standards', tree: null, lamp: 'brazier', well: 'well',
      pal: { wall: '#ebe3cf', plaster: '#e4dac4', stone: '#8a8070', wood: '#7a5a3a', darkwood: '#4a3424', awning: '#c84a3a' },
      roofs: ['#d8ccb0', '#c8b898', '#b8a888'], house: ['h_kes'], keep: 'k_kes', decor: ['post', null]
    },
    auren: {
      name: 'Auren marble', plans: ['forum', 'grid'], pave: '#d2cbbb', walls: 'marble', tree: 'cypress', lamp: 'lamp', well: 'fountain',
      pal: { wall: '#ece6da', plaster: '#f0eadf', stone: '#d8d0c0', wood: '#7a5a3a', darkwood: '#4a3424', awning: '#b4553a' },
      roofs: ['#b4553a', '#a8482e', '#c06a44'], house: ['h_aur'], keep: 'k_aur', decor: ['statue', 'flowers']
    }
  };

  // ---------------------------------------------------------------- the street plans
  // pave(dx, dy, P): 2 = a square, avenue or plaza nothing is built on; 1 = a street a great
  // building may stand across; 0 = ground to build on. A house's door (on its south side) opens
  // onto a street, or (on open ground, `earth`) onto anything it can be walked on.
  const mod = (a, n) => ((a % n) + n) % n;
  const circ = (dx, dy) => Math.sqrt(dx * dx + dy * dy);
  const cheb = (dx, dy) => Math.max(Math.abs(dx), Math.abs(dy));
  const PLANS = {
    // straight streets and square blocks round a square: the iron kingdom's way
    grid: {
      word: 'a grid of stone streets about a square', shape: 'square', gap: 1, dist: cheb,
      pave(dx, dy, P) { const ax = Math.abs(dx), ay = Math.abs(dy); if (ax <= P && ay <= P) return 2; if (ax <= 1) return 2; if (ay > P && mod(dy, 4) === 0) return 1; if (ax > P && mod(dx, 13) === 0) return 1; return 0; }
    },
    // long terraced rows wall to wall, a diamond of streets: the same people, another crown
    terraces: {
      word: 'terraced rows wall to wall', shape: 'diamond', gap: 0, dist: (dx, dy) => (Math.abs(dx) + Math.abs(dy)) * 0.72,
      pave(dx, dy, P) { const ax = Math.abs(dx), ay = Math.abs(dy); if (ax + ay <= P + 1) return 2; if (ax === 0) return 2; if (mod(dy, 4) === 0) return 1; if (mod(dx, 10) === 5) return 1; return 0; }
    },
    // a round square, ring streets and spokes like a wheel
    radial: {
      word: 'ring streets and spokes about a round square', shape: 'circle', gap: 1, dist: circ, open: true, rings: [9.8, 14.8, 19.8, 24.8],
      pave(dx, dy, P) {
        const d = circ(dx, dy); if (d <= P + 0.5) return 2;
        for (const r of [7.5, 12.5, 17.5, 22.5]) if (Math.abs(d - r) < 0.62) return 1;
        const a = Math.atan2(dy, dx); for (let k = 0; k < 8; k++) { const b = k * Math.PI / 4; if (Math.abs(Math.sin(a - b)) * d < 0.7 && Math.cos(a - b) > 0) return k % 2 ? 1 : 2; }
        return 0;
      }
    },
    // villas each in its garden, along winding lanes
    garden: {
      word: 'villas in gardens along winding lanes', shape: 'circle', gap: 2, dist: circ,
      pave(dx, dy, P) { const d = circ(dx, dy); if (d <= P + 0.4) return 2; if (Math.abs(dx) === 0) return 2; if (mod(dy - Math.round(1.6 * Math.sin(dx / 3.4)), 6) === 0) return 1; return 0; }
    },
    // the processional ways crossing at the temple, and lanes in the four quarters
    cross: {
      word: 'two processional ways crossing at the temple', shape: 'circle', gap: 1, dist: circ,
      pave(dx, dy, P) { const ax = Math.abs(dx), ay = Math.abs(dy); if (ax <= P && ay <= P) return 2; if (ax <= 1 || ay <= 1) return 2; if (mod(dy, 4) === 0) return 1; return 0; }
    },
    // longhouses about a green, round the great hall: rings of beaten earth
    ring: {
      word: 'longhouses about a green round the great hall', shape: 'circle', gap: 2, dist: circ, earth: true, rings: [8.5, 13.5, 18.5],
      pave(dx, dy, P) { const d = circ(dx, dy); if (d <= P - 0.5) return 2; for (const r of [7, 12, 17]) if (Math.abs(d - r) < 0.6) return 1; if ((Math.abs(dx) === 0 || Math.abs(dy) === 0) && d > P) return 1; return 0; }
    },
    // longhouses in long rows, each row a little askew
    rows: {
      word: 'long rows of longhouses', shape: 'ellipse', gap: 2, dist: (dx, dy) => Math.sqrt(dx * dx * 0.55 + dy * dy * 1.3), earth: true,
      pave(dx, dy, P) { if (circ(dx, dy) <= P) return 2; if (mod(dy, 5) === 0) return 1; if (dx === 0) return 1; return 0; }
    },
    // houses wall to wall, narrow alleys, a bazaar street and a fountain square
    courtyard: {
      word: 'close-packed houses, alleys and a bazaar', shape: 'square', gap: 0, dist: cheb,
      pave(dx, dy, P) { const ax = Math.abs(dx), ay = Math.abs(dy); if (ax <= P && ay <= P) return 2; if (dy === 0 || dy === 1) return 2; if (mod(dy, 4) === 0) return 1; if (mod(dx, 7) === 0) return 1; return 0; }
    },
    // a great round pool among palms, and the houses packed round it
    oasis: {
      word: 'packed houses about a pool among palms', shape: 'circle', gap: 0, dist: circ,
      pave(dx, dy, P) { const d = circ(dx, dy); if (d <= P + 2) return 2; if (Math.abs(d - (P + 3)) < 0.7) return 2; if (mod(dy, 4) === 0) return 1; if (mod(dx, 8) === 0) return 1; return 0; }
    },
    // rings of yurts on open ground about the khan's great yurt
    camp: {
      word: 'rings of yurts on open ground', shape: 'circle', gap: 1, dist: circ, earth: true, rings: [7, 11, 15, 19],
      pave(dx, dy, P) { const d = circ(dx, dy); if (d <= P - 0.5) return 2; if ((Math.abs(dx) <= 0 || Math.abs(dy) <= 0) && d > P) return 1; return 0; }
    },
    // the yurts of each clan in its own circle, about the khan's
    horde: {
      word: 'each clan\'s yurts in its own circle', shape: 'circle', gap: 1, dist: circ, earth: true, clusters: 5,
      pave(dx, dy, P) { const d = circ(dx, dy); if (d <= P - 0.5) return 2; if ((Math.abs(dx) === 0 || Math.abs(dy) === 0) && d > P) return 1; return 0; }
    },
    // a great forum, the cardo and the decumanus, and square blocks
    forum: {
      word: 'a forum, colonnaded avenues and square blocks', shape: 'square', gap: 1, dist: cheb,
      pave(dx, dy, P) { const ax = Math.abs(dx), ay = Math.abs(dy); if (ax <= P + 2 && ay <= P) return 2; if (ax <= 1 || ay <= 0) return 2; if (mod(dy, 4) === 0) return 1; if (mod(dx, 9) === 0) return 1; return 0; }
    }
  };
  // the old crowns keep the plan they always had
  const FIXED = { valdren: 'grid', ashmere: 'radial', lantern: 'cross' };

  const TS = ECHO.TownStyle = {
    ARCH, PLANS, V: 1,
    // ------------------------------------------------------------ whose way
    power(f) { return !!f && !f.fallen && (f.type === 'kingdom' || f.type === 'order'); },
    planOf(f, culture, world) {
      const A = ARCH[culture] || ARCH.valdren;
      if (FIXED[f.id] && A.plans.includes(FIXED[f.id])) return FIXED[f.id];
      // a crown that broke from one of the old ones builds its people's way, but not its old masters' plan
      if (FIXED[culture] && A.plans.length > 1) return A.plans.find(p => p !== FIXED[culture]);
      // a crown of the far lands keeps the way its seat was built
      const seat = world && f.capital && ECHO.Sim && ECHO.Sim.settlement(world, f.capital);
      if (seat && seat.style) { const p = TS.parse(seat.style); if (p.c === culture) return p.p; }
      return A.plans[ECHO.hashStr('plan:' + f.id) % A.plans.length];
    },
    // the way a town is built now: by the crown that holds it, or by the people out that way
    styleFor(world, s) {
      const f = world.factions && world.factions[s.faction];
      let far = false;
      if (ECHO.Realms && ECHO.Realms.farFromHeart && ECHO.Realms.cultureAt && world.settlements && !(f && f.farRealm)) { try { far = ECHO.Realms.farFromHeart(world, s); } catch (e) { /* (before the realms) */ } }
      if (TS.power(f) && !far) { const c = ARCH[f.culture] ? f.culture : 'valdren'; return c + ':' + TS.planOf(f, c, world); }
      // out in the far lands, before a crown of their own people gathers them: their people's way
      let c = 'valdren';
      if (far) c = ECHO.Realms.cultureAt(world, s.x, s.y);
      const A = ARCH[c] || ARCH.valdren;
      return c + ':' + A.plans[ECHO.hashStr('plan:' + Math.floor(s.x / 90) + ',' + Math.floor(s.y / 70)) % A.plans.length];
    },
    _ps: {},
    parse(st) {
      if (!st) return { c: 'valdren', p: 'grid' };
      let o = TS._ps[st];
      if (!o) { const [c, p] = st.split(':'); o = TS._ps[st] = { c: ARCH[c] ? c : 'valdren', p: PLANS[p] ? p : 'grid' }; }
      return o;
    },
    arch(s) { return ARCH[TS.parse(s && s.style).c]; },
    layoutOf(s) { return PLANS[TS.parse(s && s.style).p]; },
    // the roof colour of a town's houses: its people's, in the shade its crown keeps
    roof(world, s) {
      const A = TS.arch(s), f = world.factions[s.faction];
      if (!f) return A.roofs[0];
      if (FIXED[f.id] && ARCH[f.id] === A) return A.roofs[0];
      // (the first shade is the old crown's own; another crown of its people takes another)
      const c = TS.parse(s.style).c;
      if (FIXED[c] && A.roofs.length > 1) return A.roofs[1 + ECHO.hashStr('roof:' + f.id) % (A.roofs.length - 1)];
      return A.roofs[ECHO.hashStr('roof:' + f.id) % A.roofs.length];
    },
    // what a building is drawn as, in its town's way
    model(s, b) {
      const A = TS.arch(s);
      switch (b.type) {
        case 'house': return b.legend ? 'house' : A.house[A.house.length > 1 ? ECHO.hashStr(b.id) % A.house.length : 0];
        case 'keep': return A.keep;
        case 'well': return A.well;
        case 'lamp': return b.tower ? 'lamp' : A.lamp;
        default: return null;
      }
    },
    describe(s) { const A = TS.arch(s), P = TS.layoutOf(s); return `${A.name} — ${P.word}`; },

    // ------------------------------------------------------------ laying a town out
    // items: [{ b, w, h }] in the order they are to be placed; the rest of the ground is read from
    // the world. Returns the buildings it could not place (none, almost always).
    place(world, s, items, o) {
      o = o || {};
      // (as far out as the town is likely to need, and no further: the whole of it is looked over)
      if (!o.E) {
        let area = 0;
        for (const it of items) area += (it.b.w + 1.5) * (it.b.h + 1.5);
        for (const b of o.pinned || []) if (!b.fac) area += (b.w + 1) * (b.h + 1);
        const E0 = Math.max(16, Math.min(30, Math.ceil(Math.sqrt(area * 2.8 / Math.PI) + 7)));
        const R0 = TS.place(world, s, items, Object.assign({}, o, { E: E0 }));
        if (!R0.left.length || E0 >= 30) return R0;
        return TS.place(world, s, items, Object.assign({}, o, { E: 30 }));
      }
      const Tl = T(), P0 = TS.parse(s.style), PL = PLANS[P0.p], E = o.E, N = 2 * E + 1;
      const cap = s.kind === 'capital' || s.kind === 'temple';
      const P = PL.earth ? (cap ? 4 : 3) : cap ? 3 : 2;
      const at = (dx, dy) => (dy + E) * N + (dx + E);
      // the ground: 0 open, 1 not to be built on (water, rock, another's land, things standing there)
      const ground = new Uint8Array(N * N), pave = new Uint8Array(N * N), occ = new Uint8Array(N * N);
      const others = (world.settlements || []).filter(o2 => o2 !== s && Math.abs(o2.x - s.x) < 2 * E + 8 && Math.abs(o2.y - s.y) < 2 * E + 8);
      const near = (world.sites || []).filter(q => Math.abs(q.x - s.x) < E + 4 && Math.abs(q.y - s.y) < E + 4);
      const stuff = [];
      for (const c of world.secrets ? world.secrets.list : []) if (Math.abs(c.x - s.x) < E + 3 && Math.abs(c.y - s.y) < E + 3) stuff.push([c.x, c.y, 2.2]);
      for (const c of world.caches || []) if (Math.abs(c.x - s.x) < E + 3 && Math.abs(c.y - s.y) < E + 3) stuff.push([c.x, c.y, 1.2]);
      for (const c of world.camps || []) if (Math.abs(c.x - s.x) < E + 6 && Math.abs(c.y - s.y) < E + 6) stuff.push([c.x, c.y, 5]);
      for (const c of world.ruins || []) if (Math.abs(c.x - s.x) < E + 7 && Math.abs(c.y - s.y) < E + 7) stuff.push([c.x, c.y, 7]);
      const pl = world.player, st = pl && pl.stead;
      if (st && Math.abs(st.x - s.x) < E + 8 && Math.abs(st.y - s.y) < E + 8) stuff.push([st.x, st.y, 8]);
      const keepOut = o.keepOut || new Set();
      for (let dy = -E; dy <= E; dy++) for (let dx = -E; dx <= E; dx++) {
        const x = s.x + dx, y = s.y + dy, i = at(dx, dy), t = Wd().tile(world, x, y);
        let bad = t === Tl.WATER || t === Tl.DEEP || t === Tl.ROCK || t === Tl.RUIN || t === Tl.RUINWALL || t === Tl.BRIDGE || t === Tl.ROAD || (t === Tl.FARM && !o.farms);
        if (!bad && world.blocked) { const wx = world.globe ? mod(x, world.W) : x; if (wx >= 0 && y >= 0 && wx < world.W && y < world.H && ((world.blocked[y * world.W + wx] && !keepOut.has(y * world.W + wx)) || (o.avoid && o.avoid.has(y * world.W + wx)))) bad = true; }
        if (!bad && others.length) { const ds = Math.sqrt(dx * dx + dy * dy) + 1, d2 = ds * ds; for (const q of others) { const qx = q.x - x, qy = q.y - y; if (qx * qx + qy * qy < d2) { bad = true; break; } } }
        if (!bad) for (const q of near) if (Math.abs(q.x - 0.5 - x) < 3 && Math.abs(q.y - 0.5 - y) < 3) { bad = true; break; }
        if (!bad) for (const q of stuff) if (Math.abs(q[0] - x) < q[2] && Math.abs(q[1] - y) < q[2]) { bad = true; break; }
        ground[i] = bad ? 1 : 0;
        pave[i] = PL.pave(dx, dy, P);
      }
      // the heart of every town: the well, and the ground below it where its roads come in (kept open)
      for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 1; dx++) { if (pave[at(dx, dy)] < 2) pave[at(dx, dy)] = 2; if (dy >= 0) occ[at(dx, dy)] = 3; }
      occ[at(0, 0)] = 0;
      // what stays where it is (your house, what you own, the legends' statues, the works outside), and the doors of it
      for (const b of o.pinned || []) {
        for (let yy = b.y; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) {
          const dx = xx - s.x, dy = yy - s.y; if (Math.abs(dx) <= E && Math.abs(dy) <= E) occ[at(dx, dy)] = 2;
        }
        if (b.w > 1 || b.h > 1) { const dx = b.x + Math.floor(b.w / 2) - s.x, dy = b.y + b.h - s.y; if (Math.abs(dx) <= E && Math.abs(dy) <= E && !occ[at(dx, dy)]) occ[at(dx, dy)] = 3; }
      }
      // the places a building of w×h may stand, best first
      const jseed = (world.seed || 0) + ECHO.hashStr(s.id) % 997, jt = new Float32Array(N * N);
      for (let dy = -E; dy <= E; dy++) for (let dx = -E; dx <= E; dx++) { let h = Math.imul((dx + 101) * 374761393 + (dy + 37) * 668265263 + jseed, 1274126177); h ^= h >>> 13; h = Math.imul(h, 1103515245); jt[at(dx, dy)] = ((h >>> 8) & 65535) / 65536; }
      const jit = (dx, dy) => (dx >= -E && dy >= -E && dx <= E && dy <= E ? jt[at(dx, dy)] : 0.5);
      const score = (cx, cy) => {
        const d = PL.dist(cx, cy);
        if (PL.rings) { let m = 99; for (const r of PL.rings) m = Math.min(m, Math.abs(Math.sqrt(cx * cx + cy * cy) - r)); return m * 2.2 + d * 0.18 + jit(cx | 0, cy | 0) * 0.8; }
        if (PL.clusters) {
          let m = Math.sqrt(cx * cx + cy * cy) * 0.5 + 2;
          const k0 = ECHO.hashStr('cl:' + s.id);
          for (let k = 0; k < PL.clusters; k++) { const a = (k / PL.clusters) * Math.PI * 2 + (k0 % 100) / 16, r = 11 + (k % 2) * 4; m = Math.min(m, Math.sqrt((cx - Math.cos(a) * r) ** 2 + (cy - Math.sin(a) * r) ** 2) + r * 0.1); }
          return m + jit(cx | 0, cy | 0) * 0.8;
        }
        return d + jit(cx | 0, cy | 0) * 0.9;
      };
      const cands = {};
      // (the great hall, the keep, the temple: as near the heart as it will go, just north of it)
      const greatScore = (cx, cy, h) => Math.sqrt(cx * cx + (cy + h / 2 + 1) ** 2) + jit(cx | 0, cy | 0) * 0.2;
      const candsFor = (w, h, great) => {
        const k = w + 'x' + h + (great ? 'g' : '');
        if (cands[k]) return cands[k];
        // (sorted as plain numbers: the score above, the place below — no garbage, no comparator)
        const nx = 2 * E + 1 - w, ny = 2 * E + 1 - h, keys = new Float64Array(nx * ny);
        let n = 0;
        for (let y0 = -E; y0 <= E - h; y0++) for (let x0 = -E; x0 <= E - w; x0++) {
          const cx = x0 + w / 2 - 0.5, cy = y0 + h / 2 - 0.5;
          if (cx * cx + cy * cy > E * E) continue;     // (the corners of the square are never reached)
          const sc = great ? greatScore(cx, cy, h) : score(cx, cy);
          keys[n++] = Math.round(sc * 1000) * 65536 + (y0 + E) * 256 + (x0 + E);
        }
        const out = new Int16Array(n * 2);
        const ks = keys.subarray(0, n);
        ks.sort();
        for (let i = 0; i < n; i++) { const p = ks[i] % 65536; out[i * 2] = (p & 255) - E; out[i * 2 + 1] = (p >> 8) - E; }
        return (cands[k] = out);
      };
      const inG = (dx, dy) => dx >= -E && dy >= -E && dx <= E && dy <= E;
      const fits = (x0, y0, w, h, small, tiny, great) => {
        for (let yy = y0; yy < y0 + h; yy++) for (let xx = x0; xx < x0 + w; xx++) {
          if (!inG(xx, yy)) return false;
          const i = at(xx, yy);
          if (ground[i] || occ[i]) return false;
          if ((pave[i] === 2 && !(great && PL.earth)) || (pave[i] === 1 && (small || tiny))) return false;
        }
        const g = tiny ? 0 : PL.gap;
        if (g) for (let yy = y0 - g; yy < y0 + h + g; yy++) for (let xx = x0 - g; xx < x0 + w + g; xx++) {
          if (yy >= y0 && yy < y0 + h && xx >= x0 && xx < x0 + w) continue;
          if (inG(xx, yy) && occ[at(xx, yy)] === 2) return false;
        }
        if (tiny) {
          // a lamp, a board, a statue: beside a street, not on it
          for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (inG(x0 + ax, y0 + ay) && pave[at(x0 + ax, y0 + ay)] && !occ[at(x0 + ax, y0 + ay)] && !ground[at(x0 + ax, y0 + ay)]) return true;
          return false;
        }
        // the door, on the south side: onto a street (or open ground, out on the steppe and in the north)
        const ddx = x0 + Math.floor(w / 2), ddy = y0 + h;
        if (!inG(ddx, ddy)) return false;
        const di = at(ddx, ddy);
        if (ground[di] || occ[di] === 2) return false;
        if (!PL.earth && !PL.open && !pave[di]) return false;
        return true;
      };
      const claim = (x0, y0, w, h, tiny) => {
        for (let yy = y0; yy < y0 + h; yy++) for (let xx = x0; xx < x0 + w; xx++) occ[at(xx, yy)] = 2;
        if (!tiny) { const di = at(x0 + Math.floor(w / 2), y0 + h); if (!occ[di]) occ[di] = 3; }
      };
      const left = [];
      for (const it of items) {
        const { b } = it, w = b.w, h = b.h, tiny = w === 1 && h === 1, small = !tiny && w <= 3 && h <= 3, great = b.type === 'keep' || b.type === 'temple';
        let done = false;
        // the well at the very heart
        if (b.type === 'well' && !occ[at(0, 0)] && !ground[at(0, 0)]) { b.x = s.x; b.y = s.y; occ[at(0, 0)] = 2; continue; }
        const cs = candsFor(w, h, great);
        for (let ci = 0; ci < cs.length; ci += 2) {
          const x0 = cs[ci], y0 = cs[ci + 1];
          if (!fits(x0, y0, w, h, small, tiny, great)) continue;
          claim(x0, y0, w, h, tiny);
          b.x = s.x + x0; b.y = s.y + y0; done = true;
          break;
        }
        if (!done) left.push(it);
      }
      return { left, pave, occ, ground, E, N, at, P, PL };
    },
    // the ground of a planned town, made: its streets paved, the old paving and the woods inside it
    // gone, its fields in a ring about it (moved out, the same number of them, if they were in the way)
    groundOf(world, s, R, o) {
      const Tl = T(), { pave, occ, ground, E, at } = R;
      // how far the town reaches
      let reach = 6;
      for (const b of s.buildings) { if (b.fac) continue; const d = R.PL.dist(b.x + b.w / 2 - 0.5 - s.x, b.y + b.h / 2 - 0.5 - s.y) + Math.max(b.w, b.h) / 2; if (d > reach && d < E) reach = d; }
      reach = Math.min(E - 1, reach + 1.2);
      s.reach = Math.round(reach * 10) / 10;
      // the streets are paved where there are houses on them (a square and its avenues all the way)
      const N = R.N, nearB = new Uint8Array(N * N);
      for (let dy = -E; dy <= E; dy++) for (let dx = -E; dx <= E; dx++) {
        if (occ[at(dx, dy)] !== 2) continue;
        for (let yy = Math.max(-E, dy - 2); yy <= Math.min(E, dy + 2); yy++) for (let xx = Math.max(-E, dx - 2); xx <= Math.min(E, dx + 2); xx++) nearB[at(xx, yy)] = 1;
      }
      for (let dy = -E; dy <= E; dy++) for (let dx = -E; dx <= E; dx++) {
        const i = at(dx, dy), x = s.x + dx, y = s.y + dy, t = Wd().tile(world, x, y);
        if (ground[i]) continue;
        const inside = R.PL.dist(dx, dy) <= reach;
        if (occ[i] === 2) { if (t === Tl.TREE || t === Tl.FOREST || t === Tl.SWAMP || t === Tl.FARM || t === Tl.PLAZA) Wd().setTile(world, x, y, Tl.GRASS); continue; }
        const paved = occ[i] === 3 || (pave[i] === 2 && (nearB[i] || R.PL.dist(dx, dy) <= R.P + 1.5)) || (pave[i] === 1 && nearB[i]);
        if (inside && paved) { if (t !== Tl.FARM || o.farms) Wd().setTile(world, x, y, Tl.PLAZA); continue; }
        if (t === Tl.PLAZA) Wd().setTile(world, x, y, Tl.GRASS);
        // (the woods inside go; a field stays where it was unless a house now stands right by it)
        else if (inside && (t === Tl.TREE || t === Tl.FOREST || t === Tl.SWAMP || (t === Tl.FARM && o.farms && nearB[i]))) Wd().setTile(world, x, y, Tl.GRASS);
      }
      return reach;
    },
    // the fields about a town: a ring outside it (n of them, or as many as the old pattern gives)
    // (from the outer houses outward: the nearest ground first, between the last houses and beyond)
    fields(world, s, reach, n) {
      const Tl = T();
      const r0 = Math.max(8, reach * 0.55), r1 = reach + 13, out = [];
      const others = world.settlements.filter(o => o !== s && Math.abs(o.x - s.x) < 2 * r1 + 4 && Math.abs(o.y - s.y) < 2 * r1 + 4);
      for (let dy = -Math.ceil(r1); dy <= Math.ceil(r1); dy++) for (let dx = -Math.ceil(r1); dx <= Math.ceil(r1); dx++) {
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < r0 || d > (n == null ? r0 + 6.5 : r1)) continue;
        const x = s.x + dx, y = s.y + dy, t = Wd().tile(world, x, y);
        if (!(t === Tl.GRASS || t === Tl.FOREST)) continue;
        if (world.blocked) { const wx = world.globe ? mod(x, world.W) : x; if (wx >= 0 && y >= 0 && wx < world.W && y < world.H && world.blocked[y * world.W + wx]) continue; }
        if (h2(x >> 1, y >> 2, world.seed + 7) >= 0.62) continue;
        const dd = (d + 2) * (d + 2);
        if (others.some(o => (o.x - x) * (o.x - x) + (o.y - y) * (o.y - y) < dd)) continue;
        // (just beyond the last houses first; then between the outer houses; only then further out)
        out.push([x, y, d >= reach + 1 && d <= reach + 6 ? d - 200 : d < reach + 1 ? 100 - d : d]);
      }
      out.sort((a, b) => a[2] - b[2]);
      const k = n == null ? out.length : Math.min(n, out.length);
      for (let i = 0; i < k; i++) Wd().setTile(world, out[i][0], out[i][1], Tl.FARM);
      return k;
    },
    // somewhere in the town for a building the plan had no lot for (round the heart, anywhere free)
    loose(world, s, b, R) {
      const { occ, ground, at, E } = R;
      for (let t = 0; t < 600; t++) {
        const a = t * 2.399, d = 4 + t * 0.035;
        const x0 = Math.round(Math.cos(a) * d - b.w / 2), y0 = Math.round(Math.sin(a) * d - b.h / 2);
        let ok = true;
        for (let yy = y0 - 1; yy <= y0 + b.h && ok; yy++) for (let xx = x0 - 1; xx <= x0 + b.w && ok; xx++) {
          if (xx < -E || yy < -E || xx > E || yy > E) { ok = false; break; }
          const i = at(xx, yy);
          if (ground[i] || occ[i] === 2 || (occ[i] === 3 && yy < y0 + b.h && yy >= y0)) ok = false;
        }
        if (!ok) continue;
        for (let yy = y0; yy < y0 + b.h; yy++) for (let xx = x0; xx < x0 + b.w; xx++) occ[at(xx, yy)] = 2;
        b.x = s.x + x0; b.y = s.y + y0;
        return true;
      }
      return false;
    },
    // ------------------------------------------------------------ a town from before, laid out again
    pinned(world, s, b) {
      const pl = world.player;
      return !!(b.fac || b.legend || b.ruined || b.type === 'stocks' || (pl && (b.id === pl.houseId || b.owner === pl.charId || b.tenant === pl.charId)) || (b.type === 'statue' && b.legend));
    },
    replan(world, s, style) {
      const Tl = T(), W = world.W;
      s.style = style || TS.styleFor(world, s);
      // (every town has a well at its heart: the first towns were drawn without one)
      if (!s.buildings.some(b => b.type === 'well')) s.buildings.push({ id: s.id + '_well', type: 'well', x: s.x, y: s.y, w: 1, h: 1 });
      const keep = s.buildings.filter(b => TS.pinned(world, s, b));
      const move = s.buildings.filter(b => !TS.pinned(world, s, b));
      if (!move.length) return false;
      const old = new Map(move.map(b => [b, { x: b.x, y: b.y }]));
      // the ground the moved buildings stood on is free to plan on
      const keepOut = new Set();
      for (const b of move) for (let yy = b.y; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) { const wx = world.globe ? mod(xx, W) : xx; keepOut.add(yy * W + wx); }
      // the roads that end here are cut back to the town's edge and led in again along its streets
      const core = s.kind === 'capital' || s.kind === 'temple' ? 19 : 16;
      const roads = (world.roads || []).filter(r => (r.a === s.id || r.b === s.id) && Array.isArray(r.path) && r.path.length > 2);
      // (a road only passing by, between two other towns, stays where it is)
      const passing = new Set();
      for (const r of world.roads || []) {
        if (r.a === s.id || r.b === s.id || !Array.isArray(r.path)) continue;
        for (const i of r.path) { const x = i % W, y = (i / W) | 0; if (Math.abs(x - s.x) <= core + 1 && Math.abs(y - s.y) <= core + 1) passing.add(i); }
      }
      const lifted = [];
      for (let dy = -core; dy <= core; dy++) for (let dx = -core; dx <= core; dx++) {
        if (dx * dx + dy * dy > core * core) continue;
        const x = s.x + dx, y = s.y + dy, wx = world.globe ? mod(x, W) : x;
        if (Wd().tile(world, x, y) === Tl.ROAD && !passing.has(y * W + wx)) { lifted.push([x, y]); Wd().setTile(world, x, y, Tl.GRASS); }
      }
      // the fields in the way are counted, and laid again outside
      let farmsIn = 0;
      for (let dy = -core; dy <= core; dy++) for (let dx = -core; dx <= core; dx++) if (dx * dx + dy * dy <= core * core && Wd().tile(world, s.x + dx, s.y + dy) === Tl.FARM) farmsIn++;
      // the order: the heart, the great buildings, then the rest
      const RANK = { well: 0, keep: 1, temple: 1, inn: 2, market: 3, archive: 4, smithy: 5, shrine: 6, board: 7, house: 8, statue: 9, lamp: 10 };
      const items = move.slice().sort((a, b) => (RANK[a.type] ?? 9) - (RANK[b.type] ?? 9) || (a.id < b.id ? -1 : 1)).map(b => ({ b }));
      const R = TS.place(world, s, items, { farms: true, keepOut, pinned: keep, avoid: passing });
      let lost = 0;
      for (const it of R.left) {
        if (TS.loose(world, s, it.b, R)) continue;
        const o0 = old.get(it.b); it.b.x = o0.x; it.b.y = o0.y; lost++;   // (it stays where it stood)
      }
      // the farm tiles the town now stands on are laid again beyond it
      let farmsAfter = 0;
      const reach = TS.groundOf(world, s, R, { farms: true });
      for (let dy = -core; dy <= core; dy++) for (let dx = -core; dx <= core; dx++) if (dx * dx + dy * dy <= core * core && Wd().tile(world, s.x + dx, s.y + dy) === Tl.FARM) farmsAfter++;
      if (farmsIn > farmsAfter) TS.fields(world, s, reach, farmsIn - farmsAfter);
      // the roads, led in again
      Wd().rebuildBlocked(world);
      for (const r of roads) TS.reroute(world, s, r, core, lifted);
      // its mill out among the fields, past the last houses (if there is ground for it out there)
      for (const b of keep) {
        if (b.type !== 'mill' || !b.fac || !ECHO.Production || !ECHO.Production.findSpot) continue;
        const i = s.buildings.indexOf(b); s.buildings.splice(i, 1); Wd().rebuildBlocked(world);
        const sp = ECHO.Production.findSpot(world, s, 'mill', null);
        if (sp && U.dist(sp.x, sp.y, s.x, s.y) > U.dist(b.x, b.y, s.x, s.y)) { b.x = sp.x; b.y = sp.y; for (let yy = b.y; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) if (Wd().tile(world, xx, yy) !== Tl.GRASS) Wd().setTile(world, xx, yy, Tl.GRASS); }
        s.buildings.splice(i, 0, b); Wd().rebuildBlocked(world);
      }
      void lost;
      return true;
    },
    reroute(world, s, r, core, lifted) {
      const Tl = T(), W = world.W, path = r.path, atA = r.a === s.id;
      const inCore = i => { const x = i % W, y = (i / W) | 0; return U.dist(x, y, s.x, s.y) <= core - 0.5; };
      // the last tile of the road before it comes into the town
      let k = -1;
      if (atA) { for (let j = 0; j < path.length; j++) if (!inCore(path[j])) { k = j; break; } }
      else { for (let j = path.length - 1; j >= 0; j--) if (!inCore(path[j])) { k = j; break; } }
      if (k < 0) return false;
      const ex = path[k] % W, ey = (path[k] / W) | 0;
      const cost = (x, y, i) => {
        const t = world.tiles[i];
        if (world.blocked && world.blocked[i]) return Infinity;
        if (t === Tl.ROAD || t === Tl.BRIDGE) return 0.35;
        if (t === Tl.PLAZA) return 0.3;
        if (t === Tl.GRASS || t === Tl.FARM) return 1.4;
        if (t === Tl.SAND || t === Tl.FOREST) return 1.8;
        if (t === Tl.TREE || t === Tl.HILL || t === Tl.SNOW || t === Tl.SWAMP) return 3;
        if (t === Tl.WATER) return 14;
        if (t === Tl.DEEP || t === Tl.ROCK) return Infinity;
        return 2;
      };
      const seg = Wd().findPath(world, s.x, s.y + 1, ex, ey, cost, 40000);
      if (!seg) {
        // (no way through: the old road comes back as it was, under no building)
        for (const [x, y] of lifted) { const wx = world.globe ? mod(x, W) : x; if (!(world.blocked && world.blocked[y * W + wx]) && Wd().tile(world, x, y) === Tl.GRASS) Wd().setTile(world, x, y, Tl.ROAD); }
        return false;
      }
      for (const i of seg) { const t = world.tiles[i]; if (t === Tl.WATER || t === Tl.DEEP) world.tiles[i] = Tl.BRIDGE; else if (t !== Tl.PLAZA && t !== Tl.BRIDGE) world.tiles[i] = Tl.ROAD; }
      // seg runs from the heart out to the edge
      if (atA) r.path = seg.slice(0, -1).concat(path.slice(k));
      else r.path = path.slice(0, k).concat(seg.slice().reverse());
      r.len = r.path.length;
      return true;
    },
    // once, for a world from before: every town laid out in the way of those who hold it
    ensure(world) {
      if (!world || !world.settlements) return;
      const S0 = world.townStyle;
      if (S0 && S0.v >= TS.V && world.settlements.every(s => s.style)) return;
      let n = 0;
      for (const s of world.settlements) {
        if (s.style) continue;
        try { if (TS.replan(world, s)) n++; else s.style = TS.styleFor(world, s); } catch (err) { s.style = s.style || TS.styleFor(world, s); if (typeof console !== 'undefined') console.error('ECHO: a town could not be laid out again', s.id, err); }
      }
      world.townStyle = { v: TS.V, day: world.day, n: (S0 && S0.n || 0) + n };
      Wd().rebuildBlocked(world);
      world._dgH = null; world._routes = {};
      if (ECHO.Realm && ECHO.Realm.reshaped) ECHO.Realm.reshaped(world);
      // you, if a house now stands where you stood
      const pl = world.player;
      if (pl && n && isFinite(pl.x) && pl.x < 9000) {
        const fx = Math.floor(pl.x), fy = Math.floor(pl.y), wx = world.globe ? mod(fx, world.W) : fx;
        if (fy >= 0 && fy < world.H && wx >= 0 && wx < world.W && world.blocked[fy * world.W + wx]) {
          for (let r = 1; r < 12; r++) {
            let hit = null;
            for (let dy = -r; dy <= r && !hit; dy++) for (let dx = -r; dx <= r && !hit; dx++) {
              const x = fx + dx, y = fy + dy, ww = world.globe ? mod(x, world.W) : x;
              if (y < 0 || y >= world.H || ww < 0 || ww >= world.W) continue;
              if (!world.blocked[y * world.W + ww] && !Wd().isSolid(world, x + 0.5, y + 0.5)) hit = [x, y];
            }
            if (hit) { pl.x = hit[0] + 0.5; pl.y = hit[1] + 0.5; break; }
          }
        }
      }
      return n;
    },
    // ------------------------------------------------------------ a town growing
    // the next lot in a town's plan for a building of w×h (or null: the old way then)
    lot(world, s, w, h, type) {
      if (!s.style) return null;
      const items = [{ b: { id: '_lot', type: type || 'house', x: s.x, y: s.y, w, h } }];
      // (a town grows out over its own fields; as many go under the plough again further out)
      // (nor across a road: the roads into the town run along its streets)
      const avoid = new Set(), W = world.W;
      for (const r of world.roads || []) if (Array.isArray(r.path)) for (const i of r.path) { const x = i % W, y = (i / W) | 0; if (Math.abs(x - s.x) <= 31 && Math.abs(y - s.y) <= 31) avoid.add(i); }
      const R = TS.place(world, s, items, { pinned: s.buildings, farms: true, avoid });
      if (R.left.length) return null;
      const b = items[0].b, Tl = T();
      let ploughed = 0;
      for (let yy = b.y; yy < b.y + h; yy++) for (let xx = b.x; xx < b.x + w; xx++) if (Wd().tile(world, xx, yy) === Tl.FARM) ploughed++;
      // the street before its door, paved
      const dx = b.x + Math.floor(w / 2), dy = b.y + h, t = Wd().tile(world, dx, dy);
      if (t !== Tl.PLAZA && t !== Tl.ROAD && t !== Tl.BRIDGE && t !== Tl.WATER && t !== Tl.DEEP) { if (t === Tl.FARM) ploughed++; Wd().setTile(world, dx, dy, Tl.PLAZA); }
      if (ploughed) { s.reach = Math.max(s.reach || 0, Math.round((R.PL.dist(b.x + w / 2 - 0.5 - s.x, b.y + h / 2 - 0.5 - s.y) + Math.max(w, h) / 2 + 1.2) * 10) / 10); b._plough = ploughed; }
      return { x: b.x, y: b.y, plough: ploughed };
    },
    // the paving at a tile of a town: its people's stone (or beaten earth)
    paveAt(world, x, y) {
      let best = null, bd = 1e9;
      const W = world.W;
      for (const s of world.settlements) {
        let dx = x - s.x; if (world.globe) { if (dx > W / 2) dx -= W; else if (dx < -W / 2) dx += W; }
        const dy = y - s.y;
        if (dx > 32 || dx < -32 || dy > 32 || dy < -32 || !s.style) continue;
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = s; }
      }
      if (!best) return null;
      const A = TS.arch(best);
      return A._pv || (A._pv = { col: A.pave, earth: !!A.earth });
    },
    // ------------------------------------------------------------ what stands in its streets and gardens
    // (the same every time: drawn by the renderer, and the trees and fountains are solid)
    decor(world, s) {
      const C = world._decor || (world._decor = {});
      const key = s.style + '|' + s.buildings.length + '|' + (s.reach || 0);
      const c = C[s.id];
      if (c && c.key === key) return c.list;
      const Tl = T(), A = TS.arch(s), PL = TS.layoutOf(s), out = [];
      const reach = s.reach || 12, R = Math.ceil(reach);
      const seed = (world.seed || 0) + ECHO.hashStr(s.id) % 1000;
      const used = new Set();
      const blocked = (x, y) => { const wx = world.globe ? mod(x, world.W) : x; return y < 0 || y >= world.H || wx < 0 || wx >= world.W || world.blocked[y * world.W + wx]; };
      const nextTo = (x, y, tt) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => Wd().tile(world, x + a, y + b) === tt);
      const doorAt = new Set(s.buildings.map(b => (b.y + b.h) * 100000 + (b.x + Math.floor(b.w / 2))));
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        if (PL.dist(dx, dy) > reach) continue;
        const x = s.x + dx, y = s.y + dy;
        if (Math.abs(dx) <= 2 && dy >= -1 && dy <= 3) continue;
        if (blocked(x, y) || doorAt.has(y * 100000 + x) || used.has(y * 100000 + x)) continue;
        const t = Wd().tile(world, x, y), a = h2(x, y, seed + 11);
        let k = null, solid = 0, sc = 1;
        if (t === Tl.GRASS) {
          if (!nextTo(x, y, Tl.PLAZA) && a < 0.17 && A.tree) { k = A.tree; solid = 0.2; sc = 0.75 + h2(x, y, seed + 12) * 0.35; }
          else if (a > 0.93 && A.decor[1]) { k = A.decor[1]; solid = k === 'bush' || k === 'statue' || k === 'cypress' || k === 'palm' ? 0.22 : k === 'post' || k === 'totem' ? 0.15 : 0; }
        } else if (t === Tl.PLAZA) {
          // at the corners of streets: its lamps, braziers, standards
          if (a < 0.045 && !nextTo(x, y, Tl.ROAD)) { k = A.decor[0]; solid = k === 'brazier' || k === 'standard' || k === 'lanternpost' || k === 'palm' || k === 'cypress' || k === 'statue' || k === 'totem' ? 0.18 : 0; }
        }
        if (!k) continue;
        out.push({ k, x: x + 0.5, y: y + 0.5, s: sc, r: solid });
        used.add(y * 100000 + x);
        if (out.length > 70) break;
      }
      // the oasis's palms round its pool, the forum's cypresses
      if (PL === PLANS.oasis || PL === PLANS.forum) {
        const P0 = s.kind === 'capital' || s.kind === 'temple' ? 4 : 3, rr = PL === PLANS.oasis ? P0 + 1.6 : P0 + 0.6, n = PL === PLANS.oasis ? 10 : 8;
        for (let i = 0; i < n; i++) {
          const ang = i / n * Math.PI * 2 + 0.3, x = s.x + 0.5 + Math.cos(ang) * (PL === PLANS.oasis ? rr : rr + 2.2), y = s.y + 0.5 + Math.sin(ang) * rr;
          if (blocked(Math.floor(x), Math.floor(y)) || (Math.abs(x - s.x - 0.5) < 2 && y - s.y > -1 && y - s.y < 3.5)) continue;
          out.push({ k: PL === PLANS.oasis ? 'palm' : 'cypress', x, y, s: 1, r: 0.2 });
        }
      }
      C[s.id] = { key, list: out };
      return out;
    }
  };
})();
