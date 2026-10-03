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
      return moved;
    },
    // Steer toward a point at a speed. Returns true when arrived.
    seek(world, e, tx, ty, speed, dt, arrive = 0.25) {
      const dx = tx - e.x, dy = ty - e.y;
      const d = Math.hypot(dx, dy);
      if (d < arrive) { e.moving = false; return true; }
      const sp = speed * ECHO.World.speedAt(world, e.x, e.y) * dt;
      const k = Math.min(1, sp / d);
      const before = { x: e.x, y: e.y };
      Ent.move(world, e, dx * k, dy * k);
      e.moving = true;
      e.dir = Math.atan2(dy, dx);
      if (Math.abs(dx) > 0.01) e.flip = dx < 0;
      // stuck detection → try a path
      if (Math.abs(e.x - before.x) + Math.abs(e.y - before.y) < sp * 0.15) {
        e.stuck = (e.stuck || 0) + dt;
      } else e.stuck = 0;
      return false;
    },
    // Follow an A* path (computed lazily) for longer distances.
    travel(world, e, tx, ty, speed, dt) {
      const d = U.dist(e.x, e.y, tx, ty);
      if (d < 0.4) { e.path = null; e.moving = false; return true; }
      const needPath = !e.path || e.pathGoal !== ((tx | 0) + ',' + (ty | 0)) || (e.stuck || 0) > 0.6;
      if (needPath && d > 1.5 && (e.pathT || 0) <= 0) {
        e.pathT = 0.8;
        const W = world.W;
        const cost = (x, y, i) => (ECHO.World.isSolid(world, x, y) ? Infinity : 1 / ECHO.World.speedAt(world, x, y));
        const p = ECHO.World.findPath(world, e.x, e.y, tx, ty, cost, 2500);
        e.path = p ? p.slice(1).map(i => ({ x: (i % W) + 0.5, y: ((i / W) | 0) + 0.5 })) : null;
        e.pathGoal = (tx | 0) + ',' + (ty | 0);
        e.stuck = 0;
      }
      e.pathT = (e.pathT || 0) - dt;
      if (e.path && e.path.length) {
        const n = e.path[0];
        if (Ent.seek(world, e, n.x, n.y, speed, dt, 0.3)) e.path.shift();
        return false;
      }
      return Ent.seek(world, e, tx, ty, speed, dt, 0.35);
    },
    separate(ents, dt) {
      // Soft separation between bodies.
      const n = ents.length;
      for (let i = 0; i < n; i++) {
        const a = ents[i];
        if (a.dead || a.hidden || a.ghost) continue;
        for (let j = i + 1; j < n; j++) {
          const b = ents[j];
          if (b.dead || b.hidden || b.ghost) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          if (Math.abs(dx) > 1.5 || Math.abs(dy) > 1.5) continue;
          const min = (a.r + b.r) * 0.9;
          const d2 = dx * dx + dy * dy;
          if (d2 > 0.0001 && d2 < min * min) {
            const d = Math.sqrt(d2), push = (min - d) * 0.5 * Math.min(1, dt * 12);
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
