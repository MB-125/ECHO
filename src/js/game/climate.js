// Weather you feel.
//
// The sky has always changed the harvest; now it changes the road. Rain turns
// tracks and fields to mud — slower going, horses tiring faster, footprints
// and hoofprints left behind you and mud thrown up by every hoof. Fog and
// driving snow shorten how far you see, and how far everything else sees you.
// Thunder spooks horses. Heavy rain swells the rivers until a ford you waded
// yesterday has to be swum. In a cold winter the ponds and river shallows
// freeze hard enough to walk on (slippery underfoot), and in a bitter one even
// the deep water.
(function () {
  const { U } = ECHO;
  const T = () => ECHO.TILE;
  const season = world => ECHO.TIME.dateOf(world.day).seasonIdx;
  const wxAt = (world, x, y) => (ECHO.Weather && x < 9000 ? ECHO.Weather.here(world, x, y) : { today: 'clear', wet: 0, temp: 0 });

  const Cl = ECHO.Climate = {
    prints: [],
    // How muddy the ground is here, 0–1.
    mud(world, x, y) {
      if (x >= 9000) return 0;
      const w = wxAt(world, x, y);
      if (Cl.frozenGround(world, w)) return 0;
      let m = ({ rain: 0.6, storm: 1, snow: 0.2, blizzard: 0.2, cloudy: 0.1, fog: 0.15 }[w.today] || 0) + Math.min(0.35, (w.wet || 0) * 0.1);
      if (w.today === 'clear' || w.today === 'heat') m *= 0.25;
      const t = ECHO.World.tile(world, Math.floor(x), Math.floor(y));
      const k = t === T().SWAMP ? 1.3 : t === T().ROAD || t === T().FARM ? 1.1 : t === T().GRASS || t === T().FOREST ? 0.8 : t === T().SAND ? 0.35 : 0.15;
      return U.clamp(m * k, 0, 1);
    },
    frozenGround(world, w) { return season(world) === 3 && ((w.temp || 0) < -0.3 || w.today === 'snow' || w.today === 'blizzard' || w.harsh); },
    // Ice: shallow water in a cold winter; deep water only in a bitter one.
    frozen(world, x, y, deep) {
      if (x >= 9000 || season(world) !== 3) return false;
      const w = wxAt(world, x, y);
      if (!Cl.frozenGround(world, w)) return false;
      return deep ? !!(w.harsh || w.today === 'blizzard' || (w.temp || 0) < -1.1) : true;
    },
    // After heavy rain the fords run deep.
    swollen(world, x, y) {
      if (x >= 9000 || season(world) === 3) return false;
      const w = wxAt(world, x, y);
      return w.today === 'storm' || (w.wet || 0) >= 3;
    },
    nearDeep(world, x, y) {
      const ix = Math.floor(x), iy = Math.floor(y);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (ECHO.World.tile(world, ix + dx, iy + dy) === T().DEEP) return true;
      return false;
    },
    moveMul(world, x, y, mounted) { return 1 - Cl.mud(world, x, y) * (mounted ? 0.3 : 0.22); },
    sightMul(world, x, y) {
      const w = wxAt(world, x, y);
      return { fog: 0.55, blizzard: 0.5, storm: 0.7, rain: 0.85, snow: 0.8 }[w.today] || 1;
    },
    onIce(world, x, y) {
      const t = ECHO.World.tile(world, Math.floor(x), Math.floor(y));
      return (t === T().WATER && Cl.frozen(world, x, y, false)) || (t === T().DEEP && Cl.frozen(world, x, y, true));
    },
    // ------------------------------------------------------------ every frame
    update(game, dt) {
      const world = game.world, pe = game.pe, pl = game.pl;
      if (!pe || !pl) return;
      for (const p of Cl.prints) p.t += dt;
      Cl.prints = Cl.prints.filter(p => p.t < p.life);
      if (ECHO.Interior.cur) return;
      const w = wxAt(world, pe.x, pe.y);
      // what the weather means, told once when it changes
      const key = `${w.today}|${Cl.frozen(world, pe.x, pe.y, false)}|${Cl.swollen(world, pe.x, pe.y)}`;
      if (key !== Cl.lastKey) {
        const first = Cl.lastKey == null; Cl.lastKey = key;
        const msg = {
          rain: 'Rain: the tracks are turning to mud. Slower going, horses tire faster, and footprints show.',
          storm: 'Storm: deep mud, lightning that spooks horses, and the fords running deep.',
          fog: 'Fog: you see less far — and so does everything else.',
          snow: 'Snow: the cold is in the ground; the shallows may freeze.',
          blizzard: 'Blizzard: you can hardly see your own hand. Neither can anything else.'
        }[w.today];
        if (!first && msg) ECHO.UI.toast(msg, 'info', 6);
        if (!first && Cl.frozen(world, pe.x, pe.y, false)) ECHO.UI.toast('The ponds and river shallows have frozen over. You can walk on the ice — carefully.', 'info', 6);
      }
      // footprints and hoofprints in mud and snow
      const soft = Cl.mud(world, pe.x, pe.y) > 0.3 || (season(world) === 3 && (w.today === 'snow' || w.today === 'blizzard' || w.harsh));
      if (soft && pe.moving && !pe.swimming && !pe._inWater) {
        Cl.stepT = (Cl.stepT || 0) - dt;
        if (Cl.stepT <= 0) {
          const mounted = pl.mounted;
          Cl.stepT = mounted ? 0.18 : 0.32;
          Cl.side = -(Cl.side || 1);
          const a = pe.dir || 0, sx = Math.cos(a + Math.PI / 2) * (mounted ? 0.18 : 0.1) * Cl.side;
          Cl.prints.push({ x: pe.x + sx, y: pe.y + Math.sin(a + Math.PI / 2) * (mounted ? 0.18 : 0.1) * Cl.side, a, t: 0, life: 40, hoof: mounted, snow: season(world) === 3 });
          if (Cl.prints.length > 260) Cl.prints.shift();
          if (Cl.mud(world, pe.x, pe.y) > 0.5 && (pe.rideV || 0) > 4) for (let i = 0; i < 2; i++) ECHO.Combat.fx.push({ kind: 'p', x: pe.x + (Math.random() - 0.5) * 0.5, y: pe.y + (Math.random() - 0.5) * 0.5, vx: -Math.cos(a) * 0.6, vy: -Math.sin(a) * 0.6, t: 0, life: 0.5, color: '#4a3a26', size: 2 });
        }
      }
      // thunder close by spooks horses
      if (w.today === 'storm') {
        Cl.thunderT = (Cl.thunderT == null ? 20 : Cl.thunderT) - dt;
        if (Cl.thunderT <= 0) {
          Cl.thunderT = 25 + Math.random() * 40;
          ECHO.Sfx.play('thunder');
          if (ECHO.Renderer3D) ECHO.Renderer3D.flashT = 0.3;
          const H = ECHO.Life && ECHO.Life.hs(pl), bond = H ? H.bond || 0 : 0;
          if (pl.mounted && ECHO.PlayerCtl.ride && Math.random() < 0.65 * (1 - bond / 110)) { ECHO.PlayerCtl.ride.rearT = 0.8; ECHO.Sfx.play('neigh', { vol: 0.7 }); ECHO.Combat.floater(pe.x, pe.y - 1.6, `${pl.horse.name} shies at the thunder!`, '#e8d9a0'); }
          else if (pl.horseAt && Math.random() < 0.6 * (1 - bond / 110)) { pl.horseAt.rearT = 0.8; }
        }
      }
    }
  };
})();
