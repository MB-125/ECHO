// Prospecting: panning the rivers for gold.
//
// Wade into a shallow river with a pan and press E. You swirl the gravel and
// a glint of something heavy rides round the pan; tip the light stuff out (E,
// Space or click) each time the glint passes the notch at the lip. Three good
// swirls and you see what's left in the bottom: gold dust, now and then a
// nugget, and for an old hand, gems. Running water is richer than still, some
// streams far richer than others, and a bar you've just worked needs a few
// days to fill again.
(function () {
  const { U } = ECHO;
  const P = ECHO.Pastimes;
  Object.assign(P.GOODS, {
    golddust: { name: 'gold dust', value: 7, icon: '✦' },
    nugget: { name: 'gold nuggets', value: 28, icon: '●' },
    garnet: { name: 'garnets', value: 45, icon: '◆' },
    sapphire: { name: 'river sapphires', value: 80, icon: '◆' }
  });

  const PR = ECHO.Prospect = {
    st: null,
    // how good a stretch of river is (0..1, fixed for the world)
    richness(world, x, y) {
      const h = ECHO.hash2(Math.floor(x / 6), Math.floor(y / 6), world.seed + 501);
      const flow = ECHO.Boats ? ECHO.Boats.flow(world, x, y) : { x: 0, y: 0 };
      const running = Math.hypot(flow.x, flow.y) > 0.15;
      return U.clamp(h * h * 1.2 + (running ? 0.25 : 0), 0, 1);
    },
    spotKey(x, y) { return Math.floor(x / 3) + ',' + Math.floor(y / 3); },
    can(game) {
      const pe = game.pe, pl = game.pl;
      if (!pl.inv.pan || ECHO.Interior.cur || pe.mounted || pe.inBoat || pe.swimming) return false;
      return ECHO.Water && ECHO.Water.kind(game.world, pe.x, pe.y) === 'shallow';
    },
    interactables(game) {
      if (!PR.can(game) || PR.st) return [];
      const world = game.world, pe = game.pe;
      const worked = world.panned && world.panned[PR.spotKey(pe.x, pe.y)];
      const tired = worked != null && world.day - worked < 2;
      return [{ kind: 'act', label: tired ? 'Pan for gold (this bar is worked out for now)' : 'Pan for gold', d: 0.6, act: () => PR.start(game) }];
    },
    start(game) {
      const pl = game.pl, lv = P.level(pl, 'prospect');
      const st = PR.st = { a: Math.random() * 6.28, speed: 3.2 + Math.random() * 0.8, hits: 0, miss: 0, need: 3, width: 0.42 + (lv >= 3 ? 0.14 : 0) + lv * 0.01, notch: -Math.PI / 2, x: game.pe.x, y: game.pe.y, loss: 0 };
      ECHO.UI.modalOpen = true; ECHO.Input.clear();
      let el = document.getElementById('panning');
      if (!el) { el = document.createElement('div'); el.id = 'panning'; document.body.appendChild(el); }
      el.className = '';
      el.innerHTML = `<div class="pn-inner"><h3>Panning the gravel</h3><canvas width="220" height="220"></canvas><div class="pn-help">Tip the water out when the glint is in the bright notch — <b>E</b>, <b>Space</b> or click. Three good swirls. <b>Esc</b> to stop.</div><div class="pn-state"></div></div>`;
      el.onclick = () => PR.press();
      PR.key = ev => { if (!PR.st) return; if (ev.key === 'e' || ev.key === 'E' || ev.key === ' ') { ev.preventDefault(); ev.stopImmediatePropagation(); PR.press(); } if (ev.key === 'Escape') { ev.preventDefault(); ev.stopImmediatePropagation(); PR.close(true); } };
      window.addEventListener('keydown', PR.key, true);
      PR.last = performance.now();
      const loop = () => { if (!PR.st) return; const now = performance.now(); PR.step(Math.min(0.05, (now - PR.last) / 1000)); PR.last = now; PR.draw(); PR.raf = requestAnimationFrame(loop); };
      PR.raf = requestAnimationFrame(loop);
      if (ECHO.Sfx) ECHO.Sfx.play('wade');
    },
    step(dt) { const st = PR.st; if (st) st.a += st.speed * dt; },
    inNotch() { const st = PR.st; const d = Math.abs(((st.a - st.notch) % 6.283 + 6.283 + Math.PI) % 6.283 - Math.PI); return d < st.width / 2; },
    press() {
      const st = PR.st; if (!st) return;
      if (PR.inNotch()) { st.hits++; st.speed *= 1.18; st.flash = 1; if (ECHO.Sfx) ECHO.Sfx.play('splash', { vol: 0.4, pitch: 1.4 }); if (st.hits >= st.need) return PR.close(false); }
      else { st.miss++; st.loss += 0.22; st.flash = -1; if (ECHO.Sfx) ECHO.Sfx.play('splash', { vol: 0.3, pitch: 0.8 }); if (st.miss >= 4) return PR.close(false, true); }
    },
    draw() {
      const st = PR.st, el = document.getElementById('panning'); if (!st || !el) return;
      const c = el.querySelector('canvas'), g = c.getContext('2d');
      g.clearRect(0, 0, 220, 220);
      g.fillStyle = '#3a3a40'; g.beginPath(); g.arc(110, 110, 100, 0, 6.283); g.fill();
      g.fillStyle = '#6a7a84'; g.beginPath(); g.arc(110, 110, 90, 0, 6.283); g.fill();
      // the notch at the lip
      g.strokeStyle = st.flash > 0 ? '#c8ff9a' : st.flash < 0 ? '#ff8a6a' : '#ffe08a'; g.lineWidth = 10;
      g.beginPath(); g.arc(110, 110, 95, st.notch - st.width / 2, st.notch + st.width / 2); g.stroke();
      st.flash = (st.flash || 0) * 0.9;
      // swirling gravel and water
      for (let i = 0; i < 40; i++) { const a = st.a * 0.7 + i * 0.6, r = 25 + (i * 37 % 55); g.fillStyle = i % 3 ? '#8a8070' : '#a89a80'; g.fillRect(110 + Math.cos(a) * r - 2, 110 + Math.sin(a) * r - 2, 4, 4); }
      g.fillStyle = 'rgba(160,200,230,0.25)'; g.beginPath(); g.arc(110, 110, 88, 0, 6.283); g.fill();
      // the glint
      const gx = 110 + Math.cos(st.a) * 74, gy = 110 + Math.sin(st.a) * 74;
      g.fillStyle = '#fff2a0'; g.shadowColor = '#ffd84a'; g.shadowBlur = 14; g.beginPath(); g.arc(gx, gy, 6, 0, 6.283); g.fill(); g.shadowBlur = 0;
      el.querySelector('.pn-state').textContent = `Good swirls: ${st.hits}/${st.need} · spilled: ${st.miss}/4`;
    },
    close(quit, spilled) {
      const st = PR.st; PR.st = null;
      cancelAnimationFrame(PR.raf);
      window.removeEventListener('keydown', PR.key, true);
      const el = document.getElementById('panning'); if (el) el.className = 'hidden';
      ECHO.UI.modalOpen = false; ECHO.Input.clear();
      if (!quit) PR.result(ECHO.Game, st, spilled);
    },
    // what's left in the bottom of the pan
    result(game, st, spilled) {
      const world = game.world, pl = game.pl, lv = P.level(pl, 'prospect');
      world.panned = world.panned || {};
      const key = PR.spotKey(st.x, st.y), worked = world.panned[key];
      const tired = worked != null && world.day - worked < 2;
      world.panned[key] = world.day;
      if (spilled) { game.ui.toast('You slop half the gravel over the lip — and whatever was in it. Steadier next time.', 'info', 3); P.gain(game, 'prospect', 1); return; }
      let rich = PR.richness(world, st.x, st.y) * (tired ? 0.25 : 1) * (1 - Math.min(0.6, st.loss));
      const r = Math.random;
      const got = {};
      if (r() < 0.35 + rich * 0.6) got.golddust = 1 + Math.floor(r() * (1 + rich * 3 + lv * 0.3));
      if (r() < rich * (0.12 + (lv >= 5 ? 0.12 : 0))) got.nugget = 1;
      if (lv >= 7 && r() < rich * 0.12) got[r() < 0.75 ? 'garnet' : 'sapphire'] = 1;
      if (lv >= 9 && r() < 0.02) got.nugget = (got.nugget || 0) + 2;
      const parts = [];
      for (const k in got) { pl.inv[k] = (pl.inv[k] || 0) + got[k]; parts.push(`${got[k]} ${P.GOODS[k].name}`); }
      pl.stats = pl.stats || {}; pl.stats.panned = (pl.stats.panned || 0) + 1;
      if (parts.length) {
        ECHO.Combat.floater(game.pe.x, game.pe.y - 1.4, '+' + parts.join(', '), '#ffd84a', true);
        if (got.nugget || got.garnet || got.sapphire) { ECHO.Sfx.play('perfect'); game.ui.toast(`Something heavy and bright in the bottom of the pan: ${parts.join(', ')}!`, 'legend', 4); }
        else ECHO.Sfx.play('coin', { pitch: 1.4 });
      } else game.ui.toast(tired ? 'Only sand. This bar has been worked out — try further along, or come back in a few days.' : 'Only sand and grit this time.', 'info', 3);
      P.gain(game, 'prospect', 4 + (got.nugget ? 4 : 0) + (got.garnet || got.sapphire ? 6 : 0));
    }
  };
  P.extraAct = P.extraAct || [];
  P.extraAct.push(game => PR.interactables(game));
  // the glint of a rich stream, for an old hand
  P.extraTick = P.extraTick || [];
  P.extraTick.push((game, dt) => {
    if (!game.pl.inv.pan || P.level(game.pl, 'prospect') < 9 || ECHO.Interior.cur || Math.random() > dt * 3) return;
    const pe = game.pe, x = pe.x + (Math.random() - 0.5) * 16, y = pe.y + (Math.random() - 0.5) * 12;
    if (ECHO.Water && ECHO.Water.kind(game.world, x, y) === 'shallow' && PR.richness(game.world, x, y) > 0.6) ECHO.Combat.fx.push({ kind: 'p', x, y, vx: 0, vy: -0.3, t: 0, life: 0.8, color: '#ffe08a', size: 2 });
  });
})();
