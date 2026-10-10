// The court: how the law reaches you. Crimes are recorded with the names of
// those who saw them; guards try to arrest before they fight; you can come
// quietly, pay on the spot, or resist. At trial you plead, your friends may
// speak for you, a greedy judge may take your coin — and the sentence is
// whatever this town's law says it is.
(function () {
  const { U } = ECHO;
  const P = () => ECHO.People;
  const L = () => ECHO.Law;

  const C = ECHO.Court = {
    lastArrest: -99,
    // ---------------------------------------------------------------- recording
    witnessIds(game, x, y, exclude) {
      const world = game.world, pl = game.pl;
      return game.ents.filter(o => o.type === 'person' && !o.dead && !o.hidden && !o.sleeping && o !== exclude && o.npcId && o.role !== 'bandit' && o.role !== 'captive' && !o.isCompanion &&
        !(world.npcs[o.npcId] && ECHO.Minds.covers(world, world.npcs[o.npcId], pl)) &&
        U.dist(o.x, o.y, x, y) < (game.isNight() ? 7 : 12) && ECHO.Ent.lineOfSight(world, o.x, o.y, x, y)).map(o => o.npcId);
    },
    record(game, kind, o = {}) {
      const world = game.world, pl = game.pl;
      if (ECHO.Comrade && (kind === 'theft' || kind === 'pickpocket' || kind === 'burglary')) ECHO.Comrade.react(game, 'theft', 1);
      const wp = game.wp(o.x != null ? o.x : game.pe.x, o.y != null ? o.y : game.pe.y);
      const s = o.s || ECHO.World.settlementAt(world, wp.x, wp.y, 30) || ECHO.World.nearestSettlement(world, wp.x, wp.y, t => t.faction !== 'ashfang');
      if (!s || s.faction === 'ashfang') return null;
      const witnesses = o.witnesses || C.witnessIds(game, game.pe.x, game.pe.y, o.victimEnt);
      if (!witnesses.length && !o.known) return null;
      const victim = o.victimEnt && o.victimEnt.npcId ? world.npcs[o.victimEnt.npcId] : o.victim ? world.npcs[o.victim] : null;
      return L().report(world, { by: 'player', kind, victim: victim ? victim.id : null, victimName: victim ? P().name(victim) : o.victimName || null, sid: s.id, faction: s.faction, witnesses, value: o.value || 0 });
    },

    // ---------------------------------------------------------------- banishment
    banished(world, pl, faction) { return !!(pl && pl.banished && (pl.banished[faction] || 0) > world.day); },
    inBanishedLand(game) {
      const world = game.world, pl = game.pl;
      if (!pl.banished) return null;
      const s = ECHO.World.settlementAt(world, pl.x, pl.y, 18);
      return s && C.banished(world, pl, s.faction) ? s : null;
    },

    // ---------------------------------------------------------------- arrest
    shouldArrest(game, guard) {
      const world = game.world, pl = game.pl;
      if (!pl || game.pl.capture || game.defeating || ECHO.UI.paused()) return false;
      const f = guard.faction;
      if (!(pl.wanted[f] > 0)) return false;
      if (C.banished(world, pl, f)) return false;              // banished: no more warnings
      if ((pl.resist && pl.resist[f] || 0) > game.time) return false;
      if (game.time - (game.lastHitGuard || -99) < 20) return false; // you're fighting them
      return game.time - C.lastArrest > 25;
    },
    arrest(game, guard) {
      const world = game.world, pl = game.pl;
      C.lastArrest = game.time;
      const f = guard.faction;
      const s = ECHO.World.settlementAt(world, pl.x, pl.y, 30) || ECHO.World.nearestSettlement(world, pl.x, pl.y, t => t.faction === f) || ECHO.Sim.settlement(world, world.npcs[guard.npcId].home);
      const crimes = L().openAgainstPlayer(world, pl, f);
      const charges = crimes.length ? crimes.map(c => L().CRIME_WORD[c.kind] + (c.victimName ? ' against ' + c.victimName : '')) : ['breaking the peace'];
      const sentences = crimes.map(c => L().sentenceFor(world, s, c.kind, c.value)).filter(Boolean);
      const allFines = sentences.length > 0 && sentences.every(x => x.p === 'fine');
      const total = sentences.reduce((a, x) => a + x.fine, 0) || (crimes.length ? 0 : 20);
      const gName = P().fullTitle(world, world.npcs[guard.npcId]);
      guard.say = 'Halt! In the name of the law!'; guard.sayT = 2.5; guard.moving = false;
      ECHO.UI.modal({
        title: 'Under arrest',
        html: `<p><b>${gName}</b> blocks your way, hand on hilt. "You're wanted in ${s ? s.name : 'these lands'} for <b>${U.listJoin(charges.slice(0, 3))}</b>${charges.length > 3 ? ' and more' : ''}. Come quietly."</p>
               <p class="dim">${s ? `${s.name} keeps ${L().code(world, s).name}.` : ''}</p>`,
        choices: [
          { label: 'Come quietly', sub: 'You will be tried before the judge.', onPick: () => C.trial(game, s, guard, false) },
          ...((allFines || !crimes.length) && total > 0 ? [{ label: `Pay the fine on the spot (${total} crowns)`, sub: pl.gold >= total ? 'And be on your way.' : `You have ${Math.floor(pl.gold)}.`, disabled: pl.gold < total, onPick: () => { pl.gold -= total; const fac = world.factions[f]; if (fac) fac.treasury += total; C.close(world, pl, f, crimes); ECHO.UI.toast(`You pay ${total} crowns. The guard waves you on.`, 'info', 4); } }] : []),
          { label: 'Resist', sub: 'Fight your way out. They will not ask again.', onPick: () => { pl.resist = pl.resist || {}; pl.resist[f] = game.time + 600; pl.wanted[f] = Math.min(200, (pl.wanted[f] || 0) + 20); if (s) L().report(world, { by: 'player', kind: 'resisting', sid: s.id, faction: f, witnesses: [guard.npcId] }); guard.target = game.pe; guard.say = 'So be it!'; guard.sayT = 2; } }
        ]
      });
    },
    close(world, pl, faction, crimes) {
      for (const c of crimes) c.status = 'tried';
      pl.wanted[faction] = 0; delete pl.wanted[faction];
      if (pl.resist) delete pl.resist[faction];
    },

    // ---------------------------------------------------------------- trial
    trial(game, s, guard, dragged) {
      const world = game.world, pl = game.pl;
      if (!s) s = ECHO.World.nearestSettlement(world, pl.x, pl.y, t => t.faction !== 'ashfang');
      const f = s.faction;
      const code = L().code(world, s);
      let crimes = L().openAgainstPlayer(world, pl, f);
      if (!crimes.length) crimes = [L().report(world, { by: 'player', kind: 'resisting', sid: s.id, faction: f, witnesses: guard && guard.npcId ? [guard.npcId] : [] })];
      pl.capture = { kind: 'trial', sid: s.id, since: world.day };
      game.defeating = true;
      // the case
      const rows = crimes.map(c => {
        const ev = L().evidence(world, c);
        const names = ev.alive.map(id => P().name(world.npcs[id])).slice(0, 3);
        return { c, ev, text: `<b>${U.cap(L().CRIME_WORD[c.kind])}</b>${c.victimName ? ' against ' + c.victimName : ''} — ${ECHO.TIME.fmtShort(c.d)}. ${names.length ? 'Witnesses: ' + names.join(', ') + (ev.alive.length > 3 ? ' and others' : '') + '.' : 'No living witnesses.'}${ev.dead ? ` <span class="dim">(${ev.dead} witness${ev.dead > 1 ? 'es are' : ' is'} dead.)</span>` : ''}${ev.victimSpeaks ? ' The victim will testify.' : ''}` };
      });
      const worst = crimes.map(c => L().sentenceFor(world, s, c.kind, c.value)).filter(Boolean).sort((a, b) => ({ fine: 1, stocks: 2, jail: 3, bloodprice: 3, banish: 4, hang: 5 }[b.p] - { fine: 1, stocks: 2, jail: 3, bloodprice: 3, banish: 4, hang: 5 }[a.p]))[0] || { p: 'fine', fine: 20, kind: 'resisting' };
      const fines = crimes.map(c => L().sentenceFor(world, s, c.kind, c.value)).filter(x => x && (x.p === 'fine' || x.p === 'bloodprice')).reduce((a, x) => a + x.fine, 0);
      const strength = Math.max(...rows.map(r => r.ev.strength), dragged ? 2 : 0);
      const friends = ECHO.People.residents(world, s).filter(n => (n.op[pl.charId] || 0) > 60).slice(0, 3);
      const rep = (s.rep && s.rep[pl.charId]) || 0;
      const guilt = U.clamp(0.2 + strength * 0.24 - pl.skills.tongue / 260 - rep / 300 - friends.length * 0.08, 0.04, 0.96);
      const bribe = Math.round(Math.max(40, fines * 1.5 + (worst.p === 'hang' ? 250 : worst.p === 'banish' ? 160 : worst.p === 'jail' ? 70 : 30)));
      const likely = guilt > 0.7 ? 'The case against you is strong.' : guilt > 0.4 ? 'It could go either way.' : 'The case against you is thin.';
      ECHO.UI.fadeOut(() => {
        ECHO.UI.modal({
          title: `The court of ${s.name}`,
          html: `<p>${dragged ? 'You are dragged in chains' : 'You are brought'} before <b>${code.judgeName}</b>, to be judged under <b>${code.name}</b>.</p>
                 <div class="charges">${rows.map(r => `<p>${r.text}</p>`).join('')}</div>
                 ${friends.length ? `<p><b>${U.listJoin(friends.map(n => n.first + ' ' + n.last))}</b> ${friends.length > 1 ? 'have' : 'has'} come to speak for you.</p>` : ''}
                 <p class="dim">${likely} If found guilty: ${L().describeSentence(worst)}${fines && worst.p !== 'fine' && worst.p !== 'bloodprice' ? ` (and ${fines} crowns in fines)` : ''}.</p>`,
          choices: [
            { label: 'Plead guilty', sub: 'Confession earns some mercy.', onPick: () => C.sentence(game, s, crimes, C.soften(worst), true) },
            { label: 'Plead innocent', sub: `Let them prove it. (${Math.round((1 - guilt) * 100)}% chance you walk free)`, onPick: () => { ECHO.Character.train(pl, 'tongue', 1.5); if (Math.random() < guilt) C.sentence(game, s, crimes, C.harden(worst), false); else C.acquit(game, s, crimes, friends); } },
            ...(code.bribable ? [{ label: `Slip the judge ${bribe} crowns`, sub: pl.gold >= bribe ? 'Justice, it is whispered, can be bought here.' : `You have ${Math.floor(pl.gold)}.`, disabled: pl.gold < bribe, onPick: () => { pl.gold -= bribe; const r = s.ruler && world.npcs[s.ruler]; if (r) r.wealth += bribe; ECHO.Character.behave(pl, 'betrayal', 0.3); C.acquit(game, s, crimes, [], true); } }] : [])
          ]
        });
      }, 500);
    },
    soften(x) {
      const order = ['fine', 'stocks', 'jail', 'banish', 'hang'];
      if (x.p === 'fine' || x.p === 'bloodprice') return { ...x, fine: Math.round(x.fine * 0.75) };
      if (x.p === 'jail') return { ...x, days: Math.max(1, Math.round(x.days * 0.6)) };
      return { ...x, p: order[order.indexOf(x.p) - 1] || x.p, days: x.p === 'hang' ? 120 : x.days };
    },
    harden(x) {
      if (x.p === 'fine' || x.p === 'bloodprice') return { ...x, fine: Math.round(x.fine * 1.25) };
      if (x.p === 'jail') return { ...x, days: Math.round(x.days * 1.3) };
      return x;
    },
    finish(game, f, crimes) {
      const pl = game.pl;
      C.close(game.world, pl, f, crimes);
      ECHO.Capture.finish(game);
    },
    acquit(game, s, crimes, friends, bought) {
      const world = game.world, pl = game.pl;
      ECHO.Chronicle.deed(world, { text: bought ? `${pl.first} ${pl.last} walked free from the court of ${s.name}. Coin, it is said, changed hands.` : `${pl.first} ${pl.last} was tried in ${s.name} and found not guilty.`, importance: 1, sid: s.id, rep: bought ? -2 : 1 });
      for (const n of friends) { n.op[pl.charId] = (n.op[pl.charId] || 0) + 5; }
      ECHO.UI.modal({ title: bought ? 'Released' : 'Not guilty', html: `<p>${bought ? 'The judge pockets the purse and finds that the evidence is, after all, unconvincing.' : 'The judge finds the case unproven. You are free to go — though not everyone in the gallery agrees.'}</p>`, choices: [{ label: 'Walk out', onPick: () => C.finish(game, s.faction, crimes) }] });
    },
    sentence(game, s, crimes, x, confessed) {
      const world = game.world, pl = game.pl, f = s.faction;
      const fines = crimes.map(c => L().sentenceFor(world, s, c.kind, c.value)).filter(y => y && (y.p === 'fine' || y.p === 'bloodprice')).reduce((a, y) => a + y.fine, 0) * (confessed ? 0.75 : 1);
      const what = U.listJoin(crimes.map(c => L().CRIME_WORD[c.kind]));
      ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} was found guilty of ${what} in ${s.name} and sentenced to ${L().describeSentence(x)}.`, importance: 2, sid: s.id, rep: -3 });
      const done = (text, events) => {
        ECHO.Capture.place(game, s.x, s.y + 3);
        pl.hp = Math.max(pl.hp, pl.maxHp * 0.6);
        ECHO.UI.modal({ title: 'Sentence served', html: `<p>${text}</p>${ECHO.UI.eventsDigest(events || [], 'Meanwhile')}`, choices: [{ label: 'Go', onPick: () => C.finish(game, f, crimes) }] });
      };
      const payFine = (amt) => {
        const paid = Math.min(pl.gold, amt);
        pl.gold -= paid;
        const fac = world.factions[f]; if (fac) fac.treasury += paid;
        // blood-price goes to the victim's family
        const bp = crimes.find(c => c.kind === 'murder' && c.victim);
        if (x.p === 'bloodprice' && bp) { const v = world.npcs[bp.victim]; const kin = v && ((v.spouse && world.npcs[v.spouse]) || v.kids.map(id => world.npcs[id]).find(k => k && k.status === 'alive')); if (kin) { kin.wealth += paid; if (kin.mind && kin.mind.goal && kin.mind.goal.kind === 'avenge' && (P().has(kin, 'greedy') || P().has(kin, 'kind'))) kin.mind.goal = null; } }
        return amt - paid;
      };
      const intro = `${L().code(world, s).judgeName} pronounces sentence: ${L().describeSentence(x)}.`;
      switch (x.p) {
        case 'fine': case 'bloodprice': {
          const owed = payFine(Math.round(Math.max(x.fine, fines)));
          if (owed <= 0) return ECHO.UI.modal({ title: 'Sentenced', html: `<p>${intro} You pay it.</p>`, choices: [{ label: 'Go', onPick: () => C.finish(game, f, crimes) }] });
          const days = Math.ceil(owed / 6);
          return ECHO.UI.modal({ title: 'Sentenced', html: `<p>${intro} You can't pay all of it, so you will work off the rest in the cells: ${days} days.</p>`, choices: [{ label: 'Serve the time', onPick: () => game.fastForward(days, 'Stone walls. Bad bread.', ev => done('The gaoler opens the door. "Debt\'s paid. Don\'t come back."', ev)) }] });
        }
        case 'stocks': {
          payFine(fines);
          if (s.rep) s.rep[pl.charId] = (s.rep[pl.charId] || 0) - 6;
          for (const n of ECHO.People.residents(world, s)) n.op[pl.charId] = (n.op[pl.charId] || 0) - 3;
          return ECHO.UI.modal({ title: 'The stocks', html: `<p>${intro}</p><p>A day locked in the stocks in the square while the town walks past. Children throw mud; someone throws a cabbage. Everyone in ${s.name} will remember your face.</p>`, choices: [{ label: 'Endure it', onPick: () => game.fastForward(1, 'In the stocks of ' + s.name, ev => done('At dusk they unlock the stocks. Your neck aches.', ev)) }] });
        }
        case 'jail': {
          payFine(fines);
          const days = Math.max(1, Math.round(x.days));
          return ECHO.UI.modal({ title: 'The cells', html: `<p>${intro}</p>`, choices: [{ label: `Serve ${days} days`, onPick: () => game.fastForward(days, 'Stone walls. Bad bread.', ev => done('The gaoler opens the door. "Don\'t let me see you again."', ev)) }] });
        }
        case 'banish': {
          payFine(fines);
          pl.banished = pl.banished || {};
          pl.banished[f] = world.day + (x.days || 90);
          const fac = world.factions[f];
          const out = ECHO.World.nearestSettlement(world, s.x, s.y, t => t.faction !== f && t.faction !== 'ashfang');
          return ECHO.UI.modal({ title: 'Banished', html: `<p>${intro}</p><p>You may not set foot in any town of ${fac ? fac.name : 'the realm'} for ${x.days || 90} days. If you are found within their walls, the guards will cut you down.</p>`, choices: [{ label: 'Take the road', onPick: () => { if (out) ECHO.Capture.place(game, out.x, out.y + 3); C.finish(game, f, crimes); } }] });
        }
        case 'hang':
          return ECHO.UI.modal({ title: 'The gallows', html: `<p>${intro}</p><p>They build the scaffold in the square overnight. At dawn the whole town comes to watch.</p>`, choices: [{ label: 'Climb the steps', onPick: () => C.gallows(game, s, crimes) }] });
      }
    },
    gallows(game, s, crimes) {
      const world = game.world, pl = game.pl;
      if (pl.fate <= 1) { game.defeating = false; return ECHO.Capture.die(game, `hanged in ${s.name} for ${U.listJoin(crimes.map(c => L().CRIME_WORD[c.kind]))}`, null); }
      pl.fate--; pl.hp = pl.maxHp * 0.2;
      pl.banished = pl.banished || {}; pl.banished[s.faction] = world.day + 180;
      const friend = ECHO.People.residents(world, s).find(n => (n.op[pl.charId] || 0) > 50);
      const how = friend ? `The rope is cut before it tightens — ${friend.first} ${friend.last} and two others rush the scaffold in the confusion, and you are gone over the wall before the guards can turn.` : 'The rope snaps. In the uproar — an omen, a sign — the crowd will not let them try again. You are thrown out of the gates with a warning never to return.';
      if (friend) { P().remember(world, friend, `cut ${pl.first} ${pl.last} down from the gallows`, 'pride', null, 4); }
      const out = ECHO.World.nearestSettlement(world, s.x, s.y, t => t.faction !== s.faction && t.faction !== 'ashfang');
      ECHO.UI.modal({ title: 'Not today', html: `<p>${how}</p><p class="dim">Fate feels much thinner now. You are banished from ${world.factions[s.faction] ? world.factions[s.faction].name : 'this realm'}.</p>`, choices: [{ label: 'Run', onPick: () => { if (out) ECHO.Capture.place(game, out.x, out.y + 3); C.finish(game, s.faction, crimes); } }] });
    },

    // ---------------------------------------------------------------- every second
    tick(game) {
      const world = game.world, pl = game.pl;
      if (!pl || pl.capture || game.defeating || ECHO.Interior.cur) return;
      const s = ECHO.World.settlementAt(world, pl.x, pl.y, 13);
      // banished: guards attack on sight
      if (s && C.banished(world, pl, s.faction)) {
        pl.wanted[s.faction] = Math.max(pl.wanted[s.faction] || 0, 60);
        if (!C._banWarn || game.time - C._banWarn > 30) { C._banWarn = game.time; ECHO.UI.toast(`You are banished from ${world.factions[s.faction].name}. The guards will not ask questions.`, 'warn', 4); }
      }
      // curfew
      const hour = world.minute / 60;
      if (s && hour < 5 && L().code(world, s).curfew) {
        const guard = game.ents.find(e => e.role === 'guard' && !e.dead && !e.hidden && e.faction === s.faction && U.dist(e.x, e.y, game.pe.x, game.pe.y) < 8);
        if (guard) {
          if (!C.curfewT) { C.curfewT = game.time; guard.say = 'Curfew! Get indoors!'; guard.sayT = 3; }
          else if (game.time - C.curfewT > 25) { C.curfewT = game.time + 9999; C.record(game, 'curfew', { s, witnesses: [guard.npcId], known: true }); pl.wanted[s.faction] = Math.max(pl.wanted[s.faction] || 0, 25); }
        }
      } else if (hour >= 5) C.curfewT = 0;
    }
  };
})();
