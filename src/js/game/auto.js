// Looking after yourself, without a key for it.
//
// What used to wait on a key is done for you, the moment it is needed (each can be turned off
// in Esc → Gameplay):
//   • hungry, you eat what you carry (the best of it first: a stew, a roast, then bread, raw last);
//   • badly hurt, you drink the healing draught that best fits your wounds, and with none left a
//     mending tonic, a second-wind cordial, a salve or your herbs;
//   • poisoned, burning, webbed or rooted, you drink a purging tincture; feverish, you chew herbs;
//   • out of breath in a fight, a second-wind cordial;
//   • in a fight that is hard for you (a lord, a great beast, an elite, a foe your match or more),
//     the fighting draughts: might, stoneskin, heartroot, fireward, bloodwine.
// Phoenix tears are never drunk for you: carried, they break by themselves when a blow would kill.
// The keys still work, if you would rather (H eats, 1 drinks a draught, 2–0 the rest).
(function () {
  const { U } = ECHO;

  const AU = ECHO.Auto = {
    t: 0, eatT: 0,
    on(k) { const s = (ECHO.UI && ECHO.UI.settings) || {}; return (s[k] || 'on') !== 'off'; },
    has(pl, id) { return ((pl.potions || {})[id] || 0) > 0; },
    buffOn(pl, id) { return ((pl.buffs || {})[id] || 0) > 0; },
    // the foes you are fighting now, and how hard the hardest of them is for you
    fight(game) {
      const pe = game.pe, me = ECHO.Prowess ? ECHO.Prowess.level(game.pl) : 1;
      if (!(game.combatT != null && game.time - game.combatT < 5)) return null;
      let hard = false, n = 0;
      for (const e of game.ents) {
        if (e.dead || e === pe || e.isCompanion || e.pal || e.tamed || e.hidden) continue;
        if (Math.abs(e.x - pe.x) > 14 || Math.abs(e.y - pe.y) > 14) continue;
        if (!(e.aggro || e.state === 'chase' || e.state === 'fight' || e.target === pe) || !game.hostileTo(pe, e)) continue;
        n++;
        if (e.titan || e.type === 'boss' || e.boss2 || e.elite || e.keybearer || e.giant) { hard = true; continue; }
        const L = ECHO.Prowess && ECHO.Prowess.foeLevel ? ECHO.Prowess.foeLevel(e) : (e.lvl || 1), D = ECHO.Prowess && ECHO.Prowess.diff ? ECHO.Prowess.diff(L, me) : null;
        if (D && (D.k === 'even' || D.k === 'hard' || D.k === 'deadly' || D.k === 'hopeless')) hard = true;
      }
      return n ? { n, hard } : null;
    },
    tick(game, dt) {
      const pl = game.pl, pe = game.pe, PC = ECHO.PlayerCtl;
      if (!pl || !pe || pe.dead || pl.capture || game.defeating) return;
      AU.eatT -= dt; AU.t -= dt;
      if (AU.t > 0) return;
      AU.t = 0.25;
      const hpF = pl.hp / Math.max(1, pl.maxHp), F = AU.fight(game);
      // ---- wounds: a draught that fits them (one swallow at a time: the draughts wait on each other)
      if (AU.on('autoCare') && !(PC.drinkT > 0)) {
        const low = F && F.hard ? 0.5 : 0.4;
        if (hpF < low) {
          if (ECHO.Gear.healIds().some(k => AU.has(pl, k))) return PC.drinkHeal(game);
          if (AU.has(pl, 'regen') && !AU.buffOn(pl, 'regen')) return PC.drink(game, 'regen');
          if (AU.has(pl, 'wind') && !AU.buffOn(pl, 'wind')) return PC.drink(game, 'wind');
          if ((pl.inv.salve > 0 || pl.inv.herbs > 0) && hpF < low) { PC.useHerbs(game, true); PC.drinkT = 0.6; return; }
        }
        // what clings to you: poison, fire, webs, roots — a purging tincture
        const stuck = (pl.poisonT > 2 && pl.poisonDps > pl.maxHp * 0.004) || (pe.burn > 1.5 && hpF < 0.8) || pl.rootT > 0.8 || (pl.slowT > 2.5 && F);
        if (stuck && AU.has(pl, 'cure') && !AU.buffOn(pl, 'cure')) return PC.drink(game, 'cure');
        // a fever: herbs (or the tincture)
        if (pl.sick && (AU._sickT = (AU._sickT || 0) - 0.25) <= 0) {
          AU._sickT = 20;
          if (pl.inv.herbs > 0) { PC.useHerbs(game, true); return; }
          if (AU.has(pl, 'cure')) return PC.drink(game, 'cure');
        }
        // out of breath in a fight
        if (F && pl.stamina < pl.maxSta * 0.12 && AU.has(pl, 'wind') && !AU.buffOn(pl, 'wind')) return PC.drink(game, 'wind');
      }
      // ---- a hard fight: the fighting draughts, each once while it lasts
      if (F && F.hard && AU.on('autoBuff') && !(PC.drinkT > 0)) {
        for (const id of ['might', 'stone', 'vigor']) if (AU.has(pl, id) && !AU.buffOn(pl, id)) return PC.drink(game, id);
        if (AU.has(pl, 'ward') && !AU.buffOn(pl, 'ward') && AU.fireFoe(game)) return PC.drink(game, 'ward');
        if (hpF < 0.65 && AU.has(pl, 'leech') && !AU.buffOn(pl, 'leech')) return PC.drink(game, 'leech');
      }
      // ---- hunger: eat what you carry, a bite at a time, until you are fed
      if (AU.on('autoCare') && ECHO.Camp && AU.eatT <= 0) {
        ECHO.Camp.init(pl);
        const want = pl.fed < 30 || (pl.fed < 60 && AU._eating);
        if (want) {
          const k = ECHO.Camp.ORDER.find(k => pl.inv[k] > 0);
          if (k) { ECHO.Camp.eat(game, k, true); AU.eatT = 1.5; AU._eating = pl.fed < 60; }
          else AU._eating = false;
        } else AU._eating = false;
      }
    },
    // a foe that burns or casts (the fireward is for them)
    fireFoe(game) {
      const pe = game.pe;
      return game.ents.some(e => !e.dead && Math.abs(e.x - pe.x) < 14 && Math.abs(e.y - pe.y) < 14 && game.hostileTo(pe, e) && (e.elem === 'fire' || e.elem === 'sun' || (e.ab && (e.ab.bolt || e.ab.fire || e.ab.breath))));
    }
  };
})();
