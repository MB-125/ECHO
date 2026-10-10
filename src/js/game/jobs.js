// Jobs: there is always someone who needs a hand.
//
// Talk to anyone in any town and ask if they need help, and most of the time
// they do — work shaped by who they are and what their life is like just now.
// The farmer's field is crawling with gnawers, or a goat has wandered off into
// the woods. The smith needs ore. The hunter wants the old wolf that keeps
// robbing his snares dead. The elder lost her mother's ring by the river and
// can't search the reeds with her knees. A child's kitten is missing. The
// priest wants the lamp lit at the wayside shrine. The innkeeper's out of
// fish. A merchant needs an escort to the next town and will pay for a sword
// at her side — and the road may not be empty. Someone wants a letter
// carried to a sister three towns away.
//
// It never runs out: people want new things every couple of days, and the
// notice board's Odd jobs tab lists who's asking. A gold mark hangs over
// anyone near you who has work going. And the journal's Nearby page shows
// everything worth doing around you — your jobs, dungeons, boards, festivals,
// places to fish and forage — with a button to follow any of them.
(function () {
  const { U } = ECHO;
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const P = () => ECHO.People;
  const T = ECHO.TILE;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ITEMS = { herbs: 'bundles of herbs', fish: 'fish', meat: 'cuts of meat', hide: 'hides', ore: 'loads of ore', timber: 'loads of timber', food: 'portions of food', pelt: 'pelts' };
  const ONE = { herbs: 'bundle of herbs', fish: 'fish', meat: 'cut of meat', hide: 'hide', ore: 'load of ore', timber: 'load of timber', food: 'portion of food', pelt: 'wolf pelt' };
  const many = (k, n) => n === 1 ? `a ${ONE[k]}` : `${n} ${ITEMS[k]}`;
  const VALUE = { herbs: 4, fish: 3, meat: 4, hide: 6, ore: 6, timber: 4, food: 3, pelt: 12 };
  const WOLFNAMES = ['Greyjaw', 'Old Scar', 'Notch-Ear', 'Hollowbelly', 'the Widow', 'Ash-Mane', 'Three-Toes', 'Moonfang'];
  const KEEPSAKES = ['her mother\'s ring', 'a silver locket', 'his grandfather\'s pipe', 'a wedding band', 'a carved bone charm'];

  const J = ECHO.Jobs = {
    glows: [], t: 0, chan: null,
    st(world) { return (world.jobs = world.jobs || { seq: 0, list: [] }); },
    active(world) { return J.st(world).list.filter(j => j.status === 'active'); },
    byId(world, id) { return J.st(world).list.find(j => j.id === id); },
    max() { return 6; },
    // ------------------------------------------------------------ places
    spot(game, s, minR, maxR, want) {
      const world = game.world;
      for (let t = 0; t < 60; t++) {
        const a = Math.random() * 6.28, r = minR + Math.random() * (maxR - minR);
        const x = s.x + Math.cos(a) * r, y = s.y + Math.sin(a) * r;
        if (x < 4 || y < 4 || x > (world.W || 200) - 4 || y > (world.H || 150) - 4) continue;
        if (ECHO.World.isSolid(world, x, y) || (ECHO.Water && ECHO.Water.kind(world, x, y))) continue;
        const tt = ECHO.World.tile(world, Math.floor(x), Math.floor(y));
        if (want === 'water') { let near = false; for (let k = 0; k < 8 && !near; k++) { const b = k * 0.785; if (ECHO.Water && ECHO.Water.kind(world, x + Math.cos(b) * 1.6, y + Math.sin(b) * 1.6)) near = true; } if (!near) continue; }
        else if (want === 'wild' && (tt !== T.FOREST && tt !== T.GRASS && tt !== T.HILL)) continue;
        else if (want === 'field' && (tt !== T.FARM && tt !== T.GRASS)) continue;
        if (want !== 'field' && ECHO.World.settlementAt(world, x, y, 8)) continue;
        return { x, y, a };
      }
      return null;
    },
    dir(a) { return ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'][Math.round(((a % 6.283) + 6.283) % 6.283 / 0.785) % 8]; },
    otherTown(world, s, maxD = 90) {
      const t = world.settlements.filter(o => o.id !== s.id && U.dist(o.x, o.y, s.x, s.y) < maxD && o.faction !== 'ashfang' && o.residents && o.residents.length);
      return t.length ? pick(t) : null;
    },
    // ------------------------------------------------------------ what someone needs
    make(game, npc, s) {
      const world = game.world;
      const prof = npc.prof;
      const giverName = npc.first;
      const base = { giver: npc.id, giverName, sid: s.id, town: s.name, day: world.day, due: world.day + 4 + Math.floor(Math.random() * 3), status: 'offered', progress: 0 };
      const opts = [];
      const fetch = (item, n, why) => opts.push({ kind: 'fetch', item, n, title: `${U.cap(many(item, n))} for ${giverName}`, text: why, gold: Math.round(VALUE[item] * n * 1.4 + 6) });
      const clear = (sp, n, why, near) => { const l = J.spot(game, s, near ? 8 : 12, near ? 15 : 24, near ? 'field' : 'wild'); if (l) opts.push({ kind: 'clear', species: sp, n, x: l.x, y: l.y, title: `${sp === 'gnawer' ? 'Gnawers' : 'Wolves'} at ${giverName}'s ${near ? 'field' : 'place'}`, text: why, gold: sp === 'wolf' ? 40 + n * 8 : 18 + n * 3 }); };
      const hunt = (why) => { const l = J.spot(game, s, 20, 34, 'wild'); if (l) { const name = pick(WOLFNAMES); opts.push({ kind: 'hunt', species: 'wolf', name, x: l.x, y: l.y, title: `Hunt down ${name}`, text: why.replace('{name}', name).replace('{dir}', J.dir(l.a)), gold: 55 + Math.floor(Math.random() * 25) }); } };
      const lead = (animal, why) => { const l = J.spot(game, s, 16, 30, 'wild'); if (l) opts.push({ kind: 'lead', animal, x: l.x, y: l.y, title: `Bring home ${giverName}'s ${animal}`, text: why.replace('{dir}', J.dir(l.a)), gold: 16 + Math.floor(Math.random() * 10) }); };
      const task = (o) => { const l = J.spot(game, s, o.min || 12, o.max || 26, o.where || 'wild'); if (l) opts.push({ kind: 'task', x: l.x, y: l.y, n: o.n || 1, act: o.act, title: o.title, text: o.text.replace('{dir}', J.dir(l.a)), gold: o.gold, spots: o.spots ? J.spread(game, l, o.spots) : null, done: o.done }); };
      const deliver = (why, what) => { const t = J.otherTown(world, s); if (!t) return; const to = pick(t.residents.map(id => world.npcs[id]).filter(n => n && n.status === 'alive' && n.prof !== 'child')); if (!to) return; const d = U.dist(t.x, t.y, s.x, s.y); opts.push({ kind: 'deliver', to: to.id, toName: `${to.first} ${to.last}`, toSid: t.id, toTown: t.name, what, title: `Carry ${what} to ${to.first} in ${t.name}`, text: why.replace('{to}', to.first).replace('{town}', t.name), gold: Math.round(10 + d * 0.45) }); };
      const escort = (why) => { const t = J.otherTown(world, s, 70); if (!t) return; const d = U.dist(t.x, t.y, s.x, s.y); opts.push({ kind: 'escort', toSid: t.id, toTown: t.name, title: `See ${giverName} safely to ${t.name}`, text: why.replace('{town}', t.name), gold: Math.round(25 + d * 0.6) }); };
      // kin elsewhere: the oldest reason for a letter
      const kin = [npc.spouse, ...(npc.kids || []), ...(npc.parents || [])].map(id => world.npcs[id]).find(k => k && k.status === 'alive' && k.loc && k.loc !== s.id && ECHO.Sim.settlement(world, k.loc));
      if (kin && Math.random() < 0.5) { const t = ECHO.Sim.settlement(world, kin.loc); opts.push({ kind: 'deliver', to: kin.id, toName: `${kin.first} ${kin.last}`, toSid: t.id, toTown: t.name, what: 'a letter', title: `A letter to ${kin.first} in ${t.name}`, text: `"${kin.first} hasn't written since the thaw. Would you carry a letter to ${t.name} for me? Tell them I'm well — and that I miss them."`, gold: Math.round(8 + U.dist(t.x, t.y, s.x, s.y) * 0.4) }); }
      switch (prof) {
        case 'farmer':
          clear('gnawer', 4 + Math.floor(Math.random() * 3), '"Gnawers. Dozens of the little beasts, chewing the roots out of my barley. Kill them before there\'s nothing left to harvest."', true);
          lead(pick(['goat', 'sheep']), `"My nanny goat's broken through the fence again and gone off to the {dir}. She'll come if you lead her — she likes strangers better than me."`);
          task({ where: 'field', min: 7, max: 13, act: 'Bind the sheaves', n: 4, spots: 4, title: `Help ${giverName} bring in the sheaves`, text: '"The rain\'s coming and I can\'t get the sheaves in alone. Four stooks in the field — bind them and stand them up, would you?"', gold: 18, done: 'The last stook stands. The rain can come.' });
          break;
        case 'smith': fetch(pick(['ore', 'timber']), 3, '"I\'m out of ore and charcoal both, and there\'s a dozen jobs waiting. Bring me three loads and I\'ll make it worth your while."'); deliver('"This blade\'s been ordered by {to} in {town}. Careful with it — it\'s the best I\'ve made this year."', 'a wrapped blade'); break;
        case 'hunter': hunt('"There\'s an old wolf — they call it {name} — that\'s been robbing my snares to the {dir} for a month. Big, grey, clever. Kill it and bring me peace."'); fetch('hide', 2, '"I\'m short of hides for the tanner. Two good ones and I\'ll pay above the market."'); break;
        case 'herbalist': fetch('herbs', 4, '"The fever\'s going round and my shelves are bare. Four bundles of herbs, as fresh as you can find."'); task({ where: 'water', act: 'Gather the silverleaf', title: 'Silverleaf from the stream', text: '"Silverleaf grows by the water to the {dir}. It only keeps if it\'s picked by hand — I\'d go myself, but my legs aren\'t what they were."', gold: 20, done: 'You pick the silverleaf, wet and fragrant.' }); break;
        case 'innkeeper': fetch(pick(['fish', 'meat']), 3, '"The kitchen\'s empty and the room\'s full. Three of whatever you can catch or kill — I\'ll pay you more than the market will."'); deliver('"A cask of my best for the innkeeper of {town}, {to}. We trade a cask each spring — tradition."', 'a cask of ale'); break;
        case 'merchant': case 'reeve': escort('"I\'ve goods to sell in {town} and the road\'s not safe alone. Walk with me there and you\'ll have your fee — and my thanks if we\'re not robbed."'); deliver('"A parcel for {to} in {town}. Paid for already — just get it there."', 'a parcel'); fetch('pelt', 1, '"A wolf pelt — a good one. I\'ve a buyer in the capital who pays silly money."'); break;
        case 'priest': task({ min: 18, max: 30, act: 'Light the lamp and say a prayer', title: 'The wayside shrine', text: '"The lamp at the wayside shrine to the {dir} has gone out. It should never go out. Would you light it, and say a word for the travellers?"', gold: 16, done: 'The little flame catches and steadies. The road feels less lonely.' }); deliver('"A copy of the Litany for {to} in {town}. Handle it gently — it took me a winter to copy."', 'a holy book'); break;
        case 'elder': { const k = pick(KEEPSAKES); task({ where: 'water', act: 'Search the reeds', n: 1, spots: 3, title: `${giverName}'s lost keepsake`, text: `"I lost ${k} by the river to the {dir}, somewhere in the reeds. I've looked and looked. My eyes… would you look for me?"`, gold: 22, done: `There — in the mud, something glints. ${U.cap(k)}.`, keepsake: k }); break; }
        case 'child': lead(pick(['kitten', 'puppy']), '"My kitten ran off into the woods to the {dir} and she\'s too little to be out there! Please find her! Please!"'); break;
        case 'scholar': case 'inventor': task({ min: 18, max: 34, act: 'Take a rubbing of the carvings', title: 'Carvings on the old stone', text: '"There\'s a standing stone to the {dir} with carvings older than the kingdom. A charcoal rubbing would be worth more to me than gold — well, nearly."', gold: 24, done: 'You rub charcoal over the paper and the old words come up black and clear.' }); break;
        case 'guard': case 'soldier': clear('wolf', 3, '"A pack\'s been coming down to the road at dusk and taking travellers\' dogs. Next it\'ll be travellers. Clear them out."', false); hunt('"There\'s a wolf the farmers call {name} to the {dir}. Killed two sheep and a dog. The captain wants its head."'); break;
        case 'woodcutter': case 'miner': case 'miller': fetch(prof === 'miner' ? 'timber' : 'ore', 3, `"We're short ${prof === 'miner' ? 'of props for the shafts' : 'of iron for the tools'}. Three loads and I'll pay fair."`); clear('wolf', 2, '"Wolves have been circling the camp at night. The men won\'t go out alone. Deal with them?"', false); break;
        default:
          if (Math.random() < 0.5) fetch(pick(['food', 'herbs', 'fish']), 2, '"Times are thin. If you could bring me a little — I\'d pay what I can."');
          deliver('"Would you carry {what} to {to} in {town}? I\'d go myself but I can\'t leave."'.replace('{what}', 'this'), 'a bundle');
      }
      if (!opts.length) return null;
      const o = pick(opts);
      const j = Object.assign({ id: 'jb' + (++J.st(world).seq) }, base, o);
      if (j.kind === 'escort') j.due = world.day + 2;
      return j;
    },
    spread(game, c, n) {
      const out = [];
      for (let i = 0; i < n * 6 && out.length < n; i++) {
        const a = Math.random() * 6.28, r = 1 + Math.random() * 3.5;
        const x = c.x + Math.cos(a) * r, y = c.y + Math.sin(a) * r;
        if (ECHO.World.isSolid(game.world, x, y) || out.some(o => U.dist(o.x, o.y, x, y) < 1.4)) continue;
        out.push({ x, y, done: false });
      }
      return out;
    },
    // the offer someone has for you right now (the same one for a couple of days)
    offerOf(game, npc) {
      const world = game.world, pl = game.pl;
      if (!npc || npc.status !== 'alive' || npc.prof === 'bandit' || npc.id === pl.companion || (npc.op && (npc.op[pl.charId] || 0) < -40)) return null;
      if (J.active(world).some(j => j.giver === npc.id)) return null;
      const o = npc._job;
      if (o && o.status === 'offered' && world.day - o.day < 2) return o;
      if (npc._jobNext != null && world.day < npc._jobNext) return null;
      const s = ECHO.Sim.settlement(world, npc.loc || npc.home);
      if (!s) return null;
      // not everyone, every day
      const roll = ECHO.hash2(ECHO.hashStr(npc.id), world.day >> 1, 77);
      if (roll > (npc.prof === 'child' ? 0.4 : 0.72)) { npc._jobNext = world.day + 1; return null; }
      const j = J.make(game, npc, s);
      npc._job = j;
      if (!j) npc._jobNext = world.day + 2;
      return j;
    },
    accept(game, j) {
      const world = game.world, pl = game.pl;
      if (J.active(world).length >= J.max()) return `You're already carrying ${J.max()} jobs. Finish one first.`;
      j.status = 'active'; j.taken = world.day;
      J.st(world).list.push(j);
      const npc = world.npcs[j.giver];
      if (npc) { npc._job = null; npc._jobNext = world.day + 2; }
      if (j.kind === 'escort') {
        const e = game.ents.find(o => o.npcId === j.giver && !o.dead);
        if (!e) { j.status = 'offered'; J.st(world).list.pop(); return `${j.giverName} isn't here to walk with you.`; }
        e.escort = j; e.goal = null; e.hidden = false;
      }
      if (j.kind === 'deliver') pl.jobItems = (pl.jobItems || 0) + 1;
      pl.tracked = 'job:' + j.id;
      if (ECHO.Purpose) { ECHO.Purpose._html = null; ECHO.Purpose.t = 0; }
      return null;
    },
    // ------------------------------------------------------------ talking
    dialogue(world, npc, ent, pl, ui) {
      const game = ECHO.Game;
      // jobs you're doing for them, or bringing to them
      for (const j of J.active(world)) {
        if (j.kind === 'deliver' && j.to === npc.id) ui.add(`From ${j.giverName}: ${j.what}.`, () => { J.complete(game, j, ent); ui.say(`${npc.first} takes ${j.what} and turns it over in ${npc.sex === 'f' ? 'her' : 'his'} hands. "From ${j.giverName}? After all this time…" ${npc.sex === 'f' ? 'She' : 'He'} presses ${j.gold} crowns on you. "For your trouble. Thank you."`); ui.render(); });
        if (j.kind === 'deliver' && j.to !== npc.id && npc.prof === 'innkeeper' && npc.loc === j.toSid) ui.add(`Leave ${j.what} here for ${j.toName.split(' ')[0]}?`, () => { J.complete(game, j, ent, true); ui.say(`"${j.toName.split(' ')[0]}? I'll see they get it." The innkeeper counts out ${Math.round(j.gold * 0.8)} crowns from a pouch left for the purpose.`); ui.render(); });
        if (j.giver !== npc.id) continue;
        if (J.ready(game, j)) ui.add(j.kind === 'fetch' ? `Here — ${many(j.item, j.n)}.` : 'It\'s done.', () => { const t = J.complete(game, j, ent); ui.say(t); ui.render(); });
        else ui.add('About that job…', () => ui.say(`"${J.status(game, j)}"`));
      }
      const o = J.offerOf(game, npc);
      if (o) ui.add('Need a hand with anything?', () => {
        ui.say(`${o.text}\n\n${o.title} — ${o.gold} crowns${o.kind === 'fetch' ? '' : `, within ${o.due - world.day} days`}.`);
        ui.clear();
        ui.add('"I\'ll do it."', () => { const why = J.accept(game, o); if (why) ui.say(why); else { ui.say(pick(['"Thank you! Truly."', '"Bless you."', '"I knew you had a kind face."'])); ECHO.UI.toast(`Job taken: ${o.title}. (Tracked — the line at the top points the way.)`, 'info', 4); } ui.render(); });
        ui.add('"Not now."', () => { npc._jobNext = world.day + 1; ui.say('"Another time, then."'); ui.render(); });
      });
      else if (!J.active(world).some(j => j.giver === npc.id)) ui.add('Need a hand with anything?', () => ui.say(pick(['"Not today, thank you. Ask me again in a day or two."', '"Kind of you. No — we\'re managing."', '"Not just now."'])));
    },
    status(game, j) {
      const pl = game.pl;
      if (j.kind === 'fetch') return `${U.cap(many(j.item, j.n))}. You have ${pl.inv[j.item] || 0}.`;
      if (j.kind === 'clear') return `${j.progress}/${j.n} dealt with. Keep at it.`;
      if (j.kind === 'task' && j.spots) return `${j.spots.filter(s => s.done).length}/${j.spots.length} done${j.keepsake ? ' — keep searching' : ''}.`;
      return 'Still waiting on you, friend.';
    },
    ready(game, j) {
      const pl = game.pl;
      if (j.kind === 'fetch') return (pl.inv[j.item] || 0) >= j.n;
      if (j.kind === 'clear') return j.progress >= j.n;
      if (j.kind === 'hunt') return j.progress >= 1;
      if (j.kind === 'task') return j.spots ? (j.keepsake ? j.found : j.spots.every(s => s.done)) : j.progress >= 1;
      if (j.kind === 'lead') return j.progress >= 1;
      return false;
    },
    complete(game, j, ent, partial) {
      const world = game.world, pl = game.pl, npc = world.npcs[j.giver];
      j.status = 'done'; j.doneDay = world.day;
      if (j.kind === 'fetch') pl.inv[j.item] -= j.n;
      if (j.kind === 'deliver') pl.jobItems = Math.max(0, (pl.jobItems || 1) - 1);
      const gold = partial ? Math.round(j.gold * 0.8) : j.gold;
      pl.gold += gold;
      if (ECHO.Sfx) ECHO.Sfx.play('coin');
      const xp = 20 + Math.round(gold * 0.8);
      if (ECHO.Prowess) { const ups = ECHO.Prowess.gain(pl, xp); for (const u of ups) ECHO.Progress.levelUp(game, u); }
      if (npc) {
        npc.op = npc.op || {}; npc.op[pl.charId] = (npc.op[pl.charId] || 0) + 12;
        P().remember(world, npc, `${pl.first} ${pl.last} helped me (${j.title.toLowerCase()})`, 'gratitude', null, 2);
        if (npc.mind && Math.random() < 0.4) npc.mind.owe = (npc.mind.owe || 0) + 1;
      }
      if (j.kind === 'deliver') { const to = world.npcs[j.to]; if (to) { to.op = to.op || {}; to.op[pl.charId] = (to.op[pl.charId] || 0) + 6; } }
      const s = world.settlements.find(t => t.id === j.sid);
      if (s) { s.rep = s.rep || {}; s.rep[pl.charId] = (s.rep[pl.charId] || 0) + (j.kind === 'hunt' || j.kind === 'escort' ? 2 : 1); }
      if (j.kind === 'hunt') ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} hunted down the wolf called ${j.name}, near ${j.town}.`, importance: 1, x: j.x, y: j.y, rep: 2, tag: 'protect' });
      if (ECHO.Comrade) ECHO.Comrade.react(game, 'protect', 0.4);
      J.stats(pl).done++;
      if (pl.tracked === 'job:' + j.id) pl.tracked = null;
      ECHO.UI.toast(`Job done: ${j.title}. +${gold} crowns, +${xp} xp.`, 'legend', 4);
      if (ECHO.Purpose) ECHO.Purpose._html = null;
      return pick([`"Thank you. Here — ${gold} crowns, and you've earned every one."`, `${j.giverName} counts ${gold} crowns into your hand. "I won't forget it."`, `"You're a marvel. ${gold} crowns, as promised."`]);
    },
    stats(pl) { return (pl.jobStats = pl.jobStats || { done: 0, failed: 0 }); },
    fail(game, j, why) {
      const world = game.world, pl = game.pl, npc = world.npcs[j.giver];
      j.status = 'failed';
      if (j.kind === 'deliver') pl.jobItems = Math.max(0, (pl.jobItems || 1) - 1);
      if (npc) { npc.op = npc.op || {}; npc.op[pl.charId] = (npc.op[pl.charId] || 0) - 6; }
      J.stats(pl).failed++;
      if (pl.tracked === 'job:' + j.id) pl.tracked = null;
      ECHO.UI.toast(`Job failed: ${j.title}${why ? ' — ' + why : ''}. ${j.giverName} is disappointed.`, 'warn', 5);
    },
    // ------------------------------------------------------------ where to go
    where(game, j) {
      const world = game.world;
      const giverHome = () => { const s = world.settlements.find(t => t.id === j.sid); const g = game.ents.find(e => e.npcId === j.giver && !e.dead && !e.hidden); return g ? { x: g.x, y: g.y, name: j.giverName } : s ? { x: s.x, y: s.y + 2, name: `${j.giverName} in ${s.name}` } : null; };
      if (J.ready(game, j)) return giverHome();
      if (j.kind === 'fetch') return null;
      if (j.kind === 'deliver') { const t = world.settlements.find(s => s.id === j.toSid); const r = game.ents.find(e => e.npcId === j.to && !e.dead && !e.hidden); return r ? { x: r.x, y: r.y, name: j.toName } : t ? { x: t.x, y: t.y + 2, name: `${j.toName} in ${t.name}` } : null; }
      if (j.kind === 'escort') { const t = world.settlements.find(s => s.id === j.toSid); return t ? { x: t.x, y: t.y, name: t.name } : null; }
      if (j.kind === 'lead' && j.following) return giverHome();
      if (j.kind === 'task' && j.spots) { const sp = j.spots.find(s => !s.done); return sp ? { x: sp.x, y: sp.y, name: j.act.toLowerCase() } : giverHome(); }
      return { x: j.x, y: j.y, name: j.title, vague: j.kind === 'hunt' || j.kind === 'lead' };
    },
    tracked(game, id) {
      const j = J.byId(game.world, id.slice(4));
      if (!j || j.status !== 'active') return null;
      const w = J.where(game, j);
      const label = `✦ ${j.title}${J.ready(game, j) ? ' — return to ' + j.giverName : j.kind === 'fetch' ? ` (${game.pl.inv[j.item] || 0}/${j.n})` : j.kind === 'clear' ? ` (${j.progress}/${j.n})` : ''}`;
      return { kind: 'track', label, where: w || undefined };
    },
    // ------------------------------------------------------------ the world side of each job
    spawnTick(game) {
      const world = game.world, pe = game.pe;
      if (ECHO.Interior.cur) return;
      const region = ECHO.World.regionAt(world, pe.x, pe.y);
      for (const j of J.active(world)) {
        if (j.x == null || j.spawned || U.dist(j.x, j.y, pe.x, pe.y) > 34) continue;
        if (j.kind === 'clear') {
          j.spawned = true;
          for (let i = 0; i < j.n - j.progress; i++) {
            const sp = ECHO.Ent.freeSpot(world, j.x + (Math.random() - 0.5) * 4, j.y + (Math.random() - 0.5) * 4, 3); if (!sp) continue;
            const e = ECHO.Spawner.makeCreature(game, j.species, sp.x, sp.y, region, j.species === 'wolf' ? 'pj' + j.id : null);
            e.jobId = j.id; e.home = { x: j.x, y: j.y };
            game.addEnt(e);
          }
        } else if (j.kind === 'hunt' && !j.progress) {
          j.spawned = true;
          const sp = ECHO.Ent.freeSpot(world, j.x, j.y, 4); if (!sp) { j.spawned = false; continue; }
          const e = ECHO.Spawner.makeCreature(game, 'wolf', sp.x, sp.y, region, 'pj' + j.id);
          e.jobId = j.id; e.maxHp = e.hp = Math.round(e.maxHp * 2.2); e.dmgMul = 1.35; e.scale = 1.25; e.label = j.name; e.beast = true; e.home = { x: j.x, y: j.y };
          game.addEnt(e);
          for (let i = 0; i < 2; i++) { const w2 = ECHO.Spawner.makeCreature(game, 'wolf', sp.x + (i ? 1.5 : -1.5), sp.y + 1, region, 'pj' + j.id); w2.jobId = j.id + 'x'; game.addEnt(w2); }
        } else if (j.kind === 'lead' && !j.progress) {
          j.spawned = true;
          const sp = ECHO.Ent.freeSpot(world, j.x, j.y, 4); if (!sp) { j.spawned = false; continue; }
          const small = j.animal === 'kitten' || j.animal === 'puppy';
          const e = ECHO.Ent.make({ type: 'creature', species: small ? 'dog' : 'deer', x: sp.x, y: sp.y, r: small ? 0.22 : 0.35, hp: 20, maxHp: 20, speed: small ? 3.6 : 3.2, faction: 'wild', label: null });
          e.stray = j.id; e.goat = !small; e.small = small ? (j.animal === 'kitten' ? 0.5 : 0.62) : 1; e.coat = j.animal === 'kitten' ? pick(['#c87a3a', '#3a3530', '#d8d0c0']) : j.animal === 'puppy' ? '#a8784a' : null;
          e.fname = `${j.giverName}'s ${j.animal}`; e.state = 'graze'; e.home = { x: sp.x, y: sp.y };
          game.addEnt(e);
        }
      }
    },
    onKill(game, e, from) {
      const world = game.world;
      const j = J.byId(world, e.jobId);
      if (!j || j.status !== 'active') return;
      if (j.kind === 'clear') { j.progress++; if (j.progress >= j.n) ECHO.UI.toast(`That's the last of them. Go back to ${j.giverName}.`, 'info', 4); }
      if (j.kind === 'hunt') { j.progress = 1; ECHO.UI.toast(`${j.name} is dead. ${j.giverName} will want to hear.`, 'legend', 5); }
    },
    // a lost animal: grazes nervously where it strayed; follows you once you lead it
    stray(game, e, dt) {
      const world = game.world, pe = game.pe;
      const j = J.byId(world, e.stray);
      if (!j || j.status !== 'active') { if (U.dist(e.x, e.y, pe.x, pe.y) > 25) { e.dead = true; e.vanish = true; } return; }
      e.t += dt;
      if (j.following) {
        const d = U.dist(e.x, e.y, pe.x, pe.y);
        if (d > 22) { const sp = ECHO.Ent.freeSpot(world, pe.x - 1, pe.y + 1, 3); if (sp) { e.x = sp.x; e.y = sp.y; } }
        else if (d > 1.6) ECHO.Ent.travel(world, e, pe.x, pe.y, Math.max(e.speed, d > 6 ? 6 : 4), dt);
        else e.moving = false;
        e.state = e.moving ? 'roam' : 'graze';
        const s = world.settlements.find(t => t.id === j.sid);
        const giver = game.ents.find(o => o.npcId === j.giver && !o.dead && !o.hidden);
        if ((giver && U.dist(e.x, e.y, giver.x, giver.y) < 4) || (s && U.dist(e.x, e.y, s.x, s.y) < 7)) {
          j.progress = 1; j.following = false;
          if (giver) { giver.say = j.animal === 'kitten' || j.animal === 'puppy' ? 'You found her! Oh, you found her!' : 'There she is, the wretch! Thank you!'; giver.sayT = 3; }
          ECHO.UI.toast(`The ${j.animal} is home. Talk to ${j.giverName}.`, 'info', 4);
          e.dead = true; e.vanish = true;
        }
        return;
      }
      // skittish: mills about, startles if you rush it
      const d = U.dist(e.x, e.y, pe.x, pe.y);
      if (d < 2.2 && pe.moving && !ECHO.PlayerCtl.sneaking && Math.random() < dt * 0.8) { const a = Math.atan2(e.y - pe.y, e.x - pe.x); e.bolt = { x: e.x + Math.cos(a) * 4, y: e.y + Math.sin(a) * 4, t: 1.2 }; if (Math.random() < 0.5) { e.say = j.animal === 'kitten' ? '*mew!*' : j.animal === 'puppy' ? '*yip!*' : '*maa!*'; e.sayT = 1; } }
      if (e.bolt && e.bolt.t > 0) { e.bolt.t -= dt; ECHO.Ent.seek(world, e, e.bolt.x, e.bolt.y, e.speed * 1.3, dt, 0.2); return; }
      ECHO.AI.Creature.wander(game, e, dt, e.speed * 0.6);
      if (e.sayT <= 0 && d < 12 && Math.random() < dt * 0.15) { e.say = j.animal === 'kitten' ? '*mew*' : j.animal === 'puppy' ? '*whimper*' : '*maaa*'; e.sayT = 1.2; }
    },
    // the escort: walks at your side, keeps behind you when there's trouble
    escortThink(game, e, npc, dt) {
      const j = e.escort, world = game.world, pe = game.pe;
      if (!j || j.status !== 'active') { e.escort = null; return false; }
      const t = world.settlements.find(s => s.id === j.toSid);
      if (t && (U.dist(e.x, e.y, t.x, t.y) < 13 || ECHO.World.settlementAt(world, e.x, e.y, 10) === t)) {
        j.progress = 1; e.escort = null;
        npc.loc = t.id;
        e.say = `${t.name}, at last. Thank you — here, as promised.`; e.sayT = 3;
        J.complete(game, j, e);
        return true;
      }
      const d = U.dist(e.x, e.y, pe.x, pe.y);
      const danger = game.ents.find(o => !o.dead && !o.hidden && o !== e && game.hostileTo(e, o) && U.dist(o.x, o.y, e.x, e.y) < 9);
      if (danger) {
        // behind you, away from them
        const a = Math.atan2(pe.y - danger.y, pe.x - danger.x);
        ECHO.Ent.travel(world, e, pe.x + Math.cos(a) * 1.6, pe.y + Math.sin(a) * 1.6, e.speed * 1.2, dt);
        if (e.sayT <= 0 && Math.random() < dt * 0.6) { e.say = pick(['Gods — help!', 'Don\'t let them near me!', 'Behind you!']); e.sayT = 1.6; }
        return true;
      }
      if (d > 26) { const sp = ECHO.Ent.freeSpot(world, pe.x - 1.5, pe.y + 1, 3); if (sp) { e.x = sp.x; e.y = sp.y; } }
      else if (d > 2.2) ECHO.Ent.travel(world, e, pe.x - Math.cos(pe.dir) * 1.4, pe.y - Math.sin(pe.dir) * 1.4, e.speed * (d > 6 ? 1.3 : 0.95), dt);
      else e.moving = false;
      e.hidden = false;
      // the road may not be empty
      if (!j.ambushed && t) {
        const s0 = world.settlements.find(s => s.id === j.sid), total = s0 ? U.dist(s0.x, s0.y, t.x, t.y) : 1, left = U.dist(e.x, e.y, t.x, t.y);
        if (left / total < 0.65 && left / total > 0.25 && !ECHO.World.settlementAt(world, e.x, e.y, 18)) {
          j.ambushed = true;
          if (Math.random() < 0.45 && (!ECHO.Director || ECHO.Director.allow(game, 'raid'))) J.ambush(game, e);
        }
      }
      if (e.sayT <= 0 && Math.random() < dt * 0.02) { e.say = pick(['Not far now, I think.', 'My feet. My poor feet.', 'Did you hear something?', `I've never been to ${t ? t.name : 'there'} before.`, 'Thank you for this. Really.']); e.sayT = 2.4; }
      return true;
    },
    ambush(game, e) {
      const world = game.world, pe = game.pe;
      const pool = [];
      for (const c of world.camps) if (c.alive !== false) for (const id of c.members) { const n = world.npcs[id]; if (n && n.status === 'alive' && !game.ents.some(x => x.npcId === id) && c.leader !== id) pool.push(n); }
      for (let i = 0; i < Math.min(3, pool.length); i++) {
        const a = Math.random() * 6.28, sp = ECHO.Ent.freeSpot(world, pe.x + Math.cos(a) * 9, pe.y + Math.sin(a) * 9, 3);
        if (!sp) continue;
        const b = ECHO.Spawner.makePerson(game, pool[i], sp.x, sp.y, 'bandit');
        b.target = i === 0 ? e : pe; b.aggro = true;
        if (i === 0) { b.say = 'That one\'s got a fat purse!'; b.sayT = 2; }
        game.addEnt(b);
      }
      ECHO.UI.toast('Ambush on the road!', 'warn', 3);
    },
    // ------------------------------------------------------------ hands-on work at a marked spot
    interactables(game) {
      const pe = game.pe, world = game.world, out = [];
      if (pe.mounted || ECHO.Interior.cur) return out;
      for (const j of J.active(world)) {
        if (j.kind === 'task') {
          const spots = j.spots || [{ x: j.x, y: j.y, done: j.progress >= 1 }];
          for (const sp of spots) {
            if (sp.done || U.dist(sp.x, sp.y, pe.x, pe.y) > 1.7) continue;
            out.push({ kind: 'act', label: j.act, d: 0.3, act: () => { J.chan = { j, sp, t: 0, need: 2.2 }; } });
            break;
          }
        }
        if (j.kind === 'lead' && !j.following) {
          const e = game.ents.find(o => o.stray === j.id && !o.dead);
          if (e && U.dist(e.x, e.y, pe.x, pe.y) < 1.8) out.push({ kind: 'act', label: `Lead the ${j.animal} home`, d: 0.3, act: () => { j.following = true; e.say = j.animal === 'kitten' ? '*purr*' : j.animal === 'puppy' ? '*happy yip*' : '*maa*'; e.sayT = 1.2; ECHO.UI.toast(`The ${j.animal} follows you. Take it back to ${j.town}.`, 'info', 3); } });
        }
      }
      return out;
    },
    chanTick(game, dt) {
      const C = J.chan; if (!C) return;
      const pe = game.pe;
      if (U.dist(C.sp.x, C.sp.y, pe.x, pe.y) > 2 || (game.combatT != null && game.time - game.combatT < 1)) { J.chan = null; ECHO.Combat.floater(pe.x, pe.y - 1.4, 'interrupted', '#c8c0b0'); return; }
      C.t += dt;
      pe.moving = false;
      if (Math.random() < dt * 6) ECHO.Combat.burst(C.sp.x, C.sp.y, '#d8c890', 2, 1, 0.4, 2);
      if (C.t < C.need) return;
      J.chan = null;
      const j = C.j;
      C.sp.done = true;
      if (j.spots) {
        if (j.keepsake) {
          // the last place you look is where it is
          const left = j.spots.filter(s => !s.done).length;
          if (!left || Math.random() < 0.3) { j.found = true; for (const s of j.spots) s.done = true; ECHO.Combat.floater(pe.x, pe.y - 1.4, 'found it!', '#ffe08a', true); ECHO.UI.toast(j.done, 'legend', 4); }
          else ECHO.Combat.floater(pe.x, pe.y - 1.4, pick(['nothing here', 'just mud', 'only a snail']), '#c8c0b0');
        } else {
          const n = j.spots.filter(s => s.done).length;
          ECHO.Combat.floater(pe.x, pe.y - 1.4, `${n}/${j.spots.length}`, '#ffe08a');
          if (n >= j.spots.length) ECHO.UI.toast(j.done, 'info', 4);
        }
      } else { j.progress = 1; ECHO.Combat.floater(pe.x, pe.y - 1.4, 'done', '#ffe08a'); ECHO.UI.toast(j.done || 'Done.', 'info', 4); }
      if (ECHO.Sfx) ECHO.Sfx.play('coin', { pitch: 1.6, vol: 0.3 });
    },
    // ------------------------------------------------------------ the notice board
    boardOffers(game, s) {
      const world = game.world;
      const res = (s.residents || []).map(id => world.npcs[id]).filter(n => n && n.status === 'alive' && n.prof !== 'ruler');
      const out = [];
      for (const n of res) { const o = J.offerOf(game, n); if (o) out.push(o); if (out.length >= 6) break; }
      return out;
    },
    boardHtml(game, s) {
      const offers = J.boardOffers(game, s), world = game.world;
      const mine = J.active(world);
      let h = '<p class="dim">Odd jobs: what people here need doing this week. You can also simply ask anyone you meet — "Need a hand?" — and a gold mark hangs over those near you with work going.</p>';
      h += mine.length ? `<h4 class="gold">Your jobs (${mine.length}/${J.max()})</h4>` + mine.map(j => `<div class="card"><b>${esc(j.title)}</b> <span class="dim">for ${esc(j.giverName)} of ${esc(j.town)} · ${j.gold} crowns${J.ready(game, j) ? ' · <span class="gold">ready to hand in</span>' : ''}</span></div>`).join('') : '';
      h += offers.length ? offers.map(o => `<div class="card"><h4>${esc(o.title)} <span class="dim">· ${o.gold} crowns</span></h4><div>${esc(o.text)}</div><button class="small" data-job="${o.id}">Take it</button></div>`).join('') : '<div class="card">Nobody needs anything right now. Try again tomorrow.</div>';
      return h;
    },
    // ------------------------------------------------------------ what's around you
    nearby(game) {
      const world = game.world, pe = game.pe, pl = game.pl, out = [];
      const add = (o) => { o.d = U.dist(o.x, o.y, pe.x, pe.y); out.push(o); };
      for (const j of J.active(world)) { const w = J.where(game, j); add({ k: 'job', icon: '✦', name: j.title, sub: J.ready(game, j) ? `ready — back to ${j.giverName}` : J.status(game, j), x: w ? w.x : pe.x, y: w ? w.y : pe.y, track: 'job:' + j.id }); }
      for (const s of world.settlements) {
        const d = U.dist(s.x, s.y, pe.x, pe.y); if (d > 70) continue;
        const res = (s.residents || []).length;
        const fest = ECHO.Festivals && ECHO.Festivals.liveAt && ECHO.Festivals.liveAt(world, s);
        add({ k: 'town', icon: '⌂', name: s.name, sub: `${res} people${fest ? ' · festival tonight!' : ''} · notice board, odd jobs${s.buildings.some(b => b.type === 'inn') ? ', inn' : ''}${s.buildings.some(b => b.type === 'market') ? ', market' : ''}`, x: s.x, y: s.y + 2 });
      }
      for (const s of ECHO.Explore.sites(world)) {
        const d = U.dist(s.x, s.y, pe.x, pe.y); if (d > 80 || !(s.found || s.seen)) continue;
        add({ k: 'site', icon: s.cat === 'delve' ? '▼' : '◆', name: s.name, sub: s.cleared ? 'cleared' : (s.cat === 'delve' ? `dungeon ${ECHO.Explore.stars(s)}` : 'a place of note'), x: s.x, y: s.y, track: 'site:' + s.id, done: s.cleared });
      }
      if (ECHO.Secrets && ECHO.Secrets.nearby) for (const o of ECHO.Secrets.nearby(game)) add(o);
      if (ECHO.Homestead) for (const o of ECHO.Homestead.nearby(game)) add(o);
      if (ECHO.Life && ECHO.Life.nearWater && ECHO.Life.nearWater(game)) add({ k: 'fish', icon: '≈', name: 'Water close by', sub: pl.inv.rod ? 'cast a line (E at the bank)' : 'buy a rod at a market to fish here', x: pe.x, y: pe.y });
      return out.sort((a, b) => a.d - b.d).slice(0, 40);
    },
    nearbyHtml(game) {
      const pe = game.pe;
      const list = J.nearby(game);
      const dirOf = (o) => { if (o.d < 3) return 'here'; const a = Math.atan2(o.y - pe.y, o.x - pe.x); return `${Math.round(o.d)} paces ${J.dir(a)}`; };
      return `<p class="dim">Everything worth doing around you, nearest first. Ask anyone in a town "Need a hand?" for more — there is always work.</p>` +
        list.map((o, i) => `<div class="card" style="${o.done ? 'opacity:0.6' : ''}"><h4>${o.icon} ${esc(o.name)} <span class="dim">· ${dirOf(o)}</span></h4><div class="dim">${esc(o.sub || '')}</div>${o.d > 3 ? `<button class="small" data-near="${i}">Follow</button>` : ''}</div>`).join('');
    },
    bindNearby(game, body, render) {
      const list = J.nearby(game);
      body.querySelectorAll('button[data-near]').forEach(b => b.addEventListener('click', () => {
        const o = list[+b.dataset.near]; if (!o) return;
        game.pl.tracked = o.track || `mark:${o.x.toFixed(1)}:${o.y.toFixed(1)}:${o.name}`;
        if (ECHO.Purpose) { ECHO.Purpose._html = null; ECHO.Purpose.t = 0; }
        ECHO.UI.toast(`Following: ${o.name}.`, 'info', 2); render();
      }));
    },
    // ------------------------------------------------------------ each frame
    update(game, dt) {
      const world = game.world, pe = game.pe;
      if (!pe || !world) return;
      J.chanTick(game, dt);
      J.t -= dt;
      if (J.t > 0) return;
      J.t = 1;
      J.spawnTick(game);
      // deadlines
      for (const j of J.active(world)) if (j.due != null && world.day > j.due && j.kind !== 'fetch') J.fail(game, j, 'too late');
      // a gold mark over anyone close by who has work going; markers at task spots
      J.glows = [];
      if (!ECHO.Interior.cur) {
        for (const e of game.ents) {
          if (e.type !== 'person' || e.dead || e.hidden || !e.npcId || e.target || e.isCompanion || U.dist(e.x, e.y, pe.x, pe.y) > 14) continue;
          const n = world.npcs[e.npcId];
          const ready = J.active(world).some(j => (j.giver === e.npcId && J.ready(game, j)) || (j.kind === 'deliver' && j.to === e.npcId));
          if (ready) { J.glows.push({ x: e.x, y: e.y, h: 2.25, c: '#7affb0', s: 1.1, a: 0.9 }); continue; }
          const o = n && n._job && n._job.status === 'offered' && world.day - n._job.day < 2 ? n._job : null;
          if (o) J.glows.push({ x: e.x, y: e.y, h: 2.25, c: '#ffd860', s: 0.9, a: 0.85 });
          else if (n && n._jobNext == null && Math.random() < 0.15) J.offerOf(game, n);   // they think of something
        }
        for (const j of J.active(world)) if (j.kind === 'task') for (const sp of (j.spots || [{ x: j.x, y: j.y, done: j.progress >= 1 }])) if (!sp.done && U.dist(sp.x, sp.y, pe.x, pe.y) < 40) J.glows.push({ x: sp.x, y: sp.y, h: 0.6, c: '#ffe08a', s: 1.4 + Math.sin(game.time * 3) * 0.2, a: 0.8 });
      }
      // tidy old records
      const S = J.st(world);
      if (S.list.length > 80) S.list = S.list.filter(j => j.status === 'active' || world.day - (j.doneDay || j.day) < 20);
    }
  };
  if (ECHO.Pastimes) {
    ECHO.Pastimes.extraAct = ECHO.Pastimes.extraAct || [];
    ECHO.Pastimes.extraAct.push(game => J.interactables(game));
  }
})();
