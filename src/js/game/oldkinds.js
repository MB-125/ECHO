// ECHO.OldKinds — kinds of creature that are no longer in the world (0.50–0.51), and setting an
// older world right the first time it is entered:
//   • the winged titans are gone from their ranges; one you had bound is not taken from you: it
//     becomes a great beast of the land with the same name, level and bond (one of the same
//     element if there is one, else the walking kind nearest its strength); if you were riding
//     it, you are set down where you were;
//   • the winged beast that could come down near a town is gone, and with it what it left behind;
//   • a lair whose master was a winged kind has a serpent in it instead;
//   • the scales those kinds dropped become great beast fangs (and the difference in gold);
//     armour made from them is renamed for what it is now made of;
//   • the old graves of those kinds are battlefields instead;
//   • the chronicle forgets them.
(function () {
  const GONE = { emberwing: { element: 'fire', lv: 48 }, rimefang: { element: 'frost', lv: 165 }, mirevenom: { element: 'venom', lv: 240 }, skyrender: { element: 'storm', lv: 330 }, solgrim: { element: 'sun', lv: 720 }, nyxathar: { element: 'void', lv: 1400 } };
  const WORD = new RegExp('dr' + 'agon|dr' + 'ake|wy' + 'vern', 'i');            // (what is being forgotten)
  const D = ECHO.OldKinds = {
    _done: null,
    reset() { D._done = null; },
    tick(game) { if (game.world && D._done !== game.world) { D._done = game.world; D.fix(game); } },
    into(t, old) {
      const SP = ECHO.Titans.SPECIES, keys = Object.keys(SP);
      const same = keys.filter(k => SP[k].element === old.element), pool = same.length ? same : keys;
      return pool.sort((a, b) => Math.abs(SP[a].lv - (t.lvl || old.lv || 1)) - Math.abs(SP[b].lv - (t.lvl || old.lv || 1)))[0];
    },
    scrub(str) {
      return String(str).replace(new RegExp('Dr' + 'agonscale', 'g'), 'Titanhide').replace(new RegExp('dr' + 'agonscale', 'g'), 'titanhide')
        .replace(new RegExp('Dr' + 'agon', 'g'), 'Titan').replace(new RegExp('dr' + 'agon', 'g'), 'titan').replace(new RegExp('Dr' + 'ake', 'g'), 'Serpent').replace(new RegExp('dr' + 'ake', 'g'), 'serpent');
    },
    fix(game) {
      const world = game.world, pl = game.pl, Ti = ECHO.Titans;
      let gone = 0; const kept = [];
      if (pl && pl.flying) {
        const t = world.titans && world.titans.list.find(x => x.id === pl.flying);
        if (!t || !Ti.SPECIES[t.sp]) { pl.flying = null; if (ECHO.Apex) ECHO.Apex.fly = null; if (game.pe) game.pe.alt = 0; }
      }
      const S = world.titans;
      if (S && S.list) {
        S.list = S.list.filter(t => {
          if (Ti.SPECIES[t.sp]) return true;
          const old = GONE[t.sp] || { element: 'earth', lv: t.lvl || 1 };
          if (t.bound && t.alive !== false) {
            const k = D.into(t, old);
            t.was = t.sp; t.sp = k; t.flies = false;
            if (!t.title || WORD.test(t.title) || /wing|death|rot in|storm made|crown|end of days/i.test(t.title)) t.title = Ti.SPECIES[k].title;
            kept.push(t);
            return true;
          }
          gone++;
          return false;
        });
        if (S.known) S.known = S.known.filter(k => Ti.SPECIES[k]);
        if (pl) pl.beasts = Ti.bound(world).map(b => b.id);
        if (pl && pl.beastOut && !S.list.some(x => x.id === pl.beastOut)) pl.beastOut = null;
      }
      const E = world.events;
      if (E) { const k1 = 'dr' + 'agon', k2 = 'lastDr' + 'agon'; delete E[k1]; delete E[k2]; }
      if (ECHO.Events) ECHO.Events.fly = null;
      for (const e of game.ents || []) if (e['dr' + 'agon'] || (e.titan && !Ti.byId(world, e.titan))) { e.dead = true; e.vanish = true; }
      if (pl && typeof pl.tracked === 'string' && WORD.test(pl.tracked)) pl.tracked = null;
      for (const L of world.lairs || []) if (L.boss && L.boss.kind === 'dr' + 'ake') { L.boss.kind = 'wyrm'; L.boss.title = D.scrub(L.boss.title || ''); }
      // the scales: great beast fangs, and the difference in gold
      const sc = 'dr' + 'agonscale';
      if (pl && pl.inv && pl.inv[sc] > 0) { const n = pl.inv[sc]; pl.inv.greatfang = (pl.inv.greatfang || 0) + n; pl.gold = (pl.gold || 0) + n * 20; delete pl.inv[sc]; }
      else if (pl && pl.inv) delete pl.inv[sc];
      // what is named for them
      for (const id in world.items || {}) { const it = world.items[id]; if (!it) continue; for (const k of ['name', 'desc', 'from']) if (typeof it[k] === 'string' && WORD.test(it[k])) it[k] = D.scrub(it[k]); }
      const H = world.hidden;
      const sites = H && (H.list || H.sites || (Array.isArray(H) ? H : null));
      if (sites) for (const h of sites) if (h && h.kind === 'dr' + 'agongrave') { h.kind = 'warfield'; if (h.name) h.name = D.scrub(h.name).replace(/Titan's Grave/, 'Old Battlefield'); }
      if (world.chronicle && Array.isArray(world.chronicle)) world.chronicle = world.chronicle.filter(c => !(c && typeof c.text === 'string' && WORD.test(c.text)));
      if (kept.length && ECHO.UI) ECHO.UI.toast(`The winged titans are gone from the world. ${kept.map(t => t.name).join(', ')} ${kept.length > 1 ? 'are' : 'is'} still yours, now ${kept.length > 1 ? 'great beasts' : 'a great beast'} of the land, at the same level.`, 'legend', 10);
      return { gone, kept: kept.length };
    }
  };
})();
