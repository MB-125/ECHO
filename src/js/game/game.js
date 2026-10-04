// The game: real-time layer over the living simulation.
(function () {
  const { U } = ECHO;
  const T = ECHO.TIME;
  const In = ECHO.Input;

  const Game = ECHO.Game = {
    world: null, pl: null, pe: null, ents: [], time: 0, running: false, loot: [],
    cam: { x: 0, y: 0 }, zoom: 3, shakeT: 0, shakeA: 0, lights: [], currentSid: null, currentRegion: null,
    saveTimer: 0, exploreTimer: 0, lastFrame: 0, ff: null,
    // Combat feel: hit-stop freezes the action for a few frames, slow-mo
    // stretches big moments, kick/punch nudge the camera, hurt flashes red.
    freezeT: 0, slowT: 0, slowScale: 1, camKick: { x: 0, y: 0 }, camPunch: 0, hurtFlashT: 0,

    // ------------------------------------------------------------ Lifecycle
    start(world) {
      Game.world = world;
      Game.pl = world.player;
      Game.ui = ECHO.UI;
      Game.ents = []; Game.loot = [];
      ECHO.Interior.cur = null;
      if (Game.pl.x >= 9000 || !isFinite(Game.pl.x)) { const h = ECHO.Sim.settlement(world, Game.pl.homeId) || world.settlements[0]; Game.pl.x = h.x + 0.5; Game.pl.y = h.y + 2.5; }
      ECHO.Combat.reset(); ECHO.Spawner.reset(); ECHO.PlayerCtl.reset();
      Game.pe = ECHO.Ent.make({ type: 'player', x: Game.pl.x, y: Game.pl.y, r: 0.33, hp: Game.pl.hp, maxHp: Game.pl.maxHp, faction: 'player', speed: 4.3, look: Game.playerLook() });
      Game.ents.push(Game.pe);
      Game.pl.explored = Game.pl.explored || new Array(Math.ceil(world.W / 4) * Math.ceil(world.H / 4)).fill(0);
      Game.pl.wanted = Game.pl.wanted || {};
      Game.currentSid = null; Game.currentRegion = null;
      Game.cam.x = Game.pe.x; Game.cam.y = Game.pe.y;
      ECHO.Renderer.setWorld(world);
      ECHO.UI.enterGame();
      if (!Game.running) { Game.running = true; Game.lastFrame = performance.now(); requestAnimationFrame(Game.loop); }
      Game.explore(true);
      Game.checkPlace(true);
    },
    stop() { Game.running = false; },
    playerLook() {
      const h = ECHO.hashStr(Game.pl.charId);
      const skins = ['#f1c9a5', '#e0ac85', '#c68a62', '#a8694a', '#7d4b33'];
      const hairs = ['#2b1d14', '#4a3020', '#7a4b26', '#b07a3c', '#d9b26a', '#8c2f1c'];
      return { skin: skins[h % skins.length], hair: hairs[(h >> 3) % hairs.length], hairStyle: (h >> 6) % 4, beard: false, female: !!Game.pl.female, player: true };
    },

    loop(ts) {
      if (!Game.running) return;
      const dt = Math.min(0.05, (ts - Game.lastFrame) / 1000);
      Game.lastFrame = ts;
      try {
        let simDt = dt;
        if (Game.ff) Game.stepFastForward();
        else if (Game.world && Game.pl && !ECHO.UI.paused()) {
          if (Game.freezeT > 0) {
            // Hold combat presses made during hit-stop for the first frame after it.
            Game.freezeT -= dt; simDt = 0;
            const pm = Game.pendM = Game.pendM || [false, false, false];
            for (let i = 0; i < 3; i++) pm[i] = pm[i] || In.mpressed[i];
            for (const k of [' ', 'q', 'Shift']) if (In.pressed.has(k)) (Game.pendK = Game.pendK || new Set()).add(k);
          } else {
            if (Game.pendM) { for (let i = 0; i < 3; i++) In.mpressed[i] = In.mpressed[i] || Game.pendM[i]; Game.pendM = null; }
            if (Game.pendK) { for (const k of Game.pendK) In.pressed.add(k); Game.pendK = null; }
            if (Game.slowT > 0) { Game.slowT -= dt; simDt = dt * Game.slowScale; }
            Game.update(simDt);
          }
          Game.feel(dt);
        }
        if (Game.world) ECHO.Renderer.draw(Game, simDt);
        ECHO.UI.frame(Game, dt);
      } catch (err) { console.error(err); ECHO.UI.error && ECHO.UI.error(err); }
      In.endFrame();
      requestAnimationFrame(Game.loop);
    },

    update(dt) {
      const world = Game.world;
      Game.time += dt;
      world.playSeconds = (world.playSeconds || 0) + dt;
      Game.lights = [];
      // World time
      const before = world.day;
      ECHO.Sim.advance(world, dt * T.MIN_PER_SEC);
      if (world.day !== before) Game.onNewDay();
      Game.pl.lanternOn = Game.isNight();
      // Player
      ECHO.PlayerCtl.update(Game, dt);
      if (ECHO.Interior.cur) { Game.pl.x = ECHO.Interior.cur.outside.x; Game.pl.y = ECHO.Interior.cur.outside.y; }
      else { Game.pl.x = Game.pe.x; Game.pl.y = Game.pe.y; }
      // Others
      for (const e of Game.ents) {
        if (e === Game.pe || e.dead) continue;
        if (e.type === 'creature') ECHO.AI.Creature.update(Game, e, dt);
        else if (e.type === 'person') ECHO.AI.Person.update(Game, e, dt);
        else if (e.type === 'boss') ECHO.Boss.update(Game, e, dt);
        e.hurtT = Math.max(0, e.hurtT - dt);
        e.anim += dt * (e.moving ? 1 : 0.3);
        if (e.attackT) e.attackT = Math.max(0, e.attackT - dt);
      }
      Game.pe.anim += dt * (Game.pe.moving ? 1 : 0.3);
      if (Game.pe.attackT) Game.pe.attackT = Math.max(0, Game.pe.attackT - dt);
      ECHO.Ent.separate(Game.ents, dt);
      for (const e of Game.ents) if (!e.dead || (e.deathT || 0) < 0.5) ECHO.Ent.applyPush(world, e);
      ECHO.Combat.updateProjectiles(dt);
      ECHO.Combat.updateBurning(dt);
      // Corpses fade
      for (const e of Game.ents) if (e.dead && !e.vanish) { e.deathT = (e.deathT || 0) + dt; if (e.deathT > 3) e.vanish = true; }
      Game.ents = Game.ents.filter(e => !e.vanish);
      ECHO.Spawner.update(Game, dt);
      Game.pickupLoot();
      Game.exploreTimer -= dt;
      if (Game.exploreTimer <= 0 && !ECHO.Interior.cur) { Game.exploreTimer = 1; Game.explore(); Game.checkPlace(); }
      Game.saveTimer += dt;
      if (Game.saveTimer > 180) { Game.saveTimer = 0; Game.save(); }
      // Camera
      const k = Math.min(1, dt * 8);
      Game.cam.x = U.lerp(Game.cam.x, Game.pe.x, k);
      Game.cam.y = U.lerp(Game.cam.y, Game.pe.y - 0.3, k);
      if (Game.shakeT > 0) Game.shakeT -= dt;
      // Player lantern & world lights
      if (Game.isNight() && !Game.pl.capture) Game.light(Game.pe.x, Game.pe.y - 0.3, 5.5, 0.9, '#ffd59a');
      // Short-lived flashes (explosions) persist a few frames
      Game.flashLights = (Game.flashLights || []).filter(l => (l.ttl -= dt) > 0);
      Game._updLights = Game.lights.concat(Game.flashLights);
    },

    onNewDay() {
      const world = Game.world, pl = Game.pl;
      for (const f in pl.wanted) { pl.wanted[f] = Math.max(0, pl.wanted[f] - 12); if (!pl.wanted[f]) delete pl.wanted[f]; }
      ECHO.UI.onNewDay(world);
      Game.save();
    },

    save() { if (Game.world) return ECHO.Save.save(Game.world); },

    // ------------------------------------------------------------ Fast forward
    // The world keeps living while the player rests, waits or is imprisoned.
    fastForward(days, title, onDone) {
      Game.ff = { days, done: 0, title, onDone, startChron: Game.world.chronicle.length, startDay: Game.world.day };
      ECHO.UI.showFastForward(Game.ff);
    },
    stepFastForward() {
      const ff = Game.ff;
      const n = Math.min(2, ff.days - ff.done);
      for (let i = 0; i < n; i++) ECHO.Sim.dailyTick(Game.world, true);
      ff.done += n;
      ECHO.UI.showFastForward(ff);
      if (ff.done >= ff.days) {
        Game.ff = null;
        Game.ents = Game.ents.filter(e => e === Game.pe || e.isCompanion);
        ECHO.Combat.reset();
        const events = Game.world.chronicle.slice(ff.startChron).filter(e => e.id > 0);
        ECHO.UI.hideFastForward();
        if (ff.onDone) ff.onDone(events);
        Game.save();
      }
    },

    // ------------------------------------------------------------ Helpers
    // Where something happening at (x,y) is, in the world (rooms map to their door).
    wp(x, y) { return x >= 9000 && ECHO.Interior.cur ? ECHO.Interior.cur.outside : { x, y }; },
    addEnt(e) {
      // Never place a body inside a wall, tree or river.
      const w = Game.world, r = e.r * 0.85;
      const solid = (x, y) => ECHO.World.isSolid(w, x - r, y - r) || ECHO.World.isSolid(w, x + r, y - r) || ECHO.World.isSolid(w, x - r, y + r) || ECHO.World.isSolid(w, x + r, y + r);
      if (solid(e.x, e.y)) {
        outer: for (let rad = 0.5; rad < 8; rad += 0.5) for (let a = 0; a < Math.PI * 2; a += 0.4) {
          const x = e.x + Math.cos(a) * rad, y = e.y + Math.sin(a) * rad;
          if (!solid(x, y)) { e.x = x; e.y = y; break outer; }
        }
      }
      Game.ents.push(e);
      return e;
    },
    isNight() { return T.isNight(Game.world.minute); },
    light(x, y, r, a, color, ttl) {
      const L = { x, y, r, a, color };
      if (ttl) { L.ttl = ttl; (Game.flashLights = Game.flashLights || []).push(L); }
      else Game.lights.push(L);
    },
    hitStop(t) { Game.freezeT = Math.min(0.2, Math.max(Game.freezeT, t)); },
    slowMo(t, scale) { Game.slowT = t; Game.slowScale = scale; },
    kick(angle, amt) { Game.camKick.x += Math.cos(angle) * amt; Game.camKick.y += Math.sin(angle) * amt; },
    punch(amt) { Game.camPunch = Math.min(1.2, Game.camPunch + amt); },
    hurtFlash(a) { Game.hurtFlashT = Math.max(Game.hurtFlashT, a); },
    // Camera springs back; runs every frame even during hit-stop.
    feel(dt) {
      const k = Math.exp(-dt * 14);
      Game.camKick.x *= k; Game.camKick.y *= k;
      Game.camPunch *= Math.exp(-dt * 9);
      Game.hurtFlashT = Math.max(0, Game.hurtFlashT - dt * 1.8);
    },
    shake(a) { Game.shakeT = 0.25; Game.shakeA = Math.max(Game.shakeA * (Game.shakeT > 0 ? 1 : 0), a); },
    noise(x, y, r) {
      for (const e of Game.ents) {
        if (e.type !== 'person' || e.dead || !e.sleeping) continue;
        if (U.dist(x, y, e.x, e.y) < r * (1 - Game.pl.skills.shadow / 200)) { e.sleeping = false; e.aggro = true; e.target = Game.pe; }
      }
    },
    screenToWorld(sx, sy) { return ECHO.Renderer.screenToWorld(Game, sx, sy); },
    onScreen(x, y, pad = 0) { return ECHO.Renderer.onScreen(Game, x, y, pad); },
    freeSpotNear(world, x, y) {
      for (let r = 0; r < 8; r += 0.5) for (let a = 0; a < Math.PI * 2; a += 0.6) {
        const xx = x + Math.cos(a) * r, yy = y + Math.sin(a) * r;
        if (!ECHO.World.isSolid(world, xx, yy) && !ECHO.World.isSolid(world, xx + 0.3, yy + 0.3) && !ECHO.World.isSolid(world, xx - 0.3, yy - 0.3)) return { x: xx, y: yy };
      }
      return { x, y };
    },

    // Who fights whom.
    hostileTo(a, b) {
      if (!a || !b || a === b || a.dead || b.dead) return false;
      const pl = Game.pl;
      const side = e => (e.type === 'player' || e.isCompanion) ? 'player' : e.type === 'boss' ? 'beast' : e.type === 'creature' ? (e.species === 'hare' ? 'prey' : 'beast') : 'person';
      const sa = side(a), sb = side(b);
      if (sa === 'prey' || sb === 'prey') return sa === 'player' || sb === 'player' ? false : (sa === 'beast' || sb === 'beast') && false;
      if (sa === 'player' && sb === 'player') return false;
      if (sa === 'beast' && sb === 'beast') return false;
      if ((sa === 'beast') !== (sb === 'beast')) return true; // beasts vs everyone else
      if (a.yielded || b.yielded || a.role === 'captive' || b.role === 'captive') return false;
      if (sa === 'player' || sb === 'player') {
        const p = sa === 'player' ? b : a;
        if (p.role === 'bandit') return true;
        if (p.aggro) return true;
        if ((p.role === 'guard' || p.role === 'soldier') && (pl.wanted[p.faction] || 0) > 20) return true;
        return false;
      }
      // person vs person
      const fa = a.faction, fb = b.faction;
      if ((fa === 'ashfang') !== (fb === 'ashfang')) {
        const other = fa === 'ashfang' ? b : a;
        return other.role === 'guard' || other.role === 'soldier' || other.role === 'villager' || other.role === 'traveler';
      }
      const FA = Game.world.factions[fa], FB = Game.world.factions[fb];
      if (FA && FB && FA.atWar[fb] && (a.role === 'soldier' || a.role === 'guard') && (b.role === 'soldier' || b.role === 'guard')) return true;
      return false;
    },
    canPlayerHit(e) {
      if (e.isCompanion) return false;
      if (e.type === 'creature' || e.type === 'boss') return true;
      if (Game.hostileTo(Game.pe, e)) return true;
      if (e.yielded) return true;
      return ECHO.PlayerCtl.sneaking; // deliberate: attacking the innocent requires intent
    },

    // ------------------------------------------------------------ Crime & reputation
    witnessed(x, y, exclude) {
      return Game.ents.some(o => o.type === 'person' && !o.dead && !o.hidden && !o.sleeping && o !== exclude && o.role !== 'bandit' && o.role !== 'captive' && !o.isCompanion && U.dist(o.x, o.y, x, y) < (Game.isNight() ? 7 : 12) && ECHO.Ent.lineOfSight(Game.world, o.x, o.y, x, y));
    },
    crime(target, kind) {
      const world = Game.world, pl = Game.pl;
      const npc = world.npcs[target.npcId];
      if (!npc || npc.faction === 'ashfang') return;
      target.aggro = true;
      const seen = Game.witnessed(Game.pe.x, Game.pe.y, target) || kind !== 'murder';
      if (!seen) return;
      const f = npc.faction;
      const before = pl.wanted[f] || 0;
      pl.wanted[f] = Math.min(200, before + (kind === 'murder' ? 90 : 35));
      for (const o of Game.ents) if (o.type === 'person' && o.faction === f && (o.role === 'guard' || o.role === 'soldier') && U.dist(o.x, o.y, Game.pe.x, Game.pe.y) < 16) { o.target = Game.pe; o.say = 'Stop, criminal!'; o.sayT = 2; }
      ECHO.Character.behave(pl, 'betrayal', kind === 'murder' ? 1 : 0.4);
      if (kind === 'murder') ECHO.Character.behave(pl, 'cruelty', 0.8);
      npc.op[pl.charId] = (npc.op[pl.charId] || 0) - 50;
      ECHO.People.remember(world, npc, `was attacked by ${pl.first} ${pl.last}`, 'trauma', null, 4);
      const now = Game.time;
      if (!target.crimeLogged || now - target.crimeLogged > 30) {
        target.crimeLogged = now;
        const wpos = Game.wp(target.x, target.y);
        const s = ECHO.World.nearestSettlement(world, wpos.x, wpos.y);
        ECHO.Chronicle.deed(world, {
          text: kind === 'murder' ? `${pl.first} ${pl.last} murdered ${ECHO.People.name(npc)}${s ? ' near ' + s.name : ''}.` : `${pl.first} ${pl.last} attacked ${ECHO.People.name(npc)}${s ? ' in ' + s.name : ''}.`,
          importance: kind === 'murder' ? 2 : 1, x: wpos.x, y: wpos.y, rep: kind === 'murder' ? -18 : -6, factionRep: { [f]: kind === 'murder' ? -25 : -8 }, tag: 'betray'
        });
      }
    },
    killerNameFor(target, from) {
      if (from !== Game.pe) return from && from.npcId ? ECHO.People.name(Game.world.npcs[from.npcId]) : null;
      const npc = Game.world.npcs[target.npcId];
      if (npc && npc.faction === 'ashfang') return Game.pl.first + ' ' + Game.pl.last;
      return Game.witnessed(Game.pe.x, Game.pe.y, target) ? Game.pl.first + ' ' + Game.pl.last : null;
    },
    personKilledByPlayer(ent, npc, type, ctx) {
      const world = Game.world, pl = Game.pl;
      if (npc.faction === 'ashfang' || ent.role === 'bandit') {
        ECHO.Intel.recordKill(world, 'ashfang', { method: type, night: ctx.night, leader: ctx.wasLeader, stealth: ctx.stealth });
        pl.kills['Ashfang outlaws'] = (pl.kills['Ashfang outlaws'] || 0) + 1;
        pl.renown += ctx.wasLeader ? 12 : 2;
        if (ctx.night) ECHO.Character.behave(pl, 'night', 0.06);
        if (ent.yielded) {
          ECHO.Character.behave(pl, 'cruelty', 0.8);
          ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} cut down ${ECHO.People.name(npc)} of the Ashfang after ${npc.sex === 'f' ? 'she' : 'he'} had yielded.`, importance: 1, x: ent.x, y: ent.y, rep: -3, tag: 'cruel' });
        } else if (ctx.wasLeader) {
          ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} killed ${ECHO.People.name(npc)}, chieftain of the Ashfang at ${ctx.camp ? ctx.camp.name : 'their camp'}.`, importance: 2, x: ent.x, y: ent.y, rep: 8, tag: 'protect' });
          for (const p of ECHO.Plights.open(world)) if (p.kind === 'bounty' && p.campId === (ctx.camp && ctx.camp.id)) { p.claimable = true; p.claimableDay = world.day; }
          ECHO.Character.behave(pl, 'protect', 0.4);
        }
        return;
      }
      // Killing ordinary people
      ECHO.Intel.recordKill(world, npc.faction, { method: type, night: ctx.night, leader: !!npc.title || npc.rank >= 2, stealth: ctx.stealth });
      pl.kills['innocents'] = (pl.kills['innocents'] || 0) + 1;
      Game.crime(ent, 'murder');
      if (ent.role === 'traveler' && ent.gear.cart) {
        const j = (world.journeys || []).find(x => x.id === ent.journeyId);
        if (j && j.cargo) { for (const g in j.cargo) Game.loot.push({ x: ent.x + Math.random() - 0.5, y: ent.y + Math.random() - 0.5, kind: g, qty: Math.round(j.cargo[g]) }); j.cargo = null; ECHO.Character.behave(pl, 'betrayal', 0.6); }
      }
    },

    // ------------------------------------------------------------ Loot
    drop(ent) {
      const sp = ent.species;
      const r = Math.random;
      const add = (kind, qty) => Game.loot.push({ x: ent.x + (r() - 0.5) * 0.6, y: ent.y + (r() - 0.5) * 0.6, kind, qty });
      if (sp === 'hare') { if (r() < 0.75) add('meat', 1); if (r() < 0.4) add('hide', 1); }
      if (sp === 'wolf') { if (r() < 0.8) add('hide', 1); if (r() < 0.55) add('meat', 1); }
      if (sp === 'gnawer' && r() < 0.08) add('gold', 1 + Math.floor(r() * 3));
    },
    dropItem(itemId, x, y) {
      const it = Game.world.items[itemId];
      if (!it) return;
      it.holder = null; it.droppedAt = { x, y };
      Game.loot.push({ x, y, kind: 'item', itemId, qty: 1 });
    },
    pickupLoot() {
      const pe = Game.pe, pl = Game.pl;
      for (const l of Game.loot) {
        if (l.taken) continue;
        if (U.dist(l.x, l.y, pe.x, pe.y) > 0.8) continue;
        if (l.kind === 'item') continue; // items need E
        l.taken = true;
        if (l.kind === 'gold') pl.gold += l.qty;
        else pl.inv[l.kind] = (pl.inv[l.kind] || 0) + l.qty;
        ECHO.Combat.floater(l.x, l.y - 0.5, `+${l.qty} ${l.kind}`, '#e8d9a0');
      }
      Game.loot = Game.loot.filter(l => !l.taken);
    },
    takeItem(itemId) {
      const world = Game.world, pl = Game.pl;
      const it = world.items[itemId];
      if (!it) return;
      const prevHolder = it.holder;
      it.holder = 'player'; it.droppedAt = null;
      if (!pl.items.includes(it.id)) pl.items.push(it.id);
      const legend = it.legend ? ECHO.Legacy.legendOf(world, it.legend) : null;
      it.history.push({ d: world.day, t: `taken up by ${pl.first} ${pl.last}` });
      if (it.kind === 'sword' && (!world.items[pl.weapon] || it.dmg >= (world.items[pl.weapon].dmg || 0) || it.legend)) pl.weapon = it.id;
      Game.loot = Game.loot.filter(l => l.itemId !== itemId);
      for (const r of world.ruins) r.relics = r.relics.filter(x => x !== itemId);
      ECHO.PlayerCtl.derivedT = 0;
      if (legend) {
        const msg = legend.charId === pl.legacyOf || world.legends.some(l => l.charId === legend.charId)
          ? `${it.name}. The blade of ${legend.name}, ${legend.epithet}, who died ${T.fmtShort(legend.died)} — ${legend.cause}. You know this sword.`
          : `${it.name}.`;
        ECHO.UI.toast(msg, 'legend', 10);
        ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} recovered ${it.name}, the sword of ${legend.name}.`, importance: 2, x: Game.pe.x, y: Game.pe.y, rep: 3 });
      } else ECHO.UI.toast(`You take ${it.name}.`, 'info', 3);
      void prevHolder;
    },

    // ------------------------------------------------------------ Places & exploration
    explore(force) {
      const pl = Game.pl, world = Game.world;
      const cw = Math.ceil(world.W / 4);
      const R = 11;
      for (let dy = -R; dy <= R; dy += 2) for (let dx = -R; dx <= R; dx += 2) {
        if (dx * dx + dy * dy > R * R) continue;
        const x = Math.floor((Game.pe.x + dx) / 4), y = Math.floor((Game.pe.y + dy) / 4);
        if (x < 0 || y < 0 || x >= cw) continue;
        const i = y * cw + x;
        if (i < pl.explored.length && !pl.explored[i]) { pl.explored[i] = 1; ECHO.UI.mapDirty = true; }
      }
      void force;
    },
    explored(x, y) {
      const cw = Math.ceil(Game.world.W / 4);
      return !!Game.pl.explored[Math.floor(y / 4) * cw + Math.floor(x / 4)];
    },
    checkPlace(force) {
      const world = Game.world, pe = Game.pe;
      const s = ECHO.World.settlementAt(world, pe.x, pe.y, 14);
      const sid = s ? s.id : null;
      if (sid !== Game.currentSid || force) {
        Game.currentSid = sid;
        if (s) {
          const f = world.factions[s.faction];
          ECHO.UI.banner(s.name, `${s.kind === 'capital' ? 'Capital of ' + f.short : s.kind === 'temple' ? 'Temple town of ' + f.short : 'Village of ' + f.short}`);
          const fresh = ECHO.Chronicle.learnAt(world, s);
          if (fresh.length) ECHO.UI.toast(`You catch up on the news in ${s.name} (${fresh.length} new). Press Tab to read the journal.`, 'rumor', 5);
          s.visited = true;
        }
      }
      const region = ECHO.World.regionAt(world, pe.x, pe.y);
      if (region !== Game.currentRegion) {
        Game.currentRegion = region;
        if (!s && !force) ECHO.UI.banner(U.cap(region.name), '', true);
      }
      for (const r of world.ruins) if (!r.visited && U.dist(r.x, r.y, pe.x, pe.y) < 7) { r.visited = true; ECHO.UI.banner(U.cap(r.name), 'Ancient ruin'); }
      for (const c of world.camps) if (c.alive && !c.seen && U.dist(c.x, c.y, pe.x, pe.y) < 14) { c.seen = true; ECHO.UI.toast(`You spot the fires of an Ashfang camp: ${c.name}.`, 'warn', 4); }
      for (const l of world.lairs) if (!l.seen && U.dist(l.x, l.y, pe.x, pe.y) < 14) { l.seen = true; }
    },

    // ------------------------------------------------------------ Interaction
    interactables() {
      const world = Game.world, pe = Game.pe;
      const out = [];
      const near = (x, y, r = 1.7) => U.dist(x, y, pe.x, pe.y) < r;
      for (const e of Game.ents) {
        if (e.dead || e.hidden || e.type !== 'person') continue;
        if (!near(e.x, e.y, 1.8)) continue;
        if (e.yielded) out.push({ kind: 'spare', ent: e, label: `Spare ${ECHO.People.name(world.npcs[e.npcId])}`, d: U.dist(e.x, e.y, pe.x, pe.y) });
        else if (e.role === 'captive') out.push({ kind: 'free', ent: e, label: `Free ${ECHO.People.name(world.npcs[e.npcId])}`, d: U.dist(e.x, e.y, pe.x, pe.y) });
        else if (!Game.hostileTo(pe, e) && !e.sleeping) out.push({ kind: 'talk', ent: e, label: `Talk to ${ECHO.People.name(world.npcs[e.npcId])}`, d: U.dist(e.x, e.y, pe.x, pe.y) });
      }
      if (ECHO.Interior.cur) {
        out.push(...ECHO.Interior.interactables(Game));
        for (const l of Game.loot) if (l.kind === 'item' && near(l.x, l.y, 1.3)) out.push({ kind: 'item', loot: l, label: `Take ${world.items[l.itemId] ? world.items[l.itemId].name : 'item'}`, d: U.dist(l.x, l.y, pe.x, pe.y) });
        out.sort((a, b) => a.d - b.d);
        return out;
      }
      // every town close enough (outlying houses can sit nearer another town's centre)
      for (const s of world.settlements) if (Math.abs(s.x - pe.x) < 30 && Math.abs(s.y - pe.y) < 30) for (const b of s.buildings) {
        if (Math.abs(b.x - pe.x) > 8 || Math.abs(b.y - pe.y) > 8) continue;
        const door = { x: b.x + b.w / 2, y: b.y + b.h + 0.3 };
        const labels = { inn: 'Enter the inn — beds, meals', market: 'Visit the market — arrows, food, herbs', smithy: 'Enter the smithy — weapons, arrows', archive: 'Enter the archive', shrine: 'Enter the shrine', temple: 'Enter the temple', keep: 'Enter the keep', board: 'Read the notice board', statue: 'Read the plaque', well: null, lamp: null };
        // Doors are forgiving: stand against any wall of a building (or near its
        // door) and you can go in — no need to walk round to the front.
        if (b.type === 'house' || ECHO.Interior.enterable(b)) {
          const ex = Math.max(b.x - pe.x, 0, pe.x - (b.x + b.w)), ey = Math.max(b.y - pe.y, 0, pe.y - (b.y + b.h));
          const edge = Math.hypot(ex, ey), dd = U.dist(door.x, door.y, pe.x, pe.y);
          if (edge < 1.15 || dd < 2.2) {
            const label = b.type === 'house' ? (b.legend ? `Enter the house of ${(ECHO.Legacy.legendOf(world, b.legend) || {}).name || 'a legend'}` : b.owner === Game.pl.charId ? 'Enter your house' : 'Enter the house') : labels[b.type];
            out.push({ kind: 'enter', b, s, label, d: Math.min(edge, dd) * 0.55 + 0.05 });
          }
          continue;
        }
        const lab = labels[b.type];
        if (!lab) continue;
        const pt = b.type === 'board' || b.type === 'statue' ? { x: b.x + 0.5, y: b.y + 1.2 } : door;
        const ex = Math.max(b.x - pe.x, 0, pe.x - (b.x + b.w)), ey = Math.max(b.y - pe.y, 0, pe.y - (b.y + b.h));
        const edge = Math.hypot(ex, ey), dd = U.dist(pt.x, pt.y, pe.x, pe.y);
        if (dd < 1.9 || edge < 1.0) out.push({ kind: 'building', b, s, label: lab, d: Math.min(edge, dd) * 0.6 + 0.05 });
      }
      for (const l of Game.loot) if (l.kind === 'item' && near(l.x, l.y, 1.3)) out.push({ kind: 'item', loot: l, label: `Take ${world.items[l.itemId] ? world.items[l.itemId].name : 'item'}`, d: U.dist(l.x, l.y, pe.x, pe.y) });
      for (const it of Object.values(world.items)) if (!it.holder && it.droppedAt && near(it.droppedAt.x, it.droppedAt.y, 1.3) && !Game.loot.some(l => l.itemId === it.id)) Game.loot.push({ x: it.droppedAt.x, y: it.droppedAt.y, kind: 'item', itemId: it.id, qty: 1 });
      for (const r of world.ruins) {
        if (near(r.x, r.y - 1.5, 1.9)) out.push({ kind: 'tablet', ruin: r, label: 'Study the inscription', d: U.dist(r.x, r.y - 1.5, pe.x, pe.y) });
        if (r.relics.length && near(r.x + 3, r.y + 1, 1.8)) out.push({ kind: 'relic', ruin: r, label: 'Search the rubble', d: U.dist(r.x + 3, r.y + 1, pe.x, pe.y) });
      }
      const v = world.lang && world.lang.vault;
      if (v && !v.opened && near(v.x + 0.5, v.y + 1.2, 1.8)) out.push({ kind: 'vault', label: 'Examine the carved stone', d: 0.5 });
      if (world.rift && near(world.rift.x + 0.5, world.rift.y + 0.5, 2.4)) out.push({ kind: 'rift', label: 'Look into the Rift', d: 0.5 });
      for (const c of world.camps) if (c.captives.length && near(c.x + 2.5, c.y - 1.2, 1.6)) { /* captives handled as entities */ }
      out.sort((a, b) => a.d - b.d);
      return out;
    },
    interact(it) {
      const world = Game.world, pl = Game.pl;
      switch (it.kind) {
        case 'talk': return ECHO.UI.openDialogue(it.ent);
        case 'spare': return Game.spare(it.ent);
        case 'free': return Game.freeCaptive(it.ent);
        case 'building': return ECHO.UI.openBuilding(it.b, it.s);
        case 'enter': return ECHO.Interior.enter(Game, it.b, it.s);
        case 'leave': return ECHO.Interior.leave(Game);
        case 'furn': return ECHO.Interior.use(Game, it.furn);
        case 'house': return ECHO.UI.openHouse(it.b, it.s);
        case 'item': return Game.takeItem(it.loot.itemId);
        case 'tablet': return ECHO.UI.openTablet(it.ruin);
        case 'relic': {
          const id = it.ruin.relics[0];
          if (id) Game.takeItem(id);
          return;
        }
        case 'vault': return ECHO.UI.openVault();
        case 'rift': return ECHO.UI.openRift();
      }
      void pl; void world;
    },
    spare(ent) {
      const world = Game.world, pl = Game.pl;
      const npc = world.npcs[ent.npcId];
      ECHO.Character.behave(pl, 'mercy', 1);
      npc.op[pl.charId] = (npc.op[pl.charId] || 0) + 45;
      ECHO.People.remember(world, npc, `was spared by ${pl.first} ${pl.last}`, 'gratitude', null, 5);
      ent.dead = true; ent.vanish = true;
      // Spared outlaws may give up the life.
      const home = ECHO.World.nearestSettlement(world, ent.x, ent.y, s => s.faction !== 'ashfang');
      if (npc.camp && home && (ECHO.People.has(npc, 'kind') || ECHO.People.has(npc, 'pious') || Math.random() < 0.5)) {
        ECHO.Politics.leaveCamp(world, npc);
        npc.prof = 'farmer'; npc.faction = home.faction; npc.home = home.id; npc.loc = home.id;
        if (!home.residents.includes(npc.id)) home.residents.push(npc.id);
        ECHO.UI.toast(`${ECHO.People.name(npc)} drops their blade. "I'll go to ${home.name}. I won't forget this."`, 'mercy', 6);
      } else ECHO.UI.toast(`${ECHO.People.name(npc)} flees into the trees.`, 'mercy', 4);
      ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} spared the life of ${ECHO.People.name(npc)}.`, importance: 1, x: ent.x, y: ent.y, rep: 3, tag: 'protect' });
    },
    freeCaptive(ent) {
      const world = Game.world, pl = Game.pl;
      const npc = world.npcs[ent.npcId];
      if (Game.ents.some(e => e.role === 'bandit' && !e.dead && !e.sleeping && !e.yielded && U.dist(e.x, e.y, ent.x, ent.y) < 6)) { ECHO.UI.toast('Not with the guards watching.', 'warn', 2); return; }
      const p = ECHO.Plights.freeCaptive(world, npc, pl.first + ' ' + pl.last, true);
      ent.dead = true; ent.vanish = true;
      npc.op[pl.charId] = (npc.op[pl.charId] || 0) + 70;
      ECHO.Character.behave(pl, 'protect', 1.2);
      pl.renown += 6;
      ECHO.UI.toast(`${ECHO.People.name(npc)} is free. "${ECHO.Dialogue.thanks(world, npc)}"`, 'mercy', 6);
      const home = ECHO.Sim.settlement(world, npc.home);
      if (p) { p.claimable = true; p.claimableDay = world.day; p.rescuedByPlayer = true; }
      ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} freed ${ECHO.People.name(npc)} from the Ashfang${home ? ' and sent ' + (npc.sex === 'f' ? 'her' : 'him') + ' home to ' + home.name : ''}.`, importance: 2, x: ent.x, y: ent.y, rep: 7, tag: 'protect', factionRep: home ? { [home.faction]: 5 } : {} });
    },
    wardsong() {
      ECHO.Combat.ring(Game.pe.x, Game.pe.y, 3, 'rgba(160,210,255,0.9)', 0.5);
      for (const e of Game.ents) {
        if (e === Game.pe || e.dead || !Game.hostileTo(Game.pe, e)) continue;
        const d = U.dist(e.x, e.y, Game.pe.x, Game.pe.y);
        if (d > 3.2) continue;
        const a = Math.atan2(e.y - Game.pe.y, e.x - Game.pe.x);
        if (e.type !== 'boss') { e.kbx += Math.cos(a) * 0.6; e.kby += Math.sin(a) * 0.6; }
        e.stagger = 1;
      }
    },

    // ------------------------------------------------------------ Defeat
    playerDefeated(from) {
      if (Game.pl.capture || Game.defeating) return;
      Game.defeating = true;
      Game.pe.dead = false;
      Game.pl.hp = 1; Game.pe.hp = 1;
      ECHO.UI.bossBar(null);
      ECHO.Capture.begin(Game, from);
    }
  };
})();
