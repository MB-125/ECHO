// Comrade: the companion as a person, not a pet.
//
// Orders (T): in a fight, send them at whatever you're fighting; otherwise
// Follow, Hold here, or Stay back. Holding, they keep the spot and fight only
// what comes to them; staying back, they keep out of it unless they're
// attacked or have a bow or a spell to throw. When you creep, they creep.
//
// They learn how you fight. Fight from range and a sellsword moves up to keep
// them off you; wade in and a hunter starts picking off the ones on your
// flanks; get hurt a lot and a hedge-mage heals sooner. They tell you when
// they've noticed.
//
// They judge what you do. Kindness, cruelty, mercy, theft, breaking your word
// — each of them sees it through their own nature: a cruel sellsword laughs
// when you cut down someone who yielded, a kind one is sickened. Push them
// far enough and they'll want words; further, and they'll leave. Earn their
// trust and they'd follow you anywhere — and fight the harder for it.
//
// And they remember. The barrow you went down together, the wolves at the
// ford, the night you nearly died: walk past the place again and they'll bring
// it up. They talk about home when you pass through it, about the weather and
// the dark, about the days you've been on the road, about how you always roll
// to the left.
(function () {
  const { U } = ECHO;
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const P = () => ECHO.People;
  const C = () => ECHO.Companions;
  const has = (npc, t) => npc.traits && npc.traits.includes(t);

  // how each nature feels about what you do, per unit of the deed
  const FEEL = {
    mercy: { kind: 20, generous: 15, pious: 10, loyal: 4, cruel: -15, greedy: -4, _: 4 },
    cruelty: { cruel: 12, 'hot-headed': 2, kind: -30, pious: -20, honest: -10, generous: -10, loyal: -6, _: -9 },
    betrayal: { deceitful: 8, greedy: 3, honest: -30, loyal: -30, pious: -10, _: -10 },
    protect: { brave: 12, kind: 12, loyal: 8, pious: 6, cowardly: -2, _: 5 },
    reckless: { brave: 6, 'hot-headed': 6, cowardly: -10, patient: -6, _: 0 },
    theft: { greedy: 10, deceitful: 6, honest: -16, pious: -10, kind: -6, loyal: -2, _: -4 },
    gift: { generous: 14, kind: 12, pious: 6, greedy: -8, _: 3 }
  };
  const SAY = {
    up: { _: ['Good.', 'That was well done.', 'Ha! I like you.'], kind: ['That was kind. The world needs more of it.'], cruel: ['Ha! That\'s how it\'s done.', 'Good. Make them fear us.'], greedy: ['Ooh. Share?'], pious: ['The Flame saw that.'], brave: ['Now that took nerve.'] },
    down: { _: ['Was that really necessary?', 'I didn\'t sign on for this.', '…', 'You\'ll get us both hanged.'], kind: ['They\'d yielded!', 'That was cruel.', 'How could you?'], honest: ['Put it back.', 'That\'s not how I do things.'], cruel: ['Soft. You\'ll regret that.'], greedy: ['Giving it away? Madness.'], loyal: ['I\'ll remember you can do that.'], cowardly: ['Are you trying to get us killed?'] }
  };
  const ORDERS = { follow: 'Follow me', hold: 'Hold here', back: 'Stay back', focus: 'Attack my target' };

  const Cm = ECHO.Comrade = {
    t: 0, bT: 30, histT: 0, styleT: 0, fightKills: [],
    st(npc) {
      const s = C().st(npc);
      if (s.appr == null) s.appr = 10;
      s.hist = s.hist || [];
      s.adapt = s.adapt || {};
      s.towns = s.towns || {};
      s.griefs = s.griefs || [];
      return s;
    },
    cur(game) {
      const pl = game.pl, npc = pl && pl.companion && game.world.npcs[pl.companion];
      const e = npc && game.ents.find(x => x.isCompanion && !x.dead);
      return npc && e ? { npc, e } : null;
    },
    // ------------------------------------------------------------ orders
    order(game, kind, quiet) {
      const c = Cm.cur(game); if (!c) return;
      const { npc, e } = c, pe = game.pe;
      e.order = kind;
      if (kind === 'hold') e.holdAt = { x: e.x, y: e.y };
      if (kind === 'focus') e.focus = Cm.yourTarget(game);
      const lines = {
        follow: ['Right behind you.', 'With you.', 'Lead on.'],
        hold: ['I\'ll hold here.', 'Not a step back.', 'Holding.'],
        back: ['I\'ll keep my head down.', 'Staying back.', 'Out of the way — got it.'],
        focus: [`On it!`, 'That one? Done.', 'Going in!']
      };
      if (!quiet) { e.say = pick(lines[kind]); e.sayT = 1.8; ECHO.UI.toast(`${npc.first}: ${ORDERS[kind]}.`, 'info', 2); }
      C()._hud = null;
    },
    yourTarget(game) {
      const PC = ECHO.PlayerCtl, pe = game.pe;
      const ok = o => o && !o.dead && !o.hidden && game.hostileTo(pe, o) && U.dist(o.x, o.y, pe.x, pe.y) < 18;
      if (ok(PC.lock)) return PC.lock;
      if (ok(game.lastStruck) && game.time - (game.lastStruckT || 0) < 6) return game.lastStruck;
      return null;
    },
    key(game) {
      const c = Cm.cur(game); if (!c) return;
      const fighting = game.combatT != null && game.time - game.combatT < 5;
      const t = fighting && Cm.yourTarget(game);
      if (t) return Cm.order(game, 'focus');
      const o = c.e.order || 'follow';
      Cm.order(game, o === 'follow' || o === 'focus' ? 'hold' : o === 'hold' ? 'back' : 'follow');
    },
    // Called by the companion's mind each frame: who to fight, and where to be.
    steer(game, e, npc, dt, target) {
      const pe = game.pe, o = e.order || 'follow';
      const out = { target, mode: o };
      // creep when you creep
      e.sneaking = !!(ECHO.PlayerCtl.sneaking && !target && !pe.mounted);
      if (o === 'focus') {
        const f = e.focus;
        if (!f || f.dead || f.hidden || U.dist(f.x, f.y, pe.x, pe.y) > 22) { e.order = 'follow'; e.focus = null; if (f && f.dead && e.sayT <= 0) { e.say = pick(['Done.', 'Got it.', 'Next?']); e.sayT = 1.4; } out.mode = 'follow'; }
        else { out.target = f; e.target = f; return out; }
      }
      // what they've learned of you picks their fights
      if (target && out.mode === 'follow') {
        const s = Cm.st(npc), foes = C().foesNear(game, pe.x, pe.y, 9);
        if (s.adapt.ranged && s.cls === 'sellsword' && foes.length) {
          // keep them off the archer: whoever is closest to you
          let best = null, bd = 99; for (const f of foes) { const d = U.dist(f.x, f.y, pe.x, pe.y); if (d < bd) { bd = d; best = f; } }
          if (best) { out.target = best; e.target = best; }
        } else if (s.adapt.melee && s.cls === 'hunter' && foes.length > 1) {
          // pick off the ones on your flanks, not the one you're already fighting
          const yours = Cm.yourTarget(game);
          const alt = foes.filter(f => f !== yours).sort((a, b) => U.dist(a.x, a.y, pe.x, pe.y) - U.dist(b.x, b.y, pe.x, pe.y))[0];
          if (alt) { out.target = alt; e.target = alt; }
        }
      }
      if (o === 'hold' && out.target && e.holdAt && U.dist(out.target.x, out.target.y, e.holdAt.x, e.holdAt.y) > 6) out.target = null;
      if (o === 'back' && out.target && U.dist(out.target.x, out.target.y, e.x, e.y) > 3.2 && Cm.st(npc).cls === 'sellsword') out.target = null;
      return out;
    },
    // Where to stand when not fighting, for the current order. True if handled.
    place(game, e, npc, dt, mode) {
      const pe = game.pe, world = game.world;
      if (mode === 'hold' && e.holdAt) {
        if (U.dist(e.x, e.y, e.holdAt.x, e.holdAt.y) > 0.6) ECHO.Ent.travel(world, e, e.holdAt.x, e.holdAt.y, e.speed, dt);
        else { e.moving = false; e.dir = Math.atan2(pe.y - e.y, pe.x - e.x); e.flip = Math.cos(e.dir) < 0; }
        // leave them too far behind and they come after you
        if (U.dist(e.x, e.y, pe.x, pe.y) > 40) { e.order = 'follow'; e.say = 'Wait for me!'; e.sayT = 2; }
        return true;
      }
      if (mode === 'back') {
        const d = U.dist(e.x, e.y, pe.x, pe.y);
        const bx = pe.x - Math.cos(pe.dir) * 5, by = pe.y - Math.sin(pe.dir) * 5;
        if (d > 7 || d < 3.5) ECHO.Ent.travel(world, e, ECHO.World.isSolid(world, bx, by) ? pe.x : bx, ECHO.World.isSolid(world, bx, by) ? pe.y : by, e.speed * (e.sneaking ? 0.5 : 0.9), dt);
        else e.moving = false;
        return true;
      }
      return false;
    },
    // ------------------------------------------------------------ judgement
    react(game, kind, amount) {
      const c = Cm.cur(game); if (!c) return;
      const { npc, e } = c, pe = game.pe;
      if (U.dist(e.x, e.y, pe.x, pe.y) > 16 || e.hidden) return;   // they didn't see it
      const F = FEEL[kind]; if (!F) return;
      let v = 0, n = 0;
      for (const t of npc.traits || []) if (F[t] != null) { v += F[t]; n++; }
      if (!n) v = F._;
      const delta = U.clamp(v * amount, -25, 25);
      if (Math.abs(delta) < 0.8) return;
      const s = Cm.st(npc);
      // a broken promise stings twice
      const promised = s.promise != null && game.world.day - s.promise <= 3 && delta < 0;
      s.appr = U.clamp(s.appr + delta * (promised ? 2 : 1), -100, 100);
      if (delta < -3) { s.griefs.push({ k: kind, d: game.world.day }); if (s.griefs.length > 6) s.griefs.shift(); }
      C()._hud = null;
      // a word, in a moment
      if (Math.abs(delta) >= 3) setTimeout(() => {
        if (e.dead) return;
        const pool = SAY[delta > 0 ? 'up' : 'down'];
        const own = (npc.traits || []).flatMap(t => pool[t] || []);
        e.say = promised ? 'You promised me.' : pick(own.length && Math.random() < 0.7 ? own : pool._); e.sayT = 2.4;
      }, 700);
      if (s.appr >= 60 && !s.devoted) { s.devoted = true; setTimeout(() => { if (!e.dead) { e.say = 'I\'d follow you anywhere. You know that?'; e.sayT = 3; } }, 3500); ECHO.UI.toast(`${npc.first} would follow you anywhere now. (Fights harder at your side.)`, 'mercy', 5); }
      if (s.appr < 40 && s.devoted) s.devoted = false;
    },
    // When it's gone too far: words, or worse.
    reckon(game) {
      const c = Cm.cur(game); if (!c) return;
      const { npc, e } = c, pl = game.pl, world = game.world, s = Cm.st(npc);
      if (ECHO.UI.modalOpen || ECHO.UI.panelOpen || (game.combatT != null && game.time - game.combatT < 8) || ECHO.Interior.cur && ECHO.Interior.cur.carved) return;
      if (s.appr <= -75) {
        e.say = pick(['I\'m done. Find someone else to do your killing.', 'This is where we part. Don\'t follow me.', 'I can\'t do this any more.']); e.sayT = 4;
        ECHO.UI.toast(`${npc.first} ${npc.last} has left you. (${s.griefs.map(g => g.k).slice(-2).join(', ') || 'too much'}).`, 'warn', 7);
        P().remember(world, npc, `left ${pl.first} ${pl.last}'s side in disgust`, 'change', null, 3);
        npc.op[pl.charId] = (npc.op[pl.charId] || 0) - 30;
        C().dismiss(game, true);
        return;
      }
      if (s.appr <= -40 && (s.argued == null || world.day - s.argued >= 3)) {
        s.argued = world.day;
        const what = { cruelty: 'the cruelty', betrayal: 'the lies', theft: 'the stealing', mercy: 'letting them walk away', gift: 'giving everything away', reckless: 'the way you throw us both at death' };
        const list = [...new Set(s.griefs.map(g => what[g.k]).filter(Boolean))].slice(-3);
        const loyal = has(npc, 'loyal');
        ECHO.UI.modal({ title: `${npc.first} wants a word`, html: `<p class="prose"><b>${npc.first}</b> stops in the road and won't walk on. "We need to talk. ${list.length ? `It's ${U.listJoin(list)}.` : 'It\'s all of it.'} I don't know who you are any more. ${loyal ? 'I said I\'d stand by you, and I meant it, but—' : 'I\'m not sure I want to.'}"</p>`, choices: [
          { label: '"You\'re right. I\'ll do better."', sub: 'A promise — they will hold you to it', onPick: () => { s.appr += 15; s.promise = world.day; e.say = 'See that you do.'; e.sayT = 2.4; C()._hud = null; } },
          { label: '"This is how I do things. Take it or leave it."', onPick: () => { if (loyal || s.appr > -55) { s.appr -= 5; e.say = 'Fine. For now.'; e.sayT = 2.4; } else { s.appr = -100; Cm.reckon(game); } C()._hud = null; } },
          { label: '"Then go."', onPick: () => { e.say = 'Gladly.'; e.sayT = 2; npc.op[pl.charId] = (npc.op[pl.charId] || 0) - 10; C().dismiss(game); } }
        ] });
      }
    },
    mood(npc) {
      const a = Cm.st(npc).appr;
      return a >= 60 ? ['devoted', '#ffcf8a'] : a >= 20 ? ['content', '#9fe0c8'] : a > -20 ? ['wary', '#c8c0b0'] : a > -50 ? ['uneasy', '#e8a870'] : ['angry', '#ff7a6a'];
    },
    badge(npc, e) {
      const [m, col] = Cm.mood(npc), o = e.order && e.order !== 'follow' ? ORDERS[e.order].toLowerCase() : null;
      return ` · <b style="color:${col}">${m}</b>${o ? ` · <span style="color:#bfe8ff">${o}</span>` : ''}`;
    },
    // ------------------------------------------------------------ memory
    note(game, k, o = {}) {
      const c = Cm.cur(game); if (!c) return;
      const s = Cm.st(c.npc), world = game.world, pe = game.pe;
      const L = ECHO.Interior.cur;
      const x = o.x != null ? o.x : L && L.site ? L.site.x : pe.x, y = o.y != null ? o.y : L && L.site ? L.site.y : pe.y;
      if (s.hist.some(h => h.k === k && h.name === o.name && world.day - h.d < 2 && U.dist(h.x, h.y, x, y) < 10)) return;
      s.hist.push({ k, d: world.day, x, y, name: o.name || null, foe: o.foe || null, recalled: null });
      if (s.hist.length > 30) s.hist.shift();
    },
    placeName(game, x, y) {
      const w = game.world, s = ECHO.World.settlementAt(w, x, y, 25);
      if (s) return `near ${s.name}`;
      const site = ECHO.Explore.sites(w).filter(t => t.found !== false).sort((a, b) => U.dist(a.x, a.y, x, y) - U.dist(b.x, b.y, x, y))[0];
      return site && U.dist(site.x, site.y, x, y) < 20 ? `by ${site.name}` : 'on the road';
    },
    onKill(game, foe) {
      if (!Cm.cur(game) || !foe) return;
      const name = foe.foe ? foe.foe.name : foe.species ? (ECHO.Ecology && ECHO.Ecology.SPECIES && ECHO.Ecology.SPECIES[foe.species] ? ECHO.Ecology.SPECIES[foe.species].plural : foe.species + 's') : foe.role === 'bandit' ? 'Ashfang outlaws' : foe.type === 'person' ? 'cutthroats' : 'beasts';
      Cm.fightKills.push(name);
      if (foe.boss2 || foe.type === 'boss') Cm.note(game, 'lord', { name: foe.foe ? foe.foe.name : foe.name || 'the beast' });
    },
    // ------------------------------------------------------------ talk on the road
    lines(game, npc, e) {
      const world = game.world, pe = game.pe, pl = game.pl, s = Cm.st(npc), out = [];
      const L = ECHO.Interior.cur;
      // places with history
      if (!L) for (const h of s.hist) {
        if (world.day - h.d < 1 || (h.recalled != null && world.day - h.recalled < 4) || U.dist(h.x, h.y, pe.x, pe.y) > 10) continue;
        const t = {
          fight: `This is where we fought those ${h.foe || 'brutes'}. ${pick(['I still have the scar.', 'You were something to see that day.', 'Feels like a lifetime ago.', 'I can still hear it.'])}`,
          delve: `${h.name}. ${pick(['I swore I\'d never go back down there.', 'I still dream about that place.', 'Gives me the shivers just looking at it.'])}`,
          lord: `This is where we killed ${h.name}. ${pick(['They\'ll be telling that one for years.', 'Still can\'t believe we walked out.'])}`,
          close: `You nearly died here, you know. ${pick(['Don\'t do that again.', 'I thought I\'d be burying you.'])}`,
          fire: 'Remember the fire here? Your eyebrows have only just grown back.'
        }[h.k];
        if (t) { out.push([5, t, () => { h.recalled = world.day; }]); break; }
      }
      // home
      const home = ECHO.World.settlementAt(world, pe.x, pe.y, 14);
      if (home && home.id === npc.home && (s.homeSaid == null || world.day - s.homeSaid > 5)) {
        const sp = npc.spouse && world.npcs[npc.spouse], kid = (npc.kids || []).map(id => world.npcs[id]).find(k => k && k.status === 'alive'), par = (npc.parents || []).map(id => world.npcs[id]).find(k => k && k.status === 'alive');
        out.push([8, sp && sp.status === 'alive' ? `Home. ${sp.first} will be glad — or furious. Probably both.` : kid ? `Home. ${kid.first} will have grown a hand taller.` : par ? `Home. My ${par.sex === 'f' ? 'mother' : 'father'} will want to see me, not that ${par.sex === 'f' ? 'she' : 'he'}'ll say so.` : 'Home. It looks smaller than I remember.', () => { s.homeSaid = world.day; }]);
      }
      // time together
      const days = s.since != null ? world.day - s.since : 0;
      for (const m of [7, 30, 60, 100, 200, 365]) if (days >= m && !(s.miles || []).includes(m)) { out.push([6, { 7: 'A week on the road together. Feels longer. In a good way. Mostly.', 30: 'A month, now, you and me. Who\'d have thought.', 60: 'Two months. I\'ve stopped counting the blisters.', 100: 'A hundred days. I should have charged you more.', 200: 'Two hundred days on the road. I don\'t remember what a bed feels like.', 365: 'A year. A whole year. Happy anniversary, I suppose.' }[m], () => { (s.miles = s.miles || []).push(m); }]); break; }
      // your habits — the fighters notice
      const W = ECHO.Wits && ECHO.Wits.h;
      if (W && s.cls !== 'mender' && (s.habitSaid == null || world.day - s.habitSaid >= 2)) {
        const set = () => { s.habitSaid = world.day; };
        if (Math.abs(W.side) > 0.6 && W.dodge > 0.4) out.push([3, `You always roll to the ${W.side > 0 ? 'left' : 'right'}, you know. People notice that sort of thing.`, set]);
        else if (W.heavy > 0.5) out.push([3, 'You lean on those big swings. One day someone\'s going to step inside one.', set]);
        else if (W.block > 0.55) out.push([3, 'You turtle up behind that guard a lot. Somebody\'s going to kick it in.', set]);
      }
      // shared history, generally
      const old = s.hist.filter(h => world.day - h.d >= 2 && (h.k === 'delve' || h.k === 'lord' || h.k === 'fight'));
      if (old.length) { const h = pick(old); out.push([1.5, h.k === 'lord' ? `${h.name}. We killed ${h.name}. I still can't quite believe it.` : h.k === 'delve' ? `Remember ${h.name}? ${pick(['The smell of it.', 'Never again.', 'Good times. Terrible, terrible times.'])}` : `Those ${h.foe} — ${Cm.placeName(game, h.x, h.y)}. ${pick(['We were lucky.', 'We were good.'])}`]); }
      // the world around
      const wx = ECHO.Weather ? ECHO.Weather.here(world, pe.x, pe.y) : null;
      if (!L && game.isNight() && !pl.lanternOn) out.push([1.5, pick(['Can\'t see my own feet out here.', 'Light the lantern, would you?', 'Every shadow looks like a wolf.'])]);
      if (!L && wx && (wx.today === 'rain' || wx.today === 'storm')) out.push([1.5, pick(['My boots will never dry.', 'Rain. Of course it\'s rain.', 'I can feel it running down my back.'])]);
      if (!L && wx && (wx.today === 'snow' || wx.today === 'blizzard' || wx.harsh)) out.push([1.5, pick(['I can\'t feel my fingers.', 'Snow. Wonderful.'])]);
      if (!L) { const t = ECHO.World.tile(world, Math.floor(pe.x), Math.floor(pe.y)); if (t === ECHO.TILE.FOREST) out.push([0.8, pick(['Too quiet in these woods.', 'Something\'s watching us. I\'m sure of it.'])]); if (t === ECHO.TILE.RUIN) out.push([1, 'Old stones. Someone lived here once.']); }
      // how they feel about you
      if (s.appr >= 60) out.push([0.8, pick(['I\'m glad I came with you.', 'Wherever you\'re going, I\'m going.'])]);
      else if (s.appr <= -20) out.push([1, pick(['…', 'Hmph.', 'Just walk.'])]);
      return out;
    },
    banter(game, dt) {
      const c = Cm.cur(game); if (!c) return;
      const { npc, e } = c;
      if (e.target || e.sayT > 0 || ECHO.UI.modalOpen || (game.combatT != null && game.time - game.combatT < 10)) return;
      Cm.bT -= dt;
      if (Cm.bT > 0) return;
      const opts = Cm.lines(game, npc, e);
      if (!opts.length) { Cm.bT = 20; return; }
      let tot = 0; for (const o of opts) tot += o[0];
      let r = Math.random() * tot, ch = opts[0];
      for (const o of opts) { r -= o[0]; if (r <= 0) { ch = o; break; } }
      e.say = ch[1]; e.sayT = Math.min(4.5, 2 + ch[1].length * 0.03);
      if (ch[2]) ch[2]();
      e.idleT = Math.max(e.idleT || 0, 60);
      Cm.bT = 55 + Math.random() * 70;
    },
    // ------------------------------------------------------------ learning your style
    style(game, dt) {
      const c = Cm.cur(game); if (!c) return;
      const { npc, e } = c, pl = game.pl, s = Cm.st(npc), W = ECHO.Wits && ECHO.Wits.h;
      const ps = pl.style || (pl.style = { ranged: 0, melee: 0, sneak: 0, hurt: 0 });
      const fighting = game.combatT != null && game.time - game.combatT < 4;
      const k = dt / 240;   // slow: minutes of fighting, not seconds
      if (fighting && W) { ps.ranged += (W.ranged - ps.ranged) * k * 4; ps.melee += ((W.heavy + W.dodge + W.block) / 2 - ps.melee) * k * 4; }
      if (fighting) ps.hurt += ((pl.hp < pl.maxHp * 0.4 ? 1 : 0) - ps.hurt) * k * 3;
      ps.sneak += ((ECHO.PlayerCtl.sneaking ? 1 : 0) - ps.sneak) * k;
      const learn = (key, cond, line) => { if (cond && !s.adapt[key]) { s.adapt[key] = true; e.say = line; e.sayT = 3.6; Cm.bT = Math.max(Cm.bT, 30); } else if (!cond && s.adapt[key] && Math.random() < 0.002) s.adapt[key] = false; };
      if (!fighting && e.sayT <= 0) {
        if (s.cls === 'sellsword') learn('ranged', ps.ranged > 0.32 && ps.ranged > ps.melee, 'You like to fight from a distance. I\'ll keep them off you.');
        if (s.cls === 'hunter') learn('melee', ps.melee > 0.32 && ps.melee > ps.ranged, 'You\'re always in the thick of it. I\'ll pick off the ones on your flanks.');
        if (s.cls === 'mender') learn('hurt', ps.hurt > 0.25, 'You get hurt a lot, you know. I\'ll be quicker with the healing.');
        learn('sneak', ps.sneak > 0.18, 'I\'ve learned to keep quiet when you go creeping.');
      }
      e.healAt = s.adapt.hurt ? 0.62 : 0.5;
    },
    // ------------------------------------------------------------ the E menu
    dialogue(world, npc, ent, pl, ui) {
      if (!pl || npc.id !== pl.companion) return;
      const game = ECHO.Game, e = ent, s = Cm.st(npc);
      ui.add('Orders…', () => {
        ui.say(`"${e.order && e.order !== 'follow' ? `Right now I'm told to ${ORDERS[e.order].toLowerCase()}.` : 'I\'m with you.'} What do you need?" (T gives orders on the move.)`);
        ui.clear();
        for (const k of ['follow', 'hold', 'back']) ui.add(ORDERS[k], () => { Cm.order(game, k, true); ui.say(`"${{ follow: 'Right behind you.', hold: 'I\'ll hold here.', back: 'I\'ll keep my head down.' }[k]}"`); ui.render(); });
      });
      ui.add('How are you holding up?', () => {
        const [m] = Cm.mood(npc);
        const g = s.griefs.slice(-1)[0];
        const t = { devoted: 'Never better. I mean it — I\'m glad I\'m here.', content: 'Well enough. The road agrees with me.', wary: 'I\'m… still making up my mind about you.', uneasy: `Honestly? ${g ? { cruelty: 'The cruelty sits badly with me.', betrayal: 'I don\'t like being part of a lie.', theft: 'The stealing. I don\'t like it.', mercy: 'You let too many walk away.', gift: 'You give too much away.', reckless: 'You\'re going to get us killed.' }[g.k] : 'Something\'s not right.'}`, angry: 'Don\'t. Just — don\'t.' }[m];
        ui.say(`"${t}"`);
      });
      if (s.hist.length) ui.add('Remember when…?', () => {
        const told = s.hist.slice(-4).map(h => ({ delve: `going down into ${h.name}`, lord: `killing ${h.name}`, fight: `those ${h.foe} ${Cm.placeName(game, h.x, h.y)}`, close: 'the day you nearly died', fire: 'the fire', town: `the first time we saw ${h.name}` }[h.k])).filter(Boolean);
        ui.say(`${npc.first} laughs. "Remember ${U.listJoin(told)}? ${s.since != null ? `${world.day - s.since} days, ` : ''}and I'd do most of it again."`);
      });
      ui.add('What do you make of me?', () => {
        const ps = pl.style || {};
        const how = ps.ranged > ps.melee + 0.1 ? 'You like to keep your distance — bow first, questions later.' : ps.melee > 0.25 ? 'You fight up close and personal.' : 'I can\'t quite read you yet.';
        const W = ECHO.Wits && ECHO.Wits.h;
        const tell = W && Math.abs(W.side) > 0.5 ? ` And you always roll to the ${W.side > 0 ? 'left' : 'right'}.` : '';
        const heart = s.appr >= 40 ? ' You\'re a good one. Don\'t let it go to your head.' : s.appr <= -20 ? ' And you\'re harder than I\'d like.' : '';
        ui.say(`"${how}${tell}${heart}"`);
      });
    },
    // ------------------------------------------------------------ each frame
    update(game, dt) {
      const c = Cm.cur(game);
      if (ECHO.Input.hit && ECHO.Input.hit('t') && !ECHO.UI.paused()) { if (c) Cm.key(game); else if (game.pl && game.pl.companion) game.ui.toast('Your companion is not with you.', 'info', 2); }
      if (!c) return;
      const { npc, e } = c, pe = game.pe, pl = game.pl, world = game.world, s = Cm.st(npc);
      Cm.banter(game, dt);
      Cm.t -= dt;
      if (Cm.t > 0) return;
      Cm.t = 1;
      Cm.style(game, 1);
      // devoted: they fight the harder
      e.dmgMul = (e._dmg0 || (e._dmg0 = e.dmgMul || 1)) * (s.devoted ? 1.08 : 1);
      // new places together
      if (pe.x < 9000) {
        const t = ECHO.World.settlementAt(world, pe.x, pe.y, 12);
        if (t && s.towns[t.id] == null) { s.towns[t.id] = world.day; if (t.id !== npc.home) { Cm.note(game, 'town', { name: t.name, x: t.x, y: t.y }); if (e.sayT <= 0) { e.say = pick([`So this is ${t.name}.`, `${t.name}. Never been. Smells like ${pick(['bread', 'pigs', 'woodsmoke'])}.`, `${t.name}! I had a cousin here, once.`]); e.sayT = 2.6; } } }
      }
      // the end of a fight worth remembering
      const fighting = game.combatT != null && game.time - game.combatT < 6;
      if (fighting) { if (pl.hp < pl.maxHp * 0.15 && !Cm.closeNoted) { Cm.closeNoted = true; Cm.note(game, 'close'); } }
      else {
        if (Cm.fightKills.length >= 3 && pe.x < 9000) {
          const counts = {}; for (const k of Cm.fightKills) counts[k] = (counts[k] || 0) + 1;
          const foe = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
          Cm.note(game, 'fight', { foe });
        }
        Cm.fightKills = []; Cm.closeNoted = false;
      }
      Cm.reckon(game);
    }
  };

  // ------------------------------------------------------------ listening in
  // Everything that shapes who you are, they see too.
  if (ECHO.Character && ECHO.Character.behave && !ECHO.Character._comrade) {
    const b0 = ECHO.Character.behave;
    ECHO.Character.behave = function (pl, key, amount) {
      const r = b0.apply(this, arguments);
      try { if (ECHO.Game && ECHO.Game.pl === pl && amount > 0 && FEEL[key]) Cm.react(ECHO.Game, key, Math.min(1.2, amount * (key === 'mercy' || key === 'protect' ? 2.5 : key === 'reckless' ? 3 : 1.5))); } catch (err) { /* never break the deed */ }
      return r;
    };
    ECHO.Character._comrade = true;
  }
})();
