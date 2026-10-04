// Minds: every person has a purpose, a picture of the world, and the sense
// to act on both.
//
//  • Purpose — a goal chosen from who they are and what is happening to
//    them: saving for a stall, courting a neighbour, mastering a trade,
//    rising in the guard, avenging a murdered parent, fleeing a monster,
//    a pilgrimage, the old tongue, the reeve's chair. Goals advance day by
//    day, succeed or fail, and change lives when they do.
//  • Perception — what they believe: how safe their home is and from what,
//    whether there is bread, what they think of their ruler, and what they
//    have heard about you (only what the rumours have actually carried to
//    their town, plus what they saw themselves).
//  • Reciprocity — they remember who helped and who hurt them. Friends cover
//    for you and bring gifts; the bereaved hunt you; shopkeepers charge what
//    your name is worth.
(function () {
  const { U } = ECHO;
  const T = ECHO.TIME;
  const P = () => ECHO.People;
  const S = () => ECHO.Sim;

  const REL_WORD = (n, o) => {
    if (n.spouse === o.id || o.spouse === n.id) return o.sex === 'f' ? 'wife' : 'husband';
    if (n.parents.includes(o.id)) return o.sex === 'f' ? 'mother' : 'father';
    if (n.kids.includes(o.id)) return o.sex === 'f' ? 'daughter' : 'son';
    if (n.parents.length && o.parents && o.parents.some(p => n.parents.includes(p))) return o.sex === 'f' ? 'sister' : 'brother';
    return 'friend';
  };

  const DREAMS = {
    farmer: ['a plough-ox of my own', 'a stall at the market', 'more land by the river'],
    hunter: ['a proper yew longbow', 'a cabin in the hills'],
    woodcutter: ['a team of horses', 'my own sawpit'],
    miner: ['my own claim in the hills', 'a good iron pick'],
    smith: ['a second forge', 'Valdren steel to work'],
    merchant: ['a wagon of my own', 'a shop with a real sign'],
    innkeeper: ['a new wing on the inn', 'barrels from the south'],
    herbalist: ['a glasshouse for my herbs', 'the old herb-books from the capital'],
    priest: ['a new roof for the shrine', 'bells for the shrine'],
    scholar: ['copies of the old records', 'a lens-maker\'s glass'],
    guard: ['a good mail shirt', 'a horse'],
    default: ['a new roof for the house', 'something put by for the children']
  };

  const M = ECHO.Minds = {
    // ---------------------------------------------------------------- perception
    threats(world, s) {
      const key = world.day;
      if (s._thDay === key && s._th) return s._th;
      const out = M._threats(world, s);
      Object.defineProperty(s, '_th', { value: out, writable: true, configurable: true, enumerable: false });
      Object.defineProperty(s, '_thDay', { value: key, writable: true, configurable: true, enumerable: false });
      return out;
    },
    _threats(world, s) {
      const out = [];
      for (const l of world.lairs) if (l.boss && l.boss.alive && U.dist(l.x, l.y, s.x, s.y) < 40) out.push({ w: 0.35 - U.dist(l.x, l.y, s.x, s.y) / 160, name: `${l.boss.name} ${l.boss.title}`, kind: 'beast' });
      for (const c of world.camps) if (c.alive && c.members.length && U.dist(c.x, c.y, s.x, s.y) < 45) out.push({ w: 0.12 + c.members.length * 0.02 - U.dist(c.x, c.y, s.x, s.y) / 400, name: `the Ashfang of ${c.name}`, kind: 'outlaws' });
      const region = ECHO.World.regionAt(world, s.x, s.y);
      if (region && region.eco && region.eco.wolfDanger > 0.6) out.push({ w: Math.min(0.35, (region.eco.wolfDanger - 0.6) * 0.3), name: 'the wolves', kind: 'wolves' });
      const f = world.factions[s.faction];
      if (f && f.atWar && Object.keys(f.atWar).some(k => f.atWar[k])) out.push({ w: 0.12, name: 'the war', kind: 'war' });
      // recent violence they have heard about
      let violent = 0;
      for (const e of ECHO.Chronicle.rumorsAt(world, s, 20, 20)) if (((e.kind === 'death' && /killed|slain|torn|cut down|murder/.test(e.text)) || e.kind === 'crime') && (e.x == null || U.dist(e.x, e.y, s.x, s.y) < 35)) violent++;
      if (violent) out.push({ w: Math.min(0.2, violent * 0.04), name: 'the killings', kind: 'violence' });
      return out.filter(t => t.w > 0.02).sort((a, b) => b.w - a.w);
    },
    perceive(world, n, s) {
      const th = M.threats(world, s);
      let danger = th.reduce((a, t) => a + t.w, 0);
      if (P().has(n, 'brave')) danger *= 0.6;
      if (P().has(n, 'cowardly')) danger *= 1.4;
      const ratio = s.prices.food / ECHO.GOODS.food.base;
      const f = world.factions[s.faction];
      const atWar = f && f.atWar && Object.keys(f.atWar).some(k => f.atWar[k]);
      let ruler = 0.25 - s.hunger * 1.4 - (s.unrest || 0) / 120 + ((s.prosperity || 50) - 50) / 180 - (atWar ? 0.12 : 0);
      if (P().has(n, 'loyal')) ruler += 0.35;
      if (P().has(n, 'fickle')) ruler -= 0.15;
      if (n.starve > 3) ruler -= 0.3;
      const r2 = x => Math.round(x * 100) / 100;
      const v = {
        safety: r2(U.clamp(1 - danger, 0, 1)), threat: th[0] ? th[0].name : null,
        food: r2(U.clamp(1 - Math.max(0, ratio - 1) / 6 - n.starve * 0.08, 0, 1)), bread: s.prices.food,
        ruler: r2(U.clamp(ruler, -1, 1))
      };
      n.mind.v = v;
      return v;
    },
    // What they have heard of the player, best-known deeds first.
    heardOf(world, n, pl, limit = 3) {
      if (!pl) return [];
      const s = S().settlement(world, n.loc || n.home);
      const out = [];
      if (s) for (const e of ECHO.Chronicle.rumorsAt(world, s, 60, 160)) if (e.char === pl.charId && e.imp >= 1 && !/came of age/.test(e.text)) out.push(e);
      out.sort((a, b) => b.imp - a.imp || b.d - a.d);
      return out.slice(0, limit);
    },
    standing(world, n, pl) { return pl ? (n.op[pl.charId] || 0) : 0; },

    // ---------------------------------------------------------------- goals
    GOALS: {
      prosper: {
        weight: (w, n) => (P().has(n, 'greedy') ? 3 : 0) + (P().has(n, 'ambitious') ? 2 : 0) + (['merchant', 'smith', 'innkeeper'].includes(n.prof) ? 1.5 : 0) + (n.wealth > 220 ? -1 : 0.7),
        make: (w, n, s, rng) => ({ dream: rng.pick(DREAMS[n.prof] || DREAMS.default), target: Math.round(n.wealth + 35 + rng.int(0, 55)), start: n.wealth }),
        step: (w, n, s, g) => { n.wealth += (P().has(n, 'patient') ? 0.55 : 0.4) * (0.6 + (s.prosperity || 50) / 120); return n.wealth >= g.target ? 'done' : null; },
        done: (w, n, s, g, rng) => {
          n.wealth -= (g.target - g.start) * 0.8;
          n.renown += 3; s.prosperity = Math.min(100, (s.prosperity || 50) + 0.6);
          if (/stall|shop|wagon/.test(g.dream) && n.prof === 'farmer') n.prof = 'merchant';
          P().remember(w, n, `finally got ${g.dream}`, 'pride', null, 3);
          if (rng.chance(0.35)) ECHO.Chronicle.add(w, { text: `${P().name(n)} of ${s.name} saved long enough to buy ${g.dream.replace(/^my /, 'their ')}.`, kind: 'life', importance: 0, sid: s.id, npcs: [n.id] });
        },
        text: (w, n, g) => `I'm saving for ${g.dream}. ${Math.floor(n.wealth)} of ${g.target} crowns so far${n.wealth / g.target > 0.8 ? ' — nearly there' : ''}.`,
        line: (w, n, g) => [`${Math.max(1, Math.ceil(g.target - n.wealth))} more crowns and it's mine.`, `One day, ${g.dream}.`, 'Every copper counts.']
      },
      love: {
        weight: (w, n) => (!n.spouse && P().age(w, n) >= 18 && P().age(w, n) <= 42 && n.prof !== 'bandit') ? 2.2 + (P().has(n, 'kind') ? 0.8 : 0) : 0,
        make: (w, n, s) => {
          let best = null, bv = 15;
          for (const id in n.rel) {
            const o = w.npcs[id];
            if (!o || o.status !== 'alive' || o.spouse || o.loc !== n.loc || o.prof === 'child' || o.sex === n.sex || n.parents.includes(o.id) || o.parents.includes(n.id)) continue;
            if (n.parents.length && o.parents.some(p => n.parents.includes(p))) continue;
            if (n.rel[id] > bv) { bv = n.rel[id]; best = o; }
          }
          return { crush: best ? best.id : null };
        },
        step: (w, n, s, g, rng) => {
          if (n.spouse) return 'done';
          const c = g.crush && w.npcs[g.crush];
          if (!c || c.status !== 'alive' || c.loc !== n.loc) { if (rng.chance(0.08)) { const m = M.GOALS.love.make(w, n, s); g.crush = m.crush; } return null; }
          if (c.spouse) { P().remember(w, n, `watched ${c.first} marry another`, 'grief', c.id, 2); return 'fail'; }
          P().bond(n, c.id, 1.6); P().bond(c, n.id, 0.9 + (P().has(c, 'kind') ? 0.5 : 0));
          if (n.rel[c.id] > 55 && (c.rel[n.id] || 0) > 40 && rng.chance(0.05)) { P().marry(w, n, c); return 'done'; }
          return null;
        },
        done: (w, n) => { n.mind.content = (n.mind.content || 0) + 1; },
        text: (w, n, g) => {
          const c = g.crush && w.npcs[g.crush];
          if (!c) return 'I\'d like to find someone to share a hearth with. Not much choice in this town.';
          const back = c.rel[n.id] || 0;
          return `Between us? I'm sweet on ${c.first} ${c.last}. ${back > 40 ? 'I think — I hope — they feel the same.' : back > 10 ? 'They smile at me sometimes.' : 'They barely know I exist.'}`;
        },
        line: (w, n, g) => { const c = g.crush && w.npcs[g.crush]; return c ? [`Have you seen ${c.first} today?`, `${c.first} laughed at my joke. Ha!`] : ['Lonely nights.']; }
      },
      family: {
        weight: (w, n) => (n.spouse && n.kids.length < 2 && P().age(w, n) < 38) ? 1.4 : 0,
        make: (w, n) => ({ kids: n.kids.length }),
        step: (w, n, s, g) => (n.kids.length > g.kids ? 'done' : !n.spouse ? 'fail' : null),
        done: (w, n) => { n.mind.content = (n.mind.content || 0) + 1; },
        text: (w, n) => `${w.npcs[n.spouse] ? w.npcs[n.spouse].first + ' and I' : 'We'} hope for a child. ${(ECHO.Sim.settlement(w, n.loc) || {}).hunger > 0.15 ? 'But not while there\'s no bread.' : 'Soon, if the Flame is kind.'}`,
        line: () => ['A cradle by the fire. That\'s all I want.']
      },
      master: {
        weight: (w, n) => (['child', 'elder', 'bandit', 'ruler'].includes(n.prof) ? 0 : 0.6 + (P().has(n, 'patient') ? 1.6 : 0) + (P().has(n, 'ambitious') ? 1 : 0) + (P().has(n, 'curious') ? 0.6 : 0)) * (n.flags.master ? 0.1 : 1),
        make: (w, n) => {
          const sk = n.prof === 'guard' || n.prof === 'wanderer' ? 'fight' : ['priest', 'scholar', 'inventor', 'herbalist'].includes(n.prof) ? 'lore' : 'craft';
          return { skill: sk, target: Math.min(95, Math.round(Math.max(55, n.skill[sk] + 25))) };
        },
        step: (w, n, s, g) => { n.skill[g.skill] = Math.min(100, n.skill[g.skill] + (P().has(n, 'patient') ? 0.12 : 0.08)); return n.skill[g.skill] >= g.target ? 'done' : null; },
        done: (w, n, s, g, rng) => {
          n.flags.master = true; n.renown += 5;
          P().remember(w, n, `became a master ${P().role(w, n)}`, 'pride', null, 3);
          if (rng.chance(0.6)) ECHO.Chronicle.add(w, { text: `${P().name(n)} is now hailed as a master ${P().role(w, n)} in ${s.name}.`, kind: 'life', importance: 1, sid: s.id, npcs: [n.id] });
        },
        text: (w, n, g) => `I mean to be the finest ${P().role(w, n)} in ${(S().settlement(w, n.loc) || {}).name || 'the land'}. ${n.skill[g.skill] / g.target > 0.85 ? 'I\'m close now. I can feel it.' : 'Years of work yet.'}`,
        line: (w, n) => ['Again. And again. Until it\'s right.', `A ${P().role(w, n)} is only as good as their last work.`]
      },
      rank: {
        weight: (w, n) => (n.prof === 'guard' && (n.rank || 0) < 2 && (P().has(n, 'ambitious') || P().has(n, 'brave'))) ? 2.6 : 0,
        make: (w, n) => ({ rank: (n.rank || 0) + 1, fight: 30 + (n.rank || 0) * 18, renown: 6 + (n.rank || 0) * 10 }),
        step: (w, n, s, g) => { n.skill.fight = Math.min(100, n.skill.fight + 0.07); n.renown += 0.04; return n.skill.fight >= g.fight && n.renown >= g.renown ? 'done' : null; },
        done: (w, n, s, g) => {
          n.rank = g.rank;
          ECHO.Chronicle.add(w, { text: `${P().name(n)} was raised to ${P().RANKS[n.rank].toLowerCase()} of ${w.factions[n.faction] ? w.factions[n.faction].short : s.name}.`, kind: 'politics', importance: 1, sid: s.id, npcs: [n.id] });
          P().remember(w, n, `was made ${P().RANKS[n.rank].toLowerCase()}`, 'pride', null, 3);
        },
        text: (w, n, g) => `I'll make ${P().RANKS[g.rank].toLowerCase()} before the year turns. ${n.skill.fight >= g.fight ? 'The captain just needs to notice me.' : 'I drill every morning before the others wake.'}`,
        line: () => ['Shoulders back. Eyes front.', 'One day they\'ll call me captain.']
      },
      flee: {
        // fear: take the family somewhere safer. People don't leave home
        // lightly — only the frightened, only when it is truly bad, and only
        // if somewhere is really safer.
        weight: (w, n, s) => {
          const v = n.mind.v;
          if (!v || v.safety >= 0.3 || P().has(n, 'brave') || ['guard', 'ruler', 'bandit', 'child', 'elder'].includes(n.prof) || (n.mind.noFlee || 0) > w.day) return 0;
          return (P().has(n, 'cowardly') ? 2.5 : 0) + (n.kids.length ? 1 : 0) + (v.safety < 0.15 ? 1 : 0);
        },
        make: (w, n, s, rng) => {
          const danger = t => M.threats(w, t).reduce((a, x) => a + x.w, 0);
          const here = danger(s);
          const d = w.settlements.filter(t => t !== s && t.faction === n.faction && danger(t) < here * 0.5 && t.hunger < 0.2)
            .sort((a, b) => U.dist(a.x, a.y, s.x, s.y) - U.dist(b.x, b.y, s.x, s.y))[0];
          if (!d) n.mind.noFlee = w.day + 30;
          return { threat: n.mind.v.threat, dest: d ? d.id : null, days: rng.int(10, 30) };
        },
        step: (w, n, s, g) => {
          if (!g.dest) return 'fail';
          if (n.mind.v.safety > 0.45) return 'done';           // things calmed down: stay
          if (--g.days > 0) return null;
          const d = S().settlement(w, g.dest);
          if (!d || d === s) return 'fail';
          // a town only empties so fast
          const mo = Math.floor(w.day / 30);
          if (!s.fled || s.fled.m !== mo) s.fled = { m: mo, n: 0 };
          if (s.fled.n >= Math.max(1, Math.floor(P().residents(w, s).length * 0.04))) { g.days = 5; return null; }
          s.fled.n++;
          S().migrate(w, n, s, d, 'fear');
          n.mind.noFlee = w.day + 120;
          if (rng01(w, n) < 0.4) ECHO.Chronicle.add(w, { text: `Afraid of ${g.threat || 'what is coming'}, ${P().name(n)} left ${s.name} for ${d.name}.`, kind: 'life', importance: 0, sid: s.id, npcs: [n.id] });
          return 'done';
        },
        done: () => {},
        text: (w, n, g) => { const d = g.dest && S().settlement(w, g.dest); return `With ${g.threat || 'all this'} so close, I'm ${n.kids.length ? 'taking the children' : 'getting out'}${d ? ' — to ' + d.name : ''}. ${g.days > 0 ? 'A few more days to pack.' : ''}`; },
        line: (w, n, g) => [`${U.cap(g.threat || 'It')} will come for us all.`, 'Lock the doors tonight.', 'I don\'t sleep anymore.']
      },
      defend: {
        weight: (w, n) => (n.mind.v && n.mind.v.safety < 0.55 && (P().has(n, 'brave') || n.flags.survivor) && P().age(w, n) < 48 && !['guard', 'ruler', 'bandit', 'child', 'elder'].includes(n.prof)) ? 3 : 0,
        make: (w, n) => ({ threat: n.mind.v.threat, days: 6 }),
        step: (w, n, s, g) => {
          if (--g.days > 0) return null;
          const f = w.factions[n.faction];
          if (f && f.type === 'kingdom') { n.prof = 'guard'; n.skill.fight = Math.max(n.skill.fight, 22); } else n.prof = 'hunter';
          P().remember(w, n, `took up arms against ${g.threat}`, 'change', null, 3);
          ECHO.Chronicle.add(w, { text: `${P().name(n)} of ${s.name} put down their tools and took up arms against ${g.threat}.`, kind: 'life', importance: 0, sid: s.id, npcs: [n.id] });
          return 'done';
        },
        done: () => {},
        text: (w, n, g) => `Someone has to stand against ${g.threat || 'the dark'}. I'm taking up the spear.`,
        line: (w, n, g) => [`Let ${g.threat || 'them'} come.`, 'I\'m done being afraid.']
      },
      faith: {
        weight: (w, n) => (P().has(n, 'pious') ? 2.4 : 0) + (n.prof === 'priest' ? 1 : 0),
        make: (w, n, s) => {
          const temples = w.settlements.filter(t => t.kind === 'temple' && t !== s);
          const t = temples.sort((a, b) => U.dist(a.x, a.y, s.x, s.y) - U.dist(b.x, b.y, s.x, s.y))[0];
          return { temple: t ? t.id : null, save: 12, stage: t ? 'saving' : 'serve', days: 20 };
        },
        step: (w, n, s, g) => {
          if (g.stage === 'serve') { n.skill.lore += 0.05; return --g.days <= 0 ? 'done' : null; }
          if (g.stage === 'saving') { if (n.wealth >= g.save) { const t = S().settlement(w, g.temple); if (!t) return 'fail'; n.wealth -= g.save; n.flags.pilgrimFrom = n.loc; S().startJourney(w, { kind: 'pilgrim', npcs: [n.id], from: n.loc, to: t.id, speed: 2.4 }); g.stage = 'away'; } return null; }
          if (g.stage === 'away' && n.loc && n.loc === g.temple) { g.stage = 'there'; g.days = 3; return null; }
          if (g.stage === 'there' && --g.days <= 0) { const home = S().settlement(w, n.home); if (home && n.loc !== home.id) S().startJourney(w, { kind: 'pilgrim', npcs: [n.id], from: n.loc, to: home.id, speed: 2.4 }); g.stage = 'home'; return null; }
          if (g.stage === 'home' && n.loc === n.home) return 'done';
          return null;
        },
        done: (w, n, s, g) => { if (g.temple) { P().remember(w, n, `made the pilgrimage to ${(S().settlement(w, g.temple) || {}).name}`, 'joy', null, 3); n.renown += 2; } n.mind.content = (n.mind.content || 0) + 1; },
        text: (w, n, g) => { const t = g.temple && S().settlement(w, g.temple); return t ? (g.stage === 'saving' ? `I'm putting coin aside for the pilgrimage to ${t.name}. ${Math.floor(n.wealth)} of ${g.save} crowns.` : g.stage === 'there' ? `I've walked all the way to ${t.name}. The light here…` : `I'm on the pilgrimage to ${t.name}.`) : 'I serve the Flame here, where I\'m needed.'; },
        line: () => ['Light against the dark.', 'The Flame sees all of it. All of it.']
      },
      lore: {
        weight: (w, n) => (P().has(n, 'curious') ? 2 : 0) + (['scholar', 'inventor'].includes(n.prof) ? 1.5 : 0),
        make: (w, n) => ({ target: Math.round(Math.max(40, n.skill.lore + 22)) }),
        step: (w, n, s, g) => { n.skill.lore = Math.min(100, n.skill.lore + 0.1); return n.skill.lore >= g.target ? 'done' : null; },
        done: (w, n, s, g, rng) => {
          n.flags.loremaster = true; n.renown += 2;
          P().remember(w, n, 'made sense of a line of the old tongue', 'pride', null, 2);
          if (rng.chance(0.5)) ECHO.Chronicle.add(w, { text: `${P().name(n)} of ${s.name} has learned to read a few words of the old carvings.`, kind: 'mystery', importance: 1, sid: s.id, npcs: [n.id] });
        },
        text: (w, n) => { const h = S().settlement(w, n.loc || n.home) || { x: 0, y: 0 }; const r = w.ruins.slice().sort((a, b) => U.dist(a.x, a.y, h.x, h.y) - U.dist(b.x, b.y, h.x, h.y))[0]; return `The old carvings. Someone wrote them, and meant something by it. I want to know what.${r ? ` There are stones at ${r.name} — have you seen them?` : ''}`; },
        line: () => ['Fascinating…', 'If only the old tongue made sense.']
      },
      lead: {
        weight: (w, n, s) => (P().has(n, 'ambitious') && n.renown >= 6 && P().age(w, n) > 25 && s.ruler !== n.id && !['bandit', 'child', 'ruler'].includes(n.prof)) ? 1.8 : 0,
        make: (w, n, s) => ({ sid: s.id }),
        step: (w, n, s, g) => { n.renown += 0.05; if (s.ruler === n.id) return 'done'; return n.loc !== g.sid ? 'fail' : null; },
        done: (w, n) => { P().remember(w, n, 'got the chair they wanted', 'pride', null, 3); },
        text: (w, n, g) => { const s = S().settlement(w, g.sid); const r = s && s.ruler && w.npcs[s.ruler]; return `${s ? s.name : 'This town'} needs someone with sense in charge. ${r ? r.first + ' won\'t last forever.' : 'The chair is empty.'} When the time comes, it'll be me.`; },
        line: () => ['If I ran this town…', 'Mark my words.']
      },
      fortune: {
        weight: (w, n) => (!n.spouse && !n.flags.roamed && P().age(w, n) < 30 && (P().has(n, 'fickle') || P().has(n, 'curious')) && !['guard', 'ruler', 'bandit', 'child'].includes(n.prof)) ? 0.6 : 0,
        make: (w, n, s, rng) => {
          const caps = w.settlements.filter(o => o !== s && o.faction !== 'ashfang').sort((a, b) => (b.prosperity || 0) - (a.prosperity || 0));
          return { dest: caps[0] ? caps[0].id : null, days: rng.int(8, 30) };
        },
        step: (w, n, s, g) => {
          if (--g.days > 0) return null;
          const d = g.dest && S().settlement(w, g.dest);
          if (!d) return 'fail';
          n.flags.roamed = true;
          S().migrate(w, n, s, d, 'fortune');
          return 'done';
        },
        done: () => {},
        text: (w, n, g) => { const d = g.dest && S().settlement(w, g.dest); return `There's nothing for me here. I'm off to ${d ? d.name : 'the city'} to make something of myself.`; },
        line: () => ['Not long now and I\'m gone.', 'The road\'s calling.']
      },
      hunger: {
        weight: (w, n) => (n.starve > 2 || (n.mind.v && n.mind.v.food < 0.45)) ? 5 : 0,
        make: () => ({}),
        step: (w, n) => (n.starve === 0 && n.mind.v.food > 0.6 ? 'done' : null),
        done: () => {},
        text: (w, n) => `Bread is ${n.mind.v ? n.mind.v.bread : '?'} crowns a loaf. I don't know how we'll eat this week. ${n.kids.length ? 'The children ask, and I have nothing to tell them.' : ''}`,
        line: () => ['When does the grain come?', 'Another day of thin soup.']
      },
      avenge: {
        weight: () => 0, // only ever chosen by events
        step: (w, n, s, g, rng) => {
          const t = g.target;
          if (t.type === 'npc') {
            const o = w.npcs[t.id];
            if (!o || o.status === 'dead') return 'done';
            // confront them when they are in the same place
            if (o.loc && o.loc === n.loc && rng.chance(P().has(n, 'hot-headed') ? 0.06 : 0.02)) {
              const win = rng.chance(n.skill.fight / (n.skill.fight + o.skill.fight + 1));
              if (win && rng.chance(0.35)) { P().kill(w, o, `slain by ${n.first} in revenge for ${t.victim}`, P().name(n), n.id); n.flags.avenger = true; return 'done'; }
              P().remember(w, n, `fought ${o.first} over ${t.victim} and ${win ? 'won' : 'lost'}`, 'conflict', o.id, 2);
            }
          } else if (t.type === 'player') {
            const pl = w.player;
            if (!pl || pl.charId !== t.id) return 'done';
            n.op[t.id] = Math.min(n.op[t.id] || 0, -70);
            // they tell everyone who will listen
            if (s && rng.chance(0.25)) for (const o of P().residents(w, s)) if ((o.rel[n.id] || 0) > 30) o.op[t.id] = U.clamp((o.op[t.id] || 0) - 1.5, -100, 100);
          }
          if (++g.age > 160 && (P().has(n, 'pious') || P().has(n, 'kind')) && rng.chance(0.02)) { P().remember(w, n, `forgave the one who killed ${t.victim}`, 'change', null, 3); g.forgave = true; return 'fail'; }
          return null;
        },
        done: (w, n, s, g) => { P().remember(w, n, `saw ${g.target.name} pay for ${g.target.victim}`, 'pride', null, 3); },
        text: (w, n, g) => {
          const pl = w.player;
          if (g.target.type === 'player' && pl && pl.charId === g.target.id) return `You killed my ${g.target.rel}. ${g.target.victim} had done nothing to you. I will see you pay for it, if it's the last thing I do.`;
          return `${g.target.name} killed my ${g.target.rel}, ${g.target.victim}. Everyone knows it. One day there'll be a reckoning.`;
        },
        line: (w, n, g) => g.target.type === 'player' ? ['Murderer.', `I know what you did to ${g.target.victim}.`] : [`${g.target.name} will answer for it.`]
      },
      outlaw: {
        weight: (w, n) => (n.prof === 'bandit' ? 2 : 0),
        make: (w, n) => ({ redeem: P().has(n, 'kind') || P().has(n, 'pious') || P().has(n, 'honest') }),
        step: (w, n, s, g, rng) => {
          if (n.prof !== 'bandit') return 'done';
          if (g.redeem && n.starve === 0 && rng.chance(0.01)) {
            const home = S().settlement(w, n.home);
            if (home && home.faction !== 'ashfang') {
              ECHO.Politics.leaveCamp(w, n); n.prof = 'farmer'; n.faction = home.faction;
              S().migrate(w, n, s || home, home, 'redemption');
              ECHO.Chronicle.add(w, { text: `${P().name(n)} abandoned the Ashfang and walked home to ${home.name}.`, kind: 'life', importance: 1, sid: home.id, npcs: [n.id] });
              return 'done';
            }
          }
          return null;
        },
        done: () => {},
        text: (w, n, g) => g.redeem ? 'This isn\'t the life I wanted. Some nights I think about walking home and never looking back.' : 'One fat caravan. Just one, and I\'m set for life.',
        line: (w, n, g) => g.redeem ? ['I used to be a farmer, you know.'] : ['Fat caravans on the south road, they say.']
      },
      child: {
        weight: (w, n) => (n.prof === 'child' ? 10 : 0),
        make: (w, n, s, rng) => ({ dream: rng.pick(P().has(n, 'brave') ? ['a knight', 'a captain of the guard'] : P().has(n, 'curious') ? ['a scholar', 'an inventor'] : ['a smith', 'a merchant with a big wagon', 'a hunter', 'a priest of the Flame']) }),
        step: (w, n) => (n.prof !== 'child' ? 'done' : null),
        done: () => {},
        text: (w, n, g) => `When I grow up I'm going to be ${g.dream}!`,
        line: (w, n, g) => [`I'm going to be ${g.dream}!`, 'Tag! You\'re it!']
      },
      rest: {
        weight: (w, n) => (n.prof === 'elder' ? 6 : 0),
        make: () => ({}),
        step: () => null,
        done: () => {},
        text: (w, n) => { const g = n.kids.map(id => w.npcs[id]).filter(k => k && k.kids.length).length; return g ? 'I\'ve grandchildren to spoil and stories to tell. That\'s enough for an old body.' : 'I\'d like to see a grandchild before the Flame takes me.'; },
        line: () => ['In my day…', 'My knees know a storm is coming.']
      }
    },

    // ---------------------------------------------------------------- daily tick
    ensure(n) { if (!n.mind) n.mind = { goal: null, v: null, cool: 0, done: 0, failed: 0 }; return n.mind; },
    // Make sure a person has a current view (e.g. right after loading a save).
    viewOf(world, n) { M.ensure(n); if (!n.mind.v) { const s = S().settlement(world, n.loc || n.home); if (s) M.perceive(world, n, s); } return n.mind.v; },
    choose(world, rng, n, s) {
      const G = M.GOALS;
      const kinds = Object.keys(G).filter(k => k !== 'avenge');
      const ws = kinds.map(k => Math.max(0, G[k].weight(world, n, s) || 0));
      if (!ws.some(x => x > 0)) return null;
      const k = rng.weighted(kinds, k => ws[kinds.indexOf(k)]);
      if (!ws[kinds.indexOf(k)]) return null;
      const g = Object.assign({ kind: k, since: world.day, age: 0 }, G[k].make ? G[k].make(world, n, s, rng) : {});
      return g;
    },
    dailyTick(world, rng) {
      for (const n of Object.values(world.npcs)) {
        if (n.status !== 'alive') continue;
        const mind = M.ensure(n);
        const s = S().settlement(world, n.loc || n.home);
        if (!s) continue;
        M.perceive(world, n, s);
        let g = mind.goal;
        // urgent needs push aside quieter dreams
        if (g && g.kind !== 'avenge' && g.kind !== 'hunger' && g.kind !== 'flee' && M.GOALS.hunger.weight(world, n, s) > 0) g = mind.goal = null;
        if (g && !['avenge', 'flee', 'hunger', 'defend'].includes(g.kind) && n.mind.v.safety < 0.4 && (M.GOALS.flee.weight(world, n, s) || M.GOALS.defend.weight(world, n, s)) && rng.chance(0.2)) g = mind.goal = null;
        if (!g) {
          if (mind.cool > 0) { mind.cool--; continue; }
          g = mind.goal = M.choose(world, rng, n, s);
          if (!g) continue;
        }
        const def = M.GOALS[g.kind];
        if (!def) { mind.goal = null; continue; }
        g.age = (g.age || 0) + 1;
        const r = def.step(world, n, s, g, rng);
        if (r === 'done') {
          def.done(world, n, s, g, rng);
          mind.done++; mind.last = { kind: g.kind, ok: true, d: world.day };
          mind.goal = null; mind.cool = rng.int(2, 8);
        } else if (r === 'fail' || g.age > 400) {
          mind.failed++; mind.last = { kind: g.kind, ok: false, d: world.day };
          mind.goal = null; mind.cool = rng.int(3, 10);
        }
      }
    },

    // ---------------------------------------------------------------- events
    // Someone died: those who loved them may want justice.
    onDeath(world, victim, cause, killerName, killerRef) {
      if (!killerRef) return;
      const pl = world.player;
      const isPlayer = killerRef === 'player';
      const killer = isPlayer ? null : world.npcs[killerRef];
      if (!isPlayer && !killer) return;
      const kin = [];
      if (victim.spouse) kin.push(world.npcs[victim.spouse]);
      for (const id of victim.kids) kin.push(world.npcs[id]);
      for (const id of victim.parents) kin.push(world.npcs[id]);
      for (const id in victim.rel) if (victim.rel[id] > 70) kin.push(world.npcs[id]);
      for (const k of kin) {
        if (!k || k.status !== 'alive' || k.prof === 'child' && P().age(world, k) < 10) continue;
        if (killer && k.id === killer.id) continue;
        const mind = M.ensure(k);
        if (mind.goal && mind.goal.kind === 'avenge') continue;
        mind.goal = {
          kind: 'avenge', since: world.day, age: 0,
          target: isPlayer ? { type: 'player', id: pl.charId, name: pl.first + ' ' + pl.last, victim: victim.first, rel: REL_WORD(k, victim) }
            : { type: 'npc', id: killer.id, name: P().name(killer), victim: victim.first, rel: REL_WORD(k, victim) }
        };
        if (isPlayer) k.op[pl.charId] = Math.min(k.op[pl.charId] || 0, -80);
      }
      // Killing someone another person wanted dead settles their score.
      for (const n of Object.values(world.npcs)) {
        const g = n.mind && n.mind.goal;
        if (!g || g.kind !== 'avenge' || g.target.type !== 'npc' || g.target.id !== victim.id) continue;
        if (isPlayer && pl) {
          n.op[pl.charId] = U.clamp((n.op[pl.charId] || 0) + 45, -100, 100);
          P().remember(world, n, `saw ${pl.first} ${pl.last} bring ${victim.first} to justice`, 'gratitude', null, 4);
          n.mind.owe = (n.mind.owe || 0) + 2;
        }
      }
    },

    // ---------------------------------------------------------------- the player helps
    helpOptions(world, n, pl) {
      const g = n.mind && n.mind.goal;
      if (!g || !pl) return [];
      const out = [];
      if (g.kind === 'prosper') { const gap = Math.ceil(g.target - n.wealth); if (gap > 0) out.push({ id: 'give', label: `Give ${Math.min(gap, 25)} crowns toward ${g.dream}`, cost: Math.min(gap, 25) }); }
      if (g.kind === 'faith' && g.stage === 'saving') { const gap = Math.ceil(g.save - n.wealth); if (gap > 0) out.push({ id: 'give', label: `Pay for the pilgrimage (${gap} crowns)`, cost: gap }); }
      if (g.kind === 'hunger') { if ((pl.inv.food || 0) + (pl.inv.meat || 0) >= 2) out.push({ id: 'feed', label: 'Share some food (2)' }); out.push({ id: 'give', label: 'Give 8 crowns for bread', cost: 8 }); }
      if (g.kind === 'love' && g.crush && world.npcs[g.crush]) out.push({ id: 'match', label: `Put in a good word with ${world.npcs[g.crush].first}` });
      if (g.kind === 'master') out.push({ id: 'tools', label: 'Pay for better tools (30 crowns)', cost: 30 });
      if (g.kind === 'avenge' && g.target.type === 'npc') out.push({ id: 'justice', label: `"I'll see ${g.target.name.split(' ')[0]} answers for it."` });
      if (g.kind === 'avenge' && g.target.type === 'player') { out.push({ id: 'blood', label: 'Offer blood-money (60 crowns)', cost: 60 }); out.push({ id: 'sorry', label: '"I am sorry."' }); }
      if (g.kind === 'flee' || g.kind === 'defend') out.push({ id: 'promise', label: `"I'll deal with ${g.threat || 'it'}."` });
      return out;
    },
    help(world, n, pl, id) {
      const g = n.mind && n.mind.goal;
      if (!g) return 'Never mind.';
      const opt = M.helpOptions(world, n, pl).find(o => o.id === id);
      if (!opt) return 'Never mind.';
      if (opt.cost && pl.gold < opt.cost) return `That's kind, but you don't have ${opt.cost} crowns.`;
      const thank = (op, w = 3) => {
        n.op[pl.charId] = U.clamp((n.op[pl.charId] || 0) + op, -100, 100);
        P().remember(world, n, `was helped by ${pl.first} ${pl.last}`, 'gratitude', null, w);
        n.mind.owe = (n.mind.owe || 0) + 1;
        ECHO.Character.behave(pl, 'protect', 0.3);
      };
      switch (id) {
        case 'give':
          pl.gold -= opt.cost; n.wealth += opt.cost;
          if (g.kind === 'hunger') n.starve = Math.max(0, n.starve - 3);
          thank(12 + opt.cost * 0.6);
          if (opt.cost >= 20) ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} gave ${opt.cost} crowns to ${P().name(n)} of ${(S().settlement(world, n.loc) || {}).name || 'the road'}.`, importance: 0, sid: n.loc, rep: 1, tag: 'protect' });
          return g.kind === 'hunger' ? 'Bless you. The children will eat tonight.' : `Truly? I… thank you. I won't forget this.`;
        case 'feed': {
          for (let i = 0; i < 2; i++) { if (pl.inv.food > 0) pl.inv.food--; else pl.inv.meat--; }
          n.starve = 0; thank(20);
          return 'Food. Real food. You don\'t know what this means.';
        }
        case 'match': {
          const c = world.npcs[g.crush];
          const sway = 6 + pl.skills.tongue / 6 + Math.max(0, (c.op[pl.charId] || 0) / 5);
          P().bond(c, n.id, sway); ECHO.Character.train(pl, 'tongue', 1);
          thank(8, 2);
          return (c.rel[n.id] || 0) > 40 ? `You told ${c.first}? And they said… really? Oh, Flame. Thank you.` : `You spoke to ${c.first}? Did they say anything about me?`;
        }
        case 'tools':
          pl.gold -= 30; n.skill[g.skill] = Math.min(100, n.skill[g.skill] + 6); thank(18);
          return 'Proper tools. Now we\'ll see some real work.';
        case 'justice':
          pl.accepted = pl.accepted || [];
          n.mind.promise = pl.charId;
          return `Would you? ${g.target.name} is in ${(S().settlement(world, (world.npcs[g.target.id] || {}).loc) || {}).name || 'the wilds somewhere'}. Do this and you'll have a friend for life.`;
        case 'blood': {
          pl.gold -= 60; n.wealth += 60;
          const soft = P().has(n, 'greedy') || P().has(n, 'kind') || P().has(n, 'pious');
          if (soft) { n.mind.goal = null; n.op[pl.charId] = -25; P().remember(world, n, `took blood-money from ${pl.first} ${pl.last}`, 'change', null, 3); return 'It doesn\'t bring them back. …But it feeds the ones left behind. Go. Don\'t come back here.'; }
          n.op[pl.charId] = Math.min(n.op[pl.charId] || 0, -90);
          return 'You think coin washes blood away? Get out of my sight.';
        }
        case 'sorry': {
          const soft = (P().has(n, 'kind') || P().has(n, 'pious')) && g.age > 30;
          if (soft && Math.random() < 0.35) { n.mind.goal = null; n.op[pl.charId] = -30; P().remember(world, n, `forgave ${pl.first} ${pl.last}`, 'change', null, 3); return '…I don\'t forgive you. But I won\'t carry this anymore. Leave me be.'; }
          return 'Sorry. Sorry! Get away from me.';
        }
        case 'promise':
          n.mind.promise = pl.charId; thank(5, 1);
          return 'You\'d do that? Then maybe we\'ll stay a little longer.';
      }
      return 'Never mind.';
    },

    // ---------------------------------------------------------------- talk
    describeGoal(world, n) {
      const g = n.mind && n.mind.goal;
      if (!g) {
        const last = n.mind && n.mind.last;
        if (last && world.day - last.d < 20) return last.ok ? 'For once I have what I wanted. I\'m just enjoying it.' : 'It didn\'t work out. I\'m still deciding what comes next.';
        return 'Just getting through the days, same as anyone.';
      }
      const def = M.GOALS[g.kind];
      return def && def.text ? def.text(world, n, g) : '…';
    },
    goalLine(world, n, seed) {
      const g = n.mind && n.mind.goal;
      if (!g) return null;
      const def = M.GOALS[g.kind];
      if (!def || !def.line) return null;
      const lines = def.line(world, n, g);
      return lines[Math.abs(seed) % lines.length];
    },
    // Their view of the world around them, in their words.
    describeWorld(world, n) {
      const v = n.mind && n.mind.v;
      const s = S().settlement(world, n.loc || n.home);
      if (!v || !s) return '';
      const bits = [];
      if (v.safety < 0.35) bits.push(`I'm frightened. ${U.cap(v.threat || 'something')} — it's too close, and nobody is doing anything.`);
      else if (v.safety < 0.65) bits.push(`People worry about ${v.threat || 'the roads'}. I keep my door barred at night.`);
      else bits.push('It\'s safe enough here, the Flame be thanked.');
      if (v.food < 0.4) bits.push(`And bread at ${v.bread} crowns… people are going hungry.`);
      else if (v.food < 0.75) bits.push(`Bread's dear at ${v.bread} crowns, but we get by.`);
      const f = world.factions[s.faction];
      const ruler = f && f.ruler && world.npcs[f.ruler];
      const reeve = s.ruler && world.npcs[s.ruler];
      const who = reeve && reeve !== ruler ? `${reeve.first} the reeve` : ruler ? `${P().fullTitle(world, ruler)}` : null;
      if (who) {
        if (v.ruler > 0.35) bits.push(`${U.cap(who)} has done right by us.`);
        else if (v.ruler < -0.3) bits.push(`${U.cap(who)}? Fat while we starve. Something will give.`);
        else bits.push(`${U.cap(who)} — could be worse, could be better.`);
      }
      return bits.join(' ');
    },
    // What they think of you, and why.
    describePlayer(world, n, pl) {
      if (!pl) return '';
      const op = n.op[pl.charId] || 0;
      const heard = M.heardOf(world, n, pl, 2);
      const mine = n.mem.filter(m => m.t.includes(pl.first + ' ' + pl.last) || (m.type === 'gratitude' && m.t.includes(pl.first))).slice(-1)[0];
      const bits = [];
      if (mine) bits.push(mine.type === 'gratitude' ? 'I haven\'t forgotten that you helped me.' : mine.type === 'trauma' ? 'I remember you. I remember what you did to me.' : /spared/.test(mine.t) ? 'You spared my life. I think about that.' : 'We\'ve met before, you and I.');
      if (heard.length) bits.push(`People say ${heard.map(e => e.text.replace(/\.$/, '').replace(`${pl.first} ${pl.last} `, 'you ')).join('; and that ')}.`);
      else if (!mine) bits.push('I don\'t know you. You\'re just another face on the road.');
      if (op > 60) bits.push('There\'s no one I\'d rather have at my door.');
      else if (op > 20) bits.push('I think well of you.');
      else if (op < -60) bits.push('I want nothing to do with you.');
      else if (op < -20) bits.push('I don\'t trust you.');
      else if (heard.length) bits.push('I haven\'t made up my mind about you.');
      return bits.join(' ');
    },

    // ---------------------------------------------------------------- consequences
    // Friends look the other way.
    covers(world, n, pl) {
      if (!pl) return false;
      const op = n.op[pl.charId] || 0;
      return op > 65 && (P().has(n, 'loyal') || (n.mind && n.mind.owe > 0)) && !P().has(n, 'honest');
    },
    // What a shopkeeper charges you: the price of your name.
    priceMult(world, s, pl) {
      if (!pl || !s) return 1;
      const rep = (s.rep && s.rep[pl.charId]) || 0;
      return U.clamp(1 - rep / 300, 0.75, 1.35);
    },
    refuses(world, s, pl) { return !!pl && s && ((s.rep && s.rep[pl.charId]) || 0) < -60; }
  };

  function rng01(world, n) { return ECHO.hash2(ECHO.hashStr(n.id), world.day, 7); }
})();
