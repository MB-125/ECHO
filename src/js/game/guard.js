// The National Guard in real time: the six at their posts by the gates, and
// the warden who takes a recruit through and teaches them to live there.
//
// At the gate they stand watch and cut down anything that comes too close.
// As a mentor they lead you to beasts your size (never far past it), soften
// what you fight without stealing the kill, step in with their own arts when
// you are in trouble — and kill outright anything that is too much for you.
(function () {
  const { U } = ECHO;
  const UI = () => ECHO.UI;
  const Gt = () => ECHO.Gates;
  const P = () => ECHO.People;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const SAY = {
    lead: ['This way.', 'Stay close.', 'Further in. You are ready for it.', 'Follow me.'],
    pull: ['That one. Show me.', 'There — that is your size. Go.', 'Take that one. I am behind you.', 'Your turn.'],
    save: ['Behind me!', 'Not that one — it is mine.', 'Too big for you. Step back.', 'Down!'],
    praise: ['Good.', 'Again.', 'Better.', 'You are learning.'],
    hurt: ['Back off and breathe.', 'You are bleeding. Step back.', 'Enough. Let me.'],
    wait: ['Keep up.', 'I will not go on without you.']
  };
  const pick = a => a[Math.floor(Math.random() * a.length)];

  const Gd = ECHO.Guard = {
    t: 0,
    // ------------------------------------------------------------ at their posts
    update(game, dt) {
      Gd.t -= dt;
      if (Gd.t > 0) return;
      Gd.t = 1;
      const world = game.world, pe = game.pe;
      if (ECHO.Interior.cur || !world.gates) return;
      for (const g of world.gates.list) {
        if (U.dist(g.x, g.y, pe.x, pe.y) > 46) continue;
        Gt().atGate(world, g).forEach((n, k) => {
          if (game.ents.some(e => e.npcId === n.id && !e.dead)) return;
          const post = { x: g.x + (k ? 3.3 : -3.3), y: g.y + 2.4 };
          Gd.spawn(game, n, post, null);
        });
      }
    },
    spawn(game, n, at, L) {
      const world = game.world;
      const sp = ECHO.Ent.freeSpot(world, at.x, at.y, 4) || at;
      const e = ECHO.Spawner.makePerson(game, n, sp.x, sp.y, 'warden');
      const lv = ECHO.Delvers.lv(n), X = ECHO.Prowess.expect(lv);
      e.ngWard = true; e.role = 'warden';
      e.hp = e.maxHp = Math.round(X.hp * 5); e.blow = X.dmg; e._plv = lv; e.lvl = null;
      e.speed = 4.7; e.post = { x: sp.x, y: sp.y }; e.sk = {}; e.cd = 0;
      e.gear.helm = true; e.gear.bow = false; e.gear.crossbow = false;
      const D = Gt().def(n);
      if (D) { e.gear.spear = D.wclass === 'spear'; e.cape = D.cape; }
      if (L) game.ents.push(e); else game.addEnt(e);
      return e;
    },
    spawnMentor(game, n, L) {
      const e = Gd.spawn(game, n, { x: L.inside.x - 1.2, y: L.inside.y - 0.6 }, L);
      e.mentor = true;
      e.say = pick(['Stay close. Do what I say, when I say it.', 'Breathe. The air here is thick. You will get used to it.', 'Here we go.']); e.sayT = 3.5;
      if (!(game.pl.guard && game.pl.guard.trips > 1)) setTimeout(() => UI().toast(`Follow ${n.first}: beasts your size, and help when it goes wrong.`, 'info', 5), 1400);
      return e;
    },
    // ------------------------------------------------------------ thinking
    think(game, e, npc, dt) {
      const world = game.world, pe = game.pe;
      for (const k in e.sk) e.sk[k] -= dt;
      if (e.tauntT > 0) e.tauntT -= dt;
      // the wardens mend between fights
      if (game.time - (e.lastHurt || 0) > 3 && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.06 * dt);
      if (e.hurtT > 0) e.lastHurt = game.time;
      if (e.attackT > 0) return true;
      if (e.huntB && ECHO.GuardField) return ECHO.GuardField.hunt(game, e, npc, dt);
      return e.mentor ? Gd.mentor(game, e, npc, dt) : Gd.watch(game, e, npc, dt);
    },
    foes(game, e, r) {
      const out = [];
      for (const o of game.ents) if (!o.dead && !o.hidden && o !== e && game.hostileTo(e, o) && o !== game.pe && !o.isCompanion && U.dist(o.x, o.y, e.x, e.y) < r) out.push(o);
      return out;
    },
    // At the post: anything that comes too close dies; otherwise, stand watch.
    watch(game, e, npc, dt) {
      const world = game.world, pe = game.pe;
      const foe = Gd.foes(game, e, 9).sort((a, b) => U.dist(a.x, a.y, e.x, e.y) - U.dist(b.x, b.y, e.x, e.y))[0];
      if (foe) { e.fighting = true; Gd.engage(game, e, foe, dt, Infinity); return true; }
      e.fighting = false;
      const d = U.dist(e.x, e.y, e.post.x, e.post.y);
      if (d > 0.5) ECHO.Ent.travel(world, e, e.post.x, e.post.y, e.speed * 0.5, dt);
      else { e.moving = false; e.dir = U.dist(pe.x, pe.y, e.x, e.y) < 6 ? Math.atan2(pe.y - e.y, pe.x - e.x) : Math.PI / 2; e.flip = Math.cos(e.dir) < 0; }
      const dp = U.dist(pe.x, pe.y, e.x, e.y);
      const gk = 'g' + Math.round(e.post.x) + Math.round(e.post.y);
      if (dp < 5 && e._greet !== world.day && e.sayT <= 0 && !(game.ents.some(o => o !== e && o.ngWard && o._greet === world.day && U.dist(o.x, o.y, e.x, e.y) < 10))) {
        e._greet = world.day; void gk;
        const lv = ECHO.Prowess.level(game.pl), pl = game.pl;
        e.say = pl.guard ? pick(['Warden.', 'Back for more?', 'The gate is quiet today. That means nothing.']) : lv >= Gt().MIN ? 'You are strong enough to stand here. Talk to me.' : 'How are you still standing? Go back. Now.';
        e.sayT = 3;
      }
      return true;
    },
    // Fight something: close in and strike. cap: the most of its life one blow may take.
    engage(game, e, foe, dt, cap, floor) {
      const world = game.world, d = U.dist(e.x, e.y, foe.x, foe.y), ang = Math.atan2(foe.y - e.y, foe.x - e.x);
      const reach = 1.5 + (foe.r || 0.35);
      e.dir = ang; e.flip = Math.cos(ang) < 0; e.target = foe;
      if (d > reach) { ECHO.Ent.travel(world, e, foe.x, foe.y, e.speed, dt); return; }
      e.moving = false;
      if (e.cd > 0) return;
      e.cd = 0.85; e.attackT = 0.22; e.attackKind = Math.random() < 0.5 ? 'fore' : 'back'; e.state = 'attack';
      let dmg = e.blow * (0.9 + Math.random() * 0.2);
      if (foe.resist && foe.resist.melee) dmg /= Math.max(0.1, 1 - foe.resist.melee);   // their own skill finds the gaps
      if (cap !== Infinity) dmg = Math.min(dmg, foe.maxHp * cap);
      if (floor) dmg = Math.min(dmg, Math.max(0, foe.hp - foe.maxHp * floor));
      ECHO.Combat.slash(e.x, e.y, ang, 1.7, 2.2, 'rgba(255,240,200,0.85)', 'heavy');
      if (dmg > 0) ECHO.Combat.damage(foe, dmg, { type: 'melee', from: e, angle: ang, knock: 0.35, stagger: 0.25 });
      else { foe.stagger = Math.max(foe.stagger || 0, 0.35); ECHO.Combat.sparks(foe.x, foe.y - 0.3, ang, '#ffe6c8', 6); }
      const D = Gt().def(world.npcs[e.npcId]);
      if (D && D.key === 'lance' && !foe.dead) foe.burn = Math.max(foe.burn || 0, 2);   // Radiant Brand
    },
    // ------------------------------------------------------------ the mentor
    mentor(game, e, npc, dt) {
      const world = game.world, pe = game.pe, pl = game.pl, L = ECHO.GateWorld.inside(game);
      if (!L) return Gd.watch(game, e, npc, dt);
      const lv = ECHO.Prowess.level(pl), D = Gt().def(npc);
      const dP = U.dist(e.x, e.y, pe.x, pe.y);
      const hpF = pe.hp / pl.maxHp;
      // 1. you are in trouble: their arts first
      if (hpF < 0.5 && !game.defeating) Gd.rescue(game, e, npc, D);
      // what is near, and how dangerous it is to you
      const near = Gd.foes(game, e, 14).filter(o => U.dist(o.x, o.y, pe.x, pe.y) < 11);
      const threats = near.filter(o => o.aggro && (o.target === pe || o.target === e || U.dist(o.x, o.y, pe.x, pe.y) < 6));
      const byDist = a => a.sort((p, q) => U.dist(p.x, p.y, pe.x, pe.y) - U.dist(q.x, q.y, pe.x, pe.y));
      // too strong for you, or too many at once: the ones beyond your two closest are theirs
      const deadly = near.filter(o => (o.lvl || 0) > lv + 28 || o.sovereign).concat(byDist(threats.filter(o => (o.lvl || 0) <= lv + 28 && !o.sovereign)).slice(2));
      const onYou = threats.filter(o => !deadly.includes(o));
      e.fighting = false; e.waiting = false;
      if (threats.length >= 3 && Gd.ready(e, 'thin')) { e.sk.thin = 12; e.say = 'Too many. I will thin them — take the closest.'; e.sayT = 2.4; }
      // 2. anything far too strong for you: theirs, outright
      if (deadly.length) {
        const f = byDist(deadly)[0];
        e.fighting = true;
        if (!f._claimed) { f._claimed = true; e.say = pick(SAY.save); e.sayT = 2; f.aggro = true; e.tauntT = 3; }
        Gd.offense(game, e, npc, D, f, true);
        Gd.engage(game, e, f, dt, Infinity);
        return true;
      }
      // 3. beasts on you: soften them, never steal the kill — unless you're losing
      if (onYou.length) {
        const f = onYou.sort((a, b) => b.hp / b.maxHp - a.hp / a.maxHp)[0];
        e.fighting = true;
        const losing = hpF < 0.35;
        // soften the healthiest (so you can finish it), kill it if you are losing
        if (losing) Gd.offense(game, e, npc, D, f, true);
        else if (f.hp > f.maxHp * 0.3) Gd.offense(game, e, npc, D, f, false);
        if (f.hp > f.maxHp * 0.3 || losing) Gd.engage(game, e, f, dt, losing ? Infinity : 0.16, losing ? 0 : 0.25);
        else { e.moving = false; e.dir = Math.atan2(f.y - e.y, f.x - e.x); }
        if (!losing && f.hp < f.maxHp * 0.25 && e.sayT <= 0 && Math.random() < dt * 0.6) { e.say = 'Finish it!'; e.sayT = 1.6; }
        return true;
      }
      // 4. you wandered off: back to you
      if (dP > 12) { e.waiting = true; ECHO.Ent.travel(world, e, pe.x, pe.y, e.speed, dt); return true; }
      // between fights: catch your breath, they bind your wounds
      if (hpF < 0.65 && dP < 4) {
        e.waiting = true; e.moving = false; e.dir = Math.atan2(pe.y - e.y, pe.x - e.x);
        pe.hp = Math.min(pl.maxHp, pe.hp + pl.maxHp * 0.07 * dt); pl.hp = pe.hp;
        if (!e._binding) { e._binding = true; e.say = 'Breathe. Let me see that.'; e.sayT = 2; }
        if (Math.random() < dt * 4) ECHO.Combat.fx.push({ kind: 'p', x: pe.x + (Math.random() - 0.5) * 0.6, y: pe.y - Math.random() * 0.8, vx: 0, vy: -0.6, t: 0, life: 0.7, color: '#ffe8a0', size: 2 });
        return true;
      }
      e._binding = false;
      // 5. lead you on: to the region your size, then to something to fight there
      const want = Gt().zoneFor(Math.min(Gt().TOP, lv + (pl.guard && pl.guard.pace === 'hard' ? 30 : 5)));
      const zHere = ECHO.GateWorld.zoneAt(L, e.x, e.y);
      if (!e.lead || e.leadZone !== want || U.dist(e.x, e.y, e.lead.x, e.lead.y) < 1.2 || (zHere === want && !e.leadPull)) {
        const prey = zHere === want ? Gd.preyFor(game, e, lv) : null;
        if (prey) { e.lead = { x: prey.x, y: prey.y }; e.leadPull = prey; }
        else { e.lead = Gd.leadTo(L, e, want); e.leadPull = null; }
        e.leadZone = want;
      }
      if (e.leadPull && (e.leadPull.dead || e.leadPull.aggro)) { e.leadPull = null; e.lead = null; return true; }
      // don't run ahead: wait when you lag
      if (dP > 7) { e.waiting = true; e.moving = false; e.dir = Math.atan2(pe.y - e.y, pe.x - e.x); if (e.sayT <= 0 && Math.random() < dt * 0.08) { e.say = pick(SAY.wait); e.sayT = 2; } return true; }
      const goal = e.lead;
      if (!goal) { e.moving = false; return true; }
      const dg = U.dist(e.x, e.y, goal.x, goal.y);
      if (e.leadPull && dg < 6) {
        // close enough: show you, and let you take it
        e.moving = false; e.dir = Math.atan2(goal.y - e.y, goal.x - e.x);
        if (!e.leadPull._shown) { e.leadPull._shown = true; e.say = pick(SAY.pull); e.sayT = 2.4; ECHO.Combat.ring(e.leadPull.x, e.leadPull.y, 1.2, 'rgba(255,230,140,0.9)', 1.2); }
        return true;
      }
      if (e.sayT <= 0 && Math.random() < dt * 0.03) { e.say = pick(SAY.lead); e.sayT = 2; }
      ECHO.Ent.travel(world, e, goal.x, goal.y, e.speed * 0.62, dt);
      return true;
    },
    // something your size in the region: not too far, not already fighting
    preyFor(game, e, lv) {
      let best = null, bd = 40;
      for (const o of game.ents) {
        if (!o.gateMon || o.dead || o.aggro || o.sovereign || o.prey) continue;
        const L = o.lvl || 0;
        if (L > lv + 22 || L < lv - 60) continue;
        const d = U.dist(o.x, o.y, e.x, e.y);
        if (d < bd) { bd = d; best = o; }
      }
      return best;
    },
    // a point in the wanted region, along the road through the gate world
    leadTo(L, e, z) {
      const B = ECHO.Interior.BASE;
      const cs = L.clearings.filter(c => c.z === z && U.dist(B + c.x, c.y, e.x, e.y) > 4);
      if (cs.length) { const c = cs[Math.floor(Math.random() * cs.length)]; return { x: B + c.x, y: c.y }; }
      const w = L.way[Math.min(L.way.length - 1, z + 1)];
      return { x: B + w.x, y: w.y };
    },
    // ------------------------------------------------------------ their arts
    ready(e, k) { return !((e.sk[k] || 0) > 0); },
    rescue(game, e, npc, D) {
      const pl = game.pl, pe = game.pe;
      if (!D) return;
      const k = D.skills.map(s => s[0]);
      if ((k.includes('mend') || k.includes('sanctuary')) && Gd.ready(e, 'mend')) {
        e.sk.mend = 9;
        if (k.includes('mend')) { pe.hp = Math.min(pl.maxHp, pe.hp + pl.maxHp * 0.6); pl.hp = pe.hp; pl.poisonT = 0; pl.rootT = 0; pl.slowT = 0; Gd.cast(game, e, 'Mending Light', '#ffe08a'); ECHO.Combat.ring(pe.x, pe.y, 1.6, 'rgba(255,230,140,0.9)', 0.8); }
        if (k.includes('sanctuary')) ECHO.GateWorld.hazard({ x: pe.x, y: pe.y, r: 2.6, life: 6, frac: 0.09, kind: 'heal' });
        return;
      }
      if (k.includes('aegis') && Gd.ready(e, 'aegis')) { e.sk.aegis = 14; pl._aegis = 6; Gd.cast(game, e, 'Aegis Wall', '#ffe6a0'); ECHO.Combat.ring(pe.x, pe.y, 1.4, 'rgba(255,230,160,0.95)', 1); return; }
      if (k.includes('taunt') && Gd.ready(e, 'taunt')) { e.sk.taunt = 10; e.tauntT = 5; for (const o of Gd.foes(game, e, 10)) { o.aggro = true; o.target = e; } Gd.cast(game, e, 'Iron Challenge', '#ffcf8a'); ECHO.Combat.ring(e.x, e.y, 5, 'rgba(255,200,120,0.8)', 0.6); return; }
      if (k.includes('veil') && Gd.ready(e, 'veil')) { e.sk.veil = 16; for (const o of Gd.foes(game, e, 9)) { o.aggro = false; o.lastSeen = null; o.prey = null; o.stagger = 1.2; } for (let i = 0; i < 40; i++) ECHO.Combat.fx.push({ kind: 'smoke', x: pe.x + (Math.random() - 0.5) * 5, y: pe.y + (Math.random() - 0.5) * 4, vx: 0, vy: 0, t: 0, life: 2.5, size: 4 }); Gd.cast(game, e, 'Smoke Veil', '#c8c8d0'); return; }
      if ((k.includes('quake') || k.includes('thunder')) && Gd.ready(e, 'stun')) { e.sk.stun = 10; for (const o of Gd.foes(game, e, 6)) o.stagger = Math.max(o.stagger || 0, 2.2); Gd.cast(game, e, k.includes('quake') ? 'Earthshaker' : 'Thunderclap', '#d8c8a0'); ECHO.Combat.ring(e.x, e.y, 6, 'rgba(220,200,160,0.9)', 0.6); game.shake(0.4); return; }
      // anyone can drag you clear
      if (Gd.ready(e, 'pull')) { e.sk.pull = 12; e.tauntT = 4; for (const o of Gd.foes(game, e, 8)) { o.target = e; o.stagger = Math.max(o.stagger || 0, 0.6); } e.say = pick(SAY.hurt); e.sayT = 2; }
    },
    // Their own way of hitting hard. full: kill (true) or only soften.
    offense(game, e, npc, D, f, full) {
      if (!D || !f || f.dead) return;
      const k = D.skills.map(s => s[0]), cap = full ? Infinity : 0.18, floor = full ? 0 : 0.2;
      const blow = (o, mul) => { let d = e.blow * mul; if (cap !== Infinity) d = Math.min(d, o.maxHp * cap); if (floor) d = Math.min(d, Math.max(0, o.hp - o.maxHp * floor)); if (d > 0) ECHO.Combat.damage(o, d, { type: 'magic', from: e, angle: Math.atan2(o.y - e.y, o.x - e.x), knock: 0.4, stagger: 0.4 }); };
      if (k.includes('lance') && Gd.ready(e, 'lance') && U.dist(e.x, e.y, f.x, f.y) < 12) {
        e.sk.lance = 7;
        const a = Math.atan2(f.y - e.y, f.x - e.x), ux = Math.cos(a), uy = Math.sin(a);
        ECHO.Combat.telegraph({ x: e.x, y: e.y, angle: a, len: 12, width: 0.8, life: 0.35, shape: 'line', color: 'rgba(255,250,220,0.6)' });
        for (let s = 0.5; s < 12; s += 0.6) ECHO.Combat.fx.push({ kind: 'p', x: e.x + ux * s, y: e.y + uy * s, vx: 0, vy: -1, t: 0, life: 0.5, color: '#fff6c8', size: 3 });
        for (const o of Gd.foes(game, e, 13)) { const px = o.x - e.x, py = o.y - e.y, al = px * ux + py * uy; if (al > 0 && al < 12 && Math.abs(px * uy - py * ux) < 0.9) { blow(o, 2.2); o.burn = Math.max(o.burn || 0, 2); } }
        Gd.cast(game, e, 'Sunfire Lance', '#fff6c8');
        return;
      }
      if (k.includes('chain') && Gd.ready(e, 'chain')) {
        e.sk.chain = 6;
        let cur = e, hit = new Set();
        for (let i = 0; i < 5; i++) {
          const nx = Gd.foes(game, e, 14).filter(o => !hit.has(o)).sort((a, b) => U.dist(a.x, a.y, cur.x, cur.y) - U.dist(b.x, b.y, cur.x, cur.y))[0];
          if (!nx || U.dist(nx.x, nx.y, cur.x, cur.y) > 7) break;
          hit.add(nx);
          const n = 8; for (let j = 0; j <= n; j++) ECHO.Combat.fx.push({ kind: 'p', x: U.lerp(cur.x, nx.x, j / n) + (Math.random() - 0.5) * 0.3, y: U.lerp(cur.y, nx.y, j / n) - 0.6 + (Math.random() - 0.5) * 0.3, vx: 0, vy: 0, t: 0, life: 0.3, color: '#bfe0ff', size: 3 });
          blow(nx, 1.3); cur = nx;
        }
        if (hit.size) Gd.cast(game, e, 'Chain Lightning', '#bfe0ff');
        return;
      }
      if (k.includes('shadowstep') && Gd.ready(e, 'step')) {
        e.sk.step = 6;
        const a = Math.atan2(f.y - e.y, f.x - e.x), sp = ECHO.Ent.freeSpot(game.world, f.x + Math.cos(a) * 1.2, f.y + Math.sin(a) * 1.2, 2);
        if (sp) { ECHO.Combat.burst(e.x, e.y, '#1a1a22', 14, 3, 0.5, 2); e.x = sp.x; e.y = sp.y; ECHO.Combat.burst(e.x, e.y, '#3a3a48', 14, 3, 0.5, 2); }
        if (full && f.hp < f.maxHp * 0.35) blow(f, 50); else blow(f, 2);
        Gd.cast(game, e, 'Shadowstep', '#c8c8d8');
        return;
      }
      if ((k.includes('quake') || k.includes('thunder')) && Gd.ready(e, 'stun2')) {
        e.sk.stun2 = 8;
        for (const o of Gd.foes(game, e, 5)) { o.stagger = Math.max(o.stagger || 0, 1.8); blow(o, 0.8); }
        ECHO.Combat.ring(e.x, e.y, 5, 'rgba(220,200,160,0.9)', 0.6); game.shake(0.3);
        Gd.cast(game, e, k.includes('quake') ? 'Earthshaker' : 'Thunderclap', '#d8c8a0');
        return;
      }
      if (k.includes('taunt') && Gd.ready(e, 'taunt') && full) { e.sk.taunt = 10; e.tauntT = 5; for (const o of Gd.foes(game, e, 10)) { o.aggro = true; o.target = e; } Gd.cast(game, e, 'Iron Challenge', '#ffcf8a'); }
    },
    cast(game, e, name, col) {
      ECHO.Combat.floater(e.x, e.y - 1.8, name, col, true);
      e.state = 'cast'; e.attackT = 0.25;
      const w = game.world.npcs[e.npcId], D = Gt().def(w);
      if (D && !(game.pl.seenArts || {})[name]) {
        game.pl.seenArts = game.pl.seenArts || {}; game.pl.seenArts[name] = 1;
        const s = D.skills.find(x => x[1] === name);
        if (s) setTimeout(() => UI().toast(`${w.first} ${w.ng.title}: ${name} — ${s[2]}`, 'study', 6), 300);
      }
    },

    // On your character page: where you stand with the Guard.
    cardHtml(world, pl) {
      const G = Gt();
      if (!world.gates) return '';
      const lv = ECHO.Prowess.level(pl), r = pl.guard, m = r && world.npcs[r.mentor];
      if (!r) return lv >= G.MIN ? `<h3 class="gold">The National Guard</h3><p class="dim">You are strong enough to join (level ${G.MIN}). Speak to a warden at any of the three gates — they will train you beyond it.</p>` : '';
      return `<h3 class="gold">The National Guard</h3><div class="card"><b>${esc(G.rankOf(lv))}</b> of the Guard since day ${r.joined}${m ? ` · mentor: ${esc(P().fullTitle(world, m))}` : ''}<div class="dim" style="font-size:13px">${r.trips || 0} times through a gate · ${r.kills || 0} beasts killed beyond them${pl.guard.pace === 'hard' ? ' · your mentor pushes you hard' : ''}</div><div class="dim" style="font-size:12px">${G.list(world).map(g => `${esc(U.cap(g.name))}: ${g.slain && world.day - g.slain < 10 ? 'its sovereign lies dead' : 'its sovereign waits'}${(g.apex || []).length ? ` · apex: ${esc(g.apex[0].name)} Lv ${g.apex[0].lvl}` : ''}`).join('<br>')}</div></div>`;
    },
    // ------------------------------------------------------------ talking to them
    dialogue(world, npc, ent, pl, ui) {
      if (!npc.ng) return;
      const game = ECHO.Game, G = Gt(), g = G.list(world)[npc.ng.gate], th = g && G.THEMES[g.theme], D = G.def(npc), lv = ECHO.Prowess.level(pl);
      const L = ECHO.GateWorld.inside(game);
      ui.add('What is this gate?', () => ui.say(th ? `${U.cap(g.name)}. Beyond it lies ${th.world}. ${th.blurb}\n\nWhat lives there is level ${G.MIN} at the door and up to ${G.TOP} at the heart. Below level ${G.MIN}, standing where you are standing would stop your heart.` : 'A door that should not be open.'));
      ui.add('Who are the National Guard?', () => {
        const ms = G.members(world);
        ui.say(`Six of us, under the crown but answerable to no lord: we hold the three gates so that nothing beyond them comes through. Each of us can stand against a beast of level ${G.TOP}.\n\n${ms.map(m => `${P().fullTitle(world, m)} — ${G.list(world)[m.ng.gate] ? G.list(world)[m.ng.gate].name : ''}, level ${ECHO.Delvers.lv(m)}`).join('\n')}\n\nAnyone of level ${G.MIN} may take the oath. We train them ourselves — through the gate, at our side.`);
      });
      if (D) ui.add('How do you fight?', () => ui.say(`${D.line}\n\n${D.skills.map(s => `${s[1]}: ${s[2]}`).join('\n')}`));
      if (L) {
        ui.add('Take me back out.', () => { UI().closePanel(); ECHO.Interior.leave(game); });
        if (pl.guard) ui.add(pl.guard.pace === 'hard' ? 'Ease off — beasts my own size.' : 'Push me harder.', () => { pl.guard.pace = pl.guard.pace === 'hard' ? null : 'hard'; ui.say(pl.guard.pace === 'hard' ? 'Then we go deeper. Don\'t make me carry you out.' : 'Fine. Steady work makes strong wardens.'); ui.render(); });
        return;
      }
      if (!pl.guard) {
        ui.add('I want to join the National Guard.', () => {
          if (lv < G.MIN) return ui.say(`${npc.first} looks you up and down. "Not yet. Level ${G.MIN} — below that, the gate kills you before anything in it gets the chance. You are level ${lv}. Come back when you are not."`);
          G.join(world, pl, npc);
          ECHO.Music.stinger('echo');
          UI().banner('Sworn to the National Guard', `${npc.first} ${npc.ng.title} is your mentor`, false);
          ui.say(`"Then say it after me: I hold the door. Whatever is behind it stays behind it."\n\nYou say it. ${npc.first} grips your arm. "Good. You are one of us now — a recruit. When you are ready, I take you through, and you learn to live there. Stay close, do what I say, and you will come back stronger every time."`);
          ui.render();
        });
      } else {
        ui.add(`Train me — take me through ${g ? g.name : 'the gate'}.`, () => { UI().closePanel(); ECHO.GateWorld.enter(game, g, npc); });
        const r = pl.guard;
        ui.add('How am I doing?', () => ui.say(`You are a ${G.rankOf(lv).toLowerCase()} of the Guard, level ${lv}. ${r.trips || 0} times through the gate, ${r.kills || 0} kills beyond it.${lv < 300 ? ' Stay near the door until you are 260 or so.' : lv < 620 ? ' You can hold the middle of it now.' : ' There is not much left in there that can stand in front of you.'}`));
      }
      // your companion can take the oath too
      const comp = pl.companion && world.npcs[pl.companion];
      if (comp && comp.status === 'alive' && !G.joined(world, comp)) {
        const clv = ECHO.Delvers.lv(comp);
        ui.add(`${comp.first} wants to take the oath too.`, () => {
          if (clv < G.MIN) return ui.say(`"Not at level ${clv}. Bring ${comp.sex === 'f' ? 'her' : 'him'} back at ${G.MIN}."`);
          G.join(world, comp, npc);
          ui.say(`${comp.first} takes the oath. "${comp.first} of the National Guard," ${npc.first} says. "Welcome."`);
          ui.render();
        });
      }
    }
  };
})();
