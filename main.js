// ECHO — Electron main process.
// Owns the window and the on-disk world saves (one JSON file per world).
const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron');
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
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
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

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
