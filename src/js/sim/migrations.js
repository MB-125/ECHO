// Migrations: beasts on the move, and why.
//
// The wolves of a country do not stay put when something drives them. A great beast settling
// into their range, the lair of a monster hunting them down, hunger when the hares are gone, or
// hunters killing them faster than they breed: any of these can push a pack out — the whole of
// it, over a few days, toward the neighbouring country with the most to eat. Where they arrive
// they are hungry and do not know the land: they take sheep, and shepherds, and the village asks
// for help. Their tracks lie across the country between, all going one way, and a hunter who
// reads them can follow them back to whatever drove them out.
//
// And the chain goes on. Kill off a country's wolves and its hares multiply past counting; a
// country so full of prey draws something bigger to feed on it — a great beast leaves its own
// range and comes. The land is safer for a season, and then it is not.
//
// (Its own dice, so it never disturbs the rest of the world's; all of it kept with the world.)
(function () {
  const { U } = ECHO;
  const Wd = () => ECHO.World, Ti = () => ECHO.Titans;
  const DIRW = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
  const dirWord = (dx, dy) => DIRW[((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8];
  const mid = r => ({ x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 });
  const dx = (world, a, b) => (world.globe && ECHO.Globe ? ECHO.Globe.dx(world, a, b) : b - a);

  const M = ECHO.Migrations = {
    st(world) { return world.migrations || (world.migrations = { list: [], seq: 0 }); },
    active(world) { return M.st(world).list.filter(m => !m.over); },
    head(m) { return Math.max(5, Math.round(m.size * 4)); },   // (how many animals that is)
    byId(world, id) { return M.st(world).list.find(m => m.id === id) || null; },
    // what drives the wolves out of a country, and how hard
    push(world, r) {
      const e = r.eco, K = ECHO.Ecology.capacity(r), c = mid(r);
      const out = [];
      // a great beast has settled in (or is passing close by)
      for (const t of Ti() ? Ti().wild(world) : []) {
        const tx = c.x + dx(world, c.x, t.x);
        if (tx > r.x0 - 4 && tx < r.x1 + 4 && t.y > r.y0 - 4 && t.y < r.y1 + 4) out.push({ kind: 'titan', w: t.mig ? 0.9 : 1.4, ref: t.id, name: `${t.name} ${t.title}` });   // (in their country, or at its edge)
      }
      // a monster's lair, hunting them down
      const ap = ECHO.Ecology.apexPressure(world, r);
      if (ap >= 0.9) { const l = world.lairs.find(l => l.boss.alive && ECHO.Ecology.huntRegions(world, l).includes(r.id)); out.push({ kind: 'lair', w: ap * 0.75, ref: l ? l.id : null, name: l ? `${l.boss.name} ${l.boss.title}` : 'a monster' }); }
      // hunger: too many mouths for the hares there are
      if (e.wolf > 2.5 && e.hare / Math.max(1, e.wolf * 6) < 0.55) out.push({ kind: 'hunger', w: 0.7, name: 'hunger — the hares are gone' });
      // hunted: killed faster than they breed
      const pr = e.pressure && e.pressure.wolf, hits = pr ? pr.melee + pr.ranged + pr.fire : 0;
      if (hits > 7 && e.wolf < K.wolf * 0.7) out.push({ kind: 'hunted', w: Math.min(1.1, hits / 12), name: 'hunters, killing them faster than they breed' });
      out.sort((a, b) => b.w - a.w);
      return { total: out.reduce((a, b) => a + b.w, 0), cause: out[0] || null };
    },
    // where a driven pack goes: the neighbour with the most to eat and the least to fear
    dest(world, r) {
      let best = null, bv = -1e9;
      for (const nb of Wd().regionNeighbors(world, r)) {
        if (!nb.eco || nb.id === r.id) continue;
        const p = M.push(world, nb);
        const v = nb.eco.hare / Math.max(1, nb.eco.wolf * 6 + 4) - p.total * 1.5 + (world.settlements.some(s => Wd().regionAt(world, s.x, s.y) === nb) ? 0.1 : 0);
        if (v > bv) { bv = v; best = nb; }
      }
      return best;
    },
    dailyTick(world) {
      if (!world.regions || !world.player) return;
      const S = M.st(world), rng = new ECHO.RNG(ECHO.hashStr('migr:' + world.seed + ':' + world.day));
      // ---- packs driven out
      if (M.active(world).length < 4) for (const r of world.regions) {
        const e = r.eco;
        if (!e || e.wolf < 2.5) continue;
        if (S.list.some(m => (m.from === r.id || m.to === r.id) && world.day - m.day < 24)) continue;
        const P0 = M.push(world, r);
        if (P0.total < 1 || !P0.cause || !rng.chance(0.18 + 0.1 * Math.min(2, P0.total - 1))) continue;
        if (M.depart(world, r, P0)) break;   // (one a day at most)
      }
      // ---- on the move, and arriving
      for (const m of M.active(world)) {
        const from = world.regions[m.from], to = world.regions[m.to];
        if (!from || !to || !from.eco || !to.eco) { m.over = true; continue; }
        if (m.arrived == null) {
          const step = Math.min(m.size - m.moved, Math.max(0.4, m.size / 4), Math.max(0, from.eco.wolf - 0.3));
          from.eco.wolf -= step; to.eco.wolf += step; m.moved += step;
          if (m.moved >= m.size - 0.05 || step < 0.05) { m.arrived = world.day; M.arrive(world, m, rng); }   // (all of them that could come)
          continue;
        }
        // a hungry pack in strange country: the flocks of the villages there pay for it
        if (m.arrived != null && world.day - m.arrived < 14) {
          for (const s of world.settlements) {
            if (Wd().regionAt(world, s.x, s.y) !== to || s.faction === 'ashfang') continue;
            if (rng.chance(0.35)) {
              const lost = Math.min(s.stock.food || 0, 1.5 + rng.next() * 2.5);
              s.stock.food = Math.max(0, (s.stock.food || 0) - lost); m.raids++;
              s.unrest = Math.min(100, (s.unrest || 0) + 0.6);
              s._raidedBy = m.id; s._raidDay = world.day;
            }
          }
        } else if (m.arrived != null) m.over = true;
      }
      // ---- the long chain: no wolves left, hares past counting, and something bigger comes
      for (const r of world.regions) {
        const e = r.eco;
        if (!e) continue;
        const K = ECHO.Ecology.capacity(r);
        const boom = e.wolf < K.wolf * 0.2 && e.hare > K.hare * 0.8;
        r._boom = boom ? (r._boom || 0) + 1 : 0;
        if (r._boom === 10) {
          ECHO.Chronicle.add(world, { text: `With the duskwolves gone from ${r.name}, the bristlehares have multiplied past counting — the grass is eaten to the roots, and the hunters say something bigger will smell them soon.`, kind: 'nature', importance: 1, x: mid(r).x, y: mid(r).y });
        }
        if (r._boom >= 16 && !r._drew && world.day - (S.drew || -99) > 40 && rng.chance(0.15)) M.drawBeast(world, r, rng);   // (one great beast drawn at a time, and seldom)
      }
    },
    // a country's pack sets out (frac: how much of it goes; away: a place to go away from)
    depart(world, r, P0, frac, away) {
      const S = M.st(world), e = r.eco;
      let to = M.dest(world, r);
      if (away) { const nb = Wd().regionNeighbors(world, r).filter(n => n.eco && n.id !== r.id); const far = nb.sort((a, b) => Math.hypot(dx(world, away.x, mid(b).x), mid(b).y - away.y) - Math.hypot(dx(world, away.x, mid(a).x), mid(a).y - away.y))[0]; if (far) to = far; }
      if (!to || !e) return null;
      const size = Math.max(1.5, e.wolf * (frac || U.clamp(0.35 + 0.2 * P0.total, 0.35, 0.75)));   // (in the world's reckoning of a country's wolves; a few head to each)
      const a = mid(r), b = mid(to);
      const m = { id: 'mg' + (++S.seq), sp: 'wolf', from: r.id, to: to.id, size, moved: 0, day: world.day, cause: P0.cause, ax: a.x, ay: a.y, bx: b.x, by: b.y, raids: 0 };
      S.list.push(m);
      const why = { titan: `${P0.cause.name} has come into their country`, lair: `${P0.cause.name} hunts them down`, hunger: 'they are starving: the hares are gone', hunted: 'they are being hunted out' }[P0.cause.kind] || 'something drove them out';
      ECHO.Chronicle.add(world, { text: `The duskwolves of ${r.name} are leaving it, ${M.head(m)} or more of them, going ${dirWord(dx(world, a.x, b.x), b.y - a.y)} toward ${to.name}. Hunters say ${why}.`, kind: 'nature', importance: away ? 1 : 2, x: a.x, y: a.y });
      if (S.list.length > 40) S.list.splice(0, S.list.length - 40);
      return m;
    },
    // the pack has come: the villages of its new country ask for help
    arrive(world, m, rng) {
      const to = world.regions[m.to], from = world.regions[m.from];
      const towns = world.settlements.filter(s => Wd().regionAt(world, s.x, s.y) === to && s.faction !== 'ashfang');
      ECHO.Chronicle.add(world, { text: `A strange pack of duskwolves has come into ${to.name} out of ${from.name}${towns.length ? ` and is taking the flocks of ${U.listJoin(towns.slice(0, 3).map(s => s.name))}` : ''}.`, kind: 'nature', importance: 2, x: m.bx, y: m.by });
      for (const s of towns.slice(0, 2)) {
        if (world.plights.some(p => p.status === 'open' && p.sid === s.id && p.kind === 'beasts')) continue;
        const hunter = ECHO.People.residents(world, s).find(n => n.prof === 'hunter') || null;
        const why = { titan: `something drove them out — ${m.cause.name}, the hunters think`, lair: `${m.cause.name} has been hunting them there`, hunger: 'they starved out of their own country', hunted: 'they were hunted out of it' }[m.cause.kind] || 'something drove them out';
        ECHO.Plights.post(world, { kind: 'beasts', sid: s.id, requester: hunter ? hunter.id : null, regionId: to.id, need: Math.min(8, Math.max(4, Math.round(M.head(m) / 3))), deadline: world.day + 12, reward: 55 + rng.int(0, 35), migId: m.id,
          text: `A pack of duskwolves none of us have seen before has come down out of ${from.name} into ${to.name}, and they are taking our sheep. ${U.cap(why)}. ${hunter ? hunter.first + ' says their tracks all come from the ' + dirWord(m.ax - m.bx, m.ay - m.by) + '.' : 'Their tracks come from the ' + dirWord(m.ax - m.bx, m.ay - m.by) + '.'}` });
      }
    },
    // a country full of prey draws a great beast out of its own range to feed on it
    drawBeast(world, r, rng) {
      const C = ECHO.Calamity, c = mid(r);
      if (!C || !Ti()) return;
      const t = Ti().wild(world).filter(t => !t.mig && !t.bound).map(t => ({ t, d: Math.hypot(dx(world, c.x, t.x), t.y - c.y) })).filter(o => o.d > 25 && o.d < 160).sort((a, b) => a.d - b.d)[0];
      if (!t) return;
      // somewhere it can stand in that country, clear of the towns
      let to = null;
      for (let k = 0; k < 20 && !to; k++) {
        const x = r.x0 + rng.next() * (r.x1 - r.x0), y = r.y0 + rng.next() * (r.y1 - r.y0);
        if (!C.ok(world, t.t, x, y)) continue;
        if (world.settlements.some(s => Math.hypot(dx(world, s.x, x), s.y - y) < 14)) continue;
        to = { x, y };
      }
      if (!to) return;
      const path = C.route(world, t.t, to);
      if (path === null) return;
      t.t.mig = { to, path: path.length ? path : null, wi: 0, why: 'prey', day: world.day };
      r._drew = world.day; M.st(world).drew = world.day;
      ECHO.Chronicle.add(world, { text: `${t.t.name} ${t.t.title} has left its range and turned toward ${r.name}, drawn by the herds of bristlehares that fill it now the wolves are gone.`, kind: 'nature', importance: 3, x: c.x, y: c.y });
      if (C.tell) C.tell(world, t.t, `${t.t.name} ${t.t.title} is on the move toward ${r.name} — drawn by its hares, now its wolves are gone.`, 120);
    },

    // ------------------------------------------------------------ in the world: the tracks
    // Near a pack on the move (or where it passed in the last days), its tracks: many paws,
    // all one way. Study them (E) and you learn what drove it out, and where from.
    update(game, dt) {
      const world = game.world, pe = game.pe;
      if (!world || !pe || ECHO.Interior.cur || (game.pl && game.pl.flying)) return;
      M._t = (M._t || 0) - dt;
      if (M._t > 0) return;
      M._t = 1.5;
      const m = M.near(game);
      M._near = m;
      if (!m) return;
      // a stretch of the pack's tracks across your way, in the snow or the mud
      const Cl = ECHO.Climate, inTown = world.settlements.some(s => U.dist(s.x, s.y, pe.x, pe.y) < 9);
      if (Cl && Cl.prints && !inTown) {   // (not across the cobbles of a town: they go round)
        const a = Math.atan2(m.by - m.ay, dx(world, m.ax, m.bx));
        const ox = pe.x + Math.cos(a + Math.PI / 2) * (Math.random() * 6 - 3) - Math.cos(a) * 3, oy = pe.y + Math.sin(a + Math.PI / 2) * (Math.random() * 6 - 3) - Math.sin(a) * 3;
        for (let i = 0; i < 6; i++) {
          const k = i * 0.9, side = (i % 2 ? 1 : -1) * 0.12, jit = Math.random() * 0.3;
          Cl.prints.push({ x: ox + Math.cos(a) * k + Math.cos(a + Math.PI / 2) * (side + jit), y: oy + Math.sin(a) * k + Math.sin(a + Math.PI / 2) * (side + jit), a, t: 0, life: 70, hoof: true, snow: false, beast: true });
        }
        while (Cl.prints.length > 260) Cl.prints.shift();
      }
      if (!m.seenBy && !inTown) {
        m.seenBy = true;
        ECHO.UI.toast(`Wolf tracks — dozens of them, fresh, all going ${dirWord(dx(world, m.ax, m.bx), m.by - m.ay)}. A whole pack on the move. (E: study them)`, 'info', 6);
      }
    },
    // the migration whose way you are on (between its two countries, or in either), if any
    near(game) {
      const world = game.world, pe = game.pe;
      for (const m of M.st(world).list) {
        if (m.over && world.day - (m.arrived || m.day) > 6) continue;
        // distance from the line between the two countries' middles
        const ax = m.ax, ay = m.ay, vx = dx(world, ax, m.bx), vy = m.by - ay, L = Math.hypot(vx, vy), wx = dx(world, ax, pe.x), wy = pe.y - ay;
        const t = U.clamp((wx * vx + wy * vy) / Math.max(1, L * L), -0.15, 1.15), px = wx - vx * t, py = wy - vy * t;
        if (Math.hypot(px, py) < 14) return m;
      }
      return null;
    },
    interactables(game) {
      const m = M._near;
      if (!m || m.studied || ECHO.Interior.cur) return [];
      return [{ kind: 'act', label: 'Study the wolf tracks', d: 2.4, act: () => M.study(game, m) }];
    },
    study(game, m) {
      const world = game.world, from = world.regions[m.from], to = world.regions[m.to];
      m.studied = true;
      const c = m.cause || {}, at = c.kind === 'titan' ? Ti().byId(world, c.ref) : c.kind === 'lair' ? world.lairs.find(l => l.id === c.ref) : null;
      const what = { titan: `They were running from ${c.name} — the great beast has made ${from.name} its range. The tracks start there`, lair: `They were fleeing ${c.name}, whose lair is in ${from.name}`, hunger: `They are starving: there is nothing left for them to eat in ${from.name}`, hunted: `They were hunted out of ${from.name} — too many killed, too fast` }[c.kind] || `They came out of ${from.name}`;
      ECHO.UI.modal({ title: '🐾 The tracks', html: `<p class="prose">You crouch over the prints. Big and small, the whole pack, ${M.head(m)} or more of them, moving fast and not hunting as they go — they were going somewhere, out of ${esc(from.name)} toward ${esc(to.name)}.</p><p>${esc(what)}.</p>${at ? '<p class="dim">You could follow them back. Whatever drove them out is still there.</p>' : ''}`,
        choices: [...(at ? [{ label: 'Follow them back (mark it)', onPick: () => { const p = at; game.pl.tracked = `mark:${p.x.toFixed(1)}:${p.y.toFixed(1)}:What drove the wolves out of ${from.name}`; if (ECHO.Purpose) { ECHO.Purpose._html = null; ECHO.Purpose.t = 0; } } }] : []), { label: 'Note it and go on', onPick: () => {} }] });
      if (ECHO.Renown) ECHO.Renown.add(world, 'knowledge', 2, 'read the tracks of a pack on the move');
      if (ECHO.Lore && ECHO.Lore.learn) try { ECHO.Lore.learn(game, 'wolf', 'tracks'); } catch (e) { /* (only a note) */ }
    }
  };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
})();
