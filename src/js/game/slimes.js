// The slimes: the strongest things that live.
//
// Whatever its level, a slime is one of the hardest things in the realm to kill, and of all
// the things that live it has the highest potential: six forms, the first of them early, each
// a bigger step than any other kind takes (evolve.js).
//   • It heals as you cut it (a little of its life every second, more than any troll; fire stops it for a while).
//   • Every blow it lands drinks your mana, and what it drinks heals it.
//   • It spits acid and swallows what stands too close (and more as it evolves).
//   • It splits when it dies; the pieces are slimes too, and two pieces that meet crawl back
//     together into a slime (twice in a line; the third time it stays dead).
//   • It is slow, and it keeps to its own ground: walk away and it will not follow you far.
// And it is the rarest thing there is. No place keeps slimes as its own: one turns up, very
// seldom, on any floor of any deep place (a few in a hundred), or out in the wild (about once
// in an hour or two of wandering), glowing green where it lies. Beat one and the reward is huge:
// a slime core that deepens your mana for good, a relic, fine gear, a heap of coin and gel, and
// more experience than anything of its level; tame one, and you have the strongest beast there is.
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
    LEASH: 11,

    // ------------------------------------------------------------ always, in or out of a fight
    always(game, e, dt) {
      if (e.pal || e.dead) return;
      if (!e.home0) e.home0 = { x: e.x, y: e.y };
      const ab = e.ab || {};
      // it heals (not while it burns, nor for a while after fire has touched it)
      if (ab.slimeHeal && e.hp < e.maxHp && !(e.burn > 0) && !(e._fireT > game.time)) {
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * ab.slimeHeal * dt);
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
      if (pl && pe && !pl._slimeTip && U.dist(e.x, e.y, pe.x, pe.y) < 12) {
        pl._slimeTip = true;
        ECHO.UI.toast(`A slime. Whatever its level, nothing that crawls is harder to kill: it heals as you cut it, drinks your mana with every blow, spits acid, splits when it dies — and the pieces crawl back together. Fire stops it healing for a while. It is slow and keeps to its own ground: you can walk away from it.`, 'warn', 12);
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
      const e = tag(ECHO.Monsters.make(game, 'slime', BASE + s0.x + 0.5, s0.y + 0.5, lvl + 2, { noElite: true }));
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
      const e = ECHO.Monsters.make(game, 'slime', spot.x, spot.y, lvl + 2, { noElite: true });
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
      ECHO.UI.banner('A slime!', `${U.cap(e.label || e.foe.name)} · level ${e.lvl} — the rarest thing in the realm, and the strongest`, true);
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
    tick(game, e, dt, d, ang) {
      if (e.pal) return false;
      // its own ground: drawn too far from it, it goes back (and forgets you)
      const h = e.home0, pe = game.pe;
      if (h && !e.summoner && U.dist(e.x, e.y, h.x, h.y) > SL.LEASH && U.dist(e.x, e.y, pe.x, pe.y) > 3.5) {
        e.aggro = false; e.target = null; e.state = 'idle'; e.lastSeen = null;
        e.homing = true;
        return true;
      }
      if (e.homing) {
        if (U.dist(e.x, e.y, h.x, h.y) > 1.2 && U.dist(e.x, e.y, pe.x, pe.y) > 2.5) { ECHO.Ent.travel(game.world, e, h.x, h.y, e.speed, dt); e.state = 'chase'; return true; }
        e.homing = false;
      }
      return false;
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
