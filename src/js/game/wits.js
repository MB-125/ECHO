// Wits: enemies who read how you fight.
//
// Everything you do in a fight is watched. Roll away from every swing and
// they start holding the blow until the roll is spent, then step in after you
// — and if you always roll the same way, they swing wide to that side. Hide
// behind your shield and they stop hacking at it and kick it aside. Wind up
// a big heavy blow and the ones who've seen it before step back out of reach,
// let it whiff, and punish the recovery. Plink at them from range and they
// stop walking in straight lines: they weave, close fast, and the shields come
// up whenever you draw.
//
// Each fighter learns at its own pace (a veteran sergeant in a few exchanges,
// a goblin slower, a skeleton never) and calls out what it has seen, which
// teaches the rest of the squad. People who survive a fight with you —
// who ran, or yielded, or were left standing — remember. Meet them again and
// they already know your tricks. The cure is the same as in life: mix it up.
// Habits fade when you stop leaning on them.
(function () {
  const { U } = ECHO;
  const PC = () => ECHO.PlayerCtl;
  const KINDS = ['dodge', 'block', 'heavy', 'ranged'];
  const LEARN_AT = 0.42;

  // how quickly a kind of foe picks up on things
  const SMART = {
    goblin: 0.65, shaman: 0.6, warlord: 0.9, cultist: 0.6, necromancer: 0.7, hollowking: 1, ogre: 0.45, troll: 0.25,
    ghoul: 0.3, wraith: 0.5, spider: 0.15, queen: 0.35, giantrat: 0, skeleton: 0.08, skelarcher: 0.1,
    brigand: 0.8, chief: 1, wight: 0.2, king: 0.5
  };
  // who can plant a boot in a shield
  const KICKERS = new Set(['goblin', 'warlord', 'cultist', 'ogre', 'troll', 'brigand', 'chief', 'king', 'ghoul']);

  const LINES = {
    person: {
      dodge: ['Watch the roll!', 'Wait for the roll — then strike!', 'Hold your swing, they always dodge!', 'Let them roll first!'],
      left: ['Always rolls to the left, this one!', 'Left! They go left!'],
      right: ['Always rolls to the right!', 'Right! Watch the right!'],
      block: ['Kick that shield aside!', 'Break the guard!', 'Stop hacking at the shield — kick it!'],
      heavy: ['Big swing coming — back off!', 'Let it whiff, then hit!', 'Here comes the big one!'],
      ranged: ['Close the gap!', 'Don\'t walk straight at a bow!', 'Zig-zag! Get in close!', 'Shields up, they\'re drawing!'],
      vet: ['You again. I remember how you fight.', 'I know your tricks now.', 'Ha — I\'ve seen this dance before.', 'Remember me? I remember you.']
    },
    goblin: {
      dodge: ['It rolls! Wait… wait…', 'Hehe — rolly one!'],
      left: ['Goes left! Always left!'], right: ['Goes right! Always right!'],
      block: ['Kick the shiny shield!', 'Boot it! Boot it!'],
      heavy: ['Big hit! Run away! …then stab!'],
      ranged: ['Pointy sticks! Wiggle! Wiggle!', 'Get close, get close!'],
      vet: ['YOU. We remember you.']
    }
  };

  const W = ECHO.Wits = {
    // your habits, 0..1, built from what you do and fading when you stop
    h: { dodge: 0, block: 0, heavy: 0, ranged: 0, side: 0 },
    t: 0,
    smart(e) {
      if (e.isCompanion || e.pet) return 0;
      if (e.type === 'person') return 0.45 + ((e.npcId && ECHO.Game.world.npcs[e.npcId] ? ECHO.Game.world.npcs[e.npcId].skill.fight : 30) / 160);
      if (e.foe) { const k = e.species && SMART[e.species] != null ? e.species : e.foe.look; return SMART[k] != null ? SMART[k] : 0.4; }
      return 0;
    },
    kicker(e) { return e.type === 'person' ? !e.gear.bow : !!e.foe && (KICKERS.has(e.species) || KICKERS.has(e.foe.look)); },
    voice(e) {
      if (e.type === 'person') return LINES.person;
      if (e.foe && (e.species === 'goblin' || e.species === 'shaman' || e.species === 'warlord')) return LINES.goblin;
      if (e.foe && (e.foe.look === 'brigand' || e.foe.look === 'chief')) return LINES.person;
      return null;
    },
    say(e, key, force) {
      const v = W.voice(e); if (!v || !v[key]) return;
      if (!force && e.sayT > 0.3) return;
      e.say = v[key][Math.floor(Math.random() * v[key].length)]; e.sayT = 2.2;
    },
    // ------------------------------------------------------------ what you do
    note(game, kind, o = {}) {
      if (game.combatT == null || game.time - game.combatT > 8) {
        // nobody around to see it? it barely counts
        const watched = game.ents.some(e => !e.dead && !e.hidden && e !== game.pe && game.hostileTo(e, game.pe) && U.dist(e.x, e.y, game.pe.x, game.pe.y) < 10);
        if (!watched) return;
      }
      const h = W.h, bump = { dodge: 0.16, block: 0.1, blockhit: 0.14, heavy: 0.22, ranged: 0.12 }[kind] || 0.1;
      const k = kind === 'blockhit' ? 'block' : kind;
      h[k] = Math.min(1, h[k] + bump * (1 - h[k] * 0.5));
      // a different move dilutes the others a little: variety is the cure
      for (const j of KINDS) if (j !== k) h[j] *= 0.94;
      if (kind === 'dodge' && o.dir != null) {
        const pe = game.pe;
        let near = null, nd = 5;
        for (const e of game.ents) {
          if (e.dead || e.hidden || e === pe || !game.hostileTo(e, pe)) continue;
          const d = U.dist(e.x, e.y, pe.x, pe.y);
          const w = e.state === 'windup' || e.state === 'lunge' ? d - 2 : d;
          if (w < nd) { nd = w; near = e; }
        }
        if (near) {
          const from = Math.atan2(pe.y - near.y, pe.x - near.x);
          const rel = U.angleDiff(from, o.dir);
          // away is away; otherwise which way round, as the attacker sees it
          if (Math.abs(rel) > 0.75 && Math.abs(rel) < 2.4) h.side = U.clamp(h.side * 0.72 + Math.sign(rel) * 0.28, -1, 1);
          else h.side *= 0.85;
        }
      }
    },
    // ------------------------------------------------------------ learning
    know(game, e) {
      if (e.know) return e.know;
      e.know = { dodge: 0, block: 0, heavy: 0, ranged: 0, side: 0, said: {} };
      // a veteran of an earlier fight with you starts out knowing
      const npc = e.npcId && game.world.npcs[e.npcId];
      const now = game.world.day * 1440 + game.world.minute;
      // a fresh meeting, not the same fight picked up again after a search
      const fresh = npc && (npc.knowsAt == null || now - npc.knowsAt > 60);
      if (npc && npc.knows) {
        for (const k of KINDS) e.know[k] = (npc.knows[k] || 0) * 0.85;
        e.know.side = npc.knows.side || 0;
        e.veteran = true;
        for (const k of KINDS) if (e.know[k] >= LEARN_AT) e.know.said[k] = true;
      }
      if (npc && fresh) npc.foughtYou = (npc.foughtYou || 0) + 1;
      if (e.veteran && fresh && npc.foughtYou >= 2) W.say(e, 'vet', true);
      if (npc) npc.knowsAt = now;
      return e.know;
    },
    learn(game, e, dt) {
      const K = W.know(game, e), s = W.smart(e);
      if (s <= 0) return;
      const rate = dt * (0.05 + s * 0.16);
      for (const k of KINDS) {
        const tgt = W.h[k];
        K[k] += (tgt - K[k]) * (tgt > K[k] ? rate : rate * 0.4);
        if (K[k] >= LEARN_AT && !K.said[k]) {
          K.said[k] = true;
          // the first to see it calls it out, and the squad hears
          let key = k;
          if (k === 'dodge' && Math.abs(W.h.side) > 0.55) key = W.h.side > 0 ? 'left' : 'right';
          W.say(e, key, true);
          for (const o of game.ents) {
            if (o === e || o.dead || !o.know || U.dist(o.x, o.y, e.x, e.y) > 12 || !W.smart(o)) continue;
            o.know[k] = Math.max(o.know[k], K[k] * 0.85); o.know.said[k] = true;
          }
          const tips = game.pl.tips || (game.pl.tips = {});
          if (!tips.wits) {
            tips.wits = 1;
            ECHO.UI.toast('They\'re reading you. Enemies learn your habits — mix up your rolls, blocks, heavy blows and arrows.', 'info', 7);
          }
        }
      }
      K.side += (W.h.side - K.side) * rate;
    },
    remember(game, e) {
      const npc = e.npcId && game.world.npcs[e.npcId];
      if (!npc || !e.know) return;
      const k = npc.knows || (npc.knows = {});
      for (const j of KINDS) k[j] = Math.round(Math.max(k[j] || 0, e.know[j]) * 100) / 100;
      k.side = Math.round(e.know.side * 100) / 100;
      npc.knowsAt = game.world.day * 1440 + game.world.minute;
    },
    reads(e, k) { return e.know && e.know[k] >= LEARN_AT; },
    // ------------------------------------------------------------ counters
    // Movement: back off from a heavy wind-up, weave against the bow.
    move(game, e, target, d, ang, speed, dt, o = {}) {
      if (target !== game.pe || !e.know) return false;
      const pc = PC(), world = game.world;
      // a big blow is coming: step out of reach, then punish the recovery
      if (W.reads(e, 'heavy') && pc.heavyHold && d < 3.3 && !o.archer) {
        e.moving = true; e.state = 'chase';
        ECHO.Ent.seek(world, e, e.x - Math.cos(ang) * 2, e.y - Math.sin(ang) * 2, speed * 0.95, dt);
        e.dir = ang; e.flip = Math.cos(ang) < 0;
        if (!e.heavyCalled) { e.heavyCalled = true; W.say(e, 'heavy'); }
        e.punishFrom = game.time;
        return true;
      }
      e.heavyCalled = false;
      // against the bow: weave in, quickly; shields up whenever you draw
      if (W.reads(e, 'ranged') && !o.archer && d > 2.4 && d < 14) {
        if (e.gear && e.gear.shield && (pc.drawing || pc.charging)) e.blocking = true;
        // jink left and right as they come, so a drawn arrow has nothing steady to follow
        const jink = Math.sin(game.time * 2.6 + (e.id || 0) * 1.7) * 0.85 * Math.min(1, (d - 1.5) / 3);
        const px = e.x + Math.cos(ang + jink) * 2, py = e.y + Math.sin(ang + jink) * 2;
        // in the open they weave straight at you; round obstacles they path
        if (e.x < 9000 && ECHO.Ent.lineOfSight(world, e.x, e.y, px, py)) ECHO.Ent.seek(world, e, px, py, speed * 1.18, dt, 0.1);
        else ECHO.Ent.travel(world, e, px, py, speed * 1.18, dt);
        e.state = 'chase';
        return true;
      }
      return false;
    },
    // You just swung big and missed (or not): the readers rush the opening.
    punish(game, e) {
      if (e.punishGo && game.time - e.punishGo < 1.1) return true;
      if (!W.reads(e, 'heavy') || !e.punishFrom || game.time - e.punishFrom > 2.2) return false;
      if (game.pe.cd > 0.3 && !(PC().heavyHold)) { e.punishGo = game.time; e.punishFrom = 0; return true; }
      return false;
    },
    // What kind of blow to throw, given what they know. Returns a plan.
    plan(game, e, d) {
      const pe = game.pe, pc = PC();
      if (!e.know) return null;
      if (e.punishGo && game.time - e.punishGo < 1.1) { e.punishGo = 0; return { kind: 'punish', wind: -0.16, say: e.type === 'person' ? 'Now!' : null }; }
      // a raised shield, and they know you turtle: kick it
      if (W.reads(e, 'block') && W.kicker(e) && (pe.blocking || Math.random() < e.know.block * 0.5)) return { kind: 'kick', wind: 0.06 };
      // they know you roll: hold the blow, and lean it toward your favourite side
      if (W.reads(e, 'dodge') && Math.random() < 0.35 + e.know.dodge * 0.5) {
        const side = Math.abs(e.know.side) > 0.5 ? Math.sign(e.know.side) : 0;
        return { kind: 'delay', wind: 0.22 + Math.random() * 0.18, side };
      }
      return null;
    },
    // At the end of the wind-up: keep holding while you're mid-roll.
    hold(game, e, dt) {
      const p = e.readPlan;
      if (!p || p.kind !== 'delay') return false;
      const pc = PC();
      const rolling = pc.dodgeT > 0 || (pc.rollEndT != null && game.time - pc.rollEndT < 0.08);
      if (rolling && (p.held = (p.held || 0) + dt) < 0.55) { e.t -= dt; return true; }
      // step into where you came out of the roll
      const pe = game.pe;
      const ang = Math.atan2(pe.y - e.y, pe.x - e.x);
      if (p.held > 0) {
        const d = U.dist(e.x, e.y, pe.x, pe.y);
        if (d > 1.1) ECHO.Ent.move(game.world, e, Math.cos(ang) * Math.min(1.2, d - 1), Math.sin(ang) * Math.min(1.2, d - 1));
      }
      e.aimAngle = e.aim = ang + (p.side ? -p.side * 0.32 : 0);
      return false;
    },
    // Modify the blow as it lands.
    blow(game, e, o) {
      const p = e.readPlan; e.readPlan = null;
      if (!p) return o;
      if (p.kind === 'kick') {
        o.arc = 1.1; o.range = Math.min(o.range, 1.35); o.dmg *= 0.45; o.guardbreak = true; o.unblockable = true; o.knock = 0.4; o.kick = true;
      } else if (p.kind === 'delay') {
        o.arc += p.side ? 0.6 : 0.35; o.range += p.held > 0 ? 0.35 : 0.15; o.read = true;
      } else if (p.kind === 'punish') o.dmg *= 1.15;
      return o;
    },
    // After the blow: did the read work?
    landed(game, e, o, hits) {
      const pe = game.pe;
      if (!hits || !hits.includes(pe)) return;
      if (o.kick) {
        game.pl.stamina = Math.max(0, game.pl.stamina - 28);
        pe.stagger = Math.max(pe.stagger || 0, 0.42);
        ECHO.Combat.floater(pe.x, pe.y - 1.2, 'kicked!', '#ffb060');
        if (ECHO.Sfx) ECHO.Sfx.play('shieldBlock', { pitch: 0.6 });
      } else if (o.read) ECHO.Combat.floater(pe.x, pe.y - 1.2, 'read your roll', '#ffb060');
    },
    // ------------------------------------------------------------ each frame
    update(game, dt) {
      const pe = game.pe;
      if (!pe) return;
      // habits fade (a half-life of about a minute), faster out of a fight
      const fighting = game.combatT != null && game.time - game.combatT < 6;
      const fade = Math.exp(-dt / (fighting ? 90 : 30));
      for (const k of KINDS) W.h[k] *= fade;
      W.h.side *= fade;
      W.t -= dt; if (W.t > 0) return;
      const step = 0.25; W.t = step;
      for (const e of game.ents) {
        if (e.dead || e.hidden || e === pe || e.isCompanion || e.pet) continue;
        const engaged = (e.target === pe || (e.foe && e.aggro)) && U.dist(e.x, e.y, pe.x, pe.y) < 12;
        if (engaged) { W.learn(game, e, step); e.knowT = game.time; }
        // came through a fight with you and lived: remember it
        else if (e.know && e.npcId && e.knowT && game.time - e.knowT > 3) { W.remember(game, e); e.knowT = 0; e.know = null; e.veteran = false; }
        if ((e.rout || e.yielded) && e.know && e.npcId) W.remember(game, e);
      }
    }
  };
})();
