// Progress in real time: experience from fights, levelling up, the look of
// your gear on your body, and reading the strength of whatever you face.
(function () {
  const { U } = ECHO;
  const Pw = () => ECHO.Prowess;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const NOXP = new Set(['hare', 'gnawer', 'hind']);

  const Pg = ECHO.Progress = {
    glows: [], t: 0, target: null, _hud: null, _tgt: null,
    reset() { Pg.glows = []; Pg.t = 0; Pg.target = null; Pg._hud = null; Pg._tgt = null; },

    // Does killing this teach you anything?
    counts(game, e) {
      if (!e || e.marvel || e.type === 'ghost' || e.isCompanion || NOXP.has(e.species)) return false;
      if (e.type === 'boss' || e.foe || e.delve || e.questId || e.lvl) return true;
      return game.hostileTo(game.pe, e);
    },
    // Called by Combat.kill for anything the player (or a companion) brings down.
    onKill(game, e) {
      const pl = game.pl;
      if (!pl || !e._xpOk) return;
      const r = Pw().onKill(pl, e);
      const D = Pw().diff(r.level, Pw().level(pl) - r.ups.length);
      ECHO.Combat.floater(e.x, e.y - 1.2, `+${r.xp} xp${D.skulls ? ' — stronger foe!' : D.k === 'trivial' ? ' (too weak to teach you)' : ''}`, D.skulls ? '#ffcf5a' : '#c8a8ff', D.skulls > 0);
      Pg.flash();
      // the great kills are announced, so you see what they gave you
      if (r.rank === 'great' || r.rank === 'lord' || r.rank === 'champion') {
        const s = Pw().st(pl);
        ECHO.UI.toast(`+${r.xp} experience for ${Pg.nameOf(game, e)} (level ${r.level} ${Pw().FOE_RANK[r.rank].name.toLowerCase()})${r.ups.length ? ` — you rise to level ${s.lv}!` : ` — ${Math.floor(s.xp)}/${Pw().need(s.lv)} toward level ${s.lv + 1}`}.`, 'legend', 6);
      }
      for (const u of r.ups) Pg.levelUp(game, u);
      if (ECHO.Companions) { ECHO.Companions.gain(game, r.xp); ECHO.Companions.event(game, 'kill', e); }
      // outlaws carry coin, and sometimes something worth taking
      if (e.type === 'person' && !e.foe) {
        const rr = Math.random;
        game.loot.push({ x: e.x + (rr() - 0.5) * 0.6, y: e.y + (rr() - 0.5) * 0.6, kind: 'gold', qty: Math.round(3 + rr() * 10 + r.level * 2) });
        if (rr() < (e.isLeader ? 0.6 : 0.08)) ECHO.Monsters.dropGear(game, e.x + (rr() - 0.5), e.y + (rr() - 0.5), r.level, e.isLeader ? 12 : 0, `on an outlaw${e.isLeader ? ' chief' : ''}`);
      }
    },
    // the experience bar glows when it fills
    flash() {
      const el = document.getElementById('hud-rank');
      if (!el) return;
      el.classList.remove('gain'); void el.offsetWidth; el.classList.add('gain');
    },
    levelUp(game, u) {
      const pl = game.pl;
      ECHO.PlayerCtl.derivedT = 0;
      ECHO.PlayerCtl.computeDerived(game);
      pl.hp = pl.maxHp; pl.stamina = pl.maxSta;
      ECHO.Combat.burst(game.pe.x, game.pe.y, u.rank ? u.rank.color : '#ffe08a', 26, 4, 0.9, 3);
      ECHO.Combat.floater(game.pe.x, game.pe.y - 1.8, `LEVEL ${u.lv}`, '#ffe08a', true);
      ECHO.Music.stinger(u.rank ? 'echo' : 'discover');
      if (u.rank) {
        ECHO.UI.banner(`${u.rank.title}`, `Level ${u.lv} — a new rank. ${u.rank.desc}`, false);
        ECHO.Chronicle.deed(game.world, { text: `${pl.first} ${pl.last} is spoken of now as a ${u.rank.title.toLowerCase()} of the sword.`, importance: u.lv >= 9 ? 2 : 1, x: pl.x, y: pl.y, rep: u.lv >= 7 ? 3 : 1 });
      } else ECHO.UI.banner(`Level ${u.lv}`, `${Pw().title(pl)} · your blows land harder, your life runs deeper`, true);
      ECHO.UI.toast(`Level ${u.lv}: +7% damage with every weapon, +9 life, +4 stamina. You are fully healed.`, 'legend', 5);
    },

    // ------------------------------------------------------------ every frame
    update(game, dt) {
      Pg.glows.length = 0;
      const pl = game.pl, pe = game.pe, world = game.world;
      if (!pl || !pe) return;
      Pg.t -= dt;
      if (Pg.t <= 0) {
        Pg.t = 0.5;
        pe.gearLook = Pg.lookOf(world, pl);
        Pg.target = Pg.pickTarget(game);
        Pg.lordBar(game);
      }
      // a gleam along a fine blade
      const L = pe.gearLook && pe.gearLook.blade;
      if (L && L.glow > 0.15 && !pe.dead) {
        const n = Math.round(1 + L.glow * 4), t = game.time;
        for (let i = 0; i < n; i++) {
          const a = t * 2.2 + i * (Math.PI * 2 / n);
          Pg.glows.push({ x: pe.x + Math.cos(a) * 0.45, y: pe.y + Math.sin(a) * 0.45, h: 0.5 + 0.5 * Math.sin(t * 3 + i), s: 0.18 + L.glow * 0.15, c: L.glowCol, a: 0.25 + L.glow * 0.35 });
        }
      }
      // loot shines where it lies, so you can find it after a fight
      for (const l of game.loot) {
        if (l.taken || U.dist(l.x, l.y, pe.x, pe.y) > 30) continue;
        const it = l.kind === 'item' && world.items[l.itemId];
        const col = it ? ECHO.Gear.rarity(it.rarity).color : l.kind === 'gold' || l.kind === 'key' ? '#ffd84a' : (ECHO.Gear.MATS[l.kind] || {}).color || '#f0e6d0';
        const tall = it ? 4 + ['common', 'fine', 'rare', 'epic', 'legendary'].indexOf(it.rarity || 'common') : ECHO.Gear.MATS[l.kind] || l.kind === 'gold' ? 3 : 2;
        for (let i = 0; i < tall; i++) Pg.glows.push({ x: l.x, y: l.y, h: 0.25 + i * 0.32, s: 0.42 - i * 0.03, c: col, a: (0.28 - i * 0.025) * (0.8 + 0.2 * Math.sin(game.time * 4 + l.x)) });
      }
      Pg.hud(game);
      Pg.targetHud(game);
    },
    // Labels for loot lying near you.
    lootLabels(game) {
      const out = [], pe = game.pe, world = game.world;
      if (!pe) return out;
      for (const l of game.loot) {
        if (l.taken || U.dist(l.x, l.y, pe.x, pe.y) > 9) continue;
        const it = l.kind === 'item' && world.items[l.itemId];
        if (it) out.push({ x: l.x, y: l.y, text: `${it.name}${it.plus ? ' +' + it.plus : ''} [E]`, color: ECHO.Gear.rarity(it.rarity).color });
        else if (l.kind === 'gold') out.push({ x: l.x, y: l.y, text: `${l.qty} crown${l.qty === 1 ? '' : 's'}`, color: '#ffd84a' });
        else if (l.kind === 'key') out.push({ x: l.x, y: l.y, text: 'Iron key', color: '#ffd84a' });
        else { const m = ECHO.Gear.MATS[l.kind]; if (m) out.push({ x: l.x, y: l.y, text: `${l.qty} ${m.name}`, color: m.color }); }
      }
      return out;
    },
    // What the player's gear looks like on the body.
    lookOf(world, pl) {
      const G = ECHO.Gear;
      const w = world.items[pl.weapon], b = world.items[pl.bow], a = pl.armor && world.items[pl.armor];
      return { blade: w ? G.look(w) : null, bow: b ? G.look(b) : null, armor: a ? G.look(a) : null, rank: Pw().rank(Pw().level(pl)), lv: Pw().level(pl), key: [w && w.id, w && w.plus, w && w.rarity, w && w.starforged, b && b.id, b && b.plus, a && a.id, a && a.plus, Pw().level(pl)].join('|') };
    },
    // The foe you are looking at: locked, under the mouse, or the nearest that means you harm.
    pickTarget(game) {
      const pe = game.pe, lock = ECHO.PlayerCtl.lock;
      if (lock && !lock.dead) return lock;
      let best = null, bd = 9;
      for (const e of game.ents) {
        if (e === pe || e.dead || e.hidden || e.marvel || e.type === 'ghost' || NOXP.has(e.species)) continue;
        if (!game.hostileTo(pe, e) && !e.foe && !e.lvl && e.type !== 'boss') continue;
        const d = U.dist(e.x, e.y, pe.x, pe.y);
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    },
    // Dungeon lords get the great bar across the top of the screen.
    lordBar(game) {
      const UI = ECHO.UI;
      if (UI.bossEnt && !UI.bossEnt.dead && UI.bossEnt.type === 'boss') return;
      const lord = game.ents.find(e => e.boss2 && !e.dead && !e.summoner && U.dist(e.x, e.y, game.pe.x, game.pe.y) < 11);
      if (lord && UI.bossEnt !== lord) UI.bossBar(lord);
      else if (!lord && UI.bossEnt && UI.bossEnt.boss2) UI.bossBar(null);
    },

    // ------------------------------------------------------------ the HUD
    hud(game) {
      const pl = game.pl, s = Pw().st(pl), L = s.lv, R = Pw().rank(L);
      const need = Pw().need(L), frac = L >= Pw().MAX ? 1 : s.xp / need;
      const key = `${L}|${Math.round(frac * 100)}`;
      if (Pg._hud === key) return;
      Pg._hud = key;
      const el = document.getElementById('hud-rank');
      if (!el) return;
      el.innerHTML = `<span class="rk" style="color:${R.color}">Lv ${L} · ${R.title}</span><span class="xp"><i style="width:${Math.round(frac * 100)}%"></i></span><span class="xpn">${L >= Pw().MAX ? 'max' : `${Math.floor(s.xp)}/${need} xp`}</span>`;
    },
    targetHud(game) {
      const el = document.getElementById('hud-target');
      if (!el) return;
      const e = Pg.target, pl = game.pl;
      if (!e || e.dead || ECHO.UI.paused() || (ECHO.UI.bossEnt === e)) { if (Pg._tgt !== '') { Pg._tgt = ''; el.classList.add('hidden'); } return; }
      const L = Pw().foeLevel(e), me = Pw().level(pl), D = Pw().diff(L, me), rk = Pw().foeRank(e), RK = Pw().FOE_RANK[rk];
      const name = Pg.nameOf(game, e);
      const def = e.species && ECHO.Monsters && ECHO.Monsters.DEFS[e.species];
      const known = def && pl.bestiary && pl.bestiary[e.species];
      const gap = L - me;
      const key = [e.id, Math.round(e.hp / e.maxHp * 50), me].join('|');
      if (Pg._tgt === key) return;
      Pg._tgt = key;
      el.classList.remove('hidden');
      el.innerHTML = `<div class="tn"><b>${esc(name)}</b></div>
        <div class="tl"><span style="color:${D.color}">Lv ${L}</span> · <span style="color:${RK.color}">${RK.name}</span> · <span style="color:${D.color}">${'☠'.repeat(D.skulls)}${D.skulls ? ' ' : ''}${D.word}</span></div>
        <div class="tb"><i style="width:${Math.max(0, Math.round(e.hp / e.maxHp * 100))}%;background:${D.color}"></i></div>
        <div class="td">${gap > 0 ? `${gap} level${gap > 1 ? 's' : ''} above you` : gap < 0 ? `${-gap} level${gap < -1 ? 's' : ''} below you` : 'your equal'} · worth ~${Pw().xpFor(pl, e)} xp</div>
        ${known ? `<div class="tw">Weak: ${esc(def.weak)}</div>` : def ? '<div class="tw dim">Kill one to learn its weakness (J → bestiary)</div>' : ''}`;
    },
    nameOf(game, e) {
      if (e.type === 'boss' && e.boss) return `${e.boss.name} ${e.boss.title || ''}`.trim();
      if (e.label) return U.cap(e.label);
      if (e.foe) return e.foe.name;
      if (e.type === 'person') { const n = game.world.npcs[e.npcId]; return n ? ECHO.People.name(n) : 'Someone'; }
      if (e.type === 'creature') return ECHO.Ecology.speciesName(game.world, game.world.regions[e.regionId], e.species);
      return 'Foe';
    },
    // Dungeon entrances you know announce themselves from a distance.
    siteLabels(game) {
      const out = [], pl = game.pl, pe = game.pe;
      if (!pl || !pe || ECHO.Interior.cur) return out;
      for (const s of ECHO.Explore.sites(game.world)) {
        if (s.cat !== 'delve' || !s.found) continue;
        const d = U.dist(s.x, s.y, pe.x, pe.y);
        if (d > 32 || d < 2.5) continue;
        const L = ECHO.Explore.level(game.world, s), D = Pw().diff(L, Pw().level(pl));
        out.push({ x: s.x, y: s.y, text: `▼ ${s.name} ${s.cleared ? '✓' : ECHO.Explore.stars(s)}`, color: s.cleared ? '#9a9080' : D.color, a: U.clamp(1.3 - d / 32, 0.35, 1) });
      }
      return out;
    },
    // A label for the world: "Cave spider · Lv 3", coloured by how it measures against you.
    label(game, e) {
      const L = Pw().foeLevel(e), D = Pw().diff(L, Pw().level(game.pl)), rk = Pw().foeRank(e);
      const tag = rk === 'elite' ? '◆ ' : rk === 'champion' ? '◆◆ ' : rk === 'lord' ? '♛ ' : rk === 'great' ? '♛ ' : '';
      return { text: `${tag}${Pg.nameOf(game, e)} · Lv ${L}${D.skulls ? ' ' + '☠'.repeat(D.skulls) : ''}`, color: D.color };
    }
  };
})();
