// The guide: what to do next, and how to do it.
// A page of the journal (J) that looks at where you stand — your road, your
// gear, what you carry, the dungeons you know — and says plainly what would
// move you forward, with a button to point the way. It also explains each
// objective, the fighting, the dungeons, the loot, and keeps a bestiary of
// every kind of monster you have killed.
(function () {
  const { U } = ECHO;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const X = () => ECHO.Explore;

  // How to do each kind of objective (matched on the objective's text).
  const HOW = [
    [/outlaws or beasts/i, 'Wolves roam the wild and outlaws camp off the roads. Follow the arrow at the top of the screen to the nearest camp. Left mouse strikes, right mouse shoots, Space rolls, Shift guards.'],
    [/plea/i, 'Read the notice board in any town square (walk up and press E), or talk to anyone who looks troubled. Accept a plea, do it, and come back to claim the reward.'],
    [/delve or dungeon|deep dungeon/i, 'Dungeons are marked ▼ on the map (M) once you have seen them; the stars show how dangerous they are. Fight floor by floor, take the stairs down, and open the chest on the last floor to clear it. The Guide page lists the ones you know.'],
    [/dungeon lords/i, 'Every deep dungeon has a lord on its last floor: the Necromancer, the Goblin Warlord, the Spider Queen, the Ogre Chieftain, the Forge Golem. Go down with herbs and good armour.'],
    [/kinds of monster/i, 'Each new kind of monster you kill goes in your bestiary (Guide page). Different dungeons hold different creatures: catacombs the dead, warrens goblins, nests spiders, forges living stone.'],
    [/named beast|bounty/i, 'Notice boards post hunts and bounties. Named beasts hunt in the wild; the plea says where they were last seen.'],
    [/knighted/i, 'Reach 40 renown and win a ruler\'s trust by doing their pleas and carrying their letters. Then speak to them at the keep.'],
    [/techniques/i, 'Techniques are learned by fighting: guard perfectly, roll, strike with fire — do it often and your body learns. Choose them on your character page (K).'],
    [/great beast/i, 'Great beasts sleep in lairs marked on the map. Bring herbs and arrows, and come back stronger if you must.'],
    [/chieftain/i, 'Outlaw camps are led by chieftains. Clear a camp to face its chief.'],
    [/^renown/i, 'Renown grows with every deed people hear of: cleared dungeons, slain beasts, kept promises, crimes solved.'],
    [/house|property/i, 'In any town, use the notice board → Property & business to buy a house, fields, or a share of a mill, mine, smithy or inn.'],
    [/standing in a town/i, 'Help a town and it remembers: do its pleas, work for its watch, sell it food when it is hungry.'],
    [/village|charter|people living|people in your lands|projects/i, 'Buy a royal charter at a capital\'s keep, clear the land, and name your village. Then build it up from its square: houses, fields, walls; invite settlers.'],
    [/crowns|worth/i, 'Money: sell monster parts and gear at any market, open dungeon chests and caches, collect bounties, work a shift in town, or buy into a business.'],
    [/lend/i, 'People in trouble sometimes ask for a loan when you talk to them.'],
    [/old tongue|words|ruins|echoes|archive|vault/i, 'Ruins hold tablets in the old tongue — visit them and read (E). The archives in capitals keep what you learn. On clear nights, wisps lead to the Echoes.'],
    [/land walked|places of the wild/i, 'Walk where you have not been: the map (M) shows the dark you have not seen. Every place you find counts.'],
    [/wonders you named/i, 'Waterfalls, hot springs, crystal grottoes, a giant\'s bones, a star\'s crater, a fairy ring — the first to find one names it.'],
    [/caches|journal|expedition/i, 'Cairns, hollow trees and loose stones hide caches (E to search). One holds the first page of the lost expedition\'s journal; each page points to the next.'],
    [/herbs/i, 'Rare herbs grow where the ground suits them and open only at certain hours. Look by water, in forests, on hills.'],
    [/watch|thief|brawl|crimes|ring/i, 'Talk to any watchman to join the watch. Their board has jobs; crimes are solved by visiting the scene, questioning people and naming the culprit.']
  ];

  const G = ECHO.Guide = {
    HOW,
    how(text) { const h = HOW.find(([re]) => re.test(text)); return h ? h[1] : ''; },

    // Your strength, roughly, in dungeon stars.
    power(world, pl) {
      const w = world.items[pl.weapon], a = pl.armor && world.items[pl.armor];
      const dmg = w ? w.dmg : 10, def = a ? a.def || 0 : 0;
      const lv = ECHO.Prowess ? ECHO.Prowess.level(pl) : 1;
      return U.clamp(Math.round(lv + Math.max(0, dmg - 16) / 8 + def / 15), 1, 15);
    },
    dungeons(world) { return X().sites(world).filter(s => s.cat === 'delve'); },
    // The dungeon worth going to next: known, not cleared, near your strength, not far.
    suggestDungeon(world, pl) {
      const p = G.power(world, pl);
      let best = null, bs = -Infinity;
      for (const s of G.dungeons(world)) {
        if (s.cleared) continue;
        const lv = X().level(world, s), d = U.dist(s.x, s.y, pl.x, pl.y);
        const sc = -Math.abs(lv - p) * 40 - (lv > p + 1 ? 200 : 0) - d * 0.5 + (s.found || s.seen ? 30 : 0);
        if (sc > bs) { bs = sc; best = s; }
      }
      return best;
    },

    // What would move you forward right now.
    suggestions(game) {
      const world = game.world, pl = game.pl, out = [];
      const Gr = ECHO.Gear;
      const add = (icon, html, btn) => out.push({ icon, html, btn });
      // health
      if (game.pe && game.pe.hp < game.pe.maxHp * 0.4) add('❤', pl.inv.herbs > 0 ? `You are hurt. Use herbs (<b>G</b>) — you carry ${pl.inv.herbs}.` : 'You are hurt and have no herbs. Rest at an inn, or buy herbs at a market.');
      if (!(pl.inv.herbs > 0)) add('🌿', 'Carry herbs before going below ground. Any market sells them; <b>G</b> uses one.');
      if ((pl.inv.arrows || 0) < 10) add('🏹', 'You are low on arrows. Markets and smiths sell them.');
      // better gear in your pack
      const items = pl.items.map(id => world.items[id]).filter(Boolean);
      const wpn = world.items[pl.weapon], bow = world.items[pl.bow], arm = pl.armor && world.items[pl.armor];
      const better = items.find(it => (it.kind === 'sword' && wpn && it.dmg > wpn.dmg && it.id !== pl.weapon) || (it.kind === 'bow' && bow && it.dmg > bow.dmg && it.id !== pl.bow) || (it.kind === 'armor' && (!arm || (it.def || 0) > (arm.def || 0)) && it.id !== pl.armor));
      if (better) add('⚔', `<b>${esc(better.name)}</b> in your pack is better than what you use. Equip it on your character page (<b>K</b>).`);
      if (!arm) add('🛡', 'You wear no armour. Armour drops from monsters and chests, and a smith can make a hide jerkin from 4 wolf hides and 25 crowns.');
      // loot to sell or use
      const mats = Gr.mats(pl);
      if (mats.length) {
        const worth = mats.reduce((a, m) => a + m.value * m.n, 0);
        const can = [wpn, bow, arm].filter(Boolean).find(it => Gr.canPay(pl, Gr.honeCost(it)));
        add('💰', `You carry monster parts worth about <b class="gold">${worth}</b> crowns (${mats.map(m => `${m.n} ${esc(m.name)}`).join(', ')}). Sell them at any market${can ? `, or take them to a smith: you can already improve your <b>${esc(can.name)}</b>` : ', or keep them for a smith to improve your gear'}.`);
      }
      const spare = items.filter(it => it.id !== pl.weapon && it.id !== pl.bow && it.id !== pl.armor && it.rarity && !it.legend);
      if (spare.length >= 2) add('🎒', `${spare.length} pieces of gear you do not use — sell them at a market for about <b class="gold">${spare.reduce((a, it) => a + Gr.value(it), 0)}</b> crowns.`);
      // a dungeon to go to
      const d = G.suggestDungeon(world, pl);
      if (d) {
        const lv = X().level(world, d), p = G.power(world, pl);
        const known = d.found || d.seen;
        add('▼', `${known ? `<b>${esc(d.name)}</b>` : 'An uncharted dungeon'} ${known ? '' : 'lies '}${esc(ECHO.Purpose.dirTo(world, pl, d))}, ${Math.round(U.dist(d.x, d.y, pl.x, pl.y))} leagues — ${X().stars(d)} ${X().floors(d)} floor${X().floors(d) > 1 ? 's' : ''}${lv > p ? ' <span class="ember">(harder than you are ready for)</span>' : lv < p - 1 ? ' <span class="dim">(easy for you now)</span>' : ' <span class="gold">(about your strength)</span>'}.`, { track: 'site:' + d.id, label: pl.tracked === 'site:' + d.id ? 'Stop guiding' : 'Guide me there' });
      }
      if (!pl.focus) add('✦', 'You have not chosen a road. The Ambitions page (Tab) lets you pick one — then the line at the top of the screen always points the way.');
      return out;
    },

    // The whole page.
    html(game) {
      const world = game.world, pl = game.pl;
      const A = ECHO.Ambition;
      let html = '';
      // ---- right now
      const g = ECHO.Purpose.current(game);
      html += '<h3 class="gold">Right now</h3>';
      if (g) {
        html += `<div class="card"><h4>${esc(g.label)}</h4>${g.where ? `<div class="dim">${esc(g.where.vague ? 'somewhere ' + ECHO.Purpose.dirTo(world, pl, g.where) : g.where.name)}${g.where.x != null ? ` · ${Math.round(U.dist(g.where.x, g.where.y, pl.x, pl.y))} leagues` : ''}</div>` : ''}`;
        if (g.kind === 'ambition' && pl.focus) {
          const n = A.next(world, pl, pl.focus);
          if (n) html += `<ul class="guide-steps">${n.objectives.map(o => `<li class="${o.done ? 'gold' : ''}">${o.done ? '✔ ' : '☐ '}<b>${esc(o.text)}</b>${o.need > 1 ? ` — ${o.have}/${o.need}` : ''}${o.done ? '' : `<div class="dim">${esc(G.how(o.text))}</div>`}</li>`).join('')}</ul><div class="dim">Reward for <b>${esc(n.R.title)}</b>: ${esc(n.R.reward)}</div>`;
        } else if (g.kind === 'track') html += `<div class="dim">Follow the arrow at the top of the screen. ${pl.tracked && pl.tracked.startsWith('site:') ? 'Go down floor by floor; the chest on the last floor clears it.' : ''}</div><div class="row"><button class="small" data-track="${esc(pl.tracked)}">Stop tracking</button></div>`;
        html += '</div>';
      } else html += '<p class="dim">Nothing chosen. Pick a road on the Ambitions page, or track a promise.</p>';
      // ---- suggestions
      const sug = G.suggestions(game);
      if (sug.length) html += `<h3 class="gold">What would help</h3><div class="list">${sug.map(s => `<div class="card guide-tip"><span class="gi">${s.icon}</span><div>${s.html}${s.btn ? `<div class="row"><button class="small" data-track="${esc(s.btn.track)}">${esc(s.btn.label)}</button></div>` : ''}</div></div>`).join('')}</div>`;
      // ---- dungeons
      const all = G.dungeons(world), known = all.filter(s => s.found || s.seen).sort((a, b) => U.dist(a.x, a.y, pl.x, pl.y) - U.dist(b.x, b.y, pl.x, pl.y));
      html += `<h3 class="gold">Dungeons you know <span class="dim">(${known.length} of ${all.length})</span></h3>`;
      html += known.length ? `<table class="grid"><tr><th>Dungeon</th><th>Danger</th><th>Floors</th><th>Where</th><th></th></tr>${known.map(s => {
        const fl = X().floors(s), done = Object.keys(s.floorsDone || {}).length;
        return `<tr><td><b>${esc(s.name)}</b><div class="dim" style="font-size:12px">${esc(X().label(s))}</div></td><td class="gold">${X().stars(s)}</td><td>${s.cleared ? '<span class="gold">cleared</span>' : `${Math.min(done, fl)}/${fl}`}</td><td class="dim">${Math.round(U.dist(s.x, s.y, pl.x, pl.y))} lg ${esc(ECHO.Purpose.dirTo(world, pl, s).replace('to the ', ''))}</td><td>${s.cleared ? '' : `<button class="small" data-track="site:${s.id}">${pl.tracked === 'site:' + s.id ? 'Stop' : 'Guide me'}</button>`}</td></tr>`;
      }).join('')}</table>` : '<p class="dim">You know of none yet. Walk the wild; hilltops (lookouts) show you what lies around them.</p>';
      if (all.length > known.length) html += `<p class="dim">${all.length - known.length} more lie uncharted. The deeper into the wild, the worse they are.</p>`;
      // ---- bestiary
      const D = ECHO.Monsters.DEFS, best = pl.bestiary || {};
      const kinds = Object.keys(D).filter(k => k !== 'slimeling');
      const seen = kinds.filter(k => best[k]);
      html += `<h3 class="gold">Bestiary <span class="dim">(${seen.length} of ${kinds.length})</span></h3><div class="bestiary">${kinds.map(k => best[k] ? `<div class="card"><h4>${esc(U.cap(D[k].name.replace(/^the /, '')))}${D[k].boss ? ' <span class="ember">· lord</span>' : ''} <span class="dim">× ${best[k]}</span></h4><div>${esc(D[k].desc)}</div><div class="gold" style="font-size:13px">Weakness: ${esc(D[k].weak)}</div><div class="dim" style="font-size:12px">Drops: ${(D[k].loot || []).map(l => ECHO.Gear.MATS[l[0]].name).join(', ') || 'nothing'}</div></div>` : '<div class="card dim"><h4>???</h4><div>Not yet met.</div></div>').join('')}</div>`;
      // ---- how things work
      html += `<h3 class="gold">How to…</h3><div class="prose guide-how">
<p><b>Fight.</b> Left mouse strikes; hold it for a heavy blow. Right mouse shoots your bow. <b>Space</b> rolls through attacks; <b>Shift</b> guards (a guard just as a blow lands staggers the attacker). <b>Q</b> throws fire (hold to grow it) — many monsters burn. <b>G</b> uses herbs to heal, <b>H</b> eats. <b>R</b> locks on to a foe; <b>F</b> studies a creature.</p>
<p><b>Grow stronger.</b> Every foe you defeat teaches you something: experience fills the purple bar under your name, and each level makes every blow harder and your life deeper. Ranks run Novice, Fighter, Veteran, Champion, Hero, Legend, Mythic. Foes above your level teach you the most; foes far below you teach you nothing. Your skills (blade, archery, flame…) also grow with use.</p>
<p><b>Know your enemy.</b> Every foe's name shows its level, coloured by how it measures against you — grey trivial, green easy, white even, gold hard, orange deadly (☠☠), red: run (☠☠☠). ◆ marks an elite, ◆◆ a champion, ♛ a lord or great beast. The panel at the bottom-left shows the foe you face: its level and rank, its health, what it is worth, and its weakness once it is in your bestiary.</p>
<p><b>Read a monster.</b> Over each monster is its name and level. A red circle on the ground means a slam is coming — get out of it. Poison (green) drains you over time; webs slow you; some monsters heal, split, teleport, charge or call for help. Elites (Hulking, Frenzied, Venomous, Ancient) are tougher and drop more. Floating words tell you when something resists a blow or is weak to it.</p>
<p><b>Explore a dungeon.</b> Walk into the entrance (E). Each floor is a warren of rooms and passages — the map in the corner fills in as you go. The way down (or the lord's chamber, on the deepest floor) lies behind an iron door: one monster on the floor, the <b>Keybearer</b>, carries its key. Pressure plates in the passages glow before they fire spikes or flame — roll across them. Dead-end rooms often hold a strongbox. Lords change how they fight at half health. You can climb back up, or walk out of the door you came in, at any time.</p>
<p><b>Collect loot.</b> Monsters drop coins, parts and sometimes gear. Walk over coins and parts to pick them up; stand over gear and press <b>E</b>. Gear comes in five rarities — <span style="color:${ECHO.Gear.RARITY[0].color}">Common</span>, <span style="color:${ECHO.Gear.RARITY[1].color}">Fine</span>, <span style="color:${ECHO.Gear.RARITY[2].color}">Rare</span>, <span style="color:${ECHO.Gear.RARITY[3].color}">Epic</span>, <span style="color:${ECHO.Gear.RARITY[4].color}">Legendary</span> — and the better pieces carry a power of their own.</p>
<p><b>Sell or upgrade.</b> Any market buys monster parts and spare gear. A smith will hone your sword, restring your bow and reinforce your armour — five times each — for coin and the right parts, and makes armour from hides, silk, troll hide, grave-iron and golem cores.</p>
<p><b>Make money.</b> Dungeon chests and caches, monster parts, gear, bounties and pleas; a shift of work in town; a share in a mill or mine.</p>
<p><b>Find your way.</b> The line at the top of the screen always says what you are working towards and points to it. <b>M</b> opens the map, <b>Tab</b> the journal, <b>K</b> your character, <b>J</b> this guide. Coaches carry you between towns for a few crowns.</p></div>`;
      return html;
    }
  };
})();
