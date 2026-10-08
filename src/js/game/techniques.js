// Techniques: fighting moves you discover by fighting.
//
// Nothing is bought or chosen from a tree. Every guard, roll, finisher,
// arrow and flame you use in a real fight is counted, and when you have done
// a thing often enough your body finds something new in it — a riposte after
// a perfect guard, a lunge out of a roll, a whirlwind when you are surrounded.
// Each technique grows (I → II → III) as you keep using what made it.
// You can only keep so many in mind at once: the build is which ones you
// carry, chosen on the character page (K). More slots open as you discover more.
(function () {
  const { U } = ECHO;
  const G = () => ECHO.Game;

  // stat: what you have to keep doing. at: [discover, II, III]. lv: effect per level.
  const TECHS = {
    riposte: { name: 'Riposte', stat: 'perfectGuards', at: [6, 20, 45], icon: '⚔', kind: 'blade',
      desc: lv => `After a perfect guard, your next strike within a moment is unblockable and lands ×${[0, 1.8, 2.2, 2.7][lv]}.`,
      hint: 'Something in the way you meet a blow at the last instant…', lv: [0, 1.8, 2.2, 2.7] },
    lunge: { name: 'Lunge', stat: 'dodges', at: [25, 70, 150], icon: '➶', kind: 'blade',
      desc: lv => `Strike as you come out of a roll to lunge across the gap (×${[0, 1.4, 1.6, 1.85][lv]} damage).`,
      hint: 'Rolling out of harm, your feet want to keep going…', lv: [0, 1.4, 1.6, 1.85] },
    whirlwind: { name: 'Whirlwind', stat: 'finishers', at: [15, 45, 100], icon: '✺', kind: 'blade',
      desc: lv => `A heavy blow with foes on more than one side becomes a full turn that strikes them all (×${[0, 1, 1.15, 1.35][lv]}).`,
      hint: 'The third strike of your combo keeps wanting to come all the way round…', lv: [0, 1, 1.15, 1.35] },
    bash: { name: 'Shield Bash', stat: 'blocks', at: [40, 120, 280], icon: '⛨', kind: 'guard',
      desc: lv => `Strike while guarding to drive your guard into them: breaks their guard and staggers for ${[0, 0.7, 0.9, 1.2][lv]}s.`,
      hint: 'So many blows taken on the guard. You could push back…', lv: [0, 0.7, 0.9, 1.2] },
    executioner: { name: 'Executioner', stat: 'staggeredHits', at: [25, 80, 180], icon: '☠', kind: 'blade',
      desc: lv => `Blows against staggered, yielding or badly wounded foes land +${[0, 35, 55, 80][lv]}%.`,
      hint: 'You have learned where to strike a reeling enemy…', lv: [0, 0.35, 0.55, 0.8] },
    momentum: { name: 'Momentum', stat: 'comboHits', at: [120, 350, 800], icon: '»', kind: 'blade',
      desc: lv => `Each hit without being hit builds momentum: up to ${[0, 5, 7, 10][lv]} stacks of +4% damage and +2% speed. Taking a wound breaks it.`,
      hint: 'Hit after hit, unanswered — there is a rhythm in it…', lv: [0, 5, 7, 10] },
    secondwind: { name: 'Second Wind', stat: 'closeCalls', at: [3, 10, 25], icon: '❤', kind: 'body',
      desc: lv => `Once in a while, when your life falls below a fifth, you rally: +${[0, 25, 32, 40][lv]}% life and all your stamina.`,
      hint: 'You keep winning fights you should have lost…', lv: [0, 0.25, 0.32, 0.4] },
    ironhide: { name: 'Iron Hide', stat: 'dmgTaken', at: [700, 2200, 5500], icon: '◈', kind: 'body',
      desc: lv => `Scar on scar: you take ${[0, 6, 10, 14][lv]}% less damage.`,
      hint: 'You have bled a great deal. It hurts less than it did…', lv: [0, 0.06, 0.1, 0.14] },
    shadowroll: { name: 'Shadow Roll', stat: 'dodgedHits', at: [10, 30, 70], icon: '◐', kind: 'body',
      desc: lv => `Rolling through a blow slows the world for a breath, and your next strike is certain to find a weak point${lv >= 3 ? ' (and lands harder)' : ''}.`,
      hint: 'Blades keep passing through the space where you were…', lv: [0, 1, 1.15, 1.35] },
    twinshot: { name: 'Twin Shot', stat: 'arrowHits', at: [30, 90, 200], icon: '⇉', kind: 'bow',
      desc: lv => `A perfect release looses ${[0, 1, 2, 2][lv]} more arrow${lv > 1 ? 's' : ''} beside the first${lv >= 3 ? ', each as strong' : ''}.`,
      hint: 'Your fingers are quick on the string now…', lv: [0, 1, 2, 2] },
    pinning: { name: 'Pinning Shot', stat: 'perfectShots', at: [10, 30, 70], icon: '⤓', kind: 'bow',
      desc: lv => `Perfect arrows pin what they hit, staggering it for ${[0, 0.8, 1.2, 1.6][lv]}s.`,
      hint: 'You can place an arrow exactly where it will hurt to move…', lv: [0, 0.8, 1.2, 1.6] },
    emberedge: { name: 'Ember Edge', stat: 'fireHits', at: [20, 60, 140], icon: '🜂', kind: 'flame',
      desc: lv => `Your blade carries fire: melee hits set foes burning for ${[0, 1.5, 2, 2.6][lv]}s (4 mana a strike).`,
      hint: 'The heat of your flame has got into your sword arm…', lv: [0, 1.5, 2, 2.6] },
    flamering: { name: 'Flame Ring', stat: 'casts', at: [30, 80, 180], icon: '◎', kind: 'flame',
      desc: lv => `Cast while guarding (Shift + Q) to burst flame all around you, ${[0, 2.2, 2.7, 3.2][lv]} paces wide. It never turns on you.`,
      hint: 'You could let the fire out all at once, all around you…', lv: [0, 2.2, 2.7, 3.2] },
    shadowstrike: { name: 'Shadow Strike', stat: 'stealthHits', at: [5, 15, 40], icon: '✧', kind: 'shadow',
      desc: lv => `Strikes on the unaware land ×${[0, 4, 5, 6][lv]} instead of ×3${lv >= 2 ? ', and kills from hiding make no sound' : ''}.`,
      hint: 'You have learned to wait for the moment they look away…', lv: [0, 4, 5, 6] },
    warcry: { name: 'War Cry', stat: 'kills', at: [30, 90, 220], icon: '♆', kind: 'body',
      desc: lv => `Killing with a finisher lets out a roar that staggers foes around you for ${[0, 0.6, 0.9, 1.2][lv]}s; faint-hearted outlaws flee.`,
      hint: 'So many fights ended by your hand. They have begun to fear the sound of it…', lv: [0, 0.6, 0.9, 1.2] }
  };
  const ORDER = Object.keys(TECHS);

  const T = ECHO.Tech = {
    TECHS, ORDER,
    st(pl) {
      pl = pl || G().pl;
      pl.tech = pl.tech || { known: {}, active: [] };
      pl.combatStats = pl.combatStats || {};
      return pl.tech;
    },
    level(k) { const pl = G().pl; if (!pl || !pl.tech) return 0; return pl.tech.active.includes(k) ? (pl.tech.known[k] || 0) : 0; },
    slots(pl) { const n = Object.keys(T.st(pl).known).length, x = pl.extraSlots || 0; return Math.min(5 + x, 2 + Math.floor(n / 3) + x); },
    v(k) { const lv = T.level(k); return lv ? TECHS[k].lv[lv] : 0; },

    // Count something done in a real fight.
    record(stat, n = 1) {
      const game = G(), pl = game.pl;
      if (!pl || game.ff || (ECHO.Fest && ECHO.Fest.contest)) return;
      const t = T.st(pl);
      const S = pl.combatStats;
      S[stat] = (S[stat] || 0) + n;
      for (const k of ORDER) {
        const d = TECHS[k];
        if (d.stat !== stat) continue;
        const want = d.at.filter(a => S[stat] >= a).length;
        const have = t.known[k] || 0;
        if (want > have) {
          t.known[k] = want;
          if (have === 0) T.discover(k);
          else T.levelUp(k, want);
        }
      }
    },
    discover(k) {
      const game = G(), pl = game.pl, d = TECHS[k];
      const t = T.st(pl);
      let note = '';
      if (t.active.length < T.slots(pl)) { t.active.push(k); note = ' It is ready to use.'; }
      else note = ` You can only keep ${T.slots(pl)} techniques in mind — choose on the character page (K).`;
      game.slowMo(0.9, 0.3);
      ECHO.Combat.ring(game.pe.x, game.pe.y, 2.4, 'rgba(255,230,160,0.9)', 0.7);
      ECHO.Combat.floater(game.pe.x, game.pe.y - 1.4, `${d.icon} ${d.name}`, '#ffe08a', true);
      if (ECHO.Music) ECHO.Music.stinger('discover');
      ECHO.UI.banner(`Technique discovered: ${d.name}`, d.desc(1));
      ECHO.UI.toast(`${d.name} — ${d.desc(1)}${note}${Object.keys(t.known).length === 1 ? ' (Techniques come from how you fight. Keep fighting your way and more will come.)' : ''}`, 'legend', 9);
      ECHO.Chronicle.add(game.world, { text: `${pl.first} ${pl.last} learned in battle what others call ${d.name.toLowerCase() === 'riposte' ? 'the riposte' : 'the ' + d.name.toLowerCase()}.`, kind: 'player', importance: 0, char: pl.charId, x: game.pe.x, y: game.pe.y });
    },
    levelUp(k, lv) {
      const game = G(), d = TECHS[k];
      ECHO.Combat.floater(game.pe.x, game.pe.y - 1.4, `${d.name} ${['', 'I', 'II', 'III'][lv]}`, '#ffe08a', true);
      ECHO.UI.toast(`${d.name} grows stronger (${['', 'I', 'II', 'III'][lv]}): ${d.desc(lv)}`, 'legend', 7);
      if (ECHO.Music) ECHO.Music.stinger('letter');
    },
    toggle(k) {
      const pl = G().pl, t = T.st(pl);
      if (!t.known[k]) return;
      if (t.active.includes(k)) t.active = t.active.filter(x => x !== k);
      else if (t.active.length < T.slots(pl)) t.active.push(k);
      else return false;
      return true;
    },

    // ------------------------------------------------------------ effects
    momentum: 0, riposteT: 0, shadowT: 0, windCd: 0,
    tick(game, dt) {
      T.riposteT = Math.max(0, T.riposteT - dt);
      T.shadowT = Math.max(0, T.shadowT - dt);
      T.windCd = Math.max(0, T.windCd - dt);
      if (game.combatT == null || game.time - game.combatT > 8) T.momentum = 0;
    },
    // Multiplier on damage you deal.
    dealt(target, src) {
      let m = 1;
      const lvE = T.level('executioner');
      if (lvE && (target.stagger > 0 || target.yielded || target.hp < target.maxHp * 0.25)) m *= 1 + TECHS.executioner.lv[lvE];
      if (T.level('momentum')) m *= 1 + T.momentum * 0.04;
      if (src.riposte) m *= T.v('riposte');
      if (src.shadowroll) m *= T.v('shadowroll');
      return m;
    },
    stealthMul() { return T.level('shadowstrike') ? T.v('shadowstrike') : 3; },
    taken() { return 1 - T.v('ironhide'); },
    speedMul() { return 1 + (T.level('momentum') ? T.momentum * 0.02 : 0); },

    // A blow of yours landed.
    onHit(game, target, src, dmg) {
      const type = src.type;
      if (type === 'melee') {
        T.record('comboHits');
        const mx = T.v('momentum');
        if (mx) T.momentum = Math.min(mx, T.momentum + 1);
        const em = T.level('emberedge');
        if (em && game.pl.mana >= 4 && !target.dead) { game.pl.mana -= 4; target.burn = Math.max(target.burn || 0, TECHS.emberedge.lv[em]); target.burnFrom = game.pe; ECHO.Combat.burst(target.x, target.y - 0.3, '#ff9a3c', 5, 2, 0.3, 2); }
        if (src.wasStaggered || target.yielded) T.record('staggeredHits');
      }
      if (type === 'ranged') {
        T.record('arrowHits');
        if (src.perfect) T.record('perfectShots');
        if (src.perfect && T.level('pinning') && !target.dead && target.type !== 'boss') { target.stagger = Math.max(target.stagger || 0, T.v('pinning')); ECHO.Combat.floater(target.x, target.y - 1, 'pinned', '#e8d9a0'); }
      }
      if (type === 'fire') T.record('fireHits');
      if (src.stealth) T.record('stealthHits');
      void dmg;
    },
    // You were hit (after mitigation).
    onHurt(game, dmg) {
      T.momentum = 0;
      T.record('dmgTaken', dmg);
      const lv = T.level('secondwind'), pl = game.pl;
      if (lv && T.windCd <= 0 && pl.hp > 0 && pl.hp < pl.maxHp * 0.2) {
        T.windCd = 75;
        pl.hp = Math.min(pl.maxHp, pl.hp + pl.maxHp * TECHS.secondwind.lv[lv]); game.pe.hp = pl.hp;
        pl.stamina = pl.maxSta;
        ECHO.Combat.ring(game.pe.x, game.pe.y, 2, 'rgba(255,140,140,0.9)', 0.6);
        ECHO.Combat.floater(game.pe.x, game.pe.y - 1.3, 'second wind!', '#ff9a9a', true);
        ECHO.Sfx.play('heal'); game.slowMo(0.5, 0.4);
      }
    },
    onPerfectGuard(game) {
      T.record('perfectGuards');
      if (T.level('riposte')) { T.riposteT = 1.1; ECHO.Combat.floater(game.pe.x, game.pe.y - 1.3, 'riposte!', '#ffe08a'); }
    },
    onDodgedHit(game) {
      T.record('dodgedHits');
      if (T.level('shadowroll') && T.shadowT <= 0.5) { T.shadowT = 1.2; game.slowMo(0.55, 0.35); ECHO.Combat.floater(game.pe.x, game.pe.y - 1.2, 'shadow roll', '#9fd3ff'); }
    },
    onKill(game, target, type, src) {
      const pl = game.pl;
      T.record('kills');
      if (pl.hp < pl.maxHp * 0.25) T.record('closeCalls');
      const lv = T.level('warcry');
      if (lv && type === 'melee' && src.finisher) {
        ECHO.Combat.ring(game.pe.x, game.pe.y, 4.5, 'rgba(255,200,120,0.85)', 0.5);
        ECHO.Sfx.play('roar', { vol: 0.45, pitch: 1.6 });
        for (const e of game.ents) {
          if (e.dead || e === target || !game.hostileTo(game.pe, e) || e.type === 'boss') continue;
          if (U.dist(e.x, e.y, game.pe.x, game.pe.y) > 5) continue;
          e.stagger = Math.max(e.stagger || 0, TECHS.warcry.lv[lv]);
          if (e.type === 'person' && e.role === 'bandit' && e.npcId && ECHO.People.has(game.world.npcs[e.npcId], 'cowardly')) { e.state = 'flee'; e.say = 'Run!'; e.sayT = 1.5; }
        }
      }
    },

    // ------------------------------------------------------------ what you see
    hud() {
      const pl = G().pl;
      if (!pl || !pl.tech || !pl.tech.active.length) return '';
      return pl.tech.active.map(k => {
        const d = TECHS[k], lv = pl.tech.known[k];
        let cls = '', extra = '';
        if (k === 'riposte' && T.riposteT > 0) cls = 'ready';
        if (k === 'shadowroll' && T.shadowT > 0) cls = 'ready';
        if (k === 'momentum' && T.momentum) { extra = ' ' + T.momentum; cls = 'ready'; }
        if (k === 'secondwind' && T.windCd > 0) cls = 'cool';
        return `<span class="tech ${cls}" title="${d.name} ${['', 'I', 'II', 'III'][lv]}">${d.icon}${extra}</span>`;
      }).join('');
    },
    pageHtml(pl) {
      const t = T.st(pl), S = pl.combatStats;
      const known = ORDER.filter(k => t.known[k]);
      const unknown = ORDER.filter(k => !t.known[k]);
      const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      const bar = (v, max) => `<div class="t" style="display:inline-block;width:120px;vertical-align:middle"><div style="width:${Math.min(100, v / max * 100)}%"></div></div>`;
      return `<h3 class="gold" style="margin-top:16px">Techniques — learned in battle <span class="dim" style="font-size:14px">(${t.active.length}/${T.slots(pl)} carried)</span></h3>
        ${known.length ? known.map(k => {
          const d = TECHS[k], lv = t.known[k], on = t.active.includes(k), next = d.at[lv];
          return `<div class="card" style="${on ? 'border-color:#c8a85a' : ''}"><h4>${d.icon} ${esc(d.name)} ${['', 'I', 'II', 'III'][lv]} <button class="small" data-tech="${k}" style="float:right">${on ? 'Carried' : 'Carry'}</button></h4><div>${esc(d.desc(lv))}</div>${next ? `<div class="dim" style="font-size:13px">Grows with use ${bar(S[d.stat] || 0, next)} ${Math.floor(S[d.stat] || 0)}/${next}</div>` : '<div class="dim" style="font-size:13px">Mastered.</div>'}</div>`;
        }).join('') : '<p class="dim">None yet. Techniques are not taught — they come from fighting the way you fight, again and again.</p>'}
        ${unknown.length ? `<div class="dim" style="margin-top:6px">${unknown.map(k => { const d = TECHS[k], v = S[d.stat] || 0; return v > 0 ? `<div style="font-size:13px">？ ${esc(d.hint)} ${bar(v, d.at[0])}</div>` : ''; }).join('')}</div>` : ''}`;
    }
  };
})();
