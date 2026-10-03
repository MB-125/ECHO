// Ecology: a food web per region.
//   Apex monster  ──eats──▶  gnawers (crop vermin) and duskwolves
//   Duskwolves    ──eat───▶  bristlehares (and some gnawers)
//   Gnawers       ──eat───▶  crops  →  food supply  →  prices, hunger, unrest…
// Species also carry heritable traits that shift under selection pressure
// from how they are killed (the world adapts to the player's habits).
(function () {
  const { U } = ECHO;

  const SPECIES = ECHO.SPECIES = {
    gnawer: { name: 'Gnawer', plural: 'gnawers', hp: 16, dmg: 3, speed: 3.4, radius: 0.32, sight: 6, xp: 2, meat: 0, hide: 0.2, color: '#8a7a5c', desc: 'Swarming crop vermin with chisel teeth.' },
    hare: { name: 'Bristlehare', plural: 'bristlehares', hp: 10, dmg: 0, speed: 4.6, radius: 0.3, sight: 7, xp: 1, meat: 1, hide: 0.5, color: '#b7a07a', desc: 'Skittish grazer with a ruff of quills.' },
    wolf: { name: 'Duskwolf', plural: 'duskwolves', hp: 46, dmg: 9, speed: 4.3, radius: 0.42, sight: 9, xp: 6, meat: 2, hide: 1, color: '#4b4e5e', desc: 'Pack hunter that grows bold after dark.' }
  };

  const MUTATIONS = [
    { key: 'glasshorn', name: 'Glasshorn', effect: 'glow', desc: 'its horn catches moonlight and glows' },
    { key: 'mirrorback', name: 'Mirrorback', effect: 'reflect', desc: 'its silvered hide turns aside arrows' },
    { key: 'hollowsong', name: 'Hollowsong', effect: 'howl', desc: 'it sings to call others of its kind' },
    { key: 'emberfur', name: 'Emberfur', effect: 'burn', desc: 'its coat smoulders and scorches what it bites' },
    { key: 'twinjaw', name: 'Twinjaw', effect: 'bite', desc: 'it bites twice as hard' },
    { key: 'paleshade', name: 'Paleshade', effect: 'stealth', desc: 'it can barely be seen in the dark' }
  ];

  function traitsInit() { return { fireRes: 0, hide: 0, speed: 0, mutation: null }; }

  const E = ECHO.Ecology = {
    SPECIES, MUTATIONS,
    // Base capacity — crop damage is measured against this.
    capacity(r) {
      return {
        gnawer: r.land * (40 + 2600 * r.farm + 140 * r.swamp + 40 * r.forest),
        hare: r.land * (60 + 110 * (1 - r.forest - r.hill)),
        wolf: r.land * (6 + 22 * r.forest)
      };
    },
    init(world, rng) {
      // Lair regions are the swarming grounds the apex beasts feed on.
      for (const r of world.regions) r.breed = 1;
      for (const l of world.lairs) {
        const lr = world.regions[l.regionId];
        lr.breed = 2.6;
        for (const nb of ECHO.World.regionNeighbors(world, lr)) nb.breed = Math.max(nb.breed, 1.35);
      }
      for (const r of world.regions) {
        if (r.land < 0.15) { r.eco = null; continue; }
        const K = E.capacity(r);
        const apex = E.apexPressure(world, r);
        r.eco = {
          gnawer: K.gnawer * (apex > 0 ? 0.12 : 0.3) * rng.range(0.85, 1.15),
          hare: K.hare * rng.range(0.4, 0.7),
          wolf: Math.max(2, K.wolf * rng.range(0.35, 0.6)),
          traits: { gnawer: traitsInit(), hare: traitsInit(), wolf: traitsInit() },
          pressure: { gnawer: { melee: 0, ranged: 0, fire: 0 }, hare: { melee: 0, ranged: 0, fire: 0 }, wolf: { melee: 0, ranged: 0, fire: 0 } },
          crop: 1, wolfDanger: 0
        };
      }
      for (const r of world.regions) if (r.eco) r.eco.crop = E.cropFactor(world, r);
    },
    apexPressure(world, r) {
      let p = 0;
      for (const l of world.lairs) {
        const b = l.boss;
        if (!b.alive || (b.absentUntil > world.day)) continue;
        if (l.regionId === r.id) p += 1;
        else {
          const lr = world.regions[l.regionId];
          if (ECHO.World.regionNeighbors(world, lr).includes(r)) p += 0.45;
        }
      }
      return Math.min(1.4, p);
    },
    cropFactor(world, r) {
      if (!r.eco) return 1;
      const K = E.capacity(r);
      const dens = r.eco.gnawer / Math.max(1, K.gnawer);
      return U.clamp(1 - 0.82 * Math.pow(dens, 1.25), 0.12, 1);
    },
    dailyTick(world, rng) {
      const season = ECHO.TIME.dateOf(world.day).seasonIdx;
      const seasonGrowth = [0.85, 1.25, 1.0, 0.45][season];
      const migr = [];
      for (const r of world.regions) {
        const e = r.eco;
        if (!e) continue;
        const K = E.capacity(r);
        const apex = E.apexPressure(world, r);
        let { gnawer: G, hare: Hh, wolf: Wf } = e;
        // Predation
        const eatenH = Math.min(Hh * 0.4, 0.3 * Wf * Hh / (Hh + 30));
        const eatenGw = Math.min(G * 0.15, 0.12 * Wf * G / (G + 80));
        const apexG = apex * 0.19 * G;
        const apexW = apex * 0.035 * Wf;
        // People: hunters take hares; farmers and hunters trap vermin.
        let hunted = 0, control = 0;
        for (const s of world.settlements) {
          if (ECHO.World.regionAt(world, s.x, s.y) !== r) continue;
          hunted += (s._hunters || 0) * 0.22;
          control += ((s._farmers || 0) + (s._hunters || 0)) * 0.0105;
        }
        hunted = Math.min(hunted, Hh * 0.3);
        control = Math.min(0.14, control);
        e.control = control;
        const Kg = K.gnawer * (r.breed || 1);
        G += 0.24 * seasonGrowth * G * (1 - G / Math.max(1, Kg)) - eatenGw - apexG - control * G;
        Hh += 0.13 * seasonGrowth * Hh * (1 - Hh / Math.max(1, K.hare)) - eatenH - hunted;
        const food = (eatenH + eatenGw * 0.6) / Math.max(1, Wf);
        Wf += Wf * (0.16 * Math.min(1.3, food) - 0.055) - 0.012 * Wf * Wf / Math.max(1, K.wolf) - apexW;
        e.gnawer = Math.max(0.5, G); e.hare = Math.max(0.5, Hh); e.wolf = Math.max(0.3, Wf);
        e.crop = E.cropFactor(world, r);
        e.wolfDanger = U.clamp(e.wolf / Math.max(4, K.wolf * 0.5), 0, 3);
        // Evolution under selection: traits creep toward what keeps them alive.
        for (const sp of ['gnawer', 'hare', 'wolf']) {
          const pr = e.pressure[sp], tr = e.traits[sp];
          const total = pr.melee + pr.ranged + pr.fire;
          const turnover = sp === 'wolf' ? 0.025 : 0.05;
          if (total > 2) {
            tr.fireRes = U.clamp(tr.fireRes + turnover * 3 * (pr.fire / total - 0.25), 0, 0.85);
            tr.hide = U.clamp(tr.hide + turnover * 3 * (pr.melee / total - 0.4), 0, 0.7);
            tr.speed = U.clamp(tr.speed + turnover * 3 * (pr.ranged / total - 0.35), 0, 0.6);
          } else {
            tr.fireRes = Math.max(0, tr.fireRes - 0.002);
            tr.hide = Math.max(0, tr.hide - 0.002);
            tr.speed = Math.max(0, tr.speed - 0.002);
          }
          pr.melee *= 0.93; pr.ranged *= 0.93; pr.fire *= 0.93;
          // Named strains emerge once a trait is established.
          const label = E.strainLabel(tr);
          if (label && tr._announced !== label) {
            tr._announced = label;
            ECHO.Chronicle.add(world, { text: `Hunters in ${r.name} speak of ${label.toLowerCase()} ${SPECIES[sp].plural} — ${E.strainWhy(tr)}.`, kind: 'nature', importance: 2, x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 });
          }
          // Rare mutation unique to this world.
          if (!tr.mutation && rng.chance(0.0009 * (sp === 'wolf' ? 2 : 1))) {
            const m = rng.pick(MUTATIONS);
            tr.mutation = m.key;
            ECHO.Chronicle.add(world, { text: `A ${m.name.toLowerCase()} ${SPECIES[sp].name.toLowerCase()} was sighted in ${r.name}; they say ${m.desc}. No one has seen its like before.`, kind: 'mystery', importance: 2, x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 });
          }
        }
        // Migration between neighbouring regions evens out populations.
        for (const nb of ECHO.World.regionNeighbors(world, r)) {
          if (!nb.eco) continue;
          migr.push([r, nb, 'wolf', e.wolf * 0.015], [r, nb, 'gnawer', e.gnawer * 0.012], [r, nb, 'hare', e.hare * 0.01]);
        }
        // Wolves prey on lone workers in the wilds when numerous.
        if (e.wolfDanger > 1.1) {
          for (const s of world.settlements) {
            if (ECHO.World.regionAt(world, s.x, s.y) !== r) continue;
            if (rng.chance(0.02 * (e.wolfDanger - 1) * (ECHO.Civ.has(world, s.faction, 'lamps') ? 0.5 : 1))) {
              const victims = ECHO.People.residents(world, s).filter(n => ['hunter', 'woodcutter', 'herbalist', 'farmer'].includes(n.prof));
              if (victims.length) {
                const v = rng.pick(victims);
                ECHO.People.kill(world, v, 'torn apart by duskwolves');
                s.unrest = Math.min(100, s.unrest + 2);
              }
            }
          }
        }
      }
      for (const [a, b, sp, amt] of migr) { a.eco[sp] -= amt; b.eco[sp] += amt; }
    },
    strainLabel(tr) {
      if (tr.mutation) return MUTATIONS.find(m => m.key === tr.mutation).name;
      if (tr.fireRes > 0.3) return 'Ashen';
      if (tr.hide > 0.3) return 'Ironhide';
      if (tr.speed > 0.28) return 'Swift';
      return null;
    },
    strainWhy(tr) {
      if (tr.fireRes > 0.3) return 'their coats have grown thick and grey, and flame no longer catches on them';
      if (tr.hide > 0.3) return 'their hides have grown tough as boiled leather';
      if (tr.speed > 0.28) return 'they bolt at the first sound and are hard to bring down';
      return 'something has changed in them';
    },
    speciesName(world, r, sp) {
      const base = SPECIES[sp].name;
      if (!r || !r.eco) return base;
      const tr = r.eco.traits[sp];
      const parts = [];
      if (tr.mutation) parts.push(MUTATIONS.find(m => m.key === tr.mutation).name);
      if (tr.fireRes > 0.3) parts.push('Ashen');
      else if (tr.hide > 0.3) parts.push('Ironhide');
      else if (tr.speed > 0.28) parts.push('Swift');
      return parts.length ? parts.join(' ') + ' ' + base : base;
    },
    recordKill(world, r, sp, method, count = 1) {
      if (!r || !r.eco) return;
      r.eco[sp] = Math.max(0.3, r.eco[sp] - count);
      if (method && r.eco.pressure[sp][method] != null) r.eco.pressure[sp][method] += count;
    },
    // Snapshot for UI / debugging
    describe(world, r) {
      if (!r.eco) return null;
      const K = E.capacity(r);
      return {
        gnawers: Math.round(r.eco.gnawer), hares: Math.round(r.eco.hare), wolves: Math.round(r.eco.wolf),
        crop: r.eco.crop, gnawerLoad: r.eco.gnawer / Math.max(1, K.gnawer), apex: E.apexPressure(world, r)
      };
    }
  };
})();
