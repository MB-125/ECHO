// The National Guard where you can see it: patrols of auxiliaries on the roads,
// wardens coming down from the gates to run down a loose beast, the Guard's
// garrisons in the towns, their work and news, contracts for you, orders,
// merit, the armoury and a wage for the sworn, and the Journal's page on it all.
(function () {
  const { U } = ECHO;
  const UI = () => ECHO.UI;
  const P = () => ECHO.People, Gt = () => ECHO.Gates, GW = () => ECHO.GuardWork, Gd = () => ECHO.Guard;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const CAPE = '#24386e';

  const GF = ECHO.GuardField = {
    t: 0, patT: 45, live: new Map(),
    reset() { GF.t = 0; GF.patT = 45; GF.live = new Map(); },

    update(game, dt) {
      GF.patT -= dt;
      GF.t -= dt;
      if (GF.t > 0) return;
      GF.t = 0.5;
      const world = game.world, pe = game.pe, pl = game.pl;
      if (!pe || !world.gates || !GW()) return;
      const g = GW().st(world);
      if (!g) return;
      // ---- a wage, a lapsed contract
      if (pl.guard && pl.guard.lastWage && pl.guard.lastWage.d !== pl.guard._wageSeen) { pl.guard._wageSeen = pl.guard.lastWage.d; UI().toast(`Your wage from the National Guard: ${pl.guard.lastWage.n} crowns.`, 'info', 5); if (ECHO.Sfx) ECHO.Sfx.play('coin'); }
      // (the way to a contract's quarry follows it as it moves)
      if (pl.gcontract && pl._gmark && pl.tracked === pl._gmark && (GF._mkT = (GF._mkT || 0) - 0.5) <= 0) {
        GF._mkT = 4;
        const t = GW().target(world, pl.gcontract);
        if (t) { const mk = `mark:${t.x.toFixed(1)}:${t.y.toFixed(1)}:${pl.gcontract.kind === 'breach' ? 'the loose beast' : 'the Guard\'s quarry'}`; pl.tracked = pl._gmark = mk; }
      }
      if (pl.gcontractLapsed) { UI().toast(`The Guard's contract (${pl.gcontractLapsed}) has lapsed.`, 'warn', 5); pl.gcontractLapsed = null; }
      // ---- the beasts that got out, while you are near them
      for (const [id, e] of GF.live) {
        const b = GW().breach(world, id);
        if (!b) { GF.live.delete(id); continue; }
        if (!e.dead && game.ents.includes(e)) { b.hp = e.hp / Math.max(1, e.maxHp); if (e.x < 9000) { b.x = e.x; b.y = e.y; } continue; }
        GF.live.delete(id); b.live = false;
        if (e.hp <= 0) GF.beastDown(game, b, e);
      }
      for (const b of g.breaches) if (b.live && !GF.live.has(b.id)) b.live = false;   // (a world loaded mid-fight)
      if (ECHO.Interior.cur) return;
      for (const b of GW().openBreaches(world)) {
        if (b.live || GF.live.has(b.id)) continue;
        const d = U.dist(b.x, b.y, pe.x, pe.y);
        if (d > 40) continue;
        GF.spawnBreach(game, b, d);
      }
      // ---- patrols on the roads
      if (GF.patT <= 0) { GF.patT = 70 + Math.random() * 80; GF.patrol(game); }
    },

    // ------------------------------------------------------------ a loose beast
    spawnBreach(game, b, d) {
      const world = game.world, pe = game.pe, pl = game.pl, lv = ECHO.Prowess.level(pl);
      const k = d > 22 ? 22 / d : 1, sp = ECHO.Ent.freeSpot(world, pe.x + (b.x - pe.x) * k, pe.y + (b.y - pe.y) * k, 6);
      if (!sp) return;
      if (ECHO.Growth) ECHO.Growth._noAdapt = true;
      let e;
      try { e = ECHO.Monsters.make(game, b.kind, sp.x, sp.y, b.lv, { noElite: true }); } finally { if (ECHO.Growth) ECHO.Growth._noAdapt = false; }
      if (!e) return;
      e.breach = b.id; e.hp = Math.max(1, Math.round(e.maxHp * (b.hp || 1))); e.label = `${ECHO.Monsters.DEFS[b.kind] ? ECHO.Monsters.DEFS[b.kind].name : b.kind} out of ${b.gateName}`;
      e.home = { x: sp.x, y: sp.y };
      game.addEnt(e);
      GF.live.set(b.id, e); b.live = true;
      // the warden on its trail
      const w = b.warden && world.npcs[b.warden], gate = Gt().byId(world, b.gate);
      if (w && w.status === 'alive' && !game.ents.some(o => o.npcId === w.id && !o.dead)) {
        const ga = gate ? Math.atan2(gate.y - sp.y, gate.x - sp.x) : Math.random() * 6.28;
        const at = ECHO.Ent.freeSpot(world, sp.x + Math.cos(ga) * 13, sp.y + Math.sin(ga) * 13, 6) || ECHO.Ent.freeSpot(world, sp.x + 8, sp.y, 8);
        if (at) { const we = Gd().spawn(game, w, at, null); we.huntB = b.id; we.post = null; }
      }
      const name = ECHO.GuardWork.beastName(b.kind);
      if (lv < Gt().MIN) { UI().banner(`${GW().aBeast(b.kind, true)} out of ${b.gateName}`, `Level ${b.lv} — keep clear: the National Guard is on its trail`, true); UI().toast(`Something that got through ${b.gateName} is near: ${GW().aBeast(b.kind)} of level ${b.lv}. It would kill you. ${w ? `${w.first} ${w.ng.title} is coming for it.` : 'The Guard is coming for it.'} Keep away.`, 'warn', 7); }
      else UI().toast(`${GW().aBeast(b.kind, true)} of level ${b.lv} out of ${b.gateName} is near${pl.gcontract && pl.gcontract.id === b.id ? ' — the one you were sent for' : ''}. ${w ? `${w.first} ${w.ng.title} is on its trail.` : ''}`, 'legend', 6);
    },
    beastDown(game, b, e) {
      const world = game.world, pl = game.pl, g = GW().st(world);
      const yours = (e._pDmg || 0) >= e.maxHp * 0.3;
      GW().endBreach(world, g, b, yours ? 'you' : null);
      if (!yours) return;
      pl.renown = (pl.renown || 0) + 4;
      if (pl.guard) pl.guard.merit = (pl.guard.merit || 0) + 1;
      const c = GW().fulfil(world, pl, 'breach', b.id);
      UI().banner(`The ${GW().beastName(b.kind)} is dead`, `It got out of ${b.gateName}. It will not reach ${(ECHO.Sim.settlement(world, b.town) || {}).name || 'the town'}.`, true);
      if (c) UI().toast(`The Guard's orders are carried out: +${c.gold} crowns, +${c.merit + 1} merit.`, 'legend', 6);
      else if (pl.guard) UI().toast('+1 merit with the National Guard.', 'legend', 4);
    },
    // a warden running a loose beast down
    hunt(game, e, npc, dt) {
      const world = game.world, pe = game.pe, pl = game.pl, D = Gt().def(npc);
      const beast = game.ents.find(o => o.breach === e.huntB && !o.dead);
      if (!beast) {
        if (!e._leaveT) { e._leaveT = game.time + 7; e.say = pick(['It is done.', 'Back to the gate.', 'That is one fewer.']); e.sayT = 2.5; }
        if (game.time > e._leaveT) e.despawnSoon = true;
        e.moving = false; e.fighting = false;
        return true;
      }
      const lv = ECHO.Prowess.level(pl), dP = U.dist(pe.x, pe.y, beast.x, beast.y);
      // a sworn warden (or anyone strong enough) fighting it: help, don't steal it — unless they are losing
      const share = (pl.guard || lv >= Gt().MIN) && dP < 12 && pe.hp > pl.maxHp * 0.35;
      if (!e._called) { e._called = true; e.say = share ? 'It is yours if you want it. I am right behind you.' : lv < Gt().MIN ? 'Stand clear! That one is mine.' : 'Out of my way.'; e.sayT = 3; }
      e.fighting = true;
      beast.aggro = true; beast._hunter = e; beast._noPl = !share; if (!share) beast.target = e;
      if (U.dist(e.x, e.y, beast.x, beast.y) < 12) Gd().offense(game, e, npc, D, beast, !share);
      Gd().engage(game, e, beast, dt, share ? 0.16 : Infinity, share ? 0.25 : 0);
      return true;
    },

    // ------------------------------------------------------------ patrols
    patrol(game) {
      const world = game.world, pe = game.pe, pl = game.pl;
      if (ECHO.Interior.cur || ECHO.World.settlementAt(world, pe.x, pe.y, 14) || Math.random() > 0.55) return;
      if (game.ents.some(e => e.gpatrol && !e.dead)) return;
      const cands = GW().auxList(world).filter(n => {
        if (n.journey || !n.loc || game.ents.some(e => e.npcId === n.id && !e.dead)) return false;
        const s = ECHO.Sim.settlement(world, n.home);
        return s && U.dist(s.x, s.y, pe.x, pe.y) < 85;
      }).sort(() => Math.random() - 0.5);
      if (!cands.length) return;
      const a = Math.random() * 6.28, from = ECHO.Ent.freeSpot(world, pe.x + Math.cos(a) * 21, pe.y + Math.sin(a) * 21, 6);
      const to = ECHO.Ent.freeSpot(world, pe.x - Math.cos(a) * 30, pe.y - Math.sin(a) * 30, 8);
      if (!from || !to) return;
      const team = cands.slice(0, 2 + (Math.random() < 0.4 ? 1 : 0));
      team.forEach((n, i) => {
        const sp = ECHO.Ent.freeSpot(world, from.x + (i % 2 ? 0.9 : -0.9), from.y + i * 0.8, 3) || from;
        const e = ECHO.Spawner.makePerson(game, n, sp.x, sp.y, 'soldier');
        e.gpatrol = true; e.patrolTo = { x: to.x + (i % 2 ? 0.8 : -0.8), y: to.y + i * 0.7 }; e.lead = i === 0; e.gear.helm = true;
        game.addEnt(e);
      });
    },
    // auxiliaries on the move: fight what threatens the road, else keep walking
    think(game, e, npc, dt) {
      const world = game.world, pe = game.pe, pl = game.pl;
      const foe = Gd().foes(game, e, 9).filter(o => o.type !== 'person' || o.role === 'bandit' || o.aggro)[0];
      if (foe) { e.target = foe; return false; }                // (the ordinary business of fighting)
      if (e.target && (e.target.dead || e.target === pe)) e.target = null;
      const dp = U.dist(e.x, e.y, pe.x, pe.y);
      if (e.lead && dp < 6 && !e._greeted) {
        e._greeted = true;
        const br = GW().openBreaches(world)[0];
        e.say = pl.guard ? pick(['Warden.', 'The road is quiet, warden.']) : br ? `Watch yourself — something got out of ${br.gateName}.` : pick(['The Guard keeps this road.', 'Safe travels.', 'Anything on the road behind you?']);
        e.sayT = 3;
      }
      const t = e.patrolTo;
      if (!t) return false;
      if (U.dist(e.x, e.y, t.x, t.y) < 1.2) { e.moving = false; e.despawnSoon = dp > 26; return true; }
      ECHO.Ent.travel(world, e, t.x, t.y, e.speed * 0.72, dt);
      return true;
    },

    // ------------------------------------------------------------ where the work is
    objectives(game) {
      const world = game.world, pl = game.pl, out = [];
      if (!GW()) return out;
      const c = pl.gcontract, t = GW().target(world, c);
      if (t) out.push({ icon: '⚔', label: `The Guard's contract: ${c.label}`, where: { x: t.x, y: t.y, name: c.kind === 'breach' ? `the ${GW().beastName(t.kind)}` : ECHO.Powers.short(t) } });
      return out;
    },

    // ------------------------------------------------------------ talking to them
    dialogue(world, npc, ent, pl, ui) {
      if (!GW() || !(npc.ngAux || npc.ng) || (npc.ng && ECHO.GateWorld && ECHO.GateWorld.inside(ECHO.Game))) return;
      const g = GW().st(world);
      if (!g) return;
      ui.add('What news from the Guard?', () => ui.say(GF.news(world, pl)));
      if (npc.ngAux && !npc.ng) ui.add('What does an auxiliary of the Guard do?', () => {
        const gs = Object.entries(g.garrisons).find(([, r]) => r.id === npc.id), s = gs && ECHO.Sim.settlement(world, gs[0]);
        ui.say(`"We are the Guard's hands on this side of the gates. We ride the roads, we hold the towns that are in danger, and when something gets through, we go with the warden who runs it down. We train harder than any soldier in the realm — and the best of us, when we reach level ${Gt().MIN}, take the full oath."\n\n${s ? `${npc.first} is holding ${s.name} for the Guard.` : `${npc.first} has been with the Guard since day ${npc.ngAux.since}.`}`);
      });
      const c = pl.gcontract;
      if (c) ui.add('About the Guard\'s contract…', () => {
        const t = GW().target(world, c);
        ui.say(t ? `"${c.label}. ${c.kind === 'breach' ? 'It was last seen' : 'It roams'} ${Math.round(U.dist(t.x, t.y, pl.x, pl.y))} leagues ${ECHO.Purpose ? ECHO.Purpose.dirTo(world, pl, t) : 'off'}. ${c.gold} crowns${c.merit ? ` and ${c.merit} merit` : ''} when it is done."` : '"It is over, one way or another."');
        ui.clear();
        ui.add('Give it up.', () => { pl.gcontract = null; ui.say('"Someone else will do it, then."'); ui.render(); });
        ui.add('I\'m on it.', () => ui.render());
      });
      else ui.add(pl.guard ? 'Any orders?' : 'Does the Guard have work for me?', () => {
        const offers = GW().offers(world, pl);
        if (!offers.length) return ui.say(pl.guard ? '"Nothing for you right now. Keep your blade sharp."' : '"Nothing your size just now. Come back."');
        ui.say(`${npc.first} looks you over. "${pl.guard ? 'Take your pick, warden.' : 'The Guard pays for work done. One at a time.'}"\n\n${offers.map(o => `• ${o.label} — ${o.gold} crowns${o.merit ? `, ${o.merit} merit` : ''} (${Math.round(U.dist(o.x, o.y, pl.x, pl.y))} leagues ${ECHO.Purpose ? ECHO.Purpose.dirTo(world, pl, o) : ''})`).join('\n')}`);
        ui.clear();
        offers.forEach(o => ui.add(`Take it: ${o.label}`, () => {
          GW().take(world, pl, o);
          const mk = `mark:${o.x.toFixed(1)}:${o.y.toFixed(1)}:${o.kind === 'breach' ? 'the loose beast' : 'the Guard\'s quarry'}`;
          pl.tracked = pl._gmark = mk;
          ui.say(`"Good. Bring us word when it is dead — we will hear of it anyway." (It is marked on your way; Where to? follows it.)`);
          UI().toast(`Contract taken: ${o.label}.`, 'info', 4);
          ui.render();
        }));
        ui.add('Not now.', () => ui.render());
      });
      // the sworn: the armoury
      if (pl.guard && npc.ng) ui.add(`The armoury (${pl.guard.merit || 0} merit)`, () => {
        ui.say(`"Legendary work, forged for the Guard at your own strength. ${GW().armouryCost} merit a piece. You earn merit running down what gets out of the gates and carrying out the Guard's orders."`);
        ui.clear();
        for (const [k, l] of GW().ARMOURY) ui.add(`${l} — ${GW().armouryCost} merit`, () => {
          const r = GW().requisition(world, pl, k);
          if (r.error) return ui.say(r.error);
          const slot = k === 'sword' ? 'weapon' : k, cur = world.items[pl[slot]];
          if (!cur || (k === 'armor' ? (r.item.def || 0) > (cur.def || 0) : (r.item.dmg || 0) > (cur.dmg || 0))) pl[slot] = r.item.id;
          ECHO.PlayerCtl.derivedT = 0;
          ui.say(`${npc.first} hands you ${r.item.name}: ${ECHO.Gear.line(r.item)}.${pl[slot] === r.item.id ? ' You take it up at once.' : ''}`);
          ui.render();
        });
        ui.add('Back.', () => ui.render());
      });
    },
    news(world, pl) {
      const g = GW().st(world), lines = [];
      const open = GW().openBreaches(world);
      if (open.length) lines.push(open.map(b => `Loose: ${GW().aBeast(b.kind)} (level ${b.lv}) out of ${b.gateName}, ${Math.round(U.dist(b.x, b.y, pl.x, pl.y))} leagues ${ECHO.Purpose ? ECHO.Purpose.dirTo(world, pl, b) : 'off'}, making for ${(ECHO.Sim.settlement(world, b.town) || {}).name || 'a town'}.`).join('\n'));
      const gs = Object.entries(g.garrisons).map(([sid, r]) => { const s = ECHO.Sim.settlement(world, sid), n = world.npcs[r.id]; return s && n ? `${s.name} (${P().name(n)})` : null; }).filter(Boolean);
      if (gs.length) lines.push(`The Guard holds ${gs.join(', ')}.`);
      const recent = g.log.slice(-4).reverse().map(l => `Day ${l.d}: ${l.t}`);
      if (recent.length) lines.push(recent.join('\n'));
      return lines.length ? lines.join('\n\n') : '"Quiet. That is how we like it."';
    },

    // ------------------------------------------------------------ the Journal's page
    html(game) {
      const world = game.world, pl = game.pl, G = Gt(), W = GW();
      if (!world.gates || !W) return '<p class="dim">Nothing is known of the Guard yet.</p>';
      const g = W.st(world), lv = ECHO.Prowess.level(pl);
      let h = `<p class="dim">The National Guard holds the three gates — and, through its auxiliaries, the realm: they ride the roads, hold the towns in danger, run down whatever gets out of a gate and cull the named monsters that grow too strong. Talk to any of them (their capes are Guard blue) for news and work.</p>`;
      // you
      if (pl.guard) h += `<div class="card"><h4>You: ${esc(G.rankOf(lv))} of the Guard</h4><div class="dim">${pl.guard.merit || 0} merit (the armoury, at any warden: ${W.armouryCost} a piece) · wage ${W.wage(world, pl)} crowns a week${pl.guard.paidDay != null ? `, next in ${Math.max(0, 7 - (world.day - pl.guard.paidDay))} days` : ''} · ${pl.guard.trips || 0} times through a gate</div></div>`;
      else h += `<div class="card"><h4>You</h4><div class="dim">${lv >= G.MIN ? 'You are strong enough to take the oath: speak to a warden at any gate.' : `The oath is taken at level ${G.MIN}. Until then, the Guard pays anyone for work done — ask any auxiliary.`}${pl.guardDone ? ` You have done ${pl.guardDone} piece${pl.guardDone > 1 ? 's' : ''} of work for the Guard.` : ''}</div></div>`;
      const c = pl.gcontract, t = W.target(world, c);
      if (t) h += `<div class="card"><h4 class="gold">Your contract</h4>${esc(c.label)} — ${c.gold} crowns${c.merit ? `, ${c.merit} merit` : ''}<div class="dim">${Math.round(U.dist(t.x, t.y, pl.x, pl.y))} leagues ${ECHO.Purpose ? esc(ECHO.Purpose.dirTo(world, pl, t)) : ''} · taken on day ${c.day}, lapses after 25 days</div></div>`;
      // loose beasts
      const open = W.openBreaches(world);
      h += `<h4 class="ware-h">Out of the gates</h4>${open.length ? open.map(b => `<div class="card"><b class="ember">${esc(W.aBeast(b.kind, true))} — level ${b.lv}</b> out of ${esc(b.gateName)}, loose since day ${b.day}, making for ${esc((ECHO.Sim.settlement(world, b.town) || {}).name || 'a town')}<div class="dim">${Math.round(U.dist(b.x, b.y, pl.x, pl.y))} leagues ${ECHO.Purpose ? esc(ECHO.Purpose.dirTo(world, pl, b)) : ''}${b.warden && world.npcs[b.warden] ? ` · ${esc(P().fullTitle(world, world.npcs[b.warden]))} is on its trail` : ''}</div></div>`).join('') : '<p class="dim">Nothing is loose. The gates are holding.</p>'}`;
      // the wardens
      h += `<h4 class="ware-h">The wardens</h4><table class="grid"><tr><th>Warden</th><th>Gate</th><th>Level</th></tr>${G.members(world).map(n => `<tr><td>${esc(P().fullTitle(world, n))}</td><td>${esc(U.cap((G.list(world)[n.ng.gate] || {}).name || ''))}</td><td>${ECHO.Delvers.lv(n)}</td></tr>`).join('')}</table>`;
      // garrisons and auxiliaries
      const aux = W.auxList(world).sort((a, b) => W.lvOf(b) - W.lvOf(a));
      const gar = Object.entries(g.garrisons).map(([sid, r]) => ({ s: ECHO.Sim.settlement(world, sid), n: world.npcs[r.id], r })).filter(x => x.s && x.n);
      h += `<h4 class="ware-h">Garrisons</h4>${gar.length ? `<table class="grid"><tr><th>Town</th><th>Held by</th><th>Since</th></tr>${gar.map(x => `<tr><td>${esc(x.s.name)}</td><td>${esc(P().name(x.n))} <span class="dim">(level ${W.lvOf(x.n)})</span></td><td class="dim">day ${x.r.since}${x.r.why === 'asked' ? ' · paid for' : ''}</td></tr>`).join('')}</table>` : '<p class="dim">No town needs one just now.</p>'}`;
      const tr = (g.trainees || []).map(t => world.npcs[t.id]).filter(n => n && n.status === 'alive');
      h += `<h4 class="ware-h">Auxiliaries (${aux.length})${tr.length ? ` and sworn trainees (${tr.length})` : ''}</h4><div class="dim" style="font-size:13px">${aux.slice(0, 16).map(n => `${esc(P().name(n))} of ${esc((ECHO.Sim.settlement(world, n.ngAux.home) || ECHO.Sim.settlement(world, n.home) || {}).name || '?')} · level ${W.lvOf(n)}`).join('<br>') || 'None yet.'}${tr.length ? '<br>' + tr.slice(0, 8).map(n => `<span class="gold">${esc(P().name(n))}</span> · ${esc(G.rankOf(W.lvOf(n)))} · level ${W.lvOf(n)}`).join('<br>') : ''}</div>`;
      // what they have done
      const log = g.log.slice(-12).reverse();
      if (log.length) h += `<h4 class="ware-h">Lately</h4>${log.map(l => `<div class="card"><span class="dim">Day ${l.d}</span> — ${esc(l.t)}</div>`).join('')}`;
      return h;
    }
  };
})();
