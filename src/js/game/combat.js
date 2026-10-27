// Combat: damage resolution, projectiles, effects, and what a death means.
// Every kill is reported back into the simulation — ecology, faction
// intelligence, plights, reputation — so fighting changes the world.
(function () {
  const { U } = ECHO;
  const G = () => ECHO.Game;

  const C = ECHO.Combat = {
    proj: [], fx: [], floaters: [],
    reset() { C.proj = []; C.fx = []; C.floaters = []; C.decals = []; },

    floater(x, y, text, color = '#fff', big) {
      // long numbers shortened (6.5k), and floaters that pop up together stacked, never on top of each other
      text = String(text).replace(/\d{4,}/g, m => ECHO.U.short(+m));
      let n = 0;
      for (const f of C.floaters) if (f.t < 0.45 && Math.abs(f.x - x) < 1.2 && Math.abs((f.y0 != null ? f.y0 : f.y) - y) < 0.9) n++;
      C.floaters.push({ x: x + (n % 2 ? 0.35 : n ? -0.35 : 0) * Math.min(1, n), y: y - n * 0.42, text, color, t: 0, life: big ? 1.6 : 1.1, big });
    },
    burst(x, y, color, n = 8, speed = 3, life = 0.5, size = 2) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.8);
        C.fx.push({ kind: 'p', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: life * (0.6 + Math.random() * 0.6), color, size });
      }
    },
    slash(x, y, angle, range, arc, color = 'rgba(255,255,255,0.85)', kind = 'combo') {
      C.fx.push({ kind: 'slash', x, y, angle, range, arc, t: 0, life: kind === 'heavy' ? 0.26 : kind === 'finisher' ? 0.22 : 0.16, color, style: kind });
    },
    // Bright sparks thrown along a direction — steel on steel, blade on bone.
    sparks(x, y, angle, color = '#fff2c0', n = 8, speed = 6) {
      for (let i = 0; i < n; i++) {
        const a = angle + (Math.random() - 0.5) * 1.4, s = speed * (0.5 + Math.random() * 0.7);
        C.fx.push({ kind: 'p', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: 0.18 + Math.random() * 0.15, color, size: 1.5, spark: true });
      }
    },
    ring(x, y, radius, color, life = 0.4) { C.fx.push({ kind: 'ring', x, y, radius, t: 0, life, color }); },

    // ------------------------------------------------------------ the look of a blow landing
    // Every hit shows what was hit and with what: a white-hot flash at the point
    // of impact, sparks that fly off along the blow, fall and bounce; blood that
    // spatters and stains the ground, bone-dust from the dead, slime, chips of
    // stone, wisps from spirits; fire throws embers and leaves scorch, frost
    // shards and mist, lightning crackles, venom splashes green, the void
    // swallows light. Heavy blows and criticals ring out with a shockwave and
    // light up the place for an instant. (Pure show: the renderer draws it.)
    decals: [],
    decal(x, y, kind, size = 1, life = 9) {
      if (C.decals.length > 70) C.decals.shift();
      C.decals.push({ x, y, kind, size, rot: Math.random() * 6.28, t: 0, life });
    },
    // a particle in the air: h height, vz up-speed, g its gravity, glow = drawn as light
    puff(x, y, o) { C.fx.push(Object.assign({ kind: 'p', x, y, vx: 0, vy: 0, t: 0, life: 0.5, color: '#ffffff', size: 2 }, o)); },
    MATS: {
      flesh: { col: ['#8a1c22', '#a8323a', '#6a1418'], decal: 'blood' },
      blood: { col: ['#6b5a3a', '#7a6a48'], decal: 'dirt' },
      bone: { col: ['#d8d4c4', '#b8b4a4', '#9fe8c8'], decal: 'dust' },
      spirit: { col: ['#bfe8ff', '#e8f4ff'], glow: true },
      slime: { col: ['#7ad84a', '#5ab83a', '#a8f070'], decal: 'slime' },
      stone: { col: ['#8d8576', '#6a6357', '#a8a090'], decal: 'cracks' },
      void: { col: ['#6a3aaa', '#a87aff', '#2a1040'], glow: true }
    },
    matOf(t) {
      if (t.type === 'ghost' || t.mutation === 'paleshade') return 'spirit';
      if (t.foe && (t.foe.look === 'wight' || t.foe.look === 'king')) return 'bone';
      const sh = t.shape || t.species;
      if (sh === 'slime') return 'slime';
      if (sh === 'horror' || t.elem === 'void') return 'void';
      if (sh === 'skeleton' || t.undead) return 'bone';
      if (/golem|stone|rock/.test(t.species || t.kind || '')) return 'stone';
      if (t.species === 'gnawer') return 'blood';
      return 'flesh';
    },
    impact(target, dmg, src, crit) {
      const game = G(), type = src.type || 'melee', from = src.from;
      const ang = src.angle != null ? src.angle : from ? Math.atan2(target.y - from.y, target.x - from.x) : Math.random() * 6.28;
      const big = target.type === 'boss' ? 1 + Math.min(1.5, (target.tscale || 1) * 0.5) : 1;
      const x = target.x - Math.cos(ang) * 0.25 * big, y = target.y - Math.sin(ang) * 0.25 * big;
      const h = (target.type === 'boss' ? 1.1 * big : 0.75) + (target.alt || 0);
      const heavy = !!(src.heavy || crit || dmg > target.maxHp * 0.2);
      const elem = src.elem || (type === 'fire' ? 'fire' : null);
      const hot = elem === 'fire' || elem === 'sun';
      const flashCol = hot ? '#ffb060' : elem === 'frost' || elem === 'storm' ? '#cfe8ff' : elem === 'venom' ? '#c8f080' : elem === 'void' ? '#b48aff' : type === 'magic' ? '#d8b8ff' : '#fff6e0';
      // the flash where it lands
      C.puff(x, y, { h, vz: 0, g: 0, life: heavy ? 0.16 : 0.1, size: (heavy ? 11 : 7) * Math.sqrt(big), color: flashCol, glow: true, flash: true });
      // sparks along the blow (steel, arrows, claws)
      if (type === 'melee' || type === 'ranged') {
        const n = (heavy ? 12 : 6) + (target.type === 'boss' ? 4 : 0);
        for (let i = 0; i < n; i++) { const a = ang + (Math.random() - 0.5) * 1.3, s = 4 + Math.random() * 6; C.puff(x, y, { h: h + (Math.random() - 0.3) * 0.3, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 1 + Math.random() * 4, g: 14, life: 0.25 + Math.random() * 0.3, color: crit ? '#fff2a0' : '#ffe0b0', size: 1.3, glow: true, spark: true, bounce: true }); }
      }
      // what it is made of
      const M = C.MATS[C.matOf(target)] || C.MATS.flesh;
      const nm = Math.round((4 + Math.min(12, dmg / Math.max(4, target.maxHp * 0.03))) * (heavy ? 1.6 : 1));
      for (let i = 0; i < nm; i++) {
        const a = ang + (Math.random() - 0.5) * 2.2, s = 1.5 + Math.random() * 3.5;
        C.puff(x, y, { h: h * (0.7 + Math.random() * 0.4), vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 0.5 + Math.random() * 3, g: M.glow ? -0.6 : 10, life: M.glow ? 0.6 + Math.random() * 0.4 : 0.5 + Math.random() * 0.4, color: M.col[i % M.col.length], size: M.glow ? 2.6 : 1.8 + Math.random() * 1.2, glow: !!M.glow, land: M.decal });
      }
      // the element's own mark
      if (hot) {
        for (let i = 0; i < 10; i++) C.puff(x + (Math.random() - 0.5) * 0.6, y + (Math.random() - 0.5) * 0.6, { h: h * 0.6, vx: (Math.random() - 0.5) * 1.5, vy: (Math.random() - 0.5) * 1.5, vz: 1 + Math.random() * 2.5, g: -1.2, life: 0.6 + Math.random() * 0.6, color: Math.random() < 0.5 ? '#ffcc66' : '#ff6a2a', size: 2.2, glow: true, flicker: true });
        C.puff(x, y, { h: h * 0.8, vz: 1.4, g: -0.5, life: 0.9, size: 5, color: '#4a4440', smoke: true });
        if (Math.random() < 0.6) C.decal(target.x, target.y, 'scorch', 0.8 * big);
      } else if (elem === 'frost') {
        for (let i = 0; i < 12; i++) { const a = Math.random() * 6.28, s = 2 + Math.random() * 4; C.puff(x, y, { h, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 1 + Math.random() * 3, g: 9, life: 0.5 + Math.random() * 0.3, color: i % 3 ? '#e8f6ff' : '#9fd3ff', size: 1.6, glow: true, spark: true, bounce: true }); }
        C.puff(x, y, { h: h * 0.7, vz: 0.3, g: -0.2, life: 1.1, size: 6, color: '#dfefff', smoke: true });
        C.decal(target.x, target.y, 'frost', 1.0 * big);
      } else if (elem === 'storm') {
        for (let i = 0; i < 3; i++) C.fx.push({ kind: 'arc', x: target.x + (Math.random() - 0.5) * 1.5 * big, y: target.y + (Math.random() - 0.5) * 1.5 * big, x2: target.x, y2: target.y, h, t: 0, life: 0.18 + Math.random() * 0.1, color: '#cfe8ff' });
      } else if (elem === 'venom') {
        for (let i = 0; i < 10; i++) { const a = Math.random() * 6.28, s = 1 + Math.random() * 3; C.puff(x, y, { h, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 1 + Math.random() * 2, g: 9, life: 0.6, color: i % 2 ? '#9fe05a' : '#5ab83a', size: 2, land: 'slime' }); }
      } else if (elem === 'void' || type === 'magic') {
        for (let i = 0; i < 10; i++) { const a = Math.random() * 6.28, r = 0.8 + Math.random() * 0.6; C.puff(x + Math.cos(a) * r, y + Math.sin(a) * r, { h: h + (Math.random() - 0.5), vx: -Math.cos(a) * r * 3, vy: -Math.sin(a) * r * 3, vz: 0, g: 0, life: 0.3, color: elem === 'void' ? '#a87aff' : '#d8b8ff', size: 2, glow: true }); }
      }
      // a heavy blow rings out and lights the place up
      if (heavy) {
        C.ring(target.x, target.y, 1.4 * big, crit ? 'rgba(255,240,160,0.85)' : 'rgba(255,230,200,0.6)', 0.28);
        if (game.light) game.light(x, y, 3.5 * big, crit ? 1.4 : 0.9, hot ? '#ff9a3c' : flashCol, 0.14);
      } else if (hot && game.light) game.light(x, y, 2.5, 0.7, '#ff9a3c', 0.12);
    },
    // a creature falls: a last spray, and the ground marked where it lies
    deathFx(target) {
      const M = C.MATS[C.matOf(target)] || C.MATS.flesh, big = target.type === 'boss' ? 1 + (target.tscale || 1) * 0.6 : 1;
      for (let i = 0; i < 16 * big; i++) { const a = Math.random() * 6.28, s = 1 + Math.random() * 3; C.puff(target.x, target.y, { h: 0.5, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 0.5 + Math.random() * 2.5, g: M.glow ? -0.5 : 9, life: 0.6 + Math.random() * 0.5, color: M.col[i % M.col.length], size: 2.2, glow: !!M.glow, land: M.decal }); }
      for (let i = 0; i < 6 * big; i++) { const a = Math.random() * 6.28; C.puff(target.x + Math.cos(a) * 0.5, target.y + Math.sin(a) * 0.4, { h: 0.15, vx: Math.cos(a) * 1.2, vy: Math.sin(a) * 1.2, vz: 0.4, g: -0.3, life: 1.0, size: 4 * Math.sqrt(big), color: '#b8a888', smoke: true }); }
      if (M.decal) C.decal(target.x, target.y, M.decal === 'blood' ? 'pool' : M.decal, 1.2 * big, 14);
    },
    // (whoever was thinking when it was marked made it — so those on their side know it's not meant for them)
    telegraph(o) { const f = { kind: 'tele', t: 0, by: C.thinker || null, ...o }; C.fx.push(f); return f; },

    // ------------------------------------------------------------ Melee
    melee(att, o) {
      const game = G();
      const hits = [];
      // A foe's blow carries it in: if what it swung at is standing just out of
      // reach (it stopped a step short, or was nudged back during the wind-up),
      // the attacker closes the gap as it strikes. Someone moving away still escapes.
      if (att !== game.pe && !att.mounted && !o.noLunge) {
        let tg = null, td = Infinity;
        for (const e of game.ents) {
          if (e === att || e.dead || e.hidden || e.ghost || !game.hostileTo(att, e)) continue;
          const d = U.dist(att.x, att.y, e.x, e.y);
          if (d < td && Math.abs(U.angleDiff(o.angle, Math.atan2(e.y - att.y, e.x - att.x))) < o.arc / 2 + 0.35) { td = d; tg = e; }
        }
        const short = tg ? td - (o.range + tg.r) : 0;
        if (tg && short > -0.02 && short < 0.75 && !(tg.moving && tg === game.pe && !tg.attackT)) {
          const step = short + 0.12, a = Math.atan2(tg.y - att.y, tg.x - att.x);
          ECHO.Ent.move(game.world, att, Math.cos(a) * step, Math.sin(a) * step);
          o = { ...o, angle: a };
        }
      }
      for (const e of game.ents) {
        if (e === att || e.dead || e.hidden || e.ghost) continue;
        if (!o.all && !(att === game.pe ? game.canPlayerHit(e) : game.hostileTo(att, e))) continue;
        const d = U.dist(att.x, att.y, e.x, e.y);
        if (d > o.range + e.r) continue;
        const a = Math.atan2(e.y - att.y, e.x - att.x);
        if (Math.abs(U.angleDiff(o.angle, a)) > o.arc / 2 && d > e.r + 0.3) continue;
        hits.push(e);
      }
      for (const e of hits) C.damage(e, o.dmg, { type: 'melee', from: att, angle: Math.atan2(e.y - att.y, e.x - att.x), knock: o.knock || 0.12, crit: o.crit, unblockable: o.unblockable || o.guardbreak, guardbreak: o.guardbreak, stealth: o.stealth, stagger: o.stagger, heavy: o.heavy, riposte: o.riposte, finisher: o.finisher });
      // Strike cover stones (bosses)
      if (o.rocks) for (const l of game.world.lairs) for (const r of l.rocks) {
        if (r.hp <= 0) continue;
        if (U.dist(att.x, att.y, r.x + 0.5, r.y + 0.5) < o.range + 0.8) C.hitRock(l, r, 60);
      }
      return hits;
    },
    hitRock(lair, rock, dmg) {
      rock.hp -= dmg;
      C.burst(rock.x + 0.5, rock.y + 0.5, '#8d8576', 10, 4, 0.6, 3);
      if (rock.hp <= 0) {
        C.burst(rock.x + 0.5, rock.y + 0.5, '#6a6357', 22, 6, 0.9, 3);
        ECHO.World.rebuildBlocked(G().world);
        G().shake(0.35);
      }
    },

    // ------------------------------------------------------------ Projectiles
    shoot(att, angle, o) {
      const p = {
        x: att.x + Math.cos(angle) * (att.r + 0.25), y: att.y + Math.sin(angle) * (att.r + 0.25) - 0.15,
        vx: Math.cos(angle) * o.speed, vy: Math.sin(angle) * o.speed, angle, kind: o.kind, dmg: o.dmg, from: att,
        t: 0, life: o.life || 1.4, radius: o.radius || 0, power: o.power || 1, type: o.type || 'ranged', color: o.color, effect: o.effect
      };
      C.proj.push(p);
      return p;
    },
    explode(p) {
      const game = G();
      const R = p.radius;
      // a fireball that bursts on water goes up in steam: weaker, and nothing catches
      const steam = ECHO.Water && ECHO.Water.quench(p);
      if (steam) { p = Object.assign({}, p, { dmg: p.dmg * 0.55, power: 0 }); }
      C.burst(p.x, p.y, '#ffb347', 18 + R * 10, 5, 0.6, 3);
      C.burst(p.x, p.y, '#ff5a1f', 12, 3, 0.8, 2);
      C.ring(p.x, p.y, R, 'rgba(255,170,60,0.8)', 0.35);
      // a ball of fire, a column of smoke, embers rising, and the ground scorched
      C.puff(p.x, p.y, { h: 0.6, vz: 0.6, g: 0, life: 0.35, size: 14 + R * 6, color: steam ? '#e8f0f8' : '#ffb35a', glow: true, flash: true, grow: 1.8 });
      for (let i = 0; i < 6 + R * 2; i++) C.puff(p.x + (Math.random() - 0.5) * R, p.y + (Math.random() - 0.5) * R, { h: 0.4, vz: 1 + Math.random() * 1.5, g: -0.6, life: 1.4 + Math.random(), size: 6 + R * 2, color: steam ? '#e8eef4' : '#3a3632', smoke: true, grow: 2.2 });
      for (let i = 0; i < 14; i++) C.puff(p.x, p.y, { h: 0.5, vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6, vz: 2 + Math.random() * 5, g: 6, life: 0.9 + Math.random() * 0.6, color: Math.random() < 0.5 ? '#ffcc66' : '#ff6a2a', size: 1.8, glow: true, spark: true, bounce: true });
      if (!steam) C.decal(p.x, p.y, 'scorch', 0.9 + R * 0.5, 16);
      if (ECHO.Sfx) ECHO.Sfx.play('explode', { pitch: 1.2 - Math.min(0.5, R * 0.1) });
      if (U.dist(p.x, p.y, game.pe.x, game.pe.y) < 12) game.shake(Math.min(0.4, 0.12 + R * 0.06));
      game.light(p.x, p.y, R * 3 + 1, 0.9, '#ff9a3c', 0.25);
      if (ECHO.Dilemmas) ECHO.Dilemmas.fireAt(p.x, p.y); if (ECHO.Town && !steam) ECHO.Town.fireAt(p.x, p.y, p.from);
      if (ECHO.Senses) ECHO.Senses.noise(game, p.x, p.y, 14, { kind: 'fight', by: p.from });
      for (const e of game.ents) {
        if (e.dead || e.hidden || e.ghost || e.dqScared) continue;
        if (e === p.from && !p.backfire) continue;
        if (p.from && p.from.isCompanion && (e === game.pe || e.isCompanion)) continue; // a companion's fire spares its friends
        const d = U.dist(p.x, p.y, e.x, e.y);
        if (d > R + e.r) continue;
        if (e !== game.pe && !game.hostileTo(p.from, e) && !p.backfire) continue;
        const fall = 1 - Math.min(1, d / (R + e.r)) * 0.5;
        C.damage(e, p.dmg * fall, { type: 'fire', from: p.from, angle: Math.atan2(e.y - p.y, e.x - p.x), knock: 0.25 });
        // nothing burns standing in water, and a soaked body barely catches
        if (!e.dead && p.power > 0 && !e._inWater) { const wetMul = e === game.pe && game.pl.wetT > 0 ? 0.3 : 1; e.burn = Math.max(e.burn, 2 * p.power * wetMul); e.burnFrom = p.from; }
      }
      for (const l of game.world.lairs) for (const r of l.rocks) if (r.hp > 0 && U.dist(p.x, p.y, r.x + 0.5, r.y + 0.5) < R + 0.6) C.hitRock(l, r, 25);
      // a big enough fire sets wooden workplaces alight
      if (p.from === game.pe && R >= 1.3 && !ECHO.Interior.cur) for (const st of game.world.settlements) {
        if (Math.abs(st.x - p.x) > 30 || Math.abs(st.y - p.y) > 30) continue;
        for (const b of st.buildings) if (b.fac && (b.fac.state === 'working' || b.fac.state === 'damaged') && U.dist(p.x, p.y, b.x + b.w / 2, b.y + b.h / 2) < R + 1 && Math.random() < 0.5) ECHO.UI.arson(b, st);
      }
    },
    updateProjectiles(dt) {
      const game = G();
      const world = game.world;
      for (const p of C.proj) {
        p.t += dt;
        const steps = 3;
        for (let s = 0; s < steps && !p.done; s++) {
          p.x += p.vx * dt / steps; p.y += p.vy * dt / steps;
          const tt = ECHO.World.tile(world, p.x, p.y);
          if (ECHO.World.isSolid(world, p.x, p.y) && tt !== ECHO.TILE.WATER && tt !== ECHO.TILE.DEEP) {
            p.done = true;
            if (p.kind === 'fire') C.explode(p);
            else if (p.kind === 'orb') C.burst(p.x, p.y, p.color || '#b48aff', 8, 2, 0.35, 2);
            else { C.burst(p.x, p.y, '#c9b28a', 4, 2, 0.3, 1); if (p.from === game.pe && ECHO.Sfx) ECHO.Sfx.play('arrowHit', { vol: 0.4 }); }
            break;
          }
          if (p.contest && ECHO.Fest.hitTarget(p)) { p.done = true; break; }
          for (const e of game.ents) {
            if (e === p.from || e.dead || e.hidden || e.ghost) continue;
            if (p.contest && e.type !== 'creature') continue; // contest arrows fly over the crowd
            if (U.dist(p.x, p.y, e.x, e.y - 0.15) > e.r + 0.15) continue;
            const canHit = p.from === game.pe ? !e.isCompanion && !e.ngWard : game.hostileTo(p.from, e);
            if (!canHit) continue;
            p.done = true;
            if (p.kind === 'fire') C.explode(p);
            else if (p.kind === 'orb') ECHO.Monsters.orbHit(game, p, e);
            else C.damage(e, p.dmg, { type: 'ranged', from: p.from, angle: p.angle, knock: p.crit ? 0.22 : 0.08, crit: p.crit, stagger: p.crit ? 0.35 : 0 });
            break;
          }
        }
        if (p.kind === 'fire' && Math.random() < 0.6) C.fx.push({ kind: 'p', x: p.x, y: p.y, vx: (Math.random() - 0.5), vy: (Math.random() - 0.5) - 0.5, t: 0, life: 0.35, color: Math.random() < 0.5 ? '#ffcc66' : '#ff6a2a', size: 2 });
        if (p.t > p.life && !p.done) { p.done = true; if (p.kind === 'fire') C.explode(p); }
      }
      C.proj = C.proj.filter(p => !p.done);
      for (const f of C.fx) {
        f.t += dt;
        if (f.kind === 'p') { f.x += f.vx * dt; f.y += f.vy * dt; const dr = f.spark ? 0.97 : f.smoke ? 0.9 : 0.92; f.vx *= dr; f.vy *= dr; }
      }
      C.fx = C.fx.filter(f => f.t < f.life && !f.done);
      if (C.decals.length) { for (const d of C.decals) d.t += dt; C.decals = C.decals.filter(d => d.t < d.life); }
      for (const f of C.floaters) { f.t += dt; f.y -= dt * 0.9; }
      C.floaters = C.floaters.filter(f => f.t < f.life);
    },

    // ------------------------------------------------------------ Damage
    damage(target, amount, src) {
      const game = G();
      const world = game.world;
      if (target.dead || amount <= 0 || target.submerged) return 0;
      if (target === game.pe && game.pl.flying) return 0;   // on a dragon's back, nothing on the ground can reach you
      if (target === game.pe && (game.defeating || game.pl.capture)) return 0;
      if (target.iframes > 0) { if (target === game.pe) { C.floater(target.x, target.y - 0.8, 'dodged', '#9fd3ff'); if (src.from && src.from !== game.pe) ECHO.Tech.onDodgedHit(game); } return 0; }
      const from = src.from;
      if (from && from.hidden && !from.dead) return 0; // nothing unseen can strike
      // a beast beaten to its knees is not struck again by you or yours: only Finish (E) ends it
      if (target.subdued > 0 && !target.pal && !target.titan && from && (from === game.pe || from.pal || from.tamed || from.isCompanion)) { if (from === game.pe && ECHO.Tame) ECHO.Tame.breathFinish(game, target); return 0; }
      if (from === game.pe && target !== game.pe) { game.lastStruck = target; game.lastStruckT = game.time; }
      // a companion's own skill: dodge, parry, shield
      if (target.isCompanion && ECHO.Companions) { amount = ECHO.Companions.defend(game, target, amount, src); if (amount <= 0) return 0; }
      const type = src.type;
      let dmg = amount * (from && from.growDmg ? from.growDmg : 1);   // (what it has grown into, fight by fight)
      const incoming = src.angle != null ? src.angle + Math.PI : null;
      const facingIncoming = incoming != null && Math.abs(U.angleDiff(target.dir, incoming)) < 1.25;
      // Blocking
      if (target.blocking && facingIncoming && !src.unblockable && type !== 'fire') {
        const isPlayer = target === game.pe;
        const ward = isPlayer ? game.pl.skills.ward : 30;
        const perfect = isPlayer && game.blockStart != null && game.time - game.blockStart < 0.22;
        const reduce = perfect ? 1 : 0.7 + ward / 400 - (isPlayer && ECHO.PlayerCtl.derived ? ECHO.PlayerCtl.derived.guardPenalty : 0);
        dmg *= (1 - reduce);
        if (target === game.pe) game.pl.stamina = Math.max(0, game.pl.stamina - amount * 0.6 * (ECHO.PlayerCtl.derived ? ECHO.PlayerCtl.derived.blockMul : 1));
        else target.stamina = Math.max(0, (target.stamina || 0) - amount * 0.6);
        C.burst(target.x + Math.cos(incoming) * 0.4, target.y + Math.sin(incoming) * 0.4, '#e8e2c8', 6, 3, 0.25, 2);
        C.sparks(target.x + Math.cos(incoming) * 0.4, target.y - 0.3 + Math.sin(incoming) * 0.4, incoming, perfect ? '#fff6c8' : '#ffd890', perfect ? 14 : 7);
        if (isPlayer || from === game.pe) {
          if (ECHO.Sfx) ECHO.Sfx.play(perfect ? 'parry' : 'block');
          game.hitStop(perfect ? 0.12 : 0.05);
          if (perfect) { game.punch(0.5); game.slowMo(0.35, 0.35); }
        }
        if (isPlayer) {
          ECHO.Character.train(game.pl, 'ward', perfect ? 0.6 : 0.25);
          ECHO.Character.behave(game.pl, 'caution', 0.04);
          if (perfect && from) { from.stagger = 0.9; C.floater(target.x, target.y - 0.9, 'perfect guard', '#ffe08a'); }
          if (from && from !== game.pe) { if (perfect) ECHO.Tech.onPerfectGuard(game); else ECHO.Tech.record('blocks'); if (ECHO.Wits) ECHO.Wits.note(game, 'blockhit'); }
          if (game.pl.spells.includes('wardsong') && perfect) game.wardsong();
          if (from && from.type === 'boss') ECHO.Boss.noteBlock(from);
        }
        if (dmg < 0.5) return 0;
      }
      // Shields (faction doctrine) turn arrows from the front.
      if (type === 'ranged' && target.gear.shield && facingIncoming && Math.random() < 0.72) {
        C.burst(target.x, target.y - 0.2, '#d8c9a0', 5, 2, 0.3, 2);
        C.floater(target.x, target.y - 0.9, 'blocked', '#d8c9a0');
        if (from === game.pe && ECHO.Sfx) ECHO.Sfx.play('shieldBlock');
        return 0;
      }
      if (type === 'melee' && target.gear.shield && facingIncoming && target.state !== 'attack' && !src.guardbreak && Math.random() < 0.35) {
        dmg *= 0.3;
        C.burst(target.x, target.y - 0.2, '#d8c9a0', 4, 2, 0.3, 2);
        C.sparks(target.x, target.y - 0.3, incoming, '#ffe0a0', 6);
        if (from === game.pe && ECHO.Sfx) ECHO.Sfx.play('shieldBlock');
        if (from === game.pe) game.hitStop(0.04);
      } else if (src.guardbreak && (target.blocking || target.gear.shield) && facingIncoming) {
        C.floater(target.x, target.y - 1.1, 'guard broken', '#ffcf8a');
        target.blocking = false;
        if (target.type !== 'player') target.stamina = 0;
      }
      // Fire wards and evolved hides
      if (type === 'fire') {
        if (target.gear.fireward) dmg *= 0.35;
        if (target === game.pe && game.pl.wetT > 0) dmg *= 0.7; // soaked through
        if (target._inWater) dmg *= 0.75;
        if (target.traits) dmg *= 1 - target.traits.fireRes;
      }
      if (type === 'melee' && target.traits) dmg *= 1 - target.traits.hide * 0.7;
      if (type === 'ranged' && target.traits && Math.random() < target.traits.speed * 0.6) { C.floater(target.x, target.y - 0.7, 'evaded', '#cfcfcf'); return 0; }
      if (type === 'ranged' && target.mutation === 'mirrorback' && Math.random() < 0.5) { C.floater(target.x, target.y - 0.7, 'glanced off', '#dfe8ff'); return 0; }
      // Boss armor adapted to how it was hurt before
      if (target.type === 'boss') {
        const b = target.boss;
        dmg *= 1 - (b.armor[type] || 0);
        ECHO.Boss.noteDamage(target, type, dmg);
      }
      // Monsters' resistances and weaknesses
      if (target.resist && ECHO.Monsters) dmg = ECHO.Monsters.resist(game, target, type, dmg, from);
      // Critical: knowledge of the creature's weak points
      let crit = !!src.crit;
      if (from === game.pe && !crit && ECHO.Monsters && Math.random() < ECHO.Monsters.keen(game, type)) crit = true;
      if (from === game.pe && !crit) {
        const known = target.species ? (game.pl.studied[target.species] || 0) : target.type === 'boss' ? (game.pl.studied['boss:' + target.boss.id] || 0) : 0;
        if (Math.random() < Math.min(0.35, known * 0.035)) crit = true;
      }
      if (from === game.pe && target !== game.pe && (src.shadowroll || ECHO.Tech.shadowT > 0) && type === 'melee') { crit = true; src.shadowroll = true; ECHO.Tech.shadowT = 0; }
      if (from && from.isCompanion && !crit && Math.random() < (from.critC || 0)) crit = true;
      if (crit) dmg *= 1.8;
      if (src.stealth) dmg *= from === game.pe ? ECHO.Tech.stealthMul() : 3;
      if (from === game.pe && target !== game.pe) dmg *= ECHO.Tech.dealt(target, src);
      if (from === game.pe && target !== game.pe && (type === 'melee' || type === 'ranged') && ECHO.Arcana) dmg *= ECHO.Arcana.dealt(game, type);
      if (target === game.pe && from !== game.pe && game.pl.mounted && ECHO.Life) dmg = ECHO.Life.hitInSaddle(game, from, dmg);
      if (target === game.pe && from !== game.pe) dmg *= ECHO.Tech.taken() * (ECHO.Gear ? ECHO.Gear.taken(world, game.pl, type) : 1) * (ECHO.Companions ? ECHO.Companions.shield(game) : 1);
      if (target === game.pe && from && from !== game.pe && ECHO.Director && ECHO.Director.mercy(game)) dmg *= 0.82;
      dmg = Math.max(1, Math.round(dmg));
      // Your own fire can hurt you badly, but never below 15% of your life.
      if (target === game.pe && (from === game.pe || (!from && type !== 'drown'))) { const floor = Math.max(1, target.maxHp * 0.15); if (target.hp - dmg < floor) dmg = Math.max(0, Math.floor(target.hp - floor)); }
      if (target === game.pe && from !== game.pe && ECHO.Arcana) dmg = Math.round(ECHO.Arcana.taken(game, dmg));
      if (target === game.pe && from !== game.pe && ECHO.Pack) dmg = Math.round(ECHO.Pack.shield(game, dmg, from));
      if (target === game.pe && from !== game.pe) dmg = game.grit(dmg);
      if (dmg <= 0) { if (target === game.pe) target.burn = 0; return 0; }
      if (target === game.pe) game.logHit(from, dmg, type === 'melee' ? '' : type);
      // the wardens of the Guard give ground, but are not brought down
      if (target.ngWard) { dmg = Math.max(0, Math.min(Math.round(dmg * 0.35), Math.floor(target.hp - 1))); if (dmg <= 0) return 0; }
      if (target.titan && ECHO.Apex) { dmg = Math.round(ECHO.Apex.preDamage(game, target, dmg, src)); if (dmg <= 0) return 0; }
      const wasStaggered = target.stagger > 0;
      if (ECHO.Aware && from) ECHO.Aware.hurtBy(target, from, dmg);
      target.hp -= dmg;
      target.hurtT = 0.18;
      target.hurtDir = src.angle != null ? src.angle : target.hurtDir;
      // Stagger interrupts whatever the target was winding up.
      if (src.stagger && target !== game.pe && (target.type !== 'boss' || src.heavy)) {
        const st = target.type === 'boss' ? src.stagger * 0.5 : src.stagger;
        target.stagger = Math.max(target.stagger || 0, st);
        if (target.species === 'wolf' && (target.state === 'windup' || target.state === 'lunge')) { target.state = 'retreat'; target.t = 0; }
        if (target.type === 'boss' && st > 0.3) C.floater(target.x, target.y - 2, 'staggered', '#ffe08a');
      }
      if (target === game.pe) { game.pl.hp = target.hp; game.lastHurtTime = game.time; if (from && from !== game.pe) { game.combatT = game.time; ECHO.Tech.onHurt(game, dmg); if (from.ab && type !== 'magic') ECHO.Monsters.hitPlayer(game, from, dmg); } }
      if (from === game.pe && target.foe && ECHO.Monsters) ECHO.Monsters.playerHit(game, target, dmg, type);
      if (from === game.pe && target !== game.pe && target.type !== 'ghost' && !(target.type === 'creature' && target.species === 'hare')) ECHO.Tech.onHit(game, target, { ...src, crit, wasStaggered, perfect: !!src.crit }, dmg);
      if (from === game.pe && target !== game.pe) {
        const sk = type === 'melee' ? 'blade' : type === 'ranged' ? 'archery' : 'flame';
        ECHO.Character.train(game.pl, sk, type === 'ranged' ? 0.18 : 0.06);
        if (target.type === 'person' || target.type === 'boss' || target.species === 'wolf' || target.humanoid) game.combatT = game.time;
      }
      if (src.knock && src.angle != null && target.type !== 'boss') { target.kbx += Math.cos(src.angle) * src.knock; target.kby += Math.sin(src.angle) * src.knock; }
      const col = target === game.pe ? '#ff6b6b' : type === 'fire' ? '#ffb347' : crit ? '#ffe066' : '#ffffff';
      C.floater(target.x + (Math.random() - 0.5) * 0.4, target.y - 0.9, (crit ? '✦' : '') + (dmg >= 10000 ? U.short(dmg) : dmg), col, crit);
      C.impact(target, dmg, src, crit);
      if (target === game.pe) {
        game.shake(Math.min(0.5, 0.12 + dmg / 40));
        game.lastHitBy = from;
        game.hurtFlash(Math.min(1, 0.35 + dmg / 30));
        game.hitStop(Math.min(0.09, 0.03 + dmg / 400));
        if (src.angle != null) game.kick(src.angle, 0.14);
        if (ECHO.Sfx) ECHO.Sfx.play('hurt');
      } else if (from === game.pe || (from && from.isCompanion)) {
        // The feel of landing a blow
        const ang = src.angle != null ? src.angle : 0;

        if (ECHO.Sfx) {
          if (crit || src.stealth) ECHO.Sfx.play('crit');
          if (type === 'ranged') ECHO.Sfx.play('arrowHit');
          else if (type === 'melee') ECHO.Sfx.play(src.heavy ? 'hitHeavy' : 'hit', { pitch: target.type === 'boss' ? 0.7 : target.species === 'gnawer' ? 1.3 : 1 });
        }
        if (type === 'ranged' && from === game.pe) game.hitStop(crit ? 0.07 : 0.025);
        if (crit) game.punch(0.4);
      }
      // Being hit makes non-hostile people angry at the player.
      if (from === game.pe && (target.role === 'guard' || target.role === 'soldier')) game.lastHitGuard = game.time;
      if (from === game.pe && target.type === 'person' && target.hp > 0 && !game.hostileTo(target, game.pe) && !(target.criminal && !target.yielded) && !target.dqFoe) game.crime(target, 'assault', type === 'ranged' ? 'arrow' : /fire|flame|burn|spell/.test(type || '') ? 'fire' : 'blade');
      if (from === game.pe && target.type !== 'player') {
        target.aggro = true;
        if (target.type === 'creature' && target.species === 'hare') { target.state = 'flee'; target.fleeFrom = { x: from.x, y: from.y }; target.calmT = 3; }
      }
      if (from && from.isCompanion && ECHO.Companions) ECHO.Companions.landed(game, from, target, type, crit);
      if (ECHO.Companions && (target.isCompanion || target === game.pe)) ECHO.Companions.afterHit(game, target);
      if (target.rider && target.hp > 0 && ECHO.Riders) ECHO.Riders.onHit(game, target, src);
      if (ECHO.Growth) ECHO.Growth.onHit(game, target, from, dmg, src);
      // Bloodwine: the hurt you do, drunk back as life
      if (from === game.pe && target !== game.pe && game.pl.buffs && game.pl.buffs.leech > 0 && !game.pe.dead && game.pl.hp < game.pl.maxHp) { const pl = game.pl, got = Math.max(1, Math.round(Math.min(dmg / 6, pl.maxHp * 0.06))); pl.hp = game.pe.hp = Math.min(pl.maxHp, game.pe.hp + got); C.floater(game.pe.x + 0.3, game.pe.y - 1.1, `+${got}`, '#ff5a7a'); }
      if (ECHO.Pack && from && (target === game.pe || target.pal)) ECHO.Pack.alert(game, from, target);
      if (target.breach && from && (from === game.pe || from.isCompanion || from.tamed)) target._pDmg = (target._pDmg || 0) + dmg;
      if (target.hp <= 0) C.kill(target, from, type, src);
      else if (target.ai && target.ai.onHurt) target.ai.onHurt(target, from);
      return dmg;
    },

    // ------------------------------------------------------------ Death
    kill(target, from, type, src = {}) {
      const game = G();
      const world = game.world;
      if (target.dead) return;
      if (target === game.pe) { if (type !== 'drown' && ECHO.PlayerCtl && ECHO.PlayerCtl.phoenixSave(game)) return; target.hp = 0; game.playerDefeated(from); return; }
      if (target.titan && ECHO.Apex) { if (target.tamed) ECHO.Apex.spent(game, target); else if (target.state !== 'subdued') { target.hp = Math.max(1, target.maxHp * 0.1); ECHO.Apex.subdue(game, target); } return; }
      if (ECHO.Tame && ECHO.Tame.onDeath(game, target, from)) return;
      if (target.mounted && ECHO.Riders) ECHO.Riders.fell(game, target);
      target._xpOk = ECHO.Progress && ECHO.Progress.counts(game, target);
      target.dead = true;
      target.deathT = 0;
      if (target.type !== 'person' || target.humanoid) C.deathFx(target);
      if (target.jobId && ECHO.Jobs) ECHO.Jobs.onKill(game, target, from);
      if (target.rare && ECHO.Secrets && (from === game.pe || (from && from.isCompanion))) ECHO.Secrets.onRareKill(game, target);
      if (target.escort && ECHO.Jobs && target.escort.status === 'active') ECHO.Jobs.fail(game, target.escort, `${target.escort.giverName} was killed on the road`);
      const byPlayer = from === game.pe || (from && (from.isCompanion || from.pal));
      target._killer = from || null;
      if (ECHO.Tame && from && from.pal) ECHO.Tame.onKill(game, target, from);
      if (ECHO.Growth) ECHO.Growth.onKill(game, target, from);
      // Death has weight: a beat of stillness, then the body is thrown.
      const ka = src.angle != null ? src.angle : Math.atan2(target.y - game.pe.y, target.x - game.pe.x);
      target.deathAngle = ka;
      if (target.type !== 'boss') { const kb = (src.knock || 0.12) * 1.8 + 0.15; target.kbx += Math.cos(ka) * kb; target.kby += Math.sin(ka) * kb; }
      if (byPlayer && target.species !== 'hare' && target.species !== 'gnawer') ECHO.Tech.onKill(game, target, type, src);
      if (byPlayer && ECHO.Progress) ECHO.Progress.onKill(game, target);
      if (byPlayer) {
        if (ECHO.Sfx) ECHO.Sfx.play('kill', { pitch: target.species === 'gnawer' || target.species === 'hare' ? 1.5 : 1 });
        game.hitStop(target.type === 'boss' ? 0.2 : target.species === 'hare' || target.species === 'gnawer' ? 0.06 : 0.1);
        game.punch(target.type === 'boss' ? 1 : 0.5);
        if (target.type === 'boss') game.slowMo(1.6, 0.25);
      }
      const night = game.isNight();
      const region = ECHO.World.regionAt(world, target.x, target.y);
      if (target.marvel) { ECHO.Marvels.onKill(target, from); return; }
      if (target.event && ECHO.Events && target.type !== 'boss') ECHO.Events.onKill(target, from);
      if (target.humanoid) { C.burst(target.x, target.y, target.foe && (target.foe.look === 'wight' || target.foe.look === 'king') ? '#9fe8c8' : '#7a1d24', 12, 3, 0.6, 2); ECHO.Quests.onKill(target, from); return; }
      if (target.questId || target.delve) ECHO.Quests.onKill(target, from);
      if (target.fauna || target.species === 'fox') {
        C.burst(target.x, target.y, '#5a1f1f', 10, 3, 0.6, 2);
        if (byPlayer) { game.pl.kills[target.fname.toLowerCase()] = (game.pl.kills[target.fname.toLowerCase()] || 0) + 1; game.drop(target); ECHO.Character.train(game.pl, 'archery', 0.05); }
        return;
      }
      if (target.type === 'creature') {
        const sp = target.species;
        C.burst(target.x, target.y, '#5a1f1f', 10, 3, 0.6, 2);
        if (byPlayer) {
          ECHO.Ecology.recordKill(world, region, sp, type, ECHO.Spawner.unitsPerKill(sp));
          if (sp === 'wolf') { ECHO.Intel.recordKill(world, 'wild', { method: type, night, alone: !target.pack }); ECHO.Plights.playerKilledWolf(world, region); }
          const nm = ECHO.Ecology.speciesName(world, region, sp).toLowerCase();
          game.pl.kills[nm] = (game.pl.kills[nm] || 0) + 1;
          game.drop(target);
          if (night) ECHO.Character.behave(game.pl, 'night', 0.05);
          if (target.yielded || target.state === 'flee') ECHO.Character.behave(game.pl, 'cruelty', sp === 'hare' ? 0 : 0.05);
        } else ECHO.Ecology.recordKill(world, region, sp, null, ECHO.Spawner.unitsPerKill(sp) * 0.5);
        return;
      }
      if (target.type === 'boss') { if (target.event && ECHO.Events) ECHO.Events.onKill(target, from); ECHO.Boss.defeated(target, from); return; }
      if (target.type === 'person') {
        const npc = world.npcs[target.npcId];
        C.burst(target.x, target.y, '#7a1d24', 14, 3, 0.7, 2);
        if (npc && npc.status !== 'dead') {
          if (target.isCompanion && ECHO.Companions) ECHO.Companions.fell(game, npc);
          npc._x = target.x; npc._y = target.y;
          const killerName = game.killerNameFor(target, from);
          const cause = byPlayer ? (src.stealth ? 'killed in their sleep' : 'cut down') : 'killed in a skirmish';
          // Item they carry falls
          if (npc.carry && world.items[npc.carry]) {
            game.dropItem(npc.carry, target.x, target.y);
            npc.carry = null;
          }
          // and what they wore
          if (ECHO.Delvers && npc.gear) for (const sl of ['weapon', 'armor']) {
            const it = sl === 'weapon' ? ECHO.Delvers.weapon(world, npc) : ECHO.Delvers.armor(world, npc);
            if (it) { it.delverLoot = false; game.dropItem(it.id, target.x + (sl === 'armor' ? 0.6 : -0.4), target.y + 0.3); }
            npc.gear[sl] = null;
          }
          const camp = npc.camp && world.camps.find(c => c.id === npc.camp);
          const wasLeader = camp && camp.leader === npc.id;
          if (camp) camp.members = camp.members.filter(id => id !== npc.id);
          ECHO.People.kill(world, npc, cause, killerName, byPlayer && killerName && from === game.pe ? 'player' : from && from.npcId ? from.npcId : null);
          if (byPlayer) game.personKilledByPlayer(target, npc, type, { night, wasLeader, camp, stealth: !!src.stealth });
          if (camp && wasLeader) ECHO.Politics.campSuccession(world, camp);
        }
      }
    },

    updateBurning(dt) {
      const game = G();
      for (const e of game.ents) {
        if (e.dead || !e.burn) continue;
        e.burn -= dt;
        e.burnTick = (e.burnTick || 0) + dt;
        if (Math.random() < dt * 14) C.fx.push({ kind: 'p', x: e.x + (Math.random() - 0.5) * 0.5, y: e.y - 0.3, vx: 0, vy: -1.4, t: 0, life: 0.4, color: Math.random() < 0.5 ? '#ffb347' : '#ff5a1f', size: 2 });
        if (e.burnTick > 0.5) {
          e.burnTick = 0;
          C.damage(e, 3, { type: 'fire', from: e.burnFrom || game.pe });
        }
        if (e.burn <= 0) e.burn = 0;
      }
    }
  };
})();
