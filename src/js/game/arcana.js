// Arcana: magical equipment, and the growth of your mana.
//
// Relics — rods, rings, amulets, boots, pendants, orbs, torcs — are worn in three slots
// (four from level 12, five from level 30). Each does two things:
//   • a passive gift, always on while you wear it and free: harder blows, less harm,
//     more life, quicker feet, life or mana that comes back, beasts that bite harder,
//     a deeper well of mana;
//   • a power that wakes BY ITSELF when the moment comes — lightning at the foe in
//     front of you, a frost nova when they crowd you, a barrier when you are hurt, a
//     bloom of healing when you are low — spending mana each time and then resting a
//     while. Z, X and C wake the first three by hand too, and any relic's waking can be
//     set to "by hand only" (Auto off).
// The rarer the piece, the stronger both: a legendary relic is about three times a
// common one of the same level, and its power does more (more leaps, a wider nova,
// more blades, more stars). They come from what you kill — far more often in the
// dungeons, and the strong carry the best: an elite something fine, a dungeon lord
// rare or better, a lair's beast or a titan epic or legendary — and from chests at
// the bottom of the deep places, and from the arcanist of a market (never legendary).
//
// Weapons may come with the Arcane property (each blow draws a little mana and
// strikes harder for it) and armour with Manaweave (blows that reach you are paid
// partly in mana instead of blood).
//
// Your mana grows with use: every point you spend, and every moment you stand in a
// fight, deepens the well — slowly, and without end.
(function () {
  const { U } = ECHO;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const KEYS = ['z', 'x', 'c'];
  const RANK = ['common', 'fine', 'rare', 'epic', 'legendary'];
  // how much stronger each rarity is (much more than for blades: a relic's rarity is the point of it)
  const RM = { common: 1, fine: 1.3, rare: 1.7, epic: 2.2, legendary: 2.9 };
  const UNLOCK = [0, 0, 0, 12, 30];      // the level each slot opens at
  const pl0 = () => ((ECHO.Game && ECHO.Game.pl) || {});
  const RELICS = {
    storm: { name: 'Stormcaller', icon: '⚡', color: '#9fd8ff', mana: 28, cd: 6, bases: ['rod', 'wand', 'sceptre'], what: 'Chain lightning', role: 'strike',
      desc: (p, t) => `Lightning leaps from the foe in front of you to ${3 + t} more near it, for ${p} each${t >= 4 ? ', and it stuns them' : ''}.`,
      pas: 'Static', pasText: v => `+${Math.round(v.dmg * 100)}% damage with blade and bow` },
    frost: { name: 'Rimeheart', icon: '❄', color: '#bfefff', mana: 24, cd: 9, bases: ['ring', 'band', 'signet'], what: 'Frost nova', role: 'crowd',
      desc: (p, t) => `A burst of killing cold ${(4 + t * 0.5).toFixed(1)} paces round you: ${Math.round(p * 0.8)} to everything in it, frozen where they stand for ${(2 + t * 0.4).toFixed(1)} s.`,
      pas: 'Rime ward', pasText: v => `${Math.round(v.taken * 100)}% less harm from every blow` },
    aegis: { name: 'Aegis', icon: '🛡', color: '#ffe08a', mana: 30, cd: 18, bases: ['amulet', 'locket', 'talisman'], what: 'Arcane barrier', role: 'guard',
      desc: (p, t) => `A shell of light that takes the next ${Math.round(Math.min(p * 3.5, (pl0().maxHp || 100) * (0.6 + 0.1 * t)))} of harm meant for you, for ${10 + 2 * t} s${t >= 3 ? '; when it breaks it bursts, for ' + p + ' to all near' : ''}.`,
      pas: 'Warding', pasText: v => `+${Math.round(v.hp)} life` },
    blink: { name: 'Wayfarer', icon: '➶', color: '#c8a8ff', mana: 16, cd: 3, bases: ['boots', 'sandals', 'greaves'], what: 'Blink', role: 'escape',
      desc: (p, t) => `Step through the air ${6 + t} paces — out of a ring of foes, over a gap — and nothing touches you in the step${t >= 2 ? `; where you stood bursts, for ${Math.round(p * 0.6)}` : ''}. (By itself: when you are near death with a foe on you.)`,
      pas: 'Fleetfoot', pasText: v => `+${Math.round(v.speed * 100)}% speed on foot` },
    bloom: { name: 'Lifebloom', icon: '❀', color: '#9fffb0', mana: 34, cd: 20, bases: ['pendant', 'charm', 'brooch'], what: 'Healing bloom', role: 'heal',
      desc: (p, t) => `Over four seconds ${Math.round((0.3 + 0.06 * t) * 100)}% of your life grows back; fire and poison are washed off you${t >= 3 ? ', and those fighting beside you are healed too' : ''}.`,
      pas: 'Verdance', pasText: v => `+${v.regen.toFixed(1)} life a second, even in a fight` },
    blades: { name: 'Spectral', icon: '✦', color: '#d8c8ff', mana: 36, cd: 16, bases: ['orb', 'prism', 'shard'], what: 'Spectral blades', role: 'aura',
      desc: (p, t) => `${A.bladeN(t)} ghostly blades circle you for ${10 + t} s and cut whatever comes close, for ${Math.round(p * 0.12 * A.bladeN(t))} twice a second.`,
      pas: 'Focus', pasText: v => `+${v.manaRegen.toFixed(1)} mana a second` },
    bind: { name: 'Beastbinder', icon: '⛓', color: '#ffcf6a', mana: 22, cd: 10, bases: ['torc', 'chain', 'collar'], what: 'Binding', role: 'hold',
      desc: (p, t) => `Chains of light hold a strong foe still for ${4 + t} s (and break its wind-up); while held it takes a third more harm from you. When you are taming (L), for twenty seconds it falls beaten instead of dying.`,
      pas: 'Kinship', pasText: v => `your beasts and companions hit ${Math.round(v.pets * 100)}% harder` },
    star: { name: 'Starfall', icon: '☄', color: '#ffb84a', mana: 50, cd: 14, bases: ['orb', 'star-glass', 'censer'], what: 'Starfall', role: 'blast',
      desc: (p, t) => `${A.starN(t) > 1 ? A.starN(t) + ' stars fall' : 'A star falls'} where the foes are thickest: ${Math.round(p * 2.4)} to everything within ${(3 + 0.4 * t).toFixed(1)} paces, and they burn.`,
      pas: 'Deep well', pasText: v => `+${Math.round(v.mana)} mana, +${Math.round(v.spell * 100)}% spell power` }
  };
  const PRE = { common: ['Plain', 'Old'], fine: ['Fine', 'Bright'], rare: ['Runed', 'Moonlit'], epic: ['Starforged', 'Dread'], legendary: ['Archmage\'s', 'Worldsong', 'Eldest'] };

  const A = ECHO.Arcana = {
    RELICS, KEYS, RANK, RM, UNLOCK,
    cd: {}, last: null, castAt: {}, fx: { bloomT: 0, bloomPer: 0, bladesT: 0, bladesTick: 0, bladesP: 0, bladesN: 3, falls: [], bursts: [] },
    reset() { A.cd = {}; A.last = null; A.castAt = {}; A._autoT = 0; A._lastAuto = -9; A.fx = { bloomT: 0, bloomPer: 0, bladesT: 0, bladesTick: 0, bladesP: 0, bladesN: 3, falls: [], bursts: [] }; },

    // ------------------------------------------------------------ the pieces
    tierOf(it) { const t = RANK.indexOf(it && it.rarity); return t < 0 ? 0 : t; },
    bladeN(t) { return 3 + (t >= 2 ? 1 : 0) + (t >= 4 ? 1 : 0); },
    starN(t) { return 1 + (t >= 3 ? 1 : 0) + (t >= 4 ? 1 : 0); },
    power(level, rarity) { return Math.round((14 + Math.max(1, level) * 3.2) * (RM[rarity] || 1)); },
    // a relic's power (a relic from before relics grew stronger is brought up to the new
    // measure the first time it is looked at — nothing it was is lost)
    pw(it) { if (!it) return 0; if (it.rv !== 2) { it.power = A.power(it.level || 1, it.rarity); it.rv = 2; } return it.power; },
    make(world, rng, level, rarity, where, kind) {
      const keys = Object.keys(RELICS), k = kind || keys[rng.int(0, keys.length - 1)], D = RELICS[k];
      const pre = PRE[rarity] || PRE.common;
      const name = `${pre[rng.int(0, pre.length - 1)]} ${D.name.toLowerCase()} ${D.bases[rng.int(0, D.bases.length - 1)]}`;
      const it = ECHO.Character.makeItem(world, { kind: 'relic', name: U.cap(name), dmg: 0, holder: null, history: [{ d: world.day, t: where ? `found ${where}` : 'found' }] });
      it.relic = k; it.rarity = rarity; it.level = Math.max(1, Math.round(level)); it.plus = 0; it.power = A.power(it.level, rarity); it.rv = 2;
      return it;
    },
    // how many slots you have open (three, four from level 12, five from level 30)
    nslots(pl) { const L = ECHO.Prowess ? ECHO.Prowess.level(pl) : 1; return UNLOCK.filter(u => L >= u).length; },
    slots(pl) {
      if (!Array.isArray(pl.relics)) {
        // (an old stone circle once wrote a count here and the slots were lost: take back what can be read)
        const ids = typeof pl.relics === 'string' ? pl.relics.split(',') : [], W = ECHO.Game && ECHO.Game.world;
        pl.relics = [null, null, null];
        let i = 0;
        for (const id of ids) if (i < 3 && W && W.items[id] && W.items[id].kind === 'relic' && (pl.items || []).includes(id)) pl.relics[i++] = id;
      }
      while (pl.relics.length < UNLOCK.length) pl.relics.push(null);
      return pl.relics;
    },
    worn(pl, id) { return !!id && Array.isArray(pl.relics) && pl.relics.indexOf(id) >= 0 && pl.relics.indexOf(id) < A.nslots(pl); },
    keyName(i) { return KEYS[i] ? KEYS[i].toUpperCase() : String(i + 1); },
    line(it) { const D = RELICS[it.relic]; return D ? `${D.what} · ${D.mana} mana · rests ${D.cd} s · power ${A.pw(it)}` : 'relic'; },
    // what it does in your hands now (your strength behind it)
    eff(p) { const pl = ECHO.Game && ECHO.Game.pl; return Math.round(p * (pl && ECHO.Prowess ? ECHO.Prowess.dmgMult(pl) : 1)); },
    descOf(it) { const D = RELICS[it.relic]; return D ? D.desc(A.eff(A.pw(it)), A.tierOf(it)) : ''; },
    passText(it) { const D = RELICS[it.relic]; return D ? `${D.pas}: ${D.pasText(A.gift(it))}` : ''; },
    // what it is worth to a buyer (by its level and rarity, as gear is; its new strength
    // does not make the markets dearer)
    value(it) { const R = ECHO.Gear.rarity(it.rarity); return Math.round((10 + Math.max(1, it.level || 1) * 2.6) * R.mult * 2.6 * R.mult + 30); },
    // put on in the first free open slot (or the given one)
    wear(pl, id, slot) {
      const S = A.slots(pl), n = A.nslots(pl);
      const i0 = S.indexOf(id); if (i0 >= 0) S[i0] = null;
      let i = slot != null ? slot : S.indexOf(null);
      if (i >= n) i = S.slice(0, n).indexOf(null);
      if (i < 0 || i >= n) { if (i0 >= 0) S[i0] = id; return false; }
      S[i] = id;
      if (ECHO.PlayerCtl) ECHO.PlayerCtl.derivedT = 0;
      return true;
    },
    takeOff(pl, id) { const S = A.slots(pl); const i = S.indexOf(id); if (i >= 0) S[i] = null; if (ECHO.PlayerCtl) ECHO.PlayerCtl.derivedT = 0; },
    // a new relic picked up goes on if there is room
    onTake(pl, it) { if (it.kind === 'relic' && A.slots(pl).slice(0, A.nslots(pl)).indexOf(null) >= 0) { A.wear(pl, it.id); return true; } return false; },
    // the best you carry, one of each kind first
    best(pl, world) {
      const mine = (pl.items || []).map(id => world.items[id]).filter(it => it && it.kind === 'relic' && RELICS[it.relic]);
      mine.sort((a, b) => (A.tierOf(b) * 1e5 + A.pw(b)) - (A.tierOf(a) * 1e5 + A.pw(a)));
      const n = A.nslots(pl), pick = [], kinds = new Set();
      for (const it of mine) if (pick.length < n && !kinds.has(it.relic)) { pick.push(it); kinds.add(it.relic); }
      for (const it of mine) if (pick.length < n && !pick.includes(it)) pick.push(it);
      const S = A.slots(pl);
      for (let i = 0; i < S.length; i++) S[i] = null;
      pick.forEach((it, i) => { S[i] = it.id; });
      if (ECHO.PlayerCtl) ECHO.PlayerCtl.derivedT = 0;
      return pick.length;
    },
    wornItems(pl, world) { const S = A.slots(pl), n = A.nslots(pl), out = []; for (let i = 0; i < n; i++) { const it = S[i] && world.items[S[i]]; if (it && RELICS[it.relic]) out.push({ it, i }); } return out; },

    // ------------------------------------------------------------ the passive gifts
    // what one relic gives, always, while worn
    gift(it) {
      const t = A.tierOf(it), L = Math.max(1, it.level || 1), v = { dmg: 0, taken: 0, hp: 0, speed: 0, regen: 0, manaRegen: 0, pets: 0, mana: 0, spell: 0 };
      switch (it.relic) {
        case 'storm': v.dmg = 0.06 + 0.04 * t; break;
        case 'frost': v.taken = 0.05 + 0.03 * t; break;
        case 'aegis': v.hp = 12 + 8 * t + L * 0.8; break;
        case 'blink': v.speed = 0.04 + 0.025 * t; break;
        case 'bloom': v.regen = 0.6 + 0.4 * t + L * 0.03; break;
        case 'blades': v.manaRegen = 1 + 0.6 * t; break;
        case 'bind': v.pets = 0.1 + 0.06 * t; break;
        case 'star': v.mana = 15 + 10 * t + L * 0.5; v.spell = 0.05 + 0.03 * t; break;
      }
      return v;
    },
    // everything you wear, together
    passive(pl) {
      const world = ECHO.Game && ECHO.Game.world, v = { dmg: 0, taken: 0, hp: 0, speed: 0, regen: 0, manaRegen: 0, pets: 0, mana: 0, spell: 0 };
      if (!pl || !world) return v;
      for (const { it } of A.wornItems(pl, world)) { const g = A.gift(it); for (const k in v) v[k] += g[k]; }
      v.taken = Math.min(0.45, v.taken); v.speed = Math.min(0.3, v.speed);
      return v;
    },
    passiveSummary(pl) {
      const v = A.passive(pl), out = [];
      if (v.dmg) out.push(`+${Math.round(v.dmg * 100)}% blade and bow damage`);
      if (v.taken) out.push(`−${Math.round(v.taken * 100)}% harm taken`);
      if (v.hp) out.push(`+${Math.round(v.hp)} life`);
      if (v.speed) out.push(`+${Math.round(v.speed * 100)}% speed`);
      if (v.regen) out.push(`+${v.regen.toFixed(1)} life/s`);
      if (v.manaRegen) out.push(`+${v.manaRegen.toFixed(1)} mana/s`);
      if (v.mana) out.push(`+${Math.round(v.mana)} mana`);
      if (v.spell) out.push(`+${Math.round(v.spell * 100)}% spell power`);
      if (v.pets) out.push(`beasts +${Math.round(v.pets * 100)}%`);
      return out;
    },
    // into your derived stats (player.js asks once a second, and at once when you change what you wear)
    applyDerived(game, D) {
      const v = A.passive(game.pl);
      D.maxHp += v.hp; D.maxMana += v.mana; D.speed *= 1 + v.speed;
      D.meleeDmg *= 1 + v.dmg; D.bowDmg *= 1 + v.dmg; D.flameDmg *= 1 + v.spell;
      D.relicRegen = v.regen; D.relicMana = v.manaRegen;
    },

    // ------------------------------------------------------------ the well of mana
    bonus(pl) { const a = pl.arc; if (!a) return 0; return Math.min(300, Math.floor(1.6 * Math.sqrt(a.used || 0) + 1.2 * Math.sqrt(a.fight || 0))); },   // (deep, but not bottomless)
    regenBonus(pl) { return A.bonus(pl) * 0.015 + ((ECHO.PlayerCtl && ECHO.PlayerCtl.derived && ECHO.PlayerCtl.derived.relicMana) || 0); },
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
      if (F.bloomT > 0) {
        F.bloomT -= dt; pl.hp = Math.min(pl.maxHp, pl.hp + F.bloomPer * dt); pe.hp = pl.hp;
        if (F.bloomAll) for (const e of game.ents) if (!e.dead && e !== pe && (e.isCompanion || e.tamed || e.pal) && U.dist(e.x, e.y, pe.x, pe.y) < 8) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * F.bloomFrac / 4 * dt);
        if (Math.random() < dt * 12) ECHO.Combat.fx.push({ kind: 'p', x: pe.x + (Math.random() - 0.5) * 1.2, y: pe.y - 0.2, vx: 0, vy: -0.8, t: 0, life: 0.8, color: '#9fffb0', size: 2 });
      }
      if (F.bladesT > 0) {
        F.bladesT -= dt; F.bladesTick -= dt;
        const n = F.bladesN || 3, rad = 1.3 + n * 0.08;
        for (let i = 0; i < n; i++) { const a = game.time * 5 + i * Math.PI * 2 / n; if (Math.random() < dt * 40) ECHO.Combat.fx.push({ kind: 'p', x: pe.x + Math.cos(a) * rad, y: pe.y + Math.sin(a) * rad - 0.4, vx: 0, vy: 0, t: 0, life: 0.25, color: '#d8c8ff', size: 3 }); }
        if (F.bladesTick <= 0) { F.bladesTick = 0.5; for (const e of A.foes(game, pe.x, pe.y, rad + 0.7)) ECHO.Combat.damage(e, F.bladesP * 0.12 * n, { type: 'magic', from: pe, angle: Math.atan2(e.y - pe.y, e.x - pe.x), arcana: true }); }
      }
      for (const f of F.falls) {
        f.t -= dt;
        if (Math.random() < dt * 30) ECHO.Combat.fx.push({ kind: 'p', x: f.x + (Math.random() - 0.5) * 0.4, y: f.y - 6 * Math.max(0, f.t), vx: 0, vy: 3, t: 0, life: 0.3, color: '#ffb84a', size: 3 });
        if (f.t <= 0 && !f.done) {
          f.done = true;
          const C = ECHO.Combat, R = f.r || 3;
          C.burst(f.x, f.y, '#ffb84a', 40, 6, 0.8, 3); C.burst(f.x, f.y, '#fff0c8', 20, 3, 0.6, 2); C.ring(f.x, f.y, R, 'rgba(255,184,74,0.9)', 0.5);
          if (ECHO.Loose) ECHO.Loose.blast(f.x, f.y, R, { fire: true, power: 1.4, by: game.pe });
          C.puff(f.x, f.y, { h: 0.6, vz: 0.6, g: 0, life: 0.4, size: 26, color: '#ffc87a', glow: true, flash: true, grow: 1.8 });
          C.decal(f.x, f.y, 'scorch', R * 0.75, 16);
          game.shake(0.45); game.light(f.x, f.y, 9, 1, '#ffb84a', 0.35);
          if (ECHO.Sfx) ECHO.Sfx.play('explode', { pitch: 0.7 });
          for (const e of A.foes(game, f.x, f.y, R)) { C.damage(e, f.p * 2.4, { type: 'magic', from: pe, angle: Math.atan2(e.y - f.y, e.x - f.x), knock: 3, arcana: true }); if (!e.dead) { e.burn = Math.max(e.burn || 0, 2); e.burnFrom = pe; } }
        }
      }
      F.falls = F.falls.filter(f => !f.done);
      A.autoTick(game, dt);
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
    big(e) { return e.type === 'boss' || e.boss2 || e.lord; },
    strong(e) { return A.big(e) || e.elite || e.sovereign || e.apexId; },

    // ------------------------------------------------------------ waking by itself
    // When the moment comes (each relic knows its own), a worn relic set to Auto wakes
    // without a key: one at a time, never two in the same breath, and the ones that strike
    // keep a little mana back for your fire.
    want: {
      storm(game, foes) {
        const pe = game.pe, L = ECHO.PlayerCtl.lock;
        const t = L && !L.dead && foes.includes(L) && U.dist(L.x, L.y, pe.x, pe.y) < 9 ? L : foes.filter(e => U.dist(e.x, e.y, pe.x, pe.y) < 8.5).sort((a, b) => U.dist(a.x, a.y, pe.x, pe.y) - U.dist(b.x, b.y, pe.x, pe.y))[0];
        return t ? { aim: Math.atan2(t.y - pe.y, t.x - pe.x) } : null;
      },
      frost(game, foes) {
        const pe = game.pe, pl = game.pl, near = foes.filter(e => U.dist(e.x, e.y, pe.x, pe.y) < 3.3);
        return near.length >= 2 || (near.length && (A.strong(near[0]) || pl.hp < pl.maxHp * 0.5)) ? { aim: 0 } : null;
      },
      aegis(game, foes) {
        const pe = game.pe, pl = game.pl;
        if (pl._barrierT > 0) return null;
        const near = foes.filter(e => U.dist(e.x, e.y, pe.x, pe.y) < 6);
        return near.length && (pl.hp < pl.maxHp * 0.7 || near.length >= 3 || near.some(A.strong)) ? { aim: 0, guard: true } : null;
      },
      blink(game, foes) {
        const pe = game.pe, pl = game.pl;
        if (pl.mounted || pl.hp > pl.maxHp * 0.3 || pe.iframes > 0) return null;
        const near = foes.filter(e => U.dist(e.x, e.y, pe.x, pe.y) < 4);
        if (!near.some(e => U.dist(e.x, e.y, pe.x, pe.y) < 2.2)) return null;
        const cx = near.reduce((s, e) => s + e.x, 0) / near.length, cy = near.reduce((s, e) => s + e.y, 0) / near.length;
        return { aim: Math.atan2(pe.y - cy, pe.x - cx), guard: true };
      },
      bloom(game, foes) {
        const pe = game.pe, pl = game.pl;
        if (A.fx.bloomT > 0) return null;
        return pl.hp < pl.maxHp * 0.45 || ((pe.burn > 0 || pl.poisonT > 0) && pl.hp < pl.maxHp * 0.7) ? { aim: 0, guard: true } : null;
      },
      blades(game, foes) {
        const pe = game.pe;
        return A.fx.bladesT <= 0 && foes.some(e => U.dist(e.x, e.y, pe.x, pe.y) < 3.5) ? { aim: 0 } : null;
      },
      bind(game, foes) {
        const pe = game.pe;
        const t = foes.filter(e => U.dist(e.x, e.y, pe.x, pe.y) < 8 && !(e._bound > game.time) && (A.strong(e) || e.state === 'windup')).sort((a, b) => (b.state === 'windup') - (a.state === 'windup') || U.dist(a.x, a.y, pe.x, pe.y) - U.dist(b.x, b.y, pe.x, pe.y))[0];
        return t ? { aim: Math.atan2(t.y - pe.y, t.x - pe.x), target: t } : null;
      },
      star(game, foes) {
        const pe = game.pe;
        let best = null, bs = 0;
        for (const f of foes) {
          if (U.dist(f.x, f.y, pe.x, pe.y) > 9.5) continue;
          const s = foes.filter(e => U.dist(e.x, e.y, f.x, f.y) < 3).length + (A.strong(f) ? 2 : 0);
          if (s > bs) { bs = s; best = f; }
        }
        return best && bs >= 2 ? { aim: Math.atan2(best.y - pe.y, best.x - pe.x), at: { x: best.x, y: best.y } } : null;
      }
    },
    autoTick(game, dt) {
      const pl = game.pl, pe = game.pe;
      A._autoT = (A._autoT || 0) - dt;
      if (A._autoT > 0) return;
      A._autoT = 0.2;
      if (pl.flying || pe.swimming || (ECHO.UI && ECHO.UI.blocksWorld && ECHO.UI.blocksWorld()) || (ECHO.PlayerCtl && ECHO.PlayerCtl.sneaking)) return;
      if (game.time - (A._lastAuto != null ? A._lastAuto : -9) < 0.6) return;
      const worn = A.wornItems(pl, game.world);
      if (!worn.length) return;
      const foes = A.foes(game, pe.x, pe.y, 11);
      if (!foes.length) return;
      // the ones that keep you alive first
      worn.sort((a, b) => (RELICS[b.it.relic].role === 'heal' || RELICS[b.it.relic].role === 'guard' || RELICS[b.it.relic].role === 'escape') - (RELICS[a.it.relic].role === 'heal' || RELICS[a.it.relic].role === 'guard' || RELICS[a.it.relic].role === 'escape'));
      for (const { it, i } of worn) {
        if (it.auto === false) continue;
        const D = RELICS[it.relic];
        if ((A.cd[it.id] || 0) > game.time) continue;
        const plan = A.want[it.relic](game, foes, it);
        if (!plan) continue;
        if (pl.mana < D.mana + (plan.guard ? 0 : pl.maxMana * 0.12)) continue;
        if (A.use(game, i, plan.aim, plan, true)) { A._lastAuto = game.time; break; }
      }
    },

    // ------------------------------------------------------------ waking a relic
    use(game, slot, aim, plan, auto) {
      const pl = game.pl, pe = game.pe, world = game.world, C = ECHO.Combat;
      const id = A.slots(pl)[slot], it = id && slot < A.nslots(pl) && world.items[id];
      if (!it || it.kind !== 'relic' || !RELICS[it.relic]) { if (auto) return false; C.floater(pe.x, pe.y - 1.2, `no relic on ${A.keyName(slot)}`, '#c8c0b0'); if (!pl.tips || !pl.tips.relic0) { pl.tips = pl.tips || {}; pl.tips.relic0 = 1; game.ui.toast('Relics — rods, rings, amulets and the like — are worn from your character page (K) or the relics page (I). Each gives a gift that is always on, and a power that wakes by itself when it is needed (Z, X and C wake them by hand). Find them on what you kill — above all in dungeons and on the strong — or buy them from the arcanist at a market.', 'study', 9); } return false; }
      if (pe.swimming) return false;
      if (pl.flying && it.relic === 'blink') return false;   // (no stepping through the air from a dragon's back)
      const D = RELICS[it.relic], t = A.tierOf(it);
      const left = (A.cd[id] || 0) - game.time;
      if (left > 0) { if (!auto) C.floater(pe.x, pe.y - 1.2, `${D.what}: ${left.toFixed(1)} s`, '#c8c0b0'); return false; }
      if (pl.mana < D.mana) { if (!auto) C.floater(pe.x, pe.y - 1.2, `not enough mana (${D.mana})`, '#8fb8ff'); return false; }
      const v = A.passive(pl);
      const P = A.pw(it) * (0.85 + (pl.skills.flame || 0) / 120) * (pl.buffs && pl.buffs.might > 0 ? 1.33 : 1) * (ECHO.Prowess ? ECHO.Prowess.dmgMult(pl) : 1) * (1 + v.spell);   // (your strength behind it, as behind your blade)
      const ok = A[it.relic](game, P, aim, it, plan || {}, t, auto);
      if (ok === false) return false;
      pl.mana -= D.mana; pe.mana = pl.mana;
      A.cd[id] = game.time + D.cd; A.castAt[id] = game.time;
      ECHO.Character.train(pl, 'flame', 0.12);
      if (auto) C.floater(pe.x, pe.y - 2.05, `${D.icon} ${D.what}`, D.color);
      if (auto && (!pl.tips || !pl.tips.relicAuto)) { pl.tips = pl.tips || {}; pl.tips.relicAuto = 1; game.ui.toast(`Your ${it.name.toLowerCase()} woke by itself (${D.what}, ${D.mana} mana). Relics wake when the moment comes; Z, X and C still wake them by hand, and each can be set to by-hand-only on the relics page (I).`, 'study', 8); }
      if (game.combatT == null || game.time - game.combatT > 4) { /* used out of a fight */ } else game.combatT = game.time;
      return true;
    },
    storm(game, P, aim, it, plan, t) {
      const pe = game.pe, C = ECHO.Combat;
      let cur = A.aimed(game, aim, 9);
      if (!cur) { C.floater(pe.x, pe.y - 1.2, 'nothing to strike', '#c8c0b0'); return false; }
      const hit = new Set(); let from = { x: pe.x, y: pe.y };
      for (let n = 0; n < 4 + t && cur; n++) {
        hit.add(cur);
        C.fx.push({ kind: 'arc', x: from.x, y: from.y, x2: cur.x, y2: cur.y, h: 0.9, t: 0, life: 0.35, color: '#9fd8ff' });
        C.fx.push({ kind: 'arc', x: from.x, y: from.y, x2: cur.x, y2: cur.y, h: 0.9, t: 0, life: 0.25, color: '#ffffff' });
        C.damage(cur, P * (n ? 0.85 : 1), { type: 'magic', from: pe, angle: Math.atan2(cur.y - from.y, cur.x - from.x), stagger: t >= 4 ? 0.7 : 0.3, arcana: true });
        C.burst(cur.x, cur.y, '#9fd8ff', 10, 3, 0.4, 2);
        from = { x: cur.x, y: cur.y };
        const c0 = cur; cur = A.foes(game, c0.x, c0.y, 5 + t * 0.5).filter(e => !hit.has(e)).sort((a, b) => U.dist(a.x, a.y, c0.x, c0.y) - U.dist(b.x, b.y, c0.x, c0.y))[0];
      }
      game.light(pe.x, pe.y, 6, 0.9, '#9fd8ff', 0.2);
      if (ECHO.Sfx) ECHO.Sfx.play('fireRelease', { pitch: 1.9 });
      return true;
    },
    frost(game, P, aim, it, plan, t) {
      const pe = game.pe, C = ECHO.Combat, R = 4 + t * 0.5, fr = 2 + t * 0.4;
      C.ring(pe.x, pe.y, R, 'rgba(190,240,255,0.95)', 0.5); C.ring(pe.x, pe.y, R * 0.66, 'rgba(255,255,255,0.8)', 0.35);
      if (ECHO.Loose) ECHO.Loose.blast(pe.x, pe.y, R * 0.6, { power: 0.8, by: pe });
      C.burst(pe.x, pe.y, '#bfefff', 40 + t * 8, 6, 0.7, 3);
      for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; C.puff(pe.x + Math.cos(a) * R * 0.6, pe.y + Math.sin(a) * R * 0.6, { h: 0.3, vz: 0.4, g: 0, life: 0.7, size: 7, color: '#e8f8ff', glow: true }); }
      for (const e of A.foes(game, pe.x, pe.y, R)) {
        C.damage(e, P * 0.8, { type: 'magic', from: pe, angle: Math.atan2(e.y - pe.y, e.x - pe.x), arcana: true });
        if (!e.dead) { e.stagger = Math.max(e.stagger || 0, A.big(e) ? fr * 0.5 : fr); e.state = e.state === 'subdued' ? e.state : 'stagger'; e.wcast = null; C.burst(e.x, e.y, '#e8f8ff', 8, 1, 0.8, 2); }
      }
      game.light(pe.x, pe.y, 7, 0.8, '#bfefff', 0.3);
      if (ECHO.Sfx) ECHO.Sfx.play('fireRelease', { pitch: 0.6 });
      return true;
    },
    aegis(game, P, aim, it, plan, t) {
      const pl = game.pl, pe = game.pe;
      pl._barrier = Math.round(Math.min(P * 3.5, pl.maxHp * (0.6 + 0.1 * t))); pl._barrierT = 10 + 2 * t; pl._barrierBurst = t >= 3 ? P : 0;
      ECHO.Combat.ring(pe.x, pe.y, 1.3, 'rgba(255,224,138,0.95)', 0.6); ECHO.Combat.burst(pe.x, pe.y, '#ffe08a', 18, 2, 0.6, 2);
      ECHO.Combat.floater(pe.x, pe.y - 1.4, `barrier · ${pl._barrier}`, '#ffe08a', true);
      if (ECHO.Sfx) ECHO.Sfx.play('heal', { pitch: 0.7 });
      return true;
    },
    blink(game, P, aim, it, plan, t) {
      const pe = game.pe, pl = game.pl, world = game.world, C = ECHO.Combat;
      const x0 = pe.x, y0 = pe.y, steps = 4 * (6 + t);
      C.burst(x0, y0, '#c8a8ff', 16, 3, 0.4, 2);
      for (let i = 0; i < steps; i++) ECHO.Ent.move(world, pe, Math.cos(aim) * 0.25, Math.sin(aim) * 0.25);
      if (U.dist(x0, y0, pe.x, pe.y) < 0.5) { if (!plan.guard) C.floater(pe.x, pe.y - 1.2, 'no room', '#c8c0b0'); return false; }
      pl.x = pe.x; pl.y = pe.y;
      pe.iframes = Math.max(pe.iframes || 0, 0.4);
      for (let k = 0; k <= 6; k++) { const f = k / 6; C.fx.push({ kind: 'p', x: U.lerp(x0, pe.x, f), y: U.lerp(y0, pe.y, f) - 0.5, vx: 0, vy: -0.3, t: 0, life: 0.4, color: '#c8a8ff', size: 3 }); }
      C.burst(pe.x, pe.y, '#c8a8ff', 16, 3, 0.4, 2);
      if (t >= 2) {
        C.ring(x0, y0, 2.5, 'rgba(200,168,255,0.9)', 0.4);
        for (const e of A.foes(game, x0, y0, 2.5)) C.damage(e, P * 0.6, { type: 'magic', from: pe, angle: Math.atan2(e.y - y0, e.x - x0), knock: 1.5, arcana: true });
      }
      if (ECHO.Sfx) ECHO.Sfx.play('dodge', { pitch: 1.5 });
      return true;
    },
    bloom(game, P, aim, it, plan, t) {
      const pl = game.pl, pe = game.pe, frac = 0.3 + 0.06 * t;
      A.fx.bloomT = 4; A.fx.bloomPer = pl.maxHp * frac / 4; A.fx.bloomFrac = frac; A.fx.bloomAll = t >= 3;
      pe.burn = 0; pl.poisonT = 0; pl.poisonDps = 0;
      ECHO.Combat.ring(pe.x, pe.y, t >= 3 ? 4 : 1.6, 'rgba(160,255,176,0.9)', 0.6); ECHO.Combat.burst(pe.x, pe.y, '#9fffb0', 20, 2, 0.7, 2);
      if (ECHO.Sfx) ECHO.Sfx.play('heal');
      return true;
    },
    blades(game, P, aim, it, plan, t) {
      A.fx.bladesT = 10 + t; A.fx.bladesTick = 0; A.fx.bladesP = P; A.fx.bladesN = A.bladeN(t);
      ECHO.Combat.ring(game.pe.x, game.pe.y, 1.4, 'rgba(216,200,255,0.9)', 0.5);
      if (ECHO.Sfx) ECHO.Sfx.play('fireCharge', { pitch: 1.6 });
      return true;
    },
    bind(game, P, aim, it, plan, t) {
      const pe = game.pe, C = ECHO.Combat;
      const e = plan.target && !plan.target.dead ? plan.target : A.aimed(game, aim, 9);
      if (!e) { C.floater(pe.x, pe.y - 1.2, 'nothing to bind', '#c8c0b0'); return false; }
      e._bound = game.time + 20; e._held = game.time + 4 + t;
      e.stagger = Math.max(e.stagger || 0, A.big(e) ? (4 + t) * 0.5 : 4 + t); e.state = 'stagger'; e.wcast = null; e.moving = false;
      for (let i = 0; i < 3; i++) C.fx.push({ kind: 'arc', x: pe.x, y: pe.y, x2: e.x + (Math.random() - 0.5) * 0.6, y2: e.y + (Math.random() - 0.5) * 0.6, h: 0.6, t: 0, life: 0.6, color: '#ffcf6a' });
      C.ring(e.x, e.y, (e.r || 0.4) + 1, 'rgba(255,207,106,0.95)', 0.7);
      C.floater(e.x, e.y - 1.6 * (e.scale || 1), 'bound', '#ffcf6a', true);
      if (ECHO.Sfx) ECHO.Sfx.play('growl', { pitch: 0.6 });
      return true;
    },
    star(game, P, aim, it, plan, t) {
      const pe = game.pe, L = ECHO.PlayerCtl.lock;
      let x, y;
      if (plan.at) { x = plan.at.x; y = plan.at.y; }
      else if (L && !L.dead) { x = L.x; y = L.y; }
      else { const mouse = game.screenToWorld(ECHO.Input.mx, ECHO.Input.my), d = U.clamp(U.dist(mouse.x, mouse.y, pe.x, pe.y), 2, 10); x = pe.x + Math.cos(aim) * d; y = pe.y + Math.sin(aim) * d; }
      const R = 3 + 0.4 * t, n = A.starN(t);
      for (let k = 0; k < n; k++) {
        const a = k * 2.4, d = k ? 1.8 : 0;
        A.fx.falls.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, t: 1 + k * 0.35, p: k ? P * 0.6 : P, r: k ? R * 0.8 : R });
      }
      ECHO.Combat.ring(x, y, R, 'rgba(255,184,74,0.7)', 1);
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
    // what your beasts and companions deal, with a Beastbinder on
    pets(game) { return 1 + A.passive(game.pl).pets; },
    // Rime ward, a barrier, then Manaweave armour: what reaches you is lessened, paid first in
    // light, then partly in mana.
    taken(game, dmg) {
      const pl = game.pl, pe = game.pe;
      const ward = A.passive(pl).taken;
      if (ward > 0 && dmg > 0) dmg *= 1 - ward;
      if (pl._barrier > 0 && pl._barrierT > 0 && dmg > 0) {
        const a = Math.min(dmg, pl._barrier); pl._barrier -= a; dmg -= a;
        ECHO.Combat.floater(pe.x - 0.3, pe.y - 1.0, `▣ ${Math.round(a)}`, '#ffe08a');
        if (pl._barrier <= 0) {
          pl._barrierT = 0; ECHO.Combat.burst(pe.x, pe.y, '#ffe08a', 14, 3, 0.4, 2); ECHO.Combat.floater(pe.x, pe.y - 1.3, 'the barrier breaks', '#ffe08a');
          if (pl._barrierBurst > 0) {
            ECHO.Combat.ring(pe.x, pe.y, 3, 'rgba(255,224,138,0.95)', 0.5);
            for (const e of A.foes(game, pe.x, pe.y, 3)) ECHO.Combat.damage(e, pl._barrierBurst, { type: 'magic', from: pe, angle: Math.atan2(e.y - pe.y, e.x - pe.x), knock: 2, arcana: true });
            pl._barrierBurst = 0;
          }
        }
      }
      const ar = pl.armor && game.world.items[pl.armor];
      if (ar && ar.affix === 'manaweave' && dmg > 0 && pl.mana > 1) {
        const share = Math.min(dmg * 0.35, pl.mana / 0.6);
        pl.mana -= share * 0.6; dmg -= share;
      }
      return dmg;
    },

    // ------------------------------------------------------------ where they come from
    atLeast(r, floor) { return floor && RANK.indexOf(floor) > RANK.indexOf(r) ? floor : r; },
    // how strong a thing was, for what it carries: 1 the common run, 2 an elite, 3 a lord of
    // the deep places (or a beast that has grown fat beyond a gate), 4 a lair's beast, a deep
    // wood's lord, a titan, 5 a sovereign beyond a gate
    might(e) { const m = e.sovereign ? 5 : (e.lord || e.type === 'boss' || e.titan) ? 4 : (e.boss2 || e.apexId) ? 3 : e.elite ? 2 : 1; return e.evo >= 4 ? Math.max(m, 3) : e.evo >= 3 ? Math.max(m, 2) : m; },   // (an evolved monster carries better)
    rarityFor(rng, level, might, delve) {
      const boost = [0, 0, 10, 24, 40, 60][might] + (delve ? 8 : 0);
      const r = ECHO.Gear.rollRarity(rng, level, boost);
      const floor = [null, null, 'fine', level >= 25 ? 'epic' : 'rare', rng.next() < 0.4 ? 'legendary' : 'epic', 'legendary'][might];
      return A.atLeast(r, floor);
    },
    // a relic left on the ground (o: { rarity | boost, floor, kind, where })
    drop(game, x, y, level, o = {}) {
      const world = game.world, rng = new ECHO.RNG((Math.random() * 4294967295) >>> 0);
      const rarity = A.atLeast(o.rarity || ECHO.Gear.rollRarity(rng, level, o.boost || 0), o.floor);
      const it = A.make(world, rng, level, rarity, o.where, o.kind);
      game.dropItem(it.id, x, y);
      const R = ECHO.Gear.rarity(rarity), D = RELICS[it.relic];
      ECHO.Combat.floater(x, y - 1.6, `${D.icon} ${R.name.toLowerCase()} relic!`, R.color, rarity === 'epic' || rarity === 'legendary');
      ECHO.Combat.ring(x, y, 1.4, R.color, 1);
      if (game.light) game.light(x, y, 5, 0.8, D.color, 0.6);
      if ((rarity === 'legendary' || rarity === 'epic') && ECHO.Music) ECHO.Music.stinger('star');
      return it;
    },
    // what a kill leaves: in the dungeons far more often, and the strong carry the best
    fromKill(game, e, level) {
      if (e.summoner || e._tamedNow) return [];
      const m = A.might(e), delve = !!(e.delve || (ECHO.Interior && ECHO.Interior.cur)), r = Math.random;
      const ch = m >= 4 ? 1 : m === 3 ? 0.85 : m === 2 ? (delve ? 0.3 : 0.16) : delve ? Math.min(0.1, 0.045 + level * 0.0015) : Math.min(0.03, 0.01 + level * 0.0005);
      if (r() >= ch) return [];
      const n = 1 + (m >= 4 && r() < 0.5 ? 1 : 0) + (m >= 5 ? 1 : 0), out = [];
      const where = `on ${e.label || (e.species && ECHO.Monsters && ECHO.Monsters.DEFS[e.species] ? 'a ' + ECHO.Monsters.DEFS[e.species].name.toLowerCase() : 'a foe')}`;
      for (let k = 0; k < n; k++) {
        const rng = new ECHO.RNG((r() * 4294967295) >>> 0);
        out.push(A.drop(game, e.x + (r() - 0.5) * 1.2, e.y + (r() - 0.5) * 1.2, level, { rarity: A.rarityFor(rng, level, m, delve), where }));
      }
      if (out.length && ECHO.Monsters && ECHO.Monsters.tip) ECHO.Monsters.tip(game, 'relic');
      return out;
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
    priceOf(o, am = 1) { return Math.round(A.value({ level: o.level, rarity: o.rarity }) * 2.4 * am); },
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
      return `<h4 class="ware-h">The arcanist</h4><p class="dim">Relics: a gift that is always on while you wear one, and a power that wakes by itself when the moment comes, spending mana (Z, X and C wake them by hand). New pieces every three days — the greatest are never sold, only taken from the strong.</p><div class="wares">${A.stock(world, s, pl).map((o, i) => {
        const D = RELICS[o.k], R = ECHO.Gear.rarity(o.rarity), p = A.power(o.level, o.rarity), c = A.priceOf(o, am), sold = got.includes(i), t = RANK.indexOf(o.rarity);
        return `<div class="ware"><div class="ware-ic" style="color:${D.color}">${D.icon}</div><div class="ware-main"><div class="ware-top"><b style="color:${R.color}">${esc(R.name)} ${esc(D.name.toLowerCase())} ${esc(D.bases[0])}</b><span class="gold">${c} cr</span></div><div class="ware-use"><b style="color:${D.color}">${esc(D.what)}</b> — ${esc(D.desc(A.eff(p), t))} <span class="dim">${D.mana} mana · rests ${D.cd} s.</span><br><b>${esc(D.pas)}</b> — ${esc(D.pasText(A.gift({ relic: o.k, rarity: o.rarity, level: o.level })))}</div><div class="row"><button class="small" data-relic="${i}" ${sold || pl.gold < c ? 'disabled' : ''}>${sold ? 'Sold' : 'Buy'}</button></div></div></div>`;
      }).join('')}</div>`;
    },

    // ------------------------------------------------------------ the relics page
    slotHtml(game, i) {
      const world = game.world, pl = game.pl, S = A.slots(pl), n = A.nslots(pl), it = S[i] && world.items[S[i]], D = it && RELICS[it.relic];
      const key = i < 3 ? `<span class="rs-key">${A.keyName(i)}</span>` : '<span class="rs-key rs-auto">auto</span>';
      if (i >= n) return `<div class="rslot locked">${key}<div class="rs-ic">🔒</div><div class="rs-empty">Opens at level ${UNLOCK[i]}</div></div>`;
      if (!D) return `<div class="rslot empty">${key}<div class="rs-ic">◇</div><div class="rs-empty">Empty${i < 3 ? '' : ' — works by itself'}</div></div>`;
      const R = ECHO.Gear.rarity(it.rarity), left = Math.max(0, (A.cd[it.id] || 0) - game.time);
      return `<div class="rslot r-${it.rarity}" style="--rc:${R.color}">${key}<div class="rs-ic" style="color:${D.color}">${D.icon}</div>
        <div class="rs-name" style="color:${R.color}">${esc(it.name)}</div>
        <div class="rs-meta">${esc(R.name)} · level ${it.level || 1} · power <b>${A.eff(A.pw(it))}</b>${left > 0 ? ` · resting ${Math.ceil(left)} s` : ''}</div>
        <div class="rs-line"><b style="color:${D.color}">${esc(D.what)}</b> <span class="dim">${D.mana} mana · rests ${D.cd} s</span><div class="rs-desc">${esc(A.descOf(it))}</div></div>
        <div class="rs-line rs-pas"><b>${esc(D.pas)}</b> · ${esc(D.pasText(A.gift(it)))} <span class="dim">(always on)</span></div>
        <div class="row"><button class="small ${it.auto === false ? '' : 'on'}" data-relic-auto="${it.id}" title="Wake by itself when the moment comes">${it.auto === false ? 'By hand only' : 'Wakes by itself'}</button><button class="small" data-relic-off="${it.id}">Take off</button></div></div>`;
    },
    html(game) {
      const world = game.world, pl = game.pl, S = A.slots(pl), n = A.nslots(pl);
      const mine = pl.items.map(id => world.items[id]).filter(it => it && it.kind === 'relic' && RELICS[it.relic]);
      const bag = mine.filter(it => !A.worn(pl, it.id)).sort((a, b) => (A.tierOf(b) * 1e5 + A.pw(b)) - (A.tierOf(a) * 1e5 + A.pw(a)));
      const a = pl.arc || {}, sum = A.passiveSummary(pl);
      const wornOf = k => A.wornItems(pl, world).filter(w => w.it.relic === k).map(w => w.it)[0];
      const tile = it => {
        const D = RELICS[it.relic], R = ECHO.Gear.rarity(it.rarity), w = wornOf(it.relic), d = w ? A.pw(it) - A.pw(w) : null;
        const cmp = d == null ? '<span class="rb-new">new kind</span>' : d > 0 ? `<span class="rb-up">▲ ${A.eff(d)} on yours</span>` : d < 0 ? `<span class="rb-down">▼ ${A.eff(-d)}</span>` : '<span class="dim">the same</span>';
        return `<div class="rbag" style="--rc:${R.color}"><div class="rb-top"><span class="rb-ic" style="color:${D.color}">${D.icon}</span><div><div class="rb-name" style="color:${R.color}">${esc(it.name)}</div><div class="rb-meta">${esc(R.name)} · lv ${it.level || 1} · power <b>${A.eff(A.pw(it))}</b> ${cmp}</div></div></div>
          <div class="rb-line"><b style="color:${D.color}">${esc(D.what)}</b> — ${esc(A.descOf(it))}</div>
          <div class="rb-line"><b>${esc(D.pas)}</b> — ${esc(D.pasText(A.gift(it)))}</div>
          <div class="row rb-wear"><span class="dim">Wear on</span>${Array.from({ length: n }, (_, i) => `<button class="small ${S[i] ? '' : 'on'}" data-relic-on="${it.id}" data-slot="${i}" title="${S[i] && world.items[S[i]] ? 'In place of ' + esc(world.items[S[i]].name) : 'An empty slot'}">${A.keyName(i)}</button>`).join('')}</div></div>`;
      };
      return `<h3 class="gold">Magical equipment</h3>
        <p class="dim" style="font-size:13px">Mana ${Math.round(pl.mana)}/${Math.round(pl.maxMana)} · grown by use <b style="color:#8fb8ff">+${A.bonus(pl)}</b> <span style="font-size:12px">(${Math.round(a.used || 0)} spent · ${Math.round((a.fight || 0) / 60)} min in battle)</span>. Each relic you wear gives its gift always, and wakes its power by itself when the moment comes, spending mana — Z, X and C wake the first three by hand.</p>
        <div class="relic-slots">${Array.from({ length: UNLOCK.length }, (_, i) => A.slotHtml(game, i)).join('')}</div>
        <div class="relic-sum">${sum.length ? `<b>All you wear, always:</b> ${sum.map(esc).join(' · ')}` : '<span class="dim">Wear a relic and its gift is with you at once.</span>'}</div>
        <div class="row" style="margin:6px 0 2px">${mine.length ? `<button class="small" data-relic-best="1">Wear the best I carry</button>` : ''}<span class="dim" style="font-size:12px">${bag.length ? `${bag.length} more in your satchel` : ''}</span></div>
        ${bag.length ? `<h4 class="ware-h">Your satchel</h4><div class="relic-bag">${bag.map(tile).join('')}</div>` : mine.length ? '' : '<p class="dim">You carry no relics yet. They are found on what you kill — above all in dungeons, and on the strong: elites, the lords of the deep places, the beasts of the lairs, titans — and in the chests at the bottom of the deep places, and at the arcanist of a market.</p>'}`;
    },
    bind_(root, game, again) {
      const pl = game.pl, world = game.world;
      root.querySelectorAll('button[data-relic-on]').forEach(b => b.addEventListener('click', () => { A.wear(pl, b.dataset.relicOn, +b.dataset.slot); again(); }));
      root.querySelectorAll('button[data-relic-off]').forEach(b => b.addEventListener('click', () => { A.takeOff(pl, b.dataset.relicOff); again(); }));
      root.querySelectorAll('button[data-relic-auto]').forEach(b => b.addEventListener('click', () => { const it = world.items[b.dataset.relicAuto]; if (it) it.auto = it.auto === false ? undefined : false; if (it && it.auto === undefined) delete it.auto; again(); }));
      root.querySelectorAll('button[data-relic-best]').forEach(b => b.addEventListener('click', () => { A.best(pl, world); again(); }));
    },
    // the page of its own (I)
    open(game) {
      const body = ECHO.UI.openPanel('Relics', `<div class="relic-page">${A.html(game)}</div>`, 'relics');
      if (body) A.bind_(body, game, () => A.open(game));
    },
    // in the item bar: the barrier, while it holds
    hud(game) { const pl = game.pl; return pl._barrierT > 0 ? `<span style="color:#ffe08a">▣ ${Math.round(pl._barrier)}</span>` : ''; },
    // the relic bar over it: each one worn, its key, its rest, whether it wakes by itself
    bar(game) {
      const pl = game.pl, world = game.world, worn = A.wornItems(pl, world);
      if (!worn.length) return '';
      return worn.map(({ it, i }) => {
        const D = RELICS[it.relic], R = ECHO.Gear.rarity(it.rarity), left = Math.max(0, (A.cd[it.id] || 0) - game.time);
        const p = left > 0 ? Math.round(left / D.cd * 24) / 24 : 0, low = pl.mana < D.mana, fire = game.time - (A.castAt[it.id] || -9) < 0.45;
        return `<span class="rl${low ? ' low' : ''}${fire ? ' fire' : ''}${it.auto === false ? '' : ' auto'}" style="--rc:${R.color};--p:${Math.round(p * 360)}deg" title="${esc(it.name)}"><i class="cd"></i><em class="ic" style="color:${D.color}">${D.icon}</em><b class="k">${i < 3 ? A.keyName(i) : ''}</b>${left > 0 ? `<small class="t">${Math.ceil(left)}</small>` : `<small class="m">${D.mana}</small>`}</span>`;
      }).join('');
    }
  };
})();
