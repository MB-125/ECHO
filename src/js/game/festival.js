// Festivals in real time: the bonfire in the square, strings of lanterns,
// townsfolk dancing in a ring, wishing lanterns rising into the night, the
// feast, the archery contest, and Longnight's vigil by the fire.
(function () {
  const { U } = ECHO;
  const T = ECHO.TIME;
  const UI = () => ECHO.UI;
  const F = () => ECHO.Festivals;
  const W = () => ECHO.Wonders;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const Fe = ECHO.Fest = {
    decor: {}, lanterns: [], glows: [], contest: null,
    reset() { Fe.decor = {}; Fe.lanterns = []; Fe.glows = []; Fe.endContest(true); },

    // Where the fire, the poles and the stall stand in a town's square.
    layout(world, s) {
      const key = s.id + '|' + world.day;
      if (Fe.decor[s.id] && Fe.decor[s.id].key === key) return Fe.decor[s.id];
      const f = F().today(world);
      const fire = ECHO.Ent.freeSpot(world, s.x + 0.5, s.y + 1.5, 4) || { x: s.x, y: s.y + 1.5 };
      const poles = [];
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * Math.PI * 2 + 0.3;
        const p = ECHO.Ent.freeSpot(world, fire.x + Math.cos(a) * 5.6, fire.y + Math.sin(a) * 4.6, 1.5);
        if (p) poles.push(p);
      }
      const stall = ECHO.Ent.freeSpot(world, fire.x + 3.4, fire.y + 2.4, 3) || { x: fire.x + 2, y: fire.y + 2 };
      return (Fe.decor[s.id] = { key, s, f, fire, poles, stall });
    },
    // Towns near the player that are dressed for a festival today.
    near(game) {
      const world = game.world, pe = game.pe, out = [];
      if (!F() || !F().today(world)) return out;
      for (const s of world.settlements) {
        if (Math.abs(s.x - pe.x) > 40 || Math.abs(s.y - pe.y) > 34) continue;
        if (!F().dressedAt(world, s)) continue;
        const L = Fe.layout(world, s);
        L.live = !!F().liveAt(world, s);
        out.push(L);
      }
      return out;
    },
    // The square the player is standing in, if a festival is on there.
    here(game) {
      const s = game.currentSid && ECHO.Sim.settlement(game.world, game.currentSid);
      return s && F() && F().liveAt(game.world, s) ? Fe.layout(game.world, s) : null;
    },

    update(game, dt) {
      Fe.glows.length = 0;
      const world = game.world;
      if (!world || !game.pe || ECHO.Interior.cur) { Fe.lanterns.length = 0; return; }
      const dl = T.daylight(world.minute);
      const hour = world.minute / 60;
      for (const L of Fe.near(game)) {
        const f = L.f;
        // lantern strings, lit as the light goes
        if (dl < 0.75) {
          for (let i = 0; i < L.poles.length; i++) {
            const a = L.poles[i], b = L.poles[(i + 1) % L.poles.length];
            if (U.dist(a.x, a.y, b.x, b.y) > 7) continue;
            for (let k = 1; k < 6; k++) {
              const t = k / 6, sag = Math.sin(t * Math.PI) * 0.5;
              Fe.glows.push({ x: U.lerp(a.x, b.x, t), y: U.lerp(a.y, b.y, t), h: 2.4 - sag, s: 0.3, c: f.colors[(i + k) % f.colors.length], a: 0.85 * (0.85 + 0.15 * Math.sin(game.time * 3 + k + i)) });
            }
          }
        }
        if (L.live) {
          // the bonfire
          game.light(L.fire.x, L.fire.y, 8, 1.3, '#ffa850');
          Fe.glows.push({ x: L.fire.x, y: L.fire.y, h: 0.6, s: 2.6, c: '#ff9a3c', a: 0.5 + 0.1 * Math.sin(game.time * 11) });
          if (Math.random() < dt * 14) ECHO.Combat.fx.push({ kind: 'p', spark: true, x: L.fire.x + (Math.random() - 0.5) * 0.7, y: L.fire.y + (Math.random() - 0.5) * 0.5, vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4, t: 0, life: 0.9 + Math.random() * 0.6, color: Math.random() < 0.5 ? '#ffd27a' : '#ff7a2a', size: 2, h0: 0.6, vz: 3.2 + Math.random() * 1.5 });
          // wishing lanterns go up after dark
          const rate = (hour >= 20 || hour < 1) ? f.lanterns * 1.4 : 0;
          if (Math.random() < dt * rate && Fe.lanterns.length < 70) {
            const nearMe = U.dist(game.pe.x, game.pe.y, L.fire.x, L.fire.y) < 14 && Math.random() < 0.5;
            const cx = nearMe ? game.pe.x : L.fire.x, cy = nearMe ? game.pe.y : L.fire.y;
            Fe.release(cx + (Math.random() - 0.5) * 10, cy + (Math.random() - 0.5) * 7, f);
          }
        }
      }
      for (let i = Fe.lanterns.length - 1; i >= 0; i--) {
        const l = Fe.lanterns[i];
        l.t += dt;
        l.h += dt * (0.22 + Math.min(0.25, l.t * 0.008));
        l.x += (Math.sin(l.t * 0.4 + l.ph) * 0.25 + 0.12) * dt; l.y += Math.cos(l.t * 0.33 + l.ph) * 0.15 * dt;
        const a = Math.min(1, l.t * 0.8) * Math.max(0, 1 - Math.max(0, l.h - 7) / 5);
        if (a <= 0) { Fe.lanterns.splice(i, 1); continue; }
        Fe.glows.push({ x: l.x, y: l.y, h: l.h, s: l.mine ? 0.95 : 0.66, c: l.mine ? '#ffe9a0' : l.c, a: a * (0.85 + 0.15 * Math.sin(game.time * 5 + l.ph)) });
        Fe.glows.push({ x: l.x, y: l.y, h: l.h, s: l.mine ? 1.8 : 1.2, c: '#ff9a3c', a: a * 0.22 });
      }
      Fe.updateContest(game, dt);
    },
    release(x, y, f, mine) {
      Fe.lanterns.push({ x, y, h: 1.1, t: 0, ph: Math.random() * 6, c: f ? f.colors[Math.floor(Math.random() * 2)] : '#ffb45a', mine: !!mine });
    },

    // ------------------------------------------------------------ the festival stall
    interactables(game) {
      const out = [];
      const L = Fe.here(game);
      if (!L || ECHO.Interior.cur) return out;
      const d = U.dist(L.stall.x, L.stall.y, game.pe.x, game.pe.y);
      if (d < 2.2 && !Fe.contest) out.push({ kind: 'act', label: `${L.f.title} — games, lanterns and the feast`, d: d * 0.5, act: () => Fe.menu(game, L) });
      if (Fe.contest) {
        const c = Fe.contest;
        if (c.arrows <= 0 || c.t <= 0) { /* finishing */ }
      }
      return out;
    },
    mine(game, L) {
      const pl = game.pl, key = L.f.key + '|' + game.world.day + '|' + L.s.id;
      if (!pl.fest || pl.fest.key !== key) {
        pl.fest = { key, done: {} };
        const st = W().state(game.world);
        if (!st.stats.festivals.some(x => x.d === game.world.day)) { st.stats.festivals.push({ d: game.world.day, f: L.f.key, sid: L.s.id }); if (st.stats.festivals.length > 40) st.stats.festivals.shift(); }
      }
      return pl.fest.done;
    },
    menu(game, L) {
      const world = game.world, pl = game.pl, f = L.f, s = L.s;
      const done = Fe.mine(game, L);
      const hour = world.minute / 60;
      const ch = [];
      ch.push({ label: 'Release a wishing lantern', sub: done.wish ? 'You have made your wish tonight' : '3 crowns — and a wish', disabled: done.wish || pl.gold < 3, onPick: () => Fe.wish(game, L) });
      ch.push({ label: f.feast ? 'Sit down to the Harvest Feast' : 'Eat and drink with the town', sub: done.feast ? 'You are full' : 'Heals you; you will be well-fed for a day. The old ones tell stories.', disabled: done.feast, onPick: () => Fe.feast(game, L) });
      ch.push({ label: 'Join the dance', sub: done.dance ? 'Your feet are tired' : 'Dance in the ring by the fire', disabled: done.dance, onPick: () => Fe.dance(game, L) });
      if (f.games) ch.push({ label: 'Enter the archery contest', sub: done.contest ? 'You have had your turn' : '5 crowns · eight arrows · beat the town\'s best', disabled: done.contest || pl.gold < 5, onPick: () => Fe.startContest(game, L) });
      if (f.vigil) ch.push({ label: 'Keep the Longnight vigil until dawn', sub: hour < 21 ? 'The vigil begins at nine' : done.vigil ? 'You have kept it' : 'Remember the dead by the fire through the longest night', disabled: hour < 21 || done.vigil, onPick: () => Fe.vigil(game, L) });
      ch.push({ label: 'Not now', onPick: () => {} });
      UI().modal({ title: `${f.title} in ${s.name}`, html: `<p class="prose">${esc(U.cap(f.desc))}. The whole town is in the square — music, firelight, children underfoot.</p>`, choices: ch });
    },
    wish(game, L, paid) {
      const world = game.world, pl = game.pl;
      const dead = Object.values(world.npcs).filter(n => n.status === 'dead' && (n.op[pl.charId] || 0) > 25 && world.day - (n.diedDay || 0) < 120).slice(-3);
      const legends = world.legends.slice(-2);
      const rememb = dead.length ? dead.map(n => n.first).join(', ') : legends.length ? legends.map(l => l.name).join(', ') : 'those who came before';
      const go = (kind, text) => {
        if (L) Fe.mine(game, L).wish = true;
        if (!paid) pl.gold -= 3;
        W().state(world).stats.wishes++;
        Fe.release(game.pe.x, game.pe.y, L ? L.f : null, true);
        ECHO.Music.stinger('wish');
        if (kind === 'remember') {
          pl.renown += 1;
          for (const n of dead) { const kin = n.spouse && world.npcs[n.spouse]; if (kin && kin.status === 'alive') kin.op[pl.charId] = U.clamp((kin.op[pl.charId] || 0) + 8, -100, 100); }
          const e = W().nearestEcho(world, game.pe.x, game.pe.y);
          if (e && !e.revealed) { e.revealed = true; text += ' That night you dream of a place where pale figures stand in the grass. When you wake, you know the way. (An echo is marked on your map.)'; }
        } else W().charm(world, pl, kind, 15);
        ECHO.PlayerCtl.derivedT = 0;
        UI().toast(`Your lantern rises among the others. ${text}`, 'legend', 7);
      };
      UI().modal({
        title: 'A wishing lantern',
        html: '<p class="prose">You light the little paper lantern and hold it until it tugs at your fingers. What do you wish for?</p>',
        choices: [
          { label: 'Fortune', sub: 'Merchants pay you more, for the rest of the season', onPick: () => go('fortune', 'May the coin come easily.') },
          { label: 'Courage', sub: 'Your blows land harder, for the rest of the season', onPick: () => go('courage', 'May your arm be strong.') },
          { label: 'Health', sub: 'More life in you, for the rest of the season', onPick: () => go('health', 'May you be hale.') },
          { label: `Remembrance — for ${rememb}`, sub: 'For the dead', onPick: () => go('remember', 'For the ones who are gone.') }
        ]
      });
    },
    feast(game, L) {
      const world = game.world, pl = game.pl, s = L.s;
      Fe.mine(game, L).feast = true;
      UI().fadeOut(() => {
        ECHO.Sim.advance(world, 60);
        pl.hp = pl.maxHp; pl.stamina = pl.maxSta;
        W().charm(world, pl, 'wellfed', 1);
        const fresh = ECHO.Chronicle.learnAt(world, s);
        let tale = '';
        const e = W().echoesLeft(world).filter(x => !x.revealed).sort((a, b) => U.dist(a.x, a.y, s.x, s.y) - U.dist(b.x, b.y, s.x, s.y))[0];
        if (e) {
          e.revealed = true;
          const r = ECHO.World.regionAt(world, e.x, e.y);
          tale = ` An old ${Math.random() < 0.5 ? 'woman' : 'man'} at your table tells of a place in ${r.name} where pale figures are seen on clear nights, speaking a tongue no one knows. (Marked on your map.)`;
        }
        UI().fadeIn();
        UI().toast(`You eat until you can't, and drink to the year.${fresh.length ? ` You hear ${fresh.length} pieces of news.` : ''}${tale}`, 'legend', 9);
      }, 500);
    },
    dance(game, L) {
      const world = game.world, pl = game.pl, s = L.s;
      Fe.mine(game, L).dance = true;
      const there = game.ents.filter(e => e.type === 'person' && !e.dead && !e.hidden && e.npcId && U.dist(e.x, e.y, L.fire.x, L.fire.y) < 9);
      const partner = there.map(e => world.npcs[e.npcId]).filter(n => n && n.prof !== 'child').sort((a, b) => (b.op[pl.charId] || 0) - (a.op[pl.charId] || 0))[0];
      UI().fadeOut(() => {
        ECHO.Sim.advance(world, 30);
        for (const e of there) { const n = world.npcs[e.npcId]; if (n) n.op[pl.charId] = U.clamp((n.op[pl.charId] || 0) + 4, -100, 100); }
        pl.renown += 1;
        UI().fadeIn();
        const op = partner ? partner.op[pl.charId] || 0 : 0;
        UI().toast(partner ? (op > 40 ? `You dance with ${partner.first}, who laughs every time you miss a step. "You came!" ${partner.sex === 'f' ? 'she' : 'he'} says. "I hoped you would."` : `${partner.first} pulls you into the ring. By the third turn the whole square is clapping along.`) : 'You join the ring of dancers. Nobody minds that you don\'t know the steps.', 'mercy', 6);
      }, 400);
    },
    vigil(game, L) {
      const world = game.world, pl = game.pl, s = L.s;
      Fe.mine(game, L).vigil = true;
      const year = T.dateOf(world.day).year;
      const dead = Object.values(world.npcs).filter(n => n.status === 'dead' && (n.op[pl.charId] || 0) > 20 && world.day - (n.diedDay || 0) < 60).slice(-6).map(n => n.first + ' ' + n.last);
      const names = [...dead, ...world.legends.slice(-3).map(l => l.name + ' ' + l.epithet)];
      UI().fadeOut(() => {
        let mins = (6 * 60 - world.minute + 1440) % 1440;
        while (mins > 0) { const step = Math.min(60, mins); ECHO.Sim.advance(world, step); mins -= step; }
        game.onNewDay();
        game.ents = game.ents.filter(e => e === game.pe || e.isCompanion);
        pl.hp = pl.maxHp; pl.stamina = pl.maxSta; pl.mana = pl.maxMana;
        let fate = '';
        if (pl.vigilYear !== year && pl.fate < 3) { pl.vigilYear = year; pl.fate++; fate = '<p class="gold" style="text-align:center">As the sun comes up, you feel something of your fate restored. (+1 Fate)</p>'; ECHO.Music.stinger('fate'); }
        // friends bring gifts at dawn
        const gifts = [];
        for (const n of ECHO.People.residents(world, s)) {
          if ((n.op[pl.charId] || 0) < 45 || gifts.length >= 3 || n.prof === 'child') continue;
          const r = Math.random();
          if (r < 0.4 && n.wealth > 20) { const c = Math.round(Math.min(20, n.wealth * 0.1)); n.wealth -= c; pl.gold += c; gifts.push(`${n.first}: ${c} crowns`); }
          else if (r < 0.75) { pl.inv.food += 2; gifts.push(`${n.first}: a honey loaf`); }
          else { pl.inv.herbs += 1; gifts.push(`${n.first}: a sprig of winterbloom`); }
        }
        UI().fadeIn();
        UI().modal({ title: 'Dawn after Longnight', html: `<p class="prose"><i>You keep the fire with the town through the longest night. When the names are spoken, you speak yours:</i></p><p style="text-align:center;color:#bfe8ff">${names.length ? names.map(esc).join(' · ') : 'the ones whose names nobody remembers'}</p>${fate}${gifts.length ? `<p class="dim" style="text-align:center">Gifts at dawn — ${gifts.map(esc).join(' · ')}</p>` : ''}`, choices: [{ label: 'Greet the morning', onPick: () => {} }] });
      }, 900);
    },

    // ------------------------------------------------------------ the archery contest
    startContest(game, L) {
      const world = game.world, pl = game.pl, pe = game.pe;
      // three targets set up around the square, on the far side from you
      const fromP = Math.atan2(L.fire.y - pe.y, L.fire.x - pe.x);
      const cand = [];
      for (let k = 0; k < 32; k++) {
        const a = k / 32 * Math.PI * 2;
        for (const d of [6, 5, 4, 3.2]) {
          const x = L.fire.x + Math.cos(a) * d, y = L.fire.y + Math.sin(a) * d * 0.85;
          if (!ECHO.Ent.fits(world, x, y, 0.38) || !ECHO.Ent.clearLine(world, L.fire.x, L.fire.y, x, y, 0.1)) continue;
          if (U.dist(x, y, pe.x, pe.y) < 3.5) continue;
          cand.push({ x, y, a, d, score: d * 0.4 + Math.cos(U.angleDiff(a, fromP)) * 3 + U.dist(x, y, pe.x, pe.y) * 0.3 });
          break;
        }
      }
      cand.sort((p1, p2) => p2.score - p1.score);
      const pick = [];
      for (const c of cand) { if (pick.length >= 3) break; if (pick.every(o => U.dist(o.x, o.y, c.x, c.y) > 1.8)) pick.push(c); }
      const lane = pick.length === 3 ? pick.map(c => ({ x: c.x, y: c.y, r: 0.5, hits: 0 })) : null;
      if (!lane) { UI().toast('The square is too crowded to set up the targets just now.', 'warn', 4); return; }
      Fe.mine(game, L).contest = true;
      pl.gold -= 5;
      const rivals = ECHO.People.residents(world, L.s).filter(n => n.prof !== 'child').sort((a, b) => ({ hunter: 3, guard: 2 }[b.prof] || 0) - ({ hunter: 3, guard: 2 }[a.prof] || 0) || (b.skill.fight - a.skill.fight)).slice(0, 3)
        .map(n => ({ name: ECHO.People.name(n), id: n.id, score: Math.round(10 + n.skill.fight * 0.3 + ({ hunter: 10, guard: 5 }[n.prof] || 0) + Math.random() * 12) }));
      const c = Fe.contest = { L, targets: lane, arrows: 8, score: 0, t: 75, savedArrows: pl.inv.arrows, savedBow: pl.bow, rivals, shots: [] };
      if (!world.items[pl.bow]) {
        world.items.festbow = { id: 'festbow', kind: 'bow', name: 'a borrowed festival bow', dmg: 8, history: [], holder: 'player' };
        pl.bow = 'festbow';
      }
      pl.inv.arrows = 8;
      ECHO.PlayerCtl.derivedT = 0;
      ECHO.Music.stinger('festival');
      UI().toast(`Eight arrows, three targets. Hold the right mouse button to draw; let go at full draw for a perfect shot. The town's best: ${rivals.map(r => r.name.split(' ')[0] + ' ' + r.score).join(', ')}.`, 'info', 8);
      void c;
    },
    // Called by projectiles in flight.
    hitTarget(p) {
      const c = Fe.contest;
      if (!c) return false;
      for (const t of c.targets) {
        if (U.dist(p.x, p.y, t.x, t.y) > t.r) continue;
        // how true the shot was: how close its line passes to the bullseye
        const L = Math.hypot(p.vx, p.vy) || 1, ux = p.vx / L, uy = p.vy / L;
        const d = Math.abs(ux * (t.y - p.y) - uy * (t.x - p.x));
        const pts = d < 0.1 ? 10 : d < 0.25 ? 5 : 2;
        c.score += pts; t.hits++;
        t.flash = 0.4;
        c.shots.push({ x: p.x - t.x, y: p.y - t.y, t });
        ECHO.Combat.floater(t.x, t.y - 1, pts === 10 ? '✦ 10 — bullseye!' : '+' + pts, pts === 10 ? '#ffe066' : '#f0e6d0', pts === 10);
        ECHO.Sfx.play('arrowHit');
        if (pts === 10) ECHO.Sfx.play('perfect');
        return true;
      }
      return false;
    },
    updateContest(game, dt) {
      const c = Fe.contest;
      if (!c) return;
      if (c.finishing) { c.wait -= dt; if (c.wait <= 0) Fe.results(game, c); return; }
      c.t -= dt;
      for (const t of c.targets) t.flash = Math.max(0, (t.flash || 0) - dt);
      const inFlight = ECHO.Combat.proj.some(p => p.contest);
      if ((game.pl.inv.arrows <= 0 && !inFlight) || c.t <= 0 || U.dist(game.pe.x, game.pe.y, c.L.fire.x, c.L.fire.y) > 24) Fe.finishContest(game);
    },
    finishContest(game) {
      const c = Fe.contest, world = game.world, pl = game.pl;
      if (!c || c.finishing) return;
      c.finishing = true; c.wait = 0.8;
    },
    results(game, c) {
      const world = game.world, pl = game.pl;
      {
        Fe.endContest();
        const best = c.rivals.reduce((a, r) => (r.score > a.score ? r : a), { score: -1 });
        const won = c.score > best.score;
        const table = [...c.rivals, { name: `${pl.first} ${pl.last} (you)`, score: c.score, me: true }].sort((a, b) => b.score - a.score);
        if (won) {
          pl.gold += 50; pl.renown += 3;
          ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} won the archery at ${c.L.f.name} in ${c.L.s.name}, with ${c.score} points.`, importance: 1, x: c.L.fire.x, y: c.L.fire.y, rep: 2, factionRep: { [c.L.s.faction]: 1 } });
          ECHO.Music.stinger('festival');
        }
        UI().modal({
          title: won ? 'You won the archery!' : 'The archery is over',
          html: `<table class="grid" style="width:100%">${table.map((r, i) => `<tr${r.me ? ' style="color:#f2d47a"' : ''}><td>${i + 1}.</td><td>${esc(r.name)}</td><td style="text-align:right"><b>${r.score}</b></td></tr>`).join('')}</table>
            <p class="prose" style="margin-top:10px">${won ? 'The crowd roars. The reeve hands you the prize purse — 50 crowns — and someone puts a crown of ribbons on your head. They will be talking about this for a while.' : `${esc(best.name.split(' ')[0])} takes the prize, and buys you a drink to make up for it.`}</p>`,
          choices: [{ label: 'Back to the festival', onPick: () => {} }]
        });
      }
    },
    endContest(silent) {
      const c = Fe.contest;
      if (!c) return;
      const pl = ECHO.Game.pl;
      if (pl) {
        pl.inv.arrows = c.savedArrows;
        if (pl.bow === 'festbow') { pl.bow = c.savedBow && ECHO.Game.world.items[c.savedBow] ? c.savedBow : null; delete ECHO.Game.world.items.festbow; }
        ECHO.PlayerCtl.derivedT = 0;
      }
      Fe.contest = null;
      void silent;
    },
    drawHUD(ctx, game, W2) {
      const c = Fe.contest;
      if (!c) return;
      const z = window.devicePixelRatio || 1;
      const t = `Archery · arrows ${game.pl.inv.arrows} · score ${c.score} · ${Math.max(0, Math.ceil(c.t))}s · to beat: ${Math.max(...c.rivals.map(r => r.score))}`;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.font = `600 ${Math.round(15 * z)}px "Pixelify Sans", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      const w = ctx.measureText(t).width + 24 * z;
      ctx.fillStyle = 'rgba(20,14,8,0.82)'; ctx.fillRect(W2 / 2 - w / 2, 70 * z, w, 28 * z);
      ctx.strokeStyle = 'rgba(230,192,106,0.9)'; ctx.lineWidth = 1.5 * z; ctx.strokeRect(W2 / 2 - w / 2, 70 * z, w, 28 * z);
      ctx.fillStyle = '#f2d47a'; ctx.fillText(t, W2 / 2, 76 * z);
      ctx.restore();
    }
  };
})();
