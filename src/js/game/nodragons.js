// ECHO.NoDragons — there are no dragons in the world any more (0.50).
//   A world made before then is set right the first time it is entered:
//     • a wild dragon is simply gone from its range;
//     • a dragon you had bound is not taken from you: it becomes a great beast of the land, at the
//       same level and with the same name, its bond and its days with you kept (one of the same
//       element if there is one, else the walking kind nearest its strength);
//     • if you were on a dragon's back, you are set down where you were;
//     • a dragon that had come down near a town has gone; a lair whose master was a drake has a
//       serpent in it instead.
(function () {
  const D = ECHO.NoDragons = {
    _done: null,
    reset() { D._done = null; },
    tick(game) { if (game.world && D._done !== game.world) { D._done = game.world; D.fix(game); } },
    // the walking kind a bound dragon becomes
    into(t, old) {
      const SP = ECHO.Titans.SPECIES, keys = Object.keys(SP);
      const same = keys.filter(k => SP[k].element === old.element);
      const pool = same.length ? same : keys;
      return pool.sort((a, b) => Math.abs(SP[a].lv - (t.lvl || old.lv || 1)) - Math.abs(SP[b].lv - (t.lvl || old.lv || 1)))[0];
    },
    fix(game) {
      const world = game.world, pl = game.pl, Ti = ECHO.Titans;
      let gone = 0, kept = [];
      // what the old kinds were (their elements and levels), for a world made with them
      const OLD = { emberwing: { element: 'fire', lv: 48 }, rimefang: { element: 'frost', lv: 165 }, mirevenom: { element: 'venom', lv: 240 }, skyrender: { element: 'storm', lv: 330 }, solgrim: { element: 'sun', lv: 720 }, nyxathar: { element: 'void', lv: 1400 } };
      // off its back first
      if (pl && pl.flying) {
        const t = world.titans && world.titans.list.find(x => x.id === pl.flying);
        if (t && !Ti.SPECIES[t.sp]) {
          pl.flying = null;
          if (ECHO.Apex) ECHO.Apex.fly = null;
          if (game.pe) game.pe.alt = 0;
        }
      }
      const S = world.titans;
      if (S && S.list) {
        S.list = S.list.filter(t => {
          if (Ti.SPECIES[t.sp]) return true;
          const old = OLD[t.sp] || { element: 'earth', lv: t.lvl || 1 };
          if (t.bound && t.alive !== false) {
            const k = D.into(t, old);
            t.was = t.sp; t.sp = k; t.flies = false;
            if (t.title && /dragon|wing|death|rot in|storm made|crown|end of days/i.test(t.title)) t.title = Ti.SPECIES[k].title;
            kept.push(t);
            return true;
          }
          gone++;
          return false;
        });
        if (S.known) S.known = S.known.filter(k => Ti.SPECIES[k]);
        if (pl) pl.beasts = Ti.bound(world).map(b => b.id);
        if (pl && pl.beastOut) { const t = S.list.find(x => x.id === pl.beastOut); if (!t) pl.beastOut = null; }
      }
      // the dragon that had come down by a town
      const E = world.events;
      if (E && E.dragon) { E.dragon = null; }
      if (ECHO.Events) ECHO.Events.fly = null;
      for (const e of game.ents || []) if (e.dragon || (e.titan && !(Ti.byId(world, e.titan)))) { e.dead = true; e.vanish = true; }
      if (pl && typeof pl.tracked === 'string' && / the Dragon$/.test(pl.tracked)) pl.tracked = null;
      // lairs of the Fen Drake: a serpent
      for (const L of world.lairs || []) if (L.boss && L.boss.kind === 'drake') { L.boss.kind = 'wyrm'; if (L.boss.title === 'the Fen Drake') L.boss.title = 'the Fen Serpent'; }
      if (kept.length && ECHO.UI) ECHO.UI.toast(`There are no dragons in the world any more. ${kept.map(t => t.name).join(', ')} ${kept.length > 1 ? 'are' : 'is'} still yours, now ${kept.length > 1 ? 'great beasts' : 'a great beast'} of the land, at the same level.`, 'legend', 10);
      return { gone, kept: kept.length };
    }
  };
})();
