// Blows that throw: a body struck hard enough leaves its feet.
//
// A blow carries so much push (its "knock"), and what it sends flying goes by its weight: a rat
// a long way, a man some way, a troll hardly at all (a lair's beast and a titan stand where they
// are). Struck harder than its feet can hold, a body leaves the ground — up, over, and down — and
// slides on the ground after; it lands with a thump (and a bounce, if it came down hard), slams
// into a wall if one is in the way (that hurts), and bowls into whatever else stands in its path,
// sending that off too. While it is off its feet it can do nothing; it gets up again a moment
// after it lands. The dead go the same way, thrown by the blow that killed them, turning over as
// they fly, and lie where they come down.
// Kept on the body (never saved): tvx, tvy (its way along the ground, leagues a second), tz, tvz
// (its height and its way up), tspin and tw (how far over it has turned, and how fast), tBy (who
// threw it). The old pushes (kbx, kby: so far, at once) become a slide of about the same length.
(function () {
  const { U } = ECHO;
  const GRAV = 18;
  const T = ECHO.Thrown = {
    J: 13,          // the push of a blow, for each part of its knock (a grown man struck with 1 goes off at 13 a second)
    LAUNCH: 6,      // sent off faster than this, it leaves the ground (you: 9)
    CAP: 13,        // no faster than this
    mass(e) { return ECHO.Ent && ECHO.Ent.massOf ? ECHO.Ent.massOf(e) : 1; },
    can(e) { return !!e && !e.titan && e.type !== 'boss' && !e.marvel && !e.ghost && !e.burrowed && !e.submerged && !((e.alt || 0) > 0.6) && !e.inBoat && !e.seated && !e.noThrow && !e.pilloried; },
    active(e) { return !!(e.tvx || e.tvy || e.tz > 0 || e.tvz > 0 || (e.tspin && !e.tSet)); },
    // a blow of so much knock, this way (combat.js: every blow, and the blow that kills)
    hit(game, e, knock, angle, from, o) {
      if (!T.can(e) || !(knock > 0) || angle == null) return 0;
      o = o || {};
      const pl = e === game.pe;
      if (pl && game.pl && (game.pl.mounted || game.pl.flying)) return 0;   // (in the saddle, the horse takes it: player.js)
      let dv = Math.min(T.CAP, knock * T.J / Math.pow(T.mass(e), 0.75));
      if (e.mounted) dv *= 0.4;   // (a rider is held by his seat; a heavy blow unhorses him: riders.js)
      if (e.swimming || e._inWater === 'deep') dv *= 0.5;
      T.add(e, Math.cos(angle) * dv, Math.sin(angle) * dv, from);
      // hard enough, and off its feet
      const lim = pl ? 9 : T.LAUNCH;
      if (dv > lim && !e.swimming && !e._inWater && !e.mounted) {
        const vz = Math.min(pl ? 3 : 5.5, (dv - lim) * 0.8 + 1.5);
        if (vz > (e.tvz || 0)) {
          if (!(e.tz > 0)) { e.tvx *= 0.8; e.tvy *= 0.8; }   // (some of the blow goes into lifting it)
          e.tvz = vz; e.tz = Math.max(e.tz || 0, 0.001); e.tSet = false;
          e.tw = (dv / 2.4) * (o.kill ? 1.7 : 1);
          e.tAir = 0;
        }
      }
      return dv;
    },
    add(e, vx, vy, from) {
      e.tvx = (e.tvx || 0) + vx; e.tvy = (e.tvy || 0) + vy; e.tSet = false;
      const sp = Math.hypot(e.tvx, e.tvy);
      if (sp > T.CAP) { e.tvx *= T.CAP / sp; e.tvy *= T.CAP / sp; }
      if (from && from !== e) e.tBy = from;
      e._mvx = e._mvy = 0;   // (whatever way of its own it had, it has lost)
      if (e === (ECHO.Game && ECHO.Game.pe) && ECHO.PlayerCtl && ECHO.PlayerCtl.vel) { ECHO.PlayerCtl.vel.x = 0; ECHO.PlayerCtl.vel.y = 0; }
    },
    // the old pushes: so far, at once — now a slide of about that length
    legacy(game, e) {
      const kb = Math.hypot(e.kbx || 0, e.kby || 0);
      if (kb > 1e-4) {
        const D = kb / 0.3, v0 = D * 6 + 0.6;
        T.add(e, e.kbx / kb * v0, e.kby / kb * v0, null);
      }
      e.kbx = 0; e.kby = 0;
    },
    heard(game, e) { const pe = game.pe; return !!pe && Math.abs(e.x - pe.x) < 16 && Math.abs(e.y - pe.y) < 12; },
    // ------------------------------------------------------------ every frame (game.js)
    update(game, dt) {
      if (!(dt > 0)) return;
      const world = game.world;
      for (const e of game.ents) {
        if (e.vanish) continue;
        if (!T.can(e) && (e.tvx || e.tvy || e.tz > 0)) { e.tvx = e.tvy = e.tvz = 0; e.tz = 0; e.tspin = 0; continue; }
        if (!T.active(e)) continue;
        const n = Math.min(4, Math.ceil(dt * 60 - 0.01));   // (in steps of a sixtieth: as far at any frame rate)
        for (let i = 0; i < n && T.active(e); i++) T.step(game, world, e, dt / n);
      }
    },
    step(game, world, e, dt) {
      const air = e.tz > 0 || e.tvz > 0;
      if (air) {
        e.tvz -= GRAV * dt; e.tz += e.tvz * dt;
        const kd = Math.exp(-0.5 * dt); e.tvx *= kd; e.tvy *= kd;
        e.tspin = (e.tspin || 0) + (e.tw || 0) * dt;
        e.tAir = (e.tAir || 0) + dt;
        if (!e.dead) e.stagger = Math.max(e.stagger || 0, 0.2);
        if (e.tz <= 0) T.land(game, e);
      } else {
        // on the ground: it slides, and the ground takes the way off it
        const sp = Math.hypot(e.tvx || 0, e.tvy || 0);
        if (sp > 0) {
          const ice = ECHO.Climate && e.x < 9000 && ECHO.Climate.onIce && ECHO.Climate.onIce(world, e.x, e.y);
          const k = ice ? 0.6 : e.dead ? 6 : 5, c = ice ? 0.4 : 3;
          const ns = sp * Math.exp(-k * dt) - c * dt;
          if (ns <= 0.05) { e.tvx = e.tvy = 0; } else { e.tvx *= ns / sp; e.tvy *= ns / sp; }
        }
        // the dead settle on their back or their front; the living get their feet under them
        if (e.tspin) {
          if (e.dead) { const to = Math.round(e.tspin / Math.PI) * Math.PI, d = to - e.tspin; e.tspin += d * Math.min(1, dt * 10); if (Math.abs(d) < 0.01) { e.tspin = to || 0; e.tSet = true; } }
          else { e.tspin *= Math.exp(-dt * 7); if (Math.abs(e.tspin) < 0.02) e.tspin = 0; }
        }
      }
      const sp = Math.hypot(e.tvx || 0, e.tvy || 0);
      if (sp < 0.01) return;
      const dx = e.tvx * dt, dy = e.tvy * dt, x0 = e.x, y0 = e.y;
      ECHO.Ent.move(world, e, dx, dy);
      const mx = e.x - x0, my = e.y - y0;
      // a wall (or a tree, or the water's edge) in the way
      if (Math.abs(mx) < Math.abs(dx) * 0.5 || Math.abs(my) < Math.abs(dy) * 0.5) {
        const ax = Math.abs(mx) < Math.abs(dx) * 0.5, ay = Math.abs(my) < Math.abs(dy) * 0.5;
        const into = Math.hypot(ax ? e.tvx : 0, ay ? e.tvy : 0);
        const wet = ECHO.Water && e.x < 9000 && ECHO.Water.kind(world, e.x + Math.sign(dx) * 0.6, e.y + Math.sign(dy) * 0.6);
        if (ax) e.tvx = -e.tvx * 0.2;
        if (ay) e.tvy = -e.tvy * 0.2;
        if (into > 3 && !wet) T.slam(game, e, into);
      }
      // and whoever stands in its way
      if (sp > 3.2) {
        const re = ECHO.Ent.bodyR ? ECHO.Ent.bodyR(e) : e.r || 0.35;
        for (const o of game.ents) {
          if (o === e || o.dead || o.hidden || o === e.tBy || o.burrowed || (o.alt || 0) > 0.6 || o.tz > 0.8) continue;
          const ox = o.x - e.x, oy = o.y - e.y, lim = re + (ECHO.Ent.bodyR ? ECHO.Ent.bodyR(o) : o.r || 0.35);
          if (Math.abs(ox) > lim || Math.abs(oy) > lim || ox * ox + oy * oy > lim * lim) continue;
          if (e._knT && e._knId === o.id && game.time - e._knT < 0.4) continue;
          T.bowl(game, e, o, ox, oy);
        }
      }
    },
    // down it comes
    land(game, e) {
      const fall = -(e.tvz || 0);
      e.tz = 0;
      // (the dead come down heavily, and stay down)
      if (fall > 5 && !e.swimming) { e.tvz = fall * (e.dead ? 0.18 : 0.28); const k = e.dead ? 0.55 : 0.7; e.tvx *= k; e.tvy *= k; e.tz = 0.001; e.tw = (e.tw || 0) * 0.5; }
      else { e.tvz = 0; const k = e.dead ? 0.6 : 0.82; e.tvx *= k; e.tvy *= k; e.tw = 0; }
      const C = ECHO.Combat;
      if (C && C.puff && fall > 2) for (let i = 0; i < 5; i++) { const a = Math.random() * 6.28; C.puff(e.x + Math.cos(a) * 0.3, e.y + Math.sin(a) * 0.3, { h: 0.05, vx: Math.cos(a) * 1.4, vy: Math.sin(a) * 1.4, vz: 0.3, g: -0.2, life: 0.8, size: 3.5, color: '#b8a888', smoke: true }); }
      if (fall > 3 && ECHO.Sfx && T.heard(game, e)) ECHO.Sfx.play('thud', { vol: Math.min(0.7, 0.2 + fall * 0.05), pitch: 0.8 / Math.sqrt(Math.max(0.5, T.mass(e))) });
      if (fall > 6 && game.pe && Math.hypot(e.x - game.pe.x, e.y - game.pe.y) < 8 && game.shake) game.shake(Math.min(0.25, fall * 0.02));
      // off its feet a while, the longer the higher it went
      if (!e.dead && e.tvz === 0) e.stagger = Math.max(e.stagger || 0, 0.3 + Math.min(0.6, (e.tAir || 0) * 0.6));
    },
    // into a wall: that hurts
    slam(game, e, v) {
      const C = ECHO.Combat;
      if (C && C.burst) C.burst(e.x, e.y, '#b8a888', 8, 3, 0.5, 2);
      if (ECHO.Sfx && T.heard(game, e)) ECHO.Sfx.play('stomp', { vol: Math.min(0.6, 0.15 + v * 0.04) });
      if (game.pe && Math.hypot(e.x - game.pe.x, e.y - game.pe.y) < 8 && v > 6 && game.shake) game.shake(Math.min(0.2, v * 0.015));
      if (e.dead || v < 5) return 0;
      e.stagger = Math.max(e.stagger || 0, 0.6);
      const dmg = (e.maxHp || 0) * Math.min(0.08, 0.02 + 0.03 * (v - 5) / 3) * (e === game.pe ? 0.5 : 1);
      if (dmg > 0 && C && C.damage) C.damage(e, dmg, { type: 'impact', from: e.tBy && !e.tBy.dead ? e.tBy : null, knock: 0 });
      return dmg;
    },
    // into another body: it takes the way on, and is sent off in turn (and both are hurt, if it
    // was hard, and the one in the way is a foe of whoever threw it)
    bowl(game, a, b, ox, oy) {
      const d = Math.hypot(ox, oy) || 0.001, nx = ox / d, ny = oy / d;
      const vn = ((a.tvx || 0) - (b.tvx || 0)) * nx + ((a.tvy || 0) - (b.tvy || 0)) * ny;
      if (vn < 2) return 0;
      a._knT = game.time; a._knId = b.id;
      const ma = T.mass(a), mb = T.mass(b), J = 1.2 * vn * ma * mb / (ma + mb);
      a.tvx -= nx * J / ma; a.tvy -= ny * J / ma;
      if (T.can(b) && !(b === game.pe && game.pl && game.pl.mounted)) {
        const dvb = J / mb;
        T.add(b, nx * dvb, ny * dvb, a.tBy || a);
        if (dvb > T.LAUNCH && b !== game.pe) { b.tvz = Math.max(b.tvz || 0, Math.min(4, (dvb - T.LAUNCH) * 0.6 + 1)); b.tz = Math.max(b.tz || 0, 0.001); b.tw = dvb / 3; b.tAir = 0; }
        if (!b.dead) b.stagger = Math.max(b.stagger || 0, 0.4);
      }
      if (ECHO.Sfx && T.heard(game, b)) ECHO.Sfx.play('thud', { vol: Math.min(0.6, 0.2 + vn * 0.04), pitch: 0.9 });
      const by = a.tBy;
      if (vn > 6 && by && !b.dead && b !== by && game.hostileTo && game.hostileTo(by, b) && ECHO.Combat && ECHO.Combat.damage) ECHO.Combat.damage(b, (b.maxHp || 0) * 0.03, { type: 'impact', from: by, knock: 0 });
      return J;
    }
  };
})();
