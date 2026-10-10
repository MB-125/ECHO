// Homestead: land of your own, and everything you can make of it.
//
// Out in the wild, well away from any town, make camp (B) and stake a claim.
// A tent to begin with. Then, with timber, ore and coin, raise it into a
// farm: a cabin to sleep in, a fence, garden plots, a well, a chicken coop, a
// pen for goats or sheep, a workshop. Plant wheat, cabbages, flax, pumpkins
// and herbs, and watch them grow through the days — slower in Frost, faster
// with a well, sometimes raided by gnawers. The hens lay, the goats give milk,
// the sheep give wool, and it all goes into your store. Open a shop at the
// gate and travellers buy what you grow; hire a wagon and a driver and run a
// trade caravan between two towns, with guards if the road is bad.
//
// And when the place is big enough, families ask to settle. Pay for a
// charter and your homestead becomes a real village on the map, with you as
// its warden — houses, a reeve, settlers, dues, and everything a village can
// become.
(function () {
  const { U } = ECHO;
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const T = ECHO.TILE;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // what you can build, what it costs, how long the hired hands take (in game hours)
  const BUILDS = {
    cabin: { name: 'A log cabin', cost: { gold: 40, timber: 6 }, hours: 18, desc: 'Four walls, a roof and a hearth. Sleep here, and a store for what the farm makes.', at: [0, -1.5] },
    fence: { name: 'A split-rail fence', cost: { gold: 10, timber: 4 }, hours: 8, desc: 'Keeps the animals in and the gnawers out (mostly).', needs: 'cabin' },
    plots: { name: 'Garden plots', cost: { gold: 20, timber: 2 }, hours: 6, desc: 'Four beds of turned earth for planting.', needs: 'cabin' },
    well: { name: 'A well', cost: { gold: 30, ore: 2, timber: 2 }, hours: 12, desc: 'Water at hand: crops grow faster and shrug off drought.', needs: 'plots', at: [3.2, 0.8] },
    coop: { name: 'A chicken coop', cost: { gold: 25, timber: 3 }, hours: 6, desc: 'Six hens. Eggs most mornings.', needs: 'fence', at: [-3.4, 1.2] },
    pen: { name: 'A pen and goats', cost: { gold: 45, timber: 4 }, hours: 8, desc: 'Three goats: milk and cheese. (Buy sheep for wool later.)', needs: 'fence', at: [-3.2, -2.6] },
    workshop: { name: 'A workshop', cost: { gold: 60, timber: 6, ore: 4 }, hours: 20, desc: 'A bench and tools: spin flax to linen, and open a shop at the gate.', needs: 'cabin', at: [3.4, -2.4] },
    shop: { name: 'A shop at the gate', cost: { gold: 50, timber: 3 }, hours: 8, desc: 'Travellers stop and buy what you grow and make.', needs: 'workshop', at: [2.4, 7.3] },
    barn: { name: 'A barn', cost: { gold: 70, timber: 10 }, hours: 24, desc: 'Room for more plots and more animals.', needs: 'well', at: [-0.4, -4.6] }
  };
  const CROPS = {
    wheat: { name: 'wheat', seed: 4, days: 3, yield: ['food', 4], color: '#d8c060' },
    cabbage: { name: 'cabbages', seed: 3, days: 2, yield: ['food', 3], color: '#7ab050' },
    flax: { name: 'flax', seed: 5, days: 4, yield: ['flax', 3], color: '#8aa0d8' },
    herbs: { name: 'herbs', seed: 4, days: 2, yield: ['herbs', 3], color: '#5aa060' },
    pumpkin: { name: 'pumpkins', seed: 6, days: 5, yield: ['food', 7], color: '#e08a30' }
  };
  const SELL = { food: 3, herbs: 4, wool: 6, linen: 14, flax: 4, eggs: 2, milk: 2 };
  const SEASON_GROW = [1, 1.25, 1, 0.25];
  const pl0 = game => game.pl;

  const H = ECHO.Homestead = {
    t: 0, birds: [],
    st(pl) { return pl.stead || null; },
    // ------------------------------------------------------------ staking a claim
    claimWhy(game) {
      const world = game.world, pe = game.pe, pl = game.pl;
      if (pl.stead) return 'You already have a homestead.';
      if (ECHO.Interior.cur) return 'Not indoors.';
      const s = ECHO.World.nearestSettlement(world, pe.x, pe.y);
      if (s && U.dist(s.x, s.y, pe.x, pe.y) < 20) return `Too close to ${s.name} — the land here belongs to the town.`;
      if (world.camps.some(c => c.alive !== false && U.dist(c.x, c.y, pe.x, pe.y) < 22)) return 'Outlaws camp too close by.';
      if (ECHO.Explore.sites(world).some(o => U.dist(o.x, o.y, pe.x, pe.y) < 10)) return 'Too close to the old places.';
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const x = pe.x + dx, y = pe.y + dy, t = ECHO.World.tile(world, Math.floor(x), Math.floor(y));
        if ((ECHO.World.isSolid(world, x, y) && t !== T.TREE) || (ECHO.Water && ECHO.Water.kind(world, x, y)) || t === T.ROAD || t === T.ROCK) return 'The ground here is too broken, wet or close to the road. Find flatter, open land.';
      }
      if (pl.gold < 50) return 'Registering the claim costs 50 crowns.';
      return null;
    },
    campChoices(game) {
      const pl = game.pl;
      if (pl.stead) return [];
      const why = H.claimWhy(game);
      return [{ label: 'Stake a claim to this land', sub: why || '50 crowns to register the deed: a homestead of your own', disabled: !!why, onPick: () => H.claim(game) }];
    },
    claim(game) {
      const world = game.world, pe = game.pe, pl = game.pl;
      if (H.claimWhy(game)) return;
      pl.gold -= 50;
      const town = ECHO.World.nearestSettlement(world, pe.x, pe.y);
      const region = ECHO.World.regionAt(world, pe.x, pe.y);
      pl.stead = { x: Math.floor(pe.x) + 0.5, y: Math.floor(pe.y) + 0.5, day: world.day, name: `${pl.last}'s Holding`, builds: { tent: true }, work: [], plots: [], animals: { hens: 0, goats: 0, sheep: 0 }, store: {}, shop: null, caravan: null, coffer: 0, lastDay: world.day, log: [], near: town ? town.id : null, region: region ? region.id : null };
      H.clearLand(game, pl.stead);
      ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} staked a claim to land in ${region ? region.name : 'the wilds'}${town ? ', not far from ' + town.name : ''}.`, importance: 1, x: pe.x, y: pe.y, rep: 1 });
      game.ui.toast('The land is yours. A tent for now — press E at it to manage your homestead and start building.', 'legend', 7);
      if (ECHO.Camp) ECHO.Camp.fire = null;
    },
    // fell the trees and clear the scrub where the farm will stand
    clearLand(game, s) {
      const world = game.world;
      let n = 0;
      for (let dy = -8; dy <= 9; dy++) for (let dx = -7; dx <= 7; dx++) {
        const x = Math.floor(s.x) + dx, y = Math.floor(s.y) + dy;
        const t = ECHO.World.tile(world, x, y);
        if (t === T.FOREST || t === T.TREE || t === T.SWAMP) { ECHO.World.setTile(world, x, y, T.GRASS); n++; }
      }
      if (n) { pl0(game).inv.timber = (pl0(game).inv.timber || 0) + Math.min(8, Math.ceil(n / 6)); game.ui.toast(`You clear the land: felled trees give you ${Math.min(8, Math.ceil(n / 6))} timber.`, 'info', 4); }
      ECHO.World.rebuildBlocked(world);
      if (ECHO.Realm && ECHO.Realm.reshaped) ECHO.Realm.reshaped(world);
    },
    has(s, k) { return !!(s.builds[k] || s.work.some(w => w.k === k)); },
    built(s, k) { return !!s.builds[k]; },
    // ------------------------------------------------------------ building
    canBuild(game, k) {
      const s = H.st(game.pl), B = BUILDS[k], pl = game.pl;
      if (!s || !B) return 'No such thing.';
      if (H.has(s, k) && k !== 'plots') return s.builds[k] ? 'Already built.' : 'Already being built.';
      if (k === 'plots' && s.work.some(w => w.k === 'plots')) return 'Already being dug.';
      if (k === 'plots' && s.plots.length >= (s.builds.barn ? 12 : 8)) return s.builds.barn ? 'No room for more plots.' : 'No room for more plots — a barn would make room.';
      if (B.needs && !s.builds[B.needs]) return `Needs ${BUILDS[B.needs].name.toLowerCase()} first.`;
      for (const r in B.cost) { const have = r === 'gold' ? pl.gold : (pl.inv[r] || 0); if (have < B.cost[r]) return `Needs ${B.cost[r]} ${r === 'gold' ? 'crowns' : r} (you have ${Math.floor(have)}).`; }
      return null;
    },
    build(game, k) {
      const why = H.canBuild(game, k); if (why) return why;
      const s = H.st(game.pl), B = BUILDS[k], pl = game.pl, world = game.world;
      for (const r in B.cost) { if (r === 'gold') pl.gold -= B.cost[r]; else pl.inv[r] -= B.cost[r]; }
      s.work.push({ k, done: world.day * 24 + world.minute / 60 + B.hours, total: B.hours });
      return null;
    },
    // you lend a hand: the work goes faster
    help(game) {
      const s = H.st(game.pl), w = s && s.work[0]; if (!w) return;
      w.done -= 2.5;
      ECHO.Character.train(game.pl, 'endurance', 0.3);
      ECHO.Combat.burst(game.pe.x + Math.cos(game.pe.dir) * 0.6, game.pe.y + Math.sin(game.pe.dir) * 0.6, '#c8a070', 6, 2, 0.4, 2);
      if (ECHO.Sfx) ECHO.Sfx.play('hit', { pitch: 0.8, vol: 0.4 });
    },
    finishWork(game, w) {
      const s = H.st(game.pl), world = game.world;
      if (w.k === 'plots') { const n = 4; for (let i = 0; i < n && s.plots.length < (s.builds.barn ? 12 : 8); i++) s.plots.push({ crop: null, growth: 0, planted: null }); s.builds.plots = true; for (let i = 0; i < s.plots.length; i++) { const p = H.plotPos(s, i); ECHO.World.setTile(world, Math.floor(p.x), Math.floor(p.y), T.FARM); } if (ECHO.Realm && ECHO.Realm.reshaped) ECHO.Realm.reshaped(world); }
      else s.builds[w.k] = true;
      if (w.k === 'coop') s.animals.hens += 6;
      if (w.k === 'pen') s.animals.goats += 3;
      if (w.k === 'cabin') delete s.builds.tent;
      if (w.k === 'shop') s.shop = s.shop || { stock: {}, sold: 0, earned: 0 };
      s.log.unshift(`${ECHO.TIME.fmtShort ? ECHO.TIME.fmtShort(world.day) : 'Day ' + world.day}: ${BUILDS[w.k].name} finished.`); s.log.length = Math.min(s.log.length, 20);
      game.ui.toast(`${BUILDS[w.k].name} finished at ${s.name}.`, 'legend', 4);
      H.checkSettlers(game);
    },
    // ------------------------------------------------------------ fields
    plant(game, i, k) {
      const s = H.st(game.pl), pl = game.pl, C = CROPS[k], p = s.plots[i];
      if (!p || p.crop) return 'That bed is taken.';
      if (pl.gold < C.seed) return `Seed costs ${C.seed} crowns.`;
      pl.gold -= C.seed;
      p.crop = k; p.growth = 0; p.planted = game.world.day;
      return null;
    },
    harvest(game, i) {
      const s = H.st(game.pl), p = s.plots[i];
      if (!p || !p.crop || p.growth < 1) return null;
      const C = CROPS[p.crop];
      const n = C.yield[1] + (s.builds.well ? 1 : 0);
      s.store[C.yield[0]] = (s.store[C.yield[0]] || 0) + n;
      p.crop = null; p.growth = 0;
      if (ECHO.Pastimes && ECHO.Pastimes.gain) ECHO.Pastimes.gain(game, 'forage', 3);
      return `${n} ${C.yield[0] === 'food' ? 'measures of ' + C.name : C.yield[0]} into the store.`;
    },
    // ------------------------------------------------------------ the day's turn
    daily(game) {
      const s = H.st(game.pl), world = game.world, pl = game.pl;
      if (!s) return;
      const date = ECHO.TIME.dateOf(world.day);
      const wx = ECHO.Weather ? ECHO.Weather.here(world, s.x, s.y) : null;
      const grow = SEASON_GROW[date.seasonIdx] * (s.builds.well ? 1.35 : wx && wx.drought ? 0.5 : 1) * (wx && wx.today === 'rain' ? 1.15 : 1);
      const notes = [];
      for (const p of s.plots) if (p.crop) p.growth = Math.min(1, p.growth + grow / CROPS[p.crop].days);
      const ripe = s.plots.filter(p => p.crop && p.growth >= 1).length;
      if (ripe) notes.push(`${ripe} bed${ripe > 1 ? 's are' : ' is'} ready to harvest`);
      // the animals
      if (s.animals.hens) { const e = Math.max(0, Math.round(s.animals.hens * (date.seasonIdx === 3 ? 0.3 : 0.6))); s.store.eggs = (s.store.eggs || 0) + e; }
      if (s.animals.goats) s.store.milk = (s.store.milk || 0) + s.animals.goats;
      if (s.animals.sheep && date.seasonIdx === 1) s.store.wool = (s.store.wool || 0) + s.animals.sheep;
      // the workshop spins flax to linen
      if (s.builds.workshop && (s.store.flax || 0) >= 2) { s.store.flax -= 2; s.store.linen = (s.store.linen || 0) + 1; }
      // the shop sells to travellers
      if (s.shop && s.builds.shop) {
        let take = 0;
        const footfall = 3 + (s.village ? 6 : 0) + (ECHO.World.tile(world, Math.floor(s.x), Math.floor(s.y) + 4) === T.ROAD ? 2 : 0);
        for (const k of Object.keys(s.shop.stock)) {
          const n = Math.min(s.shop.stock[k], Math.ceil(footfall * (0.5 + Math.random() * 0.6)));
          if (n <= 0) continue;
          s.shop.stock[k] -= n; const g = n * (SELL[k] || 2); take += g; s.shop.sold += n;
        }
        if (take) { s.coffer += take; s.shop.earned += take; notes.push(`the shop took ${take} crowns`); }
      }
      // the caravan on the road
      const cv = s.caravan;
      if (cv && cv.active) {
        const a = world.settlements.find(t => t.id === cv.from), b = world.settlements.find(t => t.id === cv.to);
        if (a && b) {
          const diff = Math.abs((a.prices && a.prices.food || 3) - (b.prices && b.prices.food || 3)) + Math.abs(((a.prosperity || 50) - (b.prosperity || 50)) / 10);
          const dist = U.dist(a.x, a.y, b.x, b.y);
          const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          const outlaws = world.camps.some(c => c.alive !== false && U.dist(c.x, c.y, mid.x, mid.y) < 40);
          const risk = Math.max(0.02, (outlaws ? 0.22 : 0.08) - cv.guards * 0.07);
          if (Math.random() < risk) {
            const lost = Math.round(20 + dist * 0.2);
            cv.robbed = (cv.robbed || 0) + 1; cv.last = -lost;
            notes.push(`the caravan was robbed on the road to ${b.name}`);
            ECHO.Chronicle.add(world, { text: `Outlaws robbed ${pl.first} ${pl.last}'s caravan on the road between ${a.name} and ${b.name}.`, kind: 'crime', importance: 0, x: mid.x, y: mid.y });
          } else {
            const profit = Math.round(12 + diff * 6 + dist * 0.12 - cv.guards * 6);
            s.coffer += Math.max(4, profit); cv.last = profit; cv.trips = (cv.trips || 0) + 1;
            notes.push(`the caravan made ${Math.max(4, profit)} crowns between ${a.name} and ${b.name}`);
          }
          const t = cv.from; cv.from = cv.to; cv.to = t;
        }
      }
      // gnawers come for the crops now and then
      if (s.plots.some(p => p.crop) && !s.builds.fence && Math.random() < 0.25) { for (const p of s.plots) if (p.crop && Math.random() < 0.4) p.growth = Math.max(0, p.growth - 0.4); notes.push('gnawers got into the beds — a fence would help'); }
      if (notes.length && U.dist(s.x, s.y, game.pe.x, game.pe.y) > 30) game.ui.toast(`News from ${s.name}: ${notes.join('; ')}.`, 'info', 6);
      s.log.unshift(`Day ${world.day}: ${notes.join('; ') || 'a quiet day'}.`); s.log.length = Math.min(s.log.length, 20);
    },
    // ------------------------------------------------------------ people want to join you
    score(s) { return Object.keys(s.builds).filter(k => k !== 'tent').length + (s.animals.hens ? 1 : 0) + Math.min(3, Math.floor(s.plots.length / 4)); },
    checkSettlers(game) {
      const s = H.st(game.pl);
      if (!s || s.village || s.asked) return;
      if (H.score(s) >= 6) { s.asked = true; game.ui.toast(`Word of ${s.name} has spread. Families are asking if they might settle on your land. (E at your cabin: Settlers.)`, 'legend', 8); }
    },
    found(game, name) {
      const world = game.world, pl = game.pl, s = H.st(pl);
      if (!s || s.village) return 'Already a village.';
      if (pl.gold < 200) return 'A village charter costs 200 crowns.';
      const near = world.settlements.filter(t => t.faction !== 'ashfang' && t.residents && t.residents.length > 12).sort((a, b) => U.dist(a.x, a.y, s.x, s.y) - U.dist(b.x, b.y, s.x, s.y))[0];
      if (!near) return 'No town near enough to send settlers.';
      const f = world.factions[near.faction];
      if (!f) return 'No realm will grant the charter.';
      // the village rises beside the farm, not on top of it
      // far enough that its plaza, houses and farm ring never reach the fences
      let best = null;
      for (let k = 0; k < 16; k++) {
        const a = k / 16 * Math.PI * 2;
        for (const d of [22, 25, 28, 32, 36]) {
          const x = Math.round(s.x + Math.cos(a) * d), y = Math.round(s.y + Math.sin(a) * d);
          if (x < 14 || y < 14 || x > world.W - 14 || y > world.H - 14) continue;
          if (world.settlements.some(t => U.dist(t.x, t.y, x, y) < 19)) continue;
          let bad = 0, wild = 0;
          for (let dy = -6; dy <= 6; dy += 2) for (let dx = -6; dx <= 6; dx += 2) {
            const t = ECHO.World.tile(world, x + dx, y + dy);
            if (t === T.WATER || t === T.DEEP || t === T.ROCK) bad++;
            else if (t === T.SWAMP || t === T.HILL || t === T.SNOW) wild++;
          }
          const score = -bad * 4 - wild - d * 0.2;
          if (bad <= 12 && (!best || score > best.score)) best = { x, y, score };
        }
      }
      if (!best) return 'There is no open land near enough for a village to rise.';
      const vx = best.x, vy = best.y;
      const rng = new ECHO.RNG(Math.floor(Math.random() * 1e9));
      pl.gold -= 200;
      const v = ECHO.Realm.found(world, f, { x: vx, y: vy, from: near.id, name: name || null, warden: pl.charId }, rng);
      if (!v) { pl.gold += 200; return `Not enough families in ${near.name} willing to move. Try again later.`; }
      s.village = v.id;
      v.homestead = true;
      // a cart track from your gate to the new green
      const cost = (x, y, i) => { const t = world.tiles[i]; if (t === T.ROCK || t === T.DEEP) return Infinity; if (t === T.ROAD || t === T.PLAZA) return 0.4; if (t === T.WATER) return 10; if (t === T.TREE || t === T.FOREST) return 1.6; return 1; };
      const path = ECHO.World.findPath(world, Math.floor(s.x), Math.floor(s.y + 7), Math.floor(v.x), Math.floor(v.y + 1), cost, 60000);
      if (path) { for (const i of path) { const t = world.tiles[i]; if (t === T.WATER) world.tiles[i] = T.BRIDGE; else if (t !== T.PLAZA && t !== T.FARM) world.tiles[i] = T.ROAD; } ECHO.World.rebuildBlocked(world); ECHO.Realm.reshaped(world); }
      ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last}'s homestead grew into the village of ${v.name}.`, importance: 2, x: v.x, y: v.y, rep: 6, tag: 'protect' });
      return null;
    },
    // ------------------------------------------------------------ the panel
    open(game, tab0) {
      const world = game.world, pl = game.pl, s = H.st(pl);
      if (!s) return;
      let tab = tab0 || 'build';
      const UI = ECHO.UI;
      const body = UI.openPanel(s.name, '', 'stead');
      const cost = c => Object.entries(c).map(([k, v]) => `${v} ${k === 'gold' ? 'crowns' : k}`).join(', ');
      const render = () => {
        const tabs = [['build', 'Build'], ['fields', 'Fields'], ['animals', 'Animals'], ['store', 'Store'], ['business', 'Shop & caravan'], ['settle', 'Settlers']];
        let h = `<div class="tabs">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
        if (tab === 'build') {
          h += `<p class="dim">Pay for the materials and hired hands raise it over the coming hours. Press E at the work site to lend a hand and it goes faster. You have ${Math.floor(pl.gold)} crowns, ${pl.inv.timber || 0} timber, ${pl.inv.ore || 0} ore.</p>`;
          for (const w of s.work) { const left = Math.max(0, w.done - (world.day * 24 + world.minute / 60)); h += `<div class="card"><b>${esc(BUILDS[w.k].name)}</b> — being built, about ${Math.ceil(left)} hours left</div>`; }
          for (const k of Object.keys(BUILDS)) {
            const B = BUILDS[k], done = s.builds[k] && k !== 'plots';
            const why = H.canBuild(game, k);
            h += `<div class="card" style="${done ? 'opacity:0.55' : ''}"><h4>${esc(B.name)}${done ? ' — built' : ''}</h4><div>${esc(B.desc)}</div>${done ? '' : `<div class="dim">${cost(B.cost)} · ${B.hours} hours${k === 'plots' ? ` · you have ${s.plots.length} beds` : ''}</div><button class="small" data-build="${k}" ${why ? 'disabled' : ''}>${why ? esc(why) : 'Build'}</button>`}</div>`;
          }
        } else if (tab === 'fields') {
          if (!s.plots.length) h += '<p class="dim">No beds yet — build garden plots first.</p>';
          s.plots.forEach((p, i) => {
            const C = p.crop && CROPS[p.crop];
            h += `<div class="card"><b>Bed ${i + 1}</b> — ${C ? `${C.name}, ${p.growth >= 1 ? '<span class="gold">ready to harvest</span>' : Math.round(p.growth * 100) + '% grown'}` : 'empty'}<div>${C ? (p.growth >= 1 ? `<button class="small" data-harv="${i}">Harvest</button>` : '') : Object.keys(CROPS).map(k => `<button class="small" data-plant="${i}:${k}">Plant ${CROPS[k].name} (${CROPS[k].seed}c, ${CROPS[k].days}d)</button>`).join(' ')}</div></div>`;
          });
          h += '<p class="dim">Crops grow day by day — faster in Bloom, barely at all in Frost, faster still with a well. A fence keeps the gnawers out.</p>';
        } else if (tab === 'animals') {
          h += `<div class="card">Hens: ${s.animals.hens}${s.builds.coop ? ` <button class="small" data-buy="hens">Buy 3 more (20c)</button>` : ' — needs a coop'}</div>`;
          h += `<div class="card">Goats: ${s.animals.goats}${s.builds.pen ? ` <button class="small" data-buy="goats">Buy a goat (18c)</button>` : ' — needs a pen'}</div>`;
          h += `<div class="card">Sheep: ${s.animals.sheep}${s.builds.pen ? ` <button class="small" data-buy="sheep">Buy a sheep (24c)</button>` : ' — needs a pen'} <span class="dim">(wool in Bloom)</span></div>`;
        } else if (tab === 'store') {
          const items = Object.entries(s.store).filter(([, n]) => n > 0);
          h += `<p class="dim">What the farm has made. Take it with you, or stock the shop.${s.coffer ? ` The strongbox holds <b>${s.coffer}</b> crowns.` : ''}</p>`;
          h += items.length ? items.map(([k, n]) => `<div class="card"><b>${n} ${esc(k)}</b> ${['linen', 'wool', 'flax'].includes(k) ? `<button class="small" data-sellk="${k}">Sell to a passing trader (${Math.round(n * SELL[k] * 0.7)}c)</button>` : `<button class="small" data-take="${k}">Take</button>`}${s.shop && s.builds.shop ? ` <button class="small" data-stock="${k}">Put in the shop</button>` : ''}</div>`).join('') : '<div class="card">Empty.</div>';
          if (s.coffer) h += `<button data-coffer="1">Take the ${s.coffer} crowns from the strongbox</button>`;
          h += `<h4 class="gold">Diary</h4>${s.log.slice(0, 8).map(l => `<div class="dim">${esc(l)}</div>`).join('')}`;
        } else if (tab === 'business') {
          if (s.shop && s.builds.shop) h += `<div class="card"><h4>The shop</h4><div>On the shelves: ${Object.entries(s.shop.stock).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(', ') || 'nothing'}. Sold ${s.shop.sold} things for ${s.shop.earned} crowns so far.</div><div class="dim">Stock it from the Store tab. Takings go to the strongbox each day.</div></div>`;
          else h += '<div class="card dim">No shop yet — build a workshop, then a shop at the gate.</div>';
          const cv = s.caravan;
          if (cv) {
            const a = world.settlements.find(t => t.id === cv.from), b = world.settlements.find(t => t.id === cv.to);
            h += `<div class="card"><h4>Your caravan</h4><div>${cv.active ? `Trading between ${esc(a ? a.name : '?')} and ${esc(b ? b.name : '?')}` : 'Standing idle'} · ${cv.guards} guard${cv.guards === 1 ? '' : 's'} · ${cv.trips || 0} trips${cv.robbed ? `, robbed ${cv.robbed} time${cv.robbed > 1 ? 's' : ''}` : ''}${cv.last != null ? ` · last trip ${cv.last >= 0 ? '+' : ''}${cv.last}c` : ''}</div>
              <button class="small" data-cv="guard" ${cv.guards >= 3 ? 'disabled' : ''}>Hire a guard (30c)</button> <button class="small" data-cv="route">Choose a new route</button></div>`;
          } else h += `<div class="card"><h4>A trade caravan</h4><div>A wagon, a mule and a driver who knows the roads: it trades between two towns of your choosing and the profit comes back to your strongbox each day. Outlaws on the road may rob it — hire guards.</div><button class="small" data-cv="buy" ${pl.gold < 150 ? 'disabled' : ''}>Buy a caravan (150c)</button></div>`;
          if (tab === 'business' && H.pickRoute) {
            const towns = world.settlements.filter(t => t.faction !== 'ashfang').sort((a, b) => U.dist(a.x, a.y, s.x, s.y) - U.dist(b.x, b.y, s.x, s.y)).slice(0, 8);
            h += `<h4>Route: from</h4>${towns.map(t => `<button class="small" data-rf="${t.id}" ${H.pickRoute.from === t.id ? 'style="outline:2px solid gold"' : ''}>${esc(t.name)}</button>`).join(' ')}<h4>to</h4>${towns.map(t => `<button class="small" data-rt="${t.id}" ${H.pickRoute.from === t.id ? 'disabled' : ''}>${esc(t.name)}</button>`).join(' ')}`;
          }
        } else if (tab === 'settle') {
          if (s.village) { const v = world.settlements.find(t => t.id === s.village); h += `<div class="card">Your homestead has grown into the village of <b>${esc(v ? v.name : '?')}</b>, and you are its warden. Build it up from its notice board or by talking to the reeve.</div>`; }
          else {
            const sc = H.score(s);
            h += `<p>Every building, bed and flock makes ${esc(s.name)} more of a place people would want to live. When it is grown enough (${sc}/6), families will ask to settle — and with a royal charter (200 crowns) your homestead becomes a real village on the map, with houses, a reeve, and you as its warden.</p>`;
            h += s.asked ? `<div class="card"><h4>Found a village</h4><div>Settlers will come from the nearest town. The village rises beside your farm.</div><button data-found="1" ${pl.gold < 200 ? 'disabled' : ''}>Pay 200 crowns for the charter</button></div>` : `<div class="card dim">Not yet. Keep building.</div>`;
          }
        }
        body.innerHTML = h;
        body.querySelectorAll('button[data-tab]').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; render(); }));
        body.querySelectorAll('button[data-build]').forEach(b => b.addEventListener('click', () => { const why = H.build(game, b.dataset.build); if (why) UI.toast(why, 'warn', 3); else UI.toast(`Work begins: ${BUILDS[b.dataset.build].name.toLowerCase()}.`, 'info', 3); render(); }));
        body.querySelectorAll('button[data-plant]').forEach(b => b.addEventListener('click', () => { const [i, k] = b.dataset.plant.split(':'); const why = H.plant(game, +i, k); if (why) UI.toast(why, 'warn', 2); render(); }));
        body.querySelectorAll('button[data-harv]').forEach(b => b.addEventListener('click', () => { const t = H.harvest(game, +b.dataset.harv); if (t) UI.toast(t, 'info', 3); render(); }));
        body.querySelectorAll('button[data-buy]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.buy, c = { hens: 20, goats: 18, sheep: 24 }[k]; if (pl.gold < c) return UI.toast(`${c} crowns.`, 'warn', 2); pl.gold -= c; s.animals[k] += k === 'hens' ? 3 : 1; render(); }));
        body.querySelectorAll('button[data-take]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.take, n = s.store[k]; s.store[k] = 0; const into = { eggs: 'food', milk: 'food', flax: 'flax', linen: 'linen', wool: 'wool' }[k] || k; pl.inv[into] = (pl.inv[into] || 0) + (k === 'eggs' || k === 'milk' ? Math.ceil(n / 2) : n); UI.toast(`You take ${n} ${k}.`, 'info', 2); render(); }));
        body.querySelectorAll('button[data-sellk]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.sellk, g = Math.round(s.store[k] * SELL[k] * 0.7); s.store[k] = 0; pl.gold += g; if (ECHO.Sfx) ECHO.Sfx.play('coin'); UI.toast(`+${g} crowns.`, 'info', 2); render(); }));
        body.querySelectorAll('button[data-stock]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.stock; s.shop.stock[k] = (s.shop.stock[k] || 0) + s.store[k]; s.store[k] = 0; render(); }));
        body.querySelectorAll('button[data-coffer]').forEach(b => b.addEventListener('click', () => { pl.gold += s.coffer; UI.toast(`+${s.coffer} crowns.`, 'legend', 2); if (ECHO.Sfx) ECHO.Sfx.play('coin'); s.coffer = 0; render(); }));
        body.querySelectorAll('button[data-cv]').forEach(b => b.addEventListener('click', () => {
          const k = b.dataset.cv;
          if (k === 'buy') { if (pl.gold < 150) return; pl.gold -= 150; s.caravan = { active: false, guards: 0, trips: 0 }; H.pickRoute = { from: null }; }
          if (k === 'guard' && pl.gold >= 30) { pl.gold -= 30; s.caravan.guards++; }
          if (k === 'route') H.pickRoute = { from: null };
          render();
        }));
        body.querySelectorAll('button[data-rf]').forEach(b => b.addEventListener('click', () => { H.pickRoute.from = b.dataset.rf; render(); }));
        body.querySelectorAll('button[data-rt]').forEach(b => b.addEventListener('click', () => { if (!H.pickRoute.from) return UI.toast('Choose where it sets out from first.', 'info', 2); s.caravan.from = H.pickRoute.from; s.caravan.to = b.dataset.rt; s.caravan.active = true; H.pickRoute = null; UI.toast('The caravan sets out. Profits come to your strongbox each day.', 'legend', 4); render(); }));
        body.querySelectorAll('button[data-found]').forEach(b => b.addEventListener('click', () => { const why = H.found(game); UI.toast(why || `The settlers are coming. Your village stands!`, why ? 'warn' : 'legend', 6); render(); }));
      };
      render();
    },
    // ------------------------------------------------------------ E at the homestead
    interactables(game) {
      const pl = game.pl, pe = game.pe, s = H.st(pl), out = [];
      if (!s || pe.mounted || ECHO.Interior.cur) return out;
      const d = U.dist(s.x, s.y, pe.x, pe.y);
      if (d > 7) return out;
      const home = s.builds.cabin ? { x: s.x, y: s.y - 1.5 } : { x: s.x, y: s.y };
      if (U.dist(home.x, home.y, pe.x, pe.y) < 2.4) {
        out.push({ kind: 'act', label: `Manage ${s.name}`, d: 0.2, act: () => H.open(game) });
        if (s.builds.cabin) out.push({ kind: 'act', label: game.isNight() ? 'Sleep in your cabin until morning' : 'Rest in your cabin a few hours', d: 0.6, act: () => { if (ECHO.Camp) { ECHO.Camp.fire = { x: home.x, y: home.y + 1, fuel: 900, out: false }; ECHO.Camp.rest(game, game.isNight() ? 'dawn' : 3); } } });
      }
      if (s.work.length && d < 6) out.push({ kind: 'act', label: `Lend a hand (${BUILDS[s.work[0].k].name.toLowerCase()})`, d: 0.5, act: () => H.help(game) });
      // the beds
      for (let i = 0; i < s.plots.length; i++) {
        const p = H.plotPos(s, i); if (U.dist(p.x, p.y, pe.x, pe.y) > 1.1) continue;
        const pp = s.plots[i];
        if (pp.crop && pp.growth >= 1) out.push({ kind: 'act', label: `Harvest the ${CROPS[pp.crop].name}`, d: 0.2, act: () => { const t = H.harvest(game, i); if (t) game.ui.toast(t, 'info', 3); } });
        else if (!pp.crop) out.push({ kind: 'act', label: 'Plant this bed…', d: 0.3, act: () => H.open(game, 'fields') });
        break;
      }
      return out;
    },
    plotPos(s, i) { const col = i % 4, row = Math.floor(i / 4); return { x: s.x - 2.2 + col * 1.5, y: s.y + 1.8 + row * 1.5 }; },
    // ------------------------------------------------------------ each frame
    update(game, dt) {
      const pl = game.pl, world = game.world, s = pl && H.st(pl);
      if (!s) return;
      const now = world.day * 24 + world.minute / 60;
      for (const w of s.work.slice()) if (now >= w.done) { s.work.splice(s.work.indexOf(w), 1); H.finishWork(game, w); }
      if (s.lastDay !== world.day) { const n = Math.min(5, world.day - s.lastDay); s.lastDay = world.day; for (let i = 0; i < n; i++) H.daily(game); }
      // chimney smoke and the hens about the yard
      const pe = game.pe;
      if (U.dist(s.x, s.y, pe.x, pe.y) < 50 && !ECHO.Interior.cur) {
        if (s.builds.cabin && Math.random() < dt * 1.2) ECHO.Combat.fx.push({ kind: 'smoke', x: s.x + 0.8, y: s.y - 1.9, sh: 2.8, vx: 0.15, vy: 0, t: 0, life: 3, size: 2.5 });
        const want = Math.min(8, s.animals.hens);
        while (H.birds.length < want) H.birds.push({ x: s.x - 3.4 + (Math.random() - 0.5) * 2, y: s.y + 1.2 + (Math.random() - 0.5) * 2, dir: Math.random() * 6.28, t: Math.random() * 3, peck: 0 });
        if (H.birds.length > want) H.birds.length = want;
        for (const b of H.birds) {
          b.t -= dt;
          if (b.t <= 0) { b.t = 0.5 + Math.random() * 2; b.dir += (Math.random() - 0.5) * 2.5; b.peck = Math.random() < 0.4 ? 0.6 : 0; }
          if (b.peck > 0) { b.peck -= dt; continue; }
          const nx = b.x + Math.cos(b.dir) * dt * 0.7, ny = b.y + Math.sin(b.dir) * dt * 0.7;
          if (U.dist(nx, ny, s.x - 3.4, s.y + 1.2) < 2.2) { b.x = nx; b.y = ny; } else b.dir += Math.PI;
          if (U.dist(b.x, b.y, pe.x, pe.y) < 1.2) { b.dir = Math.atan2(b.y - pe.y, b.x - pe.x); b.t = 0.6; }
        }
      }
    },
    // ------------------------------------------------------------ for the Nearby list
    nearby(game) {
      const s = H.st(game.pl);
      if (!s) return [];
      const ripe = s.plots.filter(p => p.crop && p.growth >= 1).length;
      return [{ k: 'home', icon: '⌂', name: s.name, sub: `your homestead${ripe ? ` · ${ripe} beds ready` : ''}${s.coffer ? ` · ${s.coffer} crowns in the strongbox` : ''}${s.work.length ? ' · building' : ''}`, x: s.x, y: s.y }];
    },
    BUILDS, CROPS
  };
  if (ECHO.Pastimes) {
    ECHO.Pastimes.extraAct = ECHO.Pastimes.extraAct || [];
    ECHO.Pastimes.extraAct.push(game => H.interactables(game));
  }
})();
