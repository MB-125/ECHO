// Exploration: places worth walking to, and quests that send you there.
//
// Landmarks — standing stones, lookouts, moonwells, great oaks, old
// battlefields, wayside shrines, wrecks — each with a name, a story and
// something to find. Delves — barrows of the old people, wolf dens,
// smugglers' hideouts, sunken crypts — that can be entered and fought
// through, with a chest at the end. And the quests the towns post about
// them: things coming out of the barrow at night, a child lost in the woods,
// a great wolf with a name, a treasure map, a delivery to the masons.
(function () {
  const { U, RNG } = ECHO;
  const P = () => ECHO.People;
  const S = () => ECHO.Sim;

  const LANDMARKS = {
    stones: { label: 'Standing stones', names: ['the Grey Sisters', 'the Nine Maidens', 'the Hollow Ring', 'the Whispering Stones', 'the Stone Choir'], desc: 'A ring of tall stones, older than any kingdom. Their faces are carved with the old runes.' },
    lookout: { label: 'Lookout', names: ['Hawk\'s Perch', 'the Watcher\'s Seat', 'Windy Crag', 'the Far Look'], desc: 'A high place with a view of half the land.' },
    moonwell: { label: 'Moonwell', names: ['the Moonwell', 'the Silver Spring', 'the Lady\'s Well'], desc: 'A spring whose water glows faintly after dark. They say it heals.' },
    oak: { label: 'Great oak', names: ['the Elder Oak', 'the Hanging Tree', 'Old Grandfather', 'the Council Oak'], desc: 'A tree so old and wide that a family could live in its hollow.' },
    battlefield: { label: 'Old battlefield', names: ['the Field of Crows', 'Bloodmere Field', 'the Broken Shields'], desc: 'Rusted blades and bleached bones in the grass. No one farms here.' },
    wayshrine: { label: 'Wayside shrine', names: ['the Wayfarer\'s Shrine', 'the Pilgrim\'s Rest', 'the Little Flame'], desc: 'A tiny roadside shrine with a lamp that someone keeps lit.' },
    wreck: { label: 'Wreck', names: ['the Sunken Barge', 'the Drowned Cart', 'the Old Ferry'], desc: 'A wreck half-sunk in the shallows. Something might still be in it.' }
  };
  const DELVES = {
    barrow: { label: 'Barrow', names: ['the King\'s Barrow', 'the Sleeping Mound', 'the Barrow of Nine', 'the Low Barrow'], desc: 'A grass-grown mound with a stone door. The old people buried their kings here — and something still guards them.', foes: 'wight', boss: 'barrow-king' },
    cave: { label: 'Wolf den', names: ['the Dark Den', 'Fang Hollow', 'the Bone Cave', 'Greyhowl Cave'], desc: 'A cave mouth littered with bones. The smell of wolf is strong.', foes: 'wolf', boss: 'den-mother' },
    hideout: { label: 'Smugglers\' hideout', names: ['the Rat\'s Nest', 'Smuggler\'s Cut', 'the Low Cellar', 'Crooked Hole'], desc: 'A hidden cellar dug into a bank, with crates stacked inside. Smugglers use it, when they are not cutting throats.', foes: 'brigand', boss: 'smuggler-chief' },
    crypt: { label: 'Sunken crypt', names: ['the Drowned Chapel', 'the Sunken Crypt', 'the Lost Shrine'], desc: 'The roof of an old shrine pokes out of the ground. Stairs lead down into the dark.', foes: 'wight', boss: 'crypt-warden' }
  };
  const BEAST_NAMES = ['Greymaw', 'Old Ragged', 'Nightjaw', 'the Widowmaker', 'Bloodfang', 'Ashpelt', 'Moonhowl'];

  const X = ECHO.Explore = {
    LANDMARKS, DELVES,
    sites(world) {
      if (!world.sites) X.place(world);
      if (!world._wild && ECHO.Discover) ECHO.Discover.ensure(world);
      return world.sites;
    },
    place(world) {
      const rng = new RNG((world.seed ^ 0x7a11) >>> 0);
      const T = ECHO.TILE;
      const sites = world.sites = [];
      const used = new Set();
      const far = (x, y, d) => world.settlements.every(s => U.dist(s.x, s.y, x, y) > d) && world.camps.every(c => U.dist(c.x, c.y, x, y) > 9) && world.lairs.every(l => U.dist(l.x, l.y, x, y) > 10) &&
        world.ruins.every(r => U.dist(r.x, r.y, x, y) > 8) && sites.every(o => U.dist(o.x, o.y, x, y) > 16) && (!world.wonders || !world.wonders.echoes || world.wonders.echoes.every(e => U.dist(e.x, e.y, x, y) > 9));
      const near = (x, y, r, set) => { let n = 0; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (set.includes(ECHO.World.tile(world, x + dx, y + dy))) n++; return n; };
      const want = [
        ['landmark', 'stones', 2], ['landmark', 'lookout', 2], ['landmark', 'moonwell', 1], ['landmark', 'oak', 1], ['landmark', 'battlefield', 1], ['landmark', 'wayshrine', 2], ['landmark', 'wreck', 1],
        ['delve', 'barrow', 2], ['delve', 'cave', 2], ['delve', 'hideout', 1], ['delve', 'crypt', 1]
      ];
      const scale = ECHO.World.scale ? ECHO.World.scale(world) : 1;
      for (const [cat, kind, n0] of want) for (let k = 0, n = n0 * scale; k < n; k++) {
        let best = null, bs = -Infinity;
        for (let i = 0; i < 700; i++) {
          const x = rng.int(8, world.W - 9), y = rng.int(8, world.H - 9);
          const t = ECHO.World.tile(world, x, y);
          if (![T.GRASS, T.FOREST, T.HILL, T.SAND, T.SNOW, T.SWAMP].includes(t) || ECHO.World.isSolid(world, x + 0.5, y + 0.5)) continue;
          if (!far(x, y, kind === 'wayshrine' ? 10 : 15)) continue;
          let sc = rng.next() * 2;
          if (kind === 'lookout') sc += near(x, y, 3, [T.HILL, T.ROCK, T.SNOW]) * 0.3;
          if (kind === 'wreck' || kind === 'moonwell') sc += near(x, y, 2, [T.WATER]) * 0.5 - (near(x, y, 2, [T.WATER]) ? 0 : 5);
          if (kind === 'oak' || kind === 'cave') sc += near(x, y, 3, [T.TREE, T.FOREST]) * 0.2;
          if (kind === 'wayshrine') sc += near(x, y, 2, [T.ROAD]) * 1.2 - (near(x, y, 3, [T.ROAD]) ? 0 : 4);
          if (kind === 'barrow' || kind === 'stones') sc += world.ruins.some(r => U.dist(r.x, r.y, x, y) < 25) ? 2 : 0;
          if (kind === 'hideout') sc += world.roads.length ? 1 : 0;
          if (sc > bs) { bs = sc; best = { x, y }; }
        }
        if (!best) continue;
        const def = cat === 'landmark' ? LANDMARKS[kind] : DELVES[kind];
        let name = def.names.find(n0 => !used.has(n0));
        if (!name) { const reg = ECHO.World.regionAt(world, best.x, best.y); name = `the ${def.label.toLowerCase()} of ${reg ? reg.name.replace(/^the /, 'the ') : 'the wilds'}`; }
        used.add(name);
        // a little room around it
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const t = ECHO.World.tile(world, best.x + dx, best.y + dy); if (t === T.TREE) ECHO.World.setTile(world, best.x + dx, best.y + dy, T.FOREST); }
        sites.push({ id: 'site' + sites.length, cat, kind, name, x: best.x + 0.5, y: best.y + 0.5, found: false, cleared: false, used: {} });
      }
      ECHO.World.rebuildBlocked(world);
      world._tileEpoch = (world._tileEpoch || 0) + 1;
    },
    byId(world, id) { return X.sites(world).find(s => s.id === id); },
    def(site) { return site.cat === 'wonder' ? ECHO.Discover.WONDERS[site.kind] : (site.cat === 'landmark' ? LANDMARKS : DELVES)[site.kind]; },
    label(site) { return X.def(site).label; },
    desc(site) { return X.def(site).desc; },
    title(site) { return U.cap(site.name); },
    // delves fill up again with time
    refill(world, site) {
      if (site.cat !== 'delve' || !site.cleared || world.day - site.clearedDay < 40) return false;
      site.cleared = false; site.chestTaken = false; site.round = (site.round || 0) + 1;
      return true;
    },

    // ------------------------------------------------------------ quests about places
    dailyTick(world, rng) {
      const sites = X.sites(world);
      for (const s of sites) X.refill(world, s);
      if (!world.player) return;
      const open = world.plights.filter(p => p.status === 'open');
      for (const t of world.settlements) {
        if (t.faction === 'ashfang') continue;
        const mine = open.filter(p => p.sid === t.id);
        if (mine.length >= 3 || !rng.chance(0.05)) continue;
        const r = rng.next();
        const res = P().residents(world, t).filter(n => n.status === 'alive');
        // a delve nearby is trouble
        const delve = sites.filter(s => s.cat === 'delve' && !s.cleared && U.dist(s.x, s.y, t.x, t.y) < 45).sort((a, b) => U.dist(a.x, a.y, t.x, t.y) - U.dist(b.x, b.y, t.x, t.y))[0];
        if (r < 0.3 && delve && !open.some(p => p.kind === 'delve' && p.siteId === delve.id)) {
          const asker = rng.pick(res.filter(n => n.prof !== 'child')) || null;
          const what = { barrow: 'pale things walking out of', cave: 'wolves without number coming out of', hideout: 'cutthroats using', crypt: 'lights and voices in' }[delve.kind];
          ECHO.Plights.post(world, { kind: 'delve', sid: t.id, requester: asker ? asker.id : null, siteId: delve.id, deadline: world.day + 18, reward: 70 + rng.int(0, 50),
            text: `${asker ? asker.first + ' swears they have seen' : 'People have seen'} ${what} ${delve.name}${delve.found ? '' : ` — somewhere ${X.dirFrom(t, delve)} of ${t.name}`}. Someone should go in and put an end to it.` });
          continue;
        }
        // a child (or a hunter) lost in the woods
        if (r < 0.5) {
          const who = rng.pick(res.filter(n => (n.prof === 'child' && P().age(world, n) > 6) || n.prof === 'hunter' || n.prof === 'herbalist'));
          if (!who || who.journey || who.lost) continue;
          const spot = X.wildSpot(world, rng, t.x, t.y, 13, 22);
          if (!spot) continue;
          const kin = [who.parents.map(id => world.npcs[id]).find(n => n && n.status === 'alive'), who.spouse && world.npcs[who.spouse]].find(n => n && n.status === 'alive');
          who.lost = true; who.loc = null;
          ECHO.Plights.post(world, { kind: 'lost', sid: t.id, requester: kin ? kin.id : null, victim: who.id, x: spot.x, y: spot.y, deadline: world.day + 4, reward: 35 + rng.int(0, 25),
            text: `${who.first} ${who.prof === 'child' ? 'wandered off' : 'went out'} into the wilds ${X.dirFrom(t, spot)} of ${t.name} and hasn't come back.${kin ? ` ${kin.first} is beside ${kin.sex === 'f' ? 'herself' : 'himself'}.` : ''} The wolves come out at night.` });
          continue;
        }
        // a great wolf with a name
        if (r < 0.65) {
          const region = ECHO.World.regionAt(world, t.x, t.y);
          if (!region.eco || region.eco.wolf < 3 || open.some(p => p.kind === 'hunt')) continue;
          const spot = X.wildSpot(world, rng, t.x, t.y, 15, 30);
          if (!spot) continue;
          const name = BEAST_NAMES.find(nm => !world.plights.some(p => p.beast === nm)) || rng.pick(BEAST_NAMES);
          const hunter = res.find(n => n.prof === 'hunter') || null;
          ECHO.Plights.post(world, { kind: 'hunt', sid: t.id, requester: hunter ? hunter.id : null, beast: name, x: spot.x, y: spot.y, deadline: world.day + 14, reward: 90 + rng.int(0, 40),
            text: `A great duskwolf the hunters call ${name} has been taking sheep — and a shepherd — ${X.dirFrom(t, spot)} of ${t.name}. ${hunter ? hunter.first + ' wants its pelt on the wall.' : 'The village wants it dead.'}` });
          continue;
        }
        // a treasure map, sold cheap by someone who can't read it
        if (r < 0.72 && !open.some(p => p.kind === 'treasure')) {
          X.treasure(world, rng, t, null);
          continue;
        }
        // a letter to carry to another town
        if (r < 0.9) {
          const to = world.settlements.filter(o => o !== t && o.faction !== 'ashfang' && U.dist(o.x, o.y, t.x, t.y) > 25).sort(() => rng.next() - 0.5)[0];
          const from = rng.pick(res.filter(n => n.prof !== 'child'));
          if (!to || !from) continue;
          const dest = rng.pick(P().residents(world, to).filter(n => n.prof !== 'child'));
          if (!dest) continue;
          ECHO.Plights.post(world, { kind: 'courier', sid: t.id, requester: from.id, to: dest.id, toSid: to.id, deadline: world.day + 12, reward: 20 + Math.round(U.dist(to.x, to.y, t.x, t.y) * 0.5),
            text: `${from.first} needs a ${rng.pick(['letter', 'parcel', 'ring', 'small locked box'])} carried to ${P().name(dest)} in ${to.name}. ${rng.pick(['It is important.', 'Don\'t open it.', 'They will pay on delivery.', 'It is for a wedding.'])}` });
        }
      }
    },
    // A spot in the open, some distance from a point.
    wildSpot(world, rng, x0, y0, minD, maxD) {
      const T = ECHO.TILE;
      for (let i = 0; i < 40; i++) {
        const a = rng.next() * Math.PI * 2, d = minD + rng.next() * (maxD - minD);
        const x = x0 + Math.cos(a) * d, y = y0 + Math.sin(a) * d;
        if (x < 6 || y < 6 || x > world.W - 6 || y > world.H - 6) continue;
        const t = ECHO.World.tile(world, x, y);
        if (![T.GRASS, T.FOREST, T.HILL, T.SWAMP, T.SAND, T.SNOW].includes(t) || ECHO.World.isSolid(world, x, y)) continue;
        if (world.settlements.some(s => U.dist(s.x, s.y, x, y) < 10)) continue;
        return { x: Math.floor(x) + 0.5, y: Math.floor(y) + 0.5 };
      }
      return null;
    },
    dirFrom(a, b) {
      const D = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
      return D[((Math.round(Math.atan2(b.y - a.y, b.x - a.x) / (Math.PI / 4)) % 8) + 8) % 8];
    },
    // A treasure map: a hidden cache somewhere near a landmark.
    treasure(world, rng, t, fromSite) {
      const sites = X.sites(world);
      const anchor = fromSite || sites.filter(s => s.cat === 'landmark').sort((a, b) => U.dist(a.x, a.y, t.x, t.y) - U.dist(b.x, b.y, t.x, t.y))[rng.int(0, 2)] || sites[0];
      if (!anchor) return null;
      const spot = X.wildSpot(world, rng, anchor.x, anchor.y, 3, 7);
      if (!spot) return null;
      const steps = Math.round(U.dist(anchor.x, anchor.y, spot.x, spot.y) * 3);
      return ECHO.Plights.post(world, { kind: 'treasure', sid: t ? t.id : null, x: spot.x, y: spot.y, anchor: anchor.id, deadline: world.day + 40, reward: 0, mapped: !!fromSite,
        text: `A stained old map: "From ${anchor.name}, ${steps} paces ${X.dirFrom(anchor, spot)}. Dig." ${fromSite ? '' : 'A pedlar sold it to the notice board for a song.'}` });
    }
  };
})();
