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
        if (In.pressed.has('Tab') || In.pressed.has('j')) UI.openJournal();
        if (In.pressed.has('m')) UI.openMap();
        if (In.pressed.has('c') && !In.down.has('Control')) { /* c also sneaks; character sheet on K */ }
        if (In.pressed.has('k')) UI.openCharacter();
      } else if (UI.panelOpen) {
        if ((In.pressed.has('Tab') || In.pressed.has('j')) && UI.panelKind === 'journal') UI.closePanel();
        else if (In.pressed.has('m') && UI.panelKind === 'map') UI.closePanel();
        else if (In.pressed.has('k') && UI.panelKind === 'char') UI.closePanel();
      }
      UI.hud(game, dt);
    },
    hud(game, dt) {
      const pl = game.pl, world = game.world;
      const set = (sel, v) => { const el = $(sel); if (el && el.textContent !== v) el.textContent = v; };
      set('#hud-hero', pl.first + ' ' + pl.last);
      set('#hud-title', ECHO.Character.title(pl));
      $('#hud-left .hp .fill').style.transform = `scaleX(${U.clamp(pl.hp / pl.maxHp, 0, 1)})`;
      set('#hud-left .hp span', Math.ceil(pl.hp) + ' / ' + Math.round(pl.maxHp));
      $('#hud-left .sta .fill').style.transform = `scaleX(${U.clamp(pl.stamina / pl.maxSta, 0, 1)})`;
      $('#hud-left .mana .fill').style.transform = `scaleX(${U.clamp(pl.mana / pl.maxMana, 0, 1)})`;
      set('#hud-fate', 'Fate ' + '◆'.repeat(Math.max(0, pl.fate)) + '◇'.repeat(Math.max(0, 3 - pl.fate)));
      const wanted = Object.entries(pl.wanted || {}).filter(([, v]) => v > 20).map(([f]) => world.factions[f].short);
      set('#hud-wanted', wanted.length ? 'Wanted by ' + wanted.join(', ') : '');
      set('#hud-time', T.clock(world.minute));
      set('#hud-date', T.fmtDate(world.day));
      const s = game.currentSid ? ECHO.Sim.settlement(world, game.currentSid) : null;
      const reg = game.currentRegion;
      set('#hud-place', s ? `${s.name} · ${reg ? U.cap(reg.name) : ''}` : (reg ? U.cap(reg.name) : ''));
      const w = world.items[pl.weapon];
      const inv = `<span>${w ? esc(w.name) : 'Bare hands'}</span><span>Arrows <b>${pl.inv.arrows}</b></span><span>Food <b>${pl.inv.food + (pl.inv.meat || 0)}</b></span><span>Herbs <b>${pl.inv.herbs}</b></span><span>Crowns <b>${Math.floor(pl.gold)}</b></span>${pl.companion && world.npcs[pl.companion] ? `<span>With <b>${esc(world.npcs[pl.companion].first)}</b></span>` : ''}`;
      if (UI._inv !== inv) { $('#hud-inv').innerHTML = inv; UI._inv = inv; }
      if (UI.bossEnt) {
        const e = UI.bossEnt;
        if (e.dead) UI.bossBar(null);
        else $('#bossbar .fill').style.transform = `scaleX(${U.clamp(e.hp / e.maxHp, 0, 1)})`;
      }
      UI.miniT -= dt;
      if (UI.miniT <= 0) { UI.miniT = 0.4; UI.minimap(game); }
    },
    minimap(game) {
      const world = game.world, pe = ECHO.Interior.cur ? { x: game.pl.x, y: game.pl.y, dir: game.pe.dir } : game.pe;
      const c = $('#minimap'), g = c.getContext('2d');
      if (!UI.miniBase) UI.miniBase = ECHO.Renderer.mapImage(world);
      const scale = 2.2;
      g.imageSmoothingEnabled = false;
      g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
      const sx = pe.x - c.width / scale / 2, sy = pe.y - c.height / scale / 2;
      g.drawImage(UI.miniBase, sx, sy, c.width / scale, c.height / scale, 0, 0, c.width, c.height);
      // fog
      const cw = Math.ceil(world.W / 4);
      g.fillStyle = '#0b0a0f';
      for (let y = Math.floor(sy / 4); y <= Math.ceil((sy + c.height / scale) / 4); y++) for (let x = Math.floor(sx / 4); x <= Math.ceil((sx + c.width / scale) / 4); x++) {
        if (x < 0 || y < 0 || x >= cw || !game.pl.explored[y * cw + x]) g.fillRect((x * 4 - sx) * scale, (y * 4 - sy) * scale, 4 * scale + 1, 4 * scale + 1);
      }
      for (const s of world.settlements) {
        const x = (s.x - sx) * scale, y = (s.y - sy) * scale;
        if (x < -10 || y < -10 || x > c.width + 10 || y > c.height + 10 || !game.explored(s.x, s.y)) continue;
        g.fillStyle = world.factions[s.faction].color; g.fillRect(x - 3, y - 3, 6, 6);
      }
      for (const cp of world.camps) if (cp.seen && cp.alive) { const x = (cp.x - sx) * scale, y = (cp.y - sy) * scale; g.fillStyle = '#d0563c'; g.fillRect(x - 2, y - 2, 4, 4); }
      g.fillStyle = '#fff'; g.fillRect(c.width / 2 - 2, c.height / 2 - 2, 4, 4);
    },

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
      $('#bossbar .name').textContent = `${e.boss.name} ${e.boss.title}`;
    },
    onNewDay(world) {
      const d = T.dateOf(world.day);
      if (d.dayOfSeason === 1) UI.banner(d.season, `Year ${d.year}`, true);
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
      say(ECHO.Dialogue.greeting(world, npc, pl));
      const render = () => {
        opts.innerHTML = '';
        const add = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.addEventListener('click', fn); opts.appendChild(b); };
        add('What news?', () => { const r = ECHO.Dialogue.news(world, npc); say(r.text); });
        add('Tell me about yourself.', () => say(ECHO.Dialogue.aboutSelf(world, npc)));
        add('What of this place?', () => say(ECHO.Dialogue.aboutPlace(world, npc)));
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
    priceOf(s, g) {
      if (g === 'meat') return U.round1(s.prices.food * 1.2);
      if (g === 'hide') return U.round1(6 + s.prosperity / 25);
      return s.prices[g];
    },
    openMarket(s) {
      const game = ECHO.Game, world = game.world, pl = game.pl;
      const body = UI.openPanel(`Market of ${s.name}`, '', 'market');
      const render = () => {
        const hist = s.priceHistory.slice(-20);
        const max = Math.max(...hist, 1);
        const spark = hist.map((v, i) => `<div title="${v}" style="display:inline-block;width:6px;margin-right:1px;height:${Math.max(2, v / max * 34)}px;background:${v > ECHO.GOODS.food.base * 2 ? '#c8463a' : '#c8a85a'}"></div>`).join('');
        let rows = '';
        for (const g of UI.goods) {
          const price = UI.priceOf(s, g);
          const stock = g === 'meat' || g === 'hide' ? '—' : Math.round(s.stock[g]);
          const sell = U.round1(price * 0.85);
          rows += `<tr><td>${U.cap(g)}</td><td>${stock}</td><td class="gold">${price}</td><td>${sell}</td><td>${pl.inv[g] || 0}</td>
            <td><button class="small" data-buy="${g}" ${g === 'meat' || g === 'hide' || s.stock[g] < 1 || pl.gold < price ? 'disabled' : ''}>Buy 1</button>
            <button class="small" data-buy5="${g}" ${g === 'meat' || g === 'hide' || s.stock[g] < 5 || pl.gold < price * 5 ? 'disabled' : ''}>Buy 5</button>
            <button class="small" data-sell="${g}" ${!(pl.inv[g] > 0) ? 'disabled' : ''}>Sell 1</button>
            <button class="small" data-sellall="${g}" ${!(pl.inv[g] > 0) ? 'disabled' : ''}>Sell all</button></td></tr>`;
        }
        body.innerHTML = `<div class="two"><div><p class="dim">Prices move with what is in the stores. Bread here has cost:</p><div style="height:36px;display:flex;align-items:flex-end">${spark}</div>
          <p class="dim">${s.hunger > 0.2 ? `<span class="ember">The town is hungry.</span> Selling food here eases it — and people remember.` : s.stock.food > ECHO.Economy.need(world, s) * 12 ? 'The granaries are full.' : 'Stores are ordinary.'}</p></div>
          <div><p>You have <b class="gold">${Math.floor(pl.gold)}</b> crowns.</p><p class="dim">Arrows: 10 for 6 crowns.</p><button data-arrows="1" ${pl.gold < 6 ? 'disabled' : ''}>Buy 10 arrows</button></div></div>
          <table class="grid"><tr><th>Good</th><th>In stores</th><th>Buy</th><th>Sell</th><th>You</th><th></th></tr>${rows}</table>`;
        body.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => {
          const d = btn.dataset;
          if (d.arrows) { pl.gold -= 6; pl.inv.arrows += 10; }
          const buy = (g, n) => { for (let i = 0; i < n; i++) { const p = UI.priceOf(s, g); if (pl.gold < p || s.stock[g] < 1) break; pl.gold -= p; s.stock[g] -= 1; pl.inv[g] = (pl.inv[g] || 0) + 1; s.wealth += p; ECHO.Economy.updatePrices(world, s); } };
          const sell = (g, n) => {
            let sold = 0;
            for (let i = 0; i < n; i++) {
              if (!(pl.inv[g] > 0)) break;
              const p = U.round1(UI.priceOf(s, g) * 0.85);
              pl.inv[g]--; pl.gold += p; sold++;
              if (g === 'meat') s.stock.food += 1.2; else if (g !== 'hide') s.stock[g] += 1;
              ECHO.Economy.updatePrices(world, s);
            }
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
        { kind: 'bow', name: 'Recurve bow', dmg: 16, price: 90 },
        { kind: 'bow', name: era >= 2 ? (arcane ? 'Wand-bow' : 'Spring bow') : null, dmg: 22, price: 210 }
      ].filter(w => w.name);
      const body = UI.openPanel(`Smithy of ${s.name}`, '', 'smithy');
      const render = () => {
        body.innerHTML = `<p class="prose">${smith ? `<b>${esc(P().name(smith))}</b> wipes soot from ${smith.sex === 'f' ? 'her' : 'his'} hands. "Everything here is my own work."` : 'The forge is cold; an apprentice minds the stock.'}</p>
          <p>You have <b class="gold">${Math.floor(pl.gold)}</b> crowns. Wielding: <b>${esc(world.items[pl.weapon] ? world.items[pl.weapon].name : 'nothing')}</b>.</p>
          <table class="grid"><tr><th>Item</th><th>Power</th><th>Price</th><th></th></tr>${wares.map((w, i) => `<tr><td>${w.name}</td><td>${w.dmg}</td><td class="gold">${w.price}</td><td><button class="small" data-i="${i}" ${pl.gold < w.price ? 'disabled' : ''}>Buy</button></td></tr>`).join('')}</table>
          <p class="dim">The smith buys hides at ${UI.priceOf(s, 'hide')} each.</p><button data-hides="1" ${!(pl.inv.hide > 0) ? 'disabled' : ''}>Sell all hides (${pl.inv.hide || 0})</button>`;
        body.querySelectorAll('button[data-i]').forEach(b => b.addEventListener('click', () => {
          const w = wares[+b.dataset.i];
          pl.gold -= w.price;
          const it = ECHO.Character.makeItem(world, { kind: w.kind, name: w.name, dmg: w.dmg, holder: 'player', made: { by: smith ? P().name(smith) : 'a smith', at: s.name, d: world.day }, history: [{ d: world.day, t: `forged by ${smith ? P().name(smith) : 'a smith'} of ${s.name}` }] });
          pl.items.push(it.id);
          if (w.kind === 'sword') pl.weapon = it.id; else pl.bow = it.id;
          s.wealth += w.price; if (smith) smith.wealth += w.price * 0.5;
          ECHO.PlayerCtl.derivedT = 0;
          UI.toast(`You buy ${w.name}, made by ${smith ? smith.first : 'the smith'}.`, 'info', 3);
          render();
        }));
        const hb = body.querySelector('button[data-hides]');
        if (hb) hb.addEventListener('click', () => { const n = pl.inv.hide || 0; pl.gold += n * UI.priceOf(s, 'hide'); pl.inv.hide = 0; render(); });
      };
      render();
    },
    openInn(s) {
      const game = ECHO.Game, world = game.world, pl = game.pl;
      const keeper = P().residents(world, s).find(n => n.prof === 'innkeeper');
      const body = UI.openPanel(`The inn at ${s.name}`, '', 'inn');
      const room = 5, week = 25, season = 70;
      body.innerHTML = `<p class="prose">${keeper ? `<b>${esc(P().name(keeper))}</b> pours you something warm. "${esc(ECHO.Dialogue.ambient(world, keeper, null) || 'What\'ll it be?')}"` : 'The common room is warm and loud.'}</p>
        <div class="list">
          <div class="card"><h4>A bed for the night — ${room} crowns</h4><div class="dim">Sleep until morning. Wake whole.</div><div class="row"><button data-a="night" ${pl.gold < room ? 'disabled' : ''}>Sleep</button></div></div>
          <div class="card"><h4>A hot meal — 2 crowns</h4><div class="dim">Bread for the road.</div><div class="row"><button data-a="meal" ${pl.gold < 2 ? 'disabled' : ''}>Buy (adds 2 food)</button></div></div>
          <div class="card"><h4>Stay a week — ${week} crowns</h4><div class="dim">Seven days of rest. The world will not wait for you.</div><div class="row"><button data-a="week" ${pl.gold < week ? 'disabled' : ''}>Stay</button></div></div>
          <div class="card"><h4>Stay the season — ${season} crowns</h4><div class="dim">Fifteen days. Kingdoms may rise and fall.</div><div class="row"><button data-a="season" ${pl.gold < season ? 'disabled' : ''}>Stay</button></div></div>
        </div>`;
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
    },
    sleepUntilMorning(s) {
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
      });
    },
    openShrine(s, b) {
      const game = ECHO.Game, world = game.world, pl = game.pl;
      const priest = P().residents(world, s).find(n => n.prof === 'priest');
      const body = UI.openPanel(b.type === 'temple' ? `Temple of the Lantern, ${s.name}` : `Shrine of ${s.name}`, '', 'shrine');
      const render = () => {
        body.innerHTML = `<p class="prose">${priest ? `<b>${esc(P().fullTitle(world, priest))}</b> tends the flame. "May it keep you."` : 'A single candle burns before the flame-carved stone.'}</p>
          <div class="list"><div class="card"><h4>Ask for healing — 5 crowns</h4><div class="row"><button data-a="heal" ${pl.gold < 5 || pl.hp >= pl.maxHp ? 'disabled' : ''}>Be healed</button></div></div>
          <div class="card"><h4>Give alms — 20 crowns</h4><div class="dim">Feeds the poor of ${esc(s.name)}. The Lantern remembers generosity.</div><div class="row"><button data-a="alms" ${pl.gold < 20 ? 'disabled' : ''}>Give</button></div></div></div>`;
        body.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => {
          if (btn.dataset.a === 'heal') { pl.gold -= 5; pl.hp = pl.maxHp; game.pe.burn = 0; }
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
      body.innerHTML = `<p class="prose">${ruler ? `<b>${esc(P().fullTitle(world, ruler))}</b> rules ${esc(f.name)} from here.` : 'The throne is empty.'} ${f.tech.era ? `The court speaks of the ${ECHO.Civ.eraName(world, f.id)}.` : ''}</p>
        <p class="dim">Treasury: ${Math.round(f.treasury)} crowns · Taxes: ${Math.round(f.taxRate * 100)}% · ${war.length ? 'At war with ' + war.map(x => world.factions[x].name).join(', ') : 'At peace'}</p>
        <p>${rep > 40 ? 'The guards bow as you pass. Your name is known here, and loved.' : rep < -30 ? 'The guards watch you with open hostility.' : rep > 10 ? 'The steward nods; you are known here.' : 'The steward does not know your name.'}</p>
        ${ruler && op > 40 && pl.renown > 40 && !pl.knighted ? `<button data-k="1">Kneel before ${esc(ruler.first)}</button>` : ''}
        <h3 class="gold" style="margin-top:16px">Bounties posted here</h3><div class="list" id="kb"></div>`;
      UI.fillPlights(body.querySelector('#kb'), s, p => p.kind === 'bounty');
      const kb = body.querySelector('button[data-k]');
      if (kb) kb.addEventListener('click', () => {
        pl.knighted = f.id; pl.renown += 10;
        ECHO.Chronicle.deed(world, { text: `${P().fullTitle(world, ruler)} named ${pl.first} ${pl.last} a Knight of ${f.short}.`, importance: 2, sid: s.id, rep: 5, factionRep: { [f.id]: 10 } });
        UI.toast(`You are now a Knight of ${f.short}.`, 'legend', 6); UI.closePanel();
      });
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
        const body = UI.openPanel('Your house', `<p class="prose">Your bed, your hearth, your door. ${s.name} is home.</p><button>Sleep until morning</button>`, 'house');
        body.querySelector('button').addEventListener('click', () => { UI.closePanel(); UI.sleepUntilMorning(s); });
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
        else if (!acc) action = `<button data-accept="${p.id}">Take it on</button>`;
        else action = `<span class="dim">In your journal${p.kind === 'beasts' ? ` · ${p.progress}/${p.need} wolves` : ''}</span>`;
        return `<div class="card"><h4>${esc(UI.plightTitle(p))}</h4><div>${esc(p.text)}</div><div class="dim" style="font-size:13px;margin-top:4px">${where ? esc(where.name) + (where.id !== s.id ? ' (' + Math.round(distOf(p)) + ' leagues off)' : '') : ''} · ${left > 0 ? left + ' days left' : 'overdue'}${p.reward ? ' · reward ' + p.reward + ' crowns' : ''}</div><div class="row">${action}</div></div>`;
      }).join('');
      el.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
        const id = b.dataset.claim || b.dataset.deliver || b.dataset.accept;
        const p = ECHO.Plights.byId(world, id);
        if (!p) return;
        if (b.dataset.accept) { pl.accepted.push(p.id); UI.toast('Added to your journal.', 'info', 2); }
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
      return { kidnap: 'Taken by outlaws', beasts: 'Wolves at the door', famine: 'Hunger', apex: 'The beast', bounty: 'Bounty' }[p.kind] || 'A request';
    },
    claimText(p, npc) {
      return p.kind === 'kidnap' ? `You brought ${ECHO.Game.world.npcs[p.victim].first} home. I… thank you. Take this — it's everything I saved.` : 'You did it. Thank you. Here — as promised.';
    },
    claimPlight(p) {
      const game = ECHO.Game, world = game.world, pl = game.pl;
      if (p.status !== 'open') return;
      pl.gold += p.reward || 0;
      pl.renown += p.kind === 'apex' ? 15 : p.kind === 'bounty' ? 10 : 5;
      ECHO.Character.behave(pl, 'protect', 0.8);
      const req = p.requester && world.npcs[p.requester];
      if (req) { req.op[pl.charId] = (req.op[pl.charId] || 0) + 40; P().remember(world, req, `was helped by ${pl.first} ${pl.last}`, 'gratitude', null, 4); }
      const s = ECHO.Sim.settlement(world, p.sid);
      const what = p.kind === 'kidnap' ? `rescued ${P().name(world.npcs[p.victim])} from the Ashfang` : p.kind === 'beasts' ? 'hunted down the duskwolves troubling ' + (s ? s.name : 'the land') : p.kind === 'famine' ? `brought food to starving ${s ? s.name : ''}` : p.kind === 'apex' ? 'answered the plea against the beast' : 'collected the bounty on the Ashfang chief';
      p.status = 'done'; p.closed = world.day; p.outcome = `${pl.first} ${pl.last} ${what}.`;
      ECHO.Chronicle.deed(world, { text: p.outcome, importance: 2, sid: p.sid, rep: 6, tag: 'protect', factionRep: s ? { [s.faction]: 4 } : {} });
      UI.toast(`${p.reward ? '+' + p.reward + ' crowns. ' : ''}${s ? 'The people of ' + s.name + ' will remember this.' : ''}`, 'mercy', 4);
    },
    openBoard(s) {
      const body = UI.openPanel(`Notice board — ${s.name}`, '<p class="dim">Pleas, bounties and warnings, nailed up by people who will not wait forever.</p><div class="list" id="pl"></div>', 'board');
      UI.fillPlights(body.querySelector('#pl'), s);
      // Beasts plights become claimable when complete
      const world = ECHO.Game.world;
      for (const p of world.plights) if (p.status === 'open' && p.kind === 'beasts' && p.progress >= p.need && !p.claimable) { p.claimable = true; UI.fillPlights(body.querySelector('#pl'), s); }
      for (const p of world.plights) if (p.status === 'open' && p.kind === 'apex' && p.playerDone && !p.claimable) { p.claimable = true; UI.fillPlights(body.querySelector('#pl'), s); }
    },

    // ------------------------------------------------------------ Archive
    openArchive(s) {
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
      let tab = tab0 || 'tasks', kind = 'all';
      const body = UI.openPanel('Journal', '', 'journal');
      const render = () => {
        const tabs = [['tasks', 'Promises'], ['heard', 'Heard & witnessed'], ['self', 'Your deeds'], ['help', 'How the world works']];
        let html = `<div class="tabs">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
        if (tab === 'tasks') {
          const mine = world.plights.filter(p => pl.accepted.includes(p.id));
          const open = mine.filter(p => p.status === 'open');
          const closed = mine.filter(p => p.status !== 'open').slice(-10).reverse();
          html += open.length ? open.map(p => { const s = ECHO.Sim.settlement(world, p.sid); const left = p.deadline - world.day; return `<div class="card"><h4>${UI.plightTitle(p)}${p.claimable ? ' — <span class="gold">return to claim</span>' : ''}</h4><div>${esc(p.text)}</div><div class="dim">${s ? esc(s.name) : ''} · ${left > 0 ? left + ' days left' : 'overdue — the world may have moved on'}${p.kind === 'beasts' ? ` · ${p.progress}/${p.need}` : ''}${p.kind === 'famine' ? ` · ${p.progress}/${p.need} food delivered` : ''}</div></div>`; }).join('') : '<p class="dim">You have made no promises. Notice boards and troubled people will ask.</p>';
          if (closed.length) html += `<h3 class="gold">How things ended</h3>${closed.map(p => `<div class="card"><h4>${UI.plightTitle(p)} — ${p.status === 'done' ? 'you saw it through' : p.status === 'resolved' ? 'resolved without you' : 'too late'}</h4><div class="dim">${esc(p.outcome || p.text)}</div></div>`).join('')}`;
        } else if (tab === 'heard') {
          const kinds = ['all', 'war', 'politics', 'economy', 'crime', 'nature', 'intel', 'era', 'mystery', 'legacy', 'plight'];
          const known = ECHO.Chronicle.knownEntries(world).filter(e => kind === 'all' || e.kind === kind).slice(-150).reverse();
          html += `<div class="tabs">${kinds.map(k => `<button class="small ${kind === k ? 'on' : ''}" data-k="${k}">${k}</button>`).join('')}</div><div class="chron">${known.map(e => `<div class="e i${e.imp} ${e.char === pl.charId ? 'me' : ''}"><span class="d">${T.fmtDate(e.d)}</span>${esc(e.text)}</div>`).join('') || '<p class="dim">You have heard nothing yet. Talk to people; listen in town squares.</p>'}</div>`;
        } else if (tab === 'self') {
          const mine = world.chronicle.filter(e => e.char === pl.charId).slice(-60).reverse();
          html += `<div class="chron">${mine.map(e => `<div class="e i${e.imp} me"><span class="d">${T.fmtDate(e.d)}</span>${esc(e.text)}</div>`).join('') || '<p class="dim">Nothing yet. The world is waiting to see what you will do.</p>'}</div>`;
        } else {
          html += `<div class="prose" style="font-size:17px">
<b>Nothing waits for you.</b> Every person in this world has a life — they eat, trade, marry, feud, raise children, change trades, turn outlaw, go to war, and die. Requests for help have deadlines; if you don't come, someone else might — or no one will.

<b>Everything is connected.</b> The great beasts keep the vermin down. Kill one, and the vermin multiply; crops fail; bread prices climb; people go hungry, migrate, riot, turn to banditry. Kingdoms short of food grow desperate. Nobody will tell you this happened because of you. You will just see it.

<b>The world learns.</b> Factions remember how you kill them. Shoot them and they carry shields. Burn them and they ward against fire. Strike at night and they post watches. Beasts evolve the same way over generations. Bosses learn your habits mid-fight and remember you across encounters.

<b>You become what you do.</b> There is no class. Every skill grows by use, and your habits shape your body: aggression quickens your hands but thins your guard; reckless overcasting makes fire mighty and unstable; patience makes guarding cheap.

<b>Defeat is not the end.</b> Beasts leave you to be found by someone; people take you captive, take your sword, and grow in status. When fate runs out, you die for good — and become history. Your house stands, your sword lies somewhere in the world, and you can live again as someone new in the same world.

<b>The archives</b> in capitals keep the full chronicle, the state of the realm, and the old tongue. <b>The ruins</b> hold a language unique to this world. Study it.
</div>`;
        }
        body.innerHTML = html;
        body.querySelectorAll('button[data-tab]').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; render(); }));
        body.querySelectorAll('button[data-k]').forEach(b => b.addEventListener('click', () => { kind = b.dataset.k; render(); }));
      };
      render();
    },
    openMap() {
      const game = ECHO.Game, world = game.world, pl = game.pl;
      const body = UI.openPanel(`Map of ${world.name}`, `<div class="mapwrap"><canvas id="worldmap"></canvas></div><div class="legend-row"><span>■ towns (by allegiance)</span><span style="color:#d0563c">▲ outlaw camps you've seen</span><span style="color:#ffcf8a">✸ lairs</span><span style="color:#c8c0b0">◇ ruins</span><span style="color:#9fd3ff">◆ the vault</span><span style="color:#fff">● you</span></div>`, 'map');
      const c = body.querySelector('#worldmap');
      const s = Math.max(3, Math.floor(Math.min(window.innerWidth * 0.86 / world.W, window.innerHeight * 0.66 / world.H)));
      c.width = world.W * s; c.height = world.H * s;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(ECHO.Renderer.mapImage(world), 0, 0, c.width, c.height);
      const cw = Math.ceil(world.W / 4);
      g.fillStyle = '#d9c9a3';
      for (let y = 0; y < Math.ceil(world.H / 4); y++) for (let x = 0; x < cw; x++) if (!pl.explored[y * cw + x]) g.fillRect(x * 4 * s, y * 4 * s, 4 * s + 1, 4 * s + 1);
      g.globalAlpha = 0.25; g.fillStyle = '#8a7a5a';
      for (let i = 0; i < 400; i++) g.fillRect((ECHO.hash2(i, 1, 9) * c.width) | 0, (ECHO.hash2(i, 2, 9) * c.height) | 0, 2, 2);
      g.globalAlpha = 1;
      g.font = `${Math.max(12, s * 4)}px "Pixelify Sans"`; g.textAlign = 'center';
      const lbl = (t, x, y, col) => { g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.8)'; g.strokeText(t, x, y); g.fillStyle = col; g.fillText(t, x, y); };
      g.fillStyle = 'rgba(120,90,50,0.55)';
      for (const r of world.roads) for (let k = 0; k < r.path.length; k += 2) { const i = r.path[k]; g.fillRect((i % world.W) * s, ((i / world.W) | 0) * s, s, s); }
      for (const st of world.settlements) {
        g.fillStyle = world.factions[st.faction].color; g.fillRect(st.x * s - 2 * s, st.y * s - 2 * s, 4 * s, 4 * s);
        lbl(st.name, st.x * s, st.y * s - 3 * s, '#f0e6d0');
      }
      for (const cp of world.camps) if (cp.seen && cp.alive) lbl('▲', cp.x * s, cp.y * s, '#d0563c');
      for (const l of world.lairs) if (l.seen) lbl(l.boss.alive ? '✸' : '✕', l.x * s, l.y * s, '#ffcf8a');
      for (const r of world.ruins) if (r.visited || game.explored(r.x, r.y)) lbl('◇', r.x * s, r.y * s, '#c8c0b0');
      if (world.lang.vault && world.lang.vault.revealed && !world.lang.vault.opened) lbl('◆', world.lang.vault.x * s, world.lang.vault.y * s, '#9fd3ff');
      if (world.rift) lbl('✧', world.rift.x * s, world.rift.y * s, '#b48aff');
      // accepted plight targets
      for (const p of world.plights) {
        if (p.status !== 'open' || !pl.accepted.includes(p.id)) continue;
        const camp = p.campId && world.camps.find(c2 => c2.id === p.campId);
        const lair = p.lairId && world.lairs.find(l => l.id === p.lairId);
        const t = camp || lair;
        if (t) { g.strokeStyle = '#ffe08a'; g.lineWidth = 2; g.beginPath(); g.arc(t.x * s, t.y * s, 5 * s, 0, Math.PI * 2); g.stroke(); }
      }
      g.fillStyle = '#fff'; g.beginPath(); g.arc(game.pl.x * s, game.pl.y * s, Math.max(4, s * 1.4), 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#000'; g.lineWidth = 2; g.stroke();
    },
    openCharacter() {
      const game = ECHO.Game, world = game.world, pl = game.pl;
      const Ch = ECHO.Character;
      const bio = Ch.biography(world, pl);
      const skills = Object.entries(pl.skills).map(([k, v]) => `<div class="skill"><span>${ECHO.SKILLS[k].name}</span><div class="t"><div style="width:${v}%"></div></div><span>${Math.round(v)}</span></div>`).join('');
      const tends = [['aggression', 'Aggression'], ['caution', 'Patience'], ['reckless', 'Recklessness'], ['protect', 'Protectiveness'], ['mercy', 'Mercy'], ['cruelty', 'Cruelty'], ['betrayal', 'Faithlessness'], ['curiosity', 'Curiosity'], ['night', 'Night-work']]
        .map(([k, l]) => `<div class="skill tend"><span>${l}</span><div class="t"><div style="width:${Math.round(Ch.tendency(pl, k) * 100)}%"></div></div><span></span></div>`).join('');
      const items = pl.items.map(id => world.items[id]).filter(Boolean);
      const reps = world.settlements.filter(s => s.rep && s.rep[pl.charId]).map(s => `${s.name}: ${s.rep[pl.charId] > 0 ? '+' : ''}${Math.round(s.rep[pl.charId])}`);
      UI.openPanel(`${pl.first} ${pl.last}, ${Ch.title(pl)}`, `<div class="two"><div><p class="prose">${bio.map(esc).join(' ')}</p>
        <p class="dim">Renown ${Math.round(pl.renown)} · Fate ${pl.fate}/3${pl.knighted ? ' · Knight of ' + world.factions[pl.knighted].short : ''}${pl.legacyOf ? ' · kin of ' + esc((ECHO.Legacy.legendOf(world, pl.legacyOf) || {}).name || '') : ''}</p>
        ${pl.spells.length ? `<p class="gold">Secrets: ${pl.spells.map(k => ECHO.Mysteries.REWARDS[k].name).join(', ')}</p>` : ''}
        <h3 class="gold">Belongings</h3><div class="list">${items.map(it => `<div class="card"><h4>${esc(it.name)}${it.id === pl.weapon ? ' (wielded)' : it.id === pl.bow ? ' (bow)' : ''}</h4><div class="dim" style="font-size:13px">${it.history.map(h => `${T.fmtShort(h.d)}: ${esc(h.t)}`).join('<br>')}</div>${it.kind === 'sword' && it.id !== pl.weapon ? `<div class="row"><button class="small" data-w="${it.id}">Wield</button></div>` : ''}</div>`).join('')}</div>
        ${reps.length ? `<h3 class="gold">Standing</h3><div class="dim">${reps.join(' · ')}</div>` : ''}</div>
        <div><h3 class="gold">Skills — grown by use</h3>${skills}<h3 class="gold" style="margin-top:16px">Tendencies — what you keep doing</h3>${tends}
        <p class="dim" style="font-size:13px">Tendencies change how you fight: aggression quickens strikes and weakens your guard; patience cheapens guarding; recklessness strengthens fire and makes it unstable.</p></div></div>`, 'char');
      document.querySelectorAll('#panel button[data-w]').forEach(b => b.addEventListener('click', () => { pl.weapon = b.dataset.w; ECHO.PlayerCtl.derivedT = 0; UI.openCharacter(); }));
    }
  };
  ECHO.on('chronicle', e => UI.onChronicle(e));
  ECHO.on('doctrine', () => {});
  ECHO.on('vault:revealed', () => { if (ECHO.Game.pl) UI.vaultCheck(); });
})();
