// Loose things: what lies about the world, and moves when it is moved.
//
// Barrels and crates against the walls of the inns and the smithies, pots by the doors of the
// houses, sacks at the mill, urns among the ruins, round bales out in the fields after the hay is
// cut, pumpkins in the autumn, and stones lying loose on the hills. Each has a weight and a shape,
// and goes by the same ground and the same rules as everything else:
//   • walk into it and it gives way — a pot skitters off, a crate you lean on slides, a hay bale
//     hardly at all; a horse at the gallop sends them flying;
//   • a barrel or a pot stands until it is knocked hard enough, and then goes over, and on its
//     side it ROLLS (only the way a barrel can, across its length), down any slope it lies on;
//     a pumpkin or a stone rolls any way; a crate or a sack only slides, and not far;
//   • thrown, it flies, tumbles, lands, bounces, and settles (a crate on a face, a barrel on its
//     side or its end); it knocks into walls and into other things, and they into others;
//   • a blow sends it off by the weight of the blow and of the thing; a blast throws everything
//     round it outward and up; arrows stop in what is tall enough to stop them;
//   • what is made of clay breaks (and now and then there is something in it), a crate gives way
//     at the second blow, a sack bursts, a bale flies apart into straw;
//   • in the water a barrel, a crate, a bale or a pumpkin floats and goes off down the river with
//     the current; a pot, a sack or a stone sinks; on the ice everything slides;
//   • fire catches in wood, sacking and straw, spreads to what stands beside it, and dies in water.
// The townsfolk mind their things. Nothing here is kept in the save but which of them were broken
// (they are made again in a few days); what was only moved is put back while you are away.
(function () {
  const { U } = ECHO;
  const T = () => ECHO.TILE;
  const h2 = (x, y, s) => ECHO.hash2(x, y, s);
  const GRAV = 9.8;

  // r: room it takes on the ground; ht: its height standing; rr: how big round it is, lying (what
  // it rolls on); m: its weight (a grown person is 1); hits: the blows it takes (0: none breaks it);
  // shape: 'can' stands, goes over and rolls on its side; 'ball' rolls any way; 'bale' lies on its
  // side and rolls; 'box' slides and tumbles; 'heap' slumps and slides.
  // float: how much of it rides above the water (0: it sinks); burn: how long it burns (0: never)
  const KINDS = {
    barrel:  { r: 0.26, ht: 0.64, rr: 0.25, m: 0.7,  hits: 0, shape: 'can',  float: 0.45, burn: 7, mat: 'wood',  tipV: 3.3, rest: 0.25, model: 'barrel', sc: 0.8 },
    crate:   { r: 0.27, ht: 0.46, w: 0.54, m: 0.8, hits: 2, shape: 'box',  float: 0.4,  burn: 6, mat: 'wood',  rest: 0.2,  model: 'crate',  sc: 0.75 },
    pot:     { r: 0.16, ht: 0.34, rr: 0.15, m: 0.15, hits: 1, shape: 'can',  float: 0,    burn: 0, mat: 'clay',  tipV: 2.0, rest: 0.2, fragile: 5.5, model: 'pot' },
    urn:     { r: 0.19, ht: 0.48, rr: 0.17, m: 0.3,  hits: 1, shape: 'can',  float: 0,    burn: 0, mat: 'clay',  tipV: 2.3, rest: 0.2, fragile: 5, model: 'urn' },
    sack:    { r: 0.23, ht: 0.36, m: 0.5,  hits: 2, shape: 'heap', float: 0,    burn: 5, mat: 'cloth', rest: 0.05, model: 'sack' },
    hay:     { r: 0.4,  ht: 0.6,  rr: 0.36, m: 4,   hits: 3, shape: 'bale', float: 0.35, burn: 12, mat: 'straw', rest: 0.1, model: 'hay' },
    pumpkin: { r: 0.2,  ht: 0.3,  rr: 0.17, m: 0.3,  hits: 1, shape: 'ball', float: 0.55, burn: 0, mat: 'gourd', rest: 0.25, fragile: 7.5, model: 'pumpkin' },
    stone:   { r: 0.17, ht: 0.26, rr: 0.14, m: 0.6,  hits: 0, shape: 'ball', float: 0,    burn: 0, mat: 'stone', rest: 0.3, model: 'stone' }
  };
  // what stands by what kind of building (and how often)
  const BY = {
    house:   { p: 0.2,  k: [['pot', 5], ['barrel', 3], ['sack', 1], ['crate', 1]] },
    inn:     { p: 0.4,  k: [['barrel', 6], ['crate', 3], ['pot', 1]] },
    market:  { p: 0.45, k: [['crate', 5], ['barrel', 3], ['sack', 2], ['pot', 2]] },
    smithy:  { p: 0.35, k: [['barrel', 5], ['crate', 4]] },
    mill:    { p: 0.45, k: [['sack', 7], ['crate', 2]] },
    lumber:  { p: 0.3,  k: [['crate', 4], ['barrel', 3]] },
    keep:    { p: 0.2,  k: [['crate', 4], ['barrel', 4]] },
    temple:  { p: 0.22, k: [['urn', 1]] },
    shrine:  { p: 0.3,  k: [['urn', 1]] },
    archive: { p: 0.2,  k: [['urn', 2], ['crate', 1]] },
    mine:    { p: 0.3,  k: [['crate', 3], ['barrel', 1]] }
  };
  // how hard each kind of ground is to roll or slide on
  const SURF = () => { const t = T(); return { [t.ROAD]: 1, [t.PLAZA]: 1, [t.BRIDGE]: 1, [t.RUIN]: 1.2, [t.GRASS]: 1.8, [t.FARM]: 2.2, [t.FOREST]: 2.2, [t.TREE]: 2.2, [t.HILL]: 1.5, [t.SAND]: 3.5, [t.SNOW]: 2.6, [t.SWAMP]: 4, [t.WATER]: 6, [t.DEEP]: 6 }; };
  const SHOUT = ['Oi! That was mine!', 'Mind my things!', 'Who\'s paying for that?', 'Have a care, would you?', 'Hey! Leave that be!', 'That\'s my good one!'];
  const AWAY = ['My barrel! It\'s off down the river!', 'Come back here, you — oh, never mind.', 'There goes my crate…'];
  const REMADE = 3;     // days before what was broken is there again
  const NEAR = 34, FAR = 46, MAX = 150;

  const L = ECHO.Loose = {
    KINDS, BY,
    list: [], byKey: new Map(), waves: [], world: null, t: 0, ensureT: 0, next: 1,
    reset(world) { L.list = []; L.byKey.clear(); L.waves = []; L.world = world || null; L._spots = {}; L._cells = {}; L._grid = null; L.ensureT = 0; L._lpx = null; },
    clear() { L.list = []; L.byKey.clear(); },
    // ------------------------------------------------------------ where they lie
    wrapDx(world, dx) { return world && world.globe && world.W ? dx - Math.round(dx / world.W) * world.W : dx; },
    pick(list, a) { let s = 0; for (const [, w] of list) s += w; let x = a * s; for (const [k, w] of list) { x -= w; if (x <= 0) return k; } return list[list.length - 1][0]; },
    open(world, x, y) {
      const t = ECHO.World.tile(world, x, y), Tl = T();
      if (t !== Tl.PLAZA && t !== Tl.ROAD && t !== Tl.GRASS && t !== Tl.FARM && t !== Tl.SAND && t !== Tl.SNOW && t !== Tl.RUIN && t !== Tl.HILL) return false;
      const wx = world.globe ? ((x % world.W) + world.W) % world.W : x;
      return !(y < 0 || y >= world.H || wx < 0 || wx >= world.W || world.blocked[y * world.W + wx]);
    },
    // by a town's walls, and out in its fields (the same every time)
    spots(world, s) {
      const C = L._spots || (L._spots = {});
      const season = ECHO.TIME ? ECHO.TIME.dateOf(world.day).seasonIdx : 1;
      const key = s.x + ',' + s.y + '|' + s.buildings.length + '|' + (s.reach || 0) + '|' + season + '|' + world.W;
      const c = C[s.id];
      if (c && c.key === key) return c.list;
      const out = [], seed = (world.seed || 0) + ECHO.hashStr(s.id) % 1000, used = new Set(), Tl = T();
      let decor = [];
      try { decor = ECHO.TownStyle && ECHO.TownStyle.decor ? ECHO.TownStyle.decor(world, s) : []; } catch (e) { decor = []; }
      for (const d of decor) used.add(Math.floor(d.y) * 100000 + Math.floor(d.x));
      const add = (k, x, y, px, py, tag) => {
        out.push({ key: s.id + ':' + (x - s.x) + ',' + (y - s.y), k, x: px, y: py, yaw: h2(x, y, seed + 74) * Math.PI * 2, sid: s.id, town: tag !== 'field' });
        used.add(y * 100000 + x);
      };
      for (const b of s.buildings) {
        const set = BY[b.type];
        if (!set || b.ruined) continue;
        const doorX = b.x + Math.floor(b.w / 2), doorY = b.y + b.h;
        const cand = [];
        for (let yy = b.y; yy < b.y + b.h; yy++) { cand.push([b.x + b.w, yy, -1, 0]); cand.push([b.x - 1, yy, 1, 0]); }
        for (let xx = b.x; xx < b.x + b.w; xx++) if (Math.abs(xx - doorX) > 1) cand.push([xx, doorY, 0, -1]);
        for (const [x, y, wx, wy] of cand) {
          if (h2(x, y, seed + 71) > set.p || used.has(y * 100000 + x) || !L.open(world, x, y)) continue;
          const t = ECHO.World.tile(world, x, y);
          if (t !== Tl.PLAZA && t !== Tl.ROAD && t !== Tl.GRASS && t !== Tl.SAND && t !== Tl.SNOW) continue;
          const k = L.pick(set.k, h2(x, y, seed + 72)), K = KINDS[k], gap = 0.5 - K.r - 0.04;
          // up against the wall (and along it, a little this way or that)
          const along = (h2(x, y, seed + 73) - 0.5) * 0.4;
          add(k, x, y, x + 0.5 + wx * gap + (wy ? along : 0), y + 0.5 + wy * gap + (wx ? along : 0));
          if (out.length >= 46) break;
        }
        if (out.length >= 46) break;
      }
      // the fields: round bales once the hay is cut (summer and autumn), pumpkins in the autumn
      if (season === 1 || season === 2) {
        const R = Math.ceil((s.reach || 12) + 10);
        for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
          const x = s.x + dx, y = s.y + dy;
          if (ECHO.World.tile(world, x, y) !== Tl.FARM || used.has(y * 100000 + x) || !L.open(world, x, y)) continue;
          const a = h2(x, y, seed + 81);
          if (a < 0.014) add('hay', x, y, x + 0.5, y + 0.5, 'field');
          else if (season === 2 && a > 0.968) add('pumpkin', x, y, x + 0.3 + h2(x, y, seed + 82) * 0.4, y + 0.3 + h2(x, y, seed + 83) * 0.4, 'field');
        }
      }
      C[s.id] = { key, list: out };
      return out;
    },
    // urns among the stones of the old places
    ruinSpots(world, r, i) {
      const C = L._spots || (L._spots = {}), id = 'ruin:' + (r.id || i);
      const key = r.x + ',' + r.y + '|' + (world._tileEpoch || 0);
      if (C[id] && C[id].key === key) return C[id].list;
      const out = [], seed = (world.seed || 0) + 913;
      for (let dy = -5; dy <= 5; dy++) for (let dx = -6; dx <= 6; dx++) {
        const x = r.x + dx, y = r.y + dy;
        if (ECHO.World.tile(world, x, y) !== T().RUIN || !L.open(world, x, y)) continue;
        if (h2(x, y, seed) < 0.05) out.push({ key: id + ':' + dx + ',' + dy, k: 'urn', x: x + 0.3 + h2(x, y, seed + 1) * 0.4, y: y + 0.3 + h2(x, y, seed + 2) * 0.4, yaw: h2(x, y, seed + 3) * 6.28, ruin: true });
      }
      C[id] = { key, list: out };
      return out;
    },
    // stones lying loose on the hills
    cellSpots(world, cx, cy) {
      const C = L._cells || (L._cells = {}), id = cx + ',' + cy, ep = world._tileEpoch || 0;
      if (C[id] && C[id].ep === ep) return C[id].list;
      const out = [], seed = (world.seed || 0) + 557;
      for (let y = cy * 16; y < cy * 16 + 16; y++) for (let x = cx * 16; x < cx * 16 + 16; x++) {
        if (ECHO.World.tile(world, x, y) !== T().HILL || h2(x, y, seed) > 0.012 || !L.open(world, x, y)) continue;
        const px = x + 0.25 + h2(x, y, seed + 1) * 0.5, py = y + 0.25 + h2(x, y, seed + 2) * 0.5;
        if (ECHO.Solids && ECHO.Solids.hit(world, px, py, 0.2)) continue;
        out.push({ key: 'st:' + x + ',' + y, k: 'stone', x: px, y: py, yaw: h2(x, y, seed + 3) * 6.28 });
      }
      C[id] = { list: out, ep };
      return out;
    },
    broken(world, key) { const b = world.loose && world.loose.b; return !!(b && b[key] != null && world.day - b[key] < REMADE); },
    markGone(world, p) {
      if (!p.key || p.key.startsWith('st:')) return;
      const S = world.loose || (world.loose = { b: {} });
      S.b = S.b || {};
      S.b[p.key] = world.day;
      const ks = Object.keys(S.b);
      if (ks.length > 240) for (const k of ks) if (world.day - S.b[k] >= REMADE) delete S.b[k];
    },
    make(sp, x, y) {
      const K = KINDS[sp.k];
      const p = { id: L.next++, key: sp.key, k: sp.k, K, x, y, z: 0, vx: 0, vy: 0, vz: 0, yaw: sp.yaw || 0, lie: 0, lieA: 0, spin: 0, spinTo: null, w: 0, tax: 'z',
        yaw0: sp.yaw || 0, hitsTaken: 0, awake: false, stillT: 0, wet: null, sinkT: 0, burnT: 0, hx: x, hy: y, sid: sp.sid || null, town: !!sp.town, ruin: !!sp.ruin, by: null, byT: 0 };
      if (K.shape === 'bale') { p.lie = p.lieA = Math.PI / 2; }
      return p;
    },
    ensure(game) {
      const world = game.world, pe = game.pe;
      const want = new Map();
      const near = (sx, sy, R) => { const dx = L.wrapDx(world, sx - pe.x), dy = sy - pe.y; return dx * dx + dy * dy < R * R; };
      const take = sp => { if (!near(sp.x, sp.y, NEAR)) return; want.set(sp.key, sp); };
      for (const s of world.settlements || []) if (near(s.x, s.y, (s.reach || 12) + NEAR + 4)) for (const sp of L.spots(world, s)) take(sp);
      (world.ruins || []).forEach((r, i) => { if (near(r.x, r.y, NEAR + 8)) for (const sp of L.ruinSpots(world, r, i)) take(sp); });
      const cx0 = Math.floor(pe.x / 16), cy0 = Math.floor(pe.y / 16);
      for (let cy = cy0 - 2; cy <= cy0 + 2; cy++) for (let cx = cx0 - 2; cx <= cx0 + 2; cx++) for (const sp of L.cellSpots(world, cx, cy)) take(sp);
      for (const [key, sp] of want) {
        if (L.list.length >= MAX) break;
        if (L.byKey.has(key) || L.broken(world, key)) continue;
        const x = pe.x + L.wrapDx(world, sp.x - pe.x);
        const p = L.make(sp, x, sp.y);
        L.list.push(p); L.byKey.set(key, p);
      }
      // what is far behind you is put back where it belongs (and comes again when you return);
      // and in a town, what was knocked about and left lying is put back by its owner when you
      // are not looking
      for (const p of L.list) {
        const dx = L.wrapDx(world, p.x - pe.x), dy = p.y - pe.y, d2 = dx * dx + dy * dy;
        if (d2 > FAR * FAR) { p.gone = true; continue; }
        if (p.town && !p.awake && !(p.burnT > 0) && d2 > 22 * 22 && L.t - (p.restAt || 0) > 40 && Math.abs(p.x - p.hx) + Math.abs(p.y - p.hy) > 0.6) {
          p.x = p.hx; p.y = p.hy; p.lie = p.lieA = p.K.shape === 'bale' ? Math.PI / 2 : 0; p.spin = 0; p.spinTo = null; p.yaw = p.yaw0 != null ? p.yaw0 : p.yaw; p.z = 0;
        }
      }
      L.sweep();
    },
    sweep() { if (L.list.some(p => p.gone)) { L.list = L.list.filter(p => { if (p.gone) L.byKey.delete(p.key); return !p.gone; }); } },
    // ------------------------------------------------------------ the world they move in
    solid(world, x, y) {
      const W = ECHO.World, t = W.tile(world, x, y), Tl = T();
      if (t === Tl.WATER || t === Tl.DEEP) {
        const ix = Math.floor(x), iy = Math.floor(y);
        if (!world.globe && (ix < 0 || ix >= world.W)) return true;
        return iy < 0 || iy >= world.H;
      }
      if (ECHO.Solids) { W.noTrunks = true; try { return W.isSolid(world, x, y); } finally { W.noTrunks = false; } }
      return W.isSolid(world, x, y);
    },
    blocked(world, x, y, r) {
      const q = r * 0.7;
      if (L.solid(world, x - q, y - q) || L.solid(world, x + q, y - q) || L.solid(world, x - q, y + q) || L.solid(world, x + q, y + q)) return true;
      return !!(ECHO.Solids && ECHO.Solids.hit(world, x, y, r * 0.85));
    },
    // a step with what it runs into: it bounces off (and a hard knock is a knock)
    move(world, p, dx, dy) {
      const r = p.K.r;
      if (!L.blocked(world, p.x + dx, p.y + dy, r)) { p.x += dx; p.y += dy; return 0; }
      let hit = 0;
      const rest = p.K.rest + 0.1;
      if (!L.blocked(world, p.x + dx, p.y, r)) p.x += dx; else { hit = Math.max(hit, Math.abs(p.vx)); p.vx = -p.vx * rest; }
      if (!L.blocked(world, p.x, p.y + dy, r)) p.y += dy; else { hit = Math.max(hit, Math.abs(p.vy)); p.vy = -p.vy * rest; }
      return hit;
    },
    surface(world, x, y) { const S = L._surf || (L._surf = SURF()); return S[ECHO.World.tile(world, x, y)] || 1.5; },
    // which way it rolls (across its length), when it is a thing that rolls that way
    rollDir(p) { return { x: Math.cos(p.yaw), y: Math.sin(p.yaw) }; },
    rolls(p) { const s = p.K.shape; return s === 'ball' || s === 'bale' || (s === 'can' && p.lie > 0.1); },
    // ------------------------------------------------------------ a moment of it
    step(game, p, h) {
      const world = game.world, K = p.K;
      if (p.sinkT > 0) { p.sinkT += h; p.vx *= Math.exp(-h * 3); p.vy *= Math.exp(-h * 3); L.move(world, p, p.vx * h, p.vy * h); if (p.sinkT > 1.8) { p.gone = true; L.markGone(world, p); } return; }
      const wet = ECHO.Water ? ECHO.Water.kind(world, p.x, p.y) : null;
      if (wet !== p.wet) L.splashIn(game, p, wet);
      p.wet = wet;
      const flow = wet && ECHO.Boats && ECHO.Boats.flow ? ECHO.Boats.flow(world, p.x, p.y) : null;
      // in the deeps: afloat and away with the current, or down to the bottom
      if (wet === 'deep' && p.z <= 0.05) {
        p.z = 0; p.vz = 0;
        if (K.float > 0) {
          const k = 1 - Math.exp(-h * 1.1), fx = flow ? flow.x * 0.95 : 0, fy = flow ? flow.y * 0.95 : 0;
          p.vx += (fx - p.vx) * k; p.vy += (fy - p.vy) * k;
          const hit = L.move(world, p, p.vx * h, p.vy * h);
          if (hit > 0.3) p.vx += (Math.random() - 0.5) * 0.3;   // (turned along the bank)
          if (p.by === 'pl' && p.town && !p.awayT && game.time - p.byT < 6) { p.awayT = 1; L.shout(game, p, AWAY); }
          if (p.burnT > 0) L.douse(game, p);
          return;
        }
        p.sinkT = 0.0001;
        return;
      }
      if (p.z > 0 || p.vz > 0) {
        // in the air: it falls, and turns over as it flies
        p.vz -= GRAV * h; p.z += p.vz * h;
        const hit = L.move(world, p, p.vx * h, p.vy * h);
        if (hit > 3 && K.fragile) { L.smash(game, p, p.lastBy); return; }
        if (K.shape !== 'ball') p.spin += p.w * h;
        else p.roll = (p.roll || 0) + Math.hypot(p.vx, p.vy) * h / (K.rr || K.r);
        if (p.z <= 0) {
          if (wet) { p.z = 0; p.vz = 0; p.vx *= 0.5; p.vy *= 0.5; p.w = 0; if (p.K.shape === 'box') p.spinTo = Math.round(p.spin / (Math.PI / 2)) * (Math.PI / 2); }   // (into the water: no bounce)
          else L.land(game, p);
        }
        return;
      }
      // on the ground: down whatever slope it lies on, and the ground holding it back
      const g = ECHO.Ground ? ECHO.Ground.grad(world, p.x, p.y) : { x: 0, y: 0 };
      const ice = ECHO.Climate && ECHO.Climate.onIce && ECHO.Climate.onIce(world, p.x, p.y);
      const sf = ice ? 0.08 : L.surface(world, p.x, p.y);
      if (flow && wet === 'shallow') { const k = 1 - Math.exp(-h * (K.float > 0 ? 0.6 : 0.15)); p.vx += (flow.x * 0.4 - p.vx) * k; p.vy += (flow.y * 0.4 - p.vy) * k; }
      let drive = false;   // (the slope is enough to keep it going)
      if (L.rolls(p)) {
        const muR = (K.shape === 'can' ? 0.04 : K.shape === 'bale' ? 0.06 : 0.04) * sf;
        if (K.shape === 'ball') {
          p.vx -= GRAV * g.x * 0.7 * h; p.vy -= GRAV * g.y * 0.7 * h;
          drive = Math.hypot(g.x, g.y) * 0.7 > muR;
          L.brake(p, muR * GRAV * h);
        } else {
          // across its length it rolls; along it, it slides (and the ground holds it fast)
          const u = L.rollDir(p), ax = -u.y, ay = u.x;
          let vr = p.vx * u.x + p.vy * u.y, va = p.vx * ax + p.vy * ay;
          const gr = g.x * u.x + g.y * u.y;
          vr -= GRAV * gr * 0.67 * h;
          const ga = g.x * ax + g.y * ay;
          if (Math.abs(ga) > 0.6) va -= GRAV * (ga - Math.sign(ga) * 0.5) * h;
          drive = Math.abs(gr) * 0.67 > muR || Math.abs(ga) > 0.6;
          vr = L.brake1(vr, muR * GRAV * h);
          va = L.brake1(va, 0.5 * sf * GRAV * h);
          p.vx = u.x * vr + ax * va; p.vy = u.y * vr + ay * va;
          p.spin += vr * h / (K.rr || K.r);
        }
      } else {
        const muK = (K.shape === 'heap' ? 0.75 : K.shape === 'box' ? 0.5 : 0.45) * sf;
        const gl = Math.hypot(g.x, g.y);
        if (gl > 0.65) { p.vx -= GRAV * g.x / gl * (gl - 0.55) * h; p.vy -= GRAV * g.y / gl * (gl - 0.55) * h; drive = true; }
        L.brake(p, muK * GRAV * h);
      }
      if (p.lieA !== p.lie) { const d = p.lie - p.lieA, s = h * 7; p.lieA = Math.abs(d) <= s ? p.lie : p.lieA + Math.sign(d) * s; }
      if (p.spinTo != null) { const d = p.spinTo - p.spin; p.spin += d * Math.min(1, h * 14); if (Math.abs(d) < 0.01) { p.spin = p.spinTo; p.spinTo = null; } }
      const hit = L.move(world, p, p.vx * h, p.vy * h);
      if (hit > 2.5) { L.knockSound(p, hit); if (K.fragile && hit > K.fragile) L.smash(game, p, p.lastBy); else if (K.shape === 'can' && p.lie < 0.1 && hit > K.tipV) L.tip(p, -p.vx, -p.vy); }
      const sp = Math.abs(p.vx) + Math.abs(p.vy);
      // still, and nothing to set it going again: asleep until something does
      if (sp < 0.03 && !drive && p.lieA === p.lie && p.spinTo == null && !(p.burnT > 0) && !wet) {
        p.vx = p.vy = 0;
        p.stillT += h;
        if (p.stillT > 0.4) { p.awake = false; p.restAt = L.t; }
      } else p.stillT = 0;
    },
    brake(p, d) { const s = Math.hypot(p.vx, p.vy); if (s <= d) { p.vx = p.vy = 0; } else { const k = (s - d) / s; p.vx *= k; p.vy *= k; } },
    brake1(v, d) { return Math.abs(v) <= d ? 0 : v - Math.sign(v) * d; },
    // down it comes: a bounce, a knock, and how it lies
    land(game, p) {
      const K = p.K, fall = -p.vz;
      p.z = 0;
      if (K.fragile && fall > K.fragile * 0.8) { L.smash(game, p, p.lastBy); return; }
      if (fall > 1.6 && K.shape !== 'heap') { p.vz = fall * K.rest; p.vx *= 0.78; p.vy *= 0.78; p.w *= 0.5; }
      else { p.vz = 0; p.vx *= 0.7; p.vy *= 0.7; }
      if (fall > 1.2) { L.knockSound(p, fall); if (ECHO.Combat && ECHO.Combat.puff) for (let i = 0; i < 4; i++) ECHO.Combat.puff(p.x + (Math.random() - 0.5) * 0.4, p.y + (Math.random() - 0.5) * 0.4, { h: 0.05, vx: (Math.random() - 0.5) * 1.4, vy: (Math.random() - 0.5) * 1.4, vz: 0.3, g: -0.2, life: 0.7, size: 3, color: '#b8a888', smoke: true }); }
      if (p.vz > 0) return;
      // settled: a crate on whichever face is nearest; a barrel on its end or its side
      const q = Math.PI / 2;
      if (K.shape === 'box') { p.spinTo = Math.round(p.spin / q) * q; p.w = 0; }
      else if (K.shape === 'can') {
        if (p.lie < 0.1) {
          const s = Math.abs(Math.sin(p.spin));
          if (s > 0.34) { p.yaw += q; p.lie = p.lieA = q; p.spin = 0; }   // (came down leaning: over it goes, onto its side)
          else p.spinTo = Math.round(p.spin / Math.PI) * Math.PI;
        }
        p.w = 0;
      } else p.w = 0;
    },
    // over it goes, the way it was pushed
    tip(p, dx, dy) {
      if (p.K.shape !== 'can' || p.lie > 0.1) return;
      const l = Math.hypot(dx, dy) || 1;
      p.yaw = Math.atan2(-dx / l, dy / l);
      p.lie = Math.PI / 2;
      p.spin = 0; p.spinTo = null;
      L.knockSound(p, 2.5);
    },
    wake(p) { p.awake = true; p.stillT = 0; },
    // a push (dvx, dvy: how much faster it goes) with a lift (dvz) and a turn (w)
    shove(game, p, dvx, dvy, dvz, by) {
      const K = p.K, dv = Math.hypot(dvx, dvy);
      p.vx += dvx; p.vy += dvy;
      if (dvz > 0) {
        p.vz = Math.max(p.vz, dvz); if (p.z <= 0) p.z = 0.001;
        if (K.shape !== 'ball' && K.shape !== 'heap') {
          // it turns over the way it flies (a crate about whichever face is nearest to that way)
          const a = Math.atan2(p.vy, p.vx), rel = U.angleDiff(p.yaw, a);
          if (K.shape === 'box') { p.tax = Math.abs(Math.cos(rel)) > Math.abs(Math.sin(rel)) ? 'z' : 'x'; p.w = (p.tax === 'z' ? Math.sign(Math.cos(rel)) : Math.sign(Math.sin(rel))) * dv / 0.32; }
          else if (p.lie < 0.1) { p.yaw = a; p.tax = 'z'; p.w = dv / 0.35; }
          else p.w = 0;
          p.spinTo = null;
        }
      }
      if (by) { p.lastBy = by; if (by === game.pe || by.pal || by.isCompanion) { p.by = 'pl'; p.byT = game.time || 0; } }
      L.wake(p);
      return dv;
    },
    // ------------------------------------------------------------ bodies: they walk into them
    mass(e) {
      if (e.type === 'boss' || e.titan) return 9;
      if (e.mounted) return 4;
      const r = ECHO.Ent && ECHO.Ent.bodyR ? ECHO.Ent.bodyR(e) : e.r || 0.35;
      return U.clamp((r / 0.35) * (r / 0.35), 0.3, 9);
    },
    // (what lies where, in squares of a league and a half: a body looks only in the squares about it)
    grid() {
      const G = L._grid || (L._grid = new Map());
      for (const a of G.values()) a.length = 0;
      for (const p of L.list) {
        if (p.gone || p.sinkT > 0) continue;
        const k = Math.floor(p.x / 1.5) * 8192 + Math.floor(p.y / 1.5);
        let a = G.get(k);
        if (!a) { a = []; G.set(k, a); }
        a.push(p);
      }
      if (G.size > 600) for (const [k, a] of G) if (!a.length) G.delete(k);
      return G;
    },
    bodies(game, dt) {
      const G = L.grid(), stamp = (L._bstamp = (L._bstamp || 0) + 1);
      for (const e of game.ents) {
        if (e.dead || e.hidden || e.ghost || e.burrowed || (e.alt || 0) > 0.6 || e.tz > 0.6 || e.seated || e.x >= 9000) continue;
        let vx = 0, vy = 0;
        if (e._lsT === stamp - 1 && dt > 0) { vx = (e.x - e._lsx) / dt; vy = (e.y - e._lsy) / dt; if (vx * vx + vy * vy > 400) { vx = vy = 0; } }
        e._lsx = e.x; e._lsy = e.y; e._lsT = stamp;
        const er = (ECHO.Ent && ECHO.Ent.bodyR ? ECHO.Ent.bodyR(e) : e.r || 0.35) * (e.mounted ? 1.25 : 1);
        let me = 0;
        const still = vx === 0 && vy === 0;
        const n = Math.ceil((er + 0.45) / 1.5), cx0 = Math.floor(e.x / 1.5), cy0 = Math.floor(e.y / 1.5);
        for (let cy = cy0 - n; cy <= cy0 + n; cy++) for (let cx = cx0 - n; cx <= cx0 + n; cx++) {
        const cell = G.get(cx * 8192 + cy);
        if (!cell) continue;
        for (const p of cell) {
          if (p.gone || p.sinkT > 0 || p.z > 0.6 || (still && !p.awake)) continue;
          const dx = p.x - e.x, dy = p.y - e.y, rs = er + p.K.r;
          if (Math.abs(dx) > rs || Math.abs(dy) > rs) continue;
          const d2 = dx * dx + dy * dy;
          if (d2 >= rs * rs) continue;
          if (!me) me = L.mass(e);
          const d = Math.sqrt(d2) || 0.0001, nx = d2 > 1e-8 ? dx / d : 1, ny = d2 > 1e-8 ? dy / d : 0, over = rs - d;
          const mp = p.K.m * (p.wet === 'deep' ? 0.5 : 1), leaning = p.touch === e.id && game.time - (p.touchT || 0) < 0.15;
          // apart: the lighter gives way the more (leaning on a thing, it is the body that gives,
          // and the thing goes only as fast as it is pushed)
          const share = leaning ? (mp < me * 0.5 ? me / (me + mp) : 0) : me / (me + mp);
          L.move(game.world, p, nx * over * share, ny * over * share);
          e.pushx = (e.pushx || 0) - nx * over * (1 - share);
          e.pushy = (e.pushy || 0) - ny * over * (1 - share);
          // and the push it was given (a knock the first moment; leaning on it, after — and no
          // body pushes harder than it can: a bale gathers way slowly, a pot at once)
          const vn = (vx - p.vx) * nx + (vy - p.vy) * ny;
          if (vn > 0.05) {
            const rest = leaning ? 0 : 0.35;
            let dv = (1 + rest) * vn * me / (me + mp);
            if (leaning) dv = Math.min(dv, me * 7 * dt / mp);
            const lift = !leaning && mp <= 0.35 && dv > 3.2 ? dv * 0.25 : 0;
            L.shove(game, p, nx * dv, ny * dv, lift, e);
            if (!leaning && dv > 1.4) L.knockSound(p, dv);
            if (p.K.fragile && dv > p.K.fragile) { L.smash(game, p, e); continue; }
            if (p.K.shape === 'can' && p.lie < 0.1 && dv > p.K.tipV) L.tip(p, nx, ny);
          }
          p.touch = e.id; p.touchT = game.time || 0;
          // a body on fire sets alight what it brushes against
          if (e.burn > 0 && p.K.burn && !(p.burnT > 0) && !p.wet && Math.random() < dt * 3) L.ignite(game, p);
        }
        }
      }
    },
    // and each other
    pairs(game) {
      const G = L._grid || L.grid(), live = p => p.awake || p.wet === 'deep';
      for (const a of L.list) {
        if (a.gone || a.sinkT > 0 || !live(a)) continue;
        const cx0 = Math.floor(a.x / 1.5), cy0 = Math.floor(a.y / 1.5);
        for (let cy = cy0 - 1; cy <= cy0 + 1; cy++) for (let cx = cx0 - 1; cx <= cx0 + 1; cx++) {
        const cell = G.get(cx * 8192 + cy);
        if (cell) for (const b of cell) {
          if (b === a || b.gone || b.sinkT > 0 || (live(b) && b.id < a.id) || a.gone) continue;
          const dx = b.x - a.x, dy = b.y - a.y, rs = a.K.r + b.K.r;
          if (Math.abs(dx) > rs || Math.abs(dy) > rs || Math.abs(a.z - b.z) > 0.5) continue;
          const d2 = dx * dx + dy * dy;
          if (d2 >= rs * rs) continue;
          const d = Math.sqrt(d2) || 0.0001, nx = d2 > 1e-8 ? dx / d : 1, ny = d2 > 1e-8 ? dy / d : 0, over = rs - d;
          const ma = a.K.m, mb = b.K.m, wa = mb / (ma + mb);
          L.move(game.world, a, -nx * over * wa, -ny * over * wa);
          L.move(game.world, b, nx * over * (1 - wa), ny * over * (1 - wa));
          const vn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
          if (vn > 0.02) {
            const J = (1 + 0.3) * vn / (1 / ma + 1 / mb);
            a.vx -= nx * J / ma; a.vy -= ny * J / ma; b.vx += nx * J / mb; b.vy += ny * J / mb;
            L.wake(a); L.wake(b);
            const dvb = J / mb, dva = J / ma;
            if (vn > 1.6) L.knockSound(b, vn);
            if (b.K.fragile && dvb > b.K.fragile) L.smash(game, b, a.lastBy); else if (b.K.shape === 'can' && b.lie < 0.1 && dvb > b.K.tipV) L.tip(b, nx, ny);
            if (a.K.fragile && dva > a.K.fragile) L.smash(game, a, b.lastBy);
            if (a.lastBy && !b.lastBy) b.lastBy = a.lastBy;
            if (a.by === 'pl') { b.by = 'pl'; b.byT = a.byT; }
          }
          // fire leaps from one to the next
          if ((a.burnT > 0) !== (b.burnT > 0) && Math.random() < 0.02) { const c = a.burnT > 0 ? b : a; if (c.K.burn && !c.wet) L.ignite(game, c); }
        }
        }
      }
    },
    // ------------------------------------------------------------ blows, blasts and arrows
    // a swing (combat.js: everyone's)
    strike(att, o) {
      const game = ECHO.Game;
      if (!game || !L.list.length || !att || att.x >= 9000) return 0;
      let n = 0;
      for (const p of L.list) {
        if (p.gone || p.sinkT > 0) continue;
        const dx = p.x - att.x, dy = p.y - att.y, d = Math.hypot(dx, dy);
        if (d > (o.range || 1) + p.K.r) continue;
        const a = Math.atan2(dy, dx);
        if (Math.abs(U.angleDiff(o.angle || 0, a)) > (o.arc || 1.6) / 2 && d > p.K.r + 0.3) continue;
        n++;
        p.hitsTaken++;
        const K = p.K;
        if (K.hits && (K.fragile || p.hitsTaken >= K.hits || (o.heavy && K.hits <= 2))) { L.smash(game, p, att, a); continue; }
        const P = (1.2 + (o.knock || 0.12) * 5) * (att.type === 'boss' || att.titan ? 3 : 1);
        const dv = Math.min(15, P / K.m);
        // (a heavy blow lifts it; a lighter one sends it along the ground, and a barrel over)
        L.shove(game, p, Math.cos(a) * dv, Math.sin(a) * dv, o.heavy ? dv * 0.32 : K.shape === 'can' ? 0 : dv * 0.16, att);
        if (K.shape === 'can' && p.lie < 0.1 && dv > K.tipV && !(p.vz > 0)) L.tip(p, Math.cos(a), Math.sin(a));
        L.knockSound(p, 4);
        if (ECHO.Combat && ECHO.Combat.burst) ECHO.Combat.burst(p.x, p.y, L.color(p), 5, 2, 0.35, 2);
      }
      return n;
    },
    // a burst of fire or force (everything round it, outward and up)
    blast(x, y, R, o) {
      o = o || {};
      const game = ECHO.Game;
      L.waves.push({ x, y, R: R + 1.6, t: 0 });
      if (L.waves.length > 6) L.waves.shift();
      if (!game || !L.list.length) return 0;
      let n = 0;
      const reach = R + 1.2;
      for (const p of L.list) {
        if (p.gone || p.sinkT > 0) continue;
        const dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy);
        if (d > reach) continue;
        n++;
        const f = 1 - d / reach, K = p.K, a = d > 0.05 ? Math.atan2(dy, dx) : Math.random() * 6.28;
        if (K.fragile && f > 0.45) { L.smash(game, p, o.by, a); continue; }
        if (K.shape === 'box' && K.hits && f > 0.75) { L.smash(game, p, o.by, a); continue; }
        const dv = Math.min(16, (4 + 5 * R) * f * (o.power == null ? 1 : Math.max(0.3, o.power)) / Math.sqrt(K.m));
        L.shove(game, p, Math.cos(a) * dv, Math.sin(a) * dv, dv * 0.6, o.by);
        if (K.shape === 'can' && p.lie < 0.1) L.tip(p, Math.cos(a), Math.sin(a));
        if (o.fire && K.burn && !p.wet && Math.random() < 0.4 + f) L.ignite(game, p);
      }
      return n;
    },
    // an arrow or a bolt meeting something tall enough to stop it (combat.js)
    projHit(pr) {
      const game = ECHO.Game;
      if (!game || !L.list.length || pr.contest) return null;
      for (const p of L.list) {
        if (p.gone || p.sinkT > 0 || p.K.ht < 0.4 || (p.lie > 0.1 && p.K.shape === 'can' && p.K.rr * 2 < 0.4)) continue;
        if (Math.abs(pr.x - p.x) > p.K.r + 0.12 || Math.abs(pr.y - p.y) > p.K.r + 0.12) continue;
        if (Math.hypot(pr.x - p.x, pr.y - p.y) > p.K.r + 0.12) continue;
        if (pr.from && Math.hypot(pr.from.x - p.x, pr.from.y - p.y) < p.K.r + 0.5) continue;   // (it was shot from right beside it)
        if (pr.kind === 'fire') return p;
        const K = p.K;
        p.hitsTaken++;
        if (K.fragile || (K.hits && p.hitsTaken >= K.hits + 1)) { L.smash(game, p, pr.from, pr.angle); return p; }
        const dv = Math.min(4, 1.6 / K.m);
        L.shove(game, p, Math.cos(pr.angle) * dv, Math.sin(pr.angle) * dv, 0, pr.from);
        L.knockSound(p, 2);
        return p;
      }
      return null;
    },
    // ------------------------------------------------------------ fire and water
    ignite(game, p) {
      if (!p.K.burn || p.burnT > 0 || p.wet) return;
      p.burnT = p.K.burn * (0.8 + Math.random() * 0.4);
      L.wake(p);
    },
    douse(game, p) {
      p.burnT = 0;
      if (ECHO.Combat && ECHO.Combat.puff) for (let i = 0; i < 6; i++) ECHO.Combat.puff(p.x, p.y, { h: 0.4, vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.5) * 0.6, vz: 0.8, g: -0.5, life: 1.2, size: 5, color: '#e8eef0', smoke: true });
      if (ECHO.Sfx) ECHO.Sfx.play('hiss', { vol: 0.4 });
    },
    splashIn(game, p, wet) {
      if (!ECHO.Water || !ECHO.Water.splash) return;
      const sp = Math.hypot(p.vx, p.vy) + Math.max(0, -p.vz);
      if (wet && !p.wet) {
        ECHO.Water.splash(p.x, p.y, Math.round(4 + p.K.m * 8), Math.min(2, 0.5 + sp * 0.3));
        if (ECHO.Sfx && L.heard(game, p)) ECHO.Sfx.play('splash', { vol: Math.min(0.8, 0.2 + p.K.m * 0.4) });
        if (p.burnT > 0) L.douse(game, p);
      }
    },
    heard(game, p) { const pe = game.pe; return !!pe && Math.abs(p.x - pe.x) < 16 && Math.abs(p.y - pe.y) < 12; },
    // ------------------------------------------------------------ breaking
    color(p) { return { wood: '#8a6a48', clay: '#b0643a', cloth: '#c8b48a', straw: '#d8c070', gourd: '#e07a20', stone: '#8d8576' }[p.K.mat] || '#999999'; },
    knockSound(p, v) {
      const game = ECHO.Game;
      if (!ECHO.Sfx || !game || !L.heard(game, p) || p.wet === 'deep') return;
      const now = game.time || 0;
      if (now - (p.sndT || -9) < 0.12) return;
      p.sndT = now;
      const vol = Math.min(0.7, 0.12 + v * 0.07) * Math.min(1.4, 0.5 + p.K.m * 0.6);
      ECHO.Sfx.play(p.K.mat === 'stone' || p.K.mat === 'clay' ? 'knock' : p.K.mat === 'straw' || p.K.mat === 'cloth' ? 'thud' : 'thud', { vol, pitch: p.K.mat === 'clay' ? 1.6 : p.K.mat === 'stone' ? 1.1 : 1 / Math.sqrt(p.K.m) });
    },
    smash(game, p, by, ang) {
      if (p.gone) return;
      p.gone = true;
      L.markGone(game.world, p);
      const K = p.K, C = ECHO.Combat, col = L.color(p), a0 = ang != null ? ang : Math.random() * 6.28;
      if (C && C.puff) {
        const n = K.mat === 'straw' ? 26 : K.mat === 'clay' ? 14 : 12;
        for (let i = 0; i < n; i++) {
          const a = a0 + (Math.random() - 0.5) * 2.6, s = 1 + Math.random() * (K.mat === 'straw' ? 2.5 : 4);
          const light = K.mat === 'straw' || K.mat === 'cloth';
          C.puff(p.x, p.y, { h: K.ht * (0.3 + Math.random() * 0.5), vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 1 + Math.random() * 3.5, g: light ? 2.2 : 10, life: light ? 1.4 + Math.random() : 0.9 + Math.random() * 0.5, color: i % 3 ? col : K.mat === 'clay' ? '#7a3a1e' : K.mat === 'gourd' ? '#f2c060' : '#5a4430', size: light ? 1.4 : 2 + Math.random() * 1.4, bounce: !light });
        }
        if (K.mat === 'cloth' || K.mat === 'straw') for (let i = 0; i < 6; i++) C.puff(p.x + (Math.random() - 0.5) * 0.5, p.y + (Math.random() - 0.5) * 0.5, { h: 0.2, vx: (Math.random() - 0.5) * 0.8, vy: (Math.random() - 0.5) * 0.8, vz: 0.4, g: -0.2, life: 1.3, size: 5, color: '#d8cca0', smoke: true });
        if (K.mat === 'gourd' && C.decal) C.decal(p.x, p.y, 'slime', 0.6, 12);
      }
      if (ECHO.Sfx && L.heard(game, p)) ECHO.Sfx.play(K.mat === 'clay' ? 'shatter' : K.mat === 'wood' ? 'chop' : 'thud', { vol: 0.6, pitch: K.mat === 'wood' ? 0.8 : 1 });
      // now and then there is something in it (for you)
      const mine = by && (by === game.pe || by.pal);
      if (mine && game.pl) L.loot(game, p);
      if (mine && p.town) L.shout(game, p, SHOUT);
    },
    loot(game, p) {
      const pl = game.pl, C = ECHO.Combat, r = Math.random();
      let text = null;
      if (p.k === 'urn' && p.ruin) {
        if (r < 0.45) { const g = 3 + Math.floor(Math.random() * 10); pl.gold = (pl.gold || 0) + g; text = `+${g} crowns`; }
        else if (r < 0.55 && pl.inv) { const n = 3 + Math.floor(Math.random() * 4); pl.inv.arrows = (pl.inv.arrows || 0) + n; text = `+${n} arrows`; }
      } else if (p.k === 'pot' || p.k === 'urn') {
        if (r < 0.12) { const g = 1 + Math.floor(Math.random() * 3); pl.gold = (pl.gold || 0) + g; text = `+${g} crown${g > 1 ? 's' : ''}`; }
      } else if (p.k === 'crate') {
        if (r < 0.3 && pl.inv) { const n = 2 + Math.floor(Math.random() * 5); pl.inv.arrows = (pl.inv.arrows || 0) + n; text = `+${n} arrows`; }
        else if (r < 0.4) { const g = 2 + Math.floor(Math.random() * 5); pl.gold = (pl.gold || 0) + g; text = `+${g} crowns`; }
      }
      if (text) { if (C && C.floater) C.floater(p.x, p.y - 0.8, text, '#f2d47a'); if (ECHO.Sfx) ECHO.Sfx.play('coin', { vol: 0.5 }); }
      return text;
    },
    shout(game, p, lines) {
      const now = game.time || 0;
      if (now - (L._shoutT || -99) < 6) return null;
      let best = null, bd = 8;
      for (const e of game.ents) {
        if (e.type !== 'person' || e.dead || e.hidden || e.sleeping || (game.hostileTo && game.pe && game.hostileTo(e, game.pe))) continue;
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d < bd) { bd = d; best = e; }
      }
      if (!best) return null;
      L._shoutT = now;
      best.say = lines[Math.floor(Math.random() * lines.length)]; best.sayT = 2.6;
      return best;
    },
    // ------------------------------------------------------------ every frame
    update(game, dt) {
      const world = game.world, pe = game.pe;
      if (!world || !pe) return;
      if (L.world !== world) L.reset(world);
      for (const w of L.waves) w.t += dt;
      if (L.waves.length && L.waves[0].t > 1) L.waves = L.waves.filter(w => w.t <= 1);
      if (pe.x >= 9000 || (ECHO.Interior && ECHO.Interior.cur)) { L.inside = true; return; }
      L.inside = false;
      // (carried far in a blink — a road taken, a door, the world turning about: begin again here)
      if (L._lpx != null && Math.abs(L.wrapDx(world, pe.x - L._lpx)) + Math.abs(pe.y - L._lpy) > 6) L.clear();
      L._lpx = pe.x; L._lpy = pe.y;
      L.t += dt;
      if ((L.ensureT -= dt) <= 0) { L.ensureT = 0.5; L.ensure(game); }
      if (!L.list.length) return;
      L.bodies(game, dt);   // (and the grid: grid())
      const n = Math.max(1, Math.min(4, Math.ceil(dt * 60 - 0.01)));
      for (let s = 0; s < n; s++) for (const p of L.list) if ((p.awake || p.wet === 'deep') && !p.gone) L.step(game, p, dt / n);
      L.pairs(game);
      for (const p of L.list) {
        if (p.gone || !(p.burnT > 0)) continue;
        p.burnT -= dt;
        if (p.wet) { L.douse(game, p); continue; }
        const C = ECHO.Combat;
        if (C && C.puff && Math.random() < dt * 22) C.puff(p.x + (Math.random() - 0.5) * p.K.r, p.y + (Math.random() - 0.5) * p.K.r, { h: p.K.ht * 0.6, vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.5) * 0.5, vz: 1 + Math.random() * 1.5, g: -1.2, life: 0.6 + Math.random() * 0.5, color: Math.random() < 0.5 ? '#ffcc66' : '#ff6a2a', size: 2.2, glow: true, flicker: true });
        if (C && C.puff && Math.random() < dt * 4) C.puff(p.x, p.y, { h: p.K.ht, vz: 0.8, g: -0.6, life: 1.6, size: 6, color: '#3a3632', smoke: true });
        if (game.light && Math.random() < 0.5) game.light(p.x, p.y, 2.2, 0.6, '#ff9a3c', 0.1);
        for (const e of game.ents) if (!e.dead && Math.abs(e.x - p.x) < p.K.r + 0.3 && Math.abs(e.y - p.y) < p.K.r + 0.3 && !e._inWater && Math.random() < dt * 0.8) e.burn = Math.max(e.burn || 0, 1.5);
        if (p.burnT <= 0) {
          p.gone = true; L.markGone(world, p);
          if (C && C.puff) for (let i = 0; i < 10; i++) C.puff(p.x, p.y, { h: 0.2, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, vz: 1 + Math.random() * 2, g: 6, life: 0.8, color: '#2a2420', size: 2, bounce: true });
          if (C && C.decal) C.decal(p.x, p.y, 'scorch', p.K.r * 2.4, 20);
        }
      }
      L.sweep();
    }
  };
})();
