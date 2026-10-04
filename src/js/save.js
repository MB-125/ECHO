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

  const S = ECHO.Save = {
    serialize(world) {
      const out = {};
      for (const k of Object.keys(world)) {
        if (k[0] === '_' && k !== '_eid') continue;
        if (k === 'blocked') continue;
        out[k] = world[k];
      }
      out.tiles = toB64(world.tiles);
      return JSON.stringify(out);
    },
    deserialize(json) {
      const w = JSON.parse(json);
      w.tiles = fromB64(w.tiles);
      w.journeys = w.journeys || [];
      w.news = w.news || [];
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
        highlights
      };
    },
    async list() {
      if (typeof window !== 'undefined' && window.echoNative) return window.echoNative.listWorlds();
      const out = [];
      try {
        if (typeof localStorage === 'undefined') return out;
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('echo.meta.')) { try { out.push(JSON.parse(localStorage.getItem(k))); } catch (e) { /* skip */ } }
        }
      } catch (e) { S.storageBlocked = true; }
      return out;
    },
    async save(world) {
      const json = S.serialize(world);
      const meta = S.meta(world);
      if (typeof window !== 'undefined' && window.echoNative) { await window.echoNative.saveWorld(world.id, json, meta); return true; }
      try {
        localStorage.setItem('echo.world.' + world.id, json);
        localStorage.setItem('echo.meta.' + world.id, JSON.stringify(meta));
        return true;
      } catch (e) {
        console.warn('save failed', e);
        if (!S._warned && typeof ECHO.UI !== 'undefined' && ECHO.UI.toast) {
          S._warned = true;
          ECHO.UI.toast('This browser would not save the world (storage is full or blocked). Use Export world on the title screen to keep a copy.', 'warn', 10);
        }
        return false;
      }
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
      let json = null;
      if (typeof window !== 'undefined' && window.echoNative) json = await window.echoNative.loadWorld(id);
      else { try { json = localStorage.getItem('echo.world.' + id); } catch (e) { json = null; } }
      try { return json ? S.deserialize(json) : null; } catch (e) { console.error(e); return null; }
    },
    async remove(id) {
      if (typeof window !== 'undefined' && window.echoNative) return window.echoNative.deleteWorld(id);
      try {
        localStorage.removeItem('echo.world.' + id);
        localStorage.removeItem('echo.meta.' + id);
      } catch (e) { /* storage blocked */ }
    }
  };
})();
