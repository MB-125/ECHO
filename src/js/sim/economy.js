// Economy: settlements produce from their people and land, eat, trade by
// caravan, and set prices from scarcity. Crop yields come straight from the
// regional ecology, so a vermin plague becomes a price spike becomes unrest.
(function () {
  const { U } = ECHO;

  const GOODS = ECHO.GOODS = {
    food: { name: 'Food', base: 4, unit: 'sack' },
    ore: { name: 'Ore', base: 7, unit: 'load' },
    arms: { name: 'Arms', base: 24, unit: 'bundle' },
    herbs: { name: 'Herbs', base: 9, unit: 'bundle' },
    timber: { name: 'Timber', base: 3, unit: 'log' }
  };
  const SEASON_YIELD = [0.75, 1.15, 1.55, 0.4];

  const Eco = ECHO.Economy = {
    GOODS,
    need(world, s) {
      let need = 0;
      for (const n of ECHO.People.residents(world, s)) need += n.prof === 'child' ? 0.6 : n.prof === 'guard' ? 1.2 : 1;
      return Math.max(1, need);
    },
    init(world, rng) {
      for (const s of world.settlements) {
        const need = Eco.need(world, s);
        s.stock.food = need * rng.range(8, 12);
        s.stock.ore = rng.range(10, 30);
        s.stock.arms = rng.range(6, 16);
        s.stock.herbs = rng.range(5, 15);
        s.stock.timber = rng.range(20, 40);
        s.cropFactor = 1;
        const res = ECHO.People.residents(world, s);
        s._farmers = res.filter(n => n.prof === 'farmer').length;
        s._hunters = res.filter(n => n.prof === 'hunter').length;
        s.foundingPop = res.length;
        Eco.updatePrices(world, s);
      }
    },
    updatePrices(world, s) {
      const need = Eco.need(world, s);
      const target = { food: need * 7, ore: 25, arms: 14 + s.garrison * 0.8, herbs: 12, timber: 30 };
      for (const g in GOODS) {
        const ratio = target[g] / (s.stock[g] + target[g] * 0.12);
        let p = GOODS[g].base * Math.pow(ratio, 0.75);
        if (g === 'food') p *= (1 + s.hunger * 1.2) * (1 + (1 - (s.cropFactor || 1)) * 0.9);
        if (g === 'arms' && Object.keys(world.factions[s.faction] ? world.factions[s.faction].atWar : {}).length) p *= 1.5;
        s.prices[g] = U.round1(U.clamp(p, GOODS[g].base * 0.35, GOODS[g].base * 9));
      }
    },
    dailyTick(world, rng) {
      const season = ECHO.TIME.dateOf(world.day).seasonIdx;
      for (const s of world.settlements) {
        const region = ECHO.World.regionAt(world, s.x, s.y);
        s.cropFactor = region.eco ? region.eco.crop : 1;
        const residents = ECHO.People.residents(world, s);
        const counts = {};
        for (const n of residents) counts[n.prof] = (counts[n.prof] || 0) + 1;
        s._hunters = counts.hunter || 0;
        s._farmers = counts.farmer || 0;
        s.garrison = (counts.guard || 0);
        const fac = s.faction;
        const civ = (k) => ECHO.Civ.has(world, fac, k);
        // --- Production
        const farmers = counts.farmer || 0;
        const farmCap = Math.max(4, s.farmTiles / 5);
        const effFarmers = Math.min(farmers, farmCap) + Math.max(0, farmers - farmCap) * 0.3;
        let food = effFarmers * 4.6 * s.cropFactor * SEASON_YIELD[season] * (civ('mills') ? 1.25 : 1) * (civ('aetherwells') ? 1.15 : 1);
        if (region.eco) food += (counts.hunter || 0) * 2.0 * U.clamp(region.eco.hare / (ECHO.Ecology.capacity(region).hare * 0.45), 0.15, 1.1);
        s.stock.food += food;
        s.stock.ore += (counts.miner || 0) * (region.hill > 0.06 ? 1.2 : 0.35);
        s.stock.timber += (counts.woodcutter || 0) * 1.3;
        s.stock.herbs += (counts.herbalist || 0) * 0.8 + (counts.priest || 0) * 0.1;
        const smithWork = Math.min((counts.smith || 0) * 1.2, s.stock.ore);
        s.stock.ore -= smithWork;
        s.stock.arms += smithWork * 0.7 * (civ('tempered') ? 1.2 : 1);
        s._lastFood = food;
        // --- Consumption
        const need = Eco.need(world, s);
        if (s.stock.food >= need) { s.stock.food -= need; s.hunger = Math.max(0, s.hunger - 0.25); }
        else {
          const short = 1 - s.stock.food / need;
          s.stock.food = 0;
          s.hunger = U.clamp(s.hunger * 0.5 + short * 0.7, 0, 1);
        }
        s.stock.food *= 0.99;
        s.stock.arms = Math.max(0, s.stock.arms - s.garrison * 0.012);
        s.stock.herbs *= 0.995;
        // --- Famine bookkeeping
        if (s.hunger > 0.35 && world.day - s.lastFamineDay > 20) {
          s.lastFamineDay = world.day;
          world.stats.famines++;
          ECHO.Chronicle.add(world, { text: `Hunger has come to ${s.name}. Granaries are empty and bread costs ${s.prices.food} crowns a loaf.`, kind: 'economy', importance: 2, sid: s.id });
        }
        // --- Prosperity & taxes
        const avgWealth = residents.length ? U.sum(residents.map(n => n.wealth)) / residents.length : 0;
        s.prosperity = U.clamp(U.lerp(s.prosperity, 30 + avgWealth * 0.6 - s.hunger * 40 + Math.min(20, s.stock.food / need), 0.08), 0, 100);
        const f = world.factions[fac];
        if (f && f.type !== 'bandits') {
          const tax = residents.length * 0.22 * (f.taxRate * 10) * (1 - s.hunger) * (0.6 + s.prosperity / 100);
          f.treasury += tax;
          s.wealth = U.clamp(s.wealth + residents.length * 0.05 - tax * 0.1, 0, 5000);
          if (f.type === 'kingdom') f.treasury -= s.garrison * 0.32;
        }
        Eco.updatePrices(world, s);
        s.priceHistory.push(s.prices.food);
        if (s.priceHistory.length > 40) s.priceHistory.shift();
      }
      // Kingdom treasuries in debt cause desertion.
      for (const f of Object.values(world.factions)) {
        if (f.type !== 'kingdom' || f.treasury >= 0) continue;
        f.treasury = Math.max(f.treasury, -200);
        const soldiers = ECHO.People.alive(world).filter(n => n.faction === f.id && n.prof === 'guard' && !n.rank && n.loc);
        if (soldiers.length && rng.chance(0.2)) {
          const d = rng.pick(soldiers);
          d.prof = rng.chance(0.5) ? 'farmer' : 'wanderer';
          ECHO.People.remember(world, d, 'deserted when the soldiers\' pay stopped', 'change', null, 2);
        }
      }
      Eco.startCaravans(world, rng);
      Eco.sendAid(world, rng);
    },

    startCaravans(world, rng) {
      for (const s of world.settlements) {
        if (s.faction === 'ashfang') continue;
        const merchants = ECHO.People.residents(world, s).filter(n => n.prof === 'merchant' && !n.journey);
        for (const m of merchants) {
          if (!rng.chance(0.18)) continue;
          let best = null, bestProfit = 25;
          for (const t of world.settlements) {
            if (t === s || t.faction === 'ashfang') continue;
            const ft = world.factions[t.faction], fs = world.factions[s.faction];
            if (fs.atWar[t.faction] || ft.atWar[s.faction]) continue;
            const route = ECHO.Sim.route(world, s.id, t.id);
            if (!route) continue;
            // Danger along the way
            const danger = U.sum(route.roads.map(rid => (world.roads.find(r => r.id === rid) || {}).danger || 0));
            const nerve = ECHO.People.has(m, 'brave') ? 1.8 : ECHO.People.has(m, 'cowardly') ? 0.4 : 1;
            if (danger > nerve * 1.2) continue;
            for (const g of ['food', 'ore', 'arms', 'herbs', 'timber']) {
              const reserve = g === 'food' ? Eco.need(world, s) * 14 : 6;
              const avail = Math.max(0, s.stock[g] - reserve);
              const qty = Math.min(avail, g === 'arms' ? 6 : g === 'food' ? 30 : 15);
              if (qty < 3) continue;
              const profit = (t.prices[g] * 0.92 - s.prices[g]) * qty - route.len * 0.05 - danger * 20;
              if (profit > bestProfit) { bestProfit = profit; best = { t, g, qty, route }; }
            }
          }
          if (!best) continue;
          s.stock[best.g] -= best.qty;
          const cost = best.qty * s.prices[best.g];
          m.wealth = Math.max(0, m.wealth - cost * 0.3);
          ECHO.Sim.startJourney(world, { kind: 'caravan', npcs: [m.id], from: s.id, to: best.t.id, speed: 2.8, cargo: { [best.g]: best.qty }, meta: { buy: s.prices[best.g], owner: m.id, home: s.id, fromFaction: s.faction } });
        }
      }
    },

    sendAid(world, rng) {
      for (const f of Object.values(world.factions)) {
        if (f.type !== 'kingdom' && f.type !== 'order') continue;
        const cap = ECHO.Sim.settlement(world, f.capital);
        if (!cap || cap.faction !== f.id) continue;
        const capNeed = Eco.need(world, cap);
        if (cap.stock.food < capNeed * 9) continue;
        for (const s of world.settlements) {
          if (s === cap || s.faction !== f.id || s.hunger < 0.2) continue;
          if ((world.journeys || []).some(j => j.kind === 'aid' && j.to === s.id)) continue;
          if (!rng.chance(0.35)) continue;
          const qty = Math.min(cap.stock.food - capNeed * 6, Eco.need(world, s) * 6);
          if (qty < 10) continue;
          cap.stock.food -= qty;
          const guards = ECHO.People.residents(world, cap).filter(n => n.prof === 'guard' && !n.rank && !n.journey).slice(0, 2);
          const j = ECHO.Sim.startJourney(world, { kind: 'aid', npcs: guards.map(g => g.id), from: cap.id, to: s.id, speed: 2.6, cargo: { food: qty }, meta: { faction: f.id, fromFaction: f.id } });
          if (j) ECHO.Chronicle.add(world, { text: `${f.name} sent ${Math.round(qty)} sacks of grain from ${cap.name} to the hungry of ${s.name}.`, kind: 'economy', importance: 1, sid: cap.id });
        }
      }
    },

    caravanArrive(world, j) {
      const t = ECHO.Sim.settlement(world, j.to);
      if (!t || !j.cargo) return;
      let revenue = 0;
      for (const g in j.cargo) {
        t.stock[g] += j.cargo[g];
        if (j.kind === 'caravan') revenue += j.cargo[g] * t.prices[g] * 0.92;
      }
      if (j.kind === 'caravan') {
        const m = world.npcs[j.meta.owner];
        if (m && m.status === 'alive') {
          m.wealth += revenue * 0.35;
          // Merchants relocate toward opportunity.
          const home = ECHO.Sim.settlement(world, m.home);
          if (home && home !== t && t.prosperity > home.prosperity + 22 && ECHO.Sim.rngFor(world).chance(0.25)) {
            home.residents = home.residents.filter(x => x !== m.id);
            m.home = t.id; m.loc = t.id;
            if (!t.residents.includes(m.id)) t.residents.push(m.id);
            ECHO.People.remember(world, m, `moved their trade from ${home.name} to ${t.name}`, 'change', null, 2);
            ECHO.Chronicle.add(world, { text: `The merchant ${ECHO.People.name(m)} has moved from struggling ${home.name} to ${t.name}.`, kind: 'economy', importance: 1, sid: home.id, npcs: [m.id] });
            return;
          }
          // Head home afterwards
          if (m.home && m.home !== t.id) {
            m.loc = t.id;
            ECHO.Sim.startJourney(world, { kind: 'return', npcs: [m.id], from: t.id, to: m.home, speed: 3 });
          }
        }
      } else if (j.kind === 'aid') {
        t.hunger = Math.max(0, t.hunger - 0.2);
        for (const n of ECHO.People.residents(world, t)) n.op['faction:' + j.meta.faction] = (n.op['faction:' + j.meta.faction] || 0) + 5;
        // escorts go home
        for (const id of j.npcs) { const g = world.npcs[id]; if (g && g.status === 'alive') { g.loc = t.id; ECHO.Sim.startJourney(world, { kind: 'return', npcs: [g.id], from: t.id, to: g.home, speed: 3 }); } }
      }
      Eco.updatePrices(world, t);
    },

    bestPlaceToLive(world, n, from) {
      let best = null, bv = -Infinity;
      for (const s of world.settlements) {
        if (s === from || s.faction === 'ashfang') continue;
        let v = -s.hunger * 100 + s.prosperity * 0.4 - ECHO.Sim.roadDistance(world, from.id, s.id) * 0.15 - s.unrest * 0.3;
        if (s.faction === n.faction) v += 15;
        if (v > bv) { bv = v; best = s; }
      }
      return best;
    }
  };
})();
