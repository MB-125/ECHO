// Full-screen flows: title & worlds, world creation, character creation,
// the epitaph when a character dies, and the pause menu.
(function () {
  const { U } = ECHO;
  const T = ECHO.TIME;
  const P = () => ECHO.People;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const Scr = ECHO.Screens = {
    show(html) {
      const UI = ECHO.UI;
      UI.screenOpen = true;
      $('#hud').classList.add('hidden');
      UI.closePanel(); UI.closeModal();
      const el = $('#screen');
      el.classList.remove('hidden');
      el.innerHTML = `<div class="scr">${html}</div>`;
      el.scrollTop = 0;
      UI.fadeIn();
      return el;
    },
    logo(tag) {
      return `<div class="logo"><h1>E<span>C</span>H<span>O</span></h1><div class="sub">THE LIVING REALM</div>${tag ? `<div class="tag">${tag}</div>` : ''}</div>`;
    },

    // ------------------------------------------------------------ Title
    async title() {
      ECHO.Game.world && ECHO.Game.save();
      ECHO.Game.world = null; ECHO.Game.pl = null;
      if (ECHO.Music) { ECHO.Music.setMood('title'); ECHO.Music.quiet(); }
      const metas = (await ECHO.Save.list()).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
      let sel = metas[0] ? metas[0].id : null;
      const el = Scr.show(`${Scr.logo('A world that existed before you, continues without you, and remembers what you do.')}
        <div class="worlds">${metas.map(m => `<div class="wcard ${m.id === sel ? 'sel' : ''}" data-id="${m.id}">
          <h3>${esc(m.name)}</h3>
          <div class="m">${esc(m.date)} · ${m.population} souls · ${Math.round((m.playSeconds || 0) / 60)} min lived<br>${m.hero ? `Now: <b>${esc(m.hero)}</b>, ${esc(m.heroTitle || '')}` : '<span class="ember">No one lives your life here now.</span>'}${m.legends && m.legends.length ? `<br>Legends: ${m.legends.map(l => esc(l.name)).join(', ')}` : ''}<br>${(m.eras || []).map(e => esc(e.name.replace('Kingdom of ', '').replace(' Dominion', '')) + ': ' + esc(e.era)).join(' · ')}</div>
          ${m.highlights && m.highlights.length ? `<div class="hl">“${esc(m.highlights[m.highlights.length - 1])}”</div>` : ''}
          ${m.hero && m.livesOn !== false && m.savedAt && Date.now() - m.savedAt >= 7.2e6 ? `<div class="hl" style="color:#bfe8ff">The world has lived on without you — ${Math.min(5, Math.floor((Date.now() - m.savedAt) / 7.2e6))} day${Math.min(5, Math.floor((Date.now() - m.savedAt) / 7.2e6)) > 1 ? 's' : ''} will have passed.</div>` : ''}
        </div>`).join('')}</div>
        <div class="actions">${metas.length ? `<button class="primary" data-a="enter">${metas[0].hero ? `Continue as ${esc(metas[0].hero)}` : 'Enter world'}</button>` : ''}<button data-a="new" class="${metas.length ? '' : 'primary'}">Begin a new world</button>${metas.length ? '<button data-a="del">Forget world…</button>' : ''}<button data-a="help">How ECHO works</button>${window.echoNative ? '<button data-a="quit">Quit</button>' : ''}</div>
        ${window.echoNative ? '' : `<div class="actions" style="margin-top:8px">${metas.length ? '<button class="small" data-a="export">Export world</button>' : ''}<button class="small" data-a="import">Import world</button><input type="file" id="importfile" accept=".json,.echo,application/json" hidden></div>`}
        <p class="faint" style="text-align:center;margin-top:30px;font-size:12px">Worlds never reset. Each one lives and changes on its own. ${window.echoNative ? 'F11 toggles fullscreen.' : 'Worlds are kept in this browser; export one to keep a backup. Best with a keyboard and mouse.'}</p>
        <div id="titlemsg" class="dim" style="text-align:center;margin-top:8px"></div>`);
      Scr.titleFx(el);
      const msg = t => { const m = el.querySelector('#titlemsg'); if (m) m.textContent = t; };
      if (ECHO.Save.storageBlocked) msg('This browser is blocking storage, so worlds cannot be saved here. You can still play; export your world before leaving.');
      const fileIn = el.querySelector('#importfile');
      if (fileIn) fileIn.addEventListener('change', async () => {
        const f = fileIn.files && fileIn.files[0];
        if (!f) return;
        try { const w = await ECHO.Save.importText(await f.text()); msg(`Imported ${w.name}.`); setTimeout(() => Scr.title(), 700); }
        catch (e) { msg(e.message || 'That file could not be read.'); }
      });
      el.querySelectorAll('.wcard').forEach(c => c.addEventListener('click', () => { sel = c.dataset.id; el.querySelectorAll('.wcard').forEach(x => x.classList.toggle('sel', x.dataset.id === sel)); }));
      el.querySelectorAll('.wcard').forEach(c => c.addEventListener('dblclick', () => Scr.enter(c.dataset.id)));
      el.querySelectorAll('button[data-a]').forEach(b => b.addEventListener('click', async () => {
        const a = b.dataset.a;
        if (a === 'enter' && sel) Scr.enter(sel);
        if (a === 'new') Scr.newWorld();
        if (a === 'help') Scr.help();
        if (a === 'quit') window.echoNative.closeNow();
        if (a === 'import' && fileIn) fileIn.click();
        if (a === 'export' && sel) {
          const w = await ECHO.Save.load(sel);
          if (!w) return msg('That world could not be read.');
          const r = await Scr.saveFile(`${w.name.replace(/[^\w-]+/g, '_')}-day${w.day}.echo.json`, ECHO.Save.exportText(w));
          msg(r);
        }
        if (a === 'del' && sel) {
          const m = metas.find(x => x.id === sel);
          ECHO.UI.modal({
            title: `Forget ${m.name}?`,
            html: '<p>Everyone in it, every legend and every scar on the land will be gone for good.</p>',
            choices: [
              { label: 'Forget this world forever', onPick: async () => { await ECHO.Save.remove(sel); Scr.title(); } },
              { label: 'Keep it', onPick: () => {} }
            ]
          });
        }
      }));
    },
    // Embers and wisps drifting behind the title.
    titleFx(el) {
      const c = document.createElement('canvas');
      c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:0';
      el.prepend(c);
      const scr = el.querySelector('.scr'); if (scr) { scr.style.position = 'relative'; scr.style.zIndex = '1'; }
      const g = c.getContext('2d');
      const P = [];
      for (let i = 0; i < 70; i++) P.push({ x: Math.random(), y: Math.random(), vx: (Math.random() - 0.5) * 0.01, vy: -0.01 - Math.random() * 0.025, r: 1 + Math.random() * 2.5, ph: Math.random() * 6, wisp: i < 8 });
      let last = performance.now();
      const step = now => {
        if (!c.isConnected) return;
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        const w = c.width = window.innerWidth, h = c.height = window.innerHeight;
        for (const p of P) {
          p.ph += dt; p.x += (p.vx + Math.sin(p.ph * 0.7) * 0.004) * dt; p.y += p.vy * dt * (p.wisp ? 0.4 : 1);
          if (p.y < -0.05) { p.y = 1.05; p.x = Math.random(); }
          const a = (0.35 + 0.35 * Math.sin(p.ph * 2)) * (p.wisp ? 1 : 0.8);
          const rr = p.r * (p.wisp ? 3 : 1);
          const gr = g.createRadialGradient(p.x * w, p.y * h, 0, p.x * w, p.y * h, rr * 4);
          gr.addColorStop(0, p.wisp ? `rgba(200,232,255,${a})` : `rgba(255,190,110,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = gr; g.beginPath(); g.arc(p.x * w, p.y * h, rr * 4, 0, Math.PI * 2); g.fill();
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    },
    async enter(id) {
      Scr.show(`${Scr.logo('Waking the world…')}`);
      await new Promise(r => setTimeout(r, 30));
      const world = await ECHO.Save.load(id);
      if (!world) { await Scr.title(); const m = document.querySelector('#titlemsg'); if (m) m.textContent = 'That world could not be loaded.'; return; }
      if (world.player && world.player.alive) {
        // The world lives on while you are away: a day for every two hours, up to five.
        const away = world.lastSeen ? Date.now() - world.lastSeen : 0;
        const days = world.livesOn === false || world.player.capture ? 0 : Math.min(5, Math.floor(away / 7.2e6));
        ECHO.Game.start(world);
        ECHO.UI.toast(`${world.name}. ${T.fmtDate(world.day)}.`, 'world', 4);
        // worlds from before ambitions: ask once what this life is for
        if (world.player.focus === undefined) { const ask = () => { if (ECHO.UI.paused()) return setTimeout(ask, 1500); ECHO.Purpose.calling(ECHO.Game); }; setTimeout(ask, days >= 1 ? 4000 : 2500); }
        const omen = ECHO.Marvels.dailyOmen(world);
        if (days >= 1) ECHO.Game.fastForward(days, `While you were away…`, events => Scr.welcomeBack(world, days, events, omen));
        else if (omen || (ECHO.Letters && ECHO.Letters.waiting(world).length)) setTimeout(() => Scr.welcomeBack(world, 0, [], omen), 600);
      } else Scr.characterCreation(world, true);
    },
    // Coming back: what happened, who wrote, what the day holds.
    welcomeBack(world, days, events, omen) {
      const UI = ECHO.UI, pl = world.player;
      const letters = ECHO.Letters ? ECHO.Letters.deliver(world) : [];
      const open = world.plights.filter(p => pl.accepted.includes(p.id) && p.status === 'open');
      const fest = ECHO.Festivals.next(world);
      if (letters.length) ECHO.Music.stinger('letter');
      UI.modal({
        title: days ? `${days === 1 ? 'A day has' : days + ' days have'} passed in ${world.name}` : `Welcome back to ${world.name}`,
        html: `${days ? `<p class="prose">The world did not wait for you. It is now ${esc(T.fmtDate(world.day))}.</p>${UI.eventsDigest(events, 'While you were away')}` : ''}
          ${letters.length ? `<div class="card"><h4 class="gold">✉ ${letters.length === 1 ? 'A letter found you' : letters.length + ' letters found you'}</h4><div>${letters.map(l => `${esc(l.title)} <span class="dim">— ${esc(l.fromName)}</span>`).join('<br>')}</div><div class="dim">Read them in your journal (J), under Letters.</div></div>` : ''}
          ${omen && omen.text ? `<div class="card" style="border-color:#9fd3ff"><h4 style="color:#bfe8ff">✧ Today's omen</h4><div class="prose">${esc(omen.text)}</div></div>` : ''}
          ${fest && fest.inDays <= 3 ? `<div class="card"><h4>❀ ${esc(ECHO.Festivals.describe(world))}</h4><div class="dim">${esc(U.cap(fest.f.desc))}.</div></div>` : ''}
          ${open.length ? `<p class="dim">You have ${open.length} promise${open.length > 1 ? 's' : ''} still to keep.</p>` : ''}`,
        choices: [{ label: 'Step back into the world', onPick: () => {} }]
      });
    },
    // Offer a file to the viewer: the claude.ai downloads capability when the
    // page is hosted there, a normal download link elsewhere.
    async saveFile(filename, text) {
      try {
        const dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null;
        if (dl) {
          try { await dl.save({ filename, data: text }); return `Saved ${filename}.`; }
          catch (e) { return e && e.code === 'declined' ? 'Export cancelled.' : 'The file could not be saved.'; }
        }
      } catch (e) { /* fall through */ }
      try {
        const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        return `Saved ${filename}.`;
      } catch (e) { return 'This browser will not save files from here.'; }
    },
    help() {
      const el = Scr.show(`${Scr.logo()}<div class="panel-inner" style="margin:0 auto"><div class="panel-body prose" style="font-size:18px">
<b>Controls.</b> WASD to move. Left mouse strikes, right mouse draws and looses the bow (hold to draw), Q casts flame (hold to pour more into it — at your peril). Shift raises your guard; tap it just as a blow lands for a perfect guard. Space dodges. R (or the middle mouse button) locks onto a foe so you always face it; press again to release. Hold Ctrl to sneak (you must sneak to strike someone who isn't your enemy). F studies a creature. E interacts. H eats, G uses herbs. Tab opens the journal, M the map, K your character, Esc the menu.

<b>The world.</b> Everyone in ECHO is a real, persistent person who lives whether or not you're watching. Kingdoms grow hungry and go to war. Outlaws raid and take captives. Merchants chase profit and flee danger. Beasts multiply or starve. Your actions ripple — but no one will tell you which ripple was yours.

<b>Learning enemies.</b> Factions adapt to how you fight. Bosses learn your habits during a fight and remember them afterwards.

<b>Wonders.</b> On clear nights wisps lead to the Echoes of the old world; stars fall and leave star-iron; the restless dead have last words to pass on; a white hind walks the forest edge at dawn and dusk. Four festivals a year fill the town squares with music, lanterns, feasts and an archery contest. People who know you write letters, each real day brings an omen, and the world lives on while you're away.

<b>Death.</b> Defeat by beasts costs fate; defeat by people means captivity. When fate is gone you die, and the world remembers you. Begin again as someone new — perhaps as kin of the one who fell.
</div></div><div class="actions"><button class="primary">Back</button></div>`);
      el.querySelector('button').addEventListener('click', () => Scr.title());
    },

    // ------------------------------------------------------------ New world
    newWorld() {
      const rng = new ECHO.RNG(Date.now() & 0xffffffff);
      const names = ['Aerith', 'Vaelmoor', 'Caldris', 'Thessaly', 'Morrowen', 'Elsmere', 'Hythe', 'Corvane', 'Ilmarr', 'Duskreach', 'Oldenfell', 'Saelwyn', 'Brannoch', 'Wyrdholt'];
      const el = Scr.show(`${Scr.logo('A new world, with its own history, its own tongue, its own fate.')}
        <div class="form"><label>Name of the world<input id="wn" value="${rng.pick(names)}" maxlength="24"></label>
        <label>Seed (leave blank for chance)<input id="ws" placeholder="any words or numbers"></label>
        <label>Size of the world<select id="wz"><option value="vast">Vast — fifteen towns, wide wild country, much to find</option><option value="standard">Standard — eight towns on a smaller isle</option></select></label>
        <label>Pace of life<select id="wp"><option value="brisk">Brisk — a day passes in 6 minutes</option><option value="steady">Steady — a day passes in 12 minutes</option><option value="lifelike">Lifelike — a day passes in 24 minutes</option></select></label>
        <div class="actions"><button data-a="back">Back</button><button class="primary" data-a="go">Create</button></div></div>`);
      el.querySelector('[data-a=back]').addEventListener('click', () => Scr.title());
      el.querySelector('[data-a=go]').addEventListener('click', async () => {
        const name = el.querySelector('#wn').value.trim() || 'Nameless';
        const pace = (el.querySelector('#wp') || {}).value || 'brisk';
        const seedText = el.querySelector('#ws').value.trim();
        const seed = seedText ? (/^\d+$/.test(seedText) ? (+seedText >>> 0) : ECHO.hashStr(seedText)) : (Math.random() * 4294967295) >>> 0;
        Scr.show(`${Scr.logo('Raising mountains, digging rivers, founding towns, raising generations…')}<p style="text-align:center" class="dim">${esc(name)} — seed ${seed}</p>`);
        await new Promise(r => setTimeout(r, 60));
        const size = (el.querySelector('#wz') || {}).value || 'vast';
        const world = ECHO.generateWorld({ seed, name, size, id: 'w' + seed.toString(36) + Date.now().toString(36).slice(-4) });
        world.pace = pace;
        await ECHO.Save.save(world);
        Scr.characterCreation(world, false);
      });
    },

    // ------------------------------------------------------------ Characters
    characterCreation(world, continuing) {
      const legends = world.legends;
      const last = legends[legends.length - 1];
      let homeId = null, kinOf = null, female = Math.random() < 0.5;
      const intro = continuing && last
        ? `The world remembers <b>${esc(last.name)}</b>, ${esc(last.epithet)}, who died ${T.fmtShort(last.died)} — ${esc(last.cause)}. ${T.fmtDate(world.day)}. Life goes on.`
        : `It is ${T.fmtDate(world.day)}. ${world.chronicle.length} things have already been written into this world's history. Choose where you were born.`;
      const draw = () => {
        const towns = world.settlements.filter(s => s.faction !== 'ashfang' && P().residents(world, s).length > 0);
        const el = Scr.show(`${Scr.logo()}
          <p class="prose" style="text-align:center;max-width:760px;margin:0 auto 16px">${intro}</p>
          <div class="form" style="max-width:700px"><label>Your name<input id="cn" maxlength="16" value="${esc(ECHO.makeName(new ECHO.RNG(Date.now() & 0xfffff), 'valdren', female ? 'f' : 'm'))}"></label>
          <label style="grid-template-columns:auto 1fr;align-items:center;display:flex;gap:10px"><input type="checkbox" id="cf" ${female ? 'checked' : ''}> Woman</label></div>
          ${legends.length ? `<h3 class="gold" style="text-align:center">Born of a legend?</h3><div class="birth">${legends.slice(-4).map(l => `<div class="wcard ${kinOf === l.charId ? 'sel' : ''}" data-kin="${l.charId}"><h3>Kin of ${esc(l.name)}</h3><div class="m">${esc(l.epithet)}. You would be born in ${esc((ECHO.Sim.settlement(world, l.homeId) || {}).name || '?')}, bear the name ${esc(l.last)}, inherit what is left in their house — and be judged by what they did.</div></div>`).join('')}</div>` : ''}
          <h3 class="gold" style="text-align:center;margin-top:18px">Where you were born</h3>
          <div class="birth">${towns.map(s => {
            const f = world.factions[s.faction];
            const pop = P().residents(world, s).length;
            const mood = s.hunger > 0.25 ? '<span class="ember">hungry</span>' : s.unrest > 60 ? '<span class="ember">restless</span>' : s.prosperity > 60 ? 'prosperous' : 'ordinary';
            const lair = world.lairs.find(l => l.villageId === s.id && l.boss.alive);
            return `<div class="wcard ${homeId === s.id ? 'sel' : ''}" data-home="${s.id}"><h3>${esc(s.name)}</h3><div class="m">${s.kind === 'capital' ? 'Capital of ' + esc(f.short) : s.kind === 'temple' ? 'Temple town of the Lantern' : 'Village of ' + esc(f.short)} · ${pop} people · ${mood}${lair ? `<br>The land nearby is haunted by ${esc(lair.boss.name)}.` : ''}${s.statueOf && s.buildings.some(b => b.type === 'statue') ? '<br>A statue stands in the square.' : ''}</div></div>`;
          }).join('')}</div>
          <div class="actions" style="margin:22px 0 40px"><button data-a="back">To the title</button><button class="primary" data-a="go">Begin this life</button></div>`);
        el.querySelector('#cf').addEventListener('change', e => { female = e.target.checked; });
        el.querySelectorAll('[data-home]').forEach(c => c.addEventListener('click', () => { homeId = c.dataset.home; kinOf = null; el.querySelectorAll('.wcard').forEach(x => x.classList.toggle('sel', x === c)); }));
        el.querySelectorAll('[data-kin]').forEach(c => c.addEventListener('click', () => { kinOf = c.dataset.kin; const l = legends.find(x => x.charId === kinOf); homeId = l.homeId; el.querySelectorAll('.wcard').forEach(x => x.classList.toggle('sel', x === c)); }));
        el.querySelector('[data-a=back]').addEventListener('click', async () => { await ECHO.Save.save(world); Scr.title(); });
        el.querySelector('[data-a=go]').addEventListener('click', () => {
          const name = (el.querySelector('#cn').value.trim() || 'Wren').slice(0, 16);
          if (!homeId) homeId = towns[0].id;
          if (!ECHO.Sim.settlement(world, homeId) || !towns.find(t => t.id === homeId)) homeId = towns[0].id;
          Scr.begin(world, name, homeId, kinOf, female);
        });
      };
      draw();
    },
    begin(world, first, homeId, kinOf, female) {
      const rng = ECHO.Sim.rngFor(world);
      const legend = kinOf && world.legends.find(l => l.charId === kinOf);
      ECHO.Game.world = world;
      const pl = ECHO.Character.create(world, rng, { first, homeId, last: legend ? legend.last : undefined });
      pl.female = female;
      if (legend) {
        pl.legacyOf = legend.charId;
        const home = ECHO.Sim.settlement(world, legend.homeId);
        const house = home && home.buildings.find(b => b.id === legend.houseId);
        if (house) {
          // The family home passes to you, with what's left in it.
          const myHouse = home.buildings.find(b => b.owner === pl.charId);
          if (myHouse) myHouse.owner = null;
          house.owner = pl.charId; pl.houseId = house.id;
        }
        // People who loved (or hated) them feel something about you.
        for (const n of P().alive(world)) {
          const op = n.op[legend.charId] || 0;
          if (op) n.op[pl.charId] = (n.op[pl.charId] || 0) + op * 0.4;
        }
        ECHO.Chronicle.add(world, { text: `${pl.first} ${pl.last}, kin of ${legend.name}, came of age in ${home ? home.name : 'the realm'}.`, kind: 'legacy', importance: 2, sid: legend.homeId, char: pl.charId });
      }
      ECHO.Save.save(world);
      ECHO.Game.start(world);
      const home = ECHO.Sim.settlement(world, pl.homeId);
      setTimeout(() => ECHO.Purpose.calling(ECHO.Game, k => {
        if (ECHO.Tutorial && !ECHO.UI.settings.tutorialDone) ECHO.Tutorial.begin(ECHO.Game);
        ECHO.UI.toast(k ? `You are ${pl.first} ${pl.last} of ${home.name}. The line at the top of the screen shows the next step on your road, and points the way. Tab opens your journal.` : `You are ${pl.first} ${pl.last} of ${home.name}. Talk to people. Read the notice board. Or walk out into the world and see what it does.`, 'world', 10);
      }), 1800);
    },

    // ------------------------------------------------------------ Death
    legendScreen(o) {
      const l = o.legend;
      const el = Scr.show(`<div class="epitaph">
        <div class="faint">Here ends the tale of</div>
        <h1>${esc(l.name)}</h1><div class="ep">${esc(l.epithet)}</div>
        <div class="dates">${T.fmtShort(l.born)} — ${T.fmtShort(l.died)} · ${esc(l.cause)}</div>
        ${o.bio.map(b => `<p>${esc(b)}</p>`).join('')}
        ${l.deeds.length ? `<p class="gold" style="margin-top:20px">What the chronicle will say:</p>${l.deeds.map(d => `<p style="font-size:18px">“${esc(d)}”</p>`).join('')}` : ''}
        <p style="margin-top:22px">${esc(o.swordFate)} ${esc(o.house)} ${esc(o.statue)}</p>
        <p class="dim" style="font-style:italic">But the world goes on.</p>
        <div class="actions" style="margin-top:20px"><button class="primary" data-a="go">Live again in this world</button><button data-a="title">To the title</button></div></div>`);
      el.querySelector('[data-a=go]').addEventListener('click', () => o.onContinue());
      el.querySelector('[data-a=title]').addEventListener('click', () => Scr.title());
    },

    // ------------------------------------------------------------ Pause
    openPause() {
      const UI = ECHO.UI;
      UI.pauseOpen = true;
      const body = UI.openPanel('Paused', `<div class="list" style="max-width:420px;margin:0 auto">
        <button data-a="resume" class="primary">Resume</button>
        <button data-a="journal">Journal (Tab)</button><button data-a="map">Map (M)</button><button data-a="char">Character (K)</button>
        <button data-a="save">Save now</button>
        <div class="card"><h4>View distance</h4><div class="row"><button class="small" data-z="-1">Closer</button><button class="small" data-z="1">Farther</button><span class="dim">${UI.settings.zoom}</span></div></div>
        <div class="card"><h4>Graphics</h4><div class="row"><button class="small" data-g="3d" ${ECHO.render3d ? 'disabled' : ''}>3D</button><button class="small" data-g="2d" ${ECHO.render3d ? '' : 'disabled'}>Classic 2D</button><span class="dim">${ECHO.render3d ? 'Using 3D' : 'Using classic 2D'}</span></div></div>
        ${ECHO.render3d ? `<div class="card"><h4>Quality</h4><div class="row">${['low', 'medium', 'high'].map(q => `<button class="small" data-q="${q}" ${(UI.settings.quality || 'high') === q ? 'disabled' : ''}>${{ low: 'Low', medium: 'Medium', high: 'High' }[q]}</button>`).join('')}</div><div class="dim">Low: sharper speed on weaker computers — no shadows, fewer lights, a shorter view, lower resolution. High: everything.</div></div>` : ''}
        <div class="card"><h4>Controller</h4><div class="dim">${ECHO.Input.padName ? `Connected: ${ECHO.Input.padName}.` : 'Plug in a gamepad and press any button.'} Left stick move · right stick aim · RT strike (hold: heavy) · LT bow · A roll · B use/back · X herbs · Y fire · LB lock on · RB guard · R3 ride · L3 sneak · D-pad: map, character, healing draught, guide · Back journal · Start menu.</div></div>
        <div class="card"><h4>Pace of life</h4><div class="row">${['brisk', 'steady', 'lifelike'].map(p => `<button class="small" data-p="${p}" ${(ECHO.Game.world && (ECHO.Game.world.pace || 'brisk')) === p ? 'disabled' : ''}>${{ brisk: 'Brisk', steady: 'Steady', lifelike: 'Lifelike' }[p]}</button>`).join('')}</div><div class="dim">A day lasts ${{ brisk: 6, steady: 12, lifelike: 24 }[(ECHO.Game.world && ECHO.Game.world.pace) || 'brisk']} real minutes. Slower pace: lives, seasons and wars unfold more gradually around you.</div></div>
        <div class="card"><h4>Sound</h4><div class="row"><button class="small" data-s="on" ${ECHO.Sfx.enabled ? 'disabled' : ''}>On</button><button class="small" data-s="off" ${ECHO.Sfx.enabled ? '' : 'disabled'}>Off</button></div>
          <div class="row"><span>Music</span><input type="range" id="musvol" min="0" max="100" value="${Math.round(ECHO.Music.volume * 100)}" ${ECHO.Music.enabled ? '' : 'disabled'} style="flex:1"><button class="small" data-mu="${ECHO.Music.enabled ? 'off' : 'on'}">${ECHO.Music.enabled ? 'Mute music' : 'Play music'}</button></div></div>
        <div class="card"><h4>While you are away</h4><div class="row"><button class="small" data-lo="on" ${ECHO.Game.world && ECHO.Game.world.livesOn !== false ? 'disabled' : ''}>The world lives on</button><button class="small" data-lo="off" ${ECHO.Game.world && ECHO.Game.world.livesOn === false ? 'disabled' : ''}>The world waits</button></div><div class="dim">When the world lives on, a day passes for every two hours you are gone (at most five), and you come back to news, letters and changes.</div></div>
        <button data-a="help">How the world works</button>
        <button data-a="title">Save and return to title</button>
        ${window.echoNative ? '<button data-a="quit">Save and quit</button>' : ''}</div>`, 'pause');
      UI.pauseOpen = false; // the panel itself pauses the game
      body.querySelectorAll('button[data-a]').forEach(b => b.addEventListener('click', async () => {
        const a = b.dataset.a;
        if (a === 'resume') UI.closePanel();
        if (a === 'journal') UI.openJournal();
        if (a === 'map') UI.openMap();
        if (a === 'char') UI.openCharacter();
        if (a === 'help') UI.openJournal('help');
        if (a === 'save') { await ECHO.Game.save(); UI.toast('The world is saved.', 'info', 2); UI.closePanel(); }
        if (a === 'title') { await ECHO.Game.save(); UI.closePanel(); Scr.title(); }
        if (a === 'quit') { await ECHO.Game.save(); window.echoNative.closeNow(); }
      }));
      body.querySelectorAll('button[data-g]').forEach(b => b.addEventListener('click', async () => {
        UI.settings.graphics = b.dataset.g;
        try { localStorage.setItem('echo.settings', JSON.stringify(UI.settings)); } catch (e) { /* ignore */ }
        await ECHO.Game.save();
        location.reload();
      }));
      body.querySelectorAll('button[data-q]').forEach(b => b.addEventListener('click', () => { UI.settings.quality = b.dataset.q; try { localStorage.setItem('echo.settings', JSON.stringify(UI.settings)); } catch (e) { /* ignore */ } if (ECHO.Renderer.applyQuality) ECHO.Renderer.applyQuality(); Scr.openPause(); }));
      body.querySelectorAll('button[data-p]').forEach(b => b.addEventListener('click', () => { if (ECHO.Game.world) ECHO.Game.world.pace = b.dataset.p; Scr.openPause(); }));
      body.querySelectorAll('button[data-mu]').forEach(b => b.addEventListener('click', () => { ECHO.Music.setEnabled(b.dataset.mu === 'on'); Scr.openPause(); }));
      body.querySelectorAll('button[data-lo]').forEach(b => b.addEventListener('click', () => { if (ECHO.Game.world) ECHO.Game.world.livesOn = b.dataset.lo === 'on'; Scr.openPause(); }));
      const mv = body.querySelector('#musvol'); if (mv) mv.addEventListener('input', () => ECHO.Music.setVolume(mv.value / 100));
      body.querySelectorAll('button[data-s]').forEach(b => b.addEventListener('click', () => { ECHO.Sfx.setEnabled(b.dataset.s === 'on'); Scr.openPause(); }));
      body.querySelectorAll('button[data-z]').forEach(b => b.addEventListener('click', () => {
        UI.settings.zoom = U.clamp(UI.settings.zoom + +b.dataset.z, -2, 3);
        try { localStorage.setItem('echo.settings', JSON.stringify(UI.settings)); } catch (e) { /* ignore */ }
        ECHO.Renderer.resize(); Scr.openPause();
      }));
    },
    closePause() { ECHO.UI.pauseOpen = false; ECHO.UI.closePanel(); }
  };
})();
