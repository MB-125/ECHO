// Simulation orchestrator: time, journeys along the road network, and the
// order in which world systems update each hour and each day.
(function () {
  const { U } = ECHO;
  const T = ECHO.TIME;

  const Sim = ECHO.Sim = {
    settlement(world, id) {
      if (!world._sById || world._sByIdN !== world.settlements.length) {
        world._sById = {}; world._sByIdN = world.settlements.length;
        for (const s of world.settlements) world._sById[s.id] = s;
      }
      return world._sById[id];
    },
    rngFor(world) {
      if (!world._rng) world._rng = new ECHO.RNG(world.rngState || world.seed);
      return world._rng;
    },

    // ------------------------------------------------------------ Road routing
    roadGraph(world) {
      if (world._graph) return world._graph;
      const g = {};
      for (const s of world.settlements) g[s.id] = [];
      for (const r of world.roads) {
        if (!g[r.a] || !g[r.b]) continue;
        g[r.a].push({ to: r.b, road: r, rev: false });
        g[r.b].push({ to: r.a, road: r, rev: true });
      }
      world._graph = g;
      return g;
    },
    route(world, fromId, toId) {
      if (fromId === toId) return null;
      world._routes = world._routes || {};
      const key = fromId + '>' + toId;
      if (world._routes[key]) return world._routes[key];
      const g = Sim.roadGraph(world);
      const dist = {}, prev = {}, q = new Set(Object.keys(g));
      for (const k of q) dist[k] = Infinity;
      dist[fromId] = 0;
      while (q.size) {
        let u = null;
        for (const k of q) if (u === null || dist[k] < dist[u]) u = k;
        if (dist[u] === Infinity) break;
        q.delete(u);
        if (u === toId) break;
        for (const e of g[u]) {
          const d = dist[u] + e.road.len * (1 + e.road.danger * 0.5);
          if (d < dist[e.to]) { dist[e.to] = d; prev[e.to] = { from: u, e }; }
        }
      }
      if (!prev[toId]) return null;
      const legs = [];
      for (let c = toId; c !== fromId; c = prev[c].from) legs.unshift(prev[c].e);
      let path = [];
      const roads = [];
      for (const e of legs) {
        const seg = e.rev ? e.road.path.slice().reverse() : e.road.path;
        path = path.concat(path.length ? seg.slice(1) : seg);
        roads.push(e.road.id);
      }
      const res = { path, roads, len: path.length };
      world._routes[key] = res;
      return res;
    },
    roadDistance(world, a, b) {
      const r = Sim.route(world, a, b);
      return r ? r.len : U.dist(Sim.settlement(world, a).x, Sim.settlement(world, a).y, Sim.settlement(world, b).x, Sim.settlement(world, b).y) * 1.5;
    },

    // ------------------------------------------------------------ Journeys
    // A journey moves real people (and goods/armies) along roads in real time.
    startJourney(world, o) {
      const route = Sim.route(world, o.from, o.to);
      if (!route) return null;
      const j = {
        id: U.uid('j'), kind: o.kind, npcs: o.npcs || [], from: o.from, to: o.to, path: route.path, roads: route.roads,
        pos: 0, speed: o.speed || 3.2, cargo: o.cargo || null, army: o.army || null, startDay: world.day, meta: o.meta || {}
      };
      for (const id of j.npcs) { const n = world.npcs[id]; if (n) { n.loc = null; n.journey = j.id; } }
      world.journeys = world.journeys || [];
      world.journeys.push(j);
      if (ECHO.Disease) ECHO.Disease.onJourneyStart(world, j);
      return j;
    },
    journeyPos(world, j) {
      const i = U.clamp(Math.floor(j.pos), 0, j.path.length - 1);
      const k = U.clamp(i + 1, 0, j.path.length - 1);
      const f = j.pos - i;
      const a = j.path[i], b = j.path[k];
      const ax = a % world.W, ay = (a / world.W) | 0, bx = b % world.W, by = (b / world.W) | 0;
      return { x: U.lerp(ax, bx, f) + 0.5, y: U.lerp(ay, by, f) + 0.5 };
    },
    endJourney(world, j, arrived) {
      world.journeys = world.journeys.filter(x => x !== j);
      const dest = Sim.settlement(world, arrived ? j.to : j.from);
      for (const id of j.npcs) {
        const n = world.npcs[id];
        if (!n || n.status === 'dead') continue;
        n.journey = null;
        if (n.status === 'captive') continue;
        if (j.kind === 'outlaw') continue; // handled by politics
        n.loc = dest ? dest.id : n.home;
        if (j.kind === 'migrate' && dest) {
          const old = Sim.settlement(world, n.home);
          if (old) old.residents = old.residents.filter(x => x !== id);
          n.home = dest.id;
          if (!dest.residents.includes(id)) dest.residents.push(id);
          if (dest.faction !== 'ashfang' && world.factions[dest.faction].type !== 'bandits') n.faction = dest.faction;
        }
      }
      if (ECHO.Disease) ECHO.Disease.onJourneyEnd(world, j, arrived);
      ECHO.emit('journey:end', { journey: j, arrived });
      if (arrived) {
        if (j.kind === 'caravan' || j.kind === 'aid') ECHO.Economy.caravanArrive(world, j);
        if (j.kind === 'army') ECHO.Politics.armyArrive(world, j);
        if (j.kind === 'hero') ECHO.Plights.heroArrive(world, j);
      }
    },
    migrate(world, n, from, to, why) {
      const j = Sim.startJourney(world, { kind: 'migrate', npcs: [n.id], from: from.id, to: to.id, speed: 2.6, meta: { why } });
      if (!j) return;
      ECHO.People.remember(world, n, `left ${from.name} for ${to.name}${why === 'hunger' ? ' to escape hunger' : ''}`, 'change', null, 2);
      // Families travel together.
      if (n.spouse) {
        const sp = world.npcs[n.spouse];
        if (sp && sp.status === 'alive' && sp.loc === from.id) { j.npcs.push(sp.id); sp.loc = null; sp.journey = j.id; }
      }
      for (const k of n.kids) {
        const kid = world.npcs[k];
        if (kid && kid.status === 'alive' && kid.prof === 'child' && kid.loc === from.id) { j.npcs.push(kid.id); kid.loc = null; kid.journey = j.id; }
      }
      from._emigrants = (from._emigrants || 0) + j.npcs.length;
    },
    updateJourneys(world, hours, rng) {
      const list = (world.journeys || []).slice();
      for (const j of list) {
        // Danger on the road: bandits and wolves.
        const p = Sim.journeyPos(world, j);
        const region = ECHO.World.regionAt(world, p.x, p.y);
        const danger = Sim.roadDanger(world, p.x, p.y, region);
        if (j.kind !== 'army' && danger > 0 && !j.meta.playerEscort) {
          const pAttack = hours * danger * (j.kind === 'caravan' || j.kind === 'aid' ? 0.035 : 0.012);
          if (rng.chance(pAttack)) {
            ECHO.Politics.ambush(world, j, p, region, rng);
            if (!world.journeys.includes(j)) continue;
          }
        }
        let speed = j.speed;
        if (j.kind === 'caravan' && j.meta.fromFaction && ECHO.Civ.has(world, j.meta.fromFaction, 'carriages')) speed *= 1.6;
        j.pos += speed * hours;
        if (j.pos >= j.path.length - 1) Sim.endJourney(world, j, true);
      }
    },
    roadDanger(world, x, y, region) {
      let d = 0;
      for (const c of world.camps) {
        if (!c.members.length) continue;
        const dist = U.dist(x, y, c.x, c.y);
        if (dist < 28) d += (c.members.length / 6) * (1 - dist / 28);
      }
      if (region && region.eco) d += Math.max(0, region.eco.wolfDanger - 0.7) * 0.6;
      return d;
    },

    // ------------------------------------------------------------ Ticks
    hourlyTick(world, hours) {
      const rng = Sim.rngFor(world);
      Sim.updateJourneys(world, hours, rng);
    },
    dailyTick(world, background) {
      const rng = Sim.rngFor(world);
      world.day++;
      ECHO.Ecology.dailyTick(world, rng);
      if (ECHO.Production) ECHO.Production.ensure(world);
      if (ECHO.Weather) ECHO.Weather.dailyTick(world, rng);
      ECHO.Economy.dailyTick(world, rng);
      if (ECHO.Production) ECHO.Production.dailyTick(world, rng);
      if (ECHO.Property) ECHO.Property.dailyTick(world, rng);
      ECHO.People.dailyTick(world, rng);
      ECHO.Minds.dailyTick(world, rng);
      if (ECHO.Disease) ECHO.Disease.dailyTick(world, rng);
      if (ECHO.Law) ECHO.Law.dailyTick(world, rng);
      ECHO.Politics.dailyTick(world, rng);
      ECHO.Intel.dailyTick(world, rng);
      ECHO.Plights.dailyTick(world, rng);
      ECHO.Civ.dailyTick(world, rng);
      ECHO.Chronicle.dailyTick(world, rng);
      ECHO.Legacy.dailyTick(world, rng);
      if (ECHO.Festivals) ECHO.Festivals.dailyTick(world, rng);
      if (ECHO.Letters) ECHO.Letters.dailyTick(world, rng);
      if (ECHO.Wonders && world.player) ECHO.Wonders.dailyTick(world, rng);
      if (background) Sim.hourlyTick(world, 24);
      world.rngState = rng.state;
      ECHO.emit('day', { world, background });
    },
    // Fast-forward: the world keeps living (imprisonment, waiting, resting).
    fastForward(world, days, onProgress) {
      const startDay = world.day;
      const startChron = world.chronicle.length;
      for (let i = 0; i < days; i++) {
        Sim.dailyTick(world, true);
        if (onProgress) onProgress(i + 1, days);
      }
      return { days: world.day - startDay, events: world.chronicle.slice(startChron) };
    },
    // Advance by real-time minutes (called every frame from the game loop).
    advance(world, minutes) {
      world.minute += minutes;
      world._hourAcc = (world._hourAcc || 0) + minutes;
      if (world._hourAcc >= 15) {
        Sim.hourlyTick(world, world._hourAcc / 60);
        world._hourAcc = 0;
      }
      let rolled = false;
      while (world.minute >= T.DAY_MIN) {
        world.minute -= T.DAY_MIN;
        Sim.dailyTick(world, false);
        rolled = true;
      }
      return rolled;
    }
  };
})();
