// A dog of your own, and a game of dice at the inn.
//
// Strays hang about most towns. Offer one food a few times and it decides
// you're worth following; give it a name and it's yours. It trots at your
// heel (and alongside your horse), keeps clear of fights, growls when it
// smells trouble before you see it, and now and then puts its nose down and
// leads you to something: a patch of mushrooms, a bird's nest, a cache under
// a cairn. You can tell it to stay, or to wait at home.
//
// At any inn there's a table where someone will play knucklebones for coin:
// roll three bones, keep what you like, roll the rest once more, and the best
// hand wins — three of a kind, then a pair, then the higher sum.
(function () {
  const { U } = ECHO;
  const P = ECHO.Pastimes;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const COATS = ['#8a5a32', '#3a2e26', '#c8a878', '#6a6a6e', '#e8e0d0', '#a0522d'];
  const NAMES = ['Biscuit', 'Bramble', 'Patch', 'Rook', 'Juniper', 'Pip', 'Moss', 'Tinker', 'Hob', 'Wren'];
  const FOOD = ['meat', 'roast', 'fish', 'grilled', 'food', 'pie', 'omelette'];

  const D = ECHO.Pet = {
    // ------------------------------------------------------------ strays
    strayFor(world, s) {
      const h = ECHO.hashStr(s.id + ':' + Math.floor(world.day / 3));
      if (h % 10 >= 6) return null;
      return { coat: COATS[h % COATS.length], id: 'stray:' + s.id + ':' + Math.floor(world.day / 3) };
    },
    make(game, x, y, coat, o) {
      const e = ECHO.Ent.make(Object.assign({ type: 'creature', species: 'dog', pet: true, x, y, r: 0.3, hp: 30, maxHp: 30, speed: 5.2, faction: 'town', coat, label: null, state: 'idle' }, o || {}));
      game.addEnt(e);
      return e;
    },
    tick(game, dt) {
      const world = game.world, pl = game.pl, pe = game.pe;
      if (ECHO.Interior.cur) return;
      // your own dog, at your heel
      if (pl.pet && !game.ents.some(e => e.pet && e.mine && !e.dead)) {
        if (pl.pet.stay && pl.pet.at) { if (U.dist(pl.pet.at.x, pl.pet.at.y, pe.x, pe.y) < 30) D.make(game, pl.pet.at.x, pl.pet.at.y, pl.pet.coat, { mine: true, pname: pl.pet.name }); }
        else if (!pl.pet.stay) { const sp = ECHO.Ent.freeSpot(world, pe.x - 1, pe.y + 1, 3) || pe; D.make(game, sp.x, sp.y, pl.pet.coat, { mine: true, label: null, pname: pl.pet.name }); }
      }
      // a stray in town
      D.strayT = (D.strayT || 0) - dt;
      if (D.strayT <= 0) {
        D.strayT = 3;
        const s = ECHO.World.settlementAt(world, pe.x, pe.y, 10);
        const have = game.ents.find(e => e.pet && !e.mine && !e.dead);
        if (have && (!s || have.sid !== s.id)) { have.dead = true; have.vanish = true; }
        if (s && !have && !pl.pet) {
          const st = D.strayFor(world, s);
          pl.strays = pl.strays || {};
          if (st && !(pl.strays[st.id] && pl.strays[st.id].gone)) {
            const sp = ECHO.Ent.freeSpot(world, s.x + (Math.random() - 0.5) * 8, s.y + (Math.random() - 0.5) * 8, 3);
            if (sp) { const e = D.make(game, sp.x, sp.y, st.coat, { sid: s.id, strayId: st.id }); e.dir = Math.random() * 6.28; }
          }
        }
      }
    },
    // the dog's own mind
    think(game, e, dt) {
      const pe = game.pe, pl = game.pl, world = game.world;
      e.t += dt;
      const d = U.dist(e.x, e.y, pe.x, pe.y);
      if (!e.mine) {
        // a stray: wanders the square, keeps its distance until it trusts you
        const tr = (pl.strays && pl.strays[e.strayId] && pl.strays[e.strayId].n) || 0;
        if (d < 3 + (tr ? 0 : 2) && pe.moving && !tr) { const a = Math.atan2(e.y - pe.y, e.x - pe.x); ECHO.Ent.seek(world, e, e.x + Math.cos(a) * 2, e.y + Math.sin(a) * 2, e.speed * 0.6, dt); return; }
        if (tr && d > 2 && d < 10) { ECHO.Ent.seek(world, e, pe.x, pe.y, e.speed * 0.5, dt, 1.4); return; }
        e.wt = (e.wt || 0) - dt;
        if (e.wt <= 0) { e.wt = 2 + Math.random() * 4; const a = Math.random() * 6.28; e.goal = { x: e.x + Math.cos(a) * 2, y: e.y + Math.sin(a) * 2 }; e.idle = Math.random() < 0.5; }
        if (!e.idle && e.goal) ECHO.Ent.seek(world, e, e.goal.x, e.goal.y, e.speed * 0.3, dt, 0.3); else e.moving = false;
        return;
      }
      // your dog
      if (e.homeDog) {
        e.moving = false; e.sleeping = d > 4;
        if (d < 3 && Math.random() < dt * 0.4) { e.say = '*thump thump*'; e.sayT = 1; e.dir = Math.atan2(pe.y - e.y, pe.x - e.x); e.flip = Math.cos(e.dir) < 0; }
        return;
      }
      if (pl.pet.stay) { e.moving = false; if (d > 32) { e.dead = true; e.vanish = true; } else if (d < 6 && Math.random() < dt * 0.3) { e.say = '*thump thump*'; e.sayT = 1; } return; }
      if (d > 28) { const sp = ECHO.Ent.freeSpot(world, pe.x - 1, pe.y + 1, 3); if (sp) { e.x = sp.x; e.y = sp.y; } }
      // trouble: growl and stay back
      const foe = game.ents.find(o => !o.dead && !o.hidden && o !== e && !o.pet && game.hostileTo(pe, o) && (o.type !== 'creature' || o.species !== 'hare') && o.species !== 'deer' && U.dist(o.x, o.y, e.x, e.y) < 13);
      if (foe) {
        if (!e.warned || game.time - e.warned > 20) { e.warned = game.time; e.say = 'Grrr… woof!'; e.sayT = 1.6; if (ECHO.Music && ECHO.Music.ready && ECHO.Music.ready()) ECHO.Music.bark(ECHO.Music.ctx.currentTime, 1.6); if (U.dist(foe.x, foe.y, pe.x, pe.y) > 8) ECHO.Combat.floater(e.x, e.y - 0.8, '!', '#ffcf5a'); }
        const a = Math.atan2(pe.y - foe.y, pe.x - foe.x);
        const hx = pe.x + Math.cos(a) * 2.2, hy = pe.y + Math.sin(a) * 2.2;
        if (U.dist(e.x, e.y, hx, hy) > 0.6) ECHO.Ent.seek(world, e, hx, hy, e.speed * 1.1, dt, 0.3); else { e.moving = false; e.dir = Math.atan2(foe.y - e.y, foe.x - e.x); e.flip = Math.cos(e.dir) < 0; }
        return;
      }
      // a nose for things
      e.sniffT = (e.sniffT == null ? 15 : e.sniffT) - dt;
      if (e.sniffT <= 0 && !e.sniff) {
        e.sniffT = 25 + Math.random() * 20;
        const c = (world.caches || []).find(c => !c.found && U.dist(c.x, c.y, pe.x, pe.y) < 22);
        const n = !c && P.nodes.length ? P.nodes.slice().sort((a, b) => U.dist(a.x, a.y, pe.x, pe.y) - U.dist(b.x, b.y, pe.x, pe.y))[0] : null;
        const tgt = c || (n && U.dist(n.x, n.y, pe.x, pe.y) > 2.5 && U.dist(n.x, n.y, pe.x, pe.y) < 14 ? n : null);
        if (tgt) { e.sniff = { x: tgt.x, y: tgt.y, t: 14, cache: !!c }; e.say = c ? '*sniff sniff* Woof!' : '*sniff*'; e.sayT = 1.5; }
      }
      if (e.sniff) {
        e.sniff.t -= dt;
        const ds = U.dist(e.x, e.y, e.sniff.x, e.sniff.y);
        if (ds > 0.8) ECHO.Ent.seek(world, e, e.sniff.x, e.sniff.y, e.speed * 0.9, dt, 0.4);
        else { e.moving = false; if (Math.random() < dt * 0.6) { e.say = e.sniff.cache ? 'Woof! Woof!' : '*wags*'; e.sayT = 1.2; } }
        if (e.sniff.t <= 0 || U.dist(pe.x, pe.y, e.sniff.x, e.sniff.y) < 1.5 || d > 20) e.sniff = null;
        return;
      }
      // heel
      const speed = pe.mounted ? Math.max(e.speed, 8) : e.speed;
      if (d > 2.6) ECHO.Ent.seek(world, e, pe.x, pe.y, speed * (d > 6 ? 1.2 : 0.8), dt, 1.6);
      else { e.moving = false; if (Math.random() < dt * 0.2) e.dir = Math.atan2(pe.y - e.y, pe.x - e.x) + (Math.random() - 0.5) * 2; e.flip = Math.cos(e.dir) < 0; }
    },
    interactables(game) {
      const pe = game.pe, pl = game.pl, out = [];
      if (pe.mounted) return out;
      for (const e of game.ents) {
        if (!e.pet || e.dead || U.dist(e.x, e.y, pe.x, pe.y) > 1.8) continue;
        if (e.mine) out.push({ kind: 'act', label: `${pl.pet.name}`, d: 0.8, act: () => D.menu(game, e) });
        else out.push({ kind: 'act', label: 'Offer food to the stray dog', d: 0.8, act: () => D.feedStray(game, e) });
      }
      return out;
    },
    feedStray(game, e) {
      const pl = game.pl, world = game.world;
      const k = FOOD.find(k => pl.inv[k] > 0);
      if (!k) return game.ui.toast('You have nothing it would eat. (Meat, fish, bread…)', 'info', 3);
      pl.strays = pl.strays || {};
      const S = pl.strays[e.strayId] = pl.strays[e.strayId] || { n: 0, last: -1 };
      if (S.last != null && game.time - S.last < 20 && S.n) return game.ui.toast('It\'s still chewing. Give it a moment.', 'info', 2);
      pl.inv[k]--; S.n++; S.last = game.time;
      e.say = ['*sniffs your hand*', '*wolfs it down*', '*wags*'][Math.min(2, S.n - 1)]; e.sayT = 2;
      if (S.n < 3) return game.ui.toast(S.n === 1 ? 'The dog snatches it and backs off — but it doesn\'t run.' : 'This time it eats from your hand, and lets you scratch its ears.', 'info', 3);
      const sug = NAMES[ECHO.hashStr(e.strayId) % NAMES.length];
      ECHO.UI.modal({ title: 'A dog of your own', html: `<p class="prose">The dog sits at your feet and looks up at you as if the matter were settled. It seems it's coming with you.</p><p>What will you call it?</p><input id="dogname" maxlength="16" value="${esc(sug)}" style="width:100%;font-size:18px;padding:6px">`, choices: [
        { label: 'That\'s your name, then', onPick: () => { const v = ((document.querySelector('#dogname') || {}).value || sug).trim().slice(0, 16) || sug; pl.pet = { name: v, coat: e.coat, day: world.day, stay: null }; e.mine = true; e.pname = v; S.gone = true; game.ui.toast(`${v} trots at your heel. (Walk up and press E to tell ${v} to stay or come.)`, 'legend', 5); if (ECHO.Music) ECHO.Music.stinger('wish'); ECHO.Chronicle.add(world, { text: `${pl.first} ${pl.last} took in a stray dog and named it ${v}.`, kind: 'player', importance: 0, char: pl.charId }); } },
        { label: 'Not now — leave it be', onPick: () => { S.n = 2; } }
      ] });
    },
    menu(game, e) {
      const pl = game.pl, n = pl.pet.name;
      e.say = '*wags*'; e.sayT = 1.2;
      const home = ECHO.Life && ECHO.Life.home ? ECHO.Life.home(game.world, pl) : null;
      ECHO.UI.modal({ title: n, html: `<p>${esc(n)} looks up at you, tail going.</p>`, choices: [
        { label: `Scratch ${n} behind the ears`, onPick: () => { e.say = '♥'; e.sayT = 1.5; } },
        ...(home && !pl.pet.stay && !ECHO.Interior.cur ? [{ label: 'Go home and wait by the fire', sub: `${home.s.name}: you'll find ${n} there`, onPick: () => { pl.pet.stay = 'home'; pl.pet.at = null; e.dead = true; e.vanish = true; game.ui.toast(`${n} trots off toward home.`, 'info', 3); } }] : []),
        { label: pl.pet.stay ? 'Come on, then!' : 'Stay here', sub: pl.pet.stay ? 'back to your heel' : 'waits here until you come back', onPick: () => { e.homeDog = false; e.sleeping = false; pl.pet.stay = pl.pet.stay ? null : 'here'; pl.pet.at = pl.pet.stay ? { x: e.x, y: e.y } : null; game.ui.toast(pl.pet.stay ? `${n} lies down to wait.` : `${n} bounds after you.`, 'info', 2); } },
        { label: 'Leave it', onPick: () => {} }
      ] });
      void home;
    },
    // ------------------------------------------------------------ knucklebones
    score(d) {
      const c = {}; for (const v of d) c[v] = (c[v] || 0) + 1;
      const n = Math.max(...Object.values(c));
      const sum = d.reduce((a, b) => a + b, 0);
      const k = +Object.keys(c).find(v => c[v] === n);
      return n === 3 ? 300 + k * 10 : n === 2 ? 200 + k * 10 + sum / 100 : sum;
    },
    handName(d) { const s = D.score(d); return s >= 300 ? `three ${d[0]}s` : s >= 200 ? 'a pair' : `${d.reduce((a, b) => a + b, 0)} pips`; },
    dice(game, s) {
      const world = game.world, pl = game.pl;
      const opp = ECHO.People.residents(world, s).filter(n => n.status === 'alive' && n.prof !== 'child' && n.prof !== 'innkeeper')[ECHO.hashStr(s.id + world.day) % 7] || { first: 'A carter' };
      const bets = [5, 10, 25];
      ECHO.UI.modal({ title: 'Knucklebones', html: `<p>${esc(opp.first)} rattles three bones in a cup. "A game? Roll three, keep what you like, roll the rest once more. Best hand wins: three of a kind, then a pair, then the higher sum."</p>`, choices: bets.map(b => ({ label: `Play for ${b} crowns`, disabled: pl.gold < b, onPick: () => D.round(game, s, opp, b) })).concat([{ label: 'Not tonight', onPick: () => {} }]) });
    },
    round(game, s, opp, bet) {
      const pl = game.pl;
      const roll = () => 1 + Math.floor(Math.random() * 6);
      const mine = [roll(), roll(), roll()], keep = [false, false, false];
      const face = v => ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][v - 1];
      const show = () => {
        ECHO.UI.modal({ title: `Knucklebones — ${bet} crowns`, html: `<p>You roll: <span style="font-size:34px">${mine.map((v, i) => `<span style="${keep[i] ? 'color:#ffe08a' : ''}">${face(v)}</span>`).join(' ')}</span></p><p class="dim">Choose which to keep (they glow), then roll the rest.</p>`, choices: mine.map((v, i) => ({ label: `${keep[i] ? 'Keeping' : 'Keep'} the ${v}`, onPick: () => { keep[i] = !keep[i]; setTimeout(show, 0); } })).concat([{ label: 'Roll the rest', onPick: () => { for (let i = 0; i < 3; i++) if (!keep[i]) mine[i] = roll(); setTimeout(finish, 0); } }, { label: 'Stand on these', onPick: () => setTimeout(finish, 0) }]) });
      };
      const finish = () => {
        // the other player keeps pairs and sixes, and rolls the rest
        const his = [roll(), roll(), roll()];
        const c = {}; for (const v of his) c[v] = (c[v] || 0) + 1;
        const pairV = +Object.keys(c).find(v => c[v] >= 2);
        for (let i = 0; i < 3; i++) if (!(pairV ? his[i] === pairV : his[i] >= 5)) his[i] = roll();
        const a = D.score(mine), b = D.score(his);
        let res;
        if (a > b) { const win = bet * (a >= 300 ? 3 : 1); pl.gold += win; res = `You win ${win} crowns${a >= 300 ? ' — three of a kind pays three to one' : ''}.`; pl.stats = pl.stats || {}; pl.stats.diceWon = (pl.stats.diceWon || 0) + 1; ECHO.Sfx.play('coin'); }
        else if (a < b) { pl.gold -= bet; res = `You lose ${bet} crowns.`; }
        else res = 'A draw. Stakes back.';
        ECHO.UI.modal({ title: 'Knucklebones', html: `<p>You: <span style="font-size:28px">${mine.map(face).join(' ')}</span> — ${D.handName(mine)}</p><p>${esc(opp.first)}: <span style="font-size:28px">${his.map(face).join(' ')}</span> — ${D.handName(his)}</p><p><b>${res}</b></p>`, choices: [{ label: 'Again', disabled: pl.gold < bet, onPick: () => D.round(game, s, opp, bet) }, { label: 'Enough for tonight', onPick: () => {} }] });
      };
      show();
    }
  };
  P.extraAct = P.extraAct || []; P.extraAct.push(game => D.interactables(game));
  P.extraTick = P.extraTick || []; P.extraTick.push((game, dt) => D.tick(game, dt));
})();
