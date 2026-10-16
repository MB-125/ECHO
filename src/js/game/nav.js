// The navigator: the way to wherever you are headed, not just the direction.
//
// For the place you are making for (a quest, a dungeon, a mark on the map) it
// plans a real route over the land — keeping to roads and bridges, going round
// lakes, cliffs and deep water, through woods and over hills only when that is
// shorter — and keeps it up to date as you go (stray off it and it re-plans
// from where you are). What you see:
//   · the line at the top points along the route, not through the lake, and
//     says how: "follow the road north", "through the woods to the east";
//   · a faint trail of lights on the ground for the next stretch;
//   · the route drawn on the minimap and the world map;
//   · N: everything you could be heading for, nearest first — pick one.
(function () {
  const { U } = ECHO;
  const T = () => ECHO.TILE;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const DIRS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
  const dirName = a => DIRS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];

  const N = ECHO.Nav = {
    route: null, t: 0,
    reset() { N.route = null; N.t = 0; N._known = null; },

    // How costly a tile is to travel (roads cheapest; deep water, cliffs, walls never).
    tileCost(world, x, y) {
      const W = world.W || 200;
      if (x < 0 || y < 0 || x >= W || y >= (world.H || 150)) return Infinity;
      const i = y * W + x;
      if (world.blocked && world.blocked[i] === 1) return Infinity;
      // something standing here (a cart, a well, a boulder, a trunk) or no room to pass: go round
      const M = N.room(world);
      if (M[i] === 0) M[i] = ECHO.Ent.fits(world, x + 0.5, y + 0.5, 0.32) ? 1 : 2;
      const extra = M[i] === 2 ? 5 : 0;
      // below level 150, the menace of a gate is a wall: go round it
      if (world.gates && N._weak) for (const g of world.gates.list) { const dx = x + 0.5 - g.x, dy = y + 0.5 - g.y; if (dx * dx + dy * dy < N._weakR2) return Infinity; }
      return N.baseCost(world, world.tiles[i]) + extra;
    },
    // room-to-pass memo for the whole world, rebuilt when the land changes
    room(world) {
      const key = (world.W || 200) + 'x' + (world.H || 150) + ':' + (world._tileEpoch || 0);
      if (!N._room || N._roomKey !== key || N._roomWorld !== world) { N._room = new Uint8Array((world.W || 200) * (world.H || 150)); N._roomKey = key; N._roomWorld = world; }
      return N._room;
    },
    baseCost(world, t) {
      const K = T();
      switch (t) {
        case K.ROAD: case K.BRIDGE: return 0.45;
        case K.PLAZA: return 0.6;
        case K.FARM: return 0.9;
        case K.GRASS: return 1;
        case K.SAND: case K.RUIN: return 1.2;
        case K.FOREST: return 1.45;
        case K.SNOW: return 1.7;
        case K.HILL: return 1.8;
        case K.TREE: return 1.9;
        case K.SWAMP: return 2.4;
        case K.WATER: return 6;          // shallows: wadeable, but slow
        default: return Infinity;        // deep water, rock, ruin walls
      }
    },
    // Plan the way from (sx,sy) to (tx,ty). Long journeys are planned on a coarser
    // grid first and the near stretch refined, so it stays quick on a grown world.
    plan(world, sx, sy, tx, ty) {
      const pl = ECHO.Game && ECHO.Game.pl, G = ECHO.Gates;
      N._weak = !!(G && pl && ECHO.Prowess.level(pl) < G.MIN && !G.list(world).some(g => U.dist(g.x, g.y, tx, ty) < G.R_HURT + 3));
      N._weakR2 = G ? (G.R_HURT + 1.5) ** 2 : 0;
      const d = U.dist(sx, sy, tx, ty);
      const k = d > 380 ? 4 : d > 110 ? 2 : 1;
      const W = world.W || 200, H = world.H || 150, cw = Math.ceil(W / k), ch = Math.ceil(H / k);
      let cost;
      if (k === 1) cost = (x, y) => N.tileCost(world, x, y);
      else {
        const memo = new Float32Array(cw * ch).fill(-1);
        cost = (cx, cy, i) => {
          if (memo[i] >= 0) return memo[i] === 999 ? Infinity : memo[i];
          let sum = 0, n = 0;
          for (let y = cy * k; y < cy * k + k; y++) for (let x = cx * k; x < cx * k + k; x++) { const c = N.tileCost(world, x, y); if (isFinite(c)) { sum += c; n++; } }
          const v = n * 2 < k * k ? 999 : sum / n;
          memo[i] = v;
          return v === 999 ? Infinity : v;
        };
      }
      const p = ECHO.World.findPath({ W: cw, H: ch }, sx / k, sy / k, tx / k, ty / k, cost, Math.min(400000, 30000 + d * d * 4 / (k * k)));
      if (!p) return null;
      const pts = p.map(i => ({ x: (i % cw) * k + k / 2, y: ((i / cw) | 0) * k + k / 2 }));
      pts[pts.length - 1] = { x: tx, y: ty };
      // refine the stretch just ahead at full detail
      if (k > 1 && pts.length > 3) {
        const j = Math.min(pts.length - 1, Math.ceil(40 / k));
        const near = N.plan(world, sx, sy, pts[j].x, pts[j].y);
        if (near && near.length) return near.concat(pts.slice(j + 1));
      }
      return pts;
    },
    // Thin a dense tile path into points a step or so apart (keeps curves).
    thin(pts) {
      if (!pts || pts.length < 3) return pts;
      const out = [pts[0]];
      for (let i = 1; i < pts.length - 1; i++) {
        const a = out[out.length - 1], b = pts[i], c = pts[i + 1];
        const turn = Math.abs(U.angleDiff(Math.atan2(b.y - a.y, b.x - a.x), Math.atan2(c.y - b.y, c.x - b.x)));
        if (U.dist(a.x, a.y, b.x, b.y) >= 3 || turn > 0.3) out.push(b);
      }
      out.push(pts[pts.length - 1]);
      return out;
    },

    // ------------------------------------------------------------ every frame
    update(game, dt) {
      const world = game.world, pe = game.pe, g = ECHO.Purpose && ECHO.Purpose.goal;
      if (!world || !pe || ECHO.Interior.cur || !g || !g.where || g.where.x == null) { N.route = null; return; }
      const w = g.where, key = Math.round(w.x) + ',' + Math.round(w.y);
      const R = N.route;
      N.t -= dt;
      const strayed = R && R.key === key && N.offRoute(pe, R) > 7;
      if (!R || R.key !== key || (strayed && N.t <= 0) || (N.t <= -12)) {
        N.t = 2.5;
        const t0 = performance.now();
        // a vague place: head for the middle of the search area
        const raw = N.plan(world, pe.x, pe.y, w.x, w.y);
        const pts = raw ? N.thin(raw) : [{ x: pe.x, y: pe.y }, { x: w.x, y: w.y }];
        N.route = { key, to: { x: w.x, y: w.y }, pts, i: 0, ok: !!raw, vague: !!w.vague, ms: Math.round(performance.now() - t0), len: N.length(pts, 0) };
      }
      // where we are along it
      const Rt = N.route, P = Rt.pts;
      let best = Rt.i, bd = Infinity;
      for (let j = Math.max(0, Rt.i - 2); j < Math.min(P.length, Rt.i + 30); j++) { const d = U.dist(P[j].x, P[j].y, pe.x, pe.y); if (d < bd) { bd = d; best = j; } }
      Rt.i = best;
      Rt.left = U.dist(pe.x, pe.y, P[Math.min(best + 1, P.length - 1)].x, P[Math.min(best + 1, P.length - 1)].y) + N.length(P, best + 1);
      // the point a few steps ahead to steer by
      // the furthest point a few steps ahead you can walk to in a straight line
      let s = Math.min(best + 1, P.length - 1), acc = 0, k = s;
      while (k < P.length - 1 && acc < 8) {
        acc += U.dist(P[k].x, P[k].y, P[k + 1].x, P[k + 1].y); k++;
        if (ECHO.Ent.clearLine(world, pe.x, pe.y, P[k].x, P[k].y, 0.3)) s = k; else break;
      }
      Rt.steer = P[s];
      Rt.leg = N.legText(world, P, best);
      // arrived
      const dEnd = U.dist(pe.x, pe.y, w.x, w.y);
      if (dEnd < (w.vague ? 10 : 3.2) && Rt.arrivedKey !== key) {
        Rt.arrivedKey = key;
        if (ECHO.UI) ECHO.UI.toast(w.vague ? `You're in the area — search around here for ${w.name || 'it'}.` : `You've reached ${w.name || 'the place'}.`, 'legend', 4);
      }
    },
    offRoute(pe, R) {
      let m = Infinity;
      for (let j = Math.max(0, R.i - 3); j < Math.min(R.pts.length, R.i + 12); j++) m = Math.min(m, U.dist(R.pts[j].x, R.pts[j].y, pe.x, pe.y));
      return m;
    },
    length(P, from) { let L = 0; for (let j = Math.max(0, from); j < P.length - 1; j++) L += U.dist(P[j].x, P[j].y, P[j + 1].x, P[j + 1].y); return L; },
    // "follow the road north", "through the woods to the east", "over the hills"…
    legText(world, P, i) {
      const K = T(), end = Math.min(P.length - 1, i + 8);
      if (end <= i) return '';
      const counts = {};
      let L = 0;
      for (let j = i; j < end; j++) {
        const a = P[j], b = P[j + 1], seg = U.dist(a.x, a.y, b.x, b.y), n = Math.max(1, Math.round(seg));
        for (let q = 0; q < n; q++) { const x = Math.floor(a.x + (b.x - a.x) * q / n), y = Math.floor(a.y + (b.y - a.y) * q / n); const t = ECHO.World.tile(world, x, y); counts[t] = (counts[t] || 0) + 1; }
        L += seg;
      }
      const a = Math.atan2(P[end].y - P[i].y, P[end].x - P[i].x), dir = dirName(a);
      const tot = Object.values(counts).reduce((x, y) => x + y, 0) || 1, f = k => (counts[k] || 0) / tot;
      if (f(K.BRIDGE) > 0.05) return `cross the bridge, ${dir}`;
      if (f(K.ROAD) + f(K.BRIDGE) > 0.45) return `follow the road ${dir}`;
      if (f(K.WATER) > 0.2) return `wade the shallows, ${dir}`;
      if (f(K.FOREST) + f(K.TREE) > 0.45) return `through the woods, ${dir}`;
      if (f(K.HILL) + f(K.SNOW) > 0.45) return `over the hills, ${dir}`;
      if (f(K.SWAMP) > 0.35) return `through the marsh, ${dir}`;
      return `head ${dir}`;
    },

    // ------------------------------------------------------------ drawing
    // Points for the trail on the ground: the next stretch, a step and a half apart.
    trail(game) {
      const R = N.route, pe = game.pe;
      if (!R || !R.ok || N.hidden() || !pe) return [];
      const P = R.pts, out = [];
      let carry = 1.2, j = R.i;
      let a = { x: pe.x, y: pe.y };
      for (; j < P.length - 1 && out.length < 18; j++) {
        const b = P[j + 1], seg = U.dist(a.x, a.y, b.x, b.y);
        if (seg < 0.01) { a = b; continue; }
        let t = carry;
        while (t < seg && out.length < 18) { out.push({ x: a.x + (b.x - a.x) * t / seg, y: a.y + (b.y - a.y) * t / seg, a: Math.atan2(b.y - a.y, b.x - a.x) }); t += 1.6; }
        carry = t - seg;
        a = b;
      }
      const n = out.length;
      out.forEach((p, k) => { p.alpha = Math.max(0.1, (1 - k / Math.max(1, n)) * 0.85) * (0.75 + 0.25 * Math.sin(game.time * 3 - k * 0.6)); });
      return out;
    },
    hidden() { return ECHO.UI && ECHO.UI.settings && ECHO.UI.settings.trail === false; },
    // Draw the trail on an overlay canvas: project(x, y) → {x, y, z?} in canvas pixels.
    drawTrail(ctx, game, project, dpr) {
      const pts = N.trail(game);
      if (!pts.length) return;
      ctx.save();
      for (const p of pts) {
        const s = project(p.x, p.y);
        if (!s || s.z > 1) continue;
        const r = 11 * dpr;
        ctx.globalAlpha = p.alpha;
        ctx.translate(s.x, s.y);
        ctx.fillStyle = 'rgba(255,214,110,0.22)'; ctx.beginPath(); ctx.ellipse(0, 0, r * 1.25, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.rotate(p.a);
        ctx.fillStyle = '#ffe08a'; ctx.strokeStyle = 'rgba(40,24,8,0.75)'; ctx.lineWidth = 2 * dpr;
        ctx.beginPath(); ctx.moveTo(r, 0); ctx.lineTo(-r * 0.6, r * 0.7); ctx.lineTo(-r * 0.2, 0); ctx.lineTo(-r * 0.6, -r * 0.7); ctx.closePath(); ctx.stroke(); ctx.fill();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      ctx.restore();
    },
    // The route as a polyline on a map: toScreen(x, y) → {x, y}.
    drawOnMap(g, toScreen, max, width) {
      const R = N.route;
      if (!R || !R.ok) return false;
      const P = R.pts, end = Math.min(P.length, R.i + (max || 9999));
      g.save();
      g.strokeStyle = 'rgba(255,224,138,0.95)'; g.lineWidth = width || 2.5; g.lineJoin = 'round'; g.lineCap = 'round';
      g.setLineDash([6, 4]); g.lineDashOffset = -performance.now() / 60;
      g.beginPath();
      const s0 = toScreen(ECHO.Game.pe.x, ECHO.Game.pe.y); g.moveTo(s0.x, s0.y);
      for (let j = R.i + 1; j < end; j++) { const s = toScreen(P[j].x, P[j].y); g.lineTo(s.x, s.y); }
      g.stroke(); g.restore();
      return true;
    },

    // ------------------------------------------------------------ where to?
    // Everything you could be making for, with where it is.
    objectives(game) {
      const world = game.world, pl = game.pl, pe = game.pe, Pu = ECHO.Purpose, out = [];
      const add = (id, icon, label, where, kind) => { if (where && where.x != null) out.push({ id, icon, label, where, kind, d: U.dist(where.x, where.y, pe.x, pe.y) }); };
      // your road
      const amb = ECHO.Ambition && ECHO.Ambition.goal(world, pl);
      if (amb && amb.where) add(null, ECHO.Ambition.PATHS[amb.path].icon, `${amb.title}: ${amb.text}`, amb.where, 'road');
      // the story
      if (ECHO.Saga) { const s = ECHO.Saga.tracked(world, pl); if (s && s.where) add('story', '✦', s.label, s.where, 'story'); }
      // promises you made
      for (const id of pl.accepted || []) { const g = Pu.trackedGoal(world, pl, id); if (g && g.where) add(id, g.label && g.label.includes('claim') ? '★' : '!', g.label, g.where, 'promise'); }
      // jobs you took
      if (ECHO.Jobs) for (const j of ECHO.Jobs.active(world)) { const g = ECHO.Jobs.tracked(game, 'job:' + j.id); if (g && g.where) add('job:' + j.id, '⚒', g.label, g.where, 'job'); }
      // cases you are on
      if (ECHO.Watch) for (const c of ECHO.Watch.cases(world)) { if (c.status !== 'open' || !(c.playerProgress != null || pl.tracked === c.id)) continue; const g = Pu.trackedGoal(world, pl, c.id); if (g && g.where) add(c.id, '⚖', g.label, g.where, 'case'); }
      // the lost expedition
      if (world.expedition && world.expedition.next && pl.expedition) { const g = Pu.trackedGoal(world, pl, 'expedition'); if (g) add('expedition', '⌖', g.label, g.where, 'story'); }
      // a dungeon your size
      if (ECHO.Guide && ECHO.Guide.forYou) for (const f of ECHO.Guide.forYou(world, pl, 2)) add('site:' + f.s.id, '▼', `${f.s.found || f.s.seen ? f.s.name : 'An uncharted dungeon'} — floor ${f.f + 1} is Lv ${f.fl}`, { x: f.s.x, y: f.s.y, name: f.s.found || f.s.seen ? f.s.name : 'an uncharted dungeon', vague: !(f.s.found || f.s.seen) }, 'dungeon');
      // the gates, once you are strong enough to stand before them
      if (ECHO.Gates && world.gates && ECHO.Prowess.level(pl) >= ECHO.Gates.MIN) for (const g of world.gates.list) { const id = `mark:${g.x.toFixed(1)}:${(g.y + 3).toFixed(1)}:${U.cap(g.name)}`; add(id, '⛩', `${U.cap(g.name)} — the National Guard${pl.guard ? '' : ' (join at level 150)'}`, { x: g.x, y: g.y + 3, name: U.cap(g.name) }, 'gate'); }
      // your own marks
      if (pl.tracked && pl.tracked.startsWith('mark:') && !out.some(o => o.id === pl.tracked)) { const g = Pu.trackedGoal(world, pl, pl.tracked); if (g) add(pl.tracked, '⚑', String(g.label).replace(/^⚑\s*/, ''), g.where, 'mark'); }
      // nearest first, but what you're tracking on top
      return out.sort((a, b) => (b.id === pl.tracked) - (a.id === pl.tracked) || a.d - b.d);
    },
    openPicker(game) {
      const world = game.world, pl = game.pl, list = N.objectives(game), UI = ECHO.UI;
      const body = UI.openPanel('Where to?', '', 'nav');
      const render = () => {
        const cur = pl.tracked;
        body.innerHTML = `<p class="dim" style="margin-top:0">Pick where you're headed — the line at the top, the trail on the ground and your maps will lead you there by the best way, roads where there are roads. <b>N</b> opens this list.</p>${list.length ? `<div class="list">${list.map((o, k) => {
          const on = (o.id || null) === (cur || null) && (o.id || !cur);
          return `<div class="card nav-row ${on ? 'on' : ''}"><div class="nav-ic">${esc(o.icon)}</div><div style="flex:1"><b>${esc(o.label)}</b><div class="dim" style="font-size:13px">${esc(o.where.vague ? 'a rough area — search when you get there · ' : (o.where.name && !o.label.includes(o.where.name) ? o.where.name + ' · ' : ''))}${Math.round(o.d)} leagues ${esc(dirName(Math.atan2(o.where.y - pl.y, o.where.x - pl.x)))}</div></div><div>${on ? '<span class="gold">leading you here</span>' : `<button class="small" data-nav="${k}">Go here</button>`}</div></div>`;
        }).join('')}</div>` : '<p class="dim">Nothing to head for yet. Take a promise from a notice board, a job from someone in town, or choose a road (Tab → Ambitions).</p>'}${cur ? '<div class="row" style="margin-top:12px"><button class="small" data-nav="none">Stop guiding (back to your road)</button></div>' : ''}
        <div class="row" style="margin-top:8px"><label class="dim"><input type="checkbox" id="nav-trail" ${N.hidden() ? '' : 'checked'}> Show the trail on the ground</label></div>`;
        body.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => {
          const v = b.dataset.nav;
          if (v === 'none') pl.tracked = null; else { const o = list[+v]; pl.tracked = o.id; }
          ECHO.Purpose._html = null; ECHO.Purpose.t = 0; N.route = null;
          UI.closePanel();
          const g = ECHO.Purpose.current(game);
          if (g) UI.toast(`Leading you to ${g.where ? g.where.name || 'it' : 'it'}.`, 'info', 3);
        }));
        const cb = body.querySelector('#nav-trail');
        if (cb) cb.addEventListener('change', () => { UI.settings.trail = cb.checked; try { localStorage.setItem('echo.settings', JSON.stringify(UI.settings)); } catch (e) { /* ignore */ } });
      };
      render();
    },
    // A new promise or job: if you're not already being led somewhere, lead you there.
    autoTrack(game) {
      const world = game.world, pl = game.pl;
      const ids = [...(pl.accepted || []), ...(ECHO.Jobs ? ECHO.Jobs.active(world).map(j => 'job:' + j.id) : [])];
      const seen = N._known || (N._known = new Set(ids));
      for (const id of ids) {
        if (seen.has(id)) continue;
        seen.add(id);
        if (pl.tracked) continue;
        const g = ECHO.Purpose.trackedGoal(world, pl, id);
        if (!g || !g.where || g.where.x == null) continue;
        pl.tracked = id; ECHO.Purpose._html = null; ECHO.Purpose.t = 0; N.route = null;
        ECHO.UI.toast(`Leading you to ${g.where.name || 'it'} — follow the trail. (N: everything you're after)`, 'info', 5);
      }
    }
  };
})();
