// Growth: in the middle of a fight, everything that fights is learning.
//
// Monsters, wolves, outlaws, guards and townsfolk gain from every blow they
// land and every blow they take and live through — most of all from you, and
// from anything stronger than they are — and a kill teaches more than anything.
// Enough of it and they grow a level then and there: more life, harder blows,
// quicker wits. Whatever keeps hurting them they learn to meet (a monster that
// has taken half its life in arrows starts to turn them), and each kind keeps
// what it learned of you for next time (see Powers).
//
// A monster that beats you, kills someone, or grows twice in one fight takes a
// name and lives on in the world. Named things come back: in their dens, on the
// roads, at the head of a warband, and they remember you.
(function () {
  const { U } = ECHO;
  const Pw = () => ECHO.Powers;
  const UI = () => ECHO.UI;
  const TYPES = ['melee', 'ranged', 'fire', 'magic'];

  const Gr = ECHO.Growth = {
    t: 0, spawned: new Map(),
    reset() { Gr.spawned = new Map(); Gr.t = 0; },
    // who grows this way: not you, nor those who grow with you (companions, your
    // beasts), nor titans, spirits, the Guard, summoned minions, or harmless game
    can(game, e) {
      return !!e && !e.dead && e !== game.pe && !e.isCompanion && !e.tamed && !e.titan && !e.marvel && e.type !== 'ghost' && e.type !== 'boss' && !e.pet && !e.summoner && !e.shard
        && !e.mentor && !e.ngWard && !e.gateMon && e.species !== 'hare' && e.species !== 'gnawer' && e.species !== 'deer' && e.species !== 'fox' && !e.fauna && !(e.type === 'person' && !e.npcId);
    },
    key(e) { return e.npcId ? (e.role === 'bandit' ? 'bandit' : null) : e.species || null; },
    lv(e) { const G = ECHO.Game; if (G && e === G.pe) return ECHO.Prowess.level(G.pl); return ECHO.Prowess ? ECHO.Prowess.foeLevel(e) : (e.lvl || 1); },
    need(L) { return Math.round(14 * Math.pow(Math.max(1, L), 1.15)); },
    rel(a, b) { return U.clamp(1 + (a - b) * 0.15, 0.3, 2.5); },

    // ------------------------------------------------------------ levels
    // n levels more, in body: more life, harder blows (as a foe that level would have)
    raise(e, n) {
      const F = ECHO.Prowess.foeMul, L = Gr.lv(e), a = F(L), b = F(L + n);
      if (e.type === 'person') e._plv = L + n; else e.lvl = L + n;
      const hk = b.hp / a.hp;
      e.maxHp = Math.round(e.maxHp * hk); e.hp = Math.min(e.maxHp, e.hp * hk);
      e.growDmg = (e.growDmg || 1) * b.dmg / a.dmg;
    },
    gain(game, e, xp) {
      if (!(xp > 0) || !Gr.can(game, e)) return;
      e.gxp = (e.gxp || 0) + xp;
      let L = Gr.lv(e), ups = 0;
      while (e.gxp >= Gr.need(L) && ups < 3) { e.gxp -= Gr.need(L); Gr.levelUp(game, e); L = Gr.lv(e); ups++; }
      const n = e.npcId && game.world.npcs[e.npcId];
      if (n) n.gxp = e.gxp;
    },
    levelUp(game, e) {
      const world = game.world, L = Gr.lv(e);
      Gr.raise(e, 1);
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.15);
      e._iq = Math.min(1, (ECHO.Aware ? ECHO.Aware.iq(e) : 0.5) + 0.04);
      e.grown = (e.grown || 0) + 1;
      const near = U.dist(e.x, e.y, game.pe.x, game.pe.y) < 22;
      if (near) {
        ECHO.Combat.floater(e.x, e.y - 1.5 * (e.scale || 1), `▲ Lv ${L + 1}`, e.npcId && !game.hostileTo(e, game.pe) ? '#8fe08a' : '#ff9a5a', true);
        ECHO.Combat.ring(e.x, e.y, 1.3 * (e.scale || 1), 'rgba(255,200,120,0.75)', 0.45);
        for (let i = 0; i < 10; i++) { const a = i / 10 * 6.28; ECHO.Combat.puff(e.x + Math.cos(a) * 0.5, e.y + Math.sin(a) * 0.5, { vx: Math.cos(a) * 1.5, vy: Math.sin(a) * 1.5, vz: 3 + Math.random() * 2, g: 2, h: 0.3, life: 0.7, size: 2, color: '#ffd890', glow: true }); }
        if (!e.sayT || e.sayT < 0.2) { e.say = e.npcId ? ['I\'m getting the hang of this!', 'Stronger…', 'Again!', 'Is that all?'][Math.floor(Math.random() * 4)] : e.foe && e.foe.name && /goblin|warlord|shaman/i.test(e.foe.name) ? ['Hah! Stronger!', 'Me grow!', 'More!'][Math.floor(Math.random() * 3)] : '…'; e.sayT = 1.4; }
        if (ECHO.Sfx && e.species && !e.npcId) ECHO.Sfx.play('roar', { vol: 0.25, pitch: 1.4 });
      }
      // people keep what they learn
      const n = e.npcId && world.npcs[e.npcId];
      if (n) {
        n.lv = Math.max(Pw().lvOf(n), L + 1); n.skill.fight = Math.min(100, (n.skill.fight || 0) + 1); n.renown = (n.renown || 0) + 1;
      } else if (e.species) {
        // and each kind keeps a little of it
        const m = Pw().mem(world, Gr.key(e));
        m.lv += 0.12;
      }
      if (e.nem) { const r = Pw().byId(world, e.nem); if (r) { r.lv = Math.max(r.lv, L + 1); } }
      else if (e.grown >= 2 && !e.npcId) Gr.promote(game, e, 'grew');
    },

    // ------------------------------------------------------------ learning, blow by blow
    onHit(game, target, from, dmg, src) {
      if (!from || from === target || !(dmg > 0)) return;
      const pe = game.pe, world = game.world;
      const share = dmg / Math.max(1, target.maxHp);
      // landing a blow teaches: most of all a blow on you, or on something stronger
      if (Gr.can(game, from)) {
        const k = target === pe ? 4 + share * 30 : 2 + share * 10;
        Gr.gain(game, from, k * Gr.rel(Gr.lv(target), Gr.lv(from)));
        if (target === pe) from._foughtPe = game.time;
      }
      if (target === pe || !Gr.can(game, target) || target.hp <= 0) return;
      // taking it, and standing: that teaches too
      Gr.gain(game, target, (1 + share * 10) * Gr.rel(Gr.lv(from), Gr.lv(target)));
      if (from !== pe && !from.isCompanion && !from.tamed) return;
      target._foughtPe = game.time;
      const type = TYPES.includes(src.type) ? src.type : src.type === 'poison' ? 'magic' : 'melee';
      // its kind remembers how you fought it
      const key = Gr.key(target);
      if (key) {
        const m = Pw().mem(world, key);
        m.seen[type] = (m.seen[type] || 0) + share;
        if (!target._memo) { target._memo = true; m.n++; }
      }
      // whatever keeps hurting it, it learns to meet — if it has the wits
      if ((ECHO.Aware ? ECHO.Aware.iq(target) : 0.5) < 0.3) return;
      const L = target._learn || (target._learn = {});
      L[type] = (L[type] || 0) + share;
      if (L[type] > 0.45 && !L['_' + type]) {
        L['_' + type] = true;
        target.resist = target.resist || {};
        target.resist[type] = Math.min(0.5, (target.resist[type] || 0) + 0.12);
        target._iq = Math.min(1, ECHO.Aware.iq(target) + 0.1);
        ECHO.Combat.floater(target.x, target.y - 1.3, { melee: 'learns to meet your blade', ranged: 'learns to turn your arrows', fire: 'learns to bear your fire', magic: 'learns to shrug off your spells' }[type], '#ffcf8a');
      }
    },
    onKill(game, target, from) {
      const world = game.world;
      if (target.nem) Gr.nemFell(game, target, from);
      if (!from || from === target || !Gr.can(game, from)) return;
      const tl = Gr.lv(target), fl = Gr.lv(from);
      Gr.gain(game, from, 15 * Math.pow(Math.max(1, tl), 1.1) * U.clamp(1 + (tl - fl) * 0.2, 0.3, 3));
      // a monster that kills one of the people (or one of yours) is remembered
      if (!from.npcId && (target.npcId || target.isCompanion || target.pet) && !from.nem && (target.isCompanion || target.pet || Math.random() < 0.5)) Gr.promote(game, from, 'kill', target);
      if (from.nem) { const r = Pw().byId(world, from.nem); if (r) { r.kills++; r.infl += 1; } }
      // and a person who kills one of the named things is made by it
      if (from.npcId && target.nem) { const n = world.npcs[from.npcId]; if (n) { n.renown = (n.renown || 0) + 15; n.honors = (n.honors || []).concat([`slew ${target.label || 'a named beast'}`]).slice(-4); } }
    },
    // you went down: whatever did it is the stronger for it, and its kind remembers
    onPlayerDown(game, from) {
      if (!from || !Gr.can(game, from)) return;
      const world = game.world, key = Gr.key(from);
      if (key) { const m = Pw().mem(world, key); m.beat++; m.lv += 0.6; }
      Gr.gain(game, from, Gr.need(Gr.lv(from)) * 1.5);
      if (from.nem) {
        const r = Pw().byId(world, from.nem);
        if (r) { r.beatYou++; r.met++; r.infl += 5; r.amb = r.amb === 'power' ? 'power' : 'vengeance'; Pw().levelUp(world, r, 1); Pw().tell(world, r, `${Pw().short(r)} beat ${game.pl.first} ${game.pl.last} and lived to boast of it.`, 2); }
        from.say = ['You again. And again you fall.', 'Remember this.', 'I told you I would grow.'][Math.floor(Math.random() * 3)]; from.sayT = 3;
      } else if (!from.npcId) {
        Gr.promote(game, from, 'beat');
        from.say = 'Hah! I will remember you.'; from.sayT = 3;
      }
    },

    // ------------------------------------------------------------ the named
    // When a monster has done something worth a name. Returns its record.
    promote(game, e, why, victim) {
      const world = game.world, P = Pw();
      if (e.nem || e.npcId || e.boss2 || e.gateMon || e.event || !e.species) return null;
      if (P.alive(world).length >= P.MAX_NEM + 3) return null;
      const kind = e.species;
      const r = P.rise(world, {
        kind, lv: Gr.lv(e), x: e.delve ? (ECHO.Explore.byId(world, e.delve) || e).x : e.x, y: e.delve ? (ECHO.Explore.byId(world, e.delve) || e).y : e.y,
        site: e.delve || null, depth: e.floor || 0, why, amb: why === 'beat' ? 'vengeance' : Math.random() < 0.5 ? 'dominion' : 'power', met: e._foughtPe ? 1 : 0, beatYou: why === 'beat' ? 1 : 0, infl: 3,
        text: r => why === 'beat' ? `A ${P.kindOne(kind)} beat ${game.pl.first} ${game.pl.last} in a fight. It calls itself ${P.short(r)} now.`
          : why === 'kill' ? `A ${P.kindOne(kind)} killed ${victim && victim.npcId && world.npcs[victim.npcId] ? world.npcs[victim.npcId].first + ' ' + world.npcs[victim.npcId].last : 'someone'}, and took a name: ${P.short(r)}.`
          : `A ${P.kindOne(kind)} grew stronger in the middle of a fight. It calls itself ${P.short(r)}.`
      });
      e.nem = r.id; e.label = P.label(r); e.scale = (e.scale || 1) * 1.08;
      Gr.spawned.set(r.id, e);
      if (U.dist(e.x, e.y, game.pe.x, game.pe.y) < 24) {
        ECHO.Combat.floater(e.x, e.y - 1.9 * (e.scale || 1), `${r.name} ${r.epi}`, '#ffb84a', true);
        UI().toast(`${why === 'beat' ? 'It beat you, and it will remember.' : why === 'kill' ? 'It has a taste for it now.' : 'It is growing as it fights you.'} It calls itself ${P.short(r)} — see the Journal's Rising powers.`, 'legend', 6);
      }
      return r;
    },
    // a named thing is dead
    nemFell(game, e, from) {
      const world = game.world, pl = game.pl, P = Pw(), r = P.byId(world, e.nem);
      Gr.spawned.delete(e.nem);
      if (!r || !r.alive) return;
      const byYou = from === game.pe || (from && (from.isCompanion || from.tamed));
      const who = byYou ? `${pl.first} ${pl.last}` : from && from.npcId && world.npcs[from.npcId] ? `${world.npcs[from.npcId].first} ${world.npcs[from.npcId].last}` : 'something stronger';
      P.die(world, r, 'slain by ' + who, `${P.short(r)}${r.title ? ', ' + r.title + ',' : ''} was slain by ${who}.`);
      if (!byYou) return;
      UI().banner(`${P.short(r)} is dead`, r.title ? `${r.title} — it will grow no stronger` : 'It will grow no stronger', true);
      pl.renown = (pl.renown || 0) + 5 + Math.round(r.infl * 0.3);
      if (r.bounty > 0) { game.loot.push({ x: e.x - 0.3, y: e.y, kind: 'gold', qty: r.bounty }); UI().toast(`You take back the ${r.bounty} crowns you put on its head.`, 'legend', 5); r.bounty = 0; }
      // what it carried
      const rng = new ECHO.RNG((Math.random() * 4294967295) >>> 0);
      if (ECHO.Gear && ECHO.Gear.make) {
        const kind = ['sword', 'armor', 'bow'][rng.int(0, 2)];
        const it = ECHO.Gear.make(world, rng, kind, Math.max(1, r.lv), ECHO.Gear.rollRarity(rng, r.lv, 20 + Math.min(30, r.infl)), `taken from ${P.short(r)}`);
        if (it) game.dropItem(it.id, e.x, e.y);
      }
      game.loot.push({ x: e.x + 0.3, y: e.y, kind: 'gold', qty: Math.round(10 + r.lv * 3 + r.infl * 2) });
    },
    // A named thing in the flesh, with all it has learned
    make(game, r, x, y) {
      const world = game.world;
      let e;
      if (r.kind === 'wolf') {
        Gr._noAdapt = true;
        try { e = ECHO.Spawner.makeCreature(game, 'wolf', x, y, ECHO.World.regionAt(world, x, y), 'nem' + r.id); } finally { Gr._noAdapt = false; }
        const F = ECHO.Prowess.foeMul(r.lv); e.lvl = r.lv; e.hp = e.maxHp = Math.round(e.maxHp * F.hp * 1.3); e.growDmg = F.dmg; e.scale = 1.35; e.r = (e.r || 0.4) * 1.2;
      } else {
        e = ECHO.Monsters.make(game, r.kind, x, y, r.lv, { noElite: true, nem: true });
        e.hp = e.maxHp = Math.round(e.maxHp * 1.35); e.scale = (e.scale || 1) * 1.15;
        e.ab = e.ab || {};
        for (const k of r.learned) { const A = Pw().ARTS[k]; if (A && !e.ab[k]) e.ab[k] = A.ab(r.lv, r.kind); }
      }
      e.resist = e.resist || {};
      for (const t in r.resist) e.resist[t] = (e.resist[t] || 0) + r.resist[t];
      e.nem = r.id; e.label = Pw().label(r); e.nemInfl = r.infl;
      e.hp = Math.max(e.maxHp * 0.3, e.maxHp * (r.hp == null ? 1 : r.hp));
      e._iq = 0.85;
      if (r.met > 0 || r.amb === 'vengeance') { e.aggro = true; e.target = game.pe; }
      return e;
    },
    // what it says when it sees you again
    greet(game, e, r) {
      const lines = r.beatYou ? ['You. I beat you once.', 'Back for more?', `I have grown since, ${game.pl.first}.`]
        : r.ranFromYou ? ['You ran, last time.', 'No running now.']
        : r.met ? ['I remember you.', 'I have been waiting.', 'This time is different.']
        : r.infl >= 25 ? ['Kneel to your master.', 'This land is mine.'] : ['Another one for my trophies.', 'Fresh meat.'];
      e.say = lines[Math.floor(Math.random() * lines.length)]; e.sayT = 3;
      ECHO.Combat.floater(e.x, e.y - 2 * (e.scale || 1), `“${e.say}”`, '#ffcf8a', true);
    },

    // ------------------------------------------------------------ in the world near you
    update(game, dt) {
      Gr.t -= dt;
      if (Gr.t > 0) return;
      Gr.t = 0.5;
      const world = game.world, pe = game.pe, P = Pw();
      if (!pe || !P) return;
      // (an older world catches up the first time it is played this way)
      if (!P.st(world).lvInit) {
        const n = P.catchUp(world);
        if (n && ECHO.Prowess.level(game.pl) > 8) UI().toast('The realm has not stood still while you grew: its fighters have trained hard, and the best of them are close on your heels now. (Journal → Rising powers)', 'legend', 8);
      }
      // people near you carry the level they have now
      Gr.lvT = (Gr.lvT || 0) - 0.5;
      if (Gr.lvT <= 0 && ECHO.Delvers) {
        Gr.lvT = 3;
        for (const e of game.ents) {
          if (e.type !== 'person' || !e.npcId || e.dead || e.isCompanion || e.ngWard) continue;
          const n = world.npcs[e.npcId];
          if (!n || ECHO.Delvers.lv(n) <= (e._plv || 0)) continue;
          const e2 = ECHO.Spawner.makePerson(game, n, e.x, e.y, e.role), frac = e.hp / Math.max(1, e.maxHp);
          e.maxHp = e2.maxHp; e.hp = Math.max(1, Math.round(e2.maxHp * frac)); e.dmgMul = e2.dmgMul; e._plv = e2._plv; e.wdmg = e2.wdmg;
        }
      }
      // keep the records in step with the bodies
      for (const [id, e] of Gr.spawned) {
        const r = P.byId(world, id);
        if (!r || !r.alive) { Gr.spawned.delete(id); continue; }
        if (!e.dead && game.ents.includes(e)) { r.hp = e.hp / Math.max(1, e.maxHp); if (e.x < 9000) { r.x = e.x; r.y = e.y; } continue; }
        Gr.spawned.delete(id);
        if (e.vanish || !e.dead) {
          r.coolT = game.time + 45;
          // it fought you and is still alive: you left it standing
          if (e._foughtPe && game.time - e._foughtPe < 90 && !game.pl.capture) {
            r.met++; r.infl += 1; r.ranFromYou += e.hp > e.maxHp * 0.3 ? 0 : 1;
            P.levelUp(world, r, 1);
            P.tell(world, r, `${P.short(r)} fought ${game.pl.first} ${game.pl.last} and lived.`, 1);
          }
        }
      }
      if (ECHO.Interior.cur) return;
      // the named that roam near you come to you
      for (const r of P.alive(world)) {
        if (!r.abroad || Gr.spawned.has(r.id) || game.time < (r.coolT || 0)) continue;
        const d = U.dist(r.x, r.y, pe.x, pe.y), reach = r.met > 0 || r.amb === 'vengeance' ? 34 : 24;
        if (d > reach) continue;
        const k = d > 1 ? 18 / d : 0, sp = ECHO.Ent.freeSpot(world, pe.x + (r.x - pe.x) * k, pe.y + (r.y - pe.y) * k, 5) || ECHO.Spawner.findSpot(game, null, 15, 22);
        if (!sp) continue;
        const e = Gr.make(game, r, sp.x, sp.y);
        game.addEnt(e);
        Gr.spawned.set(r.id, e);
        Gr.followers(game, r, e);
        if (r.met > 0 || r.infl >= 10) {
          Gr.greet(game, e, r);
          UI().toast(`${P.label(r)} is near${r.fol ? `, with ${Math.min(4, r.fol)} at its back` : ''}. ${r.met ? 'It remembers you.' : ''}`, 'legend', 5);
        }
      }
    },
    followers(game, r, e) {
      const n = Math.min(4, r.fol || 0);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.28, sp = ECHO.Ent.freeSpot(game.world, e.x + Math.cos(a) * 1.8, e.y + Math.sin(a) * 1.8, 3);
        if (!sp) continue;
        const lv = Math.max(1, r.lv - 3);
        const f = r.kind === 'wolf' ? ECHO.Spawner.makeCreature(game, 'wolf', sp.x, sp.y, ECHO.World.regionAt(game.world, sp.x, sp.y), 'nem' + r.id) : ECHO.Monsters.make(game, r.kind, sp.x, sp.y, lv, { noElite: true });
        if (r.kind === 'wolf') { const F = ECHO.Prowess.foeMul(lv); f.lvl = lv; f.hp = f.maxHp = Math.round(f.maxHp * F.hp); f.growDmg = F.dmg; }
        f.follows = r.id; f.aggro = e.aggro; if (e.aggro) f.target = game.pe;
        if (e.indoor) { f.delve = e.delve; f.indoor = true; f.floor = e.floor; }
        if (e.indoor) game.ents.push(f); else game.addEnt(f);
      }
    },
    // a named thing that keeps to its den: waiting on its floor
    inDelve(game, L, free, tag) {
      const world = game.world, P = Pw();
      if (!P) return;
      for (const r of P.alive(world)) {
        if (r.abroad || r.site !== L.site.id || (r.depth || 0) !== (L.depth || 0) || Gr.spawned.has(r.id)) continue;
        const rooms = L.G.rooms.filter(x => x !== L.G.entrance);
        const room = L.farRoom && (L.depth || 0) < (L.floors || 1) - 1 ? L.farRoom : rooms[Math.floor(Math.random() * rooms.length)] || L.farRoom;
        const spots = free(room);
        const s0 = spots.pop();
        if (!s0) continue;
        const e = tag(Gr.make(game, r, ECHO.Interior.BASE + s0.x + 0.5, s0.y + 0.5));
        game.ents.push(e);
        Gr.spawned.set(r.id, e);
        Gr.followers(game, r, e);
        if (r.met || r.infl >= 10) UI().toast(`${P.label(r)} is somewhere on this floor.`, 'legend', 5);
      }
    },
    // what every new monster brings with it: what its kind has learned of you,
    // and the boldness of a land a named thing has claimed
    adapt(game, e) {
      if (!e || e.nem || Gr._noAdapt || !Gr.can(game, e)) return;
      const world = game.world, P = Pw(), key = Gr.key(e);
      if (!P || !key) return;
      const m = P.st(world).sp[key];
      let up = m ? P.learnedLv(world, key) : 0;
      const reg = e.x < 9000 ? ECHO.World.regionAt(world, e.x, e.y) : null, cl = reg ? P.st(world).claims[reg.id] : null, lord = cl ? P.byId(world, cl) : null;
      if (lord && lord.alive && !e.npcId) up += 1 + Math.floor(lord.infl / 15);
      // out in the open the land grows with the age: once you have outgrown what
      // lives in it, it meets you at half to nine-tenths of your strength (the
      // deep places keep the levels they are known for)
      if (!e.npcId && e.x < 9000 && !e.delve && !e.indoor) {
        const plv = ECHO.Prowess.level(game.pl), L = Gr.lv(e) + up;
        if (plv > L + 3) { const T = Math.round(plv * (0.5 + Math.random() * 0.4)); if (T > L) up += T - L; }
      }
      if (up > 0) Gr.raise(e, up);
      if (m) {
        for (const t of TYPES) { const h = P.hardened(m, t); if (h > 0.01) { e.resist = e.resist || {}; e.resist[t] = (e.resist[t] || 0) + h; } }
        if (m.n > 5 && ECHO.Aware) e._iq = Math.min(1, ECHO.Aware.iq(e) + Math.min(0.2, m.n / 150));
      }
      if (e.npcId) { const n = world.npcs[e.npcId]; if (n && n.gxp) e.gxp = n.gxp; }
    },

    // ------------------------------------------------------------ the Journal: Rising powers
    html(game) {
      const world = game.world, pl = game.pl, P = Pw(), me = ECHO.Prowess.level(pl);
      const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      const lvCol = L => { const g = L - me; return g >= 3 ? '#ff6a5a' : g >= 0 ? '#ffb84a' : g >= -3 ? '#e8e2c8' : '#9fa8a0'; };
      const where = r => {
        if (!r.abroad && r.site) { const s = ECHO.Explore.byId(world, r.site); return s ? `in ${esc(s.name)}${r.depth ? `, floor ${r.depth + 1}` : ''} (${Math.round(U.dist(s.x, s.y, pl.x, pl.y))} leagues ${ECHO.Purpose.dirTo(world, pl, s)})` : 'deep underground'; }
        const reg = world.regions[r.region];
        return `roaming ${reg ? esc(reg.name) : 'the wilds'} (${Math.round(U.dist(r.x, r.y, pl.x, pl.y))} leagues ${ECHO.Purpose.dirTo(world, pl, r)})`;
      };
      const live = P.alive(world).sort((a, b) => P.might(b) - P.might(a));
      let h = `<p class="dim">Everything that fights is learning. Monsters grow in the middle of a fight, every kind remembers how you fought it, and the ones that do something worth a name live on and want more: strength, followers, land — and some of them want you.</p>`;
      h += `<h3 class="gold">The named (${live.length})</h3>`;
      if (!live.length) h += `<p class="dim">None yet. A monster that beats you, kills someone, or grows twice in one fight will take a name.</p>`;
      else h += `<div class="list">${live.map(r => {
        const arts = r.learned.map(k => P.ARTS[k].name), hard = Object.keys(r.resist).filter(t => r.resist[t] > 0.05).map(t => ({ melee: 'the blade', ranged: 'arrows', fire: 'fire', magic: 'spells' }[t]));
        return `<div class="card"><h4>${esc(P.short(r))}${r.title ? ` <span class="gold">· ${esc(r.title)}</span>` : ''}</h4>
          <div style="font-size:13px"><b style="color:${lvCol(r.lv)}">Level ${r.lv}</b> ${esc(P.kindOne(r.kind))} · ${where(r)}</div>
          <div class="dim" style="font-size:13px">It ${esc(P.wantWord(r))}. Influence ${Math.round(r.infl)}${r.fol ? ` · a warband of ${r.fol}` : ''}${r.kills ? ` · ${r.kills} killed` : ''}${r.beatYou ? ` · has beaten you ${r.beatYou > 1 ? r.beatYou + ' times' : 'once'}` : r.met ? ' · has fought you' : ''}.</div>
          ${arts.length || hard.length ? `<div style="font-size:13px">${arts.length ? `Has learned ${esc(arts.join(', '))}. ` : ''}${hard.length ? `Hardened against ${esc(hard.join(' and '))}.` : ''}</div>` : ''}
          ${r.story.length ? `<div class="dim" style="font-size:12px">${r.story.slice(-3).map(s => `Day ${s.d}: ${esc(s.t)}`).join('<br>')}</div>` : ''}</div>`;
      }).join('')}</div>`;
      // what each kind has learned of you
      const S = P.st(world).sp, kinds = Object.keys(S).filter(k => S[k].n >= 2).sort((a, b) => S[b].n - S[a].n).slice(0, 8);
      if (kinds.length) {
        h += `<h3 class="gold">What they have learned of you</h3><div class="list">`;
        for (const k of kinds) {
          const m = S[k], fav = P.favourite(m), up = P.learnedLv(world, k), hard = fav ? Math.round(P.hardened(m, fav.type) * 100) : 0;
          h += `<div class="card" style="font-size:13px"><b>${esc(P.kindWord(k))}</b> — ${m.n} fights with you${m.beat ? `, ${m.beat} won` : ''}. ${up ? `They come at you <b>${up} level${up > 1 ? 's' : ''}</b> stronger than they were. ` : ''}${fav && hard ? `You mostly use ${{ melee: 'the blade', ranged: 'the bow', fire: 'fire', magic: 'spells' }[fav.type]} on them: they are ${hard}% hardened against it — change how you fight them.` : ''}</div>`;
        }
        h += `</div>`;
      }
      // the people who want more
      const ch = P.champions(world, 8);
      if (ch.length) {
        h += `<h3 class="gold">The realm's fighters</h3><div class="list">${ch.map(n => {
          const t = P.championTown(world, n), home = ECHO.Sim.settlement(world, n.home);
          return `<div class="card" style="font-size:13px"><b>${esc(n.first + ' ' + n.last)}</b>${t ? ` <span class="gold">· Champion of ${esc(t.name)}</span>` : ''} — <b style="color:${lvCol(P.lvOf(n))}">level ${P.lvOf(n)}</b> ${esc(n.prof)}${home ? ` of ${esc(home.name)}` : ''} · renown ${Math.round(n.renown || 0)}${P.amb(n) > 0.6 ? ' · <span class="gold">ambitious</span>' : ''}${n.honors && n.honors.length ? `<div class="dim">${esc(n.honors.join('; '))}</div>` : ''}</div>`;
        }).join('')}</div>`;
      }
      return h;
    }
  };
})();
