// Pastimes: a life you can live without drawing a blade.
//
// Six crafts grow by doing them, each with its own ranks and its own small
// mastery: Foraging (berries, mushrooms, herbs, wild honey and eggs from the
// woods and meadows), Cooking (recipes at a campfire or an inn's kitchen),
// Prospecting (panning the rivers for gold), Music (playing for coin in town
// squares and inns), Carrying (parcels between towns) and Sketching (the
// places and creatures of the world, in a sketchbook the archives will buy
// from). Every one of them pays, every one of them earns experience — enough
// to rise in level without ever fighting — and the people you feed, play for
// and bring news to come to like you for it.
(function () {
  const { U } = ECHO;
  const T = ECHO.TILE;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const CRAFTS = {
    forage: { name: 'Foraging', icon: '🌿', ranks: ['Gatherer', 'Forager', 'Woodwise', 'Wild-harvester', 'Keeper of the Green'], perks: { 3: 'An extra handful from every bush and patch.', 5: 'You spot good picking from further off, and rare finds (truffles, wild ginseng) turn up more.', 7: 'Wild bees no longer sting you.', 9: 'Two handfuls more, and the rarest finds are common to you.' } },
    cook: { name: 'Cooking', icon: '🍲', ranks: ['Scullion', 'Camp cook', 'Good cook', 'Fine cook', 'Master of the hearth'], perks: { 3: 'Pies and soups come out a portion larger.', 5: 'Innkeepers pay half again for your dishes.', 7: 'Your food heals a quarter more.', 9: 'Every dish is a feast: it warms you and keeps you fed far longer.' } },
    prospect: { name: 'Prospecting', icon: '⛏', ranks: ['Panner', 'Prospector', 'Sharp-eyed', 'Gold-finder', 'Old Hand of the Rivers'], perks: { 3: 'The sweet spot in the pan is wider.', 5: 'Nuggets come more often than dust.', 7: 'You find gems in the gravel.', 9: 'You can read a river at a glance: richer streams glint for you.' } },
    bard: { name: 'Music', icon: '🎵', ranks: ['Busker', 'Street player', 'Minstrel', 'Bard', 'Master Bard'], perks: { 3: 'Crowds gather faster and tip better.', 5: 'You can sing the ballad of your own deeds (and people remember them).', 7: 'Inns pay you to play for the evening.', 9: 'Your playing lifts the spirits of a whole town for a day.' } },
    courier: { name: 'Carrying', icon: '✉', ranks: ['Errand-runner', 'Carrier', 'Courier', 'Swift rider', 'Master of the Post'], perks: { 3: 'You can carry four parcels at once.', 5: 'Urgent parcels pay double.', 7: 'Townsfolk greet you as the post rider: a little better prices everywhere you deliver.', 9: 'The guild sends you the richest contracts.' } },
    artist: { name: 'Sketching', icon: '✎', ranks: ['Doodler', 'Sketcher', 'Draughtsman', 'Illustrator', 'Master Limner'], perks: { 3: 'The archives pay a third more for your sketches.', 5: 'You can sketch creatures from further away.', 7: 'Your sketches of wonders sell for double.', 9: 'Your sketchbook is famous; scholars seek you out.' } }
  };
  const LV = [0, 20, 55, 110, 190, 300, 440, 620, 850, 1150];
  // what you can gather and make, and what it's worth
  const GOODS = {
    berries: { name: 'wild berries', value: 2, icon: '🫐', eat: { hp: 4, fed: 5 } },
    mushrooms: { name: 'mushrooms', value: 3, icon: '🍄' },
    honey: { name: 'wild honey', value: 9, icon: '🍯' },
    eggs: { name: 'wild eggs', value: 2, icon: '🥚' },
    truffle: { name: 'truffles', value: 40, icon: '◆' },
    ginseng: { name: 'wild ginseng', value: 35, icon: '✿' },
    pie: { name: 'berry pie', value: 14, icon: '🥧', dish: true },
    soup: { name: 'mushroom soup', value: 10, icon: '🥣', dish: true },
    omelette: { name: 'wild-egg omelette', value: 10, icon: '🍳', dish: true },
    honeycake: { name: 'honey cake', value: 22, icon: '🍰', dish: true },
    feast: { name: "hunter's feast", value: 40, icon: '🍖', dish: true },
    salve: { name: 'healing salve', value: 20, icon: '⚗' }
  };
  // recipes: what goes in, what comes out, and the cook level they need
  const RECIPES = [
    { id: 'pie', lv: 1, need: { berries: 3, food: 1 }, out: 'pie', n: 1, desc: 'Berries and a loaf\'s worth of flour.' },
    { id: 'soup', lv: 1, need: { mushrooms: 2, herbs: 1 }, out: 'soup', n: 1, desc: 'Warms you through.' },
    { id: 'omelette', lv: 2, need: { eggs: 2, mushrooms: 1 }, out: 'omelette', n: 1, desc: 'Quick and filling.' },
    { id: 'honeycake', lv: 3, need: { honey: 1, eggs: 1, food: 1 }, out: 'honeycake', n: 1, desc: 'Everyone\'s favourite gift.' },
    { id: 'salve', lv: 3, need: { herbs: 3, honey: 1 }, out: 'salve', n: 1, desc: 'Heals deep hurts; used before herbs (G).' },
    { id: 'feast', lv: 5, need: { roast: 2, mushrooms: 1, berries: 2 }, out: 'feast', n: 1, desc: 'A meal that keeps you going for a day.' }
  ];
  const DISH_EAT = {
    soup: { name: 'mushroom soup', hp: 30, fed: 35, warm: 22 },
    omelette: { name: 'a wild-egg omelette', hp: 30, fed: 32 },
    pie: { name: 'berry pie', hp: 28, fed: 40 },
    feast: { name: "a hunter's feast", hp: 70, fed: 100, warm: 30, hearty: 600 },
    berries: { name: 'a handful of berries', hp: 4, fed: 5 }
  };
  // forage: what grows where and when (seasonIdx 0 Thaw, 1 Bloom, 2 Harvest, 3 Frost)
  const NODES = {
    berries: { label: 'Pick berries', tiles: [T.FOREST, T.GRASS], p: [0.05, 0.012], seasons: [1, 2], yield: [2, 4], xp: 3 },
    mushrooms: { label: 'Gather mushrooms', tiles: [T.FOREST, T.SWAMP], p: [0.04, 0.03], seasons: [0, 2, 3], yield: [1, 3], xp: 3, rare: 'truffle' },
    herbs: { label: 'Gather wild herbs', tiles: [T.GRASS, T.HILL, T.FOREST], p: [0.018, 0.02, 0.012], seasons: [0, 1, 2], yield: [1, 2], xp: 3, rare: 'ginseng' },
    honey: { label: 'Take wild honey', tiles: [T.FOREST], p: [0.012], seasons: [1, 2], yield: [1, 1], xp: 6, bees: true },
    eggs: { label: 'Take eggs from the nest', tiles: [T.GRASS, T.SWAMP, T.SAND], p: [0.008, 0.02, 0.01], seasons: [0, 1], yield: [1, 3], xp: 3 }
  };

  const P = ECHO.Pastimes = {
    CRAFTS, GOODS, RECIPES, NODES, nodes: [], scanT: 0,
    st(pl) { pl.past = pl.past || {}; for (const k in CRAFTS) if (!pl.past[k]) pl.past[k] = { xp: 0 }; return pl.past; },
    level(pl, k) { const xp = P.st(pl)[k].xp; let l = 1; for (let i = 1; i < LV.length; i++) if (xp >= LV[i]) l = i + 1; return l; },
    rank(pl, k) { const l = P.level(pl, k); return CRAFTS[k].ranks[Math.min(4, Math.floor((l - 1) / 2))]; },
    // a craft grows; and the peaceful road is a real road: it earns experience too
    gain(game, k, xp) {
      const pl = game.pl, S = P.st(pl)[k];
      const before = P.level(pl, k);
      S.xp += xp;
      const after = P.level(pl, k);
      if (after > before) {
        ECHO.Combat.floater(game.pe.x, game.pe.y - 1.8, `${CRAFTS[k].name} ${after}`, '#bfe8a0', true);
        const perk = CRAFTS[k].perks[after];
        game.ui.toast(`${CRAFTS[k].icon} ${CRAFTS[k].name} rises to ${after} — ${P.rank(pl, k)}.${perk ? ' ' + perk : ''}`, 'legend', 6);
        if (ECHO.Music) ECHO.Music.stinger('letter');
      }
      if (ECHO.Prowess) { const ups = ECHO.Prowess.gain(pl, Math.round(xp * 1.3)); for (const u of ups) ECHO.Progress.levelUp(game, u); }
    },
    // ------------------------------------------------------------ foraging
    nodeAt(world, x, y) {
      const t = ECHO.World.tile(world, x, y);
      const h = ECHO.hash2(x, y, world.seed + 77), h2 = ECHO.hash2(x, y, world.seed + 78);
      const season = ECHO.TIME.dateOf(world.day).seasonIdx;
      let acc = 0;
      for (const k in NODES) {
        const N = NODES[k], i = N.tiles.indexOf(t);
        if (i < 0) continue;
        acc += N.p[i] || N.p[0];
        if (h < acc) {
          if (!N.seasons.includes(season)) return null;
          if (k === 'honey') { let tree = false; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (ECHO.World.tile(world, x + dx, y + dy) === T.TREE) tree = true; if (!tree) return null; }
          return { k, x: x + 0.3 + h2 * 0.4, y: y + 0.3 + ((h * 997) % 1) * 0.4, key: x + ',' + y };
        }
      }
      return null;
    },
    ready(world, n) { const f = world.forage && world.forage[n.key]; return f == null || world.day - f >= 3; },
    scan(game) {
      const world = game.world, pe = game.pe;
      const out = [];
      if (!ECHO.Interior.cur) {
        const R = 16, x0 = Math.floor(pe.x), y0 = Math.floor(pe.y);
        for (let y = y0 - R; y <= y0 + R; y++) for (let x = x0 - R; x <= x0 + R; x++) {
          const n = P.nodeAt(world, x, y);
          if (n && P.ready(world, n) && !ECHO.World.isSolid(world, n.x, n.y) && !ECHO.World.settlementAt(world, x, y, 6)) out.push(n);
        }
      }
      P.nodes = out;
    },
    gather(game, n) {
      const world = game.world, pl = game.pl, pe = game.pe, N = NODES[n.k];
      if (!P.ready(world, n)) return;
      world.forage = world.forage || {};
      const lv = P.level(pl, 'forage');
      // wild bees defend their honey (less so at night, or with smoke from a fire)
      if (N.bees && lv < 7) {
        const smoke = ECHO.Camp && ECHO.Camp.fire && !ECHO.Camp.fire.out && U.dist(ECHO.Camp.fire.x, ECHO.Camp.fire.y, n.x, n.y) < 6;
        const p = (game.isNight() || smoke ? 0.1 : 0.55) - lv * 0.05;
        if (Math.random() < p) {
          ECHO.Combat.damage(pe, 5, { type: 'sting', angle: 0, knock: 0.02 });
          ECHO.Combat.floater(pe.x, pe.y - 1.3, 'stung!', '#ffd84a');
          for (let i = 0; i < 12; i++) ECHO.Combat.fx.push({ kind: 'p', x: n.x + (Math.random() - 0.5), y: n.y + (Math.random() - 0.5), vx: (Math.random() - 0.5) * 2, vy: -0.5, t: 0, life: 1, color: '#ffd84a', size: 1 });
          if (Math.random() < 0.5) { game.ui.toast('The bees drive you off. (They\'re calmer at night — or smoke them out with a campfire nearby.)', 'warn', 4); return; }
        }
      }
      world.forage[n.key] = world.day;
      let q = N.yield[0] + Math.floor(Math.random() * (N.yield[1] - N.yield[0] + 1)) + (lv >= 3 ? 1 : 0) + (lv >= 9 ? 2 : 0);
      const got = [];
      const k = n.k === 'herbs' ? 'herbs' : n.k;
      pl.inv[k] = (pl.inv[k] || 0) + q; got.push(`${q} ${n.k === 'herbs' ? 'bundle' + (q > 1 ? 's' : '') + ' of herbs' : GOODS[k].name}`);
      if (N.rare && Math.random() < 0.05 + (lv >= 5 ? 0.08 : 0) + (lv >= 9 ? 0.15 : 0)) { pl.inv[N.rare] = (pl.inv[N.rare] || 0) + 1; got.push(GOODS[N.rare].name.replace(/s$/, '') + '!'); ECHO.Sfx.play('perfect'); }
      ECHO.Combat.floater(pe.x, pe.y - 1.3, '+' + got.join(', '), '#bfe8a0');
      ECHO.Sfx.play('step', { vol: 2 });
      pe.dir = Math.atan2(n.y - pe.y, n.x - pe.x); pe.gatherT = 0.6;
      pl.stats = pl.stats || {}; pl.stats.foraged = (pl.stats.foraged || 0) + 1;
      P.gain(game, 'forage', N.xp);
      P.scan(game);
    },
    // ------------------------------------------------------------ cooking
    canCook(pl, r) { return Object.entries(r.need).every(([k, n]) => (pl.inv[k] || 0) >= n) && P.level(pl, 'cook') >= r.lv; },
    needText(r) { return Object.entries(r.need).map(([k, n]) => `${n} ${k === 'food' ? 'bread' : k === 'herbs' ? 'herbs' : k === 'roast' ? 'roast meat' : GOODS[k] ? GOODS[k].name : k}`).join(' + '); },
    cookMenu(game, where, back) {
      const pl = game.pl;
      const lv = P.level(pl, 'cook');
      const ch = RECIPES.map(r => ({
        label: `${GOODS[r.out].icon} ${GOODS[r.out].name}`,
        sub: lv < r.lv ? `needs Cooking ${r.lv}` : `${P.needText(r)} · ${r.desc}`,
        disabled: !P.canCook(pl, r),
        onPick: () => { P.cook(game, r); setTimeout(() => P.cookMenu(game, where, back), 0); }
      }));
      if (back) ch.push({ label: 'Back', onPick: () => back() }); else ch.push({ label: 'Done', onPick: () => {} });
      const have = Object.keys(GOODS).filter(k => pl.inv[k] > 0).map(k => `${pl.inv[k]} ${GOODS[k].name}`);
      ECHO.UI.modal({ title: `Cooking${where ? ' — ' + where : ''}`, html: `<p class="dim">Cooking ${lv} · ${esc(P.rank(pl, 'cook'))}. ${have.length ? 'In your pack: ' + esc(have.join(', ')) + '.' : 'Gather in the woods and meadows, hunt, and buy bread at a market.'}</p>`, choices: ch });
    },
    cook(game, r) {
      const pl = game.pl;
      if (!P.canCook(pl, r)) return;
      for (const [k, n] of Object.entries(r.need)) pl.inv[k] -= n;
      const n = r.n + ((r.out === 'pie' || r.out === 'soup') && P.level(pl, 'cook') >= 3 ? 1 : 0);
      pl.inv[r.out] = (pl.inv[r.out] || 0) + n;
      if (ECHO.Camp && ECHO.Camp.fire) ECHO.Camp.fire.cookT = 5;
      ECHO.Sfx.play('fireCharge', { vol: 0.3 });
      game.ui.toast(`${n} ${GOODS[r.out].name}${n > 1 ? ' (an extra portion)' : ''}.`, 'info', 3);
      P.gain(game, 'cook', 4 + r.lv * 2);
    },
    // ------------------------------------------------------------ selling and giving
    priceOf(s, k, inn) {
      const G = GOODS[k], game = ECHO.Game;
      let p = G.value * (0.8 + ((s && s.prosperity) || 50) / 250);
      if (inn && G.dish) p *= 1.25 * (P.level(game.pl, 'cook') >= 5 ? 1.5 : 1);
      return Math.max(1, Math.round(p));
    },
    marketHtml(pl, s) {
      const ks = Object.keys(GOODS).filter(k => pl.inv[k] > 0);
      const tools = P.toolsHtml(pl, s);
      if (!ks.length) return tools;
      return tools + `<h4 class="ware-h">Your finds and your cooking</h4><div class="wares">${ks.map(k => `<div class="ware"><div class="ware-ic">${GOODS[k].icon}</div><div class="ware-main"><div class="ware-top"><b>${esc(U.cap(GOODS[k].name))}</b><span class="gold">${P.priceOf(s, k)} cr each</span></div><div class="ware-meta">You have <b>${pl.inv[k]}</b>${GOODS[k].dish ? ' · innkeepers pay more for cooking' : ''}</div><div class="row"><button class="small" data-psell="${k}">Sell 1</button><button class="small" data-psellall="${k}">Sell all</button></div></div></div>`).join('')}</div>`;
    },
    bindMarket(body, s, render) {
      const pl = ECHO.Game.pl;
      body.querySelectorAll('button[data-psell],button[data-psellall]').forEach(b => b.addEventListener('click', () => {
        const k = b.dataset.psell || b.dataset.psellall, n = b.dataset.psell ? 1 : pl.inv[k] || 0;
        if (!n) return;
        const got = P.priceOf(s, k) * n; pl.inv[k] -= n; pl.gold += got; s.wealth = (s.wealth || 0) + got * 0.3; ECHO.Sfx.play('coin'); render();
      }));
    },
    TOOLS: {
      pan: { name: 'Gold pan', cost: 15, icon: '⛏', use: 'Pan the gravel of shallow rivers for gold dust, nuggets and gems.' },
      lute: { name: 'Lute', cost: 45, icon: '🎵', use: 'Play for coin in town squares and inns.' },
      sketchbook: { name: 'Sketchbook and charcoal', cost: 20, icon: '✎', use: 'Draw places and creatures; the archives buy good sketches.' }
    },
    toolsHtml(pl, s) {
      const ks = Object.keys(P.TOOLS).filter(k => !pl.inv[k]);
      if (!ks.length) return '';
      return `<h4 class="ware-h">Tools of a peaceful trade</h4><div class="wares">${ks.map(k => { const T0 = P.TOOLS[k]; return `<div class="ware"><div class="ware-ic">${T0.icon}</div><div class="ware-main"><div class="ware-top"><b>${T0.name}</b><span class="gold">${T0.cost} cr</span></div><div class="ware-use">${esc(T0.use)}</div><div class="row"><button class="small" data-ptool="${k}" ${pl.gold < T0.cost ? 'disabled' : ''}>Buy</button></div></div></div>`; }).join('')}</div>`;
    },
    buyTool(pl, k, s) {
      const T0 = P.TOOLS[k];
      if (!T0 || pl.inv[k]) return null;
      if (pl.gold < T0.cost) return 'Not enough crowns.';
      pl.gold -= T0.cost; pl.inv[k] = 1; s.wealth = (s.wealth || 0) + T0.cost; ECHO.Sfx.play('coin');
      ECHO.UI.toast(`${T0.name}: ${T0.use} (See Crafts & pastimes in your journal.)`, 'info', 5);
      return null;
    },
    // what someone likes best (it never changes)
    favourite(npc) { const ks = ['honeycake', 'pie', 'berries', 'honey', 'soup', 'feast', 'omelette', 'truffle']; return ks[ECHO.hashStr(npc.id + 'fav') % ks.length]; },
    dialogue(world, npc, ent, pl, d) {
      const game = ECHO.Game, s = ECHO.Sim.settlement(world, npc.loc);
      const gifts = Object.keys(GOODS).filter(k => pl.inv[k] > 0 && k !== 'salve');
      if (gifts.length) d.add('I brought you something.', () => {
        d.clear();
        for (const k of gifts) d.add(`↳ ${GOODS[k].icon} ${U.cap(GOODS[k].name)}`, () => {
          pl.inv[k]--;
          const fav = P.favourite(npc) === k;
          const today = npc._giftDay === world.day;
          const gain = today ? 1 : Math.min(fav ? 22 : 10, Math.round((fav ? 12 : 3) + GOODS[k].value * (fav ? 0.4 : 0.2)));
          npc._giftDay = world.day;
          npc.op[pl.charId] = U.clamp((npc.op[pl.charId] || 0) + gain, -100, 100);
          if (fav && !today) ECHO.People.remember(world, npc, `was given ${GOODS[k].name} by ${pl.first} ${pl.last}`, 'joy', null, 1);
          d.say(today ? `"Another? You're too kind." ${npc.first} takes it, a little awkwardly.` : fav ? `${npc.first}'s face lights up. "${U.cap(GOODS[k].name)}! How did you know? It's my favourite." (They think much better of you.)` : `"For me? That's kind of you." ${npc.first} looks pleased.`);
          d.render();
        });
        d.add('↳ Never mind.', () => d.render());
      });
      if (s && npc.prof === 'innkeeper') {
        const dishes = Object.keys(GOODS).filter(k => GOODS[k].dish && pl.inv[k] > 0);
        if (dishes.length) d.add('Would you buy some of my cooking?', () => {
          let total = 0; for (const k of dishes) { total += P.priceOf(s, k, true) * pl.inv[k]; pl.inv[k] = 0; }
          pl.gold += total; ECHO.Sfx.play('coin');
          npc.op[pl.charId] = U.clamp((npc.op[pl.charId] || 0) + 3, -100, 100);
          d.say(`${npc.first} tastes a corner, then another. "This is good. Better than mine, and don't tell anyone I said so." (+${total} crowns)`); d.render();
        });
        d.add('May I use your kitchen? (2 crowns)', () => { if (pl.gold < 2) return d.say('"Two crowns for the fire and the pots."'); pl.gold -= 2; ECHO.UI.closePanel(); P.cookMenu(game, `the kitchen of the inn in ${s.name}`); });
      }
      if (P.extra) for (const f of P.extra) f(world, npc, ent, pl, d);
    },
    // ------------------------------------------------------------ the journal page
    html(game) {
      const pl = game.pl;
      P.st(pl);
      let html = '<p class="dim">You don\'t have to fight to make a life here. Each of these grows by doing it, pays its way, and earns experience.</p><div class="list">';
      for (const k in CRAFTS) {
        const C = CRAFTS[k], lv = P.level(pl, k), xp = pl.past[k].xp, next = LV[lv] != null ? LV[lv] : null, prev = LV[lv - 1];
        const pct = next == null ? 100 : Math.round((xp - prev) / (next - prev) * 100);
        const perks = Object.entries(C.perks).map(([l, t]) => `<div class="${lv >= +l ? '' : 'dim'}">${lv >= +l ? '✓' : '·'} <b>${l}</b> — ${esc(t)}</div>`).join('');
        html += `<div class="card"><h4>${C.icon} ${C.name} ${lv} <span class="dim">· ${esc(P.rank(pl, k))}</span></h4><div class="hb" style="height:4px;background:rgba(0,0,0,.4);margin:4px 0"><i style="display:block;height:4px;width:${pct}%;background:#9fd06a"></i></div><div class="dim">${esc(P.howTo[k])}</div>${perks}</div>`;
      }
      html += '</div>';
      const R = RECIPES.map(r => `<div>${GOODS[r.out].icon} <b>${esc(U.cap(GOODS[r.out].name))}</b> <span class="dim">(Cooking ${r.lv})</span> — ${esc(P.needText(r))}</div>`).join('');
      html += `<h4 class="ware-h">Recipes</h4><div class="card">${R}<div class="dim" style="margin-top:6px">Cook at a campfire (B in the wild, then E by the fire) or in an inn's kitchen (ask the innkeeper). Roast meat and grilled fish are always on the menu.</div></div>`;
      if (P.extraHtml) for (const f of P.extraHtml) html += f(game);
      return html;
    },
    howTo: {
      forage: 'Berries on forest edges in Bloom and Harvest, mushrooms in the woods and fens, herbs on the meadows, eggs in nests in spring, honey from wild bees by the trees. Walk up and press E. Patches grow back in a few days.',
      cook: 'Cook recipes at a campfire or an inn\'s kitchen. Eat with H, sell to innkeepers, or give as gifts — everyone has a favourite.',
      prospect: 'Buy a pan at a market, wade into a shallow river and press E to pan. Swirl the gravel away when the glint is in the notch.',
      bard: 'Buy a lute at a market. Play in a town square or an inn (E near the well or the inn\'s hearth, or the P key), hitting the notes in time.',
      courier: 'The Deliveries tab on any notice board: parcels and letters for other towns. Deliver to that town\'s innkeeper before the day they\'re due.',
      artist: 'Buy a sketchbook at a market. Stand near a landmark, a wonder, a dungeon mouth or a creature and press K\'s Sketch button — or E at the place — to draw it. Scholars at the archives buy sketches.'
    },
    // ------------------------------------------------------------ each frame
    interactables(game) {
      const out = [], pe = game.pe;
      if (ECHO.Interior.cur || pe.mounted || pe.inBoat || pe.swimming) return out;
      let best = null, bd = 1.5;
      for (const n of P.nodes) { const d = U.dist(n.x, n.y, pe.x, pe.y); if (d < bd) { bd = d; best = n; } }
      if (best) out.push({ kind: 'act', label: NODES[best.k].label, d: bd * 0.5, act: () => P.gather(game, best) });
      if (P.extraAct) for (const f of P.extraAct) out.push(...f(game));
      return out;
    },
    update(game, dt) {
      if (!game.pe || !game.pl) return;
      P.scanT -= dt;
      if (P.scanT <= 0) { P.scanT = 0.6; P.scan(game); }
      if (game.pe.gatherT > 0) game.pe.gatherT -= dt;
      if (P.extraTick) for (const f of P.extraTick) f(game, dt);
    }
  };
  // dishes can be eaten
  if (ECHO.Camp) {
    Object.assign(ECHO.Camp.FOODS, DISH_EAT);
    ECHO.Camp.ORDER.splice(0, 0, 'feast');
    ECHO.Camp.ORDER.splice(ECHO.Camp.ORDER.indexOf('food'), 0, 'soup', 'omelette', 'pie');
    ECHO.Camp.ORDER.push('berries');
  }
})();
