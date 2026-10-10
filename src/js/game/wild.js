// Wild: the food chain, going on whether you watch or not.
//
// Wolves hunt. At dusk and in the night (and now and then by day, when
// they're hungry) a pack that scents a herd of deer creeps in low, then breaks
// into a run; the herd scatters, and the wolves run down the slowest. When
// they make a kill they feed — heads down, growling if you come near, and
// they'll fight you for it if you push in. A wolf with a full belly is
// lazy, and lets you pass. Then the crows come down on what's left, and a fox
// slinks in for the scraps. What remains you can butcher yourself.
//
// Foxes hunt hares: a low, slow creep through the grass and a pounce — half
// the time the hare's away, and half the time the fox trots off with it.
// They run from you, unless you creep.
//
// Your horse, left grazing, will not stand and wait for wolves. Unless the two
// of you are bonded, it bolts — and when it's calmed, it finds its own way
// back to where you left it. Whistle and it'll come, if it's not too afraid.
(function () {
  const { U } = ECHO;
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const T = ECHO.TILE;

  if (ECHO.SPECIES && !ECHO.SPECIES.fox) ECHO.SPECIES.fox = { name: 'Red fox', plural: 'red foxes', hp: 14, dmg: 0, speed: 5.4, radius: 0.28, sight: 9, xp: 1, meat: 0, hide: 0.6, color: '#c0642a', desc: 'A quick red hunter of hares and a thief of scraps. It wants nothing to do with you.' };

  const Wd = ECHO.Wild = {
    carcasses: [], t: 0, foxT: 15,
    // ------------------------------------------------------------ wolves on the hunt
    scan(game) {
      const world = game.world, pe = game.pe, now = game.time;
      if (ECHO.Interior.cur) return;
      const dl = ECHO.TIME.daylight(world.minute);
      const deer = game.ents.filter(o => o.species === 'deer' && !o.dead);
      const hares = game.ents.filter(o => o.species === 'hare' && !o.dead && !o.hidden);
      for (const w of game.ents) {
        if (w.species !== 'wolf' || w.dead || w.target || w.hunt || w.rout || w.pet || w.winter || w.beast || w.dq) continue;
        if (w.fedAt && now - w.fedAt < 200) continue;
        if ((w.huntRoll || 0) > now) continue;
        w.huntRoll = now + 12 + Math.random() * 10;
        const keen = dl < 0.35 ? 0.85 : 0.3;
        if (Math.random() > keen) continue;
        // the herd, if there's one about; a hare otherwise
        let prey = null, pd = 32;
        for (const d of deer) { const dd = U.dist(w.x, w.y, d.x, d.y); if (dd < pd) { pd = dd; prey = d; } }
        if (!prey) { pd = 13; for (const h of hares) { const dd = U.dist(w.x, w.y, h.x, h.y); if (dd < pd) { pd = dd; prey = h; } } }
        if (!prey) continue;
        const pack = game.ents.filter(o => o.species === 'wolf' && !o.dead && !o.target && !o.hunt && (o === w || (o.pack && o.pack === w.pack && U.dist(o.x, o.y, w.x, w.y) < 14)));
        const H = { herd: prey.herd || null, prey: prey.herd ? null : prey, phase: prey.herd ? 'stalk' : 'rush', t0: now, pack: pack.length };
        pack.forEach((o, i) => { o.hunt = { ...H, i }; });
        if (U.dist(w.x, w.y, pe.x, pe.y) < 30 && !pe.dead) { w.say = '*low growl*'; w.sayT = 1.2; }
      }
    },
    choosePrey(game, w, H) {
      let best = null, bs = 1e9;
      for (const d of game.ents) {
        if (d.dead || d.herd !== H.herd) continue;
        // the young, the hurt, the slow — and the nearest
        const sc = U.dist(w.x, w.y, d.x, d.y) + (d.stag ? 8 : 0) - (1 - d.hp / d.maxHp) * 10;
        if (sc < bs) { bs = sc; best = d; }
      }
      return best;
    },
    // returns true while the hunt drives the wolf
    hunt(game, w, dt, speed) {
      const H = w.hunt, world = game.world, now = game.time;
      if (!H) return false;
      if (H.phase === 'feed') return Wd.feed(game, w, dt, speed);
      if (now - H.t0 > 50) { w.hunt = null; return false; }
      // a pack sticks to one quarry
      if (H.herd && (!H.prey || H.prey.dead)) {
        const mate = game.ents.find(o => o !== w && o.hunt && o.hunt.herd === H.herd && o.hunt.prey && !o.hunt.prey.dead);
        H.prey = mate ? mate.hunt.prey : Wd.choosePrey(game, w, H);
      }
      const p = H.prey;
      if (!p || p.dead) {
        const c = p && Wd.carcasses.find(c => c.ent === p && !c.done);
        if (c) { w.hunt = { phase: 'feed', c, t0: now, i: H.i, until: now + 32 + Math.random() * 18 }; return true; }
        w.hunt = null; return false;
      }
      const d = U.dist(w.x, w.y, p.x, p.y);
      if (d > 30) { w.hunt = null; w.state = 'roam'; return false; }
      // fan out as they close: each from its own side
      const side = ((H.i || 0) % 3 - 1) * 0.9;
      const a = Math.atan2(p.y - w.y, p.x - w.x) + (d > 3 ? side * Math.min(1, d / 10) : 0);
      if (H.phase === 'stalk') {
        w.state = 'stalk';
        ECHO.Ent.seek(world, w, w.x + Math.cos(a) * 2, w.y + Math.sin(a) * 2, speed * 0.42, dt, 0.1);
        const spooked = p.state === 'flee';
        if (d < 9 || spooked) for (const o of game.ents) if (o.hunt && o.hunt.herd === H.herd && o.hunt.phase === 'stalk') o.hunt.phase = 'rush';
        return true;
      }
      // the run: a burst that closes the gap, then they tire
      w.state = 'roam';
      if (H.rushAt == null) H.rushAt = now;
      const burst = now - H.rushAt < 8 ? 1.6 : 1.1;
      if (p.species === 'deer' && p.state !== 'flee' && d < 12 && ECHO.Fauna) ECHO.Fauna.panic(game, p.herd, w);
      ECHO.Ent.seek(world, w, p.x + Math.cos(a) * 0.3, p.y + Math.sin(a) * 0.3, speed * burst, dt, 0.05);
      if (d < (p.species === 'hare' ? 0.9 : 1.35) && (w.cd || 0) <= 0) {
        w.cd = 0.85; w.attackT = 0.15; w.dir = a;
        Wd.bite(game, w, p);
      }
      return true;
    },
    bite(game, w, p) {
      const pe = game.pe;
      p.hp -= p.species === 'hare' ? 99 : 8 + Math.random() * 4;
      p.hurtT = 0.18;
      p.speed = Math.max(3.4, p.speed * 0.86);
      ECHO.Combat.burst(p.x, p.y - 0.2, '#a02a1a', 6, 2, 0.4, 2);
      if (pe && U.dist(p.x, p.y, pe.x, pe.y) < 18 && ECHO.Sfx) ECHO.Sfx.play('growl', { pitch: 1.3, vol: 0.3 });
      if (p.hp <= 0) Wd.kill(game, p, w);
    },
    kill(game, p, by) {
      p.dead = true; p.deathT = 0; p.deathAngle = Math.atan2(p.y - by.y, p.x - by.x);
      if (p.species === 'hare') { p.vanish = true; by.hunt = null; by.fedAt = game.time - 120; by.carryT = 6; return; }
      p.carcass = true;
      const c = { x: p.x, y: p.y, ent: p, kind: p.species, meat: p.stag ? 3 : 2, eaten: 0, t0: game.time, until: game.time + 170, wolvesGone: null, crows: false, fox: false, done: false };
      Wd.carcasses.push(c);
      // the rest of the herd runs on; the pack comes to feed
      for (const o of game.ents) if (o.hunt && (o.hunt.prey === p || (o.hunt.herd && o.hunt.herd === p.herd))) o.hunt = { phase: 'feed', c, t0: game.time, i: o.hunt.i || 0, until: game.time + 32 + Math.random() * 18 };
    },
    feed(game, w, dt, speed) {
      const H = w.hunt, c = H.c, pe = game.pe, world = game.world, now = game.time;
      if (!c || c.done) { w.hunt = null; return false; }
      const a = (H.i || 0) * 2.1 + 0.4, spot = { x: c.x + Math.cos(a) * 0.85, y: c.y + Math.sin(a) * 0.85 };
      const dp = U.dist(c.x, c.y, pe.x, pe.y);
      // you, coming too close to their meal
      const sneak = ECHO.PlayerCtl.sneaking && !pe.mounted;
      if (!pe.dead && dp < (sneak ? 3 : 4.5)) {
        const pack = game.ents.filter(o => o.hunt && o.hunt.c === c && !o.dead).length;
        if (pack >= 2 || w.hp > w.maxHp * 0.6) { w.hunt = null; w.target = pe; w.aggro = true; w.state = 'stalk'; w.say = '*SNARL*'; w.sayT = 1.2; return false; }
        w.hunt = null; w.state = 'flee'; w.target = pe; return false;
      }
      if (!pe.dead && dp < 9 && w.sayT <= 0 && Math.random() < dt * 0.5) { w.say = pick(['*growl*', '*grr…*', '*snarl*']); w.sayT = 1; w.dir = Math.atan2(pe.y - w.y, pe.x - w.x); if (ECHO.Sfx && Math.random() < 0.5) ECHO.Sfx.play('growl', { vol: 0.35 }); }
      if (U.dist(w.x, w.y, spot.x, spot.y) > 0.3) { ECHO.Ent.seek(world, w, spot.x, spot.y, speed * 0.6, dt, 0.1); w.state = 'roam'; return true; }
      w.moving = false; w.state = 'feed';
      if (!(dp < 9 && w.sayT > 0)) w.dir = Math.atan2(c.y - w.y, c.x - w.x);
      c.eaten = Math.min(0.95, c.eaten + dt * 0.006);
      if (Math.random() < dt * 0.6) ECHO.Combat.burst(c.x, c.y, '#7a1a10', 2, 0.6, 0.3, 2);
      if (now > H.until) {
        w.hunt = null; w.fedAt = now; w.state = 'roam';
        // amble off to sleep it off somewhere
        const aa = Math.random() * 6.28; w.home = { x: c.x + Math.cos(aa) * 22, y: c.y + Math.sin(aa) * 22 }; w.wa = aa;
        if (!game.ents.some(o => o.hunt && o.hunt.c === c)) c.wolvesGone = now;
      }
      return true;
    },
    // a fed wolf lets you be
    lazy(game, w) { return w.fedAt && game.time - w.fedAt < 180 && !w.aggro; },
    // ------------------------------------------------------------ foxes
    foxSpawn(game) {
      const world = game.world, pe = game.pe;
      if (ECHO.Interior.cur || pe.x >= 9000) return;
      if (game.ents.some(e => e.species === 'fox' && !e.dead)) return;
      if (ECHO.World.settlementAt(world, pe.x, pe.y, 14)) return;
      const dl = ECHO.TIME.daylight(world.minute);
      if (Math.random() > (dl < 0.5 ? 0.5 : 0.25)) return;
      const hare = game.ents.find(o => o.species === 'hare' && !o.dead && U.dist(o.x, o.y, pe.x, pe.y) < 30);
      for (let k = 0; k < 10; k++) {
        const a = Math.random() * 6.28, r = hare ? 8 + Math.random() * 5 : 18 + Math.random() * 8;
        const cx = hare ? hare.x : pe.x, cy = hare ? hare.y : pe.y;
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        const t = ECHO.World.tile(world, Math.floor(x), Math.floor(y));
        if (ECHO.World.isSolid(world, x, y) || (t !== T.GRASS && t !== T.FOREST && t !== T.FARM && t !== T.HILL)) continue;
        if (U.dist(x, y, pe.x, pe.y) < 14 || game.onScreen(x, y, 1)) continue;
        game.addEnt(Wd.makeFox(game, x, y));
        return;
      }
    },
    makeFox(game, x, y) {
      const e = ECHO.Ent.make({ type: 'creature', species: 'fox', x, y, r: 0.28, hp: 14, maxHp: 14, speed: 5.4, faction: 'wild', home: { x, y }, label: null });
      e.coat = Math.random() < 0.15 ? '#8a8a86' : '#c0642a';
      e.fname = e.coat === '#8a8a86' ? 'Grey fox' : 'Red fox';
      return e;
    },
    fox(game, e, dt) {
      const world = game.world, pe = game.pe, now = game.time;
      e.t += dt;
      const d = U.dist(e.x, e.y, pe.x, pe.y);
      const sneak = ECHO.PlayerCtl.sneaking && !pe.mounted;
      const wary = pe.mounted ? 10 : sneak ? 3 : 6.5;
      const leave = () => { if (d > 30 && !game.onScreen(e.x, e.y, 2)) { e.dead = true; e.vanish = true; } };
      // you: away it goes
      if ((d < wary && !pe.dead && !pe.hidden) || e.hp < e.maxHp || e.state === 'flee') {
        if (e.state !== 'flee') { e.state = 'flee'; e.fleeT = 0; if (d < 14 && Math.random() < 0.5) { e.say = '*yip!*'; e.sayT = 0.8; } }
        e.fleeT += dt;
        const a = Math.atan2(e.y - pe.y, e.x - pe.x) + Math.sin(e.t * 2.4) * 0.4;
        ECHO.Ent.seek(world, e, e.x + Math.cos(a) * 2, e.y + Math.sin(a) * 2, e.speed, dt, 0.1);
        if (e.fleeT > 4 && d > wary + 6) e.state = e.carrying ? 'carry' : 'roam';
        leave(); return;
      }
      if (e.carrying || e.state === 'carry') {
        // trotting home with supper
        const a = e.wa != null ? e.wa : (e.wa = Math.atan2(e.y - pe.y, e.x - pe.x));
        ECHO.Ent.seek(world, e, e.x + Math.cos(a) * 2, e.y + Math.sin(a) * 2, e.speed * 0.55, dt, 0.1);
        leave(); return;
      }
      // the scraps of a kill
      const c = e.scav;
      if (c) {
        if (c.done || c.eaten >= 0.95 || game.ents.some(w => w.species === 'wolf' && !w.dead && U.dist(w.x, w.y, c.x, c.y) < 5)) { e.scav = null; e.state = 'carry'; e.wa = Math.random() * 6.28; return; }
        if (U.dist(e.x, e.y, c.x, c.y) > 0.7) { ECHO.Ent.seek(world, e, c.x + 0.5, c.y, e.speed * 0.45, dt, 0.1); e.state = 'stalk'; return; }
        e.moving = false; e.state = 'feed'; e.dir = Math.atan2(c.y - e.y, c.x - e.x);
        c.eaten = Math.min(0.95, c.eaten + dt * 0.01);
        e.feedT = (e.feedT || 0) + dt;
        if (e.feedT > 20) { e.scav = null; e.state = 'carry'; e.wa = Math.random() * 6.28; }
        return;
      }
      // hunting hares
      if (e.pounce > 0) {
        e.pounce -= dt;
        const sp = 10 * dt;
        ECHO.Ent.move(world, e, Math.cos(e.pAng) * sp, Math.sin(e.pAng) * sp);
        const h = e.quarry;
        if (h && !h.dead && U.dist(e.x, e.y, h.x, h.y) < 0.6) {
          e.pounce = 0;
          if (Math.random() < 0.5) { h.dead = true; h.vanish = true; e.carrying = true; e.state = 'carry'; e.wa = Math.random() * 6.28; if (d < 16) { e.say = '*yip*'; e.sayT = 0.8; } }
          else { h.state = 'flee'; h.fleeFrom = { x: e.x, y: e.y }; h.calmT = 3; e.restT = 3; }
        }
        if (e.pounce <= 0 && !e.carrying) { e.restT = Math.max(e.restT || 0, 2); e.quarry = null; }
        return;
      }
      if (e.restT > 0) { e.restT -= dt; e.moving = false; e.state = 'roam'; return; }
      const h = e.quarry && !e.quarry.dead ? e.quarry : game.ents.find(o => o.species === 'hare' && !o.dead && !o.hidden && U.dist(o.x, o.y, e.x, e.y) < 11);
      if (h) {
        e.quarry = h;
        const dh = U.dist(e.x, e.y, h.x, h.y);
        // trot to within a stone's throw, then the slow creep
        if (dh > 2.6) { e.state = dh > 6 ? 'roam' : 'stalk'; ECHO.Ent.seek(world, e, h.x, h.y, e.speed * (dh > 6 ? 0.55 : 0.32), dt, 0.1); return; }
        e.pounce = 0.3; e.pAng = Math.atan2(h.y - e.y, h.x - e.x); e.dir = e.pAng; e.state = 'lunge';
        return;
      }
      e.state = 'roam';
      ECHO.AI.Creature.wander(game, e, dt, e.speed);
      if (e.t > 120) leave();
    },
    // ------------------------------------------------------------ carcasses and scavengers
    carcassTick(game, dt) {
      const pe = game.pe, now = game.time, F = ECHO.Fauna;
      for (const c of Wd.carcasses) {
        if (c.done) continue;
        const e = c.ent;
        e.deathT = Math.min(e.deathT || 0, 1.2);    // lies where it fell
        e.vanish = false;
        const wolves = game.ents.some(w => w.species === 'wolf' && !w.dead && U.dist(w.x, w.y, c.x, c.y) < 6);
        // crows, once the wolves are off it
        if (!wolves && !c.crows && now - c.t0 > 8 && F && U.dist(c.x, c.y, pe.x, pe.y) < 40) {
          c.crows = true;
          const birds = [];
          for (let i = 0; i < 4 + Math.floor(Math.random() * 4); i++) birds.push({ x: c.x + (Math.random() - 0.5) * 2, y: c.y + (Math.random() - 0.5) * 1.6, z: 0, vx: 0, vy: 0, vz: 0, dir: Math.random() * 6.28, hop: Math.random() * 3, peck: Math.random() * 2, flap: Math.random() * 6 });
          F.flocks.push({ x: c.x, y: c.y, kind: 'crow', birds, up: false, t: 0, carcass: true });
        }
        // a fox for the scraps, once the pack has gone
        if (c.wolvesGone && !c.fox && now - c.wolvesGone > 12 && c.eaten < 0.9 && Math.random() < dt * 0.05 && U.dist(c.x, c.y, pe.x, pe.y) < 40) {
          c.fox = true;
          const a = Math.random() * 6.28, f = Wd.makeFox(game, c.x + Math.cos(a) * 16, c.y + Math.sin(a) * 16);
          if (!ECHO.World.isSolid(game.world, f.x, f.y)) { f.scav = c; game.addEnt(f); }
        }
        if (now > c.until || c.eaten >= 0.95 && !wolves) { c.done = true; e.vanish = true; }
      }
      Wd.carcasses = Wd.carcasses.filter(c => !c.done || now - c.t0 < 5);
    },
    interactables(game) {
      const pe = game.pe, out = [];
      if (pe.mounted || ECHO.Interior.cur) return out;
      for (const c of Wd.carcasses) {
        if (c.done || U.dist(c.x, c.y, pe.x, pe.y) > 1.6 || c.eaten > 0.75) continue;
        out.push({ kind: 'act', label: `Butcher what's left of the ${c.kind === 'deer' ? 'deer' : c.kind}`, d: 0.6, act: () => {
          const pl = game.pl;
          const meat = Math.max(0, Math.round(c.meat * (1 - c.eaten)));
          const hide = c.eaten < 0.4 ? 1 : 0;
          if (meat) pl.inv.meat = (pl.inv.meat || 0) + meat;
          if (hide) pl.inv.hide = (pl.inv.hide || 0) + hide;
          c.eaten = 1; c.done = true; c.ent.vanish = true;
          ECHO.Combat.burst(c.x, c.y, '#7a1a10', 8, 1.5, 0.4, 2);
          game.ui.toast(meat || hide ? `You take what the wolves left: ${[meat ? `${meat} meat` : '', hide ? 'a hide' : ''].filter(Boolean).join(' and ')}.` : 'There\'s nothing worth taking.', 'info', 3);
          if (ECHO.Pastimes && ECHO.Pastimes.gain) ECHO.Pastimes.gain(game, 'forage', 4);
        } });
      }
      return out;
    },
    // ------------------------------------------------------------ the horse, left alone
    // Returns { want, tx, ty } while it's bolting or finding its way back; null otherwise.
    horse(game, h, dt) {
      const pl = game.pl, pe = game.pe, world = game.world;
      const H = ECHO.Life && ECHO.Life.hs(pl);
      if (!H) return null;
      const bonded = (H.bond || 0) >= 75;
      const threat = game.ents.find(e => !e.dead && !e.hidden && (e.species === 'wolf' || e.foe || e.type === 'boss' || (e.type === 'creature' && e.aggro && e.species !== 'hare' && e.species !== 'fox' && !e.pet)) && U.dist(e.x, e.y, h.x, h.y) < (e.species === 'wolf' ? 9 : 6));
      if (!h.bolt && threat && !bonded && !(h.call && U.dist(h.x, h.y, pe.x, pe.y) < 4)) {
        h.bolt = { phase: 'run', t: 0, from: { x: threat.x, y: threat.y }, left: h.left || { x: h.x, y: h.y } };
        h.call = false; h.rearT = 0.5;
        if (ECHO.Sfx && U.dist(h.x, h.y, pe.x, pe.y) < 30) ECHO.Sfx.play('neigh', { vol: 0.7 });
        if (U.dist(h.x, h.y, pe.x, pe.y) < 40) { ECHO.Combat.floater(h.x, h.y - 1.6, `${pl.horse.name} bolts!`, '#e8d9a0'); game.ui.toast(`${pl.horse.name} has bolted from the ${threat.species === 'wolf' ? 'wolves' : 'danger'}. It'll find its way back when it's calmed — or whistle.`, 'warn', 5); }
      }
      if (!h.bolt) { if (!h.call) h.left = { x: h.x, y: h.y }; return null; }
      const B = h.bolt;
      B.t += dt;
      if (B.phase === 'run') {
        if (threat) B.from = { x: threat.x, y: threat.y };
        const a = Math.atan2(h.y - B.from.y, h.x - B.from.x);
        if (B.t > 6 + Math.random() * 0.1 && !threat) { B.phase = 'calm'; B.t = 0; }
        return { want: 8.5, tx: h.x + Math.cos(a) * 4, ty: h.y + Math.sin(a) * 4 };
      }
      if (h.call && !threat) { h.bolt = null; return null; }     // you whistled: it comes
      if (B.phase === 'calm') {
        if (threat) { B.phase = 'run'; B.t = 0; return null; }
        if (B.t > 8) { B.phase = 'back'; B.t = 0; }
        return { want: 0, tx: null, ty: null };
      }
      // finding its way back
      if (threat && U.dist(threat.x, threat.y, h.x, h.y) < 7) { B.phase = 'run'; B.t = 0; return null; }
      const dl = U.dist(h.x, h.y, B.left.x, B.left.y);
      if (dl < 1.5 || B.t > 90) {
        if (B.t > 90) { h.x = B.left.x; h.y = B.left.y; }
        h.bolt = null;
        if (U.dist(h.x, h.y, pe.x, pe.y) < 45) game.ui.toast(`${pl.horse.name} has come back.`, 'info', 3);
        return null;
      }
      return { want: dl > 6 ? 3.2 : 1.6, tx: B.left.x, ty: B.left.y };
    },
    // ------------------------------------------------------------ each frame
    update(game, dt) {
      if (!game.pe || !game.world) return;
      Wd.carcassTick(game, dt);
      Wd.t -= dt;
      if (Wd.t > 0) return;
      Wd.t = 1;
      Wd.scan(game);
      Wd.foxT -= 1;
      if (Wd.foxT <= 0) { Wd.foxT = 20 + Math.random() * 20; Wd.foxSpawn(game); }
    }
  };
  if (ECHO.Pastimes) {
    ECHO.Pastimes.extraAct = ECHO.Pastimes.extraAct || [];
    ECHO.Pastimes.extraAct.push(game => Wd.interactables(game));
  }
})();
