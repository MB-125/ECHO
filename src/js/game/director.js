// Director: the pacing of danger.
//
// Under everything sits a quiet sense of how hard things have been lately — a
// tension that climbs while you fight, takes a jump each time you're hurt,
// and ebbs while you walk and rest (faster in a town, at an inn, by a fire).
//
// It spaces things out. After a hard fight the land gives you room to breathe:
// no fresh wolf packs come over the hill, the night raiders keep to other
// roads, and the rare great events wait. When you're nearly dead, your foes
// come at you one at a time instead of all at once, nobody calls for help,
// and the blows land a shade lighter — you won't notice, but you'll live
// more often by the skin of your teeth.
//
// And when things have been quiet too long, it sends something. A wolf pack
// shadowing you at the edge of sight, howling. Riders on the road at night.
// Someone hurt in the grass ahead, calling for help — who is usually exactly
// what they seem, and sometimes bait.
(function () {
  const { U } = ECHO;
  const pick = a => a[Math.floor(Math.random() * a.length)];

  const D = ECHO.Director = {
    tension: 0, lastPeak: -999, calmSince: 0, lastTwist: 0, t: 0, twistT: 30, hp0: null, log: [],
    // ------------------------------------------------------------ the model
    measure(game, dt) {
      const pe = game.pe, pl = game.pl, now = game.time;
      let n = 0;
      for (const e of game.ents) {
        if (e.dead || e.hidden || e === pe || e.isCompanion) continue;
        if ((e.target === pe || (e.foe && e.aggro) || e.type === 'boss' && e.aggro) && U.dist(e.x, e.y, pe.x, pe.y) < 12) n++;
      }
      const hp = pl.hp / pl.maxHp;
      const lost = D.hp0 != null ? Math.max(0, D.hp0 - hp) : 0;
      D.hp0 = hp;
      let T = D.tension;
      T += n * 0.014 * dt * 2 + lost * 1.3 + (n && hp < 0.3 ? 0.03 * dt * 2 : 0);
      if (!n) {
        const resting = ECHO.Interior.cur && !ECHO.Interior.cur.carved || ECHO.World.settlementAt(game.world, pe.x, pe.y, 12) || pe.seated || (ECHO.Camp && ECHO.Camp.fire);
        T -= dt * (resting ? 0.02 : 0.008);
      }
      D.tension = U.clamp(T, 0, 1);
      if (D.tension > 0.72) D.lastPeak = now;
      if (n || (game.combatT != null && now - game.combatT < 15)) D.calmSince = now;
      D.engaged = n;
    },
    // ------------------------------------------------------------ the gates
    // May something new and dangerous turn up now?
    allow(game, kind) {
      const now = game.time, pl = game.pl;
      const hp = pl ? pl.hp / pl.maxHp : 1;
      if (kind === 'rare') return D.tension < 0.4 && now - D.lastPeak > 60;
      if (D.tension > 0.55 || now - D.lastPeak < 45 || hp < 0.4) return false;
      return true;
    },
    // Nearly dead, and still fighting: a little grace.
    mercy(game) {
      const pl = game.pl;
      return !!pl && pl.hp < pl.maxHp * 0.25 && D.engaged > 0;
    },
    // ------------------------------------------------------------ twists, when it's been too quiet
    twist(game) {
      const world = game.world, pe = game.pe, pl = game.pl, now = game.time;
      if (ECHO.Interior.cur || pl.capture || game.defeating || pe.inBoat || ECHO.UI.modalOpen) return;
      const quiet = now - D.calmSince;
      if (quiet < 160 || D.tension > 0.15 || now - D.lastTwist < 240) return;
      const town = ECHO.World.settlementAt(world, pe.x, pe.y, 14);
      const dusk = world.minute / 60 >= 18.5 || world.minute / 60 < 5.5;
      const level = ECHO.Prowess ? ECHO.Prowess.level(pl) : 1;
      const opts = [];
      if (town) {
        if (ECHO.Callers) opts.push([3, 'caller', () => { ECHO.Callers.nextAt = 0; return true; }]);
      } else {
        if (dusk) opts.push([3, 'stalkers', () => D.stalkers(game)]);
        if (dusk && level >= 2 && ECHO.Riders) opts.push([2, 'raid', () => ECHO.Riders.raid(game)]);
        opts.push([3, 'stranger', () => D.stranger(game)]);
        if (quiet > 600 && ECHO.Events) opts.push([1, 'giant', () => { const S = ECHO.Events.st(world); if (S.giant || world.day - S.lastGiant < 5) return false; ECHO.Events.spawnGiant(game); return true; }]);
      }
      if (!opts.length) return;
      let tot = 0; for (const o of opts) tot += o[0];
      let r = Math.random() * tot, ch = opts[0];
      for (const o of opts) { r -= o[0]; if (r <= 0) { ch = o; break; } }
      if (ch[2]()) { D.lastTwist = now; D.calmSince = now; D.log.push({ t: now, kind: ch[1] }); if (D.log.length > 20) D.log.shift(); }
    },
    // a pack at the edge of sight, howling; they'll come if you linger or look weak
    stalkers(game) {
      const pe = game.pe, world = game.world;
      const region = ECHO.World.regionAt(world, pe.x, pe.y);
      const spot = ECHO.Spawner.findSpot(game, 'wolf', 18, 24);
      if (!spot) return false;
      const pack = 'pS' + Math.floor(Math.random() * 1e6), n = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++) {
        const w = ECHO.Spawner.makeCreature(game, 'wolf', spot.x + (Math.random() - 0.5) * 1.5, spot.y + (Math.random() - 0.5) * 1.5, region, pack);
        w.shadow = { t0: game.time };
        if (i === 0) { w.say = 'Aoooooo…'; w.sayT = 2.5; }
        game.addEnt(w);
      }
      if (ECHO.Sfx) ECHO.Sfx.play('growl', { pitch: 0.6, vol: 0.5 });
      game.ui.toast('A howl, not far off. Then another, answering.', 'warn', 4);
      return true;
    },
    // keeps pace at a distance, circling; closes in after a while or if you're hurt
    shadow(game, w, dt, speed) {
      const S = w.shadow, pe = game.pe;
      if (!S) return false;
      const d = U.dist(w.x, w.y, pe.x, pe.y), age = game.time - S.t0;
      const hurt = game.pl.hp < game.pl.maxHp * 0.5;
      if (age > 50 || hurt || d < 7 || w.hp < w.maxHp) { w.shadow = null; w.target = pe; w.aggro = true; w.scentT = game.time; if (w.sayT <= 0) { w.say = '*snarl*'; w.sayT = 1; } return false; }
      const a = Math.atan2(w.y - pe.y, w.x - pe.x) + dt * 0.18 * ((w.id % 2) ? 1 : -1);
      const r = 15 + Math.sin(game.time * 0.4 + w.id) * 2;
      ECHO.Ent.seek(game.world, w, pe.x + Math.cos(a) * r, pe.y + Math.sin(a) * r, speed * (d > 20 ? 0.9 : 0.5), dt, 0.3);
      w.state = 'stalk';
      if (w.sayT <= 0 && Math.random() < dt * 0.04) { w.say = pick(['Aoooo…', '*yip*', 'Aoo-oo…']); w.sayT = 2; }
      return true;
    },
    // someone hurt in the grass ahead
    stranger(game) {
      const world = game.world, pe = game.pe, pl = game.pl;
      const level = ECHO.Prowess ? ECHO.Prowess.level(pl) : 1;
      const R = ECHO.Riders;
      const spot = (R && R.roadSpot(game, 15, 22)) || ECHO.Spawner.findSpot(game, null, 15, 22);
      if (!spot) return false;
      const trap = level >= 2 && Math.random() < 0.3;
      const free = n => n && n.status === 'alive' && !n.journey && !game.ents.some(e => e.npcId === n.id && !e.dead) && n.id !== pl.companion && !n.jailed && ECHO.People.age(world, n) >= 18 && n.prof !== 'ruler' && !n.title;
      let n;
      if (trap) { const pool = []; for (const c of world.camps) if (c.alive !== false) for (const id of c.members) if (free(world.npcs[id]) && c.leader !== id) pool.push(world.npcs[id]); if (pool.length < 3) return false; n = pick(pool); D._bait = pool.filter(x => x !== n).slice(0, 2); }
      else n = pick(Object.values(world.npcs).filter(x => free(x) && x.faction !== 'ashfang' && x.prof !== 'child' && x.prof !== 'guard'));
      if (!n) return false;
      const e = ECHO.Spawner.makePerson(game, n, spot.x, spot.y, 'villager');
      e.faction = trap ? 'neutral' : n.faction;
      e.hp = Math.round(e.maxHp * (trap ? 0.9 : 0.3));
      e.stranded = { trap, t0: game.time, bait: trap ? D._bait : null, sprung: false, helped: false };
      game.addEnt(e);
      return true;
    },
    strandedThink(game, e, npc, dt) {
      const S = e.stranded, pe = game.pe, world = game.world;
      const d = U.dist(e.x, e.y, pe.x, pe.y);
      if (game.time - S.t0 > 300 || d > 70) { e.dead = true; e.vanish = true; return; }
      if (S.helped) {
        // on their way, slowly
        e.kneel = false;
        const t = S.to || (S.to = ECHO.World.nearestSettlement(world, e.x, e.y));
        if (t) ECHO.Ent.travel(world, e, t.x, t.y, e.speed * 0.45, dt);
        if (d > 30) { e.dead = true; e.vanish = true; }
        return;
      }
      e.moving = false; e.kneel = true;
      if (d < 26) e.dir = Math.atan2(pe.y - e.y, pe.x - e.x);
      if (e.sayT <= 0 && d < 24 && d > 3) { e.say = pick(['Help! Over here — please!', 'Is someone there? Help me!', 'Please… I can\'t walk.', 'Over here! Help!']); e.sayT = 3.5; }
      // the trap springs
      if (S.trap && !S.sprung && d < 2.8) {
        S.sprung = true;
        e.kneel = false; e.role = 'bandit'; e.faction = 'ashfang'; e.aggro = true; e.target = pe; e.stranded = null;
        e.say = 'NOW!'; e.sayT = 2;
        for (const b of S.bait || []) {
          const a = Math.random() * 6.28;
          const sp = ECHO.Ent.freeSpot(world, pe.x + Math.cos(a) * 7, pe.y + Math.sin(a) * 7, 3);
          if (!sp) continue;
          const be = ECHO.Spawner.makePerson(game, b, sp.x, sp.y, 'bandit');
          be.target = pe; be.aggro = true;
          game.addEnt(be);
        }
        game.ui.toast('It\'s a trap!', 'warn', 3);
        if (ECHO.Sfx) ECHO.Sfx.play('growl', { pitch: 1.4, vol: 0.5 });
        return;
      }
    },
    interactables(game) {
      const pe = game.pe, out = [];
      for (const e of game.ents) {
        if (!e.stranded || e.dead || e.stranded.helped || e.stranded.trap || U.dist(e.x, e.y, pe.x, pe.y) > 1.8) continue;
        const n = game.world.npcs[e.npcId];
        out.push({ kind: 'act', label: `Help ${n ? n.first : 'them'} up`, d: 0.5, act: () => D.help(game, e, n) });
      }
      return out;
    },
    help(game, e, n) {
      const pl = game.pl, world = game.world;
      e.stranded.helped = true;
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.25);
      const s = n && ECHO.Sim.settlement(world, n.home);
      e.say = pick([`Thank you. I was set on by wolves — I thought I'd die out here.`, 'Bless you. I turned my ankle in the dark and couldn\'t go on.', 'Thank you. Robbed, and left for dead. Thank you.']); e.sayT = 3.5;
      if (n) {
        ECHO.People.remember(world, n, `${pl.first} ${pl.last} found me hurt on the road and helped me home`, 'gratitude', null, 4);
        n.op = n.op || {}; n.op[pl.charId] = (n.op[pl.charId] || 0) + 20;
        if (n.mind) n.mind.owe = (n.mind.owe || 0) + 1;
      }
      ECHO.Character.behave(pl, 'mercy', 0.3);
      game.ui.toast(`${n ? n.first : 'They'} thanks you and limps off ${s ? `toward ${s.name}` : 'down the road'}. ${s ? 'They won\'t forget it.' : ''}`, 'mercy', 5);
    },
    // ------------------------------------------------------------ each frame
    update(game, dt) {
      if (!game.pe || !game.pl || !game.world) return;
      D.t -= dt;
      if (D.t > 0) return;
      D.t = 0.5;
      D.measure(game, 0.5);
      D.twistT -= 0.5;
      if (D.twistT <= 0) { D.twistT = 15; D.twist(game); }
    }
  };
  if (ECHO.Pastimes) {
    ECHO.Pastimes.extraAct = ECHO.Pastimes.extraAct || [];
    ECHO.Pastimes.extraAct.push(game => D.interactables(game));
  }
})();
