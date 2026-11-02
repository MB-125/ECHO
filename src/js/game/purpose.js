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
    // The guide at the top of the screen: a heading tape that slides as you turn (your heading at
    // its middle, every five degrees marked), where you are headed as a diamond on it — bring the
    // middle onto the diamond and you are on course — and under it how far, to where, and the way.
    hud(game) {
      const el = document.getElementById('hud-goal');
      if (!el) return;
      if (ECHO.GateWorld && ECHO.GateWorld.hud(game, el)) { Pu._nav = null; el.classList.remove('nav'); return; }
      let N = Pu._nav;
      if (!N || !el.contains(N.tape)) {
        el.innerHTML = `<div class="ng-top"><span class="ng-label"></span><span class="ng-tag"></span></div><canvas class="ng-tape"></canvas><div class="ng-row"><span class="ng-dist"></span><span class="ng-dest"></span><span class="ng-stat"></span></div><div class="ng-leg"></div><div class="ng-keys">J · how?&nbsp;&nbsp;·&nbsp;&nbsp;N · where to?&nbsp;&nbsp;·&nbsp;&nbsp;M · map</div>`;
        N = Pu._nav = { tape: el.querySelector('.ng-tape'), label: el.querySelector('.ng-label'), tag: el.querySelector('.ng-tag'), dist: el.querySelector('.ng-dist'), dest: el.querySelector('.ng-dest'), stat: el.querySelector('.ng-stat'), leg: el.querySelector('.ng-leg'), c: {} };
        el.classList.add('nav'); el.classList.remove('hidden');
      }
      const set = (k, v, html) => { if (N.c[k] === v) return; N.c[k] = v; if (html) N[k].innerHTML = v; else N[k].textContent = v; };
      const g = Pu.goal, pe = game.pe, inside = !!ECHO.Interior.cur, pl = game.pl;
      el.classList.toggle('in', inside);
      // your heading (on a dragon, the way it flies)
      const F = pl.flying && ECHO.Apex && ECHO.Apex.fly, hdg = (((((F ? F.dir : pe ? pe.dir : 0) || 0) * 180 / Math.PI + 90) % 360) + 360) % 360;
      if (!g) {
        set('label', game.pl.focus ? 'No destination' : 'No road chosen yet'); set('tag', '');
        set('dist', ''); set('dest', game.pl.focus ? 'N · where to? · or right-click the map' : 'Tab → Ambitions to choose one', true); set('stat', ''); set('leg', '');
        Pu.tape(N.tape, hdg, null, inside);
        return;
      }
      let brg = null, dist = null, leg = '', vague = false;
      if (g.where && !inside) {
        const dx = ECHO.Globe ? ECHO.Globe.dx(game.world, pe.x, g.where.x) : g.where.x - pe.x, dy = g.where.y - pe.y, d = Math.hypot(dx, dy);   // (round the world, the short way)
        let ang = Math.atan2(dy, dx);
        const R = ECHO.Nav && ECHO.Nav.route;
        vague = !!g.where.vague;
        dist = d;
        if (d >= 4 && R && R.ok && R.steer) {
          // along the planned way, not through the lake
          ang = Math.atan2(R.steer.y - pe.y, R.steer.x - pe.x);
          leg = R.leg || ''; dist = R.left;
        } else if (d >= 4 && R && R.air) leg = R.leg || '';
        else if (d >= 4) leg = `head ${DIRS[((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8]}`;
        if (d >= 4) brg = (((ang * 180 / Math.PI + 90) % 360) + 360) % 360;
      }
      set('label', g.label); set('tag', g.kind === 'track' ? 'Tracked' : '');
      const dd = dist == null ? '' : dist < 4 ? '<b>HERE</b>' : `<b>${vague ? '~' : ''}${Math.max(1, Math.round(dist / 2) * 2)}</b><i>LG</i>`;   // (every odd league would rewrite it twenty times a second on a dragon)
      set('dist', dd, true);
      set('dest', g.where ? `<i>◆</i>${esc(g.where.name || '')}` : '', true);
      set('leg', leg ? `▸ ${leg}` : '');
      const off = brg == null ? null : ((brg - hdg + 540) % 360) - 180;
      set('stat', off == null ? '' : Math.abs(off) <= 8 ? '<span class="ok">● On course</span>' : `<span>${off < 0 ? '◂ ' : ''}Turn ${Math.round(Math.abs(off) / 5) * 5}°${off > 0 ? ' ▸' : ''}</span>`, true);
      Pu.tape(N.tape, hdg, brg, inside);
    },
    // the heading tape itself: ±55° about where you face
    tape(cv, hdg, brg, hide) {
      const dpr = Math.min(2, window.devicePixelRatio || 1), W = 420, H = 34;
      if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      const g = cv.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
      if (hide) return;
      const cx = W / 2, ppd = W / 110, HC = 'rgba(95,242,255,', AM = 'rgba(255,207,106,';
      const fade = x => Math.max(0, 1 - Math.pow(Math.abs(x - cx) / (W / 2), 2.2));
      g.textAlign = 'center'; g.textBaseline = 'middle';
      for (let d = Math.floor((hdg - 56) / 5) * 5; d <= hdg + 56; d += 5) {
        const x = cx + (d - hdg) * ppd, deg = ((d % 360) + 360) % 360, a = fade(x);
        if (a <= 0) continue;
        const card = deg % 45 === 0, major = deg % 15 === 0;
        g.strokeStyle = HC + (a * (card ? 0.95 : major ? 0.7 : 0.4)).toFixed(3) + ')'; g.lineWidth = card ? 1.6 : 1;
        g.beginPath(); g.moveTo(x, 2); g.lineTo(x, 2 + (card ? 11 : major ? 8 : 4)); g.stroke();
        if (major && Math.abs(x - cx) > 22) {
          g.font = card ? '700 11px ui-monospace, Consolas, monospace' : '500 9px ui-monospace, Consolas, monospace';
          g.fillStyle = card ? (deg === 0 ? AM : HC) + a.toFixed(3) + ')' : HC + (a * 0.65).toFixed(3) + ')';
          g.fillText(card ? ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][deg / 45] : String(deg).padStart(3, '0'), x, 24);
        }
      }
      // a line under it all
      const lg = g.createLinearGradient(0, 0, W, 0); lg.addColorStop(0, HC + '0)'); lg.addColorStop(0.5, HC + '0.5)'); lg.addColorStop(1, HC + '0)');
      g.strokeStyle = lg; g.lineWidth = 1; g.beginPath(); g.moveTo(0, 1.5); g.lineTo(W, 1.5); g.stroke();
      // where you are headed
      let on = false;
      if (brg != null) {
        const off = ((brg - hdg + 540) % 360) - 180;
        on = Math.abs(off) <= 8;
        if (Math.abs(off) <= 54) {
          const x = cx + off * ppd;
          g.save(); g.translate(x, 10); g.rotate(Math.PI / 4); g.fillStyle = AM + '1)'; g.shadowColor = AM + '1)'; g.shadowBlur = 10; g.fillRect(-4.5, -4.5, 9, 9); g.restore();
          g.strokeStyle = AM + '0.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, 17); g.lineTo(x, H - 2); g.stroke();
        } else {
          // beyond the tape: an arrow at its end, the way to turn
          const s = off < 0 ? -1 : 1, x = cx + s * (W / 2 - 10);
          g.fillStyle = AM + '1)'; g.shadowColor = AM + '1)'; g.shadowBlur = 8;
          g.beginPath(); g.moveTo(x + s * 7, 12); g.lineTo(x - s * 3, 5); g.lineTo(x - s * 3, 19); g.closePath(); g.fill(); g.shadowBlur = 0;
        }
      }
      // the middle: where you face, and the reading
      g.fillStyle = on ? AM + '1)' : '#e6fdff'; g.shadowColor = on ? AM + '1)' : HC + '1)'; g.shadowBlur = 8;
      g.beginPath(); g.moveTo(cx, 15); g.lineTo(cx - 5, 22); g.lineTo(cx + 5, 22); g.closePath(); g.fill(); g.shadowBlur = 0;
      g.fillStyle = 'rgba(4,12,22,0.9)'; g.strokeStyle = on ? AM + '0.9)' : HC + '0.7)'; g.lineWidth = 1;
      g.beginPath(); g.rect(cx - 19, 22, 38, 12); g.fill(); g.stroke();
      g.font = '700 10px ui-monospace, Consolas, monospace'; g.fillStyle = on ? AM + '1)' : '#e6fdff'; g.fillText(String(Math.round(hdg) % 360).padStart(3, '0') + '°', cx, 28.5);
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
