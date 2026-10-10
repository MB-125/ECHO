// Prowess: how strong you have grown, and how strong the thing in front of you is.
//
// Every foe has a level (dungeon monsters carry one; for wolves, outlaws and
// the great beasts it is read from how much life and bite they have) and a
// rank (minion, common, elite, champion, lord, great beast). Killing them
// earns experience — a lot for something above you, almost nothing for
// something far beneath you — and experience raises your own level and rank:
// harder blows with every weapon, more life, more breath.
(function () {
  const { U } = ECHO;

  // Levels run from 1 to 150: the old island's dungeons reach the teens, the
  // far lands past it go all the way up.
  const MAX = 150;
  const RANKS = [
    { lv: 1, title: 'Novice', color: '#c8c0b0', desc: 'You know which end of the sword to hold.' },
    { lv: 3, title: 'Fighter', color: '#8fe08a', desc: 'You have killed things that wanted to kill you.' },
    { lv: 5, title: 'Veteran', color: '#7ab8ff', desc: 'Soldiers make room for you at the fire.' },
    { lv: 7, title: 'Champion', color: '#c88aff', desc: 'People point you out in the street.' },
    { lv: 9, title: 'Hero', color: '#ffb84a', desc: 'Songs are being made about you, some of them true.' },
    { lv: 11, title: 'Legend', color: '#ff7a5a', desc: 'Monsters have heard of you.' },
    { lv: 14, title: 'Mythic', color: '#ff5aa0', desc: 'Few in the old kingdoms could stand against you.' },
    { lv: 20, title: 'Wayfarer of the Far Lands', color: '#5ad8c8', desc: 'You have walked where the maps end.' },
    { lv: 30, title: 'Warden of the Deep', color: '#4ab0ff', desc: 'The deep places know your footstep.' },
    { lv: 45, title: 'Ascendant', color: '#9a7aff', desc: 'Your blows ring like bells in the dark.' },
    { lv: 60, title: 'Paragon', color: '#e07aff', desc: 'Kings send gifts, and hope you do not visit.' },
    { lv: 80, title: 'Demigod', color: '#ffd84a', desc: 'The old gods would have been jealous.' },
    { lv: 100, title: 'Eternal', color: '#ff9a3a', desc: 'Your name will outlast the kingdoms.' },
    { lv: 125, title: 'Worldbreaker', color: '#ff4a4a', desc: 'Mountains have less weight than you.' },
    { lv: 150, title: 'the Undying', color: '#ffffff', desc: 'There is nothing deeper left to fear.' }
  ];
  // How a foe compares to you.
  const DIFF = [
    { k: 'trivial', word: 'Trivial', color: '#8a8478', skulls: 0, max: -4 },
    { k: 'easy', word: 'Easy', color: '#8fe08a', skulls: 0, max: -2 },
    { k: 'even', word: 'Even match', color: '#f0e6d0', skulls: 0, max: 0 },
    { k: 'hard', word: 'Hard', color: '#ffc04a', skulls: 1, max: 2 },
    { k: 'deadly', word: 'Deadly', color: '#ff7a4a', skulls: 2, max: 4 },
    { k: 'hopeless', word: 'Run', color: '#ff3a3a', skulls: 3, max: 99 }
  ];
  const FOE_RANK = {
    minion: { name: 'Minion', mult: 0.35, color: '#a8a090' },
    common: { name: 'Common', mult: 1, color: '#e0d8c8' },
    elite: { name: 'Elite', mult: 2.5, color: '#ff9a7a' },
    champion: { name: 'Champion', mult: 4, color: '#ffc04a' },
    lord: { name: 'Lord', mult: 8, color: '#ffcf5a' },
    great: { name: 'Great beast', mult: 12, color: '#ff6a4a' }
  };

  const P = ECHO.Prowess = {
    MAX, RANKS, DIFF, FOE_RANK,
    st(pl) { return (pl.prowess = pl.prowess || { lv: 1, xp: 0, kills: 0, best: 0 }); },
    level(pl) { return pl ? P.st(pl).lv : 1; },
    // Experience needed to rise from level L to L+1.
    need(L) { return Math.round(50 * Math.pow(L, 1.5)); },
    rank(L) { let r = RANKS[0]; for (const x of RANKS) if (L >= x.lv) r = x; return r; },
    nextRank(L) { return RANKS.find(x => x.lv > L) || null; },
    title(pl) { return P.rank(P.level(pl)).title; },

    // ------------------------------------------------------------ what you get for it
    // Harder blows with every weapon, more life, more breath.
    dmgMult(pl) { return 1 + 0.07 * (P.level(pl) - 1); },
    hpBonus(pl) { return 9 * (P.level(pl) - 1); },
    staBonus(pl) { return 4 * (Math.min(40, P.level(pl)) - 1); },

    // ------------------------------------------------------------ how strong foes grow
    // A foe of level L matches what a player of level L hits and takes with gear
    // of their level: up to 12 the old tuning, beyond it the same curves the
    // player climbs (gear power x level bonus; life x armour).
    expect(L) {
      const dmg = (12 + L * 3.2 * 1.15 + 1.5) * (1 + 0.07 * (L - 1));
      const def = (4 + 4 * L) * 1.15;
      return { dmg, tough: (104 + 9 * (L - 1)) * (def + 55) / 55, hp: 104 + 9 * (L - 1) };
    },
    foeMul(L, boss) {
      L = U.clamp(L || 1, 1, MAX);
      const lo = l => ({ hp: 1 + (boss ? 0.3 : 0.42) * (l - 1), dmg: 1 + (boss ? 0.22 : 0.28) * (l - 1) });
      if (L <= 12) return lo(L);
      const a = lo(12), e = P.expect(L), e12 = P.expect(12);
      return { hp: a.hp * e.dmg / e12.dmg, dmg: a.dmg * e.tough / e12.tough };
    },

    // ------------------------------------------------------------ reading a foe
    foeLevel(e) {
      if (!e) return 1;
      if (e.lvl) return e.lvl;
      if (e._plv) return e._plv;
      let L;
      if (e.type === 'boss') L = U.clamp(Math.round(1 + 2 * Math.log2((e.maxHp || 420) / 46)), 7, 12);
      else {
        const bite = Math.sqrt(e.dmgMul || 1);
        L = U.clamp(Math.round(1 + 2 * Math.log2(Math.max(1, (e.maxHp || 40) * bite) / 46)), 1, 12);
        if (e.isLeader) L += 1;
      }
      e._plv = L;
      return L;
    },
    foeRank(e) {
      if (!e) return 'common';
      if (e.type === 'boss') return 'great';
      if (e.boss2) return 'lord';
      if (e.summoner || e.shard) return 'minion';
      if (e.species === 'giantrat' || e.species === 'slimeling') return 'minion';
      if (e.beast || e.isLeader || (e.foe && e.foe.elite) || (e.label && /leader|chief|mother/i.test(e.label))) return 'champion';
      if (e.elite) return 'elite';
      return 'common';
    },
    diff(foeL, plL) {
      const d = foeL - plL;
      return DIFF.find(x => d <= x.max) || DIFF[DIFF.length - 1];
    },
    // Experience for a kill: grows with the foe's level and rank, and with how far above you it stood.
    xpFor(pl, e) {
      const L = P.foeLevel(e), me = P.level(pl);
      const R = FOE_RANK[P.foeRank(e)];
      const gap = L - me;
      // foes well below you teach little
      const scale = gap <= -6 ? 0.05 : U.clamp(1 + 0.2 * gap, 0.25, 2.5);
      // no single kill carries you too far: about two levels, three for a lord or a great beast
      const rk = P.foeRank(e), cap = P.capXp(pl, rk === 'great' || rk === 'lord' ? 3 : 2);
      return Math.max(1, Math.min(cap, Math.round(8 * Math.pow(L, 1.3) * R.mult * scale)));
    },
    // Experience that would carry you up n levels from where you stand.
    capXp(pl, n) {
      const s = P.st(pl);
      let t = -s.xp;
      for (let i = 0; i < n; i++) t += P.need(Math.min(MAX, s.lv + i));
      return Math.max(1, Math.round(t + P.need(s.lv) * 0.1));
    },
    // Add experience; returns the levels gained (each with the rank it brings, if new).
    gain(pl, xp) {
      const s = P.st(pl), out = [];
      if (s.lv >= MAX) return out;
      s.xp += xp;
      while (s.lv < MAX && s.xp >= P.need(s.lv)) {
        s.xp -= P.need(s.lv); s.lv++;
        const r = P.rank(s.lv), before = P.rank(s.lv - 1);
        out.push({ lv: s.lv, rank: r !== before ? r : null });
      }
      if (s.lv >= MAX) s.xp = 0;
      return out;
    },
    // A kill by the player: experience, and the record of the strongest thing you have beaten.
    onKill(pl, e) {
      const s = P.st(pl);
      const xp = Math.round(P.xpFor(pl, e) * (pl._xpMul || 1));
      s.kills++;
      const L = P.foeLevel(e);
      if (L > s.best) s.best = L;
      return { xp, ups: P.gain(pl, xp), level: L, rank: P.foeRank(e) };
    },
    // One number for how hard you hit: weapon, skill, level.
    power(world, pl) {
      const w = world.items[pl.weapon], b = world.items[pl.bow], a = pl.armor && world.items[pl.armor];
      const melee = (w ? w.dmg : 5) * (0.75 + (pl.skills.blade || 0) / 70) * P.dmgMult(pl);
      const bow = b ? b.dmg * (0.7 + (pl.skills.archery || 0) / 65) * P.dmgMult(pl) : 0;
      const def = a ? a.def || 0 : 0;
      return { melee: Math.round(melee), bow: Math.round(bow), def, total: Math.round(melee * 4 + bow * 2 + def * 3 + P.level(pl) * 10) };
    }
  };
})();
