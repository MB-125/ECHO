// The story in play: chapters announced, objectives followed, rewards given.
(function () {
  const { U } = ECHO;
  const St = () => ECHO.Story;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const Sg = ECHO.Saga = {
    t: 0,
    update(game, dt) {
      Sg.t -= dt;
      if (Sg.t > 0) return;
      Sg.t = 1.3;
      const world = game.world, pl = game.pl;
      if (!world || !pl || ECHO.UI.paused() || game.defeating || pl.capture) return;
      const s = St().state(world);
      // the story begins once the first steps are behind you
      if (s.ch < 0) {
        if (pl.tut && !pl.tut.done) return;
        if (pl.focus === undefined) return;
        if ((pl.storyWait = (pl.storyWait || 0) + 1) < 6) return;
        const C = St().begin(world, ECHO.Sim.rngFor(world));
        if (C) Sg.announce(game, C, null);
        return;
      }
      const r = St().advance(world, pl, ECHO.Sim.rngFor(world));
      if (r) Sg.chapterDone(game, r.finished, r.next);
    },
    announce(game, C, prev) {
      const pl = game.pl;
      if (!pl.tracked || pl.tracked.startsWith('mark:')) pl.tracked = 'story';
      ECHO.Purpose._html = null; ECHO.Purpose.t = 0;
      ECHO.Music.stinger('echo');
      const n = St().CHAPTERS.indexOf(C) + 1;
      ECHO.UI.banner(C.title, `The Hollow Crown · chapter ${n} of ${St().CHAPTERS.length}`, false);
      ECHO.UI.modal({ title: `📜 ${C.title}`, html: `${prev ? `<p class="prose" style="opacity:0.85">${esc(prev.outro)}</p><hr>` : ''}<p class="prose">${esc(C.intro)}</p><ul>${C.objectives(game.world, pl).map(o => `<li>${esc(o.text)}${o.need > 1 ? ` — ${o.have}/${o.need}` : ''}</li>`).join('')}</ul><p class="dim">The line at the top of the screen follows the story. Read it again in the journal (Tab → The Story).</p>`, choices: [{ label: 'Go on', onPick: () => {} }] });
    },
    chapterDone(game, C, N) {
      const world = game.world, pl = game.pl, R = C.reward || {};
      pl.gold += R.gold || 0;
      const ups = ECHO.Prowess ? ECHO.Prowess.gain(pl, R.xp || 0) : [];
      for (const u of ups) ECHO.Progress.levelUp(game, u);
      pl.renown += 10;
      ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} ${N ? 'came closer to the truth of the Hollow Crown' : 'went through the Rift and ended the Hollow King. The way between worlds is closed'}.`, importance: N ? 2 : 3, x: pl.x, y: pl.y, rep: N ? 3 : 15 });
      ECHO.UI.toast(`Chapter complete — ${C.title}: +${R.gold || 0} crowns, +${R.xp || 0} experience.`, 'legend', 7);
      if (N) return Sg.announce(game, N, C);
      // the end
      if (R.legendary) {
        const it = ECHO.Character.makeItem(world, { kind: 'sword', name: 'Crownbreaker', dmg: 52, holder: 'player', history: [{ d: world.day, t: `taken from the ruin of the Hollow King's crown by ${pl.first} ${pl.last}` }] });
        it.rarity = 'legendary'; it.affix = 'thirst'; it.plus = 0; it.legend = true; it.level = 10;
        pl.items.push(it.id); pl.weapon = it.id; ECHO.PlayerCtl.derivedT = 0;
      }
      pl.honor = 'Rift-sealer';
      if (pl.tracked === 'story') pl.tracked = null;
      ECHO.Music.stinger('echo');
      ECHO.UI.banner('The Rift is sealed', `${pl.first} ${pl.last}, Rift-sealer`, false);
      ECHO.UI.modal({ title: '📜 The Hollow Crown — the end', html: `<p class="prose">${esc(C.outro)}</p><p class="gold">You carry Crownbreaker now, made from what was left of his crown. The world will remember you as the Rift-sealer.</p><p class="dim">The world goes on. There are still dungeons below it, beasts in the wild, and kingdoms that will rise and fall.</p>`, choices: [{ label: 'The world goes on', onPick: () => {} }] });
    },
    // For the line at the top of the screen.
    tracked(world, pl) {
      const C = St().chapter(world);
      if (!C || St().state(world).done) return null;
      const obj = C.objectives(world, pl), o = obj.find(x => !x.done) || obj[0];
      return { kind: 'track', label: `📜 ${C.title}: ${o.text}${o.need > 1 ? ` (${o.have}/${o.need})` : ''}`, where: o.where };
    },
    // The journal page.
    html(world, pl) {
      const s = St().state(world), CH = St().CHAPTERS;
      if (s.ch < 0) return '<p class="dim">Nothing has happened yet. It will.</p>';
      let html = `<p class="dim">The Hollow Crown — a story that belongs to this world. If you fall, whoever comes after you carries it on.</p>`;
      CH.forEach((C, i) => {
        if (i > s.ch && !s.done) return;
        const cur = i === s.ch && !s.done;
        html += `<div class="card" style="${cur ? 'border-color:#c8a85a' : ''}"><h4>${cur ? '📜' : '✔'} Chapter ${i + 1}: ${esc(C.title)}</h4><div class="prose" style="font-size:16px">${esc(C.intro)}</div>`;
        if (cur) html += `<ul>${C.objectives(world, pl).map(o => `<li class="${o.done ? 'gold' : ''}">${o.done ? '✔ ' : ''}${esc(o.text)}${o.need > 1 ? ` — ${o.have}/${o.need}` : ''}${!o.done && ECHO.Guide ? `<div class="dim" style="font-size:13px">${esc(ECHO.Guide.how(o.text))}</div>` : ''}</li>`).join('')}</ul><div class="row"><button class="small" data-track="story">${pl.tracked === 'story' ? 'Stop following the story' : 'Follow the story'}</button></div>`;
        else html += `<div class="prose dim" style="font-size:15px">${esc(C.outro)}</div>`;
        html += '</div>';
      });
      return html;
    }
  };
})();
