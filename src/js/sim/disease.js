// Disease: sickness is born where people are hungry, crowded or flooded,
// spreads house to house, rides the roads with caravans, pilgrims and
// armies, and burns out when enough have died or recovered. Healers and
// herbs blunt it; a wise reeve shuts the gates; the sick can't work, so a
// plague is also a famine and a broken mine.
(function () {
  const { U } = ECHO;
  const P = () => ECHO.People;
  const S = () => ECHO.Sim;

  const NAMES = {
    a: ['grey', 'red', 'river', 'sweating', 'weeping', 'black', 'marsh', 'shaking', 'winter', 'bloody', 'pale', 'burning'],
    b: ['cough', 'fever', 'flux', 'pox', 'ague', 'sickness', 'rot', 'chill', 'blight']
  };

  const D = ECHO.Disease = {
    list(world) { return (world.diseases = world.diseases || []); },
    get(world, id) { return D.list(world).find(d => d.id === id); },
    create(world, rng, origin) {
      const d = {
        id: 'd' + (D.list(world).length + 1), name: `the ${rng.pick(NAMES.a)} ${rng.pick(NAMES.b)}`,
        spread: rng.range(0.1, 0.28), lethal: rng.range(0.008, 0.04), days: rng.int(5, 12), born: world.day, origin: origin.id, deaths: 0, cases: 0, towns: [origin.id], active: true
      };
      D.list(world).push(d);
      return d;
    },
    sickIn(world, s) { return P().residents(world, s).filter(n => n.sick); },
    infect(world, n, d) {
      if (!n || n.status !== 'alive' || n.sick || (n.immune && n.immune.includes(d.id))) return false;
      n.sick = { d: d.id, days: d.days + Math.round((ECHO.hash2(ECHO.hashStr(n.id), world.day, 3) - 0.5) * 4) };
      d.cases++;
      return true;
    },
    care(world, s) {
      const res = P().residents(world, s);
      const healers = res.filter(n => n.prof === 'herbalist' || n.prof === 'priest').length;
      return U.clamp(healers * 0.12 + Math.min(0.25, (s.stock.herbs || 0) / 80), 0, 0.6);
    },
    dailyTick(world, rng) {
      const season = ECHO.TIME.dateOf(world.day).seasonIdx;
      for (const s of world.settlements) {
        const res = P().residents(world, s);
        if (!res.length) continue;
        const sick = res.filter(n => n.sick);
        // --- outbreaks
        if (!sick.length) {
          const crowd = res.length / Math.max(10, s.foundingPop || 30);
          const w = ECHO.Weather ? ECHO.Weather.at(world, s) : {};
          let p = 0.0006 + Math.max(0, crowd - 1.1) * 0.002 + s.hunger * 0.004 + (world.day - (s._floodDay || -99) < 12 ? 0.01 : 0) + (w.harsh ? 0.002 : 0) + (season === 3 ? 0.0005 : 0);
          if (rng.chance(p)) {
            const d = D.create(world, rng, s);
            D.infect(world, rng.pick(res), d);
            ECHO.Chronicle.add(world, { text: `A sickness has appeared in ${s.name} — people are calling it ${d.name}.`, kind: 'nature', importance: 2, sid: s.id });
          }
          if (s.quarantine && world.day > s.quarantine) { s.quarantine = 0; ECHO.Chronicle.add(world, { text: `${s.name} has opened its gates again.`, kind: 'politics', importance: 1, sid: s.id }); }
          continue;
        }
        const care = D.care(world, s);
        const dz = D.get(world, sick[0].sick.d);
        // --- spread within the town
        for (const n of sick) {
          const d = D.get(world, n.sick.d);
          if (!d) { delete n.sick; continue; }
          const contacts = 2 + (n.prof === 'merchant' || n.prof === 'innkeeper' || n.prof === 'priest' ? 2 : 0);
          for (let i = 0; i < contacts; i++) if (rng.chance(d.spread * (1 - care))) D.infect(world, rng.pick(res), d);
        }
        // --- course of the illness
        for (const n of sick) {
          const d = D.get(world, n.sick.d);
          if (!d) continue;
          const age = P().age(world, n);
          const frail = (age > 55 ? 2.2 : age < 6 ? 1.8 : 1) * (n.starve > 3 ? 1.6 : 1) * (1 - care);
          if (rng.chance(d.lethal * frail)) { d.deaths++; P().kill(world, n, d.name); continue; }
          if (--n.sick.days <= 0) { (n.immune = n.immune || []).push(d.id); delete n.sick; }
        }
        s.stock.herbs = Math.max(0, (s.stock.herbs || 0) - sick.length * 0.15);
        // --- the reeve may shut the gates
        const frac = sick.length / res.length;
        if (frac > 0.12 && !s.quarantine) {
          const r = s.ruler && world.npcs[s.ruler];
          const wise = !r || !(P().has(r, 'greedy') || P().has(r, 'fickle'));
          if (wise && rng.chance(0.3)) { s.quarantine = world.day + 12; ECHO.Chronicle.add(world, { text: `${s.name} has shut its gates against ${dz ? dz.name : 'the sickness'}. No caravans in or out.`, kind: 'politics', importance: 1, sid: s.id }); }
        }
        if (s.quarantine && world.day > s.quarantine && frac < 0.05) s.quarantine = 0;
        // --- creeping to neighbours (beggars, wanderers, rats)
        if (!s.quarantine) for (const t of world.settlements) {
          if (t === s || U.dist(s.x, s.y, t.x, t.y) > 32) continue;
          const tr = P().residents(world, t);
          if (dz && tr.length && rng.chance(frac * 0.03) && D.infect(world, rng.pick(tr), dz)) D.arrived(world, dz, t, 'with travellers from ' + s.name);
        }
      }
      // --- harsh winters take the frail
      for (const s of world.settlements) {
        const w = ECHO.Weather ? ECHO.Weather.at(world, s) : null;
        if (!w || !w.harsh) continue;
        for (const n of P().residents(world, s)) {
          const a = P().age(world, n);
          if ((a > 62 || a < 3) && rng.chance(s.stock.timber < 5 ? 0.006 : 0.002)) P().kill(world, n, 'the cold');
        }
      }
      // --- outbreaks end
      for (const d of D.list(world)) {
        if (!d.active) continue;
        const still = Object.values(world.npcs).some(n => n.status === 'alive' && n.sick && n.sick.d === d.id);
        if (!still) {
          d.active = false;
          if (d.cases >= 4) ECHO.Chronicle.add(world, { text: `${U.cap(d.name)} has burned itself out, after ${d.cases} fell sick and ${d.deaths} died.`, kind: 'nature', importance: d.deaths > 5 ? 2 : 1, sid: d.origin });
        }
      }
      if (D.list(world).length > 40) world.diseases = D.list(world).filter(d => d.active || world.day - d.born < 200);
    },
    arrived(world, d, t, how) {
      if (!d.towns.includes(t.id)) {
        d.towns.push(t.id);
        ECHO.Chronicle.add(world, { text: `${U.cap(d.name)} has reached ${t.name}, ${how}.`, kind: 'nature', importance: 1, sid: t.id });
      }
    },
    // Travellers carry it along the roads.
    onJourneyStart(world, j) {
      for (const id of j.npcs) { const n = world.npcs[id]; if (n && n.sick) { j.meta = j.meta || {}; j.meta.sick = n.sick.d; break; } }
    },
    onJourneyEnd(world, j, arrived) {
      if (!arrived || !j.meta || !j.meta.sick) return;
      const t = S().settlement(world, j.to), d = D.get(world, j.meta.sick);
      if (!t || !d || !d.active) return;
      const res = P().residents(world, t);
      if (res.length && D.infect(world, res[Math.floor(ECHO.hash2(world.day, res.length, 9) * res.length)], d)) D.arrived(world, d, t, `carried by ${j.kind === 'army' ? 'soldiers' : j.kind === 'caravan' ? 'a caravan' : j.kind === 'pilgrim' ? 'pilgrims' : 'travellers'} from ${(S().settlement(world, j.from) || {}).name || 'the road'}`);
    },
    // The player can catch it too.
    exposePlayer(world, pl, s, hours) {
      if (!pl || pl.sick || !s) return null;
      const sick = D.sickIn(world, s);
      if (!sick.length) return null;
      const d = D.get(world, sick[0].sick.d);
      if (!d || (pl.immune || []).includes(d.id)) return null;
      const frac = sick.length / Math.max(1, P().residents(world, s).length);
      if (ECHO.Sim.rngFor(world).chance(frac * d.spread * 0.12 * hours)) { pl.sick = { d: d.id, days: d.days, name: d.name }; return d; }
      return null;
    }
  };

})();
