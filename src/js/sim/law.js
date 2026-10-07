// Law: each realm keeps its own law — the King's Peace hangs murderers,
// the Merchant Charter takes a blood-price, the Lantern Rule banishes them —
// and each town bends it: a cruel reeve is harsher, a greedy one can be
// bought, some towns keep a curfew, the temple towns forbid fire within
// their walls. Crimes are recorded with their witnesses; the accused are
// arrested and tried, and sentences fall on townsfolk as well as on you.
(function () {
  const { U } = ECHO;
  const P = () => ECHO.People;
  const S = () => ECHO.Sim;

  // p: punishment ('fine' | 'stocks' | 'jail' | 'banish' | 'hang' | 'bloodprice')
  const CODES = {
    valdren: { name: 'the King\'s Peace', judge: 'magistrate', theft: { p: 'fine', mult: 3, min: 15 }, assault: { p: 'jail', days: 4 }, murder: { p: 'hang' }, arson: { p: 'hang' }, debt: { p: 'jail', days: 6 }, trespass: { p: 'fine', min: 10 }, resisting: { p: 'jail', days: 3 }, flame: null, curfew: { p: 'fine', min: 5 }, tax: { p: 'fine', mult: 2, min: 10 } },
    ashmere: { name: 'the Merchant Charter', judge: 'assessor', theft: { p: 'fine', mult: 4, min: 20 }, assault: { p: 'fine', min: 30 }, murder: { p: 'bloodprice', min: 150 }, arson: { p: 'fine', mult: 2, min: 120 }, debt: { p: 'fine', mult: 1.5, min: 20 }, trespass: { p: 'fine', min: 6 }, resisting: { p: 'fine', min: 25 }, flame: null, curfew: { p: 'fine', min: 4 }, tax: { p: 'fine', mult: 1.5, min: 8 }, bribable: true },
    lantern: { name: 'the Lantern Rule', judge: 'high priest', theft: { p: 'stocks' }, assault: { p: 'jail', days: 3 }, murder: { p: 'banish', days: 120 }, arson: { p: 'banish', days: 90 }, debt: { p: 'stocks' }, trespass: { p: 'stocks' }, resisting: { p: 'jail', days: 2 }, flame: { p: 'fine', min: 20 }, curfew: { p: 'fine', min: 5 }, tax: { p: 'fine', mult: 1.5, min: 8 } }
  };
  const CRIME_WORD = { theft: 'theft', assault: 'assault', murder: 'murder', arson: 'arson', debt: 'unpaid debt', trespass: 'trespass', resisting: 'resisting arrest', flame: 'casting fire within the walls', curfew: 'breaking the curfew', tax: 'unpaid taxes' };
  const SEVERITY = { fine: 1, stocks: 2, jail: 3, bloodprice: 3, banish: 4, hang: 5 };

  const L = ECHO.Law = {
    CODES, CRIME_WORD,
    // The law as it stands in one town.
    code(world, s) {
      const f = world.factions[s.faction];
      const base = CODES[s.faction] || (f && f.type === 'order' ? CODES.lantern : f && f.culture === 'ashmere' ? CODES.ashmere : CODES.valdren);
      const h = ECHO.hashStr(s.id + world.seed);
      const reeve = s.ruler && world.npcs[s.ruler];
      return {
        ...base,
        curfew: s.kind === 'capital' || h % 4 === 0 || !!(ECHO.Realm && ECHO.Realm.edict(world, s.faction, 'curfew')),
        noFlame: base === CODES.lantern || s.kind === 'temple' || !!(ECHO.Realm && ECHO.Realm.edict(world, s.faction, 'fireban')),
        harsh: reeve && P().has(reeve, 'cruel'),
        lenient: reeve && (P().has(reeve, 'kind') || P().has(reeve, 'generous')),
        bribable: base.bribable || (reeve && P().has(reeve, 'greedy')),
        judgeName: reeve ? P().fullTitle(world, reeve) : `the ${base.judge}`
      };
    },
    sentenceFor(world, s, kind, value) {
      const c = L.code(world, s);
      let rule = c[kind] || { p: 'fine', min: 10 };
      if (kind === 'flame' && !c.noFlame) return null;
      if (kind === 'curfew' && !c.curfew) return null;
      let p = rule.p;
      // a cruel reeve hardens sentences, a kind one softens them
      const order = ['fine', 'stocks', 'jail', 'banish', 'hang'];
      if (c.harsh && p !== 'hang' && p !== 'bloodprice') p = order[Math.min(order.length - 1, order.indexOf(p) + 1)];
      if (c.lenient && p !== 'fine' && p !== 'bloodprice') p = order[Math.max(0, order.indexOf(p) - 1)];
      const fine = Math.round(Math.max(rule.min || 10, (value || 0) * (rule.mult || 1)));
      return { p, fine: p === 'fine' || p === 'bloodprice' ? fine : 0, days: p === 'jail' ? (rule.days || 4) * (c.harsh ? 1.5 : 1) : p === 'banish' ? (rule.days || 90) : 0, kind, rule };
    },
    describeSentence(x) {
      if (!x) return 'no crime here';
      return { fine: `a fine of ${x.fine} crowns`, bloodprice: `a blood-price of ${x.fine} crowns to the family`, stocks: 'a day in the stocks', jail: `${Math.round(x.days)} days in the cells`, banish: `banishment for ${x.days} days`, hang: 'death by hanging' }[x.p];
    },
    // A summary of a town's law, for the notice board.
    summary(world, s) {
      const c = L.code(world, s);
      const line = k => `${U.cap(CRIME_WORD[k])}: ${L.describeSentence(L.sentenceFor(world, s, k, 10))}`;
      const out = [`${s.name} keeps ${c.name}, judged by ${c.judgeName}.`];
      for (const k of ['theft', 'assault', 'murder', 'arson', 'trespass', 'debt']) out.push(line(k));
      if (c.noFlame) out.push(line('flame'));
      if (c.curfew) out.push('Curfew: no one abroad in the streets between midnight and dawn. ' + line('curfew').split(': ')[1] + '.');
      if (c.harsh) out.push('The reeve is known to be harsh.');
      if (c.lenient) out.push('The reeve is known to be merciful.');
      if (c.bribable) out.push('It is whispered that justice here can be bought.');
      return out;
    },

    // ---------------------------------------------------------------- the record
    crimes(world) { return (world.crimes = world.crimes || []); },
    report(world, o) {
      const c = { id: 'cr' + (world._crimeId = (world._crimeId || 0) + 1), by: o.by, kind: o.kind, victim: o.victim || null, victimName: o.victimName || null, sid: o.sid, faction: o.faction, d: world.day, witnesses: o.witnesses || [], value: o.value || 0, status: 'open' };
      L.crimes(world).push(c);
      if (L.crimes(world).length > 120) world.crimes = L.crimes(world).filter(x => x.status === 'open' || world.day - x.d < 60);
      return c;
    },
    openAgainstPlayer(world, pl, faction) {
      return L.crimes(world).filter(c => c.by === 'player' && c.status === 'open' && (!faction || c.faction === faction));
    },
    // How strong the case is: living witnesses, the victim's own word, what everyone has heard.
    evidence(world, c) {
      const alive = c.witnesses.filter(id => world.npcs[id] && world.npcs[id].status === 'alive');
      const victimSpeaks = c.victim && world.npcs[c.victim] && world.npcs[c.victim].status === 'alive' && c.kind !== 'murder';
      return { alive, dead: c.witnesses.length - alive.length, victimSpeaks, strength: Math.min(3, alive.length) + (victimSpeaks ? 1 : 0) };
    },

    // ---------------------------------------------------------------- townsfolk on trial
    npcCrime(world, rng, o) {
      const n = world.npcs[o.by];
      const s = S().settlement(world, o.sid);
      if (!n || !s) return;
      const caught = o.kind === 'debt' || rng.chance(o.kind === 'murder' ? 0.75 : 0.5);
      if (!caught) return;
      const x = L.sentenceFor(world, s, o.kind, o.amt || 10);
      if (!x) return;
      const what = CRIME_WORD[o.kind];
      const victim = o.victim && world.npcs[o.victim];
      const c = L.code(world, s);
      let text = `${P().name(n)} was tried in ${s.name} for ${what}${victim ? ' against ' + P().name(victim) : ''} under ${c.name}`;
      switch (x.p) {
        case 'fine': case 'bloodprice': {
          const paid = Math.min(n.wealth, x.fine);
          n.wealth -= paid;
          if (x.p === 'bloodprice' && victim) { const kin = victim.spouse && world.npcs[victim.spouse] || victim.kids.map(id => world.npcs[id]).find(Boolean); if (kin) kin.wealth += paid; }
          else s.wealth = (s.wealth || 0) + paid;
          if (paid < x.fine) { n.jailUntil = world.day + Math.ceil((x.fine - paid) / 6); text += ` and, unable to pay the ${x.fine} crowns, was thrown in the cells.`; }
          else text += ` and paid ${x.p === 'bloodprice' ? 'a blood-price' : 'a fine'} of ${x.fine} crowns.`;
          break;
        }
        case 'stocks':
          n.stocksDay = world.day + 1;
          for (const o2 of P().residents(world, s)) P().bond(o2, n.id, -4);
          P().remember(world, n, `was put in the stocks for ${what}`, 'trauma', null, 2);
          text += ' and spent a day in the stocks.';
          break;
        case 'jail':
          n.jailUntil = world.day + Math.round(x.days);
          P().remember(world, n, `was jailed for ${what}`, 'trauma', null, 2);
          text += ` and was jailed for ${Math.round(x.days)} days.`;
          break;
        case 'banish': {
          const dest = world.settlements.filter(t => t.faction !== s.faction && t.faction !== 'ashfang')[0];
          text += ' and was banished.';
          if (dest && S().route(world, s.id, dest.id)) S().migrate(world, n, s, dest, 'banished');
          else P().becomeOutlaw(world, rng, n, 'was banished and took to the woods');
          break;
        }
        case 'hang':
          text += ' and was hanged.';
          ECHO.Chronicle.add(world, { text, kind: 'crime', importance: 1, sid: s.id, npcs: [n.id] });
          P().kill(world, n, `hanged for ${what}`);
          return;
      }
      ECHO.Chronicle.add(world, { text, kind: 'crime', importance: o.kind === 'murder' ? 1 : 0, sid: s.id, npcs: [n.id] });
    },
    // the jailed don't wander off to work
    dailyTick(world, rng) {
      for (const n of Object.values(world.npcs)) if (n.jailUntil && n.jailUntil <= world.day) delete n.jailUntil;
      // old, minor charges are quietly dropped; murder is never forgotten
      for (const c of L.crimes(world)) if (c.status === 'open' && c.kind !== 'murder' && c.kind !== 'arson' && world.day - c.d > 45) c.status = 'dropped';
      // the desperate steal — and sometimes get caught
      for (const s of world.settlements) {
        if (s.faction === 'ashfang') continue;
        for (const n of P().residents(world, s)) {
          if (n.prof === 'child' || n.prof === 'bandit' || !(n.starve > 2 || n.wealth < 1)) continue;
          let p = 0.004 * (P().has(n, 'greedy') || P().has(n, 'deceitful') ? 2.5 : 1) * (P().has(n, 'honest') || P().has(n, 'pious') ? 0.2 : 1);
          if (!rng.chance(p)) continue;
          const mark = P().residents(world, s).filter(o => o !== n && o.wealth > 30).sort(() => rng.next() - 0.5)[0];
          if (!mark) continue;
          const take = Math.min(mark.wealth * 0.3, 15);
          mark.wealth -= take; n.wealth += take; n.starve = Math.max(0, n.starve - 2);
          P().bond(mark, n.id, -30);
          L.npcCrime(world, rng, { by: n.id, kind: 'theft', victim: mark.id, sid: s.id, amt: take });
        }
      }
    }
  };
})();
