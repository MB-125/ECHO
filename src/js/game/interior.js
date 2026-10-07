// Interiors: houses, the inn, smithy, archive, shrine, temple and keep can be
// entered. Each room is laid out from the building's type (deterministically,
// so the same inn always looks the same), furnished with Blender-built pieces,
// and filled with the people who would really be inside at that hour —
// the innkeeper behind the bar, patrons in the evening, a family asleep at
// night. Rooms live in their own coordinate space (x ≥ BASE), so all the
// usual movement, combat and AI code works unchanged inside them.
(function () {
  const { U } = ECHO;
  const P = () => ECHO.People;
  const BASE = 10000;

  const NAMES = {
    house: 'house', inn: 'inn', smithy: 'smithy', archive: 'archive', shrine: 'shrine', temple: 'temple', keep: 'keep'
  };

  const I = ECHO.Interior = {
    BASE, cur: null,
    enterable(b) { return !!NAMES[b.type]; },
    isMine(b, pl) { return !!pl && (b.owner === pl.charId || b.tenant === pl.charId); },
    inside(x) { return x >= BASE - 50; },

    // ---------------------------------------------------------------- collision
    isSolid(x, y) {
      const c = I.cur;
      if (!c) return true;
      const lx = Math.floor(x - BASE), ly = Math.floor(y);
      if (lx < 0 || ly < 0 || lx >= c.W || ly >= c.H) return true;
      return c.blocked[ly * c.W + lx] === 1;
    },
    tile(x, y) {
      return I.isSolid(x, y) ? ECHO.TILE.RUINWALL : ECHO.TILE.PLAZA;
    },

    // ---------------------------------------------------------------- layout
    title(b, s, world) {
      const owner = b.type === 'house' && b.legend ? (ECHO.Legacy.legendOf(world, b.legend) || {}).name : null;
      switch (b.type) {
        case 'inn': return `The inn at ${s.name}`;
        case 'smithy': return `The smithy of ${s.name}`;
        case 'archive': return `The archive of ${s.name}`;
        case 'shrine': return `The shrine of ${s.name}`;
        case 'temple': return `The temple of the Lantern`;
        case 'keep': return `The hall of ${s.name}`;
        default: return I.isMine(b, world.player) ? 'Your house' : owner ? `The house of ${owner}` : `A house in ${s.name}`;
      }
    },
    layout(game, b, s) {
      if (b.type === 'delve') return ECHO.Quests.layout(game, b, s, BASE);
      const world = game.world, pl = game.pl;
      const sizes = { house: [9, 7], inn: [15, 10], smithy: [11, 8], archive: [13, 9], shrine: [9, 9], temple: [15, 11], keep: [17, 12] };
      const [W, H] = sizes[b.type];
      const floor = { house: 'wood', inn: 'wood', smithy: 'stone', archive: 'stone', shrine: 'stone', temple: 'marble', keep: 'stone' }[b.type];
      const wall = { house: 'plaster', inn: 'plaster', smithy: 'stone', archive: 'stone', shrine: 'stone', temple: 'marble', keep: 'stone' }[b.type];
      const L = { id: b.id, b, s, type: b.type, W, H, floor, wall, furn: [], spots: [], lights: [], blocked: new Uint8Array(W * H) };
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x === 0 || y === 0 || x === W - 1 || y === H - 1) L.blocked[y * W + x] = 1;
      L.doorX = Math.floor(W / 2);
      // The doorway stays solid: you leave by interacting with it.
      const f = (model, x, y, o = {}) => {
        const it = { model, x, y, rot: o.rot || 0, w: o.w || 1, h: o.h || 1, solid: o.solid !== false, action: o.action || null, label: o.label || null, light: o.light || null, colors: o.colors || null, scale: o.scale || 1 };
        L.furn.push(it);
        if (it.solid) {
          for (let ty = Math.floor(y - it.h / 2 + 0.05); ty <= Math.floor(y + it.h / 2 - 0.05); ty++)
            for (let tx = Math.floor(x - it.w / 2 + 0.05); tx <= Math.floor(x + it.w / 2 - 0.05); tx++)
              if (tx > 0 && ty > 0 && tx < W - 1 && ty < H - 1) L.blocked[ty * W + tx] = 1;
        }
        if (it.light) L.lights.push({ x: BASE + x, y: y, ...it.light });
        return it;
      };
      const spot = (x, y, o = {}) => { L.spots.push({ x: BASE + x, y, dir: o.dir != null ? o.dir : -Math.PI / 2, pose: o.pose || 'stand', tag: o.tag || 'any' }); };
      const rng = new ECHO.RNG(ECHO.hashStr(b.id + world.seed));
      const north = -Math.PI / 2, south = Math.PI / 2;
      switch (b.type) {
        case 'house': {
          const mine = I.isMine(b, pl);
          const legendHouse = !!b.legend;
          f('hearth', 4.5, 1.4, { w: 2, h: 1, light: { r: 6, a: 1.3, color: '#ff9a4a', h: 0.8 } });
          f('bed', 2.1, 2.2, { w: 2, h: 1, action: 'sleep', label: mine ? 'Sleep in your bed' : 'A bed' });
          f('bed', 2.1, 4.0, { w: 2, h: 1, action: 'sleep', label: mine ? 'Sleep in your bed' : 'A bed' });
          f('table', 6.4, 3.8, { w: 2, h: 1 });
          f('chair', 5.3, 3.8, { solid: false, rot: Math.PI });
          f('chair', 7.5, 3.8, { solid: false });
          f('chest', 7.4, 1.6, { action: legendHouse ? 'heirloom' : mine ? 'ownchest' : 'cupboard', label: legendHouse ? 'Open the old chest' : mine ? 'Open your chest' : 'Search the cupboard' });
          f('rug', 4.4, 4.3, { solid: false });
          f('candles', 7.6, 5.4, { solid: false, light: { r: 3.5, a: 0.8, color: '#ffc070', h: 1.2 } });
          spot(2.1, 2.2, { pose: 'bed', tag: 'bed', dir: 0 }); spot(2.1, 4.0, { pose: 'bed', tag: 'bed', dir: 0 });
          spot(5.3, 3.8, { pose: 'sit', dir: 0, tag: 'seat' }); spot(7.5, 3.8, { pose: 'sit', dir: Math.PI, tag: 'seat' });
          spot(4.5, 2.6, { tag: 'any', dir: north }); spot(3.4, 5.2, { tag: 'any', dir: 0 });
          break;
        }
        case 'inn': {
          f('counter', 7.5, 2.3, { w: 4, h: 1, action: 'inn', label: 'Speak with the innkeeper' });
          f('barrel', 2.0, 1.4); f('barrel', 3.0, 1.4); f('shelf', 11.2, 1.0, { w: 2, h: 1 });
          f('hearth', 13.1, 1.4, { w: 2, h: 1, light: { r: 7, a: 1.4, color: '#ff9a4a', h: 0.8 } });
          for (const [tx, ty] of [[3.5, 5.2], [7.5, 6.2], [11.5, 5.2]]) {
            f('table', tx, ty, { w: 2, h: 1 });
            f('stool', tx - 1.2, ty, { solid: false }); f('stool', tx + 1.2, ty, { solid: false });
            spot(tx - 1.2, ty, { pose: 'sit', dir: 0, tag: 'seat' }); spot(tx + 1.2, ty, { pose: 'sit', dir: Math.PI, tag: 'seat' });
          }
          f('rug', 7.5, 4.2, { solid: false, scale: 1.2 });
          f('bed', 13.2, 8.0, { w: 2, h: 1, action: 'innbed', label: 'Rent a bed' });
          f('candles', 1.4, 8.3, { solid: false, light: { r: 4, a: 0.9, color: '#ffc070', h: 1.2 } });
          f('candles', 7.5, 8.3, { solid: false, light: { r: 4, a: 0.8, color: '#ffc070', h: 1.2 } });
          f('crate', 1.6, 6.2); f('barrel', 1.5, 7.2, { scale: 0.9 });
          spot(7.5, 1.4, { tag: 'keeper', dir: south });
          spot(5.2, 3.4, { tag: 'any', dir: north }); spot(9.8, 3.4, { tag: 'any', dir: north });
          break;
        }
        case 'smithy': {
          f('forge', 2.5, 1.5, { w: 2, h: 2, light: { r: 6.5, a: 1.6, color: '#ff7a2a', h: 1.0 } });
          f('anvil', 4.7, 3.2, { action: 'smithy', label: 'Look at the smith\'s work' });
          f('rack', 8.5, 1.2, { w: 2, h: 1, action: 'smithy', label: 'Browse weapons & arrows' });
          f('barrel', 9.6, 5.0); f('crate', 1.4, 5.6); f('crate', 2.3, 6.2, { rot: 0.4 }); f('chest', 9.4, 6.4);
          f('candles', 6.5, 6.2, { solid: false, light: { r: 3.5, a: 0.7, color: '#ffc070', h: 1.2 } });
          spot(5.5, 3.2, { tag: 'smith', dir: Math.PI }); spot(3.8, 4.4, { tag: 'any', dir: north });
          break;
        }
        case 'archive': {
          for (let x = 2; x <= 10; x += 2.2) f('shelf', x, 1.0, { w: 2, h: 1, action: 'archive', label: 'Browse the archive' });
          f('lectern', 6.5, 3.3, { action: 'archive', label: 'Read the chronicle' });
          f('desk', 3.0, 5.0, { w: 2, h: 1, light: { r: 3, a: 0.7, color: '#ffc070', h: 1.0 } }); f('chair', 3.0, 5.9, { solid: false, rot: south });
          f('desk', 10.0, 5.0, { w: 2, h: 1, light: { r: 3, a: 0.7, color: '#ffc070', h: 1.0 } }); f('chair', 10.0, 5.9, { solid: false, rot: south });
          f('rug', 6.5, 5.3, { solid: false });
          f('candles', 1.4, 7.2, { solid: false, light: { r: 3.5, a: 0.8, color: '#ffc070', h: 1.2 } });
          f('candles', 11.6, 7.2, { solid: false, light: { r: 3.5, a: 0.8, color: '#ffc070', h: 1.2 } });
          spot(3.0, 5.9, { pose: 'sit', dir: north, tag: 'seat' }); spot(10.0, 5.9, { pose: 'sit', dir: north, tag: 'seat' });
          spot(6.5, 4.2, { tag: 'any', dir: north }); spot(8.3, 2.2, { tag: 'any', dir: north });
          break;
        }
        case 'shrine': case 'temple': {
          const big = b.type === 'temple';
          const cx = W / 2;
          f('altar', cx, 2.0, { w: 2, h: 1, action: 'shrine', label: big ? 'Approach the altar' : 'Kneel at the shrine', light: { r: big ? 8 : 6, a: 1.5, color: '#ffcf70', h: 1.6 } });
          f('candles', cx - 2.2, 1.6, { solid: false, light: { r: 3, a: 0.8, color: '#ffc070', h: 1.2 } });
          f('candles', cx + 2.2, 1.6, { solid: false, light: { r: 3, a: 0.8, color: '#ffc070', h: 1.2 } });
          const rows = big ? [5.0, 6.6, 8.2] : [4.6, 6.2];
          for (const ry of rows) for (const bx of [cx - 2.6, cx + 2.6]) { f('bench', bx, ry, { w: 2, h: 1, rot: 0 }); spot(bx + (rng.next() - 0.5), ry + 0.55, { pose: 'sit', dir: north, tag: 'seat' }); }
          if (big) { for (const [px, py] of [[2.5, 2.5], [12.5, 2.5], [2.5, 6.5], [12.5, 6.5]]) f('pillar', px, py, { scale: 1.4 }); f('standard', 4.2, 1.2, { colors: { banner: '#e6c06a' } }); f('standard', 10.8, 1.2, { colors: { banner: '#e6c06a' } }); }
          spot(cx, 3.2, { tag: 'priest', dir: south }); spot(cx - 1.4, 3.3, { tag: 'any', dir: north });
          break;
        }
        case 'keep': {
          const f2 = game.world.factions[s.faction];
          const bann = f2 ? f2.color : '#6f8fc4';
          f('throne', 8.5, 1.9, { w: 3, h: 2, action: 'keep', label: 'Approach the throne', colors: { banner: bann } });
          f('standard', 5.8, 1.3, { colors: { banner: bann } }); f('standard', 11.2, 1.3, { colors: { banner: bann } });
          for (const [px, py] of [[3.5, 3.2], [13.5, 3.2], [3.5, 7.6], [13.5, 7.6]]) f('pillar', px, py, { scale: 1.5 });
          f('rug', 8.5, 5.4, { solid: false, scale: 1.3, colors: { banner: bann } });
          f('table', 8.5, 8.2, { w: 2, h: 1, scale: 1.3 }); f('chair', 7.0, 8.2, { solid: false, rot: Math.PI }); f('chair', 10.0, 8.2, { solid: false });
          f('hearth', 15.0, 1.4, { w: 2, h: 1, light: { r: 7, a: 1.4, color: '#ff9a4a', h: 0.8 } });
          f('candles', 1.4, 10.3, { solid: false, light: { r: 4, a: 0.8, color: '#ffc070', h: 1.2 } });
          f('candles', 15.6, 10.3, { solid: false, light: { r: 4, a: 0.8, color: '#ffc070', h: 1.2 } });
          f('rack', 15.3, 6.5, { w: 2, h: 1 });
          spot(8.5, 2.2, { tag: 'ruler', pose: 'sit', dir: south });
          for (const [gx, gy] of [[6.5, 3.6], [10.5, 3.6], [6.8, 10.0], [10.2, 10.0]]) spot(gx, gy, { tag: 'guard', dir: south });
          spot(7.0, 8.2, { pose: 'sit', dir: 0, tag: 'seat' }); spot(10.0, 8.2, { pose: 'sit', dir: Math.PI, tag: 'seat' });
          break;
        }
      }
      L.inside = { x: BASE + L.doorX + 0.5, y: H - 1.5 };
      L.outside = { x: b.x + b.w / 2, y: b.y + b.h + 0.7 };
      L.name = I.title(b, s, world);
      return L;
    },

    // ---------------------------------------------------------------- entering & leaving
    canEnter(game, b, s) {
      const world = game.world, pl = game.pl;
      const hour = world.minute / 60;
      const night = hour < 6 || hour >= 22;
      if (b.type === 'house') {
        const mine = I.isMine(b, pl);
        if (mine || b.legend) return null;
        if (night && !ECHO.PlayerCtl.sneaking) return 'The door is barred for the night. (Sneak to try the shutters.)';
        return null;
      }
      if (night && (b.type === 'smithy' || b.type === 'archive')) return 'It is closed for the night.';
      if (b.type === 'keep' && (pl.wanted[s.faction] || 0) > 20) return 'The guards at the gate reach for their spears.';
      return null;
    },
    enter(game, b, s) {
      const why = I.canEnter(game, b, s);
      if (why) { ECHO.UI.toast(why, 'warn', 3); return; }
      ECHO.Sfx.play('door');
      ECHO.UI.fadeOut(() => {
        const L = I.layout(game, b, s);
        I.cur = L;
        game.pl.x = L.outside.x; game.pl.y = L.outside.y;
        game.pe.x = L.inside.x; game.pe.y = L.inside.y;
        game.pe.dir = -Math.PI / 2;
        game.ents = game.ents.filter(e => e === game.pe || e.isCompanion);
        for (const e of game.ents) if (e.isCompanion) { e.x = L.inside.x - 1; e.y = L.inside.y; }
        ECHO.Combat.reset();
        game.loot = [];
        I.occupantsKey = null;
        I.update(game, 0, true);
        ECHO.UI.fadeIn(350);
        ECHO.UI.banner(L.name, '', true);
        if (b.type === 'delve') ECHO.Quests.populate(game, L);
        if (b.type === 'house' && !I.isMine(b, game.pl) && !b.legend) {
          const home = I.householdHere(game);
          if (home.length && home.every(n => !I.isAsleep(game, n))) {
            const o = home[0];
            const op = o.op[game.pl.charId] || 0;
            ECHO.UI.toast(op > 20 ? `${o.first} smiles. "Come in, come in."` : op < -20 ? `${o.first} glares at you. "What are you doing in my house?"` : `${o.first} looks up, surprised to see you.`, 'info', 4);
          }
        }
      }, 300);
    },
    leave(game, silent) {
      const L = I.cur;
      if (!L) return;
      const finish = () => {
        // Anything dropped inside ends up by the door outside.
        for (const it of Object.values(game.world.items)) if (it.droppedAt && it.droppedAt.x >= 9000) it.droppedAt = { x: L.outside.x + 0.6, y: L.outside.y + 0.3 };
        I.cur = null;
        game.pe.x = L.outside.x; game.pe.y = L.outside.y;
        game.pe.dir = Math.PI / 2;
        game.ents = game.ents.filter(e => e === game.pe || e.isCompanion);
        for (const e of game.ents) if (e.isCompanion) { e.x = L.outside.x - 1; e.y = L.outside.y; }
        ECHO.Combat.reset();
        game.loot = [];
        game.checkPlace();
      };
      if (silent) return finish();
      ECHO.Sfx.play('door');
      ECHO.UI.fadeOut(() => { finish(); ECHO.UI.fadeIn(350); }, 300);
    },

    // ---------------------------------------------------------------- who is inside
    householdHere(game) {
      const L = I.cur, world = game.world;
      return P().residents(world, L.s).filter(n => ECHO.AI.Sched.houseOf(game, L.s, n) === L.b);
    },
    isAsleep(game, n) {
      const h = game.world.minute / 60;
      return (h < 6 || h >= 22) && n.prof !== 'guard';
    },
    wantOccupants(game) {
      const L = I.cur, world = game.world, s = L.s;
      const hour = world.minute / 60;
      const night = hour < 6 || hour >= 22;
      const evening = hour >= 18 && hour < 24;
      const res = P().residents(world, s).filter(n => n.status === 'alive' && n.id !== game.pl.companion);
      const seed = ECHO.hashStr(L.id + ':' + world.day + ':' + Math.floor(hour / 2));
      const pickN = (pool, n) => {
        const out = [];
        const arr = pool.slice().sort((a, b) => (ECHO.hashStr(a.id + seed) % 997) - (ECHO.hashStr(b.id + seed) % 997));
        for (const x of arr) { if (out.length >= n) break; out.push(x); }
        return out;
      };
      const out = [];
      switch (L.type) {
        case 'house': {
          const home = I.householdHere(game);
          for (const n of home) {
            if (night) out.push({ n, tag: n.prof === 'guard' ? 'any' : 'bed', pose: n.prof === 'guard' ? 'stand' : 'bed' });
            else if (n.prof === 'child' || n.prof === 'elder' || (ECHO.hashStr(n.id + seed) % 3 === 0)) out.push({ n, tag: 'any' });
          }
          break;
        }
        case 'inn': {
          const keeper = res.find(n => n.prof === 'innkeeper');
          if (keeper) out.push({ n: keeper, tag: 'keeper' });
          const wanderers = res.filter(n => n.prof === 'wanderer');
          for (const w of wanderers.slice(0, 2)) out.push({ n: w, tag: 'seat' });
          const adults = res.filter(n => !['innkeeper', 'wanderer', 'child', 'ruler', 'guard'].includes(n.prof) && P().age(world, n) >= 18);
          for (const n of pickN(adults, evening ? 5 : night ? 1 : 2)) out.push({ n, tag: 'seat' });
          break;
        }
        case 'smithy': {
          if (!night) for (const n of res.filter(x => x.prof === 'smith').slice(0, 2)) out.push({ n, tag: 'smith' });
          break;
        }
        case 'archive': {
          if (!night) for (const n of res.filter(x => x.prof === 'scholar' || x.prof === 'inventor').slice(0, 3)) out.push({ n, tag: 'seat' });
          break;
        }
        case 'shrine': case 'temple': {
          for (const n of res.filter(x => x.prof === 'priest').slice(0, L.type === 'temple' ? 3 : 1)) out.push({ n, tag: 'priest' });
          if (!night) for (const n of pickN(res.filter(x => x.prof !== 'priest' && x.prof !== 'guard' && x.prof !== 'ruler'), L.type === 'temple' ? 3 : 1)) out.push({ n, tag: 'seat' });
          break;
        }
        case 'keep': {
          const ruler = res.find(n => n.prof === 'ruler' && n.title);
          if (ruler && !night) out.push({ n: ruler, tag: 'ruler', pose: 'sit' });
          for (const n of res.filter(x => x.prof === 'guard').sort((a, b) => b.rank - a.rank).slice(0, 4)) out.push({ n, tag: 'guard' });
          break;
        }
      }
      return out;
    },
    update(game, dt, force) {
      const L = I.cur;
      if (!L) return;
      const world = game.world;
      const key = L.id + ':' + world.day + ':' + Math.floor(world.minute / 60);
      const present = new Set(game.ents.filter(e => e.npcId && !e.dead).map(e => e.npcId));
      if (!force && key === I.occupantsKey && I.cachedWant && I.cachedWant.every(o => present.has(o.n.id) || o.n.status !== 'alive')) return;
      I.occupantsKey = key;
      const want = I.wantOccupants(game);
      I.cachedWant = want;
      const wantIds = new Set(want.map(o => o.n.id));
      // People who should no longer be here walk out (vanish at the door).
      for (const e of game.ents) if (e.npcId && e.indoor && !wantIds.has(e.npcId) && !e.target) { e.dead = true; e.vanish = true; }
      const used = new Set(game.ents.filter(e => e.indoor && !e.dead).map(e => e.indoor.spot));
      for (const o of want) {
        if (present.has(o.n.id)) continue;
        let spotsFor = L.spots.filter(sp => !used.has(sp) && (sp.tag === o.tag || (o.tag === 'seat' && sp.tag === 'any') || (o.tag === 'any' && sp.tag === 'seat')));
        if (!spotsFor.length) spotsFor = L.spots.filter(sp => !used.has(sp));
        const sp = spotsFor[0];
        let x, y, pose = o.pose || 'stand', dir = -Math.PI / 2;
        if (sp) { used.add(sp); x = sp.x; y = sp.y; pose = o.pose || sp.pose; dir = sp.dir; }
        else { x = BASE + 2 + Math.random() * (L.W - 4); y = 2 + Math.random() * (L.H - 4); }
        const floorBed = pose === 'bed' && (!sp || sp.tag !== 'bed'); // more sleepers than beds: a blanket on the floor
        const role = o.n.prof === 'guard' ? 'guard' : 'villager';
        const e = ECHO.Spawner.makePerson(game, o.n, x, y, role);
        e.indoor = { x, y, dir: floorBed ? 0 : dir, pose, spot: sp, floor: floorBed };
        e.dir = dir;
        e.sleeping = pose === 'bed';
        e.seated = pose === 'sit';
        e.homeSid = L.s.id;
        e.noSlide = true;
        if (pose === 'stand' || floorBed) game.addEnt(e); else game.ents.push(e); // seats and beds sit inside furniture
      }
    },

    // ---------------------------------------------------------------- interaction
    interactables(game) {
      const L = I.cur, pe = game.pe;
      const out = [];
      if (!L) return out;
      const d = (x, y) => U.dist(x, y, pe.x, pe.y);
      for (const it of L.furn) {
        if (!it.action) continue;
        const fx = BASE + it.x, fy = it.y;
        const dd = d(fx, fy) - Math.max(it.w, it.h) / 2;
        if (dd < 1.1) out.push({ kind: 'furn', furn: it, label: it.label || it.action, d: dd });
      }
      if (d(L.inside.x, L.inside.y + 0.5) < 1.6) out.push({ kind: 'leave', label: 'Leave', d: 0.3 });
      return out;
    },
    use(game, it) {
      const L = I.cur, world = game.world, pl = game.pl, UI = ECHO.UI;
      const s = L.s, b = L.b;
      switch (it.action) {
        case 'inn': return UI.openInn(s);
        case 'innbed': return UI.openInn(s);
        case 'smithy': return UI.openSmithy(s);
        case 'archive': return UI.openArchive(s);
        case 'shrine': return UI.openShrine(s, b);
        case 'keep': return UI.openKeep(s);
        case 'heirloom': case 'ownchest': return UI.openHouse(b, s);
        case 'sleep':
          if (I.isMine(b, pl) || (b.legend && pl.legacyOf === b.legend)) return UI.sleepUntilMorning(s);
          return UI.toast('This is not your bed.', 'info', 2);
        case 'cupboard': return I.steal(game);
        default: return ECHO.Quests.use(game, it);
      }
    },
    steal(game) {
      const L = I.cur, world = game.world, pl = game.pl;
      L.b.robbed = L.b.robbed || {};
      if (L.b.robbed[pl.charId] === world.day) { ECHO.UI.toast('The cupboard is bare.', 'info', 2); return; }
      L.b.robbed[pl.charId] = world.day;
      const food = 1 + Math.floor(Math.random() * 3), coin = Math.floor(Math.random() * 12);
      pl.inv.food += food; pl.gold += coin;
      ECHO.Sfx.play('coin');
      ECHO.Character.behave(pl, 'betrayal', 0.3);
      ECHO.Character.train(pl, 'shadow', 0.4);
      const watchers = game.ents.filter(e => e.type === 'person' && !e.dead && !e.sleeping && e.npcId && ECHO.Ent.lineOfSight(world, e.x, e.y, game.pe.x, game.pe.y));
      if (watchers.length) {
        const w = watchers[0];
        const npc = world.npcs[w.npcId];
        w.say = 'Thief! Get out of my house!'; w.sayT = 3;
        npc.op[pl.charId] = (npc.op[pl.charId] || 0) - 35;
        P().remember(world, npc, `caught ${pl.first} ${pl.last} stealing from the house`, 'trauma', null, 3);
        pl.wanted[L.s.faction] = Math.min(200, (pl.wanted[L.s.faction] || 0) + 25);
        ECHO.Court.record(game, 'theft', { s: L.s, victim: npc.id, witnesses: watchers.map(e => e.npcId), value: coin + food * 4 });
        ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} was caught stealing from a house in ${L.s.name}.`, importance: 1, x: L.outside.x, y: L.outside.y, rep: -5, factionRep: { [L.s.faction]: -6 }, tag: 'betray' });
        ECHO.UI.toast(`${npc.first} saw you. You took ${food} food and ${coin} crowns.`, 'warn', 4);
      } else {
        ECHO.UI.toast(`You take ${food} food and ${coin} crowns. No one saw.`, 'info', 3);
        // the family finds the cupboard bare; the watch asks who was seen near the house
        const owner = L.b.npcOwner && world.npcs[L.b.npcOwner];
        const seenNear = ECHO.Patrol ? Object.entries(ECHO.Patrol.seen).filter(([, t]) => game.time - t < 120).map(([id]) => id) : [];
        if (ECHO.Watch && (seenNear.length || Math.random() < 0.5)) ECHO.Watch.playerCase(world, { kind: 'burglary', sid: L.s.id, victim: owner ? owner.id : null, x: L.outside.x, y: L.outside.y, seenNear, value: coin + food * 4, night: game.isNight() });
      }
    }
  };
})();
