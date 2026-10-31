// Healing arts: chosen on your character page (K), and working on their own in a fight.
//
// Each is switched on or off as you like (up to three at a time); when you are in a
// fight — struck, or striking, in the last few seconds — the ones you chose heal you
// without a key pressed. Some draw on your mana; some ask nothing but a kill or a blow.
(function () {
  const { U } = ECHO;
  const UI = () => ECHO.UI;
  const MAX_ON = 3;
  const ARTS = [
    { id: 'renewal', icon: '🌿', name: 'Renewal', lv: 1, col: '#8fe07a', mana: '1 mana a second',
      d: 'In a fight, you heal 1.5% of your life every second, for as long as your mana lasts.' },
    { id: 'victor', icon: '⚔', name: 'Victor\'s breath', lv: 1, col: '#ffd86a', mana: 'no mana',
      d: 'Every foe you bring down gives you back 8% of your life.' },
    { id: 'leech', icon: '🩸', name: 'Lifesteal', lv: 5, col: '#e8405e', mana: 'no mana',
      d: 'Each blow you land heals you for 6% of the harm it does.' },
    { id: 'wind', icon: '💨', name: 'Second wind', lv: 10, col: '#9fe0ff', mana: '20 mana',
      d: 'When your life falls below a third, a rush of strength heals 35% of it at once. Once every 40 seconds.' },
    { id: 'pulse', icon: '✚', name: 'Mending pulse', lv: 15, col: '#b8ffb0', mana: '10 mana',
      d: 'Every 8 seconds in a fight, a pulse of light heals you 6% and every beast of yours nearby 10%.' }
  ];
  const M = ECHO.Mending = {
    ARTS, MAX_ON,
    st(pl) {
      if (!pl.mend) pl.mend = { on: ['renewal', 'victor'], cd: {} };   // (a new hero, and any old save, starts with the two first arts on)
      if (!pl.mend.cd) pl.mend.cd = {};
      return pl.mend;
    },
    level(pl) { return ECHO.Prowess ? ECHO.Prowess.level(pl) : 1; },
    open(pl, a) { return M.level(pl) >= a.lv; },
    isOn(pl, id) { return M.st(pl).on.includes(id); },
    toggle(pl, id) {
      const S = M.st(pl), a = ARTS.find(x => x.id === id);
      if (!a) return false;
      if (S.on.includes(id)) { S.on = S.on.filter(x => x !== id); return true; }
      if (!M.open(pl, a)) return 'locked';
      if (S.on.length >= MAX_ON) return 'full';
      S.on.push(id);
      return true;
    },
    fighting(game) { return game.combatT != null && game.time - game.combatT < 5; },
    heal(game, amt, quiet) {
      const pl = game.pl, pe = game.pe;
      if (!pe || pe.dead || !(amt > 0) || pl.hp >= pl.maxHp) return 0;
      const got = Math.min(amt, pl.maxHp - pl.hp);
      pl.hp += got; pe.hp = pl.hp;
      M._acc = (M._acc || 0) + got;
      if (!quiet || M._acc >= pl.maxHp * 0.05) { if (M._acc >= 1) ECHO.Combat.floater(pe.x, pe.y - 1.3, `+${Math.round(M._acc)}`, '#7aff8a'); M._acc = 0; }
      return got;
    },
    // every frame
    tick(game, dt) {
      const pl = game.pl, pe = game.pe;
      if (!pl || !pe || pe.dead || game.defeating) return;
      const S = M.st(pl), on = id => S.on.includes(id) && M.open(pl, ARTS.find(a => a.id === id));
      const fight = M.fighting(game), t = game.time;
      // Second wind answers whenever you are brought low, in a fight or not
      if (on('wind') && pl.hp < pl.maxHp / 3 && pl.hp > 0 && (S.cd.wind || 0) <= t && (pl.mana || 0) >= 20) {
        pl.mana -= 20; S.cd.wind = t + 40;
        M.heal(game, pl.maxHp * 0.35);
        ECHO.Combat.floater(pe.x, pe.y - 1.9, 'second wind!', '#9fe0ff', true);
        ECHO.Combat.ring(pe.x, pe.y, 1.8, 'rgba(160,224,255,0.9)', 0.5);
        ECHO.Combat.burst(pe.x, pe.y, '#9fe0ff', 16, 3, 0.6, 2);
        if (ECHO.Sfx) ECHO.Sfx.play('heal');
      }
      if (!fight) { if (M._acc >= 1) { ECHO.Combat.floater(pe.x, pe.y - 1.3, `+${Math.round(M._acc)}`, '#7aff8a'); M._acc = 0; } return; }
      if (on('renewal') && pl.hp < pl.maxHp && (pl.mana || 0) >= dt) {
        pl.mana -= dt;
        M.heal(game, pl.maxHp * 0.015 * dt, true);
        if (Math.random() < dt * 3) ECHO.Combat.fx.push({ kind: 'p', x: pe.x + (Math.random() - 0.5) * 0.8, y: pe.y + (Math.random() - 0.5) * 0.5, vx: 0, vy: -1.2, t: 0, life: 0.8, color: '#8fe07a', size: 2 });
      }
      if (on('pulse') && (S.cd.pulse || 0) <= t && (pl.mana || 0) >= 10) {
        S.cd.pulse = t + 8; pl.mana -= 10;
        M.heal(game, pl.maxHp * 0.06);
        ECHO.Combat.ring(pe.x, pe.y, 5, 'rgba(184,255,176,0.8)', 0.6);
        for (const e of game.ents) if (e.pal && !e.dead && U.dist(e.x, e.y, pe.x, pe.y) < 6 && e.hp < e.maxHp) { e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.1); ECHO.Combat.burst(e.x, e.y, '#b8ffb0', 8, 2, 0.5, 2); }
      }
    },
    // a blow of yours lands
    onHit(game, dmg) {
      const pl = game.pl;
      if (!pl || !(dmg > 0) || !M.isOn(pl, 'leech') || !M.open(pl, ARTS.find(a => a.id === 'leech'))) return;
      M.heal(game, dmg * 0.06, true);
    },
    // a foe of yours falls
    onKill(game, target) {
      const pl = game.pl;
      if (!pl || !target || target.pal || target.tamed || target.type === 'person' && !target.foe && !game.hostileTo(game.pe, target)) return;
      if (!M.isOn(pl, 'victor')) return;
      M.heal(game, pl.maxHp * 0.08);
    },
    // ------------------------------------------------------------ the character page
    html(game) {
      const pl = game.pl, S = M.st(pl), L = M.level(pl);
      const rows = ARTS.map(a => {
        const open = L >= a.lv, onN = S.on.includes(a.id);
        return `<div class="card mend${onN ? ' on' : ''}${open ? '' : ' locked'}" style="display:flex;gap:12px;align-items:center">
          <div style="font-size:26px;width:36px;text-align:center;color:${a.col}">${a.icon}</div>
          <div style="flex:1"><b style="color:${a.col}">${a.name}</b> <span class="dim" style="font-size:12px">· ${open ? a.mana : 'opens at level ' + a.lv}</span><div style="font-size:13px">${a.d}</div></div>
          <button class="small" data-mend="${a.id}" ${open ? '' : 'disabled'}>${onN ? 'On — switch off' : open ? 'Switch on' : '🔒 Level ' + a.lv}</button></div>`;
      }).join('');
      return `<h3 class="gold">Healing arts <span class="dim" style="font-size:13px">· ${S.on.length}/${MAX_ON} on · they work by themselves in a fight</span></h3>
        <p class="dim" style="margin-top:-4px">Choose up to ${MAX_ON}. While you are fighting, the ones that are on heal you without a key pressed; switch them in and out here as you please.</p>
        <div class="list">${rows}</div>`;
    },
    bind(root, game, redraw) {
      root.querySelectorAll('button[data-mend]').forEach(b => b.addEventListener('click', () => {
        const r = M.toggle(game.pl, b.dataset.mend);
        if (r === 'full') UI().toast(`You can have ${MAX_ON} healing arts on at once — switch one off first.`, 'warn', 4);
        else if (r === 'locked') UI().toast('That art opens at a higher level.', 'info', 3);
        redraw();
      }));
    },
    hud(game) {
      const pl = game.pl, S = M.st(pl), on = ARTS.filter(a => S.on.includes(a.id) && M.open(pl, a));
      if (!on.length) return '';
      const live = M.fighting(game);
      return `<span title="Healing arts on (K)" style="color:#8fe07a;opacity:${live ? 1 : 0.6}">✚${on.map(a => a.icon).join('')}</span>`;
    }
  };
})();
