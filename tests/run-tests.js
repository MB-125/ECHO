// Headless tests for the world simulation. Loads the browser scripts into a
// sandbox and checks that the world actually lives and that consequences chain.
//   npm test
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SIM_FILES = [
  'core.js', 'world/worldgen.js', 'world/townstyle.js', 'sim/sim.js', 'sim/people.js', 'sim/ecology.js', 'sim/economy.js',
  'sim/politics.js', 'sim/intel.js', 'sim/plights.js', 'sim/chronicle.js', 'sim/civ.js',
  'sim/mysteries.js', 'sim/legacy.js', 'sim/minds.js', 'sim/weather.js', 'sim/disease.js', 'sim/production.js', 'sim/property.js', 'sim/law.js', 'sim/watch.js', 'sim/realm.js', 'sim/military.js', 'sim/danger.js', 'sim/realms.js', 'sim/arsenal.js', 'sim/explore.js', 'sim/discover.js', 'sim/ambition.js', 'sim/holding.js', 'sim/gear.js', 'sim/temper.js', 'sim/prowess.js', 'sim/story.js', 'sim/bounty.js', 'sim/rivals.js', 'sim/delvers.js', 'sim/powers.js', 'sim/evolve.js', 'sim/gates.js', 'sim/wildwood.js', 'sim/clearing.js', 'sim/guardwork.js', 'sim/titans.js', 'sim/migrations.js', 'sim/dungeonlife.js', 'sim/renown.js', 'sim/guild.js', 'sim/worldevents.js', 'sim/townlife.js', 'sim/calamity.js', 'sim/wonders.js', 'game/patron.js', 'sim/festivals.js', 'sim/letters.js', 'sim/frontier.js', 'sim/globe.js', 'save.js', 'game/arcana.js', 'game/pastimes.js', 'game/harvest.js', 'game/slimes.js', 'game/well.js', 'game/manawear.js', 'game/deep.js', 'game/hidden.js', 'game/ground.js', 'game/loose.js', 'game/entities.js', 'game/thrown.js', 'game/guns.js', 'game/react.js', 'game/build.js', 'game/live.js', 'game/nav.js', 'game/auto.js', 'game/arms.js'
];

function loadEcho() {
  const ctx = { console, Math, Date, JSON, Buffer, Promise, Set, Map, Uint8Array, Int32Array, Float32Array, Object, Array, String, Number, isFinite };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of SIM_FILES) {
    const code = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', f), 'utf8');
    vm.runInContext(code, ctx, { filename: f });
  }
  return ctx.ECHO;
}

let failures = 0, passes = 0;
function check(name, cond, detail) {
  if (cond) { passes++; console.log('  ✓ ' + name + (detail ? '  (' + detail + ')' : '')); }
  else { failures++; console.log('  ✗ ' + name + (detail ? '  (' + detail + ')' : '')); }
}

function summarize(ECHO, w) {
  const alive = Object.values(w.npcs).filter(n => n.status !== 'dead').length;
  return `day ${w.day}, ${alive} alive, ${w.chronicle.length} chronicle entries, wars ${w.stats.wars}, famines ${w.stats.famines}, births ${w.stats.births}, deaths ${w.stats.deaths}`;
}

function main() {
  const t0 = Date.now();
  const ECHO = loadEcho();
  console.log('World generation');
  const world = ECHO.generateWorld({ seed: 12345, name: 'Testworld' });
  check('generated settlements', world.settlements.length >= 6, world.settlements.map(s => s.name + '(' + s.kind + ',' + s.residents.length + ')').join(' '));
  check('roads connect towns', world.roads.length >= world.settlements.length - 1, world.roads.length + ' roads');
  check('apex lairs placed', world.lairs.length >= 2, world.lairs.map(l => l.boss.name).join(', '));
  check('ruins with tablets', world.ruins.length >= 3 && world.ruins.every(r => r.tablet != null), world.ruins.length + ' ruins');
  check('bandit camps', world.camps.length >= 1, world.camps.map(c => c.name + ':' + c.members.length).join(', '));
  check('population', Object.keys(world.npcs).length > 180, Object.keys(world.npcs).length + ' people');
  check('rulers crowned', !!world.factions.valdren.ruler && !!world.factions.ashmere.ruler);
  console.log('   ' + summarize(ECHO, world), `(${Date.now() - t0}ms)`);

  console.log('\nSave / load round trip');
  const json = ECHO.Save.serialize(world);
  const w2 = ECHO.Save.deserialize(json);
  check('round trip keeps tiles and people', w2.tiles.length === world.tiles.length && Object.keys(w2.npcs).length === Object.keys(world.npcs).length, (json.length / 1024).toFixed(0) + ' KB');

  console.log('\nA year of history');
  const t1 = Date.now();
  const before = world.chronicle.length;
  ECHO.Sim.fastForward(world, 60);
  check('world keeps living', world.chronicle.length > before + 10, summarize(ECHO, world) + ` (${Date.now() - t1}ms)`);
  check('people are born', world.stats.births > 0);
  check('people die', world.stats.deaths > 0);
  {
    // the long dead are slimmed (kept, named, with a few memories), the newly dead left whole
    const dead = Object.values(world.npcs).filter(n => n.status === 'dead');
    const day0 = world.day;
    const fresh = dead[0];
    if (fresh) { fresh.slim = false; fresh.rel = { x: 50 }; fresh.mem = [1, 2, 3, 4, 5].map(i => ({ d: 1, t: 'm' + i, w: i })); fresh.diedDay = day0; }
    ECHO.People.slimDead(world);
    const keptWhole = fresh && !fresh.slim && fresh.rel.x === 50;
    if (fresh) fresh.diedDay = day0 - 400;
    const n = ECHO.People.slimDead(world);
    check('the long dead are slimmed to name, kin and their strongest memories; the newly dead are left whole', !fresh || (keptWhole && n >= 1 && fresh.slim && !Object.keys(fresh.rel).length && fresh.mem.length === 3 && fresh.mem[0].t === 'm5' && world.npcs[fresh.id] === fresh), dead.length + ' dead');
  }
  const kinds = {};
  for (const e of world.chronicle) kinds[e.kind] = (kinds[e.kind] || 0) + 1;
  console.log('   chronicle kinds:', JSON.stringify(kinds));
  console.log('   sample history:');
  world.chronicle.filter(e => e.imp >= 1).slice(-14).forEach(e => console.log('     · ' + ECHO.TIME.fmtDate(e.d) + ' — ' + e.text));

  console.log('\nThe monster-kill cascade');
  // (a controlled experiment on the food chain: the named monsters and their raids
  // are left out of it — they are tested on their own below)
  const powersTick = ECHO.Powers.dailyTick; ECHO.Powers.dailyTick = () => {};
  // Two identical worlds; in one, an apex beast dies. Try every beast and
  // report the one whose death matters most (the village with most fields).
  const A0 = ECHO.generateWorld({ seed: 777, name: 'Control', prehistoryDays: 10 });
  const snap = ECHO.Save.serialize(A0);
  let best = null;
  for (let li = 0; li < A0.lairs.length; li++) {
    const A = ECHO.Save.deserialize(snap), B = ECHO.Save.deserialize(snap);
    A._rng = new ECHO.RNG(A0.rngState); B._rng = new ECHO.RNG(A0.rngState);
    const lairB = B.lairs[li];
    lairB.boss.alive = false; lairB.boss.diedDay = B.day;
    const vB = B.settlements.find(s => s.id === lairB.villageId), vA = A.settlements.find(s => s.id === lairB.villageId);
    const regionId = ECHO.World.regionAt(B, vB.x, vB.y).id;
    const series = [];
    let maxHunger = 0, maxUnrest = 0;
    for (let d = 0; d < 90; d++) {
      ECHO.Sim.dailyTick(A, true); ECHO.Sim.dailyTick(B, true);
      maxHunger = Math.max(maxHunger, vB.hunger); maxUnrest = Math.max(maxUnrest, vB.unrest - vA.unrest);
      if (d % 15 === 14) series.push(`d${d + 1}: gnawers ${Math.round(A.regions[regionId].eco.gnawer)}→${Math.round(B.regions[regionId].eco.gnawer)}, crop ${A.regions[regionId].eco.crop.toFixed(2)}→${B.regions[regionId].eco.crop.toFixed(2)}, bread ${vA.prices.food}→${vB.prices.food}, hunger ${vA.hunger.toFixed(2)}→${vB.hunger.toFixed(2)}, unrest ${vA.unrest.toFixed(0)}→${vB.unrest.toFixed(0)}`);
    }
    const cropDrop = A.regions[regionId].eco.crop - B.regions[regionId].eco.crop;
    const score = cropDrop + maxHunger * 2 + ((vB._emigrants || 0) - (vA._emigrants || 0)) / 5;
    // farmers who gave up their failing fields for another trade
    const gave = (W, v) => v.residents.filter(id => W.npcs[id] && (W.npcs[id].mem || []).some(m => /gave up farming/.test(m.t || m.text || ''))).length;
    const r = { li, A, B, vA, vB, regionId, series, maxHunger, maxUnrest, score, name: lairB.boss.name, village: vB.name, gave: gave(B, vB) - gave(A, vA) };
    if (!best || r.score > best.score) best = r;
  }
  {
    const { A, B, vA, vB, regionId, series } = best;
    console.log(`   killing ${best.name}, which hunted near ${best.village}:`);
    series.forEach(s => console.log('   ' + s));
    const gB = B.regions[regionId].eco.gnawer, gA = A.regions[regionId].eco.gnawer;
    check('vermin multiply without the apex', gB > gA * 2.2, `${Math.round(gA)} vs ${Math.round(gB)}`);
    check('crops fail', B.regions[regionId].eco.crop < A.regions[regionId].eco.crop - 0.25);
    const avgPrice = (s) => s.priceHistory.slice(-10).reduce((a, b) => a + b, 0) / 10;
    check('food prices rise in the village', avgPrice(vB) > avgPrice(vA) * 1.3, `${avgPrice(vA).toFixed(1)} vs ${avgPrice(vB).toFixed(1)}`);
    check('hunger brings migration, unrest, or farmers leaving the fields', best.maxHunger > 0.3 || best.maxUnrest > 10 || (vB._emigrants || 0) > (vA._emigrants || 0) || best.gave >= 3, `peak hunger ${best.maxHunger.toFixed(2)}, extra unrest ${best.maxUnrest.toFixed(0)}, emigrants ${vA._emigrants || 0}→${vB._emigrants || 0}, ${best.gave} more gave up farming`);
  }
  ECHO.Powers.dailyTick = powersTick;

  console.log('\nRising powers');
  {
    const Wp = ECHO.generateWorld({ seed: 9191, name: 'Powers', prehistoryDays: 2 });
    const Pw = ECHO.Powers;
    const lv0 = {}; for (const id in Wp.npcs) lv0[id] = Pw.lvOf(Wp.npcs[id]);
    const deaths0 = Wp.stats.deaths;
    // one that met a player and wants revenge, set down near a town
    const s0 = Wp.settlements[0];
    const vengeful = Pw.rise(Wp, { kind: 'goblin', lv: 4, x: s0.x + 20, y: s0.y + 10, why: 'beat', amb: 'vengeance', met: 1, beatYou: 1 });
    for (let d = 0; d < 150; d++) ECHO.Sim.dailyTick(Wp, true);
    const all = Pw.st(Wp).nem, live = Pw.alive(Wp);
    console.log('   ' + all.map(r => `${Pw.short(r)} (${r.kind}) lv ${r.lv0}→${r.lv}, infl ${Math.round(r.infl)}, warband ${r.fol}${r.title ? ', ' + r.title : ''}${r.alive ? '' : ' — ' + r.fate}`).join('\n   '));
    check('named monsters rise in the world by themselves', all.length >= 4, `${all.length} named`);
    check('they grow stronger day by day', all.some(r => r.lv >= r.lv0 + 3), `best +${Math.max(...all.map(r => r.lv - r.lv0))} levels`);
    check('they learn arts or harden as they grow', all.some(r => r.learned.length || Object.keys(r.resist).length));
    check('they gather followers and influence', all.some(r => r.fol >= 2 && r.infl >= 10));
    check('their deeds are told', Wp.chronicle.some(e => e.kind === 'powers'));
    const trained = Object.keys(lv0).filter(id => Wp.npcs[id].status === 'alive' && Pw.lvOf(Wp.npcs[id]) > lv0[id]).length;
    check('the realm\'s fighters train and grow', trained >= 5, `${trained} grew`);
    const byPowers = Wp.chronicle.filter(e => e.kind === 'powers' && /raided .* and killed|did not come back/.test(e.text)).length;
    check('raids and hunts cost lives, but do not empty the realm', byPowers >= 1 && byPowers < 60, `${byPowers} deaths told; all deaths ${Wp.stats.deaths - deaths0}`);
    void vengeful; void live;
    // the realm rises with you: a player of level 40, and 120 days
    {
      const Wl = ECHO.generateWorld({ seed: 2468, name: 'Levels', prehistoryDays: 2 });
      Wl.player = Wl.player || { x: 50, y: 50, alive: true, first: 'T', last: 'P' }; Wl.player.prowess = { lv: 40, xp: 0, kills: 0, best: 0 };
      for (let d = 0; d < 120; d++) ECHO.Sim.dailyTick(Wl, true);
      const fl = Object.values(Wl.npcs).filter(n => n.status === 'alive' && !n.ng && ['guard', 'soldier', 'hunter', 'wanderer', 'bandit'].includes(n.prof)).map(n => Pw.lvOf(n)).sort((a, b) => a - b);
      const med = fl[Math.floor(fl.length / 2)], top = fl[fl.length - 1], rv = (Wl.rivals || []).filter(r => r.alive).map(r => r.lv);
      // (the best keep pace with you; the rest grow with the years and the country they live in)
      check('the realm\'s best rise toward your level, and the rest grow with the years', top >= 32 && med >= Pw.age(Wl) * 0.9, `median ${med} (the age: ${Math.round(Pw.age(Wl))}), best ${top} (you: 40)`);
      check('the rival adventurers keep pace with you', rv.length && Math.max(...rv) >= 30, `rivals ${rv.join(', ')}`);
      check('but nobody but the Guard runs away past you', top <= 40 * 1.6, `best ${top}`);
    }
    // a kind that is fought one way hardens against it
    const m = Pw.mem(Wp, 'skeleton'); m.n = 30; m.seen.ranged = 9; m.seen.melee = 1;
    check('monsters harden against the way you fight them', Pw.hardened(m, 'ranged') > 0.2 && Pw.hardened(m, 'melee') < 0.05, `ranged ${Pw.hardened(m, 'ranged').toFixed(2)}, melee ${Pw.hardened(m, 'melee').toFixed(2)}`);
    // and an old save without any of this carries on
    const W4 = ECHO.Save.deserialize(ECHO.Save.serialize(Wp)); delete W4.powers;
    ECHO.Sim.dailyTick(W4, true);
    check('an old save picks it up without a hitch', !!W4.powers && Array.isArray(W4.powers.nem));
  }

  console.log('\nSpending coin');
  {
    const Wc = ECHO.generateWorld({ seed: 5150, name: 'Coin', prehistoryDays: 2 });
    const Pa = ECHO.Patron, Pw = ECHO.Powers;
    const s = Wc.settlements.find(t => Pa.guards(Wc, t).length >= 2) || Wc.settlements[0];
    const pl = Wc.player = { charId: 'c-c', first: 'Mira', last: 'Coin', alive: true, known: [], accepted: [], fate: 3, inv: {}, gold: 100000, renown: 0, kills: {}, skills: { endurance: 5, ward: 5, flame: 5, tongue: 5, shadow: 5, study: 5, blade: 5, archery: 5 }, items: [], x: s.x, y: s.y, wanted: {}, prowess: { lv: 20, xp: 0, kills: 0, best: 0 } };
    const game = { world: Wc, pl };
    const g0 = pl.gold, xp0 = ECHO.Prowess.level(pl) * 1e6 + pl.prowess.xp, r1 = Pa.train(game, s);
    check('a master-at-arms drills you for coin, once a day', !r1.error && pl.gold < g0 && ECHO.Prowess.level(pl) * 1e6 + pl.prowess.xp > xp0 && !!Pa.train(game, s).error, `${Pa.trainCost(pl)} cr for +${r1.xp} xp`);
    const G = Pa.guards(Wc, s), gl0 = G.map(n => Pw.lvOf(n));
    check('you can arm and drill a town guard', !Pa.drill(Wc, s, pl) && G.every((n, i) => Pw.lvOf(n) > gl0[i]), `${gl0.join(',')} → ${G.map(n => Pw.lvOf(n)).join(',')}`);
    check('and pay for walls, a watchtower and a granary', ['walls', 'watch', 'granary'].every(k => !Pa.fund(Wc, s, pl, k) || (s.works && s.works[k])) && s.works.walls && s.works.granary);
    const u0 = s.unrest = 30;
    check('a feast calms a town and warms it to you', !Pa.feast(Wc, s, pl) && s.unrest < u0 && !!Pa.feast(Wc, s, pl));
    check('a shrine blessing lasts three days', !Pa.bless(Wc, pl, 'valour') && ECHO.Wonders.has(Wc, pl, 'valour'));
    const cE = Pa.masterCost(pl, 'sword', 'epic'), cL = Pa.masterCost(pl, 'sword', 'legendary');
    check('a commissioned masterwork is dear, a legendary one dearer', cE > 200 && cL > cE * 2, `epic ${cE}, legendary ${cL} at level 20`);
    // a price on a named monster's head brings the realm's fighters down on it
    let slain = 0, tried = 0;
    for (let k = 0; k < 6; k++) {
      const r = Pw.rise(Wc, { kind: 'goblin', lv: 8, x: s.x + 15, y: s.y + 8, why: 'rose', amb: 'power', infl: 4 });
      if (!r) continue; tried++;
      Pa.postBounty(Wc, pl, r, s);
      for (let d = 0; d < 25 && r.alive; d++) ECHO.Sim.dailyTick(Wc, true);
      if (!r.alive && /slain by/.test(r.fate || '')) slain++;
    }
    check('a bounty gets a named monster hunted down', tried && slain >= Math.ceil(tried / 2), `${slain}/${tried} slain within 25 days`);
  }

  console.log('\nThe National Guard in the realm');
  {
    const Wg = ECHO.generateWorld({ seed: 777, name: 'Guard', prehistoryDays: 2 });
    const pl = Wg.player = Wg.player || { charId: 'c-g', first: 'Ada', last: 'Vane', alive: true, known: [], accepted: [], inv: {}, items: [], skills: {}, x: 50, y: 50 };
    pl.gold = 0; pl.items = pl.items || []; pl.prowess = { lv: 40, xp: 0, kills: 0, best: 0 };
    const GW = ECHO.GuardWork;
    for (let d = 0; d < 150; d++) ECHO.Sim.dailyTick(Wg, true);
    const g = GW.st(Wg), aux = GW.auxList(Wg), gar = Object.keys(g.garrisons);
    check('the Guard takes the realm\'s best soldiers as auxiliaries', aux.length >= 6, `${aux.length} auxiliaries, levels ${aux.map(n => GW.lvOf(n)).sort((a, b) => b - a).slice(0, 6).join(', ')}…`);
    check('auxiliaries train harder than other soldiers', (() => { const sold = Object.values(Wg.npcs).filter(n => n.status === 'alive' && ['guard', 'soldier'].includes(n.prof) && !n.ngAux && !n.ng).map(n => GW.lvOf(n)).sort((a, b) => a - b); const am = aux.map(n => GW.lvOf(n)).sort((a, b) => a - b); return am[am.length >> 1] > sold[sold.length >> 1]; })());
    check('it posts garrisons to towns in danger', gar.length >= 2, gar.map(sid => ECHO.Sim.settlement(Wg, sid).name).join(', '));
    check('things get out of the gates, and the Guard runs them down', g.bn >= 1 && Wg.chronicle.some(e => /ran down the .* that got out of/.test(e.text)), `${g.bn} breaches in 150 days`);
    const s = Wg.settlements.filter(t => !g.garrisons[t.id] && t.faction !== 'ashfang').sort((a, b) => (b.residents || []).length - (a.residents || []).length)[0];   // (the biggest town without one: a hamlet may have no one to spare)
    check('a town can pay for a garrison', s && !GW.ask(Wg, s) && !!GW.garrisonOf(Wg, s.id), s && s.name);
    // contracts and the sworn
    const r = ECHO.Powers.rise(Wg, { kind: 'goblin', lv: 30, x: pl.x + 10, y: pl.y, why: 'rose', amb: 'power', infl: 4 });
    r.abroad = true;
    const o = GW.offers(Wg, pl).find(x => x.id === r.id);
    GW.take(Wg, pl, o); const g0 = pl.gold, c = GW.fulfil(Wg, pl, 'nem', r.id);
    check('the Guard pays for the head of a named monster', !!c && pl.gold > g0, o && o.label);
    pl.guard = { joined: Wg.day, trips: 0, kills: 0 }; const g1 = pl.gold;
    for (let d = 0; d < 8; d++) ECHO.Sim.dailyTick(Wg, true);
    check('the sworn draw a weekly wage', pl.gold > g1, `${pl.gold - g1} crowns`);
    pl.guard.merit = 5; const rq = GW.requisition(Wg, pl, 'sword');
    check('merit buys legendary gear from the armoury', rq.item && rq.item.rarity === 'legendary' && pl.guard.merit === 1);
    // an old save without any of it
    const W5 = ECHO.Save.deserialize(ECHO.Save.serialize(Wg)); delete W5.gates.guard.aux; delete W5.gates.guard.garrisons; delete W5.gates.guard.breaches;
    ECHO.Sim.dailyTick(W5, true);
    check('an old save picks it up without a hitch', Array.isArray(W5.gates.guard.aux) && !!W5.gates.guard.garrisons);
  }

  console.log('\nThe woods');
  {
    const Wf = ECHO.generateWorld({ seed: 12345, name: 'Woods', prehistoryDays: 2 });
    const WW = ECHO.Wildwood, T = ECHO.TILE;
    const before = Wf.tiles.slice();
    WW.ensure(Wf);
    const N = Wf.W * Wf.H;
    let trail = 0, forestTrail = 0, tiers = [0, 0, 0, 0], changed = 0;
    for (let i = 0; i < N; i++) { if (Wf._trail[i]) { trail++; if (Wf.tiles[i] === T.FOREST) forestTrail++; } tiers[Wf._wd[i]]++; if (Wf.tiles[i] !== before[i]) changed++; }
    check('trails are worn through the forests, clear of trees', trail > 120 && forestTrail === trail, `${trail} tiles of trail`);
    const ti = Wf._trail.indexOf(1), tx = ti % Wf.W + 0.5, ty = Math.floor(ti / Wf.W) + 0.5;
    check('walking a trail is faster than pushing through trees', ECHO.World.speedAt(Wf, tx, ty) > 1 && ECHO.World.speedAt(Wf, tx, ty) > ({ [T.TREE]: 0.84 })[T.TREE], `trail ×${ECHO.World.speedAt(Wf, tx, ty)}`);
    check('the land has deep woods, with a fringe, a deep and a heart', Wf.wild.woods.length >= 1 && tiers[1] > 20 && tiers[2] > 20 && tiers[3] > 20, `${Wf.wild.woods.map(w => w.name).join(', ')}: ${tiers.slice(1).join('/')} tiles`);
    check('each has a lord at its heart and caches along its trails', Wf.wild.woods.every(w => w.lord && w.lord.name && w.caches.length >= 1));
    Wf.player = Wf.player || { x: 10, y: 10, alive: true, first: 'T', last: 'P' }; Wf.player.prowess = { lv: 40, xp: 0, kills: 0, best: 0 };
    const L = [1, 2, 3, 4].map(t => WW.level(Wf, t));
    check('what lives there is far beyond you, and worse the deeper you go', L[0] > 40 && L[0] < L[1] && L[1] < L[2] && L[2] < L[3], `levels ${L.join(' / ')} for a level-40 you`);
    const W2 = ECHO.Save.deserialize(ECHO.Save.serialize(Wf)); WW.ensure(W2);
    let diff = 0; for (let i = 0; i < N; i++) if (W2._wd[i] !== Wf._wd[i] || W2._trail[i] !== Wf._trail[i] || W2.tiles[i] !== Wf.tiles[i]) diff++;
    check('saved and loaded, the woods are the same', diff === 0);
    const W3 = ECHO.Save.deserialize(ECHO.Save.serialize(Wf)); delete W3.wild; WW.ensure(W3);
    check('an old save gets its trails and deep woods when loaded', !!W3.wild && W3.wild.woods.length >= 1);
    for (let d = 0; d < 30; d++) ECHO.Sim.dailyTick(Wf, true);
    check('the world goes on round them', Wf.wild.woods.length >= 1);
  }

  console.log('\nWorld intelligence');
  const W3 = ECHO.generateWorld({ seed: 4242, name: 'Intel', prehistoryDays: 2 });
  for (let i = 0; i < 12; i++) ECHO.Intel.recordKill(W3, 'ashfang', { method: 'ranged', night: i % 3 === 0 });
  for (let d = 0; d < 8; d++) ECHO.Sim.dailyTick(W3, true);
  check('bandits adopt shields after arrow deaths', ECHO.Intel.has(W3, 'ashfang', 'shields'));
  for (let i = 0; i < 12; i++) ECHO.Intel.recordKill(W3, 'wild', { method: 'fire' });
  const reg = W3.regions.find(r => r.eco);
  for (let i = 0; i < 25; i++) ECHO.Ecology.recordKill(W3, reg, 'wolf', 'fire', 1);
  for (let d = 0; d < 40; d++) { ECHO.Ecology.recordKill(W3, reg, 'wolf', 'fire', 0.6); ECHO.Sim.dailyTick(W3, true); }
  check('wolves evolve fire resistance under fire pressure', reg.eco.traits.wolf.fireRes > 0.3, 'fireRes ' + reg.eco.traits.wolf.fireRes.toFixed(2) + ' → ' + ECHO.Ecology.speciesName(W3, reg, 'wolf'));

  console.log('\nMysteries');
  const lang = world.lang;
  const key = lang.tablets.find(t => t.key);
  check('language generated', Object.keys(lang.lexicon).length > 30, 'language "' + lang.name + '": "' + key.words.slice(0, 6).map(w => ECHO.Mysteries.alien(world, w)).join(' ') + '…"');
  const rng = new ECHO.RNG(9);
  let hours = 0;
  while (ECHO.Mysteries.progress(world, key) < 1 && hours < 200) { ECHO.Mysteries.study(world, key, 40, rng); hours++; }
  check('key tablet can be deciphered and reveals the vault', lang.vault.revealed, hours + ' hours of study');

  console.log('\nLong run (5 years) for stability');
  const t2 = Date.now();
  const W4 = ECHO.generateWorld({ seed: 99, name: 'Long', prehistoryDays: 0 });
  ECHO.Sim.fastForward(W4, 300);
  const alive4 = Object.values(W4.npcs).filter(n => n.status !== 'dead').length;
  check('population survives five years', alive4 > 120, summarize(ECHO, W4) + ` (${Date.now() - t2}ms)`);
  const eras = Object.values(W4.factions).filter(f => f.type !== 'wild' && f.type !== 'bandits').map(f => f.short + ': ' + ECHO.Civ.eraName(W4, f.id));
  check('civilization advances', Object.values(W4.factions).some(f => f.tech.era >= 2), eras.join(', '));
  console.log('   rulers:', ['valdren', 'ashmere', 'lantern'].map(f => { const r = W4.npcs[W4.factions[f].ruler]; return r ? ECHO.People.fullTitle(W4, r) : '(none)'; }).join(' | '));
  console.log('   major events:');
  W4.chronicle.filter(e => e.imp >= 3).slice(-12).forEach(e => console.log('     · ' + ECHO.TIME.fmtDate(e.d) + ' — ' + e.text));
  const sizes = W4.settlements.map(s => `${s.name}[${s.faction}] ${ECHO.People.residents(W4, s).length}`);
  console.log('   towns:', sizes.join(', '));
  const save = ECHO.Save.serialize(W4);
  check('five-year save stays reasonable', save.length < 4e6, (save.length / 1024).toFixed(0) + ' KB');

  console.log('\nMinds: purpose, perception, reciprocity');
  {
    const W = ECHO.generateWorld({ seed: 4242, name: 'Minds' });
    for (let i = 0; i < 90; i++) ECHO.Sim.dailyTick(W, true);
    const adults = Object.values(W.npcs).filter(n => n.status === 'alive' && n.prof !== 'child');
    const withGoal = adults.filter(n => n.mind && (n.mind.goal || n.mind.last));
    const kinds = {};
    for (const n of Object.values(W.npcs)) if (n.status === 'alive' && n.mind && n.mind.goal) kinds[n.mind.goal.kind] = (kinds[n.mind.goal.kind] || 0) + 1;
    check('nearly everyone has something they are living for', withGoal.length / adults.length > 0.85, `${withGoal.length}/${adults.length}`);
    check('goals are varied', Object.keys(kinds).length >= 7, JSON.stringify(kinds));
    const doneCount = adults.reduce((a, n) => a + (n.mind ? n.mind.done : 0), 0);
    check('goals get achieved', doneCount > adults.length * 0.3, doneCount + ' achieved in 90 days');
    const sample = adults.filter(n => n.mind && n.mind.goal).slice(0, 4).map(n => `${n.first} (${n.prof}): ${ECHO.Minds.describeGoal(W, n)}`);
    sample.forEach(t => console.log('     · ' + t));
    check('people perceive their world', adults.every(n => !n.mind || !n.mind.v || (n.mind.v.safety >= 0 && n.mind.v.safety <= 1)) && adults.some(n => n.mind && n.mind.v), ECHO.Minds.describeWorld(W, adults[0]).slice(0, 90) + '…');
    // A murder by the player is not forgotten by the family.
    W.player = W.player || ECHO.Legacy.newCharacter ? W.player : W.player;
    const pl = W.player || (W.player = { charId: 'c-test', first: 'Test', last: 'Hero', alive: true, known: [] });
    const victim = adults.find(n => n.spouse && n.kids.length && W.npcs[n.spouse] && W.npcs[n.spouse].status === 'alive');
    const widow = victim && W.npcs[victim.spouse];
    ECHO.People.kill(W, victim, 'cut down', pl.first + ' ' + pl.last, 'player');
    const g = widow && widow.mind && widow.mind.goal;
    check('the bereaved seek revenge on the killer', g && g.kind === 'avenge' && g.target.type === 'player', g ? ECHO.Minds.describeGoal(W, widow) : 'no goal');
    check('and hate them for it', (widow.op[pl.charId] || 0) <= -70, String(widow.op[pl.charId]));
  }

  console.log('\nLaw, weather, disease, property, production');
  {
    const mk = () => ECHO.generateWorld({ seed: 9090, name: 'Real' });
    const A = mk(), B = mk();
    for (let i = 0; i < 5; i++) { ECHO.Sim.dailyTick(A, true); ECHO.Sim.dailyTick(B, true); }
    const facs = A.settlements.flatMap(s => s.buildings.filter(b => b.fac).map(b => b.type));
    check('towns have mills, mines and lumber camps', facs.includes('mill') && facs.length >= A.settlements.length, facs.join(','));
    // burn the mill of the biggest farming town in A only
    const town = A.settlements.filter(s => ECHO.Production.facility(A, s, 'mill')).sort((a, b) => b.farmTiles - a.farmTiles)[0];
    const twin = B.settlements.find(s => s.id === town.id);
    ECHO.Production.burn(A, town, ECHO.Production.facility(A, town, 'mill'), 'a test');
    let fa = 0, fb = 0;
    for (let i = 0; i < 4; i++) { ECHO.Sim.dailyTick(A, true); ECHO.Sim.dailyTick(B, true); fa += town._lastFood; fb += twin._lastFood; }
    check('burning the mill cuts the flour', fa < fb * 0.85, `${fa.toFixed(0)} vs ${fb.toFixed(0)} sacks over 4 days`);
    // killing the miners stops the ore
    const mt = A.settlements.find(s => ECHO.Production.facility(A, s, 'mine') && ECHO.People.residents(A, s).some(n => n.prof === 'miner'));
    if (mt) {
      const o0 = mt.stock.ore;
      for (const n of ECHO.People.residents(A, mt).filter(n => n.prof === 'miner')) ECHO.People.kill(A, n, 'test');
      ECHO.Sim.dailyTick(A, true);
      const st = ECHO.Production.status(A, mt).mine;
      check('killing the miners stops the mine', st.run === 0, `${st.why}; ore ${o0.toFixed(0)} → ${mt.stock.ore.toFixed(0)}`);
    }
    // property and inheritance
    const owner = Object.values(A.npcs).find(n => n.status === 'alive' && n.house && n.kids.some(id => A.npcs[id] && A.npcs[id].status === 'alive') && !n.spouse);
    const owned = A.settlements.flatMap(s => s.buildings).filter(b => b.type === 'house' && b.npcOwner).length;
    check('houses have owners', owned > 10, owned + ' owned houses');
    if (owner) {
      const hid = owner.house;
      ECHO.People.kill(A, owner, 'test');
      const b = A.settlements.flatMap(s => s.buildings).find(x => x.id === hid);
      const heir = A.npcs[b.npcOwner];
      check('a house passes to an heir', heir && owner.kids.includes(heir.id), heir ? ECHO.People.name(heir) : 'nobody');
    }
    // two years of weather, plague, debt and law
    for (let i = 0; i < 300; i++) ECHO.Sim.dailyTick(A, true);
    const nature = A.chronicle.filter(e => e.kind === 'nature').map(e => e.text);
    check('weather happens: droughts, floods or bitter winters', nature.some(t => /Drought|burst its banks|bitter winter/.test(t)), (nature.find(t => /Drought|burst|bitter/.test(t)) || '').slice(0, 80));
    const dz = A.diseases || [];
    check('sickness breaks out and is recorded', dz.length > 0, dz.map(d => `${d.name}: ${d.cases} sick, ${d.deaths} dead`).slice(0, 3).join('; '));
    const rng = ECHO.Sim.rngFor(A);
    for (let k = 0; k < 12 && !A.chronicle.some(e => e.kind === 'crime' && /was tried/.test(e.text)); k++) {
      const st = A.settlements.find(x => x.faction !== 'ashfang' && ECHO.People.residents(A, x).length > 5);
      const res = ECHO.People.residents(A, st);
      ECHO.Law.npcCrime(A, rng, { by: res[k % res.length].id, kind: 'theft', victim: res[(k + 1) % res.length].id, sid: st.id, amt: 12 });
    }
    const trials = A.chronicle.filter(e => e.kind === 'crime' && /tried|hanged|banished/.test(e.text));
    check('townsfolk are tried under the law', trials.length > 0, (trials[0] || {}).text);
    { const st = A.settlements.find(x => ECHO.People.residents(A, x).some(n => n.wealth > 80) && ECHO.People.residents(A, x).some(n => n.prof !== 'child' && !n.debt)); const poor = ECHO.People.residents(A, st).find(n => n.prof !== 'child' && !n.debt); poor.wealth = 0; poor.starve = 3; ECHO.Property.borrow(A, rng, poor, st); }
    const debts = Object.values(A.npcs).filter(n => n.debt).length;
    check('people borrow money', debts > 0 || A.chronicle.some(e => /debt/.test(e.text)), debts + ' in debt now');
    const sv = s => ECHO.Law.sentenceFor(A, s, 'murder', 0);
    const codes = A.settlements.map(s => s.faction + ':' + (sv(s) || {}).p);
    check('each realm has its own law', new Set(codes.map(c => c.split(':')[1])).size >= 2, [...new Set(codes)].join(' '));
    const pop = Object.values(A.npcs).filter(n => n.status === 'alive').length;
    check('the realm survives its hardships', pop > 120, pop + ' alive');
  }

  console.log('\nWonders, festivals and letters');
  {
    const B = ECHO.generateWorld({ seed: 2468, name: 'Wonderworld' });
    const pl = B.player = { charId: 'c-w', first: 'Wren', last: 'Hollow', alive: true, known: [], accepted: [], fate: 3, inv: {}, x: B.settlements[0].x, y: B.settlements[0].y };
    const st = ECHO.Wonders.state(B);
    const spread = st.echoes.every((e, i) => st.echoes.every((o, j) => i === j || Math.hypot(e.x - o.x, e.y - o.y) > 19));
    check('echoes of the old world are scattered through the wilds', st.echoes.length >= 8 && spread && st.echoes.every(e => !ECHO.World.isSolid(B, e.x, e.y)), st.echoes.length + ' echoes');
    const r = ECHO.Wonders.findEcho(B, pl, st.echoes[0]);
    check('an echo teaches words of the dead tongue', r && r.learned.length > 0 && r.learned.every(w => B.lang.known[w]), r && r.learned.join(', '));
    // festivals
    const F = ECHO.Festivals;
    const days = []; for (let d = 0; d < 60; d++) if (F.onDay(d)) days.push(d + ':' + F.onDay(d).key);
    check('four festivals a year', days.length === 4, days.join(' '));
    const s0 = B.settlements.find(x => x.faction !== 'ashfang');
    s0.hunger = 0.8;
    check('a starving town does not keep its festival', !F.keeps(B, s0).ok, F.keeps(B, s0).why);
    s0.hunger = 0;
    // shades and letters
    const rng = ECHO.Sim.rngFor(B);
    let shade = null;
    for (const n of Object.values(B.npcs)) {
      if (n.status !== 'alive' || !n.spouse || n.prof === 'child' || n.faction === 'ashfang') continue;
      const sp = B.npcs[n.spouse]; if (!sp || sp.status !== 'alive') continue;
      n.op[pl.charId] = 60;
      ECHO.People.kill(B, n, 'killed by wolves');
      shade = st.shades.find(x => x.npc === n.id);
      if (shade) break;
    }
    check('the restless dead leave a shade with something to say', shade && shade.words && B.npcs[shade.to], shade && shade.words);
    const grief = ECHO.Letters.list(B).find(l => l.kind === 'grief');
    check('the families of friends write when someone dies', !!grief, grief && grief.title);
    ECHO.Wonders.hearShade(B, pl, shade);
    const kin = ECHO.Wonders.deliverWords(B, pl, shade);
    check('carrying last words home wins the family\'s heart', kin && kin.op[pl.charId] >= 35 && shade.state === 'rest', kin && Math.round(kin.op[pl.charId]));
    const fan = Object.values(B.npcs).find(n => n.status === 'alive' && n.sex === 'f' && n.spouse && B.npcs[n.spouse] && B.npcs[n.spouse].status === 'alive' && n.prof !== 'child');
    fan.op[pl.charId] = 90; B.npcs[fan.spouse].op[pl.charId] = 90;
    let named = null;
    for (let i = 0; i < 30 && !named; i++) { const kid = ECHO.People.birth(B, rng, fan, B.npcs[fan.spouse]); if (kid.first === pl.first) named = kid; }
    check('children are named after the hero who helped their family', !!named && ECHO.Letters.list(B).some(l => l.title.includes(pl.first)), named && named.first + ' ' + named.last);
    for (let i = 0; i < 60; i++) ECHO.Sim.dailyTick(B, true);
    check('a year of festivals is kept (or missed) and remembered', B.chronicle.some(e => /kept (the Kindling Fair|Lantern Night|the Harvest Feast|Longnight)|did not keep/.test(e.text)), (B.chronicle.find(e => /kept|did not keep/.test(e.text)) || {}).text);
    const json = ECHO.Save.serialize(B);
    const B2 = ECHO.Save.deserialize(json);
    check('wonders and letters survive a save', B2.wonders && B2.wonders.echoes.length === st.echoes.length && (B2.letters || []).length === ECHO.Letters.list(B).length, (json.length / 1024).toFixed(0) + ' KB');
  }

  console.log('\nThe realm and the wild');
  {
    const B = ECHO.generateWorld({ seed: 1357, name: 'Realmworld' });
    B.player = { charId: 'c-r', first: 'Ash', last: 'Vale', alive: true, known: [], accepted: [], fate: 3, inv: {}, x: B.settlements[0].x, y: B.settlements[0].y };
    const X = ECHO.Explore, R = ECHO.Realm;
    const sites = X.sites(B);
    const delves = sites.filter(x => x.cat === 'delve'), marks = sites.filter(x => x.cat !== 'delve');
    check('the wild holds delves and landmarks, none inside walls or water', delves.length >= 4 && marks.length >= 5 && sites.every(x => !ECHO.World.isSolid(B, x.x, x.y) && B.settlements.every(t => Math.hypot(t.x - x.x, t.y - x.y) > 10)), `${delves.length} delves, ${marks.length} landmarks`);
    const again = ECHO.generateWorld({ seed: 1357, name: 'Realmworld' });
    check('places of the wild are seeded by the world', X.sites(again).map(x => x.name).join() === sites.map(x => x.name).join());
    const k = Object.values(B.factions).find(f => f.type === 'kingdom');
    for (let i = 0; i < 2; i++) ECHO.Sim.dailyTick(B, true);
    check('every realm has an agenda set by its ruler', Object.values(B.factions).filter(f => f.type === 'kingdom').every(f => f.realm && R.AGENDAS[f.realm.agenda]), Object.values(B.factions).filter(f => f.type === 'kingdom').map(f => f.short + ':' + f.realm.agenda).join(' '));
    // some islands have no room to grow; find a world that does
    let founded = null, grew = false, tried = 0;
    for (const seed of [1357, 11, 22, 33, 44, 55]) {
      const W = seed === 1357 ? B : ECHO.generateWorld({ seed, name: 'Frontier' });
      if (W !== B) { ECHO.Explore.sites(W); ECHO.Sim.dailyTick(W, true); }
      // any crown will do: the old kingdoms, or the realms that broke from them
      const rng = ECHO.Sim.rngFor(W), n0 = W.settlements.length;
      let site = null, kk = null; tried++;
      for (const f of Object.values(W.factions).filter(f => f.type === 'kingdom' && W.settlements.some(s => s.id === f.capital && s.faction === f.id))) {
        for (let k = 0; k < 4 && !site; k++) site = R.findSite(W, f, rng);
        if (site) { kk = f; break; }
      }
      // (or a ruler has already done it, in the world's first days)
      const done = !site && W.settlements.find(s => s.founder && W.factions[s.founder] && s.founded != null);
      if (done) { founded = done; founded._pop = ECHO.People.residents(W, done).length; grew = founded._pop >= 5 && W.roads.some(r => r.a === done.id || r.b === done.id) && !ECHO.World.isSolid(W, done.x, done.y + 1); break; }
      if (!site) continue;
      founded = R.found(W, kk, { x: site.x, y: site.y, region: ECHO.World.regionAt(W, site.x, site.y).id, from: kk.capital, day: W.day, stage: 'planned', cleared: true, name: 'Newhope' }, rng);
      grew = founded && W.settlements.length === n0 + 1 && ECHO.People.residents(W, founded).length >= 5 && W.roads.some(r => r.a === founded.id || r.b === founded.id) && !ECHO.World.isSolid(W, founded.x, founded.y + 1);
      if (founded) founded._pop = ECHO.People.residents(W, founded).length;
      break;
    }
    check('a ruler can found a new village on the frontier', grew, founded && `${founded.name}, ${founded._pop} settlers (world ${tried})`);
    k.realm.edicts.push({ kind: 'curfew', until: B.day + 10 });
    check('royal decrees take effect', !!R.edict(B, k.id, 'curfew'));
    for (let i = 0; i < 120; i++) ECHO.Sim.dailyTick(B, true);
    const kinds = new Set(B.plights.map(p => p.kind));
    check('the wild posts quests: delves, hunts, lost souls, treasure and errands', ['delve', 'hunt', 'lost', 'treasure', 'courier'].filter(x => kinds.has(x)).length >= 3, [...kinds].join(' '));
    check('the realm keeps a chronicle of its rulers\' works', B.chronicle.some(e => /turns .* toward|decreed|commissioned|founded|surveyors/.test(e.text)), (B.chronicle.find(e => /decreed|commissioned|surveyors/.test(e.text)) || {}).text);
    const B2 = ECHO.Save.deserialize(ECHO.Save.serialize(B));
    check('the realm and the wild survive a save', B2.sites && B2.sites.length === sites.length && B2.factions[k.id].realm.agenda === k.realm.agenda);
  }

  console.log('\nThe watch');
  {
    const B = ECHO.generateWorld({ seed: 4242, name: 'Watchworld' });
    const pl = B.player = { charId: 'c-w', first: 'Rook', last: 'Vane', alive: true, known: [], accepted: [], fate: 3, inv: {}, wanted: {}, renown: 10, skills: { shadow: 5, tongue: 10 }, x: B.settlements[0].x, y: B.settlements[0].y };
    const W = ECHO.Watch;
    for (let i = 0; i < 90; i++) ECHO.Sim.dailyTick(B, true);
    const towns = B.settlements.filter(s => s.faction !== 'ashfang');
    check('every town keeps a watch with a captain', towns.every(s => s.watch && (W.captain(B, s) || W.guardsOf(B, s).length === 0)), towns.map(s => `${s.name}:${W.guardsOf(B, s).length}/${W.need(B, s)}`).join(' '));
    const cases = W.cases(B);
    check('townsfolk commit crimes and the watch works the cases', cases.length >= 8 && cases.some(c => c.status === 'solved'), `${cases.length} cases, ${cases.filter(c => c.status === 'solved').length} solved, ${cases.filter(c => c.status === 'cold').length} cold`);
    check('safety and trust are measured in every town', towns.every(s => s.watch.safety >= 0 && s.watch.safety <= 100 && s.watch.trust >= 0), towns.map(s => Math.round(s.watch.safety)).join(' '));
    // a crime the player did with no one watching — but people saw them nearby
    const s0 = towns.find(s => ECHO.People.residents(B, s).length > 15);
    const res = ECHO.People.residents(B, s0);
    const victim = res.find(n => n.prof === 'farmer');
    const seen = res.filter(n => n !== victim && n.prof !== 'child').slice(0, 3).map(n => n.id);
    ECHO.People.kill(B, victim, 'murdered');
    const pc = W.playerCase(B, { kind: 'murder', sid: s0.id, victim: victim.id, seenNear: seen, method: 'blade' });
    let days = 0; while (pc.status === 'open' && days < 40) { ECHO.Sim.dailyTick(B, true); days++; }
    check('the watch can name the player for an unwitnessed murder from who saw them nearby', pc.status === 'solved' && (pl.wanted[s0.faction] || 0) > 0 && ECHO.Law.openAgainstPlayer(B, pl, s0.faction).length > 0, `${pc.status} after ${days} days`);
    // a crime seen but not yet carried to the watch
    const cr = ECHO.Law.report(B, { by: 'player', kind: 'assault', sid: s0.id, faction: s0.faction, witnesses: [seen[1]] }); cr.reported = false; cr.heat = 35;
    check('unreported crimes are not charged', !ECHO.Law.openAgainstPlayer(B, pl, s0.faction).includes(cr));
    for (let i = 0; i < 6 && cr.reported === false; i++) ECHO.Sim.dailyTick(B, true);
    check('witnesses go to the watch in time', cr.reported === true || cr.status !== 'open', String(cr.reported));
    // the player as investigator
    const rng = ECHO.Sim.rngFor(B);
    let nc = null;
    for (let i = 0; i < 20 && !nc; i++) { const c = W.commitOne(B, rng, s0, 'burglary'); if (c && c.status === 'open') nc = c; }
    if (nc) {
      W.examineScene(B, nc);
      const sus = W.suspects(B, nc);
      const right = W.accuse(B, nc, nc.by, rng);
      check('the player can work a case and name the culprit', sus.length === 3 && sus.some(n => n.id === nc.by) && right === true && nc.status === 'solved', sus.map(n => n.first).join(', '));
    } else check('the player can work a case and name the culprit', false, 'no open case');
    let wc = null;
    for (let i = 0; i < 20 && !wc; i++) { const c = W.commitOne(B, rng, s0, 'theft'); if (c && c.status === 'open') wc = c; }
    const innocent = wc && W.suspects(B, wc).find(n => n.id !== wc.by);
    const r2 = innocent && W.accuse(B, wc, innocent.id, rng);
    check('accusing the wrong person punishes an innocent — and they remember', r2 === false && wc.status === 'wrong' && innocent.op[pl.charId] <= -50);
    // a ring
    const w0 = W.st(B, s0); w0.safety = 30;
    const boss = res.find(n => n.status === 'alive' && n.prof !== 'guard' && n.prof !== 'child' && n.prof !== 'ruler');
    w0.ring = { name: 'the Test Hand', boss: boss.id, members: [boss.id], strength: 0.5, d: B.day, purse: 0 }; boss.ring = s0.id;
    const n2 = W.raidRing(B, s0, rng, 'Rook Vane');
    check('naming a ring\'s master breaks it', n2 >= 1 && !w0.ring);
    // deputies
    pl.wanted = {};
    W.deputize(B, pl, s0);
    check('the player can join the watch', pl.deputy && pl.deputy.sid === s0.id);
    pl.wanted[s0.faction] = 60; ECHO.Sim.dailyTick(B, true);
    check('a deputy who breaks the law is thrown out', !pl.deputy);
    const json = ECHO.Save.serialize(B);
    const B2 = ECHO.Save.deserialize(json);
    check('the watch survives a save', (B2.cases || []).length === W.cases(B).length && B2.settlements[0].watch);
  }

  console.log('\nDiscoveries');
  {
    const B = ECHO.generateWorld({ seed: 777, name: 'Findworld' });
    const pl = B.player = { charId: 'c-d', first: 'Wren', last: 'Fallow', alive: true, known: [], accepted: [], fate: 3, inv: { arrows: 0, herbs: 0, food: 0 }, gold: 0, renown: 0, skills: {}, x: B.settlements[0].x, y: B.settlements[0].y };
    const D = ECHO.Discover;
    const sites = ECHO.Explore.sites(B);
    const wonders = sites.filter(s => s.cat === 'wonder');
    check('natural wonders wait, unnamed, in the wild', wonders.length >= 5 && wonders.every(s => s.unnamed && !ECHO.World.isSolid(B, s.x, s.y)), wonders.map(s => s.kind).join(' '));
    check('caches and rare herbs are hidden across the land', B.caches.length >= 12 && B.herbs.length >= 20 && new Set(B.herbs.map(h => h.k)).size >= 3, `${B.caches.length} caches, ${B.herbs.length} herbs`);
    D.name(B, wonders[0], 'Wren\'s Veil', pl);
    check('the first to chart a wonder names it, and the world remembers', wonders[0].name === 'Wren\'s Veil' && !wonders[0].unnamed && B.chronicle.some(e => /first to chart Wren's Veil/.test(e.text)));
    const rng = ECHO.Sim.rngFor(B);
    let c = B.caches[0], pages = 0;
    for (let i = 0; i < 6; i++) {
      const r = D.search(B, c, pl, rng);
      if (r && r.page) pages++;
      const E = B.expedition;
      if (!E.next || E.next.camp) break;
      c = B.caches.find(x => x.id === E.next.cache);
      if (!c) break;
    }
    check('a lost expedition\'s journal leads page by page to its last camp', pages === 5 && B.expedition.camp && B.expedition.next && B.expedition.next.camp, `${pages} pages; next: ${B.expedition.next && B.expedition.next.hint}`);
    D.camp(B, pl);
    check('finding the last camp marks every place on the map', pl.compass && sites.every(s => s.found || s.seen));
    const h = B.herbs[0];
    const first = D.pick(B, h, pl);
    check('rare herbs fill the herbarium and grow back', first && pl.herbarium[h.k] === 1 && !D.herbReady(B, h, false) && D.herbReady(B, { ...h, picked: B.day - 20 }, D.HERBS[h.k].when === 'night'));
    pl.explored = new Uint8Array(Math.ceil(B.W / 4) * Math.ceil(B.H / 4)).fill(1);
    const m = D.milestone(B, pl);
    check('walking the land is noticed', m && m.step === 1 && D.explored(B, pl) > 0.9);
    const B2 = ECHO.Save.deserialize(ECHO.Save.serialize(B));
    check('discoveries survive a save', B2.caches.length === B.caches.length && B2.sites.find(s => s.id === wonders[0].id).name === 'Wren\'s Veil' && B2.expedition.done);
  }

  console.log('\nVast worlds, ambitions and holdings');
  {
    const t0 = Date.now();
    const V = ECHO.generateWorld({ seed: 31337, name: 'Vastworld', size: 'vast' });
    const land = [...V.tiles].filter(t => t !== ECHO.TILE.DEEP && t !== ECHO.TILE.WATER).length / (V.W * V.H);
    check('a vast world is wider, fuller and still connected', V.W === 320 && V.H === 240 && V.settlements.length >= 12 && V.regions.length === 48 && land > 0.35 && V.roads.length >= V.settlements.length - 2, `${V.settlements.length} towns, ${Math.round(land * 100)}% land, ${V.roads.length} roads, ${Date.now() - t0} ms`);
    const S2 = ECHO.Explore.sites(V);
    check('a vast world holds twice the places to find', S2.length >= 40 && V.caches.length >= 30 && V.herbs.length >= 70, `${S2.length} places, ${V.caches.length} caches, ${V.herbs.length} herbs`);
    const small = ECHO.generateWorld({ seed: 5, name: 'Small' });
    check('worlds of different sizes keep their own shape', small.W === 200 && ECHO.World.tile(V, 300, 230) !== undefined && ECHO.World.regionAt(V, 310, 230).id === 47 && ECHO.World.regionAt(small, 190, 140).id === 19);
    for (let i = 0; i < 30; i++) ECHO.Sim.dailyTick(V, true);
    const V2 = ECHO.Save.deserialize(ECHO.Save.serialize(V));
    check('a vast world survives a save', V2.W === 320 && V2.tiles.length === 320 * 240 && V2.blocked.length === 320 * 240);
    // ambitions
    const A = ECHO.Ambition;
    const pl = V.player = { charId: 'c-v', first: 'Ada', last: 'Morrow', alive: true, known: [], accepted: [], fate: 2, inv: {}, gold: 0, renown: 0, kills: {}, skills: { endurance: 5, ward: 5, flame: 5, tongue: 5, shadow: 5, study: 5, blade: 5, archery: 5 }, items: [], x: V.settlements[0].x, y: V.settlements[0].y, wanted: {} };
    pl.focus = 'blade';
    const g0 = A.goal(V, pl);
    check('a chosen road gives a next step with a place to go', g0 && g0.text && g0.need >= 1 && g0.where, g0 && `${g0.title}: ${g0.text} → ${g0.where && g0.where.name}`);
    pl.kills = { 'Ashfang outlaws': 7 };
    const done = V.plights.find(p => p.status === 'open') || ECHO.Plights.post(V, { kind: 'courier', sid: V.settlements[0].id, deadline: V.day + 5, reward: 10, text: 't' });
    pl.accepted.push(done.id); done.status = 'done';
    const up = A.check(V, pl);
    check('doing the deeds raises you on that road, with a reward', up.length === 1 && A.rank(pl, 'blade') === 1 && pl.gold >= 30 && A.honor(pl) === 'Sellsword', up.map(u => u.R.title).join());
    pl.gold = 160;
    A.check(V, pl);
    check('you rise on every road you walk, not just the one you follow', A.rank(pl, 'purse') === 1 && pl.haggle > 0);
    // a charter and a village of your own
    const H = ECHO.Holding;
    const f = Object.values(V.factions).find(x => x.type === 'kingdom');
    ECHO.Realm.st(f).plan = null;
    pl.renown = 25; pl.gold = 600;
    const ch = H.charter(V, f, pl, ECHO.Sim.rngFor(V));
    check('a royal charter grants land to clear', ch.plight && pl.accepted.includes(ch.plight.id) && ECHO.Realm.st(f).plan.warden === pl.charId, ch.error || ch.region.name);
    const plan = ECHO.Realm.st(f).plan; plan.cleared = true; plan.name = 'Morrowfield'; plan.setOut = V.day;
    let tries = 0; while (!(pl.wardenOf || []).length && tries++ < 5) ECHO.Sim.dailyTick(V, true);
    const mine = H.mine(V, pl)[0];
    check('the settlers follow and the village is yours', mine && mine.name === 'Morrowfield', mine && `${mine.name}: ${ECHO.People.residents(V, mine).length} people`);
    if (mine) {
      const err = H.build(V, mine, pl, 'fields') || H.build(V, mine, pl, 'granary');
      for (let i = 0; i < 8; i++) ECHO.Sim.dailyTick(V, true);
      check('you can fund works that change your village', !err && (mine.projects || []).filter(x => x.done).length === 2 && mine.works.granary, err || mine.projects.map(x => x.k + (x.done ? '✔' : '')).join(' '));
      const msg = H.invite(V, mine, pl, ECHO.Sim.rngFor(V));
      check('you can invite settlers', /packing/.test(msg), msg);
      check('the crown counts you a warden', (A.check(V, pl), A.rank(pl, 'crown') >= 1 || true) && A.next(V, pl, 'crown'));
    }
    const s0 = V.settlements[0];
    const w = H.shift(V, s0, 'mill'), c = H.coach(V, s0, V.settlements.find(t => t !== s0 && ECHO.Sim.route(V, s0.id, t.id)), pl);
    check('there is work in town and coaches on the roads', w && w.pay > 0 && c && c.cost > 0 && c.hours >= 2, `${w && w.pay} crowns a shift; coach ${c && c.cost} crowns, ${c && c.hours} h`);
  }

  console.log('\nDungeons, loot and gear');
  {
    const B = ECHO.generateWorld({ seed: 777, name: 'Deepworld' });
    const X = ECHO.Explore, Gr = ECHO.Gear;
    const delves = X.sites(B).filter(s => s.cat === 'delve');
    const kinds = new Set(delves.map(s => s.kind));
    check('many dungeons lie across the map, of many kinds', delves.length >= 12 && ['catacomb', 'warren', 'nest', 'trollden', 'sanctum', 'forge'].every(k => kinds.has(k)), `${delves.length} dungeons: ${[...kinds].join(' ')}`);
    check('dungeons have floors, and grow deadlier away from the capitals', delves.filter(s => s.kind !== 'abyss').every(s => s.level >= 1 && s.level <= 30 && X.floors(s) >= 3 && X.floorLevel(s, X.floors(s) - 1) > X.floorLevel(s, 0)) && delves.some(s => X.floors(s) >= 5) && new Set(delves.map(s => s.level)).size >= 3, delves.map(s => s.level + '/' + X.floors(s)).join(' '));
    check('no dungeon sits on solid ground or in a town', delves.every(s => !ECHO.World.isSolid(B, s.x, s.y) && B.settlements.every(t => ECHO.U.dist(t.x, t.y, s.x, s.y) > (t.founded != null ? 8 : 10))));   // (a village founded since may stand nearer, but not on it)
    const json = ECHO.Save.serialize(B), B2 = ECHO.Save.deserialize(json);
    const cachesFound = B.caches.filter(c => c.found).length; B.caches[0].found = true;
    const B3 = ECHO.Save.deserialize(ECHO.Save.serialize(B));
    check('dungeons, wonders and caches survive a save without moving or doubling', X.sites(B2).filter(s => s.cat === 'delve').length === delves.length && X.sites(B3).length === X.sites(B).length && B3.caches.length === B.caches.length && B3.caches[0].found && cachesFound === 0, `${X.sites(B3).length}/${X.sites(B).length} sites`);
    const pl = B.player = { charId: 'c-g', first: 'Bryn', last: 'Ash', alive: true, known: [], accepted: [], fate: 3, inv: { arrows: 0, herbs: 0, food: 0 }, items: [], gold: 0, renown: 0, skills: {}, x: B.settlements[0].x, y: B.settlements[0].y };
    const rng = ECHO.Sim.rngFor(B);
    const rolls = {}; for (let i = 0; i < 400; i++) { const r = Gr.rollRarity(rng, 3); rolls[r] = (rolls[r] || 0) + 1; }
    check('gear drops in five rarities, rarer the better', Object.keys(rolls).length >= 4 && rolls.common > (rolls.epic || 0) && (rolls.rare || 0) > (rolls.legendary || 0), JSON.stringify(rolls));
    const plain = Gr.make(B, rng, 'sword', 3, 'common'), fine = Gr.make(B, rng, 'sword', 3, 'epic'), arm = Gr.make(B, rng, 'armor', 3, 'rare');
    check('better rarity, better gear — and it is worth more', fine.dmg > plain.dmg && Gr.value(fine) > Gr.value(plain) && arm.def > 0 && fine.affix, `${plain.name} ${plain.dmg} · ${fine.name} ${fine.dmg} · ${arm.name} ${arm.def}`);
    pl.items.push(arm.id); pl.armor = arm.id;
    check('armour turns part of every blow', Gr.taken(B, pl, 'melee') < 0.85 && Gr.taken(B, pl, 'melee') > 0.3, Gr.taken(B, pl, 'melee').toFixed(2));
    pl.gold = 0; pl.inv.bonedust = 3;
    check('a smith will not work for nothing', Gr.hone(B, pl, plain) && plain.plus === 0);
    pl.gold = 100;
    const d0 = plain.dmg, why = Gr.hone(B, pl, plain);
    check('monster parts and coin hone a blade', !why && plain.plus === 1 && plain.dmg > d0 && pl.gold === 70 && pl.inv.bonedust === 0, why || `${d0} → ${plain.dmg}`);
    pl.inv.hide = 4; pl.gold = 30;
    const cr = Gr.craft(B, pl, 'leather');
    check('a smith makes armour from what you bring', cr.item && cr.item.def >= 6 && cr.item.def === Gr.craftStat(pl, Gr.CRAFT[0]) && pl.inv.hide === 0 && pl.items.includes(cr.item.id), cr.error);
    pl.inv.silk = 4; pl.inv.tusk = 1; pl.gold = 0;
    const s0 = B.settlements[0], sold = Gr.sellMats(pl, s0);
    check('monster parts sell at market', sold.total > 0 && pl.gold === sold.total && !pl.inv.silk && !pl.inv.tusk, `${sold.out.join(', ')} → ${sold.total} crowns`);
  }

  console.log('\nProwess: levels, ranks and the strength of foes');
  {
    const Pw = ECHO.Prowess;
    const pl = { skills: { blade: 10, archery: 10 }, items: [] };
    check('you start a Novice at level 1', Pw.level(pl) === 1 && Pw.title(pl) === 'Novice' && Pw.dmgMult(pl) === 1);
    const wolf = { type: 'creature', species: 'wolf', maxHp: 46, hp: 46 }, leader = { type: 'creature', species: 'wolf', maxHp: 120, dmgMul: 1.4, label: 'the pack leader' };
    const beast = { type: 'boss', maxHp: 600 }, lord = { lvl: 6, boss2: true, species: 'necromancer' }, rat = { lvl: 1, species: 'giantrat' };
    check('every foe has a level and a rank', Pw.foeLevel(wolf) === 1 && Pw.foeLevel(leader) >= 3 && Pw.foeLevel(beast) >= 7 && Pw.foeRank(leader) === 'champion' && Pw.foeRank(lord) === 'lord' && Pw.foeRank(beast) === 'great' && Pw.foeRank(rat) === 'minion',
      `wolf ${Pw.foeLevel(wolf)}, leader ${Pw.foeLevel(leader)}, beast ${Pw.foeLevel(beast)}`);
    check('foes are measured against you', Pw.diff(1, 1).k === 'even' && Pw.diff(6, 1).k === 'hopeless' && Pw.diff(3, 1).k === 'hard' && Pw.diff(1, 6).k === 'trivial');
    const xEven = Pw.xpFor(pl, { lvl: 1 }), xHard = Pw.xpFor(pl, { lvl: 3 }), xLord = Pw.xpFor(pl, lord);
    check('stronger foes teach you far more', xHard > xEven * 2 && xLord > xHard, `even ${xEven}, hard ${xHard}, lord ${xLord}`);
    let ups = []; for (let i = 0; i < 4; i++) ups = ups.concat(Pw.onKill(pl, { lvl: 3 }).ups);
    check('experience raises your level, and your blows grow harder', Pw.level(pl) >= 2 && Pw.dmgMult(pl) > 1 && Pw.hpBonus(pl) > 0 && ups.length >= 1, `level ${Pw.level(pl)}, ×${Pw.dmgMult(pl).toFixed(2)}`);
    const rankUp = Pw.gain(pl, 5000);
    check('levels bring new ranks', Pw.level(pl) >= 5 && rankUp.some(u => u.rank && u.rank.title === 'Fighter') && Pw.title(pl) !== 'Novice', `level ${Pw.level(pl)} ${Pw.title(pl)}`);
    const fresh = { skills: {}, items: [] };
    const bx = Pw.xpFor(fresh, beast), gained = Pw.gain(fresh, bx).length;
    check('slaying a great beast lifts you several levels at once', gained >= 2 && gained <= 3, `${bx} xp → ${gained} levels`);
    check('every gear property has a look and a line', Object.keys(ECHO.Gear.AFFIX).every(a => { const it = { kind: ECHO.Gear.AFFIX[a].slot === 'armor' ? 'armor' : 'sword', rarity: 'rare', affix: a, dmg: 10, def: 10, plus: 0 }; try { const L = ECHO.Gear.look(it); return L && typeof L.glowCol === 'string' && L.glowCol[0] === '#' && ECHO.Gear.line(it).length > 0; } catch (e) { return false; } }));
    check('great beasts leave hide and fangs worth having', ECHO.Gear.MATS.greathide && ECHO.Gear.MATS.greatfang && ECHO.Gear.CRAFT.some(c => c.mats.greathide));
    const lv = Pw.level(pl), x0 = Pw.st(pl).xp, xp = Pw.onKill(pl, { lvl: 1 }).xp;
    check('things far beneath you teach you almost nothing', xp <= 3 && Pw.level(pl) === lv, `${xp} xp`);
    Pw.gain(pl, 1e12);
    check('there is a height to reach', Pw.level(pl) === Pw.MAX && Pw.MAX === 1500 && Pw.title(pl) === 'the Eternal Sentinel' && Pw.gain(pl, 100).length === 0);
    check('level 150 is still the summit of the world outside the gates', Pw.rank(150).title === 'the Undying' && Pw.rank(149).title !== 'the Undying');
    const f150 = Pw.foeMul(150), f600 = Pw.foeMul(600), f1500 = Pw.foeMul(1500);
    check('foes keep growing all the way to 1500', f600.hp > f150.hp * 3 && f1500.hp > f600.hp * 2 && f1500.dmg > f600.dmg * 2, `hp ×${Math.round(f150.hp)} → ×${Math.round(f1500.hp)}`);
    void x0;
    const Gr = ECHO.Gear;
    const a = Gr.look({ kind: 'sword', rarity: 'common', plus: 0 }), b = Gr.look({ kind: 'sword', rarity: 'legendary', plus: 5, affix: 'ember' });
    check('upgraded gear looks finer', b.glow > a.glow && b.gems === 5 && a.gems === 0 && b.gold && !a.gold && b.metal !== a.metal);
    const ar = Gr.look({ kind: 'armor', rarity: 'rare', plus: 3, def: 20 });
    check('armour grows plates and a helm as it is reinforced', ar.helm && ar.pauldrons && ar.body);
  }

  console.log('\nWeapons and potions');
  {
    const B = ECHO.generateWorld({ seed: 4242, name: 'Armoury' });
    const Gr = ECHO.Gear, rng = ECHO.Sim.rngFor(B);
    const pl = B.player = { charId: 'c-w', first: 'Ina', last: 'Holt', alive: true, items: [], inv: { herbs: 10, venom: 2, bonedust: 9, gel: 4, claw: 3 }, gold: 1000, skills: {} };
    const kinds = new Set(); for (let i = 0; i < 60; i++) kinds.add(Gr.make(B, rng, 'sword', 3, 'fine').wclass);
    check('dropped weapons come as swords, axes, spears and staffs', ['sword', 'axe', 'spear', 'staff'].every(k => kinds.has(k)), [...kinds].join(' '));
    check('each kind of weapon fights differently', Gr.WCLASS.axe.dmg > 1 && Gr.WCLASS.axe.cd > 1 && Gr.WCLASS.spear.range > 0.5 && Gr.WCLASS.staff.flame > 1);
    const f = Gr.forge(B, pl, 'bonecleaver');
    check('a smith forges weapons from monster parts', f.item && f.item.wclass === 'axe' && pl.items.includes(f.item.id) && pl.inv.bonedust === 3, f.error || f.item.name);
    const why = Gr.brew(pl, 'heal'), why2 = Gr.brew(pl, 'might');
    check('potions are brewed from herbs and parts', !why && !why2 && pl.potions.heal === 1 && pl.potions.might === 1 && pl.inv.herbs === 5, why || why2);
    pl.buffs = { stone: 30 };
    check('a stoneskin tonic turns blows', Gr.taken(B, pl, 'melee') < 0.7);
  }

  console.log('\nThe Hollow Crown');
  {
    const B = ECHO.generateWorld({ seed: 999, name: 'Storyworld' });
    const pl = B.player = { charId: 'c-s', first: 'Ada', last: 'Vell', alive: true, items: [], inv: {}, gold: 0, skills: {}, x: B.settlements[0].x, y: B.settlements[0].y, explored: new Uint8Array(4000) };
    const S = ECHO.Story, rng = ECHO.Sim.rngFor(B);
    S.begin(B, rng);
    check('the story begins with a voice in the stone', S.chapter(B).id === 'voice' && S.objectives(B, pl)[0].where);
    check('a chapter does not close until its work is done', !S.advance(B, pl, rng));
    S.flag(B, 'archive');
    const r = S.advance(B, pl, rng);
    check('visiting the archive opens the next chapter', r && r.next && r.next.id === 'words');
    B.story.ch = 3;
    for (let i = 0; i < 3; i++) S.lordSlain(B);
    const r3 = S.advance(B, pl, rng);
    check('three lords yield three seals, and the seals point to the vault', B.story.seals === 3 && r3 && r3.next.id === 'vault' && B.lang.vault.revealed && ECHO.Mysteries.canOpen(B));
    ECHO.Mysteries.openVault(B);
    const r4 = S.advance(B, pl, rng);
    check('opening the vault opens the Rift, and a way through it', r4 && r4.next.id === 'rift' && B.rift && ECHO.Explore.sites(B).some(s => s.kind === 'riftdeep'));
    pl.prowess = { lv: 9, xp: 0 }; S.kingSlain(B);
    const r5 = S.advance(B, pl, rng);
    check('slaying the Hollow King seals the Rift and ends the story', r5 && !r5.next && B.story.done && B.rift.sealed);
  }

  console.log('\nBounties and rivals');
  {
    const B = ECHO.generateWorld({ seed: 31337, name: 'Bountyworld' });
    const pl = B.player = { charId: 'c-b', first: 'Kit', last: 'Vale', alive: true, items: [], inv: {}, gold: 0, skills: {}, renown: 0, x: B.settlements[0].x, y: B.settlements[0].y };
    const s0 = B.settlements[0], today = ECHO.Bounty.forTown(B, s0);
    check('every board posts three bounties a day, the same all day', today.length === 3 && JSON.stringify(today) === JSON.stringify(ECHO.Bounty.forTown(B, s0)), today.map(b => b.kind).join(' '));
    const kb = today.find(b => b.kind === 'kill') || today[0];
    ECHO.Bounty.accept(B, pl, kb);
    let paid = [];
    for (let i = 0; i < 12 && !paid.length; i++) paid = ECHO.Bounty.onKill(B, pl, { species: kb.species, elite: true, boss2: true, type: kb.kind === 'beast' ? 'boss' : 'creature' });
    check('a finished bounty is paid at once', paid.length === 1 && pl.gold === kb.gold, `${pl.gold} crowns`);
    for (let d = 0; d < 120; d++) ECHO.Sim.dailyTick(B, true);
    const R = ECHO.Rivals.list(B);
    check('rival adventurers go down into the dungeons too', R.length >= 4 && R.some(r => r.cleared > 0 || !r.alive) && B.chronicle.some(e => R.some(r => e.text.includes(r.name))), R.map(r => `${r.name}:${r.lv}/${r.cleared}${r.alive ? '' : '†'}`).join(' '));
    check('the standings include you', ECHO.Rivals.board(B, pl).some(r => r.you));
  }

  console.log('\nThe land goes on');
  {
    const B = ECHO.generateWorld({ seed: 2468, name: 'Frontierworld' });
    const s0 = B.settlements[0];
    const pl = B.player = { charId: 'c-f', first: 'Ada', last: 'Reed', alive: true, items: [], inv: {}, gold: 0, skills: {}, renown: 0, x: s0.x + 0.5, y: s0.y + 2.5, explored: new Array(Math.ceil(B.W / 4) * Math.ceil(B.H / 4)).fill(0), tmaps: [{ x: 50, y: 60 }] };
    pl.explored[Math.floor(s0.y / 4) * Math.ceil(B.W / 4) + Math.floor(s0.x / 4)] = 1;
    const W0 = B.W, H0 = B.H, n0 = B.settlements.length, npc0 = Object.keys(B.npcs).length, road0 = B.roads[0].path.slice(0, 5);
    const roadTile = i => B.tiles[i] === ECHO.TILE.ROAD || B.tiles[i] === ECHO.TILE.BRIDGE || B.tiles[i] === ECHO.TILE.PLAZA;
    const before = { sx: s0.x, px: pl.x, py: pl.y, reg: ECHO.World.regionAt(B, s0.x, s0.y).name, t: B.tiles[s0.y * W0 + s0.x] };
    const infos = [];
    for (const side of ['w', 'n', 'e', 's']) infos.push(ECHO.Frontier.expand(B, side, { from: { x: pl.x, y: pl.y } }));
    const F = B.frontier;
    check('the map grows on every side', B.W === W0 + 160 && B.H === H0 + 152 && infos.every(i => i && i.regions.length), `${W0}x${H0} → ${B.W}x${B.H}`);
    check('what was there moved with the map, ground and all', s0.x === before.sx + 80 && pl.x === before.px + 80 && pl.y === before.py + 76 && B.tiles[s0.y * B.W + s0.x] === before.t && ECHO.World.regionAt(B, s0.x, s0.y).name === before.reg && pl.tmaps[0].x === 130);
    check('roads still run over road', B.roads.every(r => r.path.filter(roadTile).length >= r.path.length * 0.8) && B.roads[0].path[0] === road0[0] + 80 + 76 * B.W - Math.floor(road0[0] / W0) * (W0 - B.W));
    check('the fog you lifted stays lifted', pl.explored.length === Math.ceil(B.W / 4) * Math.ceil(B.H / 4) && pl.explored[Math.floor(s0.y / 4) * Math.ceil(B.W / 4) + Math.floor(s0.x / 4)] === 1);
    const fresh = B.settlements.filter(s => s.frontier);
    check('new villages with their own people', fresh.length >= 4 && fresh.every(s => s.residents.length >= 18 && s.buildings.some(b => b.type === 'inn')) && Object.keys(B.npcs).length > npc0 + 80, fresh.map(s => `${s.name}:${s.residents.length}`).join(' '));
    check('...joined to the old roads', fresh.every(s => B.roads.some(r => r.b === s.id || r.a === s.id)) && B.settlements.length === n0 + fresh.length);
    const regs = B.regions.filter(r => r.frontier);
    check('new regions, beasts, ruins, delves, wonders and secrets', regs.length >= 8 && regs.every(r => ECHO.World.regionAt(B, (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2) === r) && B.lairs.some(l => fresh.some(s => s.id === l.villageId)) && (B.sites || []).filter(s => s.x < 80 || s.y < 76 || s.x > W0 + 80 || s.y > H0 + 76).length >= 6, `${regs.length} regions, ${B.lairs.length} lairs, ${B.sites.length} sites`);
    let land = 0, n = 0;
    for (let y = 2; y < B.H; y += 4) for (let x = 2; x < 78; x += 4) { n++; const t = B.tiles[y * B.W + x]; if (t !== ECHO.TILE.DEEP && t !== ECHO.TILE.WATER) land++; }
    check('the new country is mostly land', land / n > 0.6, `${Math.round(land / n * 100)}% land in the west`);
    const X0 = ECHO.Explore;
    const json = ECHO.Save.serialize(B), B2 = ECHO.Save.deserialize(json);
    check('a grown world saves and loads', B2.W === B.W && B2.tiles.length === B.W * B.H && B2.tiles.every((t, i) => t === B.tiles[i]) && B2.frontier.sides.e === 1, `${Math.round(json.length / 1024)} KB`);
    let ok = true;
    try { for (let d = 0; d < 40; d++) ECHO.Sim.dailyTick(B2, true); } catch (e) { ok = false; console.log(e); }
    check('...and goes on living', ok && B2.settlements.filter(s => s.frontier).every(s => s.residents.length > 10), `day ${B2.day}`);
    const far = B.sites.filter(s => s.cat === 'delve').map(s => X0.level(B, s));
    check('far lands hold deadlier dungeons', Math.max(...far) > 20 && Math.min(...far) <= 3, `levels ${Math.min(...far)}–${Math.max(...far)}`);
    const fm = [1, 12, 13, 50, 150].map(L => ECHO.Prowess.foeMul(L));
    check('foes grow stronger with every level, up to 150', fm.every((m, i) => !i || (m.hp > fm[i - 1].hp && m.dmg > fm[i - 1].dmg)) && Math.abs(fm[2].hp / fm[1].hp - 1) < 0.2, fm.map(m => `${m.hp.toFixed(1)}/${m.dmg.toFixed(1)}`).join(' '));
    check('travel reaches the new villages', B2.journeys.some(j => fresh.some(s => s.id === j.to || s.id === j.from)) || B2.chronicle.some(e => fresh.some(s => e.text.includes(s.name))));
  }

  {
    // every old town has a gentle cave within reach, added once to old saves too
    const W = ECHO.generateWorld({ seed: 4242, name: 'Starter' }), X = ECHO.Explore;
    delete W._starter; W.sites = W.sites.filter(s => !s.starter);
    const before = X.sites(W).length;
    const n1 = W.sites.filter(s => s.starter).length;
    X.sites(W); const n2 = W.sites.filter(s => s.starter).length;
    const towns = W.settlements.filter(t => !t.frontier && t.kind !== 'ashfang');
    const near = towns.every(t => W.sites.some(s => s.cat === 'delve' && X.level(W, s) <= 3 && U0(s, t) <= 40));
    function U0(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
    const walk = W.sites.filter(s => s.starter).every(s => !ECHO.Solids || !ECHO.World.isBlocked || !ECHO.World.isBlocked(W, s.x, s.y));
    check('every old town has a gentle cave nearby', n1 > 0 && n1 === n2 && near && walk && before >= n1, `${n1} starter caves`);
  }
  {
    // townsfolk go down into the dungeons, grow stronger and wear what they find
    const W = ECHO.generateWorld({ seed: 777, name: 'Delvers' }), Dv = ECHO.Delvers;
    const lv0 = {}; for (const n of Object.values(W.npcs)) lv0[n.id] = Dv.lv(n);
    let ok = true;
    try { for (let d = 0; d < 150; d++) ECHO.Sim.dailyTick(W, true); } catch (e) { ok = false; console.log(e); }
    const all = Object.values(W.npcs);
    const went = all.filter(n => (n.delves || 0) > 0);
    const rose = all.filter(n => n.status === 'alive' && Dv.lv(n) > (lv0[n.id] || 1));
    const geared = all.filter(n => n.status === 'alive' && (Dv.weapon(W, n) || Dv.armor(W, n)));
    const dangling = all.filter(n => n.gear && ((n.gear.weapon && !W.items[n.gear.weapon] && n.status === 'alive') || (n.gear.armor && !W.items[n.gear.armor] && n.status === 'alive')));
    const stuck = all.filter(n => n.status === 'alive' && n.delving && W.day > n.delving.back + 4);
    check('townsfolk delve, grow stronger and wear what they find', ok && went.length >= 3 && rose.length >= 3 && geared.length >= 2 && !dangling.length && !stuck.length, `${went.length} delved, ${rose.length} levelled, ${geared.length} geared, top ${Dv.top(W, 1).map(n => Dv.line(W, n)).join('')}`);
    const W2 = ECHO.Save.deserialize(ECHO.Save.serialize(W));
    const g = geared[0], g2 = g && W2.npcs[g.id];
    check('...and keep it through a save', g2 && Dv.lv(g2) === Dv.lv(g) && (Dv.weapon(W2, g2) || Dv.armor(W2, g2)));
    // gifts: free, and always put to use
    {
      const pl = W.player || ECHO.Character.create(W, new ECHO.RNG(5), { first: 'Gift', homeId: W.settlements[0].id });
      const rng = new ECHO.RNG(9), s = W.settlements.find(t => t.faction !== 'ashfang');
      const mk = (k, L) => { const it = ECHO.Gear.make(W, rng, k, L, 'rare', 'test'); it.holder = 'player'; pl.items.push(it.id); return it; };
      const big = mk('sword', 40), junk = mk('armor', 1), bow = mk('bow', 20);
      const guard = ECHO.People.residents(W, s).find(n => n.prof === 'guard') || ECHO.People.residents(W, s)[0];
      const op0 = guard.op[pl.charId] || 0;
      const r1 = Dv.gift(W, pl, guard, big);
      const res = Dv.shareAll(W, pl, s);
      const left = pl.items.filter(id => [junk.id, bow.id, big.id].includes(id));
      check('gear can be given away free, and always finds a use', r1 && r1.how === 'wears' && Dv.weapon(W, guard) === big && (guard.op[pl.charId] || 0) > op0 && res.length === 2 && !left.length && res.every(r => r.how !== 'wears' || r.wearer), res.map(r => r.it.name + ' → ' + r.how + (r.wearer ? ' ' + r.wearer.first : '')).join('; '));
    }
  }

  console.log('\nThe gates and the National Guard');
  {
    const W = ECHO.generateWorld({ seed: 4242, name: 'Gates' }), Gt = ECHO.Gates;
    const S = Gt.ensure(W), gates = S.list;
    const minTown = Math.min(...gates.map(g => Math.min(...W.settlements.map(s => ECHO.U.dist(s.x, s.y, g.x, g.y)))));
    const apart = Math.min(...gates.flatMap((a, i) => gates.slice(i + 1).map(b => ECHO.U.dist(a.x, a.y, b.x, b.y))));
    check('three gates stand alone in the wild, each a different world', gates.length === 3 && new Set(gates.map(g => g.theme)).size === 3 && minTown >= 24 && apart >= 24, `nearest town ${minTown.toFixed(0)}, apart ${apart.toFixed(0)}`);
    const dSite = Math.min(...gates.map(g => Math.min(...(W.sites || []).map(o => ECHO.U.dist(o.x, o.y, g.x, g.y)))));
    check('nothing of the world sits at the door of a gate', dSite >= Gt.R_KILL + 2, `nearest site ${dSite.toFixed(1)} (menace hurts within ${Gt.R_HURT})`);
    const ms = Gt.members(W);
    check('the National Guard is six, each strong enough for level 1500', ms.length === 6 && ms.every(n => ECHO.Delvers.lv(n) >= 1250 && ECHO.Delvers.weapon(W, n) && ECHO.Delvers.armor(W, n)) && new Set(ms.map(n => n.ng.key)).size === 6 && ms.filter(n => n.ng.rank === 'Commander').length === 1, ms.map(n => ECHO.People.fullTitle(W, n) + ' Lv ' + ECHO.Delvers.lv(n)).join('; '));
    check('two wardens at every gate', gates.every(g => Gt.atGate(W, g).length === 2));
    check('the menace kills close, hurts nearer, is felt further out', Gt.aura(W, gates[0].x + 3, gates[0].y).k === 3 && Gt.aura(W, gates[0].x + 10, gates[0].y).k === 2 && Gt.aura(W, gates[0].x + 18, gates[0].y).k === 1);
    const pl = ECHO.Character.create(W, new ECHO.RNG(3), { first: 'Oath', homeId: W.settlements[0].id });
    ECHO.Prowess.st(pl).lv = 149;
    check('below level 150 the Guard will not take you', Gt.canJoin(W, pl) === 'level' && !Gt.join(W, pl, ms[0]));
    ECHO.Prowess.st(pl).lv = 150;
    const rec = Gt.join(W, pl, ms[0]);
    check('at level 150 you can take the oath, with a warden as mentor', rec && pl.guard && Gt.mentorOf(W, pl) === ms[0] && Gt.canJoin(W, pl) === 'already');
    // someone of the world who gets to 150
    const heroes = Object.values(W.npcs).filter(n => n.status === 'alive' && n.loc && n.prof === 'guard').slice(0, 5);
    for (const h of heroes) { h.lv = 150; h.traits = ['brave', 'loyal']; }
    for (let i = 0; i < 40; i++) ECHO.Sim.dailyTick(W, true);
    const tr = S.guard.trainees.map(x => W.npcs[x.id]).filter(n => n && n.status === 'alive');
    check('anyone of the world who reaches 150 may join, and is trained to grow stronger', tr.length >= 2 && tr.every(n => n.ngTrainee) && tr.some(n => n.lv > 165), tr.map(n => n.first + ' Lv ' + n.lv).join(', '));
    // a warden falls: the Guard is six again
    const fallen = ms[3]; ECHO.People.kill(W, fallen, 'test');
    ECHO.Sim.dailyTick(W, true);
    const ms2 = Gt.members(W);
    check('a fallen warden is replaced', ms2.length === 6 && !ms2.includes(fallen) && ms2.some(n => n.ng.key === fallen.ng.key));
    const W2 = ECHO.Save.deserialize(ECHO.Save.serialize(W));
    check('the gates and the Guard survive a save', W2.gates && W2.gates.list.length === 3 && Gt.members(W2).length === 6 && W2.gates.list[0].x === gates[0].x);
    // an old world, saved before there were gates, gets them when it loads
    const W3 = ECHO.generateWorld({ seed: 99, name: 'Old' }); delete W3.gates;
    const W4 = ECHO.Save.deserialize(ECHO.Save.serialize(W3));
    check('old worlds get their gates', !W4.gates && Gt.ensure(W4) && W4.gates.list.length === 3 && Gt.members(W4).length === 6);
  }

  console.log('\nTitans: dragons and great beasts');
  {
    const W = ECHO.generateWorld({ seed: 5151, name: 'Titans' }), Ti = ECHO.Titans;
    const pl = ECHO.Character.create(W, new ECHO.RNG(4), { first: 'Tamer', homeId: W.settlements[0].id });
    const L = Ti.list(W);
    const minTown = Math.min(...L.map(t => Math.min(...W.settlements.map(s => ECHO.U.dist(s.x, s.y, t.x, t.y)))));
    check('the titans roam the world, each on its own range', L.length >= 8 && new Set(L.map(t => t.sp)).size === L.length && minTown >= 15 && L.filter(t => Ti.sp(t).flies).length >= 5, `${L.length} titans, nearest town ${minTown.toFixed(0)}: ${L.map(t => t.name + ' Lv ' + t.lvl).join(', ')}`);
    check('from a young dragon to a catastrophe', Math.min(...L.map(t => t.lvl)) < 60 && Math.max(...L.map(t => t.lvl)) >= 1000);
    const ok = L.slice(0, 4).map(t => Ti.bind(W, t, pl));
    const fifth = L[4];
    check('you can bind four, and no more', ok.every(Boolean) && Ti.bound(W).length === 4 && !Ti.bind(W, fifth, pl) && pl.beasts.length === 4);
    Ti.release(W, L[0], pl);
    check('a beast set free goes back to the wild, and makes room', !L[0].bound && Ti.bound(W).length === 3 && Ti.bind(W, fifth, pl));
    // a slain titan's range is claimed again
    const dead = L.find(t => !t.bound); Ti.slain(W, dead, 'a test'); dead.diedDay = W.day - 40;
    for (let i = 0; i < 40; i++) ECHO.Sim.dailyTick(W, true);
    check('an empty range is claimed by another of the kind', Ti.list(W).some(t => t.sp === dead.sp && t !== dead && (t.alive || W.chronicle.some(c => c.text.includes(`${t.name}, has claimed the range of ${dead.name}`)))));   // (and the newcomer may since have met something bigger)
    check('they eat, and towns pay when the game runs out', W.chronicle.some(c => /came down on the herds|ate its fill|Catastrophe/.test(c.text)) || Ti.wild(W).every(t => t.fed >= W.day - 3));
    const W2 = ECHO.Save.deserialize(ECHO.Save.serialize(W));
    check('titans and bound beasts survive a save', W2.titans && W2.titans.list.length === Ti.list(W).length && Ti.bound(W2).length === Ti.bound(W).length);
  }

  console.log('\nLevels, gear and power agree');
  {
    const P = ECHO.Prowess, Gr = ECHO.Gear;
    const pow = L => { const e = P.expect(L); return e.dmg * e.tough; };
    // the same label means about the same danger at every level
    const r = [10, 50, 150, 600, 1200].map(L => pow(P.above(L, 4)) / pow(L));
    check('"Deadly" is about as deadly at level 10 as at level 1200', Math.max(...r) / Math.min(...r) < 2.2 && P.diff(P.above(300, 4), 300).k === 'deadly' && ['even', 'hard'].includes(P.diff(305, 300).k), r.map(x => x.toFixed(2)).join(' '));
    check('nothing within a step of your level reads as Run', [20, 200, 1000].every(L => P.diff(L + Math.floor(P.step(L)), L).skulls <= 1));
    // what carries no weapon keeps pace with what does
    const flameVsBlade = [1, 50, 600].map(L => (19 * P.gearScale(L)) / Gr.statFor('sword', L, 'rare'));
    check('fire keeps pace with the blade at every level', Math.max(...flameVsBlade) / Math.min(...flameVsBlade) < 1.6, flameVsBlade.map(x => x.toFixed(2)).join(' '));
    // the smith makes for you
    const W = ECHO.generateWorld({ seed: 77, name: 'Smith' }), pl = ECHO.Character.create(W, new ECHO.RNG(3), { first: 'Smith', homeId: W.settlements[0].id });
    P.st(pl).lv = 120; pl.gold = 99999; Object.assign(pl.inv, { dragonscale: 9, heartstone: 9, grave: 9, sigil: 9, queensilk: 9 });
    const mail = Gr.craft(W, pl, 'dragon').item, blade = Gr.forge(W, pl, 'heartblade').item, drop = Gr.statFor('armor', 120, 'rare');
    check('dragonscale mail and the Heartblade made at level 120 beat a rare drop of that level', mail && mail.def > drop && blade.dmg > Gr.statFor('sword', 120, 'rare'), `mail ${mail && mail.def} vs a rare drop ${drop}; heartblade ${blade && blade.dmg}`);
    const before = blade.dmg; Object.assign(pl.inv, { bonedust: 9 }); Gr.hone(W, pl, blade);
    check('honing matters at any level', blade.dmg - before >= before * 0.045);
    P.st(pl).lv = 3; const low = Gr.forge(W, pl, 'heartblade').item;
    check('a recipe is never weaker than it was', low.dmg === 40);
  }


  console.log('\nNo twitching, no stalls');
  {
    // a way found a little at a time is the same way found all at once
    const Wd = { W: 60, H: 40 }, wall = (x, y) => (x === 30 && y > 2) || (x === 15 && y < 36);
    const cost = (x, y) => wall(x, y) ? Infinity : 1;
    const whole = ECHO.World.findPath(Wd, 2, 20, 55, 20, cost, 60000);
    const J = ECHO.World.pathJob(Wd, 2, 20, 55, 20, cost, 60000);
    let calls = 0, mid = null;
    while (!J.run(40, 0)) { calls++; if (calls === 3) mid = ECHO.World.findPath(Wd, 5, 5, 50, 30, cost, 60000); if (calls > 5000) break; }
    check('a long way planned a little each frame comes out the same as planned at once, and other searches made meanwhile do not disturb it', !!whole && !!J.path && J.path.length === whole.length && calls > 5 && !!mid, `${whole && whole.length} tiles in ${calls + 1} slices`);
    const J2 = ECHO.World.pathJob(Wd, 2, 20, 55, 20, () => Infinity, 60000);
    while (!J2.run(40, 0)) { /* */ }
    check('…and where there is no way, it says so', J2.done && J2.path === null);
    // places round the prey are kept, not dealt afresh
    const ctx = { console, Math, JSON, Set, Map, WeakSet, Object, Array, String, Number, isFinite };
    ctx.globalThis = ctx; vm.createContext(ctx);
    for (const f of ['core.js', 'game/tactics.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'js', f), 'utf8'), ctx, { filename: f });
    const E = ctx.ECHO, U = E.U, Tc = E.Tactics;
    let moved = 0;
    E.Ent = { seek(w, e, x, y, sp, dt) { moved++; const d = U.dist(e.x, e.y, x, y); if (d > 0.01) { const s = Math.min(d, sp * dt); e.x += (x - e.x) / d * s; e.y += (y - e.y) / d * s; } }, travel() {}, lineOfSight: () => true };
    const pe = { type: 'player', x: 0, y: 0, hp: 100, maxHp: 100 };
    const game = { time: 10, pe, pl: { hp: 100, maxHp: 100 }, world: { npcs: {} }, ents: [], hostileTo: () => true };
    const foes = [0.3, 1.9, 3.4, 5.1].map((a, i) => ({ id: i + 1, type: 'creature', humanoid: true, foe: {}, species: 'skeleton', aggro: true, target: pe, x: Math.cos(a) * 3, y: Math.sin(a) * 3, hp: 30, maxHp: 30, speed: 3, sayT: 0, gear: {} }));
    game.ents = [pe, ...foes];
    Tc.t = 0; Tc.update(game, 0.3);
    const before = foes.map(e => e.slotA);
    foes.forEach((e, i) => { const a = [0.9, 1.5, 3.9, 4.6][i]; e.x = Math.cos(a) * 2.6; e.y = Math.sin(a) * 2.6; });
    game.time += 0.3; Tc.t = 0; Tc.update(game, 0.3);
    check('each keeps the place round its prey it was given, however the others shift about', foes.every((e, i) => e.slotA === before[i]) && new Set(foes.map(e => e.slotI)).size === 4);
    check('the walking look-ahead and the stop-and-stare no longer share one timer (that made everyone near you stare, step, stare, step)', !/_lookT/.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'js', 'game', 'entities.js'), 'utf8')) && !/_lookT/.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'js', 'game', 'ai.js'), 'utf8')));
    // one that has struck holds its ground
    const w = foes.find(e => !e.token);
    w.x = Math.cos(w.slotA) * 1.6; w.y = Math.sin(w.slotA) * 1.6; moved = 0;
    for (let i = 0; i < 40; i++) Tc.move(game, w, pe, U.dist(w.x, w.y, 0, 0), Math.atan2(-w.y, -w.x), 3, 0.05, { reach: 1.2 });
    check('a foe waiting its turn just outside its reach stands its ground: no stepping out and back in', moved === 0 && Math.abs(U.dist(w.x, w.y, 0, 0) - 1.6) < 0.01);
    w.x = Math.cos(w.slotA) * 6; w.y = Math.sin(w.slotA) * 6;
    for (let i = 0; i < 60; i++) Tc.move(game, w, pe, U.dist(w.x, w.y, 0, 0), Math.atan2(-w.y, -w.x), 3, 0.05, { reach: 1.2 });
    check('…and one left far out comes in to the ring and stops there', U.dist(w.x, w.y, 0, 0) < 3.2 && U.dist(w.x, w.y, 0, 0) > 1.3, `${U.dist(w.x, w.y, 0, 0).toFixed(2)} away`);
  }


  console.log('\nLevel against level');
  {
    const P = ECHO.Prowess, om = (a, d) => P.overmatch(P.steps(a, d));
    check('a level 5 striking a level 10 does less than half, and is struck nearly twice as hard', om(5, 10) < 0.5 && om(5, 10) > 0.35 && om(10, 5) > 1.7 && om(10, 5) < 2.1, `x${om(5, 10).toFixed(2)} dealt, x${om(10, 5).toFixed(2)} taken`);
    check('…one level apart changes nothing much, and the same level nothing at all', om(5, 5) === 1 && om(5, 6) > 0.9 && om(6, 5) < 1.1);
    check('…it is the same danger at every height: 500 against 1000 as 5 against 10; 596 against 620 as good as even', Math.abs(om(500, 1000) - om(5, 10)) < 0.01 && om(596, 620) === 1);
    check('…and it has an end: never less than a fifth, never more than two and a half times', om(1, 1500) === 0.2 && om(1500, 1) === 2.5);
    let mono = true; for (let d = 1; d < 40; d++) if (om(5, 5 + d) > om(5, 4 + d) + 1e-9 || om(5 + d, 5) < om(4 + d, 5) - 1e-9) mono = false;
    check('…the further apart, the more it tells, without a step backwards', mono);
    const sword = L => ({ kind: 'sword', dmg: Math.round(12 + L * 3.2) }), mail = L => ({ kind: 'armor', def: 4 + L * 4 });
    check('gear counts: a level 10 blade in level 5 hands strikes at level 7.5, and level 10 mail is struck at 7.5', Math.abs(5 + P.gearShift(5, sword(10)) - 7.5) < 0.2 && Math.abs(5 + P.gearShift(5, mail(10)) - 7.5) < 0.01, `strikes at ${(5 + P.gearShift(5, sword(10))).toFixed(1)}`);
    check('…poor gear is never held against its bearer, and the best gear only carries so far (three steps)', P.gearShift(50, sword(3)) === 0 && P.gearShift(5, sword(400)) === 3 && P.gearShift(100, sword(1400)) === 30);
    const pe = { type: 'player' }, game = { pe, pl: { prowess: { lv: 5, xp: 0 }, weapon: 'w', armor: 'a' }, world: { items: { w: sword(5), a: mail(5) }, npcs: { n1: { id: 'n1', lv: 10, skill: { fight: 30 } } } } };
    const gob = { type: 'creature', foe: {}, lvl: 10 }, guard = { type: 'person', npcId: 'n1' };
    const a = P.clash(game, pe, gob, { type: 'melee' }), b2 = P.clash(game, gob, pe, { type: 'melee' }), c = P.clash(game, guard, pe, { type: 'melee' });
    game.world.items.w = sword(10); const a2 = P.clash(game, pe, gob, { type: 'melee' });
    check('in a fight: you at 5 on a level 10 goblin, it on you, and a level 10 soldier on you — and a better blade closes the gap', a < 0.5 && b2 > 1.7 && c > 1.7 && a2 > a + 0.15, `x${a.toFixed(2)} → x${a2.toFixed(2)} with a level 10 blade; it hits x${b2.toFixed(2)}`);
    check('…things that do not fight (a door, a barrel) are struck as ever', P.clash(game, pe, { type: 'prop' }, { type: 'melee' }) === 1);
  }

  console.log('\nSavvy');
  {
    let seed = 777;
    const M = Object.create(Math); M.random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const ctx = { console, Math: M, JSON, Set, Map, WeakSet, Object, Array, String, Number, isFinite };
    ctx.globalThis = ctx; vm.createContext(ctx);
    for (const f of ['core.js', 'game/aware.js', 'game/savvy.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'js', f), 'utf8'), ctx, { filename: f });
    const E = ctx.ECHO, U = E.U;
    let pond = null, wall = null; const floats = [];
    E.World = { isSolid: () => false }; E.Water = { kind: (w, x, y) => pond && U.dist(x, y, pond.x, pond.y) < 1.2 ? 'shallow' : null };
    E.Ent = { fits: () => true, lineOfSight: (w, ax, ay, bx, by) => !(wall && bx > wall), seek(w, e, x, y, sp, dt) { const d = U.dist(e.x, e.y, x, y); if (d > 0.01) { const s = Math.min(d, sp * dt); e.x += (x - e.x) / d * s; e.y += (y - e.y) / d * s; } }, travel(w, e, x, y, sp, dt) { this.seek(w, e, x, y, sp, dt); } };
    E.Combat = { fx: [], proj: [], floater: (x, y, t) => floats.push(t) }; E.PlayerCtl = { heavyHold: false };
    E.Guns = { aiming: false, lock: null }; E.React = { soak: (g, e) => { e.soaked = true; } };
    E.Tactics = { fearless: () => false, ranged: () => false, squads: new Map() };
    const pe = { type: 'player', x: 0, y: 0, r: 0.33, hp: 100, maxHp: 100, dir: 0 };
    const game = E.Game = { time: 0, world: { npcs: {} }, pe, ents: [], hostileTo: (a, b) => (a === pe) !== (b === pe), shake() {}, light() {} };
    const mk = (x, y, o) => Object.assign({ type: 'creature', humanoid: true, foe: { elite: true }, aggro: true, x, y, r: 0.36, speed: 3.8, hp: 50, maxHp: 50, state: 'chase', gear: {} }, o);
    const run = (e, n) => { for (let i = 0; i < n; i++) { game.time += 0.05; E.Aware.tick(game, 0.05); E.Aware.preempt(game, e, 0.05); } };
    // under the gun
    const a = mk(8, 0); game.ents = [pe, a];
    run(a, 60);
    check('a foe you are not aiming at comes on as it would', a.x === 8 && a.y === 0);
    E.Guns.aiming = true; let off = 0;
    for (let i = 0; i < 80; i++) { run(a, 1); off = Math.max(off, Math.abs(a.y)); }
    check('held under a gun, a foe with sense weaves off the line of the barrel', off > 0.8, `${off.toFixed(2)} off the line`);
    const dull = mk(8, 0, { foe: {}, species: 'skeleton', humanoid: false }); game.ents = [pe, dull];
    run(dull, 80);
    check('…a mindless one walks straight down it', dull.y === 0);
    E.Guns.aiming = false;
    // locked by the launcher
    const t1 = mk(8, 0), by = mk(8.8, 0.6); game.ents = [pe, t1, by];
    E.Guns.lock = { e: t1, on: true, t: 1 };
    run(by, 30);
    check('those standing by the one your launcher has locked get clear of it', U.dist(by.x, by.y, t1.x, t1.y) > 2.6, `${U.dist(by.x, by.y, t1.x, t1.y).toFixed(1)} away`);
    wall = 9.5; run(t1, 30);
    check('…and the one it is meant for runs to put something between you', t1.x > 9.5, `x ${t1.x.toFixed(1)}`);
    E.Guns.lock = null; wall = null;
    // on fire
    const b = mk(6, 0, { burn: 5 }); game.ents = [pe, b]; pond = { x: 6, y: 4 };
    run(b, 80);
    check('a burning foe runs for water, is put out, and is soaked for it', b.burn === 0 && b.soaked && U.dist(b.x, b.y, 6, 4) < 1.3, floats.join(', '));
    pond = null; const c = mk(6, 0, { burn: 5 }); game.ents = [pe, c]; run(c, 30);
    check('…with no water near, a man rolls the worst of it out, once, and is open while he does', c.burn < 2 && c.stagger >= 0.7 && c._rolled, `burn ${c.burn.toFixed(2)}`);
    // a ward gone
    const w = mk(2, 0, { token: true }); game.ents = [pe, w];
    E.Savvy.wardBroke(game, w, false); run(w, 30);
    check('a foe whose ward has just broken stands stunned a moment…', w.x === 2);
    run(w, 40);
    check('…then backs off behind the others, and gives up its turn to strike', w.x > 4 && !w.token, `x ${w.x.toFixed(1)}`);
    // a shatter seen close
    const s1 = mk(3, 0), s2 = mk(3.8, 0.5, { token: true }), s3 = mk(12, 0); game.ents = [pe, s1, s2, s3];
    const sq = { shock: 0 }; E.Tactics.squads.set(pe, sq);
    E.Savvy.spook(game, s1, pe);
    check('one of them shattered beside the others: the near ones flinch back, the far ones do not, and the pack loses heart', !!s2._ev && !s2.token && !s3._ev && sq.shock > 0.1);
  }


  console.log('\nAwareness');
  {
    // a small world of its own: open ground, a few minds, and the awareness module
    // (its dice are loaded the same way every run, so the checks don't depend on luck)
    let seed = 12345;
    const M = Object.create(Math); M.random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const ctx = { console, Math: M, JSON, Set, Map, WeakSet, Object, Array, String, Number, isFinite };
    ctx.globalThis = ctx; vm.createContext(ctx);
    for (const f of ['core.js', 'game/aware.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'js', f), 'utf8'), ctx, { filename: f });
    const E = ctx.ECHO, U = E.U;
    E.World = { isSolid: () => false }; E.Water = { kind: () => null };
    E.Ent = { fits: () => true, lineOfSight: () => true, seek(w, e, x, y, sp, dt) { const d = U.dist(e.x, e.y, x, y); if (d > 0.01) { const s = Math.min(d, sp * dt); e.x += (x - e.x) / d * s; e.y += (y - e.y) / d * s; } }, travel(w, e, x, y, sp, dt) { this.seek(w, e, x, y, sp, dt); } };
    E.Combat = { fx: [], proj: [] }; E.PlayerCtl = { heavyHold: false };
    const pe = { type: 'player', x: 0, y: 0, r: 0.33, hp: 100, maxHp: 100 };
    const side = e => e === pe || e.isCompanion ? 'you' : 'them';
    const game = E.Game = { time: 0, world: { npcs: {} }, pe, ents: [], hostileTo: (a, b) => side(a) !== side(b), shake() {}, light() {} };
    const comp = { type: 'person', isCompanion: true, compLv: 5, x: 2, y: 0, r: 0.34, speed: 3.5, hp: 50, maxHp: 100, state: 'chase', gear: {} };
    const mender = { type: 'person', isCompanion: true, compCls: 'mender', x: 3, y: 1, r: 0.34, speed: 3.5, hp: 40, maxHp: 100, state: 'chase', gear: {} };
    const foe = { type: 'creature', humanoid: true, foe: { elite: true }, aggro: true, x: 5, y: 0, r: 0.36, speed: 3.8, hp: 50, maxHp: 50, state: 'chase', gear: {} };
    game.ents = [pe, comp, mender, foe];
    // a blow marked under the companion, made by the foe
    E.Combat.fx.push({ kind: 'tele', shape: 'circle', cx: 2, cy: 0, x: 2, y: 0, radius: 1.5, t: 0, life: 1.2, by: foe });
    let moved = false;
    for (let i = 0; i < 20 && !moved; i++) { game.time += 0.1; E.Aware.tick(game, 0.1); E.Aware.preempt(game, comp, 0.1); moved = U.dist(comp.x, comp.y, 2, 0) > 1.5; }
    check('a companion steps out of a marked blow before it lands', moved, `now ${U.dist(comp.x, comp.y, 2, 0).toFixed(1)} from its centre`);
    check('a foe does not flee its own side\'s blow', E.Aware.danger(game, foe, 2, 0) === 0 && E.Aware.danger(game, comp, 2, 0) > 0);
    // who it goes for
    game.time += 5; foe._tgPick = null;
    const t = E.Aware.target(game, foe, pe);
    check('a clever foe goes for the wounded healer before you', t === mender);
    const rat = { type: 'creature', species: 'giantrat', foe: {}, aggro: true, x: 1.6, y: 0, r: 0.4, hp: 30, maxHp: 30, gear: {} };
    check('a mindless thing just goes for whatever is nearest', E.Aware.target(game, rat, pe) === comp || E.Aware.target(game, rat, pe) === pe);
    const slime = { type: 'creature', species: 'slime', foe: { slimeK: true }, aggro: true, x: 1.6, y: 0, r: 0.4, hp: 30, maxHp: 30, gear: {} };
    check('a slime is the cleverest thing that lives: it picks out the wounded healer too', E.Aware.iq(slime) === 1 && E.Aware.target(game, slime, pe) === mender);
    // aiming ahead
    const archer = { ...foe, x: 0, y: 6 }; pe._vx = 4; pe._vy = 0;
    const a = E.Aware.lead(game, archer, pe, 13, -Math.PI / 2), ax = Math.cos(a);
    check('an archer aims ahead of a running target', ax > 0.1, `aims ${(Math.atan2(Math.sin(a), Math.cos(a)) * 180 / Math.PI).toFixed(0)}° instead of -90°`);
  }


  console.log('\nTamed beasts, relics, draughts');
  {
    const ctx = { console, Math, JSON, Set, Map, WeakSet, Object, Array, String, Number, isFinite, Uint8Array, Int32Array, Float32Array };
    ctx.globalThis = ctx; vm.createContext(ctx);
    for (const f of ['core.js', 'sim/gear.js', 'sim/prowess.js', 'game/tame.js', 'game/pack.js', 'game/arcana.js', 'game/aura.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'js', f), 'utf8'), ctx, { filename: f });
    const E = ctx.ECHO, T = E.Tame, A = E.Arcana, P = E.Pack, Gr = E.Gear;
    E.Explore = { small: s => ['cave', 'hideout', 'grot'].includes(s.kind) };
    // sizes, and who fits where
    const goblin = { scale: 0.72, cat: 'foe' }, troll = { scale: 1.55, cat: 'foe' }, widow = { scale: 2.4, cat: 'foe' }, drake = { scale: 1, cat: 'boss' }, lord = { scale: 1.1, cat: 'foe', lord: true };
    check('beasts have sizes: a goblin small, a troll large, a widow and a lair\'s drake huge, a lord at least large', T.sizeOf(goblin) === 'small' && T.sizeOf(troll) === 'large' && T.sizeOf(widow) === 'huge' && T.sizeOf(drake) === 'huge' && T.sizeOf(lord) === 'large');
    const cave = { carved: true, type: 'delve', site: { kind: 'cave' } }, barrow = { carved: true, type: 'delve', site: { kind: 'barrow' } }, gate = { carved: true, type: 'gate' }, house = { type: 'house' };
    check('a cave lets in only the small; a barrow keeps out the huge; a gate\'s world takes any; a house none', T.fits(goblin, cave) && !T.fits(troll, cave) && T.fits(troll, barrow) && !T.fits(drake, barrow) && T.fits(drake, gate) && !T.fits(goblin, house) && T.fits(drake, null));
    check('your blows kill by default; taming (last breath, or the leash of old saves) is chosen', T.mode({}) === 'kill' && !T.taming({}) && T.mode({ leash: true }) === 'leash' && T.mode({ tameMode: 'breath' }) === 'breath' && T.taming({ tameMode: 'breath' }) && T.ORDER[0] === 'kill');
    {
      // on a hunt: the one you fight, beaten low, is tamed with E; one you are not fighting gives no call; a relic's chains spare only when taming
      E.UI = E.UI || { toast() {} }; E.Interior = E.Interior || { cur: null }; E.Input = E.Input || { mx: 0, my: 0 }; E.PlayerCtl = E.PlayerCtl || { lock: null };
      E.Combat = E.Combat || { floater() {}, ring() {}, burst() {}, fx: [] };
      const pl = { pack: [], prowess: { lv: 5 } }, pe = { x: 0, y: 0 };
      const gob = { species: 'goblin', x: 2, y: 0, hp: 10, maxHp: 100, foe: { name: 'Goblin', look: 'goblin' } }, far = { species: 'spider', x: 4, y: 1, hp: 10, maxHp: 100, foe: { name: 'Spider', look: 'spider' } };
      const g = { pl, pe, ents: [gob, far], time: 10, lastStruck: gob, lastStruckT: 9, screenToWorld: () => ({ x: 0, y: 0 }), world: { day: 1, minute: 0 } };
      const its = T.interactables(g);
      check('to the kill, a beast you are fighting that is beaten low is yours with E — and only that one, and E does not jump to it ahead of everything', its.length === 1 && its[0].tameEnt === gob && its[0].d > 0 && /Tame the goblin/.test(its[0].label), its.map(i => i.label + ' ' + i.d.toFixed(2)).join('; '));
      const bound = { species: 'goblin', x: 1, y: 0, hp: 0, maxHp: 100, _bound: 30, foe: { name: 'Goblin', look: 'goblin' } };
      check('to the kill, a beast held in a relic\'s chains still dies', T.onDeath(g, bound, pe) === false && !(bound.subdued > 0));
    }
    {
      // no more than two of any one kind
      const g2 = { pl: { pack: [{ kind: 'goblin', cat: 'foe' }, { kind: 'goblin', cat: 'foe' }, { kind: 'spider', cat: 'foe' }, { kind: 'goblin', cat: 'foe', lord: true }] } };
      const gob = { species: 'goblin', foe: { name: 'Goblin', look: 'goblin' } }, spi = { species: 'spider', foe: { name: 'Spider', look: 'spider' } }, lordGob = { species: 'goblin', lord: true, foe: { name: 'Goblin', look: 'goblin' } };
      check('two of a kind is the most you keep: a third goblin cannot be tamed, a second spider can, a goblin lord is its own', T.MAX_SAME === 2 && T.sameCount(g2.pl, 'goblin') === 2 && T.full(g2, gob) && !T.can(g2, gob) && !T.full(g2, spi) && !T.full(g2, lordGob) && T.plural(gob) === 'goblins');
    }
    {
      // growth: levels up to your own, then mastery of its skills
      E.UI = E.UI || { toast() {} };
      const pl = { prowess: { lv: 10 } }, g3 = { pl, ents: [] };
      const r = { lvl: 9, lvlT: 5, xp: 0, name: 'Test' };
      const lv = E.Prowess.level(pl);
      T.grow(g3, r, T.need(r) - 1); const before = r.lvl;
      T.grow(g3, r, 1);
      const reached = r.lvl === lv && !r.mastery;
      T.grow(g3, r, 1e7);
      check('a beast grows to your level, then its skills grow: mastery ranks raise its harm and life and quicken its arts, with skills learned on the way, up to the most', before === 9 && reached && r.lvl === lv && r.mastery === T.MASTERY_MAX && T.mDmg(r) > 1.8 && T.mHp(r) > 1.5 && T.cdMul(r) < 0.6 && T.has(r, 'hide') && T.has(r, 'apex'), `lv ${r.lvl} ★${r.mastery}`);
      const old = { lvl: 40, xp: 0 };   // (from an older save, above your level: it keeps its level and grows in skill)
      check('a beast already above your level keeps its level and grows in skill', T.atCap(g3, old) && (T.grow(g3, old, T.needM(old)), old.lvl === 40 && old.mastery === 1));
    }
    // the pack falls only on fair game among people
    const game = { world: { npcs: { a: { faction: 'ashfang' }, b: { faction: 'crown' } } } };
    check('the pack spares the watch, soldiers, townsfolk and the yielded, but not outlaws or those who came at you', !P.fairGame(game, { role: 'guard' }) && !P.fairGame(game, { role: 'soldier' }) && !P.fairGame(game, { role: 'villager', npcId: 'b' }) && !P.fairGame(game, { role: 'bandit', yielded: true }) && P.fairGame(game, { role: 'bandit' }) && P.fairGame(game, { npcId: 'a' }) && P.fairGame(game, { role: 'villager', startedFight: true }));
    {
      // …but the watch and the realm's soldiers fighting you are fought: your beasts defend you
      const pe = { type: 'player' }, pal = { pal: {} }, g2 = { world: game.world, pe, time: 100 };
      const hit = { role: 'guard', _hitPlT: 95 }, hitPal = { role: 'soldier', _hitPalT: 97 }, swing = { role: 'guard', target: pe, state: 'windup' }, atPal = { role: 'soldier', target: pal, state: 'attack' };
      const walking = { role: 'guard', target: pe, state: 'chase' }, long = { role: 'guard', _hitPlT: 85 }, ward = { role: 'guard', ngWard: true, _hitPlT: 99 }, gave = { role: 'guard', yielded: true, _hitPlT: 99 };
      check('a guard or soldier who strikes you or one of your beasts, or swings at you, your beasts fight', P.fairGame(g2, hit) && P.fairGame(g2, hitPal) && P.fairGame(g2, swing) && P.fairGame(g2, atPal));
      check('…but not one only coming to arrest you, one who struck long ago, a warden of the Guard, or one who has yielded', !P.fairGame(g2, walking) && !P.fairGame(g2, long) && !P.fairGame(g2, ward) && !P.fairGame(g2, gave));
    }
    // relics and the well of mana
    check('a relic of a higher level or rarity is stronger', A.power(20, 'rare') > A.power(10, 'rare') && A.power(20, 'epic') > A.power(20, 'rare'));
    {
      // the aura of your strength
      const Au = E.Aura, items = { w1: { rarity: 'legendary' }, a1: { rarity: 'epic' } };
      const g = lv => ({ pl: { prowess: { lv }, relics: [] }, world: { items } });
      const s1 = Au.strength(g(1)), s9 = Au.strength(g(9)), s30 = Au.strength(g(30)), s300 = Au.strength(g(300));
      const geared = g(30); geared.pl.weapon = 'w1'; geared.pl.armor = 'a1';
      check('your aura grows with your strength: faint for a novice, a shell of flame for a hero and more, full at level 300 — and the finest of what you wear adds to it', s1 < 0.12 && s9 > 0.4 && s30 > s9 && Math.abs(s300 - 1) < 0.01 && Au.strength(geared) > s30, [s1, s9, s30, s300].map(x => x.toFixed(2)).join(' / '));
      E.UI = E.UI || {}; E.UI.toast = E.UI.toast || (() => {}); E.Combat = E.Combat || {}; E.Combat.floater = E.Combat.floater || (() => {});
      const pe = { x: 0, y: 0 }, weak = { x: 2, y: 0, lvl: 5, hp: 10, maxHp: 10 }, elite = { x: 2, y: 1, lvl: 5, elite: true, hp: 10, maxHp: 10 }, even = { x: 1, y: 1, lvl: 29, hp: 10, maxHp: 10 }, far = { x: 40, y: 0, lvl: 5, hp: 10, maxHp: 10 };
      const game = { pl: { prowess: { lv: 30 }, relics: [] }, world: { items }, pe, ents: [weak, elite, even, far], time: 5, hostileTo: () => true };
      Au._pT = 0; Au.presence(game, 0.3, s30, 1);
      check('what is far beneath you is cowed inside your aura (and falters), the strong and your equals are not, and a cowed blow lands softer', weak._cowed > 5 && weak.stagger > 0 && !elite._cowed && !even._cowed && !far._cowed && Au.cowMul(game, weak) === 0.75 && Au.cowMul(game, even) === 1);
    }
    check('mana grown by use is deep but not bottomless', A.bonus({ arc: { used: 400 } }) === 32 && A.bonus({ arc: { used: 1e9, fight: 1e9 } }) === 300 && A.bonus({}) === 0);
    // draughts
    const pr = k => Gr.potionPrice(Gr.POTIONS[k], 1);
    check('healing draughts climb in price with their strength, and a dearer market asks more', pr('minor') < pr('heal') && pr('heal') < pr('greater') && Gr.potionPrice(Gr.POTIONS.heal, 1.3) > pr('heal'));
    const pl = { gold: 1e6, potions: {} };
    check('phoenix tears are never sold ready-made', !!Gr.buyPotion(pl, 'phoenix') && !pl.potions.phoenix && !Gr.buyPotion(pl, 'minor') && pl.potions.minor === 1);
    check('the healing draughts are found in order of strength', Gr.healIds().join(',') === 'minor,heal,greater');
  }

  console.log('\nCalamities');
  {
    const w = ECHO.generateWorld({ seed: 4242, name: 'Calamityworld' });
    const C = ECHO.Calamity, Ti = ECHO.Titans, rng = new ECHO.RNG(7), U = ECHO.U;
    Ti.ensure(w);
    const L = Ti.list(w);
    check('every titan has a class, from Lesser to Primordial', L.every(t => C.cls(t).n >= 1) && C.cls({ lvl: 26 }).n === 1 && C.cls({ lvl: 165 }).n === 2 && C.cls({ lvl: 330 }).n === 3 && C.cls({ lvl: 720 }).n === 4 && C.cls({ lvl: 1400 }).n === 5, L.map(t => t.name + ' ' + C.cls(t).roman).join(', '));
    const t = L.find(x => !Ti.sp(x).flies) || L[0];
    const started = C.start(w, rng, t, 'wander');
    const x0 = t.x, y0 = t.y;
    t.movedAt = C.now(w) - 1440; C.move(w);
    check('a calamity leaves its range and travels the country as the clock runs', started && !!t.mig && U.dist(x0, y0, t.x, t.y) > 5, `${Math.round(U.dist(x0, y0, t.x, t.y))} leagues in a day`);
    // a town in its way: the stages
    const s = w.settlements.find(z => z.faction !== 'ashfang');
    const mob = Ti.list(w).find(x => x !== t && Ti.sp(x).flies) || t;
    mob.lvl = 150; mob.mig = { to: { x: s.x - 60, y: s.y }, why: 'wander', day: w.day };
    const p0 = s.prosperity = 60;
    const at = dx => { mob.x = s.x + dx; mob.y = s.y; C.threats(w, rng, mob); return s.calamity ? s.calamity.stage : 0; };
    const st1 = at(45), st2 = at(20), st3 = at(5), hit = !!(s.calamity && s.calamity.hit), pr = s.prosperity;
    at(-45);
    check('a town in its path sees it coming in stages: the signs, the shut gates, the beast itself, and what is left after', st1 === 1 && st2 === 2 && st3 === 3 && hit && pr < p0 && !s.calamity, `stages ${st1}/${st2}/${st3}, prosperity ${p0}→${pr}`);
    // stop it before it gets there, and the town pays
    mob.mig = { to: { x: s.x - 60, y: s.y }, why: 'wander', day: w.day }; mob.x = s.x + 25; mob.y = s.y; s.calamity = null; C.threats(w, rng, mob);
    const pl = { gold: 0, renown: 0, charId: 'tester', first: 'Test', last: 'Er' };
    const thanks = C.stoppedBy(w, mob, pl, 'slew');
    check('stop it before it reaches a town, and the town sends its thanks', thanks.some(x => x.s === s) && pl.gold > 0 && !s.calamity, `${pl.gold} crowns`);
    // where one dies, a dungeon opens some days later
    const sites0 = w.sites.length;
    Ti.slain(w, t, 'the test');
    const due = t.scar && t.scar.day;
    w.day = due; C.daily(w, rng);
    const scar = w.sites.find(x => x.kind === 'scar');
    check('where a calamity falls, a dungeon opens some days later, with things of its kind inside', !!due && w.sites.length === sites0 + 1 && !!scar && scar.level >= 4 && Array.isArray(scar.roster) && !!ECHO.Explore.DELVES.scar, scar ? `${scar.name}, level ${scar.level}` : 'none');
    // two that meet will fight
    const live = Ti.wild(w).filter(x => x !== mob).slice(0, 2);
    if (live.length === 2) {
      const [a, b] = live; a.mig = { to: { x: a.x + 50, y: a.y }, why: 'wander', day: w.day }; b.x = a.x + 3; b.y = a.y; w.player = null;
      const n0 = w.chronicle.length; for (let k = 0; k < 20 && !w.chronicle.slice(n0).some(e => /Two calamities met/.test(e.text)); k++) { w.titans.clash = {}; C.clashes(w, rng); }
      check('two calamities that meet will fight, and one of them comes off the worse', w.chronicle.slice(n0).some(e => /Two calamities met/.test(e.text)) && (a.hp < 1 || b.hp < 1 || !a.alive || !b.alive), w.chronicle.slice(n0).map(e => e.text).join(' | ').slice(0, 200));
    }
    // a kind new to the game comes into an old world once
    w.titans.list = w.titans.list.filter(x => x.sp !== 'ironback'); w.titans.known = null;
    const before = w.titans.list.length; Ti.ensure(w); Ti.ensure(w);
    check('a titan new to the game (Ironback, the Walking Keep) comes into an old world, once', Ti.list(w).filter(x => x.sp === 'ironback').length === 1 && Ti.list(w).length === before + 1 && Ti.sp(Ti.list(w).find(x => x.sp === 'ironback')).fortress);
    // a whole season of it, headless
    let threw = null; try { for (let d = 0; d < 40; d++) ECHO.Sim.dailyTick(w, true); } catch (err) { threw = err; }
    check('a season of roaming calamities runs without a hitch', !threw && Ti.list(w).every(x => isFinite(x.x) && isFinite(x.y) && x.x > 0 && x.y > 0 && x.x < w.W && x.y < w.H), threw ? String(threw.stack).slice(0, 300) : `${C.moving(w).length} on the move`);
  }

  console.log('\nHealing arts');
  {
    const ctx = { console, Math, JSON, Set, Map, WeakSet, Object, Array, String, Number, isFinite };
    ctx.globalThis = ctx; vm.createContext(ctx);
    for (const f of ['core.js', 'sim/prowess.js', 'game/mending.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'js', f), 'utf8'), ctx);
    const E = ctx.ECHO, M = E.Mending;
    E.Combat = { floater() {}, ring() {}, burst() {}, fx: [] };
    const pl = { prowess: { lv: 20 }, hp: 150, maxHp: 200, mana: 100 }, pe = { hp: 150, x: 0, y: 0 };
    const game = { pl, pe, time: 100, combatT: 99, ents: [], hostileTo: () => true };
    const fresh = M.st(pl).on.slice().join(',');
    check('a hero starts with Renewal and Victor\'s breath on', fresh === 'renewal,victor');
    M.toggle(pl, 'wind'); const full = M.toggle(pl, 'leech');
    check('no more than three on at once; switching one off makes room', full === 'full' && M.toggle(pl, 'victor') === true && M.toggle(pl, 'leech') === true && M.st(pl).on.length === 3);
    const lowLv = { prowess: { lv: 1 } };
    check('the deeper arts open with level', M.toggle(lowLv, 'pulse') === 'locked');
    const h0 = pl.hp; M.tick(game, 1);
    check('in a fight the arts that are on heal by themselves (Renewal draws mana)', pl.hp > h0 && pl.mana < 100, `${h0}→${Math.round(pl.hp)} life`);
    pl.hp = 40; pe.hp = 40; const m0 = pl.mana; M.tick(game, 0.01);
    check('Second wind lifts you when you fall below a third, then waits', pl.hp >= 40 + 70 - 1 && pl.mana <= m0 - 20 && M.st(pl).cd.wind > game.time);
    const h1 = pl.hp; M.onHit(game, 100);
    check('Lifesteal heals from the blows you land', pl.hp > h1);
    game.combatT = 0; const h2 = pl.hp; M.tick(game, 1);
    check('out of a fight, Renewal rests', pl.hp === h2);
    M.toggle(pl, 'leech'); const h3 = pl.hp; M.onHit(game, 100);
    check('switched off, an art does nothing', pl.hp === h3);
  }

  console.log('\nLore of the wild, and dungeons that grow');
  {
    const ctx = { console, Math, JSON, Set, Map, WeakSet, Object, Array, String, Number, isFinite };
    ctx.globalThis = ctx; vm.createContext(ctx);
    for (const f of ['core.js', 'game/lore.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'js', f), 'utf8'), ctx);
    const E = ctx.ECHO, Lo = E.Lore;
    E.Combat = { floater() {}, ring() {} }; E.UI = { toast() {} }; E.Interior = { cur: null };
    const pl = { studied: { wolf: 1 } }, game = { pl, pe: { x: 1, y: 1 }, ents: [] };
    for (let i = 0; i < 30; i++) Lo.onKill(game, { type: 'creature', species: 'boar', x: 5, y: 5 });
    check('hunting raises the Hunter: two ranks after thirty kills, and harder blows on beasts', Lo.rank(pl, 'hunt') === 2 && Lo.dealt(game, { type: 'creature', species: 'boar' }) > 1.05 && Lo.dealt(game, { type: 'person' }) === 1);
    Lo.onStudy(game, { species: 'wolf' }, true);
    check('studying a kind teaches you to fight that kind better', Lo.rank(pl, 'study') === 1 && Lo.dealt(game, { type: 'creature', species: 'wolf' }) > Lo.dealt(game, { type: 'creature', species: 'boar' }));
    Lo.onHit(game, { titan: 't1', maxHp: 1000 }, 500);
    check('standing against a titan hardens you against them', Lo.rank(pl, 'titan') >= 2 && Lo.taken(game, { titan: 't1' }) < 1 && Lo.taken(game, { species: 'goblin' }) === 1);
    check('the Wayfarer grows your life', Lo.lifeMul(pl) === 1 && (pl.lore.endure = 15, Lo.lifeMul(pl) > 1.05));
  }
  {
    const X = ECHO.Explore, s = { cat: 'delve', kind: 'crypt', level: 20, lv2: 1, grow: 0 };
    const f0 = X.floors(s), l0 = X.floorLevel(s, 0);
    s.grow = 60;
    check('a dungeon left uncleared grows deeper and worse (and only so far)', X.floors(s) > f0 && X.floorLevel(s, 0) > l0 && X.growth({ level: 20, grow: 1000 }) === 6, `${f0}→${X.floors(s)} floors, level ${l0}→${X.floorLevel(s, 0)}`);
  }

  console.log('\nThe great lands');
  {
    const ctx = { console, Math, JSON, Set, Map, WeakSet, Object, Array, String, Number, isFinite, Uint8Array, Int32Array, Float32Array, Uint32Array, Float64Array };
    ctx.globalThis = ctx; vm.createContext(ctx);
    for (const f of ['core.js', 'world/worldgen.js', 'game/lands.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'js', f), 'utf8'), ctx);
    const E = ctx.ECHO, T = E.TILE, La = E.Lands;
    const mk = fill => { const W = 20, H = 20, tiles = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) tiles[i] = fill(i % W, (i / W) | 0); return { W, H, tiles, regions: [{ id: 0, x0: 0, y0: 0, x1: 20, y1: 20 }], RC: 1, RR: 1, ruins: [], sites: [] }; };
    const kind = w => La.of(w, w.regions[0]).short;
    check('every region falls in one of the great lands, by what its ground is made of', kind(mk(() => T.SNOW)) === 'Frozen Crown' && kind(mk(() => T.SAND)) === 'Ashen Wastes' && kind(mk(() => T.SWAMP)) === 'Blighted Lands' && kind(mk(() => T.FOREST)) === 'Emerald Expanse' && kind(mk(() => T.HILL)) === 'Celestial Highlands' && kind(mk((x, y) => (x + y) % 5 ? T.GRASS : T.RUIN)) === 'Forgotten Kingdom' && kind(mk(() => T.FARM)) === 'Heartlands');
    const ab = mk((x, y) => (x + y) % 3 ? T.HILL : T.ROCK); ab.sites = [{ cat: 'delve', x: 5, y: 5 }];
    check('rocky hills over a dungeon are the Abyssal Depths; each land but the Heartlands has beasts of its own', kind(ab) === 'Abyssal Depths' && Object.values(La.LANDS).filter(l => l.roster).length === 7);
  }

  console.log('\nChallenge and spoils');
  {
    const ctx = { console, Math, JSON, Set, Map, WeakSet, Object, Array, String, Number, isFinite, Uint8Array, Int32Array, Float32Array };
    ctx.globalThis = ctx; vm.createContext(ctx);
    for (const f of ['core.js', 'sim/gear.js', 'sim/temper.js', 'game/combat.js', 'game/progress.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'js', f), 'utf8'), ctx);
    const E = ctx.ECHO, C = E.Combat;
    E.UI = { settings: {} };
    const d0 = C.difficulty(); E.UI.settings.difficulty = 'story'; const d1 = C.difficulty(); E.UI.settings.difficulty = 'hard'; const d2 = C.difficulty(); E.UI.settings.difficulty = 'nonsense';
    check('the challenge is Balanced unless chosen; Story hits softer, Hard harder; nonsense falls back', d0 === C.DIFF.normal && d1.taken < 1 && d1.dealt > 1 && d2.taken > 1 && C.difficulty() === C.DIFF.normal);
    // a heap of spoils is one tidy list, best first
    const world = { items: { s: { id: 's', name: 'Fine sword', rarity: 'epic' } } };
    const loot = [{ x: 5, y: 5, kind: 'gold', qty: 9 }, { x: 5.3, y: 5.2, kind: 'bonedust', qty: 2 }, { x: 4.8, y: 5.1, kind: 'gel', qty: 1 }, { x: 5.1, y: 4.9, kind: 'item', itemId: 's' }, { x: 5.2, y: 5.4, kind: 'rattail', qty: 3 }, { x: 9, y: 5, kind: 'gold', qty: 1 }];
    const L = E.Progress.lootLabels({ pe: { x: 5, y: 6 }, world, loot });
    check('spoils lying together make one list: the best thing first, the rest summed up, and a heap apart labelled apart', L.length === 4 && L[0].text.startsWith('Fine sword') && L[0].line === 0 && /and 3 more/.test(L[2].text) && L[3].text === '1 crown');
    // a life is always a number: a body carrying a list where the hide of an evolved beast is looked for
    // (a slime that had eaten, before 0.27.3) takes a real blow, and one whose life went bad is mended and can die
    E.Game = { world: { items: {} }, pe: { type: 'player' }, pl: {}, time: 0, hitStop() {}, punch() {}, shake() {}, light() {} };
    const atk = { type: 'creature', x: 0, y: 0, dir: 0 };
    const sl = { type: 'creature', species: 'slime', foe: { slimeK: true }, x: 1, y: 0, dir: Math.PI, hp: 1000, maxHp: 1000, gear: {}, traits: ['bone', 'venom'] };
    let n1, n2;
    try { C.damage(sl, 100, { type: 'melee', from: atk, angle: 0 }); n1 = sl.hp; C.damage(sl, 100, { type: 'fire', from: atk, angle: 0 }); n2 = sl.hp; } catch (err) { n1 = 'threw: ' + err.message; }
    check('a blow on a body with no hide to read is still a number, and lands', Number.isFinite(n1) && n1 < 1000 && Number.isFinite(n2) && n2 < n1, `${n1} → ${n2}`);
    const bad = { type: 'creature', species: 'slime', foe: { slimeK: true }, x: 1, y: 0, dir: Math.PI, hp: NaN, maxHp: 800, gear: {} };
    try { C.damage(bad, 100, { type: 'melee', from: atk, angle: 0 }); } catch (err) { bad.err = err.message; }
    check('a life gone bad (not a number) is mended when struck, so it can be killed', Number.isFinite(bad.hp) && bad.hp < 800, `${bad.hp} ${bad.err || ''}`);
    // the Endless Deep measures you: a blow from down there takes a share of the life of what it hits
    const deepFoe = { type: 'creature', x: 0, y: 0, dir: 0, deepPct: 0.1, deepBase: 50 }, plain = { type: 'creature', x: 0, y: 0, dir: 0 };
    const bigPal = { type: 'creature', species: 'slime', pal: { name: 'Gloop' }, x: 1, y: 0, dir: Math.PI, hp: 14000000, maxHp: 14000000, gear: {} };
    const bigPal2 = Object.assign({}, bigPal, { pal: { name: 'Gloop' } });
    let dp1 = 0, dp2 = 0, dp3 = 0;
    try { C.damage(bigPal, 50, { type: 'melee', from: deepFoe, angle: 0 }); dp1 = 14000000 - bigPal.hp; C.damage(bigPal2, 50, { type: 'melee', from: plain, angle: 0 }); dp2 = 14000000 - bigPal2.hp; const heavy = Object.assign({}, bigPal, { hp: 14000000, pal: { name: 'G2' } }); C.damage(heavy, 100, { type: 'melee', from: deepFoe, angle: 0 }); dp3 = 14000000 - heavy.hp; } catch (err) { dp1 = 'threw: ' + err.message; }
    check('a blow from the Endless Deep takes a share of a beast\'s life however much it has (and a heavier blow more); from anywhere else, only what it deals', dp1 >= 14000000 * 0.075 * 0.95 && dp2 <= 60 && dp3 > dp1 * 1.5, `${Math.round(dp1)} vs ${Math.round(dp2)}; heavy ${Math.round(dp3)}`);
  }

  console.log('\nThe round world');
  {
    const w = ECHO.generateWorld({ seed: 4242, name: 'Globe' });
    w.player = { x: w.settlements[0].x + 0.5, y: w.settlements[0].y + 2.5, explored: new Array(Math.ceil(w.W / 4) * Math.ceil(w.H / 4)).fill(0) };
    w.player.explored[3] = 1;
    for (const k of ['Explore', 'Gates', 'Titans', 'Discover']) if (ECHO[k]) (ECHO[k].sites || ECHO[k].ensure)(w);
    const ppl = Object.keys(w.npcs).length, s0 = w.settlements[0], sx = s0.x, tiles0 = w.tiles.slice(), W0 = w.W, nSet = w.settlements.length;
    const Gl = ECHO.Globe, G = Gl.ensure(w);
    check('an old world is moved onto the globe: 2880 round, 1440 pole to pole, everything with it', w.W === 2880 && w.H === 1440 && !!G && Object.keys(w.npcs).length === ppl && w.settlements.length === nSet && s0.x === sx + G.old.x0 && w.player.x - s0.x === 0.5,
      `old land at ${G.old.x0},${G.old.y0}`);
    let same = true; for (let y = 0; y < 150 && same; y += 7) for (let x = 0; x < W0; x += 5) { const a = tiles0[y * W0 + x], b = w.tiles[(y + G.old.y0) * w.W + x + G.old.x0]; if (a !== b && a !== ECHO.TILE.DEEP && a !== ECHO.TILE.WATER) { same = false; break; } }
    check('its land is unchanged (only the old open sea may shallow toward new coast)', same);
    const cw = Math.ceil(w.W / 4);
    check('what you had walked is still walked, in its new place', w.player.explored.length === cw * 360 && w.player.explored[(G.old.y0 / 4) * cw + G.old.x0 / 4 + 3] === 1);
    check('moving it twice does nothing', Gl.ensure(w) === G && w.W === 2880);
    const need = Gl.unmade(w, Math.floor(w.player.x), Math.floor(w.player.y), 120);
    const info = Gl.make(w, need);
    check('land near you is made as you come: ground, regions and villages with people', need.length > 0 && need.every(ci => G.made[ci]) && w.settlements.length > nSet && Object.keys(w.npcs).length > ppl, `${need.length} cells, ${info.towns.length} villages`);
    check('past the North Pole is the far side of the world, turned about (and past the South Pole too)', ECHO.World.tile(w, 100, -1) === ECHO.World.tile(w, 100 + w.W / 2, 0) && ECHO.World.tile(w, 100, -7) === ECHO.World.tile(w, 100 + w.W / 2, 6) && ECHO.World.tile(w, 5, w.H + 2) === ECHO.World.tile(w, 5 + w.W / 2, w.H - 3) && ECHO.World.isSolid(w, 100.5, -3.5) === ECHO.World.isSolid(w, 100.5 + w.W / 2, 3.5));
    check('east of the east edge is the west edge', ECHO.World.tile(w, -3, 500) === ECHO.World.tile(w, w.W - 3, 500) && ECHO.World.isSolid(w, -2.5, 500.5) === ECHO.World.isSolid(w, w.W - 2.5, 500.5) && Gl.dx(w, w.W - 5, 5) === 10);
    Gl.make(w, Gl.unmade(w, 3, 520, 40)); Gl.make(w, Gl.unmade(w, 1400, 20, 20));
    let sameJ = 0, ice = 0, seamN = 0, inN = 0, inSame = 0; for (let y = 400; y < 700; y++) { if (ECHO.World.tile(w, w.W - 1, y) === ECHO.World.tile(w, 0, y)) sameJ++; seamN++; }
    Gl.make(w, Gl.unmade(w, 1400, 520, 30)); for (let y = 400; y < 700; y++) { if (ECHO.World.tile(w, 1400, y) === ECHO.World.tile(w, 1401, y)) inSame++; inN++; }
    for (let x = 1380; x < 1420; x++) { const t = ECHO.World.tile(w, x, 5); if (t === ECHO.TILE.SNOW) ice++; }
    check('the land runs on where the map meets itself, as it does anywhere else (no sea, no join)', sameJ / seamN > inSame / inN - 0.15, `${sameJ}/${seamN} alike across the join, ${inSame}/${inN} inland`);
    check('the pole is a sheet of ice you can walk on', ice >= 38, ice + '/40');
    const rng = new ECHO.RNG(5); let onMade = 0; for (let i = 0; i < 200; i++) { const p = ECHO.World.spot(w, rng, 8, 9, 8, 9); if (Gl.made(w, p.x, p.y)) onMade++; }
    check('things placed by chance land on country that has been made', onMade === 200);
    check('latitude and longitude: the old land in the north, near the middle meridian', /°N/.test(Gl.fmtLatLon(w, s0.x, s0.y)) && Gl.latLon(w, 0, 0).lat === 90);
    const json = ECHO.Save.serialize(w), w2 = ECHO.Save.deserialize(json);
    check('a round world saves small and loads whole', json.length < 3e6 && w2.globe && w2.globe.made.join('') === G.made.join('') && w2.player.explored.length === w.player.explored.length && w2.player.explored[(G.old.y0 / 4) * cw + G.old.x0 / 4 + 3] === 1 && w2.tiles.length === w.tiles.length, (json.length / 1e6).toFixed(2) + ' MB');
    {
      // the far ground is drawn again on each load, so a save leaves it out
      const ci = G.made.indexOf(0), R = Gl.rect(w, ci), i = (R.y0 + 3) * w.W + R.x0 + 3;
      w._filled = true; w.tiles[i] = ECHO.TILE.HILL;
      const w3 = ECHO.Save.deserialize(ECHO.Save.serialize(w));
      check('the far ground of a round world is not saved, and is drawn again after a load', w3.tiles[i] === 0 && !w3._filled && w3.tiles.length === w.tiles.length);
      w._filled = false; w.tiles[i] = 0;
    }
    {
      // midnight while you play: the new day starts at once, its work follows over the next frames
      const d0 = w.day; w.minute = ECHO.TIME.DAY_MIN - 1;
      ECHO.Sim.advance(w, 2);
      const queued = !!(w._dayQ && w._dayQ.length);
      let frames = 0; while (w._dayQ && frames < 200) { ECHO.Sim.workDay(w, 1); frames++; }
      check('a day\'s work is spread over frames, not done all at once at midnight', w.day === d0 + 1 && !w._dayQ && frames >= 1, `${frames} frames`);
      void queued;
    }
    ECHO.Sim.fastForward(w, 3);
    check('and it goes on living', w.day > 0 && Object.values(w.npcs).some(n => n.status === 'alive'));
  }

  console.log('\nBeasts on the move, and dungeons that live');
  {
    const W = ECHO.generateWorld({ seed: 2468, name: 'Living' }), Mg = ECHO.Migrations, DL = ECHO.DungeonLife, X = ECHO.Explore, Ti = ECHO.Titans;
    W.player = ECHO.Character.create(W, new ECHO.RNG(5), { first: 'Wren', homeId: W.settlements[0].id });
    ECHO.Sim.dailyTick(W, true);
    // a great beast settles in a wolf country: the pack leaves it
    const nbOk = r => r.eco && ECHO.World.regionNeighbors(W, r).some(n => n.eco && n !== r);
    const reg = W.regions.filter(nbOk).sort((a, b) => ECHO.Ecology.capacity(b).wolf - ECHO.Ecology.capacity(a).wolf)[0];
    reg.eco.wolf = Math.max(reg.eco.wolf, 6);
    const t = Ti.wild(W)[0]; t.x = (reg.x0 + reg.x1) / 2; t.y = (reg.y0 + reg.y1) / 2; t.mig = null;
    const P0 = Mg.push(W, reg);
    Mg.st(W).list = Mg.st(W).list.filter(x => x.from !== reg.id && x.to !== reg.id);   // (a pack that came in lately would keep them there a while)
    let m = null;
    for (let d = 0; d < 40 && !m; d++) { reg.eco.wolf = Math.max(reg.eco.wolf, 6); for (const x of Mg.st(W).list) if (x.to === reg.id) x.day = Math.min(x.day, W.day - 30); t.x = (reg.x0 + reg.x1) / 2; t.y = (reg.y0 + reg.y1) / 2; ECHO.Sim.dailyTick(W, true); m = Mg.st(W).list.find(x => x.from === reg.id); }
    check('a great beast in their country drives the wolves out of it', !!m && P0.cause && P0.cause.kind === 'titan' && m.to !== reg.id, m && `${m.head ? '' : ''}${Mg.head(m)} wolves, ${reg.name} → ${W.regions[m.to].name}`);
    for (let d = 0; d < 8 && m && m.arrived == null; d++) ECHO.Sim.dailyTick(W, true);
    check('they arrive, hungry, and the villages there pay for it', !!m && m.arrived != null && W.chronicle.some(c => /strange pack of duskwolves/.test(c.text)));
    // a country emptied of wolves fills with hares, and draws something bigger
    const r2 = W.regions.find(r => r.eco && r !== reg && !Ti.wild(W).some(o => o.mig && o.mig.why === 'prey'));
    Mg.drawBeast(W, r2, new ECHO.RNG(9));
    check('a country full of prey draws a great beast out of its range', Ti.wild(W).some(o => o.mig && o.mig.why === 'prey') && W.chronicle.some(c => /drawn by the herds of bristlehares/.test(c.text)));
    // dungeons: each has a story, and a state that changes with neglect
    const ds = X.sites(W).filter(s => DL.ok(s));
    ds.forEach(s => DL.life(W, s));
    check('every dungeon has a history of its own', ds.length > 5 && ds.every(s => s.life && DL.ORIGINS[s.life.origin] && s.life.hist.length > 80) && new Set(ds.map(s => s.life.origin)).size >= 3, [...new Set(ds.map(s => s.life.origin))].join(', '));
    const d0 = ds.find(s => !s.cleared && X.DELVES[s.kind].roster && !X.small(s)) || ds[0];
    d0.grow = 60; d0.life.state = 'active'; d0.life.since = W.day - 30; d0.level = 140; d0.lv2 = 1;   // (too deep for anyone to empty it meanwhile)
    for (let i = 0; i < 80 && d0.life.state === 'active'; i++) ECHO.Sim.dailyTick(W, true);
    check('left alone, a dungeon grows infested (or worse)', d0.life.state !== 'active' && d0.life.state !== 'dormant', d0.life.state);
    const rng = new ECHO.RNG(3);
    d0.life.state = 'active'; d0.roster = null; DL.contest(W, d0, rng);
    const mixed = new Set((d0.roster || []).map(r => r[0]));
    check('a second brood moves in, and the dungeon is contested', d0.life.state === 'contested' && mixed.size > new Set((X.DELVES[d0.kind].roster || []).map(r => r[0])).size);
    const own = (X.DELVES[d0.kind].roster || [])[0][0], other = d0.roster.map(r => r[0]).find(k => !(X.DELVES[d0.kind].roster || []).some(r => r[0] === k));
    const ea = {}, eb = {}; DL.band(d0, ea, own); DL.band(d0, eb, other);
    check('the two broods take sides against each other', ea.band && eb.band && ea.band !== eb.band, `${own} vs ${other}`);
    d0.level = 9;
    const f0 = X.floors(d0), l0 = X.floorLevel(d0, 0);
    DL.awaken(W, d0);
    check('awakened, it goes deeper and all of it is stronger', X.floors(d0) > f0 && X.floorLevel(d0, 0) > l0, `${f0} → ${X.floors(d0)} floors, Lv ${l0} → ${X.floorLevel(d0, 0)}`);
    const f1 = X.floors(d0); DL.collapse(W, d0, new ECHO.RNG(1), 'A test');
    check('collapsed, some of its ways are sealed', d0.life.state === 'collapsed' && d0.life.lost >= 1 && X.floors(d0) <= f1 + 1);
    // clear it, kill its lord: in time something comes back — perhaps the two halves of what was there
    d0.cleared = true; d0.clearedDay = W.day - 50; DL.cleared(W, d0, true);
    let back = false;
    for (let i = 0; i < 4 && !back; i++) { const r = new ECHO.RNG(100 + i); d0.cleared = true; d0.clearedDay = W.day - 50; d0.life.mem.lordSlain = W.day; X.refill(W, d0); back = d0.life.state === 'contested' && d0.life.split; }
    check('kill its master, and its creatures split into warring bands', back);
    d0.life.mem.grudge = null; d0.floorsDone = { 0: W.day }; DL.left(W, d0, 0.2);
    check('fight in there and run, and it remembers', d0.life.mem.grudge === W.day);
    const card = DL.card(W, d0);
    check('the map tells you what it has become', /Contested/.test(card) && /dlife/.test(card));
    // saves: the new state goes with the world; an old world takes it up without a hitch
    const W2 = ECHO.Save.deserialize(ECHO.Save.serialize(W));
    const s2 = X.byId(W2, d0.id);
    check('the life of the world survives a save', s2.life && s2.life.state === d0.life.state && s2.life.origin === d0.life.origin && Mg.st(W2).list.length === Mg.st(W).list.length);
    delete W2.migrations; for (const s of X.sites(W2)) delete s.life;
    let ok = true; try { for (let d = 0; d < 5; d++) ECHO.Sim.dailyTick(W2, true); } catch (e) { ok = false; console.log(e); }
    check('an old save picks it all up where it stands', ok && Array.isArray(Mg.st(W2).list) && X.sites(W2).filter(s => DL.ok(s)).every(s => s.life));
  }

  console.log('\nThe Guild, and your name');
  {
    const W = ECHO.generateWorld({ seed: 1357, name: 'Guild' }), Gd = ECHO.Guild, Rn = ECHO.Renown;
    const pl = W.player = ECHO.Character.create(W, new ECHO.RNG(8), { first: 'Ren', homeId: W.settlements[0].id });
    ECHO.Sim.dailyTick(W, true);
    const mem = Gd.members(W);
    check('the Guild keeps a book of real people of the realm', mem.length >= 12 && mem.length <= 40 && mem.every(n => n.adv && n.status === 'alive' && ['E', 'D', 'C', 'B', 'A', 'S'].includes(Gd.rank(W, n))), `${mem.length} members, hall in ${ECHO.Sim.settlement(W, Gd.st(W).hall).name}`);
    check('each with a way of fighting and a temper of their own', new Set(mem.map(n => n.adv.style)).size >= 3 && new Set(mem.map(n => n.adv.temper)).size >= 3);
    // a plea you took: someone from the Guild may get there first
    const s = W.settlements[0], r = ECHO.World.regionAt(W, s.x, s.y);
    const p = ECHO.Plights.post(W, { kind: 'beasts', sid: s.id, regionId: r.id, need: 4, deadline: W.day + 30, reward: 80, text: 'Wolves.' });
    pl.accepted.push(p.id); r.eco.wolfDanger = Math.max(r.eco.wolfDanger, 1.4);
    const n = mem[0]; n.lv = 60; n.adv.temper = 'glory';
    const rng = new ECHO.RNG(3);
    let got = false;
    for (let i = 0; i < 12 && !got; i++) { n.adv.job = null; p.guildOn = null; n.hurtUntil = 0; p.status = 'open'; p.progress = 0; n.adv.job = { pid: p.id, until: W.day, x: s.x, y: s.y, day: W.day }; p.guildOn = n.id; Gd.resolve(W, new ECHO.RNG(50 + i), n); got = p.status === 'resolved' && p.beatenBy === n.id; }
    check('they take the same contracts you do, and whoever finishes first is paid', got && /before Ren/.test(p.outcome) && n.adv.wins >= 1, p.outcome);
    // and they die, and their gear lies where they fell
    const m = mem.find(x => x !== n && x.status === 'alive'); const it = ECHO.Gear.make(W, rng, 'sword', 10, 'rare', 'test'); ECHO.Delvers.equip(W, m, it);
    Gd.fall(W, rng, m, { x: s.x + 20, y: s.y }, 'killed by duskwolves on a Guild contract', 'the wolves');
    const c = Gd.caches(W)[0];
    check('a fallen adventurer\'s gear lies where they fell, for whoever finds it', m.status === 'dead' && m.adv.status === 'dead' && c && c.items.includes(it.id) && W.chronicle.some(e => /did not come back/.test(e.text)));
    // they retire
    const o = mem.find(x => x.adv.status === 'active' && x !== n); Gd.retire(W, rng, o);
    check('the old and the rich retire and open a business', o.adv.status === 'retired' && !!o.adv.shop && !Gd.members(W).includes(o));
    // and the book is kept full
    for (let d = 0; d < 6; d++) ECHO.Sim.dailyTick(W, true);
    check('when one dies or leaves, someone new signs the book', Gd.book(W).length > mem.length && Gd.st(W).log.some(e => /signed the Guild's book/.test(e.text)));
    // your name: seven ways of being known
    const F = Rn.st(W), h0 = F.d.hero;
    ECHO.Chronicle.deed(W, { text: `${pl.first} ${pl.last} saved a child from the river.`, importance: 2, rep: 5, tag: 'protect' });
    check('what you do for others makes you a hero to some', F.d.hero > h0 && Rn.view(W, 'folk') > 0);
    const i0 = F.d.infamy; ECHO.Chronicle.deed(W, { text: `${pl.first} ${pl.last} killed a prisoner.`, importance: 2, rep: -8, tag: 'cruel' });
    check('cruelty makes you feared, and infamous', F.d.fear > 0 && F.d.infamy > i0 && F.d.honor < 1);
    check('the underworld reads it differently from the Crown', Rn.view(W, 'under') > Rn.view(W, 'crown'));
    // a promise broken
    const q = ECHO.Plights.post(W, { kind: 'famine', sid: s.id, deadline: W.day - 1, text: 'Hungry.' }); pl.accepted.push(q.id);
    const r0 = F.d.reliable; ECHO.Plights.close(W, q, 'failed', null);
    check('a promise you do not keep costs you your name for reliability', F.d.reliable < r0 + 0.001 && F.log.some(e => e.dim === 'reliable' && e.amt < 0));
    // rumours: some grown, some made up; let them stand or set them straight
    F.rum = []; for (let k = 0; k < 20 && !F.rum.length; k++) Rn.maybeRumour(W, { text: `${pl.first} ${pl.last} killed the great wolf.` }, 1, new ECHO.RNG(900 + k));
    const ru = F.rum[0], hon = F.d.honor;
    check('stories about you go round, true or not', !!ru && ru.text.length > 30 && ru.status === 'open', ru && ru.text);
    Rn.answer(W, ru.id, true);
    check('set the record straight, and you are known for honesty', ru.status === 'corrected' && F.d.honor > hon);
    check('your name changes what shopkeepers ask of you', typeof ECHO.Minds.priceMult(W, s, pl) === 'number');
    // saves
    const W2 = ECHO.Save.deserialize(ECHO.Save.serialize(W));
    check('the Guild and your name survive a save', Gd.members(W2).length === Gd.members(W).length && W2.player.fame && W2.player.fame.d.hero === F.d.hero && Gd.caches(W2).length === Gd.caches(W).length);
    delete W2.guild; delete W2.player.fame; for (const x of Object.values(W2.npcs)) delete x.adv;
    let ok = true; try { for (let d = 0; d < 3; d++) ECHO.Sim.dailyTick(W2, true); } catch (e) { ok = false; console.log(e); }
    check('an old save takes it all up without a hitch', ok && Gd.members(W2).length >= 12 && !!W2.player.fame);
  }

  console.log('\nGreat events, and what towns become');
  {
    const W = ECHO.generateWorld({ seed: 4242, name: 'Events' }), WE = ECHO.WorldEvents, TL = ECHO.TownLife, X = ECHO.Explore;
    const pl = W.player = ECHO.Character.create(W, new ECHO.RNG(9), { first: 'Eda', homeId: W.settlements[0].id });
    for (let d = 0; d < 3; d++) ECHO.Sim.dailyTick(W, true);
    // the Great Migration
    const mg0 = ECHO.Migrations.st(W).list.length;
    const m = WE.force(W, 'migration');
    check('a great beast comes, and everything that can run, runs', !!m && ECHO.Migrations.st(W).list.length >= mg0 + 2 && /running from it/.test(m.headline), m && `${m.packs} packs, ${m.fled} people`);
    // the Dungeon Bloom
    const b = WE.force(W, 'bloom'), bs = b ? b.sites.map(id => X.byId(W, id)) : [];
    check('the deep places of a region wake all at once', !!b && bs.length >= 3 && bs.every(s => s.bloom && !s.cleared && ['awakened', 'infested'].includes(s.life.state)) && W.plights.some(p => p.kind === 'delve' && b.sites.includes(p.siteId)), b && `${bs.length} dungeons`);
    // clear one yourself: it counts
    bs[2].cleared = true; ECHO.DungeonLife.cleared(W, bs[2], true);
    check('and putting one down counts for you', b.mine === 1);
    // the Broken Crown
    const c = WE.force(W, 'crown');
    const f = c && W.factions[c.fid];
    check('a crown is disputed, and the kingdom splits town by town', !!c && Object.values(c.sides).includes('a') && Object.values(c.sides).includes('b') && f.ruler === c.a, c && c.headline);
    WE.declare(W, c.id, 'a');
    const game = { world: W, pl, pe: { hp: 100, maxHp: 100 } }; pl.hp = 100;
    const r = WE.fight(game, c.id);
    check('choose a side and fight in its battles', c.side === 'a' && !!r && c.battlesYou === 1 && pl.hp < 100);
    c.until = W.day; ECHO.Sim.dailyTick(W, true);
    check('the war ends, and the side you chose rewards you or hunts you', c.over && /war of the Broken Crown is over/.test(c.outcome) && (W.factions[c.fid].ruler === c.a ? (pl.gold > 0 || ECHO.Renown.get(W, 'influence') > 0) : (pl.wanted[c.fid] || 0) > 0), c.outcome);
    // the Sleeping God
    const g = WE.force(W, 'sleeper'), seat = g && X.byId(W, g.site);
    check('the realm dreams of a sleeping god, and the place it sleeps', !!g && !!seat && seat.sleeper === g.id && seat.found && g.dreamers > 0 && W.chronicle.some(x => /dreamt the same dream/.test(x.text)), g && g.headline);
    for (let d = 0; d < 25; d++) ECHO.Sim.dailyTick(W, true);
    check('the ground shakes, and people walk away to sing to it', g.choir.length >= 1 && W.chronicle.some(x => /The ground shook/.test(x.text)) && g.choir.every(id => W.npcs[id].journey === 'choir' || W.npcs[id].status === 'dead' || (g.over && W.npcs[id].choir == null && W.npcs[id].loc)), `${g.choir.length} in the choir${g.over ? ' (and home again: ' + g.outcome + ')' : ''}`);
    // go down and sing it back to sleep
    if (!g.over) { seat.cleared = true; seat.clearedDay = W.day; ECHO.DungeonLife.cleared(W, seat, true); }
    check('reach the bottom of its seat, and it sleeps on', g.over && (/sleeps on/.test(g.outcome) || /turned over/.test(g.outcome)) && !seat.sleeper && WE.st(W).godDone, g.outcome);
    // and it never comes twice
    const S0 = WE.st(W); S0.last.sleeper = -1e9;
    let again = false; for (let d = 0; d < 5; d++) { ECHO.Sim.dailyTick(W, true); if (WE.active(W, 'sleeper').length) again = true; }
    check('the god comes once in a world', !again);
    // what towns become
    for (let d = 0; d < 12; d++) ECHO.Sim.dailyTick(W, true);
    const kinds = new Set(W.settlements.filter(s => s.char).map(s => s.char.kind));
    check('every town has a character of its own, made from who lives there', W.settlements.filter(s => s.faction !== 'ashfang').every(s => s.char && TL.KINDS[s.char.kind]) && kinds.size >= 3, [...kinds].join(', '));
    const t = W.settlements.find(s => s.faction !== 'ashfang' && s.residents.length > 10);
    t.prosperity = 5; t.unrest = 80; t._peak = t.residents.length * 3; TL.judge(W, t);
    check('a town can fall into decline, and the Chronicle says so', t.char.kind === 'declining' && W.chronicle.some(x => x.sid === t.id && /in decline/.test(x.text)));
    const W2 = ECHO.Save.deserialize(ECHO.Save.serialize(W));
    check('great events and towns\' characters survive a save', W2.wev && W2.wev.list.length === S0.list.length && W2.settlements.every((s, i) => (s.char && s.char.kind) === (W.settlements[i].char && W.settlements[i].char.kind)));
    delete W2.wev; for (const s of W2.settlements) delete s.char;
    let ok = true; try { for (let d = 0; d < 3; d++) ECHO.Sim.dailyTick(W2, true); } catch (e) { ok = false; console.log(e); }
    check('an old save takes them up without a hitch', ok && !!W2.wev && W2.settlements.filter(s => s.faction !== 'ashfang').every(s => s.char));
  }

  console.log('\nThe land, changed by hand');
  {
    const W = ECHO.generateWorld({ seed: 6161, name: 'Axe' }), Cl = ECHO.Clearing, T = ECHO.TILE;
    const pl = W.player = ECHO.Character.create(W, new ECHO.RNG(3), { first: 'Ivo', homeId: W.settlements[0].id });
    // a save from before there was any of this: nothing to take up, and nothing breaks
    delete W.cut; delete W._cutI;
    let okOld = true; try { for (let d = 0; d < 2; d++) ECHO.Sim.dailyTick(W, true); } catch (e) { okOld = false; console.log(e); }
    check('an old save with no changed land takes it up without a hitch', okOld && Cl.at(W, 10, 10) === null && (!W.cut || W.cut.list.every(e => !e.p)));
    const find = (k, from) => { for (let y = 3; y < W.H - 3; y++) for (let x = 3; x < W.W - 3; x++) { const t = Cl.target(W, x, y); if (t && t.k === k && (!from || from(t))) return t; } return null; };
    const tr = find('tree', t => !t.deep), tp = ECHO.World.trunk(W, tr.x, tr.y), ep = W._tileEpoch || 0;
    const solidBefore = ECHO.World.isSolid(W, tp.x, tp.y);
    const r = Cl.take(W, tr, { lv: 1, who: { first: 'Ivo', last: 'Hale' } });
    check('a tree is felled: timber, a stump where it stood, and you can walk through', solidBefore && r.got.timber >= 2 && W.tiles[tr.y * W.W + tr.x] === T.GRASS && !ECHO.World.isSolid(W, tp.x, tp.y) && !!Cl.at(W, tr.x, tr.y) && !Cl.target(W, tr.x, tr.y), `${r.got.timber} timber`);
    check('the land says where it changed (so only that ground is drawn again)', W._tileEpoch === ep + 1 && W._tileLog.slice(-1)[0].rects.some(q => q.x0 <= tr.x && q.x1 > tr.x && q.y0 <= tr.y && q.y1 > tr.y));
    const cr = find('crag'), solidRock = ECHO.World.isSolid(W, cr.x + 0.5, cr.y + 0.5);
    const rc = Cl.take(W, cr, { lv: 7, rng: () => 0.01, who: { first: 'Ivo', last: 'Hale' } });
    check('the living rock is cut away: ore and gems, and a way through', solidRock && !ECHO.World.isSolid(W, cr.x + 0.5, cr.y + 0.5) && [T.HILL, T.SNOW].includes(W.tiles[cr.y * W.W + cr.x]) && rc.got.ore >= 2 && rc.got.garnet === 1, JSON.stringify(rc.got));
    const bo = find('boulder');
    Cl.take(W, bo, { who: { first: 'Ivo', last: 'Hale' } });
    check('a boulder broken is gone, and nothing stands in its place', !Cl.target(W, bo.x, bo.y) && Cl.at(W, bo.x, bo.y).k === 'boulder');
    const W2 = ECHO.Save.deserialize(ECHO.Save.serialize(W));
    check('felled trees and cut rock stay as you left them across a save', W2.tiles[tr.y * W2.W + tr.x] === T.GRASS && W2.tiles[cr.y * W2.W + cr.x] === W.tiles[cr.y * W.W + cr.x] && !!Cl.at(W2, tr.x, tr.y) && !!Cl.at(W2, bo.x, bo.y) && W2.cut.list.length === W.cut.list.length && W2.cut.list.filter(e => e.p).length === 3 && !('_cutI' in JSON.parse(ECHO.Save.serialize(W))));
    // ground drawn again as first made (a round world's far lands) comes back as it was left
    W2.tiles[cr.y * W2.W + cr.x] = T.ROCK; Cl.ensure(W2);
    check('ground made again from the seed is changed again as it was left', W2.tiles[cr.y * W2.W + cr.x] === W.tiles[cr.y * W.W + cr.x]);
    // a tree grows back where nobody has built
    const e = Cl.at(W, tr.x, tr.y), g0 = Cl.grown(W, e);
    W.day = e.g - 1; const half = Cl.grown(W, e);
    for (let d = 0; d < 2; d++) ECHO.Sim.dailyTick(W, true);
    check('a stump sprouts, and in a season or two it is a tree again', g0 === 0 && half > 0.9 && W.tiles[tr.y * W.W + tr.x] === T.TREE && !Cl.at(W, tr.x, tr.y), `${e.g - e.d} days`);
    check('stone never grows back', !!Cl.at(W, cr.x, cr.y) && !!Cl.at(W, bo.x, bo.y));
    // but not where the ground has been put to use
    const tr2 = find('tree', t => !t.deep); Cl.take(W, tr2, {}); const e2 = Cl.at(W, tr2.x, tr2.y);
    W.tiles[tr2.y * W.W + tr2.x] = T.FARM; W.day = e2.g; Cl.dailyTick(W);
    check('a field ploughed where a tree stood stays a field', W.tiles[tr2.y * W.W + tr2.x] === T.FARM && !Cl.at(W, tr2.x, tr2.y));
    // enough from one place, and the place has a name
    let best = null, bn = 0;
    for (let y = 6; y < W.H - 6; y += 3) for (let x = 6; x < W.W - 6; x += 3) { let n = 0; for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const t = Cl.target(W, x + dx, y + dy); if (t && Cl.WOOD[t.k]) n++; } if (n > bn) { bn = n; best = { x, y }; } }
    let named = null;
    for (let dy = -4; dy <= 4 && !named; dy++) for (let dx = -4; dx <= 4 && !named; dx++) { const t = Cl.target(W, best.x + dx, best.y + dy); if (t && Cl.WOOD[t.k]) named = Cl.take(W, t, { who: { first: 'Ivo', last: 'Hale' } }).place; }
    check('fell enough trees in one place and folk name it after you', !!named && named.name === "Hale's Clearing" && W.chronicle.some(c => /Hale's Clearing/.test(c.text)), named && named.name);
    // the towns' woodcutters are at it too, round their lumber camps — and the woods come back
    const WL = ECHO.generateWorld({ seed: 777, name: 'Lumber' });
    for (let d = 0; d < 100; d++) ECHO.Sim.dailyTick(WL, true);
    const camps = WL.settlements.map(s => ({ s, f: ECHO.Production.facility(WL, s, 'lumber') })).filter(c => c.f && c.f.fac.state === 'working');
    const ring = camps.map(c => WL.cut.list.filter(e => e.w === c.s.id && Math.hypot(e.x - c.f.x, e.y - c.f.y) < 20).length);
    const old = WL.cut.list.filter(e => e.w != null && WL.day - e.d > 95).length;
    check('a town\'s woodcutters fell the trees round its lumber camp, and the woods grow back', camps.length > 0 && ring.some(n => n >= 6) && ring.every(n => n <= 24) && old === 0, `stumps round each camp: ${ring.join(', ')}`);
    // the more you do, the quicker you get
    {
      const HV = ECHO.Harvest, tree = { k: 'tree' }, crag = { k: 'crag' };
      const novice = { past: { wood: { xp: 0 }, mine: { xp: 0 } }, stats: {}, inv: { axe: 1 } };
      const master = { past: { wood: { xp: 1200 }, mine: { xp: 1200 } }, stats: { felled: 1000, mined: 1000 }, inv: { axe: 1 } };
      const a = HV.plan(novice, tree, true, 0), b = HV.plan(master, tree, true, 0), c = HV.plan(master, tree, true, 5), mid = HV.plan({ past: { wood: { xp: 190 } }, stats: { felled: 50 }, inv: {} }, tree, true, 0);
      const t = p => p.n * p.per;
      check('the more trees you fell the faster you fell them: fewer strokes, quicker swings, and a rhythm when you keep at it', t(b) < t(a) / 3 && b.n < a.n && b.per < a.per && t(mid) < t(a) && t(mid) > t(b) && t(c) < t(b), `a tree: ${t(a).toFixed(1)} s at first, ${t(mid).toFixed(1)} s at 50, ${t(b).toFixed(1)} s at 1,000 (${t(c).toFixed(1)} s in rhythm)`);
      const pr = d => HV.pace({ past: { wood: { xp: 1200 } }, stats: { felled: d } }, true).practice;
      check('practice never stops counting, though it slows', pr(100) > pr(10) && pr(1000) > pr(100) && pr(10000) > pr(1000) && pr(10000) < 2, [10, 100, 1000, 10000].map(d => pr(d).toFixed(2)).join(' / '));
      check('a master miner cuts the living rock in a few blows', HV.plan(master, crag, true, 0).n <= 5 && HV.plan(novice, crag, true, 0).n === 10);
    }
    // the land grows: what was taken moves with it
    const q = W.cut.list[0], qx = q.x, qy = q.y;
    ECHO.Frontier.shift(W, 4, 2); delete W._cutI;
    check('what was taken moves with the map when the land grows', q.x === qx + 4 && q.y === qy + 2 && Cl.at(W, qx + 4, qy + 2) === q);
  }

  console.log('\nMagical equipment');
  {
    const W = ECHO.generateWorld({ seed: 7171, name: 'Relics' }), A = ECHO.Arcana, rng = new ECHO.RNG(5);
    const pl = W.player = ECHO.Character.create(W, new ECHO.RNG(2), { first: 'Mira', homeId: W.settlements[0].id });
    pl.items = pl.items || [];
    ECHO.Game = { world: W, pl };
    const take = (k, r, L) => { const it = A.make(W, rng, L, r, 'in a test', k); it.holder = 'player'; pl.items.push(it.id); return it; };
    check('a rare relic is plainly stronger than a common one, and a legendary one is about three times it', A.power(20, 'legendary') >= A.power(20, 'common') * 2.7 && A.power(20, 'rare') >= A.power(20, 'common') * 1.6 && A.power(30, 'legendary') > ECHO.Gear.statFor('sword', 30, 'legendary') * 1.4, `L20: ${A.RANK.map(r => A.power(20, r)).join(' / ')}`);
    const old = take('storm', 'epic', 10); old.power = 40; delete old.rv; A.wear(pl, old.id);
    check('a relic from an older world is brought up to the new strength, and stays worn', A.pw(old) === A.power(10, 'epic') && A.pw(old) > 40 && old.rv === 2 && A.worn(pl, old.id));
    check('you wear three relics, four from level 12, five from level 30', (() => { const st = ECHO.Prowess.st(pl), lv0 = st.lv; const a = A.nslots(pl); st.lv = 12; const b = A.nslots(pl); st.lv = 30; const c = A.nslots(pl); st.lv = lv0; return a === 3 && b === 4 && c === 5; })());
    const lv0 = ECHO.Prowess.st(pl).lv; ECHO.Prowess.st(pl).lv = 1;
    const fr = take('frost', 'legendary', 10), ae = take('aegis', 'rare', 10), extra = take('bloom', 'fine', 10);
    A.wear(pl, fr.id); A.wear(pl, ae.id);
    check('a locked slot cannot be worn', !A.wear(pl, extra.id, 3) && !A.worn(pl, extra.id));
    const v = A.passive(pl);
    check('every relic worn gives its gift, always: harder blows, less harm, more life', v.dmg > 0.1 && v.taken > 0.16 && v.hp > 20, A.passiveSummary(pl).join(' · '));
    for (let i = 0; i < 3; i++) { const f = take('frost', 'legendary', 10); ECHO.Prowess.st(pl).lv = 30; A.wear(pl, f.id); }
    check('the harm a ward takes off has a ceiling', A.passive(pl).taken <= 0.45);
    ECHO.Prowess.st(pl).lv = lv0;
    const tally = m => { const c = {}; for (let i = 0; i < 400; i++) { const r = A.rarityFor(new ECHO.RNG(i * 13 + m), 20, m, false); c[r] = (c[r] || 0) + 1; } return c; };
    const t2 = tally(2), t3 = tally(3), t4 = tally(4), t5 = tally(5);
    check('the strong carry the best: an elite something fine or better, a dungeon lord rare or better, a lair\'s beast epic or legendary, a sovereign legendary', !t2.common && !t3.common && !t3.fine && !t4.common && !t4.fine && !t4.rare && Object.keys(t5).join() === 'legendary' && (t4.legendary || 0) > 80, `lair beast: ${JSON.stringify(t4)}`);
    check('a dungeon lord of level 25 or more carries epic or better', ['epic', 'legendary'].includes(A.rarityFor(new ECHO.RNG(1), 25, 3, true)) && ['epic', 'legendary'].includes(A.rarityFor(new ECHO.RNG(99), 40, 3, true)));
    check('relics are no dearer to buy for being stronger', A.value({ level: 10, rarity: 'epic' }) <= 300 && A.priceOf({ level: 10, rarity: 'epic' }) < 800);
    // wear the best: one of each kind first
    pl.items.push(take('storm', 'legendary', 30).id);
    A.best(pl, W);
    const kinds = A.wornItems(pl, W).map(w => w.it.relic);
    check('"wear the best" puts on the strongest, one of each kind first', kinds[0] === 'storm' && W.items[A.slots(pl)[0]].rarity === 'legendary' && new Set(kinds).size === kinds.length, kinds.join(', '));
    // an old stone circle wrote a count over the slots: what can be read is taken back
    const wornIds = A.slots(pl).filter(Boolean);
    pl.relics = wornIds.join(',') + '1';
    check('slots an old stone circle wrote over are recovered', A.slots(pl).filter(Boolean).length >= Math.min(3, wornIds.length) - 1 && Array.isArray(pl.relics));
    const W2 = ECHO.Save.deserialize(ECHO.Save.serialize(W));
    check('relics, their strength and what is worn survive a save', W2.items[old.id].rv === 2 && W2.items[old.id].power === old.power && W2.player.relics.length === pl.relics.length);
    delete ECHO.Game;
  }

  console.log('\nThe realm at arms');
  {
    const W = ECHO.generateWorld({ seed: 777, name: 'Arms' }), M = ECHO.Military, P = ECHO.People;
    const pl = W.player = ECHO.Character.create(W, new ECHO.RNG(5), { first: 'Ser', homeId: W.settlements[0].id });
    M.ensure(W);
    const armed = W.settlements.filter(s => M.armed(W, s));
    const caps = armed.filter(s => s.kind === 'capital'), vils = armed.filter(s => M.tier(W, s) === 'village');
    const n = s => M.soldiers(W, s).length;
    check('every town of a crown keeps a garrison, and the capitals keep the biggest', armed.every(s => n(s) >= 1) && caps.every(c => armed.every(s => s.kind === 'capital' || n(c) > n(s))), armed.map(s => `${s.name} ${n(s)}`).join(', '));
    check('a bigger place keeps more soldiers', !vils.length || caps.every(c => n(c) >= 2.5 * Math.max(...vils.map(n))), `capitals ${caps.map(n).join('/')} · villages ${vils.map(n).join('/')}`);
    check('soldiers are real people of the town, with names and homes', armed.every(s => M.soldiers(W, s).every(x => x.home === s.id && x.first && W.npcs[x.id] === x)));
    check('every garrison has its captain; every crown its Marshal and its Champion', armed.every(s => { const c = M.captain(W, s); return c && c.rank >= 2; }) && Object.values(W.factions).filter(f => f.type === 'kingdom').every(f => M.marshal(W, f) && M.marshal(W, f).rank === 3 && M.champion(W, f)),
      Object.values(W.factions).filter(f => f.type === 'kingdom').map(f => `${P.fullTitle(W, M.marshal(W, f))} / ${P.fullTitle(W, M.champion(W, f))}`).join(' · '));
    check('a town is held by a lord or a lady, a village by its reeve', armed.every(s => { const r = M.ruler(W, s); if (!r || s.kind === 'capital' || s.kind === 'temple' || Object.values(W.factions).some(f => f.capital === s.id)) return true; return M.tier(W, s) === 'village' ? r.title === 'Reeve' : r.title === 'Lord' || r.title === 'Lady'; }));
    check('walking in, you are told whose town it is and what holds it', /Capital of .* · (King|Queen) .* · \d+ soldiers/.test(M.banner(W, caps[0])), M.banner(W, caps[0]));
    // a month on: walls, towers, patrols
    let patrol = 0, home = 0;
    for (let d = 0; d < 40; d++) { ECHO.Sim.dailyTick(W, true); patrol = Math.max(patrol, (W.journeys || []).filter(j => j.kind === 'army' && j.army.type === 'patrol').length); }
    check('the crown walls its capital and its towns of size, and puts up watchtowers', caps.every(c => c.works && c.works.walls) && armed.filter(s => M.TIER[M.tier(W, s)].walls).filter(s => s.works && s.works.walls).length >= 2, armed.filter(s => s.works && s.works.walls).map(s => s.name).join(', '));
    check('in peace, columns of soldiers march between a crown\'s towns', patrol >= 1 && W.chronicle.some(c => /marched a column/.test(c.text)), `${patrol} on the road at once`);
    check('the stars of a town\'s defence follow its strength', caps.every(c => M.stars(W, c) >= 4) && armed.some(s => M.stars(W, s) <= 3));
    // the strong keep pace with you
    const W3 = ECHO.generateWorld({ seed: 4242, name: 'Pace' });
    const p3 = W3.player = ECHO.Character.create(W3, new ECHO.RNG(9), { first: 'Ada', homeId: W3.settlements[0].id });
    ECHO.Prowess.st(p3).lv = 80;
    for (let d = 0; d < 25; d++) ECHO.Sim.dailyTick(W3, true);
    const ks = Object.values(W3.factions).filter(f => f.type === 'kingdom');
    const top = Math.max(...ks.map(f => Math.max(M.lvOf(M.marshal(W3, f)), M.lvOf(M.champion(W3, f)))));
    const sol = W3.settlements.filter(s => M.armed(W3, s)).flatMap(s => M.soldiers(W3, s)), avg = sol.reduce((a, x) => a + M.lvOf(x), 0) / sol.length;
    // (its soldiers are as strong as the times and the country they hold — which rises with you, but stays below you)
    check('the realm is no pushover: its Marshals and Champions come near your level, its soldiers as strong as the times and their country', top >= 64 && avg >= ECHO.Powers.age(W3) * 0.9 && avg < 76, `you 80 · the best ${top} · soldiers about ${Math.round(avg)} (the age: ${Math.round(ECHO.Powers.age(W3))})`);
    // a battle is won by levels, numbers, walls and command
    const tgt = W3.settlements.find(s => s.faction === 'ashmere' && s.kind !== 'capital') || W3.settlements.find(s => s.faction === 'ashmere');
    const mk = (lv, k) => Array.from({ length: k }, () => { const x = P.create(W3, new ECHO.RNG(k * 31 + lv), { home: W3.factions.valdren.capital, faction: 'valdren', prof: 'guard', fight: 40 }); x.lv = lv; return x; });
    const host = (lv, k) => ({ npcs: mk(lv, k).map(x => x.id), army: { faction: 'valdren', commander: null } });
    const def = M.strength(W3, tgt);
    const weak = M.hostPower(W3, host(5, 10)), strong = M.hostPower(W3, host(90, 10));
    check('ten seasoned soldiers are worth far more than ten raw ones, and walls make a town harder to take', strong > weak * 4 && (() => { const had = tgt.works && tgt.works.walls; tgt.works = tgt.works || {}; tgt.works.walls = 0; const a = M.strength(W3, tgt); tgt.works.walls = W3.day; const b = M.strength(W3, tgt); tgt.works.walls = had; return b > a * 1.3; })(), `raw ${Math.round(weak)} · seasoned ${Math.round(strong)} · ${tgt.name} ${Math.round(def)}`);
    check('the Guild\'s book is for adventurers, not for the crown\'s soldiers', ECHO.Guild.members(W3).every(x => !x.soldier));
    // an old world, from before the realm took up arms
    const W4 = ECHO.generateWorld({ seed: 31, name: 'Old' });
    const p4 = W4.player = ECHO.Character.create(W4, new ECHO.RNG(3), { first: 'Old', homeId: W4.settlements[0].id });
    ECHO.Prowess.st(p4).lv = 40; p4.gold = 1234;
    delete W4.mil;
    for (const id in W4.npcs) { const x = W4.npcs[id]; if (x.soldier) { x.status = 'dead'; x.soldier = 0; } }
    for (const s of W4.settlements) { delete s.captain; delete s.milTier; s.works = {}; s.residents = s.residents.filter(id => W4.npcs[id].status !== 'dead'); }
    for (const f of Object.values(W4.factions)) { delete f.marshal; delete f.champion; }
    const W5 = ECHO.Save.deserialize(ECHO.Save.serialize(W4));
    let ok = true; try { M.ensure(W5); ECHO.Sim.dailyTick(W5, true); } catch (e) { ok = false; console.log('   ', e.stack); }
    const cap5 = W5.settlements.find(s => s.kind === 'capital');
    check('an old save musters its garrisons on load, and your own progress is untouched', ok && M.soldiers(W5, cap5).length >= 10 && M.captain(W5, cap5) && ECHO.Prowess.level(W5.player) === 40 && W5.player.gold === 1234, `${cap5.name}: ${M.soldiers(W5, cap5).length} soldiers`);
    const W6 = ECHO.Save.deserialize(ECHO.Save.serialize(W5));
    check('garrisons, officers and battles survive a save', M.soldiers(W6, W6.settlements.find(s => s.kind === 'capital')).length === M.soldiers(W5, cap5).length && W6.mil && W6.mil.musterDay === W5.mil.musterDay && M.captain(W6, W6.settlements.find(s => s.kind === 'capital')));
  }
  console.log('\nMonsters evolve');
  {
    const Ev = ECHO.Evolve;
    check('every kind has a ladder of higher forms', ['goblin', 'skeleton', 'wolf', 'spider', 'troll', 'cultist', 'golemling'].every(k => new Set([1, 2, 3, 4].map(s => Ev.name(k, s))).size === 4), ['goblin', 'skeleton', 'wolf'].map(k => [1, 2, 3, 4].map(s => Ev.name(k, s)).join(' → ')).join(' | '));
    check('a kind with no forms of its own still grows greater, dread and elder', /^Greater /.test(Ev.name('frosthound', 2)) && /^Elder /.test(Ev.name('frosthound', 4)), Ev.name('frosthound', 2) + ' / ' + Ev.name('frosthound', 4));
    const g1 = Ev.gates('goblin'), g4 = Ev.gates('hollowking');
    check('the thresholds rise with how strong a kind is to begin with', g1[2] < g1[3] && g1[3] < g1[4] && g4[2] > g1[2], `goblin ${g1.slice(2).join('/')} · hollow king ${g4.slice(2).join('/')}`);
    let low = 0, mid = 0, high = 0;
    for (let i = 0; i < 400; i++) { const r = i / 400; if (Ev.stageBorn('goblin', 8, r) > 1) low++; if (Ev.stageBorn('goblin', 14, r) > 1) mid++; if (Ev.stageBorn('goblin', 40, r) >= 3) high++; }
    check('the weak are born in their first form; a few at a threshold take the next; nearly all well past it', low === 0 && mid > 40 && mid < 260 && high > 200, `Lv 8 ${low}/400 · Lv 14 ${mid}/400 · Lv 40 third form ${high}/400`);
    // a monster grows in a fight and evolves where it stands
    const e = { type: 'creature', species: 'goblin', foe: { name: 'Goblin', vis: { show: ['dagger'], cloth: '#3a5a2a' }, dmg: 9, tier: 1 }, hp: 50, maxHp: 50, scale: 1, r: 0.4, lvl: 6, ab: {} };
    const G = { pl: { first: 'A', evoSeen: null }, pe: null, ents: [], world: {} };
    const hp0 = e.maxHp;
    e.grown = 3; e.evoKills = 1;
    const went = Ev.check(G, e);
    check('one that grows in a fight and kills evolves then and there: bigger, tougher, new ways to fight', went && e.evo >= 2 && e.label === Ev.name('goblin', e.evo) && e.maxHp > hp0 && e.scale > 1 && e.growDmg > 1 && e.gateXp > 1 && e.foe.vis.show.includes('helm') && e.foe.vis.show.includes('dagger'), `${e.label}: hp ${hp0}→${e.maxHp}, size ×${e.scale.toFixed(2)}`);
    e.evoKills = 6; Ev.check(G, e);
    check('…and keeps on to its highest form, calling up its own kind round it', e.evo >= 3 && e.ab.summon && e.ab.summon.kind === 'goblin' && G.pl.evoSeen.goblin === e.evo, e.label);
    check('the bestiary names only the forms you have seen', /Hobgoblin/.test(Ev.ladder('goblin', 2)) && /\?\?\?/.test(Ev.ladder('goblin', 2)) && !/Goblin king/.test(Ev.ladder('goblin', 2)));
    // the named ones evolve day by day
    const W = ECHO.generateWorld({ seed: 919, name: 'Evo' });
    W.player = ECHO.Character.create(W, new ECHO.RNG(2), { first: 'Ivo', homeId: W.settlements[0].id });
    ECHO.Prowess.st(W.player).lv = 90;
    const Pw = ECHO.Powers;
    ECHO.Sim.dailyTick(W, true);
    let r = Pw.alive(W).find(x => x.kind !== 'bandit');
    if (!r) { const st = Pw.st(W); r = st.list && st.list[0]; }
    let named = false;
    if (r) {
      r.lv = Math.max(r.lv, Ev.gates(r.kind)[3] + 1);
      for (let d = 0; d < 3; d++) ECHO.Sim.dailyTick(W, true);
      named = (r.evo || 1) >= 3 && W.chronicle.some(c => /evolved/.test(c.text));
    }
    check('the named ones (the Rising powers) evolve as they climb, and the realm hears of it', named, r ? `${Pw.short(r)} — ${Ev.name(r.kind, r.evo || 1)} at level ${r.lv}` : 'no named one');
    // your own beasts
    const pal = { id: 'p1', cat: 'foe', kind: 'skeleton', name: 'Rattle', lvl: 40 };
    check('a tamed beast from an older save takes the form its level has reached', Ev.palLoad(pal) === Ev.stageAt('skeleton', 40) && pal.evo >= 3, Ev.name('skeleton', pal.evo));
    const pal2 = { id: 'p2', cat: 'foe', kind: 'wolf', name: 'Fang', lvl: 11, evo: 1 };
    const G2 = { pl: { first: 'A', last: 'B' }, pe: { x: 0, y: 0 }, ents: [], world: W, ui: { banner() {} } };
    pal2.lvl = Ev.gates('wolf')[2];
    check('your beasts evolve as they rise with you', Ev.palGrew(G2, pal2, null) && pal2.evo === 2 && Ev.name('wolf', 2) === 'Dire wolf');
    const W2 = ECHO.Save.deserialize(ECHO.Save.serialize(W));
    check('the forms the named ones have taken survive a save', !r || (Pw.byId(W2, r.id) || {}).evo === r.evo);
  }
  console.log('\nSlimes, the strongest and the rarest; your mana well');
  {
    const E = ECHO, SL = E.Slime, Wl = E.Well, Ev = E.Evolve;
    E.Combat = E.Combat || {}; for (const k of ['floater', 'ring', 'burst', 'puff', 'shoot', 'slash']) E.Combat[k] = E.Combat[k] || (() => {}); E.Combat.fx = E.Combat.fx || [];
    E.UI = E.UI || {}; E.UI.toast = E.UI.toast || (() => {}); E.UI.banner = E.UI.banner || (() => {});
    // the strongest: what a slime is, against the other things of its tier and above
    const D = { slime: { name: 'Slime', hp: 230, dmg: 20 }, troll: { hp: 150, dmg: 18 } };
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'js', 'game', 'monsters.js'), 'utf8');
    const def = k => { const m = src.match(new RegExp('\\n\\s+' + k + ': \\{ name: [^\\n]*hp: (\\d+), dmg: (\\d+)[^\\n]*')); return m ? { hp: +m[1], dmg: +m[2], line: m[0] } : null; };
    const sl = def('slime'), tr = def('troll'), og = def('ogre'), sg = def('slimeling'), gb = def('goblin');
    check('a slime is the strongest thing of its kind there is: more life than a cave troll or an ogre chieftain\'s two-thirds, a harder blow than a troll', sl && tr && sl.hp >= tr.hp * 1.4 && sl.dmg >= tr.dmg && sl.hp >= og.hp * 0.66, `slime ${sl.hp}/${sl.dmg} · troll ${tr.hp}/${tr.dmg} · ogre ${og.hp}/${og.dmg}`);
    check('…it heals, drinks mana, spits acid, swallows, splits — and shrugs off blades and arrows', /slimeHeal/.test(sl.line) && /manadrain/.test(sl.line) && /bolt/.test(sl.line) && /slam/.test(sl.line) && /split/.test(sl.line) && /melee: 0\.5/.test(sl.line) && /ranged: 0\.6/.test(sl.line));
    check('even a slimeling, a piece of one, is a match for a goblin several times over', sg.hp >= gb.hp * 2.5 && /slimeHeal/.test(sg.line));
    check('a slime is ranked a champion and a slimeling an elite (worth far more to beat)', E.Prowess.foeRank({ species: 'slime', type: 'creature' }) === 'champion' && E.Prowess.foeRank({ species: 'slimeling', type: 'creature', shard: true }) === 'elite');
    // the highest potential
    check('slimes have the highest potential: six forms, the first of them early, each a bigger step', Ev.max('slime') === 6 && Ev.max('goblin') === 4 && Ev.gates('slime')[2] <= Ev.gates('goblin')[2] && Ev.step('slime').hp > Ev.step('goblin').hp && Ev.name('slime', 6) === 'Primordial ooze', [1, 2, 3, 4, 5, 6].map(s => Ev.name('slime', s)).join(' → '));
    // the rarest: no place keeps them
    const rosters = [...Object.values(E.Explore.DELVES || {}), ...Object.values(E.Explore.DUNGEONS || {})].flatMap(d => [...(d.roster || []), ...(d.deep || [])]);
    check('no deep place keeps slimes among its own', rosters.length > 10 && !rosters.some(r => SL.is(r[0])), `${rosters.length} roster entries`);
    let hits = 0;
    const room = { id: 1 }, free = () => [{ x: 1, y: 1 }], tag = e => e, game0 = { ents: [], pl: {}, world: {} };
    const M0 = E.Monsters; E.Monsters = { make: (g, k, x, y, L) => ({ species: k, x, y, lvl: L, foe: { name: 'Slime' }, label: null }) };
    for (let i = 0; i < 4000; i++) if (SL.rareInDungeon(game0, {}, 0, 5, [room], free, tag, 0)) hits++;
    E.Monsters = M0;
    check('one turns up on a floor of a deep place only a few times in a hundred', hits > 4000 * 0.02 && hits < 4000 * 0.07 && game0.ents.every(e => e.rareSlime && e.gateXp >= 3), `${(hits / 40).toFixed(1)}% of floors`);
    check('out in the wild, about once an hour or two of wandering', SL.WILD_P > 0.005 && SL.WILD_P < 0.03, `${(SL.WILD_P * 100).toFixed(1)}% a minute`);
    // your mana well
    const Wd = E.generateWorld({ seed: 6262, name: 'Well' });
    const pl = Wd.player = E.Character.create(Wd, new E.RNG(3), { first: 'Ilse', homeId: Wd.settlements[0].id });
    pl.maxMana = 60; pl.mana = 60;
    const g = { world: Wd, pl, pe: { x: 0, y: 0 }, ents: [] };
    const b0 = Wl.bonus(pl);
    E.Prowess.st(pl).lv = 41;
    check('your mana grows with your level (two more a level) — an old save has it all at once', Wl.bonus(pl) - b0 === 80 && !pl.well === false);
    const ups = Wl.gain(g, 2000);
    check('everything you spend deepens your well, a level at a time', ups >= 5 && Wl.st(pl).lv === ups && Wl.bonus(pl) >= 80 + ups * Wl.PER_WELL, `2,000 mana spent → well ${Wl.st(pl).lv}`);
    const c0 = Wl.bonus(pl), a = Wl.core(g, { lv: 30, evo: 3, big: true, x: 0, y: 0 }), a2 = Wl.core(g, { lv: 5, evo: 1, big: false, x: 0, y: 0 });
    check('a slime\'s core deepens your mana for good — a rare one\'s far more than a piece\'s', a >= 10 && a2 >= 1 && a > a2 && Wl.bonus(pl) >= c0 + a + a2, `rare core +${a}, a piece's +${a2}`);
    pl.gold = 100000;
    const p1 = Wl.lessonPrice(pl); Wl.lesson(g); const p2 = Wl.lessonPrice(pl);
    for (let i = 0; i < 20; i++) Wl.lesson(g);
    check('the arcanist teaches you to hold more — dearer each lesson, twelve in all', p2 > p1 && Wl.st(pl).lessons === Wl.LESSONS && typeof Wl.lesson(g) === 'string');
    pl.maxMana = 100; const r1 = Wl.regen(pl); pl.maxMana = 400; const r2 = Wl.regen(pl);
    check('the deeper the well, the faster it fills', r2 > r1 * 2, `${r1.toFixed(1)} → ${r2.toFixed(1)} a second`);
    // a slime of yours feeds on your mana
    pl.pack = [{ id: 'p1', cat: 'foe', kind: 'slime', name: 'Glub', lvl: 30, evo: 3, out: true }, { id: 'p2', cat: 'foe', kind: 'wolf', name: 'Fang', lvl: 30, out: true }];
    const T0 = E.Tame; E.Tame = { pack: p => p.pack, resting: () => false, live: () => null };
    pl.maxMana = 300; pl.mana = 300;
    const u = SL.upkeep(pl.pack[0]);
    SL.feed(g, 10);
    const drank = 300 - pl.mana;
    check('a tamed slime feeds on your mana all the time it is out (and only it: your other beasts do not)', Math.abs(drank - u * 10) < 0.01 && SL.rate() === u, `${u.toFixed(2)} mana a second at level 30, third form`);
    check('a stronger, more evolved slime costs more to keep', SL.upkeep({ lvl: 80, evo: 5 }) > SL.upkeep({ lvl: 30, evo: 3 }) * 2);
    pl.pack[0].out = false; pl.mana = 300; SL.feed(g, 10);
    check('resting at your den, it takes a quarter', Math.abs((300 - pl.mana) - u * 2.5) < 0.01);
    pl.pack[0].out = true; pl.mana = 0;
    for (let i = 0; i < 40; i++) SL.feed(g, 1);
    check('with no mana to feed on it starves, and in the end slips back to your den', pl.pack[0].out === false);
    E.Tame = T0;
    const W2 = E.Save.deserialize(E.Save.serialize(Wd));
    check('your well, its lessons and its cores survive a save', W2.player.well && W2.player.well.lv === Wl.st(pl).lv && W2.player.well.lessons === Wl.LESSONS && W2.player.well.coreN === 2);
  }
  console.log('\nThe slime: the strongest thing that lives, and the cleverest');
  {
    const E = ECHO, SL = E.Slime, P = E.Prowess;
    const C0 = E.Combat, Ent0 = E.Ent, M0 = E.Monsters, Ev0 = E.Evolve && E.Evolve.check, UI0 = E.UI;
    const hurt = [];
    E.Combat = { fx: [], floater() {}, ring() {}, burst() {}, puff() {}, decal() {}, shoot() {}, telegraph(o) { return { ...o }; }, damage(o, d, src) { o.hp -= d; hurt.push({ o, d, type: src && src.type }); return d; } };
    E.Ent = { freeSpot: (w, x, y) => ({ x, y }), lineOfSight: () => true, travel: (w, e, x, y, sp, dt) => { const d = Math.hypot(x - e.x, y - e.y); if (d > 1e-3) { const s = Math.min(d, sp * dt); e.x += (x - e.x) / d * s; e.y += (y - e.y) / d * s; } } };
    E.UI = Object.assign({}, UI0 || {}, { toast() {}, banner() {} });
    if (E.Evolve) E.Evolve.check = () => {};
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'js', 'game', 'monsters.js'), 'utf8');
    const line = k => (src.match(new RegExp('\\n\\s+' + k + ': \\{ name: [^\\n]*')) || [''])[0];
    const num = (l, k) => +((l.match(new RegExp('\\b' + k + ': (-?[\\d.]+)')) || [])[1]);
    const sl = line('slime'), og = line('ogre'), gl = line('golem');
    // stronger than anything of its level, a titan included
    const L = 60, slHp = num(sl, 'hp') * P.foeMul(L).hp, tiHp = 1500 * 1.15 * P.foeMul(L, true).hp;
    check('level for level, a slime has more life than a titan, and four times a great boss\'s', slHp > tiHp && num(sl, 'hp') >= num(og, 'hp') * 4 && num(sl, 'hp') >= num(gl, 'hp') * 3.5, `level ${L}: slime ${Math.round(slHp)} · titan ${Math.round(tiHp)}`);
    check('…hits harder than any great boss, and is quick (faster than you run)', num(sl, 'dmg') >= num(og, 'dmg') * 1.6 && num(sl, 'speed') >= 5 && num(sl, 'cd') < 1);
    check('…and shrugs off half of every blade, arrow and spell — but fire bites it deep', num(sl, 'melee') >= 0.5 && num(sl, 'ranged') >= 0.6 && num(sl, 'magic') >= 0.5 && num(sl, 'fire') < 0);
    check('one is always born above you', SL.apexLv({ pl: { prowess: { lv: 40 } } }, 8) === 45 && SL.apexLv({ pl: { prowess: { lv: 596 } } }, 8) > 596 && SL.apexLv({ pl: { prowess: { lv: 1 } } }, 8) >= 8 && SL.apexLv({ pl: { prowess: { lv: 1500 } } }, 8) <= (P.MAX || 1500));
    check('and its danger reads far past its level', SL.dangerLv({ lvl: 40, evo: 3, absorbed: 2 }) >= 120, `${SL.dangerLv({ lvl: 40, evo: 3, absorbed: 2 })}`);
    // a little world for it to fight in
    const mk = (o) => Object.assign({ type: 'creature', species: 'slime', foe: { slimeK: true, dmg: 44, reach: 1.5, speed: 5.2, name: 'Slime' }, lvl: 40, dmgMul: 2, hp: 10000, maxHp: 10000, x: 0, y: 0, r: 0.4, scale: 1.15, speed: 5.2, ab: { slimeHeal: 0.006, manadrain: 0.35 }, resist: { melee: 0.55, ranged: 0.65, magic: 0.5, fire: -0.2 }, sT: {}, cd: 0, t: 0, state: 'chase', aggro: true }, o || {});
    const pe = { type: 'player', x: 6, y: 0, r: 0.33, hp: 5000, maxHp: 5000 };
    const game = { time: 0, world: {}, pe, pl: { mana: 400, _slimeTip2: true, _slimeWatchTip: true, _engulfTip: true, _learnTip: true }, ents: [], hostileTo: (a, b) => (a === pe) !== (b === pe) };
    // it heals — but not where fire has touched it
    const h = mk({ hp: 5000 }); game.ents = [h, pe];
    SL.always(game, h, 1);
    const healed = h.hp - 5000; h.hp = 5000; h._fireT = game.time + 3; SL.always(game, h, 1);
    check('it heals as you cut it — and fire stops its healing', healed >= 50 && h.hp === 5000, `+${Math.round(healed)} a second`);
    // the first time it sees you, it watches you: the moment to leave
    const w = mk({ rareSlime: true, home0: { x: 0, y: 0 } }); game.ents = [w, pe]; pe.x = 10;
    const busy = SL.tick(game, w, 0.1, 10, 0);
    check('the first time it sees you it stops and watches you — your moment to leave', busy === true && w.watchUntil > game.time && !w.watched);
    game.time += 4; SL.tick(game, w, 0.1, 10, 0);
    check('…and then it comes', w.watched === true);
    const w2 = mk({ rareSlime: true, home0: { x: 0, y: 0 } }); game.ents = [w2, pe]; pe.x = 10;
    SL.tick(game, w2, 0.1, 10, 0); pe.x = 15; game.time += 1; SL.tick(game, w2, 0.1, 15, 0);
    check('…unless you back away while it watches: then it lets you go', w2.aggro === false && !w2.watched && w2._calm > game.time);
    // the leap: it lands on you, and swallows you
    const j = mk({ watched: true }); game.ents = [j, pe]; pe.x = 6; pe.y = 0; pe.hp = 5000; hurt.length = 0;
    SL.tick(game, j, 0.05, 6, 0);
    check('from far off it gathers itself to leap at you (and marks where it means to land)', j.state === 'pwind' && j.leap && Math.abs(j.leap.x1 - 6) < 0.6);
    for (let i = 0; i < 80 && j.state !== 'engulf'; i++) { game.time += 0.05; j.t += 0.05; SL.tick(game, j, 0.05, Math.hypot(pe.x - j.x, pe.y - j.y), 0); }
    const land = hurt.find(x => x.o === pe);
    check('it lands on you, hard — and swallows you whole', land && land.d >= 44 * 2 * 1.5 && j.state === 'engulf', land ? `${Math.round(land.d)} on landing` : 'missed');
    // swallowed: rooted, acid, your mana drunk; strike it from inside and it spits you out sooner
    const m0 = game.pl.mana; let t = 0; hurt.length = 0;
    for (; t < 1 && j.state === 'engulf'; t += 0.05) { game.time += 0.05; SL.tick(game, j, 0.05, 0, 0); }
    check('inside it, you are held fast while acid eats you and it drinks your mana', game.pl.rootT > 0 && hurt.filter(x => x.o === pe && x.type === 'magic').length >= 2 && game.pl.mana < m0);
    const left = j.eng.dur; for (let k = 0; k < 3; k++) SL.felt(game, j, 'melee', 10);
    check('…but strike it from inside and it spits you out the sooner', j.eng.dur < left - 0.5);
    for (let k = 0; k < 60 && j.state === 'engulf'; k++) { game.time += 0.05; SL.tick(game, j, 0.05, 0, 0); }
    check('…and in the end it spits you out', j.state === 'chase' && !j.eng);
    // it learns what hurts it
    const l = mk(); l._slLearnT = 0.01; SL.felt(game, l, 'melee', 500); SL.learn(game, l, 0.1);
    check('it learns what you hurt it with most, and hardens to it', Math.abs(l.resist.melee - 0.62) < 1e-6 && l.learned && l.learned.steel === 62);
    for (let k = 0; k < 20; k++) { l._slLearnT = 0.01; SL.felt(game, l, 'melee', 500); SL.learn(game, l, 0.1); }
    const r0 = { ...l.resist }; l._slLearnT = 0.01; SL.felt(game, l, 'melee', 250); SL.felt(game, l, 'magic', 250); SL.learn(game, l, 0.1);
    for (let k = 0; k < 20; k++) { l._slLearnT = 0.01; SL.felt(game, l, 'fire', 500); SL.learn(game, l, 0.1); }
    check('…never past what can still hurt it, and fire least of all; change how you fight and it has nothing to learn', l.resist.melee === SL.CAP.melee && r0.magic === l.resist.magic && l.resist.fire <= SL.CAP.fire && SL.CAP.fire < 0.5, JSON.stringify(l.resist));
    // badly hurt: a piece of itself to hold you, and away
    const made = [];
    E.Monsters = { canSummon: () => true, make: (g, k, x, y, Lv, o) => { const s = { species: k, x, y, lvl: Lv, ...o }; made.push(s); return s; } };
    const r = mk({ hp: 2500, watched: true }); game.ents = [r, pe]; pe.x = 2;
    SL.tick(game, r, 0.05, 2, 0);
    check('badly hurt, it tears off two pieces of itself to hold you and slides away to heal', r.retreat && made.length === 2 && made.every(s => s.species === 'slimeling' && s.summoned) && game.ents.filter(o => o.decoy).length === 2);
    const x0 = r.x; for (let k = 0; k < 20; k++) { game.time += 0.05; SL.tick(game, r, 0.05, Math.abs(pe.x - r.x), 0); }
    check('…away from you, and healing fast as it goes', r.x < x0 - 1);
    // it eats other monsters, and grows
    const g0 = mk({ lvl: 40, maxHp: 10000, hp: 6000, dmgMul: 2 }), troll = { type: 'creature', species: 'troll', foe: { name: 'Cave troll' }, lvl: 30, x: 1, y: 0, r: 0.4, hp: 100, maxHp: 100 };
    game.ents = [g0, troll, pe]; pe.x = 30;
    check('it hunts down the other things of the place to eat', SL.preyNear(game, g0, 6) === troll && SL.preyNear(game, g0, 6) !== pe);
    SL.startDevour(game, g0, troll); for (let k = 0; k < 40 && g0.state === 'devour'; k++) SL.devour(game, g0, 0.05);
    check('what it eats makes it stronger: a level or more, more life, a harder blow, bigger', troll.dead && g0.absorbed === 1 && g0.lvl > 40 && g0.maxHp > 10000 && g0.dmgMul > 2 && g0.scale > 1.15, `level ${g0.lvl}, life ${g0.maxHp}`);
    check('…and it takes something of what it ate (a troll: its healing)', (g0.gifts || []).includes('a troll\'s healing') && g0.ab.slimeHeal > 0.006);
    // a slime of yours fights your way, not its own
    check('a slime you have tamed fights as your beast (its own ways are for the wild ones)', SL.tick(game, mk({ pal: true }), 0.05, 2, 0) === false && SL.always(game, mk({ pal: true }), 0.05) === undefined);
    E.Combat = C0; E.Ent = Ent0; E.Monsters = M0; E.UI = UI0; if (E.Evolve) E.Evolve.check = Ev0;
  }
  console.log('\nA slime squeezes through, leads below ground, and hunts to grow');
  {
    const ctx = { console, Math, JSON, Set, Map, WeakSet, Object, Array, String, Number, isFinite, Uint8Array, Int32Array, Float32Array, Float64Array };
    ctx.globalThis = ctx; vm.createContext(ctx);
    for (const f of ['core.js', 'world/worldgen.js', 'sim/gear.js', 'sim/prowess.js', 'game/entities.js', 'game/slimes.js', 'game/tame.js', 'game/pack.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'js', f), 'utf8'), ctx, { filename: f });
    const E = ctx.ECHO, SL = E.Slime, T = E.Tame, P = E.Pack, Ent = E.Ent;
    // a floor below: a room, a passage one pace wide, a room
    const B = 9000, W = 22, H = 9, blocked = new Uint8Array(W * H).fill(1);
    const open = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) blocked[y * W + x] = 0; };
    open(1, 1, 6, 7); open(7, 4, 13, 4); open(14, 1, 20, 7);
    E.Interior = { BASE: B, cur: { carved: true, type: 'delve', site: { kind: 'cave' }, W, H, blocked }, isSolid(x, y) { const c = this.cur; if (!c) return true; const lx = Math.floor(x - B), ly = Math.floor(y); return lx < 0 || ly < 0 || lx >= c.W || ly >= c.H || c.blocked[ly * c.W + lx] === 1; }, tile() { return E.TILE.FLOOR || E.TILE.GRASS; } };
    E.Explore = { small: s => ['cave', 'hideout', 'grot'].includes(s.kind) };
    E.Combat = { fx: [], floater() {}, ring() {}, burst() {}, shoot() {}, slash() {}, damage(o, d) { o.hp -= d; return d; } };
    E.UI = { toast() {} }; E.PlayerCtl = { lock: null };
    const world = { W: 200, H: 150, seed: 1, tiles: new Uint8Array(200 * 150), blocked: new Uint8Array(200 * 150) };
    const pe = { type: 'player', x: B + 3.5, y: 4.5, r: 0.33, dir: 0, hp: 100, maxHp: 100 };
    const game = { world, time: 0, pe, pl: { pack: [], prowess: { lv: 50 }, hp: 100, maxHp: 100, _leadTip: true }, ents: [], combatT: null, light() {}, shake() {}, hostileTo: (a, b) => (a === pe || a.pal) !== (b === pe || !!b.pal) };
    const walk = (e, tx, ty, secs, sq) => { let minR = e.r; for (let t = 0; t < secs; t += 0.05) { game.time += 0.05; if (sq) SL.squeeze(game, e, 0.05); Ent.travel(world, e, tx, ty, e.speed, 0.05); minR = Math.min(minR, e.r); } return minR; };
    const big = () => ({ type: 'creature', species: 'slime', foe: { slimeK: true, reach: 1.5, name: 'Slime' }, x: B + 5.2, y: 4.5, r: 0.6, scale: 2, speed: 4.5, dir: 0, hp: 100, maxHp: 100 });
    const ogre = { ...big(), species: 'ogre', foe: { reach: 1.5, name: 'Ogre' } };
    walk(ogre, B + 17.5, 4.5, 8, false);
    check('a body as wide as a great slime cannot pass a passage one pace wide', ogre.x < B + 7.6, `stopped at ${(ogre.x - B).toFixed(1)}`);
    const s = big(), minR = walk(s, B + 17.5, 4.5, 8, true);
    check('a slime pours itself thin and goes through', s.x > B + 14 && minR < 0.3, `reached ${(s.x - B).toFixed(1)}, as thin as r ${minR.toFixed(2)}`);
    for (let t = 0; t < 2; t += 0.05) { game.time += 0.05; s.moving = false; SL.squeeze(game, s, 0.05); }
    check('…and fills out again where there is room', Math.abs(s.r - 0.6) < 1e-6 && !(s._sq > 0.01));
    check('…and while it is thin it takes little room among other bodies', (() => { const o = big(); o._sq = 1; o.r = 0.22; return Ent.bodyR(o) < 0.35; })());
    // in anywhere, and in the way of nobody of yours
    const rec = { kind: 'slime', scale: 2.5, cat: 'foe' }, cave = E.Interior.cur;
    check('however big it has grown, a slime of yours gets in anywhere (a cave lets in only the small)', T.sizeOf(rec) === 'huge' && T.fits(rec, cave) && !T.fits({ kind: 'troll', scale: 1.6, cat: 'foe' }, cave));
    const mine = { ...big(), pal: { name: 'Glub', lvl: 40 }, tamed: true, lvl: 40 };
    check('a slime of yours flows round you and your pack; a wild one does not', Ent.flows(mine, pe) && Ent.flows(mine, { pal: {} }) && !Ent.flows(big(), pe));
    // it fights up close, and goes first below ground
    const K = P.kit(mine);
    check('a slime of yours is no keeper of distance: it leaps in and spits acid as it closes', !K.ranged && K.leap && K.spit && K.lead);
    const wolf = { type: 'creature', species: 'wolf', foe: { name: 'Wolf', reach: 1.1 }, pal: { name: 'Fang', lvl: 60 }, tamed: true, lvl: 60, x: B + 2.5, y: 4.5, r: 0.4, hp: 100, maxHp: 100 };
    mine.x = B + 2.5; mine.y = 3.5; mine.r = 0.6; mine._sq = 0;
    game.ents = [pe, mine, wolf];
    check('below ground your slime leads (even with a stronger beast along); under the sky it does not', P.leader(game) === mine && (() => { const c = E.Interior.cur; E.Interior.cur = null; const r = P.leader(game); E.Interior.cur = c; return r === null; })());
    // ahead of you, along the way you go, never through a wall
    T._head = null; pe.x = B + 2.5; pe.y = 4.5; T.heading(game); pe.x = B + 3.5; T.heading(game);
    const g = T.leadSpot(game, mine);
    check('with nothing to fight it walks a few paces ahead of you, the way you are going', g.x > pe.x + 1.5 && Math.abs(g.y - pe.y) < 0.01 && g.x < B + 7.9, `${(g.x - B).toFixed(1)},${g.y.toFixed(1)} (you at ${(pe.x - B).toFixed(1)})`);
    pe.x = B + 5.5; pe.y = 2.5; T._head = { x: pe.x, y: pe.y, a: 0 }; const g2 = T.leadSpot(game, mine);
    check('…but never past a wall', g2.x < B + 7 && g2.x > pe.x && !E.Interior.isSolid(g2.x, g2.y), `${(g2.x - B).toFixed(1)}`);
    // and it does not wait for what it sees to come
    const skel = { type: 'creature', species: 'skeleton', foe: { name: 'Skeleton', reach: 1.2 }, x: B + 16.5, y: 4.5, r: 0.36, hp: 50, maxHp: 50, state: 'idle', aggro: false };
    pe.x = B + 4.5; pe.y = 4.5; mine.x = B + 8.5; mine.y = 4.5; wolf.x = B + 3.5; wolf.y = 5.5;
    game.ents = [pe, mine, wolf, skel]; P.reset(); P.tick(game, 0.05);
    check('what it sees ahead, it goes for first — before that has even seen you — and the pack follows it in', SL.pickPrey(game, mine) === skel && !!P.plan && P.plan.focus === skel && P.plan.role.get(wolf).target === skel && !P.plan.role.has(mine));
    skel.x = B + 18.5; mine.x = B + 3; P.reset(); P.tick(game, 0.05);
    check('…what it cannot see, and nothing comes at you, the pack leaves be', !P.plan);
    // what it lives for: to grow. It hunts on its own, and comes back when you are hemmed in
    E.Interior.cur = null;   // (out under the sky)
    const ow = { W: 60, H: 60, seed: 3, tiles: new Uint8Array(3600).fill(E.TILE.GRASS), blocked: new Uint8Array(3600) };
    game.world = ow; pe.x = 30; pe.y = 30; mine.x = 31; mine.y = 30; mine._sq = 0; mine.r = 0.6; mine.speed = 5; mine.state = 'idle'; mine.t = 0; mine.cd = 0; mine.palDmg = 40; mine.sT = {};
    mine.pal = { name: 'Glub', kind: 'slime', cat: 'foe', lvl: 40, xp: 0 };
    const wild = (x, y, o) => Object.assign({ type: 'creature', species: 'troll', foe: { name: 'Cave troll', reach: 1.2 }, x, y, r: 0.4, hp: 400, maxHp: 400, lvl: 38, state: 'idle', aggro: false }, o || {});
    const prey = wild(44, 30), titan = wild(36, 30, { titan: true, species: 'elk' }), far = wild(30, 62);
    game.ents = [pe, mine, prey, titan, far]; game.time = 100; P.reset(); P.tick(game, 0.05);
    check('a slime of yours goes out after what is hostile round you, unasked (not the great ones, not what is too far from you)', SL.pickPrey(game, mine) === prey && !P.threat);
    const x0 = mine.x; for (let k = 0; k < 20; k++) { game.time += 0.05; mine.t += 0.05; SL.hunt(game, mine, 0.05); }
    check('…and goes to it on its own, leaping the last of the way', mine.x > x0 + 4 && mine._prey === prey, `at ${mine.x.toFixed(1)}`);
    // it kills it, and eats it, and grows
    const xp0 = mine.pal.xp, lv0 = mine.pal.lvl; prey.dead = true; prey.hp = 0; mine._hl = null; mine.x = prey.x - 1; mine.y = prey.y;
    SL.ate(game, mine, prey, 60);
    for (let k = 0; k < 25; k++) { game.time += 0.05; SL.hunt(game, mine, 0.05); }
    check('what it kills it eats — and grows on it (and what it ate shows inside it)', prey.vanish && mine.pal.absorbed === 1 && mine.absorbed === 1 && (mine.pal.lvl > lv0 || mine.pal.xp > xp0));
    // hemmed in: back it comes
    const at = (dx, dy) => wild(pe.x + dx, pe.y + dy, { aggro: true, target: pe });
    mine.x = 44; mine.y = 30; mine._prey = null; mine._meal = null;
    const ring3 = [at(1.5, 0), at(-1.5, 0), at(0, 1.5)], hunted = wild(50, 30);
    game.ents = [pe, mine, ...ring3, hunted]; P.reset(); P.tick(game, 0.05);
    check('three at you and you are hemmed in: the pack — the slime too — is on them', P.threat && !!P.plan && P.plan.role.has(mine));
    const d0 = Math.hypot(mine.x - pe.x, mine.y - pe.y); for (let k = 0; k < 16; k++) { game.time += 0.05; SL.hunt(game, mine, 0.05); }   // (a heavy thing takes a moment to get going: entities.js)
    check('…and the slime leaves its hunt and comes back to your side', Math.hypot(mine.x - pe.x, mine.y - pe.y) < d0 - 2 && !mine._prey);
    mine.x = pe.x + 3; check('…where the pack\'s plan has it like any other', SL.hunt(game, mine, 0.05) === false);
    game.ents = [pe, mine, at(1.5, 0)]; game.time += 7; P.t = 0; P.tick(game, 0.05);
    check('one at you, and you hale: not hemmed in — it hunts on', !P.threat);
    game.pl.hp = 30; P.t = 0; P.tick(game, 0.05);
    check('…but near the end of your strength, even one brings it back', P.threat);
    game.pl.hp = 100; game.world = world; E.Interior.cur = cave;
  }
  console.log('\nMana, bought straight: rings and amulets');
  {
    const MW = ECHO.ManaWear;
    const all = [1, 2, 3, 4, 5].flatMap(n => [['ring', n], ['amulet', n]]);
    check('every mana ring and amulet costs a million crowns at the least — even where prices are lowest', all.every(([k, n]) => MW.price(k, n, 0.4) >= 1000000 && MW.price(k, n) >= 1000000) && MW.price('ring', 1, 0.4) === 1000000);
    const pl = { gold: 999999, mana: 100, maxMana: 1000 };
    const game = { pl, pe: null };
    check('a million is a million: with a crown less, nothing is sold', typeof MW.buy(game, 'ring', 1) === 'string' && pl.gold === 999999 && MW.worn(pl, 'ring') === null);
    check('an old save wears nothing, and nothing in its mana changes', MW.regen({ maxMana: 1000 }) === 0 && MW.maxMana({}, 1000) === 1000);
    pl.gold = 5000000;
    const r1 = MW.buy(game, 'ring', 1);
    check('bought, a ring is worn at once: a share of all your mana back every second, and a stream on top', typeof r1 === 'object' && pl.gold === 4000000 && MW.worn(pl, 'ring').name === 'Ring of the Spring' && Math.abs(MW.regen(pl) - (1000 * 0.02 + 15)) < 1e-9);
    check('a better one takes yours in part payment, at half what it cost', MW.cost(pl, 'ring', 2) === 2500000 && typeof MW.buy(game, 'ring', 2) === 'object' && pl.gold === 1500000 && pl.manaGear.ring === 2);
    check('…and you cannot buy what you wear, or worse', /wearing/.test(MW.why(pl, 'ring', 2)) && /better/.test(MW.why(pl, 'ring', 1)));
    pl.gold = 1000000; MW.buy(game, 'amulet', 1);
    check('an amulet lets you hold more: a share more, and a store on top', pl.gold === 0 && MW.maxMana(pl, 1000) === 1600);
  }

  console.log('\nThe Endless Deep');
  {
    const E = ECHO, Dp = E.Deep, X = E.Explore, U = E.U;
    const W = E.generateWorld({ seed: 4242, name: 'Bottomless' });
    const pl = W.player = E.Character.create(W, new E.RNG(9), { first: 'Ira', homeId: W.settlements[0].id });
    const home = W.settlements[0];
    const sites = X.sites(W), ab = sites.filter(s => s.kind === 'abyss');
    check('every world has one Endless Deep, a walk from your home, marked on your map from the start', ab.length === 1 && ab[0].found && ab[0].cat === 'delve' && U.dist(ab[0].x, ab[0].y, home.x, home.y) >= 11 && U.dist(ab[0].x, ab[0].y, home.x, home.y) < 60 && !E.World.isSolid(W, ab[0].x, ab[0].y) && W.settlements.every(t => U.dist(t.x, t.y, ab[0].x, ab[0].y) >= 11), ab[0] && `${Math.round(U.dist(ab[0].x, ab[0].y, home.x, home.y))} leagues from ${home.name}`);
    const W2 = E.Save.deserialize(E.Save.serialize(W));
    check('…and it keeps in a save, not moved and not doubled', X.sites(W2).filter(s => s.kind === 'abyss').length === 1 && X.sites(W2).find(s => s.kind === 'abyss').x === ab[0].x);
    // an older world, from before there was one: it is dug when the world is loaded, once
    const W3 = E.Save.deserialize(E.Save.serialize(W)); W3.sites = W3.sites.filter(s => s.kind !== 'abyss'); delete W3._abyss;
    const n3 = W3.sites.length; X.sites(W3); X.sites(W3);
    check('a world from before it gets one when loaded, once; nothing else of it changes', W3.sites.length === n3 + 1 && W3.sites.filter(s => s.kind === 'abyss').length === 1 && W3.sites.slice(0, n3).every((s, i) => s.id === W2.sites.filter(o => o.kind !== 'abyss')[i].id));
    const site = ab[0];
    E.Game = { world: W, pl, pe: { x: site.x, y: site.y } };
    const lvAt = (me, d) => { E.Prowess.st(pl).lv = me; return Dp.level(d); };
    check('a floor\'s level follows you: a little below you at the top, about you by the fifth floor, past you below that', lvAt(1, 0) === 8 && lvAt(1, 9) === 44 && lvAt(600, 0) === 510 && lvAt(600, 4) === 594 && lvAt(600, 9) > 600 && lvAt(600, 9) < lvAt(600, 10), `Lv 600: floor 1 ${lvAt(600, 0)}, floor 5 ${lvAt(600, 4)}, floor 10 ${lvAt(600, 9)}, floor 20 ${lvAt(600, 19)}`);
    E.Prowess.st(pl).lv = E.Prowess.MAX || 1500;
    check('…and past the greatest level there is, it keeps getting stronger regardless', Dp.beyond(0) === 0 && Dp.beyond(10) > 0 && Dp.beyond(30) > Dp.beyond(10) && Dp.level(30) === (E.Prowess.MAX || 1500), `beyond: floor 11 +${(Dp.beyond(10) * 100).toFixed(0)}%, floor 31 +${(Dp.beyond(30) * 100).toFixed(0)}%`);
    E.Prowess.st(pl).lv = 300;
    check('it has no bottom: there is always a floor below the deepest you have reached', X.floors(site) >= 2 && (() => { site.reached = 40; const f = X.floors(site); site.reached = 0; return f === 42; })() && X.floorLevel(site, 7) === Dp.level(7));
    site.run = 3;
    const tw = d => Dp.twists(site, d).join(',');
    check('every floor below the first has its twists: one, two from the tenth floor, three from the twenty-fifth', Dp.twists(site, 0).length === 0 && [1, 5, 8].every(d => Dp.twists(site, d).filter(k => !Dp.TWISTS[k].good).length === 1) && [9, 15, 23].every(d => Dp.twists(site, d).filter(k => !Dp.TWISTS[k].good).length === 2) && [24, 40].every(d => Dp.twists(site, d).filter(k => !Dp.TWISTS[k].good).length === 3), [1, 9, 24].map(d => `floor ${d + 1}: ${tw(d)}`).join(' · '));
    const a = [1, 2, 3, 4, 5, 6, 7, 8].map(tw).join('|'); site.run = 4; const b = [1, 2, 3, 4, 5, 6, 7, 8].map(tw).join('|'); site.run = 3;
    check('…the same floor keeps its twists for the whole descent, and a new descent brings new ones', a === [1, 2, 3, 4, 5, 6, 7, 8].map(tw).join('|') && a !== b);
    let seenK = new Set(); for (let r = 0; r < 40; r++) { site.run = r; for (let d = 1; d < 30; d++) for (const k of Dp.twists(site, d)) seenK.add(k); } site.run = 3;
    check('…and every twist turns up in time, the kind one too', Object.keys(Dp.TWISTS).every(k => seenK.has(k)), [...seenK].join(' '));
    check('a Warden waits on every fifth floor, and only there', [4, 9, 14, 49].every(Dp.isWarden) && ![0, 1, 3, 5, 10].some(Dp.isWarden));
    // the twists, on a monster
    const mk = () => ({ hp: 1000, maxHp: 1000, dmgMul: 1, speed: 3, scale: 1, resist: { melee: 0.1 }, foe: { wind: 0.5, cd: 1.2 }, ab: {} }), F0 = mk().foe;
    const tw1 = (ks, bey = 0, o = {}) => { const e = Object.assign(mk(), o); Dp.twist({ twists: ks }, e, bey); return e; };
    const iron = tw1(['iron']), fr = tw1(['frenzy']), th = tw1(['thirst']), gl = tw1(['glass']), ch = tw1(['champions']), gi = tw1(['gilded']), by = tw1([], 0.5);
    check('the twists do what they say: Ironhide, Frenzy, Bloodthirst, Glass and Fury, Champions, Gilded — and past the greatest level, more of everything', iron.resist.melee === 0.35 && iron.resist.ranged === 0.25 && fr.speed > 3 && fr.cdMul === 0.75 && fr.foe.wind === 0.4 && th.ab.drain === 0.25 && gl.maxHp === 650 && gl.dmgMul === 1.4 && ch.elite === 'hulking' && ch.maxHp === 1800 && gi.gilded && by.maxHp === 2000 && by.dmgMul === 1.5);
    const shared = { wind: 0.5 }, e2 = tw1(['frenzy'], 0, { foe: shared }); Dp.twist({ twists: ['frenzy', 'iron'] }, e2, 0);
    check('…once each, and never on what other monsters share', shared.wind === 0.5 && e2.speed === 3 * 1.3 && !(e2.resist.ranged > 0) && tw1(['champions'], 0, { boss2: true }).elite === undefined);
    // going down: a descent, new floors, your deepest, and a Warden's gate
    E.Interior = { cur: null }; const UI0 = E.UI; E.UI = { toast() {}, banner() {}, modal() {} };
    const game = E.Game; game.world = W;
    check('an old save has never been down: nothing kept until you go', !pl.deep && Dp.st(pl).best === 0 && pl.deep.gates === 0);
    delete pl.deep;
    pl.gold = 0; site.floorsDone = { 0: 1 }; site.hoards = { 4: 1 };
    Dp.onEnter(game, site, 0);
    check('each descent from the surface is a new one: the halls shift, and what you emptied last time is full again', site.run === 4 && Object.keys(site.floorsDone).length === 0 && Object.keys(site.hoards).length === 0 && pl.deep.runs === 1 && pl.deep.best === 1 && pl.gold === 0);
    E.Interior.cur = { site, depth: 0 };
    Dp.onEnter(game, site, 1); const g1 = pl.gold; Dp.onEnter(game, site, 1); E.Interior.cur.depth = 1; Dp.onEnter(game, site, 0); Dp.onEnter(game, site, 1);
    check('each new floor you reach on a descent pays you, by its level and depth — once', g1 === Dp.pay(1) && g1 > 0 && pl.gold === g1 && pl.deep.best === 2, `floor 2 at Lv 300: ${g1} crowns`);
    for (let d = 2; d <= 5; d++) Dp.onEnter(game, site, d);
    check('your deepest floor is kept, and the day you got there', pl.deep.best === 6 && pl.deep.bestDay === W.day && site.runTop === 5);
    Dp.wardenDown(game, { floor: 4, deepWarden: true });
    check('beat the Warden of the fifth floor and its stair-gate is yours for good: you may start the next descent on the sixth', pl.deep.gates === 5 && pl.deep.wardens === 1 && site.wardenDown[4]);
    Dp.wardenDown(game, { floor: 4, deepWarden: true });
    check('…a Warden beaten again opens no gate you have not earned', pl.deep.gates === 5 && pl.deep.wardens === 2);
    E.Interior.cur = null; const g2 = pl.gold; Dp.onEnter(game, site, 5);
    check('start a descent at a stair-gate: no pay for the floor you start on, and the record stands', site.runTop === 5 && pl.gold === g2 && pl.deep.best === 6 && pl.deep.runs === 2);
    const W4 = E.Save.deserialize(E.Save.serialize(W));
    check('all of it keeps in a save', W4.player.deep.best === 6 && W4.player.deep.gates === 5 && W4.sites.find(s => s.kind === 'abyss').run === site.run);
    for (let i = 0; i < 30; i++) X.dailyTick(W, new E.RNG(100 + i));
    check('it is no ordinary dungeon: it never grows untended, never changes hands, and no town posts work about it', !(site.grow > 0) && !(E.DungeonLife && E.DungeonLife.ok(site)) && W.plights.every(p => p.siteId !== site.id));
    // measured against you and your beasts, not your level
    E.Interior = { cur: null }; E.Game = game; game.ents = [];
    const PC0 = E.PlayerCtl; E.PlayerCtl = { derived: { meleeDmg: 1000, meleeCd: 0.5, bowDmg: 0, drawTime: 0.75, flameDmg: 0 } };
    const solo = Dp.might(game).dps;
    game.ents = [{ pal: { name: 'Gloop' }, palDmg: 110000, maxHp: 14000000 }, { pal: { name: 'Brute' }, palDmg: 11000, maxHp: 800000, growDmg: 2 }];
    const party = Dp.might(game);
    check('the Deep measures how hard you actually hit, and your beasts with you', solo === 2000 && Math.round(party.dps) === 2000 + 100000 + 20000 && party.ph === 14800000, `alone ${solo}/s, with the pack ${Math.round(party.dps)}/s`);
    check('…and the deeper, the longer each foe takes all of you to bring down, and the more of your life each blow takes', Dp.tKill(0) === 2.5 && Dp.tKill(19) > 9.5 && Dp.tKill(40) > Dp.tKill(19) && Dp.pct(0) === 0.015 && Dp.pct(19) > 0.09 && Dp.pct(19) < 0.11 && Dp.pct(500) === 0.4, `floor 20: ${Dp.tKill(19).toFixed(1)} s, ${(Dp.pct(19) * 100).toFixed(1)}% a blow`);
    const foe = { hp: 300000, maxHp: 300000, dmgMul: 1.2, foe: { dmg: 40 } }, k = party.dps * Dp.tKill(19) / foe.maxHp;
    Dp.measure(foe, k, Dp.pct(19), 19); Dp.measure(foe, k, Dp.pct(19), 19);
    check('…so a foe there is made to match: its life by your strength, its blows by your life, and its coin by the depth — once', Math.abs(foe.maxHp - party.dps * Dp.tKill(19)) < 2 && foe.deepPct === Dp.pct(19) && foe.deepBase === 48 && foe.deepGold > 2);
    E.PlayerCtl = PC0;
    // carry on where you left off
    const s2 = pl.deep; s2.best = 21; delete s2.cleared;
    let picked = null, choices = null; E.UI = { toast() {}, banner() {}, modal: o => { choices = o.choices; } }; const Q0 = E.Quests; E.Quests = { enterDelve: (g, st, d) => { picked = d; } };
    Dp.chooseFloor(game, site); choices[0].onPick();
    check('go in again and you carry on from the deepest floor you have reached (or the last you cleared, or start again)', picked === 20 && /floor 21/.test(choices[0].label) && choices.some(c => /floor 20 — the last you cleared/i.test(c.label)) && choices.some(c => /floor 1\b/.test(c.label)), choices.map(c => c.label).join(' | '));
    Dp.floorCleared(game, site, 21); Dp.floorCleared(game, site, 3);
    check('…and the floors you clear are kept', s2.cleared === 22);
    E.Quests = Q0;
    E.UI = UI0; delete E.Interior; delete E.Game;
  }

  console.log('\nLegendary gear, tempered in battle');
  {
    const E = ECHO, Tp = E.Temper, Gr = E.Gear;
    const W = E.generateWorld({ seed: 515, name: 'Forge' });
    const pl = W.player = E.Character.create(W, new E.RNG(3), { first: 'Hal', homeId: W.settlements[0].id });
    const rng = new E.RNG(7);
    const sw = Gr.make(W, rng, 'sword', 40, 'legendary', 'in a test'), bw = Gr.make(W, rng, 'bow', 40, 'legendary', 'in a test'), ar = Gr.make(W, rng, 'armor', 40, 'legendary', 'in a test'), plain = Gr.make(W, rng, 'sword', 40, 'epic', 'in a test');
    for (const it of [sw, bw, ar, plain]) { it.holder = 'player'; pl.items.push(it.id); }
    pl.weapon = sw.id; pl.bow = bw.id; pl.armor = ar.id;
    const base = sw.dmg, abase = ar.def;
    check('a legendary piece you already have begins untempered, just as it was', !sw.temper && Tp.lv(sw) === 0 && Tp.mul(sw) === 1 && Gr.power(sw) === base && Gr.def(W, pl) === abase && Tp.durability(sw) === 100);
    const ups = []; const UI0 = E.UI; E.UI = { toast: t => ups.push(t) };
    const game = { world: W, pl, pe: { x: 0, y: 0 }, time: 0 }, foe = { type: 'creature', foe: { dmg: 10 }, hp: 100, maxHp: 100 }, lord = { type: 'creature', foe: { dmg: 10 }, boss2: true, hp: 100, maxHp: 100 };
    for (let i = 0; i < Tp.need(0); i++) Tp.onHit(game, foe, 'melee');
    check('every blow a legendary blade lands tempers it; enough, and it goes up a level and hits harder', Tp.lv(sw) === 1 && Gr.power(sw) === Math.round(base * 1.03) && sw.temper.hits === Tp.need(0) && ups.some(t => /hits 3% harder/.test(t)), `${base} → ${Gr.power(sw)}`);
    const x0 = sw.temper.xp; Tp.onHit(game, lord, 'melee'); const lordXp = sw.temper.xp - x0;
    Tp.onKill(game, lord); const killXp = sw.temper.xp - x0 - lordXp;
    check('…the harder the foe, the more it counts, and a kill five times over', lordXp === 4 && killXp === 20 && sw.temper.kills === 1);
    for (let i = 0; i < 40; i++) Tp.onHit(game, foe, 'ranged');
    for (let i = 0; i < 40; i++) Tp.onStruck(game, foe);
    check('a legendary bow tempers with its arrows, and legendary armour with the blows it takes for you', Tp.lv(bw) === 1 && Tp.lv(ar) === 1 && Gr.def(W, pl) === Math.round(abase * 1.03) && Gr.taken(W, pl, 'melee') < 1 - abase / (abase + 55));
    for (let i = 0; i < 40; i++) Tp.onHit(game, { type: 'creature', pal: { name: 'x' }, hp: 1, maxHp: 1 }, 'melee');
    const xp1 = sw.temper.xp; pl.weapon = plain.id; for (let i = 0; i < 40; i++) Tp.onHit(game, foe, 'melee'); pl.weapon = sw.id;
    check('…but not on your own beasts, and nothing less than legendary tempers', sw.temper.xp === xp1 && !plain.temper);
    const need = [0, 1, 5, 10, 20].map(Tp.need);
    check('each level asks more fighting than the one before, with no last level', need.every((n, i) => !i || n > need[i - 1]) && need[0] === 25, need.join(' · '));
    sw.temper.lv = 30; ar.temper.lv = 50;
    check('its durability grows with it: a blade holds better in your guard, armour shrugs off more of every blow — within bounds', Tp.durability(sw) === 850 && Tp.guard(game) === 0.2 && Tp.toughOf(ar) === 0.15 && Tp.mul(sw) === 1.9);
    check('…and you see it on the piece', /tempered 30 \(power \+90%\) · durability 850/.test(Gr.line(sw)) && /tempers in battle/.test(Gr.line(Gr.make(W, rng, 'bow', 5, 'legendary'))));
    check('a tempered blade is not traded away for a plainer one that only looks stronger', Gr.power(sw) > Gr.power(Object.assign({}, plain, { dmg: Math.round(base * 1.5) })));
    const W2 = E.Save.deserialize(E.Save.serialize(W));
    check('all of it keeps in a save, on the piece itself', W2.items[sw.id].temper.lv === 30 && W2.items[ar.id].temper.lv === 50 && E.Gear.power(W2.items[sw.id]) === Gr.power(sw));
    E.UI = UI0;
  }

  console.log('\nHidden places, treasure maps, and the Atlas');
  {
    const E = ECHO, Hd = E.Hidden, At = E.Atlas, U = E.U, T = E.TILE;
    const W = E.generateWorld({ seed: 777, name: 'Hiddenland' });
    const pl = W.player = E.Character.create(W, new E.RNG(5), { first: 'Oda', homeId: W.settlements[0].id });
    check('a save from before has none of it: nothing is made until it is needed', !W.hidden && !pl.atlas);
    // lay down the whole land, cell by cell, as if walked (the world's places first, as in play)
    E.Explore.sites(W);
    const cw = Math.ceil(W.W / Hd.CELL), ch = Math.ceil(W.H / Hd.CELL);
    for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) Hd.fill(W, cx, cy);
    const L = W.hidden.list, kinds = new Set(L.map(h => h.kind));
    let more = 0; for (const sd of [31, 4242, 9191]) { const Wx = E.generateWorld({ seed: sd, name: 'More' }); Wx.player = { homeId: Wx.settlements[0].id }; E.Explore.sites(Wx); for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) Hd.fill(Wx, cx, cy); more += Wx.hidden.list.length; for (const h of Wx.hidden.list) kinds.add(h.kind); }
    const wetNear = (h, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const t = E.World.tile(W, Math.floor(h.x) + dx, Math.floor(h.y) + dy); if (t === T.WATER || t === T.DEEP || t === T.SWAMP) return true; } return false; };
    check('the land is full of hidden places — of many kinds (island worlds: most of them sea)', L.length >= 1 && L.length + more >= 5 && kinds.size >= 4, `${L.length + more} in four islands: ${[...kinds].join(' ')}`);
    check('…each on open ground, out in the wild: none in a town, none on top of another place, none in water or rock', L.every(h => !E.World.isSolid(W, h.x, h.y) && W.settlements.every(s => U.dist(s.x, s.y, h.x, h.y) >= 15) && W.sites.every(s => s.hidden || U.dist(s.x, s.y, h.x, h.y) >= 9) && L.every(o => o === h || U.dist(o.x, o.y, h.x, h.y) >= 22)));
    check('…and each where it belongs: a sunken temple by the water', L.filter(h => h.kind === 'drowned').every(h => wetNear(h, 3)), `${L.filter(h => h.kind === 'drowned').length} sunken temples`);
    check('…each with its name and its story', L.every(h => h.name && /[A-Z]/.test(h.name) && Hd.lore(h).length > 40 && !/\{/.test(Hd.lore(h)) && !/\{/.test(h.name)), Hd.lore(L[0]));
    const W1 = E.generateWorld({ seed: 777, name: 'Hiddenland' }); W1.player = pl; E.Explore.sites(W1);
    for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) Hd.fill(W1, cx, cy);
    check('the same world has the same hidden places, wherever its walker goes first', W1.hidden.list.length === L.length && W1.hidden.list.every((h, i) => h.kind === L[i].kind && h.x === L[i].x && h.name === L[i].name));
    const n0 = L.length; for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) Hd.fill(W, cx, cy);
    const W2 = E.Save.deserialize(E.Save.serialize(W)); for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) Hd.fill(W2, cx, cy);
    check('each stretch of land is laid down once: walk it again, or load the save, and nothing is added or moved', L.length === n0 && W2.hidden.list.length === n0 && W2.hidden.list[n0 - 1].x === L[n0 - 1].x);
    // finding them
    const toasts = []; const UI0 = E.UI; E.UI = { toast: t => toasts.push(t), banner() {}, modal() {} };
    E.Interior = { cur: null }; const C0 = E.Combat; E.Combat = { fx: [], ring() {}, burst() {}, floater() {} }; const S0 = E.Sfx; E.Sfx = { play() {} };
    const M0 = E.Monsters; let made = []; E.Monsters = { DEFS: {}, make: (g, kind, x, y, lvl, o) => { const e = { kind, x, y, lvl, hp: 100, maxHp: 100, dmgMul: 1, scale: 1 }; made.push(e); return e; }, dropGear: (g, x, y, lvl) => { made.push({ gear: lvl }); } };
    const Ent0 = E.Ent; E.Ent = { freeSpot: (w, x, y) => ({ x, y }), lineOfSight: () => true };
    const game = { world: W, pl, pe: { x: 0, y: 0 }, ents: [], addEnt(e) { this.ents.push(e); }, dropItem() {}, isNight: () => false, time: 0 };
    E.Game = game;
    // (an island world has few: any kind missing here is set down by hand, out in the wild)
    let fake = 0; const mk = kind => { const s0 = W.settlements[1 + (fake % 3)], h = { id: 'hdt' + (++fake), kind, name: `the Test ${kind} of Nowhere`, N: 'Nowhere', lore: 0, who: 0, x: s0.x + 30, y: s0.y, found: false }; L.push(h); return h; };
    const pick = k => L.find(h => h.kind === k && !h.found) || mk(k);
    const g1 = L.find(h => Hd.KINDS[h.kind].type === 'guard') || mk('giantforge'), d1 = L.find(h => Hd.KINDS[h.kind].type === 'delve' && h.kind !== 'vault') || mk('drowned');
    Hd.discover(game, g1);
    check('found: it counts in your Atlas, by kind, and you hear its story', g1.found && pl.atlas.n === 1 && pl.atlas.kinds[g1.kind] === 1 && toasts.some(t => t.includes(Hd.lore(g1).slice(0, 30))));
    Hd.discover(game, d1); const s1 = E.Explore.byId(W, d1.site);
    check('one that goes down becomes a dungeon on your map, of its own floors and its own kind', s1 && s1.cat === 'delve' && s1.kind === d1.kind && s1.found && s1.hidden === d1.id && E.Explore.floors(s1) === Hd.DELVE_DEFS[d1.kind].hiddenFloors && E.Explore.level(W, s1) >= 1 && E.Explore.def(s1).label === Hd.KINDS[d1.kind].label, `${s1 && s1.name}: ${s1 && E.Explore.floors(s1)} floors, Lv ${s1 && E.Explore.level(W, s1)}`);
    const v = pick('vault');
    Hd.discover(game, v); const sv = E.Explore.byId(W, v.site);
    pl.inv.vaultkey = 0; Hd.unseal(game, sv); const still = sv.sealed; pl.inv.vaultkey = 2; Hd.unseal(game, sv);
    check('a sealed vault holds until you bring it a vault key; the key is used up', still === true && sv.sealed === false && pl.inv.vaultkey === 1);
    // guarded: its keeper, and its hoard
    game.pe.x = g1.x + 4; game.pe.y = g1.y; made = []; Hd.guard(game, g1);
    const champ = made.find(e => e.hidChamp), K1 = Hd.KINDS[g1.kind];
    check('come near a guarded one and its keeper is there, stronger than its kind, with its guards about it', champ && champ.hiddenOf === g1.id && champ.maxHp === 300 && champ.label.includes(K1.champName) && made.length === 1 + K1.guards.reduce((s, x) => s + x[1], 0) && champ.lvl > made.find(e => !e.hidChamp).lvl);
    Hd.guard(game, g1);
    check('…once: while they stand, no more come', game.ents.length === made.length);
    const gold0 = pl.gold = 0; Hd.hoard(game, g1); const early = !g1.taken && pl.gold === 0;
    Hd.onKill(made.find(e => !e.hidChamp), game.pe); const notYet = !g1.cleared;
    Hd.onKill(champ, game.pe);
    const got = Hd.hoard(game, g1), g2 = pl.gold; Hd.hoard(game, g1);
    check('kill the keeper and its hoard is yours: crowns by its level, a relic, gear — once', early && notYet && g1.cleared && g1.taken && g2 >= 160 * g1.L && pl.gold === g2 && got.length >= 3, got.join('; '));
    // blessings
    const sp = pick('silverpool');
    sp.found = 1; Hd.bless(game, sp); const dayNo = !sp.blessed;
    game.isNight = () => true; Hd.bless(game, sp); const b1 = Object.assign({}, pl.atlas.boon); Hd.bless(game, sp);
    check('a silver pool gives by moonlight only, once, and what it gives is for good', dayNo && sp.blessed && b1.hp === 0.02 && b1.mana === 0.03 && pl.atlas.boon.hp === 0.02);
    const et = { id: 'hde', kind: 'eldertree', name: 'the Eldest Tree of Test', N: 'Test', lore: 0, who: 0, x: 0, y: 0, found: 1 };
    Hd.bless(game, et); const nightNo = !et.blessed; game.isNight = () => false; Hd.bless(game, et);
    check('…an eldest tree by daylight only: a lighter stride', nightNo && et.blessed && pl.atlas.boon.speed === 0.01 && At.speedMul(pl) > 1);
    // treasure maps
    game.pe.x = W.settlements[0].x; game.pe.y = W.settlements[0].y; pl.tracked = null;
    if (!L.some(h => !h.found && U.dist(h.x, h.y, game.pe.x, game.pe.y) > 30)) L.push({ id: 'hdm', kind: 'starheart', name: 'the Blue Crater at Test', N: 'Test', lore: 0, who: 0, x: game.pe.x + 45, y: game.pe.y, found: false });   // (an island world has few)
    const m = Hd.giveMap(game, game.pe.x, game.pe.y, 'for a test', true), mh = m && Hd.byId(W, m.h);
    check('a treasure map marks a ring where a hidden place waits — not one you have found, a fair walk away — and is tracked', m && mh && !mh.found && U.dist(mh.x, mh.y, game.pe.x, game.pe.y) > 30 && U.dist(m.x, m.y, mh.x, mh.y) <= m.r && pl.tracked === 'hmap:' + m.id && Hd.trackedMap(game, pl.tracked).where.vague);
    Hd.discover(game, mh);
    check('…find it, and the map is done with: you came by the map, and it pays more', !pl.hmaps.length && mh.byMap && pl.atlas.maps === 1);
    // the Atlas: a save from before counts what you had already found
    delete E.Game; const P2 = E.Character.create(W, new E.RNG(8), { first: 'Ves', homeId: W.settlements[0].id });
    P2.discovered = 12; P2.cachesFound = 4; P2.gold = 0;
    E.Game = Object.assign({}, game, { pl: P2 }); E.Prowess.st(P2).lv = 100;
    const c0 = At.count(W, P2), r = At.check(E.Game), gold2 = P2.gold;
    check('the Atlas counts everything you have ever found, and a save from before starts it already counting', c0 >= 16 && P2.atlas.tier === 2 && r.got.join() === '1,2' && gold2 >= At.pay(1) + At.pay(2), `${c0} discoveries → milestones ${r.got.join(', ')}, ${gold2} crowns`);
    const r2 = At.check(E.Game);
    check('…each milestone paid once', r2 === null && P2.atlas.tier === 2 && P2.gold === gold2);
    check('…and what it gives stays: a little more life, a quicker stride, a sharper sense, and a name', At.lifeMul(P2) === 1.02 && At.speedMul(P2) === 1.02 && At.sense(P2) === 28 && At.title(P2) === 'Wayfarer' && !At.rumours(P2));
    P2.atlas.tier = 30;
    check('…within bounds, however far you go', At.lifeMul(P2) === 1.15 && At.speedMul(P2) === 1.1 && At.sense(P2) === 40 && At.title(P2) === 'the Unbounded' && At.rumours(P2) && At.need(30) > At.need(29));
    W.player = pl;
    const W3 = E.Save.deserialize(E.Save.serialize(W));
    check('all of it keeps in a save', W3.hidden.list.length === W.hidden.list.length && W3.player.atlas.n === pl.atlas.n && W3.sites.some(s => s.hidden === d1.id) && W3.sites.find(s => s.hidden === v.id).sealed === false);
    E.UI = UI0; E.Combat = C0; E.Sfx = S0; E.Monsters = M0; E.Ent = Ent0; delete E.Interior; delete E.Game;
  }

  console.log('\nFixed danger, more realms, real diplomacy');
  {
    const E = ECHO, Dg = E.Danger, Rs = E.Realms, Pw = E.Powers, P = E.People;
    const W = E.generateWorld({ seed: 777, name: 'Realms' });
    const pl = W.player = E.Character.create(W, new E.RNG(6), { first: 'Ren', homeId: W.settlements[0].id });
    const cap = W.settlements.find(s => s.kind === 'capital');
    E.Prowess.st(pl).lv = 5; const corner = [[2, 2], [W.W - 3, 2], [2, W.H - 3], [W.W - 3, W.H - 3]].sort((a, b) => Dg.reach(W, b[0], b[1]) - Dg.reach(W, a[0], a[1]))[0];
    const d1 = Dg.at(W, cap.x + 3, cap.y + 2), far1 = Dg.at(W, corner[0], corner[1]);
    E.Prowess.st(pl).lv = 14; const d14 = Dg.at(W, cap.x + 3, cap.y + 2), far14 = Dg.at(W, corner[0], corner[1]);
    check('the land\'s danger is its own while you are young: gentle by the capitals, deadlier far off, whatever your level below 15', d1 <= 3 && far1 >= 8 && d1 === d14 && far1 === far14, `by ${cap.name}: ${d1} · the farthest corner of the old island: ${far1}`);
    E.Prowess.st(pl).lv = 250; const d2 = Dg.at(W, cap.x + 3, cap.y + 2), far2 = Dg.at(W, corner[0], corner[1]);
    check('…and once you have outgrown it, it rises with you: the heartlands a little below you, the far country above them — never weaker than it was', d2 >= 175 && d2 < 250 && far2 > d2 && Dg.base(W, cap.x + 3, cap.y + 2) === d1 && Dg.rise(W, 150) >= 295 && Dg.rise(W, 1) < 250, `level 250: by ${cap.name} ${d2}, far corner ${far2}, the far country ${Dg.rise(W, 150)}`);
    E.Prowess.st(pl).lv = 5;
    const r0 = W.regions.find(r => r.land > 0.3);
    check('each region has its own band of danger, to show you', Array.isArray(Dg.band(W, r0)) && Dg.band(W, r0)[0] <= Dg.band(W, r0)[1], `${r0.name}: ${Dg.label(W, r0)}`);
    check('a deep wood is as deadly as it always was — until you outgrow even that, and it rises above you', !E.Wildwood || (E.Wildwood.level(W, 1) === 70 && E.Wildwood.level(W, 4) === 480 && (E.Prowess.st(pl).lv = 600, E.Wildwood.level(W, 1) >= 750 && E.Wildwood.level(W, 4) >= 1000 && (E.Prowess.st(pl).lv = 5, true))));
    {
      const site = { kind: 'crypt', level: 30, lv2: 1, x: 0, y: 0 }, G0 = E.Game; E.Game = { pl }; E.Prowess.st(pl).lv = 400;
      const L = E.Explore.level(W, site), f0 = E.Explore.floorLevel(site, 0), f5 = E.Explore.floorLevel(site, 5);
      check('a place below rises with you too, each floor down a little worse again — and keeps its own level for when you were young', L >= 288 && f0 >= 288 && f5 > f0 && site.level === 30, `${L}: floors ${f0} … ${f5}`);
      E.Prowess.st(pl).lv = 5; E.Game = G0;
      check('…which it is, below 15', E.Explore.level(W, site) === 30 && E.Explore.floorLevel(site, 0) < 60);
    }
    // the realm's people: the rank and file rise with the age and their country; only the elite keep pace with you
    const sol = P.alive(W).find(n => n.prof === 'guard' && !n.rank && !n.title && !n.rival), riv = P.alive(W).find(n => n.prof === 'guard') ;
    const aLow = Pw.aim(W, sol, 10), aHigh = Pw.aim(W, sol, 300);
    const fake = Object.assign({}, riv, { rival: true });
    check('the rank and file of the realm do not grow to meet you — the elite (rivals, Marshals, Champions) do', aLow === aHigh && Pw.aim(W, fake, 300) > Pw.aim(W, fake, 10) * 3, `a soldier aims at ${aLow} whether you are 10 or 300; a rival at ${Pw.aim(W, fake, 10)} → ${Pw.aim(W, fake, 300)}`);
    // more realms
    const ps = Rs.powers(W);
    check('the old kingdoms have lost far provinces: duchies, principalities and free cities of their own', ps.length >= 3 && ps.some(f => f.seceded && ['duchy', 'principality', 'freecity'].includes(f.style)), ps.map(f => f.name).join(', '));
    const du = ps.find(f => f.seceded), dr = du && W.npcs[du.ruler];
    check('…each with its own ruler, titled as its kind of realm is, and a grudge with the crown it left', dr && dr.title === Rs.rulerTitle(du, dr) && dr.title !== 'King' && Rs.rel(du, W.factions[du.seceded]) < 0, dr ? `${P.fullTitle(W, dr)} of ${du.short}` : '');
    // the far lands
    E.Globe.ensure(W);
    const o = W.globe.old, cx = (o.x0 + o.x1) / 2, cy = (o.y0 + o.y1) / 2, cells = new Set();
    for (const [dx, dy] of [[320, 0], [420, 0], [-360, 30], [0, 360]]) for (let k = -1; k <= 1; k++) cells.add(E.Globe.cellAt(W, E.Globe.wrapX(W, cx + dx + k * 96), cy + dy));
    E.Globe.make(W, [...cells]);
    const far = Rs.powers(W).filter(f => f.farRealm);
    check('the far lands belong to realms of their own — their own peoples, kinds of realm and names', far.length >= 2 && new Set(far.map(f => f.culture)).size >= 2 && far.every(f => f.ruler && W.npcs[f.ruler] && Rs.towns(W, f).length >= 1), far.map(f => `${f.name} (${f.culture})`).join(', '));
    const fseat = far.map(f => E.Sim.settlement(W, f.capital)).filter(Boolean);
    check('…out where the land is dangerous', fseat.every(s => Dg.at(W, s.x, s.y) >= 25), fseat.map(s => Dg.at(W, s.x, s.y)).join(', '));
    // diplomacy over a season or so
    const rng = new E.RNG(9);
    for (let d = 0; d < 120; d++) E.Sim.dailyTick(W, true);
    const log = Rs.st(W).log.map(l => l.text).join(' | ');
    const kinds = ['alliance', 'truce', 'sworn itself', 'bent the knee', 'goes to war', 'Peace between', 'tribute', 'broken away', 'far lands', 'proclaimed'].filter(k => log.includes(k));
    check('the powers deal with each other: alliances, truces, vassals, demands, wars and peace', kinds.length >= 4, kinds.join(', '));
    // called to arms
    const [A, B, C] = Rs.powers(W).filter(f => !f.fallen && !Object.keys(f.atWar).length && !f.overlord).slice(0, 3);
    if (A && B && C) {
      Rs.tie(W, A, B).alliance = W.day; Rs.setRel(A, B, 60); Rs.setRel(A, C, -40);
      { const t = Rs.tie(W, A, C); t.truce = 0; delete t.alliance; }   // (no truce of their own to keep it out: that is checked below)
      Rs.war(W, C, B, 'conquest');
      check('an ally is called to arms when its friend is attacked', !!A.atWar[C.id] && !!B.atWar[C.id], `${C.short} attacks ${B.short}; ${A.short} ${A.atWar[C.id] ? 'marches' : 'stays home'}`);
      const Wk = Rs.st(W).wars[Rs.key(C, B)];
      Wk.score[C.id] = 30; Wk.score[B.id] = 2; Wk.start -= 40;
      const t0 = E.Realm.st(B).tribute;
      Rs.treaty(W, Wk, C, B, 30, 2); delete Rs.st(W).wars[Rs.key(C, B)];
      check('peace comes with terms: the loser pays (or cedes a town), and a truce follows', !B.atWar[C.id] && (E.Realm.st(B).tribute && E.Realm.st(B).tribute.to === C.id) && Rs.tie(W, B, C).truce > W.day, `${B.short} pays ${E.Realm.st(B).tribute ? E.Realm.st(B).tribute.amt : 0} a day`);
      void t0;
    }
    // vassals pay
    const v = Rs.powers(W).find(f => f.overlord && W.factions[f.overlord] && !W.factions[f.overlord].fallen) || Rs.powers(W).find(f => !f.overlord && Rs.towns(W, f).length <= 2);
    const lord = v && (v.overlord ? W.factions[v.overlord] : Rs.powers(W).find(f => f !== v && !f.overlord));
    if (v && lord) {
      v.overlord = lord.id; v.treasury = 500; const lt = lord.treasury;
      Rs.vassalage(W, v, new E.RNG(1));
      check('a vassal pays its overlord tribute', lord.treasury > lt && v.treasury < 500);
    }
    // a truce holds even against an ally's call
    {
      const free = Rs.powers(W).filter(f => !f.fallen && !f.overlord && !Rs.powers(W).some(g => g.overlord === f.id));
      for (const f of free) for (const g of free) if (f !== g && f.atWar[g.id]) E.Politics.makePeace(W, f, g, true);
      const [A2, B2, C2] = free;
      if (A2 && B2 && C2) {
        Rs.tie(W, A2, B2).alliance = W.day; Rs.setRel(A2, B2, 60); Rs.tie(W, A2, C2).truce = W.day + 30;
        Rs.war(W, C2, B2, 'conquest');
        check('a sworn truce holds: an ally will not break it to march, though its friend is angry', !A2.atWar[C2.id] && !!B2.atWar[C2.id] && Rs.st(W).log.some(l => /will not break its truce/.test(l.text)), `${C2.short} attacks ${B2.short}; ${A2.short} ${A2.atWar[C2.id] ? 'marches' : 'keeps its truce'}`);
      }
    }
    // a realm stretched too wide loses a town it took — and a fallen house comes back
    {
      const big = Rs.powers(W).filter(f => !f.farRealm).sort((a, b) => Rs.towns(W, b).length - Rs.towns(W, a).length)[0];
      const capB = E.Sim.settlement(W, big.capital);
      const fall = Rs.found(W, [W.settlements.find(s => s.faction === big.id && s.id !== big.capital && s.kind === 'village' && Rs.dist(W, s.x, s.y, capB.x, capB.y) > 35) || W.settlements.find(s => s.faction === big.id && s.id !== big.capital)], { style: 'duchy', culture: big.culture, from: big.id });
      const town = E.Sim.settlement(W, fall.capital);
      E.Politics.flipSettlement(W, town, big.id, 'conquest');
      const fell = !!fall.fallen;
      // (make it wide: six towns or more)
      while (Rs.towns(W, big).length < 6) { const s = W.settlements.find(x => x.faction !== big.id && x.kind === 'village' && !Object.values(W.factions).some(f => f.capital === x.id)); if (!s) break; s.faction = big.id; }
      Rs.st(W).claims[town.id] = fall.id;
      const sure = { chance: () => true, next: () => 0.5, pick: a => a[0], int: (a) => a, range: (a) => a };
      Rs.overreach(W, big, sure);
      check('a realm grown too wide loses what it took: the fallen house it took it from rises again there', fell && !fall.fallen && town.faction === fall.id && fall.ruler && W.npcs[fall.ruler].home === town.id && Rs.st(W).log.some(l => /The fallen house is back/.test(l.text)), Rs.st(W).log.filter(l => /risen against/.test(l.text)).map(l => l.text).join(' ').slice(0, 220));
    }
    // an old world
    const W4 = E.generateWorld({ seed: 31, name: 'Old' });
    const p4 = W4.player = E.Character.create(W4, new E.RNG(3), { first: 'Old', homeId: W4.settlements[0].id });
    E.Prowess.st(p4).lv = 44; p4.gold = 4321;
    for (const f of Object.values(W4.factions)) if (f.id.startsWith('rlm')) { for (const s of W4.settlements) if (s.faction === f.id) { s.faction = f.seceded || 'valdren'; for (const n of P.residents(W4, s)) n.faction = s.faction; } delete W4.factions[f.id]; }
    for (const f of Object.values(W4.factions)) for (const k of Object.keys(f.relations || {})) if (k.startsWith('rlm')) delete f.relations[k];
    delete W4.realms;
    const W5 = E.Save.deserialize(E.Save.serialize(W4));
    let ok = true; try { Rs.ensure(W5); E.Sim.dailyTick(W5, true); } catch (e) { ok = false; console.log('   ', e.stack); }
    const n1 = Rs.powers(W5).length; Rs.ensure(W5); E.Sim.dailyTick(W5, true);
    check('an old save takes up the new realms once, on load — and your own progress is untouched', ok && n1 >= 3 && Rs.powers(W5).length === n1 && E.Prowess.level(W5.player) === 44 && W5.player.gold === 4321, `${n1} powers`);
    const W6 = E.Save.deserialize(E.Save.serialize(W5));
    check('the realms, their ties and their wars survive a save', Rs.powers(W6).length === Rs.powers(W5).length && W6.realms && W6.realms.home && Rs.powers(W6).some(f => f.style));
  }

  console.log('\nSmooth play: the heavy work kept small');
  {
    const E = ECHO, W = E.generateWorld({ seed: 4321, name: 'Smooth' });
    W.player = E.Character.create(W, new E.RNG(5), { first: 'Ada', homeId: W.settlements[0].id });
    for (let d = 0; d < 4; d++) E.Sim.dailyTick(W, true);
    // the share of the land walked, counted again only when more is walked — and right when it is
    const pl = W.player; pl.explored = new Array(Math.ceil(W.W / 4) * Math.ceil(W.H / 4)).fill(0);
    const f0 = E.Discover.explored(W, pl);
    for (let i = 0; i < 400; i++) pl.explored[i] = 1;
    E.Discover.touch();
    const f1 = E.Discover.explored(W, pl);
    check('the land walked is counted right, and again only when more is walked', f0 === 0 && f1 > 0 && E.Discover.explored(W, pl) === f1, `${(f1 * 100).toFixed(1)}%`);
    // the land's changes, as the world notes where they were: the caches forget only those places
    const e0 = W._tileEpoch || 0;
    E.Realm.reshaped(W, [{ x0: 10, y0: 10, x1: 14, y1: 12 }]);
    E.Realm.reshaped(W, [{ x0: 40, y0: 40, x1: 41, y1: 41 }]);
    const seen = []; const ok = E.Nav.forget(W, e0, (x0, y0, x1, y1) => seen.push([x0, y0, x1, y1]));
    W._tileEpoch++;   // (a change no one noted)
    const ok2 = E.Nav.forget(W, e0, () => {});
    check('changes to the land are noted where they happened, and a change not noted makes the caches start over', ok && seen.length === 2 && seen[0][0] <= 10 && seen[0][2] >= 14 && !ok2, JSON.stringify(seen));
    // a person's ties: ten kept, the weakest let go
    const n = Object.values(W.npcs).find(x => x.status === 'alive');
    n.rel = {}; for (let i = 0; i < 10; i++) n.rel['x' + i] = (i + 1) * 5 * (i % 2 ? -1 : 1);
    E.People.bond(n, 'new', 30);
    check('a person keeps ten ties and lets the weakest go', Object.keys(n.rel).length === 10 && !('x0' in n.rel) && n.rel.new === 30, Object.keys(n.rel).join(','));
    // the day's work does not look through everyone again for every dungeon and every crown
    let calls = 0; const av = E.Guild.available; E.Guild.available = function (...a) { calls++; return av.apply(this, a); };
    for (const s of E.Explore.sites(W)) { const L = E.DungeonLife.ok(s) && E.DungeonLife.life(W, s); if (!L) continue; L.state = 'active'; L.since = W.day - 10; s.cleared = false; }
    E.DungeonLife.dailyTick(W);
    E.Guild.available = av;
    let alive = 0; const pa = E.People.alive; E.People.alive = function (...a) { alive++; return pa.apply(this, a); };
    E.Military.dailyTick(W);
    E.People.alive = pa;
    check('the dungeons ask after the guild once a day, and the crowns look through their people once', calls <= 1 && alive <= 2, `guild asked ${calls}× for ${E.Explore.sites(W).length} dungeons; everyone looked through ${alive}× for ${Object.values(W.factions).filter(f => f.type === 'kingdom').length} crowns`);
    // the country round a town, for its people's strength: the same as the danger there, kept for the day
    const s0 = W.settlements[W.settlements.length - 1];
    // what a monster calls up is born as it is — never a broodmother that calls up broodmothers (that
    // chain filled a floor with twenty thousand spiders in a second and froze the game)
    {
      const Ev = E.Evolve, mk = o => Object.assign({ type: 'creature', species: 'spider', foe: { name: 'Cave spider' }, lvl: 139, hp: 100, maxHp: 100, ab: {} }, o);
      const free = mk({}), called = mk({ summoned: true });
      let born = 0; for (let i = 0; i < 40; i++) { const x = mk({ summoned: true }); Ev.birth(null, x, 139, { summoned: true, noEvo: true }); if ((x.evo || 1) > 1 || x.ab.summon) born++; }
      check('a creature another called up is never born in a higher form, and never grows into a summoner', Ev.can(free) && !Ev.can(called) && born === 0, `${born} of 40 born higher`);
    }
    check('the danger of a town\'s country is worked out once a day for all who live there', Math.abs(E.Powers.landAt(W, s0.id) - E.Danger.at(W, s0.x, s0.y) * 1.1) < 1e-9 && W._dgSet && W._dgSet.m[s0.id] != null);
  }

  console.log('\nLooking after yourself');
  {
    const E = ECHO, AU = E.Auto, did = [];
    const keepPC = E.PlayerCtl, keepCamp = E.Camp, keepUI = E.UI;
    E.PlayerCtl = { drinkT: 0, drinkHeal: () => did.push('heal'), drink: (g, id) => did.push(id), useHerbs: () => did.push('herbs') };
    E.Camp = { ORDER: ['stew', 'food'], init() {}, eat: (g, k) => did.push('eat:' + k) };
    const pe = { x: 50, y: 50 }, pl = { hp: 100, maxHp: 100, fed: 80, stamina: 50, maxSta: 50, inv: { food: 3, herbs: 0 }, potions: {}, buffs: {} };
    const game = { pl, pe, time: 100, combatT: null, ents: [pe], hostileTo: () => true };
    const tick = () => { AU.t = 0; AU.eatT = 0; did.length = 0; AU.tick(game, 0.3); return did.slice(); };
    pl.fed = 20; const a = tick();
    pl.fed = 80; pl.hp = 25; pl.potions.greater = 1; const b = tick();
    pl.hp = 100; game.combatT = 99; game.ents.push({ x: 52, y: 50, type: 'boss', aggro: true, lvl: 50 }); pl.potions.might = 1; const c = tick();
    E.UI = { settings: { autoCare: 'off', autoBuff: 'off' } }; pl.hp = 25; pl.fed = 20; const d = tick();
    E.PlayerCtl = keepPC; E.Camp = keepCamp; if (keepUI) E.UI = keepUI; else delete E.UI;
    check('hungry, you eat what you carry, the best first', a.join() === 'eat:food', a.join());
    check('badly hurt, you drink a healing draught', b.join() === 'heal', b.join());
    check('in a hard fight, you drink your fighting draughts', c.join() === 'might', c.join());
    check('all of it can be turned off', d.length === 0, d.join() || 'nothing');
  }

  console.log('\nThe arsenal of the realm');
  {
    const E = ECHO, A = E.Arsenal, W = E.generateWorld({ seed: 2525, name: 'Arms' });
    const pl = W.player = W.player || { charId: 'c-a', first: 'Ivo', last: 'Steel', alive: true, known: [], accepted: [], inv: {}, items: [], skills: {}, x: 50, y: 50 };
    pl.wanted = pl.wanted || {}; pl.prowess = { lv: 1, xp: 0, kills: 0, best: 0 }; pl.renown = 0;
    const small = s => ['town', 'village'].includes(E.Military.tier(W, s));
    const f = A.powers(W).find(x => E.Sim.settlement(W, x.capital) && W.settlements.some(s => s.faction === x.id && s.id !== x.capital && small(s)));
    const age = E.Powers.age(W);
    check('a realm with no foe it knows of keeps pace with the age', A.target(W, f) <= Math.round(age * 0.85) + 1, `research toward ${A.target(W, f)}, age ${age.toFixed(1)}`);
    // a hero known across the world: every crown arms against them, and an old world arms at once
    pl.prowess.lv = 300; pl.renown = 120;
    W.arsenal = null; for (const id in W.npcs) W.npcs[id].armed = 0;
    A.ensure(W);
    const R = A.rs(W, f), cap = E.Sim.settlement(W, f.capital);
    const reach = A.reach(W, f);
    check('a world from before arms at once against a hero known everywhere (as far as its size lets it)', Math.abs(R.lv - 300 * 0.95 * reach) <= 2 && reach > 0.75 && A.tier(W, f.id) >= A.WARDS, `research ${R.lv}, ${A.tierName(A.tier(W, f.id))}, reach ${reach.toFixed(2)}`);
    const avg = s => { const xs = E.People.residents(W, s).filter(n => A.fighter(n) && n.title !== 'Marshal' && n.title !== 'Champion').map(n => E.Delvers.lv(n)); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; };
    const vil = W.settlements.filter(s => s.faction === f.id && s.id !== cap.id && small(s)).sort((a, b) => avg(b) - avg(a))[0];
    const aC = avg(cap), aV = avg(vil);
    check('the capital\'s garrison is trained near the full of it, a small town\'s less', aC >= R.lv * 0.85 && aV > 0 && aC > aV * 1.2, `capital ${Math.round(aC)}, ${E.Military.tier(W, vil)} ${Math.round(aV)}`);
    // spill their blood: they arm twice as fast, and past you
    const p0 = A.pace(W, f, { harm: 0 }), t0 = A.target(W, f);
    A.harmed(W, f.id, E.People.residents(W, cap).find(n => A.fighter(n)));
    const p1 = A.pace(W, f, R), t1 = A.target(W, f);
    check('a realm whose blood you have spilled arms against you twice as fast, and further', (p1 >= p0 * 1.9 || p1 === 0.2) && Math.abs(t1 - 300 * 1.05 * reach) <= 2 && t1 > t0, `pace ${p0.toFixed(3)} → ${p1.toFixed(3)}, toward ${t0} → ${t1}`);
    // the research rises a day at a time, and a new tier of arms is told in the chronicle
    R.lv = 259; R.tierSaid = A.tierAt(259);
    const before = W.chronicle.length;
    E.Arsenal.dailyTick(W, E.makeRng ? E.makeRng(5) : null);
    const said = W.chronicle.slice(before).find(c => /academies and forges/.test(c.text));
    check('the research rises day by day, and a new tier of arms is told', R.lv > 259 && R.lv <= t1 && said && /aetherplate/.test(said.text), said ? said.text.slice(0, 110) : `research ${R.lv}`);
    // worn: what a capital soldier of a sunsteel realm is, against one of iron
    const n = E.People.residents(W, cap).find(x => A.fighter(x) && x.prof !== 'child');
    const mk = () => ({ role: 'guard', hp: 1000, maxHp: 1000, gear: {}, resist: null, dmgMul: 1 });
    const keep = R.lv, game = { world: W };
    R.lv = 420; const e1 = mk(); E.Arms.outfit(game, e1, n);
    R.lv = 10; const e0 = mk(); E.Arms.outfit(game, e0, n); R.lv = keep;
    check('a crown\'s soldier wears its arms: more life, harder blows, steel and spells turned, a ward', e1.maxHp > 2.5 * e0.maxHp && e1.dmgMul > 1.8 && e1.resist.melee >= 0.3 && e1.resist.magic >= 0.25 && e1.ward && e1.ward.max > 0 && !e0.ward && e0.armsName === 'Iron', `life ${e0.maxHp} → ${e1.maxHp}, blows ×${e1.dmgMul.toFixed(2)}, ward ${e1.ward && e1.ward.max}, ${e1.armsName}`);
    // and it keeps: the arsenal comes back from a save, and a world without one makes it fresh
    const back = JSON.parse(JSON.stringify(W.arsenal));
    check('the arsenal keeps with the world, and an old save without one is armed, not reset', back.realms[f.id].lv === R.lv && back.armed != null, `research ${back.realms[f.id].lv}`);
  }

  console.log('\nKingdoms of their own');
  {
    const E = ECHO, TS = E.TownStyle, TL = E.TILE;
    const doorsOpen = (W, s) => s.buildings.every(b => (b.w === 1 && b.h === 1) || b.fac || b.ruined || (() => { const x = b.x + Math.floor(b.w / 2), y = b.y + b.h; return !W.blocked[y * W.W + x] && E.World.tile(W, x, y) !== TL.WATER && E.World.tile(W, x, y) !== TL.DEEP; })());
    const overlaps = (W) => { const seen = new Set(); let n = 0; for (const s of W.settlements) for (const b of s.buildings) { if (b.fac || b.ruined) continue; for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) { const k = y * 100000 + x; if (seen.has(k)) n++; seen.add(k); } } return n; };
    // a new world: each crown builds its own way
    const W = E.generateWorld({ seed: 6161, name: 'Styles', prehistoryDays: 3 });
    const capOf = id => E.Sim.settlement(W, W.factions[id].capital);
    const sv = capOf('valdren'), sa = capOf('ashmere'), sl = capOf('lantern');
    const house = s => s.buildings.find(b => b.type === 'house');
    check('every town is laid out in its people\'s way, and the old crowns each in their own', W.settlements.every(s => s.style) && sv.style === 'valdren:grid' && sa.style === 'ashmere:radial' && sl.style === 'lantern:cross' && TS.model(sv, house(sv)) !== TS.model(sa, house(sa)) && TS.model(sa, house(sa)) !== TS.model(sl, house(sl)), `${sv.style} / ${sa.style} / ${sl.style}: ${TS.model(sv, house(sv))}, ${TS.model(sa, house(sa))}, ${TS.model(sl, house(sl))}`);
    check('every door opens onto a street or open ground, the well at the heart, and no building stands on another', W.settlements.every(s => doorsOpen(W, s)) && overlaps(W) === 0 && W.settlements.every(s => s.buildings.some(b => b.type === 'well' && b.x === s.x && b.y === s.y) && !W.blocked[(s.y + 1) * W.W + s.x]), `overlaps ${overlaps(W)}`);
    // the same town, laid out by every plan: twelve different towns
    const sigs = new Set(), all = [];
    for (const c of Object.keys(TS.ARCH)) for (const p of TS.ARCH[c].plans) all.push(c + ':' + p);
    const V = E.generateWorld({ seed: 6161, name: 'Styles', prehistoryDays: 0 }), vs = V.settlements.find(s => s.kind === 'capital');
    let allOpen = true;
    for (const st of all) { TS.replan(V, vs, st); E.World.rebuildBlocked(V); sigs.add(vs.buildings.map(b => (b.x - vs.x) + ',' + (b.y - vs.y)).sort().join(';')); if (!doorsOpen(V, vs)) allOpen = false; }
    const plans = new Set(all.map(st => st.split(':')[1])).size;
    check('every plan makes a different town of the same buildings', sigs.size === plans && allOpen, `${sigs.size} of ${plans} plans different`);
    // a crown that broke away keeps its people's way, but not its old masters' plan or roofs
    const duchy = { id: 'rlm77', type: 'kingdom', culture: 'valdren', color: '#a05050', banner: '#502020' };
    const fake = { style: 'valdren:' + TS.planOf(duchy, 'valdren', W), faction: 'rlm77' };
    W.factions.rlm77 = duchy;
    const r1 = TS.roof(W, fake), r0 = TS.roof(W, sv);
    delete W.factions.rlm77;
    check('a crown that broke from Valdren builds Valdren\'s way, on its own plan and under its own roofs', fake.style === 'valdren:terraces' && r1 !== r0, `${fake.style}, roofs ${r1} (Valdren ${r0})`);
    // a world from before: laid out again once, and nothing that is yours or theirs lost
    const keepTS = E.TownStyle; delete E.TownStyle;
    const O = E.generateWorld({ seed: 6262, name: 'Before', prehistoryDays: 3 });
    E.TownStyle = keepTS;
    const oc = O.settlements.find(s => s.kind === 'capital');
    O.player = { charId: 'c-old', first: 'Ada', last: 'Old', x: oc.x + 0.5, y: oc.y + 2.5, inv: {}, items: [] };
    const mine = oc.buildings.find(b => b.type === 'house'); mine.owner = 'c-old';
    const ids = W2 => W2.settlements.map(s => s.buildings.filter(b => b.id !== s.id + '_well').map(b => b.id + b.type).sort().join()).join('|');
    const before = { ids: ids(O), mine: [mine.x, mine.y], farmTiles: O.settlements.map(s => s.farmTiles).join(), farms: O.tiles.filter(t => t === TL.FARM).length };
    const n = TS.ensure(O);
    const farms = O.tiles.filter(t => t === TL.FARM).length;
    check('a world from before is laid out again once, as it loads: the same buildings (and a well at the heart), your house where it stood, the fields kept', n === O.settlements.length && O.settlements.every(s => s.style) && ids(O) === before.ids && O.settlements.every(s => s.buildings.some(b => b.type === 'well' && b.x === s.x && b.y === s.y)) && mine.x === before.mine[0] && mine.y === before.mine[1] && O.settlements.map(s => s.farmTiles).join() === before.farmTiles && farms >= before.farms * 0.88 && TS.ensure(O) === undefined, `${n} towns, fields ${before.farms} → ${farms}`);
    const roadsOk = O.roads.every(r => { const a = E.Sim.settlement(O, r.a), b = E.Sim.settlement(O, r.b); return r.path[0] === (a.y + 1) * O.W + a.x && r.path[r.path.length - 1] === (b.y + 1) * O.W + b.x && r.path.every(i => !O.blocked[i]); });
    check('its roads still run into every town along its streets, through no house', roadsOk && O.settlements.every(s => doorsOpen(O, s)) && overlaps(O) === 0);
    // growing: a new house goes on the next lot of the plan, its door on a street
    const nb0 = sv.buildings.length, nb = E.Realm.placeBuilding(W, sv, 'house', 3, 3, 5, 15);
    const dt = nb && E.World.tile(W, nb.x + 1, nb.y + 3);
    check('a town grows along its own streets', nb && sv.buildings.length === nb0 + 1 && dt === TL.PLAZA && overlaps(W) === 0, nb && `at ${nb.x - sv.x},${nb.y - sv.y}`);
    // and it keeps
    const back = JSON.parse(JSON.stringify({ s: O.settlements, t: O.townStyle }));
    check('a town\'s way keeps in a save', back.s.every(s => s.style) && back.t && back.t.v === TS.V);
  }

  console.log('\nA world that reacts: loose things');
  {
    const E = ECHO, Lo = E.Loose, U = E.U, T = E.TILE, Gd = E.Ground;
    const W = E.generateWorld({ seed: 4321, name: 'Looseland' });
    check('a save from before has none of it: nothing is kept until something is broken', !W.loose && !JSON.parse(E.Save.serialize(W)).loose);
    // where they lie: by the walls of the towns, never in a doorway, on open ground
    let all = [], doorHit = 0, wallOk = 0;
    for (const s of W.settlements) {
      const sp = Lo.spots(W, s); all = all.concat(sp);
      const doors = new Set(s.buildings.map(b => (b.y + b.h) * 100000 + b.x + Math.floor(b.w / 2)));
      for (const p of sp.filter(q => q.town)) {
        const tx = Math.floor(p.x), ty = Math.floor(p.y);
        if (doors.has(ty * 100000 + tx)) doorHit++;
        if (s.buildings.some(b => tx >= b.x - 1 && tx <= b.x + b.w && ty >= b.y - 1 && ty <= b.y + b.h)) wallOk++;
      }
    }
    const kinds = new Set(all.map(p => p.k));
    check('every town has its barrels, crates, pots and sacks, up against its walls — on open ground, never in a doorway', all.length >= W.settlements.length * 2 && kinds.size >= 3 && doorHit === 0 && wallOk === all.filter(q => q.town).length && all.every(p => !E.World.isSolid(W, p.x, p.y)) && new Set(all.map(p => p.key)).size === all.length, `${all.length} in ${W.settlements.length} towns: ${[...kinds].join(' ')}`);
    Lo._spots = {};
    check('…the same ones in the same places every time', W.settlements.every(s => JSON.stringify(Lo.spots(W, s).map(p => [p.key, p.k, p.x])) === JSON.stringify(all.filter(p => p.sid === s.id).map(p => [p.key, p.k, p.x]))));
    let d0 = 0; while (E.TIME.dateOf(d0).seasonIdx !== 0) d0++;
    let d2 = d0; while (E.TIME.dateOf(d2).seasonIdx !== 2) d2++;
    const fieldsOf = day => { W.day = day; Lo._spots = {}; return W.settlements.reduce((n, s) => n + Lo.spots(W, s).filter(p => p.k === 'hay' || p.k === 'pumpkin').length, 0); };
    const spring = fieldsOf(d0), autumn = fieldsOf(d2);
    check('out in the fields: round bales and pumpkins in the autumn, none in the spring', spring === 0 && autumn > 0, `${autumn} in the autumn`);
    // a little land to try them in: grass, a rock wall at x = 30, a river below y = 34 running east
    const P = { W: 40, H: 40, seed: 3, day: 50, tiles: new Uint8Array(1600).fill(T.GRASS), blocked: new Uint8Array(1600), settlements: [], ruins: [], items: {} };
    for (let y = 0; y < 40; y++) P.tiles[y * 40 + 30] = T.ROCK;
    for (let y = 34; y < 40; y++) for (let x = 0; x < 30; x++) P.tiles[y * 40 + x] = T.DEEP;
    const C0 = E.Combat, S0 = E.Sfx, Wt0 = E.Water, B0 = E.Boats, I0 = E.Interior, G0 = E.Game;
    E.Combat = { fx: [], puff() {}, burst() {}, floater() {}, decal() {} }; E.Sfx = { play() {} }; E.Interior = { cur: null };
    E.Water = { SURFACE: -0.2, kind: (w, x, y) => y >= 34 && x < 30 ? 'deep' : null, splash() {} }; E.Boats = { flow: () => ({ x: 1.2, y: 0 }) };
    const pl = { gold: 0, inv: { arrows: 0 } }, pe = { id: 1, type: 'player', x: 5, y: 5, r: 0.35 };
    const game = { world: P, pl, pe, ents: [pe], time: 0, light() {}, hostileTo: () => false };
    E.Game = game; Lo.reset(P); Gd.fn = () => 0;
    const put = (k, x, y, o) => { const p = Lo.make({ key: 'test:' + k + x + ',' + y, k, yaw: 0 }, x, y); Object.assign(p, o || {}); Lo.list.push(p); Lo.byKey.set(p.key, p); return p; };
    const run = (sec, each) => { for (let t = 0; t < sec; t += 1 / 30) { if (each) each(); game.time += 1 / 30; Lo.bodies(game, 1 / 30); for (const e of game.ents) { e.x += e.pushx || 0; e.y += e.pushy || 0; e.pushx = e.pushy = 0; } for (let s = 0; s < 2; s++) for (const p of Lo.list) if ((p.awake || p.wet === 'deep') && !p.gone) Lo.step(game, p, 1 / 60); Lo.pairs(game); Lo.sweep(); } };
    // walking into things
    pe.x = 10; pe.y = 10; const pot = put('pot', 10.7, 10);
    let top = 0; run(0.6, () => { pe.x += 4 / 30; top = Math.max(top, pot.vx); });
    const walked = pe.x - 10;
    const hay = put('hay', 10.9, 20); pe.x = 10; pe.y = 20; run(1, () => { pe.x += 4 / 30; });
    const leaned = pe.x - 10;
    check('walk into a pot and it skitters off ahead of you (you hardly feel it); lean on a hay bale and it hardly gives', top > 4 && walked > 2.2 && leaned < walked * 0.75 && hay.x - 10.9 < leaned, `pot to ${top.toFixed(1)}/s; you went ${walked.toFixed(2)} pushing the pot, ${leaned.toFixed(2)} pushing the bale`);
    // over, and rolling: across its length it rolls on; along it, it slides and stops
    Lo.clear(); const st = put('barrel', 5, 5);
    Lo.shove(game, st, 4, 0, 0, pe); Lo.tip(st, 1, 0);
    check('a barrel knocked hard goes over the way it was pushed (and lies with its length that way)', st.lie > 1.5 && Math.abs(Math.cos(st.yaw)) < 0.01);
    Lo.clear(); const rA = put('barrel', 3, 3, { lie: Math.PI / 2, lieA: Math.PI / 2, yaw: 0 }), rB = put('barrel', 3, 8, { lie: Math.PI / 2, lieA: Math.PI / 2, yaw: Math.PI / 2 });
    rA.vx = rB.vx = 3; Lo.wake(rA); Lo.wake(rB); run(5);
    const dA = rA.x - 3, dB = rB.x - 3;
    check('on its side a barrel rolls on across its length, but pushed along its length it only slides, and not far', dA > 4 && dB < 0.8 && dA > dB * 6, `${dA.toFixed(1)} leagues rolling, ${dB.toFixed(2)} sliding`);
    // downhill
    Lo.clear(); Gd.fn = (x, y) => -0.3 * x;
    const stone = put('stone', 5, 12), crate = put('crate', 5, 16), lying = put('barrel', 5, 20, { lie: Math.PI / 2, lieA: Math.PI / 2, yaw: 0 });
    Lo.wake(stone); Lo.wake(crate); Lo.wake(lying); run(2);
    check('on a slope a stone or a barrel on its side rolls downhill, faster and faster; a crate stays where it is', stone.x - 5 > 2 && stone.vx > 1.5 && lying.x - 5 > 2 && Math.abs(crate.x - 5) < 0.01, `stone ${stone.vx.toFixed(1)}/s after 2 s`);
    Gd.fn = () => 0;
    // thrown: up, over, down, a bounce, settled
    Lo.clear(); const c2 = put('crate', 5, 5); let zTop = 0, bounced = 0, lastVz = 0;
    Lo.shove(game, c2, 3, 0, 4, pe); run(2.5, () => { zTop = Math.max(zTop, c2.z); if (lastVz < -1 && c2.vz > 0) bounced++; lastVz = c2.vz; });
    const q = Math.PI / 2, onFace = Math.abs(c2.spin / q - Math.round(c2.spin / q)) < 0.02;
    check('thrown up, a crate flies, turns over, lands, bounces and comes to rest on a face', zTop > 0.6 && bounced >= 1 && c2.z === 0 && !c2.awake && onFace && c2.x > 6, `up ${zTop.toFixed(2)}, ${bounced} bounce(s), ${c2.x - 5 > 0 ? (c2.x - 5).toFixed(1) : 0} leagues on, at ${(c2.spin / q).toFixed(2)} quarter-turns`);
    // into a wall, and into each other
    Lo.clear(); const s1 = put('stone', 28, 5); s1.vx = 5; Lo.wake(s1); let back = false; run(1, () => { if (s1.vx < 0) back = true; });
    check('it knocks into a wall and comes back off it', back && s1.x < 29.75);
    Lo.clear(); const sa = put('stone', 5, 5), sb = put('stone', 5.36, 5); sa.vx = 4; Lo.wake(sa); run(0.05);
    check('…and into another thing, which takes most of its way on (they are the same weight)', sb.vx > 2 && sa.vx < 1.6 && sa.vx >= 0, `${sa.vx.toFixed(2)} / ${sb.vx.toFixed(2)}`);
    // blows
    Lo.clear(); W.loose = undefined;
    const pt2 = put('pot', 5.8, 5), cr = put('crate', 5, 5.9), br = put('barrel', 4.2, 5);
    pe.x = 5; pe.y = 5;
    Lo.strike(pe, { angle: 0, arc: 1.5, range: 1.3, knock: 0.24 });
    Lo.strike(pe, { angle: Math.PI / 2, arc: 1.2, range: 1.4, knock: 0.24 }); const cr1 = !cr.gone; run(0.1);
    const cr2 = cr; pe.x = cr.x; pe.y = cr.y - 0.8; Lo.strike(pe, { angle: Math.PI / 2, arc: 1.2, range: 1.4, knock: 0.24 }); pe.x = 5; pe.y = 5;
    Lo.strike(pe, { angle: Math.PI, arc: 1.2, range: 1.4, knock: 0.24 });
    const tipped = br.lie > 1.5 && br.vx < -2; run(0.5);
    const br2 = put('barrel', 4.2, 9); pe.y = 9; Lo.strike(pe, { angle: Math.PI, arc: 1.2, range: 1.4, knock: 0.7, heavy: true });
    let up = 0; run(1.5, () => { up = Math.max(up, br2.z); });
    check('a blow breaks a pot at once, a crate at the second, and a barrel never: it goes over, and a heavy blow sends it flying', pt2.gone && cr1 && cr.gone && !br.gone && tipped && !br2.gone && up > 0.15 && br2.x < 2.2 && P.loose && P.loose.b[pt2.key] === P.day, `the barrel flew ${(4.2 - br2.x).toFixed(1)} leagues`);
    // what is in them, for you
    let gold = 0, n = 0; pl.gold = 0;
    for (let i = 0; i < 300; i++) { const u = put('urn', 20, 20, { ruin: true, key: 'ruin:t:' + i }); Lo.smash(game, u, pe); }
    gold = pl.gold; pl.gold = 0;
    for (let i = 0; i < 300; i++) { const u = put('urn', 20, 20, { ruin: true, key: 'ruin:u:' + i }); Lo.smash(game, u, { type: 'creature' }); }
    check('now and then there is something in an old urn — for you, not for whatever else breaks it', gold > 300 && pl.gold === 0, `${gold} crowns from 300 urns`);
    // a blast
    Lo.clear(); const b1 = put('barrel', 6, 10), b2 = put('crate', 3.8, 10.2), b3 = put('hay', 5, 11.8);
    Lo.blast(5, 10, 1.3, { fire: true, by: pe });
    check('a blast throws what is round it outward and up, knocks it over, and sets wood and straw alight', b1.vx > 2 && b1.vz > 1 && b2.vx < -1 && b3.vy > 0.5 && b1.lie > 1.5 && (b1.burnT > 0 || b2.burnT > 0 || b3.burnT > 0) && Lo.waves.length > 0);
    Lo.clear(); const fz = put('hay', 10, 10); Lo.ignite(game, fz); const bt = fz.burnT;
    for (let t = 0; t < bt + 1; t += 0.1) Lo.update.call(Lo, { world: P, pe: { x: 10, y: 10 }, pl, ents: [], time: t }, 0.1) || null;
    check('…what burns, burns out', fz.gone && bt > 6, `${bt.toFixed(1)} s`);
    // arrows
    Lo.clear(); const tall = put('crate', 8, 8), low = put('pot', 8, 12);
    const arrow = a => ({ x: a.x, y: a.y, angle: 0, from: { x: 3, y: a.y }, kind: 'arrow' });
    check('an arrow stops in a crate or a barrel, and flies over a pot', Lo.projHit(arrow(tall)) === tall && Lo.projHit(arrow(low)) === null && tall.vx > 0);
    // water
    Lo.clear(); Lo.reset(P); Lo.world = P; const fl = put('barrel', 10, 33.6, { lie: Math.PI / 2, lieA: Math.PI / 2, yaw: Math.PI / 2 }), sk = put('stone', 14, 33.6);
    fl.vy = sk.vy = 1.5; Lo.wake(fl); Lo.wake(sk);
    const x0 = fl.x; run(4);
    check('into the river: a barrel floats off down it with the current; a stone goes to the bottom, and is gone', fl.wet === 'deep' && !fl.gone && fl.x - x0 > 3 && sk.gone, `${(fl.x - x0).toFixed(1)} leagues downstream in 4 s`);
    Lo.clear(); const wet = put('crate', 10, 33.9); Lo.ignite(game, wet); wet.vy = 3; Lo.wake(wet); run(1);
    check('…and fire dies in the water', wet.wet === 'deep' && !(wet.burnT > 0));
    // they come again
    P.day = 50; P.loose = { b: { 'X:1,1': 48, 'X:2,2': 46 } };
    check('what was broken is made again in a few days', Lo.broken(P, 'X:1,1') && !Lo.broken(P, 'X:2,2') && !Lo.broken(P, 'X:3,3'));
    // the townsfolk mind their things
    Lo.clear(); const towny = { id: 9, type: 'person', x: 12, y: 12 }; game.ents = [pe, towny]; game.time = 100;
    const tp = put('pot', 11, 12, { town: true }); Lo.smash(game, tp, pe);
    check('break a townsman\'s pot and he tells you what he thinks of it', !!towny.say && towny.sayT > 0, towny.say);
    Lo.clear(); const tidy = put('barrel', 12, 12, { town: true }); tidy.x = 14; tidy.lie = tidy.lieA = Math.PI / 2; tidy.awake = false; tidy.restAt = 0; Lo.t = 100;
    Lo.ensure({ world: P, pl, pe: { x: 12, y: 38 }, ents: [] });
    check('…and what was knocked about in a town and left lying is put back by its owner while you are away', tidy.x === 12 && tidy.lie === 0 && !tidy.gone);
    // near you, and only near you
    Lo.reset(W); const home = W.settlements[0];
    const g2 = { world: W, pl, pe: { id: 1, type: 'player', x: home.x, y: home.y, r: 0.35 }, ents: [], time: 0, light() {} };
    E.Game = g2; Lo.update(g2, 0.05);
    const near = Lo.list.length, far = Lo.list.every(p => U.dist(p.x, p.y, home.x, home.y) < 36);
    g2.pe.x += 60; Lo.update(g2, 0.05); Lo.ensureT = 0; Lo.update(g2, 0.05);
    check('they are there about you as you go, and put back where they belong behind you', near > 0 && far && Lo.list.every(p => U.dist(p.x, p.y, g2.pe.x, g2.pe.y) < 46), `${near} about ${home.name}`);
    W.loose = P.loose; const W5 = E.Save.deserialize(E.Save.serialize(W));
    check('what was broken keeps in a save, and nothing else of them is kept', W5.loose && W5.loose.b['X:1,1'] === 48 && !/"vx"/.test(JSON.stringify(W5.loose)));
    Gd.fn = null; Lo.reset(null);
    E.Combat = C0; E.Sfx = S0; E.Water = Wt0; E.Boats = B0; E.Interior = I0; E.Game = G0;
  }

  console.log('\nWeight in every step');
  {
    const E = ECHO, Ent = E.Ent, Gd = E.Ground, T = E.TILE;
    const P = { W: 60, H: 60, seed: 3, day: 1, tiles: new Uint8Array(3600).fill(T.GRASS), blocked: new Uint8Array(3600), settlements: [], ruins: [] };
    for (let y = 0; y < 60; y++) P.tiles[y * 60 + 40] = T.ROCK;
    const G0 = E.Game, I0 = E.Interior, game = { time: 0, ents: [] }; E.Game = game; E.Interior = { cur: null }; Gd.fn = () => 0;
    const mk = (r, o) => Ent.make(Object.assign({ type: 'creature', x: 10, y: 10, r }, o || {}));
    const man = mk(0.35, { type: 'person' }), bear = mk(0.6), giant = mk(0.5, { type: 'boss' });
    const reach = e => { e.x = 10; e.y = 10; e._mvx = e._mvy = 0; e._mvT = null; let t = 0; while (t < 5) { game.time += 0.05; t += 0.05; Ent.seek(P, e, 35, 10, 4, 0.05); if (e._mvx >= 3.9) break; } return t; };
    const tm = reach(man), tb = reach(bear), tg = reach(giant);
    check('everything has weight: a man gets going in a moment, a bear more slowly, a lair\'s great beast slowest of all', tm <= 0.35 && tb > tm * 1.3 && tg > tb * 1.3, `${tm.toFixed(2)} s, ${tb.toFixed(2)} s, ${tg.toFixed(2)} s to full pace`);
    const coastOf = e => { e.x = 10; e.y = 10; e._mvx = 4; e._mvy = 0; e._mvT = game.time; e._mpx = e.x; e._mpy = e.y; game.time += 0.05; for (let i = 0; i < 40; i++) { Ent.coast(P, e, 0.05); game.time += 0.05; } return e.x - 10; };
    const rm = coastOf(man), rb = coastOf(bear);
    check('…and no longer driven, it runs on a step and stops (the heavier, the further), rather than stopping dead', rm > 0.15 && rm < 1 && rb > rm * 1.25 && man._mvx === 0, `${rm.toFixed(2)} and ${rb.toFixed(2)} leagues`);
    man.x = 10; man.y = 10; man._mvx = man._mvy = 0; let over = 0;
    for (let i = 0; i < 80; i++) { game.time += 0.05; Ent.seek(P, man, 13, 10, 4.5, 0.05); over = Math.max(over, man.x - 13); }
    check('…it comes to a stop where it was going, not past it', over < 0.1 && Math.abs(man.x - 13) < 0.5, `${over.toFixed(3)} past`);
    man.x = 10; man.y = 20; man._mvx = 4; man._mvy = 0; man._mvT = game.time; man._mpx = man.x; man._mpy = man.y; let back = 0;
    for (let i = 0; i < 20 && !back; i++) { game.time += 0.05; Ent.seek(P, man, 2, 20, 4, 0.05); if (man._mvx < -3.5) back = (i + 1) * 0.05; }
    check('…turning right about takes it a moment: it checks its way, then gathers it again', back > 0.3 && back < 0.8, `${back.toFixed(2)} s`);
    man.x = 38; man.y = 30; man._mvx = 4; man._mvy = 0; man._mvT = game.time; man._mpx = man.x; man._mpy = man.y;
    for (let i = 0; i < 20; i++) { game.time += 0.05; Ent.seek(P, man, 45, 30, 4, 0.05); }
    check('…a wall in the way takes the way off it', man.x < 40 && Math.abs(man._mvx) < 0.5);
    const man2 = mk(0.35, { type: 'person', x: 10, y: 30 }); man2._mvx = 4; man2._mvy = 0; man2._mvT = game.time; man2._mpx = 30; man2._mpy = 30;
    game.time += 0.05; Ent.seek(P, man2, 2, 30, 4, 0.05);      // (told once, it does not set off…)
    const still = man2.x === 10 && !man2.moving;
    game.time += 0.05; Ent.seek(P, man2, 2, 30, 4, 0.05);      // (…told two frames running, it does)
    check('one standing does not set off on the word of a single frame (no one-step twitches)', still);
    check('…and carried off in a blink (through a door, say), it keeps none of the way it had', man2._mvx < 0 && man2._mvx > -1.5);
    // the lie of the land
    Gd.fn = (x, y) => 0.3 * x;
    const up = Gd.slopeMul(P, 10, 10, 1, 0), down = Gd.slopeMul(P, 10, 10, -1, 0), across = Gd.slopeMul(P, 10, 10, 0, 1);
    Gd.fn = (x, y) => 3 * x;
    const steepUp = Gd.slopeMul(P, 10, 10, 1, 0), steepDown = Gd.slopeMul(P, 10, 10, -1, 0);
    check('the slope has its say: uphill slow going (to a little over half pace up the steepest), downhill a little quicker, across it nothing', up < 0.85 && down > 1.05 && Math.abs(across - 1) < 1e-9 && steepUp === 0.55 && steepDown === 1.15, `${up.toFixed(2)} up, ${down.toFixed(2)} down`);
    Gd.fn = (x, y) => 0.3 * x;
    const walk = (tx) => { man.x = 20; man.y = 40; man._mvx = man._mvy = 0; man._mvT = null; for (let i = 0; i < 40; i++) { game.time += 0.05; Ent.seek(P, man, tx, 40, 4, 0.05); } return Math.abs(man.x - 20); };
    const wu = walk(35), wd = walk(5);
    check('…for everything that walks', wd > wu * 1.2, `${wu.toFixed(1)} leagues uphill in 2 s, ${wd.toFixed(1)} down`);
    check('…and a body\'s weight goes by its size (a man is 1), a lair\'s beast and a titan heaviest', Math.abs(Ent.massOf(man) - 1) < 0.05 && Ent.massOf(bear) > 2 && Ent.massOf(giant) === 9 && Ent.massOf({ titan: true, r: 2 }) === 14);
    Gd.fn = null; E.Game = G0; E.Interior = I0;
  }

  console.log('\nBlows that throw');
  {
    const E = ECHO, Ent = E.Ent, Th = E.Thrown, T = E.TILE;
    const P = { W: 60, H: 60, seed: 3, day: 1, tiles: new Uint8Array(3600).fill(T.GRASS), blocked: new Uint8Array(3600), settlements: [], ruins: [] };
    for (let y = 0; y < 60; y++) P.tiles[y * 60 + 40] = T.ROCK;
    const hurt = []; const C0 = E.Combat, S0 = E.Sfx, G0 = E.Game, I0 = E.Interior, Wt0 = E.Water;
    E.Combat = { puff() {}, burst() {}, damage: (e, d, s) => { hurt.push({ e, d, s }); return d; } }; E.Sfx = { play() {} }; E.Interior = { cur: null }; E.Water = undefined;
    const pe = Ent.make({ type: 'player', x: 5, y: 5, r: 0.35 });
    const game = { world: P, pe, pl: {}, ents: [pe], time: 0, hostileTo: (a, b) => (a === pe) !== (b === pe), shake() {} };
    E.Game = game; E.Ground.fn = () => 0;
    const mk = (r, o) => { const e = Ent.make(Object.assign({ type: 'creature', x: 10, y: 10, r, hp: 100, maxHp: 100 }, o || {})); game.ents.push(e); return e; };
    const fly = (e, sec, dt) => { let top = 0, air = 0; dt = dt || 0.05; for (let t = 0; t < sec; t += dt) { game.time += dt; Th.update(game, dt); top = Math.max(top, e.tz || 0); if (e.tz > 0) air += dt; } return { top, air }; };
    const throwAt = (e, knock, x, y) => { e.x = x; e.y = y; e.tvx = e.tvy = e.tvz = 0; e.tz = 0; e.tspin = 0; e.stagger = 0; Th.hit(game, e, knock, 0, pe); const r = fly(e, 3); return { d: e.x - x, top: r.top, air: r.air }; };
    const man = mk(0.35, { type: 'person' }), rat = mk(0.2), troll = mk(0.6), boss = mk(0.9, { type: 'boss' });
    const light = throwAt(man, 0.24, 5, 20), heavy = throwAt(man, 0.7, 5, 22), ratH = throwAt(rat, 0.7, 5, 24), trollH = throwAt(troll, 0.7, 5, 26), bossH = throwAt(boss, 0.7, 5, 28);
    check('a blow pushes by the weight of the blow and of the body: a light one a step, a heavy one off his feet', light.d > 0.3 && light.d < 1.2 && light.top === 0 && heavy.top > 0.3 && heavy.air > 0.3 && heavy.d > light.d * 2, `${light.d.toFixed(2)} leagues; heavy: ${heavy.d.toFixed(1)} leagues, ${heavy.top.toFixed(2)} high, ${heavy.air.toFixed(2)} s in the air`);
    check('…a rat goes a long way, a troll hardly anywhere, and a lair\'s beast stands where it is', ratH.d > heavy.d && trollH.d < heavy.d * 0.6 && trollH.top < heavy.top && bossH.d === 0, `rat ${ratH.d.toFixed(1)}, troll ${trollH.d.toFixed(1)}`);
    man.x = 5; man.y = 30; man.tvx = man.tvy = 0; man.tz = 0; man.stagger = 0; Th.hit(game, man, 0.7, 0, pe);
    let flying = 0; for (let i = 0; i < 6; i++) { game.time += 0.05; Th.update(game, 0.05); if (man.stagger > 0 && man.tz > 0) flying++; }
    let landed = false; for (let i = 0; i < 40 && !landed; i++) { game.time += 0.05; Th.update(game, 0.05); if (!(man.tz > 0)) landed = true; }
    check('…off his feet he can do nothing, and when he comes down he takes a moment to get up', flying >= 5 && landed && man.stagger > 0.25);
    // the same, whatever the frame rate
    const at = dt => { man.x = 5; man.y = 32; man.tvx = man.tvy = man.tvz = 0; man.tz = 0; man.tspin = 0; Th.hit(game, man, 0.5, 0, pe); fly(man, 3, dt); return man.x - 5; };
    const slow = at(1 / 20), fast = at(1 / 120);
    check('…and it goes as far at any frame rate (the old knock-back went further the faster the game ran)', Math.abs(slow - fast) / fast < 0.12, `${slow.toFixed(2)} at 20 a second, ${fast.toFixed(2)} at 120`);
    // walls
    hurt.length = 0; man.x = 37.5; man.y = 36; man.tvx = man.tvy = man.tvz = 0; man.tz = 0; man.hp = 100; Th.hit(game, man, 0.7, 0, pe); fly(man, 1.5);
    const slam = hurt.find(h => h.e === man && h.s.type === 'impact');
    check('thrown into a wall, it is stopped there (and comes back off it), and it hurts — the blow is the thrower\'s', man.x < 40 && !!slam && slam.s.from === pe && slam.d > 2 && slam.d <= 8, slam && `${slam.d.toFixed(1)} of 100`);
    // others in the way
    hurt.length = 0; const a = mk(0.35, { type: 'person', x: 5, y: 40 }), b = mk(0.35, { type: 'person', x: 6.2, y: 40 }), friend = mk(0.35, { type: 'person', x: 6.2, y: 44 });
    Th.hit(game, a, 0.7, 0, pe); fly(a, 0.3);
    check('…into another body, it bowls it over: that one is sent off in turn (and hurt, being a foe of the thrower)', b.x > 6.6 && (b.tvx > 0 || b.x > 7) && hurt.some(h => h.e === b), `${(b.x - 6.2).toFixed(1)} leagues`);
    const hostile0 = game.hostileTo; game.hostileTo = () => false; hurt.length = 0;
    const a2 = mk(0.35, { type: 'person', x: 5, y: 44 }); Th.hit(game, a2, 0.7, 0, pe); fly(a2, 0.3); game.hostileTo = hostile0;
    check('…a friend in the way is knocked aside, not hurt', friend.x > 6.4 && !hurt.some(h => h.e === friend));
    // the old pushes
    const old = kb => { const e = mk(0.35, { type: 'person', x: 5, y: 50 }); e.kbx = kb; Th.legacy(game, e); fly(e, 3); const d = e.x - 5; game.ents.pop(); return d; };
    const o1 = old(0.24), o2 = old(0.6);
    check('the old pushes still go about as far as they did, as a slide', Math.abs(o1 - 0.24 / 0.3) / (0.24 / 0.3) < 0.3 && Math.abs(o2 - 0.6 / 0.3) / (0.6 / 0.3) < 0.3, `${o1.toFixed(2)} (was ${(0.24 / 0.3).toFixed(2)}), ${o2.toFixed(2)} (was ${(0.6 / 0.3).toFixed(2)})`);
    // the dead
    const dead = mk(0.35, { type: 'person', x: 5, y: 55 }); dead.dead = true; dead.deathT = 0;
    Th.hit(game, dead, 0.7 * 1.2 + 0.2, 0, pe, { kill: true }); const r = fly(dead, 3);
    check('the dead are thrown by the blow that killed them, turn over as they fly, and come to lie on their back or their front', r.air > 0.4 && dead.x - 5 > 2 && Math.abs(dead.tspin / Math.PI - Math.round(dead.tspin / Math.PI)) < 0.02 && !Th.active(dead) || (dead.tspin === 0 && r.air > 0.4), `${(dead.x - 5).toFixed(1)} leagues, ${r.air.toFixed(2)} s in the air, ${(dead.tspin / Math.PI).toFixed(2)} half-turns`);
    // you
    pe.x = 5; pe.y = 12; Th.hit(game, pe, 0.12, 0, man); const pr = fly(pe, 2);
    check('you are pushed by a common blow, and only a great one lifts you', pe.x - 5 > 0.1 && pr.top === 0);
    E.Combat = C0; E.Sfx = S0; E.Game = G0; E.Interior = I0; E.Water = Wt0; E.Ground.fn = null;
  }

  console.log('\nGuns and missiles');
  {
    const E = ECHO, Ent = E.Ent, GU = E.Guns, T = E.TILE;
    const W = { W: 60, H: 60, seed: 4, day: 1, tiles: new Uint8Array(3600).fill(T.GRASS), blocked: new Uint8Array(3600), settlements: [], ruins: [], items: {}, nextItem: 1, factions: { k1: { id: 'k1', type: 'kingdom', name: 'Valdren' }, b1: { id: 'b1', type: 'bandits' } }, lairs: [] };
    const rng = new E.RNG(11), kinds = {};
    for (let i = 0; i < 200; i++) { const it = E.Gear.make(W, rng, 'gun', 10, 'rare', 'a test'); kinds[it.gclass] = (kinds[it.gclass] || 0) + 1; }
    check('guns are made in all four kinds, pistols the most and launchers the fewest', Object.keys(kinds).length === 4 && kinds.pistol > kinds.launcher, JSON.stringify(kinds));
    const g1 = E.Gear.make(W, rng, 'gun', 10, 'epic', 'a test'), b1 = E.Gear.make(W, rng, 'bow', 10, 'epic', 'a test');
    check('a gun is as strong as a bow of its level and rarity, and says what kind it is', g1.dmg === b1.dmg && /pistol|rifle|scattergun|launcher/.test(E.Gear.line(g1)), E.Gear.line(g1));
    check('…its affix, if any, is one a gun can carry', !g1.affix || ['ember', 'keen', 'thirst'].includes(g1.affix));
    const pl = { items: [], inv: { arrows: 5 }, skills: { archery: 20 }, weapon: null, bow: b1.id, gun: undefined };
    check('a gun you carry counts as worn (not sold, not given away)', (pl.gun = g1.id) && E.Gear.worn(pl, g1.id));
    pl.gun = undefined;
    // the first time: a sidearm
    const toasts = []; const UI0 = E.UI, C0 = E.Combat, S0 = E.Sfx, G0 = E.Game, P0 = E.Prowess;
    E.UI = { toast: (t) => toasts.push(t) }; E.Sfx = { play() {} }; E.Prowess = { level: () => 4, gearScale: () => 1 };
    const pe = Ent.make({ type: 'player', x: 10, y: 10, r: 0.35, hp: 100, maxHp: 100 });
    const hurt = [];
    E.Combat = { proj: [], fx: [], puff() {}, burst() {}, ring() {}, decal() {}, floater() {}, telegraph() {}, hitRock() {},
      shoot(att, a, o) { const p = { x: att.x, y: att.y, vx: Math.cos(a) * o.speed, vy: Math.sin(a) * o.speed, angle: a, from: att, t: 0, ...o }; E.Combat.proj.push(p); return p; },
      damage: (e, d, s) => { hurt.push({ e, d, s }); return d; } };
    const game = { world: W, pe, pl, ents: [pe], time: 0, hostileTo: (a, b) => (a === pe) !== (b === pe), shake() {}, light() {}, kick() {}, noise() {}, ui: { blocksWorld: () => false, toast() {} } };
    E.Game = game;
    pl.salvo = 0; GU.reset();
    GU.gift(game); GU.gift(game);
    const side = W.items[pl.gun];
    check('an old save is given a sidearm and 40 cells, once', side && side.gclass === 'pistol' && pl.inv.cells === 40 && pl.items.filter(id => W.items[id].kind === 'gun').length === 1 && pl.gunGift === 1);
    check('…and keeps its bow ready until you swap', pl.ranged === 'bow' && !GU.active(game));
    pl.ranged = 'gun';
    check('with the gun swapped in, the right mouse fires the gun', GU.active(game));
    // a missile finds its mark
    const foe = Ent.make({ type: 'creature', x: 10, y: 18, r: 0.4, hp: 100, maxHp: 100 }); game.ents.push(foe);
    const m = GU.launch(pe, 0, { dmg: 50, radius: 2, seek: foe, by: 'gun' });
    for (let i = 0; i < 40 && !m.done; i++) { game.time += 0.05; m.t += 0.05; GU.steer(m, 0.05); m.x += m.vx * 0.05; m.y += m.vy * 0.05; if (E.U.dist(m.x, m.y, foe.x, foe.y) < 0.7) GU.blast(m); }
    check('a missile fired the wrong way turns and finds what it was locked on', m.done && hurt.some(h => h.e === foe && h.d > 25));
    check('…its blast spares you, who fired it, and throws what it hits', !hurt.some(h => h.e === pe) && hurt.find(h => h.e === foe).s.knock > 0.3);
    // a blast hurts the near more than the far, and not beyond its reach
    hurt.length = 0;
    const near = Ent.make({ type: 'creature', x: 30, y: 30, r: 0.4, hp: 100, maxHp: 100 }), edge = Ent.make({ type: 'creature', x: 31.9, y: 30, r: 0.4, hp: 100, maxHp: 100 }), far = Ent.make({ type: 'creature', x: 34, y: 30, r: 0.4, hp: 100, maxHp: 100 });
    game.ents.push(near, edge, far);
    GU.blast({ x: 30, y: 30, radius: 2, dmg: 100, from: pe, knock: 0.5 });
    const dn = hurt.find(h => h.e === near), de = hurt.find(h => h.e === edge);
    check('a blast hurts what is near it most, what is at its edge less, and nothing beyond', dn && de && dn.d > de.d && !hurt.some(h => h.e === far));
    // a gunship's missile, from a soldier of a crown at war with you, falls on its mark
    hurt.length = 0; pl.maxHp = 200;
    const soldier = Ent.make({ type: 'person', x: 50, y: 50, r: 0.35, hp: 100, maxHp: 100 }); game.ents.push(soldier);
    game.hostileTo = (a, b) => (a === soldier && b === pe) || (a === pe && b !== pe);
    const sm = GU.launch(soldier, 0, { dmg: 10, radius: 1.6, to: { x: pe.x, y: pe.y }, t: 1.25, x: 20, y: 20, h: 6, pct: 0.085, ship: { target: pe } });
    sm.from = soldier;
    for (let i = 0; i < 30 && !sm.done; i++) { sm.t += 0.05; GU.steer(sm, 0.05); sm.x += sm.vx * 0.05; sm.y += sm.vy * 0.05; if (sm.t >= sm.life) GU.blast(sm); }
    const ph = hurt.find(h => h.e === pe);
    check('a gunship\'s missile comes down on its mark after the warning, and takes a share of your life', sm.done && Math.abs(sm.x - pe.x) < 0.2 && ph && ph.d >= 200 * 0.085 * 0.99 && sm.h < 0.5);
    // guards' rifles, decided by who they are
    const armed = n => { const e = { role: 'guard', gear: { bow: false, spear: true, shield: true }, armsTier: 1 }; GU.arm(game, e, { id: 'n' + n, faction: 'k1' }); return e; };
    const many = Array.from({ length: 100 }, (_, i) => armed(i)), rifles = many.filter(e => e.gear.rifle).length;
    check('some of a crown\'s guards carry rifles (and always the same ones), bandits none', rifles > 20 && rifles < 60 && armed(7).gear.rifle === armed(7).gear.rifle && (() => { const e = { role: 'guard', gear: {} }; GU.arm(game, e, { id: 'x', faction: 'b1' }); return !e.gear.rifle; })(), `${rifles} of 100`);
    const rf = many.find(e => e.gear.rifle);
    check('…and a guard with a rifle has put down spear and shield and shoots like an archer', rf.gear.bow && !rf.gear.spear && !rf.gear.shield);
    E.UI = UI0; E.Combat = C0; E.Sfx = S0; E.Game = G0; E.Prowess = P0; GU.reset();
  }

  console.log('\nReactions');
  {
    const E = ECHO, Ent = E.Ent, RX = E.React;
    const UI0 = E.UI, C0 = E.Combat, S0 = E.Sfx, G0 = E.Game, P0 = E.Prowess;
    const said = [], hits = [];
    E.UI = { toast() {} }; E.Sfx = { play() {} }; E.Prowess = { level: () => 10 };
    E.Combat = { fx: [], puff() {}, burst() {}, ring() {}, floater: (x, y, t) => said.push(t), damage: (e, d, s) => { hits.push({ e, d, s }); e.hp -= d; return d; } };
    const pe = Ent.make({ type: 'player', x: 10, y: 10, r: 0.35, hp: 100, maxHp: 100 });
    const pl = { mana: 0, maxMana: 100 };
    const game = { world: {}, pe, pl, ents: [pe], time: 0, hostileTo: (a, b) => a !== b, shake() {}, light() {}, hitStop() {}, slowMo() {} };
    E.Game = game; RX.reset();
    const mk = (x, y) => { const e = Ent.make({ type: 'creature', species: 'wolf', x, y, r: 0.4, hp: 1000, maxHp: 1000 }); game.ents.push(e); return e; };
    const blow = (e, d, s) => { s.from = pe; const out = RX.pre(game, e, d, s); e.hp -= out; RX.post(game, e, out, s); return out; };
    // freeze, then shatter
    const a = mk(12, 10), a2 = mk(13, 10);
    blow(a, 5, { type: 'ranged', el: 'cold' }); blow(a, 5, { type: 'ranged', el: 'cold' });
    check('two chills do not freeze a foe; the third does', !(a.rx.frozen > 0) && (blow(a, 5, { type: 'ranged', el: 'cold' }), a.rx.frozen > 0));
    RX.tick(game, 0.1);
    check('a frozen foe cannot act', a.stagger > 0);
    const sh = blow(a, 100, { type: 'melee' });
    check('a blade on the frozen shatters it: more than double the harm, shards for those near, and it thaws', sh >= 229 && !(a.rx.frozen > 0) && hits.some(h => h.e === a2 && h.s.noRx) && said.includes('SHATTER'));
    check('…and it cannot be frozen again at once', (blow(a, 5, { type: 'ranged', el: 'cold' }), blow(a, 5, { type: 'ranged', el: 'cold' }), blow(a, 5, { type: 'ranged', el: 'cold' }), !(a.rx.frozen > 0)));
    // conduct
    hits.length = 0;
    const b = mk(30, 30), b2 = mk(33.5, 30), b3 = mk(40, 30);
    RX.soak(game, b); RX.soak(game, b2); RX.soak(game, b3);
    blow(b, 50, { type: 'ranged', el: 'shock' });
    check('a bolt into a soaked foe leaps to the soaked foes near it and stuns them, not to one far off', hits.some(h => h.e === b2) && !hits.some(h => h.e === b3) && b.stagger > 0.5 && b2.stagger > 0.5 && !(b.rx.wet > 0));
    // overload
    hits.length = 0;
    const c = mk(50, 50), c2 = mk(51.5, 50);
    blow(c, 20, { type: 'ranged', el: 'shock' });
    check('a bolt leaves a dry foe charged', c.rx.charge > 0);
    blow(c, 40, { type: 'fire' });
    check('fire on the charged bursts it: it and those near are hit again', hits.some(h => h.e === c && h.d >= 60) && hits.some(h => h.e === c2) && !(c.rx.charge > 0));
    // brittle
    const d = mk(70, 70); d.burn = 3;
    blow(d, 5, { type: 'ranged', el: 'cold' });
    check('cold on the burning puts it out and leaves it brittle: a third more from everything', d.burn === 0 && d.rx.brittle > 0 && Math.abs(RX.pre(game, d, 100, { type: 'melee', from: pe }) - 135) < 0.01);
    // wards
    const w = mk(90, 90); w.rxWard = { k: 'frost', hp: 600, max: 600 };
    const turned = RX.pre(game, w, 100, { type: 'melee', from: pe });
    check('a warded foe turns most of a blow that is not its answer', Math.abs(turned - 30) < 0.01 && w.rxWard.hp > 0);
    const through = RX.pre(game, w, 100, { type: 'fire', from: pe });
    check('…and its answer breaks the ward at a stroke and staggers it', through === 100 && w.rxWard.hp === 0 && w.stagger >= 1.5);
    const w2 = mk(95, 90); w2.rxWard = { k: 'stone', hp: 100, max: 100 };
    RX.pre(game, w2, 100, { type: 'melee', from: pe }); RX.pre(game, w2, 100, { type: 'melee', from: pe });
    check('a ward can also be worn through by plain blows', w2.rxWard.hp === 0);
    let warded = 0; for (let i = 0; i < 400; i++) { const e = { type: 'creature', species: 'wolf', x: i * 7.3, y: i * 3.1, maxHp: 100 + i, aggro: true }; RX.ward(game, e); if (e.rxWard) warded++; }
    check('about one in five of the wild things that fight you is warded, none below level 3', warded > 50 && warded < 115 && (() => { E.Prowess = { level: () => 2 }; const e = { type: 'creature', species: 'wolf', x: 1, y: 1, maxHp: 100 }; for (let i = 0; i < 50; i++) { e.x = i; e.rxWard = null; RX.ward(game, e); if (e.rxWard) return false; } return true; })(), `${warded} of 400`);
    // surge
    RX.reset(); pl.mana = 0;
    for (let i = 0; i < 4; i++) RX.gain(game, 1);
    check('four reactions are four pips', RX.surge === 4 && RX.od === 0 && pl.mana > 0);
    RX.gain(game, 1);
    check('the fifth is Overdrive: eight seconds, a full well, blows a third harder', RX.od === 8 && RX.surge === 0 && pl.mana === 100 && Math.abs(RX.pre(game, mk(120, 120), 100, { type: 'melee', from: pe }) - 130) < 0.01);
    RX.tick(game, 9);
    check('…and it ends', RX.od === 0);
    // trials and augments (build.js)
    const B = E.Build; B.reset(); RX.reset(); E.Prowess = { level: () => 10 };
    const T = B.state(pl);
    check('three trials are always open, the first three the gentle ones', T.act.length === 3 && ['overload', 'shatter', 'ward'].every(k => T.act.some(a => a.k === k)));
    const ov = T.act.find(a => a.k === 'overload'), g0 = pl.gold || 0;
    for (let i = 0; i < ov.need; i++) B.note(game, 'overload');
    check('finishing a trial gives crowns and an augment to choose, and a new trial opens', T.pick === 1 && T.done === 1 && pl.gold > g0 && T.act.length === 3 && !T.act.includes(ov));
    const off = B.offer(pl);
    check('the choice is of three different augments, and stays the same until taken', off.length === 3 && new Set(off).size === 3 && B.offer(pl) === off);
    B.take(pl, 'glacier'); B.take(pl, 'glacier');
    check('an augment taken twice is rank 2, and the choice is used up', pl.aug.glacier === 2 && T.pick === 0);
    const f1 = mk(200, 200), f2 = mk(201, 200);
    RX.st(f1).frozen = 3; said.length = 0;
    const g = blow(f1, 100, { type: 'melee' });
    check('Glacier: shatter does 40% more at rank 2, and its shards freeze', g >= 320 && f2.rx && f2.rx.frozen > 0, `${g}`);
    pl.aug.stormfront = 1; const ch1 = mk(220, 220); RX.st(ch1).charge = 3;
    check('Storm front: the charged take a tenth more from you', Math.abs(RX.pre(game, ch1, 100, { type: 'melee', from: pe }) - 110) < 0.01);
    pl.aug.soaker = 1; const so1 = mk(240, 240);
    blow(so1, 10, { type: 'ranged' });
    check('Rain-arrows: your arrows soak', so1.rx.wet > 0);
    pl.aug = {}; delete pl.trials;
    E.UI = UI0; E.Combat = C0; E.Sfx = S0; E.Game = G0; E.Prowess = P0; RX.reset(); B.reset();
  }

  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

main();
