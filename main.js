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
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
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
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, 'utf8');
});

ipcMain.handle('worlds:save', (_e, id, json, meta) => {
  const dir = WORLDS_DIR();
  ensureDir(dir);
  const base = path.join(dir, safeId(id));
  // Write to temp then rename so a crash never corrupts a world.
  fs.writeFileSync(base + '.json.tmp', json, 'utf8');
  fs.renameSync(base + '.json.tmp', base + '.json');
  fs.writeFileSync(base + '.meta.json', JSON.stringify(meta), 'utf8');
  return true;
});

ipcMain.handle('worlds:delete', (_e, id) => {
  const base = path.join(WORLDS_DIR(), safeId(id));
  for (const f of [base + '.json', base + '.meta.json']) {
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
