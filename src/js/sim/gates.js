// The Gates: three doors onto worlds that are not this one.
//
// Each stands alone in the wild, far from any town, and breathes out a
// menace that stops the heart of anyone below level 150. Beyond each lies a
// world of its own — burning, drowned or rotting — where beasts of level 150
// to 1500 hunt each other and grow on what they kill.
//
// The National Guard holds them: six people, a small office of the realm with
// one purpose — to keep what is behind the gates behind them. Each is strong
// enough to face a beast of level 1500 and fights in a way all their own. You
// may join them at level 150 (so may anyone else of the world who gets that
// far); then they take you through the gate and teach you to survive there.
(function () {
  const { U } = ECHO;
  const P = () => ECHO.People;

  const MIN = 150, TOP = 1500;
  // the menace: felt at R_WARN, hurts at R_HURT, kills at R_KILL (below level 150)
  const R_WARN = 18, R_HURT = 11, R_KILL = 6;

  // Each world beyond a gate: its zones rise in level from the door to the heart.
  const BANDS = [[150, 200], [200, 290], [290, 420], [420, 620], [620, 900], [900, 1250], [1250, 1500]];
  const THEMES = {
    ember: {
      key: 'ember', name: 'the Cinder Gate', world: 'the Ashen Expanse', color: '#ff6a2a', glow: '#ffb060', dark: '#2a0c04',
      blurb: 'A world of ash and glass under a sky that is always burning. Rivers of fire run between the dunes; things made of embers hunt in packs.',
      zones: ['the Scorched Verge', 'the Cinderfields', 'the Glass Dunes', 'the Burning Steps', 'the Magma Throat', 'the Obsidian Crown', 'the Sovereign\'s Caldera'],
      roster: ['cinderhound', 'magmabrute', 'ashwraith', 'emberdrake', 'slaggolem'], sovereign: 'cindersovereign'
    },
    abyss: {
      key: 'abyss', name: 'the Drowned Gate', world: 'the Sunken Choir', color: '#3ad8d0', glow: '#9ff8ff', dark: '#021a1e',
      blurb: 'A drowned city at the bottom of a sea that went away. The halls still sing. Things wait in the black pools for something warm to come close.',
      zones: ['the Tidewrack', 'the Drowned Market', 'the Kelp Cathedral', 'the Pale Shallows', 'the Black Reef', 'the Choir Halls', 'the Mother\'s Deep'],
      roster: ['gloomeel', 'choirsiren', 'drownedknight', 'lanternangler', 'tidalhorror'], sovereign: 'choirmother'
    },
    thorn: {
      key: 'thorn', name: 'the Thorn Gate', world: 'the Rotwood', color: '#b04aff', glow: '#d8a0ff', dark: '#160a20',
      blurb: 'A forest that died and did not stop growing. The trees bleed, the air is thick with spores, and the hunters here wear the wood as skin.',
      zones: ['the Blighted Edge', 'the Weeping Copse', 'the Spore Hollows', 'the Gallows Wood', 'the Briar Maze', 'the Rot Heart', 'the Withered Throne'],
      roster: ['thornstalker', 'sporemother', 'brambletitan', 'rothound', 'hollowstag'], sovereign: 'witheredcrown'
    }
  };
  const ORDER = ['ember', 'abyss', 'thorn'];

  // The six of the National Guard: what they are called, what they can do.
  const MEMBERS = [
    { key: 'bulwark', rank: 'Commander', title: 'the Bulwark', lv: 1500, gate: 0, weapon: 'sword', wclass: 'sword', cape: '#7a1a1a',
      skills: [['aegis', 'Aegis Wall', 'Raises a wall of light round the one they guard: blows land at a third of their weight.'], ['taunt', 'Iron Challenge', 'A roar that turns every beast near onto them instead.']],
      line: 'Six of us hold three doors. We have never lost one. I do not mean to start with you.' },
    { key: 'mender', rank: 'Warden', title: 'the Mender', lv: 1310, gate: 0, weapon: 'sword', wclass: 'staff', cape: '#e8e0c0',
      skills: [['mend', 'Mending Light', 'Heals the one they guard, and burns away poison and roots.'], ['sanctuary', 'Sanctuary', 'A ring of light on the ground that mends whoever stands in it.']],
      line: 'Most who die in there die because they would not step back. Step back. I will be there.' },
    { key: 'lance', rank: 'Warden', title: 'the Lance of Dawn', lv: 1430, gate: 1, weapon: 'sword', wclass: 'spear', cape: '#e0a83a',
      skills: [['lance', 'Sunfire Lance', 'A beam of white fire that burns through everything in a line.'], ['brand', 'Radiant Brand', 'Beasts they strike keep burning.']],
      line: 'The light goes where I point it. Stand behind me, never in front.' },
    { key: 'storm', rank: 'Warden', title: 'the Stormcaller', lv: 1360, gate: 1, weapon: 'sword', wclass: 'staff', cape: '#3a5aa8',
      skills: [['chain', 'Chain Lightning', 'Lightning that leaps from beast to beast.'], ['thunder', 'Thunderclap', 'A crack of thunder that throws everything close off its feet.']],
      line: 'The things in there hunt each other. Let them. We clean up what is left.' },
    { key: 'blade', rank: 'Warden', title: 'the Quiet Blade', lv: 1390, gate: 2, weapon: 'sword', wclass: 'sword', cape: '#1a1a22',
      skills: [['shadowstep', 'Shadowstep', 'Steps through shadow behind a beast and strikes; finishes anything badly hurt.'], ['veil', 'Smoke Veil', 'Smoke that makes every beast near lose its quarry.']],
      line: '…' },
    { key: 'roots', rank: 'Warden', title: 'the Warden of Roots', lv: 1270, gate: 2, weapon: 'sword', wclass: 'axe', cape: '#3a5a2a',
      skills: [['quake', 'Earthshaker', 'Slams the ground: every beast near is thrown down.'], ['stoneskin', 'Stoneskin', 'Takes blows like a mountain takes rain.']],
      line: 'The Rotwood took my village before the gate was ever found. I keep it on its own side now.' }
  ];
  const RANKS = [[0, 'Recruit'], [300, 'Gatewarden'], [600, 'Sentinel'], [1000, 'Vanguard'], [1400, 'Paragon of the Guard']];

  const G = ECHO.Gates = {
    MIN, TOP, R_WARN, R_HURT, R_KILL, THEMES, ORDER, MEMBERS, BANDS,

    // ------------------------------------------------------------ the gates
    ensure(world) {
      if (world.gates && world.gates.v) return world.gates;
      if (!world.settlements || !world.settlements.length || !world.tiles) return null;
      if (ECHO.Explore) ECHO.Explore.sites(world);   // place the dungeons and wonders first, so the gates keep clear of them
      const rng = new ECHO.RNG((world.seed ^ 0x6a7e5) >>> 0);
      const S = world.gates = { v: 1, list: [], guard: { members: [], trainees: [], founded: world.day }, news: 0 };
      G.place(world, rng);
      for (let i = 0; i < MEMBERS.length; i++) S.guard.members.push(G.makeMember(world, rng, i).id);
      return S;
    },
    list(world) { const S = G.ensure(world); return S ? S.list : []; },
    byId(world, id) { return G.list(world).find(g => g.id === id) || null; },
    theme(g) { return THEMES[g.theme]; },
    // Far from every town and road, and from each other; on land a traveller can reach.
    place(world, rng) {
      const T = ECHO.TILE, W = world.W, H = world.H, Wd = ECHO.World;
      const solid = (x, y) => Wd.isSolid(world, x + 0.5, y + 0.5);
      // land you can walk to from the towns
      const reach = new Uint8Array(W * H), q = [];
      for (const s of world.settlements) { const i = (s.y | 0) * W + (s.x | 0); if (i >= 0 && i < W * H && !reach[i]) { reach[i] = 1; q.push(i); } }
      while (q.length) {
        const i = q.pop(), x = i % W, y = (i / W) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) continue;
          const j = ny * W + nx;
          if (reach[j]) continue;
          const t = Wd.tile(world, nx, ny);
          if (t === T.DEEP || (solid(nx, ny) && t !== T.TREE && t !== T.WATER)) continue;
          reach[j] = 1; q.push(j);
        }
      }
      const OK = new Set([T.GRASS, T.HILL, T.SNOW, T.SAND, T.FOREST, T.RUIN, T.SWAMP]);
      const sites = world.sites || [], lairs = world.lairs || [], camps = world.camps || [], ruins = world.ruins || [];
      const sec = world.secrets ? world.secrets.list : [];
      const minD = Math.max(26, Math.min(W, H) * 0.15);
      const others = [...sites, ...lairs, ...camps, ...ruins, ...sec];
      // the best spots first; if the world is crowded, ask a little less of them
      const pick = (relax) => {
        const cands = [];
        for (let k = 0; k < 2600; k++) {
          const x = 12 + rng.int(0, W - 25), y = 12 + rng.int(0, H - 25);
          if (!reach[y * W + x] || !OK.has(Wd.tile(world, x, y))) continue;
          let dTown = Infinity;
          for (const s of world.settlements) dTown = Math.min(dTown, U.dist(s.x, s.y, x, y));
          if (dTown < minD * (1 - relax * 0.15)) continue;
          // nothing of the world inside the menace (in a crowded world, at least nothing near the door)
          let dO = 60;
          for (const o of others) dO = Math.min(dO, U.dist(o.x, o.y, x, y));
          if (dO < R_HURT + 3 - relax * 3) continue;
          if (G.list0(world).some(g => U.dist(g.x, g.y, x, y) < 24)) continue;
          // never on top of someone: an old world loading with its hero out in the wild
          const hero = world.player;
          if (hero && hero.x < 9000 && U.dist(hero.x, hero.y, x, y) < R_WARN + 8) continue;
          let roads = 0, water = 0;
          for (let dy = -R_HURT; dy <= R_HURT; dy += 2) for (let dx = -R_HURT; dx <= R_HURT; dx += 2) {
            if (dx * dx + dy * dy > R_HURT * R_HURT) continue;
            const t = Wd.tile(world, x + dx, y + dy);
            if (t === T.ROAD || t === T.BRIDGE || t === T.FARM || t === T.PLAZA) roads++;
            if (t === T.WATER || t === T.DEEP) water++;
          }
          if (roads > 2 + relax * 3 || water > 30 + relax * 15) continue;
          // far from the towns, and far from the other gates
          let dGate = 120;
          for (const g of G.list0(world)) dGate = Math.min(dGate, U.dist(g.x, g.y, x, y));
          cands.push({ x, y, score: Math.min(dTown, 90) + Math.min(dGate, 120) * 0.6 + Math.min(dO, R_WARN) * 2 - roads * 6 - water * 0.4 + rng.next() * 6 });
        }
        cands.sort((a, b) => b.score - a.score);
        return cands[0] || null;
      };
      for (const key of ORDER) {
        let c = null;
        for (let relax = 0; relax <= 3 && !c; relax++) c = pick(relax);
        if (!c) c = G.fallback(world, rng);
        if (!c) continue;
        const th = THEMES[key];
        world.gates.list.push({ id: 'gate_' + key, theme: key, name: th.name, x: c.x + 0.5, y: c.y + 0.5, lo: MIN, hi: TOP, found: false, slain: null, apex: [], kills: 0, visits: 0 });
      }
      // a clearing round each gate: the menace has killed every tree
      let changed = false;
      for (const g of world.gates.list) for (let dy = -7; dy <= 7; dy++) for (let dx = -8; dx <= 8; dx++) {
        if (dx * dx / 64 + dy * dy / 49 > 1) continue;
        const x = Math.floor(g.x) + dx, y = Math.floor(g.y) + dy, t = Wd.tile(world, x, y);
        if (t === T.TREE || t === T.FOREST || t === T.ROCK || t === T.WATER || t === T.SWAMP) { Wd.setTile(world, x, y, T.RUIN); changed = true; }
      }
      if (changed) { if (Wd.rebuildBlocked) Wd.rebuildBlocked(world); world._tileEpoch = (world._tileEpoch || 0) + 1; }
    },
    list0(world) { return world.gates ? world.gates.list : []; },
    // for anything placed later: is this spot inside a gate's menace?
    inMenace(world, x, y, pad = 3) { return !!(world.gates && world.gates.list.some(g => U.dist(g.x, g.y, x, y) < R_HURT + pad)); },
    // a small world with no room to be far from anything: the farthest open land there is
    fallback(world, rng) {
      const T = ECHO.TILE;
      let best = null, bd = -1;
      for (let k = 0; k < 1500; k++) {
        const x = 8 + rng.int(0, world.W - 17), y = 8 + rng.int(0, world.H - 17);
        const t = ECHO.World.tile(world, x, y);
        if (!(t === T.GRASS || t === T.HILL || t === T.SAND || t === T.SNOW)) continue;
        let d = Infinity;
        for (const s of world.settlements) d = Math.min(d, U.dist(s.x, s.y, x, y));
        for (const g of G.list0(world)) d = Math.min(d, U.dist(g.x, g.y, x, y) * 0.7);
        if (world.player && world.player.x < 9000) d = Math.min(d, U.dist(world.player.x, world.player.y, x, y) - 10);
        if (d > bd) { bd = d; best = { x, y }; }
      }
      return best;
    },
    nearest(world, x, y) {
      let best = null, bd = Infinity;
      for (const g of G.list(world)) { const d = U.dist(g.x, g.y, x, y); if (d < bd) { bd = d; best = g; } }
      return best ? { g: best, d: bd } : null;
    },
    // How strongly the menace bears on a spot: 0 none, 1 felt, 2 hurting, 3 killing.
    aura(world, x, y) {
      const n = G.nearest(world, x, y);
      if (!n || n.d > R_WARN) return { g: n && n.g, d: n ? n.d : Infinity, k: 0 };
      return { g: n.g, d: n.d, k: n.d <= R_KILL ? 3 : n.d <= R_HURT ? 2 : 1 };
    },
    // the zone (0–6) for a level
    zoneFor(lv) { for (let i = 0; i < BANDS.length; i++) if (lv < BANDS[i][1]) return i; return BANDS.length - 1; },

    // ------------------------------------------------------------ the National Guard
    member(world, i) { const S = G.ensure(world); return S && world.npcs[S.guard.members[i]]; },
    members(world) { const S = G.ensure(world); return S ? S.guard.members.map(id => world.npcs[id]).filter(n => n && n.status === 'alive') : []; },
    atGate(world, g) { return G.members(world).filter(n => n.ng && G.list(world)[n.ng.gate] === g); },
    isMember(n) { return !!(n && n.ng); },
    def(n) { return n && n.ng ? MEMBERS.find(m => m.key === n.ng.key) : null; },
    makeMember(world, rng, i, from) {
      const M = MEMBERS[i], g = G.list(world)[M.gate] || G.list(world)[0];
      const fac = G.realmFaction(world, g);
      let n = from;
      if (!n) {
        n = P().create(world, rng, { home: null, prof: 'guard', faction: fac, fight: 100, traits: i === 4 ? ['patient', 'loyal'] : ['brave', 'loyal'], born: world.day - Math.floor(rng.range(32, 44) * ECHO.TIME.YEAR_DAYS) });
        n.wealth = 400;
      } else {
        // a trainee steps up: they leave their town for the gate
        const s = ECHO.Sim.settlement(world, n.loc || n.home);
        if (s) s.residents = s.residents.filter(id => id !== n.id);
        n.prof = 'guard'; n.faction = fac;
      }
      n.home = null; n.loc = null; n.journey = 'warden';
      n.ng = { key: M.key, rank: M.rank, title: M.title, gate: M.gate, since: world.day };
      n.lv = Math.max(n.lv || 0, from ? Math.max(M.lv - 300, n.lv || 0) : M.lv);
      n.skill.fight = 100;
      // the gear of the Guard: forged for them, and it shows
      if (ECHO.Gear && ECHO.Character && ECHO.Character.makeItem) {
        n.gear = n.gear || {};
        const w = ECHO.Gear.make(world, rng, 'sword', n.lv, 'legendary', 'in the armoury of the National Guard');
        w.wclass = M.wclass; w.plus = 5;
        const a = ECHO.Gear.make(world, rng, 'armor', n.lv, 'legendary', 'in the armoury of the National Guard'); a.plus = 5;
        for (const it of [w, a]) { const sl = it.kind === 'armor' ? 'armor' : 'weapon'; const old = n.gear[sl] && world.items[n.gear[sl]]; if (old) old.holder = null; it.holder = n.id; n.gear[sl] = it.id; }
      }
      return n;
    },
    realmFaction(world, g) {
      const ks = Object.keys(world.factions).filter(k => k !== 'ashfang' && world.factions[k] && !world.factions[k].outlaw);
      if (!g) return ks[0];
      let best = ks[0], bd = Infinity;
      for (const s of world.settlements) if (s.kind === 'capital' && ks.includes(s.faction)) { const d = U.dist(s.x, s.y, g.x, g.y); if (d < bd) { bd = d; best = s.faction; } }
      return best;
    },
    // ------------------------------------------------------------ joining
    lvOf(world, who) { return who && who.charId ? (ECHO.Prowess ? ECHO.Prowess.level(who) : 1) : ECHO.Delvers ? ECHO.Delvers.lv(who) : (who.lv || 1); },
    joined(world, who) { if (!who) return null; return who.charId ? who.guard || null : (G.ensure(world).guard.trainees.find(t => t.id === who.id) || null); },
    canJoin(world, who) {
      if (G.joined(world, who)) return 'already';
      if (G.lvOf(world, who) < MIN) return 'level';
      return null;
    },
    join(world, who, mentor) {
      if (G.canJoin(world, who)) return null;
      const S = G.ensure(world), m = mentor || G.members(world)[0];
      const rec = { joined: world.day, mentor: m ? m.id : null, trips: 0, kills: 0 };
      const name = who.charId ? `${who.first} ${who.last}` : P().name(who);
      if (who.charId) who.guard = rec;
      else { rec.id = who.id; S.guard.trainees.push(rec); who.ngTrainee = true; }
      ECHO.Chronicle.add(world, { text: `${name} took the oath of the National Guard${m ? ` before ${P().name(m)} ${m.ng.title}` : ''}, sworn to hold the gates against what lies beyond them.`, kind: 'realm', importance: 2, char: who.charId || null, npcs: who.charId ? [] : [who.id] });
      return rec;
    },
    rankOf(lv) { let r = RANKS[0][1]; for (const [l, t] of RANKS) if (lv >= l) r = t; return r; },
    mentorOf(world, who) { const j = G.joined(world, who); const m = j && world.npcs[j.mentor]; return m && m.status === 'alive' ? m : null; },

    // ------------------------------------------------------------ every day
    dailyTick(world, rng) {
      // not while the world is still being made (its history runs before the sites are placed)
      if (!world.player && !world.gates) return;
      const S = G.ensure(world);
      if (!S) return;
      const gates = S.list;
      // there are always six: a fallen warden is replaced by the strongest
      // trainee, or by someone who comes over the mountains to take the post
      for (let i = 0; i < MEMBERS.length; i++) {
        const n = world.npcs[S.guard.members[i]];
        if (n && n.status === 'alive') continue;
        const tr = S.guard.trainees.map(t => world.npcs[t.id]).filter(t => t && t.status === 'alive' && (t.lv || 0) >= 600 && t.id !== (world.player && world.player.companion)).sort((a, b) => (b.lv || 0) - (a.lv || 0))[0];
        const nn = G.makeMember(world, rng, i, tr || null);
        if (tr) S.guard.trainees = S.guard.trainees.filter(t => t.id !== tr.id);
        S.guard.members[i] = nn.id;
        const g = gates[MEMBERS[i].gate];
        ECHO.Chronicle.add(world, { text: `${P().name(nn)} ${tr ? 'rose from the ranks of the trainees and' : 'came over the mountains and'} took up the post of ${MEMBERS[i].title} at ${g ? g.name : 'the gates'}${n ? `, in place of ${P().name(n)}` : ''}.`, kind: 'realm', importance: 2, x: g ? g.x : null, y: g ? g.y : null, npcs: [nn.id] });
      }
      // the wardens never age past their post (they are sent home first, in a song somewhere)
      for (const id of S.guard.members) { const n = world.npcs[id]; if (n && P().age(world, n) > 48) n.born = world.day - Math.floor(44 * ECHO.TIME.YEAR_DAYS); }
      // anyone of the world who gets to level 150 may answer the call
      if (world.day % 3 === 0) {
        for (const n of Object.values(world.npcs)) {
          if (n.status !== 'alive' || n.ng || n.ngTrainee || !n.loc || n.prof === 'child' || n.prof === 'ruler' || n.title) continue;
          if (!ECHO.Delvers || ECHO.Delvers.lv(n) < MIN) continue;
          const keen = P().has(n, 'brave') || P().has(n, 'ambitious') || P().has(n, 'loyal');
          if (P().has(n, 'cowardly') || !rng.chance(keen ? 0.35 : 0.1)) continue;
          const gi = rng.int(0, gates.length - 1), m = G.members(world).find(x => x.ng.gate === gi) || G.members(world)[0];
          G.join(world, n, m);
        }
      }
      // the trainees go through the gates with their wardens, and come back stronger
      for (const t of S.guard.trainees.slice()) {
        const n = world.npcs[t.id];
        if (!n || n.status !== 'alive') { S.guard.trainees = S.guard.trainees.filter(x => x !== t); continue; }
        if (n.delving || (n.hurtUntil > world.day) || !rng.chance(0.45)) continue;
        const before = n.lv || MIN;
        // (well past the age the realm has reached, they go on more slowly)
        if (ECHO.Powers && before > ECHO.Powers.era(world, ECHO.Powers.plLv(world)) * 1.1 + 10 && !rng.chance(0.08)) continue;
        const gain = rng.int(1, 3) + (before < 400 ? 2 : before < 800 ? 1 : 0);
        n.lv = Math.min(TOP, before + gain);
        t.trips++;
        n.renown = (n.renown || 0) + 1;
        // even with a warden at your side, the worlds beyond can kill you
        if (rng.chance(0.0025) && n.id !== (world.player && world.player.companion)) {
          const g = gates[rng.int(0, gates.length - 1)];
          P().kill(world, n, `killed beyond ${g ? g.name : 'a gate'}`);
          continue;
        }
        for (const [l] of RANKS) if (before < l && n.lv >= l && l > 0) ECHO.Chronicle.add(world, { text: `${P().name(n)} of the National Guard is a ${G.rankOf(n.lv).toLowerCase()} now (level ${n.lv}).`, kind: 'realm', importance: 1, sid: n.loc || n.home, npcs: [n.id] });
      }
      // what lives beyond each gate grows, and the sovereigns come back
      for (const g of gates) {
        if (g.slain && world.day - g.slain >= 10) { g.slain = null; ECHO.Chronicle.add(world, { text: `Something has taken the throne at the heart of ${THEMES[g.theme].world} again. The wardens of ${g.name} feel it in the ground.`, kind: 'nature', importance: 1, x: g.x, y: g.y }); }
        for (const a of g.apex || []) a.lvl = Math.min(TOP, a.lvl + (rng.chance(0.5) ? 1 : 0));
      }
      // now and then the Guard is heard of
      if (rng.chance(0.035) && gates.length) {
        const g = gates[rng.int(0, gates.length - 1)], ms = G.atGate(world, g);
        if (ms.length) {
          const th = THEMES[g.theme], m = ms[rng.int(0, ms.length - 1)], beast = ECHO.Monsters && ECHO.Monsters.DEFS[th.roster[rng.int(0, th.roster.length - 1)]];
          ECHO.Chronicle.add(world, { text: `${P().name(m)} ${m.ng.title} held ${g.name} against a surge from ${th.world}${beast ? ` — ${beast.name.toLowerCase()}s by the dozen` : ''}. Nothing came through.`, kind: 'realm', importance: 1, x: g.x, y: g.y, npcs: [m.id] });
        }
      }
      // and its work in the realm: auxiliaries, garrisons, breaches, culls
      if (ECHO.GuardWork) ECHO.GuardWork.dailyTick(world, rng);
    }
  };
})();
