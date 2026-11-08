// Hidden places, and the Atlas of all you have found.
//
// The world keeps more than anyone has found, and it never runs out: wherever you walk, the
// land around you — the old country and every new stretch of it — holds hidden places, laid
// down as you come near (the same for everyone who walks that way, and kept in your save):
//   • places that go down into the dark: a SUNKEN TEMPLE by the water, a SKY RUIN on the
//     heights with its stones still hanging in the air, a SEALED VAULT in the rock that only a
//     vault key opens, the forgotten TOMB of a king no one remembers. Each is a dungeon of its
//     own, of three floors or two, with a treasure of its own at the bottom;
//   • places that are guarded: a DRAGON'S GRAVE, a LOST BATTLEFIELD whose dead still hold it, a
//     WITCH'S HOLLOW, a GIANT'S FORGE, a STARFALL HEART. Something strong keeps each; beat it
//     and its hoard is yours — a fortune, a relic, fine gear, and often a treasure map or a
//     vault key;
//   • places that bless: a SILVER POOL that gives by moonlight, an ELDEST TREE that gives by
//     day. Each gives once, and what it gives stays with you.
// Every one has its name and its story, told when you find it. You feel one before you see it
// (a toast says which way); come close and it is yours, on your map.
// Treasure maps (from hoards, from the bottom of these places, from the Endless Deep's Wardens)
// each mark a ring where one still waits to be found: track it, and finding it pays more.
//
// The ATLAS counts everything you have ever found — these, and every dungeon, landmark and
// wonder, every cache and secret of the wild, every echo of the old world — and at each
// milestone it pays: crowns by your level, a treasure map, a little more life and a quicker
// stride for good, a relic every third, a sharper sense for what is hidden, and a name to go by.
// Kept: world.hidden {v, cells, list, seq}, sites for those that open into dungeons, and
// pl.atlas {n, kinds, tier, boon, maps}, all made the first time they are needed; a save from
// before begins its Atlas already counting what you had found. Nothing else in a save changes.
(function () {
  const { U } = ECHO;
  const T = ECHO.TILE;
  const CELL = 45;   // (a round world is 64 of them round: 2880 leagues)
  const UI = () => ECHO.UI, P = () => ECHO.Prowess, X = () => ECHO.Explore;
  const later = (f, ms) => (typeof setTimeout === 'function' ? setTimeout(f, ms) : f());
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const DIRS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
  const dirTo = (fx, fy, tx, ty) => DIRS[((Math.round(Math.atan2(ty - fy, tx - fx) / (Math.PI / 4)) % 8) + 8) % 8];

  const OLD = ['Ys', 'Aunvar', 'Meridel', 'Ostrel', 'Vael', 'Harrowmere', 'Selune', 'Tarn', 'Elleth', 'Corrow', 'Ismere', 'Brannoch', 'Kaer Tolm', 'Wyrran', 'Aldmoor', 'Thessil', 'Orrin', 'Calder', 'Myrrin', 'Sorrow', 'Ilvane', 'Dun Arrow', 'Esk', 'Gallowmere', 'Hesper', 'Lir', 'Nimra', 'Quell', 'Rhosk', 'Ulmar', 'Varrow', 'Wenlock', 'Yssar', 'Zeren', 'Amberhal', 'Cold Ferrin'];
  const WHO = ['the Tide-Priests', 'Queen Ysolde', 'the Nine Kings', 'the Lantern Order', 'the first smiths', 'a line of forgotten kings', 'the star-readers', 'the people of the old tongue', 'the Hollow Court', 'the Wardens of the Deep Road', 'the Grey Abbess', 'a giant called Hrunn'];

  // where each likes to be: 'water' beside it, 'high' among hills and rock, 'rock' in a hillside,
  // 'open' on grass, 'dry' on sand or bare hill, 'wood' in the forest or the marsh
  const KINDS = {
    drowned: { label: 'Sunken temple', type: 'delve', where: 'water', col: '#4ad8c8', icon: '≋', titles: ['the Drowned Temple of {N}', 'the Sunken Fane of {N}', 'the Tide-Hall of {N}'],
      lore: ['{W} built this temple to the sea when the sea was here. The sea went away; the temple went down after it, and the water in its halls has never been still.', 'Bells of green bronze hang under the water in the stair. On some nights, people say, {W} still ring them for a flood that never came back.', 'The temple of {N} drowned in a single night. What its priests were keeping below, they are keeping still.'] },
    skyruin: { label: 'Sky ruin', type: 'delve', where: 'high', col: '#bfe8ff', icon: '⌂', titles: ['the Sky Ruin of {N}', 'the Hanging Halls of {N}', 'the Cloud-Stair of {N}'],
      lore: ['{W} raised these halls on stones that would not fall. Most of them have fallen. The rest still hang in the air above the hill, waiting.', 'Here {W} watched the sky. Their stair goes up into nothing — and down, under the hill, into rooms the wind has never reached.', 'Some old working holds these stones in the air. Whatever kept {N} keeps its halls below as well.'] },
    vault: { label: 'Sealed vault', type: 'delve', where: 'rock', col: '#ffd27a', icon: '⌧', sealed: true, titles: ['the Sealed Vault of {N}', 'the Locked Hoard of {N}', 'the Iron Door of {N}'],
      lore: ['A door of bronze in the hillside, sealed with three runes. {W} locked away the treasure of {N} here and took the keys with them.', 'The vault of {N} was made never to be opened. Vault keys still turn up in old hoards — and every one of them fits.', '{W} hid here what they could not bear to lose. The seal holds. Behind it, something has been counting the coins for a long time.'] },
    tomb: { label: 'Forgotten tomb', type: 'delve', where: 'open', col: '#9fd3ff', icon: '✝', titles: ['the Tomb of the King of {N}', 'the Forgotten Barrow of {N}', 'the Grave of {N}\'s Last King'],
      lore: ['A king of {N} lies here, whose name no one alive remembers. He was buried with his household, his hoard and his guard — and the guard took its oath seriously.', '{W} buried their dead kings in the open grass, with standing stones to keep them in. The stones lean now.', 'No song is left of the last king of {N}. Only this mound, and what still walks inside it.'] },
    dragongrave: { label: 'Dragon\'s grave', type: 'guard', where: 'dry', col: '#ff7a3a', icon: '☠', titles: ['the Dragon\'s Grave of {N}', 'the Burnt Bones of {N}', 'the Wyrm\'s Rest at {N}'],
      guards: [['troll', 2], ['golemling', 2]], champ: 'golem', champName: 'the Ember-Hulk', hoardMul: 1.6,
      lore: ['A dragon died here, long ago. Its bones are still warm, and the things that came to pick them grew into something worse.', 'The great wyrm of {N} came down here in its last fire. The ground is glass. Its hoard went into the ground with it.', '{W} killed the dragon of {N} at last, and left its bones to keep the hoard. Something keeps it still.'] },
    warfield: { label: 'Lost battlefield', type: 'guard', where: 'open', col: '#c8b89a', icon: '⚔', titles: ['the Lost Field of {N}', 'the Last Stand of {N}', 'the Broken Host of {N}'],
      guards: [['skeleton', 3], ['skelarcher', 2], ['wight', 2]], champ: 'barrow-king', champName: 'the Last Captain', hoardMul: 1.2,
      lore: ['The host of {N} made its last stand here, and lost, and would not leave. Their banners are rags; their captain still gives orders.', 'No one remembers what the battle of {N} was for. The dead remember the battle.', '{W} sent an army here and it never came home. It is still here, and it still holds the field.'] },
    witch: { label: 'Witch\'s hollow', type: 'guard', where: 'wood', col: '#9aff6a', icon: '✵', titles: ['the Witch\'s Hollow of {N}', 'the Hag\'s Bower at {N}', 'the Bone-Hung Wood of {N}'],
      guards: [['spider', 2], ['ghoul', 2], ['cultist', 1]], champ: 'necromancer', champName: 'the Hollow Witch', hoardMul: 1.1, w: 0.55,
      lore: ['Charms of bone and string hang from every branch. The witch of {N} took what the villages gave her, and what they did not.', 'The trees here grow crooked, all leaning away from the middle. Something there has been very patient for a very long time.', 'They drove the witch out of {N} with fire, and she came here. They did not follow.'] },
    giantforge: { label: 'Giant\'s forge', type: 'guard', where: 'high', col: '#ffb060', icon: '⚒', titles: ['the Giant\'s Forge at {N}', 'Hrunn\'s Anvil above {N}', 'the Cold Forge of {N}'],
      guards: [['troll', 2], ['goblin', 3]], champ: 'ogre', champName: 'the Forge-Giant', hoardMul: 1, forged: true,
      lore: ['An anvil the size of a cart, and a hearth like a cave. {W} forged here, once, the blades of {N}. The fire has gone out. The smith has not.', 'Hrunn the giant beat out swords here for kings who paid in gold. He kept the best of them himself.', 'The forge of {N} has been cold for an age — but there is still a blade on the anvil, and someone big still guards it.'] },
    starheart: { label: 'Starfall heart', type: 'guard', where: 'open', col: '#8ac8ff', icon: '✦', titles: ['the Starfall Heart of {N}', 'the Fallen Star of {N}', 'the Blue Crater at {N}'],
      guards: [['spider', 3], ['wraith', 1]], champ: 'queen', champName: 'the Star-Weaver', hoardMul: 1, star: true,
      lore: ['A star fell here and did not go out. The heart of it still burns blue in the crater, and the things that live by its light have grown strange.', '{W} watched this star come down, and wrote that it sang. It sings still, very low, if you stand close.', 'Star-iron lies all round the crater of {N} — and something weaves it into webs.'] },
    silverpool: { label: 'Silver pool', type: 'bless', where: 'wood', col: '#d8e8ff', icon: '◌', when: 'night', titles: ['the Silver Pool of {N}', 'the Moon\'s Mirror at {N}', 'the Lady\'s Pool of {N}'],
      lore: ['By day it is only a pool. By moonlight it shines like a dish of silver, and whoever drinks from it then is never quite as frail again.', '{W} came here by night to drink and be made whole. The pool remembers them, and gives once to each who finds it.', 'The water of {N} glows under the moon. They say it gives once, to each, and that what it gives is for good.'] },
    eldertree: { label: 'Eldest tree', type: 'bless', where: 'wood', col: '#ffe08a', icon: '♣', when: 'day', titles: ['the Eldest Tree of {N}', 'the Grandmother Oak of {N}', 'the Heart-Tree of {N}'],
      lore: ['The oldest living thing in all this country. Rest under it by daylight, and you will walk lighter for the rest of your life.', '{W} planted this tree when {N} was young. {N} is gone. The tree is not.', 'Its roots go down further than any well. Sit in its shade by day and something of its long patience goes into you.'] }
  };
  const TYPES = { delve: ['drowned', 'skyruin', 'vault', 'tomb'], guard: ['dragongrave', 'warfield', 'witch', 'giantforge', 'starheart'], bless: ['silverpool', 'eldertree'] };
  // the dungeons they open into
  const DELVE_DEFS = {
    drowned: { label: 'Sunken temple', names: ['the Sunken Temple'], desc: 'A temple drowned to its roof in green water. A stair goes down through the flood into halls that have never dried.', boss: 'crypt-warden', hiddenFloors: 3, roster: [['ghoul', 2], ['wraith', 2], ['wight', 2], ['skeleton', 2]], deep: [['wraith', 1], ['ghoul', 1]], style: 'crypt', glow: '#4ad8c8', lvl: 2 },
    skyruin: { label: 'Sky ruin', names: ['the Sky Ruin'], desc: 'Broken arches on the heights, with great stones hanging in the air above them. A stair under the hill goes down into the old halls.', boss: 'golem', hiddenFloors: 2, roster: [['golemling', 3], ['wraith', 2], ['skelarcher', 2], ['cultist', 1]], deep: [['golemling', 1], ['wraith', 1]], style: 'stone', glow: '#bfe8ff', lvl: 2 },
    vault: { label: 'Sealed vault', names: ['the Sealed Vault'], desc: 'A door of bronze in the hillside, sealed with three runes. It takes a vault key.', boss: 'warlord', hiddenFloors: 3, roster: [['golemling', 3], ['skeleton', 2], ['wight', 2], ['brigand', 1]], deep: [['golemling', 2]], style: 'stone', glow: '#ffd27a', lvl: 3 },
    tomb: { label: 'Forgotten tomb', names: ['the Forgotten Tomb'], desc: 'A long mound in the open grass, ringed with leaning stones. A forgotten king lies under it, with his guard.', boss: 'barrow-king', hiddenFloors: 2, roster: [['skeleton', 3], ['wight', 3], ['skelarcher', 2]], deep: [['ghoul', 1], ['wight', 1]], style: 'crypt', glow: '#9fd3ff', lvl: 2 }
  };
  // the Atlas: the milestones, and what each pays
  const TIERS = [5, 10, 20, 35, 50, 75, 100, 130, 165, 200, 250, 300, 375, 450, 550, 650, 800, 1000];
  const TITLES = { 2: 'Wayfarer', 4: 'Pathfinder', 6: 'Trailblazer', 8: 'Far-walker', 10: 'Worldwalker', 13: 'Keeper of the Atlas', 16: 'the Unbounded' };

  const H = ECHO.Hidden = {
    KINDS, TYPES, DELVE_DEFS, CELL, glows: [], live: {}, t: 0,
    st(world) {
      const S = world.hidden || (world.hidden = { v: 1, cells: {}, list: [], seq: 0 });
      return S;
    },
    byId(world, id) { return (world.hidden && world.hidden.list.find(h => h.id === id)) || null; },
    plv() { const G = ECHO.Game; return G && G.pl && P() ? P().level(G.pl) : 1; },
    // a cell's key, in the land's own reckoning (new land to the west or north moves everything)
    cellKey(world, cx, cy) { return cx + ',' + cy; },
    origin(world) { const F = world.frontier; return F ? { ox: F.ox || 0, oy: F.oy || 0 } : { ox: 0, oy: 0 }; },
    cols(world) { return world.globe ? Math.max(1, Math.round((world.W || 2880) / CELL)) : 0; },
    wrapCx(world, cx) { const n = H.cols(world); return n ? ((cx % n) + n) % n : cx; },
    cellOf(world, x, y) { const o = H.origin(world); return { cx: H.wrapCx(world, Math.floor((x - o.ox) / CELL)), cy: Math.floor((y - o.oy) / CELL) }; },
    // (on a round world, only once the land all round it is made — and its towns founded — so
    //  no town comes later to stand on top of what was hidden)
    landHere(world, x, y) {
      if (world.globe) {
        if (y < 30 || y >= (world.H || 150) - 30) return false;
        if (!ECHO.Globe) return true;
        const R = CELL / 2 + 26;
        for (const [dx, dy] of [[0, 0], [-R, -R], [R, -R], [-R, R], [R, R], [0, -R], [0, R], [-R, 0], [R, 0]]) if (!ECHO.Globe.made(world, x + dx, y + dy)) return false;
        return true;
      }
      return x >= 4 && y >= 4 && x < (world.W || 200) - 4 && y < (world.H || 150) - 4;
    },
    // ------------------------------------------------------------ laid down as you come near
    // (each cell of land once, from its own seed: the same places for the same world)
    fill(world, cx, cy) {
      cx = H.wrapCx(world, cx);
      const S = H.st(world), key = H.cellKey(world, cx, cy);
      if (S.cells[key]) return null;
      const o = H.origin(world), x0 = cx * CELL + o.ox, y0 = cy * CELL + o.oy, mx = x0 + CELL / 2, my = y0 + CELL / 2;
      if (!H.landHere(world, mx, my)) return null;   // (not made yet: it is laid down when it is)
      S.cells[key] = 1;
      const rng = new ECHO.RNG(ECHO.hashStr('hidden:' + world.seed + ':' + key));
      if (rng.next() > 0.62) return null;
      const W = ECHO.World, tile = (x, y) => W.tile(world, x, y);
      const count = (x, y, r, set) => { let n = 0; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (set.includes(tile(x + dx, y + dy))) n++; return n; };
      const wet = (x, y) => ECHO.Water && ECHO.Water.kind ? !!ECHO.Water.kind(world, x + 0.5, y + 0.5) : tile(x, y) === T.WATER;
      const home = world.player && ECHO.Sim && ECHO.Sim.settlement(world, world.player.homeId);
      for (let k = 0; k < 70; k++) {
        const x = Math.floor(x0 + 3 + rng.next() * (CELL - 6)), y = Math.floor(y0 + 3 + rng.next() * (CELL - 6));
        const t = tile(x, y);
        if (![T.GRASS, T.FOREST, T.HILL, T.SAND, T.SWAMP, T.SNOW].includes(t) || wet(x, y) || W.isSolid(world, x + 0.5, y + 0.5)) continue;
        let block = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (W.isSolid(world, x + dx + 0.5, y + dy + 0.5) || wet(x + dx, y + dy)) block++;
        if (block > 2) continue;
        if (world.settlements.some(s => U.dist(s.x, s.y, x + 0.5, y + 0.5) < (s.kind === 'village' ? 15 : 22)) || (home && U.dist(home.x, home.y, x + 0.5, y + 0.5) < 22)) continue;
        if ((world.sites || []).some(s => U.dist(s.x, s.y, x + 0.5, y + 0.5) < 9) || S.list.some(h => U.dist(h.x, h.y, x + 0.5, y + 0.5) < 22)) continue;
        if ((world.lairs || []).some(l => U.dist(l.x, l.y, x + 0.5, y + 0.5) < 10) || (world.camps || []).some(c => U.dist(c.x, c.y, x + 0.5, y + 0.5) < 9) || (world.secrets && world.secrets.list.some(o => U.dist(o.x, o.y, x + 0.5, y + 0.5) < 7))) continue;
        if (ECHO.Gates && ECHO.Gates.inMenace && ECHO.Gates.inMenace(world, x, y)) continue;
        let tame = false; for (let dy = -5; dy <= 5 && !tame; dy++) for (let dx = -5; dx <= 5; dx++) { const u = tile(x + dx, y + dy); if (u === T.FARM || u === T.ROAD || u === T.PLAZA || u === T.BRIDGE) { tame = true; break; } }
        if (tame) continue;
        // what suits this ground
        const water = count(x, y, 3, [T.WATER, T.DEEP]) + (count(x, y, 2, [T.SWAMP]) > 3 ? 3 : 0), high = count(x, y, 3, [T.HILL, T.ROCK, T.SNOW]), rock = count(x, y, 2, [T.ROCK]), wood = count(x, y, 3, [T.FOREST, T.TREE]) + count(x, y, 2, [T.SWAMP]);
        const fit = {
          water: water >= 3 ? 3 : 0,
          high: high >= 12 ? 2 + high / 20 : 0,
          rock: rock >= 2 || (t === T.HILL && high >= 16) ? 2.5 : 0,
          open: t === T.GRASS && wood < 10 ? 1.6 : 0,
          dry: t === T.SAND || (t === T.HILL && wood < 6) || t === T.SNOW ? 2 : 0,
          wood: wood >= 14 ? 2 : 0
        };
        const cands = Object.keys(KINDS).map(kd => [kd, fit[KINDS[kd].where] * (KINDS[kd].w || (KINDS[kd].type === 'bless' ? 0.45 : KINDS[kd].type === 'delve' ? 1 : 0.9))]).filter(c => c[1] > 0);
        if (!cands.length) continue;
        const tot = cands.reduce((a, c) => a + c[1], 0);
        let r = rng.next() * tot, kind = cands[0][0];
        for (const c of cands) { r -= c[1]; if (r <= 0) { kind = c[0]; break; } }
        const K = KINDS[kind], N = OLD[rng.int(0, OLD.length - 1)];
        let name = K.titles[rng.int(0, K.titles.length - 1)].replace('{N}', N);
        if (S.list.some(h => h.name === name)) name = name.replace(N, OLD[(OLD.indexOf(N) + 7 + S.seq) % OLD.length]);
        const h = { id: 'hd' + (++S.seq), kind, name, x: x + 0.5, y: y + 0.5, found: false, lore: rng.int(0, K.lore.length - 1), who: rng.int(0, WHO.length - 1), N };
        // a little clearing round it, so it can be seen (and the ground redrawn there only)
        let cut = 0;
        for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
          const u = tile(x + dx, y + dy), r = Math.hypot(dx, dy);
          if (r <= 2.6 && (u === T.TREE || u === T.FOREST)) { W.setTile(world, x + dx, y + dy, T.GRASS); cut++; }
          else if (r <= 4.2 && u === T.TREE) { W.setTile(world, x + dx, y + dy, T.FOREST); cut++; }
        }
        S.list.push(h);
        if (cut) { const e = world._tileEpoch = (world._tileEpoch || 0) + 1; world._tileLog = (world._tileLog || []).concat([{ e, rects: [{ x0: x - 5, y0: y - 5, x1: x + 6, y1: y + 6 }] }]).slice(-64); }
        return h;
      }
      return null;
    },
    // the cells about (x, y), out to r leagues; at most `max` laid down at a time
    fillAround(world, x, y, r, max = 2) {
      const S = H.st(world), c = H.cellOf(world, x, y), n = Math.ceil(r / CELL);
      const todo = [];
      for (let dy = -n; dy <= n; dy++) for (let dx = -n; dx <= n; dx++) { const cx = H.wrapCx(world, c.cx + dx), k = H.cellKey(world, cx, c.cy + dy); if (!S.cells[k]) todo.push([cx, c.cy + dy, dx * dx + dy * dy]); }
      todo.sort((a, b) => a[2] - b[2]);
      let made = 0;
      for (const [cx, cy] of todo) { if (made >= max) break; const before = S.cells[H.cellKey(world, cx, cy)]; H.fill(world, cx, cy); if (!before && S.cells[H.cellKey(world, cx, cy)]) made++; }
      return made;
    },
    tamed(world, h) {
      if (world.settlements.some(s => U.dist(s.x, s.y, h.x, h.y) < (s.kind === 'village' ? 13 : 19))) return true;
      const W = ECHO.World, x = Math.floor(h.x), y = Math.floor(h.y);
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const u = W.tile(world, x + dx, y + dy); if (u === T.FARM || u === T.PLAZA) return true; }
      return false;
    },
    lore(h) { const K = KINDS[h.kind]; return K.lore[h.lore % K.lore.length].replace(/\{N\}/g, h.N).replace(/\{W\}/g, WHO[h.who % WHO.length]).replace(/^the /, 'The ').replace(/^([a-z])/, m => m.toUpperCase()).replace(/([.!?]\s+)([a-z])/g, (m, a, b) => a + b.toUpperCase()); },
    region(world, h) { const r = ECHO.World.regionAt && ECHO.World.regionAt(world, h.x, h.y); return r ? r.name : null; },

    // ------------------------------------------------------------ each frame
    update(game, dt) {
      const world = game.world, pe = game.pe, pl = game.pl;
      H.glows.length = 0;
      if (!world || !pe || ECHO.Interior.cur || pl.capture) return;
      const S = H.st(world), night = game.isNight ? game.isNight() : false;
      for (const h of S.list) {
        if (Math.abs(h.x - pe.x) > 48 || Math.abs(h.y - pe.y) > 48) continue;
        const K = KINDS[h.kind];
        if (h.found && K.type === 'guard' && h.cleared && !h.taken) H.glows.push({ x: h.x, y: h.y + 1.2, h: 0.7, c: K.col, s: 1.5 + Math.sin(game.time * 4) * 0.2, a: 0.85 });
        if (K.type === 'bless' && !(h.blessed) && (K.when === 'night' ? night : !night)) H.glows.push({ x: h.x, y: h.y, h: 0.4, c: K.col, s: 2.6 + Math.sin(game.time * 2) * 0.3, a: 0.7 });
        if (!h.found && Math.random() < dt * 2) ECHO.Combat.fx.push({ kind: 'p', x: h.x + (Math.random() - 0.5) * 3, y: h.y + (Math.random() - 0.5) * 3, vx: 0, vy: 0, t: 0, life: 1.1, color: K.col, size: 2, spark: true });
      }
      H.t -= dt;
      if (H.t > 0) return;
      H.t = 0.5;
      H.fillAround(world, pe.x, pe.y, 88, 2);
      const A = ECHO.Atlas, sense = A ? A.sense(pl) : 22;
      // one not yet found that a town has grown up round since: the town has it, and it is gone
      if (S.list.some(h => !h.found && Math.abs(h.x - pe.x) < 90 && Math.abs(h.y - pe.y) < 90 && H.tamed(world, h))) S.list = S.list.filter(h => h.found || Math.abs(h.x - pe.x) >= 90 || Math.abs(h.y - pe.y) >= 90 || !H.tamed(world, h));
      for (const h of S.list) {
        if (h.found) { if (KINDS[h.kind].type === 'guard') H.guard(game, h); continue; }
        const d = U.dist(h.x, h.y, pe.x, pe.y);
        if (d < 9 || (d < 14 && ECHO.Ent.lineOfSight(world, pe.x, pe.y, h.x, h.y))) { H.discover(game, h); continue; }
        if (d < sense && !h.sensed) { h.sensed = world.day || 1; UI().toast(`You feel it before you see it: something old and hidden lies close by, to the ${dirTo(pe.x, pe.y, h.x, h.y)}.`, 'study', 5); if (ECHO.Sfx) ECHO.Sfx.play('heal', { vol: 0.35, pitch: 1.4 }); }
      }
      if (A) A.check(game);
    },
    // ------------------------------------------------------------ found
    discover(game, h) {
      const world = game.world, pl = game.pl, K = KINDS[h.kind];
      h.found = world.day || 1;
      const A = ECHO.Atlas, a = A ? A.st(pl) : null;
      if (a) { a.n++; a.kinds[h.kind] = (a.kinds[h.kind] || 0) + 1; }
      // by a map? it pays more
      const map = (pl.hmaps || []).find(m => m.h === h.id);
      if (map) { pl.hmaps = pl.hmaps.filter(m => m !== map); h.byMap = 1; if (a) a.maps++; if (pl.tracked === 'hmap:' + map.id) pl.tracked = null; }
      // a place that goes down: it is a dungeon now, on the map with the rest
      if (K.type === 'delve') H.site(world, h);
      if (ECHO.Music) ECHO.Music.stinger('discover');
      UI().banner(h.name, `${K.label} · discovered${map ? ' — the place on your map' : ''}`, true);
      const what = K.type === 'delve' ? (K.sealed ? ' It is sealed: it takes a vault key.' : ' A way goes down. (E to go in.)') : K.type === 'guard' ? ' Something guards it — beat what guards it, and its hoard is yours.' : K.when === 'night' ? ' It gives by moonlight, once.' : ' It gives by daylight, once.';
      UI().toast(`${H.lore(h)}${what}`, 'legend', 9);
      if (ECHO.Chronicle) ECHO.Chronicle.add(world, { text: `${pl.first} ${pl.last} found ${h.name}, ${K.label.toLowerCase()}${H.region(world, h) ? ' in ' + H.region(world, h) : ''}, hidden for an age.`, kind: 'player', importance: 1, x: h.x, y: h.y, char: pl.charId });
      pl.renown = (pl.renown || 0) + 1;
      if (ECHO.Pastimes && ECHO.Pastimes.gain) ECHO.Pastimes.gain(game, 'forage', 3);
    },
    site(world, h) {
      if (h.site) return X().byId(world, h.site);
      const L0 = ECHO.Danger ? ECHO.Danger.base(world, h.x, h.y) : 1, D = DELVE_DEFS[h.kind];
      const s = { id: 'site_' + h.id, cat: 'delve', kind: h.kind, name: h.name, x: h.x, y: h.y, found: true, seen: true, cleared: false, used: {}, level: U.clamp(L0 + (D.lvl || 0) * 2, 1, (ECHO.Danger && ECHO.Danger.MAX) || 1500), lv2: 1, hidden: h.id };
      if (KINDS[h.kind].sealed) s.sealed = true;
      world.sites.push(s); h.site = s.id;
      return s;
    },
    // ------------------------------------------------------------ guarded
    guardLevel(world, h) {
      const at = ECHO.Danger ? ECHO.Danger.at(world, h.x, h.y) : 1;
      return Math.min((P() && P().MAX) || 1500, Math.max(1, Math.round(at * 1.08) + 2));
    },
    guard(game, h) {
      if (h.cleared) return;
      const pe = game.pe, d = U.dist(h.x, h.y, pe.x, pe.y);
      if (d > 26) return;
      const live = H.live[h.id];
      if (live && live.some(e => !e.dead)) return;
      const K = KINDS[h.kind], world = game.world, M = ECHO.Monsters, L = H.guardLevel(world, h);
      h.L = L;
      const out = [];
      const put = (kind, r, a, lvl, champ) => {
        const sp = ECHO.Ent.freeSpot(world, h.x + Math.cos(a) * r, h.y + Math.sin(a) * r, 3);
        if (!sp) return null;
        const e = M.make(game, kind, sp.x, sp.y, lvl, champ ? { noElite: true } : {});
        e.hiddenOf = h.id; e.home = { x: sp.x, y: sp.y };
        if (champ) {
          e.hidChamp = true; e.label = `${K.champName} of ${h.N}`;
          e.hp = e.maxHp = Math.round(e.maxHp * (e.boss2 ? 1.6 : 3)); e.dmgMul = (e.dmgMul || 1) * 1.15; e.scale = (e.scale || 1) * 1.2;
        }
        game.addEnt ? game.addEnt(e) : game.ents.push(e);
        out.push(e); return e;
      };
      put(K.champ, 0.8, 0, L + 2, true);
      let i = 0; for (const [kind, n] of K.guards) for (let k = 0; k < n; k++) put(kind, 2.6 + (i % 3) * 0.9, i++ * 1.3, L, false);
      H.live[h.id] = out;
      if (!h.warned) { h.warned = 1; UI().toast(`${U.cap(K.champName)} of ${h.N} keeps ${h.name}, and it has seen you.`, 'warn', 4); }
    },
    onKill(target, from) {
      const game = ECHO.Game, world = game && game.world;
      if (!world || !target.hidChamp) return;
      const h = H.byId(world, target.hiddenOf);
      if (!h || h.cleared) return;
      h.cleared = world.day || 1;
      const pl = game.pl;
      if (ECHO.Music) ECHO.Music.stinger('star');
      later(() => UI().banner(`${h.name} is yours`, 'what guarded it is dead — its hoard waits (E)', true), 900);
      if (ECHO.Chronicle) ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} killed ${KINDS[h.kind].champName} of ${h.N} and took ${h.name}.`, importance: 1, x: h.x, y: h.y, rep: 2, tag: 'brave' });
    },
    hoard(game, h) {
      const world = game.world, pl = game.pl, K = KINDS[h.kind];
      if (h.taken) return UI().toast('Nothing is left of the hoard.', 'info', 2);
      if (!h.cleared) return UI().toast(`Not while ${K.champName} of ${h.N} stands.`, 'warn', 2);
      h.taken = world.day || 1;
      const L = h.L || H.guardLevel(world, h), where = `in the hoard of ${h.name}`;
      const gold = Math.round(160 * L * (K.hoardMul || 1) * (h.byMap ? 1.5 : 1)), out = [`${gold.toLocaleString('en-US')} crowns${h.byMap ? ' (half as much again: you came by the map)' : ''}`];
      pl.gold += gold;
      const x = h.x, y = h.y + 1.6;
      if (ECHO.Arcana) { ECHO.Arcana.drop(game, x + 0.9, y, L + 1, { boost: 32, floor: L >= 120 ? 'epic' : 'rare', where }); out.push('a relic (on the ground)'); }
      ECHO.Monsters.dropGear(game, x, y, L + 1, 30, where); out.push('a piece of gear (on the ground)');
      if (K.forged) { ECHO.Monsters.dropGear(game, x - 0.9, y, L + 3, 70, `on the anvil of ${h.name}`); out.push('the blade on the anvil — the finest thing here'); }
      if (K.star) { const n = 3 + Math.floor(Math.random() * 4); pl.inv.starshard = (pl.inv.starshard || 0) + n; out.push(`${n} shards of star-iron`); }
      if (h.kind === 'warfield') { pl.renown = (pl.renown || 0) + 3; out.push('the captain\'s banner: your name is spoken of'); }
      if (h.kind === 'witch') { pl.inv.herbs = (pl.inv.herbs || 0) + 6; out.push('the witch\'s herbs, six bundles'); }
      if (Math.random() < 0.45) { const m = H.giveMap(game, h.x, h.y, `folded in the hoard of ${h.name}`, true); if (m) out.push('a treasure map'); }
      if (Math.random() < 0.3) { pl.inv.vaultkey = (pl.inv.vaultkey || 0) + 1; out.push('a vault key of old bronze'); }
      ECHO.Sfx.play('coin'); if (ECHO.Music) ECHO.Music.stinger('star');
      UI().modal({ title: `The hoard of ${h.name}`, html: `<ul>${out.map(g => `<li>${esc(g)}</li>`).join('')}</ul>`, choices: [{ label: 'Take it all', onPick: () => {} }] });
      return out;
    },
    // ------------------------------------------------------------ blessing
    bless(game, h) {
      const world = game.world, pl = game.pl, K = KINDS[h.kind], night = game.isNight ? game.isNight() : false;
      if (h.blessed) return UI().toast(`${U.cap(h.name)} has given you what it gives.`, 'info', 3);
      if (K.when === 'night' ? !night : night) return UI().toast(K.when === 'night' ? 'By day it is clear water, and only water. Come back under the moon.' : 'In the dark it is only a tree. Come back by daylight.', 'info', 4);
      h.blessed = world.day || 1;
      const A = ECHO.Atlas, b = A.st(pl).boon;
      let line;
      if (h.kind === 'silverpool') { b.hp = Math.min(0.3, (b.hp || 0) + 0.02); b.mana = Math.min(0.3, (b.mana || 0) + 0.03); line = 'two parts in a hundred more life, and three more mana, for good'; }
      else { b.speed = Math.min(0.12, (b.speed || 0) + 0.01); b.hp = Math.min(0.3, (b.hp || 0) + 0.01); line = 'a lighter stride and a little more life, for good'; }
      if (ECHO.PlayerCtl) { ECHO.PlayerCtl.derivedT = 0; ECHO.PlayerCtl.computeDerived(game); }
      pl.hp = pl.maxHp; pl.mana = pl.maxMana;
      if (ECHO.Music) ECHO.Music.stinger('discover');
      if (game.pe && ECHO.Combat) { ECHO.Combat.ring(game.pe.x, game.pe.y, 2, K.col, 0.8); ECHO.Combat.burst(game.pe.x, game.pe.y, K.col, 22, 3, 0.8, 2); }
      UI().banner(h.name, `it gives: ${line}`, true);
    },
    // ------------------------------------------------------------ sealed
    unseal(game, site) {
      const pl = game.pl;
      if (!site.sealed) return;
      if (!((pl.inv.vaultkey || 0) > 0)) return UI().toast('The seal holds. It takes a vault key — they turn up in old hoards, at the bottom of hidden places, and with the Wardens of the Endless Deep.', 'warn', 6);
      pl.inv.vaultkey--; site.sealed = false; site.unsealed = game.world.day || 1;
      if (ECHO.Music) ECHO.Music.stinger('discover');
      ECHO.Sfx.play('door');
      UI().banner(U.cap(site.name), 'the key turns, the three runes go out — the vault is open', true);
    },
    // the bottom of a hidden place (Quests.loot): its own treasure
    chest(game, site, out, lv) {
      const world = game.world, pl = game.pl, h = H.byId(world, site.hidden);
      if (!h || h.done) return out;   // (its own treasure is there once: after, it is a dungeon like the rest)
      h.done = world.day || 1;
      const L0 = ECHO.Interior.cur, bx = L0 && L0.chest ? ECHO.Interior.BASE + L0.chest.x : game.pe.x, by = L0 && L0.chest ? L0.chest.y + 1.2 : game.pe.y;
      const mul = { vault: 4, drowned: 2, skyruin: 2, tomb: 1.6 }[h.kind] || 1.5, gold = Math.round(120 * lv * mul * (h.byMap ? 1.5 : 1));
      pl.gold += gold; out.push(`${gold.toLocaleString('en-US')} crowns: the treasure of ${h.name}`);
      if (ECHO.Arcana) { ECHO.Arcana.drop(game, bx - 0.9, by, lv + 2, { boost: 40, floor: h.kind === 'vault' || lv >= 200 ? 'legendary' : 'epic', where: `in the heart of ${h.name}` }); out.push('a relic of the old makers'); }
      if (Math.random() < 0.6) { const m = H.giveMap(game, site.x, site.y, `among the treasure of ${h.name}`, true); if (m) out.push('a treasure map to another hidden place'); }
      if (h.kind !== 'vault' && Math.random() < 0.4) { pl.inv.vaultkey = (pl.inv.vaultkey || 0) + 1; out.push('a vault key of old bronze'); }
      return out;
    },
    // ------------------------------------------------------------ treasure maps
    // a map to a hidden place not yet found, a fair walk away (laying more down out there if need be)
    giveMap(game, fx, fy, how, quiet) {
      const world = game.world, pl = game.pl, S = H.st(world);
      const have = new Set((pl.hmaps || []).map(m => m.h));
      const ok = h => !h.found && !have.has(h.id) && U.dist(h.x, h.y, fx, fy) > 30 && U.dist(h.x, h.y, fx, fy) < 170;
      let pool = S.list.filter(ok);
      if (pool.length < 2) {
        const rng = Math.random;
        for (let k = 0; k < 14 && pool.length < 3; k++) { const a = rng() * Math.PI * 2, d = 60 + rng() * 90, c = H.cellOf(world, fx + Math.cos(a) * d, fy + Math.sin(a) * d); H.fill(world, c.cx, c.cy); pool = S.list.filter(ok); }
      }
      if (!pool.length) return null;
      const h = pool[Math.floor(Math.random() * pool.length)];
      const r = 8, a = Math.random() * Math.PI * 2, off = Math.random() * r * 0.6;
      const m = { id: 'hm' + (++S.seq), h: h.id, x: h.x + Math.cos(a) * off, y: h.y + Math.sin(a) * off, r, kind: h.kind, day: world.day, hint: `${KINDS[h.kind].label.toLowerCase()}, ${ECHO.Discover ? ECHO.Discover.hint(world, h.x, h.y) : 'somewhere in the wild'}` };
      (pl.hmaps || (pl.hmaps = [])).push(m);
      if (!pl.tracked || pl.tracked === 'off') pl.tracked = 'hmap:' + m.id;
      if (!quiet) UI().toast(`A treasure map, ${how}: it marks ${m.hint}. (Marked on your map${pl.tracked === 'hmap:' + m.id ? ', and tracked' : ''}.)`, 'legend', 6);
      return m;
    },
    trackedMap(game, id) {
      const m = (game.pl.hmaps || []).find(x => x.id === id.slice(5));
      if (!m) return null;
      return { kind: 'track', label: `✕ Treasure map: ${m.hint}`, where: { x: m.x, y: m.y, name: 'the ring on the map', vague: true } };
    },
    // ------------------------------------------------------------ hands on (E)
    interactables(game) {
      const world = game.world, pe = game.pe, out = [];
      if (pe.mounted || ECHO.Interior.cur || !world.hidden) return out;
      for (const h of world.hidden.list) {
        if (!h.found || Math.abs(h.x - pe.x) > 6 || Math.abs(h.y - pe.y) > 6) continue;
        const K = KINDS[h.kind], d = U.dist(h.x, h.y, pe.x, pe.y);
        if (K.type === 'guard' && U.dist(h.x, h.y + 1.6, pe.x, pe.y) < 2.2) out.push({ kind: 'act', label: h.taken ? `The hoard of ${h.name} is empty` : h.cleared ? `Open the hoard of ${h.name}` : `The hoard of ${h.name} — guarded`, d: 0.3, act: () => H.hoard(game, h) });
        if (K.type === 'bless' && d < 2.6) out.push({ kind: 'act', label: h.blessed ? `${U.cap(h.name)} (it has given you its gift)` : h.kind === 'silverpool' ? `Drink from ${h.name}` : `Rest under ${h.name}`, d: 0.3, act: () => H.bless(game, h) });
        if (d < 2.6) out.push({ kind: 'act', label: `Read what is left of ${h.name}`, d: 0.9, act: () => UI().modal({ title: h.name, html: `<p class="prose">${esc(H.lore(h))}</p><p class="dim">${esc(KINDS[h.kind].label)}${H.region(world, h) ? ' · ' + esc(H.region(world, h)) : ''} · found on day ${h.found}</p>`, choices: [{ label: 'Close', onPick: () => {} }] }) });
      }
      return out;
    },
    // names over the ones you have found, when you are near
    labels(game) {
      const world = game.world, pe = game.pe, out = [];
      if (!world.hidden || ECHO.Interior.cur) return out;
      for (const h of world.hidden.list) {
        if (!h.found || h.site) continue;
        const d = U.dist(h.x, h.y, pe.x, pe.y);
        if (d > 26) continue;
        const K = KINDS[h.kind], state = K.type === 'guard' ? (h.taken ? 'taken ✓' : h.cleared ? 'its hoard waits' : 'guarded') : (h.blessed ? 'blessed ✓' : K.when === 'night' ? 'gives by moonlight' : 'gives by daylight');
        out.push({ x: h.x, y: h.y - 1.8, text: `${K.icon} ${h.name} · ${state}`, color: h.taken || h.blessed ? '#9a9080' : K.col, a: U.clamp(1.3 - d / 26, 0.45, 1) });
      }
      return out;
    },
    // ones near (x, y), for the renderer and the map
    near(world, x, y, r) { return world.hidden ? world.hidden.list.filter(h => Math.abs(h.x - x) < r && Math.abs(h.y - y) < r) : []; },
    nearby(game) {
      const world = game.world, pe = game.pe, pl = game.pl, out = [];
      if (!world.hidden) return out;
      for (const h of world.hidden.list) {
        if (!h.found || h.site || U.dist(h.x, h.y, pe.x, pe.y) > 80) continue;
        const K = KINDS[h.kind];
        out.push({ k: 'hidden', icon: K.icon, name: h.name, sub: K.type === 'guard' ? (h.taken ? 'its hoard taken' : h.cleared ? 'its hoard waits — open it' : `guarded by ${K.champName}`) : (h.blessed ? 'it has given you its gift' : K.when === 'night' ? 'gives by moonlight, once' : 'gives by daylight, once'), x: h.x, y: h.y, done: !!(h.taken || h.blessed) });
      }
      for (const m of (pl.hmaps || [])) out.push({ k: 'map', icon: '✕', name: 'Treasure map', sub: m.hint, x: m.x, y: m.y, track: 'hmap:' + m.id });
      return out;
    }
  };

  // ------------------------------------------------------------ the Atlas
  const A = ECHO.Atlas = {
    TIERS, TITLES,
    st(pl) {
      const a = pl.atlas || (pl.atlas = { n: 0, kinds: {}, tier: 0, boon: { hp: 0, mana: 0, speed: 0 }, maps: 0, since: null });
      a.boon = a.boon || { hp: 0, mana: 0, speed: 0 }; a.kinds = a.kinds || {};
      return a;
    },
    // everything you have ever found
    parts(world, pl) {
      const a = pl.atlas || {}, W = ECHO.Wonders;
      return [
        ['Hidden places', a.n || 0],
        ['Dungeons and landmarks', pl.discovered || 0],
        ['Caches', pl.cachesFound || 0],
        ['Secrets of the wild', pl.secretsFound || 0],
        ['Echoes of the old world', W && W.found && world ? W.found(world) : 0]
      ];
    },
    count(world, pl) { return A.parts(world, pl).reduce((s, p) => s + p[1], 0); },
    need(i) { return i < TIERS.length ? TIERS[i] : TIERS[TIERS.length - 1] + 200 * (i - TIERS.length + 1); },
    next(pl) { return A.need(A.st(pl).tier); },
    title(pl) { const t = pl.atlas ? pl.atlas.tier : 0; let best = null; for (const k in TITLES) if (t >= +k) best = TITLES[k]; return best; },
    // what it does for you, for good
    lifeMul(pl) { const a = pl.atlas; if (!a) return 1; return 1 + Math.min(15, a.tier) * 0.01 + ((a.boon && a.boon.hp) || 0); },
    manaMul(pl) { const a = pl.atlas; return a && a.boon ? 1 + (a.boon.mana || 0) : 1; },
    speedMul(pl) { const a = pl.atlas; if (!a) return 1; return 1 + Math.min(10, a.tier) * 0.01 + ((a.boon && a.boon.speed) || 0); },
    sense(pl) { const t = pl.atlas ? pl.atlas.tier : 0; return 22 + 3 * Math.min(6, t); },
    rumours(pl) { return !!(pl.atlas && pl.atlas.tier >= 5); },
    pay(i) { const me = H.plv(); return Math.round(Math.max(150, me * 220) * i); },
    // milestones reached: paid, all at once if a save from before has passed several
    check(game) {
      const world = game.world, pl = game.pl, a = A.st(pl), n = A.count(world, pl);
      if (n < A.need(a.tier)) return null;
      const got = [], fresh = a.since == null;
      let gold = 0, relics = 0, maps = 0;
      while (n >= A.need(a.tier)) {
        a.tier++;
        const i = a.tier;
        gold += A.pay(i);
        if (i % 3 === 0) relics++;
        if (i >= 2) maps++;
        got.push(i);
      }
      a.since = world.day || 1;
      pl.gold += gold;
      const pe = game.pe;
      if (ECHO.Arcana && pe) for (let k = 0; k < Math.min(3, relics); k++) ECHO.Arcana.drop(game, pe.x + 0.8 * (k + 1), pe.y + 0.6, H.plv() + 1, { boost: 30, floor: 'epic', where: 'with the thanks of the archive, for your Atlas' });
      let mapsGiven = 0;
      for (let k = 0; k < Math.min(2, maps); k++) if (H.giveMap(game, pe ? pe.x : 0, pe ? pe.y : 0, 'from the archive', true)) mapsGiven++;
      if (ECHO.PlayerCtl) { ECHO.PlayerCtl.derivedT = 0; ECHO.PlayerCtl.computeDerived(game); }
      const t = A.title(pl), last = got[got.length - 1];
      const bits = [`${gold.toLocaleString('en-US')} crowns`, `life +${Math.min(15, a.tier)}% and stride +${Math.min(10, a.tier)}% in all, for good`];
      if (relics) bits.push(relics === 1 ? 'a relic' : `${Math.min(3, relics)} relics`);
      if (mapsGiven) bits.push(mapsGiven === 1 ? 'a treasure map' : `${mapsGiven} treasure maps`);
      if (a.tier <= 6) bits.push(`you sense hidden places from ${A.sense(pl)} leagues`);
      if (got.includes(5)) bits.push('rumours of hidden places now show on your map');
      if (ECHO.Music) ECHO.Music.stinger('star');
      later(() => UI().banner(got.length > 1 ? `The Atlas: ${got.length} milestones` : `The Atlas: ${A.need(last - 1)} discoveries`, `${t ? 'you are called ' + t + ' · ' : ''}${bits.join(' · ')}`, true), fresh && got.length > 1 ? 2500 : 400);
      UI().toast(`Your Atlas: ${n} discoveries${got.length > 1 ? ` — ${got.length} milestones passed at once` : ''}. ${bits.join('; ')}. Next at ${A.next(pl)}.`, 'legend', 9);
      if (t && TITLES[last] && ECHO.Chronicle) ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} has found ${n} places no map showed. Travellers call them ${t}.`, importance: 2, rep: 3, tag: 'explore' });
      return { got, gold };
    },
    html(game) {
      const world = game.world, pl = game.pl, a = A.st(pl), n = A.count(world, pl), t = A.title(pl);
      const nx = A.next(pl), prev = a.tier ? A.need(a.tier - 1) : 0, pct = U.clamp((n - prev) / Math.max(1, nx - prev), 0, 1);
      return `<div class="card"><h4 style="color:#ffe08a">✦ The Atlas${t ? ` · <span class="gold">${esc(t)}</span>` : ''}</h4><div style="font-size:13px"><b class="gold">${n}</b> discoveries · next milestone at ${nx} <span class="dim">(${A.pay(a.tier + 1).toLocaleString('en-US')} crowns and more)</span></div><div style="height:6px;background:#2a2620;border-radius:3px;margin:4px 0"><div style="height:6px;width:${Math.round(pct * 100)}%;background:#ffd27a;border-radius:3px"></div></div><div class="dim" style="font-size:12px">${A.parts(world, pl).map(p => `${p[0]} ${p[1]}`).join(' · ')}${a.tier ? ` · life +${Math.round((A.lifeMul(pl) - 1) * 100)}%, stride +${Math.round((A.speedMul(pl) - 1) * 100)}%${a.boon.mana ? `, mana +${Math.round(a.boon.mana * 100)}%` : ''}` : ''}${(pl.inv.vaultkey || 0) > 0 ? ` · vault keys ${pl.inv.vaultkey}` : ''}${(pl.hmaps || []).length ? ` · treasure maps ${pl.hmaps.length}` : ''}</div></div>`;
    },
    // the journal's page of it
    journalHtml(game) {
      const world = game.world, pl = game.pl, list = world.hidden ? world.hidden.list.filter(h => h.found) : [];
      let html = `<h3 class="gold">The Atlas</h3>${A.html(game)}`;
      if ((pl.hmaps || []).length) html += `<div class="card"><h4>Treasure maps</h4>${pl.hmaps.map(m => `<div>✕ ${esc(U.cap(m.hint))}. <button class="small" data-track="hmap:${m.id}">${pl.tracked === 'hmap:' + m.id ? 'Tracked' : 'Track it'}</button></div>`).join('')}</div>`;
      if (list.length) html += `<div class="card"><h4>Hidden places you have found (${list.length})</h4>${list.slice().reverse().slice(0, 30).map(h => { const K = KINDS[h.kind], s = h.site && X().byId(world, h.site); const st = K.type === 'delve' ? (s && s.cleared ? 'its treasure taken ✓' : s && s.sealed ? 'sealed — a vault key opens it' : 'a dungeon: go down') : K.type === 'guard' ? (h.taken ? 'its hoard taken ✓' : h.cleared ? 'its hoard waits' : `guarded by ${K.champName}`) : (h.blessed ? 'its gift given ✓' : K.when === 'night' ? 'gives by moonlight' : 'gives by daylight'); return `<div style="margin:4px 0"><b style="color:${K.col}">${K.icon} ${esc(h.name)}</b> <span class="dim">· ${esc(K.label)}${H.region(world, h) ? ' in ' + esc(H.region(world, h)) : ''} · ${st}</span><div class="prose dim" style="font-size:12px">${esc(H.lore(h))}</div></div>`; }).join('')}</div>`;
      else html += `<div class="card dim">No hidden places yet. They are everywhere: you feel one before you see it.</div>`;
      return html;
    }
  };

  if (ECHO.Explore && ECHO.Explore.DELVES) for (const k in DELVE_DEFS) if (!ECHO.Explore.DELVES[k]) ECHO.Explore.DELVES[k] = DELVE_DEFS[k];
  if (ECHO.Pastimes) {
    ECHO.Pastimes.extraAct = ECHO.Pastimes.extraAct || [];
    ECHO.Pastimes.extraAct.push(game => H.interactables(game));
  }
})();
