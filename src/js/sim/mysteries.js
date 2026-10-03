// Mysteries: every world invents its own dead language. Ruins hold tablets
// written in it. Words are learned by study, by comparing bilingual fragments,
// or from scholars. One tablet, once read, leads to a hidden vault whose
// contents differ from world to world.
(function () {
  const { U, RNG } = ECHO;

  const WORDS = ['the', 'door', 'sleeps', 'beneath', 'first', 'flame', 'star', 'stone', 'tree', 'north', 'south', 'east', 'west', 'we', 'built', 'here', 'remember', 'world', 'many', 'one', 'of', 'is', 'not', 'only', 'echo', 'open', 'speak', 'king', 'fell', 'sky', 'deep', 'old', 'walk', 'and', 'from', 'light', 'dark', 'name', 'gate', 'far', 'other', 'worlds', 'watch', 'us', 'were', 'before', 'you'];
  const RUNES = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟᛥᛣ';

  const LORE = [
    'we built the gate of light and the sky fell',
    'this world is not the only world',
    'many worlds echo one name',
    'remember the first flame and the old king',
    'the deep king fell and the sky is dark',
    'other worlds watch us',
    'we were here before you',
    'the star of the north is a door'
  ];

  const REWARDS = {
    echostep: { name: 'Echo Step', desc: 'Your dodge becomes a blink through space, leaving an echo behind.', kind: 'spell' },
    starfire: { name: 'Starfire', desc: 'Your flame no longer turns on you — reckless casting is safe, and it burns hotter.', kind: 'spell' },
    wardsong: { name: 'Wardsong', desc: 'Blocking releases a ring of force that hurls enemies back.', kind: 'spell' }
  };

  const M = ECHO.Mysteries = {
    WORDS, REWARDS,
    generate(world, rng) {
      const r = new RNG(world.seed ^ 0xbeef);
      const cons = r.shuffle('bdgkmnrstvzhlqx'.split('')).slice(0, 9);
      const vow = r.shuffle('aeiouy'.split('')).slice(0, 4);
      const used = new Set();
      const lexicon = {};
      for (const w of WORDS) {
        let a;
        for (let t = 0; t < 30; t++) {
          const syl = 1 + (w.length > 4 ? 1 : 0) + (r.chance(0.3) ? 1 : 0);
          a = '';
          for (let i = 0; i < syl; i++) a += r.pick(cons) + r.pick(vow) + (r.chance(0.3) ? r.pick(cons) : '');
          if (!used.has(a)) break;
        }
        used.add(a); lexicon[w] = a;
      }
      const runeMap = {};
      const rs = r.shuffle(RUNES.split(''));
      'abcdefghijklmnopqrstuvwxyz'.split('').forEach((ch, i) => { runeMap[ch] = rs[i % rs.length]; });
      const lang = world.lang = { name: U.cap(lexicon.old + lexicon.name), lexicon, runeMap, known: {}, tablets: [], vault: null, scholarCost: 30 };
      if (!world.ruins.length) return;
      // The key tablet points from its ruin to a hidden vault.
      const keyRuin = rng.pick(world.ruins);
      const dirs = [['north', 0, -1], ['south', 0, 1], ['east', 1, 0], ['west', -1, 0]];
      let vault = null, dirWord = 'north';
      for (const [dw, dx, dy] of rng.shuffle(dirs.slice())) {
        for (let d = 22; d >= 14 && !vault; d--) {
          const x = keyRuin.x + dx * d, y = keyRuin.y + dy * d;
          if (!ECHO.World.inBounds(x, y) || x < 4 || y < 4 || x > world.W - 5 || y > world.H - 5) continue;
          const t = ECHO.World.tile(world, x, y);
          if ([ECHO.TILE.WATER, ECHO.TILE.DEEP, ECHO.TILE.ROCK, ECHO.TILE.ROAD, ECHO.TILE.PLAZA].includes(t)) continue;
          if (world.settlements.some(s => U.dist(s.x, s.y, x, y) < 12)) continue;
          vault = { x, y }; dirWord = dw;
        }
        if (vault) break;
      }
      if (!vault) vault = { x: keyRuin.x, y: keyRuin.y + 3 };
      const marker = ECHO.World.tile(world, vault.x, vault.y) === ECHO.TILE.TREE || ECHO.World.tile(world, vault.x, vault.y) === ECHO.TILE.FOREST ? 'tree' : 'stone';
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) ECHO.World.setTile(world, vault.x + dx, vault.y + dy, ECHO.TILE.RUIN);
      const rewardKey = rng.pick(Object.keys(REWARDS));
      lang.vault = { x: vault.x, y: vault.y, opened: false, revealed: false, reward: rewardKey, ruinId: keyRuin.id };
      world.structures.push({ id: 'vaultstone', type: 'vaultstone', x: vault.x, y: vault.y, w: 1, h: 1, solid: true });
      const keyText = `walk ${dirWord} from here far . the door sleeps beneath the old ${marker} . speak echo and open`;
      const lore = rng.shuffle(LORE.slice());
      world.ruins.forEach((ruin, i) => {
        const isKey = ruin === keyRuin;
        const text = isKey ? keyText : lore[i % lore.length];
        const rosetta = !isKey && i % 2 === 1;
        lang.tablets.push({ ruinId: ruin.id, words: text.split(' '), key: isKey, rosetta, studied: 0 });
        ruin.tablet = lang.tablets.length - 1;
      });
    },
    alien(world, w) { return w === '.' ? '·' : world.lang.lexicon[w] || w; },
    runes(world, w) {
      if (w === '.') return '·';
      const a = M.alien(world, w);
      return a.split('').map(c => world.lang.runeMap[c] || c).join('');
    },
    // Render a tablet as tokens: known words in plain text, unknown in runes.
    render(world, tablet) {
      return tablet.words.map(w => ({ w, known: w === '.' || !!world.lang.known[w], alien: M.alien(world, w), runes: M.runes(world, w) }));
    },
    progress(world, tablet) {
      const ws = tablet.words.filter(w => w !== '.');
      const k = ws.filter(w => world.lang.known[w]).length;
      return k / ws.length;
    },
    // One hour of study. Returns the words learned.
    study(world, tablet, skill, rng) {
      tablet.studied++;
      const learned = [];
      if (tablet.rosetta && tablet.studied === 1) {
        // Bilingual fragment: a whole row of words in a known tongue alongside.
        const pool = WORDS.filter(w => !world.lang.known[w]);
        rng.shuffle(pool);
        for (const w of pool.slice(0, 5)) { world.lang.known[w] = true; learned.push(w); }
      }
      const unknown = [...new Set(tablet.words.filter(w => w !== '.' && !world.lang.known[w]))];
      const tries = 1 + (skill > 40 ? 1 : 0) + (skill > 75 ? 1 : 0);
      for (let i = 0; i < tries && unknown.length; i++) {
        if (rng.chance(0.35 + skill / 140)) {
          const w = unknown.splice(rng.int(0, unknown.length - 1), 1)[0];
          world.lang.known[w] = true; learned.push(w);
        }
      }
      M.checkVault(world);
      return learned;
    },
    scholarTranslate(world, rng) {
      const seen = world.lang.tablets.filter(t => t.studied > 0);
      const pool = [...new Set(seen.flatMap(t => t.words))].filter(w => w !== '.' && !world.lang.known[w]);
      const any = pool.length ? pool : WORDS.filter(w => !world.lang.known[w]);
      if (!any.length) return null;
      const w = rng.pick(any);
      world.lang.known[w] = true;
      M.checkVault(world);
      return w;
    },
    checkVault(world) {
      const v = world.lang.vault;
      if (!v || v.revealed) return;
      const key = world.lang.tablets.find(t => t.key);
      if (key && M.progress(world, key) >= 1) {
        v.revealed = true;
        ECHO.emit('vault:revealed', v);
      }
    },
    canOpen(world) {
      const v = world.lang.vault;
      return v && !v.opened && world.lang.known.echo && world.lang.known.open;
    },
    openVault(world) {
      const v = world.lang.vault;
      v.opened = true;
      world.structures = world.structures.filter(s => s.id !== 'vaultstone');
      world.structures.push({ id: 'vaultopen', type: 'vaultopen', x: v.x, y: v.y, w: 1, h: 1, solid: false });
      ECHO.World.rebuildBlocked(world);
      return REWARDS[v.reward];
    }
  };
})();
