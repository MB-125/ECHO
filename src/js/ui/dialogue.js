// Dialogue is generated from what people actually know and remember:
// their memories, family, opinions, the news that has reached their town,
// the item on their hip, and who they were named after.
(function () {
  const { U } = ECHO;
  const P = () => ECHO.People;
  const T = ECHO.TIME;

  function pick(arr, seed) { return arr[Math.abs(seed | 0) % arr.length]; }
  function seedOf(world, npc) { return ECHO.hashStr(npc.id + ':' + world.day + ':' + Math.floor(world.minute / 120)); }

  const D = ECHO.Dialogue = {
    opinion(world, npc, pl) {
      if (!pl) return 0;
      return (npc.op[pl.charId] || 0) + (npc.op['faction:' + npc.faction] || 0) * 0;
    },
    mood(world, npc) {
      const s = ECHO.Sim.settlement(world, npc.loc);
      if (npc.starve > 3 || (s && s.hunger > 0.3)) return 'hungry';
      const recent = npc.mem.filter(m => world.day - m.d < 12);
      if (recent.some(m => m.type === 'grief')) return 'grieving';
      if (recent.some(m => m.type === 'trauma')) return 'shaken';
      if (recent.some(m => m.type === 'joy' || m.type === 'pride')) return 'glad';
      return 'plain';
    },

    // Why someone is on the road, in their own words.
    journeyLine(world, npc) {
      const j = npc.journey && (world.journeys || []).find(x => x.id === npc.journey);
      if (!j) return null;
      const S2 = id => (ECHO.Sim.settlement(world, id) || {}).name || 'somewhere';
      const from = S2(j.from), to = S2(j.to), why = j.meta && j.meta.why;
      switch (j.kind) {
        case 'caravan': return `I'm taking ${Object.keys(j.cargo || { goods: 1 }).join(' and ')} from ${from} to ${to}. Prices are better there.`;
        case 'aid': return `Grain for the hungry of ${to}, by order of the crown. Stand aside.`;
        case 'army': return `We march on ${to}. Stay off the road if you know what's good for you.`;
        case 'pilgrim': return npc.home === j.to ? `Coming home from the pilgrimage. I've seen the great temple at ${from}.` : `I'm on pilgrimage to ${to}. I've saved a long time for this.`;
        case 'return': return `Heading home to ${to}.`;
        case 'migrate':
          if (why === 'hunger') return `We're leaving ${from}. There's no bread there anymore. They say ${to} has food.`;
          if (why === 'fear') return `We left ${from} — too close to what's out there. ${to} should be safer.`;
          if (why === 'fortune') return `There was nothing for me in ${from}. I'm going to ${to} to make something of myself.`;
          if (why === 'banished') return `They banished me from ${from}. I'll start again in ${to}.`;
          if (why === 'redemption') return `I'm going home to ${to}. I'm done with the Ashfang.`;
          if (why === 'resettle') return `The crown is sending us to settle ${to}.`;
          return `I'm moving from ${from} to ${to}.`;
        default: return `On the road from ${from} to ${to}.`;
      }
    },
    praise(world, npc, pl) {
      const sd = ECHO.hashStr(npc.id + world.day);
      const helped = npc.mem.some(m => m.type === 'gratitude' && m.t.includes(pl.first));
      return pick(helped ? [`${pl.first}! I haven't forgotten what you did.`, 'There they are — the one who helped us!', 'Bless you, friend.'] : [`Look — it's ${pl.first}!`, `${pl.first} ${pl.last}… they say you're a hero.`, 'Good day to you, friend!', 'An honour.'], sd);
    },
    greeting(world, npc, pl) {
      const op = D.opinion(world, npc, pl);
      const sd = seedOf(world, npc);
      const name = pl.first;
      const g = npc.mind && npc.mind.goal;
      const road = D.journeyLine(world, npc);
      if (road && !(g && g.kind === 'avenge' && g.target.type === 'player')) return (op < -40 ? 'Keep your distance. ' : 'Well met on the road. ') + road;
      if (npc.sick) return pick(['*cough* Stay back, friend — I\'ve the fever.', `Forgive me… I'm not well. ${ECHO.Disease.get(world, npc.sick.d) ? U.cap(ECHO.Disease.get(world, npc.sick.d).name) + '.' : ''}`], sd);
      if (g && g.kind === 'avenge' && g.target.type === 'player' && g.target.id === pl.charId) return pick([`You. You killed my ${g.target.rel}. You have the nerve to speak to me?`, `${g.target.victim} is in the ground because of you. Say what you came to say.`], sd);
      const legendFor = npc.namedAfter && ECHO.Legacy.legendOf(world, npc.namedAfter);
      const lines = [];
      if (npc.prof === 'bandit') lines.push(pick(['What do you want? Make it quick.', 'You lost? These woods aren\'t kind to the lost.', 'Keep your hands where I can see them.'], sd));
      else if (op < -40) lines.push(pick([`You. I know what you did. Get away from me.`, `I've heard about you, ${name}. Don't come closer.`, 'Murderer. The guards will hear of this.'], sd));
      else if (op < -10) lines.push(pick(['…Yes?', 'Hm. I\'ve heard things about you.', 'What is it.'], sd));
      else if (op > 50) lines.push(pick([`${name}! The one everyone's talking about. Come, sit.`, `It's an honour, ${name}. Truly.`, `${name}! I hoped I'd see you again.`], sd));
      else if (op > 15) lines.push(pick([`Ah, ${name}. Good to see you.`, `${name}, well met.`, 'Hello again, friend.'], sd));
      else lines.push(pick(['Good day.', 'Traveller.', 'Mm? Can I help you?', 'Hello there.'], sd));
      const mood = D.mood(world, npc);
      const s = ECHO.Sim.settlement(world, npc.loc);
      if (mood === 'hungry' && s) lines.push(pick([`Forgive me — there's been no bread in ${s.name} for days.`, `Bread's ${s.prices.food} crowns a loaf. Who can live like that?`, 'My belly\'s been empty since yesterday.'], sd + 1));
      if (mood === 'grieving') { const m = npc.mem.filter(x => x.type === 'grief').slice(-1)[0]; if (m) lines.push(`I… ${m.t.replace(/^lost /, 'lost ')}. It's hard to think of much else.`); }
      if (legendFor) lines.push(pick([`My parents named me for ${legendFor.name}. You've heard of ${legendFor.first}?`, `I carry the name of ${legendFor.name}, ${legendFor.epithet}. I try to live up to it.`], sd + 2));
      return lines.join(' ');
    },

    // Short lines spoken aloud as the player passes by.
    ambient(world, npc, ent) {
      const sd = ECHO.hashStr(npc.id + world.day + Math.floor(world.minute / 30));
      const s = ECHO.Sim.settlement(world, npc.loc);
      const r = (sd % 100) / 100;
      if (npc.prof === 'bandit') {
        const camp = world.camps.find(c => c.id === npc.camp);
        const lead = camp && world.npcs[camp.leader];
        const it = npc.carry && world.items[npc.carry];
        if (it && r < 0.5) return pick([`Look at this blade. Took it off ${it.history.slice(-1)[0] ? 'someone who thought they were a hero' : 'a fool'}.`, 'Finest steel in the Ashfang, this.', 'They say this sword has a story. Now it\'s mine.'], sd);
        if (lead && r < 0.7) return pick([`${lead.first} says we hit the road at dawn.`, `${lead.first}'s in a foul mood again.`, `If ${lead.first} catches you sleeping on watch…`], sd);
        if (camp && camp.loot.food < 10) return pick(['Nothing to eat but roots and rumour.', 'We need a fat caravan. Soon.'], sd);
        return pick(['Quiet night.', 'Pass the skin.', 'Did you hear something?', 'I hate these woods.'], sd);
      }
      if (ent && ent.role === 'traveler' && ent.gear.cart) return pick(['Mind the cart!', 'Long road ahead.', 'Prices are better in the south, they say.'], sd);
      if (npc.sick && r < 0.5) return pick(['*cough* *cough*', 'I can\'t stop shaking…', 'So hot. Why is it so hot?'], sd);
      if (npc.journey && r < 0.5) { const jl = D.journeyLine(world, npc); if (jl) return jl.split('. ')[0] + '.'; }
      if (r > 0.72) { const gl = ECHO.Minds.goalLine(world, npc, sd); if (gl) return gl; }
      if (r > 0.6 && r <= 0.72) { const gs = ECHO.Minds.gossipAbout(world, npc, sd); if (gs) return gs; }
      if (npc.mind && npc.mind.v && npc.mind.v.safety < 0.45 && r > 0.6) return pick([`Have you heard? ${U.cap(npc.mind.v.threat || 'something')}…`, 'Bar the doors tonight.', `Nobody's safe with ${npc.mind.v.threat || 'that'} about.`], sd);
      if (s && s.hunger > 0.25 && r < 0.6) return pick([`Bread at ${s.prices.food} crowns…`, 'Another day of thin soup.', 'The children are hungry.', 'When does the grain come?'], sd);
      // Rumours: talk about recent news they have heard.
      if (s && r < 0.45) {
        const news = ECHO.Chronicle.rumorsAt(world, s, 6, 18).filter(e => e.imp >= 1);
        if (news.length) return D.gossipLine(world, news[sd % news.length], sd);
      }
      const recentMem = npc.mem.filter(m => world.day - m.d < 20);
      if (recentMem.length && r < 0.7) {
        const m = recentMem[sd % recentMem.length];
        if (m.type === 'trauma') return pick(['I still dream about it.', 'I can\'t stop shaking some days.', 'Never again. Never.'], sd);
        if (m.type === 'joy') return pick(['What a fine day!', 'Things are looking up.', 'Ha! Life is good.'], sd);
        if (m.type === 'grief') return pick(['…', 'I miss them.', 'Why them?'], sd);
      }
      const season = T.dateOf(world.day).season;
      const byProf = {
        farmer: ['These gnawers will be the death of us.', `${season} work never ends.`, 'Rain would be welcome.'],
        smith: ['Hot work today.', 'Good steel takes patience.'],
        merchant: ['Buying and selling, selling and buying.', 'Roads are dangerous lately.'],
        guard: ['Keep the peace.', 'Eyes open.', 'Move along.'],
        child: ['Tag! You\'re it!', 'Look, a beetle!', 'I\'m going to be a knight!'],
        priest: ['May the Flame keep you.', 'Light against the dark.'],
        scholar: ['Fascinating…', 'If only the old tongue made sense.'],
        innkeeper: ['Rooms upstairs. Clean-ish.'],
        hunter: ['The wolves are bolder this year.', 'Tracks everywhere.'],
        elder: ['In my day…', 'My knees know a storm is coming.']
      }[npc.prof];
      return byProf ? pick(byProf, sd) : null;
    },
    gossipLine(world, e, sd) {
      let t = e.text.replace(/\.$/, '');
      if (t.length > 70) t = t.slice(0, 67).replace(/\s+\S*$/, '') + '…';
      // lower-case a plain opening word ("The…", "A…"), never a name
      const plain = /^(The|A|An|By|In|On|At|Some|Work|Two|Three|Four|Several|After|Before|There|Bandits|Wolves|Raiders|Thieves|Fire|Plague|Fever|Word)\b/.test(t);
      return pick(['Did you hear? ', 'They say ', 'Word is, ', 'Heard at the well: '], sd) + (plain ? t.charAt(0).toLowerCase() + t.slice(1) : t);
    },

    // ---- Topics
    news(world, npc) {
      // travellers bring the news of the town they left
      const j = npc.journey && (world.journeys || []).find(x => x.id === npc.journey);
      const s = ECHO.Sim.settlement(world, npc.loc) || (j && ECHO.Sim.settlement(world, j.from));
      if (!s) return { text: 'I don\'t know anything.', learned: [] };
      const pl = ECHO.Game.pl;
      const news = ECHO.Chronicle.rumorsAt(world, s, 8, 30).filter(e => e.imp >= 1 && !(pl && e.char === pl.charId && e.kind === 'player')).slice(0, 6);
      if (!news.length) return { text: 'Nothing much. Quiet times — and I like them quiet.', learned: [] };
      for (const e of news) ECHO.Chronicle.learn(world, e, false);
      const parts = news.slice(0, 4).map(e => {
        const ago = world.day - e.d;
        const when = ago <= 0 ? 'Today' : ago === 1 ? 'Yesterday' : ago < 7 ? `${ago} days ago` : 'A while back';
        return `${when}: ${e.text}`;
      });
      return { text: parts.join('\n\n'), learned: news };
    },
    aboutSelf(world, npc) {
      const age = Math.floor(P().age(world, npc));
      const s = ECHO.Sim.settlement(world, npc.home);
      const bits = [];
      bits.push(`I'm ${npc.first} ${npc.last}, ${P().role(world, npc)}${s ? ' of ' + s.name : ''}. ${age} years old${age > 60 ? ', if you can believe it' : ''}.`);
      const sp = npc.spouse && world.npcs[npc.spouse];
      if (sp) bits.push(`${sp.first} is my ${sp.sex === 'f' ? 'wife' : 'husband'}.`);
      const kids = npc.kids.map(id => world.npcs[id]).filter(k => k && k.status !== 'dead');
      if (kids.length) bits.push(`We have ${kids.length === 1 ? 'a child, ' + kids[0].first : kids.length + ' children — ' + U.listJoin(kids.map(k => k.first))}.`);
      const lostKids = npc.kids.map(id => world.npcs[id]).filter(k => k && k.status === 'dead');
      if (lostKids.length) bits.push(`We lost ${U.listJoin(lostKids.map(k => k.first))}.`);
      const mems = npc.mem.slice().sort((a, b) => b.w - a.w).slice(0, 3);
      for (const m of mems) {
        const ago = world.day - m.d;
        const when = ago < 2 ? 'Just recently I' : ago < 30 ? `Some ${ago} days ago I` : `Back in ${T.fmtShort(m.d)} I`;
        bits.push(`${when} ${m.t}.`);
      }
      const friends = Object.entries(npc.rel).filter(([, v]) => v > 50).map(([id]) => world.npcs[id]).filter(n => n && n.status !== 'dead' && n.id !== npc.spouse);
      const foes = Object.entries(npc.rel).filter(([, v]) => v < -40).map(([id]) => world.npcs[id]).filter(n => n && n.status !== 'dead');
      if (friends.length) bits.push(`${friends[0].first} ${friends[0].last} is a true friend.`);
      if (foes.length) bits.push(`And I can't stand ${foes[0].first} ${foes[0].last}.`);
      if (npc.traits.length) bits.push(`People say I'm ${npc.traits[0]}${npc.traits[1] ? ' and ' + npc.traits[1] : ''}.`);
      return bits.join(' ');
    },
    aboutPlace(world, npc) {
      const s = ECHO.Sim.settlement(world, npc.loc);
      if (!s) return 'This is no place at all.';
      const f = world.factions[s.faction];
      const ruler = s.ruler && world.npcs[s.ruler];
      const bits = [];
      bits.push(`${s.name} answers to ${f.name}${ruler ? `; ${P().fullTitle(world, ruler)} ${s.kind === 'capital' ? 'rules from the keep' : 'keeps order here'}` : ''}.`);
      const region = ECHO.World.regionAt(world, s.x, s.y);
      if (region.eco) {
        if (region.eco.crop < 0.55) bits.push(`The gnawers are eating our fields bare. ${region.eco.crop < 0.3 ? 'There will be no harvest worth the name.' : ''}`);
        else if (region.eco.crop > 0.9) bits.push('The fields are good this year.');
        if (region.eco.wolfDanger > 1.2) bits.push('And the duskwolves… nobody walks alone after dark any more.');
      }
      const lair = world.lairs.find(l => l.villageId === s.id);
      if (lair) {
        const b = lair.boss;
        if (b.alive) bits.push(`Beware the ${b.title.replace('the ', '')} out in ${region.name}. ${b.name}, we call it. ${b.kills ? `It has taken ${b.kills} who went hunting it.` : 'Leave it be.'}`);
        else bits.push(`${b.name} is dead now${b.killedBy ? ', killed by ' + b.killedBy : ''}. ${region.eco && region.eco.crop < 0.6 ? 'Strange — the fields have done worse since.' : ''}`);
      }
      if (s.hunger > 0.2) bits.push(`We are hungry. Food is ${s.prices.food} crowns. ${s.unrest > 60 ? 'People are angry. Something will break.' : ''}`);
      else if (s.prosperity > 65) bits.push('Times are good.');
      const war = Object.keys(f.atWar || {});
      if (war.length) bits.push(`And we are at war with ${world.factions[war[0]].name}.`);
      if (f.tech && f.tech.era > 0) bits.push(`They say this is the ${ECHO.Civ.eraName(world, f.id)} now.`);
      return bits.join(' ');
    },
    aboutLegends(world, npc) {
      if (!world.legends.length) {
        const heroes = P().alive(world).filter(n => n.renown > 30).sort((a, b) => b.renown - a.renown).slice(0, 2);
        if (!heroes.length) return 'Legends? This is a small world. Not many heroes in it.';
        return `The great names of our day? ${U.listJoin(heroes.map(h => P().fullTitle(world, h)))}. Ask anyone.`;
      }
      const l = world.legends[ECHO.hashStr(npc.id) % world.legends.length];
      const op = npc.op[l.charId] || 0;
      const deed = l.deeds.length ? l.deeds[ECHO.hashStr(npc.id + 'd') % l.deeds.length] : null;
      const s = ECHO.Sim.settlement(world, l.homeId);
      let t = `Have you heard of ${l.name}, ${l.epithet}? From ${s ? s.name : 'somewhere'}. Died ${T.fmtShort(l.died)} — ${l.cause}.`;
      if (deed) t += ` They say: "${deed}"`;
      if (op > 20) t += ' A great soul. We still speak of them.';
      if (op < -20) t += ' Good riddance, if you ask me.';
      if (npc.prof === 'bandit') t += ` Ashfang still curse that name around the fire.`;
      return t;
    },
    aboutItem(world, npc, pl) {
      const it = npc.carry && world.items[npc.carry];
      if (!it) return null;
      const fromPlayer = it.history.some(h => h.t.includes(pl.first + ' ' + pl.last));
      const legend = it.legend && ECHO.Legacy.legendOf(world, it.legend);
      if (fromPlayer && !legend) return `This? Recognise it, do you? I took it from you. Finest thing I own. Come and take it back, if you dare.`;
      if (legend) return `This blade belonged to ${legend.name}, ${legend.epithet}. ${it.history.slice(-1)[0] ? 'It came to me — ' + it.history.slice(-1)[0].t + '.' : ''} They say it's lucky.`;
      return `${it.name}. ${it.history.slice(-1)[0] ? U.cap(it.history.slice(-1)[0].t) + '.' : ''}`;
    },
    thanks(world, npc) {
      return pick(['Thank you. Thank you. I thought no one would come.', 'I won\'t forget this. Ever.', 'Gods — get me home.', 'You came. You actually came.'], ECHO.hashStr(npc.id));
    },
    recruitable(world, npc, pl) {
      return (npc.prof === 'wanderer' || npc.prof === 'guard' || npc.prof === 'hunter') && P().age(world, npc) >= 18 && !npc.title && npc.rank < 2 && !pl.companion;
    },
    recruitCost(world, npc) { return 30 + Math.round(npc.skill.fight); }
  };
})();
