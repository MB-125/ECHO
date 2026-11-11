// Builds and trials: something to chase, and a hero that is yours.
//
//   • Trials: three are always open (under your Surge pips): shatter so many, conduct through
//     three at once, break wards, kill in Overdrive… Each one finished gives crowns and an
//     AUGMENT: a choice of one of three, and three new ranks to grow each. They get harder,
//     and never run out.
//   • Augments change what your reactions do, so two heroes fight differently: one freezes
//     whole packs with every shatter, another's overloads set off the next, another's arrows
//     soak and whose beasts leave foes charged.
//   • Saved (lazily): pl.aug {id: rank}, pl.trials {act: [{k, n, need}], done, pick}.
(function () {
  const { U } = ECHO;
  const AUG = {
    glacier: { name: 'Glacier', icon: '❄', what: r => `Shatter does ${20 * r}% more${r >= 2 ? ', and its shards freeze those they hit' : ''}.` },
    deepcold: { name: 'Deep cold', icon: '🧊', what: r => `Foes stay frozen ${30 * r}% longer${r >= 3 ? ', and two chills freeze instead of three' : ''}.` },
    livewire: { name: 'Live wire', icon: '⚡', what: r => `Conduct leaps to ${3 * r} more foes, ${r} paces further, and hits ${20 * r}% harder.` },
    stormfront: { name: 'Storm front', icon: '🌩', what: r => `Charged foes take ${10 * r}% more from you, and stay charged ${2 * r} s longer.` },
    chain: { name: 'Chain reaction', icon: '💥', what: r => `Overload reaches ${15 * r}% further and leaves everything it hits charged, ready to burst again.` },
    pyre: { name: 'Pyre', icon: '🔥', what: r => `A burning foe you kill ${r >= 3 ? 'always bursts' : `has a ${r === 1 ? 35 : 70}% chance to burst`}, like an overload.` },
    hairline: { name: 'Hairline', icon: '🜂', what: r => `Brittle foes take ${35 + 10 * r}% more (not 35%), for ${2 * r} s longer.` },
    warbreaker: { name: 'Warbreaker', icon: '🛡', what: r => `Breaking a ward takes ${10 * r}% of the foe's life with it${r >= 2 ? ' and fills an extra pip of Surge' : ''}.` },
    momentum: { name: 'Momentum', icon: '➤', what: r => `Overdrive lasts ${2 * r} s longer.` },
    capacitor: { name: 'Capacitor', icon: '🔋', what: r => `Surge no longer drains away, and every reaction mends ${3 * r}% of your life.` },
    cryorounds: { name: 'Cryo rounds', icon: '❅', what: r => `Every ${['', 'fourth', 'third', 'second'][r]} pistol or rifle bolt chills instead of charging.` },
    edge: { name: 'Incendiary edge', icon: '🗡', what: r => `Your heavy blows set foes burning for ${2 + r} s.` },
    soaker: { name: 'Rain-arrows', icon: '➶', what: r => `Your arrows soak what they hit for ${4 + 2 * r} s: shoot it next.` },
    pack: { name: 'Pack tactics', icon: '🐾', what: r => `Your beasts' and companions' blows have a ${[0, 20, 35, 50][r]}% chance to leave a foe charged.` },
    overclock: { name: 'Overclock', icon: '✦', what: r => `In Overdrive your blows hit ${30 + 10 * r}% harder (not 30%).` }
  };
  const MAXR = 3;
  // a trial: what to do, and how many (t: how many tiers in)
  const TRIALS = {
    shatter: { need: t => 4 + 2 * t, text: n => `Shatter ${n} frozen foes` },
    conduct: { need: t => 3 + t, text: n => `Conduct ${n} times` },
    overload: { need: t => 3 + t, text: n => `Overload ${n} foes` },
    brittle: { need: t => 3 + t, text: n => `Leave ${n} foes brittle` },
    steam: { need: t => 2 + t, text: n => `Raise steam ${n} times` },
    ward: { need: t => 2 + t, text: n => `Break ${n} wards with the right answer` },
    overdrive: { need: t => 1 + Math.floor(t / 2), text: n => `Reach Overdrive ${n === 1 ? 'once' : n + ' times'}` },
    conduct3: { need: t => 1 + Math.floor(t / 2), text: n => `Conduct through 3 foes at once${n > 1 ? ', ' + n + ' times' : ''}` },
    odkill: { need: t => 3 + 2 * t, text: n => `Kill ${n} foes while in Overdrive` },
    trio: { need: t => 1 + Math.floor(t / 2), text: n => `Three different reactions within 10 s${n > 1 ? ', ' + n + ' times' : ''}` },
    icekill: { need: t => 2 + t, text: n => `Kill ${n} foes with a shatter` },
    rift: { need: () => 1, text: () => 'Close a rift' },
    pod: { need: () => 1, text: () => 'Claim a drop pod' }
  };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const B = ECHO.Build = {
    AUG, TRIALS, MAXR,
    recent: [], shots: 0, _hudT: 0, _k: '',
    reset() { B.recent = []; B.shots = 0; B._k = ''; },
    pl() { return ECHO.Game && ECHO.Game.pl; },
    r(id) { const pl = B.pl(); return (pl && pl.aug && pl.aug[id]) || 0; },
    state(pl) {
      const T = pl.trials || (pl.trials = { act: [], done: 0, pick: 0 });
      while (T.act.length < 3) {
        const have = new Set(T.act.map(a => a.k));
        // (the first three are the gentlest; after that, any)
        const first = ['overload', 'shatter', 'ward'].filter(k => !have.has(k));
        const pool = T.done + T.act.length < 3 && first.length ? first : Object.keys(TRIALS).filter(k => !have.has(k) && k !== T.last);
        const k = pool[Math.floor(Math.random() * pool.length)];
        T.act.push({ k, n: 0, need: TRIALS[k].need(Math.floor(T.done / 4)) });
      }
      return T;
    },
    // every third bolt (or so) chills: cryo rounds
    cryoShot() { const r = B.r('cryorounds'); if (!r) return false; B.shots++; return B.shots % (5 - r) === 0; },
    // ------------------------------------------------------------ what happened
    note(game, k, n) {
      const pl = game.pl;
      if (!pl) return;
      const now = game.time;
      if (k !== 'ward' && k !== 'overdrive' && k !== 'odkill' && k !== 'icekill' && k !== 'rift' && k !== 'pod') {
        B.recent.push({ k, t: now });
        B.recent = B.recent.filter(x => now - x.t < 10);
        if (new Set(B.recent.map(x => x.k)).size >= 3) { B.recent = []; B.bump(game, 'trio', 1); }
        const cap = B.r('capacitor');
        if (cap && game.pe && !game.pe.dead) { game.pe.hp = Math.min(game.pe.maxHp, game.pe.hp + game.pe.maxHp * 0.03 * cap); pl.hp = game.pe.hp; }
      }
      B.bump(game, k, 1);
      if (k === 'conduct' && n >= 3) B.bump(game, 'conduct3', 1);
    },
    bump(game, k, n) {
      const pl = game.pl, T = B.state(pl);
      const a = T.act.find(x => x.k === k);
      if (!a) return;
      a.n += n;
      if (a.n < a.need) return;
      T.act.splice(T.act.indexOf(a), 1);
      T.done++; T.pick++; T.last = k;
      const gold = 20 * (1 + Math.floor(T.done / 4));
      pl.gold = (pl.gold || 0) + gold;
      if (ECHO.UI && ECHO.UI.toast) ECHO.UI.toast(`Trial done: ${TRIALS[k].text(a.need)}. +${gold} crowns, and an augment to choose.`, 'legend', 6);
      if (ECHO.Sfx) ECHO.Sfx.play('lockOn', { pitch: 1.2 });
      B.state(pl);
    },
    // a foe of yours has died of this blow
    kill(game, e, src) {
      const RX = ECHO.React;
      if (e._bk) return;
      e._bk = true;
      if (RX.od > 0) B.bump(game, 'odkill', 1);
      if (src._shatter) B.bump(game, 'icekill', 1);
      const r = B.r('pyre');
      if (r && e.burn > 0 && !src.noRx && Math.random() < [0, 0.35, 0.7, 1][r]) { RX.st(e).charge = 1; RX.overload(game, e, Math.max(8, e.maxHp * 0.12), game.pe); }
    },
    // ------------------------------------------------------------ choosing
    offer(pl) {
      const T = B.state(pl);
      if (T.offer && T.offer.length) return T.offer;
      const open = Object.keys(AUG).filter(k => ((pl.aug && pl.aug[k]) || 0) < MAXR);
      for (let i = open.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [open[i], open[j]] = [open[j], open[i]]; }
      // (one you already have, if you have any, so a build can deepen)
      const mine = open.filter(k => pl.aug && pl.aug[k]), out = [];
      if (mine.length) out.push(mine[0]);
      for (const k of open) if (out.length < 3 && !out.includes(k)) out.push(k);
      return (T.offer = out);
    },
    take(pl, k) {
      const T = B.state(pl);
      pl.aug = pl.aug || {};
      pl.aug[k] = Math.min(MAXR, (pl.aug[k] || 0) + 1);
      T.pick = Math.max(0, T.pick - 1); T.offer = null;
    },
    choose(game) {
      const pl = game.pl, UI = ECHO.UI, off = B.offer(pl);
      if (!off.length) { B.state(pl).pick = 0; return; }
      UI.modal({
        title: 'Choose an augment',
        html: `<p class="dim">Each changes what your reactions do. Each can be taken three times.</p>` + B.listHtml(pl),
        choices: off.map(k => { const r = (pl.aug && pl.aug[k]) || 0; return { label: `${AUG[k].icon} ${AUG[k].name}${r ? ` · rank ${r + 1}` : ''}`, sub: AUG[k].what(r + 1), onPick: () => { B.take(pl, k); if (ECHO.Sfx) ECHO.Sfx.play('coin'); UI.toast(`${AUG[k].name}${r ? ' rank ' + (r + 1) : ''}: ${AUG[k].what(r + 1)}`, 'legend', 6); } }; })
      });
    },
    listHtml(pl) {
      const mine = Object.keys(pl.aug || {}).filter(k => AUG[k]);
      if (!mine.length) return '';
      return `<div class="card"><h4>Your augments</h4>${mine.map(k => `<div class="row"><span style="min-width:170px">${AUG[k].icon} <b>${esc(AUG[k].name)}</b> ${'●'.repeat(pl.aug[k])}${'○'.repeat(MAXR - pl.aug[k])}</span><span class="dim">${esc(AUG[k].what(pl.aug[k]))}</span></div>`).join('')}</div>`;
    },
    // the Trials page of the menu (Quests)
    pageHtml(game) {
      const pl = game.pl, T = B.state(pl);
      return `${T.pick > 0 ? `<div class="card"><div class="row"><b class="gold">★ ${T.pick} augment${T.pick > 1 ? 's' : ''} to choose</b><button data-augpick="1">Choose now</button></div></div>` : ''}
        <div class="card"><h4>Open trials</h4>${T.act.map(a => `<div class="row"><span style="min-width:320px">${esc(TRIALS[a.k].text(a.need))}</span><div class="t" style="flex:1;height:6px;background:rgba(127,233,255,.14)"><div style="height:100%;width:${Math.round(100 * a.n / a.need)}%;background:#4ff0ff;box-shadow:0 0 8px #4ff0ff"></div></div><b style="min-width:54px;text-align:right">${a.n} / ${a.need}</b></div>`).join('')}<div class="dim">Each trial finished gives crowns and an augment. ${T.done} done so far${pl.riftsClosed ? ` · ${pl.riftsClosed} rift${pl.riftsClosed > 1 ? 's' : ''} closed` : ''}.</div></div>`
        + (B.listHtml(pl) || '<p class="dim">No augments yet: finish a trial to choose your first.</p>');
    },
    pageBind(body, game, render) { const b = body.querySelector('button[data-augpick]'); if (b) b.addEventListener('click', () => { ECHO.UI.closePanel(); B.choose(game); void render; }); },
    // the whole of it, to read (click the trials on the screen)
    open(game) {
      const pl = game.pl, T = B.state(pl);
      if (T.pick > 0) { B.choose(game); return; }
      ECHO.UI.modal({
        title: 'Trials and augments',
        html: `<div class="card"><h4>Open trials</h4>${T.act.map(a => `<div class="row"><span style="min-width:300px">${esc(TRIALS[a.k].text(a.need))}</span><b>${a.n} / ${a.need}</b></div>`).join('')}<div class="dim">Each trial finished gives crowns and an augment. ${T.done} done so far.</div></div>` + (B.listHtml(pl) || '<p class="dim">No augments yet: finish a trial to choose your first.</p>'),
        choices: [{ label: 'Close' }]
      });
    },
    // ------------------------------------------------------------ each frame
    tick(game, dt) {
      const pl = game.pl;
      if (!pl || !game.pe) return;
      B._hudT -= dt;
      if (B._hudT > 0) return;
      B._hudT = 0.25;
      const T = B.state(pl);
      // a choice waiting: when the fight is done
      if (T.pick > 0 && !game.pe.dead && !game.defeating && !ECHO.UI.modalOpen && !game.ui.blocksWorld() && game.time - (game.combatT || -99) > 4 && game.time - (game.lastHurtTime || -99) > 4) B.choose(game);
      if (typeof document === 'undefined') return;
      let el = document.getElementById('hud-trials');
      if (!el) {
        const host = document.getElementById('hud-left');
        if (!host) return;
        el = document.createElement('div'); el.id = 'hud-trials';
        el.title = 'Trials: finish one for crowns and an augment. Click to see them and your augments.';
        el.style.cssText = 'margin:4px 0 2px;font-size:11px;line-height:1.5;font-weight:500;color:#bfe9f5;cursor:pointer;pointer-events:auto;max-width:250px';
        el.addEventListener('click', () => { if (!ECHO.UI.modalOpen) { if (ECHO.Game.pl.trials && ECHO.Game.pl.trials.pick > 0) B.choose(ECHO.Game); else ECHO.UI.openJournal('trials'); } });
        host.appendChild(el);
      }
      const key = T.act.map(a => a.k + a.n + '/' + a.need).join('|') + T.pick;
      if (key === B._k) return;
      B._k = key;
      el.innerHTML = (T.pick > 0 ? `<div style="color:#ffe08a">★ Augment ready (${T.pick})</div>` : '') + T.act.map(a => `<div><span style="color:#7fe9ff">◇</span> ${esc(TRIALS[a.k].text(a.need))} <b style="color:#fff">${a.n}/${a.need}</b></div>`).join('');
    }
  };
  void U;
})();
