// The Adventurers' Guild: forty or so others who live by the same trade as you.
//
// Real people of the realm — guards who wanted more, hunters, wanderers, a hedge-mage or two —
// each with a rank (E to S), a way of fighting, a temper and a name that grows or fades. Every day
// some of them take contracts off the notice boards (the same pleas you can take: whoever finishes
// first is paid), or go down into the dungeons in parties. They succeed and grow famous; they wound
// the beast and come back for it; they give up; they die, and their gear lies where they fell for
// whoever finds it. The best of them earn names. The old and the rich retire and open a business.
// When one dies or leaves, someone new signs the book.
//
// (Its own dice; all of it kept with the world and on the people themselves, made when first needed.)
(function () {
  const { U } = ECHO;
  const P = () => ECHO.People, X = () => ECHO.Explore, D = () => ECHO.Delvers;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const RANKS = ['E', 'D', 'C', 'B', 'A', 'S'];
  const RANK_AT = [0, 8, 16, 28, 46, 72];
  const RANK_COL = { E: '#a8a8a8', D: '#8affb0', C: '#7ae8ff', B: '#b48aff', A: '#ffcf6a', S: '#ff6a6a' };
  const PROF = { guard: 3, soldier: 3, hunter: 2.6, wanderer: 2.4, woodcutter: 1.2, smith: 1, miner: 1.2, fisher: 0.5, farmer: 0.4, herbalist: 0.5 };
  const STYLE = { guard: ['shield', 'blade'], soldier: ['blade', 'shield', 'spear'], hunter: ['bow', 'bow', 'trapper'], wanderer: ['blade', 'bow', 'spell'], woodcutter: ['axe'], smith: ['hammer', 'axe'], miner: ['axe', 'hammer'], fisher: ['spear'], farmer: ['spear', 'axe'], herbalist: ['spell', 'spell', 'bow'] };
  const STYLE_NAME = { shield: 'shield and sword', blade: 'blade', spear: 'spear', bow: 'bow', trapper: 'traps and bow', axe: 'axe', hammer: 'hammer', spell: 'hedge-magic' };
  const TEMPER = { reckless: 'reckless', careful: 'careful', greedy: 'greedy', honourable: 'honourable', glory: 'glory-hungry', steady: 'steady' };
  const SHOPS = ['an inn called the Broken Spear', 'a smithy', 'a fencing school', 'a tavern called the Last Contract', 'a bowyer\'s shop', 'a stable', 'a shop selling maps and tall tales'];

  const Gd = ECHO.Guild = {
    RANKS, RANK_COL,
    st(world) {
      if (world.guild) return world.guild;
      const hall = world.settlements.filter(s => s.faction !== 'ashfang').sort((a, b) => (b.residents || []).length - (a.residents || []).length)[0];
      return (world.guild = { v: 1, hall: hall ? hall.id : null, log: [], caches: [], made: world.day, seq: 0 });
    },
    members(world, all) { return P().alive(world).filter(n => n.adv && (all || n.adv.status === 'active')); },
    // every name ever in the book, living or dead (for the page)
    book(world) { return Object.values(world.npcs).filter(n => n.adv); },
    target(world) { return U.clamp(Math.round(P().alive(world).length * 0.085), 12, 40); },
    rank(world, n) {
      const sc = D().lv(n) + (n.adv ? n.adv.fame : 0) * 0.6;
      let r = 0; while (r < RANK_AT.length - 1 && sc >= RANK_AT[r + 1]) r++;
      return RANKS[r];
    },
    name(n) { return `${n.first} ${n.last}${n.adv && n.adv.title ? ' ' + n.adv.title : ''}`; },
    // free to take a contract today
    available(world) { return Gd.members(world).filter(n => Gd.free(world, n)); },
    free(world, n) { return n.status === 'alive' && n.loc && !n.delving && !(n.adv && n.adv.job) && !(n.hurtUntil > world.day) && !(n.jailUntil > world.day) && !n.journey && n.id !== (world.player && world.player.companion); },
    canJoin(world, n) {
      return n.status === 'alive' && !n.adv && n.loc && PROF[n.prof] && !n.title && !n.rival && !n.ng && !n.ngAux && !n.ngTrainee && !n.captiveAt && !(n.jailUntil > world.day)
        && n.id !== (world.player && world.player.companion) && P().age(world, n) > 18 && P().age(world, n) < 52 && !P().has(n, 'cowardly')
        && (ECHO.Sim.settlement(world, n.loc) || {}).faction !== 'ashfang';
    },
    recruit(world, rng, n, quiet) {
      const has = t => P().has(n, t);
      const temper = has('brave') || has('hot-headed') ? (rng.chance(0.5) ? 'reckless' : 'glory') : has('greedy') ? 'greedy' : has('honest') || has('loyal') || has('kind') ? 'honourable' : has('ambitious') ? 'glory' : has('cautious') || has('timid') ? 'careful' : ['steady', 'careful', 'reckless', 'greedy', 'glory', 'honourable'][rng.int(0, 5)];
      const st = STYLE[n.prof] || ['blade'];
      n.adv = { status: 'active', style: st[rng.int(0, st.length - 1)], temper, fame: Math.min(20, (n.renown || 0) * 0.3 + (n.delves || 0) * 2), joined: world.day, wins: 0, losses: 0, kills: 0, title: null, job: null, exp: null, hurt: 0 };
      n.lv = Math.max(D().lv(n), 2 + rng.int(0, 4));
      if (!quiet) Gd.note(world, `${n.first} ${n.last} of ${(ECHO.Sim.settlement(world, n.loc) || {}).name || 'nowhere'} signed the Guild's book — ${STYLE_NAME[n.adv.style]}, ${TEMPER[temper]}.`, n);
    },
    note(world, text, n, imp, x, y) {
      const S = Gd.st(world);
      S.log.push({ day: world.day, text, id: n ? n.id : null });
      if (S.log.length > 60) S.log.splice(0, S.log.length - 60);
      if (imp != null) ECHO.Chronicle.add(world, { text, kind: 'deed', importance: imp, npcs: n ? [n.id] : [], ...(x != null ? { x, y } : { sid: n && (n.loc || n.home) }) });
    },
    // ------------------------------------------------------------ every day
    dailyTick(world) {
      if (!world.player || !X() || !D()) return;
      const S = Gd.st(world), rng = new ECHO.RNG(ECHO.hashStr('guild:' + world.seed + ':' + world.day));
      // the book is kept full (at first all at once; after that, a name or two a day)
      const mem = Gd.members(world), want = Gd.target(world);
      if (mem.length < want) {
        const first = !S.filled;
        const pool = P().alive(world).filter(n => Gd.canJoin(world, n)).map(n => ({ n, w: PROF[n.prof] * (1 + ((n.skill && n.skill.fight) || 0) / 40) * (n.delves ? 1.5 : 1) * rng.range(0.5, 1.5) })).sort((a, b) => b.w - a.w);
        for (const { n } of pool.slice(0, first ? want - mem.length : Math.min(2, want - mem.length))) Gd.recruit(world, rng, n, first);
        S.filled = true;
      }
      for (const n of Gd.book(world)) {
        const A = n.adv;
        if (A.status === 'active' && n.status === 'dead') { A.status = 'dead'; A.died = A.died || world.day; if (!A.diedTold) { A.diedTold = 1; Gd.note(world, `${Gd.name(n)} (${Gd.rank(world, n)}-rank) is dead: ${n.cause || 'killed'}.`, n); } continue; }
        if (A.status !== 'active') continue;
        // back from below?
        if (A.exp && !n.delving) Gd.back(world, rng, n);
        if (A.job && world.day >= A.job.until) Gd.resolve(world, rng, n);
      }
      // new contracts
      let taken = 0;
      for (const n of Gd.available(world)) {
        if (taken >= 4) break;
        const A = n.adv, keen = { reckless: 1.4, glory: 1.3, greedy: 1.2, steady: 1, honourable: 1, careful: 0.7 }[A.temper] || 1;
        if (!rng.chance(0.05 * keen)) continue;
        if (Gd.take(world, rng, n)) taken++;
      }
      // the old and the rich hang up their swords
      for (const n of Gd.members(world)) {
        const A = n.adv, age = P().age(world, n);
        if ((age > 55 && rng.chance(0.01)) || (A.fame > 35 && (n.wealth || 0) > 500 && rng.chance(0.004)) || (A.hurt >= 3 && A.temper === 'careful' && rng.chance(0.02))) Gd.retire(world, rng, n);
      }
      // the fallen's gear does not lie there for ever
      S.caches = S.caches.filter(c => !c.taken && world.day - c.day < 90);
    },
    // how hard a plea is, in levels
    diff(world, p) {
      const at = Gd.where(world, p);
      const L = at ? X().level(world, { x: at.x, y: at.y, kind: 'cave' }) : 3;
      if (p.kind === 'hunt') return L + 6;
      if (p.kind === 'apex') return L + 14;
      const r = world.regions[p.regionId];
      return L + ((p.need || 4) - (p.progress || 0)) * 0.5 + (r && r.eco ? r.eco.wolfDanger * 2 : 1);
    },
    where(world, p) {
      if (p.regionId != null && world.regions[p.regionId]) { const r = world.regions[p.regionId]; return { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 }; }
      const s = ECHO.Sim.settlement(world, p.sid);
      return s ? { x: s.x, y: s.y } : null;
    },
    // choose what to do: a plea off a notice board, or a dungeon
    take(world, rng, n) {
      const A = n.adv, home = ECHO.Sim.settlement(world, n.loc), pw = D().power(world, n), pl = world.player;
      if (!home) return false;
      const hunts = world.plights.filter(p => p.status === 'open' && ['beasts', 'hunt', 'apex'].includes(p.kind) && !p.guildOn && !p.claimable && (Gd.where(world, p) ? U.dist(Gd.where(world, p).x, Gd.where(world, p).y, home.x, home.y) < 70 : false));
      let best = null, bs = -1e9;
      for (const p of hunts) {
        const df = Gd.diff(world, p), gap = pw - df, yours = pl && (pl.accepted || []).includes(p.id);
        if (gap < (A.temper === 'reckless' ? -8 : A.temper === 'careful' ? 1 : -3)) continue;
        let sc = -Math.abs(gap - 2) + (p.reward || 50) * (A.temper === 'greedy' ? 0.06 : 0.03) + (yours && A.temper === 'glory' ? 4 : yours ? 1 : 0) + rng.next();
        if (A.temper === 'honourable' && p.requester) sc += 1.5;
        if (sc > bs) { bs = sc; best = p; }
      }
      if (best && (rng.chance(0.65) || A.style === 'bow' || A.style === 'trapper')) {
        const at = Gd.where(world, best);
        A.job = { pid: best.id, until: world.day + 1 + rng.int(0, 2), x: at.x, y: at.y, day: world.day };
        best.guildOn = n.id;
        const yours = pl && (pl.accepted || []).includes(best.id);
        Gd.note(world, `${Gd.name(n)} (${Gd.rank(world, n)}-rank) took the contract: ${Gd.plightWhat(world, best)}.`, n);
        if (yours && ECHO.UI && ECHO.Game && ECHO.Game.world === world) ECHO.UI.toast(`${n.first} ${n.last} of the Guild (${Gd.rank(world, n)}-rank) has taken the same job you did — ${Gd.plightWhat(world, best)}. Whoever finishes it first is paid.`, 'warn', 7);
        return true;
      }
      // or a dungeon, with whoever of the Guild is about
      const mates = Gd.available(world).filter(m => m !== n && m.loc === n.loc && Math.abs(D().power(world, m) - pw) < 8).slice(0, 2);
      const party = [n, ...mates.filter(() => rng.chance(0.5))];
      if (D().start(world, rng, party, home, { careful: 3.5, steady: 2.5, honourable: 2.5, greedy: 1.5, glory: 1.5, reckless: 0.5 }[A.temper] || 2)) {   // (the Guild's people pick a floor they can beat)
        for (const m of party) m.adv.exp = { site: m.delving.site, d0: m.delves || 0, day: world.day, lead: n.id };
        const site = X().byId(world, n.delving.site);
        Gd.note(world, `${U.listJoin(party.map(m => Gd.name(m)))} of the Guild went down into ${site ? site.name : 'the dark'}.`, n);
        return true;
      }
      return false;
    },
    plightWhat(world, p) {
      const s = ECHO.Sim.settlement(world, p.sid), r = world.regions[p.regionId];
      return p.kind === 'hunt' ? `${p.beast || 'a great wolf'}${s ? ' near ' + s.name : ''}` : p.kind === 'apex' ? `the beast troubling ${s ? s.name : 'the land'}` : `the duskwolves ${r ? 'of ' + r.name : ''}${s ? ' troubling ' + s.name : ''}`;
    },
    // a contract comes to its end
    resolve(world, rng, n) {
      const A = n.adv, p = ECHO.Plights.byId(world, A.job.pid), job = A.job;
      A.job = null;
      if (!p || p.status !== 'open') { if (p && p.guildOn === n.id) p.guildOn = null; return; }   // (someone else got there first)
      p.guildOn = null;
      const pw = D().power(world, n), df = Gd.diff(world, p), T0 = A.temper;
      const roll = rng.next() + (pw - df) * 0.08 + (T0 === 'reckless' ? 0.06 : T0 === 'careful' ? -0.04 : 0);
      const what = Gd.plightWhat(world, p), pl = world.player, yours = pl && (pl.accepted || []).includes(p.id);
      const tell = (t, kind) => { if (yours && ECHO.UI && ECHO.Game && ECHO.Game.world === world) ECHO.UI.toast(t, kind || 'info', 7); };
      const r = world.regions[p.regionId];
      if (roll > 0.45) {
        const kills = p.kind === 'beasts' ? Math.max(1, (p.need || 4) - (p.progress || 0)) : 1;
        if (r && p.kind === 'beasts') ECHO.Ecology.recordKill(world, r, 'wolf', A.style === 'bow' || A.style === 'trapper' ? 'ranged' : A.style === 'spell' ? 'fire' : 'melee', Math.min(4, kills * 0.5));
        A.wins++; A.kills += kills; A.fame += 1.5 + Math.max(0, df) * 0.05 + (p.kind === 'apex' ? 8 : p.kind === 'hunt' ? 3 : 0);
        n.wealth = (n.wealth || 0) + Math.round((p.reward || 50) * 0.8);
        if (df >= D().lv(n) - 1 || rng.chance(0.3)) n.lv = Math.min(1500, D().lv(n) + 1);
        const text = `${Gd.name(n)} of the Guild ${p.kind === 'beasts' ? `hunted down the duskwolves ${r ? 'of ' + r.name : ''}` : p.kind === 'hunt' ? `killed ${p.beast || 'the great wolf'}` : 'answered the plea against the beast'}${yours ? ` — before ${pl.first} ${pl.last} could` : ''}, and was paid for it.`;
        ECHO.Plights.close(world, p, 'resolved', text, p.kind === 'apex' ? 2 : 1);
        if (yours) { p.beatenBy = n.id; if (ECHO.Renown) ECHO.Renown.onPlight(world, p, 'beaten'); }
        Gd.note(world, text, n);
        P().remember(world, n, `finished a Guild contract: ${what}`, 'pride', null, 2);
        tell(`${n.first} ${n.last} of the Guild finished the job you took — ${what} — and was paid for it. You were too slow.`, 'warn');
        Gd.titles(world, n);
      } else if (roll > 0.3) {
        // wounded it, and driven off: it is weaker now
        if (p.kind === 'beasts') p.progress = Math.min((p.need || 4) - 1, (p.progress || 0) + Math.ceil((p.need || 4) / 2));
        else p.wounded = (p.wounded || 0) + 1;
        n.hurtUntil = world.day + 3 + rng.int(0, 3); A.hurt++; A.fame += 0.5;
        Gd.note(world, `${Gd.name(n)} went after ${what} and came back bleeding — but left ${p.kind === 'beasts' ? 'half the pack dead' : 'it wounded'}. It is weaker now.`, n);
        tell(`${n.first} of the Guild went after the same job and was driven off — but ${p.kind === 'beasts' ? 'half the pack is dead' : 'the beast is wounded'}. It is easier now.`);
      } else if (roll > 0.15 || !rng.chance(df > pw + 3 ? 0.6 : T0 === 'careful' ? 0.15 : 0.3)) {
        A.losses++; A.fame = Math.max(0, A.fame - 1); n.hurtUntil = world.day + 2;
        Gd.note(world, `${Gd.name(n)} gave up the contract on ${what}: too much for one blade.`, n);
      } else {
        // the wild keeps one; their gear lies where they fell
        Gd.fall(world, rng, n, job, `killed by ${p.kind === 'beasts' ? 'duskwolves' : 'a beast'} on a Guild contract`, what);
      }
    },
    fall(world, rng, n, at, cause, what) {
      const S = Gd.st(world), items = [];
      for (const sl of ['weapon', 'armor']) { const it = sl === 'weapon' ? D().weapon(world, n) : D().armor(world, n); if (it) { it.holder = null; it.delverLoot = false; it.history.push({ d: world.day, t: `dropped where ${n.first} ${n.last} fell` }); items.push(it.id); } }
      let x = at.x, y = at.y;
      for (let k = 0; k < 30; k++) { const a = rng.next() * Math.PI * 2, d = 3 + rng.next() * 9, tx = at.x + Math.cos(a) * d, ty = at.y + Math.sin(a) * d; if (!ECHO.World.isSolid(world, tx, ty) && !world.settlements.some(s => U.dist(s.x, s.y, tx, ty) < 10)) { x = tx; y = ty; break; } }
      S.caches.push({ id: 'gc' + (++S.seq), x, y, who: n.id, name: `${n.first} ${n.last}`, sex: n.sex, rank: Gd.rank(world, n), items, gold: Math.min(200, Math.round((n.wealth || 0) * 0.2)), day: world.day });
      n.adv.status = 'dead'; n.adv.died = world.day; n.adv.diedTold = 1;
      n.wealth = Math.max(0, (n.wealth || 0) - Math.min(200, Math.round((n.wealth || 0) * 0.2)));
      P().kill(world, n, cause);
      const r = ECHO.World.regionAt(world, x, y);
      Gd.note(world, `${Gd.name(n)} of the Guild went after ${what} and did not come back. ${n.sex === 'f' ? 'Her' : 'His'} gear still lies where ${n.sex === 'f' ? 'she' : 'he'} fell, somewhere in ${r ? r.name : 'the wild'}.`, n, 2, x, y);
    },
    // home from a dungeon: how did it go?
    back(world, rng, n) {
      const A = n.adv, e = A.exp, site = X().byId(world, e.site);
      A.exp = null;
      if (n.status !== 'alive') return;
      if ((n.delves || 0) > e.d0) {
        const cleared = site && site.cleared && site.clearedDay >= e.day && String(site.clearedBy || '').includes(n.last);
        A.wins++; A.fame += 1 + (cleared ? 4 : 0); A.delved = (A.delved || 0) + 1; if (cleared) A.cleared = (A.cleared || 0) + 1;
        if (e.lead === n.id) Gd.note(world, `${Gd.name(n)} came up out of ${site ? site.name : 'the dark'}${cleared ? ' with its treasure — the Guild drinks to it tonight' : ', stronger'}.`, n, cleared ? 1 : null);
        Gd.titles(world, n);
      } else { A.losses++; A.hurt++; A.fame = Math.max(0, A.fame - 0.5); }
    },
    retire(world, rng, n) {
      const A = n.adv, s = ECHO.Sim.settlement(world, n.loc || n.home);
      A.status = 'retired'; A.retired = world.day; A.shop = SHOPS[rng.int(0, SHOPS.length - 1)];
      if (A.job) { const p = ECHO.Plights.byId(world, A.job.pid); if (p && p.guildOn === n.id) p.guildOn = null; A.job = null; }
      n.wealth = Math.max(0, (n.wealth || 0) - 150);
      if (s) s.prosperity = Math.min(100, (s.prosperity || 50) + 1);
      Gd.note(world, `${Gd.name(n)} (${Gd.rank(world, n)}-rank, ${A.wins} contracts won) has hung up ${n.sex === 'f' ? 'her' : 'his'} ${A.style === 'bow' ? 'bow' : 'sword'} and opened ${A.shop} in ${s ? s.name : 'town'}.`, n, A.fame > 25 ? 1 : 0);
      P().remember(world, n, `retired from the Guild and opened ${A.shop}`, 'pride', null, 3);
    },
    // names the world gives the best of them
    titles(world, n) {
      const A = n.adv;
      if (A.title) return;
      const t = A.kills >= 18 ? 'Wolfsbane' : (A.cleared || 0) >= 2 ? 'the Deepdelver' : A.wins >= 10 && A.losses === 0 ? 'the Unbroken' : A.fame >= 45 ? (A.temper === 'reckless' ? 'the Bold' : A.temper === 'honourable' ? 'the Just' : A.temper === 'greedy' ? 'Goldhand' : 'the Renowned') : null;
      if (!t) return;
      A.title = t;
      Gd.note(world, `They have started calling ${n.first} ${n.last} of the Guild "${t}".`, n, 1);
    },
    // ------------------------------------------------------------ what the fallen left
    caches(world) { return world.guild ? world.guild.caches.filter(c => !c.taken) : []; },
    interactables(game) {
      const world = game.world, pe = game.pe;
      if (!world.guild || ECHO.Interior.cur) return [];
      const out = [];
      for (const c of Gd.caches(world)) {
        const I = world.globe && ECHO.Renderer3D && ECHO.Renderer3D._imF ? ECHO.Renderer3D.img(c.x, c.y) : c, d = Math.hypot(I.x - pe.x, I.y - pe.y);
        if (d < 2.4) out.push({ kind: 'act', label: `Search the body of ${c.name}, of the Guild`, d, act: () => Gd.search(game, c) });
      }
      return out;
    },
    search(game, c) {
      const world = game.world, pl = game.pl;
      c.taken = world.day;
      const got = [];
      for (const id of c.items) { const it = world.items[id]; if (!it) continue; it.holder = 'player'; it.history.push({ d: world.day, t: `taken from the body of ${c.name} by ${pl.first} ${pl.last}` }); pl.items.push(it.id); got.push(it.name); }
      if (c.gold) { pl.gold += c.gold; got.push(`${c.gold} crowns`); }
      const n = world.npcs[c.who];
      ECHO.UI.modal({ title: `${c.name}, ${c.rank}-rank`, html: `<p class="prose">What the beasts left. ${c.sex === 'f' ? 'Her' : 'His'} Guild token is still on its cord: ${esc(c.name)}, ${c.rank}-rank${n && n.adv && n.adv.title ? ', called ' + esc(n.adv.title) : ''}.</p><p>${got.length ? 'You take: ' + esc(got.join(', ')) + '.' : 'Nothing worth taking is left.'}</p><p class="dim">You could carry the token back to the Guild, and see ${c.sex === 'f' ? 'her' : 'him'} buried.</p>`,
        choices: [
          { label: 'Bury them here, and say the words', onPick: () => { if (ECHO.Renown) ECHO.Renown.add(world, 'honor', 2, `buried ${c.name} of the Guild where ${c.sex === 'f' ? 'she' : 'he'} fell`); ECHO.Chronicle.deed(world, { text: `${pl.first} ${pl.last} found ${c.name} of the Guild where ${c.sex === 'f' ? 'she' : 'he'} fell, and buried ${c.sex === 'f' ? 'her' : 'him'}.`, importance: 1, x: c.x, y: c.y, rep: 2, tag: 'protect' }); } },
          { label: 'Take what is useful and go on', onPick: () => {} }
        ] });
    },
    // ------------------------------------------------------------ talking to them
    dialogue(world, npc, ent, pl, ui) {
      const A = npc && npc.adv;
      if (!A || npc.status !== 'alive') return;
      ui.add(A.status === 'retired' ? 'You were in the Guild, weren\'t you?' : 'You\'re one of the Guild?', () => {
        const rk = Gd.rank(world, npc), gv = ECHO.Renown ? ECHO.Renown.view(world, 'guild') : 0;
        if (A.status === 'retired') return ui.say(`"Was. ${rk}-rank, ${A.wins} contracts. Now I keep ${A.shop}, and I sleep at night." ${npc.first} laughs. "Mostly."`);
        const job = A.job && ECHO.Plights.byId(world, A.job.pid);
        const now = npc.delving ? 'Going down again tomorrow.' : job ? `I've the contract on ${Gd.plightWhat(world, job)}. Stay out of my way.` : 'Between contracts.';
        const toYou = gv >= 30 ? (A.temper === 'glory' ? '"I know who you are. Don\'t think I won\'t beat you to the next one."' : '"I know your name. Good work, what I\'ve heard of it."') : gv <= -10 ? '"I\'ve heard about you. Keep your distance."' : A.temper === 'glory' ? '"And who are you? Never heard of you."' : '"Haven\'t heard of you. Yet."';
        ui.say(`"${rk}-rank. I fight with ${STYLE_NAME[A.style]}${A.title ? ' — they call me ' + A.title : ''}. ${A.wins} contracts won, ${A.losses} I'd rather forget. ${now}" ${toYou}`);
      });
    },
    // ------------------------------------------------------------ the page
    yourRank(world) {
      const pl = world.player, R = ECHO.Renown;
      const sc = (ECHO.Prowess ? ECHO.Prowess.level(pl) : 1) + (R ? (R.get(world, 'hero') + R.get(world, 'reliable') + R.get(world, 'knowledge') * 0.5) * 0.5 : 0);
      let r = 0; while (r < RANK_AT.length - 1 && sc >= RANK_AT[r + 1]) r++;
      return RANKS[r];
    },
    html(game) {
      const world = game.world, S = Gd.st(world), hall = ECHO.Sim.settlement(world, S.hall);
      const mem = Gd.members(world).sort((a, b) => RANKS.indexOf(Gd.rank(world, b)) - RANKS.indexOf(Gd.rank(world, a)) || b.adv.fame - a.adv.fame);
      const status = n => {
        const A = n.adv, job = A.job && ECHO.Plights.byId(world, A.job.pid);
        if (n.delving) { const s = X().byId(world, n.delving.site); return `down in ${esc(s ? s.name : 'a dungeon')}`; }
        if (job) return `on contract: ${esc(Gd.plightWhat(world, job))}`;
        if (n.hurtUntil > world.day) return '<span class="ember">wounded</span>';
        const s = ECHO.Sim.settlement(world, n.loc); return s ? `in ${esc(s.name)}` : 'on the road';
      };
      const row = n => { const A = n.adv, rk = Gd.rank(world, n); return `<tr><td><span class="gd-rk" style="color:${RANK_COL[rk]};border-color:${RANK_COL[rk]}">${rk}</span></td><td><b>${esc(n.first)} ${esc(n.last)}</b>${A.title ? ` <span class="gold">${esc(A.title)}</span>` : ''}<div class="dim" style="font-size:12px">${STYLE_NAME[A.style]} · ${TEMPER[A.temper]} · Lv ${D().lv(n)}</div></td><td class="dim">${A.wins}–${A.losses}</td><td class="dim">${Math.round(A.fame)}</td><td class="dim" style="font-size:12px">${status(n)}</td></tr>`; };
      const fallen = Gd.book(world).filter(n => n.adv.status === 'dead').sort((a, b) => (b.adv.died || 0) - (a.adv.died || 0)).slice(0, 8);
      const retired = Gd.book(world).filter(n => n.adv.status === 'retired').slice(-6);
      const yr = Gd.yourRank(world), gv = ECHO.Renown ? ECHO.Renown.view(world, 'guild') : 0;
      const caches = Gd.caches(world);
      return `<div class="gd"><p class="prose">The Adventurers' Guild keeps its book in <b>${esc(hall ? hall.name : 'the capital')}</b>: ${mem.length} names in it now, each living by the same trade as you. They take the same contracts off the notice boards — whoever finishes first is paid — and go down into the same dungeons. Some will be famous. Some will not come back.</p>
        <div class="card"><b>You</b>: reckoned <span class="gd-rk" style="color:${RANK_COL[yr]};border-color:${RANK_COL[yr]}">${yr}</span>-rank by what is known of you. The Guild ${ECHO.Renown ? ECHO.Renown.viewWord(gv) : 'hardly knows you'} (${gv > 0 ? '+' : ''}${gv}).</div>
        <table class="gd-t"><tr><th></th><th>Name</th><th>Won–lost</th><th>Fame</th><th>Now</th></tr>${mem.map(row).join('')}</table>
        ${caches.length ? `<h3 class="gold">Fallen in the wild</h3><div class="dim" style="font-size:13px">${caches.map(c => { const r = ECHO.World.regionAt(world, c.x, c.y); return `${esc(c.name)} (${c.rank}) fell in ${esc(r ? r.name : 'the wild')}, ${world.day - c.day} days ago — ${c.items.length ? 'gear still on the body' : 'nothing left worth taking'}. <button class="small" data-gcache="${c.id}">Mark it</button>`; }).join('<br>')}</div>` : ''}
        <h3 class="gold">The Guild's news</h3><div class="dim" style="font-size:13px">${S.log.slice(-14).reverse().map(e => `<span style="opacity:.7">${ECHO.TIME && ECHO.TIME.fmtDate ? '' : ''}day ${e.day}</span> · ${esc(e.text)}`).join('<br>') || 'Quiet.'}</div>
        ${fallen.length ? `<h3 class="gold">Remembered</h3><div class="dim" style="font-size:13px">${fallen.map(n => `${esc(n.first)} ${esc(n.last)}${n.adv.title ? ' ' + esc(n.adv.title) : ''} — ${n.adv.wins} contracts won`).join(' · ')}</div>` : ''}
        ${retired.length ? `<h3 class="gold">Retired</h3><div class="dim" style="font-size:13px">${retired.map(n => `${esc(n.first)} ${esc(n.last)} keeps ${esc(n.adv.shop)} in ${esc((ECHO.Sim.settlement(world, n.loc || n.home) || {}).name || 'town')}`).join(' · ')}</div>` : ''}</div>`;
    },
    open(game) {
      const body = ECHO.UI.openPanel('The Adventurers\' Guild', '', 'guild');
      const render = () => { body.innerHTML = Gd.html(game); Gd.bind(body, game, render); };
      render();
    },
    bind(body, game, render) {
      body.querySelectorAll('button[data-gcache]').forEach(b => b.addEventListener('click', () => {
        const c = Gd.caches(game.world).find(x => x.id === b.dataset.gcache);
        if (!c) return;
        game.pl.tracked = `mark:${c.x.toFixed(1)}:${c.y.toFixed(1)}:Where ${c.name} fell`;
        if (ECHO.Purpose) { ECHO.Purpose._html = null; ECHO.Purpose.t = 0; }
        ECHO.UI.toast(`Marked: where ${c.name} fell.`, 'info', 3); render();
      }));
    }
  };
})();
