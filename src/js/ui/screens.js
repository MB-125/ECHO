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
      const metas = (await ECHO.Save.list()).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
      let sel = metas[0] ? metas[0].id : null;
      const el = Scr.show(`${Scr.logo('A world that existed before you, continues without you, and remembers what you do.')}
        <div class="worlds">${metas.map(m => `<div class="wcard ${m.id === sel ? 'sel' : ''}" data-id="${m.id}">
          <h3>${esc(m.name)}</h3>
          <div class="m">${esc(m.date)} · ${m.population} souls · ${Math.round((m.playSeconds || 0) / 60)} min lived<br>${m.hero ? `Now: <b>${esc(m.hero)}</b>, ${esc(m.heroTitle || '')}` : '<span class="ember">No one lives your life here now.</span>'}${m.legends && m.legends.length ? `<br>Legends: ${m.legends.map(l => esc(l.name)).join(', ')}` : ''}<br>${(m.eras || []).map(e => esc(e.name.replace('Kingdom of ', '').replace(' Dominion', '')) + ': ' + esc(e.era)).join(' · ')}</div>
          ${m.highlights && m.highlights.length ? `<div class="hl">“${esc(m.highlights[m.highlights.length - 1])}”</div>` : ''}
        </div>`).join('')}</div>
        <div class="actions">${metas.length ? '<button class="primary" data-a="enter">Enter world</button>' : ''}<button data-a="new" class="${metas.length ? '' : 'primary'}">Begin a new world</button>${metas.length ? '<button data-a="del">Forget world…</button>' : ''}<button data-a="help">How ECHO works</button>${window.echoNative ? '<button data-a="quit">Quit</button>' : ''}</div>
        ${window.echoNative ? '' : `<div class="actions" style="margin-top:8px">${metas.length ? '<button class="small" data-a="export">Export world</button>' : ''}<button class="small" data-a="import">Import world</button><input type="file" id="importfile" accept=".json,.echo,application/json" hidden></div>`}
        <p class="faint" style="text-align:center;margin-top:30px;font-size:12px">Worlds never reset. Each one lives and changes on its own. ${window.echoNative ? 'F11 toggles fullscreen.' : 'Worlds are kept in this browser; export one to keep a backup. Best with a keyboard and mouse.'}</p>
        <div id="titlemsg" class="dim" style="text-align:center;margin-top:8px"></div>`);
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
    async enter(id) {
      Scr.show(`${Scr.logo('Waking the world…')}`);
      await new Promise(r => setTimeout(r, 30));
      const world = await ECHO.Save.load(id);
      if (!world) { await Scr.title(); const m = document.querySelector('#titlemsg'); if (m) m.textContent = 'That world could not be loaded.'; return; }
      if (world.player && world.player.alive) {
        // The world kept its own time while you were away? It waits — but it lived through any saved fast-forward.
        ECHO.Game.start(world);
        ECHO.UI.toast(`${world.name}. ${T.fmtDate(world.day)}.`, 'world', 4);
      } else Scr.characterCreation(world, true);
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
        const world = ECHO.generateWorld({ seed, name, id: 'w' + seed.toString(36) + Date.now().toString(36).slice(-4) });
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
      setTimeout(() => ECHO.UI.toast(`You are ${pl.first} ${pl.last} of ${home.name}. Talk to people. Read the notice board. Or walk out into the world and see what it does.`, 'world', 9), 2200);
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
        <div class="card"><h4>Pace of life</h4><div class="row">${['brisk', 'steady', 'lifelike'].map(p => `<button class="small" data-p="${p}" ${(ECHO.Game.world && (ECHO.Game.world.pace || 'brisk')) === p ? 'disabled' : ''}>${{ brisk: 'Brisk', steady: 'Steady', lifelike: 'Lifelike' }[p]}</button>`).join('')}</div><div class="dim">A day lasts ${{ brisk: 6, steady: 12, lifelike: 24 }[(ECHO.Game.world && ECHO.Game.world.pace) || 'brisk']} real minutes. Slower pace: lives, seasons and wars unfold more gradually around you.</div></div>
        <div class="card"><h4>Sound</h4><div class="row"><button class="small" data-s="on" ${ECHO.Sfx.enabled ? 'disabled' : ''}>On</button><button class="small" data-s="off" ${ECHO.Sfx.enabled ? '' : 'disabled'}>Off</button></div></div>
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
      body.querySelectorAll('button[data-p]').forEach(b => b.addEventListener('click', () => { if (ECHO.Game.world) ECHO.Game.world.pace = b.dataset.p; Scr.openPause(); }));
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
