// Persistence. Worlds are saved whole — the world never resets.
// Desktop builds write JSON files via the Electron bridge; a plain browser
// falls back to localStorage.
(function () {
  function toB64(u8) {
    if (typeof Buffer !== 'undefined') return Buffer.from(u8).toString('base64');
    let s = '';
    for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
    return btoa(s);
  }
  function fromB64(str) {
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(str, 'base64'));
    const bin = atob(str);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }

  function rle(u8) {
    const out = [];
    for (let i = 0; i < u8.length;) {
      const v = u8[i]; let n = 1;
      while (n < 255 && i + n < u8.length && u8[i + n] === v) n++;
      out.push(n, v); i += n;
    }
    return new Uint8Array(out);
  }
  function unrle(b, n) {
    const out = new Uint8Array(n);
    let o = 0;
    for (let i = 0; i + 1 < b.length && o < n; i += 2) { out.fill(b[i + 1], o, Math.min(n, o + b[i])); o += b[i]; }
    return out;
  }

  // IndexedDB: room for big worlds (localStorage holds about 5 MB, and a grown
  // world can outgrow it). Every save goes to both; whichever copy is newer wins.
  const IDB = {
    db: null,
    open() {
      if (IDB.db) return Promise.resolve(IDB.db);
      if (typeof indexedDB === 'undefined') return Promise.resolve(null);
      return new Promise(res => {
        try {
          const rq = indexedDB.open('echo-worlds', 1);
          rq.onupgradeneeded = () => { const d = rq.result; if (!d.objectStoreNames.contains('worlds')) d.createObjectStore('worlds'); };
          rq.onsuccess = () => { IDB.db = rq.result; res(IDB.db); };
          rq.onerror = rq.onblocked = () => res(null);
        } catch (e) { res(null); }
      });
    },
    async op(mode, fn) {
      const d = await IDB.open(); if (!d) return null;
      return new Promise(res => {
        try {
          const tx = d.transaction('worlds', mode), st = tx.objectStore('worlds');
          const rq = fn(st);
          tx.oncomplete = () => res(rq ? rq.result : true); tx.onerror = tx.onabort = () => res(null);
        } catch (e) { res(null); }
      });
    },
    put(id, json, meta) { return IDB.op('readwrite', st => st.put({ json, meta }, id)); },
    get(id) { return IDB.op('readonly', st => st.get(id)); },
    all() { return IDB.op('readonly', st => st.getAll()); },
    del(id) { return IDB.op('readwrite', st => st.delete(id)); }
  };

  const S = ECHO.Save = {
    IDB,
    serialize(world) {
      const out = {};
      for (const k of Object.keys(world)) {
        // derived caches are rebuilt on load; plain flags and counters are kept
        if (k[0] === '_' && (typeof world[k] === 'object' || k === '_tileEpoch' || k === '_hourAcc')) continue;
        if (k === 'blocked') continue;
        out[k] = world[k];
      }
      // grown worlds get big: long runs of the same ground pack small
      out.tiles = world.frontier ? 'rle:' + toB64(rle(world.tiles)) : toB64(world.tiles);
      return JSON.stringify(out);
    },
    deserialize(json) {
      const w = JSON.parse(json);
      w.tiles = typeof w.tiles === 'string' && w.tiles.startsWith('rle:') ? unrle(fromB64(w.tiles.slice(4)), w.W * w.H) : fromB64(w.tiles);
      w.journeys = w.journeys || [];
      w.news = w.news || [];
      // saves made before the flags were kept: don't place the wild a second time
      if (w.caches && !w._wild) w._wild = 1;
      if (w.sites && !w._dng && ECHO.Explore && w.sites.some(x => ECHO.Explore.DUNGEONS.some(([k]) => k === x.kind))) w._dng = 1;
      ECHO.World.rebuildBlocked(w);
      return w;
    },
    meta(world) {
      const pl = world.player;
      const highlights = world.chronicle.filter(e => e.imp >= 3).slice(-6).map(e => e.text);
      return {
        id: world.id, name: world.name, seed: world.seed, day: world.day, date: ECHO.TIME.fmtDate(world.day),
        savedAt: Date.now(), playSeconds: Math.round(world.playSeconds || 0),
        hero: pl ? `${pl.first} ${pl.last}` : null, heroTitle: pl ? ECHO.Character.title(pl) : null,
        legends: world.legends.map(l => ({ name: l.name, epithet: l.epithet, died: l.died, cause: l.cause })),
        population: Object.values(world.npcs).filter(n => n.status !== 'dead').length,
        eras: Object.values(world.factions).filter(f => f.type === 'kingdom').map(f => ({ name: f.name, era: ECHO.Civ.eraName(world, f.id), fallen: !!f.fallen })),
        highlights, livesOn: world.livesOn !== false
      };
    },
    async list() {
      if (typeof window !== 'undefined' && window.echoNative) return window.echoNative.listWorlds();
      const by = {};
      const add = m => { if (m && m.id && (!by[m.id] || (m.savedAt || 0) > (by[m.id].savedAt || 0))) by[m.id] = m; };
      try {
        if (typeof localStorage !== 'undefined') for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('echo.meta.')) { try { add(JSON.parse(localStorage.getItem(k))); } catch (e) { /* skip */ } }
        }
      } catch (e) { S.storageBlocked = true; }
      const rows = await IDB.all();
      if (rows) for (const r of rows) add(r && r.meta);
      return Object.values(by);
    },
    async save(world) {
      const json = S.serialize(world);
      const meta = S.meta(world);
      if (typeof window !== 'undefined' && window.echoNative) { await window.echoNative.saveWorld(world.id, json, meta); return true; }
      // localStorage first: it is written at once, even as the page closes
      let ls = false;
      try {
        localStorage.setItem('echo.world.' + world.id, json);
        localStorage.setItem('echo.meta.' + world.id, JSON.stringify(meta));
        ls = true;
      } catch (e) {
        // too big for localStorage: drop the old copy there, so it can never be mistaken for the newest
        try { localStorage.removeItem('echo.world.' + world.id); localStorage.setItem('echo.meta.' + world.id, JSON.stringify({ ...meta, inIdb: true })); } catch (e2) { /* blocked */ }
      }
      const idb = await IDB.put(world.id, json, meta);
      S.lastSaved = Date.now();
      if (ls || idb) return true;
      console.warn('save failed');
      if (!S._warned && typeof ECHO.UI !== 'undefined' && ECHO.UI.toast) {
        S._warned = true;
        ECHO.UI.toast('This browser would not save the world (storage is full or blocked). Use Export world on the title screen to keep a copy.', 'warn', 10);
      }
      return false;
    },
    // A portable copy of a whole world, for backup or moving between browsers.
    exportText(world) {
      return JSON.stringify({ echoWorld: 1, meta: S.meta(world), data: S.serialize(world) });
    },
    async importText(text) {
      const o = JSON.parse(text);
      if (!o || !o.echoWorld || !o.data) throw new Error('That file is not an ECHO world.');
      const world = S.deserialize(o.data);
      if (!world.tiles || !world.npcs) throw new Error('That world file is damaged.');
      const ok = await S.save(world);
      if (!ok) throw new Error('This browser has no room to store the world.');
      return world;
    },
    async load(id) {
      if (typeof window !== 'undefined' && window.echoNative) {
        const json = await window.echoNative.loadWorld(id);
        try { return json ? S.deserialize(json) : null; } catch (e) { console.error(e); return null; }
      }
      // both copies, newest first; a damaged one falls back to the other
      const cands = [];
      try { const j = localStorage.getItem('echo.world.' + id); if (j) { let m = null; try { m = JSON.parse(localStorage.getItem('echo.meta.' + id)); } catch (e) { /* none */ } cands.push({ json: j, at: (m && m.savedAt) || 0 }); } } catch (e) { /* blocked */ }
      const r = await IDB.get(id);
      if (r && r.json) cands.push({ json: r.json, at: (r.meta && r.meta.savedAt) || 0 });
      cands.sort((a, b) => b.at - a.at);
      for (const c of cands) { try { return S.deserialize(c.json); } catch (e) { console.error(e); } }
      return null;
    },
    async remove(id) {
      if (typeof window !== 'undefined' && window.echoNative) return window.echoNative.deleteWorld(id);
      try {
        localStorage.removeItem('echo.world.' + id);
        localStorage.removeItem('echo.meta.' + id);
      } catch (e) { /* storage blocked */ }
      await IDB.del(id);
    }
  };
})();
