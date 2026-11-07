// The realm's arms, in the field (what arsenal.js researches, worn and wielded).
//
//   • A soldier or guard of a crown wears its arms: the higher the tier, the more life, the harder
//     the blows, the more steel and spell turns aside (iron to riftforged).
//   • From runed steel a quarter of them are battle-mages, casting bolts from wands; from aether-
//     plate they mend the soldiers about them in a fight.
//   • From spellforged every soldier wears a ward that takes the first blows (it comes back if
//     they are left alone a few moments).
//   • The great towns of a spellforged realm have spell towers: an enemy of the crown in their
//     streets is marked from above, and struck where the mark falls (step out of it).
//   • Fight a great town's soldiers and the garrison turns out: more of them come running, a few
//     at a time, as long as you fight and they have soldiers to send.
//   • A realm you have spilled the blood of, with scryers, finds you anywhere in the world: a
//     hunting party of its best comes after you every few minutes until the price on your head is
//     paid (go to its court, or let the days pass) — and they are many and strong.
(function () {
  const { U } = ECHO;
  const Ar = () => ECHO.Arsenal;
  const P = () => ECHO.People;

  const Am = ECHO.Arms = {
    t: 0, strikes: [], reinf: {}, hunt: {}, _looks: {},
    reset() { Am.strikes = []; Am.reinf = {}; Am.hunt = {}; },
    // ------------------------------------------------------------ worn
    outfit(game, e, npc) {
      const A = Ar(), world = game.world;
      if (!A || !npc || !(e.role === 'guard' || e.role === 'soldier') || !A.fighter(npc)) return;
      const f = world.factions[npc.faction];
      if (!f || f.fallen || !(f.type === 'kingdom' || f.type === 'order')) return;
      const t = A.tier(world, f.id), T = A.TIERS[t];
      e.armsTier = t; e.armsFid = f.id; e.armsCol = T.col; e.armsName = T.name;
      if (t <= 0) return;
      // (a soldier of the crown is not a wolf of its level: drilled, plated, warded, it outlasts one several times over)
      e.hp = e.maxHp = Math.round(e.maxHp * (1 + 0.35 * t));
      e.dmgMul = (e.dmgMul || 1) * (1 + 0.18 * t);
      const a = Math.min(0.5, 0.06 * t), m = Math.min(0.45, 0.055 * t);
      e.resist = Object.assign({}, e.resist || {});
      e.resist.melee = Math.max(e.resist.melee || 0, a); e.resist.ranged = Math.max(e.resist.ranged || 0, a);
      e.resist.magic = Math.max(e.resist.magic || 0, m); e.resist.fire = Math.max(e.resist.fire || 0, m * 0.8);
      if (t >= A.MAGES && ECHO.hashStr(npc.id + ':mage') % 4 === 0) { e.mage = true; e.gear.bow = true; e.gear.crossbow = false; e.gear.spear = false; e.gear.shield = false; }
      if (t >= A.WARDS) { const k = Math.min(0.6, 0.2 + 0.08 * (t - A.WARDS)), w = Math.round(e.maxHp * k); e.ward = { hp: w, max: w, col: T.col, at: 0 }; }
      e.gearLook = Am.look(t) || e.gearLook;
    },
    // the arms of a tier, as they look (cut from the same cloth as the forge's own)
    look(t) {
      if (Am._looks[t] !== undefined) return Am._looks[t];
      const G = ECHO.Gear;
      if (!G || !G.look || t < 1) return (Am._looks[t] = null);
      const rar = ['common', 'common', 'fine', 'rare', 'epic', 'epic', 'legendary', 'legendary'][t] || 'legendary';
      try {
        const armor = G.look({ kind: 'armor', rarity: rar, plus: Math.min(5, t), affix: t >= 2 ? 'arcane' : null, def: 12 + 2 * t, starforged: t >= 6 ? 1 : 0 });
        const blade = G.look({ kind: 'sword', wclass: 'sword', rarity: rar, plus: Math.min(5, t), affix: t >= 2 ? 'arcane' : null, starforged: t >= 6 ? 1 : 0 });
        return (Am._looks[t] = { blade, bow: null, armor, rank: null, npc: true, key: 'arms' + t });
      } catch (err) { return (Am._looks[t] = null); }
    },
    wardTake(game, e, dmg) {
      const W = e.ward, take = Math.min(W.hp, dmg);
      W.hp -= take; W.at = game.time;
      ECHO.Combat.ring(e.x, e.y, (e.r || 0.34) + 0.35, W.hp > 0 ? 'rgba(184,154,255,0.55)' : 'rgba(255,255,255,0.9)', 0.2);
      if (W.hp <= 0) ECHO.Combat.floater(e.x, e.y - 1.3, 'ward broken', W.col || '#b89aff', true);
      else if (Math.random() < 0.35) ECHO.Combat.floater(e.x, e.y - 1.2, 'warded', W.col || '#b89aff');
      return dmg - take;
    },
    // ------------------------------------------------------------ each frame
    tick(game, dt) {
      const pe = game.pe, pl = game.pl, world = game.world, A = Ar();
      if (!A || !pe || !pl || pl.capture || game.defeating) return;
      // the strikes of the towers, falling
      if (Am.strikes.length) {
        const now = game.time, due = Am.strikes.filter(s => s.at <= now);
        if (due.length) {
          Am.strikes = Am.strikes.filter(s => s.at > now);
          for (const s of due) {
            ECHO.Combat.ring(s.x, s.y, s.r, 'rgba(220,200,255,0.95)', 0.4);
            for (let i = 0; i < 14; i++) ECHO.Combat.fx.push({ kind: 'p', x: s.x + (Math.random() - 0.5) * 0.4, y: s.y + (Math.random() - 0.5) * 0.4, vx: 0, vy: 0, t: 0, life: 0.3, color: i % 3 ? s.col : '#ffffff', size: 3, h0: i * 0.6, vz: 0, spark: true });
            if (game.light) game.light(s.x, s.y, 7, 1, s.col);
            if (!pe.dead && U.dist(pe.x, pe.y, s.x, s.y) < s.r + 0.3 && s.from && !s.from.dead) ECHO.Combat.damage(pe, s.dmg, { type: 'magic', from: s.from, angle: 0, unblockable: true, pure: true });   // (a share of your life: armour does not turn it, only stepping out of the mark)
          }
        }
      }
      Am.t -= dt;
      if (Am.t > 0) return;
      Am.t = 0.5;
      const inside = ECHO.Interior.cur;
      // wards come back to those left alone a while; the battle-mages mend those about them; and a
      // hunt called off (the price paid, or cooled) sends its hunters home
      let hunting = null;
      for (const e of game.ents) {
        if (e.dead || !e.armsTier) continue;
        if (e.hunter) {
          if (!hunting) hunting = new Set(Am.hunters(game).map(f => f.id));
          if (!e._calledOff && !hunting.has(e.hunter)) { e._calledOff = game.time; e.aggro = false; e.target = null; e.state = 'idle'; e.say = 'The hunt is called off.'; e.sayT = 2.5; }
          else if (e._calledOff && game.time - e._calledOff > 6 && !e.aggro) e.despawnSoon = true;
        }
        if (e.ward && e.ward.hp < e.ward.max && game.time - (e.ward.at || 0) > 6) e.ward.hp = Math.min(e.ward.max, e.ward.hp + e.ward.max * 0.2);
        if (e.mage && e.armsTier >= A.HEAL && game.time - (e._mendT || -99) > 6 && (e.aggro || e.state === 'chase' || e.target)) {
          const hurt = game.ents.filter(o => !o.dead && o.armsFid === e.armsFid && o.hp < o.maxHp * 0.7 && Math.abs(o.x - e.x) < 6 && Math.abs(o.y - e.y) < 6);
          if (hurt.length) {
            e._mendT = game.time;
            for (const o of hurt) { o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.12); ECHO.Combat.ring(o.x, o.y, 1, 'rgba(140,255,200,0.8)', 0.4); }
            ECHO.Combat.floater(e.x, e.y - 1.4, 'mending', '#8fffc8');
          }
        }
      }
      if (inside) return;
      const s = ECHO.World.settlementAt(world, pe.x, pe.y, 26);
      const foe = s && Am.foeOf(game, s);
      if (foe) { Am.towers(game, s, foe); Am.turnOut(game, s, foe); }
      Am.hunts(game, dt);
    },
    // Is the crown that holds this town after you? (a price on your head, or you are fighting its people)
    foeOf(game, s) {
      const pl = game.pl, world = game.world, f = world.factions[s.faction];
      if (!f || f.fallen || !(f.type === 'kingdom' || f.type === 'order')) return null;
      const fighting = game.time - (game.lastHitGuard || -99) < 25 && game.ents.some(o => !o.dead && o.armsFid === f.id && o.target === game.pe && U.dist(o.x, o.y, game.pe.x, game.pe.y) < 18);
      const wanted = (pl.wanted && pl.wanted[f.id] || 0) >= 40 && ECHO.Arsenal.rs(world, f).harm > 0;
      return fighting || wanted ? f : null;
    },
    great(world, s, f) { return f.capital === s.id || s.kind === 'capital' || s.kind === 'temple' || s.milTier === 'city'; },
    // ------------------------------------------------------------ the towers
    towers(game, s, f) {
      const world = game.world, A = Ar(), t = A.tier(world, f.id), pe = game.pe;
      if (t < A.TOWERS || !Am.great(world, s, f)) return;
      const key = s.id;
      if (game.time - (Am['_tw' + key] || -99) < Math.max(2.2, 4 - 0.3 * (t - A.TOWERS))) return;
      Am['_tw' + key] = game.time;
      const from = game.ents.find(o => !o.dead && o.armsFid === f.id && U.dist(o.x, o.y, s.x, s.y) < 40);
      if (!from) return;
      if (!Am['_twSaid' + key]) { Am['_twSaid' + key] = 1; game.ui.toast(`The spell towers of ${s.name} wake: a mark of light falls where you stand, and the strike follows it. Keep moving.`, 'warn', 7); }
      // the strike, as a soldier of their level would land it: a share of your life, more the stronger they are
      const L = A.lv(world, f.id) * A.share(world, s, f), me = ECHO.Prowess.level(game.pl);
      const dmg = Math.round(game.pl.maxHp * 0.07 * U.clamp(L / Math.max(1, me), 0.25, 2) * (1 + 0.12 * (t - A.TOWERS)));
      const x = pe.x + (pe.vx || 0) * 0.3, y = pe.y + (pe.vy || 0) * 0.3, col = A.TIERS[t].col;
      ECHO.Combat.telegraph({ x, y, cx: x, cy: y, radius: 1.5, life: 1.1, shape: 'circle', color: 'rgba(200,170,255,0.4)' });
      Am.strikes.push({ x, y, r: 1.5, at: game.time + 1.1, dmg, from, col });
    },
    // ------------------------------------------------------------ the garrison turns out
    turnOut(game, s, f) {
      const world = game.world, A = Ar(), pe = game.pe;
      if (A.tier(world, f.id) < 1 || !Am.great(world, s, f)) return;
      const R = Am.reinf[s.id] || (Am.reinf[s.id] = { t: 0, n: 0 });
      if (game.time - R.t < 14) return;
      const live = game.ents.filter(o => !o.dead && o.reinf === s.id).length;
      if (live >= 8) return;
      R.t = game.time;
      const spawned = new Set(game.ents.filter(o => o.npcId && !o.dead).map(o => o.npcId));
      let pool = P().residents(world, s).filter(n => A.fighter(n) && !spawned.has(n.id) && n.id !== s.ruler && n.title !== 'Marshal').sort((a, b) => ECHO.Delvers.lv(b) - ECHO.Delvers.lv(a));
      // its own all out: the soldiers of the realm's towns about it ride in
      if (!pool.length) {
        const near = new Set(world.settlements.filter(o => o.faction === f.id && o.id !== s.id && Math.abs(o.x - s.x) + Math.abs(o.y - s.y) < 110).map(o => o.id));
        pool = P().alive(world).filter(n => n.faction === f.id && near.has(n.home) && A.fighter(n) && !spawned.has(n.id) && n.title !== 'Marshal' && !(n.jailUntil > world.day)).sort((a, b) => ECHO.Delvers.lv(b) - ECHO.Delvers.lv(a));
        if (pool.length && !R.rode) { R.rode = 1; game.ui.toast(`Riders from the towns about ${s.name} are coming in to its aid.`, 'warn', 5); }
      }
      const n = Math.min(3, pool.length, 8 - live);
      if (!n) return;
      // out of the keep, or the nearest gate: not out of thin air in front of you
      const a0 = Math.atan2(s.y - pe.y, s.x - pe.x);
      for (let i = 0; i < n; i++) {
        const a = a0 + (i - 1) * 0.5, sp = ECHO.Ent.freeSpot(world, pe.x + Math.cos(a) * 15, pe.y + Math.sin(a) * 15, 6);
        if (!sp) continue;
        const e = ECHO.Spawner.makePerson(game, pool[i], sp.x, sp.y, 'guard');
        e.homeSid = s.id; e.reinf = s.id; e.target = pe; e.aggro = true; e.state = 'chase';
        game.addEnt ? game.addEnt(e) : game.ents.push(e);
      }
      R.n += n;
      if (R.n === n) game.ui.toast(`The garrison of ${s.name} turns out: ${f.short}'s soldiers are coming from the keep, more of them the longer you fight.`, 'warn', 6);
      ECHO.Combat.floater(pe.x, pe.y - 2, 'the garrison turns out', '#ff9a5a', true);
      if (ECHO.Sfx) ECHO.Sfx.play('horn', { vol: 0.6 });
    },
    // ------------------------------------------------------------ hunted across the world
    hunters(game) {
      const world = game.world, pl = game.pl, A = Ar(), out = [];
      for (const f of A.powers(world)) {
        if (!((pl.wanted && pl.wanted[f.id] || 0) >= 40)) continue;
        const R = A.rs(world, f);
        if (!(R.harm >= 1) || A.tier(world, f.id) < A.SCRY) continue;
        out.push(f);
      }
      return out;
    },
    hunts(game, dt) {
      const world = game.world, pl = game.pl, pe = game.pe, A = Ar();
      if (pl.flying || (ECHO.GateWorld && ECHO.GateWorld.cur) || pe.inBoat) return;
      for (const f of Am.hunters(game)) {
        const H = Am.hunt[f.id] || (Am.hunt[f.id] = { next: game.time + 45, n: 0 });
        if (game.time < H.next) continue;
        const live = game.ents.filter(o => !o.dead && o.hunter === f.id).length;
        if (live) { H.next = game.time + 20; continue; }
        H.next = game.time + 150 + Math.random() * 90;
        // its best, from its capital first: the hunting party
        const cap = ECHO.Sim.settlement(world, f.capital);
        const spawned = new Set(game.ents.filter(o => o.npcId && !o.dead).map(o => o.npcId));
        const pool = P().alive(world).filter(n => n.faction === f.id && A.fighter(n) && n.loc && !spawned.has(n.id) && n.id !== f.ruler && n.title !== 'Marshal' && !(n.jailUntil > world.day))
          .sort((a, b) => ECHO.Delvers.lv(b) - ECHO.Delvers.lv(a) || (b.home === f.capital) - (a.home === f.capital));
        const R = A.rs(world, f), size = Math.min(7, 3 + Math.floor((pl.wanted[f.id] || 0) / 60) + (R.harm >= 10 ? 1 : 0));
        const party = pool.slice(0, size);
        if (!party.length) continue;
        const a = Math.random() * Math.PI * 2;
        let made = 0;
        for (let i = 0; i < party.length; i++) {
          const sp = ECHO.Ent.freeSpot(world, pe.x + Math.cos(a) * 22 + (Math.random() - 0.5) * 3, pe.y + Math.sin(a) * 22 + (Math.random() - 0.5) * 3, 8);
          if (!sp) continue;
          const e = ECHO.Spawner.makePerson(game, party[i], sp.x, sp.y, 'guard');
          e.hunter = f.id; e.target = pe; e.aggro = true; e.state = 'chase'; e.homeSid = null;
          if (i === 0) { e.label = `Hunter-captain ${party[i].first} ${party[i].last}`; }
          game.addEnt ? game.addEnt(e) : game.ents.push(e);
          made++;
        }
        if (!made) continue;
        H.n++;
        const dir = Math.round(((Math.atan2(Math.sin(a), Math.cos(a)) / (Math.PI / 4)) % 8 + 8) % 8);
        const DIRS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
        game.ui.banner(`Hunted by ${f.short}`, `${made} of its soldiers · from the ${DIRS[dir]}`, true);
        if (H.n === 1) game.ui.toast(`The scryers of ${f.name} have found you${cap ? `, from ${cap.name}` : ''}. A hunting party of its soldiers is coming for you from the ${DIRS[dir]} — and another will follow while there is a price on your head. Pay it at a court of ${f.short}, or wait for the days to cool it.`, 'warn', 10);
        if (ECHO.Sfx) ECHO.Sfx.play('horn', { vol: 0.8 });
      }
    },
    // what you see of it: on the bar of who wants you, the realms that hunt you
    hudLine(game) {
      const hs = Am.hunters(game);
      return hs.length ? 'Hunted by ' + hs.map(f => f.short).join(', ') : '';
    }
  };
  void Ar;
})();
