// Rivals: other adventurers, out in the same world.
//
// Four of them, each with a name, a trade and a temper. They go down into the
// dungeons too — sometimes they get there first and clear a place before you
// do, sometimes they come back richer and stronger, and sometimes they do not
// come back at all, and someone new takes up the life.
(function () {
  const { U } = ECHO;
  const P = () => ECHO.People;
  const EPITHETS = ['the Bold', 'Quickblade', 'the Grey', 'Ironhand', 'the Lucky', 'Two-Bows', 'the Silent', 'Bonebreaker', 'the Red', 'Lanternborn', 'Half-Hand', 'the Patient'];
  const Rv = ECHO.Rivals = {
    list(world) { return (world.rivals = world.rivals || []); },
    ensure(world, rng) {
      const L = Rv.list(world);
      const alive = L.filter(r => r.alive);
      for (let i = alive.length; i < 4; i++) {
        const pool = P().alive(world).filter(n => ['wanderer', 'guard', 'hunter'].includes(n.prof) && P().age(world, n) >= 18 && P().age(world, n) < 50 && !n.rival && n.id !== (world.player && world.player.companion) && !n.title);
        if (!pool.length) break;
        const n = pool[rng.int(0, pool.length - 1)];
        const r = { id: n.id, name: `${n.first} ${n.last}`, epithet: EPITHETS[rng.int(0, EPITHETS.length - 1)], cls: n.prof === 'hunter' ? 'hunter' : 'sellsword', lv: 1 + rng.int(0, 2), renown: rng.int(0, 15), cleared: 0, lords: 0, alive: true, since: world.day, last: null };
        n.rival = true;
        L.push(r);
      }
    },
    dailyTick(world) {
      // their own dice, so they never disturb the rest of the world's
      const rng = new ECHO.RNG(ECHO.hashStr('rivals:' + world.seed + ':' + world.day));
      Rv.ensure(world, rng);
      const pl = world.player;
      for (const r of Rv.list(world)) {
        if (!r.alive) continue;
        const n = world.npcs[r.id];
        if (!n || n.status !== 'alive') { r.alive = false; continue; }
        if (!rng.chance(0.03)) continue;
        // pick a dungeon at about their strength that no one has cleared
        const sites = ECHO.Explore.sites(world).filter(s => s.cat === 'delve' && s.kind !== 'riftdeep' && !s.cleared && ECHO.Explore.level(world, s) <= r.lv + 1);
        if (!sites.length) continue;
        const s = sites[rng.int(0, sites.length - 1)];
        if (pl && ECHO.Game && ECHO.Interior && ECHO.Interior.cur && ECHO.Interior.cur.site === s) continue;
        const L = ECHO.Explore.level(world, s), roll = rng.next() + (r.lv - L) * 0.12;
        r.last = { site: s.id, d: world.day };
        if (roll > 0.38) {
          s.cleared = true; s.clearedDay = world.day; s.clearedBy = r.name; s.chestTaken = true;
          r.cleared++; r.renown += 4 + L * 2; if (rng.chance(0.5)) r.lv = Math.min(15, r.lv + 1);
          if (ECHO.Explore.floors(s) >= 3) r.lords++;
          ECHO.Chronicle.add(world, { text: `${r.name} ${r.epithet} came up out of ${s.name} with its treasure — the place is quiet now.`, kind: 'deed', importance: s.found ? 2 : 1, x: s.x, y: s.y });
        } else if (roll < 0.06) {
          r.alive = false; r.diedAt = s.id;
          P().kill(world, n, `lost in ${s.name}`, null, null);
          ECHO.Chronicle.add(world, { text: `${r.name} ${r.epithet} went down into ${s.name} and did not come back.`, kind: 'death', importance: 2, x: s.x, y: s.y });
        } else ECHO.Chronicle.add(world, { text: `${r.name} ${r.epithet} was driven out of ${s.name}, bleeding, and swore to go back.`, kind: 'deed', importance: 1, x: s.x, y: s.y });
      }
    },
    // The standings, you among them.
    board(world, pl) {
      const rows = Rv.list(world).filter(r => r.alive).map(r => ({ name: `${r.name} ${r.epithet}`, lv: r.lv, renown: r.renown, cleared: r.cleared, you: false }));
      if (pl && ECHO.Prowess) rows.push({ name: `${pl.first} ${pl.last} (you)`, lv: ECHO.Prowess.level(pl), renown: Math.round(pl.renown || 0), cleared: (pl.stats && pl.stats.delves) || 0, you: true });
      return rows.sort((a, b) => b.lv * 20 + b.renown + b.cleared * 10 - (a.lv * 20 + a.renown + a.cleared * 10));
    }
  };
})();
