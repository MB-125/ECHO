// Reactions: what you hit a foe with, and what it was already carrying, matter together.
//
//   • What your blows leave on a foe:
//       – fire (your flame, a missile, a star): it burns;
//       – cold (a scattergun's cryo-shot, the frost relic): it is chilled, and three chills
//         (or one, if it is soaked) freeze it solid;
//       – shock (a pistol's or rifle's bolt, the storm relic): it is charged;
//       – water (rain, wading, a barrel burst beside it): it is soaked.
//   • What happens when the next thing lands on that:
//       – SHATTER: a blade, arrow or blast on the frozen: far more harm, and shards for those near;
//       – CONDUCT: shock on the soaked: the bolt leaps to every soaked or near foe and stuns them;
//       – OVERLOAD: fire on the charged, or shock on the burning: it bursts where it stands;
//       – BRITTLE: cold on the burning: the fire goes out and it takes a third more from everything;
//       – STEAM: fire on the frozen: a scalding cloud that blinds and soaks all near.
//   • Warded foes (from your level 3, about one in five of the wild things that fight you): a
//     ward turns most of what hits it until it is worn through, or broken at a stroke by the
//     right answer. The colour says which:
//       – Frostbound (blue): broken by fire;
//       – Veiled (violet): broken by shock;
//       – Stoneclad (grey): broken by a heavy blow, a blast, a body thrown into it, or a shatter.
//   • Surge: each reaction you set off fills a pip. Five pips are Overdrive: for eight seconds
//     your blows hit a third harder, your guns burn no ammunition, and your mana is refilled.
//   • Nothing here is saved but which hints you have read (pl.rxSeen): the states live on the
//     bodies in front of you.
(function () {
  const { U } = ECHO;
  const C = () => ECHO.Combat;
  const COL = { fire: '#ff9a4a', cold: '#bfefff', shock: '#ffe66a', water: '#6ab8ff', phys: '#ffffff' };
  const WARDS = {
    frost: { name: 'Frostbound', col: '#7fc8ff', tint: [0.08, 0.26, 0.55], by: 'fire', hint: 'burn it' },
    veil: { name: 'Veiled', col: '#c08aff', tint: [0.3, 0.06, 0.42], by: 'shock', hint: 'shoot it with a bolt' },
    stone: { name: 'Stoneclad', col: '#c8c0b0', tint: [0.22, 0.2, 0.16], by: 'heavy', hint: 'a heavy blow or a blast' }
  };
  const HINTS = {
    shatter: 'SHATTER: a blow on a frozen foe does far more harm and throws shards at those near it. Freeze with a scattergun or the frost relic, then strike.',
    conduct: 'CONDUCT: a bolt into a soaked foe leaps to every soaked or nearby foe and stuns them. Rain, water and burst barrels soak.',
    overload: 'OVERLOAD: fire on a charged foe (or a bolt into a burning one) bursts where it stands. Shoot, then burn.',
    brittle: 'BRITTLE: cold on a burning foe puts the fire out and leaves it taking a third more from everything.',
    steam: 'STEAM: fire on a frozen foe makes a scalding cloud that blinds and soaks everything near.',
    ward: 'A warded foe turns most of what hits it. Its colour tells you the answer: blue, burn it; violet, shoot it with a bolt; grey, a heavy blow or a blast.',
    surge: 'Each reaction fills a pip of Surge. Five pips are OVERDRIVE: eight seconds of harder blows, free ammunition and a full well of mana.'
  };

  const aug = k => (ECHO.Build ? ECHO.Build.r(k) : 0);   // (the rank of an augment of yours: build.js)
  const RX = ECHO.React = {
    WARDS, COL,
    surge: 0, surgeT: 0, od: 0, _busy: 0, _hudT: 0, _scanT: 0, n: 0,
    reset() { RX.surge = 0; RX.surgeT = 0; RX.od = 0; RX._busy = 0; RX.n = 0; },
    ours(game, e) { return !!e && (e === game.pe || e.pal || e.tamed || e.isCompanion); },
    big(e) { return e.type === 'boss' || e.boss2 || e.lord || e.titan; },
    st(e) { return e.rx || (e.rx = { wet: 0, chill: 0, chillT: 0, frozen: 0, charge: 0, brittle: 0, thawed: 0 }); },
    // what a blow is made of
    el(src) {
      if (!src) return null;
      if (src.el) return src.el;
      if (src.type === 'fire') return 'fire';
      if (src.type === 'melee' || src.type === 'ranged' || src.type === 'impact') return 'phys';
      return null;
    },
    heavy(src) { return !!(src.heavy || src.guardbreak || src.type === 'impact' || src.blast); },
    // a number for the renderer: which tint a body wears
    key(e) {
      const s = e.rx, w = e.rxWard;
      if (s && s.frozen > 0) return 1;
      if (w && w.hp > 0) return w.k === 'frost' ? 5 : w.k === 'veil' ? 6 : 7;
      if (!s) return 0;
      return s.brittle > 0 ? 2 : s.charge > 0 ? 3 : s.wet > 0 ? 4 : 0;
    },
    tint(k) { return k === 1 ? [0.3, 0.6, 0.95] : k === 2 ? [0.35, 0.3, 0.3] : k === 3 ? [0.45, 0.42, 0.08] : k === 4 ? [0.03, 0.1, 0.24] : k === 5 ? WARDS.frost.tint : k === 6 ? WARDS.veil.tint : k === 7 ? WARDS.stone.tint : [0, 0, 0]; },
    say(game, e, text, col, big) { C().floater(e.x, e.y - 1.25, text, col, !!big); },
    hint(game, k) {
      const pl = game.pl;
      if (!pl) return;
      const seen = pl.rxSeen || (pl.rxSeen = {});
      if (seen[k]) return;
      seen[k] = 1;
      if (ECHO.UI && ECHO.UI.toast) ECHO.UI.toast(HINTS[k], 'legend', 9);
    },
    // ------------------------------------------------------------ before the harm is done
    pre(game, target, dmg, src) {
      const from = src.from;
      if (target === game.pe) return dmg;
      const mine = RX.ours(game, from);
      if (mine && from === game.pe && RX.od > 0) dmg *= 1.3 + 0.1 * aug('overclock');
      const s = target.rx;
      if (s && s.brittle > 0) dmg *= 1.35 + 0.1 * aug('hairline');
      if (s && s.charge > 0 && from === game.pe) dmg *= 1 + 0.1 * aug('stormfront');
      const el = RX.el(src);
      // a ward turns most of it — unless this is its answer
      const w = target.rxWard;
      if (w && w.hp > 0 && !WARDS[w.k]) w.hp = 0;
      if (w && w.hp > 0 && mine) {
        const W = WARDS[w.k];
        const answer = (W.by === 'fire' && el === 'fire') || (W.by === 'shock' && el === 'shock') || (W.by === 'heavy' && (RX.heavy(src) || (s && s.frozen > 0 && el === 'phys')));
        if (answer) { RX.breakWard(game, target, from); }
        else {
          w.hp -= dmg * 0.7;
          if (w.hp <= 0) RX.breakWard(game, target, from, true);
          else {
            dmg *= 0.3;
            if (game.time - (w.saidT || -9) > 2.2) { w.saidT = game.time; RX.say(game, target, `${W.name}: ${W.hint}`, W.col); if (ECHO.Sfx) ECHO.Sfx.play('shieldBlock', { vol: 0.5 }); }
            RX.hint(game, 'ward');
          }
        }
      }
      // shatter: a blow on the frozen
      if (s && s.frozen > 0 && mine && !src.noRx && (el === 'phys' || (el === 'fire' && src.blast))) { dmg *= (RX.big(target) ? 1.6 : 2.3) * (1 + 0.2 * aug('glacier')); src._shatter = true; }
      return dmg;
    },
    breakWard(game, e, from, worn) {
      const w = e.rxWard, W = WARDS[w.k];
      w.hp = 0;
      e.stagger = Math.max(e.stagger || 0, worn ? 0.6 : 1.6);
      RX.say(game, e, worn ? 'ward worn through' : 'WARD BROKEN', W.col, true);
      C().burst(e.x, e.y - 0.3, W.col, 22, 6, 0.6, 3);
      C().ring(e.x, e.y, 1.6, W.col, 0.35);
      if (ECHO.Sfx) ECHO.Sfx.play('parry', { pitch: 0.7 });
      game.hitStop(0.07);
      if (!worn && RX.ours(game, from)) {
        const wb = aug('warbreaker');
        RX.gain(game, wb >= 2 ? 2 : 1);
        if (ECHO.Build) ECHO.Build.note(game, 'ward');
        if (wb) RX.hit(e, e.maxHp * 0.1 * wb, game.pe, e.x, e.y);
      }
    },
    // ------------------------------------------------------------ after it
    post(game, target, dmg, src) {
      const from = src.from;
      if (ECHO.Build && target !== game.pe && target.hp <= 0 && !target.dead && RX.ours(game, from) && !RX.ours(game, target)) ECHO.Build.kill(game, target, src);
      if (target === game.pe || target.dead && !src._shatter) return;
      if (!RX.ours(game, from) || RX.ours(game, target) || src.noRx) return;
      const el = RX.el(src);
      if (!el) return;
      const s = RX.st(target), a = src.angle != null ? src.angle : 0;
      if (src._shatter) { RX.shatter(game, target, dmg, from, a); return; }
      if (target.dead || target.hp <= 0) return;
      // augments: a heavy blow that burns, arrows that soak, beasts that charge
      if (el === 'phys') {
        const ed = aug('edge'), so = aug('soaker'), pk = aug('pack');
        if (ed && from === game.pe && src.type === 'melee' && RX.heavy(src)) { target.burn = Math.max(target.burn || 0, 2 + ed); target.burnFrom = game.pe; if (s.charge > 0) RX.overload(game, target, dmg, from); }
        else if (so && from === game.pe && src.type === 'ranged' && !src.el) { RX.soak(game, target, 4 + 2 * so); if (s.charge > 0) RX.conduct(game, target, dmg * 0.6, from); }
        else if (pk && from !== game.pe && Math.random() < [0, 0.2, 0.35, 0.5][pk]) s.charge = 5;
        return;
      }
      if (el === 'fire') {
        if (s.frozen > 0) RX.steam(game, target, from);
        else if (s.charge > 0) RX.overload(game, target, dmg, from);
        else if (s.wet > 0) { s.wet = 0; target.burn = 0; RX.say(game, target, 'dried', '#cfd8e0'); }
        s.chill = 0;
      } else if (el === 'cold') {
        if (target.burn > 0) { target.burn = 0; s.brittle = 6 + 2 * aug('hairline'); RX.name(game, target, 'BRITTLE', '#d8e8f0', from, 'brittle'); C().burst(target.x, target.y - 0.3, '#e8f4ff', 12, 4, 0.5, 2); }
        else RX.chill(game, target, s.wet > 0 ? 3 : 1);
      } else if (el === 'shock') {
        if (s.wet > 0) RX.conduct(game, target, dmg, from);
        else if (target.burn > 0) RX.overload(game, target, dmg, from);
        else s.charge = 5 + 2 * aug('stormfront');
      } else if (el === 'water') RX.soak(game, target);
    },
    name(game, e, text, col, from, hint) {
      RX.say(game, e, text, col, true);
      if (from === game.pe || RX.ours(game, from)) { RX.gain(game, 1); if (hint) RX.hint(game, hint); if (ECHO.Build && hint) ECHO.Build.note(game, hint, RX._n || 0); }
    },
    chill(game, e, n) {
      const s = RX.st(e);
      if (s.frozen > 0 || s.thawed > 0) return;
      s.chill += n; s.chillT = 4;
      if (s.chill >= (aug('deepcold') >= 3 ? 2 : 3)) {
        s.chill = 0; s.wet = 0; s.charge = 0;
        s.frozen = (RX.big(e) ? 1.4 : n >= 3 ? 3.6 : 2.6) * (1 + 0.3 * aug('deepcold'));
        e.wcast = null; e.moving = false;
        RX.say(game, e, 'frozen', COL.cold);
        C().burst(e.x, e.y - 0.3, '#dff6ff', 14, 3, 0.5, 2);
        if (ECHO.Sfx) ECHO.Sfx.play('parry', { pitch: 1.5, vol: 0.5 });
      } else RX.say(game, e, 'chilled', '#9fd8ee');
    },
    soak(game, e, t) {
      const s = RX.st(e);
      if (e.burn > 0) e.burn = 0;
      s.wet = Math.max(s.wet, t || 8);
    },
    // water thrown about: a burst barrel, a splash
    splash(game, x, y, r) {
      C().ring(x, y, r, 'rgba(110,180,255,0.8)', 0.4);
      for (let i = 0; i < 14; i++) C().puff(x, y, { h: 0.3, vx: (Math.random() - 0.5) * 5, vy: (Math.random() - 0.5) * 5, vz: 2 + Math.random() * 3, g: 9, life: 0.6, size: 2, color: '#8fc8ff' });
      for (const e of game.ents) {
        if (e.dead || e.hidden || e === game.pe || RX.ours(game, e) || U.dist(e.x, e.y, x, y) > r + (e.r || 0.4)) continue;
        if (e.type !== 'creature' && e.type !== 'monster' && e.type !== 'boss' && !e.aggro) continue;
        RX.soak(game, e); RX.say(game, e, 'soaked', COL.water);
      }
    },
    near(game, x, y, r, not) {
      return game.ents.filter(e => !e.dead && !e.hidden && !e.ghost && e !== not && e !== game.pe && !RX.ours(game, e) && !(e.subdued > 0) && U.dist(e.x, e.y, x, y) < r + (e.r || 0.4) && game.hostileTo(game.pe, e));
    },
    hit(e, dmg, from, x, y, o) {
      RX._busy++;
      try { C().damage(e, dmg, Object.assign({ type: 'magic', from, angle: Math.atan2(e.y - y, e.x - x), noRx: true }, o || {})); } finally { RX._busy--; }
    },
    shatter(game, e, dmg, from, a) {
      const s = RX.st(e);
      s.frozen = 0; s.thawed = 4;
      RX.name(game, e, 'SHATTER', '#dff6ff', from, 'shatter');
      C().burst(e.x, e.y - 0.3, '#eafaff', 26, 7, 0.6, 3);
      for (let i = 0; i < 10; i++) C().puff(e.x, e.y, { h: 0.5, vx: Math.cos(a + (Math.random() - 0.5) * 2.4) * (3 + Math.random() * 5), vy: Math.sin(a + (Math.random() - 0.5) * 2.4) * (3 + Math.random() * 5), vz: 2 + Math.random() * 3, g: 9, life: 0.7, size: 2.2, color: '#cfefff', spark: true });
      if (ECHO.Sfx) { ECHO.Sfx.play('crit'); ECHO.Sfx.play('parry', { pitch: 1.8, vol: 0.7 }); }
      game.hitStop(0.09); game.shake(0.2);
      for (const o of RX.near(game, e.x, e.y, 2.2, e)) { RX.hit(o, dmg * 0.4, from, e.x, e.y, { knock: 0.25 }); if (!o.dead) RX.chill(game, o, aug('glacier') >= 2 ? 3 : 1); }
    },
    conduct(game, e, dmg, from) {
      const s = RX.st(e);
      s.wet = 0; s.charge = 0;
      const lw = aug('livewire');
      const L = RX.near(game, e.x, e.y, 4.5 + lw, null).filter(o => o === e || (o.rx && o.rx.wet > 0) || U.dist(o.x, o.y, e.x, e.y) < 2.4 + lw * 0.5).slice(0, 8 + 3 * lw);
      RX._n = L.length;
      RX.name(game, e, 'CONDUCT', COL.shock, from, 'conduct');
      RX._n = 0;
      let prev = e;
      for (const o of L) {
        if (o !== e) { RX.hit(o, dmg * (0.9 + 0.2 * lw), from, prev.x, prev.y); C().fx.push({ kind: 'arc', x: prev.x, y: prev.y, x2: o.x, y2: o.y, h: 0.8, t: 0, life: 0.3, color: COL.shock }); if (o.rx) o.rx.wet = 0; }
        if (!o.dead) { o.stagger = Math.max(o.stagger || 0, RX.big(o) ? 0.5 : 1.1); o.wcast = null; C().burst(o.x, o.y - 0.3, COL.shock, 8, 4, 0.3, 2); }
        prev = o;
      }
      if (ECHO.Sfx) ECHO.Sfx.play('zap', { pitch: 0.6 });
      game.light(e.x, e.y, 5, 0.9, COL.shock, 0.15);
    },
    overload(game, e, dmg, from) {
      const s = RX.st(e);
      s.charge = 0; e.burn = 0;
      RX.name(game, e, 'OVERLOAD', '#ffb86a', from, 'overload');
      C().puff(e.x, e.y, { h: 0.5, vz: 0.4, g: 0, life: 0.3, size: 26, color: '#fff0c8', glow: true, flash: true, grow: 1.8 });
      C().burst(e.x, e.y - 0.2, '#ffd48a', 22, 7, 0.5, 3);
      C().ring(e.x, e.y, 2.3, 'rgba(255,200,120,0.9)', 0.3);
      if (ECHO.Sfx) ECHO.Sfx.play('boom', { pitch: 1.5, vol: 0.7 });
      game.shake(0.22); game.light(e.x, e.y, 6, 1, '#ffc27a', 0.2);
      const P = Math.max(dmg * 1.5, e.maxHp * (RX.big(e) ? 0.02 : 0.08));
      const ch = aug('chain'), R = 2.3 * (1 + 0.15 * ch);
      for (const o of RX.near(game, e.x, e.y, R, null)) { RX.hit(o, o === e ? P : P * 0.7, from, e.x, e.y, { type: 'fire', knock: o === e ? 0.2 : 0.45, blast: true }); if (ch && o !== e && !o.dead) RX.st(o).charge = 5; }
      if (ECHO.Loose) ECHO.Loose.blast(e.x, e.y, 2.3, { fire: false, power: 1, by: from });
    },
    steam(game, e, from) {
      const s = RX.st(e);
      s.frozen = 0; s.thawed = 4;
      RX.name(game, e, 'STEAM', '#e8f0f8', from, 'steam');
      for (let i = 0; i < 16; i++) C().puff(e.x + (Math.random() - 0.5) * 3, e.y + (Math.random() - 0.5) * 3, { h: 0.4, vz: 0.8 + Math.random(), g: -0.4, life: 1.6 + Math.random(), size: 9, color: '#eef2f6', smoke: true });
      if (ECHO.Sfx) ECHO.Sfx.play('blast', { pitch: 0.5, vol: 0.5 });
      for (const o of RX.near(game, e.x, e.y, 2.8, null)) { o.stagger = Math.max(o.stagger || 0, RX.big(o) ? 0.6 : 1.5); o.wcast = null; RX.soak(game, o, 6); if (o !== e) RX.say(game, o, 'blinded', '#e8f0f8'); }
    },
    // ------------------------------------------------------------ surge and overdrive
    gain(game, n) {
      if (RX.od > 0) { RX.od = Math.min(8 + 2 * aug('momentum'), RX.od + 0.8); return; }
      RX.n++;
      RX.surge = Math.min(5, RX.surge + n); RX.surgeT = 14;
      const pl = game.pl;
      if (pl.maxMana) pl.mana = Math.min(pl.maxMana, (pl.mana || 0) + pl.maxMana * 0.06);
      if (RX.n === 2) RX.hint(game, 'surge');
      if (RX.surge >= 5) {
        RX.surge = 0; RX.od = 8 + 2 * aug('momentum');
        if (ECHO.Build) ECHO.Build.note(game, 'overdrive');
        if (pl.maxMana) pl.mana = pl.maxMana;
        C().floater(game.pe.x, game.pe.y - 1.5, 'OVERDRIVE', '#7ff4ff', true);
        C().ring(game.pe.x, game.pe.y, 3, '#7ff4ff', 0.5);
        if (ECHO.Sfx) ECHO.Sfx.play('lockOn', { pitch: 0.7, vol: 1 });
        game.slowMo(0.3, 0.4);
      }
    },
    // ------------------------------------------------------------ wards
    // which of the things that fight you are warded: worked out once, from what it is and where
    // it stood, when it first comes near
    ward(game, e) {
      e.rxScan = true;
      const lv = ECHO.Prowess ? ECHO.Prowess.level(game.pl) : 1;
      if (lv < 3 || e.pal || e.tamed || e.isCompanion || e.titan || e.type === 'boss' || e.ngWard || e.ward || e.species === 'hare' || e.species === 'deer') return;
      if (!(e.type === 'creature' || e.type === 'monster')) return;
      if (!e.foe && !ECHO.SPECIES[e.species]) return;
      const h = ECHO.hashStr(`${e.species || e.type}:${Math.round((e.home ? e.home.x : e.x) * 3)}:${Math.round((e.home ? e.home.y : e.y) * 3)}:${Math.round(e.maxHp)}`) >>> 0;   // (never a negative number: it picks from a list)
      if (h % 100 >= 20) return;
      const k = ['frost', 'veil', 'stone'][(h >> 8) % 3];
      e.rxWard = { k, hp: e.maxHp * 0.6, max: e.maxHp * 0.6 };
    },
    // ------------------------------------------------------------ each frame
    tick(game, dt) {
      const pe = game.pe;
      if (!pe) return;
      if (RX.od > 0) { RX.od = Math.max(0, RX.od - dt); if (Math.random() < dt * 20) C().fx.push({ kind: 'p', x: pe.x + (Math.random() - 0.5) * 0.6, y: pe.y - Math.random() * 0.8, vx: 0, vy: -1.5, t: 0, life: 0.35, color: '#7ff4ff', size: 1.6, spark: true }); }
      else if (RX.surge > 0 && !aug('capacitor')) { RX.surgeT -= dt; if (RX.surgeT <= 0) { RX.surge--; RX.surgeT = 4; } }
      RX._scanT -= dt;
      const scan = RX._scanT <= 0;
      if (scan) RX._scanT = 0.5;
      const rain = scan && ECHO.Weather && game.world && game.world.regions && !(ECHO.Interior && ECHO.Interior.cur) ? (() => { const w = ECHO.Weather.here(game.world, pe.x, pe.y); return w && (w.today === 'rain' || w.today === 'storm'); })() : false;
      for (const e of game.ents) {
        if (e.dead || e === pe) continue;
        if (scan && !e.rxScan && (e.aggro || e.target === pe || e.foe) && U.dist(e.x, e.y, pe.x, pe.y) < 16) RX.ward(game, e);
        if (scan && (rain || e._inWater) && (e.type === 'creature' || e.type === 'monster') && U.dist(e.x, e.y, pe.x, pe.y) < 20) RX.soak(game, e, 4);
        const w = e.rxWard;
        if (w && w.hp > 0 && WARDS[w.k] && Math.random() < dt * 9) { const a = Math.random() * 6.28, r = (e.r || 0.4) + 0.35; C().fx.push({ kind: 'p', x: e.x + Math.cos(a) * r, y: e.y - 0.2 + Math.sin(a) * r * 0.6, vx: 0, vy: -0.9, t: 0, life: 0.5, color: WARDS[w.k].col, size: 1.7, spark: true }); }
        const s = e.rx;
        if (!s) continue;
        if (s.frozen > 0) {
          s.frozen -= dt;
          e.stagger = Math.max(e.stagger || 0, 0.12); e.moving = false; e.kbx = 0; e.kby = 0;
          if (s.frozen <= 0) { s.thawed = 4; RX.say(game, e, 'thawed', '#9fd8ee'); }
        }
        if (s.thawed > 0) s.thawed -= dt;
        if (s.chillT > 0) { s.chillT -= dt; if (s.chillT <= 0) s.chill = 0; }
        if (s.brittle > 0) s.brittle -= dt;
        if (s.wet > 0) { s.wet -= dt; if (Math.random() < dt * 6) C().fx.push({ kind: 'p', x: e.x + (Math.random() - 0.5) * 0.5, y: e.y - 0.3, vx: 0, vy: 1.2, t: 0, life: 0.35, color: '#7fc0ff', size: 1.3 }); }
        if (s.charge > 0) { s.charge -= dt; if (Math.random() < dt * 10) C().fx.push({ kind: 'p', x: e.x + (Math.random() - 0.5) * 0.7, y: e.y - Math.random() * 0.8, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, t: 0, life: 0.12, color: COL.shock, size: 1.5, spark: true }); }
        if (s.chill > 0 && Math.random() < dt * 5 * s.chill) C().fx.push({ kind: 'p', x: e.x + (Math.random() - 0.5) * 0.6, y: e.y - Math.random() * 0.7, vx: 0, vy: 0.4, t: 0, life: 0.5, color: '#dff6ff', size: 1.3 });
      }
      RX._hudT -= dt;
      if (RX._hudT <= 0) { RX._hudT = 0.15; RX.hud(game); }
    },
    hud(game) {
      if (typeof document === 'undefined') return;
      let el = document.getElementById('hud-surge');
      if (!el) {
        const host = document.getElementById('hud-left');
        if (!host) return;
        el = document.createElement('div'); el.id = 'hud-surge';
        el.title = 'Surge: set off reactions (shatter, conduct, overload, brittle, steam, breaking a ward) to fill it. Five pips are Overdrive.';
        el.style.cssText = 'display:flex;gap:5px;align-items:center;margin:6px 0 2px;font-size:11px;line-height:1;font-weight:600;letter-spacing:.12em;color:#7fe9ff';
        host.appendChild(el);
      }
      const key = RX.od > 0 ? 'od' + Math.ceil(RX.od) : 's' + RX.surge;
      if (el._k === key) return;
      el._k = key;
      const lv = ECHO.Prowess && game.pl ? ECHO.Prowess.level(game.pl) : 1;
      if (RX.od > 0) el.innerHTML = `<span style="color:#fff;text-shadow:0 0 8px #4ff0ff">OVERDRIVE ${Math.ceil(RX.od)}s</span>`;
      else el.innerHTML = (RX.surge > 0 || RX.n > 0 || lv >= 2 ? '<span style="opacity:.75">SURGE</span>' : '') + (RX.surge > 0 || RX.n > 0 || lv >= 2 ? [0, 1, 2, 3, 4].map(i => `<i style="display:inline-block;width:16px;height:6px;transform:skewX(-20deg);background:${i < RX.surge ? '#4ff0ff' : 'rgba(127,233,255,.16)'};box-shadow:${i < RX.surge ? '0 0 6px #4ff0ff' : 'none'}"></i>`).join('') : '');
    }
  };
})();
