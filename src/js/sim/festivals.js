// Festivals: four times a year every town that can afford it puts down its
// work and celebrates — the Kindling Fair in Thaw, Lantern Night in Bloom,
// the Harvest Feast and Longnight in Frost. Towns that are starving, sick or
// shut against plague don't; the people remember the years they couldn't.
// Festivals bring people together: friendships warm, couples are betrothed
// at the dance, and the stories of the year are told again.
(function () {
  const { U } = ECHO;
  const P = () => ECHO.People;
  const T = ECHO.TIME;
  const DAY = 8; // the eighth day of each season

  const LIST = [
    { key: 'kindling', season: 0, name: 'the Kindling Fair', title: 'The Kindling Fair', desc: 'the first fires of the year, flower crowns and the spring games', colors: ['#b8e07a', '#ffe08a', '#ff9ad0', '#9ad8ff'], games: true, lanterns: 0.15 },
    { key: 'lanterns', season: 1, name: 'Lantern Night', title: 'Lantern Night', desc: 'paper lanterns carrying wishes up into the summer sky', colors: ['#ffb45a', '#ffd88a', '#ff7a5a', '#ffe2b0'], lanterns: 1 },
    { key: 'harvest', season: 2, name: 'the Harvest Feast', title: 'The Harvest Feast', desc: 'long tables, the last sheaf, music and the archery contest', colors: ['#e8a040', '#c8503a', '#f2d060', '#8ac050'], feast: true, games: true, lanterns: 0.2 },
    { key: 'longnight', season: 3, name: 'Longnight', title: 'Longnight', desc: 'the longest night of the year, kept by the fire until dawn', colors: ['#9fd3ff', '#ffffff', '#c8b0ff', '#ffd88a'], vigil: true, lanterns: 0.3 }
  ];

  const F = ECHO.Festivals = {
    LIST, DAY,
    onDay(day) { const d = T.dateOf(day); return d.dayOfSeason === DAY ? LIST[d.seasonIdx] : null; },
    today(world) { return F.onDay(world.day); },
    // The next festival from today (today's included), and how many days away.
    next(world) {
      for (let k = 0; k <= T.SEASON_DAYS; k++) { const f = F.onDay(world.day + k); if (f) return { f, day: world.day + k, inDays: k }; }
      return null;
    },
    // Does this town keep the festival? (and if not, why not)
    keeps(world, s) {
      if (!s || s.faction === 'ashfang') return { ok: false, why: '' };
      if (s.quarantine) return { ok: false, why: 'the gates are shut against sickness' };
      if ((s.hunger || 0) > 0.45) return { ok: false, why: 'there is no bread to spare' };
      const sick = ECHO.Disease ? ECHO.Disease.sickIn(world, s).length : 0;
      if (sick > 4) return { ok: false, why: 'too many are sick' };
      return { ok: true };
    },
    // Is a festival going on in this town right now?
    liveAt(world, s) {
      const f = F.today(world);
      if (!f || !s) return null;
      const m = world.minute;
      if (m < 16 * 60) return null;
      return F.keeps(world, s).ok ? f : null;
    },
    // Getting ready: decorations go up at noon.
    dressedAt(world, s) {
      const f = F.today(world);
      return f && world.minute >= 11 * 60 && F.keeps(world, s).ok ? f : null;
    },
    dailyTick(world, rng) {
      const f = F.today(world);
      if (!f) return;
      for (const s of world.settlements) {
        if (s.faction === 'ashfang') continue;
        const k = F.keeps(world, s);
        if (!k.ok) {
          if (rng.chance(0.6)) ECHO.Chronicle.add(world, { text: `${s.name} did not keep ${f.name} this year — ${k.why}.`, kind: 'life', importance: s.kind === 'capital' ? 1 : 0, sid: s.id });
          for (const n of P().residents(world, s)) P().remember(world, n, `went without ${f.name}`, 'grief', null, 1);
          continue;
        }
        const res = P().residents(world, s).filter(n => n.status === 'alive');
        // the town comes together
        for (let i = 0; i < Math.min(30, res.length); i++) {
          const a = rng.pick(res), b = rng.pick(res);
          if (a !== b) { P().bond(a, b.id, 4); P().bond(b, a.id, 4); }
        }
        // a betrothal at the dance
        const singles = res.filter(n => !n.spouse && n.prof !== 'child' && P().age(world, n) >= 18 && P().age(world, n) < 50);
        let wed = null;
        for (const a of singles) {
          const b = singles.find(o => o !== a && o.sex !== a.sex && (a.rel[o.id] || 0) > 25 && !o.spouse);
          if (b && rng.chance(0.35)) { P().marry(world, a, b, true); wed = [a, b]; break; }
        }
        const story = wed ? ` ${P().name(wed[0])} and ${P().name(wed[1])} were betrothed at the dance.` : '';
        ECHO.Chronicle.add(world, { text: `${s.name} kept ${f.name}.${story}`, kind: 'life', importance: wed || s.kind === 'capital' ? 1 : 0, sid: s.id, npcs: wed ? wed.map(n => n.id) : [] });
        if (wed && ECHO.Letters) ECHO.Letters.onMarry(world, wed[0], wed[1], f);
        s.festDay = world.day;
      }
    },
    describe(world) {
      const nx = F.next(world);
      if (!nx) return '';
      return nx.inDays === 0 ? `Today is ${nx.f.name}: ${nx.f.desc}.` : nx.inDays === 1 ? `Tomorrow is ${nx.f.name}.` : `${U.cap(nx.f.name)} is in ${nx.inDays} days (${T.fmtDate(nx.day)}).`;
    }
  };
})();
