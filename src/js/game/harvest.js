// Felling and mining: the land changed by your own hand.
//
// Stand by a tree, a stone, a boulder or the rock face of a mountain and press E. You set to
// it stroke after stroke — keep still: walk off, or take a blow, and you leave off — and it
// comes down. A woodsman's axe or a miner's pick does it in half the strokes; without one you
// hack at it with whatever you carry, and the living rock of a mountain wants a pick. Timber
// and ore go in your pack (markets buy them, and a homestead is built of them), and now and
// then a burl of figured wood, gold, a garnet or a sapphire. The land stays as you leave it — Clearing
// keeps it — a stump where the tree stood, a way cut through the rock; trees grow back in a
// season or two, stone never does. Two crafts grow by it: Woodcutting and Mining.
//
// And the more you do, the faster you get. Your swing quickens with every level of the craft
// and with practice — every tree you have ever felled, every stone you have ever broken, counts,
// and keeps counting — and each level takes strokes off the work. Keep at it, one after another,
// and you find a rhythm that quickens you more (it fades if you stop); hold E and you go on to
// the next one in reach by yourself. A master takes a tree down in two or three quick strokes.
(function () {
  const { U } = ECHO;
  const Cl = () => ECHO.Clearing;
  const P = ECHO.Pastimes;

  Object.assign(P.CRAFTS, {
    wood: { name: 'Woodcutting', icon: '🪓', ranks: ['Hewer', 'Woodcutter', 'Feller', 'Forester', 'Master of the Axe'], perks: { 3: 'You find the grain: each level from here takes more strokes off every tree.', 5: 'An extra load of timber from every tree.', 7: 'Old trees sometimes give a burl of figured wood, which carvers pay well for.', 9: 'Trees come down in a few quick strokes.' } },
    mine: { name: 'Mining', icon: '⛏', ranks: ['Stone-breaker', 'Quarryman', 'Miner', 'Seam-finder', 'Master of the Deep Rock'], perks: { 3: 'You read the stone: each level from here takes more blows off every stone.', 5: 'An extra load of ore from every boulder and seam.', 7: 'Gold and gems turn up in the rock twice as often.', 9: 'The living rock gives to you nearly as easily as a boulder.' } }
  });
  Object.assign(P.howTo, {
    wood: 'Walk up to a tree and press E, then keep still while you swing (hold E to go on to the next one). A woodsman\'s axe (any market) halves the strokes. Every tree you fell makes you quicker — each level, and all your practice — and working one after another finds a rhythm. Each tree gives timber; the stump sprouts again and is a tree in a season or two.',
    mine: 'Walk up to a stone, a boulder on the hills or the rock face of a mountain and press E (hold E to go on to the next). Boulders break with anything; living rock wants a miner\'s pick. Every stone you break makes you quicker. Ore, and now and then gold and gems. What you cut away stays cut.'
  });
  Object.assign(P.GOODS, {
    burl: { name: 'burls of figured wood', value: 30, icon: '🪵' }
  });
  Object.assign(P.TOOLS, {
    axe: { name: 'Woodsman\'s axe', cost: 18, icon: '🪓', use: 'Fell trees in half the strokes (E by a tree). Timber sells, and builds.' },
    pick: { name: 'Miner\'s pick', cost: 24, icon: '⛏', use: 'Break stone in half the blows, and cut into the living rock of the mountains for ore and gems.' }
  });

  // Crafts & pastimes: how quick your hands are at it now
  (P.extraHtml = P.extraHtml || []).push(game => ECHO.Harvest.paceHtml(game, true));
  const paceHtml = (game, both) => {
    const pl = game.pl, row = (wood) => {
      const pc = HV.pace(pl, wood), tool = wood ? pl.inv.axe > 0 : pl.inv.pick > 0;
      const tg = wood ? { k: 'tree' } : { k: 'boulder', s: 1 }, now = HV.plan(pl, tg, tool, 0), first = { n: Math.ceil(Cl().strokes(tg) * (tool ? 1 : (pl.weapon ? 2 : 2.6))), per: tool ? 0.78 : 0.9 };
      const next = HV.MILESTONES.find(m => m > pc.done);
      return `<div class="card"><h4>${wood ? '🪓 Woodcutting' : '⛏ Mining'} — your hands at it</h4><div style="font-size:13px">${pc.done} ${wood ? 'trees felled' : 'stones broken'} · swing <b class="gold">×${(pc.level * pc.practice).toFixed(2)}</b> (level ×${pc.level.toFixed(2)}, practice ×${pc.practice.toFixed(2)}) · ${Math.round((1 - 1 / pc.fewer) * 100)}% fewer strokes</div><div class="dim" style="font-size:12px">A ${wood ? 'tree' : 'boulder'} takes you ${now.n} stroke${now.n > 1 ? 's' : ''}, about ${(now.n * now.per).toFixed(1)} s${tool ? '' : ` (without ${wood ? 'an axe' : 'a pick'})`} — when you began, ${first.n} strokes, ${(first.n * first.per).toFixed(1)} s. Working one after another finds a rhythm, up to ×1.30 more. ${next ? `At ${next} you will be quicker again.` : ''}</div></div>`;
    };
    const st = pl.stats || {}, w = both || st.felled > 0 || pl.inv.axe > 0, m = both || st.mined > 0 || pl.inv.pick > 0;
    if (!w && !m) return '';
    return `<h4 class="ware-h">Felling and mining: quicker with practice</h4>${w ? row(true) : ''}${m ? row(false) : ''}`;
  };

  const INFO = {
    tree: { label: 'Fell the tree', deep: 'Fell the old tree', doing: 'Felling the tree', wood: true, xp: 4 },
    oak: { label: 'Fell the tree', deep: 'Fell the dead tree', doing: 'Felling the tree', wood: true, xp: 2 },
    stone: { label: 'Break the stone', doing: 'Breaking the stone', xp: 1 },
    boulder: { label: 'Break the boulder', doing: 'Breaking the boulder', xp: 3 },
    crag: { label: 'Cut into the rock', doing: 'Cutting into the rock', xp: 4 }
  };
  const NAME = { timber: ['load of timber', 'loads of timber'], ore: ['load of ore', 'loads of ore'], burl: ['burl of figured wood', 'burls of figured wood'], nugget: ['gold nugget', 'gold nuggets'], garnet: ['garnet', 'garnets'], sapphire: ['sapphire', 'sapphires'] };

  const HV = ECHO.Harvest = {
    INFO, paceHtml, job: null, falls: [], _best: null, _bestT: 0, streak: 0, lastDone: -99,
    MILESTONES: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
    reset() { HV.job = null; HV.falls = []; HV._best = null; HV._bestT = 0; HV.streak = 0; HV.lastDone = -99; HV._chainAt = 0; },
    // How quick your hands are at it. Swings: the craft's level (×1.45 at 10) and practice — all
    // you have ever done, which keeps counting (×1.3 at a hundred, ×1.55 at a thousand, ×1.8 at
    // ten thousand) — and the rhythm of working one after another (up to ×1.3, while it lasts).
    // Strokes: each level takes a share off (a master needs fewer than half).
    pace(pl, wood, streak = 0) {
      const lv = P.level(pl, wood ? 'wood' : 'mine'), done = (pl.stats && pl.stats[wood ? 'felled' : 'mined']) || 0;
      const level = 1 + 0.05 * (lv - 1), practice = 1 + 0.12 * Math.log(1 + done / 10), rhythm = 1 + 0.06 * Math.min(5, streak);
      return { lv, done, level, practice, rhythm, swing: level * practice * rhythm, fewer: 1 + 0.08 * (lv - 1) };
    },
    // the strokes and the time of each, for this one, now
    plan(pl, tg, tool, streak) {
      const wood = !!INFO[tg.k].wood, pc = HV.pace(pl, wood, streak);
      let n = Cl().strokes(tg);
      if (!tool) n *= pl.weapon ? 2 : 2.6;
      if (tg.k === 'crag' && pc.lv >= 9) n *= 0.75;
      n = Math.max(1, Math.ceil(n / pc.fewer));
      const per = Math.max(0.26, (tool ? 0.78 : 0.9) / pc.swing);
      return { n, per, pc };
    },
    can(game) {
      const pe = game.pe, pl = game.pl;
      return !!(pe && pl && !pe.dead && !ECHO.Interior.cur && pe.x < 9000 && !pl.flying && !pl.mounted && !pe.mounted && !pe.inBoat && !pe.swimming);
    },
    nameOf(k, n) { if (NAME[k]) return NAME[k][n === 1 ? 0 : 1]; const G = P.GOODS[k]; return G ? (n === 1 ? G.name.replace(/s$/, '') : G.name) : k; },
    // The nearest thing you could take down: in reach, and in front of you or beside you.
    near(game) {
      const world = game.world, pe = game.pe, W = world.W, r0 = pe.r || 0.33;
      const fx = Math.floor(pe.x), fy = Math.floor(pe.y), dir = pe.dir || 0;
      let best = null, bs = Infinity;
      for (let ty = fy - 2; ty <= fy + 2; ty++) for (let tx = fx - 2; tx <= fx + 2; tx++) {
        if (ty < 0 || ty >= world.H) continue;
        const wx = world.globe ? ((tx % W) + W) % W : tx;
        if (wx < 0 || wx >= W) continue;
        const tg = Cl().target(world, wx, ty);
        if (!tg) continue;
        const ox = tx - wx;      // (round a round world's join: where it stands from where you are)
        let d, ax, ay;
        if (tg.k === 'crag') {
          const ex = Math.max(tx - pe.x, 0, pe.x - (tx + 1)), ey = Math.max(ty - pe.y, 0, pe.y - (ty + 1));
          d = Math.hypot(ex, ey) - r0;
          if (d > 0.42) continue;
          ax = tx + 0.5; ay = ty + 0.5;
        } else {
          ax = tg.px + ox; ay = tg.py;
          d = U.dist(ax, ay, pe.x, pe.y) - tg.r - r0;
          if (d > 0.7) continue;
        }
        const off = Math.abs(U.angleDiff(dir, Math.atan2(ay - pe.y, ax - pe.x)));
        if (off > (tg.k === 'crag' ? 1.0 : 1.9)) continue;      // (not the rock behind you as you walk along a cliff)
        const score = d + off * 0.25 + (tg.k === 'crag' ? 0.3 : 0);
        if (score < bs) { bs = score; best = Object.assign({}, tg, { ox, d: Math.max(0, d) }); }
      }
      return best;
    },
    interactables(game) {
      const out = [];
      if (HV.job) {
        out.push({ kind: 'act', label: `${INFO[HV.job.tg.k].doing}… (E, or step away, to stop)`, d: -1, act: () => HV.stop(game, 'You leave off.') });
        return out;
      }
      const tg = HV._best;
      if (!tg || !HV.can(game)) return out;
      const I = INFO[tg.k], pl = game.pl, tool = I.wood ? pl.inv.axe > 0 : pl.inv.pick > 0;
      let label = tg.deep && I.deep ? I.deep : I.label;
      if (tg.k === 'crag' && !tool) label += ' (wants a pick)';
      // (anything else close by — a word with someone, a door, a patch to forage — comes first)
      out.push({ kind: 'act', label, d: 1.15 + tg.d * 0.3, act: () => HV.start(game, tg) });
      return out;
    },

    // ------------------------------------------------------------ the work
    start(game, tg) {
      const world = game.world, pl = game.pl, pe = game.pe, I = INFO[tg.k];
      if (!HV.can(game) || !Cl().target(world, tg.x, tg.y)) return;
      const tool = I.wood ? pl.inv.axe > 0 : pl.inv.pick > 0;
      if (tg.k === 'crag' && !tool) { game.ui.toast('Living rock wants a pick. (A miner\'s pick from any market — then E against the rock face.)', 'info', 5); return; }
      // one after another, and you find a rhythm (it fades if you stop for long)
      HV.streak = game.time - HV.lastDone < 5 && HV._lastWood === !!I.wood ? Math.min(5, HV.streak + 1) : 0;
      const { n, per, pc } = HV.plan(pl, tg, tool, HV.streak), lv = pc.lv;
      if (HV.streak >= 2) ECHO.Combat.floater(pe.x, pe.y - 1.9, `rhythm ×${pc.rhythm.toFixed(2)}`, '#e8d6a8');
      const ax = tg.k === 'crag' ? tg.x + tg.ox + 0.5 : tg.px + tg.ox, ay = tg.k === 'crag' ? tg.y + 0.5 : tg.py;
      HV.job = { tg, n, per, t: 0, done: 0, x0: pe.x, y0: pe.y, hp: pl.hp, tool, wood: !!I.wood, lv, a: Math.atan2(ay - pe.y, ax - pe.x) };
      pe.dir = HV.job.a; pe.chore = 'chop'; pe.choreT = 0.001;
      if (!pl.harvestTold) {
        pl.harvestTold = true;
        game.ui.toast(`You set to the ${I.wood ? 'tree' : 'stone'}. Keep still till it's down — step away, or take a blow, and you leave off.${tool ? '' : ` (${I.wood ? 'A woodsman\'s axe' : 'A miner\'s pick'} from any market does it in half the strokes.)`}`, 'info', 6);
      }
    },
    stop(game, msg) {
      if (!HV.job) return;
      HV.job = null;
      if (game.pe && game.pe.chore === 'chop') game.pe.chore = null;
      if (msg && game.pe) ECHO.Combat.floater(game.pe.x, game.pe.y - 1.4, msg, '#d8d0b8');
    },
    // where the blade bites: the side of the trunk toward you, the face of the rock nearest you
    bite(game, J) {
      const tg = J.tg, pe = game.pe;
      if (tg.k === 'crag') { const x0 = tg.x + tg.ox; return { x: U.clamp(pe.x, x0 + 0.05, x0 + 0.95), y: U.clamp(pe.y, tg.y + 0.05, tg.y + 0.95) }; }
      return { x: tg.px + tg.ox - Math.cos(J.a) * tg.r, y: tg.py - Math.sin(J.a) * tg.r };
    },
    stroke(game, J) {
      const b = HV.bite(game, J);
      ECHO.Sfx.play(J.wood ? 'chop' : 'pick', { pitch: 0.92 + Math.random() * 0.16, vol: J.tool ? 1 : 0.8 });
      ECHO.Combat.burst(b.x, b.y, J.wood ? '#d4b07a' : '#a8a296', J.wood ? 6 : 7, 2.6, 0.45, J.wood ? 2 : 1.6);
      if (!J.wood && Math.random() < 0.45) for (let i = 0; i < 3; i++) ECHO.Combat.fx.push({ kind: 'p', x: b.x, y: b.y, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, t: 0, life: 0.28, color: '#ffe8a8', size: 1.1, spark: true });
      if (J.tg.k === 'crag') game.shake(0.05);
    },
    finish(game) {
      const J = HV.job, world = game.world, pl = game.pl, pe = game.pe, tg = J.tg, I = INFO[tg.k];
      HV.job = null;
      if (pe.chore === 'chop') pe.chore = null;
      const R3 = ECHO.Renderer3D, spec = R3 && R3.natSpec ? R3.natSpec(world, tg.x, tg.y) : null;
      const res = Cl().take(world, tg, { lv: J.lv, who: { first: pl.first, last: pl.last }, m: spec && spec.name, s: spec && spec.s });
      const parts = [], rare = [];
      for (const [k, n] of Object.entries(res.got)) {
        pl.inv[k] = (pl.inv[k] || 0) + n;
        parts.push(`${n} ${HV.nameOf(k, n)}`);
        if (k !== 'timber' && k !== 'ore') rare.push(k);
      }
      const sx = tg.k === 'crag' ? tg.x + tg.ox + 0.5 : tg.px + tg.ox, sy = tg.k === 'crag' ? tg.y + 0.5 : tg.py;
      if (spec) HV.falls.push({ k: tg.k, spec: Object.assign({}, spec, { x: spec.x + tg.ox }), a: J.a, t: 0, lean: 0.35, fallT: 1.35, life: I.wood ? 3.2 : 0.55, x: sx, y: sy });
      if (I.wood) {
        if (!spec) HV.land(game, { k: tg.k, a: J.a, x: sx, y: sy, spec: { s: 1 } });
      } else {
        ECHO.Sfx.play('rubble', { vol: tg.k === 'stone' ? 0.6 : 1 });
        ECHO.Combat.burst(sx, sy, '#8e877a', tg.k === 'stone' ? 10 : 18, 4, 0.7, 2.4);
        ECHO.Combat.fx.push({ kind: 'smoke', x: sx, y: sy, vx: 0, vy: 0, t: 0, life: 1.2, sh: 0.3, grow: 2 });
        game.shake(tg.k === 'crag' ? 0.22 : 0.12);
      }
      ECHO.Combat.floater(pe.x, pe.y - 1.4, parts.length ? '+' + parts.join(', ') : 'nothing in it', parts.length ? '#e8d6a8' : '#b8b0a0');
      if (rare.length) { ECHO.Sfx.play('perfect'); game.ui.toast(`${I.wood ? 'In the heart of the tree' : 'In the broken stone'}: ${rare.map(k => HV.nameOf(k, 1)).join(' and ')}!`, 'legend', 4); }
      // the craft grows (and the peaceful road earns its experience) — though a whole day of it
      // wears thin: past a few dozen, each one teaches you less
      // (the craft itself takes all of it; your level, by the peaceful road, less after a few dozen a day)
      const H = pl.hv && pl.hv.d === world.day ? pl.hv : (pl.hv = { d: world.day, n: 0 });
      H.n++;
      P.gain(game, I.wood ? 'wood' : 'mine', I.xp + rare.length * 4, H.n > 40 ? 0.25 : H.n > 20 ? 0.5 : 1);
      pl.stats = pl.stats || {};
      const key = I.wood ? 'felled' : 'mined';
      pl.stats[key] = (pl.stats[key] || 0) + 1;
      HV.lastDone = game.time; HV._lastWood = !!I.wood; HV._chainAt = game.time; HV._bestT = 0;
      // practice tells: at each milestone, how much quicker you are than when you began
      if (HV.MILESTONES.includes(pl.stats[key])) {
        const now = HV.pace(pl, !!I.wood);
        ECHO.Combat.floater(pe.x, pe.y - 2.2, `${I.wood ? '🪓' : '⛏'} quicker · ×${(now.level * now.practice).toFixed(2)}`, '#ffe08a', true);
        game.ui.toast(`${pl.stats[key]} ${I.wood ? 'trees felled' : 'stones broken'}: your hands know the work now — you swing ${Math.round((now.level * now.practice - 1) * 100)}% quicker than when you began${now.fewer > 1.01 ? `, and need ${Math.round((1 - 1 / now.fewer) * 100)}% fewer strokes` : ''}. (K — your page — shows how far.)`, 'legend', 7);
      }
      if (res.place) game.ui.toast(`So much has come out of this place by your hand that folk will call it ${res.place.name}.`, 'legend', 7);
      if (!pl.harvestSold && (pl.inv.timber || 0) + (pl.inv.ore || 0) >= 4) {
        pl.harvestSold = true;
        game.ui.toast('Timber and ore sell at any market (dearest where a town is building, or short of iron) — and a homestead is built of them.', 'info', 7);
      }
    },
    // a felled tree hitting the ground: the boughs crash, the leaves fly
    land(game, f) {
      const season = ECHO.TIME.dateOf(game.world.day).seasonIdx, s = (f.spec && f.spec.s) || 1;
      const leaf = ['#6aa34a', '#4d8a3c', '#c8702a', '#9aa59c'][season];
      for (let k = 0; k < 4; k++) {
        const d = (0.9 + k * 0.75) * s, x = f.x + Math.cos(f.a) * d, y = f.y + Math.sin(f.a) * d;
        ECHO.Combat.burst(x, y, k < 1 ? '#8a6a44' : leaf, 7, 3.2, 0.8, 2.2);
      }
      ECHO.Combat.fx.push({ kind: 'smoke', x: f.x + Math.cos(f.a) * 1.8 * s, y: f.y + Math.sin(f.a) * 1.8 * s, vx: 0, vy: 0, t: 0, life: 1.4, sh: 0.25, grow: 2.4 });
      ECHO.Sfx.play('timber', { vol: f.k === 'oak' ? 0.7 : 1 });
      game.shake(f.k === 'oak' ? 0.1 : 0.2);
    },

    // ------------------------------------------------------------ each frame
    update(game, dt) {
      for (const f of HV.falls) {
        f.t += dt;
        if (f.k === 'tree' || f.k === 'oak') {
          if (!f.creaked && f.t > 0.05) { f.creaked = true; ECHO.Sfx.play('creak', { vol: f.k === 'oak' ? 0.6 : 1 }); }
          if (!f.landed && f.t >= f.fallT) { f.landed = true; HV.land(game, f); }
        }
        if (f.t > f.life) f.done = true;
      }
      if (HV.falls.some(f => f.done)) HV.falls = HV.falls.filter(f => !f.done);
      if (!game.pe || !game.pl || !game.world) return;
      HV._bestT -= dt;
      if (HV._bestT <= 0) { HV._bestT = 0.12; HV._best = !HV.job && HV.can(game) ? HV.near(game) : null; }
      const J = HV.job;
      if (!J) {
        // hold E, and you go straight on to the next one in reach — walk on with it held, and each
        // you come up against comes down in turn
        if (HV._chainAt && game.time - HV._chainAt < 6 && HV._best && ECHO.Input && ECHO.Input.key && ECHO.Input.key('e') && HV.can(game) && !(game.ui && game.ui.blocksWorld && game.ui.blocksWorld())) { HV._chainAt = game.time; HV.start(game, HV._best); }
        return;
      }
      if (game.ui && game.ui.blocksWorld && game.ui.blocksWorld()) return;
      const pe = game.pe, pl = game.pl;
      const why = !HV.can(game) || pe.attackT > 0 ? '' : U.dist(pe.x, pe.y, J.x0, J.y0) > 0.3 ? 'You leave off.' : pe.hurtT > 0.1 && pl.hp < J.hp ? 'Struck — you drop the work.' : !Cl().target(game.world, J.tg.x, J.tg.y) ? '' : null;
      if (why != null) { HV.lastStop = why || (pe.attackT > 0 ? 'attack' : !HV.can(game) ? 'cannot' : 'gone'); return HV.stop(game, why); }
      J.hp = pl.hp;
      J.t += dt;
      pe.chore = 'chop'; pe.choreT = (J.t / J.per) * 1.35 + 0.001; pe.dir = J.a;
      while (J.t >= (J.done + 1) * J.per) {
        J.done++;
        HV.stroke(game, J);
        if (J.done >= J.n) return HV.finish(game);
      }
    }
  };
})();
