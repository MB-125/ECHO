// The aura of your strength.
//
// The stronger you grow, the more of it shows: a faint ring of light at your feet at
// first; then runes turning in it, motes rising off you, then a shell of flame that
// wraps you, sparks that circle you and waves of light rolling out across the ground.
// It takes the colour of your rank (and of your finest relic), burns up when you fight,
// blazes as you gather a heavy blow and flares when you rise a level — and goes dark
// when you crouch to sneak.
//
// It is not only for show. Foes well beneath you (three levels or more, and not the
// strong: elites, lords, the beasts of the lairs) who come inside it are cowed: their
// blows land softer, and those far beneath you (six levels or more) falter the first
// time they feel it. Esc → Gameplay sets it to full, subtle or off.
(function () {
  const { U } = ECHO;

  const AU = ECHO.Aura = {
    flareT: 0, _look: null,
    mode() { return (ECHO.UI && ECHO.UI.settings && ECHO.UI.settings.aura) || 'full'; },
    // how strong you are, about 0 (a novice) to 1 (level 300), and a little more for the
    // finest of what you wear
    strength(game) {
      const pl = game.pl, world = game.world, L = ECHO.Prowess ? ECHO.Prowess.level(pl) : 1;
      const s = 0.08 + 0.92 * U.clamp(Math.log(Math.max(1, L)) / Math.log(300), 0, 1);
      let g = 0;
      for (const id of [pl.weapon, pl.bow, pl.armor, ...(Array.isArray(pl.relics) ? pl.relics : [])]) {
        const it = id && world.items[id];
        if (it && it.rarity === 'legendary') g += 0.035; else if (it && it.rarity === 'epic') g += 0.02;
      }
      return Math.min(1.15, s + Math.min(0.15, g));
    },
    // its colours: your rank's, and the light of your finest relic (epic or better)
    colors(game) {
      const pl = game.pl, Pw = ECHO.Prowess, R = Pw.rank(Pw.level(pl)), A = ECHO.Arcana;
      let c2 = R.color;
      if (A && A.wornItems) {
        const best = A.wornItems(pl, game.world).sort((a, b) => A.tierOf(b.it) - A.tierOf(a.it))[0];
        if (best && A.tierOf(best.it) >= 3) c2 = A.RELICS[best.it.relic].color;
      }
      return { c1: R.color === '#c8c0b0' ? '#efe2c4' : R.color, c2, rank: R };
    },
    // how far it reaches, in paces
    radius(s) { return 2.5 + 4 * s; },
    // what the renderer draws this frame
    look() { return AU._look; },
    flare(t) { AU.flareT = Math.max(AU.flareT, t || 1.5); },
    refresh() { AU._sT = 0; },

    tick(game, dt) {
      const pl = game.pl, pe = game.pe, PC = ECHO.PlayerCtl;
      if (!pl || !pe) { AU._look = null; return; }
      const mode = AU.mode();
      AU._sT = (AU._sT || 0) - dt;
      if (AU._sT <= 0 || !AU._c) { AU._sT = 1; AU._s = AU.strength(game); AU._c = AU.colors(game); }
      const fight = game.combatT != null && game.time - game.combatT < 4;
      const hold = PC && PC.heavyHold ? Math.min(1, (PC.holdT || 0) / 0.75) : 0;
      const hidden = mode === 'off' || pe.dead || pe.hidden || pe.swimming || pl.flying || (PC && PC.sneaking && !pl.mounted);
      AU.flareT = Math.max(0, AU.flareT - dt);
      const want = hidden ? 0 : (mode === 'subtle' ? 0.45 : 1) * (0.6 + (fight ? 0.3 : 0) + hold * 0.45 + Math.min(1, AU.flareT) * 0.6);
      const a0 = AU._a || 0;
      AU._a = a0 + (want - a0) * Math.min(1, dt * (want > a0 ? 6 : 2.5));
      const s = AU._s, a = AU._a, c = AU._c;
      AU._look = { show: a > 0.02, s, a, c1: c.c1, c2: c.c2, hold, fight, mounted: !!pl.mounted, subtle: mode === 'subtle' };
      if (!AU._look.show || (ECHO.UI && ECHO.UI.blocksWorld && ECHO.UI.blocksWorld())) return;
      const C = ECHO.Combat, sub = mode === 'subtle' ? 0.5 : 1;
      // motes rising off you, more as you grow
      AU._mote = (AU._mote || 0) + Math.max(0, s - 0.18) * 30 * a * sub * dt;
      while (AU._mote >= 1) {
        AU._mote -= 1;
        const an = Math.random() * 6.283, r = 0.25 + Math.random() * 0.45;
        C.fx.push({ kind: 'p', x: pe.x + Math.cos(an) * r, y: pe.y + Math.sin(an) * r * 0.6, vx: 0, vy: 0, t: 0, life: 0.8 + Math.random() * 0.6, color: Math.random() < 0.5 ? c.c1 : c.c2, size: 1.3 + s * 1.5, glow: true, h: 0.1 + Math.random() * 0.5, vz: 0.8 + s * 1.0 + hold, g: 0 });
      }
      // sparks circling the strongest
      if (s >= 0.65) {
        const n = s >= 0.95 ? 5 : s >= 0.8 ? 4 : 3;
        AU._orb = (AU._orb || 0) + dt * (1.6 + a * 1.4);
        if (Math.random() < dt * 36 * a * sub) {
          const k = Math.floor(Math.random() * n), an = AU._orb + k * 6.283 / n, rr = 0.85 + 0.25 * s;
          C.fx.push({ kind: 'p', x: pe.x + Math.cos(an) * rr, y: pe.y + Math.sin(an) * rr * 0.7, vx: 0, vy: 0, t: 0, life: 0.35, color: c.c2, size: 2.2, glow: true, h: 0.9 + Math.sin(AU._orb * 2 + k) * 0.3, vz: 0, g: 0 });
        }
      }
      // the ground lit round you, at night and in the dark places
      if (s >= 0.35 && game.isNight && (game.isNight() || (ECHO.Interior && ECHO.Interior.cur))) game.light(pe.x, pe.y, 2.2 + s * 2.6, (0.22 + 0.35 * s) * a, c.c1);
      AU.presence(game, dt, s, a);
    },

    // ------------------------------------------------------------ what it does to the weak
    immune(e) { return !!(e.boss2 || e.type === 'boss' || e.lord || e.sovereign || e.titan || e.elite || e.apexId); },
    presence(game, dt, s, a) {
      AU._pT = (AU._pT || 0) - dt;
      if (AU._pT > 0) return;
      AU._pT = 0.25;
      if (a < 0.3 || !ECHO.Prowess) return;
      const pe = game.pe, L = ECHO.Prowess.level(game.pl), R = AU.radius(s);
      for (const e of game.ents) {
        if (e.dead || e === pe || e.pal || e.tamed || e.isCompanion || e.hidden || e.subdued > 0 || AU.immune(e) || !game.hostileTo(pe, e)) continue;
        if (U.dist(e.x, e.y, pe.x, pe.y) > R) continue;
        const gap = L - ECHO.Prowess.foeLevel(e);
        if (gap < 3) continue;
        e._cowed = game.time + 1; e._cowGap = gap;
        if (!e._cowOnce && gap >= 6) {
          e._cowOnce = true;
          e.stagger = Math.max(e.stagger || 0, 0.7); if (e.state === 'windup') e.state = 'stagger'; e.wcast = null;
          if (game.time - (AU._sayT || -9) > 0.6) { AU._sayT = game.time; ECHO.Combat.floater(e.x, e.y - 1.5 * (e.scale || 1), 'cowed', '#e0d0a8'); }
          if (!game.pl._auraTip) { game.pl._auraTip = true; ECHO.UI.toast('Your aura cows what is far beneath you: foes three or more levels below you hit you softer while they are inside it, and those six or more below falter when they first feel it. (Not the strong: elites, lords and the great beasts. Esc → Gameplay to dim it.)', 'study', 8); }
        }
      }
    },
    // what a cowed foe's blow is worth against you
    cowMul(game, from) { return from && from._cowed > game.time ? (from._cowGap >= 10 ? 0.75 : 0.85) : 1; },

    // ------------------------------------------------------------ on your page
    html(game) {
      const pl = game.pl, s = AU.strength(game), c = AU.colors(game), R = AU.radius(s), mode = AU.mode();
      const stage = s >= 0.95 ? 'a blaze that circles and rolls out across the ground' : s >= 0.65 ? 'a shell of flame, with sparks circling you' : s >= 0.45 ? 'a shell of flame round you' : s >= 0.35 ? 'runes turning at your feet, motes rising' : s >= 0.18 ? 'a ring of light, and motes rising off you' : 'a faint ring of light at your feet';
      return `<div class="card aura-card" style="--ac:${c.c1};--ac2:${c.c2}"><h4>✦ Your aura · <span style="color:${c.c1}">${c.rank.title}</span></h4><div class="aura-bar"><i style="width:${Math.round(Math.min(1, s) * 100)}%"></i></div><div style="font-size:13px">Strength <b class="gold">${Math.round(s * 100)}</b> — ${stage}. It grows with your level and the finest of what you wear, burns brighter in a fight and goes dark when you sneak.</div><div class="dim" style="font-size:12px">Foes three or more levels below you, within ${R.toFixed(1)} paces, are cowed and hit you ${Math.round((1 - 0.85) * 100)}–${Math.round((1 - 0.75) * 100)}% softer; six or more below falter when they first feel it. (Not elites, lords or great beasts.) ${mode === 'full' ? '' : `Shown: ${mode}. `}Esc → Gameplay: full, subtle or off.</div></div>`;
    }
  };
})();
