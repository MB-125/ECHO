// Discovery: the land keeps things for those who walk it.
//
// Natural wonders — waterfalls, hot springs, crystal grottoes, the bones of
// a giant, a star's crater, a ring of pale mushrooms — that no one has
// charted. The first to find one names it, and the name becomes the world's.
// Hidden caches under cairns, in hollow trees and under loose stones; one of
// them holds the first page of a lost expedition's journal, and each page
// leads to the next. Rare herbs that grow only in certain places, at certain
// hours. And the land itself: walk enough of it and people will say so.
(function () {
  const { U, RNG } = ECHO;

  const WONDERS = {
    falls: { label: 'Waterfall', what: 'a waterfall', unnamed: 'an unnamed waterfall', desc: 'Water pours white over a lip of rock into a deep green pool. The air is cold with spray.', sugg: ['the Silver Veil', 'Thunder Steps', 'the Bride\'s Falls', 'Whitewater Stair'], suffix: 'Falls' },
    springs: { label: 'Hot springs', what: 'hot springs', unnamed: 'nameless hot springs', desc: 'Steaming pools among the rocks, warm as a bath even in winter.', sugg: ['the Warm Wells', 'Smoking Pools', 'the Kettle', 'Mistwater'], suffix: 'Springs' },
    grotto: { label: 'Crystal grotto', what: 'a crystal grotto', unnamed: 'an unnamed grotto', desc: 'A cleft in the rock lined with crystals that catch the light — and, at night, make their own.', sugg: ['the Glass Hollow', 'the Glimmering', 'Starstone Cleft', 'the Lantern Cave'], suffix: 'Grotto' },
    bones: { label: 'Giant\'s bones', what: 'the bones of a giant', unnamed: 'nameless giant\'s bones', desc: 'Ribs as tall as a house rise from the ground. Whatever this was, it was not a beast of this age.', sugg: ['the Giant\'s Rest', 'Old Bones', 'the Ribcage', 'the Sleeper'], suffix: 'Bones' },
    crater: { label: 'Star crater', what: 'a star crater', unnamed: 'an unnamed crater', desc: 'A bowl of scorched earth where a star came down long ago. Something in the middle still glints.', sugg: ['the Fallen Star', 'Starfall', 'the Burnt Bowl', 'Heaven\'s Mark'], suffix: 'Crater' },
    ring: { label: 'Fairy ring', what: 'a fairy ring', unnamed: 'a nameless fairy ring', desc: 'A perfect ring of pale mushrooms in the deep wood. The old folk say you can make a wish in it — and that the wish has a price.', sugg: ['the Pale Ring', 'the Dancing Circle', 'Hob\'s Ring', 'the Wishing Ring'], suffix: 'Ring' }
  };
  const HERBS = {
    moonpetal: { name: 'moonpetal', color: '#cfe6ff', value: 22, desc: 'opens only at night, by still water', when: 'night', tiles: ['GRASS', 'FOREST'], nearWater: true },
    emberroot: { name: 'emberroot', color: '#ff9a4a', value: 18, desc: 'grows in the cracks of hot, high rock', tiles: ['HILL'] },
    frostcap: { name: 'frostcap', color: '#e8f4ff', value: 26, desc: 'a mushroom that grows only in snow', tiles: ['SNOW'] },
    ghostcap: { name: 'ghostcap', color: '#b8f0c8', value: 20, desc: 'a pale fungus of the marshes that glows faintly', tiles: ['SWAMP'] },
    sunthistle: { name: 'sunthistle', color: '#ffe070', value: 14, desc: 'a golden thistle of the open meadows, which closes at dusk', when: 'day', tiles: ['GRASS'] },
    kingsfoil: { name: 'kingsfoil', color: '#9fe08a', value: 30, desc: 'a rare healing leaf of the old forests', tiles: ['FOREST'] }
  };
  const CACHE_KINDS = { cairn: 'a cairn of stacked stones', hollow: 'a hollow tree', loose: 'a patch of loose stones' };
  const LEADERS = [['Maren', 'Ashby', 'cartographer to the old court'], ['Tobias', 'Wren', 'a scholar of the archive'], ['Ilse', 'Varrow', 'a seeker of the old tongue'], ['Corwin', 'Hale', 'a captain of the king\'s survey']];

  const D = ECHO.Discover = {
    WONDERS, HERBS, CACHE_KINDS,
    // ------------------------------------------------------------ placement (lazy, seeded — old worlds get them too)
    ensure(world) {
      if (world._wild) return;
      world._wild = 1;
      const rng = new RNG((world.seed ^ 0x51ea) >>> 0);
      const T = ECHO.TILE;
      const sites = world.sites || [];
      const near = (x, y, r, set) => { let n = 0; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (set.includes(ECHO.World.tile(world, x + dx, y + dy))) n++; return n; };
      const clear = (x, y, d) => world.settlements.every(s => U.dist(s.x, s.y, x, y) > d) && world.camps.every(c => U.dist(c.x, c.y, x, y) > 9) && world.lairs.every(l => U.dist(l.x, l.y, x, y) > 10) && world.ruins.every(r => U.dist(r.x, r.y, x, y) > 8) && sites.every(o => U.dist(o.x, o.y, x, y) > 14);
      const standable = (x, y) => [T.GRASS, T.FOREST, T.HILL, T.SAND, T.SNOW, T.SWAMP].includes(ECHO.World.tile(world, x, y)) && !ECHO.World.isSolid(world, x + 0.5, y + 0.5);
      const want = [['falls', 1], ['springs', 1], ['grotto', 1], ['bones', 1], ['crater', 1], ['ring', 1]];
      for (const [kind, n] of want) for (let k = 0; k < n; k++) {
        let best = null, bs = -Infinity;
        for (let i = 0; i < 900; i++) {
          const x = rng.int(8, world.W - 9), y = rng.int(8, world.H - 9);
          if (!standable(x, y) || !clear(x, y, 19)) continue;
          let sc = rng.next() * 2;
          const water = near(x, y, 2, [T.WATER, T.DEEP]), high = near(x, y, 3, [T.HILL, T.ROCK, T.SNOW]), wood = near(x, y, 3, [T.FOREST, T.TREE]);
          if (kind === 'falls') sc += (water ? 3 + water * 0.2 : -8) + high * 0.3;
          if (kind === 'springs') sc += high * 0.4 + (ECHO.World.tile(world, x, y) === T.HILL ? 2 : 0);
          if (kind === 'grotto') sc += high * 0.35 + near(x, y, 2, [T.ROCK]) * 0.6;
          if (kind === 'bones') sc += near(x, y, 3, [T.SAND, T.GRASS]) * 0.1 + Math.min(...world.settlements.map(s => U.dist(s.x, s.y, x, y))) * 0.04;
          if (kind === 'crater') sc += near(x, y, 2, [T.GRASS, T.HILL]) * 0.15;
          if (kind === 'ring') sc += wood * 0.3 - (wood < 8 ? 4 : 0);
          if (sc > bs) { bs = sc; best = { x, y }; }
        }
        if (!best) continue;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const t = ECHO.World.tile(world, best.x + dx, best.y + dy); if (t === T.TREE) ECHO.World.setTile(world, best.x + dx, best.y + dy, T.FOREST); }
        const W = WONDERS[kind];
        sites.push({ id: 'site' + sites.length, cat: 'wonder', kind, name: W.unnamed, unnamed: true, x: best.x + 0.5, y: best.y + 0.5, found: false, cleared: false, used: {} });
      }
      // hidden caches
      const caches = world.caches = [];
      for (let i = 0; i < 4000 && caches.length < 20; i++) {
        const x = rng.int(8, world.W - 9), y = rng.int(8, world.H - 9);
        if (!standable(x, y) || !clear(x, y, 9) || caches.some(c => U.dist(c.x, c.y, x, y) < (i < 2000 ? 12 : 8))) continue;
        const t = ECHO.World.tile(world, x, y);
        const kind = t === T.FOREST && rng.chance(0.6) ? 'hollow' : rng.chance(0.5) ? 'cairn' : 'loose';
        caches.push({ id: 'cache' + caches.length, kind, x: x + 0.5, y: y + 0.5, found: false });
      }
      // a lost expedition, whose journal is scattered among them
      const L = LEADERS[rng.int(0, LEADERS.length - 1)];
      world.expedition = { first: L[0], last: L[1], title: L[2], pages: [], next: null, done: false, year: ECHO.TIME.dateOf(world.day).year - 40 - rng.int(0, 30) };
      // rare herbs, by the ground they like
      const herbs = world.herbs = [];
      for (let i = 0; i < 1600 && herbs.length < 46; i++) {
        const x = rng.int(6, world.W - 7), y = rng.int(6, world.H - 7);
        if (!standable(x, y) || herbs.some(h => U.dist(h.x, h.y, x, y) < 6) || world.settlements.some(s => U.dist(s.x, s.y, x, y) < 9)) continue;
        const tn = Object.keys(T).find(k => T[k] === ECHO.World.tile(world, x, y));
        const fits = Object.keys(HERBS).filter(k => HERBS[k].tiles.includes(tn) && (!HERBS[k].nearWater || near(x, y, 2, [T.WATER])));
        if (!fits.length) continue;
        herbs.push({ k: fits[rng.int(0, fits.length - 1)], x: x + 0.5 + (rng.next() - 0.5) * 0.4, y: y + 0.5 + (rng.next() - 0.5) * 0.4, picked: -99 });
      }
      ECHO.World.rebuildBlocked(world);
      world._tileEpoch = (world._tileEpoch || 0) + 1;
    },
    title(site) { return site.name; },
    suggestions(world, site, pl) {
      const W = WONDERS[site.kind];
      const used = new Set((world.sites || []).map(s => s.name));
      const reg = ECHO.World.regionAt(world, site.x, site.y);
      const own = [`${pl.last}'s ${W.suffix}`, ...W.sugg, reg ? `the ${W.suffix} of ${reg.name.replace(/^the /, '')}` : null].filter(n => n && !used.has(n));
      return own.slice(0, 4);
    },
    // The first to chart it names it.
    name(world, site, name, pl) {
      site.name = name.trim().slice(0, 28) || site.name; site.unnamed = false; site.namedBy = pl ? pl.first + ' ' + pl.last : null; site.namedDay = world.day;
      if (pl) {
        pl.charted = (pl.charted || 0) + 1; pl.renown += 5;
        const reg = ECHO.World.regionAt(world, site.x, site.y);
        ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} was the first to chart ${site.name}, ${WONDERS[site.kind].what}${reg ? ' in ' + reg.name : ''}.`, importance: 2, x: site.x, y: site.y, rep: 3, tag: 'explore' });
      }
    },

    // ------------------------------------------------------------ the lost expedition
    // A page is found: the next one is somewhere else, and the page says roughly where.
    pageTexts(world) {
      const E = world.expedition;
      const who = `${E.first} ${E.last}`;
      return [
        `"Year ${E.year}. We set out from the capital, six of us, to map the wild country for the crown. ${who}, ${E.title}, keeping this journal. I mean to leave a copy of every page as we go, under stones, in case the worst happens."`,
        `"The guide, Pell, says no one has walked this far in a hundred years. We found a carved stone with runes no scholar knows. At night the wolves sing very close. Two of the porters want to turn back."`,
        `"The porters left in the night and took half the food. Four of us now. We are following the old road the stone spoke of — it runs under the grass, you can feel the paving with a stick."`,
        `"Pell is dead. A fever, then nothing. We buried him with his boots on, which he would have hated. There is something ahead — the road ends at a door in the hillside."`,
        `"We are going in tomorrow. If anyone reads this: I have left the survey — every map, every note — at our last camp. It is the only thing that matters. Tell the archive. ${E.first}."`
      ];
    },
    dirWord(fx, fy, tx, ty) {
      const a = Math.atan2(ty - fy, tx - fx);
      return ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'][((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
    },
    // Where to hide the next page: an unfound cache a fair walk away.
    nextCache(world, from, rng) {
      const cands = world.caches.filter(c => !c.found && !c.page && U.dist(c.x, c.y, from.x, from.y) > 20 && U.dist(c.x, c.y, from.x, from.y) < 75);
      const pool = cands.length ? cands : world.caches.filter(c => !c.found && !c.page);
      if (!pool.length) return null;
      return pool[Math.floor(rng.next() * pool.length)];
    },
    hint(world, x, y) {
      // describe a place by the nearest thing anyone would know
      const known = [...world.settlements.map(s => ({ x: s.x, y: s.y, name: s.name })), ...(world.sites || []).filter(s => s.found && !s.unnamed).map(s => ({ x: s.x, y: s.y, name: s.name }))];
      known.sort((a, b) => U.dist(a.x, a.y, x, y) - U.dist(b.x, b.y, x, y));
      const k = known[0];
      if (!k) return 'somewhere in the wilds';
      const d = U.dist(k.x, k.y, x, y);
      return `${d < 12 ? 'close by' : d < 25 ? 'a short walk' : 'a long walk'} ${D.dirWord(k.x, k.y, x, y)} of ${k.name}`;
    },
    // A page was found in this cache. Returns { text, next } for the player.
    takePage(world, cache, rng) {
      const E = world.expedition;
      const texts = D.pageTexts(world);
      const i = E.pages.length;
      E.pages.push({ cache: cache.id, d: world.day });
      cache.page = i + 1;
      const text = texts[i];
      if (i + 1 < texts.length) {
        const nx = D.nextCache(world, cache, rng);
        if (nx) { nx.page = i + 2; E.next = { cache: nx.id, x: nx.x, y: nx.y, hint: D.hint(world, nx.x, nx.y) }; }
        else E.next = null;
      } else {
        // the last camp: somewhere far and quiet
        let best = null, bs = -1;
        for (let k = 0; k < 400; k++) {
          const x = rng.int(10, world.W - 11), y = rng.int(10, world.H - 11);
          if (ECHO.World.isSolid(world, x + 0.5, y + 0.5) || ![ECHO.TILE.GRASS, ECHO.TILE.FOREST, ECHO.TILE.HILL, ECHO.TILE.SAND].includes(ECHO.World.tile(world, x, y))) continue;
          const sc = Math.min(...world.settlements.map(s => U.dist(s.x, s.y, x, y)));
          if (sc > bs && U.dist(x, y, cache.x, cache.y) < 80) { bs = sc; best = { x: x + 0.5, y: y + 0.5 }; }
        }
        E.camp = best ? { ...best, found: false } : null;
        E.next = best ? { camp: true, x: best.x, y: best.y, hint: D.hint(world, best.x, best.y) } : null;
      }
      return { text, page: i + 1, of: texts.length, next: E.next };
    },
    // What the player finds when they search a cache.
    search(world, cache, pl, rng) {
      if (cache.found) return null;
      cache.found = true; cache.foundDay = world.day;
      pl.cachesFound = (pl.cachesFound || 0) + 1;
      const E = world.expedition;
      const out = { items: [], page: null };
      // the first cache anyone searches starts the trail; afterwards, pages are where the journal said
      if (E && !E.done && (cache.page || (!E.pages.length && !E.next))) out.page = D.takePage(world, cache, rng);
      const g = 8 + rng.int(0, 30); pl.gold += g; out.items.push(`${g} crowns`);
      const r = rng.next();
      if (r < 0.3) { pl.inv.arrows = (pl.inv.arrows || 0) + 8; out.items.push('8 arrows'); }
      else if (r < 0.55) { pl.inv.herbs = (pl.inv.herbs || 0) + 2; out.items.push('2 bundles of herbs'); }
      else if (r < 0.7) { pl.inv.food = (pl.inv.food || 0) + 2; out.items.push('dried food'); }
      else if (r < 0.8) { pl.inv.starshard = (pl.inv.starshard || 0) + 1; out.items.push('a shard of star-iron'); }
      return out;
    },
    // The last camp of the expedition.
    camp(world, pl) {
      const E = world.expedition;
      if (!E || !E.camp || E.camp.found) return null;
      E.camp.found = true; E.done = true; E.next = null;
      pl.compass = true; pl.renown += 15;
      for (const s of world.sites || []) if (!s.found) s.seen = true;
      for (const c of world.caches || []) c.seen = true;
      ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} found the last camp of ${E.first} ${E.last}'s lost expedition, missing ${ECHO.TIME.dateOf(world.day).year - E.year} years, and brought the survey home.`, importance: 3, x: E.camp.x, y: E.camp.y, rep: 8, tag: 'explore' });
      return true;
    },

    // ------------------------------------------------------------ herbs
    herbReady(world, h, night) {
      const H = HERBS[h.k];
      if (world.day - h.picked < 12) return false;
      if (H.when === 'night' && !night) return false;
      if (H.when === 'day' && night) return false;
      return true;
    },
    pick(world, h, pl) {
      h.picked = world.day;
      pl.herbarium = pl.herbarium || {};
      const first = !pl.herbarium[h.k];
      pl.herbarium[h.k] = (pl.herbarium[h.k] || 0) + 1;
      pl.rareHerbs = pl.rareHerbs || {};
      pl.rareHerbs[h.k] = (pl.rareHerbs[h.k] || 0) + 1;
      pl.inv.herbs = (pl.inv.herbs || 0) + 1;
      return first;
    },
    // An herbalist buys what you carry.
    sellHerbs(world, pl, npc) {
      let total = 0; const names = [];
      for (const k in (pl.rareHerbs || {})) { const n = pl.rareHerbs[k]; if (!n) continue; total += n * HERBS[k].value; names.push(`${n} ${HERBS[k].name}`); pl.rareHerbs[k] = 0; }
      if (!total) return 0;
      pl.gold += total; if (npc) { npc.op[pl.charId] = (npc.op[pl.charId] || 0) + 8; }
      const s = npc && ECHO.Sim.settlement(world, npc.loc || npc.home);
      if (s) s.stock.herbs = (s.stock.herbs || 0) + 4;
      return { total, names };
    },

    // ------------------------------------------------------------ the land itself
    landCells(world) {
      if (world._landCells) return world._landCells;
      const cw = Math.ceil(world.W / 4), ch = Math.ceil(world.H / 4);
      let n = 0;
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const t = ECHO.World.tile(world, x * 4 + 2, y * 4 + 2); if (t !== ECHO.TILE.DEEP) n++; }
      return (world._landCells = n);
    },
    explored(world, pl) {
      if (!pl.explored) return 0;
      let n = 0; for (let i = 0; i < pl.explored.length; i++) if (pl.explored[i]) n++;
      return Math.min(1, n / Math.max(1, D.landCells(world)));
    },
    MILESTONES: [[0.15, 'the roads near home'], [0.3, 'much of the land'], [0.5, 'half the world'], [0.75, 'nearly every corner'], [0.9, 'all of it']],
    milestone(world, pl) {
      const f = D.explored(world, pl);
      pl.milestones = pl.milestones || 0;
      const M = D.MILESTONES[pl.milestones];
      if (!M || f < M[0]) return null;
      pl.milestones++;
      pl.renown += 4 * pl.milestones;
      if (pl.milestones >= 3) ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} has walked ${M[1]}. Travellers begin to ask them the way.`, importance: 2, rep: 3, tag: 'explore' });
      return { pct: Math.round(f * 100), words: M[1], step: pl.milestones };
    }
  };
})();
