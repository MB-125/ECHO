// World Intelligence: factions remember HOW they are being killed and adapt.
// Memory fades over time, so if the player changes style, so does the world.
// Doctrines change real combat behaviour and equipment (see game/enemies.js).
(function () {
  const { U } = ECHO;

  const DOCTRINES = ECHO.DOCTRINES = {
    shields: { name: 'Round shields', test: m => m.ranged >= 7 && m.ranged / m.total > 0.45, news: f => `${f} fighters have begun carrying heavy round shields against arrows.`, hint: 'Shields turn arrows aimed at their front.' },
    fireward: { name: 'Fire-warded mail', test: m => m.fire >= 7 && m.fire / m.total > 0.35, news: f => `${f} smiths are soaking cloaks in alum and riveting mail against flame.`, hint: 'Fire does far less to them.' },
    nightwatch: { name: 'Night watch', test: m => m.night >= 6 && m.night / m.total > 0.45, news: f => `${f} sentries now keep torches burning and double their watch after dark.`, hint: 'More guards at night, and they are awake.' },
    bodyguards: { name: 'Bodyguards', test: m => m.leaders >= 2, news: f => `${f} leaders no longer go anywhere without sworn guards at their side.`, hint: 'Leaders are escorted.' },
    skirmish: { name: 'Spear-and-bow skirmishers', test: m => m.melee >= 10 && m.melee / m.total > 0.65, news: f => `${f} warriors have learned to keep their distance, harrying with spears and bows.`, hint: 'They keep out of sword reach and shoot.' },
    packs: { name: 'Pack tactics', test: m => m.solo >= 6, news: f => `${f} now move only in groups.`, hint: 'They travel in larger groups.' }
  };

  const I = ECHO.Intel = {
    DOCTRINES,
    init(world) {
      world.intel = { mem: {}, pending: {}, playerLog: [] };
      for (const fid of Object.keys(world.factions)) world.intel.mem[fid] = I.blank();
    },
    blank() { return { melee: 0, ranged: 0, fire: 0, night: 0, leaders: 0, stealth: 0, solo: 0, total: 0, lastDay: 0 }; },
    // Called by the combat layer whenever the player kills a member of a faction.
    recordKill(world, factionId, ctx) {
      const m = world.intel.mem[factionId] || (world.intel.mem[factionId] = I.blank());
      m.total += 1;
      if (ctx.method) m[ctx.method] = (m[ctx.method] || 0) + 1;
      if (ctx.night) m.night += 1;
      if (ctx.leader) m.leaders += 1;
      if (ctx.stealth) m.stealth += 1;
      if (ctx.alone) m.solo += 1;
      m.lastDay = world.day;
      world.intel.playerLog.push({ d: world.day, f: factionId, m: ctx.method, n: ctx.night ? 1 : 0 });
      if (world.intel.playerLog.length > 200) world.intel.playerLog.shift();
    },
    dailyTick(world, rng) {
      for (const fid of Object.keys(world.intel.mem)) {
        const f = world.factions[fid];
        if (!f) continue;
        const m = world.intel.mem[fid];
        if (m.total >= 4) {
          for (const key of Object.keys(DOCTRINES)) {
            if (f.doctrines[key]) continue;
            if (key === 'packs' && fid !== 'wild') continue;
            if (DOCTRINES[key].test(m)) {
              // Learning takes a few days — word must travel and smiths must work.
              const p = world.intel.pending;
              const k = fid + ':' + key;
              if (p[k] == null) p[k] = world.day + rng.int(2, 5);
            }
          }
        }
        // Fade
        for (const k of ['melee', 'ranged', 'fire', 'night', 'leaders', 'stealth', 'solo', 'total']) m[k] *= 0.965;
        // Abandon doctrines that are no longer needed (after a long quiet).
        for (const key of Object.keys(f.doctrines)) {
          if (world.day - f.doctrines[key] > 60 && m.total < 1 && rng.chance(0.03)) {
            delete f.doctrines[key];
            ECHO.Chronicle.add(world, { text: `${f.short === 'the Wild' ? 'The beasts of the wild' : f.name} ${key === 'shields' ? 'have set aside their heavy shields' : 'have grown lax in their old precautions'}.`, kind: 'intel', importance: 1 });
          }
        }
      }
      for (const k of Object.keys(world.intel.pending)) {
        if (world.day >= world.intel.pending[k]) {
          delete world.intel.pending[k];
          const [fid, key] = k.split(':');
          const f = world.factions[fid];
          if (!f || f.doctrines[key]) continue;
          f.doctrines[key] = world.day;
          const label = fid === 'wild' ? 'Duskwolves' : f.short === 'the Lantern' ? 'Lantern' : f.short;
          ECHO.Chronicle.add(world, { text: DOCTRINES[key].news(label), kind: 'intel', importance: 2, sid: f.capital || null, tags: ['adapt'] });
          ECHO.emit('doctrine', { faction: fid, key });
        }
      }
    },
    has(world, factionId, key) {
      const f = world.factions[factionId];
      return !!(f && f.doctrines && f.doctrines[key] != null);
    },
    // A short read on what a faction has learned (for archives / scouting)
    summary(world, factionId) {
      const f = world.factions[factionId];
      return Object.keys(f.doctrines || {}).map(k => DOCTRINES[k].name + ' — ' + DOCTRINES[k].hint);
    }
  };
  void U;
})();
