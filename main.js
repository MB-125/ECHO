// ECHO — Electron main process.
// Owns the window and the on-disk world saves (one JSON file per world).
const { app, BrowserWindow, ipcMain, Menu, shell, net } = require('electron');
const path = require('path');
const fs = require('fs');

const WORLDS_DIR = () => path.join(app.getPath('userData'), 'worlds');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function safeId(id) {
  return String(id).replace(/[^a-zA-Z0-9_-]/g, '');
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#0b0a0f',
    icon: path.join(__dirname, 'src', 'icon.png'),
    title: 'ECHO — The Living Realm',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  });
  Menu.setApplicationMenu(null);
  // Let the game save the world before the window goes away.
  let closing = false;
  win.on('close', (e) => {
    if (closing) return;
    e.preventDefault();
    closing = true;
    win.webContents.send('app:beforeClose');
    setTimeout(() => { if (!win.isDestroyed()) win.destroy(); }, 2500);
  });
  ipcMain.removeHandler('app:closeNow');
  ipcMain.handle('app:closeNow', () => { if (!win.isDestroyed()) win.destroy(); });
  loadGame(win);
  if (process.env.ECHO_SMOKE) smokeTest(win);
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
    if (input.type === 'keyDown' && input.key === 'F12') {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });
}

// ---- Smoke test (CI): launch, play a little, save, reload, quit -------------
function smokeTest(win) {
  const errors = [];
  win.webContents.on('console-message', (e, ...args) => {
    const level = e && e.level != null ? e.level : args[0];
    const message = e && e.message != null ? e.message : args[1];
    if (level === 'error' || level === 3) errors.push(String(message));
  });
  win.webContents.once('did-finish-load', async () => {
    let result;
    try {
      result = await win.webContents.executeJavaScript(`(async () => {
        const wait = ms => new Promise(r => setTimeout(r, ms));
        for (let i = 0; i < 100 && !document.querySelector('button[data-a=new]'); i++) await wait(100);
        if (!window.echoNative) return { ok: false, why: 'native bridge missing' };
        const world = ECHO.generateWorld({ seed: 4242, name: 'Smoke', id: 'smoke' });
        await ECHO.Save.save(world);
        let raf = 0; const count = () => { raf++; if (raf < 100000) requestAnimationFrame(count); }; requestAnimationFrame(count);
        ECHO.Screens.begin(world, 'Tester', world.settlements[0].id, null, false);
        await wait(3000);
        // Step the game deterministically too (rAF can be throttled on a headless display).
        for (let i = 0; i < 200; i++) { ECHO.Game.update(0.05); if (i % 25 === 0) { ECHO.Renderer.draw(ECHO.Game, 0.05); await wait(1); } }
        const ents = ECHO.Game.ents.length;
        const kinds = ECHO.Game.ents.reduce((a, e) => { a[e.type] = (a[e.type] || 0) + 1; return a; }, {});
        await ECHO.Game.save();
        const list = await ECHO.Save.list();
        const loaded = await ECHO.Save.load('smoke');
        await window.echoNative.deleteWorld('smoke');
        const fonts = document.fonts ? document.fonts.check('16px "Pixelify Sans"') : null;
        return { renderer: ECHO.render3d ? '3d' : '2d', ok: ents > 5 && list.some(m => m.id === 'smoke') && !!loaded && !!loaded.player && loaded.player.first === 'Tester', ents, kinds, rafFrames: raf, worlds: list.length, day: loaded && loaded.day, minute: Math.round(ECHO.Game.world.minute), fonts };
      })()`);
    } catch (err) { result = { ok: false, why: String(err) }; }
    const ok = result && result.ok && errors.length === 0;
    const line = `${JSON.stringify(result)} errors=${JSON.stringify(errors.slice(0, 5))}`.replace(/[\r\n]+/g, ' ');
    console.log(ok ? `::notice title=Smoke test passed::${line}` : `::error title=Smoke test failed::${line}`);
    try {
      const img = await win.webContents.capturePage();
      fs.writeFileSync(path.join(process.cwd(), 'smoke.png'), img.toPNG());
    } catch (e) { /* screenshot optional */ }
    app.exit(ok ? 0 : 1);
  });
}

// ---- World save IPC -------------------------------------------------------
ipcMain.handle('worlds:list', () => {
  const dir = WORLDS_DIR();
  ensureDir(dir);
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.meta.json'))
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); }
      catch (e) { return null; }
    })
    .filter(Boolean);
});

ipcMain.handle('worlds:load', (_e, id) => {
  const file = path.join(WORLDS_DIR(), safeId(id) + '.json');
  for (const f of [file, file + '.bak']) {
    if (!fs.existsSync(f)) continue;
    const text = fs.readFileSync(f, 'utf8');
    try { JSON.parse(text); return text; } catch (e) { /* damaged: try the backup */ }
  }
  return null;
});

ipcMain.handle('worlds:save', (_e, id, json, meta) => {
  const dir = WORLDS_DIR();
  ensureDir(dir);
  const base = path.join(dir, safeId(id));
  // Write to temp then rename so a crash never corrupts a world; the save before it is kept as .bak.
  fs.writeFileSync(base + '.json.tmp', json, 'utf8');
  try { if (fs.existsSync(base + '.json')) fs.copyFileSync(base + '.json', base + '.json.bak'); } catch (e) { /* backup optional */ }
  fs.renameSync(base + '.json.tmp', base + '.json');
  fs.writeFileSync(base + '.meta.json', JSON.stringify(meta), 'utf8');
  return true;
});

ipcMain.handle('worlds:delete', (_e, id) => {
  const base = path.join(WORLDS_DIR(), safeId(id));
  for (const f of [base + '.json', base + '.meta.json', base + '.json.bak']) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  return true;
});

ipcMain.handle('app:quit', () => app.quit());
ipcMain.handle('app:toggleFullscreen', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win) win.setFullScreen(!win.isFullScreen());
});

// ---- Updates ----------------------------------------------------------------
// Two kinds of update:
//  • The game itself (everything you see and play) is one self-contained page,
//    attached to every GitHub release as echo-game.html. The app downloads it
//    in the background and plays it from the next start (or at once, if you
//    choose Restart now). Nothing to install.
//  • Rarely, the app around the game (this file) changes too; the release's
//    echo-game.json says which app it needs, and then the game shows a download
//    button for the new installer instead.
const REPO = 'MB-125/ECHO';
const PKG = require('./package.json');
const SHELL = PKG.echoShell || 1;           // bump when main.js / preload.js change in a way the game relies on
const API = process.env.ECHO_UPDATE_API || ('https://api.github.com/repos/' + REPO);   // env var: testing only
const GAME_DIR = () => path.join(app.getPath('userData'), 'game');
const BUNDLED = path.join(__dirname, 'src', 'index.html');
let LOADED = { version: app.getVersion(), file: null };  // what the window is playing
const VERSION = () => process.env.ECHO_FAKE_VERSION || LOADED.version; // the env var is for testing the notice
const cmpV = (a, b) => {
  const pa = String(a || '0').split('.').map(n => parseInt(n, 10) || 0), pb = String(b || '0').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d > 0 ? 1 : -1; }
  return 0;
};
// A downloaded game newer than the one that came with the app, if there is a good one.
function cachedGame() {
  if (process.env.ECHO_NO_HOTUPDATE) return null;
  try {
    const m = JSON.parse(fs.readFileSync(path.join(GAME_DIR(), 'current.json'), 'utf8'));
    const f = path.join(GAME_DIR(), path.basename(m.file || ''));
    if (m.version && fs.existsSync(f) && fs.statSync(f).size > 500000 && cmpV(m.version, app.getVersion()) > 0 && (m.shell || 1) <= SHELL) return { version: m.version, file: f };
  } catch (e) { /* none */ }
  return null;
}
function dropCachedGame(why) {
  try { fs.renameSync(path.join(GAME_DIR(), 'current.json'), path.join(GAME_DIR(), 'bad.json')); } catch (e) { /* ignore */ }
  console.error('ECHO: the downloaded game would not start (' + why + '); using the one that came with the app.');
}
let readyCb = null;
ipcMain.handle('app:ready', () => { if (readyCb) readyCb(); readyCb = null; });
function loadGame(win) {
  const c = cachedGame();
  LOADED = c || { version: app.getVersion(), file: null };
  win.loadFile(c ? c.file : BUNDLED);
  if (!c) return;
  // if the downloaded game doesn't come up, fall back to the one that came with the app
  let ok = false;
  readyCb = () => { ok = true; };
  const fallback = why => { if (ok || win.isDestroyed()) return; ok = true; dropCachedGame(why); LOADED = { version: app.getVersion(), file: null }; win.loadFile(BUNDLED); };
  win.webContents.once('did-fail-load', () => fallback('load failed'));
  win.webContents.once('render-process-gone', () => fallback('crashed'));
  setTimeout(() => fallback('timed out'), 30000);
}
function pickAsset(assets) {
  const names = (assets || []).map(a => ({ name: a.name, url: a.browser_download_url }));
  const find = re => names.find(a => re.test(a.name));
  if (process.platform === 'win32') return process.env.PORTABLE_EXECUTABLE_FILE ? find(/^ECHO[ .][\d.]+\.exe$/i) || find(/\.exe$/i) : find(/setup.*\.exe$/i) || find(/\.exe$/i);
  if (process.platform === 'darwin') return (process.arch === 'arm64' ? find(/arm64.*\.dmg$/i) : find(/^(?!.*arm64).*\.dmg$/i)) || find(/\.dmg$/i);
  return process.env.APPIMAGE ? find(/\.AppImage$/i) : find(/\.AppImage$/i) || find(/\.deb$/i);
}
async function fetchT(url, ms, json) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try {
    const get = (net && net.fetch) ? net.fetch.bind(net) : fetch;
    const r = await get(url, { signal: ctl.signal, headers: { 'Accept': json ? 'application/vnd.github+json' : 'application/octet-stream', 'User-Agent': 'ECHO/' + VERSION() } });
    if (!r.ok) return null;
    return json ? await r.json() : Buffer.from(await r.arrayBuffer());
  } finally { clearTimeout(t); }
}
const okHost = u => { try { const h = new URL(u).hostname; return process.env.ECHO_UPDATE_API ? true : /(^|\.)github\.com$|(^|\.)githubusercontent\.com$/.test(h); } catch (e) { return false; } };
let fetching = null;
// Download the new game into the cache. Resolves to the version made ready, or null.
async function fetchGame(rel, latest) {
  const ga = (rel.assets || []).find(a => a.name === 'echo-game.html'), ma = (rel.assets || []).find(a => a.name === 'echo-game.json');
  if (!ga || !ma || !okHost(ga.browser_download_url) || !okHost(ma.browser_download_url)) return { why: 'no game file' };
  const meta = await fetchT(ma.browser_download_url, 15000, true);
  if (!meta || cmpV(meta.version, latest) !== 0) return { why: 'bad meta' };
  if ((meta.shell || 1) > SHELL) return { why: 'needs new app' };
  const dir = GAME_DIR(); ensureDir(dir);
  try { const bad = JSON.parse(fs.readFileSync(path.join(dir, 'bad.json'), 'utf8')); if (bad.version === latest) return { why: 'would not start' }; } catch (e) { /* none */ }
  const name = 'echo-' + String(latest).replace(/[^0-9.]/g, '') + '.html', file = path.join(dir, name);
  try {
    const cur = JSON.parse(fs.readFileSync(path.join(dir, 'current.json'), 'utf8'));
    if (cur.version === latest && fs.existsSync(file)) return { ready: latest };
  } catch (e) { /* none yet */ }
  const buf = await fetchT(ga.browser_download_url, 180000, false);
  if (!buf || buf.length < 500000 || (meta.size && buf.length !== meta.size)) return { why: 'download incomplete' };
  const text = buf.toString('utf8');
  if (!text.includes('ECHO.Screens') || !text.includes('</html>')) return { why: 'not the game' };
  fs.writeFileSync(file + '.tmp', buf);
  fs.renameSync(file + '.tmp', file);
  fs.writeFileSync(path.join(dir, 'current.json'), JSON.stringify({ version: latest, file: name, shell: meta.shell || 1, at: Date.now() }));
  // keep only this one and the one being played
  for (const f of fs.readdirSync(dir)) if (/^echo-[\d.]+\.html$/.test(f) && f !== name && (!LOADED.file || path.basename(LOADED.file) !== f)) { try { fs.unlinkSync(path.join(dir, f)); } catch (e) { /* in use */ } }
  return { ready: latest };
}
ipcMain.handle('app:version', () => VERSION());
ipcMain.handle('app:checkUpdate', async () => {
  try {
    const rel = await fetchT(API + '/releases/latest', 8000, true);
    if (!rel || !rel.tag_name) return { current: VERSION(), error: 'no release' };
    const latest = String(rel.tag_name).replace(/^v/, '');
    const a = pickAsset(rel.assets);
    const out = { current: VERSION(), app: app.getVersion(), latest, page: rel.html_url, download: a ? a.url : null, file: a ? a.name : null, notes: rel.body || '', date: rel.published_at };
    if (cmpV(latest, VERSION()) > 0 && !process.env.ECHO_NO_HOTUPDATE) {
      if (!fetching) fetching = fetchGame(rel, latest).finally(() => { fetching = null; });
      const r = await fetching.catch(e => ({ why: String(e && e.message || e) }));
      if (r && r.ready) out.ready = r.ready; else out.why = r && r.why;
    }
    return out;
  } catch (e) { return { current: VERSION(), error: String(e && e.message || e) }; }
});
// The game has saved; start again on the newest game.
ipcMain.handle('app:restart', () => { app.relaunch(); app.exit(0); });
ipcMain.handle('app:openLink', (_e, url) => {
  if (typeof url === 'string' && url.startsWith('https://github.com/' + REPO + '/')) shell.openExternal(url);
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
