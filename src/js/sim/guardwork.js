// The National Guard at work in the realm, not only at its gates.
//
// • Auxiliaries: the Guard takes on the best soldiers and town guards of the
//   realm as auxiliaries. They keep their towns, wear the Guard's blue, train
//   harder than anyone (they climb further and faster), and are the hands of the
//   Guard on this side of the gates: they ride patrol on the roads and hold
//   garrisons. The best of them, reaching level 150, take the full oath.
// • Garrisons: auxiliaries are posted to the towns in most danger — near a named
//   monster's claimed land, a recent raid, a loose beast from beyond the gates,
//   a hungry titan — or to any town that pays the Guard for one. A garrison
//   fights off raids, holds the walls when a titan falls on the town, and drills
//   the town's own guard while it is there.
// • Breaches: now and then something slips through a gate — a beast of level 150
//   and more — and makes for the nearest town. A warden goes after it with
//   auxiliaries; most are run down in a day or three, some reach a town first.
// • Culls: a named monster that outgrows the realm by too far, or gathers too
//   much power, is hunted down by a warden before it can empty a province.
// • Contracts: the Guard posts work for anyone strong enough: the head of a
//   named monster for coin. Sworn members get orders (breaches too), earn merit
//   for the Guard's armoury, and draw a weekly wage.
(function () {
  const { U } = ECHO;
  const P = () => ECHO.People, G = () => ECHO.Gates, Pw = () => ECHO.Powers;
  const AUX_PROF = new Set(['guard', 'soldier']);

  const GW = ECHO.GuardWork = {
    st(world) {
      const S = G().ensure(world);
      if (!S) return null;
      const g = S.guard;
      g.aux = g.aux || []; g.garrisons = g.garrisons || {}; g.breaches = g.breaches || []; g.log = g.log || []; g.bn = g.bn || 0;
      return g;
    },
    plv(world) { return Pw() ? Pw().plLv(world) : 1; },
    era(world) { return Pw() ? Pw().era(world, GW.plv(world)) : 1; },
    lvOf(n) { return ECHO.Delvers ? ECHO.Delvers.lv(n) : (n.lv || 1); },
    tell(world, text, o = {}) {
      const g = GW.st(world);
      if (g) { g.log.push({ d: world.day, t: text }); if (g.log.length > 40) g.log.splice(0, g.log.length - 40); }
      ECHO.Chronicle.add(world, { text, kind: 'realm', importance: o.importance != null ? o.importance : 1, sid: o.sid, x: o.x, y: o.y, npcs: o.npcs || [], tags: ['guard'] });
    },
    auxList(world) { const g = GW.st(world); return g ? g.aux.map(id => world.npcs[id]).filter(n => n && n.status === 'alive' && n.ngAux) : []; },
    isAux(n) { return !!(n && n.ngAux); },
    garrisonOf(world, sid) { const g = GW.st(world), r = g && g.garrisons[sid]; const n = r && world.npcs[r.id]; return n && n.status === 'alive' ? n : null; },
    openBreaches(world) { const g = GW.st(world); return g ? g.breaches.filter(b => !b.over) : []; },
    breach(world, id) { const g = GW.st(world); return g ? g.breaches.find(b => b.id === id) || null : null; },
    liveNem(r) { return !!(ECHO.Growth && ECHO.Growth.spawned && ECHO.Growth.spawned.has(r.id)); },
    beastName(kind) { const D = ECHO.Monsters && ECHO.Monsters.DEFS[kind]; return D ? D.name.toLowerCase() : kind; },
    aBeast(kind, cap) { const n = GW.beastName(kind), a = /^[aeiou]/i.test(n) ? 'an' : 'a'; return `${cap ? U.cap(a) : a} ${n}`; },

    // ------------------------------------------------------------ every day
    dailyTick(world, rng) {
      const g = GW.st(world);
      if (!g || !world.player) return;
      GW.recruit(world, g, rng);
      GW.garrison(world, g, rng);
      GW.breaches(world, g, rng);
      GW.cull(world, g, rng);
      GW.pay(world);
      GW.contracts(world);
    },

    // ---- auxiliaries: the best soldiers and guards of the realm
    want(world) { return Math.min(24, 4 + Math.floor(world.day / 15)); },
    recruit(world, g, rng) {
      g.aux = g.aux.filter(id => { const n = world.npcs[id]; if (!n || n.status !== 'alive' || !n.ngAux) return false; if (n.ng || n.ngTrainee) { delete n.ngAux; return false; } return true; });
      const need = GW.want(world) - g.aux.length;
      if (need <= 0) return;
      const era = GW.era(world), floor = Math.max(5, Math.round(era * 0.3)), comp = world.player && world.player.companion;
      const cands = [];
      for (const id in world.npcs) {
        const n = world.npcs[id];
        if (n.status !== 'alive' || !AUX_PROF.has(n.prof) || n.ng || n.ngTrainee || n.ngAux || n.rival || n.title || n.id === comp || !n.home || !n.loc) continue;
        const s = ECHO.Sim.settlement(world, n.home);
        if (!s || s.faction === 'ashfang' || (world.factions[s.faction] && world.factions[s.faction].type === 'bandits')) continue;
        const age = P().age(world, n);
        if (age < 18 || age > 46 || (n.skill.fight || 0) < 25 || P().has(n, 'cowardly')) continue;
        const lv = GW.lvOf(n);
        if (lv < floor) continue;
        cands.push({ n, s, sc: lv + (P().has(n, 'brave') || P().has(n, 'loyal') ? 4 : 0) + rng.next() * 3 });
      }
      cands.sort((a, b) => b.sc - a.sc);
      const took = [];
      for (const c of cands.slice(0, Math.min(3, need))) {
        // (a town keeps at least one guard of its own)
        if (P().residents(world, c.s).filter(x => x.status === 'alive' && AUX_PROF.has(x.prof) && !x.ngAux).length < 2) continue;
        c.n.ngAux = { since: world.day, home: c.n.home };
        g.aux.push(c.n.id); took.push(c);
        c.n.renown = (c.n.renown || 0) + 3;
        P().remember(world, c.n, 'was taken into the National Guard as an auxiliary', 'pride', null, 3);
      }
      if (took.length) GW.tell(world, took.length === 1 ? `${P().name(took[0].n)} of ${took[0].s.name} was taken into the National Guard as an auxiliary.` : `The National Guard took ${took.map(c => `${P().name(c.n)} of ${c.s.name}`).join(', ')} as auxiliaries.`, { npcs: took.map(c => c.n.id) });
    },

    // ---- garrisons for the towns in danger
    threat(world, s, g) {
      if (s.faction === 'ashfang' || (world.factions[s.faction] && world.factions[s.faction].type === 'bandits')) return 0;
      let t = 0;
      if (Pw()) for (const r of Pw().alive(world)) {
        if (!r.abroad) continue;
        const d = U.dist(r.x, r.y, s.x, s.y);
        if (d < 45) t += (r.infl + r.lv * 0.4) / (1 + d / 12);
        if (r.claim != null) { const reg = ECHO.World.regionAt(world, s.x, s.y); if (reg && reg.id === r.claim) t += 15; }
      }
      if (s.raidedDay != null && world.day - s.raidedDay < 25) t += 22;
      for (const b of g.breaches) if (!b.over && (b.town === s.id || U.dist(b.x, b.y, s.x, s.y) < 30)) t += 50;
      if (ECHO.Titans && world.titans) for (const ti of world.titans.list || []) if (ti.alive && !ti.bound && U.dist(ti.x, ti.y, s.x, s.y) < 90) t += (ti.hunger || 0) * 3 + Math.min(20, (ti.lvl || 0) * 0.02);
      if (s.guardAsked && world.day - s.guardAsked < 60) t += 200;
      return t;
    },
    garrison(world, g, rng) {
      // postings run their course: those whose town is safe again go home
      for (const sid in g.garrisons) {
        const r = g.garrisons[sid], n = world.npcs[r.id], s = ECHO.Sim.settlement(world, sid);
        if (!n || n.status !== 'alive' || !n.ngAux || !s) { delete g.garrisons[sid]; continue; }
        if (world.day - r.since >= 45 && !(s.guardAsked && world.day - s.guardAsked < 60) && GW.threat(world, s, g) < 15) GW.relieve(world, g, sid, true);
      }
      // a garrison drills the town's guard while it is there
      for (const sid in g.garrisons) {
        if (world.day % 5 !== 0) continue;
        const s = ECHO.Sim.settlement(world, sid); if (!s) continue;
        for (const n of P().residents(world, s)) if (n.status === 'alive' && AUX_PROF.has(n.prof) && !n.ngAux) { const lv = GW.lvOf(n); if (lv < GW.era(world) * 0.6) n.lv = lv + 1; }
      }
      const aux = GW.auxList(world), posted = new Set(Object.values(g.garrisons).map(r => r.id));
      const free = aux.filter(n => !posted.has(n.id) && !n.journey && n.loc);
      const slots = Math.min(8, Math.floor(aux.length / 2)) - Object.keys(g.garrisons).length;
      if (slots <= 0 || !free.length) return;
      const ranked = world.settlements.filter(s => !g.garrisons[s.id]).map(s => ({ s, t: GW.threat(world, s, g) })).filter(x => x.t >= 18).sort((a, b) => b.t - a.t);
      let n = 0;
      for (const { s, t } of ranked) {
        if (n >= slots || !free.length) break;
        // one of the realm's own if there is one; never into a town at war with theirs
        const F = world.factions[s.faction];
        const ok = free.filter(a => a.faction === s.faction || !(F && F.atWar && F.atWar[a.faction]));
        const far = a => { const h = ECHO.Sim.settlement(world, a.home); return h ? U.dist(h.x, h.y, s.x, s.y) : 9999; };   // (a home that is gone: as far as can be)
        const pick = ok.sort((a, b) => (b.faction === s.faction) - (a.faction === s.faction) || far(a) - far(b))[0];
        if (!pick) continue;
        free.splice(free.indexOf(pick), 1);
        GW.post(world, g, pick, s, t >= 200 ? 'asked' : 'danger');
        n++;
      }
    },
    post(world, g, n, s, why) {
      g.garrisons[s.id] = { id: n.id, since: world.day, why };
      const from = ECHO.Sim.settlement(world, n.home);
      if (from && from.id !== s.id) {
        from.residents = from.residents.filter(x => x !== n.id);
        if (!s.residents.includes(n.id)) s.residents.push(n.id);
        n.home = s.id; n.loc = s.id;
      }
      GW.tell(world, `The National Guard posted ${P().name(n)} to hold ${s.name}${why === 'asked' ? ', at the town\'s asking' : ' — the town is in danger'}.`, { sid: s.id, npcs: [n.id] });
    },
    relieve(world, g, sid, quiet) {
      const r = g.garrisons[sid]; delete g.garrisons[sid];
      const n = r && world.npcs[r.id], s = ECHO.Sim.settlement(world, sid);
      if (!n || n.status !== 'alive') return;
      const home = n.ngAux && ECHO.Sim.settlement(world, n.ngAux.home);
      if (home && s && home.id !== s.id && !n.journey) {
        s.residents = s.residents.filter(x => x !== n.id);
        if (!home.residents.includes(n.id)) home.residents.push(n.id);
        n.home = home.id; n.loc = home.id;
      }
      if (!quiet && s) GW.tell(world, `${P().name(n)} of the National Guard has left ${s.name}; the town is safe again.`, { sid });
    },
    // a town pays for a garrison
    ask(world, s) {
      const g = GW.st(world);
      if (!g) return 'The Guard has no one to send.';
      if (g.garrisons[s.id]) return 'The Guard already holds this town.';
      s.guardAsked = world.day;
      GW.garrison(world, g, new ECHO.RNG((world.day * 7919 + s.x * 31) >>> 0));
      if (g.garrisons[s.id]) return null;
      // nobody free: the Guard takes one of the town's own
      const own = P().residents(world, s).filter(n => n.status === 'alive' && AUX_PROF.has(n.prof) && !n.ngAux && !n.ng && !n.ngTrainee && !n.title && n.id !== (world.player && world.player.companion)).sort((a, b) => GW.lvOf(b) - GW.lvOf(a))[0];
      if (!own) { s.guardAsked = null; return 'The Guard has no one to send just now.'; }
      own.ngAux = { since: world.day, home: s.id }; g.aux.push(own.id);
      own.lv = Math.max(GW.lvOf(own), Math.round(GW.era(world) * 0.6));
      GW.post(world, g, own, s, 'asked');
      return null;
    },
    askCost(world, s) { return Math.round(120 + GW.era(world) * 8 + (s.residents || []).length * 1.5); },

    // ---- breaches: things that slip through the gates
    breaches(world, g, rng) {
      const gates = G().list(world);
      if (!gates.length) return;
      const open = g.breaches.filter(b => !b.over);
      g.breaches = g.breaches.filter(b => !b.over || world.day - b.over < 30);
      if (world.day >= 15 && open.length < 2) for (const gt of gates) if (rng.chance(1 / 42)) { GW.newBreach(world, g, gt, rng); break; }
      for (const b of g.breaches) {
        if (b.over || b.live) continue;    // (while you are near it, it is fought where you can see)
        const age = world.day - b.day, s = ECHO.Sim.settlement(world, b.town);
        // it makes for the town
        if (s) { const d = U.dist(b.x, b.y, s.x, s.y); if (d > 2) { const k = Math.min(1, 4.5 / d); b.x += (s.x - b.x) * k; b.y += (s.y - b.y) * k; } }
        const atTown = s && U.dist(b.x, b.y, s.x, s.y) <= 2.5;
        const gar = s && GW.garrisonOf(world, s.id);
        // the Guard on its heels
        if (age >= 1 && rng.chance(Math.min(0.95, 0.3 + age * 0.15 + (atTown && gar ? 0.2 : 0)))) { GW.endBreach(world, g, b, null, rng); continue; }
        if (atTown) {
          const held = gar && rng.chance(0.55);
          const res = P().residents(world, s).filter(n => n.status === 'alive' && !n.ng && n.prof !== 'ruler');
          const dead = held ? [] : res.sort(() => rng.next() - 0.5).slice(0, rng.int(1, 3));
          for (const n of dead) P().kill(world, n, `killed by ${GW.aBeast(b.kind)} out of ${b.gateName}`);
          s.prosperity = Math.max(0, (s.prosperity || 50) - (held ? 3 : 8)); s.unrest = (s.unrest || 0) + (held ? 1 : 5);
          GW.tell(world, held ? `${GW.aBeast(b.kind, true)} out of ${b.gateName} came against ${s.name}, and ${P().name(gar)} of the Guard held it at the edge of town.` : `${GW.aBeast(b.kind, true)} out of ${b.gateName} fell on ${s.name}. ${dead.map(n => P().name(n)).join(', ')} ${dead.length > 1 ? 'are' : 'is'} dead.`, { importance: held ? 1 : 2, sid: s.id, npcs: dead.map(n => n.id) });
        }
      }
    },
    newBreach(world, g, gt, rng) {
      const th = G().THEMES[gt.theme];
      const s = ECHO.World.nearestSettlement ? ECHO.World.nearestSettlement(world, gt.x, gt.y, x => x.faction !== 'ashfang') : world.settlements[0];
      if (!s) return null;
      const d = U.dist(gt.x, gt.y, s.x, s.y) || 1, k = Math.min(0.6, (G().R_HURT + 5) / d);
      const kind = th.roster[rng.int(0, th.roster.length - 1)];
      const ms = G().atGate(world, gt), w = ms[rng.int(0, Math.max(0, ms.length - 1))];
      const b = { id: 'br' + (++g.bn), gate: gt.id, gateName: gt.name, kind, lv: G().MIN + rng.int(0, 70), x: gt.x + (s.x - gt.x) * k, y: gt.y + (s.y - gt.y) * k, day: world.day, town: s.id, warden: w ? w.id : null, hp: 1 };
      g.breaches.push(b);
      GW.tell(world, `Something got through ${gt.name}: ${GW.aBeast(kind)} of level ${b.lv} is loose and heading for ${s.name}.${w ? ` ${P().name(w)} ${w.ng.title} has gone after it.` : ''}`, { importance: 2, x: b.x, y: b.y });
      return b;
    },
    // over: by the Guard (who), by you, or by someone else
    endBreach(world, g, b, by, rng) {
      if (b.over) return;
      b.over = world.day; b.by = by || 'guard';
      const w = b.warden && world.npcs[b.warden];
      if (by === 'you') { GW.tell(world, `${world.player.first} ${world.player.last} killed the ${GW.beastName(b.kind)} that got out of ${b.gateName}.`, { importance: 2, x: b.x, y: b.y }); return; }
      // the auxiliaries who rode with the warden are blooded
      const near = GW.auxList(world).filter(n => { const s = ECHO.Sim.settlement(world, n.home); return s && U.dist(s.x, s.y, b.x, b.y) < 60; }).slice(0, 2);
      for (const n of near) { if (GW.lvOf(n) < GW.era(world) * 0.95) n.lv = GW.lvOf(n) + 2 + (rng ? rng.int(0, 3) : 1); n.renown = (n.renown || 0) + 4; }
      GW.tell(world, `${w ? `${P().name(w)} ${w.ng.title}` : 'The National Guard'}${near.length ? ` and ${near.map(n => P().name(n)).join(' and ')}` : ''} ran down the ${GW.beastName(b.kind)} that got out of ${b.gateName}, and killed it.`, { x: b.x, y: b.y, npcs: near.map(n => n.id) });
    },

    // ---- culls: the named that grow too strong for the realm
    dangerous(world, r) {
      const era = GW.era(world), plv = GW.plv(world);
      if (r.met > 0 || r.amb === 'vengeance') return r.lv > plv * 1.5 + 12;   // (yours to deal with — unless it is far past you)
      return r.lv > era * 1.35 + 8 || r.infl >= 45 || /Overlord/.test(r.title || '');
    },
    cull(world, g, rng) {
      if (!Pw()) return;
      const ws = G().members(world);
      if (!ws.length) return;
      for (const r of Pw().alive(world)) {
        if (!GW.dangerous(world, r) || GW.liveNem(r) || !rng.chance(0.07)) continue;
        const w = ws[rng.int(0, ws.length - 1)];
        Pw().die(world, r, `slain by ${P().name(w)} ${w.ng.title}`, `${Pw().short(r)}${r.title ? ', ' + r.title + ',' : ''} grew too strong to be let be. ${P().name(w)} ${w.ng.title} of the National Guard came down from ${G().list(world)[w.ng.gate] ? G().list(world)[w.ng.gate].name : 'the gates'} and killed it.`);
        GW.tell(world, `The National Guard culled ${Pw().short(r)} (level ${r.lv}) before it could empty a province.`, { x: r.x, y: r.y, npcs: [w.id] });
      }
    },

    // ---- your place in it
    wage(world, pl) { return Math.round(180 + ECHO.Prowess.level(pl) * 1.6); },
    pay(world) {
      const pl = world.player, r = pl && pl.guard;
      if (!r) return;
      if (r.paidDay == null) r.paidDay = world.day;
      if (world.day - r.paidDay >= 7) { const w = GW.wage(world, pl); pl.gold = (pl.gold || 0) + w; r.paidDay = world.day; r.lastWage = { d: world.day, n: w }; }
    },
    // the work the Guard offers you
    offers(world, pl) {
      const out = [], plv = ECHO.Prowess.level(pl), member = !!pl.guard;
      if (member) for (const b of GW.openBreaches(world)) out.push({ kind: 'breach', id: b.id, label: `Run down the ${GW.beastName(b.kind)} (level ${b.lv}) out of ${b.gateName}`, gold: 220 + b.lv * 2, merit: 3, x: b.x, y: b.y });
      if (Pw()) for (const r of Pw().alive(world)) {
        if (!r.abroad || r.lv > plv + 10 || r.lv < Math.max(3, plv * 0.45) || GW.liveNem(r)) continue;
        out.push({ kind: 'nem', id: r.id, label: `The head of ${Pw().label(r)} (level ${r.lv})`, gold: Math.round(70 + r.lv * 11 + r.infl * 3), merit: member ? 2 : 0, x: r.x, y: r.y });
      }
      return out.sort((a, b) => (a.kind === 'breach' ? 0 : 1) - (b.kind === 'breach' ? 0 : 1) || U.dist(a.x, a.y, pl.x, pl.y) - U.dist(b.x, b.y, pl.x, pl.y)).slice(0, 4);
    },
    take(world, pl, o) { pl.gcontract = { kind: o.kind, id: o.id, label: o.label, gold: o.gold, merit: o.merit, day: world.day }; return pl.gcontract; },
    target(world, c) {
      if (!c) return null;
      if (c.kind === 'breach') { const b = GW.breach(world, c.id); return b && !b.over ? b : null; }
      const r = Pw() && Pw().byId(world, c.id); return r && r.alive ? r : null;
    },
    // done by your hand
    fulfil(world, pl, kind, id) {
      const c = pl.gcontract;
      if (!c || c.kind !== kind || c.id !== id) return null;
      pl.gold = (pl.gold || 0) + c.gold; pl.renown = (pl.renown || 0) + 3;
      if (pl.guard && c.merit) pl.guard.merit = (pl.guard.merit || 0) + c.merit;
      pl.guardDone = (pl.guardDone || 0) + 1;
      pl.gcontract = null;
      return c;
    },
    // lapsed: it died some other way, or it took too long
    contracts(world) {
      const pl = world.player, c = pl && pl.gcontract;
      if (!c) return;
      if (!GW.target(world, c) || world.day - c.day > 25) { pl.gcontract = null; pl.gcontractLapsed = c.label; }
    },
    // the armoury: what merit buys
    ARMOURY: [['sword', 'A Guard blade'], ['bow', 'A Guard bow'], ['armor', 'Guard plate']],
    armouryCost: 4,
    requisition(world, pl, kind) {
      const r = pl.guard;
      if (!r) return { error: 'Only the sworn draw from the armoury.' };
      if ((r.merit || 0) < GW.armouryCost) return { error: `That takes ${GW.armouryCost} merit. You have ${r.merit || 0}.` };
      r.merit -= GW.armouryCost;
      const rng = new ECHO.RNG((Math.random() * 4294967295) >>> 0);
      const it = ECHO.Gear.make(world, rng, kind, ECHO.Prowess.level(pl), 'legendary', '');
      it.plus = 3; it.holder = 'player'; it.history = [{ d: world.day, t: 'drawn from the armoury of the National Guard' }];
      pl.items.push(it.id);
      return { item: it };
    }
  };
})();
