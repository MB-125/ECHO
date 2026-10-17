// The worlds beyond the gates, in real time.
//
// Outside: the gates themselves and the menace they breathe — felt, then
// painful, then lethal to anything below level 150 (people and beasts too).
// Inside: a whole world of its own for each gate, its zones rising from level
// 150 at the door to 1500 at the heart, where its sovereign waits. The beasts
// there each fight in a way of their own, and they hunt each other: the winner
// eats, grows and takes a name. Survival of the fittest — you included.
(function () {
  const { U } = ECHO;
  const UI = () => ECHO.UI;
  const Gt = () => ECHO.Gates;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ------------------------------------------------------------ the beasts beyond
  // shape: how they are drawn (hound, drake, stag, serpent, horror, spider, slime;
  // none = person-shaped, with vis). gab: their own abilities (below).
  const DEFS = {
    // the Ashen Expanse
    cinderhound: { name: 'Cinderhound', hp: 60, dmg: 11, speed: 4.7, reach: 1.25, wind: 0.34, cd: 1.0, tier: 6, shape: 'hound', scale: 1.15, col: '#2a1610', em: '#ff5a1a', f2d: 'sepia(1) saturate(4) hue-rotate(-25deg) brightness(0.7)', ab: { pack: true }, gab: { trail: { cd: 0.55 } }, resist: { fire: 0.8, melee: -0.1 }, loot: [['cinder', 0.35, 1, 1]], gold: [20, 60], desc: 'They hunt in packs, and the ground burns where they have run.', weak: 'Never stand in their trail. Cold steel bites them deep.' },
    magmabrute: { name: 'Magma Brute', hp: 140, dmg: 16, speed: 2.7, reach: 1.9, wind: 0.75, cd: 1.8, tier: 6, scale: 2.0, ab: { slam: { cd: 8, r: 3, dmg: 1.3 } }, gab: { erupt: { cd: 7, n: 3 } }, resist: { fire: 0.9, ranged: 0.3 }, vis: { cloth: '#2a1a14', cloth2: '#140c08', skin: '#3a2420', hair: '#ff6a1a', show: [], em: '#8a1a02', f2d: 'sepia(1) saturate(3) hue-rotate(-30deg) brightness(0.6)' }, loot: [['cinder', 0.5, 1, 2]], gold: [40, 120], desc: 'A walking furnace. The ground erupts wherever it points.', weak: 'Watch the ground for glowing rings and move before they burst.' },
    ashwraith: { name: 'Ash Wraith', hp: 80, dmg: 13, speed: 3.4, reach: 1.4, wind: 0.5, cd: 1.4, tier: 6, ab: { teleport: { cd: 6 }, drain: 0.35 }, gab: { ash: { cd: 9 } }, resist: { melee: 0.3, ranged: 0.5, fire: 0.6 }, vis: { cloth: '#4a4440', cloth2: '#2a2622', skin: '#c8c0b8', hair: '#8a8078', show: ['robe', 'hood'], em: '#3a1408', opacity: 0.6, f2d: 'grayscale(1) brightness(1.2) opacity(0.7)' }, loot: [['cinder', 0.3, 1, 1]], gold: [30, 90], desc: 'Smoke that remembers being a man. It chokes you, then drinks you.', weak: 'Get out of the ash cloud. It is frail when it stops to drink.' },
    emberdrake: { name: 'Ember Drake', hp: 120, dmg: 15, speed: 3.6, reach: 1.7, wind: 0.6, cd: 1.6, tier: 6, shape: 'drake', scale: 0.62, col: '#5a1a0a', belly: '#ff8a3a', em: '#6a1a04', f2d: 'sepia(1) saturate(3) hue-rotate(-20deg)', ab: { charge: { cd: 10 } }, gab: { breath: { cd: 7, len: 6.5, arc: 0.8 } }, resist: { fire: 0.9 }, loot: [['cinder', 0.6, 1, 2], ['dragonscale', 0.25, 1, 1]], gold: [60, 150], desc: 'A young drake, and already its breath melts sand to glass.', weak: 'Its breath goes where it faces: get beside it, never in front.' },
    slaggolem: { name: 'Slag Golem', hp: 170, dmg: 17, speed: 2.3, reach: 1.8, wind: 0.85, cd: 2.0, tier: 6, scale: 1.6, ab: { slam: { cd: 7, r: 2.6, dmg: 1.2 } }, gab: { harden: { cd: 12, dur: 3 } }, resist: { melee: 0.3, ranged: 0.7, fire: 0.9 }, vis: { cloth: '#3a3430', cloth2: '#221e1a', skin: '#5a504a', hair: '#3a3430', show: [], em: '#7a2a04', f2d: 'grayscale(1) sepia(0.5) brightness(0.8)' }, loot: [['cinder', 0.5, 1, 2], ['core', 0.4, 1, 1]], gold: [50, 130], desc: 'Slag and old fire. When it hardens, nothing gets through.', weak: 'When it glows white, back off and wait. Heavy blows when it cools.' },
    cindersovereign: { name: 'Vharzul, the Cinder Sovereign', hp: 900, dmg: 24, speed: 3.2, reach: 2.4, wind: 0.7, cd: 1.6, tier: 7, shape: 'drake', scale: 1.5, col: '#2a0a04', belly: '#ff5a1a', em: '#aa2a04', boss: true, f2d: 'sepia(1) saturate(4) hue-rotate(-30deg) brightness(0.8)', ab: { summon: { kind: 'cinderhound', n: 2, cd: 16 }, slam: { cd: 8, r: 3.6, dmg: 1.4 } }, gab: { breath: { cd: 6, len: 8, arc: 1 }, erupt: { cd: 9, n: 5 } }, resist: { fire: 0.95, ranged: 0.3 }, loot: [['sovereign', 1, 1, 1], ['cinder', 1, 4, 6], ['dragonscale', 1, 2, 4]], gold: [3000, 6000], desc: 'The king of the burning world, old as the gate.', weak: 'Keep moving; never fight it where the ground glows.' },
    // the Sunken Choir
    gloomeel: { name: 'Gloom Eel', hp: 70, dmg: 12, speed: 4.4, reach: 1.4, wind: 0.4, cd: 1.1, tier: 6, shape: 'serpent', scale: 1.2, col: '#0e2a30', em: '#1a8a90', f2d: 'hue-rotate(160deg) brightness(0.7)', gab: { submerge: { cd: 8 } }, resist: { ranged: 0.4 }, loot: [['pearl', 0.35, 1, 1]], gold: [20, 70], desc: 'It sinks into the floor as if the floor were water, and comes up under you.', weak: 'When it sinks, move. It surfaces where you were standing.' },
    choirsiren: { name: 'Choir Siren', hp: 75, dmg: 12, speed: 3.3, reach: 1.3, wind: 0.5, cd: 1.5, tier: 6, ab: { bolt: { color: '#9ff8ff', dmg: 1.2, cd: 3, type: 'magic' } }, gab: { song: { cd: 10, dur: 2.5 } }, resist: { magic: 0.5 }, vis: { cloth: '#cfe8e8', cloth2: '#6a9a9a', skin: '#d8f0f0', hair: '#9fd8d8', show: ['robe', 'hood'], em: '#0a3a3a', opacity: 0.85, f2d: 'hue-rotate(150deg) brightness(1.2)' }, loot: [['pearl', 0.4, 1, 1]], gold: [30, 90], desc: 'It sings, and your feet walk you to it.', weak: 'Kill it before the song ends, or walk away from it while it sings.' },
    drownedknight: { name: 'Drowned Knight', hp: 150, dmg: 15, speed: 2.9, reach: 1.6, wind: 0.6, cd: 1.5, tier: 6, scale: 1.25, gab: { riposte: true }, resist: { melee: 0.45, ranged: 0.2 }, vis: { cloth: '#2a4a4a', cloth2: '#1a2a2a', skin: '#8ab0a8', hair: '#3a5a5a', metal: '#4a7a78', show: ['helm', 'shield', 'sword', 'cape'], em: '#0a2a2a', f2d: 'hue-rotate(140deg) saturate(0.6)' }, loot: [['pearl', 0.5, 1, 2], ['grave', 0.4, 1, 2]], gold: [50, 140], desc: 'Still in its armour, still at its post, still answering every blow with one of its own.', weak: 'It blocks what comes from the front and strikes back. Go round it, or burn it.' },
    lanternangler: { name: 'Lantern Angler', hp: 85, dmg: 14, speed: 3.0, reach: 1.5, wind: 0.5, cd: 1.4, tier: 6, shape: 'horror', scale: 1.0, col: '#10181e', em: '#9ff8ff', f2d: 'hue-rotate(180deg) brightness(0.6)', ab: { bolt: { color: '#9ff8ff', dmg: 1.3, cd: 3.5, type: 'magic' } }, gab: { lure: true }, resist: { magic: 0.3 }, loot: [['pearl', 0.5, 1, 2]], gold: [40, 110], desc: 'You see a light in the dark. The light is bait.', weak: 'Do not walk toward lights. Up close it is soft.' },
    tidalhorror: { name: 'Tidal Horror', hp: 180, dmg: 16, speed: 2.5, reach: 2.0, wind: 0.8, cd: 1.9, tier: 6, shape: 'horror', scale: 1.9, col: '#0a1e24', em: '#2ad8c8', f2d: 'hue-rotate(170deg) brightness(0.7) saturate(1.5)', gab: { grab: { cd: 9, dur: 1.8 } }, resist: { melee: 0.2, fire: 0.4 }, loot: [['pearl', 0.6, 1, 2]], gold: [60, 150], desc: 'All arms. What it catches, it holds while it eats.', weak: 'Stay out of reach of its arms; strike after it lunges.' },
    choirmother: { name: 'Thalassa, Mother of the Choir', hp: 950, dmg: 23, speed: 2.9, reach: 2.2, wind: 0.65, cd: 1.5, tier: 7, scale: 2.4, boss: true, ab: { summon: { kind: 'gloomeel', n: 2, cd: 15 }, bolt: { color: '#9ff8ff', dmg: 1.4, cd: 2.4, type: 'magic' } }, gab: { song: { cd: 9, dur: 3 }, grab: { cd: 11, dur: 1.6 } }, resist: { magic: 0.5, ranged: 0.3 }, vis: { cloth: '#e0f8f8', cloth2: '#3a8a8a', skin: '#e8ffff', hair: '#bff8f8', show: ['robe', 'crown', 'cape'], em: '#0a4a4a', f2d: 'hue-rotate(150deg) brightness(1.3)' }, loot: [['sovereign', 1, 1, 1], ['pearl', 1, 4, 6]], gold: [3000, 6000], desc: 'The voice the whole drowned city still sings for.', weak: 'Break her song by hurting her; never stand still near her arms.' },
    // the Rotwood
    thornstalker: { name: 'Thorn Stalker', hp: 65, dmg: 13, speed: 4.6, reach: 1.25, wind: 0.32, cd: 1.0, tier: 6, shape: 'spider', scale: 1.3, col: '#1e2a14', em: '#6aff3a', f2d: 'hue-rotate(60deg) brightness(0.7)', ab: { poison: { dps: 4, dur: 5 } }, gab: { camo: true }, resist: { ranged: 0.2, fire: -0.3 }, loot: [['rotwood', 0.35, 1, 1], ['venom', 0.4, 1, 2]], gold: [20, 70], desc: 'You will not see it until it is already on you.', weak: 'Fire. Listen for it; it shows itself a heartbeat before it strikes.' },
    sporemother: { name: 'Spore Mother', hp: 140, dmg: 12, speed: 2.0, reach: 1.4, wind: 0.6, cd: 1.7, tier: 6, shape: 'slime', scale: 1.7, col: '#6a2a8a', em: '#c86aff', f2d: 'hue-rotate(230deg) saturate(1.5)', ab: { summon: { kind: 'sporeling', n: 2, cd: 12 } }, gab: { spores: { cd: 6 } }, resist: { melee: 0.2, fire: -0.4 }, loot: [['rotwood', 0.5, 1, 2], ['gel', 1, 2, 3]], gold: [40, 110], desc: 'It breathes out clouds of rot and births more of itself.', weak: 'Fire. Stay out of the purple clouds.' },
    sporeling: { name: 'Sporeling', hp: 34, dmg: 7, speed: 3.2, reach: 0.9, wind: 0.4, cd: 1.2, tier: 6, shape: 'slime', scale: 0.6, col: '#8a4aaa', em: '#c86aff', f2d: 'hue-rotate(230deg) saturate(1.5)', resist: { fire: -0.4 }, loot: [], gold: [0, 4], desc: 'A small piece of a Spore Mother, still hungry.', weak: 'Anything.' },
    brambletitan: { name: 'Bramble Titan', hp: 180, dmg: 17, speed: 2.4, reach: 2.0, wind: 0.8, cd: 2.0, tier: 6, scale: 2.2, ab: { slam: { cd: 9, r: 2.8, dmg: 1.2 } }, gab: { roots: { cd: 8 } }, resist: { melee: 0.25, ranged: 0.4, fire: -0.35 }, vis: { cloth: '#3a2a1a', cloth2: '#1e160e', skin: '#4a3a24', hair: '#3a5a1a', show: [], em: '#1a3a04', f2d: 'sepia(0.8) hue-rotate(40deg) brightness(0.6)' }, loot: [['rotwood', 0.6, 1, 2]], gold: [50, 140], desc: 'A tree that walks, and roots that come up through the ground to hold you.', weak: 'Fire. Step off the line the roots run along.' },
    rothound: { name: 'Rot Hound', hp: 58, dmg: 11, speed: 4.8, reach: 1.2, wind: 0.32, cd: 0.95, tier: 6, shape: 'hound', scale: 1.1, col: '#1a2a12', em: '#7aff2a', f2d: 'hue-rotate(70deg) brightness(0.6) saturate(1.5)', ab: { pack: true, poison: { dps: 5, dur: 6 } }, resist: { fire: -0.3 }, loot: [['rotwood', 0.3, 1, 1]], gold: [15, 60], desc: 'Packs of them, and every bite festers.', weak: 'Fire, and your back to a wall.' },
    hollowstag: { name: 'Hollow Stag', hp: 120, dmg: 15, speed: 4.2, reach: 1.6, wind: 0.6, cd: 1.5, tier: 6, shape: 'stag', scale: 1.3, col: '#1a1420', em: '#c86aff', f2d: 'grayscale(0.6) hue-rotate(240deg) brightness(0.6)', ab: { charge: { cd: 7 } }, gab: { howl: { cd: 12 } }, resist: { ranged: 0.2 }, loot: [['rotwood', 0.5, 1, 2], ['whiteantler', 0.1, 1, 1]], gold: [40, 120], desc: 'Hollow-eyed and hollow-chested. Its cry turns your legs to water.', weak: 'Sidestep the charge. Its cry passes; wait it out.' },
    witheredcrown: { name: 'the Withered Crown', hp: 980, dmg: 24, speed: 3.0, reach: 2.2, wind: 0.65, cd: 1.5, tier: 7, scale: 2.2, boss: true, ab: { summon: { kind: 'thornstalker', n: 2, cd: 14 }, teleport: { cd: 9 } }, gab: { roots: { cd: 7 }, spores: { cd: 8 } }, resist: { melee: 0.2, fire: -0.2 }, vis: { cloth: '#2a1a3a', cloth2: '#140a1e', skin: '#5a4a3a', hair: '#3a5a1a', show: ['robe', 'crown', 'cape'], em: '#3a0a5a', f2d: 'hue-rotate(250deg) saturate(1.4) brightness(0.8)' }, loot: [['sovereign', 1, 1, 1], ['rotwood', 1, 4, 6]], gold: [3000, 6000], desc: 'Whatever was king of this forest before it died, and has not stopped ruling.', weak: 'Burn it. Kill the stalkers it calls before they surround you.' }
  };
  const PHASES = {
    cindersovereign: { name: 'The sky catches fire', say: 'BURN WITH ME.', summon: ['cinderhound', 3], f: e => { e.gab = { ...(e.gab || e.foe.gab), meteor: { cd: 3.5 } }; e.dmgMul *= 1.2; e.rage = true; } },
    choirmother: { name: 'The flood rises', say: '*every voice in the city sings at once*', summon: ['gloomeel', 3], f: e => { e.gab = { ...(e.gab || e.foe.gab), flood: { cd: 5 } }; e.speed *= 1.15; e.rage = true; } },
    witheredcrown: { name: 'The wood closes in', say: 'You will grow here. Forever.', summon: ['thornstalker', 2], extra: ['sporemother', 1], f: e => { e.gab = { ...(e.gab || e.foe.gab), roots: { cd: 4 } }; e.dmgMul *= 1.2; e.rage = true; } }
  };
  // the living carpet of each world: colours of the ground, the rock and what flows
  const PAL = {
    ember: { floor: ['#3a2c24', '#3e2f26', '#372a22', '#41322a'], rock: ['#2a1e1a', '#1e1410'], liquid: '#ff6a1a', liquid2: '#ffb050', fog: '#2a0c04', hemi: '#ff9a6a', ground: '#3a1004', deco: ['rock', 'boulder'], decoCol: { rock: '#2a1e1a', darkstone: '#140c0a' } },
    abyss: { floor: ['#22363a', '#25393d', '#203337', '#283c40'], rock: ['#1e3438', '#10201e'], liquid: '#0a4a5a', liquid2: '#2ad8c8', fog: '#021a1e', hemi: '#6ad8d8', ground: '#04161a', deco: ['pillar', 'boulder'], decoCol: { stone: '#3a5a5a', rock: '#2a4a48', darkstone: '#1a2a2a' } },
    thorn: { floor: ['#2e2432', '#312636', '#2b2130', '#342a3a'], rock: ['#22182a', '#120a16'], liquid: '#4a1a6a', liquid2: '#c86aff', fog: '#160a20', hemi: '#c8a0ff', ground: '#10061a', deco: ['oakbare', 'bush'], decoCol: { wood: '#2a1e1a', darkwood: '#1a1210', leaf: '#3a2a4a' } }
  };

  const GW = ECHO.GateWorld = {
    DEFS, PHASES, PAL, cur: null, hz: [], lastZone: -1, zoneT: 0, ecoT: 0, spawnT: 0, hideT: 0, auraT: 0, warned: {},
    install() {
      Object.assign(ECHO.Monsters.DEFS, DEFS);
      Object.assign(ECHO.Quests.FOES, DEFS);
      Object.assign(ECHO.Monsters.PHASES, PHASES);
      if (ECHO.Gear) Object.assign(ECHO.Gear.MATS, {
        cinder: { name: 'cinderglass', value: 140, tier: 6, color: '#ff8a3a' },
        pearl: { name: 'abyssal pearls', value: 150, tier: 6, color: '#9ff8ff' },
        rotwood: { name: 'rotwood hearts', value: 140, tier: 6, color: '#c88aff' },
        sovereign: { name: 'sovereign\'s crown-shards', value: 2500, tier: 7, color: '#ffffff' }
      });
    },
    reset() { GW.cur = null; GW.hz = []; GW.lastZone = -1; GW.warned = {}; },
    inside(game) { const L = ECHO.Interior.cur; return L && L.type === 'gate' ? L : null; },
    level(game) { return ECHO.Prowess.level(game.pl); },
    building(g, s) { return { id: 'gate_' + g.id, type: 'gate', gate: g, x: Math.floor(g.x), y: Math.floor(g.y), w: 1, h: 1, s }; },
    portal(g) { return { x: g.x, y: g.y + 1.2 }; },

    // ------------------------------------------------------------ at the gate
    interactables(game) {
      const out = [], pe = game.pe, world = game.world;
      if (ECHO.Interior.cur || !world.gates) return out;
      for (const g of world.gates.list) {
        const p = GW.portal(g), d = U.dist(p.x, p.y, pe.x, pe.y);
        if (d < 2.6) out.push({ kind: 'act', label: `${U.cap(g.name)} — step through`, d: d * 0.5, act: () => GW.approach(game, g) });
      }
      return out;
    },
    approach(game, g) {
      const world = game.world, pl = game.pl, th = Gt().THEMES[g.theme], lv = GW.level(game);
      const ms = Gt().atGate(world, g);
      const who = ms.map(n => `${ECHO.People.fullTitle(world, n)}`).join(' and ');
      if (lv < Gt().MIN) return UI().toast(`The gate pushes back against you like a wall of water. Only those of level ${Gt().MIN} and above can stand this close and live.`, 'warn', 5);
      if (!pl.guard) {
        return UI().modal({ title: U.cap(g.name), html: `<p>${esc(th.blurb)}</p><p>Beyond it lies <b>${esc(th.world)}</b>: beasts of level ${Gt().MIN} at the door, up to level ${Gt().TOP} at its heart.</p><p class="dim">Only the National Guard may pass. ${ms.length ? `Speak to ${esc(who)} — they take recruits of level ${Gt().MIN} and above.` : 'The Guard is not at its post.'}</p>`, choices: [{ label: 'Step back', onPick: () => {} }] });
      }
      const choices = ms.map(n => { const D = Gt().def(n); return { label: `Go through with ${n.first} ${n.ng.title} (training)`, sub: `${D.skills.map(s => s[1]).join(' · ')} — they lead you to beasts your size and keep you alive`, onPick: () => GW.enter(game, g, n) }; });
      choices.push({ label: 'Go through alone', sub: 'No one to pull you out but the Guard at the door', onPick: () => GW.enter(game, g, null) });
      choices.push({ label: 'Not now', onPick: () => {} });
      UI().modal({ title: `Through ${g.name}`, html: `<p>Beyond: <b>${esc(th.world)}</b>. ${esc(th.blurb)}</p><p class="dim">Its regions grow deadlier the further you go from the gate: level ${Gt().BANDS[0][0]}–${Gt().BANDS[0][1]} by the door, ${Gt().TOP} at the heart. You are level ${lv}.</p>`, choices });
    },
    enter(game, g, mentor) {
      const world = game.world, pl = game.pl;
      GW.pendingMentor = mentor ? mentor.id : null;
      if (pl.guard) { pl.guard.trips = (pl.guard.trips || 0) + 1; if (mentor) pl.guard.mentor = mentor.id; }
      const s = ECHO.World.nearestSettlement(world, g.x, g.y) || world.settlements[0];
      ECHO.Interior.enter(game, GW.building(g, s), s);
    },
    // ------------------------------------------------------------ the world beyond
    layout(game, b, s, BASE) {
      const world = game.world, g = b.gate, th = Gt().THEMES[g.theme], P = PAL[g.theme];
      const W = 132, H = 112;
      const rng = new ECHO.RNG(ECHO.hashStr(g.id + ':' + world.seed + ':beyond'));
      const nz = ECHO.makeNoise((ECHO.hashStr(g.id) ^ world.seed) >>> 0), nz2 = ECHO.makeNoise((ECHO.hashStr(g.id + 'l') ^ world.seed) >>> 0);
      const rock = new Uint8Array(W * H), liquid = new Uint8Array(W * H), keep = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) { rock[i] = 1; continue; }
        const n = nz(x / 22, y / 22, 4);
        if (n > (g.theme === 'thorn' ? 0.6 : 0.62)) rock[i] = 1;
        const m = nz2(x / 26, y / 26, 3);
        if (g.theme === 'ember' ? Math.abs(m - 0.5) < 0.028 : g.theme === 'abyss' ? m > 0.66 : m > 0.7) liquid[i] = 1;
      }
      const ex = Math.floor(W / 2), ey = H - 7, hx = Math.floor(W / 2), hy = 12;
      const carve = (cx, cy, r) => { for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) { if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) continue; if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) { const i = y * W + x; rock[i] = 0; liquid[i] = 0; keep[i] = 1; } } };
      // the road through: from the door, across every region, to the heart
      const way = [{ x: ex, y: ey }];
      for (let i = 0; i < 7; i++) way.push({ x: W / 2 + (rng.next() - 0.5) * W * 0.55, y: ey - (ey - hy) * (i + 0.6) / 7.2 });
      way.push({ x: hx, y: hy });
      for (let k = 0; k < way.length - 1; k++) { const a = way[k], c = way[k + 1], n = Math.ceil(U.dist(a.x, a.y, c.x, c.y)); for (let t = 0; t <= n; t++) carve(U.lerp(a.x, c.x, t / n), U.lerp(a.y, c.y, t / n), 2.2); }
      carve(ex, ey, 6); carve(hx, hy, 9);
      // clearings where things lair, three to a region
      const clearings = [];
      for (let z = 0; z < 7; z++) for (let k = 0; k < (z === 6 ? 1 : 3); k++) {
        const t = (z + rng.next()) / 7, cy = ey - (ey - hy) * t, cx = 10 + rng.next() * (W - 20);
        const r = 3.5 + rng.next() * 3;
        carve(cx, cy, r); clearings.push({ x: cx, y: cy, r, z });
        // and a way to it from the road
        const near = way.reduce((b0, p) => U.dist(p.x, p.y, cx, cy) < U.dist(b0.x, b0.y, cx, cy) ? p : b0, way[0]), n = Math.ceil(U.dist(near.x, near.y, cx, cy));
        for (let tt = 0; tt <= n; tt++) carve(U.lerp(near.x, cx, tt / n), U.lerp(near.y, cy, tt / n), 1.4);
      }
      // what cannot be reached from the door is rock
      const dist = new Float32Array(W * H).fill(-1), q = [ey * W + ex];
      dist[ey * W + ex] = 0;
      for (let h = 0; h < q.length; h++) {
        const i = q[h], x = i % W, y = (i / W) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = (y + dy) * W + x + dx; if (dist[j] >= 0 || rock[j] || liquid[j]) continue; dist[j] = dist[i] + 1; q.push(j); }
      }
      for (let i = 0; i < W * H; i++) if (dist[i] < 0 && !rock[i] && !liquid[i]) rock[i] = 1;
      // regions by how far the walk from the door is
      const dHeart = Math.max(30, dist[hy * W + hx]);
      const zone = new Uint8Array(W * H);
      for (let i = 0; i < W * H; i++) zone[i] = dist[i] < 0 ? 0 : Math.min(6, Math.floor(dist[i] / dHeart * 6.6));
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (U.dist(x, y, hx, hy) <= 9) zone[y * W + x] = 6;
      // the colour of the ground: drifting patches, darker and redder toward the heart
      const fcol = new Array(W * H), P0 = PAL[g.theme];
      const hx2 = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
      const ca = hx2(P0.floor[0]), cb = hx2(P0.floor[3]), cz = hx2(P0.liquid);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, n = nz(x / 7 + 40, y / 7 + 40, 3), t = U.clamp((n - 0.3) * 2, 0, 1), z = (zone[i] || 0) / 6;
        const c = [0, 1, 2].map(k => Math.round((ca[k] * (1 - t) + cb[k] * t) * (1 - z * 0.25) + cz[k] * z * 0.12));
        fcol[i] = '#' + c.map(v => U.clamp(v, 0, 255).toString(16).padStart(2, '0')).join('');
      }
      const blocked = new Uint8Array(W * H);
      for (let i = 0; i < W * H; i++) blocked[i] = rock[i] || liquid[i] ? 1 : 0;
      const L = { id: b.id, b, s, type: 'gate', gate: g, theme: g.theme, W, H, floor: g.theme, wall: g.theme, cave: true, carved: true, G: { rooms: [] }, rev: 0,
        furn: [], spots: [], lights: [], webs: [], traps: [], blocked, rock, liquid, zone, dist, seen: new Uint8Array(W * H).fill(1), way, clearings,
        entrance: { x: ex + 0.5, y: ey + 0.5 }, heart: { x: hx + 0.5, y: hy + 0.5 }, pal: P, fcol };
      const f = (model, x, y, o = {}) => {
        const it = { model, x, y, rot: o.rot || 0, w: o.w || 1, h: o.h || 1, solid: o.solid !== false, action: o.action || null, label: o.label || null, light: o.light || null, colors: o.colors || null, scale: o.scale || 1, tag: o.tag || null };
        L.furn.push(it);
        if (it.solid) blocked[Math.floor(y) * W + Math.floor(x)] = 1;
        if (it.light) L.lights.push({ x: BASE + x, y, ...it.light });
        return it;
      };
      // the way home: the gate's other face
      f('rift', ex + 0.5, ey + 3.2, { solid: false, action: 'gateexit', label: `Step back through ${g.name}`, scale: 1.3, colors: { rune: th.glow }, light: { r: 7, a: 1.5, color: th.glow, h: 1.4 } });
      // the throne at the heart
      f('throne', hx + 0.5, hy - 4.5, { colors: { gold: th.color, wood: '#1a1210' }, scale: 1.6, light: { r: 8, a: 1.4, color: th.color, h: 1.6 } });
      // what grows and lies about
      const open = [];
      for (let y = 3; y < H - 3; y++) for (let x = 3; x < W - 3; x++) { const i = y * W + x; if (!blocked[i] && !keep[i] && U.dist(x, y, ex, ey) > 8) open.push(i); }
      for (let k = 0; k < 120 && open.length; k++) {
        const i = open.splice(rng.int(0, open.length - 1), 1)[0], x = i % W, y = (i / W) | 0;
        const m = P.deco[rng.int(0, P.deco.length - 1)];
        const big = m === 'boulder' || m === 'oakbare' || m === 'pillar';
        f(m, x + 0.5, y + 0.5, { solid: big, scale: m === 'rock' ? 0.5 + rng.next() * 0.6 : m === 'oakbare' ? 0.9 + rng.next() * 0.6 : m === 'pillar' ? 0.8 + rng.next() * 0.5 : 0.7 + rng.next() * 0.6, rot: rng.next() * 6.28, colors: P.decoCol });
      }
      // glowing places: fire in the cracks, pale lights in the water, spore-light in the rot
      let lights = 0;
      for (let k = 0; k < 4000 && lights < 36; k++) {
        const i = rng.int(0, W * H - 1);
        if (!liquid[i]) continue;
        const x = i % W, y = (i / W) | 0;
        if (L.lights.some(l => U.dist(l.x - BASE, l.y, x, y) < 7)) continue;
        L.lights.push({ x: BASE + x + 0.5, y: y + 0.5, r: 5, a: 1.1, color: P.liquid2, h: 0.5 }); lights++;
      }
      L.inside = { x: BASE + ex + 0.5, y: ey + 1.0 };
      L.outside = { x: g.x, y: g.y + 2.6 };
      L.name = U.cap(th.world);
      return L;
    },
    zoneAt(L, x, y) {
      const B = ECHO.Interior.BASE, tx = Math.floor(x - B), ty = Math.floor(y);
      if (tx < 0 || ty < 0 || tx >= L.W || ty >= L.H) return 0;
      return L.zone[ty * L.W + tx];
    },
    zoneName(L, z) { return Gt().THEMES[L.theme].zones[z]; },
    // a free spot in a region, away from someone
    spotIn(L, z, away, minD) {
      const B = ECHO.Interior.BASE;
      for (let k = 0; k < 400; k++) {
        const c = L.clearings.filter(c => c.z === z);
        let x, y;
        if (c.length && Math.random() < 0.6) { const cl = c[Math.floor(Math.random() * c.length)]; const a = Math.random() * 6.28, r = Math.random() * cl.r; x = Math.floor(cl.x + Math.cos(a) * r); y = Math.floor(cl.y + Math.sin(a) * r); }
        else { x = 3 + Math.floor(Math.random() * (L.W - 6)); y = 3 + Math.floor(Math.random() * (L.H - 6)); }
        const i = y * L.W + x;
        if (i < 0 || i >= L.W * L.H || L.blocked[i] || L.zone[i] !== z || L.dist[i] < 0) continue;
        if (U.dist(x, y, L.entrance.x, L.entrance.y) < 17) continue;   // the door is a place to catch your breath
        if (away && U.dist(B + x + 0.5, y + 0.5, away.x, away.y) < (minD || 0)) continue;
        return { x: B + x + 0.5, y: y + 0.5 };
      }
      return null;
    },
    spawn(game, L, kind, lvl, at, o = {}) {
      const e = ECHO.Monsters.make(game, kind, at.x, at.y, Math.round(lvl), { eliteChance: o.elite != null ? o.elite : 0.12, noElite: !!o.noElite, aggro: !!o.aggro });
      e.indoor = false; e.gateMon = true; e.gateXp = 3; e.gate = L.gate.id; e.floor = 0; e.home = { x: at.x, y: at.y };
      e.baseScale = e.scale; e.grown = 0;
      if (o.label) e.label = o.label;
      game.ents.push(e);
      return e;
    },
    populate(game, L) {
      const world = game.world, g = L.gate, th = Gt().THEMES[g.theme], B = Gt().BANDS;
      g.visits = (g.visits || 0) + 1; g.found = true;
      GW.hz = []; GW.lastZone = -1; GW.ecoT = 2; GW.spawnT = 6; GW.hideT = 0;
      const per = [12, 11, 10, 9, 8, 7, 3];
      for (let z = 0; z < 7; z++) for (let k = 0; k < per[z]; k++) {
        const at = GW.spotIn(L, z); if (!at) continue;
        GW.spawn(game, L, th.roster[Math.floor(Math.random() * th.roster.length)], B[z][0] + Math.random() * (B[z][1] - B[z][0]), at);
      }
      // the apex beasts remembered from before
      for (const a of (g.apex || []).slice(0, 5)) { const at = GW.spotIn(L, Gt().zoneFor(a.lvl)); if (at) { const e = GW.spawn(game, L, a.kind, a.lvl, at, { noElite: true, label: a.name }); e.grown = a.grown || 3; e.scale = Math.min(e.baseScale * 1.45, e.baseScale * (1 + 0.04 * e.grown)); e.apexId = a.id; } }
      // the sovereign on its throne
      if (!g.slain) { const e = GW.spawn(game, L, th.sovereign, Gt().TOP, { x: L.heart.x + ECHO.Interior.BASE, y: L.heart.y - 1 }, { noElite: true }); e.sovereign = true; }
      // your mentor comes through with you; a companion too weak for this world waits outside
      const m = GW.pendingMentor && world.npcs[GW.pendingMentor];
      GW.pendingMentor = null;
      if (m && m.status === 'alive' && ECHO.Guard) ECHO.Guard.spawnMentor(game, m, L);
      for (const e of game.ents) if (e.isCompanion && !e.dead) {
        const n = world.npcs[e.npcId];
        if (n && GW.holdsBack(game, n)) { e.dead = true; e.vanish = true; UI().toast(`${n.first} stays at the gate — the menace would stop ${n.sex === 'f' ? 'her' : 'his'} heart in there.`, 'info', 4); }
      }
      if (g.visits === 1) setTimeout(() => UI().toast(`The further from the gate, the deadlier: level ${B[0][0]} here, ${Gt().TOP} at the heart. The beasts hunt each other, and grow on what they kill.`, 'legend', 8), 900);
      if (ECHO.Music) ECHO.Music.stinger('discover');
    },
    // A companion below level 150 cannot follow you through.
    holdsBack(game, n) { return !!GW.inside(game) && (!ECHO.Delvers || ECHO.Delvers.lv(n) < Gt().MIN); },

    // ------------------------------------------------------------ every frame
    update(game, dt) {
      const L = GW.inside(game), pl = game.pl;
      if (pl._aegis > 0) pl._aegis -= dt;
      if (pl.rootT > 0) pl.rootT -= dt;
      if (!L) { GW.cur = null; if (GW.hz.length) GW.hz = []; GW.outside(game, dt); return; }
      GW.cur = L.gate;
      GW.veil(null);
      GW.hazards(game, L, dt);
      // the region you are in, said once as you enter it
      const z = GW.zoneAt(L, game.pe.x, game.pe.y);
      if (z !== GW.lastZone) {
        GW.zoneT += dt;
        if (GW.zoneT > 1.2 || GW.lastZone < 0) {
          const first = GW.lastZone < 0;
          GW.lastZone = z; GW.zoneT = 0;
          const b = Gt().BANDS[z], D = ECHO.Prowess.diff(b[0], GW.level(game));
          if (!first) UI().banner(U.cap(GW.zoneName(L, z)), `Level ${b[0]}–${b[1]} · ${D.word.toLowerCase()} for you`, true);
        }
      } else GW.zoneT = 0;
      // what is far away sleeps (and can't be seen); things that hide, hide
      GW.hideT -= dt;
      if (GW.hideT <= 0) {
        GW.hideT = 0.4;
        for (const e of game.ents) {
          if (!e.gateMon || e.dead) continue;
          const d = U.dist(e.x, e.y, game.pe.x, game.pe.y);
          const gb = e.foe.gab, lurk = !!(gb && (gb.lure || gb.camo) && !e.aggro && d > (gb.camo ? 4.5 : 5.5));
          const far = d > 34 && !e.aggro && !e.sovereign;
          e.hidden = far || lurk || !!e.submerged;
          e.lurking = lurk && !far;
        }
      }
      // survival of the fittest, out of sight
      GW.ecoT -= dt;
      if (GW.ecoT <= 0) { GW.ecoT = 1.5; GW.ecology(game, L); }
      // the gate world breeds more
      GW.spawnT -= dt;
      if (GW.spawnT <= 0) {
        GW.spawnT = 5;
        const alive = game.ents.filter(e => e.gateMon && !e.dead).length;
        if (alive < 52) {
          const th = Gt().THEMES[L.theme];
          for (let k = 0; k < 2; k++) {
            const zz = Math.floor(Math.random() * 6), at = GW.spotIn(L, zz, game.pe, 28);
            if (at) { const B = Gt().BANDS[zz]; GW.spawn(game, L, th.roster[Math.floor(Math.random() * th.roster.length)], B[0] + Math.random() * (B[1] - B[0]), at); }
          }
        }
      }
    },
    // ------------------------------------------------------------ hazards on the ground
    // kind: fire, spore, ash, flood, heal, burst (one blow after a warning)
    hazard(o) {
      const h = { t: 0, warn: 0, frac: 0.05, r: 1, life: 3, kind: 'fire', ...o };
      GW.hz.push(h);
      const col = { fire: 'rgba(255,70,0,0.45)', spore: 'rgba(190,90,255,0.3)', ash: 'rgba(120,110,100,0.38)', flood: 'rgba(40,200,200,0.3)', heal: 'rgba(255,230,140,0.3)', burst: 'rgba(255,80,40,0.3)', root: 'rgba(110,200,60,0.3)' }[h.kind] || 'rgba(255,90,60,0.3)';
      ECHO.Combat.telegraph({ x: h.x, y: h.y, radius: h.r, life: h.warn || h.life, shape: 'circle', color: col });
      if (h.warn && h.kind !== 'burst') ECHO.Combat.telegraph({ x: h.x, y: h.y, radius: h.r, life: h.warn + h.life, shape: 'circle', color: col });
      return h;
    },
    hazards(game, L, dt) {
      const pe = game.pe, pl = game.pl;
      for (const h of GW.hz) {
        h.t += dt;
        const live = h.t >= h.warn;
        const pcol = { fire: '#ff7a2a', spore: '#c86aff', ash: '#8a8078', flood: '#2ad8c8', heal: '#ffe08a', burst: '#ff5a1a', root: '#7aca3a' }[h.kind];
        if (live && Math.random() < dt * (h.kind === 'heal' ? 8 : 12)) { const a = Math.random() * 6.28, r = Math.random() * h.r; ECHO.Combat.fx.push({ kind: 'p', x: h.x + Math.cos(a) * r, y: h.y + Math.sin(a) * r, vx: 0, vy: -0.8 - Math.random(), t: 0, life: 0.7, color: pcol, size: 2 }); }
        if (h.kind === 'burst') {
          if (!h.done && live) {
            h.done = true;
            ECHO.Combat.burst(h.x, h.y, pcol, 24, 5, 0.7, 3); ECHO.Combat.ring(h.x, h.y, h.r, 'rgba(255,140,60,0.9)', 0.5); game.shake(0.25);
            if (U.dist(h.x, h.y, pe.x, pe.y) < h.r + pe.r) GW.hurtPlayer(game, h.frac * GW.gapMul(game, h.lvl), h.from, 'fire', h.kind);
          }
          continue;
        }
        if (!live) continue;
        const inside = U.dist(h.x, h.y, pe.x, pe.y) < h.r + pe.r * 0.5;
        if (h.kind === 'heal') {
          if (inside) { pe.hp = Math.min(pl.maxHp, pe.hp + pl.maxHp * h.frac * dt); pl.hp = pe.hp; }
          continue;
        }
        if (!inside) continue;
        if (h.kind === 'ash' || h.kind === 'flood') pl.slowT = Math.max(pl.slowT || 0, 0.3);
        GW.hurtPlayer(game, h.frac * dt * GW.gapMul(game, h.lvl), h.from, h.kind === 'fire' ? 'fire' : 'magic', h.kind);
      }
      GW.hz = GW.hz.filter(h => h.t < h.warn + h.life);
    },
    // a beast far above you hurts more; one far below, less
    gapMul(game, lvl) { return U.clamp(1 + ((lvl || GW.level(game)) - GW.level(game)) / 160, 0.4, 3); },
    // a share of your life, lost (and the death it can bring)
    hurtPlayer(game, frac, from, type, why) {
      const pe = game.pe, pl = game.pl;
      if (game.defeating || pl.capture || pe.dead) return;
      if (pl.flying && why !== 'menace') return;   // burning ground and floods are far below a dragon's back
      let dmg = pl.maxHp * frac;
      if (pl._aegis > 0) dmg *= 0.33;
      if (why !== 'menace') dmg = game.grit(dmg);
      game.logHit(from && from.foe ? from : from, dmg, why === 'spore' ? 'rot cloud' : why === 'ash' ? 'ash cloud' : why === 'flood' ? 'dragged under' : why === 'burst' ? 'eruption' : why === 'menace' ? '' : 'burning ground');
      pe.hp -= dmg; pl.hp = pe.hp;
      GW._ft = (GW._ft || 0) - 1;
      if (GW._ftT == null || game.time - GW._ftT > 0.5) { GW._ftT = game.time; ECHO.Combat.floater(pe.x, pe.y - 1, why === 'spore' ? 'rot' : why === 'ash' ? 'choking' : why === 'flood' ? 'dragged under' : why === 'menace' ? 'the menace' : 'burning', '#ff8a6a'); game.hurtFlash(0.25); }
      if (pe.hp <= 0) ECHO.Combat.kill(pe, from || null, type || 'magic');
    },

    // ------------------------------------------------------------ the hunters hunt each other
    power(e) { return (e.lvl || 1) * (e.sovereign ? 4 : e.boss2 ? 2.5 : e.elite ? 1.4 : 1) * (e.hp / e.maxHp * 0.5 + 0.5); },
    ecology(game, L) {
      const pe = game.pe, mons = game.ents.filter(e => e.gateMon && !e.dead && !e.sovereign && !e.summoner);
      // near you: they pick fights you can watch
      for (const a of mons) {
        if (a.prey || a.aggro || U.dist(a.x, a.y, pe.x, pe.y) > 26 || Math.random() > 0.35) continue;
        let best = null, bd = 8;
        for (const b of mons) {
          if (b === a || b.species === a.species || b.prey || b.aggro) continue;
          const d = U.dist(a.x, a.y, b.x, b.y);
          if (d < bd && GW.power(a) > GW.power(b) * 1.15) { bd = d; best = b; }
        }
        if (best) { a.prey = best; best.prey = a; }
      }
      // out of sight: the stronger simply wins
      const far = mons.filter(e => U.dist(e.x, e.y, pe.x, pe.y) > 30);
      for (let k = 0; k < 1 && far.length > 1; k++) {
        const a = far[Math.floor(Math.random() * far.length)];
        const b = far.find(o => o !== a && o.species !== a.species && U.dist(o.x, o.y, a.x, a.y) < 12 && !o.dead);
        if (!b || Math.random() > 0.3) continue;
        const pa = GW.power(a) * (0.7 + Math.random() * 0.6), pb = GW.power(b) * (0.7 + Math.random() * 0.6);
        const [w, l] = pa >= pb ? [a, b] : [b, a];
        l.dead = true; l.vanish = true;
        GW.grow(game, w, l, false);
      }
    },
    // what kills, eats, and grows
    grow(game, e, prey, seen) {
      const old = e.lvl || 1;
      const gain = Math.max(2, Math.round((prey.lvl || 1) * 0.05));
      const L = Math.min(Gt().TOP, old + gain);
      const a = ECHO.Prowess.foeMul(old, e.boss2), b = ECHO.Prowess.foeMul(L, e.boss2);
      e.lvl = L; e._plv = L;
      e.maxHp = Math.round(e.maxHp * b.hp / a.hp); e.hp = Math.min(e.maxHp, e.hp * b.hp / a.hp + e.maxHp * 0.4);
      e.dmgMul *= b.dmg / a.dmg;
      e.grown = (e.grown || 0) + 1;
      e.scale = Math.min((e.baseScale || 1) * 1.45, (e.baseScale || 1) * (1 + 0.04 * e.grown));
      const nm = (e.foe && e.foe.name) || 'beast';
      if (e.grown === 3 && !e.boss2) e.label = `Gorged ${nm.toLowerCase()}`;
      const band = Gt().BANDS[Gt().zoneFor(old)];
      if (!e.apexId && e.grown >= 5 && L > band[1] && !e.boss2) GW.makeApex(game, e);
      if (e.apexId) { const g = GW.cur && game.world.gates && game.world.gates.list.find(x => x.id === e.gate); const a2 = g && (g.apex || []).find(x => x.id === e.apexId); if (a2) { a2.lvl = L; a2.grown = e.grown; } }
      e.prey = null;
      if (seen) {
        ECHO.Combat.floater(e.x, e.y - 1.6, `devours it — Lv ${L}`, '#ff9a7a', true);
        ECHO.Combat.burst(e.x, e.y, '#7a1d24', 18, 3, 0.6, 3);
        if (!GW._ateTold) { GW._ateTold = true; UI().toast('It ate what it killed — and grew. Beasts here get stronger on each other. Kill the winners before they grow too big.', 'study', 7); }
      }
    },
    makeApex(game, e) {
      const g = game.world.gates.list.find(x => x.id === e.gate);
      if (!g) return;
      const names = ['the Glutton', 'Old Hunger', 'the Unbroken', 'Many-Mouths', 'the Last One Standing', 'the Hollow King\'s Dog', 'Grief', 'the Patient One'];
      const nm = `${names[Math.floor(Math.random() * names.length)]} (${(e.foe.name || 'beast').toLowerCase()})`;
      e.apexId = 'ax' + Date.now().toString(36) + Math.floor(Math.random() * 99);
      e.label = nm;
      g.apex = (g.apex || []).concat([{ id: e.apexId, kind: e.species, lvl: e.lvl, grown: e.grown, name: nm }]).sort((a, b) => b.lvl - a.lvl).slice(0, 5);
      if (U.dist(e.x, e.y, game.pe.x, game.pe.y) < 30) UI().toast(`A beast has eaten its way to the top: ${nm}, level ${e.lvl}. It will remember this place.`, 'warn', 6);
    },
    // A beast's own thinking, before the usual: hunting another beast, or lurking.
    think(game, e, dt) {
      if (e.hidden && !e.aggro && !e.lurking) { e.moving = false; return true; }
      const pe = game.pe, world = game.world;
      if (e.submerged) return GW.ability(game, e, dt, U.dist(e.x, e.y, pe.x, pe.y), Math.atan2(pe.y - e.y, pe.x - e.x));
      if (e.aggro) { e.prey = null; return false; }
      const p = e.prey;
      if (p) {
        if (p.dead || U.dist(e.x, e.y, p.x, p.y) > 16) { e.prey = null; return false; }
        // the player close and seen: forget the fight
        const dP = U.dist(e.x, e.y, pe.x, pe.y);
        if (dP < 4) { e.prey = null; return false; }
        const d = U.dist(e.x, e.y, p.x, p.y), ang = Math.atan2(p.y - e.y, p.x - e.x), F = e.foe;
        e.dir = ang; e.flip = Math.cos(ang) < 0; e.target = p;
        if (d > F.reach + p.r) ECHO.Ent.travel(world, e, p.x, p.y, e.speed * 0.95, dt);
        else {
          e.moving = false;
          if (e.cd <= 0) {
            e.cd = F.cd * 1.15; e.attackT = 0.2; e.state = 'attack'; e.t = 0;
            ECHO.Combat.slash(e.x, e.y, ang, F.reach + 0.2, 1.6, 'rgba(255,120,90,0.7)');
            const hit = ECHO.Combat.damage(p, F.dmg * e.dmgMul * (0.85 + Math.random() * 0.3), { type: 'melee', from: e, angle: ang, knock: 0.25 });
            if (p.dead && hit) GW.grow(game, e, p, true);
          } else if (e.t > 0.25) e.state = 'chase';
        }
        return true;
      }
      // lurkers wait; the rest roam their ground
      if (e.lurking) { e.moving = false; return true; }
      if (U.dist(e.x, e.y, pe.x, pe.y) < 13) return false;
      if (!e.wander || U.dist(e.x, e.y, e.wander.x, e.wander.y) < 0.6 || Math.random() < dt * 0.04) { const a = Math.random() * 6.28, r = 2 + Math.random() * 4; e.wander = { x: e.home.x + Math.cos(a) * r, y: e.home.y + Math.sin(a) * r }; }
      if (!ECHO.Interior.isSolid(e.wander.x, e.wander.y)) ECHO.Ent.seek(world, e, e.wander.x, e.wander.y, e.speed * 0.3, dt, 0.4); else e.wander = null;
      e.state = 'idle';
      return true;
    },

    // ------------------------------------------------------------ their own ways of fighting
    // Called before the usual abilities: true when the beast spent this frame on one.
    ability(game, e, dt, d, ang) {
      const ab = e.gab || e.foe.gab;
      if (!ab) return false;
      const pe = game.pe, pl = game.pl, F = e.foe, world = game.world;
      e.gabT = e.gabT || {};
      for (const k in e.gabT) e.gabT[k] -= dt;
      const ready = k => ab[k] && (e.gabT[k] || 0) <= 0;
      const use = (k, cd) => { e.gabT[k] = (cd != null ? cd : ab[k].cd) * (e.cdMul || 1); };
      const hit = (mul, type, knock) => ECHO.Combat.damage(pe, F.dmg * e.dmgMul * mul, { type: type || 'melee', from: e, angle: Math.atan2(pe.y - e.y, pe.x - e.x), knock: knock || 0.3 });
      const los = () => ECHO.Ent.lineOfSight(world, e.x, e.y, pe.x, pe.y);
      // a cast in progress
      if (e.gcast) {
        const c = e.gcast; c.t += dt; e.moving = false;
        if (c.t >= c.wind) {
          e.gcast = null; e.state = 'chase'; e.cd = 0.8;
          if (c.k === 'breath') {
            for (let i = 0; i < 14; i++) { const a = c.ang + (Math.random() - 0.5) * c.arc, r = Math.random() * c.len; ECHO.Combat.fx.push({ kind: 'p', x: e.x + Math.cos(a) * r, y: e.y + Math.sin(a) * r, vx: Math.cos(a) * 4, vy: Math.sin(a) * 4, t: 0, life: 0.6, color: Math.random() < 0.5 ? '#ffb347' : '#ff5a1f', size: 3 }); }
            const dd = U.dist(e.x, e.y, pe.x, pe.y), aa = Math.atan2(pe.y - e.y, pe.x - e.x);
            if (dd < c.len && Math.abs(U.angleDiff(aa, c.ang)) < c.arc / 2) { hit(1.6, 'fire', 0.5); pe.burn = Math.max(pe.burn || 0, 1.5); }
            game.shake(0.2);
          } else if (c.k === 'roots') {
            const ux = Math.cos(c.ang), uy = Math.sin(c.ang);
            for (let s = 1; s < c.len; s += 0.8) ECHO.Combat.burst(e.x + ux * s, e.y + uy * s, '#6aca3a', 4, 2, 0.5, 2);
            const px = pe.x - e.x, py = pe.y - e.y, along = px * ux + py * uy, off = Math.abs(px * uy - py * ux);
            if (along > 0 && along < c.len && off < 0.9) { hit(1.3, 'melee', 0.1); pl.rootT = 1.5; ECHO.Combat.floater(pe.x, pe.y - 1.1, 'rooted', '#7aca3a'); }
          } else if (c.k === 'song') { /* the song ends */ }
          return true;
        }
        if (c.k === 'song') {
          // your feet walk you to it
          const a = Math.atan2(e.y - pe.y, e.x - pe.x);
          if (U.dist(e.x, e.y, pe.x, pe.y) > 1.6 && !(pe.iframes > 0)) { pe.kbx += Math.cos(a) * dt * 2.2; pe.kby += Math.sin(a) * dt * 2.2; }
          if (e.hurtT > 0.15) { e.gcast = null; e.state = 'chase'; ECHO.Combat.floater(e.x, e.y - 1.4, 'the song breaks', '#9ff8ff'); }
          if (Math.random() < dt * 10) ECHO.Combat.fx.push({ kind: 'p', x: e.x + (Math.random() - 0.5), y: e.y - 1 + (Math.random() - 0.5), vx: (pe.x - e.x) * 0.6, vy: (pe.y - e.y) * 0.6, t: 0, life: 0.8, color: '#9ff8ff', size: 2 });
        }
        return true;
      }
      // sunk into the ground
      if (e.submerged) {
        e.subT -= dt; e.moving = false; e.hidden = true;
        if (e.subT <= 0) {
          e.submerged = false; e.hidden = false;
          const sp = ECHO.Ent.freeSpot(world, pe.x + Math.cos(e.aim || 0) * 0.8, pe.y + Math.sin(e.aim || 0) * 0.8, 2) || { x: e.x, y: e.y };
          e.x = sp.x; e.y = sp.y;
          ECHO.Combat.burst(e.x, e.y, '#2ad8c8', 20, 4, 0.6, 3);
          if (U.dist(e.x, e.y, pe.x, pe.y) < 1.6) hit(1.4, 'melee', 0.5);
          e.cd = 1;
        }
        return true;
      }
      if (!e.aggro) return false;
      // the ground burns where it runs
      if (ab.trail && e.moving && ready('trail')) { use('trail'); GW.hazard({ x: e.x, y: e.y, r: 0.7, life: 2.2, frac: 0.035, kind: 'fire', from: e, lvl: e.lvl }); }
      // the ground erupts where it points
      if (ready('erupt') && d < 10 && e.cd <= 0.3) {
        use('erupt');
        for (let i = 0; i < ab.erupt.n; i++) { const a = Math.random() * 6.28, r = i === 0 ? 0 : 1.6 + Math.random() * 2; GW.hazard({ x: pe.x + Math.cos(a) * r, y: pe.y + Math.sin(a) * r, r: 1.4, warn: 1.05, life: 0.2, frac: 0.14, kind: 'burst', from: e, lvl: e.lvl }); }
        e.say = 'RRRMMM'; e.sayT = 1;
        return false;
      }
      // a choking cloud
      if (ready('ash') && d < 6) { use('ash'); GW.hazard({ x: pe.x, y: pe.y, r: 2.6, life: 4.5, frac: 0.018, kind: 'ash', from: e, lvl: e.lvl }); ECHO.Combat.floater(pe.x, pe.y - 1.2, 'ash!', '#a89890'); }
      // breath of fire
      if (ready('breath') && d < ab.breath.len - 0.5 && d > 1.2 && e.cd <= 0.3 && los()) {
        use('breath');
        e.gcast = { k: 'breath', t: 0, wind: 0.85, ang, len: ab.breath.len, arc: ab.breath.arc }; e.state = 'cast'; e.aim = ang; e.dir = ang;
        ECHO.Combat.telegraph({ x: e.x, y: e.y, angle: ang, len: ab.breath.len, arc: ab.breath.arc, life: 0.85, shape: 'cone', color: 'rgba(255,120,40,0.3)', follow: e });
        return true;
      }
      // stone that will not break
      if (ready('harden') && e.hp < e.maxHp * 0.75) {
        use('harden'); e.hardT = ab.harden.dur; e._res0 = e._res0 || { ...e.resist };
        e.resist = { melee: 0.9, ranged: 0.95, fire: 0.95, magic: 0.9 }; e.rage = true;
        ECHO.Combat.ring(e.x, e.y, 1.6, 'rgba(255,240,220,0.9)', 0.6); ECHO.Combat.floater(e.x, e.y - 1.6, 'hardens', '#fff0e0');
      }
      if (e.hardT > 0) { e.hardT -= dt; if (e.hardT <= 0) { e.resist = e._res0 || {}; e.rage = false; ECHO.Combat.floater(e.x, e.y - 1.6, 'cools', '#ffb080'); } }
      // into the ground, and up under you
      if (ready('submerge') && d < 9 && e.hp < e.maxHp * 0.9) {
        use('submerge'); e.submerged = true; e.subT = 1.5; e.hidden = true; e.aim = Math.random() * 6.28;
        ECHO.Combat.burst(e.x, e.y, '#2ad8c8', 16, 3, 0.5, 2);
        ECHO.Combat.telegraph({ x: pe.x, y: pe.y, radius: 1.3, life: 1.5, shape: 'circle', color: 'rgba(40,220,210,0.3)' });
        return true;
      }
      // the song
      if (ready('song') && d < 10 && d > 2 && los()) {
        use('song'); e.gcast = { k: 'song', t: 0, wind: ab.song.dur }; e.state = 'cast';
        ECHO.Combat.floater(pe.x, pe.y - 1.3, 'the song pulls you', '#9ff8ff');
        if (!GW._songTold) { GW._songTold = true; UI().toast('A siren\'s song drags you toward it. Hurt it to break the song, or fight the pull by walking away.', 'study', 6); }
        return true;
      }
      // a blow returned for every blow
      if (ab.riposte && e.hurtT > 0.12 && !e._ripT && d < F.reach + 0.8) {
        e._ripT = 1.2; e.cd = 0;
        ECHO.Combat.slash(e.x, e.y, ang, F.reach + 0.2, 1.8, 'rgba(160,240,230,0.85)'); hit(0.8, 'melee', 0.4);
        ECHO.Combat.floater(e.x, e.y - 1.4, 'riposte', '#bff8f0');
      }
      if (e._ripT) { e._ripT -= dt; if (e._ripT <= 0) e._ripT = 0; }
      // all arms
      if (ready('grab') && d < 2.6) {
        use('grab'); pl.rootT = ab.grab.dur;
        GW.hazard({ x: pe.x, y: pe.y, r: 1, life: ab.grab.dur, frac: 0.035, kind: 'flood', from: e, lvl: e.lvl });
        ECHO.Combat.floater(pe.x, pe.y - 1.2, 'grabbed!', '#2ad8c8');
        hit(0.6, 'melee', 0);
      }
      // the stalker shows itself, and strikes
      if (ab.camo && e.lurking === false && !e._sprung && d < 4.6) {
        e._sprung = true; ECHO.Combat.floater(e.x, e.y - 1.2, 'ambush!', '#7aff3a', true);
        if (d < 2.2) hit(1.8, 'melee', 0.4);
      }
      // rot in the air
      if (ready('spores') && d < 9) { use('spores'); GW.hazard({ x: pe.x + (Math.random() - 0.5) * 1.5, y: pe.y + (Math.random() - 0.5) * 1.5, r: 2.2, life: 5, frac: 0.03, kind: 'spore', from: e, lvl: e.lvl }); }
      // roots through the ground in a line
      if (ready('roots') && d < 9 && d > 1.5 && e.cd <= 0.3 && los()) {
        use('roots'); e.gcast = { k: 'roots', t: 0, wind: 0.9, ang, len: Math.min(10, d + 2) }; e.state = 'cast';
        ECHO.Combat.telegraph({ x: e.x, y: e.y, angle: ang, len: Math.min(10, d + 2), width: 1.6, life: 0.9, shape: 'line', color: 'rgba(110,200,60,0.32)' });
        return true;
      }
      // a cry that turns your legs to water
      if (ready('howl') && d < 9) {
        use('howl'); pl.slowT = Math.max(pl.slowT || 0, 2.5);
        ECHO.Combat.ring(e.x, e.y, 5, 'rgba(200,106,255,0.8)', 0.7); ECHO.Combat.floater(pe.x, pe.y - 1.2, 'terror', '#c86aff');
        for (const o of game.ents) if (o.gateMon && !o.dead && o !== e && U.dist(o.x, o.y, e.x, e.y) < 10) o.aggro = true;
      }
      // the sovereigns' rage: fire from the sky, the city flooding
      if (ready('meteor')) { use('meteor'); for (let i = 0; i < 3; i++) { const a = Math.random() * 6.28, r = Math.random() * 5; GW.hazard({ x: pe.x + Math.cos(a) * r, y: pe.y + Math.sin(a) * r, r: 1.8, warn: 1.2, life: 0.2, frac: 0.16, kind: 'burst', from: e, lvl: e.lvl }); } }
      if (ready('flood')) { use('flood'); GW.hazard({ x: pe.x, y: pe.y, r: 3.4, life: 6, frac: 0.025, kind: 'flood', from: e, lvl: e.lvl }); }
      return false;
    },

    // ------------------------------------------------------------ deaths
    // Returns true when the usual loot should not drop (one beast ate another).
    onKill(game, e, from) {
      const world = game.world, g = world.gates && world.gates.list.find(x => x.id === e.gate);
      if (from && from.gateMon) return true;
      if (g && (from === game.pe || (from && from.isCompanion))) { g.kills = (g.kills || 0) + 1; if (game.pl.guard) game.pl.guard.kills = (game.pl.guard.kills || 0) + 1; }
      // your mentor's kill still teaches you something
      if (from && from.mentor && U.dist(e.x, e.y, game.pe.x, game.pe.y) < 16) {
        const pl = game.pl, xp = Math.round(ECHO.Prowess.xpFor(pl, e) * (e.gateXp || 1) * 0.45);
        const ups = ECHO.Prowess.gain(pl, xp);
        ECHO.Combat.floater(e.x, e.y - 1.2, `+${U.short(xp)} xp (shared)`, '#c8a8ff');
        for (const u of ups) ECHO.Progress.levelUp(game, u);
      }
      if (e.apexId && g) g.apex = (g.apex || []).filter(a => a.id !== e.apexId);
      if (e.sovereign && g) {
        g.slain = world.day;
        const th = Gt().THEMES[g.theme], who = from === game.pe ? `${game.pl.first} ${game.pl.last}` : from && from.npcId ? ECHO.People.name(world.npcs[from.npcId]) : 'someone';
        ECHO.Chronicle.add(world, { text: `${who} slew ${e.foe.name} at the heart of ${th.world}, beyond ${g.name}.`, kind: 'player', importance: 3, x: g.x, y: g.y, char: from === game.pe ? game.pl.charId : null });
        UI().banner(`${e.foe.name} is slain`, `${U.cap(th.world)} falls quiet. For a while.`, false);
        if (ECHO.Music) ECHO.Music.stinger('echo');
      }
      return false;
    },
    // You fell beyond the gate: the Guard pulls you out.
    fell(game, from) {
      const world = game.world, pl = game.pl, L = GW.inside(game), g = L.gate, th = Gt().THEMES[g.theme];
      const ms = game.ents.find(e => e.mentor && !e.dead), mn = ms && world.npcs[ms.npcId];
      const rescuer = mn || Gt().atGate(world, g)[0];
      pl.fate--;
      if (pl.fate <= 0) {
        if (ECHO.Capture.mortal(world)) return ECHO.Capture.die(game, `killed beyond ${g.name}`, null);
        pl.fate = 1;
      }
      const lost = Math.floor(pl.gold * 0.1);
      pl.gold -= lost;
      const recap = game.recapHtml ? game.recapHtml() : '';
      ECHO.Capture.place(game, g.x, g.y + 4);
      pl.hp = pl.maxHp * 0.5; game.pe.hp = pl.hp; pl.stamina = pl.maxSta; pl.rootT = 0; pl.slowT = 0; pl.poisonT = 0;
      GW.hz = [];
      const killer = from && from.foe ? from.label || from.foe.name.toLowerCase() : 'something beyond the gate';
      if (rescuer) ECHO.Chronicle.add(world, { text: `${ECHO.People.name(rescuer)} ${rescuer.ng ? rescuer.ng.title + ' ' : ''}dragged ${pl.first} ${pl.last} back out through ${g.name}, half dead.`, kind: 'player', importance: 1, x: g.x, y: g.y, char: pl.charId });
      ECHO.UI.fadeIn(500);
      ECHO.UI.modal({
        title: 'Pulled back through',
        html: `<p>${killer ? `${esc(U.cap(killer))} brought you down. ` : ''}${rescuer ? `<b>${esc(ECHO.People.fullTitle(world, rescuer))}</b> got to you before it could finish you, and dragged you back out of ${esc(th.world)}.` : 'You crawl back through the gate on your own.'}</p><p>${lost ? `Some of your coin (${lost}) stayed behind. ` : ''}Your level and gear are yours.</p>${recap}<p class="dim">${rescuer ? `"${pl.guard ? 'Again tomorrow. Smaller beasts first.' : 'Do not go in there alone.'}"` : ''}</p>`,
        choices: [{ label: 'Get up', onPick: () => ECHO.Capture.finish(game) }]
      });
    },
    use(game, it) {
      if (it.action === 'gateexit') { ECHO.Interior.leave(game); return true; }
      return false;
    },

    // ------------------------------------------------------------ outside: the menace
    outside(game, dt) {
      const world = game.world, pe = game.pe, pl = game.pl;
      if (!world.gates) { GW.veil(null); return; }
      const a = Gt().aura(world, pe.x, pe.y), lv = GW.level(game);
      const g = a.g;
      // you see it from far off
      if (g && !g.found && a.d < 40) {
        g.found = true;
        UI().banner(U.cap(g.name), 'A gate to another world · the National Guard holds it', false);
        if (ECHO.Music) ECHO.Music.stinger('discover');
        if (lv < Gt().MIN) setTimeout(() => UI().toast(`Even from here you can feel it: a pressure behind the eyes. Below level ${Gt().MIN}, going close to ${g.name} will kill you.`, 'warn', 7), 1500);
      }
      GW.veil(a.k ? { g, d: a.d, k: a.k, weak: lv < Gt().MIN } : null);
      if (a.k && lv < Gt().MIN && !game.defeating && !pl.capture) {
        if (a.k === 1 && !(GW.warned[g.id] > game.time - 60)) { GW.warned[g.id] = game.time; UI().toast(`The menace of ${g.name} presses on your heart. Turn back — below level ${Gt().MIN}, closer will kill you.`, 'warn', 6); }
        if (a.k >= 2) {
          const t = U.clamp((Gt().R_HURT - a.d) / (Gt().R_HURT - Gt().R_KILL), 0, 1);
          GW.hurtPlayer(game, (a.k === 3 ? 0.55 : 0.05 + 0.12 * t) * dt, { gateAura: g, foe: null }, 'magic', 'menace');
        }
      } else if (a.k && lv >= Gt().MIN && !(g.felt)) { g.felt = true; UI().toast(`The menace of ${g.name} washes over you and finds nothing to grip.`, 'info', 4); }
      // anything else below level 150 that comes too close
      GW.auraT -= dt;
      if (GW.auraT > 0) return;
      GW.auraT = 0.25;
      for (const e of game.ents) {
        if (e === pe || e.dead || e.ngWard || e.gateMon || e.type === 'ghost' || e.marvel) continue;
        const b = Gt().aura(world, e.x, e.y);
        if (b.k < 2) continue;
        const n = e.npcId && world.npcs[e.npcId];
        const L = n ? (ECHO.Delvers ? ECHO.Delvers.lv(n) : 1) : ECHO.Prowess.foeLevel(e);
        if (L >= Gt().MIN) continue;
        const away = Math.atan2(e.y - b.g.y, e.x - b.g.x);
        if (e.isCompanion) {
          // your companion will not walk into it
          const sp = ECHO.Ent.freeSpot(world, b.g.x + Math.cos(away) * (Gt().R_HURT + 1.5), b.g.y + Math.sin(away) * (Gt().R_HURT + 1.5), 4);
          if (sp) { e.x = sp.x; e.y = sp.y; e.path = null; }
          if (!e._gateSaid) { e._gateSaid = true; e.say = 'I can\'t go closer. The air itself is killing me.'; e.sayT = 3; }
          continue;
        }
        e.hp -= e.maxHp * (b.k === 3 ? 0.5 : 0.12);
        e.kbx += Math.cos(away) * 0.3; e.kby += Math.sin(away) * 0.3;
        if (e.type === 'creature' && !e.aggro) { e.state = 'flee'; e.fleeFrom = { x: b.g.x, y: b.g.y }; e.calmT = 3; }
        ECHO.Combat.burst(e.x, e.y - 0.4, '#3a3040', 4, 2, 0.5, 2);
        if (e.hp <= 0) { ECHO.Combat.burst(e.x, e.y, '#8a8078', 18, 3, 0.8, 3); ECHO.Combat.kill(e, null, 'magic'); }
      }
    },
    // the menace, felt at the edges of your sight
    veil(a) {
      let el = GW._veilEl;
      if (!el && typeof document !== 'undefined') { el = GW._veilEl = document.getElementById('gate-veil'); if (!el) { el = GW._veilEl = document.createElement('div'); el.id = 'gate-veil'; document.body.appendChild(el); } }
      if (!el) return;
      if (!a) { if (el.style.opacity !== '0') el.style.opacity = '0'; return; }
      const th = Gt().THEMES[a.g.theme];
      const t = U.clamp((Gt().R_WARN - a.d) / Gt().R_WARN, 0, 1);
      const op = (a.weak ? 0.25 + 0.75 * t : 0.15 + 0.25 * t) * (0.85 + Math.sin(performance.now() / 260) * 0.15 * (a.weak ? 1 : 0.3));
      if (el._col !== th.dark) { el._col = th.dark; el.style.background = `radial-gradient(ellipse at center, rgba(0,0,0,0) 30%, ${th.dark} 100%)`; }
      el.style.opacity = op.toFixed(2);
    },

    // ------------------------------------------------------------ what you see at the top of the screen
    hud(game, el) {
      const L = GW.inside(game);
      if (!L) return false;
      const pe = game.pe, z = GW.zoneAt(L, pe.x, pe.y), b = Gt().BANDS[z];
      const ment = game.ents.find(e => e.mentor && !e.dead);
      const n = ment && game.world.npcs[ment.npcId];
      let goal = null, txt = '';
      if (ment) {
        const lead = ment.lead && !ment.fighting ? ment.lead : ment;
        const d = U.dist(lead.x, lead.y, pe.x, pe.y);
        goal = d > 3 ? lead : null;
        txt = `${n ? n.first : 'Your mentor'} ${ment.fighting ? 'is fighting' : ment.waiting ? 'is waiting for you' : 'leads the way'}${goal ? ' · ' + Math.round(d) + ' leagues' : ''}`;
      } else {
        const ex = { x: L.inside.x, y: L.inside.y + 2 }, d = U.dist(ex.x, ex.y, pe.x, pe.y);
        goal = d > 4 ? ex : null;
        txt = `The gate home${goal ? ' · ' + Math.round(d) + ' leagues' : ' · here'}`;
      }
      const ang = goal ? Math.atan2(goal.y - pe.y, goal.x - pe.x) : null;
      const D = ECHO.Prowess.diff(b[0], GW.level(game));
      const html = `<span class="gl">${esc(U.cap(GW.zoneName(L, z)))} <span style="color:${D.color}">· Lv ${b[0]}–${b[1]}</span></span><span class="gw">${ang != null ? `<i class="arrow" style="transform:rotate(${Math.round(ang * 180 / Math.PI)}deg)">➤</i>` : ''}${esc(txt)}</span>${ment ? '<span class="gt">training</span>' : ''}<span class="gk">the light at the gate · leave</span>`;
      if (ECHO.Purpose._html !== html) { ECHO.Purpose._html = html; el.innerHTML = html; el.classList.remove('hidden'); }
      return true;
    }
  };
  GW.install();
})();
