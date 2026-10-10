// Life indoors: what you can do in a house, an inn or a hall besides
// shopping.
//
//   · Sit down on any chair, stool or bench (E). You rest faster sitting, and
//     at a table with people at it you'll hear the talk of the town.
//   · Warm yourself at a hearth; cook at your own (or a friend's, or the inn's).
//   · At mealtimes a family that likes you will set a place for you.
//   · A friend will put you up for the night.
//   · Books on the shelves: almanacs, songbooks, histories of the realm, a
//     primer of the old tongue — each worth reading once.
//   · Your own house: hang your sketches on the walls; your dog sleeps by the
//     fire when you leave it at home.
//   · People who don't want you there will tell you so, and if you don't take
//     the hint, they'll put you out.
(function () {
  const { U } = ECHO;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const P = () => ECHO.People;
  const SEATS = new Set(['chair', 'stool', 'bench', 'throne']);
  const BOOKS = [
    { id: 'almanac', title: 'An Almanac of the Seasons', craft: 'forage', text: 'Berries come in Bloom and Harvest at the wood\'s edge; mushrooms after rain, in the shade, from Thaw to Frost. Take honey by night, when the bees are slow, or with smoke.' },
    { id: 'kitchen', title: 'The Hearthside Cook', craft: 'cook', text: 'A pie wants three handfuls of berries and good flour. Soup forgives everything but haste. Honey cake is the surest way to a neighbour\'s heart.' },
    { id: 'pan', title: 'The Silver in the Stream', craft: 'prospect', text: 'Gold is heavy and lazy: it lies where the water slows, on the inside of a bend. Running water brings it down from the hills; still water only keeps what it has.' },
    { id: 'songs', title: 'Songs of the Long Road', craft: 'bard', song: { id: 'book:larks', name: 'When the Larks Go Home', seed: 401 }, text: 'Forty songs for the road, the tavern and the harvest field, with the tunes written above the words in a careful hand.' },
    { id: 'roads', title: 'A Carrier\'s Roads', craft: 'courier', text: 'Fragile goods go on foot and never by water. The fastest road is the one with the most inns on it. Never promise a day you cannot keep.' },
    { id: 'charcoal', title: 'On Charcoal and Light', craft: 'artist', text: 'Draw what is there, not what you know is there. Sit still. Animals forgive a still artist far sooner than a hurried one.' },
    { id: 'beasts', title: 'A Bestiary of the Near Wilds', skill: 'study', text: 'The duskwolf lunges, then circles; step aside, not back. The bristlehare freezes before it bolts. Never stand between a hind and her young.' },
    { id: 'blades', title: 'The Sword and the Feet', skill: 'blade', text: 'A blade is only as good as the feet beneath it. Strike, then move. Never strike twice from the same place.' },
    { id: 'prayers', title: 'The Little Book of the Lantern', skill: 'ward', text: 'Keep the flame, and the flame keeps you. A small light in a large dark is not small.' },
    { id: 'manners', title: 'Manners for Every Table', skill: 'tongue', text: 'Ask after the children, praise the bread, and never mention the neighbour\'s goat.' }
  ];
  const MEALS = [[6.5, 9, 'breakfast'], [12, 13.5, 'the midday meal'], [18, 20.5, 'supper']];

  const H = ECHO.Home = {
    BOOKS,
    seatOf(f) { return SEATS.has(f.model); },
    meal(world) { const h = world.minute / 60; const m = MEALS.find(([a, b]) => h >= a && h < b); return m ? m[2] : null; },
    household(game) { const L = ECHO.Interior.cur; return L && L.type === 'house' ? ECHO.Interior.householdHere(game) : []; },
    awakeHere(game) {
      const L = ECHO.Interior.cur; if (!L) return [];
      return game.ents.filter(e => e.type === 'person' && e.npcId && !e.dead && !e.sleeping && !e.leaving && e.indoor);
    },
    host(game) {
      // the person whose house this is, if they're in and awake
      const L = ECHO.Interior.cur; if (!L) return null;
      const awake = H.awakeHere(game);
      if (L.type === 'inn') return awake.find(e => game.world.npcs[e.npcId].prof === 'innkeeper') || null;
      const home = new Set(H.household(game).map(n => n.id));
      return awake.find(e => home.has(e.npcId)) || null;
    },
    op(game, e) { const n = e && game.world.npcs[e.npcId]; return n ? (n.op[game.pl.charId] || 0) : 0; },
    mine(game) { const L = ECHO.Interior.cur; return L && ECHO.Interior.isMine(L.b, game.pl); },
    // ------------------------------------------------------------ what you can do here
    interactables(game) {
      const L = ECHO.Interior.cur, pe = game.pe, pl = game.pl, world = game.world, out = [];
      if (!L || L.site || L.carved) return out;
      const B = ECHO.Interior.BASE;
      const near = (f, r) => U.dist(B + f.x, f.y, pe.x, pe.y) - Math.max(f.w, f.h) / 2 * (f.scale || 1) < (r || 1.0);
      const host = H.host(game), hop = H.op(game, host), mine = H.mine(game);
      for (const f of L.furn) {
        if (pe.seated) break;
        if (H.seatOf(f) && f.model !== 'throne' && near(f, 0.9)) out.push({ kind: 'act', label: 'Sit down', d: 0.45, act: () => H.sit(game, f) });
        if (f.model === 'hearth' && near(f, 1.3)) {
          if (pl.warmth != null && pl.warmth < 95) out.push({ kind: 'act', label: 'Warm yourself by the fire', d: 0.5, act: () => H.warm(game) });
          if (ECHO.Pastimes && (mine || L.type === 'inn' || (host && hop >= 20))) out.push({ kind: 'act', label: mine ? 'Cook at your hearth' : L.type === 'inn' ? 'Cook in the inn\'s kitchen (2 crowns)' : `Ask to cook at ${world.npcs[host.npcId].first}'s hearth`, d: 0.6, act: () => H.cook(game, mine ? 0 : L.type === 'inn' ? 2 : 0) });
        }
        if (f.model === 'table' && L.type === 'house' && !mine && near(f, 1.1)) {
          const m = H.meal(world);
          if (m && host && hop >= 5) out.push({ kind: 'act', label: `Join the family for ${m}`, d: 0.55, act: () => H.dine(game, m) });
        }
        if (f.model === 'bed' && L.type === 'house' && !mine && near(f, 1.0) && host && (world.minute / 60 >= 19 || world.minute / 60 < 5)) out.push({ kind: 'act', label: `Ask ${world.npcs[host.npcId].first} if you can stay the night`, d: 0.55, act: () => H.stay(game, host) });
      }
      if (L.type === 'inn' && !pe.seated) for (const f of L.furn) if (f.action === 'inn' && near(f, 1.2)) out.push({ kind: 'act', label: 'Order a mug of ale (1 crown)', d: 0.6, act: () => H.ale(game) });
      if (pe.seated) out.push({ kind: 'act', label: 'Get up', d: 0.1, act: () => H.stand(game) });
      return out;
    },
    // ------------------------------------------------------------ sitting
    sit(game, f) {
      const pe = game.pe, B = ECHO.Interior.BASE;
      const x = B + f.x, y = f.y;
      // face the table if there is one beside the seat
      const L = ECHO.Interior.cur;
      const tbl = L.furn.filter(t => t.model === 'table' || t.model === 'desk').sort((a, b) => U.dist(a.x, a.y, f.x, f.y) - U.dist(b.x, b.y, f.x, f.y))[0];
      const dir = tbl && U.dist(tbl.x, tbl.y, f.x, f.y) < 2 ? Math.atan2(tbl.y - f.y, tbl.x - f.x) : (f.model === 'bench' ? -Math.PI / 2 : (f.rot || 0));
      H.sat = { x0: pe.x, y0: pe.y, t: 0, talkT: 4 + Math.random() * 4 };
      pe.x = x; pe.y = y; pe.dir = dir;
      pe.seated = true; pe.indoor = { x, y, dir, pose: 'sit', spot: { tag: f.model === 'bench' ? 'bench' : 'seat' } };
    },
    stand(game) {
      const pe = game.pe;
      if (!pe.seated) return;
      pe.seated = false; pe.indoor = null;
      if (H.sat) { const sp = ECHO.Ent.freeSpot(game.world, pe.x, pe.y + 0.7, 2) || { x: H.sat.x0, y: H.sat.y0 }; pe.x = sp.x; pe.y = sp.y; }
      H.sat = null;
    },
    // ------------------------------------------------------------ the hearth, the table, the bed
    warm(game) {
      const pl = game.pl;
      pl.warmth = 100; pl.wetT = 0;
      ECHO.Combat.floater(game.pe.x, game.pe.y - 1.3, 'warm', '#ffb86a');
      game.ui.toast('You hold your hands to the fire until the feeling comes back into them.', 'info', 3);
    },
    cook(game, cost) {
      const pl = game.pl, host = H.host(game);
      if (cost && pl.gold < cost) return game.ui.toast('Two crowns for the fire and the pots.', 'info', 2);
      pl.gold -= cost;
      if (host && !H.mine(game) && ECHO.Interior.cur.type === 'house') { host.say = 'Help yourself — just leave me a taste.'; host.sayT = 2.5; }
      ECHO.Pastimes.cookMenu(game, H.mine(game) ? 'at your own hearth' : ECHO.Interior.cur.type === 'inn' ? 'the inn\'s kitchen' : 'a friend\'s hearth');
    },
    dine(game, m) {
      const world = game.world, pl = game.pl, L = ECHO.Interior.cur;
      L.b.meals = L.b.meals || {};
      const key = world.day + ':' + m;
      if (L.b.meals[pl.charId] === key) return game.ui.toast('You\'ve already eaten with them. They won\'t hear of another plate.', 'info', 3);
      L.b.meals[pl.charId] = key;
      const fam = H.awakeHere(game);
      pl.fed = Math.min(100, (pl.fed || 60) + 45); pl.hp = Math.min(pl.maxHp, pl.hp + 25); if (pl.warmth != null) pl.warmth = Math.min(100, pl.warmth + 15);
      for (const e of fam) { const n = world.npcs[e.npcId]; if (n) n.op[pl.charId] = U.clamp((n.op[pl.charId] || 0) + 3, -100, 100); }
      const host = H.host(game), hn = host && world.npcs[host.npcId];
      // they talk while you eat
      const s = L.s;
      const news = ECHO.Chronicle.rumorsAt(world, s, 6, 18).filter(e => e.imp >= 1);
      const talk = hn ? (news.length ? ECHO.Dialogue.gossipLine(world, news[Math.floor(Math.random() * news.length)], Math.floor(Math.random() * 999)) : ECHO.Dialogue.ambient(world, hn, host)) : null;
      ECHO.UI.modal({ title: U.cap(m), html: `<p class="prose">${hn ? esc(hn.first) : 'They'} ${['sets another bowl on the table', 'pulls up a stool for you', 'cuts you a thick slice of bread'][Math.floor(Math.random() * 3)]}. ${fam.length > 1 ? `The ${esc(hn ? hn.last : '')} family` : 'Your host'} eat${fam.length > 1 ? '' : 's'} with you.</p>${talk ? `<p class="prose"><i>"${esc(talk.replace(/^"|"$/g, ''))}"</i></p>` : ''}<p class="dim">You're fed and warm. They think a little better of you for sitting at their table.</p>`, choices: [{ label: 'Thank them for the meal', onPick: () => {} }] });
      if (ECHO.Pastimes) ECHO.Pastimes.gain(game, 'cook', 1);
    },
    stay(game, host) {
      const world = game.world, n = world.npcs[host.npcId], op = H.op(game, host);
      if (op < 30) { host.say = op < 0 ? 'Here? Certainly not.' : 'I\'m sorry — we haven\'t the room.'; host.sayT = 2.5; return; }
      host.say = 'Of course. The bed by the wall is yours.'; host.sayT = 2;
      n.op[game.pl.charId] = U.clamp(op + 2, -100, 100);
      setTimeout(() => ECHO.UI.sleepUntilMorning(ECHO.Interior.cur ? ECHO.Interior.cur.s : null), 600);
    },
    // ------------------------------------------------------------ books
    shelfBooks(b) {
      const h = ECHO.hashStr(b.id + 'books');
      const out = [];
      for (let i = 0; i < 3; i++) out.push(BOOKS[(h + i * 7) % BOOKS.length]);
      return [...new Set(out)];
    },
    books(game, f) {
      const pl = game.pl, L = ECHO.Interior.cur;
      const list = H.shelfBooks(L.b);
      pl.read = pl.read || {};
      const extra = [];
      // a history of this realm, always somewhere on the shelf
      const fac = game.world.factions[L.s.faction];
      ECHO.UI.modal({ title: 'The bookshelf', html: '<p class="dim">A few well-thumbed books.</p>', choices: list.map(bk => ({ label: `${pl.read[bk.id] ? '✓ ' : ''}${bk.title}`, sub: pl.read[bk.id] ? 'read' : 'unread', onPick: () => H.read(game, bk) })).concat(fac && fac.short ? [{ label: `A Short History of ${fac.short}`, sub: 'the realm, as its people tell it', onPick: () => H.history(game, fac) }] : []).concat(extra).concat([{ label: 'Leave them', onPick: () => {} }]) });
    },
    read(game, bk) {
      const pl = game.pl;
      const first = !pl.read[bk.id];
      pl.read[bk.id] = game.world.day;
      const gains = [];
      if (first) {
        if (bk.craft && ECHO.Pastimes) { ECHO.Pastimes.gain(game, bk.craft, 10); gains.push(`${ECHO.Pastimes.CRAFTS[bk.craft].name} +10`); }
        if (bk.skill) { ECHO.Character.train(pl, bk.skill, 1.5); gains.push(`${bk.skill} improves`); }
        if (bk.song) { pl.tunes = pl.tunes || []; if (!pl.tunes.some(t => t.id === bk.song.id)) { pl.tunes.push(bk.song); gains.push(`you learn the song "${bk.song.name}"`); } }
        ECHO.Character.train(pl, 'study', 0.3);
      }
      ECHO.UI.modal({ title: bk.title, html: `<p class="prose"><i>${esc(bk.text)}</i></p>${gains.length ? `<p class="gold">${esc(gains.join(' · '))}</p>` : '<p class="dim">You\'ve read this one before.</p>'}`, choices: [{ label: 'Put it back', onPick: () => {} }] });
    },
    history(game, fac) {
      const world = game.world;
      const lines = world.chronicle.filter(e => e.imp >= 2 && (!e.sid || (ECHO.Sim.settlement(world, e.sid) || {}).faction === fac.id)).slice(-6).map(e => `${ECHO.TIME.fmtDate(e.d)} — ${e.text}`);
      ECHO.UI.modal({ title: `A Short History of ${fac.short}`, html: lines.length ? lines.map(l => `<p class="prose">${esc(l)}</p>`).join('') : '<p class="prose">Mostly genealogies, and a long chapter on the price of wool.</p>', choices: [{ label: 'Put it back', onPick: () => {} }] });
    },
    // ------------------------------------------------------------ the inn
    ale(game) {
      const pl = game.pl, world = game.world, L = ECHO.Interior.cur;
      if (pl.gold < 1) return game.ui.toast('"A crown, friend. Not a copper less."', 'info', 2);
      pl.gold -= 1;
      if (pl.warmth != null) pl.warmth = Math.min(100, pl.warmth + 12);
      pl.merryT = 60;   // an hour of easy talk
      const news = ECHO.Chronicle.rumorsAt(world, L.s, 6, 18).filter(e => e.imp >= 1);
      const line = news.length ? ECHO.Dialogue.gossipLine(world, news[Math.floor(Math.random() * news.length)], Math.floor(Math.random() * 999)) : 'Quiet times. Quiet times.';
      game.ui.toast(`You lean on the counter with a mug of ale. The innkeeper leans in: "${line.replace(/^"|"$/g, '')}"`, 'info', 7);
    },
    // ------------------------------------------------------------ each frame
    tick(game, dt) {
      const L = ECHO.Interior.cur, pe = game.pe, pl = game.pl, world = game.world;
      if (pl.merryT > 0) pl.merryT -= dt * game.minPerSec();
      if (!L) { if (pe.seated && !pe.campSit) H.stand(game); H.unwelcomeT = 0; return; }
      // your dog, asleep by your own fire
      if (H.mine(game) && pl.pet && pl.pet.stay === 'home' && !game.ents.some(e => e.pet && !e.dead) && ECHO.Pet) {
        const d = ECHO.Pet.make(game, ECHO.Interior.BASE + 5.7, 2.3, pl.pet.coat, { mine: true, homeDog: true, pname: pl.pet.name });
        d.dir = 0; d.sleeping = true;
      }
      if (pe.seated && pe.attackT > 0) H.stand(game);
      // sitting: rest, and listen
      if (pe.seated && H.sat) {
        H.sat.t += dt;
        pl.stamina = Math.min(pl.maxSta, pl.stamina + dt * 20);
        if (pl.hp < pl.maxHp) pl.hp = Math.min(pl.maxHp, pl.hp + dt * 0.6);
        H.sat.talkT -= dt;
        if (H.sat.talkT <= 0) {
          H.sat.talkT = 9 + Math.random() * 8;
          const talker = game.ents.filter(e => e.type === 'person' && e.npcId && !e.dead && !e.sleeping && !e.leaving && U.dist(e.x, e.y, pe.x, pe.y) < 3.5)[0];
          if (talker) {
            const n = world.npcs[talker.npcId];
            const news = ECHO.Chronicle.rumorsAt(world, L.s, 6, 18).filter(e => e.imp >= 1);
            const line = Math.random() < 0.6 && news.length ? ECHO.Dialogue.gossipLine(world, news[Math.floor(Math.random() * news.length)], Math.floor(Math.random() * 999)) : ECHO.Dialogue.ambient(world, n, talker);
            if (line) { talker.say = line.length > 90 ? line.slice(0, 87) + '…' : line; talker.sayT = 4.5; talker.dir = Math.atan2(pe.y - talker.y, pe.x - talker.x); ECHO.Chronicle.learnAt && Math.random() < 0.3 && ECHO.Chronicle.learnAt(world, L.s); }
          }
        }
      }
      // someone's house: are you welcome?
      if (L.type === 'house' && !H.mine(game) && !L.b.legend) {
        const host = H.host(game), op = H.op(game, host);
        if (host && op <= -20) {
          H.unwelcomeT = (H.unwelcomeT || 0) + dt;
          if (H.unwelcomeT > 1 && !H.warned) { H.warned = true; host.say = 'Get out of my house!'; host.sayT = 3; host.dir = Math.atan2(pe.y - host.y, pe.x - host.x); }
          if (H.unwelcomeT > 9) {
            H.unwelcomeT = 0; H.warned = false;
            const n = world.npcs[host.npcId]; n.op[pl.charId] = U.clamp(op - 5, -100, 100);
            game.ui.toast(`${n.first} pushes you out of the door and bars it behind you.`, 'warn', 4);
            ECHO.Interior.leave(game);
          }
        } else { H.unwelcomeT = 0; H.warned = false; }
      }
    }
  };
  // the furnishing that hangs your sketches
  if (ECHO.Life && ECHO.Life.FURNISH) ECHO.Life.FURNISH.gallery = { name: 'Pictures on the walls', cost: 30, desc: 'Your four latest sketches, framed and hung over the bed and the chest.' };
})();
