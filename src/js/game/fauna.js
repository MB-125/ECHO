// Ambient life: the land is not empty between the fights.
//
// Flocks of small birds and crows peck at fields and meadows and burst into
// the air when you come close (less so if you creep); herds of red deer graze
// at the edges of the woods, lift their heads when they catch your scent and
// bolt together if you push your luck — and can be hunted for meat and hide.
// Chimneys smoke on cold mornings and evenings. People who know you call out
// a greeting by name as you pass.
(function () {
  const { U } = ECHO;
  const T = ECHO.TILE;

  const F = ECHO.Fauna = {
    flocks: [], t: 0, greeted: {},
    reset() { F.flocks = []; F.greeted = {}; },
    // ------------------------------------------------------------ birds
    birdsOK(world, x, y) {
      const t = ECHO.World.tile(world, Math.floor(x), Math.floor(y));
      return (t === T.GRASS || t === T.FARM || t === T.SAND || t === T.HILL) && !ECHO.World.isSolid(world, x, y);
    },
    spawnFlock(game) {
      const world = game.world, pe = game.pe;
      for (let k = 0; k < 8; k++) {
        const a = Math.random() * Math.PI * 2, r = 12 + Math.random() * 14;
        const x = pe.x + Math.cos(a) * r, y = pe.y + Math.sin(a) * r;
        if (!F.birdsOK(world, x, y)) continue;
        const tile = ECHO.World.tile(world, Math.floor(x), Math.floor(y));
        const season = ECHO.TIME.dateOf(world.day).seasonIdx;
        const kind = tile === T.FARM || season === 3 ? 'crow' : tile === T.SAND ? 'gull' : 'sparrow';
        const n = kind === 'crow' ? 3 + Math.floor(Math.random() * 4) : 5 + Math.floor(Math.random() * 6);
        const birds = [];
        for (let i = 0; i < n; i++) birds.push({ x: x + (Math.random() - 0.5) * 2.2, y: y + (Math.random() - 0.5) * 1.6, z: 0, vx: 0, vy: 0, vz: 0, dir: Math.random() * 6.28, hop: Math.random() * 3, peck: Math.random() * 2, flap: Math.random() * 6 });
        F.flocks.push({ x, y, kind, birds, up: false, t: 0 });
        return;
      }
    },
    // what scares a flock: anything walking up to it
    threat(game, f) {
      const pe = game.pe;
      const sneak = ECHO.PlayerCtl.sneaking && !pe.mounted;
      const rp = pe.mounted ? 7 : sneak ? 2.2 : (pe.moving ? 4.8 : 3);
      if (U.dist(f.x, f.y, pe.x, pe.y) < rp) return pe;
      for (const e of game.ents) {
        if (e === pe || e.dead || e.hidden || !e.moving) continue;
        if (Math.abs(e.x - f.x) > 4 || Math.abs(e.y - f.y) > 4) continue;
        if (U.dist(f.x, f.y, e.x, e.y) < (e.mounted ? 5 : 3)) return e;
      }
      if (ECHO.Combat && ECHO.Combat.proj.some(p => U.dist(p.x, p.y, f.x, f.y) < 3)) return { x: f.x - 1, y: f.y };
      return null;
    },
    takeOff(game, f, from) {
      f.up = true; f.t = 0;
      const a0 = Math.atan2(f.y - from.y, f.x - from.x);
      for (const b of f.birds) {
        const a = a0 + (Math.random() - 0.5) * 1.6, s = 4 + Math.random() * 3;
        b.vx = Math.cos(a) * s; b.vy = Math.sin(a) * s; b.vz = 3 + Math.random() * 2.5; b.dir = a; b.delay = Math.random() * 0.25;
      }
      const d = U.dist(f.x, f.y, game.pe.x, game.pe.y);
      if (ECHO.Sfx && d < 16) ECHO.Sfx.play('flutter', { vol: U.clamp(1 - d / 16, 0.15, 1) * (f.birds.length > 6 ? 1 : 0.7) });
    },
    birdsTick(game, dt) {
      const world = game.world, pe = game.pe;
      const night = game.isNight();
      const wx = ECHO.Weather && ECHO.Weather.here(world, pe.x, pe.y);
      const foul = wx && (wx.today === 'storm' || wx.today === 'blizzard');
      const want = ECHO.Interior.cur || night || foul ? 0 : ECHO.World.settlementAt(world, pe.x, pe.y, 10) ? 1 : 3;
      if (F.flocks.filter(f => !f.up).length < want && Math.random() < dt * 0.6) F.spawnFlock(game);
      for (const f of F.flocks) {
        f.t += dt;
        if (!f.up) {
          const th = F.threat(game, f);
          if (th) { F.takeOff(game, f, th); continue; }
          for (const b of f.birds) {
            b.peck -= dt; b.hop -= dt;
            if (b.hop <= 0) { b.hop = 0.6 + Math.random() * 2.5; const a = b.dir + (Math.random() - 0.5) * 2; b.dir = a; b.hx = Math.cos(a) * 0.25; b.hy = Math.sin(a) * 0.25; b.ht = 0.18; }
            if (b.ht > 0) { b.ht -= dt; b.x += b.hx * dt / 0.18; b.y += b.hy * dt / 0.18; b.z = Math.sin(Math.max(0, b.ht) / 0.18 * Math.PI) * 0.08; } else b.z = 0;
            // drift back toward the flock
            b.x += (f.x - b.x) * dt * 0.05; b.y += (f.y - b.y) * dt * 0.05;
          }
        } else {
          for (const b of f.birds) {
            if (b.delay > 0) { b.delay -= dt; continue; }
            b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.vz = Math.max(0.4, b.vz - dt * 1.2);
            b.flap += dt * 22;
          }
        }
      }
      F.flocks = F.flocks.filter(f => !(f.up && f.t > 6) && U.dist(f.x, f.y, pe.x, pe.y) < 45 && !(want === 0 && !f.up && Math.random() < dt * 0.2));
    },
    // ------------------------------------------------------------ deer
    deerTick(game, dt) {
      const world = game.world, pe = game.pe;
      if (ECHO.Interior.cur) return;
      F.deerT = (F.deerT || 0) - dt;
      if (F.deerT > 0) return;
      F.deerT = 4;
      const herd = game.ents.filter(e => e.species === 'deer' && !e.dead);
      if (herd.length) return;
      const dl = ECHO.TIME.daylight(world.minute);
      if (dl < 0.1 && Math.random() < 0.7) return;      // mostly at dusk, dawn and by day
      const big = ECHO.Events && ECHO.Events.greatHerd(world);
      if (Math.random() > (big ? 0.9 : 0.35)) return;
      for (let k = 0; k < 10; k++) {
        const a = Math.random() * Math.PI * 2, r = 20 + Math.random() * 7;
        const x = pe.x + Math.cos(a) * r, y = pe.y + Math.sin(a) * r;
        const t = ECHO.World.tile(world, Math.floor(x), Math.floor(y));
        if (t !== T.GRASS && t !== T.FOREST) continue;
        if (ECHO.World.isSolid(world, x, y) || ECHO.World.settlementAt(world, x, y, 18)) continue;
        if (!F.nearTrees(world, x, y)) continue;
        const n = big ? 10 + Math.floor(Math.random() * 7) : 3 + Math.floor(Math.random() * 3);
        const id = 'herd' + Math.floor(Math.random() * 1e6);
        for (let i = 0; i < n; i++) {
          const sp = ECHO.Ent.freeSpot(world, x + (Math.random() - 0.5) * 3, y + (Math.random() - 0.5) * 3, 2);
          if (!sp) continue;
          const stag = i === 0 || (big && i < 3);
          const white = big && i === 0 && Math.random() < 0.6;
          const e = ECHO.Ent.make({ type: 'creature', species: 'deer', fauna: true, stag, white, herd: id, fname: white ? 'White-antlered stag' : stag ? 'Red stag' : 'Red deer', x: sp.x, y: sp.y, r: 0.4, hp: stag ? 42 : 30, maxHp: stag ? 42 : 30, speed: 6.4, faction: 'wild', state: 'graze', home: { x, y }, label: null });
          e.dir = Math.random() * 6.28;
          if (white) { e.hp = e.maxHp = 70; e.speed = 7; }
          game.addEnt(e);
        }
        return;
      }
    },
    nearTrees(world, x, y) {
      for (let dy = -4; dy <= 4; dy += 2) for (let dx = -4; dx <= 4; dx += 2) { const t = ECHO.World.tile(world, Math.floor(x) + dx, Math.floor(y) + dy); if (t === T.TREE || t === T.FOREST) return true; }
      return false;
    },
    // A deer's mind: graze, look up, bolt — and the herd goes together.
    deer(game, e, dt) {
      const pe = game.pe, world = game.world;
      e.t += dt;
      const d = U.dist(e.x, e.y, pe.x, pe.y);
      const vis = ECHO.Stealth ? ECHO.Stealth.vis(game) : 1;
      const notice = 14 * vis, bolt = 8.5 * vis;
      if (e.hp < e.maxHp && e.state !== 'flee') F.panic(game, e.herd, pe);
      if (e.state === 'graze' || e.state === 'alert') {
        e.moving = false;
        if (d < 1.4 + vis) F.panic(game, e.herd, pe);
        else if (d < bolt && (e.state === 'alert' && e.t > 1.2)) F.panic(game, e.herd, pe);
        else if (d < notice) {
          if (e.state !== 'alert') { e.state = 'alert'; e.t = 0; }
          e.dir = Math.atan2(pe.y - e.y, pe.x - e.x); e.flip = Math.cos(e.dir) < 0;
          if (d < bolt * 0.8) F.panic(game, e.herd, pe);
        } else {
          if (e.state === 'alert' && e.t > 4) e.state = 'graze';
          // amble while grazing
          e.wt = (e.wt || 0) - dt;
          if (e.wt <= 0) { e.wt = 3 + Math.random() * 5; const a = Math.random() * 6.28; e.goal = { x: e.home.x + Math.cos(a) * 2.5, y: e.home.y + Math.sin(a) * 2.5 }; e.walk = Math.random() < 0.4; }
          if (e.walk && e.goal && U.dist(e.x, e.y, e.goal.x, e.goal.y) > 0.4) ECHO.Ent.seek(world, e, e.goal.x, e.goal.y, 0.7, dt, 0.2);
        }
      } else if (e.state === 'flee') {
        const a = Math.atan2(e.y - e.from.y, e.x - e.from.x) + Math.sin(e.t * 1.7 + e.id) * 0.25;
        ECHO.Ent.seek(world, e, e.x + Math.cos(a) * 3, e.y + Math.sin(a) * 3, e.speed, dt, 0.1);
        if (e.t > 7 && d > 26) { e.dead = true; e.vanish = true; }
      }
    },
    panic(game, herd, from) {
      for (const e of game.ents) if (e.herd === herd && !e.dead && e.state !== 'flee') { e.state = 'flee'; e.t = Math.random() * 0.3; e.from = { x: from.x, y: from.y }; }
    },
    // ------------------------------------------------------------ greetings
    greet(game, e, npc) {
      const pl = game.pl, pe = game.pe, world = game.world;
      if (!npc || e.hidden || e.sayT > 0 || e.role === 'bandit' || e.sleeping || e.dq || e.isCompanion) return false;
      if (U.dist(e.x, e.y, pe.x, pe.y) > 3.6) return false;
      const key = npc.id + ':' + world.day;
      if (F.greeted[key]) return false;
      const op = (npc.op && npc.op[pl.charId]) || 0;
      const fame = pl.renown || 0;
      if (Math.abs(op) < 8 && fame < 40) return false;
      F.greeted[key] = true;
      const h = world.minute / 60;
      const tg = h < 5 ? 'Late to be out' : h < 11.5 ? 'Morning' : h < 17 ? 'Good day' : h < 21 ? 'Evening' : 'Late to be out';
      const name = pl.first;
      const pick = a => a[Math.floor(Math.random() * a.length)];
      let line;
      if (npc.prof === 'child') line = op > 0 ? pick([`Hi ${name}!`, `${name}! ${name}! Watch this!`, `Is that ${name}?!`]) : null;
      else if (op > 30) line = pick([`${tg}, ${name}!`, `${name}! Good to see you.`, `There's ${name}! ${tg}!`, `${tg}, friend.`]);
      else if (op >= 8) line = pick([`${tg}, ${name}.`, `${name}.`, `${tg}.`]);
      else if (op <= -20) line = pick([`…${name}.`, 'Hmph.', `Keep walking, ${name}.`]);
      else if (op <= -8) line = pick([`${name}.`, '…']);
      else line = pick([`Is that… ${name} ${pl.last}?`, `That's ${name} ${pl.last}, that is.`, `${tg} to you.`]);
      if (!line) return false;
      e.say = line; e.sayT = 2.6;
      e.dir = Math.atan2(pe.y - e.y, pe.x - e.x); e.flip = Math.cos(e.dir) < 0;
      e.waveT = op > 8 ? 1.2 : 0;
      return true;
    },
    // ------------------------------------------------------------ chimneys
    // smoke from the chimneys of houses and the inn: on cold mornings and
    // evenings, all day in winter; the smithy's forge whenever it's working
    chimney(world, b) {
      const h = world.minute / 60, season = ECHO.TIME.dateOf(world.day).seasonIdx;
      if (b.type === 'smithy') return h > 7 && h < 19 ? 1.2 : 0;
      if (b.type !== 'house' && b.type !== 'inn') return 0;
      if (b.fac && (b.fac.state === 'burned' || b.fac.state === 'ruined')) return 0;
      const cook = (h > 5.5 && h < 9) || (h > 17 && h < 21.5);
      const cold = season === 3 ? 1 : season === 0 || season === 2 ? 0.5 : 0.15;
      return (cook ? 0.7 : 0.1) * (0.4 + cold) * (b.type === 'inn' ? 1.6 : 1) * (0.6 + ECHO.hash2(b.x, b.y, 7) * 0.8);
    },
    update(game, dt) {
      if (!game.pe) return;
      if (ECHO.Interior.cur) { F.flocks = []; return; }
      F.birdsTick(game, dt);
      F.deerTick(game, dt);
    }
  };
})();
