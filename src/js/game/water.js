// Water you can get into.
//
// Shallow water — fords, pond margins, the edges of rivers — can be waded by
// anyone: it drags at your legs and at your horse's, you stand on the bed with
// the water at your knees, and every step throws spray and sends rings across
// the surface. Deep water is for swimming: only your head and shoulders above
// it, no blade, bow or fire, every stroke costing breath and heavy armour
// costing more; run out and you begin to drown. Horses won't go into deep
// water. Fire dies in water: burning things are put out, and a fireball that
// bursts on the surface goes up in steam. You come out wet, dripping for a
// while, and a wet body is slow to catch fire. You can drink from any clear
// water. Rain dimples the surface.
(function () {
  const { U } = ECHO;
  const T = () => ECHO.TILE;

  const Wt = ECHO.Water = {
    SURFACE: -0.2,          // the water plane's height in the 3D view
    ripples: [],            // { x, y, r, t, life, size }
    kind(world, x, y) {
      if (x >= 9000) return null;
      const t = ECHO.World.tile(world, Math.floor(x), Math.floor(y));
      const C = ECHO.Climate;
      if (t === T().DEEP) return C && C.frozen(world, x, y, true) ? null : 'deep';
      if (t === T().WATER) {
        if (C && C.frozen(world, x, y, false)) return null;                       // ice underfoot
        if (C && C.swollen(world, x, y) && C.nearDeep(world, x, y)) return 'deep'; // the ford runs deep after the rain
        return 'shallow';
      }
      return null;
    },
    wet(world, x, y) { return !!Wt.kind(world, x, y); },
    ripple(x, y, size = 1, life = 1.1) { if (Wt.ripples.length < 90) Wt.ripples.push({ x, y, t: 0, life, size }); },
    splash(x, y, n = 8, power = 1) {
      for (let i = 0; i < n; i++) ECHO.Combat.fx.push({ kind: 'p', x: x + (Math.random() - 0.5) * 0.4, y: y + (Math.random() - 0.5) * 0.4, vx: (Math.random() - 0.5) * 1.6 * power, vy: (Math.random() - 0.5) * 1.6 * power, t: 0, life: 0.5 + Math.random() * 0.3, color: Math.random() < 0.5 ? '#dff2ff' : '#9fd0e8', size: 2, spark: false });
      Wt.ripple(x, y, 0.8 + power * 0.6, 1.2);
    },
    // ------------------------------------------------------------ every frame
    update(game, dt) {
      const world = game.world, pe = game.pe, pl = game.pl;
      if (!pe || !pl) return;
      for (const r of Wt.ripples) r.t += dt;
      Wt.ripples = Wt.ripples.filter(r => r.t < r.life);
      if (ECHO.Interior.cur) { pe.swimming = false; pe.wading = false; return; }
      // everyone in the water: spray, rings, and fire put out
      for (const e of game.ents) {
        if (e.dead || e.hidden || U.dist(e.x, e.y, pe.x, pe.y) > 26) continue;
        const k = Wt.kind(world, e.x, e.y);
        const was = e._inWater;
        e._inWater = k;
        if (e !== pe) e.swimming = k === 'deep';
        if (!k) continue;
        if (!was && (e.moving || e === pe)) { Wt.splash(e.x, e.y, e === pe && pl.mounted ? 14 : 8, 1); if (U.dist(e.x, e.y, pe.x, pe.y) < 14) ECHO.Sfx.play('splash', { vol: e === pe ? 0.8 : 0.35 }); }
        if (e.burn > 0) { e.burn = 0; ECHO.Combat.burst(e.x, e.y - 0.3, '#e8eef0', 10, 2, 0.8, 3); ECHO.Sfx.play('hiss', { vol: 0.5 }); ECHO.Combat.floater(e.x, e.y - 1.1, 'the flames hiss out', '#cfe8f0'); }
        e._rT = (e._rT || 0) - dt;
        if (e.moving && e._rT <= 0) {
          e._rT = e === pe && pl.mounted ? 0.12 : 0.22;
          Wt.ripple(e.x - Math.cos(e.dir || 0) * 0.3, e.y - Math.sin(e.dir || 0) * 0.3, e === pe && pl.mounted ? 1.3 : 0.8, 1.0);
          if (Math.random() < 0.6) ECHO.Combat.fx.push({ kind: 'p', x: e.x + (Math.random() - 0.5) * 0.4, y: e.y + (Math.random() - 0.5) * 0.4, vx: (Math.random() - 0.5), vy: (Math.random() - 0.5), t: 0, life: 0.4, color: '#dff2ff', size: 2 });
          if (e === pe && Math.random() < 0.35) ECHO.Sfx.play('wade', { vol: pl.mounted ? 0.5 : 0.3 });
        }
      }
      // your free horse in the water
      const h = pl.horseAt;
      if (h && !pl.mounted) { const k = Wt.kind(world, h.x, h.y); if (k && h.v > 0.5 && Math.random() < dt * 6) Wt.ripple(h.x, h.y, 1.2, 1); }
      // you
      const k = pe._inWater;
      pe.wading = k === 'shallow'; pe.swimming = k === 'deep' && !pl.mounted;
      if (k) { pl.wetT = 60; if (pl.wetT0 == null) pl.wetT0 = 0; }
      else if (pl.wetT > 0) {
        pl.wetT -= dt;
        if (Math.random() < dt * (pl.wetT > 40 ? 10 : 3)) ECHO.Combat.fx.push({ kind: 'p', x: pe.x + (Math.random() - 0.5) * 0.5, y: pe.y + (Math.random() - 0.5) * 0.3, vx: 0, vy: 0, t: 0, life: 0.4, color: '#9fd0e8', size: 1.5 });
      }
      if (pe.swimming) Wt.swim(game, dt); else { Wt.drownT = 0; if (Wt.warned && !k) Wt.warned = false; }
      // rain on the water
      if (Wt.rainy(game)) for (let i = 0; i < 6; i++) if (Math.random() < dt * 8) {
        const x = pe.x + (Math.random() - 0.5) * 22, y = pe.y + (Math.random() - 0.5) * 16;
        if (Wt.kind(world, x, y)) Wt.ripple(x, y, 0.25 + Math.random() * 0.2, 0.7);
      }
    },
    rainy(game) {
      const W = ECHO.Weather; if (!W || !W.here) return false;
      try { const t = W.here(game.world, game.pe.x, game.pe.y).today; return t === 'rain' || t === 'storm'; } catch (e) { return false; }
    },
    // Swimming: breath for every stroke, more in armour, and drowning when it runs out.
    swim(game, dt) {
      const pe = game.pe, pl = game.pl, PC = ECHO.PlayerCtl;
      PC.drawing = false; PC.charging = false; PC.heavyHold = false; PC.draw = 0;
      const arm = ECHO.Gear ? ECHO.Gear.def(game.world, pl) : 0;
      const drain = (pe.moving ? 4.5 : 2) * (1 + arm / 40) * (1 - (pl.skills.endurance || 0) / 200);
      pl.stamina = Math.max(0, pl.stamina - drain * dt);
      if (pe.moving && Math.random() < dt * 2.5) { Wt.ripple(pe.x, pe.y, 1, 1); ECHO.Sfx.play('wade', { vol: 0.4, pitch: 0.8 }); }
      if (pl.stamina <= 0.5) {
        Wt.drownT = (Wt.drownT || 0) + dt;
        if (!Wt.warned) { Wt.warned = true; ECHO.UI.toast('You are drowning — get to shallow water!', 'warn', 4); }
        if (Wt.drownT > 0.6) { Wt.drownT = 0; const d = Math.max(2, Math.round(pl.maxHp * 0.06)); ECHO.Combat.damage(pe, d, { type: 'drown' }); Wt.splash(pe.x, pe.y, 6, 0.6); ECHO.Sfx.play('splash', { vol: 0.5, pitch: 0.7 }); }
      } else if (pl.stamina < 25 && !Wt.tired) { Wt.tired = true; ECHO.Combat.floater(pe.x, pe.y - 1.3, 'your arms are tiring…', '#9fd0e8'); }
      if (pl.stamina > 40) Wt.tired = false;
      if (!Wt.told) { Wt.told = true; ECHO.UI.toast('Swimming: no weapons in deep water, and every stroke costs breath (more in heavy armour). Find shallow water before you tire.', 'info', 6); }
    },
    // Movement: what is solid to whom. Shallow water is wadeable by all; deep
    // water is swimmable by you on foot; a horse balks at it.
    blockedFor(e, world, x, y) {
      if (x >= 9000) return ECHO.World.isSolid(world, x, y);
      const ix = Math.floor(x), iy = Math.floor(y), t = ECHO.World.tile(world, ix, iy);
      if (t === T().WATER) { const ww = world.W || 200; return ix < 0 || iy < 0 || ix >= ww || iy >= (world.H || 150) || world.blocked[iy * ww + ix] === 1; }
      if (t === T().DEEP && ((e && e.type === 'player' && !e.mounted) || (ECHO.WildWater && ECHO.WildWater.swimmer(e)) || (ECHO.Climate && ECHO.Climate.frozen(world, x, y, true)))) { const ww = world.W || 200; return ix < 0 || iy < 0 || ix >= ww || iy >= (world.H || 150); }
      if (e && e.aquatic) return true;   // drowners can't leave the water
      return ECHO.World.isSolid(world, x, y);
    },
    // Fire that bursts on the water goes up in steam.
    quench(p) {
      const g = ECHO.Game;
      if (!g || !Wt.wet(g.world, p.x, p.y)) return false;
      for (let i = 0; i < 16; i++) ECHO.Combat.fx.push({ kind: 'smoke', x: p.x + (Math.random() - 0.5) * 1.2, y: p.y + (Math.random() - 0.5) * 1.2, vx: (Math.random() - 0.5) * 0.4, vy: 0, t: 0, life: 1.4 + Math.random(), color: '#e8eef0', size: 3 });
      Wt.splash(p.x, p.y, 12, 1.4);
      ECHO.Sfx.play('hiss', { vol: 0.8 });
      return true;
    },
    // Drinking from clear water.
    interactables(game) {
      const pe = game.pe, pl = game.pl, out = [];
      if (ECHO.Interior.cur || pl.mounted || pe.swimming) return out;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1 && !near; dx++) if (Wt.kind(game.world, pe.x + dx * 1.1, pe.y + dy * 1.1)) near = true;
      if (!near) return out;
      const now = game.time;
      if (!(Wt.drankT > now)) out.push({ kind: 'act', label: 'Drink from the water', d: 1.2, act: () => {
        Wt.drankT = now + 25;
        pl.stamina = Math.min(pl.maxSta, pl.stamina + 35);
        pl.hp = Math.min(pl.maxHp, pl.hp + 4); pe.hp = pl.hp;
        Wt.ripple(pe.x + Math.cos(pe.dir), pe.y + Math.sin(pe.dir), 0.6, 1);
        ECHO.Sfx.play('wade', { vol: 0.5, pitch: 1.3 });
        ECHO.Combat.floater(pe.x, pe.y - 1.2, 'cold, clear water', '#9fd0e8');
      } });
      return out;
    }
  };
})();
