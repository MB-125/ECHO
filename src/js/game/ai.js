// AI for creatures and people near the player.
// People follow daily routines tied to their profession and home; fighters
// use whatever their faction has learned (shields, skirmishing, night watch).
(function () {
  const { U } = ECHO;
  const G = () => ECHO.Game;
  const SP = ECHO.SPECIES;
  const P = () => ECHO.People;
  const Dialogue = () => ECHO.Dialogue;

  // ------------------------------------------------------------ Targets
  function findTarget(game, e, sight) {
    let best = null, bd = sight;
    for (const o of game.ents) {
      if (o === e || o.dead || o.hidden || o.ghost) continue;
      if (!game.hostileTo(e, o)) continue;
      if (o.type === 'creature' && o.species === 'hare') continue;
      let d = U.dist(e.x, e.y, o.x, o.y);
      let s = sight;
      // you: suspicion has to build before they really see you
      if (o === game.pe && ECHO.Stealth && !e.aggro) {
        if (d > s * 1.8 || d >= bd) continue;
        if (!ECHO.Stealth.perceive(game, e, d, s)) continue;
        best = o; bd = d; continue;
      }
      if (o === game.pe) {
        if (game.pe.sneaking) s *= 0.55;
        s *= 1 - game.pl.skills.shadow / 260;
        if (o.blocking) s *= 1;
      }
      if (d > s || d >= bd) continue;
      if (d > 2 && !ECHO.Ent.lineOfSight(game.world, e.x, e.y, o.x, o.y)) continue;
      if (o.isCompanion && o.tauntT > 0) d *= 0.3; // a battle cry draws them
      best = o; bd = d;
    }
    return best;
  }

  function sightFor(game, e, base) {
    const night = game.isNight();
    let s = base * (ECHO.Climate ? ECHO.Climate.sightMul(game.world, e.x, e.y) : 1);
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
      if (e.pet) return ECHO.Pet.think(game, e, dt);
      if (e.rout && ECHO.Tactics) return ECHO.Tactics.flee(game, e, dt);
      if (e.fauna) return ECHO.Fauna.deer(game, e, dt);
      const speed = e.speed * (1 + (e.traits ? e.traits.speed * 0.4 : 0)) * (game.isNight() && e.species === 'wolf' ? 1.1 : 1);
      if (e.dq && ECHO.Dilemmas && ECHO.Dilemmas.creature(game, e, dt, speed)) return;
      if (e.species === 'hare') return Creature.hare(game, e, dt, speed);
      let target = (e.target && !e.target.dead && !e.target.hidden && U.dist(e.x, e.y, e.target.x, e.target.y) < 14) ? e.target : null;
      // lose sight of you for a few heartbeats and it's down to the nose
      if (target === game.pe && U.dist(e.x, e.y, target.x, target.y) > 2 && !ECHO.Ent.lineOfSight(world, e.x, e.y, target.x, target.y)) {
        if ((e.blindT = (e.blindT || 0) + dt) > 2.5) { target = null; e.blindT = 0; e.scanT = 2; }
      } else e.blindT = 0;
      if (!target && (e.scanT = (e.scanT || 0) - dt) <= 0) { e.scanT = 0.2; target = findTarget(game, e, sightFor(game, e, sp.sight) * (e.aggro ? 1.6 : 1)); }
      e.target = target;
      if (e.species === 'gnawer') return Creature.gnawer(game, e, dt, speed, target);
      if (e.species === 'wolf') {
        // a wolf that has your scent follows it after it loses sight of you
        if (target === game.pe) e.scentT = game.time;
        else if (!target && ECHO.Senses && ECHO.Senses.scent(game, e, dt, speed)) return;
        if (!target && e.search && ECHO.Senses && ECHO.Senses.search(game, e, dt)) return;
        return Creature.wolf(game, e, dt, speed, target);
      }
    },
    wander(game, e, dt, speed) {
      if (!e.wt || e.t > e.wt) {
        e.wt = e.t + 1.5 + Math.random() * 3;
        // amble: keep roughly the same heading, drifting a little each time
        const a = e.wa = (e.wa == null ? Math.random() * Math.PI * 2 : e.wa) + (Math.random() - 0.5) * 1.6;
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
        if (threat) { e.fleeFrom = { x: threat.x, y: threat.y }; e.calmT = 3; }
        e.state = 'flee';
        const a = Math.atan2(e.y - e.fleeFrom.y, e.x - e.fleeFrom.x) + Math.sin(e.t * 2.2) * 0.35;
        ECHO.Ent.seek(game.world, e, e.x + Math.cos(a) * 2, e.y + Math.sin(a) * 2, speed, dt, 0.1);
        if (!threat && U.dist(e.x, e.y, e.fleeFrom.x, e.fleeFrom.y) > 9) e.state = 'idle';
      } else if ((e.calmT = (e.calmT || 0) - dt) > 0) { e.moving = false; }  // catch its breath before wandering back
      else Creature.wander(game, e, dt, speed);
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
            const dmg = SP.wolf.dmg * (e.dmgMul || 1) * (e.mutation === 'twinjaw' ? 1.8 : 1) * (game.isNight() ? 1.15 : 1) * (e.traits ? 1 + e.traits.hide * 0.2 : 1);
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
          let tx = target.x - Math.cos(ang + e.circleDir * 0.6) * want, ty = target.y - Math.sin(ang + e.circleDir * 0.6) * want;
          // a pack spreads round its prey; the ones without a turn hang back on the far side
          if (e.slotA != null && (e.squadN || 1) >= 2) { const r = e.token ? want : want + 1.4; tx = target.x + Math.cos(e.slotA) * r; ty = target.y + Math.sin(e.slotA) * r; }
          if ((e.stuck || 0) > 0.4 || d > 7) ECHO.Ent.travel(world, e, target.x, target.y, speed, dt);
          else ECHO.Ent.seek(world, e, tx, ty, speed * (d > 6 ? 1 : 0.75), dt, 0.3);
          e.state = 'stalk';
          // and bites from behind, if it can
          const behind = target.dir == null ? 0 : Math.abs(Math.atan2(Math.sin(Math.atan2(e.y - target.y, e.x - target.x) - target.dir), Math.cos(Math.atan2(e.y - target.y, e.x - target.x) - target.dir)));
          if (d < 3.4 && e.cd <= 0 && (!ECHO.Tactics || ECHO.Tactics.mayStrike(e)) && Math.random() < dt * (behind > 2 ? 4 : 2.2) && ECHO.Ent.lineOfSight(world, e.x, e.y, target.x, target.y)) {
            if (ECHO.Tactics) ECHO.Tactics.struck(game, e);
            e.state = 'windup'; e.t = 0; e.windEnd = 0.38 - (pack > 2 ? 0.08 : 0);
            if (ECHO.Sfx && U.dist(e.x, e.y, game.pe.x, game.pe.y) < 10) ECHO.Sfx.play('growl', { pitch: e.mutation ? 0.8 : 1, vol: 0.8 });
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
      // their own house, their spouse's or parents', or the room they rent
      const own = ECHO.Property && game.world._prop ? ECHO.Property.homeOf(game.world, npc) : null;
      if (own) return own;
      const houses = s.buildings.filter(b => b.type === 'house');
      if (!houses.length) return null;
      return houses[ECHO.hashStr(npc.last + npc.home) % houses.length];
    },
    door(b) { return { x: b.x + b.w / 2, y: b.y + b.h + 0.4 }; },
    building(s, type) { return s.buildings.find(b => b.type === type); },
    target(game, e, npc, minute, salt = 0) {
      const world = game.world;
      const s = ECHO.Sim.settlement(world, npc.loc);
      if (!s) return null;
      const hour = minute / 60;
      const h = ECHO.hashStr(npc.id);
      const house = Sched.houseOf(game, s, npc);
      const rnd = (k) => ECHO.hash2(h, Math.floor(hour) + k + salt * 17, world.day);
      const around = (x, y, r) => ({ x: x + (rnd(1) - 0.5) * r * 2, y: y + (rnd(2) - 0.5) * r * 2 });
      const night = hour < 6 || hour >= 22;
      const guardNight = npc.prof === 'guard' && (h % 3 === 0 || ECHO.Civ.has(world, s.faction, 'lamps') || (ECHO.Patrol && ECHO.Patrol.nightShift(world, s, npc)));
      const home = house ? { ...Sched.door(house), inside: true } : null;
      // Festival night: the whole town in the square, a ring dancing round the fire.
      const fest = ECHO.Festivals && ECHO.Fest && ECHO.Festivals.liveAt(world, s);
      if (fest && !npc.sick && !(e && e.hp < e.maxHp * 0.45) && (npc.prof !== 'guard' || h % 2 === 0)) {
        const L = ECHO.Fest.layout(world, s), fx = L.fire.x, fy = L.fire.y;
        if (hour >= 19 && npc.prof !== 'elder' && npc.prof !== 'guard' && rnd(11) < 0.42) return { x: fx + 2.6, y: fy, dance: true, why: 'festival', cx: fx, cy: fy };
        const a = rnd(12) * Math.PI * 2, r = 3.3 + rnd(13) * 2.4;
        return { x: fx + Math.cos(a) * r, y: fy + Math.sin(a) * r * 0.85, why: 'festival', face: { x: fx, y: fy } };
      }
      if (night && !guardNight) return home ? { ...home, why: 'sleep' } : around(s.x, s.y, 2);
      // ---- Aware of their own state and of the world around them.
      const wx = ECHO.Weather ? ECHO.Weather.here(world, s.x, s.y) : null;
      const sky = wx ? wx.today : 'clear';
      const wet = sky === 'rain' || sky === 'snow', wild = sky === 'storm' || sky === 'blizzard';
      const inn = Sched.building(s, 'inn');
      const shelter = (why) => (inn && rnd(8) < 0.45 && npc.prof !== 'child' ? { ...Sched.door(inn), inside: true, why } : home ? { ...home, why } : null);
      const healer = Sched.building(s, 'temple') || Sched.building(s, 'shrine');
      // the sick keep to their beds, save a morning visit to the healers
      if (npc.sick && home) {
        if (healer && hour >= 9 && hour < 10.5) return { ...Sched.door(healer), inside: true, why: 'healer' };
        return { ...home, why: 'sick' };
      }
      // the badly hurt go to be tended
      if (e && e.hp < e.maxHp * 0.45 && npc.prof !== 'guard') { const t = healer ? { ...Sched.door(healer), inside: true } : home; if (t) return { ...t, why: 'hurt' }; }
      // nobody but the watch stays out in a storm
      if (wild && npc.prof !== 'guard') { const t = shelter('storm'); if (t) return t; }
      // a bitter winter sends people home early
      if (wx && wx.harsh && hour >= 17 && home && npc.prof !== 'guard') return { ...home, why: 'cold' };
      // the hungry go looking for bread
      if (npc.starve > 2 && hour >= 8 && hour < 11) { const m = Sched.building(s, 'market'); if (m) { const d = Sched.door(m); return { ...around(d.x, d.y + 0.6, 1.4), why: 'hungry' }; } }
      // idling about town — under a roof when it rains
      const loiter = (x, y, r) => (wet && (npc.prof === 'child' || npc.prof === 'elder' || rnd(9) < 0.7) && shelter('rain')) || around(x, y, r);
      // What's on their mind shapes their day.
      const mind = npc.mind, goal = mind && mind.goal;
      const afraid = mind && mind.v && mind.v.safety < 0.45 && npc.prof !== 'guard' && !npc.traits.includes('brave');
      if (afraid && hour >= 19 && house) return { ...Sched.door(house), inside: true };      // home before dark
      if (goal && goal.kind === 'faith' && hour >= 7 && hour < 8.5) { const sh = Sched.building(s, 'temple') || Sched.building(s, 'shrine'); if (sh) return around(Sched.door(sh).x, Sched.door(sh).y + 0.6, 1.2); }
      if (goal && goal.kind === 'lore' && hour >= 12 && hour < 14) { const ar = Sched.building(s, 'archive'); if (ar) return around(Sched.door(ar).x, Sched.door(ar).y + 0.5, 1); }
      if (goal && goal.kind === 'love' && hour >= 18 && hour < 21 && goal.crush) {
        const c = world.npcs[goal.crush]; const ch = c && Sched.houseOf(game, s, c);
        if (ch) { const d = Sched.door(ch); return { x: d.x + (rnd(5) - 0.5) * 2.5, y: d.y + 0.8 }; }   // lingering near their door
      }
      const longDay = goal && goal.kind === 'prosper' && hour >= 18 && hour < 20;           // saving up: working late
      if (!longDay && (hour < 7.5 || (hour >= 18 && hour < 22))) {
        // Mornings and evenings: plaza, well, inn.
        if (hour >= 18 && inn && rnd(3) < (wet ? 0.85 : 0.5) && npc.prof !== 'child') return wet ? { ...Sched.door(inn), inside: true, why: 'rain' } : { ...Sched.door(inn), x: Sched.door(inn).x + (rnd(4) - 0.5) * 3 };
        return loiter(s.x, s.y + 1, 3.5);
      }
      const at = (type, r = 1.2) => { const b = Sched.building(s, type); if (!b) return around(s.x, s.y, 3); const d = Sched.door(b); return around(d.x, d.y + 0.4, r); };
      switch (npc.prof) {
        case 'farmer': {
          const a = (h % 628) / 100 + Math.floor(hour / 3) * 0.7;
          const d = 11 + (h % 5);
          return { x: s.x + Math.cos(a) * d, y: s.y + Math.sin(a) * d };
        }
        case 'woodcutter': {
          const f = s.buildings.find(b => b.type === 'lumber');
          if (f && f.fac && f.fac.state === 'working') { const d = Sched.door(f); return { x: d.x + (rnd(6) - 0.5) * 3, y: d.y + rnd(7) * 1.2 }; }
        } // falls through to the wilds
        case 'hunter': case 'herbalist': {
          const a = (h % 628) / 100 + Math.floor(hour / 2);
          const r = afraid ? 9 : 17;   // frightened folk keep close to the walls
          return { x: s.x + Math.cos(a) * r, y: s.y + Math.sin(a) * r };
        }
        case 'smith': return at('smithy', 0.8);
        case 'miller': case 'miner': {
          const f = s.buildings.find(b => b.type === (npc.prof === 'miller' ? 'mill' : 'mine'));
          if (f) { const d = Sched.door(f); return { x: d.x + (rnd(6) - 0.5) * 2, y: d.y + 0.3 + rnd(7) * 0.8 }; }
          return around(s.x, s.y, 4);
        }
        case 'merchant': case 'reeve': return at('market', 1.5);
        case 'innkeeper': return at('inn', 0.6);
        case 'priest': return s.kind === 'temple' ? at('temple', 2) : at('shrine', 1);
        case 'scholar': case 'inventor': return at('archive', 1);
        case 'ruler': return s.kind === 'capital' ? at('keep', 1.5) : at('market', 1.5);
        case 'guard': {
          const post = ECHO.Patrol && ECHO.Patrol.guardTarget(game, s, npc, hour);
          if (post) return post;
          const a = (h % 628) / 100 + game.time * 0.02 + Math.floor(hour) * 1.3;
          const r = 6 + (h % 4);
          return { x: s.x + Math.cos(a) * r, y: s.y + Math.sin(a) * r };
        }
        case 'child': return loiter(s.x, s.y, 4);
        case 'elder': { const w = Sched.building(s, 'well'); return wet ? loiter(s.x, s.y, 2) : w ? around(w.x + 0.5, w.y + 1.5, 1.5) : around(s.x, s.y, 2); }
        case 'wanderer': return at('inn', 2);
        default: return loiter(s.x, s.y, 4);
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
      if (e.lostQuest) return ECHO.Quests.updateLost(game, e, dt);
      if ((e.incident || e.reporting || e.chase || e.question) && ECHO.Patrol && ECHO.Patrol.ent(game, e, dt)) return;
      if (e.pilloried) { e.moving = false; e.dir = Math.PI / 2; if (e.sayT <= 0 && Math.random() < dt * 0.05) { e.say = ['Water… please.', 'It was only bread!', 'Don\'t look at me.', 'Let me out of here!'][Math.floor(Math.random() * 4)]; e.sayT = 3; } return; }
      if (e.yielded) { e.moving = false; e.state = 'yield'; return; }
      if (e.indoor && e.sleeping) { e.moving = false; if (!e.aggro) return; e.sleeping = false; e.seated = false; }
      if (npc.sick && !e._sickSlow) { e._sickSlow = true; e.speed *= 0.6; }

      // Sleeping outlaws (unless they have learned to keep watch)
      if (e.role === 'bandit' && !e.siege && game.isNight() && !ECHO.Intel.has(world, 'ashfang', 'nightwatch') && !e.aggro && e.state !== 'chase' && e.state !== 'attack' && !e.isGuardPost) {
        e.sleeping = true; e.moving = false;
        return;
      }
      e.sleeping = false;
      if (e.rout && ECHO.Tactics) return ECHO.Tactics.flee(game, e, dt);

      const fighter = e.role === 'bandit' || e.role === 'guard' || e.role === 'soldier' || e.role === 'companion' || (npc.prof === 'wanderer');
      const sight = sightFor(game, e, e.role === 'villager' ? 6 : 8.5) * (e.aggro ? 1.5 : 1);
      let target = e.target && !e.target.dead && !e.target.hidden && U.dist(e.x, e.y, e.target.x, e.target.y) < 16 && game.hostileTo(e, e.target) ? e.target : null;
      // Out of sight is out of reach: break line of sight (or melt into cover
      // while crouched, far enough off) and after a moment they lose you.
      if (target === game.pe && !e.indoor && fighter) {
        const dd = U.dist(e.x, e.y, target.x, target.y);
        const los = dd < 1.6 || ECHO.Ent.lineOfSight(game.world, e.x, e.y, target.x, target.y);
        const vis = ECHO.Stealth ? ECHO.Stealth.vis(game) : 1;
        const hid = ECHO.PlayerCtl.sneaking && vis < 0.45 && dd > 2.5 + vis * 9;
        if (!los || hid) {
          e.blindT = (e.blindT || 0) + dt;
          if (e.blindT > (hid ? 1.2 : 2.2)) { target = null; e.blindT = 0; e.scanT = 1.2; }
        } else { e.blindT = 0; e.lastSeen = { x: target.x, y: target.y, t: game.time }; }
      }
      if (!target && (e.scanT = (e.scanT || 0) - dt) <= 0) { e.scanT = 0.25; target = findTarget(game, e, sight); }
      // People inside a building (out of sight) can't fight from in there:
      // fighters step out of the door to face you; everyone else stays put.
      if (e.hidden) {
        if (target && fighter) {
          const out = game.freeSpotNear(world, e.x, e.y);
          e.x = out.x; e.y = out.y; e.hidden = false; e.goal = null;
          e.say = e.role === 'guard' ? 'Halt!' : 'Who goes there?'; e.sayT = 1.5;
        } else {
          e.target = null;
          if (e.shelterT > 0) { e.shelterT -= dt; e.moving = false; return; } // waiting out the danger indoors
          // don't come back out while the danger is still on the doorstep
          if (e.sheltered) { if (game.ents.some(o => !o.dead && !o.hidden && o !== e && U.dist(o.x, o.y, e.x, e.y) < 13 && game.hostileTo(e, o) && Person.scary(o))) { e.shelterT = 6; return; } e.sheltered = false; }
          Person.routine(game, e, npc, dt); return;
        }
      }
      // A mind of their own: grudges, fear, gratitude, admiration.
      if (!e.indoor && Person.mindful(game, e, npc, dt, target, fighter)) return;
      if (target && target !== e.target && fighter) { Person.alertFriends(game, e, target); if (ECHO.Tactics && (e.role === 'guard' || e.role === 'soldier' || e.role === 'bandit')) ECHO.Tactics.shout(game, e, target); }
      e.target = target;
      // remember where they last were; lose them, and go looking
      if (target === game.pe) { if (!e.blindT) e.lastSeen = { x: target.x, y: target.y, t: game.time }; e.search = null; }
      else if (!target && fighter && ECHO.Senses && e.lastSeen && game.time - e.lastSeen.t < 4 && !e.search && !e.indoor && game.hostileTo(e, game.pe)) { ECHO.Senses.lost(game, e, e.lastSeen.x, e.lastSeen.y); e.lastSeen = null; }

      if (e.rider && ECHO.Riders && ECHO.Riders.think(game, e, npc, dt, target)) return;
      if (e.dq && ECHO.Dilemmas && ECHO.Dilemmas.think(game, e, npc, dt, target)) return;
      if (e.siege && ECHO.Events && ECHO.Events.siegeThink(game, e, npc, dt, target)) return;
      if (e.listen && e.listen.t > 0 && !target) {
        // listening to the music
        e.listen.t -= dt;
        if (U.dist(e.x, e.y, e.listen.x, e.listen.y) > 0.5) ECHO.Ent.travel(world, e, e.listen.x, e.listen.y, e.speed * 0.8, dt);
        else { e.moving = false; e.dir = Math.atan2(game.pe.y - e.y, game.pe.x - e.x); e.flip = Math.cos(e.dir) < 0; }
        return;
      }
      if (e.role === 'companion') return Person.companion(game, e, npc, dt, target);
      // ordinary folk don't run indoors from crop vermin and rabbits
      if (target && !fighter && !Person.scary(target)) { target = null; e.target = null; }
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
      if (e.search && !e.indoor && ECHO.Senses && ECHO.Senses.search(game, e, dt)) return;
      // Peaceful routine
      if (e.indoor) return Person.indoorIdle(game, e, npc, dt);
      if (e.role === 'traveler' || e.role === 'soldier') return Person.followJourney(game, e, dt);
      if (e.role === 'bandit') return Person.campLife(game, e, npc, dt);
      // the life of the town: talk, games, crowds, buckets, burials
      if (ECHO.Town && ECHO.Town.think(game, e, npc, dt)) return;
      Person.routine(game, e, npc, dt);
      if (ECHO.Town) ECHO.Town.work(game, e, npc, dt);
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

    // worth running from: beasts, monsters, outlaws, and anyone actually coming at you
    scary(t) {
      if (!t || t.dead) return false;
      if (t.type === 'creature' && !t.humanoid) return t.species === 'wolf' || !!t.winter;
      if (t.type === 'player') return true;
      return true;
    },
    indoorIdle(game, e, npc, dt) {
      const h = e.indoor;
      const L = ECHO.Interior.cur;
      if (e.leaving && L) {
        // out through the door (first stepping up from the seat, which sits inside the furniture)
        if (!e.leftSeat) { e.leftSeat = true; if (!ECHO.Ent.fits(game.world, e.x, e.y)) { const sp = ECHO.Ent.freeSpot(game.world, e.x, e.y, 2); if (sp) { e.x = sp.x; e.y = sp.y; } } }
        if (U.dist(e.x, e.y, L.inside.x, L.inside.y) > 0.6) { ECHO.Ent.travelIn ? ECHO.Ent.travelIn(game.world, e, L.inside.x, L.inside.y, e.speed * 0.6, dt) : ECHO.Ent.seek(game.world, e, L.inside.x, L.inside.y, e.speed * 0.6, dt, 0.2); return; }
        e.dead = true; e.vanish = true; e.byDoor = true; ECHO.Sfx.play('door', { vol: 0.35 }); return;
      }
      const d = U.dist(e.x, e.y, h.x, h.y);
      // Seats and beds sit inside furniture: settle straight into them once close.
      if (d > 0.35 && ((h.pose !== 'stand' && d < 1.6) || (d < 2.4 && !ECHO.Ent.fits(game.world, h.x, h.y)))) { e.x = h.x; e.y = h.y; }
      else if (d > 0.35) { e.seated = false; e.sleeping = false; if (ECHO.Ent.travelIn && d > 1.2) ECHO.Ent.travelIn(game.world, e, h.x, h.y, e.speed * 0.5, dt); else ECHO.Ent.seek(game.world, e, h.x, h.y, e.speed * 0.5, dt, 0.25); return; }
      e.sleeping = h.pose === 'bed';
      e.moving = false;
      e.seated = h.pose === 'sit';
      const pe = game.pe;
      const near = pe && U.dist(e.x, e.y, pe.x, pe.y) < 3;
      e.dir = near ? Math.atan2(pe.y - e.y, pe.x - e.x) : h.dir;
      Person.chatter(game, e, npc, dt);
    },

    flee(game, e, threat, dt) {
      e._lastThreat = threat;
      e.state = 'flee';
      const world = game.world;
      // Townsfolk run for the nearest house and bar the door; others just run.
      if (!e.indoor && e.homeSid && (threat.type !== 'player' || (e.fleeHome == null))) {
        const s = ECHO.Sim.settlement(world, e.homeSid);
        if (s && !e.fleeDoor) {
          let best = null, bd = 14;
          for (const b of s.buildings) {
            if (b.type !== 'house' && b.type !== 'inn' && b.type !== 'shrine' && b.type !== 'temple') continue;
            const d = Sched.door(b), dd = U.dist(d.x, d.y, e.x, e.y);
            // don't run toward the danger
            if (U.dist(d.x, d.y, threat.x, threat.y) < U.dist(e.x, e.y, threat.x, threat.y) - 1) continue;
            if (dd < bd) { bd = dd; best = d; }
          }
          e.fleeDoor = best || 'none';
        }
        if (e.fleeDoor && e.fleeDoor !== 'none') {
          const safe = ECHO.Ent.travel(world, e, e.fleeDoor.x, e.fleeDoor.y, e.speed * 1.3, dt);
          if (e.navFail) { e.navFail = false; e.fleeDoor = 'none'; return; }   // that door's cut off: just run
          if (safe) {
            e.hidden = true; e.sheltered = true; e.shelterT = 12 + Math.random() * 10; e.fleeDoor = null; e.goal = null; e.target = null; e.state = 'idle';
          }
          if (e.sayT <= 0 && Math.random() < dt * 0.6) { e.say = threat.type === 'creature' || threat.type === 'boss' ? 'Get inside! Get inside!' : threat.type === 'player' ? 'Stay away from me!' : 'Help! Guards!'; e.sayT = 1.6; }
          return;
        }
      }
      const a = Math.atan2(e.y - threat.y, e.x - threat.x);
      ECHO.Ent.seek(world, e, e.x + Math.cos(a) * 3, e.y + Math.sin(a) * 3, e.speed * 1.25, dt, 0.1);
      if (e.sayT <= 0 && Math.random() < dt * 0.5) { e.say = threat.type === 'creature' ? 'Wolves!' : threat.type === 'player' ? 'Stay away from me!' : 'Help!'; e.sayT = 1.5; }
    },

    // How a person's mind shapes what they do when you are around.
    mindful(game, e, npc, dt, target, fighter) {
      const world = game.world, pe = game.pe, pl = game.pl;
      const mind = npc.mind;
      if (!mind || !pl || e.role === 'bandit' || e.isCompanion || e.role === 'captive') return false;
      const d = U.dist(e.x, e.y, pe.x, pe.y);
      if (d > 10) { e.fleeDoor = null; return false; }
      const op = npc.op[pl.charId] || 0;
      const g = mind.goal;
      const sees = d < 9 && ECHO.Ent.lineOfSight(world, e.x, e.y, pe.x, pe.y);
      const say = (t, k = 2.4) => { if (e.sayT <= 0) { e.say = t; e.sayT = k; } };
      // The bereaved: they know your face.
      if (g && g.kind === 'avenge' && g.target.type === 'player' && g.target.id === pl.charId && sees) {
        const brave = (npc.skill.fight >= 18 || P().has(npc, 'brave') || P().has(npc, 'hot-headed')) && !P().has(npc, 'cowardly') && npc.prof !== 'child' && npc.prof !== 'elder';
        if (brave) {
          if (!e.aggro) { e.aggro = true; e.startedFight = true; e.target = pe; e.say = `${g.target.victim}! You killed my ${g.target.rel}!`; e.sayT = 3; ECHO.Sfx.play('growl', { pitch: 1.6, vol: 0.4 }); }
          return false; // fight as normal, now that they are hostile
        }
        if (d < 7) { Person.flee(game, e, pe, dt); say(`Murderer! You killed ${g.target.victim}!`, 3); return true; }
      }
      if (target) return false; // something more urgent is going on
      // Fear of someone with blood on their hands.
      if (op < -50 && !fighter && d < 4.5 && sees) { Person.flee(game, e, pe, dt); return true; }
      e.fleeDoor = null;
      // Gratitude: a gift, once in a while, from those you helped.
      if ((mind.owe || 0) > 0 && op > 35 && d < 2.6 && (!mind.giftDay || world.day - mind.giftDay >= 8)) {
        mind.giftDay = world.day; mind.owe--;
        const r = Math.random();
        let what;
        if (npc.wealth > 30 && r < 0.4) { const c = Math.round(Math.min(25, npc.wealth * 0.15)); npc.wealth -= c; pl.gold += c; what = `${c} crowns`; }
        else if (r < 0.7) { pl.inv.food = (pl.inv.food || 0) + 2; what = 'a loaf and some cheese'; }
        else { pl.inv.herbs = (pl.inv.herbs || 0) + 1; what = 'a bundle of herbs'; }
        e.dir = Math.atan2(pe.y - e.y, pe.x - e.x); e.moving = false;
        e.say = 'Wait — this is for you. For what you did.'; e.sayT = 3;
        ECHO.UI.toast(`${npc.first} presses ${what} into your hands. "For what you did."`, 'mercy', 4);
        ECHO.Sfx.play('coin');
        return true;
      }
      // Admiration (or a cold stare): they stop and look at you.
      if (sees && d < 3.2 && Math.abs(op) > 45 && !e._lookT) e._lookT = 4 + Math.random() * 3;
      if (e._lookT > 0) {
        e._lookT -= dt;
        if (e._lookT <= 0) { e._lookT = -20; return false; }
        e.moving = false; e.dir = Math.atan2(pe.y - e.y, pe.x - e.x);
        if (op > 45) say(Dialogue().praise(world, npc, pl), 2.6);
        else say(['Hmph.', 'We know what you are.', 'Keep walking.', '…'][ECHO.hashStr(npc.id) % 4], 2);
        return true;
      }
      if (e._lookT < 0) e._lookT = Math.min(0, e._lookT + dt);
      // Friends warn you of danger.
      if (op > 25 && d < 3 && mind.v && mind.v.safety < 0.6 && mind.v.threat && mind._warned !== world.day && Math.random() < 0.3) { mind._warned = world.day; say(`Careful out there — ${mind.v.threat}.`, 3); }
      return false;
    },

    fight(game, e, npc, dt, target) {
      const world = game.world;
      const d = U.dist(e.x, e.y, target.x, target.y);
      const ang = Math.atan2(target.y - e.y, target.x - e.x);
      // The law tries words before swords.
      if (target === game.pe && (e.role === 'guard' || e.role === 'soldier') && ECHO.Court.shouldArrest(game, e)) {
        e.state = 'chase';
        if (d > 1.8) { ECHO.Ent.travel(world, e, target.x, target.y, e.speed * 1.1, dt); if (e.sayT <= 0) { e.say = 'Halt! You there!'; e.sayT = 2; } return; }
        e.moving = false; e.dir = ang;
        ECHO.Court.arrest(game, e);
        return;
      }
      e.dir = ang; e.flip = Math.cos(ang) < 0;
      const skill = npc.skill.fight;
      const archer = e.gear.bow;
      const spear = e.gear.spear;
      // Shields come up when the player winds up a strike nearby.
      e.blocking = !!(e.gear.shield && target === game.pe && game.pe.cd > 0.3 && d < 2.2 && e.state !== 'attack');
      if (e.state === 'windup') {
        if (e.t > e.windEnd) {
          // a reader holds the blow while you're still rolling
          if (e.readPlan && ECHO.Wits && ECHO.Wits.hold(game, e, dt)) return;
          e.state = 'attack'; e.t = 0;
          if (archer && !e.meleeWind) {
            ECHO.Combat.shoot(e, e.aimAngle + (Math.random() - 0.5) * 0.12 * (e.aimMul || 1), { kind: e.gear.crossbow ? 'bolt' : 'arrow', speed: e.gear.crossbow ? 17 : 13, dmg: (5 + skill * 0.11 + (e.gear.crossbow ? 4 : 0)) * (e.dmgMul || 1), life: 1.3, type: 'ranged' });
          } else {
            const reach = spear ? 2.1 : 1.25;
            // a sellsword's every third blow, once learned, cleaves wide
            const cleave = e.isCompanion && e.compCls === 'sellsword' && ECHO.Companions && npc.comp && npc.comp.lv >= 8 && (e.swings = (e.swings || 0) + 1) % 3 === 0;
            const arc = cleave ? 2.7 : spear ? 0.7 : 1.6;
            let mo = { angle: e.aimAngle, arc, range: reach + (cleave ? 0.3 : 0), dmg: (5 + skill * 0.13 + npc.rank * 3 + (npc.carry ? 4 : 0)) * (e.dmgMul || 1) * (cleave ? 1.3 : 1), knock: cleave ? 0.3 : 0.12 };
            if (ECHO.Wits) mo = ECHO.Wits.blow(game, e, mo);
            const hits = ECHO.Combat.melee(e, mo);
            if (ECHO.Wits) ECHO.Wits.landed(game, e, mo, hits);
            ECHO.Combat.slash(e.x, e.y - 0.25, e.aimAngle, mo.range + 0.1, mo.arc, mo.kick ? 'rgba(255,170,80,0.8)' : cleave ? 'rgba(255,230,150,0.85)' : 'rgba(255,200,180,0.7)');
            if (cleave) ECHO.Combat.floater(e.x, e.y - 1.4, 'Cleave!', '#ffe08a');
          }
          e.cd = (archer && !e.meleeWind ? 1.6 + Math.random() * 0.6 : 1.1 + Math.random() * 0.5 - skill * 0.004) * (e.cdMul || 1);
        }
        return;
      }
      if (e.state === 'attack') { if (e.t > 0.2) { e.state = 'chase'; } return; }
      e.state = 'chase';
      const sp = e.speed * (e.role === 'soldier' || e.role === 'guard' ? 1.05 : 1);
      if (!e.isCompanion && ECHO.Wits && ECHO.Wits.move(game, e, target, d, ang, sp, dt, { archer: archer && d > 2.6 })) return;
      const punish = !e.isCompanion && target === game.pe && ECHO.Wits && ECHO.Wits.punish(game, e);
      if (!e.isCompanion && !punish && ECHO.Tactics && ECHO.Tactics.move(game, e, target, d, ang, sp, dt, { reach: spear ? 1.9 : 1.15, archer: archer && d > 2.6, want: 5.5 })) {
        if (archer && d > 2.6 && e.cd <= 0 && d < 9 && !e.blockedShot && d >= 3.2) { e.state = 'windup'; e.t = 0; e.windEnd = 0.75; e.aimAngle = ang; e.meleeWind = false; e.readPlan = null; }
        return;
      }
      if (archer && d > 2.6) {
        // Keep distance and shoot
        const want = 5.5;
        if (d < want - 1) ECHO.Ent.seek(world, e, e.x - Math.cos(ang) * 2, e.y - Math.sin(ang) * 2, sp * 0.8, dt);
        else if (d > want + 2 || !ECHO.Ent.lineOfSight(world, e.x, e.y, target.x, target.y)) ECHO.Ent.travel(world, e, target.x, target.y, sp, dt);
        else e.moving = false;
        if (e.cd <= 0 && d < 9 + (e.rangeBonus || 0)) { e.state = 'windup'; e.t = 0; e.windEnd = 0.75; e.aimAngle = ang; e.meleeWind = false; e.readPlan = null; }
        return;
      }
      const reach = spear ? 1.9 : 1.15;
      if (d > reach + target.r) {
        if (spear && d < reach + 1.4 && e.cd > 0) { ECHO.Ent.seek(world, e, e.x - Math.cos(ang), e.y - Math.sin(ang), sp * 0.5, dt); return; }
        ECHO.Ent.travel(world, e, target.x, target.y, sp * (punish ? 1.35 : 1), dt);
      } else {
        e.moving = false;
        if (e.cd <= 0 && (punish || e.isCompanion || !ECHO.Tactics || ECHO.Tactics.mayStrike(e))) {
          if (ECHO.Tactics && !e.isCompanion) ECHO.Tactics.struck(game, e);
          e.state = 'windup'; e.t = 0; e.windEnd = 0.38 - skill * 0.0012; e.aimAngle = ang; e.meleeWind = true;
          const tele = e.windEnd;
          // what they've learned of you shapes the blow
          const plan = !e.isCompanion && target === game.pe && ECHO.Wits ? ECHO.Wits.plan(game, e, d) : null;
          e.readPlan = plan;
          if (plan) { e.windEnd = Math.max(0.16, e.windEnd + plan.wind); if (plan.say && e.sayT <= 0) { e.say = plan.say; e.sayT = 1; } }
          if (target === game.pe && ECHO.Sfx) ECHO.Sfx.play('swing', { pitch: 0.7, vol: 0.35 });
          // a held blow shows the usual tell — and then doesn't come when you expect
          ECHO.Combat.telegraph({ x: e.x, y: e.y - 0.1, angle: ang, len: reach + 0.3, arc: plan && plan.kind === 'kick' ? 0.9 : spear ? 0.7 : 1.6, life: plan && plan.kind === 'delay' ? tele : e.windEnd, shape: 'cone', color: plan && plan.kind === 'kick' ? 'rgba(255,170,60,0.3)' : 'rgba(255,90,70,0.22)' });
        }
      }
    },

    routine(game, e, npc, dt) {
      const world = game.world;
      e.schedT = (e.schedT || 0) - dt;
      if (e.schedT <= 0 || !e.goal) {
        e.schedT = 6 + Math.random() * 6;
        const g = Sched.target(game, e, npc, world.minute, e._salt || 0);
        // already indoors, and still meant to be in the same place: stay in (don't step out and back in)
        const stay = e.hidden && e.goal && e.goal.inside && g && g.inside && U.dist(g.x, g.y, e.goal.x, e.goal.y) < 2.5;
        if (!stay) {
          // a new reason to go somewhere: forget yesterday's dead ends
          if (!e.goal || !g || g.why !== e.goal.why || U.dist(g.x, g.y, e.goal.x, e.goal.y) > 2) e._fails = 0;
          e.goal = g;
        }
      }
      if (!e.goal) return;
      // Can't get there (walled off, blocked, no way round)? Don't shove at it —
      // think again and pick somewhere else, or stand and wait a little.
      if (e.navFail) {
        e.navFail = false; e.path = null; e.stuck = 0; e.moving = false; e._navKey = null;
        e._fails = (e._fails || 0) + 1;
        e._salt = (e._salt || 0) + 1;
        if (e.goal.inside && e._fails <= 2) { e.goal = { ...e.goal, inside: false }; }  // at least wait by the door
        if (e._fails >= 3) { e.goal = null; e.schedT = 3 + Math.random() * 4; return; }
        e.goal = Sched.target(game, e, npc, world.minute, e._salt) || e.goal;
        if (e._fails >= 2) e.goal = { x: e.x + (Math.random() - 0.5) * 3, y: e.y + (Math.random() - 0.5) * 3 };
        return;
      }
      // The festival ring dance: round and round the fire.
      if (e.goal.dance) {
        const g = e.goal;
        if (e.danceA == null) e.danceA = Math.atan2(e.y - g.cy, e.x - g.cx);
        const dR = U.dist(e.x, e.y, g.cx, g.cy);
        if (Math.abs(dR - 2.6) < 0.7) { e.danceA += dt * 0.42; e.dancing = true; } else e.dancing = false;
        const tx = g.cx + Math.cos(e.danceA) * 2.6, ty = g.cy + Math.sin(e.danceA) * 2.6 * 0.85;
        ECHO.Ent.seek(world, e, tx, ty, e.speed * 0.5, dt, 0.05);
        if (e.dancing) e.dir = e.danceA + Math.PI / 2;
        e.hidden = false;
        return;
      }
      e.dancing = false; e.danceA = null;
      // Mind the folk in the way: step round someone standing in your path.
      Person.courtesy(game, e, dt);
      const arrived = ECHO.Ent.travel(world, e, e.goal.x + (e._sideX || 0), e.goal.y + (e._sideY || 0), e.speed * (e.goal.why === 'storm' || e.goal.why === 'rain' ? 0.75 : 0.55), dt);
      if (arrived) {
        e.moving = false; e._fails = 0;
        if (e.goal.inside) e.hidden = true;
        else Person.settle(game, e, npc, dt);
        // Fidget at the goal (not when they've gone indoors: that made them pop in and out of doors)
        if (!e.goal.inside && Math.random() < dt * 0.08) e.goal = { x: e.goal.x + (Math.random() - 0.5) * 2.5, y: e.goal.y + (Math.random() - 0.5) * 1.6, inside: e.goal.inside, why: e.goal.why, face: e.goal.face };
      } else e.hidden = false;
      // A word now and then about why they're hurrying.
      if (!arrived && e.goal.why && e.sayT <= 0 && game.pe && U.dist(e.x, e.y, game.pe.x, game.pe.y) < 7 && Math.random() < dt * 0.04) {
        const L = { rain: ['Out of this rain…', 'Soaked through, again.'], storm: ['Get indoors — it\'s a wild one!', 'Gods, this wind!'], sick: ['*cough* … need to lie down.', 'I feel terrible.'], healer: ['Going to see the healers.'], hurt: ['Need these wounds seen to…'], cold: ['Too cold to be out.', 'Home, and a fire.'], hungry: ['There must be bread somewhere.', 'Haven\'t eaten in days.'], sleep: ['Late. Home to bed.'] }[e.goal.why];
        if (L) { e.say = L[Math.floor(Math.random() * L.length)]; e.sayT = 2.5; }
      }
    },

    // Someone standing right in the way: step to one side rather than walk into them.
    courtesy(game, e, dt) {
      if ((e._sideT = (e._sideT || 0) - dt) > 0) return;
      e._sideT = 0.35;
      e._sideX = 0; e._sideY = 0;
      if (!e.moving) return;
      const fx = Math.cos(e.dir), fy = Math.sin(e.dir);
      for (const o of game.ents) {
        if (o === e || o.dead || o.hidden || o.type === 'creature') continue;
        const dx = o.x - e.x, dy = o.y - e.y;
        const ahead = dx * fx + dy * fy;
        if (ahead < 0.2 || ahead > 1.4) continue;
        const side = -dx * fy + dy * fx;
        if (Math.abs(side) > 0.7) continue;
        // pass on the side away from them, if there's room there
        const sgn = side > 0 ? -1 : 1;
        const sx = -fy * sgn * 0.9, sy = fx * sgn * 0.9;
        if (ECHO.Ent.fits(game.world, e.x + sx, e.y + sy)) { e._sideX = sx; e._sideY = sy; e._sideT = 0.7; }
        return;
      }
    },

    // Arrived somewhere: face something sensible — the person you came to talk
    // to, the stall you're minding, the street — instead of a blank wall.
    settle(game, e, npc, dt) {
      if (e.goal && e.goal.face) { e.dir = Math.atan2(e.goal.face.y - e.y, e.goal.face.x - e.x); e.flip = Math.cos(e.dir) < 0; return; }
      if ((e._faceT = (e._faceT || 0) - dt) > 0) return;
      e._faceT = 2 + Math.random() * 3;
      let best = null, bd = 2.6;
      for (const o of game.ents) {
        if (o === e || o.dead || o.hidden || o.type !== 'person' && o.type !== 'player') continue;
        const d = U.dist(e.x, e.y, o.x, o.y);
        if (d < bd && (o.type === 'player' || !o.moving)) { bd = d; best = o; }
      }
      if (best) { e.dir = Math.atan2(best.y - e.y, best.x - e.x); e.flip = Math.cos(e.dir) < 0; return; }
      // otherwise, if staring at a wall, turn to the way with the most open ground
      const openAt = a => { let n = 0; for (let k = 1; k <= 4; k++) if (!ECHO.World.isSolid(game.world, e.x + Math.cos(a) * k * 0.7, e.y + Math.sin(a) * k * 0.7)) n++; else break; return n; };
      if (openAt(e.dir) >= 3) return;
      let ba = e.dir, bo = -1;
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4, open = openAt(a);
        if (open > bo) { bo = open; ba = a; }
      }
      e.dir = ba; e.flip = Math.cos(ba) < 0;
    },

    chatter(game, e, npc, dt) {
      if (e.hidden || e.sayT > 0 || !game.pe) return;
      if (ECHO.Fauna && ECHO.Fauna.greet(game, e, npc)) return;
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
        const want = lead && { x: lead.x + Math.cos(e.id) * 1.4, y: lead.y + Math.sin(e.id) * 1.4 };
        if (want && (!e.goal || U.dist(want.x, want.y, e.goal.x, e.goal.y) > 1.2)) e.goal = want; // follow, don't shadow every step
      }
      if (ECHO.Ent.travel(world, e, e.goal.x, e.goal.y, e.speed * 0.45, dt)) e.moving = false;
      if ((e.stuck || 0) > 0.8 || e.navFail) { e.navFail = false; e.goal = null; e.path = null; e.stuck = 0; e.moving = false; e.schedT = 2 + Math.random() * 3; } // can't get there: stand a while
      Person.chatter(game, e, npc, dt);
    },

    followJourney(game, e, dt) {
      const world = game.world;
      const j = (world.journeys || []).find(x => x.id === e.journeyId);
      if (!j) { e.despawnSoon = true; return; }
      const p = ECHO.Sim.journeyPos(world, j);
      // armies march in ranks; everyone else straggles in a line
      const sl = e.slot || 0;
      const ox = j.kind === 'army' ? (sl % 3 - 1) * 0.8 : sl * 0.6, oy = j.kind === 'army' ? Math.floor(sl / 3) * 0.9 : (sl % 2) * 0.4;
      if (U.dist(e.x, e.y, p.x + ox, p.y + oy) > 6) { e.x = p.x + ox; e.y = p.y + oy; }
      const npc = world.npcs[e.npcId];
      ECHO.Ent.seek(world, e, p.x + ox, p.y + oy, e.speed * (npc && npc.sick ? 0.6 : 0.9), dt, 0.15);
    },

    companion(game, e, npc, dt, target) {
      const pe = game.pe;
      if (!pe) return;
      const d = U.dist(e.x, e.y, pe.x, pe.y);
      // left far behind, or wedged for a few seconds: they find their own way and turn up behind you
      e._lagT = d > 4 && !target && (e.stuck || 0) > 0.3 ? (e._lagT || 0) + dt : 0;
      if (d > 18 || e._lagT > 2.5) {
        const a = pe.dir + Math.PI;
        const sp = ECHO.Ent.freeSpot(game.world, pe.x + Math.cos(a) * 1.2, pe.y + Math.sin(a) * 1.2, 4) || { x: pe.x, y: pe.y };
        e.x = sp.x; e.y = sp.y; e._lagT = 0; e.stuck = 0; e.ipath = null; e.path = null;
      }
      // When you ride, they ride: their own horse, kept up with yours. A fight close by
      // puts them on their feet.
      if (ECHO.Companions && ECHO.Companions.ride(game, e, npc, dt, target, d)) return;
      if (ECHO.Companions && ECHO.Companions.act(game, e, npc, dt, target)) return;
      if (target && U.dist(target.x, target.y, pe.x, pe.y) < 10) return Person.fight(game, e, npc, dt, target);
      if (d > 2.4) { const bx = pe.x - Math.cos(pe.dir) * 1.2, by = pe.y - Math.sin(pe.dir) * 1.2; const ok = !ECHO.World.isSolid(game.world, bx, by); ECHO.Ent.travel(game.world, e, ok ? bx : pe.x, ok ? by : pe.y, e.speed * (d > 6 ? 1.2 : 0.9), dt); }
      else e.moving = false;
      e.hidden = false;
    }
  };

  ECHO.AI = { Creature, Person, Sched, findTarget };
})();
