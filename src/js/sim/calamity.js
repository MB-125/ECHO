// Calamities: the titans as forces of the world, not bosses waiting in arenas.
//
// Every dragon and great beast has a class, from a Lesser Calamity that can ruin a
// village to the Primordial one that sleeps and should never be woken. They do not
// stay put: hunger or restlessness sends them across the country to new ground —
// over hills, along valleys, past (or through) the towns in their way. A town in
// the path sees it coming in stages: travellers' tales, then empty roads and dear
// bread, then the beast itself. Two calamities that meet will fight. And where one
// dies, the ground does not forget: some days later a dungeon opens there.
//
// All of it runs in the world's own time (headless, in the daily tick and as the
// clock moves); close to you it becomes a body that walks past with business of its own.
(function () {
  const { U, RNG } = ECHO;
  const Ti = () => ECHO.Titans, Wd = () => ECHO.World;

  // classes by strength
  const CLASSES = [
    { n: 1, roman: 'I', name: 'Lesser Calamity', max: 60, harm: 'can ruin a village', food: 0.12, prosp: 2, dead: [0, 0] },
    { n: 2, roman: 'II', name: 'Greater Calamity', max: 200, harm: 'can threaten a city', food: 0.25, prosp: 6, dead: [0, 1] },
    { n: 3, roman: 'III', name: 'Catastrophic Calamity', max: 500, harm: 'can lay a region waste', food: 0.45, prosp: 12, dead: [1, 2] },
    { n: 4, roman: 'IV', name: 'Extinction Calamity', max: 1000, harm: 'can end a kingdom', food: 0.6, prosp: 20, dead: [2, 4] },
    { n: 5, roman: 'V', name: 'Primordial Calamity', max: Infinity, harm: 'sleeps; it should never be woken', food: 0.8, prosp: 30, dead: [3, 6] }
  ];
  // how far it goes in a day of the world, in leagues (tiles)
  const SPEED = { drake: 60, stag: 32, wyrm: 24 };
  const MAX_MOVING = 3;

  // what lives in the ground where one of them fell, by its element
  const SCAR_ROSTER = {
    fire: [['cinderhound', 4], ['golemling', 1]], frost: [['frosthound', 4], ['wraith', 1]], venom: [['rothound', 3], ['slime', 2]],
    storm: [['stormwisp', 4], ['wraith', 1]], sun: [['sunling', 4], ['golemling', 1]], void: [['voidshade', 4], ['wraith', 1]],
    earth: [['slaggolem', 2], ['golemling', 3]]
  };

  const C = ECHO.Calamity = {
    CLASSES, SPEED, MAX_MOVING,
    cls(t) { const L = (t && t.lvl) || 1; return CLASSES.find(c => L < c.max) || CLASSES[4]; },
    label(t) { const c = C.cls(t); return `Class ${c.roman} · ${c.name}`; },
    now(world) { return world.day * 1440 + (world.minute || 0); },
    moving(world) { return Ti().wild(world).filter(t => t.mig); },
    dirWord(dx, dy) { const a = Math.atan2(dy, dx), i = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8; return ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'][i]; },
    // where it is going, in words
    whither(world, t) {
      if (!t.mig) return null;
      const to = t.mig.to, s = Wd().nearestSettlement ? Wd().nearestSettlement(world, to.x, to.y) : null;
      return `${C.dirWord(to.x - t.x, to.y - t.y)}${s && U.dist(s.x, s.y, to.x, to.y) < 40 ? ', toward the country of ' + s.name : ''}`;
    },
    // the land it can stand on (a dragon flies over anything)
    ok(world, t, x, y) {
      if (x < 2 || y < 2 || x > world.W - 3 || y > world.H - 3) return false;
      if (Ti().sp(t).flies) return true;
      return !Wd().isSolid(world, x, y);
    },

    // A walking one goes round lakes and rivers (a serpent wades the shallows); its road
    // is kept as a few waypoints. A dragon flies straight.
    route(world, t, to) {
      if (Ti().sp(t).flies) return [];
      const TT = ECHO.TILE, wyrm = Ti().sp(t).kind === 'wyrm', W = world.W;
      const cost = (x, y, i) => {
        const tl = world.tiles[i];
        if (tl === TT.DEEP) return Infinity;
        if (tl === TT.WATER) return wyrm ? 2 : Infinity;
        if (tl === TT.ROCK) return 6;
        if (tl === TT.TREE) return 1.6;
        if (world.blocked && world.blocked[i] === 1 && !(tl === TT.TREE || tl === TT.FOREST)) return 9;   // (walls and houses: it would rather go round)
        return 1;
      };
      const path = Wd().findPath(world, Math.floor(t.x), Math.floor(t.y), Math.floor(to.x), Math.floor(to.y), cost, 260000);
      if (!path) return null;
      const out = [];
      for (let k = 5; k < path.length; k += 5) out.push([path[k] % W + 0.5, ((path[k] / W) | 0) + 0.5]);
      return out;
    },
    // the next point on its way
    aim(t) {
      const m = t.mig;
      if (m.path && m.wi < m.path.length) { const p = m.path[m.wi]; if (U.dist(t.x, t.y, p[0], p[1]) < 1.2) m.wi++; if (m.wi < m.path.length) return { x: m.path[m.wi][0], y: m.path[m.wi][1] }; }
      return m.to;
    },
    // ------------------------------------------------------------ moving, as the clock runs
    move(world) {
      if (!world.titans) return;
      const now = C.now(world);
      for (const t of world.titans.list) {
        if (!t.alive || t.bound) { t.movedAt = now; continue; }
        if (!t.home) t.home = { x: t.x, y: t.y };
        const last = t.movedAt == null ? now : t.movedAt;
        t.movedAt = now;
        if (!t.mig) continue;
        if (t.liveAt != null && now - t.liveAt < 6) continue;   // close to you, its own body carries it
        let left = (SPEED[Ti().sp(t).kind] || 30) * Math.min(1440 * 3, Math.max(0, now - last)) / 1440;
        while (left > 0.01 && t.mig) {
          if (U.dist(t.x, t.y, t.mig.to.x, t.mig.to.y) < 1.5) { C.arrive(world, t); break; }
          const to = C.aim(t), d = U.dist(t.x, t.y, to.x, to.y);
          const step = Math.min(left, Math.max(d, 0.05), 1);
          left -= step;
          const a0 = Math.atan2(to.y - t.y, to.x - t.x);
          // on its road it goes where the road goes; off it (a dragon), wherever it can
          let done = false;
          for (const da of t.mig.path ? [0] : [0, 0.5, -0.5, 1.1, -1.1]) {
            const nx = t.x + Math.cos(a0 + da) * step, ny = t.y + Math.sin(a0 + da) * step;
            if (t.mig.path ? nx > 2 && ny > 2 && nx < world.W - 2 && ny < world.H - 2 : C.ok(world, t, nx, ny)) { t.x = nx; t.y = ny; done = true; break; }
          }
          if (!done) { t.mig.stuck = (t.mig.stuck || 0) + 1; if (t.mig.stuck > 6) { C.arrive(world, t, true); break; } }
        }
      }
    },
    arrive(world, t, blocked) {
      const from = t.mig;
      t.mig = null; t.settledDay = world.day; t.home = { x: t.x, y: t.y };
      const s = Wd().nearestSettlement ? Wd().nearestSettlement(world, t.x, t.y) : null;
      ECHO.Chronicle.add(world, { text: `${t.name} ${t.title} ${blocked ? 'could go no further, and' : 'has'} settled on new ground${s ? ` ${Math.round(U.dist(s.x, s.y, t.x, t.y))} leagues ${C.dirWord(t.x - s.x, t.y - s.y)} of ${s.name}` : ''}.`, kind: 'beast', importance: 1, x: t.x, y: t.y });
      // the towns it threatened on the way breathe again
      for (const st of world.settlements) if (st.calamity && st.calamity.tid === t.id) C.clearThreat(world, st, t, false);
      void from;
    },
    // somewhere new on its kind of ground, a long way off, clear of towns and of the others
    pickDest(world, rng, t) {
      const sp = Ti().sp(t), TT = ECHO.TILE, ok = new Set(sp.terr.map(n => TT[n])), far = sp.flies ? 160 : 110;
      for (let i = 0; i < 900; i++) {
        const a = rng.next() * Math.PI * 2, d = 35 + rng.next() * (far - 35);
        const x = Math.floor(t.x + Math.cos(a) * d), y = Math.floor(t.y + Math.sin(a) * d);
        if (x < 8 || y < 8 || x > world.W - 9 || y > world.H - 9) continue;
        if (!ok.has(Wd().tile(world, x, y)) && i < 600) continue;
        if (Wd().isSolid(world, x + 0.5, y + 0.5)) continue;
        if (world.settlements.some(s => U.dist(s.x, s.y, x, y) < 16)) continue;
        if (Ti().wild(world).some(o => o !== t && U.dist(o.x, o.y, x, y) < 14)) continue;
        if (ECHO.Gates && ECHO.Gates.inMenace && ECHO.Gates.inMenace(world, x, y, 16)) continue;
        return { x: x + 0.5, y: y + 0.5 };
      }
      return null;
    },
    start(world, rng, t, why) {
      const sp = Ti().sp(t);
      let to = null;
      for (let k = 0; k < 6 && !to; k++) {
        const p = C.pickDest(world, rng, t);
        if (!p) continue;
        const d = U.dist(p.x, p.y, t.x, t.y);
        if (!(d > 30 && d < (sp.flies ? 170 : 120))) continue;
        const path = C.route(world, t, p);
        if (path === null) continue;   // (no way there on foot)
        to = { x: p.x, y: p.y, path };
      }
      if (!to) return false;
      t.mig = { to: { x: to.x, y: to.y }, path: to.path.length ? to.path : null, wi: 0, why, day: world.day };
      const s = Wd().nearestSettlement ? Wd().nearestSettlement(world, to.x, to.y) : null;
      ECHO.Chronicle.add(world, { text: `${t.name} ${t.title} has left its ${why === 'hunger' ? 'hunted-out ' : ''}range and is on the move ${C.dirWord(to.x - t.x, to.y - t.y)}${s ? `, toward the country around ${s.name}` : ''}. (${C.label(t)})`, kind: 'beast', importance: C.cls(t).n >= 3 ? 3 : 2, x: t.x, y: t.y });
      C.tell(world, t, `${t.name} ${t.title} is on the move ${C.dirWord(to.x - t.x, to.y - t.y)}${s ? `, toward ${s.name}` : ''}. ${C.label(t)} — it ${C.cls(t).harm}.`, 120);
      return true;
    },

    // ------------------------------------------------------------ every day
    daily(world, rng) {
      if (!world.titans) return;
      C.move(world);
      const S = world.titans;
      for (const t of S.list) {
        if (!t.home) t.home = { x: t.x, y: t.y };
        if (!t.alive && t.scar && !t.scar.made && world.day >= t.scar.day) C.openScar(world, rng, t);
        if (!t.alive || t.bound) continue;
        const cl = C.cls(t);
        // the small things flee where it goes
        const r = Wd().regionAt(world, t.x, t.y), e = r && r.eco;
        if (e && t.mig) { if (e.hare) e.hare = Math.max(0.3, e.hare * 0.75); if (e.wolf) e.wolf = Math.max(0.3, e.wolf * 0.85); }
        // restlessness: a hunted-out range, or the urge to move on
        if (!t.mig && cl.n < 5 && C.moving(world).length < MAX_MOVING && world.day - (t.settledDay || t.born || 0) > 10 && !(world.player && U.dist(world.player.x, world.player.y, t.x, t.y) < 30)) {
          if ((t.hunger || 0) >= 4 && rng.chance(0.5)) C.start(world, rng, t, 'hunger');
          else if (rng.chance(0.03)) C.start(world, rng, t, 'wander');
        }
        if (t.mig) C.threats(world, rng, t);
      }
      C.clashes(world, rng);
      // old threats that no longer hold
      for (const st of world.settlements) if (st.calamity) {
        const t = Ti().byId(world, st.calamity.tid);
        if (!t || !t.alive || t.bound || !t.mig) C.clearThreat(world, st, t, !!(t && (!t.alive || t.bound)));
      }
    },

    // ------------------------------------------------------------ a town in the way
    // How near its road comes to a town: the closest point of its way from here to where it goes.
    nearest(t, s) {
      const m = t.mig;
      if (m.path && m.wi < m.path.length) { let best = U.dist(s.x, s.y, t.x, t.y); for (let k = m.wi; k < m.path.length; k++) best = Math.min(best, U.dist(s.x, s.y, m.path[k][0], m.path[k][1])); return Math.min(best, U.dist(s.x, s.y, m.to.x, m.to.y)); }
      const ax = t.x, ay = t.y, bx = t.mig.to.x, by = t.mig.to.y, vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1;
      const k = U.clamp(((s.x - ax) * vx + (s.y - ay) * vy) / L2, 0, 1);
      return U.dist(s.x, s.y, ax + vx * k, ay + vy * k);
    },
    threats(world, rng, t) {
      const cl = C.cls(t);
      for (const s of world.settlements) {
        if (s.faction === 'ashfang' || s.frontier && s.ruined) continue;
        const d = U.dist(s.x, s.y, t.x, t.y);
        const inWay = C.nearest(t, s) < 12;
        let th = s.calamity && s.calamity.tid === t.id ? s.calamity : null;
        if (!th && inWay && d < 55) {
          // stage 1: the signs
          th = s.calamity = { tid: t.id, stage: 1, since: world.day, hit: false };
          ECHO.Chronicle.add(world, { text: `Travellers coming into ${s.name} speak of ${t.name} ${t.title}: the birds gone quiet, the herds running, and the thing itself on the move — this way.`, kind: 'beast', importance: 1, sid: s.id });
          C.tell(world, t, `Word from ${s.name}: ${t.name} (${C.label(t)}) is coming their way. Its road passes ${C.nearest(t, s) < 5 ? 'right through the town' : 'close by'}.`, 90, s);
        }
        if (!th) continue;
        if (th.stage < 2 && d < 30) {
          // stage 2: roads emptied, trade stalls; they ask for help
          th.stage = 2;
          ECHO.Chronicle.add(world, { text: `${s.name} has shut its gates to the road: ${t.name} is close. Carts stay in, prices climb, and the reeve asks anyone who can to turn the beast away.`, kind: 'beast', importance: 2, sid: s.id });
          C.tell(world, t, `${s.name} asks for help: ${t.name} is near and coming on. Slay it or bind it before it reaches them, and the town will not forget it.`, 70, s);
        }
        if (th.stage >= 2 && !th.hit) {
          s.prosperity = Math.max(0, (s.prosperity || 50) - 1);
          if (s.stock && s.stock.food) s.stock.food *= 0.97;
        }
        if (!th.hit && d < 9) {
          // stage 3: it reaches them
          th.hit = true; th.stage = 3;
          C.strike(world, rng, t, s, cl);
        }
        // past them and going away: stage 4, what is left
        if (th.hit && d > 40) C.clearThreat(world, s, t, false);
      }
    },
    strike(world, rng, t, s, cl) {
      const sp = Ti().sp(t);
      if (s.stock) s.stock.food = Math.max(0, (s.stock.food || 0) * (1 - cl.food));
      s.prosperity = Math.max(0, (s.prosperity || 50) - cl.prosp);
      const P = ECHO.People;
      const gar = ECHO.GuardWork && ECHO.GuardWork.garrisonOf ? ECHO.GuardWork.garrisonOf(world, s.id) : null;
      let dead = [];
      const n = rng.int(cl.dead[0], cl.dead[1]) - (gar ? 1 : 0);
      if (P && n > 0) {
        dead = P.residents(world, s).filter(x => x.prof !== 'ruler' && !x.ng && x !== gar).sort(() => rng.next() - 0.5).slice(0, n);
        for (const x of dead) P.kill(world, x, `killed when ${t.name} came through ${s.name}`);
      }
      const what = cl.n >= 3 ? (sp.element === 'fire' || sp.element === 'sun' ? 'Roofs burned; the granary is ash.' : sp.element === 'frost' ? 'The wells froze and the walls split.' : sp.element === 'void' ? 'Whole streets went dark and silent.' : 'Walls broken, roofs stove in.') : 'It took the herds and trampled the fields.';
      ECHO.Chronicle.add(world, { text: `${t.name} ${t.title} came through ${s.name}. ${what}${dead.length ? ` ${dead.length} died.` : ' No one died.'}${gar ? ` The National Guard held the people together.` : ''}`, kind: 'beast', importance: cl.n >= 2 ? 3 : 2, sid: s.id, npcs: dead.map(x => x.id) });
      C.tell(world, t, `${t.name} has reached ${s.name}. ${what}`, 120, s);
      s.lastCalamity = { tid: t.id, name: t.name, day: world.day };
    },
    clearThreat(world, s, t, beaten) {
      const th = s.calamity;
      s.calamity = null;
      if (!th || !t) return;
      if (beaten) ECHO.Chronicle.add(world, { text: `${s.name} breathes again: ${t.name} will not reach it now.`, kind: 'beast', importance: 2, sid: s.id });
      else if (th.hit) ECHO.Chronicle.add(world, { text: `${t.name} has gone on past ${s.name}, and the town counts what it lost and begins to rebuild.`, kind: 'beast', importance: 1, sid: s.id });
      else if (th.stage >= 1) ECHO.Chronicle.add(world, { text: `${t.name} turned aside before ${s.name}; its gates open to the road again.`, kind: 'beast', importance: 1, sid: s.id });
    },
    // the towns it was bearing down on, when you stop it: their thanks
    stoppedBy(world, t, pl, how) {
      const out = [];
      for (const s of world.settlements) {
        if (!s.calamity || s.calamity.tid !== t.id || s.calamity.hit) continue;
        const gold = Math.round(40 + t.lvl * 2.5 * C.cls(t).n);
        if (pl) {
          pl.gold = (pl.gold || 0) + gold; pl.renown = (pl.renown || 0) + 4 * C.cls(t).n;
          for (const n of ECHO.People ? ECHO.People.residents(world, s) : []) if (n.op) n.op[pl.charId] = (n.op[pl.charId] || 0) + 12;
          ECHO.Chronicle.add(world, { text: `${pl.first} ${pl.last} ${how} ${t.name} before it reached ${s.name}. The town sent ${gold} crowns and its thanks.`, kind: 'player', importance: 3, sid: s.id, char: pl.charId });
        }
        out.push({ s, gold });
        C.clearThreat(world, s, t, true);
      }
      return out;
    },

    // ------------------------------------------------------------ when two meet
    clashes(world, rng) {
      const wild = Ti().wild(world);
      for (let i = 0; i < wild.length; i++) for (let j = i + 1; j < wild.length; j++) {
        const a = wild[i], b = wild[j];
        if (!(a.mig || b.mig) || U.dist(a.x, a.y, b.x, b.y) > 11) continue;
        const key = [a.id, b.id].sort().join('|');
        world.titans.clash = world.titans.clash || {};
        if (world.day - (world.titans.clash[key] || -99) < 25) continue;
        world.titans.clash[key] = world.day;
        if (!rng.chance(0.45)) continue;   // (as often as not they keep their distance)
        if (world.player && U.dist(world.player.x, world.player.y, a.x, a.y) < 50) continue;   // (near you, they fight in the flesh)
        const pa = a.lvl * (0.7 + rng.next() * 0.6) * (a.hp || 1), pb = b.lvl * (0.7 + rng.next() * 0.6) * (b.hp || 1);
        const win = pa >= pb ? a : b, lose = win === a ? b : a;
        const slain = win.lvl > lose.lvl * 2.5 || rng.chance(0.1);
        const s = Wd().nearestSettlement ? Wd().nearestSettlement(world, lose.x, lose.y) : null;
        win.hp = Math.max(0.35, (win.hp || 1) - 0.3);
        if (slain) {
          Ti().slain(world, lose, `${win.name} ${win.title}`);
        } else {
          lose.hp = 0.25;
          if (!lose.mig) C.start(world, rng, lose, 'driven');
        }
        ECHO.Chronicle.add(world, { text: `Two calamities met${s ? ` ${Math.round(U.dist(s.x, s.y, lose.x, lose.y))} leagues from ${s.name}` : ''}: ${win.name} and ${lose.name}. The fight scarred the land for a league around; ${slain ? `${lose.name} did not get up` : `${lose.name} fled, bleeding`}.`, kind: 'beast', importance: 3, x: lose.x, y: lose.y });
        C.tell(world, win, `Far off, the sky flickers and the ground shudders for an hour: ${win.name} and ${lose.name} have fought. ${slain ? `${lose.name} is dead.` : `${lose.name} fled.`}`, 200);
      }
    },

    // ------------------------------------------------------------ where one fell
    // Schedules a dungeon to open where a titan died (called by Titans.slain).
    markScar(world, t) {
      if (t.scar) return;
      t.scar = { x: t.x, y: t.y, day: world.day + 6 + ((ECHO.hashStr ? ECHO.hashStr(t.id) : 3) % 5), lvl: t.lvl, made: false };
    },
    openScar(world, rng, t) {
      const sc = t.scar;
      sc.made = true;
      if (!ECHO.Explore || !world.sites) return null;
      let spot = null;
      for (let r = 0; r < 14 && !spot; r++) for (let k = 0; k < 16 && !spot; k++) {
        const a = rng.next() * Math.PI * 2, x = Math.round(sc.x + Math.cos(a) * r), y = Math.round(sc.y + Math.sin(a) * r);
        if (x < 3 || y < 3 || x > world.W - 4 || y > world.H - 4 || Wd().isSolid(world, x + 0.5, y + 0.5)) continue;
        if (world.settlements.some(s => U.dist(s.x, s.y, x, y) < 9) || world.sites.some(s => U.dist(s.x, s.y, x, y) < 6)) continue;
        spot = { x, y };
      }
      if (!spot) return null;
      const sp = Ti().sp(t);
      const site = { id: 'site' + world.sites.length + '_scar', cat: 'delve', kind: 'scar', name: `the Scar of ${t.name}`, x: spot.x + 0.5, y: spot.y + 0.5, found: false, cleared: false, used: {},
        level: U.clamp(Math.round(t.lvl * 0.35), 4, 150), lv2: 1, roster: SCAR_ROSTER[sp.element] || SCAR_ROSTER.earth, of: t.id, opened: world.day };
      world.sites.push(site);
      ECHO.Chronicle.add(world, { text: `Where ${t.name} fell, the ground has opened. Something of the beast is still down there — and things have come to feed on it. (A new dungeon: ${site.name}, level ${site.level}.)`, kind: 'beast', importance: 2, x: site.x, y: site.y });
      C.tell(world, t, `Where ${t.name} fell, the ground has opened: ${site.name}. The first to go down will find the most.`, 400, null, site);
      return site;
    },

    // ------------------------------------------------------------ word reaching you
    // News for the player (shown by the game, if they are near enough to hear it).
    tell(world, t, text, range, s, site) {
      const pl = world.player;
      if (!pl || !ECHO.UI || !ECHO.UI.toast || !ECHO.Game || ECHO.Game.world !== world || ECHO.Game.ff) return;
      const x = s ? s.x : site ? site.x : t.x, y = s ? s.y : site ? site.y : t.y;
      if (U.dist(pl.x, pl.y, x, y) > range) return;
      ECHO.UI.toast(text, 'legend', 8);
      if (site) site.seen = true;
    }
  };
})();
