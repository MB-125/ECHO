// Your beast as a partner, not a piece of furniture.
//
// A bound dragon or great beast has a mind of its own. It reads what is going
// on around you and decides what it wants to do, moment to moment:
//   · it fights beside you — going first for whatever is hurting you, then for
//     what you are fighting — and fights like itself: a dragon takes to the air
//     against a crowd and strafes it with its breath; when it is badly hurt it
//     pulls back, circles out of reach or stands off behind you to lick its
//     wounds, and comes back in when it is ready;
//   · when you travel it keeps you company at its own pace — ambling, trotting,
//     loping to catch up, or flying ahead and coming down near you;
//   · when you stop it finds itself something to do: it settles near you and
//     watches the land, wanders off to sniff at something, stretches its wings,
//     lies down for a rest when you linger, or (a dragon) takes a turn round the
//     sky above you;
//   · it gets hungry, and when it is, it hunts the deer and hares nearby and
//     eats what it catches;
//   · it grows closer to you over time — riding together, fighting together,
//     a hand on its neck (E) — and the closer it is, the nearer it keeps, the
//     harder it guards you and the more it greets you when you come back.
// It moves like an animal: it turns in arcs at its own pace, gathers speed and
// slows to a stop, looks at what catches its eye, and lies down, sniffs,
// stretches and eats where you can see it (the renderer reads e.pt).
(function () {
  const { U } = ECHO;
  const A = () => ECHO.Apex;
  const Ti = () => ECHO.Titans;
  const UI = () => ECHO.UI;
  const PREY = new Set(['deer', 'hare']);

  const P = ECHO.Partner = {
    // ------------------------------------------------------------ who it is
    // a temperament of its own, fixed for each beast
    trait(t) {
      if (t._tr) return t._tr;
      const h = ECHO.hashStr(t.id || t.name || 'x'), f = k => ((h >> (k * 4)) & 15) / 15;
      return (t._tr = { bold: 0.3 + f(0) * 0.7, curious: 0.2 + f(1) * 0.8, playful: 0.15 + f(2) * 0.85, calm: 0.2 + f(3) * 0.8 });
    },
    bondWord(b) { return b >= 90 ? 'inseparable' : b >= 70 ? 'devoted' : b >= 45 ? 'trusting' : b >= 20 ? 'settling in' : 'wary'; },
    bond(t, d) { t.bond = U.clamp((t.bond || 0) + d, 0, 100); },
    // what it is doing, in words (for the Animals page)
    doing(e) {
      const pt = e && e.pt;
      if (!pt) return 'at your side';
      return ({ fight: 'fighting beside you', regroup: 'pulling back to lick its wounds', follow: 'keeping pace with you', hunt: pt.prey ? `hunting a ${pt.prey.species === 'hare' ? 'hare' : 'deer'}` : 'hunting', eat: 'eating its kill', greet: 'greeting you',
        idle: pt.sub === 'rest' ? 'lying down, resting' : pt.sub === 'sniff' ? 'sniffing at something' : pt.sub === 'circle' ? 'circling the sky above you' : pt.sub === 'stretch' ? 'stretching its wings' : 'keeping watch' })[pt.intent] || 'at your side';
    },
    emote(e, txt, col) {
      const pt = e.pt, now = ECHO.Game.time;
      if (pt.emoteT && now < pt.emoteT) return;
      pt.emoteT = now + 2.5;
      ECHO.Combat.floater(e.x, e.y - 2.4 * (e.tscale || 1) - (e.alt || 0), txt, col || '#ffe08a');
    },

    // ------------------------------------------------------------ moving like an animal
    // Steer toward (tx, ty) at up to `want`: it turns in arcs at a rate that
    // suits its size, gathers speed and eases to a stop, and slows to turn.
    // Returns the distance left.
    move(game, e, tx, ty, want, dt, arrive) {
      const pt = e.pt, world = game.world, now = game.time;
      arrive = arrive || 0.6;
      // in the air, wanting to come down where there is no room for it (a wood, a
      // town's roofs): it makes for a clearing near there instead — or, if there is
      // none, it circles above until there is
      if (e.flies && e.alt > 1 && e._noLand) {
        if (!pt.landAt || now > pt.landT || U.dist(pt.landAt.x, pt.landAt.y, tx, ty) > 9) { pt.landAt = A().clearing(world, e, tx, ty, 8); pt.landT = now + 2.5; }
        if (pt.landAt) { tx = pt.landAt.x; ty = pt.landAt.y; arrive = 0.4; }
        else { pt.orb = (pt.orb || Math.atan2(e.y - ty, e.x - tx)) + dt * 0.45; tx += Math.cos(pt.orb) * 5; ty += Math.sin(pt.orb) * 4; arrive = 0.3; want = Math.max(want, 5); }
      } else if (!e._noLand) pt.landAt = null;
      const d = U.dist(e.x, e.y, tx, ty);
      if (pt.hd == null) pt.hd = e.dir || 0;
      const air = e.flies && e.alt > 1.2;
      let goal = d > 0.05 ? Math.atan2(ty - e.y, tx - e.x) : pt.hd;
      const err = U.angleDiff(pt.hd, goal);
      // speed it wants: ease in to stop where it is going; slow to turn hard
      let sp = d <= arrive ? 0 : Math.min(want, (d - arrive) * (air ? 0.8 : 1.4) + 0.4);
      if (Math.abs(err) > 1.4 && !air) sp = Math.min(sp, 1.2);
      const acc = air ? 5 : 3.5 / Math.sqrt(e.tscale || 1), dec = air ? 5 : 6;
      pt.spd = (pt.spd || 0) + U.clamp(sp - (pt.spd || 0), -dec * dt, acc * dt);
      // turn: quicker standing still or walking, wider at a run or in the air
      const size = Math.sqrt(e.tscale || 1);
      const rate = (air ? 1.6 : pt.spd < 1.5 ? 2.4 : pt.spd < 4 ? 2.0 : 1.5) / size;
      const turn = U.clamp(err, -rate * dt, rate * dt);
      pt.hd += turn;
      pt.yaw = dt > 0 ? turn / dt : 0;
      e.dir = pt.hd; e.flip = Math.cos(pt.hd) < 0;
      const s = pt.spd * dt;
      if (s <= 0.0005) { e.moving = false; pt.gait = 0; return d; }
      if (air) {
        e.moving = A().airStep(game, e, pt.hd, s);
        if (!e.moving) pt.spd *= 0.6;
      } else {
        // its body is stopped by trunks, rocks, walls and water as yours is: it bears
        // round them, keeping to one side
        const off = A().walk(game, e, pt.hd, s);
        const moved = off != null;
        if (off) pt.hd += off * Math.min(1, dt * 4);
        e.moving = moved;
        if (!moved) pt.spd *= 0.5;
        pt.blockT = moved ? 0 : (pt.blockT || 0) + dt;
        if (e.flies) {
          // a dragon that sees a wood or a wall of rock between it and where it is
          // going (or is boxed in) takes to the air over it rather than push through
          let over = pt.blockT > 0.5;
          if (!over && d > 3.5 && now > (pt.wayT || 0)) { pt.wayT = now + 0.35; over = !A().wayClear(world, e, goal, Math.min(d, 4.8)) && !A().wayClear(world, e, goal + 0.6, 3.6) && !A().wayClear(world, e, goal - 0.6, 3.6); }
          if (over) { P.takeOff(game, e, Math.max(4, (A().canopy(world, e.x + Math.cos(goal) * 3, e.y + Math.sin(goal) * 3, 2) || 0) + 1.5)); pt.blockT = 0; pt.overUntil = now + 2.5; }
        } else if (pt.blockT > 1.5 && d > 2) {
          // a great beast that can't get through tries the other way round
          e._wside = -(e._wside || 1); pt.blockT = 0.6;
        }
      }
      pt.gait = pt.spd;
      return d;
    },
    // a dragon going any distance flies; it comes down near where it is going
    travel(game, e, tx, ty, want, dt, arrive) {
      const d = U.dist(e.x, e.y, tx, ty);
      if (e.flies) {
        if (d > 22 && e.alt < 1) P.takeOff(game, e, 5);
        if (e.altGoal > 1 && d < 7 && game.time > (e.pt.overUntil || 0)) e.altGoal = 0;     // coming in to land (where there's room: see move)
        if (e.alt > 1.2) return P.move(game, e, tx, ty, Math.max(want, Math.min(14, d * 0.6)), dt, arrive);
      }
      return P.move(game, e, tx, ty, want, dt, arrive);
    },
    takeOff(game, e, h) {
      if (e.altGoal >= h - 0.1) return;
      e.altGoal = h;
      if (e.alt < 0.5) { ECHO.Combat.ring(e.x, e.y, 2.5 * (e.tscale || 1), 'rgba(230,220,200,0.55)', 0.5); for (let i = 0; i < 10; i++) { const a = Math.random() * 6.28; ECHO.Combat.fx.push({ kind: 'smoke', x: e.x + Math.cos(a), y: e.y + Math.sin(a), vx: Math.cos(a) * 2.5, vy: 0, t: 0, life: 1, size: 3, sh: 0.3 }); } }
    },
    // turn on the spot to look at something
    face(e, x, y, dt) {
      const pt = e.pt;
      if (pt.hd == null) pt.hd = e.dir || 0;
      const err = U.angleDiff(pt.hd, Math.atan2(y - e.y, x - e.x));
      if (Math.abs(err) < 0.35) return;
      const turn = U.clamp(err, -1.4 * dt, 1.4 * dt);
      pt.hd += turn; pt.yaw = dt > 0 ? turn / dt : 0;
      e.dir = pt.hd; e.flip = Math.cos(pt.hd) < 0;
    },

    // ------------------------------------------------------------ what it sees
    foes(game, e) {
      const pe = game.pe, out = [];
      for (const o of game.ents) {
        if (o.dead || o.hidden || o === e || o.tamed || o.isCompanion || o.ngWard || o === pe) continue;
        if (!(o.foe || (o.type === 'boss' && !o.tamed) || (o.type === 'creature' && game.hostileTo(pe, o) && (o.aggro || o.target === pe)) || (o.type === 'person' && game.hostileTo(pe, o)))) continue;
        if (o.titan && o.state === 'subdued') continue;
        const dp = U.dist(o.x, o.y, pe.x, pe.y), de = U.dist(o.x, o.y, e.x, e.y);
        if (dp < 14 || (de < 10 && dp < 22)) out.push(o);
      }
      return out;
    },
    // whom to go for: what is hurting you first, then what you are fighting, then the nearest to you
    pickFoe(game, e, foes) {
      const pe = game.pe, now = game.time, pt = e.pt, Aw = ECHO.Aware, lock = ECHO.PlayerCtl && ECHO.PlayerCtl.lock;
      if (pt.foe && foes.includes(pt.foe) && now < (pt.foeUntil || 0)) return pt.foe;
      let best = null, bs = -1e9;
      for (const o of foes) {
        let s = -U.dist(o.x, o.y, pe.x, pe.y) * 0.6 - U.dist(o.x, o.y, e.x, e.y) * 0.25;
        if (Aw && Aw.threat) s += Aw.threat(pe, o, now) * 60;           // it hurt you
        if (o === lock || o === game.lastHitTarget) s += 6;               // you are fighting it
        if (o.target === pe || o.aggro) s += 2;
        if (o === pt.foe) s += 2;
        if (s > bs) { bs = s; best = o; }
      }
      if (best !== pt.foe && best && Aw && Aw.threat && Aw.threat(pe, best, now) > 0.04) P.emote(e, '!', '#ff8a5a');   // it saw what hit you
      pt.foe = best; pt.foeUntil = now + 2.5;
      return best;
    },
    preyNear(game, e, r) {
      let best = null, bd = r;
      for (const o of game.ents) {
        if (o.dead || o.hidden || o.type !== 'creature' || !PREY.has(o.species) || o.owner || o.tame || o.white || o.species === 'hind') continue;
        const d = U.dist(o.x, o.y, e.x, e.y);
        if (d < bd) { bd = d; best = o; }
      }
      return best;
    },
    // a spot near you, on the far side of you from the camera, a body's length off
    homeSpot(game, e, wide) {
      const pe = game.pe, pt = e.pt, g = A().gap(e) * (1.0 - Math.min(0.3, ((Ti().byId(game.world, e.titan) || {}).bond || 0) / 330)) * (wide || 1);
      if (pt.side == null || Math.abs(e.x - pe.x) > g * 1.8) pt.side = e.x < pe.x ? -1 : 1;
      pt.homeA = pt.homeA == null ? Math.random() * 0.8 - 0.4 : pt.homeA;
      const a = -Math.PI / 2 + pt.side * (1.15 + pt.homeA * 0.5);   // beside you, a little up the screen (away from the camera)
      return { x: pe.x + Math.cos(a) * g, y: pe.y + Math.sin(a) * g };
    },

    // ------------------------------------------------------------ deciding
    think(game, e, t, dt) {
      const pe = game.pe, pl = game.pl, now = game.time, world = game.world;
      const pt = e.pt || (e.pt = { intent: 'greet', it: 0, next: 0, sub: null, subT: 0, look: null, pose: 'stand', still: 0, hd: e.dir || 0, spd: 0 });
      if (e.state === 'roar' && now > (e.busyUntil || 0)) e.state = 'follow';
      const tr = P.trait(t);
      pt.it += dt; pt.subT += dt;
      // how you are moving
      const pvx = pt.lpx == null ? 0 : (pe.x - pt.lpx) / Math.max(dt, 1e-3), pvy = pt.lpy == null ? 0 : (pe.y - pt.lpy) / Math.max(dt, 1e-3);
      const jump = Math.hypot(pvx, pvy) * dt > 6;    // a door, a road taken in a blink
      pt.lpx = pe.x; pt.lpy = pe.y;
      const pspd = jump ? 0 : Math.hypot(pvx, pvy);
      if (!jump) { pt.pvx = (pt.pvx || 0) + (pvx - (pt.pvx || 0)) * Math.min(1, dt * 3); pt.pvy = (pt.pvy || 0) + (pvy - (pt.pvy || 0)) * Math.min(1, dt * 3); }
      pt.pspd = (pt.pspd || 0) + (Math.min(30, pspd) - (pt.pspd || 0)) * Math.min(1, dt * 3);
      pt.still = pt.pspd < 0.6 ? pt.still + dt : 0;
      const d = U.dist(e.x, e.y, pe.x, pe.y);
      // hunger, and closeness to you
      t.hunger = Math.min(1, (t.hunger || 0) + dt / 600);
      if (d < 16) P.bond(t, dt / 150);
      // far behind (you went through a door, rode off): it comes after you — a dragon flies
      if (d > 90 || (d > 40 && !e.flies)) { const sp = (!e.flies && A().clearing(world, e, pe.x - 3, pe.y - 3, 8)) || ECHO.Ent.freeSpot(world, pe.x - 3, pe.y - 3, 6); if (sp) { e.x = sp.x; e.y = sp.y; if (e.flies) e.alt = 6; } pt.intent = 'greet'; pt.it = 0; }
      // ---- what does it want?
      const foes = P.foes(game, e);
      const low = e.hp < e.maxHp * 0.28;
      if (pt.intent === 'regroup' && (e.hp > e.maxHp * 0.55 || !foes.length)) { pt.intent = 'follow'; pt.it = 0; }
      if (foes.length && !(pt.intent === 'regroup')) {
        if (low) { pt.intent = 'regroup'; pt.it = 0; P.emote(e, '…', '#c8c0b0'); }
        else if (pt.intent !== 'fight') { pt.intent = 'fight'; pt.it = 0; pt.sub = null; pt.pose = 'stand'; e.altGoal = e.flies && foes.length >= 3 && tr.bold > 0.5 ? 5.5 : e.altGoal; }
      } else if (!foes.length && (pt.intent === 'fight' || pt.intent === 'regroup')) {
        // the fight is over
        pt.intent = 'follow'; pt.it = 0; e.altGoal = 0; P.bond(t, 1.5);
        if (Math.random() < 0.35 + tr.bold * 0.3 && d < 20) { e.state = 'roar'; e.t = 0; e.busyUntil = now + 1.2; e.busyFn = null; if (ECHO.Sfx) ECHO.Sfx.play('roar', { vol: 0.5, pitch: 1.1 / Math.sqrt(e.tscale || 1) }); }
        return;
      }
      if (pt.intent === 'fight') return P.fight(game, e, t, dt, foes, tr);
      if (pt.intent === 'regroup') return P.regroup(game, e, t, dt, foes);
      if (pt.intent === 'eat') return P.eat(game, e, t, dt);
      if (pt.intent === 'hunt') return P.hunt(game, e, t, dt);
      if (pt.intent === 'greet') return P.greet(game, e, t, dt);
      // at peace: keep up with you, or find something to do
      if (now >= pt.next) {
        pt.next = now + 0.5;
        const far = d > A().gap(e) * 2.2;
        if (t.hunger > 0.72 && pt.pspd < 2.5 && d < 20) {
          const prey = P.preyNear(game, e, 22);
          if (prey) { pt.intent = 'hunt'; pt.it = 0; pt.prey = prey; pt.sub = null; pt.pose = 'stand'; return; }
        }
        if (pt.pspd > (pt.intent === 'follow' ? 0.8 : 1.8) || far) { if (pt.intent !== 'follow') { pt.intent = 'follow'; pt.it = 0; pt.sub = null; } }   // (a nudge is not you setting off)
        else if (pt.intent !== 'idle') { pt.intent = 'idle'; pt.it = 0; pt.sub = 'settle'; pt.subT = 0; }
      }
      if (pt.intent === 'follow') return P.follow(game, e, t, dt);
      return P.idle(game, e, t, dt, tr);
    },

    // ------------------------------------------------------------ keeping you company
    follow(game, e, t, dt) {
      const pe = game.pe, pt = e.pt, d = U.dist(e.x, e.y, pe.x, pe.y);
      pt.pose = 'stand'; pt.sub = null;
      // where it wants to be: its spot beside you, a little behind the way you are going
      const h = P.homeSpot(game, e);
      // match your pace, and hurry when it has fallen behind
      const want = Math.max(2.2, Math.min(e.flies && e.alt > 1 ? 14 : 8, pt.pspd * 1.05 + Math.max(0, d - A().gap(e) * 1.4) * 0.5));
      e.state = 'follow';
      P.travel(game, e, h.x, h.y, want, dt, 1.0);
      if (e.alt > 1.2 && e.flies && d < 9 && pt.pspd < 6 && game.time > (pt.overUntil || 0)) e.altGoal = 0;
      // looks where you are going, or at you
      pt.look = pt.pspd > 1 ? { x: pe.x + (pt.pvx || 0) * 1.5, y: pe.y + (pt.pvy || 0) * 1.5 } : { x: pe.x, y: pe.y };
      if (U.dist(e.x, e.y, h.x, h.y) < 1.4 && pt.pspd < 0.8) { pt.intent = 'idle'; pt.it = 0; pt.sub = 'settle'; pt.subT = 0; }
    },
    // when you stop, it finds itself something to do
    idle(game, e, t, dt, tr) {
      const pe = game.pe, pt = e.pt, now = game.time, world = game.world;
      if (e.state !== 'roar') e.state = 'follow';
      const d = U.dist(e.x, e.y, pe.x, pe.y);
      const pick = () => {
        // a choice weighed by its nature, the hour, and how long you've stood here
        const night = ECHO.TIME && ECHO.TIME.daylight ? ECHO.TIME.daylight(world.minute) < 0.3 : false;
        const W = [['watch', 3], ['look', 2 + tr.curious * 2], ['sniff', 1 + tr.curious * 3], ['stretch', 0.6 + tr.playful], ['rest', (pt.still > 8 ? 2.5 : 0.3) + (night ? 3 : 0) + tr.calm * 1.5], ['circle', e.flies && pt.still > 5 && !night ? 0.6 + tr.playful * 1.6 : 0]];
        let sum = 0; for (const w of W) sum += w[1];
        let r = Math.random() * sum;
        for (const w of W) { r -= w[1]; if (r <= 0) return w[0]; }
        return 'watch';
      };
      // up in the air with nowhere near you to come down (you are in a wood, a town):
      // it circles above you, and comes down as soon as there is a clearing
      if (e.flies && e._noLand && e.alt > 1 && pt.sub !== 'circle') {
        const h = P.homeSpot(game, e);
        P.move(game, e, h.x, h.y, 4, dt, 0.8);
        pt.look = { x: pe.x, y: pe.y }; pt.pose = 'stand';
        return;
      }
      if (!pt.sub || pt.sub === 'settle') {
        // first: go to its place beside you
        const h = P.homeSpot(game, e);
        pt.pose = 'stand';
        const left = P.travel(game, e, h.x, h.y, 2.4, dt, 0.9);
        pt.look = { x: pe.x, y: pe.y };
        if (left < 1.0 || pt.subT > 6) { pt.sub = 'watch'; pt.subT = 0; pt.subDur = 3 + Math.random() * 4; }
        return;
      }
      // a beast that has drifted too far comes back to you
      if (d > A().gap(e) * 2.6 && pt.sub !== 'circle' && pt.sub !== 'sniff') { pt.sub = 'settle'; pt.subT = 0; return; }
      if (pt.subT > (pt.subDur || 4)) {
        const was = pt.sub;
        pt.sub = pick(); pt.subT = 0; pt.pose = 'stand';
        if (pt.sub === was && was !== 'rest') pt.sub = 'watch';
        pt.subDur = { watch: 3 + Math.random() * 4, look: 3.5, sniff: 9, stretch: 2.4, rest: 12 + Math.random() * 14, circle: 12 + Math.random() * 8 }[pt.sub];
        if (pt.sub === 'sniff') {
          // somewhere a few lengths away that caught its interest
          let spot = null;
          for (let k = 0; k < 6 && !spot; k++) { const a = Math.random() * 6.28, r = 3 + Math.random() * 4 * (0.6 + tr.curious); const x = e.x + Math.cos(a) * r, y = Math.min(pe.y - 1, e.y + Math.sin(a) * r); if (ECHO.Ent.fits(world, x, y, 0.5)) spot = { x, y }; }
          pt.spot = spot; if (!spot) pt.sub = 'watch';
        }
        if (pt.sub === 'circle') { P.takeOff(game, e, 6.5); pt.orb = Math.atan2(e.y - pe.y, e.x - pe.x); }
        if (pt.sub === 'rest') P.emote(e, 'z', '#b8c8e8');
        if (pt.sub === 'stretch' && ECHO.Sfx && d < 18 && Math.random() < 0.5) ECHO.Sfx.play('roar', { vol: 0.25, pitch: 1.4 / Math.sqrt(e.tscale || 1) });
      }
      e.moving = false; pt.gait = 0; pt.spd *= Math.exp(-dt * 4);
      switch (pt.sub) {
        case 'watch': {
          // keeps an eye on you and on the land: whatever moves catches its eye
          pt.pose = 'stand';
          const o = P.interest(game, e);
          pt.look = o || { x: pe.x, y: pe.y };
          if (o && pt.subT > 1.5) P.face(e, o.x, o.y, dt);
          break;
        }
        case 'look': {
          // a slow look round, left and right
          pt.pose = 'stand';
          const a = (pt.hd || 0) + Math.sin(pt.subT * 1.6) * 1.1;
          pt.look = { x: e.x + Math.cos(a) * 10, y: e.y + Math.sin(a) * 10 };
          break;
        }
        case 'sniff': {
          if (!pt.spot) { pt.sub = 'watch'; break; }
          const left = P.move(game, e, pt.spot.x, pt.spot.y, 1.8, dt, 0.6);
          pt.pose = left < 0.8 ? 'sniff' : 'stand';
          pt.look = { x: pt.spot.x + Math.cos(pt.hd) * 2, y: pt.spot.y + Math.sin(pt.hd) * 2 };
          if (left < 0.8 && pt.sniffT == null) pt.sniffT = now;
          if (pt.sniffT != null && now - pt.sniffT > 3.5) { pt.sniffT = null; pt.sub = 'settle'; pt.subT = 0; }
          break;
        }
        case 'stretch': pt.pose = 'stretch'; pt.look = null; break;
        case 'rest': {
          pt.pose = 'rest'; pt.look = null;
          if (pt.subT > 4 && Math.random() < dt * 0.15) P.emote(e, 'z', '#b8c8e8');
          if (pt.pspd > 0.8) { pt.sub = 'settle'; pt.subT = 0; pt.pose = 'stand'; }   // you moved: up it gets
          break;
        }
        case 'circle': {
          // a turn round the sky above you, then down again
          pt.pose = 'stand';
          if (pt.subT > (pt.subDur || 12) - 3) { e.altGoal = 0; const h = P.homeSpot(game, e); P.move(game, e, h.x, h.y, 6, dt, 1); if (e.alt < 0.3) { pt.sub = 'stretch'; pt.subT = 0; pt.subDur = 1.8; } break; }
          pt.orb = (pt.orb || 0) + dt * 0.42;
          const r = 9 + Math.sin(pt.subT * 0.3) * 2;
          P.move(game, e, pe.x + Math.cos(pt.orb) * r, pe.y + Math.sin(pt.orb) * r * 0.8, 8, dt, 0.3);
          pt.look = { x: pe.x, y: pe.y };
          break;
        }
      }
    },
    // what catches its eye: something moving nearby, another of its kind, you
    interest(game, e) {
      const pt = e.pt, now = game.time;
      if (pt.intT && now < pt.intT && pt.intO && !pt.intO.dead) return pt.intO;
      let best = null, bs = 0;
      for (const o of game.ents) {
        if (o === e || o.dead || o.hidden || o === game.pe) continue;
        const d = U.dist(o.x, o.y, e.x, e.y);
        if (d > 16) continue;
        const s = (o.moving ? 2 : 0.6) + (o.type === 'boss' ? 3 : o.type === 'creature' ? 1.5 : 0.5) - d * 0.12 + Math.random() * 0.5;
        if (s > bs) { bs = s; best = o; }
      }
      pt.intO = best; pt.intT = now + 2 + Math.random() * 3;
      return best;
    },

    // ------------------------------------------------------------ hunting
    hunt(game, e, t, dt) {
      const pt = e.pt, p = pt.prey, pe = game.pe;
      pt.pose = 'stand';
      if (!p || p.dead || pt.it > 25 || U.dist(e.x, e.y, pe.x, pe.y) > 34 || pt.pspd > 4) { pt.prey = null; pt.intent = 'follow'; pt.it = 0; e.altGoal = 0; return; }
      const d = U.dist(e.x, e.y, p.x, p.y);
      pt.look = { x: p.x, y: p.y };
      // a dragon drops on its prey from the air; a beast runs it down
      if (e.flies && d > 9 && e.alt < 1) P.takeOff(game, e, 4);
      if (e.flies && d < 4) e.altGoal = 0;
      P.move(game, e, p.x, p.y, e.alt > 1 ? 11 : 7.5, dt, 0.2);
      if (d < e.r + 0.9 && e.alt < 1.2) {
        ECHO.Combat.burst(p.x, p.y, '#7a1d24', 16, 3, 0.6, 3);
        ECHO.Combat.kill(p, e, 'melee', {});
        if (U.dist(e.x, e.y, pe.x, pe.y) < 26) ECHO.Combat.floater(e.x, e.y - 2.4 * (e.tscale || 1), `${t.name} catches ${p.species === 'hare' ? 'a hare' : 'a deer'}`, '#ffcf8a');
        pt.prey = null; pt.intent = 'eat'; pt.it = 0; t.hunger = 0; P.bond(t, 0.5);
      }
    },
    eat(game, e, t, dt) {
      const pt = e.pt;
      e.moving = false; pt.gait = 0; pt.spd = 0; e.altGoal = 0;
      pt.pose = 'eat'; pt.look = null;
      if (pt.it > 6 || pt.pspd > 3) { pt.intent = 'follow'; pt.it = 0; pt.pose = 'stand'; }
    },
    // you came back to it (or it came back to you): it comes close, head low
    greet(game, e, t, dt) {
      const pe = game.pe, pt = e.pt, d = U.dist(e.x, e.y, pe.x, pe.y);
      pt.look = { x: pe.x, y: pe.y };
      const near = A().gap(e) * 0.8;
      if (d > near + 0.8 && pt.it < 6) { pt.pose = 'stand'; P.travel(game, e, pe.x + (e.x < pe.x ? -near : near), pe.y - near * 0.6, 6, dt, 0.6); return; }
      e.moving = false; P.face(e, pe.x, pe.y, dt);
      pt.pose = 'nuzzle';
      if (!pt.greeted) { pt.greeted = true; if ((t.bond || 0) > 20) P.emote(e, '♥', '#ff9ab0'); }
      if (pt.it > 2.6 || pt.pspd > 1.5) { pt.intent = 'follow'; pt.it = 0; pt.greeted = false; pt.pose = 'stand'; }
    },
    // E beside it: a hand on its neck
    pet(game, e, t) {
      const pt = e.pt || (e.pt = { intent: 'greet', it: 0, next: 0 });
      const now = game.time;
      pt.intent = 'greet'; pt.it = 0; pt.greeted = false;
      if ((e._petT || 0) < now) { P.bond(t, 3); e._petT = now + 20; }
      ECHO.Combat.floater(e.x, e.y - 2.4 * (e.tscale || 1), '♥', '#ff9ab0');
      if (ECHO.Sfx) ECHO.Sfx.play('snort', { vol: 0.5, pitch: 0.6 });
      UI().toast(`${t.name} leans its great head against you. (${P.bondWord(t.bond || 0)})`, 'info', 2.5);
    },

    // ------------------------------------------------------------ fighting beside you
    fight(game, e, t, dt, foes, tr) {
      const pe = game.pe, pt = e.pt, now = game.time;
      pt.pose = 'stand'; pt.sub = null;
      const foe = P.pickFoe(game, e, foes);
      if (!foe) return;
      pt.look = { x: foe.x, y: foe.y };
      e.state = e.state === 'windup' ? e.state : 'fight';
      const youLow = pe.hp < pe.maxHp * 0.35, eager = (youLow ? 0.25 : 0) + ((t.bond || 0) / 400);
      if (youLow && !pt.toldLow) { pt.toldLow = true; P.emote(e, '!', '#ff5a3c'); if (ECHO.Sfx) ECHO.Sfx.play('roar', { vol: 0.5, pitch: 1 / Math.sqrt(e.tscale || 1) }); }
      if (!youLow) pt.toldLow = false;
      // a dragon against a crowd (or something it can't reach) takes to the air and strafes it
      const crowd = foes.filter(o => U.dist(o.x, o.y, foe.x, foe.y) < 6).length;
      if (e.flies) {
        if (pt.air == null) pt.air = false;
        // no room on the ground to fight from (among trees, rocks, walls): it fights from the air
        if (now > (pt.roomT || 0)) { pt.roomT = now + 0.6; const s0 = A().standFor(game, e, foe); pt.noRoom = !A().bodyAt(game.world, e, s0.x, s0.y, Math.atan2(foe.y - s0.y, foe.x - s0.x)) && !A().clearing(game.world, e, s0.x, s0.y, 3); }
        const wantAir = ((crowd >= 3 || (foe.alt || 0) > 1.5 || (foe.type === 'boss' && !foe.tamed)) && tr.bold > 0.35) || pt.noRoom;
        if (!pt.air && wantAir && (now > (pt.airNext || 0) || pt.noRoom)) { pt.air = true; pt.airN = 0; P.takeOff(game, e, 5.5); }
        if (pt.air) {
          // round the foe, high, then a run at it
          pt.orb = (pt.orb == null ? Math.atan2(e.y - foe.y, e.x - foe.x) : pt.orb) + dt * 0.55;
          const ox = foe.x + Math.cos(pt.orb) * 8, oy = Math.min(pe.y - 2, foe.y + Math.sin(pt.orb) * 6);
          P.move(game, e, ox, oy, 9, dt, 0.5);
          if (e.alt > 4 && A().airAttack(game, e, t, foe)) { pt.airN++; if (pt.airN >= 3 && !pt.noRoom) { pt.air = false; pt.airNext = now + 10; e.altGoal = 0; } }
          return;
        }
      }
      e.altGoal = 0;
      if (e.alt > 0.6) { P.move(game, e, foe.x, Math.min(foe.y, pe.y - 1), 6, dt, 2); return; }
      // a place to fight from: in reach, but not on top of you or between you and the view
      const sp = A().standFor(game, e, foe);
      const left = U.dist(e.x, e.y, sp.x, sp.y);
      if (left > 0.9) P.move(game, e, sp.x, sp.y, left > 6 ? 7 : 4.5, dt, 0.5);
      else { e.moving = false; pt.gait = 0; pt.spd *= Math.exp(-dt * 5); P.face(e, foe.x, foe.y, dt); }
      // strike when it faces it
      const facing = Math.abs(U.angleDiff(pt.hd || e.dir || 0, Math.atan2(foe.y - e.y, foe.x - e.x))) < 0.7;
      if (facing || U.dist(e.x, e.y, foe.x, foe.y) < e.r + foe.r + 1) A().attackFoe(game, e, t, foe, eager);
    },
    // badly hurt: it pulls back out of reach to recover, then comes back in
    regroup(game, e, t, dt, foes) {
      const pe = game.pe, pt = e.pt;
      pt.pose = 'stand'; pt.look = foes[0] ? { x: foes[0].x, y: foes[0].y } : null;
      if (e.flies) {
        P.takeOff(game, e, 7);
        pt.orb = (pt.orb || 0) + dt * 0.35;
        P.move(game, e, pe.x + Math.cos(pt.orb) * 10, pe.y - 6 + Math.sin(pt.orb) * 4, 7, dt, 0.5);
      } else {
        const h = P.homeSpot(game, e, 1.6);
        P.move(game, e, h.x, h.y - 3, 5, dt, 1);
      }
    },

    // ------------------------------------------------------------ carrying you
    // On the wing with you on its back it still has a will: it looks at what
    // catches its eye below, roars at another of its kind, and when you leave
    // the reins alone it flies on by itself in long lazy circles.
    ridden(game, e, t, dt) {
      const pt = e.pt || (e.pt = { intent: 'ridden', it: 0 });
      pt.intent = 'ridden'; pt.pose = 'stand';
      P.bond(t, dt / 90);
      const now = game.time;
      if (!pt.intT || now > pt.intT) {
        pt.intT = now + 3 + Math.random() * 3;
        let best = null, bs = 0;
        for (const o of game.ents) {
          if (o === e || o.dead || o.hidden || o === game.pe) continue;
          const d = U.dist(o.x, o.y, e.x, e.y);
          if (d > 28) continue;
          const s = (o.type === 'boss' ? 4 : o.type === 'creature' ? 1.4 : 0.6) + (o.moving ? 1 : 0) - d * 0.05;
          if (s > bs) { bs = s; best = o; }
        }
        pt.look = best ? { x: best.x, y: best.y } : null;
        if (best && best.type === 'boss' && !best.tamed && (pt.roarAt || 0) < now) { pt.roarAt = now + 30; pt.roarUntil = now + 1.4; if (ECHO.Sfx) ECHO.Sfx.play('roar', { vol: 0.6, pitch: 1 / Math.sqrt(e.tscale || 1) }); }
      }
      if (now < (pt.roarUntil || 0)) e.state = 'roar';
    }
  };
})();
