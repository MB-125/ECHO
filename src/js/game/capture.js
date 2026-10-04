// Defeat creates stories instead of reload screens.
//  • Beaten by beasts: someone finds you. Each time, fate wears thinner.
//  • Beaten by people: they take you captive, take your sword, and gain
//    status for it. You escape, pay, or wait — and the world moves on.
//  • When fate runs out, the character dies for good and becomes legend.
(function () {
  const { U } = ECHO;
  const P = () => ECHO.People;

  const Cap = ECHO.Capture = {
    begin(game, from) {
      const world = game.world, pl = game.pl;
      let npc = from && from.type === 'person' && from.npcId ? world.npcs[from.npcId] : null;
      // Felled by someone who died in the same moment (their arrow still in
      // flight, their fire still burning)? Their comrades take you instead —
      // losing to people never costs fate.
      if (from && from.type === 'person' && (!npc || npc.status !== 'alive')) {
        const side = npc ? npc.faction : null;
        const alt = game.ents
          .filter(e => e.type === 'person' && !e.dead && !e.hidden && e.npcId && world.npcs[e.npcId] && world.npcs[e.npcId].status === 'alive' && (side ? world.npcs[e.npcId].faction === side : game.hostileTo(e, game.pe)))
          .sort((a, b) => U.dist(a.x, a.y, game.pe.x, game.pe.y) - U.dist(b.x, b.y, game.pe.x, game.pe.y))[0];
        if (alt) { npc = world.npcs[alt.npcId]; from = alt; }
      }
      ECHO.UI.fadeOut(() => {
        if (npc && npc.status === 'alive') {
          if (npc.faction === 'ashfang') Cap.captured(game, npc, from);
          else Cap.jailed(game, npc);
        } else Cap.wounded(game, from);
      });
    },

    place(game, x, y) {
      if (ECHO.Interior.cur) ECHO.Interior.leave(game, true);
      const spot = game.freeSpotNear(game.world, x, y);
      game.pe.x = spot.x; game.pe.y = spot.y; game.pl.x = spot.x; game.pl.y = spot.y;
      game.cam.x = spot.x; game.cam.y = spot.y;
      game.ents = game.ents.filter(e => e === game.pe || e.isCompanion);
      for (const e of game.ents) if (e.isCompanion) { e.x = spot.x - 1; e.y = spot.y + 0.5; }
      game.pe.burn = 0; game.pe.kbx = game.pe.kby = 0;
    },
    finish(game) {
      game.defeating = false;
      game.pl.capture = null;
      ECHO.PlayerCtl.reset();
      ECHO.PlayerCtl.derivedT = 0;
      game.checkPlace(true);
      game.save();
    },

    // ------------------------------------------------------------ Beasts
    wounded(game, from) {
      const world = game.world, pl = game.pl;
      const rng = ECHO.Sim.rngFor(world);
      const killerDesc = from ? (from.type === 'boss' ? `${from.boss.name} ${from.boss.title}` : from.type === 'creature' ? ECHO.Ecology.speciesName(world, world.regions[from.regionId], from.species).toLowerCase().replace(/(\w+)$/, (m) => (ECHO.SPECIES[from.species].plural.split(' ').pop())) : 'your own flame') : 'your wounds';
      if (from && from.type === 'boss') {
        from.boss.memory.knownFoes[pl.charId] = { name: pl.first + ' ' + pl.last, d: world.day, outcome: 'defeated' };
        from.boss.hp = from.boss.maxHp;
      }
      pl.fate--;
      if (pl.fate <= 0) return Cap.die(game, `killed by ${killerDesc}`, null);
      const home = ECHO.World.nearestSettlement(world, game.pe.x, game.pe.y, s => s.faction !== 'ashfang' && ECHO.People.residents(world, s).length > 0);
      const comp = pl.companion && world.npcs[pl.companion];
      const pool = home ? P().residents(world, home).filter(n => ['hunter', 'herbalist', 'woodcutter', 'priest', 'guard', 'farmer'].includes(n.prof)) : [];
      const rescuer = comp && comp.status === 'alive' ? comp : pool.length ? rng.pick(pool) : null;
      const days = rng.int(2, 4);
      const lost = Math.floor(pl.gold * 0.2);
      pl.gold -= lost;
      const region = ECHO.World.regionAt(world, game.pe.x, game.pe.y);
      game.fastForward(days, 'You drift in and out of darkness…', (events) => {
        if (home) {
          const inn = home.buildings.find(b => b.type === 'inn') || home.buildings.find(b => b.type === 'shrine');
          Cap.place(game, inn ? inn.x + inn.w / 2 : home.x, inn ? inn.y + inn.h + 1 : home.y + 2);
        }
        pl.hp = pl.maxHp * 0.6; pl.stamina = pl.maxSta;
        if (rescuer) {
          rescuer.op[pl.charId] = (rescuer.op[pl.charId] || 0) + 15;
          P().remember(world, rescuer, `found ${pl.first} half-dead in ${region.name} and carried them home`, 'deed', null, 3);
          ECHO.Chronicle.add(world, { text: `${P().name(rescuer)} found ${pl.first} ${pl.last} half-dead in ${region.name}, struck down by ${killerDesc}, and carried them to ${home ? home.name : 'safety'}.`, kind: 'player', importance: 1, sid: home ? home.id : null, char: pl.charId });
        }
        const fateLine = pl.fate === 1 ? 'You feel death standing very close now. One more fall may be the last.' : 'You feel death a little closer than before.';
        ECHO.UI.modal({
          title: 'You wake',
          html: `<p>${rescuer ? `<b>${P().name(rescuer)}</b>, ${P().role(world, rescuer)} of ${home ? home.name : 'nowhere'}, found you in ${region.name} and carried you ${home ? 'to ' + home.name : 'to safety'}.` : `You crawl to ${home ? home.name : 'safety'} on your own.`}</p>
                 <p>${days} days have passed.${lost ? ` Some of your coin (${lost}) is gone.` : ''}</p>
                 <p class="dim">${fateLine}</p>${ECHO.UI.eventsDigest(events, 'While you lay senseless')}`,
          choices: [{ label: 'Get up', onPick: () => Cap.finish(game) }]
        });
      });
    },

    // ------------------------------------------------------------ Outlaws
    captured(game, captor, captorEnt) {
      const world = game.world, pl = game.pl;
      const rng = ECHO.Sim.rngFor(world);
      const camp = world.camps.find(c => c.id === captor.camp) || ECHO.Politics.nearestCamp(world, game.pe.x, game.pe.y);
      pl.captures = (pl.captures || 0) + 1;
      // The captor takes your sword and your coin, and rises for it.
      const sword = world.items[pl.weapon];
      let swordLine = '';
      if (sword) {
        sword.holder = captor.id;
        sword.history.push({ d: world.day, t: `taken by ${P().name(captor)} of the Ashfang from ${pl.first} ${pl.last}` });
        if (captor.carry && world.items[captor.carry] && captor.carry !== sword.id) { const old = world.items[captor.carry]; old.holder = null; old.droppedAt = camp ? { x: camp.x + 1, y: camp.y + 1 } : null; }
        captor.carry = sword.id;
        pl.items = pl.items.filter(id => id !== sword.id);
        pl.weapon = null;
        swordLine = ` ${captor.first} takes your ${sword.name.toLowerCase()} and wears it on ${captor.sex === 'f' ? 'her' : 'his'} hip.`;
      }
      const gold = Math.floor(pl.gold * 0.5);
      pl.gold -= gold;
      if (camp) camp.loot.gold += gold;
      captor.renown += 18;
      P().remember(world, captor, `defeated ${pl.first} ${pl.last} and took ${pl.first}'s sword`, 'pride', null, 5);
      if (camp && camp.leader !== captor.id) {
        const lead = world.npcs[camp.leader];
        if (!lead || captor.renown > lead.renown + 5) {
          camp.leader = captor.id; captor.rank = 2;
          ECHO.Chronicle.add(world, { text: `${P().name(captor)}, who defeated ${pl.first} ${pl.last}, has taken command of the Ashfang at ${camp.name}.`, kind: 'crime', importance: 2, x: camp.x, y: camp.y, npcs: [captor.id] });
        }
      }
      ECHO.Chronicle.add(world, { text: `${P().name(captor)} of the Ashfang defeated ${pl.first} ${pl.last} and dragged them in chains to ${camp ? camp.name : 'the woods'}.`, kind: 'crime', importance: 2, x: camp ? camp.x : game.pe.x, y: camp ? camp.y : game.pe.y, char: pl.charId, npcs: [captor.id] });
      pl.capture = { kind: 'camp', campId: camp ? camp.id : null, captor: captor.id, since: world.day };
      const hated = (world.intel.mem.ashfang ? world.intel.mem.ashfang.total : 0) > 12 || pl.kills['Ashfang outlaws'] > 15;
      const execution = (hated || P().has(captor, 'cruel')) && rng.chance(0.4);
      const ransom = 60 + Math.round(pl.renown * 2);
      if (execution) return Cap.execution(game, captor, camp, swordLine);
      Cap.prisonChoices(game, captor, camp, swordLine, ransom);
    },

    prisonChoices(game, captor, camp, swordLine, ransom) {
      const world = game.world, pl = game.pl;
      const comp = pl.companion && world.npcs[pl.companion];
      const lanternFriend = world.settlements.filter(s => s.faction === 'lantern').some(s => (s.rep && s.rep[pl.charId] > 10)) || pl.renown > 35;
      ECHO.UI.modal({
        title: 'Captive of the Ashfang',
        html: `<p>You wake in a cage at <b>${camp ? camp.name : 'an outlaw camp'}</b>. <b>${P().name(captor)}</b> defeated you.${swordLine}</p>
               <p>Half your coin is gone. The outlaws argue about what you are worth.</p>`,
        choices: [
          { label: 'Bide your time and escape', sub: 'Watch the guards, wait for a moonless night. It may take weeks.', onPick: () => Cap.escape(game, captor, camp) },
          { label: `Pay a ransom (${ransom} crowns)`, sub: pl.gold >= ransom ? 'Buy your way out.' : `You have only ${pl.gold}.`, disabled: pl.gold < ransom, onPick: () => Cap.release(game, camp, 'ransom', ransom) },
          { label: 'Wait for rescue', sub: comp && comp.status === 'alive' ? `${comp.first} is still out there.` : lanternFriend ? 'The Lantern sometimes ransoms prisoners.' : 'Who would come for you?', onPick: () => Cap.awaitRescue(game, captor, camp) }
        ]
      });
    },

    execution(game, captor, camp, swordLine) {
      const pl = game.pl, world = game.world;
      ECHO.UI.modal({
        title: 'At dawn they will hang you',
        html: `<p>${P().name(captor)} defeated you.${swordLine}</p><p>The Ashfang remember how many of theirs you have killed. They are building a gallows from green wood. There is one night left.</p>`,
        choices: [
          { label: 'Fight your way out tonight', sub: 'Bare hands against the guards, in the dark.' + (pl.fate <= 1 ? ' If you fail, you die.' : ' If you fail, it costs fate.'), onPick: () => {
            const p = 0.35 + pl.skills.blade / 220 + pl.skills.shadow / 200;
            if (Math.random() < p) { pl.hp = pl.maxHp * 0.3; Cap.escaped(game, camp, 1, 'You strangle the guard with your chains and run into the black woods.'); }
            else Cap.gallows(game, captor, camp);
          } },
          { label: 'Beg for your life', sub: 'Talk. Promise. Lie, if you must.' + (pl.fate <= 1 ? ' If they refuse, you die.' : ' If they refuse, it costs fate.'), onPick: () => {
            const p = 0.3 + pl.skills.tongue / 140;
            ECHO.Character.train(pl, 'tongue', 2);
            if (Math.random() < p) { ECHO.UI.toast(`${captor.first} laughs and spares you — for now. "You're worth more alive."`, 'warn', 6); Cap.prisonChoices(game, captor, camp, '', 60 + Math.round(pl.renown * 2)); }
            else Cap.gallows(game, captor, camp);
          } }
        ]
      });
      void world;
    },
    // The rope. Only the last of your fate ends here; before that, the green
    // wood breaks, or the crowd looks away long enough, and you live — marked.
    gallows(game, captor, camp) {
      const pl = game.pl;
      if (pl.fate <= 1) return Cap.die(game, `hanged by the Ashfang at ${camp ? camp.name : 'their camp'}`, { npcId: captor.id });
      pl.fate--;
      pl.hp = pl.maxHp * 0.2;
      const how = Math.random() < 0.5
        ? 'At dawn they hang you from a branch of green wood. It bends, then cracks. In the shouting you crawl into the ditch and are gone before they find you.'
        : 'They hang you at dawn and leave you for the crows. Somehow the knot was poor. Hours later you wake in the grass below the rope, throat raw, and stagger away.';
      Cap.escaped(game, camp, 1, how + ' <span class="dim">Fate feels much thinner now.</span>');
    },

    escape(game, captor, camp) {
      const pl = game.pl;
      let days = 0, fails = 0;
      const p = 0.45 + pl.skills.shadow / 180 + pl.skills.blade / 500;
      for (let i = 0; i < 6; i++) { days += Math.round(6 + Math.random() * 14); if (Math.random() < p) break; fails++; }
      ECHO.Character.train(pl, 'shadow', 3 + fails);
      game.fastForward(days, 'Days in the cage. You count the guards.', events => {
        pl.hp = pl.maxHp * (fails ? 0.45 : 0.7);
        Cap.escaped(game, camp, days, fails ? `${fails === 1 ? 'One attempt failed and earned you a beating' : U.cap(['', 'one', 'two', 'three', 'four', 'five'][fails] || String(fails)) + ' attempts failed and earned you beatings'}. On the ${['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth'][fails + 1] || 'last'} try you slip the bars at last.` : 'One moonless night you work the bars loose and slip away.', events);
      });
      void captor;
    },
    escaped(game, camp, days, how, events) {
      const world = game.world, pl = game.pl;
      world.minute = 2 * 60 + 30; // escapes happen in the dark
      if (camp) {
        const a = Math.random() * Math.PI * 2;
        Cap.place(game, camp.x + Math.cos(a) * 9, camp.y + Math.sin(a) * 9);
      }
      ECHO.Chronicle.add(world, { text: `${pl.first} ${pl.last} escaped from ${camp ? camp.name : 'the Ashfang'}.`, kind: 'player', importance: 1, char: pl.charId, x: camp ? camp.x : null, y: camp ? camp.y : null });
      ECHO.UI.modal({
        title: 'Free',
        html: `<p>${how}</p>${Cap.captorStatus(game)}<p class="dim">You have no blade. The smithy sells swords — or you could take yours back.</p>${ECHO.UI.eventsDigest(events || [], 'While you were captive')}`,
        choices: [{ label: 'Run', onPick: () => Cap.finish(game) }]
      });
    },
    captorStatus(game) {
      const world = game.world, pl = game.pl;
      const cap = pl.capture && world.npcs[pl.capture.captor];
      if (!cap) return '';
      if (cap.status === 'dead') return `<p>You hear that ${P().name(cap)}, who took you, is dead.</p>`;
      const camp = cap.camp && world.camps.find(c => c.id === cap.camp);
      const sword = cap.carry && world.items[cap.carry];
      return `<p><b>${P().fullTitle(world, cap)}</b>${camp ? (camp.leader === cap.id ? ' now leads the Ashfang at ' + camp.name : ' still rides with the Ashfang of ' + camp.name) : ''}${sword ? ', carrying ' + (sword.legend ? sword.name : 'your sword') : ''}.</p>`;
    },
    release(game, camp, how, cost) {
      const pl = game.pl, world = game.world;
      if (how === 'ransom') { pl.gold -= cost; if (camp) camp.loot.gold += cost; }
      game.fastForward(3, 'Messages pass. Coin changes hands.', events => {
        const home = ECHO.World.nearestSettlement(world, camp ? camp.x : game.pe.x, camp ? camp.y : game.pe.y, s => s.faction !== 'ashfang');
        if (home) Cap.place(game, home.x, home.y + 3);
        pl.hp = pl.maxHp * 0.7;
        ECHO.UI.modal({ title: 'Released', html: `<p>The Ashfang take your coin and leave you blindfolded on the road to ${home ? home.name : 'nowhere'}.</p>${Cap.captorStatus(game)}${ECHO.UI.eventsDigest(events, 'While you were captive')}`, choices: [{ label: 'Walk on', onPick: () => Cap.finish(game) }] });
      });
    },
    awaitRescue(game, captor, camp) {
      const world = game.world, pl = game.pl;
      const comp = pl.companion && world.npcs[pl.companion];
      const lanternFriend = world.settlements.filter(s => s.faction === 'lantern').some(s => (s.rep && s.rep[pl.charId] > 10)) || pl.renown > 35;
      if (comp && comp.status === 'alive') {
        const days = 4 + Math.floor(Math.random() * 7);
        return game.fastForward(days, `Waiting. Hoping ${comp.first} comes.`, events => {
          const won = Math.random() < 0.65 + comp.skill.fight / 300;
          if (!won) { ECHO.People.kill(world, comp, `killed trying to free ${pl.first} from ${camp ? camp.name : 'the Ashfang'}`); pl.companion = null; }
          if (won) {
            comp.renown += 10; ECHO.People.remember(world, comp, `rescued ${pl.first} from the Ashfang`, 'pride', null, 5);
            ECHO.Chronicle.add(world, { text: `${P().name(comp)} broke into ${camp ? camp.name : 'the Ashfang camp'} at night and freed ${pl.first} ${pl.last}.`, kind: 'player', importance: 2, char: pl.charId, x: camp ? camp.x : null, y: camp ? camp.y : null });
            pl.hp = pl.maxHp * 0.6;
            Cap.escapedWith(game, camp, `${comp.first} came for you. ${comp.sex === 'f' ? 'She' : 'He'} cut the ropes on the cage while the camp slept.`, events);
          } else {
            ECHO.UI.toast(`${comp.first} came for you, and died at the gate. You heard it.`, 'warn', 8);
            Cap.prisonChoices(game, captor, camp, '', 60 + Math.round(pl.renown * 2));
          }
        });
      }
      if (lanternFriend) {
        const days = 10 + Math.floor(Math.random() * 14);
        return game.fastForward(days, 'Waiting. The Lantern has been told.', events => {
          const lan = ECHO.Sim.settlement(world, world.factions.lantern.capital);
          ECHO.Chronicle.add(world, { text: `The Order of the Lantern paid the Ashfang to release ${pl.first} ${pl.last}.`, kind: 'player', importance: 1, char: pl.charId, sid: lan ? lan.id : null });
          if (lan) Cap.place(game, lan.x, lan.y + 3);
          pl.hp = pl.maxHp * 0.8;
          ECHO.UI.modal({ title: 'Ransomed by the Lantern', html: `<p>A grey-robed priest of the Lantern paid for your life with temple silver. You owe them now.</p>${Cap.captorStatus(game)}${ECHO.UI.eventsDigest(events, 'While you were captive')}`, choices: [{ label: 'Give thanks', onPick: () => Cap.finish(game) }] });
        });
      }
      const days = 20 + Math.floor(Math.random() * 25);
      game.fastForward(days, 'No one is coming.', events => {
        pl.fate = Math.max(1, pl.fate - 1);
        pl.hp = pl.maxHp * 0.35;
        Cap.escapedWith(game, camp, 'No one came. In the end you broke a finger slipping your chains, and ran. The weeks in the cage have marked you; fate feels thinner.', events);
      });
    },
    escapedWith(game, camp, text, events) {
      if (camp) Cap.place(game, camp.x + 9, camp.y + 4);
      ECHO.UI.modal({ title: 'Free', html: `<p>${text}</p>${Cap.captorStatus(game)}${ECHO.UI.eventsDigest(events, 'While you were captive')}`, choices: [{ label: 'Go', onPick: () => Cap.finish(game) }] });
    },

    // ------------------------------------------------------------ Guards
    jailed(game, guard) {
      const world = game.world, pl = game.pl;
      const f = guard.faction;
      const heat = pl.wanted[f] || 40;
      const fine = Math.round(heat * 1.5);
      const days = Math.max(3, Math.round(heat / 6));
      const s = ECHO.Sim.settlement(world, guard.home) || ECHO.World.nearestSettlement(world, game.pe.x, game.pe.y);
      pl.capture = { kind: 'jail', sid: s ? s.id : null, captor: guard.id, since: world.day };
      guard.renown += 6;
      ECHO.Chronicle.add(world, { text: `${P().fullTitle(world, guard)} subdued ${pl.first} ${pl.last} and threw them in the cells of ${s ? s.name : 'the keep'}.`, kind: 'player', importance: 1, char: pl.charId, sid: s ? s.id : null, npcs: [guard.id] });
      const done = (text, events) => {
        delete pl.wanted[f];
        if (s) Cap.place(game, s.x, s.y + 3);
        pl.hp = pl.maxHp * 0.7;
        ECHO.UI.modal({ title: 'Released', html: `<p>${text}</p>${ECHO.UI.eventsDigest(events || [], 'While you sat in the cells')}`, choices: [{ label: 'Leave', onPick: () => Cap.finish(game) }] });
      };
      ECHO.UI.modal({
        title: `Imprisoned in ${s ? s.name : 'the cells'}`,
        html: `<p><b>${P().fullTitle(world, guard)}</b> put you down and dragged you to the cells. ${world.factions[f].short} wants justice.</p>`,
        choices: [
          { label: `Serve your sentence (${days} days)`, onPick: () => game.fastForward(days, 'Stone walls. Bad bread.', ev => done('The gaoler opens the door. "Don\'t let me see you again."', ev)) },
          { label: `Pay the fine (${fine} crowns)`, disabled: pl.gold < fine, sub: pl.gold < fine ? `You have ${pl.gold}.` : '', onPick: () => { pl.gold -= fine; const fac = world.factions[f]; if (fac) fac.treasury += fine; game.fastForward(1, 'Signing papers.', ev => done('The magistrate pockets your coin.', ev)); } }
        ]
      });
    },

    // ------------------------------------------------------------ Death
    die(game, cause, killer) {
      const world = game.world, pl = game.pl;
      const homeName = (ECHO.Sim.settlement(world, pl.homeId) || {}).name;
      const bio = ECHO.Character.biography(world, pl);
      const legend = ECHO.Legacy.characterDies(world, pl, cause, killer);
      const sword = world.items[legend.weaponId];
      let swordFate = '';
      if (sword) {
        if (sword.holder && world.npcs[sword.holder]) swordFate = `${P().name(world.npcs[sword.holder])} keeps ${sword.name}.`;
        else { const ruin = world.ruins.find(r => r.relics.includes(sword.id)); swordFate = ruin ? `${sword.name} was carried off by grave robbers. No one knows where it ended up.` : ''; }
      }
      game.defeating = false;
      game.pl = null;
      game.save();
      ECHO.Screens.legendScreen({
        legend, bio, swordFate,
        house: legend.houseId ? `Their house in ${homeName} still stands.` : '',
        statue: legend.statue ? `The people of ${homeName} will raise a statue.` : '',
        onContinue: () => ECHO.Screens.characterCreation(world, true)
      });
    }
  };
  void U;
})();
