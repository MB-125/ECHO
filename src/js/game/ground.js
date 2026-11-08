// The lie of the land: how high the ground is anywhere, and which way it falls.
//
// The 3D view lifts the hills, sinks the river beds and leaves the streets flat; what rolls,
// slides or walks in the world now goes by the same ground. With the view running, the
// ground is the view's own (so a barrel rolls down the very slope you see); without it
// (on a server, in the tests), it is worked out the same way from the tiles.
(function () {
  const { U } = ECHO;
  const T = () => ECHO.TILE;
  let BASE = null, FLAT = null;
  const base = () => {
    if (BASE) return BASE;
    const t = T();
    BASE = {
      [t.DEEP]: -0.75, [t.WATER]: -0.45, [t.SAND]: -0.04, [t.GRASS]: 0, [t.FOREST]: 0.03, [t.TREE]: 0.04,
      [t.HILL]: 0.45, [t.ROCK]: 1.7, [t.FARM]: -0.01, [t.ROAD]: -0.02, [t.SWAMP]: -0.08, [t.SNOW]: 0.55,
      [t.RUIN]: 0.02, [t.BRIDGE]: -0.45, [t.PLAZA]: 0, [t.RUINWALL]: 0.02
    };
    FLAT = new Set([t.ROAD, t.PLAZA, t.BRIDGE, t.FARM, t.RUIN]);
    return BASE;
  };
  const Gd = ECHO.Ground = {
    // (tests and tools may put their own ground here: fn(x, y) → height)
    fn: null,
    view(world) { const R = ECHO.Renderer3D; return R && R.hc && R.world === world ? R : null; },
    corner(world, cx, cy) {
      const B = base(), t0 = T();
      let s = 0, flat = false, rocks = 0, wet = false;
      for (let k = 0; k < 4; k++) {
        const t = ECHO.World.tile(world, cx - (k & 1 ? 0 : 1), cy - (k & 2 ? 0 : 1));
        s += B[t] != null ? B[t] : 0;
        if (FLAT.has(t)) flat = true;
        if (t === t0.ROCK) rocks++;
        if (t === t0.WATER || t === t0.DEEP || t === t0.BRIDGE) wet = true;
      }
      let h = s / 4;
      const hash = ECHO.hash2 || (() => 0.5);
      if (rocks === 4) h = 1.7 + hash(cx, cy, (world.seed || 0) + 9) * 0.9;
      if (!flat && !wet) h += (hash(cx, cy, (world.seed || 0) + 4) - 0.5) * (h > 0.3 ? 0.25 : 0.08);
      if (flat && !wet) h = Math.max(h, -0.03) * 0.5;
      return h;
    },
    // the ground's height here (the dry floor: under water, the bank's level; see bed())
    h(world, x, y) {
      if (Gd.fn) return Gd.fn(x, y);
      if (!world || x >= 9000) return 0;
      const R = Gd.view(world);
      if (R) return R.groundH(x, y);
      if (ECHO.World.tile(world, x, y) === T().BRIDGE) return 0.05;
      const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
      const a = Gd.corner(world, ix, iy), b = Gd.corner(world, ix + 1, iy), c = Gd.corner(world, ix, iy + 1), d = Gd.corner(world, ix + 1, iy + 1);
      return Math.max(-0.05, U.lerp(U.lerp(a, b, fx), U.lerp(c, d, fx), fy));
    },
    // how much the lie of the land helps or hinders a step this way (dx, dy: the way; any length):
    // uphill slow going (to a little over half pace up the steepest), downhill a little quicker
    slopeMul(world, x, y, dx, dy) {
      if (!world || x >= 9000) return 1;
      const l = Math.hypot(dx, dy);
      if (l < 1e-6) return 1;
      const g = Gd.grad(world, x, y), up = (g.x * dx + g.y * dy) / l;
      return up > 0 ? Math.max(0.55, 1 - 0.65 * up) : Math.min(1.15, 1 - 0.3 * up);
    },
    // which way it falls, and how steeply: the rise per league along x and along y
    _g: { x: 0, y: 0 },
    grad(world, x, y, o) {
      o = o || Gd._g;
      const e = 0.2;
      o.x = (Gd.h(world, x + e, y) - Gd.h(world, x - e, y)) / (2 * e);
      o.y = (Gd.h(world, x, y + e) - Gd.h(world, x, y - e)) / (2 * e);
      return o;
    }
  };
})();
