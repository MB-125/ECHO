// Mana jewellery: the straight way to more mana, for those who can pay.
//
// The arcanist in any market keeps a locked case of rings and amulets cut for mana, and
// sells them for crowns alone — never for less than a million, whatever the town:
//   • a RING keeps your mana coming back: a share of all you can hold, every second, and a
//     steady stream on top;
//   • an AMULET lets you hold more: a share more than you hold now, and a store on top.
// One of each is worn (it is on you the moment it is bought). A better one takes the old
// in part payment, at half what it cost. They are kept in `pl.manaGear` ({ring, amulet}: 0
// for none, else 1–5), made the first time it is needed; nothing else in a save changes.
(function () {
  const { U } = ECHO;
  const MIN = 1000000;

  const MW = ECHO.ManaWear = {
    MIN,
    RINGS: [
      null,
      { name: 'Ring of the Spring', price: 1000000, pct: 0.02, flat: 15, col: '#8fd0ff' },
      { name: 'Ring of the Wellspring', price: 3000000, pct: 0.04, flat: 40, col: '#7ab8ff' },
      { name: 'Ring of the Deep Current', price: 8000000, pct: 0.07, flat: 100, col: '#5a9cff' },
      { name: 'Ring of the Tide', price: 20000000, pct: 0.11, flat: 250, col: '#8a7aff' },
      { name: 'Ring of the Endless Sea', price: 50000000, pct: 0.16, flat: 600, col: '#c08aff' }
    ],
    AMULETS: [
      null,
      { name: 'Amulet of the Cup', price: 1000000, pct: 0.3, flat: 300, col: '#8fd0ff' },
      { name: 'Amulet of the Basin', price: 3000000, pct: 0.6, flat: 700, col: '#7ab8ff' },
      { name: 'Amulet of the Cistern', price: 8000000, pct: 1.0, flat: 1500, col: '#5a9cff' },
      { name: 'Amulet of the Lake', price: 20000000, pct: 1.5, flat: 3500, col: '#8a7aff' },
      { name: 'Amulet of the Sea', price: 50000000, pct: 2.25, flat: 8000, col: '#c08aff' }
    ],
    st(pl) { return pl.manaGear || (pl.manaGear = { ring: 0, amulet: 0 }); },
    list(kind) { return kind === 'ring' ? MW.RINGS : MW.AMULETS; },
    worn(pl, kind) { const s = pl.manaGear; const n = s ? s[kind] | 0 : 0; return n > 0 ? MW.list(kind)[n] || null : null; },
    // what it costs here: the town's prices move it, but never below a million
    price(kind, n, am = 1) { const P = MW.list(kind)[n]; return P ? Math.max(MIN, Math.round(P.price * (am || 1))) : Infinity; },
    // a better one takes the old in part payment, at half what it cost
    tradeIn(pl, kind) { const s = MW.st(pl), n = s[kind] | 0; return n > 0 ? Math.round(MW.list(kind)[n].price / 2) : 0; },
    cost(pl, kind, n, am = 1) { return Math.max(0, MW.price(kind, n, am) - MW.tradeIn(pl, kind)); },
    // why it cannot be bought (null: it can)
    why(pl, kind, n, am = 1) {
      const P = MW.list(kind)[n];
      if (!P) return 'The arcanist has nothing like that.';
      const s = MW.st(pl);
      if ((s[kind] | 0) >= n) return (s[kind] | 0) === n ? 'You are wearing it.' : 'You wear a better one.';
      const c = MW.cost(pl, kind, n, am);
      if ((pl.gold || 0) < c) return `It costs ${MW.fmt(c)} crowns; you have ${MW.fmt(Math.floor(pl.gold || 0))}.`;
      return null;
    },
    buy(game, kind, n, am = 1) {
      const pl = game.pl, why = MW.why(pl, kind, n, am);
      if (why) return why;
      const c = MW.cost(pl, kind, n, am), s = MW.st(pl);
      pl.gold -= c; s[kind] = n;
      if (ECHO.PlayerCtl && ECHO.PlayerCtl.computeDerived) { ECHO.PlayerCtl.derivedT = 0; ECHO.PlayerCtl.computeDerived(game); }
      if (kind === 'amulet') pl.mana = Math.min(pl.maxMana, (pl.mana || 0) + pl.maxMana * 0.5);
      const pe = game.pe;
      if (pe && ECHO.Combat) { ECHO.Combat.ring(pe.x, pe.y, 1.6, 'rgba(122,184,255,0.9)', 0.6); ECHO.Combat.burst(pe.x, pe.y, MW.list(kind)[n].col, 18, 3, 0.6, 2); }
      return { cost: c, item: MW.list(kind)[n] };
    },

    // ------------------------------------------------------------ what they do (player.js)
    maxMana(pl, base) { const A = MW.worn(pl, 'amulet'); return A ? Math.round(base * (1 + A.pct) + A.flat) : base; },
    regen(pl) { const R = MW.worn(pl, 'ring'); return R ? (pl.maxMana || 60) * R.pct + R.flat : 0; },
    line(kind, P) { return kind === 'ring' ? `+${Math.round(P.pct * 100)}% of all your mana back every second, and +${P.flat} more` : `hold ${Math.round(P.pct * 100)}% more mana, and +${MW.fmt(P.flat)} more`; },
    fmt(n) { return Math.round(n).toLocaleString('en-US'); },

    // ------------------------------------------------------------ shown
    // the arcanist's case, in the market
    marketHtml(pl, am = 1) {
      const s = MW.st(pl), esc = U.esc || (x => String(x));
      const card = (kind, n) => {
        const P = MW.list(kind)[n], have = s[kind] | 0, c = MW.cost(pl, kind, n, am), full = MW.price(kind, n, am), why = MW.why(pl, kind, n, am);
        const tag = have === n ? '<span class="gold">worn</span>' : have > n ? '<span class="dim">you wear better</span>' : `<span class="gold">${MW.fmt(c)} cr</span>${have ? ` <span class="dim">(${MW.fmt(full)} less ${MW.fmt(MW.tradeIn(pl, kind))} for yours)</span>` : ''}`;
        return `<div class="ware${n >= 4 ? ' featured' : ''}"><div class="ware-ic" style="color:${P.col}">${kind === 'ring' ? '◍' : '◈'}</div><div class="ware-main"><div class="ware-top"><b style="color:${P.col}">${esc(P.name)}</b>${tag}</div><div class="ware-use">${MW.line(kind, P)}.</div>${have < n ? `<div class="row"><button class="small" data-mwbuy="${kind}:${n}" ${why ? 'disabled' : ''}>${have ? 'Trade up' : 'Buy and wear'}</button>${why ? `<span class="dim" style="font-size:12px">${esc(why)}</span>` : ''}</div>` : ''}</div></div>`;
      };
      return `<h4 class="ware-h" style="color:#7ab8ff">◍ The arcanist's case — mana rings and amulets <span class="dim">· from ${MW.fmt(MIN)} crowns</span></h4>
        <p class="dim">The straight way to more mana. A <b>ring</b> brings your mana back faster; an <b>amulet</b> lets you hold more. One of each is worn, from the moment it is bought; a better one takes yours in part payment, at half what it cost.</p>
        <div class="wares">${[1, 2, 3, 4, 5].map(n => card('ring', n)).join('')}</div>
        <div class="wares">${[1, 2, 3, 4, 5].map(n => card('amulet', n)).join('')}</div>`;
    },
    // on your character page, with your sword and armour
    equipHtml(pl) {
      const row = (kind, P) => `<div class="gear-slot"><div class="ware-ic" style="color:${P ? P.col : '#5a5248'};font-size:26px;width:44px;text-align:center">${kind === 'ring' ? '◍' : '◈'}</div><div>${P ? `<b style="color:${P.col}">${P.name}</b><div style="font-size:13px">${MW.line(kind, P)}</div>` : `<span class="dim">no mana ${kind} — the arcanist in any market sells them, from ${MW.fmt(MIN)} crowns</span>`}</div></div>`;
      return row('ring', MW.worn(pl, 'ring')) + row('amulet', MW.worn(pl, 'amulet'));
    }
  };
})();
