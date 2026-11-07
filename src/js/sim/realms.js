// The powers of the world, and how they deal with each other.
//
// There are more realms than the two old kingdoms now:
//   • At home, a province far from its crown can break away and become a duchy or a
//     principality of its own (an old world does this once, the first time it is loaded,
//     where its kingdoms have a far town to lose), and later, unruly provinces may follow.
//   • Out in the far lands, the villages are not the old crowns' at all: they belong to
//     realms of their own — kingdoms, duchies, khanates, free cities, clan confederacies —
//     each with its own people and names, its ruler, its seat, its garrisons and its
//     Marshal. The further out, the harder the people (danger.js).
//   • A realm that grows great enough is proclaimed an empire.
//
// And they deal with each other as real powers do (every day, between every pair of
// neighbours):
//   • Relations drift with what lies between them: a shared border (friction), the same
//     people (kinship), trade and royal marriages, a common enemy, grievances over lost
//     towns, hunger, and the temper of their rulers; border incidents sour them.
//   • Alliances: friends swear to defend each other — and are called to arms when one is
//     attacked (an ally who will not come breaks faith, and is not forgotten).
//   • Truces: wary neighbours swear not to fight for a season.
//   • Vassals: a small realm threatened by a great one seeks the protection of another,
//     pays it tribute and marches in its wars — and may throw it off when it weakens.
//   • Claims and ultimatums: a strong realm demands the town it lost (or covets) from a weak
//     neighbour; it is ceded, or it is war.
//   • Coalitions: when one realm grows too strong, the others draw together against it.
//   • Wars have aims and a reckoning: battles won, towns taken and the dead are counted, and
//     peace comes when a side is worn out — with tribute for the winner, or a town ceded.
// The Journal's Realm page sets all of it out: every realm, its ruler and towns and armies,
// who is allied, sworn, at war or bound to whom, the war scores, and how each stands with you.
(function () {
  const { U } = ECHO;
  const P = () => ECHO.People;
  const S = () => ECHO.Sim;
  const Dg = () => ECHO.Danger;

  const STYLES = {
    kingdom: { name: n => `Kingdom of ${n}`, m: 'King', f: 'Queen', word: 'kingdom' },
    duchy: { name: n => `Duchy of ${n}`, m: 'Duke', f: 'Duchess', word: 'duchy' },
    principality: { name: n => `Principality of ${n}`, m: 'Prince', f: 'Princess', word: 'principality' },
    khanate: { name: n => `${n} Khanate`, m: 'Khan', f: 'Khatun', word: 'khanate' },
    freecity: { name: n => `Free City of ${n}`, m: 'Doge', f: 'Doge', word: 'free city' },
    clans: { name: n => `the ${n} Clans`, m: 'High Chief', f: 'High Chief', word: 'clan confederacy' },
    empire: { name: n => `Empire of ${n}`, m: 'Emperor', f: 'Empress', word: 'empire' }
  };
  const PALETTE = [['#c46f6f', '#5a2424'], ['#c4a46f', '#5a4424'], ['#8f6fc4', '#3a245a'], ['#6fc4c0', '#245a57'], ['#c46fa8', '#5a2448'], ['#a8c46f', '#445a24'], ['#6f7fc4', '#24305a'], ['#c4886f', '#5a3424'], ['#6fc48a', '#245a34'], ['#c4c46f', '#5a5a24'], ['#9fb0c0', '#3a4450'], ['#d08a50', '#5a3412']];
  const FAR = 230;          // past this from the old capitals, the land is not the old crowns'
  const JOIN = 260;         // a far village within this of a far realm's seat is that realm's
  const NEAR = 260;         // realms with towns this close are neighbours (they may fight)

  const Rs = ECHO.Realms = {
    STYLES, FAR, JOIN, NEAR, V: 1,
    st(world) {
      const s = world.realms || (world.realms = { v: Rs.V, n: 0, wars: {}, claims: {}, ties: {}, log: [] });
      s.wars = s.wars || {}; s.claims = s.claims || {}; s.ties = s.ties || {}; s.log = s.log || [];
      return s;
    },
    key(a, b) { const x = a.id || a, y = b.id || b; return x < y ? x + '|' + y : y + '|' + x; },
    tie(world, a, b) { const S0 = Rs.st(world); const k = Rs.key(a, b); return S0.ties[k] || (S0.ties[k] = {}); },
    powers(world) { return Object.values(world.factions).filter(f => f.type === 'kingdom' && !f.fallen); },
    towns(world, f) { return world.settlements.filter(s => s.faction === f.id); },
    style(f) { return STYLES[f.style] || STYLES.kingdom; },
    styleWord(f) { return f.style ? Rs.style(f).word : f.type === 'order' ? 'holy order' : 'kingdom'; },
    rulerTitle(f, n) { if (f.type === 'order') return 'High Wick'; const St = Rs.style(f); return n && n.sex === 'f' ? St.f : St.m; },
    dist(world, ax, ay, bx, by) { return Dg() ? Dg().dist(world, ax, ay, bx, by) : U.dist(ax, ay, bx, by); },
    // the old crowns' seats: where the world began
    heart(world) { return Object.values(world.factions).filter(f => (f.type === 'kingdom' || f.type === 'order') && !f.farRealm && !f.seceded).map(f => S().settlement(world, f.capital)).filter(Boolean); },
    // the nearest two of their towns
    gap(world, a, b) {
      const ta = Rs.towns(world, a), tb = Rs.towns(world, b);
      let best = 1e9;
      for (const x of ta) for (const y of tb) { const d = Rs.dist(world, x.x, x.y, y.x, y.y); if (d < best) best = d; }
      return best;
    },
    neighbours(world, a, b) { return Rs.gap(world, a, b) < NEAR; },
    // how strong a realm is in a war: its towns' strength, all told
    might(world, f) { let m = 0; for (const s of Rs.towns(world, f)) m += ECHO.Politics.settlementStrength(world, s); return m; },
    standing(world, f, pl) {
      if (!pl) return 0;
      const ts = Rs.towns(world, f);
      if (!ts.length) return 0;
      return Math.round(ts.reduce((a, s) => a + ((s.rep && s.rep[pl.charId]) || 0), 0) / ts.length);
    },
    note(world, text, imp) {
      const S0 = Rs.st(world);
      S0.log.push({ d: world.day, text });
      if (S0.log.length > 40) S0.log.splice(0, S0.log.length - 40);
      if (ECHO.Chronicle) ECHO.Chronicle.add(world, { text, kind: 'politics', importance: imp == null ? 2 : imp });
    },
    rel(a, b) { return (a.relations && a.relations[b.id]) || 0; },
    // "the Duchy of Wickvale", "the Ashmere Dominion" — for the middle of a sentence
    the(f) { return /^the /i.test(f.name) ? f.name : 'the ' + f.name; },
    setRel(a, b, v) { a.relations[b.id] = b.relations[a.id] = U.clamp(v, -100, 100); },

    // ------------------------------------------------------------ founding a realm
    found(world, towns, o) {
      if (!towns.length) return null;
      const S0 = Rs.st(world), rng = o.rng || new ECHO.RNG(ECHO.hashStr('realm:' + world.seed + ':' + S0.n));
      const seat = o.seat || towns.slice().sort((a, b) => b.residents.length - a.residents.length)[0];
      const id = 'rlm' + (++S0.n);
      const culture = o.culture || 'valdren';
      const style = o.style || 'kingdom';
      const land = o.land || (style === 'duchy' || style === 'freecity' || style === 'principality' ? seat.name : Rs.landName(rng, culture));
      const used = new Set(Object.values(world.factions).map(f => f.color));
      const pal = PALETTE.find(p => !used.has(p[0])) || PALETTE[S0.n % PALETTE.length];
      const from = o.from && world.factions[o.from];
      const tech = from && from.tech ? { era: from.tech.era, points: 0, arcane: 0, mech: 0, path: null, inventions: (from.tech.inventions || []).slice(), donated: 0 } : { era: Math.min(3, Math.floor((world.day || 0) / 200)), points: 0, arcane: 0, mech: 0, path: null, inventions: [], donated: 0 };
      const f = {
        id, name: STYLES[style].name(land), short: land, type: 'kingdom', style, culture, color: pal[0], banner: pal[1],
        treasury: 150 + 90 * towns.length, relations: {}, ruler: null, capital: seat.id, tech, doctrines: {}, atWar: {}, taxRate: 0.08,
        raidLog: [], warDays: 0, casualties: 0, founded: world.day, farRealm: !!o.far, seceded: o.from || null
      };
      world.factions[id] = f;
      for (const g of Object.values(world.factions)) {
        if (g === f) continue;
        g.relations = g.relations || {};
        const v = g.type === 'bandits' ? -80 : g.type === 'wild' ? -100 : g.id === o.from ? -40 : g.type === 'order' ? 20 : g.culture === culture ? rng.range(5, 20) : rng.range(-15, 10);
        f.relations[g.id] = g.relations[id] = Math.round(v);
      }
      for (const s of towns) {
        if (o.from) S0.claims[s.id] = s.faction;
        const old = s.faction;
        s.faction = id;
        for (const n of P().residents(world, s)) if (n.faction === old || !n.faction) n.faction = id;
      }
      // its ruler: the seat's own lord or reeve, or its first citizen
      const res = P().residents(world, seat).filter(n => n.status === 'alive' && P().age(world, n) >= 20 && n.prof !== 'child');
      const r = (seat.ruler && world.npcs[seat.ruler] && world.npcs[seat.ruler].status === 'alive' ? world.npcs[seat.ruler] : null) || res.sort((a, b) => (b.renown + b.wealth * 0.05) - (a.renown + a.wealth * 0.05))[0];
      if (r) ECHO.Politics.crown(world, f, r, o.why || `founded ${f.name}`);
      if (ECHO.Realm) ECHO.Realm.st(f);
      world._dgH = null; world._dgR = null; world._routes = {};
      return f;
    },
    landName(rng, culture) {
      const c = ECHO.CULTURES[culture] || ECHO.CULTURES.valdren;
      let n = rng.pick(c.on) + rng.pick(c.nu) + rng.pick(c.co) + rng.pick(['ia', 'or', 'en', 'ar', 'um', 'eth', 'ad']);
      n = n.replace(/(.)\1\1/g, '$1$1');
      return U.cap(n.slice(0, 9));
    },
    // which people live out that way (by the side of the old island it lies)
    cultureAt(world, x, y) {
      const H = Rs.heart(world);
      const cx = H.length ? H.reduce((a, s) => a + s.x, 0) / H.length : world.W / 2, cy = H.length ? H.reduce((a, s) => a + s.y, 0) / H.length : world.H / 2;
      const dx = ECHO.Globe && world.globe ? ECHO.Globe.dx(world, cx, x) : x - cx, dy = y - cy;
      return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'kesh' : 'auren') : (dy < 0 ? 'norren' : 'sarrad');
    },
    styleFor(culture, rng, nTowns) {
      const opts = { kesh: ['khanate', 'khanate', 'kingdom'], auren: ['kingdom', 'principality', 'freecity'], norren: ['clans', 'kingdom', 'clans'], sarrad: ['kingdom', 'freecity', 'principality'] }[culture] || ['kingdom', 'duchy'];
      const st = rng.pick(opts);
      return st === 'freecity' && nTowns > 2 ? 'kingdom' : st;
    },
    farFromHeart(world, s) {
      const H = Rs.heart(world);
      if (!H.length) return false;
      return Math.min(...H.map(h => Rs.dist(world, h.x, h.y, s.x, s.y))) > FAR;
    },
    // new villages out in the far lands (globe.js / frontier.js): theirs, not the old crowns'
    claimNew(world, towns) {
      if (!towns || !towns.length) return;
      const far = towns.filter(s => Rs.farFromHeart(world, s) && s.warden == null);
      if (!far.length) return;
      Rs.gather(world, far);
    },
    // gather far villages into realms: the nearest far realm's within reach, or a new one
    gather(world, far) {
      const S0 = Rs.st(world);
      const left = far.slice();
      while (left.length) {
        const s = left.shift();
        const realm = Rs.powers(world).filter(f => f.farRealm).map(f => ({ f, seat: S().settlement(world, f.capital) })).filter(o => o.seat && Rs.dist(world, o.seat.x, o.seat.y, s.x, s.y) < JOIN).sort((a, b) => Rs.dist(world, a.seat.x, a.seat.y, s.x, s.y) - Rs.dist(world, b.seat.x, b.seat.y, s.x, s.y))[0];
        if (realm) {
          const old = s.faction; s.faction = realm.f.id;
          for (const n of P().residents(world, s)) if (n.faction === old || !n.faction) n.faction = realm.f.id;
          continue;
        }
        // a new realm: this village and the far villages near it
        const group = [s, ...left.filter(t => Rs.dist(world, t.x, t.y, s.x, s.y) < JOIN * 0.8)];
        for (const t of group) { const i = left.indexOf(t); if (i >= 0) left.splice(i, 1); }
        const rng = new ECHO.RNG(ECHO.hashStr('far:' + world.seed + ':' + s.id));
        const culture = Rs.cultureAt(world, s.x, s.y), style = Rs.styleFor(culture, rng, group.length);
        const f = Rs.found(world, group, { rng, culture, style, far: true, why: `rules the far lands` });
        if (f) {
          const seat = S().settlement(world, f.capital), r = f.ruler && world.npcs[f.ruler];
          Rs.note(world, `Word came from the far lands of ${Rs.the(f)}: ${r ? P().fullTitle(world, r) : 'its ruler'} holds ${group.length > 4 ? `${group.length} towns` : group.map(t => t.name).join(', ')}${seat ? ` from ${seat.name}` : ''} — a ${Rs.styleWord(f)} of its own people, owing nothing to the old crowns.`, 2);
        }
      }
      void S0;
    },
    // ------------------------------------------------------------ once, for every world
    ensure(world) {
      const S0 = Rs.st(world);
      if (!world.settlements || !world.factions) return S0;
      if (!S0.home) {
        S0.home = world.day || 1;
        // a far province of each old kingdom breaks away (where there is one to lose)
        const rng = new ECHO.RNG(ECHO.hashStr('secede:' + world.seed));
        for (const k of Object.values(world.factions).filter(f => f.type === 'kingdom' && !f.fallen && !f.farRealm && !f.seceded)) {
          const cap = S().settlement(world, k.capital);
          if (!cap) continue;
          const mine = Rs.towns(world, k).filter(s => s !== cap && s.kind === 'village' && !Rs.farFromHeart(world, s) && s.warden == null && !(world.player && (world.player.wardenOf || []).includes(s.id)));
          if (mine.length < 2) continue;
          const s = mine.sort((a, b) => Rs.dist(world, b.x, b.y, cap.x, cap.y) - Rs.dist(world, a.x, a.y, cap.x, cap.y))[0];
          if (Rs.dist(world, s.x, s.y, cap.x, cap.y) < 40) continue;
          Rs.secede(world, s, k, rng, true);
        }
      }
      if (!S0.far) {
        S0.far = world.day || 1;
        const far = world.settlements.filter(s => s.kind === 'village' && s.warden == null && Rs.farFromHeart(world, s) && world.factions[s.faction] && !world.factions[s.faction].farRealm && world.factions[s.faction].type === 'kingdom');
        if (far.length) Rs.gather(world, far);
      }
      return S0;
    },
    // a province breaks away from its crown
    secede(world, s, k, rng, quiet) {
      const style = rng.pick(['duchy', 'duchy', 'principality', 'freecity']);
      const f = Rs.found(world, [s], { rng, style, culture: k.culture, from: k.id, why: `declared ${s.name} free of ${k.short}` });
      if (!f) return null;
      const r = f.ruler && world.npcs[f.ruler];
      Rs.note(world, `${s.name} has broken away from ${Rs.the(k)}: ${r ? P().fullTitle(world, r) : 'its new lord'} rules it now as ${Rs.the(f)}. ${k.short} has not forgotten it.`, 3);
      if (!quiet && rng.chance(0.5)) Rs.war(world, k, f, 'reconquest', s.id);
      return f;
    },

    // ------------------------------------------------------------ every day
    dailyTick(world, rng) {
      Rs.ensure(world);
      const ps = Rs.powers(world);
      for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) Rs.pair(world, ps[i], ps[j], rng);
      for (const f of ps) { Rs.vassalage(world, f, rng); Rs.empire(world, f); }
      Rs.coalitions(world, rng);
      Rs.unrest(world, rng);
      Rs.peace(world, rng);
    },
    // between two powers, a day
    pair(world, a, b, rng) {
      const near = Rs.neighbours(world, a, b);
      const t = Rs.tie(world, a, b), war = !!a.atWar[b.id];
      let rel = Rs.rel(a, b);
      // what pulls them together or apart
      let aim = near ? -10 : 5;
      if (a.culture === b.culture) aim += 12;
      if (t.alliance) aim += 30;
      if (t.truce && t.truce > world.day) aim += 8;
      if (a.overlord === b.id || b.overlord === a.id) aim += 25;
      const pact = ECHO.Realm && ECHO.Realm.st(a).pacts[b.id];
      if (pact) aim += pact.kind === 'marriage' ? 20 : 10;
      const C = Rs.st(world).claims;
      for (const s of Rs.towns(world, a)) if (C[s.id] === b.id) aim -= 35;
      for (const s of Rs.towns(world, b)) if (C[s.id] === a.id) aim -= 35;
      for (const e of Object.keys(a.atWar)) if (b.atWar[e]) aim += 18;     // (a common enemy)
      const ra = a.ruler && world.npcs[a.ruler], rb = b.ruler && world.npcs[b.ruler];
      for (const r of [ra, rb]) if (r) { if (P().has(r, 'ambitious') || P().has(r, 'cruel') || P().has(r, 'hot-headed')) aim -= 8; if (P().has(r, 'kind') || P().has(r, 'patient')) aim += 6; }
      const ca = S().settlement(world, a.capital), cb = S().settlement(world, b.capital);
      aim -= ((ca ? ca.hunger : 0) + (cb ? cb.hunger : 0)) * 15;
      if (!war) {
        rel += (aim - rel) * 0.03;
        if (near && rng.chance(0.012)) {
          rel -= 7;
          if (rng.chance(0.4)) Rs.note(world, rng.pick([`A border patrol of ${a.short} clashed with riders of ${b.short}. Each side blames the other.`, `${b.short} accuses ${a.short} of harbouring its outlaws.`, `Herds of ${a.short} were driven off by men of ${b.short}.`, `${a.short} turned back the envoys of ${b.short} at its border.`]), 1);
        }
      }
      Rs.setRel(a, b, rel);
      if (war) return;
      // ---- pacts
      if (t.alliance && rel < 10) { delete t.alliance; Rs.note(world, `The alliance between ${a.short} and ${b.short} has lapsed: there is too little trust left in it.`, 2); }
      if (!t.alliance && rel > 45 && rng.chance(0.02) && !(a.overlord || b.overlord)) {
        t.alliance = world.day;
        Rs.note(world, `${a.short} and ${b.short} swore an alliance: each will take up arms if the other is attacked.`, 2);
        return;
      }
      if (!t.alliance && near && rel > -20 && rel < 20 && !(t.truce > world.day) && a.overlord !== b.id && b.overlord !== a.id && rng.chance(0.006)) {
        t.truce = world.day + 60;
        Rs.note(world, `${a.short} and ${b.short} swore a truce: no war between them for a season.`, 1);
        return;
      }
      // ---- claims and ultimatums: the strong ask for what they want of the weak
      if (near && !(t.truce > world.day) && !t.alliance && a.overlord !== b.id && b.overlord !== a.id) {
        const ma = Rs.might(world, a), mb = Rs.might(world, b);
        const [big, small, mB, mS] = ma >= mb ? [a, b, ma, mb] : [b, a, mb, ma];
        const claims = Rs.towns(world, small).filter(s => C[s.id] === big.id);
        const claim = claims.find(s => s.id !== small.capital) || null, whole = !claim && claims.some(s => s.id === small.capital);
        const ruler = big.ruler && world.npcs[big.ruler], greedy = ruler && (P().has(ruler, 'ambitious') || P().has(ruler, 'greedy'));
        if (mB > mS * 1.8 && !small.overlord && (claim || whole || (greedy && rel < 0)) && rng.chance(claim || whole ? 0.01 : 0.004)) return Rs.ultimatum(world, big, small, claim, rng, whole);
      }
      // ---- war
      if (near && rel < -45 && !(t.truce > world.day)) {
        const ma = Rs.might(world, a), mb = Rs.might(world, b);
        const amb = r => r && (P().has(r, 'ambitious') ? 0.6 : 0) + (P().has(r, 'hot-headed') ? 0.3 : 0);
        const hunger = (ca ? ca.hunger : 0) + (cb ? cb.hunger : 0);
        const p = 0.025 * (1 + hunger * 2 + amb(ra) + amb(rb)) * (Math.max(ma, mb) > Math.min(ma, mb) * 1.4 ? 1.4 : 0.7);
        if (rng.chance(p)) {
          const aggressor = ma * (1 + amb(ra)) >= mb * (1 + amb(rb)) ? a : b, other = aggressor === a ? b : a;
          const claim = Rs.towns(world, other).find(s => C[s.id] === aggressor.id);
          Rs.war(world, aggressor, other, claim ? 'claim' : hunger > 0.3 ? 'plunder' : 'conquest', claim ? claim.id : null);
        }
      }
    },
    ultimatum(world, big, small, claim, rng, whole) {
      const rb = big.ruler && world.npcs[big.ruler];
      const what = claim ? claim : null;
      const ratio = Rs.might(world, big) / Math.max(1, Rs.might(world, small));
      const yields = rng.chance(U.clamp(0.25 + (ratio - 1.8) * 0.2, 0.15, 0.8));
      // the whole of it: a realm that broke away is told to bend the knee again
      if (whole) {
        if (yields) {
          small.overlord = big.id;
          Rs.setRel(big, small, Math.max(0, Rs.rel(big, small) + 25));
          for (const s of Rs.towns(world, small)) if (Rs.st(world).claims[s.id] === big.id) delete Rs.st(world).claims[s.id];
          Rs.note(world, `${U.cap(Rs.the(small))} bent the knee: it is sworn to ${big.short} again, and pays it tribute — though it keeps its own ruler.`, 3);
        } else {
          Rs.note(world, `${rb ? P().fullTitle(world, rb) : big.short} told ${small.short} to bend the knee. ${small.short} refused.`, 2);
          Rs.war(world, big, small, 'reconquest', small.capital);
        }
        return;
      }
      if (what) {
        if (yields) {
          ECHO.Politics.flipSettlement(world, what, big.id, `was handed over to ${big.short} under its ultimatum`);
          delete Rs.st(world).claims[what.id];
          Rs.setRel(big, small, Rs.rel(big, small) - 10);
          Rs.note(world, `${small.short} bowed to the ultimatum of ${rb ? P().fullTitle(world, rb) : big.short} and gave up ${what.name}.`, 3);
        } else {
          Rs.note(world, `${rb ? P().fullTitle(world, rb) : big.short} demanded ${what.name} of ${small.short}. ${small.short} refused.`, 2);
          Rs.war(world, big, small, 'claim', what.id);
        }
      } else {
        const amt = Math.round(Math.max(3, small.treasury * 0.008));
        if (yields) {
          ECHO.Realm.st(small).tribute = { to: big.id, amt, until: world.day + 40 };
          Rs.setRel(big, small, Rs.rel(big, small) - 8);
          Rs.note(world, `${small.short} agreed to pay ${big.short} a tribute of ${amt} crowns a day for forty days, rather than face its armies.`, 2);
        } else {
          Rs.note(world, `${big.short} demanded tribute of ${small.short}, and was refused.`, 2);
          Rs.war(world, big, small, 'tribute', null);
        }
      }
    },
    // war is declared — and the allies are called
    war(world, a, b, goal, claim) {
      if (a.atWar[b.id] || a === b || a.fallen || b.fallen) return;
      const t = Rs.tie(world, a, b);
      if (t.alliance) delete t.alliance;
      ECHO.Politics.declareWar(world, a, b);
      const W0 = Rs.st(world).wars[Rs.key(a, b)] = { a: a.id, b: b.id, start: world.day, goal: goal || 'conquest', claim: claim || null, score: { [a.id]: 0, [b.id]: 0 } };
      const why = { conquest: 'for land', claim: `to take back ${claim && S().settlement(world, claim) ? S().settlement(world, claim).name : 'what it claims'}`, plunder: 'hungry, for plunder', tribute: 'to make it pay', reconquest: 'to take back what broke away', independence: 'to be free', coalition: 'to cut it down to size', defence: 'to defend an ally' }[W0.goal] || '';
      Rs.note(world, `${a.short} goes to war with ${b.short} — ${why}.`, 2);
      // a vassal marches with its overlord; an overlord defends its vassal; allies are called
      for (const f of Rs.powers(world)) {
        if (f === a || f === b || f.atWar[a.id] || f.atWar[b.id]) continue;
        // a sworn truce holds: it keeps out of it (and its friend understands, a little)
        const truceA = Rs.tie(world, f, a).truce > world.day, truceB = Rs.tie(world, f, b).truce > world.day;
        if ((truceB && (f.overlord === a.id || Rs.tie(world, f, a).alliance)) || (truceA && (f.overlord === b.id || b.overlord === f.id || Rs.tie(world, f, b).alliance))) {
          const friend = truceB ? a : b, foe = truceB ? b : a;
          Rs.setRel(f, friend, Rs.rel(f, friend) - 8);
          Rs.note(world, `${f.short} will not break its truce with ${foe.short}, and stays out of the war — to the anger of ${friend.short}.`, 1);
          continue;
        }
        if (f.overlord === a.id && !f.atWar[b.id]) { Rs.join(world, f, b, a); continue; }
        if (f.overlord === b.id || b.overlord === f.id) { Rs.join(world, f, a, b); continue; }
        const tb = Rs.tie(world, f, b);
        if (tb.alliance) {
          const ta = Rs.tie(world, f, a);
          if (ta.alliance || Rs.rel(f, a) > Rs.rel(f, b)) { delete tb.alliance; Rs.setRel(f, b, Rs.rel(f, b) - 30); Rs.note(world, `${f.short} would not march against ${a.short} for its ally ${b.short}, and the alliance is broken.`, 2); }
          else Rs.join(world, f, a, b);
        }
      }
    },
    join(world, f, enemy, friend) {
      if (f.atWar[enemy.id]) return;
      ECHO.Politics.declareWar(world, f, enemy);
      Rs.st(world).wars[Rs.key(f, enemy)] = { a: f.id, b: enemy.id, start: world.day, goal: 'defence', with: friend.id, score: { [f.id]: 0, [enemy.id]: 0 } };
      Rs.note(world, `${f.short} keeps its word to ${friend.short} and goes to war with ${enemy.short}.`, 2);
    },
    // ---- vassals
    vassalage(world, f, rng) {
      const towns = Rs.towns(world, f);
      if (f.overlord) {
        const o = world.factions[f.overlord];
        if (!o || o.fallen) { f.overlord = null; return; }
        // tribute, a share of the treasury, every day
        const amt = Math.min(Math.max(0, f.treasury) * 0.01, 6);
        f.treasury -= amt; o.treasury += amt;
        // and its freedom, when the overlord weakens or the bond sours
        if ((Rs.rel(f, o) < -10 || Rs.might(world, o) < Rs.might(world, f) * 1.2) && rng.chance(0.01)) {
          f.overlord = null;
          Rs.note(world, `${f.short} has thrown off the overlordship of ${o.short} and declared itself free.`, 3);
          if (rng.chance(0.6)) Rs.war(world, o, f, 'reconquest', null);
        }
        return;
      }
      if (towns.length > 2 || f.vassals) return;
      // small, and threatened: it seeks a protector
      const mf = Rs.might(world, f);
      const threat = Rs.powers(world).find(g => g !== f && Rs.neighbours(world, f, g) && Rs.might(world, g) > mf * 2 && (Rs.rel(f, g) < -35 || f.atWar[g.id]));
      if (!threat || !rng.chance(0.015)) return;
      const lord = Rs.powers(world).filter(g => g !== f && g !== threat && !g.overlord && Rs.neighbours(world, f, g) && Rs.rel(f, g) > -5 && Rs.might(world, g) > mf * 1.5).sort((x, y) => Rs.rel(f, y) - Rs.rel(f, x))[0];
      if (!lord) return;
      f.overlord = lord.id;
      Rs.setRel(f, lord, Rs.rel(f, lord) + 20);
      Rs.note(world, `${f.short}, afraid of ${threat.short}, has sworn itself to ${Rs.the(lord)}: it will pay tribute and march in its wars, and ${lord.short} will defend it.`, 3);
    },
    // ---- empires
    empire(world, f) {
      if (f.style === 'empire' || f.type !== 'kingdom') return;
      const n = Rs.towns(world, f).length + Rs.powers(world).filter(g => g.overlord === f.id).length * 2;
      if (n < 12 || world.day - (f.founded || 0) < 60) return;
      f.style = 'empire'; f.name = STYLES.empire.name(f.short);
      const r = f.ruler && world.npcs[f.ruler];
      if (r) r.title = Rs.rulerTitle(f, r);
      Rs.note(world, `${f.short} holds so much now that ${r ? P().fullTitle(world, r) : 'its ruler'} has been proclaimed: it is ${Rs.the(f)}.`, 3);
    },
    // ---- coalitions against the one grown too strong
    coalitions(world, rng) {
      if (!rng.chance(0.05)) return;
      const ps = Rs.powers(world);
      if (ps.length < 3) return;
      const total = ps.reduce((a, f) => a + Rs.might(world, f), 0);
      const top = ps.slice().sort((a, b) => Rs.might(world, b) - Rs.might(world, a))[0];
      if (!top || Rs.might(world, top) < total * 0.5 || Rs.towns(world, top).length < 4) return;
      const worried = ps.filter(f => f !== top && Rs.neighbours(world, f, top) && Rs.rel(f, top) < 0 && f.overlord !== top.id);
      if (worried.length < 2) return;
      let made = 0;
      for (let i = 0; i < worried.length; i++) for (let j = i + 1; j < worried.length; j++) {
        const t = Rs.tie(world, worried[i], worried[j]);
        // (only those who can stand each other: old grudges keep some out of it)
        if (!t.alliance && !worried[i].atWar[worried[j].id] && Rs.rel(worried[i], worried[j]) > -15) { t.alliance = world.day; Rs.setRel(worried[i], worried[j], Math.max(30, Rs.rel(worried[i], worried[j]))); made++; }
      }
      if (made) Rs.note(world, `Afraid of how great ${top.short} has grown, ${worried.map(f => f.short).join(', ')} have bound themselves together against it.`, 3);
    },
    // ---- far provinces, unruly and far from their crown, may break away
    unrest(world, rng) {
      const S0 = Rs.st(world);
      const yours = s => s.warden != null || (world.player && (world.player.wardenOf || []).includes(s.id));
      if (rng.chance(0.03)) for (const k of Rs.powers(world)) {
        const cap = S().settlement(world, k.capital);
        if (!cap) continue;
        const ts = Rs.towns(world, k).filter(s => s !== cap && s.kind === 'village' && (s.unrest || 0) > 55 && Rs.dist(world, s.x, s.y, cap.x, cap.y) > 70 && !yours(s));
        if (ts.length && Rs.towns(world, k).length >= 3 && rng.chance(0.3)) { Rs.secede(world, rng.pick(ts), k, rng, false); return; }
      }
      // a realm grown wider than it can hold: the more towns past four, the likelier one of them rises —
      // above all one it took by the sword, far from its court, in a war or under a new ruler. If the
      // house it was taken from has fallen, that house comes back; otherwise its lord crowns himself.
      for (const k of Rs.powers(world)) if (Rs.overreach(world, k, rng)) return;
    },
    overreach(world, k, rng) {
      const S0 = Rs.st(world);
      const yours = s => s.warden != null || (world.player && (world.player.wardenOf || []).includes(s.id));
      const cap = S().settlement(world, k.capital), mine = Rs.towns(world, k);
      if (!cap || mine.length < 5) return null;
      const atWar = Object.keys(k.atWar || {}).some(id => k.atWar[id]);
      const fresh = k.crowned != null && world.day - k.crowned < 60;
      if (!rng.chance(0.002 * Math.min(6, mine.length - 4) * (atWar ? 1.6 : 1) * (fresh ? 2 : 1))) return null;
      const ts = mine.filter(s => s !== cap && s.kind !== 'capital' && s.kind !== 'temple' && !yours(s) && Rs.dist(world, s.x, s.y, cap.x, cap.y) > 35);
      if (!ts.length) return null;
      const score = s => (S0.claims[s.id] && S0.claims[s.id] !== k.id ? 40 : 0) + Math.min(120, Rs.dist(world, s.x, s.y, cap.x, cap.y)) / 3 + (s.unrest || 0) / 2 + rng.next() * 10;
      const s = ts.sort((a, b) => score(b) - score(a))[0];
      const old = S0.claims[s.id] && world.factions[S0.claims[s.id]];
      if (old && old.fallen && old.type === 'kingdom') return Rs.restore(world, old, s, k, rng);
      return Rs.secede(world, s, k, rng, false);
    },
    // a fallen house comes back: a town that was its own rises for it, and crowns one of its own
    restore(world, f, s, k, rng) {
      const S0 = Rs.st(world);
      delete f.fallen;
      f.atWar = {}; f.capital = s.id; f.treasury = Math.max(f.treasury || 0, 240);
      f.restored = world.day;
      for (const g of Object.values(world.factions)) if (g !== f && g.atWar && g.atWar[f.id]) delete g.atWar[f.id];
      for (const key of Object.keys(S0.wars)) if (S0.wars[key].a === f.id || S0.wars[key].b === f.id) delete S0.wars[key];
      s.faction = f.id;
      for (const n of P().residents(world, s)) n.faction = f.id;
      S0.claims[s.id] = k.id;
      Rs.setRel(f, k, -50);
      const res = P().residents(world, s).filter(n => n.status === 'alive' && P().age(world, n) >= 20 && n.prof !== 'child');
      const heir = (s.ruler && world.npcs[s.ruler] && world.npcs[s.ruler].status === 'alive' ? world.npcs[s.ruler] : null) || res.sort((a, b) => (b.renown + b.wealth * 0.05) - (a.renown + a.wealth * 0.05))[0];
      if (heir) ECHO.Politics.crown(world, f, heir, `raised the banner of ${f.name} again at ${s.name}`);
      world._dgH = null; world._dgR = null; world._routes = {};
      Rs.note(world, `${s.name} has risen against ${Rs.the(k)} and raised the old banner of ${Rs.the(f)} again${heir ? `: ${P().fullTitle(world, heir)} claims its crown` : ''}. The fallen house is back.`, 3);
      if (rng.chance(0.6)) Rs.war(world, k, f, 'reconquest', s.id);
      return f;
    },
    // ---- the reckoning, and peace with terms
    score(world, winner, loser, pts) {
      const W0 = Rs.st(world).wars[Rs.key(winner, loser)];
      if (W0 && W0.score) W0.score[winner.id] = (W0.score[winner.id] || 0) + pts;
    },
    peace(world, rng) {
      const S0 = Rs.st(world);
      for (const k of Object.keys(S0.wars)) {
        const W0 = S0.wars[k], a = world.factions[W0.a], b = world.factions[W0.b];
        if (!a || !b || !a.atWar[b.id]) {
          if (a && b) Rs.note(world, a.fallen || b.fallen ? `${(a.fallen ? a : b).name} is no more: ${(a.fallen ? b : a).short} has taken the last of it.` : `The war between ${a.short} and ${b.short} is over — the Lantern brought them to terms.`, a.fallen || b.fallen ? 3 : 1);
          delete S0.wars[k]; continue;
        }
        const days = world.day - W0.start, sa = W0.score[a.id] || 0, sb = W0.score[b.id] || 0;
        // worn out: long wars, the dead, empty coffers, hunger
        const ca = S().settlement(world, a.capital), cb = S().settlement(world, b.capital);
        const weary = days / 60 + ((a.casualties || 0) + (b.casualties || 0)) / 40 + ((a.treasury < 40 ? 1 : 0) + (b.treasury < 40 ? 1 : 0)) * 0.5 + ((ca ? ca.hunger : 0) + (cb ? cb.hunger : 0));
        if (days < 12 || !rng.chance(Math.min(0.2, 0.01 * weary + Math.abs(sa - sb) * 0.002))) continue;
        Rs.treaty(world, W0, a, b, sa, sb);
        delete S0.wars[k];
      }
    },
    treaty(world, W0, a, b, sa, sb) {
      const [win, lose] = sa >= sb ? [a, b] : [b, a];
      const margin = Math.abs(sa - sb);
      ECHO.Politics.makePeace(world, a, b, true);
      let terms;
      const claim = W0.claim && S().settlement(world, W0.claim);
      if (margin >= 12 && claim && claim.faction === lose.id && claim.id !== lose.capital && W0.a === win.id) {
        ECHO.Politics.flipSettlement(world, claim, win.id, `was ceded to ${win.short} in the peace`);
        delete Rs.st(world).claims[claim.id];
        terms = `${lose.short} cedes ${claim.name} to ${win.short}`;
      } else if (margin >= 4) {
        const amt = Math.round(Math.max(2, lose.treasury * 0.008 + margin * 0.15));
        ECHO.Realm.st(lose).tribute = { to: win.id, amt, until: world.day + 30 + Math.min(30, margin) };
        terms = `${lose.short} pays ${win.short} ${amt} crowns a day for ${30 + Math.min(30, margin)} days`;
      } else terms = 'neither side gains anything by it';
      if (W0.goal === 'independence' && win.id === W0.b) { const f = world.factions[W0.b]; if (f) f.overlord = null; }
      Rs.tie(world, a, b).truce = world.day + 45;
      Rs.note(world, `Peace between ${a.short} and ${b.short}, after ${world.day - W0.start} days of war (${a.short} ${sa}, ${b.short} ${sb}): ${terms}. A truce holds between them for a while.`, 3);
    },

    // ------------------------------------------------------------ the Journal: the powers of the world
    html(game) {
      const world = game.world, pl = game.pl, esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      const S0 = Rs.st(world), ps = Rs.powers(world).concat(Object.values(world.factions).filter(f => f.type === 'order' && !f.fallen));
      const me = ECHO.Prowess ? ECHO.Prowess.level(pl) : 1;
      const relWord = v => v >= 50 ? ['close friends', '#8fe08a'] : v >= 20 ? ['friendly', '#b8e08a'] : v > -20 ? ['wary', '#e8dcc0'] : v > -50 ? ['hostile', '#ffb84a'] : ['bitter enemies', '#ff7a5a'];
      const row = f => {
        const ts = Rs.towns(world, f), r = f.ruler && world.npcs[f.ruler], seat = S().settlement(world, f.capital);
        const ties = [];
        for (const g of ps) {
          if (g === f) continue;
          const t = Rs.tie(world, f, g);
          if (f.atWar[g.id]) { const W0 = S0.wars[Rs.key(f, g)]; ties.push(`<span class="ember">⚔ at war with ${esc(g.short)}${W0 ? ` (${W0.score[f.id] || 0} to ${W0.score[g.id] || 0}, day ${world.day - W0.start})` : ''}</span>`); }
          else if (t.alliance) ties.push(`<span style="color:#8fe08a">allied with ${esc(g.short)}</span>`);
          else if (t.truce > world.day) ties.push(`<span class="dim">a truce with ${esc(g.short)}</span>`);
        }
        if (f.overlord && world.factions[f.overlord]) ties.push(`<span style="color:#c8a8ff">sworn to ${esc(world.factions[f.overlord].short)}</span>`);
        const vas = Rs.powers(world).filter(g => g.overlord === f.id);
        if (vas.length) ties.push(`<span style="color:#c8a8ff">overlord of ${vas.map(g => esc(g.short)).join(', ')}</span>`);
        const pact = ECHO.Realm ? Object.entries(ECHO.Realm.st(f).pacts || {}).filter(([k]) => world.factions[k] && !world.factions[k].fallen).map(([k, v]) => `${v.kind === 'marriage' ? 'married into' : 'trades with'} ${esc(world.factions[k].short)}`) : [];
        const stand = Rs.standing(world, f, pl), sw = stand >= 30 ? ['they honour you', '#8fe08a'] : stand >= 8 ? ['they think well of you', '#b8e08a'] : stand > -8 ? ['they hardly know you', '#e8dcc0'] : stand > -30 ? ['they distrust you', '#ffb84a'] : ['they want you dead', '#ff7a5a'];
        const band = seat && Dg() ? Dg().at(world, seat.x, seat.y) : null;
        return `<div class="card realm-card" style="border-left:4px solid ${f.color}"><h4><span style="color:${f.color}">⚑</span> ${esc(f.name)} <span class="dim" style="font-size:12px">· a ${esc(Rs.styleWord(f))}${f.farRealm ? ' of the far lands' : ''}${f.seceded && world.factions[f.seceded] ? `, broken from ${esc(world.factions[f.seceded].short)}` : ''}</span></h4>
          <div>${r ? `<b>${esc(P().fullTitle(world, r))}</b>` : '<span class="dim">no ruler</span>'}${seat ? ` · seat ${esc(seat.name)}` : ''} · ${ts.length} town${ts.length === 1 ? '' : 's'}${f.type === 'kingdom' ? ` · strength ${Math.round(Rs.might(world, f))}` : ''}${band != null ? ` · its people about level ${Math.round(Math.max(ECHO.Powers ? ECHO.Powers.age(world) : 1, band * 1.1) * 0.6)}` : ''}</div>
          ${ties.length ? `<div style="font-size:13px">${ties.join(' · ')}</div>` : '<div class="dim" style="font-size:13px">At peace, bound to no one.</div>'}
          ${pact.length ? `<div class="dim" style="font-size:12px">${pact.join(' · ')}</div>` : ''}
          ${ECHO.Arsenal && !f.fallen ? `<div style="font-size:12px">Arms: ${ECHO.Arsenal.line(world, f)}</div>` : ''}
          <div style="font-size:12px">To you: <span style="color:${sw[1]}">${sw[0]}</span>${pl.knighted === f.id ? ' · <span class="gold">you are its knight</span>' : ''}</div></div>`;
      };
      // the relations between the neighbours, at a glance
      const pairs = [];
      for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
        const a = ps[i], b = ps[j];
        if (a.type !== 'kingdom' || b.type !== 'kingdom' || !Rs.neighbours(world, a, b)) continue;
        const v = Math.round(Rs.rel(a, b)), w = relWord(v);
        pairs.push(`<div><span style="color:${a.color}">${esc(a.short)}</span> · <span style="color:${b.color}">${esc(b.short)}</span>: <span style="color:${w[1]}">${a.atWar[b.id] ? 'at war' : w[0]}</span> <span class="dim">(${v > 0 ? '+' : ''}${v})</span></div>`);
      }
      const log = S0.log.slice(-8).reverse();
      return `<h3 class="gold">The powers of the world</h3>
        <p class="dim">Every realm, its ruler and towns, and how it stands with its neighbours and with you. Neighbours trade, marry, swear alliances and truces, make demands of each other, take vassals and go to war; a realm that grows too great draws the others together against it.</p>
        ${ps.map(row).join('')}
        ${pairs.length ? `<div class="card"><h4>Between neighbours</h4>${pairs.join('')}</div>` : ''}
        ${log.length ? `<div class="card"><h4>Lately, between the powers</h4>${log.map(l => `<div><span class="dim">Day ${l.d}:</span> ${esc(l.text)}</div>`).join('')}</div>` : ''}`;
    }
  };
})();
