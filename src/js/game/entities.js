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
      const solidAt = (x, y) => ECHO.World.isSolid(world, x, y);
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
    travel(world, e, tx, ty, speed, dt) {
      if (e.x >= 9000 || tx >= 9000) return Ent.seek(world, e, tx, ty, speed, dt, 0.3);
      const d = U.dist(e.x, e.y, tx, ty);
      if (d < 0.4) { e.path = null; e.moving = false; return true; }
      // In the open: just walk there.
      e.losT = (e.losT || 0) - dt;
      if (e.losT <= 0) { e.losT = 0.25; e.direct = d < 18 && Ent.clearLine(world, e.x, e.y, tx, ty, e.r * 0.9); }
      if (e.direct) { e.path = null; return Ent.seek(world, e, tx, ty, speed, dt, 0.35); }
      const needPath = !e.path || e.pathGoal !== ((tx | 0) + ',' + (ty | 0)) || (e.stuck || 0) > 0.6;
      if (needPath && d > 1.5 && (e.pathT || 0) <= 0) {
        e.pathT = 0.8;
        const W = world.W;
        const cost = (x, y, i) => (ECHO.World.isSolid(world, x + 0.5, y + 0.5) ? Infinity : 1 / ECHO.World.speedAt(world, x, y));
        const p = ECHO.World.findPath(world, e.x, e.y, tx, ty, cost, 2500);
        e.path = p ? p.slice(1).map(i => ({ x: (i % W) + 0.5, y: ((i / W) | 0) + 0.5 })) : null;
        e.pathGoal = (tx | 0) + ',' + (ty | 0);
        e.stuck = 0;
      }
      e.pathT = (e.pathT || 0) - dt;
      if (e.path && e.path.length) {
        // skip every waypoint we can already walk past in a straight line
        while (e.path.length > 1 && Ent.clearLine(world, e.x, e.y, e.path[1].x, e.path[1].y, e.r * 0.9)) e.path.shift();
        const n = e.path[0];
        if (Ent.seek(world, e, n.x, n.y, speed, dt, 0.3)) { e.path.shift(); e.moving = e.path.length > 0; }
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
