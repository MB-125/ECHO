// Your mana well: how deep your mana runs, and how to make it deeper.
//
// Mana used to be what you were born with and what the flame taught you. Now it grows, in
// five ways, and all of them last:
//   • with your level — two more for every level you rise (an old save has all of it at once);
//   • by use — every point of mana you spend (on spells, on relics, on a slime you keep) deepens
//     the well a little; it rises in levels, each worth +6 mana and a little faster regaining;
//   • by meditation — sit by your campfire and meditate an hour: the well deepens, and you rise
//     with your mana full;
//   • by the arcanist's lessons — any market's arcanist will teach you to hold more (+10 mana a
//     lesson, dearer each time, twelve in all);
//   • by slime cores — the core of a beaten slime, drunk, deepens your mana for good (the rare
//     ones the most, and the evolved more again).
// And the deeper the well, the faster it refills: a little over a hundredth of all you can hold
// comes back every second, on top of what the flame and your relics give.
// It all keeps in `pl.well`, made the first time it is needed.
(function () {
  const { U } = ECHO;

  const W = ECHO.Well = {
    PER_LEVEL: 2, PER_WELL: 6, PER_LESSON: 10, LESSONS: 12,
    st(pl) {
      const s = pl.well || (pl.well = { v: 1, lv: 0, xp: 0, cores: 0, coreN: 0, lessons: 0, spent: 0, med: 0 });
      return s;
    },
    need(lv) { return Math.round(80 * (1 + 0.35 * lv)); },
    levelBonus(pl) { return W.PER_LEVEL * Math.max(0, (ECHO.Prowess ? ECHO.Prowess.level(pl) : 1) - 1); },
    // how much more mana you hold than you were born with
    bonus(pl) { const s = W.st(pl); return W.levelBonus(pl) + s.lv * W.PER_WELL + Math.round(s.cores) + s.lessons * W.PER_LESSON; },
    // how much more comes back each second
    regen(pl) { const s = W.st(pl); return (pl.maxMana || 60) * 0.012 + s.lv * 0.08; },

    // ------------------------------------------------------------ deepening it
    gain(game, xp, why) {
      const pl = game.pl, s = W.st(pl);
      if (!(xp > 0)) return 0;
      s.xp += xp;
      let ups = 0;
      for (let g = 0; g < 50 && s.xp >= W.need(s.lv); g++) { s.xp -= W.need(s.lv); s.lv++; ups++; }
      if (ups) {
        if (ECHO.PlayerCtl && ECHO.PlayerCtl.computeDerived) ECHO.PlayerCtl.computeDerived(game);
        const pe = game.pe;
        if (pe) { ECHO.Combat.floater(pe.x, pe.y - 1.9, `✦ your mana well deepens · ${s.lv}`, '#7ab8ff', true); ECHO.Combat.ring(pe.x, pe.y, 1.6, 'rgba(122,184,255,0.9)', 0.6); }
        if (!pl._wellTip) { pl._wellTip = true; ECHO.UI.toast(`Your mana well deepened: you hold more mana, and it comes back faster. Everything you spend deepens it — spells, relics, a slime you feed — and so does meditating by your campfire, the arcanist's lessons and the cores of slimes. (K: your mana.)`, 'study', 9); }
      }
      return ups;
    },
    // a slime's core, drunk: deeper for good (less each time, but never nothing)
    core(game, l) {
      const pl = game.pl, s = W.st(pl);
      const base = (l.big ? 8 : 3) + 2 * ((l.evo || 1) - 1) + (l.lv || 1) / 15;
      const add = Math.max(1, Math.round(base * 30 / (30 + s.coreN)));
      s.cores += add; s.coreN++;
      W.gain(game, W.need(s.lv) * (l.big ? 0.6 : 0.15), 'core');
      if (ECHO.PlayerCtl && ECHO.PlayerCtl.computeDerived) ECHO.PlayerCtl.computeDerived(game);
      pl.mana = Math.min(pl.maxMana, (pl.mana || 0) + pl.maxMana * 0.5);
      const pe = game.pe;
      ECHO.Combat.floater(l.x, l.y - 0.6, `slime core: +${add} mana for good`, '#b8ff7a', true);
      if (pe) ECHO.Combat.burst(pe.x, pe.y, '#b8ff7a', 18, 3, 0.6, 2);
      if (!pl._coreTip) { pl._coreTip = true; ECHO.UI.toast(`You drink the slime's core. Your mana runs deeper for good (+${add}), and your well deepens with it. The rare slimes' cores are worth the most.`, 'legend', 7); }
      return add;
    },
    meditate(game, hours) {
      const pl = game.pl, s = W.st(pl), world = game.world, h = hours || 1;
      ECHO.UI.fadeOut(() => {
        for (let i = 0; i < h; i++) ECHO.Sim.advance(world, 60);
        s.med++;
        const ups = W.gain(game, (60 + 12 * s.lv) * h, 'meditate');
        if (ECHO.PlayerCtl && ECHO.PlayerCtl.computeDerived) ECHO.PlayerCtl.computeDerived(game);
        pl.mana = pl.maxMana;
        ECHO.UI.fadeIn();
        ECHO.UI.toast(`You sit with your eyes closed and let the fire burn down a little. Your mana is full${ups ? `, and your well is deeper (${s.lv})` : `; your well is a little deeper (${Math.round(s.xp)} / ${W.need(s.lv)} toward the next)`}.`, 'study', 6);
      });
    },
    lessonPrice(pl) { return Math.round(80 * Math.pow(1.6, W.st(pl).lessons)); },
    lesson(game) {
      const pl = game.pl, s = W.st(pl), c = W.lessonPrice(pl);
      if (s.lessons >= W.LESSONS) return 'The arcanist has nothing more to teach you.';
      if (pl.gold < c) return 'You cannot afford the lesson.';
      pl.gold -= c; s.lessons++;
      if (ECHO.PlayerCtl && ECHO.PlayerCtl.computeDerived) ECHO.PlayerCtl.computeDerived(game);
      return null;
    },

    // ------------------------------------------------------------ every frame
    tick(game, dt) {
      const pl = game.pl, pe = game.pe;
      if (!pl || !pe || pe.dead) return;
      W.st(pl);
      // whatever you spend deepens the well (spells, relics)…
      const m = pl.mana || 0;
      if (W._last != null && W._pl === pl && m < W._last - 1e-6) { const used = W._last - m; W.st(pl).spent += used; W.gain(game, used, 'spend'); }
      // …and what your slimes take (slimes.js) as well
      const fed = ECHO.Slime ? ECHO.Slime.feed(game, dt) : 0;
      if (fed > 0) { W.st(pl).spent += fed; W.gain(game, fed, 'feed'); }
      W._last = pl.mana || 0; W._pl = pl;
    },
    // ------------------------------------------------------------ shown
    feedHud(game) {
      const pl = game.pl, r = ECHO.Slime ? ECHO.Slime.rate() : 0;
      if (!(r > 0)) return '';
      const starving = ECHO.Slime.mine(pl).some(x => x.out && x.starve > 0);
      return `<span class="${starving ? 'freeze' : 'slimefeed'}">${starving ? '⚠ Slime starving' : '◉ Slime feeding'} −${r.toFixed(1)} mana/s</span>`;
    },
    html(game) {
      const pl = game.pl, s = W.st(pl), sl = ECHO.Slime ? ECHO.Slime.mine(pl) : [], rate = ECHO.Slime ? ECHO.Slime.rate() : 0;
      const base = 60 + Math.round(pl.skills.flame * 1.2), regen = 2.6 + pl.skills.flame / 40 + W.regen(pl) + (ECHO.Arcana ? ECHO.Arcana.regenBonus(pl) : 0);
      const pct = Math.round(Math.min(1, s.xp / W.need(s.lv)) * 100);
      return `<div class="card well-card"><h4>◈ Your mana · <span style="color:#7ab8ff">${Math.round(pl.maxMana)}</span> <span class="dim" style="font-size:12px">· ${regen.toFixed(1)} a second</span></h4>
        <div class="aura-bar well-bar"><i style="width:${pct}%"></i></div>
        <div style="font-size:13px">Your well: <b class="gold">${s.lv}</b> <span class="dim">(${Math.round(s.xp)} / ${W.need(s.lv)} to the next; each is +${W.PER_WELL} mana and faster regaining)</span></div>
        <div class="dim" style="font-size:12px">${base} from yourself and the flame · +${W.levelBonus(pl)} from your level · +${s.lv * W.PER_WELL} from the well · +${s.lessons * W.PER_LESSON} from ${s.lessons} lesson${s.lessons === 1 ? '' : 's'} · +${Math.round(s.cores)} from ${s.coreN} slime core${s.coreN === 1 ? '' : 's'}${ECHO.Arcana && ECHO.Arcana.bonus(pl) ? ` · +${Math.round(ECHO.Arcana.bonus(pl))} from relics` : ''}.</div>
        ${sl.length ? `<div style="font-size:13px;color:#b8ff7a">Your slime${sl.length > 1 ? 's' : ''} (${sl.map(r => r.name).join(', ')}) feed${sl.length > 1 ? '' : 's'} on it: <b>−${rate.toFixed(1)}</b> mana a second now${rate > regen ? ' <span class="ember">— more than comes back: deepen your well, or rest one at your den</span>' : ''}.</div>` : ''}
        <div class="dim" style="font-size:12px">To deepen it: spend mana (spells, relics, a slime you keep) · meditate by your campfire (B, then E by the fire) · take the arcanist's lessons in any market (${s.lessons}/${W.LESSONS}) · drink the cores of slimes · and rise in level.</div></div>`;
    },
    marketHtml(pl) {
      const s = W.st(pl), done = s.lessons >= W.LESSONS, c = W.lessonPrice(pl);
      return `<div class="ware"><div class="ware-ic" style="color:#7ab8ff">◈</div><div class="ware-main"><div class="ware-top"><b>A lesson in holding mana</b><span class="gold">${done ? '—' : c + ' crowns'}</span></div><div class="dim" style="font-size:12px">${done ? 'You have learned all the arcanist can teach.' : `+${W.PER_LESSON} mana for good (lesson ${s.lessons + 1} of ${W.LESSONS}). For a slime of yours, every drop counts.`}</div></div><button data-welllesson="1" ${done || pl.gold < c ? 'disabled' : ''}>Learn</button></div>`;
    }
  };
})();
