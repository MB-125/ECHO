// Gear and loot: what monsters leave behind, and what a smith can make of it.
//
// Monster parts (bone dust, ghoul claws, spider silk, troll hide, golem
// cores…) sell at any market, and a smith turns them — with coin — into
// better gear: honed blades, strung bows, crafted and reinforced armour.
// Monsters and dungeon chests also drop finished gear of five rarities, some
// with a property of its own (an ember edge, venom, a thirst for blood).
(function () {
  const { U } = ECHO;

  // name, value (crowns at market), tier (how deep you find it), colour
  const MATS = {
    bonedust: { name: 'bone dust', value: 4, tier: 1, color: '#e8e2d0' },
    rattail: { name: 'rat tails', value: 2, tier: 1, color: '#a88a7a' },
    trinket: { name: 'goblin trinkets', value: 6, tier: 1, color: '#d8b84a' },
    gel: { name: 'slime gel', value: 5, tier: 1, color: '#8fe0a0' },
    claw: { name: 'ghoul claws', value: 8, tier: 2, color: '#b8c8a8' },
    silk: { name: 'spider silk', value: 9, tier: 2, color: '#f4f4ff' },
    venom: { name: 'venom sacs', value: 11, tier: 2, color: '#9fe05a' },
    fetish: { name: 'shaman fetishes', value: 12, tier: 2, color: '#c87a3a' },
    sigil: { name: 'dark sigils', value: 14, tier: 2, color: '#9a6ac8' },
    ecto: { name: 'ectoplasm', value: 16, tier: 3, color: '#bfe8ff' },
    trollhide: { name: 'troll hide', value: 18, tier: 3, color: '#6a7a4a' },
    tusk: { name: 'ogre tusks', value: 24, tier: 3, color: '#efe6c8' },
    core: { name: 'golem cores', value: 30, tier: 4, color: '#ff9a4a' },
    grave: { name: 'grave-iron', value: 34, tier: 4, color: '#7a8a9a' },
    queensilk: { name: 'queen\'s silk', value: 45, tier: 4, color: '#ffffff' },
    heartstone: { name: 'heartstones', value: 60, tier: 5, color: '#ff4a6a' },
    greathide: { name: 'great beast hide', value: 55, tier: 5, color: '#c87a3a' },
    greatfang: { name: 'great beast fangs', value: 70, tier: 5, color: '#fff0c8' }
  };
  const RARITY = [
    { k: 'common', name: 'Common', mult: 1, color: '#c8c0b0', affix: 0 },
    { k: 'fine', name: 'Fine', mult: 1.15, color: '#8fe08a', affix: 0 },
    { k: 'rare', name: 'Rare', mult: 1.32, color: '#7ab8ff', affix: 0.5 },
    { k: 'epic', name: 'Epic', mult: 1.55, color: '#c88aff', affix: 1 },
    { k: 'legendary', name: 'Legendary', mult: 1.85, color: '#ffb84a', affix: 1 }
  ];
  const AFFIX = {
    ember: { name: 'Ember', desc: 'sets foes alight', slot: 'weapon' },
    venom: { name: 'Venom', desc: 'poisons what it cuts', slot: 'weapon' },
    thirst: { name: 'Thirst', desc: 'heals you as it wounds', slot: 'weapon' },
    keen: { name: 'Keen', desc: 'finds the weak places more often', slot: 'weapon' },
    warding: { name: 'Warding', desc: 'turns fire and spells aside', slot: 'armor' },
    thorns: { name: 'Thorns', desc: 'hurts what strikes you', slot: 'armor' },
    vigor: { name: 'Vigor', desc: 'adds to your life', slot: 'armor' }
  };
  const BASES = {
    sword: ['blade', 'sword', 'longsword', 'falchion', 'sabre', 'edge'],
    bow: ['bow', 'longbow', 'recurve', 'warbow'],
    armor: ['jerkin', 'brigandine', 'hauberk', 'cuirass', 'mail']
  };
  const PREFIX = { common: ['Plain', 'Worn', 'Soldier\'s'], fine: ['Fine', 'Balanced', 'Well-made'], rare: ['Runed', 'Moonlit', 'Masterwork'], epic: ['Dread', 'Starforged', 'Wyrmbone'], legendary: ['Kingslayer', 'Dawnbringer', 'Oathkeeper', 'Nightfall', 'Worldsong'] };

  // Upgrades at the smith: each step costs gold and parts of the right depth.
  const HONE = [
    { gold: 30, mats: { bonedust: 3 }, add: 2 }, { gold: 60, mats: { claw: 3, silk: 2 }, add: 2 }, { gold: 110, mats: { trollhide: 2, ecto: 2 }, add: 3 },
    { gold: 180, mats: { core: 1, grave: 2 }, add: 3 }, { gold: 300, mats: { heartstone: 1, queensilk: 1 }, add: 4 }
  ];
  const CRAFT = [
    { id: 'leather', name: 'Hide jerkin', def: 6, gold: 25, mats: { hide: 4 }, desc: 'Wolf hides, boiled and stitched.' },
    { id: 'silk', name: 'Silkweave coat', def: 10, gold: 60, mats: { silk: 5, hide: 2 }, desc: 'Spider silk as tough as mail and half the weight.' },
    { id: 'troll', name: 'Troll-hide brigandine', def: 15, gold: 120, mats: { trollhide: 4, bonedust: 4 }, desc: 'It closes over small cuts as if it were still alive.', affix: 'vigor' },
    { id: 'grave', name: 'Grave-iron hauberk', def: 20, gold: 220, mats: { grave: 3, sigil: 3 }, desc: 'Black iron from the tombs. Spells slide off it.', affix: 'warding' },
    { id: 'beast', name: 'Beastlord\'s mantle', def: 24, gold: 260, mats: { greathide: 2, greatfang: 1 }, desc: 'Cut from the hide of a great beast. Wolves go quiet when you pass.', affix: 'vigor' },
    { id: 'golem', name: 'Golemplate', def: 26, gold: 360, mats: { core: 3, tusk: 2 }, desc: 'Plates of living stone.', affix: 'thorns' }
  ];

  const G = ECHO.Gear = {
    MATS, RARITY, AFFIX, HONE, CRAFT,
    rarity(k) { return RARITY.find(r => r.k === k) || RARITY[0]; },
    // Roll a rarity: deeper and stronger foes roll better.
    rollRarity(rng, level, boost = 0) {
      const r = rng.next() * 100, luck = level * 4 + boost;
      return r < 1 + luck * 0.08 ? 'legendary' : r < 5 + luck * 0.25 ? 'epic' : r < 18 + luck * 0.5 ? 'rare' : r < 45 + luck * 0.6 ? 'fine' : 'common';
    },
    // A piece of gear dropped in the world.
    make(world, rng, kind, level, rarity, where) {
      const R = G.rarity(rarity);
      const base = BASES[kind][rng.int(0, BASES[kind].length - 1)];
      const pre = PREFIX[R.k][rng.int(0, PREFIX[R.k].length - 1)];
      let affix = null;
      if (rng.next() < R.affix) { const opts = Object.keys(AFFIX).filter(a => AFFIX[a].slot === (kind === 'armor' ? 'armor' : 'weapon') && (kind !== 'bow' || a !== 'venom')); affix = opts[rng.int(0, opts.length - 1)]; }
      const stat = kind === 'armor' ? Math.round((4 + level * 4) * R.mult) : Math.round((kind === 'bow' ? 13 : 12) + level * 3.2 * R.mult + (R.mult - 1) * 10);
      const name = `${pre} ${base}${affix ? ' of ' + AFFIX[affix].name : ''}`;
      const it = ECHO.Character.makeItem(world, { kind, name: U.cap(name), dmg: kind === 'armor' ? 0 : stat, holder: null, history: [{ d: world.day, t: where ? `found ${where}` : 'found' }] });
      it.rarity = R.k; it.affix = affix; it.level = level; it.plus = 0;
      if (kind === 'armor') it.def = stat;
      return it;
    },
    // How much an item sells for.
    value(it) {
      if (!it) return 0;
      const R = G.rarity(it.rarity);
      const stat = it.kind === 'armor' ? (it.def || 0) * 2 : it.dmg || 0;
      return Math.round(stat * 2.2 * R.mult * R.mult + (it.plus || 0) * 18 + (it.affix ? 25 : 0) + (it.legend ? 80 : 0));
    },
    // Armour between you and the blow.
    def(world, pl) { const a = pl.armor && world.items[pl.armor]; return a ? (a.def || 0) : 0; },
    taken(world, pl, type) {
      const a = pl.armor && world.items[pl.armor];
      if (!a) return 1;
      let m = 1 - a.def / (a.def + 55);
      if (a.affix === 'warding' && (type === 'fire' || type === 'magic')) m *= 0.6;
      return m;
    },
    // ------------------------------------------------------------ the smith
    honeCost(it) { return it ? HONE[it.plus || 0] || null : null; },
    canPay(pl, cost) {
      if (!cost) return false;
      if (pl.gold < cost.gold) return false;
      for (const k in cost.mats) if ((pl.inv[k] || 0) < cost.mats[k]) return false;
      return true;
    },
    pay(pl, cost) { pl.gold -= cost.gold; for (const k in cost.mats) pl.inv[k] -= cost.mats[k]; },
    hone(world, pl, it) {
      const c = G.honeCost(it);
      if (!c) return 'It can be made no finer.';
      if (!G.canPay(pl, c)) return 'You lack what the smith needs.';
      G.pay(pl, c);
      it.plus = (it.plus || 0) + 1;
      if (it.kind === 'armor') it.def = (it.def || 0) + c.add + 1; else it.dmg += c.add;
      it.history.push({ d: world.day, t: `${it.kind === 'armor' ? 'reinforced' : it.kind === 'bow' ? 'restrung and tillered' : 'honed'} to +${it.plus}` });
      return null;
    },
    craft(world, pl, id) {
      const r = CRAFT.find(c => c.id === id);
      if (!r) return { error: 'No such work.' };
      if (!G.canPay(pl, r)) return { error: 'You lack what the smith needs.' };
      G.pay(pl, r);
      const it = ECHO.Character.makeItem(world, { kind: 'armor', name: r.name, holder: 'player', history: [{ d: world.day, t: 'made to your measure by a smith' }] });
      it.def = r.def; it.rarity = r.def >= 20 ? 'rare' : r.def >= 10 ? 'fine' : 'common'; it.affix = r.affix || null; it.plus = 0; it.level = 1; it.craft = r.id;
      pl.items.push(it.id);
      if (!pl.armor || G.def(world, pl) < it.def) pl.armor = it.id;
      return { item: it };
    },
    // Sell monster parts at a market.
    matPrice(s, k) { return Math.max(1, Math.round(MATS[k].value * (0.75 + (s.prosperity || 50) / 200))); },
    sellMats(pl, s) {
      let total = 0; const out = [];
      for (const k in MATS) { const n = pl.inv[k] || 0; if (!n) continue; const p = G.matPrice(s, k) * n; total += p; out.push(`${n} ${MATS[k].name}`); pl.inv[k] = 0; }
      pl.gold += total; s.wealth = (s.wealth || 0) + total * 0.2;
      return { total, out };
    },
    mats(pl) { return Object.keys(MATS).filter(k => pl.inv[k] > 0).map(k => ({ k, n: pl.inv[k], ...MATS[k] })); },
    // How a piece of gear looks: the metal, the glow, the jewels — better gear, finer look.
    look(it) {
      if (!it) return null;
      const R = G.rarity(it.rarity), plus = it.plus || 0;
      const AFX = { ember: '#ff8a3a', venom: '#8fe05a', thirst: '#ff4a5a', keen: '#e8f4ff', warding: '#9fd3ff', thorns: '#c8e07a', vigor: '#ff9ab0' };
      const METAL = { common: '#a8acb4', fine: '#d4d8e0', rare: '#9cc4ff', epic: '#c4a0ff', legendary: '#ffd884' };
      const glowCol = it.affix ? AFX[it.affix] : it.starforged ? '#bfe8ff' : R.color;
      const glow = Math.min(1, plus * 0.14 + (it.starforged || 0) * 0.15 + ({ common: 0, fine: 0.05, rare: 0.15, epic: 0.3, legendary: 0.45 }[R.k] || 0) + (it.affix ? 0.1 : 0));
      const lift = (hex, f) => { const n = parseInt(hex.slice(1), 16), c = v => Math.min(255, Math.round(v + (255 - v) * f)); return '#' + ((c(n >> 16) << 16) | (c((n >> 8) & 255) << 8) | c(n & 255)).toString(16).padStart(6, '0'); };
      const L = { rarity: R.k, color: R.color, plus, gems: Math.min(5, plus), glow, glowCol, metal: lift(METAL[R.k] || METAL.common, plus * 0.07), gold: R.k === 'epic' || R.k === 'legendary' || plus >= 4, affix: it.affix || null };
      if (it.kind === 'armor') {
        const CR = { beast: ['#8a5a2a', '#4a2e18'], leather: ['#7a5634', '#4a3420'], silk: ['#e8e4dc', '#a8a49a'], troll: ['#5a6a3a', '#3a4426'], grave: ['#3e4650', '#262a30'], golem: ['#8a8276', '#5a544c'] };
        const RC = { common: ['#6a5a48', '#4a3e32'], fine: ['#6a7a5a', '#45503a'], rare: ['#4a6a9a', '#2e4466'], epic: ['#6a4a9a', '#422e66'], legendary: ['#b08a3a', '#6a5020'] };
        const c = CR[it.craft] || RC[R.k] || RC.common;
        L.body = c[0]; L.trim = c[1];
        L.helm = (it.def || 0) >= 12 || plus >= 2;
        L.pauldrons = plus >= 3 || R.k === 'epic' || R.k === 'legendary';
        L.crest = plus >= 5 || R.k === 'legendary';
      } else if (it.kind === 'bow') L.wood = { common: '#6a4a2a', fine: '#7a5634', rare: '#3a4a6a', epic: '#4a2a5a', legendary: '#8a6a2a' }[R.k] || '#6a4a2a';
      return L;
    },
    // Describe an item in a line.
    line(it) {
      if (!it) return '';
      const R = G.rarity(it.rarity);
      const stat = it.kind === 'armor' ? `armour ${it.def}` : `power ${it.dmg}`;
      return `${R.name !== 'Common' || it.rarity ? R.name + ' · ' : ''}${stat}${it.plus ? ` · +${it.plus}` : ''}${it.affix ? ` · ${AFFIX[it.affix].desc}` : ''}`;
    }
  };
})();
