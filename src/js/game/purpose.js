// Purpose: the road you follow, and the way to the next thing on it.
// A line at the top of the screen always says what you are working towards
// and points the way — the next standing of your chosen ambition, or the
// quest you have chosen to track — with a beacon over the place when it is
// near. New standings are marked with a ceremony.
(function () {
  const { U } = ECHO;
  const A = () => ECHO.Ambition;
  const UI = () => ECHO.UI;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const DIRS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];

  const Pu = ECHO.Purpose = {
    t: 0, glows: [], goal: null,
    reset() { Pu.t = 0; Pu.glows = []; Pu.goal = null; Pu._html = null; if (ECHO.Nav) ECHO.Nav.reset(); },

    // ------------------------------------------------------------ what we point at
    // A tracked quest, if any, or the next step of the chosen ambition.
    current(game) {
      const world = game.world, pl = game.pl;
      const tr = pl.tracked && Pu.trackedGoal(world, pl, pl.tracked);
      if (tr) return tr;
      if (pl.tracked) pl.tracked = null;
      const g = A().goal(world, pl);
      if (!g) return null;
      return { kind: 'ambition', label: g.done ? g.text : `${A().PATHS[g.path].icon} ${g.title}: ${g.text}${g.need > 1 ? ` (${g.have}/${g.need})` : ''}`, where: g.where, done: g.done };
    },
    trackedGoal(world, pl, id) {
      if (id === 'story') return ECHO.Saga ? ECHO.Saga.tracked(world, pl) : null;
      if (id.startsWith('job:')) return ECHO.Jobs ? ECHO.Jobs.tracked(ECHO.Game, id) : null;
      if (id.startsWith('tmap:')) return ECHO.Secrets ? ECHO.Secrets.trackedMap(ECHO.Game, id) : null;
      if (id.startsWith('mark:')) {
        const [, x, y, ...nm] = id.split(':'), mx = +x, my = +y;
        if (U.dist(mx, my, pl.x, pl.y) < 3) { if (UI() && UI().toast) UI().toast(`You have reached ${nm.join(':')}.`, 'info', 3); return null; }
        return { kind: 'track', label: `⚑ ${nm.join(':')}`, where: { x: mx, y: my, name: nm.join(':') } };
      }
      if (id.startsWith('site:')) {
        const s = ECHO.Explore.byId(world, id.slice(5));
        if (!s || s.cleared) return null;
        const known = s.found || s.seen;
        return { kind: 'track', label: `▼ ${known ? s.name : 'An uncharted dungeon'} ${ECHO.Explore.stars(s)}`, where: { x: s.x, y: s.y, name: known ? s.name : 'somewhere in the wild', vague: !known } };
      }
      if (id === 'expedition') { const E = world.expedition; return E && E.next ? { kind: 'track', label: `The lost expedition: ${E.next.camp ? 'the last camp' : 'the next page'}`, where: { x: E.next.x, y: E.next.y, name: E.next.hint, vague: true } } : null; }
      if (id.startsWith('case')) {
        const c = ECHO.Watch.byId(world, id);
        if (!c || c.status !== 'open') return null;
        const s = ECHO.Sim.settlement(world, c.sid);
        return { kind: 'track', label: `Investigating the ${ECHO.Watch.KIND_WORD[c.kind]}${c.victimName ? ' of ' + c.victimName.split(' ')[0] : ''}`, where: c.found.scene ? { x: s.x, y: s.y + 2, name: s.name } : { x: c.x, y: c.y, name: 'the scene' } };
      }
      const p = world.plights.find(x => x.id === id);
      if (!p || p.status !== 'open') return null;
      return { kind: 'track', label: UI().plightTitle(p) + (p.claimable ? ' — claim your reward' : ''), where: Pu.plightWhere(world, p) };
    },
    plightWhere(world, p) {
      const S = ECHO.Sim;
      const home = S.settlement(world, p.sid);
      const at = (o, name, vague) => o ? { x: o.x, y: o.y, name, vague } : null;
      if (p.claimable) return at(home, home && home.name);
      if (p.campId) { const c = world.camps.find(c => c.id === p.campId); if (c) return at(c, c.name, !c.seen); }
      if (p.lairId) { const l = world.lairs.find(l => l.id === p.lairId); if (l) return at(l, 'the lair of ' + l.boss.name); }
      if (p.siteId) { const s = ECHO.Explore.byId(world, p.siteId); if (s) return at(s, s.found ? s.name : 'somewhere near ' + (home ? home.name : 'here'), !s.found); }
      if (p.kind === 'courier' || p.kind === 'supply') { const t = S.settlement(world, p.toSid || p.sid); return at(t, t && t.name); }
      if (p.kind === 'envoy') { const f = world.factions[p.toFaction]; const t = f && S.settlement(world, f.capital); return at(t, t && 'the keep at ' + t.name); }
      if (p.kind === 'ring') { const n = world.npcs[p.informant]; return at(home, n ? `${n.first} ${n.last}, in ${home.name}` : home.name); }
      if (p.x != null) { const reg = ECHO.World.regionAt(world, p.x, p.y); return at(p, p.kind === 'treasure' ? 'where the map says' : p.kind === 'lost' ? 'where they were last seen' : p.kind === 'hunt' ? `where ${p.beast || 'the beast'} hunts` : p.kind === 'clearsite' ? `the frontier, ${reg ? reg.name : 'the wilds'}` : 'the place', p.kind === 'treasure' || p.kind === 'lost' || p.kind === 'hunt'); }
      return at(home, home && home.name);
    },

    // ------------------------------------------------------------ every frame
    update(game, dt) {
      Pu.glows.length = 0;
      const world = game.world, pl = game.pl, pe = game.pe;
      if (!world || !pl || pl.capture) return;
      Pu.t -= dt;
      if (Pu.t <= 0) {
        Pu.t = 1.2;
        if (ECHO.Nav) ECHO.Nav.autoTrack(game);
        Pu.goal = Pu.current(game);
        // ceremonies
        if (!UI().paused() && !game.defeating && !(game.combatT != null && game.time - game.combatT < 6) && !game.ents.some(e => e.boss2 && !e.dead && U.dist(e.x, e.y, game.pe.x, game.pe.y) < 12)) {
          const up = A().check(world, pl);
          for (const r of up) Pu.ceremony(game, r);
        }
      }
      if (ECHO.Nav) ECHO.Nav.update(game, dt);
      Pu.hud(game);
      // a beacon over the place, once it is close enough to see
      const g = Pu.goal;
      if (g && g.where && !g.where.vague && !ECHO.Interior.cur) {
        const d = game.world.globe && ECHO.Globe ? Math.hypot(ECHO.Globe.dx(game.world, pe.x, g.where.x), g.where.y - pe.y) : U.dist(g.where.x, g.where.y, pe.x, pe.y);
        if (d < 46 && d > 3) for (let i = 0; i < 6; i++) Pu.glows.push({ x: g.where.x, y: g.where.y, h: 0.6 + i * 1.1, s: 1.3 - i * 0.12, c: '#ffe08a', a: 0.22 - i * 0.025 + 0.06 * Math.sin(game.time * 2.4 + i) });
      }
    },
    // The guide at the top of the screen: a dial whose gold arrow points, on the screen, the way
    // to go (the camera never turns, so up the screen is W, up and right is W and D), and beside it
    // how far, to where, and the way (follow the road north…).
    hud(game) {
      const el = document.getElementById('hud-goal');
      if (!el) return;
      if (ECHO.GateWorld && ECHO.GateWorld.hud(game, el)) { Pu._nav = null; el.classList.remove('nav'); return; }
      let N = Pu._nav;
      if (!N || !el.contains(N.dial)) {
        el.innerHTML = `<canvas class="ng-dial"></canvas><div class="ng-txt"><div class="ng-top"><span class="ng-label"></span><span class="ng-tag"></span></div><div class="ng-row"><span class="ng-dist"></span><span class="ng-dest"></span></div><div class="ng-leg"></div><div class="ng-keys">J · how?&nbsp;&nbsp;·&nbsp;&nbsp;N · where to?&nbsp;&nbsp;·&nbsp;&nbsp;M · map</div></div>`;
        N = Pu._nav = { dial: el.querySelector('.ng-dial'), label: el.querySelector('.ng-label'), tag: el.querySelector('.ng-tag'), dist: el.querySelector('.ng-dist'), dest: el.querySelector('.ng-dest'), leg: el.querySelector('.ng-leg'), c: {} };
        el.classList.add('nav'); el.classList.remove('hidden');
      }
      const set = (k, v, html) => { if (N.c[k] === v) return; N.c[k] = v; if (html) N[k].innerHTML = v; else N[k].textContent = v; };
      const g = Pu.goal, pe = game.pe, inside = !!ECHO.Interior.cur, turned = !!(game.pl && game.pl.viewTurn) && !inside;
      el.classList.toggle('in', inside);
      if (!g) {
        set('label', game.pl.focus ? 'No destination' : 'No road chosen yet'); set('tag', '');
        set('dist', ''); set('dest', game.pl.focus ? 'N · where to? · or right-click the map' : 'Tab → Ambitions to choose one', true); set('leg', '');
        Pu.dial(N.dial, null, turned, 0);
        return;
      }
      let ang = null, dist = null, leg = '', vague = false;
      if (g.where && !inside) {
        const dx = ECHO.Globe ? ECHO.Globe.dx(game.world, pe.x, g.where.x) : g.where.x - pe.x, dy = g.where.y - pe.y, d = Math.hypot(dx, dy);   // (round the world, the short way)
        const R = ECHO.Nav && ECHO.Nav.route;
        vague = !!g.where.vague;
        dist = d; ang = Math.atan2(dy, dx);
        if (d >= 4 && R && R.ok && R.steer) {
          // along the planned way, not through the lake
          ang = Math.atan2(R.steer.y - pe.y, R.steer.x - pe.x);
          leg = R.leg || ''; dist = R.left;
        } else if (d >= 4 && R && R.air) leg = R.leg || '';
        else if (d >= 4) leg = `head ${DIRS[((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8]}`;
        if (d < 4) ang = null;
      }
      set('label', g.label); set('tag', g.kind === 'track' ? 'Tracked' : '');
      const dd = dist == null ? '' : dist < 4 ? '<b>HERE</b>' : `<b>${vague ? '~' : ''}${Math.max(1, Math.round(dist / 2) * 2)}</b><i>LG</i>`;   // (every odd league would rewrite it twenty times a second on a dragon)
      set('dist', dd, true);
      set('dest', g.where ? `<i>◆</i>${esc(g.where.name || '')}` : '', true);
      set('leg', leg ? `▸ ${leg}` : dist != null && dist < 4 ? '▸ you are there' : '');
      // on the screen: the view turned about over a pole turns the arrow with it
      Pu.dial(N.dial, ang == null ? null : ang + (turned ? Math.PI : 0), turned, dist != null && dist < 4 ? 1 : 0);
    },
    // the dial: north marked where north is on the screen, the eight ways, and the arrow (eased, so it
    // does not shiver as the way ahead is worked out again)
    dial(cv, a, turned, here) {
      const dpr = Math.min(2, window.devicePixelRatio || 1), S = 60;
      if (cv.width !== Math.round(S * dpr)) { cv.width = Math.round(S * dpr); cv.height = Math.round(S * dpr); }
      const g = cv.getContext('2d'), c = S / 2, r = 25, t = performance.now() / 1000, HC = 'rgba(95,242,255,', AM = 'rgba(255,207,106,';
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, S, S);
      g.fillStyle = 'rgba(2,12,22,0.75)'; g.beginPath(); g.arc(c, c, r + 3, 0, Math.PI * 2); g.fill();
      g.strokeStyle = HC + '0.55)'; g.lineWidth = 1; g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.stroke();
      for (let i = 0; i < 8; i++) { const q = i * Math.PI / 4; g.strokeStyle = HC + (i % 2 ? '0.35)' : '0.8)'); g.lineWidth = i % 2 ? 1 : 1.5; g.beginPath(); g.moveTo(c + Math.cos(q) * (r - (i % 2 ? 3 : 5)), c + Math.sin(q) * (r - (i % 2 ? 3 : 5))); g.lineTo(c + Math.cos(q) * r, c + Math.sin(q) * r); g.stroke(); }
      // north, where it is on the screen (up; down when the view is turned about over a pole)
      const ny = turned ? c + r - 0.5 : c - r + 0.5;
      g.fillStyle = 'rgba(2,12,22,1)'; g.beginPath(); g.arc(c, ny, 5, 0, Math.PI * 2); g.fill();
      g.font = '700 8px ui-monospace, Consolas, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = AM + '1)'; g.fillText('N', c, ny + 0.5);
      if (here) {
        const ph = (t * 0.9) % 1; g.strokeStyle = AM + (0.9 * (1 - ph)).toFixed(3) + ')'; g.lineWidth = 2; g.beginPath(); g.arc(c, c, 4 + ph * 16, 0, Math.PI * 2); g.stroke();
        g.save(); g.translate(c, c); g.rotate(Math.PI / 4); g.fillStyle = AM + '1)'; g.shadowColor = AM + '1)'; g.shadowBlur = 8; g.fillRect(-4, -4, 8, 8); g.restore();
        return;
      }
      if (a == null) { g.fillStyle = HC + '0.5)'; g.beginPath(); g.arc(c, c, 2, 0, Math.PI * 2); g.fill(); Pu._da = null; return; }
      Pu._da = Pu._da == null ? a : Pu._da + U.angleDiff(Pu._da, a) * 0.25;
      const da = Pu._da;
      // a soft fan the way to go, then the arrow
      const fan = g.createRadialGradient(c, c, 2, c, c, r);
      fan.addColorStop(0, AM + '0.35)'); fan.addColorStop(1, AM + '0)');
      g.fillStyle = fan; g.beginPath(); g.moveTo(c, c); g.arc(c, c, r - 1, da - 0.42, da + 0.42); g.closePath(); g.fill();
      const pulse = 0.85 + 0.15 * Math.sin(t * 4);
      g.save(); g.translate(c, c); g.rotate(da);
      // a needle: a faint tail, a gold shaft and a clear head at the end that points the way
      g.strokeStyle = HC + '0.45)'; g.lineWidth = 2; g.lineCap = 'round'; g.beginPath(); g.moveTo(-(r - 9), 0); g.lineTo(0, 0); g.stroke();
      g.shadowColor = AM + '1)'; g.shadowBlur = 10;
      g.strokeStyle = AM + pulse.toFixed(3) + ')'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 0); g.lineTo(r - 11, 0); g.stroke();
      g.fillStyle = AM + pulse.toFixed(3) + ')'; g.beginPath(); g.moveTo(r - 1, 0); g.lineTo(r - 13, 7); g.lineTo(r - 10, 0); g.lineTo(r - 13, -7); g.closePath(); g.fill();
      g.shadowBlur = 0; g.fillStyle = '#e6fdff'; g.beginPath(); g.arc(0, 0, 2.5, 0, Math.PI * 2); g.fill();
      g.restore();
    },

    // ------------------------------------------------------------ ceremonies
    ceremony(game, r) {
      const world = game.world, pl = game.pl;
      const P0 = A().PATHS[r.path];
      const next = A().next(world, pl, r.path);
      ECHO.Music.stinger(r.rank >= 3 ? 'echo' : 'discover');
      UI().banner(A().honor(pl) || r.R.title, `${P0.name} · standing ${r.rank} of 5`, true);
      UI().modal({
        title: `${P0.icon} ${r.R.title}`,
        html: `<p class="prose" style="font-size:19px">${esc(r.R.desc)}</p><p class="gold">${esc(r.R.reward)}</p>
          ${next ? `<p class="dim">Next on ${esc(P0.name.toLowerCase())} — <b>${esc(next.R.title)}</b>: ${next.objectives.map(o => esc(o.text)).join('; ')}.</p>` : `<p class="dim">You have gone as far as ${esc(P0.name.toLowerCase())} goes.</p>`}
          ${!pl.focus ? '' : pl.focus !== r.path ? `<p class="dim">You are following ${esc(A().PATHS[pl.focus].name)}. You can change your road in the journal.</p>` : ''}`,
        choices: [{ label: 'Onward', onPick: () => {} }, ...(pl.focus !== r.path && next ? [{ label: `Follow ${P0.name.toLowerCase()} from now on`, onPick: () => { pl.focus = r.path; } }] : [])]
      });
      ECHO.PlayerCtl.derivedT = 0;
    },

    // ------------------------------------------------------------ the calling
    calling(game, after) {
      const pl = game.pl, PATHS = A().PATHS;
      UI().modal({
        title: 'What will you make of this life?',
        html: `<p class="prose">You are ${esc(pl.first)} ${esc(pl.last)}, with a few crowns, a sword, a bow, and a name no one knows yet. The world will not wait for you — but it will make room for you, if you make your mark.</p>
          <div class="callings">${Object.entries(PATHS).map(([k, p]) => `<button class="calling" data-call="${k}"><b>${p.icon} ${esc(p.name)}</b><span>${esc(p.blurb)}</span><span class="dim">First: ${esc(p.ranks[0].title)}</span></button>`).join('')}</div>
          <p class="dim">You rise on every road you walk. The one you choose is the one the line at the top of your screen will point you along. Change it in the journal (Tab) whenever you like.</p>`,
        choices: [{ label: 'I will find my own way', sub: 'Nothing pointed at. Just the world.', onPick: () => { pl.focus = null; if (after) after(null); } }]
      });
      document.querySelectorAll('#modal [data-call]').forEach(b => b.addEventListener('click', () => { UI().closeModal(); pl.focus = b.dataset.call; Pu._html = null; Pu.t = 0; if (after) after(b.dataset.call); }));
    },

    // ------------------------------------------------------------ the journal page
    journalHtml(world, pl) {
      const PATHS = A().PATHS;
      let html = `<p class="dim">You rise on every road you walk. The one you follow is the one the line at the top of the screen points you along.${pl.tracked ? ' (A tracked quest is shown instead — untrack it in Promises.)' : ''}</p>`;
      for (const [k, p] of Object.entries(PATHS)) {
        const r = A().rank(pl, k), n = A().next(world, pl, k);
        const ladder = p.ranks.map((R, i) => `<span class="${i < r ? 'gold' : i === r ? '' : 'dim'}">${i < r ? '✔ ' : ''}${esc(R.title)}</span>`).join(' → ');
        html += `<div class="card" style="${pl.focus === k ? 'border-color:#c8a85a' : ''}"><h4>${p.icon} ${esc(p.name)} ${pl.focus === k ? '<span class="gold">· your road</span>' : ''}</h4><div class="dim">${esc(p.blurb)}</div><div style="margin:6px 0">${ladder}</div>
          ${n ? `<div><b>Next: ${esc(n.R.title)}</b> — <span class="dim">${esc(n.R.reward)}</span></div><ul>${n.objectives.map(o => `<li class="${o.done ? 'gold' : ''}">${o.done ? '✔ ' : ''}${esc(o.text)}${o.need > 1 ? ` — ${o.have}/${o.need}` : ''}${!o.done && o.where && o.where.name ? ` <span class="dim">(${esc(o.where.vague ? 'somewhere ' + Pu.dirTo(world, pl, o.where) : o.where.name)})</span>` : ''}${!o.done && pl.focus === k && ECHO.Guide ? `<div class="dim" style="font-size:13px">${esc(ECHO.Guide.how(o.text))}</div>` : ''}</li>`).join('')}</ul>` : '<div class="gold">You have risen as far as this road goes.</div>'}
          ${pl.focus === k ? '' : `<div class="row"><button class="small" data-focus="${k}">Follow this road</button></div>`}</div>`;
      }
      return html;
    },
    dirTo(world, pl, w) { const a = Math.atan2(w.y - pl.y, ECHO.Globe ? ECHO.Globe.dx(world, pl.x, w.x) : w.x - pl.x); return 'to the ' + DIRS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8]; }
  };
})();
