// ECHO.Craft — the making of things from what you fell and mine. (= opens it.)
//
//   timber → planks (by hand) → a WORKBENCH → dressed stone, arrows, an axe, a pick
//   stone → a FURNACE → ingots (ore, and a plank to burn)
//   ingots → an ANVIL → energy cells, missiles, and a blade, a coat of mail or a sidearm of your
//     own level
//   The workbench, furnace and anvil are your own kit, carried with you (pl.inv.workbench …):
//   made once, never placed. Nothing is built on the land.
//
//   (0.47 let you build on the land. That is gone: anything built in a save of that time is
//    taken up the first time the world is entered again, and all it cost is given back — a
//    workbench, furnace or anvil you had placed comes back as the one in your kit.)
(function () {
  const { U } = ECHO;
  const GOODS = { timber: 'timber', ore: 'ore', planks: 'planks', stone: 'stone', ingots: 'ingots', arrows: 'arrows', cells: 'energy cells', missiles: 'missiles', axe: 'axe', pick: 'pick', workbench: 'workbench', furnace: 'furnace', anvil: 'anvil' };
  const STATION = { workbench: 'a workbench', furnace: 'a furnace', anvil: 'an anvil' };
  const RECIPES = [
    { k: 'planks', name: 'Saw planks', use: { timber: 1 }, get: { planks: 4 }, desc: 'A load of timber, sawn.' },
    { k: 'workbench', name: 'Make a workbench', use: { planks: 6 }, get: { workbench: 1 }, once: 'workbench', desc: 'Lets you dress stone, fletch arrows, and make tools.' },
    { k: 'stone', name: 'Dress stone', use: { ore: 1 }, get: { stone: 3 }, at: 'workbench' },
    { k: 'arrows', name: 'Fletch arrows', use: { planks: 1 }, get: { arrows: 8 }, at: 'workbench' },
    { k: 'axe', name: 'Make an axe', use: { planks: 3, ingots: 1 }, get: { axe: 1 }, at: 'workbench', once: 'axe', desc: 'Fells a tree in half the strokes.' },
    { k: 'pick', name: 'Make a pick', use: { planks: 3, ingots: 1 }, get: { pick: 1 }, at: 'workbench', once: 'pick', desc: 'Breaks stone in half the strokes.' },
    { k: 'furnace', name: 'Build a furnace', use: { stone: 8 }, get: { furnace: 1 }, at: 'workbench', once: 'furnace', desc: 'Lets you smelt ingots.' },
    { k: 'ingots', name: 'Smelt an ingot', use: { ore: 1, planks: 1 }, get: { ingots: 1 }, at: 'furnace', desc: 'Ore, and a plank to burn.' },
    { k: 'anvil', name: 'Forge an anvil', use: { ingots: 5 }, get: { anvil: 1 }, at: 'furnace', once: 'anvil', desc: 'Lets you make cells, missiles and gear.' },
    { k: 'cells', name: 'Charge energy cells', use: { ingots: 1 }, get: { cells: 20 }, at: 'anvil' },
    { k: 'missiles', name: 'Build a missile', use: { ingots: 2 }, get: { missiles: 1 }, at: 'anvil' },
    { k: 'blade', name: 'Forge a blade', use: { ingots: 8, planks: 2 }, gear: 'sword', at: 'anvil', desc: 'A fine blade of your own level.' },
    { k: 'mail', name: 'Forge a coat of mail', use: { ingots: 10 }, gear: 'armor', at: 'anvil', desc: 'Fine armour of your own level.' },
    { k: 'sidearm', name: 'Build a sidearm', use: { ingots: 8, planks: 1 }, gear: 'gun', at: 'anvil', desc: 'A fine pistol of your own level.' }
  ];
  // what each piece of 0.47 cost, to give back
  const OLD = { wall: { planks: 2 }, swall: { stone: 2 }, floor: { planks: 1 }, sfloor: { stone: 1 }, fence: { planks: 1 }, door: { planks: 3 }, torch: { planks: 1, timber: 1 }, bench: { workbench: 1 }, furnace: { furnace: 1 }, anvil: { anvil: 1 } };

  const K = ECHO.Craft = {
    RECIPES, GOODS,
    reset() { K._done = null; },
    word(k, n) { const w = GOODS[k] || k; if (n !== 1) return w; return k === 'cells' ? 'energy cell' : k === 'planks' || k === 'ingots' || k === 'arrows' || k === 'missiles' ? w.replace(/s$/, '') : w; },
    costText(cost) { return Object.keys(cost).map(k => `${cost[k]} ${K.word(k, cost[k])}`).join(' + '); },
    have(pl, cost) { for (const k in cost) if (!((pl.inv[k] || 0) >= cost[k])) return false; return true; },
    whyNot(pl, R) {
      if (R.once && (pl.inv[R.once] || 0) > 0) return 'you have one';
      if (R.at && !((pl.inv[R.at] || 0) > 0)) return `needs ${STATION[R.at]} (make one first)`;
      if (!K.have(pl, R.use)) return `needs ${K.costText(R.use)}`;
      return null;
    },
    times(pl, R) { let n = Infinity; for (const k in R.use) n = Math.min(n, Math.floor((pl.inv[k] || 0) / R.use[k])); return R.once || R.gear ? Math.min(1, n) : n; },
    craft(game, R, n = 1) {
      const pl = game.pl;
      let made = 0;
      for (let i = 0; i < n; i++) {
        if (K.whyNot(pl, R)) break;
        for (const k in R.use) pl.inv[k] -= R.use[k];
        if (R.get) for (const k in R.get) pl.inv[k] = (pl.inv[k] || 0) + R.get[k];
        if (R.gear) K.forge(game, R.gear);
        made++;
      }
      if (made && pl.stats) pl.stats.crafted = (pl.stats.crafted || 0) + made;
      return made;
    },
    forge(game, kind) {
      const world = game.world, pl = game.pl, lv = ECHO.Prowess ? ECHO.Prowess.level(pl) : 1;
      const rng = { next: Math.random, int: (a, b) => a + Math.floor(Math.random() * (b - a + 1)) };
      const it = ECHO.Gear.make(world, rng, kind, lv, 'fine', 'your own anvil');
      if (kind === 'gun') { it.gclass = 'pistol'; it.name = 'Hand-built sidearm'; }
      it.holder = 'player';
      (it.history = it.history || []).push({ d: world.day, t: 'made by your own hand, at your own anvil' });
      if (!pl.items.includes(it.id)) pl.items.push(it.id);
      return it;
    },
    // anything built on the land in 0.47 is taken up, and paid back
    undoBuilt(game) {
      const world = game.world, pl = game.pl, S = world && world.built;
      if (!S || !pl) return 0;
      const L = S.list || [], back = {}, rects = [];
      for (const e of L) { const c = OLD[e.k]; if (c) for (const k in c) back[k] = (back[k] || 0) + c[k]; rects.push({ x0: e.x, y0: e.y, x1: e.x + 1, y1: e.y + 1 }); }
      for (const k in back) {
        if (k === 'workbench' || k === 'furnace' || k === 'anvil') pl.inv[k] = Math.max(pl.inv[k] || 0, 1);
        else pl.inv[k] = (pl.inv[k] || 0) + back[k];
      }
      delete world.built; delete world._builtI;
      if (ECHO.Solids) ECHO.Solids._g = null;
      if (rects.length && ECHO.Clearing && ECHO.Clearing.changed) ECHO.Clearing.changed(world, rects);
      if (L.length && ECHO.UI) ECHO.UI.toast(`Building is gone from the game. What you built has been taken up and given back: ${K.costText(back)}.`, 'info', 9);
      return L.length;
    },
    tick(game) { if (K._done !== game.world) { K._done = game.world; K.undoBuilt(game); } },
    input(game) {
      const In = ECHO.Input;
      if (!In || !game.pl || !In.hit('=')) return;
      if (ECHO.UI && ECHO.UI.panelOpen && ECHO.UI.panelKind === 'craft') { ECHO.UI.closePanel(); return; }
      if (!game.ui.blocksWorld()) K.open(game);
    },
    open(game) {
      const UI = ECHO.UI, pl = game.pl;
      if (!UI || !pl) return;
      const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      const mats = ['timber', 'ore', 'planks', 'stone', 'ingots'];
      const kit = ['workbench', 'furnace', 'anvil'].map(s => `<span style="margin-right:14px;${pl.inv[s] ? 'color:#9ff6c0' : 'opacity:.55'}">${pl.inv[s] ? '●' : '○'} ${U.cap(GOODS[s])}</span>`).join('');
      const rec = RECIPES.map((R, i) => {
        const why = K.whyNot(pl, R), n = why ? 0 : K.times(pl, R), out = R.gear ? 'a piece of gear' : K.costText(R.get);
        return `<div style="display:flex;align-items:center;gap:12px;margin:6px 0"><div style="flex:1 1 auto"><b>${esc(R.name)}</b> <span class="dim" style="font-size:12px">${esc(K.costText(R.use))} → ${esc(out)}${R.desc ? ' · ' + esc(R.desc) : ''}</span>${why ? `<div style="font-size:12px;color:#ff9a7a">${esc(U.cap(why))}</div>` : ''}</div>
          <button class="small" data-craft="${i}:1" ${why ? 'disabled' : ''}>Make</button>${!R.once && !R.gear ? `<button class="small" data-craft="${i}:${Math.max(1, n)}" ${why || n < 2 ? 'disabled' : ''}>All (${n})</button>` : ''}</div>`;
      }).join('');
      const body = UI.openPanel('Crafting', `
        <div class="card"><h4>What you carry</h4><div>${mats.map(k => `<span style="margin-right:16px">${esc(U.cap(GOODS[k]))} <b>${pl.inv[k] || 0}</b></span>`).join('')}</div>
          <div class="dim" style="font-size:12px;margin-top:6px">Timber comes from felling trees and ore from breaking stone (stand by one and press E). Your kit: ${kit}</div></div>
        <div class="card"><h4>Make</h4>${rec}</div>`, 'craft');
      body.querySelectorAll('[data-craft]').forEach(b => b.addEventListener('click', () => {
        const [i, n] = b.dataset.craft.split(':').map(Number), R = RECIPES[i], made = K.craft(game, R, n);
        if (made) { if (ECHO.Sfx) ECHO.Sfx.play('gunSwap'); UI.toast(R.gear ? `${R.name}: it is in your pack.` : `${R.name}${made > 1 ? ' ×' + made : ''}.`, 'info', 2.5); }
        K.open(game);
      }));
    }
  };
})();
