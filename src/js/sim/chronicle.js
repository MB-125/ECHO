// The Chronicle: the realm's recorded history, and the way news travels.
// Events start where they happen and reach other towns after a delay that
// grows with distance. The player only "knows" what they witnessed or heard.
// Deeds (protecting, betraying, slaying) spread the same way and change how
// people regard the player only once the story arrives.
(function () {
  const { U } = ECHO;
  const SPEED = 22; // tiles per day that rumours travel

  const C = ECHO.Chronicle = {
    add(world, e) {
      world._eid = Math.max(world._eid || 0, world.chronicle.length ? world.chronicle[world.chronicle.length - 1].id : 0) + 1;
      const s = e.sid ? ECHO.Sim.settlement(world, e.sid) : null;
      const entry = {
        id: world._eid, d: world.day, m: Math.floor(world.minute || 0), text: e.text, kind: e.kind || 'misc', imp: e.importance || 0,
        sid: e.sid || null, x: e.x != null ? e.x : (s ? s.x : null), y: e.y != null ? e.y : (s ? s.y : null),
        npcs: e.npcs || [], char: e.char || null, tags: e.tags || []
      };
      world.chronicle.push(entry);
      if (world.chronicle.length > 2600) C.compact(world);
      // The player witnesses what happens near them.
      const pl = world.player;
      if (pl && pl.alive && !pl.capture && entry.x != null && U.dist(pl.x, pl.y, entry.x, entry.y) < 22) C.learn(world, entry, true);
      if (entry.char && pl && entry.char === pl.charId) C.learn(world, entry, true);
      ECHO.emit('chronicle', entry);
      return entry;
    },
    compact(world) {
      // Keep everything important; thin out old trivia.
      const cutoff = world.day - 120;
      world.chronicle = world.chronicle.filter(e => e.imp >= 1 || e.d > cutoff || e.char);
      if (world.chronicle.length > 2400) world.chronicle = world.chronicle.filter(e => e.imp >= 2 || e.d > cutoff || e.char);
    },
    learn(world, entry, witnessed) {
      const pl = world.player;
      if (!pl) return;
      pl.known = pl.known || [];
      if (pl.known.includes(entry.id)) return;
      pl.known.push(entry.id);
      if (pl.known.length > 900) pl.known.splice(0, pl.known.length - 900);
      if (!witnessed && entry.imp >= 1) ECHO.emit('rumor:learned', entry);
    },
    arrivalDay(world, e, s) {
      if (e.x == null) return e.d + 2;
      return e.d + U.dist(e.x, e.y, s.x, s.y) / SPEED;
    },
    // What people in a settlement have heard about (recent first).
    rumorsAt(world, s, limit = 12, maxAge = 40) {
      const out = [];
      for (let i = world.chronicle.length - 1; i >= 0 && out.length < limit; i--) {
        const e = world.chronicle[i];
        if (world.day - e.d > maxAge) break;
        if (e.imp < 1 && e.sid !== s.id) continue;
        if (C.arrivalDay(world, e, s) <= world.day + (world.minute / 1440)) out.push(e);
      }
      return out;
    },
    // When the player spends time in a town they pick up its news.
    learnAt(world, s) {
      const fresh = [];
      for (const e of C.rumorsAt(world, s, 30, 60)) {
        if (!(world.player.known || []).includes(e.id)) { C.learn(world, e, false); fresh.push(e); }
      }
      return fresh;
    },
    knownEntries(world) {
      const set = new Set(world.player ? world.player.known || [] : []);
      return world.chronicle.filter(e => set.has(e.id));
    },

    // A deed by the player: a chronicle entry plus a spreading reputation wave.
    deed(world, o) {
      const pl = world.player;
      const entry = C.add(world, { ...o, char: pl.charId, importance: o.importance != null ? o.importance : 1 });
      world.news = world.news || [];
      world.news.push({ eid: entry.id, char: pl.charId, x: entry.x, y: entry.y, d: world.day, base: o.rep || 0, factions: o.factionRep || {}, tag: o.tag || null, applied: [] });
      return entry;
    },

    dailyTick(world) {
      if (!world.news || !world.news.length) return;
      for (const nw of world.news) {
        for (const s of world.settlements) {
          if (nw.applied.includes(s.id)) continue;
          const arrive = nw.x == null ? nw.d + 1 : nw.d + U.dist(nw.x, nw.y, s.x, s.y) / SPEED;
          if (arrive > world.day) continue;
          nw.applied.push(s.id);
          const delta = (nw.base || 0) + (nw.factions[s.faction] || 0);
          if (!delta) continue;
          s.rep = s.rep || {};
          s.rep[nw.char] = U.clamp((s.rep[nw.char] || 0) + delta, -100, 100);
          for (const n of ECHO.People.residents(world, s)) {
            let k = 1;
            if (nw.tag === 'betray' && (ECHO.People.has(n, 'loyal') || ECHO.People.has(n, 'honest'))) k = 1.6;
            if (nw.tag === 'protect' && ECHO.People.has(n, 'kind')) k = 1.4;
            if (nw.tag === 'cruel' && ECHO.People.has(n, 'cruel')) k = -0.5;
            if (nw.tag === 'protect' && ECHO.People.has(n, 'cruel')) k = 0.5;
            n.op[nw.char] = U.clamp((n.op[nw.char] || 0) + delta * k, -100, 100);
          }
        }
      }
      world.news = world.news.filter(nw => nw.applied.length < world.settlements.length && world.day - nw.d < 30);
    },
    fmt(world, e) {
      return `${ECHO.TIME.fmtDate(e.d)} — ${e.text}`;
    }
  };
})();
