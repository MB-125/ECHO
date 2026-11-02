// What a town becomes: its character, made out of who lives there and what happens to it.
//
// A town of farmers that feeds the country round it; a mining town; a market town where the roads
// meet; a garrison town; a walled town; an adventurers' town that lives off the dungeons near it;
// a town growing past its walls; a town in decline, whose young people are leaving. It is worked
// out again every ten days or so from the town as it is, and it changes slowly — and when it
// changes, the Chronicle says so. Each character does something small: farm towns fill their
// granaries, walled and garrison towns hold better against raids, market towns grow richer,
// thriving towns draw families in, declining towns lose them.
//
// (Its own dice; kept on the settlement, made the first time it is needed.)
(function () {
  const { U } = ECHO;
  const P = () => ECHO.People;
  const KINDS = {
    farming: { name: 'Farming town', short: 'farming', desc: 'Most of its people work the fields; its granaries feed the country round it.' },
    mining: { name: 'Mining town', short: 'mining', desc: 'It lives off what comes out of the ground.' },
    trading: { name: 'Market town', short: 'market', desc: 'The roads meet here, and so does the money.' },
    military: { name: 'Garrison town', short: 'garrison', desc: 'Soldiers in every street; the crown keeps its strength here.' },
    holy: { name: 'Holy town', short: 'holy', desc: 'Its temple and its scholars draw pilgrims from all over the realm.' },
    fortified: { name: 'Walled town', short: 'walled', desc: 'Walls, a watch, and people who are not easily taken by surprise.' },
    adventurer: { name: 'Adventurers\' town', short: 'adventurers\'', desc: 'It lives off the dungeons near it, and the people who go down into them.' },
    growing: { name: 'Thriving town', short: 'thriving', desc: 'It is growing past its old bounds; families come here to make a start.' },
    declining: { name: 'Town in decline', short: 'declining', desc: 'Empty houses, closed shops; the young are leaving.' },
    village: { name: 'Village', short: 'village', desc: 'A quiet place, not yet much of anything.' }
  };
  const GROUPS = { farm: ['farmer', 'miller'], mine: ['miner', 'smith', 'woodcutter'], trade: ['merchant', 'innkeeper', 'baker'], arms: ['soldier', 'guard'], holy: ['priest', 'scholar'] };

  const TL = ECHO.TownLife = {
    KINDS,
    of(s) { return s && s.char ? KINDS[s.char.kind] : null; },
    // what it is, by the numbers (scores; the highest wins)
    scores(world, s) {
      const all = P().residents(world, s), res = all.filter(n => n.prof !== 'child'), pop = all.length, W = s.works || {}, D = world.day;
      s._peak = Math.max(pop, (s._peak || pop) * 0.985);   // (the old high-water mark fades, so a town can find its level again)
      const peak = s._peak, pros = s.prosperity == null ? 50 : s.prosperity, unrest = s.unrest || 0;
      // each trade's share here, against its share in the realm as a whole
      const A = TL.avg(world), cnt = g => res.filter(n => GROUPS[g].includes(n.prof)).length;
      const rel = g => { const c = cnt(g); return res.length && A[g] > 0 ? (c / res.length) / A[g] : 0; };
      const guild = ECHO.Guild ? res.filter(n => n.adv && n.adv.status === 'active').length : 0;
      const camp = ECHO.Explore ? ECHO.Explore.sites(world).some(x => x.life && x.life.state === 'exploited' && x.life.camp && x.life.camp.from === s.id) : false;
      const delves = ECHO.Explore ? ECHO.Explore.sites(world).filter(x => x.cat === 'delve' && U.dist(x.x, x.y, s.x, s.y) < 30).length : 0;
      return {
        farming: cnt('farm') >= 3 ? rel('farm') * 0.9 + Math.min(0.3, (s.farmTiles || 0) / 400) : 0,
        mining: cnt('mine') >= 2 ? rel('mine') * 0.85 : 0,
        trading: cnt('trade') >= 2 ? rel('trade') * 0.8 + Math.max(0, (pros - 60) / 60) + ((world.roads || []).filter(r => r.a === s.id || r.b === s.id).length >= 3 ? 0.2 : 0) : 0,
        military: cnt('arms') >= 3 ? rel('arms') * 0.85 + (s.kind === 'capital' ? 0.3 : 0) + (ECHO.GuardWork && ECHO.GuardWork.garrisonOf(world, s.id) ? 0.25 : 0) : 0,
        holy: cnt('holy') >= 3 ? rel('holy') * 0.8 + (s.kind === 'temple' ? 0.4 : 0) : 0,
        fortified: (W.walls ? 1.35 : 0) + (W.walls && W.watch ? 0.2 : 0) + (W.walls && s.drilled && D - s.drilled < 60 ? 0.1 : 0),
        adventurer: guild * 0.3 + (camp ? 0.7 : 0) + Math.min(0.4, delves * 0.08),
        growing: pop > Math.max(12, (s.foundingPop || peak * 0.8)) * 1.25 && pros >= 62 ? 1.3 + (pros - 62) / 80 : 0,
        declining: (pop < peak * 0.68 && peak >= 10 && (pros < 40 || unrest > 45) ? 1.1 + (1 - pop / peak) : 0) + (pros < 15 ? 1.2 : 0),
        village: s.kind === 'village' ? 1.12 : 0.6
      };
    },
    // the realm's shares of each trade (worked out once a day)
    avg(world) {
      if (TL._avg && TL._avg.day === world.day && TL._avg.w === world) return TL._avg.v;
      const v = {}, c = {}; let n = 0;
      for (const x of P().alive(world)) { if (x.status !== 'alive' || !x.loc || x.prof === 'child') continue; n++; for (const g in GROUPS) if (GROUPS[g].includes(x.prof)) c[g] = (c[g] || 0) + 1; }
      for (const g in GROUPS) v[g] = n ? (c[g] || 0) / n : 0;
      TL._avg = { day: world.day, w: world, v };
      return v;
    },
    // ------------------------------------------------------------ every day
    dailyTick(world) {
      if (!world.player) return;
      const rng = new ECHO.RNG(ECHO.hashStr('town:' + world.seed + ':' + world.day));
      for (const s of world.settlements) {
        if (s.faction === 'ashfang') continue;
        const h = ECHO.hashStr(s.id) % 10;
        if (!s.char || (world.day + h) % 10 === 0) TL.judge(world, s, !s.char);
        TL.effect(world, rng, s);
      }
    },
    judge(world, s, first) {
      const sc = TL.scores(world, s);
      let best = 'village', bs = -1;
      for (const [k, v] of Object.entries(sc)) if (v > bs) { bs = v; best = k; }
      const cur = s.char && s.char.kind;
      // slow to change: only for a clearly better reason (or something dramatic)
      if (cur && cur !== best && best !== 'declining' && (sc[best] < (sc[cur] || 0) + 0.3 || world.day - (s.char.since || 0) < 40)) return;
      if (cur === best) return;
      const was = cur;
      s.char = { kind: best, since: world.day, was: was || null };
      if (first) return;
      const K = KINDS[best];
      const text = best === 'village' ? `${s.name} has gone quiet — just a village now.` : best === 'declining' ? `${s.name} is in decline: empty houses, shut shops, and the young leaving for other towns.` : best === 'growing' ? `${s.name} is thriving — growing past its old bounds as families come to make a start there.` : was === 'declining' ? `${s.name} has come back from its hard years, and is ${aOrAn(K.short)} ${K.short} town now.` : `${s.name} has become ${aOrAn(K.short)} ${K.short} town${was && KINDS[was] ? `, where it was ${aOrAn(KINDS[was].short)} ${KINDS[was].short} one` : ''}.`;
      ECHO.Chronicle.add(world, { text, kind: 'town', importance: best === 'declining' || best === 'growing' ? 2 : 1, sid: s.id });
    },
    // what being that kind of town does, day by day
    effect(world, rng, s) {
      const k = s.char && s.char.kind;
      if (!k || !s.stock) return;
      if (k === 'farming') s.stock.food = (s.stock.food || 0) + 1.2;
      else if (k === 'mining') s.stock.ore = (s.stock.ore || 0) + 0.4;
      else if (k === 'trading') { s.prosperity = Math.min(100, (s.prosperity || 50) + 0.05); s.wealth = (s.wealth || 0) + 1; }
      else if (k === 'adventurer') s.wealth = (s.wealth || 0) + 0.6;
      else if (k === 'holy') { s.unrest = Math.max(0, (s.unrest || 0) - 0.05); s.prosperity = Math.min(100, (s.prosperity || 50) + 0.02); }
      else if (k === 'declining') {
        s.unrest = Math.min(100, (s.unrest || 0) + 0.08);
        // a family gives up and goes where there is work
        if (rng.chance(0.03)) {
          const to = world.settlements.filter(t => t !== s && t.faction !== 'ashfang' && t.char && ['growing', 'trading', 'farming', 'mining', 'adventurer'].includes(t.char.kind) && U.dist(t.x, t.y, s.x, s.y) < 220).sort((a, b) => (b.prosperity || 0) - (a.prosperity || 0))[0];
          const n = to && P().residents(world, s).find(n => n.prof !== 'child' && n.id !== s.ruler && !n.title && !n.journey && !n.ng && !n.ngAux && n.id !== (world.player && world.player.companion) && P().age(world, n) > 18 && P().age(world, n) < 45);
          if (n) ECHO.Sim.migrate(world, n, s, to, 'decline');
        }
      } else if (k === 'growing' && rng.chance(0.02)) {
        // and people come: from a town in decline, if there is one near
        const from = world.settlements.find(t => t !== s && t.char && t.char.kind === 'declining' && U.dist(t.x, t.y, s.x, s.y) < 220);
        const n = from && P().residents(world, from).find(n => n.prof !== 'child' && n.id !== from.ruler && !n.title && !n.journey && !n.ng && !n.ngAux && n.id !== (world.player && world.player.companion) && P().age(world, n) > 18 && P().age(world, n) < 40);
        if (n) ECHO.Sim.migrate(world, n, from, s, 'work');
      }
    },
    // how well it holds against raids (Powers.raid)
    fort(s) { const k = s && s.char && s.char.kind; return k === 'fortified' ? 3 : k === 'military' ? 2 : 0; },
    line(s) { const K = TL.of(s); return K ? `${K.name}${s.char.since ? '' : ''}: ${K.desc}` : ''; }
  };
  function aOrAn(w) { return /^[aeiou]/i.test(w) ? 'an' : 'a'; }
})();
