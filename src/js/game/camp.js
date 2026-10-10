// Camping and survival: the body keeps its own accounts out in the wild.
//
// Warmth drains on cold nights (worst in winter, on snow and high ground, in
// a storm or a blizzard, and soaked from a river) and comes back by a fire,
// indoors, or in the shelter of a town. Run cold and your stamina won't come
// back; freeze and it starts to cost you blood. Hunger creeps up over a day or
// two: well fed you recover faster, hungry you tire. Press B in the wild to
// make camp — gather deadwood among trees, or burn a bundle of timber — then
// sit by the fire (E) to cook what you hunted or caught, make a stew, and
// sleep until morning. A fire keeps you warm and the wolves wary; sleeping
// out still has its risks, unless someone keeps watch.
(function () {
  const { U } = ECHO;
  const T = ECHO.TILE;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const FOODS = {
    stew: { name: 'herb stew', hp: 50, fed: 60, warm: 30, hearty: 240 },
    roast: { name: 'roast meat', hp: 34, fed: 35, warm: 8 },
    grilled: { name: 'grilled fish', hp: 28, fed: 30, warm: 6 },
    food: { name: 'bread', hp: 20, fed: 25 },
    fish: { name: 'raw fish', hp: 8, fed: 10, raw: true },
    meat: { name: 'raw meat', hp: 10, fed: 12, raw: true }
  };
  const ORDER = ['stew', 'roast', 'grilled', 'food', 'fish', 'meat'];

  const C = ECHO.Camp = {
    FOODS, ORDER, fire: null, said: {},
    init(pl) { if (pl.warmth == null) pl.warmth = 100; if (pl.fed == null) pl.fed = 80; },
    // ------------------------------------------------------------ eating
    eatBest(game) {
      const pl = game.pl; C.init(pl);
      if (pl.hp >= pl.maxHp && pl.fed > 85) return game.ui.toast('You\'re not hungry.', 'info', 2);
      const k = C.ORDER.find(k => pl.inv[k] > 0);
      if (!k) return game.ui.toast('You have nothing to eat.', 'warn', 2);
      C.eat(game, k);
    },
    eat(game, k) {
      const pl = game.pl, F = FOODS[k]; C.init(pl);
      if (!F || !(pl.inv[k] > 0)) return;
      pl.inv[k]--;
      const PG = ECHO.Pastimes && ECHO.Pastimes.GOODS[k];
      const mul = PG && PG.dish && ECHO.Pastimes.level(pl, 'cook') >= 7 ? 1.25 : 1;
      pl.hp = Math.min(pl.maxHp, pl.hp + F.hp * mul);
      if (PG && PG.dish && ECHO.Pastimes.level(pl, 'cook') >= 9) { pl.warmth = Math.min(100, pl.warmth + 20); pl.hearty = Math.max(pl.hearty || 0, 300); }
      pl.fed = Math.min(100, pl.fed + F.fed);
      if (F.warm) pl.warmth = Math.min(100, pl.warmth + F.warm);
      if (F.hearty) pl.hearty = Math.max(pl.hearty || 0, F.hearty);
      game.ui.toast(F.raw ? `You chew ${F.name}. (It would do you far more good cooked over a fire — B to make camp.)` : `You eat ${F.name}.${F.hearty ? ' Warm to your toes.' : ''}`, 'info', F.raw ? 4 : 2);
    },
    // stamina comes back faster fed and warm, slower hungry or cold
    regenMul(pl) {
      if (pl.warmth == null) return 1;
      let m = 1;
      if (pl.fed > 70) m *= 1.15; else if (pl.fed < 25) m *= 0.75;
      if (pl.warmth < 20) m *= 0.5; else if (pl.warmth < 40) m *= 0.7;
      if (pl.hearty > 0) m *= 1.25;
      return m;
    },
    // ------------------------------------------------------------ the cold
    // How cold it is on you right now (0 = nothing; 1 = a hard winter night).
    exposure(game) {
      const world = game.world, pl = game.pl, pe = game.pe;
      if (ECHO.Interior.cur) return { cold: 0, why: [] };
      const night = game.isNight();
      const season = ECHO.TIME.dateOf(world.day).seasonIdx;
      const why = [];
      let c = night ? [0.25, 0, 0.35, 0.8][season] : [0, 0, 0, 0.35][season];
      if (c > 0.3) why.push(season === 3 ? 'winter' : 'the night');
      const t = ECHO.World.tile(world, Math.floor(pe.x), Math.floor(pe.y));
      if (t === T.SNOW) { c += 0.35; why.push('snow'); } else if (t === T.HILL) c += 0.1;
      const wx = ECHO.Weather ? ECHO.Weather.here(world, pe.x, pe.y) : null;
      if (wx) {
        if (wx.today === 'blizzard') { c += 0.6; why.push('the blizzard'); }
        else if (wx.harsh) { c += 0.3; why.push('a bitter spell'); }
        else if (wx.today === 'storm' || wx.today === 'rain' || wx.today === 'snow') c += 0.12;
      }
      if ((pl.wetT > 0 || pe._inWater) && (c > 0.1 || season === 3)) { c += 0.4; why.push('soaked'); }
      const arm = pl.armor && game.world.items[pl.armor];
      if (arm) c -= arm.craft === 'winter' ? 0.55 : 0.12;   // a layer helps; the Winter Wolf's fur most of all
      return { cold: Math.max(0, c), why };
    },
    // Heat around you: your fire, a hearth indoors, the shelter of town.
    shelter(game) {
      const pe = game.pe;
      if (ECHO.Interior.cur) return 1.2;
      let h = 0;
      if (C.fire && !C.fire.out && U.dist(C.fire.x, C.fire.y, pe.x, pe.y) < 3.5) h = 1.6;
      if (!h) for (const c of game.world.camps) if (c.alive && U.dist(c.x, c.y, pe.x, pe.y) < 3) h = 1.2;
      if (!h && ECHO.World.settlementAt(game.world, pe.x, pe.y, 9)) h = 0.35;
      return h;
    },
    // ------------------------------------------------------------ each frame
    update(game, dt) {
      const pl = game.pl, pe = game.pe, world = game.world;
      if (!pl || !pe || pl.capture || game.defeating) return;
      C.init(pl);
      const gmin = dt * game.minPerSec();
      const ex = C.exposure(game), sh = C.shelter(game);
      C.ex = ex;
      const net = ex.cold - sh;
      if (net > 0) pl.warmth = Math.max(0, pl.warmth - net * 0.28 * gmin);
      else pl.warmth = Math.min(100, pl.warmth + (0.3 + -net * 1.6) * gmin);
      pl.fed = Math.max(0, pl.fed - 0.05 * gmin);
      if (pl.hearty > 0) pl.hearty -= gmin;
      // the price of the cold, and of an empty belly
      if (pl.warmth < 20) {
        pl.stamina = Math.min(pl.stamina, pl.maxSta * 0.6);
        if (pl.hp > pl.maxHp * 0.3) pl.hp = Math.max(pl.maxHp * 0.3, pl.hp - 0.35 * dt);
        if ((C.shiverT = (C.shiverT || 0) - dt) <= 0) { C.shiverT = 7; ECHO.Combat.floater(pe.x, pe.y - 1.3, 'shivering', '#bfe0ff'); }
      }
      if (pl.fed < 5 && pl.hp > pl.maxHp * 0.5) pl.hp = Math.max(pl.maxHp * 0.5, pl.hp - 0.15 * dt);
      C.warn(game, 'chilled', pl.warmth < 40, `You're getting cold${ex.why.length ? ' — ' + ex.why.join(', ') : ''}. Find a fire, a roof, or make camp (B).`);
      C.warn(game, 'freezing', pl.warmth < 20, 'You\'re freezing. Your strength won\'t come back and the cold is starting to hurt. Get to a fire.');
      C.warn(game, 'hungry', pl.fed < 25, 'You\'re hungry. (H to eat; cooked food does you most good.)');
      C.warn(game, 'starving', pl.fed < 5, 'You\'re starving, and weakening by the hour.');
      // the campfire burns down
      const f = C.fire;
      if (f) {
        if (!f.out) {
          f.fuel -= gmin;
          if (!ECHO.Interior.cur) game.light(f.x, f.y, 5.5, 1.05 + Math.sin(game.time * 11) * 0.06, '#ff9a4a');
          if (f.fuel <= 0) { f.out = true; f.outAt = world.day * 1440 + world.minute; if (U.dist(f.x, f.y, pe.x, pe.y) < 12) game.ui.toast('Your fire has burned down to embers.', 'info', 3); }
          if (Math.random() < dt * 4) ECHO.Combat.fx.push({ kind: 'smoke', x: f.x + (Math.random() - 0.5) * 0.2, y: f.y - 0.6, vx: 0.1, vy: -0.7, t: 0, life: 2.2, size: 2 });
          // the fire keeps the wild beasts back
          for (const e of game.ents) if (e.type === 'creature' && e.species === 'wolf' && !e.dead && !e.aggro && U.dist(e.x, e.y, f.x, f.y) < 5) { e.state = 'flee'; e.target = null; }
        } else if (world.day * 1440 + world.minute - f.outAt > 240) C.fire = null;
        if (C.fire && (U.dist(f.x, f.y, pe.x, pe.y) > 70 || ECHO.Interior.cur && f.out)) C.fire = null;
      }
      C.hud(game);
    },
    warn(game, k, cond, text) {
      if (cond && !C.said[k]) { C.said[k] = true; game.ui.toast(text, 'warn', 5); }
      else if (!cond && C.said[k]) C.said[k] = false;
    },
    hud(game) {
      const el = document.getElementById('hud-body'); if (!el) return;
      const pl = game.pl, bits = [];
      if (pl.warmth < 20) bits.push('<span class="freeze">❄ Freezing</span>');
      else if (pl.warmth < 40) bits.push('<span class="cold">❄ Cold</span>');
      else if (C.ex && C.ex.cold - C.shelter(game) > 0.2 && pl.warmth < 85) bits.push(`<span class="cool">❄ ${Math.round(pl.warmth)}%</span>`);
      if (C.shelter(game) >= 1.6) bits.push('<span class="warm">🔥 Warm by the fire</span>');
      if (pl.fed < 5) bits.push('<span class="freeze">Starving</span>');
      else if (pl.fed < 25) bits.push('<span class="cold">Hungry</span>');
      else if (pl.fed > 70) bits.push('<span class="fed">Well fed</span>');
      if (pl.hearty > 0) bits.push('<span class="fed">Hearty</span>');
      const html = bits.join('');
      if (el._h !== html) { el.innerHTML = html; el._h = html; }
    },
    // ------------------------------------------------------------ making camp
    nearWood(world, x, y) {
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const t = ECHO.World.tile(world, Math.floor(x) + dx, Math.floor(y) + dy); if (t === T.TREE || t === T.FOREST) return true; }
      return false;
    },
    why(game) {
      const pe = game.pe, world = game.world, pl = game.pl;
      if (ECHO.Interior.cur) return 'Not indoors.';
      if (pe.mounted) return 'Get down from the saddle first.';
      if (pe.inBoat || pe._inWater || pe.swimming || (ECHO.Water && ECHO.Water.kind(world, pe.x, pe.y))) return 'Not in the water.';
      if (ECHO.World.settlementAt(world, pe.x, pe.y, 8)) return 'Not in town — there\'s an inn for that.';
      if (game.ents.some(e => !e.dead && (e.aggro || e.target === pe) && game.hostileTo(e, pe) && U.dist(e.x, e.y, pe.x, pe.y) < 16)) return 'Not with enemies about.';
      const wx = ECHO.Weather && ECHO.Weather.here(world, pe.x, pe.y);
      if (wx && (wx.today === 'storm' || wx.today === 'blizzard') && !C.nearWood(world, pe.x, pe.y)) return 'Nothing will light in this weather out in the open. Find the shelter of trees.';
      if (!C.nearWood(world, pe.x, pe.y) && !(pl.inv.timber > 0)) return 'No deadwood here. Make camp near trees, or carry a bundle of timber (markets sell it).';
      return null;
    },
    make(game) {
      const pe = game.pe, world = game.world, pl = game.pl;
      if (C.fire && !C.fire.out && U.dist(C.fire.x, C.fire.y, pe.x, pe.y) < 4) return C.open(game);
      const why = C.why(game);
      if (why) return game.ui.toast(why, 'warn', 3);
      const usedTimber = !C.nearWood(world, pe.x, pe.y);
      if (usedTimber) pl.inv.timber--;
      const a = pe.dir || 0;
      let fx = pe.x + Math.cos(a) * 1.1, fy = pe.y + Math.sin(a) * 1.1;
      if (ECHO.World.isSolid(world, fx, fy)) { fx = pe.x; fy = pe.y + 0.9; }
      const bx = fx - Math.cos(a) * 1.9 + Math.cos(a + Math.PI / 2) * 0.6, by = fy - Math.sin(a) * 1.9 + Math.sin(a + Math.PI / 2) * 0.6;
      C.fire = { x: fx, y: fy, bx, by, rot: -a, fuel: 360, out: false, made: world.day };
      ECHO.Sfx.play('fireCast', { vol: 0.5 });
      ECHO.Combat.burst(fx, fy, '#ffb347', 10, 2, 0.6, 1.5);
      pl.camps = (pl.camps || 0) + 1;
      game.ui.toast(usedTimber ? 'You make camp, and a bundle of timber catches. (E by the fire to cook and rest.)' : 'You gather deadwood and make camp. (E by the fire to cook and rest.)', 'info', 4);
    },
    interactables(game) {
      const f = C.fire, pe = game.pe;
      if (!f || ECHO.Interior.cur || U.dist(f.x, f.y, pe.x, pe.y) > 2.4) return [];
      return [{ kind: 'act', label: f.out ? 'The embers of your camp (relight, rest)' : 'Sit by the fire (cook, rest)', d: 0.4, act: () => C.open(game) }];
    },
    // ------------------------------------------------------------ by the fire
    open(game) {
      const pl = game.pl, f = C.fire, world = game.world;
      if (!f) return;
      const night = game.isNight();
      const ch = [];
      if (f.out) {
        const wood = C.nearWood(world, f.x, f.y) || pl.inv.timber > 0;
        ch.push({ label: 'Build the fire up again', sub: wood ? (C.nearWood(world, f.x, f.y) ? 'deadwood from the trees' : 'a bundle of timber') : 'no wood to hand', disabled: !wood, onPick: () => { if (!C.nearWood(world, f.x, f.y)) pl.inv.timber--; f.out = false; f.fuel = 360; ECHO.Sfx.play('fireCast', { vol: 0.4 }); setTimeout(() => C.open(game), 0); } });
      } else {
        const meat = pl.inv.meat || 0, fish = pl.inv.fish || 0, herbs = pl.inv.herbs || 0;
        ch.push({ label: `Roast meat${meat ? ` (${meat})` : ''}`, sub: meat ? 'all of it, on a spit' : 'you have no meat — hunt hares, deer and wolves', disabled: !meat, onPick: () => C.cook(game, 'meat', 'roast', meat) });
        ch.push({ label: `Grill fish${fish ? ` (${fish})` : ''}`, sub: fish ? 'all of it, over the coals' : 'you have no fish — a rod and any water', disabled: !fish, onPick: () => C.cook(game, 'fish', 'grilled', fish) });
        ch.push({ label: 'Make a herb stew', sub: meat && herbs ? '1 meat + 1 bundle of herbs: heals most, warms you through' : 'needs 1 meat and 1 bundle of herbs', disabled: !(meat && herbs), onPick: () => { pl.inv.meat--; pl.inv.herbs--; pl.inv.stew = (pl.inv.stew || 0) + 1; f.cookT = 6; ECHO.Character.train(pl, 'endurance', 0.1); game.ui.toast('A pot of stew, thick with herbs. (H to eat.)', 'info', 3); setTimeout(() => C.open(game), 0); } });
      }
      if (!f.out && ECHO.Pastimes) ch.push({ label: 'Cook a recipe…', sub: 'pies, soups, cakes, salves', onPick: () => ECHO.Pastimes.cookMenu(game, 'by your fire', () => C.open(game)) });
      ch.push({ label: night ? 'Sleep until morning' : 'Rest a few hours', sub: f.out ? 'cold, without a fire' : C.watchman(game) ? `${C.watchman(game).first} will keep watch` : 'alone — keep one eye open', onPick: () => C.rest(game, night ? 'dawn' : 3) });
      if (ECHO.Homestead) ch.push(...ECHO.Homestead.campChoices(game));
      ch.push({ label: 'Put out the fire and break camp', sub: 'kick dirt over it', onPick: () => { C.fire = null; game.ui.toast('You scatter the ashes.', 'info', 2); } });
      ch.push({ label: 'Leave it', onPick: () => {} });
      const C0 = C.ex || { cold: 0 };
      const lines = [];
      lines.push(f.out ? 'The fire is down to embers.' : `The fire crackles. Enough wood for ${Math.max(1, Math.round(f.fuel / 60))} more hour${f.fuel > 90 ? 's' : ''}.`);
      lines.push(`Warmth ${Math.round(pl.warmth)}% · ${pl.fed > 70 ? 'well fed' : pl.fed > 25 ? 'fed' : 'hungry'}${C0.cold > 0.3 ? ` · it's a cold ${night ? 'night' : 'day'}` : ''}.`);
      const cooked = ['stew', 'roast', 'grilled'].filter(k => pl.inv[k] > 0).map(k => `${pl.inv[k]} ${FOODS[k].name}`);
      if (cooked.length) lines.push(`In your pack: ${cooked.join(', ')}.`);
      ECHO.UI.modal({ title: 'Camp', html: lines.map(l => `<p>${esc(l)}</p>`).join(''), choices: ch });
    },
    cook(game, from, to, n) {
      const pl = game.pl;
      pl.inv[from] -= n; pl.inv[to] = (pl.inv[to] || 0) + n;
      if (C.fire) C.fire.cookT = 6;
      ECHO.Sfx.play('fireCharge', { vol: 0.3 });
      ECHO.Character.train(pl, 'endurance', 0.05 * n);
      game.ui.toast(`${n} ${FOODS[to].name}, ready to eat. (H)`, 'info', 3);
      setTimeout(() => C.open(game), 0);
    },
    watchman(game) {
      const pl = game.pl;
      return pl.companion && game.world.npcs[pl.companion] && game.ents.some(e => e.isCompanion && !e.dead) ? game.world.npcs[pl.companion] : null;
    },
    // Sleep out. Warm by a fire you wake whole; cold, you wake stiff. And in
    // the dark there may be something at the edge of the firelight.
    rest(game, until) {
      const world = game.world, pl = game.pl, f = C.fire;
      const UI = ECHO.UI;
      UI.fadeOut(() => {
        let mins = until === 'dawn' ? (7 * 60 - world.minute + 1440) % 1440 : until * 60;
        if (until === 'dawn' && mins < 60) mins += 1440;
        const night = game.isNight();
        const total = mins, day0 = world.day;
        while (mins > 0) { const step = Math.min(60, mins); ECHO.Sim.advance(world, step); mins -= step; }
        if (world.day !== day0) game.onNewDay();
        const lit = f && !f.out;
        if (f && !f.out) { f.fuel -= total; if (f.fuel <= 0) { f.out = true; f.outAt = world.day * 1440 + world.minute; } }
        const warmSleep = lit || (C.ex && C.ex.cold < 0.3);
        const k = warmSleep ? 1 : 0.6;
        pl.hp = Math.max(pl.hp, pl.maxHp * k); pl.stamina = pl.maxSta * k; pl.mana = Math.max(pl.mana, pl.maxMana * k);
        pl.fed = Math.max(0, pl.fed - total * 0.03);
        pl.warmth = warmSleep ? Math.max(pl.warmth, 80) : Math.min(pl.warmth, 35);
        game.ents = game.ents.filter(e => e === game.pe || e.isCompanion);
        UI.fadeIn();
        // the night has teeth
        const watch = C.watchman(game);
        const cover = ECHO.Stealth ? ECHO.Stealth.coverAt(world, game.pe.x, game.pe.y) : 0;
        const risk = (night ? 0.3 : 0.08) * (lit ? 0.6 : 1) * (1 - cover * 0.5);
        const msgs = [`You wake ${warmSleep ? 'rested' : 'stiff with cold'}. ${ECHO.TIME.fmtDate(world.day)}, ${String(Math.floor(world.minute / 60)).padStart(2, '0')}:${String(Math.floor(world.minute) % 60).padStart(2, '0')}.`];
        if (Math.random() < (C.forceAmbush != null ? C.forceAmbush : risk)) {
          const n = 2 + (Math.random() < 0.4 ? 1 : 0);
          const a0 = Math.random() * Math.PI * 2;
          for (let i = 0; i < n; i++) {
            const sp = ECHO.Ent.freeSpot(world, game.pe.x + Math.cos(a0 + i * 0.5) * 7, game.pe.y + Math.sin(a0 + i * 0.5) * 7, 4);
            if (!sp) continue;
            const w = ECHO.Spawner.makeCreature(game, 'wolf', sp.x, sp.y, ECHO.World.regionAt(world, sp.x, sp.y), null);
            w.aggro = true; w.target = game.pe; game.addEnt(w);
          }
          if (!watch) { pl.hp = Math.max(1, pl.hp - pl.maxHp * 0.15); game.shake(0.3); }
          msgs.push(watch ? `${watch.first} shakes you awake: "Wolves — at the edge of the light!"` : 'You wake to teeth — wolves have crept into the camp!');
        } else if (f && f.out && lit) msgs.push('The fire burned down to embers while you slept.');
        pl.campNights = (pl.campNights || 0) + (until === 'dawn' ? 1 : 0);
        UI.toast(msgs.join(' '), msgs.length > 1 && !msgs[1].startsWith('The fire') ? 'warn' : 'info', 6);
      });
    }
  };
})();
