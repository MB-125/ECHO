// Player controller. No classes: what you do repeatedly trains skills and
// shapes tendencies, and tendencies change how your body actually fights.
(function () {
  const { U } = ECHO;
  const In = ECHO.Input;
  const Ch = () => ECHO.Character;

  const PC = ECHO.PlayerCtl = {
    derived: null, derivedT: 0, draw: 0, drawing: false, charge: 0, charging: false,
    dodgeT: 0, dodgeDir: 0, studyT: 0, studyTarget: null, eatT: 0, sneaking: false,

    reset() { PC.derived = null; PC.draw = 0; PC.drawing = false; PC.charge = 0; PC.charging = false; PC.dodgeT = 0; PC.studyT = 0; PC.studyTarget = null; },

    computeDerived(game) {
      const pl = game.pl;
      const t = k => Ch().tendency(pl, k);
      const aggr = t('aggression'), caution = t('caution'), reck = t('reckless');
      const weapon = game.world.items[pl.weapon];
      const bow = game.world.items[pl.bow];
      const wdmg = weapon ? weapon.dmg : 5;
      PC.derived = {
        aggr, caution, reck,
        meleeCd: 0.5 * (1 - 0.32 * aggr),
        meleeDmg: wdmg * (0.75 + pl.skills.blade / 70) * (1 + 0.28 * aggr),
        meleeRange: weapon ? 1.35 : 0.95,
        meleeStam: 11 * (1 - 0.2 * aggr),
        blockMul: 1 - 0.4 * caution,
        guardPenalty: aggr * 0.25,
        bowDmg: bow ? bow.dmg * (0.7 + pl.skills.archery / 65) : 0,
        drawTime: 0.75 * (1 - pl.skills.archery / 250),
        flameDmg: 19 * (0.8 + pl.skills.flame / 55) * (1 + 0.45 * reck) * (pl.spells.includes('starfire') ? 1.25 : 1),
        flameInstab: pl.spells.includes('starfire') ? 0 : reck * 0.2,
        speed: 4.3 * (1 + pl.skills.endurance / 260),
        maxHp: 100 + pl.skills.endurance * 0.6 + pl.skills.ward * 0.4,
        maxSta: 100 + pl.skills.endurance * 0.8,
        maxMana: 60 + pl.skills.flame * 1.2
      };
      pl.maxHp = PC.derived.maxHp; pl.maxSta = PC.derived.maxSta; pl.maxMana = PC.derived.maxMana;
    },

    update(game, dt) {
      const pe = game.pe, pl = game.pl, world = game.world;
      if (!pe || pe.dead) return;
      PC.derivedT -= dt;
      if (!PC.derived || PC.derivedT <= 0) { PC.computeDerived(game); PC.derivedT = 1; }
      const D = PC.derived;
      const mouse = game.screenToWorld(In.mx, In.my);
      const aim = Math.atan2(mouse.y - (pe.y - 0.3), mouse.x - pe.x);
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

      pe.blocking = In.key('Shift') && pl.stamina > 4 && PC.dodgeT <= 0 && !PC.drawing;
      if (In.hit('Shift')) game.blockStart = game.time;

      if (PC.dodgeT > 0) {
        PC.dodgeT -= dt;
        const sp = 10.5 * dt;
        ECHO.Ent.move(world, pe, Math.cos(PC.dodgeDir) * sp, Math.sin(PC.dodgeDir) * sp);
        if (Math.random() < 0.6) ECHO.Combat.fx.push({ kind: 'p', x: pe.x, y: pe.y + 0.2, vx: 0, vy: 0, t: 0, life: 0.3, color: 'rgba(200,190,170,0.6)', size: 2 });
      } else if (pe.stagger <= 0) {
        let sp = D.speed * ECHO.World.speedAt(world, pe.x, pe.y);
        if (pe.blocking) sp *= 0.45;
        if (PC.drawing) sp *= 0.55;
        if (PC.charging) sp *= 0.6;
        if (PC.sneaking) sp *= 0.5;
        if (PC.studyT > 0) sp *= 0.3;
        if (pl.stamina < 1 && len) sp *= 0.75;
        if (len) {
          ECHO.Ent.move(world, pe, mx * sp * dt, my * sp * dt);
          pe.moving = true;
          if (Math.random() < dt * 0.6) Ch().train(pl, 'endurance', 0.03);
        } else pe.moving = false;
      }
      // Face the mouse when fighting, otherwise movement.
      if (pe.blocking || PC.drawing || PC.charging || pe.cd > 0.1) pe.dir = aim;
      else if (len) pe.dir = Math.atan2(my, mx);
      pe.flip = Math.cos(pe.dir) < 0;

      // ---- Dodge
      if (In.hit(' ') && PC.dodgeT <= 0 && pl.stamina >= 16 && pe.stagger <= 0) {
        pl.stamina -= 18;
        const dir = len ? Math.atan2(my, mx) : aim + Math.PI;
        Ch().behave(pl, 'caution', 0.02);
        Ch().train(pl, 'endurance', 0.08);
        ECHO.Boss.noteDodge(game, dir);
        if (pl.spells.includes('echostep')) {
          // Blink: step through space, leaving an echo behind.
          ECHO.Combat.fx.push({ kind: 'echo', x: pe.x, y: pe.y, t: 0, life: 0.6, flip: pe.flip });
          let bx = pe.x, by = pe.y;
          for (let i = 0; i < 16; i++) {
            const nx = bx + Math.cos(dir) * 0.22, ny = by + Math.sin(dir) * 0.22;
            if (ECHO.World.isSolid(world, nx, ny)) break;
            bx = nx; by = ny;
          }
          pe.x = bx; pe.y = by; pe.iframes = 0.35;
          ECHO.Combat.burst(pe.x, pe.y, '#9fd3ff', 10, 3, 0.4, 2);
        } else {
          PC.dodgeT = 0.27; PC.dodgeDir = dir; pe.iframes = 0.26;
        }
      }

      // ---- Melee (left mouse)
      if (In.mpressed[0] && !game.ui.blocksWorld() && pe.cd <= 0 && pl.stamina >= 4 && PC.dodgeT <= 0 && pe.stagger <= 0) {
        pe.cd = D.meleeCd;
        pl.stamina -= D.meleeStam;
        pe.attackT = 0.18; pe.attackAngle = aim;
        const weapon = world.items[pl.weapon];
        // Sneak attacks on the sleeping or unaware.
        let stealth = false;
        for (const e of game.ents) {
          if (e.type !== 'person' || e.dead || !game.hostileTo(pe, e)) continue;
          if (U.dist(e.x, e.y, pe.x, pe.y) > 1.6) continue;
          if (e.sleeping || (PC.sneaking && e.state !== 'chase' && e.state !== 'attack' && e.state !== 'alert')) stealth = true;
        }
        const hits = ECHO.Combat.melee(pe, { angle: aim, arc: 1.9, range: D.meleeRange, dmg: D.meleeDmg * (0.9 + Math.random() * 0.2), knock: 0.14, stealth, rocks: false });
        ECHO.Combat.slash(pe.x, pe.y - 0.25, aim, D.meleeRange + 0.2, 1.9, weapon && weapon.legend ? 'rgba(255,230,160,0.9)' : 'rgba(255,255,255,0.85)');
        Ch().behave(pl, 'aggression', 0.012);
        if (hits.length) {
          Ch().train(pl, 'blade', 0.14 * hits.length);
          if (stealth) { Ch().train(pl, 'shadow', 0.5); Ch().behave(pl, 'night', 0.03); }
          if (weapon) weapon.hits = (weapon.hits || 0) + hits.length;
        }
        game.noise(pe.x, pe.y, 5);
      }

      // ---- Bow (right mouse: hold to draw, release to loose)
      const bow = world.items[pl.bow];
      if (In.mpressed[2] && !game.ui.blocksWorld() && bow && pl.inv.arrows > 0 && PC.dodgeT <= 0) { PC.drawing = true; PC.draw = 0; }
      if (PC.drawing) {
        PC.draw = Math.min(1, PC.draw + dt / D.drawTime);
        if (!In.mdown[2]) {
          PC.drawing = false;
          if (PC.draw > 0.15 && pl.inv.arrows > 0) {
            pl.inv.arrows--;
            const power = 0.35 + 0.65 * PC.draw;
            const spread = (1 - PC.draw) * 0.12;
            ECHO.Combat.shoot(pe, aim + (Math.random() - 0.5) * spread, { kind: 'arrow', speed: 11 + 9 * PC.draw, dmg: D.bowDmg * power, life: 1.2, type: 'ranged' });
            Ch().train(pl, 'archery', 0.05);
            game.noise(pe.x, pe.y, 2.5);
          }
          PC.draw = 0;
        }
      }

      // ---- Flame (Q: hold to overcast)
      if (In.hit('q') && !game.ui.blocksWorld() && PC.dodgeT <= 0) { PC.charging = true; PC.charge = 0; }
      if (PC.charging) {
        PC.charge = Math.min(1.25, PC.charge + dt * 0.9);
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
      if (In.hit('h')) PC.eat(game);
      if (In.hit('g')) PC.useHerbs(game);

      // ---- Regeneration
      if (!pe.blocking && PC.dodgeT <= 0 && pe.cd <= 0.05) pl.stamina = Math.min(pl.maxSta, pl.stamina + (26 + pl.skills.endurance * 0.15) * dt);
      if (pe.blocking) pl.stamina = Math.max(0, pl.stamina - 3 * dt * D.blockMul);
      pl.mana = Math.min(pl.maxMana, pl.mana + (2.6 + pl.skills.flame / 40) * dt);
      if (game.time - (game.lastHurtTime || -99) > 8) pl.hp = Math.min(pl.maxHp, pl.hp + 0.5 * dt);
      pe.hp = pl.hp; pe.maxHp = pl.maxHp;
    },

    castFlame(game, aim, D) {
      const pl = game.pl, pe = game.pe;
      const charge = PC.charge;
      const cost = 14 + charge * 22;
      let overdraw = 0;
      if (pl.mana >= cost) pl.mana -= cost;
      else {
        overdraw = cost - pl.mana; pl.mana = 0;
        pl.hp -= overdraw * 0.6;
        ECHO.Combat.floater(pe.x, pe.y - 1, 'blood for fire', '#ff7b5a');
        if (pl.hp <= 1) { pl.hp = 1; }
      }
      if (charge > 0.6 || overdraw > 0) Ch().behave(pl, 'reckless', 0.1 + charge * 0.15 + (overdraw ? 0.25 : 0));
      Ch().train(pl, 'flame', 0.12 + charge * 0.1);
      ECHO.Civ.magicUsed(game.world, pe.x, pe.y, 0.25 + charge * 0.3);
      const star = pl.spells.includes('starfire');
      const instab = star ? 0 : D.flameInstab + (overdraw ? 0.28 : 0) + Math.max(0, charge - 1) * 0.3;
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
      PC.charge = 0;
    },

    studyCandidate(game, mouse) {
      let best = null, bd = 7;
      for (const e of game.ents) {
        if (e.dead || e.hidden || (e.type !== 'creature' && e.type !== 'boss')) continue;
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
      if (pl.inv.meat > 0) { pl.inv.meat--; pl.hp = Math.min(pl.maxHp, pl.hp + 28); game.ui.toast('You eat roasted meat.', 'info', 2); }
      else if (pl.inv.food > 0) { pl.inv.food--; pl.hp = Math.min(pl.maxHp, pl.hp + 20); game.ui.toast('You eat some bread.', 'info', 2); }
      else game.ui.toast('You have nothing to eat.', 'warn', 2);
    },
    useHerbs(game) {
      const pl = game.pl;
      if (pl.inv.herbs > 0 && pl.hp < pl.maxHp) { pl.inv.herbs--; pl.hp = Math.min(pl.maxHp, pl.hp + 45); game.pe.burn = 0; ECHO.Combat.burst(game.pe.x, game.pe.y, '#7fd67f', 10, 2, 0.6, 2); }
      else if (!pl.inv.herbs) game.ui.toast('No herbs left.', 'warn', 2);
    }
  };
})();
