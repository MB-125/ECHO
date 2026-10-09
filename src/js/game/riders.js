// Riders on the roads.
//
// The roads are travelled on horseback too: couriers carrying letters at a
// canter between towns, a kingdom's mounted patrols trotting in column (and
// running down anyone the crown wants), and at night, out in the wilds,
// outlaw raiders who hunt travellers from the saddle — lancers who charge
// through and wheel round for another pass, horse-archers who circle and
// shoot. A heavy enough blow knocks a rider down to fight on foot. A rider
// who falls leaves a horse: catch it if you have none, or take its tack.
//
// Riders are real people of the living world (a town's wanderer, a kingdom's
// guard, an outlaw from a camp), out on the road for a while.
(function () {
  const { U } = ECHO;
  const NAMES = ['Ash', 'Bramble', 'Clover', 'Dusk', 'Ember', 'Flint', 'Hazel', 'Juniper', 'Mallow', 'Rook', 'Sorrel', 'Thistle', 'Wren', 'Briar', 'Cinder', 'Fennel'];

  const Rd = ECHO.Riders = {
    loose: [], t: 8, seq: 0,
    reset() { Rd.loose = []; Rd.t = 8; },
    // ------------------------------------------------------------ spawning
    update(game, dt) {
      const pe = game.pe, world = game.world;
      if (!pe || !game.pl || ECHO.Interior.cur || game.pl.capture) return;
      Rd.looseTick(game, dt);
      Rd.t -= dt;
      if (Rd.t > 0) return;
      Rd.t = 18 + Math.random() * 14;
      const riders = game.ents.filter(e => e.rider && !e.dead);
      if (riders.length >= 5) return;
      const night = game.isNight(), h = world.minute / 60;
      const dusk = h >= 19 || h < 5;
      const nearTown = world.settlements.some(s => U.dist(s.x, s.y, pe.x, pe.y) < 20);
      const r = Math.random();
      const level = ECHO.Prowess ? ECHO.Prowess.level(game.pl) : 1;
      if ((night || dusk) && !nearTown && level >= 2 && world.day - (Rd.lastRaid || -9) >= 1 && r < 0.3) { if (Rd.raid(game)) Rd.lastRaid = world.day; return; }
      if (!night && r < 0.22) return void Rd.patrol(game);
      if (r < 0.5) return void Rd.courier(game);
    },
    // a road tile some way off, and a town on the far side of you to ride for
    roadSpot(game, rmin = 22, rmax = 30) {
      const world = game.world, pe = game.pe;
      for (let tries = 0; tries < 40; tries++) {
        const a = Math.random() * Math.PI * 2, r = rmin + Math.random() * (rmax - rmin);
        const x = Math.floor(pe.x + Math.cos(a) * r), y = Math.floor(pe.y + Math.sin(a) * r);
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const t = ECHO.World.tile(world, x + dx, y + dy);
          if ((t === ECHO.TILE.ROAD || t === ECHO.TILE.BRIDGE) && !ECHO.World.isSolid(world, x + dx + 0.5, y + dy + 0.5)) {
            const sx = x + dx + 0.5, sy = y + dy + 0.5;
            // ride for a town beyond you, so the road takes them past
            const towns = world.settlements.filter(s => { const ox = s.x - pe.x, oy = s.y - pe.y, ix = sx - pe.x, iy = sy - pe.y; return ox * ix + oy * iy < 0 && U.dist(s.x, s.y, pe.x, pe.y) < 140; });
            const to = towns.sort((p, q) => U.dist(p.x, p.y, pe.x, pe.y) - U.dist(q.x, q.y, pe.x, pe.y))[0];
            if (to) return { x: sx, y: sy, to };
          }
        }
      }
      return null;
    },
    free(game, n) { return n && n.status === 'alive' && !n.journey && !game.ents.some(e => e.npcId === n.id && !e.dead) && n.id !== game.pl.companion && !n.jailed && ECHO.People.age(game.world, n) >= 18; },
    mount(game, n, x, y, role, kind, o = {}) {
      const e = ECHO.Spawner.makePerson(game, n, x, y, role);
      e.mounted = true; e.rider = { kind, ...o }; e.horseBreed = o.breed || 'pony';
      e.maxHp = e.hp = Math.round(e.maxHp * 1.15);
      game.addEnt(e);
      return e;
    },
    courier(game) {
      const world = game.world, sp = Rd.roadSpot(game); if (!sp) return false;
      const from = world.settlements.filter(s => s !== sp.to && s.faction !== 'ashfang').sort((a, b) => U.dist(a.x, a.y, sp.x, sp.y) - U.dist(b.x, b.y, sp.x, sp.y))[0];
      if (!from) return false;
      const n = ECHO.People.residents(world, from).find(n => ['wanderer', 'hunter', 'merchant'].includes(n.prof) && Rd.free(game, n));
      if (!n) return false;
      const e = Rd.mount(game, n, sp.x, sp.y, 'traveler', 'courier', { dest: { x: sp.to.x, y: sp.to.y }, to: sp.to.name, speed: 5.4, breed: 'courser' });
      return true;
    },
    patrol(game) {
      const world = game.world, sp = Rd.roadSpot(game); if (!sp) return false;
      const f = world.factions[sp.to.faction];
      if (!f || f.type !== 'kingdom') return false;
      const guards = Object.values(world.npcs).filter(n => n.faction === f.id && n.prof === 'guard' && Rd.free(game, n));
      if (guards.length < 2) return false;
      const k = Math.min(guards.length, 2 + Math.floor(Math.random() * 2));
      let lead = null;
      for (let i = 0; i < k; i++) {
        const g = guards.splice(Math.floor(Math.random() * guards.length), 1)[0];
        const e = Rd.mount(game, g, sp.x - i * 0.8, sp.y + (i % 2) * 0.5, 'soldier', 'patrol', { dest: { x: sp.to.x, y: sp.to.y }, to: sp.to.name, speed: 3.8, breed: i === 0 ? 'destrier' : 'courser', slot: i });
        e.gear.helm = true; if (i % 2) e.gear.spear = true; else e.gear.shield = true;
        if (!lead) lead = e; else e.rider.lead = lead;
      }
      return true;
    },
    raid(game) {
      const world = game.world, pe = game.pe;
      const pool = [];
      for (const c of world.camps) if (c.alive !== false) for (const id of c.members) { const n = world.npcs[id]; if (Rd.free(game, n) && c.leader !== id) pool.push(n); }
      if (pool.length < 2) return false;
      // out of sight, upwind of you
      let spot = null;
      for (let t = 0; t < 30 && !spot; t++) { const a = Math.random() * 6.28, r = 20 + Math.random() * 6; const x = pe.x + Math.cos(a) * r, y = pe.y + Math.sin(a) * r; if (!ECHO.World.isSolid(world, x, y) && ECHO.World.tile(world, Math.floor(x), Math.floor(y)) !== ECHO.TILE.WATER) spot = { x, y }; }
      if (!spot) return false;
      const k = Math.min(pool.length, 2 + Math.floor(Math.random() * 2));
      for (let i = 0; i < k; i++) {
        const n = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
        const e = Rd.mount(game, n, spot.x + (i - 1) * 0.9, spot.y + (i % 2) * 0.7, 'bandit', 'raid', { speed: 6.2, breed: Math.random() < 0.5 ? 'pony' : 'courser', side: i % 2 ? 1 : -1 });
        e.aggro = true; e.label = null;
        if (i === k - 1 && k > 2) e.gear.bow = true;     // one of them shoots from the saddle
      }
      ECHO.UI.toast('Hoofbeats in the dark — riders, coming fast. Ashfang raiders.', 'warn', 5);
      ECHO.Sfx.play('neigh', { vol: 0.5, pitch: 0.9 });
      return true;
    },
    // ------------------------------------------------------------ a rider's mind (from Person.update)
    think(game, e, npc, dt, target) {
      const R = e.rider, pe = game.pe, world = game.world;
      if (!e.mounted) { e.rider = null; return false; }      // knocked down: fights on foot now
      const dp = U.dist(e.x, e.y, pe.x, pe.y);
      if (dp > 50) { e.vanish = true; e.dead = true; return true; }
      // raiders ride for you
      if (R.kind === 'raid' && !target && dp < 15 && !pe.hidden) { target = pe; e.target = pe; }
      if (target && R.kind !== 'courier') return Rd.fight(game, e, npc, dt, target), true;
      if (target && R.kind === 'courier') { const a = Math.atan2(e.y - target.y, e.x - target.x); Rd.ride(game, e, e.x + Math.cos(a) * 4, e.y + Math.sin(a) * 4, 7, dt); return true; }
      // the road
      if (R.kind === 'raid') { Rd.ride(game, e, pe.x, pe.y, R.speed * 0.9, dt, true); return true; }
      if (R.lead && !R.lead.dead && R.lead.mounted) {
        const L = R.lead, a = L.dir + Math.PI, off = 1.4 * (R.slot || 1);
        const tx = L.x + Math.cos(a) * off + Math.cos(L.dir + Math.PI / 2) * ((R.slot % 2) ? 0.5 : -0.5), ty = L.y + Math.sin(a) * off + Math.sin(L.dir + Math.PI / 2) * ((R.slot % 2) ? 0.5 : -0.5);
        const d = U.dist(e.x, e.y, tx, ty);
        if (d > 0.4) Rd.ride(game, e, tx, ty, Math.max(2, Math.min(R.speed * 1.4, d * 2.5)), dt, true); else e.moving = false;
        return true;
      }
      if (R.dest) {
        if (U.dist(e.x, e.y, R.dest.x, R.dest.y) < 3) { e.vanish = true; e.dead = true; return true; }
        Rd.ride(game, e, R.dest.x, R.dest.y, R.speed, dt, true);
        if (R.kind === 'courier' && dp < 4 && e.sayT <= 0 && Math.random() < dt * 0.4) { e.say = [`Letters for ${R.to}!`, 'Make way!', 'Can\'t stop — the post waits for no one!', `Fair roads to you, ${game.pl.first}.`][Math.floor(Math.random() * 4)]; e.sayT = 2.4; }
      }
      return true;
    },
    ride(game, e, tx, ty, sp, dt, path) {
      if (path) ECHO.Ent.travel(game.world, e, tx, ty, sp, dt);
      else ECHO.Ent.seek(game.world, e, tx, ty, sp, dt, 0.3);
    },
    // Mounted fighting: lancers charge through and wheel round; horse-archers circle and shoot.
    fight(game, e, npc, dt, target) {
      const R = e.rider, world = game.world;
      const d = U.dist(e.x, e.y, target.x, target.y), ang = Math.atan2(target.y - e.y, target.x - e.x);
      const skill = npc.skill.fight || 30;
      // badly hurt: ride for it
      if (e.hp < e.maxHp * 0.3 && R.kind !== 'patrol') { const a = ang + Math.PI; Rd.ride(game, e, e.x + Math.cos(a) * 5, e.y + Math.sin(a) * 5, 7.2, dt); if (d > 26) { e.vanish = true; e.dead = true; } return; }
      // the law rides up to arrest you if it can
      if (target === game.pe && (e.role === 'soldier' || e.role === 'guard') && ECHO.Court.shouldArrest(game, e)) {
        if (d > 1.9) { Rd.ride(game, e, target.x, target.y, 5.5, dt); if (e.sayT <= 0) { e.say = 'Halt, in the name of the crown!'; e.sayT = 2; } return; }
        e.moving = false; e.dir = ang; ECHO.Court.arrest(game, e); return;
      }
      if (e.gear.bow) {
        // circle at bow range, loosing as they go
        R.side = R.side || 1;
        const around = Math.atan2(e.y - target.y, e.x - target.x) + R.side * 0.7;
        Rd.ride(game, e, target.x + Math.cos(around) * 6, target.y + Math.sin(around) * 6, 5.6, dt);
        if (e.cd <= 0 && d < 10 && ECHO.Ent.lineOfSight(world, e.x, e.y, target.x, target.y)) {
          const lead = Math.min(0.5, d / 13);
          const tx = target.x + (target.moving ? Math.cos(target.dir) * 3 * lead : 0), ty = target.y + (target.moving ? Math.sin(target.dir) * 3 * lead : 0);
          ECHO.Combat.shoot(e, Math.atan2(ty - e.y, tx - e.x) + (Math.random() - 0.5) * 0.18, { kind: 'arrow', speed: 14, dmg: (5 + skill * 0.11) * (e.dmgMul || 1), life: 1.3, type: 'ranged' });
          e.cd = 1.7 + Math.random() * 0.6; e.state = 'attack'; e.t = 0;
          if (Math.random() < 0.2) R.side = -R.side;
        }
        return;
      }
      if (R.st === 'pass') {
        // ride on through, then wheel round for another pass
        R.passT -= dt;
        const sp = 6.6;
        const bx = e.x, by = e.y;
        ECHO.Ent.move(world, e, Math.cos(R.passDir) * sp * dt, Math.sin(R.passDir) * sp * dt);
        e.dir = R.passDir; e.moving = true;
        if (R.passT <= 0 || Math.hypot(e.x - bx, e.y - by) < sp * dt * 0.3) { R.st = 'approach'; R.side = -(R.side || 1); }
        return;
      }
      // approach: aim to pass close beside the target, strike in passing
      R.side = R.side || 1;
      const px = target.x + Math.cos(ang + Math.PI / 2) * 0.8 * R.side, py = target.y + Math.sin(ang + Math.PI / 2) * 0.8 * R.side;
      Rd.ride(game, e, px, py, 6.6, dt, d > 5);
      if (!R.wind && d < 3.6 && e.cd <= 0) {
        R.wind = 0.3; e.state = 'windup'; e.t = 0;
        ECHO.Combat.telegraph({ x: e.x, y: e.y - 0.1, angle: ang, len: 2.4, arc: 1.6, life: 0.3, shape: 'cone', color: 'rgba(255,90,70,0.24)' });
        if (target === game.pe) ECHO.Sfx.play('swing', { pitch: 0.6, vol: 0.4 });
      }
      if (R.wind) {
        R.wind -= dt;
        if (R.wind <= 0) {
          R.wind = 0;
          ECHO.Combat.melee(e, { angle: ang, arc: 1.7, range: 2.1, dmg: (6 + skill * 0.15) * 1.35 * (e.dmgMul || 1), knock: 0.45 });
          ECHO.Combat.slash(e.x, e.y - 0.3, ang, 2.1, 1.7, 'rgba(255,200,180,0.75)');
          e.state = 'attack'; e.t = 0; e.cd = 1.6 + Math.random() * 0.5;
          R.st = 'pass'; R.passT = 0.85; R.passDir = Math.atan2(py - e.y, px - e.x);
        }
      }
    },
    // ------------------------------------------------------------ falls and loose horses
    onHit(game, e, src) {
      if (!e.mounted || !e.rider || e.dead) return;
      if ((src.heavy || (src.stagger || 0) >= 0.7) && Math.random() < 0.5) Rd.unhorse(game, e, src.angle);
    },
    unhorse(game, e, angle) {
      e.mounted = false; e.rider = null; e.stagger = 1.0;
      ECHO.Combat.floater(e.x, e.y - 1.4, 'unhorsed!', '#ffe08a', true);
      ECHO.Combat.burst(e.x, e.y, '#b8a888', 14, 3, 0.5, 2);
      Rd.loosen(game, e, angle);
    },
    loosen(game, e, angle) {
      const a = angle != null ? angle : Math.random() * 6.28;
      Rd.loose.push({ id: ++Rd.seq, x: e.x, y: e.y, dir: a, v: 5, breed: e.horseBreed || 'pony', t: 0, rearT: 0.8, sta: 60 + Math.random() * 40 });
      ECHO.Sfx.play('neigh', { vol: 0.6 });
    },
    // a rider killed in the saddle leaves the horse
    fell(game, e) { if (e.mounted && e !== game.pe) { e.mounted = false; Rd.loosen(game, e, e.deathAngle); } },
    looseTick(game, dt) {
      const pe = game.pe, world = game.world;
      for (const h of Rd.loose) {
        h.t += dt; if (h.rearT > 0) h.rearT -= dt;
        const d = U.dist(h.x, h.y, pe.x, pe.y);
        let want = h.t < 2 ? 5 : h.t > 120 ? 6 : 0.9, dir = h.dir;
        if (h.t >= 2 && h.t <= 120) { h.wT = (h.wT || 0) - dt; if (h.wT <= 0) { h.wT = 4 + Math.random() * 6; h.wdir = Math.random() * 6.28; } dir = h.wdir; if (Math.random() < 0.5) want = 0; }
        if (h.t > 120 || h.bolt) { dir = Math.atan2(h.y - pe.y, h.x - pe.x); want = 6.5; }
        if (h.rearT > 0) want = 0;
        h.v += U.clamp(want - h.v, -dt * 7, dt * 4);
        h.dir += U.clamp(U.angleDiff(h.dir, dir), -dt * 3, dt * 3);
        if (h.v > 0.05) {
          const nx = h.x + Math.cos(h.dir) * h.v * dt, ny = h.y + Math.sin(h.dir) * h.v * dt;
          if (!ECHO.World.isSolid(world, nx, ny)) { h.x = nx; h.y = ny; } else h.dir += 1.5;
        }
        if (d > 45) h.gone = true;
      }
      Rd.loose = Rd.loose.filter(h => !h.gone);
    },
    interactables(game) {
      const pe = game.pe, pl = game.pl, out = [];
      if (ECHO.Interior.cur) return out;
      for (const h of Rd.loose) {
        const d = U.dist(h.x, h.y, pe.x, pe.y);
        if (d > 2.2 || h.bolt) continue;
        const B = ECHO.Life.BREEDS[h.breed];
        if (!pl.horse) out.push({ kind: 'act', label: `Catch the loose ${B.name.toLowerCase()}`, d, act: () => Rd.catch(game, h) });
        else out.push({ kind: 'act', label: 'Take its saddle and bridle', d, act: () => Rd.strip(game, h) });
      }
      return out;
    },
    catch(game, h) {
      const pl = game.pl, B = ECHO.Life.BREEDS[h.breed];
      pl.horse = { breed: h.breed, name: NAMES[Math.floor(Math.random() * NAMES.length)], bond: 0, sta: h.sta };
      pl.horseAt = { x: h.x, y: h.y, dir: h.dir, v: 0 };
      h.gone = true; Rd.loose = Rd.loose.filter(x => !x.gone);
      ECHO.Sfx.play('snort');
      ECHO.UI.toast(`You catch the ${B.name.toLowerCase()} by its reins and call it ${pl.horse.name}. It is wary of you — ride it, feed it, groom it, and it will come to trust you.`, 'legend', 7);
    },
    strip(game, h) {
      const g = 15 + Math.floor(Math.random() * 25);
      game.pl.gold += g; h.bolt = true;
      ECHO.Sfx.play('coin');
      ECHO.Combat.floater(h.x, h.y - 1.2, `+${g} crowns of tack`, '#ffe08a');
    }
  };
})();
