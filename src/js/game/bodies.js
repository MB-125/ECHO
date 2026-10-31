// Dungeons that are alive, and dungeons that walk.
//
// The great serpents — Mawtide, and Grimmaw the Mountain Wyrm — sleep at night with their
// jaws open; creep up on one (crouch) and you can climb down its throat, into a labyrinth
// of living chambers where parasites and its own defences live, and where the walls
// clench and spit acid at you. Kill what lives at its heart and the beast itself is
// wounded. And Ironback, the Walking Keep, carries a ruined fortress on its back across
// the country: walk beside it and climb up, and fight the cursed garrison that still holds
// it, while the whole keep lurches with every step the beast takes. Neither place stays
// the same: each time you go in, it has shifted — and when you come out, you come out
// wherever the beast has got to.
(function () {
  const { U } = ECHO;
  const UI = () => ECHO.UI, Ti = () => ECHO.Titans;
  const B = ECHO.Bodies = {
    MAW: new Set(['mawtide', 'grimmaw']),
    // the dungeon a body holds (made the first time, kept with the world)
    site(world, t, kind) {
      const list = world.bodySites = world.bodySites || [];
      let s = list.find(x => x.mobileOf === t.id && x.kind === kind);
      if (!s) {
        s = { id: 'body_' + kind + '_' + t.id, cat: 'delve', kind, name: kind === 'maw' ? `the belly of ${t.name}` : `the keep on ${t.name}'s back`, x: t.x, y: t.y, found: true, seen: true, cleared: false, used: {},
          level: U.clamp(Math.round(t.lvl * (kind === 'maw' ? 0.32 : 0.3)), 6, 150), lv2: 1, mobileOf: t.id, shift: 0 };
        list.push(s);
      }
      return s;
    },
    // a way in, by the beast
    interactables(game) {
      const out = [], pe = game.pe, pl = game.pl, world = game.world;
      if (pl.flying || ECHO.Interior.cur || !ECHO.Apex) return out;
      for (const e of ECHO.Apex.ents(game)) {
        if (e.tamed || e.aggro || e.state === 'subdued' || e.lureTo) continue;
        const t = Ti().byId(world, e.titan), sp = t && Ti().sp(t);
        if (!t || !sp) continue;
        const d = U.dist(e.x, e.y, pe.x, pe.y), reach = (ECHO.Apex.bodyR ? ECHO.Apex.bodyR(e) : e.r || 1) + 2.6;
        if (d > reach) continue;
        if (B.MAW.has(t.sp) && (e.state === 'roost' || e.state === 'feed') && ECHO.Apex.night(world)) out.push({ kind: 'act', label: `Climb into ${t.name}'s open maw while it sleeps`, d: d * 0.5, act: () => B.enter(game, t, 'maw') });
        if (sp.fortress) out.push({ kind: 'act', label: `Climb onto ${t.name}'s back — to the keep it carries`, d: d * 0.5, act: () => B.enter(game, t, 'backkeep') });
      }
      return out;
    },
    enter(game, t, kind) {
      const world = game.world, s = B.site(world, t, kind);
      if (s.cleared) ECHO.Explore.refill(world, s);
      s.shift = (s.shift || 0) + 1;            // (it has moved: inside, it is not as it was)
      s.x = t.x; s.y = t.y;
      s.floorsDone = s.floorsDone || {};
      if (!s.cleared) s.floorsDone = {};       // (what lives in it has filled it again)
      UI().toast(kind === 'maw' ? `You slip between ${t.name}'s teeth and down into the dark. It is warm, and it is breathing.` : `You climb ${t.name}'s flank, hand over hand up the old stones, and over the wall of the keep. The whole of it sways.`, 'legend', 6);
      ECHO.Quests.enterDelve(game, s, 0);
    },
    // coming out: wherever the beast has got to
    beforeLeave(game, L) {
      const s = L && L.site;
      if (!s || !s.mobileOf) return;
      const t = Ti().byId(game.world, s.mobileOf);
      if (!t || !t.alive) return;
      const sp = ECHO.Ent.freeSpot(game.world, t.x + 4, t.y + 3, 8);
      if (sp) { L.outside = { x: sp.x, y: sp.y }; s.x = sp.x; s.y = sp.y - 1.6; }
    },
    // inside: the body answers
    tick(game, dt) {
      const L = ECHO.Interior.cur, pe = game.pe;
      if (!L || !L.site || !L.site.mobileOf || !pe || pe.dead) { B._acid = []; return; }
      const maw = L.site.kind === 'maw';
      B._t = (B._t == null ? 12 : B._t) - dt;
      // the acid it spat: hurts what still stands in it when it lands
      for (const a of B._acid || []) {
        a.t -= dt;
        if (a.t <= 0 && !a.done) {
          a.done = true;
          if (U.dist(a.x, a.y, pe.x, pe.y) < a.r) ECHO.Combat.damage(pe, Math.max(6, game.pl.maxHp * 0.09), { type: 'fire', from: null, unblockable: true });
          ECHO.Combat.burst(a.x, a.y, maw ? '#b8e04a' : '#8a8070', 14, 3, 0.5, 2);
        }
      }
      B._acid = (B._acid || []).filter(a => a.t > -0.5);
      if (B._t > 0) return;
      B._t = 13 + Math.random() * 8;
      game.shake(maw ? 0.4 : 0.55);
      if (maw) {
        ECHO.Combat.floater(pe.x, pe.y - 1.6, 'the walls clench!', '#ff8aa0', true);
        if (ECHO.Sfx) ECHO.Sfx.play('growl', { pitch: 0.45 });
      } else {
        ECHO.Combat.floater(pe.x, pe.y - 1.6, `the keep lurches — ${Ti().byId(game.world, L.site.mobileOf) ? Ti().byId(game.world, L.site.mobileOf).name : 'it'} walks`, '#d8c8a0', true);
        if (ECHO.Sfx) ECHO.Sfx.play('stomp', { pitch: 0.6 });
        const a = Math.random() * 6.28; pe.kbx = (pe.kbx || 0) + Math.cos(a) * 0.9; pe.kby = (pe.kby || 0) + Math.sin(a) * 0.9;
      }
      // spat acid (or falling stones), marked where it will land
      for (let i = 0; i < 3; i++) {
        const x = pe.x + (Math.random() - 0.5) * 6, y = pe.y + (Math.random() - 0.5) * 6;
        if (ECHO.World.isSolid(game.world, x, y)) continue;
        const r = 1.1 + Math.random() * 0.4;
        B._acid.push({ x, y, r, t: 1.1 });
        ECHO.Combat.fx.push({ kind: 'zone', x, y, radius: r, t: 0, life: 1.2, color: maw ? 'rgba(184,224,74,1)' : 'rgba(200,180,140,1)' });
      }
      // and its defences wake
      if (maw && Math.random() < 0.55) {
        const lvl = ECHO.Explore.floorLevel(L.site, L.depth || 0);
        for (let i = 0; i < 2; i++) {
          const sp = ECHO.Ent.freeSpot(game.world, pe.x + (Math.random() - 0.5) * 8, pe.y + (Math.random() - 0.5) * 8, 4);
          if (!sp || U.dist(sp.x, sp.y, pe.x, pe.y) < 3) continue;
          const m = ECHO.Monsters.make(game, i ? 'slimeling' : 'slime', sp.x, sp.y, lvl, { noElite: true });
          m.delve = L.site.id; m.indoor = true; m.floor = L.depth; m.aggro = true; m.target = pe; m.spawned = true;
          game.addEnt(m);
        }
        ECHO.Combat.floater(pe.x, pe.y - 2.2, 'something stirs in the walls', '#e8a0b0');
      }
    },
    // the heart of it is dead, or the keep is taken
    onCleared(game, site) {
      if (!site || !site.mobileOf) return;
      const world = game.world, t = Ti().byId(world, site.mobileOf);
      if (!t) return;
      if (site.kind === 'maw') {
        t.hp = Math.min(t.hp || 1, 0.3);
        ECHO.Chronicle.add(world, { text: `${game.pl.first} ${game.pl.last} went down ${t.name}'s throat and killed what lived at its heart. The beast is sick and weak for a while.`, kind: 'player', importance: 3, x: t.x, y: t.y, char: game.pl.charId });
        UI().toast(`Deep in ${t.name}, what lived at its heart is dead. The whole beast shudders — it will be weak for a while.`, 'legend', 7);
      } else {
        ECHO.Chronicle.add(world, { text: `${game.pl.first} ${game.pl.last} climbed ${t.name}'s flank and took the keep on its back from its dead garrison.`, kind: 'player', importance: 3, x: t.x, y: t.y, char: game.pl.charId });
      }
      if (ECHO.Lore) ECHO.Lore.add(game, 'titan', 20);
    }
  };
})();
