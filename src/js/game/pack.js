// The pack mind: how the beasts you have tamed fight together, for you.
//
// Every third of a second the pack looks at the fight and makes a plan:
//  · one FOCUS — what you are fighting: the one you are locked on to (R), else
//    what you last struck, else what is coming at you hardest. The pack falls on
//    it from all sides (spread round it, the far side first: a blow from behind
//    lands harder), and on anything staggered they all strike harder still;
//  · GUARDS — anything else at your throat is met by the nearest free beast;
//  · INTERRUPTS — a blow wound up against you is broken by the nearest beast
//    that can reach it;
//  · COVER — when you are badly hurt the toughest beast stands at your side and
//    takes part of every blow meant for you;
//  · RETREAT — a beast near the end of its strength falls back behind you to
//    lick its wounds while the others hold the line.
//
// And each uses everything it has: what it was born with (venom, webs, charges,
// slams, bolts, breath, blinks, healing, the howl of a pack, the drain of the
// dead) and what any beast has: a power strike, and a roar that throws back
// everything round it.
(function () {
  const { U } = ECHO;
  const C = () => ECHO.Combat;
  const BASE = 1.35;   // what one of yours does is worth more than what it did wild: it fights for you

  const P = ECHO.Pack = {
    plan: null, t: 0, buffT: 0, howlCd: 0, ringT: 0,
    reset() { P.plan = null; P.t = 0; P.buffT = 0; P.howlCd = 0; },
    pals(game) { return game.ents.filter(e => e.pal && !e.dead && !e.vanish); },
    hostile(game, o) {
      const pe = game.pe;
      return o && !o.dead && !o.hidden && !o.vanish && o !== pe && !o.tamed && !o.pal && !o.isCompanion && !(o.subdued > 0) && !(ECHO.Tame.chan && ECHO.Tame.chan.e === o) && game.hostileTo(pe, o);
    },
    busy(o) { return o.state === 'windup' || o.state === 'cast' || o.state === 'charge' || o.state === 'lunge' || !!o.wcast || !!o.gcast; },

    // what a beast was born able to do
    kit(e) {
      if (e._kit) return e._kit;
      const ab = (e.foe && e.foe.ab) || {}, wab = (e.foe && e.foe.wab) || {}, sp = e.species, bk = e.boss && e.boss.kind;
      const k = {
        ranged: !!(ab.ranged || ab.bolt), bolt: ab.bolt || null,
        venom: !!(ab.poison || sp === 'spider' || bk === 'wyrm' || /venom/i.test(e.pal ? e.pal.was || '' : '')),
        web: !!ab.web, slam: !!(ab.slam || bk === 'stag' || bk === 'wyrm' || wab.rootquake || e.type === 'boss' || (e.scale || 1) >= 1.6),
        charge: !!(ab.charge || sp === 'wolf' || e.shape === 'hound' || bk === 'stag' || bk === 'drake' || wab.hunt),
        breath: bk === 'drake' || e.shape === 'drake' || (ab.bolt && ab.bolt.type === 'fire' && (e.scale || 1) > 1.2),
        blink: !!(ab.teleport || sp === 'wraith' || wab.drop), drain: !!(ab.drain || ab.drain === 0), heal: !!ab.heal,
        howl: !!(ab.pack || sp === 'wolf' || e.shape === 'hound'), regen: !!ab.regen, frenzy: !!ab.frenzy,
        big: e.type === 'boss' || !!e.pal && (e.pal.lord || e.pal.cat === 'boss') || (e.scale || 1) >= 1.5
      };
      e._kit = k;
      return k;
    },

    // ------------------------------------------------------------ the plan
    tick(game, dt) {
      P.buffT -= dt; P.howlCd -= dt;
      if ((P.t -= dt) > 0) return;
      P.t = 0.3;
      const pals = P.pals(game), pe = game.pe, pl = game.pl;
      if (!pals.length || pe.dead) { P.plan = null; return; }
      const lock = ECHO.PlayerCtl && ECHO.PlayerCtl.lock;
      const struck = game.lastStruck && game.time - (game.lastStruckT || -99) < 5 ? game.lastStruck : null;
      const foes = [];
      for (const o of game.ents) {
        if (!P.hostile(game, o)) continue;
        const dp = U.dist(o.x, o.y, pe.x, pe.y);
        if (dp > 16) continue;
        const onUs = o.target === pe || (o.target && o.target.pal);
        if (!(o.aggro || onUs || o === lock || o === struck || o.state === 'fight' || dp < 6)) continue;
        foes.push({ o, dp, onUs });
      }
      if (!foes.length) { P.plan = null; return; }
      // the focus: yours first
      let focus = lock && foes.find(f => f.o === lock) ? lock : struck && foes.find(f => f.o === struck) ? struck : null;
      if (!focus) {
        let bs = Infinity;
        for (const f of foes) { const s = f.dp - (f.o.target === pe ? 4 : 0) - (P.busy(f.o) && f.o.target === pe ? 3 : 0); if (s < bs) { bs = s; focus = f.o; } }
      }
      const role = new Map(), free = new Set(pals);
      // cover: when you are badly hurt, the toughest stands by you
      let cover = null;
      if (pl.hp < pl.maxHp * 0.45 && pals.length >= 2) {
        cover = pals.filter(p => !P.kit(p).ranged).sort((a, b) => b.hp - a.hp)[0] || null;
        if (cover) { role.set(cover, { kind: 'cover' }); free.delete(cover); }
      }
      // the spent fall back
      if (pals.length >= 2) for (const p of [...free]) if (p.hp < p.maxHp * 0.25 && !p._retreatDone) { role.set(p, { kind: 'retreat' }); free.delete(p); }
      // guards: what else is at your throat
      const threats = foes.filter(f => f.o !== focus && f.dp < 4.5 && (f.o.target === pe || P.busy(f.o))).sort((a, b) => a.dp - b.dp);
      for (const t of threats) {
        if (free.size <= 1 && !(pl.hp < pl.maxHp * 0.4)) break;
        let best = null, bd = Infinity;
        for (const p of free) { if (P.kit(p).ranged) continue; const d = U.dist(p.x, p.y, t.o.x, t.o.y); if (d < bd) { bd = d; best = p; } }
        if (!best) break;
        role.set(best, { kind: 'guard', target: t.o }); free.delete(best);
      }
      // the rest on the focus, spread round it — the far side first
      const melee = [...free].filter(p => !P.kit(p).ranged), base = Math.atan2(focus.y - pe.y, focus.x - pe.x);
      melee.sort((a, b) => U.angleDiff(Math.atan2(a.y - focus.y, a.x - focus.x), base) - U.angleDiff(Math.atan2(b.y - focus.y, b.x - focus.x), base));
      const n = melee.length, step = Math.min(1.25, 4.6 / Math.max(1, n));
      melee.forEach((p, i) => role.set(p, { kind: 'focus', target: focus, ang: base + (i - (n - 1) / 2) * step }));
      for (const p of free) if (P.kit(p).ranged) role.set(p, { kind: 'ranged', target: focus });
      // with nobody on it, anything left goes after the nearest foe
      for (const p of pals) if (!role.has(p)) role.set(p, { kind: 'focus', target: focus, ang: base });
      P.plan = { focus, foes, role, cover, t: game.time };
      // what the pack is on, marked
      if ((P.ringT -= 0.3) <= 0) { P.ringT = 1.2; C().ring(focus.x, focus.y, (focus.r || 0.4) + 0.55, 'rgba(255,160,90,0.55)', 0.45); }
    },

    // ------------------------------------------------------------ blows
    mul(game, e, o) {
      let m = BASE * (P.buffT > 0 ? 1.3 : 1);
      if (o.stagger > 0 || o.state === 'stagger') m *= 1.3;                                       // all in on what reels
      const a = Math.atan2(e.y - o.y, e.x - o.x);
      if (o.dir != null && Math.abs(U.angleDiff(a, o.dir)) > 1.9) m *= 1.25;                       // from behind
      if (P.kit(e).frenzy && e.hp < e.maxHp * 0.5) m *= 1.3;
      return m;
    },
    hit(game, e, o, mul, opt = {}) {
      if (!o || o.dead) return 0;
      const ang = Math.atan2(o.y - e.y, o.x - e.x), K = P.kit(e);
      const d = C().damage(o, e.palDmg * mul * P.mul(game, e, o) * (0.9 + Math.random() * 0.2), { type: opt.type || 'melee', from: e, angle: ang, knock: opt.knock || 0.25, stagger: opt.stagger || 0, heavy: !!opt.heavy });
      if (d > 0 && !o.dead) {
        if (K.venom) { o.venomT = Math.max(o.venomT || 0, 4); o.venomDps = Math.max(o.venomDps || 0, e.palDmg * 0.12); }
        if (opt.stagger && o.type !== 'boss') { o.stagger = Math.max(o.stagger || 0, opt.stagger); if (P.busy(o)) { o.state = 'stagger'; o.wcast = null; o.gcast = null; } }
      }
      if (d > 0 && K.drain) e.hp = Math.min(e.maxHp, e.hp + d * 0.25);
      return d;
    },
    say(e, s, col = '#ffe08a') { C().floater(e.x, e.y - 1.5 * (e.scale || 1), s, col); },

    // ------------------------------------------------------------ one beast, each frame
    fight(game, e, dt) {
      const plan = P.plan, R = plan && plan.role.get(e);
      if (!R) return false;
      const world = game.world, pe = game.pe, pl = game.pl, K = P.kit(e);
      const spd = (e.speed || 3) * 1.1;
      e.aggro = true;
      e._ab = e._ab || {};
      for (const k in e._ab) e._ab[k] -= dt;
      const ready = k => !(e._ab[k] > 0), use = (k, cd) => { e._ab[k] = cd * (0.85 + Math.random() * 0.3); };
      if (K.regen && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.01 * dt);
      // a dash under way
      if (e._dash) {
        const D = e._dash; D.t -= dt;
        ECHO.Ent.move(world, e, Math.cos(D.ang) * D.spd * dt, Math.sin(D.ang) * D.spd * dt);
        if (Math.random() < dt * 30) C().fx.push({ kind: 'p', x: e.x, y: e.y - 0.3, vx: 0, vy: 0, t: 0, life: 0.3, color: '#ffe08a', size: 2 });
        if (D.t <= 0 || (D.o && U.dist(e.x, e.y, D.o.x, D.o.y) < (D.o.r || 0.4) + (e.r || 0.4) + 0.6)) {
          e._dash = null;
          if (D.o && U.dist(e.x, e.y, D.o.x, D.o.y) < (D.o.r || 0.4) + (e.r || 0.4) + 1.4) { P.hit(game, e, D.o, D.mul, { knock: 0.7, stagger: D.stagger || 0.4, heavy: true }); C().burst(D.o.x, D.o.y, '#ffe08a', 10, 3, 0.4, 2); }
        }
        e.moving = true; e.state = 'chase';
        return true;
      }
      if (e.state === 'windup') {
        e.moving = false;
        if (e.t >= (K.big ? 0.4 : 0.28)) {
          const W = e._wind || {}; e._wind = null;
          e.state = 'attack'; e.t = 0; e.cd = (e.foe ? Math.max(0.55, (e.foe.cd || 1.2) * 0.75) : 0.9) + Math.random() * 0.2;
          const o = W.o;
          if (W.shoot && o) {
            const ang = Math.atan2(o.y - e.y, o.x - e.x), b = K.bolt;
            C().shoot(e, ang, { kind: 'orb', speed: 12, dmg: e.palDmg * 1.15 * P.mul(game, e, o), life: 1.4, type: b ? b.type || 'magic' : 'ranged', color: b ? b.color : '#e8e0d0' });
          } else if (o) {
            const ang = Math.atan2(o.y - e.y, o.x - e.x), reach = P.reach(e, o);
            C().slash(e.x, e.y, ang, reach + 0.2, 1.5, 'rgba(255,224,138,0.75)');
            if (U.dist(e.x, e.y, o.x, o.y) <= reach + 0.6) P.hit(game, e, o, W.mul || 1, { stagger: W.stagger || 0, knock: W.knock || 0.25, heavy: !!W.stagger });
          }
        }
        return true;
      }
      if (e.state === 'attack' && e.t < 0.2) { e.moving = false; return true; }

      // ---- the spent: back behind you
      if (R.kind === 'retreat') {
        if (e.hp > e.maxHp * 0.55) { e._retreatDone = true; return false; }
        const a = Math.atan2(pe.y - plan.focus.y, pe.x - plan.focus.x), gx = pe.x + Math.cos(a) * 3, gy = pe.y + Math.sin(a) * 3;
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.035 * dt);
        if (U.dist(e.x, e.y, gx, gy) > 0.8) { ECHO.Ent.travel(world, e, gx, gy, spd * 1.2, dt); e.state = 'chase'; } else { e.moving = false; e.state = 'idle'; }
        if (!e._saidBack) { e._saidBack = true; P.say(e, 'falls back', '#c8c0b0'); }
        return true;
      }
      e._saidBack = false;
      if (e.hp > e.maxHp * 0.6) e._retreatDone = false;

      // ---- what it must do for you, whatever its place: break a blow wound up against you
      if (ready('int') && !K.ranged) {
        for (const f of plan.foes) {
          const o = f.o;
          if (f.dp > 5 || !P.busy(o) || (o.target && o.target !== pe)) continue;
          const d = U.dist(e.x, e.y, o.x, o.y);
          if (d > P.reach(e, o) + 4) continue;
          use('int', 5);
          const ang = Math.atan2(o.y - e.y, o.x - e.x);
          if (d > P.reach(e, o)) { e._dash = { t: 0.3, ang, spd: (d - P.reach(e, o) + 0.3) / 0.3, o, mul: 1.3, stagger: 0.9 }; }
          else P.hit(game, e, o, 1.3, { stagger: 0.9, knock: 0.5, heavy: true });
          P.say(o, 'interrupted!', '#9fd8ff');
          return true;
        }
      }
      // ---- healers mend the pack, and you
      if (K.heal && ready('heal')) {
        const hurt = P.pals(game).filter(p => p.hp < p.maxHp * 0.55 && U.dist(p.x, p.y, e.x, e.y) < 9).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
        if (hurt || pl.hp < pl.maxHp * 0.5) {
          use('heal', 7);
          const t = pl.hp < pl.maxHp * 0.5 ? pe : hurt;
          if (t === pe) { const amt = Math.round(pl.maxHp * 0.14); pl.hp = Math.min(pl.maxHp, pl.hp + amt); pe.hp = pl.hp; C().floater(pe.x, pe.y - 1.4, `+${amt}`, '#9fffb0', true); }
          else t.hp = Math.min(t.maxHp, t.hp + t.maxHp * 0.25);
          C().fx.push({ kind: 'arc', x: e.x, y: e.y, x2: t.x, y2: t.y, h: 0.8, t: 0, life: 0.5, color: '#9fffb0' });
          C().burst(t.x, t.y, '#9fffb0', 14, 2, 0.6, 2);
          return true;
        }
      }
      // ---- the howl: the whole pack strikes harder
      if (K.howl && P.howlCd <= 0 && P.pals(game).length >= 2) {
        P.howlCd = 20; P.buffT = 8;
        for (const p of P.pals(game)) C().ring(p.x, p.y, 1.2, 'rgba(255,200,120,0.8)', 0.5);
        P.say(e, 'the pack howls! ▲', '#ffc87a');
        if (ECHO.Sfx) ECHO.Sfx.play('growl', { pitch: 1.2 });
        e.state = 'idle'; e.moving = false; e.cd = Math.max(e.cd, 0.5);
        return true;
      }

      // ---- cover: at your side, between you and harm
      if (R.kind === 'cover') {
        const near = plan.foes.filter(f => f.dp < 3.5).sort((a, b) => a.dp - b.dp)[0];
        const o = near ? near.o : plan.focus;
        const a = Math.atan2(o.y - pe.y, o.x - pe.x), gx = pe.x + Math.cos(a) * 1.3, gy = pe.y + Math.sin(a) * 1.3;
        if (near && U.dist(e.x, e.y, o.x, o.y) <= P.reach(e, o) && e.cd <= 0) return P.swing(game, e, o, 1, 0);
        if (U.dist(e.x, e.y, gx, gy) > 0.6) { ECHO.Ent.travel(world, e, gx, gy, spd * 1.3, dt); e.state = 'chase'; }
        else { e.moving = false; e.state = 'idle'; e.dir = a; }
        if (!e._saidCover) { e._saidCover = true; P.say(e, 'covers you', '#ffe08a'); }
        return true;
      }
      e._saidCover = false;

      let o = R.target;
      // what it cannot reach (across water, behind rock) it leaves for a while, for the nearest it can
      if (o && e._skip && e._skip.o === o && e._skip.until > game.time) {
        o = plan.foes.map(f => f.o).filter(x => !(e._skip.o === x)).sort((a, b) => U.dist(a.x, a.y, e.x, e.y) - U.dist(b.x, b.y, e.x, e.y))[0] || null;
      }
      if (!o || o.dead) return false;
      const d = U.dist(e.x, e.y, o.x, o.y), ang = Math.atan2(o.y - e.y, o.x - e.x), reach = P.reach(e, o);
      if (d > reach + 0.5 && !e._dash) {
        const pr = e._prog;
        if (!pr || pr.o !== o) e._prog = { o, d, t: game.time };
        else if (d < pr.d - 0.6) { pr.d = d; pr.t = game.time; }
        else if (game.time - pr.t > 1.6 && !K.ranged) { e._skip = { o, until: game.time + 5 }; e._prog = null; }
      } else e._prog = null;
      e.dir = ang; e.flip = Math.cos(ang) < 0; e.target = o;
      if (e.state !== 'windup' && e.state !== 'attack') e.state = 'chase';
      // ---- what it was born with
      if (K.breath && ready('breath') && d < 5.5) {
        use('breath', 8);
        for (let i = 0; i < 14; i++) C().fx.push({ kind: 'p', x: e.x + Math.cos(ang + (Math.random() - 0.5) * 0.9) * (1 + Math.random() * 4.5), y: e.y + Math.sin(ang + (Math.random() - 0.5) * 0.9) * (1 + Math.random() * 4.5) - 0.4, vx: 0, vy: -0.5, t: 0, life: 0.6, color: Math.random() < 0.5 ? '#ffb347' : '#ff5a1f', size: 3 });
        for (const f of plan.foes) { const a2 = Math.atan2(f.o.y - e.y, f.o.x - e.x), d2 = U.dist(e.x, e.y, f.o.x, f.o.y); if (d2 < 6 && Math.abs(U.angleDiff(a2, ang)) < 0.55) { P.hit(game, e, f.o, 1.8, { type: 'fire' }); if (!f.o.dead) { f.o.burn = Math.max(f.o.burn || 0, 2.5); f.o.burnFrom = pe; } } }
        game.light(e.x + Math.cos(ang) * 2, e.y + Math.sin(ang) * 2, 6, 0.8, '#ff9a3c', 0.3);
        e.moving = false; e.cd = Math.max(e.cd, 0.6);
        return true;
      }
      if (K.web && ready('web') && d < 7 && !(o.type === 'boss')) {
        use('web', 9);
        o.stagger = Math.max(o.stagger || 0, 1.6); o.state = 'stagger'; o.wcast = null; o.moving = false;
        C().fx.push({ kind: 'arc', x: e.x, y: e.y, x2: o.x, y2: o.y, h: 0.5, t: 0, life: 0.5, color: '#f4f4ff' });
        P.say(o, 'webbed', '#f4f4ff');
        return true;
      }
      if (K.blink && ready('blink') && d > 2.5 && d < 12) {
        use('blink', 6);
        const fa = Math.atan2(o.y - pe.y, o.x - pe.x), sp = ECHO.Ent.freeSpot(world, o.x + Math.cos(fa) * 1.1, o.y + Math.sin(fa) * 1.1, 2);
        if (sp) { C().burst(e.x, e.y, '#c8a8ff', 10, 2, 0.4, 2); e.x = sp.x; e.y = sp.y; C().burst(e.x, e.y, '#c8a8ff', 10, 2, 0.4, 2); P.hit(game, e, o, 1.5, { stagger: 0.4 }); return true; }
      }
      if (K.charge && ready('charge') && d > 3 && d < 10) {
        use('charge', 7);
        e._dash = { t: Math.min(0.6, d / 14), ang, spd: 14, o, mul: 1.6, stagger: 0.5 };
        P.say(e, 'charges', '#ffe08a');
        return true;
      }
      // the roar / the slam: everything round it thrown back (when more than one is near, or it is big)
      if (ready('slam') && d < reach + 1.2) {
        const R0 = 2.4 + (e.scale || 1) * 0.6, near = plan.foes.filter(f => U.dist(f.o.x, f.o.y, e.x, e.y) < R0 + (f.o.r || 0.4));
        if (near.length >= 2 || K.slam) {
          use('slam', K.slam ? 7 : 10);
          const col = (e.foe && (e.foe.em || e.foe.col)) || (e.boss && e.boss.belly) || '#ffe08a';
          C().ring(e.x, e.y, R0, 'rgba(255,224,138,0.9)', 0.5); C().burst(e.x, e.y, col, 26, 5, 0.7, 3); game.shake(0.15);
          for (const f of near) P.hit(game, e, f.o, 2, { knock: 0.6, stagger: 0.5, heavy: true });
          e.say = e.pal && e.pal.lord ? 'Kneel.' : '*a roar*'; e.sayT = 1;
          return true;
        }
      }
      // ---- ranged: keep its distance and shoot
      if (K.ranged) {
        if (d < 3.2) { const a = Math.atan2(e.y - o.y, e.x - o.x); ECHO.Ent.travel(world, e, e.x + Math.cos(a) * 3, e.y + Math.sin(a) * 3, spd, dt); return true; }
        if (d > 8) { ECHO.Ent.travel(world, e, o.x, o.y, spd, dt); return true; }
        if (e.cd <= 0) { e.state = 'windup'; e.t = 0; e.aim = ang; e.moving = false; e._wind = { o, shoot: true }; }
        else e.moving = false;
        return true;
      }
      // ---- melee: to its place round the foe, and strike
      if (d <= reach) {
        if (e.cd <= 0) return ready('power') ? (use('power', 6), P.swing(game, e, o, 2.2, 0.6)) : P.swing(game, e, o, 1, 0);
        e.moving = false;
        return true;
      }
      let gx = o.x, gy = o.y;
      if (R.ang != null && d < 5) { const rr = (o.r || 0.4) + (e.r || 0.4) + 0.5; gx = o.x + Math.cos(R.ang) * rr; gy = o.y + Math.sin(R.ang) * rr; }   // its place round the foe, the far side first
      ECHO.Ent.travel(world, e, gx, gy, spd * (d > 6 ? 1.25 : 1.05), dt);
      return true;
    },
    reach(e, o) { return (o.r || 0.4) + (e.r || 0.4) + (e.foe ? e.foe.reach || 1.2 : 1.2) * 0.8; },
    swing(game, e, o, mul, stagger) {
      e.state = 'windup'; e.t = 0; e.aim = Math.atan2(o.y - e.y, o.x - e.x); e.moving = false;
      e._wind = { o, mul, stagger, knock: stagger ? 0.6 : 0.25 };
      if (mul > 1.5) C().floater(e.x, e.y - 1.3 * (e.scale || 1), '!', '#ffe08a');
      return true;
    },

    // ------------------------------------------------------------ cover: part of every blow meant for you
    shield(game, dmg, from) {
      const plan = P.plan, c = plan && plan.cover;
      if (!c || c.dead || dmg <= 0 || !from || from === game.pe) return dmg;
      if (U.dist(c.x, c.y, game.pe.x, game.pe.y) > 3.2) return dmg;
      const share = dmg * 0.35;
      c.hp -= share;
      C().floater(c.x, c.y - 1.2 * (c.scale || 1), `▣ ${Math.round(share)}`, '#ffe08a');
      if (c.hp <= 0) { c.hp = 1; C().kill(c, from, 'melee'); }
      return dmg - share;
    }
  };
})();
