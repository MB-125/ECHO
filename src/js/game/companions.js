// Companions: people you can hire to fight beside you.
//
// At any inn there are fighters looking for work — sellswords who hold the
// line with sword and shield, hunters who shoot from behind you, hedge-mages
// who throw fire and close your wounds. They talk (each in their own way),
// drink a draught when hurt, fall back when badly wounded — and if they fall,
// they are gone for good.
//
// Whoever fights beside you grows with you. They share in every kill (and
// learn twice as fast while they are behind you), rising level by level up to
// your own. Four combat skills — weapon, guard, agility and tactics — rise with
// each level and train by use: every blow landed, every blow turned aside,
// every blade dodged. And as they rise they learn their trade's techniques:
// the sellsword's shield bash, battle cry, cleave, second wind and bulwark; the
// hunter's aimed shot, volley, crippling and venomed arrows and hawk-eye; the
// hedge-mage's fireball, warding, mending circle, firestorm and rebirth.
(function () {
  const { U } = ECHO;
  const P = () => ECHO.People;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const CLASSES = {
    sellsword: { name: 'Sellsword', icon: '🛡', desc: 'Sword and shield. Holds the line and takes the blows meant for you.', hp: 1.6, dmg: 1.15, cost: 1, focus: ['guard', 'weapon'] },
    hunter: { name: 'Hunter', icon: '🏹', desc: 'A bow and a good eye. Shoots from behind you and picks off what you miss.', hp: 1.15, dmg: 1.05, cost: 1.1, focus: ['weapon', 'agility'] },
    mender: { name: 'Hedge-mage', icon: '✦', desc: 'Throws fire, and closes your wounds when you are hurt.', hp: 1.0, dmg: 1.2, cost: 1.35, focus: ['tactics', 'agility'] }
  };
  // The four combat skills, 0–100.
  const SKILLS = {
    weapon: { name: 'Weapon', desc: 'harder blows, truer aim, quicker strikes' },
    guard: { name: 'Guard', desc: 'turns blows aside; more life' },
    agility: { name: 'Agility', desc: 'dodges, moves and strikes faster' },
    tactics: { name: 'Tactics', desc: 'finds weak spots (critical hits); techniques come round sooner' }
  };
  // Techniques, learned as they rise.
  const TALENTS = {
    sellsword: [
      { lv: 3, k: 'bash', name: 'Shield bash', desc: 'Slams a foe with the shield: it reels, its blow lost.' },
      { lv: 5, k: 'taunt', name: 'Battle cry', desc: 'Roars a challenge: foes nearby turn on them instead of you.' },
      { lv: 8, k: 'cleave', name: 'Cleave', desc: 'Every third blow sweeps wide and cuts everything in front.' },
      { lv: 11, k: 'secondwind', name: 'Second wind', desc: 'Once a fight, near death, gets back up with fresh strength.' },
      { lv: 14, k: 'bulwark', name: 'Bulwark', desc: 'Stands at your shoulder: you take a fifth less harm while they are near.' }
    ],
    hunter: [
      { lv: 3, k: 'aimed', name: 'Aimed shot', desc: 'A long, careful draw: a heavy arrow that staggers.' },
      { lv: 5, k: 'volley', name: 'Volley', desc: 'Three arrows at once, fanned across a pack.' },
      { lv: 8, k: 'cripple', name: 'Crippling shot', desc: 'Arrows to the legs: whatever they hit slows.' },
      { lv: 11, k: 'venom', name: 'Venomed arrows', desc: 'Poisoned arrowheads: the wounded keep bleeding.' },
      { lv: 14, k: 'hawkeye', name: 'Hawk-eye', desc: 'Finds the weak spot: far more critical hits, from further off.' }
    ],
    mender: [
      { lv: 3, k: 'fireball', name: 'Fireball', desc: 'Hurls a bursting fireball into a crowd.' },
      { lv: 5, k: 'ward', name: 'Warding', desc: 'Shields you with a ward: a third less harm for a while.' },
      { lv: 8, k: 'circle', name: 'Mending circle', desc: 'A circle of light that slowly heals you both.' },
      { lv: 11, k: 'firestorm', name: 'Firestorm', desc: 'Calls down fire around a foe.' },
      { lv: 14, k: 'rebirth', name: 'Rebirth', desc: 'Once a day, when you are about to fall, pours life back into you.' }
    ]
  };
  // What they say, by what they are and what kind of person they are.
  const LINES = {
    enter: { any: ['Stay close. Places like this have teeth.', 'Smells like death down here.', 'Watch the floor.'], brave: ['Let them come.'], cowardly: ['I don\'t like this. I don\'t like this at all.'], greedy: ['There\'d better be gold at the bottom of this.'], pious: ['Lantern light keep us.'] },
    kill: { any: ['Down it goes.', 'That\'s one.', 'Next!'], cruel: ['Squeal, then.'], kind: ['Rest now.'], 'hot-headed': ['Who\'s next?!'] },
    lord: { any: ['We did it. We actually did it.', 'They\'ll sing about this one.', 'Is it dead? Tell me it\'s dead.'] },
    hurt: { any: ['I\'m hit!', 'Ugh — I need a moment!'], brave: ['Only a scratch!'], cowardly: ['I\'m done for — get me out of here!'] },
    heal: { any: ['Hold still — this will sting.', 'Let me see that wound.'] },
    idle: { any: ['Fine weather for a walk.', 'You ever wonder what\'s under all those old ruins?', 'My feet hurt.', 'Where to next?'], greedy: ['I hear there\'s treasure in the deep places.'], curious: ['Have you read the old carvings? They\'re not just words.'], loyal: ['Wherever you go, I go.'], ambitious: ['Stick with you and I\'ll have a name of my own one day.'], pious: ['The Lantern sees us, even out here.'], honest: ['I\'ll be honest — I didn\'t think you\'d last this long.'] },
    level: { any: ['I\'m getting the hang of this.', 'Feeling stronger.'] }
  };

  const C = ECHO.Companions = {
    CLASSES,
    classOf(npc) {
      if (npc.comp && npc.comp.cls) return npc.comp.cls;
      return npc.prof === 'hunter' ? 'hunter' : ['priest', 'herbalist', 'scholar'].includes(npc.prof) ? 'mender' : 'sellsword';
    },
    SKILLS, TALENTS,
    st(npc) {
      if (!npc.comp) npc.comp = { cls: C.classOf(npc), lv: Math.max(1, Math.round((npc.skill.fight || 20) / 18)), xp: 0, kills: 0, bond: 0, since: null };
      const s = npc.comp;
      if (!s.sk) {
        // where they start: their own fighting, bent toward their trade, and what their level has taught them
        const f = npc.skill.fight || 20, foc = CLASSES[s.cls].focus;
        s.sk = {};
        for (const k in SKILLS) s.sk[k] = Math.round(Math.min(60, f * 0.35 + (foc.includes(k) ? 8 : 0) + (s.lv - 1) * (foc.includes(k) ? 5 : 3)));
      }
      return s;
    },
    talents(npc) { const s = C.st(npc); return TALENTS[s.cls].filter(t => s.lv >= t.lv); },
    has(npc, k) { const s = C.st(npc); return TALENTS[s.cls].some(t => t.k === k && s.lv >= t.lv); },
    // How far a skill can be pushed by use at this level.
    skillCap(s) { return Math.min(100, 28 + s.lv * 5.5); },
    train(npc, k, amt) {
      const s = C.st(npc), cap = C.skillCap(s), v = s.sk[k];
      if (v >= cap) return;
      const before = Math.floor(v);
      s.sk[k] = Math.min(cap, v + amt * (1 - v / 110));
      if (Math.floor(s.sk[k]) > before && Math.floor(s.sk[k]) % 10 === 0) {
        const e = C.ent(); if (e) ECHO.Combat.floater(e.x, e.y - 1.6, `${SKILLS[k].name} ${Math.floor(s.sk[k])}`, '#bfe8ff');
      }
      C._dirty = true;
    },
    ent() { const g = ECHO.Game; return g && g.ents.find(x => x.isCompanion && !x.dead); },
    cost(world, npc) { const s = C.st(npc); return Math.round((30 + (npc.skill.fight || 20)) * CLASSES[s.cls].cost * (1 + 0.3 * (s.lv - 1))); },
    // Who is looking for work at this town's inn.
    candidates(world, s, pl) {
      return P().residents(world, s).filter(n => n.status === 'alive' && !n.journey && n.id !== pl.companion && n.prof !== 'ruler' && n.prof !== 'reeve' && !(n.rank >= 2) && !n.title
        && ['wanderer', 'guard', 'hunter', 'herbalist', 'priest'].includes(n.prof) && P().age(world, n) >= 18 && P().age(world, n) < 60).slice(0, 4);
    },
    hire(game, npc) {
      const world = game.world, pl = game.pl;
      const cost = C.cost(world, npc);
      if (pl.gold < cost) return `${npc.first} wants ${cost} crowns.`;
      if (pl.companion && world.npcs[pl.companion]) C.dismiss(game, true);
      pl.gold -= cost; pl.companion = npc.id; npc.loc = null; npc.journey = 'companion';
      C.st(npc).since = world.day;
      for (const e of game.ents) if (e.npcId === npc.id) { e.dead = true; e.vanish = true; }
      P().remember(world, npc, `took up the road with ${pl.first} ${pl.last}`, 'change', null, 3);
      return null;
    },
    dismiss(game, quiet) {
      const world = game.world, pl = game.pl, npc = world.npcs[pl.companion];
      pl.companion = null;
      if (!npc) return;
      npc.loc = npc.home; npc.journey = null;
      for (const e of game.ents) if (e.npcId === npc.id && e.isCompanion) { e.isCompanion = false; e.role = 'villager'; e.faction = npc.faction; }
      if (!quiet) ECHO.UI.toast(`${npc.first} heads back to ${(ECHO.Sim.settlement(world, npc.home) || {}).name || 'town'}.`, 'info', 3);
    },
    // Their strength follows their level and their skills.
    apply(game, e, npc) {
      const s = C.st(npc), K = CLASSES[s.cls], sk = s.sk;
      e.maxHp = Math.round((45 + (npc.skill.fight || 20) * 0.6) * K.hp * (1 + 0.14 * (s.lv - 1)) * (1 + sk.guard / 350));
      e.hp = Math.min(e.hp || e.maxHp, e.maxHp);
      e.dmgMul = K.dmg * (1 + 0.12 * (s.lv - 1)) * (1 + sk.weapon / 180);
      e.cdMul = Math.max(0.6, 1 - sk.agility / 300 - (s.cls === 'hunter' ? sk.weapon / 600 : 0));
      if (e.baseSpeed == null) e.baseSpeed = e.speed;
      e.speed = e.baseSpeed * (1 + sk.agility / 450);
      e.critC = sk.tactics / 300 + (C.has(npc, 'hawkeye') ? 0.2 : 0);
      e.dodgeC = Math.min(0.28, sk.agility / 380);
      e.guardC = s.cls === 'sellsword' ? Math.min(0.55, 0.15 + sk.guard / 220) : Math.min(0.25, sk.guard / 420);
      e.aimMul = Math.max(0.25, 1 - sk.weapon / 140);
      e.rangeBonus = C.has(npc, 'hawkeye') ? 2.5 : 0;
      e.gear = e.gear || {};
      e.gear.shield = s.cls === 'sellsword'; e.gear.bow = s.cls === 'hunter'; e.gear.staff = s.cls === 'mender';
      e.compCls = s.cls; e.compLv = s.lv;
      e.label = `${npc.first} · Lv ${s.lv}`;
    },
    // Experience comes to them as it comes to you. Behind you, they learn twice as
    // fast; a kill of their own teaches them more; they never pass you.
    gain(game, xp, own) {
      const world = game.world, pl = game.pl, npc = pl.companion && world.npcs[pl.companion];
      if (!npc || npc.status !== 'alive') return;
      const s = C.st(npc), cap = ECHO.Prowess.level(pl);
      const mul = (s.lv < cap - 1 ? 2 : 1) * (own ? 1.4 : 1) * (1 + s.bond / 400);
      s.xp += xp * mul; s.bond = Math.min(100, s.bond + (own ? 0.3 : 0.2));
      const ups = [];
      while (s.lv < cap && s.xp >= ECHO.Prowess.need(s.lv)) { s.xp -= ECHO.Prowess.need(s.lv); s.lv++; ups.push(s.lv); }
      if (s.lv >= cap) s.xp = Math.min(s.xp, ECHO.Prowess.need(s.lv) * 0.99);
      for (const L of ups) C.levelUp(game, npc, L);
      C._dirty = true;
    },
    levelUp(game, npc, L) {
      const s = C.st(npc), K = CLASSES[s.cls];
      // every level hones every skill, their trade's most of all
      const grew = [];
      for (const k in SKILLS) { const add = K.focus.includes(k) ? 4 : 2; s.sk[k] = Math.min(100, s.sk[k] + add); grew.push(`${SKILLS[k].name} +${add}`); }
      const e = C.ent();
      if (e) {
        C.apply(game, e, npc); e.hp = e.maxHp;
        ECHO.Combat.floater(e.x, e.y - 1.6, `▲ ${npc.first}: level ${L}`, '#9fe0c8', true);
        ECHO.Combat.burst(e.x, e.y - 0.3, '#9fe0c8', 22, 3.5, 0.9, 2); ECHO.Combat.ring(e.x, e.y, 1.6, 'rgba(159,224,200,0.8)', 0.6);
        ECHO.Sfx.play('heal', { pitch: 1.2 });
        C.say(e, npc, 'level');
      }
      const T = TALENTS[s.cls].find(t => t.lv === L);
      if (T) {
        ECHO.UI.banner(`${npc.first} learns ${T.name}`, T.desc, false);
        ECHO.UI.toast(`${npc.first} has learned ${T.name}: ${T.desc}`, 'legend', 7);
        if (e) { e.say = `I've got a new trick — ${T.name.toLowerCase()}!`; e.sayT = 3; }
      } else ECHO.UI.toast(`${npc.first} rises to level ${L} ${K.name.toLowerCase()} — ${grew.join(', ')}.`, 'info', 5);
    },    say(e, npc, kind, chance = 1) {
      if (!e || Math.random() > chance || (e.sayT > 0 && kind !== 'lord')) return;
      const L = LINES[kind]; if (!L) return;
      const pool = L.any.slice();
      for (const t of npc.traits || []) if (L[t]) pool.push(...L[t], ...L[t]);
      e.say = pool[Math.floor(Math.random() * pool.length)]; e.sayT = 2.6;
    },
    // A companion's own judgement, before the usual fighting: heal you, fall back, drink, cast.
    act(game, e, npc, dt, target) {
      const pe = game.pe, pl = game.pl, s = C.st(npc);
      e.cT = (e.cT || 0) - dt; e.healT = (e.healT || 0) - dt; e.potT = (e.potT || 0) - dt; e.idleT = (e.idleT == null ? 40 + Math.random() * 60 : e.idleT - dt);
      if (e.hurtSaid && e.hp > e.maxHp * 0.6) e.hurtSaid = false;
      // badly hurt: a draught, then fall back behind you
      if (e.hp < e.maxHp * 0.3) {
        if (!e.hurtSaid) { e.hurtSaid = true; C.say(e, npc, 'hurt'); }
        if (e.potT <= 0) { e.potT = 45; e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.45); ECHO.Combat.floater(e.x, e.y - 1.3, `${npc.first} drinks a draught`, '#9fe0c8'); ECHO.Combat.burst(e.x, e.y, '#9fe0c8', 10, 2, 0.5, 2); return true; }
        if (target && U.dist(e.x, e.y, target.x, target.y) < 4) { const a = Math.atan2(e.y - target.y, e.x - target.x); ECHO.Ent.travel(game.world, e, pe.x + Math.cos(a) * 1.5, pe.y + Math.sin(a) * 1.5, e.speed * 1.1, dt); return true; }
      }
      // techniques, each on its own clock (tactics brings them round sooner)
      if (C.technique(game, e, npc, s, dt, target)) return true;
      // the hedge-mage closes your wounds
      if (s.cls === 'mender' && e.healT <= 0 && pl.hp < pl.maxHp * 0.5 && U.dist(e.x, e.y, pe.x, pe.y) < 7) {
        e.healT = 16 * (e.cdMul || 1); const amt = Math.round(pl.maxHp * (0.18 + s.lv * 0.012 + s.sk.tactics / 600)); C.train(npc, 'tactics', 0.4);
        pl.hp = Math.min(pl.maxHp, pl.hp + amt); pe.hp = pl.hp;
        ECHO.Combat.floater(pe.x, pe.y - 1.4, `+${amt} (${npc.first})`, '#9fe0c8'); ECHO.Combat.burst(pe.x, pe.y, '#9fe0c8', 14, 2, 0.7, 2); C.say(e, npc, 'heal', 0.5);
        e.moving = false; return true;
      }
      // ...and throws fire from a distance
      if (s.cls === 'mender' && target && e.cT <= 0) {
        const d = U.dist(e.x, e.y, target.x, target.y);
        if (d < 8 + (e.rangeBonus || 0) && ECHO.Ent.lineOfSight(game.world, e.x, e.y, target.x, target.y)) {
          e.cT = 2.6 * (e.cdMul || 1); C.train(npc, 'weapon', 0.05); const a = Math.atan2(target.y - e.y, target.x - e.x); e.dir = a;
          ECHO.Combat.shoot(e, a, { kind: 'orb', speed: 9, dmg: (8 + s.lv * 2.2) * (e.dmgMul || 1), life: 1.2, type: 'fire', color: '#ff9a3c', effect: 'burn' });
          if (d < 3) { const b = a + Math.PI; ECHO.Ent.travel(game.world, e, e.x + Math.cos(b) * 2, e.y + Math.sin(b) * 2, e.speed, dt); } else e.moving = false;
          return true;
        }
        if (d < 3.5) { const b = Math.atan2(e.y - target.y, e.x - target.x); ECHO.Ent.travel(game.world, e, e.x + Math.cos(b) * 2, e.y + Math.sin(b) * 2, e.speed, dt); return true; }
      }
      // things to say on the road
      if (!target && e.idleT <= 0) { e.idleT = 70 + Math.random() * 90; C.say(e, npc, 'idle'); }
      return false;
    },
    foesNear(game, x, y, r) { return game.ents.filter(o => !o.dead && !o.hidden && !o.isCompanion && o !== game.pe && game.hostileTo(game.pe, o) && (o.foe || o.type === 'boss' || o.type === 'creature' || o.role === 'bandit' || o.aggro) && U.dist(o.x, o.y, x, y) < r); },
    technique(game, e, npc, s, dt, target) {
      const pe = game.pe, pl = game.pl, world = game.world;
      e.tal = e.tal || {};
      for (const k in e.tal) e.tal[k] -= dt * (1 + s.sk.tactics / 200);
      const ready = k => C.has(npc, k) && !(e.tal[k] > 0);
      const use = (k, cd, text) => { e.tal[k] = cd; C.train(npc, 'tactics', 0.5); ECHO.Combat.floater(e.x, e.y - 1.5, text, '#ffe08a', true); };
      const d = target ? U.dist(e.x, e.y, target.x, target.y) : 99;
      const ang = target ? Math.atan2(target.y - e.y, target.x - e.x) : e.dir;
      const los = target && ECHO.Ent.lineOfSight(world, e.x, e.y, target.x, target.y);
      if (s.cls === 'sellsword' && target) {
        const foes = C.foesNear(game, pe.x, pe.y, 7);
        if (ready('taunt') && (foes.length >= 2 || pl.hp < pl.maxHp * 0.45)) {
          use('taunt', 18, 'Battle cry!'); e.tauntT = 5;
          ECHO.Sfx.play('roar', { pitch: 1.6, vol: 0.45 }); ECHO.Combat.ring(e.x, e.y, 6, 'rgba(255,200,120,0.6)', 0.5);
          e.say = ['Over here, you dogs!', 'Face me!', 'To me! TO ME!'][Math.floor(Math.random() * 3)]; e.sayT = 2.2;
          return true;
        }
        if (ready('bash') && d < 1.7 && e.state !== 'windup') {
          use('bash', 7, 'Shield bash!'); e.dir = ang;
          ECHO.Combat.melee(e, { angle: ang, arc: 1.4, range: 1.7, dmg: (6 + s.lv * 1.5) * (e.dmgMul || 1), knock: 0.45, stagger: 1.1 });
          ECHO.Sfx.play('shieldBlock', { pitch: 0.8 }); ECHO.Combat.sparks(target.x, target.y - 0.3, ang + Math.PI, '#ffe0a0', 10);
          e.state = 'attack'; e.t = 0; e.cd = Math.max(e.cd || 0, 0.6);
          return true;
        }
      }
      if (s.cls === 'hunter' && target && los && d > 2 && d < 10 + (e.rangeBonus || 0)) {
        const foes = C.foesNear(game, target.x, target.y, 5);
        const arrow = (a, m) => ECHO.Combat.shoot(e, a, { kind: 'arrow', speed: 16, dmg: (6 + s.lv * 1.8) * (e.dmgMul || 1) * m, life: 1.5, type: 'ranged' });
        if (ready('volley') && foes.length >= 2) { use('volley', 12, 'Volley!'); for (const da of [-0.2, 0, 0.2]) arrow(ang + da, 0.9); ECHO.Sfx.play('bowRelease'); e.dir = ang; e.state = 'attack'; e.t = 0; return true; }
        if (ready('aimed')) { use('aimed', 8, 'Aimed shot!'); const p = arrow(ang, 2.2); p.crit = true; p.speed = 20; ECHO.Sfx.play('bowRelease', { pitch: 0.8 }); e.dir = ang; e.state = 'attack'; e.t = 0; return true; }
      }
      if (s.cls === 'mender') {
        const dp = U.dist(e.x, e.y, pe.x, pe.y);
        if (ready('ward') && target && dp < 8 && !(pl._cward > 0)) {
          use('ward', 25, 'Warding!'); pl._cward = 10;
          ECHO.Combat.ring(pe.x, pe.y, 1.2, 'rgba(160,200,255,0.9)', 0.7); ECHO.Combat.burst(pe.x, pe.y, '#a8c8ff', 14, 2, 0.8, 2); ECHO.Sfx.play('heal', { pitch: 0.8 });
          ECHO.Combat.floater(pe.x, pe.y - 1.6, `warded by ${npc.first}`, '#a8c8ff');
          return true;
        }
        if (ready('circle') && dp < 6 && (pl.hp < pl.maxHp * 0.7 || e.hp < e.maxHp * 0.6)) {
          use('circle', 30, 'Mending circle!'); e.circleT = 6; e.circleX = (e.x + pe.x) / 2; e.circleY = (e.y + pe.y) / 2;
          ECHO.Sfx.play('heal'); return true;
        }
        if (target && los && d < 9 && U.dist(target.x, target.y, pe.x, pe.y) > 3.4 && ready('firestorm')) {
          use('firestorm', 20, 'Firestorm!');
          for (let i = 0; i < 3; i++) { const a = i * 2.1 + Math.random(), r = i ? 1.4 : 0; const p = ECHO.Combat.shoot(e, ang, { kind: 'fire', speed: 0, dmg: (10 + s.lv * 2.5) * (e.dmgMul || 1), life: 0.25 + i * 0.35, radius: 1.2, type: 'fire' }); p.x = target.x + Math.cos(a) * r; p.y = target.y + Math.sin(a) * r; p.vx = p.vy = 0; }
          e.dir = ang; e.state = 'attack'; e.t = 0; return true;
        }
        if (target && los && d < 9 && U.dist(target.x, target.y, pe.x, pe.y) > 2.8 && ready('fireball')) {
          use('fireball', 9, 'Fireball!');
          ECHO.Combat.shoot(e, ang, { kind: 'fire', speed: 11, dmg: (12 + s.lv * 3) * (e.dmgMul || 1), life: 1.2, radius: 1.3, type: 'fire' });
          ECHO.Sfx.play('fireCast', { vol: 0.6 }); e.dir = ang; e.state = 'attack'; e.t = 0; return true;
        }
      }
      return false;
    },
    // Riding alongside you. Returns true when riding took this frame.
    ride(game, e, npc, dt, target, d) {
      const pe = game.pe, pl = game.pl;
      const fightNear = target && U.dist(target.x, target.y, pe.x, pe.y) < 9;
      const want = !!(pl.mounted && !ECHO.Interior.cur && !fightNear && e.hp > e.maxHp * 0.3);
      e.horseBreed = { sellsword: 'courser', hunter: 'pony', mender: 'pony' }[C.st(npc).cls] || 'pony';
      if (want !== !!e.mounted) {
        e.mountT = (e.mountT || 0) + dt;
        // a beat after you, as a real rider would — but at once if a fight breaks out
        if (e.mountT > (want ? 0.6 : fightNear ? 0 : 0.4)) {
          e.mounted = want; e.mountT = 0;
          ECHO.Combat.burst(e.x, e.y, '#b8a888', 8, 1.5, 0.4, 2);
          if (want && Math.random() < 0.15) { e.say = ['Ride on!', 'Right behind you.', 'Easy, girl… easy.'][Math.floor(Math.random() * 3)]; e.sayT = 2; }
          if (!want && fightNear) { e.say = 'Off the horse — here they come!'; e.sayT = 1.8; }
        }
      } else e.mountT = 0;
      if (!e.mounted) return false;
      // ride at your shoulder, a length behind
      const rv = pe.rideV || 0, side = (e.id % 2 ? 1 : -1);
      const fx = Math.cos(pe.dir), fy = Math.sin(pe.dir);
      const tx = pe.x - fx * 1.6 + -fy * side * 1.1, ty = pe.y - fy * 1.6 + fx * side * 1.1;
      const dd = U.dist(e.x, e.y, tx, ty);
      const sp = dd > 5 ? Math.max(6, rv * 1.2 + 1.5) : dd > 1 ? Math.max(2.5, rv * 1.05 + dd * 0.6) : rv;
      if (dd > 0.4 && sp > 0.2) ECHO.Ent.travel(game.world, e, tx, ty, sp, dt); else { e.moving = false; if (rv < 0.3) e.dir = pe.dir; }
      e.hidden = false;
      return true;
    },
    // ---- hooks from combat
    // A blow aimed at a companion: dodged, turned aside, or taken.
    defend(game, e, amount, src) {
      const npc = game.pl.companion && game.world.npcs[game.pl.companion];
      if (!npc || src.from === game.pe) return amount;
      if ((src.type === 'melee' || src.type === 'ranged') && !src.unblockable && Math.random() < (e.dodgeC || 0)) {
        const a = (src.angle || 0) + (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
        e.rollT = e.rollDur = 0.32; e.rollDir = a;
        ECHO.Ent.move(game.world, e, Math.cos(a) * 0.7, Math.sin(a) * 0.7);
        ECHO.Combat.floater(e.x, e.y - 0.9, 'dodged', '#9fd3ff');
        C.train(npc, 'agility', 0.6);
        return 0;
      }
      if (src.type === 'melee' && Math.random() < (e.guardC || 0)) {
        const inc = (src.angle || 0) + Math.PI;
        ECHO.Combat.sparks(e.x + Math.cos(inc) * 0.4, e.y - 0.3 + Math.sin(inc) * 0.4, inc, '#ffe0a0', 8);
        ECHO.Combat.floater(e.x, e.y - 0.9, e.gear && e.gear.shield ? 'blocked' : 'parried', '#d8c9a0');
        ECHO.Sfx.play('shieldBlock', { vol: 0.6 });
        C.train(npc, 'guard', 0.5);
        return amount * (e.gear && e.gear.shield ? 0.15 : 0.4);
      }
      C.train(npc, 'guard', 0.08);
      return amount;
    },
    // A blow a companion landed.
    landed(game, e, target, type, crit) {
      const npc = game.pl.companion && game.world.npcs[game.pl.companion];
      if (!npc || target === game.pe) return;
      C.train(npc, 'weapon', type === 'ranged' ? 0.18 : 0.12);
      if (crit) C.train(npc, 'tactics', 0.2);
      if (type === 'ranged' && !target.dead) {
        if (C.has(npc, 'cripple')) target.slowT = 3;
        if (C.has(npc, 'venom')) target.bleed = { dps: 2 + C.st(npc).lv * 0.5, t: 5, acc: 0 };
      }
    },
    // You, about to take a blow: the bulwark at your shoulder.
    shield(game) {
      const npc = game.pl.companion && game.world.npcs[game.pl.companion], e = C.ent();
      return npc && e && C.has(npc, 'bulwark') && U.dist(e.x, e.y, game.pe.x, game.pe.y) < 2.6 ? 0.8 : 1;
    },
    // After any blow lands: second wind for them, rebirth for you.
    afterHit(game, target) {
      const pl = game.pl, npc = pl.companion && game.world.npcs[pl.companion];
      if (!npc) return;
      if (target.isCompanion && target.hp > 0 && target.hp < target.maxHp * 0.3 && C.has(npc, 'secondwind') && !target._swUsed) {
        target._swUsed = true; target.hp = Math.min(target.maxHp, target.hp + target.maxHp * 0.45);
        ECHO.Combat.floater(target.x, target.y - 1.5, 'Second wind!', '#ffe08a', true); ECHO.Combat.burst(target.x, target.y, '#ffe08a', 16, 3, 0.7, 2);
        target.say = 'Not yet. Not today.'; target.sayT = 2.4;
      }
      if (target === game.pe && target.hp < pl.maxHp * 0.12 && C.has(npc, 'rebirth')) {
        const s = C.st(npc), e = C.ent();
        if (e && s.rebirthDay !== game.world.day) {
          s.rebirthDay = game.world.day;
          target.hp = Math.max(target.hp, 0) + pl.maxHp * 0.4; pl.hp = target.hp;
          ECHO.UI.banner('Rebirth', `${npc.first} pours their own strength into you`, true);
          ECHO.Combat.burst(target.x, target.y, '#fff2c0', 30, 4, 1, 3); ECHO.Combat.ring(target.x, target.y, 2, 'rgba(255,240,190,0.9)', 0.8);
          ECHO.Sfx.play('heal', { pitch: 0.7 });
        }
      }
    },
    // Every frame: timers, the mending circle, wounds that bleed and legs that drag.
    tick(game, dt) {
      const pl = game.pl, pe = game.pe;
      if (!pl || !pe) return;
      if (pl._cward > 0) { pl._cward -= dt; if (Math.random() < dt * 3) ECHO.Combat.fx.push({ kind: 'p', x: pe.x + (Math.random() - 0.5) * 0.8, y: pe.y - Math.random() * 0.8, vx: 0, vy: -0.5, t: 0, life: 0.6, color: '#a8c8ff', size: 2 }); }
      const e = C.ent(), npc = e && pl.companion && game.world.npcs[pl.companion];
      if (e) {
        if (e.rollT > 0) e.rollT -= dt;
        if (e.tauntT > 0) e.tauntT -= dt;
        if (e.circleT > 0) {
          e.circleT -= dt;
          const heal = (o, max) => { if (U.dist(o.x, o.y, e.circleX, e.circleY) < 2.6) { o.hp = Math.min(max, o.hp + max * 0.035 * dt); if (o === pe) pl.hp = pe.hp; } };
          heal(pe, pl.maxHp); heal(e, e.maxHp);
          if (Math.random() < dt * 14) { const a = Math.random() * 6.28; ECHO.Combat.fx.push({ kind: 'p', x: e.circleX + Math.cos(a) * 2.4, y: e.circleY + Math.sin(a) * 2.4, vx: 0, vy: -0.6, t: 0, life: 0.7, color: '#9fe0c8', size: 2 }); }
        }
        // a fight over: the second wind comes back
        if (!(game.combatT != null && game.time - game.combatT < 10)) e._swUsed = false;
      }
      for (const o of game.ents) {
        if (o.slowT > 0) {
          if (o._spd0 == null) { o._spd0 = o.speed; o.speed *= 0.55; }
          o.slowT -= dt;
          if (o.slowT <= 0 || o.dead) { o.speed = o._spd0; o._spd0 = null; o.slowT = 0; }
        }
        if (o.bleed && !o.dead) {
          o.bleed.t -= dt; o.bleed.acc += o.bleed.dps * dt;
          if (Math.random() < dt * 4) ECHO.Combat.fx.push({ kind: 'p', x: o.x, y: o.y - 0.3, vx: 0, vy: 0.4, t: 0, life: 0.5, color: '#7ac850', size: 2 });
          if (o.bleed.acc >= 3) { const a = o.bleed.acc; o.bleed.acc = 0; ECHO.Combat.damage(o, a, { type: 'poison', from: e || null }); }
          if (o.bleed && o.bleed.t <= 0) o.bleed = null;
        }
      }
      void npc;
    },
    // Called on any kill near them, and on entering a dungeon.
    event(game, kind, foe) {
      const pl = game.pl, npc = pl && pl.companion && game.world.npcs[pl.companion];
      const e = game.ents.find(x => x.isCompanion && !x.dead);
      if (!npc || !e) return;
      if (kind === 'kill') { C.st(npc).kills++; C.say(e, npc, foe && foe.boss2 ? 'lord' : 'kill', foe && foe.boss2 ? 1 : 0.18); }
      if (kind === 'enter') C.say(e, npc, 'enter', 0.8);
    },
    // A companion's death is for good.
    fell(game, npc) {
      const world = game.world, pl = game.pl;
      if (!npc || pl.companion !== npc.id) return;
      const s = C.st(npc);
      pl.companion = null;
      pl.fallen = pl.fallen || []; pl.fallen.push({ id: npc.id, name: `${npc.first} ${npc.last}`, d: world.day, lv: s.lv, kills: s.kills });
      ECHO.UI.banner(`${npc.first} has fallen`, `${CLASSES[s.cls].name} · level ${s.lv} · ${s.kills} foes slain at your side`, true);
      ECHO.UI.toast(`${npc.first} ${npc.last} is dead. They will not be coming back.`, 'warn', 6);
      ECHO.Chronicle.deed(world, { text: `${npc.first} ${npc.last} fell fighting beside ${pl.first} ${pl.last}.`, importance: 2, x: pl.x, y: pl.y, rep: 0 });
      ECHO.Character.behave(pl, 'protect', -0.1);
    },
    // A card for the character page and the HUD.
    card(world, pl) {
      const npc = pl.companion && world.npcs[pl.companion];
      if (!npc) return (pl.fallen || []).length ? `<h3 class="gold">Companions</h3><p class="dim">Fallen at your side: ${pl.fallen.map(f => `${esc(f.name)} (level ${f.lv})`).join(', ')}. Hire another at any inn.</p>` : `<h3 class="gold">Companions</h3><p class="dim">You travel alone. Fighters look for work at every inn.</p>`;
      const s = C.st(npc), K = CLASSES[s.cls], need = ECHO.Prowess.need(s.lv), cap = C.skillCap(s), plv = ECHO.Prowess.level(pl);
      const bar = (v, max, col) => `<span class="cbar"><i style="width:${Math.round(Math.min(1, v / max) * 100)}%;background:${col}"></i></span>`;
      const skills = Object.keys(SKILLS).map(k => `<div class="csk"><b>${SKILLS[k].name}</b>${bar(s.sk[k], 100, K.focus.includes(k) ? '#e8c860' : '#9fc8e0')}<span>${Math.floor(s.sk[k])}</span><em>${esc(SKILLS[k].desc)}</em></div>`).join('');
      const tal = TALENTS[s.cls].map(t => `<div class="ctal ${s.lv >= t.lv ? 'on' : ''}"><b>${s.lv >= t.lv ? '✦' : '·'} ${esc(t.name)}</b> <span class="dim">${s.lv >= t.lv ? esc(t.desc) : `learned at level ${t.lv}`}</span></div>`).join('');
      return `<h3 class="gold">Companion</h3><div class="card comp-card"><h4>${K.icon} ${esc(npc.first)} ${esc(npc.last)} <span class="dim">· level ${s.lv} ${esc(K.name.toLowerCase())}</span></h4>
        <div class="dim">${esc(K.desc)}</div>
        <div class="cxp">${s.lv < plv ? `${bar(s.xp, need, '#c8a8ff')} <span>${Math.floor(s.xp)}/${need} to level ${s.lv + 1}${s.lv < plv - 1 ? ' · learning fast from you (×2)' : ''}</span>` : `<span class="dim">Level with you — they rise when you do.</span>`}</div>
        <div class="csks">${skills}</div><div class="dim" style="font-size:12px">Skills rise with every level and train by use, up to ${Math.floor(cap)} at this level. Gold bars: their trade's strengths.</div>
        <div class="ctals">${tal}</div>
        <div style="font-size:13px">${(npc.traits || []).map(esc).join(', ')} · ${s.kills} foes slain together · bond ${Math.round(s.bond)}</div><div class="row"><button class="small" data-dismiss="1">Part ways</button></div></div>`;
    },
    hud(game) {
      const el = document.getElementById('hud-comp');
      if (!el) return;
      const pl = game.pl, npc = pl.companion && game.world.npcs[pl.companion];
      const e = npc && game.ents.find(x => x.isCompanion && !x.dead);
      const st = npc && C.st(npc), need = st ? ECHO.Prowess.need(st.lv) : 1;
      const key = e ? `${npc.first}|${Math.round(e.hp / e.maxHp * 40)}|${st.lv}|${Math.round(st.xp / need * 30)}|${e.tauntT > 0}|${pl._cward > 0}` : '';
      if (C._hud === key) return; C._hud = key;
      el.innerHTML = e ? `<span>${CLASSES[st.cls].icon} ${esc(npc.first)} · Lv ${st.lv}${e.tauntT > 0 ? ' · <b style="color:#ffcf8a">taunting</b>' : ''}${pl._cward > 0 ? ' · <b style="color:#a8c8ff">ward</b>' : ''}</span><span class="cb"><i style="width:${Math.round(e.hp / e.maxHp * 100)}%"></i></span><span class="cx"><i style="width:${Math.round(Math.min(1, st.xp / need) * 100)}%"></i></span>` : '';
    },
    // The inn's list of fighters for hire.
    innHtml(world, s, pl) {
      const list = C.candidates(world, s, pl);
      if (!list.length) return '<h4 class="ware-h">Fighters for hire</h4><p class="dim">No one here is looking for that kind of work today.</p>';
      return `<h4 class="ware-h">Fighters for hire</h4><p class="dim">They fight beside you and grow with you: they share every kill, rise in level up to your own, sharpen their skills by use and learn their trade's techniques. They fall back when badly hurt — and if they die, they are gone for good.</p><div class="wares">${list.map(n => {
        const st = C.st(n), K = CLASSES[st.cls], cost = C.cost(world, n);
        return `<div class="ware"><div class="ware-ic">${K.icon}</div><div class="ware-main"><div class="ware-top"><b>${esc(n.first)} ${esc(n.last)}</b><span class="gold">${cost} cr</span></div><div class="ware-use">Level ${st.lv} ${esc(K.name.toLowerCase())} — ${esc(K.desc)}</div><div class="ware-meta">${Object.keys(SKILLS).map(k => `${SKILLS[k].name} ${Math.floor(st.sk[k])}`).join(' · ')}${C.talents(n).length ? ' · knows ' + C.talents(n).map(t => t.name).join(', ') : ''}</div><div class="ware-meta">${(n.traits || []).map(esc).join(', ')}</div><div class="row"><button class="small" data-hire="${n.id}" ${pl.gold < cost ? 'disabled' : ''}>${pl.companion ? 'Hire instead' : 'Hire'}</button></div></div></div>`;
      }).join('')}</div>`;
    }
  };
})();
