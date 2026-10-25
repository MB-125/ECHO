// Powers: everything in the world that fights wants to be stronger, and to count for more.
//
// Monsters learn. Each kind remembers how you fight it — the blade, the bow,
// fire, spells — and meets you hardened against it the next time, a little
// stronger for every fight it has had with you. A monster that beats you,
// kills someone, or grows in the middle of a fight takes a name and is
// remembered: from then on it lives on in the world whether you are near or
// not. Day by day it hungers for more — it hunts and grows, gathers a warband,
// claims a stretch of country, raids the towns near it, fights the other named
// things for their followers, and, if it has met you, comes looking for you.
//
// People want it too. Every fighter in the realm (guards, soldiers, hunters,
// wanderers, the rival adventurers) trains, and the ambitious more than the
// rest; the best of them rise in level and renown, become a town's champion,
// and go out after the named monsters themselves — some come home famous,
// some do not come home.
(function () {
  const { U } = ECHO;
  const P = () => ECHO.People;

  // names, by what kind of thing it is
  const FAM = {
    goblin: 'gob', shaman: 'gob', warlord: 'gob', giantrat: 'beast', wolf: 'beast', spider: 'crawl', queen: 'crawl',
    skeleton: 'dead', skelarcher: 'dead', ghoul: 'dead', wraith: 'dead', necromancer: 'dead', hollowking: 'dead', wight: 'dead',
    slime: 'ooze', slimeling: 'ooze', troll: 'brute', ogre: 'brute', golemling: 'stone', golem: 'stone', cultist: 'cult'
  };
  const SYL = {
    gob: [['Gr', 'Sn', 'Kr', 'Sk', 'Ruk', 'Zug', 'Nar', 'Gob', 'Bl'], ['ag', 'ukk', 'iz', 'ot', 'ash', 'ug', 'ik', 'org', 'ab']],
    beast: [['Grey', 'Night', 'Blood', 'Ash', 'Moon', 'Frost', 'Rag', 'Old '], ['maw', 'fang', 'howl', 'pelt', 'jaw', 'tooth', 'claw', 'scar']],
    crawl: [['Sil', 'Ven', 'Ith', 'Ssk', 'Mor', 'Ky'], ['tharra', 'axis', 'ess', 'ira', 'ith', 'ra']],
    dead: [['Mor', 'Vel', 'Ost', 'Ath', 'Hul', 'Sep'], ['dred', 'gar', 'mund', 'rath', 'ric', 'helm']],
    ooze: [['Glub', 'Oz', 'Bl', 'Sl', 'Gl'], ['orp', 'ug', 'ob', 'urk', 'ish']],
    brute: [['Grom', 'Thud', 'Bor', 'Hrug', 'Mog', 'Durn'], ['ak', 'gash', 'nok', 'dar', 'rum', 'og']],
    stone: [['Kor', 'Bas', 'Gran', 'Ob', 'Flint'], ['ath', 'alt', 'ite', 'durm', 'heart']],
    cult: [['Ves', 'Mal', 'Iro', 'Cael', 'Thes'], ['ander', 'ix', 'oth', 'ara', 'imon']],
    man: [['Bran', 'Cor', 'Hal', 'Jor', 'Mer', 'Tor'], ['ek', 'wyn', 'ric', 'mar', 'old', 'an']]
  };
  const EPI = {
    beat: ['the Bane', 'Skull-Taker', 'the Unbroken', 'Ear-Taker', 'who Beat the Stranger'],
    kill: ['the Butcher', 'Red-Hand', 'Widowmaker', 'the Hungry', 'Bonebreaker'],
    grew: ['the Rising', 'the Hungry', 'Twice-Grown', 'the Quick Learner', 'the Ambitious'],
    fled: ['the Survivor', 'Twice-Scarred', 'the Slippery', 'Who Got Away'],
    rose: ['the Proud', 'the Climber', 'the Bold', 'the Cunning', 'Iron-Will']
  };
  // what a named thing can learn as it grows: an art (its own ability), or to harden
  const ARTS = {
    frenzy: { name: 'battle frenzy', ab: () => true },
    regen: { name: 'flesh that knits', ab: lv => 1.5 + lv * 0.35 },
    charge: { name: 'a crushing charge', ab: () => ({ cd: 8 }) },
    slam: { name: 'a ground-shaking slam', ab: () => ({ cd: 7, r: 2.4, dmg: 1.15 }) },
    bolt: { name: 'a bolt of fire', ab: () => ({ color: '#ff9a3c', dmg: 1.3, cd: 3.6, type: 'fire' }) },
    poison: { name: 'venom', ab: lv => ({ dps: 2 + Math.min(40, lv / 3), dur: 5 }) },
    summon: { name: 'calling its kin', ab: (lv, kind) => ({ kind, n: 2, cd: 15 }) },
    teleport: { name: 'stepping through shadow', ab: () => ({ cd: 7 }) }
  };
  const TYPES = ['melee', 'ranged', 'fire', 'magic'];
  const FIGHTERS = new Set(['guard', 'soldier', 'hunter', 'wanderer']);

  const Pw = ECHO.Powers = {
    ARTS, TYPES, MAX_NEM: 12,
    st(world) {
      const s = world.powers || (world.powers = { nem: [], nid: 0, sp: {}, claims: {}, champs: {} });
      s.claims = s.claims || {}; s.champs = s.champs || {};
      return s;
    },
    plLv(world) { return world.player && ECHO.Prowess ? ECHO.Prowess.level(world.player) : 1; },
    alive(world) { return Pw.st(world).nem.filter(r => r.alive); },
    byId(world, id) { return Pw.st(world).nem.find(r => r.id === id) || null; },

    // ------------------------------------------------------------ what each kind has learned of you
    mem(world, key) {
      const S = Pw.st(world).sp;
      return S[key] || (S[key] = { n: 0, lv: 0, beat: 0, seen: { melee: 0, ranged: 0, fire: 0, magic: 0 } });
    },
    // the way you fight it most, and how much of the time
    favourite(m) {
      let best = null, tot = 0;
      for (const t of TYPES) { tot += m.seen[t] || 0; if (!best || (m.seen[t] || 0) > (m.seen[best] || 0)) best = t; }
      return tot > 0 ? { type: best, share: (m.seen[best] || 0) / tot } : null;
    },
    // how hard it has grown against one way of fighting (0–0.25)
    hardened(m, type) {
      let tot = 0; for (const t of TYPES) tot += m.seen[t] || 0;
      if (!tot) return 0;
      return Math.min(0.25, ((m.seen[type] || 0) / tot) * Math.min(1, m.n / 30) * 0.32);
    },
    // how many levels it has learned to fight above its old self
    learnedLv(world, key) {
      const m = Pw.st(world).sp[key];
      if (!m) return 0;
      const cap = Math.max(3, Pw.plLv(world) * 0.3);
      return Math.floor(Math.min(cap, m.lv));
    },
    WORD: { gob: 'goblins', beast: 'beasts', crawl: 'crawling things', dead: 'the restless dead', ooze: 'slimes', brute: 'trolls and brutes', stone: 'things of stone', cult: 'cultists' },
    // one of them: "goblin", "wolf", "skeleton archer"
    kindOne(key) {
      if (key === 'wolf') return 'wolf';
      if (key === 'bandit') return 'outlaw';
      const D = (ECHO.Monsters && ECHO.Monsters.DEFS[key]) || (ECHO.Quests && ECHO.Quests.FOES && ECHO.Quests.FOES[key]);
      return D ? D.name.replace(/^the /, '').toLowerCase() : key;
    },
    kindWord(key) {
      const D = (ECHO.Monsters && ECHO.Monsters.DEFS[key]) || (ECHO.Quests && ECHO.Quests.FOES && ECHO.Quests.FOES[key]);
      if (key === 'wolf') return 'Wolves';
      if (key === 'bandit') return 'Outlaws';
      return D ? D.name.replace(/^the /, '') + (/s$/.test(D.name) ? '' : 's') : U.cap(key);
    },

    // ------------------------------------------------------------ names
    nameFor(rng, kind) {
      const S = SYL[FAM[kind] || 'man'];
      const a = S[0][rng.int(0, S[0].length - 1)], b = S[1][rng.int(0, S[1].length - 1)];
      return a.endsWith(' ') ? a + U.cap(b) : a + b;
    },
    label(r) { return `${r.name} ${r.epi}${r.title ? ', ' + r.title : ''}`; },
    short(r) { return `${r.name} ${r.epi}`; },
    titleFor(world, r) {
      const reg = r.claim != null ? (world.regions[r.claim] || {}).name : null;
      if (r.infl >= 45 && reg) return `Overlord of ${reg}`;
      if (r.infl >= 25) return reg ? `Warlord of ${reg}` : 'Warlord';
      if (r.infl >= 10) return r.kind === 'wolf' ? 'Pack-lord' : 'Chieftain';
      return '';
    },
    wantWord(r) {
      return { vengeance: 'wants your head', dominion: 'means to rule the land around it', power: 'wants to be the strongest thing alive' }[r.amb] || 'wants more';
    },

    // ------------------------------------------------------------ rising
    rise(world, o) {
      const S = Pw.st(world);
      const rng = new ECHO.RNG(ECHO.hashStr('rise:' + world.seed + ':' + world.day + ':' + S.nid));
      for (let i = 0; i < 4; i++) rng.next();   // (well stirred: near seeds start out alike)
      const reg = ECHO.World.regionAt(world, o.x, o.y);
      const r = {
        id: 'nm' + (++S.nid), kind: o.kind, name: o.name || Pw.nameFor(rng, o.kind), epi: o.epi || EPI[o.why || 'rose'][rng.int(0, EPI[o.why || 'rose'].length - 1)], title: '',
        lv: Math.max(1, Math.round(o.lv || 1)), lv0: Math.max(1, Math.round(o.lv || 1)), xp: 0, learnAt: Math.max(1, Math.round(o.lv || 1)),
        x: o.x, y: o.y, site: o.site || null, depth: o.depth || 0, abroad: !o.site, region: reg ? reg.id : null, claim: null,
        infl: o.infl || 2, fol: o.fol || 0, amb: o.amb || 'power', met: o.met || 0, beatYou: o.beatYou || 0, ranFromYou: 0, kills: o.kills || 0,
        learned: [], resist: {}, alive: true, born: world.day, hp: 1, story: [], fate: null
      };
      S.nem.push(r);
      Pw.tell(world, r, typeof o.text === 'function' ? o.text(r) : o.text || `${Pw.short(r)} has risen among the ${Pw.kindWord(r.kind).toLowerCase()}.`, 1);
      return r;
    },
    tell(world, r, text, imp) {
      r.story.push({ d: world.day, t: text });
      if (r.story.length > 10) r.story.shift();
      if (ECHO.Chronicle) ECHO.Chronicle.add(world, { text, kind: 'powers', importance: imp || 0, x: r.x, y: r.y, tags: ['powers', r.id] });
    },
    // one level more (and every third, something new: an art of its own, or hardening against you)
    levelUp(world, r, n, rng) {
      for (let i = 0; i < (n || 1); i++) {
        r.lv++;
        if (r.lv - r.learnAt >= 3) {
          r.learnAt = r.lv;
          const can = Object.keys(ARTS).filter(k => !r.learned.includes(k) && !(r.kind === 'wolf' && k !== 'regen' && k !== 'frenzy'));
          const m = Pw.mem(world, r.kind), fav = Pw.favourite(m);
          if (fav && (r.resist[fav.type] || 0) < 0.35 && (!can.length || (rng ? rng.next() : Math.random()) < 0.4)) {
            r.resist[fav.type] = Math.min(0.45, (r.resist[fav.type] || 0) + 0.12);
            Pw.tell(world, r, `${Pw.short(r)} has hardened itself against ${fav.type === 'melee' ? 'the blade' : fav.type === 'ranged' ? 'arrows' : fav.type === 'fire' ? 'fire' : 'spells'}.`, 0);
          } else if (can.length) {
            const k = can[Math.floor((rng ? rng.next() : Math.random()) * can.length)];
            r.learned.push(k);
            Pw.tell(world, r, `${Pw.short(r)} has learned ${ARTS[k].name}.`, 0);
          }
        }
      }
    },
    die(world, r, fate, text) {
      if (!r.alive) return;
      r.alive = false; r.fate = fate; r.diedDay = world.day;
      const S = Pw.st(world);
      for (const k in S.claims) if (S.claims[k] === r.id) delete S.claims[k];
      if (text) Pw.tell(world, r, text, 2);
    },
    // How strong it is all told (level, warband, renown) — for fights between the powers
    might(r) { return r.lv + r.fol * 0.6 + r.infl * 0.05; },

    // ------------------------------------------------------------ people who want more
    amb(n) {
      let a = ((ECHO.hashStr('amb:' + n.id) % 1000) / 1000) * 0.6;
      if (P().has(n, 'ambitious')) a += 0.4;
      if (P().has(n, 'brave')) a += 0.15;
      if (P().has(n, 'hot-headed')) a += 0.08;
      if (P().has(n, 'cowardly')) a -= 0.25;
      if (n.rival) a += 0.2;
      return U.clamp(a, 0, 1);
    },
    lvOf(n) { return ECHO.Delvers ? ECHO.Delvers.lv(n) : (n.lv || 1); },
    // the best fighters the realm has, strongest first
    champions(world, k) {
      const out = [];
      for (const id in world.npcs) { const n = world.npcs[id]; if (n.status === 'alive' && (n.lv || 0) >= 3) out.push(n); }
      return out.sort((a, b) => Pw.lvOf(b) - Pw.lvOf(a) || (b.renown || 0) - (a.renown || 0)).slice(0, k || 8);
    },

    // ------------------------------------------------------------ every day
    dailyTick(world) {
      const S = Pw.st(world);
      // its own dice, so the rest of the world's are never disturbed
      const rng = new ECHO.RNG(ECHO.hashStr('powers:' + world.seed + ':' + world.day));
      const pl = world.player, plv = Pw.plLv(world);
      // memories fade a little
      for (const k in S.sp) { const m = S.sp[k]; m.lv *= 0.996; for (const t of TYPES) m.seen[t] *= 0.985; }
      const live = Pw.alive(world);
      for (const r of live) {
        // ---- it wants to be stronger: the further behind you, the harder it drives itself
        const gap = plv - r.lv;
        if (rng.chance(gap > 0 ? U.clamp(0.22 + gap * 0.035, 0.22, 0.85) : 0.05)) Pw.levelUp(world, r, gap > 25 ? 2 : 1, rng);
        r.hp = Math.min(1, (r.hp == null ? 1 : r.hp) + 0.35);
        // ---- and to count for more
        r.infl = Math.min(150, r.infl + (0.25 + r.fol * 0.08 + (r.amb === 'dominion' ? 0.6 : 0)) * (r.infl > 60 ? 0.4 : 1));
        if (r.fol < Math.min(8, 2 + Math.floor(r.lv / 4)) && rng.chance(0.12 + (r.amb === 'dominion' ? 0.14 : 0))) r.fol++;
        // out of its den: the ambitious go out into the world
        if (!r.abroad && r.site) {
          const site = world.sites ? world.sites.find(s => s.id === r.site) : null;
          if (!site || site.cleared || (r.amb !== 'power' && r.infl > 10 && rng.chance(0.06))) {
            r.abroad = true;
            if (site) { r.x = site.x + rng.range(-4, 4); r.y = site.y + rng.range(-4, 4); }
            Pw.tell(world, r, `${Pw.short(r)} has come up out of ${site ? site.name : 'the deep places'} and roams the land.`, 1);
          }
        }
        const reg = ECHO.World.regionAt(world, r.x, r.y);
        r.region = reg ? reg.id : r.region;
        // a stretch of country to call its own
        if (r.abroad && r.infl >= 10 && r.claim == null && reg && rng.chance(0.25)) {
          const holder = S.claims[reg.id] != null ? Pw.byId(world, S.claims[reg.id]) : null;
          if (!holder || !holder.alive) { S.claims[reg.id] = r.id; r.claim = reg.id; r.title = Pw.titleFor(world, r); Pw.tell(world, r, `${Pw.short(r)} now claims ${reg.name} as its own. Its kind there grow bolder.`, 2); }
        }
        const t0 = r.title; r.title = Pw.titleFor(world, r);
        if (r.title && r.title !== t0) Pw.tell(world, r, `${r.name} ${r.epi} calls itself ${r.title} now.`, 1);
        // ---- raids on the towns near it
        if (r.abroad && r.infl >= 8 && rng.chance(r.amb === 'dominion' ? 0.045 : 0.02)) Pw.raid(world, r, rng);
        // ---- it comes looking for you
        if (pl && pl.alive !== false && (r.amb === 'vengeance' || r.met > 0) && rng.chance(0.55) && pl.x != null && pl.x < 9000) {
          const d = U.dist(r.x, r.y, pl.x, pl.y);
          if (d > 14) { const k = Math.min(1, 6 / d); r.x += (pl.x - r.x) * k; r.y += (pl.y - r.y) * k; r.abroad = true; }
        }
      }
      // ---- the powers fight each other for what the other has
      for (const a of live) {
        if (!a.alive || a.amb === 'vengeance' || !rng.chance(0.05)) continue;
        const b = live.find(o => o !== a && o.alive && U.dist(o.x, o.y, a.x, a.y) < 45);
        if (!b) continue;
        const pa = 1 / (1 + Math.exp(-(Pw.might(a) - Pw.might(b)) / 4)), win = rng.next() < pa ? a : b, lose = win === a ? b : a;
        Pw.levelUp(world, win, 1 + (lose.lv > win.lv ? 1 : 0), rng);
        win.infl += Math.min(15, lose.infl * 0.3) + 3; win.fol = Math.min(10, win.fol + 1 + Math.floor(lose.fol / 2));
        if (rng.chance(0.5)) Pw.die(world, lose, 'slain', `${Pw.short(win)} fought ${Pw.short(lose)} for mastery and killed it. Its followers went over to the victor.`);
        else Pw.die(world, lose, 'bent the knee', `${Pw.short(lose)} was beaten by ${Pw.short(win)} and now runs in its warband.`);
      }
      // ---- the realm's fighters want more too
      Pw.people(world, rng, plv);
      // ---- and the heroes go after the named things
      for (const r of Pw.alive(world)) {
        if (!r.abroad || r.infl < 10 || !rng.chance(0.025)) continue;
        Pw.hunted(world, r, rng);
      }
      // ---- new powers rise of themselves
      const want = Math.min(Pw.MAX_NEM, 3 + Math.floor(world.day / 15));
      if (Pw.alive(world).length < want && rng.chance(0.1)) Pw.riseWild(world, rng, plv);
    },
    // a raid on the nearest town: someone dies, or the town drives it off
    raid(world, r, rng) {
      let s = null, bd = 36;
      for (const t of world.settlements) { const d = U.dist(t.x, t.y, r.x, r.y); if (d < bd) { bd = d; s = t; } }
      if (!s) return;
      const res = (s.residents || []).map(id => world.npcs[id]).filter(n => n && n.status === 'alive' && P().age(world, n) >= 16);
      if (!res.length) return;
      const guards = res.filter(n => n.prof === 'guard' || n.prof === 'soldier').sort((a, b) => Pw.lvOf(b) - Pw.lvOf(a));
      const def = guards[0];
      if (def && rng.next() < 1 / (1 + Math.exp(-(Pw.lvOf(def) + guards.length * 0.8 - Pw.might(r)) / 3))) {
        def.renown = (def.renown || 0) + 6; def.lv = Pw.lvOf(def) + 1;
        r.infl = Math.max(0, r.infl - 3); r.hp = 0.4;
        Pw.tell(world, r, `${Pw.short(r)} raided ${s.name}, and ${def.first} ${def.last} drove it off.`, 1);
        return;
      }
      const v = def && rng.chance(0.6) ? def : res[rng.int(0, res.length - 1)];
      P().kill(world, v, `killed by ${Pw.short(r)}`, Pw.short(r), null);
      r.kills++; r.infl += 3; if (rng.chance(0.5)) Pw.levelUp(world, r, 1, rng);
      Pw.tell(world, r, `${Pw.short(r)} raided ${s.name} and killed ${v.first} ${v.last}.`, 2);
    },
    // one of the realm's fighters goes after it
    hunted(world, r, rng) {
      let h = null, bs = -1e9;
      for (const id in world.npcs) {
        const n = world.npcs[id];
        if (n.status !== 'alive' || !(FIGHTERS.has(n.prof) || n.rival) || n.id === (world.player && world.player.companion)) continue;
        const lv = Pw.lvOf(n);
        if (lv < r.lv - 3) continue;
        const home = ECHO.Sim.settlement(world, n.home), d = home ? U.dist(home.x, home.y, r.x, r.y) : 60;
        if (d > 55) continue;
        const s = lv + Pw.amb(n) * 6 - d * 0.05;
        if (s > bs) { bs = s; h = n; }
      }
      if (!h) return;
      const nm = `${h.first} ${h.last}`;
      if (rng.next() < 1 / (1 + Math.exp(-(Pw.lvOf(h) - Pw.might(r)) / 3))) {
        h.lv = Pw.lvOf(h) + 2; h.renown = (h.renown || 0) + 15 + Math.round(r.infl * 0.3);
        h.honors = (h.honors || []).concat([`slew ${Pw.short(r)}`]).slice(-4);
        Pw.die(world, r, 'slain by ' + nm, `${nm} hunted down ${Pw.short(r)} and killed it. Their name is on every tongue.`);
      } else {
        P().kill(world, h, `slain hunting ${Pw.short(r)}`, Pw.short(r), null);
        r.kills++; r.infl += 4; Pw.levelUp(world, r, 1, rng);
        Pw.tell(world, r, `${nm} went out to kill ${Pw.short(r)} and did not come back.`, 2);
      }
    },
    // something in a dungeon (or on a wolf range) decides it is meant for more
    riseWild(world, rng, plv) {
      const X = ECHO.Explore;
      if (!X || !X.sites || !world.sites || !world._dng) return null;   // (not while the world is still being made)
      const sites = world.sites.filter(s => s.cat === 'delve' && !s.cleared && X.DELVES[s.kind] && s.kind !== 'riftdeep');
      if (!sites.length) return null;
      const s = sites[rng.int(0, sites.length - 1)], D = X.DELVES[s.kind];
      const known = k => k === 'wolf' || !ECHO.Monsters || ECHO.Monsters.DEFS[k] || (ECHO.Quests && ECHO.Quests.FOES && ECHO.Quests.FOES[k]);
      const roster = (D.roster || [[D.foes, 1]]).map(x => x[0]).filter(k => k && known(k));
      if (!roster.length) return null;
      const kind = roster[rng.int(0, roster.length - 1)];
      const lv = Math.max(X.level(world, s) + 2, Math.round(plv * 0.55));
      const amb = rng.chance(0.5) ? 'dominion' : 'power', out = rng.chance(0.35);
      return Pw.rise(world, { kind, lv, x: s.x + (out ? rng.range(-6, 6) : 0), y: s.y + (out ? rng.range(-6, 6) : 0), site: out ? null : s.id, depth: 0, amb, why: 'rose', infl: 3, fol: 1,
        text: r => `In ${s.name}, a ${Pw.kindOne(kind)} that calls itself ${Pw.short(r)} has killed its betters and taken their place.` });
    },
    people(world, rng, plv) {
      // (only those who could matter: fighters, rivals, anyone who has reached a level)
      const S = Pw.st(world), best = {};
      for (const id in world.npcs) {
        const n = world.npcs[id];
        if (n.status !== 'alive' || !(FIGHTERS.has(n.prof) || n.rival || (n.lv || 0) >= 5)) continue;
        const a = Pw.amb(n), lv = Pw.lvOf(n);
        // the ambitious train: a level now and then, faster while you are far ahead of them
        const cap = Math.min(150, Math.max(12, plv + 2));
        if (lv < cap && rng.next() < a * (0.02 + Math.min(0.06, Math.max(0, plv - lv) * 0.002))) {
          n.lv = lv + 1; n.skill.fight = Math.min(100, (n.skill.fight || 0) + 1); n.renown = (n.renown || 0) + 0.5;
        }
        if (n.home) { const b = best[n.home]; if (!b || Pw.lvOf(n) + (n.renown || 0) * 0.05 > Pw.lvOf(b) + (b.renown || 0) * 0.05) best[n.home] = n; }
      }
      // each town's champion: its best fighter, once they are worth the name
      for (const sid in best) {
        const n = best[sid];
        if (Pw.lvOf(n) < 6 || (n.renown || 0) < 10 || S.champs[sid] === n.id) continue;
        S.champs[sid] = n.id;
        const s = ECHO.Sim.settlement(world, sid);
        if (s && ECHO.Chronicle) ECHO.Chronicle.add(world, { text: `${n.first} ${n.last} is the champion of ${s.name} now — the best fighter the town has.`, kind: 'powers', importance: 1, sid, npcs: [n.id], tags: ['powers'] });
      }
    },
    championOf(world, sid) { const id = Pw.st(world).champs[sid]; const n = id && world.npcs[id]; return n && n.status === 'alive' ? n : null; },
    championTown(world, n) { const S = Pw.st(world); for (const sid in S.champs) if (S.champs[sid] === n.id) return ECHO.Sim.settlement(world, sid); return null; }
  };
})();
