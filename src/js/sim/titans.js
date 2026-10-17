// The titans: dragons that fly and great beasts that walk, each one of a kind,
// each with a territory of its own in the open world.
//
// They are the strongest things under the sky — some catastrophically so —
// and they live by what they eat: the game of their range, then the herds and
// granaries of the nearest town when that runs out, and now and then, for the
// oldest, a whole town. They have young about them and prey around them. Beaten,
// they can be bound (you can keep four); a bound dragon can carry you through
// the sky. A territory left empty is claimed again in time by another of the kind.
(function () {
  const { U } = ECHO;
  const P = () => ECHO.People;

  // kind: the body (drake = winged dragon; wyrm = serpent; stag = great horned beast)
  const SPECIES = {
    emberwing: { kind: 'drake', flies: true, element: 'fire', name: 'Emberwing', title: 'the Scorch-Mother', lv: 48, scale: 1.35, color: '#8a2a12', belly: '#ffb04a', terr: ['HILL', 'RUIN', 'SAND'], brood: 'cinderhound', far: 0.2,
      desc: 'A young fire dragon. She burns the grass for the game it drives out.', names: ['Emberwing', 'Ashvane', 'Cinderveil'] },
    rimefang: { kind: 'drake', flies: true, element: 'frost', name: 'Rimefang', title: 'the White Death', lv: 165, scale: 1.75, color: '#cfe0ee', belly: '#7aa8d0', terr: ['SNOW', 'HILL'], brood: 'frosthound', far: 0.45,
      desc: 'A dragon of the snows. Its breath stops blood in the veins.', names: ['Rimefang', 'Hoarwing', 'Gelidra'] },
    mirevenom: { kind: 'drake', flies: true, element: 'venom', name: 'Mirevenom', title: 'the Rot in the Reeds', lv: 240, scale: 1.8, color: '#3a5a2a', belly: '#a8d04a', terr: ['SWAMP', 'FOREST'], brood: 'rothound', far: 0.5,
      desc: 'A marsh dragon whose breath melts flesh off bone.', names: ['Mirevenom', 'Bogscale', 'Virulex'] },
    skyrender: { kind: 'drake', flies: true, element: 'storm', name: 'Skyrender', title: 'the Storm Made Flesh', lv: 330, scale: 1.95, color: '#3a4a8a', belly: '#bfe0ff', terr: ['GRASS', 'HILL', 'SAND'], brood: 'stormwisp', far: 0.6,
      desc: 'Thunder follows it. Lightning answers when it calls.', names: ['Skyrender', 'Tempestra', 'Voltharn'] },
    solgrim: { kind: 'drake', flies: true, element: 'sun', name: 'Solgrim', title: 'the Burning Crown', lv: 720, scale: 2.3, color: '#c8962a', belly: '#fff0a0', terr: ['HILL', 'SAND', 'RUIN'], brood: 'sunling', far: 0.8,
      desc: 'An elder dragon of gold. Looking at it too long blinds you.', names: ['Solgrim', 'Aurelath', 'Heliax'] },
    nyxathar: { kind: 'drake', flies: true, element: 'void', name: 'Nyxathar', title: 'the End of Days', lv: 1400, scale: 2.8, color: '#1a1024', belly: '#8a4aff', terr: ['RUIN', 'HILL', 'SNOW', 'SAND'], brood: 'voidshade', far: 1,
      desc: 'The oldest thing under the sky. Where it passes, towns are only names.', names: ['Nyxathar', 'Umbravex', 'the Unmaker'] },
    gorehorn: { kind: 'stag', flies: false, element: 'earth', name: 'Gorehorn', title: 'the Ironhide Behemoth', lv: 26, scale: 1.5, color: '#5a4636', terr: ['GRASS', 'FARM', 'HILL'], brood: 'tuskling', far: 0.1,
      desc: 'A great horned beast as big as a house. Its charge breaks walls.', names: ['Gorehorn', 'Ironbrow', 'Old Thunderhead'] },
    thunderhoof: { kind: 'stag', flies: false, element: 'storm', name: 'Thunderhoof', title: 'the Storm Elk', lv: 72, scale: 1.7, color: '#4a4a6a', terr: ['FOREST', 'GRASS'], brood: 'stormwisp', far: 0.3,
      desc: 'Where its hooves strike, lightning strikes with them.', names: ['Thunderhoof', 'Galebrow', 'Stormantler'] },
    mawtide: { kind: 'wyrm', flies: false, element: 'venom', name: 'Mawtide', title: 'the Deep Serpent', lv: 115, scale: 1.7, color: '#2a4a4a', terr: ['SWAMP', 'SAND'], brood: 'gloomeel', far: 0.35,
      desc: 'A serpent long as a street, that lies in wait at the water\'s edge.', names: ['Mawtide', 'Coilgrave', 'the Sunken Jaw'] },
    grimmaw: { kind: 'wyrm', flies: false, element: 'earth', name: 'Grimmaw', title: 'the Mountain Wyrm', lv: 520, scale: 2.3, color: '#5a4a3a', terr: ['HILL', 'SNOW'], brood: 'slaggolem', far: 0.7,
      desc: 'It burrows through hills. The ground heaves where it hunts.', names: ['Grimmaw', 'Stonegullet', 'the Deepbore'] }
  };
  const ORDER = ['gorehorn', 'emberwing', 'thunderhoof', 'mawtide', 'rimefang', 'mirevenom', 'skyrender', 'grimmaw', 'solgrim', 'nyxathar'];
  const MAX_BOUND = 4;

  const T = ECHO.Titans = {
    SPECIES, ORDER, MAX_BOUND,
    ensure(world) {
      if (world.titans && world.titans.v) return world.titans;
      if (!world.settlements || !world.settlements.length || !world.tiles) return null;
      if (ECHO.Explore) ECHO.Explore.sites(world);
      const S = world.titans = { v: 1, list: [], seq: 0 };
      const rng = new ECHO.RNG((world.seed ^ 0x717a5) >>> 0);
      for (const k of ORDER) { const t = T.place(world, rng, k, 0); if (t) S.list.push(t); }
      return S;
    },
    list(world) { const S = T.ensure(world); return S ? S.list : []; },
    byId(world, id) { return T.list(world).find(t => t.id === id) || null; },
    sp(t) { return SPECIES[t.sp]; },
    wild(world) { return T.list(world).filter(t => t.alive && !t.bound); },
    // a roost on the right ground, far from towns (the older, the farther), clear of everything else
    place(world, rng, k, gen) {
      const sp = SPECIES[k], TT = ECHO.TILE, W = world.W, H = world.H, Wd = ECHO.World;
      const any = new Set(['GRASS', 'HILL', 'FOREST', 'SAND', 'SNOW', 'SWAMP', 'RUIN'].map(n => TT[n]));
      for (let relax = 0; relax < 3; relax++) {
        const r = T.placeTry(world, rng, k, gen, relax ? any : new Set(sp.terr.map(n => TT[n])), relax);
        if (r) return r;
      }
      return null;
    },
    placeTry(world, rng, k, gen, ok, relax) {
      const sp = SPECIES[k], W = world.W, H = world.H, Wd = ECHO.World;
      const others = [...(world.sites || []), ...(world.lairs || []), ...(world.camps || []), ...(world.ruins || [])];
      const caps = world.settlements.filter(s => s.kind === 'capital');
      const minTown = (20 + sp.far * 18) * (1 - relax * 0.25);
      let best = null, bs = -Infinity;
      for (let i = 0; i < 2200; i++) {
        const x = 10 + rng.int(0, W - 21), y = 10 + rng.int(0, H - 21);
        const tl = Wd.tile(world, x, y);
        if (!ok.has(tl) || Wd.isSolid(world, x + 0.5, y + 0.5)) continue;
        let dT = Infinity; for (const s of world.settlements) dT = Math.min(dT, U.dist(s.x, s.y, x, y));
        if (dT < minTown) continue;
        if (others.some(o => U.dist(o.x, o.y, x, y) < 10 - relax * 2)) continue;
        if (ECHO.Gates && ECHO.Gates.inMenace(world, x, y, 26 - relax * 5)) continue;   // its whole range clear of a gate's menace
        if ((world.titans ? world.titans.list : []).some(o => o.alive && !o.bound && o.sp !== k && U.dist(o.x, o.y, x, y) < 26 - relax * 7)) continue;
        if (world.player && world.player.x < 9000 && U.dist(world.player.x, world.player.y, x, y) < 24) continue;
        const dC = caps.length ? caps.reduce((a, c) => a + U.dist(c.x, c.y, x, y), 0) / caps.length : 0;
        const sc = -Math.abs(dC / Math.max(W, H) - (0.25 + sp.far * 0.5)) * 60 + Math.min(dT, 60) * 0.3 + rng.next() * 8;
        if (sc > bs) { bs = sc; best = { x, y }; }
      }
      if (!best) return null;
      const S = world.titans;
      const seq = S ? ++S.seq : 0;
      const nm = gen ? sp.names[gen % sp.names.length] : sp.name;
      return { id: 'titan_' + k + (gen ? '_' + seq : ''), sp: k, name: nm, title: sp.title, lvl: Math.round(sp.lv * (gen ? 0.85 : 1)), x: best.x + 0.5, y: best.y + 0.5, r: 13 + sp.scale * 2,
        alive: true, bound: false, hp: 1, hunger: 0, fed: world.day, kills: 0, born: world.day, seen: false, gen: gen || 0 };
    },
    // ------------------------------------------------------------ bound beasts (yours)
    bound(world) { return T.list(world).filter(t => t.bound && t.alive); },
    canBind(world) { return T.bound(world).length < MAX_BOUND; },
    bind(world, t, pl) {
      if (!t || !t.alive || t.bound || !T.canBind(world)) return false;
      t.bound = true; t.boundDay = world.day; t.bond = 10; t.hp = 1; t.restUntil = world.day;
      pl.beasts = T.bound(world).map(b => b.id);
      ECHO.Chronicle.add(world, { text: `${pl.first} ${pl.last} brought ${t.name} ${t.title} to its knees and bound it — the beast now answers to them.`, kind: 'player', importance: 3, x: t.x, y: t.y, char: pl.charId });
      return true;
    },
    release(world, t, pl) {
      if (!t || !t.bound) return false;
      t.bound = false; t.hp = 1; t.hunger = 0; t.fed = world.day; t.released = world.day;
      if (pl) { pl.beasts = T.bound(world).map(b => b.id); if (pl.beastOut === t.id) pl.beastOut = null; }
      ECHO.Chronicle.add(world, { text: `${t.name} ${t.title} was set free, and flew back to its old ground.`, kind: 'beast', importance: 1, x: t.x, y: t.y });
      return true;
    },
    slain(world, t, by) {
      t.alive = false; t.diedDay = world.day;
      ECHO.Chronicle.add(world, { text: `${t.name} ${t.title} was slain${by ? ' by ' + by : ''}. Its range lies empty.`, kind: 'beast', importance: 3, x: t.x, y: t.y });
    },

    // ------------------------------------------------------------ every day
    dailyTick(world, rng) {
      if (!world.player && !world.titans) return;
      const S = T.ensure(world);
      if (!S) return;
      for (const t of S.list.slice()) {
        const sp = SPECIES[t.sp];
        if (t.bound) { if (t.alive && t.hp < 1) t.hp = Math.min(1, t.hp + 0.5); continue; }
        if (!t.alive) {
          // the range is claimed again by another of the kind
          if (world.day - (t.diedDay || 0) > 35 && !S.list.some(o => o.sp === t.sp && o.alive && !o.bound && o !== t) && rng.chance(0.25)) {
            const n = T.place(world, rng, t.sp, (t.gen || 0) + 1);
            if (n) { S.list = S.list.filter(o => o !== t); S.list.push(n); ECHO.Chronicle.add(world, { text: `A new ${sp.flies ? 'dragon' : 'great beast'}, ${n.name}, has claimed the range of ${t.name}.`, kind: 'beast', importance: 2, x: n.x, y: n.y }); }
          }
          continue;
        }
        if (t.hp < 1) t.hp = Math.min(1, t.hp + 0.25);
        // it eats what lives on its range
        const r = ECHO.World.regionAt(world, t.x, t.y);
        const e = r && r.eco;
        const need = 3 + sp.scale * 3;
        const prey = e ? (e.hare || 0) + (e.wolf || 0) * 3 : 0;
        if (e && prey > need * 3 && rng.chance(0.7)) {
          e.hare = Math.max(0.3, (e.hare || 0) - need * 0.7); e.wolf = Math.max(0.3, (e.wolf || 0) - need * 0.1);
          t.fed = world.day; t.hunger = 0;
        } else t.hunger++;
        // hungry: the herds and the granaries of the nearest town
        if (t.hunger >= 3) {
          const s = ECHO.World.nearestSettlement(world, t.x, t.y, x => x.faction !== 'ashfang');
          if (s && U.dist(s.x, s.y, t.x, t.y) < 90 && rng.chance(0.5)) {
            t.hunger = 0; t.fed = world.day;
            if (s.stock) s.stock.food = Math.max(0, (s.stock.food || 0) * 0.85);
            s.prosperity = Math.max(0, (s.prosperity || 50) - 3);
            ECHO.Chronicle.add(world, { text: `${t.name} ${t.title} came down on the herds of ${s.name}${sp.flies ? ' out of a clear sky' : ''}, and ate its fill.`, kind: 'beast', importance: 2, sid: s.id });
          }
        }
        // the oldest bring catastrophe, now and then
        if (t.lvl >= 600 && rng.chance(0.022) && !(world.player && U.dist(world.player.x, world.player.y, t.x, t.y) < 60)) {
          const s = world.settlements.filter(x => x.faction !== 'ashfang' && U.dist(x.x, x.y, t.x, t.y) < 130).sort(() => rng.next() - 0.5)[0];
          if (s) {
            if (s.stock) s.stock.food = Math.max(0, (s.stock.food || 0) * 0.55);
            s.prosperity = Math.max(0, (s.prosperity || 50) - 15);
            const dead = P().residents(world, s).filter(n => n.prof !== 'ruler' && !n.ng).sort(() => rng.next() - 0.5).slice(0, rng.int(1, 3));
            for (const n of dead) P().kill(world, n, `${sp.element === 'void' ? 'swallowed by the dark' : sp.element === 'sun' ? 'burned' : 'killed'} when ${t.name} fell on ${s.name}`);
            ECHO.Chronicle.add(world, { text: `Catastrophe: ${t.name} ${t.title} fell on ${s.name}. ${sp.element === 'void' ? 'Half the town went dark and did not come back.' : sp.element === 'sun' ? 'The fields burned white.' : 'The walls are broken.'} ${dead.length ? `${dead.map(n => P().name(n)).join(', ')} ${dead.length > 1 ? 'are' : 'is'} dead.` : ''}`, kind: 'beast', importance: 3, sid: s.id, npcs: dead.map(n => n.id) });
          }
        }
      }
    }
  };
})();
