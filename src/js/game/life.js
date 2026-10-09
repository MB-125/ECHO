// Life between fights: a horse to ride, a line to cast, a home to keep.
(function () {
  const { U } = ECHO;
  const BREEDS = {
    pony: { name: 'Hill pony', speed: 1.45, price: 90, color: '#8a6a4a', mane: '#3a2a1a', desc: 'Sure-footed and patient.' },
    courser: { name: 'Courser', speed: 1.75, price: 190, color: '#5a3a24', mane: '#1a1210', desc: 'Fast on the road, nervous in a fight.' },
    destrier: { name: 'Destrier', speed: 1.6, price: 280, color: '#2a2420', mane: '#0a0808', armored: true, desc: 'A warhorse. Blows meant for you glance off its barding.' },
    grey: { name: 'Silver grey', speed: 1.85, price: 420, color: '#c8c8cc', mane: '#e8e8ec', desc: 'The fastest horse in the realm, and she knows it.' }
  };
  const FURNISH = {
    bed: { name: 'A proper bed', cost: 60, desc: 'Sleep at home and wake Well Rested: a fifth more experience for a day.' },
    garden: { name: 'An herb garden', cost: 80, desc: 'Two bundles of herbs every morning, waiting in your chest.' },
    shrine: { name: 'A household shrine', cost: 140, desc: 'Once a season, sleeping at home restores a thread of fate.' },
    hearth: { name: 'A good hearth', cost: 70, desc: 'Warm nights, warm food: ten more life, for good.' },
    trophies: { name: 'A trophy wall', cost: 50, desc: 'Your trophies on the wall. Visitors talk: +1 renown a week for every trophy.' }
  };
  const CATCH = [
    { k: 'fish', p: 0.62, w: 'a trout' },
    { k: 'silverfin', p: 0.22, w: 'a silverfin' },
    { k: 'moonfish', p: 0.06, night: true, w: 'a moonfish, pale as milk' },
    { k: 'bottle', p: 0.05, w: 'a sealed bottle' },
    { k: 'boot', p: 0.05, w: 'an old boot' }
  ];

  // How far a horse trusts you, and what that trust is worth.
  const BOND = [
    { min: 0, name: 'Wary', desc: 'It tolerates you. It tires quickly and spooks easily.' },
    { min: 25, name: 'Steady', desc: 'It knows your voice. Steadier under you, slower to tire.' },
    { min: 50, name: 'Trusted', desc: 'It trusts you: quicker off the mark, harder to throw you, rarely rears.' },
    { min: 75, name: 'Bonded', desc: 'One mind between you. It comes faster, tires slowest, and fights for you when you are on foot beside it.' }
  ];
  const Lf = ECHO.Life = {
    BREEDS, FURNISH, BOND, fish: null,
    // ------------------------------------------------------------ the horse's own state
    hs(pl) { const h = pl.horse; if (!h) return null; if (h.bond == null) h.bond = 8; if (h.sta == null) h.sta = 100; if (h.dist == null) h.dist = 0; return h; },
    bondTier(h) { let t = BOND[0]; for (const b of BOND) if ((h.bond || 0) >= b.min) t = b; return t; },
    addBond(game, n, why) {
      const h = Lf.hs(game.pl); if (!h) return;
      const before = Lf.bondTier(h);
      h.bond = Math.min(100, (h.bond || 0) + n);
      const after = Lf.bondTier(h);
      if (after !== before) { ECHO.UI.banner(`${h.name} — ${after.name}`, after.desc, true); ECHO.UI.toast(`${h.name} trusts you more: ${after.name.toLowerCase()}. ${after.desc}`, 'legend', 6); }
      else if (why) ECHO.Combat.floater(game.pe.x, game.pe.y - 1.6, `${h.name} ♥ ${why}`, '#f0b8c8');
    },
    // The ride, each frame: tiring at the gallop, recovering at the walk, trust built mile by mile.
    rideTick(game, R0, dt) {
      const h = Lf.hs(game.pl); if (!h) return Infinity;
      const v = R0.v, b = h.bond || 0;
      const drain = v > 5.6 ? 4 : v > 4.4 ? 1.4 : v > 2 ? -2.5 : -6;
      const mud = ECHO.Climate ? ECHO.Climate.mud(game.world, game.pe.x, game.pe.y) : 0;  // mud is hard going
      h.sta = U.clamp(h.sta - drain * dt * (drain > 0 ? (1 - b / 230) * (1 + mud * 0.7) : 1), 0, 100);
      if (h.sta < 12 && !h.blown) { h.blown = true; ECHO.Combat.floater(game.pe.x, game.pe.y - 1.6, `${h.name} is blown — ease off`, '#e8d9a0'); ECHO.Sfx.play('snort', { vol: 0.8 }); }
      if (h.blown && h.sta > 40) h.blown = false;
      h.dist += v * dt;
      if (h.dist >= 60) { h.dist -= 60; Lf.addBond(game, 1); }
      return h.blown ? 4.2 : Infinity;
    },
    // The horse picks its own line. It reads the ground a few strides ahead —
    // more at speed — and leans around trunks, rocks, walls, deep water and
    // people, keeping as close to where you point it as it can; if there is no
    // way past, it checks its pace in time instead of running into it.
    steer(game, x, y, want, v, self) {
      const world = game.world, look = 1.2 + Math.max(0, v) * 0.5;
      const probe = { type: 'player', mounted: true };
      const solid = (px, py) => ECHO.Water ? ECHO.Water.blockedFor(probe, world, px, py) : ECHO.World.isSolid(world, px, py);
      // at the gallop, foes ahead are ridden down; everyone else is gone around
      const pe = game.pe, charging = v > 4.5;
      const people = game.ents.filter(e => e !== self && e !== pe && !e.dead && !e.hidden && !e.isCompanion && e.type !== 'boss' && U.dist(e.x, e.y, x, y) < look + 2 && !(charging && game.hostileTo(pe, e)));
      const clearFor = a => {
        const ca = Math.cos(a), sa = Math.sin(a), lx = -sa * 0.34, ly = ca * 0.34;
        for (let t = 0.45; t <= look; t += 0.3) {
          const cx = x + ca * t, cy = y + sa * t;
          if (solid(cx, cy) || solid(cx + lx, cy + ly) || solid(cx - lx, cy - ly)) return t;
          for (const e of people) if ((e.x - cx) ** 2 + (e.y - cy) ** 2 < (0.42 + (e.r || 0.3)) ** 2) return t;
        }
        return look + 1;
      };
      const f0 = clearFor(want);
      if (f0 > look) return { dir: want, free: f0, look, dev: 0 };
      // keep to the same side as last time, so it doesn't dither between two gaps
      const prefer = self && self._steerSide ? self._steerSide : 0;
      let best = { dir: want, free: f0, score: f0, side: 0 };
      for (const d of [0.2, 0.4, 0.65, 0.9, 1.15]) for (const s of [1, -1]) {
        const a = want + d * s, f = clearFor(a);
        const score = Math.min(f, look + 0.5) - d * 0.8 + (s === prefer ? 0.35 : 0);
        if (f > best.free + 0.25 && score > best.score) best = { dir: a, free: f, score, side: s };
      }
      if (self) self._steerSide = best.side || prefer;
      return { dir: best.dir, free: best.free, look, dev: U.angleDiff(want, best.dir) };
    },
    accelMul(pl) { const h = Lf.hs(pl); return h ? 1 + (h.bond || 0) / 200 : 1; },
    feed(game) {
      const pl = game.pl, h = Lf.hs(pl), now = game.world.day * 1440 + game.world.minute;
      if (!(pl.inv.food > 0)) return ECHO.UI.toast('You have nothing it would eat. Markets sell food.', 'warn', 3);
      if (h.fedAt != null && now - h.fedAt < 60) return ECHO.UI.toast(`${h.name} has just eaten.`, 'info', 2);
      pl.inv.food--; h.fedAt = now; h.sta = Math.min(100, h.sta + 45); h.blown = false;
      ECHO.Sfx.play('snort', { vol: 0.6 }); Lf.addBond(game, 2, 'munches happily');
    },
    groom(game) {
      const pl = game.pl, h = Lf.hs(pl), w = game.world;
      if (h.groomed === w.day) return ECHO.UI.toast(`${h.name} is already gleaming.`, 'info', 2);
      h.groomed = w.day; h.sta = Math.min(100, h.sta + 15);
      const a = pl.horseAt; for (let i = 0; i < 14; i++) ECHO.Combat.fx.push({ kind: 'p', x: a.x + (Math.random() - 0.5) * 1.2, y: a.y - Math.random() * 0.6, vx: 0, vy: -0.4, t: 0, life: 0.8, color: '#e8d9a0', size: 2 });
      Lf.addBond(game, 5, 'leans into the brush');
    },
    // A bonded horse beside you on foot fights for you.
    defend(game, dt) {
      const pl = game.pl, pe = game.pe, h = pl.horseAt, H = Lf.hs(pl);
      if (!h || !H || (H.bond || 0) < 75 || ECHO.Interior.cur) return;
      h.kickT = (h.kickT || 0) - dt;
      if (h.kickT > 0 || U.dist(h.x, h.y, pe.x, pe.y) > 5) return;
      const foe = game.ents.find(e => !e.dead && !e.hidden && e !== pe && game.hostileTo(pe, e) && e.type !== 'boss' && U.dist(e.x, e.y, h.x, h.y) < 1.7);
      if (!foe) return;
      h.kickT = 3.5; h.rearT = 0.6; h.dir = Math.atan2(foe.y - h.y, foe.x - h.x);
      ECHO.Sfx.play('neigh', { vol: 0.7 });
      ECHO.Combat.damage(foe, 14 + (ECHO.Prowess ? ECHO.Prowess.level(pl) * 2 : 0), { type: 'melee', from: pe, angle: h.dir, knock: 0.9, stagger: 0.8, heavy: true });
      ECHO.Combat.floater(foe.x, foe.y - 1.2, `${H.name} strikes out!`, '#f0b8c8', true);
    },
    hud(game) {
      const el = document.getElementById('hud-horse'); if (!el) return;
      const pl = game.pl, h = pl.mounted && Lf.hs(pl);
      const key = h ? `${h.name}|${Math.round(h.sta / 4)}|${h.blown}|${Lf.bondTier(h).name}` : '';
      if (Lf._hud === key) return; Lf._hud = key;
      el.className = h && h.blown ? 'blown' : '';
      el.innerHTML = h ? `<span>🐎 ${h.name} · ${Lf.bondTier(h).name.toLowerCase()}</span><span class="hb" title="Wind: gallop drains it, walking restores it"><i style="width:${Math.round(h.sta)}%"></i></span>${h.blown ? '<b>blown</b>' : ''}` : '';
    },
    card(world, pl) {
      const h = Lf.hs(pl);
      if (!h) return '';
      const B = BREEDS[h.breed], T = Lf.bondTier(h), next = BOND.find(b => b.min > (h.bond || 0));
      const bar = (v, col) => `<span style="display:inline-block;width:120px;height:6px;background:rgba(0,0,0,.45);border-radius:3px;overflow:hidden;vertical-align:middle"><i style="display:block;height:100%;width:${Math.round(v)}%;background:${col}"></i></span>`;
      return `<h3 class="gold">Your horse</h3><div class="card"><h4>🐎 ${h.name} <span class="dim">· ${B.name.toLowerCase()}</span></h4><div class="dim">${B.desc}</div>
        <div class="row" style="gap:10px;font-size:13px"><span style="width:70px">Trust</span>${bar(h.bond, '#f0b8c8')}<b>${T.name}</b></div>
        <div class="row" style="gap:10px;font-size:13px"><span style="width:70px">Wind</span>${bar(h.sta, '#9fe0c8')}<span>${h.blown ? 'blown' : Math.round(h.sta) + '%'}</span></div>
        <div class="dim" style="font-size:12.5px">${T.desc}${next ? ` Next: ${next.name} at ${next.min}.` : ''} Trust grows with every mile ridden together, with food from your pack, a daily grooming, and fights survived in the saddle.</div></div>`;
    },
    // ------------------------------------------------------------ horses
    buyHorse(pl, k) {
      const B = BREEDS[k]; if (!B) return 'No such horse.';
      if (pl.gold < B.price) return `${B.name}: ${B.price} crowns.`;
      pl.gold -= B.price; pl.horseAt = null; pl.horse = { breed: k, name: ['Ash', 'Bramble', 'Clover', 'Dusk', 'Ember', 'Flint', 'Hazel', 'Juniper', 'Mallow', 'Rook', 'Sorrel', 'Thistle'][Math.floor(Math.random() * 12)] };
      return null;
    },
    // V: mount when your horse is beside you; otherwise whistle and it comes to you.
    mount(game, on) {
      const pl = game.pl, pe = game.pe;
      if (!pl.horse) return ECHO.UI.toast('You have no horse. Stables sell them.', 'warn', 3);
      if (on == null) on = !pl.mounted;
      if (on && ECHO.Interior.cur) return ECHO.UI.toast('Not indoors.', 'warn', 2);
      if (on && game.pe.inBoat) return ECHO.UI.toast('Not from a boat.', 'warn', 2);
      if (on) {
        const h = pl.horseAt;
        if (h && U.dist(h.x, h.y, pe.x, pe.y) > 2.2) return Lf.whistle(game);
        if (h) { pe.x = h.x; pe.y = h.y; pe.dir = h.dir; }
        pl.horseAt = null;
        ECHO.Sfx.play(Math.random() < 0.35 ? 'neigh' : 'snort', { vol: 0.8 });
      } else {
        // step down on the near side; the horse stays where it stands
        const side = pe.dir + Math.PI / 2, inside = ECHO.Interior.cur, at = inside && Lf.lastOut ? Lf.lastOut : pe;
        pl.horseAt = { x: at.x, y: at.y, dir: at.dir, v: 0 };
        const nx = pe.x + Math.cos(side) * 0.85, ny = pe.y + Math.sin(side) * 0.85;
        if (!inside && !ECHO.World.isSolid(game.world, nx, ny)) { pe.x = nx; pe.y = ny; }
        Lf.ride = null;
      }
      pl.mounted = on; pe.mounted = on;
      ECHO.PlayerCtl.derivedT = 0;
      if (on) ECHO.Combat.burst(pe.x, pe.y, '#b8a888', 8, 1.5, 0.4, 2);
      ECHO.Sfx.play('dodge', { pitch: on ? 0.7 : 1.1 });
    },
    whistle(game) {
      const pl = game.pl, pe = game.pe, h = pl.horseAt;
      ECHO.Sfx.play('whistle');
      // too far to hear: it finds its own way, and turns up nearby
      if (!h || U.dist(h.x, h.y, pe.x, pe.y) > 70) {
        const a = Math.random() * Math.PI * 2;
        let sp = null;
        for (let r = 14; r >= 4 && !sp; r -= 2) { const x = pe.x + Math.cos(a) * r, y = pe.y + Math.sin(a) * r; if (!ECHO.World.isSolid(game.world, x, y)) sp = { x, y }; }
        pl.horseAt = { x: (sp || pe).x, y: (sp || pe).y, dir: a + Math.PI, v: 0 };
      }
      pl.horseAt.call = true; pl.horseAt.stuck = 0;
      ECHO.Combat.floater(pe.x, pe.y - 1.4, `you whistle for ${pl.horse.name}`, '#e8d9a0');
    },
    // Your horse when you are not on it: it grazes where you left it, and comes when called.
    horseTick(game, dt) {
      const pl = game.pl, pe = game.pe, world = game.world;
      if (!pl.horse || pl.mounted) return;
      if (!pl.horseAt) { const a = pe.dir + Math.PI / 2; pl.horseAt = { x: pe.x + Math.cos(a) * 1.2, y: pe.y + Math.sin(a) * 1.2, dir: pe.dir, v: 0 }; }
      const h = pl.horseAt;
      if (ECHO.Interior.cur) { h.v = 0; return; }
      const d = U.dist(h.x, h.y, pe.x, pe.y);
      let want = 0, tx = null, ty = null;
      if (h.call) {
        if (d < 1.6) { h.call = false; if (!(game.combatT != null && game.time - game.combatT < 4)) { Lf.mount(game, true); return; } }
        else { want = (d > 10 ? 8.5 : d > 4 ? 5 : 2) * ((Lf.hs(pl).bond || 0) >= 75 ? 1.15 : 1); tx = pe.x; ty = pe.y; }
      } else {
        // a slow amble now and then, never far from where it was left
        h.wT = (h.wT == null ? 6 : h.wT) - dt;
        if (h.wT <= 0) { h.wT = 8 + Math.random() * 14; const a = Math.random() * Math.PI * 2; h.wx = h.x + Math.cos(a) * 1.5; h.wy = h.y + Math.sin(a) * 1.5; }
        if (h.wx != null && U.dist(h.x, h.y, h.wx, h.wy) > 0.2) { want = 1.1; tx = h.wx; ty = h.wy; } else h.wx = null;
        // it shies away from a fight
        const foe = game.ents.find(e => !e.dead && !e.hidden && (e.foe || e.type === 'boss' || (e.type === 'creature' && e.aggro)) && U.dist(e.x, e.y, h.x, h.y) < 3.5);
        if (foe) { const a = Math.atan2(h.y - foe.y, h.x - foe.x); want = 6; tx = h.x + Math.cos(a) * 3; ty = h.y + Math.sin(a) * 3; if (!h.shied) { h.shied = true; ECHO.Sfx.play('neigh', { vol: 0.5 }); } } else h.shied = false;
      }
      // speed up and slow down like an animal with weight, turn in arcs
      if (h.rearT > 0) want = 0;
      h.v += U.clamp(want - h.v, -dt * 7, dt * 4.5);
      if (tx != null) {
        let a = Math.atan2(ty - h.y, tx - h.x);
        if (h.v > 0.3 || want > 1) { const S = Lf.steer(game, h.x, h.y, a, Math.max(h.v, 1.5), h); a = S.dir; if (S.free <= S.look) want = Math.min(want, Math.sqrt(Math.max(0, 2 * 7 * (S.free - 0.6)))); }
        const turn = U.angleDiff(h.dir, a);
        h.dir += U.clamp(turn, -dt * (h.v > 3 ? 3.2 : 6), dt * (h.v > 3 ? 3.2 : 6));
        if (Math.abs(turn) > 1.6 && h.v > 3) h.v -= dt * 6;
      }
      if (h.v > 0.05) {
        const nx = h.x + Math.cos(h.dir) * h.v * dt, ny = h.y + Math.sin(h.dir) * h.v * dt;
        if (!ECHO.World.isSolid(world, nx, ny)) { h.x = nx; h.y = ny; h.stuck = 0; }
        else if (!ECHO.World.isSolid(world, nx, h.y)) h.x = nx;
        else if (!ECHO.World.isSolid(world, h.x, ny)) h.y = ny;
        else { h.stuck = (h.stuck || 0) + dt; h.dir += dt * 2; }
        // hopelessly stuck while called: it finds another way round and turns up beside you
        if (h.call && h.stuck > 2.5) { const a = pe.dir + Math.PI; h.x = pe.x + Math.cos(a) * 1.4; h.y = pe.y + Math.sin(a) * 1.4; h.stuck = 0; }
      }
      // the odd snort, close enough to hear
      h.sT = (h.sT == null ? 8 : h.sT) - dt;
      if (h.sT <= 0) { h.sT = 9 + Math.random() * 16; if (d < 12) ECHO.Sfx.play('snort', { vol: Math.max(0.15, 0.6 - d / 24) }); }
    },
    // Riding down whatever stands in the way at a gallop.
    trample(game, R0, dt) {
      const pe = game.pe, pl = game.pl;
      if (R0.v < 5) return;
      const B = BREEDS[pl.horse.breed], heavy = B.armored ? 1.5 : 1;
      for (const e of game.ents) {
        if (e.dead || e.hidden || e === pe || e.isCompanion || !game.hostileTo(pe, e)) continue;
        if (e.type === 'boss' || e.boss2 || (e.foe && e.foe.boss) || e.maxHp > 220 * heavy) continue;
        if ((e._trampleT || 0) > game.time) continue;
        const d = U.dist(e.x, e.y, pe.x, pe.y);
        if (d > 1.0 + e.r) continue;
        const a = Math.atan2(e.y - pe.y, e.x - pe.x);
        if (Math.abs(U.angleDiff(R0.dir, a)) > 1.1) continue;
        e._trampleT = game.time + 1.2;
        ECHO.Combat.damage(e, (8 + R0.v * 2.2) * heavy * (ECHO.Prowess ? ECHO.Prowess.dmgMult(pl) : 1), { type: 'melee', from: pe, angle: a, knock: 0.9, stagger: 0.7, heavy: true });
        ECHO.Combat.floater(e.x, e.y - 1.1, 'trampled', '#e8d9a0');
        ECHO.Combat.burst(e.x, e.y, '#b8a888', 10, 3, 0.5, 2);
        R0.v *= B.armored ? 0.9 : 0.75;
        game.shake(0.15);
      }
    },
    // A hit taken in the saddle: barding turns some aside, a nervous horse may
    // rear, and a heavy enough blow throws you off.
    hitInSaddle(game, from, dmg) {
      const pl = game.pl, pe = game.pe, R0 = ECHO.PlayerCtl.ride;
      if (!pl.mounted || !pl.horse) return dmg;
      const B = BREEDS[pl.horse.breed];
      if (B.armored) dmg *= 0.8;
      const heavy = dmg > pl.maxHp * 0.2 || (from && (from.type === 'boss' || from.boss2));
      const trust = 1 - ((Lf.hs(pl).bond || 0) / 140);
      if (heavy && Math.random() < (B.armored ? 0.2 : 0.5) * trust) { Lf.unseat(game, from); return dmg; }
      if (R0 && pl.horse.breed === 'courser' && Math.random() < 0.2 * (1 - (Lf.hs(pl).bond || 0) / 100)) { R0.rearT = 0.7; ECHO.Sfx.play('neigh', { vol: 0.6 }); ECHO.Combat.floater(pe.x, pe.y - 1.6, `${pl.horse.name} rears!`, '#e8d9a0'); }
      return dmg;
    },
    unseat(game, from) {
      const pl = game.pl, pe = game.pe;
      Lf.mount(game, false);
      pe.stagger = 0.6;
      ECHO.Combat.floater(pe.x, pe.y - 1.4, 'thrown from the saddle!', '#ff9a7a', true);
      ECHO.Sfx.play('neigh'); game.shake(0.3);
      const h = pl.horseAt;
      if (h) { h.rearT = 1; const a = from ? Math.atan2(h.y - from.y, h.x - from.x) : Math.random() * 6.28; h.dir = a; h.v = 6; h.wx = h.x + Math.cos(a) * 6; h.wy = h.y + Math.sin(a) * 6; h.wT = 4; }
    },
    speedMul(pl) { return pl.mounted && pl.horse ? BREEDS[pl.horse.breed].speed : 1; },
    // ------------------------------------------------------------ fishing
    nearWater(game) {
      const world = game.world, pe = game.pe;
      if (ECHO.Interior.cur) return false;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const t = ECHO.World.tile(world, Math.floor(pe.x) + dx, Math.floor(pe.y) + dy); if ((t === ECHO.TILE.WATER || t === ECHO.TILE.DEEP) && Math.hypot(dx, dy) < 2.3) return true; }
      return false;
    },
    interactables(game) {
      const pl = game.pl, out = [];
      const h = pl && pl.horse && !pl.mounted && pl.horseAt;
      if (h && !ECHO.Interior.cur && U.dist(h.x, h.y, game.pe.x, game.pe.y) < 2.2) {
        const H = Lf.hs(pl), d = U.dist(h.x, h.y, game.pe.x, game.pe.y);
        out.push({ kind: 'act', label: `Ride ${H.name} (V)`, d: d - 0.01, act: () => Lf.mount(game, true) });
        out.push({ kind: 'act', label: `Feed ${H.name}`, d: d + 0.01, act: () => Lf.feed(game) });
        if (H.groomed !== game.world.day) out.push({ kind: 'act', label: `Groom ${H.name}`, d: d + 0.02, act: () => Lf.groom(game) });
      }
      if (!pl || !pl.inv.rod || pl.mounted) return out;
      if (Lf.fish) { out.push({ kind: 'act', label: Lf.fish.bite > 0 ? 'Reel in!' : 'Stop fishing', d: 0, act: () => Lf.reel(game) }); return out; }
      if (Lf.nearWater(game) && !(game.combatT != null && game.time - game.combatT < 5)) out.push({ kind: 'act', label: 'Cast a line', d: 1.5, act: () => Lf.cast(game) });
      return out;
    },
    cast(game) { Lf.fish = { t: 0, at: (2 + Math.random() * 5) * (ECHO.Events && ECHO.Events.salmonRun(game.world) ? 0.4 : 1), bite: 0, x: game.pe.x, y: game.pe.y }; ECHO.Combat.floater(game.pe.x, game.pe.y - 1.2, 'you cast your line…', '#bfe8ff'); },
    reel(game) {
      const F = Lf.fish; Lf.fish = null;
      const pl = game.pl, pe = game.pe;
      if (!F || F.bite <= 0) return ECHO.Combat.floater(pe.x, pe.y - 1.2, F && F.t > F.at ? 'too late — it got away' : 'you reel in an empty hook', '#c8c0b0');
      const night = game.isNight();
      let r = Math.random(), c = CATCH[0];
      for (const x of CATCH) { if (x.night && !night) continue; r -= x.p; if (r <= 0) { c = x; break; } }
      if (ECHO.Events && ECHO.Events.salmonRun(game.world) && c.k !== 'moonfish') c = Math.random() < 0.2 ? { k: 'goldsalmon', w: 'a golden salmon, glittering' } : { k: 'fish', w: 'a fat salmon' };
      pl.stats = pl.stats || {}; pl.stats.fish = (pl.stats.fish || 0) + 1;
      if (c.k === 'boot') return ECHO.UI.toast('You land… an old boot. The fish are laughing at you.', 'info', 3);
      if (c.k === 'bottle') { const g = 20 + Math.floor(Math.random() * 50); pl.gold += g; return ECHO.UI.toast(`A sealed bottle! Inside, a note in a hand you don't know, and ${g} crowns rolled in oilcloth.`, 'legend', 5); }
      pl.inv[c.k] = (pl.inv[c.k] || 0) + 1;
      ECHO.Combat.floater(pe.x, pe.y - 1.4, `you catch ${c.w}!`, (ECHO.Gear.MATS[c.k] || {}).color || '#bfe8ff', true);
      ECHO.Sfx.play('coin', { pitch: 1.3 });
      ECHO.Character.train(pl, 'endurance', 0.05);
    },
    // ------------------------------------------------------------ every frame
    update(game, dt) {
      const pl = game.pl, pe = game.pe;
      if (!pl || !pe) return;
      // fishing
      const F = Lf.fish;
      if (F) {
        if (U.dist(pe.x, pe.y, F.x, F.y) > 0.6 || ECHO.Interior.cur) { Lf.fish = null; ECHO.Combat.floater(pe.x, pe.y - 1.2, 'you pull your line in', '#c8c0b0'); }
        else {
          F.t += dt;
          if (F.bite > 0) { F.bite -= dt; if (F.bite <= 0) { ECHO.Combat.floater(pe.x, pe.y - 1.2, 'it got away…', '#c8c0b0'); F.at = F.t + 2 + Math.random() * 4; } }
          else if (F.t > F.at && F.t < F.at + 0.2) { F.bite = 0.9; ECHO.Combat.floater(pe.x, pe.y - 1.5, '! a bite — press E !', '#ffe08a', true); ECHO.Sfx.play('perfect'); }
          if (Math.random() < dt * 2) ECHO.Combat.fx.push({ kind: 'p', x: pe.x + Math.cos(pe.dir) * 1.6, y: pe.y + Math.sin(pe.dir) * 1.6, vx: 0, vy: -0.3, t: 0, life: 0.5, color: '#dff2ff', size: 2 });
        }
      }
      // riding: you fight from the saddle now; only a doorway puts you on your feet
      if (pl.mounted && ECHO.Interior.cur) { Lf.mount(game, false); ECHO.Combat.floater(pe.x, pe.y - 1.2, 'you leap from the saddle', '#e8d9a0'); }
      if (pl.horseAt && pl.horseAt.rearT > 0) pl.horseAt.rearT -= dt;
      pe.mounted = !!pl.mounted;
      if (!ECHO.Interior.cur && pl.mounted) Lf.lastOut = { x: pe.x, y: pe.y, dir: pe.dir };
      Lf.horseTick(game, dt);
      Lf.hud(game);
      Lf.defend(game, dt);
      if (pl.horse && !pl.mounted) { const H = Lf.hs(pl); H.sta = Math.min(100, H.sta + dt * 4); if (H.blown && H.sta > 40) H.blown = false; }
      // home comforts
      const world = game.world;
      Lf.t = (Lf.t || 0) - dt;
      if (Lf.t <= 0) {
        Lf.t = 2;
        pl._xpMul = pl.restedUntil != null && world.day <= pl.restedUntil ? 1.2 : 1;
      }
    },
    // ------------------------------------------------------------ home
    home(world, pl) { if (!pl.houseId) return null; for (const s of world.settlements) for (const b of s.buildings) if (b.id === pl.houseId) return { b, s }; return null; },
    furnish(world, pl, k) {
      const H = Lf.home(world, pl), F = FURNISH[k];
      if (!H || !F) return 'You need a house of your own.';
      H.b.furnish = H.b.furnish || {};
      if (H.b.furnish[k]) return 'Already done.';
      if (pl.gold < F.cost) return `${F.name}: ${F.cost} crowns.`;
      pl.gold -= F.cost; H.b.furnish[k] = world.day;
      if (k === 'hearth') { pl.boons = pl.boons || {}; pl.boons.hp = (pl.boons.hp || 0) + 10; ECHO.PlayerCtl.derivedT = 0; }
      return null;
    },
    // When you sleep in your own bed.
    slept(world, pl, b) {
      const f = b.furnish || {}, out = [];
      if (f.bed) { pl.restedUntil = world.day + 1; out.push('You wake Well Rested (+20% experience today).'); }
      if (f.shrine && (pl.shrineSeason == null || world.day - pl.shrineSeason >= 30) && pl.fate < 3) { pl.fate++; pl.shrineSeason = world.day; out.push('At the shrine, you feel a thread of fate knit back together.'); }
      return out;
    },
    newDay(world, pl) {
      const H = Lf.home(world, pl);
      if (!H || !H.b.furnish) return;
      if (H.b.furnish.garden) pl.inv.herbs = (pl.inv.herbs || 0) + 2;
      if (H.b.furnish.trophies && world.day % 7 === 0) { const n = pl.items.filter(id => world.items[id] && world.items[id].kind === 'trophy').length; if (n) pl.renown += n; }
    }
  };
})();
