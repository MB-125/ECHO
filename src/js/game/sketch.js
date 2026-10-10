// Sketching: a sketchbook of the world.
//
// With a sketchbook (sold at markets) you can sit and draw whatever is in
// front of you: a town from its edge, a ring of standing stones, a dungeon's
// mouth, a great beast's lair, a deer at the edge of the trees. Stay still
// while you draw — a deer that notices you won't wait — and the picture goes
// into your book (a real picture of the moment, in charcoal). Scholars at any
// archive buy a fair copy of each subject, and pay most for the rare ones.
// Creatures you've drawn fill in your naturalist's notes.
(function () {
  const { U } = ECHO;
  const P = ECHO.Pastimes;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const NOTES = {
    hare: 'Bristlehares: quick, skittish, quilled about the neck. They freeze before they bolt.',
    wolf: 'Duskwolves hunt in packs and grow bold after dark. The leader lunges first.',
    deer: 'Red deer graze the woods\' edge and bolt together at a scent.',
    stag: 'The stag leads the herd and carries a crown of antlers.',
    whitestag: 'A white-antlered stag: seen only in the years the great herds move.',
    hind: 'The White Hind shows herself only to those the forest favours.',
    giant: 'Hill-giants walk the land slowly, and the ground shakes at each step.',
    dragon: 'A dragon: the largest living thing you have ever seen, and fire does not trouble it.',
    beast: 'A great beast of the wilds, that remembers those who fought it.',
    winter: 'The Winter Wolf: white as snow and twice the size of the rest of her pack.',
    horse: 'Your own horse, drawn at rest.'
  };

  const S = ECHO.Sketch = {
    cur: null,
    // what's in front of you worth drawing
    subjects(game) {
      const world = game.world, pe = game.pe, pl = game.pl, out = [];
      if (ECHO.Interior.cur) return out;
      const lv = P.level(pl, 'artist'), reach = lv >= 5 ? 12 : 8;
      const add = (key, name, kind, x, y, value, extra) => out.push(Object.assign({ key, name, kind, x, y, value, d: U.dist(x, y, pe.x, pe.y) }, extra || {}));
      for (const e of game.ents) {
        if (e.dead || e.hidden || e === pe || e.type === 'person') continue;
        const d = U.dist(e.x, e.y, pe.x, pe.y);
        if (d > reach) continue;
        let key = null, name = null, value = 0;
        if (e.species === 'hare') { key = 'hare'; name = 'a bristlehare'; value = 5; }
        else if (e.winter) { key = 'winter'; name = 'the Winter Wolf'; value = 70; }
        else if (e.species === 'wolf' && !e.humanoid) { key = 'wolf'; name = 'a duskwolf'; value = 10; }
        else if (e.species === 'deer') { key = e.white ? 'whitestag' : e.stag ? 'stag' : 'deer'; name = e.white ? 'the white-antlered stag' : e.stag ? 'a red stag' : 'a red deer'; value = e.white ? 60 : e.stag ? 18 : 12; }
        else if (e.species === 'hind') { key = 'hind'; name = 'the White Hind'; value = 80; }
        else if (e.giant) { key = 'giant'; name = e.label; value = 70; }
        else if (e.dragon) { key = 'dragon'; name = e.label; value = 120; }
        else if (e.type === 'boss') { key = 'beast:' + e.boss.id; name = e.label; value = 50; }
        if (key) add(key, name, 'creature', e.x, e.y, value, { ent: e, nkey: key.startsWith('beast:') ? 'beast' : key });
      }
      if (pl.horseAt && U.dist(pl.horseAt.x, pl.horseAt.y, pe.x, pe.y) < 6 && pl.horse) add('horse:' + pl.horse.name, `${pl.horse.name}, your horse`, 'creature', pl.horseAt.x, pl.horseAt.y, 6, { nkey: 'horse' });
      for (const s0 of ECHO.Explore.sites(world)) if (s0.found && U.dist(s0.x, s0.y, pe.x, pe.y) < 10) add('site:' + s0.id, s0.name, s0.cat === 'delve' ? 'dungeon' : 'landmark', s0.x, s0.y, s0.cat === 'delve' ? 20 : s0.unnamed === false && s0.namedBy ? 30 : 15);
      for (const l of world.lairs) if (U.dist(l.x, l.y, pe.x, pe.y) < 12) add('lair:' + l.id, `the lair of ${l.boss.name}`, 'landmark', l.x, l.y, 25);
      for (const s0 of world.settlements) { const d = U.dist(s0.x, s0.y, pe.x, pe.y); if (d > 7 && d < 18) add('town:' + s0.id, `${s0.name}, from outside the walls`, 'town', s0.x, s0.y, s0.kind === 'capital' ? 14 : 8); }
      return out.sort((a, b) => a.d - b.d);
    },
    has(pl, key) { return (pl.sketches || []).some(s => s.key === key); },
    interactables(game) {
      const pl = game.pl, pe = game.pe;
      if (!pl.inv.sketchbook || S.cur || pe.mounted || pe.inBoat || pe.swimming || ECHO.Interior.cur) return [];
      const sub = S.subjects(game).find(s => !S.has(pl, s.key));
      if (!sub) return [];
      return [{ kind: 'act', label: `Sketch ${sub.name}`, d: 2.5, act: () => S.begin(game, sub) }];
    },
    begin(game, sub) {
      const pe = game.pe;
      S.cur = { sub, t: 0, need: sub.kind === 'creature' ? 3.2 : 4.5, x: pe.x, y: pe.y, hp: game.pl.hp };
      pe.dir = Math.atan2(sub.y - pe.y, sub.x - pe.x); pe.flip = Math.cos(pe.dir) < 0;
      game.ui.toast(`You sit down and start to draw ${sub.name}. Keep still…`, 'info', 3);
    },
    tick(game, dt) {
      const c = S.cur; if (!c) return;
      const pe = game.pe, pl = game.pl;
      c.t += dt;
      const moved = U.dist(pe.x, pe.y, c.x, c.y) > 0.4, hurt = pl.hp < c.hp - 1;
      const e = c.sub.ent;
      const gone = e && (e.dead || U.dist(e.x, e.y, pe.x, pe.y) > (P.level(pl, 'artist') >= 5 ? 14 : 10));
      if (moved || hurt || gone) { S.cur = null; game.ui.toast(gone ? 'Your subject has gone. The sketch is only half done.' : 'You get up; the sketch is left unfinished.', 'info', 3); return; }
      if (e) c.sub.x = e.x, c.sub.y = e.y;
      if (Math.random() < dt * 2) ECHO.Combat.floater(pe.x, pe.y - 1.4, '✎', '#e8dcc0');
      if (c.t >= c.need) { S.cur = null; S.finish(game, c.sub); }
    },
    // the picture itself: whatever is on screen, in charcoal on paper
    capture() {
      try {
        const R = ECHO.Renderer;
        let src = null;
        if (R && R.renderer && R.scene && R.camera) { R.renderer.render(R.scene, R.camera); src = R.renderer.domElement; }
        else if (R && R.canvas) src = R.canvas;
        if (!src) return null;
        const w = 168, h = 104, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        const g = cv.getContext('2d');
        const sw = src.width, sh = src.height, cw = sw * 0.55, ch = cw * h / w;
        g.fillStyle = '#efe6cf'; g.fillRect(0, 0, w, h);
        g.filter = 'grayscale(1) sepia(0.55) contrast(1.6) brightness(1.08)';
        g.globalAlpha = 0.92;
        g.drawImage(src, (sw - cw) / 2, (sh - ch) / 2 - sh * 0.04, cw, ch, 0, 0, w, h);
        g.filter = 'none'; g.globalAlpha = 1;
        const vg = g.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, w * 0.62);
        vg.addColorStop(0, 'rgba(239,230,207,0)'); vg.addColorStop(1, 'rgba(239,230,207,0.95)');
        g.fillStyle = vg; g.fillRect(0, 0, w, h);
        return cv.toDataURL('image/jpeg', 0.6);
      } catch (e) { return null; }
    },
    finish(game, sub) {
      const pl = game.pl, world = game.world;
      pl.sketches = pl.sketches || [];
      const img = S.capture();
      pl.sketches.push({ key: sub.key, name: sub.name, kind: sub.kind, nkey: sub.nkey || null, day: world.day, img, value: sub.value, sold: false });
      if (pl.sketches.length > 40) { const i = pl.sketches.findIndex(s => s.sold); pl.sketches.splice(i >= 0 ? i : 0, 1); }
      if (sub.nkey) { pl.naturalist = pl.naturalist || {}; pl.naturalist[sub.nkey] = pl.naturalist[sub.nkey] || world.day; }
      if (ECHO.Music) ECHO.Music.stinger('letter');
      game.ui.toast(`A sketch of ${sub.name}, into your book. (Journal → Crafts & pastimes; sell a fair copy at any archive.)`, 'legend', 5);
      P.gain(game, 'artist', 5 + Math.round(sub.value / 6));
    },
    price(pl, sk) {
      const lv = P.level(pl, 'artist');
      let v = sk.value * (lv >= 3 ? 1.33 : 1);
      if (lv >= 7 && (sk.kind === 'landmark' || sk.value >= 60)) v *= 2;
      return Math.round(v);
    },
    archiveHtml(pl) {
      const ks = (pl.sketches || []).filter(s => !s.sold);
      if (!ks.length) return '';
      return `<h4 class="ware-h">Your sketches</h4><p class="dim">The scholars will buy a fair copy of each sketch for the archive. You keep the original.</p><div class="sketches">${ks.map(s => `<div class="sk">${s.img ? `<img src="${s.img}">` : '<div class="noimg">✎</div>'}<div>${esc(U.cap(s.name))}</div><button class="small" data-sksell="${esc(s.key)}">Sell a copy — ${S.price(pl, s)} cr</button></div>`).join('')}</div>`;
    },
    bindArchive(body, render) {
      const game = ECHO.Game, pl = game.pl;
      body.querySelectorAll('button[data-sksell]').forEach(b => b.addEventListener('click', () => {
        const sk = (pl.sketches || []).find(s => s.key === b.dataset.sksell && !s.sold); if (!sk) return;
        sk.sold = true; const v = S.price(pl, sk); pl.gold += v; ECHO.Sfx.play('coin');
        P.gain(game, 'artist', 2);
        ECHO.UI.toast(`The scholar holds your ${esc(sk.name)} to the light. "Good. Very good." (+${v} crowns)`, 'info', 3);
        render();
      }));
    },
    journalHtml(game) {
      const pl = game.pl, sk = pl.sketches || [];
      let html = `<h4 class="ware-h">✎ Your sketchbook</h4>`;
      if (!pl.inv.sketchbook && !sk.length) return html + '<p class="dim">Buy a sketchbook at a market to start one.</p>';
      html += sk.length ? `<div class="sketches">${sk.slice().reverse().map(s => `<div class="sk">${s.img ? `<img src="${s.img}">` : '<div class="noimg">✎</div>'}<div>${esc(U.cap(s.name))}</div><div class="dim">${ECHO.TIME.fmtDate(s.day)}${s.sold ? ' · a copy is in the archives' : ''}</div></div>`).join('')}</div>` : '<p class="dim">Empty so far. Walk up to a landmark, a town or a creature and press E to sketch it.</p>';
      const nat = pl.naturalist || {};
      const keys = Object.keys(NOTES);
      html += `<h4 class="ware-h">A naturalist's notes</h4><div class="card">${keys.map(k => nat[k] ? `<div>✓ ${esc(NOTES[k])}</div>` : '<div class="dim">· ……</div>').join('')}<div class="dim" style="margin-top:4px">${Object.keys(nat).length} of ${keys.length} recorded.</div></div>`;
      return html;
    }
  };
  P.extraAct = P.extraAct || []; P.extraAct.push(game => S.interactables(game));
  P.extraTick = P.extraTick || []; P.extraTick.push((game, dt) => S.tick(game, dt));
  P.extraHtml = P.extraHtml || []; P.extraHtml.push(game => S.journalHtml(game));
})();
