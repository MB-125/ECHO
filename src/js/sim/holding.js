// Holdings: a place of your own in the world, and work to fill the days.
//
// A royal charter lets you lead settlers to found a village wherever the
// crown will allow — once you have cleared the land. A village you hold can
// be built up: houses, fields, a granary, a palisade, a watchtower, a fair,
// a statue; you set its dues, invite settlers, and watch it grow (or fail).
// And in any town there is honest work for those who want it — and coaches
// along the roads for those with somewhere to be.
(function () {
  const { U } = ECHO;
  const P = () => ECHO.People;
  const S = () => ECHO.Sim;
  const R = () => ECHO.Realm;

  const PROJECTS = {
    houses: { name: 'New houses', cost: 100, days: 4, desc: 'Two more houses. Room for new families.' },
    fields: { name: 'Clear new fields', cost: 70, days: 3, desc: 'More land under the plough: more bread, more people fed.' },
    granary: { name: 'A granary', cost: 150, days: 6, desc: 'Stores against the lean months.' },
    walls: { name: 'A palisade', cost: 240, days: 8, desc: 'Walls against raiders and wolves.' },
    watch: { name: 'A watchtower', cost: 130, days: 5, desc: 'Eyes on the roads; safer travel nearby.' },
    fair: { name: 'A market fair', cost: 120, days: 3, desc: 'Merchants come from far off. Prosperity grows.', once: true },
    statue: { name: 'Your statue in the square', cost: 150, days: 6, desc: 'So they remember who built this place.', once: true }
  };

  const H = ECHO.Holding = {
    PROJECTS,
    mine(world, pl) { return (pl.wardenOf || []).map(id => S().settlement(world, id)).filter(s => s && s.warden === pl.charId); },
    // ------------------------------------------------------------ the charter
    charterCost(pl) { return pl.freeCharter ? 0 : 250; },
    canCharter(world, pl, f) {
      if (!f || f.type !== 'kingdom') return 'Only a king or queen can grant land.';
      if ((pl.wanted && pl.wanted[f.id]) || 0) return 'Not while you are wanted here.';
      if (pl.renown < 20 && !pl.freeCharter) return 'The court does not know your name well enough yet (renown 20).';
      if (pl.gold < H.charterCost(pl)) return `A charter costs ${H.charterCost(pl)} crowns.`;
      if (R().st(f).plan) return 'The crown already has surveyors on the frontier. Come back when that village is founded.';
      if (world.settlements.length >= 22) return 'There is no land left to grant.';
      return null;
    },
    // Grant a charter: a site on the frontier, which the player must clear.
    charter(world, f, pl, rng) {
      const why = H.canCharter(world, pl, f);
      if (why) return { error: why };
      let site = null;
      for (let i = 0; i < 6 && !site; i++) site = R().findSite(world, f, rng);
      if (!site) return { error: 'The surveyors can find no land fit for a village within reach of the crown. Try again in a season.' };
      pl.gold -= H.charterCost(pl); pl.freeCharter = false;
      const towns = R().towns(world, f);
      const from = towns.slice().sort((a, b) => P().residents(world, b).length - P().residents(world, a).length || U.dist(a.x, a.y, site.x, site.y) - U.dist(b.x, b.y, site.x, site.y))[0];
      const region = ECHO.World.regionAt(world, site.x, site.y);
      const danger = world.camps.some(c => c.alive && U.dist(c.x, c.y, site.x, site.y) < 30) ? 'outlaws' : 'wolves';
      const st = R().st(f);
      st.plan = { x: site.x, y: site.y, region: region.id, from: from.id, day: world.day, setOut: world.day + 40, stage: 'planned', danger, cleared: false, charter: pl.charId, warden: pl.charId };
      const ruler = R().ruler(world, f);
      const cap = S().settlement(world, f.capital);
      const p = ECHO.Plights.post(world, { kind: 'clearsite', sid: cap ? cap.id : from.id, requester: ruler ? ruler.id : null, faction: f.id, x: site.x, y: site.y, danger, deadline: world.day + 40, reward: 0, charter: true,
        text: `By royal charter, ${pl.first} ${pl.last} may found a village in ${region.name}. First the land must be cleared of ${danger === 'wolves' ? 'the duskwolves that den there' : 'the outlaws camped there'}. Then come back to the keep, name your village, and the settlers will follow you.` });
      st.plan.commission = p.id;
      pl.accepted.push(p.id);
      ECHO.Chronicle.deed(world, { text: `${ruler ? P().fullTitle(world, ruler) : f.name} granted ${pl.first} ${pl.last} a charter to found a village in ${region.name}.`, importance: 2, sid: f.capital, rep: 3 });
      return { plight: p, region };
    },

    // ------------------------------------------------------------ building a village up
    canBuild(world, s, k) {
      const Pj = PROJECTS[k];
      if (!Pj) return 'No such work.';
      if ((s.projects || []).some(x => x.k === k && !x.done)) return 'Already being built.';
      if (Pj.once && (s.projects || []).some(x => x.k === k)) return 'Already done.';
      if ((k === 'walls' || k === 'watch' || k === 'granary') && s.works && s.works[k]) return 'Already built.';
      if (k === 'houses' && !R().placeBuilding(world, s, 'house', 3, 3, 5, 16, true)) return 'No room left inside the village.';
      return null;
    },
    build(world, s, pl, k) {
      const why = H.canBuild(world, s, k);
      if (why) return why;
      const Pj = PROJECTS[k];
      if (pl.gold < Pj.cost) return `That will cost ${Pj.cost} crowns.`;
      pl.gold -= Pj.cost;
      s.projects = s.projects || [];
      s.projects.push({ k, start: world.day, ready: world.day + Pj.days, done: false });
      return null;
    },
    finish(world, s, x, rng) {
      x.done = true;
      s.works = s.works || {};
      const pl = world.player;
      let note = '';
      switch (x.k) {
        case 'houses': { let n = 0; for (let i = 0; i < 2; i++) if (R().placeBuilding(world, s, 'house', 3, 3, 5, 16)) n++; if (ECHO.Property && world._prop) ECHO.Property.assignTown(world, s); note = n ? '' : ' (there was no room)'; break; }
        case 'fields': {
          let n = 0;
          for (let i = 0; i < 400 && n < 14; i++) {
            const a = rng.next() * Math.PI * 2, d = 7 + rng.next() * 8;
            const tx = Math.round(s.x + Math.cos(a) * d), ty = Math.round(s.y + Math.sin(a) * d);
            const t = ECHO.World.tile(world, tx, ty);
            if ((t === ECHO.TILE.GRASS || t === ECHO.TILE.FOREST) && !world.blocked[ty * world.W + tx]) { ECHO.World.setTile(world, tx, ty, ECHO.TILE.FARM); n++; }
          }
          s.farmTiles = (s.farmTiles || 0) + n * 2;
          break;
        }
        case 'granary': case 'walls': case 'watch': s.works[x.k] = true; break;
        case 'fair': s.fair = true; s.prosperity = Math.min(100, (s.prosperity || 40) + 10); break;
        case 'statue': { const b = R().placeBuilding(world, s, 'statue', 1, 1, 2, 7); if (b && pl) { b.legend = pl.charId; b.of = pl.charId; } break; }
      }
      ECHO.World.rebuildBlocked(world);
      R().reshaped(world);
      ECHO.Chronicle.add(world, { text: `${PROJECTS[x.k].name.replace(/^A |^An /, 'A ').replace(/^Your statue/, pl ? `A statue of ${pl.first} ${pl.last}` : 'A statue')} ${x.k === 'houses' || x.k === 'fields' ? 'were' : 'was'} finished in ${s.name}${note}.`, kind: 'politics', importance: 1, sid: s.id });
    },
    // Settlers are invited from the most crowded town of the realm.
    invite(world, s, pl, rng) {
      if (pl.gold < 50) return 'Sending criers costs 50 crowns.';
      const towns = world.settlements.filter(t => t.faction === s.faction && t.id !== s.id && S().route(world, t.id, s.id));
      if (!towns.length) return 'No road links your village to the rest of the realm.';
      towns.sort((a, b) => P().residents(world, b).length - P().residents(world, a).length);
      const from = towns[0];
      const movers = P().residents(world, from).filter(n => n.status === 'alive' && !n.journey && n.prof !== 'ruler' && n.prof !== 'reeve' && n.id !== from.ruler && P().age(world, n) > 17 && (n.prof === 'farmer' || n.wealth < 15 || n.prof === 'woodcutter' || n.prof === 'hunter')).slice(0, 3 + rng.int(0, 2));
      if (!movers.length) return `No one in ${from.name} wants to leave.`;
      pl.gold -= 50;
      for (const n of movers) S().migrate(world, n, from, s, 'invited');
      return `Criers in ${from.name} tell of land and work in ${s.name}. ${movers.length} ${movers.length > 1 ? 'families are' : 'family is'} packing.`;
    },
    // ------------------------------------------------------------ daily
    dailyTick(world, rng) {
      const pl = world.player;
      for (const s of world.settlements) {
        if (!s.projects && !s.warden) continue;
        for (const x of s.projects || []) if (!x.done && world.day >= x.ready) H.finish(world, s, x, rng);
        if (!s.warden) continue;
        // dues shape the mood
        if (s.dues === 'high') { s.unrest = Math.min(100, s.unrest + 0.6); s.prosperity = Math.max(0, (s.prosperity || 40) - 0.1); }
        else if (s.dues === 'low') { s.unrest = Math.max(0, s.unrest - 0.4); s.prosperity = Math.min(100, (s.prosperity || 40) + 0.12); }
        if (s.fair) s.prosperity = Math.min(100, (s.prosperity || 40) + 0.05);
        // a village with room and bread draws people in
        const res = P().residents(world, s).length, houses = s.buildings.filter(b => b.type === 'house').length;
        if (res < houses * 3.6 && s.hunger < 0.15 && (s.prosperity || 40) > 45 && rng.chance(0.04 + (s.dues === 'low' ? 0.03 : 0))) {
          const from = world.settlements.filter(t => t.faction === s.faction && t.id !== s.id && P().residents(world, t).length > 28).sort(() => rng.next() - 0.5)[0];
          const n = from && P().residents(world, from).find(x => x.status === 'alive' && !x.journey && x.prof !== 'ruler' && x.id !== from.ruler && P().age(world, x) > 17 && x.wealth < 20);
          if (n && S().route(world, from.id, s.id)) S().migrate(world, n, from, s, 'opportunity');
        }
        void pl;
      }
    },

    // ------------------------------------------------------------ work and travel
    // A shift of honest work: what it pays, and what it trains.
    shift(world, s, kind) {
      const pros = (s.prosperity || 50) / 50;
      const W = { mill: { pay: 7, skill: 'endurance', what: 'hauling sacks at the mill' }, mine: { pay: 10, skill: 'endurance', what: 'swinging a pick in the mine' }, lumber: { pay: 8, skill: 'endurance', what: 'felling trees with the woodcutters' },
        smithy: { pay: 9, skill: 'blade', what: 'working the bellows and the hammer' }, inn: { pay: 6, skill: 'tongue', what: 'serving tables at the inn' }, fields: { pay: 6, skill: 'endurance', what: 'working in the fields' }, archive: { pay: 8, skill: 'study', what: 'copying old records' } }[kind];
      return W ? { ...W, pay: Math.round(W.pay * (0.7 + pros * 0.4)) } : null;
    },
    // A seat on the coach to another town along the roads.
    coach(world, from, to, pl) {
      const route = S().route(world, from.id, to.id);
      if (!route) return null;
      const dist = S().roadDistance(world, from.id, to.id);
      const cost = Math.max(3, Math.round(dist * 0.15 * (pl.coachMul || 1)));
      const hours = Math.max(2, Math.round(dist / 14));
      return { cost, hours, dist: Math.round(dist) };
    }
  };
})();
