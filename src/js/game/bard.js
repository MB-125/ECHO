// Music: playing for coin.
//
// With a lute (sold at markets) you can play in any town square or in an
// inn. Notes come along three strings toward the bridge; strike each as it
// crosses (A, S, D — or the arrow keys, or click the string) and the lute
// sounds the actual tune. People drift over to listen while you play, and at
// the end they clap — or don't — and coins land in your hat. Every town has
// its own tune and teaches it to a player good enough to deserve it; a bard of
// some standing can sing the ballad of their own deeds, and the story spreads.
(function () {
  const { U } = ECHO;
  const P = ECHO.Pastimes;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19];
  const BASE_SONGS = [
    { id: 'road', name: 'The Long Road Home', seed: 11 },
    { id: 'miller', name: 'The Miller\'s Daughter', seed: 23 }
  ];

  const B = ECHO.Bard = {
    st: null,
    songs(pl) {
      const out = BASE_SONGS.slice();
      for (const k of pl.tunes || []) out.push(k);
      if (P.level(pl, 'bard') >= 5) out.push({ id: 'ballad', name: `The Ballad of ${pl.first} ${pl.last}`, seed: ECHO.hashStr(pl.charId + 'ballad') % 997, ballad: true });
      return out;
    },
    townTune(s) { const words = ['Lament', 'Reel', 'Air', 'Dance', 'Lullaby', 'Jig']; const h = ECHO.hashStr(s.id + 'tune'); return { id: 'town:' + s.id, name: `The ${s.name} ${words[h % words.length]}`, seed: h % 997, town: s.id }; },
    // where you can play: a town square by day or evening, or inside an inn
    venue(game) {
      const pe = game.pe, world = game.world, L = ECHO.Interior.cur;
      if (L) return L.b && L.b.type === 'inn' ? { inn: true, s: L.s, name: `the inn of ${L.s.name}` } : null;
      const s = ECHO.World.settlementAt(world, pe.x, pe.y, 9);
      if (!s || pe.mounted || pe.inBoat || pe._inWater) return null;
      const h = world.minute / 60;
      if (h < 7 || h > 22) return null;
      return { s, name: `the square of ${s.name}` };
    },
    interactables(game) {
      if (!game.pl.inv.lute || B.st) return [];
      const v = B.venue(game);
      if (!v) return [];
      return [{ kind: 'act', label: v.inn ? 'Play your lute for the inn' : 'Play your lute for the crowd', d: 1.2, act: () => B.choose(game, v) }];
    },
    choose(game, v) {
      const pl = game.pl;
      const ch = B.songs(pl).map(sg => ({ label: `♪ ${sg.name}`, sub: sg.ballad ? 'your own deeds, set to music' : sg.town ? 'a tune learned on the road' : 'an old favourite', onPick: () => B.start(game, v, sg) }));
      ch.push({ label: 'Not now', onPick: () => {} });
      ECHO.UI.modal({ title: `Play in ${v.name}`, html: `<p>Music ${P.level(pl, 'bard')} · ${esc(P.rank(pl, 'bard'))}. Strike each note as it reaches the bridge: <b>A</b>, <b>S</b>, <b>D</b> (or ← ↓ →, or click the string).</p>`, choices: ch });
    },
    // a tune: a seeded pentatonic melody over three strings
    tune(sg, lv) {
      let x = sg.seed * 9301 + 49297;
      const rnd = () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
      const n = 18 + Math.min(10, lv * 1.5 | 0);
      const notes = [];
      let t = 1.6, deg = 4;
      const beat = U.clamp(0.62 - lv * 0.025, 0.36, 0.62);
      for (let i = 0; i < n; i++) {
        deg = U.clamp(deg + Math.floor(rnd() * 5) - 2, 0, SCALE.length - 1);
        const lane = deg < 3 ? 0 : deg < 6 ? 1 : 2;
        notes.push({ t, lane, m: 57 + SCALE[deg], hit: null });
        t += beat * (rnd() < 0.25 ? 0.5 : rnd() < 0.2 ? 1.5 : 1);
        if (i % 8 === 7) t += beat;
      }
      return { notes, end: t + 1.2 };
    },
    start(game, v, sg) {
      const pl = game.pl, lv = P.level(pl, 'bard');
      const T0 = B.tune(sg, lv);
      const win = 0.16 + (lv >= 3 ? 0.03 : 0);
      B.st = { v, sg, T: T0, t: 0, win, good: 0, great: 0, miss: 0, combo: 0, crowd: [] };
      ECHO.UI.modalOpen = true; ECHO.Input.clear();
      let el = document.getElementById('busk');
      if (!el) { el = document.createElement('div'); el.id = 'busk'; document.body.appendChild(el); }
      el.className = '';
      el.innerHTML = `<div class="bk-inner"><h3>♪ ${esc(sg.name)}</h3><canvas width="520" height="170"></canvas><div class="bk-help">A · S · D (or ← ↓ →) as each note reaches the bridge. Esc to stop.</div><div class="bk-state"></div></div>`;
      const c = el.querySelector('canvas');
      c.onclick = ev => { const r = c.getBoundingClientRect(); const lane = Math.floor((ev.clientY - r.top) / r.height * 3); B.hit(U.clamp(lane, 0, 2)); };
      B.key = ev => {
        if (!B.st) return;
        const k = ev.key.toLowerCase();
        const lane = { a: 0, s: 1, d: 2, arrowleft: 0, arrowdown: 1, arrowright: 2 }[k];
        if (lane != null) { ev.preventDefault(); ev.stopImmediatePropagation(); B.hit(lane); }
        if (k === 'escape') { ev.preventDefault(); ev.stopImmediatePropagation(); B.close(true); }
      };
      window.addEventListener('keydown', B.key, true);
      // the music: duck the score and give the lute its own bus
      const M = ECHO.Music;
      if (M && M.ready()) {
        const ctx = M.ctx; B.bus = ctx.createGain(); B.bus.gain.value = 1; B.bus.connect(M.dry); B.bus._wet = ctx.createGain(); B.bus._wet.connect(M.wet);
        for (const L of M.layers) if (!L.dead) L.bus.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3);
      } else B.bus = null;
      // listeners drift over
      B.gather(game, v);
      B.last = performance.now();
      const loop = () => { if (!B.st) return; const now = performance.now(); B.step(game, Math.min(0.05, (now - B.last) / 1000)); B.last = now; B.draw(); B.raf = requestAnimationFrame(loop); };
      B.raf = requestAnimationFrame(loop);
    },
    gather(game, v) {
      if (v.inn) return;
      const pe = game.pe;
      for (const e of game.ents) {
        if (e.type !== 'person' || e.dead || e.hidden || e.role === 'guard' || e.role === 'bandit' || e.isCompanion || e.dq || e.siege || game.hostileTo(e, pe)) continue;
        const d = U.dist(e.x, e.y, pe.x, pe.y);
        if (d > 14 || B.st.crowd.length >= 9) continue;
        const a = Math.atan2(e.y - pe.y, e.x - pe.x);
        e.listen = { x: pe.x + Math.cos(a) * (1.8 + Math.random()), y: pe.y + Math.sin(a) * (1.8 + Math.random()), t: 30 };
        B.st.crowd.push(e);
      }
    },
    step(game, dt) {
      const st = B.st;
      st.t += dt;
      for (const n of st.T.notes) if (n.hit == null && st.t - n.t > st.win) { n.hit = false; st.miss++; st.combo = 0; }
      // the world goes on around you while you play, a little
      game.update(dt * 0.5);
      if (st.t > st.T.end) B.close(false);
    },
    hit(lane) {
      const st = B.st; if (!st) return;
      let best = null, bd = 9;
      for (const n of st.T.notes) { if (n.hit != null || n.lane !== lane) continue; const d = Math.abs(n.t - st.t); if (d < bd) { bd = d; best = n; } }
      if (best && bd <= st.win) {
        best.hit = true; st.combo++;
        if (bd < st.win * 0.45) { st.great++; best.q = 2; } else { st.good++; best.q = 1; }
        if (B.bus) ECHO.Music.INST.lute(B.bus, ECHO.Music.ctx.currentTime + 0.01, mtof(best.m), 0.5, best.q === 2 ? 1 : 0.8);
      } else {
        st.combo = 0; st.flub = 0.3;
        if (B.bus) ECHO.Music.INST.lute(B.bus, ECHO.Music.ctx.currentTime + 0.01, mtof(52 + lane * 3) * 1.06, 0.2, 0.4);
      }
    },
    draw() {
      const st = B.st, el = document.getElementById('busk'); if (!st || !el) return;
      const g = el.querySelector('canvas').getContext('2d'), W = 520, H = 170, bx = 70, speed = 170;
      g.fillStyle = '#2a1e14'; g.fillRect(0, 0, W, H);
      for (let l = 0; l < 3; l++) { const y = 30 + l * 55; g.strokeStyle = '#c8b080'; g.lineWidth = 2 - l * 0.4; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); g.fillStyle = '#f0d890'; g.font = '14px monospace'; g.fillText('ASD'[l], 10, y + 5); }
      g.fillStyle = st.flub > 0 ? 'rgba(255,120,90,0.5)' : 'rgba(255,230,160,0.35)'; g.fillRect(bx - 5, 0, 10, H);
      st.flub = Math.max(0, (st.flub || 0) - 0.03);
      for (const n of st.T.notes) {
        const x = bx + (n.t - st.t) * speed, y = 30 + n.lane * 55;
        if (x < -20 || x > W + 20) continue;
        g.fillStyle = n.hit === true ? (n.q === 2 ? '#c8ff9a' : '#ffe08a') : n.hit === false ? '#6a4a3a' : '#fff4d8';
        g.beginPath(); g.arc(x, y, n.hit === true ? 6 : 10, 0, 6.283); g.fill();
      }
      el.querySelector('.bk-state').textContent = `${st.great} sweet · ${st.good} good · ${st.miss} missed${st.combo > 3 ? ` · ${st.combo} in a row!` : ''} · ${st.crowd.length} listening`;
    },
    close(quit) {
      const st = B.st; B.st = null;
      cancelAnimationFrame(B.raf);
      window.removeEventListener('keydown', B.key, true);
      const el = document.getElementById('busk'); if (el) el.className = 'hidden';
      ECHO.UI.modalOpen = false; ECHO.Input.clear();
      const M = ECHO.Music;
      if (M && M.ready()) for (const L of M.layers) if (!L.dead) L.bus.gain.setTargetAtTime(L.md ? L.md.vol : 0.6, M.ctx.currentTime, 1.5);
      if (B.bus) { const b = B.bus; setTimeout(() => { try { b.disconnect(); b._wet.disconnect(); } catch (e) { /* gone */ } }, 3000); B.bus = null; }
      for (const e of st.crowd) if (e.listen) e.listen.t = 4;
      if (!quit) B.result(ECHO.Game, st);
    },
    // the hat
    result(game, st) {
      const world = game.world, pl = game.pl, lv = P.level(pl, 'bard');
      const n = st.T.notes.length, acc = (st.great + st.good * 0.7) / n;
      const s = st.v.s;
      s._played = s._played && s._played.day === world.day ? s._played : { day: world.day, n: 0 };
      const tired = Math.pow(0.6, s._played.n); s._played.n++;
      const listeners = st.v.inn ? 6 + Math.floor((s.pop || 30) / 20) : st.crowd.length;
      let tips = 0, fans = 0;
      if (acc > 0.35) {
        const per = (0.8 + lv * 0.25 + (lv >= 3 ? 0.4 : 0)) * acc * acc * (1 + (s.prosperity || 50) / 150);
        tips = Math.round((2 + listeners * per * 2.2) * tired + (st.v.inn && lv >= 7 ? 20 : 0));
        for (const e of st.crowd) { const npc = world.npcs[e.npcId]; if (!npc) continue; npc.op[pl.charId] = U.clamp((npc.op[pl.charId] || 0) + acc * 4, -100, 100); if (acc > 0.7) fans++; e.say = acc > 0.85 ? ['Bravo!', 'More!', 'Beautiful!', '*claps*'][Math.floor(Math.random() * 4)] : acc > 0.6 ? ['Not bad!', '*claps*', 'Nice tune.'][Math.floor(Math.random() * 3)] : '*polite clapping*'; e.sayT = 2.5; }
      } else for (const e of st.crowd) { e.say = ['Ouch.', 'Keep practising!', '*winces*'][Math.floor(Math.random() * 3)]; e.sayT = 2.5; }
      pl.gold += tips;
      if (tips) ECHO.Sfx.play('coin');
      const lines = [`${Math.round(acc * 100)}% of the notes, ${listeners} listening.`];
      lines.push(tips ? `${tips} crowns land in your hat.` : 'Nobody pays for that.');
      if (tired < 1) lines.push('(They\'ve heard you already today; the crowd is thinner with each song.)');
      // a town's own tune, taught to someone good enough to deserve it
      pl.tunes = pl.tunes || [];
      const tt = B.townTune(s);
      if (acc > 0.65 && !pl.tunes.some(x => x.id === tt.id)) { pl.tunes.push(tt); lines.push(`Afterwards an old ${['woman', 'man'][ECHO.hashStr(s.id) % 2]} hums you the town's own tune. You learn "${tt.name}".`); }
      if (st.sg.ballad && acc > 0.6 && (!s._ballad || world.day - s._ballad > 10)) {
        s._ballad = world.day;
        s.rep = s.rep || {}; s.rep[pl.charId] = U.clamp((s.rep[pl.charId] || 0) + 3, -100, 100);
        pl.renown += 2;
        ECHO.Chronicle.add(world, { text: `${pl.first} ${pl.last} sang the ballad of their own deeds in ${s.name}.`, kind: 'player', importance: 1, sid: s.id, char: pl.charId });
        lines.push('They\'ll be humming your ballad for days.');
      }
      if (lv >= 9 && acc > 0.8) { for (const n2 of ECHO.People.residents(world, s)) if (n2.status === 'alive' && n2.mind && n2.mind.mood != null) n2.mind.mood = Math.min(1, n2.mind.mood + 0.1); lines.push('The whole town seems lighter for it.'); }
      P.gain(game, 'bard', Math.round(4 + acc * 10 + (acc > 0.85 ? 4 : 0)));
      pl.stats = pl.stats || {}; pl.stats.songs = (pl.stats.songs || 0) + 1;
      ECHO.UI.modal({ title: acc > 0.85 ? 'A fine performance' : acc > 0.6 ? 'Well played' : acc > 0.35 ? 'Ragged, but they liked it' : 'A rough one', html: lines.map(l => `<p>${esc(l)}</p>`).join(''), choices: [{ label: 'Bow', onPick: () => {} }] });
    }
  };
  P.extraAct = P.extraAct || [];
  P.extraAct.push(game => B.interactables(game));
  // the extra key: P to play wherever you can
  P.extraTick = P.extraTick || [];
  P.extraTick.push(game => { if (ECHO.Input.hit && ECHO.Input.hit('p') && game.pl.inv.lute && !B.st && !ECHO.UI.paused()) { const v = B.venue(game); if (v) B.choose(game, v); else game.ui.toast('Play in a town square (by day or evening) or inside an inn.', 'info', 3); } });
})();
