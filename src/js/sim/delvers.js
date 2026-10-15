// Delvers: the townsfolk who go down into the dungeons too.
//
// Not only the four rivals: any guard, soldier, hunter or bold soul may decide
// to try their strength below ground — alone or with a friend or two from the
// same town. They are gone a day or three. They come back stronger (a level
// for a floor that tested them), with gear they wear from then on and a little
// coin; or they are driven out, hurt; or, now and then, they do not come back.
// Everyone carries a level (1–150) and may wear a weapon and armour; you meet
// them that way, in town or in a fight, and can give them gear yourself.
(function () {
  const { U } = ECHO;
  const P = () => ECHO.People;
  const X = () => ECHO.Explore;
  // how readily each trade takes up the life
  const KEEN = { guard: 3, soldier: 3, hunter: 2.5, wanderer: 2.2, woodcutter: 1.2, smith: 1.2, miner: 1.5, fisher: 0.7, farmer: 0.6, herbalist: 0.5, merchant: 0.4, priest: 0.3 };
  const MAX_LV = 150;

  const D = ECHO.Delvers = {
    // A person's level: from their fighting skill until they have earned one.
    lv(n) { return n ? Math.max(n.lv || 0, D.baseLv(n)) : 1; },
    baseLv(n) { return U.clamp(Math.round(1 + ((n.skill && n.skill.fight) || 0) / 10), 1, 12); },
    weapon(world, n) { const it = n && n.gear && world.items[n.gear.weapon]; return it && it.holder === n.id ? it : null; },
    armor(world, n) { const it = n && n.gear && world.items[n.gear.armor]; return it && it.holder === n.id ? it : null; },
    score(it) { return !it ? 0 : it.kind === 'armor' ? (it.def || 0) * 2.2 : (it.dmg || 0) * (1 + (it.plus || 0) * 0.1); },
    slot(it) { return it && it.kind === 'armor' ? 'armor' : it && (it.kind === 'sword' || it.kind === 'bow') ? 'weapon' : null; },
    // How much stronger their gear makes them, in levels.
    gearBonus(world, n) {
      const L = D.lv(n), w = D.weapon(world, n), a = D.armor(world, n);
      const wb = w ? U.clamp(((w.level || L) - L) * 0.25 + ((w.rarity && ECHO.Gear ? ECHO.Gear.rarity(w.rarity).mult : 1) - 1) * 3, -1, 6) + 0.5 : -0.5;
      const ab = a ? U.clamp(((a.level || L) - L) * 0.2 + 0.5, -1, 4) : -0.5;
      return wb + ab;
    },
    power(world, n) { return D.lv(n) + D.gearBonus(world, n); },
    // Put it on if it is better than what they wear. Returns true if they did.
    equip(world, n, it, why) {
      const sl = D.slot(it);
      if (!sl) return false;
      n.gear = n.gear || {};
      const cur = sl === 'weapon' ? D.weapon(world, n) : D.armor(world, n);
      if (cur && D.score(cur) >= D.score(it)) return false;
      if (cur) {
        cur.holder = null;
        cur.history.push({ d: world.day, t: `sold by ${n.first} ${n.last}` });
        if (cur.delverLoot) delete world.items[cur.id];   // nobody will miss it
      }
      it.holder = n.id;
      it.history.push({ d: world.day, t: why || `taken up by ${n.first} ${n.last}` });
      n.gear[sl] = it.id;
      return true;
    },
    // How their gear looks on them — the same as yours looks on you.
    lookOf(world, n) {
      const G = ECHO.Gear, w = D.weapon(world, n), a = D.armor(world, n);
      if (!G || (!w && !a)) return null;
      return { blade: w && w.kind !== 'bow' ? G.look(w) : null, bow: w && w.kind === 'bow' ? G.look(w) : null, armor: a ? G.look(a) : null, rank: null, npc: true, key: [w && w.id, w && w.plus, a && a.id, a && a.plus].join('|') };
    },
    // What to say about them in a line: "Lv 14 · a fine axe · leather armour".
    line(world, n) {
      const w = D.weapon(world, n), a = D.armor(world, n);
      return `Lv ${D.lv(n)}${w ? ' · ' + w.name : ''}${a ? ' · ' + a.name : ''}`;
    },

    // ------------------------------------------------------------ the day
    dailyTick(world) {
      if (!ECHO.Explore || !ECHO.Gear) return;
      const rng = new ECHO.RNG(ECHO.hashStr('delvers:' + world.seed + ':' + world.day));
      const people = P().alive(world);
      // come back up
      for (const n of people) if (n.delving && n.delving.lead === n.id && world.day >= n.delving.back) D.resolve(world, rng, n);
      for (const n of people) if (n.delving && world.day > n.delving.back + 3) D.home(world, n);   // a party that lost its leader
      // and go down
      const out = people.filter(n => n.delving).length;
      const cap = U.clamp(Math.round(world.settlements.length * 0.6), 3, 16);
      if (out >= cap) return;
      const comp = world.player && world.player.companion;
      const ready = n => n.status === 'alive' && n.loc && !n.journey && !n.lost && !n.delving && !n.rival && n.id !== comp && !n.title && !(n.jailUntil > world.day) && !(n.hurtUntil > world.day) && KEEN[n.prof] && !P().has(n, 'cowardly') && P().age(world, n) >= 17 && P().age(world, n) <= 58;
      let started = 0;
      for (const n of people) {
        if (started >= 3 || out + started >= cap) break;
        if (!ready(n)) continue;
        const s = ECHO.Sim.settlement(world, n.loc);
        if (!s || s.faction === 'ashfang') continue;
        const keen = KEEN[n.prof] * (P().has(n, 'brave') ? 1.8 : 1) * (P().has(n, 'ambitious') ? 1.5 : 1) * (P().has(n, 'greedy') ? 1.3 : 1) * (P().has(n, 'hot-headed') ? 1.3 : 1);
        if (!rng.chance(0.0022 * keen)) continue;
        const friends = P().residents(world, s).filter(m => m !== n && ready(m) && ((m.op && m.op[n.id] > 15) || m.prof === n.prof)).slice(0, 4);
        const party = [n];
        for (const m of friends) if (party.length < 3 && rng.chance(0.35)) party.push(m);
        if (D.start(world, rng, party, s)) started++;
      }
    },
    // Choose a dungeon near home with a floor they can hope to beat.
    choose(world, party, s) {
      const pw = Math.max(...party.map(m => D.power(world, m))) + (party.length - 1) * 0.6;
      let best = null, bs = Infinity;
      for (const site of X().sites(world)) {
        if (site.cat !== 'delve' || site.kind === 'riftdeep') continue;
        const d = U.dist(site.x, site.y, s.x, s.y);
        if (d > 50) continue;
        X().level(world, site);
        const nf = X().floors(site);
        let f = -1;
        for (let k = 0; k < nf; k++) if (X().floorLevel(site, k) <= pw + 1.5) f = k;
        if (f < 0) continue;
        const fl = X().floorLevel(site, f);
        const sc = (pw - fl) * 3 + d * 0.15 + (site.cleared ? 25 : 0);
        if (sc < bs) { bs = sc; best = { site, floor: f, fl }; }
      }
      return best;
    },
    start(world, rng, party, s) {
      const c = D.choose(world, party, s);
      if (!c) return false;
      const back = world.day + 1 + rng.int(0, 2), ids = party.map(m => m.id);
      for (const m of party) { m.delving = { site: c.site.id, floor: c.floor, back, lead: party[0].id, party: ids, from: s.id }; m.loc = null; }
      const names = U.listJoin(party.map(m => m.first));
      ECHO.Chronicle.add(world, { text: `${names} of ${s.name} went down into ${c.site.name} to try ${party.length > 1 ? 'their' : party[0].sex === 'f' ? 'her' : 'his'} strength.`, kind: 'deed', importance: 0, sid: s.id, npcs: ids });
      return true;
    },
    home(world, m) {
      const dv = m.delving;
      m.delving = null;
      if (m.status !== 'alive') return;
      const from = dv && ECHO.Sim.settlement(world, dv.from);
      const home = from && from.residents.includes(m.id) ? from : ECHO.Sim.settlement(world, m.home);
      m.loc = home ? home.id : m.home;
    },
    // How it went.
    resolve(world, rng, lead) {
      const dv = lead.delving, site = X().byId(world, dv.site);
      const party = dv.party.map(id => world.npcs[id]).filter(m => m && m.status === 'alive' && m.delving);
      if (!site || !party.length) { for (const m of party) D.home(world, m); return; }
      const fl = X().floorLevel(site, dv.floor), last = dv.floor >= X().floors(site) - 1;
      const pw = Math.max(...party.map(m => D.power(world, m))) + (party.length - 1) * 0.6;
      const roll = rng.next() + (pw - fl) * 0.12;
      const names = U.listJoin(party.map(m => m.first)), town = ECHO.Sim.settlement(world, dv.from);
      const where = { x: site.x, y: site.y, sid: town ? town.id : null };
      if (roll > 0.35) {
        // they come back up stronger, with something to show for it
        const loot = [];
        for (const m of party) {
          const L0 = D.lv(m);
          const up = fl >= L0 - 1 ? 1 + (fl > L0 + 1 && rng.chance(0.5) ? 1 : 0) : rng.chance(0.3) ? 1 : 0;
          m.lv = Math.min(MAX_LV, L0 + up);
          m.skill.fight = Math.min(100, (m.skill.fight || 0) + up * 1.5);
          m.wealth = (m.wealth || 0) + 8 + Math.round(fl * 2.5);
          m.renown = (m.renown || 0) + 2;
          m.delves = (m.delves || 0) + 1;
        }
        const nLoot = 1 + (rng.chance(0.35) ? 1 : 0) + (last ? 1 : 0);
        for (let i = 0; i < nLoot; i++) {
          const kind = rng.chance(0.55) ? 'sword' : 'armor';
          const it = ECHO.Gear.make(world, rng, kind, fl, ECHO.Gear.rollRarity(rng, fl, last ? 15 : 0), 'in ' + site.name);
          it.delverLoot = true;
          // whoever it helps most takes it
          const who = party.slice().sort((a, b) => D.score(kind === 'armor' ? D.armor(world, a) : D.weapon(world, a)) - D.score(kind === 'armor' ? D.armor(world, b) : D.weapon(world, b)))[0];
          if (D.equip(world, who, it, `brought up out of ${site.name} by ${who.first} ${who.last}`)) loot.push({ who, it });
          else delete world.items[it.id];
        }
        // the last floor beaten: the treasure is theirs, and the place falls quiet a while
        let cleared = false;
        if (last && roll > 0.75 && !site.starter && !site.cleared && !(world.player && ECHO.Interior && ECHO.Interior.cur && ECHO.Interior.cur.site === site)) {
          site.cleared = true; site.clearedDay = world.day; site.clearedBy = `${lead.first} ${lead.last}`; site.chestTaken = true; cleared = true;
        }
        for (const m of party) P().remember(world, m, `went down into ${site.name}${party.length > 1 ? ' with ' + U.listJoin(party.filter(o => o !== m).map(o => o.first)) : ''} and came back stronger`, 'pride', null, 3);
        const best = loot.slice().sort((a, b) => ECHO.Gear.rarity(b.it.rarity).mult - ECHO.Gear.rarity(a.it.rarity).mult)[0];
        const big = cleared || (best && (best.it.rarity === 'epic' || best.it.rarity === 'legendary'));
        ECHO.Chronicle.add(world, { text: `${names}${town ? ' of ' + town.name : ''} came up out of ${site.name}${cleared ? ' with its treasure — the place is quiet now' : ''}${best ? `, and ${best.who.first} now carries ${best.it.name.toLowerCase().startsWith('the ') ? '' : 'a '}${best.it.name.toLowerCase()}` : ''}. (${party.map(m => m.first + ' Lv ' + m.lv).join(', ')})`, kind: 'deed', importance: big ? 1 : 0, ...where, npcs: party.map(m => m.id) });
      } else if (roll > 0.12) {
        for (const m of party) { m.hurtUntil = world.day + 3 + rng.int(0, 3); P().remember(world, m, `was driven out of ${site.name}, bleeding`, 'trauma', null, 2); }
        ECHO.Chronicle.add(world, { text: `${names}${town ? ' of ' + town.name : ''} ${party.length > 1 ? 'were' : 'was'} driven out of ${site.name}, bleeding, and swore to go back.`, kind: 'deed', importance: 0, ...where, npcs: party.map(m => m.id) });
      } else {
        // the dark keeps one
        const lost = party[rng.int(0, party.length - 1)];
        const odds = fl > pw + 3 ? 0.6 : 0.3;
        if (rng.chance(odds)) {
          for (const sl of ['weapon', 'armor']) { const it = sl === 'weapon' ? D.weapon(world, lost) : D.armor(world, lost); if (it) { it.holder = null; if (it.delverLoot) delete world.items[it.id]; } }
          lost.delving = null;
          P().kill(world, lost, `lost in ${site.name}`, null, null);
          ECHO.Chronicle.add(world, { text: `${lost.first} ${lost.last}${town ? ' of ' + town.name : ''} went down into ${site.name} and did not come back.${party.length > 1 ? ` ${U.listJoin(party.filter(o => o !== lost).map(o => o.first))} carried the news home.` : ''}`, kind: 'death', importance: 1, ...where, npcs: [lost.id] });
        } else ECHO.Chronicle.add(world, { text: `${names}${town ? ' of ' + town.name : ''} barely got out of ${site.name} alive.`, kind: 'deed', importance: 0, ...where, npcs: party.map(m => m.id) });
        for (const m of party) if (m.status === 'alive') m.hurtUntil = world.day + 5 + rng.int(0, 4);
      }
      for (const m of party) D.home(world, m);
    },
    // ------------------------------------------------------------ gifts from you
    // How much this item would help this person (0 = not at all).
    benefit(world, n, it) {
      if (!n || n.status !== 'alive' || n.prof === 'child' || !D.slot(it)) return 0;
      const cur = D.slot(it) === 'armor' ? D.armor(world, n) : D.weapon(world, n);
      const gain = D.score(it) - D.score(cur);
      if (gain <= 0) return 0;
      return gain * (KEEN[n.prof] ? 0.6 + KEEN[n.prof] * 0.4 : 0.5) * ((n.delves || 0) > 0 ? 1.3 : 1);
    },
    // Who in a town would be helped most by it.
    neediest(world, s, it, not) {
      let best = null, bs = 0;
      for (const n of P().residents(world, s)) { if (n === not) continue; const b = D.benefit(world, n, it); if (b > bs) { bs = b; best = n; } }
      return best;
    },
    // You give an item away, free. It always finds a use: the one you give it
    // to wears it if it beats theirs, or passes it to whoever in their town
    // needs it most, or sells it for the town's good. Returns what happened.
    gift(world, pl, to, it, town) {
      if (!it || !pl.items.includes(it.id) || it.id === pl.weapon || it.id === pl.armor || it.id === pl.bow) return null;
      pl.items = pl.items.filter(id => id !== it.id);
      const R = ECHO.Gear ? ECHO.Gear.rarity(it.rarity).mult : 1;
      const s = town || (to && ECHO.Sim.settlement(world, to.loc || to.home));
      const from = `${pl.first} ${pl.last}`;
      let wearer = null, how;
      if (to && D.benefit(world, to, it) > 0) { wearer = to; how = 'wears'; }
      else {
        const other = s && D.neediest(world, s, it, to);
        if (other) { wearer = other; how = 'passed'; }
      }
      if (wearer) {
        D.equip(world, wearer, it, `given by ${from}${how === 'passed' && to ? ', by way of ' + to.first + ' ' + to.last : ''} to ${wearer.first} ${wearer.last}`);
        it.delverLoot = false;
        wearer.op[pl.charId] = (wearer.op[pl.charId] || 0) + Math.round(8 + R * 6);
        P().remember(world, wearer, `was given ${it.name.toLowerCase()} by ${from}`, 'gratitude', null, 3);
        if (wearer.mind) wearer.mind.owe = (wearer.mind.owe || 0) + 1;
      } else {
        // nobody needs it: sold, and the coin goes to the town
        how = 'sold';
        const coin = ECHO.Gear ? Math.round(ECHO.Gear.value(it) * 0.6) : 10;
        if (s) s.prosperity = Math.min(100, (s.prosperity || 50) + Math.min(3, coin / 60));
        if (to) to.wealth = (to.wealth || 0) + Math.round(coin * 0.3);
        it.holder = null; it.history.push({ d: world.day, t: `given away by ${from}, and sold for the good of ${s ? s.name : 'the poor'}` });
        delete world.items[it.id];
      }
      if (to && to !== wearer) { to.op[pl.charId] = (to.op[pl.charId] || 0) + Math.round(4 + R * 3); P().remember(world, to, `was trusted by ${from} to see a gift put to good use`, 'gratitude', null, 2); }
      // the town hears of it
      if (s && ECHO.Chronicle && ECHO.Chronicle.deed) ECHO.Chronicle.deed(world, { text: `${from} gave ${it.name.toLowerCase()} away${wearer ? ' to ' + wearer.first + ' ' + wearer.last : ''} in ${s.name}, asking nothing for it.`, kind: 'deed', importance: R >= 1.5 ? 1 : 0, sid: s.id, x: s.x, y: s.y, rep: Math.min(4, 0.5 + R * 1.2), tag: 'protect' });
      return { how, wearer, to, s, it };
    },
    // Hand all your spare gear to a town: each piece goes where it helps most.
    shareAll(world, pl, s) {
      const spare = (pl.items || []).map(id => world.items[id]).filter(it => it && D.slot(it) && it.id !== pl.weapon && it.id !== pl.armor && it.id !== pl.bow);
      return spare.map(it => D.gift(world, pl, null, it, s)).filter(Boolean);
    },
    // A sentence for what happened to a gift.
    giftLine(r) {
      if (!r) return '';
      const nm = r.it.name;
      if (r.how === 'wears') return `${r.wearer.first} ${r.it.kind === 'armor' ? 'buckles on' : 'takes up'} ${nm} at once.`;
      if (r.how === 'passed') return r.to ? `${r.to.first} already has better, and passes ${nm} to ${r.wearer.first} ${r.wearer.last}, who needs it.` : `${nm} goes to ${r.wearer.first} ${r.wearer.last} (${r.wearer.prof}), who needs it most.`;
      return `Nobody in ${r.s ? r.s.name : 'town'} needs ${nm}; it is sold, and the coin goes to the town.`;
    },

    // ------------------------------------------------------------ talking to them
    dialogue(world, npc, ent, pl, ui) {
      if (!npc || npc.prof === 'child') return;
      D.giftOption(world, npc, ent, pl, ui);
      if (!KEEN[npc.prof] && !npc.lv && !(npc.gear && (npc.gear.weapon || npc.gear.armor))) return;
      const L = D.lv(npc), w = D.weapon(world, npc), a = D.armor(world, npc), he = npc.sex === 'f' ? 'she' : 'he';
      ui.add('How strong are you these days?', () => {
        const kit = w || a ? `I carry ${w ? w.name.toLowerCase() : 'nothing much'}${a ? ` and wear ${a.name.toLowerCase()}` : ''}.` : 'Nothing worth the name to fight with, mind.';
        const went = npc.delves ? `I've been down into the dark ${npc.delves === 1 ? 'once' : npc.delves + ' times'}, and I came back stronger every time.` : KEEN[npc.prof] >= 2 ? 'One of these days I mean to go down into a dungeon and see what I\'m made of.' : 'Dungeons? Not for me. Not yet.';
        ui.say(`"${kit} ${went}"\n\n(${npc.first} is level ${L}.)`);
      });
      void he;
    },
    giftOption(world, npc, ent, pl, ui) {
      const spare = (pl.items || []).map(id => world.items[id]).filter(it => it && D.slot(it) && it.id !== pl.weapon && it.id !== pl.armor && it.id !== pl.bow);
      if (!spare.length || npc.status !== 'alive') return;
      ui.add('I have gear I don\'t use. Take it — no charge.', () => {
        ui.clear();
        ui.say(`${npc.first} looks over what you carry.`);
        for (const it of spare.slice(0, 10)) ui.add(`↳ Give ${it.name} (${it.kind === 'armor' ? 'armour ' + (it.def || 0) : (it.kind === 'bow' ? 'bow ' : 'damage ') + (it.dmg || 0)})${D.benefit(world, npc, it) > 0 ? ' ★' : ''}`, () => {
          const r = D.gift(world, pl, npc, it);
          if (!r) return;
          ui.say(r.how === 'wears' ? `${npc.first} ${it.kind === 'armor' ? 'buckles it on' : 'weighs it in ' + (npc.sex === 'f' ? 'her' : 'his') + ' hand'} at once. "This is… thank you. I won't forget it."\n\n(${npc.first} now ${it.kind === 'armor' ? 'wears' : 'carries'} it, and fights the better for it.)`
            : r.how === 'passed' ? `"Mine's better, but I know who needs this — ${r.wearer.first} ${r.wearer.last}. I'll see it gets to ${r.wearer.sex === 'f' ? 'her' : 'him'} today. That's good of you."`
              : `"Nobody here needs it, truth be told — but it'll fetch a fair price, and the coin will feed someone. Thank you."`);
          if (r.how === 'wears' && ent && ECHO.Spawner) { const e2 = ECHO.Spawner.makePerson(ECHO.Game, npc, ent.x, ent.y, ent.role); ent.hp = Math.max(ent.hp, e2.hp); ent.maxHp = e2.maxHp; ent.dmgMul = e2.dmgMul; ent.wdmg = e2.wdmg; ent.gear = Object.assign(ent.gear || {}, e2.gear); ent._plv = e2._plv; ent.gearLook = e2.gearLook; }
          ui.render();
        });
        ui.add('↳ Never mind.', () => ui.render());
      });
    },
    // The strongest of them, for the guide's board.
    top(world, n) {
      return P().alive(world).filter(m => m.status === 'alive' && (m.delves || 0) > 0).sort((a, b) => D.lv(b) - D.lv(a) || (b.delves || 0) - (a.delves || 0)).slice(0, n || 6);
    }
  };
})();
