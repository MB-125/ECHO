// Wonders: the quiet, strange things in the world that reward a wanderer.
//
// • Echoes of the Old World — twelve places far from any town where the
//   people who spoke the dead tongue left something of themselves. On clear
//   nights wisps gather and lead the way. Each echo shows a fragment of their
//   story, spoken in their own language, and teaches a word or two of it.
//   Together they tell how the old world ended.
// • Shades — the restless dead. Someone who died before their time, with
//   something left unsaid, may linger by their home at night. Hear them, and
//   carry their last words to the ones they left behind.
// • Boons and charms: what wonders leave on the one who finds them.
(function () {
  const { U, RNG } = ECHO;
  const P = () => ECHO.People;

  // The story of the Old People, in twelve pieces. `say` uses only words of the
  // dead tongue (Mysteries.WORDS) so it can be written in their runes.
  const MYTH = [
    { title: 'Before', scene: 'Figures of pale light stand at the water\'s edge, looking up at a sky with different stars.', say: 'we were here before you', pose: 'line' },
    { title: 'The Far Road', scene: 'Travellers step out of nothing, one after another, carrying their children and their fire.', say: 'we walk from far other worlds', pose: 'procession' },
    { title: 'The Gate', scene: 'A tall figure raises its hands to an arch that is no longer there. Light pours through it.', say: 'we built the gate of light', pose: 'single' },
    { title: 'The First Flame', scene: 'They kneel around a fire that burns blue and does not die, and sing to it.', say: 'remember the first flame', pose: 'circle' },
    { title: 'The Old King', scene: 'A crowned shade sits upon a stone. The others bow, one by one.', say: 'the old king is one of us', pose: 'king' },
    { title: 'One Name', scene: 'They speak a single word together, and the trees around them bend as if in a wind.', say: 'many worlds echo one name', pose: 'circle' },
    { title: 'The Watchers', scene: 'A child points at the stars. The elders take her hand and look away.', say: 'other worlds watch us', pose: 'pair' },
    { title: 'The Sky Falls', scene: 'Above them the sky cracks like ice. The shades fall to their knees.', say: 'the sky fell and the king fell', pose: 'king' },
    { title: 'Into the Deep', scene: 'They carry their dead, wrapped in light, down into the deep places.', say: 'the deep is dark', pose: 'procession' },
    { title: 'Not the Only World', scene: 'A woman holds a glowing stone up to the moon, and in it you see another land.', say: 'many worlds not one', pose: 'single' },
    { title: 'The Sleeping Door', scene: 'They seal a door into the hillside, mark it with a single stone, and walk away north.', say: 'the door sleeps beneath the stone', pose: 'line' },
    { title: 'Speak', scene: 'The last of them turns, and looks straight at you, as if they always knew you would come.', say: 'you remember us . speak echo', pose: 'single' }
  ];

  const ORD = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');

  const W = ECHO.Wonders = {
    ORD,
    MYTH,
    state(world) {
      const w = world.wonders = world.wonders || {};
      w.echoes = w.echoes || null; w.shades = w.shades || []; w.stars = w.stars || []; w.stats = w.stats || { stars: 0, shades: 0, wishes: 0, festivals: [] };
      if (!w.echoes) W.placeEchoes(world);
      return w;
    },
    // ---------------------------------------------------------------- echoes
    placeEchoes(world) {
      const w = world.wonders;
      const rng = new RNG((world.seed ^ 0x51ed) >>> 0);
      const T = ECHO.TILE;
      const ok = new Set([T.GRASS, T.FOREST, T.SAND, T.HILL, T.SNOW, T.SWAMP]);
      const sites = [];
      const far = (x, y, list, d) => list.every(o => U.dist(o.x, o.y, x, y) > d);
      const cand = [];
      for (let i = 0; i < 4000; i++) {
        const x = 6 + rng.int(0, world.W - 13), y = 6 + rng.int(0, world.H - 13);
        if (!ok.has(ECHO.World.tile(world, x, y)) || ECHO.World.isSolid(world, x + 0.5, y + 0.5)) continue;
        if (!far(x, y, world.settlements, 14) || !far(x, y, world.camps, 8) || !far(x, y, world.lairs, 9)) continue;
        // beautiful or strange places: by water, near ruins, deep in woods, on hills
        let score = rng.next();
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
          const t = ECHO.World.tile(world, x + dx, y + dy);
          if (t === T.WATER) score += 0.12; if (t === T.TREE) score += 0.03; if (t === T.HILL || t === T.ROCK) score += 0.04; if (t === T.RUIN) score += 0.2;
        }
        if (world.ruins.some(r => U.dist(r.x, r.y, x, y) < 12)) score += 0.8;
        cand.push({ x: x + 0.5, y: y + 0.5, score });
      }
      cand.sort((a, b) => b.score - a.score);
      for (const c of cand) {
        if (sites.length >= MYTH.length) break;
        if (!far(c.x, c.y, sites, 20)) continue;
        sites.push(c);
      }
      // fewer places than fragments on a small map: the rest go unplaced
      const order = rng.shuffle(MYTH.map((_, i) => i));
      w.echoes = sites.map((s, i) => ({ id: 'ec' + i, part: order[i], x: s.x, y: s.y, found: false, revealed: false }));
    },
    echoesLeft(world) { return W.state(world).echoes.filter(e => !e.found); },
    found(world) { return W.state(world).echoes.filter(e => e.found).length; },
    nearestEcho(world, x, y, maxD = Infinity) {
      let best = null, bd = maxD;
      for (const e of W.state(world).echoes) { if (e.found) continue; const d = U.dist(e.x, e.y, x, y); if (d < bd) { bd = d; best = e; } }
      return best;
    },
    // The player reaches an echo: what it shows, and what it leaves with them.
    findEcho(world, pl, echo) {
      if (echo.found) return null;
      echo.found = true; echo.foundDay = world.day;
      const frag = MYTH[echo.part];
      const lang = world.lang;
      const learned = [];
      if (lang) {
        const small = new Set(['the', 'of', 'and', 'is', 'we', 'us', 'one', 'not', 'from', 'here']);
        const words = [...new Set(frag.say.split(' ').filter(wd => wd !== '.' && !lang.known[wd]))].sort((a, b) => (small.has(a) ? 1 : 0) - (small.has(b) ? 1 : 0));
        for (const wd of words.slice(0, 2)) { lang.known[wd] = true; learned.push(wd); }
        ECHO.Mysteries.checkVault(world);
      }
      const n = W.found(world);
      W.boon(pl, 'hp', 3);
      let fate = false;
      if (n % 4 === 0 && pl.fate < 3) { pl.fate++; fate = true; }
      const all = n >= W.state(world).echoes.length;
      if (all) pl.wisplight = true;
      ECHO.Chronicle.add(world, { text: `${pl.first} ${pl.last} witnessed an echo of the old world${n > 1 ? ` — the ${ORD(n)} they have found` : ''}: ${frag.title}.`, kind: 'mystery', importance: all ? 3 : 1, x: echo.x, y: echo.y, char: pl.charId });
      return { frag, learned, n, of: W.state(world).echoes.length, fate, all };
    },
    // A line of the dead tongue, with the words the player knows shown plainly.
    speech(world, say) {
      return say.split(' ').map(wd => wd === '.' ? '·' : world.lang && world.lang.known[wd] ? wd : ECHO.Mysteries.runes(world, wd)).join(' ');
    },

    // ---------------------------------------------------------------- shades
    // Called as someone dies, before their mind is forgotten.
    onDeath(world, n, cause) {
      if (!world.player) return;
      if (cause === 'old age' || n.prof === 'bandit' || n.faction === 'ashfang') return;
      const st = W.state(world);
      if (st.shades.filter(s => s.state === 'restless').length >= 8) return;
      const alive = id => id && world.npcs[id] && world.npcs[id].status === 'alive' && world.npcs[id].prof !== 'child' ? world.npcs[id] : null;
      // whom they'd want to reach
      let to = alive(n.spouse), rel = to ? (n.sex === 'f' ? 'husband' : 'wife') : null;
      if (to && to.sex === n.sex) rel = 'beloved';
      if (!to) { const k = (n.kids || []).map(alive).find(Boolean); if (k) { to = k; rel = k.sex === 'f' ? 'daughter' : 'son'; } }
      if (!to) { const p = (n.parents || []).map(alive).find(Boolean); if (p) { to = p; rel = p.sex === 'f' ? 'mother' : 'father'; } }
      if (!to) { const f = Object.entries(n.rel || {}).filter(([, v]) => v > 50).map(([id]) => alive(id)).find(Boolean); if (f) { to = f; rel = 'friend'; } }
      if (!to) return;
      const rr = ECHO.hash2(ECHO.hashStr(n.id), world.day, 77);
      const young = P().age(world, n) < 45;
      if (rr > (young ? 0.65 : 0.35)) return;
      const goal = n.mind && n.mind.goal;
      const s = ECHO.Sim.settlement(world, n.home) || ECHO.Sim.settlement(world, n.loc);
      // where they linger: where they fell, if anyone saw it, else by their door
      let x = n._x, y = n._y;
      if (!(x > 0 && x < 9000)) {
        const h = s && ECHO.Property && world._prop ? ECHO.Property.homeOf(world, n) : null;
        if (h) { x = h.x + h.w / 2 + 0.8; y = h.y + h.h + 1.1; }
        else if (s) { x = s.x + (rr - 0.5) * 6; y = s.y + 3; }
        else return;
      }
      // what they need to say
      const hidden = Math.round(Math.min(45, (n.wealth || 0) * 0.35));
      let words, gift = 0;
      if (goal && goal.kind === 'prosper' && hidden >= 5) { words = `Tell ${to.first} there are ${hidden} crowns under the hearthstone. I was saving them for something better. Let it be for them.`; gift = hidden; n.wealth -= hidden; }
      else if (goal && goal.kind === 'love' && goal.crush && alive(goal.crush) && goal.crush !== to.id) { const c = alive(goal.crush); to = c; rel = 'the one they loved'; words = `Tell ${c.first}… tell ${c.sex === 'f' ? 'her' : 'him'} I meant to ask. At the festival. I was always going to ask.`; }
      else if (goal && goal.kind === 'avenge') words = `I never settled it — with ${goal.target.name}. Tell ${to.first} to let it go. I couldn't. They must.`;
      else if (goal && (goal.kind === 'family' || goal.kind === 'child')) words = `Tell ${to.first} I'm sorry I won't see the children grow. Tell them their ${n.sex === 'f' ? 'mother' : 'father'} wasn't afraid.`;
      else if (goal && goal.kind === 'faith') words = `I never made the pilgrimage. Tell ${to.first} to go for me, and light a candle there.`;
      else if (rel === 'friend') words = `Tell ${to.first} I forgive ${to.sex === 'f' ? 'her' : 'him'}. For all of it. And that I'd do it all again.`;
      else words = [`Tell ${to.first} it didn't hurt. It's not true, but tell ${to.sex === 'f' ? 'her' : 'him'} anyway.`, `Tell ${to.first} I left the door open. I always meant to come home.`, `Tell ${to.first} to keep the garden. To keep living. Please.`][Math.floor(rr * 30) % 3];
      st.shades.push({ id: 'sh' + n.id, npc: n.id, name: P().name(n), first: n.first, sex: n.sex, x, y, d: world.day, cause, to: to.id, toName: P().name(to), rel, words, gift, sid: s ? s.id : null, state: 'restless' });
    },
    shadesNear(world, x, y, r) { return W.state(world).shades.filter(s => s.state === 'restless' && Math.abs(s.x - x) < r && Math.abs(s.y - y) < r); },
    // You listened: you now carry their words.
    hearShade(world, pl, sh) {
      sh.state = 'heard'; sh.heardDay = world.day;
      ECHO.Chronicle.add(world, { text: `${pl.first} ${pl.last} heard the shade of ${sh.name}.`, kind: 'mystery', importance: 0, x: sh.x, y: sh.y, char: pl.charId });
    },
    carriedFor(world, npcId) { return W.state(world).shades.find(s => s.state === 'heard' && s.to === npcId); },
    deliverWords(world, pl, sh) {
      const to = world.npcs[sh.to];
      sh.state = 'rest'; sh.restDay = world.day;
      W.state(world).stats.shades++;
      if (!to) return null;
      to.op[pl.charId] = U.clamp((to.op[pl.charId] || 0) + 35, -100, 100);
      P().remember(world, to, `received the last words of ${sh.first} from ${pl.first} ${pl.last}`, 'gratitude', null, 5);
      if (to.mind) to.mind.owe = (to.mind.owe || 0) + 1;
      if (sh.gift) to.wealth += sh.gift;
      // an avenger told to let go, may
      if (to.mind && to.mind.goal && to.mind.goal.kind === 'avenge' && /let it go/.test(sh.words)) to.mind.goal = null;
      pl.renown += 2;
      ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} brought ${P().name(to)} the last words of ${sh.name}.`, importance: 1, x: sh.x, y: sh.y, rep: 3, tag: 'protect' });
      return to;
    },

    // ---------------------------------------------------------------- boons & charms
    // Permanent: small gifts that wonders leave on the one who finds them.
    boon(pl, k, v) { pl.boons = pl.boons || {}; pl.boons[k] = (pl.boons[k] || 0) + v; },
    // Temporary: a charm lasting some days (wishes, feasts, curses).
    charm(world, pl, kind, days, o = {}) {
      pl.charms = (pl.charms || []).filter(c => c.kind !== kind && c.until > world.day);
      pl.charms.push({ kind, until: world.day + days, ...o });
    },
    has(world, pl, kind) { return (pl.charms || []).some(c => c.kind === kind && c.until > world.day + (world.minute / 1440) - 1e-6); },
    CHARMS: {
      fortune: { name: 'Fortune', desc: 'Merchants pay you more for what you sell.' },
      courage: { name: 'Courage', desc: 'Your blows land harder.' },
      health: { name: 'Health', desc: 'You are hale — more life in you.' },
      wellfed: { name: 'Well-fed', desc: 'Your strength returns faster.' },
      hindcurse: { name: 'The Hind\'s Curse', desc: 'Since you killed the White Hind, something has gone out of you.' },
      starlit: { name: 'Starlit', desc: 'The night is kind to you: wisps find you easily.' }
    },

    dailyTick(world) {
      const st = W.state(world);
      for (const s of st.shades) {
        if (s.state === 'restless' && world.day - s.d > 20) s.state = 'faded';
        if (s.state === 'heard' && world.day - s.heardDay > 40) s.state = 'faded';
        if ((s.state === 'heard' || s.state === 'restless') && (!world.npcs[s.to] || world.npcs[s.to].status !== 'alive')) s.state = 'faded';
      }
      if (st.shades.length > 40) st.shades = st.shades.filter(s => s.state === 'restless' || s.state === 'heard' || world.day - s.d < 90);
      st.stars = st.stars.filter(s => !s.taken && world.day - s.d < 3);
    }
  };
})();
