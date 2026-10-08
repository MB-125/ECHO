// The story: the Hollow Crown.
//
// The echoes in the grass, the runes on the ruins, the sealed vault, the lost
// expedition and the Rift are one story. Long ago a king of the old world —
// the Hollow King — opened a way between worlds to make himself undying, and
// his world ended. The old people sealed the way with three seals and wrote
// the words to close it on every stone. Now the seals are held by the lords of
// the deep places, and the way is opening again.
//
// The story belongs to the world, not to one life: if you die, whoever comes
// after you picks up where you left off.
(function () {
  const { U } = ECHO;

  const CHAPTERS = [
    { id: 'voice', title: 'A Voice in the Stone',
      intro: 'You dream of grass under a white sky, and figures standing in it who do not move. One of them says a word you do not know. When you wake you can still feel its shape in your mouth.\n\nThe scholars of the capital keep the old records. Someone there may know what it means.',
      objectives: (w, pl) => [O('Speak with the scholars at the archive of a capital', w.story.flags.archive ? 1 : 0, 1, capitalArchive(w, pl))],
      outro: 'The archivist goes pale when you repeat the word. "That is the old tongue. That word is a name — the Hollow King\'s. Before our kingdoms there was another world here, and he ended it, trying to live forever. They say he opened a door between worlds. They say they sealed it." She pulls down a book with a broken spine. "Learn the old words. Find the places where the old people still stand. And whatever you do, do not say that name again."',
      reward: { gold: 40, xp: 80 } },
    { id: 'words', title: 'Words of the Old Tongue',
      intro: 'The ruins are covered in the old tongue, and the echoes — pale figures in the grass at night — remember the old world. Learn enough of the language, and find one echo, and you may understand what happened.',
      objectives: (w, pl) => [O('Words of the old tongue known', words(w), 6, ruin(w, pl)), O('Echoes of the old world found', echoes(w), 1, echo(w, pl))],
      outro: 'The echo turns its head as you approach, which they are not supposed to do. "Three seals," it says, in the old tongue, and you understand it. "Three seals, and three keepers, and the door below the stone. He is knocking."',
      reward: { gold: 60, xp: 160 } },
    { id: 'expedition', title: 'The Lost Expedition',
      intro: 'Forty years ago an expedition went looking for the door below the stone, and never came back. Its journal was torn apart and hidden across the land. Find its pages: they may say where the seals went.',
      objectives: (w, pl) => [O('Pages of the lost journal found', pages(w), 2, nextPage(w) || unknown(w, pl))],
      outro: 'The second page is stained and the writing shakes. "We were wrong. The seals were never in the vault. The old people gave them to guardians — the things that live in the deep places. The lords below are the keepers now, whether they know it or not. If you kill a keeper, you hold its seal. We will not get that far."',
      reward: { gold: 80, xp: 260 } },
    { id: 'seals', title: 'The Three Seals',
      intro: 'The lords of the deep places — the Necromancer, the Goblin Warlord, the Spider Queen, the Ogre Chieftain, the Forge Golem — each carry a seal without knowing it. Take three. They are deep, and they are strong: grow stronger first.',
      objectives: (w, pl) => [O('Seals taken from the lords of the deep', w.story.seals, 3, deepDungeon(w, pl))],
      outro: 'The third seal is warm in your hand, and the other two answer it with a sound like a bell under water. Together they point, very clearly, to a carved stone you have perhaps walked past without seeing.',
      reward: { gold: 150, xp: 600 } },
    { id: 'vault', title: 'The Door Below the Stone',
      intro: 'The seals know where the door is. Go to the carved stone and open the vault beneath it.',
      start: w => { if (w.lang && w.lang.vault) w.lang.vault.revealed = true; },
      objectives: (w, pl) => [O('Open the sealed vault', w.lang && w.lang.vault && w.lang.vault.opened ? 1 : 0, 1, w.lang && w.lang.vault ? { x: w.lang.vault.x, y: w.lang.vault.y, name: 'the carved stone' } : null)],
      outro: 'In the vault there is no treasure. There is a map of the world on the ceiling, and on it one place burns: the Rift. The seals in your pack are cracking. They held the door for a thousand years. They will not hold it for much longer.',
      reward: { gold: 200, xp: 800 } },
    { id: 'rift', title: 'The Hollow King',
      intro: 'The Rift is open, and the Hollow King is on the other side of it, wearing the crown that ate his world. Go through. End it. You will need to be a hero to come back.',
      start: (w, rng) => ensureRift(w, rng),
      objectives: (w, pl) => [O('Grow strong enough to face him (level 9)', Math.min(9, ECHO.Prowess ? ECHO.Prowess.level(pl) : 1), 9), O('Defeat the Hollow King, beyond the Rift', w.story.kingSlain ? 1 : 0, 1, w.rift ? { x: w.rift.x, y: w.rift.y + 1, name: 'the Rift' } : null)],
      outro: 'The crown hits the floor and rolls, and keeps rolling, and is gone. Behind you the Rift folds shut like a book. On the other side, in the grass under the white sky, the echoes are walking away — slowly, together, as if they finally have somewhere to go.',
      reward: { gold: 500, xp: 1500, legendary: true } }
  ];

  const O = (text, have, need, where) => ({ text, have: Math.min(have, need), need, done: have >= need, where: where || null });
  const words = w => w.lang ? Object.keys(w.lang.known).length : 0;
  const echoes = w => w.wonders && w.wonders.echoes ? w.wonders.echoes.filter(e => e.found).length : 0;
  const pages = w => w.expedition ? w.expedition.pages.length : 0;
  const near = (pl, list) => { let b = null, bd = Infinity; for (const x of list) { const d = U.dist(x.x, x.y, pl.x, pl.y); if (d < bd) { bd = d; b = x; } } return b; };
  const capitalArchive = (w, pl) => { const s = near(pl, w.settlements.filter(s => s.kind === 'capital' && s.buildings.some(b => b.type === 'archive'))); const b = s && s.buildings.find(b => b.type === 'archive'); return b ? { x: b.x + (b.w || 2) / 2, y: b.y + (b.h || 2) + 0.5, name: `the archive at ${s.name}` } : null; };
  const ruin = (w, pl) => { const r = near(pl, w.ruins.filter(r => !r.visited)); return r ? { x: r.x, y: r.y, name: r.name, vague: true } : null; };
  const echo = (w, pl) => { const e = w.wonders && w.wonders.echoes && near(pl, w.wonders.echoes.filter(e => !e.found && e.revealed)); return e ? { x: e.x, y: e.y, name: 'an echo' } : null; };
  const nextPage = w => w.expedition && w.expedition.next ? { x: w.expedition.next.x, y: w.expedition.next.y, name: w.expedition.next.hint, vague: true } : null;
  const unknown = () => null;
  const deepDungeon = (w, pl) => { const d = near(pl, ECHO.Explore.sites(w).filter(s => s.cat === 'delve' && ECHO.Explore.floors(s) >= 2 && ECHO.Explore.DELVES[s.kind] && ECHO.Monsters && ECHO.Monsters.DEFS[ECHO.Explore.DELVES[s.kind].boss] && !s.cleared)); return d ? { x: d.x, y: d.y, name: d.found ? d.name : 'a deep dungeon', vague: !d.found } : null; };
  // The Rift opens for the story if no kingdom has torn it open yet.
  const ensureRift = (w, rng) => {
    if (!w.rift && ECHO.Civ) { const f = Object.values(w.factions).filter(f => f.type === 'kingdom').sort((a, b) => (b.tech && b.tech.era || 0) - (a.tech && a.tech.era || 0))[0]; if (f) ECHO.Civ.openRift(w, f, rng); }
    const r = w.rift; if (!r) return;
    const sites = ECHO.Explore.sites(w);
    if (!sites.some(s => s.kind === 'riftdeep')) sites.push({ id: 'site_rift', cat: 'delve', kind: 'riftdeep', name: 'Beyond the Rift', x: r.x + 0.5, y: r.y + 0.5, found: true, seen: true, cleared: false, used: {}, level: 7, hidden: true });
  };

  const St = ECHO.Story = {
    CHAPTERS,
    state(world) { return (world.story = world.story || { ch: -1, seals: 0, flags: {}, done: false, kingSlain: false, began: null }); },
    chapter(world) { const s = St.state(world); return s.ch >= 0 && s.ch < CHAPTERS.length ? CHAPTERS[s.ch] : null; },
    objectives(world, pl) { const C = St.chapter(world); return C ? C.objectives(world, pl) : []; },
    begin(world, rng) { const s = St.state(world); if (s.ch >= 0) return null; s.ch = 0; s.began = world.day; const C = CHAPTERS[0]; if (C.start) C.start(world, rng); return C; },
    // Check the chapter; returns { finished, next } when a chapter closes.
    advance(world, pl, rng) {
      const s = St.state(world);
      const C = St.chapter(world);
      if (!C || s.done) return null;
      const obj = C.objectives(world, pl);
      if (!obj.every(o => o.done)) return null;
      const finished = C;
      s.ch++;
      if (s.ch >= CHAPTERS.length) { s.done = true; return { finished, next: null }; }
      const N = CHAPTERS[s.ch];
      if (N.start) N.start(world, rng);
      return { finished, next: N };
    },
    flag(world, k) { St.state(world).flags[k] = true; },
    // A lord fell: if the story wants seals, it gets one.
    lordSlain(world) { const s = St.state(world); if (s.ch === 3 && s.seals < 3) { s.seals++; return true; } return false; },
    kingSlain(world) { const s = St.state(world); s.kingSlain = true; if (world.rift) world.rift.sealed = world.day; }
  };
})();
