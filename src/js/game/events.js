// Big rare moments: things that happen once in a long while and are talked
// about for years.
//
//   · A hill-giant walking across the land. The ground shakes with each step,
//     birds lift out of the trees, and it ignores you unless you get under its
//     feet or pick a fight. Bring it down and the chronicles will say so.
//   · A dragon. First its shadow passes over you, with a roar that sets the
//     horses screaming. Then word comes of where it has come down, near some
//     village whose herds it is eating. Go and face it, or leave it to fly on.
//   · A siege. An outlaw warband gathers to fall on a town at dusk. Be there
//     and stand with the watch through three waves, and the town will never
//     forget it. Stay away and you'll hear how it went.
//   · The seasons have their own: the salmon run in Thaw (the rivers teem, and
//     there are golden fish), the great herds moving through in Harvest (a
//     white-antlered stag among them), and the Winter Wolf hunting the Frost
//     nights with her pack (her pelt makes a cloak the cold can't get through).
(function () {
  const { U } = ECHO;
  const T = ECHO.TIME;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const GIANTS = ['Grumbold', 'Hrungnir', 'Old Ottar', 'Bergelmir', 'Thrym', 'Skrymir', 'Mossback', 'Kettle-Head'];
  const DRAGONS = ['Vyrmathra', 'Ashwing', 'Calcharon', 'Sevrith', 'Morgrath', 'Ysolde Emberjaw'];

  const E = ECHO.Events = {
    st(world) { return (world.events = world.events || { lastGiant: -99, lastDragon: -99, lastSiege: -99, siege: null, dragon: null, giant: null, winterYear: -1, herdYear: -1, salmonYear: -1 }); },
    date(world) { return T.dateOf(world.day); },
    salmonRun(world) { const d = E.date(world); return d.seasonIdx === 0 && d.dayOfSeason >= 4 && d.dayOfSeason <= 8; },
    greatHerd(world) { const d = E.date(world); return d.seasonIdx === 2 && d.dayOfSeason >= 3 && d.dayOfSeason <= 7; },
    winterHunt(world) { const d = E.date(world); return d.seasonIdx === 3 && d.dayOfSeason >= 2; },
    now(world) { return world.day * 1440 + world.minute; },
    fly: null,
    // ------------------------------------------------------------ the clock
    update(game, dt) {
      const world = game.world, pe = game.pe;
      if (!world || !pe) return;
      const S = E.st(world);
      if (E.fly) E.flyTick(game, dt);
      if (S.siege) E.siegeTick(game, dt);
      if (S.dragon) E.dragonTick(game, dt);
      E.hourT = (E.hourT || 0) - dt * game.minPerSec();
      if (E.hourT > 0) return;
      E.hourT = 60;
      E.hourly(game);
    },
    hourly(game) {
      const world = game.world, pe = game.pe, pl = game.pl, S = E.st(world);
      if (pl.capture || game.defeating) return;
      const out = !ECHO.Interior.cur;
      const inTown = ECHO.World.settlementAt(world, pe.x, pe.y, 12);
      const night = game.isNight();
      const year = E.date(world).year;
      // the seasons
      if (E.salmonRun(world) && S.salmonYear !== year) { S.salmonYear = year; game.ui.toast('The salmon are running! For a few days the rivers teem — bites come fast, and there are golden fish among them. (Cast a line at any river.)', 'legend', 7); ECHO.Chronicle.add(world, { text: 'The salmon are running in the rivers.', kind: 'season', importance: 1 }); }
      if (E.greatHerd(world) && S.herdYear !== year) { S.herdYear = year; game.ui.toast('The great herds are moving through the woods\' edges. Hunters say a white-antlered stag runs with them this year.', 'legend', 7); ECHO.Chronicle.add(world, { text: 'The great deer herds are on the move.', kind: 'season', importance: 1 }); }
      if (E.winterHunt(world) && S.winterYear !== year && night && out && !inTown && Math.random() < 0.22) { S.winterYear = year; E.winterWolf(game); }
      if (!out) return;
      if (ECHO.Director && !ECHO.Director.allow(game, 'rare')) return;
      // the rare ones
      if (!S.giant && world.day - S.lastGiant > 9 && !inTown && Math.random() < 0.05) E.spawnGiant(game);
      else if (!S.dragon && !E.fly && world.day - S.lastDragon > 16 && !night && Math.random() < 0.03) E.flyover(game);
      else if (!S.siege && world.day - S.lastSiege > 12 && Math.random() < 0.04) E.planSiege(game);
    },
    // ------------------------------------------------------------ the hill-giant
    spawnGiant(game) {
      const world = game.world, pe = game.pe, S = E.st(world);
      for (let k = 0; k < 20; k++) {
        const a = Math.random() * Math.PI * 2;
        const sx = pe.x + Math.cos(a) * 26, sy = pe.y + Math.sin(a) * 26;
        const ex = pe.x - Math.cos(a) * 45 + Math.cos(a + Math.PI / 2) * 6, ey = pe.y - Math.sin(a) * 45 + Math.sin(a + Math.PI / 2) * 6;
        if (ECHO.World.isSolid(world, sx, sy) || (ECHO.Water && ECHO.Water.kind(world, sx, sy)) || ECHO.World.isSolid(world, ex, ey)) continue;
        const lv = Math.max(4, ECHO.Prowess ? ECHO.Prowess.level(game.pl) + 3 : 6);
        const e = ECHO.Monsters.make(game, 'troll', sx, sy, lv, { noElite: true });
        const name = GIANTS[Math.floor(Math.random() * GIANTS.length)];
        e.event = 'giant'; e.giant = true; e.label = `${name} the Hill-Giant`;
        e.foe = Object.assign({}, e.foe, { name: e.label, reach: 2.9, elite: true });
        e.scale = 3.1; e.r = 0.95; e.speed = 1.5;
        e.hp = e.maxHp = 900 + lv * 90; e.dmgMul = (e.dmgMul || 1) * 1.7;
        e.ab = Object.assign({}, e.ab, { regen: 0 });
        e.route = { x: ex, y: ey }; e.indoor = false; e.aggro = false;
        game.addEnt(e);
        S.giant = { name, day: world.day }; S.lastGiant = world.day;
        game.ui.toast('The ground trembles under your feet… and again. Something enormous is walking this way.', 'warn', 6);
        game.shake(0.2);
        return e;
      }
      return null;
    },
    // returns true when the event handles this foe this frame
    foeThink(game, e, dt) {
      if (e.event !== 'giant') return false;
      const pe = game.pe, world = game.world;
      const d = U.dist(e.x, e.y, pe.x, pe.y);
      // every step shakes the ground
      e.stepT = (e.stepT || 0) - dt;
      if (e.moving && e.stepT <= 0) {
        e.stepT = 0.95;
        if (d < 20) { game.shake(0.03 + (1 - d / 20) * 0.14); if (ECHO.Sfx) ECHO.Sfx.play('stomp', { vol: U.clamp(1.2 - d / 20, 0.15, 1), pitch: 0.55 }); }
        if (ECHO.Fauna) for (const f of ECHO.Fauna.flocks) if (!f.up && U.dist(f.x, f.y, e.x, e.y) < 12) ECHO.Fauna.takeOff(game, f, e);
        if (ECHO.Climate && ECHO.Climate.prints) { /* the giant's prints are its own */ }
      }
      if (e.aggro) {
        if (!e.roared) { e.roared = true; e.say = ['LITTLE THING!', 'You sting, little one!', 'GRAAAH!'][Math.floor(Math.random() * 3)]; e.sayT = 2.5; if (ECHO.Sfx) ECHO.Sfx.play('roar', { pitch: 0.5 }); game.ui.bossBar(e); }
        if (d > 32) { e.aggro = false; e.roared = false; game.ui.bossBar(null); }
        return false;
      }
      if (d < 3.4) { e.aggro = true; return false; }   // you got under its feet
      ECHO.Ent.seek(world, e, e.route.x, e.route.y, e.speed, dt, 0.3);
      if (Math.random() < dt * 0.04 && d < 16) { e.say = ['Hmmmm…', 'Hrrrm.', '*sniffs the air*', 'Where is the river…'][Math.floor(Math.random() * 4)]; e.sayT = 2.5; }
      if (U.dist(e.x, e.y, e.route.x, e.route.y) < 2 || d > 75) { e.dead = true; e.vanish = true; E.st(world).giant = null; }
      return true;
    },
    onKill(e, from) {
      const game = ECHO.Game, world = game.world, pl = game.pl, S = E.st(world);
      const byYou = from === game.pe || (from && from.isCompanion);
      const r = Math.random;
      const add = (kind, qty) => game.loot.push({ x: e.x + (r() - 0.5) * 2.4, y: e.y + (r() - 0.5) * 2.4, kind, qty });
      if (e.event === 'giant') {
        S.giant = null; game.ui.bossBar(null); game.shake(0.9);
        ECHO.Combat.burst(e.x, e.y, '#7a6a5a', 40, 5, 1.2, 3);
        if (byYou) {
          add('gold', 140 + Math.floor(r() * 120)); add('giantheart', 1); add('trollhide', 3);
          for (let i = 0; i < 2; i++) ECHO.Monsters.dropGear(game, e.x + (r() - 0.5) * 2, e.y + (r() - 0.5) * 2, (e.lvl || 6) + 1, 25, `from the pack of ${e.label}`);
          pl.renown += 30;
          ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} brought down ${e.label}.`, importance: 3, x: e.x, y: e.y, rep: 8, tag: 'brave' });
          game.ui.banner('Giant-slayer', `${e.label} lies where it fell`);
          game.ui.toast(`${e.label} falls like a tree. Its heart, its hoard and its hide are yours.`, 'boss', 7);
        }
      }
      if (e.event === 'dragon') {
        S.dragon = null; S.lastDragon = world.day;
        if (byYou) {
          add('dragonscale', 3 + Math.floor(r() * 2)); add('gold', 300 + Math.floor(r() * 200));
          pl.renown += 60;
          game.ui.banner('Dragonslayer', `${e.boss.name} will trouble no one again`);
          for (const s of world.settlements) { s.rep = s.rep || {}; s.rep[pl.charId] = U.clamp((s.rep[pl.charId] || 0) + 6, -100, 100); }
        }
      }
    },
    // ------------------------------------------------------------ the dragon
    flyover(game) {
      const pe = game.pe;
      const a = Math.random() * Math.PI * 2;
      E.fly = { x: pe.x - Math.cos(a) * 30, y: pe.y - Math.sin(a) * 30, dx: Math.cos(a), dy: Math.sin(a), t: 0, dur: 6, roared: false, speed: 11 };
    },
    flyTick(game, dt) {
      const f = E.fly, pe = game.pe;
      f.t += dt; f.x += f.dx * f.speed * dt; f.y += f.dy * f.speed * dt;
      const d = U.dist(f.x, f.y, pe.x, pe.y);
      if (!f.roared && d < 9) {
        f.roared = true;
        if (ECHO.Sfx) { ECHO.Sfx.play('roar', { pitch: 0.45 }); ECHO.Sfx.noise(ECHO.Sfx.ctx ? ECHO.Sfx.ctx.currentTime : 0, 1.6, 'lowpass', 600, 140, 0.6, 0.35, 0.2); }
        game.shake(0.45);
        if (ECHO.Fauna) for (const fl of ECHO.Fauna.flocks) if (!fl.up) ECHO.Fauna.takeOff(game, fl, pe);
        for (const e of game.ents) {
          if (e.dead || e.hidden) continue;
          if (e.species === 'deer' && ECHO.Fauna) ECHO.Fauna.panic(game, e.herd, { x: f.x, y: f.y });
          if (e.type === 'person' && U.dist(e.x, e.y, pe.x, pe.y) < 18 && Math.random() < 0.6) { e.say = ['DRAGON!', 'Gods preserve us!', 'Get inside!', 'Did you see that?!'][Math.floor(Math.random() * 4)]; e.sayT = 2.5; }
        }
        if (ECHO.Life && game.pe.mounted && ECHO.PlayerCtl.ride) ECHO.PlayerCtl.ride.rearT = 1.1;
        game.ui.toast('A shadow sweeps over you, huge and fast, and a roar shakes the air. A dragon!', 'boss', 6);
      }
      if (f.t > f.dur) { E.fly = null; E.dragonLand(game); }
    },
    dragonLand(game) {
      const world = game.world, pe = game.pe, S = E.st(world), pl = game.pl;
      const vill = world.settlements.filter(s => U.dist(s.x, s.y, pe.x, pe.y) < 90 && s.kind !== 'capital').sort(() => Math.random() - 0.5);
      for (const s of vill) {
        for (let k = 0; k < 20; k++) {
          const a = Math.random() * Math.PI * 2, r = 13 + Math.random() * 6;
          const x = Math.round(s.x + Math.cos(a) * r), y = Math.round(s.y + Math.sin(a) * r);
          if (ECHO.World.isSolid(world, x, y) || ECHO.World.isSolid(world, x, y - 2.5) || (ECHO.Water && ECHO.Water.kind(world, x, y))) continue;
          if (world.settlements.some(t => U.dist(t.x, t.y, x, y) < 10)) continue;
          const name = DRAGONS[Math.floor(Math.random() * DRAGONS.length)];
          const hp = 1500 + (ECHO.Prowess ? ECHO.Prowess.level(pl) * 60 : 300);
          const lair = { id: 'dragon' + world.day, x, y, rocks: [], regionId: ECHO.World.regionAt(world, x, y).id, dragon: true,
            boss: { id: 'dragon' + world.day, name, title: 'the Dragon', kind: 'drake', maxHp: hp, hp, alive: true, fled: false, absentUntil: -1, dmgMul: 1.6, color: '#8a2a1a', belly: '#c8803a',
              armor: { melee: 0.1, ranged: 0.15, fire: 0.6 }, scars: [], memory: { encounters: 0, dodge: { left: 0, right: 0, back: 0 }, blocks: 0, attacksSeen: 0, rangedTime: 0, meleeTime: 0, damageBy: { melee: 0, ranged: 0, fire: 0 }, knownFoes: {} }, kills: 0, bornDay: world.day - 900 } };
          S.dragon = { x, y, sid: s.id, town: s.name, name, day: world.day, lair };
          S.lastDragon = world.day;
          ECHO.Chronicle.add(world, { text: `A dragon, ${name}, has come down near ${s.name}. The herds there are being taken.`, kind: 'beast', importance: 2, x, y });
          const free = !pl.tracked || pl.tracked.startsWith('mark:');
          if (free) pl.tracked = `mark:${x.toFixed(1)}:${y.toFixed(1)}:${name} the Dragon`;
          game.ui.toast(`Word spreads fast: the dragon has come down near ${s.name}, and is eating the herds. Its name, they say, is ${name}.${free ? ' (The line at the top of the screen points the way.)' : ` (Head for ${s.name}; it is somewhere outside the village.)`}`, 'boss', 8);
          if (ECHO.Purpose) { ECHO.Purpose._html = null; ECHO.Purpose.t = 0; }
          return;
        }
      }
    },
    dragonTick(game, dt) {
      const world = game.world, pe = game.pe, S = E.st(world), D = S.dragon;
      // it leaves after a fortnight, fat on the herds
      if (world.day - D.day > 14) {
        S.dragon = null;
        for (const e of game.ents) if (e.dragon) { e.dead = true; e.vanish = true; game.ui.bossBar(null); }
        ECHO.Chronicle.add(world, { text: `The dragon ${D.name} has flown on from ${D.town}.`, kind: 'beast', importance: 1, x: D.x, y: D.y });
        return;
      }
      if (D.lastDay !== world.day) { D.lastDay = world.day; const s = world.settlements.find(t => t.id === D.sid); if (s && s.stock) { s.stock.food = Math.max(0, s.stock.food * 0.93); s.wealth = Math.max(0, (s.wealth || 0) * 0.97); } }
      if (ECHO.Interior.cur) return;
      const near = U.dist(D.x, D.y, pe.x, pe.y) < 28;
      const has = game.ents.some(e => e.dragon && !e.dead);
      if (near && !has) {
        const e = ECHO.Boss.spawn(game, D.lair);
        e.dragon = true; e.event = 'dragon'; e.r = 1.5; e.label = `${D.name} the Dragon`;
        game.addEnt(e);
      }
    },
    dragonFled(game, e) {
      const S = E.st(game.world);
      if (S.dragon) ECHO.Chronicle.add(game.world, { text: `${S.dragon.name} the Dragon was driven off, wounded, from ${S.dragon.town}.`, kind: 'beast', importance: 2, x: e.x, y: e.y });
      S.dragon = null; S.lastDragon = game.world.day - 6;
      game.ui.toast('The dragon beats into the sky, bleeding, and is gone over the hills. It will remember you.', 'legend', 6);
    },
    // ------------------------------------------------------------ the siege
    planSiege(game, force) {
      const world = game.world, pe = game.pe, S = E.st(world);
      const towns = world.settlements.filter(s => s.kind !== 'capital' && U.dist(s.x, s.y, pe.x, pe.y) < (force ? 400 : 70));
      if (!towns.length) return null;
      const s = towns.sort((a, b) => U.dist(a.x, a.y, pe.x, pe.y) - U.dist(b.x, b.y, pe.x, pe.y))[Math.floor(Math.random() * Math.min(3, towns.length))];
      const camp = world.camps.filter(c => c.alive !== false && c.members.length >= 2).sort((a, b) => U.dist(a.x, a.y, s.x, s.y) - U.dist(b.x, b.y, s.x, s.y))[0];
      const lead = camp && world.npcs[camp.leader];
      let start = world.day * 1440 + 19 * 60;
      if (start - E.now(world) < 12 * 60) start += 1440;
      S.siege = { sid: s.id, town: s.name, campId: camp ? camp.id : null, camp: camp ? camp.name : 'the hills', lead: lead ? lead.first : null, start, status: 'coming', wave: 0, dmg: 0, killed: 0, t: 0 };
      S.lastSiege = world.day;
      const when = Math.floor((start - E.now(world)) / 1440) >= 1 ? 'at dusk tomorrow' : 'at dusk';
      ECHO.Chronicle.add(world, { text: `Outlaws are gathering to attack ${s.name}.`, kind: 'war', importance: 2, sid: s.id });
      const pl = game.pl;
      const free = !pl.tracked || pl.tracked.startsWith('mark:');
      if (free) pl.tracked = `mark:${s.x.toFixed(1)}:${s.y.toFixed(1)}:The siege of ${s.name}`;
      game.ui.toast(`A rider, white with dust: "${lead ? lead.first + ' and the outlaws of ' + (camp.name || 'the hills') : 'An outlaw warband'} mean to fall on ${s.name} ${when}! Every blade will be needed!"${free ? ' (The line at the top of the screen points the way.)' : ''}`, 'boss', 9);
      if (ECHO.Purpose) { ECHO.Purpose._html = null; ECHO.Purpose.t = 0; }
      return S.siege;
    },
    siegeTick(game, dt) {
      const world = game.world, pe = game.pe, S = E.st(world), G = S.siege;
      const s = world.settlements.find(t => t.id === G.sid);
      if (!s) { S.siege = null; return; }
      const now = E.now(world);
      const d = U.dist(s.x, s.y, pe.x, pe.y);
      const here = d < 40 && !ECHO.Interior.cur;
      if (G.status === 'coming') {
        if (now < G.start) return;
        if (here) { G.status = 'on'; G.t = 0; game.ui.banner(`The siege of ${s.name}`, 'Horns in the dusk — they are coming'); if (ECHO.Sfx) ECHO.Sfx.play('roar', { pitch: 1.3, vol: 0.5 }); E.wave(game, s, G); }
        else return E.siegeEnd(game, s, G, Math.random() < 0.55 ? 'held' : 'fell', false);
        return;
      }
      if (G.status !== 'on') return;
      G.t += dt;
      if (!here && d > 60) return E.siegeEnd(game, s, G, Math.random() < 0.5 ? 'held' : 'fell', false);
      const foes = game.ents.filter(e => e.siege === G.sid && !e.dead && !e.yielded && !e.dqLeave);
      // they press for the heart of the town; every one standing there does harm
      for (const e of foes) if (U.dist(e.x, e.y, s.x, s.y) < 5) G.dmg += dt * 2.2;
      if (G.dmg >= 100) return E.siegeEnd(game, s, G, 'fell', true);
      if (foes.length <= 1 && G.t > 6) {
        if (G.wave >= 3) { for (const e of foes) { e.dqLeave = true; } return E.siegeEnd(game, s, G, 'held', true); }
        E.wave(game, s, G);
      }
      // the night ends it, one way or another
      if (world.minute > 6 * 60 && world.minute < 8 * 60 && G.t > 30) return E.siegeEnd(game, s, G, 'held', true);
    },
    wave(game, s, G) {
      const world = game.world;
      G.wave++; G.t = 0;
      const camp = world.camps.find(c => c.id === G.campId);
      const a = camp ? Math.atan2(camp.y - s.y, camp.x - s.x) : Math.random() * Math.PI * 2;
      const n = [5, 6, 5][G.wave - 1] || 5;
      const pool = [];
      for (const c of world.camps.slice().sort((x, y) => (x.id === G.campId ? -1 : 0) - (y.id === G.campId ? -1 : 0))) {
        if (c.alive === false) continue;
        for (const id of c.members) { const p = world.npcs[id]; if (p && p.status === 'alive' && !game.ents.some(e => e.npcId === id && !e.dead)) pool.push(p); }
      }
      const lead = camp && world.npcs[camp.leader];
      for (let i = 0; i < n; i++) {
        const aa = a + (i - n / 2) * 0.12;
        const sp = ECHO.Ent.freeSpot(world, s.x + Math.cos(aa) * 17, s.y + Math.sin(aa) * 17, 4);
        if (!sp) continue;
        let e;
        const chief = G.wave === 3 && i === 0 && lead && lead.status === 'alive' && !game.ents.some(x => x.npcId === lead.id && !x.dead);
        const npc = chief ? lead : pool.length ? pool.splice(Math.floor(Math.random() * pool.length), 1)[0] : null;
        if (npc) { e = ECHO.Spawner.makePerson(game, npc, sp.x, sp.y, 'bandit'); if (chief) { e.maxHp *= 1.8; e.hp = e.maxHp; e.say = 'Burn it! Burn it all!'; e.sayT = 3; } }
        else { e = ECHO.Quests.makeFoe(game, 'brigand', sp.x, sp.y, { aggro: false }); e.event = 'siege'; }
        e.siege = G.sid; e.siegeGoal = { x: s.x + (Math.random() - 0.5) * 3, y: s.y + (Math.random() - 0.5) * 3 };
        game.addEnt(e);
      }
      // the watch turns out
      for (const e of game.ents) if (e.type === 'person' && e.role === 'guard' && !e.dead && U.dist(e.x, e.y, s.x, s.y) < 30) { e.hidden = false; e.siegeDef = G.sid; }
      game.ui.toast(G.wave === 1 ? `They come out of the dusk from the ${['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'][(Math.round(a / (Math.PI / 4)) + 8) % 8]}, torches and steel.` : G.wave === 2 ? 'A second wave — more of them, and angrier.' : `The last wave — ${lead ? lead.first + ' leads it' : 'their chief leads it'}.`, 'warn', 5);
    },
    // an attacker with no one to fight marches on the town square
    siegeThink(game, e, npc, dt, target) {
      const G = E.st(game.world).siege;
      if (!G || G.sid !== e.siege) { e.siege = null; return false; }
      if (target) return false;
      const g = e.siegeGoal;
      if (U.dist(e.x, e.y, g.x, g.y) > 1.2) ECHO.Ent.travel(game.world, e, g.x, g.y, e.speed, dt);
      else { e.moving = false; if (e.sayT <= 0 && Math.random() < dt * 0.3) { e.say = ['Burn it!', 'Take what you can carry!', 'Where are your guards now?'][Math.floor(Math.random() * 3)]; e.sayT = 2; } }
      return true;
    },
    foeSiege(game, e, dt) {
      // fallback brigands do the same
      if (e.event !== 'siege') return false;
      const G = E.st(game.world).siege;
      if (!G) { e.dead = true; e.vanish = true; return true; }
      if (e.aggro) return false;
      const d = U.dist(e.x, e.y, game.pe.x, game.pe.y);
      if (d < 7) { e.aggro = true; return false; }
      ECHO.Ent.travel(game.world, e, e.siegeGoal.x, e.siegeGoal.y, e.speed, dt);
      return true;
    },
    siegeEnd(game, s, G, how, seen) {
      const world = game.world, pl = game.pl, S = E.st(world);
      S.siege = null;
      if (pl.tracked && pl.tracked.startsWith('mark:') && pl.tracked.endsWith(`The siege of ${s.name}`)) pl.tracked = null;
      for (const e of game.ents) if (e.siege === G.sid && !e.dead) { e.dqLeave = true; e.siege = null; }
      if (how === 'held') {
        if (seen) {
          const gold = 60 + 25 * G.wave;
          pl.gold += gold; pl.renown += 25;
          s.rep = s.rep || {}; s.rep[pl.charId] = U.clamp((s.rep[pl.charId] || 0) + 15, -100, 100);
          for (const n of ECHO.People.residents(world, s)) if (n.status === 'alive') n.op[pl.charId] = U.clamp((n.op[pl.charId] || 0) + 12, -100, 100);
          ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} stood with the watch of ${s.name} and threw back the outlaws who came to burn it.`, importance: 3, sid: s.id, rep: 10, tag: 'protect', factionRep: { [s.faction]: 8 } });
          ECHO.Monsters.dropGear(game, game.pe.x + 1, game.pe.y, (ECHO.Prowess ? ECHO.Prowess.level(pl) : 4) + 1, 25, `the gift of the watch of ${s.name}`);
          game.ui.banner(`${s.name} stands`, 'The outlaws break and run');
          game.ui.toast(`The captain of the watch clasps your arm and presses ${gold} crowns and a fine piece of gear on you (at your feet). ${s.name} will not forget this.`, 'legend', 8);
          if (ECHO.Music) ECHO.Music.stinger('fate');
        } else ECHO.Chronicle.add(world, { text: `The watch of ${s.name} threw back an outlaw attack.`, kind: 'war', importance: 2, sid: s.id });
      } else {
        if (s.stock) s.stock.food = Math.max(0, s.stock.food * 0.6);
        s.wealth = Math.max(0, (s.wealth || 0) * 0.55);
        const camp = world.camps.find(c => c.id === G.campId); if (camp) { camp.loot.gold += 60; camp.loot.food += 20; }
        ECHO.Chronicle.add(world, { text: `${s.name} was sacked by outlaws${G.camp ? ' from ' + G.camp : ''}. Stores and houses were plundered.`, kind: 'war', importance: 2, sid: s.id });
        game.ui.toast(seen ? `They broke into the square. ${s.name} burns and is plundered; the outlaws melt back into the dark with all they can carry.` : `Word comes: ${s.name} was sacked by outlaws in the night.`, 'warn', 7);
      }
    },
    // ------------------------------------------------------------ the Winter Wolf
    winterWolf(game) {
      const world = game.world, pe = game.pe;
      const a = Math.random() * Math.PI * 2;
      const cx = pe.x + Math.cos(a) * 16, cy = pe.y + Math.sin(a) * 16;
      const region = ECHO.World.regionAt(world, cx, cy);
      let lead = null;
      for (let i = 0; i < 5; i++) {
        const sp = ECHO.Ent.freeSpot(world, cx + (Math.random() - 0.5) * 3, cy + (Math.random() - 0.5) * 3, 3); if (!sp) continue;
        const w = ECHO.Spawner.makeCreature(game, 'wolf', sp.x, sp.y, region, 'winter');
        if (!lead) { lead = w; w.winter = true; w.event = 'winter'; w.scale = 1.9; w.hp = w.maxHp = w.maxHp * 8; w.dmgMul = 1.7; w.label = 'the Winter Wolf'; w.speed *= 1.1; }
        w.aggro = true; w.target = pe;
        game.addEnt(w);
      }
      if (lead) {
        if (ECHO.Music && ECHO.Music.howl && ECHO.Music.ready && ECHO.Music.ready()) ECHO.Music.howl(ECHO.Music.ctx.currentTime, 1.6);
        game.ui.toast('A howl, very close, and answered on every side. Out of the dark comes a wolf as white as the snow and twice the size of the rest: the Winter Wolf, and her pack.', 'boss', 8);
      }
    },
    // ------------------------------------------------------------ for tests and the curious
    force(game, kind) {
      const S = E.st(game.world);
      if (kind === 'giant') return E.spawnGiant(game);
      if (kind === 'dragon') { S.dragon = null; return E.flyover(game); }
      if (kind === 'siege') { S.siege = null; return E.planSiege(game, true); }
      if (kind === 'winter') return E.winterWolf(game);
    }
  };
})();
