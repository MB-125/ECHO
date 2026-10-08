// First steps: a short guided start for a new life.
//
// A card on the left of the screen walks you through the basics one at a time
// — moving, the map, the guide, talking to people, a first fight (rats come up
// from the cellars), picking up loot, your character page, the smith and the
// market — pointing the way where there is somewhere to go, and paying a
// little for each step. It can be skipped at any time.
(function () {
  const { U } = ECHO;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const STEPS = [
    { k: 'move', title: 'Find your feet', text: 'Walk with <b>W A S D</b>. Hold <b>Ctrl</b> to sneak.', check: (g, t) => U.dist(g.pe.x, g.pe.y, t.sx, t.sy) > 6 },
    { k: 'map', title: 'Look at the land', text: 'Press <b>M</b> for your map. Scroll to zoom, drag to move, click a place to be guided there.', check: (g, t) => t.flags.map },
    { k: 'guide', title: 'Ask the guide', text: 'Press <b>J</b>. The guide says what to do next, and how.', check: (g, t) => t.flags.guide },
    { k: 'talk', title: 'Meet someone', text: 'Walk up to anyone in town and press <b>E</b> to talk.', check: (g, t) => t.flags.talk },
    { k: 'fight', title: 'A first fight', text: 'Rats have come up out of the cellars. Kill them: <b>left-click</b> to strike (hold for a heavy blow), <b>Space</b> to roll, <b>Shift</b> to guard, <b>R</b> to lock on.', start: (g, t) => Tu.spawnRats(g, t), check: (g, t) => t.rats && t.rats.every(id => { const e = g.ents.find(x => x.id === id); return !e || e.dead; }), where: (g, t) => { const e = t.rats && g.ents.find(x => t.rats.includes(x.id) && !x.dead); return e ? { x: e.x, y: e.y, name: 'the rats' } : null; } },
    { k: 'loot', title: 'Take what they left', text: 'Walk over coins and monster parts to pick them up. Gear needs <b>E</b>.', check: (g, t) => t.flags.loot || !g.loot.some(l => !l.taken && U.dist(l.x, l.y, g.pe.x, g.pe.y) < 12), where: g => { const l = g.loot.filter(x => !x.taken).sort((a, b) => U.dist(a.x, a.y, g.pe.x, g.pe.y) - U.dist(b.x, b.y, g.pe.x, g.pe.y))[0]; return l ? { x: l.x, y: l.y, name: 'what they dropped' } : null; } },
    { k: 'char', title: 'Know yourself', text: 'Press <b>K</b>: your level, rank, gear and skills. You grow stronger by beating foes — the stronger they are, the more you learn.', check: (g, t) => t.flags.char },
    { k: 'smith', title: 'Visit the smith', text: 'Smiths sell weapons, and turn monster parts into better gear. Walk to the smithy and press <b>E</b>.', check: (g, t) => t.flags.smith, where: g => Tu.building(g, 'smithy') },
    { k: 'market', title: 'Visit the market', text: 'Markets sell food, herbs, arrows and potions, and buy what you bring back. Walk to a stall and press <b>E</b>.', check: (g, t) => t.flags.market, where: g => Tu.building(g, 'market') },
    { k: 'done', title: 'You are ready', text: 'The line at the top of the screen always points to your next goal. Dungeons (▼ on the map) hold monsters, loot and lords. Good luck.', check: () => false, final: true }
  ];

  const Tu = ECHO.Tutorial = {
    STEPS,
    st(pl) { return pl.tut; },
    begin(game) {
      const pl = game.pl;
      if (pl.tut) return;
      pl.tut = { i: 0, flags: {}, sx: game.pe.x, sy: game.pe.y, done: false };
      Tu._html = null;
    },
    flag(k) { const g = ECHO.Game, t = g && g.pl && g.pl.tut; if (t && !t.done) t.flags[k] = true; },
    skip(game) { const t = game.pl.tut; if (!t) return; t.done = true; t.skipped = true; Tu.finish(game, true); },
    finish(game, skipped) {
      const t = game.pl.tut; t.done = true;
      if (game.pl.tracked && game.pl.tracked.startsWith('mark:') && t.marked) game.pl.tracked = null;
      ECHO.UI.settings.tutorialDone = true;
      try { localStorage.setItem('echo.settings', JSON.stringify(ECHO.UI.settings)); } catch (e) { /* ignore */ }
      Tu._html = null; Tu.render(game);
      if (!skipped) {
        game.pl.gold += 30; game.pl.potions = game.pl.potions || {}; game.pl.potions.heal = (game.pl.potions.heal || 0) + 2;
        ECHO.UI.toast('First steps done: 30 crowns and two healing draughts (drink with 1).', 'legend', 6);
      }
    },
    building(game, type) {
      const world = game.world, pe = game.pe;
      let best = null, bd = Infinity;
      for (const s of world.settlements) for (const b of s.buildings) if (b.type === type) { const d = U.dist(b.x, b.y, pe.x, pe.y); if (d < bd) { bd = d; best = b; } }
      return best && bd < 90 ? { x: best.x + (best.w || 2) / 2, y: best.y + (best.h || 2) + 0.5, name: 'the ' + type } : null;
    },
    spawnRats(game, t) {
      const world = game.world, pe = game.pe;
      t.rats = [];
      for (let i = 0; i < 3; i++) {
        const a = i * 2.1 + Math.random(), sp = ECHO.Ent.freeSpot(world, pe.x + Math.cos(a) * 6, pe.y + Math.sin(a) * 6, 4);
        if (!sp) continue;
        const e = ECHO.Monsters.make(game, 'giantrat', sp.x, sp.y, 1, { noElite: true, aggro: true });
        e.hp = e.maxHp = Math.round(e.maxHp * 0.8); e.label = 'Cellar rat'; e.tutorial = true;
        game.ents.push(e); t.rats.push(e.id);
      }
    },
    // ------------------------------------------------------------ every frame
    update(game, dt) {
      const pl = game.pl, t = pl && pl.tut;
      if (!t || t.done || !game.pe) { Tu.render(game); return; }
      const S = STEPS[t.i];
      if (!t.started) { t.started = true; if (S.start) S.start(game, t); Tu._html = null; }
      // point the way where there is somewhere to go
      const w = !ECHO.Interior.cur && S.where && S.where(game, t);
      if (w && !pl.tracked) { pl.tracked = `mark:${w.x.toFixed(1)}:${w.y.toFixed(1)}:${w.name}`; t.marked = true; ECHO.Purpose._html = null; ECHO.Purpose.t = 0; }
      if (!S.final && S.check(game, t)) {
        if (t.marked && pl.tracked && pl.tracked.startsWith('mark:')) { pl.tracked = null; t.marked = false; }
        pl.gold += 5;
        ECHO.Sfx.play('coin');
        ECHO.Combat.floater(game.pe.x, game.pe.y - 1.5, `✔ ${S.title}`, '#9fe0c8', true);
        t.i++; t.started = false; Tu._html = null;
        if (STEPS[t.i].final) { t.finalT = 12; }
      }
      if (STEPS[t.i].final && (t.finalT -= dt) <= 0) Tu.finish(game);
      Tu.render(game);
    },
    render(game) {
      const el = document.getElementById('hud-tut');
      if (!el) return;
      const t = game.pl && game.pl.tut;
      if (!t || t.done) { if (Tu._html !== '') { Tu._html = ''; el.innerHTML = ''; el.classList.add('hidden'); } return; }
      const S = STEPS[t.i];
      const html = `<div class="tt-h"><span>First steps · ${Math.min(t.i + 1, STEPS.length - 1)}/${STEPS.length - 1}</span><button class="tt-skip" data-tskip="1" title="Skip the tutorial">skip</button></div><div class="tt-t">${esc(S.title)}</div><div class="tt-x">${S.text}</div>`;
      if (Tu._html === html) return;
      Tu._html = html; el.innerHTML = html; el.classList.remove('hidden');
      const b = el.querySelector('[data-tskip]');
      if (b) b.addEventListener('click', ev => { ev.stopPropagation(); Tu.skip(game); });
    }
  };
})();
