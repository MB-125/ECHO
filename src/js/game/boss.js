// Apex monsters that learn.
// They watch which way you dodge and strike where you will be; if you hide
// behind a guard they break it; if you snipe from cover they smash the cover
// and close the distance. Beaten, they flee — and return armored against the
// way you hurt them, recognizing you. Their memory is saved with the world.
(function () {
  const { U } = ECHO;
  const G = () => ECHO.Game;

  const KIND = {
    drake: { dmg: 17, speed: 3.1, r: 1.05, attacks: ['bite', 'sweep', 'breath'], color: '#5d6b3c' },
    wyrm: { dmg: 15, speed: 3.4, r: 1.0, attacks: ['sweep', 'slam', 'spit'], color: '#4b5d6e' },
    stag: { dmg: 19, speed: 3.6, r: 1.0, attacks: ['gore', 'stomp', 'sweep'], color: '#6b5a4a' }
  };

  const B = ECHO.Boss = {
    KIND,
    spawn(game, lair) {
      const b = lair.boss;
      const k = KIND[b.kind];
      const e = ECHO.Ent.make({
        type: 'boss', x: lair.x + 0.5, y: lair.y - 2.5, r: k.r, hp: b.hp, maxHp: b.maxHp, speed: k.speed, faction: 'wild',
        boss: b, lair, state: 'dormant', t: 0, cd: 1.5, label: `${b.name} ${b.title}`
      });
      e.enc = { dmg: { melee: 0, ranged: 0, fire: 0 }, started: false };
      return e;
    },
    side(game, e, dodgeAngle) {
      const v = Math.atan2(game.pe.y - e.y, game.pe.x - e.x);
      const rel = U.angleDiff(v, dodgeAngle);
      if (Math.abs(rel) < 0.75) return 'back';
      if (Math.abs(rel) > 2.4) return 'forward';
      return rel < 0 ? 'right' : 'left';
    },
    noteDodge(game, angle) {
      for (const e of game.ents) {
        if (e.type !== 'boss' || e.dead || e.state === 'dormant') continue;
        if (U.dist(e.x, e.y, game.pe.x, game.pe.y) > 8) continue;
        if (!['windup', 'strike', 'feint'].includes(e.state) && game.time - (e.lastStrike || -9) > 0.5) continue;
        const s = B.side(game, e, angle);
        if (s === 'forward') continue;
        e.boss.memory.dodge[s]++;
      }
    },
    noteBlock(e) { e.boss.memory.blocks++; },
    noteDamage(e, type, dmg) {
      e.boss.memory.damageBy[type] = (e.boss.memory.damageBy[type] || 0) + dmg;
      e.enc.dmg[type] += dmg;
      if (e.state === 'dormant') B.wake(G(), e);
    },
    habit(mem) {
      const d = mem.dodge;
      const total = d.left + d.right + d.back;
      if (total < 3) return null;
      const side = d.right >= d.left && d.right >= d.back ? 'right' : d.left >= d.back ? 'left' : 'back';
      return { side, share: d[side] / total, total };
    },
    wake(game, e) {
      if (e.state !== 'dormant') return;
      const b = e.boss;
      const known = b.memory.knownFoes[game.pl.charId];
      e.state = 'roar'; e.t = 0;
      b.memory.encounters++;
      e.enc.started = true;
      game.shake(0.5);
      if (ECHO.Sfx) ECHO.Sfx.play('roar');
      game.ui.bossBar(e);
      if (known) {
        ECHO.Combat.floater(e.x, e.y - 2.2, '— it remembers you —', '#ffcf8a', true);
        const ar = b.armor;
        const notes = [];
        if (ar.melee > 0.1) notes.push('heavy bone plates have grown where your blade bit');
        if (ar.fire > 0.1) notes.push('its hide is caked in wet river clay that will not burn');
        if (ar.ranged > 0.1) notes.push('its scales now overlap like shingles against arrows');
        if (notes.length) game.ui.toast(`${b.name} has changed: ${notes.join('; ')}.`, 'boss', 8);
      } else if (b.memory.encounters > 1 && B.habit(b.memory)) {
        game.ui.toast(`${b.name} watches you with an old, patient hunger. It has fought your kind before.`, 'boss', 6);
      }
    },
    readout(e) {
      const b = e.boss, m = b.memory;
      const lines = [`${b.name} ${b.title}.`];
      const h = B.habit(m);
      if (h && h.share > 0.5) lines.push(`It has seen you dodge ${h.side === 'back' ? 'backward' : 'to your ' + h.side} ${Math.round(h.share * 100)}% of the time — it will strike where you mean to be.`);
      else lines.push('It is still learning how you move.');
      if (m.attacksSeen >= 4 && m.blocks / m.attacksSeen > 0.35) lines.push('It has learned you hide behind your guard, and will try to break it.');
      if (m.rangedTime > m.meleeTime * 1.4 && m.rangedTime > 10) lines.push('It knows you prefer to keep away, and will close the distance.');
      const ar = b.armor;
      const arm = Object.entries(ar).filter(([, v]) => v > 0.05).map(([k, v]) => `${k} (${Math.round(v * 100)}%)`);
      if (arm.length) lines.push('It has grown armored against ' + arm.join(', ') + '.');
      if (b.kills) lines.push(`It has killed ${b.kills} who came before you.`);
      return lines.join(' ');
    },

    update(game, e, dt) {
      const world = game.world;
      const b = e.boss, mem = b.memory, k = KIND[b.kind];
      const pe = game.pe;
      e.t += dt;
      e.cd = Math.max(0, e.cd - dt);
      b.hp = e.hp;
      if (!pe || pe.dead) { e.moving = false; return; }
      const d = U.dist(e.x, e.y, pe.x, pe.y);
      const ang = Math.atan2(pe.y - e.y, pe.x - e.x);
      if (e.state === 'dormant') {
        e.moving = false;
        if (d < 8.5) B.wake(game, e);
        return;
      }
      if (d > 26 && e.state !== 'flee') { e.state = 'dormant'; game.ui.bossBar(null); return; }
      if (d > 5) mem.rangedTime += dt; else mem.meleeTime += dt;
      if (e.stagger > 0) { e.stagger -= dt; e.state = 'recover'; e.t = 0; return; }

      // Flee when badly hurt — it will be back.
      if (e.hp < e.maxHp * 0.28 && (b.fleeCount || 0) < 2 && e.state !== 'flee' && !['windup', 'strike', 'charge'].includes(e.state)) {
        e.state = 'flee'; e.t = 0;
        ECHO.Combat.floater(e.x, e.y - 2, `${b.name} flees!`, '#ffcf8a', true);
      }
      switch (e.state) {
        case 'roar':
          e.moving = false;
          if (e.t < 0.1) ECHO.Combat.ring(e.x, e.y, 3, 'rgba(255,220,180,0.6)', 0.6);
          if (e.t > 1.1) { e.state = 'stalk'; e.t = 0; }
          return;
        case 'flee': {
          const a = ang + Math.PI;
          ECHO.Ent.seek(world, e, e.x + Math.cos(a) * 3, e.y + Math.sin(a) * 3, k.speed * 1.5, dt, 0.1);
          if (e.t > 3.2 || d > 14) B.fled(game, e);
          return;
        }
        case 'stalk': {
          e.dir = ang; e.flip = Math.cos(ang) < 0;
          const want = 2.0;
          if (d > want) ECHO.Ent.travel(world, e, pe.x, pe.y, k.speed * (d > 6 ? 1.15 : 0.9), dt);
          else e.moving = false;
          if (e.cd <= 0 && d < 9) B.choose(game, e, d, ang);
          return;
        }
        case 'windup': case 'feint': return B.windup(game, e, dt, d, ang);
        case 'strike': if (e.t > 0.15) { e.state = 'recover'; e.t = 0; } return;
        case 'charge': return B.charge(game, e, dt);
        case 'smash': {
          const r = e.smashRock;
          if (!r || r.hp <= 0) { e.state = 'stalk'; return; }
          if (ECHO.Ent.travel(world, e, r.x + 0.5, r.y + 0.5 + 1.2, k.speed * 1.2, dt) || U.dist(e.x, e.y, r.x + 0.5, r.y + 0.5) < 2) {
            ECHO.Combat.hitRock(e.lair, r, 999);
            ECHO.Combat.floater(e.x, e.y - 2, 'CRASH', '#d9cbb0', true);
            e.state = 'recover'; e.t = 0; e.cd = 0.4;
          }
          return;
        }
        case 'recover': e.moving = false; if (e.t > 0.6) { e.state = 'stalk'; e.t = 0; } return;
        default: e.state = 'stalk';
      }
    },

    choose(game, e, d, ang) {
      const b = e.boss, mem = b.memory, k = KIND[b.kind];
      const pe = game.pe;
      // 1. Cover between us? Smash it.
      const rock = e.lair.rocks.find(r => {
        if (r.hp <= 0) return false;
        const rx = r.x + 0.5, ry = r.y + 0.5;
        const dr = U.dist(e.x, e.y, rx, ry);
        if (dr > d) return false;
        const t = ((rx - e.x) * (pe.x - e.x) + (ry - e.y) * (pe.y - e.y)) / (d * d);
        if (t < 0 || t > 1) return false;
        const px = e.x + (pe.x - e.x) * t, py = e.y + (pe.y - e.y) * t;
        return U.dist(px, py, rx, ry) < 1.0 && U.dist(pe.x, pe.y, rx, ry) < 3.5;
      });
      const rangedShare = mem.rangedTime / Math.max(1, mem.rangedTime + mem.meleeTime);
      if (rock && (rangedShare > 0.45 || Math.random() < 0.5)) { e.state = 'smash'; e.smashRock = rock; e.t = 0; return; }
      // 2. Kiting? Close the distance.
      if (d > 5.5 && (rangedShare > 0.5 || Math.random() < 0.35)) return B.startCharge(game, e, ang);
      if (d > 4.5) { e.cd = 0.3; return; }
      // 3. Turtling? Break the guard.
      const blockRate = mem.attacksSeen >= 4 ? mem.blocks / mem.attacksSeen : 0;
      if (blockRate > 0.33 && Math.random() < 0.3 + blockRate * 0.6) return B.startAttack(game, e, 'guardbreak', ang);
      // 4. Predictable dodges? Feint and punish.
      const h = B.habit(mem);
      if (h && h.share > 0.5 && Math.random() < Math.min(0.85, h.share)) return B.startAttack(game, e, 'feint', ang, h);
      const pick = k.attacks[Math.floor(Math.random() * k.attacks.length)];
      B.startAttack(game, e, pick, ang);
    },

    startAttack(game, e, kind, ang, habit) {
      const b = e.boss, k = KIND[b.kind];
      e.atk = kind; e.t = 0; e.aim = ang; e.habit = habit || null; e.reaimed = false;
      e.state = kind === 'feint' ? 'feint' : 'windup';
      const shapes = {
        bite: { shape: 'cone', len: 2.7, arc: 0.9, wind: 0.55, dmg: 1.25 },
        sweep: { shape: 'cone', len: 3.1, arc: 2.3, wind: 0.65, dmg: 0.9 },
        breath: { shape: 'line', len: 6, width: 1.3, wind: 0.8, dmg: 0.8, fire: true },
        slam: { shape: 'circle', radius: 1.7, wind: 0.75, dmg: 1.2, atTarget: true },
        spit: { shape: 'proj', wind: 0.5, dmg: 0.7 },
        gore: { shape: 'line', len: 4, width: 1.1, wind: 0.6, dmg: 1.3 },
        stomp: { shape: 'circle', radius: 2.4, wind: 0.7, dmg: 1.0 },
        guardbreak: { shape: 'circle', radius: 1.9, wind: 0.95, dmg: 1.5, atTarget: true, unblockable: true, color: 'rgba(170,90,255,0.35)' },
        feint: { shape: 'cone', len: 3.0, arc: 2.0, wind: 0.75, dmg: 1.2 }
      };
      const sh = shapes[kind];
      e.shape = { ...sh };
      if (sh.atTarget) { e.shape.cx = game.pe.x; e.shape.cy = game.pe.y; }
      e.windEnd = sh.wind * (b.memory.encounters > 1 ? 0.9 : 1);
      e.tele = ECHO.Combat.telegraph({
        x: e.x, y: e.y, angle: ang, len: sh.len, arc: sh.arc, width: sh.width, radius: sh.radius,
        cx: e.shape.cx, cy: e.shape.cy, life: e.windEnd, shape: sh.shape === 'proj' ? 'line' : sh.shape,
        color: sh.color || (sh.fire ? 'rgba(255,140,40,0.32)' : 'rgba(255,60,50,0.3)'), follow: e
      });
      if (b.memory.attacksSeen != null) b.memory.attacksSeen++;
    },

    windup(game, e, dt, d, ang) {
      const pe = game.pe;
      e.moving = false;
      e.dir = e.aim; e.flip = Math.cos(e.aim) < 0;
      // The feint: halfway through, it turns to where you are about to dodge.
      if (e.state === 'feint' && !e.reaimed && e.t > e.windEnd * 0.55) {
        e.reaimed = true;
        const v = Math.atan2(pe.y - e.y, pe.x - e.x);
        const h = e.habit;
        let off;
        if (h.side === 'back') off = { x: Math.cos(v) * 2.2, y: Math.sin(v) * 2.2 };
        else { const a = v + (h.side === 'right' ? -Math.PI / 2 : Math.PI / 2); off = { x: Math.cos(a) * 2.2, y: Math.sin(a) * 2.2 }; }
        if (e.tele) e.tele.done = true;
        e.shape = { shape: 'circle', radius: 1.6, dmg: 1.35, cx: pe.x + off.x, cy: pe.y + off.y, quick: true };
        e.windEnd = e.t + 0.22;
        e.tele = ECHO.Combat.telegraph({ shape: 'circle', cx: e.shape.cx, cy: e.shape.cy, radius: 1.6, life: 0.22, color: 'rgba(255,40,40,0.45)' });
        // also keep the original sweep live where the player stands now
        e.shape.also = { shape: 'cone', len: 2.6, arc: 1.4, angle: v };
        e.say = null;
      }
      if (e.t >= e.windEnd) B.strike(game, e);
    },

    strike(game, e) {
      const pe = game.pe, b = e.boss, k = KIND[b.kind];
      const sh = e.shape;
      e.state = 'strike'; e.t = 0; e.lastStrike = game.time;
      e.cd = 0.9 + Math.random() * 0.6;
      const dmg = k.dmg * sh.dmg * (1 + b.memory.encounters * 0.04);
      const hitTest = (s, x, y) => {
        if (s.shape === 'circle') {
          const cx = s.cx != null ? s.cx : e.x, cy = s.cy != null ? s.cy : e.y;
          return U.dist(x, y, cx, cy) < s.radius + 0.3;
        }
        const a = s.angle != null ? s.angle : e.aim;
        const dd = U.dist(e.x, e.y, x, y);
        if (s.shape === 'cone') return dd < s.len + 0.3 && Math.abs(U.angleDiff(a, Math.atan2(y - e.y, x - e.x))) < s.arc / 2;
        if (s.shape === 'line') {
          const lx = Math.cos(a), ly = Math.sin(a);
          const t = (x - e.x) * lx + (y - e.y) * ly;
          const perp = Math.abs((x - e.x) * ly - (y - e.y) * lx);
          return t > 0 && t < s.len && perp < (s.width || 1) / 2 + 0.3;
        }
        return false;
      };
      if (sh.shape === 'proj') {
        for (let i = -1; i <= 1; i++) ECHO.Combat.shoot(e, e.aim + i * 0.25, { kind: 'spit', speed: 9, dmg: dmg * 0.6, life: 1.2, type: 'ranged' });
        return;
      }
      const targets = game.ents.filter(o => !o.dead && !o.hidden && (o === pe || o.isCompanion || (o.type === 'person' && game.hostileTo(e, o))));
      for (const o of targets) {
        if (hitTest(sh, o.x, o.y) || (sh.also && hitTest(sh.also, o.x, o.y))) {
          ECHO.Combat.damage(o, dmg, { type: sh.fire ? 'fire' : 'melee', from: e, angle: Math.atan2(o.y - e.y, o.x - e.x), knock: 0.35, unblockable: sh.unblockable });
          if (sh.fire && !o.dead) o.burn = Math.max(o.burn, 2.5);
        }
      }
      // visuals
      if (sh.shape === 'circle') { ECHO.Combat.ring(sh.cx != null ? sh.cx : e.x, sh.cy != null ? sh.cy : e.y, sh.radius, sh.unblockable ? 'rgba(190,120,255,0.8)' : 'rgba(255,220,200,0.8)', 0.3); game.shake(0.3); if (ECHO.Sfx) ECHO.Sfx.play('stomp'); }
      else if (sh.fire) { for (let i = 0; i < 30; i++) { const t = Math.random() * sh.len; ECHO.Combat.fx.push({ kind: 'p', x: e.x + Math.cos(e.aim) * t, y: e.y + Math.sin(e.aim) * t, vx: (Math.random() - 0.5) * 2, vy: -1 - Math.random(), t: 0, life: 0.5, color: Math.random() < 0.5 ? '#ffb347' : '#ff5a1f', size: 3 }); } game.light(e.x + Math.cos(e.aim) * 3, e.y + Math.sin(e.aim) * 3, 6, 0.4, '#ff8a2a'); }
      else ECHO.Combat.slash(e.x, e.y - 0.3, e.aim, (sh.len || 2.5) + 0.3, sh.arc || 0.8, 'rgba(255,230,210,0.85)');
      if (sh.also) ECHO.Combat.slash(e.x, e.y - 0.3, sh.also.angle, sh.also.len, sh.also.arc, 'rgba(255,200,190,0.6)');
    },

    startCharge(game, e, ang) {
      e.state = 'charge'; e.t = 0; e.aim = ang; e.chargePhase = 'wind'; e.chargeHit = false;
      ECHO.Combat.telegraph({ x: e.x, y: e.y, angle: ang, len: 9, width: 1.6, life: 0.55, shape: 'line', color: 'rgba(255,60,50,0.28)', follow: e });
      e.boss.memory.attacksSeen++;
    },
    charge(game, e, dt) {
      const pe = game.pe, world = game.world;
      e.dir = e.aim; e.flip = Math.cos(e.aim) < 0;
      if (e.chargePhase === 'wind') { e.moving = false; if (e.t > 0.55) { e.chargePhase = 'go'; e.t = 0; e.lastStrike = game.time; } return; }
      const sp = 12.5 * dt;
      const before = { x: e.x, y: e.y };
      ECHO.Ent.move(world, e, Math.cos(e.aim) * sp, Math.sin(e.aim) * sp);
      e.moving = true;
      for (const r of e.lair.rocks) if (r.hp > 0 && U.dist(e.x, e.y, r.x + 0.5, r.y + 0.5) < 1.5) ECHO.Combat.hitRock(e.lair, r, 999);
      if (!e.chargeHit && U.dist(e.x, e.y, pe.x, pe.y) < e.r + pe.r + 0.3) {
        e.chargeHit = true;
        ECHO.Combat.damage(pe, KIND[e.boss.kind].dmg * 1.3, { type: 'melee', from: e, angle: e.aim, knock: 0.6 });
      }
      const stopped = U.dist(before.x, before.y, e.x, e.y) < sp * 0.3;
      if (e.t > 0.75 || stopped) { e.state = 'recover'; e.t = stopped ? -0.4 : 0; if (stopped) { e.stagger = 0.5; ECHO.Combat.floater(e.x, e.y - 2, 'stunned', '#ffe08a'); } }
    },

    fled(game, e) {
      const world = game.world, b = e.boss, pl = game.pl;
      const rng = ECHO.Sim.rngFor(world);
      e.dead = true; e.vanish = true;
      game.ui.bossBar(null);
      b.fleeCount = (b.fleeCount || 0) + 1;
      b.absentUntil = world.day + rng.int(5, 9);
      // Adapt to what hurt it most this time.
      const enc = e.enc.dmg;
      const worst = Object.keys(enc).reduce((a, c) => enc[c] > enc[a] ? c : a, 'melee');
      if (enc[worst] > 0) {
        b.armor[worst] = Math.min(0.6, (b.armor[worst] || 0) + 0.35);
        b.scars.push({ d: world.day, by: pl.charId, type: worst });
      }
      b.hp = b.maxHp;
      b.memory.knownFoes[pl.charId] = { name: pl.first + ' ' + pl.last, d: world.day, outcome: 'fled from' };
      pl.renown += 10;
      ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} wounded ${b.name} ${b.title} and drove it from its lair.`, importance: 2, x: e.lair.x, y: e.lair.y, rep: 4, tag: 'brave' });
    },

    defeated(e, from) {
      const game = G(), world = game.world, b = e.boss, pl = game.pl;
      e.dead = true; e.deathT = 0;
      b.alive = false; b.diedDay = world.day; b.hp = 0;
      b.killedBy = from === game.pe ? pl.first + ' ' + pl.last : 'unknown';
      game.ui.bossBar(null);
      ECHO.Combat.burst(e.x, e.y, '#5a1f1f', 40, 5, 1.2, 3);
      game.shake(0.8);
      if (from === game.pe || (from && from.isCompanion)) {
        pl.renown += 40;
        const key = 'the slaying of ' + b.name;
        pl.kills[b.name] = 1;
        ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} slew ${b.name} ${b.title}.`, importance: 3, x: e.lair.x, y: e.lair.y, rep: 10, tag: 'brave' });
        const trophy = ECHO.Character.makeItem(world, { kind: 'trophy', name: `${b.name}'s ${b.kind === 'stag' ? 'antler' : 'fang'}`, holder: 'player', history: [{ d: world.day, t: `taken from ${b.name} ${b.title}, slain by ${pl.first}` }] });
        pl.items.push(trophy.id);
        game.ui.toast(`${b.name} ${b.title} is dead. You take ${trophy.name}.`, 'boss', 6);
        for (const p of ECHO.Plights.open(world)) if (p.kind === 'apex' && p.lairId === e.lair.id) { p.playerDone = true; }
        void key;
      }
    }
  };
})();
