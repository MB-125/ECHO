// Politics: bandit camps, raids and ambushes, unrest and revolts, rulers and
// succession, diplomacy, wars, armies and conquest. Every soldier, bandit and
// ruler is a named person from the population.
(function () {
  const { U } = ECHO;
  const P = () => ECHO.People;

  const CAMP_NAMES = ['Gallows Hollow', 'Redtooth Den', 'the Burnt Copse', 'Cutpurse Rise', 'Wolfsbane Camp', 'the Crooked Fire', 'Ashfang Lair', 'Ravenpike', 'the Black Thicket', 'Smokehold', 'Knifewater', 'the Hanging Oak'];

  const Pol = ECHO.Politics = {
    init(world) {
      const F = world.factions;
      const set = (a, b, v) => { F[a].relations[b] = v; F[b].relations[a] = v; };
      set('valdren', 'ashmere', -18);
      set('valdren', 'lantern', 30); set('ashmere', 'lantern', 30);
      for (const f of ['valdren', 'ashmere', 'lantern']) set(f, 'ashfang', -80);
      for (const f of ['valdren', 'ashmere', 'lantern', 'ashfang']) set(f, 'wild', -100);
      for (const f of Object.values(F)) { f.raidLog = []; f.warDays = 0; f.casualties = 0; }
    },

    // ------------------------------------------------------------ Camps
    nearestCamp(world, x, y, maxD = Infinity) {
      let best = null, bd = maxD;
      for (const c of world.camps) {
        if (!c.alive) continue;
        const d = U.dist(x, y, c.x, c.y);
        if (d < bd) { bd = d; best = c; }
      }
      return best;
    },
    foundCamp(world, rng, leader, initial) {
      const W = world.W;
      let spot = null;
      const roads = world.roads.filter(r => r.path.length > 30);
      for (let t = 0; t < 400 && !spot && roads.length; t++) {
        const r = rng.pick(roads);
        const p = r.path[rng.int(10, r.path.length - 10)];
        const px = p % W, py = (p / W) | 0;
        const a = rng.next() * Math.PI * 2, d = rng.range(8, 15);
        const x = Math.round(px + Math.cos(a) * d), y = Math.round(py + Math.sin(a) * d);
        if (!ECHO.World.inBounds(x, y) || x < 6 || y < 6 || x > W - 7 || y > world.H - 7) continue;
        const tile = ECHO.World.tile(world, x, y);
        if (![ECHO.TILE.GRASS, ECHO.TILE.FOREST, ECHO.TILE.TREE, ECHO.TILE.HILL].includes(tile)) continue;
        if (world.settlements.some(s => U.dist(s.x, s.y, x, y) < 18)) continue;
        if (world.camps.some(c => c.alive && U.dist(c.x, c.y, x, y) < 22)) continue;
        if (world.lairs.some(l => U.dist(l.x, l.y, x, y) < 14)) continue;
        if (world.ruins.some(l => U.dist(l.x, l.y, x, y) < 12)) continue;
        spot = { x, y };
      }
      if (!spot) return null;
      // Clear the clearing
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        if (dx * dx + dy * dy > 18) continue;
        const t = ECHO.World.tile(world, spot.x + dx, spot.y + dy);
        if (t === ECHO.TILE.TREE || t === ECHO.TILE.FOREST || t === ECHO.TILE.HILL) ECHO.World.setTile(world, spot.x + dx, spot.y + dy, ECHO.TILE.GRASS);
      }
      const used = new Set(world.camps.map(c => c.name));
      const name = CAMP_NAMES.find(n => !used.has(n)) || ('Camp ' + (world.camps.length + 1));
      const camp = { id: 'camp' + world.camps.length, name, x: spot.x, y: spot.y, members: [], leader: null, loot: { food: 30, gold: 40, items: [] }, founded: world.day, captives: [], lastRaid: world.day, alive: true, raids: 0 };
      world.camps.push(camp);
      if (initial) {
        const k = rng.int(5, 8);
        for (let i = 0; i < k; i++) {
          const n = P().create(world, rng, { home: null, faction: 'ashfang', culture: rng.chance(0.5) ? 'valdren' : 'ashmere', prof: 'bandit', fight: rng.int(18, 45) });
          if (rng.chance(0.4)) n.traits[0] = rng.pick(['cruel', 'greedy', 'hot-headed', 'deceitful']);
          Pol.joinCamp(world, n, camp);
        }
      } else if (leader) {
        Pol.joinCamp(world, leader, camp);
      }
      Pol.campSuccession(world, camp, true);
      if (!initial) ECHO.Chronicle.add(world, { text: `Outlaws have made a camp at ${camp.name}${camp.leader ? ', led by ' + P().name(world.npcs[camp.leader]) : ''}. Travellers are warned.`, kind: 'crime', importance: 2, x: camp.x, y: camp.y });
      return camp;
    },
    joinCamp(world, n, camp) {
      if (n.camp) Pol.leaveCamp(world, n);
      n.camp = camp.id; n.home = camp.id; n.loc = camp.id; n.faction = 'ashfang'; n.prof = 'bandit';
      if (!camp.members.includes(n.id)) camp.members.push(n.id);
      if (!camp.alive) { camp.alive = true; }
    },
    leaveCamp(world, n) {
      const camp = world.camps.find(c => c.id === n.camp);
      if (camp) {
        camp.members = camp.members.filter(id => id !== n.id);
        if (camp.leader === n.id) Pol.campSuccession(world, camp);
      }
      n.camp = null;
    },
    campSuccession(world, camp, silent) {
      camp.members = camp.members.filter(id => world.npcs[id] && world.npcs[id].status !== 'dead' && world.npcs[id].camp === camp.id);
      if (!camp.members.length) {
        if (camp.alive) {
          camp.alive = false; camp.leader = null;
          ECHO.Chronicle.add(world, { text: `${camp.name} lies abandoned; its fires are cold.`, kind: 'crime', importance: 1, x: camp.x, y: camp.y });
        }
        return;
      }
      const old = camp.leader && world.npcs[camp.leader];
      const cands = camp.members.map(id => world.npcs[id]);
      cands.sort((a, b) => (b.renown + b.skill.fight + (P().has(b, 'ambitious') ? 15 : 0)) - (a.renown + a.skill.fight + (P().has(a, 'ambitious') ? 15 : 0)));
      const lead = cands[0];
      if (old && old.status !== 'dead' && old.camp === camp.id) return;
      camp.leader = lead.id;
      lead.rank = Math.max(lead.rank, 2);
      lead.renown = Math.max(lead.renown, 15);
      if (!silent) ECHO.Chronicle.add(world, { text: `${P().name(lead)} now leads the Ashfang of ${camp.name}.`, kind: 'crime', importance: 1, x: camp.x, y: camp.y, npcs: [lead.id] });
    },
    campStrength(world, camp) {
      let s = 0;
      for (const id of camp.members) { const n = world.npcs[id]; if (n && n.status === 'alive') s += 10 + n.skill.fight * 0.6 + (n.carry ? 6 : 0); }
      const d = world.factions.ashfang.doctrines;
      if (d.shields) s *= 1.08;
      if (d.bodyguards) s *= 1.05;
      return s;
    },
    settlementStrength(world, s) {
      let str = 0;
      for (const n of P().residents(world, s)) {
        if (n.prof === 'guard') str += 12 + n.skill.fight * 0.7 + n.rank * 6;
        else if (n.prof !== 'child' && n.prof !== 'elder' && P().has(n, 'brave')) str += 3 + n.skill.fight * 0.15;
      }
      const f = world.factions[s.faction];
      str *= 1 + Math.min(0.5, s.stock.arms / 60);
      str *= 1 + (f ? f.tech.era * 0.08 : 0);
      if (s.kind === 'capital') str *= 1.3;
      return str + 8;
    },

    // An attack on travellers.
    ambush(world, j, pos, region, rng) {
      const camp = Pol.nearestCamp(world, pos.x, pos.y, 30);
      const wolves = region && region.eco ? region.eco.wolfDanger : 0;
      const byBandits = camp && (!wolves || rng.chance(0.7));
      const people = j.npcs.map(id => world.npcs[id]).filter(n => n && n.status === 'alive');
      const where = region ? region.name : 'the road';
      if (byBandits) {
        if (j.cargo) {
          for (const g in j.cargo) { camp.loot[g === 'food' ? 'food' : 'gold'] += j.cargo[g] * (g === 'food' ? 1 : 3); }
          j.cargo = null;
        }
        let fate = 'robbed';
        for (const n of people) {
          const r = rng.next();
          if (r < 0.2) { P().kill(world, n, 'slain by Ashfang raiders on the road'); fate = 'killed'; }
          else if (r < 0.32 && people.length) {
            n.status = 'captive'; n.captiveAt = camp.id; n.journey = null; n.loc = null;
            camp.captives.push(n.id);
            ECHO.Plights.createKidnap(world, n, camp, rng);
            fate = 'taken';
          } else if (r < 0.37 && (P().has(n, 'greedy') || P().has(n, 'fickle'))) {
            Pol.joinCamp(world, n, camp); fate = 'turned';
          }
        }
        const names = people.map(n => P().name(n));
        const what = j.kind === 'caravan' ? `the caravan of ${names[0] || 'a merchant'}` : j.kind === 'aid' ? `a grain convoy` : names.length ? U.listJoin(names) : 'travellers';
        ECHO.Chronicle.add(world, { text: `Ashfang raiders from ${camp.name} fell upon ${what} in ${where}${fate === 'killed' ? '; not all survived' : fate === 'taken' ? ', taking captives' : ''}.`, kind: 'crime', importance: 1, x: pos.x, y: pos.y, npcs: people.map(n => n.id) });
        camp.raids++;
        for (const rid of j.roads) { const road = world.roads.find(r => r.id === rid); if (road) road.danger = Math.min(4, road.danger + 0.3); }
      } else {
        for (const n of people) if (rng.chance(0.25)) P().kill(world, n, 'killed by duskwolves on the road');
        if (j.cargo && j.cargo.food) j.cargo.food *= 0.7;
        if (rng.chance(0.3)) ECHO.Chronicle.add(world, { text: `Duskwolves attacked travellers in ${where}.`, kind: 'nature', importance: 0, x: pos.x, y: pos.y });
      }
      const alive = people.filter(n => n.status === 'alive' && n.journey === j.id);
      if (!alive.length) { world.journeys = world.journeys.filter(x => x !== j); return; }
      // Survivors flee back
      j.npcs = alive.map(n => n.id);
      if (j.kind === 'caravan' || j.kind === 'aid') {
        const back = j.pos < j.path.length / 2;
        if (back) { ECHO.Sim.endJourney(world, j, false); }
      }
    },

    // ------------------------------------------------------------ Daily
    dailyTick(world, rng) {
      // Road danger decays and is recomputed from camps and wolves.
      for (const r of world.roads) {
        let d = 0;
        for (let i = 0; i < r.path.length; i += 12) {
          const p = r.path[i], x = p % world.W, y = (p / world.W) | 0;
          d = Math.max(d, ECHO.Sim.roadDanger(world, x, y, ECHO.World.regionAt(world, x, y)));
        }
        r.danger = U.lerp(r.danger, d, 0.3);
      }
      Pol.camps(world, rng);
      Pol.unrest(world, rng);
      Pol.diplomacy(world, rng);
      Pol.wars(world, rng);
      // Promotions from renown
      for (const n of Object.values(world.npcs)) {
        if (n.status !== 'alive' || n.prof !== 'guard') continue;
        const want = n.renown >= 45 ? 3 : n.renown >= 25 ? 2 : n.renown >= 12 ? 1 : 0;
        if (want > n.rank) Pol.promote(world, n, want);
      }
    },

    promote(world, n, rank, why) {
      const f = world.factions[n.faction];
      if (rank === 3 && f) {
        const gens = P().alive(world).filter(o => o.faction === f.id && o.rank === 3 && o.prof === 'guard');
        if (gens.length >= 2) rank = 2;
      }
      if (rank <= n.rank) return;
      n.rank = rank;
      const title = P().RANKS[rank];
      P().remember(world, n, `was raised to ${title}${why ? ' ' + why : ''}`, 'pride', null, 3);
      if (rank >= 2) ECHO.Chronicle.add(world, { text: `${n.first} ${n.last} was raised to ${title} of ${f ? f.short : 'the realm'}${why ? ' ' + why : ''}.`, kind: 'politics', importance: rank === 3 ? 2 : 1, sid: n.home, npcs: [n.id] });
    },

    camps(world, rng) {
      // Outlaws from beyond the borders drift in when the woods are quiet.
      const outlaws = P().alive(world).filter(n => n.prof === 'bandit').length;
      if (outlaws < 7 && rng.chance(0.012)) {
        const c = Pol.foundCamp(world, rng, null, true);
        if (c) ECHO.Chronicle.add(world, { text: `A band of outlaws crossed the border and made camp at ${c.name}${c.leader ? ' under ' + P().name(world.npcs[c.leader]) : ''}.`, kind: 'crime', importance: 2, x: c.x, y: c.y });
      }
      for (const camp of world.camps) {
        if (!camp.alive) continue;
        camp.members = camp.members.filter(id => world.npcs[id] && world.npcs[id].status !== 'dead' && world.npcs[id].camp === camp.id);
        if (!camp.members.length) { Pol.campSuccession(world, camp); continue; }
        camp.loot.food -= camp.members.length * 0.7;
        const hungry = camp.loot.food < 0;
        if (hungry) { camp.loot.food = 0; camp.hungryDays = (camp.hungryDays || 0) + 1; } else camp.hungryDays = 0;
        if (camp.hungryDays > 5) {
          for (const id of camp.members.slice()) {
            const n = world.npcs[id];
            if (!n || n.id === camp.leader || !rng.chance(0.07)) continue;
            const home = world.settlements.filter(s => s.hunger < 0.3).sort((a, b) => U.dist(a.x, a.y, camp.x, camp.y) - U.dist(b.x, b.y, camp.x, camp.y))[0];
            if (home && !P().has(n, 'cruel') && rng.chance(0.6)) {
              Pol.leaveCamp(world, n);
              n.prof = rng.pick(['farmer', 'hunter', 'woodcutter']); n.faction = home.faction; n.home = home.id; n.loc = home.id; n.starve = 0;
              if (!home.residents.includes(n.id)) home.residents.push(n.id);
              P().remember(world, n, 'left the starving Ashfang camp and found honest work in ' + home.name, 'change', null, 3);
            } else P().kill(world, n, 'starved in the woods with the Ashfang');
          }
        }
        const str = Pol.campStrength(world, camp);
        // Raid a settlement
        if ((hungry || rng.chance(0.06)) && world.day - camp.lastRaid > 4 && camp.members.length >= 3) {
          const targets = world.settlements.filter(s => s.kind !== 'capital' && U.dist(s.x, s.y, camp.x, camp.y) < 45);
          if (targets.length) {
            const t = targets.reduce((a, b) => Pol.settlementStrength(world, a) < Pol.settlementStrength(world, b) ? a : b);
            Pol.raidSettlement(world, camp, t, str, rng);
          }
        }
        // Bandits die in skirmishes and accidents occasionally
        if (rng.chance(0.003 * camp.members.length)) {
          const n = world.npcs[rng.pick(camp.members)];
          if (n && n.id !== camp.leader) P().kill(world, n, rng.pick(['killed in a brawl over loot', 'fever in the camp', 'hanged by their own for cowardice']));
        }
        // Captives: some are ransomed or sold off by the Lantern
        for (const cid of camp.captives.slice()) {
          const c = world.npcs[cid];
          if (!c || c.status !== 'captive') { camp.captives = camp.captives.filter(x => x !== cid); continue; }
        }
      }
    },

    raidSettlement(world, camp, s, str, rng) {
      camp.lastRaid = world.day;
      camp.raids++;
      const def = Pol.settlementStrength(world, s);
      const roll = str * rng.range(0.6, 1.4) - def * rng.range(0.6, 1.3);
      const f = world.factions[s.faction];
      f.raidLog.push(world.day);
      if (roll > 0) {
        const stolen = Math.min(s.stock.food * 0.3, 40 + camp.members.length * 6);
        s.stock.food -= stolen; camp.loot.food += stolen;
        const gold = Math.min(s.wealth * 0.2, 80); s.wealth -= gold; camp.loot.gold += gold;
        s.unrest = Math.min(100, s.unrest + 10);
        const victims = P().residents(world, s).filter(n => n.prof !== 'child');
        const dead = [];
        for (let i = 0; i < rng.int(0, 2) && victims.length; i++) {
          const v = victims.splice(rng.int(0, victims.length - 1), 1)[0];
          P().kill(world, v, 'cut down in an Ashfang raid'); dead.push(v);
        }
        let captive = null;
        if (rng.chance(0.55)) {
          const young = P().residents(world, s).filter(n => P().age(world, n) > 10 && P().age(world, n) < 30 && n.prof !== 'guard');
          if (young.length) {
            captive = rng.pick(young);
            captive.status = 'captive'; captive.captiveAt = camp.id; captive.loc = null;
            camp.captives.push(captive.id);
            ECHO.Plights.createKidnap(world, captive, camp, rng);
          }
        }
        for (const n of P().residents(world, s)) P().remember(world, n, `survived the Ashfang raid on ${s.name}`, 'trauma', null, 2);
        ECHO.Chronicle.add(world, {
          text: `The Ashfang of ${camp.name} raided ${s.name}, carrying off grain and coin${dead.length ? ' and killing ' + U.listJoin(dead.map(d => d.first)) : ''}${captive ? '. They took ' + P().name(captive) + ' with them' : ''}.`,
          kind: 'crime', importance: 2, sid: s.id, npcs: dead.map(d => d.id).concat(captive ? [captive.id] : [])
        });
        // Repeated raids bring the army.
        const recent = f.raidLog.filter(d => world.day - d < 25).length;
        if (recent >= 2 && f.type === 'kingdom') Pol.punitiveExpedition(world, f, camp, rng);
      } else {
        const members = camp.members.map(id => world.npcs[id]);
        const killed = members.filter(() => rng.chance(0.25));
        for (const k of killed) {
          P().kill(world, k, `killed raiding ${s.name}`);
          const def1 = rng.pick(P().residents(world, s).filter(n => n.prof === 'guard')) || null;
          if (def1) def1.renown += 4;
        }
        ECHO.Chronicle.add(world, { text: `${s.name} drove off an Ashfang raid${killed.length ? ', killing ' + killed.length : ''}.`, kind: 'crime', importance: 1, sid: s.id });
      }
    },

    punitiveExpedition(world, f, camp, rng) {
      if ((world.journeys || []).some(j => j.kind === 'army' && j.army.target === camp.id)) return;
      const cap = ECHO.Sim.settlement(world, f.capital);
      if (!cap || cap.faction !== f.id) return;
      const soldiers = P().residents(world, cap).filter(n => n.prof === 'guard' && !n.journey && n.rank < 3);
      if (soldiers.length < 4) return;
      const force = rng.shuffle(soldiers).slice(0, Math.min(soldiers.length - 1, 4 + Math.floor(rng.next() * 4)));
      const near = world.settlements.filter(s => s.faction === f.id).reduce((a, b) => U.dist(a.x, a.y, camp.x, camp.y) < U.dist(b.x, b.y, camp.x, camp.y) ? a : b);
      const commander = force.reduce((a, b) => (a.rank * 100 + a.renown) > (b.rank * 100 + b.renown) ? a : b);
      const j = ECHO.Sim.startJourney(world, { kind: 'army', npcs: force.map(n => n.id), from: cap.id, to: near.id, speed: 2.6, army: { faction: f.id, target: camp.id, type: 'camp', commander: commander.id } });
      if (!j && near === cap) {
        Pol.battleCamp(world, { army: { faction: f.id, target: camp.id, commander: commander.id }, npcs: force.map(n => n.id), to: cap.id }, rng);
        return;
      }
      if (j) ECHO.Chronicle.add(world, { text: `${P().fullTitle(world, commander)} marched from ${cap.name} with ${force.length} soldiers to burn out ${camp.name}.`, kind: 'war', importance: 2, sid: cap.id, npcs: [commander.id] });
    },

    battleCamp(world, j, rng) {
      rng = rng || ECHO.Sim.rngFor(world);
      const camp = world.camps.find(c => c.id === j.army.target);
      const soldiers = j.npcs.map(id => world.npcs[id]).filter(n => n && n.status === 'alive');
      const commander = world.npcs[j.army.commander];
      const at = ECHO.Sim.settlement(world, j.to);
      if (!camp || !camp.alive) { Pol.armyGoHome(world, soldiers, at); return; }
      let atk = U.sum(soldiers.map(n => 12 + n.skill.fight * 0.7)) * (1 + world.factions[j.army.faction].tech.era * 0.08);
      const def = Pol.campStrength(world, camp) * 1.15;
      const win = atk * rng.range(0.7, 1.3) > def * rng.range(0.7, 1.3);
      const bandits = camp.members.map(id => world.npcs[id]);
      if (win) {
        for (const b of bandits) if (rng.chance(0.7)) P().kill(world, b, 'killed when soldiers stormed ' + camp.name, commander ? P().name(commander) : null);
        for (const s of soldiers) if (rng.chance(0.12)) P().kill(world, s, 'fell storming ' + camp.name);
        // free captives
        for (const cid of camp.captives) {
          const c = world.npcs[cid];
          if (c && c.status === 'captive') ECHO.Plights.freeCaptive(world, c, commander ? P().fullTitle(world, commander) : 'soldiers');
        }
        camp.captives = [];
        if (commander && commander.status === 'alive') { commander.renown += 12; P().remember(world, commander, `destroyed the Ashfang at ${camp.name}`, 'pride', null, 3); }
        for (const s of soldiers) if (s.status === 'alive') s.renown += 3;
        ECHO.Chronicle.add(world, { text: `Soldiers of ${world.factions[j.army.faction].short}${commander ? ' under ' + P().fullTitle(world, commander) : ''} stormed ${camp.name}. ${camp.members.filter(id => world.npcs[id] && world.npcs[id].status === 'alive').length ? 'A few outlaws escaped into the woods.' : 'None of the outlaws survived.'}`, kind: 'war', importance: 2, x: camp.x, y: camp.y });
        Pol.campSuccession(world, camp);
        camp.loot.food = 0;
      } else {
        for (const s of soldiers) if (rng.chance(0.35)) P().kill(world, s, 'killed attacking ' + camp.name);
        for (const b of bandits) if (rng.chance(0.15)) P().kill(world, b, 'killed defending ' + camp.name);
        ECHO.Chronicle.add(world, { text: `An attack on ${camp.name} failed. The Ashfang grow bolder.`, kind: 'war', importance: 2, x: camp.x, y: camp.y });
        for (const id of camp.members) { const b = world.npcs[id]; if (b && b.status === 'alive') b.renown += 3; }
      }
      Pol.armyGoHome(world, soldiers.filter(s => s.status === 'alive'), at);
    },

    armyGoHome(world, soldiers, at) {
      for (const s of soldiers) {
        s.journey = null;
        if (at && s.home !== at.id) { s.loc = at.id; ECHO.Sim.startJourney(world, { kind: 'return', npcs: [s.id], from: at.id, to: s.home, speed: 3 }); }
        else s.loc = s.home;
      }
    },

    armyArrive(world, j) {
      const rng = ECHO.Sim.rngFor(world);
      if (j.army.type === 'camp') return Pol.battleCamp(world, j, rng);
      return Pol.battleSettlement(world, j, rng);
    },

    // ------------------------------------------------------------ Unrest
    unrest(world, rng) {
      for (const s of world.settlements) {
        const ruler = s.ruler && world.npcs[s.ruler];
        const f = world.factions[s.faction];
        let d = s.hunger * 4.2 - 1.1 - Math.min(2, s.garrison * 0.1);
        if (f && f.taxRate > 0.12) d += (f.taxRate - 0.12) * 40;
        if (ruler && P().has(ruler, 'cruel')) d += 0.4;
        if (ruler && P().has(ruler, 'kind')) d -= 0.3;
        if (s.prosperity > 60) d -= 0.5;
        const priests = P().residents(world, s).filter(n => n.prof === 'priest').length;
        d -= priests * 0.15;
        s.unrest = U.clamp(s.unrest + d, 0, 100);
        if (s.unrest > 72 && rng.chance(0.15)) {
          s.stock.food *= 0.8; s.prosperity -= 6;
          const rioters = P().residents(world, s).filter(n => n.prof !== 'guard' && n.prof !== 'child');
          if (rioters.length && rng.chance(0.3)) P().kill(world, rng.pick(rioters), 'trampled in the bread riots');
          ECHO.Chronicle.add(world, { text: `Riots broke out in ${s.name}. The granary was stormed${ruler ? ' and ' + P().fullTitle(world, ruler) + ' was jeered in the street' : ''}.`, kind: 'politics', importance: 2, sid: s.id });
          s.unrest -= 8;
        }
        if (s.unrest > 92 && world.day - (s.lastRevolt || -999) > 45 && rng.chance(0.25)) Pol.revolt(world, s, rng);
      }
    },

    revolt(world, s, rng) {
      const f = world.factions[s.faction];
      const ruler = s.ruler && world.npcs[s.ruler];
      s.unrest = 35;
      s.lastRevolt = world.day;
      if (f && f.capital === s.id && f.type === 'kingdom') {
        const cands = P().residents(world, s).filter(n => n.id !== (ruler && ruler.id) && P().age(world, n) > 20 && n.prof !== 'child');
        cands.sort((a, b) => (b.renown + (P().has(b, 'ambitious') ? 20 : 0) + b.wealth * 0.05) - (a.renown + (P().has(a, 'ambitious') ? 20 : 0) + a.wealth * 0.05));
        const usurper = cands[0];
        if (usurper) Pol.crown(world, f, usurper, 'seized the throne of ' + f.short + ' in the revolt');
        if (ruler && ruler !== usurper) { if (rng.chance(0.6)) P().kill(world, ruler, 'executed by the mob'); else { ruler.title = ''; ruler.prof = 'elder'; P().remember(world, ruler, 'lost the throne to the mob', 'trauma', null, 4); } }
        f.taxRate = 0.08;
      } else if (f && f.type === 'kingdom') {
        const other = s.faction === 'valdren' ? 'ashmere' : 'valdren';
        const oc = ECHO.Sim.settlement(world, world.factions[other].capital);
        const otherBetter = !world.factions[other].fallen && oc && oc.hunger < s.hunger - 0.2 && world.factions[other].relations[f.id] < 0;
        if (otherBetter) {
          if (ruler && rng.chance(0.5)) P().kill(world, ruler, 'killed by rebels');
          Pol.flipSettlement(world, s, other, 'revolted against ' + f.short + ' and swore to ' + world.factions[other].short);
        } else {
          if (ruler) { ruler.title = ''; if (ruler.prof === 'reeve') ruler.prof = 'farmer'; P().remember(world, ruler, 'was driven out of office by an angry crowd', 'trauma', null, 4); }
          ECHO.Chronicle.add(world, { text: `The people of ${s.name} rose up and drove out ${ruler ? P().name(ruler) : 'their reeve'}.`, kind: 'politics', importance: 2, sid: s.id });
          Pol.newReeve(world, s);
        }
      }
    },

    crown(world, f, n, how) {
      const old = f.ruler && world.npcs[f.ruler];
      if (old && old.status !== 'dead' && old !== n) old.title = '';
      f.ruler = n.id;
      n.prof = 'ruler';
      n.title = f.type === 'order' ? 'High Wick' : n.sex === 'f' ? 'Queen' : 'King';
      n.renown = Math.max(n.renown, 40);
      n.rank = 0;
      const cap = ECHO.Sim.settlement(world, f.capital);
      if (cap) {
        cap.ruler = n.id;
        if (n.home !== cap.id) {
          const oldHome = ECHO.Sim.settlement(world, n.home);
          if (oldHome) oldHome.residents = oldHome.residents.filter(x => x !== n.id);
          n.home = cap.id; n.loc = cap.id; if (!cap.residents.includes(n.id)) cap.residents.push(n.id);
        }
      }
      P().remember(world, n, how, 'pride', null, 5);
      ECHO.Chronicle.add(world, { text: `${P().fullTitle(world, n)} ${how}.`, kind: 'politics', importance: 3, sid: f.capital, npcs: [n.id] });
    },

    succession(world, f, dead) {
      const kids = dead.kids.map(id => world.npcs[id]).filter(k => k && k.status === 'alive' && P().age(world, k) >= 16 && k.faction === f.id);
      kids.sort((a, b) => a.born - b.born);
      let heir = kids[0];
      if (!heir) {
        const cap = ECHO.Sim.settlement(world, f.capital);
        const pool = (cap ? P().residents(world, cap) : P().alive(world).filter(n => n.faction === f.id)).filter(n => P().age(world, n) > 22 && n.id !== dead.id && n.prof !== 'child');
        if (f.type === 'order') pool.sort((a, b) => (b.prof === 'priest') - (a.prof === 'priest') || (a.born - b.born));
        else pool.sort((a, b) => (b.renown + b.rank * 10) - (a.renown + a.rank * 10));
        heir = pool[0];
      }
      if (!heir) { f.ruler = null; return; }
      Pol.crown(world, f, heir, f.type === 'order' ? 'was raised to High Wick of the Lantern' : kids[0] ? `inherited the throne of ${f.short} from ${dead.first}` : `was chosen to rule ${f.short} after the death of ${dead.first}`);
    },

    newReeve(world, s) {
      const pool = P().residents(world, s).filter(n => P().age(world, n) > 24 && n.prof !== 'child' && n.prof !== 'bandit');
      const ambition = n => (n.mind && n.mind.goal && n.mind.goal.kind === 'lead' ? 60 : 0);
      pool.sort((a, b) => (b.wealth + b.renown * 3 + ambition(b)) - (a.wealth + a.renown * 3 + ambition(a)));
      const r = pool[0];
      if (!r) { s.ruler = null; return; }
      s.ruler = r.id; r.title = 'Reeve'; r.prof = r.prof === 'guard' ? 'guard' : 'reeve';
      ECHO.Chronicle.add(world, { text: `${P().name(r)} became reeve of ${s.name}.`, kind: 'politics', importance: 1, sid: s.id, npcs: [r.id] });
    },

    flipSettlement(world, s, toFaction, how) {
      const from = s.faction;
      s.faction = toFaction;
      for (const n of P().residents(world, s)) {
        if (n.prof === 'guard' && n.faction === from) { n.prof = 'farmer'; n.rank = 0; }
        n.faction = toFaction;
      }
      if (s.ruler) { const r = world.npcs[s.ruler]; if (r && world.factions[from].capital !== s.id) r.title = ''; }
      ECHO.Chronicle.add(world, { text: `${s.name} ${how}.`, kind: 'war', importance: 3, sid: s.id });
      // Faction collapse check
      const fFrom = world.factions[from];
      if (fFrom.capital === s.id) {
        const others = world.settlements.filter(x => x.faction === from);
        if (others.length) {
          const nc = others.reduce((a, b) => a.residents.length > b.residents.length ? a : b);
          fFrom.capital = nc.id;
          ECHO.Chronicle.add(world, { text: `${fFrom.name} moved its court to ${nc.name}.`, kind: 'politics', importance: 2, sid: nc.id });
        } else {
          fFrom.fallen = world.day;
          ECHO.Chronicle.add(world, { text: `${fFrom.name} has fallen. Its last town is lost.`, kind: 'era', importance: 3 });
          for (const other of Object.keys(fFrom.atWar)) Pol.makePeace(world, fFrom, world.factions[other], true);
        }
      }
      world._routes = {};
    },

    // ------------------------------------------------------------ Diplomacy & war
    diplomacy(world, rng) {
      const a = world.factions.valdren, b = world.factions.ashmere;
      if (a.fallen || b.fallen) return;
      const capA = ECHO.Sim.settlement(world, a.capital), capB = ECHO.Sim.settlement(world, b.capital);
      const hunger = (capA ? capA.hunger : 0) + (capB ? capB.hunger : 0);
      const avgHunger = U.sum(world.settlements.filter(s => s.faction === 'valdren' || s.faction === 'ashmere').map(s => s.hunger)) / 7;
      let d = (-12 - a.relations.ashmere) * 0.02 - hunger * 1.2 - avgHunger * 1.5;
      const trade = (world.journeys || []).filter(j => j.kind === 'caravan' && ((j.meta.fromFaction === 'valdren' && ECHO.Sim.settlement(world, j.to).faction === 'ashmere') || (j.meta.fromFaction === 'ashmere' && ECHO.Sim.settlement(world, j.to).faction === 'valdren'))).length;
      d += trade * 0.12;
      const ra = a.ruler && world.npcs[a.ruler], rb = b.ruler && world.npcs[b.ruler];
      for (const r of [ra, rb]) if (r) {
        if (P().has(r, 'ambitious') || P().has(r, 'hot-headed') || P().has(r, 'cruel')) d -= 0.25;
        if (P().has(r, 'kind') || P().has(r, 'patient')) d += 0.2;
      }
      if (rng.chance(0.03)) {
        d -= 6;
        const sid = rng.pick(world.settlements.filter(s => s.faction === 'valdren' || s.faction === 'ashmere')).id;
        ECHO.Chronicle.add(world, { text: rng.pick([`A border patrol from ${a.short} clashed with ${b.short} riders. Each side blames the other.`, `${b.short} accused ${a.short} of hoarding grain from the shared markets.`, `A ${a.short} tax collector was found dead on ${b.short} land.`]), kind: 'politics', importance: 1, sid });
      }
      if (a.atWar.ashmere) d = 0;
      a.relations.ashmere = b.relations.valdren = U.clamp(a.relations.ashmere + d, -100, 100);
      const rel = a.relations.ashmere;
      if (!a.atWar.ashmere && rel < -55) {
        const p = 0.035 * (1 + hunger * 2 + (ra && P().has(ra, 'ambitious') ? 0.6 : 0) + (rb && P().has(rb, 'ambitious') ? 0.6 : 0));
        if (rng.chance(p)) {
          const aggressor = (capA ? capA.hunger : 0) + (ra && P().has(ra, 'ambitious') ? 0.3 : 0) > (capB ? capB.hunger : 0) + (rb && P().has(rb, 'ambitious') ? 0.3 : 0) ? a : b;
          const other = aggressor === a ? b : a;
          Pol.declareWar(world, aggressor, other);
        }
      }
    },
    declareWar(world, a, b) {
      a.atWar[b.id] = world.day; b.atWar[a.id] = world.day;
      a.warDays = 0; b.warDays = 0; a.casualties = 0; b.casualties = 0;
      world.stats.wars++;
      const r = a.ruler && world.npcs[a.ruler];
      const why = ECHO.Sim.settlement(world, a.capital) && ECHO.Sim.settlement(world, a.capital).hunger > 0.2 ? ' Hunger, they say, drove the decision.' : '';
      ECHO.Chronicle.add(world, { text: `WAR. ${r ? P().fullTitle(world, r) + ' of ' + a.short : a.name} declared war upon ${b.name}.${why}`, kind: 'war', importance: 3, sid: a.capital });
    },
    makePeace(world, a, b, silent) {
      delete a.atWar[b.id]; delete b.atWar[a.id];
      a.relations[b.id] = b.relations[a.id] = -25;
      if (!silent) ECHO.Chronicle.add(world, { text: `Peace between ${a.name} and ${b.name}, after ${a.warDays} days of war and ${a.casualties + b.casualties} dead.`, kind: 'war', importance: 3 });
    },
    wars(world, rng) {
      for (const f of Object.values(world.factions)) {
        if (f.type !== 'kingdom') continue;
        for (const eid of Object.keys(f.atWar)) {
          const e = world.factions[eid];
          if (f.id < eid) {
            f.warDays++; e.warDays++;
            const pPeace = 0.004 * f.warDays / 10 + (f.casualties + e.casualties) * 0.0015;
            if (rng.chance(pPeace)) { Pol.makePeace(world, f, e); continue; }
          }
          // Dispatch an army
          if ((world.journeys || []).some(j => j.kind === 'army' && j.army.faction === f.id && j.army.type === 'war')) continue;
          if (!rng.chance(0.1)) continue;
          const cap = ECHO.Sim.settlement(world, f.capital);
          if (!cap || cap.faction !== f.id) continue;
          const soldiers = P().residents(world, cap).filter(n => n.prof === 'guard' && !n.journey);
          if (soldiers.length < 6) continue;
          const targets = world.settlements.filter(s => s.faction === eid);
          if (!targets.length) continue;
          const target = targets.reduce((x, y) => ECHO.Sim.roadDistance(world, cap.id, x.id) - Pol.settlementStrength(world, x) * 0.3 < ECHO.Sim.roadDistance(world, cap.id, y.id) - Pol.settlementStrength(world, y) * 0.3 ? x : y);
          const force = soldiers.sort((x, y) => y.rank - x.rank).slice(0, Math.max(4, soldiers.length - 3));
          const commander = force[0];
          const j = ECHO.Sim.startJourney(world, { kind: 'army', npcs: force.map(n => n.id), from: cap.id, to: target.id, speed: 2.4, army: { faction: f.id, target: target.id, type: 'war', commander: commander.id } });
          if (j) ECHO.Chronicle.add(world, { text: `${P().fullTitle(world, commander)} leads ${force.length} soldiers of ${f.short} toward ${target.name}.`, kind: 'war', importance: 2, sid: cap.id, npcs: [commander.id] });
        }
      }
    },
    battleSettlement(world, j, rng) {
      const s = ECHO.Sim.settlement(world, j.army.target);
      const f = world.factions[j.army.faction];
      const soldiers = j.npcs.map(id => world.npcs[id]).filter(n => n && n.status === 'alive');
      const commander = world.npcs[j.army.commander];
      if (!s || s.faction === f.id || !f.atWar[s.faction]) {
        Pol.armyGoHome(world, soldiers, s);
        return;
      }
      const enemyF = world.factions[s.faction];
      let atk = U.sum(soldiers.map(n => 12 + n.skill.fight * 0.7 + n.rank * 6)) * (1 + f.tech.era * 0.08) * (f.doctrines.shields ? 1.05 : 1);
      if (ECHO.Civ.has(world, f.id, 'crossbows')) atk *= 1.12;
      const def = Pol.settlementStrength(world, s);
      const ratio = (atk * rng.range(0.75, 1.25)) / (def * rng.range(0.75, 1.25));
      const defenders = P().residents(world, s).filter(n => n.prof === 'guard');
      let dA = 0, dD = 0;
      for (const n of soldiers) if (rng.chance(U.clamp(0.25 / ratio, 0.05, 0.6))) { P().kill(world, n, `fell in the battle for ${s.name}`); dA++; }
      for (const n of defenders) if (rng.chance(U.clamp(0.3 * ratio, 0.05, 0.8))) { P().kill(world, n, `died defending ${s.name}`, commander ? P().name(commander) : null); dD++; }
      f.casualties += dA; enemyF.casualties += dD;
      const survivors = soldiers.filter(n => n.status === 'alive');
      if (ratio > 1 && survivors.length) {
        if (commander && commander.status === 'alive') { commander.renown += 15; P().remember(world, commander, `took ${s.name} by the sword`, 'pride', null, 4); }
        for (const n of survivors) n.renown += 4;
        Pol.flipSettlement(world, s, f.id, `fell to ${f.short}${commander && commander.status === 'alive' ? ', taken by ' + P().fullTitle(world, commander) : ''}`);
        // Half the army garrisons the conquest
        survivors.forEach((n, i) => {
          if (i % 2 === 0) {
            const oldHome = ECHO.Sim.settlement(world, n.home);
            if (oldHome) oldHome.residents = oldHome.residents.filter(x => x !== n.id);
            n.home = s.id; n.loc = s.id; n.journey = null; if (!s.residents.includes(n.id)) s.residents.push(n.id);
          }
        });
        if (s.kind === 'village' && commander && commander.status === 'alive') { s.ruler = commander.id; }
        Pol.armyGoHome(world, survivors.filter(n => n.home !== s.id), s);
        for (const n of P().residents(world, s)) P().remember(world, n, `saw ${s.name} conquered by ${f.short}`, 'trauma', null, 3);
      } else {
        ECHO.Chronicle.add(world, { text: `${s.name} held against ${f.short}. ${dA} attackers and ${dD} defenders fell.`, kind: 'war', importance: 2, sid: s.id });
        for (const n of defenders) if (n.status === 'alive') n.renown += 5;
        Pol.armyGoHome(world, survivors, s);
      }
    }
  };
})();
