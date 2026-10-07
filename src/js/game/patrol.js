// The watch on the street: watchmen walk real rounds — the gate, the square,
// the market, the inn, the lanes between the houses — and carry lanterns on
// night patrol. Cutpurses work the market, drunks brawl outside the inn,
// burglars try doors at night; the watch chases, catches, or loses them,
// and you can step in. When you break the law, the people who saw it run to
// the watch — unless you reach them first. Crimes nobody saw are found
// later, and the watch works them like any other: it asks who was seen near
// the place, and one day a watchman may stop you in the street with
// questions. As a deputy you walk the rounds yourself and solve cases.
(function () {
  const { U } = ECHO;
  const P = () => ECHO.People;
  const W = () => ECHO.Watch;
  const UI = () => ECHO.UI;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const Pt = ECHO.Patrol = {
    t: 0, incT: 45, seenT: 0, seen: {}, newsT: 0, glows: [], _posts: {},
    reset() { Pt.t = 0; Pt.incT = 45; Pt.seen = {}; Pt.glows = []; Pt._posts = {}; },

    // ------------------------------------------------------------ the rounds
    posts(game, s) {
      const key = s.id + ':' + s.buildings.length;
      if (Pt._posts[key]) return Pt._posts[key];
      const world = game.world, pts = [];
      const door = b => ({ x: b.x + b.w / 2, y: b.y + b.h + 0.6 });
      const add = (p, why) => { const f = ECHO.Ent.freeSpot(world, p.x, p.y, 3); if (f) pts.push({ x: f.x, y: f.y, why }); };
      // gates: where the roads leave the town
      const gates = [];
      for (const r of world.roads) {
        if (r.a !== s.id && r.b !== s.id) continue;
        const path = r.a === s.id ? r.path : r.path.slice().reverse();
        for (const i of path) { const x = i % world.W + 0.5, y = ((i / world.W) | 0) + 0.5; const d = U.dist(x, y, s.x, s.y); if (d > 9 && d < 13) { gates.push({ x, y }); break; } }
      }
      for (const g of gates) add(g, 'gate');
      add({ x: s.x, y: s.y + 1 }, 'square');
      for (const t of ['market', 'inn', 'keep', 'temple', 'smithy', 'well']) { const b = s.buildings.find(x => x.type === t); if (b) add(door(b), t); }
      const houses = s.buildings.filter(b => b.type === 'house');
      for (let i = 0; i < houses.length; i += Math.max(1, Math.floor(houses.length / 5))) add(door(houses[i]), 'lane');
      // walk them in a ring around the centre
      pts.sort((a, b) => Math.atan2(a.y - s.y, a.x - s.x) - Math.atan2(b.y - s.y, b.x - s.x));
      Pt._posts[key] = { pts, gates: pts.filter(p => p.why === 'gate') };
      return Pt._posts[key];
    },
    // Where a watchman should be right now (called from the daily schedule).
    guardTarget(game, s, npc, hour) {
      const P2 = Pt.posts(game, s);
      if (!P2.pts.length) return null;
      const guards = W().guardsOf(game.world, s).map(n => n.id).sort();
      const i = Math.max(0, guards.indexOf(npc.id));
      // the first watchman of the day keeps the gate
      if (i === 0 && P2.gates.length && hour >= 6 && hour < 21) { const g = P2.gates[Math.floor(game.world.day / 2) % P2.gates.length]; return { x: g.x, y: g.y, why: 'gate', face: { x: g.x + (g.x - s.x), y: g.y + (g.y - s.y) } }; }
      // the rest walk the rounds, spread out along them
      const n = P2.pts.length;
      const k = (Math.floor(game.time / 22) + Math.round(i * n / Math.max(1, guards.length))) % n;
      const p = P2.pts[(i % 2 ? n - k : k) % n];
      return { x: p.x, y: p.y, why: 'patrol' };
    },
    nightShift(world, s, npc) {
      const w = s.watch;
      const h = ECHO.hashStr(npc.id);
      return !!(w && w.nightPatrol && h % 2 === 0) || (w && W().guardsOf(world, s).length <= 2 && h % 2 === 0);
    },

    // ------------------------------------------------------------ every frame
    update(game, dt) {
      Pt.glows.length = 0;
      const world = game.world, pe = game.pe, pl = game.pl;
      if (!world || !pe || ECHO.Interior.cur || pl.capture) return;
      const s = game.currentSid && ECHO.Sim.settlement(world, game.currentSid);
      // duties and investigations glow where you need to go
      Pt.dutyGlows(game);
      Pt.t -= dt;
      if (Pt.t > 0) return;
      Pt.t = 0.5;
      // who has seen you lately
      for (const e of game.ents) {
        if (e.type !== 'person' || e.dead || e.hidden || e.sleeping || !e.npcId || e.role === 'bandit' || e.isCompanion) continue;
        if (Math.abs(e.x - pe.x) > 9 || Math.abs(e.y - pe.y) > 9) continue;
        if (U.dist(e.x, e.y, pe.x, pe.y) < (game.isNight() ? 5 : 9) && ECHO.Ent.lineOfSight(world, e.x, e.y, pe.x, pe.y)) Pt.seen[e.npcId] = game.time;
      }
      // lanterns on the night rounds
      const night = game.isNight();
      for (const e of game.ents) if (e.role === 'guard' && !e.dead && e.gear) { if (night && !e._torchSet) { e.gear.torch = true; e._torchSet = true; } else if (!night && e._torchSet) { e.gear.torch = false; e._torchSet = false; } }
      // news of the watch
      if (pl.watchNews && pl.watchNews.length && !UI().paused() && (Pt.newsT -= 0.5) <= 0) { Pt.newsT = 5; UI().toast(pl.watchNews.shift(), 'warn', 6); }
      if (!s || s.faction === 'ashfang') return;
      // street crime
      Pt.incT -= 0.5;
      if (Pt.incT <= 0) {
        const w = W().st(world, s);
        Pt.incT = 50 + Math.random() * 70;
        const p = 0.18 + (100 - w.safety) / 160 + (pl.deputy && pl.deputy.sid === s.id ? 0.25 : 0);
        if (Math.random() < p) Pt.incident(game, s);
      }
      Pt.questioning(game, s);
      Pt.patrolDuty(game);
    },

    // ------------------------------------------------------------ street crime
    villagers(game, s, near) {
      return game.ents.filter(e => e.type === 'person' && !e.dead && !e.hidden && !e.sleeping && e.npcId && e.role === 'villager' && !e.incident && !e.criminal && !e.isCompanion && !e.pilloried && !e.lostQuest &&
        game.world.npcs[e.npcId] && game.world.npcs[e.npcId].prof !== 'child' && (!near || U.dist(e.x, e.y, near.x, near.y) < near.r));
    },
    incident(game, s) {
      const hour = game.world.minute / 60;
      if (hour >= 6 && hour < 18) return Pt.pickpocket(game, s);
      if (hour >= 18 && hour < 23.5) return Math.random() < 0.6 ? Pt.brawl(game, s) : Pt.pickpocket(game, s);
      return Pt.burglar(game, s);
    },
    pickCulprit(game, s, pool, kind) {
      const world = game.world;
      const ring = W().st(world, s).ring;
      const wt = e => { const n = world.npcs[e.npcId]; let w = 0.15; if (P().has(n, 'greedy') || P().has(n, 'deceitful')) w *= 3; if (P().has(n, 'honest') || P().has(n, 'pious')) w *= 0.1; if (n.starve > 2 || n.wealth < 5) w *= 3; if (kind === 'brawl' && P().has(n, 'hot-headed')) w *= 4; if (ring && ring.members.includes(n.id)) w *= 4; return w; };
      const tot = pool.reduce((a, e) => a + wt(e), 0);
      let r = Math.random() * tot;
      for (const e of pool) { r -= wt(e); if (r <= 0) return e; }
      return pool[0];
    },
    pickpocket(game, s) {
      const pe = game.pe, world = game.world;
      const victims = Pt.villagers(game, s, { x: pe.x, y: pe.y, r: 16 }).filter(e => world.npcs[e.npcId].wealth > 15);
      if (!victims.length) return;
      const v = victims[Math.floor(Math.random() * victims.length)];
      const pool = Pt.villagers(game, s, { x: v.x, y: v.y, r: 14 }).filter(e => e !== v);
      if (!pool.length) return;
      const c = Pt.pickCulprit(game, s, pool, 'theft');
      c.incident = { kind: 'pick', victim: v, phase: 'approach', t: 0, sid: s.id };
      return c;
    },
    brawl(game, s) {
      const pe = game.pe;
      const pool = Pt.villagers(game, s, { x: pe.x, y: pe.y, r: 18 });
      if (pool.length < 2) return;
      const a = Pt.pickCulprit(game, s, pool, 'brawl');
      const b = pool.filter(e => e !== a).sort((x, y) => U.dist(x.x, x.y, a.x, a.y) - U.dist(y.x, y.y, a.x, a.y))[0];
      if (!b) return;
      const world = game.world;
      const na = world.npcs[a.npcId], nb = world.npcs[b.npcId];
      a.incident = { kind: 'brawl', other: b, phase: 'go', t: 0, sid: s.id, starter: true };
      b.incident = { kind: 'brawl', other: a, phase: 'go', t: 0, sid: s.id };
      a.say = [`${nb.first}! You owe me!`, `Say that again, ${nb.first}!`, 'You cheated me!', `I've had enough of you, ${nb.first}!`][Math.floor(Math.random() * 4)]; a.sayT = 3;
      void na;
      return a;
    },
    burglar(game, s) {
      const world = game.world, pe = game.pe;
      const houses = s.buildings.filter(b => b.type === 'house' && U.dist(b.x, b.y, pe.x, pe.y) < 20);
      if (!houses.length) return;
      const pool = game.ents.filter(e => e.type === 'person' && !e.dead && e.npcId && e.role === 'villager' && !e.incident && world.npcs[e.npcId] && world.npcs[e.npcId].prof !== 'child' && U.dist(e.x, e.y, pe.x, pe.y) < 30);
      if (!pool.length) return;
      const c = Pt.pickCulprit(game, s, pool, 'theft');
      const b = houses[Math.floor(Math.random() * houses.length)];
      const door = { x: b.x + b.w / 2, y: b.y + b.h + 0.5 };
      if (c.hidden) { const sp = ECHO.Ent.freeSpot(world, door.x + 5, door.y + 2, 4); if (!sp) return; c.x = sp.x; c.y = sp.y; c.hidden = false; c.sleeping = false; }
      c.incident = { kind: 'burgle', house: b, door, phase: 'go', t: 0, sid: s.id };
      return c;
    },

    // ------------------------------------------------------------ AI hook
    // Returns true when the patrol layer is driving this person this frame.
    ent(game, e, dt) {
      if (e.reporting) return Pt.reporter(game, e, dt);
      if (e.chase) return Pt.chaser(game, e, dt);
      if (e.question) return Pt.questioner(game, e, dt);
      if (!e.incident) return false;
      const I = e.incident, world = game.world;
      I.t += dt;
      e.sayT = Math.max(0, (e.sayT || 0) - dt);
      if (I.phase === 'caught' || I.phase === 'held') { e.moving = false; e.state = 'yield'; return true; }
      if (I.phase === 'arrested') {
        const g = I.escort;
        if (!g || g.dead) { e.incident = null; e.criminal = null; return false; }
        ECHO.Ent.travel(world, e, g.x + 0.8, g.y + 0.3, e.speed * 0.7, dt);
        if (I.t > 9) { e.vanish = true; e.dead = true; g.chase = null; g.escortT = 0; }
        return true;
      }
      if (I.kind === 'pick') return Pt.pickAI(game, e, I, dt);
      if (I.kind === 'brawl') return Pt.brawlAI(game, e, I, dt);
      if (I.kind === 'burgle') return Pt.burgleAI(game, e, I, dt);
      if (I.kind === 'flee') return Pt.fleeAI(game, e, I, dt);
      return false;
    },
    pickAI(game, e, I, dt) {
      const world = game.world, v = I.victim;
      if (I.phase === 'approach') {
        if (!v || v.dead || v.hidden || I.t > 25) { e.incident = null; return false; }
        const arrived = ECHO.Ent.travel(world, e, v.x + 0.5, v.y + 0.2, e.speed * 0.6, dt);
        e.moving = !arrived;
        if (U.dist(e.x, e.y, v.x, v.y) < 1.0) {
          const nv = world.npcs[v.npcId];
          const value = Math.round(Math.min(nv.wealth * 0.2, 14));
          nv.wealth -= value;
          e.criminal = { kind: 'theft', victim: v.npcId, value, sid: I.sid, witnesses: Pt.near(game, e, 10).map(o => o.npcId) };
          e.incident = { kind: 'flee', phase: 'flee', t: 0, sid: I.sid, from: v };
          // will anyone notice?
          if (Math.random() < 0.75) Pt.cry(game, v, e, ['Thief! Stop, thief!', 'My purse! Stop that one!', 'Thief! Somebody stop them!'][Math.floor(Math.random() * 3)]);
          else e.criminal.quiet = true;
        }
        return true;
      }
      return true;
    },
    fleeAI(game, e, I, dt) {
      const world = game.world, s = ECHO.Sim.settlement(world, I.sid);
      if (!s) { e.incident = null; return false; }
      // beaten: they give up
      if (e.hp < e.maxHp * 0.72) { I.phase = 'caught'; e.yielded = true; e.moving = false; e.say = 'Mercy! I\'ll give it back!'; e.sayT = 3; for (const g of game.ents) if (g.chase === e) g.chase = null; return true; }
      if (!I.dest) { const a = Math.atan2(e.y - s.y, e.x - s.x) + (Math.random() - 0.5) * 0.8; I.dest = ECHO.Ent.freeSpot(world, s.x + Math.cos(a) * 32, s.y + Math.sin(a) * 32, 6) || { x: s.x + Math.cos(a) * 30, y: s.y + Math.sin(a) * 30 }; }
      if (e.criminal && e.criminal.quiet) { ECHO.Ent.travel(world, e, I.dest.x, I.dest.y, e.speed * 0.75, dt); }
      else ECHO.Ent.travel(world, e, I.dest.x, I.dest.y, e.speed * 1.45, dt);
      e.moving = true;
      if (U.dist(e.x, e.y, s.x, s.y) > 29 || I.t > 40) Pt.escape(game, e);
      return true;
    },
    brawlAI(game, e, I, dt) {
      const world = game.world, o = I.other;
      if (!o || o.dead || !o.incident || o.incident.kind !== 'brawl') { e.incident = null; e.moving = false; return false; }
      if (I.phase === 'stopped') return false;
      const d = U.dist(e.x, e.y, o.x, o.y);
      if (d > 1.0) { ECHO.Ent.travel(world, e, o.x, o.y, e.speed * 0.9, dt); e.moving = true; }
      else {
        e.moving = false; e.dir = Math.atan2(o.y - e.y, o.x - e.x); e.flip = Math.cos(e.dir) < 0;
        e.cd = (e.cd || 0) - dt;
        if (e.cd <= 0) {
          e.cd = 0.9 + Math.random() * 0.7;
          e.attackT = 0.25; e.attackDur = 0.25; e.attackAngle = e.dir; e.attackKind = 'fore';
          if (Math.random() < 0.7) {
            o.hp = Math.max(o.maxHp * 0.3, o.hp - (2 + Math.random() * 3)); o.hurtT = 0.2; o.stagger = 0.15;
            if (ECHO.Sfx && U.dist(e.x, e.y, game.pe.x, game.pe.y) < 14) ECHO.Sfx.play('hit', { vol: 0.25, pitch: 1.3 });
            ECHO.Combat.sparks(o.x, o.y - 0.5, e.dir, '#ffd0a0', 4, 3);
          }
          if (Math.random() < 0.25) { e.say = ['Take that!', 'Had enough?', 'Come on then!', 'Ow — you\'ll pay for that!'][Math.floor(Math.random() * 4)]; e.sayT = 1.5; }
        }
        if (!I.cried && I.starter) { I.cried = true; Pt.cry(game, e, null, null, 'brawl'); }
      }
      // a beaten brawler gives up
      if (e.hp <= e.maxHp * 0.32 || I.t > 35) Pt.endBrawl(game, e, false);
      return true;
    },
    endBrawl(game, e, stopped, by) {
      const I = e.incident, o = I && I.other;
      const world = game.world;
      for (const x of [e, o]) if (x && x.incident && x.incident.kind === 'brawl') { x.incident = null; x.moving = false; x.cd = 1; }
      if (!o) return;
      const a = world.npcs[e.npcId], b = world.npcs[o.npcId];
      if (!a || !b) return;
      P().bond(a, b.id, -20); P().bond(b, a.id, -20);
      if (by === 'guard') {
        const s = ECHO.Sim.settlement(world, I.sid);
        if (s) for (const n of [a, b]) ECHO.Law.npcCrime(world, ECHO.Sim.rngFor(world), { by: n.id, kind: 'assault', sid: s.id, caught: true });
      } else if (!stopped) {
        // nobody stopped it: the watch hears of it later
        const loser = e.hp < o.hp ? e : o, winner = loser === e ? o : e;
        W().openCase(world, { kind: 'assault', sid: I.sid, by: winner.npcId, victim: loser.npcId, witnesses: Pt.near(game, winner, 10).map(x => x.npcId).filter(id => id !== loser.npcId && id !== winner.npcId).concat([loser.npcId]), night: game.isNight() });
        loser.say = 'Enough… enough.'; loser.sayT = 2;
      }
    },
    burgleAI(game, e, I, dt) {
      const world = game.world, pe = game.pe;
      if (I.phase === 'go') {
        const arrived = ECHO.Ent.travel(world, e, I.door.x, I.door.y, e.speed * 0.45, dt);
        e.moving = !arrived; e.sneak = true;
        if (arrived || U.dist(e.x, e.y, I.door.x, I.door.y) < 0.8) { I.phase = 'work'; I.t = 0; }
        if (I.t > 40) { e.incident = null; e.sneak = false; }
      } else if (I.phase === 'work') {
        e.moving = false; e.dir = -Math.PI / 2;
        if (I.t > 1 && Math.random() < dt * 0.6) { e.say = '…'; e.sayT = 1; }
        if (I.t > 7) {
          // in and out
          const owner = I.house.npcOwner && world.npcs[I.house.npcOwner] || P().residents(world, ECHO.Sim.settlement(world, I.sid)).find(n => Math.abs(ECHO.hashStr(n.last + n.home) - ECHO.hashStr(I.house.id)) % 7 === 0) || null;
          const value = owner ? Math.round(Math.min(40, owner.wealth * 0.3)) : 10;
          if (owner) owner.wealth -= value;
          const n = world.npcs[e.npcId]; if (n) n.wealth += value;
          W().openCase(world, { kind: 'burglary', sid: I.sid, by: e.npcId, victim: owner ? owner.id : null, value, witnesses: [], night: true, x: I.door.x, y: I.door.y });
          e.incident = null; e.sneak = false;
          return false;
        }
      }
      // spotted?
      const seenBy = U.dist(e.x, e.y, pe.x, pe.y) < 6 && ECHO.Ent.lineOfSight(world, e.x, e.y, pe.x, pe.y) ? 'you' : game.ents.find(g => g.role === 'guard' && !g.dead && !g.hidden && U.dist(g.x, g.y, e.x, e.y) < 7 && ECHO.Ent.lineOfSight(world, g.x, g.y, e.x, e.y));
      if (seenBy && I.t > 1.5) {
        e.sneak = false;
        e.criminal = { kind: 'burglary', victim: null, value: 0, sid: I.sid, witnesses: seenBy === 'you' ? [] : [seenBy.npcId] };
        e.incident = { kind: 'flee', phase: 'flee', t: 0, sid: I.sid };
        e.say = 'Nobody saw nothing!'; e.sayT = 2;
        if (seenBy !== 'you') { seenBy.chase = e; seenBy.say = 'You there! Stop!'; seenBy.sayT = 2; }
        else if (!game.pl._burglarHint) { game.pl._burglarHint = true; UI().toast('A burglar at a door — and now running. Catch them, or call the watch.', 'info', 4); }
      }
      return true;
    },
    // Raise the hue and cry: nearby watchmen give chase.
    cry(game, who, criminal, line, kind) {
      if (who && line) { who.say = line; who.sayT = 3; }
      const at = who || criminal;
      let n = 0;
      for (const g of game.ents) {
        if (g.role !== 'guard' || g.dead || g.hidden || g.chase || g.reporting || U.dist(g.x, g.y, at.x, at.y) > 22) continue;
        if (kind === 'brawl') { g.chase = at; g.chaseKind = 'brawl'; }
        else if (criminal) { g.chase = criminal; g.chaseKind = 'thief'; }
        g.say = kind === 'brawl' ? 'Break it up, there!' : 'Stop! In the name of the watch!'; g.sayT = 2.5;
        if (++n >= 2) break;
      }
      return n;
    },
    chaser(game, g, dt) {
      const world = game.world, c = g.chase;
      g.sayT = Math.max(0, (g.sayT || 0) - dt);
      if (!c || c.dead || c.vanish) { g.chase = null; return false; }
      if (g.chaseKind === 'brawl') {
        if (!c.incident || c.incident.kind !== 'brawl') { g.chase = null; return false; }
        ECHO.Ent.travel(world, g, c.x, c.y, g.speed * 1.2, dt); g.moving = true;
        if (U.dist(g.x, g.y, c.x, c.y) < 1.6) { g.say = 'That\'s enough! Both of you, with me.'; g.sayT = 3; Pt.endBrawl(game, c, true, 'guard'); g.chase = null; }
        return true;
      }
      if (!c.incident || c.incident.phase === 'arrested') { g.chase = null; return false; }
      ECHO.Ent.travel(world, g, c.x, c.y, g.speed * 1.38, dt); g.moving = true;
      if (U.dist(g.x, g.y, c.x, c.y) < 1.2) Pt.arrest(game, g, c);
      return true;
    },
    arrest(game, g, c, byPlayer) {
      const world = game.world, I = c.incident || {};
      const s = ECHO.Sim.settlement(world, (c.criminal && c.criminal.sid) || I.sid);
      c.incident = { kind: 'flee', phase: 'arrested', t: 0, escort: g, sid: s ? s.id : null };
      c.yielded = false; c.moving = false;
      c.say = ['All right! All right!', 'I didn\'t mean it!', 'Get your hands off me!'][Math.floor(Math.random() * 3)]; c.sayT = 2.5;
      if (g) { g.chase = null; g.say = 'You\'re coming with me.'; g.sayT = 2.5; }
      const cr = c.criminal;
      if (cr && s) {
        const v = cr.victim && world.npcs[cr.victim];
        if (v && cr.value) { v.wealth += cr.value; const n = world.npcs[c.npcId]; if (n) n.wealth = Math.max(0, n.wealth - cr.value); }
        ECHO.Law.npcCrime(world, ECHO.Sim.rngFor(world), { by: c.npcId, kind: cr.kind === 'burglary' ? 'burglary' : 'theft', victim: cr.victim, sid: s.id, amt: cr.value || 8, caught: true });
        const w = W().st(world, s); w.trust = Math.min(100, w.trust + 1);
        if (byPlayer) Pt.thanks(game, c, s);
      }
      c.criminal = null;
    },
    escape(game, e) {
      const world = game.world, cr = e.criminal;
      if (cr) W().openCase(world, { kind: cr.kind === 'burglary' ? 'burglary' : 'theft', sid: cr.sid, by: e.npcId, victim: cr.victim, value: cr.value, witnesses: cr.witnesses || [], night: game.isNight() });
      for (const g of game.ents) if (g.chase === e) g.chase = null;
      e.vanish = true; e.dead = true;
    },
    // The player catches a thief.
    thanks(game, c, s) {
      const world = game.world, pl = game.pl;
      const cr = c._crime || {};
      const v = cr.victim && world.npcs[cr.victim];
      const reward = 4 + Math.round((cr.value || 8) * 0.5);
      pl.gold += reward;
      if (v) { v.op[pl.charId] = (v.op[pl.charId] || 0) + 22; P().remember(world, v, `got their purse back thanks to ${pl.first} ${pl.last}`, 'gratitude', null, 2); }
      if (s.rep) s.rep[pl.charId] = (s.rep[pl.charId] || 0) + 2; else s.rep = { [pl.charId]: 2 };
      pl.renown += 1;
      if (pl.deputy && pl.deputy.sid === s.id) { pl.deputy.done++; pl.gold += 6; }
      ECHO.Character.behave(pl, 'protect', 0.3);
      ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} caught a thief in the streets of ${s.name}.`, importance: 0, sid: s.id, rep: 2, tag: 'protect' });
      UI().toast(`${v ? v.first + ' gets the purse back and presses ' + reward + ' crowns on you.' : 'The watch thanks you. +' + reward + ' crowns.'}`, 'mercy', 4);
    },
    near(game, e, r) { return game.ents.filter(o => o !== e && o.type === 'person' && !o.dead && !o.hidden && !o.sleeping && o.npcId && o.role !== 'bandit' && U.dist(o.x, o.y, e.x, e.y) < r); },

    // ------------------------------------------------------------ the hue and cry against you
    guardSees(game, x, y) {
      return game.ents.some(g => (g.role === 'guard' || g.role === 'soldier') && !g.dead && !g.hidden && !g.sleeping && U.dist(g.x, g.y, x, y) < 15 && ECHO.Ent.lineOfSight(game.world, g.x, g.y, x, y));
    },
    // Witnesses run for the watch. Nothing happens to you until one gets there.
    raiseCry(game, crime, victimEnt, victimReports) {
      const ids = new Set(crime.witnesses);
      if (victimReports && victimEnt && victimEnt.npcId) ids.add(victimEnt.npcId);
      let runners = 0;
      for (const e of game.ents) {
        if (!e.npcId || !ids.has(e.npcId) || e.dead || (e === victimEnt && !victimReports) || e.role === 'guard' || e.role === 'soldier') continue;
        e.reporting = { crimeId: crime.id, t: 0 };
        e.say = crime.kind === 'murder' ? ['Murder! Murder! Guards!', 'Help! Someone fetch the watch!'][Math.floor(Math.random() * 2)] : ['Guards! Guards!', 'Help! Watch!'][Math.floor(Math.random() * 2)];
        e.sayT = 3; e.target = null; e.aggro = false;
        runners++;
      }
      if (runners && !game.pl._cryHint) { game.pl._cryHint = true; UI().toast('They saw you, and they are running for the watch. Nothing is known until someone tells.', 'warn', 6); }
    },
    reporter(game, e, dt) {
      const world = game.world, pe = game.pe, pl = game.pl;
      const R = e.reporting; R.t += dt;
      e.sayT = Math.max(0, (e.sayT || 0) - dt);
      const crime = ECHO.Law.crimes(world).find(c => c.id === R.crimeId);
      if (!crime || crime.reported !== false || crime.status !== 'open') { e.reporting = null; return false; }
      if (e.hp < e.maxHp) { /* still running */ }
      const g = R.guard && !R.guard.dead ? R.guard : (R.guard = game.ents.filter(x => (x.role === 'guard' || x.role === 'soldier') && !x.dead && !x.hidden && x.faction === crime.faction).sort((a, b) => U.dist(a.x, a.y, e.x, e.y) - U.dist(b.x, b.y, e.x, e.y))[0] || null);
      if (!g || U.dist(g.x, g.y, e.x, e.y) > 60 || R.t > 45) {
        // no watchman in reach: go home and tell them in the morning
        e.reporting = null; e.goal = null; e.schedT = 0;
        return false;
      }
      ECHO.Ent.travel(world, e, g.x, g.y, e.speed * 1.35, dt); e.moving = true;
      if (U.dist(g.x, g.y, e.x, e.y) < 1.8) {
        crime.reported = true;
        pl.wanted = pl.wanted || {};
        pl.wanted[crime.faction] = Math.min(200, (pl.wanted[crime.faction] || 0) + (crime.heat || 35));
        e.say = U.dist(e.x, e.y, pe.x, pe.y) < 22 ? 'There! That one!' : `It was ${pl.first}!`; e.sayT = 3;
        g.say = 'Show me.'; g.sayT = 2;
        if (U.dist(g.x, g.y, pe.x, pe.y) < 26) g.target = pe;
        e.reporting = null;
        if (U.dist(e.x, e.y, pe.x, pe.y) < 30) UI().toast(`${world.npcs[e.npcId].first} has told the watch.`, 'warn', 4);
      }
      return true;
    },
    // A crime with no witnesses is found later, and the watch starts asking questions.
    unseen(game, kind, target, method) {
      const world = game.world, pl = game.pl;
      const wp = game.wp(target.x, target.y);
      const s = ECHO.World.settlementAt(world, wp.x, wp.y, 30);
      if (!s || s.faction === 'ashfang') return null;
      const npc = world.npcs[target.npcId];
      const seenNear = Object.entries(Pt.seen).filter(([id, t]) => game.time - t < 150 && id !== target.npcId && world.npcs[id] && world.npcs[id].status === 'alive').map(([id]) => id);
      const c = W().playerCase(world, { kind, sid: s.id, victim: npc ? npc.id : null, x: wp.x, y: wp.y, seenNear, method, night: game.isNight() });
      if (c && kind === 'murder' && npc) ECHO.Chronicle.add(world, { text: `${P().name(npc)} was found dead near ${s.name}. The watch is asking who was seen nearby.`, kind: 'crime', importance: 1, sid: s.id });
      if (pl.deputy && pl.deputy.faction === s.faction) pl.deputy.secret = (pl.deputy.secret || 0) + 1;
      return c;
    },

    // ------------------------------------------------------------ questioned by the watch
    questioning(game, s) {
      const world = game.world, pl = game.pl, pe = game.pe;
      if (UI().paused() || (pl.wanted[s.faction] || 0) > 20 || game.time - (Pt.lastQ || -99) < 90) return;
      const c = W().cases(world).find(x => x.by === 'player' && x.status === 'open' && x.faction === s.faction && x.progress >= 0.3 && !x.askedPlayer);
      if (!c) return;
      if (game.ents.some(g => g.question)) return;
      const g = game.ents.filter(x => x.role === 'guard' && !x.dead && !x.hidden && !x.chase && U.dist(x.x, x.y, pe.x, pe.y) < 16).sort((a, b) => U.dist(a.x, a.y, pe.x, pe.y) - U.dist(b.x, b.y, pe.x, pe.y))[0];
      if (!g) return;
      g.question = c.id; g.say = 'You there. A word.'; g.sayT = 3;
    },
    questioner(game, g, dt) {
      const world = game.world, pe = game.pe;
      g.sayT = Math.max(0, (g.sayT || 0) - dt);
      const c = W().byId(world, g.question);
      if (!c || c.status !== 'open' || U.dist(g.x, g.y, pe.x, pe.y) > 30 || ECHO.Interior.cur) { g.question = null; return false; }
      if (U.dist(g.x, g.y, pe.x, pe.y) > 1.8) { ECHO.Ent.travel(world, g, pe.x, pe.y, g.speed * 0.9, dt); g.moving = true; return true; }
      g.moving = false; g.dir = Math.atan2(pe.y - g.y, pe.x - g.x);
      if (UI().paused()) return true;
      g.question = null; c.askedPlayer = world.day; Pt.lastQ = game.time;
      Pt.askModal(game, g, c);
      return true;
    },
    askModal(game, g, c) {
      const world = game.world, pl = game.pl;
      const s = ECHO.Sim.settlement(world, c.sid);
      const gn = world.npcs[g.npcId];
      const w = W().st(world, s);
      const friend = P().residents(world, s).find(n => (n.op[pl.charId] || 0) > 60 && n.status === 'alive' && !P().has(n, 'honest'));
      const when = c.night ? 'the night' : 'the day';
      const what = c.kind === 'murder' ? `${c.victimName} was murdered` : c.kind === 'burglary' ? `the house of ${c.victimName || 'a townsman'} was robbed` : `${c.victimName || 'someone'} was attacked`;
      const seen = c.seenNear.filter(id => world.npcs[id] && world.npcs[id].status === 'alive').map(id => world.npcs[id].first);
      const tongue = pl.skills.tongue || 0;
      const lieP = U.clamp(0.42 + tongue / 140 - c.progress * 0.35 - seen.length * 0.05, 0.08, 0.9);
      const bribable = w.corrupt > 0.3 || ECHO.Law.code(world, s).bribable;
      const bribe = 25 + Math.round(c.kind === 'murder' ? 70 : 20);
      const rng = ECHO.Sim.rngFor(world);
      const done = (t, kind) => UI().toast(t, kind || 'info', 6);
      UI().modal({
        title: 'Questioned by the watch',
        html: `<p><b>${esc(gn ? P().fullTitle(world, gn) : 'A watchman')}</b> stops you, thumbs in belt. "On ${when} ${esc(what)}, near ${esc(s.name)}, you were seen about the place${seen.length ? ` — ${esc(U.listJoin(seen.slice(0, 2)))} say${seen.length === 1 ? 's' : ''} so` : ''}. Where were you?"</p><p class="dim">The watch does not know. It suspects.</p>`,
        choices: [
          { label: 'Tell the truth', sub: 'Confess. It will go easier for you at trial.', onPick: () => { W().solve(world, c, rng, 'confessed'); ECHO.Character.behave(pl, 'mercy', 0.2); if (gn) g.target = game.pe; } },
          { label: 'Lie', sub: `Your tongue against their doubts. (${Math.round(lieP * 100)}%)`, onPick: () => { ECHO.Character.train(pl, 'tongue', 1.2); if (Math.random() < lieP) { c.misled = true; c.progress = Math.max(0, c.progress - 0.3); done('The watchman frowns, then nods. "Mind how you go." He believes you — for now.'); } else { c.progress += 0.35; done('"That isn\'t what I heard." The watchman writes something down. Your story did not hold.', 'warn'); } } },
          ...(friend ? [{ label: `"Ask ${friend.first} ${friend.last}. I was with them."`, sub: `${friend.first} would lie for you. If it comes out, they pay too.`, onPick: () => { c.misled = true; c.progress = Math.max(0, c.progress - 0.45); c.alibi = friend.id; P().remember(world, friend, `lied to the watch for ${pl.first} ${pl.last}`, 'change', null, 3); friend.op[pl.charId] = (friend.op[pl.charId] || 0) - 5; done(`${friend.first} swears you were together all ${c.night ? 'night' : 'day'}. The watchman lets it go.`); } }] : []),
          ...(bribable ? [{ label: `Slip ${bribe} crowns into his hand`, sub: pl.gold >= bribe ? (w.corrupt > 0.3 ? 'Coin, they say, buys blindness here.' : 'He might take it. He might not.') : `You have ${Math.floor(pl.gold)}.`, disabled: pl.gold < bribe, onPick: () => { pl.gold -= bribe; ECHO.Character.behave(pl, 'betrayal', 0.4); if (Math.random() < 0.35 + w.corrupt) { c.status = 'cold'; c.buried = true; w.corrupt = Math.min(1, w.corrupt + 0.02); if (gn) gn.wealth += bribe; done('The coins vanish. "I never saw you." The case will gather dust.'); } else { c.progress += 0.5; pl.wanted[s.faction] = Math.min(200, (pl.wanted[s.faction] || 0) + 25); ECHO.Law.report(world, { by: 'player', kind: 'trespass', sid: s.id, faction: s.faction, witnesses: [g.npcId] }).reported = true; done('"A bribe? To me?" He shoves the coins back — and calls for help.', 'warn'); g.target = game.pe; } } }] : [])
        ]
      });
    },

    // ------------------------------------------------------------ deputies and investigators
    dutyGlows(game) {
      const world = game.world, pl = game.pl;
      const d = pl.deputy && pl.deputy.duty;
      if (d && d.kind === 'patrol') for (const p of d.points) if (!p.done) Pt.glows.push({ x: p.x, y: p.y, h: 0.2, s: 1.4, c: '#ffe08a', a: 0.3 + 0.15 * Math.sin(game.time * 3) });
      const c = pl.investigating && W().byId(world, pl.investigating);
      if (c && c.status === 'open' && !c.found.scene) Pt.glows.push({ x: c.x, y: c.y, h: 0.2, s: 1.3, c: '#9fd3ff', a: 0.3 + 0.12 * Math.sin(game.time * 2.5) });
    },
    patrolDuty(game) {
      const pl = game.pl, pe = game.pe, world = game.world;
      const d = pl.deputy && pl.deputy.duty;
      if (!d || d.kind !== 'patrol') return;
      for (const p of d.points) if (!p.done && U.dist(p.x, p.y, pe.x, pe.y) < 2.2) { p.done = true; ECHO.Sfx.play('pickup', { vol: 0.3 }); }
      if (d.points.every(p => p.done)) {
        const night = game.isNight();
        const pay = night ? 14 : 8;
        pl.gold += pay; pl.deputy.done++; pl.deputy.duty = null;
        const s = ECHO.Sim.settlement(world, pl.deputy.sid);
        if (s) { const w = W().st(world, s); w.trust = Math.min(100, w.trust + 0.5); w.safety = Math.min(100, w.safety + 0.5); }
        UI().toast(`Rounds walked. The captain pays you ${pay} crowns${night ? ' — night rate' : ''}.`, 'mercy', 4);
      }
    },
    giveDuty(game, kind) {
      const world = game.world, pl = game.pl;
      const s = ECHO.Sim.settlement(world, pl.deputy.sid);
      if (kind === 'patrol') {
        const pts = Pt.posts(game, s).pts.slice();
        const pick = []; const n = Math.min(4, pts.length);
        for (let i = 0; i < n; i++) pick.push(pts[Math.floor(i * pts.length / n)]);
        pl.deputy.duty = { kind: 'patrol', d: world.day, points: pick.map(p => ({ x: p.x, y: p.y, done: false })) };
        return `Walk the rounds: ${pick.length} posts, marked in gold. ${game.isNight() ? 'Night pay is better.' : 'Night pay is better, if you come back after dark.'}`;
      }
      const c = W().cases(world).filter(x => x.sid === s.id && x.status === 'open' && x.by && x.by !== 'player' && world.npcs[x.by] && world.npcs[x.by].status === 'alive').sort((a, b) => (b.kind === 'murder') - (a.kind === 'murder') || a.d - b.d)[0];
      if (!c) return 'No open cases in town just now. Walk the rounds instead.';
      pl.investigating = c.id;
      return Pt.caseBrief(world, c);
    },
    caseBrief(world, c) {
      const s = ECHO.Sim.settlement(world, c.sid);
      const wn = c.witnesses.filter(id => world.npcs[id] && world.npcs[id].status === 'alive').map(id => P().name(world.npcs[id]));
      return `The ${W().KIND_WORD[c.kind]}${c.victimName ? ' of ' + c.victimName : ''} in ${s ? s.name : 'town'}, ${ECHO.TIME.fmtShort(c.d)}. Search the place where it happened (marked in blue)${wn.length ? `, and talk to ${U.listJoin(wn)}, who saw something` : ''}. When you know who did it, tell any watchman.`;
    },
    interactables(game) {
      const out = [], world = game.world, pe = game.pe, pl = game.pl;
      if (ECHO.Interior.cur) return out;
      for (const e of game.ents) {
        if (e.dead || U.dist(e.x, e.y, pe.x, pe.y) > 2.2) continue;
        const n = world.npcs[e.npcId];
        if (e.incident && e.incident.phase === 'caught') {
          out.push({ kind: 'act', label: `Hand ${n ? n.first : 'them'} over to the watch`, d: 0.2, act: () => { e._crime = e.criminal; Pt.arrest(game, game.ents.find(g => g.role === 'guard' && !g.dead && U.dist(g.x, g.y, e.x, e.y) < 30) || null, e, true); if (!e.incident.escort) { e.vanish = true; e.dead = true; } } });
          out.push({ kind: 'act', label: `Let ${n ? n.first : 'them'} go`, d: 0.3, act: () => { const cr = e.criminal; if (cr && cr.victim && world.npcs[cr.victim]) world.npcs[cr.victim].wealth += cr.value; if (n) { n.op[pl.charId] = (n.op[pl.charId] || 0) + 25; P().remember(world, n, `was let go by ${pl.first} ${pl.last}`, 'gratitude', null, 3); } ECHO.Character.behave(pl, 'mercy', 0.4); e.incident = null; e.criminal = null; e.yielded = false; e.say = 'Thank you… I won\'t forget it.'; e.sayT = 3; } });
        } else if (e.incident && e.incident.kind === 'brawl') {
          out.push({ kind: 'act', label: 'Break it up', d: 0.2, act: () => { const o = e.incident.other; Pt.endBrawl(game, e, true); for (const x of [e, o]) if (x) { x.say = ['All right, all right.', 'He started it!', 'Fine.'][Math.floor(Math.random() * 3)]; x.sayT = 2; } pl.renown += 0.5; ECHO.Character.behave(pl, 'protect', 0.15); if (pl.deputy) pl.deputy.done++; } });
        }
      }
      const c = pl.investigating && W().byId(world, pl.investigating);
      if (c && c.status === 'open' && U.dist(c.x, c.y, pe.x, pe.y) < 1.8) out.push({ kind: 'act', label: 'Search the place', d: 0.2, act: () => { const t = W().examineScene(world, c); ECHO.Character.train(pl, 'study', 0.6); UI().toast(t, 'study', 7); } });
      return out;
    },

    // ------------------------------------------------------------ dialogue
    // Adds this person's watch-related lines to a conversation.
    dialogue(world, npc, ent, pl, api) {
      const { add, say, render, clear } = api;
      const s = ECHO.Sim.settlement(world, npc.loc || npc.home);
      const rng = ECHO.Sim.rngFor(world);
      // a witness to your crime, not yet gone to the watch
      const mine = ECHO.Law.crimes(world).filter(c => c.by === 'player' && c.reported === false && c.status === 'open' && c.witnesses.includes(npc.id));
      if (mine.length && !npc.silenced) {
        const c = mine[0];
        const cost = c.kind === 'murder' ? 80 : 20;
        add(`About what you saw… (${cost} crowns to forget it)`, () => {
          if (pl.gold < cost) return say('You don\'t have that kind of money.');
          if (P().has(npc, 'honest') || P().has(npc, 'pious') || (c.kind === 'murder' && P().has(npc, 'kind'))) { c.reported = true; pl.wanted[c.faction] = Math.min(200, (pl.wanted[c.faction] || 0) + (c.heat || 35) + 15); say(`"Keep your money." ${npc.first} backs away. "I'm going to the watch."`); ent.reporting = null; return; }
          pl.gold -= cost; npc.wealth += cost; npc.silenced = true; c.witnesses = c.witnesses.filter(id => id !== npc.id); ECHO.Character.behave(pl, 'betrayal', 0.3);
          say(`${npc.first} looks at the coins for a long moment, then pockets them. "I didn't see anything."`); ent.reporting = null; render();
        });
        add('Keep your mouth shut. Or else.', () => {
          const brave = P().has(npc, 'brave') || npc.prof === 'guard';
          const scary = (pl.renown > 25 ? 0.2 : 0) + ECHO.Character.tendency(pl, 'cruelty') * 0.5 + (P().has(npc, 'cowardly') ? 0.4 : 0) + 0.2;
          if (!brave && Math.random() < scary) { npc.silenced = true; c.witnesses = c.witnesses.filter(id => id !== npc.id); npc.op[pl.charId] = (npc.op[pl.charId] || 0) - 40; P().remember(world, npc, `was threatened by ${pl.first} ${pl.last}`, 'fear', null, 4); ECHO.Character.behave(pl, 'cruelty', 0.4); say(`${npc.first} goes white and nods, eyes on the ground.`); ent.reporting = null; render(); }
          else { c.reported = true; pl.wanted[c.faction] = Math.min(200, (pl.wanted[c.faction] || 0) + (c.heat || 35) + 10); say(`"Are you threatening me?" ${npc.first} shouts for the watch.`); ent.reporting = null; }
        });
      }
      // a witness in a case you're working
      const inv = pl.investigating && W().byId(world, pl.investigating);
      if (inv && inv.status === 'open' && inv.witnesses.includes(npc.id)) add(`About the ${W().KIND_WORD[inv.kind]}${inv.victimName ? ' of ' + inv.victimName.split(' ')[0] : ''}…`, () => say(W().witnessAccount(world, inv, npc)));
      // the ring
      const ringP = world.plights.find(p => p.kind === 'ring' && p.status === 'open' && p.informant === npc.id && pl.accepted.includes(p.id));
      if (ringP) add(`What do you know about ${ringP.ring}?`, () => {
        const w = s && W().st(world, s);
        const boss = w && w.ring && world.npcs[w.ring.boss];
        if (!boss) return say('They\'re gone, I hear. Good riddance.');
        const tell = () => { pl.ringKnown = pl.ringKnown || {}; pl.ringKnown[s.id] = boss.id; say(`${npc.first} lowers ${npc.sex === 'f' ? 'her' : 'his'} voice. "${P().name(boss)}. The ${boss.prof}. Everyone thinks ${boss.sex === 'f' ? 'she' : 'he'}'s harmless. Tell the watch — but not me. I never said it."`); render(); };
        if ((npc.op[pl.charId] || 0) >= 15) return tell();
        say(`"Why would I tell you anything?" ${npc.first} glances at the door. "It'd cost me. It'll cost you."`);
        clear();
        add('Here — 25 crowns.', () => { if (pl.gold < 25) return say('Come back when you have it.'); pl.gold -= 25; npc.wealth += 25; tell(); });
        add('Never mind.', () => render());
      });
      if (pl.ringKnown && s && pl.ringKnown[s.id] === npc.id && s.watch && s.watch.ring) add(`I know you lead ${s.watch.ring.name}.`, () => {
        const ring = s.watch.ring;
        const pay = 60 + Math.round(ring.purse || 0) / 2 | 0;
        say(`${npc.first} smiles without any warmth. "Do you. And what is it you think you know is worth, friend? ${pay} crowns, say — and you forget my name?"`);
        clear();
        add(`Take the ${pay} crowns.`, () => { pl.gold += pay; ring.purse = Math.max(0, (ring.purse || 0) - pay); ring.strength = Math.min(1, ring.strength + 0.08); ECHO.Character.behave(pl, 'betrayal', 0.6); delete pl.ringKnown[s.id]; npc.op[pl.charId] = 30; say('"A sensible soul. We\'ll talk again."'); render(); });
        add('You\'re coming with me to the watch.', () => { ent.criminal = { kind: 'smuggling', sid: s.id, value: 0, witnesses: [] }; ent.incident = { kind: 'flee', phase: 'flee', t: 0, sid: s.id }; ent.say = 'Not today!'; ent.sayT = 2; UI().closePanel(); UI().toast(`${npc.first} bolts. Catch them — or tell the watch who they are.`, 'warn', 5); });
        add('Not yet.', () => render());
      });
      // the watch itself
      if (npc.prof !== 'guard' || !s || s.faction !== npc.faction) return;
      const w = W().st(world, s);
      add('How safe is this town?', () => say(W().describe(world, s).join(' ')));
      // tell them who leads the ring
      if (pl.ringKnown && pl.ringKnown[s.id] && w.ring) add(`${P().name(world.npcs[pl.ringKnown[s.id]])} leads ${w.ring.name}.`, () => {
        const n = W().raidRing(world, s, rng, `${pl.first} ${pl.last}`);
        delete pl.ringKnown[s.id];
        pl.renown += 6;
        ECHO.Chronicle.deed(world, { text: `On the word of ${pl.first} ${pl.last}, the watch of ${s.name} broke ${w.ring ? w.ring.name : 'the ring'} and took ${n} of them.`, importance: 2, sid: s.id, rep: 6, tag: 'protect' });
        say(`${npc.first} is already reaching for the bell rope. "If you're right, the town owes you. If you're wrong, so help you." By dawn ${n} of them are in the cells. (Claim the reward from the captain who asked.)`);
        render();
      });
      // a case you've worked out
      const myCase = pl.investigating && W().byId(world, pl.investigating);
      if (myCase && myCase.status === 'open' && myCase.sid === s.id && (myCase.playerProgress || 0) >= 0.6) add(`I know who did the ${W().KIND_WORD[myCase.kind]}.`, () => {
        const sus = W().suspects(world, myCase);
        const notes = [myCase.found.scene, myCase.found.sex && `It was ${myCase.found.sex}.`, myCase.found.hair && `${U.cap(myCase.found.hair)} hair.`].filter(Boolean).join(' ');
        say(`"Go on, then. Who?"\n\nWhat you know: ${notes || 'little enough.'}`);
        clear();
        for (const n of sus) add(`${P().name(n)} — ${P().role(world, n)}, ${n.sex === 'f' ? 'a woman' : 'a man'} with ${W().hairOf(n)} hair`, () => {
          const right = W().accuse(world, myCase, n.id, rng);
          pl.investigating = null;
          if (right) { pl.gold += 25; if (pl.deputy) { pl.deputy.done++; pl.gold += 10; } say(`The watch takes ${n.first}. Under questioning, ${n.sex === 'f' ? 'she' : 'he'} breaks. You were right. (+${pl.deputy ? 35 : 25} crowns)`); UI().toast(`You solved the ${W().KIND_WORD[myCase.kind]}.`, 'legend', 5); }
          else { say(`The watch takes ${n.first}, who swears ${n.sex === 'f' ? 'she' : 'he'} never did it. ${n.sex === 'f' ? 'She' : 'He'} is punished all the same — on your word.`); UI().toast('The guilty one is still out there. You may never know who it was.', 'warn', 6); }
          render();
        });
        add('Not yet — I need to be sure.', () => render());
      });
      // confess
      const open = W().cases(world).filter(c => c.by === 'player' && c.status === 'open' && c.faction === s.faction);
      if (open.length) add(`I want to confess to the ${W().KIND_WORD[open[0].kind]}${open[0].victimName ? ' of ' + open[0].victimName : ''}.`, () => {
        W().solve(world, open[0], rng, 'confessed');
        ECHO.Character.behave(pl, 'mercy', 0.3);
        say(`${npc.first} stares at you. "…Then you'll come with me." (You will be tried. Confession earns some mercy.)`);
        ent.target = ECHO.Game.pe; render();
      });
      // join the watch, or take a duty
      const wanted = (pl.wanted[s.faction] || 0) > 0 || ECHO.Law.openAgainstPlayer(world, pl, s.faction).length;
      if (!pl.deputy && !wanted) add('Does the watch need another pair of hands?', () => {
        const rep = (s.rep && s.rep[pl.charId]) || 0;
        if (rep < -5) return say(`"Not yours." ${npc.first} doesn't even look up.`);
        say(`"Always. Deputies walk the rounds, catch what thieves they can, and work the cases we're too few to work. Pay's by the job — better at night. You break the law, you're out." ${w.corrupt > 0.4 ? 'He lowers his voice. "And you\'ll see things. Learn when to look away."' : ''}`);
        clear();
        add('Swear me in.', () => { W().deputize(world, pl, s); say(`${npc.first} hands you a watchman's badge of tarnished brass. "Welcome to the watch of ${s.name}."`); render(); });
        add('Not now.', () => render());
      });
      if (pl.deputy && pl.deputy.sid === s.id) {
        add('What needs doing?', () => {
          clear();
          add('I\'ll walk the rounds.', () => { say(Pt.giveDuty(ECHO.Game, 'patrol')); render(); });
          add('Give me a case to work.', () => { say(Pt.giveDuty(ECHO.Game, 'case')); render(); });
          add('Never mind.', () => render());
          say(`"${pl.deputy.done ? `You've done ${pl.deputy.done} jobs for us. ` : ''}Rounds or a case — your choice."`);
        });
        add('I want to hand back the badge.', () => { pl.deputy = null; say('"Suit yourself."'); render(); });
      } else if (!pl.investigating) {
        const c = W().cases(world).find(x => x.sid === s.id && x.status === 'open' && x.by && x.by !== 'player' && world.npcs[x.by] && x.kind !== 'smuggling');
        if (c) add('Any crime the watch can\'t crack?', () => {
          say(`"Plenty." ${npc.first} sighs. "${Pt.caseBrief(world, c)} Bring us a name and there's 25 crowns in it."`);
          clear();
          add('I\'ll look into it.', () => { pl.investigating = c.id; UI().toast('Added to your journal.', 'info', 2); render(); });
          add('Not my business.', () => render());
        });
      }
    }
  };
})();
