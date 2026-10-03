// The spawner gives bodies to the simulation near the player.
// Creatures appear in proportion to their regional populations (and carry the
// region's evolved traits); townsfolk appear where their routines put them;
// outlaws appear at their camps with whatever gear their faction has learned
// to carry; travellers appear on their actual journeys.
(function () {
  const { U } = ECHO;
  const TILE = ECHO.TILE;

  const DENSITY = { gnawer: 0.07, hare: 0.09, wolf: 0.32 };
  const CAP = { gnawer: 14, hare: 6, wolf: 6 };

  const S = ECHO.Spawner = {
    timer: 0,
    unitsPerKill(sp) { return 1 / (DENSITY[sp] * 2.2); },
    reset() { S.timer = 0; },

    update(game, dt) {
      S.timer -= dt;
      if (S.timer > 0) return;
      S.timer = 0.5;
      const world = game.world, pe = game.pe;
      if (!pe) return;
      // ---- Despawn far things
      for (const e of game.ents) {
        if (e === pe || e.isCompanion || e.dead) continue;
        const d = U.dist(e.x, e.y, pe.x, pe.y);
        const far = e.type === 'creature' ? 30 : e.type === 'boss' ? 30 : 44;
        if (d > far || e.despawnSoon) { e.dead = true; e.vanish = true; if (e.type === 'boss') game.ui.bossBar(null); }
      }
      S.creatures(game);
      S.people(game);
      S.camps(game);
      S.journeys(game);
      S.bosses(game);
      S.companion(game);
    },

    habitat(sp, t) {
      if (sp === 'gnawer') return t === TILE.FARM || t === TILE.GRASS || t === TILE.SWAMP;
      if (sp === 'hare') return t === TILE.GRASS || t === TILE.FOREST || t === TILE.FARM;
      if (sp === 'wolf') return t === TILE.FOREST || t === TILE.GRASS || t === TILE.HILL || t === TILE.SNOW;
      return false;
    },

    creatures(game) {
      const world = game.world, pe = game.pe;
      const region = ECHO.World.regionAt(world, pe.x, pe.y);
      if (!region || !region.eco) return;
      const night = game.isNight();
      const inTown = ECHO.World.settlementAt(world, pe.x, pe.y, 8);
      for (const sp of ['gnawer', 'hare', 'wolf']) {
        let want = region.eco[sp] * DENSITY[sp];
        if (sp === 'wolf' && night) want *= 1.6;
        if (sp === 'wolf' && ECHO.Intel.has(world, 'wild', 'packs')) want *= 1.3;
        if (inTown && sp !== 'gnawer') want *= 0.2;
        want = Math.min(CAP[sp], Math.floor(want));
        const have = game.ents.filter(e => e.species === sp && !e.dead).length;
        if (have >= want) continue;
        const n = sp === 'wolf' ? Math.min(want - have, 1 + Math.floor(Math.random() * (ECHO.Intel.has(world, 'wild', 'packs') ? 4 : 3))) : 1;
        const spot = S.findSpot(game, sp, 15, 23);
        if (!spot) continue;
        const pack = sp === 'wolf' ? 'p' + Math.random() : null;
        for (let i = 0; i < n; i++) game.addEnt(S.makeCreature(game, sp, spot.x + (Math.random() - 0.5) * 1.5, spot.y + (Math.random() - 0.5) * 1.5, region, pack));
      }
    },
    findSpot(game, sp, minD, maxD) {
      const world = game.world, pe = game.pe;
      for (let t = 0; t < 14; t++) {
        const a = Math.random() * Math.PI * 2, d = minD + Math.random() * (maxD - minD);
        const x = pe.x + Math.cos(a) * d, y = pe.y + Math.sin(a) * d;
        if (ECHO.World.isSolid(world, x, y)) continue;
        const t0 = ECHO.World.tile(world, x, y);
        if (sp && !S.habitat(sp, t0)) continue;
        if (sp !== 'gnawer' && ECHO.World.settlementAt(world, x, y, 9)) continue;
        if (game.onScreen(x, y, 1) && !game.isNight()) continue;
        return { x, y };
      }
      return null;
    },
    makeCreature(game, sp, x, y, region, pack) {
      const def = ECHO.SPECIES[sp];
      const tr = region && region.eco ? region.eco.traits[sp] : null;
      const hpMul = tr ? 1 + tr.hide * 0.6 : 1;
      const e = ECHO.Ent.make({
        type: 'creature', species: sp, x, y, r: def.radius, hp: def.hp * hpMul, maxHp: def.hp * hpMul, speed: def.speed,
        faction: 'wild', regionId: region ? region.id : null, traits: tr ? { fireRes: tr.fireRes, hide: tr.hide, speed: tr.speed } : null,
        mutation: tr ? tr.mutation : null, pack, home: { x, y }, label: null
      });
      e.strain = region ? ECHO.Ecology.strainLabel(tr || {}) : null;
      return e;
    },
    reinforceWolves(game, e, n) {
      const region = game.world.regions[e.regionId];
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const x = e.x + Math.cos(a) * 7, y = e.y + Math.sin(a) * 7;
        if (ECHO.World.isSolid(game.world, x, y)) continue;
        const w = S.makeCreature(game, 'wolf', x, y, region, e.pack);
        w.target = e.target; w.aggro = true;
        game.addEnt(w);
      }
    },

    // ------------------------------------------------------------ People in towns
    people(game) {
      const world = game.world, pe = game.pe;
      for (const s of world.settlements) {
        const d = U.dist(s.x, s.y, pe.x, pe.y);
        if (d > 36) continue;
        const present = ECHO.People.residents(world, s);
        const spawned = new Set(game.ents.filter(e => e.npcId && !e.dead).map(e => e.npcId));
        // Key people first, then a sampling of everyone else.
        present.sort((a, b) => S.priority(b) - S.priority(a));
        let count = game.ents.filter(e => e.homeSid === s.id && !e.dead).length;
        const cap = s.kind === 'capital' ? 34 : 26;
        for (const npc of present) {
          if (count >= cap) break;
          if (spawned.has(npc.id) || npc.id === (game.pl.companion)) continue;
          const goal = ECHO.AI.Sched.target(game, null, npc, world.minute);
          let x = goal ? goal.x : s.x, y = goal ? goal.y : s.y;
          // Spawn at their destination so the town looks lived-in.
          let tries = 0;
          while (ECHO.World.isSolid(world, x, y) && tries++ < 10) { x = s.x + (Math.random() - 0.5) * 6; y = s.y + (Math.random() - 0.5) * 6; }
          const e = S.makePerson(game, npc, x, y, npc.prof === 'guard' ? 'guard' : 'villager');
          e.homeSid = s.id;
          if (goal && goal.inside) { e.hidden = true; e.goal = goal; }
          game.addEnt(e);
          count++;
        }
      }
    },
    priority(n) {
      const p = { ruler: 9, reeve: 8, innkeeper: 8, merchant: 7, smith: 7, scholar: 6, priest: 6, guard: 5, inventor: 6, wanderer: 5 }[n.prof] || 1;
      return p + (n.carry ? 5 : 0) + (n.namedAfter ? 3 : 0) + Math.random();
    },
    makePerson(game, npc, x, y, role) {
      const world = game.world;
      const f = world.factions[npc.faction];
      const fight = npc.skill.fight;
      const doctr = k => ECHO.Intel.has(world, npc.faction, k);
      const gear = {};
      const night = game.isNight();
      if (role === 'bandit' || role === 'guard' || role === 'soldier') {
        const h = ECHO.hashStr(npc.id);
        if (doctr('shields') && h % 3 !== 0) gear.shield = true;
        if (doctr('fireward')) gear.fireward = true;
        if (doctr('skirmish')) { if (h % 2 === 0) gear.spear = true; else gear.bow = true; }
        else if (h % 4 === 0) gear.bow = true;
        if (role !== 'bandit' && ECHO.Civ.has(world, npc.faction, 'crossbows') && h % 3 === 0) { gear.bow = true; gear.crossbow = true; }
        if (night && (doctr('nightwatch') || role !== 'bandit')) gear.torch = h % 2 === 0;
        if (role === 'guard' || role === 'soldier') gear.helm = true;
      }
      if (npc.prof === 'merchant' && role === 'traveler') gear.cart = true;
      const hp = 30 + fight * 0.9 + npc.rank * 15;
      const e = ECHO.Ent.make({
        type: 'person', npcId: npc.id, x, y, r: 0.34, hp, maxHp: hp, speed: 3.1 + (fight > 50 ? 0.4 : 0), faction: npc.faction,
        role, gear, look: S.look(npc), label: null
      });
      if (npc.carry) e.carrying = npc.carry;
      void f;
      return e;
    },
    look(npc) {
      const h = ECHO.hashStr(npc.id + npc.first);
      const skins = ['#f1c9a5', '#e0ac85', '#c68a62', '#a8694a', '#7d4b33', '#5c3524'];
      const hairs = ['#2b1d14', '#4a3020', '#7a4b26', '#b07a3c', '#d9b26a', '#e7e1d6', '#8c2f1c', '#1b1b1b'];
      return { skin: skins[h % skins.length], hair: hairs[(h >> 3) % hairs.length], hairStyle: (h >> 6) % 4, beard: npc.sex === 'm' && ((h >> 8) % 3 === 0), female: npc.sex === 'f' };
    },

    // ------------------------------------------------------------ Camps
    camps(game) {
      const world = game.world, pe = game.pe;
      for (const camp of world.camps) {
        if (!camp.alive && !camp.captives.length) continue;
        const d = U.dist(camp.x, camp.y, pe.x, pe.y);
        if (d > 32) continue;
        const spawned = new Set(game.ents.filter(e => e.npcId && !e.dead).map(e => e.npcId));
        const members = camp.members.map(id => world.npcs[id]).filter(n => n && n.status === 'alive');
        let i = 0;
        for (const n of members) {
          if (spawned.has(n.id)) continue;
          if (i++ > 12) break;
          const a = Math.random() * Math.PI * 2, r = 1.5 + Math.random() * 3;
          let x = camp.x + Math.cos(a) * r, y = camp.y + Math.sin(a) * r;
          if (ECHO.World.isSolid(world, x, y)) { x = camp.x; y = camp.y + 1.5; }
          const e = S.makePerson(game, n, x, y, 'bandit');
          e.campId = camp.id;
          if (camp.leader === n.id) { e.isLeader = true; e.maxHp *= 1.6; e.hp = e.maxHp; }
          e.isGuardPost = Math.random() < 0.25;
          game.addEnt(e);
        }
        // Bodyguards doctrine: the chief's closest men stay by his side.
        if (ECHO.Intel.has(world, 'ashfang', 'bodyguards')) {
          const lead = game.ents.find(e => e.isLeader && e.campId === camp.id && !e.dead);
          if (lead) {
            const gs = game.ents.filter(e => e.campId === camp.id && !e.isLeader && !e.dead && !e.guarding).slice(0, 2);
            for (const g of gs) g.guarding = lead.npcId;
          }
        }
        for (const cid of camp.captives) {
          const c = world.npcs[cid];
          if (!c || c.status !== 'captive' || spawned.has(cid)) continue;
          const e = S.makePerson(game, c, camp.x + 2.5, camp.y - 1.2, 'captive');
          e.campId = camp.id;
          game.addEnt(e);
        }
      }
    },

    // ------------------------------------------------------------ Travellers
    journeys(game) {
      const world = game.world, pe = game.pe;
      for (const j of world.journeys || []) {
        const p = ECHO.Sim.journeyPos(world, j);
        if (U.dist(p.x, p.y, pe.x, pe.y) > 34) continue;
        const spawned = new Set(game.ents.filter(e => e.journeyId === j.id && !e.dead).map(e => e.npcId));
        j.npcs.forEach((id, slot) => {
          if (spawned.has(id)) return;
          const n = world.npcs[id];
          if (!n || n.status !== 'alive') return;
          if (game.ents.some(e => e.npcId === id && !e.dead)) return;
          const role = j.kind === 'army' ? 'soldier' : (n.prof === 'guard' ? 'soldier' : 'traveler');
          const e = S.makePerson(game, n, p.x + slot * 0.6, p.y, role);
          e.journeyId = j.id; e.slot = slot;
          if (j.kind === 'caravan' && slot === 0) e.gear.cart = true;
          game.addEnt(e);
        });
      }
    },

    // ------------------------------------------------------------ Bosses
    bosses(game) {
      const world = game.world, pe = game.pe;
      for (const lair of world.lairs) {
        const b = lair.boss;
        if (!b.alive || b.absentUntil > world.day) continue;
        if (U.dist(lair.x, lair.y, pe.x, pe.y) > 22) continue;
        if (game.ents.some(e => e.type === 'boss' && e.boss === b && !e.dead)) continue;
        if (b.absentUntil > 0 && b.absentUntil <= world.day && !b.returned) {
          b.returned = true;
          ECHO.Chronicle.add(world, { text: `${b.name} ${b.title} has returned to its lair, scarred and changed.`, kind: 'nature', importance: 2, x: lair.x, y: lair.y });
        }
        game.addEnt(ECHO.Boss.spawn(game, lair));
      }
    },

    companion(game) {
      const pl = game.pl, world = game.world;
      if (!pl.companion) return;
      const n = world.npcs[pl.companion];
      if (!n || n.status !== 'alive') { pl.companion = null; return; }
      if (game.ents.some(e => e.isCompanion && !e.dead)) return;
      // Remove any town body they had
      for (const e of game.ents) if (e.npcId === n.id) { e.dead = true; e.vanish = true; }
      const e = S.makePerson(game, n, game.pe.x - 1, game.pe.y + 0.6, 'companion');
      e.isCompanion = true; e.faction = 'player';
      e.maxHp *= 1.3; e.hp = e.maxHp;
      game.addEnt(e);
    }
  };
})();
