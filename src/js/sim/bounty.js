// Bounties: the day's work on the notice board.
//
// Every town posts three bounties a day — so many of a kind of monster, an
// elite, a dungeon lord, a great beast — paid by a messenger the moment the
// work is done, wherever you are. You can carry three at once; they lapse
// after five days.
(function () {
  const { U } = ECHO;
  const B = ECHO.Bounty = {
    KINDS: ['kill', 'kill', 'elite', 'lord', 'beast'],
    // Today's bounties at a town (the same all day).
    forTown(world, s) {
      const rng = new ECHO.RNG(ECHO.hashStr(s.id + ':' + world.day + ':' + world.seed));
      const near = ECHO.Explore.sites(world).filter(x => x.cat === 'delve' && x.kind !== 'riftdeep').sort((a, b) => U.dist(a.x, a.y, s.x, s.y) - U.dist(b.x, b.y, s.x, s.y)).slice(0, 6);
      const kinds = [...new Set(near.flatMap(x => ((ECHO.Explore.DELVES[x.kind] || {}).roster || []).map(r => r[0])))].filter(k => k !== 'wolf' && k !== 'brigand' && k !== 'wight');
      const lvl = near.length ? Math.round(near.reduce((a, x) => a + ECHO.Explore.level(world, x), 0) / near.length) : 2;
      const out = [];
      for (let i = 0; i < 3; i++) {
        let kind = B.KINDS[rng.int(0, B.KINDS.length - 1)];
        if (kind === 'kill' && !kinds.length) kind = 'elite';
        const id = `b_${s.id}_${world.day}_${i}`;
        if (kind === 'kill') { const sp = kinds[rng.int(0, kinds.length - 1)], n = 4 + rng.int(0, 6); out.push({ id, kind, species: sp, need: n, gold: Math.round(n * (6 + lvl * 3)), xp: n * (6 + lvl * 4), sid: s.id }); }
        else if (kind === 'elite') { const n = 1 + rng.int(0, 2); out.push({ id, kind, need: n, gold: n * (35 + lvl * 10), xp: n * (40 + lvl * 15), sid: s.id }); }
        else if (kind === 'lord') out.push({ id, kind, need: 1, gold: 120 + lvl * 30, xp: 200 + lvl * 60, sid: s.id });
        else out.push({ id, kind, need: 1, gold: 200, xp: 400, sid: s.id });
      }
      return out;
    },
    text(b) {
      const D = ECHO.Monsters && ECHO.Monsters.DEFS;
      if (b.kind === 'kill') return `Kill ${b.need} ${D && D[b.species] ? D[b.species].name.toLowerCase().replace(/^the /, '') + (b.need > 1 && !/s$/.test(D[b.species].name) ? 's' : '') : b.species}`;
      if (b.kind === 'elite') return `Kill ${b.need} elite monster${b.need > 1 ? 's' : ''} (Hulking, Frenzied, Venomous or Ancient)`;
      if (b.kind === 'lord') return 'Slay the lord of any dungeon';
      return 'Slay one of the great beasts in its lair';
    },
    mine(pl) { return (pl.bounties = pl.bounties || []); },
    accept(world, pl, b) {
      const m = B.mine(pl);
      if (m.some(x => x.id === b.id)) return 'You already carry that one.';
      if (m.filter(x => !x.done).length >= 3) return 'You can carry three bounties at once.';
      m.push({ ...b, have: 0, day: world.day, done: false });
      return null;
    },
    // A kill: does it count toward a bounty? Returns the bounties it completed.
    onKill(world, pl, e) {
      const out = [];
      for (const b of B.mine(pl)) {
        if (b.done) continue;
        if (world.day - b.day > 5) { b.done = true; b.lapsed = true; continue; }
        const ok = b.kind === 'kill' ? e.species === b.species : b.kind === 'elite' ? !!e.elite : b.kind === 'lord' ? !!e.boss2 && !e.summoner : b.kind === 'beast' ? e.type === 'boss' : false;
        if (!ok) continue;
        b.have++;
        if (b.have >= b.need) { b.done = true; pl.gold += b.gold; out.push(b); }
      }
      pl.bounties = B.mine(pl).filter(b => !b.done || world.day - b.day < 8);
      return out;
    }
  };
})();
