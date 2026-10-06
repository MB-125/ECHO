// Marvels: the wonders of the world as you meet them in real time.
//
// Fireflies over warm meadows. Stars streaking across clear night skies —
// and now and then one that falls to earth nearby, leaving a shard of
// star-iron for whoever reaches it first. Wisps that gather on clear nights
// and lead the way to the Echoes of the Old World. The shades of the
// restless dead, lingering by their homes. The White Hind at the forest's
// edge at dawn and dusk. And, each real day, an omen.
(function () {
  const { U } = ECHO;
  const T = ECHO.TIME;
  const W = () => ECHO.Wonders;
  const UI = () => ECHO.UI;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const DIRS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
  const dirWord = (dx, dy) => DIRS[((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8];

  const Mv = ECHO.Marvels = {
    flies: [], streaks: [], glows: [], wisp: null, scene: null, t: 0, slowT: 0,
    wispCD: 25, streakCD: 6, hindCD: 0, nightFalls: 0, nightKey: null,

    reset() {
      Mv.flies = []; Mv.streaks = []; Mv.glows = []; Mv.wisp = null; Mv.scene = null;
      Mv.wispCD = 20 + Math.random() * 30; Mv.streakCD = 4;
    },
    sky(game) {
      const world = game.world;
      const wx = ECHO.Weather ? ECHO.Weather.here(world, game.pe.x, game.pe.y) : { today: 'clear' };
      return { wx, clear: wx.today === 'clear' || wx.today === 'heat', wet: ['rain', 'storm', 'snow', 'blizzard'].includes(wx.today), dl: T.daylight(world.minute), season: T.dateOf(world.day).seasonIdx };
    },
    omen(world, kind) { const o = world.omen; return o && o.kind === kind && o.date === Mv.today() ? o : null; },
    today() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); },
    // Is something uncanny close by? (the music listens to this)
    enchanted(game) {
      if (Mv.scene) return true;
      const pe = game.pe;
      if (Mv.wisp && Mv.wisp.alpha > 0.3 && U.dist(Mv.wisp.x, Mv.wisp.y, pe.x, pe.y) < 14) return true;
      return game.ents.some(e => e.marvel && !e.dead && U.dist(e.x, e.y, pe.x, pe.y) < 7);
    },

    // ------------------------------------------------------------ per frame
    update(game, dt) {
      const world = game.world, pe = game.pe;
      Mv.glows.length = 0;
      if (!world || !pe || ECHO.Interior.cur) { Mv.flies.length = 0; Mv.streaks.length = 0; return; }
      const sk = Mv.sky(game);
      const night = sk.dl < 0.25;
      // a new night: falling stars reset
      const nk = world.day + (world.minute < 720 ? -1 : 0);
      if (Mv.nightKey !== nk) { Mv.nightKey = nk; Mv.nightFalls = 0; }
      Mv.updateFlies(game, dt, sk);
      Mv.updateStreaks(game, dt, sk, night);
      Mv.updateStars(game, dt);
      Mv.updateWisp(game, dt, sk, night);
      Mv.updateEchoSites(game, dt);
      Mv.updateScene(game, dt);
      Mv.t -= dt;
      if (Mv.t <= 0) {
        Mv.t = 1;
        Mv.updateShades(game, night);
        Mv.maybeHind(game, sk);
      }
      if (game.pl.wisplight && night) { // the twelfth echo's gift: a wisp of your own
        const a = game.time * 1.3;
        const x = pe.x + Math.cos(a) * 0.9, y = pe.y + Math.sin(a) * 0.6;
        Mv.glows.push({ x, y, h: 1.6 + Math.sin(game.time * 2) * 0.15, s: 0.5, c: '#cfeaff', a: 0.9 });
        game.light(x, y, 4.5, 0.6, '#bfe0ff');
      }
    },

    // ------------------------------------------------------------ fireflies
    updateFlies(game, dt, sk) {
      const world = game.world, pe = game.pe, Tl = ECHO.TILE;
      const d = T.dateOf(world.day);
      const warm = sk.season === 1 || sk.season === 2 || (sk.season === 0 && d.dayOfSeason > 8);
      const want = warm && sk.dl < 0.3 && !sk.wet && sk.wx.today !== 'fog' ? (game.currentSid ? 14 : 64) : 0;
      const F = Mv.flies;
      for (let i = F.length - 1; i >= 0; i--) {
        const f = F[i];
        f.ph += dt * f.sp; f.life -= dt;
        f.vx += (Math.random() - 0.5) * dt * 1.4; f.vy += (Math.random() - 0.5) * dt * 1.4;
        f.vx *= 0.98; f.vy *= 0.98;
        f.x += f.vx * dt; f.y += f.vy * dt; f.h = U.clamp(f.h + Math.sin(f.ph * 0.7) * dt * 0.3, 0.25, 2);
        if (f.life <= 0 || Math.abs(f.x - pe.x) > 15 || Math.abs(f.y - pe.y) > 12 || (F.length > want && Math.random() < dt)) { F.splice(i, 1); continue; }
        const blink = Math.max(0, Math.sin(f.ph));
        if (blink > 0.05) Mv.glows.push({ x: f.x, y: f.y, h: f.h, s: 0.32, c: f.c, a: blink * blink });
      }
      let tries = 0;
      while (F.length < want && tries++ < 6) {
        const x = pe.x + (Math.random() - 0.5) * 24, y = pe.y + (Math.random() - 0.5) * 18;
        const t = ECHO.World.tile(world, x, y);
        if (![Tl.GRASS, Tl.FOREST, Tl.SWAMP, Tl.FARM, Tl.TREE, Tl.SAND].includes(t)) continue;
        F.push({ x, y, h: 0.4 + Math.random() * 1.2, vx: 0, vy: 0, ph: Math.random() * 6, sp: 1.5 + Math.random() * 2, life: 8 + Math.random() * 14, c: Math.random() < 0.8 ? '#d8ff7a' : '#fff0a0' });
      }
    },

    // ------------------------------------------------------------ shooting & falling stars
    updateStreaks(game, dt, sk, night) {
      for (const s of Mv.streaks) s.t += dt;
      Mv.streaks = Mv.streaks.filter(s => s.t < s.life);
      if (!night || !sk.clear) return;
      const world = game.world;
      const shower = Mv.omen(world, 'stars');
      const longnight = ECHO.Festivals && ECHO.Festivals.today(world) && ECHO.Festivals.today(world).key === 'longnight';
      Mv.streakCD -= dt;
      if (Mv.streakCD > 0) return;
      Mv.streakCD = shower ? 1.5 + Math.random() * 3 : longnight ? 6 + Math.random() * 10 : 18 + Math.random() * 35;
      const ang = Math.PI * (0.1 + Math.random() * 0.8) * (Math.random() < 0.5 ? 1 : -1) + (Math.random() < 0.5 ? 0 : Math.PI);
      const s = { t: 0, life: 0.7 + Math.random() * 0.6, x: 0.15 + Math.random() * 0.7, y: 0.04 + Math.random() * 0.3, dx: Math.cos(ang), dy: Math.abs(Math.sin(ang)) * 0.6 + 0.15, len: 0.12 + Math.random() * 0.12, bright: Math.random() < 0.2 };
      Mv.streaks.push(s);
      // Sometimes one doesn't burn out.
      const maxFalls = shower ? 3 : 1;
      const chance = shower ? 0.35 : longnight ? 0.25 : 0.1;
      if (Mv.nightFalls < maxFalls && !game.currentSid && Math.random() < chance) {
        s.bright = true; s.life = 1.4; s.len = 0.28;
        Mv.nightFalls++;
        setTimeout(() => Mv.landStar(game, s.dx, s.dy), 1300);
      }
    },
    landStar(game, dx, dy) {
      const world = game.world, pe = game.pe;
      if (!world || !pe || ECHO.Interior.cur) return;
      const L = Math.hypot(dx, dy) || 1;
      for (let k = 0; k < 12; k++) {
        const dist = 14 + Math.random() * 16;
        const a = Math.atan2(dy / L, dx / L) + (Math.random() - 0.5) * 0.6;
        const x = pe.x + Math.cos(a) * dist, y = pe.y + Math.sin(a) * dist;
        if (x < 4 || y < 4 || x > world.W - 4 || y > world.H - 4) continue;
        const spot = ECHO.Ent.freeSpot(world, x, y, 3);
        if (!spot || ECHO.World.settlementAt(world, spot.x, spot.y, 9)) continue;
        const st = W().state(world);
        st.stars.push({ id: 'st' + world.day + '_' + Math.floor(Math.random() * 1e6), x: spot.x, y: spot.y, d: world.day, taken: false });
        ECHO.Sfx.play('explode', { vol: 0.25, pitch: 0.6 });
        game.shake(0.12);
        ECHO.Music.stinger('star');
        UI().banner('A star has fallen', `It came down to the ${dirWord(spot.x - pe.x, spot.y - pe.y)}, not far from here`);
        UI().toast(`A falling star came down to the ${dirWord(spot.x - pe.x, spot.y - pe.y)}. Its light won't last — find it before dawn.`, 'legend', 7);
        return;
      }
    },
    updateStars(game, dt) {
      const world = game.world, pe = game.pe;
      const st = world.wonders;
      if (!st || !st.stars) return;
      for (const s of st.stars) {
        if (s.taken) continue;
        if (Math.abs(s.x - pe.x) > 60 || Math.abs(s.y - pe.y) > 60) continue;
        // a pillar of pale light, visible from far off
        for (let i = 0; i < 18; i++) Mv.glows.push({ x: s.x, y: s.y, h: i * 0.9, s: 1.1 - i * 0.03, c: i < 2 ? '#ffffff' : '#bfe0ff', a: (1 - i / 18) * (0.55 + 0.1 * Math.sin(game.time * 3 + i)) });
        Mv.glows.push({ x: s.x, y: s.y, h: 0.25, s: 2.2, c: '#9fd3ff', a: 0.55 });
        game.light(s.x, s.y, 6, 1.1, '#cfe6ff');
        if (Math.random() < dt * 6) ECHO.Combat.fx.push({ kind: 'p', spark: true, x: s.x + (Math.random() - 0.5) * 0.8, y: s.y + (Math.random() - 0.5) * 0.8, vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.5) * 0.6, t: 0, life: 0.9, color: '#cfeaff', size: 2 });
      }
    },
    nearestStar(game) {
      const st = game.world.wonders;
      if (!st || !st.stars) return null;
      let best = null, bd = 80;
      for (const s of st.stars) { if (s.taken) continue; const d = U.dist(s.x, s.y, game.pe.x, game.pe.y); if (d < bd) { bd = d; best = s; } }
      return best;
    },

    // ------------------------------------------------------------ wisps
    updateWisp(game, dt, sk, night) {
      const world = game.world, pe = game.pe;
      const w = Mv.wisp;
      const restless = Mv.omen(world, 'wisps') || W().has(world, game.pl, 'starlit');
      if (!w) {
        Mv.wispCD -= dt;
        const dusk = sk.dl < 0.45;
        if (Mv.wispCD > 0 || !(night || (restless && dusk)) || game.currentSid || sk.wx.today === 'storm' || sk.wx.today === 'blizzard' || Mv.scene) return;
        Mv.wispCD = restless ? 25 + Math.random() * 25 : 60 + Math.random() * 70;
        const echo = W().nearestEcho(world, pe.x, pe.y, restless ? 140 : 95);
        let goal = echo ? { x: echo.x, y: echo.y, echo } : null;
        if (!goal && Math.random() < 0.4) {
          // nothing left to show: a wisp leads to something lost instead
          const a = Math.random() * Math.PI * 2, d = 16 + Math.random() * 10;
          const spot = ECHO.Ent.freeSpot(world, pe.x + Math.cos(a) * d, pe.y + Math.sin(a) * d, 4);
          if (spot && !ECHO.World.settlementAt(world, spot.x, spot.y, 9)) goal = { x: spot.x, y: spot.y, cache: true };
        }
        if (!goal) return;
        const toward = Math.atan2(goal.y - pe.y, goal.x - pe.x) + (Math.random() - 0.5) * 1.6;
        const r = 7 + Math.random() * 3;
        Mv.wisp = { x: pe.x + Math.cos(toward) * r, y: pe.y + Math.sin(toward) * r, h: 1.1, goal, mode: 'wait', alpha: 0, t: 0, lost: 0, chimeT: 0 };
        return;
      }
      w.t += dt;
      const dP = U.dist(w.x, w.y, pe.x, pe.y), dG = U.dist(w.x, w.y, w.goal.x, w.goal.y);
      if (w.mode === 'fade') { w.alpha -= dt * 0.6; if (w.alpha <= 0) Mv.wisp = null; }
      else {
        w.alpha = Math.min(1, w.alpha + dt * 0.5);
        if (sk.dl > 0.6 || (w.goal.echo && w.goal.echo.found)) w.mode = 'fade';
        if (dP > 28) { w.lost += dt; if (w.lost > 18) w.mode = 'fade'; } else w.lost = 0;
        if (w.mode === 'wait' && dP < 5.5) { w.mode = 'lead'; if (!w.greeted) { w.greeted = true; Mv.chime(0); } }
        if (w.mode === 'lead') {
          if (dP > 9.5) w.mode = 'wait';
          else if (dG > 0.6) {
            // drift ahead, never far ahead of you
            const sp = (dP < 4 ? 2.6 : 1.4) * (dG < 3 ? 0.6 : 1);
            const ax = (w.goal.x - w.x) / dG, ay = (w.goal.y - w.y) / dG;
            const wob = Math.sin(w.t * 1.7) * 0.6;
            w.x += (ax - ay * wob * 0.4) * sp * dt; w.y += (ay + ax * wob * 0.4) * sp * dt;
          }
          w.chimeT -= dt;
          if (w.chimeT <= 0) { w.chimeT = 2.5 + Math.random() * 3; Mv.chime(1 + Math.floor(Math.random() * 4)); }
        }
        // there: it waits for you, then shows you
        if (dG < 1.2 && U.dist(pe.x, pe.y, w.goal.x, w.goal.y) < 3.2) {
          if (w.goal.echo) Mv.beginEcho(game, w.goal.echo);
          else if (w.goal.cache) Mv.findCache(game, w.goal);
          w.mode = 'fade';
        }
      }
      w.h = 1.1 + Math.sin(w.t * 2.2) * 0.25;
      const a = w.alpha * (0.85 + Math.sin(w.t * 9) * 0.15);
      Mv.glows.push({ x: w.x, y: w.y, h: w.h, s: 0.55, c: '#ffffff', a });
      Mv.glows.push({ x: w.x, y: w.y, h: w.h, s: 1.6, c: '#9fd3ff', a: a * 0.45 });
      game.light(w.x, w.y, 4.5, 0.8 * w.alpha, '#a8d8ff');
      if (Math.random() < dt * 12 * w.alpha) ECHO.Combat.fx.push({ kind: 'p', x: w.x + (Math.random() - 0.5) * 0.3, y: w.y + (Math.random() - 0.5) * 0.3, vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3, t: 0, life: 1.1, color: '#bfe8ff', size: 2, h0: w.h, vz: -0.2 });
    },
    chime(i) {
      const M = ECHO.Music;
      if (!M.ready()) return;
      const notes = [83, 86, 88, 90, 93];
      const bus = M.ctx.createGain(); bus.gain.value = 0.5; bus.connect(M.dry); bus._wet = M.ctx.createGain(); bus._wet.connect(M.wet);
      M.INST.bell(bus, M.ctx.currentTime + 0.02, 440 * Math.pow(2, (notes[i % notes.length] - 12 - 69) / 12), 1, 0.7);
      setTimeout(() => { try { bus.disconnect(); } catch (e) { /* gone */ } }, 5000);
    },
    findCache(game, g) {
      const pl = game.pl, r = Math.random();
      const what = r < 0.35 ? (pl.gold += 15 + Math.floor(Math.random() * 25), 'an old purse of crowns') : r < 0.6 ? (pl.inv.herbs += 3, 'a bundle of moonherbs, still fresh') : r < 0.85 ? (pl.inv.arrows += 12, 'a quiver someone left behind') : ((pl.inv.starshard = (pl.inv.starshard || 0) + 1), 'a small shard of star-iron');
      ECHO.Sfx.play('coin');
      UI().toast(`The wisp sinks into the grass and goes out. Where it was, you find ${what}.`, 'legend', 6);
    },
    // A faint shimmer where an echo waits — you can stumble on one by day too.
    updateEchoSites(game, dt) {
      const world = game.world, pe = game.pe;
      const st = world.wonders;
      if (!st || !st.echoes || Mv.scene) return;
      for (const e of st.echoes) {
        if (e.found) continue;
        const d = U.dist(e.x, e.y, pe.x, pe.y);
        if (d > 9) continue;
        const k = 1 - d / 9;
        for (let i = 0; i < 5; i++) {
          const ph = game.time * 0.6 + i * 1.3;
          Mv.glows.push({ x: e.x + Math.cos(ph * 1.7 + i) * 1.2, y: e.y + Math.sin(ph * 1.3 + i) * 0.9, h: 0.3 + ((ph * 0.5) % 2), s: 0.3, c: '#cfe8ff', a: 0.6 * k * Math.max(0, Math.sin(ph * 2)) });
        }
        if (d < 2.2 && (!Mv.wisp || Mv.wisp.goal.echo === e)) Mv.beginEcho(game, e);
      }
    },

    // ------------------------------------------------------------ an echo plays out
    beginEcho(game, echo) {
      if (Mv.scene || echo.found) return;
      const world = game.world;
      const frag = W().MYTH[echo.part];
      ECHO.Music.stinger('echo');
      const ghosts = [];
      const mk = (x, y, dir, o = {}) => {
        const i = ghosts.length;
        const e = ECHO.Ent.make({ type: 'ghost', ghost: true, marvel: true, x, y, r: 0.3, hp: 1, maxHp: 1, dir, flip: Math.cos(dir) < 0, speed: 1, alpha: 0,
          look: { skin: '#d8f0ff', hair: '#eef8ff', female: i % 2 === 1, hairStyle: i % 4, beard: i % 3 === 2 }, gear: {}, ...o });
        ghosts.push(e); game.ents.push(e); return e;
      };
      const cx = echo.x, cy = echo.y, toP = Math.atan2(game.pe.y - cy, game.pe.x - cx);
      switch (frag.pose) {
        case 'circle': for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; mk(cx + Math.cos(a) * 1.4, cy + Math.sin(a) * 1.4, a + Math.PI, { kneel: i % 2 === 0 }); } break;
        case 'king': { mk(cx, cy, toP, { crown: true, kneel: false, seatedGhost: true }); for (let i = 0; i < 4; i++) { const a = toP + Math.PI + (i - 1.5) * 0.6; mk(cx + Math.cos(a) * 1.8, cy + Math.sin(a) * 1.8, a + Math.PI, { kneel: true }); } break; }
        case 'procession': { const a = toP + Math.PI / 2; for (let i = 0; i < 5; i++) mk(cx - Math.cos(a) * (2.5 - i * 1.1), cy - Math.sin(a) * (2.5 - i * 1.1), a, { walk: a, child: i === 2 }); break; }
        case 'pair': { mk(cx - 0.5, cy, -Math.PI / 2, { child: true }); mk(cx + 0.6, cy + 0.2, Math.PI); mk(cx + 1.2, cy - 0.4, Math.PI); break; }
        case 'line': for (let i = 0; i < 4; i++) mk(cx + (i - 1.5) * 1.1, cy, -Math.PI / 2); break;
        default: mk(cx, cy, toP);
      }
      Mv.scene = { echo, frag, ghosts, t: 0, said: false, shown: false };
    },
    updateScene(game, dt) {
      const sc = Mv.scene;
      if (!sc) return;
      if (ECHO.UI.paused() && sc.shown) return;
      sc.t += dt;
      const world = game.world;
      const fadeIn = Math.min(1, sc.t / 1.8);
      for (const g of sc.ghosts) {
        g.alpha = sc.leaving ? Math.max(0, g.alpha - dt * 0.7) : fadeIn * 0.62;
        if (g.walk != null && !sc.leaving) { g.x += Math.cos(g.walk) * dt * 0.45; g.y += Math.sin(g.walk) * dt * 0.45; g.moving = true; g.anim += dt * 0.6; }
        Mv.glows.push({ x: g.x, y: g.y, h: 0.9, s: 1.5, c: '#9fd3ff', a: g.alpha * 0.25 });
      }
      game.light(sc.echo.x, sc.echo.y, 7, 0.9 * fadeIn, '#a8d8ff');
      if (Math.random() < dt * 20) ECHO.Combat.fx.push({ kind: 'p', x: sc.echo.x + (Math.random() - 0.5) * 4, y: sc.echo.y + (Math.random() - 0.5) * 3, vx: 0, vy: -0.2, t: 0, life: 1.5, color: '#cfeaff', size: 2 });
      if (!sc.said && sc.t > 2.4) {
        sc.said = true;
        const sp = sc.ghosts[0];
        sp.say = W().speech(world, sc.frag.say); sp.sayT = 5.5;
      }
      if (!sc.shown && sc.t > 7.2) { sc.shown = true; Mv.showEcho(game, sc); }
      if (sc.leaving && sc.ghosts.every(g => g.alpha <= 0)) {
        for (const g of sc.ghosts) { g.dead = true; g.vanish = true; }
        Mv.scene = null;
      }
    },
    showEcho(game, sc) {
      const world = game.world, pl = game.pl;
      const r = W().findEcho(world, pl, sc.echo);
      if (!r) { sc.leaving = true; return; }
      ECHO.PlayerCtl.derivedT = 0;
      const known = r.frag.say.split(' ').filter(w => w !== '.').every(w => world.lang && world.lang.known[w]);
      const line = W().speech(world, r.frag.say);
      UI().modal({
        title: `An echo of the old world — ${r.frag.title}`,
        html: `<p class="prose" style="font-size:17px"><i>${esc(r.frag.scene)}</i></p>
          <p style="text-align:center;font-size:20px;color:#bfe8ff;letter-spacing:1px">“${esc(line)}”</p>
          ${known ? `<p class="dim" style="text-align:center">You understand every word.</p>` : `<p class="dim" style="text-align:center">You understand some of it. Study the tablets in the ruins to learn the rest of ${esc(world.lang ? world.lang.name : 'the old tongue')}.</p>`}
          ${r.learned.length ? `<p class="gold" style="text-align:center">You learned ${r.learned.length === 1 ? 'a word' : 'words'} of the old tongue: <b>${r.learned.map(esc).join('</b>, <b>')}</b></p>` : ''}
          <p class="dim" style="text-align:center">Echo ${r.n} of ${r.of}. The vision leaves you stronger (+3 life).${r.fate ? ' <span class="gold">Something of your fate is restored. (+1 Fate)</span>' : ''}</p>
          ${r.all ? '<p class="gold" style="text-align:center">You have seen all of it — the whole story of the old world. A wisp of your own will light your way at night from now on.</p>' : ''}`,
        choices: [{ label: 'Let the vision fade', onPick: () => { sc.leaving = true; } }]
      });
      if (r.fate) ECHO.Music.stinger('fate');
    },

    // ------------------------------------------------------------ shades of the dead
    updateShades(game, night) {
      const world = game.world, pe = game.pe;
      const st = world.wonders;
      if (!st || !st.shades) return;
      const have = new Map(game.ents.filter(e => e.shade).map(e => [e.shade.id, e]));
      for (const sh of st.shades) {
        const e = have.get(sh.id);
        const near = Math.abs(sh.x - pe.x) < 26 && Math.abs(sh.y - pe.y) < 20;
        if (sh.state === 'restless' && night && near) {
          if (!e) {
            const g = ECHO.Ent.make({ type: 'ghost', ghost: true, marvel: true, shade: sh, x: sh.x, y: sh.y, r: 0.3, hp: 1, maxHp: 1, alpha: 0, dir: -Math.PI / 2,
              label: `the shade of ${sh.first}`, look: { skin: '#d8f0ff', hair: '#eef8ff', female: sh.sex === 'f', hairStyle: ECHO.hashStr(sh.npc) % 4 }, gear: {} });
            game.ents.push(g);
          }
        } else if (e) { e.fading = true; }
      }
      for (const e of game.ents) {
        if (!e.shade || e.dead) continue;
        e.alpha = e.fading ? Math.max(0, (e.alpha || 0) - 0.35) : Math.min(0.5, (e.alpha || 0) + 0.2);
        if (e.fading && e.alpha <= 0) { e.dead = true; e.vanish = true; continue; }
        if (e.sayT <= 0 && Math.random() < 0.08 && U.dist(e.x, e.y, pe.x, pe.y) < 8) { e.say = Math.random() < 0.5 ? `${e.shade.toName.split(' ')[0]}…` : '…'; e.sayT = 3; }
      }
    },
    listenShade(game, e) {
      const world = game.world, pl = game.pl, sh = e.shade;
      ECHO.Music.stinger('echo');
      UI().modal({
        title: `The shade of ${sh.name}`,
        html: `<p class="prose"><i>A cold comes over you. ${esc(sh.first)} — who died ${esc(T.fmtDate(sh.d))}, ${esc(sh.cause)} — turns toward you. ${sh.sex === 'f' ? 'Her' : 'His'} voice is like wind in a chimney.</i></p>
          <p style="text-align:center;font-size:18px;color:#bfe8ff">“${esc(sh.words)}”</p>
          <p class="dim">${esc(sh.toName)} — ${esc(sh.first)}'s ${esc(sh.rel)} — ${sh.sid ? 'lives in ' + esc((ECHO.Sim.settlement(world, sh.sid) || {}).name || 'town') : 'is somewhere in the realm'}.</p>`,
        choices: [
          { label: `"I'll tell ${sh.toName.split(' ')[0]}."`, sub: 'Carry their last words', onPick: () => { W().hearShade(world, pl, sh); e.fading = true; UI().toast(`The shade of ${sh.first} lets out a long breath, and thins into the dark. (Talk to ${sh.toName} to pass on the words.)`, 'legend', 6); } },
          { label: 'Back away', onPick: () => {} }
        ]
      });
    },

    // ------------------------------------------------------------ the White Hind
    maybeHind(game, sk) {
      const world = game.world, pe = game.pe;
      if (game.ents.some(e => e.species === 'hind' && !e.dead)) return;
      const st = W().state(world);
      const h = world.minute / 60;
      const twilight = (h >= 5 && h < 7.5) || (h >= 18.5 && h < 20.8);
      if (!twilight || game.currentSid || sk.wet) return;
      const omen = Mv.omen(world, 'hind');
      const region = ECHO.World.regionAt(world, pe.x, pe.y);
      const favoured = omen && omen.region === region.id;
      if (!favoured && st.hindDay != null && world.day - st.hindDay < 3) return;
      let trees = 0;
      for (let dy = -8; dy <= 8; dy += 2) for (let dx = -8; dx <= 8; dx += 2) { const t = ECHO.World.tile(world, pe.x + dx, pe.y + dy); if (t === ECHO.TILE.TREE || t === ECHO.TILE.FOREST) trees++; }
      if (trees < 14) return;
      if (Math.random() > (favoured ? 0.12 : 0.012)) return;
      for (let k = 0; k < 10; k++) {
        const a = Math.random() * Math.PI * 2, d = 9 + Math.random() * 4;
        const spot = ECHO.Ent.freeSpot(world, pe.x + Math.cos(a) * d, pe.y + Math.sin(a) * d, 2);
        if (!spot) continue;
        st.hindDay = world.day;
        const e = ECHO.Ent.make({ type: 'creature', species: 'hind', marvel: true, x: spot.x, y: spot.y, r: 0.42, hp: 46, maxHp: 46, speed: 6.2, state: 'graze', faction: 'wild', label: 'the White Hind', alpha: 0, gear: {} });
        game.ents.push(e);
        ECHO.Music.stinger('stag');
        UI().toast('Something pale moves between the trees. A white hind — they say she only shows herself to those the forest favours. Go quietly.', 'legend', 7);
        return;
      }
    },
    updateEnt(game, e, dt) {
      e.t += dt;
      if (e.type === 'ghost') return; // ghosts are driven by their scene or shade
      if (e.species !== 'hind') return;
      const pe = game.pe, pl = game.pl;
      const d = U.dist(e.x, e.y, pe.x, pe.y);
      e.alpha = Math.min(1, (e.alpha || 0) + dt * 0.8);
      Mv.glows.push({ x: e.x, y: e.y, h: 0.8, s: 2.2, c: '#f0f6ff', a: 0.22 });
      if (Math.random() < dt * 3) ECHO.Combat.fx.push({ kind: 'p', x: e.x + (Math.random() - 0.5) * 0.8, y: e.y + (Math.random() - 0.5) * 0.5, vx: 0, vy: -0.15, t: 0, life: 1.2, color: '#f4f8ff', size: 2 });
      game.light(e.x, e.y, 3.5, 0.5, '#eef6ff');
      const quiet = ECHO.PlayerCtl.sneaking || !pe.moving;
      if (e.state === 'graze') {
        e.moving = false;
        if (Math.random() < dt * 0.25) e.dir = Math.random() * Math.PI * 2;
        if ((d < 7 && !quiet) || d < 1.2 || e.hp < e.maxHp) { e.state = 'flee'; e.t = 0; }
        else if (d < 9) e.dir = Math.atan2(pe.y - e.y, pe.x - e.x); // she watches you
      } else if (e.state === 'flee') {
        const a = Math.atan2(e.y - pe.y, e.x - pe.x);
        ECHO.Ent.seek(game.world, e, e.x + Math.cos(a) * 3, e.y + Math.sin(a) * 3, e.speed, dt, 0.1);
        if (e.t > 2.2) e.alpha = Math.max(0, 1 - (e.t - 2.2) / 1.5);
        if (e.t > 3.8) { e.dead = true; e.vanish = true; UI().toast('The hind is gone, as if she was never there.', 'info', 3); }
      } else if (e.state === 'blessing') {
        e.moving = false;
        if (e.t > 2) { e.alpha = Math.max(0, 1 - (e.t - 2) / 2); if (e.t > 4) { e.dead = true; e.vanish = true; } }
      }
      void pl;
    },
    touchHind(game, e) {
      const world = game.world, pl = game.pl;
      const st = W().state(world);
      e.state = 'blessing'; e.t = 0;
      ECHO.Music.stinger('stag');
      pl.hp = pl.maxHp; pl.stamina = pl.maxSta;
      let gift;
      if (pl.fate < 3) { pl.fate++; gift = 'Something you had lost comes back to you. (+1 Fate)'; }
      else { W().boon(pl, 'sta', 15); gift = 'You feel you could run all day. (+15 stamina, for good)'; }
      st.hind = 'blessed'; st.hindBlessings = (st.hindBlessings || 0) + 1;
      ECHO.PlayerCtl.derivedT = 0;
      const region = ECHO.World.regionAt(world, e.x, e.y);
      ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} was blessed by the White Hind in ${region.name}.`, importance: 2, x: e.x, y: e.y, rep: 3, tag: 'protect' });
      UI().modal({ title: 'The White Hind', html: `<p class="prose"><i>She lowers her head and lets you touch her brow. Her breath is warm. For a moment the whole forest is listening.</i></p><p class="gold" style="text-align:center">You are healed. ${esc(gift)}</p>`, choices: [{ label: 'Let her go', onPick: () => {} }] });
    },
    onKill(e, from) {
      const game = ECHO.Game, world = game.world, pl = game.pl;
      if (e.species !== 'hind') return;
      e.vanish = false;
      const st = W().state(world);
      st.hind = 'slain';
      if (from === game.pe) {
        pl.inv.whitehide = (pl.inv.whitehide || 0) + 1;
        W().charm(world, pl, 'hindcurse', 15);
        ECHO.PlayerCtl.derivedT = 0;
        ECHO.Character.behave(pl, 'cruelty', 0.6);
        const region = ECHO.World.regionAt(world, e.x, e.y);
        ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} killed the White Hind in ${region.name}.`, importance: 2, x: e.x, y: e.y, rep: -6, tag: 'cruel' });
        UI().toast('The White Hind falls without a sound. The forest goes very quiet. You take her pale hide — and feel something go out of you. (Cursed: -20 life for 15 days)', 'warn', 9);
      }
    },

    // ------------------------------------------------------------ interaction
    interactables(game) {
      const out = [], pe = game.pe, world = game.world;
      if (ECHO.Interior.cur) return out;
      for (const e of game.ents) {
        if (!e.marvel || e.dead) continue;
        const d = U.dist(e.x, e.y, pe.x, pe.y);
        if (e.shade && !e.fading && d < 1.9) out.push({ kind: 'act', label: `Listen to the shade of ${e.shade.first}`, d: d * 0.5, act: () => Mv.listenShade(game, e) });
        if (e.species === 'hind' && e.state === 'graze' && d < 2.4) out.push({ kind: 'act', label: ECHO.PlayerCtl.sneaking ? 'Reach out to the White Hind' : 'Reach out to the White Hind (go quietly…)', d: 0.2, act: () => { if (ECHO.PlayerCtl.sneaking) Mv.touchHind(game, e); else { e.state = 'flee'; e.t = 0; } } });
      }
      const st = world.wonders;
      if (st && st.stars) for (const s of st.stars) if (!s.taken && U.dist(s.x, s.y, pe.x, pe.y) < 1.8) out.push({ kind: 'act', label: 'Gather the fallen star', d: 0.3, act: () => Mv.gatherStar(game, s) });
      return out;
    },
    gatherStar(game, s) {
      const world = game.world, pl = game.pl;
      s.taken = true;
      pl.inv.starshard = (pl.inv.starshard || 0) + 1;
      const st = W().state(world); st.stats.stars++;
      ECHO.Music.stinger('star');
      ECHO.Combat.burst(s.x, s.y, '#cfeaff', 24, 3, 1.2, 2);
      ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} found a fallen star.`, importance: 1, x: s.x, y: s.y, rep: 1 });
      UI().toast('In the scorched earth lies a shard of star-iron — cold as winter, lighter than it should be. A smith could forge it into a blade; a priest would know other uses; a merchant would pay well.', 'legend', 9);
    },

    // ------------------------------------------------------------ the night sky
    // Drawn over the scene by either renderer.
    drawSky(ctx, game, W2, H2) {
      if (!Mv.streaks.length) return;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      for (const s of Mv.streaks) {
        const k = s.t / s.life;
        const hx = (s.x + s.dx * k * 0.5) * W2, hy = (s.y + s.dy * k * 0.5) * H2;
        const tx = hx - s.dx * s.len * W2 * Math.min(1, k * 3), ty = hy - s.dy * s.len * H2 * Math.min(1, k * 3);
        const a = Math.sin(Math.PI * Math.min(1, k * 1.05));
        const g = ctx.createLinearGradient(tx, ty, hx, hy);
        g.addColorStop(0, 'rgba(180,210,255,0)'); g.addColorStop(1, `rgba(240,248,255,${0.85 * a})`);
        ctx.strokeStyle = g; ctx.lineWidth = (s.bright ? 3 : 1.6) * (window.devicePixelRatio || 1);
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
        if (s.bright) { ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.beginPath(); ctx.arc(hx, hy, 3 * (window.devicePixelRatio || 1), 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.restore();
    },
    // Edge-of-screen hints toward a fallen star you haven't reached.
    drawHints(ctx, game, toScreen, W2, H2) {
      const s = Mv.nearestStar(game);
      if (!s || ECHO.Interior.cur) return;
      const p = toScreen(s.x, s.y);
      const m = 30 * (window.devicePixelRatio || 1), mv = 110 * (window.devicePixelRatio || 1);
      if (p.x > m && p.y > m && p.x < W2 - m && p.y < H2 - m) return;
      const cx = W2 / 2, cy = H2 / 2, a = Math.atan2(p.y - cy, p.x - cx);
      const k = Math.min((W2 / 2 - m) / Math.abs(Math.cos(a) || 1e-6), (H2 / 2 - mv) / Math.abs(Math.sin(a) || 1e-6));
      const x = cx + Math.cos(a) * k, y = cy + Math.sin(a) * k;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, x, y); ctx.rotate(a);
      const z = window.devicePixelRatio || 1, pulse = 0.7 + 0.3 * Math.sin(game.time * 4);
      ctx.fillStyle = `rgba(207,234,255,${pulse})`; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 2 * z;
      ctx.beginPath(); ctx.moveTo(12 * z, 0); ctx.lineTo(-6 * z, -8 * z); ctx.lineTo(-2 * z, 0); ctx.lineTo(-6 * z, 8 * z); ctx.closePath(); ctx.stroke(); ctx.fill();
      ctx.restore();
      ctx.save(); ctx.font = `${Math.round(11 * z)}px "Pixelify Sans", monospace`; ctx.textAlign = 'center'; ctx.fillStyle = '#cfeaff'; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 3 * z;
      const lx = x - Math.cos(a) * 26 * z, ly = y - Math.sin(a) * 18 * z;
      const t = `fallen star · ${Math.round(U.dist(s.x, s.y, game.pe.x, game.pe.y))}`;
      ctx.strokeText(t, lx, ly); ctx.fillText(t, lx, ly); ctx.restore();
    },

    // ------------------------------------------------------------ omens
    // One a real day: a reason to go and look.
    dailyOmen(world) {
      const today = Mv.today();
      if (!world.player || (world.omen && world.omen.date === today)) return null;
      if ((world.playSeconds || 0) < 300) { world.omen = { date: today, kind: 'none' }; return null; } // not while the world is brand new
      const rng = new ECHO.RNG(ECHO.hashStr(today + world.seed));
      const kinds = ['hind', 'stars', 'wisps', 'merchant'];
      const kind = kinds[rng.int(0, kinds.length - 1)];
      const o = { date: today, kind };
      if (kind === 'hind') {
        const wood = world.regions.filter(r => (r.forest || 0) > 0.25 || r.biome === 'forest');
        const r = wood.length ? rng.pick(wood) : rng.pick(world.regions);
        o.region = r.id; o.text = `Woodcutters swear they have seen the White Hind in ${r.name}. She walks at dawn and dusk.`;
      } else if (kind === 'stars') o.text = 'The old women say the sky is restless tonight: watch for falling stars after dark.';
      else if (kind === 'wisps') o.text = 'The wisps are restless. Even at dusk they are seen over the moors, as if looking for someone.';
      else {
        const towns = world.settlements.filter(s => s.faction !== 'ashfang');
        const s = rng.pick(towns);
        o.sid = s.id; o.text = `A star-merchant has set up a stall in ${s.name}'s market — strange goods from far away, for one day only.`;
      }
      world.omen = o;
      return o;
    },
    MERCHANT: [
      { id: 'starshard', name: 'Star-iron shard', price: 85, desc: 'A sliver of a fallen star.' },
      { id: 'wisplamp', name: 'Wisp lantern', price: 60, desc: 'Lit at night, it shows you where an echo of the old world waits.' },
      { id: 'skylantern', name: 'Wishing lantern', price: 25, desc: 'Release it with a wish, here and now.' },
      { id: 'moonherbs', name: 'Moonherbs (5)', price: 20, desc: 'Herbs picked under a full moon.' }
    ],
    useWispLamp(game) {
      const world = game.world;
      const e = W().nearestEcho(world, game.pe.x, game.pe.y);
      if (!e) return UI().toast('The lantern flickers and finds nothing. You have seen every echo there is.', 'info', 4);
      e.revealed = true;
      UI().toast(`The wisp lantern's flame leans ${dirWord(e.x - game.pe.x, e.y - game.pe.y)}, toward an echo of the old world. It is marked on your map.`, 'legend', 6);
      ECHO.Music.stinger('discover');
    }
  };
})();
