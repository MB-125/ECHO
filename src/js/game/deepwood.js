// The deep woods, in real time.
//
// What lives there (by how deep you go), how each of them fights, the lord at
// each heart, the caches of those who went in before you, and the wood itself:
// eyes in the dark between the trees, whispers, the light going, and the fear.
(function () {
  const { U } = ECHO;
  const UI = () => ECHO.UI;
  const WW = () => ECHO.Wildwood;
  const pick = a => a[Math.floor(Math.random() * a.length)];

  // ------------------------------------------------------------ what lives there
  // wab: their own ways of fighting (below). model: a body of its own on the
  // shape's rig. vis: for those on a person's rig.
  const DEFS = {
    gloamstalker: { name: 'Gloamstalker', hp: 90, dmg: 15, speed: 5.2, reach: 1.45, wind: 0.3, cd: 0.95, tier: 6, shape: 'hound', model: 'm_gloamstalker', scale: 1.55, col: '#16141a', em: '#d8ff7a', ab: { pack: true }, wab: { fade: { cd: 8 }, hamstring: { cd: 6 } }, resist: { ranged: 0.3, fire: -0.2 }, loot: [['gloamhide', 0.5, 1, 2]], gold: [30, 80], desc: 'Long as a horse and low as a wolf, with a mask of bone for a face. It goes out like a candle and comes back behind you.', weak: 'When it fades, the ground where it means to strike darkens a heartbeat first: step off it. Fire.' },
    wendigo: { name: 'Hollow Man', hp: 150, dmg: 18, speed: 4.4, reach: 1.7, wind: 0.45, cd: 1.2, tier: 6, scale: 1.75, ab: { drain: 0.3 }, wab: { scream: { cd: 12 }, rend: { cd: 7 } }, resist: { melee: 0.15, ranged: 0.2, fire: -0.3 }, vis: { cloth: '#3a3430', cloth2: '#1a1614', skin: '#b8b0a0', hair: '#0c0a0c', show: [], em: '#6a7a5a' }, loot: [['gloamhide', 0.3, 1, 1], ['antlerbone', 0.4, 1, 1]], gold: [50, 120], desc: 'Skin over bones, arms to its knees, a stag\'s skull for a face. It is always hungry, and its scream turns your legs to running.', weak: 'Do not be close when it screams. It drinks what it tears out of you: kill it fast or not at all.' },
    barkhulk: { name: 'Barkhulk', hp: 240, dmg: 21, speed: 2.5, reach: 2.0, wind: 0.8, cd: 2.0, tier: 6, scale: 2.1, ab: { slam: { cd: 9, r: 3.0, dmg: 1.2 } }, wab: { rootquake: { cd: 9 }, barkskin: { cd: 15, dur: 4 }, hurl: { cd: 7 } }, resist: { melee: 0.3, ranged: 0.55, fire: -0.45 }, vis: { cloth: '#3a2e24', cloth2: '#2a2622', skin: '#3a2e24', hair: '#1c2a1e', show: [], em: '#4a4a30' }, loot: [['heartwood', 0.25, 1, 1], ['gloamhide', 0.2, 1, 1]], gold: [60, 140], desc: 'An oak that was here before the kingdoms, and has woken angry. The ground rolls with roots when it stamps.', weak: 'Fire, above all. Watch the rings run out through the ground; when its bark closes, back away until it opens.' },
    bride: { name: 'Weeping Bride', hp: 110, dmg: 16, speed: 3.6, reach: 1.4, wind: 0.5, cd: 1.4, tier: 6, scale: 1.25, ab: { drain: 0.35 }, wab: { wail: { cd: 8 }, blink: { cd: 6 }, hands: { cd: 10 } }, resist: { melee: 0.4, ranged: 0.6, fire: -0.25 }, vis: { cloth: '#d8dcd0', cloth2: '#a8aca0', skin: '#c8ccc0', hair: '#0c0a0c', show: [], em: '#7a8a7a', opacity: 0.88 }, loot: [['ecto', 0.6, 1, 2]], gold: [40, 110], desc: 'You hear her before you see her: a woman crying somewhere in the trees. Her hair hangs over her face. Do not let her lift it.', weak: 'Arrows pass through her. Close in and cut — and get out of the way of her wail, and of the hands that come up out of the ground.' },
    widow: { name: 'Bough Widow', hp: 160, dmg: 17, speed: 4.6, reach: 1.6, wind: 0.4, cd: 1.2, tier: 6, shape: 'spider', scale: 2.4, col: '#120e10', em: '#ff2a2a', ab: { poison: { dps: 6, dur: 6 }, summon: { kind: 'broodling', n: 3, cd: 18 } }, wab: { drop: { cd: 14 }, snare: { cd: 7 } }, resist: { fire: -0.35, ranged: 0.15 }, loot: [['queensilk', 0.6, 1, 2], ['venom', 0.8, 1, 3]], gold: [50, 120], desc: 'It hangs in the boughs above the trail, and drops.', weak: 'Look up — a shadow on the ground is where it will land. Burn the brood; never stand in its web.' },
    broodling: { name: 'Broodling', hp: 40, dmg: 8, speed: 4.8, reach: 1.0, wind: 0.3, cd: 1.0, tier: 6, shape: 'spider', scale: 0.8, col: '#1a1214', em: '#ff2a2a', ab: { poison: { dps: 3, dur: 4 } }, resist: { fire: -0.4 }, loot: [], gold: [0, 4], desc: 'A Bough Widow\'s young, already hungry.', weak: 'Anything — fire best.' },
    briarwyrm: { name: 'Briarwyrm', hp: 200, dmg: 19, speed: 4.0, reach: 1.8, wind: 0.5, cd: 1.4, tier: 6, shape: 'serpent', scale: 2.6, col: '#2a1e14', em: '#ff6a2a', wab: { burrow: { cd: 10 }, thornvolley: { cd: 6 } }, resist: { melee: 0.2, ranged: 0.3, fire: -0.3 }, loot: [['heartwood', 0.15, 1, 1], ['venom', 0.5, 1, 2]], gold: [60, 130], desc: 'A serpent grown over with thorns, as long as a cart and its horses. It goes down among the roots and comes up under you.', weak: 'When it goes under, keep moving. Its thorns come in a fan: stand where they are not.' },
    erlking: { name: 'the Erlking', hp: 900, dmg: 26, speed: 3.4, reach: 2.4, wind: 0.6, cd: 1.5, tier: 7, scale: 2.3, boss: true, ab: { charge: { cd: 8 } }, wab: { hunt: { cd: 18 }, horn: { cd: 12 }, thornring: { cd: 15 }, scream: { cd: 16 } }, resist: { melee: 0.2, ranged: 0.35, magic: 0.2, fire: -0.15 }, vis: { cloth: '#1a1e16', cloth2: '#1a1e16', skin: '#c8ccc0', hair: '#0c0a0c', show: ['cape', 'spear'], em: '#6a7a5a' }, loot: [['heartwood', 1, 2, 4], ['antlerbone', 1, 2, 3], ['gloamhide', 1, 2, 4]], gold: [2500, 5000], desc: 'The lord of the deep wood: a skull under a crown of antlers wider than a man is tall, a cloak of dead leaves, a hunting spear and the horn of the Wild Hunt.', weak: 'When the horn sounds, look for the lanes the riders will run down and get out of them. Break out of the thorns before they close. Fire.' }
  };
  const PHASES = {
    erlking: { name: 'The Wild Hunt rides', say: 'RIDE. RIDE THEM DOWN.', f: e => { D.pack(ECHO.Game, e, 3); e.wab = { ...(e.wab || e.foe.wab), horn: { cd: 6 }, wake: { cd: 7 } }; e.dmgMul *= 1.2; e.speed *= 1.1; e.rage = true; } }
  };
  // which live how deep (weight)
  const ROSTER = {
    1: [['gloamstalker', 4], ['bride', 2], ['widow', 2]],
    2: [['gloamstalker', 3], ['bride', 2], ['widow', 2], ['wendigo', 3], ['briarwyrm', 2], ['barkhulk', 1]],
    3: [['wendigo', 3], ['barkhulk', 3], ['briarwyrm', 2], ['bride', 2], ['gloamstalker', 2], ['widow', 1]]
  };
  const WHISPERS = ['…turn back…', '…lost…', '…stay with us…', '…we can see you…', '…so warm…', '…don\'t leave the path…', '…he is coming…', '…closer…'];

  const D = ECHO.Deepwood = {
    DEFS, PHASES, ROSTER,
    k: 0, hz: [], eyes: [], t: 0, wT: 0, eyeT: 0, lastTier: 0, lastWood: null, fearFrom: null,
    install() {
      Object.assign(ECHO.Monsters.DEFS, DEFS);
      Object.assign(ECHO.Quests.FOES, DEFS);
      Object.assign(ECHO.Monsters.PHASES, PHASES);
      if (ECHO.Gear) Object.assign(ECHO.Gear.MATS, {
        gloamhide: { name: 'gloamhide', value: 70, tier: 5, color: '#5a6a3a' },
        antlerbone: { name: 'black antler', value: 90, tier: 5, color: '#8a7a5a' },
        heartwood: { name: 'heartwood', value: 260, tier: 6, color: '#c8ff7a' }
      });
    },
    reset() { D.k = 0; D.hz = []; D.eyes = []; D.t = 0; D.wT = 0; D.eyeT = 0; D.lastTier = 0; D.lastWood = null; D.lordE = null; D.fearFrom = null; },

    // ------------------------------------------------------------ every frame
    update(game, dt) {
      const world = game.world, pe = game.pe, pl = game.pl;
      if (!pe || !world.wild) { D.k = 0; return; }
      // fear: your legs run you away from what you are afraid of
      if (pl.fearT > 0) {
        pl.fearT -= dt;
        const f = D.fearFrom;
        if (f && !(pe.iframes > 0) && U.dist(pe.x, pe.y, f.x, f.y) < 14) { const a = Math.atan2(pe.y - f.y, pe.x - f.x); ECHO.Ent.move(world, pe, Math.cos(a) * 2.6 * dt, Math.sin(a) * 2.6 * dt); }
        if (Math.random() < dt * 6) ECHO.Combat.fx.push({ kind: 'p', x: pe.x + (Math.random() - 0.5) * 0.6, y: pe.y - 1.2, vx: 0, vy: -0.6, t: 0, life: 0.6, color: '#c8ff9a', size: 2 });
      }
      D.hazards(game, dt);
      if (ECHO.Interior.cur) { D.k = 0; return; }
      const tier = WW().tierAt(world, pe.x, pe.y), wood = WW().woodAt(world, pe.x, pe.y);
      // how deep the dark is round you (the renderer eases toward it)
      const near = WW().nearest(world, pe.x, pe.y);
      D.k = tier ? 0.55 + tier * 0.15 : near && near.d < 6 ? U.clamp(0.35 - near.d * 0.06, 0, 0.35) : 0;
      // the way in, told
      if (tier !== D.lastTier) {
        if ((D._tierT = (D._tierT || 0) + dt) > 0.8) {
          const w = wood || D.lastWood;
          if (tier > D.lastTier && w) {
            const L = WW().level(world, tier), Dd = ECHO.Prowess.diff(L, ECHO.Prowess.level(pl));
            UI().banner(D.lastTier === 0 ? U.cap(w.name) : U.cap(WW().TIER_NAME[tier]), `${D.lastTier === 0 ? 'A deep wood · ' : ''}beasts of level ${L}${tier < 3 ? '+' : ` and its lord, level ${WW().level(world, 4)}`} · ${Dd.word.toLowerCase()} for you`, true);
            if (D.lastTier === 0) { if (ECHO.Sfx) ECHO.Sfx.play('growl', { pitch: 0.5, vol: 0.6 }); if (!pl.deepTold) { pl.deepTold = true; UI().toast('The light goes as you step under the trees, and the birds stop. Something in here is much stronger than you have met outside the gates. Keep to the trails if you can.', 'warn', 8); } }
            if (ECHO.Discover && ECHO.Discover.note) ECHO.Discover.note(world, pl, 'wood:' + w.id, w.name);
          } else if (tier === 0 && D.lastTier > 0) UI().toast(`You come out from under the trees of ${(D.lastWood || {}).name || 'the deep wood'}. The light comes back.`, 'info', 4);
          D.lastTier = tier; D.lastWood = wood || D.lastWood; D._tierT = 0;
        }
      } else D._tierT = 0;
      D.t -= dt;
      if (D.t > 0) return;
      D.t = 0.5;
      D.spawn(game, tier, wood);
      D.haunt(game, tier, wood, 0.5);
    },

    // ------------------------------------------------------------ what comes for you
    live(game) { return game.ents.filter(e => e.wood && !e.dead); },
    spawn(game, tier, wood) {
      const world = game.world, pe = game.pe;
      // its lord, at its heart
      for (const w of world.wild.woods) {
        if (!WW().lordAlive(world, w) || game.ents.some(e => e.lord && e.wood === w.id && !e.dead)) continue;
        if (U.dist(pe.x, pe.y, w.x, w.y) > 20) continue;
        const sp = ECHO.Ent.freeSpot(world, w.x - 1, w.y + 0.5, 3) || { x: w.x, y: w.y };
        const e = D.make(game, 'erlking', sp.x, sp.y, WW().level(world, 4), w, 3);
        e.lord = true; e.label = `${w.lord.name}, ${w.lord.title}`; e.home = { x: sp.x, y: sp.y }; e.dormant = true;
        game.addEnt(e); D.lordE = e;
      }
      if (!tier) return;
      const want = tier === 1 ? 3 : tier === 2 ? 4 : 5, have = D.live(game).filter(e => !e.summoner && !e.lord).length;
      if (have >= want || (ECHO.Director && ECHO.Director.mercy && ECHO.Director.mercy(game))) return;
      // out among the trees, beyond where you can see
      for (let k = 0; k < 10; k++) {
        const a = Math.random() * 6.28, r = 15 + Math.random() * 9, x = pe.x + Math.cos(a) * r, y = pe.y + Math.sin(a) * r;
        const t = WW().tierAt(world, x, y);
        if (!t || ECHO.World.isSolid(world, x, y) || (game.onScreen && game.onScreen(x, y, 1))) continue;
        const w = WW().woodAt(world, x, y);
        const kind = D.roll(t);
        const n = kind === 'gloamstalker' ? 1 + (Math.random() < 0.6 ? 1 : 0) + (t >= 2 && Math.random() < 0.3 ? 1 : 0) : 1;
        for (let i = 0; i < n; i++) {
          const sp = ECHO.Ent.freeSpot(world, x + (Math.random() - 0.5) * 2, y + (Math.random() - 0.5) * 2, 2);
          if (!sp) continue;
          const e = D.make(game, kind, sp.x, sp.y, WW().level(world, t) + Math.floor(Math.random() * 6), w, t);
          // the widow waits up in the boughs over a trail; the stalkers and the bride
          // wait unseen until you are close
          if (kind === 'widow' || kind === 'gloamstalker' || kind === 'bride') { e.lurkW = true; e.hidden = true; }
          game.addEnt(e);
        }
        return;
      }
    },
    roll(t) {
      const R = ROSTER[Math.min(3, t)], tot = R.reduce((a, b) => a + b[1], 0);
      let r = Math.random() * tot;
      for (const [k, w] of R) { r -= w; if (r <= 0) return k; }
      return R[0][0];
    },
    make(game, kind, x, y, lv, wood, tier) {
      if (ECHO.Growth) ECHO.Growth._noAdapt = true;
      let e;
      try { e = ECHO.Monsters.make(game, kind, x, y, lv, { eliteChance: 0.12 }); } finally { if (ECHO.Growth) ECHO.Growth._noAdapt = false; }
      e.wood = wood ? wood.id : true; e.woodTier = tier; e.home = { x, y };
      // (they know their wood: big as they are, they slip between its trunks)
      e.r = Math.min(e.r || 0.36, kind === 'erlking' ? 0.3 : 0.28);
      if (DEFS[kind].shape === 'serpent' || DEFS[kind].shape === 'spider') e.scale = DEFS[kind].scale;
      return e;
    },

    // ------------------------------------------------------------ before the usual thinking
    think(game, e, dt) {
      const world = game.world, pe = game.pe, d = U.dist(e.x, e.y, pe.x, pe.y);
      // waiting, unseen
      if (e.lurkW) {
        e.moving = false; e.state = 'idle';
        if (d < (e.species === 'widow' ? 5 : 6.5) || e.hurtT > 0) {
          e.lurkW = false; e.aggro = true;
          if (e.species === 'widow') { D.drop(game, e); return true; }
          e.hidden = false;
          ECHO.Combat.burst(e.x, e.y, '#1a1a1a', 16, 3, 0.6, 3);
          e.say = e.species === 'bride' ? pick(['…why did you come…', '*sobbing*', '…stay…']) : '*a low growl*'; e.sayT = 1.8;
          if (ECHO.Sfx) ECHO.Sfx.play(e.species === 'bride' ? 'hiss' : 'growl', { pitch: e.species === 'bride' ? 1.6 : 0.6 });
        }
        return true;
      }
      // the lord waits on his throne until you come into the clearing
      if (e.lord && e.dormant) {
        e.moving = false; e.state = 'idle';
        if (d < 9 || e.hurtT > 0) {
          e.dormant = false; e.aggro = true;
          e.say = pick(['You walk in my wood. You will run in it.', 'The Hunt has been waiting for you.', 'Little one. Run.']); e.sayT = 3;
          UI().bossBar(e); UI().banner(e.label, 'The lord of the wood rises from his throne', true);
          if (ECHO.Music) ECHO.Music.stinger('echo');
          if (ECHO.Sfx) ECHO.Sfx.play('roar', { pitch: 0.45 });
        }
        return true;
      }
      if (e.lord && d > 32) { e.aggro = false; UI().bossBar(null); }
      // they hunt by scent as much as by sight: in their own wood they do not lose you
      if (e.aggro && d < 24 && !game.pl.capture) e.lastSeen = { x: pe.x, y: pe.y, t: game.time };
      // they do not follow you far out of their wood
      if (e.aggro && !e.lord && !WW().tierAt(world, pe.x, pe.y)) {
        const n = WW().nearest(world, pe.x, pe.y);
        if (n && n.d > 8) { e.aggro = false; e.target = null; }
      }
      if (!e.aggro && e.home && U.dist(e.x, e.y, e.home.x, e.home.y) > 3) { ECHO.Ent.seek(world, e, e.home.x, e.home.y, e.speed * 0.5, dt); e.state = 'idle'; return true; }
      return false;
    },

    // ------------------------------------------------------------ their own ways of fighting
    // Returns true when the beast spent this frame on one.
    ability(game, e, dt, d, ang) {
      const ab = e.wab || (e.foe && e.foe.wab);
      if (!ab) return false;
      const pe = game.pe, pl = game.pl, F = e.foe, world = game.world;
      e.wabT = e.wabT || {};
      for (const k in e.wabT) e.wabT[k] -= dt;
      const ready = k => ab[k] && (e.wabT[k] || 0) <= 0;
      const use = k => { e.wabT[k] = ab[k].cd * (e.cdMul || 1) * (0.85 + Math.random() * 0.3); };
      const hit = (mul, type, knock, a) => ECHO.Combat.damage(pe, F.dmg * e.dmgMul * mul, { type: type || 'melee', from: e, angle: a != null ? a : Math.atan2(pe.y - e.y, pe.x - e.x), knock: knock || 0.3 });
      const los = () => ECHO.Ent.lineOfSight(world, e.x, e.y, pe.x, pe.y);
      // bark closed: it heals and turns blows
      if (e.barkT > 0) {
        e.barkT -= dt; e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.02 * dt);
        if (Math.random() < dt * 5) ECHO.Combat.burst(e.x, e.y - 0.8, '#6a5a3a', 2, 1, 0.4, 2);
        if (e.barkT <= 0) { e.resist = e._res0 || e.resist; ECHO.Combat.floater(e.x, e.y - 2, 'the bark opens', '#c8b080'); }
      }
      // a cast in progress
      if (e.wcast) {
        const c = e.wcast; c.t += dt; e.moving = false; e.state = 'cast'; e.dir = c.ang != null ? c.ang : e.dir;
        if (c.k === 'fade') {
          e.hidden = true;
          if (!c.tele && c.t > 0.8) { c.tele = true; c.x = pe.x; c.y = pe.y; ECHO.Combat.telegraph({ x: c.x, y: c.y, radius: 1.4, life: 0.5, shape: 'circle', color: 'rgba(30,40,20,0.55)' }); }
          if (c.t >= 1.3) {
            e.wcast = null; e.state = 'chase'; e.hidden = false; e.cd = 0.7;
            const a = Math.random() * 6.28, sp = ECHO.Ent.freeSpot(world, c.x + Math.cos(a) * 1.1, c.y + Math.sin(a) * 1.1, 2) || { x: c.x, y: c.y };
            e.x = sp.x; e.y = sp.y;
            ECHO.Combat.burst(e.x, e.y, '#0e100c', 18, 4, 0.6, 3); ECHO.Combat.ring(c.x, c.y, 1.4, 'rgba(200,255,120,0.8)', 0.35);
            if (U.dist(c.x, c.y, pe.x, pe.y) < 1.4 + pe.r) { hit(1.6, 'melee', 0.5); D.bleed(game, e, 0.07, 4); }
          }
          return true;
        }
        if (c.t < c.wind) {
          if (c.k === 'scream' && Math.random() < dt * 20) ECHO.Combat.fx.push({ kind: 'p', x: e.x + (Math.random() - 0.5), y: e.y - 1.6, vx: (Math.random() - 0.5) * 3, vy: -1, t: 0, life: 0.5, color: '#d8ff7a', size: 2 });
          return true;
        }
        e.wcast = null; e.state = 'chase'; e.cd = 0.8;
        if (c.k === 'scream') {
          ECHO.Combat.ring(e.x, e.y, c.r, 'rgba(216,255,122,0.85)', 0.8); game.shake(0.35);
          if (ECHO.Sfx) ECHO.Sfx.play('roar', { pitch: 1.9, vol: 0.8 });
          if (U.dist(e.x, e.y, pe.x, pe.y) < c.r) { pl.fearT = 1.5; pl.slowT = Math.max(pl.slowT || 0, 2.5); D.fearFrom = { x: e.x, y: e.y }; ECHO.Combat.floater(pe.x, pe.y - 1.3, 'TERROR', '#d8ff7a', true); hit(0.5, 'magic', 0); if (game.hurtFlash) game.hurtFlash(0.5); }
          for (const o of game.ents) if (o.wood && !o.dead && o !== e && U.dist(o.x, o.y, e.x, e.y) < 10) { o.aggro = true; o.cdMul = (o.cdMul || 1) * 0.8; }
        } else if (c.k === 'rend') {
          // three tearing blows, and it drinks what it tears out of you
          let tot = 0;
          for (let i = 0; i < 3; i++) setTimeout(() => {
            if (e.dead || game.pe.dead) return;
            ECHO.Combat.slash(e.x, e.y, c.ang + (i - 1) * 0.35, F.reach + 0.4, 1.4, 'rgba(216,255,122,0.8)');
            const dd = U.dist(e.x, e.y, pe.x, pe.y), aa = Math.atan2(pe.y - e.y, pe.x - e.x);
            if (dd < F.reach + 0.8 && Math.abs(U.angleDiff(aa, c.ang)) < 1.1) { const h = hit(0.65, 'melee', 0.15, aa) || 0; tot += h; e.hp = Math.min(e.maxHp, e.hp + h * 0.4); if (h) ECHO.Combat.floater(e.x, e.y - 2, 'feeds', '#d8ff7a'); }
          }, i * 160);
        } else if (c.k === 'rootquake') {
          for (let i = 0; i < 3; i++) {
            const r = 1.6 + i * 1.6;
            setTimeout(() => {
              if (e.dead) return;
              ECHO.Combat.ring(e.x, e.y, r, 'rgba(160,130,80,0.9)', 0.4);
              for (let k = 0; k < 10; k++) { const a = k / 10 * 6.28; ECHO.Combat.burst(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r, '#5a4a2a', 3, 2, 0.4, 2); }
              game.shake(0.2);
              const dd = U.dist(e.x, e.y, pe.x, pe.y);
              if (Math.abs(dd - r) < 0.85 && !pl.flying) { hit(1.1, 'melee', 0.2); pl.rootT = Math.max(pl.rootT || 0, 1.1); ECHO.Combat.floater(pe.x, pe.y - 1.1, 'roots!', '#a0c060'); }
            }, i * 330);
          }
        } else if (c.k === 'hurl') {
          ECHO.Combat.shoot(e, c.ang, { kind: 'orb', speed: 11, dmg: F.dmg * e.dmgMul * 1.5, life: 1.5, type: 'melee', color: '#6a5232', effect: 'log' });
          if (ECHO.Sfx) ECHO.Sfx.play('swing', { pitch: 0.5 });
        } else if (c.k === 'wail') {
          for (let i = 0; i < 18; i++) { const a = c.ang + (Math.random() - 0.5) * c.arc, r = Math.random() * c.len; ECHO.Combat.fx.push({ kind: 'p', x: e.x + Math.cos(a) * r, y: e.y + Math.sin(a) * r, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3, t: 0, life: 0.7, color: '#d8e8e0', size: 3 }); }
          if (ECHO.Sfx) ECHO.Sfx.play('hiss', { pitch: 2.2, vol: 0.9 });
          const dd = U.dist(e.x, e.y, pe.x, pe.y), aa = Math.atan2(pe.y - e.y, pe.x - e.x);
          if (dd < c.len && Math.abs(U.angleDiff(aa, c.ang)) < c.arc / 2) { hit(1.4, 'magic', 0.4); pl.slowT = Math.max(pl.slowT || 0, 2.5); ECHO.Combat.floater(pe.x, pe.y - 1.2, 'chilled to the bone', '#d8e8e0'); }
        } else if (c.k === 'horn') {
          // the riders of the Wild Hunt run down their lanes
          if (ECHO.Sfx) ECHO.Sfx.play('roar', { pitch: 0.7 });
          for (const L of c.lanes) {
            for (let s = -L.len / 2; s < L.len / 2; s += 0.9) ECHO.Combat.burst(L.x + Math.cos(L.a) * s, L.y + Math.sin(L.a) * s, '#c8ffda', 2, 3, 0.5, 2);
            const px = pe.x - L.x, py = pe.y - L.y, along = px * Math.cos(L.a) + py * Math.sin(L.a), off = Math.abs(px * Math.sin(L.a) - py * Math.cos(L.a));
            if (Math.abs(along) < L.len / 2 && off < 0.95) { hit(1.6, 'magic', 0.8, L.a); pl.fearT = 1; D.fearFrom = { x: e.x, y: e.y }; ECHO.Combat.floater(pe.x, pe.y - 1.3, 'ridden down', '#c8ffda', true); }
          }
          game.shake(0.4);
        }
        return true;
      }
      // sunk among the roots
      if (e.burrowT > 0) {
        e.burrowT -= dt; e.hidden = true; e.moving = false;
        if (e.burrowT <= 0) {
          e.hidden = false;
          const sp = ECHO.Ent.freeSpot(world, e.bx, e.by, 2) || { x: e.bx, y: e.by };
          e.x = sp.x; e.y = sp.y;
          ECHO.Combat.burst(e.x, e.y, '#4a3a22', 26, 5, 0.7, 3); ECHO.Combat.ring(e.x, e.y, 1.8, 'rgba(255,120,60,0.85)', 0.4); game.shake(0.3);
          if (U.dist(e.x, e.y, pe.x, pe.y) < 1.8 + pe.r) { hit(1.5, 'melee', 0.7); D.bleed(game, e, 0.06, 4); }
          e.cd = 0.9;
        }
        return true;
      }
      if (!e.aggro || e.hidden) return false;
      // ---- choosing
      if (ready('fade') && d < 9 && d > 2.2 && e.cd <= 0.3) { use('fade'); e.wcast = { k: 'fade', t: 0 }; ECHO.Combat.burst(e.x, e.y, '#0e100c', 18, 3, 0.6, 3); e.say = '…'; e.sayT = 0.8; return true; }
      if (ready('hamstring') && d < F.reach + 0.3 && e.cd <= 0.25) {
        use('hamstring'); e.cd = F.cd;
        ECHO.Combat.slash(e.x, e.y, ang, F.reach + 0.2, 1.5, 'rgba(200,40,40,0.8)');
        if (hit(1.1, 'melee', 0.2)) { pl.slowT = Math.max(pl.slowT || 0, 2.2); D.bleed(game, e, 0.06, 4); ECHO.Combat.floater(pe.x, pe.y - 1.2, 'hamstrung', '#ff6a5a'); }
        return true;
      }
      if (ready('scream') && d < 8) { use('scream'); e.wcast = { k: 'scream', t: 0, wind: 0.7, r: e.lord ? 8 : 6.5 }; ECHO.Combat.telegraph({ x: e.x, y: e.y, radius: e.lord ? 8 : 6.5, life: 0.7, shape: 'circle', color: 'rgba(216,255,122,0.22)', follow: e }); e.say = 'AAAAAHHHHH'; e.sayT = 1; return true; }
      if (ready('rend') && d < F.reach + 0.5 && e.cd <= 0.3) { use('rend'); e.wcast = { k: 'rend', t: 0, wind: 0.45, ang }; ECHO.Combat.telegraph({ x: e.x, y: e.y, angle: ang, len: F.reach + 0.8, arc: 2.2, life: 0.45, shape: 'cone', color: 'rgba(216,255,122,0.3)', follow: e }); return true; }
      if (ready('rootquake') && d < 6 && e.cd <= 0.3) { use('rootquake'); e.wcast = { k: 'rootquake', t: 0, wind: 0.9 }; for (let i = 0; i < 3; i++) ECHO.Combat.telegraph({ x: e.x, y: e.y, radius: 1.6 + i * 1.6, life: 0.9 + i * 0.33, shape: 'circle', color: 'rgba(140,110,60,0.18)' }); e.say = 'HRRRMMM'; e.sayT = 1; return true; }
      if (ready('barkskin') && e.hp < e.maxHp * 0.7 && !(e.barkT > 0)) {
        use('barkskin'); e.barkT = ab.barkskin.dur; e._res0 = e._res0 || { ...e.resist };
        e.resist = { melee: 0.75, ranged: 0.85, magic: 0.6, fire: 0.1 };
        ECHO.Combat.ring(e.x, e.y, 1.8, 'rgba(160,130,80,0.9)', 0.6); ECHO.Combat.floater(e.x, e.y - 2.2, 'the bark closes', '#c8b080');
      }
      if (ready('hurl') && d > 2.8 && d < 12 && e.cd <= 0.3 && los()) { use('hurl'); e.wcast = { k: 'hurl', t: 0, wind: 0.7, ang }; ECHO.Combat.telegraph({ x: e.x, y: e.y, angle: ang, len: Math.min(12, d + 2), width: 1.2, life: 0.7, shape: 'line', color: 'rgba(140,110,60,0.3)' }); return true; }
      if (ready('wail') && d < 7 && d > 1.2 && e.cd <= 0.3 && los()) { use('wail'); e.wcast = { k: 'wail', t: 0, wind: 0.75, ang, len: 7, arc: 1.0 }; ECHO.Combat.telegraph({ x: e.x, y: e.y, angle: ang, len: 7, arc: 1.0, life: 0.75, shape: 'cone', color: 'rgba(216,232,224,0.3)', follow: e }); e.say = '*wails*'; e.sayT = 1; return true; }
      if (ready('blink') && (d < 2.2 || e.hurtT > 0.1)) {
        use('blink');
        const a = Math.random() * 6.28, sp = ECHO.Ent.freeSpot(world, pe.x + Math.cos(a) * 5.5, pe.y + Math.sin(a) * 5.5, 3);
        if (sp) { ECHO.Combat.burst(e.x, e.y, '#d8e8e0', 16, 3, 0.6, 2); e.x = sp.x; e.y = sp.y; ECHO.Combat.burst(e.x, e.y, '#d8e8e0', 16, 3, 0.6, 2); e.cd = 0.5; }
      }
      if (ready('hands') && d < 10) {
        use('hands');
        for (let i = 0; i < 4; i++) { const a = i / 4 * 6.28 + Math.random(), r = i === 0 ? 0 : 1.6 + Math.random() * 1.2; D.hazard({ x: pe.x + Math.cos(a) * r, y: pe.y + Math.sin(a) * r, r: 1.05, warn: 0.95, life: 0.25, kind: 'hands', from: e, mul: 1.0 }); }
        e.say = '…stay…'; e.sayT = 1.2;
      }
      if (ready('drop') && d < 7 && e.cd <= 0.3) { use('drop'); D.drop(game, e); return true; }
      if (ready('snare') && d > 2 && d < 10 && e.cd <= 0.3 && los()) { use('snare'); ECHO.Combat.shoot(e, ECHO.Aware ? ECHO.Aware.lead(game, e, pe, 9, ang) : ang, { kind: 'orb', speed: 9, dmg: F.dmg * e.dmgMul * 0.5, life: 1.5, type: 'magic', color: '#f4f4ff', effect: 'snare' }); e.cd = 0.6; }
      if (ready('burrow') && d < 9 && d > 1.5 && e.cd <= 0.3) {
        use('burrow'); e.burrowT = 1.3; e.bx = pe.x; e.by = pe.y; e.hidden = true;
        ECHO.Combat.burst(e.x, e.y, '#4a3a22', 20, 4, 0.6, 3);
        ECHO.Combat.telegraph({ x: pe.x, y: pe.y, radius: 1.8, life: 1.3, shape: 'circle', color: 'rgba(255,120,60,0.28)' });
        return true;
      }
      if (ready('thornvolley') && d > 2 && d < 10 && e.cd <= 0.3 && los()) {
        use('thornvolley'); e.cd = 0.9;
        for (let i = -2; i <= 2; i++) ECHO.Combat.shoot(e, ang + i * 0.16, { kind: 'orb', speed: 12, dmg: F.dmg * e.dmgMul * 0.55, life: 1.1, type: 'ranged', color: '#ff8a3a', effect: 'thorn' });
        if (ECHO.Sfx) ECHO.Sfx.play('hiss', { pitch: 0.8 });
        return true;
      }
      if (ready('horn') && d < 14 && e.cd <= 0.3) {
        use('horn');
        const lanes = [];
        const n = e.phase2 ? 4 : 3;
        for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI; const off = i === 0 ? 0 : (Math.random() - 0.5) * 3; lanes.push({ x: pe.x + Math.cos(a + Math.PI / 2) * off, y: pe.y + Math.sin(a + Math.PI / 2) * off, a, len: 18 }); }
        for (const L of lanes) ECHO.Combat.telegraph({ x: L.x - Math.cos(L.a) * L.len / 2, y: L.y - Math.sin(L.a) * L.len / 2, angle: L.a, len: L.len, width: 1.9, life: 1.15, shape: 'line', color: 'rgba(200,255,218,0.3)' });
        e.wcast = { k: 'horn', t: 0, wind: 1.15, lanes };
        e.say = pick(['The Hunt rides!', 'RUN.', 'Hear the horn, little one.']); e.sayT = 1.5;
        UI().toast('The horn of the Wild Hunt! Get out of the riders\' lanes.', 'warn', 3);
        return true;
      }
      if (ready('hunt') && d < 14 && game.ents.filter(o => o.summoner === e && !o.dead).length < 4) { use('hunt'); D.pack(game, e, 2); e.say = pick(['Hounds! To me!', 'Find them.', 'Hunt!']); e.sayT = 1.5; }
      if (ready('thornring') && d < 12) {
        use('thornring');
        for (let i = 0; i < 10; i++) { const a = i / 10 * 6.28; D.hazard({ x: pe.x + Math.cos(a) * 3.6, y: pe.y + Math.sin(a) * 3.6, r: 1.0, warn: 0.7, life: 6, kind: 'thorns', from: e, mul: 0.6 }); }
        ECHO.Combat.floater(pe.x, pe.y - 1.4, 'the thorns close in', '#ff8a3a');
      }
      if (ready('wake') && d < 14) {
        use('wake');
        for (let i = 0; i < 5; i++) { const a = Math.random() * 6.28, r = i === 0 ? 0 : 1.5 + Math.random() * 3.5; D.hazard({ x: pe.x + Math.cos(a) * r, y: pe.y + Math.sin(a) * r, r: 1.3, warn: 1.0, life: 0.25, kind: 'roots', from: e, mul: 1.2 }); }
      }
      return false;
    },
    // the hounds of the Hunt come out of the dark
    pack(game, e, n) {
      const world = game.world;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.28, sp = ECHO.Ent.freeSpot(world, e.x + Math.cos(a) * 3, e.y + Math.sin(a) * 3, 3);
        if (!sp) continue;
        const m = D.make(game, 'gloamstalker', sp.x, sp.y, WW().level(world, 2), null, 2);
        m.summoner = e; m.aggro = true; m.wood = e.wood;
        game.addEnt(m);
        ECHO.Combat.burst(sp.x, sp.y, '#0e100c', 16, 3, 0.6, 3);
      }
    },
    // a widow lets go of the bough and falls on you
    drop(game, e) {
      const pe = game.pe;
      e.hidden = true; e.dropT = 0.9; e.dx = pe.x; e.dy = pe.y; e.wcast = null;
      ECHO.Combat.telegraph({ x: pe.x, y: pe.y, radius: 1.7, life: 0.9, shape: 'circle', color: 'rgba(20,10,10,0.55)' });
      ECHO.Combat.floater(pe.x, pe.y - 1.5, 'something above you', '#ff6a5a');
      D.hazard({ x: pe.x, y: pe.y, r: 1.7, warn: 0.9, life: 0.2, kind: 'drop', from: e, mul: 1.8, land: e });
    },
    bleed(game, e, frac, dur) {
      const pl = game.pl;
      pl.poisonT = Math.max(pl.poisonT || 0, dur);
      pl.poisonDps = Math.max(pl.poisonDps || 0, e.foe.dmg * e.dmgMul * frac);
      ECHO.Combat.floater(game.pe.x, game.pe.y - 1.4, 'bleeding', '#ff4a3a');
    },
    // projectiles of theirs that land
    orbHit(game, p, target) {
      const pl = game.pl;
      if (target !== game.pe) return;
      if (p.effect === 'snare') { pl.rootT = Math.max(pl.rootT || 0, 1.5); ECHO.Combat.floater(target.x, target.y - 1.1, 'snared', '#f4f4ff'); }
      if (p.effect === 'thorn' && p.from && p.from.foe) D.bleed(game, p.from, 0.03, 3);
      if (p.effect === 'log') { game.shake(0.3); target.stagger = Math.max(target.stagger || 0, 0.3); }
    },

    // ------------------------------------------------------------ the ground itself
    hazard(o) {
      const h = { t: 0, warn: 0, r: 1, life: 1, mul: 1, ...o };
      D.hz.push(h);
      const col = { hands: 'rgba(200,220,200,0.32)', thorns: 'rgba(255,120,60,0.32)', roots: 'rgba(140,110,60,0.32)', drop: 'rgba(20,10,10,0.0)' }[h.kind];
      if (col) ECHO.Combat.telegraph({ x: h.x, y: h.y, radius: h.r, life: h.warn || h.life, shape: 'circle', color: col });
      if (h.kind === 'thorns') ECHO.Combat.telegraph({ x: h.x, y: h.y, radius: h.r, life: h.warn + h.life, shape: 'circle', color: 'rgba(255,90,40,0.25)' });
      return h;
    },
    hazards(game, dt) {
      if (!D.hz.length) return;
      const pe = game.pe, pl = game.pl;
      for (const h of D.hz) {
        h.t += dt;
        const live = h.t >= h.warn, src = h.from && !h.from.dead ? h.from : null;
        const dmg = mul => src ? ECHO.Combat.damage(pe, src.foe.dmg * src.dmgMul * mul, { type: 'melee', from: src, angle: Math.atan2(pe.y - h.y, pe.x - h.x), knock: 0.3 }) : 0;
        const inside = U.dist(h.x, h.y, pe.x, pe.y) < h.r + pe.r * 0.5;
        if (!live) continue;
        if (h.kind === 'hands' || h.kind === 'roots') {
          if (!h.done) {
            h.done = true;
            ECHO.Combat.burst(h.x, h.y, h.kind === 'hands' ? '#c8d0c0' : '#5a4a2a', 18, 4, 0.6, 3);
            if (inside && !pl.flying) { dmg(h.mul); pl.rootT = Math.max(pl.rootT || 0, 1); ECHO.Combat.floater(pe.x, pe.y - 1.1, h.kind === 'hands' ? 'cold hands hold you' : 'roots!', '#d8e8e0'); }
          }
        } else if (h.kind === 'drop') {
          if (!h.done) {
            h.done = true;
            const e = h.land;
            if (e && !e.dead) { const sp = ECHO.Ent.freeSpot(game.world, h.x, h.y, 2) || { x: h.x, y: h.y }; e.x = sp.x; e.y = sp.y; e.hidden = false; e.aggro = true; e.cd = 0.8; }
            ECHO.Combat.burst(h.x, h.y, '#2a1a1a', 22, 5, 0.7, 3); ECHO.Combat.ring(h.x, h.y, h.r, 'rgba(255,60,60,0.8)', 0.4); game.shake(0.35);
            if (inside) { dmg(h.mul); pl.poisonT = Math.max(pl.poisonT || 0, 4); pl.poisonDps = Math.max(pl.poisonDps || 0, src ? src.foe.dmg * src.dmgMul * 0.05 : 2); }
          }
        } else if (h.kind === 'thorns') {
          if (Math.random() < dt * 6) ECHO.Combat.burst(h.x + (Math.random() - 0.5) * h.r, h.y + (Math.random() - 0.5) * h.r, '#3a2a1a', 2, 1, 0.4, 2);
          if (inside && !pl.flying && (h._tick = (h._tick || 0) - dt) <= 0) { h._tick = 0.5; dmg(h.mul * 0.5); pl.slowT = Math.max(pl.slowT || 0, 0.8); }
        }
      }
      D.hz = D.hz.filter(h => h.t < h.warn + h.life);
    },

    // ------------------------------------------------------------ the wood watches you
    haunt(game, tier, wood, dt) {
      const world = game.world, pe = game.pe, pl = game.pl;
      // eyes between the trees, that go out when you come near
      for (const y of D.eyes) { y.t += dt; if (U.dist(y.x, y.y, pe.x, pe.y) < 7) y.t = Math.max(y.t, y.life - 0.3); }
      D.eyes = D.eyes.filter(y => y.t < y.life);
      if (!tier) { D.eyes.length = 0; return; }
      const night = game.isNight ? game.isNight() : false;
      if (D.eyes.length < (night ? 8 : 4) + tier * 2 && Math.random() < 0.5) {
        for (let k = 0; k < 6; k++) {
          const a = Math.random() * 6.28, r = 9 + Math.random() * 9, x = pe.x + Math.cos(a) * r, y = pe.y + Math.sin(a) * r;
          if (!WW().tierAt(world, x, y)) continue;
          D.eyes.push({ x, y, h: 0.4 + Math.random() * 1.6, t: 0, life: 4 + Math.random() * 8, s: 0.6 + Math.random() * 0.8, col: Math.random() < 0.7 ? '#d8ff7a' : '#ff3a2a', blink: Math.random() * 6 });
          break;
        }
      }
      // whispers, and things heard and not seen
      D.wT -= dt;
      if (D.wT <= 0) {
        D.wT = 9 + Math.random() * 14;
        const fighting = D.live(game).some(e => e.aggro);
        if (!fighting) {
          const r = Math.random();
          if (r < 0.45) { const a = Math.random() * 6.28; ECHO.Combat.floater(pe.x + Math.cos(a) * 2.5, pe.y + Math.sin(a) * 2.5 - 1, pick(WHISPERS), '#a8c8a0'); }
          else if (r < 0.7) { if (ECHO.Sfx) ECHO.Sfx.play(pick(['growl', 'snort', 'flutter']), { pitch: 0.4 + Math.random() * 0.4, vol: 0.35 }); }
          else if (r < 0.8 && wood && WW().lordAlive(world, wood)) { if (ECHO.Sfx) ECHO.Sfx.play('roar', { pitch: 0.4, vol: 0.25 }); if (!pl._hornTold) { pl._hornTold = true; UI().toast(`Far off, deep in ${wood.name}, a hunting horn. Something in there knows you have come.`, 'warn', 6); } }
        }
      }
    },

    // ------------------------------------------------------------ the caches of those before you
    interactables(game) {
      const out = [], world = game.world, pe = game.pe;
      if (ECHO.Interior.cur || !world.wild) return out;
      for (const w of world.wild.woods) for (const c of w.caches) {
        if (c.opened) continue;
        const d = U.dist(c.x, c.y, pe.x, pe.y);
        if (d < 1.7) out.push({ kind: 'act', label: c.kind === 'cage' ? 'Search the cage' : c.kind === 'camp' ? 'Search the abandoned camp' : 'Search the remains', d, act: () => D.open(game, w, c) });
      }
      return out;
    },
    open(game, w, c) {
      const world = game.world, pl = game.pl;
      c.opened = world.day;
      const t = WW().tierAt(world, c.x, c.y) || 1, L = Math.max(ECHO.Prowess.level(pl), WW().level(world, t) - 20);
      const rng = new ECHO.RNG((Math.random() * 4294967295) >>> 0);
      const gold = Math.round(80 + Math.min(L, 150) * 6 + rng.next() * 200);
      game.loot.push({ x: c.x + 0.4, y: c.y, kind: 'gold', qty: gold });
      if (ECHO.Gear && ECHO.Gear.make) {
        const it = ECHO.Gear.make(world, rng, ['sword', 'bow', 'armor'][rng.int(0, 2)], L, rng.chance(0.25 + t * 0.15) ? 'legendary' : 'epic', `on the remains of someone lost in ${w.name}`);
        if (it) game.dropItem(it.id, c.x - 0.3, c.y);
      }
      game.loot.push({ x: c.x, y: c.y + 0.4, kind: rng.chance(0.5) ? 'gloamhide' : 'antlerbone', qty: 1 + rng.int(0, 2) });
      const what = { cage: 'In the cage, under rags, the bones of someone who was put there alive. Whatever they carried is still with them.', camp: 'A camp left in a hurry: a cold fire, a torn tent, a pack nobody came back for.', bones: 'Bones, gnawed. A pack, a blade, a purse: whoever it was, they got this far.' }[c.kind];
      UI().toast(what, 'study', 6);
      if (ECHO.Sfx) ECHO.Sfx.play('coin');
      ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} found what was left of someone lost in ${w.name}.`, importance: 0, x: c.x, y: c.y });
    },

    // ------------------------------------------------------------ a lord falls
    onKill(game, e, from) {
      const world = game.world, pl = game.pl;
      if (!e.lord) return;
      UI().bossBar(null);
      const w = world.wild && world.wild.woods.find(x => x.id === e.wood);
      if (!w) return;
      w.lord.slain = world.day; w.lord.kills = (w.lord.kills || 0) + 1;
      if (e._tamedNow) return;
      const byYou = from === game.pe || (from && (from.isCompanion || from.tamed));
      if (!byYou) return;
      UI().banner(`${U.cap(w.lord.name)} is slain`, `${w.name} is quiet — for now`, true);
      pl.renown = (pl.renown || 0) + 30;
      ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} went into the heart of ${w.name} and killed ${w.lord.name}, ${w.lord.title}. The horn was not heard there for a season.`, importance: 3, x: w.x, y: w.y, rep: 12, tag: 'protect' });
      const rng = new ECHO.RNG((Math.random() * 4294967295) >>> 0);
      for (let i = 0; i < 2; i++) { const it = ECHO.Gear.make(world, rng, ['sword', 'bow', 'armor'][rng.int(0, 2)], Math.max(ECHO.Prowess.level(pl), e.lvl - 40), 'legendary', `from the hand of ${w.lord.name}`); if (it) game.dropItem(it.id, e.x + (i ? 0.5 : -0.5), e.y); }
      if (ECHO.Ambition) ECHO.Ambition.note(pl, 'lords');
    }
  };
  D.install();
})();
