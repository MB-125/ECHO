// Renown: what the world makes of you — not one number but seven, and none of them quite true.
//
//   Heroism      what you have done for others, at risk to yourself
//   Honour       whether you keep faith: the yielded spared, the truth told
//   Fear         how much your name frightens people (whatever you meant by it)
//   Reliability  whether a job given to you gets done
//   Influence    land, titles, and the ear of the powerful
//   Knowledge    what you have found out: places, histories, the ways of beasts
//   Infamy       the crimes and cruelties attached to your name
//
// Each group reads them its own way. The Crown wants a loyal, honourable name with some weight;
// the common folk want someone who helps and keeps their word; the Guild respects results; the
// Wardens of the Guard respect knowledge and honour; the underworld respects fear. What they think
// changes prices, the nerve of outlaws who face you, and who will work with you.
//
// And what is said is not always what happened. Rumours spread from your deeds — grown in the
// telling, or made up out of nothing — and you can let them stand or set the record straight.
//
// (Kept on you, made the first time it is needed; old saves start from what you have already done.)
(function () {
  const { U } = ECHO;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const DIMS = {
    hero: { name: 'Heroism', col: '#ffcf6a', word: 'the Brave' },
    honor: { name: 'Honour', col: '#9fd3ff', word: 'the True' },
    fear: { name: 'Fear', col: '#ff7a5a', word: 'the Dread' },
    reliable: { name: 'Reliability', col: '#8affb0', word: 'the Steadfast' },
    influence: { name: 'Influence', col: '#e0b0ff', word: 'the Lordly' },
    knowledge: { name: 'Knowledge', col: '#7ae8ff', word: 'the Learned' },
    infamy: { name: 'Infamy', col: '#c86a6a', word: 'the Black' }
  };
  const VIEWS = {
    crown: { name: 'The Crown', w: { influence: 0.6, honor: 0.4, hero: 0.3, infamy: -0.8 } },
    folk: { name: 'The common folk', w: { hero: 0.6, reliable: 0.5, honor: 0.2, fear: -0.3, infamy: -0.6 } },
    guild: { name: 'The Guild', w: { hero: 0.4, reliable: 0.4, knowledge: 0.2, fear: 0.2 } },
    wardens: { name: 'The Wardens', w: { knowledge: 0.4, honor: 0.4, hero: 0.3, infamy: -0.4 } },
    under: { name: 'The underworld', w: { infamy: 0.7, fear: 0.5, honor: -0.4 } }
  };
  // what is said of you, true or not
  const RUMOURS = {
    grown: [
      { t: (d, s) => `In ${s} they say you ${d} single-handed, with no one at your side and a broken blade.`, dims: { hero: 3, fear: 2 } },
      { t: (d, s) => `The tale in ${s} is that you ${d} — and that it took you less than an hour.`, dims: { hero: 2, fear: 2 } },
      { t: (d, s) => `Travellers in ${s} swear you ${d}, and walked away without a scratch.`, dims: { hero: 3 } }
    ],
    false: [
      { t: (d, s) => `In ${s} they whisper that you robbed a wayside shrine on the road. You never did.`, dims: { infamy: 4, honor: -3 } },
      { t: (d, s) => `Someone in ${s} is saying you took money to leave a village to the wolves. It is not true.`, dims: { infamy: 3, reliable: -3 } },
      { t: (d, s) => `They tell it in ${s} that you killed a man who had yielded. You did not.`, dims: { fear: 3, honor: -4, infamy: 2 } },
      { t: (d, s) => `In ${s} they say you paid for a widow's new roof out of your own purse. You never met her.`, dims: { hero: 2, honor: 2 } },
      { t: (d, s) => `The story in ${s} is that you are the lost heir of an old house. You are not.`, dims: { influence: 4 } },
      { t: (d, s) => `Children in ${s} play at being you, and say you can talk to wolves. You cannot.`, dims: { knowledge: 3, fear: 1 } }
    ]
  };

  const Rn = ECHO.Renown = {
    DIMS, VIEWS,
    // yours, made the first time (an old save starts from what you have already done)
    st(world, pl) {
      pl = pl || world.player;
      if (!pl) return null;
      if (pl.fame && pl.fame.d) return pl.fame;
      const d = {}; for (const k in DIMS) d[k] = 0;
      const F = pl.fame = { d, snap: null, log: [], rum: [], seq: 0 };
      // what you did before there was any of this
      d.hero = U.clamp((pl.renown || 0) * 0.25, 0, 60);
      d.reliable = U.clamp(world.plights.filter(p => (pl.accepted || []).includes(p.id) && p.status === 'done').length * 3, 0, 50);
      d.infamy = U.clamp(Object.values(pl.wanted || {}).reduce((a, b) => a + b, 0) * 0.2, 0, 50);
      d.fear = U.clamp(((pl.prowess && pl.prowess.kills) || 0) * 0.04, 0, 40);
      F.snap = Rn.counters(world, pl);
      return F;
    },
    counters(world, pl) {
      return { kills: (pl.prowess && pl.prowess.kills) || 0, wanted: Object.values(pl.wanted || {}).reduce((a, b) => a + b, 0), renown: pl.renown || 0 };
    },
    get(world, dim) { const F = Rn.st(world); return F ? F.d[dim] || 0 : 0; },
    add(world, dim, amt, why, quiet) {
      const F = Rn.st(world);
      if (!F || !DIMS[dim] || !amt) return;
      const before = F.d[dim];
      // the more you have, the slower it grows (and an infamous name sticks)
      const k = amt > 0 ? 1 - before / 140 : 1;
      F.d[dim] = U.clamp(before + amt * k, 0, 100);
      if (why) {
        F.log.push({ day: world.day, dim, amt: Math.round(amt * k * 10) / 10, why });
        if (F.log.length > 40) F.log.splice(0, F.log.length - 40);
      }
      // a step up worth knowing about
      const step = v => Math.floor(v / 20);
      if (!quiet && step(F.d[dim]) > step(before) && ECHO.UI && ECHO.Game && ECHO.Game.world === world) ECHO.UI.toast(`Your name grows: ${DIMS[dim].name} ${Math.round(F.d[dim])}. (K · Your name)`, 'gold', 5);
    },
    // what a group makes of you, −100 to 100
    view(world, k) {
      const F = Rn.st(world), V = VIEWS[k];
      if (!F || !V) return 0;
      let v = 0; for (const [dim, w] of Object.entries(V.w)) v += F.d[dim] * w;
      return U.clamp(Math.round(v), -100, 100);
    },
    viewWord(v) { return v >= 60 ? 'revere you' : v >= 30 ? 'think well of you' : v >= 10 ? 'know your name' : v > -10 ? 'hardly know you' : v > -30 ? 'mistrust you' : 'hate the sound of your name'; },
    // what the people call you, if anything
    epithet(world) {
      const F = Rn.st(world);
      if (!F) return null;
      const top = Object.entries(F.d).sort((a, b) => b[1] - a[1])[0];
      return top && top[1] >= 30 ? DIMS[top[0]].word : null;
    },
    // ------------------------------------------------------------ effects
    // shopkeepers: the common folk's view of you, a little either way
    priceMul(world) { return ECHO.Game && world === ECHO.Game.world && world.player ? 1 - U.clamp(Rn.view(world, 'folk'), -40, 60) / 800 : 1; },
    // outlaws who face you: the fear of your name eats at their nerve
    dread(world) { return U.clamp((Rn.get(world, 'fear') - 15) / 200, 0, 0.3); },

    // ------------------------------------------------------------ what you do
    // a deed the world hears of (Chronicle.deed)
    fromDeed(world, o) {
      if (!world.player) return;
      const r = o.rep || 0, imp = o.importance != null ? o.importance : 1, why = o.text ? String(o.text).slice(0, 120) : null;
      switch (o.tag) {
        case 'protect': Rn.add(world, 'hero', 1.5 + Math.max(0, r) * 0.25 + imp * 0.5, why); Rn.add(world, 'honor', 0.6, null, true); break;
        case 'brave': Rn.add(world, 'hero', 1.5 + imp * 0.5, why); Rn.add(world, 'fear', 0.8, null, true); break;
        case 'cruel': Rn.add(world, 'fear', 3, why); Rn.add(world, 'infamy', 2, null, true); Rn.add(world, 'honor', -2, null, true); break;
        case 'betray': Rn.add(world, 'infamy', 4, why); Rn.add(world, 'honor', -4, null, true); Rn.add(world, 'reliable', -2, null, true); break;
        case 'explore': Rn.add(world, 'knowledge', 1.5 + imp * 0.5, why); break;
        case 'ruler': case 'seat': Rn.add(world, 'influence', 2 + imp, why); break;
        default:
          if (r > 0) Rn.add(world, 'hero', Math.min(3, r * 0.15), why);
          else if (r < 0) Rn.add(world, 'infamy', Math.min(4, -r * 0.2), why);
      }
      if (imp >= 3) Rn.maybeRumour(world, o, 0.5);
    },
    // a plea you took on: seen through, or let go
    onPlight(world, p, how) {
      if (!world.player || !(world.player.accepted || []).includes(p.id)) return;
      if (how === 'done') { Rn.add(world, 'reliable', 3, `saw through what was asked in ${(ECHO.Sim.settlement(world, p.sid) || {}).name || 'a town'}`); Rn.maybeRumour(world, { text: p.outcome }, 0.15); }
      else if (how === 'failed') Rn.add(world, 'reliable', -4, `let down ${(ECHO.Sim.settlement(world, p.sid) || {}).name || 'a town'}: what you promised was not done`);
      else if (how === 'beaten') Rn.add(world, 'reliable', -1, 'someone from the Guild did what you had promised to do');
    },

    // ------------------------------------------------------------ every day
    dailyTick(world) {
      const pl = world.player;
      if (!pl || !pl.charId) return;
      const F = Rn.st(world), c = Rn.counters(world, pl), s0 = F.snap || c;
      // what the numbers say you did since yesterday
      const dk = c.kills - s0.kills, dw = c.wanted - s0.wanted, dr = c.renown - s0.renown;
      if (dk > 0) Rn.add(world, 'fear', Math.min(3, dk * 0.06), null, false);
      if (dw > 0) Rn.add(world, 'infamy', Math.min(6, dw * 0.12), 'the law wants you', false);
      if (dr > 0) Rn.add(world, 'hero', Math.min(4, dr * 0.12), null, false);
      F.snap = c;
      // what you hold
      const held = ECHO.Holding ? ECHO.Holding.mine(world, pl).length : 0;
      const inf = Math.min(80, held * 18 + (pl.knighted ? 15 : 0) + ((pl.guard && pl.guard.merit) || 0) * 0.5);
      if (F.d.influence < inf) F.d.influence = Math.min(100, F.d.influence + Math.min(2, inf - F.d.influence));
      // names fade if nothing new is told of them (infamy slowest of all)
      for (const k in F.d) F.d[k] = Math.max(0, F.d[k] * (k === 'infamy' ? 0.999 : 0.9975));
      // talk goes round
      const rng = new ECHO.RNG(ECHO.hashStr('rumour:' + world.seed + ':' + world.day));
      if (rng.chance(0.04) && Object.values(F.d).some(v => v > 8)) Rn.maybeRumour(world, null, 1, rng);
    },
    // a rumour about you: grown out of a deed, or made up out of nothing
    maybeRumour(world, o, chance, rng0) {
      const F = Rn.st(world), pl = world.player;
      if (!F) return;
      const rng = rng0 || new ECHO.RNG(ECHO.hashStr('rum:' + world.seed + ':' + world.day + ':' + (F.seq || 0)));
      if (!rng.chance(chance)) return;
      if (F.rum.filter(r => r.status === 'open').length >= 3) return;
      const towns = world.settlements.filter(s => s.faction !== 'ashfang');
      const s = towns.length ? towns[rng.int(0, towns.length - 1)] : null;
      const town = s ? s.name : 'the taverns';
      let deed = null;
      if (o && o.text) {
        const m = String(o.text).match(new RegExp('^' + (pl.first || '').replace(/[^\w]/g, '') + '\\s+' + (pl.last || '').replace(/[^\w]/g, '') + '\\s+(.+?)\\.?$'));
        if (m) deed = m[1];
      }
      const grown = deed && rng.chance(0.6);
      const pool = grown ? RUMOURS.grown : RUMOURS.false;
      const R = pool[rng.int(0, pool.length - 1)];
      const r = { id: 'rm' + (++F.seq), day: world.day, text: R.t(deed, town), true: !!grown, dims: R.dims, status: 'open', sid: s ? s.id : null };
      F.rum.push(r);
      if (F.rum.length > 20) F.rum.splice(0, F.rum.length - 20);
      for (const [k, v] of Object.entries(R.dims)) Rn.add(world, k, v, null, true);
      if (ECHO.UI && ECHO.Game && ECHO.Game.world === world) ECHO.UI.toast(`A story about you is going round ${town}${grown ? ' — grown in the telling' : ''}. (K · Your name: let it stand, or set the record straight.)`, 'info', 6);
    },
    // you answer a rumour
    answer(world, id, correct) {
      const F = Rn.st(world), r = F && F.rum.find(x => x.id === id);
      if (!r || r.status !== 'open') return;
      r.status = correct ? 'corrected' : 'stood';
      if (correct) {
        // the truth told costs you the flattering lie, and wins you a name for honesty
        for (const [k, v] of Object.entries(r.dims)) Rn.add(world, k, -v * 0.8, null, true);
        Rn.add(world, 'honor', 2, 'set the record straight about a story told of you');
        Rn.add(world, 'reliable', 0.5, null, true);
      } else {
        const flattering = Object.entries(r.dims).every(([k, v]) => (k === 'infamy' ? -v : v) >= 0);
        if (flattering) Rn.add(world, 'honor', -1, 'let a flattering story about you stand');
        else Rn.add(world, 'fear', 1, 'let an ugly story about you stand', true);
      }
    },
    // ------------------------------------------------------------ talking about it
    dialogue(world, npc, ent, pl, ui) {
      if (!npc || npc.prof === 'child' || !pl.fame) return;
      ui.add('What do people say about me?', () => {
        const F = Rn.st(world), ep = Rn.epithet(world), folk = Rn.view(world, 'folk');
        const r = F.rum.slice().reverse().find(x => x.status !== 'corrected');
        const top = Object.entries(F.d).sort((a, b) => b[1] - a[1]).filter(e => e[1] >= 10).map(e => DIMS[e[0]].name.toLowerCase());
        const sez = folk >= 30 ? `"Good things, mostly."` : folk <= -20 ? `${npc.first} looks at the ground. "Nothing I'd want to repeat."` : `"Not much yet."`;
        ui.say(`${sez}${ep ? ` "Some call you ${pl.first} ${ep}."` : ''}${top.length ? ` "Folk speak of your ${U.listJoin(top.slice(0, 2))}."` : ''}${r ? `\n\n"I heard something, too." ${r.text}` : ''}`);
      });
    },
    // ------------------------------------------------------------ the page
    html(game) {
      const world = game.world, pl = game.pl, F = Rn.st(world);
      if (!F) return '';
      const ep = Rn.epithet(world);
      const bar = (k) => { const D = DIMS[k], v = Math.round(F.d[k]); return `<div class="rn-dim"><span class="n">${D.name}</span><div class="t"><div style="width:${v}%;background:${D.col}"></div></div><span class="v">${v}</span></div>`; };
      const views = Object.keys(VIEWS).map(k => { const v = Rn.view(world, k); return `<div class="rn-view"><b>${VIEWS[k].name}</b><span class="${v >= 10 ? 'gold' : v <= -10 ? 'ember' : 'dim'}">${v > 0 ? '+' : ''}${v}</span><span class="dim">${Rn.viewWord(v)}</span></div>`; }).join('');
      const open = F.rum.filter(r => r.status === 'open'), past = F.rum.filter(r => r.status !== 'open').slice(-6).reverse();
      const pm = Rn.priceMul(world), dr = Rn.dread(world);
      return `<div class="rn"><p class="prose">${ep ? `People have started to call you <b class="gold">${esc(pl.first)} ${esc(ep)}</b>. ` : ''}What the world makes of you is never one thing, and never quite true. It is made of what you do — and of what is said.</p>
        <div class="rn-dims">${Object.keys(DIMS).map(bar).join('')}</div>
        <h3 class="gold">How they see you</h3><div class="rn-views">${views}</div>
        <p class="dim" style="font-size:13px">Shopkeepers charge you ${pm < 1 ? Math.round((1 - pm) * 100) + '% less' : pm > 1 ? Math.round((pm - 1) * 100) + '% more' : 'the usual'} for what the common folk think of you${dr > 0 ? `; outlaws who face you lose their nerve sooner (your name is feared)` : ''}. The Guild's view decides how its people treat you.</p>
        <h3 class="gold">What is being said</h3>
        ${open.length ? open.map(r => `<div class="card rn-rum"><div>${esc(r.text)}</div><div class="dim" style="font-size:12px">${r.true ? 'There is some truth in it.' : 'There is no truth in it.'}</div><div class="row"><button class="small" data-rum="${r.id}" data-ok="0">Let it stand</button><button class="small" data-rum="${r.id}" data-ok="1">Set the record straight</button></div></div>`).join('') : '<p class="dim">Nothing new going round about you.</p>'}
        ${past.length ? `<div class="dim" style="font-size:13px">${past.map(r => `· ${esc(r.text)} <i>(${r.status === 'corrected' ? 'you set it straight' : 'you let it stand'})</i>`).join('<br>')}</div>` : ''}
        <h3 class="gold">Lately</h3><div class="dim" style="font-size:13px">${F.log.slice(-10).reverse().map(e => `<span style="color:${DIMS[e.dim].col}">${e.amt > 0 ? '▲' : '▼'} ${DIMS[e.dim].name}</span> — ${esc(e.why)}`).join('<br>') || 'Nothing yet.'}</div></div>`;
    },
    bind(body, game, render) {
      body.querySelectorAll('button[data-rum]').forEach(b => b.addEventListener('click', () => { Rn.answer(game.world, b.dataset.rum, b.dataset.ok === '1'); render(); }));
    },
    sheetHtml(game) {
      const world = game.world, F = Rn.st(world);
      if (!F) return '';
      const ep = Rn.epithet(world), top = Object.entries(F.d).sort((a, b) => b[1] - a[1]).slice(0, 3).filter(e => e[1] >= 1);
      const open = F.rum.filter(r => r.status === 'open').length;
      return `<h3 class="gold">Your name</h3><div class="dim">${ep ? `Called ${esc(game.pl.first)} ${esc(ep)}. ` : ''}${top.map(([k, v]) => `${DIMS[k].name} ${Math.round(v)}`).join(' · ') || 'Hardly known yet.'}${open ? ` · <span class="gold">${open} ${open === 1 ? 'story' : 'stories'} going round about you</span>` : ''}</div><div class="row" style="margin-top:6px"><button class="small" data-rnpage="name">Your name…</button>${ECHO.Guild ? '<button class="small" data-rnpage="guild">The Guild…</button>' : ''}</div>`;
    },
    // its own page, from the character sheet
    open(game) {
      const body = ECHO.UI.openPanel('Your name', '', 'name');
      const render = () => { body.innerHTML = Rn.html(game); Rn.bind(body, game, render); };
      render();
    }
  };
})();
