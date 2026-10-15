// Old companions: sending word to the people you once shared the road with.
//
// Everyone who ever fought beside you and parted ways alive can be reached by
// a runner (a few crowns, from anywhere). Ask them to come back and fight at
// your side, to send what supplies they can spare, or just send your regards.
// The runner takes time to find them — longer the further they are — and so
// does their answer. Whether they come depends on how they feel about you,
// the bond you built, and how they are: someone below ground in a dungeon
// answers when they come up; someone hurt can't come but sends what they can.
// If they come, they find you wherever you are and ride with you again, free.
(function () {
  const { U } = ECHO;
  const P = () => ECHO.People;
  const C = () => ECHO.Companions;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const DAY = 1440, RUNNER = 70, RIDE = 90;   // leagues a day: a runner, a friend on the way to you
  const COST = 3;

  const F = ECHO.Fellow = {
    now(world) { return world.day * DAY + world.minute; },
    calls(pl) { return (pl.calls = pl.calls || []); },
    // Everyone who rode with you and parted alive.
    former(world, pl) {
      return Object.values(world.npcs).filter(n => n.comp && n.comp.since != null && n.id !== pl.companion && n.status !== 'dead' && !(pl.fallen || []).some(f => f.id === n.id))
        .sort((a, b) => (b.comp.bond || 0) - (a.comp.bond || 0));
    },
    // Where they are now, for the runner and for you.
    where(world, n) {
      if (n.delving) { const s = ECHO.Explore.byId(world, n.delving.site); return s ? { x: s.x, y: s.y, text: `below ground in ${s.name}`, delving: true } : null; }
      if (n.status === 'captive') return { x: null, y: null, text: 'held captive', captive: true };
      const t = ECHO.Sim.settlement(world, n.loc || n.home);
      return t ? { x: t.x, y: t.y, text: n.loc ? `in ${t.name}` : `on the road (home is ${t.name})` } : { x: null, y: null, text: 'somewhere on the road' };
    },
    pending(pl, n) { return F.calls(pl).find(c => c.to === n.id && c.state !== 'done'); },
    // How they feel about you: opinion, and the bond you built on the road.
    regard(n, pl) { return ((n.op && n.op[pl.charId]) || 0) + ((n.comp && n.comp.bond) || 0) * 0.6; },
    KINDS: {
      rejoin: { label: 'Come back and fight beside me', sub: 'They ride to find you, and travel with you again — free.' },
      supplies: { label: 'Send what supplies you can spare', sub: 'Herbs, food, arrows, a few coins — whatever they have.' },
      word: { label: 'Just send my regards', sub: 'A few lines to keep the friendship warm.' }
    },

    send(game, n, kind) {
      const world = game.world, pl = game.pl, pe = game.pe;
      if (!n || n.status === 'dead') return 'They are gone.';
      if (F.pending(pl, n)) return `You are already waiting to hear from ${n.first}.`;
      if (pl.gold < COST) return `A runner wants ${COST} crowns.`;
      pl.gold -= COST;
      const w = F.where(world, n), here = ECHO.Interior && ECHO.Interior.cur ? ECHO.Interior.cur.outside || pe : pe;
      const d = w && w.x != null ? U.dist(here.x, here.y, w.x, w.y) : 60;
      const arrive = F.now(world) + Math.round(120 + d / RUNNER * DAY);
      F.calls(pl).push({ id: 'cl' + Date.now().toString(36) + Math.floor(Math.random() * 99), to: n.id, kind, sent: F.now(world), arrive, state: 'out' });
      return null;
    },
    hoursTo(world, c) { return Math.max(0, Math.round((c.arrive - F.now(world)) / 60)); },

    // Every frame (cheap): runners arriving, answers coming back, friends turning up.
    tick(game) {
      const world = game.world, pl = game.pl;
      if (!world || !pl || game.defeating || pl.capture) return;
      const now = F.now(world);
      for (const c of F.calls(pl)) {
        if (c.state === 'done' || now < c.arrive) continue;
        const n = world.npcs[c.to];
        if (!n || n.status === 'dead') { c.state = 'done'; F.letter(world, pl, null, `Your runner came back with bad news`, `${pl.first},\n\nI went looking, but ${n ? n.first + ' ' + n.last + ' is dead' : 'they are gone'}. I'm sorry.\n\n— the runner`, 'grief'); continue; }
        if (c.state === 'out') F.answer(game, n, c);
        else if (c.state === 'coming') F.arrive(game, n, c);
      }
      // keep the list short
      if (F.calls(pl).length > 30) pl.calls = F.calls(pl).filter(c => c.state !== 'done').concat(F.calls(pl).filter(c => c.state === 'done').slice(-10));
    },
    // They have your message.
    answer(game, n, c) {
      const world = game.world, pl = game.pl, pe = game.pe, now = F.now(world);
      const reg = F.regard(n, pl), name = n.first, sig = `\n\n— ${n.first} ${n.last}`;
      // below ground: the message waits for them
      if (n.delving) { c.arrive = Math.max(now + 120, (n.delving.back + 1) * DAY + 480); return; }
      if (n.status === 'captive' || n.jailUntil > world.day) { c.state = 'done'; return F.letter(world, pl, n, `No word from ${name}`, `${pl.first},\n\nYour runner couldn't reach ${name} — word is ${n.sex === 'f' ? 'she' : 'he'} is being held${n.status === 'captive' ? ' by outlaws' : ' in the cells'}. If you want ${n.sex === 'f' ? 'her' : 'him'} back, you'll have to go yourself.`, 'plea'); }
      n.op = n.op || {};
      if (c.kind === 'word') {
        n.op[pl.charId] = (n.op[pl.charId] || 0) + 5; if (n.comp) n.comp.bond = Math.min(100, (n.comp.bond || 0) + 3);
        c.state = 'done';
        return F.letter(world, pl, n, `A letter back from ${name}`, `${pl.first},\n\n${reg > 30 ? 'It was good to hear from you. I think of the road we shared more than you\'d guess.' : 'Thank you for the letter. It\'s been a while.'} ${F.news(world, n)}${reg > 20 ? ' If you ever need me, send word.' : ''}${sig}`, 'joy');
      }
      if (c.kind === 'supplies') {
        c.state = 'done';
        if (reg < -10) return F.letter(world, pl, n, `${name} sends nothing`, `${pl.first},\n\nYou have a nerve.${sig}`, 'threat');
        const give = Math.max(0.3, Math.min(1.4, 0.5 + reg / 80));
        const herbs = Math.max(1, Math.round((1 + Math.random() * 3) * give)), food = Math.max(1, Math.round((2 + Math.random() * 3) * give)), arrows = Math.round((8 + Math.random() * 12) * give);
        const coin = Math.min(Math.round((n.wealth || 0) * 0.2 * give), 60);
        pl.inv.herbs = (pl.inv.herbs || 0) + herbs; pl.inv.food = (pl.inv.food || 0) + food; pl.inv.arrows = (pl.inv.arrows || 0) + arrows;
        if (coin > 0) { n.wealth -= coin; pl.gold += coin; }
        ECHO.UI.toast(`A runner finds you with a bundle from ${name}: ${herbs} herbs, ${food} food, ${arrows} arrows${coin ? `, ${coin} crowns` : ''}.`, 'mercy', 6);
        if (ECHO.Sfx) ECHO.Sfx.play('coin');
        return F.letter(world, pl, n, `A bundle from ${name}`, `${pl.first},\n\nIt's not much — ${herbs} bundles of herbs, some food, a sheaf of arrows${coin ? ` and ${coin} crowns` : ''}. Use it well and come back in one piece.${sig}`, 'joy');
      }
      // come back
      const hurt = n.hurtUntil > world.day;
      const willing = reg >= 12 || (n.comp && n.comp.bond >= 25);
      if (!willing) { c.state = 'done'; return F.letter(world, pl, n, `${name} won't come`, `${pl.first},\n\n${reg < -10 ? 'After how things ended? No.' : 'I have a life here now, and I can\'t leave it. I hope you understand.'}${sig}`, reg < -10 ? 'threat' : 'grief'); }
      if (hurt) { c.state = 'done'; return F.letter(world, pl, n, `${name} is laid up`, `${pl.first},\n\nI'd come if I could stand. I took a beating below ground and I'm still mending. Ask me again in a few days.${sig}`, 'grief'); }
      if (pl.companion && world.npcs[pl.companion] && world.npcs[pl.companion].id !== n.id) { c.state = 'done'; return F.letter(world, pl, n, `${name} would come`, `${pl.first},\n\nI hear someone already rides at your side. Part ways with them, send word again, and I'll come.${sig}`, 'joy'); }
      // on the way
      const w = F.where(world, n);
      const here = ECHO.Interior && ECHO.Interior.cur ? ECHO.Interior.cur.outside || pe : pe;
      const d = w && w.x != null ? U.dist(here.x, here.y, w.x, w.y) : 40;
      c.state = 'coming'; c.arrive = now + Math.round(60 + d / RIDE * DAY);
      n.loc = null; n.journey = 'to-you';
      const hrs = Math.max(1, Math.round((c.arrive - now) / 60));
      ECHO.UI.toast(`${name} has your message — and is on the way to you. (about ${hrs} hour${hrs > 1 ? 's' : ''})`, 'mercy', 6);
      F.letter(world, pl, n, `${name} is coming`, `${pl.first},\n\nSay no more. I'm packing now. I'll find you — wherever you are.${sig}`, 'joy');
    },
    // They have found you.
    arrive(game, n, c) {
      const world = game.world, pl = game.pl;
      if (ECHO.Interior && ECHO.Interior.cur) return;   // they wait at the door
      if (pl.companion && world.npcs[pl.companion] && pl.companion !== n.id) { c.state = 'done'; n.loc = n.home; n.journey = null; ECHO.UI.toast(`${n.first} found you riding with someone else, and turned back home.`, 'info', 5); return; }
      c.state = 'done';
      pl.companion = n.id; n.loc = null; n.journey = 'companion';
      const s = C().st(n); s.since = s.since == null ? world.day : s.since; s.bond = Math.min(100, (s.bond || 0) + 5); s.back = world.day;
      for (const e of game.ents) if (e.npcId === n.id && !e.isCompanion) { e.dead = true; e.vanish = true; }
      P().remember(world, n, `answered ${pl.first} ${pl.last}'s call and took up the road again`, 'change', null, 3);
      ECHO.UI.banner(`${n.first} has found you`, `${n.first} ${n.last} · level ${s.lv} · back at your side`, true);
      ECHO.UI.toast(`"${['Did you think I wouldn\'t come?', 'Miss me?', 'Right. Where are we going?', 'I came as fast as I could.'][Math.floor(Math.random() * 4)]}" — ${n.first}`, 'mercy', 5);
      if (ECHO.Sfx) ECHO.Sfx.play('neigh', { vol: 0.5 });
    },
    // A line of their news for a letter.
    news(world, n) {
      const w = n.delves ? `I've been down into the dungeons ${n.delves === 1 ? 'once' : n.delves + ' times'} since we parted, and I'm stronger for it.` : '';
      const t = ECHO.Sim.settlement(world, n.loc || n.home);
      return w || (t ? `Things are ${t.prosperity > 60 ? 'good' : t.prosperity < 35 ? 'hard' : 'quiet'} in ${t.name}.` : '');
    },
    // Their answer, waiting for you in your letters.
    letter(world, pl, n, title, text, kind) {
      const l = ECHO.Letters && ECHO.Letters.add(world, { from: n ? n.id : null, fromName: n ? `${n.first} ${n.last}` : 'A runner', kind, title, text, key: null });
      if (l) l.delivered = true;   // a runner brings it straight to you
      if (l) ECHO.UI.toast(`✉ ${title}. (Journal → Letters)`, 'info', 5);
      return l;
    },

    // ------------------------------------------------------------ the page
    html(game) {
      const world = game.world, pl = game.pl, list = F.former(world, pl);
      if (!list.length) return '';
      const K = ECHO.Companions.CLASSES || {};
      return `<h3 class="gold">Old companions</h3><p class="dim" style="font-size:13px">The people who once rode with you. Send a runner (${COST} crowns, from anywhere) to ask for help.</p><div class="list">${list.map(n => {
        const s = n.comp, w = F.where(world, n), c = F.pending(pl, n), reg = F.regard(n, pl);
        const feel = reg >= 50 ? 'close' : reg >= 25 ? 'warm' : reg >= 10 ? 'friendly' : reg >= -10 ? 'distant' : 'bitter';
        const status = c ? (c.state === 'coming' ? `<span class="gold">on the way to you — about ${F.hoursTo(world, c)} h</span>` : `<span class="dim">a runner is out — answer in about ${F.hoursTo(world, c)} h</span>`) : '';
        return `<div class="card"><h4>${(K[s.cls] || {}).icon || '⚔'} ${esc(n.first)} ${esc(n.last)} <span class="dim">· level ${s.lv} ${esc(((K[s.cls] || {}).name || s.cls).toLowerCase())}</span></h4><div class="dim" style="font-size:13px">${esc(w ? w.text : '')} · ${feel} · ${s.kills || 0} foes slain together</div>${status ? `<div style="font-size:13px">${status}</div>` : ''}${c ? '' : `<div class="row"><button class="small" data-callfriend="${n.id}">Send word…</button></div>`}</div>`;
      }).join('')}</div>`;
    },
    bind(root, game) {
      root.querySelectorAll('button[data-callfriend]').forEach(b => b.addEventListener('click', () => F.ask(game, game.world.npcs[b.dataset.callfriend])));
    },
    ask(game, n) {
      if (!n) return;
      const world = game.world, pl = game.pl, w = F.where(world, n);
      const here = ECHO.Interior && ECHO.Interior.cur ? ECHO.Interior.cur.outside || game.pe : game.pe;
      const d = w && w.x != null ? Math.round(U.dist(here.x, here.y, w.x, w.y)) : null;
      const hrs = Math.round((120 + (d || 60) / RUNNER * DAY) / 60);
      const go = kind => { const why = F.send(game, n, kind); if (why) ECHO.UI.toast(why, 'warn', 3); else ECHO.UI.toast(`A runner sets off to find ${n.first}${d != null ? ` — ${d} leagues away` : ''}. Expect an answer in about ${hrs} hours.`, 'info', 5); ECHO.UI.openCharacter(); };
      ECHO.UI.modal({ title: `Send word to ${n.first} ${n.last}`, html: `<p>${esc(n.first)} is ${esc(w ? w.text : 'somewhere')}${d != null ? `, ${d} leagues away` : ''}. A runner costs ${COST} crowns; an answer comes in about ${hrs} hours.</p><p class="dim">Whether ${n.sex === 'f' ? 'she' : 'he'} comes depends on how ${n.sex === 'f' ? 'she' : 'he'} feels about you and the bond you built on the road.</p>`,
        choices: Object.entries(F.KINDS).map(([k, v]) => ({ label: v.label, sub: v.sub, disabled: pl.gold < COST, onPick: () => go(k) })).concat([{ label: 'Not now', onPick: () => ECHO.UI.openCharacter() }]) });
    }
  };
})();
