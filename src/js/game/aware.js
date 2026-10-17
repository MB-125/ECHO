// Awareness: what every mind in the world notices, and what it does about it.
//
// The fighting minds (tactics, senses, wits) decide how to fight. This is what
// sits under all of them, for everything that can think at all:
//   · It reads the ground. Every marked blow — a monster's swing, a titan's
//     breath, a ring of ice, a poisoned pool, a rolling boulder — is a place
//     not to be. Those it can see coming step out of it before it lands, to
//     the nearest safe ground that keeps them in the fight. Your companions,
//     your beasts and the Guard do it for you; your enemies do it against
//     your beasts' arts and your friends' spells.
//   · It watches what flies at it. An arrow or a bolt on its way: a shield
//     comes up to meet it, or a quick step aside.
//   · It sees you wind up a heavy blow and, if it's quick, isn't there when
//     it lands.
//   · It picks its target. Not just whoever is nearest: whoever hurt it most,
//     whoever is nearly finished, the healer keeping the others standing.
//     And it doesn't flip-flop — it commits until there's a good reason not to.
//   · It aims where you will be, not where you were.
//   · Badly hurt, with friends at hand, it falls back behind them for a
//     breath before it comes again.
//   · And the ones with voices say so: "Move!", "Get the healer!",
//     "Cover me!" — so you can read what they mean to do.
// How well each does all this depends on what it is: a slime notices almost
// nothing, a wolf a fair amount, a veteran sergeant most things, a warden of
// the Guard everything. Nobody is perfect: a slow mind reacts late, or not at
// all.
(function () {
  const { U } = ECHO;
  const C = () => ECHO.Combat;
  // things that don't think about where they stand
  const MINDLESS = new Set(['slime', 'slimeling', 'golem', 'golemling', 'skeleton', 'skelarcher', 'giantrat', 'gnawer']);
  const FEARLESS = new Set(['skeleton', 'skelarcher', 'wight', 'king', 'slime', 'slimeling', 'golem', 'golemling', 'wraith', 'hollowking', 'necromancer']);
  // states in which a body is committed and cannot step away
  const COMMITTED = new Set(['windup', 'attack', 'lunge', 'cast', 'charge', 'strike', 'feint', 'stagger', 'yield', 'subdued', 'roar']);
  const LINES = {
    evade: ['Move!', 'Watch the ground!', 'Out of the way!', 'Look out!', 'Back!'],
    dodge: ['Ha!', 'Missed!', 'Too slow!'],
    healer: ['Get the healer!', 'Kill the healer first!', 'The healer — now!'],
    weak: ['Finish that one!', 'They\'re hurt — press them!'],
    fallback: ['Cover me!', 'Fall back — I\'m hurt!', 'Hold them off!'],
    heavy: ['Careful — a big one!', 'Back off!']
  };

  const Aw = ECHO.Aware = {
    teles: [], sayT: 0,
    // ------------------------------------------------------------ the mind behind the eyes
    // 0 (a slime) to 1 (a warden of the Guard): how much it notices, and how fast.
    iq(e) {
      if (e._iq != null) return e._iq;
      let q = 0.45;
      if (e.mentor || e.ngWard) q = 1;
      else if (e.isCompanion) q = 0.78 + Math.min(0.17, (e.compLv || 1) * 0.008);
      else if (e.tamed) q = 0.75;
      else if (e.titan || e.type === 'boss') q = 0;            // titans and great beasts fight their own way
      else if (e.species && MINDLESS.has(e.species)) q = 0.12;
      else if (e.foe) {
        const D = ECHO.Monsters && ECHO.Monsters.DEFS[e.species];
        q = e.boss2 || e.foe.elite || e.elite ? 0.85 : e.humanoid && !D ? 0.62 : D ? 0.38 + (D.tier || 1) * 0.07 : 0.5;
        if (e.gateMon) q = Math.max(q, 0.72);
      } else if (e.type === 'person') {
        const npc = ECHO.Game.world && ECHO.Game.world.npcs[e.npcId], f = npc && npc.skill ? npc.skill.fight || 20 : 20;
        q = 0.35 + f / 220 + (e.role === 'guard' || e.role === 'soldier' ? 0.15 : 0);
      } else if (e.species === 'wolf') q = 0.6;
      e._iq = U.clamp(q, 0, 1);
      return e._iq;
    },
    // Is something made by `src` dangerous to `e`? Unknown makers are the
    // monsters': dangerous to you and those on your side.
    harms(game, src, e) {
      if (src === e) return false;
      if (src && !src.dead) return game.hostileTo(src, e);
      return !!(e === game.pe || e.isCompanion || e.tamed || e.mentor || (e.type === 'person' && e.role !== 'bandit'));
    },
    inTele(f, x, y, r) {
      if (f.shape === 'circle') { const cx = f.cx != null ? f.cx : f.x, cy = f.cy != null ? f.cy : f.y; return U.dist(x, y, cx, cy) < f.radius + r; }
      if (f.shape === 'cone') { const d = U.dist(x, y, f.x, f.y); return d < f.len + r && Math.abs(U.angleDiff(f.angle, Math.atan2(y - f.y, x - f.x))) < f.arc / 2 + 0.15; }
      const lx = Math.cos(f.angle), ly = Math.sin(f.angle), t = (x - f.x) * lx + (y - f.y) * ly, p = Math.abs((x - f.x) * ly - (y - f.y) * lx);
      return t > -r && t < f.len + r && p < (f.width || 0.6) / 2 + r;
    },
    // How much harm is about to land at (x, y), for e.
    danger(game, e, x, y) {
      let s = 0;
      const r = (e.r || 0.33) * 0.8;
      for (const f of Aw.teles) {
        if (!Aw.harms(game, f.by, e) || (e._ign && e._ign.has(f))) continue;
        if (Aw.inTele(f, x, y, r)) s += f.life - f.t < 0.5 ? 2 : 1;
      }
      const A = ECHO.Apex;
      if (A) {
        for (const z of A.zones) {
          if (z.mult <= 0 && !z.pull) continue;
          if (!Aw.harms(game, z.e, e) || U.dist(x, y, z.x, z.y) > z.r + r) continue;
          if (z.safe && z.safe.some(q => U.dist(x, y, q.x, q.y) < q.r)) continue;
          s += 1.5;
        }
        for (const k of A.rocks) {
          if (!Aw.harms(game, k.e, e)) continue;
          const sp = Math.hypot(k.vx, k.vy) || 1, t = ((x - k.x) * k.vx + (y - k.y) * k.vy) / (sp * sp);
          if (t < 0 || t > 1.2) continue;
          if (U.dist(x, y, k.x + k.vx * t, k.y + k.vy * t) < k.r + r + 0.4) s += 2;
        }
      }
      return s;
    },
    // ------------------------------------------------------------ every frame
    tick(game, dt) {
      Aw.sayT -= dt;
      Aw.teles = C().fx.filter(f => f.kind === 'tele' && !f.done && f.t < f.life);
      // how everyone is moving, for those who aim ahead
      const pe = game.pe;
      if (!pe || dt <= 0) return;
      for (const e of game.ents) {
        if (e.dead || U.dist(e.x, e.y, pe.x, pe.y) > 30) continue;
        if (e._lx != null) { const k = Math.min(1, dt * 8); e._vx = (e._vx || 0) + ((e.x - e._lx) / dt - (e._vx || 0)) * k; e._vy = (e._vy || 0) + ((e.y - e._ly) / dt - (e._vy || 0)) * k; if (Math.abs(e._vx) > 30) e._vx = 0; if (Math.abs(e._vy) > 30) e._vy = 0; }
        e._lx = e.x; e._ly = e.y;
      }
    },
    // ------------------------------------------------------------ before it thinks: is it standing somewhere bad?
    eligible(game, e) {
      if (e.dead || e.hidden || e.vanish || e.seated || e.sleeping || e.mounted || e.pet || e.fauna || e.marvel || e.yielded || e.role === 'captive') return false;
      if (e.titan ? !e.tamed : e.type === 'boss') return false;
      if (COMMITTED.has(e.state) || e.atk || (e.busyUntil || 0) > game.time || e.dashing || (e.alt || 0) > 1) return false;
      if (e.foe) return !!e.aggro;
      if (e.type === 'creature') return e.species === 'wolf' && !!e.target;
      if (e.type === 'person') return e.isCompanion || e.mentor || e.state === 'chase' || !!e.threat;
      return !!e.tamed;
    },
    // Called before an entity's own update; true means it spent this moment
    // getting out of the way (and its own mind waits a beat).
    preempt(game, e, dt) {
      if (!Aw.eligible(game, e)) { e._ev = null; return false; }
      const now = game.time, pe = game.pe, world = game.world;
      // already on the move to safety
      if (e._ev) {
        if (now > e._ev.until || U.dist(e.x, e.y, e._ev.x, e._ev.y) < 0.25) e._ev = null;
        else { Aw.step(game, e, e._ev.x, e._ev.y, dt, e._ev.fast); Aw.idle(e, dt); return true; }
      }
      const q = Aw.iq(e);
      if (q < 0.05) return false;
      // a little slower to notice than to act
      e._awT = (e._awT || 0) - dt;
      if (e._awT > 0) return false;
      e._awT = 0.1;
      // something flying at it
      if (Aw.dodge(game, e, q)) return true;
      // you, winding up a heavy blow in its face
      if (e.foe && Aw.heavy(game, e, q)) return true;
      // the ground about to break under it
      for (const f of Aw.teles) {
        if (e._seenF && e._seenF.has(f)) continue;
        (e._seenF = e._seenF || new WeakSet()).add(f);
        // a slow mind may simply not see it coming
        if (Math.random() > 0.3 + 0.7 * q) (e._ign = e._ign || new WeakSet()).add(f);
      }
      const here = Aw.danger(game, e, e.x, e.y);
      if (here <= 0) { e._inD = 0; return false; }
      e._inD = (e._inD || 0) + 0.1;
      if (e._inD < 0.45 - 0.35 * q + Math.random() * 0.1) return false;
      const best = Aw.safest(game, e, here);
      if (!best) return false;
      e._ev = { x: best.x, y: best.y, until: now + 0.8, fast: true };
      e._inD = 0;
      if (Math.random() < 0.35) Aw.say(game, e, 'evade');
      void pe; void world;
      Aw.step(game, e, best.x, best.y, dt, true); Aw.idle(e, dt);
      return true;
    },
    // the nearest safe ground that keeps it in the fight
    safest(game, e, here) {
      const world = game.world, goal = e.target || (e.isCompanion || e.tamed || e.mentor ? game.pe : game.pe);
      const d0 = goal ? U.dist(e.x, e.y, goal.x, goal.y) : 0;
      let best = null, bs = here * 10;
      for (const R of [1.4, 2.4, 3.6]) for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2 + (R === 2.4 ? 0.26 : 0), x = e.x + Math.cos(a) * R, y = e.y + Math.sin(a) * R;
        if (e.titan ? ECHO.World.isSolid(world, x, y) : !ECHO.Ent.fits(world, x, y, Math.min(0.4, e.r || 0.3))) continue;
        if (ECHO.Water && !e.titan && ECHO.Water.kind(world, x, y) === 'deep') continue;
        const dg = Aw.danger(game, e, x, y);
        const s = dg * 10 + R * 0.35 + (goal ? Math.max(0, U.dist(x, y, goal.x, goal.y) - Math.max(d0, 1.5)) * 0.25 : 0);
        if (s < bs) { bs = s; best = { x, y }; }
      }
      return best;
    },
    step(game, e, x, y, dt, fast) {
      if (e.titan && ECHO.Apex) { ECHO.Apex.go(game, e, x, y, 5, dt); return; }
      ECHO.Ent.seek(game.world, e, x, y, (e.speed || 3) * (fast ? 1.3 : 1), dt, 0.15);
      e.dir = Math.atan2(y - e.y, x - e.x);
    },
    // the clock still runs while it is busy getting out of the way
    idle(e, dt) {
      if (e.cd != null) e.cd = Math.max(0, e.cd - dt);
      if (e.t != null) e.t += dt;
      if (e.sayT != null) e.sayT = Math.max(0, e.sayT - dt);
    },
    // ------------------------------------------------------------ arrows and bolts
    dodge(game, e, q) {
      const now = game.time;
      if ((e._dodgeT || 0) > now) return false;
      for (const p of C().proj) {
        if (p.done || !p.from || !Aw.harms(game, p.from, e) || (!p.vx && !p.vy)) continue;
        const dx = e.x - p.x, dy = e.y - p.y, v2 = p.vx * p.vx + p.vy * p.vy, t = (dx * p.vx + dy * p.vy) / v2;
        if (t < 0.12 + (1 - q) * 0.2 || t > 0.8) continue;
        const cx = p.x + p.vx * t - e.x, cy = p.y + p.vy * t - e.y;
        if (Math.hypot(cx, cy) > (e.r || 0.33) + 0.45 + (p.radius || 0)) continue;
        // one decision per arrow
        if (p._seen && p._seen.has(e)) continue;
        (p._seen = p._seen || new WeakSet()).add(e);
        const foeSide = !!(e.foe || e.type === 'creature' || (e.type === 'person' && game.hostileTo(game.pe, e)));
        const chance = foeSide ? 0.06 + 0.36 * q : 0.6 * q;
        if (Math.random() > chance) continue;
        e._dodgeT = now + (foeSide ? 2.6 - q : 1.4);
        // a shield comes up to meet it
        if (e.gear && e.gear.shield && e.type === 'person') { e._blockUntil = now + 0.7; e.blocking = true; e.dir = Math.atan2(-p.vy, -p.vx); return false; }
        // or a quick step aside, away from its line
        const side = (p.vx * dy - p.vy * dx) > 0 ? 1 : -1, sp = Math.sqrt(v2), nx = -p.vy / sp * side, ny = p.vx / sp * side;
        const x = e.x + nx * 1.5, y = e.y + ny * 1.5;
        if (!ECHO.Ent.fits(game.world, x, y, Math.min(0.4, e.r || 0.3))) continue;
        e._ev = { x, y, until: now + 0.4, fast: true };
        if (Math.random() < 0.3) Aw.say(game, e, 'dodge');
        return true;
      }
      return false;
    },
    // you, holding a heavy blow, with it standing in front of you
    heavy(game, e, q) {
      const PC = ECHO.PlayerCtl, pe = game.pe;
      if (!PC.heavyHold || (PC.holdT || 0) < 0.35 || q < 0.5) { e._hvSeen = false; return false; }
      if (e._hvSeen) return false;
      e._hvSeen = true;
      const d = U.dist(e.x, e.y, pe.x, pe.y), reach = (PC.derived ? PC.derived.meleeRange : 1.35) + 0.9;
      if (d > reach || Math.abs(U.angleDiff(pe.dir || 0, Math.atan2(e.y - pe.y, e.x - pe.x))) > 1.3) return false;
      if (Math.random() > (q - 0.35) * 1.2) return false;
      const a = Math.atan2(e.y - pe.y, e.x - pe.x), x = pe.x + Math.cos(a) * (reach + 0.8), y = pe.y + Math.sin(a) * (reach + 0.8);
      if (!ECHO.Ent.fits(game.world, x, y, Math.min(0.4, e.r || 0.3))) return false;
      e._ev = { x, y, until: game.time + 0.6, fast: true };
      if (Math.random() < 0.4) Aw.say(game, e, 'heavy');
      return true;
    },
    // ------------------------------------------------------------ who to fight
    // Remember who hurt it, and how much (fading over some seconds).
    hurtBy(target, from, dmg) {
      if (!from || from === target || !target.maxHp) return;
      const now = ECHO.Game.time, m = target._threat || (target._threat = new Map()), o = m.get(from);
      const v = (o ? o.v * Math.exp(-(now - o.t) / 8) : 0) + dmg / target.maxHp;
      m.set(from, { v, t: now });
    },
    threat(e, o, now) { const r = e._threat && e._threat.get(o); return r ? r.v * Math.exp(-(now - r.t) / 8) : 0; },
    // A foe of yours picks its target among you and those at your side.
    target(game, e, def) {
      const now = game.time, q = Aw.iq(e), world = game.world;
      const cands = [def];
      for (const o of game.ents) {
        if (o === def || o.dead || o.hidden || (o.alt || 0) > 1.5 || !(o.isCompanion || o.mentor || o.tamed)) continue;
        if (U.dist(o.x, o.y, e.x, e.y) > 10 || !game.hostileTo(e, o)) continue;
        cands.push(o);
      }
      if (cands.length === 1) { e._tgPick = null; return def; }
      const score = o => {
        const d = U.dist(e.x, e.y, o.x, o.y);
        let s = 10 / (1 + d) + Aw.threat(e, o, now) * 25;
        if (o === game.pe) s += 2.5;                                     // it's you they came for
        if (o.tauntT > 0 && d < 8) s += 8;
        if (q >= 0.45) s += (1 - o.hp / (o.maxHp || 1)) * 4 * q;         // the wounded are easier
        if (q >= 0.6 && o.compCls === 'mender') s += 3.5 * q;            // and the healer keeps them all up
        if (q >= 0.6 && (o.compCls === 'hunter' || o.compCls === 'mage') && e.speed > 3.6) s += 1.5;   // the quick go for the ones at the back
        if (o.tamed && o.maxHp > (def.maxHp || 100) * 8) s -= 2;          // a titan is a poor thing to fight
        if (d > 3 && !ECHO.Ent.lineOfSight(world, e.x, e.y, o.x, o.y)) s -= 4;
        return s;
      };
      // the mindless go for whatever is closest
      if (q < 0.3) return cands.reduce((a, b) => U.dist(e.x, e.y, a.x, a.y) <= U.dist(e.x, e.y, b.x, b.y) ? a : b);
      const cur = e._tgPick && !e._tgPick.dead && cands.includes(e._tgPick) ? e._tgPick : null;
      let best = cur || def, bs = score(best);
      for (const o of cands) { const s = score(o); if (s > bs) { bs = s; best = o; } }
      // don't flip-flop: change only for a clearly better reason, and not too often
      if (cur && best !== cur && (bs < score(cur) * 1.25 + 1 || now - (e._tgT || 0) < 1.6)) best = cur;
      if (best !== e._tgPick) {
        e._tgT = now;
        if (best.compCls === 'mender' && q >= 0.6) Aw.say(game, e, 'healer');
        else if (best !== def && best.hp < best.maxHp * 0.35) Aw.say(game, e, 'weak');
      }
      e._tgPick = best;
      return best;
    },
    // ------------------------------------------------------------ the chase
    // Where to run to: where it is going, not where it is — cut it off.
    intercept(game, e, T) {
      if (!T || T === e) return T;
      const q = Aw.iq(e), vx = T._vx || 0, vy = T._vy || 0, v = Math.hypot(vx, vy);
      if (q < 0.4 || v < 0.6) return T;
      const d = U.dist(e.x, e.y, T.x, T.y), t = Math.min(1.6, d / Math.max(1, e.speed || 3)) * (0.4 + 0.6 * q);
      const x = T.x + vx * t, y = T.y + vy * t;
      // never past a wall: if the cut-off point can't be reached, just follow
      if (!ECHO.Ent.fits(game.world, x, y, 0.3) || (d > 3 && !ECHO.Ent.lineOfSight(game.world, e.x, e.y, x, y))) return T;
      return { x, y };
    },
    // ------------------------------------------------------------ aim
    // Where to shoot: ahead of where it is going, as well as this one can judge.
    lead(game, e, T, speed, base) {
      if (!T) return base;
      const q = Aw.iq(e), d = U.dist(e.x, e.y, T.x, T.y), t = d / (speed || 12);
      const k = (0.35 + 0.6 * q) * (0.85 + Math.random() * 0.3);
      const x = T.x + (T._vx || 0) * t * k, y = T.y + (T._vy || 0) * t * k;
      return Math.atan2(y - e.y, x - e.x);
    },
    // ------------------------------------------------------------ a breath, behind a friend
    fallBack(game, e, T, dt) {
      const now = game.time;
      if (e._fb) {
        if (now > e._fb.until || e._fb.ally.dead) { e._fb = null; e._fbDone = true; return false; }
        const al = e._fb.ally, a = Math.atan2(al.y - T.y, al.x - T.x), x = al.x + Math.cos(a) * 2, y = al.y + Math.sin(a) * 2;
        ECHO.Ent.travel(game.world, e, x, y, (e.speed || 3) * 1.15, dt);
        e.dir = Math.atan2(T.y - e.y, T.x - e.x); e.flip = Math.cos(e.dir) < 0;
        return true;
      }
      if (e._fbDone || e.boss2 || e.giant || e.gateMon || e.hp > e.maxHp * 0.3 || Aw.iq(e) < 0.5 || (e.species && FEARLESS.has(e.species)) || (e.foe && FEARLESS.has(e.foe.look))) return false;
      let ally = null, bd = 9;
      for (const o of game.ents) {
        if (o === e || o.dead || !o.foe || !o.aggro || o.hp < o.maxHp * 0.5 || o._fb) continue;
        const d = U.dist(o.x, o.y, e.x, e.y);
        if (d < bd) { bd = d; ally = o; }
      }
      if (!ally) return false;
      e._fb = { ally, until: now + 3.5 };
      Aw.say(game, e, 'fallback');
      return true;
    },
    // ------------------------------------------------------------ voices
    say(game, e, kind) {
      if (Aw.sayT > 0 || (e.sayT || 0) > 0) return;
      if (!(e.type === 'person' || e.humanoid)) return;
      if (U.dist(e.x, e.y, game.pe.x, game.pe.y) > 14) return;
      const L = LINES[kind]; if (!L) return;
      e.say = L[Math.floor(Math.random() * L.length)]; e.sayT = 1.3; Aw.sayT = 1.4;
    }
  };
})();
