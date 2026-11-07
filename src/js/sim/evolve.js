// Evolution: every monster has higher forms, and takes them as it grows stronger.
//
// A goblin that grows strong enough becomes a hobgoblin, then a goblin chief, then a goblin
// king; a skeleton a skeleton warrior, a death knight, a bone lord; a wolf a dire wolf, a
// shadowfang, the great wolf — and so for every kind there is (the ones without forms of
// their own of the old tales grow greater, dread and elder). Each form is bigger, harder
// to kill, hits harder, is worth more to beat, and brings something new to the fight: a
// charge, a slam, a pack of its own kind called up round it, a crown.
//
// What makes a monster stronger, and so what makes it evolve:
//   • its level — the deeper places and the later age breed stronger things, and a monster
//     well past a form's threshold is born in it (a few at the threshold; nearly all of
//     them half as far again past it);
//   • its growth — a monster that grows in the middle of a fight, that kills (someone of
//     the town, one of your beasts, another monster), or that beats you, gains might; past
//     the threshold it evolves then and there, in front of you;
//   • the named ones (the Journal's Rising powers) evolve as they climb, day by day;
//   • and your own tamed beasts evolve as they rise in level with you.
// The thresholds rise with how strong a kind is to begin with (a goblin's second form comes
// at level 12; a deepwood horror's at 27). Nothing here is saved but a stage number on the
// things that keep one (a named monster, a tamed beast): an old world takes it up at once.
(function () {
  const { U } = ECHO;

  // the tier of each kind (how strong it is to begin with), for a world without the game's
  // monster book loaded (the headless tests); the book's own tier wins when it is there
  const TIER = {
    wolf: 1, skeleton: 1, skelarcher: 1, goblin: 1, giantrat: 1, slime: 1, slimeling: 1, ghoul: 2, shaman: 2, spider: 2, cultist: 2, warlord: 2,
    queen: 3, troll: 3, ogre: 3, wraith: 3, golemling: 3, tuskling: 3, necromancer: 4, golem: 4, frosthound: 4, stormwisp: 4, sunling: 4, voidshade: 4, hollowking: 5,
    wight: 2, 'barrow-king': 3, 'crypt-warden': 3, brigand: 1, outlaw: 1, 'smuggler-chief': 2
  };
  // forms of their own: [second, third, fourth]. show: what a person-shaped one wears;
  // em: the glow on it; ab: what it brings to the fight
  const F = (n, o) => Object.assign({ n }, o || {});
  const CHAINS = {
    goblin: [F('Hobgoblin', { show: ['helm'] }), F('Goblin chief', { show: ['helm', 'cape'], ab: { summon: { kind: 'goblin', n: 2, cd: 14 } } }), F('Goblin king', { show: ['crown', 'cape'], ab: { summon: { kind: 'goblin', n: 3, cd: 12 }, charge: { cd: 9 } } })],
    shaman: [F('Goblin hexer', { show: ['hood'] }), F('Goblin witch-doctor', { show: ['hood', 'cape'], ab: { summon: { kind: 'goblin', n: 1, cd: 14 } } }), F('Goblin archshaman', { show: ['crown', 'cape'], ab: { teleport: { cd: 7 } } })],
    warlord: [F('the Goblin King', { show: ['crown', 'cape'] }), F('the Goblin Emperor', { show: ['crown', 'cape'], ab: { slam: { cd: 8, r: 2.6, dmg: 1.1 } } }), F('the Great Goblin', { show: ['crown', 'cape'], ab: { slam: { cd: 6, r: 3, dmg: 1.2 } } })],
    skeleton: [F('Skeleton warrior', { show: ['helm', 'shield'] }), F('Death knight', { show: ['helm', 'cape'], em: '#5a0a0a', ab: { charge: { cd: 9 } } }), F('Bone lord', { show: ['crown', 'cape'], em: '#3a0a5a', ab: { summon: { kind: 'skeleton', n: 2, cd: 14 } } })],
    skelarcher: [F('Bone marksman', { show: ['hood'] }), F('Deadeye', { show: ['hood', 'cape'], em: '#3a2a0a' }), F('Lich archer', { show: ['hood', 'cape'], em: '#2a0a5a', ab: { teleport: { cd: 8 } } })],
    ghoul: [F('Ghast'), F('Ghoul ravager', { ab: { charge: { cd: 8 } } }), F('Ghoul lord', { show: ['crown'], ab: { summon: { kind: 'ghoul', n: 2, cd: 15 } } })],
    giantrat: [F('Rat brute'), F('Plague rat', { ab: { poison: { dps: 3, dur: 5 } } }), F('Rat king', { ab: { summon: { kind: 'giantrat', n: 3, cd: 11 } } })],
    spider: [F('Cave hunter'), F('Broodmother', { ab: { summon: { kind: 'spider', n: 2, cd: 14 } } }), F('Spider empress', { ab: { summon: { kind: 'spider', n: 3, cd: 12 } } })],
    queen: [F('the Brood Queen'), F('the Spider Empress'), F('the Mother of Webs')],
    // the slimes go furthest of all: six forms, and the last of them older than the world
    slime: [F('Ooze', { em: '#1a4a10', ab: { bolt: { color: '#8fe05a', dmg: 1.6, cd: 3, type: 'magic' } } }), F('Great slime', { em: '#2a6a10', ab: { summon: { kind: 'slimeling', n: 2, cd: 14 } } }), F('Slime king', { em: '#4a8a10', ab: { slam: { cd: 6, r: 3, dmg: 1.4 } } }), F('Slime emperor', { em: '#0a6a5a', ab: { teleport: { cd: 7 } } }), F('Primordial ooze', { em: '#8a7a10', ab: { summon: { kind: 'slime', n: 1, cd: 20 } } })],
    slimeling: [F('Slime', { em: '#1a4a10', ab: { bolt: { color: '#8fe05a', dmg: 1.4, cd: 3.4, type: 'magic' } } }), F('Great slime', { em: '#2a6a10' }), F('Slime king', { em: '#4a8a10', ab: { slam: { cd: 7, r: 2.6, dmg: 1.2 } } }), F('Slime emperor', { em: '#0a6a5a' }), F('Primordial ooze', { em: '#8a7a10' })],
    troll: [F('Troll brute'), F('Troll warlord', { show: ['helm'], ab: { charge: { cd: 9 } } }), F('Troll king', { show: ['crown', 'cape'], ab: { frenzy: true } })],
    ogre: [F('the Ogre Warlord', { show: ['helm', 'cape', 'sword'] }), F('the Ogre King', { show: ['crown', 'cape', 'sword'] }), F('the Ogre Tyrant', { show: ['crown', 'cape', 'sword'] })],
    wraith: [F('Dread wraith'), F('Banshee', { ab: { bolt: { color: '#bfe8ff', dmg: 1.3, cd: 3.2, type: 'magic' } } }), F('Wraith lord', { show: ['robe', 'hood', 'crown'], ab: { summon: { kind: 'wraith', n: 1, cd: 16 } } })],
    cultist: [F('Cult adept'), F('Cult zealot', { show: ['robe', 'hood', 'staff', 'cape'] }), F('Dark prophet', { show: ['robe', 'crown', 'staff', 'cape'], ab: { summon: { kind: 'cultist', n: 2, cd: 15 }, teleport: { cd: 8 } } })],
    necromancer: [F('the Lich'), F('the Archlich', { show: ['robe', 'crown', 'staff', 'cape'] }), F('the Death-Lord', { show: ['robe', 'crown', 'staff', 'cape'] })],
    golemling: [F('Stone guardian', { em: '#3a1a06' }), F('Iron golem', { em: '#6a2a08', ab: { slam: { cd: 7, r: 2.4, dmg: 1.1 } } }), F('Titan golem', { em: '#a04010' })],
    golem: [F('the Iron Colossus'), F('the War Colossus'), F('the Forge Titan')],
    hollowking: [F('the Hollow Emperor'), F('the Undying King'), F('the Eater of Worlds')],
    wight: [F('Barrow wight'), F('Wight lord'), F('Grave king')],
    'barrow-king': [F('the Barrow Lord'), F('the Grave King'), F('the King Under the Hill')],
    'crypt-warden': [F('Crypt keeper'), F('Crypt lord'), F('Tomb sovereign')],
    brigand: [F('Brigand veteran'), F('Brigand captain'), F('Bandit lord')],
    outlaw: [F('Outlaw veteran'), F('Outlaw captain'), F('Outlaw lord')],
    tuskling: [F('Tusker'), F('Great tusker', { ab: { charge: { cd: 8 } } }), F('Tusk-lord', { ab: { charge: { cd: 6 } } })],
    wolf: [F('Dire wolf', { tint: '#3a3436' }), F('Shadowfang', { tint: '#1e1a22' }), F('the Great Wolf', { tint: '#e8e4dc' })]
  };
  const PRE = ['Greater', 'Dread', 'Elder'];
  // what every form brings, over the one before it (and its colour, for the glow round it)
  const STEP = { hp: 0.15, dmg: 0.08, scale: 0.1, xp: 0.3 };
  const COL = [null, null, '#ffb060', '#ff6a3a', '#c86aff', '#5affc8', '#ffe08a'];
  const EM = [null, null, '#2a1406', '#5a1a06', '#4a106a', '#0a5a4a', '#6a5a0a'];
  // the slimes: the highest potential of anything that lives — six forms, the first of them
  // early, and every one a bigger step than any other kind takes
  const SLIMES = new Set(['slime', 'slimeling']);
  const SLIME_STEP = { hp: 0.3, dmg: 0.15, scale: 0.12, xp: 0.4 };
  const GATES = { slime: [0, 0, 10, 22, 45, 90, 160], slimeling: [0, 0, 8, 20, 42, 85, 150] };

  const Ev = ECHO.Evolve = {
    CHAINS, STEP, COL, MAX: 4, SLIMES,
    max(kind) { return SLIMES.has(kind) ? 6 : 4; },
    step(kind) { return SLIMES.has(kind) ? SLIME_STEP : STEP; },
    def(kind) { return (ECHO.Quests && ECHO.Quests.FOES && ECHO.Quests.FOES[kind]) || (ECHO.Monsters && ECHO.Monsters.DEFS && ECHO.Monsters.DEFS[kind]) || null; },
    tier(kind) { const D = Ev.def(kind); return (D && D.tier) || TIER[kind] || 3; },
    baseName(kind) { const D = Ev.def(kind); return kind === 'wolf' ? 'Duskwolf' : D ? D.name : U.cap(String(kind || 'beast')); },
    // the levels at which a kind takes its second, third and fourth forms
    gates(kind) { if (GATES[kind]) return GATES[kind]; const g = 9 + 3 * Ev.tier(kind); return [0, 0, g, Math.round(g * 2.5), Math.round(g * 6)]; },
    // the form a kind takes at stage s (1 is what it is born as)
    form(kind, s) {
      s = U.clamp(s | 0 || 1, 1, Ev.max(kind));
      const base = Ev.baseName(kind);
      if (s === 1) return { n: base, s: 1 };
      const c = CHAINS[kind] && CHAINS[kind][s - 2];
      if (c) return Object.assign({ s, em: EM[s] }, c);
      const the = /^the /i.test(base), b = base.replace(/^the /i, '');
      return { s, n: `${the ? 'the ' : ''}${PRE[s - 2]} ${the ? b : b.charAt(0).toLowerCase() + b.slice(1)}`, em: EM[s], ab: Ev.genericAb(kind, s) };
    },
    name(kind, s) { return Ev.form(kind, s).n; },
    // a kind with no forms of its own still learns something as it grows
    genericAb(kind, s) {
      const D = Ev.def(kind) || {}, has = k => !!(D.ab && D.ab[k]);
      if (s === 2) return has('frenzy') ? { regen: 2 } : { frenzy: true };
      if (s === 3) return D.shape === 'hound' || D.shape === 'stag' || D.shape === 'drake' ? { charge: { cd: 9 } } : has('slam') ? { regen: 3 } : { slam: { cd: 9, r: 2.2, dmg: 1 } };
      return D.boss || has('summon') ? { teleport: { cd: 9 } } : { summon: { kind, n: 2, cd: 16 } };
    },
    // its whole ladder, for the bestiary (only what you have seen is named)
    ladder(kind, seen) {
      const G = Ev.gates(kind);
      return Array.from({ length: Ev.max(kind) }, (_, i) => i + 1).map(s => s === 1 ? Ev.name(kind, 1) : (seen || 1) >= s ? `${Ev.name(kind, s)} (Lv ${G[s]}+)` : `??? (Lv ${G[s]}+)`).join(' → ');
    },
    // the stage a level alone has reached for certain (the named and your own beasts)
    stageAt(kind, L) { const G = Ev.gates(kind), M = Ev.max(kind); let s = 1; while (s < M && L >= G[s + 1]) s++; return s; },
    // the stage a monster born at level L is born in: a few at a threshold, nearly all half as far again past it
    stageBorn(kind, L, rnd) {
      const G = Ev.gates(kind), r = rnd == null ? Math.random() : rnd;
      let s = 1;
      for (let k = 2; k <= Ev.max(kind); k++) {
        if (L < G[k]) break;
        const p = U.clamp((L - G[k]) / (0.6 * G[k]) + 0.25, 0, 1);
        if (r < p) s = k; else break;
      }
      return s;
    },
    // how strong it has become, in levels: what it was born as and everything it has done since
    might(e) { return (e.lvl || 1) + 3 * (e.grown || 0) + 5 * (e.evoKills || 0); },
    can(e) { return !!e && !e.dead && (e.foe || e.species === 'wolf') && e.type === 'creature' && !e.titan && !e.apexId && !e.marvel && !e.summoner && !e.summoned && !e.shard && e.species !== 'hare' && e.species !== 'gnawer'; },

    // ------------------------------------------------------------ in the flesh
    // Born: in the form its level has reached (o.evo: a stage it keeps — a named one, one of yours).
    birth(game, e, L, o) {
      if (!Ev.can(e) || (o && o.summoned)) return;   // (what another calls up is born as it is: never a summoner itself)
      const s = o && o.evo != null ? o.evo : (o && (o.nem || o.noEvo)) ? 1 : Ev.stageBorn(e.species, L);
      if (s > 1) Ev.apply(game, e, s, false);
    },
    // It has grown, killed or beaten someone: past the threshold, it evolves where it stands.
    check(game, e) {
      if (!Ev.can(e) || e.pal || e.tamed) return false;
      const G = Ev.gates(e.species), m = Ev.might(e), s0 = e.evo || 1, M = Ev.max(e.species);
      let s = s0;
      while (s < M && m >= G[s + 1]) s++;
      // a monster that has done enough to be noticed always takes at least its next form
      if (s === s0 && s0 < M && ((e.grown || 0) + (e.evoKills || 0) * 1.5 >= 3 * s0)) s = s0 + 1;
      if (s <= s0) return false;
      Ev.apply(game, e, s, true);
      if (e.nem && ECHO.Powers) { const r = ECHO.Powers.byId(game.world, e.nem); if (r && (r.evo || 1) < s) { r.evo = s; ECHO.Powers.tell(game.world, r, `${ECHO.Powers.short(r)} evolved in the middle of a fight: it is ${Ev.a(Ev.name(r.kind, s))} now.`, 2); } }
      return true;
    },
    a(n) { return /^the /i.test(n) ? n : (/^[aeiou]/i.test(n) ? 'an ' : 'a ') + n.charAt(0).toLowerCase() + n.slice(1); },
    // Takes stage s: its name and look, its size, its strength, what it can do. live: in front of you.
    apply(game, e, s, live) {
      const s0 = e.evo || 1;
      if (s <= s0) return;
      const kind = e.species, Fm = Ev.form(kind, s);
      e.evo = s;
      // what it looks like, and what it is called
      if (e.foe) {
        const D0 = e._foe0 || (e._foe0 = e.foe);
        const nd = Object.assign({}, D0, { name: Fm.n, evo: s });
        if (D0.vis) {
          const show = (D0.vis.show || []).slice();
          for (const k of Fm.show || []) if (!show.includes(k)) show.push(k);
          nd.vis = Object.assign({}, D0.vis, { show, em: Fm.em || D0.vis.em });
        } else nd.em = Fm.em || D0.em;
        e.foe = nd;
      }
      if (Fm.tint) e.evoTint = Fm.tint;
      const SP = Ev.step(kind), ratio = k => (1 + SP[k] * (s - 1)) / (1 + SP[k] * (s0 - 1));
      const hk = ratio('hp');
      e.maxHp = Math.round(e.maxHp * hk);
      e.hp = live ? Math.min(e.maxHp, e.hp * hk + e.maxHp * 0.35) : Math.min(e.maxHp, e.hp * hk);
      if (e.pal) e.palDmg = (e.palDmg || 8) * ratio('dmg'); else e.growDmg = (e.growDmg || 1) * ratio('dmg');
      e.scale = (e.scale || 1) * ratio('scale');
      if (e.r) e.r = Math.min(0.62, e.r * ratio('scale'));
      e.gateXp = (e.gateXp || 1) * ratio('xp');
      if (!e.pal) {
        e.ab = e.ab || {};
        for (const k in Fm.ab || {}) if (!e.ab[k]) e.ab[k] = JSON.parse(JSON.stringify(Fm.ab[k]));
        if (s >= 3) { e.resist = e.resist || {}; for (const t of ['melee', 'ranged']) e.resist[t] = Math.min(0.7, (e.resist[t] || 0) + 0.06); }
      }
      // its name over its head (a named one and yours keep their own)
      if (!e.nem && !e.pal) {
        const X = e.elite && ECHO.Monsters && ECHO.Monsters.ELITE.find(z => z.k === e.elite);
        e.label = X ? `${X.name} ${Fm.n.replace(/^the /i, '').toLowerCase()}` : Fm.n;
      }
      const pl = game && game.pl;
      if (pl && !e.pal) { const sn = pl.evoSeen || (pl.evoSeen = {}); sn[kind] = Math.max(sn[kind] || 1, s); }
      const R = ECHO.Renderer3D, v = R && R.views && R.views.get && R.views.get(e);
      if (v) v.cfgT = 0;
      if (live && game) Ev.show(game, e, s0, s);
    },
    // the moment it changes
    show(game, e, s0, s) {
      const C = ECHO.Combat, col = COL[s] || '#ffcf8a', pe = game.pe;
      e.stagger = Math.max(e.stagger || 0, 0.7); e.state = 'stagger'; e.wcast = null;
      if (!pe || U.dist(e.x, e.y, pe.x, pe.y) > 30) return;
      const sc = e.scale || 1;
      C.ring(e.x, e.y, 1.2 * sc, col, 0.5); C.ring(e.x, e.y, 2.4 * sc, col, 0.8);
      C.burst(e.x, e.y, col, 26, 5, 0.9, 3);
      for (let i = 0; i < 18; i++) { const a = i / 18 * 6.283; C.puff(e.x + Math.cos(a) * 0.6 * sc, e.y + Math.sin(a) * 0.6 * sc, { vx: Math.cos(a) * 0.8, vy: Math.sin(a) * 0.8, vz: 4 + Math.random() * 3, g: 1, h: 0.2, life: 1.1, size: 2.4, color: col, glow: true }); }
      C.fx.push({ kind: 'pillar', x: e.x, y: e.y, t: 0, life: 1.2, color: col, height: 4 + 2 * Math.min(2, sc), radius: 0.5 + 0.3 * Math.min(2.5, sc) });
      C.floater(e.x, e.y - 1.6 * sc, '✦ EVOLVES ✦', col, true);
      setTimeout(() => { if (!e.dead) C.floater(e.x, e.y - 2.1 * (e.scale || 1), Ev.name(e.species, s), col, true); }, 650);
      if (game.shake) game.shake(0.25);
      if (ECHO.Sfx) { ECHO.Sfx.play('roar', { vol: 0.5, pitch: 0.8 }); ECHO.Sfx.play('levelup', { vol: 0.5, pitch: 0.6 }); }
      const pl = game.pl;
      if (pl && !pl._evoTip) { pl._evoTip = true; ECHO.UI.toast(`It evolved: the ${Ev.name(e.species, s0).replace(/^the /i, '').toLowerCase()} is ${Ev.a(Ev.name(e.species, s))} now — bigger, harder to kill and harder hitting, with something new to fight with, and worth more to beat. Monsters evolve as they grow stronger: by their level, by growing in a fight, by what they kill and by beating you. The bestiary (J) shows every kind's forms.`, 'legend', 10); }
    },
    // ------------------------------------------------------------ every frame: the glow round the evolved
    tick(game, dt) {
      Ev._t = (Ev._t || 0) - dt;
      if (Ev._t > 0) return;
      Ev._t = 0.18;
      const pe = game.pe, C = ECHO.Combat;
      if (!pe || !C) return;
      for (const e of game.ents) {
        if (!(e.evo > 1) || e.dead || e.hidden) continue;
        if (Math.abs(e.x - pe.x) > 22 || Math.abs(e.y - pe.y) > 22) continue;
        if (Math.random() > 0.25 + 0.2 * e.evo) continue;
        const sc = e.scale || 1, a = Math.random() * 6.283, r = (0.3 + Math.random() * 0.4) * sc;
        C.fx.push({ kind: 'p', x: e.x + Math.cos(a) * r, y: e.y + Math.sin(a) * r * 0.6, vx: 0, vy: 0, t: 0, life: 0.7 + Math.random() * 0.5, color: e.pal ? '#9fe08a' : COL[e.evo], size: 1.2 + e.evo * 0.35, glow: true, h: 0.1 + Math.random() * 0.4 * sc, vz: 0.7 + 0.25 * e.evo, g: 0 });
      }
    },

    // ------------------------------------------------------------ the named ones, day by day
    nemCheck(world, r) {
      if (!r || !r.alive || r.kind === 'bandit') return false;
      const s = Ev.stageAt(r.kind, r.lv + Math.round((r.infl || 0) * 0.3)), s0 = r.evo || 1;
      if (s <= s0) return false;
      r.evo = s;
      if (ECHO.Powers) ECHO.Powers.tell(world, r, `${ECHO.Powers.short(r)} has grown so strong that it has evolved: it is ${Ev.a(Ev.name(r.kind, s))} now.`, s >= 3 ? 2 : 1);
      return true;
    },
    // ------------------------------------------------------------ your own beasts, as they rise
    palGrew(game, r, e) {
      if (!r || r.cat === 'boss' || !r.kind || r.lord) return false;
      const s = Ev.stageAt(r.kind, r.lvl), s0 = r.evo || 1;
      if (s <= s0) return false;
      r.evo = s;
      if (ECHO.Tame && ECHO.Tame._pics) delete ECHO.Tame._pics[r.id];
      if (e && !e.dead) Ev.apply(game, e, s, true);
      if (game.ui) game.ui.banner(`${r.name} evolves!`, `${Ev.name(r.kind, s0)} → ${Ev.name(r.kind, s)}`, true);
      if (ECHO.Chronicle && game.world) ECHO.Chronicle.deed(game.world, { text: `${r.name}, ${game.pl.first} ${game.pl.last}'s ${Ev.name(r.kind, s0).replace(/^the /i, '').toLowerCase()}, evolved into ${Ev.a(Ev.name(r.kind, s))}.`, importance: 1, x: game.pe.x, y: game.pe.y });
      return true;
    },
    // a beast of yours from an older save takes the form its level has reached
    palLoad(r) { if (r && r.cat !== 'boss' && r.kind && !r.lord && r.evo == null) r.evo = Math.max(1, Ev.stageAt(r.kind, r.lvl || 1)); return r && r.evo; }
  };
})();
