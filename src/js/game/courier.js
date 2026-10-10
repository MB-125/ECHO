// Carrying: the post between towns, and a trader's ledger.
//
// Every notice board has a Deliveries tab: letters, parcels, fragile crates
// and urgent packets for other towns, paid by the distance and the trouble.
// Carry them to that town and hand them to the innkeeper (or open its notice
// board) before they're due. A fragile crate cracks if you take a heavy blow
// or go swimming with it; an urgent one pays double but won't wait. Walk the
// markets and your ledger remembers what everything cost where, so a trader
// can buy where it's cheap and sell where it's dear.
(function () {
  const { U } = ECHO;
  const P = ECHO.Pastimes;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const KINDS = {
    letter: { name: 'a sealed letter', pay: 0.6, icon: '✉' },
    parcel: { name: 'a parcel', pay: 1, icon: '📦' },
    fragile: { name: 'a crate of glassware', pay: 1.6, icon: '🏺', fragile: true },
    urgent: { name: 'an urgent packet', pay: 1.8, icon: '⚡', urgent: true },
    guild: { name: 'a sealed guild chest', pay: 3.2, icon: '🧰', fragile: true }
  };
  const C = ECHO.Courier = {
    KINDS,
    st(world) { return (world.post = world.post || { offers: {}, seq: 0 }); },
    max(pl) { return P.level(pl, 'courier') >= 3 ? 4 : 3; },
    offers(world, s, pl) {
      const S = C.st(world);
      let o = S.offers[s.id];
      if (!o || world.day - o.day >= 2) {
        o = S.offers[s.id] = { day: world.day, list: [] };
        const others = world.settlements.filter(t => t.id !== s.id).sort((a, b) => U.dist(a.x, a.y, s.x, s.y) - U.dist(b.x, b.y, s.x, s.y));
        const lv = P.level(pl, 'courier');
        const kinds = ['letter', 'parcel', 'fragile', 'urgent'];
        for (let i = 0; i < 4 && others.length; i++) {
          const t = others[Math.min(others.length - 1, Math.floor(Math.random() * Math.min(others.length, 6)))];
          let kind = kinds[Math.floor(Math.random() * kinds.length)];
          if (i === 3 && lv >= 9) kind = 'guild';
          const dist = U.dist(t.x, t.y, s.x, s.y);
          const days = Math.max(1, Math.ceil(dist / 45)) + (KINDS[kind].urgent ? 0 : 1);
          let pay = Math.round((8 + dist * 0.45) * KINDS[kind].pay * (1 + lv * 0.04));
          if (KINDS[kind].urgent && lv >= 5) pay *= 2;
          o.list.push({ id: 'post' + (++S.seq), from: s.id, fromName: s.name, to: t.id, toName: t.name, kind, pay, days, dist: Math.round(dist), taken: false });
        }
      }
      return o.list;
    },
    accept(game, s, id) {
      const world = game.world, pl = game.pl;
      const q = C.offers(world, s, pl).find(x => x.id === id);
      if (!q || q.taken) return 'Already taken.';
      pl.parcels = pl.parcels || [];
      if (pl.parcels.length >= C.max(pl)) return `You can carry ${C.max(pl)} at once.`;
      q.taken = true;
      const p = Object.assign({}, q, { due: world.day + q.days, damaged: false });
      pl.parcels.push(p);
      const t = world.settlements.find(x => x.id === p.to);
      if (t && (!pl.tracked || pl.tracked.startsWith('mark:'))) { pl.tracked = `mark:${t.x.toFixed(1)}:${t.y.toFixed(1)}:Deliver to ${t.name}`; if (ECHO.Purpose) { ECHO.Purpose._html = null; ECHO.Purpose.t = 0; } }
      return null;
    },
    // hand over everything for this town
    deliver(game, s, quiet) {
      const world = game.world, pl = game.pl;
      const mine = (pl.parcels || []).filter(p => p.to === s.id);
      if (!mine.length) return 0;
      let total = 0; const lines = [];
      for (const p of mine) {
        let pay = p.pay;
        const late = world.day > p.due;
        if (late) pay = Math.round(pay * (KINDS[p.kind].urgent ? 0.25 : 0.5));
        if (p.damaged) pay = Math.round(pay * 0.3);
        total += pay;
        lines.push(`${KINDS[p.kind].icon} ${KINDS[p.kind].name} from ${p.fromName}: ${pay} crowns${late ? ' (late)' : ''}${p.damaged ? ' (damaged)' : ''}`);
        P.gain(game, 'courier', 5 + Math.round(p.dist / 12) + (late || p.damaged ? 0 : 3));
        s.rep = s.rep || {}; s.rep[pl.charId] = U.clamp((s.rep[pl.charId] || 0) + (P.level(pl, 'courier') >= 7 ? 2 : 1), -100, 100);
      }
      pl.parcels = pl.parcels.filter(p => p.to !== s.id);
      pl.gold += total;
      pl.stats = pl.stats || {}; pl.stats.delivered = (pl.stats.delivered || 0) + mine.length;
      if (pl.tracked && pl.tracked.startsWith('mark:') && pl.tracked.endsWith(`Deliver to ${s.name}`)) {
        const next = pl.parcels[0] && world.settlements.find(x => x.id === pl.parcels[0].to);
        pl.tracked = next ? `mark:${next.x.toFixed(1)}:${next.y.toFixed(1)}:Deliver to ${next.name}` : null;
      }
      ECHO.Sfx.play('coin');
      if (!quiet) ECHO.UI.toast(`Delivered in ${s.name}: ${lines.join('; ')}.`, 'legend', 6);
      return total;
    },
    boardHtml(world, s, pl) {
      const list = C.offers(world, s, pl);
      const mine = pl.parcels || [];
      let html = `<p class="dim">The post: carry these to other towns and hand them to the innkeeper there before they're due. Carrying ${P.level(pl, 'courier')} · ${esc(P.rank(pl, 'courier'))}. You carry ${mine.length} of ${C.max(pl)}.</p><div class="list">`;
      html += list.map(q => { const K = KINDS[q.kind]; return `<div class="card"><h4>${K.icon} ${esc(U.cap(K.name))} for ${esc(q.toName)}</h4><div class="dim">${q.dist} leagues · due in ${q.days} day${q.days > 1 ? 's' : ''}${K.fragile ? ' · fragile: no heavy blows, no swimming' : ''}${K.urgent ? ' · urgent: late pays a quarter' : ''}</div><div class="gold">${q.pay} crowns</div><div class="row">${q.taken ? '<span class="dim">taken</span>' : `<button class="small" data-post="${q.id}" ${mine.length >= C.max(pl) ? 'disabled' : ''}>Take it</button>`}</div></div>`; }).join('');
      html += '</div>';
      if (mine.length) html += `<h4 class="ware-h">In your bag</h4>${mine.map(p => `<div class="card">${KINDS[p.kind].icon} ${esc(U.cap(KINDS[p.kind].name))} for <b>${esc(p.toName)}</b> <span class="${world.day > p.due ? 'ember' : 'dim'}">${world.day > p.due ? 'late' : `due in ${p.due - world.day} day${p.due - world.day === 1 ? '' : 's'}`}</span>${p.damaged ? ' <span class="ember">damaged</span>' : ''}</div>`).join('')}`;
      return html;
    },
    // ------------------------------------------------------------ the ledger
    note(world, pl, s) {
      pl.ledger = pl.ledger || {};
      const pr = {};
      for (const g of ['food', 'herbs', 'ore', 'timber', 'arms']) pr[g] = s.prices[g];
      pl.ledger[s.id] = { day: world.day, name: s.name, prices: pr };
    },
    ledgerHtml(game) {
      const world = game.world, pl = game.pl, L = pl.ledger || {};
      const rows = Object.values(L);
      let html = `<h4 class="ware-h">✉ The post</h4>`;
      const mine = pl.parcels || [];
      html += mine.length ? `<div class="card">${mine.map(p => `<div>${KINDS[p.kind].icon} for <b>${esc(p.toName)}</b> — ${p.pay} crowns, ${world.day > p.due ? '<span class="ember">late</span>' : `due in ${p.due - world.day} day(s)`}${p.damaged ? ' <span class="ember">damaged</span>' : ''}</div>`).join('')}</div>` : '<p class="dim">Nothing in your bag. Notice boards have a Deliveries tab.</p>';
      html += `<h4 class="ware-h">⚖ Your trade ledger</h4>`;
      if (!rows.length) return html + '<p class="dim">Visit markets and your ledger will remember their prices.</p>';
      const goods = ['food', 'herbs', 'ore', 'timber', 'arms'];
      const best = {};
      for (const g of goods) { const v = rows.map(r => r.prices[g]); best[g] = { lo: Math.min(...v), hi: Math.max(...v) }; }
      html += `<div class="card" style="overflow-x:auto"><table class="ledger"><tr><th>Market</th>${goods.map(g => `<th>${ECHO.GOODS[g].name}</th>`).join('')}<th>seen</th></tr>${rows.sort((a, b) => b.day - a.day).map(r => `<tr><td>${esc(r.name)}</td>${goods.map(g => { const v = r.prices[g]; return `<td class="${v === best[g].lo && best[g].hi > best[g].lo ? 'cheap' : v === best[g].hi && best[g].hi > best[g].lo ? 'dear' : ''}">${U.round1(v)}</td>`; }).join('')}<td class="dim">${world.day - r.day === 0 ? 'today' : world.day - r.day + 'd ago'}</td></tr>`).join('')}</table><div class="dim" style="margin-top:4px"><span class="cheap">green</span>: cheapest you've seen · <span class="dear">gold</span>: dearest. Prices move every day.</div></div>`;
      return html;
    },
    // ------------------------------------------------------------ each frame
    tick(game, dt) {
      const pl = game.pl, pe = game.pe;
      const ps = pl.parcels;
      if (!ps || !ps.length) { C.hp = pl.hp; return; }
      const fragile = ps.filter(p => KINDS[p.kind].fragile && !p.damaged);
      if (fragile.length) {
        const jolt = C.hp != null && C.hp - pl.hp >= 12;
        if (pe.swimming || (jolt && Math.random() < 0.5)) {
          for (const p of fragile) p.damaged = true;
          game.ui.toast(pe.swimming ? 'The river gets into your fragile load. Something inside is ruined.' : 'Something cracks in your pack. The fragile load is damaged.', 'warn', 4);
        }
      }
      C.hp = pl.hp;
    }
  };
  P.extraTick = P.extraTick || [];
  P.extraTick.push((game, dt) => C.tick(game, dt));
  P.extraHtml = P.extraHtml || [];
  P.extraHtml.push(game => C.ledgerHtml(game));
  P.extra = P.extra || [];
  P.extra.push((world, npc, ent, pl, d) => {
    const s = ECHO.Sim.settlement(world, npc.loc);
    if (s && npc.prof === 'innkeeper' && (pl.parcels || []).some(p => p.to === s.id)) d.add('I have the post for this town.', () => { const got = C.deliver(ECHO.Game, s, true); d.say(`${npc.first} signs for it all and counts out ${got} crowns. "The roads are long — thank you for bringing it."`); d.render(); });
  });
})();
