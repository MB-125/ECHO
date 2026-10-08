// Property, work and money: houses and workplaces belong to someone. Owners
// pay wages and collect rent; the poor borrow and sometimes lose their homes
// for it; when someone dies, their house, savings, land, business and debts
// pass to their heirs (and sometimes start a family quarrel). You can buy or
// rent a house, buy fields worked by tenants, invest in a mill or mine, and
// lend money — and all of it is exposed to fire, plague, drought and war.
(function () {
  const { U } = ECHO;
  const P = () => ECHO.People;
  const S = () => ECHO.Sim;

  const WORKPLACE_PROF = { mill: 'miller', mine: 'miner', lumber: 'woodcutter', smithy: 'smith', inn: 'innkeeper' };

  const Pp = ECHO.Property = {
    houses(s) { return s.buildings.filter(b => b.type === 'house'); },
    houseValue(s) { return Math.round(70 + (s.prosperity || 50) * 1.2 + (s.kind === 'capital' ? 60 : 0)); },
    businessValue(world, s, b) { return Math.round({ mill: 160, mine: 150, lumber: 70, smithy: 140, inn: 170 }[b.type] * (0.6 + (s.prosperity || 50) / 125)); },
    // where a person lives
    homeOf(world, n) {
      const s = S().settlement(world, n.loc || n.home);
      if (!s) return null;
      const byId = id => id && s.buildings.find(b => b.id === id);
      return byId(n.house) || byId(n.lodge) || (n.spouse && world.npcs[n.spouse] && byId(world.npcs[n.spouse].house)) || n.parents.map(id => world.npcs[id]).filter(Boolean).map(p => byId(p.house) || byId(p.lodge)).find(Boolean) || null;
    },

    // Hand out deeds in a world that has none yet.
    ensure(world) {
      if (world._prop >= 1) return;
      world._prop = 1;
      for (const s of world.settlements) Pp.assignTown(world, s);
    },
    assignTown(world, s) {
      const pl = world.player;
      const free = Pp.houses(s).filter(b => !b.legend && !(pl && b.owner === pl.charId) && !b.npcOwner);
      const res = P().residents(world, s);
      const heads = res.filter(n => n.prof !== 'child' && P().age(world, n) >= 18 && !(n.spouse && world.npcs[n.spouse] && world.npcs[n.spouse].house))
        .sort((a, b) => (b.wealth + (b.spouse ? 30 : 0)) - (a.wealth + (a.spouse ? 30 : 0)));
      for (const n of heads) {
        if (n.house || (n.spouse && world.npcs[n.spouse] && world.npcs[n.spouse].house)) continue;
        if (n.parents.some(id => world.npcs[id] && world.npcs[id].status === 'alive' && world.npcs[id].loc === s.id) && !n.spouse) continue; // still living with parents
        const b = free.shift();
        if (!b) break;
        b.npcOwner = n.id; b.value = Pp.houseValue(s); n.house = b.id;
      }
      // whoever is left over lodges with someone and pays rent
      const owned = Pp.houses(s).filter(b => b.npcOwner);
      for (const n of heads) if (!Pp.homeOf(world, n) && owned.length) n.lodge = owned[ECHO.hashStr(n.id) % owned.length].id;
      // workplaces
      for (const b of s.buildings) {
        const prof = WORKPLACE_PROF[b.type];
        if (!prof || b.npcOwner) continue;
        const cand = res.filter(n => n.prof === prof).sort((a, c) => c.wealth - a.wealth)[0] || (b.type === 'mine' ? res.filter(n => n.prof === 'merchant').sort((a, c) => c.wealth - a.wealth)[0] : null);
        b.npcOwner = cand ? cand.id : (s.ruler || null);
      }
      // fields for farmers
      for (const n of res) if (n.prof === 'farmer' && n.land == null) n.land = 1 + (ECHO.hashStr(n.id) % 3);
    },

    // ---------------------------------------------------------------- daily money
    dailyTick(world, rng) {
      Pp.ensure(world);
      const pl = world.player;
      for (const s of world.settlements) {
        const res = P().residents(world, s);
        const counts = s._counts || {};
        // --- workplaces: revenue to the owner, wages to the workers, a cut to investors
        for (const b of s.buildings) {
          const prof = WORKPLACE_PROF[b.type];
          if (!prof) continue;
          const workers = res.filter(n => n.prof === prof && !n.sick && !((n.jailUntil || 0) > world.day));
          const running = !b.fac || b.fac.state === 'working' || b.fac.state === 'damaged';
          let revenue = running ? workers.length * (b.type === 'inn' ? 2.2 : b.type === 'smithy' ? 2.0 : 1.6) * (0.5 + (s.prosperity || 50) / 100) * (b.fac && b.fac.state === 'damaged' ? 0.5 : 1) : 0;
          if (b.type === 'mill' && ECHO.Weather) revenue *= ECHO.Weather.cropMult(world, s);
          const owner = b.npcOwner && world.npcs[b.npcOwner];
          // investors take their share first
          if (b.shares && revenue > 0) for (const sh of b.shares) {
            const cut = revenue * sh.frac;
            revenue -= cut;
            if (pl && sh.char === pl.charId) Pp.income(world, pl, cut, `${U.cap(b.type === 'lumber' ? 'lumber camp' : b.type)} of ${s.name}`);
          }
          if (owner && owner.status === 'alive') {
            owner.wealth += revenue;
            for (const w of workers) {
              if (w === owner) continue;
              if (owner.wealth > 1) { owner.wealth -= 0.9; w.wealth += 0.9; w.unpaid = 0; }
              else if ((w.unpaid = (w.unpaid || 0) + 1) > 10 && rng.chance(0.1)) { w.prof = 'farmer'; w.unpaid = 0; P().remember(world, w, `quit the ${b.type} when the wages stopped`, 'change', null, 2); }
            }
          } else s.wealth = (s.wealth || 0) + revenue * 0.5;
        }
        // --- rent from lodgers
        for (const n of res) {
          if (!n.lodge || n.prof === 'child') continue;
          const b = s.buildings.find(x => x.id === n.lodge);
          const o = b && b.npcOwner && world.npcs[b.npcOwner];
          if (!o || o === n) { n.lodge = null; continue; }
          if (n.wealth >= 0.3) { n.wealth -= 0.3; o.wealth += 0.3; }
          else n.arrears = (n.arrears || 0) + 0.3;
        }
        // --- debt
        for (const n of res) {
          if (n.prof === 'child') continue;
          if (n.debt) Pp.serviceDebt(world, rng, n, s);
          else if (n.wealth < 1 && (n.starve > 2 || (n.arrears || 0) > 3) && P().age(world, n) > 18 && rng.chance(0.15)) Pp.borrow(world, rng, n, s);
        }
        // --- the housing market: empty houses are sold to those who can pay
        for (const b of Pp.houses(s)) {
          if (b.npcOwner || b.legend || (pl && b.owner === pl.charId)) continue;
          b.value = b.value || Pp.houseValue(s);
          const buyer = res.filter(n => !n.house && n.prof !== 'child' && P().age(world, n) > 18 && n.wealth > b.value * 1.1).sort((a, c) => c.wealth - a.wealth)[0];
          if (buyer && rng.chance(0.1)) {
            buyer.wealth -= b.value; s.wealth = (s.wealth || 0) + b.value; b.npcOwner = buyer.id; buyer.house = b.id; buyer.lodge = null;
            P().remember(world, buyer, `bought a house in ${s.name}`, 'pride', null, 2);
          }
        }
      }
      // --- player-held fields and rented houses
      if (pl && pl.fields) for (const f of pl.fields) {
        const s = S().settlement(world, f.sid);
        if (!s) continue;
        const season = ECHO.TIME.dateOf(world.day).seasonIdx;
        const yieldF = [0.75, 1.15, 1.55, 0.4][season] * (s.cropFactor || 1) * (ECHO.Weather ? ECHO.Weather.cropMult(world, s) : 1);
        Pp.income(world, pl, f.n * 1.2 * yieldF * s.prices.food / 4 * 0.5, `Fields at ${s.name}`);
      }
    },
    income(world, pl, amt, source) {
      if (!(amt > 0)) return;
      pl.gold += amt;
      pl.ledger = pl.ledger || {};
      const k = source;
      pl.ledger[k] = pl.ledger[k] || { week: 0, total: 0, last: world.day };
      const L = pl.ledger[k];
      if (world.day - (L.weekStart || 0) >= 7) { L.prevWeek = L.week; L.week = 0; L.weekStart = world.day; }
      L.week += amt; L.total += amt; L.last = world.day;
    },

    borrow(world, rng, n, s) {
      const lenders = P().residents(world, s).filter(o => o !== n && o.wealth > 80);
      const lender = lenders.sort((a, b) => b.wealth - a.wealth)[0];
      if (!lender) return;
      const amt = 20 + rng.int(0, 15);
      const rate = P().has(lender, 'greedy') ? 0.35 : P().has(lender, 'generous') ? 0.05 : 0.2;
      lender.wealth -= amt; n.wealth += amt;
      n.debt = { to: lender.id, amt: Math.round(amt * (1 + rate)), due: world.day + 30 };
      P().remember(world, n, `borrowed ${amt} crowns from ${lender.first}`, 'change', lender.id, 1);
    },
    serviceDebt(world, rng, n, s) {
      const d = n.debt;
      const creditor = d.to && d.to.startsWith('player:') ? null : world.npcs[d.to];
      const toPlayer = d.to && d.to.startsWith('player:');
      if (n.wealth > d.amt + 6) {
        n.wealth -= d.amt;
        if (creditor) creditor.wealth += d.amt;
        if (toPlayer && world.player && 'player:' + world.player.charId === d.to) { Pp.income(world, world.player, d.amt, 'Repaid loans'); P().remember(world, n, `repaid ${world.player.first} what they owed`, 'change', null, 1); n.op[world.player.charId] = (n.op[world.player.charId] || 0) + 8; }
        delete n.debt;
        return;
      }
      if (world.day < d.due + 20) return;
      // Default.
      const house = n.house && s.buildings.find(b => b.id === n.house);
      if (creditor && creditor.status === 'alive' && house) {
        house.npcOwner = creditor.id; n.house = null; n.lodge = house.id;
        P().bond(n, creditor.id, -45);
        P().remember(world, n, `lost the house to ${creditor.first} over a debt of ${d.amt} crowns`, 'trauma', creditor.id, 3);
        ECHO.Chronicle.add(world, { text: `${P().name(n)} of ${s.name} lost the family house to ${P().name(creditor)} over a debt of ${d.amt} crowns.`, kind: 'economy', importance: 1, sid: s.id, npcs: [n.id, creditor.id] });
        delete n.debt;
      } else if (creditor && creditor.status === 'alive' && ECHO.Law) {
        ECHO.Law.npcCrime(world, rng, { by: n.id, kind: 'debt', victim: creditor.id, sid: s.id, amt: d.amt });
        delete n.debt;
      } else if (toPlayer) {
        d.defaulted = true; // the player may take them to the reeve
      } else delete n.debt;
    },

    // ---------------------------------------------------------------- inheritance
    onDeath(world, n) {
      const s = S().settlement(world, n.home);
      const alive = id => world.npcs[id] && world.npcs[id].status === 'alive' ? world.npcs[id] : null;
      let heir = alive(n.spouse);
      const kids = n.kids.map(alive).filter(Boolean).sort((a, b) => a.born - b.born);
      if (!heir) heir = kids.find(k => P().age(world, k) >= 15) || kids[0] || null;
      if (!heir) for (const p of n.parents.map(id => world.npcs[id]).filter(Boolean)) { const sib = p.kids.map(alive).find(k => k && k.id !== n.id); if (sib) { heir = sib; break; } }
      const estate = n.wealth || 0;
      const f = world.factions[n.faction];
      const duty = estate * 0.1;
      if (f && f.type !== 'bandits') f.treasury += duty;
      const things = [];
      if (s) for (const b of s.buildings) if (b.npcOwner === n.id) { b.npcOwner = heir ? heir.id : null; things.push(b.type === 'house' ? 'house' : b.type === 'lumber' ? 'lumber camp' : b.type); if (heir && b.type === 'house' && !heir.house) { heir.house = b.id; heir.lodge = null; } }
      // money owed to the dead goes to the heir; the dead's own debts come out of the estate
      for (const o of Object.values(world.npcs)) if (o.debt && o.debt.to === n.id) o.debt.to = heir ? heir.id : null;
      let left = estate - duty;
      if (n.debt && world.npcs[n.debt.to]) { const pay = Math.min(left, n.debt.amt); world.npcs[n.debt.to].wealth += pay; left -= pay; }
      if (heir) {
        heir.wealth += Math.max(0, left);
        if (n.land) heir.land = (heir.land || 0) + n.land;
        P().remember(world, heir, `inherited from ${n.first}${things.length ? ' — the ' + U.listJoin(things) : ''}`, 'change', n.id, 2);
        if ((estate > 120 || things.some(t => t !== 'house')) && s) ECHO.Chronicle.add(world, { text: `${P().name(heir)} inherited ${things.length ? 'the ' + U.listJoin(things) + ' and ' : ''}${Math.round(left)} crowns from ${P().name(n)}.`, kind: 'life', importance: 0, sid: s.id, npcs: [heir.id] });
        // squabbles over the estate
        const adults = kids.filter(k => P().age(world, k) >= 16 && k !== heir);
        if (adults.length && (estate > 60 || things.length) && adults.some(k => P().has(k, 'greedy')) && s) {
          for (const k of adults) { P().bond(k, heir.id, -30); P().bond(heir, k.id, -20); P().remember(world, k, `quarrelled with ${heir.first} over ${n.first}'s inheritance`, 'conflict', heir.id, 2); }
          ECHO.Chronicle.add(world, { text: `${n.first} ${n.last}'s children are quarrelling bitterly over the inheritance.`, kind: 'life', importance: 0, sid: s.id });
        }
      } else if (s) s.wealth = (s.wealth || 0) + Math.max(0, left);
      n.wealth = 0;
    },

    // ---------------------------------------------------------------- the player
    forSale(world, s) {
      const pl = world.player;
      return Pp.houses(s).filter(b => !b.legend && !(pl && (b.owner === pl.charId || b.tenant === pl.charId)) && (!b.npcOwner || (world.npcs[b.npcOwner] && (world.npcs[b.npcOwner].debt || P().has(world.npcs[b.npcOwner], 'greedy')))))
        .map(b => ({ b, price: Math.round((b.value || Pp.houseValue(s)) * (b.npcOwner ? 1.4 : 1)), seller: b.npcOwner ? world.npcs[b.npcOwner] : null }));
    },
    buyHouse(world, pl, s, b, price) {
      if (pl.gold < price) return 'You can\'t afford it.';
      pl.gold -= price;
      const seller = b.npcOwner && world.npcs[b.npcOwner];
      if (seller) { seller.wealth += price; if (seller.debt) { const pay = Math.min(seller.wealth, seller.debt.amt); seller.wealth -= pay; seller.debt.amt -= pay; if (seller.debt.amt <= 0) delete seller.debt; } }
      else s.wealth = (s.wealth || 0) + price;
      // whoever lived here finds somewhere else
      for (const n of Object.values(world.npcs)) if (n.house === b.id || n.lodge === b.id) { n.house = null; n.lodge = null; }
      Pp.assignTown(world, s);
      b.npcOwner = null; b.owner = pl.charId; b.tenant = null; b.value = b.value || price;
      pl.houseId = pl.houseId || b.id;
      ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} bought a house in ${s.name}.`, importance: 0, sid: s.id, rep: 1 });
      return `The deed is yours. ${seller ? seller.first + ' hands over the key.' : 'The reeve hands over the key.'}`;
    },
    rentHouse(world, pl, s, b) {
      const rent = Math.round((b.value || Pp.houseValue(s)) / 12);
      if (pl.gold < rent) return 'You can\'t afford the first week.';
      pl.gold -= rent; b.tenant = pl.charId; b.rentDue = world.day + 7; b.rent = rent;
      const o = b.npcOwner && world.npcs[b.npcOwner];
      if (o) o.wealth += rent; else s.wealth = (s.wealth || 0) + rent;
      return `The house is yours to live in. ${rent} crowns a week.`;
    },
    // weekly rent and property tax for the player
    playerBills(world, pl) {
      const out = [];
      for (const s of world.settlements) for (const b of Pp.houses(s)) {
        if (b.tenant === pl.charId && world.day >= (b.rentDue || 0)) {
          if (pl.gold >= b.rent) { pl.gold -= b.rent; const o = b.npcOwner && world.npcs[b.npcOwner]; if (o) o.wealth += b.rent; b.rentDue = world.day + 7; out.push(`Rent paid in ${s.name}: ${b.rent} crowns.`); }
          else { b.tenant = null; out.push(`You couldn't pay the rent in ${s.name}. The house has been let to someone else.`); }
        }
        if (b.owner === pl.charId && world.day % 7 === 0) {
          const f = world.factions[s.faction];
          const tax = Math.max(1, Math.round((b.value || 100) * 0.02));
          if (f && f.type !== 'bandits') { if (pl.gold >= tax) { pl.gold -= tax; f.treasury += tax; out.push(`Property tax to ${f.short}: ${tax} crowns.`); } else { pl.taxDebt = (pl.taxDebt || 0) + tax; out.push(`You owe ${f.short} ${pl.taxDebt} crowns in unpaid tax.`); } }
        }
      }
      return out;
    },
    invest(world, pl, s, b) {
      const price = Math.round(Pp.businessValue(world, s, b) * 0.25);
      if (pl.gold < price) return 'You can\'t afford a quarter share.';
      b.shares = b.shares || [];
      const held = b.shares.filter(x => x.char === pl.charId).reduce((a, x) => a + x.frac, 0);
      if (held >= 0.5) return 'They won\'t sell you more than half.';
      pl.gold -= price;
      const owner = b.npcOwner && world.npcs[b.npcOwner];
      if (owner) owner.wealth += price; else s.wealth = (s.wealth || 0) + price;
      b.shares.push({ char: pl.charId, frac: 0.25, paid: price, day: world.day });
      if (owner) { owner.op[pl.charId] = (owner.op[pl.charId] || 0) + 10; P().remember(world, owner, `sold ${pl.first} ${pl.last} a share of the ${b.type}`, 'change', null, 1); }
      return `You now own a quarter of the ${b.type === 'lumber' ? 'lumber camp' : b.type}. Your share of the takings will come to you each day — while it keeps working.`;
    },
    buyField(world, pl, s) {
      const price = Math.round(45 + (s.prosperity || 50) * 0.4);
      if (pl.gold < price) return 'You can\'t afford a field.';
      pl.gold -= price; s.wealth = (s.wealth || 0) + price;
      pl.fields = pl.fields || [];
      const f = pl.fields.find(x => x.sid === s.id);
      if (f) f.n++; else pl.fields.push({ sid: s.id, n: 1 });
      return 'A tenant farmer will work it and send you half the harvest. Pray for rain.';
    },
    lend(world, pl, n, amt) {
      if (pl.gold < amt) return 'You don\'t have that much.';
      pl.gold -= amt; n.wealth += amt;
      n.debt = { to: 'player:' + pl.charId, amt: Math.round(amt * 1.15), due: world.day + 30 };
      if (ECHO.Ambition) ECHO.Ambition.note(pl, 'loans');
      n.op[pl.charId] = (n.op[pl.charId] || 0) + 12;
      P().remember(world, n, `borrowed ${amt} crowns from ${pl.first} ${pl.last}`, 'gratitude', null, 2);
      return `"${amt} crowns. I'll pay you back ${n.debt.amt} within the month, I swear it."`;
    },
    holdings(world, pl) {
      const out = { houses: [], shares: [], fields: pl.fields || [], loans: [] };
      for (const s of world.settlements) for (const b of s.buildings) {
        if (b.type === 'house' && (b.owner === pl.charId || b.tenant === pl.charId)) out.houses.push({ s, b, rented: b.tenant === pl.charId });
        if (b.shares) for (const sh of b.shares) if (sh.char === pl.charId) out.shares.push({ s, b, sh });
      }
      for (const n of Object.values(world.npcs)) if (n.status === 'alive' && n.debt && n.debt.to === 'player:' + pl.charId) out.loans.push(n);
      return out;
    }
  };
})();
