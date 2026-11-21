// Yard: the animals that live among people — the life of a town you see out of the corner of your eye.
//
// Hens peck about the doors of the houses and scatter, wings going, when you run through them; at
// dusk they are shut in. Cats sit on doorsteps and wash, slink off along the walls if you rush at
// them, and go prowling after dark. Dogs trot the streets on their own business, come and walk at
// your heel for a while if you are near, and settle by a door at night. Out by the fields, sheep
// graze in a loose flock, cows stand chewing, pigs root about the edge of town; they drift as they
// graze, lie down at night, and the sheep bunch and trot off when someone comes running through.
//
// None of it is saved: they are the town's own, made fresh from its houses and fields whenever you
// come near (the same town makes the same animals, in the same yards), and gone when you leave.
(function () {
  const { U } = ECHO;
  const T = ECHO.TILE;
  const rnd = (h, k) => ECHO.hash2(h, k, 7);

  const SPEC = {
    hen: { walk: 0.55, run: 2.6, r: 0.12, scare: 1.7 },
    cat: { walk: 0.6, run: 3.4, r: 0.14, scare: 2.0 },
    dog: { walk: 1.25, run: 3.2, r: 0.2, scare: 0 },
    sheep: { walk: 0.35, run: 2.2, r: 0.3, scare: 2.6 },
    cow: { walk: 0.3, run: 1.4, r: 0.45, scare: 1.3 },
    pig: { walk: 0.4, run: 1.8, r: 0.28, scare: 1.6 }
  };

  const Y = ECHO.Yard = {
    list: [], sid: null, t: 0,
    reset() { Y.list = []; Y.sid = null; },
    hour(world) { return (world.minute / 60) % 24; },
    free(world, x, y) {
      if (ECHO.World.isSolid(world, x, y)) return false;
      if (ECHO.Ent && ECHO.Ent.fits && !ECHO.Ent.fits(world, x, y, 0.22)) return false;     // (walls, trunks, wells, carts)
      const t = ECHO.World.tile(world, Math.floor(x), Math.floor(y));
      return t !== T.WATER && t !== T.DEEP && t !== T.ROCK;
    },
    // a spot near (x, y) an animal can stand on
    spot(world, x, y, r, h) {
      for (let k = 0; k < 10; k++) {
        const a = rnd(h, k) * Math.PI * 2, d = r * (0.3 + rnd(h, k + 40) * 0.7);
        const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
        if (Y.free(world, px, py)) return { x: px, y: py };
      }
      return null;
    },
    add(world, kind, home, h, roam) {
      const p = Y.spot(world, home.x, home.y, roam * 0.6, h);
      if (!p) return;
      Y.list.push({ kind, x: p.x, y: p.y, home, roam, dir: rnd(h, 3) * 6.28, st: 'idle', t: rnd(h, 5) * 3, wt: 0, z: 0, hidden: false,
        coat: rnd(h, 9), peck: 0, anim: rnd(h, 11) * 10, follow: 0, id: h });
    },
    // the town's own animals, from its houses and the fields about it
    populate(world, s) {
      Y.list = [];
      const base = ECHO.hashStr(s.id);
      const houses = s.buildings.filter(b => b.type === 'house' && !b.ruined && b.gutted == null);
      const door = b => ({ x: b.x + b.w / 2, y: b.y + b.h + 0.9 });
      houses.forEach((b, i) => {
        const h = base + i * 131;
        if (rnd(h, 1) < 0.42) { const n = 2 + Math.floor(rnd(h, 2) * 3); for (let k = 0; k < n; k++) Y.add(world, 'hen', door(b), h + k * 17, 3.2); }
        if (rnd(h, 3) < 0.2) Y.add(world, 'cat', door(b), h + 7, 2.4);
      });
      const dogs = Math.max(1, Math.min(5, Math.round(houses.length / 6)));
      for (let k = 0; k < dogs; k++) { const b = houses[(base + k * 7) % Math.max(1, houses.length)]; if (b) Y.add(world, 'dog', door(b), base + 900 + k * 29, Math.max(8, (s.reach || 12) * 0.8)); }
      // out by the fields: grass at the edge of the farmland
      const R0 = (s.reach || 12) + 2, R1 = R0 + 9, pens = [];
      for (let k = 0; k < 80 && pens.length < 4; k++) {
        const a = rnd(base, 200 + k) * Math.PI * 2, d = R0 + rnd(base, 300 + k) * (R1 - R0);
        const x = s.x + Math.cos(a) * d, y = s.y + Math.sin(a) * d;
        const t = ECHO.World.tile(world, Math.floor(x), Math.floor(y));
        if (t !== T.GRASS || !Y.free(world, x, y)) continue;
        let farm = false;
        for (let dy = -3; dy <= 3 && !farm; dy++) for (let dx = -3; dx <= 3; dx++) if (ECHO.World.tile(world, Math.floor(x) + dx, Math.floor(y) + dy) === T.FARM) { farm = true; break; }
        if (!farm || pens.some(p => U.dist(p.x, p.y, x, y) < 7)) continue;
        pens.push({ x, y });
      }
      pens.forEach((p, i) => {
        const h = base + 5000 + i * 97, kind = ['sheep', 'cow', 'sheep', 'pig'][i % 4];
        const n = kind === 'sheep' ? 4 + Math.floor(rnd(h, 1) * 4) : kind === 'cow' ? 2 + Math.floor(rnd(h, 1) * 2) : 2 + Math.floor(rnd(h, 1) * 2);
        for (let k = 0; k < n; k++) Y.add(world, kind, p, h + k * 13, kind === 'sheep' ? 4.5 : 3.5);
      });
    },
    // ------------------------------------------------------------ minds
    move(world, a, tx, ty, sp, dt) {
      const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy);
      if (d < 0.05) return true;
      const st = Math.min(d, sp * dt), nx = a.x + dx / d * st, ny = a.y + dy / d * st;
      a.dir = Math.atan2(dy, dx);
      if (Y.free(world, nx, ny)) { a.x = nx; a.y = ny; }
      else if (Y.free(world, nx, a.y)) a.x = nx;
      else if (Y.free(world, a.x, ny)) a.y = ny;
      else { a.wt = 0; return true; }      // (a wall: think again)
      a.moving = true;
      return d < 0.12;
    },
    // what frightens them: you running (or riding) at them, or anyone fighting close by
    fright(game, a) {
      const pe = game.pe, S = SPEC[a.kind];
      if (!S.scare) return null;
      const d = U.dist(a.x, a.y, pe.x, pe.y);
      const fast = Math.hypot(pe.vx || 0, pe.vy || 0) > 2.6 || pe.mounted;
      const sneak = ECHO.PlayerCtl && ECHO.PlayerCtl.sneaking && !pe.mounted;
      if (!sneak && (d < S.scare * (fast ? 1.6 : 0.75))) return pe;
      return null;
    },
    think(game, a, dt) {
      const world = game.world, S = SPEC[a.kind], hr = Y.hour(world), pe = game.pe;
      const night = hr >= 21 || hr < 5.5;
      a.moving = false; a.anim += dt; a.t -= dt;
      // shut in for the night (hens), or curled up by the door (the rest lie down where they are)
      if (a.kind === 'hen') {
        if (night) { if (!a.hidden && Y.move(world, a, a.home.x, a.home.y - 0.6, S.walk * 1.6, dt)) a.hidden = true; return; }
        if (a.hidden) { a.hidden = false; }
      }
      const fr = Y.fright(game, a);
      if (fr) { a.st = 'flee'; a.t = 0.8 + Math.random() * 0.8; a.from = { x: fr.x, y: fr.y }; }
      if (a.st === 'flee') {
        const ang = Math.atan2(a.y - a.from.y, a.x - a.from.x) + Math.sin(a.anim * 5 + a.id) * 0.5;
        Y.move(world, a, a.x + Math.cos(ang) * 2, a.y + Math.sin(ang) * 2, S.run, dt);
        if (a.kind === 'hen') a.z = Math.abs(Math.sin(a.anim * 14)) * 0.18;     // (a flurry of wings)
        if (a.t <= 0) { a.st = 'idle'; a.z = 0; a.wt = 1 + Math.random() * 2; }
        return;
      }
      a.z = 0;
      // a dog comes to walk with you a while, then goes about its business
      if (a.kind === 'dog' && !night) {
        const d = U.dist(a.x, a.y, pe.x, pe.y);
        if (a.follow <= 0 && d < 3 && Math.random() < dt * 0.05) a.follow = 15 + Math.random() * 20;
        if (a.follow > 0) {
          a.follow -= dt;
          if (d > 16) a.follow = 0;
          else if (d > 1.8) { Y.move(world, a, pe.x - Math.cos(pe.dir || 0) * 1.1, pe.y - Math.sin(pe.dir || 0) * 1.1, d > 4 ? S.run : S.walk * 1.6, dt); return; }
          else { a.dir = Math.atan2(pe.y - a.y, pe.x - a.x); return; }
        }
      }
      // graze, peck, sit and wash, wander a little — and, at night, lie down
      a.wt -= dt;
      if (a.wt <= 0) {
        a.wt = (night ? 20 : a.kind === 'dog' ? 4 : 3) + Math.random() * (night ? 30 : 7);
        const roam = night ? Math.min(1.2, a.roam) : a.roam * (a.kind === 'cat' && night ? 2 : 1);
        a.goal = a.kind === 'dog' && !night ? Y.spot(world, a.home.x, a.home.y, roam, a.id + Math.floor(game.time * 3)) : Y.spot(world, a.home.x, a.home.y, roam, a.id + Math.floor(game.time));
        a.walk = !night && Math.random() < (a.kind === 'dog' ? 0.75 : 0.45);
        a.peck = 0;
      }
      if (a.walk && a.goal) { if (Y.move(world, a, a.goal.x, a.goal.y, S.walk, dt)) a.walk = false; }
      a.rest = night && a.kind !== 'cat';
      if (!a.moving && !night) a.peck = (a.kind === 'hen' || a.kind === 'sheep' || a.kind === 'cow' || a.kind === 'pig') ? 1 : 0;
    },
    update(game, dt) {
      if (!game || !game.pe || !game.world || (ECHO.Interior && ECHO.Interior.cur)) return;
      const world = game.world, pe = game.pe;
      if (Y.w !== world) { Y.reset(); Y.w = world; Y.t = 0; }
      Y.t -= dt;
      if (Y.t <= 0) {
        Y.t = 2;
        let best = null, bd = Infinity;
        for (const s of world.settlements) { const d = U.dist(s.x, s.y, pe.x, pe.y) - (s.reach || 12); if (d < bd) { bd = d; best = s; } }
        const near = best && bd < 22 ? best : null;
        if (!near) { if (Y.list.length) Y.reset(); }
        else if (Y.sid !== near.id) { Y.sid = near.id; try { Y.populate(world, near); } catch (e) { Y.list = []; } }
      }
      for (const a of Y.list) {
        if (U.dist(a.x, a.y, pe.x, pe.y) > 34) continue;      // (far off: still, until you come near)
        Y.think(game, a, dt);
      }
    }
  };
})();
