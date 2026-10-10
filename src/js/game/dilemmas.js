// Requests with more than one answer.
//
// Notice boards carry requests from townsfolk that can be settled more than
// one way — with steel, with words, quietly, or with coin — and the town
// remembers which. Debt collectors leaning on a farmer; a thief holed up with
// a merchant's goods; two neighbours at each other's throats over a field;
// wolves taking lambs from a fold; a poacher in the lord's wood. How you deal
// with it moves the town's opinion of you (and so its prices, and whether it
// will deal with you at all), and the story spreads to other towns.
(function () {
  const { U } = ECHO;
  const P = () => ECHO.People;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const KINDS = {
    debt: { title: q => `Debt collectors at ${q.who}'s farm`, blurb: q => `${q.who} owes ${q.owed} crowns he can't pay, and the men who came to collect are not leaving empty-handed. Someone should do something.`, reward: 30 },
    thief: { title: q => `${q.who}'s stolen goods`, blurb: q => `A crate of ${q.goods} was taken from ${q.who}'s stall. The thief is said to be hiding out in the wilds to the ${q.dirWord}.`, reward: 40 },
    feud: { title: q => `A quarrel over a field`, blurb: q => `${q.who} and ${q.who2} both claim the same strip of land, and it is coming to blows. Settle it, one way or another.`, reward: 25 },
    wolves: { title: q => `Wolves at ${q.who}'s fold`, blurb: q => `Wolves have been taking ${q.who}'s lambs at night. Kill them, keep them out, or drive them off.`, reward: 35 },
    poacher: { title: q => `A poacher in the lord's wood`, blurb: q => `Someone has been taking deer from the lord's wood to the ${q.dirWord}. The wardens want him caught; his neighbours want him left alone.`, reward: 30 }
  };
  const DIRW = a => ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'][(Math.round(a / (Math.PI / 4)) + 8) % 8];

  const D = ECHO.Dilemmas = {
    KINDS,
    st(world) { return (world.dilemmas = world.dilemmas || { list: [], gen: {}, seq: 0 }); },
    // ------------------------------------------------------------ the notice board
    forTown(world, s) {
      const S = D.st(world);
      if (S.gen[s.id] == null || world.day - S.gen[s.id] >= 4) {
        S.gen[s.id] = world.day;
        const open = S.list.filter(q => q.sid === s.id && q.status === 'open');
        for (const q of open) q.status = 'lapsed';
        for (let i = 0, made = 0; i < 12 && made < 2; i++) { const q = D.make(world, s); if (q) { S.list.push(q); made++; } }
      }
      return S.list.filter(q => q.sid === s.id && (q.status === 'open' || q.status === 'active'));
    },
    make(world, s) {
      const S = D.st(world);
      const res = P().residents(world, s).filter(n => n.status === 'alive' && P().age(world, n) >= 18 && !n.title && n.prof !== 'ruler');
      if (res.length < 4) return null;
      const kinds = Object.keys(KINDS).filter(k => !S.list.some(q => q.sid === s.id && q.kind === k && (q.status === 'open' || q.status === 'active')));
      if (!kinds.length) return null;
      const kind = kinds[Math.floor(Math.random() * kinds.length)];
      const pick = f => { const c = res.filter(f); return c.length ? c[Math.floor(Math.random() * c.length)] : res[Math.floor(Math.random() * res.length)]; };
      const q = { id: 'dq' + (++S.seq), sid: s.id, town: s.name, kind, status: 'open', day: world.day };
      const far = (min, max, tiles) => { for (let t = 0; t < 40; t++) { const a = Math.random() * 6.28, r = min + Math.random() * (max - min); const x = s.x + Math.cos(a) * r, y = s.y + Math.sin(a) * r; const tt = ECHO.World.tile(world, Math.floor(x), Math.floor(y)); if ((!tiles || tiles.includes(tt)) && !ECHO.World.isSolid(world, x, y) && !(ECHO.Water && ECHO.Water.kind(world, x, y))) return { x, y, a }; } return null; };
      const T = ECHO.TILE;
      if (kind === 'debt') { const n = pick(n => n.prof === 'farmer'); const l = far(7, 16, [T.FARM, T.GRASS]); if (!l) return null; Object.assign(q, { npc: n.id, who: n.first, owed: 25 + Math.floor(Math.random() * 30), x: l.x, y: l.y }); }
      if (kind === 'thief') { const n = pick(n => n.prof === 'merchant'); const l = far(18, 30, [T.FOREST, T.GRASS, T.RUIN]); if (!l) return null; Object.assign(q, { npc: n.id, who: n.first, goods: ['spice', 'silver plate', 'dyed cloth', 'lamp oil'][Math.floor(Math.random() * 4)], x: l.x, y: l.y, dirWord: DIRW(l.a) }); }
      if (kind === 'feud') { const a = pick(n => n.prof === 'farmer'); const b = pick(n => n !== a && n.id !== a.id); if (!b || b === a) return null; const l = far(3, 6); if (!l) return null; Object.assign(q, { npc: a.id, npc2: b.id, who: a.first, who2: b.first, x: l.x, y: l.y }); }
      if (kind === 'wolves') { const n = pick(n => n.prof === 'farmer' || n.prof === 'hunter'); const l = far(12, 22, [T.GRASS, T.FARM]); if (!l) return null; Object.assign(q, { npc: n.id, who: n.first, x: l.x, y: l.y }); }
      if (kind === 'poacher') { const n = pick(n => n.prof === 'hunter' || n.prof === 'wanderer'); const l = far(14, 26, [T.FOREST, T.GRASS]); if (!l) return null; Object.assign(q, { npc: n.id, who: n.first, x: l.x, y: l.y, dirWord: DIRW(l.a) }); }
      q.reward = KINDS[kind].reward + Math.floor(Math.random() * 15);
      return q;
    },
    accept(game, q) {
      if (q.status !== 'open') return;
      q.status = 'active'; q.taken = game.world.day;
      game.pl.tracked = `mark:${q.x.toFixed(1)}:${q.y.toFixed(1)}:${KINDS[q.kind].title(q)}`;
      if (ECHO.Purpose) { ECHO.Purpose._html = null; ECHO.Purpose.t = 0; }
    },
    active(world) { return D.st(world).list.filter(q => q.status === 'active'); },
    // ------------------------------------------------------------ the scene, when you get there
    update(game, dt) {
      const world = game.world, pe = game.pe;
      if (!pe || ECHO.Interior.cur) return;
      for (const q of D.active(world)) {
        if (world.day - q.taken > 6) { D.finish(game, q, 'lapsed'); continue; }
        const d = U.dist(q.x, q.y, pe.x, pe.y);
        if (!q.spawned && d < 26) D.spawn(game, q);
        if (q.spawned && d > 55) { D.despawn(game, q); continue; }
        if (!q.spawned) continue;
        // a fight decides it when the last of them is down or gone
        if (q.fighting) {
          const left = D.ents(game, q).filter(e => e.dqFoe && !e.dead && !e.yielded);
          if (!left.length) D.resolve(game, q, 'fight');
        }
        // someone else (the watch, a hunter) got to the wolves first
        if (q.kind === 'wolves' && !q.done) {
          const ws = D.ents(game, q).filter(e => e.dqFoe);
          if (ws.length && ws.every(e => e.dead)) D.resolve(game, q, ws.some(e => e._killer && (e._killer === pe || e._killer.isCompanion)) ? 'fight' : 'others');
        }
        // wolves: frightened off when fire bursts near them
        if (q.kind === 'wolves' && q.scaring) {
          const wolves = D.ents(game, q).filter(e => e.dqFoe && !e.dead);
          if (q.burnt) { for (const w of wolves) { w.dqScared = true; w.aggro = false; } D.resolve(game, q, 'scare'); }
        }
        // the thief: taking the crate unseen
        if (q.kind === 'thief' && q.crate && !q.done) {
          const th = D.ents(game, q).find(e => e.dqKey);
          q.alert = th && !th.dead && U.dist(th.x, th.y, pe.x, pe.y) < (ECHO.PlayerCtl.sneaking ? 2.2 : 5.5) && !(ECHO.Stealth && ECHO.Stealth.hidden(game));
          if (q.alert && !q.seen) { q.seen = true; th.say = 'Who\'s there?!'; th.sayT = 2; }
        }
      }
    },
    ents(game, q) { return game.ents.filter(e => e.dq === q.id); },
    person(game, q, nid, x, y, role) {
      const world = game.world, n = world.npcs[nid];
      if (!n || n.status !== 'alive') return null;
      for (const e of game.ents) if (e.npcId === nid) { e.dead = true; e.vanish = true; }
      const sp = ECHO.Ent.freeSpot(world, x, y, 3) || { x, y };
      const e = ECHO.Spawner.makePerson(game, n, sp.x, sp.y, role);
      e.dq = q.id; e.post = { x: sp.x, y: sp.y };
      game.addEnt(e);
      return e;
    },
    spawn(game, q) {
      const world = game.world;
      q.spawned = true;
      const s = world.settlements.find(t => t.id === q.sid);
      const outsiders = () => { const pool = []; for (const c of world.camps) if (c.alive !== false) for (const id of c.members) { const n = world.npcs[id]; if (n && n.status === 'alive' && !game.ents.some(e => e.npcId === id && !e.dead) && c.leader !== id) pool.push(n); } return pool; };
      if (q.kind === 'debt') {
        const f = D.person(game, q, q.npc, q.x, q.y, 'villager'); if (f) { f.dqKey = true; f.say = 'Please — I just need until the harvest!'; f.sayT = 3; }
        const pool = outsiders();
        for (let i = 0; i < 2 && pool.length; i++) { const n = pool.splice(Math.floor(Math.random() * pool.length), 1)[0]; const e = D.person(game, q, n.id, q.x + 1.2 + i * 0.8, q.y + (i ? 0.8 : -0.6), 'traveler'); if (e) { e.dqFoe = true; e.faction = s ? s.faction : e.faction; if (!i) e.dqKey2 = true; } }
      }
      if (q.kind === 'thief') {
        const pool = outsiders(); const n = pool[0] || P().residents(world, s).find(n => n.prof === 'wanderer' && !game.ents.some(e => e.npcId === n.id));
        if (n) { const e = D.person(game, q, n.id, q.x + 2.8, q.y + 0.8, 'traveler'); if (e) { e.dqFoe = true; e.dqKey = true; e.faction = s ? s.faction : e.faction; e.seated = true; } }
        q.crate = { x: q.x, y: q.y };
      }
      if (q.kind === 'feud') {
        const a = D.person(game, q, q.npc, q.x - 0.8, q.y, 'villager'), b = D.person(game, q, q.npc2, q.x + 0.8, q.y, 'villager');
        if (a) { a.dqKey = true; a.dir = 0; a.say = `That field was my father's!`; a.sayT = 3; }
        if (b) { b.dir = Math.PI; b.dqB = true; }
      }
      if (q.kind === 'wolves') {
        const f = D.person(game, q, q.npc, q.x, q.y, 'villager'); if (f) f.dqKey = true;
        for (let i = 0; i < 3; i++) { const sp = ECHO.Ent.freeSpot(world, q.x + 6 + Math.random() * 3, q.y + (i - 1) * 1.5, 3); if (!sp) continue; const w = ECHO.Spawner.makeCreature(game, 'wolf', sp.x, sp.y, ECHO.World.regionAt(world, sp.x, sp.y), null); w.dq = q.id; w.dqFoe = true; w.home = { x: sp.x, y: sp.y }; game.addEnt(w); }
      }
      if (q.kind === 'poacher') {
        const p = D.person(game, q, q.npc, q.x, q.y, 'villager'); if (p) { p.dqKey = true; p.gear.bow = true; }
        q.deer = { x: q.x + 0.9, y: q.y + 0.4 };
      }
    },
    despawn(game, q) { for (const e of D.ents(game, q)) { e.dead = true; e.vanish = true; } q.spawned = false; q.fighting = false; },
    // Hold everyone in their places until something happens.
    think(game, e, npc, dt, target) {
      const q = D.st(game.world).list.find(x => x.id === e.dq);
      if (e.dqLeave) { const a = Math.atan2(e.y - game.pe.y, e.x - game.pe.x); ECHO.Ent.travel(game.world, e, e.x + Math.cos(a) * 4, e.y + Math.sin(a) * 4, e.speed, dt); e.leaveT = (e.leaveT || 6) - dt; if ((e.leaveT <= 0 && U.dist(e.x, e.y, game.pe.x, game.pe.y) > 13) || e.leaveT < -25) { e.dead = true; e.vanish = true; } return true; }
      if (!q || q.status !== 'active') { e.dq = null; return false; }
      if (e.aggro && e.dqFoe && !q.fighting && !q.done) D.startFight(game, q);   // struck first: that settles how this goes
      if (e.role === 'bandit' || e.aggro) return false;       // the fight is on: fight as usual
      if (e.post && U.dist(e.x, e.y, e.post.x, e.post.y) > 0.6) ECHO.Ent.travel(game.world, e, e.post.x, e.post.y, e.speed * 0.8, dt); else e.moving = false;
      const pe = game.pe, d = U.dist(e.x, e.y, pe.x, pe.y);
      if (q.kind === 'feud') { const o = D.ents(game, q).find(x => x !== e && !x.dead); if (o) e.dir = Math.atan2(o.y - e.y, o.x - e.x); if (e.sayT <= 0 && Math.random() < dt * 0.3) { e.say = ['Liar!', 'Thief!', 'You moved the stones!', 'Over my dead body!'][Math.floor(Math.random() * 4)]; e.sayT = 2.5; } }
      else if (d < 6 && !(q.kind === 'thief' && e.dqKey && !q.alert)) e.dir = Math.atan2(pe.y - e.y, pe.x - e.x);
      if (q.kind === 'debt' && e.dqFoe && e.sayT <= 0 && Math.random() < dt * 0.25) { e.say = ['Pay up, old man.', 'Last chance.', 'Nice farm. Shame if it burned.'][Math.floor(Math.random() * 3)]; e.sayT = 2.5; }
      if (q.kind === 'thief' && e.dqKey) { e.seated = !q.alert; }
      return true;
    },
    // ------------------------------------------------------------ choosing
    interactables(game) {
      const out = [], pe = game.pe;
      if (ECHO.Interior.cur) return out;
      for (const q of D.active(game.world)) {
        if (!q.spawned || q.done) continue;
        const key = D.ents(game, q).find(e => (e.dqKey || e.dqKey2) && !e.dead);
        const near = key && U.dist(key.x, key.y, pe.x, pe.y) < 2.6;
        if (near && !q.fighting) out.push({ kind: 'act', label: `Deal with it: ${KINDS[q.kind].title(q)}`, d: 0.3, act: () => D.choose(game, q) });
        if (q.kind === 'thief' && q.crate && !q.fighting && U.dist(q.crate.x, q.crate.y, pe.x, pe.y) < 1.8) out.push({ kind: 'act', label: q.alert ? 'The thief is watching the crate' : 'Take the goods back, quietly', d: 0.2, act: () => q.alert ? ECHO.UI.toast('Not while he is watching. Come at it unseen — sneak, keep to cover.', 'warn', 3) : D.resolve(game, q, 'sneak') });
      }
      return out;
    },
    choose(game, q) {
      const pl = game.pl, s = game.world.settlements.find(t => t.id === q.sid);
      const tongue = pl.skills.tongue || 0, rep = (s && s.rep && s.rep[pl.charId]) || 0;
      const talk = Math.round(U.clamp(0.3 + tongue / 110 + rep / 250 + (pl.merryT > 0 ? 0.1 : 0), 0.1, 0.95) * 100);
      const C = [];
      const fight = (label, sub) => C.push({ label, sub, onPick: () => D.startFight(game, q) });
      if (q.kind === 'debt') {
        fight('Throw them off the land', 'steel');
        C.push({ label: 'Talk them into leaving', sub: `words · about ${talk}% with your tongue and name`, onPick: () => D.talk(game, q, talk, 'talk') });
        C.push({ label: `Pay the debt yourself (${q.owed} crowns)`, sub: 'coin', disabled: pl.gold < q.owed, onPick: () => { pl.gold -= q.owed; D.resolve(game, q, 'pay'); } });
        C.push({ label: 'Leave them to it', sub: 'walk away', onPick: () => D.resolve(game, q, 'leave') });
      }
      if (q.kind === 'thief') {
        fight('Take it back by force', 'steel');
        C.push({ label: 'Persuade him to give it up', sub: `words · about ${talk}%`, onPick: () => D.talk(game, q, talk, 'talk') });
        C.push({ label: 'Buy it back (30 crowns)', sub: 'coin', disabled: pl.gold < 30, onPick: () => { pl.gold -= 30; D.resolve(game, q, 'pay'); } });
        C.push({ label: 'Back away (and perhaps come at the crate unseen)', sub: 'stealth', onPick: () => {} });
      }
      if (q.kind === 'feud') {
        C.push({ label: `Side with ${q.who}`, sub: `${q.who2} won't forgive you`, onPick: () => D.resolve(game, q, 'sideA') });
        C.push({ label: `Side with ${q.who2}`, sub: `${q.who} won't forgive you`, onPick: () => D.resolve(game, q, 'sideB') });
        C.push({ label: 'Make them split it, fairly', sub: `words · about ${talk}%`, onPick: () => D.talk(game, q, talk, 'mediate') });
        C.push({ label: 'Not your business', sub: 'walk away', onPick: () => D.resolve(game, q, 'leave') });
      }
      if (q.kind === 'wolves') {
        C.push({ label: 'Hunt the wolves down', sub: 'steel · they are in the field beyond', onPick: () => { D.startFight(game, q); } });
        C.push({ label: 'Pay for a stout fence (40 crowns)', sub: 'coin · the wolves live', disabled: pl.gold < 40, onPick: () => { pl.gold -= 40; D.resolve(game, q, 'pay'); } });
        C.push({ label: 'Drive them off with fire', sub: 'burst a fireball (Q) near them · nothing dies', onPick: () => { q.scaring = true; ECHO.UI.toast('Get close and throw fire near the wolves (Q).', 'info', 4); } });
      }
      if (q.kind === 'poacher') {
        C.push({ label: 'Arrest him for the wardens', sub: 'the law · his neighbours will mutter', onPick: () => D.resolve(game, q, 'arrest') });
        C.push({ label: 'Let him go', sub: 'mercy · the wardens will hear', onPick: () => D.resolve(game, q, 'free') });
        C.push({ label: 'Keep quiet — for a share of the meat money (20 crowns)', sub: 'coin in your pocket', onPick: () => { pl.gold += 20; D.resolve(game, q, 'cut'); } });
      }
      ECHO.UI.modal({ title: KINDS[q.kind].title(q), html: `<p>${esc(KINDS[q.kind].blurb(q))}</p>`, choices: C });
    },
    talk(game, q, pct, what) {
      if (Math.random() * 100 < pct) { ECHO.Character.train(game.pl, 'tongue', 0.4); return D.resolve(game, q, what); }
      ECHO.Combat.floater(game.pe.x, game.pe.y - 1.4, 'it doesn\'t work…', '#ff9a7a');
      if (q.kind === 'feud') return D.resolve(game, q, 'mediateFail');
      ECHO.UI.toast('They laugh in your face. It comes to blows.', 'warn', 3);
      D.startFight(game, q);
    },
    startFight(game, q) {
      q.fighting = true; q.chose = q.chose || 'fight';
      for (const e of D.ents(game, q)) if (e.dqFoe) { if (e.type === 'person') { e.role = 'bandit'; e.seated = false; } e.aggro = true; e.target = game.pe; }
    },
    // ------------------------------------------------------------ outcomes
    resolve(game, q, how) {
      if (q.done) return;
      q.done = true; q.how = how;
      const world = game.world, pl = game.pl, s = world.settlements.find(t => t.id === q.sid);
      const npc = world.npcs[q.npc], npc2 = q.npc2 && world.npcs[q.npc2];
      const op = (n, v) => { if (n) n.op[pl.charId] = U.clamp((n.op[pl.charId] || 0) + v, -100, 100); };
      // town opinion now, and a story that spreads
      const O = {
        debt: { fight: [8, 25, 'protect', `${pl.first} ${pl.last} drove debt collectors off ${q.who}'s farm with a blade.`], talk: [10, 30, 'protect', `${pl.first} ${pl.last} talked the debt collectors off ${q.who}'s farm.`], pay: [12, 45, 'protect', `${pl.first} ${pl.last} paid ${q.who}'s debt out of their own purse.`], leave: [-4, -25, null, `${pl.first} ${pl.last} stood by while ${q.who} was beaten for a debt.`] },
        thief: { fight: [5, 15, 'cruel', `${pl.first} ${pl.last} cut down the thief who robbed ${q.who}.`], talk: [8, 20, null, `${pl.first} ${pl.last} talked a thief into returning ${q.who}'s goods.`], pay: [4, 10, null, `${pl.first} ${pl.last} bought back ${q.who}'s stolen goods.`], sneak: [7, 20, null, `${pl.first} ${pl.last} stole back ${q.who}'s goods from under a thief's nose.`] },
        feud: { sideA: [2, 25, null, `${pl.first} ${pl.last} settled a quarrel over a field in ${q.who}'s favour.`], sideB: [2, -25, null, `${pl.first} ${pl.last} settled a quarrel over a field against ${q.who}.`], mediate: [8, 15, 'protect', `${pl.first} ${pl.last} made peace between ${q.who} and ${q.who2}.`], mediateFail: [-3, -10, null, `${pl.first} ${pl.last}'s meddling made the quarrel between ${q.who} and ${q.who2} worse.`], leave: [0, -5, null, null] },
        wolves: { fight: [8, 25, 'protect', `${pl.first} ${pl.last} killed the wolves taking ${q.who}'s lambs.`], pay: [6, 30, null, `${pl.first} ${pl.last} paid for a fence round ${q.who}'s fold.`], scare: [7, 25, null, `${pl.first} ${pl.last} drove the wolves from ${q.who}'s fold with fire${D.ents(game, q).some(e => e.dqFoe && e.dead) ? '' : ', and killed none'}.`], others: [0, 0, null, null] },
        poacher: { arrest: [-3, -40, null, `${pl.first} ${pl.last} handed a poacher to the lord's wardens.`], free: [5, 35, null, `${pl.first} ${pl.last} let a poacher go free.`], cut: [-2, 15, 'betray', `${pl.first} ${pl.last} took a share of a poacher's profits to keep quiet.`] }
      }[q.kind][how] || [0, 0, null, null];
      const [repD, opD, tag, story] = O;
      if (s) { s.rep = s.rep || {}; s.rep[pl.charId] = U.clamp((s.rep[pl.charId] || 0) + repD, -100, 100); }
      op(npc, q.kind === 'feud' && how === 'sideB' ? -25 : opD); if (q.kind === 'feud') op(npc2, how === 'sideA' ? -25 : how === 'sideB' ? 25 : how === 'mediate' ? 15 : how === 'mediateFail' ? -10 : -5);
      // the faction cares about the law
      const factionRep = q.kind === 'poacher' && s ? { [s.faction]: how === 'arrest' ? 6 : how === 'free' ? -4 : 0 } : {};
      if (story) ECHO.Chronicle.deed(world, { text: story, importance: 1, x: q.x, y: q.y, rep: Math.sign(repD) * Math.min(4, Math.abs(repD) / 2), factionRep, tag });
      // the people walk away from it
      for (const e of D.ents(game, q)) { if (e.dead) continue; if (e.dqFoe && (how === 'talk' || how === 'pay')) { e.dqLeave = true; e.say = how === 'pay' ? 'Pleasure doing business.' : 'Fine. Fine! We\'re going.'; e.sayT = 2.5; } if (how === 'arrest' && e.dqKey) { e.dqLeave = true; e.say = 'You\'ll regret this.'; e.sayT = 2.5; } }
      if (q.kind === 'thief' && (how === 'sneak' || how === 'pay' || how === 'talk' || how === 'fight')) q.crate = null;
      // payment by messenger for a good outcome
      const paid = repD > 0 ? q.reward : 0;
      if (paid) { pl.gold += paid; if (ECHO.Prowess) { const ups = ECHO.Prowess.gain(pl, 40 + q.reward); for (const u of ups) ECHO.Progress.levelUp(game, u); } }
      const delta = repD > 0 ? `${q.town} thinks better of you` : repD < 0 ? `${q.town} thinks less of you` : `${q.town} hardly notices`;
      if (how === 'others') { ECHO.UI.toast(`Someone else dealt with the wolves at ${q.who}'s fold before you did.`, 'info', 5); return D.finish(game, q, 'done'); }
      ECHO.UI.toast(`${KINDS[q.kind].title(q)} — settled. ${delta}${paid ? `; ${paid} crowns from ${q.who}` : ''}.`, repD > 0 ? 'legend' : 'info', 6);
      D.finish(game, q, 'done');
    },
    finish(game, q, status) {
      q.status = status;
      if (status === 'lapsed' && q.taken) { const s = game.world.settlements.find(t => t.id === q.sid); if (s) { s.rep = s.rep || {}; s.rep[game.pl.charId] = (s.rep[game.pl.charId] || 0) - 2; } ECHO.UI.toast(`You never dealt with "${KINDS[q.kind].title(q)}". ${q.town} noticed.`, 'warn', 4); }
      if (game.pl.tracked && game.pl.tracked.startsWith('mark:') && game.pl.tracked.endsWith(KINDS[q.kind].title(q))) game.pl.tracked = null;
      setTimeout(() => { if (q.status !== 'active') for (const e of D.ents(game, q)) if (!e.dead && !e.dqLeave && e.type === 'person') { e.dq = null; } }, 8000);
    },
    // fire near the wolves: they bolt (and the flames are meant to frighten, not to kill)
    fireAt(x, y) {
      const g = ECHO.Game; if (!g) return;
      for (const q of D.active(g.world)) if (q.kind === 'wolves' && q.scaring && !q.fighting && q.spawned && D.ents(g, q).some(e => e.dqFoe && !e.dead && U.dist(e.x, e.y, x, y) < 4.5)) {
        q.burnt = true;
        for (const e of D.ents(g, q)) if (e.dqFoe) e.dqScared = true;
      }
    },
    // The quest's wolves prowl at the edge of the fold rather than charging
    // the first thing they see — until someone starts a fight, or fire sends
    // them running for good.
    creature(game, e, dt, speed) {
      const q = D.st(game.world).list.find(x => x.id === e.dq);
      const pe = game.pe;
      const gone = !q || q.status !== 'active' || e.dqScared;
      if (gone && (e.dqScared || (q && (q.how === 'pay' || q.how === 'scare')))) {
        // run from the fold, and away into the wild
        const from = q ? { x: q.x, y: q.y } : pe;
        const a = Math.atan2(e.y - from.y, e.x - from.x) + Math.sin(e.t * 2) * 0.3;
        ECHO.Ent.seek(game.world, e, e.x + Math.cos(a) * 3, e.y + Math.sin(a) * 3, speed * 1.2, dt, 0.1);
        e.state = 'flee'; e.target = null;
        if (!e.fledT && e.sayT <= 0) { e.say = 'Yelp!'; e.sayT = 1; }
        e.fledT = (e.fledT || 0) + dt;
        if (e.fledT > 5 && U.dist(e.x, e.y, pe.x, pe.y) > 12) { e.dead = true; e.vanish = true; }
        return true;
      }
      if (gone) { e.dq = null; return false; }
      if (e.aggro && !q.fighting) D.startFight(game, q);
      if (q.fighting) return false;
      e.state = 'roam'; e.target = null;
      ECHO.AI && ECHO.AI.Creature ? ECHO.AI.Creature.wander(game, e, dt, speed) : null;
      // watch whoever comes near, hackles up
      if (U.dist(e.x, e.y, pe.x, pe.y) < 6) { e.dir = Math.atan2(pe.y - e.y, pe.x - e.x); e.flip = Math.cos(e.dir) < 0; if (e.sayT <= 0 && Math.random() < dt * 0.3) { e.say = 'Grrr…'; e.sayT = 1.5; } }
      return true;
    },
    // ------------------------------------------------------------ the board tab
    boardHtml(world, s, pl) {
      const list = D.forTown(world, s);
      if (!list.length) return '<p class="dim">No one here has asked for help today.</p>';
      return `<p class="dim">Trouble that can be settled more than one way. ${esc(s.name)} will remember how you settle it.</p><div class="list">${list.map(q => `<div class="card"><h4>${esc(KINDS[q.kind].title(q))}</h4><div>${esc(KINDS[q.kind].blurb(q))}</div><div class="gold">${q.reward} crowns if it ends well</div><div class="row">${q.status === 'active' ? '<span class="dim">taken — the line at the top of the screen points the way</span>' : `<button class="small" data-dq="${q.id}">Take it on</button>`}</div></div>`).join('')}</div>`;
    }
  };
})();
