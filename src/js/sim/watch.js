// The Watch: every town is policed, every day. Each town keeps a watch — a
// captain and watchmen paid from the realm's treasury — and the size, pay,
// morale and honesty of that watch decide how safe its streets are.
// Townsfolk commit crimes for their own reasons (hunger, greed, grudges,
// drink, a crime ring); every crime opens a case with witnesses and clues;
// the watch investigates day by day, catches some culprits, lets some cases
// go cold — and, when it is corrupt or under pressure, hangs the wrong man.
// Safety and trust rise and fall with all of it, and rulers answer: more
// watchmen, night patrols, curfews, watchtowers, a new captain.
// The player is one more person in this: a criminal the watch hunts by its
// clues, a witness, an informant, or a deputy of the watch.
(function () {
  const { U } = ECHO;
  const P = () => ECHO.People;
  const S = () => ECHO.Sim;
  const L = () => ECHO.Law;

  const RING_NAMES = ['the Velvet Hand', 'the Grey Cloaks', 'the Lampless', 'the Quiet Company', 'the Ninefingers', 'the Crows', 'the Cellar Kings', 'the Silk Knives'];
  // matches Spawner.look's hair palette, so what witnesses describe is what you see
  const HAIR = ['black', 'dark brown', 'brown', 'tawny', 'fair', 'grey', 'red', 'black'];
  const TRACE = {
    smith: 'soot, and the smell of the forge', miller: 'a dusting of flour', farmer: 'field mud on the boots', woodcutter: 'sawdust and pine resin', hunter: 'a hunter\'s gut string, snapped', herbalist: 'crushed leaves of feverfew',
    merchant: 'ink from a merchant\'s ledger', guard: 'the print of a hobnailed boot', innkeeper: 'a stink of spilt ale', miner: 'grey rock dust', priest: 'drips of candle wax', scholar: 'ink stains and a torn page', inventor: 'a smear of machine oil',
    elder: 'the mark of a walking stick', wanderer: 'road dust from far away', reeve: 'sealing wax', default: 'nothing anyone can make sense of'
  };
  const KIND_WORD = { theft: 'theft', burglary: 'burglary', assault: 'assault', murder: 'murder', arson: 'arson', smuggling: 'smuggling' };
  const CRIMES = {
    // w: base share of the town's crime; night: when it happens
    theft: { w: 40, night: false }, burglary: { w: 20, night: true }, assault: { w: 18, night: true }, murder: { w: 3.5, night: true }, arson: { w: 2, night: true }, smuggling: { w: 6, night: true }
  };

  const W = ECHO.Watch = {
    HAIR, TRACE, KIND_WORD,
    // ------------------------------------------------------------ state
    st(world, s) {
      const w = s.watch = s.watch || { morale: 70, corrupt: 0.05, trust: 60, safety: 75, log: [], nightPatrol: false };
      w.log = w.log || [];
      return w;
    },
    cases(world) { return (world.cases = world.cases || []); },
    byId(world, id) { return W.cases(world).find(c => c.id === id); },
    guardsOf(world, s) { return P().residents(world, s).filter(n => n.prof === 'guard' && !(n.jailUntil > world.day) && !n.journey); },
    need(world, s) {
      const pop = P().residents(world, s).length;
      const w = W.st(world, s);
      const f = world.factions[s.faction];
      let n = Math.ceil(pop / 14) + (w.safety < 50 ? 1 : 0) + (s.kind === 'capital' ? 1 : 0);
      if (f && f.realm && f.realm.agenda === 'secure') n++;
      if (ECHO.Realm && ECHO.Realm.edict(world, s.faction, 'nightwatch')) n++;
      return Math.max(1, n);
    },
    captain(world, s) {
      const w = W.st(world, s);
      let c = w.captain && world.npcs[w.captain];
      if (c && c.status === 'alive' && c.prof === 'guard' && (c.loc === s.id || c.home === s.id)) return c;
      const gs = W.guardsOf(world, s).sort((a, b) => (b.rank - a.rank) || (b.renown - a.renown) || (b.skill.fight - a.skill.fight));
      c = gs[0] || null;
      w.captain = c ? c.id : null;
      return c;
    },
    // How well the streets are watched: 0 = nobody, 1 = fully manned.
    coverage(world, s) {
      const w = W.st(world, s);
      const g = W.guardsOf(world, s).length;
      const lamps = ECHO.Civ && ECHO.Civ.has(world, s.faction, 'lamps') ? 1.15 : 1;
      return U.clamp(g / W.need(world, s) * (0.5 + w.morale / 140) * lamps, 0, 1.3);
    },
    hairOf(npc) { const h = ECHO.hashStr(npc.id + npc.first); return HAIR[(h >>> 3) % HAIR.length]; },
    traceOf(npc) { return TRACE[npc.prof] || TRACE.default; },

    // ------------------------------------------------------------ cases
    openCase(world, o) {
      const s = S().settlement(world, o.sid);
      if (!s) return null;
      const culprit = o.by && o.by !== 'player' ? world.npcs[o.by] : null;
      const pl = world.player;
      const c = {
        id: 'case' + (world._caseId = (world._caseId || 0) + 1), kind: o.kind, sid: s.id, faction: s.faction, d: world.day, night: !!o.night,
        victim: o.victim || null, victimName: o.victimName || (o.victim && world.npcs[o.victim] ? P().name(world.npcs[o.victim]) : null),
        by: o.by || null, x: o.x != null ? o.x : s.x + (ECHO.hash2(world.day, 3, (world._caseId || 0)) - 0.5) * 8, y: o.y != null ? o.y : s.y + (ECHO.hash2(world.day, 4, (world._caseId || 0)) - 0.5) * 8,
        value: o.value || 0, status: 'open', progress: 0, witnesses: (o.witnesses || []).slice(0, 4), seenNear: (o.seenNear || []).slice(0, 6), crimeId: o.crimeId || null,
        method: o.method || null, priority: o.priority || 0,
        clue: culprit ? { sex: culprit.sex, hair: W.hairOf(culprit), trace: W.traceOf(culprit) } : o.by === 'player' && pl ? { sex: pl.sex || 'm', hair: 'a stranger\'s', trace: o.method === 'fire' ? 'scorch marks — someone who casts fire' : o.method === 'arrow' ? 'an arrow of foreign fletching' : 'a clean, practised blade-cut' } : null,
        found: {}, questioned: []
      };
      W.cases(world).push(c);
      W.st(world, s).log.push({ d: world.day, k: c.kind });
      return c;
    },
    // The watch's daily work on one case.
    investigate(world, c, rng) {
      const s = S().settlement(world, c.sid);
      if (!s || c.status !== 'open') return;
      const w = W.st(world, s);
      const cap = W.captain(world, s);
      const staff = Math.min(1, W.guardsOf(world, s).length / W.need(world, s));
      const witnesses = c.witnesses.filter(id => world.npcs[id] && world.npcs[id].status === 'alive').length;
      let rate = 0.05 + 0.11 * Math.min(3, witnesses) + (c.kind === 'murder' ? 0.07 : 0) + c.priority * 0.05;
      rate *= cap ? 0.7 + Math.min(0.6, (cap.renown || 0) / 60 + cap.rank * 0.08) : 0.45;
      rate *= (1 - w.corrupt * 0.65) * (0.45 + w.trust / 110) * (0.25 + staff * 0.75);
      const culprit = c.by && c.by !== 'player' ? world.npcs[c.by] : null;
      if (culprit && culprit.ring && w.ring && w.ring.members.includes(culprit.id)) rate *= 1 - Math.min(0.6, w.ring.strength * 0.6);
      if (c.by === 'player') {
        const pl = world.player;
        const seen = c.seenNear.filter(id => world.npcs[id] && world.npcs[id].status === 'alive').length;
        rate = (0.02 + 0.055 * Math.min(4, seen) + Math.min(0.06, (pl ? pl.renown : 0) / 500)) * (cap ? 1 : 0.5) * (1 - w.corrupt * 0.6) * (0.5 + staff * 0.5);
        if (pl && pl.skills) rate *= 1 - Math.min(0.5, (pl.skills.shadow || 0) / 160);
        if (c.misled) rate *= 0.35;
      }
      c.progress += rate * (0.7 + rng.next() * 0.6);
      if (c.progress >= 1) return W.solve(world, c, rng);
      // cases go cold
      const cold = c.kind === 'murder' ? 30 : 18;
      if (world.day - c.d > cold) W.goCold(world, c, rng);
    },
    solve(world, c, rng, how) {
      const s = S().settlement(world, c.sid);
      const w = W.st(world, s);
      const word = KIND_WORD[c.kind] || c.kind;
      c.status = 'solved'; c.solvedDay = world.day;
      w.trust = U.clamp(w.trust + (c.kind === 'murder' ? 5 : 2), 0, 100);
      w.solved = (w.solved || 0) + 1;
      if (c.by === 'player') {
        const pl = world.player;
        if (!pl || !pl.alive) return;
        const crime = L().report(world, { by: 'player', kind: c.kind === 'burglary' ? 'theft' : c.kind, victim: c.victim, victimName: c.victimName, sid: s.id, faction: s.faction, witnesses: c.seenNear.slice(0, 3), value: c.value });
        crime.reported = true; crime.caseId = c.id;
        pl.wanted = pl.wanted || {};
        pl.wanted[s.faction] = Math.min(200, (pl.wanted[s.faction] || 0) + (c.kind === 'murder' ? 80 : 35));
        c.named = true;
        ECHO.Chronicle.add(world, { text: `The watch of ${s.name} named ${pl.first} ${pl.last} for the ${word}${c.victimName ? ' of ' + c.victimName : ''}${how === 'confessed' ? ' — by their own confession' : ''}.`, kind: 'crime', importance: 2, sid: s.id, char: pl.charId });
        W.notify(world, `The watch of ${s.name} has named you for the ${word}${c.victimName ? ' of ' + c.victimName : ''}. There are people who saw you near the place.`);
        // a scapegoat already punished for it is cleared — the town learns the truth
        if (c.scapegoat) W.exonerate(world, c);
        return;
      }
      const n = c.by && world.npcs[c.by];
      if (!n || n.status !== 'alive') return;
      L().npcCrime(world, rng, { by: n.id, kind: W.lawKind(c.kind), victim: c.victim, sid: s.id, amt: c.value, caught: true, caseId: c.id });
      if (w.ring && w.ring.members.includes(n.id)) W.ringLoss(world, s, n, rng);
    },
    lawKind(k) { return k === 'burglary' ? 'burglary' : k === 'smuggling' ? 'smuggling' : k; },
    goCold(world, c, rng) {
      const s = S().settlement(world, c.sid);
      const w = W.st(world, s);
      c.status = 'cold';
      w.trust = U.clamp(w.trust - (c.kind === 'murder' ? 7 : 2), 0, 100);
      w.cold = (w.cold || 0) + 1;
      const word = KIND_WORD[c.kind];
      // Under pressure, a corrupt or cruel watch finds someone to hang for it.
      const cap = W.captain(world, s);
      const pressure = c.kind === 'murder' && (w.corrupt > 0.35 || (cap && P().has(cap, 'cruel')) || c.priority > 0 || w.trust < 35);
      if (pressure && rng.chance(0.45)) return W.scapegoat(world, c, rng);
      if (c.kind === 'murder') ECHO.Chronicle.add(world, { text: `The watch of ${s.name} has given up on the murder of ${c.victimName || 'a traveller'}. Whoever did it walks free.`, kind: 'crime', importance: 1, sid: s.id });
      void word;
    },
    scapegoat(world, c, rng) {
      const s = S().settlement(world, c.sid);
      const pool = P().residents(world, s).filter(n => n.id !== c.by && n.id !== c.victim && n.prof !== 'ruler' && n.prof !== 'guard' && n.prof !== 'child' && n.prof !== 'reeve' && P().age(world, n) > 16);
      if (!pool.length) return;
      // the poor, the disliked, the outsider
      pool.sort((a, b) => (a.wealth - b.wealth) + (P().has(a, 'hot-headed') ? -20 : 0) - (P().has(b, 'hot-headed') ? -20 : 0) + (rng.next() - 0.5) * 30);
      const n = pool[0];
      c.status = 'wrong'; c.scapegoat = n.id; c.scapegoatName = P().name(n);
      const x = L().sentenceFor(world, s, 'murder', 0) || { p: 'jail', days: 10 };
      let fate;
      if (x.p === 'hang') { fate = 'was hanged'; P().kill(world, n, `hanged for the murder of ${c.victimName || 'a stranger'} — a murder some say ${n.sex === 'f' ? 'she' : 'he'} never did`); c.scapegoatDead = true; }
      else if (x.p === 'banish') { fate = 'was banished'; n.jailUntil = world.day + 2; P().remember(world, n, 'was banished for a murder they did not do', 'trauma', null, 5); }
      else { fate = 'was thrown in the cells'; n.jailUntil = world.day + 40; P().remember(world, n, 'was jailed for a murder they did not do', 'trauma', null, 5); }
      for (const k of [n.spouse, ...n.kids].map(id => id && world.npcs[id]).filter(k => k && k.status === 'alive')) { P().remember(world, k, `saw ${n.first} punished for a murder ${n.sex === 'f' ? 'she' : 'he'} swore ${n.sex === 'f' ? 'she' : 'he'} did not do`, 'trauma', null, 4); k.op = k.op || {}; }
      ECHO.Chronicle.add(world, { text: `${P().name(n)} ${fate} in ${s.name} for the murder of ${c.victimName || 'a traveller'}. ${n.sex === 'f' ? 'She' : 'He'} swore to the end it was not ${n.sex === 'f' ? 'her' : 'him'}.`, kind: 'crime', importance: 2, sid: s.id, npcs: [n.id] });
      if (c.by === 'player') W.notify(world, `${P().name(n)} ${fate} in ${s.name} for the murder you committed. You know the truth.`);
    },
    // The truth comes out: whoever was punished in the culprit's place is cleared.
    exonerate(world, c) {
      const s = S().settlement(world, c.sid);
      const n = world.npcs[c.scapegoat];
      if (!n || !s) return;
      const w = W.st(world, s);
      w.trust = U.clamp(w.trust - 15, 0, 100);
      if (n.status === 'alive') { n.jailUntil = world.day; P().remember(world, n, 'was cleared of a murder they did not do', 'joy', null, 4); }
      ECHO.Chronicle.add(world, { text: `${c.scapegoatDead ? 'Too late for ' + P().name(n) + ': ' : ''}the truth about the murder of ${c.victimName || 'a traveller'} in ${s.name} is out. ${P().name(n)} was innocent. The town will not soon trust its watch again.`, kind: 'crime', importance: 2, sid: s.id, npcs: [n.id] });
      const cap = W.captain(world, s);
      if (cap && w.corrupt > 0.3) W.sackCaptain(world, s, 'after an innocent was punished');
    },

    // ------------------------------------------------------------ NPC crime
    pickCulprit(world, rng, s, kind, ring) {
      const res = P().residents(world, s).filter(n => n.prof !== 'child' && n.prof !== 'ruler' && n.prof !== 'reeve' && n.prof !== 'bandit' && !(n.jailUntil > world.day) && !n.journey && P().age(world, n) > 14);
      const weight = n => {
        let w = 0.15;
        if (P().has(n, 'greedy')) w *= 2.6;
        if (P().has(n, 'deceitful')) w *= 2.6;
        if (P().has(n, 'honest') || P().has(n, 'pious')) w *= 0.12;
        if (P().has(n, 'kind')) w *= 0.4;
        if (kind === 'theft' || kind === 'burglary') { if (n.starve > 2) w *= 4; if (n.wealth < 5) w *= 2.2; if (n.debt) w *= 1.6; }
        if (kind === 'assault' || kind === 'murder') { if (P().has(n, 'hot-headed')) w *= 3; if (P().has(n, 'cruel')) w *= 2.5; if (P().has(n, 'patient')) w *= 0.3; }
        if (kind === 'arson') { if (s.unrest > 60) w *= 3; if (P().has(n, 'hot-headed')) w *= 2; }
        if (n.prof === 'guard') w *= kind === 'assault' ? 0.6 : W.st(world, s).corrupt;
        if (ring && ring.members.includes(n.id)) w *= kind === 'smuggling' ? 30 : 5;
        else if (kind === 'smuggling') w *= n.prof === 'merchant' ? 1.5 : 0.1;
        return w;
      };
      const tot = U.sum(res.map(weight));
      if (!tot) return null;
      let r = rng.next() * tot;
      for (const n of res) { r -= weight(n); if (r <= 0) return n; }
      return res[res.length - 1] || null;
    },
    crimeRate(world, s) {
      const w = W.st(world, s);
      const pop = P().residents(world, s).length;
      const cov = W.coverage(world, s);
      const poor = P().residents(world, s).filter(n => n.wealth < 4).length / Math.max(1, pop);
      let r = pop * 0.003 * (1 + s.hunger * 3 + (s.unrest || 0) / 55 + poor * 1.5);
      r *= 1.55 - Math.min(1.1, cov) * 0.75;
      if (w.ring) r *= 1 + w.ring.strength;
      if (L().code(world, s).curfew) r *= 0.85;
      if (w.nightPatrol) r *= 0.82;
      return r;
    },
    commitCrimes(world, rng, s) {
      const w = W.st(world, s);
      let n = 0;
      const rate = W.crimeRate(world, s);
      while (rng.chance(Math.min(0.9, rate)) && n < 3) { n++; W.commitOne(world, rng, s); if (rate < 1) break; }
    },
    commitOne(world, rng, s, forceKind) {
      const w = W.st(world, s);
      const kinds = Object.keys(CRIMES).filter(k => k !== 'smuggling' || w.ring);
      const kind = forceKind || W.pickKind(rng, kinds, s);
      const culprit = W.pickCulprit(world, rng, s, kind, w.ring);
      if (!culprit) return null;
      const residents = P().residents(world, s).filter(x => x !== culprit && x.prof !== 'child');
      let victim = null, value = 0;
      if (kind === 'theft' || kind === 'burglary') {
        const rich = residents.filter(x => x.wealth > 25 && x.id !== culprit.spouse);
        victim = rich.length ? rng.pick(rich.sort((a, b) => b.wealth - a.wealth).slice(0, 6)) : null;
        if (!victim) return null;
        value = Math.round(Math.min(victim.wealth * (kind === 'burglary' ? 0.35 : 0.18), kind === 'burglary' ? 40 : 14));
        victim.wealth -= value; culprit.wealth += value * (w.ring && w.ring.members.includes(culprit.id) ? 0.6 : 1);
        if (w.ring && w.ring.members.includes(culprit.id)) w.ring.purse = (w.ring.purse || 0) + value * 0.4;
        culprit.starve = Math.max(0, (culprit.starve || 0) - 2);
      } else if (kind === 'assault') {
        const foes = residents.filter(x => (culprit.rel[x.id] || 0) < -10);
        victim = foes.length ? rng.pick(foes) : rng.pick(residents);
        if (!victim) return null;
        P().bond(victim, culprit.id, -35); P().bond(culprit, victim.id, -10);
        P().remember(world, victim, `was beaten by ${culprit.first} ${culprit.last}`, 'trauma', null, 2);
      } else if (kind === 'murder') {
        const foes = residents.filter(x => (culprit.rel[x.id] || 0) < -40 && x.prof !== 'ruler');
        if (!foes.length && !(w.ring && w.ring.members.includes(culprit.id))) return W.commitOne(world, rng, s, 'assault');
        victim = foes.length ? rng.pick(foes) : rng.pick(residents.filter(x => x.prof !== 'ruler'));
        if (!victim) return null;
        P().kill(world, victim, `murdered in ${s.name}`);
      } else if (kind === 'arson') {
        s.prosperity = Math.max(0, (s.prosperity || 40) - 4);
        s.stock.timber = Math.max(0, (s.stock.timber || 0) - 10);
        const owners = residents.filter(x => x.wealth > 15);
        victim = owners.length ? rng.pick(owners) : null;
        if (victim) { value = Math.round(Math.min(40, victim.wealth * 0.3)); victim.wealth -= value; P().remember(world, victim, 'lost a storehouse to fire', 'trauma', null, 3); }
      } else if (kind === 'smuggling') {
        value = 15 + rng.int(0, 25);
        culprit.wealth += value * 0.5; if (w.ring) w.ring.purse = (w.ring.purse || 0) + value * 0.5;
      }
      // who saw it
      const seeing = kind === 'smuggling' ? 0.05 : CRIMES[kind].night ? 0.22 : 0.45;
      const witnesses = residents.filter(x => x !== victim && x.prof !== 'child' && rng.chance(seeing * 2.2 / Math.max(6, residents.length))).slice(0, 3).map(x => x.id);
      if (kind === 'assault' && victim) witnesses.push(victim.id);
      // caught in the act
      const cov = W.coverage(world, s);
      const inAct = rng.chance(Math.min(0.55, cov * (CRIMES[kind].night ? (w.nightPatrol ? 0.32 : 0.18) : 0.3)) * (1 - w.corrupt * 0.6));
      const c = W.openCase(world, { kind, sid: s.id, by: culprit.id, victim: victim ? victim.id : null, value, witnesses, night: CRIMES[kind].night, priority: victim && (victim.renown > 20 || victim.prof === 'merchant') ? 1 : 0 });
      W.st(world, s).today = (W.st(world, s).today || 0) + 1;
      if (inAct && c) { c.inAct = true; W.solve(world, c, rng, 'inAct'); return c; }
      if (c && (kind === 'murder' || kind === 'arson' || (kind === 'burglary' && value > 25)))
        ECHO.Chronicle.add(world, { text: kind === 'murder' ? `${c.victimName} was found murdered in ${s.name}. The watch is asking questions.` : kind === 'arson' ? `A storehouse burned in ${s.name} in the night. The watch says it was set.` : `Thieves broke into the house of ${c.victimName} in ${s.name} and took ${value} crowns.`, kind: 'crime', importance: kind === 'murder' ? 1 : 0, sid: s.id });
      return c;
    },
    pickKind(rng, kinds, s) {
      const ws = kinds.map(k => CRIMES[k].w * (k === 'arson' ? (s.unrest > 50 ? 2.5 : 0.4) : 1));
      let r = rng.next() * U.sum(ws);
      for (let i = 0; i < kinds.length; i++) { r -= ws[i]; if (r <= 0) return kinds[i]; }
      return 'theft';
    },

    // ------------------------------------------------------------ crime rings
    rings(world, rng, s) {
      const w = W.st(world, s);
      const pop = P().residents(world, s).length;
      if (!w.ring) {
        if (pop < 20 || w.safety > 85 || world.day - (w.ringGone || -999) < 90 || !rng.chance(0.004 + (85 - w.safety) * 0.0002)) return;
        const used = new Set(world.settlements.map(t => t.watch && t.watch.ring && t.watch.ring.name).filter(Boolean));
        const boss = W.pickCulprit(world, rng, s, 'smuggling', null);
        if (!boss || boss.prof === 'guard') return;
        const name = rng.pick(RING_NAMES.filter(n => !used.has(n))) || 'the Hidden Hand';
        const members = P().residents(world, s).filter(n => n !== boss && n.prof !== 'child' && n.prof !== 'guard' && n.prof !== 'ruler' && (n.wealth < 8 || P().has(n, 'greedy') || P().has(n, 'deceitful')) && !P().has(n, 'honest')).sort(() => rng.next() - 0.5).slice(0, rng.int(2, 4));
        w.ring = { name, boss: boss.id, members: [boss.id, ...members.map(m => m.id)], strength: 0.2, d: world.day, purse: 0 };
        for (const m of [boss, ...members]) m.ring = s.id;
        ECHO.Chronicle.add(world, { text: `Something new is moving in the back streets of ${s.name}. People speak of ${name}.`, kind: 'crime', importance: 1, sid: s.id });
        return;
      }
      const ring = w.ring;
      ring.members = ring.members.filter(id => world.npcs[id] && world.npcs[id].status === 'alive' && (world.npcs[id].loc === s.id || world.npcs[id].home === s.id));
      const boss = world.npcs[ring.boss];
      if (!boss || boss.status !== 'alive' || !ring.members.includes(boss.id)) {
        if (ring.members.length >= 2) { ring.boss = ring.members[0]; ring.strength *= 0.7; }
        else return W.ringEnds(world, s, 'with no one left to lead it');
      }
      const cov = W.coverage(world, s);
      ring.strength = U.clamp(ring.strength + 0.006 * (1.1 - Math.min(1.1, cov)) + (ring.members.length < 5 && rng.chance(0.02) ? 0.03 : 0), 0, 1);
      // the ring recruits the desperate and buys the watch
      if (ring.members.length < 7 && rng.chance(0.02 + ring.strength * 0.03)) {
        const r = P().residents(world, s).find(n => !ring.members.includes(n.id) && n.prof !== 'child' && n.prof !== 'ruler' && (n.starve > 2 || n.wealth < 3) && !P().has(n, 'honest'));
        if (r) { ring.members.push(r.id); r.ring = s.id; }
      }
      w.corrupt = U.clamp(w.corrupt + ring.strength * 0.002, 0, 1);
      if (ring.strength > 0.45 && !ring.posted) {
        ring.posted = true;
        const cap = W.captain(world, s);
        const informant = P().residents(world, s).find(n => !ring.members.includes(n.id) && n.prof !== 'child' && n.prof !== 'guard' && (P().has(n, 'curious') || P().has(n, 'deceitful') || n.prof === 'innkeeper'));
        if (informant) ECHO.Plights.post(world, { kind: 'ring', sid: s.id, requester: cap ? cap.id : s.ruler, ring: ring.name, informant: informant.id, deadline: world.day + 30, reward: 120 + Math.round(ring.strength * 100),
          text: `${ring.name} have the back streets of ${s.name} in their grip, and someone in the watch is taking their coin. ${cap ? P().fullTitle(world, cap) : 'The watch'} needs to know who leads them. ${informant.first} ${informant.last}${informant.prof === 'innkeeper' ? ', who keeps the inn,' : ''} hears a great deal.` });
      }
    },
    ringLoss(world, s, n, rng) {
      const w = W.st(world, s);
      if (!w.ring) return;
      w.ring.members = w.ring.members.filter(id => id !== n.id);
      w.ring.strength = Math.max(0, w.ring.strength - 0.12);
      delete n.ring;
      // a caught member may talk
      if (w.ring.boss !== n.id && rng.chance(0.3)) w.ring.exposedBoss = true;
      if (w.ring.boss === n.id || w.ring.members.length < 2) W.ringEnds(world, s, w.ring.boss === n.id ? 'when its master was taken' : 'its people gone');
    },
    ringEnds(world, s, why, byPlayer) {
      const w = W.st(world, s);
      if (!w.ring) return;
      ECHO.Chronicle.add(world, { text: `${U.cap(w.ring.name)} of ${s.name} are finished, ${why}.`, kind: 'crime', importance: 1, sid: s.id });
      for (const id of w.ring.members) if (world.npcs[id]) delete world.npcs[id].ring;
      w.ring = null; w.ringGone = world.day; w.corrupt = Math.max(0.03, w.corrupt - 0.12); w.trust = Math.min(100, w.trust + 6);
      for (const p of world.plights) if (p.kind === 'ring' && p.sid === s.id && p.status === 'open') { if (byPlayer) p.claimable = true; else ECHO.Plights.close(world, p, 'resolved', null); }
    },
    // The player (or the watch) moves against the ring: everyone known is taken.
    raidRing(world, s, rng, by) {
      const w = W.st(world, s);
      if (!w.ring) return 0;
      const caught = w.ring.members.map(id => world.npcs[id]).filter(n => n && n.status === 'alive');
      for (const n of caught) L().npcCrime(world, rng, { by: n.id, kind: n.id === w.ring.boss ? 'smuggling' : 'theft', sid: s.id, amt: 20, caught: true });
      const name = w.ring.name;
      W.ringEnds(world, s, by ? `after ${by} named their master to the watch` : 'in a raid by the watch', !!by);
      void name;
      return caught.length;
    },

    // ------------------------------------------------------------ the government answers
    respond(world, rng, s) {
      const w = W.st(world, s);
      const f = world.factions[s.faction];
      if (!f || f.type === 'bandits') return;
      const cap = W.captain(world, s);
      const guards = W.guardsOf(world, s).length, need = W.need(world, s);
      const ruler = s.ruler && world.npcs[s.ruler];
      const R = ECHO.Realm;
      // 1. hire watchmen when short
      if (guards < need && f.treasury > 120 && rng.chance(0.25)) {
        const recruit = P().residents(world, s).filter(n => n.prof !== 'guard' && n.prof !== 'child' && n.prof !== 'ruler' && n.prof !== 'reeve' && n.prof !== 'priest' && !n.ring && P().age(world, n) > 17 && P().age(world, n) < 45 && (n.prof !== 'farmer' || !ECHO.Minds || ECHO.Minds.spareFarmer(world, s)))
          .sort((a, b) => (P().has(b, 'brave') + P().has(b, 'loyal') + P().has(b, 'honest')) - (P().has(a, 'brave') + P().has(a, 'loyal') + P().has(a, 'honest')) || b.skill.fight - a.skill.fight)[0];
        if (recruit) {
          recruit.prof = 'guard'; recruit.skill.fight = Math.max(recruit.skill.fight, 20); f.treasury -= 25;
          P().remember(world, recruit, `joined the watch of ${s.name}`, 'change', null, 2);
          if (w.safety < 60) ECHO.Chronicle.add(world, { text: `${ruler ? P().fullTitle(world, ruler) : 'The reeve'} took on ${P().name(recruit)} for the watch of ${s.name}, to make the streets safe again.`, kind: 'politics', importance: 0, sid: s.id, npcs: [recruit.id] });
        }
      }
      // 2. pay — or fail to
      if (f.treasury < 40) { w.morale = Math.max(0, w.morale - 2.5); w.unpaid = (w.unpaid || 0) + 1; }
      else { w.morale = U.clamp(w.morale + (70 - w.morale) * 0.05, 0, 100); w.unpaid = 0; }
      if (w.unpaid === 10) ECHO.Chronicle.add(world, { text: `The watch of ${s.name} has not been paid in ten days. Some watchmen have stopped walking their rounds.`, kind: 'politics', importance: 1, sid: s.id });
      // corruption: low pay and greedy captains breed it; honest ones root it out
      w.corrupt = U.clamp(w.corrupt + (w.morale < 40 ? 0.004 : 0) + (cap && P().has(cap, 'greedy') && w.corrupt < 0.5 ? 0.0015 : 0) - (cap && P().has(cap, 'honest') ? 0.004 : 0) - 0.0005, 0, 1);
      // 3. every week the ruler looks at the town's safety
      if ((world.day + ECHO.hashStr(s.id)) % 7 !== 0) return;
      w.nightPatrol = w.safety < 55 || (R && !!R.edict(world, s.faction, 'nightwatch')) || (cap && P().has(cap, 'brave') && w.safety < 70);
      if (w.safety < 45 && R) {
        const st = R.st(f);
        if (!R.edict(world, f.id, 'nightwatch') && f.treasury > 200 && rng.chance(0.5)) { R.decree(world, f, 'nightwatch'); f.treasury -= 60; }
        else if (!L().code(world, s).curfew && rng.chance(0.4)) R.decree(world, f, 'curfew');
        else void st; // a watchtower is commissioned through the realm's works when the town is this frightened
      }
      // a captain who loses the town's trust loses the post
      if (cap && w.trust < 28 && world.day - (w.captainSince || 0) > 40 && rng.chance(0.5)) W.sackCaptain(world, s, 'after the town lost faith in the watch');
      w.weekly = { d: world.day, safety: Math.round(w.safety), trust: Math.round(w.trust) };
    },
    sackCaptain(world, s, why) {
      const w = W.st(world, s);
      const cap = W.captain(world, s);
      if (!cap) return;
      const ruler = s.ruler && world.npcs[s.ruler];
      const next = W.guardsOf(world, s).filter(n => n !== cap).sort((a, b) => (P().has(b, 'honest') - P().has(a, 'honest')) || b.renown - a.renown)[0];
      cap.rank = Math.max(0, cap.rank - 1);
      P().remember(world, cap, `was stripped of the captaincy of ${s.name}'s watch`, 'trauma', null, 3);
      w.captain = next ? next.id : null; w.captainSince = world.day;
      w.corrupt = Math.max(0.02, w.corrupt * 0.6); w.trust = Math.min(100, w.trust + 8);
      ECHO.Chronicle.add(world, { text: `${ruler ? P().fullTitle(world, ruler) : 'The crown'} dismissed ${P().name(cap)} as captain of the watch in ${s.name} ${why}.${next ? ' ' + P().name(next) + ' takes the post.' : ''}`, kind: 'politics', importance: 1, sid: s.id, npcs: [cap.id] });
    },

    // ------------------------------------------------------------ safety and trust
    measure(world, s) {
      const w = W.st(world, s);
      w.log = w.log.filter(e => world.day - e.d < 30);
      const pop = Math.max(16, P().residents(world, s).length);
      const weight = { theft: 1, burglary: 1.6, assault: 2, murder: 7, arson: 5, smuggling: 0.6 };
      const score = U.sum(w.log.map(e => weight[e.k] || 1)) / pop * 10;
      const target = U.clamp(92 - score * 18 - (w.ring ? w.ring.strength * 25 : 0) + Math.min(10, W.coverage(world, s) * 8), 0, 100);
      w.safety = U.clamp(w.safety + (target - w.safety) * 0.15, 0, 100);
      w.trust = U.clamp(w.trust + (60 - w.trust) * 0.01 - w.corrupt * 0.3, 0, 100);
      // fear and anger
      if (w.safety < 40) s.unrest = Math.min(100, s.unrest + 0.5);
      if (w.trust < 30) s.unrest = Math.min(100, s.unrest + 0.4);
      w.today = 0;
    },
    // A word for the town's mood about crime (for minds and the board).
    describe(world, s) {
      const w = W.st(world, s);
      const cap = W.captain(world, s);
      const g = W.guardsOf(world, s).length, need = W.need(world, s);
      const open = W.cases(world).filter(c => c.sid === s.id && c.status === 'open');
      const recent = w.log.length;
      const lines = [];
      lines.push(`${cap ? P().fullTitle(world, cap) + ' captains' : 'No one captains'} a watch of ${g}${g < need ? ` (the town needs ${need})` : ''}.${w.nightPatrol ? ' They walk the streets at night as well as by day.' : ''}`);
      lines.push(`${recent ? `${recent} crime${recent > 1 ? 's' : ''} reported in the last month` : 'No crimes reported in the last month'}; ${open.length ? open.length + ' still being looked into' : 'none still open'}.`);
      lines.push(w.safety > 75 ? 'People leave their doors unbarred.' : w.safety > 55 ? 'People bar their doors at night.' : w.safety > 35 ? 'People are frightened to walk the streets after dark.' : 'No one feels safe here, day or night.');
      lines.push(w.trust > 70 ? 'The town trusts its watch.' : w.trust > 45 ? 'The town tolerates its watch.' : w.trust > 25 ? 'The town has little faith in its watch.' : 'The town despises its watch.');
      if (w.corrupt > 0.4) lines.push('Coin buys a watchman\'s blindness here, it is said.');
      if (w.unpaid > 5) lines.push('The watch has not been paid.');
      if (w.ring) lines.push(`${U.cap(w.ring.name)} are spoken of in whispers.`);
      return lines;
    },
    // Minds: crime as a threat they feel.
    threat(world, s) {
      if (!s || !s.watch) return null;
      const w = s.watch;
      const v = (100 - w.safety) / 260;
      return v > 0.03 ? { w: Math.min(0.3, v), name: w.ring ? w.ring.name : 'thieves in the night', kind: 'crime' } : null;
    },

    // ------------------------------------------------------------ the player in it
    notify(world, text) { const pl = world.player; if (!pl) return; (pl.watchNews = pl.watchNews || []).push(text); if (pl.watchNews.length > 6) pl.watchNews.shift(); },
    // An unwitnessed crime by the player, found later.
    playerCase(world, o) {
      return W.openCase(world, { ...o, by: 'player', priority: o.kind === 'murder' ? 1 : 0 });
    },
    // How much of the case points at the player.
    suspicion(world, c) {
      if (c.by !== 'player' || c.status !== 'open') return 0;
      return U.clamp(c.progress, 0, 1);
    },
    // Crimes seen but not yet carried to the watch.
    reportPending(world, rng) {
      const pl = world.player;
      if (!pl) return;
      for (const c of L().crimes(world)) {
        if (c.by !== 'player' || c.reported !== false || c.status !== 'open') continue;
        const s = S().settlement(world, c.sid);
        const w = s ? W.st(world, s) : { trust: 50 };
        const alive = c.witnesses.map(id => world.npcs[id]).filter(n => n && n.status === 'alive' && !n.silenced);
        if (!alive.length) { c.status = 'dropped'; continue; }
        const afraid = alive.every(n => (n.op[pl.charId] || 0) < -40 && (pl.renown > 30) && !P().has(n, 'brave'));
        const p = (0.55 + w.trust / 200) * (afraid ? 0.35 : 1);
        if (rng.chance(p)) {
          c.reported = true;
          pl.wanted = pl.wanted || {};
          pl.wanted[c.faction] = Math.min(200, (pl.wanted[c.faction] || 0) + (c.heat || 35));
          if (s) W.notify(world, `${alive[0].first} ${alive[0].last} went to the watch of ${s.name} about what you did.`);
        }
      }
    },
    // ------------------------------------------------------------ the player as investigator
    // Three people who fit some of what is known — one of them did it.
    suspects(world, c) {
      if (c.suspects) return c.suspects.map(id => world.npcs[id]).filter(Boolean);
      const s = S().settlement(world, c.sid);
      const culprit = world.npcs[c.by];
      if (!s || !culprit) return [];
      const pool = P().residents(world, s).filter(n => n !== culprit && n.id !== c.victim && n.prof !== 'child' && n.prof !== 'ruler' && P().age(world, n) > 14);
      const rng = new ECHO.RNG(ECHO.hashStr(c.id + world.seed));
      const share = n => (n.sex === culprit.sex) + (W.hairOf(n) === W.hairOf(culprit)) + (n.prof === culprit.prof);
      // decoys share one or two things with the culprit, never all three
      const decoys = pool.filter(n => share(n) >= 1 && share(n) < 3).sort(() => rng.next() - 0.5).slice(0, 2);
      while (decoys.length < 2 && pool.length > decoys.length) { const n = pool[rng.int(0, pool.length - 1)]; if (!decoys.includes(n)) decoys.push(n); }
      const all = [culprit, ...decoys].sort(() => rng.next() - 0.5);
      c.suspects = all.map(n => n.id);
      return all;
    },
    // What the scene tells a careful eye.
    examineScene(world, c) {
      if (c.found.scene) return c.found.scene;
      const culprit = world.npcs[c.by];
      const t = culprit ? `Left behind: ${W.traceOf(culprit)}.` : 'Nothing that points anywhere.';
      c.found.scene = t; c.playerProgress = (c.playerProgress || 0) + 0.4;
      return t;
    },
    // What a witness saw.
    witnessAccount(world, c, n) {
      const culprit = world.npcs[c.by];
      if (!culprit) return 'I didn\'t see anything.';
      if (!c.questioned.includes(n.id)) { c.questioned.push(n.id); c.playerProgress = (c.playerProgress || 0) + 0.3; }
      const sexW = culprit.sex === 'f' ? 'a woman' : 'a man';
      const hair = W.hairOf(culprit);
      const k = ECHO.hashStr(n.id + c.id) % 3;
      const line = k === 0 ? `It was dark, but I'm sure it was ${sexW}.` : k === 1 ? `I saw hair — ${hair} hair — under the hood.` : `${U.cap(sexW)} with ${hair} hair, walking fast. That's all I saw.`;
      c.found['w' + n.id] = line;
      if (k === 0) c.found.sex = sexW; else if (k === 1) c.found.hair = hair; else { c.found.sex = sexW; c.found.hair = hair; }
      return line;
    },
    // The player names a culprit. Right or wrong, it has consequences.
    accuse(world, c, npcId, rng) {
      const s = S().settlement(world, c.sid);
      const pl = world.player;
      const n = world.npcs[npcId];
      if (!s || !n || c.status !== 'open') return null;
      const w = W.st(world, s);
      if (npcId === c.by) {
        W.solve(world, c, rng, 'player');
        pl.renown += c.kind === 'murder' ? 8 : 3;
        w.trust = Math.min(100, w.trust + 3);
        if (c.victim && world.npcs[c.victim]) { const v = world.npcs[c.victim]; v.op[pl.charId] = (v.op[pl.charId] || 0) + 30; }
        for (const k of c.victim && world.npcs[c.victim] ? [world.npcs[c.victim].spouse, ...world.npcs[c.victim].kids] : []) { const kin = k && world.npcs[k]; if (kin && kin.status === 'alive') kin.op[pl.charId] = (kin.op[pl.charId] || 0) + 25; }
        ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} found out who was behind the ${KIND_WORD[c.kind]}${c.victimName ? ' of ' + c.victimName : ''} in ${s.name}: ${P().name(n)}.`, importance: c.kind === 'murder' ? 2 : 1, sid: s.id, rep: c.kind === 'murder' ? 6 : 3, tag: 'protect' });
        return true;
      }
      // the wrong one
      c.status = 'wrong'; c.scapegoat = n.id; c.scapegoatName = P().name(n); c.accusedByPlayer = true;
      L().npcCrime(world, rng, { by: n.id, kind: W.lawKind(c.kind), victim: c.victim, sid: s.id, amt: c.value, caught: true, innocent: true });
      P().remember(world, n, `was accused by ${pl.first} ${pl.last} of a crime they did not do`, 'trauma', null, 5);
      n.op[pl.charId] = -80;
      for (const k of [n.spouse, ...n.kids].map(id => id && world.npcs[id]).filter(k => k && k.status === 'alive')) k.op[pl.charId] = Math.min(k.op[pl.charId] || 0, -50);
      if (n.status === 'dead') c.scapegoatDead = true;
      return false;
    },

    // ------------------------------------------------------------ deputies
    deputize(world, pl, s) {
      pl.deputy = { sid: s.id, faction: s.faction, since: world.day, duty: null, done: 0, pay: 6 };
      pl.stats = pl.stats || {}; pl.stats.sworn = (pl.stats.sworn || 0) + 1;
      ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} was sworn in as a deputy of the watch of ${s.name}.`, importance: 1, sid: s.id, rep: 2 });
    },
    dismiss(world, pl, why) {
      if (!pl.deputy) return;
      const s = S().settlement(world, pl.deputy.sid);
      ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} was thrown out of the watch of ${s ? s.name : 'the town'} ${why}.`, importance: 1, sid: s ? s.id : null, rep: -3 });
      W.notify(world, `You have been dismissed from the watch of ${s ? s.name : 'the town'} ${why}.`);
      pl.deputy = null;
    },

    // ------------------------------------------------------------ daily
    dailyTick(world, rng) {
      for (const s of world.settlements) {
        const f = world.factions[s.faction];
        if (!f || f.type === 'bandits' || s.faction === 'ashfang') continue;
        W.st(world, s);
        W.captain(world, s);
        W.commitCrimes(world, rng, s);
        W.rings(world, rng, s);
        W.respond(world, rng, s);
        W.measure(world, s);
      }
      for (const c of W.cases(world)) if (c.status === 'open') W.investigate(world, c, rng);
      W.reportPending(world, rng);
      // the player's deputyship
      const pl = world.player;
      if (pl && pl.deputy) {
        if ((pl.wanted && pl.wanted[pl.deputy.faction] > 20)) W.dismiss(world, pl, 'for crimes of their own');
        else if (pl.deputy.duty && pl.deputy.duty.d < world.day - 1) { pl.deputy.duty = null; }
      }
      // trim
      if (W.cases(world).length > 160) world.cases = W.cases(world).filter(c => c.status === 'open' || world.day - c.d < 60 || c.by === 'player');
    }
  };
})();
