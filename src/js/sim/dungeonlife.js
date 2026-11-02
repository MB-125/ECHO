// Dungeon life: every dungeon has a history, a state, and a memory.
//
// A history: why it is there at all — an underground kingdom abandoned, a prison for something
// old, a mage's halls blown apart by an experiment, a mine that broke into what was buried, a
// warren grown by a thing that feeds on magic, a temple that opens under certain stars, a
// battlefield where the dead still fight. Its floors show it, one sign at a time.
//
// A state, that changes day by day whether you go there or not:
//   dormant    quiet; little stirs, nothing comes out
//   active     things are breeding down there, and beginning to range out
//   infested   too many: they spill out into the country round it, by day and night
//   contested  a second brood has moved in; the two fight each other as readily as you
//   exploited  adventurers have made camp at the mouth and work it like a mine
//   awakened   something woke at the bottom: new depths open, everything in it is stronger
//   collapsed  part of it fell in: some ways are sealed, and the fall opened others
// And a memory: kill what ruled it and its creatures may split into warring bands; go in, fight
// and run, and they will be waiting next time; clear it and something else may move in.
//
// (Its own dice; all of it kept on the site with the world, made the first time it is needed.)
(function () {
  const { U } = ECHO;
  const X = () => ECHO.Explore;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const NAMES = ['Varn', 'Othric', 'Seluna', 'Kethra', 'Bram', 'Ulmo', 'Ishvel', 'Dorrak', 'Maelis', 'Corvan', 'Thessaly', 'Ardun', 'Ysolde', 'Grimwald'];
  const PEOPLE = ['the Dwarrow', 'the Tallfolk', 'the Lamplighters', 'the Old Kings', 'the Vellish', 'the Stonewrights', 'the Hollow-Eyed'];
  const STATES = {
    dormant: { name: 'Dormant', col: '#8fa0b0', desc: 'Quiet. Little stirs down there, and nothing comes out.' },
    active: { name: 'Active', col: '#ffcf6a', desc: 'Things are breeding below and beginning to range out.' },
    infested: { name: 'Infested', col: '#ff7a4a', desc: 'Too many: they spill out into the country round it.' },
    contested: { name: 'Contested', col: '#e06aff', desc: 'Two broods fight over it — each other, as readily as you.' },
    exploited: { name: 'Worked', col: '#7affb0', desc: 'Adventurers have made camp at its mouth and work it like a mine.' },
    awakened: { name: 'Awakened', col: '#ff4a6a', desc: 'Something woke at the bottom. New depths are open, and all of it is stronger.' },
    collapsed: { name: 'Collapsed', col: '#b0a090', desc: 'Part of it fell in: some ways are sealed, and the fall opened others.' }
  };
  // why it is there, by what kind of place it is
  const ORIGINS = {
    kingdom: { kinds: ['forge', 'catacomb', 'warren', 'trollden'], hist: (n, p) => `${p} dug these halls when the world was young, a kingdom under the hill ruled by ${n}. They went deeper every generation, after iron, after gold — until one year the deep doors were shut from the inside, and none of them came up again.`,
      clues: ['Steps worn hollow by a thousand years of feet. Above an arch, a crown carved into the stone, its face chiselled away.', 'A great hall, its benches rotted to stumps; on the wall, a list of kings, the last name scratched out.', 'Bodies in the dust behind a barricade — all of them facing down, toward the deep doors.', 'The deep doors themselves, iron, barred from this side. Something has been scratching at the other.'] },
    prison: { kinds: ['barrow', 'sanctum', 'crypt', 'trollden'], hist: (n, p) => `It was not built to keep people out. ${p} raised it over something they could not kill, and set ${n} and his line to keep the seals. The line died out. The seals did not — not all of them, not yet.`,
      clues: ['Every door here opens inward, and every one is warded on the outside.', 'A guardroom: bunks, a cold hearth, a ledger of watches kept for three hundred years — and then not.', 'A seal of seven rings in the floor. Four of them are cracked.', 'At the bottom the air is warm and moves, slowly, like breath.'] },
    experiment: { kinds: ['sanctum', 'crypt', 'forge', 'nest'], hist: (n, p) => `The mage ${n} built these vaults to study the deep currents of the world, far from any town that might object. The last entry in the journals says the resonance held at three turns, and that tomorrow they would try four. There was no tomorrow, and the vaults have been strange ever since.`,
      clues: ['Scorch marks spiral out from a cracked focusing-stone set in the floor.', 'Shelves of glass vessels, every one burst outward from the inside.', 'A journal page, the ink run: "...at three turns the stone sings. Four tomorrow. Four will open it..."', 'A crater where the work was done. Something in it still hums, and your teeth ache.'] },
    mine: { kinds: ['forge', 'cave', 'grot', 'trollden', 'warren'], hist: (n, p) => `Miners out of the nearest town cut this shaft after a seam of silver, under a foreman called ${n}. At the bottom the picks broke through into a hollow that was already there — older than the hill, and not empty. The miners left their tools where they dropped them.`,
      clues: ['Rails and a rusted cart, tipped over as if something big came past in a hurry.', 'Tally marks on a beam — days worked, wages owed. They stop.', 'The shaft wall gives onto smooth stone, carved by no miner. Cold air comes out of it.', 'The old hollow: walls covered in marks that are not writing, and are.'] },
    living: { kinds: ['nest', 'grot', 'cave', 'warren'], hist: (n, p) => `No one dug it. It grew. Something down there feeds on the magic in the rock, and the tunnels are what it leaves behind as it eats — wider every year. The hunters of ${p === 'the Old Kings' ? 'the old days' : 'the valley'} call it ${n}'s Throat, after the first of them it swallowed.`,
      clues: ['The walls are ridged like the roof of a mouth, and faintly warm.', 'Old bones, polished smooth and grey, packed into the floor like cobbles.', 'The tunnel narrows and widens as you watch, very slowly, like breathing.', 'A pale, pulsing mass where the tunnels meet. Everything here grew out of it.'] },
    stars: { kinds: ['sanctum', 'barrow', 'crypt'], hist: (n, p) => `A temple of ${p}, built to open only when the stars stand in a certain way — which they do for a few nights in a generation. ${n} the star-reader was the last to keep its calendar. The calendar is lost; the doors still open on their own.`,
      clues: ['Holes cut through the roof in the shape of a constellation. Starlight falls in spots across the floor.', 'An orrery of bronze rings, seized, with one ring turned by hand to a date no one remembers.', 'Prayers carved in the walls, all to the same star, which is not in the sky any more.', 'A round chamber with a dais under the roof-hole. The dust on it is disturbed.'] },
    battle: { kinds: ['catacomb', 'barrow'], hist: (n, p) => `Two armies met here and neither would yield; the dead were buried where they fell, in the barrow-halls ${p} made for them, under ${n}, who led one side. They are still fighting. On some nights you can hear the shields from the hilltop.`,
      clues: ['Spearheads and shield-bosses heaped by the door, as if the dead put them there.', 'Two lines of graves facing each other across a hall. Some have been dug out from below.', 'Skeletons locked together in the dust, still gripping each other\'s weapons.', 'A war-banner on a pole, its colours long gone. Something is still holding it up.'] }
  };
  const RIVALS = ['warren', 'nest', 'trollden', 'catacomb', 'crypt', 'cave'];

  const DL = ECHO.DungeonLife = {
    STATES, ORIGINS,
    ok(site) { return site && site.cat === 'delve' && !site.mobileOf && site.kind !== 'riftdeep' && X().DELVES[site.kind]; },
    // the site's life, made the first time (from its own id, so the same world tells the same story)
    life(world, site) {
      if (!DL.ok(site)) return null;
      if (site.life) return site.life;
      const h = ECHO.hashStr('dlife:' + site.id + ':' + world.seed), rng = new ECHO.RNG(h);
      const fits = Object.entries(ORIGINS).filter(([, o]) => o.kinds.includes(site.kind)).map(([k]) => k);
      const origin = fits.length ? fits[rng.int(0, fits.length - 1)] : 'mine';
      const n = NAMES[rng.int(0, NAMES.length - 1)], p = PEOPLE[rng.int(0, PEOPLE.length - 1)];
      const g = site.grow || 0;
      site.life = { state: !site.cleared && g > 12 ? 'active' : 'dormant', since: world.day, origin, hist: ORIGINS[origin].hist(n, p), founder: n, people: p, mem: {}, log: [], seen: 0, lost: 0, deep: 0 };
      return site.life;
    },
    stateName(world, site) { const L = DL.life(world, site); return L ? STATES[L.state].name : ''; },
    // a change of state: remembered, told, and shown the next time you come by
    set(world, site, state, text, importance) {
      const L = DL.life(world, site);
      if (!L || L.state === state) return;
      L.state = state; L.since = world.day;
      if (text) {
        L.log.push({ day: world.day, text });
        if (L.log.length > 8) L.log.splice(0, L.log.length - 8);
        if (site.found || site.seen || importance >= 3) ECHO.Chronicle.add(world, { text, kind: 'nature', importance: importance || 1, x: site.x, y: site.y });
      }
    },
    floorsDelta(site) { const L = site && site.life; return L ? (L.deep || 0) - (L.lost || 0) : 0; },
    // awake, all of it is stronger: a fifth again (at least two levels)
    levelAdd(site, base) { const L = site && site.life; return L && L.state === 'awakened' ? Math.max(2, Math.round(base * 0.2)) : 0; },

    // ------------------------------------------------------------ every day
    dailyTick(world) {
      if (!world.player || !X()) return;
      const rng = new ECHO.RNG(ECHO.hashStr('dlife:' + world.seed + ':' + world.day));
      const towns = world.settlements;
      for (const s of X().sites(world)) {
        if (!DL.ok(s)) continue;
        const L = DL.life(world, s), g = s.grow || 0, age = world.day - L.since, nm = s.name, Nm = U.cap(s.name);
        // quiet when cleared (unless a camp works it)
        if (s.cleared) {
          if (L.state !== 'dormant' && L.state !== 'exploited' && L.state !== 'collapsed') DL.set(world, s, 'dormant', null);
          if (L.state === 'exploited' && age > 30 && rng.chance(0.05)) DL.set(world, s, 'dormant', `The adventurers' camp at ${nm} has packed up and gone: there is nothing left down there worth the digging.`, 1);
          continue;
        }
        switch (L.state) {
          case 'dormant':
            if (g > 10 && rng.chance(0.08)) DL.set(world, s, 'active', `Something has begun to stir in ${nm}: tracks at the mouth, and lights at night.`, 1);
            break;
          case 'active':
            if (g > 32 && rng.chance(0.06)) DL.set(world, s, 'infested', `${Nm} is infested: what breeds there has spilled out into the country round it.`, 2);
            else if (age > 8 && rng.chance(0.005)) DL.contest(world, s, rng);
            break;
          case 'infested':
            if (age > 10 && rng.chance(0.012)) DL.contest(world, s, rng);
            else if (g > 80 && age > 20 && rng.chance(0.006)) DL.awaken(world, s);
            break;
          case 'contested':
            if (age > 20 && rng.chance(0.03)) { s.roster = null; L.rival = null; DL.set(world, s, 'infested', `The war in ${nm} is over: one brood has eaten the other, and grown fat on it.`, 1); }
            break;
          case 'exploited':
            if (age > 40 && rng.chance(0.01)) DL.collapse(world, s, rng, 'The adventurers dug too deep');
            break;
          case 'awakened':
            if (age > 24 && rng.chance(0.012)) DL.collapse(world, s, rng, 'Whatever woke at the bottom of it has shaken it');
            break;
          case 'collapsed':
            if (age > 15 && rng.chance(0.04)) DL.set(world, s, g > 30 ? 'infested' : 'active', `New things have found their way into ${nm} through the fall.`, 1);
            break;
        }
        // a town close by, and the guild's people about: they make camp at the mouth and work it
        if ((L.state === 'active' || L.state === 'infested' || L.state === 'contested') && age > 4) {
          const near = towns.find(t => t.kind !== 'village' && t.faction !== 'ashfang' && U.dist(t.x, t.y, s.x, s.y) < 40);
          const guild = ECHO.Guild ? ECHO.Guild.available(world).length : 3;
          if (near && guild > 2 && rng.chance(0.005)) { L.camp = { from: near.id, day: world.day }; DL.set(world, s, 'exploited', `Adventurers out of ${near.name} have made camp at the mouth of ${nm} and are working it like a mine. ${near.name} is doing well out of it.`, 2); }
        }
        if (L.state === 'exploited') {
          const t = L.camp && ECHO.Sim.settlement(world, L.camp.from);
          if (t) { t.prosperity = Math.min(100, (t.prosperity || 0) + 0.05); t.wealth = (t.wealth || 0) + 0.4; }
          if (rng.chance(0.02)) s.grow = Math.max(0, g - 6);    // (they thin what lives there)
        }
        // what spills out of an infested or awakened one troubles the villages near it
        if ((L.state === 'infested' || L.state === 'awakened') && rng.chance(0.04)) {
          const v = towns.filter(t => t.faction !== 'ashfang' && U.dist(t.x, t.y, s.x, s.y) < 32).sort((a, b) => U.dist(a.x, a.y, s.x, s.y) - U.dist(b.x, b.y, s.x, s.y))[0];
          if (v) { v.unrest = Math.min(100, (v.unrest || 0) + 1); if (v.stock) v.stock.food = Math.max(0, (v.stock.food || 0) - 1); }
        }
      }
    },
    // a second brood moves in (or, once its lord is dead, the first splits into two bands)
    contest(world, s, rng, split) {
      const L = DL.life(world, s), def = X().DELVES[s.kind], nm = s.name, Nm = U.cap(s.name);
      if (split) {
        L.rival = s.kind; L.split = true; s.roster = null;
        DL.set(world, s, 'contested', `With their master dead, the creatures of ${nm} have split into two bands, and they fight each other over what is left.`, 2);
        return;
      }
      const mine = new Set((def.roster || [[def.foes, 1]]).map(r => r[0]));
      const other = RIVALS.filter(k => k !== s.kind && X().DELVES[k] && X().DELVES[k].roster && !X().DELVES[k].roster.some(r => mine.has(r[0])));   // (something truly other: not its own kind under another name)
      if (!other.length) return;
      const k = other[rng.int(0, other.length - 1)], od = X().DELVES[k];
      L.rival = k; L.split = false;
      s.roster = (def.roster || [[def.foes, 1]]).concat(od.roster.map(([m, w]) => [m, w]));
      DL.set(world, s, 'contested', `${Nm} is contested: ${od.label.toLowerCase()} creatures have moved in, and the two broods are at war in the dark.`, 2);
    },
    awaken(world, s) {
      const L = DL.life(world, s);
      if (!L || L.state === 'awakened') return;
      L.deep = Math.min(4, (L.deep || 0) + 2); L.shape = (L.shape || 0) + 1; s.floorsDone = {};
      DL.set(world, s, 'awakened', `${U.cap(s.name)} has awakened. ${ORIGINS[L.origin] ? 'Whatever ' + L.people + ' left at the bottom of it is stirring' : 'Something at the bottom is stirring'}; new depths have opened, and everything that lives there is stronger.`, 3);
    },
    collapse(world, s, rng, why) {
      const L = DL.life(world, s);
      const fl = X().floors(s);
      L.lost = Math.min(Math.max(0, fl - 1), (L.lost || 0) + 1);
      if (rng.chance(0.5)) L.deep = Math.min(4, (L.deep || 0) + 1);
      L.shape = (L.shape || 0) + 1; s.floorsDone = {};
      DL.set(world, s, 'collapsed', `${why}: part of ${s.name} has fallen in. Some of its ways are sealed — and the fall has opened others, deeper down.`, 2);
    },
    // after it was cleared, something else moves in (refilled by the world)
    refilled(world, s, rng) {
      const L = DL.life(world, s);
      if (!L) return;
      if (L.mem.lordSlain && world.day - L.mem.lordSlain < 60 && rng.chance(0.5)) { DL.contest(world, s, rng, true); L.mem.lordSlain = null; return; }
      if (rng.chance(0.4)) {
        const other = RIVALS.filter(k => k !== s.kind && X().DELVES[k] && X().DELVES[k].roster), k = other[rng.int(0, other.length - 1)];
        if (k) { s.roster = X().DELVES[k].roster.slice(); L.newcomer = k; DL.set(world, s, 'active', `Something new has moved into ${U.cap(s.name)} since it was emptied: ${X().DELVES[k].label.toLowerCase()} creatures.`, 1); return; }
      }
      s.roster = null; L.newcomer = null;
      DL.set(world, s, 'active', `${U.cap(s.name)} is no longer empty. Its old tenants have come back.`, 1);
    },

    // ------------------------------------------------------------ in the dungeon
    // what you see on each floor of it: one sign of its history at a time
    onFloor(game, L0, site, depth) {
      const world = game.world, L = DL.life(world, site);
      if (!L) return;
      const O = ORIGINS[L.origin], fl = Math.max(1, (L0 && L0.floors) || X().floors(site));
      if (O) {
        const n = O.clues.length, i = depth >= fl - 1 ? n - 1 : Math.min(n - 1, Math.floor(depth * n / fl));
        L.cl = L.cl || 0;
        if (!(L.cl & (1 << i))) {
          L.cl |= 1 << i;
          setTimeout(() => ECHO.UI.toast(O.clues[i], 'legend', 8), depth ? 700 : 2800);
          if (!L.knowsAll && L.cl === (1 << n) - 1) {
            L.knowsAll = true;
            setTimeout(() => ECHO.UI.toast(`You know now what ${site.name} was. (Its story is in the map's card for it.)`, 'gold', 6), 6000);
            if (ECHO.Renown) ECHO.Renown.add(world, 'knowledge', 3, `learned the history of ${site.name}`);
          }
        }
      }
      if (depth === 0) {
        // since you were last here
        const fresh = L.log.filter(e => e.day > (L.seen || 0));
        if (fresh.length && L.seen) setTimeout(() => ECHO.UI.toast(`Since you were last here: ${fresh[fresh.length - 1].text}`, 'info', 8), 1000);
        L.seen = world.day;
        if (L.state !== 'dormant' && L.told !== L.state) { L.told = L.state; setTimeout(() => ECHO.UI.toast(`${U.cap(site.name)} is ${STATES[L.state].name.toLowerCase()}: ${STATES[L.state].desc}`, 'info', 6), 400); }
      }
    },
    // more of them when it is infested; stronger when it is awake
    extraPerRoom(site) { const L = site.life; return L && (L.state === 'infested' || L.state === 'awakened') ? 1 : 0; },
    // the two broods (or the two bands) of a contested dungeon fight each other
    band(site, e, kind) {
      const L = site.life;
      if (!L || L.state !== 'contested') return;
      if (L.split) e.band = site.id + (Math.random() < 0.5 ? ':a' : ':b');   // (the bands of a dead lord: either, at random)
      else { const own = (X().DELVES[site.kind].roster || []).some(r => r[0] === kind); e.band = site.id + (own ? ':a' : ':b'); }
    },
    // you came, fought and ran: next time they are waiting at the door
    ambush(game, L0, site, spawn) {
      const L = site.life;
      if (!L || !L.mem.grudge || game.world.day - L.mem.grudge > 40) return;
      L.mem.grudge = null;
      for (let i = 0; i < 3; i++) { const e = spawn(); if (e) { e.aggro = true; e.alert = 1; } }
      setTimeout(() => ECHO.UI.toast('They were waiting for you. They remember the last time.', 'warn', 5), 1200);
    },
    // left without clearing it, after a hard fight in there: a grudge
    left(world, site, hurt) {
      const L = DL.life(world, site);
      if (!L || site.cleared) return;
      if (hurt > 0.55 || Object.keys(site.floorsDone || {}).length) L.mem.grudge = world.day;
    },
    // the two sides of a contested dungeon go for each other when they meet
    feud(game, dt) {
      DL._ft = (DL._ft || 0) - dt;
      if (DL._ft > 0) return;
      DL._ft = 0.6;
      const fo = game.ents.filter(e => e.band && !e.dead && e.foe);
      for (const e of fo) {
        if (e.aggro) continue;
        const o = fo.find(o => o.band !== e.band && o.floor === e.floor && U.dist(o.x, o.y, e.x, e.y) < 7 && ECHO.Ent.lineOfSight(game.world, e.x, e.y, o.x, o.y));
        if (o) { e.aggro = true; o.aggro = true; e._tgPick = o; o._tgPick = e; if (!DL._feudTold) { DL._feudTold = 1; ECHO.Combat.floater(e.x, e.y - 1.4, 'they turn on each other!', '#e0a8ff'); } }
      }
    },
    cleared(world, site, byPlayer) {
      const L = DL.life(world, site);
      if (!L) return;
      if (byPlayer) { L.mem.lordSlain = world.day; L.mem.byYou = (L.mem.byYou || 0) + 1; }
      if (L.state !== 'exploited') DL.set(world, site, 'dormant', null);
    },

    // ------------------------------------------------------------ in the world
    // What spills out of an infested or awakened dungeon roams the country round it; and the camp
    // of those who work an exploited one stands at its mouth.
    update(game, dt) {
      const world = game.world, pe = game.pe;
      if (!world || !pe || (game.pl && game.pl.flying)) return;
      // going in and coming out
      const inside = ECHO.Interior.cur && ECHO.Interior.cur.type === 'delve' && ECHO.Interior.cur.site;
      if (DL._in && (!inside || inside !== DL._in)) DL.left(world, DL._in, DL._hurt);
      if (inside !== DL._in) DL._hurt = 0;
      DL._in = inside || null;
      if (inside) { DL._hurt = Math.max(DL._hurt || 0, 1 - pe.hp / (pe.maxHp || 1)); DL.feud(game, dt); return; }
      if (ECHO.Interior.cur) return;
      DL._t = (DL._t || 0) - dt;
      if (DL._t > 0) return;
      DL._t = 5;
      for (const s of X().sites(world)) {
        if (!DL.ok(s) || s.cleared || !s.life) continue;
        const st = s.life.state;
        if (st !== 'infested' && st !== 'awakened') continue;
        const d = U.dist(s.x, s.y, pe.x, pe.y);
        if (d > 34 || d < 8) continue;
        const out = game.ents.filter(e => !e.dead && e.spill === s.id).length;
        if (out >= (st === 'awakened' ? 5 : 3)) continue;
        const def = X().DELVES[s.kind], roster = s.roster || def.roster || [[def.foes, 1]];
        const tot = roster.reduce((a, r) => a + r[1], 0);
        let r = Math.random() * tot, k = roster[0][0];
        for (const [kk, w] of roster) { r -= w; if (r <= 0) { k = kk; break; } }
        if (k === 'wolf' || !ECHO.Monsters || !ECHO.Monsters.DEFS[k]) continue;
        const a = Math.random() * Math.PI * 2, x = s.x + Math.cos(a) * 3, y = s.y + Math.sin(a) * 3;
        if (ECHO.World.isSolid(world, x, y)) continue;
        X().level(world, s);
        const lvl = X().floorLevel(s, 0);
        const e = ECHO.Monsters.make(game, k, x, y, lvl, {});
        if (!e) continue;
        e.spill = s.id; e.indoor = false;
        game.ents.push(e);
        if (!s.life._told) { s.life._told = 1; ECHO.UI.toast(`Things are coming out of ${s.name} — it is ${STATES[st].name.toLowerCase()}.`, 'warn', 5); }
      }
    },
    // the camp at an exploited dungeon's mouth, for the renderer
    camps(world) { return X().sites(world).filter(s => s.life && s.life.state === 'exploited').map(s => ({ x: s.x + 3.5, y: s.y + 2, site: s })); },
    // for the map's card
    card(world, site) {
      const L = DL.life(world, site);
      if (!L) return '';
      const S0 = STATES[L.state];
      // its story: whole, once you have read every sign of it down there; till then, the signs you have seen
      const O = ORIGINS[L.origin], seen = O ? O.clues.filter((c, i) => (L.cl || 0) & (1 << i)) : [];
      const story = L.knowsAll ? `<p class="hist">${esc(L.hist)}</p>` : seen.length ? `<p class="dim">What you have seen of what it was (${seen.length} of ${O.clues.length} signs):</p>${seen.map(c => `<p class="sign dim">${esc(c)}</p>`).join('')}` : site.found ? '<p class="dim">No one knows what it was. Its floors would tell you.</p>' : '';
      return `<div class="dlife"><span class="st" style="color:${S0.col};border-color:${S0.col}">${S0.name}</span> <span class="dim">${esc(S0.desc)}</span>${story}${L.log.length ? `<p class="dim">Lately: ${esc(L.log[L.log.length - 1].text)}</p>` : ''}</div>`;
    }
  };
})();
