// Letters: the people who know you write to you. A friend's wedding, a child
// named after you, a death in a family you helped, a threat from someone who
// hasn't forgiven you, good news about a dream you helped along, a plea from
// a town in trouble. Letters wait at the next town you walk into.
(function () {
  const { U } = ECHO;
  const P = () => ECHO.People;
  const T = ECHO.TIME;

  const L = ECHO.Letters = {
    list(world) { return (world.letters = world.letters || []); },
    pl(world) { const p = world.player; return p && p.alive ? p : null; },
    op(n, pl) { return (n && n.op && n.op[pl.charId]) || 0; },
    add(world, o) {
      const pl = L.pl(world);
      if (!pl) return null;
      const list = L.list(world);
      if (o.key && list.some(l => l.key === o.key)) return null;
      const from = o.from && world.npcs[o.from];
      const s = from ? ECHO.Sim.settlement(world, from.loc || from.home) : null;
      const l = { id: 'lt' + (world._letterId = (world._letterId || 0) + 1), key: o.key || null, d: world.day, from: o.from || null, fromName: o.fromName || (from ? P().name(from) : 'Someone'), place: s ? s.name : (o.place || ''), kind: o.kind, title: o.title, text: o.text, to: pl.charId, read: false, delivered: false };
      list.push(l);
      if (list.length > 60) world.letters = list.filter(x => !x.read || world.day - x.d < 120).slice(-60);
      return l;
    },
    waiting(world) { const pl = L.pl(world); return pl ? L.list(world).filter(l => !l.delivered && l.to === pl.charId) : []; },
    unread(world) { const pl = L.pl(world); return pl ? L.list(world).filter(l => l.delivered && !l.read && l.to === pl.charId) : []; },
    deliver(world) { const w = L.waiting(world); for (const l of w) l.delivered = true; return w; },

    // ---------------------------------------------------------------- what people write about
    onMarry(world, a, b, fest) {
      const pl = L.pl(world); if (!pl) return;
      const [w, other] = L.op(a, pl) >= L.op(b, pl) ? [a, b] : [b, a];
      if (L.op(w, pl) < 40) return;
      const s = ECHO.Sim.settlement(world, w.loc);
      L.add(world, { key: 'wed' + a.id + b.id, from: w.id, kind: 'joy', title: `${w.first} is married`,
        text: `${pl.first},\n\n${other.first} and I were married${fest ? ' at ' + fest.name : ''} in ${s ? s.name : 'town'}. I wish you could have been there — I kept looking for you among the faces. If you pass this way, there's a place at our table for you, always.\n\n— ${w.first}` });
    },
    onBirthNamed(world, parent, kid) {
      const pl = L.pl(world); if (!pl) return;
      L.add(world, { key: 'kid' + kid.id, from: parent.id, kind: 'joy', title: `A child named ${kid.first}`,
        text: `${pl.first},\n\nWe have a ${kid.sex === 'f' ? 'daughter' : 'son'}. We named ${kid.sex === 'f' ? 'her' : 'him'} ${kid.first}, after you. When ${kid.sex === 'f' ? 'she' : 'he'} is old enough I'll tell ${kid.sex === 'f' ? 'her' : 'him'} why.\n\n— ${parent.first} ${parent.last}` });
    },
    onDeath(world, n, cause) {
      const pl = L.pl(world); if (!pl || n.prof === 'bandit') return;
      if (L.op(n, pl) < 45) return;
      const alive = id => id && world.npcs[id] && world.npcs[id].status === 'alive' && world.npcs[id].prof !== 'child' ? world.npcs[id] : null;
      const kin = alive(n.spouse) || (n.kids || []).map(alive).find(Boolean) || (n.parents || []).map(alive).find(Boolean);
      if (!kin) return;
      L.add(world, { key: 'died' + n.id, from: kin.id, kind: 'grief', title: `${n.first} ${n.last} has died`,
        text: `${pl.first},\n\nI don't know how else to tell you. ${n.first} is gone — ${cause}. ${n.sex === 'f' ? 'She' : 'He'} spoke of you often, and well. I thought you should hear it from us, and not from strangers.\n\n— ${kin.first} ${kin.last}` });
    },
    onVengeance(world, n, victimFirst) {
      const pl = L.pl(world); if (!pl) return;
      L.add(world, { key: 'threat' + n.id, from: n.id, kind: 'threat', title: 'A letter with no greeting',
        text: `I know it was you who killed ${victimFirst}.\n\nI know your face. I know your name. You will not always have a sword in your hand.\n\n— ${n.first} ${n.last}` });
    },
    goalDone(world, n, g) {
      const pl = L.pl(world); if (!pl) return;
      const op = L.op(n, pl);
      if (op < 45 || !(n.mind && (n.mind.owe > 0 || op >= 65))) return;
      const lines = {
        prosper: `I did it — the savings are enough at last, and it's mine. If you come by, the first one's on me, whatever you want.`,
        love: g.crush && world.npcs[g.crush] ? `I finally said it to ${world.npcs[g.crush].first}. ${world.npcs[g.crush].sex === 'f' ? 'She' : 'He'} said yes. I'm still a little stunned.` : `I finally said it. And the answer was yes.`,
        master: `They call me a master of the trade now. I still remember who believed in me before anyone else did.`,
        faith: `I made the pilgrimage. I lit a candle there for you, too. It seemed right.`,
        rank: `I've been raised up. More pay, more trouble — I'm happy.`,
        lore: `I found what I was searching for in the archives. I'll tell you all of it, if you've an evening to spare.`,
        lead: `They chose me. I hope I'll be worthy of it.`,
        fortune: `The road was kind to me in the end. I'm coming home richer than I left.`,
        family: `The children are safe and well. You helped more than you know.`
      };
      const text = lines[g.kind];
      if (!text) return;
      L.add(world, { key: 'done' + n.id + g.kind + world.day, from: n.id, kind: 'joy', title: `Good news from ${n.first}`, text: `${pl.first},\n\n${text}\n\n— ${n.first} ${n.last}` });
    },
    dailyTick(world, rng) {
      const pl = L.pl(world); if (!pl) return;
      // friends in towns that are suffering ask for help
      for (const p of world.plights || []) {
        if (p.status !== 'open' || (pl.accepted || []).includes(p.id) || p._wrote) continue;
        const s = ECHO.Sim.settlement(world, p.sid);
        if (!s || !rng.chance(0.12)) continue;
        const friend = P().residents(world, s).filter(n => L.op(n, pl) >= 50 && n.prof !== 'child').sort((a, b) => L.op(b, pl) - L.op(a, pl))[0];
        if (!friend) continue;
        p._wrote = true;
        L.add(world, { key: 'plea' + p.id, from: friend.id, kind: 'plea', title: `${friend.first} asks for help`,
          text: `${pl.first},\n\nI wouldn't ask if there were anyone else. Things are bad in ${s.name}. ${p.text}\n\nIf you can come, come. The notice board will tell you the rest.\n\n— ${friend.first}` });
      }
    }
  };
})();
