// The great lands: every region of the world belongs to one of them, by what it is made
// of — the Emerald Expanse of the deep forests, the Ashen Wastes of sand and bare rock,
// the Frozen Crown of the snows, the Forgotten Kingdom where the ruins lie thick, the
// Blighted Lands of the marshes, the Celestial Highlands where islands of rock float
// over the hills, the Abyssal Depths above the caverns, and the farmed Heartlands
// between them. Each has its own beasts abroad, and the hard ones harden you.
//
// The lands are worked out from the ground itself, so any world, old or new, has them.
(function () {
  const { U } = ECHO;
  const UI = () => ECHO.UI;
  const LANDS = {
    emerald: { name: 'the Emerald Expanse', short: 'Emerald Expanse', col: '#5fbf6a', tag: 'Dense forest and ancient trees — predators, venomous things, and dungeons hidden among the roots.',
      roster: [['spider', 3], ['goblin', 2], ['troll', 1]] },
    ashen: { name: 'the Ashen Wastes', short: 'Ashen Wastes', col: '#e07a3a', tag: 'Sand, bare rock and the bones of fortresses — creatures of fire roam here.', harsh: true,
      roster: [['cinderhound', 3], ['golemling', 2], ['slaggolem', 1]] },
    frozen: { name: 'the Frozen Crown', short: 'Frozen Crown', col: '#bfe0ff', tag: 'Endless snowfields and frozen peaks — frost hounds hunt in packs, and the cold kills.', harsh: true,
      roster: [['frosthound', 3], ['wraith', 1], ['troll', 1]] },
    forgotten: { name: 'the Forgotten Kingdom', short: 'Forgotten Kingdom', col: '#c8b48a', tag: 'Ruined towns and broken walls of a kingdom no one remembers — and its dead still keep the watch.',
      roster: [['skeleton', 3], ['skelarcher', 2], ['ghoul', 1], ['wraith', 1]] },
    blighted: { name: 'the Blighted Lands', short: 'Blighted Lands', col: '#9ab84a', tag: 'Marsh and rot, poisoned by what lives in it — the beasts here are not what they were.', harsh: true,
      roster: [['rothound', 3], ['ghoul', 2]] },
    celestial: { name: 'the Celestial Highlands', short: 'Celestial Highlands', col: '#bfa8ff', tag: 'High hills under islands of rock that float in the sky — storm wisps and sun-children ride the wind.',
      roster: [['stormwisp', 3], ['sunling', 2], ['golemling', 1]] },
    abyssal: { name: 'the Abyssal Depths', short: 'Abyssal Depths', col: '#8a7ab8', tag: 'Rough hills over caverns that go down for ever — what lives below comes up at night.',
      roster: [['giantrat', 2], ['golemling', 2], ['spider', 1]], night: true },
    heart: { name: 'the Heartlands', short: 'Heartlands', col: '#e6c06a', tag: 'Fields, roads and towns: as safe as the realm gets.', roster: null }
  };
  const TT = () => ECHO.TILE;
  const La = ECHO.Lands = {
    LANDS,
    // what a region is made of, decided once
    of(world, r) {
      if (!r) return LANDS.heart;
      if (r.lk && LANDS[r.lk]) return LANDS[r.lk];
      const T = TT();
      let n = 0, forest = 0, snow = 0, sand = 0, rock = 0, ruin = 0, swamp = 0, hill = 0, farm = 0;
      for (let y = Math.floor(r.y0); y < r.y1; y += 2) for (let x = Math.floor(r.x0); x < r.x1; x += 2) {
        const t = ECHO.World.tile(world, x, y);
        if (t === T.WATER || t === T.DEEP) continue;
        n++;
        if (t === T.FOREST || t === T.TREE) forest++;
        else if (t === T.SNOW) snow++;
        else if (t === T.SAND) sand++;
        else if (t === T.ROCK) rock++;
        else if (t === T.RUIN || t === T.RUINWALL) ruin++;
        else if (t === T.SWAMP) swamp++;
        else if (t === T.HILL) hill++;
        else if (t === T.FARM || t === T.ROAD || t === T.PLAZA) farm++;
      }
      const f = k => n ? k / n : 0;
      const ruins = (world.ruins || []).filter(o => o.x >= r.x0 && o.x < r.x1 && o.y >= r.y0 && o.y < r.y1).length;
      const delves = (world.sites || []).filter(o => o.cat === 'delve' && o.x >= r.x0 && o.x < r.x1 && o.y >= r.y0 && o.y < r.y1).length;
      // each land that fits makes its claim; the strongest claim wins (none: the Heartlands)
      const P = x => f(x) * 100, claims = [
        ['frozen', P(snow) >= 6 ? P(snow) * 3 : 0],
        ['ashen', P(sand) + P(rock) >= 28 && P(forest) < 20 ? P(sand) + P(rock) * 1.5 : 0],
        ['blighted', P(swamp) >= 12 ? P(swamp) * 2.2 : 0],
        ['forgotten', P(ruin) >= 11 || (ruins >= 2 && P(ruin) >= 6) ? P(ruin) * 2.5 : 0],
        ['abyssal', P(rock) >= 10 && P(hill) >= 15 && delves >= 1 ? P(hill) + P(rock) * 2 : 0],
        ['celestial', P(hill) >= 25 && P(rock) < 10 ? P(hill) : 0],
        ['emerald', P(forest) >= 35 ? P(forest) * 1.2 : 0]
      ].filter(c => c[1] > 0).sort((a, b) => b[1] - a[1]);
      const k = n < 12 ? 'heart' : claims.length ? claims[0][0] : 'heart';
      r.lk = k;
      return LANDS[k];
    },
    at(world, x, y) {
      if (x >= 9000) return null;
      // (round the poles one land: going over the top you don't step from one into another)
      if (world.globe && (y < 44 || y > world.H - 44)) return La.LANDS.frozen;
      return La.of(world, ECHO.World.regionAt(world, x, y));
    },
    key(land) { return Object.keys(LANDS).find(k => LANDS[k] === land); },

    // ------------------------------------------------------------ each frame
    update(game, dt) {
      const pe = game.pe, world = game.world;
      if (!pe || ECHO.Interior.cur || (game.pl && game.pl.flying)) return;
      if ((La._t = (La._t || 0) - dt) > 0) return;
      La._t = 1;
      const land = La.at(world, pe.x, pe.y);
      if (!land) return;
      // crossing into a new land: its name, once you are well in
      if (land !== La._cur) {
        La._cand = La._cand === land ? La._cand : land; La._candT = (La._cand === land ? (La._candT || 0) : 0) + 1;
        if (La._candT >= 3) {
          const first = !La._cur;
          La._cur = land; La._candT = 0;
          if (!first) UI().banner(U.cap(land.name), land.tag, true);
          const seen = game.pl.lands = game.pl.lands || {};
          const k = La.key(land);
          if (!seen[k]) { seen[k] = game.world.day; if (!first && land.roster) UI().toast(`You have come into ${land.name}. ${land.tag}`, 'legend', 7); }
        }
      } else La._candT = 0;
      La.wanderers(game, land);
    },
    // its beasts, abroad: a few at a time, out of sight at first, never near a town
    wanderers(game, land) {
      const pe = game.pe, world = game.world;
      for (const e of game.ents) if (e.landOf && !e.dead && U.dist(e.x, e.y, pe.x, pe.y) > 75) { e.dead = true; e.vanish = true; }
      if (!land.roster || (La._spawnT = (La._spawnT || 0) - 1) > 0) return;
      const night = game.isNight && game.isNight();
      if (land.night && !night) return;
      La._spawnT = night ? 14 : 24;
      const near = game.ents.filter(e => e.landOf && !e.dead).length;
      if (near >= (night ? 8 : 5)) return;
      if (world.settlements.some(s => U.dist(s.x, s.y, pe.x, pe.y) < 22)) return;
      // somewhere out of sight, on the same land
      let spot = null;
      for (let i = 0; i < 30 && !spot; i++) {
        const a = Math.random() * Math.PI * 2, d = 20 + Math.random() * 14;
        const x = pe.x + Math.cos(a) * d, y = pe.y + Math.sin(a) * d;
        if (x < 3 || y < 3 || x > world.W - 4 || y > world.H - 4) continue;
        if ((i < 18 && La.at(world, x, y) !== land) || world.settlements.some(s => U.dist(s.x, s.y, x, y) < 18)) continue;
        spot = ECHO.Ent.freeSpot(world, x, y, 4);
      }
      if (!spot) return;
      const lvl = ECHO.Explore ? ECHO.Explore.level(world, { x: spot.x, y: spot.y, kind: 'grot' }) : 3;
      const tot = land.roster.reduce((a, r) => a + r[1], 0);
      let r = Math.random() * tot, kind = land.roster[0][0];
      for (const [k, w] of land.roster) { r -= w; if (r <= 0) { kind = k; break; } }
      if (!ECHO.Monsters.DEFS[kind]) return;
      const n = 1 + Math.floor(Math.random() * (kind === 'troll' || kind === 'slaggolem' ? 1 : 3));
      for (let i = 0; i < n; i++) {
        const p = ECHO.Ent.freeSpot(world, spot.x + (Math.random() - 0.5) * 3, spot.y + (Math.random() - 0.5) * 3, 3);
        if (!p) continue;
        const m = ECHO.Monsters.make(game, kind, p.x, p.y, lvl + Math.floor(Math.random() * 3), { eliteChance: 0.08 });
        m.gab = {}; m.home = { x: p.x, y: p.y }; m.landOf = La.key(land);
        game.addEnt(m);
      }
    }
  };
})();
