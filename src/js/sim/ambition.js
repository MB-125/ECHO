// Ambitions: what you are making of your life.
//
// Six roads a life can take — the Blade, the Crown, the Purse, the Lore, the
// Road and the Watch — each with five standings to rise through. Every
// standing asks for real things done in the world (a delve cleared, a village
// held, a vault opened, a ring broken), is marked with a ceremony and a title,
// and brings something with it. You rise on every road you walk; the one you
// choose to follow is the one the world keeps pointing you towards.
(function () {
  const { U } = ECHO;
  const P = () => ECHO.People;
  const S = () => ECHO.Sim;

  // ---------------------------------------------------------------- measures
  const st = pl => (pl.stats = pl.stats || {});
  const fullName = pl => pl.first + ' ' + pl.last;
  const kills = pl => Object.entries(pl.kills || {}).filter(([k]) => k !== 'innocents').reduce((a, [, v]) => a + v, 0);
  const pleasDone = (w, pl) => w.plights.filter(p => p.status === 'done' && pl.accepted.includes(p.id)).length;
  const huntsDone = (w, pl) => w.plights.filter(p => p.status === 'done' && (p.kind === 'hunt' || p.kind === 'bounty' || p.kind === 'apex') && pl.accepted.includes(p.id)).length;
  const apexKilled = (w, pl) => w.lairs.filter(l => !l.boss.alive && l.boss.killedBy === fullName(pl)).length;
  const techs = pl => Object.keys((pl.tech && pl.tech.known) || {}).length;
  const ownHouse = (w, pl) => ECHO.Property ? ECHO.Property.holdings(w, pl).houses.filter(h => !h.rented).length : 0;
  const bestRep = (w, pl) => Math.max(0, ...w.settlements.map(s => (s.rep && s.rep[pl.charId]) || 0));
  const villages = (w, pl) => (pl.wardenOf || []).map(id => S().settlement(w, id)).filter(s => s && s.warden === pl.charId);
  const bestVillage = (w, pl) => villages(w, pl).sort((a, b) => P().residents(w, b).length - P().residents(w, a).length)[0] || null;
  const projects = s => s ? (s.projects || []).length : 0;
  const worth = (w, pl) => {
    let v = pl.gold || 0;
    if (!ECHO.Property) return v;
    const H = ECHO.Property.holdings(w, pl);
    for (const h of H.houses) if (!h.rented) v += ECHO.Property.houseValue(h.s);
    for (const x of H.shares) v += ECHO.Property.businessValue(w, x.s, x.b) * x.sh.frac;
    for (const f of H.fields) v += f.n * 60;
    for (const n of H.loans) v += n.debt.amt;
    return Math.round(v);
  };
  const words = w => w.lang ? Object.keys(w.lang.known).length : 0;
  const echoes = w => ECHO.Wonders ? ECHO.Wonders.found(w) : 0;
  const ruinsSeen = w => w.ruins.filter(r => r.visited || r.studied).length;
  const explored = (w, pl) => ECHO.Discover ? Math.round(ECHO.Discover.explored(w, pl) * 100) : 0;
  const placesFound = w => ECHO.Explore ? ECHO.Explore.sites(w).filter(s => s.found).length : 0;
  const herbKinds = pl => Object.keys(pl.herbarium || {}).length;
  const pages = w => w.expedition ? w.expedition.pages.length : 0;

  // An objective: text, how far along (have/need), and where to go for it.
  const O = (text, have, need, where) => ({ text, have: Math.min(have, need), need, done: have >= need, where: where || null });
  // Places to point at.
  const near = (w, pl, list) => { let b = null, bd = Infinity; for (const x of list) { const d = U.dist(x.x, x.y, pl.x, pl.y); if (d < bd) { bd = d; b = x; } } return b; };
  const town = (w, pl, f) => { const s = near(w, pl, w.settlements.filter(t => t.faction !== 'ashfang' && (!f || f(t)))); return s ? { x: s.x, y: s.y + 2, name: s.name } : null; };
  const capital = (w, pl) => { const caps = w.settlements.filter(s => s.kind === 'capital'); const s = caps.sort((a, b) => ((b.rep && b.rep[pl.charId]) || 0) - ((a.rep && a.rep[pl.charId]) || 0) || U.dist(a.x, a.y, pl.x, pl.y) - U.dist(b.x, b.y, pl.x, pl.y))[0]; return s ? { x: s.x, y: s.y, name: 'the keep at ' + s.name } : null; };
  const delve = (w, pl) => { const d = near(w, pl, ECHO.Explore.sites(w).filter(s => s.cat === 'delve' && !s.cleared && (s.found || s.seen))); return d ? { x: d.x, y: d.y, name: d.name } : town(w, pl); };
  const lair = (w, pl) => { const l = near(w, pl, w.lairs.filter(l => l.boss.alive && l.boss.absentUntil <= w.day)); return l ? { x: l.x, y: l.y, name: `the lair of ${l.boss.name}`, vague: !l.seen } : null; };
  const camp = (w, pl) => { const c = near(w, pl, w.camps.filter(c => c.alive)); return c ? { x: c.x, y: c.y, name: c.name, vague: !c.seen } : null; };
  const ruin = (w, pl) => { const r = near(w, pl, w.ruins.filter(r => !r.visited)); return r ? { x: r.x, y: r.y, name: r.name, vague: true } : null; };
  const unknownLand = (w, pl) => {
    if (!pl.explored) return null;
    const cw = Math.ceil(w.W / 4), ch = Math.ceil(w.H / 4);
    let best = null, bd = Infinity;
    for (let y = 0; y < ch; y += 2) for (let x = 0; x < cw; x += 2) {
      if (pl.explored[y * cw + x]) continue;
      const tx = x * 4 + 2, ty = y * 4 + 2;
      const t = ECHO.World.tile(w, tx, ty);
      if (t === ECHO.TILE.DEEP || t === ECHO.TILE.WATER) continue;
      const d = U.dist(tx, ty, pl.x, pl.y);
      if (d < bd) { bd = d; best = { x: tx, y: ty, name: 'unexplored country', vague: true }; }
    }
    return best;
  };
  const wonderSeen = (w, pl) => { const s = near(w, pl, ECHO.Explore.sites(w).filter(s => !s.found && s.seen)); return s ? { x: s.x, y: s.y, name: 'something seen from a lookout', vague: true } : unknownLand(w, pl); };
  const nextPage = w => w.expedition && w.expedition.next ? { x: w.expedition.next.x, y: w.expedition.next.y, name: w.expedition.next.camp ? 'the last camp' : 'the next journal page', vague: true } : null;
  const myVillage = (w, pl) => { const v = bestVillage(w, pl); return v ? { x: v.x, y: v.y, name: v.name } : null; };

  const PATHS = {
    blade: {
      name: 'The Blade', icon: '⚔', blurb: 'Make your name with steel: outlaws, beasts, the things in the barrows — and one day the great beasts themselves.',
      ranks: [
        { title: 'Sellsword', desc: 'You fight for coin, and people have started to notice.', reward: '30 crowns.', grant: (w, pl) => { pl.gold += 30; },
          objectives: (w, pl) => [O('Win fights against outlaws or beasts', kills(pl), 6, camp(w, pl)), O('See a plea through to the end', pleasDone(w, pl), 1, town(w, pl))] },
        { title: 'Champion', desc: 'Towns send for you when something needs killing.', reward: 'A champion\'s blade, and +15 life.', grant: (w, pl) => { const it = ECHO.Character.makeItem(w, { kind: 'sword', name: 'Champion\'s Blade', dmg: 22, holder: 'player', history: [{ d: w.day, t: 'given to a champion' }] }); pl.items.push(it.id); if (ECHO.Wonders) ECHO.Wonders.boon(pl, 'hp', 15); },
          objectives: (w, pl) => [O('Clear a delve — a barrow, den, crypt or hideout', st(pl).delves || 0, 1, delve(w, pl)), O('Hunt a named beast or collect a bounty', huntsDone(w, pl), 1, town(w, pl)), O('Renown', Math.floor(pl.renown), 25)] },
        { title: 'Knight', desc: 'A ruler has put a sword on your shoulder. You are sworn now.', reward: 'One more technique carried, and a warhorse\'s worth of crowns (120).', grant: (w, pl) => { pl.extraSlots = (pl.extraSlots || 0) + 1; pl.gold += 120; },
          objectives: (w, pl) => [O('Be knighted by a ruler (renown 40 and their trust)', pl.knighted ? 1 : 0, 1, capital(w, pl)), O('Learn techniques in battle', techs(pl), 3)] },
        { title: 'Beastbane', desc: 'You killed a thing the old songs are written about.', reward: '+25 life, and a thread of fate restored.', grant: (w, pl) => { if (ECHO.Wonders) ECHO.Wonders.boon(pl, 'hp', 25); pl.fate = Math.min(3, pl.fate + 1); },
          objectives: (w, pl) => [O('Slay one of the great beasts in its lair', apexKilled(w, pl), 1, lair(w, pl)), O('Renown', Math.floor(pl.renown), 60)] },
        { title: 'Legend', desc: 'Children play at being you. A statue will stand.', reward: 'A statue in the capital, and the realm\'s undying fame.', grant: (w, pl) => { A.statue(w, pl); },
          objectives: (w, pl) => [O('Kill an outlaw chieftain', st(pl).chiefs || 0, 1, camp(w, pl)), O('Slay great beasts', apexKilled(w, pl), 2, lair(w, pl)), O('Renown', Math.floor(pl.renown), 100)] }
      ]
    },
    crown: {
      name: 'The Crown', icon: '♛', blurb: 'Land, people and a seat at court: hold a village, make it grow, and rise to be a lord of the realm.',
      ranks: [
        { title: 'Householder', desc: 'You have a roof of your own and a name in the town.', reward: '40 crowns from a grateful neighbour.', grant: (w, pl) => { pl.gold += 40; },
          objectives: (w, pl) => [O('Own a house (notice board → Property)', ownHouse(w, pl), 1, town(w, pl)), O('Standing in a town', Math.floor(bestRep(w, pl)), 10, town(w, pl))] },
        { title: 'Warden', desc: 'A village answers to you, and pays you its dues.', reward: 'The reeve\'s gift: 80 crowns.', grant: (w, pl) => { pl.gold += 80; },
          objectives: (w, pl) => [O('Hold a village — clear the frontier for the crown, or buy a royal charter at a keep', villages(w, pl).length, 1, capital(w, pl))] },
        { title: 'Steward', desc: 'Your village is growing because of you.', reward: 'Your share of the village dues grows by half.', grant: (w, pl) => { pl.duesMul = (pl.duesMul || 1) * 1.5; },
          objectives: (w, pl) => [O('People living in your village', bestVillage(w, pl) ? P().residents(w, bestVillage(w, pl)).length : 0, 18, myVillage(w, pl)), O('Projects finished in your village', projects(bestVillage(w, pl)), 2, myVillage(w, pl))] },
        { title: 'Lord', desc: 'The crown names you a lord of the realm, with a seat at court.', reward: 'A lord\'s income: the crown pays you 60 crowns a season.', grant: (w, pl) => { pl.stipend = (pl.stipend || 0) + 60; },
          objectives: (w, pl) => [O('People living in your village', bestVillage(w, pl) ? P().residents(w, bestVillage(w, pl)).length : 0, 30, myVillage(w, pl)), O('Projects finished in your village', projects(bestVillage(w, pl)), 4, myVillage(w, pl)), O('Renown', Math.floor(pl.renown), 50)] },
        { title: 'High Lord', desc: 'Your banner flies over more than one village. Rulers listen when you speak.', reward: 'A second royal charter, freely given, and the crown\'s favour.', grant: (w, pl) => { pl.freeCharter = true; for (const f of Object.values(w.factions)) if (f.type === 'kingdom') { const r = f.ruler && w.npcs[f.ruler]; if (r) r.op[pl.charId] = (r.op[pl.charId] || 0) + 25; } },
          objectives: (w, pl) => [O('Villages held', villages(w, pl).length, 2, capital(w, pl)), O('People in your lands', villages(w, pl).reduce((a, s) => a + P().residents(w, s).length, 0), 50, myVillage(w, pl))] }
      ]
    },
    purse: {
      name: 'The Purse', icon: '⚖', blurb: 'Coin makes its own kind of power: shares, fields, houses and loans, until the realm itself owes you money.',
      ranks: [
        { title: 'Peddler', desc: 'You know what things are worth, and who will pay more.', reward: 'Merchants give you 5% better prices.', grant: (w, pl) => { pl.haggle = (pl.haggle || 0) + 0.05; },
          objectives: (w, pl) => [O('Crowns in your purse', Math.floor(pl.gold), 150, town(w, pl))] },
        { title: 'Shareholder', desc: 'Other people\'s work makes you money now.', reward: '60 crowns in dividends, paid early.', grant: (w, pl) => { pl.gold += 60; },
          objectives: (w, pl) => [O('Own a share of a mill, mine, smithy, inn or lumber camp', ECHO.Property ? ECHO.Property.holdings(w, pl).shares.length : 0, 1, town(w, pl)), O('Worth (purse and property)', worth(w, pl), 400)] },
        { title: 'Landlord', desc: 'Rents and harvests come to you whether you lift a finger or not.', reward: 'Another 5% off at every market.', grant: (w, pl) => { pl.haggle = (pl.haggle || 0) + 0.05; },
          objectives: (w, pl) => [O('Own fields or extra houses', (ECHO.Property ? ECHO.Property.holdings(w, pl).fields.reduce((a, f) => a + f.n, 0) : 0) + Math.max(0, ownHouse(w, pl) - 1), 2, town(w, pl)), O('Worth', worth(w, pl), 1000)] },
        { title: 'Merchant Prince', desc: 'Your name opens doors at every court.', reward: 'Every ruler\'s goodwill, and 150 crowns of credit.', grant: (w, pl) => { pl.gold += 150; for (const f of Object.values(w.factions)) { const r = f.ruler && w.npcs[f.ruler]; if (r) r.op[pl.charId] = (r.op[pl.charId] || 0) + 15; } },
          objectives: (w, pl) => [O('Worth', worth(w, pl), 2500), O('Lend money to someone', (st(pl).loans || 0), 1, town(w, pl))] },
        { title: 'Banker of the Realm', desc: 'Kings borrow from you.', reward: 'The crown pays you interest: 100 crowns a season.', grant: (w, pl) => { pl.stipend = (pl.stipend || 0) + 100; },
          objectives: (w, pl) => [O('Worth', worth(w, pl), 6000)] }
      ]
    },
    lore: {
      name: 'The Lore', icon: '✧', blurb: 'The world speaks a dead tongue. Learn it from the stones, the ruins and the echoes, and open what the old people sealed.',
      ranks: [
        { title: 'Seeker', desc: 'You have begun to hear the old tongue.', reward: 'The scholars teach you for half price.', grant: (w, pl) => { if (w.lang) w.lang.scholarCost = Math.max(10, Math.round(w.lang.scholarCost / 2)); },
          objectives: (w, pl) => [O('Words of the old tongue known', words(w), 4, ruin(w, pl)), O('Echoes of the old world found', echoes(w), 1)] },
        { title: 'Lorekeeper', desc: 'The archive keeps a chair for you.', reward: '+15 mana for good.', grant: (w, pl) => { pl.boons = pl.boons || {}; pl.boons.mana = (pl.boons.mana || 0) + 15; },
          objectives: (w, pl) => [O('Ruins visited', ruinsSeen(w), 3, ruin(w, pl)), O('Words known', words(w), 12, ruin(w, pl))] },
        { title: 'Echo-walker', desc: 'The dead show themselves to you.', reward: 'A thread of fate restored.', grant: (w, pl) => { pl.fate = Math.min(3, pl.fate + 1); },
          objectives: (w, pl) => [O('Echoes found', echoes(w), 4), O('Crowns given to an archive', Math.floor(pl.donated || 0), 150, capital(w, pl))] },
        { title: 'Vault-opener', desc: 'You opened what the old people sealed.', reward: '+20 life and +20 mana.', grant: (w, pl) => { if (ECHO.Wonders) ECHO.Wonders.boon(pl, 'hp', 20); pl.boons = pl.boons || {}; pl.boons.mana = (pl.boons.mana || 0) + 20; },
          objectives: (w, pl) => [O('Open the sealed vault', w.lang && w.lang.vault && w.lang.vault.opened ? 1 : 0, 1, w.lang && w.lang.vault && w.lang.vault.revealed ? { x: w.lang.vault.x, y: w.lang.vault.y, name: 'the vault' } : ruin(w, pl))] },
        { title: 'Keeper of the Old Tongue', desc: 'No one living knows more of the first people than you.', reward: 'The archives will name a hall for you.', grant: (w, pl) => { pl.renown += 20; },
          objectives: (w, pl) => [O('Echoes found', echoes(w), 9), O('Words known', words(w), 24)] }
      ]
    },
    road: {
      name: 'The Road', icon: '✶', blurb: 'Walk where no one has walked: chart the wonders, find what is buried, follow the lost expedition, and fill in the map.',
      ranks: [
        { title: 'Wanderer', desc: 'You know the roads around home.', reward: '+10 stamina for good.', grant: (w, pl) => { if (ECHO.Wonders) ECHO.Wonders.boon(pl, 'sta', 10); },
          objectives: (w, pl) => [O('Land walked (%)', explored(w, pl), 12, unknownLand(w, pl)), O('Places of the wild found', placesFound(w), 3, wonderSeen(w, pl))] },
        { title: 'Pathfinder', desc: 'People ask you the way.', reward: 'Travel by coach costs you half.', grant: (w, pl) => { pl.coachMul = 0.5; },
          objectives: (w, pl) => [O('Land walked (%)', explored(w, pl), 25, unknownLand(w, pl)), O('Wonders you named', pl.charted || 0, 1, wonderSeen(w, pl)), O('Hidden caches found', pl.cachesFound || 0, 3, unknownLand(w, pl))] },
        { title: 'Cartographer', desc: 'Your maps hang in the archive.', reward: '+10 stamina and 100 crowns from the archive.', grant: (w, pl) => { if (ECHO.Wonders) ECHO.Wonders.boon(pl, 'sta', 10); pl.gold += 100; },
          objectives: (w, pl) => [O('Land walked (%)', explored(w, pl), 45, unknownLand(w, pl)), O('Rare herbs found', herbKinds(pl), 3, unknownLand(w, pl)), O('Pages of the lost journal', pages(w), 3, nextPage(w) || unknownLand(w, pl))] },
        { title: 'Trailblazer', desc: 'You found the lost expedition\'s last camp.', reward: 'A thread of fate restored.', grant: (w, pl) => { pl.fate = Math.min(3, pl.fate + 1); },
          objectives: (w, pl) => [O('Find the expedition\'s last camp', w.expedition && w.expedition.done ? 1 : 0, 1, nextPage(w) || unknownLand(w, pl)), O('Wonders you named', pl.charted || 0, 3, wonderSeen(w, pl))] },
        { title: 'Worldwalker', desc: 'There is no corner of the world you have not seen.', reward: 'The road itself remembers you: +20 stamina.', grant: (w, pl) => { if (ECHO.Wonders) ECHO.Wonders.boon(pl, 'sta', 20); },
          objectives: (w, pl) => [O('Land walked (%)', explored(w, pl), 80, unknownLand(w, pl)), O('Places of the wild found', placesFound(w), Math.min(30, ECHO.Explore.sites(w).length - 2), wonderSeen(w, pl))] }
      ]
    },
    watch: {
      name: 'The Watch', icon: '⚑', blurb: 'Keep the peace: catch thieves, solve crimes, break the rings — and rise to command a town\'s watch.',
      ranks: [
        { title: 'Deputy', desc: 'You wear the watch\'s brass.', reward: '20 crowns and a lantern of your own.', grant: (w, pl) => { pl.gold += 20; },
          objectives: (w, pl) => [O('Join a town\'s watch (talk to any watchman)', pl.deputy || st(pl).sworn ? 1 : 0, 1, town(w, pl)), O('Catch a thief or break up a brawl', (st(pl).thieves || 0) + (st(pl).brawls || 0), 1, town(w, pl))] },
        { title: 'Constable', desc: 'The watch trusts you with its cases.', reward: '+10 life.', grant: (w, pl) => { if (ECHO.Wonders) ECHO.Wonders.boon(pl, 'hp', 10); },
          objectives: (w, pl) => [O('Jobs done for the watch', st(pl).watchJobs || 0, 5, town(w, pl)), O('Crimes solved', st(pl).cases || 0, 1, town(w, pl))] },
        { title: 'Sergeant', desc: 'Watchmen take your orders.', reward: '60 crowns, and the watch pays you more for every job.', grant: (w, pl) => { pl.gold += 60; pl.watchPay = (pl.watchPay || 1) * 1.5; },
          objectives: (w, pl) => [O('Crimes solved', st(pl).cases || 0, 3, town(w, pl)), O('Jobs done for the watch', st(pl).watchJobs || 0, 12, town(w, pl))] },
        { title: 'Captain', desc: 'A town\'s watch answers to you.', reward: 'The captain\'s stipend: 50 crowns a season.', grant: (w, pl) => { pl.stipend = (pl.stipend || 0) + 50; const s = pl.deputy && S().settlement(w, pl.deputy.sid); if (s) { s.watch.playerCaptain = pl.charId; s.watch.trust = Math.min(100, s.watch.trust + 10); } },
          objectives: (w, pl) => [O('Break a thieves\' ring', st(pl).rings || 0, 1, town(w, pl)), O('Crimes solved', st(pl).cases || 0, 5, town(w, pl)), O('Renown', Math.floor(pl.renown), 40)] },
        { title: 'Lord Marshal', desc: 'The realm\'s peace is yours to keep.', reward: 'The crown pays you 100 crowns a season.', grant: (w, pl) => { pl.stipend = (pl.stipend || 0) + 100; },
          objectives: (w, pl) => [O('Crimes solved', st(pl).cases || 0, 10, town(w, pl)), O('Jobs done for the watch', st(pl).watchJobs || 0, 40, town(w, pl)), O('Renown', Math.floor(pl.renown), 70)] }
      ]
    }
  };

  const A = ECHO.Ambition = {
    PATHS,
    note(pl, key, n = 1) { st(pl)[key] = (st(pl)[key] || 0) + n; },
    rank(pl, path) { return (pl.ranks && pl.ranks[path]) || 0; },
    // The next standing on a road, with how far along each part of it is.
    next(world, pl, path) {
      const P0 = PATHS[path], r = A.rank(pl, path);
      if (r >= P0.ranks.length) return null;
      const R = P0.ranks[r];
      return { path, rank: r, R, objectives: R.objectives(world, pl) };
    },
    // The title the world knows you by: your highest standing on any road.
    honor(pl) {
      let best = null;
      for (const k in PATHS) { const r = A.rank(pl, k); if (r && (!best || r > best.r || (r === best.r && k === pl.focus))) best = { r, k }; }
      if (!best) return null;
      const t = PATHS[best.k].ranks[best.r - 1].title;
      if (best.k === 'crown' && best.r >= 4) { const v = bestVillage(ECHO.Game ? ECHO.Game.world : null, pl); return `${pl.female ? (best.r === 5 ? 'High Lady' : 'Lady') : t}${v ? ' of ' + v.name : ''}`; }
      if (best.k === 'blade' && best.r === 3 && pl.knighted && ECHO.Game && ECHO.Game.world) return `Knight of ${ECHO.Game.world.factions[pl.knighted].short}`;
      if (best.k === 'purse' && best.r === 4 && pl.female) return 'Merchant Princess';
      return t;
    },
    // Check every road; returns standings newly reached (the game shows the ceremonies).
    check(world, pl) {
      pl.ranks = pl.ranks || {};
      const out = [];
      for (const k in PATHS) {
        const n = A.next(world, pl, k);
        if (!n || !n.objectives.every(o => o.done)) continue;
        pl.ranks[k] = n.rank + 1;
        n.R.grant(world, pl);
        out.push({ path: k, rank: n.rank + 1, R: n.R });
        if (n.rank + 1 >= 2) ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} is now spoken of as ${A.honor(pl) || n.R.title}: ${n.R.desc.replace(/\.$/, '').toLowerCase()}.`, importance: n.rank + 1 >= 4 ? 3 : 2, rep: n.rank + 1, tag: k === 'watch' || k === 'blade' ? 'protect' : null });
        break; // one ceremony at a time
      }
      return out;
    },
    // The thing to do next, on the road you follow.
    goal(world, pl) {
      const path = pl.focus;
      if (!path || !PATHS[path]) return null;
      const n = A.next(world, pl, path);
      if (!n) return { path, done: true, text: `You have risen as far as ${PATHS[path].name.toLowerCase()} can take you.` };
      const o = n.objectives.find(x => !x.done) || n.objectives[0];
      return { path, rank: n.rank, title: n.R.title, text: o.text, have: o.have, need: o.need, where: o.where, objectives: n.objectives };
    },
    // A season's stipends and the steward's share.
    seasonal(world) {
      const pl = world.player;
      if (!pl || !pl.alive || !pl.stipend) return;
      if (ECHO.TIME.dateOf(world.day).dayOfSeason !== 15) return;
      pl.gold += pl.stipend;
      if (ECHO.Letters) ECHO.Letters.add(world, { key: 'stip' + world.day, fromName: 'the crown\'s treasurer', kind: 'joy', title: `Your stipend: ${pl.stipend} crowns`, text: `${pl.first} ${pl.last},\n\nBy order of the crown, your stipend for the season — ${pl.stipend} crowns — has been paid.\n\nThe treasury` });
    },
    statue(world, pl) {
      const caps = world.settlements.filter(s => s.kind === 'capital').sort((a, b) => ((b.rep && b.rep[pl.charId]) || 0) - ((a.rep && a.rep[pl.charId]) || 0));
      const s = caps[0];
      if (!s || !ECHO.Realm) return;
      const b = ECHO.Realm.placeBuilding(world, s, 'statue', 1, 1, 3, 9);
      if (b) { b.legend = pl.charId; b.of = pl.charId; ECHO.Realm.reshaped(world); }
      ECHO.Chronicle.add(world, { text: `A statue of ${pl.first} ${pl.last} was raised in ${s.name}.`, kind: 'legacy', importance: 3, sid: s.id, char: pl.charId });
    },
    worth
  };
})();
