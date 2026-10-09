// Stealth: being seen is no longer all-or-nothing.
//
// Everyone who might notice you builds suspicion over a moment or two — a
// "?" over their head as they turn to look — and only when it fills do they
// come for you. How fast it fills depends on how far you are, whether you
// are in front of them or behind, whether you are crouched (Ctrl/C), moving
// or still, lit or in shadow, out in the open or down in tall grass, crops,
// reeds and undergrowth. Get behind someone who hasn't seen you and you can
// take them down without a fight (E). Locked strongboxes and iron doors can
// be picked, if you carry lockpicks (sold at markets) and a steady hand.
(function () {
  const { U } = ECHO;
  const T = ECHO.TILE;
  const angDiff = (a, b) => Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI);

  const S = ECHO.Stealth = {
    // How much the ground you stand on hides a crouching body (0..1).
    coverAt(world, x, y) {
      const tx = Math.floor(x), ty = Math.floor(y);
      if (ECHO.Interior && ECHO.Interior.cur) return 0;
      const t = ECHO.World.tile(world, tx, ty);
      const h1 = ECHO.hash2(tx, ty, world.seed + 31);
      const season = ECHO.TIME.dateOf(world.day).seasonIdx;
      let c = 0;
      if (t === T.FOREST) c = h1 < 0.8 ? 0.75 : 0.5;           // undergrowth, bushes, ferns
      else if (t === T.SWAMP) c = h1 < 0.55 ? 0.7 : 0.35;       // reeds
      else if (t === T.FARM) c = season === 1 || season === 2 ? 0.65 : 0.1;  // standing crops in summer and autumn
      else if (t === T.GRASS) c = h1 < 0.32 || (h1 >= 0.335 && h1 < 0.36) ? 0.55 : 0.12;  // tall grass, bushes
      else if (t === T.HILL) c = h1 < 0.32 ? 0.35 : 0.05;
      // trunks close by break up your outline
      let trees = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (ECHO.World.tile(world, tx + dx, ty + dy) === T.TREE) trees++;
      c = Math.max(c, Math.min(0.6, trees * 0.15));
      if (season === 3 && t !== T.FOREST) c *= 0.6;            // winter strips the cover (and snow shows you up)
      return c;
    },
    // How dark it is where you stand (0 = bright, 1 = black).
    darkness(game, x, y) {
      const L = ECHO.Interior && ECHO.Interior.cur;
      if (L) {
        let lit = 0;
        for (const l of L.lights || []) { const d = U.dist(l.x, l.y, x, y); lit = Math.max(lit, 1 - d / Math.max(1, (l.r || 4) * 0.9)); }
        for (const l of game.lights || []) { const d = U.dist(l.x, l.y, x, y); lit = Math.max(lit, (1 - d / Math.max(1, l.r || 3)) * 0.8); }
        const dungeon = L.site || L.delve || L.depth != null;
        return U.clamp((dungeon ? 0.85 : 0.35) - lit, 0, 1);
      }
      if (!game.isNight()) return 0;
      return game.pl.lanternOn ? 0.15 : 0.7;
    },
    // Your visibility right now: a multiplier on how far people can see you.
    vis(game) {
      const pe = game.pe, pl = game.pl, PC = ECHO.PlayerCtl;
      if (S._visAt === game.time) return S._vis;
      let v = 1;
      const crouch = PC.sneaking && !pe.mounted;
      if (crouch) v *= 0.55 * (1 - (pl.skills.shadow || 0) / 260);
      if (pe.mounted) v *= 1.4;
      const moving = pe.moving || (PC.ride && PC.ride.v > 0.4);
      if (!moving) v *= 0.75;
      const cover = S.coverAt(game.world, pe.x, pe.y);
      S.cover = cover;
      if (crouch) v *= 1 - cover * 0.75; else v *= 1 - cover * 0.2;
      const dark = S.darkness(game, pe.x, pe.y);
      S.dark = dark;
      v *= 1 - dark * 0.55;
      if (pe.swimming) v *= 0.75;
      if (pe.attackT > 0 || (game.time - (S.loudAt || -99)) < 1.5) v *= 1.35;   // steel and shouting carry
      if (pe.burn > 0) v *= 1.5;
      S._visAt = game.time; S._vis = U.clamp(v, 0.08, 1.6);
      return S._vis;
    },
    // A watcher looks your way: does suspicion fill? Returns true once they
    // have properly seen you. `range` is how far they'd see you in the open.
    perceive(game, e, d, range) {
      const pe = game.pe;
      const now = game.time, dt = U.clamp(now - (e.susAt == null ? now : e.susAt), 0, 0.5);
      e.susAt = now;
      e.sus = e.sus || 0;
      const facing = e.dir == null ? 0 : angDiff(e.dir, Math.atan2(pe.y - e.y, pe.x - e.x));
      const quiet = ECHO.PlayerCtl.sneaking && !pe.mounted;
      if (d < 0.85 || (d < 1.1 && !(quiet && facing > 1.75))) { S.spotted(game, e); return true; }   // bumped into them
      const eff = range * S.vis(game);
      const los = d < 2 || ECHO.Ent.lineOfSight(game.world, e.x, e.y, pe.x, pe.y);
      if (!los || d > eff * 1.7) { e.sus = Math.max(0, e.sus - dt * 0.22); if (e.sus < 0.2) e.susShown = e.susLook = false; return false; }
      // in front of them sees more than behind; a crouched step behind them is barely heard
      const front = facing < 1.2 ? 1.4 : facing < 2.0 ? 0.6 : quiet ? 0.045 : 0.15;
      const rate = d < eff ? (0.25 + (1 - d / eff) * 3.5) * front : 0.15 * front;
      e.sus += rate * dt * (e.sleeping ? 0.15 : 1);
      if (e.sus > 0.3 && !e.susShown) { e.susShown = true; e.say = '?'; e.sayT = 1.2; }
      if (e.sus > 0.5) {
        if (!e.susLook) { e.susLook = true; if (ECHO.Sfx && d < 12) ECHO.Sfx.play('hiss', { pitch: 1.6, vol: 0.25 }); }
        // turn to look, and drift toward where something moved
        e.dir = Math.atan2(pe.y - e.y, pe.x - e.x); e.flip = Math.cos(e.dir) < 0;
        e.lookAt = { x: pe.x, y: pe.y, t: now };
      }
      if (e.sus >= 1) { S.spotted(game, e); return true; }
      return false;
    },
    spotted(game, e) {
      if (!e.seenYou) { e.seenYou = true; e.say = '!'; e.sayT = 1.2; }
      e.sus = 1;
    },
    // suspicion about you, fading when you are out of their minds for a while
    tick(game, dt) {
      for (const e of game.ents) {
        if (!e.sus || e.dead) continue;
        if (game.time - (e.susAt || 0) > 0.6) e.sus = Math.max(0, e.sus - dt * 0.2);
        if (e.sus <= 0) { e.seenYou = false; e.susShown = e.susLook = false; }
      }
    },
    // Someone who hasn't noticed you, with their back to you, within reach?
    exposed(game, e) {
      const pe = game.pe;
      if (e.dead || e.hidden || e.ghost || e.isCompanion || e.type === 'boss' || e.marvel || e.lurker || e === pe) return false;
      if (!game.hostileTo(pe, e) && !e.foe) return false;
      if (e.type === 'creature' && !e.humanoid && e.species !== 'wolf') return false;
      if (e.mounted) return false;
      const d = U.dist(e.x, e.y, pe.x, pe.y);
      if (d > 1.55) return false;
      if (e.sleeping) return true;
      if (e.foe ? e.aggro : (e.target === pe || e.aggro)) return false;
      if ((e.sus || 0) >= 0.6 || e.state === 'chase' || e.state === 'attack' || e.state === 'windup' || e.state === 'lunge') return false;
      const behind = e.dir == null ? Math.PI : angDiff(e.dir, Math.atan2(pe.y - e.y, pe.x - e.x));
      return behind > 1.75;
    },
    interactables(game) {
      const out = [], pe = game.pe;
      if (pe.mounted || pe.inBoat || pe.swimming || !ECHO.PlayerCtl.sneaking) return out;
      let best = null, bd = 9;
      for (const e of game.ents) { if (!S.exposed(game, e)) continue; const d = U.dist(e.x, e.y, pe.x, pe.y); if (d < bd) { bd = d; best = e; } }
      if (best) out.push({ kind: 'act', label: `Take ${best.foe ? 'it' : 'them'} down, silently`, d: 0.05, act: () => S.takedown(game, best) });
      return out;
    },
    takedown(game, e) {
      const pe = game.pe, pl = game.pl, C = ECHO.Combat;
      if (!S.exposed(game, e)) return ECHO.UI.toast('They\'ve seen you.', 'warn', 2);
      const ang = Math.atan2(e.y - pe.y, e.x - pe.x);
      pe.dir = ang; pe.flip = Math.cos(ang) < 0; pe.attackT = 0.3; pe.attackDur = 0.3; pe.attackAngle = ang; pe.attackKind = 'fore';
      const shadow = pl.skills.shadow || 0;
      const elite = e.foe && e.foe.elite;
      const lethal = e.sleeping || (!elite && e.hp <= e.maxHp * (0.75 + shadow / 300)) || (!elite && !e.boss2);
      if (lethal && !elite) {
        if (ECHO.Sfx) ECHO.Sfx.play('hit', { pitch: 0.7, vol: 0.5 });
        e.hp = 0; C.kill(e, pe, 'takedown', { angle: ang, knock: 0.02 });
        C.floater(e.x, e.y - 1.2, 'takedown', '#c8b0ff');
      } else {
        C.damage(e, e.maxHp * 0.45, { type: 'melee', from: pe, angle: ang, knock: 0.1 });
        e.stagger = 1.6;
        C.floater(e.x, e.y - 1.2, 'ambush!', '#c8b0ff');
      }
      game.hitStop(0.08);
      ECHO.Character.train(pl, 'shadow', 0.8); ECHO.Character.behave(pl, 'night', 0.03);
      pl.takedowns = (pl.takedowns || 0) + 1;
      // a soft sound: only those right beside you might wonder
      for (const o of game.ents) if (o !== e && !o.dead && (o.foe || game.hostileTo(o, pe)) && U.dist(o.x, o.y, e.x, e.y) < 3.2) { o.sus = Math.max(o.sus || 0, 0.55); o.susAt = game.time; o.dir = Math.atan2(e.y - o.y, e.x - o.x); o.say = '?'; o.sayT = 1.2; o.susShown = true; }
    },
    // Called when you make a racket (fights, spells) so people turn toward it.
    loud(game, x, y, r) {
      S.loudAt = game.time;
      for (const o of game.ents) {
        if (o.dead || o === game.pe || !(o.foe || game.hostileTo(o, game.pe))) continue;
        const d = U.dist(o.x, o.y, x, y);
        if (d < r) { o.sus = Math.max(o.sus || 0, 0.5 + (1 - d / r) * 0.4); o.susAt = game.time; o.dir = Math.atan2(y - o.y, x - o.x); if (!o.susShown) { o.susShown = true; o.say = '?'; o.sayT = 1.2; } }
      }
    },
    // Unseen by anyone who matters?
    hidden(game) {
      if (!ECHO.PlayerCtl.sneaking) return false;
      for (const e of game.ents) if (!e.dead && (e.sus || 0) >= 0.6 && U.dist(e.x, e.y, game.pe.x, game.pe.y) < 14) return false;
      return S.vis(game) < 0.45;
    },
    // The eye on the HUD while crouched: how visible you are, and whether
    // anyone is getting suspicious.
    hud(game) {
      const el = document.getElementById('hud-stealth'); if (!el) return;
      const on = ECHO.PlayerCtl.sneaking && !game.pe.mounted;
      if (!on) { if (el.innerHTML) el.innerHTML = ''; el.className = ''; return; }
      const v = S.vis(game);
      let worst = 0;
      for (const e of game.ents) if (!e.dead && e.sus && U.dist(e.x, e.y, game.pe.x, game.pe.y) < 20) worst = Math.max(worst, e.sus);
      const word = worst >= 1 ? 'SEEN' : worst > 0.3 ? 'noticed…' : v < 0.3 ? 'hidden' : v < 0.55 ? 'in shadow' : 'exposed';
      const cls = worst >= 1 ? 'seen' : worst > 0.3 ? 'sus' : v < 0.3 ? 'hid' : v < 0.55 ? 'dim' : 'open';
      const why = [S.cover > 0.4 ? 'cover' : null, S.dark > 0.4 ? 'dark' : null].filter(Boolean).join(' · ');
      const html = `<span class="eye">◉</span><span class="sw">${word}</span><span class="hb"><i style="width:${Math.round(Math.min(1, v) * 100)}%"></i></span>${worst > 0.05 && worst < 1 ? `<span class="hb sus"><i style="width:${Math.round(worst * 100)}%"></i></span>` : ''}${why ? `<span class="dim">${why}</span>` : ''}`;
      if (el._h !== html) { el.innerHTML = html; el._h = html; }
      el.className = cls;
    },
    update(game, dt) {
      S.tick(game, dt);
      S.hud(game);
    }
  };

  // ------------------------------------------------------------ lockpicking
  // A row of pins; a pick sweeps back and forth across each one, and you set
  // it (E, Space or click) while the pick is over the sweet spot. Miss and the
  // pick may snap; the deeper the lock, the faster the sweep and the smaller
  // the spot.
  const LP = ECHO.Lockpick = {
    st: null,
    open(o) {
      const game = ECHO.Game, pl = game.pl;
      if (!(pl.inv.lockpick > 0)) return ECHO.UI.toast('Locked. You have no lockpicks — markets sell them.', 'warn', 3);
      const shadow = pl.skills.shadow || 0;
      const pins = o.pins || 3;
      const st = LP.st = { pins, at: 0, x: 0, dir: 1, speed: (o.speed || 1) * (0.9 + pins * 0.12), spots: [], width: U.clamp(0.2 - pins * 0.02 + shadow / 900, 0.08, 0.3), done: o.onDone, title: o.title || 'A lock', broke: 0 };
      for (let i = 0; i < pins; i++) st.spots.push(0.15 + Math.random() * (0.7 - st.width));
      ECHO.UI.modalOpen = true; ECHO.Input.clear();
      let el = document.getElementById('lockpick');
      if (!el) { el = document.createElement('div'); el.id = 'lockpick'; document.body.appendChild(el); }
      el.className = '';
      el.innerHTML = `<div class="lp-inner"><h3>${o.title || 'Pick the lock'}</h3><div class="lp-pins"></div><div class="lp-help">Set each pin when the pick is in the bright notch — <b>E</b>, <b>Space</b> or click. <b>Esc</b> to give up.</div><div class="lp-picks"></div></div>`;
      el.onclick = () => LP.press();
      LP.key = ev => { if (!LP.st) return; if (ev.key === 'e' || ev.key === 'E' || ev.key === ' ') { ev.preventDefault(); LP.press(); } if (ev.key === 'Escape') { ev.preventDefault(); LP.close(false, true); } };
      window.addEventListener('keydown', LP.key, true);
      LP.last = performance.now();
      LP.draw();
      const loop = () => { if (!LP.st) return; const now = performance.now(); LP.step(Math.min(0.05, (now - LP.last) / 1000)); LP.last = now; LP.draw(); LP.raf = requestAnimationFrame(loop); };
      LP.raf = requestAnimationFrame(loop);
    },
    step(dt) {
      const st = LP.st; if (!st) return;
      st.x += st.dir * st.speed * dt;
      if (st.x > 1) { st.x = 1; st.dir = -1; } if (st.x < 0) { st.x = 0; st.dir = 1; }
    },
    press() {
      const st = LP.st, game = ECHO.Game, pl = game.pl; if (!st) return;
      const s0 = st.spots[st.at];
      if (st.x >= s0 && st.x <= s0 + st.width) {
        st.at++; if (ECHO.Sfx) ECHO.Sfx.play('hit', { pitch: 2.2, vol: 0.25 });
        if (st.at >= st.pins) return LP.close(true);
      } else {
        if (ECHO.Sfx) ECHO.Sfx.play('hit', { pitch: 0.6, vol: 0.3 });
        if (st.at > 0 && Math.random() < 0.5) st.at--;               // a pin drops back
        if (Math.random() < 0.45 - (pl.skills.shadow || 0) / 300) {   // the pick snaps
          pl.inv.lockpick--; st.broke++;
          if (ECHO.Stealth) ECHO.Stealth.loud(game, game.pe.x, game.pe.y, 3.5);
          if (pl.inv.lockpick <= 0) { ECHO.UI.toast('Your last pick snaps in the lock.', 'warn', 3); return LP.close(false); }
        }
      }
      LP.draw();
    },
    close(ok, quit) {
      const st = LP.st; LP.st = null;
      cancelAnimationFrame(LP.raf);
      window.removeEventListener('keydown', LP.key, true);
      const el = document.getElementById('lockpick'); if (el) el.className = 'hidden';
      ECHO.UI.modalOpen = false; ECHO.Input.clear();
      const pl = ECHO.Game.pl;
      if (ok) { ECHO.Character.train(pl, 'shadow', 0.6); pl.locksPicked = (pl.locksPicked || 0) + 1; if (ECHO.Sfx) ECHO.Sfx.play('door', { pitch: 1.4 }); }
      else if (st && st.broke && !quit) ECHO.UI.toast(`${st.broke} pick${st.broke > 1 ? 's' : ''} broken.`, 'info', 2);
      if (st && st.done) st.done(!!ok);
    },
    draw() {
      const st = LP.st, el = document.getElementById('lockpick'); if (!st || !el) return;
      const pins = el.querySelector('.lp-pins');
      pins.innerHTML = st.spots.map((s, i) => `<div class="lp-pin ${i < st.at ? 'set' : i === st.at ? 'cur' : ''}"><div class="lp-spot" style="left:${s * 100}%;width:${st.width * 100}%"></div>${i === st.at ? `<div class="lp-pick" style="left:${st.x * 100}%"></div>` : ''}</div>`).join('');
      el.querySelector('.lp-picks').textContent = `Lockpicks: ${ECHO.Game.pl.inv.lockpick || 0}`;
    }
  };
})();
