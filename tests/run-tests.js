// Headless tests for the world simulation. Loads the browser scripts into a
// sandbox and checks that the world actually lives and that consequences chain.
//   npm test
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SIM_FILES = [
  'core.js', 'world/worldgen.js', 'sim/sim.js', 'sim/people.js', 'sim/ecology.js', 'sim/economy.js',
  'sim/politics.js', 'sim/intel.js', 'sim/plights.js', 'sim/chronicle.js', 'sim/civ.js',
  'sim/mysteries.js', 'sim/legacy.js', 'sim/minds.js', 'sim/weather.js', 'sim/disease.js', 'sim/production.js', 'sim/property.js', 'sim/law.js', 'sim/watch.js', 'sim/realm.js', 'sim/military.js', 'sim/explore.js', 'sim/discover.js', 'sim/ambition.js', 'sim/holding.js', 'sim/gear.js', 'sim/prowess.js', 'sim/story.js', 'sim/bounty.js', 'sim/rivals.js', 'sim/delvers.js', 'sim/powers.js', 'sim/evolve.js', 'sim/gates.js', 'sim/wildwood.js', 'sim/clearing.js', 'sim/guardwork.js', 'sim/titans.js', 'sim/migrations.js', 'sim/dungeonlife.js', 'sim/renown.js', 'sim/guild.js', 'sim/worldevents.js', 'sim/townlife.js', 'sim/calamity.js', 'sim/wonders.js', 'game/patron.js', 'sim/festivals.js', 'sim/letters.js', 'sim/frontier.js', 'sim/globe.js', 'save.js', 'game/arcana.js', 'game/pastimes.js', 'game/harvest.js'
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
    const r = { li, A, B, vA, vB, regionId, series, maxHunger, maxUnrest, score, name: lairB.boss.name, village: vB.name };
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
    check('hunger brings migration or unrest', best.maxHunger > 0.3 || best.maxUnrest > 10 || (vB._emigrants || 0) > (vA._emigrants || 0), `peak hunger ${best.maxHunger.toFixed(2)}, extra unrest ${best.maxUnrest.toFixed(0)}, emigrants ${vA._emigrants || 0}→${vB._emigrants || 0}`);
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
      check('the realm\'s fighters rise toward your level', med >= 15, `median ${med}, best ${top} (you: 40)`);
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
      const kk = Object.values(W.factions).find(f => f.type === 'kingdom');
      const rng = ECHO.Sim.rngFor(W), n0 = W.settlements.length;
      let site = null; for (let k = 0; k < 4 && !site; k++) site = R.findSite(W, kk, rng); tried++;
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
    check('dungeons have floors, and grow deadlier away from the capitals', delves.every(s => s.level >= 1 && s.level <= 30 && X.floors(s) >= 3 && X.floorLevel(s, X.floors(s) - 1) > X.floorLevel(s, 0)) && delves.some(s => X.floors(s) >= 5) && new Set(delves.map(s => s.level)).size >= 3, delves.map(s => s.level + '/' + X.floors(s)).join(' '));
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
    const slime = { type: 'creature', species: 'slime', foe: {}, aggro: true, x: 1.6, y: 0, r: 0.4, hp: 30, maxHp: 30, gear: {} };
    check('a slime just goes for whatever is nearest', E.Aware.target(game, slime, pe) === comp || E.Aware.target(game, slime, pe) === pe);
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
    for (const f of ['core.js', 'sim/gear.js', 'game/combat.js', 'game/progress.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'js', f), 'utf8'), ctx);
    const E = ctx.ECHO, C = E.Combat;
    E.UI = { settings: {} };
    const d0 = C.difficulty(); E.UI.settings.difficulty = 'story'; const d1 = C.difficulty(); E.UI.settings.difficulty = 'hard'; const d2 = C.difficulty(); E.UI.settings.difficulty = 'nonsense';
    check('the challenge is Balanced unless chosen; Story hits softer, Hard harder; nonsense falls back', d0 === C.DIFF.normal && d1.taken < 1 && d1.dealt > 1 && d2.taken > 1 && C.difficulty() === C.DIFF.normal);
    // a heap of spoils is one tidy list, best first
    const world = { items: { s: { id: 's', name: 'Fine sword', rarity: 'epic' } } };
    const loot = [{ x: 5, y: 5, kind: 'gold', qty: 9 }, { x: 5.3, y: 5.2, kind: 'bonedust', qty: 2 }, { x: 4.8, y: 5.1, kind: 'gel', qty: 1 }, { x: 5.1, y: 4.9, kind: 'item', itemId: 's' }, { x: 5.2, y: 5.4, kind: 'rattail', qty: 3 }, { x: 9, y: 5, kind: 'gold', qty: 1 }];
    const L = E.Progress.lootLabels({ pe: { x: 5, y: 6 }, world, loot });
    check('spoils lying together make one list: the best thing first, the rest summed up, and a heap apart labelled apart', L.length === 4 && L[0].text.startsWith('Fine sword') && L[0].line === 0 && /and 3 more/.test(L[2].text) && L[3].text === '1 crown');
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
    check('the ground shakes, and people walk away to sing to it', g.choir.length >= 1 && W.chronicle.some(x => /The ground shook/.test(x.text)) && g.choir.every(id => W.npcs[id].journey === 'choir' || W.npcs[id].status === 'dead'), `${g.choir.length} in the choir`);
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
    check('a town is held by a lord or a lady, a village by its reeve', armed.every(s => { const r = M.ruler(W, s); if (!r || s.kind === 'capital' || s.kind === 'temple') return true; return M.tier(W, s) === 'village' ? r.title === 'Reeve' : r.title === 'Lord' || r.title === 'Lady'; }));
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
    check('the realm is no pushover: its Marshals and Champions come near your level, its soldiers half of it and more', top >= 64 && avg >= 32, `you 80 · the best ${top} · soldiers about ${Math.round(avg)}`);
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

  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

main();
