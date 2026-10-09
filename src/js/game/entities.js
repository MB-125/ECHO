// Real-time entities: the player, creatures, people and bosses near the player.
// People entities are bodies for persistent NPC records in the simulation.
(function () {
  const { U } = ECHO;
  let NEXT = 1;

  const Ent = ECHO.Ent = {
    make(o) {
      return Object.assign({
        id: NEXT++, type: 'creature', x: 0, y: 0, vx: 0, vy: 0, r: 0.35, hp: 10, maxHp: 10, dir: 0, flip: false,
        speed: 3, state: 'idle', t: 0, cd: 0, hurtT: 0, dead: false, faction: 'wild', npcId: null, species: null,
        regionId: null, gear: {}, ai: {}, stagger: 0, iframes: 0, anim: 0, moving: false, kbx: 0, kby: 0, burn: 0,
        label: null, say: null, sayT: 0, hidden: false, aggro: false, yielded: false, sleeping: false
      }, o);
    },
    // Move with tile collision (axis separated) — circles against solid tiles.
    move(world, e, dx, dy) {
      const r = e.r * 0.85;
      // shallow water is wadeable by anyone; deep water only by you, on foot
      const solidAt = ECHO.Water ? (x, y) => ECHO.Water.blockedFor(e, world, x, y) : (x, y) => ECHO.World.isSolid(world, x, y);
      const blocked = (x, y) => solidAt(x - r, y - r) || solidAt(x + r, y - r) || solidAt(x - r, y + r) || solidAt(x + r, y + r);
      let moved = false;
      if (dx) {
        const nx = e.x + dx;
        if (!blocked(nx, e.y)) { e.x = nx; moved = true; }
        else if (!e.noSlide) {
          // slide around corners
          for (const off of [0.2, -0.2]) if (!blocked(nx, e.y + off) && !blocked(e.x, e.y + off)) { e.y += off * 0.5; break; }
        }
      }
      if (dy) {
        const ny = e.y + dy;
        if (!blocked(e.x, ny)) { e.y = ny; moved = true; }
        else if (!e.noSlide) {
          for (const off of [0.2, -0.2]) if (!blocked(e.x + off, ny) && !blocked(e.x + off, e.y)) { e.x += off * 0.5; break; }
        }
      }
      // Still stuck (a tree trunk, a post): glance off it at an angle.
      if (!moved && !e.noSlide && (dx || dy) && !e._sliding) {
        e._sliding = true;
        const L = Math.hypot(dx, dy), a0 = Math.atan2(dy, dx);
        for (const da of [0.6, -0.6, 1.1, -1.1]) {
          const nx = Math.cos(a0 + da) * L * 0.9, ny = Math.sin(a0 + da) * L * 0.9;
          if (!blocked(e.x + nx, e.y + ny)) { e.x += nx; e.y += ny; moved = true; break; }
        }
        e._sliding = false;
      }
      return moved;
    },
    // Steer toward a point at a speed. Returns true when arrived.
    seek(world, e, tx, ty, speed, dt, arrive = 0.25) {
      const dx = tx - e.x, dy = ty - e.y;
      const d = Math.hypot(dx, dy);
      // Once settled, don't twitch back into motion for a nudge of a few inches.
      if (d < arrive || (!e.moving && d < arrive + 0.45 && e.type !== 'player')) { e.moving = false; return true; }
      const sp = speed * ECHO.World.speedAt(world, e.x, e.y) * dt;
      const k = Math.min(1, sp / d);
      const before = { x: e.x, y: e.y };
      Ent.move(world, e, dx * k, dy * k);
      e.moving = true;
      // turn toward where we actually went (not where a wall deflected us)
      if (d > arrive + 0.12) e.dir = Math.atan2(dy, dx); // no last-inch spins on arrival
      if (Math.abs(dx) > 0.3 || (Math.abs(dx) > 0.05 && Math.abs(dx) > Math.abs(dy) * 0.5)) e.flip = dx < 0;
      // stuck detection → try a path
      if (Math.abs(e.x - before.x) + Math.abs(e.y - before.y) < sp * 0.15) {
        e.stuck = (e.stuck || 0) + dt;
      } else e.stuck = 0;
      return false;
    },
    // Can a body of radius r walk straight from a to b?
    clearLine(world, ax, ay, bx, by, r = 0.3) {
      const d = U.dist(ax, ay, bx, by);
      if (d < 0.01) return true;
      const ux = (bx - ax) / d, uy = (by - ay) / d, px = -uy * r, py = ux * r;
      for (let t = 0.25; t < d; t += 0.3) {
        const x = ax + ux * t, y = ay + uy * t;
        if (ECHO.World.isSolid(world, x, y) || ECHO.World.isSolid(world, x + px, y + py) || ECHO.World.isSolid(world, x - px, y - py)) return false;
      }
      return true;
    },
    // Follow an A* path (computed lazily) for longer distances. Paths are
    // "string-pulled": corners you can see past are skipped, so walkers move
    // in smooth straight lines instead of tile-by-tile zigzags.
    // Would a body of radius r fit standing here?
    fits(world, x, y, r = 0.3) {
      const S = (a, b) => ECHO.World.isSolid(world, a, b);
      return !S(x, y) && !S(x - r, y - r) && !S(x + r, y - r) && !S(x - r, y + r) && !S(x + r, y + r) && !S(Math.floor(x) + 0.5, Math.floor(y) + 0.5);
    },
    // The nearest place to (x, y) where a body can actually stand — a goal
    // inside a wall, a tree or a pond is moved to the closest open ground.
    freeSpot(world, x, y, maxR = 5, r = 0.32) {
      if (Ent.fits(world, x, y, r)) return { x, y };
      for (let rad = 0.5; rad <= maxR; rad += 0.5) {
        const n = Math.max(8, Math.round(rad * 8));
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
          if (Ent.fits(world, px, py, r)) return { x: px, y: py };
        }
      }
      return null;
    },
    // Follow an A* path (computed lazily) for longer distances. Paths are
    // "string-pulled": corners you can see past are skipped, so walkers move
    // in smooth straight lines instead of tile-by-tile zigzags.
    // Walkers never shove against a wall: an impossible goal is moved to open
    // ground, a blocked straight line falls back to a path, and a goal with no
    // way there at all sets e.navFail so the walker can choose something else.
    travel(world, e, tx, ty, speed, dt) {
      if (e.x >= 9000 || tx >= 9000) return (e.isCompanion || e.foe || e.type === 'creature' || e.type === 'boss') ? Ent.travelIn(world, e, tx, ty, speed, dt) : Ent.seek(world, e, tx, ty, speed, dt, 0.3);
      // where can we actually stand near the goal?
      const key = Math.round(tx * 4) + ',' + Math.round(ty * 4);
      if (e._navKey !== key) {
        e._navKey = key;
        e._navTo = Ent.freeSpot(world, tx, ty, 5);
        e.navFail = !e._navTo;
      }
      if (!e._navTo) { e.moving = false; e.path = null; return false; }
      tx = e._navTo.x; ty = e._navTo.y;
      const d = U.dist(e.x, e.y, tx, ty);
      if (d < 0.4) { e.path = null; e.moving = false; e._repaths = 0; return true; }
      // In the open: just walk there.
      e.losT = (e.losT || 0) - dt;
      e.noDirectT = Math.max(0, (e.noDirectT || 0) - dt);
      if (e.losT <= 0) { e.losT = 0.25; e.direct = e.noDirectT <= 0 && d < 18 && Ent.clearLine(world, e.x, e.y, tx, ty, e.r * 0.9); }
      if (e.direct) {
        e.path = null;
        const r = Ent.seek(world, e, tx, ty, speed, dt, 0.35);
        // the straight line lied (a trunk, a corner): plan a proper route instead
        if ((e.stuck || 0) > 0.4) { e.direct = false; e.noDirectT = 3; e.losT = 0.25; }
        return r;
      }
      const goalKey = (tx | 0) + ',' + (ty | 0);
      if (e.pathGoal !== goalKey) e._repaths = 0;
      const needPath = !e.path || e.pathGoal !== goalKey || (e.stuck || 0) > 0.6;
      if (needPath && d > 1.2 && (e.pathT || 0) <= 0) {
        e.pathT = 0.8;
        if (e.pathGoal === goalKey && e.path !== undefined) e._repaths = (e._repaths || 0) + 1;
        const W = world.W;
        const cost = (x, y, i) => (ECHO.World.isSolid(world, x + 0.5, y + 0.5) ? Infinity : 1 / ECHO.World.speedAt(world, x, y));
        const p = ECHO.World.findPath(world, e.x, e.y, tx, ty, cost, 2500);
        // through a wood, step past each trunk rather than into it
        const wp = i => {
          const x = i % W, y = (i / W) | 0;
          if (world.tiles[i] !== ECHO.TILE.TREE) return { x: x + 0.5, y: y + 0.5 };
          const tr = ECHO.World.trunk(world, x, y);
          let ox = x + 0.5 - tr.x, oy = y + 0.5 - tr.y; const L = Math.hypot(ox, oy) || 1;
          if (L < 0.45) { ox = ox / L * 0.45; oy = oy / L * 0.45; }
          return { x: tr.x + ox, y: tr.y + oy };
        };
        e.path = p ? p.slice(1).map(wp) : null;
        e.pathGoal = goalKey;
        e.stuck = 0;
        // no way there, or we keep getting stuck on the way: give up on it
        if (!p || e._repaths > 4) { e.navFail = true; e.path = null; e.moving = false; return false; }
        e.navFail = false;
        if (e.path.length) e.path[e.path.length - 1] = { x: tx, y: ty };
      }
      e.pathT = (e.pathT || 0) - dt;
      if (e.path && e.path.length) {
        // skip every waypoint we can already walk past in a straight line
        while (e.path.length > 1 && Ent.clearLine(world, e.x, e.y, e.path[1].x, e.path[1].y, e.r * 0.9)) e.path.shift();
        const n = e.path[0];
        if (Ent.seek(world, e, n.x, n.y, speed, dt, 0.3)) { e.path.shift(); e.moving = e.path.length > 0; }
        return false;
      }
      if (e.navFail) { e.moving = false; return false; }
      const r = Ent.seek(world, e, tx, ty, speed, dt, 0.35);
      if ((e.stuck || 0) > 1.2) { e.navFail = true; e.moving = false; }
      return r;
    },
    // Finding the way inside a room or a dungeon floor: rooms and corridors, round
    // corners and through doorways, instead of walking straight into the wall.
    travelIn(world, e, tx, ty, speed, dt) {
      const c = ECHO.Interior && ECHO.Interior.cur;
      if (!c || e.x < 9000 || tx < 9000) return Ent.seek(world, e, tx, ty, speed, dt, 0.3);
      const B = ECHO.Interior.BASE, W = c.W, H = c.H;
      const d = U.dist(e.x, e.y, tx, ty);
      if (d < 0.4) { e.moving = false; e.ipath = null; return true; }
      if (Ent.clearLine(world, e.x, e.y, tx, ty, e.r * 0.9)) { e.ipath = null; return Ent.seek(world, e, tx, ty, speed, dt, 0.35); }
      const gk = (tx | 0) + ',' + (ty | 0);
      e.ipathT = (e.ipathT || 0) - dt;
      if ((!e.ipath || e.ipathGoal !== gk || (e.stuck || 0) > 0.5) && e.ipathT <= 0) {
        e.ipathT = 0.5; e.ipathGoal = gk; e.stuck = 0;
        const goal = Ent.freeSpot(world, tx, ty, 3) || { x: tx, y: ty };
        const open = (x, y) => x >= 0 && y >= 0 && x < W && y < H && c.blocked[y * W + x] !== 1;
        const cost = (x, y, i) => (c.blocked[i] === 1 ? Infinity : (open(x + 1, y) && open(x - 1, y) && open(x, y + 1) && open(x, y - 1) ? 1 : 1.6));
        const p = ECHO.World.findPath({ W, H }, e.x - B, e.y, goal.x - B, goal.y, cost, 6000);
        e.ipath = p ? p.slice(1).map(i => ({ x: (i % W) + B + 0.5, y: ((i / W) | 0) + 0.5 })) : null;
      }
      if (e.ipath && e.ipath.length) {
        while (e.ipath.length > 1 && Ent.clearLine(world, e.x, e.y, e.ipath[1].x, e.ipath[1].y, e.r * 0.9)) e.ipath.shift();
        const n = e.ipath[0];
        if (Ent.seek(world, e, n.x, n.y, speed, dt, 0.3)) e.ipath.shift();
        e.moving = true;
        return false;
      }
      return Ent.seek(world, e, tx, ty, speed, dt, 0.35);
    },
    separate(ents, dt) {
      // Soft separation between bodies.
      const n = ents.length;
      for (let i = 0; i < n; i++) {
        const a = ents[i];
        if (a.dead || a.hidden || a.ghost || a.seated || (a.sleeping && a.indoor)) continue;
        for (let j = i + 1; j < n; j++) {
          const b = ents[j];
          if (b.dead || b.hidden || b.ghost || b.seated || (b.sleeping && b.indoor)) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          if (Math.abs(dx) > 1.5 || Math.abs(dy) > 1.5) continue;
          const min = (a.r + b.r) * 0.9;
          const d2 = dx * dx + dy * dy;
          if (d2 > 0.0001 && d2 < min * min) {
            const settled = !a.moving && !b.moving;
            const d = Math.sqrt(d2);
            if (settled && d > min * 0.6) continue;  // standing side by side is fine
            const push = (min - d) * 0.5 * Math.min(1, dt * (settled ? 4 : 8));
            const ux = dx / d, uy = dy / d;
            const wa = a.type === 'boss' ? 0.1 : b.type === 'boss' ? 0.9 : 0.5;
            a.pushx = (a.pushx || 0) - ux * push * (1 - wa) * 2;
            a.pushy = (a.pushy || 0) - uy * push * (1 - wa) * 2;
            b.pushx = (b.pushx || 0) + ux * push * wa * 2;
            b.pushy = (b.pushy || 0) + uy * push * wa * 2;
          }
        }
      }
    },
    applyPush(world, e) {
      if (e.pushx || e.pushy) { Ent.move(world, e, e.pushx || 0, e.pushy || 0); e.pushx = 0; e.pushy = 0; }
      if (e.kbx || e.kby) {
        Ent.move(world, e, e.kbx, e.kby);
        e.kbx *= 0.7; e.kby *= 0.7;
        if (Math.abs(e.kbx) + Math.abs(e.kby) < 0.005) { e.kbx = 0; e.kby = 0; }
      }
    },
    lineOfSight(world, ax, ay, bx, by) {
      const d = U.dist(ax, ay, bx, by);
      const steps = Math.ceil(d * 2);
      if (ax >= 9000) {
        for (let i = 1; i < steps; i++) { const t = i / steps; if (ECHO.Interior.isSolid(U.lerp(ax, bx, t), U.lerp(ay, by, t)) && i < steps - 1) return false; }
        return true;
      }
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const x = U.lerp(ax, bx, t), y = U.lerp(ay, by, t);
        const tile = ECHO.World.tile(world, x, y);
        if (tile === ECHO.TILE.TREE || tile === ECHO.TILE.ROCK || tile === ECHO.TILE.RUINWALL) return false;
        if (world.blocked[(y | 0) * world.W + (x | 0)]) return false;
      }
      return true;
    }
  };
})();
