// The titans in real time: dragons in the sky over their ranges, great beasts
// on the ground, their young about them and their prey around them.
//
// A dragon circles its range by day and sleeps on its roost by night; it
// hunts the deer and wolves below. Come onto its range and it warns you, then
// fights — on the ground with jaws and tail and breath, and from the air with
// strafing fire, rains of its element and a dive that shakes the ground.
// Beaten down, a titan lies in the dust: bind it (you can keep four), or end
// it. Bound, it follows you and fights beside you; a dragon carries you
// through the sky.
(function () {
  const { U } = ECHO;
  const UI = () => ECHO.UI;
  const Ti = () => ECHO.Titans;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // what each element does when it lands
  const ELEM = {
    fire: { col: '#ff7a2a', tele: 'rgba(255,120,40,0.34)', type: 'fire', word: 'fire' },
    frost: { col: '#bfe8ff', tele: 'rgba(170,220,255,0.34)', type: 'magic', word: 'frost' },
    venom: { col: '#9fe05a', tele: 'rgba(150,220,80,0.34)', type: 'magic', word: 'venom' },
    storm: { col: '#bfe0ff', tele: 'rgba(150,180,255,0.36)', type: 'magic', word: 'lightning' },
    sun: { col: '#fff0a0', tele: 'rgba(255,240,150,0.36)', type: 'fire', word: 'sunfire' },
    void: { col: '#a87aff', tele: 'rgba(150,90,255,0.36)', type: 'magic', word: 'void' },
    earth: { col: '#c8a878', tele: 'rgba(200,170,120,0.34)', type: 'melee', word: 'stone' }
  };
  const ARMOR = {
    fire: { fire: 0.7, melee: 0.1, ranged: 0.15 }, frost: { fire: -0.3, melee: 0.15, ranged: 0.1 }, venom: { fire: -0.15, melee: 0.1, ranged: 0.2 },
    storm: { ranged: 0.35, melee: 0.05 }, sun: { fire: 0.8, melee: 0.15, ranged: 0.15 }, void: { melee: 0.2, ranged: 0.3, fire: 0.2 }, earth: { melee: 0.3, ranged: 0.25, fire: -0.1 }
  };
  // the young and the hangers-on of a titan's range
  const BROOD = {
    frosthound: { name: 'Frost hound', hp: 60, dmg: 11, speed: 4.6, reach: 1.25, wind: 0.34, cd: 1.0, tier: 4, shape: 'hound', scale: 1.05, col: '#dfe8f0', em: '#8fd8ff', f2d: 'grayscale(1) brightness(1.7)', ab: { pack: true }, resist: { fire: -0.3 }, loot: [['winterpelt', 0.05, 1, 1]], gold: [4, 14], desc: 'White hounds that run with the frost dragon.', weak: 'Fire.' },
    stormwisp: { name: 'Storm wisp', hp: 50, dmg: 10, speed: 3.6, reach: 1.2, wind: 0.5, cd: 1.6, tier: 4, shape: 'horror', scale: 0.6, col: '#1a2440', em: '#bfe0ff', f2d: 'hue-rotate(200deg) brightness(1.2)', ab: { bolt: { color: '#bfe0ff', dmg: 1.2, cd: 3, type: 'magic' } }, resist: { ranged: 0.3 }, loot: [['ecto', 0.4, 1, 1]], gold: [3, 10], desc: 'A knot of lightning that hangs in the air where storms have been.', weak: 'Close in; it is frail.' },
    sunling: { name: 'Sunling', hp: 70, dmg: 12, speed: 3.8, reach: 1.4, wind: 0.5, cd: 1.3, tier: 4, shape: 'drake', scale: 0.4, col: '#c8962a', belly: '#fff0a0', em: '#ffd84a', f2d: 'sepia(1) saturate(3) brightness(1.2)', ab: { bolt: { color: '#ffe08a', dmg: 1.2, cd: 3.4, type: 'fire' } }, resist: { fire: 0.7 }, loot: [['dragonscale', 0.1, 1, 1]], gold: [6, 18], desc: 'A golden whelp. It spits sunlight.', weak: 'Steel.' },
    voidshade: { name: 'Voidshade', hp: 62, dmg: 13, speed: 3.4, reach: 1.3, wind: 0.5, cd: 1.4, tier: 4, ab: { teleport: { cd: 6 }, drain: 0.4 }, resist: { melee: 0.3, ranged: 0.4 }, vis: { cloth: '#14101c', cloth2: '#0a0810', skin: '#2a2040', hair: '#14101c', show: ['robe', 'hood'], em: '#3a1a6a', opacity: 0.6, f2d: 'brightness(0.4) hue-rotate(250deg)' }, loot: [['ecto', 0.6, 1, 2]], gold: [5, 15], desc: 'A shadow left behind where the void dragon has fed.', weak: 'Fire, and light.' },
    tuskling: { name: 'Tuskling', hp: 55, dmg: 10, speed: 4.2, reach: 1.2, wind: 0.4, cd: 1.1, tier: 3, shape: 'hound', scale: 0.95, col: '#6a4a32', em: '#2a1a10', f2d: 'sepia(0.8) brightness(0.8)', ab: { pack: true, charge: { cd: 9 } }, loot: [['hide', 0.5, 1, 1]], gold: [1, 6], desc: 'The young of the great horned beast. They charge as their parent does.', weak: 'Sidestep, then strike.' }
  };
  // what they do: ground and air
  const ATK = {
    bite: { shape: 'cone', len: 3, arc: 1.0, wind: 0.55, mult: 1.25, cd: 1.3 },
    sweep: { shape: 'cone', len: 3.6, arc: 2.6, wind: 0.7, mult: 0.95, cd: 1.4 },
    stomp: { shape: 'circle', radius: 3, wind: 0.75, mult: 1.0, cd: 1.6, quake: true },
    breath: { shape: 'line', len: 7, width: 1.8, wind: 0.85, mult: 0.9, cd: 1.8, elem: true },
    gore: { shape: 'line', len: 6, width: 1.5, wind: 0.6, mult: 1.35, cd: 1.8, charge: true },
    spit: { shape: 'rain', n: 3, radius: 1.5, spread: 2.5, wind: 0.9, mult: 0.8, cd: 2, elem: true },
    quake: { shape: 'rain', n: 5, radius: 1.8, spread: 4, wind: 1.1, mult: 0.9, cd: 2.4 },
    // from the air
    strafe: { shape: 'line', len: 13, width: 2.2, wind: 1.05, mult: 1.0, cd: 2.4, elem: true, air: true, through: true },
    rain: { shape: 'rain', n: 6, radius: 1.7, spread: 5, wind: 1.2, mult: 0.85, cd: 2.4, elem: true, air: true },
    dive: { shape: 'circle', radius: 2.8, wind: 1.15, mult: 1.6, cd: 1.6, air: true, dive: true, atTarget: true }
  };
  const GROUND = { drake: ['bite', 'sweep', 'breath', 'stomp'], stag: ['gore', 'stomp', 'sweep', 'bite'], wyrm: ['bite', 'sweep', 'spit', 'quake'] };

  const A = ECHO.Apex = {
    ELEM, BROOD, t: 0, told: {}, SEAT: 1.76,   // how high its back is, per unit of its size
    install() { Object.assign(ECHO.Monsters.DEFS, BROOD); Object.assign(ECHO.Quests.FOES, BROOD); },
    reset(game) { A.t = 0; A.fly = null; if (game && game.pl) game.pl.flying = null; },
    ents(game) { return game.ents.filter(e => e.titan && !e.dead); },
    entOf(game, id) { return game.ents.find(e => e.titan === id && !e.dead && !e.vanish) || null; },
    // How strong a bound beast fights for you: never more than a little past your own level.
    effLv(game, t) { return Math.min(t.lvl, ECHO.Prowess.level(game.pl) + 15); },

    // ------------------------------------------------------------ bodies
    make(game, t, x, y, tamed) {
      const sp = Ti().sp(t), L = tamed ? A.effLv(game, t) : t.lvl, FM = ECHO.Prowess.foeMul(L, true);
      const maxHp = Math.round(900 * FM.hp * (sp.flies ? 1 : 1.15));
      const b = { id: t.id, name: t.name, title: t.title, kind: sp.kind, maxHp, hp: maxHp * U.clamp(t.hp || 1, 0.2, 1), alive: true, color: sp.color, belly: sp.belly,
        armor: { ...(ARMOR[sp.element] || {}) }, scars: [], kills: 0, memory: { encounters: 0, dodge: { left: 0, right: 0, back: 0 }, blocks: 0, attacksSeen: 0, rangedTime: 0, meleeTime: 0, damageBy: { melee: 0, ranged: 0, fire: 0 }, knownFoes: {} } };
      const e = ECHO.Ent.make({ type: 'boss', x, y, r: 0.85 + sp.scale * 0.35, hp: b.hp, maxHp, speed: sp.flies ? 3.4 : 3.9, faction: tamed ? 'player' : 'wild', boss: b, lair: { id: t.id, x: t.x, y: t.y, rocks: [] }, state: 'roost', t: 0, cd: 1.5, label: `${t.name} ${t.title}` });
      e.enc = { dmg: { melee: 0, ranged: 0, fire: 0 }, started: false };
      e.titan = t.id; e.lvl = L; e._plv = L; e.dmgBase = 18 * FM.dmg; e.alt = 0; e.altGoal = 0; e.tscale = sp.scale; e.flies = sp.flies; e.elem = sp.element;
      if (tamed) { e.tamed = true; e.label = `${t.name} (yours)`; e.state = 'follow'; }
      return e;
    },

    // ------------------------------------------------------------ every frame
    update(game, dt) {
      const world = game.world, pe = game.pe, pl = game.pl;
      if (!world.titans) return;
      if (pl.flying && (game.defeating || pe.dead || pl.capture)) A.finishLand(game);
      if (pl.flying && !A.entOf(game, pl.flying) && !ECHO.Interior.cur) A.spawnTamed(game, Ti().byId(world, pl.flying), true);
      A.t -= dt;
      if (A.t > 0) return;
      A.t = 0.5;
      if (ECHO.Interior.cur) return;
      // the wild ones, near you
      for (const t of world.titans.list) {
        if (!t.alive || t.bound) continue;
        const d = U.dist(t.x, t.y, pe.x, pe.y), e = A.entOf(game, t.id);
        if (d < 62 && !e) {
          const ne = A.make(game, t, t.x, t.y, false);
          if (Ti().sp(t).flies && !A.night(world)) { ne.state = 'patrol'; ne.alt = ne.altGoal = 5; }
          game.ents.push(ne);
        } else if (d > 78 && e) { e.dead = true; e.vanish = true; t.hp = e.hp / e.maxHp; }
        if (!t.seen && d < 52) {
          t.seen = true;
          const sp = Ti().sp(t), D = ECHO.Prowess.diff(t.lvl, ECHO.Prowess.level(pl));
          UI().banner(`${t.name} ${t.title}`, `${sp.flies ? 'A dragon' : 'A great beast'} · level ${t.lvl} · this is its range`, false);
          if (!A.told.first) { A.told.first = true; setTimeout(() => UI().toast(`${sp.desc} ${D.skulls >= 2 ? 'It is far beyond you — stay off its range.' : 'Beat it down and you can bind it: it will fight for you' + (sp.flies ? ', and carry you through the sky.' : '.')}`, D.skulls >= 2 ? 'warn' : 'legend', 8), 900); }
        }
        // its young about the roost, as you come close
        if (d < 34 && !A.broodNear(game, t)) A.brood(game, t);
      }
      // your beast at your side
      if (pl.beastOut && !A.entOf(game, pl.beastOut)) {
        const t = Ti().byId(world, pl.beastOut);
        if (!t || !t.bound || !t.alive) pl.beastOut = null;
        else A.spawnTamed(game, t, false);
      }
    },
    night(world) { const h = world.minute / 60; return h < 5.5 || h > 21; },
    broodNear(game, t) { return game.ents.some(e => e.broodOf === t.id && !e.dead); },
    brood(game, t) {
      const sp = Ti().sp(t);
      if (t._brood && game.time - t._brood < 120) return;
      t._brood = game.time;
      const n = 2 + Math.floor(Math.random() * 3), L = Math.max(1, Math.round(t.lvl * 0.45));
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.28, sp0 = ECHO.Ent.freeSpot(game.world, t.x + Math.cos(a) * (4 + Math.random() * 4), t.y + Math.sin(a) * (4 + Math.random() * 4), 3);
        if (!sp0) continue;
        const m = ECHO.Monsters.make(game, sp.brood, sp0.x, sp0.y, L, { eliteChance: 0.1 });
        m.gab = {}; m.broodOf = t.id; m.home = { x: sp0.x, y: sp0.y };
        game.ents.push(m);
      }
    },
    spawnTamed(game, t, riding) {
      if (!t) return null;
      const pe = game.pe, sp = Ti().sp(t);
      if ((t.restUntil || 0) > game.world.day) { game.pl.beastOut = null; return null; }
      const at = ECHO.Ent.freeSpot(game.world, pe.x - 1.8, pe.y + 1.2, 6) || { x: pe.x, y: pe.y };
      const e = A.make(game, t, riding ? pe.x : at.x, riding ? pe.y : at.y, true);
      if (sp.flies && !riding) { e.alt = 6; e.altGoal = 0; }
      game.ents.push(e);
      return e;
    },

    // ------------------------------------------------------------ thinking (from Boss.update)
    think(game, e, dt) {
      if (ECHO.Interior.cur) { e.dead = true; e.vanish = true; return; }   // no titan fits through a door
      e.t += dt; e.cd = Math.max(0, e.cd - dt);
      e.boss.hp = e.hp;
      // height: rising and settling
      if (e.alt !== e.altGoal) { const r = (e.altGoal > e.alt ? 3.2 : 4.5) * dt; e.alt = Math.abs(e.altGoal - e.alt) < r ? e.altGoal : e.alt + Math.sign(e.altGoal - e.alt) * r; }
      if (e.tamed) return A.tamed(game, e, dt);
      return A.wild(game, e, dt);
    },
    wild(game, e, dt) {
      const world = game.world, pe = game.pe, pl = game.pl, t = Ti().byId(world, e.titan);
      if (!t) { e.dead = true; e.vanish = true; return; }
      t.hp = e.hp / e.maxHp;
      if (e.state === 'subdued') return A.subdued(game, e, t, dt);
      if (e.atk) return A.attackTick(game, e, t, dt);
      const d = U.dist(e.x, e.y, pe.x, pe.y), home = { x: t.x, y: t.y };
      const hostile = !pe.dead && !game.defeating && !pl.capture && !pl.flying;
      const onRange = U.dist(pe.x, pe.y, home.x, home.y) < t.r + 3;
      if (e.aggro) {
        if (!hostile || U.dist(pe.x, pe.y, home.x, home.y) > t.r + 24 || d > 34) { e.aggro = false; e.state = 'return'; if (UI().bossEnt === e) UI().bossBar(null); }
        else return A.fight(game, e, t, dt, d);
      }
      // it notices you on its range
      if (hostile && onRange && d < (e.alt > 2 ? 15 : 10)) {
        e.aggro = true; e.phase = e.alt > 2 ? 'air' : 'ground'; e.phaseT = 0; e.airN = 0; e.state = 'roar'; e.t = 0;
        game.shake(0.5); if (ECHO.Sfx) ECHO.Sfx.play('roar', { pitch: 1 / Math.sqrt(e.tscale) });
        UI().bossBar(e);
        ECHO.Combat.ring(e.x, e.y, 4, 'rgba(255,220,180,0.6)', 0.7);
        const D = ECHO.Prowess.diff(e.lvl, ECHO.Prowess.level(pl));
        if (D.skulls >= 3 && !A.told['run' + t.id]) { A.told['run' + t.id] = true; UI().toast(`${t.name} is level ${t.lvl}. You are not. Get off its range — now.`, 'warn', 5); }
        return;
      }
      switch (e.state) {
        case 'return': {
          e.altGoal = e.flies ? 4 : 0;
          if (A.go(game, e, home.x, home.y, e.flies ? 7 : 3.6, dt) < 1.5) { e.state = 'roost'; e.t = 0; e.altGoal = 0; }
          if (e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.02 * dt);
          return;
        }
        case 'roost': {
          e.moving = false; e.altGoal = 0;
          if (e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.01 * dt);
          if (!A.night(world) && e.t > 14 + (e.titanSeed || 0)) { e.state = e.flies ? 'patrol' : 'roam'; e.t = 0; e.titanSeed = Math.random() * 12; }
          return;
        }
        case 'patrol': case 'roam': {
          // circles its range from the sky, or walks it
          e.orb = (e.orb || Math.random() * 6) + dt * (e.flies ? 0.22 : 0.08);
          const rr = e.flies ? t.r * 0.8 : 6;
          e.altGoal = e.flies ? 5 : 0;
          A.go(game, e, home.x + Math.cos(e.orb) * rr, home.y + Math.sin(e.orb) * rr * 0.8, e.flies ? 5 : 1.6, dt);
          if (e.t > 9 && Math.random() < dt * 0.08) { const prey = A.preyNear(game, e, t); if (prey) { e.prey = prey; e.state = 'hunt'; e.t = 0; } }
          if (e.t > 45 || A.night(world)) { e.state = 'return'; e.t = 0; }
          return;
        }
        case 'hunt': {
          const p = e.prey;
          if (!p || p.dead || U.dist(p.x, p.y, home.x, home.y) > t.r + 10 || e.t > 20) { e.prey = null; e.state = 'return'; return; }
          e.altGoal = U.dist(e.x, e.y, p.x, p.y) < 4 ? 0.5 : e.flies ? 4 : 0;
          if (A.go(game, e, p.x, p.y, e.flies ? 8 : 5, dt) < e.r + 0.8) {
            ECHO.Combat.burst(p.x, p.y, '#7a1d24', 18, 3, 0.6, 3);
            ECHO.Combat.kill(p, e, 'melee', {});
            if (U.dist(e.x, e.y, pe.x, pe.y) < 24) ECHO.Combat.floater(e.x, e.y - 2.5 - e.alt, `${t.name} takes ${p.species === 'deer' ? 'a deer' : 'its prey'}`, '#ffcf8a');
            e.state = 'feed'; e.t = 0; e.prey = null; t.fed = world.day; t.hunger = 0;
          }
          return;
        }
        case 'feed': e.moving = false; e.altGoal = 0; if (e.t > 5) { e.state = 'roost'; e.t = 0; } return;
        case 'roar': e.moving = false; if (e.t > 1.2) e.state = 'roost'; return;
        default: e.state = 'roost';
      }
    },
    preyNear(game, e, t) {
      let best = null, bd = t.r + 6;
      for (const o of game.ents) {
        if (o.dead || o.hidden || o.type !== 'creature' || o.pet || o.stray || o.humanoid || !['deer', 'hare', 'wolf', 'boar', 'goat'].includes(o.species)) continue;
        const d = U.dist(o.x, o.y, t.x, t.y);
        if (d < bd) { bd = d; best = o; }
      }
      return best;
    },
    // movement: on the wing nothing is in the way; on foot, the usual
    go(game, e, x, y, speed, dt) {
      const d = U.dist(e.x, e.y, x, y);
      if (d < 0.2) { e.moving = false; return d; }
      const a = Math.atan2(y - e.y, x - e.x);
      e.dir = a; e.flip = Math.cos(a) < 0;
      if (e.flies && e.alt > 1.2) {
        const s = Math.min(d, speed * dt);
        e.x = U.clamp(e.x + Math.cos(a) * s, 3, game.world.W - 3); e.y = U.clamp(e.y + Math.sin(a) * s, 3, game.world.H - 3);
        e.moving = true;
      } else {
        // a body this size walks through brush and saplings; only walls, cliffs and deep water stop it
        const world = game.world, s = Math.min(d, speed * dt);
        const ok = (px, py) => !ECHO.World.isSolid(world, px, py) && !(ECHO.Water && ECHO.Water.kind(world, px, py) === 'deep');
        let moved = false;
        for (const off of [0, 0.6, -0.6, 1.2, -1.2]) {
          const nx = e.x + Math.cos(a + off) * s, ny = e.y + Math.sin(a + off) * s;
          if (ok(nx, ny)) { e.x = nx; e.y = ny; moved = true; break; }
        }
        e.moving = moved;
        e._blockT = moved ? 0 : (e._blockT || 0) + dt;
        // boxed in: a dragon hops into the air
        if (e._blockT > 0.6 && e.flies) { e.altGoal = 3; e._blockT = 0; }
      }
      return d;
    },

    // ------------------------------------------------------------ the fight
    fight(game, e, t, dt, d) {
      const pe = game.pe, ang = Math.atan2(pe.y - e.y, pe.x - e.x);
      if (e.state === 'roar') { e.moving = false; e.dir = ang; if (e.t > 1.2) { e.state = 'fight'; e.t = 0; } return; }
      e.phaseT = (e.phaseT || 0) + dt;
      if (e.flies) {
        const low = e.hp < e.maxHp * 0.5;
        if (e.phase === 'ground' && e.phaseT > (low ? 7 : 11) + Math.random() * 3 && !e.atk) {
          e.phase = 'air'; e.phaseT = 0; e.airN = 0; e.altGoal = 5.5;
          ECHO.Combat.ring(e.x, e.y, 3.5, 'rgba(230,230,255,0.7)', 0.6); game.shake(0.3);
          for (let i = 0; i < 24; i++) { const a = i / 24 * 6.28; ECHO.Combat.fx.push({ kind: 'p', x: e.x + Math.cos(a), y: e.y + Math.sin(a), vx: Math.cos(a) * 5, vy: Math.sin(a) * 5, t: 0, life: 0.6, color: 'rgba(220,210,190,0.7)', size: 3 }); }
          if (!A.told.air) { A.told.air = true; UI().toast('It took to the air — out of reach of your blade. Arrows and fire can still reach it, or wait for it to come down. Watch the ground for what it is about to do.', 'study', 7); }
        }
        if (e.phase === 'air' && e.airN >= (low ? 4 : 3) && !e.atk) { e.phase = 'ground'; e.phaseT = 0; e.altGoal = 0; }
      }
      if (e.phase === 'air') {
        e.altGoal = 5.5;
        e.orb = (e.orb || ang + Math.PI) + dt * 0.55;
        A.go(game, e, pe.x + Math.cos(e.orb) * 8, pe.y + Math.sin(e.orb) * 8, 7.5, dt);
        if (e.cd <= 0 && e.alt > 4) {
          const k = Math.random() < 0.38 ? 'strafe' : Math.random() < 0.55 ? 'rain' : 'dive';
          e.airN++;
          return A.start(game, e, t, k);
        }
        return;
      }
      // on the ground
      e.altGoal = 0;
      if (e.alt > 0.6) return;
      const want = e.r + 1.3;
      if (d > want) A.go(game, e, pe.x, pe.y, (e.flies ? 3.4 : 3.9) * (d > 8 ? 1.35 : 1), dt); else { e.moving = false; e.dir = ang; e.flip = Math.cos(ang) < 0; }
      if (e.cd <= 0 && d < 8) {
        const kind = Ti().sp(t).kind, opts = GROUND[kind].filter(k => {
          const a = ATK[k];
          if (k === 'breath' || k === 'gore' || k === 'spit') return d > 2.5;
          if (k === 'quake') return true;
          return d < (a.len || a.radius || 3) + 0.6;
        });
        if (opts.length) return A.start(game, e, t, opts[Math.floor(Math.random() * opts.length)]);
      }
    },
    start(game, e, t, k) {
      const pe = game.pe, a0 = ATK[k], el = ELEM[e.elem] || ELEM.earth;
      const ang = Math.atan2(pe.y - e.y, pe.x - e.x);
      const a = { k, ...a0, t: 0, ang };
      e.atk = a; e.state = k === 'dive' ? 'roar' : 'windup'; e.moving = false; e.dir = ang; e.flip = Math.cos(ang) < 0; e.aim = ang;
      const col = a.elem ? el.tele : 'rgba(255,60,50,0.3)';
      if (a.shape === 'cone') ECHO.Combat.telegraph({ x: e.x, y: e.y, angle: ang, len: a.len * Math.max(1, e.tscale * 0.7), arc: a.arc, life: a.wind, shape: 'cone', color: col, follow: e });
      else if (a.shape === 'circle') { a.cx = a.atTarget ? pe.x : e.x; a.cy = a.atTarget ? pe.y : e.y; ECHO.Combat.telegraph({ x: a.cx, y: a.cy, cx: a.cx, cy: a.cy, radius: a.radius, life: a.wind, shape: 'circle', color: col }); }
      else if (a.shape === 'line') {
        // a strafing run starts behind you and goes through you
        if (a.through) { a.x0 = pe.x - Math.cos(ang) * a.len * 0.45; a.y0 = pe.y - Math.sin(ang) * a.len * 0.45; } else { a.x0 = e.x; a.y0 = e.y; }
        ECHO.Combat.telegraph({ x: a.x0, y: a.y0, angle: ang, len: a.len, width: a.width, life: a.wind, shape: 'line', color: col });
      } else if (a.shape === 'rain') {
        a.spots = [];
        for (let i = 0; i < a.n; i++) { const r = i === 0 ? 0 : 1.2 + Math.random() * a.spread, aa = Math.random() * 6.28; a.spots.push({ x: pe.x + Math.cos(aa) * r, y: pe.y + Math.sin(aa) * r }); }
        for (const s of a.spots) ECHO.Combat.telegraph({ x: s.x, y: s.y, cx: s.x, cy: s.y, radius: a.radius, life: a.wind, shape: 'circle', color: col });
      }
      if (a.charge) e.chargeAng = ang;
    },
    attackTick(game, e, t, dt) {
      const a = e.atk;
      a.t += dt; e.moving = false;
      if (a.dive) { e.altGoal = Math.max(0, 5.5 - a.t * 5); const p = a.t / a.wind; e.x = U.lerp(e.x, a.cx, Math.min(1, dt * 3 * p)); e.y = U.lerp(e.y, a.cy, Math.min(1, dt * 3 * p)); }
      if (a.charge && a.t > a.wind * 0.6) { const sp = 11 * dt; ECHO.Ent.move(game.world, e, Math.cos(a.ang) * sp, Math.sin(a.ang) * sp); e.moving = true; }
      if (a.t < a.wind) return;
      A.strike(game, e, t, a);
      e.atk = null; e.state = 'fight'; e.cd = a.cd * (e.hp < e.maxHp * 0.35 ? 0.75 : 1);
      if (a.dive) { e.alt = 0; e.altGoal = 0; e.phase = 'ground'; e.phaseT = 0; }
    },
    // who a blow can land on: you and those on your side (or, for your beast, its foes)
    strike(game, e, t, a) {
      const pe = game.pe, el = ELEM[e.elem] || ELEM.earth;
      const targets = game.ents.filter(o => !o.dead && !o.hidden && o !== e && (e.tamed ? (game.hostileTo(pe, o) && o.type !== 'person') || (o.type === 'boss' && !o.tamed) || o.foe : (o === pe || o.isCompanion || o.tamed || o.mentor || (o.type === 'person' && game.hostileTo(e, o)))));
      const hit = (x, y) => {
        if (a.shape === 'cone') { const dd = U.dist(e.x, e.y, x, y); return dd < a.len * Math.max(1, e.tscale * 0.7) + 0.4 && Math.abs(U.angleDiff(a.ang, Math.atan2(y - e.y, x - e.x))) < a.arc / 2; }
        if (a.shape === 'circle') return U.dist(x, y, a.cx, a.cy) < a.radius + 0.35;
        if (a.shape === 'line') { const lx = Math.cos(a.ang), ly = Math.sin(a.ang), tt = (x - a.x0) * lx + (y - a.y0) * ly, perp = Math.abs((x - a.x0) * ly - (y - a.y0) * lx); return tt > -0.3 && tt < a.len && perp < a.width / 2 + 0.35; }
        if (a.shape === 'rain') return a.spots.some(s => U.dist(x, y, s.x, s.y) < a.radius + 0.3);
        return false;
      };
      const dmg = e.dmgBase * a.mult * (e.elem === 'sun' && a.elem ? 1.15 : 1);
      const type = a.elem ? el.type : 'melee';
      for (const o of targets) {
        if (!hit(o.x, o.y)) continue;
        const got = ECHO.Combat.damage(o, dmg, { type, from: e, angle: Math.atan2(o.y - e.y, o.x - e.x), knock: a.quake || a.dive ? 0.7 : 0.35 });
        if (got > 0 && a.elem) A.effect(game, e, o, got);
      }
      // what it looks like
      const fx = (x, y, n) => { for (let i = 0; i < n; i++) ECHO.Combat.fx.push({ kind: 'p', x: x + (Math.random() - 0.5) * 1.2, y: y + (Math.random() - 0.5) * 1.2, vx: (Math.random() - 0.5) * 4, vy: -1 - Math.random() * 2, t: 0, life: 0.6, color: Math.random() < 0.5 ? el.col : '#ffffff', size: 3 }); };
      if (a.shape === 'line') { for (let s = 0; s < a.len; s += 0.7) fx(a.x0 + Math.cos(a.ang) * s, a.y0 + Math.sin(a.ang) * s, 2); if (a.through) { e.x = U.clamp(a.x0 + Math.cos(a.ang) * a.len, 3, game.world.W - 3); e.y = U.clamp(a.y0 + Math.sin(a.ang) * a.len, 3, game.world.H - 3); } }
      else if (a.shape === 'rain') for (const s of a.spots) { fx(s.x, s.y, 10); ECHO.Combat.ring(s.x, s.y, a.radius, 'rgba(255,240,220,0.8)', 0.4); }
      else if (a.shape === 'circle') { ECHO.Combat.ring(a.cx, a.cy, a.radius, 'rgba(255,230,200,0.9)', 0.4); ECHO.Combat.burst(a.cx, a.cy, '#8d8576', 24, 5, 0.7, 3); }
      else ECHO.Combat.slash(e.x, e.y - 0.3, a.ang, a.len * Math.max(1, e.tscale * 0.7), a.arc, 'rgba(255,230,210,0.85)');
      if (a.dive || a.quake || a.shape === 'rain') game.shake(a.dive ? 0.7 : 0.35);
      if (ECHO.Sfx) ECHO.Sfx.play(a.shape === 'circle' || a.shape === 'rain' ? 'stomp' : 'hit', { pitch: 0.6 });
      if (a.elem && el.type === 'fire') game.light(e.x + Math.cos(a.ang) * 3, e.y + Math.sin(a.ang) * 3, 7, 0.6, el.col);
    },
    // what its element does to you
    effect(game, e, o, got) {
      const pl = game.pl, pe = game.pe;
      switch (e.elem) {
        case 'fire': case 'sun': o.burn = Math.max(o.burn || 0, 2.5); if (o === pe && e.elem === 'sun') game.hurtFlash(1); break;
        case 'frost': if (o === pe) { pl.slowT = Math.max(pl.slowT || 0, 2.5); ECHO.Combat.floater(pe.x, pe.y - 1.2, 'frozen', '#bfe8ff'); } else o.stagger = Math.max(o.stagger || 0, 1); break;
        case 'venom': if (o === pe) { pl.poisonT = 5; pl.poisonDps = Math.max(pl.poisonDps || 0, pl.maxHp * 0.03); ECHO.Combat.floater(pe.x, pe.y - 1.2, 'poisoned', '#9fe05a'); } break;
        case 'storm': o.stagger = Math.max(o.stagger || 0, 0.5); if (o === pe) ECHO.Combat.floater(pe.x, pe.y - 1.2, 'jolted', '#bfe0ff'); break;
        case 'void': e.hp = Math.min(e.maxHp, e.hp + got * 0.3); ECHO.Combat.floater(e.x, e.y - 2 - e.alt, 'drinks', '#a87aff'); break;
      }
    },

    // ------------------------------------------------------------ beaten
    // Called from Combat.damage for any titan: blows on the wing, and the fall.
    preDamage(game, e, dmg, src) {
      if (e.tamed) {
        if (e.hp - dmg <= 1) { A.spent(game, e); return Math.max(0, e.hp - 1); }
        return dmg;
      }
      if (e.state === 'subdued') return 0;
      if (e.alt > 1.4 && src.type === 'melee') { if (!e._reachT || game.time - e._reachT > 0.8) { e._reachT = game.time; ECHO.Combat.floater(e.x, e.y - 1.5, 'out of reach', '#c8c0b0'); } return 0; }
      if (!e.aggro && src.from === game.pe) { e.aggro = true; e.phase = e.alt > 2 ? 'air' : 'ground'; e.phaseT = 0; e.airN = 0; e.state = 'fight'; UI().bossBar(e); }
      if (e.hp - dmg <= e.maxHp * 0.1) { A.subdue(game, e); return Math.max(0, e.hp - e.maxHp * 0.1); }
      return dmg;
    },
    subdue(game, e) {
      const t = Ti().byId(game.world, e.titan);
      e.state = 'subdued'; e.atk = null; e.aggro = false; e.altGoal = 0; e.subT = 50; e.moving = false;
      if (e.alt > 0.5) { e.alt = 0; game.shake(0.8); ECHO.Combat.burst(e.x, e.y, '#8d8576', 40, 6, 0.9, 3); }
      ECHO.Combat.floater(e.x, e.y - 2.5, `${t ? t.name : 'It'} is beaten!`, '#ffe08a', true);
      if (ECHO.Music) ECHO.Music.stinger('discover');
      UI().toast(`${t.name} lies in the dust, beaten. Bind it (E) and it is yours (${Ti().bound(game.world).length}/${Ti().MAX_BOUND}) — or finish it. It will not stay down long.`, 'legend', 9);
    },
    subdued(game, e, t, dt) {
      e.moving = false; e.altGoal = 0;
      e.subT -= dt;
      if (Math.random() < dt * 2) ECHO.Combat.fx.push({ kind: 'p', x: e.x + (Math.random() - 0.5) * 2, y: e.y - 0.5, vx: 0, vy: -0.6, t: 0, life: 1, color: '#ffe08a', size: 2 });
      if (e.subT <= 0) {
        e.hp = e.maxHp * 0.35; e.state = 'return'; e.aggro = false;
        if (UI().bossEnt === e) UI().bossBar(null);
        UI().toast(`${t.name} shakes off its daze and makes for its roost.`, 'warn', 4);
      }
    },
    interactables(game) {
      const out = [], pe = game.pe, pl = game.pl;
      if (pl.flying) return out;
      for (const e of A.ents(game)) {
        const d = U.dist(e.x, e.y, pe.x, pe.y), t = Ti().byId(game.world, e.titan);
        if (!t) continue;
        if (e.state === 'subdued' && d < e.r + 3) {
          out.push({ kind: 'act', label: `Bind ${t.name} — make it yours (${Ti().bound(game.world).length}/${Ti().MAX_BOUND})`, d: d * 0.4, act: () => A.bind(game, e, t) });
          out.push({ kind: 'act', label: `Finish ${t.name}`, d: d * 0.4 + 0.3, act: () => A.finish(game, e, t) });
        }
        if (e.tamed && e.flies && e.alt < 0.5 && d < e.r + 2.5 && !pl.mounted) out.push({ kind: 'act', label: `Climb onto ${t.name} and fly (V)`, d: d * 0.6, act: () => A.mount(game, e) });
      }
      return out;
    },
    xp(game, e, share) {
      const pl = game.pl, xp = Math.round(ECHO.Prowess.xpFor(pl, e) * share), ups = ECHO.Prowess.gain(pl, xp);
      ECHO.Combat.floater(game.pe.x, game.pe.y - 1.8, `+${U.short(xp)} xp`, '#ffcf5a', true);
      for (const u of ups) ECHO.Progress.levelUp(game, u);
      ECHO.Progress.flash();
    },
    bind(game, e, t) {
      const world = game.world, pl = game.pl;
      if (!Ti().canBind(world)) {
        const mine = Ti().bound(world);
        return UI().modal({ title: 'You can keep four', html: `<p>You already keep ${mine.length} beasts. Set one free to make room for ${esc(t.name)} — it goes back to its old range.</p>`, choices: mine.map(b => ({ label: `Set ${b.name} free`, sub: `${Ti().sp(b).flies ? 'Dragon' : 'Great beast'} · level ${b.lvl}`, onPick: () => { if (pl.beastOut === b.id) A.dismiss(game); Ti().release(world, b, pl); A.bind(game, e, t); } })).concat([{ label: 'Leave it', onPick: () => {} }]) });
      }
      Ti().bind(world, t, pl);
      A.xp(game, e, 1);
      t.hp = 0.6; t.restUntil = world.day;
      e.dead = true; e.vanish = true;
      if (UI().bossEnt === e) UI().bossBar(null);
      ECHO.Combat.ring(e.x, e.y, 3, 'rgba(255,224,138,0.95)', 1); ECHO.Combat.burst(e.x, e.y, '#ffe08a', 40, 4, 1, 3);
      if (ECHO.Music) ECHO.Music.stinger('echo');
      UI().banner(`${t.name} is yours`, `${t.title} · level ${t.lvl}`, false);
      pl.beastOut = t.id; pl.beastLast = t.id;
      const ne = A.spawnTamed(game, t, false); if (ne) { ne.x = e.x; ne.y = e.y; ne.alt = 0; ne.altGoal = 0; ne.hp = ne.maxHp * 0.6; }
      setTimeout(() => UI().toast(`${t.name} follows you now and fights at your side (at most 15 levels above your own). ${Ti().sp(t).flies ? 'Stand by it and press V to fly. ' : ''}Y calls or sends away your beast; your character page (K) shows all of them.`, 'legend', 9), 800);
    },
    finish(game, e, t) {
      const world = game.world, pl = game.pl, r = Math.random, L = e.lvl;
      A.xp(game, e, 1.1);
      const add = (kind, qty) => game.loot.push({ x: e.x + (r() - 0.5) * 3, y: e.y + (r() - 0.5) * 3, kind, qty });
      add('dragonscale', Ti().sp(t).flies ? 3 + Math.floor(r() * 4) : 0); add('greathide', 2 + Math.floor(r() * 2)); add('greatfang', 2); if (r() < 0.6) add('heartstone', 1 + Math.floor(r() * 2));
      add('gold', Math.round(200 + Math.min(L, 150) * 12));
      for (let i = 0; i < 2; i++) ECHO.Monsters.dropGear(game, e.x + (r() - 0.5) * 2, e.y + (r() - 0.5) * 2, L, 30, `in the hoard of ${t.name}`);
      Ti().slain(world, t, `${pl.first} ${pl.last}`);
      pl.renown += 40;
      e.dead = true; e.deathT = 0;
      if (UI().bossEnt === e) UI().bossBar(null);
      ECHO.Combat.burst(e.x, e.y, '#5a1f1f', 50, 6, 1.3, 3); game.shake(0.8);
      UI().banner(`${t.name} is dead`, t.title, false);
    },

    // ------------------------------------------------------------ yours
    tamed(game, e, dt) {
      const world = game.world, pe = game.pe, pl = game.pl, t = Ti().byId(world, e.titan);
      if (!t || !t.bound) { e.dead = true; e.vanish = true; return; }
      t.hp = e.hp / e.maxHp;
      // under you, in the sky
      if (pl.flying === t.id) { e.x = pe.x; e.y = pe.y - 0.02; e.dir = pe.dir; e.flip = Math.cos(pe.dir) < 0; e.alt = Math.max(0, (pe.alt || 0) - A.SEAT * e.tscale); e.altGoal = e.alt; e.moving = !!pe.moving; e.state = 'stalk'; return; }
      if (e.atk) return A.attackTick(game, e, t, dt);
      if (e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.01 * dt);
      const d = U.dist(e.x, e.y, pe.x, pe.y);
      if (d > 40) { const sp = ECHO.Ent.freeSpot(world, pe.x - 2, pe.y + 1.5, 6); if (sp) { e.x = sp.x; e.y = sp.y; if (e.flies) e.alt = 5; } }
      // something hostile near you: it goes for it
      let foe = null, bd = 9;
      for (const o of game.ents) {
        if (o.dead || o.hidden || o === e || o.tamed || o.isCompanion || o.ngWard || o === pe) continue;
        if (!(o.foe || (o.type === 'boss' && !o.tamed) || (o.type === 'creature' && game.hostileTo(pe, o) && (o.aggro || o.target === pe)) || (o.type === 'person' && game.hostileTo(pe, o)))) continue;
        if (o.titan && o.state === 'subdued') continue;
        const dd = U.dist(o.x, o.y, pe.x, pe.y);
        if (dd < bd) { bd = dd; foe = o; }
      }
      if (foe) {
        e.altGoal = 0; e.state = 'fight';
        const df = U.dist(e.x, e.y, foe.x, foe.y), ang = Math.atan2(foe.y - e.y, foe.x - e.x);
        if (df > e.r + foe.r + 1) A.go(game, e, foe.x, foe.y, 5, dt);
        else { e.moving = false; e.dir = ang; e.flip = Math.cos(ang) < 0; }
        if (e.cd <= 0 && e.alt < 0.6) {
          const kind = Ti().sp(t).kind, k = df > 2.6 && (kind === 'drake' || kind === 'wyrm') ? (kind === 'drake' ? 'breath' : 'spit') : df < e.r + foe.r + 1.6 ? (Math.random() < 0.5 ? 'bite' : 'sweep') : null;
          if (k) {
            const a0 = ATK[k];
            e.atk = { k, ...a0, t: 0, ang, x0: e.x, y0: e.y, wind: a0.wind * 0.6 };
            if (a0.shape === 'rain') e.atk.spots = [{ x: foe.x, y: foe.y }, { x: foe.x + 1.5, y: foe.y }, { x: foe.x - 1.5, y: foe.y + 1 }];
            e.state = 'windup';
          }
        }
        return;
      }
      // follow you
      e.state = 'follow';
      if (d > 7 && e.flies) { e.altGoal = 3.5; A.go(game, e, pe.x - 2, pe.y + 1.5, Math.max(6, d * 0.9), dt); }
      else if (d > 3.5) { if (e.alt < 0.6) e.altGoal = 0; A.go(game, e, pe.x - 1.5, pe.y + 1.2, d > 8 ? 6.5 : 4, dt); }
      else { e.moving = false; if (!e.flies || d < 4) e.altGoal = 0; }
    },
    spent(game, e) {
      const t = Ti().byId(game.world, e.titan);
      if (!t) return;
      t.restUntil = game.world.day + 1; t.hp = 0.3;
      if (game.pl.flying === t.id) A.land(game, true);
      game.pl.beastOut = null;
      e.dead = true; e.vanish = true;
      ECHO.Combat.burst(e.x, e.y, '#c8c0b0', 20, 3, 0.8, 3);
      UI().toast(`${t.name} is spent and goes off to lick its wounds. It will answer you again tomorrow.`, 'warn', 5);
    },
    call(game, id) {
      const world = game.world, pl = game.pl, t = Ti().byId(world, id);
      if (!t || !t.bound) return;
      if (ECHO.Interior.cur) return UI().toast(`${t.name} will not fit in here. Call it outside.`, 'info', 3);
      if ((t.restUntil || 0) > world.day) return UI().toast(`${t.name} is still resting. Tomorrow.`, 'info', 3);
      if (pl.beastOut && pl.beastOut !== id) A.dismiss(game, true);
      pl.beastOut = id; pl.beastLast = id;
      if (!A.entOf(game, id)) A.spawnTamed(game, t, false);
      ECHO.Combat.floater(game.pe.x, game.pe.y - 1.6, `${t.name} comes`, '#ffe08a');
    },
    dismiss(game, quiet) {
      const pl = game.pl, e = pl.beastOut && A.entOf(game, pl.beastOut);
      if (pl.flying) return;
      if (e) { e.dead = true; e.vanish = true; ECHO.Combat.burst(e.x, e.y, '#c8c0b0', 14, 3, 0.6, 2); }
      if (!quiet && pl.beastOut) { const t = Ti().byId(game.world, pl.beastOut); if (t) ECHO.Combat.floater(game.pe.x, game.pe.y - 1.6, `${t.name} goes back to the wild places`, '#c8c0b0'); }
      pl.beastOut = null;
    },
    // Y: call your beast, or send it away
    yKey(game) {
      const pl = game.pl;
      if (pl.flying) return;
      if (pl.beastOut) return A.dismiss(game);
      const mine = Ti().bound(game.world);
      if (!mine.length) return UI().toast('You have no beasts. Beat a titan down on its range and bind it.', 'info', 3);
      const id = mine.some(b => b.id === pl.beastLast) ? pl.beastLast : mine[0].id;
      A.call(game, id);
    },

    // ------------------------------------------------------------ the sky
    // V: climb onto your dragon, or bring it down
    vKey(game) {
      const pl = game.pl, pe = game.pe;
      if (pl.flying) { A.land(game); return true; }
      if (pl.mounted) return false;
      const e = A.ents(game).find(o => o.tamed && o.flies && U.dist(o.x, o.y, pe.x, pe.y) < o.r + 2.5);
      if (!e) return false;
      A.mount(game, e);
      return true;
    },
    mount(game, e) {
      const pl = game.pl, pe = game.pe, t = Ti().byId(game.world, e.titan);
      if (!t || pl.mounted || ECHO.Interior.cur) return;
      if (e.hp < e.maxHp * 0.25) return UI().toast(`${t.name} is too hurt to carry you.`, 'info', 3);
      pl.flying = t.id;
      A.fly = { v: 0, dir: pe.dir || 0, up: 0, landing: false, h: 3.4 + A.SEAT * (e.tscale || 1) };
      e.atk = null; e.altGoal = 0;
      ECHO.PlayerCtl.unlock && ECHO.PlayerCtl.unlock(game, false);
      ECHO.Combat.ring(pe.x, pe.y, 3, 'rgba(230,230,255,0.7)', 0.6);
      if (!A.told.fly) { A.told.fly = true; UI().toast(`You are on ${t.name}'s back. WASD to fly, Shift to fly fast, V to come down (on open ground). Nothing on the ground can reach you up here.`, 'legend', 8); }
    },
    land(game, force) {
      const F = A.fly, pe = game.pe, world = game.world;
      if (!F) { game.pl.flying = null; pe.alt = 0; return; }
      const solid = ECHO.World.isSolid(world, pe.x, pe.y) || (ECHO.Water && ECHO.Water.kind(world, pe.x, pe.y) === 'deep');
      if (solid && !force) { const sp = ECHO.Ent.freeSpot(world, pe.x, pe.y, 4); if (!sp) return UI().toast('Nowhere to come down here — fly over open ground.', 'info', 2.5); }
      F.landing = true;
      if (force) A.finishLand(game);
    },
    finishLand(game) {
      const pe = game.pe, pl = game.pl, world = game.world;
      const sp = ECHO.Ent.freeSpot(world, pe.x, pe.y, 8) || { x: pe.x, y: pe.y };
      const e = pl.flying && A.entOf(game, pl.flying);
      pe.x = sp.x; pe.y = sp.y; pe.alt = 0; pl.x = pe.x; pl.y = pe.y;
      if (e) { const s2 = ECHO.Ent.freeSpot(world, pe.x - 2, pe.y + 1, 6) || sp; e.x = s2.x; e.y = s2.y; e.alt = 0; e.altGoal = 0; }
      pl.flying = null; A.fly = null;
      ECHO.Combat.ring(pe.x, pe.y, 2.5, 'rgba(220,210,190,0.7)', 0.5); game.shake(0.2);
      game.checkPlace();
    },
    // flying, every frame (instead of walking)
    flyTick(game, dt, mx, my, len) {
      const pe = game.pe, pl = game.pl, world = game.world, In = ECHO.Input;
      const F = A.fly || (A.fly = { v: 0, dir: pe.dir || 0, up: 1, landing: false });
      if (F.landing) { F.up = Math.max(0, F.up - dt / 1.1); F.v *= Math.exp(-dt * 3); if (F.up <= 0) return A.finishLand(game); }
      else F.up = Math.min(1, F.up + dt / 1.3);
      const fast = In.key('Shift');
      const want = len && !F.landing ? (fast ? 21 : 13) : 0;
      F.v += U.clamp(want - F.v, -dt * 9, dt * (fast ? 7 : 5));
      if (len && !F.landing) F.dir += U.angleDiff(F.dir, Math.atan2(my, mx)) * Math.min(1, dt * 3.2);
      pe.x = U.clamp(pe.x + Math.cos(F.dir) * F.v * dt, 3, world.W - 3);
      pe.y = U.clamp(pe.y + Math.sin(F.dir) * F.v * dt, 3, world.H - 3);
      pe.dir = F.dir; pe.flip = Math.cos(F.dir) < 0; pe.moving = F.v > 0.5;
      pe.alt = (F.h || 5.8) * F.up + Math.sin(game.time * 1.6) * 0.15 * F.up;
      pl.x = pe.x; pl.y = pe.y;
      pe.iframes = Math.max(pe.iframes || 0, 0.1);
      if (pl.stamina < pl.maxSta) pl.stamina = Math.min(pl.maxSta, pl.stamina + 20 * dt);
      // wind past you
      if (F.v > 8 && Math.random() < dt * F.v * 0.6) ECHO.Combat.fx.push({ kind: 'p', x: pe.x + (Math.random() - 0.5) * 6, y: pe.y + (Math.random() - 0.5) * 4, vx: -Math.cos(F.dir) * F.v * 0.8, vy: -Math.sin(F.dir) * F.v * 0.8, t: 0, life: 0.5, color: 'rgba(255,255,255,0.5)', size: 2 });
    },

    // ------------------------------------------------------------ the character page
    html(game) {
      const world = game.world, pl = game.pl, mine = world.titans ? Ti().bound(world) : [];
      if (!mine.length) return world.titans && Ti().list(world).some(t => t.seen) ? `<h3 class="gold">Your beasts (0/${Ti().MAX_BOUND})</h3><p class="dim" style="font-size:13px">Beat a dragon or a great beast down on its range and bind it. You can keep four.</p>` : '';
      return `<h3 class="gold">Your beasts (${mine.length}/${Ti().MAX_BOUND})</h3><p class="dim" style="font-size:13px">One at a time walks (or flies) with you and fights for you, at most 15 levels above your own. Y calls or sends away your beast. Stand by a dragon and press V to fly.</p><div class="list">${mine.map(t => {
        const sp = Ti().sp(t), out = pl.beastOut === t.id, rest = (t.restUntil || 0) > world.day;
        return `<div class="card"><h4>${sp.flies ? '🐉' : '🦬'} ${esc(t.name)} <span class="dim">· ${esc(t.title)}</span></h4><div class="dim" style="font-size:13px">${sp.flies ? 'Dragon' : 'Great beast'} of ${esc(ELEM[sp.element] ? ELEM[sp.element].word : sp.element)} · level ${t.lvl}${t.lvl > A.effLv(game, t) ? ` (fights at ${A.effLv(game, t)} for you, for now)` : ''} · bound on day ${t.boundDay}${rest ? ' · resting until tomorrow' : out ? ' · <span class="gold">with you</span>' : ''}${sp.flies ? ' · can carry you' : ''}</div>
          <div class="row">${out ? `<button class="small" data-beast-dismiss="1">Send away</button>` : `<button class="small" data-beast-call="${t.id}" ${rest ? 'disabled' : ''}>Call</button>`}<button class="small" data-beast-free="${t.id}">Set free…</button></div></div>`;
      }).join('')}</div>`;
    },
    bindUi(root, game) {
      root.querySelectorAll('button[data-beast-call]').forEach(b => b.addEventListener('click', () => { A.call(game, b.dataset.beastCall); UI().openCharacter(); }));
      root.querySelectorAll('button[data-beast-dismiss]').forEach(b => b.addEventListener('click', () => { A.dismiss(game); UI().openCharacter(); }));
      root.querySelectorAll('button[data-beast-free]').forEach(b => b.addEventListener('click', () => {
        const t = Ti().byId(game.world, b.dataset.beastFree);
        UI().modal({ title: `Set ${t.name} free?`, html: `<p>${esc(t.name)} goes back to its old range, wild again. You could beat it down and bind it again.</p>`, choices: [{ label: `Set ${t.name} free`, onPick: () => { if (game.pl.beastOut === t.id) A.dismiss(game, true); Ti().release(game.world, t, game.pl); UI().openCharacter(); } }, { label: 'Keep it', onPick: () => UI().openCharacter() }] });
      }));
    }
  };
  A.install();
})();
