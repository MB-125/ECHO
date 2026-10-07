// Quests and places in real time: landmarks you discover and use, delves you
// fight through, and the quests that put something at the end of the road —
// guardians at a frontier site, a named beast, a lost child, buried treasure.
(function () {
  const { U } = ECHO;
  const T = ECHO.TIME;
  const UI = () => ECHO.UI;
  const X = () => ECHO.Explore;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const DIR = (a, b) => X().dirFrom(a, b);

  // Humanoid foes that are not people of the world: the barrow dead, smugglers.
  const FOES = {
    wight: { name: 'Barrow-wight', hp: 52, dmg: 10, speed: 2.7, reach: 1.25, wind: 0.55, cd: 1.5, look: 'wight' },
    'barrow-king': { name: 'the Barrow-King', hp: 190, dmg: 17, speed: 2.4, reach: 1.6, wind: 0.7, cd: 1.6, look: 'king', elite: true },
    'crypt-warden': { name: 'the Crypt Warden', hp: 170, dmg: 15, speed: 2.5, reach: 1.5, wind: 0.65, cd: 1.5, look: 'king', elite: true },
    brigand: { name: 'Smuggler', hp: 46, dmg: 9, speed: 3.7, reach: 1.2, wind: 0.42, cd: 1.2, look: 'brigand' },
    'smuggler-chief': { name: 'the Smuggler Chief', hp: 150, dmg: 14, speed: 3.6, reach: 1.3, wind: 0.45, cd: 1.0, look: 'chief', elite: true },
    outlaw: { name: 'Ashfang scout', hp: 48, dmg: 9, speed: 3.8, reach: 1.2, wind: 0.42, cd: 1.2, look: 'brigand' }
  };

  const Q = ECHO.Quests = {
    FOES, glows: [], t: 0, spawned: {},
    reset() { Q.glows = []; Q.spawned = {}; },

    // ------------------------------------------------------------ foes
    makeFoe(game, kind, x, y, o = {}) {
      const F = FOES[kind];
      const e = ECHO.Ent.make({ type: 'creature', species: kind, humanoid: true, foe: F, x, y, r: 0.36, hp: F.hp, maxHp: F.hp, speed: F.speed, faction: 'wild', label: F.elite ? F.name : null, state: 'idle', gear: { bow: kind === 'brigand' && Math.random() < 0.3 }, look: { skin: F.look === 'wight' || F.look === 'king' ? '#cfe3d8' : ['#e0ac85', '#c68a62', '#a8694a'][Math.floor(Math.random() * 3)], hair: F.look === 'wight' || F.look === 'king' ? '#e8f0e8' : '#2b1d14', hairStyle: Math.floor(Math.random() * 4), beard: Math.random() < 0.4 }, ...o });
      return e;
    },
    updateFoe(game, e, dt) {
      const F = e.foe, world = game.world, pe = game.pe;
      e.cd = Math.max(0, (e.cd || 0) - dt); e.t += dt;
      if (e.stagger > 0) { e.stagger -= dt; e.state = 'stagger'; return; }
      if (e.state === 'stagger') e.state = 'chase';
      const d = U.dist(e.x, e.y, pe.x, pe.y);
      const hostile = !pe.dead && !game.pl.capture && !game.defeating;
      const sees = hostile && (d < (e.indoor ? 14 : 9) || e.aggro) && (d < 3 || ECHO.Ent.lineOfSight(world, e.x, e.y, pe.x, pe.y));
      if (sees) e.aggro = true;
      if (!e.aggro || !hostile || d > 22) { e.state = 'idle'; e.moving = false; if (Math.random() < dt * 0.2) e.dir = Math.random() * Math.PI * 2; return; }
      const ang = Math.atan2(pe.y - e.y, pe.x - e.x);
      // the elites call for help once, when hurt
      if (F.elite && !e.called && e.hp < e.maxHp * 0.5) {
        e.called = true;
        e.say = F.look === 'chief' ? 'To me! Kill them!' : '…RISE…'; e.sayT = 2;
        for (let i = 0; i < 2; i++) {
          const a = Math.random() * Math.PI * 2;
          const spot = ECHO.Ent.freeSpot(world, e.x + Math.cos(a) * 2.5, e.y + Math.sin(a) * 2.5, 3);
          if (spot) game.ents.push(Q.makeFoe(game, F.look === 'chief' ? 'brigand' : 'wight', spot.x, spot.y, { aggro: true, delve: e.delve, questId: e.questId, indoor: e.indoor }));
        }
        ECHO.Combat.ring(e.x, e.y, 3, F.look === 'chief' ? 'rgba(255,200,120,0.8)' : 'rgba(160,255,200,0.8)', 0.6);
      }
      switch (e.state) {
        case 'windup':
          e.moving = false; e.dir = e.aim; e.flip = Math.cos(e.dir) < 0;
          if (e.t > e.windEnd) {
            e.state = 'attack'; e.t = 0; e.attackT = 0.2; e.attackDur = 0.2; e.attackKind = 'fore';
            if (e.shooter) ECHO.Combat.shoot(e, e.aim + (Math.random() - 0.5) * 0.1, { kind: 'arrow', speed: 13, dmg: F.dmg * 0.8, life: 1.3, type: 'ranged' });
            else {
              ECHO.Combat.melee(e, { angle: e.aim, arc: F.elite ? 2.2 : 1.6, range: F.reach, dmg: F.dmg * (0.9 + Math.random() * 0.2), knock: F.elite ? 0.3 : 0.15 });
              ECHO.Combat.slash(e.x, e.y, e.aim, F.reach + 0.1, F.elite ? 2.2 : 1.6, F.look === 'wight' || F.look === 'king' ? 'rgba(170,255,210,0.75)' : 'rgba(255,220,200,0.7)');
            }
            e.cd = F.cd + Math.random() * 0.5;
          }
          return;
        case 'attack': if (e.t > 0.25) e.state = 'chase'; return;
        default: {
          e.state = 'chase';
          e.shooter = e.gear.bow && d > 3;
          const want = e.shooter ? 6 : F.reach + 0.3;
          if (d > want) ECHO.Ent.travel(world, e, pe.x, pe.y, e.speed, dt);
          else if (e.shooter && d < 4) ECHO.Ent.seek(world, e, e.x - Math.cos(ang) * 2, e.y - Math.sin(ang) * 2, e.speed * 0.8, dt);
          else e.moving = false;
          e.dir = ang; e.flip = Math.cos(ang) < 0;
          if (e.cd <= 0 && d < (e.shooter ? 9 : want + 0.4)) {
            e.state = 'windup'; e.t = 0; e.aim = ang; e.windEnd = e.shooter ? 0.7 : F.wind;
            if (!e.shooter) ECHO.Combat.telegraph({ x: e.x, y: e.y - 0.1, angle: ang, len: F.reach + 0.3, arc: F.elite ? 2.2 : 1.6, life: e.windEnd, shape: 'cone', color: 'rgba(255,90,70,0.22)', follow: e });
            if (F.look === 'wight' && Math.random() < 0.3) { e.say = ['…', 'Leave…', 'Not yours…', 'Sleep…'][Math.floor(Math.random() * 4)]; e.sayT = 1.5; }
          }
        }
      }
    },
    onKill(target, from) {
      const game = ECHO.Game, world = game.world;
      const gold = target.foe ? (target.foe.elite ? 30 + Math.floor(Math.random() * 40) : Math.floor(Math.random() * 8)) : 0;
      if (gold) game.loot.push({ x: target.x, y: target.y, kind: 'gold', qty: gold });
      if (target.questId) {
        const p = ECHO.Plights.byId(world, target.questId);
        if (p && p.status === 'open') {
          if (p.kind === 'hunt' && target.beast) {
            p.claimable = true; game.pl.inv.pelt = (game.pl.inv.pelt || 0) + 1;
            ECHO.Chronicle.deed(world, { text: `${game.pl.first} ${game.pl.last} killed ${p.beast}, the great wolf.`, importance: 1, x: target.x, y: target.y, rep: 3, tag: 'protect' });
            UI().toast(`${p.beast} is dead. You take its pelt. Go back to ${(ECHO.Sim.settlement(world, p.sid) || {}).name || 'town'} to claim the reward.`, 'legend', 7);
          }
          if (p.kind === 'clearsite') {
            const left = game.ents.filter(e => e.questId === p.id && !e.dead && e !== target).length;
            if (!left) { p.claimable = true; ECHO.Music.stinger('discover'); UI().toast(`The land is clear. Go to the keep in ${(ECHO.Sim.settlement(world, p.sid) || {}).name || 'the capital'} to claim the honour — and name the new village.`, 'legend', 9); }
          }
        }
      }
      if (target.delve) {
        const site = X().byId(world, target.delve);
        const left = game.ents.filter(e => e.delve === target.delve && !e.dead && e !== target).length;
        if (site && !left) UI().toast(`${U.cap(site.name)} falls quiet. Whatever was down here is finished — and what it guarded is yours.`, 'legend', 5);
      }
      void from;
    },

    // ------------------------------------------------------------ delves (rooms below ground)
    delveBuilding(site, s) { return { id: 'delve_' + site.id, type: 'delve', site, x: Math.floor(site.x), y: Math.floor(site.y), w: 1, h: 1, s }; },
    layout(game, b, s, BASE) {
      const world = game.world, site = b.site;
      const W = site.kind === 'hideout' ? 19 : 23, H = site.kind === 'hideout' ? 13 : 16;
      const cave = site.kind === 'cave';
      const L = { id: b.id, b, s, type: 'delve', kind: site.kind, site, W, H, floor: cave ? 'cave' : 'crypt', wall: cave ? 'rock' : 'stone', cave: true, furn: [], spots: [], lights: [], blocked: new Uint8Array(W * H) };
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x === 0 || y === 0 || x === W - 1 || y === H - 1) L.blocked[y * W + x] = 1;
      L.doorX = Math.floor(W / 2);
      const f = (model, x, y, o = {}) => {
        const it = { model, x, y, rot: o.rot || 0, w: o.w || 1, h: o.h || 1, solid: o.solid !== false, action: o.action || null, label: o.label || null, light: o.light || null, colors: o.colors || null, scale: o.scale || 1 };
        L.furn.push(it);
        if (it.solid) for (let ty = Math.floor(y - it.h / 2 + 0.05); ty <= Math.floor(y + it.h / 2 - 0.05); ty++) for (let tx = Math.floor(x - it.w / 2 + 0.05); tx <= Math.floor(x + it.w / 2 - 0.05); tx++) if (tx > 0 && ty > 0 && tx < W - 1 && ty < H - 1) L.blocked[ty * W + tx] = 1;
        if (it.light) L.lights.push({ x: BASE + x, y, ...it.light });
        return it;
      };
      const rng = new ECHO.RNG(ECHO.hashStr(site.id + world.seed));
      const free = (x, y) => Math.abs(x - L.doorX) > 2.5 || y < H - 4;
      // pillars / boulders break up the room
      for (let i = 0; i < 9; i++) {
        const x = 2.5 + rng.int(0, W - 6), y = 2.5 + rng.int(0, H - 7);
        if (!free(x, y) || (Math.abs(x - W / 2) < 2 && y < 4)) continue;
        if (cave) f('boulder', x, y, { scale: 0.6 + rng.next() * 0.4, rot: rng.next() * 6 });
        else f('pillar', x, y, { scale: 0.9 });
      }
      // light
      const glow = site.kind === 'barrow' || site.kind === 'crypt' ? { r: 5, a: 0.9, color: '#9fe8c8', h: 1.1 } : { r: 5, a: 1.0, color: '#ffb060', h: 1.1 };
      for (const [x, y] of [[2.5, 2.5], [W - 2.5, 2.5], [2.5, H - 3], [W - 2.5, H - 3]]) f('candles', x, y, { solid: false, light: glow, colors: site.kind === 'barrow' || site.kind === 'crypt' ? { flame: '#9fe8c8', glow: '#9fe8c8' } : null });
      // furnishing by kind
      if (site.kind === 'barrow' || site.kind === 'crypt') {
        f('altar', W / 2, 2.2, { w: 3, h: 1 });
        f('tablet', W / 2 - 3.5, 1.7, { action: 'delvetablet', label: 'Read the carving' });
        for (let i = 0; i < 4; i++) f('chest', 3 + i * (W - 6) / 3, H / 2 + (i % 2 ? 2 : -2), { scale: 0.7, rot: Math.PI / 2, solid: true, colors: { wood: '#5a5650', darkwood: '#3a3632' } });
      } else if (site.kind === 'hideout') {
        for (let i = 0; i < 6; i++) f(i % 2 ? 'crate' : 'barrel', 2 + rng.int(0, W - 4), 2 + rng.int(0, 3));
        f('table', W / 2 + 3, H / 2, { w: 2, h: 1 });
      } else {
        for (let i = 0; i < 5; i++) f('rock', 2 + rng.int(0, W - 4), 2 + rng.int(0, H - 5), { solid: false, scale: 0.35, colors: { rock: '#e2dccb', darkstone: '#cfc7b4' } });
      }
      L.chest = f('chest', W / 2, cave ? 2.2 : 3.6, { action: 'delvechest', label: site.chestTaken ? 'An empty chest' : 'Open the chest', colors: { metal: '#e8c860' } });
      L.inside = { x: BASE + L.doorX + 0.5, y: H - 1.5 };
      L.outside = { x: site.x, y: site.y + 1.6 };
      L.name = U.cap(site.name);
      return L;
    },
    populate(game, L) {
      const world = game.world, site = L.site, BASE = ECHO.Interior.BASE;
      if (site.cleared) return;
      const def = X().DELVES[site.kind];
      const n = 4 + Math.min(4, site.round || 0) + (site.kind === 'cave' ? 1 : 0);
      const spots = [];
      for (let y = 2; y < L.H - 5; y++) for (let x = 2; x < L.W - 2; x++) if (!L.blocked[y * L.W + x]) spots.push({ x: BASE + x + 0.5, y: y + 0.5 });
      spots.sort(() => Math.random() - 0.5);
      const put = (mk) => { const s0 = spots.pop(); if (s0) { const e = mk(s0.x, s0.y); e.delve = site.id; e.indoor = true; game.ents.push(e); } };
      for (let i = 0; i < n; i++) {
        if (def.foes === 'wolf') put((x, y) => { const e = ECHO.Spawner.makeCreature(game, 'wolf', x, y, null, 'den'); e.aggro = i < 2; return e; });
        else put((x, y) => Q.makeFoe(game, def.foes, x, y));
      }
      // the master of the place, by the chest
      const bx = BASE + L.W / 2, by = 5;
      if (def.foes === 'wolf') { const e = ECHO.Spawner.makeCreature(game, 'wolf', bx, by, null, 'den'); e.hp = e.maxHp = 170; e.scale = 1.5; e.dmgMul = 1.7; e.label = 'the Den-Mother'; e.delve = site.id; e.indoor = true; game.ents.push(e); }
      else { const e = Q.makeFoe(game, def.boss, bx, by); e.delve = site.id; e.indoor = true; game.ents.push(e); }
      ECHO.Music.stinger('discover');
    },
    use(game, it) {
      const L = ECHO.Interior.cur, world = game.world, pl = game.pl, site = L.site;
      if (it.action === 'delvetablet') {
        const lang = world.lang;
        const words = lang ? ECHO.Mysteries.WORDS.filter(w => !lang.known[w]).slice(0, 2) : [];
        if (site.used.tablet || !words.length) return UI().toast('The carving says nothing new to you.', 'info', 3);
        site.used.tablet = true;
        for (const w of words) lang.known[w] = true;
        ECHO.Mysteries.checkVault(world);
        UI().toast(`Old runes, cut deep. You make out two words of ${lang.name}: ${words.join(', ')}.`, 'study', 6);
        return;
      }
      if (it.action === 'delvechest') {
        const alive = game.ents.filter(e => e.delve === site.id && !e.dead).length;
        if (alive) return UI().toast('Not with them still about.', 'warn', 2);
        if (site.chestTaken) return UI().toast('The chest is empty.', 'info', 2);
        site.chestTaken = true; site.cleared = true; site.clearedDay = world.day;
        it.label = 'An empty chest';
        const got = Q.loot(game, site);
        ECHO.Sfx.play('coin'); ECHO.Music.stinger('star');
        for (const p of world.plights) if (p.status === 'open' && p.kind === 'delve' && p.siteId === site.id) p.claimable = true;
        ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} cleared ${site.name}.`, importance: 1, x: site.x, y: site.y, rep: 2, tag: 'protect' });
        UI().modal({ title: `The chest in ${site.name}`, html: `<ul>${got.map(g => `<li>${esc(g)}</li>`).join('')}</ul>`, choices: [{ label: 'Take it all', onPick: () => {} }] });
      }
    },
    loot(game, site) {
      const world = game.world, pl = game.pl, out = [];
      const r = Math.random, lvl = 1 + (site.round || 0) * 0.3;
      const gold = Math.round((40 + r() * 60) * lvl); pl.gold += gold; out.push(`${gold} crowns`);
      if (site.kind === 'barrow' || site.kind === 'crypt') {
        const names = ['Barrow-blade', 'Kingsorrow', 'the Grey Edge', 'Oathbreaker', 'Wightsbane', 'the Old Tooth'];
        if (r() < 0.75) {
          const it = ECHO.Character.makeItem(world, { kind: 'sword', name: names[Math.floor(r() * names.length)], dmg: Math.round(17 + r() * 8 + (site.round || 0) * 2), holder: 'player', history: [{ d: world.day, t: `taken from the dead in ${site.name}` }] });
          pl.items.push(it.id);
          if (!world.items[pl.weapon] || it.dmg > world.items[pl.weapon].dmg) pl.weapon = it.id;
          ECHO.PlayerCtl.derivedT = 0;
          out.push(`${it.name} — an old sword of the barrow (power ${it.dmg})`);
        }
        if (r() < 0.4) { pl.inv.starshard = (pl.inv.starshard || 0) + 1; out.push('a shard of star-iron, set in a dead king\'s crown'); }
        const e = ECHO.Wonders.nearestEcho(world, site.x, site.y);
        if (e && !e.revealed) { e.revealed = true; out.push('a carved stone showing a place where the old people still walk (an echo is marked on your map)'); }
      } else if (site.kind === 'cave') {
        pl.inv.hide = (pl.inv.hide || 0) + 3; out.push('3 wolf hides');
        if (r() < 0.6) { pl.inv.arrows += 15; out.push('a dead hunter\'s quiver (15 arrows)'); }
        if (r() < 0.35) { const it = ECHO.Character.makeItem(world, { kind: 'bow', name: 'Hunter\'s longbow', dmg: Math.round(17 + r() * 6), holder: 'player', history: [{ d: world.day, t: `found in ${site.name}, beside its owner's bones` }] }); pl.items.push(it.id); if (!world.items[pl.bow] || it.dmg > world.items[pl.bow].dmg) pl.bow = it.id; ECHO.PlayerCtl.derivedT = 0; out.push(`${it.name} (power ${it.dmg})`); }
      } else if (site.kind === 'hideout') {
        pl.inv.arms = (pl.inv.arms || 0) + 3; pl.inv.food += 4; out.push('3 bundles of smuggled arms', '4 sacks of food');
        const near = ECHO.World.nearestSettlement(world, site.x, site.y, s => s.faction !== 'ashfang');
        const p = X().treasure(world, ECHO.Sim.rngFor(world), near, null);
        if (p) { p.mapped = true; pl.accepted.push(p.id); out.push('a treasure map, marked in a smuggler\'s hand (see your journal)'); }
      }
      if (r() < 0.5) { pl.inv.herbs += 2; out.push('2 bundles of herbs'); }
      return out;
    },

    // ------------------------------------------------------------ landmarks
    discover(game, site) {
      const world = game.world, pl = game.pl;
      site.found = true; site.foundDay = world.day;
      pl.discovered = (pl.discovered || 0) + 1;
      ECHO.Music.stinger('discover');
      UI().banner(U.cap(site.name), X().label(site));
      UI().toast(`${X().desc(site)}${site.cat === 'delve' ? ' (E to enter.)' : ''} The archives pay for accounts of places like this.`, 'legend', 7);
      ECHO.Chronicle.add(world, { text: `${pl.first} ${pl.last} came upon ${site.name}.`, kind: 'player', importance: 0, x: site.x, y: site.y, char: pl.charId });
      if (site.kind === 'lookout') { site.used[pl.charId] = world.day; Q.lookout(game, site, true); }
    },
    lookout(game, site, first) {
      const world = game.world, pl = game.pl, cw = Math.ceil(world.W / 4);
      for (let dy = -44; dy <= 44; dy += 2) for (let dx = -44; dx <= 44; dx += 2) {
        if (dx * dx + dy * dy > 44 * 44) continue;
        const x = Math.floor((site.x + dx) / 4), y = Math.floor((site.y + dy) / 4);
        if (x < 0 || y < 0 || x >= cw) continue;
        const i = y * cw + x; if (i < pl.explored.length) pl.explored[i] = 1;
      }
      ECHO.UI.mapDirty = true; ECHO.UI.miniBase = null;
      const seen = [];
      for (const c of world.camps) if (c.alive && U.dist(c.x, c.y, site.x, site.y) < 44) { c.seen = true; seen.push(`the smoke of ${c.name}`); }
      for (const l of world.lairs) if (U.dist(l.x, l.y, site.x, site.y) < 44) { l.seen = true; seen.push('the lair of ' + l.boss.name); }
      for (const s of X().sites(world)) if (s !== site && U.dist(s.x, s.y, site.x, site.y) < 44 && !s.found) { s.seen = true; seen.push(s.name); }
      UI().toast(`From up here you can see half the land.${seen.length ? ' You make out ' + U.listJoin(seen.slice(0, 4)) + '.' : ''} (Your map is filled in.)`, 'study', 7);
      void first;
    },
    useLandmark(game, site) {
      const world = game.world, pl = game.pl, id = pl.charId;
      const night = T.daylight(world.minute) < 0.3;
      switch (site.kind) {
        case 'stones': {
          if (site.used[id]) return UI().toast('The stones have told you what they will.', 'info', 3);
          site.used[id] = world.day;
          const lang = world.lang;
          const words = lang ? ECHO.Mysteries.WORDS.filter(w => !lang.known[w]).slice(0, 2) : [];
          for (const w of words) lang.known[w] = true;
          ECHO.Mysteries.checkVault(world);
          ECHO.Character.train(pl, 'study', 0.6);
          return UI().toast(words.length ? `You trace the runes around the ring until they make sense: ${words.join(', ')}.` : 'You know every rune here already.', 'study', 6);
        }
        case 'lookout': {
          if (site.used[id] === world.day) return UI().toast('The land below is as you left it.', 'info', 3);
          site.used[id] = world.day; return Q.lookout(game, site);
        }
        case 'moonwell': {
          if (!night) return UI().toast('By day, it is only cold water.', 'info', 3);
          if (site.used[id] === world.day) return UI().toast('You have drunk your fill tonight.', 'info', 3);
          site.used[id] = world.day;
          pl.hp = pl.maxHp; pl.mana = pl.maxMana; pl.stamina = pl.maxSta;
          if (pl.sick) { (pl.immune = pl.immune || []).push(pl.sick.d); delete pl.sick; }
          ECHO.Wonders.charm(world, pl, 'health', 3); ECHO.PlayerCtl.derivedT = 0;
          ECHO.Music.stinger('wish');
          return UI().toast('The water is cold as starlight. Every hurt in you goes quiet. (Healed; hale for three days.)', 'mercy', 6);
        }
        case 'oak': {
          if (site.used[id]) return UI().toast('You rest a while in the oak\'s shade.', 'info', 3);
          site.used[id] = world.day;
          ECHO.Wonders.boon(pl, 'sta', 8); ECHO.PlayerCtl.derivedT = 0;
          ECHO.Sim.advance(world, 90);
          pl.hp = pl.maxHp; pl.stamina = pl.maxSta;
          return UI().toast('You sleep for an hour against the old tree, and wake feeling rooted and strong. (+8 stamina, for good)', 'mercy', 6);
        }
        case 'battlefield': {
          if (site.used[id]) return UI().toast('You have picked the field clean.', 'info', 3);
          site.used[id] = world.day;
          const it = ECHO.Character.makeItem(world, { kind: 'sword', name: `Blade from ${site.name.replace(/^the /, 'the ')}`, dmg: Math.round(14 + Math.random() * 6), holder: 'player', history: [{ d: world.day, t: `pulled from the grass of ${site.name}` }] });
          pl.items.push(it.id);
          const out = [`${it.name} (power ${it.dmg})`];
          if (Math.random() < 0.5) { const near = ECHO.World.nearestSettlement(world, site.x, site.y, s => s.faction !== 'ashfang'); const p = X().treasure(world, ECHO.Sim.rngFor(world), near, null); if (p) { p.mapped = true; pl.accepted.push(p.id); out.push('a map in a dead captain\'s satchel'); } }
          ECHO.Character.train(pl, 'study', 0.3);
          return UI().toast(`Among the bones you find: ${out.join(' and ')}.`, 'legend', 6);
        }
        case 'wayshrine': {
          if (site.used[id] === world.day) return UI().toast('You have prayed here today.', 'info', 3);
          site.used[id] = world.day;
          pl.hp = Math.min(pl.maxHp, pl.hp + pl.maxHp * 0.5);
          if (pl.sick && Math.random() < 0.4) { (pl.immune = pl.immune || []).push(pl.sick.d); delete pl.sick; }
          ECHO.Character.behave(pl, 'mercy', 0.05);
          return UI().toast('You trim the wick and say a few words. You feel steadier. (Healed half your wounds.)', 'mercy', 4);
        }
        case 'wreck': {
          if (site.used[id]) return UI().toast('There is nothing left in the wreck.', 'info', 3);
          site.used[id] = world.day;
          const g = 20 + Math.floor(Math.random() * 45); pl.gold += g;
          const out = [`${g} crowns in a rotted purse`];
          if (Math.random() < 0.6) { pl.inv.arrows += 10; out.push('10 arrows'); }
          if (Math.random() < 0.2) { pl.inv.starshard = (pl.inv.starshard || 0) + 1; out.push('a strange cold shard'); }
          ECHO.Sfx.play('coin');
          return UI().toast(`In the wreck: ${out.join(', ')}.`, 'legend', 5);
        }
      }
    },

    // ------------------------------------------------------------ per frame
    update(game, dt) {
      Q.glows.length = 0;
      const world = game.world, pe = game.pe;
      if (!world || !pe || ECHO.Interior.cur) return;
      // places nearby
      for (const s of X().sites(world)) {
        const d = U.dist(s.x, s.y, pe.x, pe.y);
        if (d > 30) continue;
        if (!s.found && d < 5) Q.discover(game, s);
        if (s.kind === 'moonwell' && T.daylight(world.minute) < 0.4) { Q.glows.push({ x: s.x, y: s.y, h: 0.6, s: 2.2, c: '#9fd3ff', a: 0.5 }); game.light(s.x, s.y, 4, 0.8, '#9fd3ff'); }
        if (s.kind === 'wayshrine' && T.daylight(world.minute) < 0.6) game.light(s.x, s.y, 3, 0.8, '#ffc070');
        if (s.cat === 'delve' && (s.kind === 'barrow' || s.kind === 'crypt') && !s.cleared && T.daylight(world.minute) < 0.4) Q.glows.push({ x: s.x, y: s.y + 0.6, h: 0.5, s: 1.2, c: '#9fe8c8', a: 0.35 });
      }
      Q.t -= dt;
      if (Q.t > 0) return;
      Q.t = 0.8;
      // quests that put something in the world near you
      for (const p of world.plights) {
        if (p.status !== 'open' || p.claimable || p.x == null) continue;
        const d = U.dist(p.x, p.y, pe.x, pe.y);
        if (d > 26) continue;
        if (p.kind === 'treasure' && (game.pl.accepted.includes(p.id) || p.mapped) && d < 6) Q.glows.push({ x: p.x, y: p.y, h: 0.15, s: 1.2, c: '#ffe08a', a: 0.25 + 0.15 * Math.sin(game.time * 3) });
        if (Q.spawned[p.id]) continue;
        if (p.kind === 'hunt' && d < 24) { Q.spawned[p.id] = true; Q.spawnBeast(game, p); }
        if (p.kind === 'clearsite' && d < 22) { Q.spawned[p.id] = true; Q.spawnGuardians(game, p); }
        if (p.kind === 'lost' && d < 24) { Q.spawned[p.id] = true; Q.spawnLost(game, p); }
      }
      // spawned quest things that wandered out of range come back next time
      for (const id of Object.keys(Q.spawned)) if (!game.ents.some(e => e.questId === id && !e.dead)) { const p = ECHO.Plights.byId(world, id); if (!p || p.status !== 'open' || p.claimable) continue; if (U.dist(p.x, p.y, pe.x, pe.y) > 34) delete Q.spawned[id]; }
    },
    spawnBeast(game, p) {
      const world = game.world;
      const spot = ECHO.Ent.freeSpot(world, p.x, p.y, 4) || p;
      const region = ECHO.World.regionAt(world, spot.x, spot.y);
      const e = ECHO.Spawner.makeCreature(game, 'wolf', spot.x, spot.y, region, 'beast' + p.id);
      e.hp = e.maxHp = 210; e.scale = 1.55; e.dmgMul = 1.9; e.label = p.beast; e.beast = true; e.questId = p.id; e.aggro = true;
      game.ents.push(e);
      for (let i = 0; i < 2; i++) { const w = ECHO.Spawner.makeCreature(game, 'wolf', spot.x + (Math.random() - 0.5) * 3, spot.y + (Math.random() - 0.5) * 3, region, 'beast' + p.id); game.addEnt(w); }
      ECHO.Sfx.play('growl', { pitch: 0.6, vol: 1 });
      UI().toast(`A howl, deeper than any wolf's. ${p.beast} is near.`, 'warn', 5);
    },
    spawnGuardians(game, p) {
      const world = game.world;
      const region = ECHO.World.regionAt(world, p.x, p.y);
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2, spot = ECHO.Ent.freeSpot(world, p.x + Math.cos(a) * 2.5, p.y + Math.sin(a) * 2.5, 3);
        if (!spot) continue;
        let e;
        if (p.danger === 'wolves') { e = ECHO.Spawner.makeCreature(game, 'wolf', spot.x, spot.y, region, 'site' + p.id); if (i === 0) { e.hp = e.maxHp = 120; e.scale = 1.3; e.dmgMul = 1.4; e.label = 'the pack leader'; } }
        else { e = Q.makeFoe(game, i === 0 ? 'smuggler-chief' : 'outlaw', spot.x, spot.y); if (i === 0) e.label = 'the outlaw captain'; }
        e.questId = p.id; game.ents.push(e);
      }
      UI().toast(p.danger === 'wolves' ? 'The surveyors\' site — and the wolves that den here.' : 'The surveyors\' site. Outlaws are camped on it.', 'warn', 4);
    },
    spawnLost(game, p) {
      const world = game.world, n = world.npcs[p.victim];
      if (!n || n.status !== 'alive' || !n.lost) return;
      const spot = ECHO.Ent.freeSpot(world, p.x, p.y, 4) || p;
      const e = ECHO.Spawner.makePerson(game, n, spot.x, spot.y, 'villager');
      e.lostQuest = p.id; e.questId = p.id; e.homeSid = p.sid;
      game.addEnt(e);
      // they are not alone out here
      if (Math.random() < 0.7) {
        const region = ECHO.World.regionAt(world, spot.x, spot.y);
        for (let i = 0; i < 2; i++) { const a = Math.random() * Math.PI * 2; const w = ECHO.Spawner.makeCreature(game, 'wolf', spot.x + Math.cos(a) * 6, spot.y + Math.sin(a) * 6, region, 'lost' + p.id); w.aggro = true; game.addEnt(w); }
      }
    },
    // The lost one: cowering, then following you home.
    updateLost(game, e, dt) {
      const world = game.world, pe = game.pe, p = ECHO.Plights.byId(world, e.lostQuest);
      e.t += dt;
      if (!p || p.status !== 'open') { e.lostQuest = null; return; }
      const npc = world.npcs[e.npcId];
      if (!e.following) {
        e.moving = false;
        if (e.sayT <= 0 && U.dist(e.x, e.y, pe.x, pe.y) < 7 && Math.random() < dt * 0.5) { e.say = npc && npc.prof === 'child' ? ['Is someone there?', 'I want to go home…', 'Help! Please!'][Math.floor(Math.random() * 3)] : 'Over here! I\'m hurt!'; e.sayT = 2.5; }
        return;
      }
      const d = U.dist(e.x, e.y, pe.x, pe.y);
      if (d > 2) ECHO.Ent.travel(world, e, pe.x - Math.cos(pe.dir) * 1.2, pe.y - Math.sin(pe.dir) * 1.2, (d > 6 ? 5 : 4) * 0.9, dt); else e.moving = false;
      if (d > 20) { e.x = pe.x - 1; e.y = pe.y + 0.5; }
      const home = ECHO.Sim.settlement(world, p.sid);
      if (home && U.dist(e.x, e.y, home.x, home.y) < 10) {
        if (npc) { npc.lost = false; npc.loc = npc.home; }
        e.lostQuest = null; e.following = false; e.goal = null;
        p.claimable = true;
        ECHO.UI.claimPlight(p);
        e.say = 'Home!'; e.sayT = 3;
      }
    },

    // ------------------------------------------------------------ interaction
    interactables(game) {
      const out = [], world = game.world, pe = game.pe;
      if (ECHO.Interior.cur) return out;
      for (const s of X().sites(world)) {
        const d = U.dist(s.x, s.y, pe.x, pe.y);
        if (d > 2.6) continue;
        if (s.cat === 'delve') { X().refill(world, s); out.push({ kind: 'act', label: `Enter ${s.name}${s.cleared ? ' (quiet now)' : ''}`, d: d * 0.5, act: () => Q.enterDelve(game, s) }); }
        else {
          const label = { stones: 'Read the standing stones', lookout: 'Look out over the land', moonwell: 'Drink from the moonwell', oak: 'Rest beneath the great oak', battlefield: 'Search the battlefield', wayshrine: 'Pray at the wayside shrine', wreck: 'Search the wreck' }[s.kind];
          out.push({ kind: 'act', label, d: d * 0.5, act: () => Q.useLandmark(game, s) });
        }
      }
      for (const e of game.ents) if (e.lostQuest && !e.following && !e.dead && U.dist(e.x, e.y, pe.x, pe.y) < 1.8) {
        const n = world.npcs[e.npcId];
        out.push({ kind: 'act', label: `Take ${n ? n.first : 'them'} home`, d: 0.3, act: () => { e.following = true; e.say = n && n.prof === 'child' ? 'You found me!' : 'Thank the Lantern. Lead the way.'; e.sayT = 3; } });
      }
      for (const p of world.plights) {
        if (p.kind !== 'treasure' || p.status !== 'open' || !(game.pl.accepted.includes(p.id) || p.mapped)) continue;
        if (U.dist(p.x, p.y, pe.x, pe.y) < 1.6) out.push({ kind: 'act', label: 'Dig here', d: 0.2, act: () => Q.dig(game, p) });
      }
      return out;
    },
    enterDelve(game, site) {
      const s = ECHO.World.nearestSettlement(game.world, site.x, site.y) || game.world.settlements[0];
      ECHO.Interior.enter(game, Q.delveBuilding(site, s), s);
    },
    dig(game, p) {
      const world = game.world, pl = game.pl;
      ECHO.Sfx.play('stomp', { vol: 0.4 });
      const gold = 60 + Math.floor(Math.random() * 90);
      pl.gold += gold;
      const extra = [];
      if (Math.random() < 0.35) { pl.inv.starshard = (pl.inv.starshard || 0) + 1; extra.push('a shard of star-iron'); }
      if (Math.random() < 0.4) { const it = ECHO.Character.makeItem(world, { kind: 'sword', name: ['Smuggler\'s Pride', 'the Buried Blade', 'Captain\'s Sabre'][Math.floor(Math.random() * 3)], dmg: Math.round(16 + Math.random() * 7), holder: 'player', history: [{ d: world.day, t: 'dug up from a buried cache' }] }); pl.items.push(it.id); extra.push(it.name); }
      p.status = 'done'; p.closed = world.day; p.outcome = `${pl.first} ${pl.last} dug up a buried cache.`;
      ECHO.Music.stinger('star');
      ECHO.Combat.burst(p.x, p.y, '#c8a060', 20, 3, 0.8, 2);
      UI().toast(`Your spade hits wood. A strongbox: ${gold} crowns${extra.length ? ', ' + extra.join(' and ') : ''}.`, 'legend', 7);
    }
  };
})();
