// Secrets: the wild is full of small things worth stopping for.
//
// Caves in the hillsides — a wolf den, a smugglers' stash, old paintings on
// the rock, a cloud of bats, a cold clear spring. Wayside shrines to saints
// with a story each: pray at one for a blessing, and walk the whole
// pilgrimage for something that stays with you. Wrecks — an overturned cart
// on the road, a boat stove in on the shore — with goods in them, and
// sometimes a letter the dead never got to send. Hermits in huts far from
// anywhere: one asks riddles, one teaches, one trades a treasure map for a
// hot meal, one knows where things are hidden. Treasure maps that lead to a
// spot you have to find by its description, and dig — and the chest at the
// bottom may hold another map. Stone circles with a verse carved in them:
// touch the stones in the order the verse gives and the circle answers.
// And rare creatures: a golden hare that runs like the wind, a great grey
// elk that walks the old woods.
(function () {
  const { U } = ECHO;
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const T = ECHO.TILE;
  const P = () => ECHO.People;
  const DIRS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
  const dirOf = a => DIRS[Math.round(((a % 6.283) + 6.283) % 6.283 / 0.785) % 8];
  const COMPASS = { north: -Math.PI / 2, east: 0, south: Math.PI / 2, west: Math.PI };

  const SAINTS = [
    ['Saint Aldwyn of the Roads', 'who walked every road in the realm barefoot, and blessed each one'],
    ['Saint Maera the Lantern', 'who kept a light burning at the ford for forty winters'],
    ['Saint Corvin the Mender', 'who set the bones of beggars and kings alike, and charged neither'],
    ['Saint Iselde of the Wells', 'who found water in the dry years with a hazel rod'],
    ['Saint Bran the Shepherd', 'who drove off a wolf pack with a crook and a song'],
    ['Saint Ottila the Patient', 'who waited nine years at this spot for a son who came home'],
    ['Saint Hew the Ferryman', 'who carried travellers across the flood and asked only their names'],
    ['Saint Ysolt of the Hearth', 'who fed a whole village through the Long Winter from one pot'],
    ['Saint Gareth Ashhand', 'who pulled children from a burning mill and kept the scars proudly'],
    ['Saint Wenna the Quiet', 'who never spoke a cruel word, and few others']
  ];
  const VERSES = [
    ['Where the sun is born, then where it dies; where the cold wind lives, then where it never comes.', ['east', 'west', 'north', 'south']],
    ['Begin in the warm, then face the frost; turn to the dawn, and end in the dusk.', ['south', 'north', 'east', 'west']],
    ['The north star first, the noon sun next; then morning, then evening, and so to rest.', ['north', 'south', 'east', 'west']],
    ['Evening, morning, winter, summer — so the year turns, so the circle opens.', ['west', 'east', 'north', 'south']]
  ];
  const RIDDLES = [
    ['I have cities but no houses, forests but no trees, and water but no fish. What am I?', ['A map', 'A dream', 'A mirror'], 0],
    ['The more you take, the more you leave behind. What am I?', ['Footsteps', 'Coins', 'Years'], 0],
    ['I speak without a mouth and hear without ears. I have no body, but I come alive with the wind.', ['An echo', 'A ghost', 'A bell'], 0],
    ['What can run but never walks, has a mouth but never talks, has a bed but never sleeps?', ['A river', 'A road', 'A hound'], 0],
    ['Feed me and I live; give me a drink and I die.', ['Fire', 'A seed', 'A horse'], 0],
    ['What has roots that nobody sees, is taller than trees, up up it goes, and yet never grows?', ['A mountain', 'A tower', 'A cloud'], 0]
  ];

  const Sc = ECHO.Secrets = {
    t: 0, rareT: 40, glows: [], chimeT: 0,
    st(world) { return world.secrets; },
    // ------------------------------------------------------------ the world's secrets, laid down once
    ensure(world) {
      if (world.secrets && world.secrets.v === 1) return world.secrets;
      const rng = new ECHO.RNG(ECHO.hashStr('secrets:' + world.seed));
      const W = world.W || 200, H = world.H || 150;
      const S = world.secrets = { v: 1, list: [], seq: 0 };
      const free = (x, y, r = 2) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (ECHO.World.isSolid(world, x + dx, y + dy)) return false; return !(ECHO.Water && ECHO.Water.kind(world, x, y)); };
      const farFromAll = (x, y) => !ECHO.World.settlementAt(world, x, y, 14) && !S.list.some(o => U.dist(o.x, o.y, x, y) < 9) && !ECHO.Explore.sites(world).some(o => U.dist(o.x, o.y, x, y) < 6);
      const tile = (x, y) => ECHO.World.tile(world, Math.floor(x), Math.floor(y));
      const nearWater = (x, y) => { for (let k = 0; k < 8; k++) { const a = k * 0.785; if (ECHO.Water && ECHO.Water.kind(world, x + Math.cos(a) * 2, y + Math.sin(a) * 2)) return true; } return false; };
      const place = (kind, want, n, extra) => {
        for (let i = 0, made = 0; i < n * 60 && made < n; i++) {
          const x = 6 + rng.next() * (W - 12), y = 6 + rng.next() * (H - 12);
          if (!free(x, y) || !farFromAll(x, y) || !want(x, y)) continue;
          const o = { id: 'sc' + (++S.seq), kind, x: Math.floor(x) + 0.5, y: Math.floor(y) + 0.5, found: false, done: false };
          if (extra) extra(o, made);
          S.list.push(o); made++;
        }
      };
      const scale = W * H / 30000;
      place('cave', (x, y) => tile(x, y) === T.HILL || (tile(x, y) === T.FOREST && rng.next() < 0.3), Math.round(10 * scale), o => { o.what = ['den', 'smugglers', 'paintings', 'bats', 'spring'][rng.int(0, 4)]; });
      place('shrine', (x, y) => tile(x, y) === T.GRASS || tile(x, y) === T.ROAD || tile(x, y) === T.HILL, Math.min(SAINTS.length, Math.round(8 * scale)), (o, i) => { o.saint = i % SAINTS.length; });
      place('wreck', (x, y) => tile(x, y) === T.ROAD || (tile(x, y) === T.SAND && nearWater(x, y)), Math.round(10 * scale), o => { o.boat = tile(o.x, o.y) === T.SAND; });
      place('circle', (x, y) => tile(x, y) === T.GRASS || tile(x, y) === T.HILL, Math.round(4 * scale), o => { const v = VERSES[rng.int(0, VERSES.length - 1)]; o.verse = v[0]; o.order = v[1]; o.step = 0; });
      place('hut', (x, y) => tile(x, y) === T.FOREST || tile(x, y) === T.HILL || tile(x, y) === T.SWAMP, Math.round(5 * scale), (o, i) => { o.gift = ['riddle', 'teach', 'map', 'lore'][i % 4]; });
      // the hermits themselves: real people of the world, who chose to live apart
      const cands = Object.values(world.npcs).filter(n => n.status === 'alive' && !n.title && !n.rival && !n.spouse && ['elder', 'wanderer', 'herbalist', 'hunter', 'priest'].includes(n.prof) && n.loc && P().age(world, n) > 40);
      for (const o of S.list.filter(o => o.kind === 'hut')) {
        const n = cands.splice(rng.int(0, Math.max(0, cands.length - 1)), 1)[0];
        if (!n) { o.empty = true; continue; }
        o.npc = n.id; n.hermit = o.id; n.loc = null; n.journey = 'hermit';
      }
      return S;
    },
    byId(world, id) { return (world.secrets && world.secrets.list.find(o => o.id === id)) || null; },
    label(o, world) {
      if (o.kind === 'cave') return o.done ? { den: 'An empty wolf den', smugglers: 'A smugglers\' cave', paintings: 'The painted cave', bats: 'A bat cave', spring: 'A cave spring' }[o.what] : 'A cave in the rock';
      if (o.kind === 'shrine') return `Wayside shrine of ${SAINTS[o.saint][0]}`;
      if (o.kind === 'wreck') return o.boat ? 'A wrecked boat' : 'An overturned cart';
      if (o.kind === 'circle') return o.done ? 'The opened stone circle' : 'A stone circle';
      if (o.kind === 'hut') { const n = o.npc && world.npcs[o.npc]; return n && n.status === 'alive' ? `${n.first}'s hut` : 'An empty hut'; }
      return 'Something';
    },
    // ------------------------------------------------------------ each frame
    update(game, dt) {
      const world = game.world, pe = game.pe, pl = game.pl;
      if (!world || !pe || ECHO.Interior.cur || pl.capture) return;
      Sc.ensure(world);
      Sc.glows.length = 0;
      // dig spots glint when you're close and hold the map
      for (const m of (pl.tmaps || [])) {
        if (m.dug) continue;
        const d = U.dist(m.x, m.y, pe.x, pe.y);
        if (d < 4.5 && Math.random() < dt * 4) ECHO.Combat.fx.push({ kind: 'p', x: m.x + (Math.random() - 0.5) * 0.6, y: m.y + (Math.random() - 0.5) * 0.6, vx: 0, vy: 0, t: 0, life: 0.5, color: '#ffe8a0', size: 2, spark: true });
      }
      for (const o of world.secrets.list) {
        if (Math.abs(o.x - pe.x) > 50 || Math.abs(o.y - pe.y) > 50) continue;
        if (o.kind === 'shrine' && pl.shrines && pl.shrines[o.id] === world.day) Sc.glows.push({ x: o.x, y: o.y, h: 0.9, c: '#ffd890', s: 1.4 + Math.sin(game.time * 8) * 0.1, a: 0.8 });
        if (o.kind === 'circle' && !o.done) for (let k = 0; k < (o.step || 0); k++) { const a = COMPASS[o.order[k]]; Sc.glows.push({ x: o.x + Math.cos(a) * 2.4, y: o.y + Math.sin(a) * 2.4, h: 1.4, c: '#a8d8ff', s: 1.3, a: 0.85 }); }
        if (o.kind === 'circle' && o.done) Sc.glows.push({ x: o.x, y: o.y, h: 0.3, c: '#a8d8ff', s: 2.4 + Math.sin(game.time * 2) * 0.3, a: 0.6 });
        if (o.kind === 'hut' && !o.empty && Math.random() < dt * 1.5) ECHO.Combat.fx.push({ kind: 'smoke', x: o.x - 0.7, y: o.y - 0.3, sh: 2.5, vx: 0.15, vy: 0, t: 0, life: 3, size: 2.5 });
        if (o.kind === 'hut' && !o.empty && game.isNight()) Sc.glows.push({ x: o.x + 0.4, y: o.y + 0.9, h: 0.8, c: '#ffcf80', s: 1.2, a: 0.7 });
      }
      for (const e of game.ents) if (e.rare === 'golden' && !e.dead) Sc.glows.push({ x: e.x, y: e.y, h: 0.4, c: '#ffe070', s: 1.3, a: 0.75 });
      Sc.t -= dt;
      if (Sc.t > 0) return;
      Sc.t = 0.5;
      // coming upon something
      for (const o of world.secrets.list) {
        if (o.found) continue;
        if (U.dist(o.x, o.y, pe.x, pe.y) < 11 && ECHO.Ent.lineOfSight(world, pe.x, pe.y, o.x, o.y)) {
          o.found = true;
          pl.secretsFound = (pl.secretsFound || 0) + 1;
          game.ui.toast(`You've come upon ${Sc.label(o, world).replace(/^A /, 'a ').replace(/^An /, 'an ').replace(/^The /, 'the ')}. (E when you're close.)`, 'info', 4);
          if (ECHO.Pastimes && ECHO.Pastimes.gain) ECHO.Pastimes.gain(game, 'forage', 2);
        }
      }
      Sc.hermits(game);
      Sc.rareTick(game, 0.5);
    },
    // ------------------------------------------------------------ hermits at home
    hermits(game) {
      const world = game.world, pe = game.pe;
      for (const o of world.secrets.list) {
        if (o.kind !== 'hut' || o.empty || U.dist(o.x, o.y, pe.x, pe.y) > 30) continue;
        const n = world.npcs[o.npc];
        if (!n || n.status !== 'alive') { o.empty = true; continue; }
        if (game.ents.some(e => e.npcId === n.id && !e.dead)) continue;
        const sp = ECHO.Ent.freeSpot(world, o.x + 1.2, o.y + 1.4, 3);
        if (!sp) continue;
        const e = ECHO.Spawner.makePerson(game, n, sp.x, sp.y, 'villager');
        e.hermitOf = o.id; e.home = { x: sp.x, y: sp.y };
        game.addEnt(e);
      }
    },
    hermitThink(game, e, npc, dt) {
      const world = game.world, pe = game.pe, o = Sc.byId(world, e.hermitOf);
      if (!o) { e.hermitOf = null; return false; }
      const d = U.dist(e.x, e.y, pe.x, pe.y);
      if (d < 5) { e.moving = false; e.dir = Math.atan2(pe.y - e.y, pe.x - e.x); e.flip = Math.cos(e.dir) < 0; if (!e.greeted && e.sayT <= 0) { e.greeted = true; e.say = pick(['Visitors. Hm.', 'Well. You found me.', 'Not many come this way.', 'Mind the herbs.']); e.sayT = 2.4; } return true; }
      // potters about the hut
      if (!e.wto || U.dist(e.x, e.y, e.wto.x, e.wto.y) < 0.4 || Math.random() < dt * 0.05) { const a = Math.random() * 6.28; e.wto = { x: o.x + 0.5 + Math.cos(a) * 2.2, y: o.y + 1.4 + Math.sin(a) * 1.5 }; e.chore = pick([null, 'gather', 'sweep']); }
      if (U.dist(e.x, e.y, e.wto.x, e.wto.y) > 0.4) { ECHO.Ent.seek(world, e, e.wto.x, e.wto.y, e.speed * 0.3, dt, 0.3); e.chore = null; }
      else { e.moving = false; e.choreT = (e.choreT || 0) + dt; }
      e.hidden = false;
      return true;
    },
    dialogue(world, npc, ent, pl, ui) {
      if (npc.prof === 'scholar' && pl.inv.rubbing > 0) ui.add(`I copied some cave paintings (${pl.inv.rubbing}).`, () => { const n = pl.inv.rubbing, g = n * 35; pl.inv.rubbing = 0; pl.gold += g; ui.say(`${npc.first} spreads the copies out with shaking hands. "These are older than anything in the archive. Older than the archive. ${g} crowns — and my name on the paper about them, if you don't mind, and yours too."`); ui.render(); });
      if (!npc.hermit) return;
      const game = ECHO.Game, o = Sc.byId(world, npc.hermit);
      if (!o) return;
      const met = (o.met = (o.met || 0) + 0);
      ui.add('Why do you live out here?', () => ui.say(pick([`"People. Too many of them, and too loud. Out here there's the wind and the birds, and they don't want anything from me."`, `"I did something once I'm not proud of. Out here I don't have to see it in anyone's face."`, `"I came to think. I'm still thinking. It's a big question."`, `"The town forgot me. I forgave it."`])));
      if (o.gift === 'riddle') {
        if (o.solved >= RIDDLES.length || (o.solved || 0) >= 3) ui.add('Any more riddles?', () => ui.say('"I\'m out of riddles. You\'ve emptied me. Go and be clever somewhere else."'));
        else ui.add('I hear you like riddles.', () => {
          const r = RIDDLES[(ECHO.hashStr(o.id) + (o.solved || 0)) % RIDDLES.length];
          ui.say(`${npc.first} grins. "Answer me this, and I'll make it worth your while. ${r[0]}"`);
          ui.clear();
          const order = [0, 1, 2].sort(() => Math.random() - 0.5);
          for (const k of order) ui.add(`"${r[1][k]}."`, () => {
            if (k === r[2]) {
              o.solved = (o.solved || 0) + 1;
              const prize = o.solved >= 3 ? 'map' : 'gold';
              if (prize === 'map') { Sc.giveMap(game, o.x, o.y, `${npc.first}'s riddles`); ui.say(`"Right again! Three for three. Here — this is the real prize." ${npc.first} presses a stained, folded map into your hand.`); }
              else { const g = 10 + o.solved * 8; pl.gold += g; ui.say(`"Ha! Clever. ${g} crowns, as promised. Come back for another."`); }
              if (ECHO.Character) ECHO.Character.train(pl, 'study', 0.4);
            } else ui.say(`"Wrong! Ha. Think on it and come back." (The answer was: ${r[1][r[2]]}.)`);
            ui.render();
          });
        });
      }
      if (o.gift === 'teach') {
        const skill = o.skill || (o.skill = pick(['blade', 'archery', 'shadow', 'ward', 'endurance', 'study']));
        const names = { blade: 'the sword', archery: 'the bow', shadow: 'moving unseen', ward: 'the guard', endurance: 'going on when you can\'t', study: 'reading the world' };
        if (o.taught) ui.add('Teach me more?', () => ui.say('"I\'ve taught you what I know. The rest is practice."'));
        else ui.add(`They say you know something about ${names[skill]}.`, () => {
          ui.say(`"I might. I'd want something for it. Three bundles of herbs — my old bones ache."`);
          ui.clear();
          ui.add(pl.inv.herbs >= 3 ? 'Give three bundles of herbs.' : `You have ${pl.inv.herbs || 0} herbs.`, () => {
            if (!(pl.inv.herbs >= 3)) { ui.say('"Come back when you have them."'); ui.render(); return; }
            pl.inv.herbs -= 3; o.taught = true;
            pl.skills[skill] = Math.min(100, (pl.skills[skill] || 0) + 6);
            ui.say(`${npc.first} spends an hour with you behind the hut. It is not gentle, and it is not short. But afterwards you understand ${names[skill]} better than you did. (+6 ${skill})`);
            ECHO.UI.toast(`${npc.first} taught you: +6 ${skill}.`, 'legend', 4);
            ui.render();
          });
          ui.add('Not now.', () => ui.render());
        });
      }
      if (o.gift === 'map') {
        if (o.traded && world.day - o.traded < 5) ui.add('Got any more maps?', () => ui.say('"Not yet. Come back in a few days — I find things on my walks."'));
        else ui.add('I heard you have maps.', () => {
          ui.say('"Maps? Found a few on my walks. Dead men\'s maps. I\'ll trade one for a hot meal — I\'m sick of nettle soup."');
          ui.clear();
          const food = ['stew', 'roast', 'grilled', 'food', 'fish', 'meat'].find(k => pl.inv[k] > 0);
          ui.add(food ? `Give some ${food === 'food' ? 'food' : food}.` : 'You have nothing to eat.', () => {
            if (!food) { ui.say('"No meal, no map."'); ui.render(); return; }
            pl.inv[food]--; o.traded = world.day;
            Sc.giveMap(game, o.x, o.y, `${npc.first} the hermit`);
            ui.say(`${npc.first} eats like a starving wolf, then digs a grubby map out of a pot. "There. Whoever drew it is long dead. Good luck."`);
            ui.render();
          });
          ui.add('Not now.', () => ui.render());
        });
      }
      if (o.gift === 'lore') ui.add('What do you know about this land?', () => {
        const hidden = world.secrets.list.filter(x => !x.found && x.kind !== 'hut').sort((a, b) => U.dist(a.x, a.y, o.x, o.y) - U.dist(b.x, b.y, o.x, o.y))[0];
        if (!hidden) { ui.say('"You\'ve seen more of it than I have, I think."'); return; }
        const a = Math.atan2(hidden.y - o.y, hidden.x - o.x), dd = Math.round(U.dist(hidden.x, hidden.y, o.x, o.y));
        hidden.found = true; hidden.told = true;
        pl.tracked = `mark:${hidden.x.toFixed(1)}:${hidden.y.toFixed(1)}:${Sc.label(hidden, world)}`;
        ui.say(`"There's ${Sc.label(hidden, world).toLowerCase()} about ${dd} paces ${dirOf(a)} of here. Not many know it. Now you do." (Marked on your way.)`);
      });
    },
    // ------------------------------------------------------------ treasure maps
    giveMap(game, ox, oy, from) {
      const world = game.world, pl = game.pl;
      let spot = null;
      for (let t = 0; t < 60 && !spot; t++) {
        const a = Math.random() * 6.28, r = 18 + Math.random() * 45;
        const x = ox + Math.cos(a) * r, y = oy + Math.sin(a) * r;
        if (x < 5 || y < 5 || x > (world.W || 200) - 5 || y > (world.H || 150) - 5) continue;
        if (ECHO.World.isSolid(world, x, y) || (ECHO.Water && ECHO.Water.kind(world, x, y)) || ECHO.World.settlementAt(world, x, y, 8)) continue;
        spot = { x, y };
      }
      if (!spot) return null;
      const town = ECHO.World.nearestSettlement(world, spot.x, spot.y);
      const tt = ECHO.World.tile(world, Math.floor(spot.x), Math.floor(spot.y));
      const ground = { [T.FOREST]: 'among the trees', [T.HILL]: 'on the stony hillside', [T.GRASS]: 'in the open grass', [T.SAND]: 'in the sand', [T.SWAMP]: 'in the reeds', [T.SNOW]: 'under the snow', [T.FARM]: 'at the edge of a field', [T.ROAD]: 'beside the road' }[tt] || 'in the wild';
      const a = town ? Math.atan2(spot.y - town.y, spot.x - town.x) : 0, dd = town ? Math.round(U.dist(spot.x, spot.y, town.x, town.y) / 10) * 10 : 0;
      const m = { id: 'tm' + Math.floor(Math.random() * 1e9), x: spot.x, y: spot.y, from, hint: `An X ${ground}, about ${dd} paces ${dirOf(a)} of ${town ? town.name : 'the nearest town'}.`, dug: false, day: world.day };
      (pl.tmaps = pl.tmaps || []).push(m);
      pl.tracked = 'tmap:' + m.id;
      game.ui.toast(`A treasure map (${from}): ${m.hint} Find the spot and dig (E). (Tracked.)`, 'legend', 7);
      return m;
    },
    trackedMap(game, id) {
      const m = (game.pl.tmaps || []).find(x => x.id === id.slice(5));
      if (!m || m.dug) return null;
      // the map is a drawing, not a compass: it gets you to the area, the rest is looking
      const jx = m.x + ((ECHO.hashStr(m.id) % 9) - 4) * 0.9, jy = m.y + ((ECHO.hashStr(m.id + 'y') % 9) - 4) * 0.9;
      return { kind: 'track', label: `✕ Treasure map: ${m.hint}`, where: { x: jx, y: jy, name: 'the place on the map', vague: true } };
    },
    dig(game, m) {
      const world = game.world, pl = game.pl, pe = game.pe;
      m.dug = true;
      const lv = ECHO.Prowess ? ECHO.Prowess.level(pl) : 2;
      const gold = 25 + Math.floor(Math.random() * 40) + lv * 6;
      pl.gold += gold;
      ECHO.Combat.burst(m.x, m.y, '#c8a060', 14, 2.5, 0.6, 2);
      if (ECHO.Sfx) ECHO.Sfx.play('coin', { pitch: 0.8 });
      const bits = [`${gold} crowns`];
      if (Math.random() < 0.45) {
        const rng = new ECHO.RNG(Math.floor(Math.random() * 1e9));
        const kind = pick(['sword', 'bow', 'armor']);
        const it = ECHO.Gear.make(world, rng, kind, lv, ECHO.Gear.rollRarity(rng, lv, 12), 'in a buried chest');
        game.loot.push({ x: pe.x + 0.5, y: pe.y, kind: 'item', itemId: it.id, qty: 1 });
        bits.push(it.name);
      }
      if (Math.random() < 0.3) { pl.inv.starshard = (pl.inv.starshard || 0) + 1; bits.push('a shard of star-iron'); }
      pl.mapsDug = (pl.mapsDug || 0) + 1;
      if (pl.tracked === 'tmap:' + m.id) pl.tracked = null;
      ECHO.UI.toast(`You dig, and the spade strikes wood. A chest: ${bits.join(', ')}.`, 'legend', 6);
      if (ECHO.Prowess) { const ups = ECHO.Prowess.gain(pl, 60 + lv * 10); for (const u of ups) ECHO.Progress.levelUp(game, u); }
      // and sometimes, under the gold, another map
      if (Math.random() < 0.35) setTimeout(() => Sc.giveMap(game, m.x, m.y, 'found folded in the chest'), 1200);
      if (pl.mapsDug === 1 || pl.mapsDug % 5 === 0) ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} dug up a buried chest near ${(ECHO.World.nearestSettlement(world, m.x, m.y) || {}).name || 'the wilds'}.`, importance: 1, x: m.x, y: m.y, rep: 1 });
    },
    // ------------------------------------------------------------ hands on
    interactables(game) {
      const world = game.world, pe = game.pe, pl = game.pl, out = [];
      if (pe.mounted || ECHO.Interior.cur || !world.secrets) return out;
      for (const m of (pl.tmaps || [])) if (!m.dug && U.dist(m.x, m.y, pe.x, pe.y) < 1.6) out.push({ kind: 'act', label: 'Dig here (treasure map)', d: 0.2, act: () => Sc.dig(game, m) });
      for (const o of world.secrets.list) {
        if (Math.abs(o.x - pe.x) > 4 || Math.abs(o.y - pe.y) > 4) continue;
        const d = U.dist(o.x, o.y, pe.x, pe.y);
        if (o.kind === 'cave' && d < 2.2 && !o.done) out.push({ kind: 'act', label: 'Explore the cave', d: 0.4, act: () => Sc.cave(game, o) });
        if (o.kind === 'shrine' && d < 2) out.push({ kind: 'act', label: pl.shrines && pl.shrines[o.id] === world.day ? 'The lamp is lit (you prayed here today)' : `Pray at the shrine of ${SAINTS[o.saint][0]}`, d: 0.4, act: () => Sc.pray(game, o) });
        if (o.kind === 'wreck' && d < 2 && !o.done) out.push({ kind: 'act', label: `Search the ${o.boat ? 'wrecked boat' : 'overturned cart'}`, d: 0.4, act: () => Sc.wreck(game, o) });
        if (o.kind === 'circle' && !o.done && d < 4) {
          if (d < 1.4) out.push({ kind: 'act', label: 'Read the carving on the centre stone', d: 0.4, act: () => game.ui.toast(`Carved in the old letters: "${o.verse}"`, 'study', 8) });
          for (const k of ['north', 'east', 'south', 'west']) { const a = COMPASS[k]; const sx = o.x + Math.cos(a) * 2.4, sy = o.y + Math.sin(a) * 2.4; if (U.dist(sx, sy, pe.x, pe.y) < 1.3) out.push({ kind: 'act', label: `Touch the ${k} stone`, d: 0.3, act: () => Sc.touch(game, o, k) }); }
        }
        if (o.kind === 'hut' && o.empty && d < 2 && !o.done) out.push({ kind: 'act', label: 'Search the empty hut', d: 0.4, act: () => { o.done = true; pl.gold += 15; pl.inv.herbs = (pl.inv.herbs || 0) + 2; Sc.giveMap(game, o.x, o.y, 'under a loose hearthstone'); game.ui.toast('Dust, a cold hearth, two bundles of dried herbs, 15 crowns in a jar — and, under a loose hearthstone, a map.', 'info', 5); } });
      }
      return out;
    },
    cave(game, o) {
      const world = game.world, pl = game.pl, pe = game.pe;
      o.done = true;
      if (o.what === 'den') {
        const region = ECHO.World.regionAt(world, o.x, o.y);
        for (let i = 0; i < 3; i++) { const sp = ECHO.Ent.freeSpot(world, o.x + (i - 1) * 1.2, o.y - 1.5, 3); if (!sp) continue; const w = ECHO.Spawner.makeCreature(game, 'wolf', sp.x, sp.y, region, 'den' + o.id); w.target = pe; w.aggro = true; if (!i) { w.say = '*SNARL*'; w.sayT = 1.5; } game.addEnt(w); }
        pl.inv.hide = (pl.inv.hide || 0) + 1;
        game.ui.toast('A wolf den — and the wolves are home! Among the bones at the back, an old hide.', 'warn', 4);
      } else if (o.what === 'smugglers') {
        const g = 30 + Math.floor(Math.random() * 30); pl.gold += g; pl.inv.food = (pl.inv.food || 0) + 2;
        game.ui.toast(`A smugglers' stash behind a rock: ${g} crowns, salted meat, and an oilskin packet…`, 'legend', 5);
        setTimeout(() => Sc.giveMap(game, o.x, o.y, 'from the smugglers\' packet'), 1500);
      } else if (o.what === 'paintings') {
        pl.inv.rubbing = (pl.inv.rubbing || 0) + 1;
        if (ECHO.Character) ECHO.Character.train(pl, 'study', 1);
        ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} found ancient paintings in a cave near ${(ECHO.World.nearestSettlement(world, o.x, o.y) || {}).name || 'the wilds'}.`, importance: 1, x: o.x, y: o.y, rep: 1 });
        game.ui.toast('On the cave wall: hunters, beasts, and a great beast with too many legs, painted in ochre long before any kingdom. You make a careful copy. (A scholar at an archive would pay for it.)', 'legend', 7);
      } else if (o.what === 'bats') {
        for (let i = 0; i < 40; i++) ECHO.Combat.fx.push({ kind: 'p', x: o.x + (Math.random() - 0.5), y: o.y + (Math.random() - 0.5), vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8, t: 0, life: 1.2, color: '#1a1418', size: 3, h0: 0.8, vz: 3 + Math.random() * 3 });
        if (ECHO.Sfx) ECHO.Sfx.play('flutter', { pitch: 1.6 });
        pl.inv.herbs = (pl.inv.herbs || 0) + 2;
        game.ui.toast('A storm of bats bursts out past your ears! When they\'re gone: rare cave-moss on the walls. (+2 herbs)', 'info', 5);
      } else {
        pl.hp = pl.maxHp; pe.hp = pl.hp; pl.fed = Math.max(pl.fed || 0, 80);
        game.ui.toast('A spring wells up at the back of the cave, cold and clear. You drink, and wash your wounds, and feel new.', 'mercy', 5);
      }
      if (ECHO.Prowess) { const ups = ECHO.Prowess.gain(pl, 30); for (const u of ups) ECHO.Progress.levelUp(game, u); }
    },
    pray(game, o) {
      const world = game.world, pl = game.pl, pe = game.pe;
      pl.shrines = pl.shrines || {};
      if (pl.shrines[o.id] === world.day) return;
      const first = pl.shrines[o.id] == null;
      pl.shrines[o.id] = world.day;
      pl.hp = Math.min(pl.maxHp, pl.hp + pl.maxHp * 0.4); pe.hp = pl.hp;
      ECHO.Combat.burst(o.x, o.y - 0.4, '#ffe8a0', 16, 2, 0.8, 2);
      const [name, story] = SAINTS[o.saint];
      const all = world.secrets.list.filter(x => x.kind === 'shrine');
      const visited = all.filter(x => pl.shrines[x.id] != null).length;
      let msg = `You light the little lamp at the shrine of ${name}, ${story}. Peace settles on you.`;
      if (first) {
        msg += ` (Pilgrimage: ${visited}/${all.length} shrines.)`;
        if (visited % 3 === 0 || visited === all.length) { pl.maxHp += 5; pl.hp += 5; msg += ' You feel stronger for the walking: +5 life.'; }
        if (visited === all.length) { ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} walked the whole pilgrimage of the wayside shrines.`, importance: 2, x: o.x, y: o.y, rep: 5, tag: 'protect' }); msg += ' The pilgrimage is complete.'; }
        if (ECHO.Prowess) { const ups = ECHO.Prowess.gain(pl, 25); for (const u of ups) ECHO.Progress.levelUp(game, u); }
      }
      if (ECHO.Character) ECHO.Character.behave(pl, 'mercy', 0.02);
      game.ui.toast(msg, 'mercy', 6);
    },
    wreck(game, o) {
      const world = game.world, pl = game.pl;
      o.done = true;
      const goods = pick(['food', 'timber', 'ore', 'hide']);
      const n = 1 + Math.floor(Math.random() * 3);
      pl.inv[goods] = (pl.inv[goods] || 0) + n;
      const g = 4 + Math.floor(Math.random() * 18); pl.gold += g;
      let msg = `${o.boat ? 'Under the broken planks' : 'In the spilled load'}: ${n} ${goods}, ${g} crowns.`;
      // a letter the dead never sent
      const towns = world.settlements.filter(s => s.residents && s.residents.length && s.faction !== 'ashfang');
      if (ECHO.Jobs && Math.random() < 0.5 && towns.length) {
        const t = towns.sort((a, b) => U.dist(a.x, a.y, o.x, o.y) - U.dist(b.x, b.y, o.x, o.y))[Math.floor(Math.random() * Math.min(4, towns.length))];
        const to = pick(t.residents.map(id => world.npcs[id]).filter(n2 => n2 && n2.status === 'alive' && n2.prof !== 'child'));
        if (to) {
          const J = ECHO.Jobs, S = J.st(world);
          const j = { id: 'jb' + (++S.seq), giver: null, giverName: 'a dead traveller', sid: t.id, town: t.name, day: world.day, due: world.day + 10, status: 'offered', progress: 0, kind: 'deliver', to: to.id, toName: `${to.first} ${to.last}`, toSid: t.id, toTown: t.name, what: 'a water-stained letter', title: `A letter for ${to.first} in ${t.name}`, text: '', gold: 20 + Math.floor(Math.random() * 15) };
          J.accept(game, j);
          msg += ` And a water-stained letter, addressed to ${to.first} ${to.last} of ${t.name}. Someone should take it to them.`;
        }
      } else if (Math.random() < 0.35) setTimeout(() => Sc.giveMap(game, o.x, o.y, `from the ${o.boat ? 'boat' : 'cart'}`), 1200);
      game.ui.toast(msg, 'info', 7);
    },
    touch(game, o, k) {
      const world = game.world, pl = game.pl, pe = game.pe;
      if (o.order[o.step || 0] === k) {
        o.step = (o.step || 0) + 1;
        if (ECHO.Sfx) ECHO.Sfx.play('perfect', { pitch: 0.6 + o.step * 0.15, vol: 0.5 });
        if (o.step >= 4) {
          o.done = true;
          ECHO.Combat.ring(o.x, o.y, 3.2, 'rgba(168,216,255,0.9)', 1.2);
          pl.maxHp += 6; pl.hp = pl.maxHp; pe.hp = pl.hp;
          pl.relics = (pl.relics || 0) + 1;
          const g = 40 + Math.floor(Math.random() * 40); pl.gold += g;
          ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} opened the stone circle near ${(ECHO.World.nearestSettlement(world, o.x, o.y) || {}).name || 'the wilds'}.`, importance: 1, x: o.x, y: o.y, rep: 2 });
          game.ui.toast(`The stones hum together, one long note — and the centre stone slides aside. In the hollow beneath: ${g} crowns of ancient coin, and a smooth blue stone that warms in your hand. (+6 life, for good.)`, 'legend', 8);
          if (ECHO.Prowess) { const ups = ECHO.Prowess.gain(pl, 90); for (const u of ups) ECHO.Progress.levelUp(game, u); }
        } else ECHO.Combat.floater(pe.x, pe.y - 1.3, `the ${k} stone glows`, '#a8d8ff');
      } else {
        const had = o.step || 0;
        o.step = 0;
        if (ECHO.Sfx) ECHO.Sfx.play('hiss', { pitch: 0.5, vol: 0.5 });
        ECHO.Combat.burst(pe.x, pe.y, '#a8d8ff', 8, 2, 0.4, 2);
        if (had) { pl.hp = Math.max(1, pl.hp - 3); pe.hp = pl.hp; }
        ECHO.Combat.floater(pe.x, pe.y - 1.3, had ? 'the glow dies — wrong order' : 'nothing happens', '#c8c0b0');
      }
    },
    // ------------------------------------------------------------ rare creatures
    rareTick(game, dt) {
      const world = game.world, pe = game.pe, pl = game.pl;
      Sc.rareT -= dt;
      if (Sc.rareT > 0) return;
      Sc.rareT = 45;
      if (game.ents.some(e => e.rare && !e.dead) || ECHO.World.settlementAt(world, pe.x, pe.y, 20)) return;
      if (Math.random() > 0.08) return;
      const region = ECHO.World.regionAt(world, pe.x, pe.y);
      const spot = ECHO.Spawner.findSpot(game, 'hare', 14, 22);
      if (!spot) return;
      if (Math.random() < 0.55) {
        const h = ECHO.Spawner.makeCreature(game, 'hare', spot.x, spot.y, region, null);
        h.rare = 'golden'; h.speed = 7.6; h.maxHp = h.hp = 14; h.fname = 'The Golden Hare'; h.label = 'The Golden Hare';
        game.addEnt(h);
        game.ui.toast('Something gold flickers through the grass at the edge of sight…', 'info', 4);
      } else {
        const e = ECHO.Ent.make({ type: 'creature', species: 'deer', fauna: true, stag: true, herd: 'elk' + Math.floor(Math.random() * 1e6), fname: `The Grey Elk of ${region ? region.name : 'the old woods'}`, x: spot.x, y: spot.y, r: 0.55, hp: 110, maxHp: 110, speed: 6.8, faction: 'wild', state: 'graze', home: { x: spot.x, y: spot.y }, label: 'The Grey Elk' });
        e.rare = 'elk'; e.elk = true; e.scale = 1.5;
        game.addEnt(e);
        game.ui.toast('A great grey shape stands among the trees, antlers like a crown of bare branches.', 'info', 5);
      }
    },
    onRareKill(game, e) {
      const world = game.world, pl = game.pl;
      pl.rares = pl.rares || {};
      pl.rares[e.rare] = (pl.rares[e.rare] || 0) + 1;
      if (e.rare === 'golden') { pl.gold += 60; game.ui.toast('The Golden Hare! Its fur shines like coin — a furrier will give you 60 crowns for it on the spot. (Taken.)', 'legend', 6); }
      if (e.rare === 'elk') { pl.inv.meat = (pl.inv.meat || 0) + 4; pl.inv.hide = (pl.inv.hide || 0) + 2; pl.renown = (pl.renown || 0) + 4; game.ui.toast('The Grey Elk falls. Its antlers will be talked about in every inn for a hundred miles.', 'legend', 6); }
      ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} brought down ${e.fname}.`, importance: 1, x: e.x, y: e.y, rep: 2 });
    },
    // ------------------------------------------------------------ for the Nearby list
    nearby(game) {
      const world = game.world, pe = game.pe, pl = game.pl, out = [];
      if (!world.secrets) return out;
      for (const o of world.secrets.list) {
        if (!o.found || U.dist(o.x, o.y, pe.x, pe.y) > 80) continue;
        const done = (o.kind === 'cave' || o.kind === 'wreck' || o.kind === 'circle') && o.done;
        const sub = o.kind === 'shrine' ? (pl.shrines && pl.shrines[o.id] === world.day ? 'you prayed here today' : 'pray for a blessing') : o.kind === 'circle' ? (o.done ? 'opened' : 'a puzzle: read the centre stone') : o.kind === 'hut' ? (o.empty ? 'abandoned' : 'a hermit lives here') : done ? 'explored' : 'unexplored';
        out.push({ k: 'secret', icon: { cave: '◗', shrine: '✝', wreck: '⚓', circle: '◎', hut: '⌂' }[o.kind] || '?', name: Sc.label(o, world), sub, x: o.x, y: o.y, done });
      }
      for (const m of (pl.tmaps || [])) if (!m.dug) { const w = Sc.trackedMap(game, 'tmap:' + m.id); out.push({ k: 'map', icon: '✕', name: 'Treasure map', sub: m.hint, x: w ? w.where.x : m.x, y: w ? w.where.y : m.y, track: 'tmap:' + m.id }); }
      return out;
    }
  };
  if (ECHO.Pastimes) {
    ECHO.Pastimes.extraAct = ECHO.Pastimes.extraAct || [];
    ECHO.Pastimes.extraAct.push(game => Sc.interactables(game));
  }
})();
