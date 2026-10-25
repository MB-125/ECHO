// Patronage: what your money can do in the world.
//
// Coin is more than bread and arrows. In any town you can pay a master-at-arms
// to drill you (once a day), put a price on the head of one of the named
// monsters so that the realm's fighters go after it, arm and drill the town's
// guard so they rise faster and hold off raids, pay for walls, a watchtower or a
// granary, and throw a feast for the whole town. At a shrine you can buy a
// blessing (valour, warding, swiftness, fortune) for a few days; at a smithy you
// can commission a masterwork at your own level.
(function () {
  const { U } = ECHO;
  const P = () => ECHO.People, Pw = () => ECHO.Powers, Pr = () => ECHO.Prowess, UI = () => ECHO.UI;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cr = n => `<span class="gold">${U.fmt ? U.fmt(n) : n} cr</span>`;

  const Pa = ECHO.Patron = {
    lv(pl) { return Pr().level(pl); },
    pay(pl, n) { if (pl.gold < n) return false; pl.gold -= n; if (ECHO.Sfx) ECHO.Sfx.play('coin'); return true; },

    // ------------------------------------------------------------ a master-at-arms
    trainCost(pl) { return Math.round(20 + 1.6 * Math.pow(Pa.lv(pl), 1.35)); },
    trainXp(pl) { return Math.round(Pr().need(Pa.lv(pl)) * 0.3); },
    master(world, s) {
      return P().residents(world, s).filter(n => n.status === 'alive' && (n.prof === 'guard' || n.prof === 'soldier' || n.rival)).sort((a, b) => Pw().lvOf(b) - Pw().lvOf(a))[0] || null;
    },
    train(game, s) {
      const world = game.world, pl = game.pl;
      if (pl.trainedDay === world.day) return { error: 'You have drilled enough for one day. Come back tomorrow.' };
      const c = Pa.trainCost(pl);
      if (!Pa.pay(pl, c)) return { error: `It costs ${c} crowns.` };
      pl.trainedDay = world.day;
      const xp = Pa.trainXp(pl), ups = Pr().gain(pl, xp);
      for (const [k, v] of [['blade', 0.5], ['ward', 0.4], ['archery', 0.3], ['endurance', 0.3]]) ECHO.Character.train(pl, k, v);
      s.wealth = (s.wealth || 0) + c * 0.5;
      return { xp, ups };
    },

    // ------------------------------------------------------------ a price on a named monster's head
    bountyCost(r) { return Math.round(60 + r.lv * 10 + r.infl * 4); },
    postBounty(world, pl, r, s) {
      const c = Pa.bountyCost(r);
      if (!r || !r.alive) return 'It is already dead.';
      if (!Pa.pay(pl, c)) return `It costs ${c} crowns.`;
      r.bounty = (r.bounty || 0) + c; r.bountyDay = world.day; r.bountyTown = s.id;
      ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} put a price of ${r.bounty} crowns on the head of ${Pw().short(r)} in ${s.name}.`, importance: 1, sid: s.id, rep: 2 });
      return null;
    },

    // ------------------------------------------------------------ the town guard
    guards(world, s) { return P().residents(world, s).filter(n => n.status === 'alive' && (n.prof === 'guard' || n.prof === 'soldier')); },
    drillCost(world, s, pl) { return Math.round(40 + Pa.guards(world, s).length * (12 + Pa.lv(pl) * 2.5)); },
    drill(world, s, pl) {
      const G = Pa.guards(world, s);
      if (!G.length) return 'There is no guard here to drill.';
      if (s.drilled && world.day - s.drilled < 7) return 'They are still sore from the last drilling. In a few days.';
      const c = Pa.drillCost(world, s, pl);
      if (!Pa.pay(pl, c)) return `It costs ${c} crowns.`;
      const plv = Pw().plLv(world);
      for (const n of G) {
        const lv = Pw().lvOf(n), T = Pw().aim(world, n, plv);
        n.lv = Math.max(lv, Math.round(lv + Math.max(0, T - lv) * 0.5) + 2);
        n.skill.fight = Math.min(100, (n.skill.fight || 0) + 3);
      }
      s.drilled = world.day; s.wealth = (s.wealth || 0) + c * 0.4;
      ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} paid to arm and drill the guard of ${s.name}.`, importance: 1, sid: s.id, rep: 5, tag: 'protect' });
      return null;
    },

    // ------------------------------------------------------------ works for the town
    WORKS: {
      walls: { name: 'A palisade', cost: 320, desc: 'Raids by the named monsters break on them far more often, and the town stands longer in a war.' },
      watch: { name: 'A watchtower', cost: 180, desc: 'The roads near the town are safer, and raids are seen coming.' },
      granary: { name: 'A granary', cost: 140, desc: 'When hunger comes, the town eats from its stores.' }
    },
    workCost(s, k) { return Math.round(Pa.WORKS[k].cost * (1 + ((s.residents || []).length) / 120)); },
    fund(world, s, pl, k) {
      s.works = s.works || {};
      if (s.works[k]) return 'Already built.';
      const c = Pa.workCost(s, k);
      if (!Pa.pay(pl, c)) return `It costs ${c} crowns.`;
      s.works[k] = world.day || 1; if (k === 'granary' && s.stock) s.stock.food = (s.stock.food || 0) + 60; (s.patronWorks = s.patronWorks || []).push(k);
      ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} paid for ${Pa.WORKS[k].name.toLowerCase()} at ${s.name}.`, importance: 2, sid: s.id, rep: 8, tag: 'protect' });
      return null;
    },

    // ------------------------------------------------------------ a feast
    feastCost(s) { return Math.round(25 + (s.residents || []).length * 1.2); },
    feast(world, s, pl) {
      if (s.feastDay && world.day - s.feastDay < 7) return 'They are still talking about the last one. Next week.';
      const c = Pa.feastCost(s);
      if (!Pa.pay(pl, c)) return `It costs ${c} crowns.`;
      s.feastDay = world.day;
      s.unrest = Math.max(0, (s.unrest || 0) - 15); s.hunger = Math.max(0, (s.hunger || 0) - 0.1);
      for (const n of P().residents(world, s)) if (n.status === 'alive') n.op[pl.charId] = (n.op[pl.charId] || 0) + 4;
      if (ECHO.Wonders) ECHO.Wonders.charm(world, pl, 'wellfed', 1);
      ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} threw a feast for all of ${s.name}.`, importance: 1, sid: s.id, rep: 6 });
      return null;
    },

    // ------------------------------------------------------------ blessings at a shrine
    BLESS: {
      valour: { name: 'Blessing of Valour', desc: 'Every blow, arrow and flame of yours lands 15% harder.', days: 3 },
      warding: { name: 'Blessing of Warding', desc: 'You take 15% less from every blow.', days: 3 },
      swiftness: { name: 'Blessing of Swiftness', desc: 'You move 8% faster.', days: 3 },
      fortune: { name: 'Blessing of Fortune', desc: 'Merchants pay you 15% more for what you sell — gear too.', days: 3 }
    },
    blessCost(pl) { return Math.round(15 + 3 * Math.pow(Pa.lv(pl), 1.1)); },
    bless(world, pl, k) {
      const B = Pa.BLESS[k];
      if (!B) return 'No such blessing.';
      const c = Pa.blessCost(pl);
      if (!Pa.pay(pl, c)) return `It costs ${c} crowns.`;
      ECHO.Wonders.charm(world, pl, k, B.days);
      if (ECHO.PlayerCtl) ECHO.PlayerCtl.derivedT = 0;
      return null;
    },
    blessedUntil(world, pl, k) { const c = (pl.charms || []).find(x => x.kind === k && x.until > world.day); return c ? c.until : 0; },
    shrineHtml(world, pl) {
      const c = Pa.blessCost(pl);
      return `<h4 class="ware-h" style="margin-top:12px">Blessings — ${cr(c)} each, for three days</h4><div class="list">${Object.entries(Pa.BLESS).map(([k, B]) => {
        const u = Pa.blessedUntil(world, pl, k);
        return `<div class="card"><h4>${esc(B.name)}${u ? ` <span class="gold">· on you, ${u - world.day} day${u - world.day > 1 ? 's' : ''} more</span>` : ''}</h4><div class="dim">${esc(B.desc)}</div><div class="row"><button data-bless="${k}" ${pl.gold < c ? 'disabled' : ''}>${u ? 'Renew it' : 'Receive it'}</button></div></div>`;
      }).join('')}</div>`;
    },

    // ------------------------------------------------------------ a masterwork from the smith
    RAR: { epic: 2.6, legendary: 6 },
    masterCost(pl, kind, rarity) {
      if (kind === 'armor') return Math.round(Pa.masterCost(pl, 'sword', rarity) * 1.15);   // (armour sells by twice its number; it should not cost twice as much to have made)
      const L = Math.max(1, Pa.lv(pl)), R = ECHO.Gear.rarity(rarity);
      const stat = kind === 'armor' ? Math.round((4 + L * 4) * R.mult) : Math.round((kind === 'bow' ? 13 : 12) + L * 3.2 * R.mult + (R.mult - 1) * 10);
      const val = ECHO.Gear.value({ kind, rarity, dmg: kind === 'armor' ? 0 : stat, def: kind === 'armor' ? stat : 0, affix: 'x' });
      return Math.round(val * Pa.RAR[rarity] + 50);
    },
    commission(world, pl, s, kind, rarity) {
      if (rarity === 'legendary' && Pa.lv(pl) < 20) return { error: 'No smith will try a legendary piece for someone so young in the trade of killing. Come back at level 20.' };
      const c = Pa.masterCost(pl, kind, rarity);
      if (!Pa.pay(pl, c)) return { error: `It costs ${c} crowns.` };
      const rng = new ECHO.RNG((Math.random() * 4294967295) >>> 0);
      let it = null;
      for (let k = 0; k < 6 && (!it || !it.affix); k++) {   // (a masterwork always carries a property)
        if (it) { delete world.items[it.id]; }
        it = ECHO.Gear.make(world, rng, kind, Pa.lv(pl), rarity, '');
      }
      it.holder = 'player'; it.history = [{ d: world.day, t: `made to your order by the smith of ${s.name}` }];
      pl.items.push(it.id);
      s.wealth = (s.wealth || 0) + c * 0.3;
      if (rarity === 'legendary') ECHO.Chronicle.deed(world, { text: `The smith of ${s.name} made ${pl.first} ${pl.last} a legendary piece: ${it.name}.`, importance: 1, sid: s.id, rep: 2 });
      return { item: it, cost: c };
    },
    smithHtml(pl) {
      const can = r => r === 'epic' || Pa.lv(pl) >= 20;
      const row = (kind, label) => `<div class="card"><h4>${label}</h4><div class="row" style="gap:6px;flex-wrap:wrap">${['epic', 'legendary'].map(r => { const c = Pa.masterCost(pl, kind, r); return `<button data-commission="${kind}:${r}" ${pl.gold < c || !can(r) ? 'disabled' : ''}><span style="color:${ECHO.Gear.rarity(r).color}">${U.cap(r)}</span> — ${cr(c)}</button>`; }).join('')}</div></div>`;
      return `<h4 class="ware-h">Commission a masterwork</h4><p class="dim">"Pay me well enough and I'll make you something worth the name — at your own strength, with a property of its own." Epic or legendary (from level 20); the smith picks the shape and the property.</p><div class="list">${row('sword', 'A weapon')}${row('bow', 'A bow')}${row('armor', 'Armour')}</div>`;
    },

    // ------------------------------------------------------------ the board: "Spend your coin"
    html(game, s) {
      const world = game.world, pl = game.pl, m = Pa.master(world, s), tc = Pa.trainCost(pl);
      let h = `<p class="dim">What your coin can do here — for you, and for ${esc(s.name)}. You have ${cr(Math.floor(pl.gold))}.</p><div class="list">`;
      // training
      h += `<div class="card"><h4>Drill with ${m ? esc(m.first + ' ' + m.last) + ` (level ${Pw().lvOf(m)})` : 'the master-at-arms'} — ${cr(tc)}</h4><div class="dim">A hard day's work with blade, shield and bow: about a third of a level's experience (+${U.fmt ? U.fmt(Pa.trainXp(pl)) : Pa.trainXp(pl)} xp), and your skills sharpen. Once a day.</div><div class="row"><button data-pt="train" ${pl.gold < tc || pl.trainedDay === world.day ? 'disabled' : ''}>${pl.trainedDay === world.day ? 'Done for today' : 'Train'}</button></div></div>`;
      // the guard
      const G = Pa.guards(world, s);
      if (G.length) {
        const dc = Pa.drillCost(world, s, pl), soon = s.drilled && world.day - s.drilled < 7;
        h += `<div class="card"><h4>Arm and drill the town guard — ${cr(dc)}</h4><div class="dim">${G.length} guard${G.length > 1 ? 's' : ''} (levels ${G.map(n => Pw().lvOf(n)).sort((a, b) => b - a).join(', ')}). They jump half the way to what they could be, and for a month after they keep rising twice as fast — and hold off raids better.</div><div class="row"><button data-pt="drill" ${pl.gold < dc || soon ? 'disabled' : ''}>${soon ? 'Drilled this week' : 'Pay for it'}</button></div></div>`;
      }
      // works
      s.works = s.works || {};
      const todo = Object.keys(Pa.WORKS).filter(k => !s.works[k]);
      if (todo.length) h += `<div class="card"><h4>Build for the town</h4>${todo.map(k => { const c = Pa.workCost(s, k); return `<div style="margin:4px 0"><b>${esc(Pa.WORKS[k].name)}</b> — ${cr(c)} <span class="dim">${esc(Pa.WORKS[k].desc)}</span> <button class="small" data-pt="work:${k}" ${pl.gold < c ? 'disabled' : ''}>Pay for it</button></div>`; }).join('')}<div class="dim" style="font-size:12px">Your name is carved over what you pay for, and the town remembers.</div></div>`;
      // feast
      const fc = Pa.feastCost(s), fsoon = s.feastDay && world.day - s.feastDay < 7;
      h += `<div class="card"><h4>Throw a feast for ${esc(s.name)} — ${cr(fc)}</h4><div class="dim">Bread, meat and ale for everyone: unrest falls, hunger eases, everyone here thinks better of you, and you go away well fed.</div><div class="row"><button data-pt="feast" ${pl.gold < fc || fsoon ? 'disabled' : ''}>${fsoon ? 'Feasted this week' : 'Throw it'}</button></div></div>`;
      h += `</div>`;
      // bounties on the named
      const named = Pw() ? Pw().alive(world).sort((a, b) => U.dist(a.x, a.y, s.x, s.y) - U.dist(b.x, b.y, s.x, s.y)).slice(0, 6) : [];
      if (named.length) {
        h += `<h4 class="ware-h">Put a price on a head</h4><p class="dim">The realm's fighters go after a named monster with a price on it — soon, and in numbers. If you kill it yourself, you take your coin back.</p><div class="list">`;
        h += named.map(r => { const c = Pa.bountyCost(r); return `<div class="card"><b>${esc(Pw().label(r))}</b> — level ${r.lv}, ${Math.round(U.dist(r.x, r.y, s.x, s.y))} leagues off${r.bounty ? ` · <span class="gold">${r.bounty} crowns on its head</span>` : ''}<div class="row"><button class="small" data-pt="bounty:${r.id}" ${pl.gold < c ? 'disabled' : ''}>${r.bounty ? 'Raise the price' : 'Post a bounty'} — ${cr(c)}</button></div></div>`; }).join('');
        h += `</div>`;
      }
      return h;
    },
    act(game, s, a) {
      const world = game.world, pl = game.pl, toast = (t, k) => UI().toast(t, k || 'info', 4);
      if (a === 'train') {
        const r = Pa.train(game, s);
        if (r.error) return toast(r.error, 'warn');
        toast(`A hard day in the yard. +${r.xp} experience${r.ups.length ? ' — you rise to level ' + Pr().level(pl) + '!' : ''}`, 'legend');
        for (const u of r.ups) ECHO.Progress.levelUp(game, u);
      } else if (a === 'drill') { const e = Pa.drill(world, s, pl); toast(e || `The guard of ${s.name} drills in new mail with new blades. They will not forget who paid for it.`, e ? 'warn' : 'legend'); }
      else if (a === 'feast') { const e = Pa.feast(world, s, pl); toast(e || `The tables groan, the ale flows, and ${s.name} sings your name until late.`, e ? 'warn' : 'legend'); }
      else if (a.startsWith('work:')) { const k = a.slice(5), e = Pa.fund(world, s, pl, k); toast(e || `${Pa.WORKS[k].name} for ${s.name}, paid for by you.`, e ? 'warn' : 'legend'); }
      else if (a.startsWith('bounty:')) { const r = Pw().byId(world, a.slice(7)), e = Pa.postBounty(world, pl, r, s); toast(e || `The notice goes up: ${r.bounty} crowns for the head of ${Pw().short(r)}. The fighters of the realm will be after it.`, e ? 'warn' : 'legend'); }
    }
  };
  if (ECHO.Wonders && ECHO.Wonders.CHARMS) Object.assign(ECHO.Wonders.CHARMS, {
    valour: { name: 'Valour', desc: 'Every blow, arrow and flame of yours lands 15% harder.' },
    warding: { name: 'Warding', desc: 'You take 15% less from every blow.' },
    swiftness: { name: 'Swiftness', desc: 'You move 8% faster.' }
  });
})();
