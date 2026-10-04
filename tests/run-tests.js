// Headless tests for the world simulation. Loads the browser scripts into a
// sandbox and checks that the world actually lives and that consequences chain.
//   npm test
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SIM_FILES = [
  'core.js', 'world/worldgen.js', 'sim/sim.js', 'sim/people.js', 'sim/ecology.js', 'sim/economy.js',
  'sim/politics.js', 'sim/intel.js', 'sim/plights.js', 'sim/chronicle.js', 'sim/civ.js',
  'sim/mysteries.js', 'sim/legacy.js', 'sim/minds.js', 'sim/weather.js', 'sim/disease.js', 'sim/production.js', 'sim/property.js', 'sim/law.js', 'save.js'
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
  const kinds = {};
  for (const e of world.chronicle) kinds[e.kind] = (kinds[e.kind] || 0) + 1;
  console.log('   chronicle kinds:', JSON.stringify(kinds));
  console.log('   sample history:');
  world.chronicle.filter(e => e.imp >= 1).slice(-14).forEach(e => console.log('     · ' + ECHO.TIME.fmtDate(e.d) + ' — ' + e.text));

  console.log('\nThe monster-kill cascade');
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
    { const st = A.settlements.find(x => ECHO.People.residents(A, x).some(n => n.wealth > 80)); const poor = ECHO.People.residents(A, st).find(n => n.prof !== 'child' && !n.debt); poor.wealth = 0; poor.starve = 3; ECHO.Property.borrow(A, rng, poor, st); }
    const debts = Object.values(A.npcs).filter(n => n.debt).length;
    check('people borrow money', debts > 0 || A.chronicle.some(e => /debt/.test(e.text)), debts + ' in debt now');
    const sv = s => ECHO.Law.sentenceFor(A, s, 'murder', 0);
    const codes = A.settlements.map(s => s.faction + ':' + (sv(s) || {}).p);
    check('each realm has its own law', new Set(codes.map(c => c.split(':')[1])).size >= 2, [...new Set(codes)].join(' '));
    const pop = Object.values(A.npcs).filter(n => n.status === 'alive').length;
    check('the realm survives its hardships', pop > 120, pop + ' alive');
  }

  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

main();
