// Guns and missiles.
//
//   • A gun is carried in a slot of its own (pl.gun), beside the bow. ` (the key left of 1) swaps which of them the
//     right mouse button fires (pl.ranged: 'bow' or 'gun').
//   • Four kinds of gun:
//       – the pistol: a bolt for each pull of the trigger;
//       – the pulse rifle: hold the trigger for a stream of bolts that strays the longer you hold;
//       – the scattergun: seven bolts in a fan, and nothing hits harder up close;
//       – the missile launcher: hold to lock on, and the missile finds its mark and bursts,
//         throwing whatever stands near.
//   • Bolts burn energy cells (pl.inv.cells); the launcher uses missiles (pl.inv.missiles). Smiths
//     sell guns, cells and missiles, and markets sell cells.
//   • The salvo (-): from level 10, a pod on your shoulder looses four little missiles, each at a
//     foe of its own. It takes a while to load again (less time the better your archery).
//   • The crowns arm their own:
//       – some guards and soldiers carry rifles and fire them in bursts. Who does is worked out
//         from who they are when you meet them, so nothing is saved;
//       – a crown whose soldiers are fighting you, or a great foe at their gates, sends a gunship
//         over the roofs. It marks the ground and a missile follows each mark: keep moving.
//   • Beasts and monsters keep to their teeth and their magic.
//   • An old save has none of this until it is used. The first time, you are given a sidearm and
//     a pack of cells.
(function () {
  const { U } = ECHO;
  const C = () => ECHO.Combat, G = () => ECHO.Game, Ch = () => ECHO.Character;

  const GU = ECHO.Guns = {
    // what each kind does: seconds between shots, share of the gun's power each bolt, bolt
    // speed and life (so range), spread, bolts a shot, what it burns
    CLASSES: {
      pistol: { name: 'Pistol', cd: 0.3, per: 0.44, spd: 24, life: 0.6, spread: 0.035, ammo: 'cells', kick: 0.05, noise: 5, sfx: 'zap', assist: 10, desc: 'Quick and sure: a bolt for each pull of the trigger. Its bolts leave a foe charged.' },
      rifle: { name: 'Pulse rifle', cd: 0.11, per: 0.2, spd: 28, life: 0.72, spread: 0.02, grow: 0.014, max: 0.17, auto: true, ammo: 'cells', kick: 0.03, noise: 6, sfx: 'pulse', assist: 13, desc: 'Hold the trigger: a stream of bolts that strays the longer you hold it.' },
      scatter: { name: 'Cryo scattergun', cd: 0.8, per: 0.22, spd: 19, life: 0.33, spread: 0.46, pellets: 7, knock: 0.24, ammo: 'cells', kick: 0.14, noise: 7, sfx: 'blast', recoil: 0.16, assist: 6, desc: 'Seven freezing bolts in a fan: three that land freeze a foe solid. Then strike it.' },
      launcher: { name: 'Missile launcher', cd: 1.35, per: 2.3, radius: 2, missile: true, lock: true, ammo: 'missiles', kick: 0.2, noise: 9, sfx: 'missile', recoil: 0.2, assist: 18, desc: 'Hold to lock on: the missile finds its mark and bursts, throwing whatever stands near.' }
    },
    ODDS: [['pistol', 0.36], ['rifle', 0.3], ['scatter', 0.19], ['launcher', 0.15]],
    NAMES: {
      pistol: ['sidearm', 'pistol', 'hand-cannon', 'blaster'],
      rifle: ['pulse rifle', 'carbine', 'longrifle', 'arc rifle'],
      scatter: ['scattergun', 'shredder', 'storm-gun'],
      launcher: ['missile launcher', 'missile tube', 'rocket pod']
    },
    AMMO: { cells: 'energy cells', missiles: 'missiles' },
    SALVO_LV: 10,
    // ------------------------------------------------------------ the state of your guns (not saved)
    cd: 0, heat: 0, up: 0, aiming: false, holdT: 0, lock: null, salvoT: 0, said: {},
    ships: [], queue: [], callT: 3, lastShip: {}, _shotGun: false,
    reset() { GU.cd = 0; GU.heat = 0; GU.up = 0; GU.aiming = false; GU.lock = null; GU.ships = []; GU.queue = []; GU.callT = 3; GU.lastShip = {}; GU.salvoT = 0; },
    cls(it) { return it && it.kind === 'gun' ? GU.CLASSES[it.gclass] || GU.CLASSES.pistol : null; },
    // the gun is what the right mouse button fires now
    active(game) {
      const pl = game.pl, W = game.world;
      const gun = pl.gun && W.items[pl.gun], bow = pl.bow && W.items[pl.bow];
      if (!gun) return false;
      return pl.ranged === 'gun' || !bow;
    },
    // the bar at the foot of the screen: what the right mouse fires, and what it has left
    hud(game) {
      const pl = game.pl, W = game.world, gun = pl.gun && W.items[pl.gun], K = GU.cls(gun), on = GU.active(game);
      const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      let h = on && K ? `<span title="Right mouse fires it · &#96; swaps to your bow" style="color:#9ff6ff">⌖ ${esc(K.name)} <b>${pl.inv[K.ammo] || 0}</b> ${K.ammo === 'missiles' ? 'missiles' : 'cells'}</span>${pl.bow ? `<span class="dim" title="&#96; swaps to it">Arrows ${pl.inv.arrows}</span>` : ''}`
        : `<span title="Right mouse draws your bow${gun ? ' · &#96; swaps to your gun' : ''}">Arrows <b>${pl.inv.arrows}</b></span>${gun ? `<span class="dim" title="&#96; swaps to it">⌖ ${pl.inv[K.ammo] || 0} ${K.ammo === 'missiles' ? 'missiles' : 'cells'}</span>` : ''}`;
      if (pl.salvo) h += GU.salvoT > 0 ? `<span class="dim" title="-: missile salvo">Salvo ${Math.ceil(GU.salvoT)}s</span>` : `<span style="color:#ffd9a0" title="-: missile salvo">-·Salvo</span>`;
      return h;
    },
    // how much aiming slows you on foot (a launcher on the shoulder most)
    slow(game) { const K = GU.cls(game.world.items[game.pl.gun]); return K && K.lock ? 0.6 : K && K.pellets ? 0.8 : 0.75; },
    // which of your pieces a ranged blow came from (for its affix, and what it tempers)
    rangedId(game) { return GU._shotGun ? game.pl.gun : game.pl.bow; },
    // ------------------------------------------------------------ making them
    pickClass(rng) { let r = rng.next(); for (const [k, p] of GU.ODDS) { if (r < p) return k; r -= p; } return 'pistol'; },
    baseName(rng, gclass) { const L = GU.NAMES[gclass] || GU.NAMES.pistol; return L[rng.int(0, L.length - 1)]; },
    // a gun as the smith sells it
    smithWares(world, s, era, arcane) {
      void s;
      return [
        { kind: 'gun', gclass: 'pistol', name: arcane ? 'Rune pistol' : 'Sidearm', dmg: 15, price: 75 },
        { kind: 'gun', gclass: 'rifle', name: arcane ? 'Arc rifle' : 'Pulse rifle', dmg: 18, price: 170 },
        { kind: 'gun', gclass: 'scatter', name: 'Scattergun', dmg: 19, price: 185 },
        { kind: 'gun', gclass: 'launcher', name: era >= 2 ? 'Seeker launcher' : 'Missile tube', dmg: era >= 2 ? 26 : 22, price: era >= 2 ? 360 : 300 }
      ];
    },
    // ------------------------------------------------------------ once, the first time
    gift(game) {
      const pl = game.pl, W = game.world;
      if (!pl || pl.gunGift || !W) return;
      pl.gunGift = 1;
      pl.inv.cells = (pl.inv.cells || 0) + 40;
      if (!pl.gun) {
        const lv = ECHO.Prowess ? ECHO.Prowess.level(pl) : 1;
        const dmg = ECHO.Gear ? ECHO.Gear.statFor('gun', lv, 'fine') : 15;
        const it = Ch().makeItem(W, { kind: 'gun', name: 'Old sidearm', dmg, holder: 'player', history: [{ d: W.day, t: 'given to you: the land has guns now' }] });
        it.gclass = 'pistol'; it.rarity = 'fine'; it.level = lv; it.plus = 0;
        if (!pl.items.includes(it.id)) pl.items.push(it.id);
        pl.gun = it.id;
      }
      if (!pl.ranged) pl.ranged = pl.bow && W.items[pl.bow] ? 'bow' : 'gun';
      if (ECHO.UI && ECHO.UI.toast) ECHO.UI.toast('The land has guns now. You carry a sidearm and 40 energy cells. Press ` (the key left of 1) to swap between bow and gun; the right mouse button fires whichever is ready. Smiths sell guns, cells and missiles.', 'legend', 11);
    },
    // ------------------------------------------------------------ each frame
    tick(game, dt) {
      const pl = game.pl, pe = game.pe;
      if (!pl || !pe) return;
      if (!pl.gunGift && !game.defeating) GU.gift(game);
      if (GU.salvoT > 0) GU.salvoT = Math.max(0, GU.salvoT - dt);
      // (the salvo's missiles, leaving one after another)
      for (let i = GU.queue.length - 1; i >= 0; i--) { const q = GU.queue[i]; q.t -= dt; if (q.t <= 0) { GU.queue.splice(i, 1); if (!pe.dead) q.fn(); } }
      if (!pl.salvo && ECHO.Prowess && ECHO.Prowess.level(pl) >= GU.SALVO_LV) {
        pl.salvo = 1;
        if (ECHO.UI) ECHO.UI.toast('Your shoulder pod is fitted: press - for a missile salvo, four little missiles each finding a foe of its own. It takes a while to load again.', 'legend', 9);
      }
      GU.gunships(game, dt);
    },
    // `: the bow or the gun
    swap(game) {
      const pl = game.pl, W = game.world;
      const gun = pl.gun && W.items[pl.gun], bow = pl.bow && W.items[pl.bow];
      if (!gun) { ECHO.UI.toast('You carry no gun. Smiths sell them.', 'info', 3); return; }
      if (!bow) { pl.ranged = 'gun'; ECHO.UI.toast(`${gun.name} ready: you carry no bow.`, 'info', 2); return; }
      pl.ranged = GU.active(game) ? 'bow' : 'gun';
      const PC = ECHO.PlayerCtl; PC.drawing = false; PC.draw = 0; GU.lock = null;
      const K = GU.cls(gun);
      ECHO.UI.toast(pl.ranged === 'gun' ? `${gun.name} ready · ${K.name.toLowerCase()} · ${pl.inv[K.ammo] || 0} ${GU.AMMO[K.ammo]}` : `${bow.name} ready · ${pl.inv.arrows || 0} arrows`, 'info', 2);
      if (ECHO.Sfx) ECHO.Sfx.play('gunSwap');
      GU.up = pl.ranged === 'gun' ? 0.8 : 0;
    },
    // the right mouse button, with a gun ready
    playerUpdate(game, dt, aim) {
      const pl = game.pl, pe = game.pe, W = game.world, In = ECHO.Input, PC = ECHO.PlayerCtl;
      const it = W.items[pl.gun], K = GU.cls(it);
      if (!K) { GU.aiming = false; return; }
      GU.cd = Math.max(-5, GU.cd - dt);
      GU.up = Math.max(0, GU.up - dt);
      const blocked = pe.swimming || game.ui.blocksWorld() || PC.dodgeT > 0 || pl.flying;
      const held = In.mdown[2] && !blocked;
      GU.aiming = held;
      GU.heat = Math.max(0, GU.heat - dt * (held && K.auto ? 0 : 0.9));
      if (held) { GU.up = 1.4; GU.holdT += dt; } else GU.holdT = 0;
      // the launcher locks on to what you aim at, while you hold
      if (K.lock) { if (held) GU.lockOn(game, aim, dt); else if (!In.mreleased[2]) GU.lock = null; }
      const pull = In.mpressed[2] && !blocked;
      const fireNow = K.lock ? In.mreleased[2] && !blocked : K.auto ? held : pull || (held && GU.holdT > K.cd * 1.8 && GU.cd <= -K.cd * 0.7);
      if (!fireNow) return;
      if (GU.cd > 0) return;
      const have = pl.inv[K.ammo] || 0;
      if (have <= 0) {
        if (pull || (K.lock && In.mreleased[2])) { if (ECHO.Sfx) ECHO.Sfx.play('gunEmpty'); C().floater(pe.x, pe.y - 1.2, `no ${GU.AMMO[K.ammo]}`, '#9fd3ff'); }
        GU.cd = 0.3; GU.lock = null;
        return;
      }
      if (!(ECHO.React && ECHO.React.od > 0)) pl.inv[K.ammo] = have - 1;   // (Overdrive: nothing burned)
      GU.cd = K.cd;
      GU.fire(game, it, K, aim);
      if (K.lock) GU.lock = null;
    },
    // hold on a foe for a moment and it is locked: the missile will find it
    lockOn(game, aim, dt) {
      const PC = ECHO.PlayerCtl, pe = game.pe;
      const t = PC.assist(game, aim, 18, 0.32);
      if (!t || t.dead) { GU.lock = null; return; }
      if (!GU.lock || GU.lock.e !== t) GU.lock = { e: t, t: 0, on: false };
      GU.lock.t += dt;
      if (!GU.lock.on && GU.lock.t >= 0.45) { GU.lock.on = true; if (ECHO.Sfx) ECHO.Sfx.play('lockOn'); }
      void pe;
    },
    // the colour of a gun's bolts: its rarity's or its affix's, cyan for a plain one
    color(it) {
      if (!it || !ECHO.Gear) return '#7ff4ff';
      const L = ECHO.Gear.look(it);
      return !it.affix && (it.rarity === 'common' || it.rarity === 'fine') ? '#7ff4ff' : L.glowCol;
    },
    fire(game, it, K, aim) {
      const pe = game.pe, pl = game.pl, PC = ECHO.PlayerCtl, D = PC.derived || {};
      const base = D.gunDmg || 10, col = GU.color(it);
      const target = K.pellets ? null : PC.assist(game, aim, K.assist || 10, K.lock ? 0.32 : 0.16);
      const a0 = target ? Math.atan2(target.y - pe.y, target.x - pe.x) : aim;
      pe.dir = a0;
      if (K.missile) {
        const seek = GU.lock && GU.lock.on && GU.lock.e && !GU.lock.e.dead ? GU.lock.e : target;
        GU.launch(pe, a0, { dmg: base * K.per, radius: K.radius, seek, col, h: 1.05, by: 'gun' });
      } else {
        const n = K.pellets || 1;
        for (let i = 0; i < n; i++) {
          const spr = n > 1 ? (i / (n - 1) - 0.5) * K.spread + (Math.random() - 0.5) * 0.05 : (Math.random() - 0.5) * (K.spread + GU.heat * 2);
          const p = C().shoot(pe, a0 + spr, { kind: 'laser', speed: K.spd * (0.93 + Math.random() * 0.14), dmg: base * K.per, life: K.life * (n > 1 ? 0.85 + Math.random() * 0.3 : 1), type: 'ranged', color: col });
          p.gun = true; p.h = 0.88; p.knock = K.knock || 0.06; p.el = K.pellets ? 'cold' : 'shock';   // (what it leaves on what it hits: react.js)
        }
        if (K.grow) GU.heat = Math.min(K.max, GU.heat + K.grow);
      }
      GU.muzzle(game, pe, a0, col, K.missile ? 1.6 : K.pellets ? 1.3 : 0.9);
      if (ECHO.Sfx) ECHO.Sfx.play(K.sfx, { pitch: 0.95 + Math.random() * 0.1 });
      game.kick(a0 + Math.PI, K.kick);
      if (K.recoil && !pl.mounted) ECHO.Ent.move(game.world, pe, -Math.cos(a0) * K.recoil, -Math.sin(a0) * K.recoil);
      Ch().train(pl, 'archery', K.missile ? 0.06 : 0.015);
      game.noise(pe.x, pe.y, K.noise);
      if (ECHO.Wits) ECHO.Wits.note(game, 'ranged');
      GU.up = 1.4;
    },
    // the flash at the muzzle: light, a bloom of the bolt's colour, and (from a launcher) smoke
    muzzle(game, from, a, col, size) {
      const x = from.x + Math.cos(a) * 0.62, y = from.y + Math.sin(a) * 0.62;
      C().puff(x, y, { h: 0.88, vz: 0, g: 0, life: 0.09, size: 5 * size, color: col, glow: true, flash: true, grow: 1.5 });
      for (let i = 0; i < 3; i++) C().fx.push({ kind: 'p', x, y, vx: Math.cos(a + (Math.random() - 0.5) * 0.9) * 3, vy: Math.sin(a + (Math.random() - 0.5) * 0.9) * 3, t: 0, life: 0.15, color: col, size: 1.4, h0: 0.88, spark: true });
      if (size > 1.4) for (let i = 0; i < 4; i++) C().puff(x - Math.cos(a) * 0.8, y - Math.sin(a) * 0.8, { h: 0.9, vx: -Math.cos(a) * 1.5 + (Math.random() - 0.5), vy: -Math.sin(a) * 1.5 + (Math.random() - 0.5), vz: 0.4, g: -0.3, life: 0.8, size: 6, color: '#8a8e96', smoke: true });
      game.light(x, y, 3 * size, 0.7, col, 0.07);
    },
    // ------------------------------------------------------------ missiles
    // o: dmg, radius, seek (an ent to find), col, h (how high it leaves), mini (a salvo's),
    // to (a point it falls on, from above: a gunship's), t (how long that takes)
    launch(from, a, o) {
      const p = C().shoot(from, a, { kind: 'missile', speed: o.mini ? 9 : 7, dmg: o.dmg, life: o.to ? o.t : o.mini ? 2 : 2.6, radius: o.radius, type: 'fire', color: o.col });
      p.gun = o.by === 'gun' || o.by === 'salvo'; p.seek = o.seek || null; p.h = o.h || 1; p.h0 = p.h; p.mini = !!o.mini;
      p.acc = o.mini ? 26 : 22; p.vmax = o.mini ? 15 : 17; p.turn = o.mini ? 6.5 : 4.2; p.knock = o.mini ? 0.35 : 0.55; p.power = 0.3;
      if (o.to) {
        // from the sky onto a mark: straight there, falling, nothing in the way
        p.air = true; p.x = o.x; p.y = o.y; p.h = p.h0 = o.h; p.tx = o.to.x; p.ty = o.to.y;
        p.vx = (o.to.x - o.x) / o.t; p.vy = (o.to.y - o.y) / o.t; p.angle = Math.atan2(p.vy, p.vx); p.seek = null; p.acc = 0; p.turn = 0;
        p.ship = o.ship || null; p.pct = o.pct || 0;
      }
      return p;
    },
    // a missile on its way: faster, turning on what it seeks, rising and falling (a salvo's)
    steer(p, dt) {
      if (p.air) { const k = U.clamp(p.t / p.life, 0, 1); p.h = U.lerp(p.h0, 0.25, k * k); return; }
      const sp = Math.hypot(p.vx, p.vy), v = Math.min(p.vmax || 16, sp + (p.acc || 0) * dt);
      let a = Math.atan2(p.vy, p.vx);
      const s = p.seek;
      if (s && !s.dead && !s.hidden && p.t > (p.mini ? 0.18 : 0.1)) {
        const want = Math.atan2(s.y - 0.15 - p.y, s.x - p.x), d = U.angleDiff(a, want), max = (p.turn || 4) * dt;
        a += U.clamp(d, -max, max);
      }
      p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v; p.angle = a;
      if (p.mini) p.h = 0.9 + Math.sin(Math.min(1, p.t / 0.75) * Math.PI) * 1.4;
    },
    // a missile bursts: a white-hot flash, a ball of fire and smoke, the ground scorched, and
    // everything near thrown (bodies, barrels, crates), harder the nearer
    blast(p) {
      if (p.done && p._blown) return;
      p.done = true; p._blown = true;
      const game = G(), Cc = C(), R = p.radius || 1.5, world = game.world;
      const wet = ECHO.Water && ECHO.Water.quench && ECHO.Water.quench(p);
      Cc.puff(p.x, p.y, { h: 0.5, vz: 0.5, g: 0, life: 0.22, size: 16 + R * 7, color: '#fff4dc', glow: true, flash: true, grow: 2 });
      Cc.puff(p.x, p.y, { h: 0.6, vz: 0.6, g: 0, life: 0.4, size: 12 + R * 6, color: wet ? '#e8f0f8' : '#ff9a4a', glow: true, grow: 1.6 });
      Cc.burst(p.x, p.y, '#ffd48a', 14 + R * 8, 6, 0.5, 3);
      Cc.ring(p.x, p.y, R, p.color ? p.color : 'rgba(255,220,160,0.9)', 0.3);
      for (let i = 0; i < 5 + R * 2; i++) Cc.puff(p.x + (Math.random() - 0.5) * R, p.y + (Math.random() - 0.5) * R, { h: 0.4, vz: 1 + Math.random() * 1.6, g: -0.6, life: 1.3 + Math.random(), size: 6 + R * 2, color: wet ? '#e8eef4' : '#3a3c42', smoke: true });
      for (let i = 0; i < 12; i++) Cc.puff(p.x, p.y, { h: 0.5, vx: (Math.random() - 0.5) * 7, vy: (Math.random() - 0.5) * 7, vz: 2 + Math.random() * 5, g: 6, life: 0.7 + Math.random() * 0.5, color: Math.random() < 0.5 ? '#ffe2a0' : '#ff7a3a', size: 1.2, spark: true });
      if (!wet) Cc.decal(p.x, p.y, 'scorch', 0.8 + R * 0.5, 18);
      if (ECHO.Sfx) ECHO.Sfx.play('boom', { pitch: p.mini ? 1.3 : 1, vol: U.dist(p.x, p.y, game.pe.x, game.pe.y) < 18 ? 1 : 0.4 });
      if (U.dist(p.x, p.y, game.pe.x, game.pe.y) < 14) game.shake(Math.min(0.45, 0.1 + R * 0.08));
      game.light(p.x, p.y, R * 3.2 + 1, 1, '#ffc27a', 0.22);
      if (ECHO.Senses) ECHO.Senses.noise(game, p.x, p.y, 16, { kind: 'fight', by: p.from });
      if (ECHO.Town && p.from === game.pe && !wet) ECHO.Town.fireAt(p.x, p.y, p.from);
      GU._shotGun = !!p.gun;
      try {
        for (const e of game.ents) {
          if (e.dead || e.hidden || e.ghost || e.dqScared) continue;
          if (e === p.from) continue;
          if (p.from && (p.from === game.pe || p.from.isCompanion) && (e.isCompanion || e === game.pe)) continue;   // (your own missiles spare you and yours)
          const d = U.dist(p.x, p.y, e.x, e.y);
          if (d > R + e.r) continue;
          if (e !== game.pe && p.from && !game.hostileTo(p.from, e)) continue;
          if (e === game.pe && p.from && p.from !== game.pe && !game.hostileTo(p.from, e) && !(p.ship && p.ship.target === game.pe)) continue;
          const fall = 1 - Math.min(1, d / (R + e.r)) * 0.5;
          let dmg = p.dmg * fall;
          if (e === game.pe && p.pct) dmg = Math.max(dmg, game.pl.maxHp * p.pct * fall);   // (a gunship's missile: a share of your life)
          Cc.damage(e, dmg, { type: 'fire', from: p.from, angle: Math.atan2(e.y - p.y, e.x - p.x), knock: p.knock * (0.6 + 0.4 * fall), unblockable: !!p.air, blast: true });
        }
      } finally { GU._shotGun = false; }
      for (const l of world.lairs || []) for (const r of l.rocks || []) if (r.hp > 0 && U.dist(p.x, p.y, r.x + 0.5, r.y + 0.5) < R + 0.6) Cc.hitRock(l, r, 30);
      if (ECHO.Loose) ECHO.Loose.blast(p.x, p.y, R, { fire: false, power: p.mini ? 1 : 1.5, by: p.from });
    },
    // ------------------------------------------------------------ the salvo (-)
    salvo(game) {
      const pl = game.pl, pe = game.pe, PC = ECHO.PlayerCtl;
      if (!pl.salvo) { ECHO.UI.toast(`The shoulder pod comes at level ${GU.SALVO_LV}.`, 'info', 3); return; }
      if (GU.salvoT > 0) { ECHO.UI.toast(`The pod is loading: ${Math.ceil(GU.salvoT)}s.`, 'info', 1.5); return; }
      if (pe.swimming || pe.dead || game.ui.blocksWorld()) return;
      const D = PC.derived || {};
      const foes = game.ents.filter(e => !e.dead && !e.hidden && e !== pe && !e.isCompanion && !e.tamed && U.dist(e.x, e.y, pe.x, pe.y) < 15 && game.hostileTo(pe, e) && (e.type !== 'person' || e.aggro || e.target === pe))
        .sort((a, b) => U.dist(a.x, a.y, pe.x, pe.y) - U.dist(b.x, b.y, pe.x, pe.y));
      const mouse = game.screenToWorld(ECHO.Input.mx, ECHO.Input.my), aim = Math.atan2(mouse.y - pe.y, mouse.x - pe.x);
      for (let i = 0; i < 4; i++) {
        const t = foes.length ? foes[i % foes.length] : null;
        const a = (t ? Math.atan2(t.y - pe.y, t.x - pe.x) : aim) + (i - 1.5) * 0.55;
        GU.queue.push({ t: i * 0.11, fn: () => {
          GU.launch(game.pe, a, { dmg: D.salvoDmg || 12, radius: 1.25, seek: t && !t.dead ? t : null, col: '#ffb46a', h: 1.2, mini: true, by: 'salvo' });
          GU.muzzle(game, game.pe, a, '#ffd9a0', 0.8);
          if (ECHO.Sfx) ECHO.Sfx.play('missile', { pitch: 1.35, vol: 0.6 });
        } });
      }
      GU.salvoT = Math.max(12, 22 - pl.skills.archery * 0.1);
      game.noise(pe.x, pe.y, 8);
      Ch().train(pl, 'archery', 0.1);
      if (!foes.length) C().floater(pe.x, pe.y - 1.2, 'salvo', '#ffd9a0');
    },
    // ------------------------------------------------------------ the crowns' rifles
    // some guards and soldiers carry rifles: who, from who they are
    arm(game, e, npc) {
      if (!e || !npc || !(e.role === 'guard' || e.role === 'soldier') || e.mage || e.isCompanion) return;
      const f = game.world.factions[npc.faction];
      if (!f || !(f.type === 'kingdom' || f.type === 'order')) return;
      const h = ECHO.hashStr(npc.id + ':rifle') % 10;
      if (h >= (e.armsTier >= 3 ? 5 : 4)) return;
      e.gear.rifle = true; e.gear.bow = true; e.gear.crossbow = false; e.gear.spear = false; e.gear.shield = false;
    },
    // a guard's burst: three bolts, a breath apart
    npcFire(game, e, target, skill, npc) {
      e.burstN = 3; e.burstT = 0; e.burstAim = e.aimAngle; e._bSkill = skill; void npc;
      GU.npcShot(game, e, target);
    },
    npcBurst(game, e, target, dt) {
      e.burstT += dt;
      if (e.burstT < 0.13) return;
      e.burstT = 0;
      GU.npcShot(game, e, target);
    },
    npcShot(game, e, target) {
      if (!(e.burstN > 0)) return;
      e.burstN--;
      const skill = e._bSkill || 30, col = e.armsCol || '#ff8a5a';
      const lead = target && ECHO.Aware ? ECHO.Aware.lead(game, e, target, 22, e.burstAim) : e.burstAim;
      const a = lead + (Math.random() - 0.5) * 0.09 * (e.aimMul || 1);
      const dmg = Math.max(5 + skill * 0.11, (e.wdmg || 0) * (0.55 + skill / 220)) * (e.dmgMul || 1) * 0.5;
      const p = C().shoot(e, a, { kind: 'laser', speed: 22, dmg, life: 0.72, type: 'ranged', color: col });
      p.h = 0.88; p.knock = 0.05; p.npc = true;
      e.dir = a;
      GU.muzzle(game, e, a, col, 0.75);
      if (ECHO.Sfx && U.dist(e.x, e.y, game.pe.x, game.pe.y) < 16) ECHO.Sfx.play('pulse', { pitch: 0.85, vol: 0.45 });
    },
    // ------------------------------------------------------------ gunships
    // a crown whose soldiers are fighting you, or a great foe at their gates, sends one over the
    // roofs: it comes in, holds over the fight marking the ground, and goes when it has spent its
    // missiles (or the fight is done)
    gunships(game, dt) {
      const world = game.world, pe = game.pe;
      if (ECHO.Interior && ECHO.Interior.cur) { GU.ships.length = 0; return; }
      GU.callT -= dt;
      if (GU.callT <= 0) { GU.callT = 4; GU.call(game); }
      for (let i = GU.ships.length - 1; i >= 0; i--) {
        const s = GU.ships[i];
        s.t += dt;
        const tgt = s.target && !s.target.dead && !s.target.hidden ? s.target : null;
        const from = s.from && !s.from.dead ? s.from : game.ents.find(o => !o.dead && o.armsFid === s.fid && U.dist(o.x, o.y, s.x, s.y) < 40);
        s.from = from;
        if (s.state !== 'out' && (!tgt || !from || s.left <= 0 || s.t > 40 || (tgt === pe && game.pl.capture))) { s.state = 'out'; s.outA = Math.random() * Math.PI * 2; }
        let gx, gy, sp;
        if (s.state === 'out') { gx = s.x + Math.cos(s.outA) * 50; gy = s.y + Math.sin(s.outA) * 50; sp = 9; }
        else {
          // over the fight, circling a little
          s.ang = (s.ang || 0) + dt * 0.35;
          gx = tgt.x + Math.cos(s.ang) * 4.5; gy = tgt.y + Math.sin(s.ang) * 4.5; sp = s.state === 'in' ? 10 : 4;
          if (s.state === 'in' && U.dist(s.x, s.y, tgt.x, tgt.y) < 9) { s.state = 'hold'; s.fireT = 1; }
        }
        const dx = gx - s.x, dy = gy - s.y, d = Math.hypot(dx, dy) || 1, k = Math.min(1, dt * 1.6);
        s.vx = U.lerp(s.vx, dx / d * Math.min(sp, d * 1.5), k); s.vy = U.lerp(s.vy, dy / d * Math.min(sp, d * 1.5), k);
        s.x += s.vx * dt; s.y += s.vy * dt;
        s.h = U.lerp(s.h, s.state === 'hold' ? 6.2 : 7.5, Math.min(1, dt));
        if (s.state === 'hold' && tgt && from) {
          s.fireT -= dt;
          if (s.fireT <= 0) { s.fireT = 2.4; s.left--; GU.shipFire(game, s, tgt, from); }
        }
        if (s.state === 'out' && U.dist(s.x, s.y, pe.x, pe.y) > 46) GU.ships.splice(i, 1);
      }
      void world;
    },
    call(game) {
      const world = game.world, pe = game.pe, pl = game.pl, A = ECHO.Arsenal;
      if (!A || GU.ships.length >= 1 || pl.capture || game.defeating || pl.flying) return;
      // soldiers of a crown in a fight near you: with you, or with something great at their gates
      let best = null;
      for (const o of game.ents) {
        if (o.dead || !o.armsFid || !o.target || o.target.dead || U.dist(o.x, o.y, pe.x, pe.y) > 24) continue;
        const t = o.target;
        const big = t !== pe && (t.titan || t.boss || t.elite || (t.maxHp || 0) >= 400) && (t.type === 'creature' || t.type === 'monster');
        const atYou = t === pe && (game.time - (game.lastHitGuard || -99) < 25 || ((pl.wanted && pl.wanted[o.armsFid]) || 0) >= 40);
        if (!big && !atYou) continue;
        best = o; break;
      }
      if (!best) return;
      const fid = best.armsFid, f = world.factions[fid];
      if (!f || f.fallen || A.tier(world, fid) < 1) return;
      if (game.time - (GU.lastShip[fid] || -99) < 50) return;
      GU.lastShip[fid] = game.time;
      const a = Math.random() * Math.PI * 2, T = A.TIERS[A.tier(world, fid)] || {};
      GU.ships.push({ fid, col: f.color || T.col || '#ff6a4a', name: f.name, x: pe.x + Math.cos(a) * 34, y: pe.y + Math.sin(a) * 34, h: 7.5, vx: 0, vy: 0, t: 0, state: 'in', target: best.target, from: best, left: 5, fireT: 1 });
      if (!GU.said[fid]) { GU.said[fid] = 1; game.ui.toast(`A gunship of ${f.name} comes in over the roofs. Where its mark falls a missile follows: keep moving.`, 'warn', 7); }
      if (ECHO.Sfx) ECHO.Sfx.play('shipIn');
    },
    shipFire(game, s, tgt, from) {
      const pe = game.pe, world = game.world, A = ECHO.Arsenal;
      const lead = 0.9, x = tgt.x + (tgt.vx || 0) * lead * 0.6, y = tgt.y + (tgt.vy || 0) * lead * 0.6, t = 1.25;
      C().telegraph({ x, y, cx: x, cy: y, radius: 1.6, life: t, shape: 'circle', color: 'rgba(255,120,80,0.38)' });
      let dmg, pct = 0;
      if (tgt === pe) { const L = A ? A.lv(world, s.fid) : 10, me = ECHO.Prowess ? ECHO.Prowess.level(game.pl) : 10; pct = 0.085 * U.clamp(L / Math.max(1, me), 0.3, 2); dmg = game.pl.maxHp * pct; }
      else dmg = Math.min(900, Math.max(40, (tgt.maxHp || 200) * 0.12));
      const p = GU.launch(from, 0, { dmg, radius: 1.6, col: s.col, to: { x, y }, t, x: s.x, y: s.y, h: s.h - 0.4, ship: s, pct });
      p.from = from;
      if (ECHO.Sfx && U.dist(s.x, s.y, pe.x, pe.y) < 30) ECHO.Sfx.play('missile', { pitch: 0.8, vol: 0.6 });
    }
  };
})();
