// The arsenal of the realm: magic and steel, always advancing.
//
// Every crown keeps scholars, battle-mages and smiths at work on the arts of war, and the bigger
// and richer it is, the faster they go: a capital's academies and forges outrun a far duchy's
// one workshop. What they learn is the realm's research, counted in levels, and it is the level
// its soldiers are trained and armed to: the capital's garrison at the full of it, a city's a
// little under, a town's less, a village's watch far less.
//
// What they work toward is whatever they must be able to stand against — the age itself, the
// armies of their enemies, and you: a hero whose name is known across the world is a power every
// crown arms against, and one who has spilled their blood is one they arm against in earnest
// (twice as fast, and past your level). It takes days, not a moment; nothing un-learns.
//
// The research arms them in tiers — iron, steel, runed steel, spellforged, aetherplate, sunsteel,
// starforged, riftforged — each harder to cut, harder-hitting, warded against spells; from runed
// steel a quarter of every garrison are battle-mages; from spellforged their wards hold off the
// first blows, the towers of the great towns strike at an enemy in their streets, and the realm's
// scryers can find one who has wronged it anywhere in the world and send hunters after them.
//
// It all keeps in `world.arsenal`, made the first time it is needed: an old world arms at once, to
// where it would be (its scholars were at work all along).
(function () {
  const { U } = ECHO;
  const P = () => ECHO.People;

  const TIERS = [
    { at: 0, name: 'Iron', col: '#a8acb4' },
    { at: 40, name: 'Steel', col: '#d4d8e0' },
    { at: 90, name: 'Runed steel', col: '#9cc4ff' },
    { at: 160, name: 'Spellforged', col: '#b89aff' },
    { at: 260, name: 'Aetherplate', col: '#7affd8' },
    { at: 400, name: 'Sunsteel', col: '#ffd884' },
    { at: 600, name: 'Starforged', col: '#bfe8ff' },
    { at: 900, name: 'Riftforged', col: '#ff8ae0' }
  ];

  const Ar = ECHO.Arsenal = {
    TIERS,
    MAGES: 2, WARDS: 3, TOWERS: 3, SCRY: 3, HEAL: 4,
    st(world) { return world.arsenal || (world.arsenal = { v: 1, realms: {}, log: [] }); },
    powers(world) { return Object.values(world.factions).filter(f => !f.fallen && (f.type === 'kingdom' || f.type === 'order')); },
    rs(world, f) {
      const S = Ar.st(world);
      let R = S.realms[f.id];
      if (!R) {
        // a realm from before: its scholars and smiths were at work all along — it arms at once, to where it would be
        R = S.realms[f.id] = { lv: 0, harm: 0, since: world.day, tierSaid: 0 };
        R.lv = Ar.target(world, f);
        R.tierSaid = Ar.tierAt(R.lv);
      }
      return R;
    },
    // a world from before the realms armed: they arm now, once, as the game starts (not at the next midnight)
    ensure(world) {
      const S = Ar.st(world);
      if (S.armed) return;
      S.armed = world.day;
      const mine = new Set();
      for (const f of Ar.powers(world)) { Ar.rs(world, f); mine.add(f.id); }
      Ar.arm(world, mine);
    },
    lv(world, fid) { const f = world.factions[fid]; return f && (f.type === 'kingdom' || f.type === 'order') && !f.fallen ? Ar.rs(world, f).lv : 0; },
    tierAt(lv) { let t = 0; while (t + 1 < TIERS.length && lv >= TIERS[t + 1].at) t++; return t; },
    tier(world, fid) { return Ar.tierAt(Ar.lv(world, fid)); },
    tierName(t) { return TIERS[U.clamp(t | 0, 0, TIERS.length - 1)].name; },
    // ------------------------------------------------------------ what they arm against
    // a hero known across the world (or one who has wronged them) is a power every crown arms against
    known(world, f) {
      const pl = world.player;
      if (!pl) return false;
      return (pl.renown || 0) >= 40 || (pl.wanted && pl.wanted[f.id] > 0) || Ar.rs0(world, f).harm > 0;
    },
    rs0(world, f) { const S = Ar.st(world); return S.realms[f.id] || { harm: 0 }; },
    threat(world, f) {
      // (left alone, a realm keeps pace with the age, much as its soldiers always have; it is a threat that drives it on)
      let t = ECHO.Powers ? ECHO.Powers.age(world) * 0.85 : 10;
      const pl = world.player, plv = pl && ECHO.Prowess ? ECHO.Prowess.level(pl) : 0;
      if (plv && Ar.known(world, f)) t = Math.max(t, plv * (Ar.rs0(world, f).harm > 0 || (pl.wanted && pl.wanted[f.id] >= 40) ? 1.05 : 0.95));
      // the armies of those it is at war with
      for (const id of Object.keys(f.atWar || {})) {
        const g = world.factions[id];
        if (!g || !f.atWar[id] || g.fallen) continue;
        const m = ECHO.Military && ECHO.Military.marshal ? ECHO.Military.marshal(world, g) : null;
        if (m) t = Math.max(t, (ECHO.Powers ? ECHO.Powers.lvOf(m) : 1) * 0.9);
      }
      return t;
    },
    target(world, f) { return Math.min(ECHO.Powers ? ECHO.Powers.MAX_LV : 1500, Math.round(Ar.threat(world, f) * Ar.reach(world, f))); },
    // how far a crown's academies can go at all: a great kingdom of many towns all the way, a duchy of
    // one town a good way short of it (a holy order's scholars punch above its size; so do the arcane)
    reach(world, f) {
      let towns = 0;
      for (const s of world.settlements) if (s.faction === f.id) towns++;
      let k = 0.72 + 0.07 * Math.min(4, towns) + (f.type === 'order' ? 0.1 : 0) + (f.tech && f.tech.path === 'arcane' ? 0.05 : 0);
      return Math.min(1, k);
    },
    // how fast its scholars and forges go: its great towns, its wealth, and whether it is threatened
    pace(world, f, R) {
      let big = 0, towns = 0;
      for (const s of world.settlements) {
        if (s.faction !== f.id) continue;
        towns++;
        if (s.kind === 'capital' || s.kind === 'temple' || f.capital === s.id || s.milTier === 'city') big++;
      }
      let k = 0.02 + 0.014 * Math.min(4, big) + 0.004 * Math.min(10, towns);
      k *= 0.7 + Math.min(0.6, (f.treasury || 0) / 4000);
      if (R.harm > 0 || Object.keys(f.atWar || {}).some(id => f.atWar[id])) k *= 2;
      if (f.tech && f.tech.path === 'arcane') k *= 1.15;
      return Math.min(0.2, k);
    },
    // ------------------------------------------------------------ a day
    dailyTick(world, rng) {
      const S = Ar.st(world), mine = new Set();
      for (const f of Ar.powers(world)) {
        mine.add(f.id);
        const R = Ar.rs(world, f), T = Ar.target(world, f);
        if (T > R.lv) {
          const up = Math.max(1, Math.round((T - R.lv) * Ar.pace(world, f, R)));
          R.lv = Math.min(T, R.lv + up);
          f.treasury = Math.max(0, (f.treasury || 0) - Math.min(40, up * 0.5));   // (the academies and forges are paid for)
        }
        R.harm = Math.max(0, R.harm * 0.9 - 0.05);
        const t = Ar.tierAt(R.lv);
        if (t > (R.tierSaid || 0)) { R.tierSaid = t; Ar.note(world, f, t); }
      }
      Ar.arm(world, mine);
      void rng; void S;
    },
    note(world, f, t) {
      const S = Ar.st(world), cap = ECHO.Sim.settlement(world, f.capital), T = TIERS[t];
      const what = [
        '', 'its smiths forge good steel for every soldier',
        'its armourers cut runes into the steel, and a quarter of its soldiers now carry battle-mages\' wands',
        'its forges are worked with spells: its soldiers wear wards that turn the first blows, the towers of its great towns are raised, and its scryers can find its enemies anywhere',
        'aether runs in its armour now, and its battle-mages can mend the wounded in the field',
        'its soldiers go armoured in sunsteel', 'its soldiers go armoured in starforged plate', 'its soldiers go armoured in riftforged plate, from beyond the world'][t] || '';
      const text = `The academies and forges of ${f.short}${cap && cap.name !== f.short ? ` at ${cap.name}` : ''} have reached ${T.name.toLowerCase()}: ${what}.`;
      S.log.push({ d: world.day, f: f.id, t, text }); if (S.log.length > 40) S.log.shift();
      if (ECHO.Chronicle) ECHO.Chronicle.add(world, { text, kind: 'era', importance: t >= 3 ? 2 : 1, sid: f.capital });
      if (ECHO.Realms && ECHO.Realms.note) ECHO.Realms.note(world, text, t >= 3 ? 2 : 1);
    },
    // ------------------------------------------------------------ the garrisons
    // what a town's soldiers are trained to: the realm's research, less the further from its heart
    // (the rank and file a step or two under the research — its arms make up the rest — the officers
    // nearer it, and the Marshal and the Champion at it)
    share(world, s, f) {
      if (!s) return 0.4;
      if (f && f.capital === s.id) return 0.92;
      if (s.kind === 'capital') return 0.92;
      if (s.kind === 'temple') return 0.82;
      const tier = s.milTier || (ECHO.Military && ECHO.Military.tier ? ECHO.Military.tier(world, s) : 'village');
      return tier === 'city' ? 0.85 : tier === 'town' ? 0.7 : 0.42;
    },
    soldierLv(world, n) {
      const f = world.factions[n.faction];
      if (!f || !(f.type === 'kingdom' || f.type === 'order') || f.fallen) return 0;
      const s = n.home && ECHO.Sim.settlement(world, n.home);
      return Math.round(Ar.lv(world, f.id) * Ar.share(world, s, f) * (1 + 0.06 * Math.min(3, n.rank || 0)));
    },
    fighter(n) { return !!n && n.status === 'alive' && !n.ng && (n.soldier || n.prof === 'guard') && n.prof !== 'child'; },
    // the soldiers are trained and armed up to it: a good part of the way each day (the officers and
    // the Marshal and Champion above it)
    arm(world, mine) {
      for (const id in world.npcs) {
        const n = world.npcs[id];
        if (!mine.has(n.faction) || !Ar.fighter(n)) continue;
        const T = n.title === 'Marshal' || n.title === 'Champion' ? Ar.lv(world, n.faction) : Ar.soldierLv(world, n);
        const lv = ECHO.Delvers ? ECHO.Delvers.lv(n) : (n.lv || 1);
        if (T > lv) {
          const first = !n.armed;
          n.lv = first ? T : Math.round(lv + (T - lv) * 0.3);
          n.armed = 1;
          n.skill.fight = Math.min(100, (n.skill.fight || 0) + 1);
        }
      }
    },
    // a soldier or a townsman of theirs struck down by you: the realm arms against you in earnest
    harmed(world, fid, n) {
      const f = world.factions[fid];
      if (!f || !(f.type === 'kingdom' || f.type === 'order') || f.fallen) return;
      const R = Ar.rs(world, f);
      R.harm = Math.min(60, (R.harm || 0) + (n && Ar.fighter(n) ? 1 : 0.6));
      R.lastHarm = world.day;
    },
    // ------------------------------------------------------------ shown
    line(world, f) {
      const R = Ar.rs(world, f), t = Ar.tierAt(R.lv), T = TIERS[t];
      const bits = [];
      if (t >= Ar.MAGES) bits.push('battle-mages');
      if (t >= Ar.WARDS) bits.push('warded soldiers');
      if (t >= Ar.TOWERS) bits.push('spell towers');
      if (t >= Ar.SCRY) bits.push('scryers');
      return `<span style="color:${T.col}">⚙ ${T.name}</span> · research ${R.lv}${Ar.target(world, f) > R.lv ? ` <span class="dim">(working toward ${Ar.target(world, f)})</span>` : ''}${bits.length ? ' · ' + bits.join(', ') : ''}${R.harm >= 1 ? ' · <span class="ember">arming against you</span>' : ''}`;
    }
  };
  void P;
})();
