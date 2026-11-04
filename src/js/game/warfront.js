// Battles fought in front of you.
//
// When a kingdom's host comes within sight of an enemy town while you are near, the march
// stops and the battle is fought for real: horns, the townsfolk running indoors, the garrison
// turning out to meet the host, soldier against soldier — each with their own level, gear,
// rank and life — and you in the middle of it if you choose. Inside the walls (or knighted by
// the town's crown) you are a defender, and the host will come for you; knighted by the
// attacking crown, you fight with the host and the garrison will come for you; standing off
// outside the town, nobody minds you.
//
// It ends when the host is thrown back (most of it dead or fled), when the garrison is broken,
// when it has gone on too long (the reckoning in politics.js then weighs what was seen), or
// when you walk away from it. The dead stay dead. Fight on the winning side and the crown you
// fought for remembers.
(function () {
  const { U } = ECHO;
  const P = () => ECHO.People;
  const Mil = () => ECHO.Military;

  const WF = ECHO.Warfront = {
    live: null, _t: 0,
    reset() { WF.live = null; WF._t = 0; },
    nowMin(world) { return world.day * 1440 + world.minute; },
    // a battle on at this town now (the townsfolk keep indoors)
    alarmAt(s) { return !!(WF.live && s && WF.live.sid === s.id); },

    update(game, dt) {
      WF._t -= dt;
      if (WF._t > 0) return;
      WF._t = 0.5;
      const world = game.world, pe = game.pe;
      if (!pe || !world.journeys) return;
      if (WF.live) return WF.tick(game);
      if (ECHO.Interior && ECHO.Interior.cur) return;
      for (const j of world.journeys) {
        if (j.kind !== 'army' || !j.army || j.army.type !== 'war' || j.liveDone) continue;
        const s = ECHO.Sim.settlement(world, j.army.target);
        if (!s || s.faction === j.army.faction) continue;
        const p = ECHO.Sim.journeyPos(world, j);
        if (U.dist(p.x, p.y, s.x, s.y) > 20 || U.dist(pe.x, pe.y, s.x, s.y) > 42) continue;
        const host = game.ents.filter(e => e.journeyId === j.id && !e.dead);
        if (host.length < 3) continue;
        WF.begin(game, j, s, host);
        return;
      }
    },

    begin(game, j, s, host) {
      const world = game.world, pl = game.pl, pe = game.pe;
      const att = world.factions[j.army.faction], def = world.factions[s.faction];
      j.hold = WF.nowMin(world) + 900;
      const cmd = world.npcs[j.army.commander];
      const B = WF.live = {
        jid: j.id, sid: s.id, att: att.id, def: def.id, t: 0, n0: j.npcs.filter(id => world.npcs[id] && world.npcs[id].status === 'alive').length,
        d0: 0, kills: 0, side: pl.knighted === att.id ? 'att' : pl.knighted === def.id ? 'def' : null, told: false, cmd: cmd ? cmd.id : null
      };
      const p = ECHO.Sim.journeyPos(world, j);
      const ang = Math.atan2(p.y - s.y, p.x - s.x);
      B.front = { x: s.x + Math.cos(ang) * 7, y: s.y + Math.sin(ang) * 7 };
      host.forEach((e, i) => {
        const a = ang + Math.PI + (i % 5 - 2) * 0.22, r = 1.5 + Math.floor(i / 5) * 1.2;
        e.assault = { sid: s.id, jid: j.id, x: s.x + Math.cos(a + Math.PI) * r * 0.4, y: s.y + Math.sin(a + Math.PI) * r * 0.4 };
      });
      WF._kills = 0;
      WF.muster(game, s);
      B.d0 = Math.max(1, game.ents.filter(e => e.warDef === s.id && !e.dead).length);
      // the town takes cover
      for (const e of game.ents) if (e.type === 'person' && e.homeSid === s.id && e.role === 'villager' && !e.dead) { e.schedT = Math.random() * 1.5; e.goal = null; }
      const near = U.dist(pe.x, pe.y, s.x, s.y) < 22;
      if (!B.side && near) B.side = 'def';
      game.ui.banner(`The battle for ${s.name}`, `${B.n0} soldiers of ${att.short}${cmd ? ' under ' + P().fullTitle(world, cmd) : ''} against the garrison of ${def.short}`);
      game.ui.toast(B.side === 'att' ? `You march with ${att.short}: the garrison of ${s.name} is your enemy. Break it.` : B.side === 'def' ? `You are inside ${s.name} as the host of ${att.short} comes on — they will take you for one of the defenders. Stand with the garrison, or get out of the town.` : `The host of ${att.short} is storming ${s.name}. Keep outside the town and no one will take you for a side — go in, and you will be one of its defenders.`, 'warn', 8);
      if (ECHO.Sfx) ECHO.Sfx.play('horn');
      if (ECHO.Music) ECHO.Music.stinger('fate');
    },
    // the garrison turns out: every soldier of the town in reach comes out to meet the host
    muster(game, s) {
      for (const e of game.ents) {
        if (e.dead || e.type !== 'person' || e.faction !== s.faction) continue;
        if (!(e.role === 'guard' || (e.npcId && (game.world.npcs[e.npcId] || {}).prof === 'guard'))) continue;
        if (U.dist(e.x, e.y, s.x, s.y) > 30 || e.journeyId) continue;
        e.warDef = s.id; e.hidden = false; e.sleeping = false; e.indoor = false;
        if (e.role !== 'guard') e.role = 'guard';
      }
    },

    tick(game) {
      const world = game.world, B = WF.live, pl = game.pl, pe = game.pe;
      const j = (world.journeys || []).find(x => x.id === B.jid), s = ECHO.Sim.settlement(world, B.sid);
      B.t += 0.5;
      if (!j || !s || s.faction !== B.def) return WF.end(game, j, s, 'gone');
      const att = game.ents.filter(e => e.assault && e.assault.jid === j.id && !e.dead && !e.rout);
      const defs = game.ents.filter(e => e.warDef === s.id && !e.dead && !e.rout && !e.yielded);
      const aliveA = j.npcs.filter(id => world.npcs[id] && world.npcs[id].status === 'alive').length;
      // more of the host comes up as it is spawned near you
      for (const e of game.ents) if (e.journeyId === j.id && !e.dead && !e.assault) e.assault = { sid: s.id, jid: j.id, x: s.x, y: s.y };
      if (B.t % 3 < 0.5) WF.muster(game, s);
      // which side you are on: inside the town you are a defender
      const dS = U.dist(pe.x, pe.y, s.x, s.y);
      if (!B.side && dS < 16) { B.side = 'def'; game.ui.toast(`You are inside ${s.name}: the host of ${world.factions[B.att].short} takes you for a defender now.`, 'warn', 5); }
      // everyone finds someone to fight
      for (const e of att) if (!e.target || e.target.dead) { const t = WF.nearest(game, e, defs.concat(B.side === 'def' ? [pe] : []), 24); if (t) e.target = t; }
      for (const e of defs) if (!e.target || e.target.dead) { const t = WF.nearest(game, e, att.concat(B.side === 'att' ? [pe] : []), 24); if (t) e.target = t; }
      // a word now and then
      if (Math.random() < 0.25) {
        const all = att.concat(defs), e = all[Math.floor(Math.random() * all.length)];
        if (e && !(e.sayT > 0)) { e.say = e.assault ? ['For ' + world.factions[B.att].short + '!', 'Take the gate!', 'Forward!', 'Cut them down!', 'Hold the line!'][Math.floor(Math.random() * 5)] : ['Hold the gate!', 'For ' + s.name + '!', 'Shields up!', 'Drive them back!', 'Not one step!'][Math.floor(Math.random() * 5)]; e.sayT = 1.6; }
      }
      if (dS > 80) return WF.end(game, j, s, 'left');
      if (aliveA <= Math.max(1, Math.round(B.n0 * 0.25)) || (B.t > 8 && !att.length && aliveA < B.n0)) return WF.end(game, j, s, 'repelled');
      const garrison = Mil() ? Mil().soldiers(world, s).filter(n => !game.ents.some(e => e.npcId === n.id && e.dead)).length : defs.length;
      if (B.t > 6 && !defs.length && garrison <= Math.max(1, Math.round(B.d0 * 0.2))) return WF.end(game, j, s, 'broke');
      if (B.t > 6 && !defs.length && att.length >= 3) return WF.end(game, j, s, 'broke');
      if (B.t > 200) return WF.end(game, j, s, 'stalemate');
    },
    nearest(game, e, list, r) {
      let best = null, bd = r;
      for (const o of list) { if (!o || o.dead || o.hidden) continue; const d = U.dist(e.x, e.y, o.x, o.y); if (d < bd && game.hostileTo(e, o)) { bd = d; best = o; } }
      return best;
    },

    end(game, j, s, why) {
      const world = game.world, B = WF.live, pl = game.pl;
      WF.live = null;
      const att = world.factions[B.att], def = world.factions[B.def];
      const aliveA = j ? j.npcs.filter(id => world.npcs[id] && world.npcs[id].status === 'alive').length : 0;
      const aliveD = s && Mil() ? Mil().soldiers(world, s).length : 0;
      for (const e of game.ents) { if (e.warDef === (s && s.id)) { e.warDef = null; e.target = e.target === game.pe ? null : e.target; } }
      if (!j || !s) { for (const e of game.ents) if (e.assault && e.assault.jid === B.jid) { e.assault = null; e.despawnSoon = true; } return; }
      j.liveDone = true; j.hold = 0;
      const fallenA = B.n0 - aliveA;
      if (why === 'left' || why === 'gone') {
        for (const e of game.ents) if (e.assault && e.assault.jid === j.id) e.assault = null;
        return;
      }
      if (why === 'repelled') {
        // what is left of the host falls back and goes home
        for (const e of game.ents) if (e.assault && e.assault.jid === j.id && !e.dead) { e.assault = null; e.rout = { x: s.x, y: s.y, t: 0 }; e.say = ['Fall back!', 'Retreat!', 'Back — back!'][Math.floor(Math.random() * 3)]; e.sayT = 2; }
        world.journeys = world.journeys.filter(x => x !== j);
        const survivors = j.npcs.map(id => world.npcs[id]).filter(n => n && n.status === 'alive');
        for (const n of survivors) n.journey = null;
        ECHO.Politics.armyGoHome(world, survivors, ECHO.Sim.settlement(world, j.from) || s);
        att.casualties = (att.casualties || 0) + fallenA;
        ECHO.Chronicle.add(world, { text: `${s.name} threw back the host of ${att.short}: ${fallenA} of its ${B.n0} soldiers fell before the town${B.side === 'def' ? `, and ${pl.first} ${pl.last} fought on the walls with the garrison` : ''}.`, kind: 'war', importance: 2, sid: s.id });
        if (Mil()) Mil().log(world, { sid: s.id, att: att.id, def: def.id, won: false, live: true, text: `${s.name} threw back ${att.short} — ${fallenA} attackers fell${B.side === 'def' ? ', you among the defenders' : ''}.` });
        for (const n of P().residents(world, s)) if (n.prof === 'guard') n.renown = (n.renown || 0) + 4;
        game.ui.banner(`${s.name} holds`, `The host of ${att.short} falls back`);
        if (B.side === 'def') WF.reward(game, s, def, 'held');
        else if (B.side === 'att') game.ui.toast(`The host breaks on ${s.name} and falls back. There is nothing to be won here today.`, 'warn', 6);
        return;
      }
      // the garrison broke (or it went on and on): the host marches on into the town and the
      // reckoning is made (politics.js), weighted by what was seen on the field
      j.army.live = { why, a: aliveA, d: aliveD };
      j.pos = Math.max(j.pos, j.path.length - 1.01);
      for (const e of game.ents) if (e.assault && e.assault.jid === j.id) e.assault = null;
      game.ui.banner(why === 'broke' ? `The garrison of ${s.name} breaks` : `The battle for ${s.name} grinds on`, why === 'broke' ? `${att.short} is in the town` : 'The day will decide it');
      const before = s.faction, ents = game.ents.filter(e => e.journeyId === j.id && !e.dead);
      ECHO.Sim.endJourney(world, j, true);
      // the host's soldiers stay with what they have done: the ones left to hold the town are its
      // garrison now, the rest take the road home
      for (const e of ents) {
        const n = world.npcs[e.npcId];
        if (!n || n.status !== 'alive') continue;
        if (n.journey) { e.journeyId = n.journey; continue; }
        e.journeyId = null; e.homeSid = n.home; e.role = 'guard'; e.goal = null; e.schedT = 0;
      }
      if (s.faction !== before && B.side === 'att') WF.reward(game, s, att, 'took');
      else if (s.faction === before && why === 'stalemate' && B.side === 'def') WF.reward(game, s, def, 'held');
    },
    // the crown you fought for remembers it
    reward(game, s, f, how) {
      const world = game.world, pl = game.pl, k = WF._kills || 0;
      WF._kills = 0;
      const gold = 80 + 20 * Math.min(10, k), ren = 20 + 4 * Math.min(10, k);
      pl.gold += gold; pl.renown += ren;
      if (ECHO.Chronicle.deed) ECHO.Chronicle.deed(world, { text: how === 'held' ? `${pl.first} ${pl.last} fought with the garrison of ${s.name} and threw back the host that came for it${k ? ` — ${k} of the enemy fell to ${pl.first}'s own hand` : ''}.` : `${pl.first} ${pl.last} marched with ${f.short} and took ${s.name}${k ? ` — ${k} of its defenders fell to ${pl.first}'s own hand` : ''}.`, importance: 3, sid: s.id, rep: how === 'held' ? 12 : 4, tag: how === 'held' ? 'protect' : 'fight', factionRep: { [f.id]: 12 } });
      if (how === 'held') { s.rep = s.rep || {}; s.rep[pl.charId] = U.clamp((s.rep[pl.charId] || 0) + 15, -100, 100); }
      if (ECHO.Monsters && ECHO.Monsters.dropGear) ECHO.Monsters.dropGear(game, game.pe.x + 1, game.pe.y, (ECHO.Prowess ? ECHO.Prowess.level(pl) : 4) + 2, 30, `the gift of the ${how === 'held' ? 'garrison of ' + s.name : 'Marshal of ' + f.short}`);
      game.ui.toast(`${how === 'held' ? `The captain of ${s.name}` : `The Marshal of ${f.short}`} gives you ${gold} crowns and a fine piece of gear (at your feet) for the day's work.${k ? ` (${k} fell to you.)` : ''} ${f.short} will not forget it.`, 'legend', 8);
      const kr = f.ruler && world.npcs[f.ruler];
      if (kr && kr.status === 'alive') kr.op[pl.charId] = U.clamp((kr.op[pl.charId] || 0) + 15, -100, 100);
    },
    // one of the enemy cut down by you, in the battle: war, not murder
    onKill(game, ent, npc) {
      const B = WF.live;
      if (!B) return false;
      if ((B.side === 'def' && ent.assault) || (B.side === 'att' && ent.warDef)) {
        WF._kills = (WF._kills || 0) + 1;
        game.pl.kills['soldiers in battle'] = (game.pl.kills['soldiers in battle'] || 0) + 1;
        game.pl.renown += npc.rank >= 2 ? 6 : 2;
        return true;
      }
      return false;
    },
    // who is your enemy in the battle
    foe(e) {
      const B = WF.live;
      if (!B) return false;
      return (B.side === 'def' && !!e.assault && e.assault.jid === B.jid) || (B.side === 'att' && e.warDef === B.sid);
    },
    // a soldier of the host with no one to fight comes on toward the town
    think(game, e, npc, dt, target) {
      if (!WF.live || e.assault.jid !== WF.live.jid) { if (!WF.live) e.assault = null; return false; }
      if (target) return false;
      const g = e.assault, a = (e.slot || 0) * 2.39;
      const gx = g.x + Math.cos(a) * 2.5, gy = g.y + Math.sin(a) * 2.5;
      if (U.dist(e.x, e.y, gx, gy) > 1.2) ECHO.Ent.travel(game.world, e, gx, gy, e.speed * 0.95, dt);
      else e.moving = false;
      return true;
    },
    // a defender with no one to fight takes their place before the town, between it and the host
    defThink(game, e, npc, dt, target) {
      const B = WF.live;
      if (!B || e.warDef !== B.sid) { e.warDef = null; return false; }
      if (target) return false;
      const a = (ECHO.hashStr(e.npcId || String(e.id)) % 628) / 100;
      const gx = B.front.x + Math.cos(a) * 3, gy = B.front.y + Math.sin(a) * 3;
      if (U.dist(e.x, e.y, gx, gy) > 1.5) ECHO.Ent.travel(game.world, e, gx, gy, e.speed, dt);
      else { e.moving = false; e.dir = Math.atan2(B.front.y - e.y, B.front.x - e.x); }
      return true;
    },
    // for the HUD: how the battle stands
    hud(game) {
      const B = WF.live;
      if (!B) return '';
      const world = game.world, j = (world.journeys || []).find(x => x.id === B.jid), s = ECHO.Sim.settlement(world, B.sid);
      if (!j || !s) return '';
      const a = j.npcs.filter(id => world.npcs[id] && world.npcs[id].status === 'alive').length;
      const d = game.ents.filter(e => e.warDef === s.id && !e.dead).length;
      return `<b>Battle for ${s.name}</b> · ${world.factions[B.att].short} <span class="ember">${a}</span> / ${B.n0} vs ${world.factions[B.def].short} <span class="gold">${d}</span>${B.side ? ` · you: ${B.side === 'def' ? 'a defender' : 'with the host'}` : ' · you: outside it'}${WF._kills ? ` · ${WF._kills} by your hand` : ''}`;
    }
  };
})();
