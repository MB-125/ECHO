// Luring a calamity: strike a dragon or a great beast and it comes after you — a long
// way after you. Lead it into a bandit camp, an outlaw town, or another titan's range,
// and it forgets you for what it finds there: it falls on the camp, or the two of them
// fight it out while you watch from a safe distance.
(function () {
  const { U } = ECHO;
  const UI = () => ECHO.UI, Ti = () => ECHO.Titans, A = () => ECHO.Apex;
  const Lu = ECHO.Lure = {
    // it is after you now
    start(game, e, t) {
      if (e.lured) return;
      e.lured = true;
      if (!game.pl._lureTip) {
        game.pl._lureTip = true;
        setTimeout(() => UI().toast(`${t.name} is after you, and it will follow a long way. Lead it into a bandit camp, an outlaw town, or another beast's range, and it will turn on them instead.`, 'legend', 9), 900);
      }
    },
    // what it might turn on, near where it is now
    check(game, e, t) {
      const world = game.world;
      if (e.lureTo || !e.aggro || !e.lured) return;
      // another titan's ground (or the titan itself, close by)
      for (const o of Ti().wild(world)) {
        if (o === t || !o.alive) continue;
        if (U.dist(e.x, e.y, o.x, o.y) < Math.max(14, (o.r || 13) * 0.9)) return Lu.turn(game, e, t, { kind: 'titan', t2: o, x: o.x, y: o.y, name: o.name });
      }
      // a bandit camp, or a town of the Ashfang
      for (const c of world.camps) {
        if (c.alive === false || !c.members || !c.members.length) continue;
        if (U.dist(e.x, e.y, c.x, c.y) < 13) return Lu.turn(game, e, t, { kind: 'camp', c, x: c.x, y: c.y, name: c.name });
      }
      for (const s of world.settlements) {
        if (s.faction !== 'ashfang') continue;
        if (U.dist(e.x, e.y, s.x, s.y) < 16) return Lu.turn(game, e, t, { kind: 'outlaws', s, x: s.x, y: s.y, name: s.name });
      }
    },
    turn(game, e, t, to) {
      e.lureTo = to; e.aggro = false; e.state = 'roar'; e.t = 0;
      if (UI().bossEnt === e) UI().bossBar(null);
      game.shake(0.5);
      if (ECHO.Sfx) ECHO.Sfx.play('roar', { pitch: 0.8 / Math.sqrt(e.tscale || 1) });
      ECHO.Combat.floater(e.x, e.y - 2.6 - (e.alt || 0), to.kind === 'titan' ? `${t.name} smells ${to.t2.name}` : `${t.name} turns on ${to.name}`, '#ffcf8a', true);
      UI().toast(to.kind === 'titan' ? `${t.name} has caught the scent of ${to.t2.name} and forgets you. Get clear — and watch.` : `${t.name} forgets you: it has seen ${to.name}. Get clear.`, 'legend', 6);
    },
    // going to it, and what happens there
    drive(game, e, t, dt) {
      const world = game.world, to = e.lureTo;
      if (to.kind === 'titan') {
        const o = A().entOf(game, to.t2.id);
        if (!to.t2.alive) { e.lureTo = null; e.state = 'return'; return; }
        if (o) return Lu.duel(game, e, t, o, to.t2, dt);
        // the other is out of sight: they meet out there all the same
        if (A().go(game, e, to.t2.x, to.t2.y, e.flies ? 6 : 3, dt) < 6) Lu.settle(game, t, to.t2, null, null);
        return;
      }
      e.altGoal = e.flies ? 4 : 0;
      const d = A().go(game, e, to.x, to.y, e.flies ? 6.5 : 3.2, dt);
      e._driveT = (e._driveT || 0) + dt;
      if (d > 5.5 && e._driveT < 9) return;   // (among the tents it need not reach the very fire)
      e._driveT = 0;
      Lu.ravage(game, e, t, to);
      e.lureTo = null; e.lured = false; e.state = 'return';
    },
    ravage(game, e, t, to) {
      const world = game.world, pl = game.pl, P = ECHO.People;
      game.shake(0.9);
      for (let i = 0; i < 4; i++) ECHO.Combat.burst(to.x + (Math.random() - 0.5) * 6, to.y + (Math.random() - 0.5) * 6, i % 2 ? '#ff8a3a' : '#5a4a3a', 26, 5, 1, 3);
      // the outlaws there, in the flesh, and the rest of them where the world keeps them
      let dead = 0;
      for (const o of game.ents) if (!o.dead && o !== e && (o.type === 'person' || o.humanoid) && U.dist(o.x, o.y, to.x, to.y) < 9 && o.npcId && world.npcs[o.npcId] && (world.npcs[o.npcId].camp || world.npcs[o.npcId].faction === 'ashfang')) { ECHO.Combat.kill(o, e, 'melee', {}); dead++; }
      if (to.kind === 'camp' && P) {
        for (const id of to.c.members.slice()) { const n = world.npcs[id]; if (n && n.status === 'alive' && Math.random() < 0.75) { P.kill(world, n, `killed when ${t.name} fell on ${to.c.name}`); dead++; } }
        if (to.c.loot) to.c.loot.food = 0;
      } else if (to.kind === 'outlaws' && P) {
        for (const n of P.residents(world, to.s).filter(n => n.status === 'alive' && n.prof !== 'ruler').sort(() => Math.random() - 0.5).slice(0, 3)) { P.kill(world, n, `killed when ${t.name} came down on ${to.s.name}`); dead++; }
        to.s.prosperity = Math.max(0, (to.s.prosperity || 40) - 15);
        if (to.s.stock) to.s.stock.food = (to.s.stock.food || 0) * 0.4;
      }
      pl.renown = (pl.renown || 0) + 6;
      if (ECHO.Lore) ECHO.Lore.add(game, 'titan', 10);
      ECHO.Chronicle.add(world, { text: `${pl.first} ${pl.last} led ${t.name} ${t.title} into ${to.name}. ${dead ? `${dead} of the outlaws there died.` : 'The outlaws scattered.'}`, kind: 'player', importance: 3, x: to.x, y: to.y, char: pl.charId });
      UI().toast(`${t.name} fell on ${to.name}${dead ? `: ${dead} of them are dead` : ''}. It goes back to its own business.`, 'legend', 7);
    },
    // two titans, face to face
    duel(game, e, t, o, t2, dt) {
      const pe = game.pe;
      e.altGoal = 0; o.duelWith = e; o.aggro = false; o.lureTo = null;
      if (UI().bossEnt === o) UI().bossBar(null);
      const d = U.dist(e.x, e.y, o.x, o.y), reach = (e.r || 1) + (o.r || 1) + 0.8;
      if (d > reach) { A().go(game, e, o.x, o.y, e.flies ? 6 : 3.4, dt); A().go(game, o, e.x, e.y, o.flies ? 5 : 2.6, dt); return; }
      e.moving = o.moving = false;
      e.dir = Math.atan2(o.y - e.y, o.x - e.x); o.dir = e.dir + Math.PI;
      if ((e._duelT = (e._duelT || 0) - dt) > 0) return;
      e._duelT = 0.9;
      // each strikes by its strength (the stronger hits harder, the weaker bleeds faster)
      const ra = t.lvl / Math.max(1, t2.lvl);
      o.hp -= o.maxHp * 0.07 * U.clamp(ra, 0.25, 3);
      e.hp -= e.maxHp * 0.07 * U.clamp(1 / ra, 0.25, 3);
      const mx = (e.x + o.x) / 2, my = (e.y + o.y) / 2;
      ECHO.Combat.burst(mx, my, '#ffcf8a', 22, 5, 0.7, 3); ECHO.Combat.ring(mx, my, 2.5, 'rgba(255,200,150,0.7)', 0.5);
      if (U.dist(mx, my, pe.x, pe.y) < 40) game.shake(0.35);
      if (ECHO.Sfx) ECHO.Sfx.play(Math.random() < 0.5 ? 'roar' : 'stomp', { pitch: 0.7 });
      t.hp = Math.max(0.05, e.hp / e.maxHp); t2.hp = Math.max(0.05, o.hp / o.maxHp);
      const done = o.hp < o.maxHp * 0.25 ? 'o' : e.hp < e.maxHp * 0.25 ? 'e' : null;
      if (done) Lu.settle(game, done === 'o' ? t : t2, done === 'o' ? t2 : t, done === 'o' ? e : o, done === 'o' ? o : e);
    },
    // the end of it: the loser flees — or, far outmatched, dies
    settle(game, win, lose, we, le) {
      const world = game.world, pl = game.pl, rng = new ECHO.RNG((Math.random() * 1e9) >>> 0);
      const slain = win.lvl > lose.lvl * 2.5 || Math.random() < 0.15;
      if (we) { we.lureTo = null; we.lured = false; we.duelWith = null; we.state = 'return'; we.aggro = false; }
      if (le) { le.lureTo = null; le.lured = false; le.duelWith = null; }
      if (slain) {
        if (le) { le.dead = true; le.deathT = 0; ECHO.Combat.burst(le.x, le.y, '#5a1f1f', 50, 6, 1.3, 3); game.shake(0.8); }
        Ti().slain(world, lose, `${win.name} ${win.title}`);
      } else {
        lose.hp = 0.25;
        if (le) { le.hp = le.maxHp * 0.25; le.state = 'return'; }
        if (ECHO.Calamity && !lose.mig) ECHO.Calamity.start(world, rng, lose, 'driven');
      }
      pl.renown = (pl.renown || 0) + 8;
      if (ECHO.Lore) ECHO.Lore.add(game, 'titan', 15);
      ECHO.Chronicle.add(world, { text: `${pl.first} ${pl.last} led one calamity onto another: ${win.name} and ${lose.name} fought, and ${slain ? `${lose.name} died` : `${lose.name} fled, bleeding`}.`, kind: 'player', importance: 3, x: lose.x, y: lose.y, char: pl.charId });
      UI().banner(slain ? `${lose.name} is dead` : `${lose.name} is driven off`, `${win.name} won the fight you started`, false);
    }
  };
})();
