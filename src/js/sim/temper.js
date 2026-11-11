// Tempered in battle: legendary gear grows with the one who uses it.
//
// A legendary blade, bow or suit of armour is not finished when it is made. Every blow it lands
// (or, for armour, every blow it takes for you) tempers it a little, and the harder the foe the
// more: an elite counts for more than a beast, a champion more, a lord most of all; a kill
// counts five times over. Enough of it and the piece goes up a temper level, and at each:
//   • a weapon or bow hits 3% harder (of what it was made, honing and all) — and its
//     DURABILITY grows: it holds in your guard, turning 1% more of a blocked blow (to 20%);
//   • armour turns 3% more (its armour grows by a thirtieth of itself) — and its DURABILITY
//     grows: it shrugs off a further half a percent of every blow (to 15%).
// Nothing in ECHO ever breaks, so durability here is how much the piece can take and still hold:
// shown with the rest, 100 to begin and 25 more a level. There is no last level; each asks more
// fighting than the one before. Kept on the item itself (it.temper {xp, lv, hits, kills}), made
// the first time it is used: a legendary piece you already have begins at level 0, with
// everything else about it as it was.
(function () {
  const RANK = { common: 1, normal: 1, elite: 1.5, champion: 2.5, lord: 4 };
  const T = ECHO.Temper = {
    POW: 0.03, GUARD: 0.01, GUARD_MAX: 0.2, TOUGH: 0.005, TOUGH_MAX: 0.15,
    ok(it) { return !!it && it.rarity === 'legendary' && (it.kind === 'sword' || it.kind === 'bow' || it.kind === 'armor'); },
    st(it) { return it.temper || (it.temper = { xp: 0, lv: 0, hits: 0, kills: 0 }); },
    lv(it) { return T.ok(it) && it.temper ? it.temper.lv || 0 : 0; },
    // what the next level asks (more each time)
    need(lv) { return Math.round(25 * Math.pow((lv || 0) + 1, 1.4)); },
    // what it does
    mul(it) { return 1 + T.POW * T.lv(it); },                                     // power (weapon, bow) or armour
    durability(it) { return T.ok(it) ? 100 + 25 * T.lv(it) : 0; },
    guardOf(it) { return it && it.kind === 'sword' ? Math.min(T.GUARD_MAX, T.GUARD * T.lv(it)) : 0; },
    toughOf(it) { return it && it.kind === 'armor' ? Math.min(T.TOUGH_MAX, T.TOUGH * T.lv(it)) : 0; },
    guard(game) { const w = game && game.world && game.pl && game.world.items[game.pl.weapon]; return T.guardOf(w); },
    // what a foe counts for
    worth(e) {
      if (!e) return 0;
      const rk = ECHO.Prowess && ECHO.Prowess.foeRank ? ECHO.Prowess.foeRank(e) : (e.boss2 ? 'lord' : e.elite ? 'elite' : 'normal');
      return RANK[rk] || 1;
    },
    foe(e) { return !!e && !e.dead && !e.pal && !e.tamed && !e.isCompanion && !(e.subdued > 0) && (!!e.foe || e.type === 'creature' || e.type === 'boss' || !!e.boss2 || !!e.hostile); },
    // the piece a blow of this kind was struck with
    used(game, type) {
      const pl = game.pl, items = game.world.items;
      if (type === 'ranged') return items[ECHO.Guns ? ECHO.Guns.rangedId(game) : pl.bow] || null;
      const w = items[pl.weapon] || null;
      if (type === 'melee') return w;
      if ((type === 'fire' || type === 'magic') && w && w.wclass === 'staff') return w;
      return null;
    },
    gain(game, it, xp, kill) {
      if (!T.ok(it) || !(xp > 0)) return 0;
      const s = T.st(it);
      s.xp += xp; if (kill) s.kills++; else s.hits++;
      let ups = 0;
      while (s.xp >= T.need(s.lv)) { s.xp -= T.need(s.lv); s.lv++; ups++; }
      if (ups) T.levelUp(game, it, ups);
      return ups;
    },
    levelUp(game, it, ups) {
      const s = it.temper, pe = game.pe, world = game.world, UI = ECHO.UI;
      if (ECHO.PlayerCtl) ECHO.PlayerCtl.derivedT = 0;
      if (pe && ECHO.Combat && ECHO.Combat.floater) ECHO.Combat.floater(pe.x, pe.y - 1.9, `${it.name} tempered · ${s.lv}`, '#ffb84a', true);
      if (pe && ECHO.Combat && ECHO.Combat.burst) ECHO.Combat.burst(pe.x, pe.y - 0.6, '#ffb84a', 14, 3, 0.5, 2);
      const now = game.time || 0;
      if (UI && UI.toast && (!(T._toastAt > now - 8) || ups > 1)) {
        T._toastAt = now;
        UI.toast(`${it.name} is tempered in battle — level ${s.lv}: ${it.kind === 'armor' ? `armour +${Math.round((T.mul(it) - 1) * 100)}%, and it shrugs off ${Math.round(T.toughOf(it) * 1000) / 10}% of every blow` : `it hits ${Math.round((T.mul(it) - 1) * 100)}% harder than it was made${it.kind === 'sword' ? `, and holds ${Math.round(T.guardOf(it) * 100)}% better in your guard` : ''}`}. Durability ${T.durability(it)}.`, 'legend', 5);
      }
      if (s.lv % 5 === 0 && it.history) it.history.push({ d: world.day, t: `tempered in battle to level ${s.lv}` });
      if (s.lv % 10 === 0 && ECHO.Chronicle && game.pl) ECHO.Chronicle.add(world, { text: `${game.pl.first} ${game.pl.last}'s ${it.name} has been tempered in battle to its ${s.lv}th level.`, kind: 'player', importance: 1, char: game.pl.charId });
    },
    // ------------------------------------------------------------ in a fight (combat.js)
    onHit(game, target, type) {
      if (!T.foe(target)) return;
      const it = T.used(game, type);
      if (!T.ok(it)) return;
      T._last = it.id;
      T.gain(game, it, T.worth(target));
    },
    onKill(game, target) {
      const it = T._last && game.world.items[T._last];
      if (!T.ok(it) || !game.pl || (it.id !== game.pl.weapon && it.id !== game.pl.bow && it.id !== game.pl.gun)) return;
      T.gain(game, it, 5 * T.worth(target), true);
    },
    onStruck(game, from) {
      if (!from || from.pal || from.isCompanion || from === game.pe) return;
      const a = game.pl.armor && game.world.items[game.pl.armor];
      if (T.ok(a)) T.gain(game, a, T.worth(from));
    },
    // ------------------------------------------------------------ shown
    line(it) {
      if (!T.ok(it)) return '';
      const s = it.temper, lv = s ? s.lv : 0;
      if (!lv && !(s && s.xp)) return `tempers in battle · durability ${T.durability(it)}`;
      return `tempered ${lv} (${it.kind === 'armor' ? 'armour' : 'power'} +${Math.round((T.mul(it) - 1) * 100)}%) · durability ${T.durability(it)} · ${Math.floor(s.xp)}/${T.need(lv)} to the next`;
    }
  };
})();
