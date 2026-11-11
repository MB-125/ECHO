// ECHO.Savvy — what a fighting thing knows about the newer ways of being killed.
//   Aware lets it see an arrow or a marked piece of ground. This is the rest:
//     – UNDER THE GUN: while you hold a gun on it, a thing with any sense will not walk down
//       the barrel: it weaves, side to side, still coming;
//     – LOCKED: the one your launcher has locked runs for something to put between you; those
//       standing by it get away from it (and from where a salvo is about to land);
//     – ON FIRE: it runs for water if there is water (and is soaked for it, which you can use);
//       a man rolls the worst of it out in the dirt; a beast only runs;
//     – WARD BROKEN: with its ward gone it backs away for a few breaths, behind the others;
//     – A SHATTER seen close makes the ones beside it flinch back, and the pack lose heart.
//   Nothing here is saved: it is all of the moment.
(function () {
  const { U } = ECHO;
  const C = () => ECHO.Combat;

  const W = ECHO.Savvy = {
    big(e) { return !!(e.titan || e.type === 'boss' || e.boss2 || e.lord || e.giant); },
    bold(game, e) { return W.big(e) || !!(ECHO.Tactics && ECHO.Tactics.fearless(game, e)); },
    ok(game, e, x, y) {
      return ECHO.Ent.fits(game.world, x, y, Math.min(0.4, e.r || 0.3)) && !(ECHO.Water && ECHO.Water.kind(game.world, x, y) === 'deep');
    },
    go(game, e, x, y, t, fast) {
      if (!W.ok(game, e, x, y)) return false;
      e._ev = { x, y, until: game.time + t, fast: fast !== false };
      return true;
    },
    // called from Aware.preempt, ten times a second for each thing in a fight
    think(game, e, q) {
      if (!(e.burn > 0)) e._rolled = false;
      if (W.big(e)) return false;
      if (e.burn > 0.4 && q >= 0.3 && W.burning(game, e, q)) return true;
      if (!game.hostileTo(game.pe, e)) return false;
      if (e._shaken && W.shaken(game, e, q)) return true;
      if (ECHO.Guns) {
        if (W.missile(game, e, q)) return true;
        if (W.gun(game, e, q)) return true;
      }
      return false;
    },
    // ------------------------------------------------------------ on fire
    burning(game, e, q) {
      const now = game.time, world = game.world, Wt = ECHO.Water;
      if ((e._burnT || 0) > now) return false;
      e._burnT = now + 0.5;
      if (Wt && Wt.kind(world, e.x, e.y)) {
        e.burn = 0;
        if (ECHO.React) ECHO.React.soak(game, e, 5);
        C().floater(e.x, e.y - 1.2, 'doused', '#7fc8ff');
        return false;
      }
      if (Wt) {
        let best = null, bd = 1e9;
        for (const R of [1.5, 3, 4.5, 6]) for (let i = 0; i < 10; i++) {
          const a = i / 10 * Math.PI * 2 + R, x = e.x + Math.cos(a) * R, y = e.y + Math.sin(a) * R, k = Wt.kind(world, x, y);
          if (!k || k === 'deep' || ECHO.World.isSolid(world, x, y)) continue;
          if (R < bd) { bd = R; best = { x, y }; }
        }
        if (best) {
          e._ev = { x: best.x, y: best.y, until: now + 1.8, fast: true };
          if (e.humanoid || e.type === 'person') { if (!(e.sayT > 0)) { e.say = 'Water — water!'; e.sayT = 1.5; } }
          return true;
        }
      }
      // no water: a man rolls it out (and is open while he does); a beast only runs
      if (e.humanoid || e.type === 'person') {
        if (e._rolled || q < 0.4) return false;
        e._rolled = true;
        e.burn *= 0.35;
        e.stagger = Math.max(e.stagger || 0, 0.7);
        C().floater(e.x, e.y - 1.2, 'rolls out the fire', '#ffb070');
        return false;
      }
      e._burnT = now + 1.4;
      const pe = game.pe, a = Math.atan2(e.y - pe.y, e.x - pe.x) + (Math.random() - 0.5) * 2.2;
      return W.go(game, e, e.x + Math.cos(a) * 2.6, e.y + Math.sin(a) * 2.6, 0.7);
    },
    // ------------------------------------------------------------ its ward just broke
    shaken(game, e, q) {
      const now = game.time, S = e._shaken, pe = game.pe;
      if (now > S.until) { e._shaken = null; return false; }
      if (now < S.from || q < 0.35 || W.bold(game, e)) return false;
      const d = U.dist(e.x, e.y, pe.x, pe.y);
      if (d > 6) return false;
      e.token = false; e.restT = now + 1.5;
      const a = Math.atan2(e.y - pe.y, e.x - pe.x);
      for (const off of [0, 0.7, -0.7]) if (W.go(game, e, e.x + Math.cos(a + off) * 2.4, e.y + Math.sin(a + off) * 2.4, 0.5)) return true;
      return false;
    },
    // ------------------------------------------------------------ a missile is coming (or about to)
    missile(game, e, q) {
      const now = game.time, GU = ECHO.Guns, pe = game.pe;
      if ((e._mslT || 0) > now) return false;
      let cx = 0, cy = 0, R = 0, me = false;
      const L = GU.lock;
      if (L && L.on && L.e && !L.e.dead && U.dist(e.x, e.y, L.e.x, L.e.y) < 3) { cx = L.e.x; cy = L.e.y; R = 3; me = L.e === e; }
      else for (const p of C().proj) {
        if (p.done || p.kind !== 'missile' || !ECHO.Aware.harms(game, p.from, e)) continue;
        const s = p.seek, x = p.air ? p.tx : s && !s.dead ? s.x : null, y = p.air ? p.ty : s && !s.dead ? s.y : null;
        if (x == null) continue;
        const rr = (p.radius || 1.5) + 1.3;
        if (U.dist(e.x, e.y, x, y) < rr) { cx = x; cy = y; R = rr; me = s === e; break; }
      }
      if (!R) return false;
      e._mslT = now + 1.1;
      if (Math.random() > 0.15 + 0.85 * q) return false;      // (a dull thing stands and looks at it)
      if (me) {
        // the one it is meant for: put something between it and you, or failing that, run across your aim
        if (q >= 0.55) {
          let best = null, bd = 1e9;
          for (const r of [2, 3.5]) for (let i = 0; i < 12; i++) {
            const a = i / 12 * Math.PI * 2, x = e.x + Math.cos(a) * r, y = e.y + Math.sin(a) * r;
            if (!W.ok(game, e, x, y) || ECHO.Ent.lineOfSight(game.world, pe.x, pe.y, x, y)) continue;
            if (r < bd) { bd = r; best = { x, y }; }
          }
          if (best) { e._ev = { x: best.x, y: best.y, until: now + 1.1, fast: true }; if (Math.random() < 0.5) ECHO.Aware.say(game, e, 'evade'); return true; }
        }
        const a = Math.atan2(e.y - pe.y, e.x - pe.x), s = Math.random() < 0.5 ? 1 : -1;
        return W.go(game, e, e.x - Math.sin(a) * s * 2.2, e.y + Math.cos(a) * s * 2.2, 0.6) || W.go(game, e, e.x + Math.sin(a) * s * 2.2, e.y - Math.cos(a) * s * 2.2, 0.6);
      }
      // standing by the one it is meant for: get clear
      const d = U.dist(e.x, e.y, cx, cy), a = d > 0.05 ? Math.atan2(e.y - cy, e.x - cx) : Math.random() * 6.28, far = R - d + 1.2;
      if (W.go(game, e, e.x + Math.cos(a) * far, e.y + Math.sin(a) * far, 0.8)) { if (Math.random() < 0.3) ECHO.Aware.say(game, e, 'evade'); return true; }
      return false;
    },
    // ------------------------------------------------------------ you are holding a gun on it
    gun(game, e, q) {
      const GU = ECHO.Guns, pe = game.pe, now = game.time;
      if (!GU.aiming || q < 0.4 || (e._wvT || 0) > now) return false;
      const d = U.dist(e.x, e.y, pe.x, pe.y);
      if (d < 2.6 || d > 15) return false;
      const a = Math.atan2(e.y - pe.y, e.x - pe.x);
      if (Math.abs(U.angleDiff(GU.aimA != null ? GU.aimA : pe.dir || 0, a)) > 0.3) return false;
      e._wvT = now + 1.7 - q + Math.random() * 0.6;
      if (Math.random() > 0.3 + 0.6 * q) return false;
      if (!ECHO.Ent.lineOfSight(game.world, pe.x, pe.y, e.x, e.y)) return false;
      e._wvS = -(e._wvS || (Math.random() < 0.5 ? 1 : -1));
      const s = e._wvS, fw = ECHO.Tactics && ECHO.Tactics.ranged(e) ? 0 : -0.7;
      return W.go(game, e, e.x - Math.sin(a) * s * 1.4 + Math.cos(a) * fw, e.y + Math.cos(a) * s * 1.4 + Math.sin(a) * fw, 0.42)
        || W.go(game, e, e.x + Math.sin(a) * s * 1.4 + Math.cos(a) * fw, e.y - Math.cos(a) * s * 1.4 + Math.sin(a) * fw, 0.42);
    },
    // ------------------------------------------------------------ told of things by React
    wardBroke(game, e, worn) { e._shaken = { from: game.time + (worn ? 0.6 : 1.6), until: game.time + (worn ? 2.6 : 4.6) }; },
    // one of them burst into ice beside the others
    spook(game, e, from) {
      const now = game.time;
      for (const o of game.ents) {
        if (o === e || o.dead || o === game.pe || !game.hostileTo(game.pe, o) || U.dist(o.x, o.y, e.x, e.y) > 5.5) continue;
        if (!(o.foe ? o.aggro : o.target) || W.bold(game, o) || ECHO.Aware.iq(o) < 0.2) continue;
        if (o.atk || (o.busyUntil || 0) > now) continue;
        const a = Math.atan2(o.y - e.y, o.x - e.x);
        o.token = false; o.restT = now + 1 + Math.random();
        W.go(game, o, o.x + Math.cos(a) * 2.2, o.y + Math.sin(a) * 2.2, 0.6);
      }
      const s = ECHO.Tactics && from && ECHO.Tactics.squads.get(from);
      if (s) s.shock = Math.min(0.5, (s.shock || 0) + 0.14);
    }
  };
})();
