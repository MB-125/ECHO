// ECHO — update notices (desktop app).
// Asks the desktop shell whether a newer release is out, shows it on the title
// screen and in the pause menu, and after an update says what changed.
(function () {
  const ECHO = window.ECHO;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // What each version brought, newest first. Shown once after updating.
  const CHANGES = [
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
      setInterval(() => Up.check(), 3 * 3600 * 1000);
      // tell a player who is in a world, once per world entered
      let shownFor = null;
      setInterval(() => {
        const g = ECHO.Game, UI = ECHO.UI;
        if (Up.state !== 'available' || !g || !g.world || !UI || !UI.toast || UI.paused()) return;
        const key = g.world.id + '|' + Up.info.latest;
        if (shownFor === key) return;
        shownFor = key;
        UI.toast(`⬆ ECHO ${Up.info.latest} is out (you have ${Up.current}). Press Esc to download it; your worlds carry over.`, 'legend', 9);
      }, 4000);
    },

    async check() {
      const N = Up.native();
      if (!N || Up.state === 'checking') return;
      Up.state = 'checking'; Up.mount();
      let r = null;
      try { r = await N.checkUpdate(); } catch (e) { r = { error: String(e) }; }
      if (!r || r.error || !r.latest) Up.state = 'error';
      else { Up.info = r; Up.state = cmp(r.latest, Up.current || r.current) > 0 ? 'available' : 'current'; }
      Up.mount();
    },

    // The little card on the title screen and in the pause menu.
    html() {
      if (!Up.native()) return '';
      const v = Up.current ? 'v' + esc(Up.current) : '';
      let out = '';
      if (Up.news) out += `<div class="upd-card upd-news"><h4>Updated to ${v}</h4><ul>${Up.news.map(c => c.items.map(t => `<li>${esc(t)}</li>`).join('')).join('')}</ul><div class="dim">Your worlds and progress are as you left them.</div><div class="row"><button class="small" data-upd="seen">Got it</button></div></div>`;
      if (Up.state === 'available') {
        const i = Up.info;
        out += `<div class="upd-card upd-new"><h4>⬆ A new version is out: v${esc(i.latest)}</h4><div class="dim">You have ${v}. Download it and install over this one; your worlds carry over.</div><div class="row">${i.download ? `<button class="small primary" data-upd="download">Download ${esc(i.file || '')}</button>` : ''}<button class="small" data-upd="page">${i.download ? 'Release page' : 'Download page'}</button></div></div>`;
      } else {
        const st = Up.state, s = { idle: 'checking for updates…', checking: 'checking for updates…', current: '✓ up to date — this is the newest version', error: 'could not reach GitHub to check for updates' }[st] || '';
        out += `<div class="upd-badge ${st === 'current' ? 'ok' : st === 'error' ? 'err' : ''}"><b>ECHO ${v}</b> <span>${s}</span>${st === 'error' || st === 'current' ? ' <button class="small linkish" data-upd="check">Check again</button>' : ''}</div>`;
      }
      return out;
    },

    mount() {
      document.querySelectorAll('.upd-slot').forEach(el => { el.innerHTML = Up.html(); Up.bind(el); });
    },

    bind(root) {
      root.querySelectorAll('[data-upd]').forEach(b => b.addEventListener('click', () => {
        const a = b.dataset.upd, N = Up.native();
        if (a === 'download' && Up.info && Up.info.download) N.openLink(Up.info.download);
        else if (a === 'page' && Up.info) N.openLink(Up.info.page);
        else if (a === 'check') Up.check();
        else if (a === 'seen') { Up.news = null; store.set('echo.lastVersion', Up.current); Up.mount(); }
      }));
    }
  };
})();
