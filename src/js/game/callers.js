// Callers: people who come to you.
//
// You don't always have to go looking. Walk through a town where you've done
// some good, and someone you helped may spot you across the square and hurry
// over with something for you — a basket of eggs, a bundle of arrows fletched
// that morning, a few crowns — and you can take it, or tell them to keep it.
// A friend pulls you into a doorway to warn you that the watch has your
// description. The innkeeper mentions that someone was in asking after you by
// name — the brother of a man you killed, or a rival adventurer who wants to
// know which barrows you've cleared — and where they went. A farmer with
// trouble doesn't wait for you to read the notice board: they come and ask.
// So does the woman whose husband has the fever, if she sees herbs at your
// belt. And where you've stolen, the shopkeepers stop trusting you: they
// follow you along the stalls with their eyes, and with their feet.
(function () {
  const { U } = ECHO;
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const P = () => ECHO.People;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const GIFTS = {
    farmer: [['a basket of eggs and a round of cheese', pl => { pl.inv.food = (pl.inv.food || 0) + 3; }]],
    smith: [['a bundle of good arrows, fletched this morning', pl => { pl.inv.arrows = (pl.inv.arrows || 0) + 12; }]],
    herbalist: [['three bundles of herbs, tied with twine', pl => { pl.inv.herbs = (pl.inv.herbs || 0) + 3; }]],
    priest: [['a bundle of blessed herbs', pl => { pl.inv.herbs = (pl.inv.herbs || 0) + 2; }]],
    hunter: [['a haunch of venison and a good hide', pl => { pl.inv.meat = (pl.inv.meat || 0) + 2; pl.inv.hide = (pl.inv.hide || 0) + 1; }]],
    child: [['a slightly squashed honey cake', pl => { pl.inv.food = (pl.inv.food || 0) + 1; pl.merryT = Math.max(pl.merryT || 0, 120); }]],
    innkeeper: [['a stoppered jug and a pie wrapped in cloth', pl => { pl.inv.food = (pl.inv.food || 0) + 2; pl.merryT = Math.max(pl.merryT || 0, 90); }]]
  };

  const Cl = ECHO.Callers = {
    t: 0, nextAt: 30, active: null,
    // ------------------------------------------------------------ who would come
    reasons(game, e, npc, s) {
      const world = game.world, pl = game.pl, out = [];
      const op = (npc.op && npc.op[pl.charId]) || 0;
      const age = P().age(world, npc);
      const adult = age >= 16 && npc.prof !== 'child';
      const lawman = e.role === 'guard' || e.role === 'soldier' || npc.prof === 'ruler' || npc.prof === 'reeve';
      const thanks = npc.mem && npc.mem.filter(m => m.type === 'gratitude' && m.t.includes(pl.first) && world.day - m.d < 60).slice(-1)[0];
      // a warning: the watch is after you
      if (pl.wanted && pl.wanted[s.faction] > 0 && adult && !lawman && (op >= 10 || thanks) && npc.warnedDay !== world.day) out.push({ kind: 'warn', w: 6 });
      // someone has been asking after you
      if (adult && (npc.prof === 'innkeeper' || op > 0 || thanks)) {
        const told = pl.toldAsking || {};
        for (const n of Object.values(world.npcs)) {
          const g = n.mind && n.mind.goal;
          if (n.status !== 'alive' || !g || g.kind !== 'avenge' || g.target.type !== 'player' || g.target.id !== pl.charId) continue;
          if (told[n.id] != null && world.day - told[n.id] < 4) continue;
          if (n.loc === s.id && game.ents.some(x => x.npcId === n.id)) continue;   // they're here; you'll find out soon enough
          out.push({ kind: 'avenger', w: 4, who: n }); break;
        }
        if (ECHO.Rivals) for (const r of ECHO.Rivals.list(world)) {
          if (!r.alive || !r.last || world.day - r.last.d > 6 || (told[r.id] != null && world.day - told[r.id] < 6)) continue;
          out.push({ kind: 'rival', w: 2, r }); break;
        }
      }
      // asking for help
      if (adult && (!npc.askedDay || world.day - npc.askedDay >= 5)) {
        if (ECHO.Dilemmas) { const q = ECHO.Dilemmas.forTown(world, s).find(q => q.status === 'open' && q.npc === npc.id); if (q) out.push({ kind: 'plea', w: 4, q }); }
        const kin = [npc.spouse, ...(npc.kids || []), ...(npc.parents || [])].map(id => world.npcs[id]).filter(k => k && k.status === 'alive' && k.sick);
        if (kin.length && pl.inv.herbs > 0) out.push({ kind: 'herbs', w: 4, kin: kin[0] });
        if (s.hunger > 0.25 && (npc.kids || []).some(id => world.npcs[id] && world.npcs[id].status === 'alive' && P().age(world, world.npcs[id]) < 14) && pl.inv.food >= 2 && (npc.wealth || 0) < 40) out.push({ kind: 'food', w: 3 });
      }
      // a gift, for what you did
      if ((thanks || (npc.mind && npc.mind.owe > 0)) && op > 20 && (npc.giftDay == null || world.day - npc.giftDay >= 10)) out.push({ kind: 'gift', w: 3, mem: thanks });
      return out;
    },
    scan(game) {
      const world = game.world, pe = game.pe, pl = game.pl;
      if (!pe || pe.x >= 9000 || ECHO.Interior.cur || game.time < Cl.nextAt || Cl.active || ECHO.UI.modalOpen || ECHO.UI.panelOpen) return;
      if (game.combatT != null && game.time - game.combatT < 10) return;
      const s = ECHO.World.settlementAt(world, pe.x, pe.y, 22);
      if (!s) return;
      const opts = [];
      for (const e of game.ents) {
        if (e.type !== 'person' || e.dead || e.hidden || e.indoor || e.target || !e.npcId || e.call || e.isCompanion || e.role === 'bandit' || e.role === 'traveler' || e.bucket || e.funeral || e.helping || e.helped) continue;
        const d = U.dist(e.x, e.y, pe.x, pe.y);
        if (d > 24 || d < 2.5) continue;
        const npc = world.npcs[e.npcId];
        if (!npc || npc.loc !== s.id) continue;
        for (const r of Cl.reasons(game, e, npc, s)) opts.push({ e, npc, r, w: r.w * (1.2 - d / 30) });
      }
      if (!opts.length) { Cl.nextAt = game.time + 8; return; }
      let tot = 0; for (const o of opts) tot += o.w;
      let x = Math.random() * tot, c = opts[0];
      for (const o of opts) { x -= o.w; if (x <= 0) { c = o; break; } }
      const e = c.e;
      if (e.convo) { const cv = e.convo; cv.a.convo = null; cv.b.convo = null; }
      e.play = null; e.shop = null; e.spectate = null; e.chore = null;
      e.call = { ...c.r, t0: game.time, s: s.id, called: false };
      Cl.active = e;
    },
    // ------------------------------------------------------------ crossing the square
    think(game, e, npc, dt) {
      if (e.eyeing && !e.call) return Cl.eye(game, e, npc, dt);
      const c = e.call, pe = game.pe, world = game.world;
      const d = U.dist(e.x, e.y, pe.x, pe.y);
      // they give up if you won't stop, or the moment's gone
      if (game.time - c.t0 > 45 || d > 34 || pe.x >= 9000 || ECHO.Interior.cur || (game.combatT != null && game.time - game.combatT < 3)) {
        if (d < 14 && e.sayT <= 0) { e.say = pick(['Never mind, then…', 'Another time.', 'Oh — gone.']); e.sayT = 2; }
        return Cl.end(game, e, 40), false;
      }
      if (!c.called && d < 10) {
        c.called = true;
        e.say = c.kind === 'warn' ? `${game.pl.first}! A word — quickly.` : c.kind === 'gift' ? `${game.pl.first}! Wait — wait!` : c.kind === 'plea' || c.kind === 'herbs' || c.kind === 'food' ? pick(['You there! Please — a moment!', 'Excuse me! Excuse me!']) : `${game.pl.first}? A word, if you've a moment.`;
        e.sayT = 2.4; e.waveT = 1.6;
      }
      if (e.waveT > 0) e.waveT -= dt;
      if (d > 1.7) {
        ECHO.Ent.travel(world, e, pe.x, pe.y, e.speed * (c.kind === 'warn' || c.kind === 'plea' ? 1.0 : 0.85), dt);
        e.chore = e.waveT > 0 ? 'wave' : null;
        return true;
      }
      e.moving = false; e.chore = null;
      e.dir = Math.atan2(pe.y - e.y, pe.x - e.x); e.flip = Math.cos(e.dir) < 0;
      if (ECHO.UI.modalOpen || ECHO.UI.panelOpen) return true;
      Cl.meet(game, e, npc, c);
      Cl.end(game, e, 90 + Math.random() * 60);
      return true;
    },
    end(game, e, cool) { e.call = null; e.waveT = 0; if (Cl.active === e) Cl.active = null; Cl.nextAt = game.time + (cool || 60); },
    // ------------------------------------------------------------ the conversation
    meet(game, e, npc, c) {
      const world = game.world, pl = game.pl, s = world.settlements.find(t => t.id === c.s);
      const name = `${npc.first} ${npc.last}`;
      const say = (t, k = 2.6) => { e.say = t; e.sayT = k; };
      const he = npc.sex === 'f' ? 'she' : 'he';
      const UI = ECHO.UI;
      const html = t => `<p class="prose">${t}</p>`;
      if (c.kind === 'gift') {
        npc.giftDay = world.day; if (npc.mind) npc.mind.giftDay = world.day;
        const G = GIFTS[npc.prof] || ((npc.wealth || 0) > 25 ? [[`a purse of ${Math.round(Math.min(30, npc.wealth * 0.2))} crowns`, pl2 => { const k = Math.round(Math.min(30, npc.wealth * 0.2)); pl2.gold += k; npc.wealth -= k; }]] : [['a loaf, some cheese and a twist of salt', pl2 => { pl2.inv.food = (pl2.inv.food || 0) + 2; }]]);
        const [what, give] = pick(G);
        let why = 'I haven\'t forgotten what you did for me.';
        if (c.mem) {
          let t = c.mem.t.replace(`${pl.first} ${pl.last}`, 'you').replace(pl.first, 'you');
          if (/^(was|had) /.test(t)) t = 'I ' + t;
          why = `I haven't forgotten — ${t}.`;
        }
        return UI.modal({ title: name, html: html(`<b>${esc(npc.first)}</b> catches up with you, a little out of breath. "There you are. ${esc(why)} I wanted you to have this." ${U.cap(he)} holds out ${esc(what)}.`), choices: [
          { label: 'Take it, with thanks.', onPick: () => { give(pl); if (npc.mind) npc.mind.owe = Math.max(0, (npc.mind.owe || 0) - 1); say('It\'s the least I could do.'); ECHO.Sfx.play('coin', { pitch: 1.3 }); UI.toast(`${npc.first} gave you ${what}.`, 'mercy', 4); } },
          { label: '"Keep it. You need it more than I do."', sub: 'They will think the more of you', onPick: () => { npc.op[pl.charId] = (npc.op[pl.charId] || 0) + 12; if (npc.mind) npc.mind.owe = 0; ECHO.Character.behave(pl, 'mercy', 0.04); say(pick(['…You\'re a good soul.', 'Then I owe you twice.', 'Bless you.'])); } }
        ] });
      }
      if (c.kind === 'warn') {
        npc.warnedDay = world.day;
        const crimes = ECHO.Law ? ECHO.Law.openAgainstPlayer(world, pl, s.faction) : [];
        const what = [...new Set(crimes.map(x => x.kind))].slice(0, 2).join(' and ') || 'something you did';
        return UI.modal({ title: name, html: html(`<b>${esc(npc.first)}</b> glances over ${npc.sex === 'f' ? 'her' : 'his'} shoulder and pulls you into the shade of a doorway. "The watch has your description — ${esc(what)}. They're asking at the gate and the inn. Keep your hood up, and don't linger."`), choices: [
          { label: '"Thank you. I won\'t forget it."', onPick: () => { npc.op[pl.charId] = (npc.op[pl.charId] || 0) + 3; say('Go carefully.'); } },
          { label: 'Press 10 crowns on them: "You never saw me."', sub: pl.gold >= 10 ? 'Fewer tongues wagging; the watch will hear less of you' : `You have ${Math.floor(pl.gold)}.`, disabled: pl.gold < 10, onPick: () => { pl.gold -= 10; npc.wealth = (npc.wealth || 0) + 10; pl.wanted[s.faction] = Math.max(0, pl.wanted[s.faction] - 15); say('Never saw you. Never heard of you.'); } }
        ] });
      }
      if (c.kind === 'avenger') {
        const av = c.who, g = av.mind && av.mind.goal, home = ECHO.Sim.settlement(world, av.loc);
        (pl.toldAsking = pl.toldAsking || {})[av.id] = world.day;
        const where = home ? `in ${home.name}` : 'on the road';
        return UI.modal({ title: name, html: html(`<b>${esc(npc.first)}</b> lowers ${npc.sex === 'f' ? 'her' : 'his'} voice. "There was ${av.sex === 'f' ? 'a woman' : 'a man'} asking after you by name. ${esc(av.first)} ${esc(av.last)}. Said you killed ${av.sex === 'f' ? 'her' : 'his'} ${esc(g.target.rel || 'kin')}, ${esc(g.target.victim || '')}. ${av.skill && av.skill.fight >= 18 ? 'Had a blade on the hip, and the look of someone who knows how to use it.' : 'Didn\'t look like a fighter — but grief makes people bold.'} Last I heard, ${av.sex === 'f' ? 'she' : 'he'} was ${esc(where)}."`), choices: [
          { label: 'Mark it on my map.', sub: 'You could go and settle it — with words, with money, or otherwise', disabled: !home, onPick: () => { pl.tracked = `mark:${home.x.toFixed(1)}:${home.y.toFixed(1)}:${av.first} ${av.last}, who wants you dead`; say('Be careful.'); } },
          { label: '"Thank you."', onPick: () => say('I thought you\'d want to know.') }
        ] });
      }
      if (c.kind === 'rival') {
        const r = c.r, site = ECHO.Explore.sites(world).find(x => x.id === r.last.site);
        (pl.toldAsking = pl.toldAsking || {})[r.id] = world.day;
        const cleared = site && site.cleared && site.clearedBy === r.name;
        return UI.modal({ title: name, html: html(`"That adventurer was through here — ${esc(r.name)} ${esc(r.epithet)}. Asking what you'd been up to, which barrows you'd cleared. Didn't like the answers, I think." ${site ? (cleared ? `"They'd just come up out of ${esc(site.name)} with its treasure, bold as you like."` : `"Last I heard, they'd been driven out of ${esc(site.name)} and swore to go back."`) : ''}`), choices: [
          ...(site && !cleared ? [{ label: `Mark ${site.name} on my map.`, sub: 'Beat them to it', onPick: () => { pl.tracked = `mark:${site.x.toFixed(1)}:${site.y.toFixed(1)}:${site.name} (before ${r.name.split(' ')[0]} gets there)`; say('Ha! Go on, then.'); } }] : []),
          { label: '"Let them try."', onPick: () => say(pick(['That\'s the spirit.', 'Heh.'])) }
        ] });
      }
      if (c.kind === 'plea') {
        npc.askedDay = world.day;
        const q = c.q, K = ECHO.Dilemmas.KINDS[q.kind];
        const ask = { debt: `"They're at my farm now — the collectors. I owe what I owe, but they'll take the roof over my children's heads. Please. You look like someone who can… talk to people."`, thief: `"Someone took a crate of ${q.goods} right off my stall. Everything I'd saved for. They say the thief's out in the wilds to the ${q.dirWord}. I'd pay to see it back."`, feud: `"${q.who2} says the east strip is theirs. It's been ours since my grandfather. It's going to come to blood if someone doesn't step in."`, wolves: `"Wolves. Every night another lamb. I've no more to lose — I'll lose the farm next. Kill them, scare them, I don't care how."`, poacher: `"Someone's taking deer in the lord's wood. The wardens want a hanging, and half the village knows who it is. Will you look into it — fairly?"` }[q.kind] || `"${K.blurb(q)}"`;
        return UI.modal({ title: K.title(q), html: html(`<b>${esc(name)}</b> comes straight up to you. ${esc(ask)} <span class="faint">(${q.reward} crowns)</span>`), choices: [
          { label: '"I\'ll help."', onPick: () => { ECHO.Dilemmas.accept(game, q); say(pick(['Thank you. Thank you.', 'Bless you!', 'I\'ll not forget it.'])); UI.toast(`${K.title(q)} — marked on your map.`, 'info', 4); } },
          { label: '"Not now."', onPick: () => say(pick(['…I understand.', 'If you change your mind, it\'s on the board.'])) }
        ] });
      }
      if (c.kind === 'herbs') {
        npc.askedDay = world.day;
        const k = c.kin, rel = k.id === npc.spouse ? (k.sex === 'f' ? 'wife' : 'husband') : (npc.kids || []).includes(k.id) ? (k.sex === 'f' ? 'daughter' : 'son') : (k.sex === 'f' ? 'mother' : 'father');
        return UI.modal({ title: name, html: html(`<b>${esc(npc.first)}</b> has been watching the herbs at your belt. "Forgive me. My ${rel}, ${esc(k.first)}, has the fever, and the healers are run off their feet. If you could spare even a little…"`), choices: [
          { label: 'Give a bundle of herbs.', onPick: () => { pl.inv.herbs--; if (k.sick) k.sick.days = Math.max(1, (k.sick.days || 3) - 3); P().remember(world, npc, `${pl.first} ${pl.last} gave herbs for ${k.first}'s fever`, 'gratitude', null, 3); npc.op[pl.charId] = (npc.op[pl.charId] || 0) + 15; if (npc.mind) npc.mind.owe = (npc.mind.owe || 0) + 1; say('Thank you. Oh, thank you.'); } },
          { label: '"I\'m sorry. I need them."', onPick: () => say('…Of course.') }
        ] });
      }
      if (c.kind === 'food') {
        npc.askedDay = world.day;
        return UI.modal({ title: name, html: html(`<b>${esc(npc.first)}</b> can't quite meet your eye. "Bread's ${s.prices.food} crowns. I can't… the children haven't eaten properly in days. Could you spare anything at all?"`), choices: [
          { label: 'Give two portions of food.', onPick: () => { pl.inv.food -= 2; P().remember(world, npc, `${pl.first} ${pl.last} fed my children in the hungry time`, 'gratitude', null, 3); npc.op[pl.charId] = (npc.op[pl.charId] || 0) + 12; if (npc.mind) npc.mind.owe = (npc.mind.owe || 0) + 1; ECHO.Character.behave(pl, 'mercy', 0.03); say('I won\'t forget this.'); } },
          { label: '"I can\'t."', onPick: () => say('No. Nobody can, these days.') }
        ] });
      }
    },
    // ------------------------------------------------------------ the shopkeepers' eyes
    eyeScan(game) {
      const world = game.world, pe = game.pe, pl = game.pl;
      const s = ECHO.World.settlementAt(world, pe.x, pe.y, 26);
      if (!s || !ECHO.Law) return;
      const thefts = ECHO.Law.crimes(world).filter(c => c.by === 'player' && c.kind === 'theft' && c.sid === s.id && world.day - c.d < 30);
      const known = thefts.length > 0;
      for (const e of game.ents) {
        if (e.type !== 'person' || !e.npcId || e.dead) continue;
        const n = world.npcs[e.npcId];
        if (!n || n.loc !== s.id || (n.prof !== 'merchant' && n.prof !== 'innkeeper')) continue;
        e.eyeing = known;
      }
    },
    eye(game, e, npc, dt) {
      const pe = game.pe, world = game.world;
      const post = e.goal && !e.goal.inside ? e.goal : null;
      const d = U.dist(e.x, e.y, pe.x, pe.y);
      if (!post || d > 9 || pe.x >= 9000 || U.dist(pe.x, pe.y, post.x, post.y) > 12) { e.eyeOn = false; return false; }
      if (!e.eyeOn) { e.eyeOn = true; e.say = pick(['I\'ve got my eye on you.', 'Hands where I can see them.', 'Don\'t even think about it.', 'You. I know your face.']); e.sayT = 2.4; }
      // keep close, between you and the goods, but never far from the stall
      const a = Math.atan2(e.y - pe.y, e.x - pe.x);
      let tx = pe.x + Math.cos(a) * 2.4, ty = pe.y + Math.sin(a) * 2.4;
      const fp = U.dist(tx, ty, post.x, post.y);
      if (fp > 6) { tx = post.x + (tx - post.x) * 6 / fp; ty = post.y + (ty - post.y) * 6 / fp; }
      if (U.dist(e.x, e.y, tx, ty) > 0.6) ECHO.Ent.travel(world, e, tx, ty, e.speed * 0.7, dt);
      else { e.moving = false; e.dir = Math.atan2(pe.y - e.y, pe.x - e.x); e.flip = Math.cos(e.dir) < 0; }
      e.chore = !e.moving && Math.sin(game.time * 0.7 + e.id) > 0.6 ? 'point' : null;
      if (e.sayT <= 0 && Math.random() < dt * 0.05) { e.say = pick(['Still here, are you?', 'I count everything twice, you know.', 'Buying or thieving?', 'The watch is just round the corner.']); e.sayT = 2.2; }
      return true;
    },
    // ------------------------------------------------------------ each frame
    update(game, dt) {
      if (!game.pe || !game.world) return;
      if (Cl.active && (Cl.active.dead || !Cl.active.call)) Cl.active = null;
      Cl.t -= dt;
      if (Cl.t > 0) return;
      Cl.t = 2;
      Cl.scan(game);
      Cl.eyeScan(game);
    }
  };
})();
