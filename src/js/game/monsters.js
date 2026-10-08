// Monsters of the deep places: each with its own strength, way of fighting
// and weakness, growing stronger the deeper and farther out you go. Elites
// carry a mark of their own. What they leave behind — parts and gear — is
// worth collecting: sell it, or take it to a smith.
(function () {
  const { U } = ECHO;
  const UI = () => ECHO.UI;
  const Gr = () => ECHO.Gear;

  // vis: how they look (person-shaped unless shape is set); ab: abilities;
  // resist: damage taken by type is reduced (negative = weakness).
  const DEFS = {
    skeleton: { name: 'Skeleton', hp: 44, dmg: 9, speed: 2.8, reach: 1.25, wind: 0.5, cd: 1.4, tier: 1, resist: { ranged: 0.45, melee: 0.1, fire: -0.15 }, vis: { cloth: '#d8d2c0', cloth2: '#b8b09a', skin: '#e8e2d0', hair: '#e8e2d0', show: ['sword'], em: '#141410', f2d: 'grayscale(1) brightness(1.6)' }, loot: [['bonedust', 0.7, 1, 2]], gold: [0, 4], desc: 'Old bones that will not lie still.', weak: 'Arrows pass through them; blades and fire do not.' },
    skelarcher: { name: 'Skeleton archer', hp: 34, dmg: 8, speed: 2.7, reach: 1.2, wind: 0.5, cd: 1.6, tier: 1, ab: { ranged: true }, resist: { ranged: 0.45, fire: -0.15 }, vis: { cloth: '#d8d2c0', cloth2: '#a89f88', skin: '#e8e2d0', hair: '#e8e2d0', show: ['bow', 'hood'], em: '#141410', f2d: 'grayscale(1) brightness(1.5)' }, loot: [['bonedust', 0.7, 1, 2]], gold: [0, 5], desc: 'It keeps its distance and its aim.', weak: 'Close the gap; it is frail up close.' },
    ghoul: { name: 'Ghoul', hp: 58, dmg: 11, speed: 3.9, reach: 1.15, wind: 0.38, cd: 1.0, tier: 2, ab: { poison: { dps: 3, dur: 5 }, frenzy: true }, resist: { fire: -0.25 }, vis: { cloth: '#5a6a4a', cloth2: '#3a4430', skin: '#8a9a7a', hair: '#2a2a20', show: [], em: '#0e1408', f2d: 'hue-rotate(60deg) brightness(0.8)' }, loot: [['claw', 0.6, 1, 2], ['bonedust', 0.3, 1, 1]], gold: [0, 6], desc: 'Fast, filthy, and its claws carry rot.', weak: 'Fire. Guard and strike back when it lunges in.' },
    goblin: { name: 'Goblin', hp: 30, dmg: 7, speed: 4.1, reach: 1.1, wind: 0.36, cd: 1.0, tier: 1, scale: 0.72, ab: { pack: true }, vis: { cloth: '#6a4a2a', cloth2: '#3a2a1a', skin: '#7aa04a', hair: '#2a2a1a', show: ['sword'], f2d: 'hue-rotate(70deg) saturate(1.4)' }, loot: [['trinket', 0.6, 1, 2]], gold: [1, 8], desc: 'Small, quick, cowardly alone, vicious in packs.', weak: 'Whirling blows; they never come one at a time.' },
    shaman: { name: 'Goblin shaman', hp: 34, dmg: 7, speed: 3.4, reach: 1.1, wind: 0.5, cd: 1.6, tier: 2, scale: 0.78, ab: { bolt: { color: '#ff9a3c', dmg: 1.4, cd: 3.4, type: 'fire' }, heal: { amt: 0.25, cd: 6 } }, vis: { cloth: '#7a3a2a', cloth2: '#3a2a1a', skin: '#7aa04a', hair: '#2a2a1a', show: ['staff', 'hood'], f2d: 'hue-rotate(70deg) saturate(1.4)' }, loot: [['fetish', 0.7, 1, 1], ['trinket', 0.4, 1, 2]], gold: [2, 10], desc: 'Throws fire, and patches up the others.', weak: 'Kill it first.' },
    giantrat: { name: 'Giant rat', hp: 24, dmg: 6, speed: 4.3, reach: 0.9, wind: 0.3, cd: 0.9, tier: 1, shape: 'rat', scale: 1.7, ab: { pack: true }, loot: [['rattail', 0.6, 1, 1]], gold: [0, 2], desc: 'Big as a dog and twice as hungry.', weak: 'Anything. There are just a lot of them.' },
    spider: { name: 'Cave spider', hp: 40, dmg: 8, speed: 4.4, reach: 1.1, wind: 0.32, cd: 1.1, tier: 2, shape: 'spider', scale: 1, ab: { poison: { dps: 2.5, dur: 6 }, web: { cd: 6 } }, resist: { fire: -0.3 }, loot: [['silk', 0.6, 1, 2], ['venom', 0.25, 1, 1]], gold: [0, 3], desc: 'Fast, venomous, and it spits webs that slow you.', weak: 'Fire burns them and their webs.' },
    queen: { name: 'the Spider Queen', hp: 260, dmg: 15, speed: 3.6, reach: 1.6, wind: 0.5, cd: 1.3, tier: 3, shape: 'spider', scale: 2.4, boss: true, ab: { poison: { dps: 4, dur: 6 }, web: { cd: 4 }, summon: { kind: 'spider', n: 2, cd: 14 } }, resist: { fire: -0.2, ranged: 0.15 }, loot: [['queensilk', 1, 1, 2], ['venom', 1, 2, 3], ['silk', 1, 3, 5]], gold: [40, 90], desc: 'The mother of the nest, as big as a cart.', weak: 'Burn the brood; keep moving; never stand in her webs.' },
    slime: { name: 'Slime', hp: 46, dmg: 7, speed: 2.2, reach: 1.0, wind: 0.55, cd: 1.5, tier: 1, shape: 'slime', scale: 1, ab: { split: { kind: 'slimeling', n: 2 } }, resist: { melee: 0.25, ranged: 0.35, fire: -0.3 }, loot: [['gel', 0.8, 1, 2]], gold: [0, 2], desc: 'Cut it and there are two of it.', weak: 'Fire. Blades only make more.' },
    slimeling: { name: 'Slimeling', hp: 16, dmg: 4, speed: 3.0, reach: 0.8, wind: 0.4, cd: 1.2, tier: 1, shape: 'slime', scale: 0.55, resist: { fire: -0.3 }, loot: [['gel', 0.3, 1, 1]], gold: [0, 0], desc: 'A small piece of a slime, still angry.', weak: 'Anything.' },
    troll: { name: 'Cave troll', hp: 150, dmg: 18, speed: 2.6, reach: 1.7, wind: 0.75, cd: 1.8, tier: 3, scale: 1.55, ab: { regen: 4, slam: { cd: 7, r: 2.6, dmg: 1.2 } }, resist: { melee: 0.15, fire: -0.5 }, vis: { cloth: '#4a3a2a', cloth2: '#2a2018', skin: '#6a8a5a', hair: '#3a3a2a', show: [], f2d: 'hue-rotate(80deg) brightness(0.8)' }, loot: [['trollhide', 0.7, 1, 2]], gold: [5, 20], desc: 'Heals as fast as you can cut it — unless it burns.', weak: 'Fire stops it healing. Dodge the slam.' },
    ogre: { name: 'the Ogre Chieftain', hp: 320, dmg: 24, speed: 2.8, reach: 2.0, wind: 0.8, cd: 1.9, tier: 3, scale: 1.85, boss: true, ab: { slam: { cd: 6, r: 3.2, dmg: 1.3 }, charge: { cd: 9 }, frenzy: true }, resist: { melee: 0.1 }, vis: { cloth: '#5a4a3a', cloth2: '#3a2a20', skin: '#b88a6a', hair: '#2a1a10', show: ['helm', 'cape', 'sword'], f2d: 'sepia(0.5) brightness(0.9)' }, loot: [['tusk', 1, 2, 3], ['trollhide', 0.6, 1, 2]], gold: [60, 120], desc: 'Huge, strong, and it charges.', weak: 'Sidestep the charge; strike while it recovers.' },
    wraith: { name: 'Wraith', hp: 52, dmg: 12, speed: 3.2, reach: 1.3, wind: 0.5, cd: 1.5, tier: 3, ab: { teleport: { cd: 6 }, drain: 0.5 }, resist: { melee: 0.35, ranged: 0.5, fire: -0.35 }, vis: { cloth: '#2a2a40', cloth2: '#1a1a2a', skin: '#bfe8ff', hair: '#bfe8ff', show: ['robe', 'hood'], em: '#20304a', opacity: 0.62, f2d: 'grayscale(1) brightness(1.4) hue-rotate(180deg) opacity(0.7)' }, loot: [['ecto', 0.7, 1, 2]], gold: [2, 12], desc: 'It steps through the dark and drinks your life.', weak: 'Fire. Steel bites poorly; arrows hardly at all.' },
    cultist: { name: 'Cultist', hp: 40, dmg: 9, speed: 3.2, reach: 1.2, wind: 0.5, cd: 1.5, tier: 2, ab: { bolt: { color: '#b48aff', dmg: 1.3, cd: 3, type: 'magic' } }, vis: { cloth: '#5a1a2a', cloth2: '#2a0e14', skin: '#d8b8a0', hair: '#1a1a1a', show: ['robe', 'hood', 'staff'], f2d: 'hue-rotate(-30deg) saturate(1.2)' }, loot: [['sigil', 0.6, 1, 1]], gold: [3, 12], desc: 'Sworn to something below. They cast purple fire.', weak: 'Close in fast; they are weak in a melee.' },
    necromancer: { name: 'the Necromancer', hp: 230, dmg: 14, speed: 3.0, reach: 1.3, wind: 0.6, cd: 1.6, tier: 4, boss: true, ab: { bolt: { color: '#9fe8c8', dmg: 1.6, cd: 2.2, type: 'magic' }, summon: { kind: 'skeleton', n: 2, cd: 11 }, teleport: { cd: 8 } }, resist: { magic: 0.5 }, vis: { cloth: '#2a1a3a', cloth2: '#140a1e', skin: '#cfe3d8', hair: '#e8f0e8', show: ['robe', 'hood', 'staff', 'cape'], em: '#2a103a', f2d: 'grayscale(0.5) hue-rotate(220deg)' }, loot: [['grave', 1, 1, 2], ['sigil', 1, 2, 3], ['ecto', 0.7, 1, 2]], gold: [70, 140], desc: 'It raises the dead you have already killed.', weak: 'Ignore the bones; hunt the caster.' },
    golemling: { name: 'Stoneling', hp: 70, dmg: 12, speed: 2.4, reach: 1.3, wind: 0.65, cd: 1.7, tier: 3, scale: 1.1, ab: { slam: { cd: 9, r: 2, dmg: 1 } }, resist: { melee: 0.3, ranged: 0.6, fire: 0.3 }, vis: { cloth: '#7a7268', cloth2: '#5a544c', skin: '#8a8276', hair: '#5a544c', show: [], em: '#2a1206', f2d: 'grayscale(1) brightness(0.9)' }, loot: [['core', 0.15, 1, 1]], gold: [2, 8], desc: 'A small thing of living stone.', weak: 'Heavy blows. Arrows bounce off.' },
    golem: { name: 'the Forge Golem', hp: 380, dmg: 22, speed: 2.2, reach: 1.9, wind: 0.85, cd: 2.0, tier: 4, scale: 1.75, boss: true, ab: { slam: { cd: 5, r: 3.4, dmg: 1.4 }, summon: { kind: 'golemling', n: 1, cd: 18 } }, resist: { melee: 0.35, ranged: 0.65, fire: 0.5 }, vis: { cloth: '#6a625a', cloth2: '#4a443e', skin: '#8a7a6a', hair: '#4a443e', show: [], em: '#5a2008', f2d: 'grayscale(1) sepia(0.4)' }, loot: [['core', 1, 2, 3], ['heartstone', 0.35, 1, 1]], gold: [80, 150], desc: 'Stone and fire, made to guard the old forge forever.', weak: 'Heavy blows when it is staggered. Do not trade blows.' },
    warlord: { name: 'the Goblin Warlord', hp: 200, dmg: 15, speed: 3.6, reach: 1.4, wind: 0.45, cd: 1.1, tier: 2, scale: 1.1, boss: true, ab: { summon: { kind: 'goblin', n: 3, cd: 12 }, charge: { cd: 8 }, frenzy: true }, vis: { cloth: '#7a2a1a', cloth2: '#3a1a10', skin: '#6a9040', hair: '#1a1a10', show: ['helm', 'cape', 'sword'], f2d: 'hue-rotate(70deg) saturate(1.5)' }, loot: [['trinket', 1, 3, 5], ['fetish', 0.6, 1, 2]], gold: [50, 100], desc: 'The biggest goblin, which is to say a small man with a large temper.', weak: 'Kill the pack first, or it never stops coming.' }
  };
  const ELITE = [
    { k: 'hulking', name: 'Hulking', hp: 1.8, dmg: 1.2, scale: 1.18 },
    { k: 'frenzied', name: 'Frenzied', speed: 1.3, cd: 0.7 },
    { k: 'venomous', name: 'Venomous', poison: true },
    { k: 'ancient', name: 'Ancient', hp: 1.4, resist: 0.25 }
  ];

  const M = ECHO.Monsters = {
    DEFS, ELITE,
    install() { Object.assign(ECHO.Quests.FOES, DEFS); },
    rng() { return new ECHO.RNG((Math.random() * 4294967295) >>> 0); },
    // A monster of this kind at this danger level.
    make(game, kind, x, y, level = 1, o = {}) {
      const D = DEFS[kind] || ECHO.Quests.FOES[kind];
      const e = ECHO.Quests.makeFoe(game, kind, x, y, o);
      const L = Math.max(1, level);
      const hpM = 1 + (D.boss ? 0.3 : 0.42) * (L - 1), dmM = 1 + (D.boss ? 0.22 : 0.28) * (L - 1);
      e.lvl = L; e.dmgMul = dmM; e.shape = D.shape || null; e.scale = D.scale || 1;
      e.hp = e.maxHp = Math.round(D.hp * hpM);
      e.resist = { ...(D.resist || {}) };
      e.ab = { ...(D.ab || {}) };
      if (D.boss) { e.boss2 = true; e.label = D.name; }
      // elites
      if (!D.boss && !o.noElite && Math.random() < (o.eliteChance != null ? o.eliteChance : 0.08 + L * 0.02)) {
        const X = ELITE[Math.floor(Math.random() * ELITE.length)];
        e.elite = X.k; e.label = `${X.name} ${D.name.toLowerCase()}`;
        if (X.hp) { e.hp = e.maxHp = Math.round(e.maxHp * X.hp); }
        if (X.dmg) e.dmgMul *= X.dmg;
        if (X.scale) e.scale *= X.scale;
        if (X.speed) e.speed *= X.speed;
        if (X.cd) e.cdMul = X.cd;
        if (X.poison) e.ab.poison = e.ab.poison || { dps: 2 + L, dur: 5 };
        if (X.resist) for (const t of ['melee', 'ranged', 'fire', 'magic']) e.resist[t] = (e.resist[t] || 0) + X.resist;
      }
      if (e.r) e.r = 0.36 * Math.min(1.6, e.scale);
      return e;
    },

    // ------------------------------------------------------------ abilities, every frame
    // Returns true when the monster spent this frame on an ability.
    tick(game, e, dt, d, ang) {
      const ab = e.ab, world = game.world, pe = game.pe;
      if (!ab) return false;
      e.abT = e.abT || {};
      for (const k in e.abT) e.abT[k] -= dt;
      // venom in its own veins
      if (e.venomT > 0) { e.venomT -= dt; e.hp -= e.venomDps * dt; if (Math.random() < dt * 3) ECHO.Combat.burst(e.x, e.y - 0.4, '#9fe05a', 2, 1, 0.3, 1); if (e.hp <= 0 && !e.dead) { ECHO.Combat.kill(e, game.pe, 'poison', {}); return true; } }
      if (ab.regen && !(e.burn > 0) && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + ab.regen * dt);
      if (ab.frenzy && !e.frenzied && e.hp < e.maxHp * 0.4) { e.frenzied = true; e.speed *= 1.45; e.cdMul = (e.cdMul || 1) * 0.6; e.say = 'RAAAH!'; e.sayT = 1.2; ECHO.Combat.ring(e.x, e.y, 1.6, 'rgba(255,80,60,0.7)', 0.4); }
      if (e.boss2 && !e.summoner && !e.phase2 && e.hp < e.maxHp * 0.5) { M.phase(game, e); return true; }
      if (e.state === 'cast') {
        e.moving = false; e.dir = e.aim;
        if (e.t > e.castEnd) M.release(game, e);
        return true;
      }
      if (e.state === 'slam') {
        e.moving = false;
        if (e.t > 0.9) {
          const S = ab.slam;
          ECHO.Combat.ring(e.x, e.y, S.r, 'rgba(255,200,140,0.9)', 0.45);
          ECHO.Combat.burst(e.x, e.y, '#8d8576', 20, 5, 0.7, 3);
          game.shake(0.3);
          if (U.dist(e.x, e.y, pe.x, pe.y) < S.r + pe.r) ECHO.Combat.damage(pe, e.foe.dmg * e.dmgMul * S.dmg, { type: 'melee', from: e, angle: Math.atan2(pe.y - e.y, pe.x - e.x), knock: 0.6, unblockable: false });
          e.state = 'chase'; e.cd = 1.2;
        }
        return true;
      }
      if (e.state === 'charge') {
        const sp = e.speed * 3.2;
        e.x += Math.cos(e.aim) * sp * dt; e.y += Math.sin(e.aim) * sp * dt;
        if (ECHO.World.isSolid(world, e.x, e.y)) { e.x -= Math.cos(e.aim) * sp * dt; e.y -= Math.sin(e.aim) * sp * dt; e.state = 'stagger'; e.stagger = 1.0; ECHO.Combat.burst(e.x, e.y, '#8d8576', 12, 4, 0.6, 3); game.shake(0.2); return true; }
        e.moving = true;
        if (U.dist(e.x, e.y, pe.x, pe.y) < 1.2 && !e.chargeHit) { e.chargeHit = true; ECHO.Combat.damage(pe, e.foe.dmg * e.dmgMul * 1.3, { type: 'melee', from: e, angle: e.aim, knock: 0.9 }); }
        if (e.t > 0.9) { e.state = 'stagger'; e.stagger = 0.8; }
        return true;
      }
      if (e.state !== 'chase' || e.cd > 0.3) return false;
      // pick an ability
      if (ab.heal && (e.abT.heal || 0) <= 0) {
        const hurt = game.ents.find(o => o !== e && o.foe && !o.dead && o.hp < o.maxHp * 0.6 && U.dist(o.x, o.y, e.x, e.y) < 8);
        if (hurt) { e.abT.heal = ab.heal.cd; hurt.hp = Math.min(hurt.maxHp, hurt.hp + hurt.maxHp * ab.heal.amt); ECHO.Combat.ring(hurt.x, hurt.y, 1.2, 'rgba(140,255,160,0.8)', 0.5); ECHO.Combat.floater(hurt.x, hurt.y - 1, 'healed', '#8fe08a'); e.say = 'Grakk! Up!'; e.sayT = 1; return false; }
      }
      if (ab.summon && (e.abT.summon || 0) <= 0 && game.ents.filter(o => o.summoner === e && !o.dead).length < ab.summon.n * 2) {
        e.abT.summon = ab.summon.cd;
        for (let i = 0; i < ab.summon.n; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = ECHO.Ent.freeSpot(world, e.x + Math.cos(a) * 2.2, e.y + Math.sin(a) * 2.2, 3);
          if (!sp) continue;
          const m = M.make(game, ab.summon.kind, sp.x, sp.y, Math.max(1, e.lvl - 1), { noElite: true, aggro: true, delve: e.delve, indoor: e.indoor, questId: e.questId });
          m.summoner = e; m.floor = e.floor; game.ents.push(m);
          ECHO.Combat.burst(sp.x, sp.y, ab.summon.kind === 'skeleton' ? '#9fe8c8' : '#a89070', 10, 3, 0.5, 2);
        }
        e.say = { skeleton: 'Rise. RISE.', spider: '*hiss*', goblin: 'Get \'im, boys!', golemling: '…' }[ab.summon.kind] || '…'; e.sayT = 1.5;
        return false;
      }
      if (ab.teleport && (e.abT.teleport || 0) <= 0 && d < 3 && e.hp < e.maxHp * 0.85) {
        e.abT.teleport = ab.teleport.cd;
        const a = Math.random() * Math.PI * 2;
        const sp = ECHO.Ent.freeSpot(world, pe.x + Math.cos(a) * 5, pe.y + Math.sin(a) * 5, 3);
        if (sp) { ECHO.Combat.burst(e.x, e.y, '#2a2a40', 14, 3, 0.5, 2); e.x = sp.x; e.y = sp.y; ECHO.Combat.burst(e.x, e.y, '#bfe8ff', 14, 3, 0.5, 2); e.cd = 0.6; }
        return false;
      }
      if (ab.slam && (e.abT.slam || 0) <= 0 && d < ab.slam.r * 0.8) {
        e.abT.slam = ab.slam.cd; e.state = 'slam'; e.t = 0;
        ECHO.Combat.telegraph({ x: e.x, y: e.y, angle: 0, len: ab.slam.r, arc: Math.PI * 2, life: 0.9, shape: 'circle', color: 'rgba(255,90,70,0.25)', follow: e });
        e.say = 'HRRNGH!'; e.sayT = 0.8;
        return true;
      }
      if (ab.charge && (e.abT.charge || 0) <= 0 && d > 4 && d < 11 && ECHO.Ent.lineOfSight(world, e.x, e.y, pe.x, pe.y)) {
        e.abT.charge = ab.charge.cd; e.state = 'windup'; e.t = 0; e.aim = ang; e.windEnd = 0.7; e.pendingCharge = true; e.chargeHit = false;
        ECHO.Combat.telegraph({ x: e.x, y: e.y, angle: ang, len: 9, arc: 0.35, life: 0.7, shape: 'cone', color: 'rgba(255,90,70,0.25)', follow: e });
        return true;
      }
      const castable = ab.bolt || ab.web;
      if (castable && d > 2.5 && d < 11 && ECHO.Ent.lineOfSight(world, e.x, e.y, pe.x, pe.y)) {
        const k = ab.web && (e.abT.web || 0) <= 0 ? 'web' : ab.bolt && (e.abT.bolt || 0) <= 0 ? 'bolt' : null;
        if (k) {
          e.abT[k] = (k === 'web' ? ab.web.cd : ab.bolt.cd) * (e.cdMul || 1);
          e.state = 'cast'; e.t = 0; e.aim = ang; e.castEnd = 0.55; e.castKind = k;
          ECHO.Combat.ring(e.x, e.y - 0.4, 0.6, k === 'web' ? 'rgba(255,255,255,0.7)' : ab.bolt.color, 0.55);
          return true;
        }
      }
      return false;
    },
    // a charge begins when its windup ends
    afterWindup(game, e) {
      if (!e.pendingCharge) return false;
      e.pendingCharge = false; e.state = 'charge'; e.t = 0; e.say = 'RRAAA!'; e.sayT = 1;
      return true;
    },
    release(game, e) {
      const pe = game.pe, ab = e.ab;
      const ang = Math.atan2(pe.y - e.y, pe.x - e.x);
      if (e.castKind === 'web') ECHO.Combat.shoot(e, ang, { kind: 'orb', speed: 9, dmg: 2, life: 1.4, type: 'magic', color: '#f4f4ff', effect: 'web' });
      else ECHO.Combat.shoot(e, ang + (Math.random() - 0.5) * 0.08, { kind: 'orb', speed: 10, dmg: e.foe.dmg * e.dmgMul * ab.bolt.dmg, life: 1.5, type: ab.bolt.type, color: ab.bolt.color, effect: ab.bolt.type === 'fire' ? 'burn' : null });
      e.state = 'chase'; e.cd = 0.8;
    },
    // A projectile from a monster lands on someone.
    orbHit(game, p, target) {
      ECHO.Combat.damage(target, p.dmg, { type: p.type || 'magic', from: p.from, angle: p.angle, knock: 0.1 });
      ECHO.Combat.burst(p.x, p.y, p.color || '#b48aff', 10, 3, 0.4, 2);
      if (target === game.pe) {
        if (p.effect === 'web') { game.pl.slowT = 2.5; ECHO.Combat.floater(target.x, target.y - 1, 'webbed', '#f4f4ff'); M.tip(game, 'web'); }
        if (p.effect === 'burn') target.burn = Math.max(target.burn || 0, 1.2);
      }
    },
    // When a monster's blow lands on you.
    hitPlayer(game, from, dmg) {
      const pl = game.pl, world = game.world;
      if (!from || !from.ab) return;
      if (from.ab.poison && dmg > 0) { pl.poisonT = from.ab.poison.dur; pl.poisonDps = Math.max(pl.poisonDps || 0, from.ab.poison.dps * (1 + (from.lvl - 1) * 0.2)); ECHO.Combat.floater(game.pe.x, game.pe.y - 1.1, 'poisoned', '#9fe05a'); M.tip(game, 'poison'); }
      if (from.ab.drain && dmg > 0) { from.hp = Math.min(from.maxHp, from.hp + dmg * from.ab.drain); ECHO.Combat.floater(from.x, from.y - 1, 'drains', '#bfe8ff'); }
      const a = pl.armor && world.items[pl.armor];
      if (a && a.affix === 'thorns' && dmg > 0) ECHO.Combat.damage(from, Math.max(2, dmg * 0.3), { type: 'melee', from: game.pe, angle: Math.atan2(from.y - game.pe.y, from.x - game.pe.x), knock: 0.05 });
    },
    // Halfway down, a lord changes how it fights.
    PHASES: {
      necromancer: { name: 'The dead answer', say: 'Rise — ALL of you!', summon: ['skeleton', 4], f: e => { if (e.ab.bolt) e.ab.bolt = { ...e.ab.bolt, cd: e.ab.bolt.cd * 0.65 }; } },
      queen: { name: 'The brood wakes', say: '*a shriek that shakes the walls*', summon: ['spider', 4], f: e => { if (e.ab.web) e.ab.web = { ...e.ab.web, cd: e.ab.web.cd * 0.5 }; } },
      ogre: { name: 'Blood rage', say: 'YOU. DIE. NOW.', f: e => { e.speed *= 1.25; e.dmgMul *= 1.3; if (e.ab.charge) e.ab.charge = { ...e.ab.charge, cd: 4 }; e.rage = true; } },
      golem: { name: 'Its core lies bare', say: '…', f: e => { e.resist = { melee: 0, ranged: 0.2, fire: 0 }; e.dmgMul *= 1.25; if (e.ab.slam) e.ab.slam = { ...e.ab.slam, cd: e.ab.slam.cd * 0.6 }; e.rage = true; } },
      warlord: { name: 'The war horn', say: '*BWAAARRRR* — to me, to me!', summon: ['goblin', 3], extra: ['shaman', 1], f: e => { e.speed *= 1.2; e.cdMul = (e.cdMul || 1) * 0.75; } }
    },
    phase(game, e) {
      e.phase2 = true;
      const P = M.PHASES[e.species] || { name: 'It rages', say: 'RRRAAAH!', f: x => { x.speed *= 1.15; x.dmgMul *= 1.2; x.rage = true; } };
      P.f(e);
      e.say = P.say; e.sayT = 2.2;
      e.state = 'chase'; e.cd = 0.8;
      game.shake(0.5); game.slowMo && game.slowMo(0.6, 0.35);
      ECHO.Combat.ring(e.x, e.y, 3.2, 'rgba(255,90,60,0.9)', 0.6);
      ECHO.Combat.burst(e.x, e.y, '#ff5a3a', 30, 5, 0.9, 3);
      ECHO.UI.banner(P.name, U.cap(e.label || e.foe.name), true);
      const spawn = (kind, n) => { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; const sp = ECHO.Ent.freeSpot(game.world, e.x + Math.cos(a) * 2.6, e.y + Math.sin(a) * 2.6, 3); if (!sp) continue; const m = M.make(game, kind, sp.x, sp.y, Math.max(1, e.lvl - 1), { noElite: true, aggro: true, delve: e.delve, indoor: e.indoor, questId: e.questId }); m.summoner = e; m.floor = e.floor; game.ents.push(m); ECHO.Combat.burst(sp.x, sp.y, '#c8a8ff', 10, 3, 0.5, 2); } };
      if (P.summon) spawn(P.summon[0], P.summon[1]);
      if (P.extra) spawn(P.extra[0], P.extra[1]);
      if (ECHO.Music) ECHO.Music.stinger('discover');
    },
    // Your poison, your webs: ticks every frame.
    tickPlayer(game, dt) {
      const pl = game.pl, pe = game.pe;
      if (pl.poisonT > 0) {
        pl.poisonT -= dt;
        const before = pe.hp;
        pe.hp = Math.max(1, pe.hp - (pl.poisonDps || 2) * dt); pl.hp = pe.hp;
        if (Math.random() < dt * 2.5) ECHO.Combat.burst(pe.x, pe.y - 0.5, '#9fe05a', 2, 1, 0.3, 1);
        if (pl.poisonT <= 0) pl.poisonDps = 0;
        void before;
      }
      if (pl.slowT > 0) pl.slowT -= dt;
      if (pe.hp < pl.maxHp * 0.3 && game.combatT != null && game.time - game.combatT < 3) M.tip(game, 'lowhp');
      // webs strung across a nest
      const L = ECHO.Interior.cur;
      if (L && L.webs) for (const w of L.webs) if (U.dist(ECHO.Interior.BASE + w.x, w.y, pe.x, pe.y) < 0.9) { pl.slowT = Math.max(pl.slowT || 0, 0.4); break; }
    },
    slowMul() { const pl = ECHO.Game.pl; return pl && pl.slowT > 0 ? 0.55 : 1; },
    // Resistances and weaknesses, and a word about them the first time.
    resist(game, target, type, dmg, from) {
      const r = target.resist && target.resist[type];
      if (!r) return dmg;
      if (from === game.pe && Math.random() < 0.3) ECHO.Combat.floater(target.x, target.y - 1.2, r > 0.3 ? 'resists' : r < -0.1 ? 'weak!' : '', r > 0 ? '#c8c0b0' : '#ffcf5a');
      if (from === game.pe && r < -0.1) M.tip(game, 'weak');
      if (from === game.pe && r > 0.3) M.tip(game, 'resist');
      return dmg * (1 - r);
    },
    // Your gear's properties, when your blow lands.
    playerHit(game, target, dmg, type) {
      const world = game.world, pl = game.pl;
      const w = type === 'ranged' ? world.items[pl.bow] : world.items[pl.weapon];
      if (!w || !w.affix || target.dead) return;
      if (w.affix === 'ember' && Math.random() < 0.35) { target.burn = Math.max(target.burn || 0, 1.5); target.burnFrom = game.pe; }
      if (w.affix === 'venom') { target.venomT = 4; target.venomDps = Math.max(target.venomDps || 0, 2 + (w.level || 1)); }
      if (w.affix === 'thirst') { game.pe.hp = Math.min(game.pl.maxHp, game.pe.hp + dmg * 0.08); game.pl.hp = game.pe.hp; }
    },
    keen(game, type) { const w = game.world.items[type === 'ranged' ? game.pl.bow : game.pl.weapon]; return w && w.affix === 'keen' ? 0.15 : 0; },

    // ------------------------------------------------------------ death and loot
    onKill(game, e) {
      const world = game.world, pl = game.pl, D = DEFS[e.species];
      if (!D) return;
      pl.bestiary = pl.bestiary || {};
      const first = !pl.bestiary[e.species];
      pl.bestiary[e.species] = (pl.bestiary[e.species] || 0) + 1;
      if (first) ECHO.Combat.floater(e.x, e.y - 1.6, 'new to your bestiary', '#bfe8ff');
      if (e.boss2 && !e.summoner) {
        if (ECHO.Ambition) ECHO.Ambition.note(pl, 'lords');
        const site = e.delve && ECHO.Explore.byId(world, e.delve);
        ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} slew ${D.name.replace(/^the /, 'the ')}${site ? ' in the depths of ' + site.name : ''}.`, importance: 2, x: site ? site.x : pl.x, y: site ? site.y : pl.y, rep: 4, tag: 'protect' });
        ECHO.Music.stinger('discover');
        ECHO.UI.banner(`${U.cap(D.name)} is slain`, site ? site.name : '', true);
      }
      if (e.summoner && Math.random() < 0.6) return; // summoned things leave little
      const r = Math.random, L = e.lvl || 1;
      const drop = (kind, qty) => game.loot.push({ x: e.x + (r() - 0.5) * 0.8, y: e.y + (r() - 0.5) * 0.8, kind, qty });
      for (const [k, ch, a, b] of D.loot || []) if (r() < ch * (e.elite ? 1.4 : 1)) drop(k, a + Math.floor(r() * (b - a + 1)) + (L >= 4 && r() < 0.4 ? 1 : 0));
      const [g0, g1] = D.gold || [0, 3];
      const gold = Math.round((g0 + r() * (g1 - g0)) * (1 + (L - 1) * 0.3) * (e.elite ? 2 : 1));
      if (gold > 0) drop('gold', gold);
      // finished gear
      const gearChance = e.boss2 ? 1 : e.elite ? 0.35 : 0.04 + L * 0.012;
      const n = e.boss2 ? (r() < 0.4 ? 2 : 1) : r() < gearChance ? 1 : 0;
      for (let i = 0; i < n; i++) M.dropGear(game, e.x + (r() - 0.5), e.y + (r() - 0.5), L, e.boss2 ? 18 : e.elite ? 8 : 0, `on ${e.label || 'a ' + D.name.toLowerCase()}`);
      // what splits, splits
      if (e.ab && e.ab.split && !e.shard) for (let i = 0; i < e.ab.split.n; i++) {
        const sp = ECHO.Ent.freeSpot(world, e.x + (r() - 0.5) * 1.5, e.y + (r() - 0.5) * 1.5, 2);
        if (!sp) continue;
        const m = M.make(game, e.ab.split.kind, sp.x, sp.y, L, { noElite: true, aggro: true, delve: e.delve, indoor: e.indoor, questId: e.questId });
        m.shard = true; m.floor = e.floor; game.ents.push(m);
      }
      if (e.ab && e.ab.split) M.tip(game, 'split');
    },
    dropGear(game, x, y, level, boost, where) {
      const world = game.world, rng = M.rng();
      const roll = rng.next();
      const kind = roll < 0.45 ? 'sword' : roll < 0.65 ? 'bow' : 'armor';
      const rarity = Gr().rollRarity(rng, level, boost);
      const it = Gr().make(world, rng, kind, level, rarity, where);
      ECHO.Game.dropItem(it.id, x, y);
      const R = Gr().rarity(rarity);
      if (rarity !== 'common' && rarity !== 'fine') { ECHO.Combat.floater(x, y - 1.4, R.name.toLowerCase() + '!', R.color); ECHO.Combat.ring(x, y, 1.2, R.color, 0.8); if (rarity === 'legendary' || rarity === 'epic') ECHO.Music.stinger('star'); }
      M.tip(game, 'gear');
      return it;
    },

    // ------------------------------------------------------------ first-time tips
    TIPS: {
      dungeon: 'Dungeons go down floor by floor — the deeper, the stronger the monsters and the better the loot. Stairs lead down once you find them; the door always leads back out. Bring food (H) and herbs (G).',
      poison: 'Poisoned! It wears off — or eat (H) or use herbs (G) to outlast it. Guard (Shift) against things with venom.',
      web: 'Webbed — you are slowed. Fire burns webs; keep moving and roll (Space) clear.',
      weak: 'That hit hard — this monster is weak to it. The guide (J) lists what you have learned about each monster.',
      resist: 'It shrugs that off. Try another weapon — fire (Q), heavy blows (hold the mouse) or arrows. The guide (J) knows its weaknesses.',
      split: 'Slimes split when cut. Fire kills them cleanly.',
      gear: 'Gear dropped! Walk to it and press E to take it — better pieces are equipped at once. Sell the rest at a market, or have a smith hone what you keep.',
      mats: 'Monster parts are worth money at any market — and a smith can turn them into better gear (talk to a smith → "Improve your gear").',
      trap: 'A trap! Watch the floor in the passages — plates glow just before they fire. Roll (Space) across them.',
      key: 'The iron door needs a key. One of the monsters on this floor carries it — look for the Keybearer.',
      lowhp: 'You are badly hurt. Back off, eat (H) or use herbs (G). Dying to monsters costs a thread of fate.'
    },
    tip(game, k) {
      const pl = game.pl;
      pl.tips = pl.tips || {};
      if (pl.tips[k]) return;
      pl.tips[k] = 1;
      setTimeout(() => UI().toast(M.TIPS[k], 'study', 8), 400);
    }
  };
  M.install();
})();
