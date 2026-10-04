// People: every inhabitant is a persistent record with a life of their own.
// They age, eat (or starve), form friendships and rivalries, marry, have
// children, change professions, migrate, turn outlaw, rise in rank and die —
// whether or not the player is anywhere near.
(function () {
  const { U } = ECHO;
  const T = ECHO.TIME;

  const TRAITS = ['brave', 'cowardly', 'kind', 'cruel', 'greedy', 'generous', 'curious', 'ambitious', 'loyal', 'fickle', 'pious', 'hot-headed', 'patient', 'honest', 'deceitful'];
  const OPPOSITE = { brave: 'cowardly', cowardly: 'brave', kind: 'cruel', cruel: 'kind', greedy: 'generous', generous: 'greedy', loyal: 'fickle', fickle: 'loyal', honest: 'deceitful', deceitful: 'honest', patient: 'hot-headed', 'hot-headed': 'patient' };

  const PROF = ECHO.PROF = {
    farmer: { label: 'farmer', work: 'fields' },
    hunter: { label: 'hunter', work: 'wilds' },
    miner: { label: 'miner', work: 'hills' },
    woodcutter: { label: 'woodcutter', work: 'wilds' },
    smith: { label: 'smith', work: 'smithy' },
    herbalist: { label: 'herbalist', work: 'wilds' },
    merchant: { label: 'merchant', work: 'market' },
    guard: { label: 'soldier', work: 'patrol' },
    innkeeper: { label: 'innkeeper', work: 'inn' },
    priest: { label: 'priest', work: 'shrine' },
    scholar: { label: 'scholar', work: 'archive' },
    ruler: { label: 'ruler', work: 'keep' },
    reeve: { label: 'reeve', work: 'market' },
    child: { label: 'child', work: 'play' },
    elder: { label: 'elder', work: 'rest' },
    bandit: { label: 'outlaw', work: 'camp' },
    wanderer: { label: 'sellsword', work: 'inn' },
    inventor: { label: 'inventor', work: 'archive' }
  };

  const RANKS = ['', 'Sergeant', 'Captain', 'General'];

  const P = ECHO.People = {
    TRAITS, RANKS,
    age(world, n) { return (world.day - n.born) / T.YEAR_DAYS; },
    name(n) { return n.first + ' ' + n.last; },
    fullTitle(world, n) {
      let t = '';
      if (n.title) t = n.title + ' ';
      else if (n.rank && n.prof === 'guard') t = RANKS[n.rank] + ' ';
      else if (n.rank && n.prof === 'bandit') t = n.rank >= 2 ? 'Chieftain ' : '';
      return t + P.name(n);
    },
    role(world, n) {
      if (n.status === 'dead') return 'deceased';
      if (n.title) return n.title.toLowerCase();
      if (n.prof === 'guard' && n.rank) return RANKS[n.rank].toLowerCase() + ' of ' + world.factions[n.faction].short;
      if (n.prof === 'bandit' && n.rank >= 2) return 'Ashfang chieftain';
      return PROF[n.prof] ? PROF[n.prof].label : n.prof;
    },
    has(n, trait) { return n.traits.includes(trait); },
    alive(world) { return Object.values(world.npcs).filter(n => n.status !== 'dead'); },
    get(world, id) { return world.npcs[id]; },
    residents(world, s) { return s.residents.map(id => world.npcs[id]).filter(n => n && n.status === 'alive' && n.loc === s.id); },

    create(world, rng, o) {
      const id = 'n' + (world.nextNpc++);
      const sex = o.sex || (rng.chance(0.5) ? 'f' : 'm');
      const culture = o.culture || world.factions[o.faction] && world.factions[o.faction].culture || 'valdren';
      const traits = [];
      if (o.traits) traits.push(...o.traits);
      while (traits.length < 2) {
        const t = rng.pick(TRAITS);
        if (!traits.includes(t) && !traits.includes(OPPOSITE[t])) traits.push(t);
      }
      const n = {
        id, first: o.first || ECHO.makeName(rng, culture, sex), last: o.last || ECHO.makeSurname(rng, culture), sex, culture,
        born: o.born != null ? o.born : world.day - Math.floor(rng.range(18, 50) * T.YEAR_DAYS),
        home: o.home, loc: o.home, prof: o.prof || 'farmer', faction: o.faction,
        traits, skill: { fight: o.fight != null ? o.fight : rng.int(5, 35), craft: rng.int(5, 40), lore: rng.int(2, 30) },
        wealth: o.wealth != null ? o.wealth : rng.int(5, 40), starve: 0, spouse: null, parents: o.parents || [], kids: [],
        rel: {}, mem: [], op: {}, status: 'alive', rank: 0, renown: 0, title: o.title || '', carry: null, flags: {},
        hp: 1, namedAfter: o.namedAfter || null
      };
      world.npcs[id] = n;
      if (o.home) {
        const s = ECHO.Sim.settlement(world, o.home);
        if (s && !s.residents.includes(id)) s.residents.push(id);
      }
      return n;
    },

    populate(world, rng, pops) {
      world.settlements.forEach((s, i) => {
        const target = pops[i];
        const fac = s.faction;
        const culture = world.factions[fac].culture;
        let made = 0;
        const hasHills = ECHO.World.regionAt(world, s.x, s.y).hill > 0.06;
        const profPool = () => {
          if (s.kind === 'temple') { const tw = { farmer: 6, priest: 2.5, herbalist: 1, scholar: 0.4, smith: 0.5, guard: 1, merchant: 0.8, hunter: 1 }; return rng.weighted(Object.keys(tw), k => tw[k]); }
          const w = { farmer: 10, hunter: 2, miner: hasHills ? 1.2 : 0.3, woodcutter: 1, smith: 0.3, herbalist: 0.6, merchant: 0.5, guard: s.kind === 'capital' ? 2.4 : 1.2, scholar: s.kind === 'capital' ? 0.8 : 0 };
          return rng.weighted(Object.keys(w), k => w[k]);
        };
        while (made < target) {
          // A household: one or two adults, maybe children, maybe an elder.
          const last = ECHO.makeSurname(rng, culture);
          const a = P.create(world, rng, { home: s.id, faction: fac, culture, last, prof: profPool() });
          made++;
          if (rng.chance(0.68) && made < target) {
            const b = P.create(world, rng, { home: s.id, faction: fac, culture, last, sex: a.sex === 'f' ? 'm' : 'f', prof: rng.chance(0.5) ? a.prof : profPool(), born: a.born + rng.int(-6, 6) * T.YEAR_DAYS });
            made++;
            P.marry(world, a, b, true);
            const kids = rng.int(0, 3);
            for (let k = 0; k < kids && made < target; k++) {
              const mom = a.sex === 'f' ? a : b;
              const momAge = P.age(world, mom);
              if (momAge < 20) break;
              const kidAge = rng.range(0, Math.min(17, momAge - 18));
              const kid = P.create(world, rng, { home: s.id, faction: fac, culture, last, prof: kidAge < 15 ? 'child' : profPool(), born: world.day - Math.floor(kidAge * T.YEAR_DAYS), parents: [a.id, b.id] });
              a.kids.push(kid.id); b.kids.push(kid.id);
              made++;
            }
          }
          if (rng.chance(0.12) && made < target) {
            P.create(world, rng, { home: s.id, faction: fac, culture, last, prof: 'elder', born: world.day - Math.floor(rng.range(58, 74) * T.YEAR_DAYS) });
            made++;
          }
        }
        // Key positions
        const adults = P.residents(world, s).filter(n => P.age(world, n) >= 22 && n.prof !== 'elder');
        const take = (prof, pred) => {
          const cand = adults.filter(n => !n._key && (!pred || pred(n)));
          const n = cand.length ? rng.pick(cand) : null;
          if (n) { n.prof = prof; n._key = true; }
          return n;
        };
        take('innkeeper');
        if (s.kind !== 'temple') take('smith');
        take('merchant');
        if (s.kind === 'capital') take('merchant');
        if (s.kind !== 'temple') take('priest', n => P.has(n, 'pious') || rng.chance(0.4));
        if (s.kind === 'capital') {
          const ruler = take('ruler', n => P.age(world, n) > 30);
          if (ruler) {
            ruler.title = ruler.sex === 'f' ? 'Queen' : 'King';
            ruler.wealth = 400; ruler.renown = 40;
            world.factions[fac].ruler = ruler.id; s.ruler = ruler.id;
          }
          take('scholar'); take('scholar');
          // a general and a captain
          const gen = take('guard', n => P.age(world, n) > 30);
          if (gen) { gen.rank = 3; gen.skill.fight = rng.int(55, 75); gen.renown = 30; }
          const cap = take('guard');
          if (cap) { cap.rank = 2; cap.skill.fight = rng.int(40, 60); cap.renown = 15; }
        } else if (s.kind === 'temple') {
          const high = take('priest', n => P.age(world, n) > 35);
          if (high) { high.title = 'High Wick'; high.renown = 35; world.factions.lantern.ruler = high.id; s.ruler = high.id; }
          take('scholar');
        } else {
          const reeve = take('reeve', n => P.age(world, n) > 28);
          if (reeve) { reeve.title = 'Reeve'; s.ruler = reeve.id; }
        }
        for (const n of adults) {
          delete n._key;
          if (n.prof === 'guard') n.skill.fight = Math.max(n.skill.fight, rng.int(25, 50));
        }
        for (const n of P.residents(world, s)) delete n._key;
      });
    },

    marry(world, a, b, silent) {
      a.spouse = b.id; b.spouse = a.id;
      P.bond(a, b.id, 70); P.bond(b, a.id, 70);
      if (!silent) {
        const s = ECHO.Sim.settlement(world, a.loc);
        ECHO.Chronicle.add(world, { text: `${P.name(a)} and ${P.name(b)} were wed in ${s ? s.name : 'the wilds'}.`, kind: 'life', importance: 1, sid: a.loc, npcs: [a.id, b.id] });
        P.remember(world, a, 'married ' + b.first, 'joy', b.id, 2);
        P.remember(world, b, 'married ' + a.first, 'joy', a.id, 2);
      }
    },

    bond(n, otherId, delta) {
      n.rel[otherId] = U.clamp((n.rel[otherId] || 0) + delta, -100, 100);
      const keys = Object.keys(n.rel);
      if (keys.length > 10) {
        keys.sort((x, y) => Math.abs(n.rel[x]) - Math.abs(n.rel[y]));
        delete n.rel[keys[0]];
      }
    },

    remember(world, n, text, type, about, weight = 1) {
      n.mem.push({ d: world.day, t: text, type, about, w: weight });
      if (n.mem.length > 14) {
        n.mem.sort((a, b) => (b.w * 10 - (world.day - b.d) * 0.05) - (a.w * 10 - (world.day - a.d) * 0.05));
        n.mem.length = 12;
        n.mem.sort((a, b) => a.d - b.d);
      }
    },

    kill(world, n, cause, killerName, killerRef) {
      if (n.status === 'dead') return;
      n.status = 'dead'; n.diedDay = world.day; n.cause = cause;
      delete n.mind;
      world.stats.deaths++;
      const s = ECHO.Sim.settlement(world, n.home);
      if (s) s.residents = s.residents.filter(id => id !== n.id);
      if (n.spouse && world.npcs[n.spouse]) {
        const sp = world.npcs[n.spouse];
        P.remember(world, sp, `lost ${n.first} (${cause})`, 'grief', n.id, 3);
        sp.spouse = null;
      }
      for (const k of n.kids) { const kid = world.npcs[k]; if (kid && kid.status !== 'dead') P.remember(world, kid, `lost their parent ${n.first}`, 'grief', n.id, 3); }
      // Faction roles
      const f = world.factions[n.faction];
      const important = n.title || n.rank >= 2 || n.renown >= 25;
      if (f && f.ruler === n.id) ECHO.Politics.succession(world, f, n);
      if (s && s.ruler === n.id && !(f && f.capital === s.id)) ECHO.Politics.newReeve(world, s);
      for (const camp of world.camps) if (camp.leader === n.id) ECHO.Politics.campSuccession(world, camp);
      // An item they carried stays in the world.
      if (n.carry && world.items[n.carry]) {
        const it = world.items[n.carry];
        it.history.push({ d: world.day, t: `taken from the body of ${P.name(n)}` });
        it.holder = null; it.droppedAt = { x: n._x || (s ? s.x : 0), y: n._y || (s ? s.y : 0) };
      }
      const rr = ECHO.Sim.rngFor(world).next();
      if (important || (cause !== 'old age' && rr < 0.5) || rr < 0.1) {
        const where = s ? ` of ${s.name}` : '';
        ECHO.Chronicle.add(world, {
          text: `${P.fullTitle(world, n)}${where} died — ${cause}${killerName ? ', at the hands of ' + killerName : ''}.`,
          kind: 'death', importance: important ? 2 : (n.op && Object.keys(n.op).length ? 1 : 0), sid: n.home, npcs: [n.id]
        });
      }
      if (ECHO.Minds) ECHO.Minds.onDeath(world, n, cause, killerName, killerRef);
      ECHO.emit('npc:death', { npc: n, cause, killerRef });
    },

    birth(world, rng, mom, dad) {
      const s = ECHO.Sim.settlement(world, mom.loc);
      // Children may be named after legends the parents admire.
      let first = null, namedAfter = null;
      const admired = world.legends.filter(l => (s && l.homeId === s.id || l.renown > 60) && (mom.op[l.charId] || 0) + (dad.op[l.charId] || 0) > 30);
      if (admired.length && rng.chance(0.5)) {
        const l = rng.pick(admired);
        first = l.first; namedAfter = l.charId;
      }
      const kid = P.create(world, rng, { home: mom.loc, faction: mom.faction, culture: mom.culture, last: dad.last, prof: 'child', born: world.day, parents: [mom.id, dad.id], first, namedAfter });
      mom.kids.push(kid.id); dad.kids.push(kid.id);
      // Children inherit a trait from a parent half the time.
      if (rng.chance(0.5)) kid.traits[0] = rng.pick([...mom.traits, ...dad.traits]);
      if (kid.traits[0] === kid.traits[1]) kid.traits[1] = OPPOSITE[kid.traits[0]] ? rng.pick(TRAITS.filter(t => t !== kid.traits[0] && t !== OPPOSITE[kid.traits[0]])) : 'patient';
      world.stats.births++;
      P.remember(world, mom, `gave birth to ${kid.first}`, 'joy', kid.id, 2);
      P.remember(world, dad, `became father to ${kid.first}`, 'joy', kid.id, 2);
      if (namedAfter) {
        const l = world.legends.find(x => x.charId === namedAfter);
        ECHO.Chronicle.add(world, { text: `In ${s.name}, ${P.name(mom)} named her newborn ${kid.first}, after ${l ? l.name + ' ' + l.epithet : 'a hero of old'}.`, kind: 'legacy', importance: 2, sid: s.id, npcs: [kid.id] });
      } else if (rng.chance(0.15)) {
        ECHO.Chronicle.add(world, { text: `${kid.first} ${kid.last} was born in ${s.name}.`, kind: 'life', importance: 0, sid: s.id, npcs: [kid.id] });
      }
      return kid;
    },

    // ---------------------------------------------------------------- Daily life
    dailyTick(world, rng) {
      const people = Object.values(world.npcs);
      const bySettlement = {};
      for (const n of people) {
        if (n.status !== 'alive' || !n.loc) continue;
        (bySettlement[n.loc] = bySettlement[n.loc] || []).push(n);
      }
      for (const n of people) {
        if (n.status === 'dead') continue;
        const age = P.age(world, n);
        // --- Aging and death
        if (n.prof === 'child' && age >= 15) P.comeOfAge(world, rng, n);
        if (age > 52 && n.prof !== 'elder' && n.prof !== 'ruler' && !n.rank && rng.chance(0.004 * (age - 52))) {
          n.prof = 'elder';
        }
        if (age > 50 && rng.chance(Math.pow((age - 50) / 32, 2.4) * 0.025)) { P.kill(world, n, 'old age'); continue; }
        if (n.status !== 'alive' || !n.loc) continue;
        const s = ECHO.Sim.settlement(world, n.loc);
        if (!s) continue;

        // --- Food
        if (s.hunger > 0.05) {
          const fed = rng.next() > s.hunger * (n.wealth > 60 ? 0.4 : 1.1);
          if (!fed) n.starve++; else n.starve = Math.max(0, n.starve - 1);
        } else n.starve = Math.max(0, n.starve - 2);
        if (n.starve > 9 && rng.chance(0.03 + (age < 6 || age > 60 ? 0.04 : 0))) { P.kill(world, n, 'starvation'); continue; }

        // --- Social life
        const locals = bySettlement[n.loc];
        if (age >= 6 && locals && locals.length > 1 && rng.chance(0.35)) {
          const o = rng.pick(locals);
          if (o !== n && o.status === 'alive') P.interact(world, rng, n, o);
        }
        // --- Marriage
        if (!n.spouse && age >= 18 && age <= 48 && rng.chance(0.08)) {
          let best = null, bv = 55;
          for (const id in n.rel) {
            const o = world.npcs[id];
            if (!o || o.status !== 'alive' || o.spouse || o.loc !== n.loc || o.prof === 'child' || n.parents.includes(o.id) || o.parents.includes(n.id)) continue;
            if (n.parents.length && o.parents.some(p => n.parents.includes(p))) continue;
            if (n.rel[id] > bv && (o.rel[n.id] || 0) > 40) { bv = n.rel[id]; best = o; }
          }
          if (best && rng.chance(0.25)) P.marry(world, n, best);
        }
        // --- Children
        if (n.sex === 'f' && n.spouse && age >= 18 && age <= 42 && s.hunger < 0.25) {
          const sp = world.npcs[n.spouse];
          const crowd = U.clamp(2 - (bySettlement[n.loc] || []).length / Math.max(10, s.foundingPop || 30), 0.08, 1.2);
          if (sp && sp.sex === 'm' && sp.status === 'alive' && sp.loc === n.loc && n.kids.length < 6 && rng.chance(0.011 * crowd)) P.birth(world, rng, n, sp);
        }
        // --- Work and wealth
        if (n.prof !== 'child') {
          const earn = { merchant: 2.4, smith: 1.6, innkeeper: 1.4, ruler: 6, scholar: 1, guard: 1.1, priest: 0.8, reeve: 1.5 }[n.prof] || 0.8;
          n.wealth = U.clamp(n.wealth + earn * (0.5 + s.prosperity / 100) - 0.6 - s.hunger * 2, 0, 9999);
          if (n.prof === 'farmer' || n.prof === 'hunter' || n.prof === 'smith' || n.prof === 'miner') n.skill.craft = Math.min(100, n.skill.craft + 0.04);
          if (n.prof === 'guard') n.skill.fight = Math.min(100, n.skill.fight + 0.03);
          if (n.prof === 'scholar' || n.prof === 'priest' || n.prof === 'inventor') n.skill.lore = Math.min(100, n.skill.lore + 0.05);
        }
        // --- Life changes
        P.considerChange(world, rng, n, s, age);
      }
      P.immigration(world, rng);
    },

    // New blood: families arrive from beyond the realm where there is food and
    // room, and kingdoms resettle towns that have been emptied.
    immigration(world, rng) {
      for (const s of world.settlements) {
        const res = P.residents(world, s);
        const founding = s.foundingPop || 30;
        const need = ECHO.Economy.need(world, s);
        if (res.length < founding * 0.75 && s.hunger < 0.05 && s.stock.food > need * 4 && rng.chance(0.06)) {
          const culture = world.factions[s.faction] ? world.factions[s.faction].culture : 'valdren';
          const last = ECHO.makeSurname(rng, culture);
          const k = rng.int(2, 4);
          const fam = [];
          for (let i = 0; i < k; i++) {
            const kid = i >= 2;
            fam.push(P.create(world, rng, { home: s.id, faction: s.faction, culture, last, prof: kid ? 'child' : rng.pick(['farmer', 'farmer', 'hunter', 'woodcutter']), born: kid ? world.day - rng.int(1, 12) * ECHO.TIME.YEAR_DAYS : undefined, sex: i === 1 ? (fam[0].sex === 'f' ? 'm' : 'f') : undefined }));
          }
          if (fam.length >= 2) P.marry(world, fam[0], fam[1], true);
          for (const c of fam.slice(2)) { c.parents = [fam[0].id, fam[1].id]; fam[0].kids.push(c.id); fam[1].kids.push(c.id); }
          if (rng.chance(0.4)) ECHO.Chronicle.add(world, { text: `The ${last} family arrived in ${s.name} from beyond the hills, looking for land to work.`, kind: 'life', importance: 0, sid: s.id });
        }
        if (res.length < 6 && rng.chance(0.05)) {
          const f = world.factions[s.faction];
          const donor = world.settlements.filter(o => o.faction === s.faction && o !== s && P.residents(world, o).length > 28 && o.hunger < 0.1)[0];
          if (donor) {
            const settlers = P.residents(world, donor).filter(n => ['farmer', 'hunter', 'woodcutter'].includes(n.prof) && !n.spouse).slice(0, 4);
            for (const n of settlers) ECHO.Sim.migrate(world, n, donor, s, 'resettle');
            if (settlers.length) ECHO.Chronicle.add(world, { text: `${f ? f.short : 'Settlers'} sent ${settlers.length} settlers from ${donor.name} to revive ${s.name}.`, kind: 'life', importance: 1, sid: s.id });
          }
        }
      }
    },

    comeOfAge(world, rng, n) {
      const s = ECHO.Sim.settlement(world, n.loc || n.home);
      const parent = n.parents.map(id => world.npcs[id]).find(p => p && p.prof !== 'elder' && p.prof !== 'ruler');
      let prof = parent && rng.chance(0.55) ? parent.prof : rng.pick(['farmer', 'farmer', 'hunter', 'woodcutter', 'merchant', 'guard', 'herbalist']);
      // Childhood dreams sometimes come true.
      const dream = n.mind && n.mind.goal && n.mind.goal.kind === 'child' ? n.mind.goal.dream : null;
      if (dream && rng.chance(0.5)) prof = /knight|captain/.test(dream) ? 'guard' : /scholar/.test(dream) ? 'scholar' : /inventor/.test(dream) ? 'scholar' : /smith/.test(dream) ? 'smith' : /merchant/.test(dream) ? 'merchant' : /hunter/.test(dream) ? 'hunter' : /priest/.test(dream) ? 'priest' : prof;
      if (n.flags.survivor || P.has(n, 'brave') && rng.chance(0.5)) prof = 'guard';
      if (['ruler', 'reeve', 'innkeeper', 'bandit'].includes(prof)) prof = 'farmer';
      if (s && s.kind === 'temple' && rng.chance(0.4)) prof = 'priest';
      n.prof = prof;
      if (prof === 'guard') n.skill.fight = Math.max(n.skill.fight, 20);
      P.remember(world, n, 'came of age and became a ' + PROF[prof].label, 'life', null, 1);
    },

    interact(world, rng, a, b) {
      let d = rng.range(-4, 7);
      const shared = a.traits.filter(t => b.traits.includes(t)).length;
      d += shared * 4;
      for (const t of a.traits) if (b.traits.includes(OPPOSITE[t])) d -= 5;
      if (P.has(a, 'kind') || P.has(b, 'kind')) d += 2;
      if (P.has(a, 'cruel') || P.has(a, 'hot-headed')) d -= 3;
      if (a.prof === b.prof) d += 1.5;
      P.bond(a, b.id, d);
      P.bond(b, a.id, d * 0.8);
      const r = a.rel[b.id];
      if (r <= -55 && rng.chance(0.03)) {
        // Feuds sometimes turn violent.
        if ((P.has(a, 'hot-headed') || P.has(a, 'cruel')) && rng.chance(0.15)) {
          const loser = rng.chance(a.skill.fight / (a.skill.fight + b.skill.fight + 1)) ? b : a;
          const winner = loser === a ? b : a;
          P.remember(world, winner, `fought ${loser.first} in the street`, 'conflict', loser.id, 2);
          P.remember(world, loser, `was beaten by ${winner.first}`, 'trauma', winner.id, 3);
          if (rng.chance(0.08)) {
            P.kill(world, loser, 'slain in a feud', P.name(winner), winner.id);
            winner.flags.murderer = true;
            const s = ECHO.Sim.settlement(world, winner.loc);
            if (s) s.unrest = Math.min(100, s.unrest + 4);
            if (rng.chance(0.6)) P.becomeOutlaw(world, rng, winner, 'fled after killing ' + loser.first);
          }
        } else if (rng.chance(0.2)) {
          ECHO.Chronicle.add(world, { text: `A bitter feud between ${P.name(a)} and ${P.name(b)} divides ${ECHO.Sim.settlement(world, a.loc).name}.`, kind: 'life', importance: 0, sid: a.loc, npcs: [a.id, b.id] });
        }
      }
    },

    considerChange(world, rng, n, s, age) {
      if (n.prof === 'child' || n.prof === 'elder' || n.prof === 'ruler' || n.status !== 'alive') return;
      const region = ECHO.World.regionAt(world, s.x, s.y);
      // Desperation → crime.
      const desperate = n.starve > 4 || (n.wealth < 4 && s.unrest > 55);
      if (n.prof !== 'bandit' && desperate && age >= 16) {
        let p = 0.0012 + n.starve * 0.0005;
        if (P.has(n, 'greedy') || P.has(n, 'cruel') || P.has(n, 'deceitful')) p *= 2.5;
        if (P.has(n, 'honest') || P.has(n, 'pious') || P.has(n, 'loyal')) p *= 0.35;
        if (n.rank) p *= 0.3;
        if (rng.chance(p)) { P.becomeOutlaw(world, rng, n, n.starve > 4 ? 'turned to banditry out of hunger' : 'turned to banditry'); return; }
      }
      // Hunger → migration.
      if (n.starve > 3 && rng.chance(0.012 * (P.has(n, 'fickle') ? 2 : 1) * (n.spouse ? 0.6 : 1))) {
        const dest = ECHO.Economy.bestPlaceToLive(world, n, s);
        if (dest && dest !== s) { ECHO.Sim.migrate(world, n, s, dest, 'hunger'); return; }
      }
      // Failing fields push farmers into other trades.
      if (n.prof === 'farmer' && (s.cropFactor || 1) < 0.55 && rng.chance(0.02)) {
        const options = ['hunter', 'woodcutter', 'guard', 'merchant'];
        const np = P.has(n, 'brave') ? 'guard' : rng.pick(options);
        n.prof = np;
        P.remember(world, n, `gave up farming as the fields failed and became a ${PROF[np].label}`, 'change', null, 2);
        if (rng.chance(0.2)) ECHO.Chronicle.add(world, { text: `With the fields of ${s.name} failing, ${P.name(n)} put down the plough and became a ${PROF[np].label}.`, kind: 'economy', importance: 0, sid: s.id, npcs: [n.id] });
      }
      // Ambition → arms.
      if (n.prof !== 'guard' && n.prof !== 'bandit' && age < 35 && (P.has(n, 'ambitious') || P.has(n, 'brave')) && rng.chance(0.0015)) {
        const f = world.factions[n.faction];
        if (f && f.type === 'kingdom' && f.treasury > 200) { n.prof = 'guard'; n.skill.fight = Math.max(n.skill.fight, 18); P.remember(world, n, 'took up the spear', 'change', null, 1); }
      }
      // Curious scholars may become inventors.
      if ((n.prof === 'scholar' || n.prof === 'smith') && P.has(n, 'curious') && n.skill.lore + n.skill.craft > 70 && rng.chance(0.002)) {
        n.prof = 'inventor';
        P.remember(world, n, 'began tinkering with strange devices', 'change', null, 2);
      }
      // Bandits with a conscience may return.
      if (n.prof === 'bandit' && (P.has(n, 'kind') || P.has(n, 'pious')) && n.starve === 0 && rng.chance(0.003)) {
        const home = ECHO.Sim.settlement(world, n.home);
        if (home && home.faction !== 'ashfang') {
          ECHO.Politics.leaveCamp(world, n);
          n.prof = 'farmer'; n.faction = home.faction;
          ECHO.Sim.migrate(world, n, s, home, 'redemption');
          ECHO.Chronicle.add(world, { text: `${P.name(n)} abandoned the Ashfang and walked home to ${home.name}.`, kind: 'life', importance: 1, sid: home.id, npcs: [n.id] });
        }
      }
      // Wanderers: brave fighters drawn to adventure.
      if (n.prof !== 'wanderer' && n.prof !== 'guard' && n.prof !== 'bandit' && P.has(n, 'brave') && n.skill.fight > 40 && !n.spouse && rng.chance(0.002)) {
        n.prof = 'wanderer';
        P.remember(world, n, 'left their trade to seek fortune with a blade', 'change', null, 2);
      }
    },

    becomeOutlaw(world, rng, n, why) {
      const from = ECHO.Sim.settlement(world, n.loc);
      n.prof = 'bandit';
      const oldFaction = n.faction;
      n.faction = 'ashfang';
      P.remember(world, n, why, 'change', null, 3);
      let camp = ECHO.Politics.nearestCamp(world, from ? from.x : 100, from ? from.y : 75, 60);
      if (!camp) camp = ECHO.Politics.foundCamp(world, rng, n);
      if (!camp) return;
      if (from) from.residents = from.residents.filter(id => id !== n.id);
      ECHO.Politics.joinCamp(world, n, camp);
      if (from) {
        from.unrest = Math.min(100, from.unrest + 1.5);
        ECHO.Chronicle.add(world, { text: `${P.name(n)} of ${from.name} ${why}, and joined the Ashfang at ${camp.name}.`, kind: 'crime', importance: 1, sid: from.id, npcs: [n.id] });
      }
      void oldFaction;
    }
  };
})();
