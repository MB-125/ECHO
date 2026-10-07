// Plights: requests for help that do NOT wait for the player.
// If ignored, the world resolves them — another hero may try (and succeed or
// die), a captive may escape and be changed by it, or it simply ends badly.
(function () {
  const { U } = ECHO;
  const P = () => ECHO.People;

  const Pl = ECHO.Plights = {
    open(world) { return world.plights.filter(p => p.status === 'open'); },
    byId(world, id) { return world.plights.find(p => p.id === id); },
    post(world, o) {
      const p = { id: U.uid('pl'), status: 'open', posted: world.day, accepted: false, progress: 0, outcome: null, ...o };
      world.plights.push(p);
      if (world.plights.length > 120) {
        const old = world.plights.findIndex(x => x.status !== 'open');
        if (old >= 0) world.plights.splice(old, 1);
      }
      return p;
    },
    close(world, p, status, outcome, importance = 1) {
      p.status = status; p.outcome = outcome; p.closed = world.day;
      if (outcome) ECHO.Chronicle.add(world, { text: outcome, kind: 'plight', importance, sid: p.sid, npcs: [p.victim, p.requester].filter(Boolean) });
      ECHO.emit('plight:closed', p);
    },

    createKidnap(world, victim, camp, rng) {
      const home = ECHO.Sim.settlement(world, victim.home) || ECHO.World.nearestSettlement(world, camp.x, camp.y, s => s.faction !== 'ashfang');
      if (!home) return;
      const kin = [...victim.parents, victim.spouse].map(id => id && world.npcs[id]).filter(n => n && n.status === 'alive');
      const requester = kin[0] || P().residents(world, home).find(n => (n.rel[victim.id] || 0) > 20) || null;
      const relWord = requester ? (victim.parents.includes(requester.id) ? (victim.sex === 'f' ? 'daughter' : 'son') : requester.spouse === victim.id ? (victim.sex === 'f' ? 'wife' : 'husband') : 'friend') : null;
      const text = requester
        ? `${requester.first} ${requester.last} begs for help: the Ashfang took ${requester.sex === 'f' ? 'her' : 'his'} ${relWord} ${victim.first} to ${camp.name}.`
        : `${victim.first} ${victim.last} of ${home.name} was taken by the Ashfang to ${camp.name}.`;
      Pl.post(world, { kind: 'kidnap', sid: home.id, requester: requester ? requester.id : null, victim: victim.id, campId: camp.id, deadline: world.day + rng.int(7, 11), reward: 60 + rng.int(0, 60), text, relWord });
      if (requester) P().remember(world, requester, `${victim.first} was taken by the Ashfang`, 'trauma', victim.id, 4);
      P().remember(world, victim, `was dragged off to ${camp.name}`, 'trauma', null, 5);
    },

    freeCaptive(world, c, byName, byPlayer) {
      const camp = world.camps.find(x => x.id === c.captiveAt);
      if (camp) camp.captives = camp.captives.filter(x => x !== c.id);
      c.status = 'alive'; c.captiveAt = null;
      const home = ECHO.Sim.settlement(world, c.home);
      c.loc = home ? home.id : c.home;
      c.flags.survivor = true;
      P().remember(world, c, `was freed from captivity by ${byName}`, 'gratitude', null, 5);
      const p = world.plights.find(x => x.kind === 'kidnap' && x.victim === c.id && x.status === 'open');
      if (p && !byPlayer) Pl.close(world, p, 'resolved', `${P().name(c)} was freed from ${camp ? camp.name : 'captivity'} by ${byName}.`, 2);
      return p;
    },

    dailyTick(world, rng) {
      Pl.autoPost(world, rng);
      for (const p of Pl.open(world)) {
        switch (p.kind) {
          case 'kidnap': Pl.tickKidnap(world, p, rng); break;
          case 'beasts': Pl.tickBeasts(world, p, rng); break;
          case 'famine': Pl.tickFamine(world, p, rng); break;
          case 'apex': Pl.tickApex(world, p, rng); break;
          case 'bounty': Pl.tickBounty(world, p, rng); break;
          case 'clearsite': case 'plot': break; // the realm settles these
          case 'lost': Pl.tickLost(world, p, rng); break;
          default: if (world.day > p.deadline && !p.claimable) Pl.close(world, p, 'failed', null);
        }
      }
    },

    autoPost(world, rng) {
      for (const s of world.settlements) {
        const open = world.plights.filter(p => p.sid === s.id && p.status === 'open');
        const region = ECHO.World.regionAt(world, s.x, s.y);
        if (s.hunger > 0.22 && !open.some(p => p.kind === 'famine') && rng.chance(0.3)) {
          const r = s.ruler && world.npcs[s.ruler];
          Pl.post(world, { kind: 'famine', sid: s.id, requester: r ? r.id : null, need: 20 + rng.int(0, 15), deadline: world.day + 12, reward: 0, text: `${s.name} is starving. ${r ? P().fullTitle(world, r) + ' will pay well for' : 'Anyone who can bring'} sacks of grain.` });
        }
        if (region.eco && region.eco.wolfDanger > 1.25 && !open.some(p => p.kind === 'beasts') && rng.chance(0.15)) {
          const hunter = P().residents(world, s).find(n => n.prof === 'hunter') || null;
          Pl.post(world, { kind: 'beasts', sid: s.id, requester: hunter ? hunter.id : null, regionId: region.id, need: 6, deadline: world.day + 10, reward: 45 + rng.int(0, 30), text: `Duskwolves are taking people in ${region.name}. ${hunter ? hunter.first + ' the hunter' : 'The reeve'} wants six of them dead.` });
        }
        const lair = world.lairs.find(l => l.villageId === s.id && l.boss.alive && l.boss.absentUntil <= world.day);
        if (lair && !open.some(p => p.kind === 'apex') && rng.chance(0.03)) {
          const grieving = P().residents(world, s).find(n => n.mem.some(m => m.type === 'grief')) || null;
          Pl.post(world, { kind: 'apex', sid: s.id, requester: grieving ? grieving.id : null, lairId: lair.id, deadline: world.day + 20, reward: 150 + rng.int(0, 80), text: `${lair.boss.name} ${lair.boss.title} haunts the land near ${s.name}. ${grieving ? grieving.first + ' wants it dead.' : 'The village fears it.'}` });
        }
        const f = world.factions[s.faction];
        if (f && f.type === 'kingdom' && f.capital === s.id) {
          const camp = world.camps.find(c => c.alive && c.raids >= 2 && !world.plights.some(p => p.kind === 'bounty' && p.campId === c.id && p.status === 'open'));
          if (camp && rng.chance(0.2)) {
            const r = f.ruler && world.npcs[f.ruler];
            Pl.post(world, { kind: 'bounty', sid: s.id, requester: r ? r.id : null, campId: camp.id, deadline: world.day + 25, reward: 120 + camp.members.length * 15, text: `${r ? P().fullTitle(world, r) : f.name} offers a bounty for the head of ${camp.leader ? P().name(world.npcs[camp.leader]) : 'the outlaw chief'} of ${camp.name}.` });
          }
        }
      }
    },

    tickKidnap(world, p, rng) {
      const v = world.npcs[p.victim];
      const camp = world.camps.find(c => c.id === p.campId);
      if (!v || v.status === 'dead') { Pl.close(world, p, 'failed', null); return; }
      if (v.status !== 'captive') { if (p.status === 'open') Pl.close(world, p, 'resolved', null); return; }
      if (!camp || !camp.alive) { Pl.freeCaptive(world, v, 'the scattering of the outlaws'); return; }
      // She might escape by herself.
      const brave = P().has(v, 'brave') ? 2.2 : P().has(v, 'cowardly') ? 0.4 : 1;
      if (rng.chance(0.022 * brave)) {
        Pl.freeCaptive(world, v, 'her own wits', true);
        v.traits = v.traits.filter(t => t !== 'cowardly');
        if (!v.traits.includes('brave')) v.traits[0] = 'brave';
        v.renown += 8;
        if (P().age(world, v) >= 15 && v.prof !== 'child') { v.prof = 'guard'; v.skill.fight = Math.max(v.skill.fight, 30); }
        Pl.close(world, p, 'resolved', `${P().name(v)} escaped from ${camp.name} alone, in the dark, and walked home. ${v.sex === 'f' ? 'She' : 'He'} has not been the same since.`, 2);
        P().remember(world, v, 'escaped the Ashfang alone', 'pride', null, 5);
        return;
      }
      // Someone else attempts a rescue.
      if (world.day - p.posted >= 2 && rng.chance(0.1)) {
        const home = ECHO.Sim.settlement(world, p.sid);
        const cands = home ? P().residents(world, home).filter(n => n.status === 'alive' && P().age(world, n) > 17 && (n.prof === 'guard' || n.prof === 'wanderer' || n.id === p.requester || (P().has(n, 'brave') && n.skill.fight > 30))) : [];
        if (cands.length) {
          const r = cands.reduce((a, b) => (a.skill.fight + (a.id === p.requester ? 15 : 0)) > (b.skill.fight + (b.id === p.requester ? 15 : 0)) ? a : b);
          const str = ECHO.Politics.campStrength(world, camp);
          const pWin = U.clamp((r.skill.fight + 10) / (r.skill.fight + 10 + str * 0.35), 0.08, 0.85);
          if (rng.chance(pWin)) {
            Pl.freeCaptive(world, v, P().name(r), true);
            r.renown += 12; P().bond(r, v.id, 60); P().bond(v, r.id, 70);
            P().remember(world, r, `rescued ${v.first} from ${camp.name}`, 'pride', v.id, 5);
            Pl.close(world, p, 'resolved', `${P().name(r)} crept into ${camp.name} and brought ${v.first} home alive.`, 2);
          } else {
            if (rng.chance(0.7)) P().kill(world, r, `killed trying to rescue ${v.first} from ${camp.name}`);
            else { r.status = 'captive'; r.captiveAt = camp.id; r.loc = null; camp.captives.push(r.id); }
            ECHO.Chronicle.add(world, { text: `${P().name(r)} went to ${camp.name} to bring back ${v.first}, and did not return.`, kind: 'plight', importance: 2, sid: p.sid, npcs: [r.id, v.id] });
          }
          return;
        }
      }
      if (world.day >= p.deadline) {
        if (P().has(v, 'fickle') || P().has(v, 'greedy') || P().has(v, 'cruel')) {
          v.status = 'alive'; v.captiveAt = null;
          camp.captives = camp.captives.filter(x => x !== v.id);
          ECHO.Politics.joinCamp(world, v, camp);
          Pl.close(world, p, 'failed', `No one came for ${P().name(v)}. In time, ${v.sex === 'f' ? 'she' : 'he'} took up a knife and joined the Ashfang of ${camp.name}.`, 2);
        } else if (rng.chance(0.5)) {
          P().kill(world, v, `died in captivity at ${camp.name}`);
          Pl.close(world, p, 'failed', `No one came for ${v.first}.`, 2);
        } else {
          camp.captives = camp.captives.filter(x => x !== v.id);
          v.status = 'dead'; v.diedDay = world.day; v.cause = 'sold to slavers across the sea';
          const rq = p.requester && world.npcs[p.requester];
          Pl.close(world, p, 'failed', `${P().name(v)} was sold to slavers across the sea.${rq && rq.status === 'alive' ? ' ' + rq.first + ' still asks travellers if they have seen ' + (v.sex === 'f' ? 'her' : 'him') + '.' : ''}`, 2);
        }
      }
    },

    tickBeasts(world, p, rng) {
      const r = world.regions[p.regionId];
      if (p.progress >= p.need) return;
      if (r.eco && r.eco.wolfDanger < 0.6) { Pl.close(world, p, 'resolved', `The duskwolves of ${r.name} have thinned and moved on.`, 0); return; }
      if (world.day >= p.deadline) {
        const s = ECHO.Sim.settlement(world, p.sid);
        const hunters = s ? P().residents(world, s).filter(n => ['hunter', 'guard', 'wanderer'].includes(n.prof)) : [];
        if (hunters.length) {
          const lost = hunters.filter(() => rng.chance(0.25));
          lost.forEach(h => P().kill(world, h, 'killed hunting duskwolves'));
          ECHO.Ecology.recordKill(world, r, 'wolf', 'ranged', rng.int(2, 5));
          Pl.close(world, p, 'resolved', `The hunters of ${s.name} went after the wolves themselves${lost.length ? '; ' + U.listJoin(lost.map(l => l.first)) + ' did not come back' : ''}.`, 1);
        } else Pl.close(world, p, 'failed', null);
      }
    },

    tickFamine(world, p) {
      const s = ECHO.Sim.settlement(world, p.sid);
      if (!s) return Pl.close(world, p, 'failed', null);
      if (s.hunger < 0.05 && p.progress === 0) { Pl.close(world, p, 'resolved', null); return; }
      if (world.day >= p.deadline) Pl.close(world, p, 'failed', null);
    },

    tickApex(world, p, rng) {
      const lair = world.lairs.find(l => l.id === p.lairId);
      if (!lair || !lair.boss.alive) { Pl.close(world, p, 'resolved', null); return; }
      if (world.day >= p.deadline) {
        const s = ECHO.Sim.settlement(world, p.sid);
        const hero = s ? P().residents(world, s).filter(n => (n.prof === 'wanderer' || n.prof === 'guard') && P().has(n, 'brave')).sort((a, b) => b.skill.fight - a.skill.fight)[0] : null;
        if (hero) {
          const pWin = U.clamp(hero.skill.fight / 260, 0.03, 0.25);
          if (rng.chance(pWin)) {
            lair.boss.alive = false; lair.boss.killedBy = P().name(hero); lair.boss.diedDay = world.day;
            hero.renown += 30;
            Pl.close(world, p, 'resolved', `${P().name(hero)} of ${s.name} slew ${lair.boss.name} ${lair.boss.title}! The bards are already singing.`, 3);
          } else {
            P().kill(world, hero, `slain by ${lair.boss.name} ${lair.boss.title}`);
            lair.boss.kills++;
            lair.boss.memory.knownFoes[hero.id] = { name: P().name(hero), d: world.day, outcome: 'killed' };
            Pl.close(world, p, 'failed', `${P().name(hero)} went to face ${lair.boss.name} and was never seen again.`, 2);
          }
        } else Pl.close(world, p, 'failed', null);
      }
    },

    tickBounty(world, p) {
      const camp = world.camps.find(c => c.id === p.campId);
      if (!camp || !camp.alive) { if (!p.playerDone) Pl.close(world, p, 'resolved', null); return; }
      if (world.day >= p.deadline) Pl.close(world, p, 'failed', null);
    },

    tickLost(world, p, rng) {
      const v = world.npcs[p.victim];
      if (!v || v.status !== 'alive') { Pl.close(world, p, 'failed', null); return; }
      if (!v.lost) { if (p.status === 'open') Pl.close(world, p, 'resolved', null); return; }
      if (world.day >= p.deadline) {
        v.lost = false;
        if (rng.chance(0.55)) { v.loc = v.home; Pl.close(world, p, 'resolved', `${P().name(v)} found the way home alone, scratched and starving, after ${world.day - p.posted} days in the wilds.`, 1); }
        else { P().kill(world, v, 'lost in the wilds'); Pl.close(world, p, 'failed', `${P().name(v)} was never found.`, 2); }
      }
    },
    heroArrive() { /* reserved for visible hero journeys */ },

    // ---- Player-facing helpers
    playerKilledWolf(world, region) {
      for (const p of Pl.open(world)) if (p.kind === 'beasts' && p.regionId === region.id) p.progress++;
    }
  };
})();
