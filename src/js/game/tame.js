// Taming: any beast, monster or lord of the deep places can be made yours.
//
// Knock it down, it kneels, press E: it is yours. Whatever you strike down
// kneels instead of dying (a beast or monster for 12 seconds before it dies,
// a lord until it gets up again), and anything beaten below a third of its life
// (a lord, a tenth) can be taken too. Taming never fails.
//
// What you tame follows you (three at a time; the rest wait at your den until
// you call them, from the Animals page, U), fights whatever comes at you, grows
// stronger on what it kills, and if it is beaten it limps off to rest until
// the next day. Titans (dragons and the great beasts of the wild) are bound as
// before.
(function () {
  const { U } = ECHO;
  const UI = () => ECHO.UI;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const MAX_OUT = 5, MAX_KEEP = 30, MAX_SAME = 2;   // (no more than two of any one kind: a pack of many kinds)
  const NAMES = ['Ash', 'Briar', 'Cinder', 'Dusk', 'Ember', 'Fang', 'Gloom', 'Hollow', 'Ink', 'Jinx', 'Knell', 'Lurk', 'Mire', 'Nettle', 'Onyx', 'Pyre', 'Quill', 'Rook', 'Sorrow', 'Thorn', 'Umber', 'Vex', 'Wisp', 'Yew', 'Grim', 'Moth', 'Scar', 'Bramble', 'Hush', 'Soot'];
  const PEOPLE = new Set(['brigand', 'chief']);   // (outlaws are people: they can be beaten, not tamed)

  const T = ECHO.Tame = {
    MAX_OUT, MAX_KEEP, MAX_SAME, chan: null, t: 0, REACH: 18,
    // how many of this kind you keep already (lords and great beasts of a lair are each their own, never counted)
    sameCount(pl, species) { return species ? T.pack(pl).filter(r => r.cat !== 'boss' && !r.lord && r.kind === species).length : 0; },
    full(game, e) { return !!(e && !T.isBoss(e) && e.species && T.sameCount(game.pl, e.species) >= MAX_SAME); },
    reset() { T.chan = null; T.t = 0; },
    // L: the leash — while it is on, nothing you or yours strike down that can be tamed is killed; it falls beaten
    // How you fight what could be tamed (L cycles):
    //  'breath' (the default) — a killing blow leaves it on its last breath: it kneels for
    //     8 seconds, warned, for you to tame (E); strike it again, or let the time run out, and it dies;
    //  'leash' — it falls beaten and kneels for 25 seconds; nothing you do hurts it; it gets up again;
    //  'kill' — it dies as it falls.
    MODES: { breath: { name: 'last breath', col: '#ffe08a', say: 'Last breath: a beast or monster you strike down kneels for 12 seconds before it dies — time to tame it (E). Strike it again to finish it.' }, leash: { name: 'leash', col: '#ffcf6a', say: '⛓ Leash: beasts and monsters you strike down fall beaten and kneel instead of dying, however hard the blow. Nothing you do hurts them while they kneel; tame (E) or Finish (E).' }, kill: { name: 'to the kill', col: '#e0806a', say: 'To the kill: what you strike down dies at once. (L again: last breath.)' } },
    mode(pl) { return pl.tameMode || (pl.leash ? 'leash' : 'breath'); },
    toggleLeash(game) {
      const pl = game.pl, order = ['breath', 'leash', 'kill'];
      pl.tameMode = order[(order.indexOf(T.mode(pl)) + 1) % 3]; pl.leash = pl.tameMode === 'leash';
      const M = T.MODES[pl.tameMode];
      UI().toast(`${M.say} (L to change.)`, 'study', 6);
      ECHO.Combat.floater(game.pe.x, game.pe.y - 1.4, `taming: ${M.name}`, M.col, true);
    },
    // a blow on one kneeling on its last breath finishes it (not in the first moment it falls)
    breathFinish(game, e) {
      if (!e._lastBreath || game.time - (e._breathAt || 0) < 0.8 || (T.chan && T.chan.e === e)) return false;
      e.subdued = 0; e._finish = true; e._lastBreath = false;
      ECHO.Combat.kill(e, game.pe, 'melee', { angle: Math.atan2(e.y - game.pe.y, e.x - game.pe.x) });
      return true;
    },
    pack(pl) { return pl.pack || (pl.pack = []); },
    out(pl) { return T.pack(pl).filter(r => r.out); },
    // a beaten one rests three hours of the day (about 45 seconds), then answers again
    now(world) { return world.day * 1440 + world.minute; },
    resting(world, r) { if (r.restAt != null) return T.now(world) < r.restAt; return r.restUntil != null && world.day < r.restUntil; },
    restLeft(world, r) { return r.restAt != null ? Math.max(0, Math.ceil((r.restAt - T.now(world)) / (ECHO.Game.minPerSec ? ECHO.Game.minPerSec() : 4))) : null; },
    // the ones that could come now, strongest first
    ready_(game) { return T.pack(game.pl).filter(r => !r.out && !T.resting(game.world, r)).sort((a, b) => b.lvl - a.lvl || (b.kills || 0) - (a.kills || 0)); },
    indoors() { const L = ECHO.Interior.cur; return !!(L && !L.carved && L.type !== 'gate'); },
    // ---- how big a beast is, and how much room a place below has
    // small: anything up to a troll's build; large: ogres, golems, the great hounds and spiders;
    // huge: the great beasts of the lairs, the widows and wyrms of the deep woods
    SIZES: ['small', 'large', 'huge'],
    sizeOf(r) {
      const sc = r.scale || 1;
      if (r.cat === 'boss' || sc >= 2.2) return 'huge';
      if (sc >= 1.5 || r.lord) return 'large';
      return 'small';
    },
    // a cave, a hideout or a grot: only the small; a dungeon, a crypt, a mine: not the huge; a gate's world: anything
    roomOf(L) {
      if (!L) return 'huge';
      if (L.type === 'gate') return 'huge';
      if (!L.carved) return null;
      return L.site && ECHO.Explore && ECHO.Explore.small(L.site) ? 'small' : 'large';
    },
    fits(r, L = ECHO.Interior.cur) { const room = T.roomOf(L); return !!room && T.SIZES.indexOf(T.sizeOf(r)) <= T.SIZES.indexOf(room); },
    roomWord(L) { const room = T.roomOf(L); return room === 'small' ? 'this cramped place' : 'these passages'; },
    // call one to your side; if all the places are taken, the weakest of those with you goes home for it
    call(game, r, quiet) {
      const pl = game.pl, world = game.world;
      if (!r || r.out) return null;
      if (ECHO.Interior.cur && T.roomOf(ECHO.Interior.cur) && !T.fits(r)) { if (!quiet) UI().toast(`${r.name} is too big for ${T.roomWord(ECHO.Interior.cur)}. Call it when you are out under the sky (or in a bigger place).`, 'warn', 4); return null; }
      if (T.resting(world, r)) { if (!quiet) UI().toast(`${r.name} is still resting${T.restLeft(world, r) != null ? ` — back in ${T.restLeft(world, r)} s` : ''}.`, 'warn', 3); return null; }
      let swapped = null;
      const out = T.out(pl);
      if (out.length >= MAX_OUT) { swapped = out.slice().sort((a, b) => (T.fits(a) - T.fits(b)) || a.lvl - b.lvl)[0]; swapped.out = false; }
      r.out = true; T.t = 0;
      if (!quiet) UI().toast(`${r.name} comes to you${swapped ? ` — ${swapped.name} goes back to the den` : ''}.${T.indoors() ? ' (They wait for you outside.)' : ''}`, 'info', 3);
      return swapped;
    },
    // O: your strongest, rested, to your side — filling the empty places, then trading up
    rally(game) {
      const pl = game.pl, pk = T.pack(pl);
      if (!pk.length) return UI().toast('You have no tamed beasts yet. Knock any beast or monster down and press E.', 'info', 3.5);
      const came = [], L = ECHO.Interior.cur, below = !!(L && T.roomOf(L));
      // below ground, the ones that will not fit go home for ones that will
      if (below) for (const r of T.ready_(game).filter(r => T.fits(r, L))) {
        const big = T.out(pl).find(o => !T.fits(o, L));
        if (!big) break;
        big.out = false; r.out = true; came.push(r.name);
      }
      for (const r of T.ready_(game).filter(r => !below || T.fits(r, L))) {
        const out = T.out(pl);
        if (out.length < MAX_OUT) { T.call(game, r, true); came.push(r.name); continue; }
        const weak = out.slice().sort((a, b) => a.lvl - b.lvl)[0];
        if (weak && weak.lvl < r.lvl) { T.call(game, r, true); came.push(r.name); } else break;
      }
      T.t = 0;
      const n = T.out(pl).length;
      UI().toast(came.length ? `Your pack comes: ${came.join(', ')}. (${n}/${MAX_OUT} with you.)${T.indoors() ? ' They wait for you outside.' : ''}` : n ? `Your strongest are already with you (${n}/${MAX_OUT}).${T.ready_(game).length ? '' : ' The rest are resting.'}` : 'All your beasts are resting — they will answer again shortly.', 'info', 4);
    },
    sendAll(game) { for (const r of T.out(game.pl)) r.out = false; T.t = 0; UI().toast('Your beasts go back to the den.', 'info', 2.5); },

    // ------------------------------------------------------------ what can be tamed
    isBoss(e) { return !!(e.boss2 || e.type === 'boss' || e.lord || e.sovereign || (e.foe && e.foe.boss)); },
    can(game, e) {
      if (!e || e.dead || e.vanish || e.hidden || e.pal || e.tamed || e.titan || e.marvel || e.ghost || e.isCompanion || e.pet || e.mentor || e.ngWard || e.huntB) return false;
      if (e.type === 'person' || e.npcId) return false;
      if (T.full(game, e)) return false;   // two of its kind are yours already: it fights and falls like any other
      if (e.foe) return !PEOPLE.has(e.foe.look) && !(e.foe.look === 'king' && !ECHO.Monsters.DEFS[e.species]);
      if (e.type === 'boss') return !!e.boss;
      if (e.type === 'creature') return e.species === 'wolf' || !!e.beast;
      return false;
    },
    threshold(e) { return T.isBoss(e) ? 0.12 : 0.34; },
    ready(game, e) { return T.can(game, e) && (e.subdued > 0 || e.hp <= e.maxHp * T.threshold(e)) && !(e._tameCd > game.time); },
    chance(game, e) {
      const pl = game.pl, f = U.clamp(e.hp / e.maxHp / T.threshold(e), 0, 1);
      const L = ECHO.Prowess.foeLevel(e), me = ECHO.Prowess.level(pl);
      let c = 0.32 + (1 - f) * 0.5 + Math.min(0.15, (pl.tames || 0) * 0.012) - Math.max(0, L - me) * 0.0015 + (e.subdued > 0 ? 0.15 : 0) + (e._bound > game.time ? 0.15 : 0);
      if (T.isBoss(e)) c *= 0.8;
      return U.clamp(c, 0.1, 0.95);
    },

    // ------------------------------------------------------------ each frame
    update(game, dt) {
      const pe = game.pe, pl = game.pl;
      if (!pe || !pl) return;
      // a beast that falls under your hand, said once
      if ((T._noteT = (T._noteT || 0) - dt) <= 0) {
        T._noteT = 0.25;
        for (const e of game.ents) if (!e._tameTold && !e.dead && T.can(game, e) && e.hp <= e.maxHp * T.threshold(e) && U.dist(e.x, e.y, pe.x, pe.y) < 14) {
          e._tameTold = true; ECHO.Combat.floater(e.x, e.y - 1.6 * (e.scale || 1), 'can be tamed — E', '#ffe08a');
          if (!pl._tameTip) { pl._tameTip = true; UI().toast('A beaten beast can be tamed: press E — from where you stand, no need to come close — and it is yours. Taming never fails. Afraid of killing it by mistake? Press L for the leash: what you strike down falls beaten instead of dying.', 'study', 9); }
        }
      }
      if ((T._fullT = (T._fullT || 0) - dt) <= 0) {
        T._fullT = 0.5;
        for (const e of game.ents) if (!e._tameTold && !e.dead && e.hp <= e.maxHp * T.threshold(e) && T.full(game, e) && U.dist(e.x, e.y, pe.x, pe.y) < 14) {
          e._tameTold = true; ECHO.Combat.floater(e.x, e.y - 1.6 * (e.scale || 1), `you have two ${T.plural(e)}`, '#c8b88a');
          if (!pl._fullTip) { pl._fullTip = true; UI().toast(`You keep no more than ${MAX_SAME} of any one kind of beast, so this one is not for taming — it fights to the end. Release one of yours (U) if you would rather have this one.`, 'info', 6); }
        }
      }
      // the one E would tame, marked where it lies
      const it0 = game._interact;
      if (it0 && it0.tameEnt && !T.chan && (T._markT = (T._markT || 0) - dt) <= 0) { T._markT = 0.6; const m = it0.tameEnt; ECHO.Combat.ring(m.x, m.y, (m.r || 0.4) + 0.7, 'rgba(255,224,138,0.85)', 0.5); }
      // holding one while you break it
      const C = T.chan;
      if (C) {
        const e = C.e;
        C.t += dt;
        pl.rootT = Math.max(pl.rootT || 0, 0.1);
        e.stagger = Math.max(e.stagger || 0, 0.2); e.moving = false;
        if (Math.random() < dt * 24) ECHO.Combat.fx.push({ kind: 'p', x: pe.x + (e.x - pe.x) * Math.random(), y: pe.y + (e.y - pe.y) * Math.random() - 0.5, vx: 0, vy: -0.4, t: 0, life: 0.5, color: '#ffe08a', size: 2 });
        if (Math.random() < dt * 18) ECHO.Combat.fx.push({ kind: 'arc', x: pe.x, y: pe.y, x2: e.x, y2: e.y, h: 0.7, t: 0, life: 0.3, color: '#ffe08a' });
        if (e.dead || U.dist(e.x, e.y, pe.x, pe.y) > T.REACH + 6) { T.chan = null; UI().toast(e.dead ? 'It is dead.' : 'You lose your hold on it.', 'warn', 3); }
        else if (C.t >= C.dur) { T.chan = null; T.take(game, e); }
      }
      if (ECHO.Pack) ECHO.Pack.tick(game, dt);
      // your animals out with you
      if ((T.t -= dt) > 0) return;
      T.t = 0.5;
      const L = ECHO.Interior.cur, ok = !L || L.carved || L.type === 'gate';
      const out = T.out(pl), world = game.world;
      // into a place below: who fits, and who waits at the way in
      if (L !== T._lastL) {
        T._lastL = L;
        const wait = L && ok ? out.filter(r => !T.resting(world, r) && !T.fits(r, L)) : [];
        if (wait.length) {
          const more = T.ready_(game).some(r => T.fits(r, L));
          UI().toast(`${wait.map(r => r.name).join(', ')} ${wait.length > 1 ? 'are' : 'is'} too big for ${T.roomWord(L)} and wait${wait.length > 1 ? '' : 's'} at the way in.${more ? ' Press O and smaller ones from your den come in their place.' : ''}`, 'info', 6);
        }
      }
      for (const r of out) {
        if (T.resting(world, r)) { r.out = false; continue; }
        const e = game.ents.find(o => o.pal === r && !o.dead);
        // on a dragon's back: they follow far below, out of sight, and are at your side when you land
        if (pl.flying) { if (e) { e.dead = true; e.vanish = true; } T._flew = true; continue; }
        if (!ok || (L && !T.fits(r, L))) { if (e) { e.dead = true; e.vanish = true; } continue; }
        if (T.resting(world, r)) { if (e) { e.dead = true; e.vanish = true; } continue; }
        if (!e) T.spawn(game, r);
      }
      if (T._flew && !pl.flying) { T._flew = false; if (out.some(r => !T.resting(world, r))) ECHO.Combat.floater(game.pe.x, game.pe.y - 1.6, 'your beasts catch up', '#ffe08a'); }
      // (any left over from one sent home)
      for (const e of game.ents) if (e.pal && !e.dead && !e.pal.out) { e.dead = true; e.vanish = true; ECHO.Combat.burst(e.x, e.y, '#ffe08a', 10, 2, 0.5, 2); }
    },

    // ------------------------------------------------------------ taming
    interactables(game) {
      const out = [], pe = game.pe, pl = game.pl;
      if (pl.flying || T.chan) return out;
      let mouse = null; try { mouse = game.screenToWorld(ECHO.Input.mx, ECHO.Input.my); } catch (err) { mouse = null; }
      for (const e of game.ents) {
        if (!T.ready(game, e)) continue;
        const d = U.dist(e.x, e.y, pe.x, pe.y);
        // from a distance: anything you have beaten that you can see (indoors and out are worlds apart)
        if (d > T.REACH || (e.x >= 9000) !== (pe.x >= 9000)) continue;
        const nm = T.nameOf(e);
        // the one you mean: the one you are locked on, else the one nearest your cursor, else the nearest
        const lock = ECHO.PlayerCtl && ECHO.PlayerCtl.lock === e, dm = mouse ? U.dist(e.x, e.y, mouse.x, mouse.y) : d;
        // first of all you could do here: a beaten beast is what E is for
        out.push({ kind: 'act', label: T.pack(pl).length >= MAX_KEEP ? `Tame ${nm} — your den is full (U)` : `Tame ${nm}${d > 5 ? ' (from here)' : ''}`, d: -1 + (lock ? 0 : 0.001 + Math.min(dm, d) * 0.001), tameEnt: e, act: () => T.begin(game, e) });
        if (e.subdued > 0 && d < 2.5) out.push({ kind: 'act', label: `Finish ${nm}`, d: d * 0.5 + 0.01, act: () => { e.subdued = 0; e._finish = true; ECHO.Combat.kill(e, pe, 'melee', { angle: Math.atan2(e.y - pe.y, e.x - pe.x) }); } });
      }
      return out;
    },
    nameOf(e) { return e.label ? e.label.replace(/^(an?|the) /i, 'the ') : e.boss ? `${e.boss.name}` : e.foe ? `the ${e.foe.name.replace(/^the /i, '').toLowerCase()}` : `the ${e.species}`; },
    plural(e) { const n = (e.foe ? e.foe.name.replace(/^the /i, '') : e.species || 'beast').toLowerCase(); return /s$/.test(n) ? n : /(ch|sh|x)$/.test(n) ? n + 'es' : /[^aeiou]y$/.test(n) ? n.slice(0, -1) + 'ies' : /wolf$/.test(n) ? n.slice(0, -1) + 'ves' : n + 's'; },
    begin(game, e) {
      const pl = game.pl;
      if (T.full(game, e)) return UI().toast(`You already keep ${MAX_SAME} ${T.plural(e)}. Release one (U) to tame another.`, 'warn', 4);
      if (T.pack(pl).length >= MAX_KEEP) return UI().toast(`You already keep ${MAX_KEEP} tamed beasts. Release one (U → Animals) to make room.`, 'warn', 5);
      const boss = T.isBoss(e);
      T.chan = { e, t: 0, dur: boss ? 1.2 : 0.7, hp: game.pe.hp };
      e.aggro = true; e.stagger = (boss ? 1.2 : 0.7) + 0.5; e.state = 'stagger'; e.wcast = null; e.gcast = null; e.subdued = Math.max(e.subdued || 0, 2);
      ECHO.Combat.ring(e.x, e.y, (e.r || 0.4) + 1, 'rgba(255,224,138,0.9)', 0.5);
      ECHO.Combat.floater(game.pe.x, game.pe.y - 1.4, boss ? 'you bear down on its will…' : 'you hold it down…', '#ffe08a');
      if (ECHO.Sfx) ECHO.Sfx.play('growl', { pitch: 0.7 });
    },
    roll(game, e) {
      const pl = game.pl, c = T.chance(game, e);
      if (Math.random() < c) return T.take(game, e);
      e._tameCd = game.time + 3;
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.06); e.subdued = 0; e.aggro = true; e.cd = 0; e._lastBreath = false;
      ECHO.Combat.burst(e.x, e.y, '#ff6a4a', 18, 4, 0.6, 3);
      ECHO.Combat.floater(e.x, e.y - 1.8 * (e.scale || 1), 'it tears free!', '#ff6a4a', true);
      if (ECHO.Sfx) ECHO.Sfx.play('roar', { pitch: 0.9 });
      void pl;
    },
    take(game, e) {
      const world = game.world, pl = game.pl, pk = T.pack(pl);
      const lvl = Math.max(1, ECHO.Prowess.foeLevel(e) || e.lvl || 1);
      const cat = e.type === 'boss' ? 'boss' : e.foe ? 'foe' : 'creature';
      const kindName = e.boss ? e.boss.name : e.foe ? e.foe.name.replace(/^the /i, '') : U.cap(e.species);
      const base = T.isBoss(e) ? (e.label || kindName).replace(/^the /i, '').split(',')[0] : `${NAMES[Math.floor(Math.random() * NAMES.length)]} the ${kindName}`;
      const r = { id: 'pal' + (++pl.palSeq || (pl.palSeq = 1)), cat, kind: cat === 'boss' ? null : e.species, name: U.cap(base), lvl, scale: e.scale || 1, elite: e.elite || null, out: T.out(pl).length < MAX_OUT, hp: 0.6, xp: 0, kills: 0, day: world.day, boss: cat === 'boss' ? { ...e.boss, memory: undefined, lairId: e.lair ? e.lair.id : null } : null, was: e.label || kindName, lord: !!T.isBoss(e) };
      r.lvlT = lvl;
      pk.push(r);
      pl.tames = (pl.tames || 0) + 1;
      // what it was, out in the world
      if (e.nem && ECHO.Powers) { const rec = ECHO.Powers.byId(world, e.nem); if (rec && rec.alive) ECHO.Powers.die(world, rec, `tamed by ${pl.first} ${pl.last}`, `${ECHO.Powers.short(rec)} was beaten and tamed by ${pl.first} ${pl.last}, and runs at their side now.`); if (ECHO.Growth) ECHO.Growth.spawned.delete(e.nem); }
      if (e.lair && e.boss) { e.boss.alive = false; e.boss.tamed = true; UI().bossBar(null); }
      if (e.lord && world.wild) { const w = world.wild.woods.find(x => x.id === e.wood); if (w) { w.lord.slain = world.day; w.lord.tamed = (w.lord.tamed || 0) + 1; } }
      if (e.breach && ECHO.GuardWork) { const b = ECHO.GuardWork.breach(world, e.breach); if (b) ECHO.GuardWork.endBreach(world, ECHO.GuardWork.st(world), b, 'you'); }
      // a lord of a deep place counts as beaten: its floor is cleared, its story goes on
      if (e.boss2 || e.delve || e.questId) { try { e._tamedNow = true; ECHO.Quests.onKill(e, game.pe); } catch (err) { /* (nothing it carried matters now) */ } }
      if (T.isBoss(e)) { UI().bossBar(null); ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} beat ${e.label || kindName} and tamed it.`, importance: 2, x: e.x, y: e.y, rep: 4 }); }
      // and it is yours
      e.dead = true; e.vanish = true;
      ECHO.Combat.ring(e.x, e.y, 2, 'rgba(255,224,138,1)', 0.7); ECHO.Combat.burst(e.x, e.y, '#ffe08a', 30, 5, 0.8, 3);
      ECHO.Combat.fx.push({ kind: 'pillar', x: e.x, y: e.y, t: 0, life: 1.4, color: '#9fe88a', height: 5 + 2 * Math.min(2, e.scale || 1), radius: 0.6 + 0.35 * Math.min(2.5, e.scale || 1) });
      if (ECHO.Music) ECHO.Music.stinger('discover');
      if (r.out) { const p = T.spawn(game, r, e.x, e.y); if (p) { p.say = '…'; p.sayT = 1.5; } }
      UI().banner(`${r.name} is yours`, r.out ? `Level ${lvl} · it follows you now` : `Level ${lvl} · you have ${MAX_OUT} out already: it waits at your den (U → Animals)`, true);
      UI().toast(`You have tamed ${r.name}. It follows you, fights for you and grows on what it kills; if it is beaten it rests until tomorrow. U → Animals to call or rest your beasts.`, 'legend', 7);
      return r;
    },

    // ------------------------------------------------------------ a body for it
    spawn(game, r, x, y) {
      const world = game.world, pe = game.pe;
      const sp = ECHO.Ent.freeSpot(world, x != null ? x : pe.x - 1.5, y != null ? y : pe.y + 1, 4) || { x: pe.x, y: pe.y };
      // (one of yours does not fall far behind you: it trains at your side)
      const want = Math.round(ECHO.Prowess.level(game.pl) * (r.lord || r.cat === 'boss' ? 1 : 0.85));
      if (r.lvl < want) { r.lvl0 = r.lvl0 || r.lvl; r.lvl = want; }
      const e = T.build(game, r, sp.x, sp.y);
      if (!e) return null;
      e.hp = Math.max(1, Math.round(e.maxHp * U.clamp(r.hp == null ? 1 : r.hp, 0.2, 1)));
      e.cd = 0.5; e.palArtT = 4 + Math.random() * 3;
      game.addEnt(e);
      ECHO.Combat.burst(sp.x, sp.y, '#ffe08a', 12, 2, 0.5, 2);
      return e;
    },
    // one of yours, made up (not yet set down in the world; a likeness for its page, if `look`)
    build(game, r, x, y, look) {
      const world = game.world, pe = game.pe, sp = { x, y };
      let e = null;
      if (ECHO.Growth) ECHO.Growth._noAdapt = true;
      try {
        if (r.cat === 'boss' && r.boss) {
          const k = ECHO.Boss.KIND[r.boss.kind] || ECHO.Boss.KIND.drake;
          const FM = ECHO.Prowess.foeMul(r.lvl, true);
          const mh = Math.round((r.boss.maxHp || 600) * Math.max(1, FM.hp / Math.max(1, ECHO.Prowess.foeMul(r.lvl0 || r.lvl, true).hp)));
          e = ECHO.Ent.make({ type: 'boss', x: sp.x, y: sp.y, r: k.r, hp: mh, maxHp: mh, speed: k.speed, faction: 'player', boss: { ...r.boss, alive: true, memory: { encounters: 0, dodge: { left: 0, right: 0, back: 0 }, blocks: 0, attacksSeen: 0, rangedTime: 0, meleeTime: 0, damageBy: { melee: 0, ranged: 0, fire: 0 }, knownFoes: {} } }, state: 'chase', t: 0, cd: 1, label: r.name });
          e.enc = { dmg: { melee: 0, ranged: 0, fire: 0, magic: 0 }, started: true };
          e.palDmg = k.dmg * FM.dmg;
        } else if (r.cat === 'creature') {
          e = ECHO.Spawner.makeCreature(game, r.kind, sp.x, sp.y, ECHO.World.regionAt(world, pe.x, pe.y), null);
          const FM = ECHO.Prowess.foeMul(r.lvl);
          e.maxHp = e.hp = Math.round(e.maxHp * FM.hp); e.palDmg = ((ECHO.SPECIES[r.kind] || {}).dmg || 8) * FM.dmg; e.lvl = r.lvl;
        } else {
          e = ECHO.Monsters.DEFS[r.kind] ? ECHO.Monsters.make(game, r.kind, sp.x, sp.y, r.lvl, { noElite: true }) : ECHO.Quests.makeFoe(game, r.kind, sp.x, sp.y, {});
          e.palDmg = (e.foe.dmg || 8) * (e.dmgMul || 1);
          if (r.elite) { e.elite = r.elite; const X = ECHO.Monsters.ELITE.find(z => z.k === r.elite); if (X) { if (X.hp) e.maxHp = Math.round(e.maxHp * X.hp); if (X.dmg) e.palDmg *= X.dmg; if (X.scale) e.scale *= X.scale; } }
          e.boss2 = false; e.ab = {};
          if (e.foe.shape === 'serpent' || e.foe.shape === 'spider') e.scale = r.scale || e.scale;
        }
      } finally { if (ECHO.Growth) ECHO.Growth._noAdapt = false; }
      if (!e) return null;
      e.pal = r; e.tamed = true; e.faction = 'player'; e.aggro = false; e.label = r.name; e.lvl = r.lvl; e.home = null;
      if (r.mastery) { e.palDmg = (e.palDmg || 8) * T.mDmg(r); e.maxHp = Math.round(e.maxHp * T.mHp(r)); e.hp = e.maxHp; }
      e.r = Math.min(e.r || 0.4, 0.6);
      void look;
      return e;
    },

    // ------------------------------------------------------------ how they think
    think(game, e, dt) {
      if (e.subdued > 0 && !e.pal) return T.beaten(game, e, dt);
      if (!e.pal) return false;
      const world = game.world, pe = game.pe, pl = game.pl, r = e.pal;
      e.t = (e.t || 0) + dt; e.cd = Math.max(0, (e.cd || 0) - dt);
      r.hp = e.hp / e.maxHp;
      if (e.stagger > 0) { e.stagger -= dt; e.state = 'stagger'; e.moving = false; return true; }
      // the pack mind (pack.js) fights; with nothing to fight, it walks at your side
      if (ECHO.Pack) { if (ECHO.Pack.fight(game, e, dt)) return true; e.palFoe = null; e.state = e.state === 'windup' || e.state === 'attack' ? 'idle' : e.state; return T.follow(game, e, dt); }
      // a foe: what is at you, at it, or what you are fighting
      let f = e.palFoe;
      const hostile = o => o && !o.dead && !o.hidden && !o.vanish && o !== pe && !o.tamed && !o.isCompanion && game.hostileTo(e, o) && !(o.subdued > 0) && !(T.chan && T.chan.e === o);
      if (!hostile(f) || U.dist(f.x, f.y, pe.x, pe.y) > 16 || U.dist(f.x, f.y, e.x, e.y) > 18) f = null;
      if (!f || (e._pickT = (e._pickT || 0) - dt) <= 0) {
        e._pickT = 0.8;
        let best = null, bs = Infinity;
        const lock = ECHO.PlayerCtl && ECHO.PlayerCtl.lock;
        for (const o of game.ents) {
          if (!hostile(o)) continue;
          const dp = U.dist(o.x, o.y, pe.x, pe.y); if (dp > 13) continue;
          const engaged = o.aggro || o.target === pe || o.target === e || o.state === 'fight' || o === lock;
          if (!engaged && dp > 6) continue;
          const s = U.dist(o.x, o.y, e.x, e.y) - (o === lock ? 6 : 0) - (o.target === pe ? 3 : 0);
          if (s < bs) { bs = s; best = o; }
        }
        if (best) f = best;
      }
      e.palFoe = f;
      const spd = e.speed || 3;
      if (f) {
        e.aggro = true;
        const d = U.dist(e.x, e.y, f.x, f.y), ang = Math.atan2(f.y - e.y, f.x - e.x), reach = (f.r || 0.4) + (e.r || 0.4) + (e.foe ? e.foe.reach : 1.2) * 0.75;
        const ranged = e.foe && e.foe.ab && (e.foe.ab.ranged || e.foe.ab.bolt);
        e.dir = ang; e.flip = Math.cos(ang) < 0; e.target = f;
        if (e.state === 'windup') {
          e.moving = false;
          if (e.t >= (e.foe ? Math.min(0.6, e.foe.wind || 0.4) : 0.35)) {
            e.state = 'attack'; e.t = 0; e.cd = (e.foe ? e.foe.cd : 1.3) * (e.cdMul || 1) + Math.random() * 0.3;
            if (ranged && d > 2.4) ECHO.Combat.shoot(e, ang, { kind: 'orb', speed: 11, dmg: e.palDmg * 1.1, life: 1.4, type: e.foe.ab.bolt ? e.foe.ab.bolt.type || 'magic' : 'ranged', color: e.foe.ab.bolt ? e.foe.ab.bolt.color : '#e8e0d0' });
            else {
              ECHO.Combat.slash(e.x, e.y, ang, reach + 0.2, 1.5, 'rgba(255,224,138,0.75)');
              if (U.dist(e.x, e.y, f.x, f.y) <= reach + 0.5) ECHO.Combat.damage(f, e.palDmg * (0.85 + Math.random() * 0.3), { type: 'melee', from: e, angle: ang, knock: 0.25 });
            }
          }
          return true;
        }
        if (e.state === 'attack' && e.t < 0.25) { e.moving = false; return true; }
        // its own strength: a great blow that throws back everything round it
        e.palArtT -= dt;
        if (e.palArtT <= 0 && d < reach + 1.2) {
          e.palArtT = 7 + Math.random() * 4;
          const col = (e.foe && (e.foe.em || e.foe.col)) || (e.boss && e.boss.belly) || '#ffe08a', R = 2.4 + (e.scale || 1) * 0.6;
          ECHO.Combat.ring(e.x, e.y, R, 'rgba(255,224,138,0.9)', 0.5); ECHO.Combat.burst(e.x, e.y, col, 26, 5, 0.7, 3); game.shake(0.15);
          for (const o of game.ents) if (hostile(o) && U.dist(o.x, o.y, e.x, e.y) < R + (o.r || 0.4)) ECHO.Combat.damage(o, e.palDmg * 2, { type: 'melee', from: e, angle: Math.atan2(o.y - e.y, o.x - e.x), knock: 0.6, stagger: 0.4 });
          e.say = r.lord ? 'Kneel.' : '*a roar*'; e.sayT = 1;
          return true;
        }
        if (ranged && d > 2.4 && d < 8 && e.cd <= 0) { e.state = 'windup'; e.t = 0; e.aim = ang; e.moving = false; return true; }
        if (d > reach) { ECHO.Ent.travel(world, e, f.x, f.y, spd * 1.05, dt); e.state = 'chase'; }
        else if (e.cd <= 0) { e.state = 'windup'; e.t = 0; e.aim = ang; e.moving = false; }
        else { e.moving = false; e.state = 'chase'; }
        return true;
      }
      return T.follow(game, e, dt);
    },
    // no foe: at your side, and healing
    follow(game, e, dt) {
      const world = game.world, pe = game.pe, pl = game.pl, r = e.pal, spd = e.speed || 3;
      e.aggro = false; e.target = null;
      if (e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.025 * dt);
      const idx = T.out(pl).indexOf(r), dP = U.dist(e.x, e.y, pe.x, pe.y);
      if (dP > 30) {
        const sp = ECHO.Ent.freeSpot(world, pe.x - 2, pe.y + 1.5, 4);
        if (sp) { ECHO.Combat.burst(e.x, e.y, '#ffe08a', 8, 2, 0.4, 2); e.x = sp.x; e.y = sp.y; ECHO.Combat.burst(e.x, e.y, '#ffe08a', 8, 2, 0.4, 2); }
        return true;
      }
      const a = (pe.dir || 0) + Math.PI + (idx - 1) * 0.8, gap = 1.8 + idx * 0.7 + (e.type === 'boss' ? 3.2 : (e.scale || 1) * 0.55);
      const gx = pe.x + Math.cos(a) * gap, gy = pe.y + Math.sin(a) * gap;
      const dg = U.dist(e.x, e.y, gx, gy);
      if (dg > 1.2) { ECHO.Ent.travel(world, e, gx, gy, spd * (dP > 7 ? 1.25 : 0.85), dt); e.state = 'chase'; }
      else { e.moving = false; e.state = 'idle'; if (Math.random() < dt * 0.3) e.dir = Math.atan2(pe.y - e.y, pe.x - e.x); }
      return true;
    },
    // a lord beaten down: it kneels, waiting for you to choose
    beaten(game, e, dt) {
      const holding = T.chan && T.chan.e === e;
      e.subdued -= holding ? 0 : dt; e.moving = false; e.state = 'stagger'; e.stagger = 0.2; e.aggro = false; e.cd = 1;
      if (Math.random() < dt * 3) ECHO.Combat.fx.push({ kind: 'p', x: e.x + (Math.random() - 0.5) * 1.5, y: e.y - 0.5, vx: 0, vy: -0.6, t: 0, life: 1, color: '#ffe08a', size: 2 });
      if (e._lastBreath) {
        // the count, said aloud: the seconds it has left
        const s = Math.ceil(e.subdued);
        if (s < e._breathSay && s > 0 && !holding) { e._breathSay = s; ECHO.Combat.floater(e.x, e.y - 1.7 * (e.scale || 1), `tame it (E) · ${s}`, s <= 3 ? '#ff8a6a' : '#ffe08a'); }
        if (e.subdued <= 0) { e.subdued = 0; e._finish = true; e._lastBreath = false; ECHO.Combat.kill(e, game.pe, 'melee', {}); }
        return true;
      }
      if (e.subdued <= 0) {
        e.subdued = 0; e.hp = Math.max(e.hp, e.maxHp * 0.3); e.aggro = true; e._subOnce = true;
        UI().toast(`${U.cap(T.nameOf(e))} gets up again.`, 'warn', 4);
      }
      return true;
    },

    // ------------------------------------------------------------ when something would die
    // true: it does not die now.
    onDeath(game, e, from) {
      if (e.pal) {
        const r = e.pal;
        r.restAt = T.now(game.world) + 45 * (game.minPerSec ? game.minPerSec() : 4);   // 45 real seconds, whatever the pace r.restUntil = null; r.hp = 0.5; r.out = false;
        e.dead = true; e.vanish = true;
        ECHO.Combat.burst(e.x, e.y, '#c8b080', 20, 3, 0.7, 3);
        // its place is not left empty: the strongest rested one in the den comes
        const next = T.ready_(game)[0];
        if (next) T.call(game, next, true);
        UI().toast(`${r.name} is beaten and limps home to rest (back in about 45 seconds).${next ? ` ${next.name} comes to take its place.` : ''}`, 'warn', 5);
        return true;
      }
      // a lord falls beaten, not dead: yours to tame or to finish
      const byYou = from === game.pe || (from && (from.isCompanion || from.pal || from.tamed));
      // on the leash (L), or bound by a relic: a beast or a monster falls beaten instead of dying
      const held = e._bound > game.time, mode = T.mode(game.pl);
      // on its last breath (the default): a moment, warned, to tame it before it dies
      if (mode === 'breath' && !held && (from === game.pe || (!from && e.burnFrom === game.pe)) && !e._finish && !T.isBoss(e) && T.can(game, e) && T.pack(game.pl).length < MAX_KEEP) {
        e.hp = Math.max(1, Math.round(e.maxHp * T.threshold(e) * 0.5)); e.subdued = 12; e._lastBreath = true; e._breathAt = game.time; e._breathSay = 13;
        e.aggro = false; e.state = 'stagger'; e.burn = 0; e.venomT = 0; e.wcast = null; e._tameCd = 0;
        ECHO.Combat.floater(e.x, e.y - 1.9 * (e.scale || 1), 'LAST BREATH — TAME IT (E)', '#ffe08a', true);
        ECHO.Combat.ring(e.x, e.y, (e.r || 0.4) + 0.9, 'rgba(255,224,138,0.95)', 0.8);
        if (game.slowMo) game.slowMo(0.45, 0.35);
        if (ECHO.Sfx) ECHO.Sfx.play('growl', { pitch: 0.6 });
        if (!game.pl._breathTip) { game.pl._breathTip = true; UI().toast(`${U.cap(T.nameOf(e))} is on its last breath: it kneels for 12 seconds before it dies. Press E — from where you stand — and it is yours — or strike it again to finish it. (L changes this: the leash spares everything you strike down; "to the kill" spares nothing.)`, 'legend', 9); }
        return true;
      }
      if ((mode === 'leash' || held) && (byYou || !from) && !e._finish && !T.isBoss(e) && T.can(game, e)) {
        e.hp = Math.max(1, Math.round(e.maxHp * T.threshold(e) * 0.5)); e.subdued = 25; e.aggro = false; e.state = 'stagger'; e.burn = 0; e.venomT = 0; e.wcast = null;
        ECHO.Combat.floater(e.x, e.y - 1.8 * (e.scale || 1), 'beaten — tame it (E)', '#ffe08a', true);
        ECHO.Combat.ring(e.x, e.y, (e.r || 0.4) + 0.8, 'rgba(255,224,138,0.9)', 0.6);
        if (!game.pl._leashTip) { game.pl._leashTip = true; UI().toast(`${U.cap(T.nameOf(e))} falls, beaten, instead of dying — it kneels for a while. Stand by it and tame it (E), or finish it (E). Your blows cannot touch it while it kneels.`, 'study', 7); }
        return true;
      }
      if (byYou && !e._finish && T.isBoss(e) && T.can(game, e) && !e.subdued) {
        e.hp = Math.max(1, Math.round(e.maxHp * 0.08)); e.subdued = 30; e.aggro = false; e.state = 'stagger';
        ECHO.Combat.floater(e.x, e.y - 2.4 * (e.scale || 1), 'beaten!', '#ffe08a', true);
        game.shake(0.5); if (game.hitStop) game.hitStop(0.2);
        UI().toast(`${U.cap(T.nameOf(e))} falls, beaten. Tame it (E) and it is yours — or finish it. It will not stay down long.`, 'legend', 8);
        if (ECHO.Music) ECHO.Music.stinger('discover');
        return true;
      }
      return false;
    },
    // what one of yours kills feeds it
    onKill(game, e, from) {
      if (!from || from.dead || !game.pe) return;
      const L = Math.max(1, ECHO.Prowess.foeLevel(e) || e.lvl || 1);
      const worth = r => Math.max(1, L * (L >= r.lvl ? 1.5 : 0.6));
      // the one that made the kill learns most; the rest of the pack nearby learn by watching,
      // and they learn from your kills too
      if (from.pal) { from.pal.kills = (from.pal.kills || 0) + 1; T.grow(game, from.pal, worth(from.pal)); }
      if (!from.pal && from !== game.pe) return;
      for (const o of game.ents) if (o.pal && !o.dead && o !== from && U.dist(o.x, o.y, e.x, e.y) < 22) T.grow(game, o.pal, worth(o.pal) * (from.pal ? 0.4 : 0.25));
    },

    // ------------------------------------------------------------ growing: levels, then mastery
    // A beast grows a level at a time up to its height — your own level (or the level it
    // had when you tamed it, if that was higher). There, what it learns goes into its
    // skills instead: each rank of mastery makes it hit harder, last longer and use its
    // arts sooner, and some ranks teach it something new.
    PERKS: [
      { at: 5, k: 'hide', name: 'Thick hide', d: 'takes 12% less harm' },
      { at: 10, k: 'instinct', name: 'Killer instinct', d: '+15% harm to foes below half their life' },
      { at: 15, k: 'wind', name: 'Second wind', d: 'once in a fight, when a third of its life is left, it heals a third' },
      { at: 20, k: 'swift', name: 'Swift arts', d: 'its arts come back a quarter sooner' },
      { at: 30, k: 'apex', name: 'Apex', d: '+20% harm and life on top of all the rest' }
    ],
    MASTERY_MAX: 30,
    cap(game, r) { return Math.min(ECHO.Prowess.MAX, Math.max(ECHO.Prowess.level(game.pl), r.lvlT || r.lvl0 || 1)); },
    atCap(game, r) { return r.lvl >= T.cap(game, r); },
    need(r) { return 12 + r.lvl * 4; },
    needM(r) { return Math.round(T.need(r) * (1 + (r.mastery || 0) * 0.15)); },
    has(r, k) { const P = T.PERKS.find(x => x.k === k); return !!(r && P && (r.mastery || 0) >= P.at); },
    mDmg(r) { const m = r.mastery || 0; return (1 + 0.03 * m) * (T.has(r, 'apex') ? 1.2 : 1); },
    mHp(r) { const m = r.mastery || 0; return (1 + 0.02 * m) * (T.has(r, 'apex') ? 1.2 : 1); },
    cdMul(r) { const m = (r && r.mastery) || 0; return Math.max(0.5, 1 - 0.015 * m) * (T.has(r, 'swift') ? 0.75 : 1); },
    grow(game, r, amount) {
      if (!r || !(amount > 0)) return;
      r.xp = (r.xp || 0) + amount;
      const e = game.ents.find(o => o.pal === r && !o.dead);
      for (let guard = 0; guard < 64; guard++) {
        if (!T.atCap(game, r)) {
          const need = T.need(r);
          if (r.xp < need) break;
          r.xp -= need; const L0 = r.lvl; r.lvl0 = r.lvl0 || L0; r.lvl++;
          if (e) {
            const k = ECHO.Prowess.foeMul(r.lvl, r.lord), k0 = ECHO.Prowess.foeMul(L0, r.lord);
            e.maxHp = Math.round(e.maxHp * k.hp / k0.hp); e.hp = Math.min(e.maxHp, e.hp * k.hp / k0.hp); e.palDmg *= k.dmg / k0.dmg; e.lvl = r.lvl;
            ECHO.Combat.floater(e.x, e.y - 1.8 * (e.scale || 1), `▲ ${r.name} · level ${r.lvl}${T.atCap(game, r) ? ' · its height' : ''}`, '#9fe08a', true);
            ECHO.Combat.ring(e.x, e.y, 1.4, 'rgba(160,240,140,0.9)', 0.5);
          }
          continue;
        }
        // at its height: its skills grow instead
        if ((r.mastery || 0) >= T.MASTERY_MAX) { r.xp = Math.min(r.xp, T.needM(r)); break; }
        const nm = T.needM(r);
        if (r.xp < nm) break;
        r.xp -= nm;
        const d0 = T.mDmg(r), h0 = T.mHp(r);
        r.mastery = (r.mastery || 0) + 1;
        const perk = T.PERKS.find(x => x.at === r.mastery);
        if (e) {
          e.palDmg *= T.mDmg(r) / d0; const hk = T.mHp(r) / h0; e.maxHp = Math.round(e.maxHp * hk); e.hp = Math.min(e.maxHp, e.hp * hk);
          ECHO.Combat.floater(e.x, e.y - 1.8 * (e.scale || 1), `★ ${r.name} · mastery ${r.mastery}`, '#ffd86a', true);
          ECHO.Combat.ring(e.x, e.y, 1.6, 'rgba(255,216,106,0.9)', 0.6);
          if (perk) ECHO.Combat.fx.push({ kind: 'pillar', x: e.x, y: e.y, follow: e, t: 0, life: 1.3, color: '#ffd86a', height: 5, radius: 0.6 + 0.3 * Math.min(2, e.scale || 1) });
        }
        if (perk) UI().toast(`${r.name} has learned ${perk.name}: it ${perk.d}.`, 'legend', 6);
      }
    },
    // its skills in a fight: harm taken, and a second wind
    guard(game, e, dmg) {
      const r = e.pal;
      if (!r) return dmg;
      if (T.has(r, 'hide')) dmg *= 0.88;
      return dmg;
    },
    afterHit(game, e) {
      const r = e.pal;
      if (!r || e.dead || e.hp <= 0 || !T.has(r, 'wind')) return;
      if (e._swAt && game.time - e._swAt < 60) return;
      if (e.hp < e.maxHp / 3) {
        e._swAt = game.time; e.hp = Math.min(e.maxHp, e.hp + e.maxHp / 3);
        ECHO.Combat.floater(e.x, e.y - 1.6 * (e.scale || 1), 'second wind!', '#9fe08a', true);
        ECHO.Combat.burst(e.x, e.y, '#9fe08a', 14, 3, 0.6, 2);
      }
    },

    // ------------------------------------------------------------ the Tamed beasts page
    // (on the Animals page: a word and a way there)
    html(game) {
      const pl = game.pl, pk = T.pack(pl);
      return `<h3 class="gold">Tamed beasts (${pk.length}/${MAX_KEEP})</h3><div class="card"><div style="font-size:13px">${pk.length ? `${T.out(pl).length} with you · ${pk.length - T.out(pl).length} in your den.` : 'None yet. Knock any beast, monster or lord down and press E.'}</div><div class="row"><button class="small" data-tab="tamed">Open the Tamed beasts page</button></div></div>`;
    },
    _pics: {}, _stats: {},
    live(game, r) { return game.ents.find(o => o.pal === r && !o.dead) || null; },
    // what it is like, made up once from its own body (a likeness, or one that stands in)
    look(game, r) {
      const k = r.id + '|' + r.lvl;
      if (T._stats[k]) return T._stats[k];
      let e = T.live(game, r), made = false;
      if (!e) { try { e = T.build(game, r, game.pe.x, game.pe.y, true); made = true; } catch (err) { e = null; } }
      const st = { maxHp: e ? Math.round(e.maxHp) : 0, dmg: e ? Math.round(e.palDmg || 0) : 0, ent: made ? e : null };
      T._stats[k] = st;
      return st;
    },
    kindOf(r) { return r.cat === 'boss' ? 'Great beast of a lair' : r.lord ? 'Lord' : r.cat === 'creature' ? 'Beast' : 'Monster'; },
    // its picture, drawn from its own model (cached; drawn a few at a time)
    pic(game, r) {
      if (T._pics[r.id]) return T._pics[r.id];
      const R = ECHO.Renderer;
      if (!R || !R.beastPortrait) return null;
      const e = T.live(game, r) || T.look(game, r).ent || T.build(game, r, game.pe.x, game.pe.y, true);
      if (!e) return null;
      const cv = R.beastPortrait(game, e, 360, 260);
      if (!cv) return null;
      try { T._pics[r.id] = cv.toDataURL('image/png'); } catch (err) { return null; }
      return T._pics[r.id];
    },
    fillPics(root, game) {
      const imgs = [...root.querySelectorAll('[data-palpic]')].filter(el => !el.dataset.done);
      const next = () => {
        const el = imgs.shift();
        if (!el || !el.isConnected) { if (imgs.length) setTimeout(next, 0); return; }
        el.dataset.done = '1';
        const r = T.pack(game.pl).find(x => x.id === el.dataset.palpic);
        const src = r && T.pic(game, r);
        if (src) { const ph = el.querySelector('.pal-ph'), im = document.createElement('img'); im.src = src; im.alt = ''; if (ph) ph.replaceWith(im); else el.prepend(im); }   // (keeping its level and marks)
        if (imgs.length) setTimeout(next, 16);
      };
      setTimeout(next, 30);
    },
    page(game) {
      const pl = game.pl, world = game.world, pk = T.pack(pl), out = T.out(pl);
      const bar = (f, col) => `<div class="t"><i style="width:${Math.round(U.clamp(f, 0, 1) * 100)}%;background:${col}"></i></div>`;
      const below = !!(ECHO.Interior.cur && T.roomOf(ECHO.Interior.cur));
      const weakest = out.length >= MAX_OUT ? out.slice().sort((a, b) => a.lvl - b.lvl)[0] : null;
      const callLbl = r => weakest ? `Call (${esc(weakest.name)} goes home)` : 'Call to your side';
      // the den, many at once: one line each, with a small picture
      const row = r => {
        const rest = T.resting(world, r), hpF = rest ? 0.3 : (r.hp == null ? 1 : r.hp), pic = T._pics[r.id];
        return `<div class="pal-row${rest ? ' rest' : ''}"><div class="pal-thumb" data-palpic="${r.id}"${pic ? ' data-done="1"' : ''}>${pic ? `<img src="${pic}" alt="">` : '<span class="pal-ph">🐾</span>'}</div>
          <div class="pal-row-main"><b class="gold">${esc(r.name)}</b> <span class="dim">· Lv ${r.lvl}${r.mastery ? ` <span class="gold">★${r.mastery}</span>` : ''}${r.cat === 'boss' || r.lord ? ' ♛' : r.elite ? ' ✦' : ''} · ${esc(T.kindOf(r).toLowerCase())} · ${T.sizeOf(r)} · ${r.kills || 0} kills</span>
            <div class="pal-bar"><span>Life</span>${bar(hpF, hpF > 0.5 ? '#9fe08a' : hpF > 0.25 ? '#e0c060' : '#e05a4a')}<span>${rest ? `<span class="ember">resting${T.restLeft(world, r) != null ? ' · ' + T.restLeft(world, r) + ' s' : ''}</span>` : Math.round(hpF * 100) + '%'}</span></div></div>
          <div class="pal-row-btns"><button class="small" data-pal-call="${r.id}" ${rest || (below && !T.fits(r)) ? 'disabled' : ''}>${below && !T.fits(r) ? 'too big here' : weakest ? 'Call (swap)' : 'Call'}</button><button class="small" data-pal-name="${r.id}" title="Rename">✎</button><button class="small" data-pal-free="${r.id}" title="Release">✕</button></div></div>`;
      };
      const card = r => {
        const rest = T.resting(world, r), e = T.live(game, r), st = T.look(game, r);
        const hpF = e ? e.hp / e.maxHp : (rest ? 0.3 : (r.hp == null ? 1 : r.hp)), need = 12 + r.lvl * 4;
        const big = below && !T.fits(r);
        const status = big && r.out ? '<span class="ember">too big for this place — waiting at the way in</span>' : rest ? `<span class="ember">resting — ${T.restLeft(world, r) != null ? 'back in ' + T.restLeft(world, r) + ' s' : 'back tomorrow'}</span>` : r.out ? (e ? `<span class="gold">with you</span> · ${Math.round(U.dist(e.x, e.y, game.pe.x, game.pe.y))} paces off` : '<span class="gold">with you</span> · on its way') : 'in your den';
        const pic = T._pics[r.id];
        const tag = r.cat === 'boss' || r.lord ? '♛' : r.elite ? '✦ elite' : '';
        return `<div class="pal-card${r.out && !rest ? ' out' : ''}${rest ? ' rest' : ''}">
          <div class="pal-pic" data-palpic="${r.id}"${pic ? ' data-done="1"' : ''}>${pic ? `<img src="${pic}" alt="">` : '<span class="pal-ph">🐾</span>'}<span class="pal-lv">Lv ${r.lvl}${r.mastery ? " ★" + r.mastery : ""}</span>${tag ? `<span class="pal-tag gold">${tag}</span>` : ''}</div>
          <div class="pal-body">
            <div class="pal-head"><h4>${esc(r.name)}</h4></div>
            <div class="pal-sub">${esc(T.kindOf(r))} · ${T.sizeOf(r)}${r.was && r.was !== r.name ? ' · once ' + esc(r.was) : ''} · tamed day ${r.day}</div>
            <div class="pal-bar"><span>Life</span>${bar(hpF, hpF > 0.5 ? '#9fe08a' : hpF > 0.25 ? '#e0c060' : '#e05a4a')}<span>${Math.round(hpF * 100)}%</span></div>
            ${T.atCap(game, r) ? `<div class="pal-bar"><span>Mastery</span>${bar((r.mastery || 0) >= T.MASTERY_MAX ? 1 : (r.xp || 0) / T.needM(r), '#ffd86a')}<span>${(r.mastery || 0) >= T.MASTERY_MAX ? 'full' : Math.floor(r.xp || 0) + '/' + T.needM(r)}</span></div>
            <div class="pal-skill">★ ${r.mastery || 0}/${T.MASTERY_MAX} · at its height (level ${T.cap(game, r)}): its skills grow · +${Math.round((T.mDmg(r) - 1) * 100)}% harm, +${Math.round((T.mHp(r) - 1) * 100)}% life, arts ${Math.round((1 - T.cdMul(r)) * 100)}% sooner</div>` : `<div class="pal-bar"><span>Growth</span>${bar((r.xp || 0) / need, '#8fb8ff')}<span>${Math.floor(r.xp || 0)}/${need}</span></div>
            <div class="pal-skill dim">grows to level ${T.cap(game, r)} (your level); past that, its skills grow</div>`}
            <div class="pal-skill">${T.PERKS.map(P0 => (r.mastery || 0) >= P0.at ? `<span class="gold" title="${esc(P0.d)}">${esc(P0.name)}</span>` : '').filter(Boolean).join(' · ') || ''}${(nx => nx ? `<span class="dim">${(r.mastery || 0) >= T.PERKS[0].at ? ' · ' : ''}next: ${esc(nx.name)} at ★${nx.at} — ${esc(nx.d)}</span>` : '')(T.PERKS.find(P0 => (r.mastery || 0) < P0.at))}</div>
            <div class="pal-stats"><span>Life <b>${st.maxHp || '—'}</b></span><span>Strikes <b>${st.dmg || '—'}</b></span><span>Kills <b>${r.kills || 0}</b></span></div>
            <div style="font-size:12px">${status}</div>
            <div class="row">${r.out ? `<button class="small" data-pal-rest="${r.id}">Send to the den</button>` : `<button class="small" data-pal-call="${r.id}" ${rest ? 'disabled' : ''}>${callLbl(r)}</button>`}<button class="small" data-pal-name="${r.id}">Rename</button><button class="small" data-pal-free="${r.id}">Release</button></div>
          </div></div>`;
      };
      let h = `<details class="pal-how"${T.pack(pl).length ? '' : ' open'}><summary class="gold">How taming and growing work</summary><p class="dim"><b>How to tame:</b> knock any beast, monster or lord down — it kneels instead of dying — and press <b>E</b>, from where you stand (a golden ring marks which one). It is yours; taming never fails. <b>You keep at most ${MAX_SAME} of any one kind</b> (lords and great beasts are each one of a kind); a third of a kind you already have fights and falls like any other. They grow by fighting — the one that lands the kill most, the rest of the pack nearby a little, and from your kills too — up to your level; at that height their <b>skills</b> grow instead (mastery ★, up to ${T.MASTERY_MAX}: harder blows, more life, arts sooner, and new skills at ★5, 10, 15, 20 and 30). Up to ${MAX_OUT} follow you and fight at your side; the rest wait in your den. <b>O</b> calls your strongest at any time; Call on any one brings it (if your side is full, the weakest with you goes home for it). When one is beaten it goes home to rest for about 45 seconds, and the strongest rested one comes in its place. L changes how you strike things down. <b>Size matters below ground:</b> caves, hideouts and grots let only small beasts in; dungeons, crypts and mines keep out the huge (the great beasts of the lairs, widows, wyrms); the worlds beyond the gates take any. Those too big wait at the way in.</p></details>`;
      if (ECHO.Apex && ECHO.Apex.yHtml) h = ECHO.Apex.yHtml(game) + h;
      if (!pk.length) return h + '<div class="card"><p class="dim">No tamed beasts yet.</p></div>';
      const withYou = pk.filter(r => r.out), den = pk.filter(r => !r.out).sort((a, b) => (T.resting(world, a) - T.resting(world, b)) || b.lvl - a.lvl);
      h += `<div class="row" style="gap:6px;margin:6px 0 10px"><button data-pal-rally="1" ${T.ready_(game).length ? '' : 'disabled'}>Call my strongest (O)</button>${withYou.length ? '<button data-pal-home="1">Send all to the den</button>' : ''}</div>`;
      h += `<h3 class="gold">With you (${withYou.length}/${MAX_OUT})</h3>${withYou.length ? `<div class="pal-grid">${withYou.map(card).join('')}</div>` : '<p class="dim">None at your side. Press <b>O</b> (or the button above) and your strongest come, or call any one from your den below.</p>'}`;
      h += `<h3 class="gold">In your den (${den.length}) <span class="dim" style="font-size:13px">· ${pk.length}/${MAX_KEEP} kept · strongest first</span></h3>${den.length ? `<div class="pal-list">${den.map(row).join('')}</div>` : '<p class="dim">Empty.</p>'}`;
      return h;
    },
    bind(root, game, again) {
      const pl = game.pl, pk = T.pack(pl), by = id => pk.find(r => r.id === id);
      const on = (sel, fn) => root.querySelectorAll(sel).forEach(b => b.addEventListener('click', () => { fn(b); again(); }));
      on('button[data-pal-call]', b => T.call(game, by(b.dataset.palCall)));
      on('button[data-pal-rally]', () => T.rally(game));
      on('button[data-pal-home]', () => T.sendAll(game));
      on('button[data-pal-rest]', b => { const r = by(b.dataset.palRest); if (r) r.out = false; });
      root.querySelectorAll('button[data-pal-free]').forEach(b => b.addEventListener('click', () => {
        const r = by(b.dataset.palFree); if (!r) return;
        UI().modal({ title: `Release ${r.name}?`, html: `<p>${esc(r.name)} goes back to the wild, and is gone for good.</p>`, choices: [{ label: `Release ${r.name}`, onPick: () => { pl.pack = T.pack(pl).filter(x => x !== r); for (const e of game.ents) if (e.pal === r) { e.dead = true; e.vanish = true; } delete T._pics[r.id]; UI().toast(`You let ${r.name} go. It looks back once, and is gone.`, 'info', 4); again(); } }, { label: 'Keep it' }] });
      }));
      root.querySelectorAll('button[data-pal-name]').forEach(b => b.addEventListener('click', () => {
        const r = by(b.dataset.palName); if (!r) return;
        UI().modal({ title: `Rename ${r.name}`, html: `<p><input id="palname" maxlength="28" value="${esc(r.name)}" style="width:100%;padding:6px;font-size:16px"></p>`, choices: [{ label: 'Name it', onPick: () => { const i = document.querySelector('#palname'); const v = i && i.value.trim(); if (v) { r.was = r.was || r.name; r.name = v.slice(0, 28); for (const e of game.ents) if (e.pal === r) e.label = r.name; } again(); } }, { label: 'Leave it' }] });
        setTimeout(() => { const i = document.querySelector('#palname'); if (i) { i.focus(); i.select(); i.addEventListener('keydown', ev => ev.stopPropagation()); } }, 30);
      }));
      T.fillPics(root, game);
      if (ECHO.Apex && ECHO.Apex.yBind && root.querySelector('[data-tipic], [data-ti-call], [data-ti-away], [data-ti-horse]')) ECHO.Apex.yBind(root, game, again);
    }
  };
})();
