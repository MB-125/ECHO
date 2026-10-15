// Weighing the odds.
//
// Before anyone in town steps up to a fight — a guard, a soldier, an outlaw,
// a townsman who has been down a dungeon or two — they size up what they face:
// its level, its gear and how hurt it is, against their own, and against the
// friends who could stand with them.
//   · Good odds: they fight.
//   · Poor alone, good together: they don't charge in. They shout for help,
//     hold back out of reach (archers keep shooting), gather with whoever
//     answers — guards, soldiers, any willing townsfolk with a blade — and go
//     in together, from all sides, once there are enough of them.
//   · Hopeless even all together: guards hold their distance and send for
//     more; outlaws and townsfolk run.
// Someone already being cut down fights back whatever the odds.
(function () {
  const { U } = ECHO;
  const HERO = 2;           // rolls, guards and herbs: a hero lasts about twice as long as the numbers say
  const ENGAGE = 0.45, RALLY = 0.4, HOPELESS = 0.22;

  const O = ECHO.Odds = {
    // What something brings to a fight: how much it can take, how hard it
    // hits (per second), and how fast it heals.
    stats(game, x) {
      if (!x || x.dead) return { hp: 0, dps: 0, regen: 0, ranged: false };
      const Pw = ECHO.Prowess, world = game.world;
      if (x === game.pe) {
        const pl = game.pl, w = world.items[pl.weapon];
        const hit = (w ? w.dmg : 5) * (0.75 + ((pl.skills && pl.skills.blade) || 0) / 70) * (Pw ? Pw.dmgMult(pl) : 1);
        // rolls, guards, herbs: a hero lasts about twice as long as the numbers say
        return { hp: Math.max(1, pl.hp) * HERO, dps: hit / 0.65 * (pl.mounted ? 1.3 : 1), regen: 0, ranged: false };
      }
      if (x.type === 'person') {
        const n = x.npcId && world.npcs[x.npcId], sk = n ? (n.skill.fight || 0) : 20;
        const bow = !!(x.gear && x.gear.bow);
        const hit = bow ? (5 + sk * 0.11) : (5 + sk * 0.13 + (n ? n.rank * 3 : 0) + (n && n.carry ? 4 : 0));
        return { hp: Math.max(1, x.hp) * (x.isCompanion ? 1.4 : 1), dps: hit * (x.dmgMul || 1) / (bow ? 1.9 : 1.35), regen: 0, ranged: bow };
      }
      if (x.foe) {
        const D = (ECHO.Monsters && ECHO.Monsters.DEFS[x.species]) || x.foe;
        const ranged = !!(x.shooter || (x.ab && x.ab.ranged));
        return { hp: Math.max(1, x.hp), dps: (D.dmg || 10) * (x.dmgMul || 1) / (D.cd || 1.4), regen: (x.ab && x.ab.regen && !(x.burn > 0)) ? x.ab.regen : 0, ranged, resist: x.resist };
      }
      const sp = x.species && ECHO.SPECIES[x.species];
      if (x.type === 'creature' && sp && sp.dmg) return { hp: Math.max(1, x.hp), dps: sp.dmg * (x.dmgMul || 1) / 1.4, regen: 0, ranged: false };
      // anything else (great beasts, lords): by its level
      const L = Pw.foeLevel(x), m = Pw.foeMul(L, true);
      return { hp: Math.max(1, x.hp), dps: 9 * m.dmg * (x.type === 'boss' ? 2 : 1), regen: 0, ranged: false };
    },
    // a single number, for show and for sorting
    power(game, x) { const s = O.stats(game, x); return s.hp * s.dps; },
    // Who stands with e (all = everyone who could, not just those already in it).
    friends(game, e, target, all) {
      const out = [];
      for (const o of game.ents) {
        if (o === e || o.dead || o.hidden || o.rout || o.yielded || o.type !== 'person' || o.role === 'captive') continue;
        if (game.hostileTo(o, e) || !game.hostileTo(o, target)) continue;
        const d = U.dist(o.x, o.y, e.x, e.y);
        if (o.target === target && d < 16) { out.push(o); continue; }
        if (!all || d > 16) continue;
        if (O.ableFighter(game, o)) out.push(o);
      }
      return out;
    },
    // Who stands with the target.
    foes(game, e, target) {
      const out = [target];
      for (const o of game.ents) {
        if (o === target || o.dead || o.hidden || o.rout || o.yielded) continue;
        if (U.dist(o.x, o.y, target.x, target.y) > 8) continue;
        if (target === game.pe ? o.isCompanion : (game.hostileTo(o, e) && !game.hostileTo(o, target) && o.type === target.type)) out.push(o);
      }
      return out;
    },
    ableFighter(game, o) {
      if (o.role === 'guard' || o.role === 'soldier' || o.role === 'bandit') return true;
      const n = o.npcId && game.world.npcs[o.npcId];
      return !!n && O.willingSort(n);
    },
    // A townsperson who would take up a blade if the odds were good.
    willingSort(n) {
      if (!n || n.prof === 'child' || n.prof === 'elder' || ECHO.People.has(n, 'cowardly')) return false;
      return (n.delves || 0) > 0 || (ECHO.Delvers && ECHO.Delvers.lv(n) >= 5) || ECHO.People.has(n, 'brave') || ((n.skill && n.skill.fight) || 0) >= 25;
    },
    // The chance (0–1) that e's side wins: how long each side needs to cut the
    // other down. Only two or three blades reach one foe at once; bows all count.
    odds(game, e, target, all) {
      const us = [e, ...O.friends(game, e, target, all)].map(o => O.stats(game, o));
      const them = O.foes(game, e, target).map(o => O.stats(game, o));
      const tr = target.resist || {};
      const melee = us.filter(s => !s.ranged).map(s => s.dps * (1 - (tr.melee || 0))).sort((a, b) => b - a);
      const ranged = us.filter(s => s.ranged).reduce((a, s) => a + s.dps * (1 - (tr.ranged || 0)), 0);
      const reach = them.length > 1 ? 3 + them.length : 3;
      const ourDps = melee.slice(0, reach).reduce((a, v) => a + v, 0) + ranged;
      const ourHp = us.reduce((a, s) => a + s.hp, 0);
      const theirHp = them.reduce((a, s) => a + s.hp, 0), theirDps = them.reduce((a, s) => a + s.dps, 0), regen = them.reduce((a, s) => a + s.regen, 0);
      const tWe = theirHp / Math.max(0.05, ourDps - regen);      // how long we need
      const tThey = ourHp / Math.max(0.05, theirDps);            // how long they need
      return tThey / (tWe + tThey);
    },

    // Called each frame a person has a target. Returns true if it took over
    // (holding back, gathering, running); false lets them fight as usual.
    think(game, e, npc, target, dt) {
      if (e.isCompanion || e.role === 'companion' || e.role === 'captive' || e.siege || e.rider || e.dq) return false;
      // a new foe: a fresh look
      if (e._oddsFor !== target) { e._oddsFor = target; e.plan = null; e.committed = false; e.oddsT = 0; e.rallyT = 0; }
      // the law tries words first; that isn't a fight yet
      if (target === game.pe && (e.role === 'guard' || e.role === 'soldier') && ECHO.Court && ECHO.Court.shouldArrest(game, e)) return false;
      // already being cut down: fight back
      const d = U.dist(e.x, e.y, target.x, target.y);
      if (e.hurtT > 0) e._hitAt = game.time;
      if ((game.time - (e._hitAt || -99) < 4 && d < 3.5) || e.committed) return false;
      // read the situation now and then, not every frame
      e.oddsT = (e.oddsT || 0) - dt;
      if (e.oddsT <= 0) {
        e.oddsT = 0.5 + Math.random() * 0.3;
        e.oddsNow = O.odds(game, e, target, false);
        e.oddsAll = O.odds(game, e, target, true);
      }
      const now = e.oddsNow, all = e.oddsAll;
      const lawful = e.role === 'guard' || e.role === 'soldier';
      const say = (t, k = 2) => { if (e.sayT <= 0) { e.say = t; e.sayT = k; } };
      const tl = target === game.pe ? ECHO.Prowess.level(game.pl) : ECHO.Prowess.foeLevel(target);
      if (now >= ENGAGE) {
        if (e.plan === 'rally') { say(['Now — together!', 'With me — now!', 'All at once!'][Math.floor(Math.random() * 3)], 1.6); e.committed = true; }
        e.plan = 'fight';
        return false;
      }
      if (all >= RALLY) {
        // not alone: call them in, hold back, go together
        if (e.plan !== 'rally') { e.plan = 'rally'; e.rallyT = 0; say(target === game.pe ? `Lv ${tl}? Not alone. To me!` : `Too much for one. To me — together!`, 2.2); }
        e.rallyT = (e.rallyT || 0) + dt;
        O.callHelp(game, e, target);
        // waited long enough with a fair chance: go anyway
        if (e.rallyT > 9 && now >= HOPELESS) { e.committed = true; return false; }
        return O.holdBack(game, e, target, d, dt);
      }
      if (all < HOPELESS || all < RALLY) {
        if (lawful) {
          if (e.plan !== 'hold') { e.plan = 'hold'; say(target === game.pe ? `Lv ${tl}… Keep your distance! Send for more!` : 'Stay back — wait for more!', 2.4); }
          O.callHelp(game, e, target);
          return O.holdBack(game, e, target, d, dt, 8.5);
        }
        // outlaws and townsfolk: not worth dying for
        if (e.plan !== 'run') { e.plan = 'run'; say(target === game.pe ? ['Not that one — run!', `That's no common blade…`, 'Leave it! Run!'][Math.floor(Math.random() * 3)] : 'Run!', 2); }
        if (ECHO.Tactics && !e.rout) { e.rout = { x: target.x, y: target.y, t: 0 }; e.token = false; }
        return ECHO.Tactics ? ECHO.Tactics.flee(game, e, dt) : false;
      }
      return false;
    },
    // Keep out of reach, facing them; archers keep shooting from range.
    holdBack(game, e, target, d, dt, keep = 6.5) {
      const world = game.world, ang = Math.atan2(target.y - e.y, target.x - e.x);
      // gather toward the others holding back
      const mates = game.ents.filter(o => o !== e && !o.dead && o.type === 'person' && (o.plan === 'rally' || o.plan === 'hold') && o.target === target && U.dist(o.x, o.y, e.x, e.y) < 12);
      let gx = target.x - Math.cos(ang) * keep, gy = target.y - Math.sin(ang) * keep;
      if (mates.length) { const mx = mates.reduce((a, o) => a + o.x, 0) / mates.length, my = mates.reduce((a, o) => a + o.y, 0) / mates.length; gx = gx * 0.6 + mx * 0.4; gy = gy * 0.6 + my * 0.4; }
      if (d < keep - 0.8) ECHO.Ent.seek(world, e, e.x - Math.cos(ang) * 2, e.y - Math.sin(ang) * 2, e.speed, dt, 0.1);
      else if (U.dist(e.x, e.y, gx, gy) > 1.2 && d > keep + 1.5) ECHO.Ent.travel(world, e, gx, gy, e.speed * 0.8, dt);
      else e.moving = false;
      e.dir = ang; e.flip = Math.cos(ang) < 0; e.state = 'chase';
      // a bow still has its say from back here
      if (e.gear && e.gear.bow && e.cd <= 0 && d < 10 && d > 3 && ECHO.Ent.lineOfSight(world, e.x, e.y, target.x, target.y)) { e.state = 'windup'; e.t = 0; e.windEnd = 0.75; e.aimAngle = ang; e.meleeWind = false; e.readPlan = null; e.committedShot = true; }
      return true;
    },
    // Call in everyone who could help: guards, soldiers, willing townsfolk.
    callHelp(game, e, target) {
      if (e.helpT && game.time - e.helpT < 3) return;
      e.helpT = game.time;
      if (ECHO.Tactics) ECHO.Tactics.shout(game, e, target);
      for (const o of game.ents) {
        if (o === e || o.dead || o.hidden || o.target || o.rout || o.yielded || o.type !== 'person' || o.isCompanion) continue;
        if (U.dist(o.x, o.y, e.x, e.y) > 18 || game.hostileTo(o, e) || !game.hostileTo(o, target)) continue;
        if (!O.ableFighter(game, o)) continue;
        o.target = target; o.volunteer = !(o.role === 'guard' || o.role === 'soldier' || o.role === 'bandit');
        o.lookAt = { x: e.x, y: e.y, t: game.time };
        if (o.sayT <= 0 && Math.random() < 0.5) { o.say = o.volunteer ? ['I\'m with you!', 'Coming!', 'I\'ll stand with you!'][Math.floor(Math.random() * 3)] : 'Coming!'; o.sayT = 1.5; }
      }
    },
    // When a willing townsperson takes up the fight instead of running.
    volunteer(game, e, npc, target) {
      if (!O.willingSort(npc) || target === game.pe && !game.hostileTo(e, game.pe)) return false;
      if (!e.volunteer && !(npc.delves > 0)) return false;
      if (e._volFor !== target || game.time - (e._volT || 0) > 1) { e._volFor = target; e._volT = game.time; e._vol = O.odds(game, e, target, true) >= ENGAGE; }
      return e._vol;
    }
  };
})();
