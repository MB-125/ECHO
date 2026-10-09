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
      if (sees && !e.aggro) { e.aggro = true; for (const o of game.ents) if (o !== e && o.foe && !o.aggro && !o.dead && o.floor === e.floor && U.dist(o.x, o.y, e.x, e.y) < (e.ab && e.ab.pack ? 12 : 7)) o.aggro = true; }
      if (!e.aggro || !hostile || d > 22) { e.state = 'idle'; e.moving = false; if (Math.random() < dt * 0.2) e.dir = Math.random() * Math.PI * 2; return; }
      // a companion close at hand draws some of the blows
      let T = pe, dT = d;
      const comp = game.ents.find(o => o.isCompanion && !o.dead && !o.hidden);
      if (comp) { const dc = U.dist(e.x, e.y, comp.x, comp.y); if ((dc < d - 1.2 && dc < 4) || (comp.tauntT > 0 && dc < 8)) { T = comp; dT = dc; } }
      const ang = Math.atan2(T.y - e.y, T.x - e.x);
      if (ECHO.Monsters && ECHO.Monsters.tick(game, e, dt, dT, ang)) return;
      const dmul = e.dmgMul || 1;
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
            if (ECHO.Monsters && ECHO.Monsters.afterWindup(game, e)) return;
            e.state = 'attack'; e.t = 0; e.attackT = 0.2; e.attackDur = 0.2; e.attackKind = 'fore';
            if (e.shooter) ECHO.Combat.shoot(e, e.aim + (Math.random() - 0.5) * 0.1, { kind: 'arrow', speed: 13, dmg: F.dmg * 0.8 * dmul, life: 1.3, type: 'ranged' });
            else {
              ECHO.Combat.melee(e, { angle: e.aim, arc: F.elite ? 2.2 : 1.6, range: F.reach, dmg: F.dmg * dmul * (0.9 + Math.random() * 0.2), knock: F.elite || e.boss2 ? 0.3 : 0.15 });
              ECHO.Combat.slash(e.x, e.y, e.aim, F.reach + 0.1, F.elite ? 2.2 : 1.6, F.look === 'wight' || F.look === 'king' ? 'rgba(170,255,210,0.75)' : 'rgba(255,220,200,0.7)');
            }
            e.cd = (F.cd + Math.random() * 0.5) * (e.cdMul || 1);
          }
          return;
        case 'attack': if (e.t > 0.25) e.state = 'chase'; return;
        default: {
          e.state = 'chase';
          e.shooter = (e.gear.bow || (e.ab && e.ab.ranged)) && dT > 3;
          const want = e.shooter ? 6 : F.reach + 0.3;
          if (dT > want) ECHO.Ent.travel(world, e, T.x, T.y, e.speed, dt);
          else if (e.shooter && dT < 4) ECHO.Ent.seek(world, e, e.x - Math.cos(ang) * 2, e.y - Math.sin(ang) * 2, e.speed * 0.8, dt);
          else e.moving = false;
          e.dir = ang; e.flip = Math.cos(ang) < 0;
          if (e.cd <= 0 && dT < (e.shooter ? 9 : want + 0.4)) {
            e.state = 'windup'; e.t = 0; e.aim = ang; e.windEnd = e.shooter ? 0.7 : F.wind;
            if (!e.shooter) ECHO.Combat.telegraph({ x: e.x, y: e.y - 0.1, angle: ang, len: F.reach + 0.3, arc: F.elite ? 2.2 : 1.6, life: e.windEnd, shape: 'cone', color: 'rgba(255,90,70,0.22)', follow: e });
            if (F.look === 'wight' && Math.random() < 0.3) { e.say = ['…', 'Leave…', 'Not yours…', 'Sleep…'][Math.floor(Math.random() * 4)]; e.sayT = 1.5; }
          }
        }
      }
    },
    onKill(target, from) {
      if (target.keybearer && !target._keyDropped) { target._keyDropped = true; ECHO.Game.loot.push({ x: target.x, y: target.y, kind: 'key', qty: 1, site: target.delve, depth: target.floor || 0 }); }
      const game = ECHO.Game, world = game.world;
      if (ECHO.Monsters && ECHO.Monsters.DEFS[target.species]) ECHO.Monsters.onKill(game, target);
      else {
        const gold = target.foe ? (target.foe.elite ? 30 + Math.floor(Math.random() * 40) : Math.floor(Math.random() * 8)) : 0;
        if (gold) game.loot.push({ x: target.x, y: target.y, kind: 'gold', qty: gold });
        if (target.foe && target.foe.look === 'wight' && Math.random() < 0.5) game.loot.push({ x: target.x + 0.3, y: target.y, kind: 'bonedust', qty: 1 });
      }
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
        const L = ECHO.Interior.cur;
        const left = game.ents.filter(e => e.delve === target.delve && !e.dead && e !== target && (e.floor == null || e.floor === target.floor)).length;
        if (site && !left) {
          site.floorsDone = site.floorsDone || {}; site.floorsDone[target.floor || 0] = world.day;
          const last = !L || L.depth >= L.floors - 1;
          UI().toast(last ? `${U.cap(site.name)} falls quiet. Whatever was down here is finished — and what it guarded is yours.` : 'This floor is quiet now. The stairs lead deeper — the things below are stronger.', 'legend', 5);
        }
      }
      void from;
    },

    // ------------------------------------------------------------ delves (rooms below ground)
    delveBuilding(site, s, depth = 0) { return { id: 'delve_' + site.id + '_' + depth, type: 'delve', site, depth, x: Math.floor(site.x), y: Math.floor(site.y), w: 1, h: 1, s }; },
    // One floor of a delve or dungeon.
    layout(game, b, s, BASE) {
      const world = game.world, site = b.site, depth = b.depth || 0;
      const def = X().DELVES[site.kind] || {};
      const floors = X().floors(site), last = depth >= floors - 1;
      const small = site.kind === 'hideout' || site.kind === 'cave';
      const style = def.style || 'cave';
      const cave = style === 'cave';
      const rng = new ECHO.RNG(ECHO.hashStr(site.id + world.seed + ':' + depth));
      // rooms and passages: bigger and more tangled the deeper you go
      const cols = small ? 2 : depth >= 2 ? 3 : 3, rows = small ? 2 : depth >= 1 ? 3 : 2;
      const G = ECHO.DGen.carve(rng, cols, rows);
      const W = G.W, H = G.H;
      const L = { id: b.id, b, s, type: 'delve', kind: site.kind, site, depth, floors, W, H, floor: cave ? 'cave' : style === 'stone' ? 'stone' : 'crypt', wall: cave ? 'rock' : 'stone', cave: true, carved: true, G, rev: 0,
        furn: [], spots: [], lights: [], webs: [], traps: [], blocked: G.blocked, rock: G.blocked.slice(), seen: new Uint8Array(W * H) };
      L.doorX = G.doorX;
      const f = (model, x, y, o = {}) => {
        const it = { model, x, y, rot: o.rot || 0, w: o.w || 1, h: o.h || 1, solid: o.solid !== false, action: o.action || null, label: o.label || null, light: o.light || null, colors: o.colors || null, scale: o.scale || 1, tag: o.tag || null };
        L.furn.push(it);
        if (it.solid) for (let ty = Math.floor(y - it.h / 2 + 0.05); ty <= Math.floor(y + it.h / 2 - 0.05); ty++) for (let tx = Math.floor(x - it.w / 2 + 0.05); tx <= Math.floor(x + it.w / 2 - 0.05); tx++) if (tx > 0 && ty > 0 && tx < W - 1 && ty < H - 1) L.blocked[ty * W + tx] = 1;
        if (it.light) L.lights.push({ x: BASE + x, y, ...it.light });
        return it;
      };
      const glow = { r: 5.5, a: 0.95, color: def.glow || '#ffb060', h: 1.1 };
      const K = site.kind, far = G.far, ent = G.entrance;
      // the lord's chamber / the way down sits in the far room, behind an iron door
      site.keys = site.keys || {}; site.doors = site.doors || {}; site.treasure = site.treasure || {};
      L.farRoom = far; L.treasureRoom = G.treasure;
      if (last) L.lordRoom = far;
      // furnish each room by what it is
      for (const r of G.rooms) {
        const tiles = ECHO.DGen.tiles(G, r, 1);
        const pick = () => { const k = rng.int(0, tiles.length - 1); return tiles.splice(k, 1)[0]; };
        // light in every room
        f('candles', r.x0 + 1.2, r.y0 + 1.2, { solid: false, light: glow, colors: { flame: def.glow || '#ffb060', glow: def.glow || '#ffb060' } });
        if (r === far || r === ent) continue;
        const n = 2 + rng.int(0, 2);
        for (let i = 0; i < n && tiles.length > 4; i++) {
          const t = pick();
          if (cave) f('boulder', t.x + 0.5, t.y + 0.5, { scale: 0.55 + rng.next() * 0.35, rot: rng.next() * 6 });
          else f('pillar', t.x + 0.5, t.y + 0.5, { scale: 0.85, colors: style === 'stone' ? { stone: '#5a4a40' } : null });
        }
        if (K === 'hideout' || K === 'warren') for (let i = 0; i < 2 && tiles.length; i++) { const t = pick(); f(i % 2 ? 'crate' : 'barrel', t.x + 0.5, t.y + 0.5); }
        if (K === 'cave' || K === 'trollden' || K === 'nest') for (let i = 0; i < 3 && tiles.length; i++) { const t = pick(); f('rock', t.x + 0.5, t.y + 0.5, { solid: false, scale: 0.35, colors: { rock: '#e2dccb', darkstone: '#cfc7b4' } }); }
        if (K === 'barrow' || K === 'crypt' || K === 'catacomb') for (let i = 0; i < 2 && tiles.length; i++) { const t = pick(); f('chest', t.x + 0.5, t.y + 0.5, { scale: 0.7, rot: Math.PI / 2, colors: { wood: '#5a5650', darkwood: '#3a3632' } }); }
        if (K === 'warren' && rng.next() < 0.5 && tiles.length) { const t = pick(); f('campfire', t.x + 0.5, t.y + 0.5, { solid: false, light: { r: 4, a: 1, color: '#ff9a4a', h: 0.6 } }); }
        if (K === 'forge' && rng.next() < 0.6 && tiles.length) { const t = pick(); f('forge', t.x + 0.5, t.y + 0.5, { w: 1, h: 1, light: { r: 5, a: 1.1, color: '#ff7a2a', h: 0.8 } }); }
      }
      // webs in the nests
      if (K === 'nest' || def.webs) for (const r of G.rooms) if (r !== ent) for (let i = 0; i < 2 + depth; i++) L.webs.push({ x: r.x0 + 1 + rng.int(0, r.x1 - r.x0 - 3) + 0.5, y: r.y0 + 1 + rng.int(0, r.y1 - r.y0 - 3) + 0.5, r: 0.8 + rng.next() * 0.6 });
      // a carving to read in the old tombs
      if ((K === 'barrow' || K === 'crypt') && depth === 0) f('tablet', ent.x0 + 1.5, ent.y0 + 0.9, { action: 'delvetablet', label: 'Read the carving' });
      // the far room
      const fx = far.mx, fy = far.my;
      if (last) {
        L.chest = f('chest', fx, far.y0 + 1.4, { action: 'delvechest', label: site.chestTaken ? 'An empty chest' : 'Open the chest', colors: { metal: '#e8c860' } });
        if (!cave || K === 'catacomb' || K === 'sanctum') f('altar', fx, far.y0 + 0.6, { w: 3, h: 1, solid: false, colors: { glow: def.glow } });
        f('standard', far.x0 + 0.8, far.y0 + 0.8, { colors: { banner: '#5a1a1a' } }); f('standard', far.x1 - 0.8, far.y0 + 0.8, { colors: { banner: '#5a1a1a' } });
        f('candles', far.x0 + 1, far.y1 - 1, { solid: false, light: { r: 6, a: 1.2, color: '#ff6a4a', h: 1.1 } });
        f('candles', far.x1 - 1, far.y1 - 1, { solid: false, light: { r: 6, a: 1.2, color: '#ff6a4a', h: 1.1 } });
      } else f('stairs', fx, fy, { w: 2, h: 2, action: 'delvedown', label: `Go down the stairs (floor ${depth + 2} of ${floors})` });
      // the way back up, by the entrance
      if (depth > 0) f('stairs', ent.x0 + 1.5, ent.y0 + 1.5, { w: 2, h: 2, action: 'delveup', label: 'Climb back up a floor', rot: Math.PI });
      // the iron door, unless already opened
      L.doorTiles = G.gap;
      if (!site.doors[depth] && G.gap.length) for (const g of G.gap) f('door', g.x + 0.5, g.y + 0.5, { action: 'delvedoor', label: site.keys[depth] ? 'Unlock the iron door' : 'A locked iron door', tag: 'door' });
      // a key on the floor if its bearer fell but it was never taken
      if (!site.keys[depth] && (site.floorsDone || {})[depth] && !site.doors[depth]) { const r = G.rooms.find(x => x !== far && x !== ent) || ent; f('chest', r.mx, r.my, { solid: false, scale: 0.5, action: 'delvekey', label: 'Pick up the iron key', colors: { metal: '#ffd84a' } }); }
      // a cache somewhere on each floor, and a treasure room in a dead end
      if (!last) { const r = G.rooms.filter(x => x !== far && x !== ent)[rng.int(0, Math.max(0, G.rooms.length - 3))] || ent; f('chest', r.x1 - 1.5, r.y0 + 1.3, { scale: 0.8, action: 'delvecache', label: (site.caches || {})[depth] ? 'An empty cache' : 'Open the cache' }); }
      if (G.treasure) { const r = G.treasure; f('chest', r.mx - 0.8, r.y0 + 1.4, { action: 'delvetreasure', label: site.treasure[depth] ? 'An empty strongbox' : 'Open the strongbox', colors: { metal: '#c8d0e0' } }); f('candles', r.mx + 1, r.y0 + 1.2, { solid: false, light: { r: 4, a: 1, color: '#ffe08a', h: 1 } }); L.treasureRoom = r; }
      // traps in the passages
      const ctiles = ECHO.DGen.corridorTiles(G).filter(t => !G.gap.some(g => g.x === t.x && g.y === t.y) && Math.abs(t.x - G.doorX) + Math.abs(t.y - (H - 2)) > 5);
      const nTrap = Math.min(ctiles.length, 2 + depth * 2 + (small ? -1 : 0));
      const fire = K === 'forge' || K === 'sanctum';
      for (let i = 0; i < nTrap; i++) { const t = ctiles.splice(rng.int(0, ctiles.length - 1), 1)[0]; if (t) L.traps.push({ x: t.x + 0.5, y: t.y + 0.5, phase: rng.next() * 3, kind: fire ? 'flame' : 'spikes', cycle: -1 }); }
      L.inside = { x: BASE + G.doorX + 1, y: H - 2.2 };
      L.outside = { x: site.x, y: site.y + 1.6 };
      L.name = U.cap(site.name) + (floors > 1 ? ` — ${depth === floors - 1 ? 'the deepest floor' : 'floor ' + (depth + 1) + ' of ' + floors}` : '');
      return L;
    },
    populate(game, L) {
      const world = game.world, site = L.site, BASE = ECHO.Interior.BASE, depth = L.depth || 0, G = L.G;
      site.floorsDone = site.floorsDone || {};
      if (site.cleared || site.floorsDone[depth]) return;
      const def = X().DELVES[site.kind];
      const last = depth >= L.floors - 1;
      const lvl = Math.min(9, X().level(world, site) + Math.floor(depth / 2) + Math.floor((site.round || 0) / 2));
      const roster = (def.roster || [[def.foes, 1]]).concat(depth >= 1 ? def.deep || [] : []);
      const pick = () => { const tot = roster.reduce((a, r) => a + r[1], 0); let r = Math.random() * tot; for (const [k, w] of roster) { r -= w; if (r <= 0) return k; } return roster[0][0]; };
      const tag = e => { e.delve = site.id; e.indoor = true; e.floor = depth; return e; };
      const wolf = (x, y, boss) => { const e = ECHO.Spawner.makeCreature(game, 'wolf', x, y, null, 'den'); e.lvl = lvl; e.hp = e.maxHp = Math.round(e.maxHp * (1 + 0.35 * (lvl - 1)) * (boss ? 3 : 1)); e.dmgMul = (e.dmgMul || 1) * (1 + 0.25 * (lvl - 1)) * (boss ? 1.7 : 1); if (boss) { e.scale = 1.5; e.label = 'the Den-Mother'; e.boss2 = true; } return tag(e); };
      const free = r => ECHO.DGen.tiles(G, r, 1).filter(t => !L.blocked[t.y * L.W + t.x]).sort(() => Math.random() - 0.5);
      // a pack in every room but the first; the far room keeps its own guard
      const rooms = G.rooms.filter(r => r !== G.entrance && r !== L.farRoom);
      const keyRoom = rooms.slice().sort((a, b) => b.depth - a.depth)[Math.floor(rooms.length / 3)] || rooms[0];
      for (const r of rooms) {
        const spots = free(r);
        const empty = r !== keyRoom && r !== L.treasureRoom && Math.random() < 0.3;
        const n = empty ? 0 : Math.min(spots.length, 1 + Math.floor(Math.random() * 2) + (depth >= 2 ? 1 : 0) + (r === L.treasureRoom ? 1 : 0));
        for (let i = 0; i < n; i++) {
          const s0 = spots.pop(), k = pick();
          const e = k === 'wolf' ? wolf(BASE + s0.x + 0.5, s0.y + 0.5) : tag(ECHO.Monsters.make(game, k, BASE + s0.x + 0.5, s0.y + 0.5, lvl, r === L.treasureRoom ? { eliteChance: 0.6 } : {}));
          game.ents.push(e);
        }
        // the one who carries the key
        if (r === keyRoom && !site.keys[depth] && !site.doors[depth] && spots.length) {
          const s0 = spots.pop(), k = roster.slice().sort((a, b) => (ECHO.Monsters.DEFS[b[0]] || { hp: 0 }).hp - (ECHO.Monsters.DEFS[a[0]] || { hp: 0 }).hp)[0][0];
          const e = k === 'wolf' ? wolf(BASE + s0.x + 0.5, s0.y + 0.5) : tag(ECHO.Monsters.make(game, k, BASE + s0.x + 0.5, s0.y + 0.5, lvl + 1, { noElite: true }));
          e.keybearer = true; e.label = `Keybearer ${(e.label || (e.foe && e.foe.name) || 'wolf').replace(/^the /, '').toLowerCase()}`; e.hp = e.maxHp = Math.round(e.maxHp * 1.4); e.scale = (e.scale || 1) * 1.1;
          game.ents.push(e);
        }
      }
      // behind the iron door: the lord, or the guards of the stair
      const fr = L.farRoom, fs = free(fr);
      if (last) {
        const bx = BASE + fr.mx, by = fr.my - 0.5;
        const e = def.boss === 'den-mother' ? wolf(bx, by, true) : tag(ECHO.Monsters.make(game, def.boss, bx, by, lvl + 1, { noElite: true }));
        if (!ECHO.Monsters.DEFS[def.boss] && e.foe) { e.hp = e.maxHp = Math.round(e.maxHp * (1 + 0.4 * (lvl - 1))); e.boss2 = true; }
        game.ents.push(e);
        for (let i = 0; i < 2 && fs.length; i++) { const s0 = fs.pop(); const k = pick(); game.ents.push(k === 'wolf' ? wolf(BASE + s0.x + 0.5, s0.y + 0.5) : tag(ECHO.Monsters.make(game, k, BASE + s0.x + 0.5, s0.y + 0.5, lvl, { noElite: true }))); }
      } else for (let i = 0; i < 2 && fs.length; i++) { const s0 = fs.pop(); const k = pick(); game.ents.push(k === 'wolf' ? wolf(BASE + s0.x + 0.5, s0.y + 0.5) : tag(ECHO.Monsters.make(game, k, BASE + s0.x + 0.5, s0.y + 0.5, lvl, { eliteChance: 0.5 }))); }
      ECHO.Music.stinger('discover');
      if (ECHO.Monsters) ECHO.Monsters.tip(game, 'dungeon');
      if (ECHO.Companions) ECHO.Companions.event(game, 'enter');
    },
    // Pressure plates: spikes (or fire) every few seconds; they warn you first.
    trapState(game, t) { const c = (game.time + t.phase) % 3.2; return c < 1.7 ? 'down' : c < 2.3 ? 'warn' : 'up'; },
    tickTraps(game, dt) {
      const L = ECHO.Interior.cur;
      if (!L || !L.traps || !L.traps.length) return;
      const pe = game.pe, B = ECHO.Interior.BASE;
      for (const t of L.traps) {
        const st = Q.trapState(game, t), cyc = Math.floor((game.time + t.phase) / 3.2);
        if (st === 'up' && t.firedCycle !== cyc) {
          t.firedCycle = cyc;
          if (t.kind === 'flame') { ECHO.Combat.burst(B + t.x, t.y, '#ff9a3a', 14, 3, 0.6, 3); ECHO.Combat.burst(B + t.x, t.y, '#ffe08a', 6, 2, 0.5, 2); }
          else ECHO.Combat.burst(B + t.x, t.y, '#c8c0b0', 8, 2, 0.3, 2);
        }
        if (st === 'up' && t.hitCycle !== cyc && Math.abs(pe.x - (B + t.x)) < 0.75 && Math.abs(pe.y - t.y) < 0.75 && !(pe.iframes > 0)) {
          t.hitCycle = cyc;
          const lvl = X().level(game.world, L.site) + Math.floor((L.depth || 0) / 2);
          ECHO.Combat.damage(pe, 7 + lvl * 3, { type: t.kind === 'flame' ? 'fire' : 'melee', from: null, angle: Math.random() * 6.28, knock: 0.25 });
          ECHO.Combat.floater(pe.x, pe.y - 1.4, t.kind === 'flame' ? 'fire trap!' : 'spike trap!', '#ffb08a');
          if (ECHO.Monsters) ECHO.Monsters.tip(game, 'trap');
        }
      }
      // what you have seen of this floor, for the map in the corner
      if (L.seen) { const px = Math.floor(pe.x - B), py = Math.floor(pe.y); for (let y = py - 5; y <= py + 5; y++) for (let x = px - 6; x <= px + 6; x++) if (x >= 0 && y >= 0 && x < L.W && y < L.H && (x - px) ** 2 + (y - py) ** 2 < 34) L.seen[y * L.W + x] = 1; }
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
      if (it.action === 'delvedown' || it.action === 'delveup') {
        const d = (L.depth || 0) + (it.action === 'delvedown' ? 1 : -1);
        if (d < 0) return ECHO.Interior.leave(game);
        ECHO.Sfx.play('door');
        return Q.enterDelve(game, site, d);
      }
      if (it.action === 'delvedoor') {
        site.keys = site.keys || {}; site.doors = site.doors || {};
        if (!site.keys[L.depth]) {
          const bearer = game.ents.find(e => e.keybearer && !e.dead);
          return UI().toast(bearer ? `Locked. ${U.cap(bearer.label)} carries the key — find it and take it.` : 'Locked. The key must be somewhere on this floor.', 'warn', 4);
        }
        site.doors[L.depth] = true;
        for (const d of L.furn.filter(x => x.tag === 'door')) { L.blocked[Math.floor(d.y) * L.W + Math.floor(d.x)] = 0; }
        L.furn = L.furn.filter(x => x.tag !== 'door');
        L.rev = (L.rev || 0) + 1;
        ECHO.Sfx.play('door'); game.shake(0.15);
        return UI().toast(L.depth >= L.floors - 1 ? 'The iron door grinds open. Something large stirs in the chamber beyond.' : 'The iron door grinds open. The way down lies beyond.', 'legend', 4);
      }
      if (it.action === 'delvekey') {
        site.keys = site.keys || {}; site.keys[L.depth] = true;
        L.furn = L.furn.filter(x => x !== it); L.rev = (L.rev || 0) + 1;
        for (const d of L.furn) if (d.tag === 'door') d.label = 'Unlock the iron door';
        ECHO.Sfx.play('coin');
        return UI().toast('You take the iron key.', 'legend', 3);
      }
      if (it.action === 'delvetreasure') {
        site.treasure = site.treasure || {};
        if (site.treasure[L.depth]) return UI().toast('The strongbox is empty.', 'info', 2);
        const near = game.ents.filter(e => e.delve === site.id && !e.dead && U.dist(e.x, e.y, game.pe.x, game.pe.y) < 6).length;
        if (near) return UI().toast('Not with its guards still standing.', 'warn', 2);
        site.treasure[L.depth] = true; it.label = 'An empty strongbox';
        const lvl = X().level(world, site) + Math.floor((L.depth || 0) / 2);
        const gold = Math.round((40 + Math.random() * 60) * (1 + 0.35 * (lvl - 1))); pl.gold += gold;
        const out = [`${gold} crowns`];
        const D0 = X().DELVES[site.kind];
        const mats = (D0.roster || []).concat(D0.deep || []).map(r => ECHO.Monsters.DEFS[r[0]]).filter(Boolean).flatMap(m => (m.loot || []).map(l => l[0]));
        for (let i = 0; i < 2 && mats.length; i++) { const k = mats[Math.floor(Math.random() * mats.length)], q = 2 + Math.floor(Math.random() * 3); pl.inv[k] = (pl.inv[k] || 0) + q; out.push(`${q} ${ECHO.Gear.MATS[k].name}`); }
        if (Math.random() < 0.7) { ECHO.Monsters.dropGear(game, ECHO.Interior.BASE + it.x, it.y + 1, lvl + 1, 14, `in a strongbox in ${site.name}`); out.push('a piece of gear (on the floor)'); }
        if (Math.random() < 0.4) { pl.inv.herbs = (pl.inv.herbs || 0) + 2; out.push('two bundles of herbs'); }
        ECHO.Sfx.play('coin'); ECHO.Music.stinger('star');
        return UI().toast(`A treasure room! In the strongbox: ${out.join(', ')}.`, 'legend', 6);
      }
      if (it.action === 'delvecache') {
        site.caches = site.caches || {};
        if (site.caches[L.depth]) return UI().toast('The cache is empty.', 'info', 2);
        site.caches[L.depth] = true; it.label = 'An empty cache';
        const lvl = X().level(world, site) + Math.floor((L.depth || 0) / 2);
        const gold = Math.round((12 + Math.random() * 25) * (1 + 0.3 * (lvl - 1))); pl.gold += gold;
        const out = [`${gold} crowns`];
        const D = X().DELVES[site.kind];
        const mats = (D.roster || []).map(r => ECHO.Monsters.DEFS[r[0]]).filter(Boolean).flatMap(m => (m.loot || []).map(l => l[0]));
        if (mats.length) { const k = mats[Math.floor(Math.random() * mats.length)], q = 1 + Math.floor(Math.random() * 3); pl.inv[k] = (pl.inv[k] || 0) + q; out.push(`${q} ${ECHO.Gear.MATS[k].name}`); }
        if (Math.random() < 0.3) { pl.inv.herbs = (pl.inv.herbs || 0) + 1; out.push('a bundle of herbs'); }
        if (Math.random() < 0.3) { ECHO.Monsters.dropGear(game, ECHO.Interior.BASE + it.x, it.y + 1, lvl, 4, `in a cache in ${site.name}`); out.push('something wrapped in oilcloth (on the floor)'); }
        ECHO.Sfx.play('coin');
        return UI().toast(`In the cache: ${out.join(', ')}.`, 'legend', 5);
      }
      if (it.action === 'delvechest') {
        const alive = game.ents.filter(e => e.delve === site.id && !e.dead && (e.floor == null || e.floor === (L.depth || 0)) && (e.boss2 || U.dist(e.x, e.y, game.pe.x, game.pe.y) < 8)).length;
        if (alive) return UI().toast('Not with them still about.', 'warn', 2);
        if (site.chestTaken) return UI().toast('The chest is empty.', 'info', 2);
        site.chestTaken = true; site.cleared = true; site.clearedDay = world.day;
        if (ECHO.Ambition) { ECHO.Ambition.note(pl, 'delves'); if (X().floors(site) >= 3) ECHO.Ambition.note(pl, 'deep'); }
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
      // the dungeon's own treasures
      const lv = X().level(world, site) + Math.floor(((ECHO.Interior.cur && ECHO.Interior.cur.depth) || 0) / 2);
      const D = X().DELVES[site.kind];
      const MATS = { catacomb: ['grave', 'bonedust'], warren: ['trinket', 'fetish'], nest: ['queensilk', 'silk', 'venom'], trollden: ['tusk', 'trollhide'], sanctum: ['sigil', 'ecto'], forge: ['core', 'heartstone'], crypt: ['bonedust', 'ecto'], barrow: ['bonedust'] }[site.kind];
      if (MATS) for (const k of MATS) if (r() < 0.75) { const q = 1 + Math.floor(r() * 2); pl.inv[k] = (pl.inv[k] || 0) + q; out.push(`${q} ${ECHO.Gear.MATS[k].name}`); }
      const L0 = ECHO.Interior.cur;
      if (L0 && L0.chest) { ECHO.Monsters.dropGear(game, ECHO.Interior.BASE + L0.chest.x, L0.chest.y + 1.2, lv + 1, 14 + lv * 3, `at the bottom of ${site.name}`); out.push('a piece of gear, left on the floor beside the chest — take it (E)'); }
      if (lv >= 3 && D) { const extra = Math.round(lv * 25 * r()); pl.gold += extra; if (extra) out.push(`${extra} more crowns, hidden under the lining`); }
      return out;
    },

    // ------------------------------------------------------------ landmarks
    discover(game, site) {
      const world = game.world, pl = game.pl;
      site.found = true; site.foundDay = world.day;
      pl.discovered = (pl.discovered || 0) + 1;
      ECHO.Music.stinger('discover');
      UI().banner(U.cap(site.name), X().label(site));
      UI().toast(`${X().desc(site)}${site.cat === 'delve' ? ` Danger ${X().stars((X().level(world, site), site))}${X().floors(site) > 1 ? ', ' + X().floors(site) + ' floors deep' : ''}. (E to enter.)` : ''}${site.unnamed ? ' No one has ever charted this place.' : ' The archives pay for accounts of places like this.'}`, 'legend', 7);
      if (site.unnamed) setTimeout(() => Q.nameModal(game, site), 1400);
      ECHO.Chronicle.add(world, { text: `${pl.first} ${pl.last} came upon ${site.name}.`, kind: 'player', importance: 0, x: site.x, y: site.y, char: pl.charId });
      if (site.kind === 'lookout') { site.used[pl.charId] = world.day; Q.lookout(game, site, true); }
    },
    // The first to chart a wonder names it.
    nameModal(game, site) {
      const world = game.world, pl = game.pl;
      if (!site.unnamed || UI().paused()) return;
      const sugg = ECHO.Discover.suggestions(world, site, pl);
      UI().modal({ title: 'Name this place', html: `<p class="prose">${esc(X().desc(site))}</p><p>No map shows it. No one in any town knows it is here. Whatever you call it, the world will call it.</p><input id="wname" maxlength="28" value="${esc(sugg[0] || '')}" style="width:100%;font-size:18px;padding:6px"><p class="dim">Or: ${sugg.slice(1).map(esc).join(', ')}…</p>`,
        choices: [{ label: 'So it shall be called', onPick: () => { const v = (document.querySelector('#wname') || {}).value || sugg[0]; ECHO.Discover.name(world, site, v, pl); ECHO.Music.stinger('discover'); UI().banner(site.name, X().label(site)); UI().toast(`${site.name} is on the map now — your name for it. The archives will want to hear of it.`, 'legend', 6); } }, { label: 'Leave it nameless for now', onPick: () => {} }] });
      setTimeout(() => { const i = document.querySelector('#wname'); if (i) { i.focus(); i.select(); i.addEventListener('keydown', e => e.stopPropagation()); } }, 50);
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
        case 'falls': {
          if (site.used[id] === world.day) return UI().toast('You have already stood under the falls today.', 'info', 3);
          const firstTime = !site.used[id];
          site.used[id] = world.day;
          pl.stamina = pl.maxSta; pl.mana = pl.maxMana; pl.hp = Math.min(pl.maxHp, pl.hp + pl.maxHp * 0.3);
          if (pl.charms && pl.charms.hindcurse) { delete pl.charms.hindcurse; ECHO.PlayerCtl.derivedT = 0; }
          if (firstTime) { ECHO.Wonders.boon(pl, 'sta', 6); ECHO.PlayerCtl.derivedT = 0; }
          ECHO.Music.stinger('wish');
          return UI().toast(`The cold water hammers the tiredness out of you.${firstTime ? ' (+6 stamina, for good.)' : ''} Any curse on you washes downstream.`, 'mercy', 6);
        }
        case 'springs': {
          if (site.used[id] === world.day) return UI().toast('You have soaked here today.', 'info', 3);
          site.used[id] = world.day;
          pl.hp = pl.maxHp; pl.stamina = pl.maxSta;
          if (pl.sick) { (pl.immune = pl.immune || []).push(pl.sick.d); delete pl.sick; }
          const winter = ECHO.TIME.dateOf(world.day).seasonIdx === 3;
          ECHO.Wonders.charm(world, pl, 'health', winter ? 4 : 2); ECHO.PlayerCtl.derivedT = 0;
          ECHO.Sim.advance(world, 60);
          return UI().toast(`You soak for an hour in the steaming water${winter ? ' while snow falls around you' : ''}. Every ache dissolves. (Healed; hale for ${winter ? 'four' : 'two'} days.)`, 'mercy', 6);
        }
        case 'grotto': {
          if (site.used[id] && world.day - site.used[id] < 20) return UI().toast('The crystals you could reach are gone. More will grow.', 'info', 3);
          site.used[id] = world.day;
          pl.inv.crystal = (pl.inv.crystal || 0) + 1; pl.mana = pl.maxMana;
          ECHO.Character.train(pl, 'study', 0.4);
          ECHO.Sfx.play('pickup');
          return UI().toast('You work a crystal free. It is cold, and hums faintly against your palm. (The archives pay well for these.)', 'study', 6);
        }
        case 'bones': {
          if (site.used[id]) return UI().toast('You have measured every bone already.', 'info', 3);
          site.used[id] = world.day;
          const lang = world.lang;
          const words = lang ? ECHO.Mysteries.WORDS.filter(w => !lang.known[w]).slice(0, 1) : [];
          for (const w of words) lang.known[w] = true;
          if (words.length) ECHO.Mysteries.checkVault(world);
          ECHO.Character.train(pl, 'study', 1.5); pl.renown += 2;
          return UI().toast(`You pace out the ribs: forty feet, if it is an inch. On the great skull someone long ago cut a single rune${words.length ? ` — "${words[0]}"` : ''}. The archives will not believe you.`, 'study', 7);
        }
        case 'crater': {
          if (site.used[id]) return UI().toast('The crater has given up its star.', 'info', 3);
          site.used[id] = world.day;
          pl.inv.starshard = (pl.inv.starshard || 0) + 2;
          ECHO.Music.stinger('star');
          return UI().toast('In the fused glass at the crater\'s heart, two shards of star-iron, still faintly warm after who knows how many years.', 'legend', 6);
        }
        case 'ring': {
          if (!night) return UI().toast('By day it is only mushrooms. The old folk say to come back after dark.', 'info', 3);
          if (site.used[id] && world.day - site.used[id] < 7) return UI().toast('The ring is quiet. One wish a week, the old folk say.', 'info', 3);
          site.used[id] = world.day;
          const r = Math.random();
          ECHO.Music.stinger('wish');
          if (r < 0.5) { ECHO.Wonders.charm(world, pl, 'fortune', 4); ECHO.PlayerCtl.derivedT = 0; return UI().toast('You make your wish. Somewhere very close, someone laughs, pleased. (Fortune smiles on you for four days.)', 'legend', 6); }
          if (r < 0.75) { pl.fate = Math.min(3, pl.fate + (pl.fate < 3 && Math.random() < 0.3 ? 1 : 0)); pl.renown += 1; return UI().toast('You make your wish. The mushrooms glow, all at once, and go dark. You feel watched — kindly.', 'legend', 6); }
          const lost = Math.min(pl.gold, 15 + Math.floor(Math.random() * 25)); pl.gold -= lost;
          ECHO.Sim.advance(world, 180);
          return UI().toast(`You make your wish — and wake three hours later at the edge of the ring, ${lost} crowns lighter. The fair folk take their price.`, 'warn', 6);
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
        const dark = T.daylight(world.minute) < 0.4;
        if (s.kind === 'grotto' && dark) { Q.glows.push({ x: s.x, y: s.y - 0.2, h: 0.7, s: 2, c: '#8ff0ff', a: 0.45 }); game.light(s.x, s.y, 4, 0.9, '#8ff0ff'); }
        if (s.kind === 'ring' && dark) for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + game.time * 0.1; Q.glows.push({ x: s.x + Math.cos(a) * 1.9, y: s.y + Math.sin(a) * 1.9, h: 0.15, s: 0.6, c: '#e8f8d8', a: 0.35 + 0.15 * Math.sin(game.time * 2 + i) }); }
        if (s.kind === 'springs') Q.glows.push({ x: s.x + Math.sin(game.time * 0.7) * 0.4, y: s.y, h: 0.6 + (game.time * 0.4 % 1), s: 1.6, c: '#ffffff', a: 0.12 });
        if (s.kind === 'crater' && !Object.keys(s.used).length) Q.glows.push({ x: s.x, y: s.y, h: 0.2, s: 0.9, c: '#ffe8b0', a: 0.4 + 0.2 * Math.sin(game.time * 3) });
        if (s.kind === 'falls') Q.glows.push({ x: s.x, y: s.y - 1.2, h: 0.4, s: 2.2, c: '#e8f4ff', a: 0.15 });
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
        if (s.cat === 'delve' && s.kind === 'riftdeep' && !(world.story && world.story.ch === 5 && !world.story.kingSlain)) continue;
        if (s.cat === 'delve') { X().refill(world, s); const fl = X().floors(s); out.push({ kind: 'act', label: `Enter ${s.name} — ${X().stars(s.level ? s : (X().level(world, s), s))}${fl > 1 ? ' · ' + fl + ' floors' : ''}${s.cleared ? ' (quiet now)' : ''}`, d: d * 0.5, act: () => Q.enterDelve(game, s) }); }
        else {
          const label = { stones: 'Read the standing stones', lookout: 'Look out over the land', moonwell: 'Drink from the moonwell', oak: 'Rest beneath the great oak', battlefield: 'Search the battlefield', wayshrine: 'Pray at the wayside shrine', wreck: 'Search the wreck',
            falls: 'Stand beneath the falls', springs: 'Soak in the springs', grotto: 'Work a crystal free', bones: 'Study the bones', crater: 'Search the crater', ring: 'Step into the ring and make a wish' }[s.kind];
          out.push({ kind: 'act', label, d: d * 0.5, act: () => Q.useLandmark(game, s) });
          if (s.unnamed && s.found) out.push({ kind: 'act', label: 'Name this place', d: d * 0.5 + 0.1, act: () => Q.nameModal(game, s) });
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
    enterDelve(game, site, depth = 0) {
      const s = ECHO.World.nearestSettlement(game.world, site.x, site.y) || game.world.settlements[0];
      ECHO.Interior.enter(game, Q.delveBuilding(site, s, depth), s);
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
