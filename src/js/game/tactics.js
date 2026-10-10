// Fighting together.
//
// Everyone attacking the same target is a squad, and the squad has a plan.
//   · Melee fighters spread round their target instead of queueing up: each
//     takes a place on the ring, and only two or three press in to strike at
//     once while the rest circle, feint and wait their turn — then swap.
//   · Shield-bearers stand together between their archers and the enemy,
//     shields up, and advance slowly.
//   · Archers keep their distance, find a line of fire clear of their friends,
//     and fall back when someone closes in.
//   · The first to see a fight shouts for help, and friends nearby come running.
//   · Morale: a squad that loses its leader, or most of its number, or is
//     badly outmatched, breaks — some run, some throw down their weapons. The
//     undead and the mindless never break.
(function () {
  const { U } = ECHO;
  const FEARLESS = new Set(['skeleton', 'skelarcher', 'wight', 'king', 'slime', 'slimeling', 'golem', 'golemling', 'wraith', 'hollowking', 'necromancer']);
  const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

  const T = ECHO.Tactics = {
    squads: new Map(), t: 0,
    // who is fighting whom
    attacker(e) {
      if (e.dead || e.hidden || e.isCompanion || e.pet || e.yielded) return false;
      if (e.type === 'person') return e.state === 'chase' || e.state === 'windup' || e.state === 'attack';
      if (e.foe) return !!e.aggro;
      if (e.type === 'creature' && e.species === 'wolf') return ['stalk', 'windup', 'lunge', 'retreat'].includes(e.state);
      return false;
    },
    isLeader(game, e) {
      if (e.foe) return !!(e.foe.elite || e.elite || e.boss2 || e.keybearer || e.giant);
      if (e.type === 'creature') return e.scale > 1.25 || !!e.mutation || !!e.winter;
      const n = e.npcId && game.world.npcs[e.npcId];
      if (!n) return false;
      const camp = n.camp && game.world.camps.find(c => c.id === n.camp);
      return (camp && camp.leader === n.id) || n.rank >= 3;
    },
    fearless(game, e) {
      if (e.foe) return FEARLESS.has(e.species) || FEARLESS.has(e.foe.look) || !!e.giant;
      if (e.type === 'creature') return !!e.winter;
      const n = e.npcId && game.world.npcs[e.npcId];
      return !!(n && ECHO.People.has(n, 'brave') && Math.random() < 0.7);
    },
    // ------------------------------------------------------------ the squads, a few times a second
    update(game, dt) {
      T.t -= dt;
      if (T.t > 0) return;
      T.t = 0.25;
      const by = new Map();
      for (const e of game.ents) {
        if (!T.attacker(e)) continue;
        const tg = e.target && !e.target.dead ? e.target : null;
        if (!tg) continue;
        let s = by.get(tg); if (!s) { s = { target: tg, members: [] }; by.set(tg, s); }
        s.members.push(e);
      }
      const old = T.squads;
      T.squads = by;
      for (const [tg, s] of by) {
        const prev = old.get(tg);
        s.start = prev ? prev.start : game.time;
        s.size0 = Math.max(prev ? prev.size0 : 0, s.members.length);
        s.dead = prev ? prev.dead : 0;
        s.leaderDown = prev ? prev.leaderDown : false;
        s.leaders = s.members.filter(e => T.isLeader(game, e));
        s.knownLeaders = new Set([...(prev ? prev.knownLeaders : []), ...s.leaders]);
        // the dead since last time
        if (prev) for (const m of prev.members) if (m.dead && !m._counted) { m._counted = true; s.dead++; if (s.knownLeaders.has(m)) { s.leaderDown = true; for (const o of s.members) if (!o.dead && U.dist(o.x, o.y, m.x, m.y) < 14 && o.sayT <= 0 && Math.random() < 0.5) { o.say = ['They got the chief!', 'Fall back!', 'No…!'][Math.floor(Math.random() * 3)]; o.sayT = 2; } } }
        T.assign(game, s);
        T.morale(game, s);
      }
    },
    // places on the ring, and who gets to strike
    assign(game, s) {
      const tg = s.target;
      const melee = s.members.filter(e => !T.ranged(e));
      // order by the angle they already stand at, so nobody crosses over
      melee.sort((a, b) => Math.atan2(a.y - tg.y, a.x - tg.x) - Math.atan2(b.y - tg.y, b.x - tg.x));
      const n = melee.length;
      const base = n ? Math.atan2(melee[0].y - tg.y, melee[0].x - tg.x) : 0;
      // strikers: the ones already closest, a couple at a time, rotating
      const tokens = n >= 6 ? 3 : 2;
      const byDist = melee.slice().sort((a, b) => U.dist(a.x, a.y, tg.x, tg.y) - U.dist(b.x, b.y, tg.x, tg.y));
      // a turn lasts until a little after your blow lands (or a few seconds without one)
      for (const e of melee) if (e.token && ((e.struckT && game.time - e.struckT > 1.1) || game.time - e.tokenT > 4.5)) { e.token = false; e.struckT = 0; e.restT = game.time + 0.6 + Math.random() * 0.8; }
      const keep = byDist.filter(e => e.token).slice(0, tokens);
      for (const e of melee) if (!keep.includes(e)) e.token = false;
      for (const e of byDist) { if (keep.length >= tokens) break; if (!keep.includes(e) && !(e.restT > game.time)) { keep.push(e); e.token = true; e.tokenT = game.time; } }
      melee.forEach((e, i) => { e.slotA = base + (i / Math.max(1, n)) * Math.PI * 2; e.squadN = n; });
      // shields: a wall in front of the archers
      const shields = s.members.filter(e => e.gear && e.gear.shield && e.type === 'person');
      const archers = s.members.filter(e => T.ranged(e));
      if (shields.length >= 2 && archers.length) {
        const cx = archers.reduce((a, e) => a + e.x, 0) / archers.length, cy = archers.reduce((a, e) => a + e.y, 0) / archers.length;
        const a0 = Math.atan2(tg.y - cy, tg.x - cx);
        shields.forEach((e, i) => { const off = (i - (shields.length - 1) / 2) * 1.1; e.wallAt = { x: cx + Math.cos(a0) * 2.4 + Math.cos(a0 + Math.PI / 2) * off, y: cy + Math.sin(a0) * 2.4 + Math.sin(a0 + Math.PI / 2) * off, a: a0 }; });
      } else for (const e of shields) e.wallAt = null;
    },
    ranged(e) { return !!(e.gear && e.gear.bow) || !!(e.foe && (e.shooter || (e.ab && e.ab.ranged))); },
    // the nerve of the squad
    morale(game, s) {
      const tg = s.target;
      if (s.members.length === 0) return;
      // how strong are we against them?
      let ours = 0, theirs = 0;
      for (const e of s.members) ours += e.hp / Math.max(1, e.maxHp);
      if (tg === game.pe) theirs = 1 + game.pl.hp / Math.max(1, game.pl.maxHp) + game.ents.filter(o => o.isCompanion && !o.dead && U.dist(o.x, o.y, tg.x, tg.y) < 10).length * 0.8;
      else theirs = 1 + tg.hp / Math.max(1, tg.maxHp || 1);
      const lost = s.dead / Math.max(1, s.size0 + 0);
      let m = 1 - lost * 1.1 - (s.leaderDown ? 0.45 : 0) + U.clamp((ours - theirs) * 0.1, -0.3, 0.15) + (s.leaders.length ? 0.15 : 0);
      s.nerve = m;
      if (game.time - s.start < 3) return;
      for (const e of s.members) {
        if (e.rout || T.fearless(game, e)) continue;
        const own = e.hp / Math.max(1, e.maxHp);
        const mine = m - (own < 0.35 ? 0.3 : 0);
        if (mine < 0.25 && Math.random() < 0.35) T.breakOff(game, e, tg);
      }
    },
    breakOff(game, e, from) {
      const n = e.npcId && game.world.npcs[e.npcId];
      // some throw down their weapons
      if (e.type === 'person' && from === game.pe && n && !ECHO.People.has(n, 'cruel') && Math.random() < 0.35 && !e.triedYield) {
        e.triedYield = true; e.yielded = true; e.aggro = false; e.target = null; e.state = 'idle';
        e.say = ['Mercy! I yield!', 'Enough — enough!', 'Don\'t kill me!'][Math.floor(Math.random() * 3)]; e.sayT = 3;
        return;
      }
      e.rout = { x: from.x, y: from.y, t: 0 };
      e.token = false;
      e.say = e.foe && e.foe.look === 'goblin' ? 'Run! Run!' : e.type === 'creature' ? '*yelp*' : ['Run for it!', 'I\'m out!', 'Not worth dying for!', 'Fall back!'][Math.floor(Math.random() * 4)]; e.sayT = 2;
      if (e.type === 'person' && n) ECHO.People.remember(game.world, n, 'fled a losing fight', 'trauma', null, 1);
    },
    // running away for good
    flee(game, e, dt) {
      const R = e.rout; R.t += dt;
      const a = Math.atan2(e.y - R.y, e.x - R.x) + Math.sin(R.t * 1.3 + e.id) * 0.3;
      ECHO.Ent.seek(game.world, e, e.x + Math.cos(a) * 3, e.y + Math.sin(a) * 3, e.speed * 1.15, dt, 0.1);
      e.state = 'flee'; e.target = null; e.aggro = false;
      const d = U.dist(e.x, e.y, game.pe.x, game.pe.y);
      if (R.t > 6 && d > 16) { e.dead = true; e.vanish = true; }
      // cornered and caught: fight again
      if (d < 1.6 && R.t > 2 && Math.random() < dt * 2) { e.rout = null; e.aggro = true; e.target = game.pe; e.say = 'Cornered…'; e.sayT = 1.5; }
      return true;
    },
    // ------------------------------------------------------------ moving in a fight
    // returns true when it has moved the fighter (so the usual chase is skipped)
    move(game, e, target, d, ang, speed, dt, o) {
      const world = game.world;
      if (e.rout) return T.flee(game, e, dt);
      const reach = o.reach || 1.2;
      // archers: a clear line, and distance
      if (o.archer) {
        const want = o.want || 6;
        if (d < 3.2) {
          // back off toward friends (or just away)
          const friends = game.ents.filter(x => x !== e && !x.dead && x.target === target && U.dist(x.x, x.y, e.x, e.y) < 10 && !T.ranged(x));
          let ax = e.x - target.x, ay = e.y - target.y;
          if (friends.length) { const f = friends[0]; ax += (f.x - e.x) * 0.3; ay += (f.y - e.y) * 0.3; }
          const a = Math.atan2(ay, ax);
          ECHO.Ent.seek(world, e, e.x + Math.cos(a) * 2, e.y + Math.sin(a) * 2, speed * 0.95, dt, 0.1);
          e.dir = ang; e.flip = Math.cos(ang) < 0;
          return true;
        }
        // a friend in the line of fire? step sideways
        const blocker = game.ents.find(x => x !== e && !x.dead && x !== target && !game.hostileTo(e, x) && x.type !== 'player' && U.dist(x.x, x.y, e.x, e.y) < d && Math.abs(angDiff(Math.atan2(x.y - e.y, x.x - e.x), ang)) < 0.25);
        if (blocker) { e.sideStep = e.sideStep || (Math.random() < 0.5 ? 1 : -1); const a = ang + e.sideStep * Math.PI / 2; ECHO.Ent.seek(world, e, e.x + Math.cos(a), e.y + Math.sin(a), speed * 0.7, dt, 0.1); e.blockedShot = true; return true; }
        e.blockedShot = false;
        if (d > want + 2 || !ECHO.Ent.lineOfSight(world, e.x, e.y, target.x, target.y)) { ECHO.Ent.travel(world, e, target.x, target.y, speed, dt); return true; }
        return false;
      }
      // shield wall
      if (e.wallAt && d > 2.2) {
        if (U.dist(e.x, e.y, e.wallAt.x, e.wallAt.y) > 0.5) ECHO.Ent.travel(world, e, e.wallAt.x, e.wallAt.y, speed * 0.6, dt); else e.moving = false;
        e.blocking = true; e.dir = ang; e.flip = Math.cos(ang) < 0;
        return true;
      }
      if (e.slotA == null || (e.squadN || 1) < 2) return false;
      // pressing in, or circling for a turn
      if (e.token) return false;
      const ring = reach + 1.7 + (e.type === 'creature' ? 0.6 : 0);
      // drift round toward your place on the ring (the far side, if you can get there)
      const cur = Math.atan2(e.y - target.y, e.x - target.x);
      const step = U.clamp(angDiff(e.slotA, cur), -0.6, 0.6);
      const a = cur + step;
      // a feint now and then: step in, then back out
      e.feintT = (e.feintT || 0) - dt;
      let r = ring;
      if (e.feintT <= 0) { e.feintT = 2.5 + Math.random() * 3; e.feint = 0.6; }
      if (e.feint > 0) { e.feint -= dt; r = ring - 1.1; }
      const tx = target.x + Math.cos(a) * r, ty = target.y + Math.sin(a) * r;
      if (U.dist(e.x, e.y, tx, ty) > 0.35) ECHO.Ent.seek(world, e, tx, ty, speed * 0.75, dt, 0.25); else e.moving = false;
      e.dir = ang; e.flip = Math.cos(ang) < 0;
      if (e.type === 'person' && e.sayT <= 0 && Math.random() < dt * 0.08) { e.say = ['Surround them!', 'Take the flank!', 'Wait for it…', 'Now — together!'][Math.floor(Math.random() * 4)]; e.sayT = 1.6; }
      return true;
    },
    // may this fighter swing now?
    mayStrike(e) { return (e.token !== false && !e.struckT) || (e.squadN || 1) < 2 || T.ranged(e); },
    struck(game, e) { if (e.token) e.struckT = game.time; },
    // ------------------------------------------------------------ a shout for help
    shout(game, e, target) {
      if (e.shouted && game.time - e.shouted < 12) return;
      e.shouted = game.time;
      const L = e.foe ? 'shout' : 'call';
      e.say = e.foe ? (e.foe.look === 'goblin' ? 'Intruder! INTRUDER!' : e.foe.look === 'wight' ? '…RISE…' : 'Over here!') : e.role === 'guard' || e.role === 'soldier' ? 'To arms! To me!' : e.role === 'bandit' ? 'Lads! Over here!' : 'Help!';
      e.sayT = 1.8;
      if (ECHO.Senses) ECHO.Senses.noise(game, e.x, e.y, 16, { kind: L, by: e, target });
      for (const o of game.ents) {
        if (o === e || o.dead || o.hidden || o.target || o.rout || o.yielded) continue;
        if (U.dist(o.x, o.y, e.x, e.y) > 16) continue;
        const ally = o.foe ? !!e.foe : (o.type === 'person' && e.type === 'person' && !game.hostileTo(o, e) && (o.role === e.role || ((o.role === 'guard' || o.role === 'soldier') && (e.role === 'guard' || e.role === 'soldier' || e.role === 'villager'))));
        if (!ally) continue;
        if (o.foe) { o.aggro = true; o.sus = 1; }
        else if (o.role === 'guard' || o.role === 'soldier' || o.role === 'bandit') { o.target = target; o.aggro = o.aggro || target === game.pe && o.role === 'bandit'; o.lookAt = { x: e.x, y: e.y, t: game.time }; }
      }
    }
  };
})();
