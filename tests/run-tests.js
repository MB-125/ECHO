// Headless tests for the world simulation. Loads the browser scripts into a
// sandbox and checks that the world actually lives and that consequences chain.
//   npm test
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SIM_FILES = [
  'core.js', 'world/worldgen.js', 'sim/sim.js', 'sim/people.js', 'sim/ecology.js', 'sim/economy.js',
  'sim/politics.js', 'sim/intel.js', 'sim/plights.js', 'sim/chronicle.js', 'sim/civ.js',
  'sim/mysteries.js', 'sim/legacy.js', 'sim/minds.js', 'sim/weather.js', 'sim/disease.js', 'sim/production.js', 'sim/property.js', 'sim/law.js', 'sim/realm.js', 'sim/explore.js', 'sim/wonders.js', 'sim/festivals.js', 'sim/letters.js', 'save.js'
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
      const site = R.findSite(W, kk, rng); tried++;
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

  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

main();
