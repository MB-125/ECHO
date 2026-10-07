// Finds: the small discoveries of the road — caches under cairns and in
// hollow trees, the pages of a lost expedition's journal, rare herbs that
// open only at the right hour, and the slow filling-in of the map.
(function () {
  const { U } = ECHO;
  const D = () => ECHO.Discover;
  const UI = () => ECHO.UI;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const F = ECHO.Finds = {
    glows: [], t: 0, mT: 0,
    reset() { F.glows = []; F.t = 0; F.mT = 0; },
    update(game, dt) {
      F.glows.length = 0;
      const world = game.world, pe = game.pe, pl = game.pl;
      if (!world || !pe || ECHO.Interior.cur || pl.capture) return;
      D().ensure(world);
      const night = game.isNight();
      // herbs show themselves when they are open
      for (const h of world.herbs) {
        if (Math.abs(h.x - pe.x) > 14 || Math.abs(h.y - pe.y) > 14) continue;
        if (!D().herbReady(world, h, night)) continue;
        const H = D().HERBS[h.k];
        F.glows.push({ x: h.x, y: h.y, h: 0.15, s: 0.55, c: H.color, a: (night ? 0.55 : 0.35) + 0.15 * Math.sin(game.time * 2.5 + h.x) });
      }
      // a cache catches the eye only when you are close
      for (const c of world.caches) {
        if (c.found || Math.abs(c.x - pe.x) > 7 || Math.abs(c.y - pe.y) > 7) continue;
        const d = U.dist(c.x, c.y, pe.x, pe.y);
        if (d < 5) F.glows.push({ x: c.x, y: c.y - 0.1, h: 0.25, s: 0.5, c: '#fff2c0', a: 0.18 + 0.12 * Math.sin(game.time * 4) });
      }
      // the expedition's last camp
      const E = world.expedition;
      if (E && E.camp && !E.camp.found && U.dist(E.camp.x, E.camp.y, pe.x, pe.y) < 20) { F.glows.push({ x: E.camp.x, y: E.camp.y, h: 0.5, s: 1.6, c: '#ffcf8a', a: 0.35 }); if (night) game.light(E.camp.x, E.camp.y, 4, 0.6, '#ffb060'); }
      // the map fills in
      F.mT -= dt;
      if (F.mT <= 0) {
        F.mT = 6;
        const m = D().milestone(world, pl);
        if (m) { ECHO.Music.stinger('discover'); UI().toast(`You have walked ${m.words} — ${m.pct}% of the land.${m.step >= 3 ? ' People will talk about it.' : ''} The archives pay for good maps.`, 'legend', 6); }
      }
    },
    interactables(game) {
      const out = [], world = game.world, pe = game.pe, pl = game.pl;
      if (ECHO.Interior.cur || !world.caches) return out;
      for (const c of world.caches) {
        if (c.found || U.dist(c.x, c.y, pe.x, pe.y) > 1.6) continue;
        out.push({ kind: 'act', label: `Search ${D().CACHE_KINDS[c.kind]}`, d: 0.2, act: () => F.search(game, c) });
      }
      const night = game.isNight();
      for (const h of world.herbs) {
        if (U.dist(h.x, h.y, pe.x, pe.y) > 1.4 || !D().herbReady(world, h, night)) continue;
        out.push({ kind: 'act', label: `Pick the ${D().HERBS[h.k].name}`, d: 0.15, act: () => F.pick(game, h) });
      }
      const E = world.expedition;
      if (E && E.camp && !E.camp.found && U.dist(E.camp.x, E.camp.y, pe.x, pe.y) < 1.8) out.push({ kind: 'act', label: 'Search the old camp', d: 0.1, act: () => F.camp(game) });
      return out;
    },
    search(game, c) {
      const world = game.world, pl = game.pl;
      const r = D().search(world, c, pl, ECHO.Sim.rngFor(world));
      if (!r) return;
      ECHO.Sfx.play('coin');
      ECHO.Character.train(pl, 'study', 0.2);
      if (r.page) {
        ECHO.Music.stinger('discover');
        const E = world.expedition;
        UI().modal({
          title: `A page from a journal — ${r.page.page} of ${r.page.of}`,
          html: `<p class="dim">Wrapped in oilcloth under the stones: ${esc(r.items.join(', '))}, and a page written in a small, careful hand.</p><blockquote class="prose" style="font-style:italic">${esc(r.page.text)}</blockquote>
            ${r.page.next ? `<p>${r.page.next.camp ? 'At the bottom, a sketch map: the last camp, ' : 'At the bottom, a note: the next page was left '}<b>${esc(r.page.next.hint)}</b>. <span class="dim">(Marked on your map.)</span></p>` : ''}
            <p class="dim">The lost expedition of ${esc(E.first)} ${esc(E.last)}, ${esc(E.title)}.</p>`,
          choices: [{ label: 'Keep the page', onPick: () => {} }]
        });
      } else UI().toast(`Under ${D().CACHE_KINDS[c.kind]}, someone hid ${r.items.join(', ')}.`, 'legend', 5);
    },
    pick(game, h) {
      const world = game.world, pl = game.pl;
      const first = D().pick(world, h, pl);
      const H = D().HERBS[h.k];
      ECHO.Sfx.play('pickup');
      ECHO.Character.train(pl, 'study', 0.15);
      if (first) { ECHO.Music.stinger('discover'); UI().toast(`A new plant for your herbarium: ${H.name} — ${H.desc}. Any herbalist will pay well for it.`, 'study', 7); }
      else UI().toast(`You pick the ${H.name}.`, 'info', 2);
    },
    camp(game) {
      const world = game.world, pl = game.pl, E = world.expedition;
      if (!D().camp(world, pl)) return;
      ECHO.Music.stinger('echo');
      UI().modal({
        title: 'The last camp',
        html: `<p class="prose">A ring of stones, black with old fire. A tent rotted to rags. Under a slab, sealed in wax: the survey of ${esc(E.first)} ${esc(E.last)}'s expedition — maps of every corner of the land, the way the old road ran, the places no one living has seen.</p>
          <p>And a brass compass, its needle swinging to every hidden thing at once before it settles.</p><p class="gold">Every place in the land is now marked on your map.</p>`,
        choices: [{ label: 'Take it home', onPick: () => { UI().mapDirty = true; } }]
      });
    }
  };
})();
