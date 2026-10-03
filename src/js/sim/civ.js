// Civilization: kingdoms research their way out of the iron age. The path —
// engines or arcana — depends on who lives there and what happens there
// (including how much fire magic the player throws around in their lands).
// Every invention is credited to a named inventor and changes the world.
(function () {
  const { U } = ECHO;
  const P = () => ECHO.People;

  const THRESH = [0, 110, 300, 600, 1000, 1500, 2150];
  const ERAS = {
    mech: ['Age of Iron', 'Age of Steel', 'Age of Springs', 'Age of Gears', 'Age of Lightning', 'Age of Steam', 'Age of the Rift'],
    arcane: ['Age of Iron', 'Age of Runes', 'Age of Wands', 'Age of Wells', 'Age of Sunstone', 'Age of Skyskiffs', 'Age of the Rift']
  };
  const INVENTIONS = {
    mech: [null,
      { key: 'tempered', name: 'tempered steel', effect: 'smiths forge more and better arms' },
      { key: 'crossbows', name: 'the spring-crossbow', effect: 'soldiers carry crossbows' },
      { key: 'mills', name: 'clockwork mills', effect: 'fields feed a quarter more mouths' },
      { key: 'lamps', name: 'lightning lamps', effect: 'streets stay lit at night; beasts keep away' },
      { key: 'carriages', name: 'steam carriages', effect: 'caravans travel far faster' },
      { key: 'rift', name: 'the Rift Engine', effect: 'a door has opened onto other worlds' }],
    arcane: [null,
      { key: 'tempered', name: 'runed steel', effect: 'smiths forge more and better arms' },
      { key: 'crossbows', name: 'starbolt wands', effect: 'soldiers carry bolt-casting wands' },
      { key: 'aetherwells', name: 'aether wells', effect: 'fields and folk are hale; more food' },
      { key: 'lamps', name: 'sunstone lamps', effect: 'streets glow at night; beasts keep away' },
      { key: 'carriages', name: 'skyskiffs', effect: 'caravans float above the roads' },
      { key: 'rift', name: 'the Rift Gate', effect: 'a door has opened onto other worlds' }]
  };

  const Civ = ECHO.Civ = {
    ERAS, INVENTIONS, THRESH,
    init(world) {
      for (const f of Object.values(world.factions)) {
        f.tech = { era: 0, points: 0, arcane: f.id === 'lantern' ? 10 : 0, mech: f.id === 'valdren' ? 4 : 0, path: f.id === 'lantern' ? 'arcane' : null, inventions: [], donated: 0 };
      }
    },
    has(world, fid, key) {
      const f = world.factions[fid];
      return !!(f && f.tech && f.tech.inventions.includes(key));
    },
    eraName(world, fid) {
      const f = world.factions[fid];
      if (!f) return '';
      return ERAS[f.tech.path || 'mech'][f.tech.era];
    },
    magicUsed(world, x, y, amount) {
      const s = ECHO.World.nearestSettlement(world, x, y);
      if (!s) return;
      const f = world.factions[s.faction];
      if (f && f.tech) f.tech.arcane += amount;
    },
    donate(world, fid, gold) {
      const f = world.factions[fid];
      if (!f) return 0;
      const pts = gold / 8;
      f.tech.points += pts; f.tech.donated += gold;
      return pts;
    },
    dailyTick(world, rng) {
      for (const f of Object.values(world.factions)) {
        if (f.type !== 'kingdom' && f.type !== 'order') continue;
        if (f.fallen) continue;
        let pts = 0, arc = 0, mech = 0;
        for (const s of world.settlements) {
          if (s.faction !== f.id) continue;
          pts += s.prosperity / 110;
          for (const n of P().residents(world, s)) {
            if (n.prof === 'scholar') pts += n.skill.lore / 32;
            else if (n.prof === 'inventor') { pts += n.skill.lore / 18 + n.skill.craft / 40; mech += 0.25; }
            else if (n.prof === 'smith') { pts += 0.12; mech += 0.12; }
            else if (n.prof === 'miner') mech += 0.05;
            else if (n.prof === 'priest') { pts += 0.06; arc += 0.12; }
          }
        }
        if (f.id === 'lantern') pts *= 0.7;
        f.tech.points += pts; f.tech.arcane += arc; f.tech.mech += mech;
        const next = f.tech.era + 1;
        if (next < THRESH.length && f.tech.points >= THRESH[next]) Civ.advance(world, f, rng);
      }
    },
    advance(world, f, rng) {
      if (!f.tech.path && f.tech.era + 1 >= 2) f.tech.path = f.tech.arcane > f.tech.mech * 1.15 ? 'arcane' : 'mech';
      const path = f.tech.path || (f.tech.arcane > f.tech.mech * 1.15 ? 'arcane' : 'mech');
      f.tech.era++;
      const inv = INVENTIONS[path][f.tech.era];
      f.tech.inventions.push(inv.key);
      // Credit a real person.
      const pool = P().alive(world).filter(n => n.faction === f.id && ['scholar', 'inventor', 'smith', 'priest'].includes(n.prof) && n.loc);
      pool.sort((a, b) => (b.skill.lore + b.skill.craft + (b.prof === 'inventor' ? 40 : 0)) - (a.skill.lore + a.skill.craft + (a.prof === 'inventor' ? 40 : 0)));
      const who = pool[0];
      if (who) { who.renown += 20; P().remember(world, who, `created ${inv.name}`, 'pride', null, 5); }
      const s = who ? ECHO.Sim.settlement(world, who.loc) : ECHO.Sim.settlement(world, f.capital);
      ECHO.Chronicle.add(world, {
        text: `${who ? P().name(who) + ' of ' + (s ? s.name : f.short) : 'The scholars of ' + f.short} unveiled ${inv.name}: ${inv.effect}. ${f.name} enters the ${ERAS[path][f.tech.era]}.`,
        kind: 'era', importance: 3, sid: s ? s.id : f.capital, npcs: who ? [who.id] : []
      });
      for (const st of world.settlements) if (st.faction === f.id) st.techLook = f.tech.era;
      // The Lantern answers the engines.
      const lantern = world.factions.lantern;
      if (f.type === 'kingdom' && path === 'mech' && f.tech.era === 3 && !lantern.edict) {
        lantern.edict = f.id;
        lantern.relations[f.id] = f.relations.lantern = Math.min(lantern.relations[f.id], 0) - 30;
        const hw = lantern.ruler && world.npcs[lantern.ruler];
        ECHO.Chronicle.add(world, { text: `${hw ? P().fullTitle(world, hw) : 'The High Wick'} proclaimed the Edict of Ash: the engines of ${f.short} are an affront to the Flame, and no Lantern town will suffer them.`, kind: 'politics', importance: 3, sid: lantern.capital });
      }
      if (f.type === 'kingdom' && path === 'arcane' && f.tech.era === 3) {
        lantern.relations[f.id] = f.relations.lantern = Math.min(100, lantern.relations[f.id] + 20);
      }
      if (inv.key === 'rift') Civ.openRift(world, f, rng);
    },
    openRift(world, f, rng) {
      if (world.rift) return;
      const cap = ECHO.Sim.settlement(world, f.capital);
      if (!cap) return;
      let x = cap.x + 10, y = cap.y;
      for (let t = 0; t < 100; t++) {
        const a = rng.next() * Math.PI * 2;
        const xx = Math.round(cap.x + Math.cos(a) * 11), yy = Math.round(cap.y + Math.sin(a) * 11);
        if (!ECHO.World.isSolid(world, xx, yy) && !ECHO.World.isSolid(world, xx, yy + 1)) { x = xx; y = yy; break; }
      }
      world.rift = { x, y, faction: f.id, opened: world.day };
      ECHO.Chronicle.add(world, { text: `Near ${cap.name} the air split open. Through the Rift, the scholars of ${f.short} glimpsed another world — and something looked back.`, kind: 'era', importance: 3, sid: cap.id });
      ECHO.emit('rift:open', world.rift);
    }
  };
  void U;
})();
