// How dangerous the land is — fixed, wherever you stand, whatever your level.
//
// The country round the old capitals and the temple is safe (level 1 to a few); the further
// from them, the deadlier, and the harder the ground (hills, swamps, deep forest) the worse,
// and tilled farmland a little safer. A deep wood keeps its own terrible levels, and the
// worlds behind the gates theirs. What lives somewhere is as strong as that place, not as
// strong as you: walk back to the meadows you started in and they are as gentle as they
// were; go far, and the land outgrows you until you outgrow it.
//
// Nothing here is saved: it is read off the map (the old capitals, the regions) every time.
(function () {
  const { U } = ECHO;

  const Dg = ECHO.Danger = {
    MAX: 150,
    // the heartlands: the old capitals and the temple (not a village, not a far land's seat)
    homes(world) {
      const k = world.settlements.length + ':' + world.day;
      if (world._dgH && world._dgH.k === k) return world._dgH.v;
      const v = world.settlements.filter(s => s.kind !== 'village' && !s.frontier && !s.farRealm).map(s => ({ x: s.x, y: s.y }));
      world._dgH = { k, v };
      return v;
    },
    dist(world, ax, ay, bx, by) { return ECHO.Globe && world.globe ? ECHO.Globe.dist(world, ax, ay, bx, by) : U.dist(ax, ay, bx, by); },
    // how far from safety, in the old island's measure
    reach(world, x, y) {
      const H = Dg.homes(world);
      const d = H.length ? Math.min(...H.map(h => Dg.dist(world, h.x, h.y, x, y))) : 40;
      const W0 = (world.frontier && world.frontier.W0) || 200;
      return d / (W0 * 0.065);
    },
    // what the ground adds: hills and swamps and deep forest are worse, farmland gentler
    ground(world, x, y) {
      const r = ECHO.World && ECHO.World.regionAt ? ECHO.World.regionAt(world, x, y) : null;
      if (!r) return 1;
      const fr = k => U.clamp((r[k] || 0) / Math.max(1, r.land || 1), 0, 1);
      return U.clamp(1 + 0.18 * fr('hill') + 0.14 * fr('swamp') + 0.08 * fr('forest') - 0.12 * fr('farm'), 0.85, 1.35);
    },
    // the level of what lives at x, y
    at(world, x, y) {
      const WW = ECHO.Wildwood;
      if (WW && world.wild && WW.tierAt) { const t = WW.tierAt(world, x, y); if (t) return WW.level(world, t); }
      const u = Dg.reach(world, x, y);
      return U.clamp(Math.round((1 + Math.pow(u, 1.25)) * Dg.ground(world, x, y)), 1, Dg.MAX);
    },
    // a region's range, from its middle and its four quarters
    band(world, r) {
      if (!r) return null;
      const C = world._dgR || (world._dgR = {}), k = world.settlements.length;
      const c = C[r.id];
      if (c && c.k === k) return c.v;
      const x0 = r.x0, x1 = r.x1, y0 = r.y0, y1 = r.y1, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      const pts = [[mx, my], [x0 + (x1 - x0) * 0.2, y0 + (y1 - y0) * 0.2], [x1 - (x1 - x0) * 0.2, y0 + (y1 - y0) * 0.2], [x0 + (x1 - x0) * 0.2, y1 - (y1 - y0) * 0.2], [x1 - (x1 - x0) * 0.2, y1 - (y1 - y0) * 0.2]];
      const ls = pts.map(p => Dg.at(world, p[0], p[1]));
      const v = [Math.min(...ls), Math.max(...ls)];
      C[r.id] = { k, v };
      return v;
    },
    // in words, for you
    word(L, me) { const D = ECHO.Prowess ? ECHO.Prowess.diff(L, me) : null; return D ? { word: D.word, color: D.color, k: D.k } : { word: '', color: '#efe3c8' }; },
    // …as a phrase: "easy for you", "an even match for you", "far beyond you"
    phrase(L, me) { const w = Dg.word(L, me); return ({ trivial: 'trivial for you', easy: 'easy for you', even: 'an even match for you', hard: 'hard for you', deadly: 'deadly for you', hopeless: 'far beyond you' })[w.k] || ''; },
    label(world, r, me) {
      const b = Dg.band(world, r);
      if (!b) return '';
      return b[0] === b[1] ? `level ${b[0]}` : `level ${b[0]}–${b[1]}`;
    }
  };
})();
