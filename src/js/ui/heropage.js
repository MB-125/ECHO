// ECHO.HeroPage — the Hero, Skills and Allies pages of the Hero tab, laid out to be read at a glance:
//   HERO    your level and how far to the next, then your numbers as tiles (power, life, stamina,
//           mana, each weapon, armour, renown, fate), how you stand against stronger foes, what you
//           wear, and your story folded away beneath;
//   SKILLS  each skill as a card: what it does for you, how it grows, and how far it has come;
//           tendencies only once you have one;
//   ALLIES  everyone and everything on your side in one place — a hired companion, your fellows,
//           your bound and tamed beasts, your horse and dog, your family — and, where you have
//           none yet, how to get one.
(function () {
  const { U } = ECHO;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = n => (U.fmt ? U.fmt(Math.round(n)) : String(Math.round(n)));

  const SK = {
    blade: { ic: '⚔', does: 'Harder sword blows, and quicker swings.', grow: 'Hit things with a blade.' },
    archery: { ic: '🏹', does: 'Harder, truer arrows and bolts; a longer draw.', grow: 'Hit things with arrows, bolts or missiles.' },
    flame: { ic: '🔥', does: 'More mana, faster mana, stronger fire.', grow: 'Cast fire (Q) and land it.' },
    ward: { ic: '🛡', does: 'More life, and a guard that holds longer.', grow: 'Block blows with Shift held.' },
    study: { ic: '📖', does: 'Learn more from what you read, find and watch.', grow: 'Study things (F), read, and explore.' },
    shadow: { ic: '🌙', does: 'Harder to see and hear; deadlier from hiding.', grow: 'Sneak (Ctrl) and strike unseen.' },
    tongue: { ic: '💬', does: 'Better prices, and people listen to you.', grow: 'Talk, trade and persuade.' },
    endurance: { ic: '🥾', does: 'More stamina and life; you tire less.', grow: 'Travel far, run and fight long.' }
  };
  const TEND = [['aggression', 'Aggression', 'Quicker strikes, a weaker guard.'], ['caution', 'Patience', 'Guarding costs less.'], ['reckless', 'Recklessness', 'Stronger, wilder fire.'], ['protect', 'Protectiveness', 'You stand between harm and others.'],
    ['mercy', 'Mercy', 'You spare the beaten.'], ['cruelty', 'Cruelty', 'You do not.'], ['betrayal', 'Faithlessness', 'You break your word.'], ['curiosity', 'Curiosity', 'You go and look.'], ['night', 'Night-work', 'You do your work by dark.']];

  const H = ECHO.HeroPage = {
    tile(label, value, sub, col) {
      return `<div class="hp-tile"${col ? ` style="--tc:${col}"` : ''}><span>${esc(label)}</span><b>${value}</b>${sub ? `<em>${sub}</em>` : ''}</div>`;
    },
    // ------------------------------------------------------------ HERO
    me(game) {
      const world = game.world, pl = game.pl, Pw = ECHO.Prowess, Ch = ECHO.Character, D = (ECHO.PlayerCtl && ECHO.PlayerCtl.derived) || {};
      const st = Pw.st(pl), L = st.lv, R = Pw.rank(L), nx = Pw.nextRank(L), need = Pw.need(L), pow = Pw.power(world, pl);
      const pct = L >= Pw.MAX ? 100 : Math.max(0, Math.min(100, Math.round(st.xp / need * 100)));
      const turned = Math.round((1 - ECHO.Gear.taken(world, pl, 'melee')) * 100);
      const it = id => id && world.items[id];
      const gun = it(pl.gun);
      const strike = Math.round(Pw.armLv(game, game.pe, { type: 'melee' }) * 10) / 10, struck = Math.round(Pw.guardLv(game, game.pe) * 10) / 10;
      const head = `<div class="hp-head" style="--rc:${R.color}">
          <div class="hp-ring"><small>LEVEL</small><b>${L}</b></div>
          <div class="hp-who"><div class="hp-name">${esc(pl.first)} ${esc(pl.last)}</div><div class="hp-rank" style="color:${R.color}">${esc(R.title)}${pl.knighted && world.factions[pl.knighted] ? ' · Knight of ' + esc(world.factions[pl.knighted].short) : ''}</div>
            <div class="hp-xp"><i style="width:${pct}%"></i></div>
            <div class="hp-xpl">${L >= Pw.MAX ? 'You have reached the height of your strength.' : `<b>${fmt(st.xp)}</b> / ${fmt(need)} XP to level ${L + 1}`}${nx ? ` <span>· next title: <b style="color:${nx.color}">${esc(nx.title)}</b> at level ${nx.lv}</span>` : ''}</div></div></div>`;
      const tiles = `<div class="hp-tiles">
          ${H.tile('Power', fmt(pow.total), 'all of it together', '#ffd27a')}
          ${H.tile('Life', fmt(D.maxHp || pl.maxHp || 0), pl.hp != null && pl.hp < (D.maxHp || pl.maxHp) ? `now ${fmt(pl.hp)}` : 'full', '#ff7a7a')}
          ${H.tile('Stamina', fmt(D.maxSta || pl.maxSta || 0), '', '#ffd06a')}
          ${H.tile('Mana', fmt(D.maxMana || pl.maxMana || 0), '', '#7ab4ff')}
          ${H.tile('Sword', fmt(pow.melee), 'a blow', '#e8e2d4')}
          ${H.tile('Bow', fmt(pow.bow), 'a shot', '#cfe6a8')}
          ${gun ? H.tile('Gun', fmt(D.gunDmg || gun.dmg || 0), esc(gun.name), '#9fe8ff') : ''}
          ${H.tile('Armour', turned + '%', 'of each blow turned', '#c8d4e0')}
          ${H.tile('Renown', fmt(pl.renown || 0), '', '#e8c860')}
          ${H.tile('Fate', `${pl.fate}/3`, 'second chances', '#d8a8ff')}
          ${H.tile('Best foe', st.best ? 'Lv ' + st.best : '—', 'beaten', '#ff9a7a')}
        </div>`;
      const vs = `<div class="hp-note"><b>In a fight</b> you strike at level <b>${strike}</b> and are struck at level <b>${struck}</b>. Foes three or more levels above that hit harder and take less; foes far below fall fast. Better gear than your level raises both.</div>`;
      const bio = Ch.biography(world, pl);
      const story = `<details class="hp-fold"><summary>Your story so far</summary><p class="prose">${bio.map(esc).join(' ')}</p>${pl.spells && pl.spells.length ? `<p class="gold">Secrets: ${pl.spells.map(k => esc(ECHO.Mysteries.REWARDS[k].name)).join(', ')}</p>` : ''}${pl.legacyOf ? `<p class="dim">Kin of ${esc((ECHO.Legacy.legendOf(world, pl.legacyOf) || {}).name || '')}.</p>` : ''}</details>`;
      return head + tiles + vs + (ECHO.UI.wornLineHtml ? ECHO.UI.wornLineHtml(world, pl) : '') + story;
    },
    // ------------------------------------------------------------ SKILLS
    skills(game) {
      const pl = game.pl, Ch = ECHO.Character;
      const top = Object.entries(pl.skills).sort((a, b) => b[1] - a[1])[0];
      const cards = Object.entries(pl.skills).map(([k, v]) => {
        const S = ECHO.SKILLS[k] || { name: k, noun: [] }, X = SK[k] || { ic: '◆', does: '', grow: '' }, n = Math.floor(v);
        const title = S.noun && S.noun.length ? S.noun[Math.min(S.noun.length - 1, Math.floor(v / 34))] : '';
        return `<div class="hp-sk${top && top[0] === k && v > 0 ? ' best' : ''}"><div class="hp-ski">${X.ic}</div><div class="hp-skm">
          <div class="hp-skt"><b>${esc(S.name)}</b><span>${n}<i>/100</i></span></div>
          <div class="hp-bar"><i style="width:${Math.min(100, v)}%"></i></div>
          <div class="hp-skd">${esc(X.does)}</div><div class="hp-skg">Grows when you: ${esc(X.grow)}${title ? ` · <span class="gold">${esc(title)}</span>` : ''}</div></div></div>`;
      }).join('');
      const have = TEND.map(([k, l, d]) => [l, d, Ch.tendency(pl, k)]).filter(t => t[2] > 0.02);
      const tend = have.length
        ? `<div class="hp-tends">${have.map(([l, d, v]) => `<div class="hp-tend" title="${esc(d)}"><span>${esc(l)}</span><div class="hp-bar thin"><i style="width:${Math.round(v * 100)}%"></i></div><em>${esc(d)}</em></div>`).join('')}</div>`
        : `<p class="dim">None yet. They form from how you play: fight hard and you grow aggressive, guard often and you grow patient.</p>`;
      return `<h3 class="gold">Skills</h3><p class="dim" style="margin-top:-4px">Every skill grows by doing it. Higher skill makes that thing stronger.</p><div class="hp-sks">${cards}</div>
        <h3 class="gold" style="margin-top:16px">Tendencies</h3>${tend}
        ${ECHO.Tech ? ECHO.Tech.pageHtml(pl) : ''}${ECHO.Lore ? ECHO.Lore.html(game) : ''}`;
    },
    // ------------------------------------------------------------ ALLIES
    allies(game) {
      const world = game.world, pl = game.pl, pe = game.pe;
      const out = [];
      const comp = pl.companion && world.npcs[pl.companion];
      if (comp && ECHO.Companions) out.push(ECHO.Companions.card(world, pl));
      const fel = ECHO.Fellow ? ECHO.Fellow.html(game) : '';
      if (fel && fel.replace(/<[^>]+>/g, '').trim()) out.push(fel);
      // the beasts, in one line each, with the way to their page
      const pack = ECHO.Tame ? ECHO.Tame.pack(pl) : [], bound = ECHO.Titans ? ECHO.Titans.bound(world) : [];
      if (pack.length || bound.length || pl.horse || pl.pet) {
        const row = (ic, name, sub) => `<div class="hp-ally"><span class="hp-ai">${ic}</span><div><b>${esc(name)}</b><em>${sub}</em></div></div>`;
        const rows = [];
        for (const t of bound) rows.push(row('◆', t.name, `Great beast · level ${t.lvl}`));
        for (const r of pack.slice(0, 12)) rows.push(row('❖', r.name || r.kind, `Tamed · level ${r.lvl}`));
        if (pack.length > 12) rows.push(`<div class="dim" style="font-size:12px">…and ${pack.length - 12} more tamed.</div>`);
        if (pl.horse) rows.push(row('🐎', pl.horse.name || 'Your horse', 'Horse · V to ride'));
        if (pl.pet) rows.push(row('🐕', pl.pet.name || 'Your dog', 'Dog'));
        out.push(`<div class="card tidy-skip"><h4>Your beasts</h4><div class="hp-allies">${rows.join('')}</div><div class="row" style="margin-top:8px"><button class="small" data-hubgo="beasts">Open the Beasts page</button></div></div>`);
      }
      const fam = ECHO.Life ? ECHO.Life.card(world, pl) : '';
      if (fam && fam.replace(/<[^>]+>/g, '').trim()) out.push(fam);
      // how to get the ones you have not
      const how = [];
      if (!comp) {
        let inn = null; for (const s of world.settlements) { const d = U.dist(s.x, s.y, pe.x, pe.y); if (!inn || d < inn.d) inn = { s, d }; }
        how.push(['🗡', 'A companion', `Hire a fighter at any inn. They fight beside you, level up with you and can be given gear.${inn ? ` Nearest town: <b>${esc(inn.s.name)}</b> (${Math.max(1, Math.round(inn.d / 2))} leagues).` : ''}`]);
      }
      if (!pack.length) how.push(['❖', 'A tamed beast', 'Beat a beast or monster below a third of its life, then press E.']);
      if (!bound.length) how.push(['◆', 'A great beast', 'Beat a great beast on its own range and bind it with E. You can keep four.']);
      if (!pl.horse) how.push(['🐎', 'A horse', 'Buy one at a town\'s stables, or catch a loose one.']);
      if (!pl.pet) how.push(['🐕', 'A dog', 'Strays hang about the towns: offer one food a few times.']);
      if (how.length) out.push(`<div class="card tidy-skip"><h4>${out.length ? 'More allies' : 'You travel alone, for now'}</h4><div class="hp-allies">${how.map(([ic, n, d]) => `<div class="hp-ally"><span class="hp-ai">${ic}</span><div><b>${n}</b><em>${d}</em></div></div>`).join('')}</div></div>`);
      if (ECHO.Apex) out.push(ECHO.Apex.html(game));
      return out.join('');
    }
  };
})();
