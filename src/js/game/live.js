// Live events: the world breaks in on you. Every few minutes out of doors, when things have
// been quiet, one of these happens near you, with a banner, a mark to follow and a clock:
//
//   • A RIFT tears open. Three waves pour out of it — the dead, a goblin warband, stone things
//     or a cult, each rift all warded the same colour — and it must be emptied before it
//     closes. Close it and it bursts, leaving gear, crowns and an augment to choose.
//   • A DROP POD comes down out of the sky some way off. Scavengers are already on it. Reach it
//     and clear them before the clock runs out, and what is in it is yours: ammunition,
//     crowns, a piece of gear.
//   • A TEMPEST breaks over a fight. Everything is soaked (so every bolt conducts), and
//     lightning falls where the marks appear: on them, if you draw them under it.
//
// Nothing of an event is saved: it is of the moment, and gone if you leave it.
(function () {
  const { U } = ECHO;
  const C = () => ECHO.Combat;
  const THEMES = [
    { k: 'bone', name: 'of the restless dead', col: '#bfe8d8', ward: 'veil', kinds: ['skeleton', 'skelarcher', 'ghoul'], big: 'wraith' },
    { k: 'gob', name: 'of the goblin warbands', col: '#ffb46a', ward: 'stone', kinds: ['goblin', 'goblin', 'shaman'], big: 'troll' },
    { k: 'stone', name: 'of the stone things', col: '#c8c0b0', ward: 'stone', kinds: ['golemling', 'golemling', 'goblin'], big: 'troll' },
    { k: 'void', name: 'of the hollow cult', col: '#c08aff', ward: 'frost', kinds: ['cultist', 'cultist', 'ghoul'], big: 'wraith' }
  ];
  const DIRS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
  const ARROWS = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];

  const L = ECHO.Live = {
    THEMES,
    cur: null, wait: 150, _k: '', _hudT: 0, n: 0,
    reset() { L.cur = null; L.wait = 150; L._k = ''; L.n = 0; },
    lv(game) { return U.clamp(ECHO.Prowess ? ECHO.Prowess.level(game.pl) : 1, 1, 1500); },
    dir(game, x, y) { const a = Math.atan2(y - game.pe.y, x - game.pe.x), i = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8; return { word: DIRS[i], arrow: ARROWS[i], d: Math.round(U.dist(x, y, game.pe.x, game.pe.y)) }; },
    ok(game) {
      const pl = game.pl, pe = game.pe;
      if (!pl || !pe || pe.dead || game.defeating || pl.capture || pl.flying || pe.swimming || pe.inBoat) return false;
      if (ECHO.Interior && ECHO.Interior.cur) return false;
      if (ECHO.GateWorld && ECHO.GateWorld.cur) return false;
      if (ECHO.Deep && ECHO.Deep.cur) return false;
      return true;
    },
    spot(game, minD, maxD) {
      const world = game.world, pe = game.pe;
      for (let t = 0; t < 24; t++) {
        const a = Math.random() * Math.PI * 2, d = minD + Math.random() * (maxD - minD);
        const x = pe.x + Math.cos(a) * d, y = pe.y + Math.sin(a) * d;
        if (ECHO.World.isSolid(world, x, y) || ECHO.World.isSolid(world, x + 0.8, y) || ECHO.World.isSolid(world, x - 0.8, y) || ECHO.World.isSolid(world, x, y + 0.8) || ECHO.World.isSolid(world, x, y - 0.8)) continue;
        if (ECHO.Water && ECHO.Water.kind && ECHO.Water.kind(world, x, y)) continue;
        if (ECHO.World.settlementAt(world, x, y, 7)) continue;
        return { x, y };
      }
      return null;
    },
    foes(game) { return game.ents.filter(e => !e.dead && e.live === L.cur && !e.pal && !e.tamed && !(e.subdued > 0)); },
    foe(game, kind, x, y, ward, elite) {
      const lv = L.lv(game);
      const e = ECHO.Monsters.make(game, kind, x, y, lv, { noElite: !elite, eliteChance: elite ? 1 : 0 });
      e.live = L.cur; e.aggro = true; e.target = game.pe; e.home = { x, y }; e.rxScan = true;
      if (ward && lv >= 3 && ECHO.React) e.rxWard = { k: ward, hp: e.maxHp * 0.6, max: e.maxHp * 0.6 };
      game.addEnt(e);
      C().burst(e.x, e.y - 0.3, L.cur.col || '#c08aff', 10, 3, 0.4, 2);
      return e;
    },
    banner(game, title, sub) { if (game.ui && game.ui.banner) game.ui.banner(title, sub); },
    // ------------------------------------------------------------ starting one
    start(game, kind) {
      if (L.cur) return false;
      const pe = game.pe;
      if (kind === 'rift') {
        const s = L.spot(game, 10, 15);
        if (!s) return false;
        const th = THEMES[Math.floor(Math.random() * THEMES.length)];
        L.cur = { kind, x: s.x, y: s.y, t: 0, left: 120, wave: 0, waveT: 3, theme: th, col: th.col };
        const d = L.dir(game, s.x, s.y);
        L.banner(game, 'A rift opens', `A rift ${th.name}, to the ${d.word}. Empty it before it closes.`);
        if (ECHO.Sfx) ECHO.Sfx.play('shipIn', { pitch: 1.6 });
        game.shake(0.25);
      } else if (kind === 'pod') {
        const s = L.spot(game, 17, 25);
        if (!s) return false;
        L.cur = { kind, x: s.x, y: s.y, t: 0, left: 100, fallT: 2.4, col: '#7ff4ff', landed: false };
        const d = L.dir(game, s.x, s.y);
        L.banner(game, 'A drop pod is coming down', `To the ${d.word}. Scavengers will strip it: get there first.`);
        if (ECHO.Sfx) ECHO.Sfx.play('missile', { pitch: 0.5, vol: 0.8 });
      } else if (kind === 'tempest') {
        L.cur = { kind, x: pe.x, y: pe.y, t: 0, left: 40, strikeT: 1.5, marks: [], col: '#ffe66a' };
        L.banner(game, 'A tempest breaks', 'Everything is soaked: every bolt conducts. Lightning falls on the marks.');
        if (ECHO.Sfx) ECHO.Sfx.play('boom', { pitch: 0.6, vol: 0.7 });
      } else return false;
      L.n++;
      return true;
    },
    end(game, won, text) {
      const c = L.cur;
      if (!c) return;
      for (const e of game.ents) if (e.live === c && !e.dead && !e.pal && !e.tamed && !won) { C().burst(e.x, e.y - 0.3, c.col, 10, 3, 0.4, 2); e.vanish = true; }
      if (text) game.ui.toast(text, won ? 'legend' : 'warn', 7);
      L.cur = null; L._k = '';
      L.hud(game);
      L.wait = 200 + Math.random() * 160;
    },
    // ------------------------------------------------------------ each frame
    tick(game, dt) {
      if (!game.pe || !game.pl) return;
      const c = L.cur;
      if (!c) {
        if (!L.ok(game)) return;
        L.wait -= dt;
        if (L.wait > 0) return;
        L.wait = 20;
        if (ECHO.Director && !ECHO.Director.allow(game, 'twist')) return;
        const pe = game.pe;
        const fight = game.ents.filter(e => !e.dead && !e.hidden && e !== pe && (e.type === 'creature' || e.type === 'monster') && (e.aggro || e.target === pe) && !e.pal && !e.tamed && U.dist(e.x, e.y, pe.x, pe.y) < 10).length;
        const r = Math.random();
        L.start(game, fight >= 2 ? 'tempest' : r < 0.55 ? 'rift' : 'pod');
        return;
      }
      c.t += dt; c.left -= dt;
      if (!L.ok(game)) { L.end(game, false, c.kind === 'tempest' ? null : c.kind === 'rift' ? 'The rift closes behind you.' : 'The drop pod is lost to you.'); return; }
      if (c.kind === 'rift') L.rift(game, c, dt);
      else if (c.kind === 'pod') L.pod(game, c, dt);
      else L.tempest(game, c, dt);
      L._hudT -= dt;
      if (L._hudT <= 0) { L._hudT = 0.2; L.hud(game); }
    },
    rift(game, c, dt) {
      const pe = game.pe;
      // its light, and what drifts round it
      c.beamT = (c.beamT || 0) - dt;
      if (c.beamT <= 0) { c.beamT = 1.1; C().fx.push({ kind: 'pillar', x: c.x, y: c.y, t: 0, life: 1.5, color: c.col, height: 9, radius: 0.7 }); }
      if (Math.random() < dt * 14) { const a = Math.random() * 6.28, r = 0.6 + Math.random() * 1.6; C().fx.push({ kind: 'p', x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r * 0.6, vx: -Math.cos(a) * 1.5, vy: -Math.sin(a) * 1.5, t: 0, life: 0.5, color: c.col, size: 1.8, spark: true }); }
      const alive = L.foes(game);
      c.waveT -= dt;
      if (c.wave < 3 && c.waveT <= 0) {
        c.wave++;
        const n = c.wave === 1 ? 3 : 4, th = c.theme;
        for (let i = 0; i < n; i++) { const a = Math.random() * 6.28; L.foe(game, th.kinds[i % th.kinds.length], c.x + Math.cos(a) * (0.8 + Math.random()), c.y + Math.sin(a) * (0.8 + Math.random()), th.ward); }
        if (c.wave === 3) L.foe(game, th.big, c.x, c.y + 0.5, th.ward, true);
        c.waveT = 30;
        if (ECHO.Sfx) ECHO.Sfx.play('blast', { pitch: 0.6, vol: 0.6 });
        game.ui.toast(c.wave === 3 ? 'The last of them come through, and something greater with them.' : c.wave === 2 ? 'More come through the rift.' : 'They come through the rift.', 'warn', 3);
      } else if (c.wave > 0 && c.wave < 3 && !alive.length && c.waveT > 1.5) c.waveT = 1.5;   // (emptied early: the next wave comes at once)
      if (c.wave === 3 && !alive.length) { L.closeRift(game, c); return; }
      if (c.left <= 0) { L.end(game, false, 'The rift closes, and what came through it goes back.'); return; }
      if (U.dist(pe.x, pe.y, c.x, c.y) > 48) L.end(game, false, 'You have left the rift behind. It closes.');
    },
    closeRift(game, c) {
      const pl = game.pl, lv = L.lv(game);
      C().puff(c.x, c.y, { h: 0.8, vz: 0.4, g: 0, life: 0.4, size: 40, color: '#ffffff', glow: true, flash: true, grow: 2 });
      C().burst(c.x, c.y - 0.3, c.col, 40, 9, 0.9, 3);
      C().ring(c.x, c.y, 4, c.col, 0.6);
      C().fx.push({ kind: 'pillar', x: c.x, y: c.y, t: 0, life: 2.4, color: '#ffffff', height: 14, radius: 1.2 });
      if (ECHO.Sfx) ECHO.Sfx.play('boom', { pitch: 0.8 });
      game.shake(0.4); game.slowMo(0.5, 0.35);
      const gold = 40 + lv * 3;
      pl.gold = (pl.gold || 0) + gold;
      if (ECHO.Monsters) { ECHO.Monsters.dropGear(game, c.x, c.y, lv, 14, 'out of a rift'); }
      if (ECHO.Build) { const T = ECHO.Build.state(pl); T.pick++; ECHO.Build.bump(game, 'rift', 1); }
      pl.riftsClosed = (pl.riftsClosed || 0) + 1;
      L.banner(game, 'The rift is closed', `+${gold} crowns, gear, and an augment to choose.`);
      L.end(game, true, null);
    },
    pod(game, c, dt) {
      const pe = game.pe;
      if (!c.landed) {
        c.fallT -= dt;
        // coming down: a streak of fire
        const k = Math.max(0, c.fallT / 2.4);
        for (let i = 0; i < 2; i++) C().puff(c.x + k * 9, c.y - k * 3, { h: 0.5 + k * 16, vz: 0, g: 0, life: 0.5, size: 7, color: i ? '#ffd48a' : '#c8cacf', glow: !!i, smoke: !i });
        if (c.fallT > 0) return;
        c.landed = true;
        C().puff(c.x, c.y, { h: 0.5, vz: 0.4, g: 0, life: 0.3, size: 30, color: '#fff0c8', glow: true, flash: true, grow: 1.8 });
        C().burst(c.x, c.y - 0.2, '#ffd48a', 26, 8, 0.6, 3);
        C().ring(c.x, c.y, 3, 'rgba(255,220,160,0.9)', 0.4);
        if (C().decal) C().decal(c.x, c.y, 'scorch', 2, 60);
        if (ECHO.Sfx) ECHO.Sfx.play('boom', { vol: U.dist(pe.x, pe.y, c.x, c.y) < 20 ? 0.9 : 0.5 });
        if (U.dist(pe.x, pe.y, c.x, c.y) < 26) game.shake(0.3);
        if (ECHO.Loose) ECHO.Loose.blast(c.x, c.y, 3, { fire: false, power: 1.5, by: null });
        const n = 3, ward = ['frost', 'veil', 'stone'][Math.floor(Math.random() * 3)];
        for (let i = 0; i < n; i++) { const a = i / n * 6.28 + Math.random(); L.foe(game, i === 2 ? 'shaman' : 'goblin', c.x + Math.cos(a) * 2.2, c.y + Math.sin(a) * 2.2, i === 0 ? ward : null); }
        return;
      }
      c.beamT = (c.beamT || 0) - dt;
      if (c.beamT <= 0) { c.beamT = 1.1; C().fx.push({ kind: 'pillar', x: c.x, y: c.y, t: 0, life: 1.5, color: c.col, height: 12, radius: 0.5 }); }
      const d = U.dist(pe.x, pe.y, c.x, c.y), guards = L.foes(game).filter(e => U.dist(e.x, e.y, c.x, c.y) < 9).length;
      c.near = d < 1.7;
      if (c.near && !guards) { L.openPod(game, c); return; }
      if (c.near && guards && game.time - (c.saidT || -9) > 3) { c.saidT = game.time; C().floater(c.x, c.y - 1.4, 'clear the scavengers first', '#ffd9a0'); }
      if (c.left <= 0) L.end(game, false, 'The scavengers have stripped the drop pod.');
    },
    openPod(game, c) {
      const pl = game.pl, lv = L.lv(game);
      const gold = 30 + lv * 2;
      pl.gold = (pl.gold || 0) + gold;
      pl.inv.cells = (pl.inv.cells || 0) + 40; pl.inv.missiles = (pl.inv.missiles || 0) + 3; pl.inv.arrows = (pl.inv.arrows || 0) + 20;
      if (ECHO.Monsters) ECHO.Monsters.dropGear(game, c.x + 0.8, c.y + 0.6, lv, 10, 'out of a drop pod');
      C().burst(c.x, c.y - 0.3, c.col, 26, 6, 0.7, 3);
      C().ring(c.x, c.y, 2.5, c.col, 0.5);
      if (ECHO.Sfx) ECHO.Sfx.play('coin');
      if (ECHO.Build) ECHO.Build.bump(game, 'pod', 1);
      L.banner(game, 'The pod is yours', `+${gold} crowns, 40 cells, 3 missiles, 20 arrows, and a piece of gear.`);
      L.end(game, true, null);
    },
    tempest(game, c, dt) {
      const pe = game.pe, RX = ECHO.React;
      c.x = pe.x; c.y = pe.y;
      c.soakT = (c.soakT || 0) - dt;
      const near = game.ents.filter(e => !e.dead && !e.hidden && e !== pe && (e.type === 'creature' || e.type === 'monster') && !e.pal && !e.tamed && !e.isCompanion && U.dist(e.x, e.y, pe.x, pe.y) < 14);
      if (c.soakT <= 0) { c.soakT = 0.5; if (RX) for (const e of near) RX.soak(game, e, 3); }
      // rain, hard
      for (let i = 0; i < 3; i++) if (Math.random() < dt * 30) C().fx.push({ kind: 'p', x: pe.x + (Math.random() - 0.5) * 16, y: pe.y + (Math.random() - 0.5) * 11, vx: 0.5, vy: 9, t: 0, life: 0.25, color: '#9fc8ff', size: 1.2 });
      c.strikeT -= dt;
      if (c.strikeT <= 0 && c.left > 1.2) {
        c.strikeT = 1.1 + Math.random() * 0.9;
        const hostile = near.filter(e => e.aggro || e.target === pe || e.foe);
        const t = hostile.length && Math.random() < 0.65 ? hostile[Math.floor(Math.random() * hostile.length)] : null;
        const a = Math.random() * 6.28, r = 1.5 + Math.random() * 4;
        const x = t ? t.x + (t.vx || 0) * 0.4 : pe.x + Math.cos(a) * r, y = t ? t.y + (t.vy || 0) * 0.4 : pe.y + Math.sin(a) * r;
        C().telegraph({ x, y, cx: x, cy: y, radius: 1.5, life: 1, shape: 'circle', color: 'rgba(255,230,110,0.4)' });
        c.marks.push({ x, y, t: 1 });
      }
      for (let i = c.marks.length - 1; i >= 0; i--) {
        const m = c.marks[i];
        m.t -= dt;
        if (m.t > 0) continue;
        c.marks.splice(i, 1);
        C().fx.push({ kind: 'arc', x: m.x + 1.5, y: m.y - 9, x2: m.x, y2: m.y, h: 0.2, t: 0, life: 0.3, color: '#ffffff' });
        C().fx.push({ kind: 'arc', x: m.x - 1, y: m.y - 9, x2: m.x, y2: m.y, h: 0.2, t: 0, life: 0.22, color: '#ffe66a' });
        C().puff(m.x, m.y, { h: 0.4, vz: 0, g: 0, life: 0.18, size: 22, color: '#fffbe0', glow: true, flash: true, grow: 1.6 });
        C().burst(m.x, m.y - 0.2, '#ffe66a', 14, 6, 0.4, 2);
        if (C().decal) C().decal(m.x, m.y, 'scorch', 0.9, 14);
        if (ECHO.Sfx) ECHO.Sfx.play('boom', { pitch: 1.8, vol: 0.6 });
        game.light(m.x, m.y, 8, 1, '#fff6c0', 0.12);
        if (U.dist(m.x, m.y, pe.x, pe.y) < 8) game.shake(0.15);
        for (const e of game.ents) {
          if (e.dead || e.hidden || U.dist(e.x, e.y, m.x, m.y) > 1.5 + (e.r || 0.4)) continue;
          if (e === pe) C().damage(pe, game.pl.maxHp * 0.07, { type: 'magic', from: null, pure: true });
          else if ((e.type === 'creature' || e.type === 'monster') && !e.pal && !e.tamed && !e.isCompanion) {
            // (the sky's bolt counts as yours: it conducts through the soaked, and fills your Surge)
            C().damage(e, Math.max(10, e.maxHp * (e.boss2 || e.titan || e.type === 'boss' ? 0.04 : 0.18)), { type: 'magic', from: pe, el: 'shock', angle: Math.atan2(e.y - m.y, e.x - m.x), knock: 0.3 });
          }
        }
      }
      if (c.left <= 0) L.end(game, true, 'The tempest passes.');
    },
    // ------------------------------------------------------------ the mark at the top of the screen
    hud(game) {
      if (typeof document === 'undefined') return;
      let el = document.getElementById('hud-live');
      if (!el) {
        const host = document.getElementById('hud');
        if (!host) return;
        el = document.createElement('div'); el.id = 'hud-live';
        el.style.cssText = 'position:absolute;top:58px;left:50%;transform:translateX(-50%);padding:6px 16px;font-size:13px;font-weight:600;letter-spacing:.08em;color:#eafcff;background:rgba(8,20,30,.72);border:1px solid rgba(127,233,255,.45);border-radius:3px;box-shadow:0 0 14px rgba(79,240,255,.25);pointer-events:none;white-space:nowrap;display:none';
        host.appendChild(el);
      }
      const c = L.cur;
      if (!c) { L._k = ''; el.style.display = 'none'; return; }
      const d = L.dir(game, c.x, c.y), s = Math.max(0, Math.ceil(c.left)), tm = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      const where = d.d > 6 ? ` · ${d.arrow} ${d.d} paces ${d.word}` : '';
      const text = c.kind === 'rift' ? `RIFT · wave ${Math.max(1, c.wave)}/3 · ${L.foes(game).length} left${where} · ${tm}`
        : c.kind === 'pod' ? `DROP POD${c.landed ? '' : ' · falling'}${where || ' · here'} · ${tm}`
          : `TEMPEST · ${tm}`;
      if (text === L._k) return;
      L._k = text;
      el.style.display = 'block'; el.style.borderColor = c.col; el.textContent = text;
    }
  };
})();
