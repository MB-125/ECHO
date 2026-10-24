// ECHO — update notices (desktop app).
// Asks the desktop shell whether a newer release is out, shows it on the title
// screen and in the pause menu, and after an update says what changed.
(function () {
  const ECHO = window.ECHO;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // What each version brought, newest first. Shown once after updating.
  const CHANGES = [
    { v: '0.7.8', items: ['Flying: your dragon\'s neck no longer stays stuck turned to one side. Its head now leads into every turn you steer, comes back straight when you fly straight, glances at whatever catches its eye below, looks about it when you let go of the reins, lifts as it climbs and drops as it dives.', 'New warnings on the ground before a blow lands. Instead of flat boxes, each one is a glowing shape lying on the land (following hills and slopes) with a bright rim and a dark inner edge so it stands out on any ground: a charge sweeps out across it from the attacker as the blow winds up, with a bright front showing how close it is; chevrons run the way the blow will travel (rings close in on a circle); it pulses faster and faster as the moment comes; and when the blow lands it flashes and fades. Lunges and sweeps are now rounded lanes instead of rectangles.', 'Your saved game carries on as it was.'] },
    { v: '0.7.7', items: ['Fights feel alive. Every blow lands with a bright flash and a spray of sparks thrown the way you struck, and blows now have weight: what you hit spills what it is made of — blood from flesh, chips from bone, grit from stone, gobbets from slimes, wisps from spirits — which flies, falls, bounces and leaves marks on the ground.', 'Each element hits its own way: fire throws embers and smoke and scorches the ground; frost bursts into shards and cold mist and leaves rime; lightning arcs crackle from the wound; venom splashes green; void and magic implode in a swirl.', 'Heavy blows, dives, quakes and critical hits ring out with a shockwave and a flash of light that lights up everything nearby.', 'Sword swings are now a sweeping arc of light that follows the blade, bright at its leading edge.', 'Fireballs burst into a ball of fire, a rising column of smoke and a shower of bouncing embers, and leave a scorch mark. Fireballs and spells glow and light the ground as they fly; arrows leave a faint trail.', 'Dragons\' and beasts\' blows and breath carry their element: a fire dragon\'s strike sets embers flying and scorches the earth, a frost one leaves the ground white, a venom one leaves slime, and a heavy stomp cracks the ground.', 'When something falls, it collapses in a spray and a puff of dust and leaves a mark where it lay. The marks of a fight fade after a while.', 'Your saved game carries on as it was.'] },
    { v: '0.7.6', items: ['The dragons now have skeletons. Each is one smooth skin over 31 bones: a spine running from snout to tail-tip (three bones in the neck, six in the tail), legs that bend at knee and ankle, and wings that fold at shoulder, elbow and wrist. Nothing moves as a rigid block any more.', 'They move through their whole body: the spine curves into a turn, the neck carries the head in an easy arc and bobs with the stride, the tail sways in a travelling wave and trails behind, legs lift and bend as they step, and the chest rises and falls as it breathes.', 'On the ground the wings fold up properly at elbow and wrist along the back; in the air each wingbeat rolls from shoulder to fingertip, and the legs draw up under the body.', 'Resting, it lies down with its legs folded under it and its tail curled round. Turning its head to look, the whole neck turns, not just the head.', 'A finer build too: deep chest, slim waist and strong haunches, a proper shoulder for each wing, frills of skin behind the jaws, and nostrils.', 'Your saved game carries on as it was.'] },
    { v: '0.7.5', items: ['Your dragon (or great beast) is now a partner with a mind of its own, not a statue that trails behind you.', 'It moves like an animal: it turns in arcs, gathers speed and eases to a stop, matches your pace — ambling, trotting, loping to catch up — and a dragon flies after you over any distance and comes down beside you. It looks at what catches its eye: you, the way you are going, anything moving nearby.', 'When you stop it finds itself things to do: it settles beside you and keeps watch, wanders off to sniff at something, stretches its wings with a yawn, lies down to rest if you linger (sooner at night), or — a dragon — takes a turn round the sky above you before landing again.', 'It gets hungry: when it is, it hunts the deer and hares nearby, drops on them or runs them down, and eats its kill.', 'In a fight it thinks: it goes first for whatever is hurting you, then for what you are fighting; it roars and fights harder when you are badly hurt; a dragon takes to the air against a crowd (or a foe it cannot reach) and strafes it with breath, rains fire or dives; badly hurt itself, it pulls back out of reach to recover, then comes back in. After a win it may roar.', 'It greets you when it comes and when you come back to it, head low. Stroke its neck (E) for a moment together.', 'A bond grows between you — riding, fighting and time together, a hand on its neck. The closer it is, the nearer it keeps and the harder it guards you. The Animals page (U) shows its bond, whether it is hungry, and what it is doing.', 'On the wing with you it has a will too: it looks at what is below, roars at another dragon, and if you let go of the reins it flies on by itself in long lazy circles.', 'Your saved game carries on as it was.'] },
    { v: '0.7.4', items: ['Flying on a dragon is all new. Mounting (V) is a take-off: the dragon crouches, springs, and climbs on great wingbeats with a burst of dust below.', 'Dragons now fly much higher — about twice as high as before — and you choose your height: Space climbs (up to very high), Ctrl goes lower. It keeps that height over the land and rises early for the hills ahead.', 'Real flight: the dragon has weight. It banks into its turns (tighter when slow, wider when fast) and slides a little through a hard one, climbing costs it speed and diving gives it, and when you let go it glides on with its wings held out instead of stopping dead. Shift is a hard sprint on full wingbeats.', 'You sit astride its back and lean with it — low over its neck at speed. A soft shadow on the ground below shows how high you are, the view opens out with height and speed and leads the way you are flying, and clouds drift past up high. You no longer turn see-through while flying.', 'Coming down (V) is a proper landing: it sheds its speed as it descends, flares with its wings and sets down in a cloud of dust, and you climb off beside it.', 'Your beast keeps out of your way: when it follows you it stays a body\'s length off on the far side of you from the camera, and in a fight it picks a place beside the foe that is not on top of you or between you and the view. If its bulk still comes over you, it turns see-through until it moves.', 'Your saved game carries on as it was.'] },
    { v: '0.7.3', items: ['A clearer world. The ground is no longer soft washes of colour: town squares are laid with cobbles and mortar, roads have pebbles, fields have furrows, sand has wind ripples, bare rock is cracked into plates, ruins have flagstones, and grass has little tufts — all drawn crisply, and fading out in the distance so they never shimmer.', 'Roofs have rows of shingles that catch the light, so a town reads sharply from above.', 'A fine dark line now traces where one thing stands in front of another — people, beasts, trees and walls stand out cleanly from the ground behind them (Medium and High).', 'The soft blotchy patches that used to cover the ground are much fainter.', 'Your saved game carries on as it was.'] },
    { v: '0.7.2', items: ['A sharper picture. The world is now drawn at your screen\'s own sharpness: on a laptop at 125–150% or a 4K monitor it used to be drawn at a lower resolution and stretched, which is what made it look soft. Medium draws up to 1.5 pixels per screen pixel, High up to 2, and Low no longer draws below your screen\'s resolution.', 'Names, labels, signs and speech over people\'s heads are always drawn at full sharpness, whatever the quality.', 'A sharpening pass makes edges crisp (without bright or dark rims), and stronger if the game has had to lower its resolution to keep up.', 'Crisper shadows (twice the detail on Medium and High), a tighter glow round lights, and almost no film grain.', 'When the game has to work less to stay smooth it now gives up ambient occlusion and glow first, and lowers the resolution only last — and never below one pixel per screen pixel.', 'The dragons are no longer boxy. Every dragon has a new body, made in Blender as one smooth form along its spine: a long curved neck and tail with a coloured belly, a horned head with brows, glowing eyes, teeth and a jaw that opens, clawed legs, spines down its back in its own colour, a spade at the tail tip, and real wings — skin stretched between long finger bones, scalloped at the edge. On the ground the wings fold back along the body; in the air and when it roars they open wide.', 'The great serpents (Mawtide, Grimmaw) are rebuilt the same way: smooth coils tapering to a pointed tail, a fin down the back, and a horned dragon\'s head.', 'Your saved game carries on as it was.'] },
    { v: '0.7.1', items: ['Smooth at speed: galloping, and above all flying on a dragon, no longer stutters or hitches.', 'Only the land the camera can actually see is drawn now (it used to draw everything around you, out of sight too), and the trees, crops and stones further off use plainer far versions — about a quarter of the triangles of 0.7.0, with the look up close unchanged. Fields of crops in particular were far heavier than they needed to be.', 'The land ahead of you is built before you get there, a few milliseconds a frame, and what you have just passed is kept a while; towns, hidden places and people coming into sight are put together over several frames instead of all in one.', 'No more pauses the first time something new appears (a dragon fading in, a spell, a shrine): every kind of shader is now built in the background when the world loads, and kept.', 'The route planner no longer re-plans the whole way every few seconds while you fly (the line just points the way), and plans faster on the ground.', 'Shadows no longer crawl and shimmer as you move, and your own shadow keeps up with you at speed. The sun\'s shadow is no longer switched off at night (that rebuilt every shader in the world at dusk and dawn — a long stall).', 'The camera keeps up better at speed, and doesn\'t bob over every hill passing under a dragon.', 'Automatic resolution now judges by the typical frame, not by a few slow ones while new land streams in, and changes far less often (each change was itself a small stall).', 'Your saved game carries on as it was.'] },
    { v: '0.7.0', items: ['A new look. Every model has been rebuilt in Blender with bevelled edges, rounded forms and smooth shading — trees, people, beasts, buildings and dragons are no longer faceted.', 'The picture is finished like a modern engine\'s: lanterns, fires, spells and windows at night glow (bloom); ambient occlusion grounds everything; a filmic tone curve and colour grading follow the hour and the weather (warm dusk, cool night, grey storms, amber interiors); the sky lights the world, and metal catches it; ground, stone and walls have their own grain instead of flat colour.', 'It keeps the game smooth: when frames start to slow, it lowers its resolution a step at a time (and then drops the costliest effects), and climbs back when it can. Quality in the Esc menu: Low (fastest), Medium (shadows, glow, smooth edges, grading), High (plus ambient occlusion and finer detail).'] },
    { v: '0.6.0', items: ['Everything in the world is more aware now. Enemies, townsfolk, wolves, your companions, your bound beasts and the Guard read the ground: every marked blow, titan art, poison pool or rolling boulder is a place not to be, and those who see it coming step out of it — your companions and beasts do it for you.', 'They watch what flies at them: shields come up to meet arrows, and the quick step aside from arrows and fireballs (the clever ones dodge some of yours; the mindless never do). A quick enemy may step back out of a heavy blow you hold in its face.', 'Enemies choose their target — whoever hurt them most, whoever is nearly down, the healer first — and stick with it. Archers aim where you are going, and chasers cut you off.', 'Badly hurt with friends at hand, an enemy falls back behind them before coming again. And the ones with voices call out what they mean to do: "Move!", "Get the healer!", "Cover me!"', 'How much each notices depends on what it is: a slime almost nothing, a sergeant most things, a warden of the Guard everything. Titans fight their own way.'] },
    { v: '0.5.5', items: ['Levels, gear and power now agree with each other everywhere. Danger labels (Easy, Hard, Deadly, Run) and experience measure the gap in steps of a tenth of your level, so a foe forty levels above you at level 300 reads as Deadly — as four levels does at level 10 — instead of everything a few levels apart reading Run.', 'Fire (Q) and the staff\'s bolt now grow with your level as a weapon does: they used to fall far behind your sword (at level 150 a flame took 40 casts to kill what a blade killed in two).', 'Companions past level 12 grow on the same curve as you: they no longer fall behind and die in one or two blows at high levels.', 'Smith\'s work is made for you: forged weapons and crafted armour (Dragonscale mail, the Beastlord\'s mantle…) match your level and the quality of their parts, honing adds a twentieth of the piece, and star-iron adds a twelfth. Story and ambition rewards (Crownbreaker, the Champion\'s Blade) match your level when you earn them.', 'Titans keep their place against you at every level (Gorehorn two steps above you, Nyxathar twenty-one), and a bound beast fights two steps above your own level.'] },
    { v: '0.5.4', items: ['Y now switches between your animals: each press calls the next one — your horse, then each of your beasts in turn — and sends the one with you away. (A beast that is resting is skipped.) U still opens the Animals page.'] },
    { v: '0.5.3', items: ['When you call a beast, your horse goes home (if you are riding, you step down first) and stays away until you whistle for it with V — it comes back from wherever it went.', 'A new Animals page (U, or Journal → Animals) shows every animal under your control: your beasts with their life, level, where they are, what they can do for you and buttons to call, send away or set them free; your horse with its trust, wind and whereabouts, and buttons to whistle for it or send it home; and your dog. Your character page now points to it.'] },
    { v: '0.5.2', items: ['The dragons and great beasts are far stronger now, and never beneath you: each one\'s level rises with yours (from a few levels above you up to some thirty), with more life and harder blows.', 'Every titan has arts of its own — two or three each, plus a nature of its own, like Gorehorn\'s Ironhide (strike it from behind), Rimefang\'s ice armour (fire breaks it) or Solgrim\'s Rebirth. Thirty arts in all: rings of ice with one way out, blizzards that chase you, poison clouds with a few safe circles, lightning that follows you, sweeping sunbeams, rifts that drag you in, boulders rolling from every side, burrowing serpents that burst up under you, and more.', 'Fights have three phases: enraged at two-thirds of its life (quicker, new arts), and desperate at one-third, when it unleashes its greatest art — Meteor Storm, Absolute Zero, Plague Cloud, Skybreak, Supernova, The End of Days, Earthsplitter, Tempest, Tidal Venom, Cataclysm. The name of each art appears as it begins, and the ground shows where it will strike.', 'Your bound beasts use some of their arts for you.'] },
    { v: '0.5.1', items: ['ECHO is now 3D only. The classic 2D view has been removed, along with its switch in the Esc menu; the Quality setting is always there for slower machines.', 'The person you talk to is shown in a portrait drawn from their own 3D model, in their own clothes, hair and gear.', 'If a computer or browser can\'t give the game 3D graphics, it now says so plainly instead of starting. Your worlds and progress are untouched.'] },
    { v: '0.5.0', items: ['Dragons and great beasts now live in the open world: ten titans, each one of a kind, from Gorehorn (level 26) to Nyxathar the End of Days (level 1400). Six are dragons that fly — fire, frost, venom, lightning, sunfire and void — and four are great beasts that walk. Each has its own range with its young, its prey and its roost; dragons circle by day and sleep at night. They are on the map and in the guide (J).', 'They fight like nothing else: dragons take to the air out of reach of your blade and strafe, rain their element and dive on you, then land and fight with jaws, tail and breath. Every attack is marked on the ground first. The greatest of them raid and burn towns when no one stands against them.', 'Beat one down and bind it (E): you can keep four. A bound beast follows you and fights for you (Y calls it or sends it away; your character page lists them). Stand by a bound dragon and press V to fly — WASD to steer, Shift to fly fast, V to land. Your progress is untouched; the titans simply appear in your world.'] },
    { v: '0.4.2', items: ['No more sudden deaths out of nowhere: a single blow can no longer take you from a healthy life bar to the ground. You are left standing on a sliver of life for a moment (once every little while), so you can get away, eat or use herbs.', 'You see what each hit takes: a pale piece of your life bar drains away after it. Below a third of your life the bar beats and the edges of the screen go red.', 'When you fall, you are shown what brought you down — who hit you, with what, and how much of your life each took.'] },
    { v: '0.4.1', items: ['Lock-on (R) no longer picks your trainer or any warden of the National Guard, and your blows, arrows and fire pass them by — they only ever pick out the beasts.'] },
    { v: '0.4.0', items: ['Three gates now stand alone in the wild, marked on every map and visible from far off. Their menace kills anyone below level 150 (rings on the ground show where it hurts and where it kills; below 150 the navigation goes round them).', 'Beyond each gate is a world of its own: the Ashen Expanse, the Sunken Choir and the Rotwood. Their beasts run from level 150 at the door to 1500 at the heart, where a sovereign waits. Each kind of beast fights in its own way, and they hunt each other, growing stronger on what they kill.', 'The National Guard holds the gates: six wardens, each strong enough for level 1500, each with arts of their own. At level 150, talk to one and take the oath. Your warden then takes you through, leads you to beasts your size, keeps you alive and teaches you. Townsfolk who reach 150 can join too.', 'Levels now go up to 1500, with eight new ranks past the Undying.'] },
    { v: '0.3.8', items: ['Where to? (N): everything you could head for in one list (promises, jobs, cases, the story, dungeons your size, your marks). Pick one and a golden trail on the ground leads you there by the best way: roads and bridges, round lakes, cliffs and walls, never into a dead end. The top line tells you the next stretch ("follow the road south", "through the woods") and the distance left, and the route shows on your maps. New promises and jobs are followed for you if nothing else is.', 'A calmer screen: repeated notices are folded together, routine ones wait behind important ones, banners only greet you on first visits or after long absences, town news arrives as one line, the weather is mentioned once a day, and only the people who matter speak aloud at once.'] },
    { v: '0.3.7', items: ['Smarter pathfinding for every creature and person: they look ahead and steer round trunks, rocks and walls, plan routes only through gaps their body actually fits, notice when they stop getting closer and plan a way round, and avoid the spot that stopped them. Wolves chasing through woods now get through about four times as often; big creatures like trolls find their way through towns and rocky ground.'] },
    { v: '0.3.6', items: ['Send word to your old companions: on your character page (K), everyone who once rode with you can be reached by a runner (3 crowns) — ask them to come back and fight beside you (they ride to find you), to send supplies, or just send your regards. Their answers arrive as letters.'] },
    { v: '0.3.5', items: ['Anyone carrying a weapon now fights back when attacked — a farmer you armed will stand and cut down the wolves instead of running.', 'Gear counts properly for townsfolk: their blows come from their weapon\'s own damage (shaped by their skill), as yours do, and their strength updates as soon as they put something new on.'] },
    { v: '0.3.4', items: ['People now look like what they wear, the same way you do: the colour and glow of their blade, axe, spear, staff or bow, and their armour\'s colours, helm, shoulder plates and crest — in 3D and in 2D.', 'Talking to someone shows the gear they wear, with pictures, names and stats, and their level.'] },
    { v: '0.3.3', items: ['Give gear you don\'t use to anyone, free: "Give away…" on any spare piece in your character page (K), or tell someone "I have gear I don\'t use — take it". ★ marks who would wear it; anyone else passes it to whoever in town needs it.', 'In a town, "Share all spare pieces" hands everything you don\'t use to the people who need it most. People remember, and word of it spreads.'] },
    { v: '0.3.2', items: ['Updates now arrive completely by themselves: each new version is published automatically, downloaded in the background, and switched to on the title screen.', 'Fixed a rare crash when a great beast roared before the sound had started.'] },
    { v: '0.3.1', items: ['Guards, soldiers, outlaws and townsfolk now size up a foe before they fight: its level, gear, health and healing against their own and their friends\'. Good odds, they fight; poor odds alone, they shout for help, hold back out of reach and go in together once enough have gathered; hopeless, guards keep their distance and send for more while outlaws and townsfolk run.', 'Seasoned or brave townsfolk answer a call for help and fight beside the guards when together they stand a chance.'] },
    { v: '0.3.0', items: ['Townsfolk go delving too: guards, hunters and the bold go down into dungeons and caves (alone or with friends), come back stronger and wear the weapons and armour they find. Some don\'t come back.', 'Everyone has a level now, and seasoned delvers hit harder and last longer. Ask anyone "How strong are you these days?" — and give them gear from your pack.', 'The guide (J) lists the townsfolk who delve, with their level and gear.'] },
    { v: '0.2.9', items: ['No more dungeon floors walled off by chests, stairs, boulders or pillars: every room, iron door, stair and chest can now be reached.'] },
    { v: '0.2.8', items: ['Your hero no longer dies for good: a fall costs a few days and some coin, never your level or gear. (Legacy, where heroes die for good, is now a choice in the Esc menu.)'] },
    { v: '0.2.7', items: ['Updates now install themselves: the app downloads each new version in the background and plays it the next time you open it, or at once with Restart now.'] },
    { v: '0.2.6', items: ['When you fall to beasts or monsters, you wake in a town with a dungeon of your level close by, and can head straight for it.'] },
    { v: '0.2.5', items: ['Horses no longer get stuck against trees, rocks or the water\'s edge: a wedged horse works itself free, steers round trunks and boulders, and picks its way through thick woods at a walk.', 'When you mount or whistle, your horse stands somewhere with room to move.'] },
    { v: '0.2.4', items: ['The title screen shows your version in a clear badge: green when you have the newest, gold with a download button when a new one is out.', 'If an update is out, you are told each time you enter a world.'] },
    { v: '0.2.3', items: ['The app tells you when a new version is out, with a button to download it, and shows what changed after you update.'] },
    { v: '0.2.2', items: ['Every town of the old island has an easy starter cave nearby (Lv 1–3), shown on the map from the start.', 'The guide (J) lists dungeons for your level: the best floor for you in each, and a Guide me there button.'] },
    { v: '0.2.1', items: ['Text no longer piles up over the HUD in smaller windows.'] },
    { v: '0.2.0', items: ['Choose any floor you have reached at a dungeon door.', 'Saves are kept with a backup copy; Export and Import world work in the desktop app.'] }
  ];

  const cmp = (a, b) => {
    const pa = String(a || '0').split('.').map(n => parseInt(n, 10) || 0), pb = String(b || '0').split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d > 0 ? 1 : -1; }
    return 0;
  };
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  };

  const Up = ECHO.Updates = {
    CHANGES, cmp,
    state: 'idle', // idle | checking | current | available | error
    current: null, info: null, news: null, toasted: false,

    native() { return window.echoNative && window.echoNative.checkUpdate ? window.echoNative : null; },

    async init() {
      const N = Up.native();
      if (!N) return;
      try { Up.current = await N.version(); } catch (e) { return; }
      const last = store.get('echo.lastVersion');
      if (last && cmp(Up.current, last) > 0) Up.news = CHANGES.filter(c => cmp(c.v, last) > 0 && cmp(c.v, Up.current) <= 0);
      else if (!last) {
        // first run of a version that knows about this: if worlds exist, this is an update
        try { const metas = await ECHO.Save.list(); if (metas.length) Up.news = CHANGES.filter(c => c.v === Up.current); } catch (e) { /* ignore */ }
      }
      if (Up.news && !Up.news.length) Up.news = null;
      if (!Up.news) store.set('echo.lastVersion', Up.current);
      Up.mount();
      Up.check();
      setInterval(() => Up.check(), 3600 * 1000);
      // tell a player who is in a world, once per world entered
      let shownFor = null;
      setInterval(() => {
        const g = ECHO.Game, UI = ECHO.UI;
        if ((Up.state !== 'available' && Up.state !== 'ready') || !g || !g.world || !UI || !UI.toast || UI.paused()) return;
        const key = g.world.id + '|' + Up.info.latest + '|' + Up.state;
        if (shownFor === key) return;
        shownFor = key;
        UI.toast(Up.state === 'ready'
          ? `⬆ ECHO ${Up.info.latest} has downloaded. It switches over when you go back to the title screen or next open the game (or now: Esc → Restart now). Your world carries over.`
          : `⬆ ECHO ${Up.info.latest} is out (you have ${Up.current}). Press Esc to download it; your worlds carry over.`, 'legend', 10);
      }, 4000);
    },

    async check() {
      const N = Up.native();
      if (!N || Up.state === 'checking') return;
      Up.state = 'checking'; Up.mount();
      let r = null;
      try { r = await N.checkUpdate(); } catch (e) { r = { error: String(e) }; }
      if (!r || r.error || !r.latest) Up.state = 'error';
      else {
        Up.info = r;
        const newer = cmp(r.latest, Up.current || r.current) > 0;
        // a release still being built (its game file not attached yet): wait and look again
        const fresh = r.date && Date.now() - Date.parse(r.date) < 40 * 60 * 1000;
        Up.state = !newer ? 'current' : r.ready === r.latest ? 'ready' : (r.why === 'no game file' && fresh) ? 'pending' : 'available';
        if (Up.state === 'pending') { clearTimeout(Up._again); Up._again = setTimeout(() => Up.check(), 3 * 60 * 1000); }
      }
      Up.mount();
      Up.autoApply();
    },
    // On the title screen (no world open), a downloaded update switches over by itself.
    autoApply() {
      const N = Up.native();
      if (Up.state !== 'ready' || !N || !N.restart || Up._applying) return;
      if (ECHO.Game && ECHO.Game.world) return;          // never in the middle of play
      if (!document.querySelector('#screen:not(.hidden) .upd-slot')) return;   // only on the title screen
      Up._applying = true;
      Up.mount();
      setTimeout(() => { if (ECHO.Game && ECHO.Game.world) { Up._applying = false; Up.mount(); return; } N.restart(); }, 2500);
    },

    // The little card on the title screen and in the pause menu.
    html() {
      if (!Up.native()) return '';
      const v = Up.current ? 'v' + esc(Up.current) : '';
      let out = '';
      if (Up.news) out += `<div class="upd-card upd-news"><h4>Updated to ${v}</h4><ul>${Up.news.map(c => c.items.map(t => `<li>${esc(t)}</li>`).join('')).join('')}</ul><div class="dim">Your worlds and progress are as you left them.</div><div class="row"><button class="small" data-upd="seen">Got it</button></div></div>`;
      if (Up.state === 'ready' && Up._applying) {
        out += `<div class="upd-card upd-new"><h4>⬆ Updating to v${esc(Up.info.latest)}…</h4><div class="dim">One moment — ECHO restarts on the new version. Your worlds carry over.</div></div>`;
      } else if (Up.state === 'pending') {
        out += `<div class="upd-badge"><b>ECHO ${v}</b> <span>v${esc(Up.info.latest)} is on its way — it will install itself in a few minutes</span></div>`;
      } else if (Up.state === 'ready') {
        out += `<div class="upd-card upd-new"><h4>⬆ ECHO v${esc(Up.info.latest)} is ready</h4><div class="dim">It has downloaded by itself and switches over when you return to the title screen or next open ECHO. Your worlds and progress carry over.</div><div class="row"><button class="small primary" data-upd="restart">Restart now</button></div></div>`;
      } else if (Up.state === 'available') {
        const i = Up.info;
        out += `<div class="upd-card upd-new"><h4>⬆ A new version is out: v${esc(i.latest)}</h4><div class="dim">You have ${v}. Download it and install over this one; your worlds carry over.</div><div class="row">${i.download ? `<button class="small primary" data-upd="download">Download ${esc(i.file || '')}</button>` : ''}<button class="small" data-upd="page">${i.download ? 'Release page' : 'Download page'}</button></div></div>`;
      } else {
        const st = Up.state, s = { idle: 'checking for updates…', checking: 'checking for updates (and fetching any new version)…', current: '✓ up to date — this is the newest version', error: 'could not reach GitHub to check for updates' }[st] || '';
        out += `<div class="upd-badge ${st === 'current' ? 'ok' : st === 'error' ? 'err' : ''}"><b>ECHO ${v}</b> <span>${s}</span>${st === 'error' || st === 'current' ? ' <button class="small linkish" data-upd="check">Check again</button>' : ''}</div>`;
      }
      return out;
    },

    mount() {
      document.querySelectorAll('.upd-slot').forEach(el => { el.innerHTML = Up.html(); Up.bind(el); });
      if (Up.state === 'ready' && !Up._applying) setTimeout(() => Up.autoApply(), 0);
    },

    bind(root) {
      root.querySelectorAll('[data-upd]').forEach(b => b.addEventListener('click', () => {
        const a = b.dataset.upd, N = Up.native();
        if (a === 'download' && Up.info && Up.info.download) N.openLink(Up.info.download);
        else if (a === 'page' && Up.info) N.openLink(Up.info.page);
        else if (a === 'check') Up.check();
        else if (a === 'restart') {
          b.disabled = true; b.textContent = 'Saving…';
          (async () => { try { if (ECHO.Game && ECHO.Game.world) await ECHO.Game.save(); } catch (e) { console.error(e); } if (N.restart) N.restart(); })();
        }
        else if (a === 'seen') { Up.news = null; store.set('echo.lastVersion', Up.current); Up.mount(); }
      }));
    }
  };
})();
