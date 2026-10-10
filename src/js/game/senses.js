// Senses: hearing, and the search that follows losing sight of you.
//
// Noise carries: running feet a few strides, steel on steel much further, a
// fireball or a shout across a whole dungeon floor. Anyone hostile who hears
// it and isn't already fighting turns toward it and comes to look.
//
// And losing sight of you is not forgetting you. A fighter who loses you goes
// to where you were last seen, stands and looks about, then checks the nearby
// cover — bushes, the trees, behind the wagon — a few places in turn, calling
// out as they go. A squad splits up to cover more ground. After a while they
// give up ("Must have been the wind") and go back to what they were doing,
// a little more watchful for the rest of the day. Wolves follow your scent
// instead, until you wade through water and break the trail.
(function () {
  const { U } = ECHO;
  const T = ECHO.TILE;

  const S = ECHO.Senses = {
    t: 0,
    // ------------------------------------------------------------ hearing
    noise(game, x, y, r, o = {}) {
      for (const e of game.ents) {
        if (e.dead || e.hidden || e === game.pe || e.isCompanion || e.pet || e === o.by || e.rout || e.yielded) continue;
        const d = U.dist(e.x, e.y, x, y);
        if (d > r) continue;
        if (e.x >= 9000 !== x >= 9000) continue;
        const hostile = e.foe || game.hostileTo(e, game.pe) || (e.type === 'creature' && e.species === 'wolf');
        if (!hostile) { if (e.type === 'person' && !e.target && o.kind !== 'step') S.turnTo(e, x, y); continue; }
        if (e.target || e.aggro && e.foe) continue;
        // muffled by distance: the far ones only half-hear it
        const clear = 1 - d / r;
        e.sus = Math.max(e.sus || 0, 0.35 + clear * 0.4); e.susAt = game.time;
        S.investigate(game, e, x, y, o.kind === 'step' ? 0.6 : 1.4);
        if (!e.susShown) { e.susShown = true; e.say = o.kind === 'fight' ? 'Fighting?' : o.kind === 'shout' || o.kind === 'call' ? 'What was that?' : '?'; e.sayT = 1.4; }
      }
    },
    turnTo(e, x, y) { e.dir = Math.atan2(y - e.y, x - e.x); e.flip = Math.cos(e.dir) < 0; e.lookAt = { x, y, t: ECHO.Game.time }; },
    // go and look where something was heard or last seen
    investigate(game, e, x, y, spread) {
      const t = game.time;
      if (e.search && t - e.search.t0 < 2) { e.search.x = x; e.search.y = y; return; }
      e.search = { x, y, t0: t, phase: 'go', pts: [], spread: spread || 1, said: false };
    },
    // the moment a fighter loses its quarry
    lost(game, e, x, y) {
      if (e.search) return;
      S.investigate(game, e, x, y, 1.5);
      e.search.lost = true;
      // a squad splits up: each takes a different side
      const mates = game.ents.filter(o => o !== e && !o.dead && o.search && o.search.lost && U.dist(o.search.x, o.search.y, x, y) < 4).length;
      e.search.side = mates;
    },
    // a few nearby places worth checking: cover first
    searchPoints(game, e, x, y, side) {
      const world = game.world, pts = [];
      const inside = x >= 9000;
      for (let k = 0; k < 24 && pts.length < 3; k++) {
        const a = (side || 0) * 2.1 + k * 0.9 + Math.random() * 0.6, r = 2 + Math.random() * 4.5;
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        if (ECHO.World.isSolid(world, px, py)) continue;
        if (!inside) {
          const tt = ECHO.World.tile(world, Math.floor(px), Math.floor(py));
          const cover = ECHO.Stealth ? ECHO.Stealth.coverAt(world, px, py) : 0;
          if (cover < 0.3 && k < 14 && tt !== T.FOREST) continue;
        }
        pts.push({ x: px, y: py });
      }
      return pts;
    },
    // returns true while the search is driving the fighter
    search(game, e, dt) {
      const s = e.search; if (!s) return false;
      const world = game.world, t = game.time;
      const speed = e.speed * (s.phase === 'go' ? 0.85 : 0.55);
      const lines = e.foe ? (e.foe.look === 'goblin' ? ['Where it go?', 'Sniff it out!', 'Come out, come out…'] : ['…', '…where…', '…']) : e.type === 'creature' ? null : ['Where did you go?', 'Come out, coward!', 'I know you\'re here…', 'Check the bushes!', 'Spread out!'];
      if (!s.said && lines && e.sayT <= 0) { s.said = true; e.say = lines[Math.floor(Math.random() * lines.length)]; e.sayT = 2; }
      if (s.phase === 'go') {
        if (U.dist(e.x, e.y, s.x, s.y) > 0.8 && ECHO.Ent.travel(world, e, s.x, s.y, speed, dt) !== true) {
          if (e.navFail || (e.stuck || 0) > 1.2) { e.navFail = false; s.phase = 'look'; s.tl = t; }
        } else { s.phase = 'look'; s.tl = t; e.moving = false; }
        return true;
      }
      if (s.phase === 'look') {
        e.moving = false;
        e.dir = (e.dir || 0) + Math.sin((t - s.tl) * 2.2) * dt * 2.4; e.flip = Math.cos(e.dir) < 0;
        if (t - s.tl > 1.8) { s.pts = S.searchPoints(game, e, s.x, s.y, s.side); s.phase = 'sweep'; s.tl = t; }
        return true;
      }
      if (s.phase === 'sweep') {
        const p = s.pts[0];
        if (!p || t - s.t0 > 22) {
          e.search = null;
          e.watchful = t;                         // a little sharper for a while
          if (lines && e.sayT <= 0) { e.say = e.foe ? '…' : ['Must have been the wind.', 'Gone. For now.', 'Keep your eyes open.', 'Nothing. Back to it.'][Math.floor(Math.random() * 4)]; e.sayT = 2; }
          e.sus = Math.min(e.sus || 0, 0.25);
          return false;
        }
        if (U.dist(e.x, e.y, p.x, p.y) > 0.7 && !((e.stuck || 0) > 1.2)) ECHO.Ent.travel(world, e, p.x, p.y, speed, dt);
        else { e.stuck = 0; s.pts.shift(); if (e.type === 'person' && e.sayT <= 0 && Math.random() < 0.4) { e.say = ['Not here.', 'Nothing.', 'Hmm.'][Math.floor(Math.random() * 3)]; e.sayT = 1.2; } }
        return true;
      }
      return false;
    },
    // wolves follow the scent; water breaks the trail
    scent(game, e, dt, speed) {
      const pe = game.pe, world = game.world;
      if (!e.scentT || game.time - e.scentT > 30) return false;
      if (pe._inWater || pe.inBoat || pe.mounted && U.dist(e.x, e.y, pe.x, pe.y) > 14) { e.scentT = 0; e.say = '*whine*'; e.sayT = 1.2; return false; }
      const d = U.dist(e.x, e.y, pe.x, pe.y);
      if (d > 26) { e.scentT = 0; return false; }
      // nose down along the trail: roughly toward you, weaving
      const a = Math.atan2(pe.y - e.y, pe.x - e.x) + Math.sin(game.time * 1.7 + e.id) * 0.6;
      ECHO.Ent.seek(world, e, e.x + Math.cos(a) * 2, e.y + Math.sin(a) * 2, speed * 0.55, dt, 0.2);
      e.state = 'roam';
      if (Math.random() < dt * 0.3) { e.say = '*sniff*'; e.sayT = 0.8; }
      return true;
    },
    // ------------------------------------------------------------ each frame
    update(game, dt) {
      const pe = game.pe, pl = game.pl;
      if (!pe || pl.capture) return;
      S.t -= dt;
      if (S.t > 0) return;
      S.t = 0.4;
      // your own footsteps
      const run = pe.moving && !ECHO.PlayerCtl.sneaking;
      if (run) S.noise(game, pe.x, pe.y, pe.mounted ? 7.5 : 3.6, { kind: 'step', by: pe });
    }
  };
})();
