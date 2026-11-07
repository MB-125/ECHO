// The slimes: the strongest things that live, and the cleverest.
//
// Whatever its level, a slime outfights anything of that level — a dragon included — and of all
// the things that live it has the highest potential: six forms, the first of them early, each a
// bigger step than any other kind takes (evolve.js). And it thinks:
//   • It notices everything, from far off, and the first time it sees you it holds back and
//     watches you — sizing you up — before it comes. (That is your moment to leave.)
//   • It is fast: it moves in surges, and from up to eight strides off it crouches and leaps,
//     landing where you are going to be, not where you were (the ground glows where it means to land).
//   • It swallows what it lands on, or what stands in its reach: held inside it, acid eating at you
//     and your mana, until it spits you out (strike it from inside to get out sooner).
//   • It spits acid in volleys, aimed ahead of you; the acid pools and eats the ground a while.
//   • It learns. Whatever you hurt it with most — steel, arrows, spells, even fire — it hardens to,
//     a little more every few seconds. Change how you fight it before it has learned you.
//   • It reads you as the cleverest people do (wits.js): it steps out of your heavy blows, sidesteps
//     arrows, and learns which way you roll.
//   • Badly hurt, it leaves a piece of itself behind to hold you and slides away to heal — twice.
//   • It eats other monsters: the ones it can reach, in or out of a fight. Each makes it bigger,
//     heals it and makes it stronger (levels, and in time a new form), and from some it takes
//     what they had: venom, a troll's healing, a wolf's speed, the wraith's step, stone skin…
//   • Left alone, it lies flat as a puddle, glowing faintly — and rises when you come close.
//   • It heals as you cut it (fire stops it for a while), every blow drinks your mana, and it
//     splits when it dies; two pieces that meet crawl back together (twice in a line).
// And it is the rarest thing there is. One turns up, very seldom, on any floor of any deep place,
// or out in the wild — and when one does, it is never weaker than you: it surfaces at your own
// strength or past it. Beat one and the reward is huge: a slime core that deepens your mana for
// good, a relic, fine gear, a heap of coin and gel, and more experience than anything of its level;
// tame one, and you have the strongest beast there is.
// A slime you tame fights for you with all of that, grows faster and higher than any other
// beast (past your own level), and feeds on your mana for as long as you keep it: out with you,
// in full; resting at your den, a quarter. Unfed, it weakens, and in the end it slips back to
// your den. Your mana well (well.js) is how you grow enough mana to keep one.
(function () {
  const { U } = ECHO;
  const C = () => ECHO.Combat;

  const SL = ECHO.Slime = {
    KINDS: new Set(['slime', 'slimeling']),
    is(kind) { return SL.KINDS.has(kind); },
    LEASH: 60,
    // how strong it really is, in levels (for the warnings and the danger shown): far above what it says
    dangerLv(e) { const L = ECHO.Prowess.foeLevel(e); return Math.round(L * 2.5 + 10 + 6 * ((e.evo || 1) - 1) + 2 * (e.absorbed || 0)); },
    // the level a slime surfaces at: never below your own strength (it is the strongest thing there is)
    apexLv(game, L) { const pl = game.pl, me = pl && ECHO.Prowess ? ECHO.Prowess.level(pl) : 1; return Math.min(ECHO.Prowess.MAX || 1500, Math.max(L, Math.round(me * 1.04 + 3))); },

    // ------------------------------------------------------------ always, in or out of a fight
    // ---- it changes its size to get through: a slime pours itself thin through a gap, a door or a
    // narrow way that its body could never pass, and fills out again on the other side.
    // e._sq: 0 its full size … 1 as thin as it goes; e._r0 its own size; e.r the room it takes now.
    SQ_R: 0.22,
    squeeze(game, e, dt) {
      const world = game.world, Ent = ECHO.Ent;
      if (e.dead || !Ent || !Ent.blockedAt) return;
      if (!(e._sq > 0.01)) e._r0 = e.r || 0.4;            // (its own size, while it is at it: it may grow)
      const r0 = e._r0, rMin = Math.min(r0, SL.SQ_R);
      if (r0 <= rMin + 0.02) { e._sq = 0; return; }
      const at = (x, y, r) => { const r1 = e.r; e.r = r; const b = Ent.blockedAt(world, e, x, y); e.r = r1; return b; };
      if ((e._sqT = (e._sqT || 0) - dt) <= 0) {
        e._sqT = 0.12;
        const a = e.dir || 0, ca = Math.cos(a), sa = Math.sin(a);
        // no room for all of it where it is, or the way it is going narrows: thin
        let tight = at(e.x, e.y, r0);
        if (!tight && (e.moving || (e.stuck || 0) > 0.2)) for (let t = 0.3; t <= 1.5 && !tight; t += 0.3) tight = at(e.x + ca * t, e.y + sa * t, r0) && !at(e.x + ca * t, e.y + sa * t, rMin);
        e._sqWant = tight || (e.stuck || 0) > 0.5 ? 1 : 0;
      }
      const want = e._sqWant || 0, cur = e._sq || 0;
      let nx = want > cur ? Math.min(want, cur + dt * 4) : Math.max(want, cur - dt * 1.6);
      let r = r0 + (rMin - r0) * nx;
      // filling out again only where there is room for it
      if (r > e.r + 1e-4 && at(e.x, e.y, r)) { nx = cur; r = e.r; }
      e._sq = nx; e.r = r;
      if (nx > 0.6 && e.pal && !(e._sqSaidT > game.time)) { e._sqSaidT = game.time + 25; ECHO.Combat.floater(e.x, e.y - 1.2 * (e.scale || 1), 'squeezes through', '#b8ff7a'); }
    },
    always(game, e, dt) {
      SL.squeeze(game, e, dt);
      if (e.pal || e.dead) return;
      if (!e.home0) e.home0 = { x: e.x, y: e.y };
      const ab = e.ab || {};
      // it moves in surges: gathering itself, then pouring forward (fast, in a fight)
      if (e._spd0 == null) e._spd0 = e.speed;
      e._sph = (e._sph || Math.random() * 6) + dt * (e.aggro ? 7.5 : 3);
      e._surge = Math.max(0, Math.sin(e._sph));
      e.speed = e._spd0 * (e.aggro ? 0.82 + 0.5 * e._surge : 0.45);
      // left alone, it lies flat as a puddle
      e.puddle = !e.aggro && !!e.rareSlime && !e.retreat && e.state !== 'devour';
      if (e.puddle) e._wasPuddle = true;
      // its acid on the ground
      if (e._pools && e._pools.length) SL.pools(game, e, dt);
      // a glistening trail where it has been
      if (e.moving && Math.random() < dt * 2.2) C().decal(e.x, e.y, 'slime', 0.45 * (e.scale || 1), 10);
      // it heals (not while it burns, nor for a while after fire has touched it) — fast, when it has slid away to heal
      if (ab.slimeHeal && e.hp < e.maxHp && !(e.burn > 0) && !(e._fireT > game.time)) {
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * (ab.slimeHeal + (e.retreat ? 0.025 : 0)) * dt);
        if (Math.random() < dt * 2.5) C().fx.push({ kind: 'p', x: e.x + (Math.random() - 0.5) * 0.8 * (e.scale || 1), y: e.y + (Math.random() - 0.5) * 0.5, vx: 0, vy: 0, t: 0, life: 0.6, color: '#9fe05a', size: 1.6, glow: true, h: 0.2, vz: 1.2, g: 0 });
      }
      if (e.rareSlime && !e._sighted) SL.sight(game, e);
      // far behind you, out in the wild, it is gone again
      if (e.slimeWild && game.pe && U.dist(e.x, e.y, game.pe.x, game.pe.y) > 80) { e.dead = true; e.vanish = true; return; }
      // its glow, so it can be found
      if (e.rareSlime && game.light && Math.random() < 0.5) game.light(e.x, e.y, 2.2 + (e.scale || 1), 0.35, '#9fe05a');
      if (e.rareSlime && Math.random() < dt * 4) C().fx.push({ kind: 'p', x: e.x + (Math.random() - 0.5) * (e.scale || 1), y: e.y + (Math.random() - 0.5) * 0.6, vx: 0, vy: 0, t: 0, life: 1, color: '#b8ff7a', size: 1.8, glow: true, h: 0.3, vz: 0.8, g: 0 });
      // the pieces crawl back together
      if (e.shard && e.species === 'slimeling' && (e.gen || 0) < 2 && game.time - (e.bornT || 0) > 5) SL.reform(game, e, dt);
      // said once, the first time you meet one
      const pl = game.pl, pe = game.pe;
      if (pl && pe && !pl._slimeTip2 && U.dist(e.x, e.y, pe.x, pe.y) < 16) {
        pl._slimeTip2 = true;
        ECHO.UI.toast(`A slime: the strongest and cleverest thing that lives, stronger than a dragon of its level. It is fast and it hunts; it leaps from far off (watch for the glow where it means to land) and swallows you whole; it learns whatever you hurt it with and hardens to it; it eats other monsters to grow; it heals as you cut it and drinks your mana. Fire is what it fears: fire stops its healing. When it first sees you it stops and watches you — that is your moment to leave.`, 'warn', 16);
      }
      // left alone, it goes hunting the other things of the place, and eats them
      if (!e.aggro && e.rareSlime && !e.summoned && (!pe || U.dist(e.x, e.y, pe.x, pe.y) > 12)) {
        if (e.state === 'devour') { SL.devour(game, e, dt); return true; }
        if ((e._preyT = (e._preyT || 0) - dt) <= 0) {
          e._preyT = 1.2;
          const prey = SL.preyNear(game, e, 11);
          if (prey) { SL.startDevour(game, e, prey); return true; }
        }
      }
    },
    reform(game, e, dt) {
      const mate = game.ents.find(o => o !== e && !o.dead && o.shard && o.species === 'slimeling' && o.lineage === e.lineage && U.dist(o.x, o.y, e.x, e.y) < 6);
      if (!mate) return;
      const d = U.dist(mate.x, mate.y, e.x, e.y);
      if (d > 1.0) {
        if (!e.aggro || U.dist(e.x, e.y, game.pe.x, game.pe.y) > 2.5) ECHO.Ent.travel(game.world, e, (e.x + mate.x) / 2, (e.y + mate.y) / 2, e.speed * 0.8, dt);
        if (Math.random() < dt * 3) C().fx.push({ kind: 'arc', x: e.x, y: e.y, x2: mate.x, y2: mate.y, h: 0.3, t: 0, life: 0.25, color: '#9fe05a' });
        return;
      }
      // they meet: a slime again
      const x = (e.x + mate.x) / 2, y = (e.y + mate.y) / 2, L = Math.max(e.lvl || 1, mate.lvl || 1);
      e.dead = true; e.vanish = true; mate.dead = true; mate.vanish = true;
      const s = ECHO.Monsters.make(game, 'slime', x, y, L, { noElite: true, aggro: true, delve: e.delve, indoor: e.indoor, questId: e.questId, evo: Math.max(e.evo || 1, mate.evo || 1) });
      s.floor = e.floor; s.gen = (e.gen || 0) + 1; s.lineage = e.lineage; s.hp = Math.round(s.maxHp * 0.6);
      s.label = `${s.label || s.foe.name} (reformed)`;
      if (s.gen >= 2 && s.ab) delete s.ab.split;   // (the third time, it stays dead)
      game.ents.push(s);
      C().ring(x, y, 1.6, 'rgba(160,240,90,0.9)', 0.5); C().burst(x, y, '#9fe05a', 22, 4, 0.7, 3);
      C().floater(x, y - 1.4, 'the pieces join — a slime again', '#9fe05a', true);
      if (ECHO.Sfx) ECHO.Sfx.play('roar', { vol: 0.35, pitch: 1.6 });
    },

    // ------------------------------------------------------------ the rarest thing there is
    DUNGEON_P: 0.04,       // a floor of a deep place, before its depth adds a little
    WILD_P: 0.012,         // each minute out in the wild
    rareInDungeon(game, site, depth, lvl, rooms, free, tag, BASE) {
      if (Math.random() >= SL.DUNGEON_P + 0.01 * Math.min(4, depth || 0) + (SL._force || 0)) return null;
      const room = rooms[Math.floor(Math.random() * rooms.length)];
      const spots = room && free(room);
      if (!spots || !spots.length) return null;
      const s0 = spots.pop();
      const e = tag(ECHO.Monsters.make(game, 'slime', BASE + s0.x + 0.5, s0.y + 0.5, SL.apexLv(game, lvl + 2), { noElite: true }));
      SL.mark(game, e);
      game.ents.push(e);
      return e;
    },
    // out in the wild: now and then, far from any town, one lies glowing somewhere near you
    rareTick(game, dt) {
      const pe = game.pe, pl = game.pl, world = game.world;
      if (!pe || !pl || ECHO.Interior.cur || pl.flying) return;
      if ((SL._wildT = (SL._wildT || 60) - dt) > 0) return;
      SL._wildT = 60;
      if (game.ents.some(e => e.rareSlime && !e.dead)) return;
      if (world.settlements.some(s => U.dist(s.x, s.y, pe.x, pe.y) < 26)) return;
      if (Math.random() >= SL.WILD_P + (SL._force || 0)) return;
      let spot = null;
      for (let i = 0; i < 30 && !spot; i++) {
        const a = Math.random() * Math.PI * 2, d = 18 + Math.random() * 10;
        const x = pe.x + Math.cos(a) * d, y = pe.y + Math.sin(a) * d;
        if (x < 4 || y < 4 || x > world.W - 5 || y > world.H - 5 || world.settlements.some(s => U.dist(s.x, s.y, x, y) < 20)) continue;
        spot = ECHO.Ent.freeSpot(world, x, y, 4);
      }
      if (!spot) return;
      const lvl = ECHO.Explore ? ECHO.Explore.level(world, { x: spot.x, y: spot.y, kind: 'grot' }) : Math.max(1, ECHO.Prowess.level(pl));
      const e = ECHO.Monsters.make(game, 'slime', spot.x, spot.y, SL.apexLv(game, lvl + 2), { noElite: true });
      e.home = { x: spot.x, y: spot.y }; e.slimeWild = true;
      SL.mark(game, e);
      game.addEnt(e);
      return e;
    },
    // one of the rare ones (not a piece of one, nor one called up by its own kind)
    mark(game, e) {
      e.rareSlime = true; e.home0 = { x: e.x, y: e.y };
      e.gateXp = (e.gateXp || 1) * 3;           // (more to learn from it than from anything of its level)
      const pl = game.pl; if (pl) pl.slimesMet = (pl.slimesMet || 0);
    },
    // you see it: once for each one
    sight(game, e) {
      const pl = game.pl, pe = game.pe;
      if (!e.rareSlime || e._sighted || !pe || U.dist(e.x, e.y, pe.x, pe.y) > 15) return;
      e._sighted = true; pl.slimesMet = (pl.slimesMet || 0) + 1;
      ECHO.UI.banner('A slime!', `${U.cap(e.label || e.foe.name)} · level ${e.lvl} — the rarest thing in the realm, the strongest and the cleverest`, true);
      if (ECHO.Music) ECHO.Music.stinger('discover');
      ECHO.Combat.ring(e.x, e.y, 2.4 * (e.scale || 1), 'rgba(160,240,90,0.9)', 0.8);
    },
    // beaten: the reward is huge
    onKill(game, e) {
      const world = game.world, pl = game.pl, L = e.lvl || 1, evo = e.evo || 1, r = Math.random;
      if (!e.rareSlime && !(e.species === 'slime' && !e.summoner)) return;
      const drop = (kind, qty, o) => game.loot.push(Object.assign({ x: e.x + (r() - 0.5) * 1.6, y: e.y + (r() - 0.5) * 1.6, kind, qty }, o || {}));
      // its core: drink it and your mana is deeper for good
      drop('slimecore', 1, { lv: L, evo, big: !!e.rareSlime });
      if (!e.rareSlime) return;
      drop('gel', 4 + Math.floor(r() * 4));
      drop('gold', Math.round((60 + 25 * Math.min(L, 150)) * (1 + 0.3 * (evo - 1))));
      ECHO.Monsters.dropGear(game, e.x + 0.6, e.y, L + 2, 40, `in the core of ${e.label || 'a slime'}`);
      if (ECHO.Arcana && ECHO.Arcana.drop) ECHO.Arcana.drop(game, e.x - 0.6, e.y, L, { boost: 40, floor: evo >= 3 || L >= 25 ? 'epic' : 'rare', where: `in the core of ${e.label || 'a slime'}` });
      pl.renown = (pl.renown || 0) + 10 + 4 * evo;
      pl.slimesSlain = (pl.slimesSlain || 0) + 1;
      if (ECHO.Chronicle) ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} found ${e.label ? ECHO.Evolve ? ECHO.Evolve.a(e.label.replace(/ \(reformed\)$/, '')) : 'a slime' : 'a slime'} — the rarest thing in the realm — and beat it.`, importance: 3, x: e.x, y: e.y, rep: 6, tag: 'fight' });
      ECHO.UI.banner('The slime is beaten', 'Its core, a relic, gear and coin lie where it fell', true);
    },
    // tamed: the strongest beast there is
    onTame(game, r, e) {
      const world = game.world, pl = game.pl;
      if (!SL.is(r.kind)) return;
      pl.slimesTamed = (pl.slimesTamed || 0) + 1;
      pl.renown = (pl.renown || 0) + 25;
      if (e && e.rareSlime && ECHO.Chronicle) ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} tamed a slime — the rarest and strongest thing in the realm. It feeds on ${pl.first}'s mana now.`, importance: 3, x: e.x, y: e.y, rep: 8, tag: 'fight' });
      setTimeout(() => ECHO.UI.toast(`${r.name} is yours: the strongest beast there is. It heals as it fights, drinks the mana of what it strikes, splits nothing it loses, grows faster than any other beast and past your own level, and has six forms to grow through. While it is fed and out with you, its life runs into yours: you heal steadily. But it feeds on your mana for as long as you keep it (out with you in full; resting at your den, a quarter) — grow your mana well to keep it fed (K: your mana).`, 'legend', 14), 900);
    },

    // ------------------------------------------------------------ in a fight (Monsters.tick)
    // Returns true when it spent the frame on something of its own.
    tick(game, e, dt, d, ang) {
      if (e.pal) return false;
      const pe = game.pe, world = game.world, T = e.target || pe, sc = e.scale || 1;
      e.sT = e.sT || {};
      for (const k in e.sT) e.sT[k] -= dt;
      SL.learn(game, e, dt);
      SL.track(game, e, T);
      switch (e.state) {
        case 'pwind': return SL.pwind(game, e, dt);
        case 'pounce': return SL.pounce(game, e, dt);
        case 'engulf': return SL.engulf(game, e, dt);
        case 'devour': return SL.devour(game, e, dt);
        case 'vwind': return SL.vwind(game, e, dt);
      }
      // drawn very far from its ground with you out of sight, it goes back (and forgets you)
      const h = e.home0;
      if (h && !e.summoner && U.dist(e.x, e.y, h.x, h.y) > SL.LEASH && d > 20) {
        e.aggro = false; e.target = null; e.state = 'idle'; e.lastSeen = null; e.homing = true;
        return true;
      }
      if (e.homing) {
        if (U.dist(e.x, e.y, h.x, h.y) > 1.2 && d > 10) { ECHO.Ent.travel(world, e, h.x, h.y, e.speed, dt); e.state = 'chase'; return true; }
        e.homing = false;
      }
      // badly hurt: it leaves a piece of itself to hold you, and slides away to heal
      if (e.retreat) return SL.retreatTick(game, e, dt, T, d);
      if (!e.summoner && !e.summoned && !e.shard && e.hp < e.maxHp * 0.3 && (e.retreats || 0) < 2 && !(e.burn > 0)) { SL.startRetreat(game, e, T); return true; }
      // risen from a puddle under your feet: no watching, straight at you
      if (e._wasPuddle) {
        e._wasPuddle = false;
        if (d < 7 && e.rareSlime && !e.watched) { e.watched = true; e.sT.pounce = 0; C().floater(e.x, e.y - 1.4 * sc, 'it rises from the ground!', '#b8ff7a', true); C().burst(e.x, e.y, '#9fe05a', 26, 5, 0.7, 3); }
      }
      // the first time it sees you, it sizes you up
      if (e.rareSlime && !e.watched && T === pe && SL.watch(game, e, dt, d, ang, T)) return true;
      // hurt and something to eat near: it eats (and heals) rather than fight on hurt
      if (!(e.sT.devour > 0) && e.hp < e.maxHp * 0.65 && d > 3) {
        const prey = SL.preyNear(game, e, 6);
        if (prey) { SL.startDevour(game, e, prey); return true; }
      }
      const los = d < 3 || ECHO.Ent.lineOfSight(world, e.x, e.y, T.x, T.y);
      // the leap
      if (!(e.sT.pounce > 0) && d > 2.6 && d < 8 + sc && los && !e.summoned) { SL.startPounce(game, e, T, ang, d); return true; }
      // the acid
      if (!(e.sT.volley > 0) && d > 3.5 && d < 11 && los && ((e.evo || 1) >= 2 || e.rareSlime)) { SL.startVolley(game, e, T, ang); return true; }
      // in its reach: now and then it swallows instead of striking
      if (!(e.sT.engulf > 0) && e.cd <= 0 && d < e.foe.reach + (T.r || 0.33) + 0.25 * sc && Math.random() < dt * 1.4) { SL.startEngulf(game, e, T); return true; }
      return false;
    },
    // where what it hunts is going (it lands, and spits, ahead of you)
    track(game, e, T) {
      const k = e._tk || (e._tk = { x: T.x, y: T.y, t: game.time, vx: 0, vy: 0, of: T });
      if (k.of !== T) { k.of = T; k.x = T.x; k.y = T.y; k.t = game.time; k.vx = k.vy = 0; return; }
      const dt = game.time - k.t;
      if (dt < 0.1) return;
      const vx = (T.x - k.x) / dt, vy = (T.y - k.y) / dt;
      k.vx += (vx - k.vx) * 0.6; k.vy += (vy - k.vy) * 0.6;
      k.x = T.x; k.y = T.y; k.t = game.time;
    },
    ahead(e, T, secs) {
      const k = e._tk; if (!k || k.of !== T) return { x: T.x, y: T.y };
      let ox = k.vx * secs, oy = k.vy * secs; const m = Math.hypot(ox, oy);
      if (m > 2.6) { ox *= 2.6 / m; oy *= 2.6 / m; }
      return { x: T.x + ox, y: T.y + oy };
    },
    // ------------------------------------------------------------ it sizes you up
    watch(game, e, dt, d, ang, T) {
      const sc = e.scale || 1;
      if (e.watchUntil == null) {
        e.watchUntil = game.time + 3.2; e._side = Math.random() < 0.5 ? 1 : -1; e._wd0 = d;
        C().floater(e.x, e.y - 1.5 * sc, 'it is watching you…', '#b8ff7a', true);
        if (game.pl && !game.pl._slimeWatchTip) { game.pl._slimeWatchTip = true; ECHO.UI.toast('The slime has stopped. It is watching you, learning you. In a moment it will come — if you mean to leave, leave now.', 'warn', 6); }
      }
      // you back away and leave it be: it lets you go — this time
      if (d > Math.max(13, (e._wd0 || 0) + 3) && e.hp >= e.maxHp * 0.97) {
        e.aggro = false; e.target = null; e.state = 'idle'; e.watchUntil = null; e.lastSeen = null; e._calm = game.time + 15;
        C().floater(e.x, e.y - 1.5 * sc, 'it lets you go', '#b8ff7a', true);
        return true;
      }
      if (game.time > e.watchUntil || e.hp < e.maxHp * 0.97 || d < 4.2) {
        e.watched = true; e.sT.pounce = 0;
        C().ring(e.x, e.y, 2.2 * sc, 'rgba(160,240,90,0.9)', 0.5);
        if (ECHO.Sfx) ECHO.Sfx.play('roar', { vol: 0.45, pitch: 1.7 });
        return false;
      }
      // it keeps its distance, and circles you (it does not follow you away: it watches you go)
      const want = 8, side = e._side, a2 = ang + side * Math.PI / 2;
      const tx = T.x - Math.cos(ang) * want + Math.cos(a2) * 2.5, ty = T.y - Math.sin(ang) * want + Math.sin(a2) * 2.5;
      if (d < want + 1.5) { ECHO.Ent.travel(game.world, e, tx, ty, e.speed * 0.55, dt); e.state = 'chase'; }
      else { e.moving = false; e.state = 'idle'; }
      e.dir = ang; e.flip = Math.cos(ang) < 0;
      return true;
    },
    // ------------------------------------------------------------ the leap
    startPounce(game, e, T, ang, d) {
      const world = game.world, sc = e.scale || 1, dur = 0.42 + d * 0.035;
      const A = SL.ahead(e, T, 0.42 + dur);
      let lx = A.x, ly = A.y;
      const dd = U.dist(e.x, e.y, lx, ly), max = 8.5 + sc;
      if (dd > max) { lx = e.x + (lx - e.x) / dd * max; ly = e.y + (ly - e.y) / dd * max; }
      const spot = ECHO.Ent.freeSpot(world, lx, ly, 2) || { x: T.x, y: T.y };
      e.leap = { x0: e.x, y0: e.y, x1: spot.x, y1: spot.y, t: 0, dur, T };
      e.state = 'pwind'; e.t = 0; e.windEnd = 0.42; e.aim = ang; e.moving = false;
      e.sT.pounce = 4.2 + Math.random() * 1.6;
      e._tele = C().telegraph({ x: spot.x, y: spot.y, cx: spot.x, cy: spot.y, shape: 'circle', radius: 1.3 + 0.35 * sc, life: 0.42 + dur, color: 'rgba(160,255,90,0.3)', by: e });
    },
    pwind(game, e, dt) {
      e.moving = false; e.dir = e.aim;
      if (e.t > e.windEnd) { e.state = 'pounce'; e.leap.t = 0; if (ECHO.Sfx) ECHO.Sfx.play('whoosh', { vol: 0.5, pitch: 0.6 }); }
      return true;
    },
    pounce(game, e, dt) {
      const L = e.leap;
      if (!L) { e.state = 'chase'; return false; }
      L.t += dt;
      const k = Math.min(1, L.t / L.dur);
      e.x = L.x0 + (L.x1 - L.x0) * k; e.y = L.y0 + (L.y1 - L.y0) * k;
      e._leapK = k; e.moving = true; e.dir = Math.atan2(L.y1 - L.y0, L.x1 - L.x0);
      if (k < 1) return true;
      // it lands
      e._leapK = 0; e.leap = null;
      const sc = e.scale || 1, R = 1.3 + 0.35 * sc, dmg = e.foe.dmg * (e.dmgMul || 1) * 1.6;
      C().ring(e.x, e.y, R, 'rgba(160,240,90,0.95)', 0.45); C().burst(e.x, e.y, '#9fe05a', 30, 6, 0.8, 3);
      C().decal(e.x, e.y, 'slime', 1.4 * sc, 16);
      if (game.shake) game.shake(0.3);
      if (ECHO.Sfx) ECHO.Sfx.play('slam', { vol: 0.5, pitch: 0.7 });
      let caught = null;
      for (const o of game.ents) {
        if (o === e || o.dead || !game.hostileTo(e, o)) continue;
        const dd = U.dist(o.x, o.y, e.x, e.y);
        if (dd > R + (o.r || 0.33)) continue;
        C().damage(o, dmg, { type: 'melee', from: e, angle: Math.atan2(o.y - e.y, o.x - e.x), knock: 0.5 });
        if (!caught && dd < 0.9 + 0.3 * sc && !o.dead) caught = o;
      }
      if (caught && !(e.sT.engulf > 0)) SL.startEngulf(game, e, caught);
      else { e.state = 'chase'; e.cd = 0.5; }
      return true;
    },
    // ------------------------------------------------------------ swallowed whole
    startEngulf(game, e, T) {
      e.state = 'engulf'; e.eng = { T, t: 0, dur: 1.9, tick: 0 }; e.sT.engulf = 8 + Math.random() * 2; e.moving = false;
      C().floater(T.x, T.y - 1.4, T === game.pe ? 'SWALLOWED!' : 'swallowed', '#b8ff7a', true);
      if (T === game.pe && game.pl && !game.pl._engulfTip) { game.pl._engulfTip = true; ECHO.UI.toast('It has swallowed you: acid eats at you and your mana until it spits you out. Strike it from inside to break out sooner.', 'warn', 6); }
      if (ECHO.Sfx) ECHO.Sfx.play('roar', { vol: 0.35, pitch: 1.9 });
    },
    engulf(game, e, dt) {
      const G = e.eng, T = G && G.T, pe = game.pe;
      e.moving = false;
      if (!T || T.dead || (T === pe && (game.defeating || game.pl.capture))) { e.state = 'chase'; e.eng = null; return false; }
      G.t += dt;
      // held inside it
      const k = Math.min(1, dt * 10);
      T.x += (e.x - T.x) * k; T.y += (e.y - T.y) * k;
      if (T === pe) { game.pl.rootT = Math.max(game.pl.rootT || 0, 0.15); game.pl.x = pe.x; game.pl.y = pe.y; }
      if ((G.tick -= dt) <= 0) {
        G.tick = 0.35;
        const dmg = e.foe.dmg * (e.dmgMul || 1) * 0.42;
        C().damage(T, dmg, { type: 'magic', from: e, angle: 0, unblockable: true });
        if (T === pe && e.ab && e.ab.manadrain) SL.drink(game, e, dmg);
        C().burst(T.x, T.y - 0.4, '#b8ff7a', 6, 2, 0.4, 2);
      }
      if (G.t < G.dur) return true;
      // spat out
      const a = Math.random() * Math.PI * 2, sp = ECHO.Ent.freeSpot(game.world, e.x + Math.cos(a) * 1.8, e.y + Math.sin(a) * 1.8, 2);
      if (sp) { T.x = sp.x; T.y = sp.y; if (T === pe) { game.pl.x = pe.x; game.pl.y = pe.y; } }
      C().burst(T.x, T.y, '#9fe05a', 18, 4, 0.6, 3);
      e.state = 'chase'; e.eng = null; e.cd = 0.8;
      return true;
    },
    // ------------------------------------------------------------ acid
    startVolley(game, e, T, ang) {
      e.state = 'vwind'; e.t = 0; e.windEnd = 0.5; e.aim = ang; e.vT = T; e.moving = false;
      e.sT.volley = 6 + Math.random() * 2;
    },
    vwind(game, e, dt) {
      e.moving = false; e.dir = e.aim;
      if (e.t <= e.windEnd) return true;
      const T = e.vT || game.pe, dmg = e.foe.dmg * (e.dmgMul || 1) * 0.7;
      const A = SL.ahead(e, T, U.dist(e.x, e.y, T.x, T.y) / 11), a0 = Math.atan2(A.y - e.y, A.x - e.x);
      for (const k of [-1, 0, 1]) C().shoot(e, a0 + k * 0.2, { kind: 'orb', speed: 11, dmg, life: 1.3, type: 'magic', color: '#a8f060', effect: 'acid' });
      // where it lands, the acid pools
      (e._pools || (e._pools = [])).push({ x: A.x, y: A.y, r: 1.25, at: game.time + U.dist(e.x, e.y, A.x, A.y) / 11, until: game.time + 6, tick: 0, tele: null });
      if (e._pools.length > 6) e._pools.shift();
      e.state = 'chase'; e.cd = Math.max(e.cd, 0.4);
      if (ECHO.Sfx) ECHO.Sfx.play('cast', { vol: 0.35, pitch: 0.6 });
      return true;
    },
    pools(game, e, dt) {
      const pe = game.pe, now = game.time;
      e._pools = e._pools.filter(P => now < P.until);
      for (const P of e._pools) {
        if (now < P.at) continue;
        if (!P.tele) { P.tele = C().telegraph({ x: P.x, y: P.y, cx: P.x, cy: P.y, shape: 'circle', radius: P.r, life: P.until - now, color: 'rgba(150,240,80,0.16)', by: e }); C().decal(P.x, P.y, 'slime', 1.4, 7); }
        if (Math.random() < dt * 5) C().fx.push({ kind: 'p', x: P.x + (Math.random() - 0.5) * P.r * 1.6, y: P.y + (Math.random() - 0.5) * P.r, vx: 0, vy: 0, t: 0, life: 0.6, color: '#b8ff7a', size: 1.4, glow: true, h: 0.05, vz: 0.9, g: 0 });
        if ((P.tick -= dt) > 0) continue;
        P.tick = 0.5;
        for (const o of game.ents) {
          if (o.dead || o === e || !game.hostileTo(e, o) || (o === pe && game.pl.flying)) continue;
          if (U.dist(o.x, o.y, P.x, P.y) > P.r + (o.r || 0.33)) continue;
          C().damage(o, e.foe.dmg * (e.dmgMul || 1) * 0.16, { type: 'magic', from: e, angle: 0, unblockable: true });
          if (o === pe) game.pl.slowT = Math.max(game.pl.slowT || 0, 0.6);
        }
      }
    },
    // ------------------------------------------------------------ it learns what hurts it
    felt(game, e, type, dmg) {
      if (e.pal || !(dmg > 0)) return;
      const L = e._slLearn || (e._slLearn = {});
      L[type] = (L[type] || 0) + dmg;
      // struck from inside: it spits you out the sooner
      if (e.state === 'engulf' && e.eng && e.eng.T === game.pe) e.eng.dur -= 0.22;
    },
    CAP: { melee: 0.85, ranged: 0.88, magic: 0.82, fire: 0.3 },
    WORD: { melee: 'steel', ranged: 'arrows', magic: 'spells', fire: 'fire' },
    learn(game, e, dt) {
      if ((e._slLearnT = (e._slLearnT || 3) - dt) > 0) return;
      e._slLearnT = 3;
      const L = e._slLearn; e._slLearn = {};
      if (!L) return;
      let tot = 0, top = null;
      for (const k in L) { tot += L[k]; if (!top || L[k] > L[top]) top = k; }
      if (!top || !SL.CAP[top] || tot < e.maxHp * 0.006 || L[top] < tot * 0.55) return;
      e.resist = e.resist || {};
      const was = e.resist[top] || 0, now = Math.min(SL.CAP[top], was + 0.07);
      if (now <= was) return;
      e.resist[top] = now;
      e.learned = e.learned || {}; e.learned[SL.WORD[top]] = Math.round(now * 100);
      C().floater(e.x, e.y - 1.6 * (e.scale || 1), `it learns: ${SL.WORD[top]} bite less`, '#b8ff7a', true);
      C().ring(e.x, e.y, 1.1 * (e.scale || 1), 'rgba(184,255,122,0.7)', 0.35);
      if (game.pl && !game.pl._learnTip) { game.pl._learnTip = true; ECHO.UI.toast(`The slime is learning you: it hardens to whatever you hurt it with most. Change how you fight — steel, arrows, spells, fire — before it has learned it all.`, 'warn', 7); }
    },
    // ------------------------------------------------------------ hurt badly: a piece left to hold you, and away to heal
    startRetreat(game, e, T) {
      e.retreats = (e.retreats || 0) + 1;
      e.retreat = { until: game.time + 9 };
      const sc = e.scale || 1;
      for (let i = 0; i < 2; i++) {
        if (ECHO.Monsters.canSummon && !ECHO.Monsters.canSummon(game, e, 4)) break;
        const a = Math.atan2(T.y - e.y, T.x - e.x) + (i ? 0.7 : -0.7), sp = ECHO.Ent.freeSpot(game.world, e.x + Math.cos(a) * 1.4, e.y + Math.sin(a) * 1.4, 2);
        if (!sp) continue;
        const s = ECHO.Monsters.make(game, 'slimeling', sp.x, sp.y, e.lvl, { noElite: true, aggro: true, summoned: true, noEvo: true, delve: e.delve, indoor: e.indoor, questId: e.questId });
        s.floor = e.floor; s.summoner = e; s.decoy = true;
        game.ents.push(s);
      }
      C().floater(e.x, e.y - 1.6 * sc, 'it tears off a piece of itself — and slides away to heal', '#b8ff7a', true);
      C().burst(e.x, e.y, '#9fe05a', 26, 5, 0.7, 3);
    },
    retreatTick(game, e, dt, T, d) {
      const R = e.retreat;
      if (game.time > R.until || e.hp > e.maxHp * 0.8) {
        e.retreat = null; e.sT.pounce = 0;
        C().floater(e.x, e.y - 1.6 * (e.scale || 1), 'it comes again', '#b8ff7a', true);
        if (ECHO.Sfx) ECHO.Sfx.play('roar', { vol: 0.4, pitch: 1.6 });
        return false;
      }
      const away = Math.atan2(e.y - T.y, e.x - T.x);
      ECHO.Ent.travel(game.world, e, e.x + Math.cos(away) * 6, e.y + Math.sin(away) * 6, e.speed * 1.1, dt);
      e.state = 'chase'; e.dir = away;
      return true;
    },
    // ------------------------------------------------------------ it eats
    preyNear(game, e, r) {
      let best = null, bd = r;
      for (const o of game.ents) {
        if (o === e || o.dead || o.vanish || o.hidden) continue;
        if (!(o.foe || o.type === 'creature') || o.type === 'person' || o.type === 'boss') continue;
        if ((o.foe && o.foe.slimeK) || o.pal || o.tamed || o.titan || o.boss2 || o.keybearer || o.questId || o.event || o.isCompanion || o.giant || o.nem || o.marvel || o.apexId || o.faction === 'player') continue;
        if ((o.floor != null || e.floor != null) && o.floor !== e.floor) continue;
        const dd = U.dist(o.x, o.y, e.x, e.y);
        if (dd < bd) { bd = dd; best = o; }
      }
      return best;
    },
    startDevour(game, e, p) { e.state = 'devour'; e.prey = p; e.preyT = 0; e.moving = true; },
    devour(game, e, dt) {
      const p = e.prey, sc = e.scale || 1;
      e.preyT = (e.preyT || 0) + dt;
      if (!p || p.dead || p.vanish || e.preyT > 7) { e.prey = null; e.state = e.aggro ? 'chase' : 'idle'; e.sT = e.sT || {}; e.sT.devour = 3; return false; }
      const dd = U.dist(e.x, e.y, p.x, p.y);
      if (dd > (e.r || 0.4) + (p.r || 0.36) + 0.35 + 0.3 * sc) {
        ECHO.Ent.travel(game.world, e, p.x, p.y, e._spd0 * 1.15, dt);
        e.dir = Math.atan2(p.y - e.y, p.x - e.x); e.moving = true;
        return true;
      }
      // swallowed: dissolved, and it is the more for it
      p.dead = true; p.vanish = true;
      C().burst(p.x, p.y, '#9fe05a', 28, 5, 0.7, 3); C().ring(e.x, e.y, 1.4 * sc, 'rgba(160,240,90,0.85)', 0.45);
      C().decal(p.x, p.y, 'slime', 1.1, 14);
      const nm = (p.label || (p.foe && p.foe.name) || p.species || 'beast').replace(/^the /i, '');
      C().floater(e.x, e.y - 1.6 * sc, `devours the ${nm.toLowerCase()}`, '#b8ff7a', true);
      if (ECHO.Sfx) ECHO.Sfx.play('roar', { vol: 0.3, pitch: 2.1 });
      SL.grow(game, e, p);
      e.prey = null; e.state = e.aggro ? 'chase' : 'idle'; e.sT = e.sT || {}; e.sT.devour = 2.5;
      return true;
    },
    // what it takes from what it eats
    TRAITS: {
      spider: 'venom', queen: 'venom', troll: 'a troll\'s healing', wolf: 'a wolf\'s speed', giantrat: 'a rat\'s quickness', tuskling: 'a boar\'s charge',
      wraith: 'the wraith\'s step', cultist: 'spellcraft', shaman: 'spellcraft', necromancer: 'spellcraft', golem: 'stone skin', golemling: 'stone skin',
      skeleton: 'bone', skelarcher: 'bone', wight: 'bone', ogre: 'an ogre\'s strength', ghoul: 'hunger'
    },
    grow(game, e, p) {
      const P = ECHO.Prowess, MAX = P.MAX || 1500;
      e.absorbed = (e.absorbed || 0) + 1;
      const L0 = e.lvl || 1, pL = P.foeLevel(p) || 1;
      const L1 = Math.min(MAX, L0 + Math.max(1, Math.round(pL * 0.12 + L0 * 0.03)));
      const f0 = P.foeMul(L0), f1 = P.foeMul(L1), hk = f1.hp / f0.hp;
      e.maxHp = Math.round(e.maxHp * hk);
      e.hp = Math.min(e.maxHp, e.hp * hk + e.maxHp * 0.3);
      e.dmgMul = (e.dmgMul || 1) * f1.dmg / f0.dmg;
      e.lvl = L1; if (e._plv) e._plv = L1;
      e.scale = Math.min(2.6, (e.scale || 1) * 1.03);
      // a trait, once each
      const sp = p.species || (p.foe && p.foe.shape) || '', t = SL.TRAITS[sp] || (p.elem === 'fire' || (p.foe && p.foe.shape === 'drake') ? 'fire-eater' : null);
      e.traits = e.traits || [];
      if (t && !e.traits.includes(t)) {
        e.traits.push(t);
        e.ab = e.ab || {}; e.resist = e.resist || {};
        if (t === 'venom') e.ab.poison = { dps: 3 + Math.min(40, L1 * 0.2), dur: 5 };
        else if (t === 'a troll\'s healing') e.ab.slimeHeal = (e.ab.slimeHeal || 0.01) + 0.004;
        else if (t === 'a wolf\'s speed' || t === 'a rat\'s quickness' || t === 'a boar\'s charge') e._spd0 = Math.min((e.foe.speed || 5) * 1.4, (e._spd0 || e.speed) * 1.08);
        else if (t === 'the wraith\'s step') e.ab.teleport = e.ab.teleport || { cd: 6 };
        else if (t === 'spellcraft') { if (e.ab.bolt) e.ab.bolt.dmg = (e.ab.bolt.dmg || 1.4) + 0.4; }
        else if (t === 'stone skin') e.resist.melee = Math.min(SL.CAP.melee, (e.resist.melee || 0) + 0.08);
        else if (t === 'bone') e.resist.ranged = Math.min(SL.CAP.ranged, (e.resist.ranged || 0) + 0.06);
        else if (t === 'an ogre\'s strength') e.dmgMul *= 1.1;
        else if (t === 'hunger') e.ab.frenzy = true;
        else if (t === 'fire-eater') e.resist.fire = Math.min(SL.CAP.fire, (e.resist.fire || 0) + 0.25);
        C().floater(e.x, e.y - 2.1 * (e.scale || 1), `+ ${t}`, '#ffe08a', true);
      }
      C().floater(e.x, e.y - 1.1 * (e.scale || 1), `level ${L1}`, '#b8ff7a');
      // and in time, a new form
      if (ECHO.Evolve) { e.evoKills = (e.evoKills || 0) + 1; ECHO.Evolve.check(game, e); }
      const R = ECHO.Renderer3D, v = R && R.views && R.views.get && R.views.get(e);
      if (v) v.cfgT = 0;
    },
    // its blow drinks your mana, and what it drinks heals it
    drink(game, from, dmg) {
      const pl = game.pl, k = from.ab.manadrain, take = Math.min(pl.mana || 0, dmg * k);
      if (take <= 0) return;
      pl.mana -= take;
      from.hp = Math.min(from.maxHp, from.hp + take * 2);
      C().floater(game.pe.x, game.pe.y - 1.4, `−${Math.round(take)} mana`, '#7ab8ff');
      if (Math.random() < 0.5) C().fx.push({ kind: 'arc', x: game.pe.x, y: game.pe.y, x2: from.x, y2: from.y, h: 0.6, t: 0, life: 0.3, color: '#7ab8ff' });
    },

    // ------------------------------------------------------------ yours
    // what it costs to keep, a second (out with you; a quarter of it resting at your den)
    upkeep(r) { return (0.6 + 0.035 * (r.lvl || 1)) * (1 + 0.3 * ((r.evo || 1) - 1)); },
    mine(pl) { return ECHO.Tame ? ECHO.Tame.pack(pl).filter(r => r.cat !== 'boss' && SL.is(r.kind)) : []; },
    // the level a slime of yours can reach: past your own (the highest potential of anything)
    capOf(game, r) { return Math.min(ECHO.Prowess.MAX, Math.round(ECHO.Prowess.level(game.pl) * 1.25) + 5); },
    // every frame: it feeds (well.js calls this), fights the better for being fed
    feed(game, dt) {
      const pl = game.pl, mine = SL.mine(pl);
      SL._rate = 0;
      if (!mine.length) return 0;
      const world = game.world, T = ECHO.Tame;
      let want = 0;
      for (const r of mine) want += SL.upkeep(r) * (r.out && !T.resting(world, r) ? 1 : 0.25);
      SL._rate = want;
      const need = want * dt, pay = Math.min(pl.mana || 0, need);
      pl.mana -= pay;
      const fed = need <= 0 || pay >= need * 0.98;
      for (const r of mine) {
        const e = T.live(game, r);
        if (fed) {
          r.starve = 0;
          if (e && e._starveOn) { e._starveOn = false; e.palDmg = e._palFull || e.palDmg; C().floater(e.x, e.y - 1.4, 'fed', '#9fe05a'); }
          // fed, it heals even in a fight — and its life runs into yours
          if (e && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.02 * dt);
          if (e && r.out && game.pe && !game.pe.dead && pl.hp < pl.maxHp) { pl.hp = Math.min(pl.maxHp, pl.hp + pl.maxHp * 0.006 * dt); game.pe.hp = pl.hp; }
          continue;
        }
        if (!r.out) continue;
        r.starve = (r.starve || 0) + dt;
        if (e && !e._starveOn) { e._starveOn = true; e._palFull = e.palDmg; e.palDmg *= 0.5; C().floater(e.x, e.y - 1.4, 'hungry — no mana', '#ff9a7a'); }
        if (e && Math.random() < dt * 2) C().fx.push({ kind: 'p', x: e.x, y: e.y - 0.3, vx: 0, vy: 0, t: 0, life: 0.5, color: '#7a7a7a', size: 1.4, h: 0.4, vz: 0.6, g: 0 });
        if (r.starve > 30) {
          r.starve = 0; r.out = false;
          ECHO.UI.toast(`${r.name} has gone too long without your mana and slips back to your den to sleep it off. Grow your mana well (K → your mana, or at camp and the arcanist) to keep it out with you.`, 'warn', 8);
        }
      }
      return pay;
    },
    rate() { return SL._rate || 0; }
  };
})();
