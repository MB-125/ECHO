// Life in the water.
//
// Deep water is no longer a place nothing follows you: wolves swim after
// you, great beasts wade and swim, and people chasing you jump in too (your
// companion swims along behind you). And something lives in the deeper rivers
// and lakes: drowners, which lie under the surface — a trail of bubbles is the
// only sign — rise beside whoever comes into the water (or stands too close to
// the edge), grab and drag, and sink away again when hurt. They cannot leave
// the water. In clear shallows you can see fish, which scatter when anything
// splashes near them.
(function () {
  const { U } = ECHO;
  const T = () => ECHO.TILE;

  // the drowner, as a monster of the deep places
  const DROWNER = { name: 'Drowner', hp: 70, dmg: 10, speed: 2.7, reach: 1.35, wind: 0.5, cd: 1.6, tier: 2, resist: { ranged: 0.3, fire: 0.3 }, vis: { cloth: '#2e4436', cloth2: '#1c2a22', skin: '#5f8072', hair: '#2a3a20', show: [], em: '#0a1410', f2d: 'hue-rotate(110deg) saturate(0.7) brightness(0.8)' }, loot: [['pearl', 0.45, 1, 1], ['gel', 0.4, 1, 2]], gold: [0, 6], desc: 'Something that lives under the river and pulls swimmers down.', weak: 'Stay out of the water. Out of it, it is slow — and it burns.' };

  const WW = ECHO.WildWater = {
    fish: [], t: 6,
    install() {
      if (ECHO.Monsters && !ECHO.Monsters.DEFS.drowner) { ECHO.Monsters.DEFS.drowner = DROWNER; if (ECHO.Quests && ECHO.Quests.FOES) ECHO.Quests.FOES.drowner = DROWNER; }
      if (ECHO.Gear && !ECHO.Gear.MATS.pearl) ECHO.Gear.MATS.pearl = { name: 'river pearls', value: 28, tier: 2, color: '#e8e4f0' };
    },
    // who can swim
    swimmer(e) {
      if (!e || e.mounted) return false;
      return e.swims || e.type === 'person' || e.type === 'boss' || (e.type === 'creature' && e.species === 'wolf') || e.aquatic;
    },
    deepNear(world, x, y, r) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (ECHO.World.tile(world, Math.floor(x) + dx, Math.floor(y) + dy) === T().DEEP && !(ECHO.Climate && ECHO.Climate.frozen(world, x + dx, y + dy, true))) return { x: Math.floor(x) + dx + 0.5, y: Math.floor(y) + dy + 0.5 };
      return null;
    },
    // ------------------------------------------------------------ every frame
    update(game, dt) {
      const world = game.world, pe = game.pe, pl = game.pl;
      if (!pe || !pl || ECHO.Interior.cur) { WW.fish.length = 0; return; }
      WW.install();
      WW.fishTick(game, dt);
      // drowners rise from deep water near you, more at night and in the marshes
      WW.t -= dt;
      if (WW.t <= 0) {
        WW.t = 18 + Math.random() * 14;
        const lurkers = game.ents.filter(e => e.lurker && !e.dead);
        for (const e of lurkers) if (U.dist(e.x, e.y, pe.x, pe.y) > 32) { e.dead = true; e.vanish = true; }
        const near = WW.deepNear(world, pe.x, pe.y, 5);
        const lv = ECHO.Prowess ? ECHO.Prowess.level(pl) : 1;
        if (near && lurkers.length < 2 && lv >= 2 && Math.random() < (game.isNight() ? 0.55 : 0.18) * (pe._inWater ? 1.6 : 1)) {
          // somewhere deeper, a little way off
          let spot = null;
          for (let t = 0; t < 30 && !spot; t++) { const a = Math.random() * 6.28, r = 5 + Math.random() * 4; const x = pe.x + Math.cos(a) * r, y = pe.y + Math.sin(a) * r; if (ECHO.Water.kind(world, x, y) === 'deep') spot = { x, y }; }
          if (spot) {
            const e = ECHO.Monsters.make(game, 'drowner', spot.x, spot.y, Math.max(1, Math.min(6, lv - 1)), { noElite: true });
            e.lurker = true; e.aquatic = true; e.hidden = true; e.lurk = { st: 'under', t: 0 };
            game.ents.push(e);
          }
        }
      }
    },
    // A drowner's mind: under, rising, fighting, sinking. Returns true when it took the frame.
    lurk(game, e, dt) {
      const world = game.world, pe = game.pe, L = e.lurk;
      L.t += dt;
      const d = U.dist(e.x, e.y, pe.x, pe.y);
      const prey = !game.pl.capture && !game.defeating;
      // the player is "at the water" when in it, or on the bank within reach of it
      const atWater = pe._inWater || WW.deepNear(world, pe.x, pe.y, 1);
      if (L.st === 'under') {
        e.hidden = true; e.moving = false;
        if (Math.random() < dt * 2.5) { ECHO.Water.ripple(e.x, e.y, 0.35, 0.9); ECHO.Combat.fx.push({ kind: 'p', x: e.x + (Math.random() - 0.5) * 0.4, y: e.y + (Math.random() - 0.5) * 0.4, vx: 0, vy: 0, t: 0, life: 0.5, color: '#dff2ff', size: 1.5 }); }
        if (prey && atWater && d < 10) {
          // stalk along the bottom toward you
          ECHO.Ent.seek(world, e, pe.x, pe.y, e.speed * 1.1, dt, 0.3);
          if (d < 1.9 && L.t > 1.2) WW.rise(game, e, d);
        } else if (Math.random() < dt * 0.3) { const a = Math.random() * 6.28; ECHO.Ent.seek(world, e, e.x + Math.cos(a), e.y + Math.sin(a), 1, dt); }
        return true;
      }
      // up: fight in the water, sink when hurt or when you leave it
      e.hidden = false;
      if (e.hp < e.maxHp * 0.45 && !L.fled) { L.fled = true; WW.sink(game, e); return true; }
      if (L.t > 9 || (!atWater && d > 3)) { WW.sink(game, e); return true; }
      return false;   // the usual monster fighting
    },
    rise(game, e, d) {
      const pe = game.pe, pl = game.pl, L = e.lurk;
      L.st = 'up'; L.t = 0; e.hidden = false; e.aggro = true;
      ECHO.Water.splash(e.x, e.y, 16, 1.6); ECHO.Sfx.play('splash', { vol: 0.9, pitch: 0.75 });
      ECHO.Combat.floater(e.x, e.y - 1.4, 'a drowner rises!', '#9fe0c8', true);
      ECHO.Monsters.tip && ECHO.Monsters.tip(game, 'drowner');
      // a grab: dragged and held, worse if you're swimming
      if (d < 1.9 && !(pe.iframes > 0)) {
        const dmg = 5 + (e.lvl || 1) * 2;
        ECHO.Combat.damage(pe, dmg, { type: 'melee', from: e, angle: Math.atan2(pe.y - e.y, pe.x - e.x), knock: -0.2 });
        if (pe.swimming) { pl.stamina = Math.max(0, pl.stamina - 30); ECHO.Combat.floater(pe.x, pe.y - 1.6, 'dragged under!', '#ff9a7a', true); }
        pe.stagger = Math.max(pe.stagger || 0, 0.35);
      }
    },
    sink(game, e) {
      const L = e.lurk;
      L.st = 'under'; L.t = 0; e.hidden = true; e.aggro = false;
      ECHO.Water.splash(e.x, e.y, 10, 1); ECHO.Sfx.play('splash', { vol: 0.5, pitch: 0.9 });
      // slip away into deeper water to heal a little
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.1);
    },
    // ------------------------------------------------------------ fish
    fishTick(game, dt) {
      const world = game.world, pe = game.pe;
      const C = ECHO.Climate;
      if (C && C.frozen(world, pe.x, pe.y, false)) { WW.fish.length = 0; return; }
      // keep a few small shoals in the clear shallows around you
      WW.fishT = (WW.fishT || 0) - dt;
      if (WW.fishT <= 0 && WW.fish.length < 36) {
        WW.fishT = 0.4;
        const a = Math.random() * 6.28, r = 3 + Math.random() * 10, x = pe.x + Math.cos(a) * r, y = pe.y + Math.sin(a) * r;
        if (ECHO.Water.kind(world, x, y) === 'shallow') { const n = 3 + Math.floor(Math.random() * 4), h = Math.random() * 6.28; for (let i = 0; i < n; i++) WW.fish.push({ x: x + (Math.random() - 0.5) * 0.6, y: y + (Math.random() - 0.5) * 0.6, dir: h + (Math.random() - 0.5) * 0.5, v: 0.4, size: 0.7 + Math.random() * 0.6, flee: 0, hue: Math.random() }); }
      }
      const threats = game.ents.filter(e => !e.dead && !e.hidden && e._inWater && U.dist(e.x, e.y, pe.x, pe.y) < 16);
      for (const f of WW.fish) {
        let want = 0.5, dir = f.dir;
        for (const t of threats) { const d = U.dist(t.x, t.y, f.x, f.y); if (d < 1.6 + (t.moving ? 0.8 : 0)) { dir = Math.atan2(f.y - t.y, f.x - t.x); want = 4.5; f.flee = 0.6; } }
        for (const r of ECHO.Water.ripples) if (r.t < 0.2 && U.dist(r.x, r.y, f.x, f.y) < 1.2) { dir = Math.atan2(f.y - r.y, f.x - r.x); want = 4; f.flee = 0.5; }
        if (f.flee > 0) f.flee -= dt; else { dir += (Math.random() - 0.5) * dt * 3; }
        f.v += (want - f.v) * Math.min(1, dt * 4);
        f.dir += U.angleDiff(f.dir, dir) * Math.min(1, dt * 8);
        const nx = f.x + Math.cos(f.dir) * f.v * dt, ny = f.y + Math.sin(f.dir) * f.v * dt;
        if (ECHO.Water.kind(world, nx, ny)) { f.x = nx; f.y = ny; } else f.dir += Math.PI * (0.5 + Math.random() * 0.5);
        if (U.dist(f.x, f.y, pe.x, pe.y) > 18) f.gone = true;
      }
      WW.fish = WW.fish.filter(f => !f.gone);
    }
  };
})();
