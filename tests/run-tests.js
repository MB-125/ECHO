// Headless tests for the world simulation. Loads the browser scripts into a
// sandbox and checks that the world actually lives and that consequences chain.
//   npm test
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SIM_FILES = [
  'core.js', 'world/worldgen.js', 'sim/sim.js', 'sim/people.js', 'sim/ecology.js', 'sim/economy.js',
  'sim/politics.js', 'sim/intel.js', 'sim/plights.js', 'sim/chronicle.js', 'sim/civ.js',
  'sim/mysteries.js', 'sim/legacy.js', 'save.js'
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
  // Two identical worlds; in one, the apex beast dies.
  const A = ECHO.generateWorld({ seed: 777, name: 'Control', prehistoryDays: 10 });
  const B = ECHO.Save.deserialize(ECHO.Save.serialize(A));
  B._rng = new ECHO.RNG(A.rngState);
  A._rng = new ECHO.RNG(A.rngState);
  const lairB = B.lairs[0];
  lairB.boss.alive = false; lairB.boss.diedDay = B.day;
  const village = s => s.id === lairB.villageId;
  const regionId = lairB.regionId;
  const vA = A.settlements.find(village), vB = B.settlements.find(village);
  const startG = B.regions[regionId].eco.gnawer;
  const series = [];
  for (let d = 0; d < 60; d++) {
    ECHO.Sim.dailyTick(A, true); ECHO.Sim.dailyTick(B, true);
    if (d % 10 === 9) series.push(`d${d + 1}: gnawers ${Math.round(A.regions[regionId].eco.gnawer)}→${Math.round(B.regions[regionId].eco.gnawer)}, crop ${A.regions[regionId].eco.crop.toFixed(2)}→${B.regions[regionId].eco.crop.toFixed(2)}, bread ${vA.prices.food}→${vB.prices.food}, hunger ${vA.hunger.toFixed(2)}→${vB.hunger.toFixed(2)}, unrest ${vA.unrest.toFixed(0)}→${vB.unrest.toFixed(0)}`);
  }
  series.forEach(s => console.log('   ' + s));
  const gB = B.regions[regionId].eco.gnawer, gA = A.regions[regionId].eco.gnawer;
  check('vermin multiply without the apex', gB > gA * 2.2, `${Math.round(gA)} vs ${Math.round(gB)} (start ${Math.round(startG)})`);
  check('crops fail', B.regions[regionId].eco.crop < A.regions[regionId].eco.crop - 0.25);
  const avgPrice = (w, s) => s.priceHistory.slice(-10).reduce((a, b) => a + b, 0) / 10;
  check('food prices rise in the village', avgPrice(B, vB) > avgPrice(A, vA) * 1.3, `${avgPrice(A, vA).toFixed(1)} vs ${avgPrice(B, vB).toFixed(1)}`);
  const emA = vA._emigrants || 0, emB = vB._emigrants || 0;
  const unrestB = vB.unrest, unrestA = vA.unrest;
  check('hunger brings migration or unrest', emB > emA || unrestB > unrestA + 10, `emigrants ${emA}→${emB}, unrest ${unrestA.toFixed(0)}→${unrestB.toFixed(0)}`);

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

  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

main();
