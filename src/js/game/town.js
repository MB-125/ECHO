// Town: the life of a place between your visits.
//
// Work you can see — the farmer's hoe rising and falling, sparks off the
// smith's anvil, chips flying at the woodpile, the innkeeper sweeping the step,
// the merchant crying her wares and haggling with a customer over cheese.
// Neighbours stop in the lane and talk, and what they say is real: the price of
// bread, the rumour from the next valley, the rain, the friend they lost, what
// you did last week, the debt one of them still hasn't paid. Children play tag
// in the square — and if you wander too close, you're it.
//
// And the town reacts. A fight in the street draws a crowd at a safe distance,
// gasping and cheering, and talking about it after. When someone is hurt, a
// friend takes their arm and walks them to the healers. When someone dies,
// they're buried the next afternoon by the shrine, the priest saying the words
// and the family standing close; you can stand with them. When a house catches
// fire — a lightning strike, a hearth left untended, or your own fire spell
// gone astray — the whole street runs for the well and forms a bucket line,
// and you can throw water with them. Folk notice you, too: soaked, or
// bleeding, or skulking about, or famous.
(function () {
  const { U } = ECHO;
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const P = () => ECHO.People;
  const hourOf = w => w.minute / 60;

  // who does what with their hands at work
  const WORK = { farmer: 'hoe', smith: 'hammer', woodcutter: 'chop', miner: 'chop', miller: 'carry', merchant: 'hawk', innkeeper: 'sweep', priest: 'pray', scholar: 'read', inventor: 'read', herbalist: 'gather', hunter: 'gather', elder: 'draw' };
  // the rhythm of each: seconds per stroke, and when in the stroke it lands
  const BEAT = { hoe: [1.5, 0.62], hammer: [0.85, 0.55], chop: [1.35, 0.6], sweep: [1.1, 0.5], gather: [2.2, 0.5], draw: [3.2, 0.5] };
  const HAWK = ['Fresh bread! Still warm!', 'Apples, crisp as frost!', 'Fine wool, finer prices!', 'Come and look — no charge for looking!', 'Salt, candles, needles and thread!', 'Cheese from the high pastures!'];
  const GOODS = [['a loaf', 'food'], ['a dozen eggs', 'food'], ['that cheese', 'food'], ['a sack of meal', 'food'], ['the candles', 2], ['a pot of honey', 3], ['this wool', 4], ['a twist of salt', 2], ['the copper pot', 9], ['a bag of nails', 3]];

  const Tn = ECHO.Town = {
    t: 0, slowT: 0, glows: [], fires: [], games: [], funerals: [], fights: {}, lastHour: -1,

    // ------------------------------------------------------------ the hook
    // Called in a townsperson's peaceful moments, before their routine.
    think(game, e, npc, dt) {
      if (e.hidden || e.indoor) return false;
      if ((e.call || e.eyeing) && ECHO.Callers && ECHO.Callers.think(game, e, npc, dt)) return true;
      if (e.bucket) return Tn.bucketDo(game, e, npc, dt);
      if (e.funeral) return Tn.mourn(game, e, npc, dt);
      if (e.spectate) return Tn.watch(game, e, npc, dt);
      if (e.helping || e.helped) return Tn.support(game, e, npc, dt);
      if (e.play) return Tn.tag(game, e, npc, dt);
      if (e.convo) return Tn.converse(game, e, npc, dt);
      if (e.shop) return Tn.shop(game, e, npc, dt);
      if (e.cheerT > 0) { e.cheerT -= dt; e.chore = 'cheer'; e.moving = false; return true; }
      return false;
    },

    // ------------------------------------------------------------ work you can see
    work(game, e, npc, dt) {
      const g = e.goal, world = game.world, h = hourOf(world);
      const kind = WORK[npc.prof];
      const at = g && !g.inside && !e.moving && !e.hidden && U.dist(e.x, e.y, g.x, g.y) < 1.4;
      const hours = h >= 7.5 && h < 18 && !(g && (g.why === 'rain' || g.why === 'storm'));
      if (!kind || !at || !hours || (kind === 'draw' && !Tn.nearWell(game, e))) { if (e.chore && e.chore !== 'cheer') e.chore = null; return; }
      e.chore = kind;
      const was = e.choreT || 0;
      e.choreT = was + dt;
      const pe = game.pe, near = pe && U.dist(e.x, e.y, pe.x, pe.y) < 20;
      if (!near) return;
      const B = BEAT[kind];
      if (B) {
        // the moment of the stroke: sparks, chips, a clod of earth, a splash
        const k0 = (was / B[0]) % 1, k1 = (e.choreT / B[0]) % 1;
        if (k0 < B[1] && k1 >= B[1]) {
          const fx = e.x + Math.cos(e.dir || 0) * 0.6, fy = e.y + Math.sin(e.dir || 0) * 0.6;
          const dp = U.dist(e.x, e.y, pe.x, pe.y), vol = U.clamp(1 - dp / 12, 0, 1) * 0.35;
          if (kind === 'hammer') { ECHO.Combat.sparks(fx, fy - 0.2, (e.dir || 0) + Math.PI, '#ffcf6a', 6); if (vol > 0) ECHO.Sfx.play('hit', { pitch: 1.9, vol }); }
          else if (kind === 'chop') { ECHO.Combat.burst(fx, fy, '#c8a070', 5, 2.2, 0.5, 2); if (vol > 0) ECHO.Sfx.play('hit', { pitch: 0.75, vol }); }
          else if (kind === 'hoe') ECHO.Combat.burst(fx, fy, '#6a5034', 4, 1.4, 0.45, 2);
          else if (kind === 'sweep' && Math.random() < 0.5) ECHO.Combat.burst(fx, fy, '#b8a888', 3, 1, 0.5, 2);
          else if (kind === 'gather') ECHO.Combat.burst(fx, fy, '#6aa84a', 3, 1, 0.4, 2);
          else if (kind === 'draw') { ECHO.Combat.burst(fx, fy, '#9fd3ff', 6, 1.5, 0.4, 2); if (vol > 0) ECHO.Sfx.play('splash', { pitch: 1.4, vol: vol * 0.6 }); }
        }
      }
      // a word about the work, now and then, if you're near
      if (e.sayT <= 0 && U.dist(e.x, e.y, pe.x, pe.y) < 9 && Math.random() < dt * (kind === 'hawk' ? 0.09 : 0.012)) {
        const L = {
          hawk: HAWK,
          hoe: ['Stones. Always more stones.', 'Come on, you stubborn root…', 'Good black earth, this.'],
          hammer: ['Hold still, you…', 'Needs more heat.', 'There. That\'ll hold.'],
          chop: ['Hup!', 'One more…', 'Good dry oak, this.'],
          sweep: ['Mud from half the realm on this step.', 'Wipe your boots, if you\'re coming in.'],
          pray: ['Flame keep you, traveller.', 'Light against the dark.'],
          read: ['Hm. That can\'t be right.', 'Fascinating…'],
          gather: ['Snare\'s empty again.', 'Feverfew — good.', 'Nettles. Ow.'],
          draw: ['Water\'s low this year.', 'Cold as winter, this well.']
        }[kind];
        if (L) { e.say = pick(L); e.sayT = 2.6; }
      }
    },
    nearWell(game, e) {
      const s = ECHO.Sim.settlement(game.world, game.world.npcs[e.npcId].loc);
      const w = s && s.buildings.find(b => b.type === 'well');
      return w && U.dist(e.x, e.y, w.x + 0.5, w.y + 1.5) < 2.5;
    },

    // ------------------------------------------------------------ talk in the lane
    lines(game, a, b) {
      const world = game.world, A = world.npcs[a.npcId], B = world.npcs[b.npcId];
      const s = ECHO.Sim.settlement(world, A.loc);
      const pl = game.pl, pe = game.pe;
      const T = [];   // [weight, [[speaker 0|1, text], …]]
      const add = (w, ls) => T.push([w, ls]);
      const relAB = (A.rel && A.rel[B.id]) || 0;
      // married folk
      if (A.spouse === B.id) add(3, pick([
        [[0, 'Did you feed the hens?'], [1, 'Twice. They\'re still complaining.'], [0, 'They take after your mother.']],
        [[0, 'Home for supper?'], [1, 'If you\'re cooking.'], [0, 'I\'m always cooking.']],
        [[0, `${B.first}… the roof\'s leaking again.`], [1, 'I\'ll see to it tomorrow.'], [0, 'You said that last week.']]
      ]));
      // a grudge
      if (relAB < -25) add(4, pick([
        [[0, 'You still owe me for that goat.'], [1, 'I owe you nothing!'], [0, 'The whole street knows you do.'], [1, 'Then the whole street can pay you.']],
        [[0, `Don't you walk away from me, ${B.first}.`], [1, 'I\'ve nothing to say to you.'], [0, 'You never do.']],
        [[0, 'Your dog was in my garden again.'], [1, 'Prove it.']]
      ]));
      // friends
      if (relAB > 35 && A.spouse !== B.id) add(2, pick([
        [[0, `${B.first}! Supper at ours tonight?`], [1, 'Wouldn\'t miss it.']],
        [[0, 'You look tired, friend.'], [1, 'Didn\'t sleep. The baby next door.'], [0, 'Ha! Wait till they\'re walking.']],
        [[0, 'Come by the inn later.'], [1, 'Only if you\'re buying.'], [0, 'I always am, somehow.']]
      ]));
      // grief
      const grief = B.mem && B.mem.filter(m => m.type === 'grief' && world.day - m.d < 30).slice(-1)[0];
      const lost = grief && grief.about && world.npcs[grief.about];
      if (lost) add(5, [[0, `I'm so sorry about ${lost.first}.`], [1, 'Thank you. It\'s… thank you.'], [0, 'If you need anything at all.']]);
      // love
      const crush = A.mind && A.mind.goal && A.mind.goal.kind === 'love' && A.mind.goal.crush && world.npcs[A.mind.goal.crush];
      if (crush && crush.id !== B.id) add(2, [[1, `I saw you looking at ${crush.first} again.`], [0, 'I don\'t know what you mean.'], [1, 'Course you don\'t.']]);
      // news and rumour
      if (s) {
        const news = ECHO.Chronicle.rumorsAt(world, s, 6, 14).filter(x => x.imp >= 1);
        if (news.length) {
          const n = pick(news);
          const mine = pl && n.char === pl.charId;
          add(mine ? 2 : 3, [[0, ECHO.Dialogue.gossipLine(world, n, Math.floor(Math.random() * 99))], [1, mine ? pick(['I\'ve heard. The stranger, wasn\'t it?', 'So they say. Hard to believe.', 'I\'d buy them a drink for that.']) : pick(['No!', 'I don\'t believe it.', 'Gods keep us.', 'About time, too.', 'Who told you that?'])], [0, pick(['It\'s true, I swear it.', 'That\'s what I heard.', 'Mark my words.'])]]);
        }
        if (s.hunger > 0.2) add(3, [[0, `Bread's ${s.prices.food} crowns now.`], [1, 'Thieves, the lot of them.'], [0, 'The children are going to bed hungry.']]);
        const threat = A.mind && A.mind.v && A.mind.v.safety < 0.5 && A.mind.v.threat;
        if (threat) add(3, [[0, `They say ${threat} is getting bolder.`], [1, 'Bar your door tonight.'], [0, 'I\'ve barred it every night this month.']]);
      }
      // the stranger standing right there
      if (pe && U.dist(a.x, a.y, pe.x, pe.y) < 9 && pl) {
        const deed = world.chronicle.slice(-60).reverse().find(x => x.char === pl.charId && x.imp >= 1);
        if (deed && pl.renown >= 10) add(3, [[0, `That's ${pl.first}. The one who ${deed.text.replace(new RegExp('^' + pl.first + '( ' + pl.last + ')? '), '').replace(/\.$/, '')}.`], [1, pick(['Smaller than I\'d pictured.', 'Don\'t stare.', 'Really? Them?'])]]);
        else add(1, [[0, 'Who\'s that, then?'], [1, pick(['Some traveller.', 'Never seen them before.', 'Trouble, by the look of it.'])]]);
      }
      // the weather
      const wx = ECHO.Weather ? ECHO.Weather.here(world, a.x, a.y) : null;
      if (wx) {
        if (wx.today === 'rain') add(2, [[0, 'Rain again.'], [1, 'Good for the fields, at least.']]);
        else if (wx.today === 'snow' || wx.harsh) add(2, [[0, 'Cold enough to freeze the well.'], [1, 'My knees knew it was coming.']]);
        else if (wx.drought) add(2, [[0, 'Not a drop in weeks.'], [1, 'The barley\'s burning in the field.']]);
        else if (wx.today === 'clear') add(1, [[0, 'Fine day.'], [1, 'Won\'t last.']]);
      }
      // the trades
      const trade = { farmer: [[0, 'The barley\'s coming up thin.'], [1, 'Gnawers again?'], [0, 'Gnawers, crows, and my own bad back.']], smith: [[1, 'Could you mend a hinge for me?'], [0, 'Bring it by after noon.']], merchant: [[1, 'Anything new from the road?'], [0, 'Prices. Prices are new, every week.']], hunter: [[0, 'Wolf tracks by the old mill.'], [1, 'Close?'], [0, 'Closer than I like.']], priest: [[1, 'Will you say a word for my mother?'], [0, 'Every evening, child.']], innkeeper: [[0, 'Busy night last night.'], [1, 'I heard. The whole street heard.']] }[A.prof];
      if (trade) add(2, trade);
      if (A.prof === 'child' && B.prof === 'child') add(5, pick([[[0, 'I\'m going to be a knight!'], [1, 'Knights don\'t cry when they fall over.'], [0, 'I didn\'t cry!']], [[0, 'Bet you can\'t climb the well.'], [1, 'Bet I can.']], [[0, 'Did you see the stranger\'s sword?'], [1, 'I\'m going to have one bigger.']]]));
      add(0.6, pick([[[0, 'Morning.'], [1, 'Morning.']], [[0, 'Keeping well?'], [1, 'Well enough. You?'], [0, 'Can\'t complain. Do anyway.']], [[0, `${B.first}.`], [1, `${A.first}.`]]]));
      // weighted pick
      let tot = 0; for (const t of T) tot += t[0];
      let r = Math.random() * tot;
      for (const t of T) { r -= t[0]; if (r <= 0) return t[1]; }
      return T[T.length - 1][1];
    },
    startConvo(game, a, b, lines) {
      const c = { a, b, lines, i: -1, t: 0, ear: 0 };
      a.convo = c; b.convo = c;
      a.moving = b.moving = false;
      a.chore = b.chore = null;
    },
    converse(game, e, npc, dt) {
      const c = e.convo, o = c.a === e ? c.b : c.a;
      if (!o || o.dead || o.hidden || o.convo !== c || o.target || e.target) { e.convo = null; e.chore = null; return false; }
      e.moving = false;
      e.dir = Math.atan2(o.y - e.y, o.x - e.x); e.flip = Math.cos(e.dir) < 0;
      // too far apart (one was walking): close the gap first
      const d = U.dist(e.x, e.y, o.x, o.y);
      if (d > 1.7) { ECHO.Ent.travel(game.world, e, o.x, o.y, e.speed * 0.5, dt); return true; }
      if (c.a !== e) { e.chore = c.lines[c.i] && c.lines[c.i][0] === 1 && e.sayT > 0 ? 'talk' : null; return true; }
      // the first of the pair keeps the time
      c.t -= dt;
      const pe = game.pe;
      // someone listening in, right next to them
      if (pe && Math.min(U.dist(e.x, e.y, pe.x, pe.y), U.dist(o.x, o.y, pe.x, pe.y)) < 1.6) {
        if ((c.ear += dt) > 1.4 && !c.caught) {
          c.caught = true;
          const sp = Math.random() < 0.5 ? e : o;
          sp.say = pick(['Can we help you?', 'Do you mind? This is private.', '…we\'ll talk later.', 'Oh — hello there.']); sp.sayT = 2.4;
          c.i = c.lines.length; c.t = 2.4;
        }
      } else c.ear = 0;
      if (c.t <= 0) {
        c.i++;
        if (c.i >= c.lines.length) { e.convo = null; o.convo = null; e.chore = o.chore = null; e.convoAt = o.convoAt = game.time; return false; }
        const [who, text] = c.lines[c.i];
        const sp = who === 0 ? e : o;
        sp.say = text; sp.sayT = Math.min(3.6, 1.6 + text.length * 0.035);
        c.t = sp.sayT + 0.35;
      }
      e.chore = c.lines[c.i] && c.lines[c.i][0] === 0 && e.sayT > 0 ? 'talk' : null;
      return true;
    },

    // ------------------------------------------------------------ at the market
    shop(game, e, npc, dt) {
      const S = e.shop, m = S.m;
      if (!m || m.dead || m.hidden || m.convo || (game.time - S.t0 > 40)) { e.shop = null; return false; }
      const d = U.dist(e.x, e.y, m.x, m.y);
      if (d > 1.3) { if (ECHO.Ent.travel(game.world, e, m.x, m.y, e.speed * 0.55, dt) === false && e.navFail) { e.navFail = false; e.shop = null; } return true; }
      e.shop = null;
      const s = ECHO.Sim.settlement(game.world, npc.loc);
      const g = pick(GOODS), price = g[1] === 'food' ? (s ? s.prices.food : 3) : g[1];
      const lines = Math.random() < 0.5
        ? [[0, `How much for ${g[0]}?`], [1, `${price} crowns. Cheap at that.`], [0, `${Math.max(1, price - 1)}?`], [1, pick(['Done.', 'You\'ll ruin me. Done.', `${price}, and not a copper less.`])]]
        : [[0, `${U.cap(g[0])}, please.`], [1, `${price} crowns.`], [0, pick(['Robbery!', 'Here.', 'Last week it was less.'])], [1, pick(['Last week it rained less.', 'Thank you kindly.', 'Come again.'])]];
      Tn.startConvo(game, e, m, lines);
      e.convo.buy = true;
      return true;
    },

    // ------------------------------------------------------------ tag
    tag(game, e, npc, dt) {
      const G = e.play, world = game.world, pe = game.pe;
      if (!G || G.over || G.kids.indexOf(e) < 0) { e.play = null; return false; }
      const it = G.it;
      const sp = e.speed;
      e.chore = null;
      const inField = (x, y) => U.dist(x, y, G.cx, G.cy) < G.r;
      if (it === e) {
        if (G.frozen > 0) { e.moving = false; return true; }
        // chase the nearest — the stranger too, if they're playing
        let best = null, bd = 99;
        for (const k of G.kids) if (k !== e && !k.dead && k !== G.immune) { const d = U.dist(e.x, e.y, k.x, k.y); if (d < bd) { bd = d; best = k; } }
        if (G.withYou && pe && G.immune !== pe) { const d = U.dist(e.x, e.y, pe.x, pe.y); if (d < bd && d < 7) { bd = d; best = pe; } }
        if (!best) { e.moving = false; return true; }
        ECHO.Ent.seek(world, e, best.x, best.y, sp * 1.18, dt, 0.1);
        if (bd < 0.75) {
          G.it = best; G.immune = e; G.immuneT = 1.6; G.frozen = 1.0;
          e.say = best === pe ? pick(['You\'re it, mister!', 'Ha! You\'re it!']) : pick(['Tag! You\'re it!', 'Got you!', 'You\'re it!']); e.sayT = 1.5;
          if (best !== pe && Math.random() < 0.5) { best.say = pick(['No fair!', 'Aww!', 'I wasn\'t ready!']); best.sayT = 1.4; }
          if (best === pe) ECHO.UI.toast('You\'re it! Tag one of the children back (walk into them).', 'info', 4);
        }
        return true;
      }
      // run from whoever's it, staying in the square
      const chaser = it === 'pe' ? pe : it;
      const cd = chaser ? U.dist(e.x, e.y, chaser.x, chaser.y) : 99;
      if (chaser && cd < 4.5) {
        let a = Math.atan2(e.y - chaser.y, e.x - chaser.x) + Math.sin(game.time * 3 + e.id) * 0.5;
        let tx = e.x + Math.cos(a) * 2, ty = e.y + Math.sin(a) * 2;
        if (!inField(tx, ty)) { a = Math.atan2(G.cy - e.y, G.cx - e.x) + (Math.random() < 0.5 ? 1 : -1) * 1.1; tx = e.x + Math.cos(a) * 2; ty = e.y + Math.sin(a) * 2; }
        ECHO.Ent.seek(world, e, tx, ty, sp * 1.1, dt, 0.1);
        if (e.sayT <= 0 && Math.random() < dt * 0.4) { e.say = pick(['Can\'t catch me!', 'Too slow!', 'Hee hee!', 'Nyah!']); e.sayT = 1.3; }
      } else {
        // dance about at a safe distance
        if (!e.playTo || U.dist(e.x, e.y, e.playTo.x, e.playTo.y) < 0.5 || Math.random() < dt * 0.3) {
          const a = Math.random() * Math.PI * 2, r = Math.random() * G.r * 0.8;
          e.playTo = { x: G.cx + Math.cos(a) * r, y: G.cy + Math.sin(a) * r };
        }
        ECHO.Ent.seek(world, e, e.playTo.x, e.playTo.y, sp * 0.7, dt, 0.3);
      }
      return true;
    },
    tagTick(game, G, dt) {
      const pe = game.pe;
      if (G.immuneT > 0 && (G.immuneT -= dt) <= 0) G.immune = null;
      if (G.frozen > 0) G.frozen -= dt;
      G.kids = G.kids.filter(k => !k.dead && !k.hidden && k.play === G && !k.target);
      // you're it: walk into one of them
      if (G.it === pe) {
        G.withYou = true;
        if (U.dist(pe.x, pe.y, G.cx, G.cy) > G.r + 10) { G.it = G.kids[0] || null; G.immune = null; }
        else for (const k of G.kids) if (G.immune !== k && U.dist(k.x, k.y, pe.x, pe.y) < 0.8) {
          G.it = k; G.immune = pe; G.immuneT = 1.6; G.frozen = 1.2;
          k.say = pick(['Aww! No fair, you\'re big!', 'Got me!', 'I\'ll get you back!']); k.sayT = 1.6;
          if (!G.thanked) { G.thanked = true; game.pl.merryT = Math.max(game.pl.merryT || 0, 60); }
          break;
        }
      } else if (pe && !G.withYou && U.dist(pe.x, pe.y, G.cx, G.cy) < G.r - 1 && G.it && G.it !== pe && U.dist(pe.x, pe.y, G.it.x, G.it.y) < 3) G.withYou = true;   // wander into the game and you're in it
      const h = hourOf(game.world);
      if (G.kids.length < 2 || game.time - G.t0 > G.dur || h >= 19) {
        G.over = true;
        const k = G.kids[0];
        if (k) { k.say = pick(['Mam\'s calling!', 'I\'m tired. Tomorrow!', 'Supper!']); k.sayT = 2; }
        for (const k2 of G.kids) k2.play = null;
        if (G.it === pe) ECHO.UI.toast('The game breaks up. (You were still it.)', 'info', 3);
      }
    },

    // ------------------------------------------------------------ crowds at a fight
    watch(game, e, npc, dt) {
      const S = e.spectate, F = Tn.fights[S.sid];
      const world = game.world;
      // it's over: talk about it, then drift away
      if (!F || F.over) {
        S.after = (S.after || 0) + dt;
        if (!S.said && e.sayT <= 0 && Math.random() < dt * 1.2) {
          S.said = true;
          e.say = F && F.youWon ? pick(['Did you see that?!', 'They\'ll sing about that one.', 'Thank the Flame for that stranger.', 'Never seen the like!']) : pick(['Is it over?', 'Gods. Gods.', 'Someone fetch the healers.', 'I need a drink.']);
          e.sayT = 2.4;
          if (F && F.youWon && Math.random() < 0.6) e.cheerT = 2.5;
        }
        if (S.after > 6) { e.spectate = null; e.chore = null; if (F && F.youWon && game.pl) P().remember(world, npc, `watched ${game.pl.first} ${game.pl.last} fight in the street`, 'pride', null, 1); return false; }
        e.moving = false; return true;
      }
      // keep to the ring as the fight moves
      if (!S.spot || U.dist(S.cx, S.cy, F.x, F.y) > 2.5) {
        S.cx = F.x; S.cy = F.y;
        const a = Math.atan2(e.y - F.y, e.x - F.x) + (Math.random() - 0.5) * 0.5, r = 6.5 + Math.random() * 2.5;
        S.spot = ECHO.Ent.freeSpot(world, F.x + Math.cos(a) * r, F.y + Math.sin(a) * r, 2) || { x: e.x, y: e.y };
      }
      if (U.dist(e.x, e.y, S.spot.x, S.spot.y) > 0.6) { ECHO.Ent.travel(world, e, S.spot.x, S.spot.y, e.speed * 0.8, dt); e.chore = null; return true; }
      e.moving = false;
      e.dir = Math.atan2(F.y - e.y, F.x - e.x); e.flip = Math.cos(e.dir) < 0;
      if (e.sayT <= 0 && Math.random() < dt * 0.14) {
        e.say = F.youFight ? pick(['Get them!', 'Go on!', 'Behind you!', 'Hah! Take that!', 'Mind the left!']) : pick(['Somebody fetch the watch!', 'Gods preserve us…', 'Stay back, children!', 'Look out!', 'They\'ll kill each other!']);
        e.sayT = 1.8;
        e.chore = F.youFight && Math.random() < 0.5 ? 'cheer' : 'point';
      }
      return true;
    },
    // where the fighting is, town by town
    fightScan(game) {
      const world = game.world, pe = game.pe, now = game.time;
      const seen = {};
      const fighting = o => (o.type === 'person' && o.target && !o.dead && !o.hidden && (o.state === 'chase' || o.state === 'windup' || o.state === 'attack') && U.dist(o.x, o.y, o.target.x, o.target.y) < 6) ||
        (o.foe && o.aggro && !o.dead && !o.hidden && !o.indoor) || (o.type === 'creature' && o.target && !o.dead && (o.state === 'lunge' || o.state === 'windup' || o.state === 'stalk'));
      for (const o of game.ents) {
        if (!fighting(o) || o.x >= 9000) continue;
        const s = ECHO.World.settlementAt(world, o.x, o.y, 20);
        if (!s) continue;
        const f = seen[s.id] || (seen[s.id] = { n: 0, x: 0, y: 0, you: false });
        f.n++; f.x += o.x; f.y += o.y;
        if (o.target === pe || (o.foe && o.aggro)) f.you = true;
      }
      if (pe && game.combatT != null && now - game.combatT < 3 && pe.x < 9000) {
        const s = ECHO.World.settlementAt(world, pe.x, pe.y, 20);
        if (s) { const f = seen[s.id] || (seen[s.id] = { n: 0, x: 0, y: 0, you: false }); f.n++; f.x += pe.x; f.y += pe.y; f.you = true; }
      }
      for (const sid in seen) {
        const f = seen[sid];
        const F = Tn.fights[sid] || (Tn.fights[sid] = { sid, t0: now });
        F.x = f.x / f.n; F.y = f.y / f.n; F.last = now; F.over = false; F.youFight = f.you;
        if (f.you) F.you = true;
      }
      for (const sid in Tn.fights) {
        const F = Tn.fights[sid];
        if (!F.over && now - F.last > 3) { F.over = true; F.youWon = F.you && !pe.dead && !game.defeating; F.endT = now; }
        if (F.over && now - F.endT > 15) delete Tn.fights[sid];
      }
      // draw a crowd
      for (const sid in Tn.fights) {
        const F = Tn.fights[sid];
        if (F.over || now - F.t0 < 1.5) continue;
        let n = game.ents.filter(o => o.spectate && o.spectate.sid === sid).length;
        for (const o of game.ents) {
          if (n >= 10) break;
          if (o.type !== 'person' || o.dead || o.hidden || o.indoor || o.target || o.spectate || o.bucket || o.funeral || o.helped || o.convo && o.convo.buy) continue;
          if (!o.npcId || o.role === 'bandit' || o.role === 'guard' || o.role === 'soldier' || o.role === 'companion' || o.role === 'traveler' || o.isCompanion || o.pet) continue;
          const n2 = world.npcs[o.npcId];
          if (!n2 || n2.loc !== +sid && n2.loc !== sid) continue;
          const d = U.dist(o.x, o.y, F.x, F.y);
          if (d > 24 || d < 5) continue;
          // the timid go home; the rest come to look
          if (P().has(n2, 'cowardly') || (n2.mind && n2.mind.v && n2.mind.v.safety < 0.35)) continue;
          if (o.convo) { const c = o.convo; c.a.convo = null; c.b.convo = null; }
          o.play = null; o.shop = null;
          o.spectate = { sid, t0: now };
          if (o.sayT <= 0 && Math.random() < 0.4) { o.say = pick(['What\'s that noise?', 'A fight!', 'Come and see!', 'Oh no…']); o.sayT = 1.5; }
          n++;
        }
      }
    },

    // ------------------------------------------------------------ helping the hurt
    support(game, e, npc, dt) {
      const world = game.world;
      if (e.helping) {
        const h = e.helping;
        if (h.dead || h.hidden || h.helped !== e || h.target) { e.helping = null; e.chore = null; if (h.helped === e) h.helped = null; return false; }
        const dd = U.dist(e.x, e.y, h.x, h.y);
        if (dd > 1.2 && !e.together) { ECHO.Ent.travel(world, e, h.x, h.y, e.speed * 0.9, dt); e.chore = null; return true; }
        if (!e.together) { e.together = true; e.say = pick(['Lean on me. Easy now.', 'I\'ve got you. Up you come.', 'Come on, let\'s get you seen to.']); e.sayT = 2.4; }
        const door = e.helpTo;
        if (U.dist(e.x, e.y, door.x, door.y) < 1.3) {
          e.helping = null; e.together = false; h.helped = null; e.chore = null;
          e.say = 'The healers will see to you.'; e.sayT = 2;
          const hn = world.npcs[h.npcId];
          if (hn && npc) P().bond(hn, npc.id, 12);
          return false;
        }
        // walk slowly; wait if they fall behind
        if (dd > 1.6) { e.moving = false; e.dir = Math.atan2(h.y - e.y, h.x - e.x); }
        else ECHO.Ent.travel(world, e, door.x, door.y, e.speed * 0.38, dt);
        e.chore = 'support';
        if (e.sayT <= 0 && Math.random() < dt * 0.08) { e.say = pick(['Nearly there.', 'Mind the step.', 'One foot, then the other.']); e.sayT = 1.8; }
        return true;
      }
      // the one being helped: lean on them and limp along
      const hp = e.helped;
      if (!hp || hp.dead || hp.helping !== e) { e.helped = null; return false; }
      if (!hp.together) { e.moving = false; e.chore = null; return true; }
      const side = { x: hp.x + Math.cos((hp.dir || 0) + Math.PI / 2) * 0.55, y: hp.y + Math.sin((hp.dir || 0) + Math.PI / 2) * 0.55 };
      if (U.dist(e.x, e.y, side.x, side.y) > 0.25) ECHO.Ent.seek(world, e, side.x, side.y, e.speed * 0.6, dt, 0.15);
      else e.moving = false;
      e.chore = 'limp';
      if (e.sayT <= 0 && Math.random() < dt * 0.05) { e.say = pick(['Ah — mind the leg…', 'Thank you…', 'I\'ll be all right. I think.']); e.sayT = 1.8; }
      return true;
    },
    hurtScan(game) {
      const world = game.world;
      for (const h of game.ents) {
        if (h.type !== 'person' || h.dead || h.hidden || h.indoor || h.target || h.helped || (h.helpedAt && game.time - h.helpedAt < 90) || !h.npcId || h.hp >= h.maxHp * 0.45 || h.role === 'bandit' || h.isCompanion) continue;
        const hn = world.npcs[h.npcId];
        const s = hn && ECHO.Sim.settlement(world, hn.loc);
        if (!s || U.dist(h.x, h.y, s.x, s.y) > 30) continue;
        // to the healers, or home to bed if the town has none
        const healer = s.buildings.find(b => b.type === 'temple') || s.buildings.find(b => b.type === 'shrine') || ECHO.AI.Sched.houseOf(game, s, hn);
        if (!healer) continue;
        if (Tn.fights[s.id] && !Tn.fights[s.id].over) continue;
        // a friend if one's about; anyone decent otherwise
        let best = null, bs = -1e9;
        for (const o of game.ents) {
          if (o === h || o.type !== 'person' || o.dead || o.hidden || o.indoor || o.target || o.helping || o.helped || o.bucket || o.funeral || !o.npcId || o.role === 'bandit' || o.isCompanion || o.role === 'traveler') continue;
          const d = U.dist(o.x, o.y, h.x, h.y); if (d > 14) continue;
          const on = world.npcs[o.npcId]; if (!on || on.prof === 'child' || on.sick) continue;
          const sc = (on.rel && on.rel[hn.id] || 0) + (on.spouse === hn.id ? 80 : 0) - d * 3;
          if (sc > bs) { bs = sc; best = o; }
        }
        if (!best) continue;
        if (best.convo) { const c = best.convo; c.a.convo = null; c.b.convo = null; }
        best.spectate = null; best.play = null; best.shop = null;
        best.helping = h; best.together = false; h.helped = best; h.helpedAt = game.time;
        const dr = ECHO.AI.Sched.door(healer);
        best.helpTo = { x: dr.x, y: dr.y };
      }
    },

    // ------------------------------------------------------------ funerals
    funeralScan(game) {
      const world = game.world, pe = game.pe, h = hourOf(world);
      if (!pe || pe.x >= 9000) return;
      const s = ECHO.World.settlementAt(world, pe.x, pe.y, 35);
      if (!s) return;
      // anyone of this town who died yesterday, not yet laid to rest
      if (h >= 15.5 && h < 17 && !Tn.funerals.some(f => f.sid === s.id && !f.done)) {
        const dead = Object.values(world.npcs).find(n => n.status === 'dead' && n.home === s.id && !n.buried && n.diedDay != null && world.day - n.diedDay >= 1 && world.day - n.diedDay <= 3 && n.prof !== 'bandit');
        if (dead) {
          const sh = s.buildings.find(b => b.type === 'temple') || s.buildings.find(b => b.type === 'shrine');
          const base = sh ? ECHO.AI.Sched.door(sh) : { x: s.x, y: s.y + 3 };
          const gr = ECHO.Ent.freeSpot(world, base.x + 1.5, base.y + 2.4, 3) || base;
          Tn.funerals.push({ sid: s.id, npc: dead.id, x: gr.x, y: gr.y, t0: game.time, said: 0, sayT: 4, watch: 0, done: false });
        }
      }
      for (const f of Tn.funerals) {
        if (f.done) continue;
        const dead = world.npcs[f.npc];
        // the words said and a little quiet after; or nightfall, whichever first
        if ((f.said >= 5 && f.sayT < -6) || h >= 19.5 || h < 15) { Tn.endFuneral(game, f); continue; }
        if (U.dist(pe.x, pe.y, f.x, f.y) < 8) f.watch += 1;
        // gather the mourners
        const kin = new Set([dead.spouse, ...(dead.kids || []), ...(dead.parents || [])].filter(Boolean));
        let n = game.ents.filter(o => o.funeral === f).length;
        for (const o of game.ents) {
          if (n >= 11) break;
          if (o.type !== 'person' || o.dead || o.hidden || o.indoor || o.target || o.funeral || o.bucket || !o.npcId) continue;
          const on = world.npcs[o.npcId];
          if (!on || on.loc !== s.id || U.dist(o.x, o.y, f.x, f.y) > 30 || o.role === 'bandit' || o.role === 'traveler') continue;
          const close = kin.has(on.id) || (on.rel && on.rel[dead.id] > 20) || on.prof === 'priest';
          if (!close && Math.random() > 0.35) continue;
          if (o.convo) { const c = o.convo; c.a.convo = null; c.b.convo = null; }
          o.play = null; o.shop = null; o.spectate = null;
          const priest = on.prof === 'priest' && !game.ents.some(x => x.funeral === f && x.funeralRole === 'priest');
          const a = priest ? -Math.PI / 2 : Math.PI * (0.15 + Math.random() * 0.7);
          const r = priest ? 1.3 : kin.has(on.id) ? 1.4 + Math.random() * 0.4 : 2.1 + Math.random() * 0.9;
          const spot = ECHO.Ent.freeSpot(world, f.x + Math.cos(a) * r, f.y + Math.sin(a) * r, 1.5) || { x: o.x, y: o.y };
          o.funeral = f; o.funeralRole = priest ? 'priest' : kin.has(on.id) ? 'kin' : 'mourner'; o.funeralSpot = spot;
          n++;
        }
        // no priest in town? an elder, or one of the family, says the words
        const at = game.ents.filter(o => o.funeral === f);
        if (!at.some(o => o.funeralRole === 'priest') && (at.length >= 3 || game.time - f.t0 > 12) && at.length) {
          const sp = at.find(o => world.npcs[o.npcId].prof === 'elder') || at.find(o => o.funeralRole === 'kin') || at[0];
          sp.funeralRole = 'priest'; sp.speaker = true;
          sp.funeralSpot = ECHO.Ent.freeSpot(world, f.x, f.y - 1.3, 1.5) || sp.funeralSpot;
        }
        // begin once most are there
        if (!f.begun) { const there = at.filter(o => U.dist(o.x, o.y, o.funeralSpot.x, o.funeralSpot.y) < 0.8).length; if ((there >= 3 && there >= at.length * 0.6) || game.time - f.t0 > 25) f.begun = true; }
      }
    },
    mourn(game, e, npc, dt) {
      const f = e.funeral, world = game.world;
      if (f.done) { e.funeral = null; e.chore = null; return false; }
      const sp = e.funeralSpot;
      if (U.dist(e.x, e.y, sp.x, sp.y) > 0.5) { ECHO.Ent.travel(world, e, sp.x, sp.y, e.speed * 0.5, dt); e.chore = null; return true; }
      e.moving = false;
      e.dir = Math.atan2(f.y - e.y, f.x - e.x); e.flip = Math.cos(e.dir) < 0;
      e.chore = e.funeralRole === 'priest' ? 'pray' : 'mourn';
      const dead = world.npcs[f.npc];
      if (e.funeralRole === 'priest') {
        if (!f.begun) return true;
        f.sayT -= dt;
        if (f.sayT <= 0 && f.said < 5) {
          const L = [`We are here for ${dead.first} ${dead.last}.`, (() => { const age = Math.floor(P().age(world, dead)), home = ECHO.Sim.settlement(world, dead.home); return `${age >= 60 ? `${age} long years` : age < 18 ? `Only ${age} years` : `${age} years`} ${dead.first} lived${home ? ` in ${home.name}` : ''}, among us.`; })(), `${dead.cause ? `Taken from us — ${dead.cause}.` : 'Taken from us too soon.'}`, 'We give them back to the earth, and to the Flame.', `Go gently, ${dead.first}.`];
          e.say = L[f.said]; e.sayT = 4; f.said++; f.sayT = 5.2;
        }
      } else if (e.sayT <= 0 && Math.random() < dt * (e.funeralRole === 'kin' ? 0.03 : 0.015) && f.said >= 2) {
        e.say = e.funeralRole === 'kin' ? pick(['…', `${dead.first}…`, 'Goodbye, my love.', 'I can\'t…']) : pick([`${dead.first} was kind to me.`, 'Rest now.', 'Gone so quick.', `I\'ll miss ${dead.sex === 'f' ? 'her' : 'him'}.`]);
        e.sayT = 2.6;
      }
      return true;
    },
    endFuneral(game, f) {
      const world = game.world, pl = game.pl;
      f.done = true;
      const dead = world.npcs[f.npc];
      if (dead) dead.buried = true;
      for (const o of game.ents) if (o.funeral === f) { o.funeral = null; o.chore = null; }
      // you stood with them
      if (f.watch > 25 && dead && pl) {
        if (ECHO.Comrade) ECHO.Comrade.react(game, 'mercy', 0.4);
        const kin = [dead.spouse, ...(dead.kids || [])].map(id => world.npcs[id]).filter(n => n && n.status !== 'dead');
        for (const k of kin) { P().remember(world, k, `${pl.first} ${pl.last} stood with us when we buried ${dead.first}`, 'gratitude', null, 3); k.op = k.op || {}; k.op[pl.charId] = (k.op[pl.charId] || 0) + 10; }
        const s = world.settlements.find(t => t.id === f.sid);
        if (s) { s.rep = s.rep || {}; s.rep[pl.charId] = (s.rep[pl.charId] || 0) + 1; }
        ECHO.UI.toast(`You stood with the mourners as they buried ${dead.first} ${dead.last}. ${kin.length ? `${kin[0].first} won't forget it.` : 'The town noticed.'}`, 'info', 6);
      }
    },

    // ------------------------------------------------------------ fire
    ignite(game, s, b, why, blame) {
      if (Tn.fires.some(f => !f.done)) return null;
      const world = game.world;
      const owner = Object.values(world.npcs).find(n => n.status !== 'dead' && n.home === s.id && ECHO.AI.Sched.houseOf(game, s, n) === b);
      const f = { sid: s.id, b, x: b.x + b.w / 2, y: b.y + b.h / 2, heat: 0.4, fuel: 100, t0: game.time, why, blame: !!blame, owner: owner && owner.id, help: 0, alarm: false, line: null, buckets: [], bT: 0, done: false };
      Tn.fires.push(f);
      return f;
    },
    fireAt(x, y, from) {
      const game = ECHO.Game; if (!game || x >= 9000) return;
      const world = game.world;
      const s = ECHO.World.settlementAt(world, x, y, 30);
      if (!s) return;
      const b = s.buildings.find(b => b.type === 'house' && x > b.x - 0.6 && x < b.x + b.w + 0.6 && y > b.y - 0.6 && y < b.y + b.h + 0.6);
      if (b && Math.random() < 0.4) { const f = Tn.ignite(game, s, b, 'spell', from === game.pe); if (f && from === game.pe) ECHO.UI.toast('Your fire caught the thatch. The house is burning!', 'warn', 5); }
    },
    // the front of the fire facing the well, a little way out
    fireFront(f, from) {
      const b = f.b;
      const cx = U.clamp(from.x, b.x, b.x + b.w), cy = U.clamp(from.y, b.y, b.y + b.h);
      const a = Math.atan2(from.y - cy, from.x - cx);
      return { x: cx + Math.cos(a) * 1.3, y: cy + Math.sin(a) * 1.3 };
    },
    fireTick(game, f, dt) {
      const world = game.world, pe = game.pe;
      const s = world.settlements.find(t => t.id === f.sid);
      if (!s) { f.done = true; return; }
      const dp = pe ? U.dist(pe.x, pe.y, f.x, f.y) : 99;
      // it spreads unless it's fought
      f.heat = Math.min(1, f.heat + dt * 0.01);
      f.fuel -= dt * (0.35 + f.heat * 0.9);
      // smoke, sparks and the glow
      if (dp < 60) {
        const b = f.b;
        for (let k = 0; k < 3; k++) if (Math.random() < dt * 14 * f.heat) ECHO.Combat.fx.push({ kind: 'p', x: b.x + Math.random() * b.w, y: b.y + Math.random() * b.h, vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.5) * 0.6, t: 0, life: 0.5 + Math.random() * 0.4, color: Math.random() < 0.5 ? '#ffb04a' : '#ff6a2a', size: 3, spark: true, h0: 1.6 + Math.random() * 1.2, vz: 2 + Math.random() * 2 });
        if (Math.random() < dt * 6 * (0.3 + f.heat)) ECHO.Combat.fx.push({ kind: 'smoke', x: b.x + Math.random() * b.w, y: b.y + Math.random() * b.h, sh: 2.6 + Math.random() * 0.6, vx: 0.3 + Math.random() * 0.3, vy: 0, t: 0, life: 4 + Math.random() * 2, size: 4 });
      }
      // the alarm
      if (!f.alarm && game.time - f.t0 > 2) {
        f.alarm = true;
        const own = f.owner && world.npcs[f.owner];
        const crier = game.ents.filter(o => o.type === 'person' && !o.dead && !o.hidden && o.npcId).sort((a, b) => U.dist(a.x, a.y, f.x, f.y) - U.dist(b.x, b.y, f.x, f.y))[0];
        if (crier) { crier.say = `FIRE! Fire at ${own ? own.first + '\'s' : 'the'} house!`; crier.sayT = 3; }
        if (dp < 40) { ECHO.UI.toast(`Fire in ${s.name}! ${own ? `${own.first} ${own.last}'s` : 'A'} house is burning. Help the bucket line — press E near the flames to throw water.`, 'warn', 7); if (ECHO.Sfx) ECHO.Sfx.play('whistle', { pitch: 0.6, vol: 0.5 }); }
      }
      // the bucket line, from the well to the flames
      if (f.alarm && !f.line) {
        const well = s.buildings.find(b => b.type === 'well');
        const src = well ? { x: well.x + 0.5, y: well.y + 1.6 } : { x: s.x, y: s.y };
        const front = Tn.fireFront(f, src);
        f.front = front; f.src = src;
        const len = U.dist(src.x, src.y, front.x, front.y);
        const n = U.clamp(Math.round(len / 1.6) + 1, 3, 9);
        f.line = [];
        for (let i = 0; i < n; i++) { const k = n === 1 ? 1 : i / (n - 1); f.line.push({ x: U.lerp(src.x, front.x, k), y: U.lerp(src.y, front.y, k), e: null }); }
      }
      if (f.line) {
        // fill the line with whoever's near: out of their houses and running
        for (const slot of f.line) {
          if (slot.e && (slot.e.dead || slot.e.bucket !== f || slot.e.target)) slot.e = null;
          if (slot.e) continue;
          let best = null, bd = 32;
          for (const o of game.ents) {
            if (o.type !== 'person' || o.dead || o.target || o.bucket || o.funeral || !o.npcId || o.indoor || o.role === 'bandit' || o.role === 'traveler' || o.isCompanion) continue;
            const on = world.npcs[o.npcId];
            if (!on || on.prof === 'child' || on.sick || on.loc !== s.id) continue;
            const d = U.dist(o.x, o.y, slot.x, slot.y);
            if (d < bd) { bd = d; best = o; }
          }
          if (best) {
            if (best.hidden) { best.hidden = false; best.goal = null; }
            if (best.convo) { const c = best.convo; c.a.convo = null; c.b.convo = null; }
            best.play = null; best.shop = null; best.spectate = null; best.helping = null;
            best.bucket = f; slot.e = best;
            if (best.sayT <= 0 && Math.random() < 0.5) { best.say = pick(['Buckets! Get the buckets!', 'To the well!', 'Water! Quick!', 'Coming!']); best.sayT = 1.6; }
          }
        }
        // a bucket in at the well every so often; along the line; up at the fire
        const ready = f.line.every(sl => sl.e && U.dist(sl.e.x, sl.e.y, sl.x, sl.y) < 0.8);
        f.bT -= dt;
        if (f.bT <= 0 && f.line[0].e && U.dist(f.line[0].e.x, f.line[0].e.y, f.line[0].x, f.line[0].y) < 0.8) { f.bT = ready ? 1.1 : 2.2; f.buckets.push({ i: 0, t: 0 }); }
        for (const bk of f.buckets) {
          bk.t += dt;
          const sl = f.line[bk.i];
          const there = sl && sl.e && U.dist(sl.e.x, sl.e.y, sl.x, sl.y) < 0.9;
          if (bk.t > 0.55 && there) {
            bk.t = 0; bk.i++;
            if (bk.i >= f.line.length) { bk.done = true; Tn.douse(game, f, f.line[f.line.length - 1].e, 0.032); }
          }
        }
        f.buckets = f.buckets.filter(b => !b.done);
        for (let i = 0; i < f.line.length; i++) { const e = f.line[i].e; if (e) e.holding = f.buckets.some(b => b.i === i); }
      }
      if (f.heat <= 0.02) return Tn.endFire(game, f, true);
      if (f.fuel <= 0) return Tn.endFire(game, f, false);
    },
    bucketDo(game, e, npc, dt) {
      const f = e.bucket;
      if (f.done) { e.bucket = null; e.chore = null; return false; }
      const slot = f.line && f.line.find(sl => sl.e === e);
      if (!slot) { e.bucket = null; e.chore = null; return false; }
      if (U.dist(e.x, e.y, slot.x, slot.y) > 0.6) { ECHO.Ent.travel(game.world, e, slot.x, slot.y, e.speed * 1.15, dt); e.chore = null; return true; }
      e.moving = false;
      // face down the line toward the fire; the front one faces the flames
      const i = f.line.indexOf(slot), nx = f.line[Math.min(f.line.length - 1, i + 1)];
      const to = i === f.line.length - 1 ? { x: f.x, y: f.y } : nx;
      e.dir = Math.atan2(to.y - e.y, to.x - e.x); e.flip = Math.cos(e.dir) < 0;
      e.chore = e.holding ? 'bucket' : 'wait';
      if (e.sayT <= 0 && Math.random() < dt * 0.05) { e.say = pick(['Faster!', 'Keep them coming!', 'Here!', 'Pass it on!', 'More water!']); e.sayT = 1.2; }
      return true;
    },
    douse(game, f, by, amt) {
      f.heat = Math.max(0, f.heat - amt);
      const fr = f.front || { x: f.x, y: f.y };
      const tx = U.lerp(fr.x, f.x, 0.6), ty = U.lerp(fr.y, f.y, 0.6);
      ECHO.Combat.burst(tx, ty, '#9fd3ff', 12, 3, 0.5, 2);
      for (let k = 0; k < 3; k++) ECHO.Combat.fx.push({ kind: 'smoke', x: tx + (Math.random() - 0.5), y: ty + (Math.random() - 0.5), sh: 1.4, vx: 0.2, vy: 0, t: 0, life: 2, size: 3 });
      const pe = game.pe;
      if (pe && U.dist(pe.x, pe.y, tx, ty) < 14 && ECHO.Sfx) ECHO.Sfx.play('splash', { vol: 0.4 });
      if (by && by.chore !== undefined) by.choreT = 0;
    },
    endFire(game, f, saved) {
      const world = game.world, pl = game.pl, pe = game.pe;
      f.done = true; f.saved = saved;
      const s = world.settlements.find(t => t.id === f.sid);
      const own = f.owner && world.npcs[f.owner];
      for (const o of game.ents) if (o.bucket === f) { o.bucket = null; o.holding = false; o.chore = null; if (saved) { o.cheerT = 2 + Math.random() * 2; if (Math.random() < 0.5) { o.say = pick(['It\'s out!', 'Thank the Flame!', 'We did it!', 'Hurrah!']); o.sayT = 2; } } }
      const near = pe && U.dist(pe.x, pe.y, f.x, f.y) < 30;
      if (!saved) {
        f.b.gutted = world.day;
        if (own) P().remember(world, own, 'lost their home to fire', 'grief', null, 3);
        Tn.ruins.push({ x: f.x, y: f.y, b: f.b, until: game.time + 240 });
      }
      if (s && pl) {
        s.rep = s.rep || {};
        let d = 0;
        if (f.help >= 3) {
          d += saved ? 2 : 1;
          if (ECHO.Comrade) { ECHO.Comrade.react(game, 'protect', 1); ECHO.Comrade.note(game, 'fire', { x: f.x, y: f.y }); }
          if (own) { P().remember(world, own, `${pl.first} ${pl.last} helped fight the fire at my house`, 'gratitude', null, saved ? 4 : 2); own.op = own.op || {}; own.op[pl.charId] = (own.op[pl.charId] || 0) + (saved ? 20 : 10); }
          if (saved) ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} helped put out a house fire in ${s.name}.`, importance: 1, x: f.x, y: f.y, rep: 2, tag: 'protect' });
        }
        if (f.blame) d -= saved ? 2 : 6;
        if (d) s.rep[pl.charId] = (s.rep[pl.charId] || 0) + d;
        if (near) ECHO.UI.toast(saved
          ? `The fire is out. ${own ? `${own.first}'s house is saved` : 'The house is saved'}${f.help >= 3 ? ` — and ${s.name} saw you in the bucket line` : ''}.${f.blame ? ' Some of them saw where it started, though.' : ''}`
          : `The house is gutted. ${own ? `${own.first} ${own.last} stands in the ashes.` : ''}${f.blame ? ` ${s.name} knows whose fire it was.` : ''}`, saved ? 'legend' : 'warn', 7);
      }
    },
    ruins: [],

    // ------------------------------------------------------------ they notice you
    notice(game) {
      const pe = game.pe, pl = game.pl, world = game.world;
      if (!pe || pe.x >= 9000 || ECHO.Interior.cur) return;
      const s = ECHO.World.settlementAt(world, pe.x, pe.y, 20);
      if (!s) return;
      for (const e of game.ents) {
        if (e.type !== 'person' || e.dead || e.hidden || e.target || e.convo || e.spectate || e.bucket || e.funeral || e.play || e.helping || !e.npcId || e.sayT > 0 || e.role === 'bandit' || e.isCompanion) continue;
        if (U.dist(e.x, e.y, pe.x, pe.y) > 3.2) continue;
        if (e.noticeAt && game.time - e.noticeAt < 45) continue;
        if (Math.random() > 0.35) continue;
        e.noticeAt = game.time;
        const n = world.npcs[e.npcId];
        const guard = e.role === 'guard';
        const healer = s.buildings.find(b => b.type === 'temple') ? 'the temple' : s.buildings.find(b => b.type === 'shrine') ? 'the shrine' : null;
        let line = null;
        if (pl.hp < pl.maxHp * 0.3) line = pick(['Gods, you\'re bleeding!', `You're hurt! ${healer ? `The healers are at ${healer}.` : 'Sit down before you fall down.'}`, 'You look half dead, friend.']);
        else if (ECHO.PlayerCtl.sneaking && !game.isNight()) line = guard ? 'What are you skulking about for?' : pick(['Why are you creeping about?', 'Lost something?']);
        else if (pl.wetT > 0) line = pick(['You\'re soaked through!', 'Fell in the river, did you?', 'You\'re dripping on my step.']);
        else if (game.combatT != null && game.time - game.combatT < 40) line = pick(['Was that you fighting out there?', 'There\'s blood on your boots.', 'Trouble follows you, doesn\'t it?']);
        else if (pe.mounted && !e.saidHorse) { e.saidHorse = true; line = pick(['Fine horse.', 'That\'s a good animal you\'ve got.', 'Mind where it puts its feet.']); }
        else if (pl.renown >= 20 && !e.saidFame) {
          e.saidFame = true;
          const deed = world.chronicle.slice(-80).reverse().find(x => x.char === pl.charId && x.imp >= 1);
          line = deed ? pick([`You're ${pl.first}, aren't you? I heard what you did.`, 'It\'s really you! Wait till I tell my sister.', `${pl.first}! Is it true, what they say?`]) : null;
        } else if (pl.pet && game.ents.some(d => d.pet && d.mine && !d.dead && U.dist(d.x, d.y, e.x, e.y) < 3) && !e.saidDog) { e.saidDog = true; line = n.prof === 'child' ? 'Can I pet your dog? Can I?' : pick(['Good dog, that.', 'What\'s its name?']); }
        else if (game.isNight() && pl.lanternOn) line = pick(['Mind the dark lanes.', 'Late to be out.']);
        if (line) { e.say = line; e.sayT = 2.6; e.dir = Math.atan2(pe.y - e.y, pe.x - e.x); e.flip = Math.cos(e.dir) < 0; }
      }
    },

    // ------------------------------------------------------------ each frame
    update(game, dt) {
      const pe = game.pe, world = game.world;
      if (!pe || !world) return;
      Tn.glows.length = 0;
      for (const f of Tn.fires) if (!f.done) {
        Tn.fireTick(game, f, dt);
        if (!f.done) Tn.glows.push({ x: f.x, y: f.y, h: 2.2, c: '#ff8a3a', s: 3 + f.heat * 4 + Math.sin(game.time * 13) * 0.4, a: 0.55 + f.heat * 0.4 });
      }
      Tn.fires = Tn.fires.filter(f => !f.done || game.time - f.t0 < 5);
      for (const r of Tn.ruins) if (Math.random() < dt * 1.2 && U.dist(r.x, r.y, pe.x, pe.y) < 50) ECHO.Combat.fx.push({ kind: 'smoke', x: r.b.x + Math.random() * r.b.w, y: r.b.y + Math.random() * r.b.h, sh: 1.2, vx: 0.2, vy: 0, t: 0, life: 4, size: 3 });
      Tn.ruins = Tn.ruins.filter(r => game.time < r.until);
      for (const f of Tn.funerals) if (!f.done) Tn.glows.push({ x: f.x, y: f.y + 0.2, h: 0.4, c: '#ffd890', s: 1.2 + Math.sin(game.time * 9) * 0.1, a: 0.7 });
      for (const G of Tn.games) if (!G.over) Tn.tagTick(game, G, dt);
      Tn.games = Tn.games.filter(G => !G.over);
      Tn.t -= dt;
      if (Tn.t > 0) return;
      Tn.t = 0.5;
      Tn.fightScan(game);
      Tn.notice(game);
      Tn.slowT -= 0.5;
      if (Tn.slowT > 0) return;
      Tn.slowT = 1.5;
      Tn.hurtScan(game);
      Tn.funeralScan(game);
      Tn.chatScan(game);
      Tn.fireRoll(game);
    },
    // who might stop and talk, start a game, or go to market
    chatScan(game) {
      const world = game.world, pe = game.pe, h = hourOf(world);
      if (pe.x >= 9000 || ECHO.Interior.cur) return;
      const s = ECHO.World.settlementAt(world, pe.x, pe.y, 26);
      if (!s) return;
      const idle = game.ents.filter(o => o.type === 'person' && !o.dead && !o.hidden && !o.indoor && !o.moving && !o.target && !o.convo && !o.spectate && !o.bucket && !o.funeral && !o.play && !o.helping && !o.helped && !o.shop && o.npcId && !o.isCompanion && o.role !== 'bandit' && o.role !== 'traveler' && o.role !== 'soldier' && !o.listen && U.dist(o.x, o.y, pe.x, pe.y) < 18 && world.npcs[o.npcId] && world.npcs[o.npcId].loc === s.id);
      // two neighbours stop to talk
      const talking = game.ents.filter(o => o.convo).length / 2;
      if (talking < 3 && Math.random() < 0.55) {
        for (const a of idle) {
          if (a.convoAt && game.time - a.convoAt < 50) continue;
          const b = idle.find(o => o !== a && !(o.convoAt && game.time - o.convoAt < 50) && U.dist(o.x, o.y, a.x, a.y) < 3.4 && !o.convo);
          if (!b) continue;
          if (!a.convo && !b.convo) { Tn.startConvo(game, a, b, Tn.lines(game, a, b)); break; }
        }
      }
      // a customer for the market
      if (h >= 8 && h < 16 && Math.random() < 0.18) {
        const m = game.ents.find(o => o.type === 'person' && !o.dead && !o.hidden && !o.convo && o.chore === 'hawk' && U.dist(o.x, o.y, pe.x, pe.y) < 22);
        if (m) {
          const buyer = idle.filter(o => o !== m && world.npcs[o.npcId].prof !== 'child' && !o.chore && U.dist(o.x, o.y, m.x, m.y) < 16)[0];
          if (buyer) buyer.shop = { m, t0: game.time };
        }
      }
      // children: a game of tag in the square
      const wx = ECHO.Weather ? ECHO.Weather.here(world, s.x, s.y) : null;
      const fine = !wx || !(wx.today === 'rain' || wx.today === 'storm' || wx.today === 'snow' || wx.today === 'blizzard');
      if (fine && h >= 8 && h < 18.5 && !Tn.games.some(G => G.sid === s.id) && !(Tn.lastGame && Tn.lastGame[s.id] && game.time - Tn.lastGame[s.id] < 90)) {
        const kids = idle.filter(o => world.npcs[o.npcId].prof === 'child');
        if (kids.length >= 2) {
          const cx = kids[0].x, cy = kids[0].y;
          const group = kids.filter(k => U.dist(k.x, k.y, cx, cy) < 10).slice(0, 5);
          if (group.length >= 2) {
            const c = ECHO.Ent.freeSpot(world, (s.x + cx) / 2, (s.y + cy) / 2, 3) || { x: cx, y: cy };
            const G = { sid: s.id, kids: group, it: group[0], cx: c.x, cy: c.y, r: 5.5, t0: game.time, dur: 60 + Math.random() * 60, over: false, frozen: 1.5 };
            for (const k of group) { k.play = G; k.chore = null; }
            group[0].say = 'You\'re it! Count to five!'; group[0].sayT = 2;
            Tn.games.push(G);
            (Tn.lastGame || (Tn.lastGame = {}))[s.id] = game.time;
          }
        }
      }
    },
    // now and then, a house catches
    fireRoll(game) {
      const world = game.world, pe = game.pe;
      const hr = world.day * 24 + Math.floor(hourOf(world));
      if (hr === Tn.lastHour) return;
      Tn.lastHour = hr;
      if (pe.x >= 9000 || Tn.fires.some(f => !f.done)) return;
      const s = ECHO.World.settlementAt(world, pe.x, pe.y, 45);
      if (!s) return;
      const wx = ECHO.Weather ? ECHO.Weather.here(world, s.x, s.y) : null;
      let p = 0.006;
      if (wx && wx.today === 'storm') p *= 4;
      if (wx && (wx.drought || wx.today === 'heat')) p *= 2;
      if (game.isNight()) p *= 1.5;
      if (Math.random() > p) return;
      const houses = s.buildings.filter(b => b.type === 'house' && !(b.gutted && world.day - b.gutted < 5));
      if (!houses.length) return;
      const why = wx && wx.today === 'storm' ? 'lightning' : 'hearth';
      Tn.ignite(game, s, pick(houses), why, false);
    },
    // you, with a bucket
    interactables(game) {
      const pe = game.pe, out = [];
      if (pe.mounted || pe.inBoat || ECHO.Interior.cur) return out;
      for (const f of Tn.fires) {
        if (f.done) continue;
        const b = f.b;
        const cx = U.clamp(pe.x, b.x, b.x + b.w), cy = U.clamp(pe.y, b.y, b.y + b.h);
        const d = U.dist(pe.x, pe.y, cx, cy);
        if (d < 3.2) out.push({ kind: 'act', label: 'Throw water on the fire', d: 0.4, act: () => {
          const pl = game.pl;
          if (game.time - (f.youT || -9) < 1.1) return;
          if (pl.stamina < 6) return game.ui.toast('You\'re too winded. Catch your breath.', 'info', 2);
          f.youT = game.time; pl.stamina -= 6; f.help++;
          Tn.douse(game, f, null, 0.06);
          pe.dir = Math.atan2(f.y - pe.y, f.x - pe.x);
          if (f.help === 3) { const o = f.line && f.line[f.line.length - 1].e; if (o) { o.say = 'That\'s it! Keep at it!'; o.sayT = 2; } }
        } });
      }
      // bind a hurt neighbour's wounds
      if (game.pl.inv.herbs > 0) for (const e of game.ents) {
        if (e.type !== 'person' || e.dead || e.hidden || !e.npcId || e.target || e.hp >= e.maxHp * 0.45 || e.role === 'bandit' || e.isCompanion || U.dist(e.x, e.y, pe.x, pe.y) > 1.6) continue;
        const n = game.world.npcs[e.npcId];
        out.push({ kind: 'act', label: `Bind ${n.first}'s wounds (herbs)`, d: 0.7, act: () => Tn.bind(game, e, n) });
        break;
      }
      return out;
    },
    bind(game, e, n) {
      const pl = game.pl, world = game.world;
      if (!(pl.inv.herbs > 0)) return;
      pl.inv.herbs--;
      if (e.stranded && ECHO.Director) { ECHO.Director.help(game, e, n); e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.3); return; }
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.5);
      if (e.helped) { const h = e.helped; h.helping = null; h.together = false; e.helped = null; }
      e.say = pick(['Thank you… that\'s better already.', 'Bless you, stranger.', 'I won\'t forget this.']); e.sayT = 2.6;
      ECHO.Combat.burst(e.x, e.y - 0.3, '#7aff8a', 10, 2, 0.6, 2);
      if (ECHO.Comrade) ECHO.Comrade.react(game, 'gift', 0.8);
      P().remember(world, n, `${pl.first} ${pl.last} bound my wounds in the street`, 'gratitude', null, 3);
      n.op = n.op || {}; n.op[pl.charId] = (n.op[pl.charId] || 0) + 12;
      ECHO.Character.train(pl, 'study', 0.1);
    }
  };
  if (ECHO.Pastimes) {
    ECHO.Pastimes.extraAct = ECHO.Pastimes.extraAct || [];
    ECHO.Pastimes.extraAct.push(game => Tn.interactables(game));
  }
})();
