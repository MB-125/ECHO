// Arcana: magical equipment, and the growth of your mana.
//
// Relics — rods, rings, amulets, boots, pendants, orbs, torcs — are worn in three
// slots and woken with Z, X and C. Each one spends mana and must rest a while
// before it answers again. They are found on what you kill (more often on the
// strong), in the hoards of lords and lairs, and sold by the arcanist of a market.
//
// Weapons may come with the Arcane property (each blow draws a little mana and
// strikes harder for it) and armour with Manaweave (blows that reach you are
// paid partly in mana instead of blood).
//
// Your mana grows with use: every point you spend, and every moment you stand
// in a fight, deepens the well — slowly, and without end.
(function () {
  const { U } = ECHO;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const KEYS = ['z', 'x', 'c'];
  const RELICS = {
    storm: { name: 'Stormcaller', icon: '⚡', color: '#9fd8ff', mana: 28, cd: 6, bases: ['rod', 'wand', 'sceptre'], what: 'Chain lightning', desc: p => `Lightning leaps from the foe you aim at to up to three more near it, for ${p} each.` },
    frost: { name: 'Rimeheart', icon: '❄', color: '#bfefff', mana: 24, cd: 9, bases: ['ring', 'band', 'signet'], what: 'Frost nova', desc: p => `A burst of killing cold around you: ${Math.round(p * 0.7)} to everything near, and they freeze where they stand for two seconds.` },
    aegis: { name: 'Aegis', icon: '🛡', color: '#ffe08a', mana: 30, cd: 18, bases: ['amulet', 'locket', 'talisman'], what: 'Arcane barrier', desc: p => `A shell of light that takes the next ${p * 3} of harm meant for you, for ten seconds.` },
    blink: { name: 'Wayfarer', icon: '➶', color: '#c8a8ff', mana: 16, cd: 3, bases: ['boots', 'sandals', 'greaves'], what: 'Blink', desc: () => 'Step through the air six paces the way you aim — out of a ring of foes, over a gap — and nothing touches you in the step.' },
    bloom: { name: 'Lifebloom', icon: '❀', color: '#9fffb0', mana: 34, cd: 20, bases: ['pendant', 'charm', 'brooch'], what: 'Healing bloom', desc: () => 'Over four seconds, more than a third of your life grows back; fire and poison are washed off you.' },
    blades: { name: 'Spectral', icon: '✦', color: '#d8c8ff', mana: 36, cd: 16, bases: ['orb', 'prism', 'shard'], what: 'Spectral blades', desc: p => `Three ghostly blades circle you for ten seconds and cut whatever comes close, for ${Math.round(p * 0.35)} twice a second.` },
    bind: { name: 'Beastbinder', icon: '⛓', color: '#ffcf6a', mana: 22, cd: 10, bases: ['torc', 'chain', 'collar'], what: 'Binding', desc: () => 'Chains of light hold the beast you aim at still for four seconds; for twenty, no blow of yours can kill it — it falls beaten instead — and it is easier to tame.' },
    star: { name: 'Starfall', icon: '☄', color: '#ffb84a', mana: 50, cd: 14, bases: ['orb', 'star-glass', 'censer'], what: 'Starfall', desc: p => `A star falls where you aim a second later: ${Math.round(p * 2.2)} to everything within three paces, and they burn.` }
  };
  const PRE = { common: ['Plain', 'Old'], fine: ['Fine', 'Bright'], rare: ['Runed', 'Moonlit'], epic: ['Starforged', 'Dread'], legendary: ['Archmage\'s', 'Worldsong', 'Eldest'] };

  const A = ECHO.Arcana = {
    RELICS, KEYS,
    cd: {}, last: null, fx: { bloomT: 0, bloomPer: 0, bladesT: 0, bladesTick: 0, bladesP: 0, falls: [] },
    reset() { A.cd = {}; A.last = null; A.fx = { bloomT: 0, bloomPer: 0, bladesT: 0, bladesTick: 0, bladesP: 0, falls: [] }; },

    // ------------------------------------------------------------ the pieces
    power(level, rarity) { const R = ECHO.Gear.rarity(rarity); return Math.round((10 + Math.max(1, level) * 2.6) * R.mult); },
    make(world, rng, level, rarity, where, kind) {
      const keys = Object.keys(RELICS), k = kind || keys[rng.int(0, keys.length - 1)], D = RELICS[k];
      const pre = PRE[rarity] || PRE.common;
      const name = `${pre[rng.int(0, pre.length - 1)]} ${D.name.toLowerCase()} ${D.bases[rng.int(0, D.bases.length - 1)]}`;
      const it = ECHO.Character.makeItem(world, { kind: 'relic', name: U.cap(name), dmg: 0, holder: null, history: [{ d: world.day, t: where ? `found ${where}` : 'found' }] });
      it.relic = k; it.rarity = rarity; it.level = level; it.plus = 0; it.power = A.power(level, rarity);
      return it;
    },
    slots(pl) { if (!Array.isArray(pl.relics)) pl.relics = [null, null, null]; while (pl.relics.length < 3) pl.relics.push(null); return pl.relics; },
    worn(pl, id) { return !!id && Array.isArray(pl.relics) && pl.relics.includes(id); },
    line(it) { const D = RELICS[it.relic]; return D ? `${D.what} · ${D.mana} mana · rests ${D.cd} s · power ${it.power}` : 'relic'; },
    descOf(it) { const D = RELICS[it.relic]; return D ? D.desc(it.power) : ''; },
    value(it) { const R = ECHO.Gear.rarity(it.rarity); return Math.round((it.power || 10) * 2.6 * R.mult * R.mult + 30); },
    // put on in the first free slot (or the given one)
    wear(pl, id, slot) {
      const S = A.slots(pl);
      const i0 = S.indexOf(id); if (i0 >= 0) S[i0] = null;
      const i = slot != null ? slot : S.indexOf(null);
      if (i < 0 || i > 2) return false;
      S[i] = id; return true;
    },
    takeOff(pl, id) { const S = A.slots(pl); const i = S.indexOf(id); if (i >= 0) S[i] = null; },
    // a new relic picked up goes on if there is room
    onTake(pl, it) { if (it.kind === 'relic' && A.slots(pl).indexOf(null) >= 0) { A.wear(pl, it.id); return true; } return false; },

    // ------------------------------------------------------------ the well of mana
    bonus(pl) { const a = pl.arc; if (!a) return 0; return Math.floor(1.6 * Math.sqrt(a.used || 0) + 1.2 * Math.sqrt(a.fight || 0)); },
    regenBonus(pl) { return A.bonus(pl) * 0.015; },
    // what was spent since the last look (called before the mana comes back each frame)
    measure(game) {
      const pl = game.pl;
      if (A.last != null && pl.mana < A.last - 0.001) A.grow(game, A.last - pl.mana);
    },
    after(game) { A.last = game.pl.mana; },
    grow(game, used, fight = 0) {
      const pl = game.pl;
      const a = pl.arc || (pl.arc = { used: 0, fight: 0, shown: 0 });
      const b0 = A.bonus(pl);
      a.used = (a.used || 0) + used; a.fight = (a.fight || 0) + fight;
      const b1 = A.bonus(pl);
      if (b1 !== b0) ECHO.PlayerCtl.derivedT = 0;
      if (b1 >= (a.shown || 0) + 5 && game.time - (A._growT || -99) > 4) {
        a.shown = b1 - (b1 % 5); A._growT = game.time;
        const pe = game.pe;
        ECHO.Combat.floater(pe.x, pe.y - 1.9, `✦ your mana deepens · +${b1}`, '#8fb8ff', true);
        ECHO.Combat.burst(pe.x, pe.y, '#8fb8ff', 12, 2, 0.6, 2);
        if (!pl.tips || !pl.tips.manaGrow) { pl.tips = pl.tips || {}; pl.tips.manaGrow = 1; game.ui.toast('Your mana grows with use: every point you spend, and every moment you stand in a fight, deepens the well a little. (K — you, shows how far.)', 'study', 7); }
      }
    },

    // ------------------------------------------------------------ each frame
    tick(game, dt) {
      const pl = game.pl, pe = game.pe;
      if (!pl || !pe || pe.dead) return;
      // standing in a fight
      if (game.combatT != null && game.time - game.combatT < 4 && !pl.flying) A.grow(game, 0, dt);
      // a barrier wears out
      if (pl._barrierT > 0) { pl._barrierT -= dt; if (Math.random() < dt * 10) ECHO.Combat.fx.push({ kind: 'p', x: pe.x + Math.cos(game.time * 5 + Math.random() * 6) * 0.7, y: pe.y - 0.4, vx: 0, vy: -0.3, t: 0, life: 0.5, color: '#ffe08a', size: 2 }); if (pl._barrierT <= 0) { pl._barrier = 0; ECHO.Combat.floater(pe.x, pe.y - 1.3, 'the barrier fades', '#c8c0b0'); } }
      const F = A.fx;
      if (F.bloomT > 0) { F.bloomT -= dt; pl.hp = Math.min(pl.maxHp, pl.hp + F.bloomPer * dt); pe.hp = pl.hp; if (Math.random() < dt * 12) ECHO.Combat.fx.push({ kind: 'p', x: pe.x + (Math.random() - 0.5) * 1.2, y: pe.y - 0.2, vx: 0, vy: -0.8, t: 0, life: 0.8, color: '#9fffb0', size: 2 }); }
      if (F.bladesT > 0) {
        F.bladesT -= dt; F.bladesTick -= dt;
        for (let i = 0; i < 3; i++) { const a = game.time * 5 + i * 2.094; if (Math.random() < dt * 40) ECHO.Combat.fx.push({ kind: 'p', x: pe.x + Math.cos(a) * 1.4, y: pe.y + Math.sin(a) * 1.4 - 0.4, vx: 0, vy: 0, t: 0, life: 0.25, color: '#d8c8ff', size: 3 }); }
        if (F.bladesTick <= 0) { F.bladesTick = 0.5; for (const e of A.foes(game, pe.x, pe.y, 2.1)) ECHO.Combat.damage(e, F.bladesP * 0.35, { type: 'magic', from: pe, angle: Math.atan2(e.y - pe.y, e.x - pe.x), arcana: true }); }
      }
      for (const f of F.falls) {
        f.t -= dt;
        if (Math.random() < dt * 30) ECHO.Combat.fx.push({ kind: 'p', x: f.x + (Math.random() - 0.5) * 0.4, y: f.y - 6 * Math.max(0, f.t), vx: 0, vy: 3, t: 0, life: 0.3, color: '#ffb84a', size: 3 });
        if (f.t <= 0 && !f.done) {
          f.done = true;
          const C = ECHO.Combat;
          C.burst(f.x, f.y, '#ffb84a', 40, 6, 0.8, 3); C.burst(f.x, f.y, '#fff0c8', 20, 3, 0.6, 2); C.ring(f.x, f.y, 3, 'rgba(255,184,74,0.9)', 0.5);
          C.puff(f.x, f.y, { h: 0.6, vz: 0.6, g: 0, life: 0.4, size: 26, color: '#ffc87a', glow: true, flash: true, grow: 1.8 });
          C.decal(f.x, f.y, 'scorch', 2.2, 16);
          game.shake(0.45); game.light(f.x, f.y, 9, 1, '#ffb84a', 0.35);
          if (ECHO.Sfx) ECHO.Sfx.play('explode', { pitch: 0.7 });
          for (const e of A.foes(game, f.x, f.y, 3)) { C.damage(e, f.p * 2.2, { type: 'magic', from: pe, angle: Math.atan2(e.y - f.y, e.x - f.x), knock: 3, arcana: true }); if (!e.dead) { e.burn = Math.max(e.burn || 0, 2); e.burnFrom = pe; } }
        }
      }
      F.falls = F.falls.filter(f => !f.done);
    },
    // what a relic may strike: what is set against you, and not kneeling
    foes(game, x, y, r) {
      const pe = game.pe;
      return game.ents.filter(e => !e.dead && !e.hidden && !e.ghost && !e.vanish && e !== pe && !e.pal && !e.tamed && !e.isCompanion && !(e.subdued > 0) && U.dist(e.x, e.y, x, y) < r + (e.r || 0.4) && game.hostileTo(pe, e));
    },
    // the one you mean: the one you are locked on, or the nearest along your aim
    aimed(game, aim, range) {
      const pe = game.pe, L = ECHO.PlayerCtl.lock;
      if (L && !L.dead && U.dist(L.x, L.y, pe.x, pe.y) < range + 2) return L;
      let best = null, bs = 1e9, near = null, nd = 1e9;
      for (const e of A.foes(game, pe.x, pe.y, range)) {
        const d = U.dist(e.x, e.y, pe.x, pe.y), off = Math.abs(U.angleDiff(Math.atan2(e.y - pe.y, e.x - pe.x), aim));
        const s = d + off * 6;
        if (off < 1.0 && s < bs) { bs = s; best = e; }
        if (d < nd) { nd = d; near = e; }
      }
      // nothing along your aim: the nearest one close by
      return best || (nd < 6 ? near : null);
    },

    // ------------------------------------------------------------ waking a relic
    use(game, slot, aim) {
      const pl = game.pl, pe = game.pe, world = game.world, C = ECHO.Combat;
      const id = A.slots(pl)[slot], it = id && world.items[id];
      if (!it || it.kind !== 'relic' || !RELICS[it.relic]) { C.floater(pe.x, pe.y - 1.2, `no relic on ${KEYS[slot].toUpperCase()}`, '#c8c0b0'); if (!pl.tips || !pl.tips.relic0) { pl.tips = pl.tips || {}; pl.tips.relic0 = 1; game.ui.toast('Z, X and C wake magical relics — rods, rings, amulets and the like — worn from your character page (K). Find them on what you kill, or buy them from the arcanist at a market.', 'study', 7); } return false; }
      if (pe.swimming) return false;
      if (pl.flying && it.relic === 'blink') return false;   // (no stepping through the air from a dragon's back)
      const D = RELICS[it.relic];
      const left = (A.cd[id] || 0) - game.time;
      if (left > 0) { C.floater(pe.x, pe.y - 1.2, `${D.what}: ${left.toFixed(1)} s`, '#c8c0b0'); return false; }
      if (pl.mana < D.mana) { C.floater(pe.x, pe.y - 1.2, `not enough mana (${D.mana})`, '#8fb8ff'); return false; }
      const P = it.power * (0.85 + (pl.skills.flame || 0) / 120) * (pl.buffs && pl.buffs.might > 0 ? 1.33 : 1);
      const ok = A[it.relic](game, P, aim, it);
      if (ok === false) return false;
      pl.mana -= D.mana; pe.mana = pl.mana;
      A.cd[id] = game.time + D.cd;
      ECHO.Character.train(pl, 'flame', 0.12);
      if (game.combatT == null || game.time - game.combatT > 4) { /* used out of a fight */ } else game.combatT = game.time;
      return true;
    },
    storm(game, P, aim) {
      const pe = game.pe, C = ECHO.Combat;
      let cur = A.aimed(game, aim, 9);
      if (!cur) { C.floater(pe.x, pe.y - 1.2, 'nothing to strike', '#c8c0b0'); return false; }
      const hit = new Set(); let from = { x: pe.x, y: pe.y };
      for (let n = 0; n < 4 && cur; n++) {
        hit.add(cur);
        C.fx.push({ kind: 'arc', x: from.x, y: from.y, x2: cur.x, y2: cur.y, h: 0.9, t: 0, life: 0.35, color: '#9fd8ff' });
        C.fx.push({ kind: 'arc', x: from.x, y: from.y, x2: cur.x, y2: cur.y, h: 0.9, t: 0, life: 0.25, color: '#ffffff' });
        C.damage(cur, P * (n ? 0.85 : 1), { type: 'magic', from: pe, angle: Math.atan2(cur.y - from.y, cur.x - from.x), stagger: 0.3, arcana: true });
        C.burst(cur.x, cur.y, '#9fd8ff', 10, 3, 0.4, 2);
        from = { x: cur.x, y: cur.y };
        const c0 = cur; cur = A.foes(game, c0.x, c0.y, 5).filter(e => !hit.has(e)).sort((a, b) => U.dist(a.x, a.y, c0.x, c0.y) - U.dist(b.x, b.y, c0.x, c0.y))[0];
      }
      game.light(pe.x, pe.y, 6, 0.9, '#9fd8ff', 0.2);
      if (ECHO.Sfx) ECHO.Sfx.play('fireRelease', { pitch: 1.9 });
      return true;
    },
    frost(game, P) {
      const pe = game.pe, C = ECHO.Combat;
      C.ring(pe.x, pe.y, 4.5, 'rgba(190,240,255,0.95)', 0.5); C.ring(pe.x, pe.y, 3, 'rgba(255,255,255,0.8)', 0.35);
      C.burst(pe.x, pe.y, '#bfefff', 40, 6, 0.7, 3);
      for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; C.puff(pe.x + Math.cos(a) * 2.5, pe.y + Math.sin(a) * 2.5, { h: 0.3, vz: 0.4, g: 0, life: 0.7, size: 7, color: '#e8f8ff', glow: true }); }
      for (const e of A.foes(game, pe.x, pe.y, 4.5)) {
        C.damage(e, P * 0.7, { type: 'magic', from: pe, angle: Math.atan2(e.y - pe.y, e.x - pe.x), arcana: true });
        if (!e.dead) { e.stagger = Math.max(e.stagger || 0, A.big(e) ? 1 : 2); e.state = e.state === 'subdued' ? e.state : 'stagger'; e.wcast = null; C.burst(e.x, e.y, '#e8f8ff', 8, 1, 0.8, 2); }
      }
      game.light(pe.x, pe.y, 7, 0.8, '#bfefff', 0.3);
      if (ECHO.Sfx) ECHO.Sfx.play('fireRelease', { pitch: 0.6 });
      return true;
    },
    big(e) { return e.type === 'boss' || e.boss2 || e.lord; },
    aegis(game, P) {
      const pl = game.pl, pe = game.pe;
      pl._barrier = Math.round(P * 3); pl._barrierT = 10;
      ECHO.Combat.ring(pe.x, pe.y, 1.3, 'rgba(255,224,138,0.95)', 0.6); ECHO.Combat.burst(pe.x, pe.y, '#ffe08a', 18, 2, 0.6, 2);
      ECHO.Combat.floater(pe.x, pe.y - 1.4, `barrier · ${pl._barrier}`, '#ffe08a', true);
      if (ECHO.Sfx) ECHO.Sfx.play('heal', { pitch: 0.7 });
      return true;
    },
    blink(game, P, aim) {
      const pe = game.pe, pl = game.pl, world = game.world, C = ECHO.Combat;
      const x0 = pe.x, y0 = pe.y;
      C.burst(x0, y0, '#c8a8ff', 16, 3, 0.4, 2);
      for (let i = 0; i < 24; i++) ECHO.Ent.move(world, pe, Math.cos(aim) * 0.25, Math.sin(aim) * 0.25);
      if (U.dist(x0, y0, pe.x, pe.y) < 0.5) { C.floater(pe.x, pe.y - 1.2, 'no room', '#c8c0b0'); return false; }
      pl.x = pe.x; pl.y = pe.y;
      pe.iframes = Math.max(pe.iframes || 0, 0.4);
      for (let k = 0; k <= 6; k++) { const f = k / 6; C.fx.push({ kind: 'p', x: U.lerp(x0, pe.x, f), y: U.lerp(y0, pe.y, f) - 0.5, vx: 0, vy: -0.3, t: 0, life: 0.4, color: '#c8a8ff', size: 3 }); }
      C.burst(pe.x, pe.y, '#c8a8ff', 16, 3, 0.4, 2);
      if (ECHO.Sfx) ECHO.Sfx.play('dodge', { pitch: 1.5 });
      return true;
    },
    bloom(game) {
      const pl = game.pl, pe = game.pe;
      A.fx.bloomT = 4; A.fx.bloomPer = pl.maxHp * 0.38 / 4;
      pe.burn = 0; pl.poisonT = 0; pl.poisonDps = 0;
      ECHO.Combat.ring(pe.x, pe.y, 1.6, 'rgba(160,255,176,0.9)', 0.6); ECHO.Combat.burst(pe.x, pe.y, '#9fffb0', 20, 2, 0.7, 2);
      if (ECHO.Sfx) ECHO.Sfx.play('heal');
      return true;
    },
    blades(game, P) {
      A.fx.bladesT = 10; A.fx.bladesTick = 0; A.fx.bladesP = P;
      ECHO.Combat.ring(game.pe.x, game.pe.y, 1.4, 'rgba(216,200,255,0.9)', 0.5);
      if (ECHO.Sfx) ECHO.Sfx.play('fireCharge', { pitch: 1.6 });
      return true;
    },
    bind(game, P, aim) {
      const pe = game.pe, C = ECHO.Combat;
      const e = A.aimed(game, aim, 9);
      if (!e) { C.floater(pe.x, pe.y - 1.2, 'nothing to bind', '#c8c0b0'); return false; }
      e._bound = game.time + 20;
      e.stagger = Math.max(e.stagger || 0, A.big(e) ? 2 : 4); e.state = 'stagger'; e.wcast = null; e.moving = false;
      for (let i = 0; i < 3; i++) C.fx.push({ kind: 'arc', x: pe.x, y: pe.y, x2: e.x + (Math.random() - 0.5) * 0.6, y2: e.y + (Math.random() - 0.5) * 0.6, h: 0.6, t: 0, life: 0.6, color: '#ffcf6a' });
      C.ring(e.x, e.y, (e.r || 0.4) + 1, 'rgba(255,207,106,0.95)', 0.7);
      C.floater(e.x, e.y - 1.6 * (e.scale || 1), 'bound', '#ffcf6a', true);
      if (ECHO.Sfx) ECHO.Sfx.play('growl', { pitch: 0.6 });
      return true;
    },
    star(game, P, aim) {
      const pe = game.pe, mouse = game.screenToWorld(ECHO.Input.mx, ECHO.Input.my), L = ECHO.PlayerCtl.lock;
      let x, y;
      if (L && !L.dead) { x = L.x; y = L.y; }
      else { const d = U.clamp(U.dist(mouse.x, mouse.y, pe.x, pe.y), 2, 10); x = pe.x + Math.cos(aim) * d; y = pe.y + Math.sin(aim) * d; }
      A.fx.falls.push({ x, y, t: 1, p: P });
      ECHO.Combat.ring(x, y, 3, 'rgba(255,184,74,0.7)', 1);
      return true;
    },

    // ------------------------------------------------------------ in the blow
    // Arcane weapons: each blow draws 3 mana and strikes 40% harder for it.
    dealt(game, type) {
      const pl = game.pl, w = game.world.items[type === 'ranged' ? pl.bow : pl.weapon];
      if (!w || w.affix !== 'arcane' || pl.mana < 3) return 1;
      pl.mana -= 3;
      return 1.4;
    },
    // A barrier, then Manaweave armour: what reaches you is paid first in light, then partly in mana.
    taken(game, dmg) {
      const pl = game.pl, pe = game.pe;
      if (pl._barrier > 0 && pl._barrierT > 0 && dmg > 0) {
        const a = Math.min(dmg, pl._barrier); pl._barrier -= a; dmg -= a;
        ECHO.Combat.floater(pe.x - 0.3, pe.y - 1.0, `▣ ${Math.round(a)}`, '#ffe08a');
        if (pl._barrier <= 0) { pl._barrierT = 0; ECHO.Combat.burst(pe.x, pe.y, '#ffe08a', 14, 3, 0.4, 2); ECHO.Combat.floater(pe.x, pe.y - 1.3, 'the barrier breaks', '#ffe08a'); }
      }
      const ar = pl.armor && game.world.items[pl.armor];
      if (ar && ar.affix === 'manaweave' && dmg > 0 && pl.mana > 1) {
        const share = Math.min(dmg * 0.35, pl.mana / 0.6);
        pl.mana -= share * 0.6; dmg -= share;
      }
      return dmg;
    },

    // ------------------------------------------------------------ the arcanist's wares
    // three pieces in each market, changing every three days; made only when bought
    stock(world, s, pl) {
      const lv = ECHO.Prowess ? ECHO.Prowess.level(pl) : 1, keys = Object.keys(RELICS);
      const rng = new ECHO.RNG(((s.id ? String(s.id).split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7) : 7) + Math.floor(world.day / 3) * 977) >>> 0);
      const out = [], used = new Set();
      for (let i = 0; i < 3; i++) {
        let k; do k = keys[rng.int(0, keys.length - 1)]; while (used.has(k)); used.add(k);
        const r = rng.next(), rarity = i === 2 && r < 0.35 ? 'epic' : r < 0.45 ? 'rare' : r < 0.85 ? 'fine' : 'common';
        out.push({ k, rarity, level: lv, seed: rng.int(1, 1e9) });
      }
      return out;
    },
    priceOf(o, am = 1) { return Math.round(A.value({ power: A.power(o.level, o.rarity), rarity: o.rarity }) * 2.4 * am); },
    bought(world, pl, s) { const k = 'arc' + (s.id || '') + ':' + Math.floor(world.day / 3); return pl.arcBought && pl.arcBought.k === k ? pl.arcBought.n : (pl.arcBought = { k, n: [] }).n; },
    buy(game, s, i, am = 1) {
      const world = game.world, pl = game.pl, o = A.stock(world, s, pl)[i];
      if (!o) return 'Gone.';
      const got = A.bought(world, pl, s);
      if (got.includes(i)) return 'Sold already.';
      const c = A.priceOf(o, am);
      if (pl.gold < c) return 'You cannot afford it.';
      pl.gold -= c; s.wealth = (s.wealth || 0) + c;
      const it = A.make(world, new ECHO.RNG(o.seed), o.level, o.rarity, `at the arcanist of ${s.name}`, o.k);
      it.holder = 'player'; pl.items.push(it.id); got.push(i);
      const on = A.onTake(pl, it);
      return { it, on };
    },
    marketHtml(world, pl, s, am = 1) {
      const got = A.bought(world, pl, s);
      return `<h4 class="ware-h">The arcanist</h4><p class="dim">Relics that wake with your mana — worn three at a time and used with Z, X and C. New pieces every three days.</p><div class="wares">${A.stock(world, s, pl).map((o, i) => {
        const D = RELICS[o.k], R = ECHO.Gear.rarity(o.rarity), p = A.power(o.level, o.rarity), c = A.priceOf(o, am), sold = got.includes(i);
        return `<div class="ware"><div class="ware-ic" style="color:${D.color}">${D.icon}</div><div class="ware-main"><div class="ware-top"><b style="color:${R.color}">${esc(R.name)} ${esc(D.name.toLowerCase())} ${esc(D.bases[0])}</b><span class="gold">${c} cr</span></div><div class="ware-use"><b style="color:${D.color}">${esc(D.what)}</b> — ${esc(D.desc(p))} <span class="dim">${D.mana} mana · rests ${D.cd} s.</span></div><div class="row"><button class="small" data-relic="${i}" ${sold || pl.gold < c ? 'disabled' : ''}>${sold ? 'Sold' : 'Buy'}</button></div></div></div>`;
      }).join('')}</div>`;
    },

    // ------------------------------------------------------------ the character page
    html(game) {
      const world = game.world, pl = game.pl, S = A.slots(pl);
      const mine = pl.items.map(id => world.items[id]).filter(it => it && it.kind === 'relic');
      const a = pl.arc || {};
      const slot = i => { const it = S[i] && world.items[S[i]]; const D = it && RELICS[it.relic]; return `<div class="card" style="margin:0"><div class="dim">${KEYS[i].toUpperCase()}</div>${it ? `<b style="color:${ECHO.Gear.rarity(it.rarity).color}">${D.icon} ${esc(it.name)}</b><div style="font-size:12px">${esc(A.line(it))}</div><div class="row"><button class="small" data-relic-off="${it.id}">Take off</button></div>` : '<span class="dim">empty</span>'}</div>`; };
      return `<h3 class="gold">Magical equipment</h3>
        <p class="dim" style="font-size:13px">Mana ${Math.round(pl.mana)}/${Math.round(pl.maxMana)} · grown by use <b style="color:#8fb8ff">+${A.bonus(pl)}</b> <span style="font-size:12px">(${Math.round(a.used || 0)} spent · ${Math.round((a.fight || 0) / 60)} min in battle)</span></p>
        <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px">${[0, 1, 2].map(slot).join('')}</div>
        ${mine.length ? `<div class="list">${mine.map(it => { const D = RELICS[it.relic], on = S.indexOf(it.id); return `<div class="card"><h4 style="color:${ECHO.Gear.rarity(it.rarity).color}">${D ? D.icon : ''} ${esc(it.name)}${on >= 0 ? ` <span class="gold">(on ${KEYS[on].toUpperCase()})</span>` : ''}</h4><div style="font-size:13px">${esc(A.line(it))}</div><div class="dim" style="font-size:13px">${esc(A.descOf(it))}</div><div class="row">${[0, 1, 2].map(i => `<button class="small" data-relic-on="${it.id}" data-slot="${i}" ${on === i ? 'disabled' : ''}>Wear on ${KEYS[i].toUpperCase()}</button>`).join('')}</div></div>`; }).join('')}</div>` : '<p class="dim">You carry no relics yet. They are found on what you kill — more often on the strong — and sold by the arcanist at a market.</p>'}`;
    },
    bind_(root, game, again) {
      const pl = game.pl;
      root.querySelectorAll('button[data-relic-on]').forEach(b => b.addEventListener('click', () => { A.wear(pl, b.dataset.relicOn, +b.dataset.slot); again(); }));
      root.querySelectorAll('button[data-relic-off]').forEach(b => b.addEventListener('click', () => { A.takeOff(pl, b.dataset.relicOff); again(); }));
    },
    // the three slots, at the foot of the screen
    hud(game) {
      const pl = game.pl, world = game.world, S = A.slots(pl);
      if (!S.some(Boolean)) return '';
      return S.map((id, i) => { const it = id && world.items[id], D = it && RELICS[it.relic]; if (!D) return ''; const left = Math.max(0, (A.cd[id] || 0) - game.time); return `<span style="color:${left > 0 || pl.mana < D.mana ? '#7a7a8a' : D.color}">${KEYS[i].toUpperCase()}·${it.relic}${left > 0 ? ' ' + Math.ceil(left) + 's' : ''}</span>`; }).join('') + (pl._barrierT > 0 ? `<span style="color:#ffe08a">▣ ${Math.round(pl._barrier)}</span>` : '');
    }
  };
})();
