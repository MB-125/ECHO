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

  const Lf = ECHO.Life = {
    BREEDS, FURNISH, fish: null,
    // ------------------------------------------------------------ horses
    buyHorse(pl, k) {
      const B = BREEDS[k]; if (!B) return 'No such horse.';
      if (pl.gold < B.price) return `${B.name}: ${B.price} crowns.`;
      pl.gold -= B.price; pl.horse = { breed: k, name: ['Ash', 'Bramble', 'Clover', 'Dusk', 'Ember', 'Flint', 'Hazel', 'Juniper', 'Mallow', 'Rook', 'Sorrel', 'Thistle'][Math.floor(Math.random() * 12)] };
      return null;
    },
    mount(game, on) {
      const pl = game.pl, pe = game.pe;
      if (!pl.horse) return ECHO.UI.toast('You have no horse. The market sells them.', 'warn', 3);
      if (on == null) on = !pl.mounted;
      if (on && ECHO.Interior.cur) return ECHO.UI.toast('Not indoors.', 'warn', 2);
      pl.mounted = on; pe.mounted = on;
      ECHO.PlayerCtl.derivedT = 0;
      if (on) ECHO.Combat.burst(pe.x, pe.y, '#b8a888', 8, 1.5, 0.4, 2);
      ECHO.Sfx.play(on ? 'dodge' : 'dodge', { pitch: on ? 0.7 : 1.1 });
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
      if (!pl || !pl.inv.rod || pl.mounted) return out;
      if (Lf.fish) { out.push({ kind: 'act', label: Lf.fish.bite > 0 ? 'Reel in!' : 'Stop fishing', d: 0, act: () => Lf.reel(game) }); return out; }
      if (Lf.nearWater(game) && !(game.combatT != null && game.time - game.combatT < 5)) out.push({ kind: 'act', label: 'Cast a line', d: 1.5, act: () => Lf.cast(game) });
      return out;
    },
    cast(game) { Lf.fish = { t: 0, at: 2 + Math.random() * 5, bite: 0, x: game.pe.x, y: game.pe.y }; ECHO.Combat.floater(game.pe.x, game.pe.y - 1.2, 'you cast your line…', '#bfe8ff'); },
    reel(game) {
      const F = Lf.fish; Lf.fish = null;
      const pl = game.pl, pe = game.pe;
      if (!F || F.bite <= 0) return ECHO.Combat.floater(pe.x, pe.y - 1.2, F && F.t > F.at ? 'too late — it got away' : 'you reel in an empty hook', '#c8c0b0');
      const night = game.isNight();
      let r = Math.random(), c = CATCH[0];
      for (const x of CATCH) { if (x.night && !night) continue; r -= x.p; if (r <= 0) { c = x; break; } }
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
      // riding: attacks and doors put you on your feet
      if (pl.mounted && (ECHO.Interior.cur || pe.attackT > 0 || ECHO.PlayerCtl.drawing || ECHO.PlayerCtl.charging || pe.blocking)) { Lf.mount(game, false); ECHO.Combat.floater(pe.x, pe.y - 1.2, 'you leap from the saddle', '#e8d9a0'); }
      pe.mounted = !!pl.mounted;
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
