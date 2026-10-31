// Lore of the wild: what you learn by doing, not by levelling.
//
// Five kinds of experience, each grown only by its own deeds, each in five ranks with
// something real at each: hunting beasts and monsters out in the world, studying them
// (F), clearing the deep places floor by floor, standing against the calamities, and
// enduring the worst of the weather on the open road. A hunter who has studied the
// wolves fights them better than a stronger man who never looked; one who has stood
// under a dragon's breath knows how to take less of it.
(function () {
  const { U } = ECHO;
  const UI = () => ECHO.UI;
  const TRACKS = {
    hunt: { name: 'Hunter', icon: '🏹', col: '#c8a86a', at: [10, 30, 70, 150, 300], how: 'Bring down beasts and monsters out in the wild.',
      perk: r => `+${r * 3}% harm to beasts and monsters${r >= 2 ? ' · Tracker: foes near you show on your map' : ''}` },
    study: { name: 'Beast-lore', icon: '📖', col: '#9fe0c8', at: [3, 10, 25, 50, 100], how: 'Study creatures and monsters (F) — a new kind counts three times.',
      perk: r => `+${r * 4}% harm to every kind you have studied${r >= 4 ? ' · and 5% less from them' : ''}` },
    delve: { name: 'Delver', icon: '🕯', col: '#b48aff', at: [3, 10, 25, 50, 100], how: 'Clear the floors of dungeons, caves and crypts.',
      perk: r => `+${r * 4}% harm below ground` },
    titan: { name: 'Calamity-hunter', icon: '🐉', col: '#ff8a5a', at: [5, 20, 50, 100, 200], how: 'Stand against dragons and great beasts — every wound you give one counts.',
      perk: r => `${r * 6}% less harm from dragons, great beasts and their arts` },
    endure: { name: 'Wayfarer', icon: '🧭', col: '#8fb8ff', at: [5, 15, 40, 90, 180], how: 'Keep to the open road in storm, snow, rain, fog and heat.',
      perk: r => `+${r * 3}% life` }
  };
  const L = ECHO.Lore = {
    TRACKS,
    st(pl) { return pl.lore || (pl.lore = { hunt: 0, study: 0, delve: 0, titan: 0, endure: 0 }); },
    rank(pl, k) { const v = L.st(pl)[k] || 0, at = TRACKS[k].at; let r = 0; while (r < at.length && v >= at[r]) r++; return r; },
    add(game, k, n) {
      const pl = game.pl;
      if (!pl || !TRACKS[k] || !(n > 0)) return;
      const S = L.st(pl), r0 = L.rank(pl, k);
      S[k] = (S[k] || 0) + n;
      const r1 = L.rank(pl, k);
      if (r1 > r0) {
        const T = TRACKS[k];
        if (game.pe) { ECHO.Combat.floater(game.pe.x, game.pe.y - 1.9, `${T.icon} ${T.name} ${r1}`, T.col, true); ECHO.Combat.ring(game.pe.x, game.pe.y, 2.2, 'rgba(255,224,138,0.8)', 0.6); }
        UI().toast(`${T.name}, rank ${r1}: ${T.perk(r1)}.`, 'legend', 6);
        if (k === 'endure' && ECHO.PlayerCtl) ECHO.PlayerCtl.derivedT = 0;
      }
    },
    studied(pl, e) { const key = e.type === 'boss' && e.boss ? 'boss:' + e.boss.id : e.species; return !!(pl.studied && key && pl.studied[key]); },
    beasty(e) { return !!e && !e.pal && !e.tamed && e.type !== 'person' && !e.npcId && (e.type === 'creature' || e.foe || e.humanoid || e.type === 'boss' || e.titan); },
    // how much harder your blow lands
    dealt(game, target) {
      const pl = game.pl;
      if (!pl || !target) return 1;
      let m = 1;
      if (L.beasty(target)) m *= 1 + 0.03 * L.rank(pl, 'hunt');
      if (L.studied(pl, target)) m *= 1 + 0.04 * L.rank(pl, 'study');
      if (target.x >= 9000 && ECHO.Interior.cur && ECHO.Interior.cur.carved) m *= 1 + 0.04 * L.rank(pl, 'delve');
      return m;
    },
    // how much less a blow on you hurts
    taken(game, from) {
      const pl = game.pl;
      if (!pl || !from) return 1;
      let m = 1;
      if (from.titan || from.broodOf) m *= 1 - 0.06 * L.rank(pl, 'titan');
      if (L.rank(pl, 'study') >= 4 && L.studied(pl, from)) m *= 0.95;
      return m;
    },
    lifeMul(pl) { return 1 + 0.03 * L.rank(pl, 'endure'); },
    // the deeds
    onKill(game, target) {
      if (!L.beasty(target)) return;
      if (target.titan) L.add(game, 'titan', 25);
      else if (target.x < 9000) L.add(game, 'hunt', target.type === 'boss' || target.lord ? 5 : 1);
    },
    onHit(game, target, dmg) {
      if (target && target.titan && target.maxHp) L.add(game, 'titan', dmg / target.maxHp * 50);
    },
    onStudy(game, e, first) { L.add(game, 'study', first ? 3 : 1); },
    onFloor(game) { L.add(game, 'delve', 1); },
    tick(game, dt) {
      const pl = game.pl, pe = game.pe, world = game.world;
      if (!pl || !pe || ECHO.Interior.cur || !ECHO.Weather) return;
      if ((L._wt = (L._wt || 0) + dt) < 5) return;
      const span = L._wt; L._wt = 0;
      const w = ECHO.Weather.here(world, pe.x, pe.y), hard = w && ['storm', 'blizzard', 'snow', 'rain', 'fog', 'heat'].includes(w.today);
      const land = ECHO.Lands ? ECHO.Lands.at(world, pe.x, pe.y) : null;
      if (hard || (land && land.harsh)) { L._acc = (L._acc || 0) + span * (hard && land && land.harsh ? 2 : 1); while (L._acc >= 60) { L._acc -= 60; L.add(game, 'endure', 1); } }
    },
    // Tracker: foes near you, for the minimap
    tracked(game) {
      const pl = game.pl, pe = game.pe;
      if (!pl || !pe || L.rank(pl, 'hunt') < 2) return [];
      return game.ents.filter(e => !e.dead && !e.hidden && e !== pe && L.beasty(e) && (e.foe || e.aggro || e.titan || e.type === 'boss') && U.dist(e.x, e.y, pe.x, pe.y) < 32);
    },
    // ------------------------------------------------------------ the character page
    html(game) {
      const pl = game.pl, S = L.st(pl);
      const rows = Object.entries(TRACKS).map(([k, T]) => {
        const r = L.rank(pl, k), v = S[k] || 0, next = T.at[r], prev = r ? T.at[r - 1] : 0;
        const f = next ? (v - prev) / (next - prev) : 1;
        return `<div class="card" style="display:flex;gap:12px;align-items:center"><div style="font-size:24px;width:34px;text-align:center">${T.icon}</div>
          <div style="flex:1"><b style="color:${T.col}">${T.name}</b> <span class="gold">${'★'.repeat(r)}${'☆'.repeat(5 - r)}</span> <span class="dim" style="font-size:12px">· ${next ? `${Math.floor(v)}/${next} to rank ${r + 1}` : 'mastered'}</span>
          <div class="pal-bar" style="margin:3px 0"><div class="t" style="flex:1"><i style="width:${Math.round(U.clamp(f, 0, 1) * 100)}%;background:${T.col}"></i></div></div>
          <div style="font-size:12.5px">${r ? T.perk(r) : '<span class="dim">nothing yet</span>'}</div><div class="dim" style="font-size:12px">${T.how}</div></div></div>`;
      }).join('');
      return `<h3 class="gold">Lore of the wild <span class="dim" style="font-size:13px">· learned by doing</span></h3><div class="list">${rows}</div>`;
    }
  };

  // Dungeons left alone grow: a word for the place when you come on it, and what comes
  // out of the worst of them after dark.
  const O = ECHO.Overgrowth = {
    tick(game, dt) {
      const pe = game.pe, world = game.world;
      if (!pe || ECHO.Interior.cur || !world.sites) return;
      if ((O._t = (O._t || 0) - dt) > 0) return;
      O._t = 3;
      if (!(game.isNight && game.isNight())) return;
      for (const s of world.sites) {
        if (s.cat !== 'delve' || s.cleared || (s.grow || 0) < 30 || s.spilled === world.day) continue;
        const d = U.dist(s.x, s.y, pe.x, pe.y);
        if (d > 34 || d < 8) continue;
        s.spilled = world.day;
        const def = ECHO.Explore.DELVES[s.kind] || {}, roster = s.roster || def.roster || [[def.foes || 'skeleton', 1]];
        const lvl = ECHO.Explore.floorLevel(s, 0), n = 2 + Math.min(3, Math.floor((s.grow - 30) / 20));
        let made = 0;
        for (let i = 0; i < n; i++) {
          const kind = roster[i % roster.length][0];
          if (!ECHO.Monsters.DEFS[kind]) continue;
          const sp = ECHO.Ent.freeSpot(world, s.x + (Math.random() - 0.5) * 4, s.y + 1.5 + Math.random() * 2, 4);
          if (!sp) continue;
          const m = ECHO.Monsters.make(game, kind, sp.x, sp.y, lvl, { eliteChance: 0.15 });
          m.gab = {}; m.home = { x: s.x, y: s.y + 2 }; m.spillOf = s.id;
          game.addEnt(m); made++;
        }
        if (made) UI().toast(`Something is coming out of ${s.name} in the dark: it has grown, untended, for ${s.grow} days. Clear it and it will stop.`, 'warn', 6);
      }
    }
  };
})();
