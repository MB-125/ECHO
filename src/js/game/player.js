// Player controller. No classes: what you do repeatedly trains skills and
// shapes tendencies, and tendencies change how your body actually fights.
(function () {
  const { U } = ECHO;
  const In = ECHO.Input;
  const Ch = () => ECHO.Character;

  const star = pl => pl.spells.includes('starfire');
  const PC = ECHO.PlayerCtl = {
    derived: null, derivedT: 0, draw: 0, drawing: false, charge: 0, charging: false,
    dodgeT: 0, dodgeDir: 0, studyT: 0, studyTarget: null, eatT: 0, sneaking: false,

    ROLL: 0.38,
    reset() { PC.combo = 0; PC.comboT = 9; PC.atkBuf = 0; PC.holdT = 0; PC.heavyHold = false; PC.lungeT = 0; PC.dodgeBuf = 0; PC.derived = null; PC.draw = 0; PC.drawing = false; PC.charge = 0; PC.charging = false; PC.dodgeT = 0; PC.studyT = 0; PC.studyTarget = null; PC.lock = null; },

    computeDerived(game) {
      const pl = game.pl;
      const t = k => Ch().tendency(pl, k);
      const aggr = t('aggression'), caution = t('caution'), reck = t('reckless');
      const weapon = game.world.items[pl.weapon];
      const bow = game.world.items[pl.bow];
      const wdmg = weapon ? weapon.dmg : 5;
      const charm = k => ECHO.Wonders && ECHO.Wonders.has(game.world, pl, k);
      const might = pl.buffs && pl.buffs.might > 0 ? 1.33 : 1;
      const lvM = (ECHO.Prowess ? ECHO.Prowess.dmgMult(pl) : 1) * might;
      const WC = (ECHO.Gear && ECHO.Gear.wclass(weapon)) || { cd: 1, dmg: 1, range: 0, sta: 1, flame: 1 };
      PC.derived = {
        aggr, caution, reck,
        meleeCd: 0.5 * (1 - 0.32 * aggr) * WC.cd,
        meleeDmg: wdmg * (0.75 + pl.skills.blade / 70) * (1 + 0.28 * aggr) * (charm('courage') ? 1.12 : 1) * lvM * WC.dmg,
        meleeRange: (weapon ? 1.35 : 0.95) + WC.range,
        meleeStam: 11 * (1 - 0.2 * aggr) * WC.sta,
        blockMul: 1 - 0.4 * caution,
        guardPenalty: aggr * 0.25,
        bowDmg: bow ? bow.dmg * (0.7 + pl.skills.archery / 65) * lvM : 0,
        drawTime: 0.75 * (1 - pl.skills.archery / 250),
        flameDmg: 19 * (0.8 + pl.skills.flame / 55) * (1 + 0.45 * reck) * (pl.spells.includes('starfire') ? 1.25 : 1) * lvM * WC.flame,
        flameInstab: pl.spells.includes('starfire') ? 0 : reck * 0.2,
        speed: 4.3 * (1 + pl.skills.endurance / 260),
        maxHp: 100 + pl.skills.endurance * 0.6 + pl.skills.ward * 0.4 + ((pl.boons && pl.boons.hp) || 0) + (charm('health') ? 20 : 0) - (charm('hindcurse') ? 20 : 0) + (pl.armor && game.world.items[pl.armor] && game.world.items[pl.armor].affix === 'vigor' ? 25 : 0) + (ECHO.Prowess ? ECHO.Prowess.hpBonus(pl) : 0),
        maxSta: 100 + pl.skills.endurance * 0.8 + ((pl.boons && pl.boons.sta) || 0) + (ECHO.Prowess ? ECHO.Prowess.staBonus(pl) : 0),
        maxMana: 60 + pl.skills.flame * 1.2 + ((pl.boons && pl.boons.mana) || 0),
        wellfed: charm('wellfed')
      };
      pl.maxHp = PC.derived.maxHp; pl.maxSta = PC.derived.maxSta; pl.maxMana = PC.derived.maxMana;
      pl.hp = Math.min(pl.hp, pl.maxHp);
    },

    update(game, dt) {
      const pe = game.pe, pl = game.pl, world = game.world;
      if (!pe || pe.dead) return;
      PC.derivedT -= dt;
      if (!PC.derived || PC.derivedT <= 0) { PC.computeDerived(game); PC.derivedT = 1; }
      ECHO.Tech.tick(game, dt);
      const D = PC.derived;
      const mouse = game.screenToWorld(In.mx, In.my);
      let aim = Math.atan2(mouse.y - (pe.y - 0.3), mouse.x - pe.x);
      // ---- Target lock (R or middle mouse): you always face and aim at the target
      if ((In.hit('r') || In.mpressed[1]) && !game.ui.blocksWorld()) {
        if (PC.lock) PC.unlock(game, true);
        else PC.acquire(game, mouse);
      }
      if (PC.lock && !PC.lockValid(game, PC.lock)) {
        const next = PC.findTarget(game, pe.x, pe.y, 9);
        PC.lock = next;
        if (!next) PC.unlock(game, false);
      }
      if (In.padName && In.padAim != null) aim = In.padAim;
      if (PC.lock) aim = Math.atan2(PC.lock.y - pe.y, PC.lock.x - pe.x);
      pe.stamina = pl.stamina; pe.maxSta = pl.maxSta;
      pe.cd = Math.max(0, pe.cd - dt);
      pe.iframes = Math.max(0, pe.iframes - dt);
      pe.hurtT = Math.max(0, pe.hurtT - dt);
      if (pe.stagger > 0) { pe.stagger -= dt; }

      // ---- Movement
      let mx = 0, my = 0;
      if (In.key('w') || In.key('ArrowUp')) my -= 1;
      if (In.key('s') || In.key('ArrowDown')) my += 1;
      if (In.key('a') || In.key('ArrowLeft')) mx -= 1;
      if (In.key('d') || In.key('ArrowRight')) mx += 1;
      PC.sneaking = In.key('Control') || In.key('c');
      pe.sneaking = PC.sneaking;
      const len = Math.hypot(mx, my);
      if (len) { mx /= len; my /= len; }

      pe.blocking = In.key('Shift') && pl.stamina > 4 && PC.dodgeT <= 0 && !PC.drawing && !(pe.attackT > 0);
      if (In.hit('Shift')) game.blockStart = game.time;

      if (PC.dodgeT > 0) {
        PC.dodgeT -= dt;
        if (PC.dodgeT <= 0) PC.rollEndT = game.time;
        // burst out of the dive, slow as you come up out of the roll
        const sp = 10 * (0.45 + 0.75 * Math.max(0, PC.dodgeT) / PC.ROLL) * dt;
        ECHO.Ent.move(world, pe, Math.cos(PC.dodgeDir) * sp, Math.sin(PC.dodgeDir) * sp);
        if (Math.random() < 0.6) ECHO.Combat.fx.push({ kind: 'p', x: pe.x, y: pe.y + 0.2, vx: 0, vy: 0, t: 0, life: 0.3, color: 'rgba(200,190,170,0.6)', size: 2 });
      } else if (pe.stagger <= 0) {
        let sp = D.speed * (ECHO.Life ? ECHO.Life.speedMul(pl) : 1) * ECHO.World.speedAt(world, pe.x, pe.y) * ECHO.Tech.speedMul() * (ECHO.Monsters ? ECHO.Monsters.slowMul() : 1);
        if (pe.blocking) sp *= 0.45;
        if (PC.drawing) sp *= 0.55;
        if (PC.charging) sp *= 0.6;
        if (PC.heavyHold) sp *= 0.55;
        if (pe.attackT > 0) sp *= 0.5;
        if (PC.sneaking) sp *= 0.5;
        if (PC.studyT > 0) sp *= 0.3;
        if (pl.stamina < 1 && len) sp *= 0.75;
        if (pl.mounted) {
          // A horse has weight: it gathers speed through walk, trot and canter
          // into a gallop, carries on a little when you let go, and turns in arcs.
          const R0 = PC.ride || (PC.ride = { v: 0, dir: pe.dir });
          const want = len ? sp : 0;
          R0.v += U.clamp(want - R0.v, -dt * 9, dt * (R0.v < 2 ? 5 : 3.2));
          if (len) {
            const a = Math.atan2(my, mx), turn = U.angleDiff(R0.dir, a);
            const rate = R0.v > 5 ? 4 : R0.v > 2.5 ? 6 : 10;
            R0.dir += U.clamp(turn, -dt * rate, dt * rate);
            if (Math.abs(turn) > 2.2 && R0.v > 3) R0.v -= dt * 8;   // hauling round: check the pace first
          }
          if (R0.v > 0.05) {
            const bx = pe.x, by = pe.y;
            ECHO.Ent.move(world, pe, Math.cos(R0.dir) * R0.v * dt, Math.sin(R0.dir) * R0.v * dt);
            if (Math.hypot(pe.x - bx, pe.y - by) < R0.v * dt * 0.3) R0.v *= Math.exp(-dt * 6);  // ran into something
          }
          pe.moving = R0.v > 0.3;
          pe.rideV = R0.v;
        } else if (len) {
          ECHO.Ent.move(world, pe, mx * sp * dt, my * sp * dt);
          pe.moving = true;
          if (Math.random() < dt * 0.6) Ch().train(pl, 'endurance', 0.03);
        } else pe.moving = false;
      }
      if (!pl.mounted && PC.ride) PC.ride = null;
      // Face the mouse when fighting, otherwise movement.
      if (pe.attackT > 0) { /* keep the swing's facing */ }
      else if (PC.lock && PC.dodgeT <= 0) pe.dir = aim; // locked on: strafe, always facing the target
      else if (pe.blocking || PC.drawing || PC.charging || PC.heavyHold || pe.cd > 0.1) pe.dir = aim;
      else if (pl.mounted && PC.ride) pe.dir = PC.ride.dir;
      else if (len) pe.dir = Math.atan2(my, mx);
      pe.flip = Math.cos(pe.dir) < 0;

      // ---- Dodge (a roll; Echo Step turns it into a blink)
      if (In.hit(' ')) PC.dodgeBuf = 0.18;
      PC.dodgeBuf = Math.max(0, (PC.dodgeBuf || 0) - dt);
      if (PC.dodgeBuf > 0 && PC.dodgeT <= 0 && pl.stamina >= 16 && pe.stagger <= 0 && !(pe.attackT > 0.08)) {
        PC.dodgeBuf = 0;
        pl.stamina -= 18;
        if (game.combatT != null && game.time - game.combatT < 6) ECHO.Tech.record('dodges');
        const dir = len ? Math.atan2(my, mx) : aim + Math.PI;
        Ch().behave(pl, 'caution', 0.02);
        Ch().train(pl, 'endurance', 0.08);
        ECHO.Boss.noteDodge(game, dir);
        ECHO.Sfx.play('dodge');
        PC.heavyHold = false; PC.holdT = 0;
        if (pl.spells.includes('echostep')) {
          ECHO.Combat.fx.push({ kind: 'echo', x: pe.x, y: pe.y, t: 0, life: 0.6, flip: pe.flip });
          ECHO.Combat.burst(pe.x, pe.y, '#9fd3ff', 10, 3, 0.4, 2);
          let bx = pe.x, by = pe.y;
          for (let i = 0; i < 16; i++) {
            const nx = bx + Math.cos(dir) * 0.22, ny = by + Math.sin(dir) * 0.22;
            if (ECHO.World.isSolid(world, nx, ny)) break;
            bx = nx; by = ny;
          }
          pe.x = bx; pe.y = by; pe.iframes = 0.35; PC.rollEndT = game.time;
          ECHO.Combat.burst(pe.x, pe.y, '#9fd3ff', 14, 3, 0.4, 2);
        } else {
          PC.dodgeT = PC.ROLL; PC.dodgeDir = dir; pe.iframes = 0.3; pe.rollT = PC.ROLL; pe.rollDur = PC.ROLL; pe.rollDir = dir; pe.dir = dir;
          ECHO.Combat.burst(pe.x, pe.y + 0.2, '#b8a888', 6, 1.5, 0.4, 2);
        }
      }
      if (pe.rollT) pe.rollT = Math.max(0, pe.rollT - dt);

      // ---- Melee: a three-strike combo (the third is a spinning finisher),
      // or hold the button for a heavy, guard-breaking blow.
      const canSwing = () => !game.ui.blocksWorld() && pe.cd <= 0 && pl.stamina >= 4 && PC.dodgeT <= 0 && pe.stagger <= 0 && !PC.drawing && !PC.charging;
      if (In.mpressed[0] && !game.ui.blocksWorld()) { PC.atkBuf = 0.22; PC.holdT = 0; }
      PC.atkBuf = Math.max(0, (PC.atkBuf || 0) - dt);
      PC.comboT = (PC.comboT || 0) + dt;
      if (PC.atkBuf > 0 && canSwing()) {
        PC.atkBuf = 0;
        PC.combo = PC.comboT < 0.75 ? ((PC.combo || 0) + 1) % 3 : 0;
        PC.comboT = 0;
        PC.swing(game, aim, D, PC.combo === 2 ? 'finisher' : 'combo');
      }
      // charge a heavy blow by holding
      if (In.mdown[0] && !game.ui.blocksWorld() && PC.dodgeT <= 0) {
        PC.holdT = (PC.holdT || 0) + dt;
        if (PC.holdT > 0.28 && !PC.heavyHold && pl.stamina >= 22) { PC.heavyHold = true; ECHO.Sfx.play('fireCharge', { vol: 0.5 }); }
        if (PC.heavyHold && Math.random() < dt * 25) ECHO.Combat.fx.push({ kind: 'p', x: pe.x + Math.cos(aim) * 0.4, y: pe.y + Math.sin(aim) * 0.4, vx: (Math.random() - 0.5), vy: (Math.random() - 0.5), t: 0, life: 0.25, color: PC.holdT > 0.75 ? '#fff2b0' : '#c8c0a8', size: 2 });
      }
      if (!In.mdown[0]) {
        if (PC.heavyHold && PC.holdT >= 0.75 && pe.stagger <= 0 && PC.dodgeT <= 0) {
          const W0 = ECHO.Gear && ECHO.Gear.wclass(world.items[pl.weapon]);
          if (W0 === ECHO.Gear.WCLASS.staff && pl.mana >= 14) PC.staffBolt(game, aim, D);
          else { pe.cd = 0; PC.swing(game, aim, D, 'heavy'); }
          PC.combo = 0;
        }
        PC.heavyHold = false; PC.holdT = 0;
      }
      if (PC.lungeT > 0) {
        PC.lungeT -= dt;
        ECHO.Ent.move(world, pe, Math.cos(PC.lungeDir) * PC.lungeSpd * dt, Math.sin(PC.lungeDir) * PC.lungeSpd * dt);
      }

      // ---- Bow (right mouse: hold to draw, release to loose; release just
      // as it reaches full draw for a perfect shot)
      const bow = world.items[pl.bow];
      if (In.mpressed[2] && !game.ui.blocksWorld() && bow && pl.inv.arrows > 0 && PC.dodgeT <= 0) { PC.drawing = true; PC.draw = 0; PC.fullT = -1; ECHO.Sfx.play('bowDraw'); }
      if (PC.drawing) {
        const was = PC.draw;
        PC.draw = Math.min(1, PC.draw + dt / D.drawTime);
        if (was < 1 && PC.draw >= 1) PC.fullT = 0;
        if (PC.fullT >= 0) PC.fullT += dt;
        if (!In.mdown[2]) {
          PC.drawing = false;
          if (PC.draw > 0.15 && pl.inv.arrows > 0) {
            pl.inv.arrows--;
            const perfect = PC.fullT >= 0 && PC.fullT < 0.2;
            const power = 0.35 + 0.65 * PC.draw;
            const spread = perfect ? 0 : (1 - PC.draw) * 0.12;
            const target = PC.assist(game, aim, 9, 0.18);
            const a2 = target ? Math.atan2(target.y - pe.y, target.x - pe.x) : aim;
            const p = ECHO.Combat.shoot(pe, a2 + (Math.random() - 0.5) * spread, { kind: 'arrow', speed: (11 + 9 * PC.draw) * (perfect ? 1.25 : 1), dmg: D.bowDmg * power * (perfect ? 1.35 : 1), life: 1.2, type: 'ranged' });
            p.crit = perfect;
            if (ECHO.Fest && ECHO.Fest.contest) p.contest = true;
            const twins = perfect && !p.contest ? ECHO.Tech.v('twinshot') : 0;
            for (let k = 1; k <= twins; k++) {
              const side = k % 2 ? 1 : -1, off = side * 0.11 * Math.ceil(k / 2);
              const q = ECHO.Combat.shoot(pe, a2 + off, { kind: 'arrow', speed: (11 + 9 * PC.draw) * 1.2, dmg: D.bowDmg * power * (ECHO.Tech.level('twinshot') >= 3 ? 1.3 : 0.75), life: 1.1, type: 'ranged' });
              q.crit = ECHO.Tech.level('twinshot') >= 3;
            }
            ECHO.Sfx.play('bowRelease');
            if (perfect) { ECHO.Sfx.play('perfect'); ECHO.Combat.floater(pe.x, pe.y - 1.1, 'perfect', '#fff2b0'); Ch().train(pl, 'archery', 0.1); }
            game.kick(a2 + Math.PI, 0.08);
            Ch().train(pl, 'archery', 0.05);
            game.noise(pe.x, pe.y, 2.5);
          }
          PC.draw = 0;
        }
      }

      // ---- Flame (Q: hold to overcast)
      if (In.hit('q') && !game.ui.blocksWorld() && PC.dodgeT <= 0) { PC.charging = true; PC.charge = 0; ECHO.Sfx.play('fireCharge'); }
      if (PC.charging) {
        const was = PC.charge;
        PC.charge = Math.min(1.25, PC.charge + dt * 0.9);
        if (was <= 1 && PC.charge > 1) { ECHO.Combat.floater(pe.x, pe.y - 1.1, 'overcharged — unstable!', '#ff5a1f'); ECHO.Sfx.play('fireCharge', { pitch: 1.4 }); }
        if (Math.random() < dt * 20) ECHO.Combat.fx.push({ kind: 'p', x: pe.x + Math.cos(aim) * 0.5, y: pe.y - 0.3 + Math.sin(aim) * 0.5, vx: (Math.random() - 0.5), vy: -0.8, t: 0, life: 0.3, color: pl.spells.includes('starfire') ? '#bfe3ff' : '#ffb347', size: 2 });
        game.light(pe.x, pe.y, 2 + PC.charge * 2, 0.08, '#ff9a3c');
        if (!In.key('q')) { PC.charging = false; PC.castFlame(game, aim, D); }
      }

      // ---- Study (F)
      if (In.key('f') && !game.ui.blocksWorld()) {
        const tgt = PC.studyCandidate(game, mouse);
        if (tgt) {
          if (PC.studyTarget !== tgt) { PC.studyTarget = tgt; PC.studyT = 0; }
          PC.studyT += dt;
          if (PC.studyT >= 1.6) { PC.completeStudy(game, tgt); PC.studyT = 0; PC.studyTarget = null; game.studyCooldown = 0.5; }
        } else { PC.studyT = 0; PC.studyTarget = null; }
      } else { PC.studyT = 0; PC.studyTarget = null; }

      // ---- Eat / herbs
      if (In.hit('v') && ECHO.Life) ECHO.Life.mount(game);
      if (In.hit('h')) PC.eat(game);
      if (In.hit('g')) PC.useHerbs(game);
      for (const [id, P0] of Object.entries(ECHO.Gear.POTIONS)) if (In.hit(P0.key)) PC.drink(game, id);
      if (pl.buffs) for (const k in pl.buffs) if (pl.buffs[k] > 0) { pl.buffs[k] -= dt; if (pl.buffs[k] <= 0) { pl.buffs[k] = 0; PC.derivedT = 0; ECHO.Combat.floater(pe.x, pe.y - 1.3, `${ECHO.Gear.POTIONS[k].name} wears off`, '#c8c0b0'); } }

      // ---- Regeneration
      if (!pe.blocking && PC.dodgeT <= 0 && pe.cd <= 0.05) pl.stamina = Math.min(pl.maxSta, pl.stamina + (26 + pl.skills.endurance * 0.15) * dt * (D.wellfed ? 1.4 : 1));
      if (pe.blocking) pl.stamina = Math.max(0, pl.stamina - 3 * dt * D.blockMul);
      pl.mana = Math.min(pl.maxMana, pl.mana + (2.6 + pl.skills.flame / 40) * dt);
      if (game.time - (game.lastHurtTime || -99) > 8 && !pl.sick) pl.hp = Math.min(pl.maxHp, pl.hp + 0.5 * dt);
      pe.hp = pl.hp; pe.maxHp = pl.maxHp;
    },

    // ---- Target lock
    lockable(game, e) {
      return e && !e.dead && !e.vanish && !e.hidden && !e.ghost && e !== game.pe && !e.isCompanion &&
        (e.type === 'boss' || (e.type === 'creature' && e.species !== 'hare') || game.hostileTo(game.pe, e));
    },
    lockValid(game, e) {
      return PC.lockable(game, e) && game.ents.includes(e) && U.dist(e.x, e.y, game.pe.x, game.pe.y) < 18;
    },
    // Best target: what the cursor is on, else the nearest threat.
    findTarget(game, x, y, range, mouse) {
      const pe = game.pe;
      let best = null, bs = Infinity;
      for (const e of game.ents) {
        if (!PC.lockable(game, e)) continue;
        const d = U.dist(e.x, e.y, pe.x, pe.y);
        if (d > range) continue;
        let sc = U.dist(e.x, e.y, x, y);
        if (mouse) sc = Math.min(sc, U.dist(e.x, e.y, mouse.x, mouse.y) * 0.6 + d * 0.15);
        if (e.type === 'boss') sc -= 2;
        if (sc < bs) { bs = sc; best = e; }
      }
      return best;
    },
    acquire(game, mouse) {
      const t = PC.findTarget(game, game.pe.x, game.pe.y, 14, mouse);
      if (!t) { ECHO.Combat.floater(game.pe.x, game.pe.y - 1.1, 'no target', '#c8c0a8'); return; }
      PC.lock = t;
      ECHO.Sfx.play('block', { pitch: 1.6, vol: 0.35 });
    },
    unlock(game, manual) {
      if (PC.lock || manual) ECHO.Sfx.play('dodge', { pitch: 1.4, vol: 0.3 });
      PC.lock = null;
    },

    // Soft aim-assist: the nearest foe within a cone around where you aim.
    assist(game, aim, range, cone) {
      const pe = game.pe;
      let best = null, bs = Infinity;
      for (const e of game.ents) {
        if (e.dead || e.hidden || e === pe || e.isCompanion || !game.hostileTo(pe, e)) continue;
        const d = U.dist(e.x, e.y, pe.x, pe.y);
        if (d > range) continue;
        const da = Math.abs(U.angleDiff(aim, Math.atan2(e.y - pe.y, e.x - pe.x)));
        if (da > cone * Math.PI) continue;
        const sc = d + da * 3;
        if (sc < bs) { bs = sc; best = e; }
      }
      return best;
    },
    // A staff's held blow: a bolt of raw power instead of a swing.
    staffBolt(game, aim, D) {
      const pe = game.pe, pl = game.pl;
      pl.mana -= 14; pe.cd = 0.9;
      const tgt = PC.assist(game, aim, 10, 0.25);
      const a = tgt ? Math.atan2(tgt.y - pe.y, tgt.x - pe.x) : aim;
      ECHO.Combat.shoot(pe, a, { kind: 'orb', speed: 12, dmg: D.flameDmg * 1.05, life: 1.1, type: 'magic', color: '#c8a8ff' });
      pe.attackT = 0.25; pe.attackDur = 0.25; pe.attackAngle = a; pe.attackKind = 'fore';
      ECHO.Combat.burst(pe.x + Math.cos(a) * 0.6, pe.y - 0.3 + Math.sin(a) * 0.6, '#c8a8ff', 10, 3, 0.4, 2);
      ECHO.Sfx.play('fireRelease', { pitch: 1.4 });
      ECHO.Character.train(pl, 'flame', 0.1);
    },
    drink(game, id) {
      const pl = game.pl, pe = game.pe, P0 = ECHO.Gear.POTIONS[id];
      pl.potions = pl.potions || {};
      if (!(pl.potions[id] > 0)) return ECHO.Combat.floater(pe.x, pe.y - 1.2, `no ${P0.name.toLowerCase()}`, '#c8c0b0');
      pl.potions[id]--;
      pl.buffs = pl.buffs || {};
      if (id === 'heal') { const amt = Math.round(pl.maxHp * 0.6); pl.hp = Math.min(pl.maxHp, pl.hp + amt); pe.hp = pl.hp; ECHO.Combat.floater(pe.x, pe.y - 1.3, `+${amt}`, '#7aff8a', true); }
      else { pl.buffs[id] = id === 'ward' ? 90 : 60; PC.derivedT = 0; ECHO.Combat.floater(pe.x, pe.y - 1.3, P0.name, P0.color, true); }
      ECHO.Combat.burst(pe.x, pe.y, P0.color, 14, 2, 0.6, 2);
      ECHO.Sfx.play('coin', { pitch: 1.6 });
    },
    swing(game, aim, D, kind) {
      const pe = game.pe, pl = game.pl, world = game.world;
      const Tc = ECHO.Tech;
      // Techniques found in battle reshape the blow.
      if (pe.blocking && Tc.level('bash') && kind !== 'heavy') kind = 'bash';
      const foesNear = game.ents.filter(e => !e.dead && e !== pe && game.hostileTo(pe, e) && U.dist(e.x, e.y, pe.x, pe.y) < 2.6).length;
      if (kind === 'heavy' && Tc.level('whirlwind') && foesNear >= 2) kind = 'whirlwind';
      const lunge = kind !== 'bash' && Tc.level('lunge') && PC.rollEndT != null && game.time - PC.rollEndT < 0.4;
      const riposte = Tc.level('riposte') && Tc.riposteT > 0;
      if (riposte) Tc.riposteT = 0;
      const SPEC = Object.assign({}, {
        combo: { dmg: 1, arc: 1.9, range: 0, knock: 0.24, cd: 0.8, sta: 1, stagger: 0, stop: 0.055, sfx: 'swing' },
        finisher: { dmg: 1.6, arc: Math.PI * 1.9, range: 0.3, knock: 0.5, cd: 1.55, sta: 1.35, stagger: 0.45, stop: 0.09, sfx: 'swingHeavy' },
        heavy: { dmg: 2.4, arc: 2.5, range: 0.4, knock: 0.7, cd: 1.6, sta: 2.4, stagger: 0.85, stop: 0.13, sfx: 'swingHeavy', guardbreak: true },
        whirlwind: { dmg: 2.1 * Tc.v('whirlwind'), arc: Math.PI * 2, range: 0.9, knock: 0.8, cd: 1.7, sta: 2.4, stagger: 0.7, stop: 0.13, sfx: 'swingHeavy', guardbreak: true },
        bash: { dmg: 0.45, arc: 1.7, range: -0.15, knock: 0.6, cd: 1.1, sta: 1.3, stagger: Tc.v('bash'), stop: 0.09, sfx: 'shieldBlock', guardbreak: true }
      }[kind]);
      if (lunge) { SPEC.dmg *= Tc.v('lunge'); SPEC.range += 1.1; }
      const WCn = ECHO.Gear && ECHO.Gear.wclass(world.items[pl.weapon]);
      if (WCn) {
        SPEC.arc = Math.min(Math.PI * 1.95, SPEC.arc * WCn.arc); SPEC.stagger += WCn.stagger || 0;
        if (WCn === ECHO.Gear.WCLASS.spear && (kind === 'finisher' || kind === 'heavy')) { SPEC.arc = 0.8; SPEC.range += 1.2; }
        if (WCn === ECHO.Gear.WCLASS.axe && kind === 'finisher') SPEC.dmg *= 1.15;
      }
      if (riposte) { SPEC.stagger = Math.max(SPEC.stagger, 0.7); SPEC.guardbreak = true; }
      // lock on to the foe you are facing, and step into the blow
      const tgt = PC.assist(game, aim, D.meleeRange + 1.6, 0.33);
      if (tgt) aim = Math.atan2(tgt.y - pe.y, tgt.x - pe.x);
      const gap = tgt ? U.dist(tgt.x, tgt.y, pe.x, pe.y) - tgt.r - pe.r : 1;
      PC.lungeDir = aim; PC.lungeT = lunge ? 0.18 : 0.1; PC.lungeSpd = lunge ? 15 : kind === 'heavy' ? 7 : U.clamp(gap * 9, 1.5, 6);
      if (lunge) { PC.rollEndT = null; ECHO.Combat.floater(pe.x, pe.y - 1.2, 'lunge', '#ffe8c0'); }
      if (riposte) ECHO.Combat.sparks(pe.x + Math.cos(aim) * 0.6, pe.y - 0.3 + Math.sin(aim) * 0.6, aim, '#fff6c8', 14, 7);
      pe.dir = aim; pe.flip = Math.cos(aim) < 0;
      pe.cd = D.meleeCd * SPEC.cd;
      pl.stamina -= D.meleeStam * SPEC.sta;
      pe.attackT = kind === 'combo' ? 0.2 : 0.3; pe.attackDur = pe.attackT; pe.attackAngle = aim;
      pe.attackKind = kind === 'combo' ? (PC.combo === 1 ? 'back' : 'fore') : kind === 'whirlwind' ? 'finisher' : kind === 'bash' ? 'fore' : kind;
      const weapon = world.items[pl.weapon];
      let stealth = false;
      for (const e of game.ents) {
        if (e.type !== 'person' || e.dead || !game.hostileTo(pe, e)) continue;
        if (U.dist(e.x, e.y, pe.x, pe.y) > 1.8) continue;
        if (e.sleeping || (PC.sneaking && e.state !== 'chase' && e.state !== 'attack' && e.state !== 'alert')) stealth = true;
      }
      ECHO.Sfx.play(SPEC.sfx, { pitch: kind === 'combo' ? (PC.combo === 1 ? 1.15 : 1) : 1 });
      const hits = ECHO.Combat.melee(pe, { angle: aim, arc: SPEC.arc, range: D.meleeRange + SPEC.range, dmg: D.meleeDmg * SPEC.dmg * (0.9 + Math.random() * 0.2), knock: SPEC.knock, stealth, stagger: SPEC.stagger, guardbreak: SPEC.guardbreak, heavy: kind !== 'combo', rocks: kind === 'heavy' || kind === 'whirlwind', riposte, finisher: kind === 'finisher' || kind === 'whirlwind' });
      if (hits.length && (kind === 'finisher' || kind === 'whirlwind')) Tc.record('finishers');
      const col = weapon && weapon.legend ? 'rgba(255,230,160,0.95)' : kind === 'heavy' ? 'rgba(255,240,200,0.95)' : 'rgba(255,255,255,0.85)';
      ECHO.Combat.slash(pe.x, pe.y, aim, D.meleeRange + SPEC.range + 0.2, Math.min(SPEC.arc, Math.PI * 1.95), riposte ? 'rgba(255,240,170,0.98)' : col, kind === 'whirlwind' ? 'finisher' : kind === 'bash' ? 'combo' : kind);
      if (kind === 'whirlwind') { ECHO.Combat.ring(pe.x, pe.y, D.meleeRange + SPEC.range, 'rgba(255,230,180,0.85)', 0.4); game.shake(0.3); }
      if (kind === 'heavy') { ECHO.Combat.ring(pe.x + Math.cos(aim) * 1.1, pe.y + Math.sin(aim) * 1.1, 1.6, 'rgba(255,230,180,0.8)', 0.35); game.shake(0.35); }
      Ch().behave(pl, 'aggression', kind === 'combo' ? 0.012 : 0.03);
      if (hits.length) {
        game.hitStop(SPEC.stop + (stealth ? 0.05 : 0));
        game.kick(aim, kind === 'combo' ? 0.1 : 0.2);
        if (kind !== 'combo') game.punch(kind === 'heavy' ? 1 : 0.6);
        Ch().train(pl, 'blade', 0.14 * hits.length);
        if (stealth) { Ch().train(pl, 'shadow', 0.5); Ch().behave(pl, 'night', 0.03); }
        if (weapon) weapon.hits = (weapon.hits || 0) + hits.length;
      }
      if (!(stealth && Tc.level('shadowstrike') >= 2)) game.noise(pe.x, pe.y, 5);
    },

    castFlame(game, aim, D) {
      const pl = game.pl, pe = game.pe;
      const charge = PC.charge;
      const cost = 14 + charge * 22;
      const over = charge > 1; // held past full: you asked for more than is safe
      let overdraw = 0;
      if (pl.mana >= cost) pl.mana -= cost;
      else if (!over || pl.hp <= pl.maxHp * 0.3) {
        // Not enough mana: the flame gutters out instead of eating you alive.
        if (pl.mana < 14) {
          ECHO.Combat.floater(pe.x, pe.y - 1, 'no mana', '#8fb4ff');
          ECHO.Combat.burst(pe.x + Math.cos(aim) * 0.5, pe.y + Math.sin(aim) * 0.5, '#6a6a6a', 6, 1.5, 0.4, 2);
          PC.charge = 0;
          return;
        }
        // ...or comes out as small as the mana you have
        PC.charge = Math.max(0, (pl.mana - 14) / 22 - 1e-6);
        return PC.castFlame(game, aim, D);
      } else {
        // Overcharged with too little mana: blood for fire, but never below a third of your life.
        overdraw = cost - pl.mana; pl.mana = 0;
        const bleed = Math.min(overdraw * 0.6, Math.max(0, pl.hp - pl.maxHp * 0.3));
        pl.hp -= bleed;
        ECHO.Combat.floater(pe.x, pe.y - 1, `blood for fire −${Math.round(bleed)}`, '#ff7b5a');
      }
      if (game.combatT != null && game.time - game.combatT < 8) ECHO.Tech.record('casts');
      if (pe.blocking && ECHO.Tech.level('flamering')) {
        // a ring of fire all around you — it never turns on its caster
        const R = ECHO.Tech.v('flamering');
        const p = ECHO.Combat.shoot(pe, 0, { kind: 'fire', speed: 0, dmg: D.flameDmg * (1.1 + charge * 0.6), radius: R, life: 0.01, type: 'fire', power: 1.2 });
        p.x = pe.x; p.y = pe.y; p.star = star(pl);
        ECHO.Combat.ring(pe.x, pe.y, R, 'rgba(255,150,60,0.9)', 0.45);
        Ch().train(pl, 'flame', 0.15);
        ECHO.Sfx.play('fireCast'); game.kick(aim + Math.PI, 0.05);
        PC.charge = 0;
        return;
      }
      if (charge > 0.6 || overdraw > 0) Ch().behave(pl, 'reckless', 0.1 + charge * 0.15 + (overdraw ? 0.25 : 0));
      Ch().train(pl, 'flame', 0.12 + charge * 0.1);
      ECHO.Civ.magicUsed(game.world, pe.x, pe.y, 0.25 + charge * 0.3);
      const star = pl.spells.includes('starfire');
      // Only an overcharged or blood-fed flame can turn; an ordinary cast is safe.
      const instab = star || (!over && !overdraw) ? 0 : D.flameInstab + (overdraw ? 0.28 : 0) + (charge - 1) * 0.3 + 0.08;
      const dmg = D.flameDmg * (1 + charge * 0.9) * (overdraw ? 1.3 : 1);
      const radius = 0.9 + charge * 0.9 + D.reck * 0.4;
      if (Math.random() < instab) {
        // The flame turns.
        if (Math.random() < 0.5) {
          ECHO.Combat.floater(pe.x, pe.y - 1.1, 'the flame turns on you!', '#ff5a1f', true);
          const p = ECHO.Combat.shoot(pe, aim, { kind: 'fire', speed: 0.1, dmg: dmg * 0.6, radius: radius * 0.8, life: 0.05, type: 'fire', power: 1 });
          p.backfire = true;
        } else {
          ECHO.Combat.floater(pe.x, pe.y - 1.1, 'wild flame', '#ff9a3c');
          ECHO.Combat.shoot(pe, aim + (Math.random() - 0.5) * 1.6, { kind: 'fire', speed: 9, dmg: dmg * 1.3, radius: radius * 1.3, life: 1.2, type: 'fire', power: 1.4 });
        }
      } else {
        const p = ECHO.Combat.shoot(pe, aim, { kind: 'fire', speed: 10, dmg, radius, life: 1.1, type: 'fire', power: 1 + charge });
        p.star = star;
      }
      game.noise(pe.x, pe.y, 7);
      // Some towns forbid fire within their walls.
      const town = !ECHO.Interior.cur && ECHO.World.settlementAt(game.world, pe.x, pe.y, 12);
      if (town && ECHO.Law.code(game.world, town).noFlame) {
        const c = ECHO.Court.record(game, 'flame', { s: town });
        if (c) { pl.wanted[town.faction] = Math.min(200, (pl.wanted[town.faction] || 0) + 25); game.ui.toast(`Fire is forbidden within the walls of ${town.name}. You were seen.`, 'warn', 4); }
      }
      ECHO.Sfx.play('fireCast');
      game.kick(aim + Math.PI, 0.1);
      PC.charge = 0;
    },

    studyCandidate(game, mouse) {
      let best = null, bd = 7;
      for (const e of game.ents) {
        if (e.dead || e.hidden || (e.type !== 'creature' && e.type !== 'boss') || e.humanoid || e.marvel) continue;
        const d = U.dist(e.x, e.y, game.pe.x, game.pe.y);
        const dm = U.dist(e.x, e.y, mouse.x, mouse.y);
        const score = d + dm * 0.5;
        if (d < 8 && score < bd) { bd = score; best = e; }
      }
      return best;
    },
    completeStudy(game, e) {
      const pl = game.pl, world = game.world;
      const key = e.type === 'boss' ? 'boss:' + e.boss.id : e.species;
      pl.studied[key] = (pl.studied[key] || 0) + 1;
      Ch().train(pl, 'study', 0.7);
      Ch().behave(pl, 'curiosity', 0.15);
      const n = pl.studied[key];
      ECHO.Combat.floater(e.x, e.y - 1, 'studied', '#9fe0c8');
      if (e.type === 'boss') {
        game.ui.toast(ECHO.Boss.readout(e), 'study', 9);
        return;
      }
      const region = world.regions[e.regionId] || ECHO.World.regionAt(world, e.x, e.y);
      const sp = ECHO.SPECIES[e.species];
      const tr = region && region.eco ? region.eco.traits[e.species] : null;
      const name = ECHO.Ecology.speciesName(world, region, e.species);
      let msg = `${name}: ${sp.desc}`;
      if (n === 1 || n % 3 === 0) {
        const notes = [];
        if (tr) {
          if (tr.fireRes > 0.15) notes.push(`fire catches poorly on them (${Math.round(tr.fireRes * 100)}%)`);
          if (tr.hide > 0.15) notes.push(`their hides turn blades (${Math.round(tr.hide * 70)}%)`);
          if (tr.speed > 0.15) notes.push('they flinch from arrows');
          if (tr.mutation) notes.push(ECHO.Ecology.MUTATIONS.find(m => m.key === tr.mutation).desc);
        }
        if (region && region.eco && pl.skills.study > 15) {
          const eco = region.eco;
          const cnt = e.species === 'gnawer' ? eco.gnawer : e.species === 'hare' ? eco.hare : eco.wolf;
          const K = ECHO.Ecology.capacity(region)[e.species];
          const load = cnt / K;
          notes.push(load > 0.8 ? `they are swarming in ${region.name}` : load < 0.25 ? `they are scarce in ${region.name}` : `their numbers in ${region.name} seem ordinary`);
          if (e.species === 'gnawer' && eco.crop < 0.7) notes.push(`the fields here are being eaten bare`);
        }
        notes.push(`you find their weak points more often (${Math.min(35, Math.round(n * 3.5))}%)`);
        msg += ' — ' + U.cap(notes.join('; ')) + '.';
      }
      game.ui.toast(msg, 'study', 7);
    },

    eat(game) {
      const pl = game.pl;
      if (pl.hp >= pl.maxHp) return;
      if (pl.inv.fish > 0) { pl.inv.fish--; pl.hp = Math.min(pl.maxHp, pl.hp + 24); game.ui.toast('You eat a grilled trout.', 'info', 2); }
      else if (pl.inv.meat > 0) { pl.inv.meat--; pl.hp = Math.min(pl.maxHp, pl.hp + 28); game.ui.toast('You eat roasted meat.', 'info', 2); }
      else if (pl.inv.food > 0) { pl.inv.food--; pl.hp = Math.min(pl.maxHp, pl.hp + 20); game.ui.toast('You eat some bread.', 'info', 2); }
      else game.ui.toast('You have nothing to eat.', 'warn', 2);
    },
    useHerbs(game) {
      const pl = game.pl;
      if (pl.inv.herbs > 0 && (pl.hp < pl.maxHp || pl.sick)) {
        pl.inv.herbs--; pl.hp = Math.min(pl.maxHp, pl.hp + 45); game.pe.burn = 0; ECHO.Combat.burst(game.pe.x, game.pe.y, '#7fd67f', 10, 2, 0.6, 2); ECHO.Sfx.play('heal');
        if (pl.sick && Math.random() < 0.45) { (pl.immune = pl.immune || []).push(pl.sick.d); delete pl.sick; game.ui.toast('The herbs break your fever.', 'mercy', 3); }
      }
      else if (!pl.inv.herbs) game.ui.toast('No herbs left.', 'warn', 2);
    }
  };
})();
