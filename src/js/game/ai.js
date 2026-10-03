// AI for creatures and people near the player.
// People follow daily routines tied to their profession and home; fighters
// use whatever their faction has learned (shields, skirmishing, night watch).
(function () {
  const { U } = ECHO;
  const G = () => ECHO.Game;
  const SP = ECHO.SPECIES;

  // ------------------------------------------------------------ Targets
  function findTarget(game, e, sight) {
    let best = null, bd = sight;
    for (const o of game.ents) {
      if (o === e || o.dead || o.hidden || o.ghost) continue;
      if (!game.hostileTo(e, o)) continue;
      if (o.type === 'creature' && o.species === 'hare') continue;
      let d = U.dist(e.x, e.y, o.x, o.y);
      let s = sight;
      if (o === game.pe) {
        if (game.pe.sneaking) s *= 0.55;
        s *= 1 - game.pl.skills.shadow / 260;
        if (o.blocking) s *= 1;
      }
      if (d > s || d >= bd) continue;
      if (d > 2 && !ECHO.Ent.lineOfSight(game.world, e.x, e.y, o.x, o.y)) continue;
      best = o; bd = d;
    }
    return best;
  }

  function sightFor(game, e, base) {
    const night = game.isNight();
    let s = base;
    if (night) {
      s *= e.type === 'creature' && e.species === 'wolf' ? 1.25 : 0.55;
      if (e.type === 'person' && (e.gear.torch || ECHO.Intel.has(game.world, e.faction, 'nightwatch'))) s = base * 0.95;
      if (game.pe && U.dist(e.x, e.y, game.pe.x, game.pe.y) < 4 && game.pl.lanternOn) s = Math.max(s, 5);
    }
    if (e.mutation === 'paleshade') s *= 1.1;
    return s;
  }

  // ------------------------------------------------------------ Creatures
  const Creature = {
    update(game, e, dt) {
      const world = game.world;
      const sp = SP[e.species];
      e.cd = Math.max(0, e.cd - dt);
      e.t += dt;
      if (e.stagger > 0) { e.stagger -= dt; return; }
      const speed = e.speed * (1 + (e.traits ? e.traits.speed * 0.4 : 0)) * (game.isNight() && e.species === 'wolf' ? 1.1 : 1);
      if (e.species === 'hare') return Creature.hare(game, e, dt, speed);
      const target = (e.target && !e.target.dead && U.dist(e.x, e.y, e.target.x, e.target.y) < 14) ? e.target : findTarget(game, e, sightFor(game, e, sp.sight) * (e.aggro ? 1.6 : 1));
      e.target = target;
      if (e.species === 'gnawer') return Creature.gnawer(game, e, dt, speed, target);
      if (e.species === 'wolf') return Creature.wolf(game, e, dt, speed, target);
    },
    wander(game, e, dt, speed) {
      if (!e.wt || e.t > e.wt) {
        e.wt = e.t + 1.5 + Math.random() * 3;
        const a = Math.random() * Math.PI * 2;
        e.wx = e.x + Math.cos(a) * 3; e.wy = e.y + Math.sin(a) * 3;
        if (e.home) { e.wx = U.lerp(e.wx, e.home.x, 0.3); e.wy = U.lerp(e.wy, e.home.y, 0.3); }
        e.idle = Math.random() < 0.4;
      }
      if (!e.idle) ECHO.Ent.seek(game.world, e, e.wx, e.wy, speed * 0.4, dt, 0.3);
      else e.moving = false;
    },
    hare(game, e, dt, speed) {
      const threat = game.ents.find(o => !o.dead && !o.hidden && (o === game.pe || o.type === 'person' || (o.type === 'creature' && o.species === 'wolf')) && U.dist(o.x, o.y, e.x, e.y) < (o === game.pe && game.pe.sneaking ? 2.5 : 5));
      if (threat || e.state === 'flee') {
        if (threat) e.fleeFrom = { x: threat.x, y: threat.y };
        e.state = 'flee';
        const a = Math.atan2(e.y - e.fleeFrom.y, e.x - e.fleeFrom.x) + Math.sin(e.t * 5) * 0.4;
        ECHO.Ent.seek(game.world, e, e.x + Math.cos(a) * 2, e.y + Math.sin(a) * 2, speed, dt, 0.1);
        if (!threat && U.dist(e.x, e.y, e.fleeFrom.x, e.fleeFrom.y) > 9) e.state = 'idle';
      } else Creature.wander(game, e, dt, speed);
    },
    gnawer(game, e, dt, speed, target) {
      const friends = game.ents.filter(o => o.species === 'gnawer' && !o.dead && U.dist(o.x, o.y, e.x, e.y) < 4).length;
      const bold = e.aggro || friends >= 3;
      if (e.hp < e.maxHp * 0.35 && friends < 4) {
        if (target) { const a = Math.atan2(e.y - target.y, e.x - target.x); ECHO.Ent.seek(game.world, e, e.x + Math.cos(a) * 2, e.y + Math.sin(a) * 2, speed, dt); }
        return;
      }
      if (target && bold) {
        const d = U.dist(e.x, e.y, target.x, target.y);
        if (d > target.r + e.r + 0.2) ECHO.Ent.seek(game.world, e, target.x, target.y, speed, dt, 0.2);
        else if (e.cd <= 0) {
          e.cd = 0.9 + Math.random() * 0.3; e.attackT = 0.15;
          e.dir = Math.atan2(target.y - e.y, target.x - e.x);
          const dmg = SP.gnawer.dmg * (e.mutation === 'twinjaw' ? 2 : 1);
          ECHO.Combat.damage(target, dmg, { type: 'melee', from: e, angle: e.dir, knock: 0.04 });
          if (e.mutation === 'emberfur' && !target.dead) target.burn = Math.max(target.burn, 1.5);
        }
      } else Creature.wander(game, e, dt, speed);
    },
    wolf(game, e, dt, speed, target) {
      const world = game.world;
      if (!target) { e.state = 'roam'; return Creature.wander(game, e, dt, speed); }
      if (e.mutation === 'hollowsong' && !e.howled) {
        e.howled = true;
        e.say = 'Aooooo…'; e.sayT = 2;
        ECHO.Spawner.reinforceWolves(game, e, 2);
      }
      const pack = game.ents.filter(o => o.species === 'wolf' && !o.dead && o.target === target).length;
      if (e.hp < e.maxHp * 0.25 && pack < 3 && e.state !== 'lunge') e.state = 'flee';
      const d = U.dist(e.x, e.y, target.x, target.y);
      const ang = Math.atan2(target.y - e.y, target.x - e.x);
      switch (e.state) {
        case 'flee': {
          ECHO.Ent.seek(world, e, e.x - Math.cos(ang) * 3, e.y - Math.sin(ang) * 3, speed * 1.1, dt);
          if (d > 12) { e.state = 'roam'; e.target = null; }
          break;
        }
        case 'windup': {
          e.dir = e.lungeAngle; e.flip = Math.cos(e.dir) < 0;
          if (e.t > e.windEnd) { e.state = 'lunge'; e.t = 0; e.lungeHit = false; }
          break;
        }
        case 'lunge': {
          const sp = 9.5 * dt;
          ECHO.Ent.move(world, e, Math.cos(e.lungeAngle) * sp, Math.sin(e.lungeAngle) * sp);
          if (!e.lungeHit && U.dist(e.x, e.y, target.x, target.y) < e.r + target.r + 0.25) {
            e.lungeHit = true;
            const dmg = SP.wolf.dmg * (e.mutation === 'twinjaw' ? 1.8 : 1) * (game.isNight() ? 1.15 : 1) * (e.traits ? 1 + e.traits.hide * 0.2 : 1);
            ECHO.Combat.damage(target, dmg, { type: 'melee', from: e, angle: e.lungeAngle, knock: 0.2 });
            if (e.mutation === 'emberfur' && !target.dead) target.burn = Math.max(target.burn, 2);
          }
          if (e.t > (e.lungeDur || 0.3) || e.lungeHit) { e.state = 'retreat'; e.t = 0; }
          break;
        }
        case 'retreat': {
          const a = ang + Math.PI + (e.circleDir || 1) * 0.9;
          ECHO.Ent.seek(world, e, e.x + Math.cos(a) * 2, e.y + Math.sin(a) * 2, speed * 0.9, dt);
          if (e.t > 0.7) { e.state = 'stalk'; e.t = 0; }
          break;
        }
        default: {
          // Stalk: circle at a distance, then commit.
          e.circleDir = e.circleDir || (Math.random() < 0.5 ? 1 : -1);
          const want = 2.4;
          const tx = target.x - Math.cos(ang + e.circleDir * 0.6) * want, ty = target.y - Math.sin(ang + e.circleDir * 0.6) * want;
          if ((e.stuck || 0) > 0.4 || d > 7) ECHO.Ent.travel(world, e, target.x, target.y, speed, dt);
          else ECHO.Ent.seek(world, e, tx, ty, speed * (d > 6 ? 1 : 0.75), dt, 0.3);
          e.state = 'stalk';
          if (d < 3.4 && e.cd <= 0 && Math.random() < dt * 2.2 && ECHO.Ent.lineOfSight(world, e.x, e.y, target.x, target.y)) {
            e.state = 'windup'; e.t = 0; e.windEnd = 0.38 - (pack > 2 ? 0.08 : 0);
            e.lungeAngle = Math.atan2(target.y - e.y, target.x - e.x);
            e.lungeDur = Math.min(0.42, (d + 0.4) / 9.5);
            e.cd = 1.6 + Math.random();
            ECHO.Combat.telegraph({ x: e.x, y: e.y, angle: e.lungeAngle, len: 3.2, width: 0.6, life: e.windEnd, shape: 'line', color: 'rgba(255,80,60,0.35)' });
          }
        }
      }
    }
  };

  // ------------------------------------------------------------ Schedules
  const Sched = {
    houseOf(game, s, npc) {
      const houses = s.buildings.filter(b => b.type === 'house');
      if (!houses.length) return null;
      return houses[ECHO.hashStr(npc.last + npc.home) % houses.length];
    },
    door(b) { return { x: b.x + b.w / 2, y: b.y + b.h + 0.4 }; },
    building(s, type) { return s.buildings.find(b => b.type === type); },
    target(game, e, npc, minute) {
      const world = game.world;
      const s = ECHO.Sim.settlement(world, npc.loc);
      if (!s) return null;
      const hour = minute / 60;
      const h = ECHO.hashStr(npc.id);
      const house = Sched.houseOf(game, s, npc);
      const rnd = (k) => ECHO.hash2(h, Math.floor(hour) + k, world.day);
      const around = (x, y, r) => ({ x: x + (rnd(1) - 0.5) * r * 2, y: y + (rnd(2) - 0.5) * r * 2 });
      const night = hour < 6 || hour >= 22;
      const guardNight = npc.prof === 'guard' && (h % 3 === 0 || ECHO.Civ.has(world, s.faction, 'lamps'));
      if (night && !guardNight) return house ? { ...Sched.door(house), inside: true } : around(s.x, s.y, 2);
      if (hour < 7.5 || (hour >= 18 && hour < 22)) {
        // Mornings and evenings: plaza, well, inn.
        const inn = Sched.building(s, 'inn');
        if (hour >= 18 && inn && rnd(3) < 0.5 && npc.prof !== 'child') return { ...Sched.door(inn), x: Sched.door(inn).x + (rnd(4) - 0.5) * 3 };
        return around(s.x, s.y + 1, 3.5);
      }
      const at = (type, r = 1.2) => { const b = Sched.building(s, type); if (!b) return around(s.x, s.y, 3); const d = Sched.door(b); return around(d.x, d.y + 0.4, r); };
      switch (npc.prof) {
        case 'farmer': {
          const a = (h % 628) / 100 + Math.floor(hour / 3) * 0.7;
          const d = 11 + (h % 5);
          return { x: s.x + Math.cos(a) * d, y: s.y + Math.sin(a) * d };
        }
        case 'hunter': case 'woodcutter': case 'herbalist': {
          const a = (h % 628) / 100 + Math.floor(hour / 2);
          return { x: s.x + Math.cos(a) * 17, y: s.y + Math.sin(a) * 17 };
        }
        case 'smith': return at('smithy', 0.8);
        case 'merchant': case 'reeve': return at('market', 1.5);
        case 'innkeeper': return at('inn', 0.6);
        case 'priest': return s.kind === 'temple' ? at('temple', 2) : at('shrine', 1);
        case 'scholar': case 'inventor': return at('archive', 1);
        case 'ruler': return s.kind === 'capital' ? at('keep', 1.5) : at('market', 1.5);
        case 'guard': {
          const a = (h % 628) / 100 + game.time * 0.02 + Math.floor(hour) * 1.3;
          const r = 6 + (h % 4);
          return { x: s.x + Math.cos(a) * r, y: s.y + Math.sin(a) * r };
        }
        case 'child': return around(s.x, s.y, 4);
        case 'elder': { const w = Sched.building(s, 'well'); return w ? around(w.x + 0.5, w.y + 1.5, 1.5) : around(s.x, s.y, 2); }
        case 'wanderer': return at('inn', 2);
        default: return around(s.x, s.y, 4);
      }
    }
  };

  // ------------------------------------------------------------ People
  const Person = {
    update(game, e, dt) {
      const world = game.world;
      const npc = world.npcs[e.npcId];
      if (!npc || npc.status === 'dead') { e.dead = true; e.vanish = true; return; }
      e.cd = Math.max(0, e.cd - dt);
      e.t += dt;
      e.sayT = Math.max(0, e.sayT - dt);
      if (e.stagger > 0) { e.stagger -= dt; e.state = 'stagger'; return; }
      if (e.state === 'stagger') e.state = 'idle';
      if (e.role === 'captive') { e.moving = false; return; }
      if (e.yielded) { e.moving = false; e.state = 'yield'; return; }

      // Sleeping outlaws (unless they have learned to keep watch)
      if (e.role === 'bandit' && game.isNight() && !ECHO.Intel.has(world, 'ashfang', 'nightwatch') && !e.aggro && e.state !== 'chase' && e.state !== 'attack' && !e.isGuardPost) {
        e.sleeping = true; e.moving = false;
        return;
      }
      e.sleeping = false;

      const fighter = e.role === 'bandit' || e.role === 'guard' || e.role === 'soldier' || e.role === 'companion' || (npc.prof === 'wanderer');
      const sight = sightFor(game, e, e.role === 'villager' ? 6 : 8.5) * (e.aggro ? 1.5 : 1);
      let target = e.target && !e.target.dead && !e.target.hidden && U.dist(e.x, e.y, e.target.x, e.target.y) < 16 && game.hostileTo(e, e.target) ? e.target : null;
      if (!target && (e.scanT = (e.scanT || 0) - dt) <= 0) { e.scanT = 0.25; target = findTarget(game, e, sight); }
      if (target && target !== e.target && fighter) Person.alertFriends(game, e, target);
      e.target = target;

      if (e.role === 'companion') return Person.companion(game, e, npc, dt, target);
      if (target) {
        if (!fighter || (ECHO.People.has(npc, 'cowardly') && e.hp < e.maxHp * 0.5) || npc.prof === 'child') return Person.flee(game, e, target, dt);
        // Yield when beaten (not everyone will)
        if (e.hp < e.maxHp * 0.22 && !e.triedYield && target === game.pe) {
          e.triedYield = true;
          const camp = npc.camp && world.camps.find(c => c.id === npc.camp);
          const isLeader = camp && camp.leader === npc.id;
          if (!isLeader && !ECHO.People.has(npc, 'cruel') && !ECHO.People.has(npc, 'brave') && Math.random() < 0.55) {
            e.yielded = true; e.aggro = false; e.target = null;
            e.say = 'Enough! I yield!'; e.sayT = 3;
            return;
          }
        }
        return Person.fight(game, e, npc, dt, target);
      }
      if (e.state === 'chase' || e.state === 'attack' || e.state === 'flee') e.state = 'idle';
      // Peaceful routine
      if (e.role === 'traveler' || e.role === 'soldier') return Person.followJourney(game, e, dt);
      if (e.role === 'bandit') return Person.campLife(game, e, npc, dt);
      Person.routine(game, e, npc, dt);
      Person.chatter(game, e, npc, dt);
    },

    alertFriends(game, e, target) {
      for (const o of game.ents) {
        if (o === e || o.dead || o.type !== 'person' || o.target) continue;
        if (o.faction !== e.faction || U.dist(o.x, o.y, e.x, e.y) > 9) continue;
        if (!game.hostileTo(o, target)) continue;
        o.target = target; o.sleeping = false;
        if (Math.random() < 0.3) { o.say = o.role === 'bandit' ? 'There!' : 'To arms!'; o.sayT = 1.5; }
      }
    },

    flee(game, e, threat, dt) {
      e.state = 'flee';
      const a = Math.atan2(e.y - threat.y, e.x - threat.x);
      ECHO.Ent.seek(game.world, e, e.x + Math.cos(a) * 3, e.y + Math.sin(a) * 3, e.speed * 1.25, dt, 0.1);
      if (e.sayT <= 0 && Math.random() < dt * 0.5) { e.say = threat.type === 'creature' ? 'Wolves!' : 'Help!'; e.sayT = 1.5; }
    },

    fight(game, e, npc, dt, target) {
      const world = game.world;
      const d = U.dist(e.x, e.y, target.x, target.y);
      const ang = Math.atan2(target.y - e.y, target.x - e.x);
      e.dir = ang; e.flip = Math.cos(ang) < 0;
      const skill = npc.skill.fight;
      const archer = e.gear.bow;
      const spear = e.gear.spear;
      // Shields come up when the player winds up a strike nearby.
      e.blocking = !!(e.gear.shield && target === game.pe && game.pe.cd > 0.3 && d < 2.2 && e.state !== 'attack');
      if (e.state === 'windup') {
        if (e.t > e.windEnd) {
          e.state = 'attack'; e.t = 0;
          if (archer && !e.meleeWind) {
            ECHO.Combat.shoot(e, e.aimAngle + (Math.random() - 0.5) * 0.12, { kind: e.gear.crossbow ? 'bolt' : 'arrow', speed: e.gear.crossbow ? 17 : 13, dmg: 5 + skill * 0.11 + (e.gear.crossbow ? 4 : 0), life: 1.3, type: 'ranged' });
          } else {
            const reach = spear ? 2.1 : 1.25;
            ECHO.Combat.melee(e, { angle: e.aimAngle, arc: spear ? 0.7 : 1.6, range: reach, dmg: 5 + skill * 0.13 + npc.rank * 3 + (npc.carry ? 4 : 0), knock: 0.12 });
            ECHO.Combat.slash(e.x, e.y - 0.25, e.aimAngle, reach + 0.1, spear ? 0.7 : 1.6, 'rgba(255,200,180,0.7)');
          }
          e.cd = archer && !e.meleeWind ? 1.6 + Math.random() * 0.6 : 1.1 + Math.random() * 0.5 - skill * 0.004;
        }
        return;
      }
      if (e.state === 'attack') { if (e.t > 0.2) { e.state = 'chase'; } return; }
      e.state = 'chase';
      const sp = e.speed * (e.role === 'soldier' || e.role === 'guard' ? 1.05 : 1);
      if (archer && d > 2.6) {
        // Keep distance and shoot
        const want = 5.5;
        if (d < want - 1) ECHO.Ent.seek(world, e, e.x - Math.cos(ang) * 2, e.y - Math.sin(ang) * 2, sp * 0.8, dt);
        else if (d > want + 2 || !ECHO.Ent.lineOfSight(world, e.x, e.y, target.x, target.y)) ECHO.Ent.travel(world, e, target.x, target.y, sp, dt);
        else e.moving = false;
        if (e.cd <= 0 && d < 9) { e.state = 'windup'; e.t = 0; e.windEnd = 0.75; e.aimAngle = ang; e.meleeWind = false; }
        return;
      }
      const reach = spear ? 1.9 : 1.15;
      if (d > reach + target.r) {
        if (spear && d < reach + 1.4 && e.cd > 0) { ECHO.Ent.seek(world, e, e.x - Math.cos(ang), e.y - Math.sin(ang), sp * 0.5, dt); return; }
        ECHO.Ent.travel(world, e, target.x, target.y, sp, dt);
      } else {
        e.moving = false;
        if (e.cd <= 0) {
          e.state = 'windup'; e.t = 0; e.windEnd = 0.38 - skill * 0.0012; e.aimAngle = ang; e.meleeWind = true;
          ECHO.Combat.telegraph({ x: e.x, y: e.y - 0.1, angle: ang, len: reach + 0.3, arc: spear ? 0.7 : 1.6, life: e.windEnd, shape: 'cone', color: 'rgba(255,90,70,0.22)' });
        }
      }
    },

    routine(game, e, npc, dt) {
      const world = game.world;
      e.schedT = (e.schedT || 0) - dt;
      if (e.schedT <= 0 || !e.goal) {
        e.schedT = 6 + Math.random() * 6;
        e.goal = Sched.target(game, e, npc, world.minute);
      }
      if (!e.goal) return;
      const arrived = ECHO.Ent.travel(world, e, e.goal.x, e.goal.y, e.speed * 0.55, dt);
      if (arrived) {
        e.moving = false;
        if (e.goal.inside) e.hidden = true;
        // Fidget at the goal
        if (Math.random() < dt * 0.3) e.goal = { x: e.goal.x + (Math.random() - 0.5) * 1.5, y: e.goal.y + (Math.random() - 0.5) * 1.0, inside: e.goal.inside };
      } else e.hidden = false;
    },

    chatter(game, e, npc, dt) {
      if (e.hidden || e.sayT > 0 || !game.pe) return;
      if (U.dist(e.x, e.y, game.pe.x, game.pe.y) > 9) return;
      e.chatT = (e.chatT == null ? 6 + Math.random() * 20 : e.chatT) - dt;
      if (e.chatT > 0) return;
      e.chatT = 18 + Math.random() * 40;
      const line = ECHO.Dialogue.ambient(game.world, npc, e);
      if (line) { e.say = line; e.sayT = 4.5; }
    },

    campLife(game, e, npc, dt) {
      const world = game.world;
      const camp = world.camps.find(c => c.id === npc.camp);
      if (!camp) return;
      e.schedT = (e.schedT || 0) - dt;
      if (e.schedT <= 0 || !e.goal) {
        e.schedT = 4 + Math.random() * 8;
        const patrol = e.isGuardPost || (game.isNight() && ECHO.Intel.has(world, 'ashfang', 'nightwatch'));
        const r = patrol ? 6 + Math.random() * 3 : 1.5 + Math.random() * 3.5;
        const a = Math.random() * Math.PI * 2;
        e.goal = { x: camp.x + Math.cos(a) * r, y: camp.y + Math.sin(a) * r };
      }
      // Bodyguards stay near the chief.
      if (e.guarding) {
        const lead = game.ents.find(o => o.npcId === e.guarding && !o.dead);
        if (lead) e.goal = { x: lead.x + Math.cos(e.id) * 1.4, y: lead.y + Math.sin(e.id) * 1.4 };
      }
      if (ECHO.Ent.travel(world, e, e.goal.x, e.goal.y, e.speed * 0.45, dt)) e.moving = false;
      Person.chatter(game, e, npc, dt);
    },

    followJourney(game, e, dt) {
      const world = game.world;
      const j = (world.journeys || []).find(x => x.id === e.journeyId);
      if (!j) { e.despawnSoon = true; return; }
      const p = ECHO.Sim.journeyPos(world, j);
      const ox = (e.slot || 0) * 0.6;
      if (U.dist(e.x, e.y, p.x + ox, p.y) > 6) { e.x = p.x + ox; e.y = p.y; }
      ECHO.Ent.seek(world, e, p.x + ox, p.y + (e.slot % 2) * 0.4, e.speed * 0.9, dt, 0.15);
    },

    companion(game, e, npc, dt, target) {
      const pe = game.pe;
      if (!pe) return;
      const d = U.dist(e.x, e.y, pe.x, pe.y);
      if (d > 18) { e.x = pe.x - 1; e.y = pe.y + 0.5; }
      if (target && U.dist(target.x, target.y, pe.x, pe.y) < 10) return Person.fight(game, e, npc, dt, target);
      if (d > 2.4) ECHO.Ent.travel(game.world, e, pe.x - Math.cos(pe.dir) * 1.2, pe.y - Math.sin(pe.dir) * 1.2, e.speed * (d > 6 ? 1.2 : 0.9), dt);
      else e.moving = false;
      e.hidden = false;
    }
  };

  ECHO.AI = { Creature, Person, Sched, findTarget };
})();
