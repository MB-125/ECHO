// In-game interface: HUD, panels, dialogue, trade, journal, map, modals.
(function () {
  const { U } = ECHO;
  const T = ECHO.TIME;
  const P = () => ECHO.People;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const UI = ECHO.UI = {
    settings: { zoom: 0 },
    panelOpen: false, modalOpen: false, screenOpen: false, pauseOpen: false,
    mapDirty: true, miniT: 0, toastsEl: null, bossEnt: null, panelKind: null,

    init() {
      UI.toastsEl = $('#toasts');
      $('#panel .close').addEventListener('click', () => UI.closePanel());
      try { const s = JSON.parse(localStorage.getItem('echo.settings') || '{}'); Object.assign(UI.settings, s); } catch (e) { /* ignore */ }
    },
    paused() { return UI.panelOpen || UI.modalOpen || UI.screenOpen || UI.pauseOpen || !!(ECHO.Game.ff) || !!ECHO.Game.defeating; },
    blocksWorld() { return UI.paused(); },
    enterGame() {
      UI.screenOpen = false; $('#screen').classList.add('hidden');
      $('#hud').classList.remove('hidden');
      UI.closePanel(); UI.mapDirty = true; UI.miniBase = null;
      UI.fadeIn();
    },
    error(err) { const el = $('#err'); el.classList.remove('hidden'); el.textContent = String(err && err.stack || err).slice(0, 800); setTimeout(() => el.classList.add('hidden'), 8000); },

    // ------------------------------------------------------------ Per-frame
    frame(game, dt) {
      const In = ECHO.Input;
      if (UI.screenOpen) return;
      // Escape closes things, or opens the pause menu
      if (In.pressed.has('Escape')) {
        if (UI.panelOpen) UI.closePanel();
        else if (UI.pauseOpen) ECHO.Screens.closePause();
        else if (!UI.modalOpen && !game.ff && game.pl) ECHO.Screens.openPause();
      }
      if (!game.pl) return;
      if (!UI.paused()) {
        if (In.pressed.has('e') && game._interact) game.interact(game._interact);
        if (In.pressed.has('Tab')) UI.openJournal();
        if (In.pressed.has('j')) UI.openJournal('guide');
        if (In.pressed.has('m')) UI.openMap();
        if (In.pressed.has('c') && !In.down.has('Control')) { /* c also sneaks; character sheet on K */ }
        if (In.pressed.has('k')) UI.openCharacter();
        if (In.pressed.has('F1') || In.pressed.has('/') || In.pressed.has('?')) UI.toggleHelp();
      } else if (UI.panelOpen) {
        if ((In.pressed.has('Tab') || In.pressed.has('j')) && UI.panelKind === 'journal') UI.closePanel();
        else if (In.pressed.has('m') && UI.panelKind === 'map') UI.closePanel();
        else if (In.pressed.has('k') && UI.panelKind === 'char') UI.closePanel();
      }
      UI.hud(game, dt);
    },
    // The controls card: shown until the player hides it (F1), remembered.
    toggleHelp(force) {
      UI.settings.hideHelp = force != null ? !force : !UI.settings.hideHelp;
      try { localStorage.setItem('echo.settings', JSON.stringify(UI.settings)); } catch (e) { /* ignore */ }
      UI.applyHelp();
    },
    applyHelp() {
      const hide = !!UI.settings.hideHelp;
      $('#hud-help').classList.toggle('hidden', hide);
      $('#hud-help-tab').classList.toggle('hidden', !hide);
      $('#hud-keys').classList.toggle('hidden', !hide);
    },
    hud(game, dt) {
      const pl = game.pl, world = game.world;
      const set = (sel, v) => { const el = $(sel); if (el && el.textContent !== v) el.textContent = v; };
      if (!UI.helpApplied) { UI.helpApplied = true; UI.applyHelp(); }
      const fighting = game.combatT != null && game.time - game.combatT < 4;
      if (fighting !== UI.wasFighting) { UI.wasFighting = fighting; $('#hud').classList.toggle('fighting', fighting); }
      set('#hud-hero', pl.first + ' ' + pl.last);
      const hon = pl.honor || (ECHO.Ambition && ECHO.Ambition.honor(pl));
      set('#hud-title', hon ? `${hon} · ${ECHO.Character.title(pl)}` : ECHO.Character.title(pl));
      $('#hud-left .hp .fill').style.transform = `scaleX(${U.clamp(pl.hp / pl.maxHp, 0, 1)})`;
      set('#hud-left .hp span', Math.ceil(pl.hp) + ' / ' + Math.round(pl.maxHp));
      $('#hud-left .sta .fill').style.transform = `scaleX(${U.clamp(pl.stamina / pl.maxSta, 0, 1)})`;
      $('#hud-left .mana .fill').style.transform = `scaleX(${U.clamp(pl.mana / pl.maxMana, 0, 1)})`;
      set('#hud-fate', 'Fate ' + '◆'.repeat(Math.max(0, pl.fate)) + '◇'.repeat(Math.max(0, 3 - pl.fate)));
      const th = ECHO.Tech.hud();
      if (UI._th !== th) { UI._th = th; $('#hud-tech').innerHTML = th; }
      const wanted = Object.entries(pl.wanted || {}).filter(([, v]) => v > 20).map(([f]) => world.factions[f].short);
      const ban = Object.entries(pl.banished || {}).filter(([, d]) => d > world.day).map(([f]) => world.factions[f] ? world.factions[f].short : f);
      set('#hud-wanted', [wanted.length ? 'Wanted by ' + wanted.join(', ') : '', ban.length ? 'Banished from ' + ban.join(', ') : '', pl.sick ? 'Sick: ' + pl.sick.name : ''].filter(Boolean).join(' · '));
      set('#hud-time', T.clock(world.minute));
      const wx = ECHO.Weather ? ECHO.Weather.here(world, pl.x, pl.y) : null;
      set('#hud-date', T.fmtDate(world.day) + (wx && !ECHO.Interior.cur ? ' · ' + ECHO.Weather.word(wx) : ''));
      const s = game.currentSid ? ECHO.Sim.settlement(world, game.currentSid) : null;
      const reg = game.currentRegion;
      set('#hud-place', s ? `${s.name} · ${reg ? U.cap(reg.name) : ''}` : (reg ? U.cap(reg.name) : ''));
      const w = world.items[pl.weapon];
      const inv = `<span>${w ? esc(w.name) : 'Bare hands'}</span><span>Arrows <b>${pl.inv.arrows}</b></span><span>Food <b>${pl.inv.food + (pl.inv.meat || 0)}</b></span><span>Herbs <b>${pl.inv.herbs}</b></span>${Object.entries(ECHO.Gear.POTIONS).filter(([id]) => (pl.potions || {})[id] > 0).map(([id, P0]) => `<span style="color:${P0.color}">${P0.key}·${P0.short} <b>${pl.potions[id]}</b></span>`).join('')}${Object.entries(pl.buffs || {}).filter(([, v]) => v > 0).map(([k, v]) => `<span style="color:${ECHO.Gear.POTIONS[k].color}">✦${ECHO.Gear.POTIONS[k].short} ${Math.ceil(v)}s</span>`).join('')}<span>Crowns <b>${Math.floor(pl.gold)}</b></span>${pl.companion && world.npcs[pl.companion] ? `<span>With <b>${esc(world.npcs[pl.companion].first)}</b></span>` : ''}${pl.inv.starshard ? `<span style="color:#bfe8ff">✦ <b>${pl.inv.starshard}</b></span>` : ''}${ECHO.Letters && ECHO.Letters.unread(world).length ? `<span class="gold">✉ <b>${ECHO.Letters.unread(world).length}</b> (J)</span>` : ''}`;
      if (UI._inv !== inv) { $('#hud-inv').innerHTML = inv; UI._inv = inv; }
      if (UI.bossEnt) {
        const e = UI.bossEnt;
        if (e.dead) UI.bossBar(null);
        else $('#bossbar .fill').style.transform = `scaleX(${U.clamp(e.hp / e.maxHp, 0, 1)})`;
      }
      UI.miniT -= dt;
      if (UI.miniT <= 0) { UI.miniT = 0.4; UI.minimap(game); }
    },
    minimap(game) { ECHO.WorldMap.mini(game, $('#minimap')); },

    // ------------------------------------------------------------ Toasts & banners
    toast(text, kind = 'info', secs = 4) {
      if (!UI.toastsEl) return;
      const el = document.createElement('div');
      el.className = 'toast ' + kind;
      el.textContent = text;
      UI.toastsEl.prepend(el);
      while (UI.toastsEl.children.length > 6) UI.toastsEl.lastChild.remove();
      setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 700); }, secs * 1000);
    },
    banner(title, sub, small) {
      const b = $('#banner');
      b.className = small ? 'small' : '';
      b.innerHTML = `<div class="t">${esc(title)}</div>${sub ? `<div class="s">${esc(sub)}</div>` : ''}`;
      requestAnimationFrame(() => b.classList.add('show'));
      clearTimeout(UI._bt);
      UI._bt = setTimeout(() => b.classList.remove('show'), 2600);
    },
    bossBar(e) {
      UI.bossEnt = e;
      const bb = $('#bossbar');
      if (!e) { bb.classList.add('hidden'); return; }
      bb.classList.remove('hidden');
      const L = ECHO.Prowess ? ECHO.Prowess.foeLevel(e) : 0, D = ECHO.Prowess && ECHO.Prowess.diff(L, ECHO.Prowess.level(ECHO.Game.pl));
      $('#bossbar .name').innerHTML = `${esc(e.boss ? `${e.boss.name} ${e.boss.title}` : U.cap(e.label || 'a lord of the deep'))}${L ? ` <span style="color:${D.color}">· Lv ${L} ${e.type === 'boss' ? 'Great beast' : 'Lord'} ${'☠'.repeat(D.skulls)}</span>` : ''}`;
    },
    onNewDay(world) {
      const d = T.dateOf(world.day);
      if (d.dayOfSeason === 1) UI.banner(d.season, `Year ${d.year}`, true);
      const F = ECHO.Festivals;
      if (F) {
        const t = F.today(world), tm = F.onDay(world.day + 1);
        if (t) { UI.banner(t.title, 'Every town that can afford it celebrates in the square from four o\'clock'); ECHO.Music.stinger('festival'); }
        else if (tm) UI.toast(`Tomorrow is ${tm.name} — ${tm.desc}. The towns will celebrate from four in the afternoon.`, 'legend', 7);
      }
    },
    // Toast the most important news the player witnesses, as it happens.
    onChronicle(e) {
      const g = ECHO.Game;
      if (!g.pl || UI.screenOpen || g.ff) return;
      if (!(g.pl.known || []).includes(e.id)) return;
      if (e.char === g.pl.charId && e.kind !== 'player') return;
      if (e.imp >= 2) UI.toast(e.text, e.kind === 'intel' ? 'intel' : e.kind === 'era' ? 'world' : 'rumor', 6);
    },

    // ------------------------------------------------------------ Fade, modal, panel
    fadeOut(cb, ms = 900) {
      const f = $('#fade');
      f.style.transitionDuration = (ms / 1000) + 's';
      f.classList.add('on');
      setTimeout(() => { if (cb) cb(); }, ms);
    },
    fadeIn(ms) { const f = $('#fade'); f.style.transitionDuration = ms ? (ms / 1000) + 's' : ''; f.classList.remove('on'); },
    modal(o) {
      UI.fadeIn();
      UI.modalOpen = true;
      ECHO.Input.clear();
      $('#modal').classList.remove('hidden');
      $('#modal h2').textContent = o.title;
      $('#modal .modal-body').innerHTML = o.html || '';
      const ch = $('#modal .modal-choices');
      ch.innerHTML = '';
      for (const c of o.choices || []) {
        const b = document.createElement('button');
        b.innerHTML = esc(c.label) + (c.sub ? `<small>${esc(c.sub)}</small>` : '');
        b.disabled = !!c.disabled;
        b.addEventListener('click', () => { UI.closeModal(); c.onPick && c.onPick(); });
        ch.appendChild(b);
      }
    },
    closeModal() { UI.modalOpen = false; $('#modal').classList.add('hidden'); },
    openPanel(title, html, kind) {
      UI.panelOpen = true; UI.panelKind = kind || null;
      ECHO.Input.clear();
      $('#panel').classList.remove('hidden');
      $('#panel .panel-inner').classList.toggle('wide', kind === 'map');
      $('#panel h2').textContent = title;
      const body = $('#panel .panel-body');
      body.innerHTML = html;
      body.scrollTop = 0;
      return body;
    },
    closePanel() { UI.panelOpen = false; UI.panelKind = null; $('#panel').classList.add('hidden'); ECHO.Input.clear(); },
    eventsDigest(events, title) {
      const big = events.filter(e => e.imp >= 2).slice(-12);
      if (!big.length) return '';
      const g = ECHO.Game;
      if (g.pl) for (const e of events) if (e.imp >= 2) ECHO.Chronicle.learn(g.world, e, false);
      return `<div class="digest"><h4>${esc(title)} — what the world did without you</h4><ul>${big.map(e => `<li><span class="faint">${T.fmtShort(e.d)}</span> ${esc(e.text)}</li>`).join('')}</ul>${events.length > big.length ? `<div class="faint" style="font-size:13px;margin-top:6px">…and ${events.length - big.length} smaller happenings. The archives keep the full record.</div>` : ''}</div>`;
    },
    showFastForward(ff) {
      const el = $('#ff');
      el.classList.remove('hidden');
      $('#ff h3').textContent = ff.title || 'Time passes…';
      $('#ff .ff-date').textContent = T.fmtDate(ECHO.Game.world.day);
      $('#ff .ff-fill').style.width = (ff.done / ff.days * 100) + '%';
      const log = $('#ff .ff-log');
      const recent = ECHO.Game.world.chronicle.slice(ff.startChron).filter(e => e.imp >= 1).slice(-7).reverse();
      const html = recent.map(e => `<li>${esc(e.text)}</li>`).join('');
      if (log._h !== html) { log.innerHTML = html; log._h = html; }
    },
    hideFastForward() { $('#ff').classList.add('hidden'); },

    // ------------------------------------------------------------ Dialogue
    portrait(npcEnt, npc) {
      const c = document.createElement('canvas');
      c.width = 120; c.height = 140; c.className = 'portrait';
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.fillStyle = '#0f0c09'; g.fillRect(0, 0, 120, 140);
      g.setTransform(5, 0, 0, 5, 60, 130);
      ECHO.Sprites.person(g, { ...npcEnt, moving: false, flip: false, attackT: 0, sleeping: false, yielded: false }, npc, ECHO.Game.world, 0);
      return c;
    },
    openDialogue(ent) {
      if (ECHO.Tutorial) ECHO.Tutorial.flag('talk');
      const game = ECHO.Game, world = game.world, pl = game.pl;
      const npc = world.npcs[ent.npcId];
      if (!npc) return;
      const f = world.factions[npc.faction];
      const age = Math.floor(P().age(world, npc));
      const body = UI.openPanel(P().fullTitle(world, npc), `<div class="dlg"><div class="pt"></div><div><div class="who"><div class="meta">${esc(U.cap(P().role(world, npc)))} · ${esc(f ? f.short : '')} · ${age} years${npc.namedAfter ? ' · named for a legend' : ''}</div></div><div class="speech prose"></div><div class="opts"></div></div></div>`, 'dialogue');
      body.querySelector('.pt').appendChild(UI.portrait(ent, npc));
      const speech = body.querySelector('.speech');
      const opts = body.querySelector('.opts');
      if (!npc._talkedDay || npc._talkedDay !== world.day) {
        npc._talkedDay = world.day;
        ECHO.Character.train(pl, 'tongue', 0.25);
        npc.op[pl.charId] = (npc.op[pl.charId] || 0) + (P().has(npc, 'kind') ? 1.5 : 0.7);
      }
      const say = t => { speech.textContent = t; };
      let helpMode = false;
      say(ECHO.Dialogue.greeting(world, npc, pl));
      const render = () => {
        opts.innerHTML = '';
        const add = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.addEventListener('click', fn); opts.appendChild(b); };
        add('What news?', () => { const r = ECHO.Dialogue.news(world, npc); say(r.text); });
        add('Tell me about yourself.', () => say(ECHO.Dialogue.aboutSelf(world, npc)));
        add('What of this place?', () => { ECHO.Minds.viewOf(world, npc); say(ECHO.Dialogue.aboutPlace(world, npc) + '\n\n' + ECHO.Minds.describeWorld(world, npc)); });
        add('What do you want most?', () => { ECHO.Minds.viewOf(world, npc); say(ECHO.Minds.describeGoal(world, npc)); helpMode = true; render(); });
        add('What do you make of me?', () => say(ECHO.Minds.describePlayer(world, npc, pl)));
        add('Who are the people in your life?', () => say(ECHO.Minds.describePeople(world, npc)));
        if (helpMode) for (const h of ECHO.Minds.helpOptions(world, npc, pl)) add(`↳ ${h.label}`, () => { say(ECHO.Minds.help(world, npc, pl, h.id)); render(); });
        // money they owe you
        if (npc.debt && npc.debt.to === 'player:' + pl.charId && world.day >= npc.debt.due - 10) add(`About the ${npc.debt.amt} crowns you owe me…`, () => {
          if (npc.wealth >= npc.debt.amt) { npc.wealth -= npc.debt.amt; ECHO.Property.income(world, pl, npc.debt.amt, 'Repaid loans'); say(`Here. Every crown of it. Thank you for trusting me.`); delete npc.debt; render(); return; }
          say(`I… I don't have it. Not yet. Please — a little more time.`);
          opts.innerHTML = '';
          add('Give them another two weeks.', () => { npc.debt.due = world.day + 14; npc.debt.defaulted = false; npc.op[pl.charId] = (npc.op[pl.charId] || 0) + 10; say('Bless you. I won\'t forget it.'); render(); });
          add('Forgive the debt.', () => { delete npc.debt; npc.op[pl.charId] = (npc.op[pl.charId] || 0) + 30; ECHO.People.remember(world, npc, `had a debt forgiven by ${pl.first} ${pl.last}`, 'gratitude', null, 4); npc.mind && (npc.mind.owe = (npc.mind.owe || 0) + 2); say('You… truly? I don\'t know what to say.'); render(); });
          const st = ECHO.Sim.settlement(world, npc.loc || npc.home);
          if (st && world.day > npc.debt.due) add('Take it to the reeve.', () => {
            const h = npc.house && st.buildings.find(b => b.id === npc.house);
            if (h) { h.npcOwner = null; h.owner = pl.charId; npc.house = null; npc.lodge = null; ECHO.Property.assignTown(world, st); say(`The reeve rules for you. ${npc.first}'s house is yours now. ${npc.first} looks at you like you've taken everything.`); }
            else { npc.jailUntil = world.day + Math.ceil(npc.debt.amt / 6); say(`The reeve sends ${npc.first} to the cells to work off the debt.`); }
            npc.op[pl.charId] = -70; ECHO.People.remember(world, npc, `was ruined by ${pl.first} ${pl.last} over a debt`, 'trauma', null, 4);
            ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} took ${ECHO.People.name(npc)} of ${st.name} before the reeve over a debt of ${npc.debt.amt} crowns.`, importance: 1, sid: st.id, rep: -3, tag: 'cruel' });
            delete npc.debt; render();
          });
        });
        for (const cp of world.plights.filter(x => x.kind === 'courier' && x.status === 'open' && x.to === npc.id && pl.accepted.includes(x.id))) {
          add(`I have something for you, from ${world.npcs[cp.requester] ? world.npcs[cp.requester].first : 'a friend'}.`, () => { cp.claimable = true; UI.claimPlight(cp); npc.op[pl.charId] = (npc.op[pl.charId] || 0) + 10; say(`For me? From ${world.npcs[cp.requester] ? world.npcs[cp.requester].first : 'them'}? …Thank you for bringing it all this way.`); render(); });
        }
        const plotF = ECHO.Realm && ECHO.Realm.plotBy(world, npc.id);
        if (plotF && (world.plights.some(x => x.kind === 'plot' && x.status === 'open' && x.plotter === npc.id && pl.accepted.includes(x.id)) || (npc.op[pl.charId] || 0) > 50)) add('I hear you have plans for the throne.', () => {
          const cap = plotF.realm.plot;
          say(`${npc.first} goes pale, then very calm. "${(npc.op[pl.charId] || 0) > 30 ? 'You of all people should understand. ' : ''}${P().fullTitle(world, world.npcs[plotF.ruler] || npc)} is ruining ${plotF.short}. When the time comes, I mean to be ready. Which side will you be on?"`);
          opts.innerHTML = '';
          add('Turn them in to the captain of the guard.', () => { ECHO.Realm.confrontPlot(world, plotF, 'expose'); say(`You call the guard. ${npc.first} doesn't fight. "You'll regret this," is all ${npc.sex === 'f' ? 'she' : 'he'} says. (+150 crowns, and the crown's gratitude)`); UI.closePanel(); UI.toast('You exposed the plot. The crown will remember.', 'legend', 5); });
          add('Count me in.', () => { ECHO.Realm.confrontPlot(world, plotF, 'join'); say('"Then we are already halfway there. Keep your blade sharp. When the bells ring at night — be at the keep."'); render(); UI.toast('You have joined the plot. If it succeeds, you will be rewarded. If it fails…', 'warn', 6); });
          add('Pay me, and I never heard a thing.', () => { const r = ECHO.Realm.confrontPlot(world, plotF, 'blackmail'); say(`${npc.first} counts out ${r} crowns with shaking hands. "Now get out."`); render(); });
          add('Never mind.', () => render());
          void cap;
        });
        const words = ECHO.Wonders.carriedFor(world, npc.id);
        if (words) add(`I bring words from ${words.first}.`, () => {
          const to = ECHO.Wonders.deliverWords(world, pl, words);
          ECHO.Music.stinger('wish');
          const hs = words.sex === 'f' ? 'she' : 'he', hm = words.sex === 'f' ? 'her' : 'him', ns = npc.sex === 'f' ? 'She' : 'He', np = npc.sex === 'f' ? 'her' : 'his';
          say(`${npc.first} goes very still while you speak. "That's ${hm}. That's exactly what ${hs} would say."\n\n${ns} wipes ${np} eyes. "I don't know how you heard it. I don't want to know. Thank you."${words.gift ? `\n\n(Under the hearthstone, ${npc.first} will find ${words.gift} crowns.)` : ''}`);
          void to; render();
        });
        if (ECHO.Patrol) ECHO.Patrol.dialogue(world, npc, ent, pl, { add, say, render, clear: () => { opts.innerHTML = ''; } });
        if (ECHO.Pastimes) ECHO.Pastimes.dialogue(world, npc, ent, pl, { add, say, render, clear: () => { opts.innerHTML = ''; } });
        add('Any tales of heroes?', () => say(ECHO.Dialogue.aboutLegends(world, npc)));
        if (npc.carry) add('That blade you carry…', () => say(ECHO.Dialogue.aboutItem(world, npc, pl)));
        // Plights this person asked for
        for (const p of world.plights.filter(x => x.requester === npc.id && x.status === 'open')) {
          if (p.claimable) add(`About ${p.kind === 'kidnap' ? world.npcs[p.victim].first : 'your request'}… (claim reward)`, () => { UI.claimPlight(p); say(UI.claimText(p, npc)); render(); });
          else if (!pl.accepted.includes(p.id)) add('Can I help with your trouble?', () => { say(p.text + ' ' + (p.reward ? `I can give you ${p.reward} crowns.` : 'Please.')); pl.accepted.push(p.id); UI.toast('Added to your journal.', 'info', 2); render(); });
        }
        const s = ECHO.Sim.settlement(world, npc.loc);
        if (s && (npc.prof === 'merchant' || npc.prof === 'reeve')) add('Let\'s trade.', () => UI.openMarket(s));
        if (s && npc.prof === 'smith') add('Show me your work.', () => UI.openSmithy(s));
        if (s && s.warden === pl.charId && (npc.id === s.ruler || npc.prof === 'reeve')) add('How does the village fare?', () => UI.openHolding(s));
        if (npc.prof === 'herbalist' && pl.rareHerbs && Object.values(pl.rareHerbs).some(Boolean)) add('I have rare plants to sell.', () => { const r = ECHO.Discover.sellHerbs(world, pl, npc); say(r ? `${npc.first}'s eyes light up. "${U.listJoin(r.names)}! Do you know how long I've looked for these?" (+${r.total} crowns)` : 'Nothing I need.'); render(); });
        if (s && npc.prof === 'innkeeper') add('I need a room.', () => UI.openInn(s));
        if (s && npc.prof === 'scholar' && s.buildings.some(b => b.type === 'archive')) add('About the old records…', () => UI.openArchive(s));
        if (npc.id === pl.companion) add('It\'s time we parted ways.', () => { pl.companion = null; npc.loc = npc.home; npc.journey = null; for (const e of game.ents) if (e.npcId === npc.id && e.isCompanion) { e.isCompanion = false; e.role = 'villager'; e.faction = npc.faction; } say(`Then this is goodbye. I'll be in ${(ECHO.Sim.settlement(world, npc.home) || {}).name || 'town'} if you need me.`); render(); });
        else if (ECHO.Dialogue.recruitable(world, npc, pl)) {
          const cost = ECHO.Dialogue.recruitCost(world, npc);
          const op = npc.op[pl.charId] || 0;
          add(`Travel with me. (${cost} crowns)`, () => {
            if (op < 5 && !P().has(npc, 'greedy')) return say('I don\'t know you well enough for that.');
            if (pl.gold < cost) return say(`${cost} crowns, and not a copper less.`);
            pl.gold -= cost; pl.companion = npc.id; npc.loc = null; npc.journey = 'companion';
            ent.dead = true; ent.vanish = true;
            P().remember(world, npc, `took up the road with ${pl.first} ${pl.last}`, 'change', null, 3);
            say('Then let\'s go. Lead the way.'); UI.closePanel();
          });
        }
        add('Farewell.', () => UI.closePanel());
      };
      render();
    },

    // ------------------------------------------------------------ Buildings
    openBuilding(b, s) {
      switch (b.type) {
        case 'inn': return UI.openInn(s);
        case 'market': return UI.openMarket(s);
        case 'smithy': return UI.openSmithy(s);
        case 'archive': return UI.openArchive(s);
        case 'shrine': case 'temple': return UI.openShrine(s, b);
        case 'keep': return UI.openKeep(s);
        case 'board': return UI.openBoard(s);
        case 'statue': return UI.openStatue(b, s);
      }
    },
    goods: ['food', 'meat', 'hide', 'herbs', 'ore', 'timber', 'arms'],
    // Prices bend to your name: heroes pay less, villains pay more.
    priceOf(s, g, selling) {
      const base = g === 'meat' ? s.prices.food * 1.2 : g === 'hide' ? 6 + s.prosperity / 25 : s.prices[g];
      const m = ECHO.Minds.priceMult(ECHO.Game.world, s, ECHO.Game.pl);
      const luck = selling && ECHO.Wonders && ECHO.Wonders.has(ECHO.Game.world, ECHO.Game.pl, 'fortune') ? 1.15 : 1;
      const hg = (ECHO.Game.pl && ECHO.Game.pl.haggle) || 0;
      return U.round1(selling ? base / m * luck * (1 + hg) : base * m * (1 - hg));
    },
    nameNote(s) {
      const m = ECHO.Minds.priceMult(ECHO.Game.world, s, ECHO.Game.pl);
      return m < 0.95 ? `<span class="gold">Your good name gets you ${Math.round((1 - m) * 100)}% off here.</span>` : m > 1.05 ? `<span class="ember">They know your name here. Everything costs ${Math.round((m - 1) * 100)}% more.</span>` : '';
    },
    // What each shop is for — used by the signs over buildings and by prompts.
    SHOPS: {
      market: { title: 'Market', sub: 'arrows · food · herbs · trade goods', icon: '⚖' },
      smithy: { title: 'Smithy', sub: 'swords · bows · arrows', icon: '⚒' },
      inn: { title: 'Inn', sub: 'beds · hot meals · rest', icon: '☕' },
      shrine: { title: 'Shrine', sub: 'healing · blessings', icon: '✚' },
      temple: { title: 'Temple', sub: 'healing · blessings', icon: '✚' },
      archive: { title: 'Archive', sub: 'the chronicle · old tongues', icon: '✎' },
      keep: { title: 'Keep', sub: 'the ruler · titles · justice', icon: '♛' },
      board: { title: 'Notice board', sub: 'pleas · laws · property', icon: '✉' },
      mill: { title: 'Mill', sub: 'flour for the town', icon: '✣' },
      mine: { title: 'Mine', sub: 'ore for the smith', icon: '⛏' },
      lumber: { title: 'Lumber camp', sub: 'timber and charcoal', icon: '🪓' }
    },
    shopInfo(b, s) {
      const base = UI.SHOPS[b.type];
      if (!base || !b.fac) return base;
      const st = b.fac.state;
      if (st === 'working') return base;
      return { ...base, sub: st === 'burned' ? 'BURNED — ' + base.sub.split(' ')[0] + ' is short' : st === 'rebuilding' ? 'being rebuilt' : st === 'damaged' ? 'flood-damaged' : 'in ruin' };
    },
    // What each market good does for you.
    WARES: {
      food: { icon: '🍞', name: 'Food', use: 'Press H to eat: heals 20.' },
      herbs: { icon: '🌿', name: 'Herbs', use: 'Press G: heals 45 and puts out fire.' },
      meat: { icon: '🍖', name: 'Meat', use: 'From hunting. Eat with H (heals 28), or sell.' },
      hide: { icon: '🦊', name: 'Hide', use: 'From hunting. Sell it here or to the smith.' },
      ore: { icon: '⛏', name: 'Ore', use: 'Trade good. Buy where cheap, sell where dear.' },
      timber: { icon: '🪵', name: 'Timber', use: 'Trade good. Towns that build pay well.' },
      arms: { icon: '🗡', name: 'Arms', use: 'Trade good. Worth most where there is war.' }
    },
    openMarket(s) {
      if (ECHO.Tutorial) ECHO.Tutorial.flag('market');
      const game = ECHO.Game, world = game.world, pl = game.pl;
      const body = UI.openPanel(`Market of ${s.name}`, '', 'market');
      if (ECHO.Minds.refuses(world, s, pl)) { body.innerHTML = `<p class="prose">The stallholders turn their backs on you. "We don't trade with your kind here. Go on — before someone calls the guard."</p>`; return; }
      const render = () => {
        const hist = s.priceHistory.slice(-20);
        const max = Math.max(...hist, 1);
        const spark = hist.map(v => `<div title="${v}" style="display:inline-block;width:6px;margin-right:1px;height:${Math.max(2, v / max * 30)}px;background:${v > ECHO.GOODS.food.base * 2 ? '#c8463a' : '#c8a85a'}"></div>`).join('');
        const card = (g) => {
          const W = UI.WARES[g];
          const price = UI.priceOf(s, g);
          const sellOnly = g === 'meat' || g === 'hide';
          const stock = sellOnly ? null : Math.round(s.stock[g]);
          const sell = U.round1(UI.priceOf(s, g, true) * 0.85);
          return `<div class="ware"><div class="ware-ic">${W.icon}</div><div class="ware-main">
            <div class="ware-top"><b>${W.name}</b>${sellOnly ? '<span class="dim">they buy it</span>' : `<span class="gold">${price} cr</span>`}</div>
            <div class="ware-use">${W.use}</div>
            <div class="ware-meta">You have <b>${pl.inv[g] || 0}</b>${stock != null ? ` · ${stock} in stores` : ''} · sells for ${sell}</div>
            <div class="row">${sellOnly ? '' : `<button class="small" data-buy="${g}" ${s.stock[g] < 1 || pl.gold < price ? 'disabled' : ''}>Buy 1</button>
              <button class="small" data-buy5="${g}" ${s.stock[g] < 5 || pl.gold < price * 5 ? 'disabled' : ''}>Buy 5</button>`}
              <button class="small" data-sell="${g}" ${!(pl.inv[g] > 0) ? 'disabled' : ''}>Sell 1</button>
              <button class="small" data-sellall="${g}" ${!(pl.inv[g] > 0) ? 'disabled' : ''}>Sell all</button></div></div></div>`;
        };
        const am = ECHO.Minds.priceMult(world, s, pl), arrowP = Math.round(6 * am);
        const luck = ECHO.Wonders.has(world, pl, 'fortune') ? 1.15 : 1;
        const rare = { star: Math.round((55 + s.prosperity / 4) / am * luck), hide: Math.round((130 + s.prosperity / 2) / am * luck) };
        const om = world.omen;
        const starMerchant = om && om.kind === 'merchant' && om.sid === s.id && om.date === ECHO.Marvels.today();
        body.innerHTML = `<div class="market-top"><span>You have <b class="gold">${Math.floor(pl.gold)}</b> crowns ${UI.nameNote(s)}</span>
            <span class="dim">${s.hunger > 0.2 ? `<span class="ember">The town is hungry.</span> Selling food here eases it — and people remember.` : s.stock.food > ECHO.Economy.need(world, s) * 12 ? 'The granaries are full.' : 'Stores are ordinary.'}</span></div>
          <div class="ware featured"><div class="ware-ic">🏹</div><div class="ware-main">
            <div class="ware-top"><b>Arrows</b><span class="gold">10 for ${arrowP} cr</span></div>
            <div class="ware-use">Ammunition for your bow (right mouse). You have <b>${pl.inv.arrows}</b>.</div>
            <div class="row"><button data-arrows="1" ${pl.gold < arrowP ? 'disabled' : ''}>Buy 10</button><button data-arrows="3" ${pl.gold < arrowP * 3 ? 'disabled' : ''}>Buy 30</button></div></div></div>
          <div class="ware featured"><div class="ware-ic">🗝</div><div class="ware-main">
            <div class="ware-top"><b>Lockpicks</b><span class="gold">3 for ${Math.round(9 * am)} cr</span></div>
            <div class="ware-use">For strongboxes and iron doors in the deep places. They snap if your hand slips. You have <b>${pl.inv.lockpick || 0}</b>.</div>
            <div class="row"><button data-picks="1" ${pl.gold < Math.round(9 * am) ? 'disabled' : ''}>Buy 3</button></div></div></div>
          <h4 class="ware-h">Supplies</h4><div class="wares">${['food', 'herbs'].map(card).join('')}</div>
          <h4 class="ware-h">Sell your hunt</h4><div class="wares">${['meat', 'hide'].map(card).join('')}</div>
          <h4 class="ware-h">Trade goods</h4><div class="wares">${['ore', 'timber', 'arms'].map(card).join('')}</div>
          ${ECHO.Pastimes ? ECHO.Pastimes.marketHtml(pl, s) : ''}
          ${UI.lootMarketHtml(world, pl, s)}
          ${UI.apothecaryHtml(pl)}
          ${UI.stablesHtml(pl, s)}
          ${(pl.inv.starshard || 0) + (pl.inv.whitehide || 0) > 0 ? `<h4 class="ware-h">Rare things</h4><div class="wares">
            ${pl.inv.starshard ? `<div class="ware"><div class="ware-ic">✦</div><div class="ware-main"><div class="ware-top"><b>Star-iron shard</b><span class="gold">they pay ${rare.star}</span></div><div class="ware-use">A smith can forge it into your blade; a priest knows other uses.</div><div class="ware-meta">You have <b>${pl.inv.starshard}</b></div><div class="row"><button class="small" data-rare="starshard">Sell 1</button></div></div></div>` : ''}
            ${pl.inv.whitehide ? `<div class="ware"><div class="ware-ic">🦌</div><div class="ware-main"><div class="ware-top"><b>White hind's hide</b><span class="gold">they pay ${rare.hide}</span></div><div class="ware-use">Nobody asks where it came from. Everybody knows.</div><div class="ware-meta">You have <b>${pl.inv.whitehide}</b></div><div class="row"><button class="small" data-rare="whitehide">Sell 1</button></div></div></div>` : ''}</div>` : ''}
          ${starMerchant ? `<h4 class="ware-h" style="color:#bfe8ff">✧ The star-merchant's stall — today only</h4><p class="dim">A stranger in a coat stitched with silver thread. "From far away," is all they'll say about where.</p><div class="wares">${ECHO.Marvels.MERCHANT.map(m => `<div class="ware"><div class="ware-ic">✧</div><div class="ware-main"><div class="ware-top"><b>${esc(m.name)}</b><span class="gold">${m.price} cr</span></div><div class="ware-use">${esc(m.desc)}</div><div class="row"><button class="small" data-star="${m.id}" ${pl.gold < m.price ? 'disabled' : ''}>Buy</button></div></div></div>`).join('')}</div>` : ''}
          <p class="dim" style="margin-top:10px">Prices move with what is in the stores. Bread here has cost: <span style="display:inline-flex;align-items:flex-end;height:30px;vertical-align:middle">${spark}</span></p>`;
        body.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => {
          const d = btn.dataset;
          if (d.boat && ECHO.Boats) { const why = ECHO.Boats.buyBoat(ECHO.Game, s); if (why) UI.toast(why, 'warn', 3); else { s.wealth += 80; UI.toast('The boat is yours, drawn up at the water\'s edge nearest the town. Walk to it and press E to get in.', 'legend', 5); } }
          if (d.horse) { const why = ECHO.Life.buyHorse(pl, d.horse); if (why) UI.toast(why, 'warn', 3); else { s.wealth += ECHO.Life.BREEDS[d.horse].price; UI.toast(`${pl.horse.name} the ${ECHO.Life.BREEDS[d.horse].name.toLowerCase()} is yours, waiting outside. Press V beside it to ride; from further off, V whistles for it.`, 'legend', 5); } }
          if (d.rod) { if (pl.gold >= 12) { pl.gold -= 12; pl.inv.rod = 1; UI.toast('A fishing rod. Stand by any water and press E to cast; press E again when something bites.', 'info', 5); } }
          if (d.brew) { const why = ECHO.Gear.brew(pl, d.brew); if (why) UI.toast(why, 'warn', 3); else { ECHO.Sfx.play('coin'); UI.toast(`You have a ${ECHO.Gear.POTIONS[d.brew].name.toLowerCase()} made up. Drink it with ${ECHO.Gear.POTIONS[d.brew].key}.`, 'info', 3); } }
          if (d.sellmats) { const r = ECHO.Gear.sellMats(pl, s); if (r.total) { ECHO.Sfx.play('coin'); UI.toast(`Sold ${r.out.join(', ')} for ${r.total} crowns.`, 'info', 4); } }
          if (d.sellmat) { const k = d.sellmat, n = pl.inv[k] || 0; if (n) { const got = ECHO.Gear.matPrice(s, k) * n; pl.inv[k] = 0; pl.gold += got; s.wealth = (s.wealth || 0) + got * 0.2; ECHO.Sfx.play('coin'); } }
          if (d.sellgear) { const it = world.items[d.sellgear]; if (it && it.id !== pl.weapon && it.id !== pl.bow && it.id !== pl.armor) { const got = UI.gearPrice(world, pl, s, it); pl.items = pl.items.filter(x => x !== it.id); it.holder = null; it.history.push({ d: world.day, t: `sold at the market in ${s.name}` }); pl.gold += got; ECHO.Sfx.play('coin'); UI.toast(`Sold ${it.name} for ${got} crowns.`, 'info', 3); } }
          if (d.picks) { const c = Math.round(9 * am); if (pl.gold >= c) { pl.gold -= c; pl.inv.lockpick = (pl.inv.lockpick || 0) + 3; s.wealth += c; ECHO.Sfx.play('coin'); } }
          if (d.arrows) { const n = +d.arrows; if (pl.gold >= arrowP * n) { pl.gold -= arrowP * n; pl.inv.arrows += 10 * n; s.wealth += arrowP * n; ECHO.Sfx.play('coin'); } }
          if (d.rare && pl.inv[d.rare] > 0) {
            pl.inv[d.rare]--; const got = d.rare === 'starshard' ? rare.star : rare.hide; pl.gold += got; s.wealth = Math.max(0, s.wealth - got * 0.5); ECHO.Sfx.play('coin');
            if (d.rare === 'whitehide') ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} sold the hide of the White Hind in ${s.name}.`, importance: 1, sid: s.id, rep: -2, tag: 'cruel' });
          }
          if ((d.psell || d.psellall) && ECHO.Pastimes) { const k = d.psell || d.psellall, n = d.psell ? 1 : pl.inv[k] || 0; if (n > 0) { const got = ECHO.Pastimes.priceOf(s, k) * n; pl.inv[k] -= n; pl.gold += got; s.wealth = (s.wealth || 0) + got * 0.3; ECHO.Sfx.play('coin'); } }
          if (d.ptool && ECHO.Pastimes) { const why = ECHO.Pastimes.buyTool(pl, d.ptool, s); if (why) UI.toast(why, 'warn', 3); }
          if (d.star) {
            const m = ECHO.Marvels.MERCHANT.find(x => x.id === d.star);
            if (m && pl.gold >= m.price) {
              pl.gold -= m.price; ECHO.Sfx.play('coin');
              if (m.id === 'moonherbs') pl.inv.herbs += 5;
              else if (m.id === 'skylantern') { UI.closePanel(); ECHO.Fest.wish(game, null, true); return; }
              else pl.inv[m.id] = (pl.inv[m.id] || 0) + 1;
              if (m.id === 'wisplamp') UI.toast('The wisp lantern is yours. Light it from the Wonders page of your journal (Tab).', 'legend', 5);
            }
          }
          const buy = (g, n) => { for (let i = 0; i < n; i++) { const p = UI.priceOf(s, g); if (pl.gold < p || s.stock[g] < 1) break; pl.gold -= p; s.stock[g] -= 1; pl.inv[g] = (pl.inv[g] || 0) + 1; s.wealth += p; ECHO.Economy.updatePrices(world, s); } ECHO.Sfx.play('coin'); };
          const sell = (g, n) => {
            let sold = 0;
            for (let i = 0; i < n; i++) {
              if (!(pl.inv[g] > 0)) break;
              const p = U.round1(UI.priceOf(s, g, true) * 0.85);
              pl.inv[g]--; pl.gold += p; sold++;
              if (g === 'meat') s.stock.food += 1.2; else if (g !== 'hide') s.stock[g] += 1;
              ECHO.Economy.updatePrices(world, s);
            }
            if (sold) ECHO.Sfx.play('coin');
            if ((g === 'food' || g === 'meat') && s.hunger > 0.2 && sold >= 5) {
              s.hunger = Math.max(0, s.hunger - sold * 0.01);
              ECHO.Character.behave(pl, 'protect', 0.2);
              ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} brought ${sold} sacks of food to hungry ${s.name}.`, importance: 1, sid: s.id, rep: 4, tag: 'protect' });
            }
          };
          if (d.buy) buy(d.buy, 1);
          if (d.buy5) buy(d.buy5, 5);
          if (d.sell) sell(d.sell, 1);
          if (d.sellall) sell(d.sellall, pl.inv[d.sellall]);
          ECHO.Character.train(pl, 'tongue', 0.05);
          render();
        }));
      };
      render();
    },
    openSmithy(s) {
      if (ECHO.Tutorial) ECHO.Tutorial.flag('smith');
      const game = ECHO.Game, world = game.world, pl = game.pl;
      const smith = P().residents(world, s).find(n => n.prof === 'smith');
      const f = world.factions[s.faction];
      const era = f ? f.tech.era : 0;
      const tempered = ECHO.Civ.has(world, s.faction, 'tempered');
      const arcane = f && f.tech.path === 'arcane';
      const wares = [
        { kind: 'sword', name: 'Iron sword', dmg: 14, price: 55 },
        { kind: 'sword', name: tempered ? (arcane ? 'Runed blade' : 'Steel sword') : null, dmg: 20, price: 140 },
        { kind: 'sword', name: era >= 3 ? (arcane ? 'Starmetal blade' : 'Clockwork saber') : null, dmg: 27, price: 290 },
        { kind: 'sword', wclass: 'axe', name: 'Woodsman\'s axe', dmg: 15, price: 60 },
        { kind: 'sword', wclass: 'spear', name: 'Ash spear', dmg: 14, price: 55 },
        { kind: 'sword', wclass: 'staff', name: 'Oak staff', dmg: 10, price: 70 },
        { kind: 'bow', name: 'Recurve bow', dmg: 16, price: 90 },
        { kind: 'bow', name: era >= 2 ? (arcane ? 'Wand-bow' : 'Spring bow') : null, dmg: 22, price: 210 }
      ].filter(w => w.name);
      const pm = ECHO.Minds.priceMult(world, s, pl);
      for (const w of wares) w.price = Math.round(w.price * pm);
      const body = UI.openPanel(`Smithy of ${s.name}`, '', 'smithy');
      if (ECHO.Minds.refuses(world, s, pl)) { body.innerHTML = `<p class="prose">${smith ? esc(smith.first) : 'The smith'} doesn't look up from the anvil. "I don't arm murderers. Get out of my forge."</p>`; return; }
      const render = () => {
        body.innerHTML = `<p class="prose">${smith ? `<b>${esc(P().name(smith))}</b> wipes soot from ${smith.sex === 'f' ? 'her' : 'his'} hands. "Everything here is my own work."` : 'The forge is cold; an apprentice minds the stock.'}</p>
          <p>You have <b class="gold">${Math.floor(pl.gold)}</b> crowns. Wielding: <b>${esc(world.items[pl.weapon] ? world.items[pl.weapon].name : 'nothing')}</b>.</p>
          ${UI.smithGearHtml(world, pl, s, smith)}
          <h4 class="ware-h">Buy from the forge</h4>
          <table class="grid"><tr><th>Item</th><th>Power</th><th>Price</th><th></th></tr>${wares.map((w, i) => `<tr><td>${w.name}${w.wclass ? ` <span class="dim">(${ECHO.Gear.WCLASS[w.wclass].name.toLowerCase()})</span>` : ''}</td><td>${w.dmg}</td><td class="gold">${w.price}</td><td><button class="small" data-i="${i}" ${pl.gold < w.price ? 'disabled' : ''}>Buy</button></td></tr>`).join('')}</table>
          <div class="ware featured" style="margin-top:10px"><div class="ware-ic">🏹</div><div class="ware-main"><div class="ware-top"><b>Arrows</b><span class="gold">20 for 13 cr</span></div><div class="ware-use">You have <b>${pl.inv.arrows}</b>.</div><div class="row"><button data-arrows="1" ${pl.gold < 13 ? 'disabled' : ''}>Buy 20 arrows</button></div></div></div>
          <p class="dim">The smith buys hides at ${UI.priceOf(s, 'hide')} each.</p><button data-hides="1" ${!(pl.inv.hide > 0) ? 'disabled' : ''}>Sell all hides (${pl.inv.hide || 0})</button>
          ${pl.inv.starshard && smith ? (() => { const wpn = world.items[pl.weapon]; const n = wpn ? wpn.starforged || 0 : 0; return `<div class="ware featured" style="margin-top:10px;border-color:#9fd3ff"><div class="ware-ic">✦</div><div class="ware-main"><div class="ware-top"><b>Forge star-iron into your blade</b><span class="gold">1 shard + 40 cr</span></div><div class="ware-use">${wpn ? `${esc(smith.first)} turns the shard over in the firelight. "I've heard of this. Never thought I'd hold it." Your ${esc(wpn.name)} would strike harder (+4) — and shine a little in the dark.${n >= 3 ? ' <span class="ember">It can take no more.</span>' : ''}` : 'You need a sword to forge it into.'}</div><div class="row"><button data-forge="1" ${!wpn || n >= 3 || pl.gold < 40 ? 'disabled' : ''}>Forge it</button></div></div></div>`; })() : ''}`;
        body.querySelectorAll('button[data-i]').forEach(b => b.addEventListener('click', () => {
          const w = wares[+b.dataset.i];
          pl.gold -= w.price;
          const it = ECHO.Character.makeItem(world, { kind: w.kind, wclass: w.wclass, name: w.name, dmg: w.dmg, holder: 'player', made: { by: smith ? P().name(smith) : 'a smith', at: s.name, d: world.day }, history: [{ d: world.day, t: `forged by ${smith ? P().name(smith) : 'a smith'} of ${s.name}` }] });
          pl.items.push(it.id);
          if (w.kind === 'sword') pl.weapon = it.id; else pl.bow = it.id;
          s.wealth += w.price; if (smith) smith.wealth += w.price * 0.5;
          ECHO.PlayerCtl.derivedT = 0;
          UI.toast(`You buy ${w.name}, made by ${smith ? smith.first : 'the smith'}.`, 'info', 3);
          render();
        }));
        const ab = body.querySelector('button[data-arrows]');
        if (ab) ab.addEventListener('click', () => { if (pl.gold >= 13) { pl.gold -= 13; pl.inv.arrows += 20; s.wealth += 13; ECHO.Sfx.play('coin'); } render(); });
        const fb = body.querySelector('button[data-forge]');
        if (fb) fb.addEventListener('click', () => {
          const wpn = world.items[pl.weapon];
          if (!wpn || pl.gold < 40 || !(pl.inv.starshard > 0)) return;
          pl.gold -= 40; pl.inv.starshard--; s.wealth += 40; if (smith) smith.wealth += 20;
          wpn.dmg += 4; wpn.starforged = (wpn.starforged || 0) + 1;
          if (wpn.starforged === 1 && !/^Star-forged/.test(wpn.name)) wpn.name = 'Star-forged ' + wpn.name.replace(/^(a|an|the) /i, '');
          wpn.history.push({ d: world.day, t: `forged with star-iron by ${smith ? P().name(smith) : 'a smith'} of ${s.name}` });
          ECHO.PlayerCtl.derivedT = 0;
          ECHO.Sfx.play('block'); ECHO.Music.stinger('star');
          UI.toast(`The blade comes out of the quench with a pale light running down its edge: ${wpn.name}.`, 'legend', 6);
          render();
        });
        body.querySelectorAll('button[data-hone]').forEach(btn => btn.addEventListener('click', () => {
          const it = world.items[btn.dataset.hone]; if (!it) return;
          const before = { ...it };
          const c = ECHO.Gear.honeCost(it);
          const why = ECHO.Gear.hone(world, pl, it);
          if (why) { UI.toast(why, 'warn', 3); return; }
          s.wealth += c.gold; if (smith) smith.wealth += c.gold * 0.5;
          ECHO.PlayerCtl.derivedT = 0; ECHO.Sfx.play('block');
          render();
          UI.modal({ title: `${it.name} +${it.plus}`, html: `<div class="upg-arrow" style="justify-content:center;gap:18px;margin:8px 0">${ECHO.GearArt.img(before, 'gear-ic big')}<span class="gold" style="font-size:26px">➜</span>${ECHO.GearArt.img(it, 'gear-ic big')}</div>
            <p class="prose" style="text-align:center">${esc(smith ? smith.first : 'The smith')} works it over at the anvil${it.kind === 'armor' ? ', riveting on new plate' : it.kind === 'bow' ? ', fitting a new string and horn' : ' until the edge sings'}. ${it.plus >= 3 ? 'It catches the light now in a way it did not before.' : ''}</p>
            <p style="text-align:center">${esc(ECHO.Gear.line(before))} <span class="gold">➜</span> <b>${esc(ECHO.Gear.line(it))}</b></p>`, choices: [{ label: 'Good work', onPick: () => {} }] });
        }));
        body.querySelectorAll('button[data-forgew]').forEach(btn => btn.addEventListener('click', () => {
          const r = ECHO.Gear.forge(world, pl, btn.dataset.forgew);
          if (r.error) { UI.toast(r.error, 'warn', 3); return; }
          const rec = ECHO.Gear.FORGE.find(c => c.id === btn.dataset.forgew);
          s.wealth += rec.gold; if (smith) smith.wealth += rec.gold * 0.5;
          r.item.made = { by: smith ? P().name(smith) : 'a smith', at: s.name, d: world.day };
          if (r.item.kind === 'bow') pl.bow = r.item.id; else pl.weapon = r.item.id;
          ECHO.PlayerCtl.derivedT = 0; ECHO.Sfx.play('block');
          render();
          UI.modal({ title: r.item.name, html: `<div class="upg-arrow" style="justify-content:center;margin:8px 0">${ECHO.GearArt.img(r.item, 'gear-ic big')}</div><p class="prose" style="text-align:center">${esc(smith ? smith.first : 'The smith')} quenches it and hands it over, hilt first. ${esc(rec.desc)}</p><p style="text-align:center"><b>${esc(ECHO.Gear.line(r.item))}</b>${r.item.wclass ? `<br><span class="dim">${esc(ECHO.Gear.WCLASS[r.item.wclass].desc)}</span>` : ''}</p>`, choices: [{ label: 'Take it', onPick: () => {} }] });
        }));
        body.querySelectorAll('button[data-craft]').forEach(btn => btn.addEventListener('click', () => {
          const r = ECHO.Gear.craft(world, pl, btn.dataset.craft);
          if (r.error) { UI.toast(r.error, 'warn', 3); return; }
          const rec = ECHO.Gear.CRAFT.find(c => c.id === btn.dataset.craft);
          s.wealth += rec.gold; if (smith) smith.wealth += rec.gold * 0.5;
          r.item.made = { by: smith ? P().name(smith) : 'a smith', at: s.name, d: world.day };
          ECHO.PlayerCtl.derivedT = 0; ECHO.Sfx.play('block');
          UI.toast(`${smith ? smith.first : 'The smith'} fits you for it: ${r.item.name}${pl.armor === r.item.id ? ' (worn)' : ''}.`, 'legend', 4);
          render();
        }));
        const hb = body.querySelector('button[data-hides]');
        if (hb) hb.addEventListener('click', () => { const n = pl.inv.hide || 0; pl.gold += n * UI.priceOf(s, 'hide'); pl.inv.hide = 0; render(); });
        UI.extras(body, s, { work: 'smithy' });
      };
      render();
    },
    // Your level and rank, and what they give you.
    prowessHtml(world, pl) {
      const Pw = ECHO.Prowess, st = Pw.st(pl), L = st.lv, R = Pw.rank(L), nx = Pw.nextRank(L), need = Pw.need(L);
      const pow = Pw.power(world, pl);
      return `<h3 class="gold">Prowess</h3><div class="prowess-card"><div style="text-align:center;min-width:86px"><div class="big" style="color:${R.color}">Lv ${L}</div><div style="color:${R.color}">${esc(R.title)}</div></div>
        <div style="flex:1"><div class="xp"><i style="width:${L >= Pw.MAX ? 100 : Math.round(st.xp / need * 100)}%"></i></div>
        <div class="dim" style="font-size:13px">${L >= Pw.MAX ? 'You have reached the height of your strength.' : `${Math.floor(st.xp)} / ${need} experience to level ${L + 1}`}${nx ? ` · ${esc(nx.title)} at level ${nx.lv}` : ''}</div>
        <div style="font-size:13px;margin-top:4px">Power <b class="gold">${pow.total}</b> · sword <b>${pow.melee}</b> a blow · bow <b>${pow.bow}</b> a shot · armour <b>${pow.def}</b></div>
        <div class="dim" style="font-size:12px">From your level: +${Math.round((Pw.dmgMult(pl) - 1) * 100)}% damage, +${Pw.hpBonus(pl)} life, +${Pw.staBonus(pl)} stamina. Strongest foe beaten: ${st.best ? 'level ' + st.best : 'none yet'}.</div>
        <div class="rank-ladder" style="margin-top:4px">${Pw.RANKS.map(r => `<span style="color:${L >= r.lv ? r.color : '#5a5248'}">${L >= r.lv ? '◆' : '◇'} ${esc(r.title)}</span>`).join('')}</div>
        <div class="dim" style="font-size:12px">You grow by defeating foes. The stronger they are than you, the more you learn; things far beneath you teach you nothing.</div></div></div>`;
    },
    // What you carry and wear, drawn so that every upgrade shows.
    equipHtml(world, pl) {
      const GA = ECHO.GearArt, Gr = ECHO.Gear;
      const look = ECHO.Progress.lookOf(world, pl);
      const slot = (it, what) => `<div class="gear-slot">${GA.img(it)}<div>${it ? `<b style="color:${Gr.rarity(it.rarity).color}">${esc(it.name)}${it.plus ? ' +' + it.plus : ''}</b><div style="font-size:13px">${esc(Gr.line(it))}</div><div class="dim" style="font-size:12px">${Gr.honeCost(it) ? `A smith can take it to +${(it.plus || 0) + 1}.` : 'Upgraded as far as it goes.'}</div>` : `<span class="dim">No ${what}.</span>`}</div></div>`;
      return `<h3 class="gold">Equipment</h3><div class="gear-slots"><img class="gear-doll" src="${GA.doll(look, pl.look && pl.look.skin || '#e0ac85', pl.look && pl.look.hair || '#4a3020')}" alt="">
        <div>${slot(world.items[pl.weapon], 'sword')}${slot(world.items[pl.bow], 'bow')}${slot(pl.armor && world.items[pl.armor], 'armour')}</div></div>`;
    },
    stablesHtml(pl, s) {
      const L = ECHO.Life;
      return `<h4 class="ware-h">The stables</h4><p class="dim">A horse carries you along the roads far faster than your feet. Press V to mount; you leap down to fight.${pl.horse ? ` You ride <b>${esc(pl.horse.name)}</b>, a ${esc(L.BREEDS[pl.horse.breed].name.toLowerCase())}.` : ''}</p><div class="wares">${Object.entries(L.BREEDS).map(([k, B]) => `<div class="ware"><div class="ware-ic" style="color:${B.color}">🐎</div><div class="ware-main"><div class="ware-top"><b>${esc(B.name)}</b><span class="gold">${B.price} cr</span></div><div class="ware-use">${esc(B.desc)} Speed ×${B.speed}.</div><div class="row"><button class="small" data-horse="${k}" ${pl.gold < B.price ? 'disabled' : ''}>${pl.horse ? 'Trade up' : 'Buy'}</button></div></div></div>`).join('')}
        <div class="ware"><div class="ware-ic">🎣</div><div class="ware-main"><div class="ware-top"><b>Fishing rod</b><span class="gold">12 cr</span></div><div class="ware-use">Fish at any water (E). Trout to eat, silverfin and moonfish to sell.</div><div class="row"><button class="small" data-rod="1" ${pl.inv.rod || pl.gold < 12 ? 'disabled' : ''}>${pl.inv.rod ? 'You have one' : 'Buy'}</button></div></div></div>
        <div class="ware"><div class="ware-ic">🛶</div><div class="ware-main"><div class="ware-top"><b>Rowboat</b><span class="gold">80 cr</span></div><div class="ware-use">Your own boat, left at the shore nearest the town. Row it with the movement keys; beach it wherever you step ashore. Holds you and a companion — not a horse.</div><div class="row"><button class="small" data-boat="1" ${pl.gold < 80 ? 'disabled' : ''}>${pl.boat ? 'Buy another (the old one is left)' : 'Buy'}</button></div></div></div></div>`;
    },
    apothecaryHtml(pl) {
      const Gr = ECHO.Gear;
      const cost = c => `<span class="gold">${c.gold} cr</span>${Object.entries(c.mats).map(([k, n]) => ` + <span class="${(pl.inv[k] || 0) >= n ? '' : 'ember'}">${n} ${esc(Gr.MATS[k] ? Gr.MATS[k].name : k)} (${pl.inv[k] || 0})</span>`).join('')}`;
      return `<h4 class="ware-h">The apothecary</h4><p class="dim">Draughts made up from your herbs and what you take from monsters. Drink with the number keys in a fight.</p><div class="wares">${Object.entries(Gr.POTIONS).map(([id, P0]) => `<div class="ware"><div class="ware-ic" style="color:${P0.color}">⚱</div><div class="ware-main"><div class="ware-top"><b>${esc(P0.name)}</b><span class="dim">key ${P0.key} · you have ${(pl.potions || {})[id] || 0}</span></div><div class="ware-use">${esc(P0.desc)} ${cost(P0)}</div><div class="row"><button class="small" data-brew="${id}" ${Gr.canPay(pl, P0) ? '' : 'disabled'}>Have it made</button></div></div></div>`).join('')}</div>`;
    },
    // What a market pays for a piece of gear.
    gearPrice(world, pl, s, it) { return Math.max(3, Math.round(ECHO.Gear.value(it) * (0.7 + (s.prosperity || 50) / 250) / ECHO.Minds.priceMult(world, s, pl))); },
    lootMarketHtml(world, pl, s) {
      const Gr = ECHO.Gear, mats = Gr.mats(pl);
      const spare = pl.items.map(id => world.items[id]).filter(it => it && it.id !== pl.weapon && it.id !== pl.bow && it.id !== pl.armor && !it.legend);
      let html = '';
      if (mats.length) {
        const total = mats.reduce((a, m) => a + Gr.matPrice(s, m.k) * m.n, 0);
        html += `<h4 class="ware-h">Monster parts</h4><p class="dim">Alchemists, tanners and curio-sellers buy what you bring up from below. A smith can use them too — see the smithy.</p><div class="wares">${mats.map(m => `<div class="ware"><div class="ware-ic" style="color:${m.color}">◆</div><div class="ware-main"><div class="ware-top"><b>${esc(U.cap(m.name))}</b><span class="gold">${Gr.matPrice(s, m.k)} each</span></div><div class="ware-meta">You have <b>${m.n}</b></div><div class="row"><button class="small" data-sellmat="${m.k}">Sell all (${Gr.matPrice(s, m.k) * m.n})</button></div></div></div>`).join('')}</div>
          <div class="row"><button data-sellmats="1">Sell every part — ${total} crowns</button></div>`;
      }
      if (spare.length) html += `<h4 class="ware-h">Gear you do not use</h4><div class="wares">${spare.map(it => `<div class="ware">${ECHO.GearArt.img(it, 'gear-ic small')}<div class="ware-main"><div class="ware-top"><b style="color:${Gr.rarity(it.rarity).color}">${esc(it.name)}</b><span class="gold">${UI.gearPrice(world, pl, s, it)} cr</span></div><div class="ware-use">${esc(Gr.line(it))}</div><div class="row"><button class="small" data-sellgear="${it.id}">Sell</button></div></div></div>`).join('')}</div>`;
      return html;
    },
    smithGearHtml(world, pl, s, smith) {
      if (!smith) return '';
      const Gr = ECHO.Gear;
      const cost = c => `<span class="gold">${c.gold} cr</span>${Object.entries(c.mats).map(([k, n]) => ` + <span style="color:${(Gr.MATS[k] || { color: '#c8b890' }).color}" class="${(pl.inv[k] || 0) >= n ? '' : 'ember'}">${n} ${esc(Gr.MATS[k] ? Gr.MATS[k].name : k === 'hide' ? 'hides' : k)} (${pl.inv[k] || 0})</span>`).join('')}`;
      const gear = [[pl.weapon, 'Hone the blade'], [pl.bow, 'Restring and tiller the bow'], [pl.armor, 'Reinforce the armour']].map(([id, verb]) => [world.items[id], verb]).filter(([it]) => it);
      let html = `<h4 class="ware-h">Improve your gear</h4><p class="dim">"Bring me what you take off the things down there, and I can do things with steel you wouldn't believe."</p><div class="wares">`;
      const nextOf = it => ({ ...it, plus: (it.plus || 0) + 1 });
      html += gear.map(([it, verb]) => { const c = Gr.honeCost(it); return `<div class="ware"><div class="ware-main"><div class="upg-arrow">${ECHO.GearArt.img(it, 'gear-ic small')}${c ? `<span class="gold">➜</span>${ECHO.GearArt.img(nextOf(it), 'gear-ic small')}` : ''}</div><div class="ware-top"><b style="color:${Gr.rarity(it.rarity).color}">${esc(it.name)}${it.plus ? ' +' + it.plus : ''}</b><span class="dim">${esc(Gr.line(it))}</span></div>${c ? `<div class="ware-use">${verb} to +${(it.plus || 0) + 1} (${it.kind === 'armor' ? 'armour +' + (c.add + 1) : 'power +' + c.add}): ${cost(c)}</div><div class="row"><button class="small" data-hone="${it.id}" ${Gr.canPay(pl, c) ? '' : 'disabled'}>${verb}</button></div>` : '<div class="ware-use gold">It can be made no finer.</div>'}</div></div>`; }).join('');
      html += `</div><h4 class="ware-h">Forge a weapon</h4><p class="dim">Swords, axes that stagger, spears that reach, staffs that burn — made from what you bring up from below.</p><div class="wares">${Gr.FORGE.map(r => { const mock = { kind: r.kind, wclass: r.wclass, rarity: r.rarity, affix: r.affix || null, plus: 0, dmg: r.dmg }; return `<div class="ware">${ECHO.GearArt.img(mock, 'gear-ic small')}<div class="ware-main"><div class="ware-top"><b style="color:${Gr.rarity(r.rarity).color}">${esc(r.name)}</b><span class="dim">${r.wclass ? Gr.WCLASS[r.wclass].name.toLowerCase() : 'bow'} · power ${r.dmg}${r.affix ? ' · ' + Gr.AFFIX[r.affix].desc : ''}</span></div><div class="ware-use">${esc(r.desc)} ${cost(r)}</div><div class="row"><button class="small" data-forgew="${r.id}" ${Gr.canPay(pl, r) ? '' : 'disabled'}>Forge it</button></div></div></div>`; }).join('')}</div>
        <h4 class="ware-h">Have armour made</h4><div class="wares">${Gr.CRAFT.map(r => `<div class="ware">${ECHO.GearArt.img({ kind: 'armor', def: r.def, rarity: r.def >= 20 ? 'rare' : r.def >= 10 ? 'fine' : 'common', affix: r.affix || null, plus: 0, craft: r.id }, 'gear-ic small')}<div class="ware-main"><div class="ware-top"><b>${esc(r.name)}</b><span class="dim">armour ${r.def}${r.affix ? ' · ' + Gr.AFFIX[r.affix].desc : ''}</span></div><div class="ware-use">${esc(r.desc)} ${cost(r)}</div><div class="row"><button class="small" data-craft="${r.id}" ${Gr.canPay(pl, r) ? '' : 'disabled'}>Have it made</button></div></div></div>`).join('')}</div>`;
      return html;
    },
    openInn(s) {
      const game = ECHO.Game, world = game.world, pl = game.pl;
      const keeper = P().residents(world, s).find(n => n.prof === 'innkeeper');
      const body = UI.openPanel(`The inn at ${s.name}`, '', 'inn');
      if (ECHO.Minds.refuses(world, s, pl)) { body.innerHTML = `<p class="prose">${keeper ? esc(keeper.first) : 'The innkeeper'} folds their arms. "No rooms. Not for you. Not tonight, not ever."</p>`; return; }
      const room = 5, week = 25, season = 70;
      body.innerHTML = `<p class="prose">${keeper ? `<b>${esc(P().name(keeper))}</b> pours you something warm. "${esc(ECHO.Dialogue.ambient(world, keeper, null) || 'What\'ll it be?')}"` : 'The common room is warm and loud.'}</p>
        <div class="list">
          <div class="card"><h4>A bed for the night — ${room} crowns</h4><div class="dim">Sleep until morning. Wake whole.</div><div class="row"><button data-a="night" ${pl.gold < room ? 'disabled' : ''}>Sleep</button></div></div>
          <div class="card"><h4>A hot meal — 2 crowns</h4><div class="dim">Bread for the road.</div><div class="row"><button data-a="meal" ${pl.gold < 2 ? 'disabled' : ''}>Buy (adds 2 food)</button></div></div>
          <div class="card"><h4>Stay a week — ${week} crowns</h4><div class="dim">Seven days of rest. The world will not wait for you.</div><div class="row"><button data-a="week" ${pl.gold < week ? 'disabled' : ''}>Stay</button></div></div>
          <div class="card"><h4>Stay the season — ${season} crowns</h4><div class="dim">Fifteen days. Kingdoms may rise and fall.</div><div class="row"><button data-a="season" ${pl.gold < season ? 'disabled' : ''}>Stay</button></div></div>
        </div>${ECHO.Companions ? ECHO.Companions.innHtml(world, s, pl) : ''}`;
      body.querySelectorAll('button[data-hire]').forEach(b => b.addEventListener('click', () => {
        const n = world.npcs[b.dataset.hire]; if (!n) return;
        const why = ECHO.Companions.hire(game, n);
        if (why) return UI.toast(why, 'warn', 3);
        UI.toast(`${n.first} ${n.last} joins you: "${['Lead on.', 'Let\'s get to work.', 'Where are we headed?', 'You won\'t regret this.'][Math.floor(Math.random() * 4)]}"`, 'legend', 4);
        UI.closePanel();
      }));
      body.querySelectorAll('button[data-a]').forEach(b => b.addEventListener('click', () => {
        const a = b.dataset.a;
        if (a === 'meal') { pl.gold -= 2; pl.inv.food += 2; UI.closePanel(); return; }
        UI.closePanel();
        if (a === 'night') { pl.gold -= room; UI.sleepUntilMorning(s); }
        if (a === 'week' || a === 'season') {
          pl.gold -= a === 'week' ? week : season;
          game.fastForward(a === 'week' ? 7 : 15, `You rest at the inn in ${s.name}…`, events => {
            pl.hp = pl.maxHp; pl.stamina = pl.maxSta; pl.mana = pl.maxMana;
            world.minute = 7 * 60;
            ECHO.Chronicle.learnAt(world, s);
            UI.modal({ title: 'Rested', html: `<p>You wake on ${T.fmtDate(world.day)}.</p>${UI.eventsDigest(events, 'While you rested')}`, choices: [{ label: 'Go out', onPick: () => {} }] });
          });
        }
      }));
      UI.extras(body, s, { work: 'inn', coach: true });
    },
    // Your village: how it fares, what to build, what to ask of it.
    openHolding(s) {
      const game = ECHO.Game, world = game.world, pl = game.pl, Hd = ECHO.Holding;
      const body = UI.openPanel(`${s.name} — your village`, '', 'holding');
      const render = () => {
        const res = P().residents(world, s);
        const houses = s.buildings.filter(b => b.type === 'house').length;
        const need = ECHO.Economy.need(world, s);
        const reeve = s.ruler && world.npcs[s.ruler];
        const mood = s.unrest > 60 ? '<span class="ember">angry</span>' : s.unrest > 35 ? 'restless' : s.prosperity > 65 ? '<span class="gold">thriving</span>' : 'content';
        const proj = (s.projects || []);
        const hist = world.chronicle.filter(e => e.sid === s.id).slice(-5).reverse();
        body.innerHTML = `<p class="prose">${reeve ? `<b>${esc(P().fullTitle(world, reeve))}</b>, your reeve, keeps the accounts.` : 'There is no reeve; you keep the accounts yourself.'} The people are ${mood}.</p>
          <div class="card"><div>${res.length} people · ${houses} houses (room for about ${Math.round(houses * 3.6)}) · bread for ${Math.round(s.stock.food / Math.max(1, need))} days · prosperity ${Math.round(s.prosperity || 0)} · unrest ${Math.round(s.unrest)}${s.watch ? ` · safety ${Math.round(s.watch.safety)}` : ''}</div>
          <div class="dim">${[s.works && s.works.walls && 'palisade', s.works && s.works.granary && 'granary', s.works && s.works.watch && 'watchtower', s.fair && 'market fair'].filter(Boolean).join(', ') || 'No great works yet.'}</div></div>
          <h3 class="gold">Dues</h3><div class="row" style="display:flex;gap:8px">${['low', 'fair', 'high'].map(k => `<button class="small ${(s.dues || 'fair') === k ? 'on' : ''}" data-dues="${k}">${{ low: 'Low — they grow', fair: 'Fair', high: 'High — you grow rich, they grow angry' }[k]}</button>`).join('')}</div>
          <p class="dim">Your share is paid each season. ${pl.duesMul > 1 ? 'As steward you take half again as much.' : ''}</p>
          <h3 class="gold">Works</h3><div class="list">${Object.entries(Hd.PROJECTS).map(([k, Pj]) => {
            const going = proj.find(x => x.k === k && !x.done);
            const why = going ? null : Hd.canBuild(world, s, k);
            return `<div class="card"><h4>${esc(Pj.name)} — ${Pj.cost} crowns</h4><div class="dim">${esc(Pj.desc)}</div><div class="row">${going ? `<span class="gold">Being built — ready in ${Math.max(0, going.ready - world.day)} days.</span>` : why ? `<span class="dim">${esc(why)}</span>` : `<button class="small" data-proj="${k}" ${pl.gold < Pj.cost ? 'disabled' : ''}>Fund it</button>`}</div></div>`;
          }).join('')}</div>
          <h3 class="gold">People</h3><div class="card"><div>Send criers to the crowded towns to tell of land and work here.</div><div class="row"><button class="small" data-invite="1" ${pl.gold < 50 ? 'disabled' : ''}>Invite settlers (50 crowns)</button></div></div>
          ${hist.length ? `<h3 class="gold">Lately</h3>${hist.map(e => `<div class="dim">${T.fmtShort(e.d)} — ${esc(e.text)}</div>`).join('')}` : ''}`;
        body.querySelectorAll('button[data-dues]').forEach(b => b.addEventListener('click', () => { s.dues = b.dataset.dues; render(); }));
        body.querySelectorAll('button[data-proj]').forEach(b => b.addEventListener('click', () => { const e = Hd.build(world, s, pl, b.dataset.proj); if (e) UI.toast(e, 'warn', 3); else { UI.toast('The work begins.', 'info', 3); ECHO.Chronicle.add(world, { text: `By order of their warden, ${pl.first} ${pl.last}, work began on ${Hd.PROJECTS[b.dataset.proj].name.toLowerCase()} in ${s.name}.`, kind: 'politics', importance: 1, sid: s.id }); } render(); }));
        const inv = body.querySelector('button[data-invite]');
        if (inv) inv.addEventListener('click', () => { UI.toast(Hd.invite(world, s, pl, ECHO.Sim.rngFor(world)), 'info', 5); render(); });
      };
      render();
    },
    // Work and travel, offered wherever there is work or a coach.
    extras(body, s, o) {
      const game = ECHO.Game, world = game.world, pl = game.pl;
      let html = '';
      if (o.work) { const w = ECHO.Holding.shift(world, s, o.work); if (w) html += `<div class="card"><h4>Work a shift — ${esc(w.what)}</h4><div class="dim">Three hours of honest work for about ${w.pay} crowns. It trains you, and people notice who works.</div><div class="row"><button data-work="${o.work}" ${pl.stamina < 25 ? 'disabled' : ''}>${pl.stamina < 25 ? 'Too tired' : 'Work'}</button></div></div>`; }
      if (o.coach) {
        const dests = world.settlements.filter(t => t.id !== s.id && t.faction !== 'ashfang' && ECHO.Sim.route(world, s.id, t.id)).map(t => ({ t, c: ECHO.Holding.coach(world, s, t, pl) })).filter(x => x.c).sort((a, b) => a.c.dist - b.c.dist).slice(0, 10);
        if (dests.length) html += `<h3 class="gold" style="margin-top:14px">The coach</h3><p class="dim">Coaches run along the roads. The world goes on while you ride.</p><div class="list">${dests.map(x => `<div class="card"><div><b>${esc(x.t.name)}</b>${x.t.visited ? '' : ' <span class="dim">(you have never been)</span>'} — ${x.c.hours} hours · ${x.c.cost} crowns</div><div class="row"><button class="small" data-coach="${x.t.id}" ${pl.gold < x.c.cost ? 'disabled' : ''}>Ride</button></div></div>`).join('')}</div>`;
      }
      if (!html) return;
      body.insertAdjacentHTML('beforeend', html);
      body.querySelectorAll('button[data-work]').forEach(b => b.addEventListener('click', () => UI.work(s, b.dataset.work)));
      body.querySelectorAll('button[data-coach]').forEach(b => b.addEventListener('click', () => UI.ride(s, ECHO.Sim.settlement(world, b.dataset.coach))));
    },
    work(s, kind) {
      const game = ECHO.Game, world = game.world, pl = game.pl;
      const w = ECHO.Holding.shift(world, s, kind);
      if (!w) return;
      if (pl.stamina < 25) return UI.toast('You are too tired to work.', 'warn', 3);
      UI.closePanel();
      UI.fadeOut(() => {
        for (let i = 0; i < 3; i++) ECHO.Sim.advance(world, 60);
        pl.gold += w.pay; pl.stamina = Math.max(0, pl.stamina - 45);
        ECHO.Character.train(pl, w.skill, 0.8);
        ECHO.Ambition.note(pl, 'shifts');
        for (const n of P().residents(world, s).filter(n => n.prof === ({ mill: 'miller', mine: 'miner', lumber: 'woodcutter', smithy: 'smith', inn: 'innkeeper' }[kind] || 'farmer')).slice(0, 4)) n.op[pl.charId] = (n.op[pl.charId] || 0) + 3;
        if (s.rep) s.rep[pl.charId] = (s.rep[pl.charId] || 0) + 0.5; else s.rep = { [pl.charId]: 0.5 };
        s.prosperity = Math.min(100, (s.prosperity || 40) + 0.2);
        game.ents = game.ents.filter(e => e === game.pe || e.isCompanion);
        UI.fadeIn();
        const lines = ['Your back aches, but the work is honest.', 'The others share their bread with you at the end.', 'Someone hums an old song while you work, and by the end you know the words.', 'The foreman says you can come back any time.'];
        UI.toast(`Three hours ${w.what}. +${w.pay} crowns. ${lines[Math.floor(Math.random() * lines.length)]}`, 'info', 5);
      }, 400);
    },
    ride(s, to) {
      const game = ECHO.Game, world = game.world, pl = game.pl;
      const c = to && ECHO.Holding.coach(world, s, to, pl);
      if (!c || pl.gold < c.cost) return;
      pl.gold -= c.cost;
      UI.closePanel();
      UI.fadeOut(() => {
        let mins = c.hours * 60;
        while (mins > 0) { const step = Math.min(60, mins); ECHO.Sim.advance(world, step); mins -= step; }
        let note = '';
        const danger = ECHO.Sim.roadDanger(world, (s.x + to.x) / 2, (s.y + to.y) / 2, ECHO.World.regionAt(world, (s.x + to.x) / 2, (s.y + to.y) / 2));
        if (danger > 0.6 && Math.random() < 0.35) { const lost = Math.min(Math.floor(pl.gold), 8 + Math.floor(Math.random() * 15)); pl.gold -= lost; note = ` Outlaws stopped the coach on the way; the driver paid them off with your purse — ${lost} crowns lighter.`; }
        ECHO.Capture.place(game, to.x, to.y + 3);
        game.ents = game.ents.filter(e => e === game.pe || e.isCompanion);
        game.checkPlace(true);
        UI.fadeIn();
        UI.toast(`${c.hours} hours on the coach. You climb down in ${to.name}.${note}`, note ? 'warn' : 'world', 6);
      }, 500);
    },
    sleepUntilMorning(s, home) {
      const game = ECHO.Game, world = game.world, pl = game.pl;
      UI.fadeOut(() => {
        // advance to 7:00 next morning, ticking the world
        let mins = (7 * 60 - world.minute + 1440) % 1440;
        if (mins < 60) mins += 1440;
        while (mins > 0) { const step = Math.min(60, mins); ECHO.Sim.advance(world, step); mins -= step; }
        pl.hp = pl.maxHp; pl.stamina = pl.maxSta; pl.mana = pl.maxMana;
        game.onNewDay();
        game.ents = game.ents.filter(e => e === game.pe || e.isCompanion);
        UI.fadeIn();
        UI.toast(`You wake rested in ${s ? s.name : 'your bed'}. ${T.fmtDate(world.day)}.`, 'info', 4);
        if (home && ECHO.Life) for (const m of ECHO.Life.slept(world, pl, home)) UI.toast(m, 'legend', 6);
      });
    },
    openShrine(s, b) {
      const game = ECHO.Game, world = game.world, pl = game.pl;
      const priest = P().residents(world, s).find(n => n.prof === 'priest');
      const body = UI.openPanel(b.type === 'temple' ? `Temple of the Lantern, ${s.name}` : `Shrine of ${s.name}`, '', 'shrine');
      const render = () => {
        body.innerHTML = `<p class="prose">${priest ? `<b>${esc(P().fullTitle(world, priest))}</b> tends the flame. "May it keep you."` : 'A single candle burns before the flame-carved stone.'}</p>
          <div class="list"><div class="card"><h4>Ask for healing — 5 crowns</h4><div class="row"><button data-a="heal" ${pl.gold < 5 || pl.hp >= pl.maxHp ? 'disabled' : ''}>Be healed</button></div></div>
          <div class="card"><h4>Give alms — 20 crowns</h4><div class="dim">Feeds the poor of ${esc(s.name)}. The Lantern remembers generosity.</div><div class="row"><button data-a="alms" ${pl.gold < 20 ? 'disabled' : ''}>Give</button></div></div>
          ${pl.inv.starshard ? `<div class="card" style="border-color:#9fd3ff"><h4>✦ Offer a star-shard to the flame</h4><div class="dim">${pl.fate < 3 ? 'They say a fallen star can mend a thread of fate that has worn thin.' : 'Star-iron in the flame: a blessing on the one who brings it.'}</div><div class="row"><button data-a="star">Offer it</button></div></div>` : ''}</div>`;
        body.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => {
          if (btn.dataset.a === 'heal') { pl.gold -= 5; pl.hp = pl.maxHp; game.pe.burn = 0; if (pl.sick) { (pl.immune = pl.immune || []).push(pl.sick.d); delete pl.sick; UI.toast('The priest\'s remedies break your fever.', 'mercy', 3); } }
          if (btn.dataset.a === 'star' && pl.inv.starshard > 0) {
            pl.inv.starshard--;
            ECHO.Music.stinger('fate');
            if (pl.fate < 3) { pl.fate++; UI.toast('The shard melts into the flame without a sound, and the flame burns white. You feel the thread of your fate grow stronger. (+1 Fate)', 'legend', 7); }
            else { ECHO.Wonders.boon(pl, 'hp', 6); ECHO.Wonders.charm(world, pl, 'starlit', 6); ECHO.PlayerCtl.derivedT = 0; UI.toast('The flame burns white for a moment. You feel lighter, and the night seems to lean toward you. (+6 life for good; wisps will find you easily for a few days)', 'legend', 7); }
            ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} gave a fallen star to the flame at the ${b.type} of ${s.name}.`, importance: 1, sid: s.id, rep: 2, factionRep: { lantern: 4 } });
          }
          if (btn.dataset.a === 'alms') {
            pl.gold -= 20; s.stock.food += 6; s.unrest = Math.max(0, s.unrest - 3);
            ECHO.Character.behave(pl, 'mercy', 0.2);
            ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} gave alms at the ${b.type} of ${s.name}.`, importance: 0, sid: s.id, rep: 2, factionRep: { lantern: 3 }, tag: 'protect' });
          }
          render();
        }));
      };
      render();
    },
    openKeep(s) {
      const game = ECHO.Game, world = game.world, pl = game.pl;
      const f = world.factions[s.faction];
      const ruler = f.ruler && world.npcs[f.ruler];
      const op = ruler ? (ruler.op[pl.charId] || 0) : 0;
      const rep = (s.rep && s.rep[pl.charId]) || 0;
      const body = UI.openPanel(`The keep of ${s.name}`, '', 'keep');
      const war = Object.keys(f.atWar);
      const envoys = s.id === f.capital ? world.plights.filter(p => p.kind === 'envoy' && p.status === 'open' && p.toFaction === f.id && pl.accepted.includes(p.id)) : [];
      body.innerHTML = `<p class="prose">${ruler ? `<b>${esc(P().fullTitle(world, ruler))}</b> rules ${esc(f.name)} from here.` : 'The throne is empty.'} ${f.tech.era ? `The court speaks of the ${ECHO.Civ.eraName(world, f.id)}.` : ''}</p>
        <p class="dim">Treasury: ${Math.round(f.treasury)} crowns · Taxes: ${Math.round(f.taxRate * 100)}% · ${war.length ? 'At war with ' + war.map(x => world.factions[x].name).join(', ') : 'At peace'}</p>
        <p>${rep > 40 ? 'The guards bow as you pass. Your name is known here, and loved.' : rep < -30 ? 'The guards watch you with open hostility.' : rep > 10 ? 'The steward nods; you are known here.' : 'The steward does not know your name.'}</p>
        ${ruler && op > 40 && pl.renown > 40 && !pl.knighted ? `<button data-k="1">Kneel before ${esc(ruler.first)}</button>` : ''}
        ${UI.realmCard(world, f)}
        ${f.type === 'kingdom' && s.id === f.capital ? `<div class="card"><h4>A royal charter</h4><div>Found a village of your own on the frontier. You must clear the land; then you name it, and rule it as its warden.</div><div class="dim">${esc(ECHO.Holding.canCharter(world, pl, f) || `The steward will draw it up for ${ECHO.Holding.charterCost(pl)} crowns.`)}</div><div class="row"><button data-charter="1" ${ECHO.Holding.canCharter(world, pl, f) ? 'disabled' : ''}>Petition for a charter</button></div></div>` : ''}
        ${envoys.map(p => `<div class="card" style="border-color:#c8a85a"><h4>A sealed letter from ${esc(world.factions[p.faction].name)}</h4><div class="row"><button data-envoy="${p.id}">Present it to the court</button></div></div>`).join('')}
        <h3 class="gold" style="margin-top:16px">Royal commissions and bounties</h3><div class="list" id="kb"></div>`;
      UI.fillPlights(body.querySelector('#kb'), s, p => ['bounty', 'clearsite', 'envoy', 'plot'].includes(p.kind) && (p.faction ? p.faction === f.id : true));
      const chb = body.querySelector('button[data-charter]');
      if (chb) chb.addEventListener('click', () => {
        const r = ECHO.Holding.charter(world, f, pl, ECHO.Sim.rngFor(world));
        if (r.error) return UI.toast(r.error, 'warn', 5);
        UI.closePanel();
        UI.modal({ title: 'A royal charter', html: `<p class="prose">${ruler ? esc(ruler.first) : 'The crown'} sets a seal to the parchment. Land in <b>${esc(r.region.name)}</b> is yours to settle — once it is safe.</p><p>Clear the land (it is marked on your map and tracked at the top of your screen), then come back here to name your village. The settlers will follow.</p>`, choices: [{ label: 'To the frontier', onPick: () => { pl.tracked = r.plight.id; } }] });
      });
      body.querySelectorAll('button[data-envoy]').forEach(b => b.addEventListener('click', () => {
        const p = ECHO.Plights.byId(world, b.dataset.envoy); if (!p) return;
        const from = world.factions[p.faction];
        from.relations[f.id] = f.relations[from.id] = U.clamp((from.relations[f.id] || 0) + 14, -100, 100);
        p.claimable = true; UI.claimPlight(p);
        UI.toast(`${ruler ? ruler.first : 'The court'} breaks the seal and reads in silence. "Tell ${from.short} we will consider it." Relations between ${from.short} and ${f.short} warm.`, 'legend', 6);
        UI.openKeep(s);
      }));
      const kb = body.querySelector('button[data-k]');
      if (kb) kb.addEventListener('click', () => {
        pl.knighted = f.id; pl.renown += 10;
        ECHO.Chronicle.deed(world, { text: `${P().fullTitle(world, ruler)} named ${pl.first} ${pl.last} a Knight of ${f.short}.`, importance: 2, sid: s.id, rep: 5, factionRep: { [f.id]: 10 } });
        UI.toast(`You are now a Knight of ${f.short}.`, 'legend', 6); UI.closePanel();
      });
    },
    // How a realm is being run: agenda, works, decrees, pacts.
    realmCard(world, f) {
      if (!ECHO.Realm || f.type !== 'kingdom') return '';
      const d = ECHO.Realm.describe(world, f);
      return `<div class="card"><h4>The state of ${esc(f.name)}</h4>
        ${d.agenda ? `<div>${d.ruler ? esc(d.ruler.first) + '\'s' : 'The crown\'s'} great aim: <b>${esc(d.agenda.name)}</b> — ${esc(d.agenda.desc)}.</div>` : ''}
        <div class="dim">${d.towns.length} towns, ${d.pop} people · coffers ${d.coffers} · taxes ${Math.round(f.taxRate * 100)}%</div>
        ${d.wars.length || d.pacts.length ? `<div>${esc(U.cap([...d.wars, ...d.pacts].join('; ')))}.</div>` : ''}
        ${d.building.length ? `<div>Being built: ${esc(d.building.join(', '))}.</div>` : ''}
        ${d.edicts.length ? `<div>Decrees in force: <b>${esc(d.edicts.join(', '))}</b>.</div>` : ''}
        ${d.plan ? `<div>Surveyors are marking out a new village in ${esc(world.regions[d.plan.region].name)}.</div>` : ''}
        ${d.tribute ? `<div class="ember">Paying tribute to ${esc(world.factions[d.tribute.to].short)}.</div>` : ''}
        ${ECHO.Watch ? `<div style="margin-top:6px"><b>The watch</b> — ${d.towns.filter(t => t.watch).map(t => `${esc(t.name)}: ${t.watch.safety > 75 ? 'safe' : t.watch.safety > 55 ? 'uneasy' : t.watch.safety > 35 ? '<span class="ember">frightened</span>' : '<span class="ember">lawless</span>'}${t.watch.ring ? ' (a thieves\' ring)' : ''}`).join(' · ')}</div>` : ''}</div>`;
    },
    openStatue(b, s) {
      const world = ECHO.Game.world;
      const l = ECHO.Legacy.legendOf(world, b.legend) || (ECHO.Game.pl && ECHO.Game.pl.charId === b.legend ? { name: ECHO.Game.pl.first + ' ' + ECHO.Game.pl.last, epithet: ECHO.Character.title(ECHO.Game.pl), deeds: [] } : null);
      if (!l) return;
      UI.openPanel('A statue', `<div class="epitaph"><h1 style="font-size:36px">${esc(l.name)}</h1><div class="ep">${esc(l.epithet || '')}</div>${l.died != null ? `<div class="dates">Born ${T.fmtShort(l.born)} · Died ${T.fmtShort(l.died)} — ${esc(l.cause)}</div>` : '<div class="dates">Still living</div>'}${(l.deeds || []).slice(-4).map(d => `<p>${esc(d)}</p>`).join('')}<p class="faint">Raised by the people of ${esc(s.name)}.</p></div>`, 'statue');
    },
    openHouse(b, s) {
      const game = ECHO.Game, world = game.world, pl = game.pl;
      if (b.owner === pl.charId && !b.legend) {
        const body = UI.openPanel('Your house', '', 'house');
        const render = () => {
          const F = ECHO.Life.FURNISH, have = b.furnish || {};
          body.innerHTML = `<p class="prose">Your bed, your hearth, your door. ${esc(s.name)} is home.</p><button data-sleep="1">Sleep until morning</button>
            <h4 class="ware-h">Make it yours</h4><div class="wares">${Object.entries(F).map(([k, f]) => `<div class="ware"><div class="ware-main"><div class="ware-top"><b>${esc(f.name)}</b>${have[k] ? '<span class="gold">done</span>' : `<span class="gold">${f.cost} cr</span>`}</div><div class="ware-use">${esc(f.desc)}</div>${have[k] ? '' : `<div class="row"><button class="small" data-furnish="${k}" ${pl.gold < f.cost ? 'disabled' : ''}>Have it done</button></div>`}</div></div>`).join('')}</div>`;
          body.querySelector('[data-sleep]').addEventListener('click', () => { UI.closePanel(); UI.sleepUntilMorning(s, b); });
          body.querySelectorAll('[data-furnish]').forEach(x => x.addEventListener('click', () => { const why = ECHO.Life.furnish(world, pl, x.dataset.furnish); if (why) UI.toast(why, 'warn', 3); else { ECHO.Sfx.play('coin'); if (ECHO.Interior.cur) ECHO.Interior.cur.rev = (ECHO.Interior.cur.rev || 0) + 1; } render(); }));
        };
        render();
        return;
      }
      const l = ECHO.Legacy.legendOf(world, b.legend);
      const items = (b.heirloom || []).map(id => world.items[id]).filter(it => it && it.holder === 'house:' + b.id);
      const kin = pl.legacyOf === b.legend;
      const body = UI.openPanel(`The house of ${l ? l.name : 'a legend'}`, '', 'house');
      const render = () => {
        const its = (b.heirloom || []).map(id => world.items[id]).filter(it => it && it.holder === 'house:' + b.id);
        body.innerHTML = `<p class="prose">Dust on the sill, a cold hearth. ${l ? `Here lived <b>${esc(l.name)}</b>, ${esc(l.epithet)}. ${kin ? 'Your kin.' : ''}` : ''}</p>
          ${its.length ? `<div class="list">${its.map(it => `<div class="card"><h4>${esc(it.name)}</h4><div class="dim">${it.history.map(h => esc(h.t)).join(' · ')}</div><div class="row"><button data-id="${it.id}">Take it</button></div></div>`).join('')}</div>` : '<p class="dim">Nothing of theirs remains.</p>'}
          ${b.heirloomGold ? `<p>A purse of ${b.heirloomGold} crowns is hidden in the hearthstones. <button data-gold="1">${kin ? 'Take your inheritance' : 'Take it'}</button></p>` : ''}`;
        body.querySelectorAll('button[data-id]').forEach(btn => btn.addEventListener('click', () => { game.takeItem(btn.dataset.id); if (!kin) ECHO.Character.behave(pl, 'betrayal', 0.2); render(); }));
        const gb = body.querySelector('button[data-gold]');
        if (gb) gb.addEventListener('click', () => { pl.gold += b.heirloomGold; b.heirloomGold = 0; if (!kin) { ECHO.Character.behave(pl, 'betrayal', 0.4); ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} robbed the house of ${l ? l.name : 'a dead hero'}.`, importance: 1, sid: s.id, rep: -6, tag: 'betray' }); } render(); });
      };
      render();
      void items;
    },

    // ------------------------------------------------------------ Plights
    fillPlights(el, s, filter) {
      const game = ECHO.Game, world = game.world, pl = game.pl;
      const distOf = p => { const o = ECHO.Sim.settlement(world, p.sid); return o ? U.dist(s.x, s.y, o.x, o.y) : 999; };
      const list = world.plights.filter(p => p.status === 'open' && (!filter || filter(p))).sort((a, b) => distOf(a) - distOf(b)).slice(0, 12);
      if (!list.length) { el.innerHTML = '<p class="dim">Nothing posted.</p>'; return; }
      el.innerHTML = list.map(p => {
        const left = p.deadline - world.day;
        const acc = pl.accepted.includes(p.id);
        const where = ECHO.Sim.settlement(world, p.sid);
        let action = '';
        if (p.claimable) action = `<button data-claim="${p.id}">Claim reward</button>`;
        else if (p.kind === 'famine') action = `<button data-deliver="${p.id}" ${pl.inv.food + (pl.inv.meat || 0) < 1 ? 'disabled' : ''}>Deliver food (${p.progress}/${p.need})</button>`;
        else if (p.kind === 'supply' && where && where.id === s.id) action = `<button data-supply="${p.id}" ${!(pl.inv[p.good] > 0) ? 'disabled' : ''}>Deliver ${p.good} (${p.progress}/${p.need}) — you have ${pl.inv[p.good] || 0}</button>`;
        else if (p.kind === 'treasure' && !acc) action = `<button data-accept="${p.id}" ${pl.gold < 15 ? 'disabled' : ''}>Buy the map (15 crowns)</button>`;
        else if (!acc) action = `<button data-accept="${p.id}">Take it on</button>`;
        else action = `<span class="dim">In your journal${p.kind === 'beasts' ? ` · ${p.progress}/${p.need} wolves` : ''}</span>`;
        return `<div class="card"><h4>${esc(UI.plightTitle(p))}</h4><div>${esc(p.text)}</div><div class="dim" style="font-size:13px;margin-top:4px">${where ? esc(where.name) + (where.id !== s.id ? ' (' + Math.round(distOf(p)) + ' leagues off)' : '') : ''} · ${left > 0 ? left + ' days left' : 'overdue'}${p.reward ? ' · reward ' + p.reward + ' crowns' : ''}</div><div class="row">${action}</div></div>`;
      }).join('');
      el.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
        const id = b.dataset.claim || b.dataset.deliver || b.dataset.accept || b.dataset.supply;
        const p = ECHO.Plights.byId(world, id);
        if (!p) return;
        if (b.dataset.accept) {
          if (p.kind === 'treasure') { pl.gold -= 15; UI.toast('The map is yours. The spot will glimmer when you are close; then dig (E).', 'info', 4); }
          else if (p.kind === 'lost') UI.toast(`Find ${world.npcs[p.victim] ? world.npcs[p.victim].first : 'them'} ${ECHO.Explore.dirFrom(ECHO.Sim.settlement(world, p.sid), p)} of town, and bring them home. Marked on your map.`, 'info', 4);
          else UI.toast('Added to your journal.', 'info', 2);
          pl.accepted.push(p.id);
        }
        if (b.dataset.supply) {
          const st = ECHO.Sim.settlement(world, p.sid);
          const n = Math.min(p.need - p.progress, pl.inv[p.good] || 0);
          pl.inv[p.good] -= n; p.progress += n; st.stock[p.good] = (st.stock[p.good] || 0) + n;
          if (p.progress >= p.need) { p.claimable = true; UI.claimPlight(p); }
        }
        if (b.dataset.claim) UI.claimPlight(p);
        if (b.dataset.deliver) {
          const st = ECHO.Sim.settlement(world, p.sid);
          let n = Math.min(p.need - p.progress, pl.inv.food + (pl.inv.meat || 0));
          while (n-- > 0) { if (pl.inv.food > 0) pl.inv.food--; else pl.inv.meat--; p.progress++; st.stock.food += 1; }
          st.hunger = Math.max(0, st.hunger - 0.05);
          if (p.progress >= p.need) { p.claimable = true; UI.claimPlight(p); }
        }
        UI.fillPlights(el, s, filter);
      }));
    },
    plightTitle(p) {
      return { kidnap: 'Taken by outlaws', beasts: 'Wolves at the door', famine: 'Hunger', apex: 'The beast', bounty: 'Bounty', clearsite: 'Royal commission: the frontier', envoy: 'Royal commission: a sealed letter', plot: 'Whispers of treason', supply: 'The masons\' need', delve: 'Something below', lost: 'Lost in the wilds', hunt: p.beast ? `The hunt for ${p.beast}` : 'A great beast', treasure: 'A treasure map', courier: 'A delivery', ring: p.ring ? `Who leads ${p.ring}?` : 'The thieves\' ring' }[p.kind] || 'A request';
    },
    claimText(p, npc) {
      return p.kind === 'kidnap' ? `You brought ${ECHO.Game.world.npcs[p.victim].first} home. I… thank you. Take this — it's everything I saved.` : 'You did it. Thank you. Here — as promised.';
    },
    claimPlight(p, named) {
      const game = ECHO.Game, world = game.world, pl = game.pl;
      if (p.status !== 'open') return;
      // the frontier: the honour of naming the new village
      if (p.kind === 'clearsite' && !named) {
        const f = world.factions[p.faction], plan = f && ECHO.Realm.st(f).plan;
        const used = new Set(world.settlements.map(s => s.name));
        const sugg = []; const rng = new ECHO.RNG(ECHO.hashStr(p.id)); for (let i = 0; i < 3; i++) sugg.push(ECHO.makePlaceName(rng, used));
        UI.modal({ title: 'Name the new village', html: `<p class="prose">The settlers will set out at once. ${f ? esc(f.short) + '\'s' : 'The'} steward asks what the village should be called — and you will be its warden, with a share of its dues each season.</p><input id="vname" maxlength="20" value="${esc(sugg[0])}" style="width:100%;font-size:18px;padding:6px"><p class="dim">Or: ${sugg.slice(1).map(esc).join(', ')}, or ${esc(pl.last)}'s Rest…</p>`,
          choices: [{ label: 'So be it', onPick: () => { const v = (document.querySelector('#vname') || {}).value; if (plan) { plan.cleared = true; plan.warden = pl.charId; plan.name = (v || sugg[0]).trim().slice(0, 20) || sugg[0]; plan.setOut = world.day; } UI.claimPlight(p, true); } }] });
        setTimeout(() => { const i = document.querySelector('#vname'); if (i) { i.focus(); i.select(); i.addEventListener('keydown', e => e.stopPropagation()); } }, 50);
        return;
      }
      pl.gold += p.reward || 0;
      pl.renown += p.kind === 'apex' ? 15 : p.kind === 'bounty' || p.kind === 'clearsite' || p.kind === 'ring' ? 10 : p.kind === 'hunt' || p.kind === 'delve' ? 7 : 5;
      ECHO.Character.behave(pl, 'protect', 0.8);
      const req = p.requester && world.npcs[p.requester];
      if (req) { req.op[pl.charId] = (req.op[pl.charId] || 0) + 40; P().remember(world, req, `was helped by ${pl.first} ${pl.last}`, 'gratitude', null, 4); }
      const s = ECHO.Sim.settlement(world, p.sid);
      const site = p.siteId && ECHO.Explore.byId(world, p.siteId);
      const toN = p.to && world.npcs[p.to];
      const what = {
        kidnap: () => `rescued ${P().name(world.npcs[p.victim])} from the Ashfang`, beasts: () => 'hunted down the duskwolves troubling ' + (s ? s.name : 'the land'), famine: () => `brought food to starving ${s ? s.name : ''}`,
        apex: () => 'answered the plea against the beast', bounty: () => 'collected the bounty on the Ashfang chief', clearsite: () => `cleared the frontier for the settlers of ${world.factions[p.faction] ? world.factions[p.faction].short : 'the realm'}`,
        envoy: () => `carried the crown's letter to ${world.factions[p.toFaction] ? world.factions[p.toFaction].name : 'a foreign court'}`, supply: () => `supplied the masons at ${s ? s.name : 'the works'}`,
        delve: () => `cleared ${site ? site.name : 'the place below'}`, lost: () => `brought ${world.npcs[p.victim] ? P().name(world.npcs[p.victim]) : 'a lost soul'} home from the wilds`,
        hunt: () => `killed ${p.beast}, the great wolf`, courier: () => `carried a delivery to ${toN ? P().name(toN) : 'another town'}`, ring: () => `broke ${p.ring || 'a thieves\' ring'} in ${s ? s.name : 'town'}`
      }[p.kind];
      const whatText = what ? what() : 'did as they were asked';
      p.status = 'done'; p.closed = world.day; p.outcome = `${pl.first} ${pl.last} ${whatText}.`;
      if (p.kind === 'hunt' && pl.inv.pelt) { pl.inv.pelt--; }
      ECHO.Chronicle.deed(world, { text: p.outcome, importance: 2, sid: p.sid, rep: 6, tag: 'protect', factionRep: s ? { [s.faction]: 4 } : {} });
      UI.toast(`${p.reward ? '+' + p.reward + ' crowns. ' : ''}${s ? 'The people of ' + s.name + ' will remember this.' : ''}`, 'mercy', 4);
    },
    openBoard(s, tab0) {
      const game = ECHO.Game, world = game.world, pl = game.pl;
      let tab = tab0 || 'pleas';
      const body = UI.openPanel(`Notice board — ${s.name}`, '', 'board');
      const render = () => {
        const tabs = [['pleas', 'Pleas'], ['requests', 'Requests'], ['bounty', 'Bounties'], ['watch', 'The watch'], ['law', 'The law here'], ['deeds', 'Property & business'], ['affairs', 'Town affairs']];
        let html = `<div class="tabs">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
        if (tab === 'pleas') html += '<p class="dim">Pleas, bounties and warnings, nailed up by people who will not wait forever.</p><div class="list" id="pl"></div>';
        else if (tab === 'law') {
          const lines = ECHO.Law.summary(world, s);
          const mine = ECHO.Law.openAgainstPlayer(world, pl).filter(c => c.faction === s.faction);
          html += `<div class="card"><h4>${esc(lines[0])}</h4>${lines.slice(1).map(l => `<div>${esc(l)}</div>`).join('')}</div>`;
          const fct = world.factions[s.faction];
          const eds = fct && fct.realm ? fct.realm.edicts.filter(e => e.until > world.day) : [];
          if (eds.length) html += `<div class="card"><h4 class="gold">Royal decrees</h4>${eds.map(e => `<div><b>${esc(ECHO.Realm.EDICTS[e.kind].name)}</b> — ${esc(ECHO.Realm.EDICTS[e.kind].desc)} <span class="dim">(${e.until - world.day} more days)</span></div>`).join('')}</div>`;
          if (mine.length) html += `<div class="card"><h4 class="ember">Charges against you</h4>${mine.map(c => `<div>${esc(U.cap(ECHO.Law.CRIME_WORD[c.kind]))}${c.victimName ? ' against ' + esc(c.victimName) : ''} — ${c.witnesses.length} witness${c.witnesses.length === 1 ? '' : 'es'}</div>`).join('')}<div class="dim">Guards will try to arrest you. You may give yourself up at the keep, or pay at the arrest if the law allows fines.</div></div>`;
          const trials = world.chronicle.filter(e => e.kind === 'crime' && e.sid === s.id && /tried|hanged|banished|stocks/.test(e.text)).slice(-6).reverse();
          if (trials.length) html += `<h4 class="ware-h">Recent judgements</h4>${trials.map(e => `<div class="card"><span class="dim">${T.fmtDate(e.d)}</span> — ${esc(e.text)}</div>`).join('')}`;
        } else if (tab === 'requests') html += ECHO.Dilemmas ? ECHO.Dilemmas.boardHtml(world, s, pl) : '';
        else if (tab === 'watch') html += UI.watchHtml(s);
        else if (tab === 'bounty') {
          const B = ECHO.Bounty, today = B.forTown(world, s), mine = B.mine(pl);
          html += `<p class="dim">Today's bounties. Carry up to three; a messenger pays you the moment the work is done, wherever you are. They lapse after five days.</p><div class="list">${today.map(b => { const taken = mine.some(x => x.id === b.id); return `<div class="card"><h4>${esc(B.text(b))}</h4><div class="gold">${b.gold} crowns · ${b.xp} experience</div><div class="row">${taken ? '<span class="dim">taken</span>' : `<button class="small" data-bounty="${b.id}">Take it</button>`}</div></div>`; }).join('')}</div>`;
          const act = mine.filter(b => !b.done);
          if (act.length) html += `<h4 class="ware-h">Your bounties</h4>${act.map(b => `<div class="card"><b>${esc(B.text(b))}</b> — ${b.have}/${b.need} <span class="dim">(${Math.max(0, 5 - (world.day - b.day))} days left)</span></div>`).join('')}`;
        }
        else if (tab === 'deeds') html += UI.deedsHtml(s);
        else {
          const lines = [];
          const wx = ECHO.Weather.at(world, s);
          lines.push(`Weather: ${ECHO.Weather.word(wx)}.`);
          const need = ECHO.Economy.need(world, s);
          lines.push(`Granaries: about ${Math.round(s.stock.food / Math.max(1, need))} days of bread. Bread costs ${s.prices.food} crowns.`);
          const st = ECHO.Production.status(world, s);
          for (const k of ['mill', 'mine', 'lumber']) { const x = st[k]; if (x) lines.push(`The ${ECHO.Production.KINDS[k].label}: ${x.run > 0 ? `working (${x.workers} at work)` : x.why}.`); }
          const sick = ECHO.Disease.sickIn(world, s);
          if (sick.length) lines.push(`<span class="ember">Sickness: ${sick.length} sick with ${ECHO.Disease.get(world, sick[0].sick.d).name}.${s.quarantine ? ' The gates are shut.' : ''}</span>`);
          else lines.push('No sickness in town.');
          html += `<div class="card">${lines.map(l => `<div>${l}</div>`).join('')}</div>`;
        }
        body.innerHTML = html;
        body.querySelectorAll('button[data-tab]').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; render(); }));
        if (tab === 'pleas') {
          UI.fillPlights(body.querySelector('#pl'), s);
          for (const p of world.plights) if (p.status === 'open' && p.kind === 'beasts' && p.progress >= p.need && !p.claimable) { p.claimable = true; UI.fillPlights(body.querySelector('#pl'), s); }
          for (const p of world.plights) if (p.status === 'open' && p.kind === 'apex' && p.playerDone && !p.claimable) { p.claimable = true; UI.fillPlights(body.querySelector('#pl'), s); }
        }
        if (tab === 'deeds') UI.bindDeeds(body, s, render);
        if (tab === 'requests') body.querySelectorAll('button[data-dq]').forEach(b => b.addEventListener('click', () => { const q = ECHO.Dilemmas.st(world).list.find(x => x.id === b.dataset.dq); if (q) { ECHO.Dilemmas.accept(game, q); UI.toast(`You take the request. ${q.who} will be waiting.`, 'info', 3); } render(); }));
        if (tab === 'bounty') body.querySelectorAll('button[data-bounty]').forEach(b => b.addEventListener('click', () => { const bt = ECHO.Bounty.forTown(world, s).find(x => x.id === b.dataset.bounty); const why = ECHO.Bounty.accept(world, pl, bt); if (why) UI.toast(why, 'warn', 3); else UI.toast('You tear the bounty from the board.', 'info', 2); render(); }));
        if (tab === 'watch') body.querySelectorAll('button[data-case]').forEach(b => b.addEventListener('click', () => { pl.investigating = b.dataset.case; UI.toast('You take down the notice. (Added to your journal.)', 'info', 3); render(); }));
      };
      render();
    },
    // The small discoveries: the land walked, the lost expedition, the herbarium.
    findsHtml(world, pl) {
      const D = ECHO.Discover;
      if (!D) return '';
      D.ensure(world);
      let html = '';
      const pct = Math.round(D.explored(world, pl) * 100);
      html += `<h3 class="gold">The land</h3><div class="card"><div>You have walked ${pct}% of the land.${pl.charted ? ` You were the first to chart ${pl.charted} place${pl.charted > 1 ? 's' : ''}.` : ''}${pl.cachesFound ? ` You have found ${pl.cachesFound} hidden cache${pl.cachesFound > 1 ? 's' : ''}.` : ' Cairns, hollow trees and loose stones sometimes hide things — look closely.'}</div></div>`;
      const E = world.expedition;
      if (E && E.pages.length) {
        const texts = D.pageTexts(world);
        html += `<h3 class="gold">The lost expedition of ${esc(E.first)} ${esc(E.last)}</h3><div class="card">${E.pages.map((p, i) => `<p class="prose" style="font-style:italic">${esc(texts[i])}</p>`).join('')}
          <div class="${E.done ? 'gold' : 'dim'}">${E.done ? 'You found the last camp, and brought the survey home.' : E.next ? `Next: ${E.next.camp ? 'the last camp' : 'another page'}, ${esc(E.next.hint)} (marked on your map).` : 'The trail goes cold here.'}</div>${E.next ? `<div class="row"><button class="small" data-track="expedition">${pl.tracked === 'expedition' ? 'Stop tracking' : 'Track the trail'}</button></div>` : ''}</div>`;
      }
      const herb = pl.herbarium || {};
      const known = Object.keys(D.HERBS).filter(k => herb[k]);
      html += `<h3 class="gold">Herbarium</h3><div class="card">${known.length ? known.map(k => `<div><b>${esc(D.HERBS[k].name)}</b> — ${esc(D.HERBS[k].desc)}. <span class="dim">Picked ${herb[k]}.</span></div>`).join('') : '<div class="dim">No rare plants yet.</div>'}<div class="dim" style="margin-top:6px">${known.length} of ${Object.keys(D.HERBS).length} rare plants found. Some open only by night; some only by day. Herbalists pay well for them.</div></div>`;
      return html;
    },
    // Your work for (and trouble with) the watch, for the journal.
    watchTasksHtml(world, pl) {
      const W = ECHO.Watch;
      if (!W) return '';
      let html = '';
      const c = pl.investigating && W.byId(world, pl.investigating);
      if (c && c.status === 'open') {
        const notes = [c.found.scene, ...Object.keys(c.found).filter(k => k[0] === 'w' && k.length > 2).map(k => `"${c.found[k]}"`)].filter(Boolean);
        html += `<div class="card" style="border-color:#9fd3ff"><h4>Investigating: the ${esc(W.KIND_WORD[c.kind])}${c.victimName ? ' of ' + esc(c.victimName) : ''}</h4><div>${esc(ECHO.Patrol.caseBrief(world, c))}</div>
          ${notes.length ? `<div style="margin-top:6px"><b>What you know:</b><ul>${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></div>` : ''}
          <div class="dim">${(c.playerProgress || 0) >= 0.6 ? 'You know enough to name someone. Tell a watchman.' : 'You need more before you can name anyone.'}</div><div class="row"><button class="small" data-track="${c.id}">${pl.tracked === c.id ? 'Stop tracking' : 'Track — point me there'}</button></div></div>`;
      } else if (c && c.status !== 'open') { pl.investigating = null; }
      if (pl.deputy) {
        const ds = ECHO.Sim.settlement(world, pl.deputy.sid);
        const d = pl.deputy.duty;
        html += `<div class="card"><h4>Deputy of the watch of ${esc(ds ? ds.name : '')}</h4><div>${d && d.kind === 'patrol' ? `On the rounds: ${d.points.filter(p => p.done).length} of ${d.points.length} posts walked (marked in gold).` : 'No duty right now. Ask a watchman what needs doing.'}</div><div class="dim">${pl.deputy.done} jobs done for the watch.</div></div>`;
      }
      const unrep = ECHO.Law.crimes(world).filter(x => x.by === 'player' && x.reported === false && x.status === 'open');
      if (unrep.length) html += `<div class="card" style="border-color:#d0563c"><h4 class="ember">Seen, but not yet told</h4>${unrep.map(x => `<div>The ${esc(ECHO.Law.CRIME_WORD[x.kind])}${x.victimName ? ' of ' + esc(x.victimName) : ''}: ${x.witnesses.filter(id => world.npcs[id] && world.npcs[id].status === 'alive').map(id => esc(world.npcs[id].first + ' ' + world.npcs[id].last)).join(', ') || 'no one living'} saw it.</div>`).join('')}<div class="dim">Until one of them reaches the watch, no one is looking for you.</div></div>`;
      return html;
    },
    // The watch of one town, as the notice board tells it.
    watchHtml(s) {
      const world = ECHO.Game.world, pl = ECHO.Game.pl, W = ECHO.Watch;
      const w = W.st(world, s);
      const bar = (v, good) => `<div class="t" style="display:inline-block;width:140px;height:8px;background:#2a2620;vertical-align:middle;margin:0 8px"><div style="height:100%;width:${Math.round(v)}%;background:${good ? '#9fd38a' : '#d0563c'}"></div></div>`;
      let html = `<div class="card"><h4>The watch of ${esc(s.name)}</h4>${W.describe(world, s).map(l => `<div>${esc(l)}</div>`).join('')}
        <div style="margin-top:8px">Safety ${bar(w.safety, w.safety > 50)}<span class="dim">${Math.round(w.safety)}</span> &nbsp; Trust in the watch ${bar(w.trust, w.trust > 45)}<span class="dim">${Math.round(w.trust)}</span></div></div>`;
      const open = W.cases(world).filter(c => c.sid === s.id && c.status === 'open' && c.by !== 'player' && c.kind !== 'smuggling');
      const mine = W.cases(world).filter(c => c.sid === s.id && c.status === 'open' && c.by === 'player');
      if (open.length) html += `<h4 class="ware-h">Wanted: information</h4>${open.slice(-8).reverse().map(c => {
        const wn = c.witnesses.filter(id => world.npcs[id] && world.npcs[id].status === 'alive').length;
        return `<div class="card"><h4>The ${esc(W.KIND_WORD[c.kind])}${c.victimName ? ' of ' + esc(c.victimName) : ''}</h4><div class="dim">${T.fmtShort(c.d)} · ${wn ? wn + ' witness' + (wn > 1 ? 'es' : '') : 'no witnesses'} · the watch pays 25 crowns for a name</div>
          <div class="row">${pl.investigating === c.id ? '<span class="gold">You are looking into this.</span>' : `<button class="small" data-case="${c.id}">Look into it</button>`}</div></div>`;
      }).join('')}`;
      else html += '<p class="dim">No crimes waiting on the watch.</p>';
      if (mine.length) html += `<div class="card" style="border-color:#d0563c"><h4 class="ember">The watch is asking questions</h4>${mine.map(c => `<div>About the ${esc(W.KIND_WORD[c.kind])}${c.victimName ? ' of ' + esc(c.victimName) : ''}: ${c.progress > 0.6 ? 'they are close to a name.' : c.progress > 0.3 ? 'they have heard of a stranger seen nearby.' : 'they know little.'}</div>`).join('')}<div class="dim">You know who did it.</div></div>`;
      const solved = W.cases(world).filter(c => c.sid === s.id && (c.status === 'solved' || c.status === 'wrong') && world.day - (c.solvedDay || c.d) < 40).slice(-5).reverse();
      if (solved.length) html += `<h4 class="ware-h">Closed lately</h4>${solved.map(c => `<div class="card dim">The ${esc(W.KIND_WORD[c.kind])}${c.victimName ? ' of ' + esc(c.victimName) : ''}: ${c.status === 'wrong' ? esc(c.scapegoatName || 'someone') + ' was punished for it' : c.by === 'player' ? 'a stranger was named' : esc(world.npcs[c.by] ? P().name(world.npcs[c.by]) : 'the culprit') + ' was caught' + (c.inAct ? ' in the act' : '')}.</div>`).join('')}`;
      html += `<p class="dim">${pl.deputy && pl.deputy.sid === s.id ? 'You are a deputy of this watch. Ask any watchman what needs doing.' : 'Talk to any watchman to offer your help, or to join the watch as a deputy.'}</p>`;
      return html;
    },
    // A mill, mine or lumber camp: who works it, who owns it, what it gives.
    openFacility(b, s) {
      const game = ECHO.Game, world = game.world, pl = game.pl;
      const K = ECHO.Production.KINDS[b.type];
      const st = ECHO.Production.status(world, s)[b.type];
      const owner = b.npcOwner && world.npcs[b.npcOwner];
      const workers = ECHO.People.residents(world, s).filter(n => n.prof === K.prof);
      const what = { mill: 'grinds the town\'s grain into flour — without it, bread comes slow and dear', mine: 'brings up the ore the smith needs for tools and arms', lumber: 'cuts the timber that keeps roofs mended and the forge burning' }[b.type];
      const state = b.fac.state;
      const lines = [`The ${K.label} of ${s.name} ${what}.`,
        state === 'working' || state === 'damaged' ? (workers.length ? `${workers.length} at work here: ${U.listJoin(workers.slice(0, 4).map(n => n.first))}${workers.length > 4 ? ' and others' : ''}.` : 'No one works it now. It stands idle.') : state === 'burned' ? 'It is a burned shell. The town feels the loss already.' : state === 'rebuilding' ? `Carpenters are rebuilding it — ${b.fac.days} days to go.` : 'It has fallen into ruin.',
        state === 'damaged' ? 'Flood-damaged: it limps along at half strength until it is repaired.' : '',
        owner ? `It belongs to ${P().name(owner)}.` : 'It belongs to the town.'];
      const choices = [{ label: 'Leave it be' }];
      if (state === 'working' || state === 'damaged') { const w = ECHO.Holding.shift(world, s, b.type); if (w) choices.unshift({ label: `Work a shift (about ${w.pay} crowns)`, sub: `Three hours ${w.what}.`, onPick: () => UI.work(s, b.type) }); }
      if (state === 'working' || state === 'damaged') choices.push({ label: `Set the ${K.label} alight`, sub: `Arson. ${s.name} will feel it — and if anyone sees you, so will you.`, onPick: () => UI.arson(b, s) });
      UI.modal({ title: `The ${K.label} of ${s.name}`, html: lines.filter(Boolean).map(l => `<p>${esc(l)}</p>`).join(''), choices });
      void st;
    },
    arson(b, s) {
      const game = ECHO.Game, world = game.world, pl = game.pl;
      const witnesses = ECHO.Court.witnessIds(game, game.pe.x, game.pe.y);
      ECHO.Production.burn(world, s, b, witnesses.length ? `${pl.first} ${pl.last}` : null);
      ECHO.Sfx.play('fireCast'); ECHO.Sfx.play('explode', { pitch: 0.7, vol: 0.6 });
      ECHO.Character.behave(pl, 'cruelty', 0.6); ECHO.Character.behave(pl, 'reckless', 0.3);
      const owner = b.npcOwner && world.npcs[b.npcOwner];
      if (witnesses.length) {
        ECHO.Court.record(game, 'arson', { s, witnesses, value: 100 });
        pl.wanted[s.faction] = Math.min(200, (pl.wanted[s.faction] || 0) + 70);
        ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} burned the ${ECHO.Production.KINDS[b.type].label} of ${s.name}.`, importance: 2, sid: s.id, rep: -15, factionRep: { [s.faction]: -15 }, tag: 'betray' });
        if (owner) { owner.op[pl.charId] = -90; ECHO.People.remember(world, owner, `saw ${pl.first} ${pl.last} burn the ${b.type}`, 'trauma', null, 4); }
        UI.toast('Someone saw you. They are shouting for the guard.', 'warn', 4);
      } else UI.toast('The flames take hold. No one saw.', 'info', 4);
      for (let i = 0; i < 30; i++) ECHO.Combat.fx.push({ kind: 'p', x: b.x + Math.random() * b.w, y: b.y + Math.random() * b.h, vx: (Math.random() - 0.5), vy: -1.5, t: 0, life: 0.8, color: Math.random() < 0.5 ? '#ffb347' : '#ff5a1f', size: 3 });
    },
    deedsHtml(s) {
      const game = ECHO.Game, world = game.world, pl = game.pl;
      const Pp = ECHO.Property;
      Pp.ensure(world);
      const H = Pp.holdings(world, pl);
      let html = `<p>You have <b class="gold">${Math.floor(pl.gold)}</b> crowns.</p>`;
      // your holdings
      const L = pl.ledger || {};
      const inc = Object.entries(L).map(([k, v]) => `<div>${esc(k)}: <span class="gold">${(v.prevWeek || v.week).toFixed(1)}</span> crowns last week · ${v.total.toFixed(0)} in all</div>`).join('');
      html += `<div class="card"><h4>Your holdings</h4>${H.houses.map(h => `<div>${h.rented ? 'Renting' : 'Own'} a house in ${esc(h.s.name)}${h.rented ? ` — ${h.b.rent} crowns a week` : ''}</div>`).join('')}
        ${H.shares.map(x => `<div>${Math.round(x.sh.frac * 100)}% of the ${x.b.type === 'lumber' ? 'lumber camp' : x.b.type} of ${esc(x.s.name)}${x.b.fac && x.b.fac.state !== 'working' ? ' — <span class="ember">' + x.b.fac.state + '</span>' : ''}</div>`).join('')}
        ${H.fields.map(f => `<div>${f.n} field${f.n > 1 ? 's' : ''} at ${esc((ECHO.Sim.settlement(world, f.sid) || {}).name || '?')}</div>`).join('')}
        ${H.loans.map(n => `<div>${esc(P().name(n))} owes you ${n.debt.amt} crowns${n.debt.defaulted ? ' — <span class="ember">overdue</span>' : ''}</div>`).join('')}
        ${!H.houses.length && !H.shares.length && !H.fields.length && !H.loans.length ? '<div class="dim">Nothing yet.</div>' : ''}${inc ? '<h4 class="ware-h">Income</h4>' + inc : ''}</div>`;
      // houses
      const sale = Pp.forSale(world, s).slice(0, 4);
      html += `<h4 class="ware-h">Houses</h4>` + (sale.length ? sale.map((x, i) => `<div class="card"><div>A house in ${esc(s.name)}${x.seller ? ` — offered by ${esc(P().name(x.seller))}${x.seller.debt ? ' (in debt)' : ''}` : ' — held by the town'}</div>
        <div class="row"><button class="small" data-buyh="${i}" ${pl.gold < x.price ? 'disabled' : ''}>Buy (${x.price} cr)</button>${!x.seller ? `<button class="small" data-renth="${i}" ${pl.gold < Math.round(x.price / 12) ? 'disabled' : ''}>Rent (${Math.round(x.price / 12)} cr a week)</button>` : ''}</div></div>`).join('') : '<div class="dim">No houses are for sale here right now.</div>');
      // businesses
      const biz = s.buildings.filter(b => ['mill', 'mine', 'lumber', 'smithy', 'inn'].includes(b.type));
      html += `<h4 class="ware-h">Invest in a business</h4>` + biz.map((b, i) => {
        const owner = b.npcOwner && world.npcs[b.npcOwner];
        const price = Math.round(Pp.businessValue(world, s, b) * 0.25);
        const state = b.fac ? b.fac.state : 'working';
        return `<div class="card"><div><b>${b.type === 'lumber' ? 'Lumber camp' : U.cap(b.type)}</b>${owner ? ' — owned by ' + esc(P().name(owner)) : ''} · <span class="${state === 'working' ? '' : 'ember'}">${state}</span></div><div class="dim">A quarter share pays a quarter of the takings — while it keeps working.</div><div class="row"><button class="small" data-inv="${i}" ${pl.gold < price ? 'disabled' : ''}>Buy a quarter share (${price} cr)</button></div></div>`;
      }).join('');
      const fieldPrice = Math.round(45 + (s.prosperity || 50) * 0.4);
      html += `<h4 class="ware-h">Land</h4><div class="card"><div>A field outside ${esc(s.name)}, worked by a tenant who sends you half the harvest. Income follows the seasons, the weather and the vermin.</div><div class="row"><button class="small" data-field="1" ${pl.gold < fieldPrice ? 'disabled' : ''}>Buy a field (${fieldPrice} cr)</button></div></div>`;
      UI._deeds = { sale, biz };
      return html;
    },
    bindDeeds(body, s, render) {
      const game = ECHO.Game, world = game.world, pl = game.pl, Pp = ECHO.Property;
      const D = UI._deeds;
      const say = t => { UI.toast(t, 'info', 5); render(); };
      body.querySelectorAll('button[data-buyh]').forEach(b => b.addEventListener('click', () => { const x = D.sale[+b.dataset.buyh]; say(Pp.buyHouse(world, pl, s, x.b, x.price)); }));
      body.querySelectorAll('button[data-renth]').forEach(b => b.addEventListener('click', () => { const x = D.sale[+b.dataset.renth]; say(Pp.rentHouse(world, pl, s, x.b)); }));
      body.querySelectorAll('button[data-inv]').forEach(b => b.addEventListener('click', () => say(Pp.invest(world, pl, s, D.biz[+b.dataset.inv]))));
      body.querySelectorAll('button[data-field]').forEach(b => b.addEventListener('click', () => say(Pp.buyField(world, pl, s))));
    },

    // ------------------------------------------------------------ Archive
    openArchive(s) {
      if (s && s.kind === 'capital' && ECHO.Story) ECHO.Story.flag(ECHO.Game.world, 'archive');
      const game = ECHO.Game, world = game.world, pl = game.pl;
      const body = UI.openPanel(`The archive of ${s.name}`, '', 'archive');
      let tab = 'chron', filter = 'all', page = 0;
      const render = () => {
        const tabs = [['chron', 'The Chronicle'], ['realm', 'The Realm'], ['legends', 'Legends'], ['tongue', 'The Old Tongue'], ['research', 'Patronage']];
        let html = `<div class="tabs">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
        if (tab === 'chron') {
          const kinds = ['all', 'war', 'politics', 'economy', 'crime', 'nature', 'era', 'legacy', 'player', 'intel', 'mystery', 'life', 'death', 'plight'];
          const all = world.chronicle.filter(e => (filter === 'all' ? e.imp >= 1 : e.kind === filter) || (filter === 'player' && e.char));
          const per = 60;
          const pages = Math.max(1, Math.ceil(all.length / per));
          page = U.clamp(page, 0, pages - 1);
          const slice = all.slice().reverse().slice(page * per, page * per + per);
          html += `<div class="tabs">${kinds.map(k => `<button class="small ${filter === k ? 'on' : ''}" data-f="${k}">${k}</button>`).join('')}</div>
            <div class="chron">${slice.map(e => `<div class="e i${e.imp} ${e.char === pl.charId ? 'me' : ''}"><span class="d">${T.fmtDate(e.d)}</span>${esc(e.text)}</div>`).join('') || '<p class="dim">Nothing recorded.</p>'}</div>
            <div class="row" style="margin-top:10px;display:flex;gap:8px;align-items:center"><button class="small" data-p="-1" ${page === 0 ? 'disabled' : ''}>Newer</button><span class="dim">${page + 1} / ${pages}</span><button class="small" data-p="1" ${page >= pages - 1 ? 'disabled' : ''}>Older</button></div>`;
          for (const e of slice) ECHO.Chronicle.learn(world, e, true);
        } else if (tab === 'realm') {
          html += Object.values(world.factions).filter(f => f.type !== 'wild').map(f => {
            const r = f.ruler && world.npcs[f.ruler];
            const towns = world.settlements.filter(x => x.faction === f.id);
            const doctr = ECHO.Intel.summary(world, f.id);
            const pop = towns.reduce((a, t) => a + P().residents(world, t).length, 0) + (f.type === 'bandits' ? world.camps.reduce((a, c) => a + c.members.length, 0) : 0);
            return `<div class="card"><h4>${esc(f.name)}${f.fallen ? ' (fallen)' : ''}</h4>
              <div>${r ? 'Ruled by ' + esc(P().fullTitle(world, r)) + '. ' : ''}${f.type === 'bandits' ? `${world.camps.filter(c => c.alive).length} known camps.` : `${towns.length} towns: ${esc(towns.map(t => t.name).join(', '))}.`} About ${pop} souls.</div>
              ${f.type !== 'bandits' ? `<div class="dim">${ECHO.Civ.eraName(world, f.id)}${f.tech.path ? ' — the ' + (f.tech.path === 'arcane' ? 'arcane' : 'mechanical') + ' path' : ''}. ${f.tech.inventions.length ? 'Known works: ' + f.tech.inventions.join(', ') + '.' : ''}</div>` : ''}
              ${Object.keys(f.atWar).length ? `<div class="ember">At war with ${Object.keys(f.atWar).map(x => world.factions[x].short).join(', ')}.</div>` : ''}
              ${doctr.length ? `<div style="margin-top:6px"><span class="dim">The scholars note they have adapted:</span><ul>${doctr.map(d => `<li>${esc(d)}</li>`).join('')}</ul></div>` : ''}</div>`;
          }).join('') + `<div class="card"><h4>The wild</h4><div class="dim">${ECHO.Intel.summary(world, 'wild').map(esc).join('<br>') || 'The beasts have not changed their ways.'}</div>
            <div class="dim" style="margin-top:6px">${world.lairs.map(l => `${esc(l.boss.name)} ${esc(l.boss.title)}: ${l.boss.alive ? (l.boss.absentUntil > world.day ? 'driven off, will return' : 'lives') : 'dead' + (l.boss.killedBy ? ', slain by ' + esc(l.boss.killedBy) : '')}`).join('<br>')}</div></div>
            <p class="dim">Since records began: ${world.stats.births} births, ${world.stats.deaths} deaths, ${world.stats.wars} wars, ${world.stats.famines} famines.</p>`;
        } else if (tab === 'legends') {
          html += world.legends.length ? world.legends.slice().reverse().map(l => `<div class="card"><h4>${esc(l.name)}, ${esc(l.epithet)}</h4><div class="dim">${T.fmtShort(l.born)} – ${T.fmtShort(l.died)} · ${esc(l.cause)}</div>${l.deeds.map(d => `<div>· ${esc(d)}</div>`).join('')}</div>`).join('') : '<p class="dim">No legends have yet passed into history.</p>';
          const living = P().alive(world).filter(n => n.renown > 25).sort((a, b) => b.renown - a.renown).slice(0, 8);
          html += `<h3 class="gold">Great names of the day</h3>${living.map(n => `<div>${esc(P().fullTitle(world, n))} — ${esc(P().role(world, n))}${n.mem.length ? '; ' + esc(n.mem.slice().sort((a, b) => b.w - a.w)[0].t) : ''}</div>`).join('')}`;
        } else if (tab === 'tongue') {
          const lang = world.lang;
          const known = Object.keys(lang.known);
          html += `<p class="prose">The ruins speak <b>${esc(lang.name)}</b>, a tongue no one has spoken in an age. You know ${known.length} of its words.</p>
            <div class="tablet" style="font-size:18px">${known.map(w => `<span class="w k">${esc(w)}</span> = <span class="w u">${ECHO.Mysteries.runes(world, w)}</span>`).join(' · ') || '<span class="dim">Nothing yet.</span>'}</div>
            <p>A scholar will puzzle out one word from the tablets you have studied, for <b class="gold">${lang.scholarCost}</b> crowns.</p><button data-tr="1" ${pl.gold < lang.scholarCost ? 'disabled' : ''}>Pay the scholar</button>`;
        } else if (tab === 'research') {
          const f = world.factions[s.faction];
          const next = ECHO.Civ.THRESH[f.tech.era + 1];
          html += `<p class="prose">The scholars of ${esc(f.short)} work toward the next age. ${next ? `They have gathered ${Math.round(f.tech.points)} of ${next} insights toward it.` : 'They have reached the end of known learning.'}</p>
            <p class="dim">Patrons who fund the archive speed the coming of new ages — and new ages change the world for everyone.</p>
            <div class="row" style="display:flex;gap:8px"><button data-don="50" ${pl.gold < 50 ? 'disabled' : ''}>Donate 50</button><button data-don="200" ${pl.gold < 200 ? 'disabled' : ''}>Donate 200</button></div>
            <p class="dim">You have given ${Math.round(pl.donated || 0)} crowns in all.</p>`;
          const unsold = ECHO.Explore.sites(world).filter(x => x.found && !(x.sold || {})[pl.charId]);
          const worth = x => x.cat === 'wonder' ? (x.namedBy === pl.first + ' ' + pl.last ? 40 : 25) : 12;
          const acct = unsold.reduce((a, x) => a + worth(x), 0);
          const pct = Math.round(ECHO.Discover.explored(world, pl) * 100);
          const mapFee = Math.max(0, Math.floor(pct / 10) - (pl.mapsSold || 0)) * 20;
          const crystals = pl.inv.crystal || 0;
          const survey = world.expedition && world.expedition.done && !pl.surveySold;
          html += `<h3 class="gold">Accounts of the wild</h3><p class="dim">The archivists pay for true accounts of places you have found with your own eyes — and more for places no one had charted.</p>
            ${unsold.length ? `<div>${unsold.map(x => esc(x.name)).join(', ')}</div><button data-acct="1">Dictate ${unsold.length} account${unsold.length > 1 ? 's' : ''} (${acct} crowns)</button>` : '<div class="dim">You have no new places to tell them of.</div>'}
            <div style="margin-top:8px">${mapFee ? `<button data-maps="1">Copy your map for the archive (${mapFee} crowns — you have walked ${pct}% of the land)</button>` : `<span class="dim">Your map (${pct}% of the land) is already in the archive.</span>`}</div>
            ${crystals ? `<div style="margin-top:8px"><button data-crys="1">Sell ${crystals} grotto crystal${crystals > 1 ? 's' : ''} (${crystals * 40} crowns)</button></div>` : ''}
            ${survey ? `<div style="margin-top:8px"><button data-survey="1">Give them the lost expedition's survey (200 crowns, and their undying gratitude)</button></div>` : ''}`;
        }
        body.innerHTML = html;
        body.querySelectorAll('button[data-tab]').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; page = 0; render(); }));
        body.querySelectorAll('button[data-f]').forEach(b => b.addEventListener('click', () => { filter = b.dataset.f; page = 0; render(); }));
        body.querySelectorAll('button[data-p]').forEach(b => b.addEventListener('click', () => { page += +b.dataset.p; render(); body.scrollTop = 0; }));
        const tr = body.querySelector('button[data-tr]');
        if (tr) tr.addEventListener('click', () => {
          pl.gold -= world.lang.scholarCost; world.lang.scholarCost = Math.round(world.lang.scholarCost * 1.12);
          const w = ECHO.Mysteries.scholarTranslate(world, ECHO.Sim.rngFor(world));
          UI.toast(w ? `The scholar works it out: "${ECHO.Mysteries.alien(world, w)}" means "${w}".` : 'There is nothing left to translate.', 'study', 5);
          UI.vaultCheck(); render();
        });
        const ac = body.querySelector('button[data-acct]');
        if (ac) ac.addEventListener('click', () => {
          const list = ECHO.Explore.sites(world).filter(x => x.found && !(x.sold || {})[pl.charId]);
          let amt = 0;
          for (const x of list) { x.sold = x.sold || {}; x.sold[pl.charId] = true; amt += x.cat === 'wonder' ? (x.namedBy === pl.first + ' ' + pl.last ? 40 : 25) : 12; }
          pl.gold += amt; ECHO.Civ.donate(world, s.faction, list.length * 4);
          UI.toast(`The archivists scratch down every word. +${amt} crowns.`, 'study', 4); render();
        });
        const mp = body.querySelector('button[data-maps]');
        if (mp) mp.addEventListener('click', () => { const pct = Math.round(ECHO.Discover.explored(world, pl) * 100); const n = Math.max(0, Math.floor(pct / 10) - (pl.mapsSold || 0)); pl.mapsSold = (pl.mapsSold || 0) + n; pl.gold += n * 20; ECHO.Civ.donate(world, s.faction, n * 6); UI.toast(`The archive's mapmakers copy your routes by lamplight. +${n * 20} crowns.`, 'study', 4); render(); });
        const cy = body.querySelector('button[data-crys]');
        if (cy) cy.addEventListener('click', () => { const n = pl.inv.crystal || 0; pl.inv.crystal = 0; pl.gold += n * 40; ECHO.Civ.donate(world, s.faction, n * 10); UI.toast(`The scholars hold the crystals up to the light, delighted. +${n * 40} crowns.`, 'study', 4); render(); });
        const sv = body.querySelector('button[data-survey]');
        if (sv) sv.addEventListener('click', () => { pl.surveySold = true; pl.gold += 200; pl.renown += 5; ECHO.Civ.donate(world, s.faction, 120); ECHO.Chronicle.deed(world, { text: `The archive of ${s.name} received the lost survey of ${world.expedition.first} ${world.expedition.last} from ${pl.first} ${pl.last}.`, importance: 2, sid: s.id, rep: 4 }); UI.toast('The archivists weep, a little, over the maps. +200 crowns.', 'legend', 5); render(); });
        body.querySelectorAll('button[data-don]').forEach(b => b.addEventListener('click', () => {
          const n = +b.dataset.don; pl.gold -= n; pl.donated = (pl.donated || 0) + n;
          ECHO.Civ.donate(world, s.faction, n);
          if (n >= 200) ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} endowed the archive of ${s.name}.`, importance: 1, sid: s.id, rep: 2 });
          const f = world.factions[s.faction]; const next = ECHO.Civ.THRESH[f.tech.era + 1];
          if (next && f.tech.points >= next) ECHO.Civ.advance(world, f, ECHO.Sim.rngFor(world));
          render();
        }));
      };
      render();
    },

    // ------------------------------------------------------------ Mysteries
    openTablet(ruin) {
      const game = ECHO.Game, world = game.world, pl = game.pl;
      const tab = world.lang.tablets[ruin.tablet];
      if (!tab) return;
      const body = UI.openPanel(`Inscription — ${U.cap(ruin.name)}`, '', 'tablet');
      const render = (learned) => {
        const toks = ECHO.Mysteries.render(world, tab);
        const prog = Math.round(ECHO.Mysteries.progress(world, tab) * 100);
        body.innerHTML = `<div class="tablet">${toks.map(t => t.w === '.' ? '<br>' : `<span class="w ${t.known ? 'k' : 'u'}" title="${t.known ? esc(t.alien) : ''}">${t.known ? esc(t.w) : t.runes}</span>`).join('')}</div>
          <p class="dim">${tab.rosetta ? 'Beneath the runes, a second hand has scratched the same words in a tongue you half-know. ' : ''}You understand ${prog}% of this. Studying takes an hour. ${learned && learned.length ? `<span class="gold">You learn: ${learned.map(w => `"${ECHO.Mysteries.alien(world, w)}" = ${w}`).join(', ')}.</span>` : learned ? 'Nothing comes clear this time.' : ''}</p>
          <button data-s="1" ${prog >= 100 ? 'disabled' : ''}>Study the inscription</button>`;
        const b = body.querySelector('button[data-s]');
        if (b) b.addEventListener('click', () => {
          ECHO.Sim.advance(world, 60);
          ECHO.Character.train(pl, 'study', 0.8);
          ECHO.Character.behave(pl, 'curiosity', 0.25);
          const l = ECHO.Mysteries.study(world, tab, pl.skills.study, ECHO.Sim.rngFor(world));
          render(l);
          UI.vaultCheck();
        });
      };
      render(null);
    },
    vaultCheck() {
      const world = ECHO.Game.world;
      const v = world.lang.vault;
      if (v && v.revealed && !v._told) {
        v._told = true;
        const ruin = world.ruins.find(r => r.id === v.ruinId);
        UI.toast(`The inscription at ${ruin ? ruin.name : 'the ruin'} is clear now: something lies hidden, and you know where. (Marked on your map.)`, 'legend', 9);
        ECHO.Chronicle.deed(world, { text: `${ECHO.Game.pl.first} ${ECHO.Game.pl.last} deciphered the inscription of ${ruin ? ruin.name : 'an ancient ruin'}.`, importance: 2, rep: 2 });
      }
    },
    openVault() {
      const game = ECHO.Game, world = game.world, pl = game.pl;
      const v = world.lang.vault;
      if (!v.revealed && !ECHO.Mysteries.canOpen(world)) { UI.openPanel('A carved stone', `<p class="prose">A stone, carved with runes worn almost smooth: <span class="tablet" style="display:inline;padding:2px 8px">${ECHO.Mysteries.runes(world, 'speak')} ${ECHO.Mysteries.runes(world, 'echo')}</span>. It means nothing to you — yet.</p>`, 'vault'); return; }
      if (!ECHO.Mysteries.canOpen(world)) { UI.openPanel('A carved stone', '<p class="prose">You know this is the door. But you do not know the word that opens it.</p>', 'vault'); return; }
      const body = UI.openPanel('The door beneath the stone', `<p class="prose">You speak the old word: <b>${esc(world.lang.lexicon.echo)}</b>. The stone answers with a sound like a held breath, and sinks.</p><button>Descend</button>`, 'vault');
      body.querySelector('button').addEventListener('click', () => {
        const reward = ECHO.Mysteries.openVault(world);
        if (!pl.spells.includes(v.reward)) pl.spells.push(v.reward);
        pl.renown += 20;
        ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} opened the sealed vault and learned ${reward.name}. No other world holds this secret.`, importance: 3, x: v.x, y: v.y, rep: 5 });
        body.innerHTML = `<p class="prose">Below, a round room. On its walls, the same words over and over, in a hundred hands: <i>many worlds echo one name</i>.</p>
          <p class="prose">At its centre, a mark of light that sinks into your palm. You have learned <b>${esc(reward.name)}</b>: ${esc(reward.desc)}</p>
          <p class="dim">Other worlds were sealed with other secrets.</p>`;
        ECHO.PlayerCtl.derivedT = 0;
      });
    },
    async openRift() {
      const game = ECHO.Game, world = game.world;
      const metas = (await ECHO.Save.list()).filter(m => m.id !== world.id);
      const body = UI.openPanel('The Rift', '', 'rift');
      if (!metas.length) { body.innerHTML = '<p class="prose">Through the tear in the air you see only grey fog, and a sense of distance without end. Somewhere beyond there must be other worlds — but none you know.</p><p class="dim">(Every world you begin from the title screen becomes visible through the Rift.)</p>'; return; }
      body.innerHTML = `<p class="prose">Through the Rift, other worlds — each one lived differently. Their histories echo into yours.</p><div class="list">${metas.map(m => `<div class="card"><h4>${esc(m.name)}</h4><div class="dim">${esc(m.date || '')} · ${m.population || '?'} souls · ${(m.eras || []).map(e => esc(e.name + ': ' + e.era)).join(' · ')}</div>${(m.legends || []).map(l => `<div>· The legend of <b>${esc(l.name)}</b>, ${esc(l.epithet)} — ${esc(l.cause)}</div>`).join('')}${(m.highlights || []).slice(-4).map(h => `<div class="faint">“${esc(h)}”</div>`).join('')}</div>`).join('')}</div>`;
      if (!world.riftSeen) {
        world.riftSeen = true;
        const pl = game.pl;
        ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} looked through the Rift and saw ${metas.length} other ${metas.length === 1 ? 'world' : 'worlds'}.`, importance: 3, x: world.rift.x, y: world.rift.y, rep: 3 });
      }
    },

    // ------------------------------------------------------------ Journal, map, character
    openJournal(tab0) {
      const game = ECHO.Game, world = game.world, pl = game.pl;
      let tab = tab0 || (pl.focus !== undefined ? 'ambition' : 'tasks'), kind = 'all';
      const body = UI.openPanel('Journal', '', 'journal');
      const render = () => {
        const unread = ECHO.Letters ? ECHO.Letters.unread(world).length : 0;
        const tabs = [['guide', 'Guide'], ['story', 'The Story'], ['ambition', 'Ambitions'], ['tasks', 'Promises'], ['people', 'People'], ['letters', `Letters${unread ? ' (' + unread + ')' : ''}`], ['places', 'Places'], ['realm', 'The realm'], ['wonders', 'Wonders'], ['heard', 'Heard & witnessed'], ['self', 'Your deeds'], ['pastimes', 'Crafts & pastimes'], ['help', 'How the world works']];
        let html = `<div class="tabs">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
        if (tab === 'guide') { html += ECHO.Guide.html(game); if (ECHO.Tutorial) ECHO.Tutorial.flag('guide'); }
        else if (tab === 'story') html += ECHO.Saga.html(world, pl);
        else if (tab === 'ambition') html += ECHO.Purpose.journalHtml(world, pl);
        else if (tab === 'tasks') {
          const mine = world.plights.filter(p => pl.accepted.includes(p.id));
          const open = mine.filter(p => p.status === 'open');
          const closed = mine.filter(p => p.status !== 'open').slice(-10).reverse();
          html += UI.watchTasksHtml(world, pl);
          html += open.length ? open.map(p => { const s = ECHO.Sim.settlement(world, p.sid); const left = p.deadline - world.day; return `<div class="card"><h4>${UI.plightTitle(p)}${p.claimable ? ' — <span class="gold">return to claim</span>' : ''}</h4><div>${esc(p.text)}</div><div class="dim">${s ? esc(s.name) : ''} · ${left > 0 ? left + ' days left' : 'overdue — the world may have moved on'}${p.kind === 'beasts' ? ` · ${p.progress}/${p.need}` : ''}${p.kind === 'famine' ? ` · ${p.progress}/${p.need} food delivered` : ''}</div><div class="row"><button class="small" data-track="${p.id}">${pl.tracked === p.id ? 'Stop tracking' : 'Track — point me there'}</button></div></div>`; }).join('') : '<p class="dim">You have made no promises. Notice boards and troubled people will ask.</p>';
          if (closed.length) html += `<h3 class="gold">How things ended</h3>${closed.map(p => `<div class="card"><h4>${UI.plightTitle(p)} — ${p.status === 'done' ? 'you saw it through' : p.status === 'resolved' ? 'resolved without you' : 'too late'}</h4><div class="dim">${esc(p.outcome || p.text)}</div></div>`).join('')}`;
        } else if (tab === 'people') {
          // Everyone you've met or who has strong feelings about you — and what they're living for.
          const ppl = Object.values(world.npcs).filter(n => n.status === 'alive' && (n._talkedDay || Math.abs(n.op[pl.charId] || 0) >= 30 || (n.mind && n.mind.goal && n.mind.goal.kind === 'avenge' && n.mind.goal.target.id === pl.charId)))
            .sort((a, b) => Math.abs(b.op[pl.charId] || 0) - Math.abs(a.op[pl.charId] || 0)).slice(0, 40);
          const feel = op => op > 60 ? '<span class="gold">devoted to you</span>' : op > 25 ? 'thinks well of you' : op < -60 ? '<span class="ember">hates you</span>' : op < -25 ? '<span class="ember">distrusts you</span>' : 'undecided about you';
          html += ppl.length ? ppl.map(n => {
            const st = ECHO.Sim.settlement(world, n.loc || n.home);
            const g = n.mind && n.mind.goal;
            const hunting = g && g.kind === 'avenge' && g.target.id === pl.charId;
            return `<div class="card"><h4>${esc(P().fullTitle(world, n))} <span class="dim">· ${esc(P().role(world, n))}${st ? ' of ' + esc(st.name) : ''}</span></h4>
              <div>${feel(n.op[pl.charId] || 0)}${hunting ? ' — <span class="ember">wants revenge for ' + esc(g.target.victim) + '</span>' : ''}</div>
              <div class="dim">${g ? esc(ECHO.Minds.describeGoal(world, n)) : 'No great plans right now.'}</div></div>`;
          }).join('') : '<p class="dim">You haven\'t really met anyone yet. Talk to people — everyone here has a life, and something they want.</p>';
        } else if (tab === 'letters') {
          const mine = ECHO.Letters.list(world).filter(l => l.delivered && l.to === pl.charId).slice().reverse();
          const icon = { joy: '❀', grief: '✝', threat: '✖', plea: '!' };
          html += mine.length ? mine.map(l => `<div class="card letter ${l.read ? '' : 'unread'}" data-letter="${l.id}" style="cursor:pointer${l.kind === 'threat' ? ';border-color:#8a3a2a' : ''}"><h4>${icon[l.kind] || '✉'} ${esc(l.title)} ${l.read ? '' : '<span class="gold">· new</span>'}</h4><div class="dim">From ${esc(l.fromName)}${l.place ? ' of ' + esc(l.place) : ''} · ${T.fmtDate(l.d)}</div>${openLetter === l.id ? `<div class="prose" style="white-space:pre-wrap;margin-top:8px;font-size:16px;background:rgba(240,228,200,0.06);padding:10px;border-left:2px solid #c8a85a">${esc(l.text)}</div>` : ''}</div>`).join('')
            : '<p class="dim">No letters yet. The people whose lives you touch will write to you — letters wait for you in the next town you enter.</p>';
        } else if (tab === 'wonders') {
          html += UI.wondersHtml(world, pl);
        } else if (tab === 'places') {
          const sites = ECHO.Explore.sites(world);
          const found = sites.filter(x => x.found);
          html += `<p class="dim">${found.length} of ${sites.length} places found. Explore the wilds — lookouts show you the land around them, and the archives pay for accounts of what you find.</p>`;
          html += found.length ? found.map(x => { const near = ECHO.World.nearestSettlement(world, x.x, x.y, t => t.faction !== 'ashfang'); return `<div class="card"><h4>${esc(U.cap(x.name))} <span class="dim">· ${esc(ECHO.Explore.label(x))}</span></h4><div class="dim">${esc(ECHO.Explore.desc(x))}</div><div class="dim" style="font-size:13px">${near ? Math.round(U.dist(near.x, near.y, x.x, x.y)) + ' leagues ' + ECHO.Explore.dirFrom(near, x) + ' of ' + esc(near.name) : ''}${x.cat === 'delve' ? (x.cleared ? ' · cleared' : ' · <span class="ember">not yet cleared</span>') : ''}</div></div>`; }).join('') : '<p class="dim">Nothing yet.</p>';
          html += UI.findsHtml(world, pl);
        } else if (tab === 'realm') {
          for (const f of Object.values(world.factions).filter(x => x.type === 'kingdom' || x.type === 'order')) {
            if (f.fallen) { html += `<div class="card"><h4>${esc(f.name)}</h4><div class="dim">Fallen.</div></div>`; continue; }
            const r = f.ruler && world.npcs[f.ruler];
            html += f.type === 'kingdom' ? UI.realmCard(world, f).replace('<h4>The state of', `<h4>${r ? esc(P().fullTitle(world, r)) + ' — ' : ''}`) : `<div class="card"><h4>${esc(f.name)}</h4><div>${r ? esc(P().fullTitle(world, r)) + ' tends the flame.' : ''}</div></div>`;
          }
          const ward = (pl.wardenOf || []).map(id => ECHO.Sim.settlement(world, id)).filter(Boolean);
          for (const v of ward.filter(v => v.warden === pl.charId)) html += `<div class="card" style="border-color:#c8a85a"><h4>${esc(v.name)} — your village</h4><div>${P().residents(world, v).length} people · ${(v.projects || []).filter(x => !x.done).length ? 'works under way' : 'no works under way'}</div><div class="row"><button class="small" data-hold="${v.id}">Send word to the reeve</button></div></div>`;
          html += `<div class="card"><h4>Your standing</h4><div>${pl.knighted ? 'Knight of ' + esc(world.factions[pl.knighted].short) + '. ' : ''}${ward.length ? 'Warden of ' + ward.map(x => esc(x.name)).join(', ') + ' — you receive a share of the dues each season.' : 'You hold no lands.'}</div><div class="dim">Clear a frontier site for the crown and you may name — and keep — the village that rises there.</div></div>`;
          const pol = ECHO.Chronicle.knownEntries(world).filter(e => e.kind === 'politics' || e.kind === 'war').slice(-14).reverse();
          if (pol.length) html += `<h3 class="gold">Recent affairs of state</h3><div class="chron">${pol.map(e => `<div class="e i${e.imp}"><span class="d">${T.fmtDate(e.d)}</span>${esc(e.text)}</div>`).join('')}</div>`;
        } else if (tab === 'heard') {
          const kinds = ['all', 'war', 'politics', 'economy', 'crime', 'nature', 'intel', 'era', 'mystery', 'legacy', 'plight'];
          const known = ECHO.Chronicle.knownEntries(world).filter(e => kind === 'all' || e.kind === kind).slice(-150).reverse();
          html += `<div class="tabs">${kinds.map(k => `<button class="small ${kind === k ? 'on' : ''}" data-k="${k}">${k}</button>`).join('')}</div><div class="chron">${known.map(e => `<div class="e i${e.imp} ${e.char === pl.charId ? 'me' : ''}"><span class="d">${T.fmtDate(e.d)}</span>${esc(e.text)}</div>`).join('') || '<p class="dim">You have heard nothing yet. Talk to people; listen in town squares.</p>'}</div>`;
        } else if (tab === 'pastimes') {
          html += ECHO.Pastimes ? ECHO.Pastimes.html(game) : '';
        } else if (tab === 'self') {
          const mine = world.chronicle.filter(e => e.char === pl.charId).slice(-60).reverse();
          html += `<div class="chron">${mine.map(e => `<div class="e i${e.imp} me"><span class="d">${T.fmtDate(e.d)}</span>${esc(e.text)}</div>`).join('') || '<p class="dim">Nothing yet. The world is waiting to see what you will do.</p>'}</div>`;
        } else {
          html += `<div class="prose" style="font-size:17px">
<b>Choose what this life is for.</b> Six roads — the Blade, the Crown, the Purse, the Lore, the Road and the Watch — each with five standings to rise through, each standing asking real things of you and giving something back. You rise on every road you walk; the one you follow is the one the line at the top of the screen points you along, with an arrow and, when it is near, a beacon over the place. Any quest in your journal can be tracked instead.

<b>Make a place your own.</b> Buy a royal charter at a capital's keep, clear the land, name your village and rule it: build houses, fields, a granary, walls, a watchtower, a fair; set its dues; invite settlers; watch it grow. Or take honest work in town — at the mill, the mine, the smithy, the inn — and ride the coaches between towns.

<b>Nothing waits for you.</b> Every person in this world has a life — they eat, trade, marry, feud, raise children, change trades, turn outlaw, go to war, and die. Requests for help have deadlines; if you don't come, someone else might — or no one will.

<b>Everyone wants something.</b> Each person has a purpose of their own — saving for a stall, courting a neighbour, mastering their trade, rising in the guard, a pilgrimage, the reeve's chair, getting the children away from the monster in the hills. Ask them what they want most; help them, and they remember it. They see their world for themselves: how safe it is, whether there is bread, whether their ruler is any good, and what they have heard about you.

<b>There is law.</b> Each realm — and each town — has its own. Read it on the notice board. Crimes are remembered with their witnesses; guards will try to arrest you; courts judge you, and townsfolk too.

<b>Every town keeps a watch.</b> Watchmen walk real rounds — the gate, the square, the market, the lanes — and carry lanterns at night. They are paid from the realm's treasury; unpaid or badly led, they grow lazy and take bribes. Townsfolk steal, burgle, brawl and sometimes kill; the watch chases, investigates, and catches some of them — and when it is corrupt or desperate, it hangs the wrong one. Rulers answer fear with more watchmen, night patrols, curfews and watchtowers. Read a town's mood on the board's <i>The watch</i> tab.

<b>Crimes have to be reported.</b> If someone sees you, they run for the watch — nothing is known until they get there. A crime nobody saw is still found: the watch asks who was seen nearby, and may one day stop you in the street with questions. Lie, find a friend to swear for you, bribe them, or confess. If they can't find who did it, they may punish someone else.

<b>You can serve the watch.</b> Catch thieves, break up brawls, work the cases the watch can't crack — search the scene, question the witnesses, and name the culprit (name the wrong one and an innocent pays). Join as a deputy for paid rounds and cases.

<b>Weather, sickness and work.</b> Droughts, floods and bitter winters change the harvest. Plagues spread along the roads. Mills, mines and lumber camps are worked by real people — lose them, and the town feels it. You can buy houses, fields and shares, and lend money; the notice board's Property page shows what's for sale.

<b>Actions come back to you.</b> Kill someone and their family may come for you. Heroes pay less at market and get gifts on the street; villains pay more, are refused service, and watch people run from them. Good friends will look the other way.

<b>Everything is connected.</b> The great beasts keep the vermin down. Kill one, and the vermin multiply; crops fail; bread prices climb; people go hungry, migrate, riot, turn to banditry. Kingdoms short of food grow desperate. Nobody will tell you this happened because of you. You will just see it.

<b>The world learns.</b> Factions remember how you kill them. Shoot them and they carry shields. Burn them and they ward against fire. Strike at night and they post watches. Beasts evolve the same way over generations. Bosses learn your habits mid-fight and remember you across encounters.

<b>You become what you do.</b> There is no class. Every skill grows by use, and your habits shape your body: aggression quickens your hands but thins your guard; reckless overcasting makes fire mighty and unstable; patience makes guarding cheap.

<b>Defeat is not the end.</b> Beasts leave you to be found by someone; people take you captive, take your sword, and grow in status. When fate runs out, you die for good — and become history. Your house stands, your sword lies somewhere in the world, and you can live again as someone new in the same world.

<b>The world has wonders.</b> On clear nights, wisps lead the patient to the Echoes of the old world. Stars fall, and leave star-iron behind. The restless dead linger by their homes with last words for someone. A white hind walks the forest edge at dawn and dusk — go quietly. Four festivals a year bring every town into the square. People who know you write letters. Each real day brings an omen; and if you let it, the world lives on while you're away. See the Wonders page of your journal.

<b>Fighting teaches you.</b> Fight the way you like and your body learns from it: enough perfect guards and you discover the riposte; enough rolls and you learn to lunge out of them; enough fire and your blade catches it. Fifteen techniques, each growing through three ranks. You can carry only a few at once — choose them on your character page (K).

<b>The wild is full of places.</b> Standing stones, lookouts, moonwells, old battlefields, shrines and wrecks each give something the first time — and some every night. Barrows, caves, crypts and outlaw hideouts can be entered and cleared for what they guard, and fill again in time.

<b>Below the world are dungeons.</b> Catacombs, goblin warrens, spider nests, troll dens, drowned sanctums and deep forges lie across the map, deeper and deadlier the further they are from the capitals (★ to ★★★★★★). Each has several floors joined by stairs, a cache on each floor and a lord on the last. Their monsters have abilities of their own — poison, webs, fire, healing, splitting, summoning, slams and charges — and resistances and weaknesses the bestiary records. What they drop sells at markets, or goes to a smith to hone your blade, restring your bow and make or reinforce your armour. Gear drops in five rarities, the best with powers of their own. Press <b>J</b> for the guide: what to do next, and how. People ask for help: a child lost in the woods, a great wolf with a name, a buried cache on a treasure map, a parcel for another town.

<b>Some places have no name.</b> Waterfalls, hot springs, crystal grottoes, the bones of a giant, a star's crater, a fairy ring — find one first and you name it, for good. Cairns, hollow trees and loose stones hide caches; one holds the first page of a lost expedition's journal, and each page leads to the next. Rare herbs open only at certain hours. The archives pay for accounts, maps and crystals.

<b>Rulers have aims.</b> Each ruler pursues an agenda — expansion, building, conquest, trade, faith or security — and it shows: new villages on the frontier, walls, granaries and roads, decrees nailed to the board, pacts and royal marriages, plots in the court. Clear the land for settlers and you name the village, and become its warden. Carry letters between courts. Expose a plot — or join it.

<b>The archives</b> in capitals keep the full chronicle, the state of the realm, and the old tongue. <b>The ruins</b> hold a language unique to this world. Study it.
</div>`;
        }
        body.innerHTML = html;
        body.querySelectorAll('button[data-hold]').forEach(b => b.addEventListener('click', () => UI.openHolding(ECHO.Sim.settlement(world, b.dataset.hold))));
        body.querySelectorAll('button[data-focus]').forEach(b => b.addEventListener('click', () => { pl.focus = b.dataset.focus; pl.tracked = null; ECHO.Purpose._html = null; ECHO.Purpose.t = 0; render(); }));
        body.querySelectorAll('button[data-track]').forEach(b => b.addEventListener('click', () => { pl.tracked = pl.tracked === b.dataset.track ? null : b.dataset.track; ECHO.Purpose._html = null; ECHO.Purpose.t = 0; render(); }));
        body.querySelectorAll('button[data-tab]').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; render(); }));
        body.querySelectorAll('button[data-k]').forEach(b => b.addEventListener('click', () => { kind = b.dataset.k; render(); }));
        body.querySelectorAll('[data-letter]').forEach(c => c.addEventListener('click', () => { const l = ECHO.Letters.list(world).find(x => x.id === c.dataset.letter); if (l) { l.read = true; openLetter = openLetter === l.id ? null : l.id; render(); } }));
        const lamp = body.querySelector('button[data-lamp]');
        if (lamp) lamp.addEventListener('click', () => { pl.inv.wisplamp--; UI.closePanel(); ECHO.Marvels.useWispLamp(game); });
      };
      let openLetter = null;
      render();
    },
    // The Wonders page: what you've found, what's still out there.
    wondersHtml(world, pl) {
      const W = ECHO.Wonders, st = W.state(world);
      const om = world.omen && world.omen.date === ECHO.Marvels.today() && world.omen.text ? world.omen : null;
      const echoes = st.echoes.slice().sort((a, b) => a.part - b.part);
      const found = echoes.filter(e => e.found).length;
      const nx = ECHO.Festivals.next(world);
      const shades = st.shades.filter(s => s.state === 'rest').length;
      const carrying = st.shades.filter(s => s.state === 'heard');
      const hind = st.hind === 'blessed' ? `<span class="gold">She blessed you${st.hindBlessings > 1 ? ' ' + st.hindBlessings + ' times' : ''}.</span>` : st.hind === 'slain' ? '<span class="ember">You killed her. The forest has not forgotten.</span>' : 'You have not met her. She walks at the forest\'s edge at dawn and dusk, and flees from anyone who comes noisily.';
      const charms = (pl.charms || []).filter(c => c.until > world.day).map(c => `<b>${esc(W.CHARMS[c.kind] ? W.CHARMS[c.kind].name : c.kind)}</b> <span class="dim">(${c.until - world.day} days) — ${esc(W.CHARMS[c.kind] ? W.CHARMS[c.kind].desc : '')}</span>`);
      return `${om ? `<div class="card" style="border-color:#9fd3ff"><h4 style="color:#bfe8ff">✧ Today's omen</h4><div class="prose">${esc(om.text)}</div></div>` : ''}
        ${charms.length ? `<div class="card"><h4>Charms upon you</h4><div>${charms.join('<br>')}</div></div>` : ''}
        <div class="card"><h4>✧ Echoes of the old world — ${found} of ${echoes.length}</h4>
          <div class="dim" style="margin-bottom:6px">On clear nights far from any town, wisps gather and lead the way. Each echo is a fragment of the story of the people who spoke ${esc(world.lang ? world.lang.name : 'the old tongue')}. Every fourth one restores a thread of fate.</div>
          ${echoes.map((e, i) => { const f = W.MYTH[e.part]; return e.found ? `<div style="margin:6px 0"><b class="gold">${i + 1}. ${esc(f.title)}</b> <span class="dim">— ${esc(f.scene)}</span><br><span style="color:#bfe8ff">“${esc(W.speech(world, f.say))}”</span></div>` : `<div class="dim" style="margin:4px 0">${i + 1}. ???${e.revealed ? ' <span style="color:#bfe8ff">— its place is marked on your map</span>' : ''}</div>`; }).join('')}
          ${pl.inv.wisplamp ? `<div class="row"><button class="small" data-lamp="1">Light the wisp lantern (${pl.inv.wisplamp})</button></div>` : ''}</div>
        <div class="card"><h4>Shades of the dead</h4><div>${shades ? `You have laid ${shades} to rest.` : 'The restless dead linger by their homes at night, with something left unsaid.'}</div>${carrying.map(s => `<div class="gold">You carry ${esc(s.first)}'s last words for ${esc(s.toName)}.</div>`).join('')}</div>
        <div class="card"><h4>✦ Fallen stars</h4><div>${st.stats.stars ? `You have found ${st.stats.stars}.` : 'On clear nights, watch the sky. Some stars don\'t burn out.'}${pl.inv.starshard ? ` You carry <b>${pl.inv.starshard}</b> shard${pl.inv.starshard > 1 ? 's' : ''} of star-iron — smiths, priests and merchants will want ${pl.inv.starshard > 1 ? 'them' : 'it'}.` : ''}</div></div>
        <div class="card"><h4>The White Hind</h4><div>${hind}</div></div>
        <div class="card"><h4>Festivals</h4><div>${nx ? esc(ECHO.Festivals.describe(world)) : ''}</div><div class="dim">${ECHO.Festivals.LIST.map(f => `${esc(f.title)} — ${esc(T.SEASONS[f.season])} ${ECHO.Festivals.DAY}`).join(' · ')}</div>${st.stats.festivals.length ? `<div class="dim">You have kept ${st.stats.festivals.length} festival${st.stats.festivals.length > 1 ? 's' : ''}${st.stats.wishes ? ` and sent up ${st.stats.wishes} wish${st.stats.wishes > 1 ? 'es' : ''}` : ''}.</div>` : ''}</div>`;
    },
    // Letters waiting at a town find you when you walk in.
    deliverLetters(why) {
      const world = ECHO.Game.world;
      if (!ECHO.Letters || !world) return 0;
      const got = ECHO.Letters.deliver(world);
      if (!got.length) return 0;
      ECHO.Music.stinger('letter');
      UI.toast(`${why}: ${got.length === 1 ? `a letter from ${got[0].fromName}` : `${got.length} letters`}. (J — Journal, Letters)`, 'legend', 7);
      return got.length;
    },
    openMap() { ECHO.WorldMap.open(ECHO.Game); },
    openCharacter() {
      if (ECHO.Tutorial) ECHO.Tutorial.flag('char');
      const game = ECHO.Game, world = game.world, pl = game.pl;
      const Ch = ECHO.Character;
      const bio = Ch.biography(world, pl);
      const skills = Object.entries(pl.skills).map(([k, v]) => `<div class="skill"><span>${ECHO.SKILLS[k].name}</span><div class="t"><div style="width:${v}%"></div></div><span>${Math.round(v)}</span></div>`).join('');
      const tends = [['aggression', 'Aggression'], ['caution', 'Patience'], ['reckless', 'Recklessness'], ['protect', 'Protectiveness'], ['mercy', 'Mercy'], ['cruelty', 'Cruelty'], ['betrayal', 'Faithlessness'], ['curiosity', 'Curiosity'], ['night', 'Night-work']]
        .map(([k, l]) => `<div class="skill tend"><span>${l}</span><div class="t"><div style="width:${Math.round(Ch.tendency(pl, k) * 100)}%"></div></div><span></span></div>`).join('');
      const items = pl.items.map(id => world.items[id]).filter(Boolean);
      const reps = world.settlements.filter(s => s.rep && s.rep[pl.charId]).map(s => `${s.name}: ${s.rep[pl.charId] > 0 ? '+' : ''}${Math.round(s.rep[pl.charId])}`);
      UI.openPanel(`${pl.first} ${pl.last}, ${Ch.title(pl)}`, `<div class="two"><div><p class="prose">${bio.map(esc).join(' ')}</p>
        <p class="dim">Renown ${Math.round(pl.renown)} · Armour ${ECHO.Gear.def(world, pl)} (${Math.round((1 - ECHO.Gear.taken(world, pl, 'melee')) * 100)}% of every blow turned) · Fate ${pl.fate}/3${pl.knighted ? ' · Knight of ' + world.factions[pl.knighted].short : ''}${pl.legacyOf ? ' · kin of ' + esc((ECHO.Legacy.legendOf(world, pl.legacyOf) || {}).name || '') : ''}</p>
        ${pl.spells.length ? `<p class="gold">Secrets: ${pl.spells.map(k => ECHO.Mysteries.REWARDS[k].name).join(', ')}</p>` : ''}
        ${UI.prowessHtml(world, pl)}
        ${UI.equipHtml(world, pl)}
        <h3 class="gold">Belongings</h3><div class="list">${items.map(it => `<div class="card" style="display:flex;gap:10px">${it.kind === 'sword' || it.kind === 'bow' || it.kind === 'armor' ? ECHO.GearArt.img(it, 'gear-ic small') : ''}<div style="flex:1"><h4 style="color:${ECHO.Gear.rarity(it.rarity).color}">${esc(it.name)}${it.plus ? ' +' + it.plus : ''}${it.id === pl.weapon ? ' <span class="gold">(wielded)</span>' : it.id === pl.bow ? ' <span class="gold">(your bow)</span>' : it.id === pl.armor ? ' <span class="gold">(worn)</span>' : ''}</h4><div style="font-size:13px">${esc(ECHO.Gear.line(it))}</div><div class="dim" style="font-size:13px">${it.history.slice(-4).map(h => `${T.fmtShort(h.d)}: ${esc(h.t)}`).join('<br>')}</div>${it.kind === 'sword' && it.id !== pl.weapon ? `<div class="row"><button class="small" data-w="${it.id}">Wield</button></div>` : it.kind === 'bow' && it.id !== pl.bow ? `<div class="row"><button class="small" data-bow="${it.id}">Use this bow</button></div>` : it.kind === 'armor' && it.id !== pl.armor ? `<div class="row"><button class="small" data-arm="${it.id}">Wear</button></div>` : it.kind === 'armor' ? `<div class="row"><button class="small" data-arm="">Take off</button></div>` : ''}</div></div>`).join('')}</div>
        ${ECHO.Gear.mats(pl).length ? `<h3 class="gold">Monster parts</h3><div>${ECHO.Gear.mats(pl).map(m => `<span style="color:${m.color}">◆</span> ${m.n} ${esc(m.name)}`).join(' · ')}</div><p class="dim" style="font-size:13px">Sell them at a market, or bring them to a smith to improve your gear.</p>` : ''}
        ${ECHO.Companions ? ECHO.Companions.card(world, pl) : ''}
        ${ECHO.Life ? ECHO.Life.card(world, pl) : ''}
        ${ECHO.Tech.pageHtml(pl)}
        ${reps.length ? `<h3 class="gold">Standing</h3><div class="dim">${reps.join(' · ')}</div>` : ''}</div>
        <div><h3 class="gold">Skills — grown by use</h3>${skills}<h3 class="gold" style="margin-top:16px">Tendencies — what you keep doing</h3>${tends}
        <p class="dim" style="font-size:13px">Tendencies change how you fight: aggression quickens strikes and weakens your guard; patience cheapens guarding; recklessness strengthens fire and makes it unstable.</p></div></div>`, 'char');
      document.querySelectorAll('#panel button[data-tech]').forEach(b => b.addEventListener('click', () => { if (ECHO.Tech.toggle(b.dataset.tech) === false) UI.toast(`You can only carry ${ECHO.Tech.slots(pl)} techniques. Set one down first.`, 'warn', 3); UI.openCharacter(); }));
      document.querySelectorAll('#panel button[data-w]').forEach(b => b.addEventListener('click', () => { pl.weapon = b.dataset.w; ECHO.PlayerCtl.derivedT = 0; UI.openCharacter(); }));
      document.querySelectorAll('#panel button[data-dismiss]').forEach(b => b.addEventListener('click', () => { ECHO.Companions.dismiss(game); UI.openCharacter(); }));
      document.querySelectorAll('#panel button[data-bow]').forEach(b => b.addEventListener('click', () => { pl.bow = b.dataset.bow; ECHO.PlayerCtl.derivedT = 0; UI.openCharacter(); }));
      document.querySelectorAll('#panel button[data-arm]').forEach(b => b.addEventListener('click', () => { pl.armor = b.dataset.arm || null; ECHO.PlayerCtl.derivedT = 0; UI.openCharacter(); }));
    }
  };
  ECHO.on('chronicle', e => UI.onChronicle(e));
  ECHO.on('doctrine', () => {});
  ECHO.on('vault:revealed', () => { if (ECHO.Game.pl) UI.vaultCheck(); });
})();
