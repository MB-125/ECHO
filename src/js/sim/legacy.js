// Characters and Legacy.
// There is no class screen: you become what you repeatedly do. When a
// character finally dies, they are not erased — their house stands, their
// sword ends up somewhere in the world, statues may rise, children are named
// after them, and you continue as someone new in the same world.
(function () {
  const { U } = ECHO;
  const P = () => ECHO.People;

  const SKILLS = ECHO.SKILLS = {
    blade: { name: 'Blade', noun: ['Brawler', 'Duelist', 'Blademaster'] },
    archery: { name: 'Archery', noun: ['Hunter', 'Archer', 'Marksman'] },
    flame: { name: 'Flame', noun: ['Firestarter', 'Pyromancer', 'Flamecaller'] },
    ward: { name: 'Ward', noun: ['Shieldbearer', 'Warden', 'Bulwark'] },
    study: { name: 'Study', noun: ['Observer', 'Naturalist', 'Loremaster'] },
    shadow: { name: 'Shadow', noun: ['Sneak', 'Nightstalker', 'Shade'] },
    tongue: { name: 'Tongue', noun: ['Talker', 'Silver-tongue', 'Voice of the Realm'] },
    endurance: { name: 'Endurance', noun: ['Walker', 'Wayfarer', 'Tireless'] }
  };

  const Ch = ECHO.Character = {
    makeItem(world, o) {
      const id = 'i' + (world.nextItem++);
      const it = { id, kind: o.kind, name: o.name, dmg: o.dmg || 0, made: o.made || null, history: o.history || [], holder: o.holder || null, kills: 0, legend: null, droppedAt: null, tier: o.tier || 1 };
      world.items[id] = it;
      return it;
    },
    itemTitle(world, it) {
      if (!it) return '';
      return it.legend ? `${it.name}` : it.name;
    },
    create(world, rng, o) {
      const home = ECHO.Sim.settlement(world, o.homeId) || world.settlements[0];
      const charId = 'c' + (world.characters.length + 1) + '_' + rng.int(100, 999);
      const smith = P().residents(world, home).find(n => n.prof === 'smith');
      const sword = Ch.makeItem(world, { kind: 'sword', name: 'Iron sword', dmg: 14, made: { by: smith ? P().name(smith) : 'an unknown smith', at: home.name, d: world.day }, holder: 'player', history: [{ d: world.day, t: `forged${smith ? ' by ' + P().name(smith) : ''} in ${home.name}` }] });
      const bow = Ch.makeItem(world, { kind: 'bow', name: 'Hunting bow', dmg: 11, holder: 'player', history: [{ d: world.day, t: 'strung in ' + home.name }] });
      // A house of their own
      const house = home.buildings.find(b => b.type === 'house' && !b.owner && !b.legend);
      if (house) house.owner = charId;
      const spawn = ECHO.Game ? ECHO.Game.freeSpotNear(world, home.x, home.y + 2) : { x: home.x + 0.5, y: home.y + 2.5 };
      const pl = {
        charId, first: o.first, last: o.last || ECHO.makeSurname(rng, (world.factions[home.faction] || {}).culture || 'valdren'), homeId: home.id, born: world.day - 20 * ECHO.TIME.YEAR_DAYS, alive: true, startDay: world.day,
        x: spawn.x, y: spawn.y, hp: 100, maxHp: 100, stamina: 100, maxSta: 100, mana: 60, maxMana: 60, gold: 25,
        skills: { blade: 5, archery: 5, flame: 2, ward: 4, study: 3, shadow: 2, tongue: 4, endurance: 4 },
        behave: { aggression: 0, caution: 0, reckless: 0, mercy: 0, cruelty: 0, betrayal: 0, protect: 0, curiosity: 0, night: 0 },
        fate: 3, renown: 0, deeds: [], kills: {}, known: [], studied: {}, inv: { food: 3, herbs: 2, arrows: 24, ore: 0, timber: 0, arms: 0, meat: 0, hide: 0 },
        items: [sword.id, bow.id], weapon: sword.id, bow: bow.id, spells: [], companion: null, capture: null, accepted: [], houseId: house ? house.id : null,
        legacyOf: world.legends.length ? world.legends[world.legends.length - 1].charId : null, mana_overcast: 0, captures: 0
      };
      world.player = pl;
      world.characters.push({ charId, name: o.first + ' ' + pl.last, alive: true });
      // Earlier generations are remembered by the town
      for (const n of P().residents(world, home)) n.op[charId] = (n.op[charId] || 0) + 8;
      ECHO.Chronicle.add(world, { text: `${o.first} ${pl.last} came of age in ${home.name}${pl.legacyOf ? ', in a world still marked by ' + world.legends[world.legends.length - 1].name : ''}.`, kind: 'player', importance: 1, sid: home.id, char: charId });
      ECHO.Chronicle.learnAt(world, home);
      return pl;
    },
    // Skills grow by use, with diminishing returns.
    train(pl, skill, amount) {
      const v = pl.skills[skill];
      pl.skills[skill] = Math.min(100, v + amount * (1 - v / 112));
    },
    behave(pl, key, amount) {
      pl.behave[key] = (pl.behave[key] || 0) + amount;
    },
    // 0..1 tendency, relative to everything else they do.
    tendency(pl, key) {
      const b = pl.behave;
      const total = U.sum(Object.values(b)) + 25;
      return U.clamp((b[key] || 0) / total * 3, 0, 1);
    },
    title(pl) {
      const entries = Object.entries(pl.skills).sort((a, b) => b[1] - a[1]);
      const [top, val] = entries[0];
      const tier = val > 60 ? 2 : val > 28 ? 1 : 0;
      let noun = SKILLS[top].noun[tier];
      if (val < 12) noun = 'Nobody in Particular';
      const t = k => Ch.tendency(pl, k);
      const adjs = [
        ['Faithless', t('betrayal') * 1.6],
        ['Cruel', t('cruelty') * 1.3],
        ['Reckless', t('reckless') * (pl.skills.flame > 15 ? 1.3 : 0.7)],
        ['Relentless', t('aggression')],
        ['Merciful', t('mercy') * 1.2],
        ['Steadfast', t('protect') * 1.3],
        ['Patient', t('caution')],
        ['Curious', t('curiosity')],
        ['Night-born', t('night')]
      ].sort((a, b) => b[1] - a[1]);
      const adj = adjs[0][1] > 0.18 ? adjs[0][0] + ' ' : '';
      if (val < 12) return adj ? 'the ' + adj + 'Stranger' : 'Nobody in Particular';
      return 'the ' + adj + noun;
    },
    // A biography assembled from what they actually did.
    biography(world, pl) {
      const lines = [];
      const age = Math.floor((world.day - pl.born) / ECHO.TIME.YEAR_DAYS);
      const home = ECHO.Sim.settlement(world, pl.homeId);
      lines.push(`${pl.first} ${pl.last}, ${age} years old, of ${home ? home.name : 'nowhere'}.`);
      const sk = Object.entries(pl.skills).sort((a, b) => b[1] - a[1]);
      lines.push(`Known for ${SKILLS[sk[0][0]].name.toLowerCase()} (${Math.round(sk[0][1])}) and ${SKILLS[sk[1][0]].name.toLowerCase()} (${Math.round(sk[1][1])}).`);
      const t = k => Ch.tendency(pl, k);
      const notes = [];
      if (t('aggression') > 0.25) notes.push('strike first and keep striking — quicker hands, thinner guard');
      if (t('caution') > 0.25) notes.push('wait for openings; guarding costs them little');
      if (t('reckless') > 0.2) notes.push('pour more into each spell than is safe — great power, unstable flame');
      if (t('protect') > 0.2) notes.push('stand between the weak and harm, and people have noticed');
      if (t('betrayal') > 0.15) notes.push('have broken faith before, and strangers whisper about it');
      if (t('cruelty') > 0.2) notes.push('show little mercy');
      if (t('mercy') > 0.2) notes.push('spare those who yield');
      if (t('curiosity') > 0.2) notes.push('stop to study what others only kill');
      if (t('night') > 0.25) notes.push('do their work after dark');
      if (notes.length) lines.push('They ' + U.listJoin(notes) + '.');
      const kills = Object.entries(pl.kills).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${v} ${k}`);
      if (kills.length) lines.push('Has killed ' + U.listJoin(kills) + '.');
      if (pl.captures) lines.push(`Has been taken captive ${U.plural(pl.captures, 'time')}.`);
      if (pl.fate < 3) lines.push(`Has cheated death ${3 - pl.fate} ${3 - pl.fate === 1 ? 'time' : 'times'}. Fate is running thin.`);
      return lines;
    }
  };

  const L = ECHO.Legacy = {
    // Permanent death. Returns the legend record.
    characterDies(world, pl, cause, killer) {
      const rng = ECHO.Sim.rngFor(world);
      const home = ECHO.Sim.settlement(world, pl.homeId);
      pl.alive = false;
      const entry = world.characters.find(c => c.charId === pl.charId);
      if (entry) entry.alive = false;
      const deeds = world.chronicle.filter(e => e.char === pl.charId && e.imp >= 1).slice(-6).map(e => e.text);
      const legend = {
        charId: pl.charId, first: pl.first, last: pl.last, name: pl.first + ' ' + pl.last, epithet: Ch.title(pl),
        homeId: pl.homeId, born: pl.born, died: world.day, cause, renown: pl.renown, deeds, kills: { ...pl.kills },
        weaponId: pl.weapon, statue: false, houseId: pl.houseId, skills: { ...pl.skills }, killer: killer || null
      };
      world.legends.push(legend);
      // The weapon: kept by the killer, or lost to a ruin to be found again.
      const sword = world.items[pl.weapon];
      if (sword) {
        sword.legend = pl.charId;
        sword.name = `${pl.first}'s ${sword.name.replace(/^.*?'s /, '')}`;
        if (killer && killer.npcId && world.npcs[killer.npcId] && world.npcs[killer.npcId].status === 'alive') {
          const k = world.npcs[killer.npcId];
          k.carry = sword.id; sword.holder = k.id;
          sword.history.push({ d: world.day, t: `taken by ${P().name(k)} from the body of ${legend.name}` });
          k.renown += 25;
          P().remember(world, k, `killed ${legend.name} and took ${pl.first}'s sword`, 'pride', null, 5);
        } else if (world.ruins.length) {
          const ruin = rng.pick(world.ruins);
          sword.holder = null; ruin.relics.push(sword.id);
          sword.history.push({ d: world.day, t: `carried off by grave robbers and lost in ${ruin.name}` });
        }
      }
      // Other belongings stay in the house as heirlooms.
      for (const id of pl.items) {
        if (id === pl.weapon) continue;
        const it = world.items[id];
        if (it) { it.holder = 'house:' + pl.houseId; it.history.push({ d: world.day, t: `left in the house of ${legend.name}` }); }
      }
      if (pl.houseId && home) {
        const b = home.buildings.find(x => x.id === pl.houseId);
        if (b) { b.legend = pl.charId; b.owner = null; b.heirloom = pl.items.filter(i => i !== pl.weapon); b.heirloomGold = Math.floor(pl.gold * 0.5); }
      }
      // Statue for the renowned.
      if (home && pl.renown >= 18) L.raiseStatue(world, home, legend, rng);
      // People remember.
      for (const n of P().alive(world)) {
        const op = n.op[pl.charId] || 0;
        if (Math.abs(op) > 25 || (home && n.home === home.id)) P().remember(world, n, op >= 0 ? `mourned ${legend.name}` : `heard ${legend.name} was dead and was glad of it`, 'legend', pl.charId, op >= 0 ? 3 : 2);
      }
      ECHO.Chronicle.add(world, { text: `${legend.name}, ${legend.epithet}, died — ${cause}. ${home ? home.name + ' remembers.' : ''}`, kind: 'legacy', importance: 3, sid: pl.homeId, char: pl.charId });
      world.player = null;
      return legend;
    },
    raiseStatue(world, s, legend, rng) {
      for (let t = 0; t < 60; t++) {
        const a = rng.next() * Math.PI * 2, d = rng.range(2.5, 4.5);
        const x = Math.round(s.x + Math.cos(a) * d), y = Math.round(s.y + Math.sin(a) * d);
        if (ECHO.World.isSolid(world, x, y) || ECHO.World.isSolid(world, x, y + 1)) continue;
        if (s.buildings.some(b => x >= b.x - 1 && x <= b.x + b.w && y >= b.y - 1 && y <= b.y + b.h)) continue;
        s.buildings.push({ id: s.id + '_statue_' + legend.charId, type: 'statue', x, y, w: 1, h: 1, legend: legend.charId });
        legend.statue = true;
        ECHO.World.rebuildBlocked(world);
        ECHO.Chronicle.add(world, { text: `The people of ${s.name} raised a statue of ${legend.name} in the square.`, kind: 'legacy', importance: 2, sid: s.id });
        return true;
      }
      return false;
    },
    dailyTick(world, rng) {
      // Living characters slowly earn statues while alive too, if adored.
      const pl = world.player;
      if (pl && pl.alive && pl.renown >= 60) {
        const home = ECHO.Sim.settlement(world, pl.homeId);
        if (home && !home.buildings.some(b => b.type === 'statue' && b.legend === pl.charId) && rng.chance(0.03) && (home.rep && home.rep[pl.charId] > 50)) {
          L.raiseStatue(world, home, { charId: pl.charId, name: pl.first + ' ' + pl.last }, rng);
        }
      }
    },
    legendOf(world, charId) { return world.legends.find(l => l.charId === charId); }
  };
})();
