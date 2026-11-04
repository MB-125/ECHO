// The realm at arms.
//
// Every town of a kingdom (or of the Order) keeps a garrison, and the bigger the place the
// more soldiers it keeps: a village a handful, a town a dozen, a city more, a capital the
// most of all (and more again in a time of war). Soldiers are real people — recruited from
// the country round about when the garrison is short, fed from the crown's stores, trained
// every day (they rise in level with the age, as everyone who fights does), promoted to
// sergeant and captain, and killed in battle. Each garrison has a captain; each kingdom a
// Marshal who leads its armies and a Champion, its best fighter; each town of size a lord
// or a lady (a village a reeve), each capital its king or queen. Towns of size raise a
// palisade and a watchtower; a town's strength counts its soldiers' levels, its walls, its
// towers, its captain and its arms.
//
// In peace, columns of soldiers march between a kingdom's towns on patrol; in war the
// Marshal leads the host against the enemy's towns, and the battle is reckoned by levels,
// numbers, walls and command — or, if you are there, fought in front of you (warfront.js).
// Everything here is made lazily: an old world takes it up from the day it is loaded.
(function () {
  const { U } = ECHO;
  const P = () => ECHO.People;
  const lvOf = n => (ECHO.Powers ? ECHO.Powers.lvOf(n) : (n.lv || 1));

  const TIER = {
    capital: { name: 'Capital', k: 0.34, base: 8, walls: true, tower: true },
    city: { name: 'City', k: 0.24, base: 5, walls: true, tower: true },
    town: { name: 'Town', k: 0.16, base: 3, walls: true, tower: true },
    temple: { name: 'Temple town', k: 0.12, base: 2, walls: false, tower: true },
    village: { name: 'Village', k: 0.09, base: 2, walls: false, tower: false }
  };

  const Mil = ECHO.Military = {
    V: 1, TIER, lvOf,
    st(world) {
      const S = world.mil || (world.mil = { v: Mil.V, battles: [], works: {} });
      if (!S.battles) S.battles = [];
      if (!S.works) S.works = {};
      return S;
    },
    // the faction keeps soldiers at all (kingdoms and the Order; not the outlaws, not the wild)
    armed(world, s) { const f = world.factions[s.faction]; return !!(f && !f.fallen && (f.type === 'kingdom' || f.type === 'order')); },
    civilians(world, s) { let c = 0; for (const n of P().residents(world, s)) if (!n.soldier) c++; return c; },
    soldiers(world, s) { return P().residents(world, s).filter(n => n.prof === 'guard' && !(n.jailUntil > world.day)); },
    // what a place is: a capital, a temple town, or by its people a city (40 or more, not counting
    // the garrison), a town (26 or more) or a village — and slow to lose what it has grown into
    // (a town that dips under for a season is still a town)
    TIERS: ['village', 'town', 'city'], AT: { village: 0, town: 26, city: 40 },
    tier(world, s) {
      if (s.kind === 'capital') return 'capital';
      if (s.kind === 'temple') return 'temple';
      const c = Mil.civilians(world, s), raw = c >= 40 ? 'city' : c >= 26 ? 'town' : 'village', was = s.milTier;
      if (was && Mil.TIERS.indexOf(was) > Mil.TIERS.indexOf(raw) && c >= Mil.AT[was] * 0.75) return was;
      return raw;
    },
    atWar(world, fid) { const f = world.factions[fid]; return !!(f && f.atWar && Object.keys(f.atWar).length); },
    // how many soldiers a place keeps
    target(world, s) {
      if (!Mil.armed(world, s)) return 0;
      const T = TIER[Mil.tier(world, s)];
      let n = T.base + Mil.civilians(world, s) * T.k;
      if (Mil.atWar(world, s.faction)) n *= 1.35;
      n *= 0.85 + U.clamp((s.prosperity || 50) / 400, 0, 0.3);
      return Math.max(1, Math.round(n));
    },
    // what one fighter is worth in a battle: their level above all, then rank and skill
    power(n) { return 10 + lvOf(n) * 2.2 + (n.rank || 0) * 6 + ((n.skill && n.skill.fight) || 0) * 0.2 + (n.ngAux ? 40 : 0); },
    // a town's strength in a fight: its soldiers, its walls and towers, its captain, its arms
    strength(world, s) {
      let str = 0;
      for (const n of P().residents(world, s)) {
        if (n.prof === 'guard' || n.ngAux) str += Mil.power(n);
        else if (n.prof !== 'child' && n.prof !== 'elder' && P().has(n, 'brave')) str += 3 + n.skill.fight * 0.15;
      }
      const f = world.factions[s.faction];
      str *= 1 + Math.min(0.5, ((s.stock && s.stock.arms) || 0) / 60);
      str *= 1 + (f && f.tech ? f.tech.era * 0.08 : 0);
      if (s.kind === 'capital') str *= 1.2;
      if (s.works && s.works.walls) str *= 1.4;
      if (s.works && s.works.watch) str *= 1.1;
      const cap = s.captain && world.npcs[s.captain];
      if (cap && cap.status === 'alive' && cap.home === s.id) str *= 1 + Math.min(0.3, lvOf(cap) / 300);
      return str + 8;
    },
    // one to five, for the board: how it stands against the other towns of the realm (a capital
    // behind its walls is five; a village with a handful of spears, one or two)
    stars(world, s) {
      const k = world.day + ':' + world.settlements.length;
      if (!Mil._med || Mil._med.k !== k || Mil._med.w !== world) {
        const all = world.settlements.filter(t => Mil.armed(world, t)).map(t => Mil.strength(world, t)).sort((a, b) => a - b);
        Mil._med = { k, w: world, v: all.length ? all[all.length >> 1] : 100 };
      }
      const r = Mil.strength(world, s) / Math.max(1, Mil._med.v);
      return r >= 2.6 ? 5 : r >= 1.4 ? 4 : r >= 0.75 ? 3 : r >= 0.4 ? 2 : 1;
    },
    captain(world, s) { const c = s.captain && world.npcs[s.captain]; return c && c.status === 'alive' && c.home === s.id ? c : null; },
    marshal(world, f) { const m = f && f.marshal && world.npcs[f.marshal]; return m && m.status === 'alive' && m.faction === f.id ? m : null; },
    champion(world, f) { const c = f && f.champion && world.npcs[f.champion]; return c && c.status === 'alive' && c.faction === f.id ? c : null; },
    ruler(world, s) { const r = s.ruler && world.npcs[s.ruler]; return r && r.status === 'alive' ? r : null; },
    lordTitle(world, s, n) { const t = Mil.tier(world, s); return t === 'village' || t === 'temple' ? 'Reeve' : n.sex === 'f' ? 'Lady' : 'Lord'; },

    // ------------------------------------------------------------ every day
    dailyTick(world) {
      const rng = new ECHO.RNG(ECHO.hashStr('mil:' + world.seed + ':' + world.day));
      const S = Mil.st(world);
      if (!S.musterDay) Mil.muster(world);
      for (const s of world.settlements) {
        if (!Mil.armed(world, s)) continue;
        if (s.kind !== 'capital' && s.kind !== 'temple') s.milTier = Mil.tier(world, s);
        Mil.supply(world, s);
        Mil.recruit(world, s, rng);
        Mil.officers(world, s);
        Mil.lords(world, s);
        Mil.works(world, s, rng);
      }
      for (const f of Object.values(world.factions)) if ((f.type === 'kingdom' || f.type === 'order') && !f.fallen) Mil.command(world, f);
      Mil.patrols(world, rng);
    },
    // A world from before the realm took up arms: the garrisons are filled (most of the way),
    // their officers named, and its fighters trained up toward the age — all at once.
    muster(world) {
      const S = Mil.st(world);
      S.musterDay = world.day;
      const rng = new ECHO.RNG(ECHO.hashStr('muster:' + world.seed));
      for (const s of world.settlements) {
        if (!Mil.armed(world, s)) continue;
        const want = Mil.target(world, s);
        let have = Mil.soldiers(world, s).length, k = 0;
        while (have < Math.round(want * 0.7) && k++ < 40) { Mil.enlist(world, s, rng); have++; }
      }
      const Pw = ECHO.Powers;
      if (Pw) {
        const plv = Pw.plLv(world);
        for (const id in world.npcs) {
          const n = world.npcs[id];
          if (n.status !== 'alive' || n.ng || !Mil.fighter(n)) continue;
          const lv = lvOf(n), T = Pw.aim(world, n, plv);
          if (T > lv + 1) n.lv = Math.round(lv + (T - lv) * 0.6);
        }
      }
    },
    fighter(n) { return n.prof === 'guard' || n.soldier || n.adv || n.rival || (n.title && /Marshal|Champion|King|Queen/.test(n.title)); },
    // one soldier more, from the country round about
    enlist(world, s, rng) {
      const n = P().create(world, rng, { home: s.id, faction: s.faction, prof: 'guard', fight: rng.int(30, 55), born: world.day - Math.floor(rng.range(18, 32) * ECHO.TIME.YEAR_DAYS) });
      n.soldier = 1;
      const Pw = ECHO.Powers;
      if (Pw) n.lv = Math.max(n.lv || 1, Math.round(Pw.aim(world, n, Pw.plLv(world)) * rng.range(0.45, 0.7)));
      return n;
    },
    // The crown pays its soldiers and keeps them fed: when a town with a garrison runs short, grain
    // is bought for it out of the treasury (while there is coin to buy it with).
    supply(world, s) {
      const f = world.factions[s.faction];
      if (!f || !s.stock) return;
      const sol = Mil.soldiers(world, s).length;
      if (f.treasury != null) f.treasury -= sol * 0.15;
      if (s.hunger > 0.12 && sol && (f.treasury || 0) > 80) {
        const q = Math.min(sol * 0.35 * 4, 30), cost = q * 1.2;   // (the garrison's own bread, four days of it: the town must still feed itself)
        if (f.treasury > cost + 40) { f.treasury -= cost; s.stock.food = (s.stock.food || 0) + q; }
      }
    },
    recruit(world, s, rng) {
      const have = Mil.soldiers(world, s), want = Mil.target(world, s);
      if (have.length < want && !(s.hunger > 0.3)) {
        const k = s.kind === 'capital' ? 2 : 1;
        for (let i = 0; i < Math.min(k, want - have.length); i++) Mil.enlist(world, s, rng);
        return;
      }
      // in peace, the extra hands go back to the fields (the youngest recruits first)
      if (!Mil.atWar(world, s.faction) && have.length > want * 1.4 + 1) {
        const x = have.filter(n => !n.rank && !n.journey && !n.title && n.id !== s.ruler && !n.ngAux).sort((a, b) => (b.soldier ? 1 : 0) - (a.soldier ? 1 : 0) || b.born - a.born)[0];
        if (x) { x.prof = 'farmer'; x.soldier = 0; }
      }
      // the old leave the ranks
      for (const n of have) if (n.soldier && !n.rank && P().age(world, n) > 48) { n.prof = 'farmer'; n.soldier = 0; }
    },
    // a captain for every garrison (and a sergeant for every six)
    officers(world, s) {
      const sol = Mil.soldiers(world, s);
      if (!sol.length) { s.captain = null; return; }
      let cap = Mil.captain(world, s);
      if (!cap || cap.prof !== 'guard' || cap.title === 'Marshal') {
        cap = sol.filter(n => !n.title || n.title === 'Champion').sort((a, b) => (Math.min(2, b.rank) - Math.min(2, a.rank)) || (lvOf(b) - lvOf(a)))[0] || null;
        s.captain = cap ? cap.id : null;
        if (cap && cap.rank < 2) Mil.raise(world, cap, 2, `to command the garrison of ${s.name}`, sol.length >= 6);
      }
      // a captain is the best soldier the garrison has: one far stronger takes the command in time
      if (cap && world.day % 10 === 0) {
        const best = sol.filter(n => n !== cap && !n.title && n.prof === 'guard').sort((a, b) => lvOf(b) - lvOf(a))[0];
        if (best && lvOf(best) > lvOf(cap) * 1.25 + 2) { cap = best; s.captain = best.id; Mil.raise(world, best, 2, `to command the garrison of ${s.name}`, sol.length >= 6); }
      }
      if (cap && ECHO.Watch) ECHO.Watch.st(world, s).captain = cap.id;   // (the captain of the garrison keeps the watch too)
      const sgt = sol.filter(n => n.rank === 1).length, want = Math.floor(sol.length / 6);
      if (sgt < want) { const c = sol.filter(n => !n.rank && !n.title).sort((a, b) => lvOf(b) - lvOf(a))[0]; if (c) Mil.raise(world, c, 1); }
    },
    // a promotion (told in the chronicle only when it is worth telling)
    raise(world, n, rank, why, tell) {
      if (rank <= (n.rank || 0)) return;
      if (tell && ECHO.Politics) return ECHO.Politics.promote(world, n, rank, why);
      n.rank = rank;
      P().remember(world, n, `was raised to ${P().RANKS[rank]}${why ? ' ' + why : ''}`, 'pride', null, 2);
    },
    // ready from the moment the world is loaded (an old world musters at once)
    ensure(world) { const S = Mil.st(world); if (!S.musterDay && world.settlements) { Mil.muster(world); for (const s of world.settlements) if (Mil.armed(world, s)) { Mil.officers(world, s); Mil.lords(world, s); } for (const f of Object.values(world.factions)) if ((f.type === 'kingdom' || f.type === 'order') && !f.fallen) Mil.command(world, f); } return S; },
    // what the banner says as you walk into a town
    banner(world, s) {
      const f = world.factions[s.faction];
      if (!f) return s.name;
      const T = TIER[Mil.tier(world, s)], r = Mil.ruler(world, s), kr = f.ruler && world.npcs[f.ruler];
      const head = s.kind === 'capital' ? `Capital of ${f.short}` : s.kind === 'temple' ? `Temple town of ${f.short}` : `${T.name} of ${f.short}`;
      const lord = s.kind === 'capital' ? (kr && kr.status === 'alive' ? P().fullTitle(world, kr) : null) : r ? P().fullTitle(world, r) : null;
      if (!Mil.armed(world, s)) return head + (lord ? ' · ' + lord : '');
      const g = Mil.soldiers(world, s).length, st = Mil.stars(world, s);
      return `${head}${lord ? ' · ' + lord : ''} · ${g} soldier${g === 1 ? '' : 's'}${s.works && s.works.walls ? ', walled' : ''} ${'★'.repeat(st)}`;
    },
    // a town of size has a lord or a lady; a village a reeve
    lords(world, s) {
      const r = Mil.ruler(world, s), f = world.factions[s.faction];
      if (!r || (f && f.capital === s.id)) return;
      if (r.title === 'Reeve' || r.title === 'Lord' || r.title === 'Lady') {
        const t = Mil.lordTitle(world, s, r);
        if (t !== r.title) {
          const was = r.title; r.title = t;
          if (was === 'Reeve' && ECHO.Chronicle) ECHO.Chronicle.add(world, { text: `${s.name} has grown into a ${TIER[Mil.tier(world, s)].name.toLowerCase()}, and ${r.first} ${r.last}, its reeve, is ${t === 'Lady' ? 'its lady' : 'its lord'} now.`, kind: 'politics', importance: 1, sid: s.id, npcs: [r.id] });
        }
      }
    },
    // Walls and a watchtower for the towns of size. A kingdom's crown commissions them through
    // its own works (realm.js: masons, a supply plea, the palisade going up round the town) when
    // its treasury allows, and keeps a town of size waiting no longer than a season; the Order
    // raises its own.
    works(world, s, rng) {
      const T = TIER[Mil.tier(world, s)], S = Mil.st(world), f = world.factions[s.faction];
      s.works = s.works || {};
      const R = ECHO.Realm, kingdom = R && f && f.type === 'kingdom';
      const build = (k, what) => {
        const key = s.id + ':' + k;
        if (s.works[k]) { delete S.works[key]; return; }
        if (kingdom) {
          const st = R.st(f);
          if (st.works.some(w => !w.done && w.sid === s.id && w.k === k)) return;
          if (!S.works[key]) S.works[key] = world.day + rng.int(2, 10);
          const W = R.WORKS[k], late = world.day - S.works[key] > 30;
          if (world.day < S.works[key] || (f.treasury < W.cost + 120 && !late)) return;
          f.treasury -= W.cost;
          st.works.push({ k, sid: s.id, to: null, start: world.day, ready: world.day + W.days, done: false });
          const ruler = R.ruler(world, f);
          if (ECHO.Chronicle) ECHO.Chronicle.add(world, { text: `By order of ${ruler ? P().fullTitle(world, ruler) : f.name}, work has begun on ${W.name} in ${s.name} — a ${TIER[Mil.tier(world, s)].name.toLowerCase()} of its size must be defended.`, kind: 'politics', importance: 1, sid: s.id });
          delete S.works[key];
          return;
        }
        if (!S.works[key]) { S.works[key] = world.day + rng.int(3, 14); return; }
        if (world.day < S.works[key]) return;
        s.works[k] = world.day; delete S.works[key];
        if (ECHO.Chronicle) ECHO.Chronicle.add(world, { text: `${s.name} ${what}.`, kind: 'politics', importance: 1, sid: s.id });
      };
      if (T.walls) build('walls', 'raised a palisade round itself');
      if (T.tower) build('watch', 'built a watchtower over its gate');
    },
    // the kingdom's Marshal (who leads its armies) and its Champion (its best fighter)
    command(world, f) {
      const men = P().alive(world).filter(n => n.faction === f.id && n.prof === 'guard' && n.loc && !n.ng);
      let m = Mil.marshal(world, f);
      if (!m || m.prof !== 'guard') {
        const old = f.marshal && world.npcs[f.marshal];
        if (old && old.title === 'Marshal') old.title = '';
        m = men.filter(n => !n.title || n.title === 'Marshal').sort((a, b) => (b.rank - a.rank) || (lvOf(b) + (b.renown || 0) * 0.2 - lvOf(a) - (a.renown || 0) * 0.2))[0] || null;
        f.marshal = m ? m.id : null;
        if (m) {
          m.rank = 3; m.title = 'Marshal';
          // the Marshal keeps the capital
          const cap = ECHO.Sim.settlement(world, f.capital);
          if (cap && m.home !== cap.id && !m.journey) {
            const old2 = ECHO.Sim.settlement(world, m.home);
            if (old2) { old2.residents = old2.residents.filter(x => x !== m.id); if (old2.captain === m.id) old2.captain = null; }
            m.home = cap.id; m.loc = cap.id; if (!cap.residents.includes(m.id)) cap.residents.push(m.id);
          }
          if (ECHO.Chronicle) ECHO.Chronicle.add(world, { text: `${m.first} ${m.last} was made Marshal of ${f.short}, to lead its armies.`, kind: 'politics', importance: 2, sid: f.capital, npcs: [m.id] });
        }
      }
      const pool = P().alive(world).filter(n => n.faction === f.id && n.loc && !n.ng && n.id !== f.marshal && n.id !== f.ruler && (!n.title || n.title === 'Champion') && n.prof !== 'child' && n.prof !== 'elder' && (n.prof === 'guard' || n.prof === 'wanderer' || n.prof === 'hunter' || n.adv || n.rival));
      const best = pool.sort((a, b) => lvOf(b) - lvOf(a))[0];
      const c = Mil.champion(world, f);
      if (best && (!c || lvOf(best) > lvOf(c) * 1.15 + 1)) {
        if (c && c.title === 'Champion') c.title = '';
        f.champion = best.id; best.title = 'Champion';
        if (ECHO.Chronicle) ECHO.Chronicle.add(world, { text: `${best.first} ${best.last} is named Champion of ${f.short} — the best fighter in the realm (level ${lvOf(best)}).`, kind: 'politics', importance: 2, sid: best.home, npcs: [best.id] });
      }
    },
    // In peace, a column marches between the kingdom's towns: a sergeant or captain and a few
    // soldiers on the road, seen by travellers, back home in a few days.
    patrols(world, rng) {
      for (const f of Object.values(world.factions)) {
        if (f.type !== 'kingdom' || f.fallen) continue;
        const live = (world.journeys || []).filter(j => j.kind === 'army' && j.army && j.army.faction === f.id && j.army.type === 'patrol').length;
        if (live >= 2 || !rng.chance(0.35)) continue;
        const towns = world.settlements.filter(s => s.faction === f.id);
        if (towns.length < 2) continue;
        const froms = towns.filter(s => Mil.soldiers(world, s).filter(n => !n.journey).length >= 5);
        if (!froms.length) continue;
        const from = rng.pick(froms), to = rng.pick(towns.filter(s => s !== from));
        const men = Mil.soldiers(world, from).filter(n => !n.journey && n.id !== from.captain && n.title !== 'Marshal').sort((a, b) => b.rank - a.rank || lvOf(b) - lvOf(a));
        if (men.length < 3) continue;
        const lead = men[0], force = [lead, ...men.slice(1).filter(() => rng.chance(0.7)).slice(0, rng.int(3, 6))];
        const j = ECHO.Sim.startJourney(world, { kind: 'army', npcs: force.map(n => n.id), from: from.id, to: to.id, speed: 2.6, army: { faction: f.id, target: to.id, type: 'patrol', commander: lead.id } });
        if (j && ECHO.Chronicle && rng.chance(0.3)) ECHO.Chronicle.add(world, { text: `${P().fullTitle(world, lead)} marched a column of ${force.length} soldiers of ${f.short} from ${from.name} to ${to.name}.`, kind: 'war', importance: 0, sid: from.id, npcs: [lead.id] });
      }
    },
    patrolArrive(world, j) {
      const soldiers = j.npcs.map(id => world.npcs[id]).filter(n => n && n.status === 'alive');
      ECHO.Politics.armyGoHome(world, soldiers, ECHO.Sim.settlement(world, j.to));
    },

    // ------------------------------------------------------------ battles
    // The attackers' strength: each soldier's worth, their command, their kingdom's arms.
    hostPower(world, j) {
      const f = world.factions[j.army.faction], cmd = world.npcs[j.army.commander];
      let atk = 0;
      for (const id of j.npcs) { const n = world.npcs[id]; if (n && n.status === 'alive') atk += Mil.power(n); }
      atk *= 1 + (f && f.tech ? f.tech.era * 0.08 : 0);
      if (cmd && cmd.status === 'alive') atk *= 1 + Math.min(0.3, lvOf(cmd) / 300) + (cmd.title === 'Marshal' ? 0.1 : 0);
      return atk;
    },
    log(world, b) {
      const S = Mil.st(world);
      S.battles.push(Object.assign({ d: world.day }, b));
      if (S.battles.length > 40) S.battles.splice(0, S.battles.length - 40);
    },

    // ------------------------------------------------------------ the board: lord and garrison
    html(game, s) {
      const world = game.world, esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      const f = world.factions[s.faction], pl = game.pl, me = ECHO.Prowess ? ECHO.Prowess.level(pl) : 1;
      if (!Mil.armed(world, s)) return `<p class="dim">${esc(s.name)} keeps no garrison${f ? ' — ' + esc(f.name) + ' keeps none' : ''}.</p>`;
      const who = n => n ? `<b>${esc(P().fullTitle(world, n))}</b> <span class="lvtag" style="color:${Mil.lvCol(lvOf(n), me)}">Lv ${lvOf(n)}</span>` : '<span class="dim">none</span>';
      const sol = Mil.soldiers(world, s), want = Mil.target(world, s), T = TIER[Mil.tier(world, s)];
      const lvs = sol.map(lvOf), avg = lvs.length ? Math.round(lvs.reduce((a, b) => a + b, 0) / lvs.length) : 0, top = lvs.length ? Math.max(...lvs) : 0;
      const ranks = { 3: 0, 2: 0, 1: 0, 0: 0 }; for (const n of sol) ranks[Math.min(3, n.rank || 0)]++;
      const stars = Mil.stars(world, s), ruler = Mil.ruler(world, s), kr = f && f.ruler && world.npcs[f.ruler];
      const wars = f && f.atWar ? Object.keys(f.atWar).map(k => world.factions[k]).filter(Boolean) : [];
      const hosts = (world.journeys || []).filter(j => j.kind === 'army' && j.army && (j.army.faction === s.faction || (world.settlements.find(x => x.id === j.army.target) || {}).faction === s.faction));
      const hostRow = j => {
        const af = world.factions[j.army.faction], cmd = world.npcs[j.army.commander], to = ECHO.Sim.settlement(world, j.army.target), from = ECHO.Sim.settlement(world, j.from);
        const n = j.npcs.filter(id => world.npcs[id] && world.npcs[id].status === 'alive').length;
        const enemy = af && af.id !== s.faction;
        return `<div class="${enemy ? 'mil-host enemy' : 'mil-host'}">${enemy ? '⚔' : '⚑'} <b>${n}</b> soldiers of ${esc(af ? af.short : '?')}${cmd ? ` under ${esc(P().fullTitle(world, cmd))} (Lv ${lvOf(cmd)})` : ''} — ${j.army.type === 'war' ? `marching on <b>${esc(to ? to.name : '?')}</b>` : `on patrol, ${esc(from ? from.name : '?')} to ${esc(to ? to.name : '?')}`}${enemy ? ' <span class="ember">(the enemy)</span>' : ''}</div>`;
      };
      const btl = Mil.st(world).battles.filter(b => b.sid === s.id || b.att === s.faction || b.def === s.faction).slice(-5).reverse();
      const strongest = P().alive(world).filter(n => n.faction === s.faction && n.loc && !n.ng && Mil.fighter(n)).sort((a, b) => lvOf(b) - lvOf(a)).slice(0, 5);
      return `<div class="mil">
        <div class="card mil-head"><h4>${esc(s.name)} · ${esc(T.name)} of ${esc(f ? f.short : '')}</h4>
          <div>${f && f.capital === s.id ? `Seat of ${who(kr)}` : `Held for ${who(kr)} by ${who(ruler)}`}</div>
          <div>Captain of the garrison: ${who(Mil.captain(world, s))}</div>
          ${f ? `<div>Marshal of ${esc(f.short)}: ${who(Mil.marshal(world, f))} · Champion: ${who(Mil.champion(world, f))}</div>` : ''}
        </div>
        <div class="card"><h4>The garrison <span class="mil-stars">${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}</span></h4>
          <div><b>${sol.length}</b> soldiers${sol.length < want ? ` <span class="dim">(recruiting toward ${want})</span>` : ''} · ${ranks[3] ? `${ranks[3]} marshal · ` : ''}${ranks[2]} captain${ranks[2] === 1 ? '' : 's'} · ${ranks[1]} sergeant${ranks[1] === 1 ? '' : 's'} · ${ranks[0]} in the ranks</div>
          <div>Their levels: about <b>${avg}</b>, the best <b>${top}</b> <span class="dim">(you are ${me})</span></div>
          <div>Defences: ${s.works && s.works.walls ? 'a palisade' : '<span class="dim">no walls</span>'} · ${s.works && s.works.watch ? 'a watchtower' : '<span class="dim">no tower</span>'} · strength <b>${Math.round(Mil.strength(world, s))}</b></div>
          ${wars.length ? `<div class="ember">At war with ${wars.map(w => esc(w.name)).join(', ')}.</div>` : '<div class="dim">At peace.</div>'}
        </div>
        ${hosts.length ? `<div class="card"><h4>Armies on the road</h4>${hosts.map(hostRow).join('')}</div>` : ''}
        ${strongest.length ? `<div class="card"><h4>The strongest of ${esc(f ? f.short : '')}</h4>${strongest.map(n => `<div>${who(n)}${n.home && ECHO.Sim.settlement(world, n.home) ? ` <span class="dim">· of ${esc(ECHO.Sim.settlement(world, n.home).name)}${n.adv && n.adv.status !== 'retired' ? ', of the Guild' : ''}</span>` : ''}</div>`).join('')}</div>` : ''}
        ${btl.length ? `<div class="card"><h4>Battles</h4>${btl.map(b => `<div><span class="dim">Day ${b.d}:</span> ${esc(b.text)}</div>`).join('')}</div>` : ''}
      </div>`;
    },
    // the journal's Realm page: every crown's armies, side by side
    realmHtml(game) {
      const world = game.world, esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      const me = ECHO.Prowess ? ECHO.Prowess.level(game.pl) : 1;
      const who = n => n ? `${esc(P().fullTitle(world, n))} <span class="lvtag" style="color:${Mil.lvCol(lvOf(n), me)}">Lv ${lvOf(n)}</span>` : '<span class="dim">none</span>';
      let h = '<h3 class="gold">The armies of the realm</h3>';
      for (const f of Object.values(world.factions)) {
        if (f.fallen || !(f.type === 'kingdom' || f.type === 'order')) continue;
        const towns = world.settlements.filter(s => s.faction === f.id);
        const all = P().alive(world).filter(n => n.faction === f.id && n.prof === 'guard' && !n.ng);
        const field = (world.journeys || []).filter(j => j.kind === 'army' && j.army && j.army.faction === f.id);
        const wars = Object.keys(f.atWar || {}).map(k => world.factions[k]).filter(Boolean);
        const avg = all.length ? Math.round(all.reduce((a, n) => a + lvOf(n), 0) / all.length) : 0;
        h += `<div class="card mil-realm"><h4>${esc(f.name)} — ${all.length} soldiers <span class="dim">(about level ${avg})</span></h4>
          <div>Marshal: ${who(Mil.marshal(world, f))} · Champion: ${who(Mil.champion(world, f))}</div>
          <div class="mil-towns">${towns.map(s => `<span>${esc(s.name)} <span class="dim">${esc(TIER[Mil.tier(world, s)].name.toLowerCase())}</span> ${Mil.soldiers(world, s).length} <span class="mil-stars">${'★'.repeat(Mil.stars(world, s))}</span></span>`).join(' · ')}</div>
          ${field.length ? `<div>${field.map(j => { const to = ECHO.Sim.settlement(world, j.army.target); const c = world.npcs[j.army.commander]; return `${j.army.type === 'war' ? '⚔ A host' : '⚑ A column'} of ${j.npcs.length}${c ? ' under ' + esc(P().fullTitle(world, c)) : ''} ${j.army.type === 'war' ? 'marching on' : 'on the road to'} ${esc(to ? to.name : '?')}`; }).join('<br>')}</div>` : ''}
          ${wars.length ? `<div class="ember">At war with ${wars.map(w => esc(w.name)).join(', ')} — ${f.casualties || 0} of its people dead in it so far.</div>` : '<div class="dim">At peace.</div>'}</div>`;
      }
      const b = Mil.st(world).battles.slice(-6).reverse();
      if (b.length) h += `<div class="card"><h4>Battles</h4>${b.map(x => `<div><span class="dim">Day ${x.d}:</span> ${esc(x.text)}</div>`).join('')}</div>`;
      return h;
    },
    lvCol(L, me) { const d = ECHO.Prowess ? ECHO.Prowess.diff(L, me) : null; return d ? d.color : '#f0e6d0'; }
  };
})();
