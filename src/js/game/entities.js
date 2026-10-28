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
    // Move with tile collision (axis separated) — circles against solid tiles —
    // and then against the things standing on the ground (trunks, boulders,
    // posts, tents, walls), which push the body out round their edge so it
    // slides past them instead of snagging.
    move(world, e, dx, dy) {
      const So = e.x < 9000 && !e.ghost && ECHO.Solids, W = ECHO.World;
      if (!So) return Ent.moveTiles(world, e, dx, dy, null);
      const x0 = e.x, y0 = e.y, r = e.r * 0.85;
      const stuckIn = So.hit(world, e.x, e.y, r);
      W.noTrunks = true;   // (trunks are round things on the ground now, not corners of a tile)
      let moved;
      try { moved = Ent.moveTiles(world, e, dx, dy, So); } finally { W.noTrunks = false; }
      const o = So._ro;
      if (So.resolve(world, e.x, e.y, r, null, o)) {
        W.noTrunks = true;
        let ok;
        try { ok = (o.ok || stuckIn) && Math.hypot(o.x - e.x, o.y - e.y) < Math.max(0.6, r * 1.2) && !Ent.tileBlocked(world, e, o.x, o.y, r); } finally { W.noTrunks = false; }
        if (ok) { e.x = o.x; e.y = o.y; }
        else { e.x = x0; e.y = y0; }
        moved = Math.abs(e.x - x0) + Math.abs(e.y - y0) > 1e-4;
      }
      return moved;
    },
    tileBlocked(world, e, x, y, r) {
      const solidAt = ECHO.Water ? (a, b) => ECHO.Water.blockedFor(e, world, a, b) : (a, b) => ECHO.World.isSolid(world, a, b);
      return solidAt(x - r, y - r) || solidAt(x + r, y - r) || solidAt(x - r, y + r) || solidAt(x + r, y + r);
    },
    moveTiles(world, e, dx, dy, propsLater) {
      const r = e.r * 0.85;
      // shallow water is wadeable by anyone; deep water only by you, on foot
      const solidAt = ECHO.Water ? (x, y) => ECHO.Water.blockedFor(e, world, x, y) : (x, y) => ECHO.World.isSolid(world, x, y);
      // things standing on the ground (trunks, boulders, tents, walls…); something
      // that finds itself already inside one may always step out of it
      const So = !propsLater && e.x < 9000 && !e.ghost && ECHO.Solids;
      const stuckIn = So && So.hit(world, e.x, e.y, r);
      const tight = (x, y) => solidAt(x - r, y - r) || solidAt(x + r, y - r) || solidAt(x - r, y + r) || solidAt(x + r, y + r) || (So && !stuckIn && So.hit(world, x, y, r));
      // Wedged already (set down half in a wall, a tree or the water's edge): any
      // step that keeps its middle on open ground is allowed, so it can work free.
      const wedged = (dx || dy) && tight(e.x, e.y);
      const o0 = wedged ? Ent.overlap(world, e.x, e.y, r, solidAt) : 0;
      const blocked = wedged ? (x, y) => tight(x, y) && Ent.overlap(world, x, y, r, solidAt) >= o0 : tight;
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
    // Walking where you point, through a wood: if a trunk or a boulder is square in
    // the way, the step bears round it — to the side with room (and the same side
    // as a moment ago, so it doesn't dither) — instead of pressing into it.
    steerMove(world, e, dx, dy) {
      const L = Math.hypot(dx, dy);
      if (L < 1e-6) return false;
      const x0 = e.x, y0 = e.y, now = ECHO.Game ? ECHO.Game.time : 0, a0 = Math.atan2(dy, dx);
      // threading a way through a thicket the way you are pushing (see weave)
      const Wv = e._weave;
      if (Wv && (now > Wv.until || Math.abs(U.angleDiff(Wv.a, a0)) > 0.9 || !Wv.pts.length)) e._weave = null;
      else if (Wv) {
        let p = Wv.pts[0];
        while (p && U.dist(e.x, e.y, p.x, p.y) < 0.14) { Wv.pts.shift(); p = Wv.pts[0]; }
        if (p) {
          const d = U.dist(e.x, e.y, p.x, p.y), k = Math.min(1, L / d);
          Ent.move(world, e, (p.x - e.x) * k, (p.y - e.y) * k);
          if (Math.hypot(e.x - x0, e.y - y0) > L * 0.3) return true;
          e._weave = null;
        }
      }
      Ent.move(world, e, dx, dy);
      const got = ((e.x - x0) * dx + (e.y - y0) * dy) / L;
      if (got > L * 0.6) { if (now > (e._steerUntil || 0)) e._steerSide = 0; e._pressT = 0; e._pressAt = now; return true; }
      // pressing into the trees for a moment: look for the way through, a few steps on
      e._pressT = (e._pressT || 0) + U.clamp(now - (e._pressAt == null ? now : e._pressAt), 0, 0.1);
      e._pressAt = now;
      if (e._pressT > 0.25 && now > (e._weaveT || 0)) {
        e._weaveT = now + 0.4;
        const pts = Ent.weave(world, e, a0, 4.5);
        if (pts) { e._weave = { pts, a: a0, until: now + 3 }; e._pressT = 0; }
      }
      const look = Math.max(0.5, e.r * 1.5);
      let pref = e._steerSide || 0;
      for (const off of [0.4, 0.8, 1.2]) {
        const ok = [1, -1].filter(s => Ent.clearAhead(world, e, a0 + off * s, look));
        if (!ok.length) continue;
        let s = ok.length === 1 ? ok[0] : pref && ok.includes(pref) ? pref : (Ent.clearAhead(world, e, a0 + off, look * 2.2) ? 1 : -1);
        e.x = x0; e.y = y0;     // this step again, along the way round
        Ent.move(world, e, Math.cos(a0 + off * s) * L, Math.sin(a0 + off * s) * L);
        if (Math.hypot(e.x - x0, e.y - y0) > L * 0.35) { e._steerSide = s; e._steerUntil = now + 0.6; return true; }
      }
      return Math.abs(e.x - x0) + Math.abs(e.y - y0) > 1e-4;
    },
    // The way through a thicket, looking a few steps ahead in the direction you are
    // pushing: a search over a fine grid round you for the furthest place on that
    // heading you can reach (and the path there, pulled tight). Null if none better.
    weave(world, e, a, reach) {
      const S = 0.3, N = Math.ceil(reach / S) + 2, D = N * 2 + 1, r = e.r * 0.85;
      const ox = e.x - N * S, oy = e.y - N * S, ca = Math.cos(a), sa = Math.sin(a);
      const seen = new Int32Array(D * D).fill(-2), fit = new Int8Array(D * D);
      const ok = i => { if (!fit[i]) { const cx = ox + (i % D) * S, cy = oy + ((i / D) | 0) * S; fit[i] = Ent.fits(world, cx, cy, r) && !(ECHO.Water && ECHO.Water.blockedFor(e, world, cx, cy)) ? 1 : 2; } return fit[i] === 1; };
      const start = N * D + N;
      seen[start] = -1;
      const q = [start];
      let best = -1, bs = 0.6;   // (it must get you on at least a little way)
      for (let h = 0; h < q.length; h++) {
        const i = q[h], ix = i % D, iy = (i / D) | 0, px = (ix - N) * S, py = (iy - N) * S;
        const along = px * ca + py * sa, side = Math.abs(-px * sa + py * ca);
        if (along - side * 0.35 > bs) { bs = along - side * 0.35; best = i; }
        if (Math.hypot(px, py) > reach) continue;
        for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
          const nx = ix + ddx, ny = iy + ddy;
          if (nx < 0 || ny < 0 || nx >= D || ny >= D) continue;
          const j = ny * D + nx;
          if (seen[j] !== -2 || !ok(j)) continue;
          if (ddx && ddy && (!ok(iy * D + nx) || !ok(ny * D + ix))) continue;   // no squeezing past a corner
          seen[j] = i; q.push(j);
        }
      }
      if (best < 0) return null;
      const path = [];
      for (let i = best; i !== -1 && i !== start; i = seen[i]) path.push({ x: ox + (i % D) * S, y: oy + ((i / D) | 0) * S });
      path.reverse();
      // pull it tight: skip the points you can walk straight past
      const out = []; let fx = e.x, fy = e.y;
      for (let k = 0; k < path.length; k++) {
        const nxt = path[k + 1];
        if (nxt && Ent.clearLine(world, fx, fy, nxt.x, nxt.y, r)) continue;
        out.push(path[k]); fx = path[k].x; fy = path[k].y;
      }
      return out.length ? out : null;
    },
    // How many of a body's corners (and its sides) are inside solid ground.
    overlap(world, x, y, r, solidAt) {
      let n = solidAt(x, y) ? 4 : 0;
      for (const [a, b] of [[-r, -r], [r, -r], [-r, r], [r, r], [0, -r], [0, r], [-r, 0], [r, 0]]) if (solidAt(x + a, y + b)) n++;
      return n;
    },
    // Steer toward a point at a speed. Returns true when arrived.
    seek(world, e, tx, ty, speed, dt, arrive = 0.25) {
      const dx = tx - e.x, dy = ty - e.y;
      const d = Math.hypot(dx, dy);
      // Once settled, don't twitch back into motion for a nudge of a few inches.
      if (d < arrive || (!e.moving && d < arrive + 0.45 && e.type !== 'player')) { e.moving = false; return true; }
      const sp = speed * ECHO.World.speedAt(world, e.x, e.y) * (ECHO.Climate && e.x < 9000 ? ECHO.Climate.moveMul(world, e.x, e.y, e.mounted) : 1) * dt;
      // not getting any closer (stuck, or dithering at a corner)? plan a real route
      // there for a while, instead of pushing at the obstacle
      if (!e._inTravel && e.type !== 'player' && e.x < 9000) {
        const P = e._sk && U.dist(e._sk.tx, e._sk.ty, tx, ty) < 2.5 ? e._sk : (e._sk = { tx, ty, d, t: 0 });
        P.tx = tx; P.ty = ty; P.t += dt;
        if (d < P.d - 0.5) { P.d = d; P.t = 0; }
        if (((e.stuck || 0) > 0.8 || P.t > 2) && d > 1.6) { e._planT = 4; P.t = 0; P.d = d; }
        if (e._planT > 0 && d > 1.2) {
          e._planT -= dt;
          e._inTravel = true;
          try { return Ent.travel(world, e, tx, ty, speed, dt); } finally { e._inTravel = false; }
        }
      }
      let k = Math.min(1, sp / d), mx = dx * k, my = dy * k;
      // eyes ahead: something in the way? bear round it, keeping to one side
      if (d > 0.7 && e.type !== 'player' && !e.ghost && !e._onPath && (e._lookT = (e._lookT || 0) - dt) <= 0) {
        e._lookT = 0.12;
        const a0 = Math.atan2(dy, dx), look = Math.min(d, 0.9 + speed * 0.12);
        e._bear = 0;
        if (!Ent.clearAhead(world, e, a0, look)) {
          const side = e._side || (Math.random() < 0.5 ? 1 : -1);
          for (const off of [0.4, 0.8, 1.2, 1.6, 2.1]) {
            if (Ent.clearAhead(world, e, a0 + off * side, look * 0.8)) { e._bear = off * side; break; }
            if (Ent.clearAhead(world, e, a0 - off * side, look * 0.8)) { e._bear = -off * side; e._side = -side; break; }
          }
          if (e._bear) e._side = Math.sign(e._bear);
        } else if (Math.random() < 0.05) e._side = 0;
      }
      if (e._onPath) e._bear = 0;
      if (e._bear && d > 0.7) { const a = Math.atan2(dy, dx) + e._bear, L = Math.min(sp, d); mx = Math.cos(a) * L; my = Math.sin(a) * L; }
      // other bodies: it does not walk into them, it slides round them
      e._bodyBlock = false;
      if (e.type !== 'player' && !e.ghost && (e.aggro || e.pal || e.target)) { const m0 = Math.hypot(mx, my), v = Ent.slideBodies(e, mx, my); mx = v.x; my = v.y; e._bodyBlock = Math.hypot(mx, my) < m0 * 0.5; }
      const before = { x: e.x, y: e.y };
      Ent.move(world, e, mx, my);
      e.moving = true;
      // turn toward where we actually went (not where a wall deflected us)
      if (d > arrive + 0.12) e.dir = Math.atan2(dy, dx); // no last-inch spins on arrival
      if (Math.abs(dx) > 0.3 || (Math.abs(dx) > 0.05 && Math.abs(dx) > Math.abs(dy) * 0.5)) e.flip = dx < 0;
      // stuck detection → try a path
      // (held up by other bodies is not stuck: no route round a crowd is needed, it will part)
      if (Math.abs(e.x - before.x) + Math.abs(e.y - before.y) < sp * 0.15 && !e._bodyBlock) {
        e.stuck = (e.stuck || 0) + dt;
      } else e.stuck = 0;
      return false;
    },
    // The cost of stepping onto a tile, for a body of this size: there must be
    // room for it on the tile and in the gap it steps through to get there.
    pathCost(world, e, avoid) {
      const r = U.clamp((e.r || 0.34) * 0.85, 0.22, 0.6);
      const fitsAt = (x, y) => !ECHO.World.isSolid(world, x, y) && Ent.fits(world, x, y, r);
      const spots = new Map();
      // somewhere on this tile a body this size can stand (the middle, or past a trunk to one side)
      const spot = (x, y) => {
        const k = y * (world.W || 200) + x;
        if (spots.has(k)) return spots.get(k);
        let v = null;
        for (const [ox, oy] of [[0.5, 0.5], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75], [0.5, 0.2], [0.5, 0.8], [0.2, 0.5], [0.8, 0.5]]) if (fitsAt(x + ox, y + oy)) { v = { x: x + ox, y: y + oy }; break; }
        spots.set(k, v);
        return v;
      };
      const cost = (x, y, i, fx, fy) => {
        if (avoid && avoid.has(i)) return Infinity;
        if (!spot(x, y)) return Infinity;
        // and room to get across the edge between the two tiles
        if (fx != null) {
          const mx = (x + fx) / 2 + 0.5, my = (y + fy) / 2 + 0.5, px = fy !== y ? 0.3 : 0, py = fx !== x ? 0.3 : 0;
          if (!fitsAt(mx, my) && !fitsAt(mx + px, my + py) && !fitsAt(mx - px, my - py)) return Infinity;
        }
        return 1 / ECHO.World.speedAt(world, x, y);
      };
      cost.spot = spot;
      return cost;
    },
    // Would this body be blocked standing here? (the same test Ent.move uses)
    blockedAt(world, e, x, y) {
      const r = e.r * 0.85;
      const solidAt = ECHO.Water ? (a, b) => ECHO.Water.blockedFor(e, world, a, b) : (a, b) => ECHO.World.isSolid(world, a, b);
      if (solidAt(x - r, y - r) || solidAt(x + r, y - r) || solidAt(x - r, y + r) || solidAt(x + r, y + r)) return true;
      return x < 9000 && !e.ghost && ECHO.Solids ? ECHO.Solids.hit(world, x, y, r) : false;
    },
    // Looking ahead: is the way clear for a short distance along this heading?
    clearAhead(world, e, a, len) {
      const ca = Math.cos(a), sa = Math.sin(a);
      const st = Math.min(0.3, Math.max(0.15, len / 3));
      for (let t = st; t <= len + 1e-6; t += st) if (Ent.blockedAt(world, e, e.x + ca * t, e.y + sa * t)) return false;
      return true;
    },
    // Can a body of radius r walk straight from a to b?
    clearLine(world, ax, ay, bx, by, r = 0.3) {
      const d = U.dist(ax, ay, bx, by);
      if (d < 0.01) return true;
      const ux = (bx - ax) / d, uy = (by - ay) / d, px = -uy * r, py = ux * r;
      for (let t = 0.25; t < d; t += 0.3) {
        const x = ax + ux * t, y = ay + uy * t;
        if (ECHO.World.isSolid(world, x, y) || ECHO.World.isSolid(world, x + px, y + py) || ECHO.World.isSolid(world, x - px, y - py)) return false;
        if (x < 9000 && ECHO.Solids && ECHO.Solids.hit(world, x, y, r * 0.9)) return false;
      }
      return true;
    },
    // Follow an A* path (computed lazily) for longer distances. Paths are
    // "string-pulled": corners you can see past are skipped, so walkers move
    // in smooth straight lines instead of tile-by-tile zigzags.
    // Would a body of radius r fit standing here?
    fits(world, x, y, r = 0.3) {
      const W = ECHO.World;   // (no little helper function made on every call: this runs thousands of times a second)
      return !W.isSolid(world, x, y) && !W.isSolid(world, x - r, y - r) && !W.isSolid(world, x + r, y - r) && !W.isSolid(world, x - r, y + r) && !W.isSolid(world, x + r, y + r) && !W.isSolid(world, Math.floor(x) + 0.5, Math.floor(y) + 0.5) && !(x < 9000 && ECHO.Solids && ECHO.Solids.hit(world, x, y, r));
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
      if (e._inTravel === undefined || !e._inTravel) { e._inTravel = true; try { return Ent.travel0(world, e, tx, ty, speed, dt); } finally { e._inTravel = false; } }
      return Ent.travel0(world, e, tx, ty, speed, dt);
    },
    travel0(world, e, tx, ty, speed, dt) {
      if (e.x >= 9000 || tx >= 9000) return (e.isCompanion || e.foe || e.type === 'creature' || e.type === 'boss') ? Ent.travelIn(world, e, tx, ty, speed, dt) : Ent.seek(world, e, tx, ty, speed, dt, 0.3);
      // a swimmer goes straight in after a target in the water
      if (ECHO.Water && ECHO.WildWater && ECHO.WildWater.swimmer(e) && U.dist(e.x, e.y, tx, ty) < 12 && ECHO.Water.kind(world, tx, ty)) return Ent.seek(world, e, tx, ty, speed, dt, 0.3);
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
      if (e.pathGoal !== goalKey) { e._repaths = 0; e._avoid = null; }
      const needPath = !e.path || e.pathGoal !== goalKey || (e.stuck || 0) > 0.6;
      // routes are dear: only a few are planned each frame, the rest walk straight on and ask again
      if (needPath && d > 1.2 && (e.pathT || 0) <= 0 && Ent.pathBudget <= 0) { e.pathT = 0.05 + Math.random() * 0.1; e.direct = true; e.noDirectT = 0; return Ent.seek(world, e, tx, ty, speed, dt, 0.35); }
      if (needPath && d > 1.2 && (e.pathT || 0) <= 0) {
        e.pathT = 0.8; Ent.pathBudget--;
        const W = world.W;
        if (e.pathGoal === goalKey && e.path !== undefined) {
          e._repaths = (e._repaths || 0) + 1;
          // wedged on the way: that spot is no good — plan round it this time
          if ((e.stuck || 0) > 0.6) {
            e._avoid = e._avoid || new Set();
            const ax = Math.floor(e.x), ay = Math.floor(e.y), nxt = e.path && e.path[0];
            if (nxt) e._avoid.add(Math.floor(nxt.y) * W + Math.floor(nxt.x));
            const fx = Math.floor(e.x + Math.cos(e.dir || 0) * 0.8), fy = Math.floor(e.y + Math.sin(e.dir || 0) * 0.8);
            if (fx !== ax || fy !== ay) e._avoid.add(fy * W + fx);
          }
        }
        const cost = Ent.pathCost(world, e, e._avoid);
        const p = ECHO.World.findPath(world, e.x, e.y, tx, ty, cost, Math.min(14000, Math.round(250 + d * d * 30)));   // (a short way needs only a short search)
        // each step goes to the open part of its tile (past a trunk, round a rock)
        const wp = i => { const x = i % W, y = (i / W) | 0; return cost.spot(x, y) || { x: x + 0.5, y: y + 0.5 }; };
        e.path = p ? p.slice(1).map(wp) : null;
        e.pathGoal = goalKey;
        e.stuck = 0;
        // no way there, or we keep getting stuck on the way: give up on it — and do not ask again for a while
        if (!p || e._repaths > 8) {
          e.navFail = true; e.path = null; e.pathT = 2.5 + Math.random() * 1.5;
          // close by, it still presses on straight at its goal (round what it can)
          if (d < 8) { e.direct = true; e.noDirectT = 0; return Ent.seek(world, e, tx, ty, speed, dt, 0.35); }
          e.moving = false; return false;
        }
        e.navFail = false;
        if (e.path.length) e.path[e.path.length - 1] = { x: tx, y: ty };
      }
      e.pathT = (e.pathT || 0) - dt;
      if (e.path && e.path.length) {
        // skip every waypoint we can already walk past in a straight line
        while (e.path.length > 1 && Ent.clearLine(world, e.x, e.y, e.path[1].x, e.path[1].y, e.r * 0.9)) e.path.shift();
        const n = e.path[0];
        // real progress, not just motion: dithering at a corner counts as stuck
        const dn = U.dist(e.x, e.y, n.x, n.y);
        if (!e._prog || e._prog.n !== n) e._prog = { n, d: dn, t: 0 };
        e._prog.t += dt;
        if (dn < e._prog.d - 0.25) { e._prog.d = dn; e._prog.t = 0; }
        else if (e._prog.t > 1.5) { e.stuck = 1; e._prog.t = 0; e.pathT = 0; }
        e._onPath = true;
        let arrived;
        try { arrived = Ent.seek(world, e, n.x, n.y, speed, dt, 0.3); } finally { e._onPath = false; }
        if (arrived) { e.path.shift(); e.moving = e.path.length > 0; }
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
    // How much room a body takes among other bodies: what it looks like, not the narrow
    // circle it threads between trees with (a great ogre is as wide as it is drawn).
    bodyR(e) {
      if (e._bodyR != null && e._bodyRS === e.scale) return e._bodyR;
      let r = e.r || 0.33;
      if (e.titan && ECHO.Apex && ECHO.Apex.bodyR) r = Math.max(r, ECHO.Apex.bodyR(e) * 0.8);
      else if (e.type !== 'person' && e.type !== 'player' && e.type !== 'boss') r = Math.max(r, 0.34 * (e.scale || 1));
      e._bodyR = r; e._bodyRS = e.scale;
      return r;
    },
    pathBudget: 3,
    separate(ents, dt) {
      // Bodies do not pass through one another: each pushes the other out of the room it takes,
      // the bigger shoving the smaller.
      const n = ents.length;
      for (let i = 0; i < n; i++) {
        const a = ents[i];
        if (a.dead || a.hidden || a.ghost || a.seated || a.burrowed || (a.sleeping && a.indoor)) continue;
        const ra = Ent.bodyR(a);
        for (let j = i + 1; j < n; j++) {
          const b = ents[j];
          if (b.dead || b.hidden || b.ghost || b.seated || b.burrowed || (b.sleeping && b.indoor)) continue;
          if ((a.alt || 0) > 1 || (b.alt || 0) > 1) continue;
          const rb = Ent.bodyR(b), reach = ra + rb;
          const dx = b.x - a.x, dy = b.y - a.y;
          if (Math.abs(dx) > reach || Math.abs(dy) > reach) continue;
          const min = reach * 0.92;
          const d2 = dx * dx + dy * dy;
          if (d2 < min * min) {
            const settled = !a.moving && !b.moving;
            let d = Math.sqrt(d2), ux, uy;
            if (d < 0.0001) { const ang = (i * 2.399 + j) % 6.283; ux = Math.cos(ang); uy = Math.sin(ang); d = 0; }   // right on top of each other: apart, some way
            else { ux = dx / d; uy = dy / d; }
            if (settled && d > min * 0.85) continue;  // standing shoulder to shoulder is fine
            // sunk deep into one another: out at once; a graze: eased apart
            const push = (min - d) * 0.5 * (d < min * 0.7 ? 0.9 : Math.min(1, dt * (settled ? 6 : 12)));
            // the heavier gives less ground (a lair's beast hardly at all)
            const ma = a.type === 'boss' ? 9 : ra * ra, mb = b.type === 'boss' ? 9 : rb * rb;
            const wa = ma / (ma + mb);   // (the share of the push b takes: the heavier a is, the more b gives)
            a.pushx = (a.pushx || 0) - ux * push * (1 - wa) * 2;
            a.pushy = (a.pushy || 0) - uy * push * (1 - wa) * 2;
            b.pushx = (b.pushx || 0) + ux * push * wa * 2;
            b.pushy = (b.pushy || 0) + uy * push * wa * 2;
          }
        }
      }
    },
    // A step (mx, my) for e with whatever part of it runs into another body taken out: it slides
    // along them instead.
    slideBodies(e, mx, my) {
      const ents = ECHO.Game && ECHO.Game.ents;
      if (!ents || e.ghost || (e.alt || 0) > 1) return { x: mx, y: my };
      const re = Ent.bodyR(e);
      for (const o of ents) {
        if (o === e || o.dead || o.hidden || o.ghost || o.seated || o.burrowed || (o.alt || 0) > 1) continue;
        const ox = o.x - e.x, oy = o.y - e.y, lim = re + Ent.bodyR(o);
        if (Math.abs(ox) > lim + 0.5 || Math.abs(oy) > lim + 0.5) continue;
        if (Math.hypot(ox - mx, oy - my) >= lim * 0.92) continue;
        const od = Math.hypot(ox, oy) || 0.0001, ux = ox / od, uy = oy / od, inward = mx * ux + my * uy;
        if (inward > 0) { mx -= ux * inward; my -= uy * inward; }   // (keep only the sideways part of the step)
      }
      return { x: mx, y: my };
    },
    applyPush(world, e) {
      if (e.pushx || e.pushy) { Ent.move(world, e, e.pushx || 0, e.pushy || 0); e.pushx = 0; e.pushy = 0; }
      if (e.kbx || e.kby) {
        // thrown back, it is stopped by the bodies behind it (it does not pass through them)
        if (e.type !== 'player') { const v = Ent.slideBodies(e, e.kbx, e.kby); e.kbx = v.x; e.kby = v.y; }
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
