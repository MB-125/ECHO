// ECHO — update notices (desktop app).
// Asks the desktop shell whether a newer release is out, shows it on the title
// screen and in the pause menu, and after an update says what changed.
(function () {
  const ECHO = window.ECHO;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // What each version brought, newest first. Shown once after updating.
  const CHANGES = [
    { v: '0.3.7', items: ['Smarter pathfinding for every creature and person: they look ahead and steer round trunks, rocks and walls, plan routes only through gaps their body actually fits, notice when they stop getting closer and plan a way round, and avoid the spot that stopped them. Wolves chasing through woods now get through about four times as often; big creatures like trolls find their way through towns and rocky ground.'] },
    { v: '0.3.6', items: ['Send word to your old companions: on your character page (K), everyone who once rode with you can be reached by a runner (3 crowns) — ask them to come back and fight beside you (they ride to find you), to send supplies, or just send your regards. Their answers arrive as letters.'] },
    { v: '0.3.5', items: ['Anyone carrying a weapon now fights back when attacked — a farmer you armed will stand and cut down the wolves instead of running.', 'Gear counts properly for townsfolk: their blows come from their weapon\'s own damage (shaped by their skill), as yours do, and their strength updates as soon as they put something new on.'] },
    { v: '0.3.4', items: ['People now look like what they wear, the same way you do: the colour and glow of their blade, axe, spear, staff or bow, and their armour\'s colours, helm, shoulder plates and crest — in 3D and in 2D.', 'Talking to someone shows the gear they wear, with pictures, names and stats, and their level.'] },
    { v: '0.3.3', items: ['Give gear you don\'t use to anyone, free: "Give away…" on any spare piece in your character page (K), or tell someone "I have gear I don\'t use — take it". ★ marks who would wear it; anyone else passes it to whoever in town needs it.', 'In a town, "Share all spare pieces" hands everything you don\'t use to the people who need it most. People remember, and word of it spreads.'] },
    { v: '0.3.2', items: ['Updates now arrive completely by themselves: each new version is published automatically, downloaded in the background, and switched to on the title screen.', 'Fixed a rare crash when a great beast roared before the sound had started.'] },
    { v: '0.3.1', items: ['Guards, soldiers, outlaws and townsfolk now size up a foe before they fight: its level, gear, health and healing against their own and their friends\'. Good odds, they fight; poor odds alone, they shout for help, hold back out of reach and go in together once enough have gathered; hopeless, guards keep their distance and send for more while outlaws and townsfolk run.', 'Seasoned or brave townsfolk answer a call for help and fight beside the guards when together they stand a chance.'] },
    { v: '0.3.0', items: ['Townsfolk go delving too: guards, hunters and the bold go down into dungeons and caves (alone or with friends), come back stronger and wear the weapons and armour they find. Some don\'t come back.', 'Everyone has a level now, and seasoned delvers hit harder and last longer. Ask anyone "How strong are you these days?" — and give them gear from your pack.', 'The guide (J) lists the townsfolk who delve, with their level and gear.'] },
    { v: '0.2.9', items: ['No more dungeon floors walled off by chests, stairs, boulders or pillars: every room, iron door, stair and chest can now be reached.'] },
    { v: '0.2.8', items: ['Your hero no longer dies for good: a fall costs a few days and some coin, never your level or gear. (Legacy, where heroes die for good, is now a choice in the Esc menu.)'] },
    { v: '0.2.7', items: ['Updates now install themselves: the app downloads each new version in the background and plays it the next time you open it, or at once with Restart now.'] },
    { v: '0.2.6', items: ['When you fall to beasts or monsters, you wake in a town with a dungeon of your level close by, and can head straight for it.'] },
    { v: '0.2.5', items: ['Horses no longer get stuck against trees, rocks or the water\'s edge: a wedged horse works itself free, steers round trunks and boulders, and picks its way through thick woods at a walk.', 'When you mount or whistle, your horse stands somewhere with room to move.'] },
    { v: '0.2.4', items: ['The title screen shows your version in a clear badge: green when you have the newest, gold with a download button when a new one is out.', 'If an update is out, you are told each time you enter a world.'] },
    { v: '0.2.3', items: ['The app tells you when a new version is out, with a button to download it, and shows what changed after you update.'] },
    { v: '0.2.2', items: ['Every town of the old island has an easy starter cave nearby (Lv 1–3), shown on the map from the start.', 'The guide (J) lists dungeons for your level: the best floor for you in each, and a Guide me there button.'] },
    { v: '0.2.1', items: ['Text no longer piles up over the HUD in smaller windows.'] },
    { v: '0.2.0', items: ['Choose any floor you have reached at a dungeon door.', 'Saves are kept with a backup copy; Export and Import world work in the desktop app.'] }
  ];

  const cmp = (a, b) => {
    const pa = String(a || '0').split('.').map(n => parseInt(n, 10) || 0), pb = String(b || '0').split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d > 0 ? 1 : -1; }
    return 0;
  };
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  };

  const Up = ECHO.Updates = {
    CHANGES, cmp,
    state: 'idle', // idle | checking | current | available | error
    current: null, info: null, news: null, toasted: false,

    native() { return window.echoNative && window.echoNative.checkUpdate ? window.echoNative : null; },

    async init() {
      const N = Up.native();
      if (!N) return;
      try { Up.current = await N.version(); } catch (e) { return; }
      const last = store.get('echo.lastVersion');
      if (last && cmp(Up.current, last) > 0) Up.news = CHANGES.filter(c => cmp(c.v, last) > 0 && cmp(c.v, Up.current) <= 0);
      else if (!last) {
        // first run of a version that knows about this: if worlds exist, this is an update
        try { const metas = await ECHO.Save.list(); if (metas.length) Up.news = CHANGES.filter(c => c.v === Up.current); } catch (e) { /* ignore */ }
      }
      if (Up.news && !Up.news.length) Up.news = null;
      if (!Up.news) store.set('echo.lastVersion', Up.current);
      Up.mount();
      Up.check();
      setInterval(() => Up.check(), 3600 * 1000);
      // tell a player who is in a world, once per world entered
      let shownFor = null;
      setInterval(() => {
        const g = ECHO.Game, UI = ECHO.UI;
        if ((Up.state !== 'available' && Up.state !== 'ready') || !g || !g.world || !UI || !UI.toast || UI.paused()) return;
        const key = g.world.id + '|' + Up.info.latest + '|' + Up.state;
        if (shownFor === key) return;
        shownFor = key;
        UI.toast(Up.state === 'ready'
          ? `⬆ ECHO ${Up.info.latest} has downloaded. It switches over when you go back to the title screen or next open the game (or now: Esc → Restart now). Your world carries over.`
          : `⬆ ECHO ${Up.info.latest} is out (you have ${Up.current}). Press Esc to download it; your worlds carry over.`, 'legend', 10);
      }, 4000);
    },

    async check() {
      const N = Up.native();
      if (!N || Up.state === 'checking') return;
      Up.state = 'checking'; Up.mount();
      let r = null;
      try { r = await N.checkUpdate(); } catch (e) { r = { error: String(e) }; }
      if (!r || r.error || !r.latest) Up.state = 'error';
      else {
        Up.info = r;
        const newer = cmp(r.latest, Up.current || r.current) > 0;
        // a release still being built (its game file not attached yet): wait and look again
        const fresh = r.date && Date.now() - Date.parse(r.date) < 40 * 60 * 1000;
        Up.state = !newer ? 'current' : r.ready === r.latest ? 'ready' : (r.why === 'no game file' && fresh) ? 'pending' : 'available';
        if (Up.state === 'pending') { clearTimeout(Up._again); Up._again = setTimeout(() => Up.check(), 3 * 60 * 1000); }
      }
      Up.mount();
      Up.autoApply();
    },
    // On the title screen (no world open), a downloaded update switches over by itself.
    autoApply() {
      const N = Up.native();
      if (Up.state !== 'ready' || !N || !N.restart || Up._applying) return;
      if (ECHO.Game && ECHO.Game.world) return;          // never in the middle of play
      if (!document.querySelector('#screen:not(.hidden) .upd-slot')) return;   // only on the title screen
      Up._applying = true;
      Up.mount();
      setTimeout(() => { if (ECHO.Game && ECHO.Game.world) { Up._applying = false; Up.mount(); return; } N.restart(); }, 2500);
    },

    // The little card on the title screen and in the pause menu.
    html() {
      if (!Up.native()) return '';
      const v = Up.current ? 'v' + esc(Up.current) : '';
      let out = '';
      if (Up.news) out += `<div class="upd-card upd-news"><h4>Updated to ${v}</h4><ul>${Up.news.map(c => c.items.map(t => `<li>${esc(t)}</li>`).join('')).join('')}</ul><div class="dim">Your worlds and progress are as you left them.</div><div class="row"><button class="small" data-upd="seen">Got it</button></div></div>`;
      if (Up.state === 'ready' && Up._applying) {
        out += `<div class="upd-card upd-new"><h4>⬆ Updating to v${esc(Up.info.latest)}…</h4><div class="dim">One moment — ECHO restarts on the new version. Your worlds carry over.</div></div>`;
      } else if (Up.state === 'pending') {
        out += `<div class="upd-badge"><b>ECHO ${v}</b> <span>v${esc(Up.info.latest)} is on its way — it will install itself in a few minutes</span></div>`;
      } else if (Up.state === 'ready') {
        out += `<div class="upd-card upd-new"><h4>⬆ ECHO v${esc(Up.info.latest)} is ready</h4><div class="dim">It has downloaded by itself and switches over when you return to the title screen or next open ECHO. Your worlds and progress carry over.</div><div class="row"><button class="small primary" data-upd="restart">Restart now</button></div></div>`;
      } else if (Up.state === 'available') {
        const i = Up.info;
        out += `<div class="upd-card upd-new"><h4>⬆ A new version is out: v${esc(i.latest)}</h4><div class="dim">You have ${v}. Download it and install over this one; your worlds carry over.</div><div class="row">${i.download ? `<button class="small primary" data-upd="download">Download ${esc(i.file || '')}</button>` : ''}<button class="small" data-upd="page">${i.download ? 'Release page' : 'Download page'}</button></div></div>`;
      } else {
        const st = Up.state, s = { idle: 'checking for updates…', checking: 'checking for updates (and fetching any new version)…', current: '✓ up to date — this is the newest version', error: 'could not reach GitHub to check for updates' }[st] || '';
        out += `<div class="upd-badge ${st === 'current' ? 'ok' : st === 'error' ? 'err' : ''}"><b>ECHO ${v}</b> <span>${s}</span>${st === 'error' || st === 'current' ? ' <button class="small linkish" data-upd="check">Check again</button>' : ''}</div>`;
      }
      return out;
    },

    mount() {
      document.querySelectorAll('.upd-slot').forEach(el => { el.innerHTML = Up.html(); Up.bind(el); });
      if (Up.state === 'ready' && !Up._applying) setTimeout(() => Up.autoApply(), 0);
    },

    bind(root) {
      root.querySelectorAll('[data-upd]').forEach(b => b.addEventListener('click', () => {
        const a = b.dataset.upd, N = Up.native();
        if (a === 'download' && Up.info && Up.info.download) N.openLink(Up.info.download);
        else if (a === 'page' && Up.info) N.openLink(Up.info.page);
        else if (a === 'check') Up.check();
        else if (a === 'restart') {
          b.disabled = true; b.textContent = 'Saving…';
          (async () => { try { if (ECHO.Game && ECHO.Game.world) await ECHO.Game.save(); } catch (e) { console.error(e); } if (N.restart) N.restart(); })();
        }
        else if (a === 'seen') { Up.news = null; store.set('echo.lastVersion', Up.current); Up.mount(); }
      }));
    }
  };
})();
