// Companions: people you can hire to fight beside you.
//
// At any inn there are fighters looking for work — sellswords who hold the
// line with sword and shield, hunters who shoot from behind you, hedge-mages
// who throw fire and close your wounds. They grow stronger as you do, they
// talk (each in their own way), they drink a draught when hurt and fall back
// when badly wounded — and if they fall, they are gone for good.
(function () {
  const { U } = ECHO;
  const P = () => ECHO.People;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const CLASSES = {
    sellsword: { name: 'Sellsword', icon: '🛡', desc: 'Sword and shield. Holds the line and takes the blows meant for you.', hp: 1.6, dmg: 1.15, cost: 1 },
    hunter: { name: 'Hunter', icon: '🏹', desc: 'A bow and a good eye. Shoots from behind you and picks off what you miss.', hp: 1.15, dmg: 1.05, cost: 1.1 },
    mender: { name: 'Hedge-mage', icon: '✦', desc: 'Throws fire, and closes your wounds when you are hurt.', hp: 1.0, dmg: 1.2, cost: 1.35 }
  };
  // What they say, by what they are and what kind of person they are.
  const LINES = {
    enter: { any: ['Stay close. Places like this have teeth.', 'Smells like death down here.', 'Watch the floor.'], brave: ['Let them come.'], cowardly: ['I don\'t like this. I don\'t like this at all.'], greedy: ['There\'d better be gold at the bottom of this.'], pious: ['Lantern light keep us.'] },
    kill: { any: ['Down it goes.', 'That\'s one.', 'Next!'], cruel: ['Squeal, then.'], kind: ['Rest now.'], 'hot-headed': ['Who\'s next?!'] },
    lord: { any: ['We did it. We actually did it.', 'They\'ll sing about this one.', 'Is it dead? Tell me it\'s dead.'] },
    hurt: { any: ['I\'m hit!', 'Ugh — I need a moment!'], brave: ['Only a scratch!'], cowardly: ['I\'m done for — get me out of here!'] },
    heal: { any: ['Hold still — this will sting.', 'Let me see that wound.'] },
    idle: { any: ['Fine weather for a walk.', 'You ever wonder what\'s under all those old ruins?', 'My feet hurt.', 'Where to next?'], greedy: ['I hear there\'s treasure in the deep places.'], curious: ['Have you read the old carvings? They\'re not just words.'], loyal: ['Wherever you go, I go.'], ambitious: ['Stick with you and I\'ll have a name of my own one day.'], pious: ['The Lantern sees us, even out here.'], honest: ['I\'ll be honest — I didn\'t think you\'d last this long.'] },
    level: { any: ['I\'m getting the hang of this.', 'Feeling stronger.'] }
  };

  const C = ECHO.Companions = {
    CLASSES,
    classOf(npc) {
      if (npc.comp && npc.comp.cls) return npc.comp.cls;
      return npc.prof === 'hunter' ? 'hunter' : ['priest', 'herbalist', 'scholar'].includes(npc.prof) ? 'mender' : 'sellsword';
    },
    st(npc) {
      if (!npc.comp) npc.comp = { cls: C.classOf(npc), lv: Math.max(1, Math.round((npc.skill.fight || 20) / 18)), xp: 0, kills: 0, bond: 0, since: null };
      return npc.comp;
    },
    cost(world, npc) { const s = C.st(npc); return Math.round((30 + (npc.skill.fight || 20)) * CLASSES[s.cls].cost * (1 + 0.3 * (s.lv - 1))); },
    // Who is looking for work at this town's inn.
    candidates(world, s, pl) {
      return P().residents(world, s).filter(n => n.status === 'alive' && !n.journey && n.id !== pl.companion && n.prof !== 'ruler' && n.prof !== 'reeve' && !(n.rank >= 2) && !n.title
        && ['wanderer', 'guard', 'hunter', 'herbalist', 'priest'].includes(n.prof) && P().age(world, n) >= 18 && P().age(world, n) < 60).slice(0, 4);
    },
    hire(game, npc) {
      const world = game.world, pl = game.pl;
      const cost = C.cost(world, npc);
      if (pl.gold < cost) return `${npc.first} wants ${cost} crowns.`;
      if (pl.companion && world.npcs[pl.companion]) C.dismiss(game, true);
      pl.gold -= cost; pl.companion = npc.id; npc.loc = null; npc.journey = 'companion';
      C.st(npc).since = world.day;
      for (const e of game.ents) if (e.npcId === npc.id) { e.dead = true; e.vanish = true; }
      P().remember(world, npc, `took up the road with ${pl.first} ${pl.last}`, 'change', null, 3);
      return null;
    },
    dismiss(game, quiet) {
      const world = game.world, pl = game.pl, npc = world.npcs[pl.companion];
      pl.companion = null;
      if (!npc) return;
      npc.loc = npc.home; npc.journey = null;
      for (const e of game.ents) if (e.npcId === npc.id && e.isCompanion) { e.isCompanion = false; e.role = 'villager'; e.faction = npc.faction; }
      if (!quiet) ECHO.UI.toast(`${npc.first} heads back to ${(ECHO.Sim.settlement(world, npc.home) || {}).name || 'town'}.`, 'info', 3);
    },
    // Their strength follows their level.
    apply(game, e, npc) {
      const s = C.st(npc), K = CLASSES[s.cls];
      e.maxHp = Math.round((45 + (npc.skill.fight || 20) * 0.6) * K.hp * (1 + 0.14 * (s.lv - 1)));
      e.hp = Math.min(e.hp || e.maxHp, e.maxHp);
      e.dmgMul = K.dmg * (1 + 0.12 * (s.lv - 1));
      e.gear = e.gear || {};
      e.gear.shield = s.cls === 'sellsword'; e.gear.bow = s.cls === 'hunter'; e.gear.staff = s.cls === 'mender';
      e.compCls = s.cls;
    },
    // Experience comes to them as it comes to you; they stay a step behind.
    gain(game, xp) {
      const world = game.world, pl = game.pl, npc = pl.companion && world.npcs[pl.companion];
      if (!npc || npc.status !== 'alive') return;
      const s = C.st(npc), cap = Math.max(1, ECHO.Prowess.level(pl) - 1) + 1;
      s.xp += xp * 0.9; s.bond = Math.min(100, s.bond + 0.2);
      let up = false;
      while (s.lv < cap && s.xp >= ECHO.Prowess.need(s.lv)) { s.xp -= ECHO.Prowess.need(s.lv); s.lv++; up = true; }
      if (s.lv >= cap) s.xp = Math.min(s.xp, ECHO.Prowess.need(s.lv) * 0.99);
      if (up) {
        const e = game.ents.find(x => x.isCompanion && !x.dead);
        if (e) { C.apply(game, e, npc); e.hp = e.maxHp; ECHO.Combat.floater(e.x, e.y - 1.5, `${npc.first}: level ${s.lv}`, '#9fe0c8', true); C.say(e, npc, 'level'); }
        ECHO.UI.toast(`${npc.first} grows stronger — level ${s.lv} ${CLASSES[s.cls].name.toLowerCase()}.`, 'info', 4);
      }
    },
    say(e, npc, kind, chance = 1) {
      if (!e || Math.random() > chance || (e.sayT > 0 && kind !== 'lord')) return;
      const L = LINES[kind]; if (!L) return;
      const pool = L.any.slice();
      for (const t of npc.traits || []) if (L[t]) pool.push(...L[t], ...L[t]);
      e.say = pool[Math.floor(Math.random() * pool.length)]; e.sayT = 2.6;
    },
    // A companion's own judgement, before the usual fighting: heal you, fall back, drink, cast.
    act(game, e, npc, dt, target) {
      const pe = game.pe, pl = game.pl, s = C.st(npc);
      e.cT = (e.cT || 0) - dt; e.healT = (e.healT || 0) - dt; e.potT = (e.potT || 0) - dt; e.idleT = (e.idleT == null ? 40 + Math.random() * 60 : e.idleT - dt);
      if (e.hurtSaid && e.hp > e.maxHp * 0.6) e.hurtSaid = false;
      // badly hurt: a draught, then fall back behind you
      if (e.hp < e.maxHp * 0.3) {
        if (!e.hurtSaid) { e.hurtSaid = true; C.say(e, npc, 'hurt'); }
        if (e.potT <= 0) { e.potT = 45; e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.45); ECHO.Combat.floater(e.x, e.y - 1.3, `${npc.first} drinks a draught`, '#9fe0c8'); ECHO.Combat.burst(e.x, e.y, '#9fe0c8', 10, 2, 0.5, 2); return true; }
        if (target && U.dist(e.x, e.y, target.x, target.y) < 4) { const a = Math.atan2(e.y - target.y, e.x - target.x); ECHO.Ent.travel(game.world, e, pe.x + Math.cos(a) * 1.5, pe.y + Math.sin(a) * 1.5, e.speed * 1.1, dt); return true; }
      }
      // the hedge-mage closes your wounds
      if (s.cls === 'mender' && e.healT <= 0 && pl.hp < pl.maxHp * 0.5 && U.dist(e.x, e.y, pe.x, pe.y) < 7) {
        e.healT = 16; const amt = Math.round(pl.maxHp * (0.18 + s.lv * 0.012));
        pl.hp = Math.min(pl.maxHp, pl.hp + amt); pe.hp = pl.hp;
        ECHO.Combat.floater(pe.x, pe.y - 1.4, `+${amt} (${npc.first})`, '#9fe0c8'); ECHO.Combat.burst(pe.x, pe.y, '#9fe0c8', 14, 2, 0.7, 2); C.say(e, npc, 'heal', 0.5);
        e.moving = false; return true;
      }
      // ...and throws fire from a distance
      if (s.cls === 'mender' && target && e.cT <= 0) {
        const d = U.dist(e.x, e.y, target.x, target.y);
        if (d < 8 && ECHO.Ent.lineOfSight(game.world, e.x, e.y, target.x, target.y)) {
          e.cT = 2.6; const a = Math.atan2(target.y - e.y, target.x - e.x); e.dir = a;
          ECHO.Combat.shoot(e, a, { kind: 'orb', speed: 9, dmg: (8 + s.lv * 2.2) * (e.dmgMul || 1), life: 1.2, type: 'fire', color: '#ff9a3c', effect: 'burn' });
          if (d < 3) { const b = a + Math.PI; ECHO.Ent.travel(game.world, e, e.x + Math.cos(b) * 2, e.y + Math.sin(b) * 2, e.speed, dt); } else e.moving = false;
          return true;
        }
        if (d < 3.5) { const b = Math.atan2(e.y - target.y, e.x - target.x); ECHO.Ent.travel(game.world, e, e.x + Math.cos(b) * 2, e.y + Math.sin(b) * 2, e.speed, dt); return true; }
      }
      // things to say on the road
      if (!target && e.idleT <= 0) { e.idleT = 70 + Math.random() * 90; C.say(e, npc, 'idle'); }
      return false;
    },
    // Called on any kill near them, and on entering a dungeon.
    event(game, kind, foe) {
      const pl = game.pl, npc = pl && pl.companion && game.world.npcs[pl.companion];
      const e = game.ents.find(x => x.isCompanion && !x.dead);
      if (!npc || !e) return;
      if (kind === 'kill') { C.st(npc).kills++; C.say(e, npc, foe && foe.boss2 ? 'lord' : 'kill', foe && foe.boss2 ? 1 : 0.18); }
      if (kind === 'enter') C.say(e, npc, 'enter', 0.8);
    },
    // A companion's death is for good.
    fell(game, npc) {
      const world = game.world, pl = game.pl;
      if (!npc || pl.companion !== npc.id) return;
      const s = C.st(npc);
      pl.companion = null;
      pl.fallen = pl.fallen || []; pl.fallen.push({ id: npc.id, name: `${npc.first} ${npc.last}`, d: world.day, lv: s.lv, kills: s.kills });
      ECHO.UI.banner(`${npc.first} has fallen`, `${CLASSES[s.cls].name} · level ${s.lv} · ${s.kills} foes slain at your side`, true);
      ECHO.UI.toast(`${npc.first} ${npc.last} is dead. They will not be coming back.`, 'warn', 6);
      ECHO.Chronicle.deed(world, { text: `${npc.first} ${npc.last} fell fighting beside ${pl.first} ${pl.last}.`, importance: 2, x: pl.x, y: pl.y, rep: 0 });
      ECHO.Character.behave(pl, 'protect', -0.1);
    },
    // A card for the character page and the HUD.
    card(world, pl) {
      const npc = pl.companion && world.npcs[pl.companion];
      if (!npc) return (pl.fallen || []).length ? `<h3 class="gold">Companions</h3><p class="dim">Fallen at your side: ${pl.fallen.map(f => `${esc(f.name)} (level ${f.lv})`).join(', ')}. Hire another at any inn.</p>` : `<h3 class="gold">Companions</h3><p class="dim">You travel alone. Fighters look for work at every inn.</p>`;
      const s = C.st(npc), K = CLASSES[s.cls];
      return `<h3 class="gold">Companion</h3><div class="card"><h4>${K.icon} ${esc(npc.first)} ${esc(npc.last)} <span class="dim">· level ${s.lv} ${esc(K.name.toLowerCase())}</span></h4><div class="dim">${esc(K.desc)}</div><div style="font-size:13px">${(npc.traits || []).map(esc).join(', ')} · ${s.kills} foes slain together · bond ${Math.round(s.bond)}</div><div class="row"><button class="small" data-dismiss="1">Part ways</button></div></div>`;
    },
    hud(game) {
      const el = document.getElementById('hud-comp');
      if (!el) return;
      const pl = game.pl, npc = pl.companion && game.world.npcs[pl.companion];
      const e = npc && game.ents.find(x => x.isCompanion && !x.dead);
      const key = e ? `${npc.first}|${Math.round(e.hp / e.maxHp * 40)}|${C.st(npc).lv}` : '';
      if (C._hud === key) return; C._hud = key;
      el.innerHTML = e ? `<span>${CLASSES[C.st(npc).cls].icon} ${esc(npc.first)} · Lv ${C.st(npc).lv}</span><span class="cb"><i style="width:${Math.round(e.hp / e.maxHp * 100)}%"></i></span>` : '';
    },
    // The inn's list of fighters for hire.
    innHtml(world, s, pl) {
      const list = C.candidates(world, s, pl);
      if (!list.length) return '<h4 class="ware-h">Fighters for hire</h4><p class="dim">No one here is looking for that kind of work today.</p>';
      return `<h4 class="ware-h">Fighters for hire</h4><p class="dim">They fight beside you, grow stronger as you do, and fall back when badly hurt. If they die, they are gone for good.</p><div class="wares">${list.map(n => {
        const st = C.st(n), K = CLASSES[st.cls], cost = C.cost(world, n);
        return `<div class="ware"><div class="ware-ic">${K.icon}</div><div class="ware-main"><div class="ware-top"><b>${esc(n.first)} ${esc(n.last)}</b><span class="gold">${cost} cr</span></div><div class="ware-use">Level ${st.lv} ${esc(K.name.toLowerCase())} — ${esc(K.desc)}</div><div class="ware-meta">${(n.traits || []).map(esc).join(', ')}</div><div class="row"><button class="small" data-hire="${n.id}" ${pl.gold < cost ? 'disabled' : ''}>${pl.companion ? 'Hire instead' : 'Hire'}</button></div></div></div>`;
      }).join('')}</div>`;
    }
  };
})();
