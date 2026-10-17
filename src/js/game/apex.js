// The titans in real time: dragons in the sky over their ranges, great beasts
// on the ground, their young about them and their prey around them.
//
// A dragon circles its range by day and sleeps on its roost by night; it
// hunts the deer and wolves below. Come onto its range and it warns you, then
// fights — on the ground with jaws and tail and breath, and from the air with
// strafing fire, rains of its element and a dive that shakes the ground.
// Beaten down, a titan lies in the dust: bind it (you can keep four), or end
// it. Bound, it follows you and fights beside you; a dragon carries you
// through the sky.
(function () {
  const { U } = ECHO;
  const UI = () => ECHO.UI;
  const Ti = () => ECHO.Titans;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // what each element does when it lands
  const ELEM = {
    fire: { col: '#ff7a2a', tele: 'rgba(255,120,40,0.34)', type: 'fire', word: 'fire' },
    frost: { col: '#bfe8ff', tele: 'rgba(170,220,255,0.34)', type: 'magic', word: 'frost' },
    venom: { col: '#9fe05a', tele: 'rgba(150,220,80,0.34)', type: 'magic', word: 'venom' },
    storm: { col: '#bfe0ff', tele: 'rgba(150,180,255,0.36)', type: 'magic', word: 'lightning' },
    sun: { col: '#fff0a0', tele: 'rgba(255,240,150,0.36)', type: 'fire', word: 'sunfire' },
    void: { col: '#a87aff', tele: 'rgba(150,90,255,0.36)', type: 'magic', word: 'void' },
    earth: { col: '#c8a878', tele: 'rgba(200,170,120,0.34)', type: 'melee', word: 'stone' }
  };
  const ARMOR = {
    fire: { fire: 0.7, melee: 0.1, ranged: 0.15 }, frost: { fire: -0.3, melee: 0.15, ranged: 0.1 }, venom: { fire: -0.15, melee: 0.1, ranged: 0.2 },
    storm: { ranged: 0.35, melee: 0.05 }, sun: { fire: 0.8, melee: 0.15, ranged: 0.15 }, void: { melee: 0.2, ranged: 0.3, fire: 0.2 }, earth: { melee: 0.3, ranged: 0.25, fire: -0.1 }
  };
  // the young and the hangers-on of a titan's range
  const BROOD = {
    frosthound: { name: 'Frost hound', hp: 60, dmg: 11, speed: 4.6, reach: 1.25, wind: 0.34, cd: 1.0, tier: 4, shape: 'hound', scale: 1.05, col: '#dfe8f0', em: '#8fd8ff', f2d: 'grayscale(1) brightness(1.7)', ab: { pack: true }, resist: { fire: -0.3 }, loot: [['winterpelt', 0.05, 1, 1]], gold: [4, 14], desc: 'White hounds that run with the frost dragon.', weak: 'Fire.' },
    stormwisp: { name: 'Storm wisp', hp: 50, dmg: 10, speed: 3.6, reach: 1.2, wind: 0.5, cd: 1.6, tier: 4, shape: 'horror', scale: 0.6, col: '#1a2440', em: '#bfe0ff', f2d: 'hue-rotate(200deg) brightness(1.2)', ab: { bolt: { color: '#bfe0ff', dmg: 1.2, cd: 3, type: 'magic' } }, resist: { ranged: 0.3 }, loot: [['ecto', 0.4, 1, 1]], gold: [3, 10], desc: 'A knot of lightning that hangs in the air where storms have been.', weak: 'Close in; it is frail.' },
    sunling: { name: 'Sunling', hp: 70, dmg: 12, speed: 3.8, reach: 1.4, wind: 0.5, cd: 1.3, tier: 4, shape: 'drake', scale: 0.4, col: '#c8962a', belly: '#fff0a0', em: '#ffd84a', f2d: 'sepia(1) saturate(3) brightness(1.2)', ab: { bolt: { color: '#ffe08a', dmg: 1.2, cd: 3.4, type: 'fire' } }, resist: { fire: 0.7 }, loot: [['dragonscale', 0.1, 1, 1]], gold: [6, 18], desc: 'A golden whelp. It spits sunlight.', weak: 'Steel.' },
    voidshade: { name: 'Voidshade', hp: 62, dmg: 13, speed: 3.4, reach: 1.3, wind: 0.5, cd: 1.4, tier: 4, ab: { teleport: { cd: 6 }, drain: 0.4 }, resist: { melee: 0.3, ranged: 0.4 }, vis: { cloth: '#14101c', cloth2: '#0a0810', skin: '#2a2040', hair: '#14101c', show: ['robe', 'hood'], em: '#3a1a6a', opacity: 0.6, f2d: 'brightness(0.4) hue-rotate(250deg)' }, loot: [['ecto', 0.6, 1, 2]], gold: [5, 15], desc: 'A shadow left behind where the void dragon has fed.', weak: 'Fire, and light.' },
    tuskling: { name: 'Tuskling', hp: 55, dmg: 10, speed: 4.2, reach: 1.2, wind: 0.4, cd: 1.1, tier: 3, shape: 'hound', scale: 0.95, col: '#6a4a32', em: '#2a1a10', f2d: 'sepia(0.8) brightness(0.8)', ab: { pack: true, charge: { cd: 9 } }, loot: [['hide', 0.5, 1, 1]], gold: [1, 6], desc: 'The young of the great horned beast. They charge as their parent does.', weak: 'Sidestep, then strike.' }
  };
  // what they do: ground and air
  const ATK = {
    bite: { shape: 'cone', len: 3, arc: 1.0, wind: 0.55, mult: 1.25, cd: 1.3 },
    sweep: { shape: 'cone', len: 3.6, arc: 2.6, wind: 0.7, mult: 0.95, cd: 1.4 },
    stomp: { shape: 'circle', radius: 3, wind: 0.75, mult: 1.0, cd: 1.6, quake: true },
    breath: { shape: 'line', len: 7, width: 1.8, wind: 0.85, mult: 0.9, cd: 1.8, elem: true },
    gore: { shape: 'line', len: 6, width: 1.5, wind: 0.6, mult: 1.35, cd: 1.8, charge: true },
    spit: { shape: 'rain', n: 3, radius: 1.5, spread: 2.5, wind: 0.9, mult: 0.8, cd: 2, elem: true },
    quake: { shape: 'rain', n: 5, radius: 1.8, spread: 4, wind: 1.1, mult: 0.9, cd: 2.4 },
    // from the air
    strafe: { shape: 'line', len: 13, width: 2.2, wind: 1.05, mult: 1.0, cd: 2.4, elem: true, air: true, through: true },
    rain: { shape: 'rain', n: 6, radius: 1.7, spread: 5, wind: 1.2, mult: 0.85, cd: 2.4, elem: true, air: true },
    dive: { shape: 'circle', radius: 2.8, wind: 1.15, mult: 1.6, cd: 1.6, air: true, dive: true, atTarget: true }
  };
  const GROUND = { drake: ['bite', 'sweep', 'breath', 'stomp'], stag: ['gore', 'stomp', 'sweep', 'bite'], wyrm: ['bite', 'sweep', 'spit', 'quake'] };

  // ------------------------------------------------------------------ signatures
  // What makes each titan itself: two or three arts of its own, a passive,
  // and a last, terrible art it turns to when it is losing (phase III).
  // Each art: k, name, ph (from which phase), cd (seconds), and use(game, e, t, tg).
  const R0 = () => Math.random();
  const ang = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  const SIG = {
    emberwing: {
      passive: 'Scorching hide: from its second phase, the air around it burns',
      arts: [
        { k: 'firewall', name: 'Wall of Fire', ph: 1, cd: 12, tamed: true, use(g, e, t, tg) {
          const a = ang(e, tg); A.busy(e, 1.3);
          A.line(g, e, e.x, e.y, a, 11, 2, 0.85, 1.1, { then: () => { for (let s = 2; s < 11; s += 2.2) A.zone(g, e, { x: e.x + Math.cos(a) * s, y: e.y + Math.sin(a) * s, r: 1.5, life: 7, mult: 0.45, burn: true }); } });
        } },
        { k: 'nova', name: 'Inferno Nova', ph: 2, cd: 17, use(g, e, t, tg) {
          A.busy(e, 2.3); e.altGoal = 0;
          A.blast(g, e, e.x, e.y, 6.5, 1.9, 2.1, { knock: 0.9, then: (x, y) => { for (let i = 0; i < 9; i++) { const a = i / 9 * 6.28; A.zone(g, e, { x: x + Math.cos(a) * 4.6, y: y + Math.sin(a) * 4.6, r: 1.3, life: 6, mult: 0.4, burn: true }); } } });
        } }
      ],
      ult: { k: 'meteors', name: 'Meteor Storm', use(g, e, t, tg) {
        e.altGoal = 6; A.busy(e, 5.4);
        for (let i = 0; i < 15; i++) A.after(g, e, 0.7 + i * 0.3, () => { const x = tg.x + (R0() - 0.5) * 5, y = tg.y + (R0() - 0.5) * 5; A.blast(g, e, x, y, 1.9, 0.9, 1.35, { fall: true, then: (x2, y2) => A.zone(g, e, { x: x2, y: y2, r: 1.2, life: 5, mult: 0.3, burn: true }) }); });
      } }
    },
    rimefang: {
      passive: 'Ice armour: from its second phase it shields itself in ice — fire breaks it three times as fast',
      arts: [
        { k: 'prison', name: 'Glacial Prison', ph: 1, cd: 14, use(g, e, t, tg) {
          A.busy(e, 1.6); const cx = tg.x, cy = tg.y, gap = Math.floor(R0() * 12);
          for (let i = 0; i < 12; i++) { if (i === gap || i === (gap + 1) % 12) continue; const a = i / 12 * 6.28; A.blast(g, e, cx + Math.cos(a) * 3.2, cy + Math.sin(a) * 3.2, 1.05, 1.2, 1.2, { col: 'rgba(190,230,255,0.4)' }); }
          A.blast(g, e, cx, cy, 1.9, 1.7, 1.7, { col: 'rgba(190,230,255,0.45)' });
          A.tip(g, 'prison', 'A ring of ice closes round you: get out through the gap before the middle shatters.');
        } },
        { k: 'blizzard', name: 'Blizzard', ph: 2, cd: 19, tamed: true, use(g, e, t, tg) {
          A.busy(e, 1); A.zone(g, e, { x: tg.x, y: tg.y, r: 4.2, life: 9, mult: 0.3, slow: true, follow: tg, speed: 2.1 });
          A.tip(g, 'blizzard', 'A blizzard follows you, slowing and freezing: keep moving, and fight the dragon from its edge.');
        } }
      ],
      ult: { k: 'zero', name: 'Absolute Zero', use(g, e, t, tg) {
        A.busy(e, 3.6); e.altGoal = 0;
        for (let i = 0; i < 3; i++) A.after(g, e, 0.5 + i * 1.0, () => A.wave(g, e, e.x, e.y, 15, 1.6, 1.7, { freeze: true }));
        A.tip(g, 'wave', 'Rings of power rush outward: roll (Space) through each ring just as it reaches you.');
      } },
      phase(g, e, ph) { if (ph >= 2) A.shield(g, e, 0.12, 'fire', 'ice armour'); }
    },
    mirevenom: {
      passive: 'Corrosion: every hit of its venom eats your armour — each makes the next hurt more',
      arts: [
        { k: 'bog', name: 'Toxic Bog', ph: 1, cd: 11, tamed: true, use(g, e, t, tg) {
          A.busy(e, 1.2);
          for (let i = 0; i < 4; i++) { const x = tg.x + (R0() - 0.5) * 6, y = tg.y + (R0() - 0.5) * 6; A.blast(g, e, x, y, 1.4, 0.9 + i * 0.15, 0.9, { then: (x2, y2) => A.zone(g, e, { x: x2, y: y2, r: 2, life: 12, mult: 0.35, poison: true, pool: true }) }); }
        } },
        { k: 'hatch', name: 'The Brood Hatches', ph: 2, cd: 24, use(g, e, t, tg) {
          A.busy(e, 1.2);
          const pools = A.zones.filter(z => z.e === e && z.pool).slice(0, 3);
          for (const z of (pools.length ? pools : [{ x: tg.x + 3, y: tg.y }, { x: tg.x - 3, y: tg.y }])) A.spawnFoe(g, e, t, 'rothound', z.x, z.y, 0.55);
        } }
      ],
      ult: { k: 'plague', name: 'Plague Cloud', use(g, e, t, tg) {
        A.busy(e, 2); const safe = [];
        for (let i = 0; i < 3; i++) { const a = R0() * 6.28, r = 4 + R0() * 4; safe.push({ x: e.x + Math.cos(a) * r, y: e.y + Math.sin(a) * r, r: 1.8 }); }
        for (const s of safe) A.zone(g, e, { x: s.x, y: s.y, r: s.r, life: 10, mult: 0, col: 'rgba(150,255,170,0.42)' });
        A.zone(g, e, { x: e.x, y: e.y, r: 12, life: 10, mult: 0.55, poison: true, safe, delay: 1.2, col: 'rgba(120,200,60,0.22)' });
        A.tip(g, 'plague', 'Poison fills the whole range — stand in the clean green circles.');
      } }
    },
    skyrender: {
      passive: 'Stormborn: arrows are half as good against it, and its lightning leaps from you to your friends',
      arts: [
        { k: 'chain', name: 'Chain Lightning', ph: 1, cd: 9, tamed: true, use(g, e, t, tg) {
          A.busy(e, 1);
          A.blast(g, e, tg.x, tg.y, 1.4, 0.8, 1.3, { bolt: true, then: (x, y) => {
            let from = { x, y }, n = 0;
            for (const o of A.targetsOf(g, e)) { if (n >= 3 || o === tg || U.dist(o.x, o.y, from.x, from.y) > 7) continue; n++; A.blast(g, e, o.x, o.y, 1.2, 0.3 + n * 0.15, 1.0, { bolt: true }); }
          } });
        } },
        { k: 'marks', name: 'Thunder Marks', ph: 1, cd: 15, use(g, e, t, tg) {
          A.busy(e, 1.2);
          for (let i = 0; i < 3; i++) A.mark(g, e, tg, 1.3 + i * 0.8, 1.7, 1.4, { bolt: true });
          A.tip(g, 'marks', 'Marks of lightning follow you, then strike where you stood: keep moving.');
        } },
        { k: 'vortex', name: 'Eye of the Storm', ph: 2, cd: 21, use(g, e, t, tg) {
          A.busy(e, 6); e.altGoal = 0;
          A.zone(g, e, { x: e.x, y: e.y, r: 10, life: 6, mult: 0, pull: 2.6, follow: e, speed: 99, col: 'rgba(150,180,255,0.18)' });
          for (let i = 0; i < 12; i++) A.after(g, e, 0.6 + i * 0.42, () => { const a = R0() * 6.28, r = 4 + R0() * 6; A.blast(g, e, e.x + Math.cos(a) * r, e.y + Math.sin(a) * r, 1.6, 0.7, 1.2, { bolt: true }); });
          A.tip(g, 'vortex', 'The storm pulls you in, and lightning falls at its edges: its heart is the safe place — and the dragon is there.');
        } }
      ],
      ult: { k: 'skybreak', name: 'Skybreak', use(g, e, t, tg) {
        A.busy(e, 6.6); e.altGoal = 9; e.inv = g.time + 5.4;
        for (let i = 0; i < 16; i++) A.after(g, e, 0.8 + i * 0.27, () => A.blast(g, e, tg.x + (R0() - 0.5) * 7, tg.y + (R0() - 0.5) * 7, 1.6, 0.75, 1.3, { bolt: true }));
        A.after(g, e, 5.2, () => { const a = R0() * 6.28; A.line(g, e, tg.x - Math.cos(a) * 12, tg.y - Math.sin(a) * 12, a, 24, 3.4, 1.3, 2.6, { bolt: true }); });
      } }
    },
    solgrim: {
      passive: 'Rebirth: the first time it is beaten down, it rises again in fire',
      arts: [
        { k: 'flare', name: 'Solar Flare', ph: 1, cd: 14, use(g, e, t, tg) {
          A.busy(e, 1.7); e.altGoal = 0;
          ECHO.Combat.telegraph({ x: e.x, y: e.y, cx: e.x, cy: e.y, radius: 2.2, life: 1.4, shape: 'circle', color: 'rgba(255,250,200,0.55)' });
          A.tip(g, 'flare', 'It gathers the sun — turn your back on it (or let go of your lock) or be blinded.');
          A.after(g, e, 1.4, () => {
            g.light(e.x, e.y, 16, 1, '#fff6c0');
            if (tg === g.pe && U.dist(e.x, e.y, tg.x, tg.y) < 22 && Math.abs(U.angleDiff(g.pe.dir || 0, ang(g.pe, e))) < 1.25) {
              g.pl.dazzleUntil = g.time + 4.5; g.hurtFlash(2); A.hurt(g, e, tg, 0.6, { noEffect: true });
              ECHO.Combat.floater(tg.x, tg.y - 1.4, 'BLINDED — your blows go wide', '#fff6c0', true);
            } else if (tg === g.pe) ECHO.Combat.floater(tg.x, tg.y - 1.4, 'you looked away', '#c8c0b0');
          });
        } },
        { k: 'beam', name: 'Sunbeam', ph: 1, cd: 15, tamed: true, use(g, e, t, tg) {
          A.busy(e, 3.6); e.altGoal = 0; const dir = R0() < 0.5 ? 1 : -1, a0 = ang(e, tg) - dir * 1.4;
          ECHO.Combat.telegraph({ x: e.x, y: e.y, angle: a0, len: 13, width: 1.5, life: 0.9, shape: 'line', color: 'rgba(255,240,150,0.45)' });
          A.after(g, e, 0.9, () => A.beam(g, e, a0, dir * 2.8, 13, 1.5, 2.4, 1.1));
          A.tip(g, 'beam', 'A beam of the sun sweeps round it: roll through it, or get in close behind it.');
        } }
      ],
      ult: { k: 'supernova', name: 'Supernova', use(g, e, t, tg) {
        A.busy(e, 4.4); e.altGoal = 0; e.charging = { dmg: 0, need: e.maxHp * 0.07 };
        ECHO.Combat.telegraph({ x: e.x, y: e.y, cx: e.x, cy: e.y, radius: 16, life: 3.2, shape: 'circle', color: 'rgba(255,230,120,0.22)' });
        A.after(g, e, 3.2, () => { e.charging = null; A.wave(g, e, e.x, e.y, 17, 1.1, 3.0, { w: 1.3 }); g.light(e.x, e.y, 20, 1, '#fff0a0'); });
        A.tip(g, 'supernova', 'It is going to burst like a sun. Hit it hard enough now and you break the spell — or run, or roll through the wave.');
      } }
    },
    nyxathar: {
      passive: 'Hunger of the void: its blows drink your life to heal it',
      arts: [
        { k: 'rift', name: 'Void Rift', ph: 1, cd: 12, tamed: true, use(g, e, t, tg) {
          A.busy(e, 1.1);
          for (let i = 0; i < 2; i++) { const a = R0() * 6.28; A.zone(g, e, { x: tg.x + Math.cos(a) * 2.6, y: tg.y + Math.sin(a) * 2.6, r: 2.4, life: 8, mult: 0.45, pull: 1.8, delay: 0.6, col: 'rgba(110,50,200,0.32)' }); }
          A.tip(g, 'rift', 'Rifts in the world drag you in — walk out against the pull.');
        } },
        { k: 'blink', name: 'Shadowstep', ph: 1, cd: 8, use(g, e, t, tg) {
          ECHO.Combat.burst(e.x, e.y, '#3a1a6a', 30, 4, 0.6, 3);
          const sp = ECHO.Ent.freeSpot(g.world, tg.x - Math.cos(tg.dir || 0) * 2.6, tg.y - Math.sin(tg.dir || 0) * 2.6, 3);
          if (sp) { e.x = sp.x; e.y = sp.y; e.alt = 0; e.altGoal = 0; }
          ECHO.Combat.burst(e.x, e.y, '#a87aff', 30, 4, 0.6, 3);
          A.start(g, e, t, 'bite'); e.atk.wind = 0.45;
        } },
        { k: 'clones', name: 'Shades of the End', ph: 2, cd: 26, use(g, e, t, tg) {
          A.busy(e, 1);
          for (let i = 0; i < 2; i++) { const a = R0() * 6.28; A.spawnFoe(g, e, t, 'voidshade', tg.x + Math.cos(a) * 4, tg.y + Math.sin(a) * 4, 0.7, 1.8, `Shade of ${t.name}`); }
        } }
      ],
      ult: { k: 'end', name: 'The End of Days', use(g, e, t, tg) {
        A.busy(e, 6.6); e.altGoal = 6; e.thirstUntil = g.time + 12;
        for (let i = 0; i < 22; i++) A.after(g, e, 0.6 + i * 0.27, () => A.blast(g, e, tg.x + (R0() - 0.5) * 11, tg.y + (R0() - 0.5) * 11, 2.1, 1.0, 1.5, { fall: true }));
      } }
    },
    gorehorn: {
      passive: 'Ironhide: blows to its face glance off — strike it from the side or behind',
      arts: [
        { k: 'rampage', name: 'Rampage', ph: 1, cd: 13, tamed: true, use(g, e, t, tg) {
          A.busy(e, 3.8);
          for (let i = 0; i < 3; i++) A.after(g, e, i * 1.25, () => A.dash(g, e, ang(e, tg), Math.min(14, U.dist(e.x, e.y, tg.x, tg.y) + 4), 0.75, 0.42, 1.5));
          A.tip(g, 'rampage', 'It charges three times, turning each time: sidestep, and strike its flank as it passes.');
        } },
        { k: 'boulders', name: 'Boulder Toss', ph: 2, cd: 14, use(g, e, t, tg) {
          A.busy(e, 1.3); const a = ang(e, tg);
          for (let i = -1; i <= 1; i++) A.after(g, e, 0.6 + (i + 1) * 0.18, () => A.rock(g, e, e.x, e.y, a + i * 0.28, 10, 0.9, 16, 1.4));
        } }
      ],
      ult: { k: 'split', name: 'Earthsplitter', use(g, e, t, tg) {
        A.busy(e, 3.4); const r0 = R0() * 6.28;
        for (let k = 0; k < 2; k++) for (let i = 0; i < 6; i++) { const a = r0 + i / 6 * 6.28 + k * 0.52; A.after(g, e, k * 1.2, () => A.line(g, e, e.x, e.y, a, 14, 1.7, 1.15, 1.8, { quake: true })); }
        A.after(g, e, 2.6, () => A.wave(g, e, e.x, e.y, 10, 1.0, 1.2, {}));
      } }
    },
    thunderhoof: {
      passive: 'Storm antlers: it trails lightning wherever it runs',
      arts: [
        { k: 'gallop', name: 'Storm Gallop', ph: 1, cd: 12, tamed: true, use(g, e, t, tg) {
          A.busy(e, 2.6); const a = ang(e, tg), len = Math.min(14, U.dist(e.x, e.y, tg.x, tg.y) + 5), x0 = e.x, y0 = e.y;
          A.dash(g, e, a, len, 0.7, 0.45, 1.4, { then: () => { for (let s = 1.5; s < len; s += 2) A.blast(g, e, x0 + Math.cos(a) * s, y0 + Math.sin(a) * s, 1.3, 0.8, 1.0, { bolt: true }); } });
        } },
        { k: 'thunder', name: 'Thunderclap', ph: 1, cd: 10, use(g, e, t, tg) { A.busy(e, 1.6); ECHO.Combat.telegraph({ x: e.x, y: e.y, cx: e.x, cy: e.y, radius: 2, life: 0.7, shape: 'circle', color: 'rgba(150,180,255,0.45)' }); A.after(g, e, 0.7, () => A.wave(g, e, e.x, e.y, 10, 1.2, 1.3, { stagger: true })); A.tip(g, 'wave', 'Rings of power rush outward: roll (Space) through each ring just as it reaches you.'); } },
        { k: 'pylons', name: 'Lightning Pylons', ph: 2, cd: 20, use(g, e, t, tg) {
          A.busy(e, 1.2); const P = [];
          for (let i = 0; i < 3; i++) { const a = i / 3 * 6.28 + R0(); P.push({ x: tg.x + Math.cos(a) * 4.5, y: tg.y + Math.sin(a) * 4.5 }); }
          for (const p of P) A.zone(g, e, { x: p.x, y: p.y, r: 0.7, life: 7.5, mult: 0, col: 'rgba(190,220,255,0.7)' });
          for (let k = 0; k < 4; k++) A.after(g, e, 0.6 + k * 1.6, () => { for (let i = 0; i < 3; i++) { const a = P[i], b = P[(i + 1) % 3]; A.line(g, e, a.x, a.y, ang(a, b), U.dist(a.x, a.y, b.x, b.y), 0.9, 0.8, 1.1, { bolt: true }); } });
          A.tip(g, 'pylons', 'Lightning arcs between the pylons: stay off the lines between them.');
        } }
      ],
      ult: { k: 'tempest', name: 'Tempest', use(g, e, t, tg) {
        A.busy(e, 5.6, (g2, e2, dt) => { e2.orb = (e2.orb || 0) + dt * 1.6; A.go(g2, e2, tg.x + Math.cos(e2.orb) * 7, tg.y + Math.sin(e2.orb) * 7, 13, dt); });
        for (let i = 0; i < 16; i++) A.after(g, e, 0.5 + i * 0.32, () => A.blast(g, e, tg.x + (R0() - 0.5) * 4, tg.y + (R0() - 0.5) * 4, 1.6, 0.75, 1.25, { bolt: true }));
      } }
    },
    mawtide: {
      passive: 'Deep serpent: it swims through the earth as if it were water',
      arts: [
        { k: 'burrow', name: 'Burrow', ph: 1, cd: 13, use(g, e, t, tg) { A.burrow(g, e, t, tg, 1.8); } },
        { k: 'geysers', name: 'Acid Geysers', ph: 1, cd: 11, tamed: true, use(g, e, t, tg) {
          A.busy(e, 1.6); const a = ang(e, tg), len = U.dist(e.x, e.y, tg.x, tg.y) + 3;
          for (let i = 0; i < 6; i++) { const s = 2 + i * (len - 2) / 5; A.blast(g, e, e.x + Math.cos(a) * s, e.y + Math.sin(a) * s, 1.5, 0.5 + i * 0.22, 1.2, {}); }
        } },
        { k: 'constrict', name: 'Constrict', ph: 2, cd: 17, use(g, e, t, tg) {
          A.busy(e, 1.2);
          A.line(g, e, e.x, e.y, ang(e, tg), 8, 1.6, 0.75, 0.9, { melee: true, onHit: o => { if (o === g.pe) A.grab(g, e, 2.3); } });
          A.tip(g, 'constrict', 'It lunges to coil round you — dodge to the side as it comes.');
        } }
      ],
      ult: { k: 'tidal', name: 'Tidal Venom', use(g, e, t, tg) {
        A.busy(e, 2.8);
        A.after(g, e, 0.5, () => A.wave(g, e, e.x, e.y, 14, 2.1, 1.6, { w: 1.2 }));
        A.after(g, e, 1.4, () => { for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; A.zone(g, e, { x: e.x + Math.cos(a) * 6, y: e.y + Math.sin(a) * 6, r: 2, life: 9, mult: 0.35, poison: true }); } });
      } }
    },
    grimmaw: {
      passive: 'Mountain hide: from its second phase it grows plates of stone — heavy blows break them',
      arts: [
        { k: 'avalanche', name: 'Avalanche', ph: 1, cd: 13, tamed: true, use(g, e, t, tg) {
          A.busy(e, 1.6);
          for (let i = 0; i < 5; i++) { const a = R0() * 6.28, x = tg.x + Math.cos(a) * 12, y = tg.y + Math.sin(a) * 12, b = ang({ x, y }, tg);
            ECHO.Combat.telegraph({ x, y, angle: b, len: 24, width: 1.8, life: 0.9 + i * 0.25, shape: 'line', color: 'rgba(200,170,120,0.3)' });
            A.after(g, e, 0.9 + i * 0.25, () => A.rock(g, e, x, y, b, 11, 1.0, 24, 1.5)); }
          A.tip(g, 'avalanche', 'Boulders come rolling from every side — watch the lines on the ground.');
        } },
        { k: 'spikes', name: 'Stone Spikes', ph: 1, cd: 11, use(g, e, t, tg) {
          A.busy(e, 1.6); const a = ang(e, tg);
          for (let i = 0; i < 8; i++) A.blast(g, e, e.x + Math.cos(a) * (2 + i * 1.3), e.y + Math.sin(a) * (2 + i * 1.3), 1.3, 0.55 + i * 0.12, 1.3, { quake: true });
        } },
        { k: 'burrow', name: 'Burrow', ph: 2, cd: 16, use(g, e, t, tg) { A.burrow(g, e, t, tg, 2.2); } }
      ],
      ult: { k: 'cataclysm', name: 'Cataclysm', use(g, e, t, tg) {
        A.busy(e, 4);
        for (let i = 0; i < 3; i++) A.after(g, e, 0.4 + i * 0.9, () => A.wave(g, e, e.x, e.y, 13, 1.5, 1.6, {}));
        for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28; A.after(g, e, 1 + i * 0.2, () => A.rock(g, e, tg.x + Math.cos(a) * 12, tg.y + Math.sin(a) * 12, a + Math.PI, 10, 1.0, 24, 1.4)); }
      } },
      phase(g, e, ph) { if (ph >= 2) A.shield(g, e, 0.15, 'heavy', 'stone plates'); }
    }
  };
  // how much sooner they act as they are driven to the wall
  const PHASE_CD = [1, 1, 0.8, 0.62];

  const A = ECHO.Apex = {
    ELEM, BROOD, t: 0, told: {}, SEAT: 1.76,   // how high its back is, per unit of its size
    install() { Object.assign(ECHO.Monsters.DEFS, BROOD); Object.assign(ECHO.Quests.FOES, BROOD); },
    reset(game) { A.t = 0; A.fly = null; A.clearArts(); if (game && game.pl) game.pl.flying = null; },
    // ------------------------------------------------------------ the toolkit
    // Things that outlast a single blow: burning ground, rings that rush
    // outward, beams that sweep, boulders that roll, marks that hunt you.
    zones: [], waves: [], beams: [], rocks: [], marks: [], later: [], dashes: [], held: null,
    SIG, PHASE_CD,
    clearArts() { A.zones = []; A.waves = []; A.beams = []; A.rocks = []; A.marks = []; A.later = []; A.dashes = []; A.held = null; },
    after(g, e, s, fn) { A.later.push({ at: g.time + s, fn, e, cid: e.castId || 0 }); },
    busy(e, s, fn) { e.busyUntil = ECHO.Game.time + s; e.busyFn = fn || null; e.moving = false; },
    tip(g, key, text) { if (A._tamedCast || A.told['tip:' + key]) return; A.told['tip:' + key] = true; UI().toast(text, 'study', 6); },
    shout(e, text, col) { ECHO.Combat.floater(e.x, e.y - 2.6 - Math.max(0, e.alt || 0) - e.tscale, text, col || '#ffcf8a', true); },
    col(e) { return (ELEM[e.elem] || ELEM.earth).tele; },
    // who its arts can land on: you and your side — or, for your own beast, its foes
    targetsOf(g, e) {
      const pe = g.pe;
      return g.ents.filter(o => !o.dead && !o.hidden && o !== e && (o.alt || 0) < 1.5 && (e.tamed ? (g.hostileTo(pe, o) && o.type !== 'person') || (o.type === 'boss' && !o.tamed) || o.foe : (o === pe || o.isCompanion || o.tamed || o.mentor || (o.type === 'person' && g.hostileTo(e, o)))));
    },
    hurt(g, e, o, mult, op = {}) {
      const el = ELEM[e.elem] || ELEM.earth, pl = g.pl;
      let m = mult * (e.ph === 3 ? 1.15 : 1);
      if (o === g.pe && (pl.corrodeUntil || 0) > g.time) m *= 1 + 0.12 * (pl.corrode || 0);
      const got = ECHO.Combat.damage(o, e.dmgBase * m, { type: op.melee ? 'melee' : el.type, from: e, angle: Math.atan2(o.y - e.y, o.x - e.x), knock: op.knock || (op.quake ? 0.6 : 0.35), unblockable: !op.melee });
      if (got > 0) {
        if (!op.noEffect) A.effect(g, e, o, got);
        if (op.freeze && o === g.pe) { pl.slowT = Math.max(pl.slowT || 0, 3); ECHO.Combat.floater(o.x, o.y - 1.2, 'frozen', '#bfe8ff'); }
        if (op.stagger) o.stagger = Math.max(o.stagger || 0, 0.6);
        if (op.onHit) op.onHit(o);
      }
      return got;
    },
    // a column of light, or a falling star, for what hits from above
    pillar(x, y, col, n = 16) { for (let i = 0; i < n; i++) ECHO.Combat.fx.push({ kind: 'p', x: x + (Math.random() - 0.5) * 0.3, y: y + (Math.random() - 0.5) * 0.3, vx: 0, vy: 0, t: 0, life: 0.28, color: i % 3 ? col : '#ffffff', size: 3, h0: i * 0.6, vz: 0, spark: true }); },
    fall(x, y, col) { for (let i = 0; i < 12; i++) ECHO.Combat.fx.push({ kind: 'p', x: x + (Math.random() - 0.5) * 0.6, y: y + (Math.random() - 0.5) * 0.6, vx: 0, vy: 0, t: 0, life: 0.5, color: i % 2 ? col : '#ffe8c0', size: 3, h0: 7 + i * 0.25, vz: -14 }); },
    boom(g, e, x, y, r, op) {
      const el = ELEM[e.elem] || ELEM.earth;
      ECHO.Combat.ring(x, y, r, 'rgba(255,240,220,0.85)', 0.4);
      for (let i = 0; i < 10 + r * 6; i++) { const a = Math.random() * 6.28, s = Math.random() * r; ECHO.Combat.fx.push({ kind: 'p', x: x + Math.cos(a) * s, y: y + Math.sin(a) * s, vx: Math.cos(a) * 2, vy: Math.sin(a) * 2, t: 0, life: 0.6, color: Math.random() < 0.6 ? el.col : '#ffffff', size: 3 }); }
      if (op.bolt) { A.pillar(x, y, '#dfeaff'); g.light(x, y, 8, 0.9, '#bfe0ff'); }
      if (op.fall) A.fall(x, y, el.col);
      if (el.type === 'fire') g.light(x, y, 5 + r, 0.6, el.col);
      if (U.dist(x, y, g.pe.x, g.pe.y) < 14) g.shake(op.quake || r > 4 ? 0.45 : 0.18);
      if (ECHO.Sfx && U.dist(x, y, g.pe.x, g.pe.y) < 18) ECHO.Sfx.play(op.bolt ? 'hit' : 'stomp', { pitch: op.bolt ? 1.4 : 0.7, vol: 0.6 });
    },
    // a marked circle, then the blow
    blast(g, e, x, y, r, wind, mult, op = {}) {
      ECHO.Combat.telegraph({ x, y, cx: x, cy: y, radius: r, life: wind, shape: 'circle', color: op.col || A.col(e) });
      A.after(g, e, wind, () => {
        for (const o of A.targetsOf(g, e)) if (U.dist(o.x, o.y, x, y) < r + 0.3) A.hurt(g, e, o, mult, op);
        A.boom(g, e, x, y, r, op);
        if (op.then) op.then(x, y);
      });
    },
    // a marked line, then the blow along it
    line(g, e, x0, y0, a, len, w, wind, mult, op = {}) {
      ECHO.Combat.telegraph({ x: x0, y: y0, angle: a, len, width: w, life: wind, shape: 'line', color: op.col || A.col(e) });
      A.after(g, e, wind, () => {
        const lx = Math.cos(a), ly = Math.sin(a);
        for (const o of A.targetsOf(g, e)) { const tt = (o.x - x0) * lx + (o.y - y0) * ly, pp = Math.abs((o.x - x0) * ly - (o.y - y0) * lx); if (tt > -0.3 && tt < len && pp < w / 2 + 0.35) A.hurt(g, e, o, mult, op); }
        for (let s = 0; s < len; s += 1.1) { const x = x0 + lx * s, y = y0 + ly * s; if (op.bolt && s % 3 < 1.1) A.pillar(x, y, '#dfeaff', 8); else A.boom(g, e, x, y, 0.5, { quiet: true }); }
        if (op.then) op.then();
      });
    },
    // ground that hurts for a while: burning, frozen, poisoned, pulling
    zone(g, e, o) {
      const z = { e, t: 0, tick: 0, mult: 0, delay: 0, ...o };
      z.fx = { kind: 'zone', x: z.x, y: z.y, radius: z.r, life: z.life, t: 0, color: z.col || A.col(e) };
      ECHO.Combat.fx.push(z.fx); A.zones.push(z); return z;
    },
    // a ring that rushes outward: roll through it as it reaches you
    wave(g, e, x, y, r1, life, mult, op = {}) {
      const w = { e, x, y, r1, life, t: 0, w: op.w || 0.9, mult, op, hit: new Set() };
      w.fx = { kind: 'wave', x, y, radius: 0.5, life, t: 0, color: (ELEM[e.elem] || ELEM.earth).col };
      ECHO.Combat.fx.push(w.fx); A.waves.push(w);
      if (U.dist(x, y, g.pe.x, g.pe.y) < r1 + 4) g.shake(0.4);
    },
    // a beam that sweeps round it
    beam(g, e, a0, sweep, len, w, life, mult) {
      const b = { e, a0, sweep, len, w, life, t: 0, mult, hitT: new Map() };
      b.fx = { kind: 'beam', x: e.x, y: e.y, angle: a0, len, width: w, life, t: 0, color: (ELEM[e.elem] || ELEM.earth).col };
      ECHO.Combat.fx.push(b.fx); A.beams.push(b);
    },
    // a boulder rolling in a straight line
    rock(g, e, x, y, a, speed, r, range, mult) {
      const k = { e, x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r, left: range, mult, hit: new Set() };
      k.fx = { kind: 'rock', x, y, radius: r, life: range / speed + 0.2, t: 0, color: '#7a6a58' };
      ECHO.Combat.fx.push(k.fx); A.rocks.push(k);
    },
    // a circle that follows its target, stops, and strikes
    mark(g, e, tg, delay, r, mult, op = {}) {
      const fx = ECHO.Combat.telegraph({ x: tg.x, y: tg.y, cx: tg.x, cy: tg.y, radius: r, life: delay, shape: 'circle', color: op.col || A.col(e) });
      A.marks.push({ e, tg, fx, lockAt: g.time + delay - 0.5, at: g.time + delay, r, mult, op, cid: e.castId || 0 });
    },
    // a charge along a line, after a moment's warning
    dash(g, e, a, len, wind, dur, mult, op = {}) {
      ECHO.Combat.telegraph({ x: e.x, y: e.y, angle: a, len, width: e.r * 2 + 0.4, life: wind, shape: 'line', color: 'rgba(255,60,50,0.32)' });
      e.dir = a; e.flip = Math.cos(a) < 0;
      A.after(g, e, wind, () => A.dashes.push({ e, x0: e.x, y0: e.y, a, len, dur, t: 0, mult, op, hit: new Set() }));
    },
    // into the earth, under you, and up
    burrow(g, e, t, tg, mult) {
      A.busy(e, 3.6, (g2, e2, dt) => { if (e2.burrowed && g2.time < e2.burrowLock) A.go(g2, e2, tg.x, tg.y, 6.5, dt); if (Math.random() < dt * 14) ECHO.Combat.fx.push({ kind: 'p', x: e2.x + (Math.random() - 0.5) * 2, y: e2.y + (Math.random() - 0.5) * 2, vx: 0, vy: 0, t: 0, life: 0.5, color: '#8d7a5e', size: 3 }); });
      e.altGoal = -4.5; e.burrowed = true; e.burrowLock = g.time + 2.3;
      ECHO.Combat.burst(e.x, e.y, '#8d7a5e', 40, 5, 0.8, 3);
      A.tip(g, 'burrow', 'It went under the ground and is coming for you — watch for the ripples, and move when the ground is marked.');
      A.after(g, e, 2.3, () => {
        const x = tg.x, y = tg.y;
        ECHO.Combat.telegraph({ x, y, cx: x, cy: y, radius: 2.7, life: 0.9, shape: 'circle', color: 'rgba(200,170,120,0.45)' });
        A.after(g, e, 0.9, () => {
          e.x = x; e.y = y; e.alt = 0; e.altGoal = 0; e.burrowed = false;
          for (const o of A.targetsOf(g, e)) if (U.dist(o.x, o.y, x, y) < 3) A.hurt(g, e, o, mult, { knock: 1, quake: true });
          A.boom(g, e, x, y, 2.7, { quake: true }); ECHO.Combat.burst(x, y, '#8d7a5e', 50, 7, 1, 3);
        });
      });
    },
    // coiled round you: you can't move until it lets go
    grab(g, e, s) {
      A.held = { e, until: g.time + s, x: g.pe.x, y: g.pe.y, tick: 0 };
      ECHO.Combat.floater(g.pe.x, g.pe.y - 1.4, 'CONSTRICTED', '#9fe05a', true);
    },
    shield(g, e, frac, weak, name) {
      e.shield = { hp: e.maxHp * frac, max: e.maxHp * frac, weak, name };
      A.shout(e, `${U.cap(name)}!`, '#bfe8ff');
      A.tip(g, 'shield:' + weak, `It is shielded in ${name}. ${weak === 'fire' ? 'Fire (Q) breaks it three times as fast.' : 'Heavy blows (hold the strike) break it three times as fast.'} Break it and it is laid open for a moment.`);
    },
    spawnFoe(g, e, t, kind, x, y, lvlFrac, scale, label) {
      const sp = ECHO.Ent.freeSpot(g.world, x, y, 3);
      if (!sp) return;
      const m = ECHO.Monsters.make(g, kind, sp.x, sp.y, Math.max(1, Math.round(e.lvl * lvlFrac)), { eliteChance: 0 });
      m.gab = {}; m.broodOf = t.id; m.home = { x: t.x, y: t.y }; m.aggro = true; m.target = g.pe;
      if (scale) m.scale = (m.scale || 1) * scale;
      if (label) m.label = label;
      ECHO.Combat.burst(sp.x, sp.y, '#3a1a6a', 24, 3, 0.6, 3);
      g.ents.push(m);
    },
    // every frame: the arts in the world do their work
    tick(g, dt) {
      const now = g.time, pe = g.pe, pl = g.pl, world = g.world;
      const live = e => e && !e.dead && !e.vanish && e.state !== 'subdued';
      if (A.later.length) {
        const due = A.later.filter(l => l.at <= now);
        if (due.length) { A.later = A.later.filter(l => l.at > now); for (const l of due) { if (!live(l.e) || (l.e.castId || 0) !== l.cid) continue; try { l.fn(); } catch (err) { console.error(err); } } }
      }
      for (const z of A.zones) {
        z.t += dt;
        if (!live(z.e)) { z.fx.done = true; z.t = z.life; continue; }
        if (z.follow) { const tg = z.follow, d = U.dist(z.x, z.y, tg.x, tg.y); if (d > 0.1) { const s = Math.min(d, (z.speed || 2) * dt); z.x += (tg.x - z.x) / d * s; z.y += (tg.y - z.y) / d * s; } }
        z.fx.x = z.x; z.fx.y = z.y;
        if (z.t < z.delay) continue;
        const inSafe = o => z.safe && z.safe.some(s => U.dist(o.x, o.y, s.x, s.y) < s.r);
        if (z.pull || z.slow) for (const o of A.targetsOf(g, z.e)) {
          const d = U.dist(o.x, o.y, z.x, z.y);
          if (d > z.r) continue;
          if (z.slow && o === pe) pl.slowT = Math.max(pl.slowT || 0, 0.5);
          if (z.pull && d > 0.6) ECHO.Ent.move(world, o, (z.x - o.x) / d * z.pull * dt, (z.y - o.y) / d * z.pull * dt);
        }
        z.tick -= dt;
        if (z.mult > 0 && z.tick <= 0) {
          z.tick = 0.5;
          for (const o of A.targetsOf(g, z.e)) {
            if (U.dist(o.x, o.y, z.x, z.y) > z.r || inSafe(o)) continue;
            if (o === pe && pe.iframes > 0) continue;
            A.hurt(g, z.e, o, z.mult * 0.5, { noEffect: !(z.poison || z.burn) });
          }
          for (let i = 0; i < 3; i++) { const a = Math.random() * 6.28, s = Math.random() * z.r; ECHO.Combat.fx.push({ kind: 'p', x: z.x + Math.cos(a) * s, y: z.y + Math.sin(a) * s, vx: 0, vy: 0, t: 0, life: 0.6, color: z.fx.color, size: 2 }); }
        }
      }
      A.zones = A.zones.filter(z => z.t < z.life);
      for (const w of A.waves) {
        w.t += dt;
        const cur = 0.5 + (w.r1 - 0.5) * Math.min(1, w.t / w.life);
        w.fx.radius = cur;
        if (!live(w.e)) { w.t = w.life; continue; }
        for (const o of A.targetsOf(g, w.e)) {
          if (w.hit.has(o)) continue;
          if (Math.abs(U.dist(o.x, o.y, w.x, w.y) - cur) < w.w) { w.hit.add(o); A.hurt(g, w.e, o, w.mult, { ...w.op, knock: 0.8 }); }
        }
      }
      A.waves = A.waves.filter(w => w.t < w.life);
      for (const b of A.beams) {
        b.t += dt;
        if (!live(b.e)) { b.t = b.life; b.fx.done = true; continue; }
        const a = b.a0 + b.sweep * Math.min(1, b.t / b.life), lx = Math.cos(a), ly = Math.sin(a);
        b.fx.x = b.e.x; b.fx.y = b.e.y; b.fx.angle = a;
        for (const o of A.targetsOf(g, b.e)) {
          const tt = (o.x - b.e.x) * lx + (o.y - b.e.y) * ly, pp = Math.abs((o.x - b.e.x) * ly - (o.y - b.e.y) * lx);
          if (tt < 0 || tt > b.len || pp > b.w / 2 + 0.3) continue;
          if (now - (b.hitT.get(o) || -9) < 0.45) continue;
          b.hitT.set(o, now); A.hurt(g, b.e, o, b.mult);
        }
        if (Math.random() < dt * 30) { const s = Math.random() * b.len; ECHO.Combat.fx.push({ kind: 'p', x: b.e.x + lx * s, y: b.e.y + ly * s, vx: 0, vy: 0, t: 0, life: 0.4, color: '#fff6c0', size: 3 }); }
      }
      A.beams = A.beams.filter(b => b.t < b.life);
      for (const k of A.rocks) {
        const s = dt; k.x += k.vx * s; k.y += k.vy * s; k.left -= Math.hypot(k.vx, k.vy) * s;
        k.fx.x = k.x; k.fx.y = k.y;
        if (!live(k.e) || ECHO.World.isSolid(world, k.x, k.y)) k.left = 0;
        for (const o of A.targetsOf(g, k.e)) if (!k.hit.has(o) && U.dist(o.x, o.y, k.x, k.y) < k.r + 0.45) { k.hit.add(o); A.hurt(g, k.e, o, k.mult, { knock: 1, melee: true, noEffect: true }); }
        if (k.left <= 0) { k.fx.done = true; ECHO.Combat.burst(k.x, k.y, '#7a6a58', 18, 4, 0.6, 3); }
      }
      A.rocks = A.rocks.filter(k => k.left > 0);
      for (const m of A.marks) {
        if (!live(m.e) || (m.e.castId || 0) !== m.cid) { m.fx.done = true; m.done = true; continue; }
        if (now < m.lockAt) { m.fx.cx = m.fx.x = m.tg.x; m.fx.cy = m.fx.y = m.tg.y; }
        if (now >= m.at) {
          m.done = true;
          for (const o of A.targetsOf(g, m.e)) if (U.dist(o.x, o.y, m.fx.cx, m.fx.cy) < m.r + 0.3) A.hurt(g, m.e, o, m.mult, m.op);
          A.boom(g, m.e, m.fx.cx, m.fx.cy, m.r, m.op);
        }
      }
      A.marks = A.marks.filter(m => !m.done);
      for (const d of A.dashes) {
        const e = d.e; d.t += dt;
        if (!live(e)) { d.t = d.dur; continue; }
        const k = Math.min(1, d.t / d.dur), nx = d.x0 + Math.cos(d.a) * d.len * k, ny = d.y0 + Math.sin(d.a) * d.len * k;
        if (!ECHO.World.isSolid(world, nx, ny)) { e.x = nx; e.y = ny; } else d.t = d.dur;
        e.moving = true; e.dir = d.a;
        for (const o of A.targetsOf(g, e)) if (!d.hit.has(o) && U.dist(o.x, o.y, e.x, e.y) < e.r + 0.7) { d.hit.add(o); A.hurt(g, e, o, d.mult, { knock: 1.1, melee: true, noEffect: !d.op.bolt }); }
        if (Math.random() < dt * 20) ECHO.Combat.fx.push({ kind: 'p', x: e.x, y: e.y, vx: 0, vy: 0, t: 0, life: 0.5, color: '#8d8576', size: 3 });
        if (d.t >= d.dur && d.op.then) d.op.then();
      }
      A.dashes = A.dashes.filter(d => d.t < d.dur);
      const H = A.held;
      if (H) {
        if (!live(H.e) || now > H.until || pe.dead) A.held = null;
        else {
          pe.x = H.x; pe.y = H.y; pe.moving = false;
          H.tick -= dt; if (H.tick <= 0) { H.tick = 0.5; A.hurt(g, H.e, pe, 0.3, { noEffect: true, melee: true }); }
        }
      }
      if ((pl.corrodeUntil || 0) < now) pl.corrode = 0;
    },

    // ------------------------------------------------------------ arts in a fight
    pickSig(g, e, t) {
      const S = SIG[t.sp];
      if (!S) return null;
      e.sigT = e.sigT || {};
      if (e.ph === 3 && S.ult && g.time >= (e.ultAt || 0)) return S.ult;
      const ready = S.arts.filter(a => a.ph <= (e.ph || 1) && g.time >= (e.sigT[a.k] || 0));
      if (!ready.length || Math.random() > 0.6) return null;
      return ready[Math.floor(Math.random() * ready.length)];
    },
    useSig(g, e, t, s, tg) {
      const S = SIG[t.sp], ult = s === S.ult;
      e.sigT = e.sigT || {};
      if (ult) e.ultAt = g.time + 26; else e.sigT[s.k] = g.time + s.cd * PHASE_CD[e.ph || 1] * (e.tamed ? 1.5 : 1);
      e.cd = 1.4 * PHASE_CD[e.ph || 1];
      A.shout(e, ult ? `✦ ${s.name} ✦` : s.name, ult ? '#ff8a6a' : (ELEM[e.elem] || ELEM.earth).col);
      if (ult) { g.shake(0.6); if (ECHO.Sfx) ECHO.Sfx.play('roar', { pitch: 0.8 / Math.sqrt(e.tscale) }); }
      A._tamedCast = !!e.tamed;
      try { s.use(g, e, t, tg); } finally { A._tamedCast = false; }
    },
    phaseUp(g, e, t, ph) {
      const S = SIG[t.sp];
      e.ph = ph; e.inv = g.time + 1.5; e.atk = null; e.altGoal = 0;
      A.busy(e, 1.6);
      g.shake(0.8); if (ECHO.Sfx) ECHO.Sfx.play('roar', { pitch: 0.75 / Math.sqrt(e.tscale) });
      A.wave(g, e, e.x, e.y, 8, 0.9, 0.5, { knock: 1 });
      for (let i = 0; i < 40; i++) { const a = i / 40 * 6.28; ECHO.Combat.fx.push({ kind: 'p', x: e.x + Math.cos(a), y: e.y + Math.sin(a), vx: Math.cos(a) * 7, vy: Math.sin(a) * 7, t: 0, life: 0.7, color: (ELEM[e.elem] || ELEM.earth).col, size: 3 }); }
      UI().banner(`${t.name} ${ph === 2 ? 'is enraged' : 'is desperate'}`, ph === 2 ? 'New arts awaken — and it is quicker now' : `It will use everything it has${S && S.ult ? ' — ' + S.ult.name : ''}`, false);
      if (S && S.phase) S.phase(g, e, ph);
      if (ph === 3) e.ultAt = g.time + 1.8;
      if (UI().bossEnt === e) UI().bossBar(e);
    },
    // a titan grows with the world: it is never beneath you
    raise(g, t) {
      if (t.bound) return;
      // in steps (a tenth of your level each): Gorehorn two steps above you, Nyxathar twenty-one
      const idx = Ti().ORDER.indexOf(t.sp), want = ECHO.Prowess.above(ECHO.Prowess.level(g.pl), 2 + Math.max(0, idx) * 2.1);
      if (want > t.lvl) t.lvl = Math.min(ECHO.Prowess.MAX || 1500, want);
    },
    ents(game) { return game.ents.filter(e => e.titan && !e.dead); },
    entOf(game, id) { return game.ents.find(e => e.titan === id && !e.dead && !e.vanish) || null; },
    // How strong a bound beast fights for you: never more than a little past your own level.
    // (two steps above you: a strong ally, never one that does the fighting for you)
    effLv(game, t) { return Math.min(t.lvl, ECHO.Prowess.above(ECHO.Prowess.level(game.pl), 2)); },

    // ------------------------------------------------------------ bodies
    make(game, t, x, y, tamed) {
      const sp = Ti().sp(t), L = tamed ? A.effLv(game, t) : t.lvl, FM = ECHO.Prowess.foeMul(L, true);
      const maxHp = Math.round(1500 * FM.hp * (sp.flies ? 1 : 1.15));
      const b = { id: t.id, name: t.name, title: t.title, kind: sp.kind, maxHp, hp: maxHp * U.clamp(t.hp || 1, 0.2, 1), alive: true, color: sp.color, belly: sp.belly,
        armor: { ...(ARMOR[sp.element] || {}) }, scars: [], kills: 0, memory: { encounters: 0, dodge: { left: 0, right: 0, back: 0 }, blocks: 0, attacksSeen: 0, rangedTime: 0, meleeTime: 0, damageBy: { melee: 0, ranged: 0, fire: 0 }, knownFoes: {} } };
      const e = ECHO.Ent.make({ type: 'boss', x, y, r: 0.85 + sp.scale * 0.35, hp: b.hp, maxHp, speed: sp.flies ? 3.4 : 3.9, faction: tamed ? 'player' : 'wild', boss: b, lair: { id: t.id, x: t.x, y: t.y, rocks: [] }, state: 'roost', t: 0, cd: 1.5, label: `${t.name} ${t.title}` });
      e.enc = { dmg: { melee: 0, ranged: 0, fire: 0 }, started: false };
      e.titan = t.id; e.lvl = L; e._plv = L; e.dmgBase = 24 * FM.dmg; e.ph = 1; e.castId = 0; e.sigT = {}; e.alt = 0; e.altGoal = 0; e.tscale = sp.scale; e.flies = sp.flies; e.elem = sp.element;
      if (tamed) { e.tamed = true; e.label = `${t.name} (yours)`; e.state = 'follow'; }
      return e;
    },

    // ------------------------------------------------------------ every frame
    update(game, dt) {
      const world = game.world, pe = game.pe, pl = game.pl;
      if (!world.titans) return;
      A.tick(game, dt);
      if (pl.flying && (game.defeating || pe.dead || pl.capture)) A.finishLand(game);
      if (pl.flying && !A.entOf(game, pl.flying) && !ECHO.Interior.cur) A.spawnTamed(game, Ti().byId(world, pl.flying), true);
      A.t -= dt;
      if (A.t > 0) return;
      A.t = 0.5;
      if (ECHO.Interior.cur) return;
      // the wild ones, near you
      for (const t of world.titans.list) {
        if (!t.alive || t.bound) continue;
        A.raise(game, t);
        const d = U.dist(t.x, t.y, pe.x, pe.y), e = A.entOf(game, t.id);
        if (d < 62 && !e) {
          const ne = A.make(game, t, t.x, t.y, false);
          if (Ti().sp(t).flies && !A.night(world)) { ne.state = 'patrol'; ne.alt = ne.altGoal = 5; }
          game.ents.push(ne);
        } else if (d > 78 && e) { e.dead = true; e.vanish = true; t.hp = e.hp / e.maxHp; }
        if (!t.seen && d < 52) {
          t.seen = true;
          const sp = Ti().sp(t), D = ECHO.Prowess.diff(t.lvl, ECHO.Prowess.level(pl));
          UI().banner(`${t.name} ${t.title}`, `${sp.flies ? 'A dragon' : 'A great beast'} · level ${t.lvl} · this is its range`, false);
          if (!A.told.first) { A.told.first = true; setTimeout(() => UI().toast(`${sp.desc} ${D.skulls >= 2 ? 'It is far beyond you — stay off its range.' : 'Beat it down and you can bind it: it will fight for you' + (sp.flies ? ', and carry you through the sky.' : '.')}`, D.skulls >= 2 ? 'warn' : 'legend', 8), 900); }
        }
        // its young about the roost, as you come close
        if (d < 34 && !A.broodNear(game, t)) A.brood(game, t);
      }
      // your beast at your side
      if (pl.beastOut && !A.entOf(game, pl.beastOut)) {
        const t = Ti().byId(world, pl.beastOut);
        if (!t || !t.bound || !t.alive) pl.beastOut = null;
        else A.spawnTamed(game, t, false);
      }
    },
    night(world) { const h = world.minute / 60; return h < 5.5 || h > 21; },
    broodNear(game, t) { return game.ents.some(e => e.broodOf === t.id && !e.dead); },
    brood(game, t) {
      const sp = Ti().sp(t);
      if (t._brood && game.time - t._brood < 120) return;
      t._brood = game.time;
      const n = 2 + Math.floor(Math.random() * 3), L = Math.max(1, Math.round(t.lvl * 0.45));
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.28, sp0 = ECHO.Ent.freeSpot(game.world, t.x + Math.cos(a) * (4 + Math.random() * 4), t.y + Math.sin(a) * (4 + Math.random() * 4), 3);
        if (!sp0) continue;
        const m = ECHO.Monsters.make(game, sp.brood, sp0.x, sp0.y, L, { eliteChance: 0.1 });
        m.gab = {}; m.broodOf = t.id; m.home = { x: sp0.x, y: sp0.y };
        game.ents.push(m);
      }
    },
    spawnTamed(game, t, riding) {
      if (!t) return null;
      const pe = game.pe, sp = Ti().sp(t);
      if ((t.restUntil || 0) > game.world.day) { game.pl.beastOut = null; return null; }
      const at = ECHO.Ent.freeSpot(game.world, pe.x - 1.8, pe.y + 1.2, 6) || { x: pe.x, y: pe.y };
      const e = A.make(game, t, riding ? pe.x : at.x, riding ? pe.y : at.y, true);
      if (sp.flies && !riding) { e.alt = 6; e.altGoal = 0; }
      game.ents.push(e);
      return e;
    },

    // ------------------------------------------------------------ thinking (from Boss.update)
    think(game, e, dt) {
      if (ECHO.Interior.cur) { e.dead = true; e.vanish = true; return; }   // no titan fits through a door
      e.t += dt; e.cd = Math.max(0, e.cd - dt);
      e.boss.hp = e.hp;
      // height: rising and settling
      if (e.alt !== e.altGoal) { const r = (e.altGoal > e.alt ? 3.2 : 4.5) * dt; e.alt = Math.abs(e.altGoal - e.alt) < r ? e.altGoal : e.alt + Math.sign(e.altGoal - e.alt) * r; }
      if (e.tamed) return A.tamed(game, e, dt);
      return A.wild(game, e, dt);
    },
    wild(game, e, dt) {
      const world = game.world, pe = game.pe, pl = game.pl, t = Ti().byId(world, e.titan);
      if (!t) { e.dead = true; e.vanish = true; return; }
      t.hp = e.hp / e.maxHp;
      if (e.state === 'subdued') return A.subdued(game, e, t, dt);
      if (e.atk) return A.attackTick(game, e, t, dt);
      const d = U.dist(e.x, e.y, pe.x, pe.y), home = { x: t.x, y: t.y };
      const hostile = !pe.dead && !game.defeating && !pl.capture && !pl.flying;
      const onRange = U.dist(pe.x, pe.y, home.x, home.y) < t.r + 3;
      if (e.aggro) {
        if (!hostile || U.dist(pe.x, pe.y, home.x, home.y) > t.r + 24 || d > 34) { e.aggro = false; e.state = 'return'; if (UI().bossEnt === e) UI().bossBar(null); }
        else return A.fight(game, e, t, dt, d);
      }
      // it notices you on its range
      if (hostile && onRange && d < (e.alt > 2 ? 15 : 10)) {
        e.aggro = true; e.phase = e.alt > 2 ? 'air' : 'ground'; e.phaseT = 0; e.airN = 0; e.state = 'roar'; e.t = 0;
        game.shake(0.5); if (ECHO.Sfx) ECHO.Sfx.play('roar', { pitch: 1 / Math.sqrt(e.tscale) });
        UI().bossBar(e);
        ECHO.Combat.ring(e.x, e.y, 4, 'rgba(255,220,180,0.6)', 0.7);
        const D = ECHO.Prowess.diff(e.lvl, ECHO.Prowess.level(pl));
        if (D.skulls >= 3 && !A.told['run' + t.id]) { A.told['run' + t.id] = true; UI().toast(`${t.name} is level ${t.lvl}. You are not. Get off its range — now.`, 'warn', 5); }
        return;
      }
      switch (e.state) {
        case 'return': {
          e.altGoal = e.flies ? 4 : 0;
          if (A.go(game, e, home.x, home.y, e.flies ? 7 : 3.6, dt) < 1.5) { e.state = 'roost'; e.t = 0; e.altGoal = 0; }
          if (e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.02 * dt);
          return;
        }
        case 'roost': {
          e.moving = false; e.altGoal = 0;
          if (e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.01 * dt);
          if (!A.night(world) && e.t > 14 + (e.titanSeed || 0)) { e.state = e.flies ? 'patrol' : 'roam'; e.t = 0; e.titanSeed = Math.random() * 12; }
          return;
        }
        case 'patrol': case 'roam': {
          // circles its range from the sky, or walks it
          e.orb = (e.orb || Math.random() * 6) + dt * (e.flies ? 0.22 : 0.08);
          const rr = e.flies ? t.r * 0.8 : 6;
          e.altGoal = e.flies ? 5 : 0;
          A.go(game, e, home.x + Math.cos(e.orb) * rr, home.y + Math.sin(e.orb) * rr * 0.8, e.flies ? 5 : 1.6, dt);
          if (e.t > 9 && Math.random() < dt * 0.08) { const prey = A.preyNear(game, e, t); if (prey) { e.prey = prey; e.state = 'hunt'; e.t = 0; } }
          if (e.t > 45 || A.night(world)) { e.state = 'return'; e.t = 0; }
          return;
        }
        case 'hunt': {
          const p = e.prey;
          if (!p || p.dead || U.dist(p.x, p.y, home.x, home.y) > t.r + 10 || e.t > 20) { e.prey = null; e.state = 'return'; return; }
          e.altGoal = U.dist(e.x, e.y, p.x, p.y) < 4 ? 0.5 : e.flies ? 4 : 0;
          if (A.go(game, e, p.x, p.y, e.flies ? 8 : 5, dt) < e.r + 0.8) {
            ECHO.Combat.burst(p.x, p.y, '#7a1d24', 18, 3, 0.6, 3);
            ECHO.Combat.kill(p, e, 'melee', {});
            if (U.dist(e.x, e.y, pe.x, pe.y) < 24) ECHO.Combat.floater(e.x, e.y - 2.5 - e.alt, `${t.name} takes ${p.species === 'deer' ? 'a deer' : 'its prey'}`, '#ffcf8a');
            e.state = 'feed'; e.t = 0; e.prey = null; t.fed = world.day; t.hunger = 0;
          }
          return;
        }
        case 'feed': e.moving = false; e.altGoal = 0; if (e.t > 5) { e.state = 'roost'; e.t = 0; } return;
        case 'roar': e.moving = false; if (e.t > 1.2) e.state = 'roost'; return;
        default: e.state = 'roost';
      }
    },
    preyNear(game, e, t) {
      let best = null, bd = t.r + 6;
      for (const o of game.ents) {
        if (o.dead || o.hidden || o.type !== 'creature' || o.pet || o.stray || o.humanoid || !['deer', 'hare', 'wolf', 'boar', 'goat'].includes(o.species)) continue;
        const d = U.dist(o.x, o.y, t.x, t.y);
        if (d < bd) { bd = d; best = o; }
      }
      return best;
    },
    // movement: on the wing nothing is in the way; on foot, the usual
    go(game, e, x, y, speed, dt) {
      const d = U.dist(e.x, e.y, x, y);
      if (d < 0.2) { e.moving = false; return d; }
      const a = Math.atan2(y - e.y, x - e.x);
      e.dir = a; e.flip = Math.cos(a) < 0;
      if (e.flies && e.alt > 1.2) {
        const s = Math.min(d, speed * dt);
        e.x = U.clamp(e.x + Math.cos(a) * s, 3, game.world.W - 3); e.y = U.clamp(e.y + Math.sin(a) * s, 3, game.world.H - 3);
        e.moving = true;
      } else {
        // a body this size walks through brush and saplings; only walls, cliffs and deep water stop it
        const world = game.world, s = Math.min(d, speed * dt);
        const ok = (px, py) => !ECHO.World.isSolid(world, px, py) && !(ECHO.Water && ECHO.Water.kind(world, px, py) === 'deep');
        let moved = false;
        for (const off of [0, 0.6, -0.6, 1.2, -1.2]) {
          const nx = e.x + Math.cos(a + off) * s, ny = e.y + Math.sin(a + off) * s;
          if (ok(nx, ny)) { e.x = nx; e.y = ny; moved = true; break; }
        }
        e.moving = moved;
        e._blockT = moved ? 0 : (e._blockT || 0) + dt;
        // boxed in: a dragon hops into the air
        if (e._blockT > 0.6 && e.flies) { e.altGoal = 3; e._blockT = 0; }
      }
      return d;
    },

    // ------------------------------------------------------------ the fight
    fight(game, e, t, dt, d) {
      const pe = game.pe, ang = Math.atan2(pe.y - e.y, pe.x - e.x);
      if (e.state === 'roar') { e.moving = false; e.dir = ang; if (e.t > 1.2) { e.state = 'fight'; e.t = 0; } return; }
      // three phases: driven down, it changes
      const fr = e.hp / e.maxHp, wantPh = fr < 0.34 ? 3 : fr < 0.67 ? 2 : 1;
      if (wantPh > (e.ph || 1) && !e.atk) return A.phaseUp(game, e, t, wantPh);
      if ((e.stunUntil || 0) > game.time) { e.moving = false; e.altGoal = 0; return; }
      if ((e.busyUntil || 0) > game.time) {
        if (e.busyFn) e.busyFn(game, e, dt);
        else if (e.alt > 2) { e.orb = (e.orb || 0) + dt * 0.5; A.go(game, e, pe.x + Math.cos(e.orb) * 8, pe.y + Math.sin(e.orb) * 8, 6, dt); }
        else { e.moving = false; e.dir = ang; e.flip = Math.cos(ang) < 0; }
        return;
      }
      e.busyFn = null;
      // its own nature, all the time
      if (t.sp === 'emberwing' && (e.ph || 1) >= 2) { e._aura = (e._aura || 0) - dt; if (e._aura <= 0) { e._aura = 0.5; for (const o of A.targetsOf(game, e)) if (U.dist(o.x, o.y, e.x, e.y) < e.r + 2.2) A.hurt(game, e, o, 0.12); for (let i = 0; i < 6; i++) { const a2 = Math.random() * 6.28, s = e.r + Math.random() * 2; ECHO.Combat.fx.push({ kind: 'p', x: e.x + Math.cos(a2) * s, y: e.y + Math.sin(a2) * s, vx: 0, vy: 0, t: 0, life: 0.6, color: '#ff7a2a', size: 3 }); } } }
      // its arts
      if (e.cd <= 0 && d < 20) { const s = A.pickSig(game, e, t); if (s) return A.useSig(game, e, t, s, pe); }
      e.phaseT = (e.phaseT || 0) + dt;
      if (e.flies) {
        const low = e.hp < e.maxHp * 0.5;
        if (e.phase === 'ground' && e.phaseT > (low ? 7 : 11) + Math.random() * 3 && !e.atk) {
          e.phase = 'air'; e.phaseT = 0; e.airN = 0; e.altGoal = 5.5;
          ECHO.Combat.ring(e.x, e.y, 3.5, 'rgba(230,230,255,0.7)', 0.6); game.shake(0.3);
          for (let i = 0; i < 24; i++) { const a = i / 24 * 6.28; ECHO.Combat.fx.push({ kind: 'p', x: e.x + Math.cos(a), y: e.y + Math.sin(a), vx: Math.cos(a) * 5, vy: Math.sin(a) * 5, t: 0, life: 0.6, color: 'rgba(220,210,190,0.7)', size: 3 }); }
          if (!A.told.air) { A.told.air = true; UI().toast('It took to the air — out of reach of your blade. Arrows and fire can still reach it, or wait for it to come down. Watch the ground for what it is about to do.', 'study', 7); }
        }
        if (e.phase === 'air' && e.airN >= (low ? 4 : 3) && !e.atk) { e.phase = 'ground'; e.phaseT = 0; e.altGoal = 0; }
      }
      if (e.phase === 'air') {
        e.altGoal = 5.5;
        e.orb = (e.orb || ang + Math.PI) + dt * 0.55;
        A.go(game, e, pe.x + Math.cos(e.orb) * 8, pe.y + Math.sin(e.orb) * 8, 7.5, dt);
        if (e.cd <= 0 && e.alt > 4) {
          const k = Math.random() < 0.38 ? 'strafe' : Math.random() < 0.55 ? 'rain' : 'dive';
          e.airN++;
          return A.start(game, e, t, k);
        }
        return;
      }
      // on the ground
      e.altGoal = 0;
      if (e.alt > 0.6) return;
      const want = e.r + 1.3;
      if (d > want) A.go(game, e, pe.x, pe.y, (e.flies ? 3.4 : 3.9) * (d > 8 ? 1.35 : 1), dt); else { e.moving = false; e.dir = ang; e.flip = Math.cos(ang) < 0; }
      if (e.cd <= 0 && d < 8) {
        const kind = Ti().sp(t).kind, opts = GROUND[kind].filter(k => {
          const a = ATK[k];
          if (k === 'breath' || k === 'gore' || k === 'spit') return d > 2.5;
          if (k === 'quake') return true;
          return d < (a.len || a.radius || 3) + 0.6;
        });
        if (opts.length) return A.start(game, e, t, opts[Math.floor(Math.random() * opts.length)]);
      }
    },
    start(game, e, t, k) {
      const pe = game.pe, a0 = ATK[k], el = ELEM[e.elem] || ELEM.earth;
      const ang = Math.atan2(pe.y - e.y, pe.x - e.x);
      const a = { k, ...a0, t: 0, ang };
      e.atk = a; e.state = k === 'dive' ? 'roar' : 'windup'; e.moving = false; e.dir = ang; e.flip = Math.cos(ang) < 0; e.aim = ang;
      const col = a.elem ? el.tele : 'rgba(255,60,50,0.3)';
      if (a.shape === 'cone') ECHO.Combat.telegraph({ x: e.x, y: e.y, angle: ang, len: a.len * Math.max(1, e.tscale * 0.7), arc: a.arc, life: a.wind, shape: 'cone', color: col, follow: e });
      else if (a.shape === 'circle') { a.cx = a.atTarget ? pe.x : e.x; a.cy = a.atTarget ? pe.y : e.y; ECHO.Combat.telegraph({ x: a.cx, y: a.cy, cx: a.cx, cy: a.cy, radius: a.radius, life: a.wind, shape: 'circle', color: col }); }
      else if (a.shape === 'line') {
        // a strafing run starts behind you and goes through you
        if (a.through) { a.x0 = pe.x - Math.cos(ang) * a.len * 0.45; a.y0 = pe.y - Math.sin(ang) * a.len * 0.45; } else { a.x0 = e.x; a.y0 = e.y; }
        ECHO.Combat.telegraph({ x: a.x0, y: a.y0, angle: ang, len: a.len, width: a.width, life: a.wind, shape: 'line', color: col });
      } else if (a.shape === 'rain') {
        a.spots = [];
        for (let i = 0; i < a.n; i++) { const r = i === 0 ? 0 : 1.2 + Math.random() * a.spread, aa = Math.random() * 6.28; a.spots.push({ x: pe.x + Math.cos(aa) * r, y: pe.y + Math.sin(aa) * r }); }
        for (const s of a.spots) ECHO.Combat.telegraph({ x: s.x, y: s.y, cx: s.x, cy: s.y, radius: a.radius, life: a.wind, shape: 'circle', color: col });
      }
      if (a.charge) e.chargeAng = ang;
    },
    attackTick(game, e, t, dt) {
      const a = e.atk;
      a.t += dt; e.moving = false;
      if (a.dive) { e.altGoal = Math.max(0, 5.5 - a.t * 5); const p = a.t / a.wind; e.x = U.lerp(e.x, a.cx, Math.min(1, dt * 3 * p)); e.y = U.lerp(e.y, a.cy, Math.min(1, dt * 3 * p)); }
      if (a.charge && a.t > a.wind * 0.6) { const sp = 11 * dt; ECHO.Ent.move(game.world, e, Math.cos(a.ang) * sp, Math.sin(a.ang) * sp); e.moving = true; }
      if (a.t < a.wind) return;
      A.strike(game, e, t, a);
      e.atk = null; e.state = 'fight'; e.cd = a.cd * PHASE_CD[e.ph || 1] * 0.85;
      if (a.dive) { e.alt = 0; e.altGoal = 0; e.phase = 'ground'; e.phaseT = 0; }
    },
    // who a blow can land on: you and those on your side (or, for your beast, its foes)
    strike(game, e, t, a) {
      const pe = game.pe, el = ELEM[e.elem] || ELEM.earth;
      const targets = game.ents.filter(o => !o.dead && !o.hidden && o !== e && (e.tamed ? (game.hostileTo(pe, o) && o.type !== 'person') || (o.type === 'boss' && !o.tamed) || o.foe : (o === pe || o.isCompanion || o.tamed || o.mentor || (o.type === 'person' && game.hostileTo(e, o)))));
      const hit = (x, y) => {
        if (a.shape === 'cone') { const dd = U.dist(e.x, e.y, x, y); return dd < a.len * Math.max(1, e.tscale * 0.7) + 0.4 && Math.abs(U.angleDiff(a.ang, Math.atan2(y - e.y, x - e.x))) < a.arc / 2; }
        if (a.shape === 'circle') return U.dist(x, y, a.cx, a.cy) < a.radius + 0.35;
        if (a.shape === 'line') { const lx = Math.cos(a.ang), ly = Math.sin(a.ang), tt = (x - a.x0) * lx + (y - a.y0) * ly, perp = Math.abs((x - a.x0) * ly - (y - a.y0) * lx); return tt > -0.3 && tt < a.len && perp < a.width / 2 + 0.35; }
        if (a.shape === 'rain') return a.spots.some(s => U.dist(x, y, s.x, s.y) < a.radius + 0.3);
        return false;
      };
      const dmg = e.dmgBase * a.mult * (e.elem === 'sun' && a.elem ? 1.15 : 1);
      const type = a.elem ? el.type : 'melee';
      for (const o of targets) {
        if (!hit(o.x, o.y)) continue;
        const got = ECHO.Combat.damage(o, dmg, { type, from: e, angle: Math.atan2(o.y - e.y, o.x - e.x), knock: a.quake || a.dive ? 0.7 : 0.35 });
        if (got > 0 && a.elem) A.effect(game, e, o, got);
      }
      // what it looks like
      const fx = (x, y, n) => { for (let i = 0; i < n; i++) ECHO.Combat.fx.push({ kind: 'p', x: x + (Math.random() - 0.5) * 1.2, y: y + (Math.random() - 0.5) * 1.2, vx: (Math.random() - 0.5) * 4, vy: -1 - Math.random() * 2, t: 0, life: 0.6, color: Math.random() < 0.5 ? el.col : '#ffffff', size: 3 }); };
      if (a.shape === 'line') { for (let s = 0; s < a.len; s += 0.7) fx(a.x0 + Math.cos(a.ang) * s, a.y0 + Math.sin(a.ang) * s, 2); if (a.through) { e.x = U.clamp(a.x0 + Math.cos(a.ang) * a.len, 3, game.world.W - 3); e.y = U.clamp(a.y0 + Math.sin(a.ang) * a.len, 3, game.world.H - 3); } }
      else if (a.shape === 'rain') for (const s of a.spots) { fx(s.x, s.y, 10); ECHO.Combat.ring(s.x, s.y, a.radius, 'rgba(255,240,220,0.8)', 0.4); }
      else if (a.shape === 'circle') { ECHO.Combat.ring(a.cx, a.cy, a.radius, 'rgba(255,230,200,0.9)', 0.4); ECHO.Combat.burst(a.cx, a.cy, '#8d8576', 24, 5, 0.7, 3); }
      else ECHO.Combat.slash(e.x, e.y - 0.3, a.ang, a.len * Math.max(1, e.tscale * 0.7), a.arc, 'rgba(255,230,210,0.85)');
      if (a.dive || a.quake || a.shape === 'rain') game.shake(a.dive ? 0.7 : 0.35);
      if (ECHO.Sfx) ECHO.Sfx.play(a.shape === 'circle' || a.shape === 'rain' ? 'stomp' : 'hit', { pitch: 0.6 });
      if (a.elem && el.type === 'fire') game.light(e.x + Math.cos(a.ang) * 3, e.y + Math.sin(a.ang) * 3, 7, 0.6, el.col);
    },
    // what its element does to you
    effect(game, e, o, got) {
      const pl = game.pl, pe = game.pe;
      switch (e.elem) {
        case 'fire': case 'sun': o.burn = Math.max(o.burn || 0, 2.5); if (o === pe && e.elem === 'sun') game.hurtFlash(1); break;
        case 'frost': if (o === pe) { pl.slowT = Math.max(pl.slowT || 0, 2.5); ECHO.Combat.floater(pe.x, pe.y - 1.2, 'frozen', '#bfe8ff'); } else o.stagger = Math.max(o.stagger || 0, 1); break;
        case 'venom': if (o === pe) { pl.poisonT = 5; pl.poisonDps = Math.max(pl.poisonDps || 0, pl.maxHp * 0.03); if (e.titan === 'titan_mirevenom' || (Ti().byId(game.world, e.titan) || {}).sp === 'mirevenom') { pl.corrode = Math.min(4, (pl.corrode || 0) + 1); pl.corrodeUntil = game.time + 10; ECHO.Combat.floater(pe.x, pe.y - 1.5, `armour corroded ×${pl.corrode}`, '#c8f07a'); } else ECHO.Combat.floater(pe.x, pe.y - 1.2, 'poisoned', '#9fe05a'); } break;
        case 'storm': o.stagger = Math.max(o.stagger || 0, 0.5); if (o === pe) ECHO.Combat.floater(pe.x, pe.y - 1.2, 'jolted', '#bfe0ff'); break;
        case 'void': e.hp = Math.min(e.maxHp, e.hp + got * ((e.thirstUntil || 0) > game.time ? 0.6 : 0.3)); ECHO.Combat.floater(e.x, e.y - 2 - e.alt, 'drinks', '#a87aff'); break;
      }
    },

    // ------------------------------------------------------------ beaten
    // Called from Combat.damage for any titan: blows on the wing, and the fall.
    preDamage(game, e, dmg, src) {
      if (e.tamed) {
        if (e.hp - dmg <= 1) { A.spent(game, e); return Math.max(0, e.hp - 1); }
        return dmg;
      }
      if (e.state === 'subdued') return 0;
      const now = game.time, t = Ti().byId(game.world, e.titan), sp = t ? t.sp : '', pe = game.pe;
      const say = (txt, col) => { if (!e._sayT || now - e._sayT > 0.8) { e._sayT = now; ECHO.Combat.floater(e.x, e.y - 1.5 - Math.max(0, e.alt), txt, col || '#c8c0b0'); } };
      if ((e.inv || 0) > now) { say('unyielding'); return 0; }
      if (e.burrowed || e.alt < -0.5) { say('under the ground'); return 0; }
      if (src.from === pe && (game.pl.dazzleUntil || 0) > now) { dmg *= 0.3; say('blinded — it goes wide', '#fff6c0'); }
      if (sp === 'gorehorn') {
        const att = src.from || pe, rel = Math.abs(U.angleDiff(e.dir || 0, Math.atan2(att.y - e.y, att.x - e.x)));
        if (rel < 1.0) { dmg *= 0.35; say('glances off its hide'); A.tip(game, 'ironhide', 'Your blows glance off Gorehorn\'s face — get to its side or behind it.'); }
        else if (rel > 2.1) { dmg *= 1.4; say('weak spot!', '#ffe08a'); }
      }
      if (sp === 'skyrender' && src.type === 'ranged') dmg *= 0.5;
      if ((e.exposedUntil || 0) > now) dmg *= 1.4;
      if (e.shield) {
        const S = e.shield, f = (S.weak === 'fire' && src.type === 'fire') || (S.weak === 'heavy' && src.heavy) ? 3 : 1;
        const take = Math.min(S.hp, dmg * f);
        S.hp -= take; dmg -= take / f;
        say(`${S.name} ${Math.max(0, Math.round(S.hp / S.max * 100))}%`, '#bfe8ff');
        if (S.hp <= 0) { e.shield = null; e.exposedUntil = now + 5; ECHO.Combat.floater(e.x, e.y - 2.4, `${S.name.toUpperCase()} SHATTERED`, '#ffe08a', true); ECHO.Combat.burst(e.x, e.y, '#dff2ff', 40, 6, 0.9, 3); game.shake(0.5); }
        if (dmg <= 0) return 0;
      }
      if (e.charging) {
        e.charging.dmg += dmg;
        if (e.charging.dmg >= e.charging.need) { e.charging = null; e.castId = (e.castId || 0) + 1; e.busyUntil = 0; e.stunUntil = now + 3.5; e.exposedUntil = now + 3.5; ECHO.Combat.floater(e.x, e.y - 2.6, 'THE SPELL BREAKS', '#ffe08a', true); ECHO.Combat.ring(e.x, e.y, 4, 'rgba(255,240,180,0.9)', 0.6); game.shake(0.6); }
      }
      if (e.alt > 1.4 && src.type === 'melee') { if (!e._reachT || game.time - e._reachT > 0.8) { e._reachT = game.time; ECHO.Combat.floater(e.x, e.y - 1.5, 'out of reach', '#c8c0b0'); } return 0; }
      if (!e.aggro && src.from === game.pe) { e.aggro = true; e.phase = e.alt > 2 ? 'air' : 'ground'; e.phaseT = 0; e.airN = 0; e.state = 'fight'; UI().bossBar(e); }
      if (e.hp - dmg <= e.maxHp * 0.1) {
        // Solgrim does not stay down the first time
        if (sp === 'solgrim' && !e.reborn) {
          e.reborn = true; e.hp = e.maxHp * 0.45; e.ph = 2; e.inv = now + 2; A.busy(e, 2);
          A.shout(e, '✦ Rebirth ✦', '#ffe08a'); A.wave(game, e, e.x, e.y, 10, 1.1, 1.4, { burn: true }); game.light(e.x, e.y, 18, 1, '#ffd84a');
          UI().banner(`${t.name} rises again`, 'Burning brighter than before', false);
          return 0;
        }
        A.subdue(game, e); return Math.max(0, e.hp - e.maxHp * 0.1);
      }
      return dmg;
    },
    subdue(game, e) {
      const t = Ti().byId(game.world, e.titan);
      e.state = 'subdued'; e.atk = null; e.aggro = false; e.altGoal = 0; e.subT = 50; e.moving = false;
      e.castId = (e.castId || 0) + 1; e.busyUntil = 0; e.charging = null; e.shield = null; e.burrowed = false; e.alt = Math.max(0, e.alt); if (A.held && A.held.e === e) A.held = null;
      if (e.alt > 0.5) { e.alt = 0; game.shake(0.8); ECHO.Combat.burst(e.x, e.y, '#8d8576', 40, 6, 0.9, 3); }
      ECHO.Combat.floater(e.x, e.y - 2.5, `${t ? t.name : 'It'} is beaten!`, '#ffe08a', true);
      if (ECHO.Music) ECHO.Music.stinger('discover');
      UI().toast(`${t.name} lies in the dust, beaten. Bind it (E) and it is yours (${Ti().bound(game.world).length}/${Ti().MAX_BOUND}) — or finish it. It will not stay down long.`, 'legend', 9);
    },
    subdued(game, e, t, dt) {
      e.moving = false; e.altGoal = 0;
      e.subT -= dt;
      if (Math.random() < dt * 2) ECHO.Combat.fx.push({ kind: 'p', x: e.x + (Math.random() - 0.5) * 2, y: e.y - 0.5, vx: 0, vy: -0.6, t: 0, life: 1, color: '#ffe08a', size: 2 });
      if (e.subT <= 0) {
        e.hp = e.maxHp * 0.35; e.state = 'return'; e.aggro = false;
        if (UI().bossEnt === e) UI().bossBar(null);
        UI().toast(`${t.name} shakes off its daze and makes for its roost.`, 'warn', 4);
      }
    },
    interactables(game) {
      const out = [], pe = game.pe, pl = game.pl;
      if (pl.flying) return out;
      for (const e of A.ents(game)) {
        const d = U.dist(e.x, e.y, pe.x, pe.y), t = Ti().byId(game.world, e.titan);
        if (!t) continue;
        if (e.state === 'subdued' && d < e.r + 3) {
          out.push({ kind: 'act', label: `Bind ${t.name} — make it yours (${Ti().bound(game.world).length}/${Ti().MAX_BOUND})`, d: d * 0.4, act: () => A.bind(game, e, t) });
          out.push({ kind: 'act', label: `Finish ${t.name}`, d: d * 0.4 + 0.3, act: () => A.finish(game, e, t) });
        }
        if (e.tamed && e.flies && e.alt < 0.5 && d < e.r + 2.5 && !pl.mounted) out.push({ kind: 'act', label: `Climb onto ${t.name} and fly (V)`, d: d * 0.6, act: () => A.mount(game, e) });
      }
      return out;
    },
    xp(game, e, share) {
      const pl = game.pl, xp = Math.round(ECHO.Prowess.xpFor(pl, e) * share), ups = ECHO.Prowess.gain(pl, xp);
      ECHO.Combat.floater(game.pe.x, game.pe.y - 1.8, `+${U.short(xp)} xp`, '#ffcf5a', true);
      for (const u of ups) ECHO.Progress.levelUp(game, u);
      ECHO.Progress.flash();
    },
    bind(game, e, t) {
      const world = game.world, pl = game.pl;
      if (!Ti().canBind(world)) {
        const mine = Ti().bound(world);
        return UI().modal({ title: 'You can keep four', html: `<p>You already keep ${mine.length} beasts. Set one free to make room for ${esc(t.name)} — it goes back to its old range.</p>`, choices: mine.map(b => ({ label: `Set ${b.name} free`, sub: `${Ti().sp(b).flies ? 'Dragon' : 'Great beast'} · level ${b.lvl}`, onPick: () => { if (pl.beastOut === b.id) A.dismiss(game); Ti().release(world, b, pl); A.bind(game, e, t); } })).concat([{ label: 'Leave it', onPick: () => {} }]) });
      }
      Ti().bind(world, t, pl);
      A.xp(game, e, 1);
      t.hp = 0.6; t.restUntil = world.day;
      e.dead = true; e.vanish = true;
      if (UI().bossEnt === e) UI().bossBar(null);
      ECHO.Combat.ring(e.x, e.y, 3, 'rgba(255,224,138,0.95)', 1); ECHO.Combat.burst(e.x, e.y, '#ffe08a', 40, 4, 1, 3);
      if (ECHO.Music) ECHO.Music.stinger('echo');
      UI().banner(`${t.name} is yours`, `${t.title} · level ${t.lvl}`, false);
      pl.beastOut = t.id; pl.beastLast = t.id;
      if (pl.horse && !pl.horseAway && ECHO.Life) ECHO.Life.sendHome(game);
      const ne = A.spawnTamed(game, t, false); if (ne) { ne.x = e.x; ne.y = e.y; ne.alt = 0; ne.altGoal = 0; ne.hp = ne.maxHp * 0.6; }
      setTimeout(() => UI().toast(`${t.name} follows you now and fights at your side (a little above your own level, growing as you do). ${Ti().sp(t).flies ? 'Stand by it and press V to fly. ' : ''}Y switches between your animals (horse and beasts); U shows all of them.`, 'legend', 9), 800);
    },
    finish(game, e, t) {
      const world = game.world, pl = game.pl, r = Math.random, L = e.lvl;
      A.xp(game, e, 1.1);
      const add = (kind, qty) => game.loot.push({ x: e.x + (r() - 0.5) * 3, y: e.y + (r() - 0.5) * 3, kind, qty });
      add('dragonscale', Ti().sp(t).flies ? 3 + Math.floor(r() * 4) : 0); add('greathide', 2 + Math.floor(r() * 2)); add('greatfang', 2); if (r() < 0.6) add('heartstone', 1 + Math.floor(r() * 2));
      add('gold', Math.round(200 + Math.min(L, 150) * 12));
      for (let i = 0; i < 2; i++) ECHO.Monsters.dropGear(game, e.x + (r() - 0.5) * 2, e.y + (r() - 0.5) * 2, L, 30, `in the hoard of ${t.name}`);
      Ti().slain(world, t, `${pl.first} ${pl.last}`);
      pl.renown += 40;
      e.dead = true; e.deathT = 0;
      if (UI().bossEnt === e) UI().bossBar(null);
      ECHO.Combat.burst(e.x, e.y, '#5a1f1f', 50, 6, 1.3, 3); game.shake(0.8);
      UI().banner(`${t.name} is dead`, t.title, false);
    },

    // ------------------------------------------------------------ yours
    tamed(game, e, dt) {
      const world = game.world, pe = game.pe, pl = game.pl, t = Ti().byId(world, e.titan);
      if (!t || !t.bound) { e.dead = true; e.vanish = true; return; }
      t.hp = e.hp / e.maxHp;
      // under you, in the sky
      if (pl.flying === t.id) { e.x = pe.x; e.y = pe.y - 0.02; e.dir = pe.dir; e.flip = Math.cos(pe.dir) < 0; e.alt = Math.max(0, (pe.alt || 0) - A.SEAT * e.tscale); e.altGoal = e.alt; e.moving = !!pe.moving; e.state = 'stalk'; return; }
      if (e.atk) return A.attackTick(game, e, t, dt);
      if ((e.busyUntil || 0) > game.time) { if (e.busyFn) e.busyFn(game, e, dt); else e.moving = false; return; }
      e.busyFn = null;
      if (e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.01 * dt);
      const d = U.dist(e.x, e.y, pe.x, pe.y);
      if (d > 40) { const sp = ECHO.Ent.freeSpot(world, pe.x - 2, pe.y + 1.5, 6); if (sp) { e.x = sp.x; e.y = sp.y; if (e.flies) e.alt = 5; } }
      // something hostile near you: it goes for it
      let foe = null, bd = 9;
      for (const o of game.ents) {
        if (o.dead || o.hidden || o === e || o.tamed || o.isCompanion || o.ngWard || o === pe) continue;
        if (!(o.foe || (o.type === 'boss' && !o.tamed) || (o.type === 'creature' && game.hostileTo(pe, o) && (o.aggro || o.target === pe)) || (o.type === 'person' && game.hostileTo(pe, o)))) continue;
        if (o.titan && o.state === 'subdued') continue;
        const dd = U.dist(o.x, o.y, pe.x, pe.y);
        if (dd < bd) { bd = dd; foe = o; }
      }
      if (foe) {
        e.altGoal = 0; e.state = 'fight';
        const df = U.dist(e.x, e.y, foe.x, foe.y), ang = Math.atan2(foe.y - e.y, foe.x - e.x);
        if (df > e.r + foe.r + 1) A.go(game, e, foe.x, foe.y, 5, dt);
        else { e.moving = false; e.dir = ang; e.flip = Math.cos(ang) < 0; }
        if (e.cd <= 0 && e.alt < 0.6 && SIG[t.sp] && Math.random() < 0.5) {
          const arts = SIG[t.sp].arts.filter(s => s.tamed && game.time >= (e.sigT[s.k] || 0));
          if (arts.length) return A.useSig(game, e, t, arts[Math.floor(Math.random() * arts.length)], foe);
        }
        if (e.cd <= 0 && e.alt < 0.6) {
          const kind = Ti().sp(t).kind, k = df > 2.6 && (kind === 'drake' || kind === 'wyrm') ? (kind === 'drake' ? 'breath' : 'spit') : df < e.r + foe.r + 1.6 ? (Math.random() < 0.5 ? 'bite' : 'sweep') : null;
          if (k) {
            const a0 = ATK[k];
            e.atk = { k, ...a0, t: 0, ang, x0: e.x, y0: e.y, wind: a0.wind * 0.6 };
            if (a0.shape === 'rain') e.atk.spots = [{ x: foe.x, y: foe.y }, { x: foe.x + 1.5, y: foe.y }, { x: foe.x - 1.5, y: foe.y + 1 }];
            e.state = 'windup';
          }
        }
        return;
      }
      // follow you
      e.state = 'follow';
      if (d > 7 && e.flies) { e.altGoal = 3.5; A.go(game, e, pe.x - 2, pe.y + 1.5, Math.max(6, d * 0.9), dt); }
      else if (d > 3.5) { if (e.alt < 0.6) e.altGoal = 0; A.go(game, e, pe.x - 1.5, pe.y + 1.2, d > 8 ? 6.5 : 4, dt); }
      else { e.moving = false; if (!e.flies || d < 4) e.altGoal = 0; }
    },
    spent(game, e) {
      const t = Ti().byId(game.world, e.titan);
      if (!t) return;
      t.restUntil = game.world.day + 1; t.hp = 0.3;
      if (game.pl.flying === t.id) A.land(game, true);
      game.pl.beastOut = null;
      e.dead = true; e.vanish = true;
      ECHO.Combat.burst(e.x, e.y, '#c8c0b0', 20, 3, 0.8, 3);
      UI().toast(`${t.name} is spent and goes off to lick its wounds. It will answer you again tomorrow.`, 'warn', 5);
    },
    call(game, id) {
      const world = game.world, pl = game.pl, t = Ti().byId(world, id);
      if (!t || !t.bound) return;
      if (ECHO.Interior.cur) return UI().toast(`${t.name} will not fit in here. Call it outside.`, 'info', 3);
      if ((t.restUntil || 0) > world.day) return UI().toast(`${t.name} is still resting. Tomorrow.`, 'info', 3);
      if (pl.beastOut && pl.beastOut !== id) A.dismiss(game, true);
      pl.beastOut = id; pl.beastLast = id;
      if (pl.horse && !pl.horseAway && ECHO.Life) ECHO.Life.sendHome(game);
      if (!A.entOf(game, id)) A.spawnTamed(game, t, false);
      ECHO.Combat.floater(game.pe.x, game.pe.y - 1.6, `${t.name} comes`, '#ffe08a');
    },
    dismiss(game, quiet) {
      const pl = game.pl, e = pl.beastOut && A.entOf(game, pl.beastOut);
      if (pl.flying) return;
      if (e) { e.dead = true; e.vanish = true; ECHO.Combat.burst(e.x, e.y, '#c8c0b0', 14, 3, 0.6, 2); }
      if (!quiet && pl.beastOut) { const t = Ti().byId(game.world, pl.beastOut); if (t) ECHO.Combat.floater(game.pe.x, game.pe.y - 1.6, `${t.name} goes back to the wild places`, '#c8c0b0'); }
      pl.beastOut = null;
    },
    // U: the next of your animals — your horse, then each beast in turn — comes; the one with you goes
    cycle(game) {
      const pl = game.pl, world = game.world;
      if (pl.flying) return UI().toast('Not while you are in the sky — land first (V).', 'info', 2.5);
      if (ECHO.Interior.cur) return UI().toast('Call your animals outside.', 'info', 2.5);
      const beasts = world.titans ? Ti().bound(world) : [];
      const order = (pl.horse ? ['horse'] : []).concat(beasts.map(t => t.id));
      if (!order.length) return UI().toast('You have no animals to call yet: buy a horse at a stable, or beat a titan down and bind it.', 'info', 3.5);
      const cur = pl.beastOut || (pl.horse && !pl.horseAway ? 'horse' : null);
      // the next one that can come (a spent beast is resting until tomorrow)
      let i = order.indexOf(cur), next = null;
      for (let k = 1; k <= order.length; k++) {
        const id = order[(i + k + order.length) % order.length];
        if (id === cur && order.length > 1) continue;
        if (id !== 'horse') { const t = Ti().byId(world, id); if ((t.restUntil || 0) > world.day) continue; }
        next = id; break;
      }
      if (!next || next === cur) return UI().toast(cur ? 'No other animal can come just now.' : 'None of your animals can come just now.', 'info', 2.5);
      const n = order.indexOf(next) + 1;
      if (next === 'horse') {
        if (pl.beastOut) A.dismiss(game);
        ECHO.Life.callHorse(game);
        UI().toast(`🐎 ${pl.horse.name} is coming (${n}/${order.length}) — Y for the next.`, 'info', 2.5);
      } else {
        const t = Ti().byId(world, next);
        A.call(game, next);
        UI().toast(`${Ti().sp(t).flies ? '🐉' : '🦬'} ${t.name} comes to you (${n}/${order.length}) — Y for the next.`, 'info', 2.5);
      }
    },
    // Y: call your beast, or send it away
    yKey(game) {
      const pl = game.pl;
      if (pl.flying) return;
      if (pl.beastOut) return A.dismiss(game);
      const mine = Ti().bound(game.world);
      if (!mine.length) return UI().toast('You have no beasts. Beat a titan down on its range and bind it.', 'info', 3);
      const id = mine.some(b => b.id === pl.beastLast) ? pl.beastLast : mine[0].id;
      A.call(game, id);
    },

    // ------------------------------------------------------------ the sky
    // V: climb onto your dragon, or bring it down
    vKey(game) {
      const pl = game.pl, pe = game.pe;
      if (pl.flying) { A.land(game); return true; }
      if (pl.mounted) return false;
      const e = A.ents(game).find(o => o.tamed && o.flies && U.dist(o.x, o.y, pe.x, pe.y) < o.r + 2.5);
      if (!e) return false;
      A.mount(game, e);
      return true;
    },
    mount(game, e) {
      const pl = game.pl, pe = game.pe, t = Ti().byId(game.world, e.titan);
      if (!t || pl.mounted || ECHO.Interior.cur) return;
      if (e.hp < e.maxHp * 0.25) return UI().toast(`${t.name} is too hurt to carry you.`, 'info', 3);
      pl.flying = t.id;
      A.fly = { v: 0, dir: pe.dir || 0, up: 0, landing: false, h: 3.4 + A.SEAT * (e.tscale || 1) };
      e.atk = null; e.altGoal = 0;
      ECHO.PlayerCtl.unlock && ECHO.PlayerCtl.unlock(game, false);
      ECHO.Combat.ring(pe.x, pe.y, 3, 'rgba(230,230,255,0.7)', 0.6);
      if (!A.told.fly) { A.told.fly = true; UI().toast(`You are on ${t.name}'s back. WASD to fly, Shift to fly fast, V to come down (on open ground). Nothing on the ground can reach you up here.`, 'legend', 8); }
    },
    land(game, force) {
      const F = A.fly, pe = game.pe, world = game.world;
      if (!F) { game.pl.flying = null; pe.alt = 0; return; }
      const solid = ECHO.World.isSolid(world, pe.x, pe.y) || (ECHO.Water && ECHO.Water.kind(world, pe.x, pe.y) === 'deep');
      if (solid && !force) { const sp = ECHO.Ent.freeSpot(world, pe.x, pe.y, 4); if (!sp) return UI().toast('Nowhere to come down here — fly over open ground.', 'info', 2.5); }
      F.landing = true;
      if (force) A.finishLand(game);
    },
    finishLand(game) {
      const pe = game.pe, pl = game.pl, world = game.world;
      const sp = ECHO.Ent.freeSpot(world, pe.x, pe.y, 8) || { x: pe.x, y: pe.y };
      const e = pl.flying && A.entOf(game, pl.flying);
      pe.x = sp.x; pe.y = sp.y; pe.alt = 0; pl.x = pe.x; pl.y = pe.y;
      if (e) { const s2 = ECHO.Ent.freeSpot(world, pe.x - 2, pe.y + 1, 6) || sp; e.x = s2.x; e.y = s2.y; e.alt = 0; e.altGoal = 0; }
      pl.flying = null; A.fly = null;
      ECHO.Combat.ring(pe.x, pe.y, 2.5, 'rgba(220,210,190,0.7)', 0.5); game.shake(0.2);
      game.checkPlace();
    },
    // flying, every frame (instead of walking)
    flyTick(game, dt, mx, my, len) {
      const pe = game.pe, pl = game.pl, world = game.world, In = ECHO.Input;
      const F = A.fly || (A.fly = { v: 0, dir: pe.dir || 0, up: 1, landing: false });
      if (F.landing) { F.up = Math.max(0, F.up - dt / 1.1); F.v *= Math.exp(-dt * 3); if (F.up <= 0) return A.finishLand(game); }
      else F.up = Math.min(1, F.up + dt / 1.3);
      const fast = In.key('Shift');
      const want = len && !F.landing ? (fast ? 21 : 13) : 0;
      F.v += U.clamp(want - F.v, -dt * 9, dt * (fast ? 7 : 5));
      if (len && !F.landing) F.dir += U.angleDiff(F.dir, Math.atan2(my, mx)) * Math.min(1, dt * 3.2);
      pe.x = U.clamp(pe.x + Math.cos(F.dir) * F.v * dt, 3, world.W - 3);
      pe.y = U.clamp(pe.y + Math.sin(F.dir) * F.v * dt, 3, world.H - 3);
      pe.dir = F.dir; pe.flip = Math.cos(F.dir) < 0; pe.moving = F.v > 0.5;
      pe.alt = (F.h || 5.8) * F.up + Math.sin(game.time * 1.6) * 0.15 * F.up;
      pl.x = pe.x; pl.y = pe.y;
      pe.iframes = Math.max(pe.iframes || 0, 0.1);
      if (pl.stamina < pl.maxSta) pl.stamina = Math.min(pl.maxSta, pl.stamina + 20 * dt);
      // wind past you
      if (F.v > 8 && Math.random() < dt * F.v * 0.6) ECHO.Combat.fx.push({ kind: 'p', x: pe.x + (Math.random() - 0.5) * 6, y: pe.y + (Math.random() - 0.5) * 4, vx: -Math.cos(F.dir) * F.v * 0.8, vy: -Math.sin(F.dir) * F.v * 0.8, t: 0, life: 0.5, color: 'rgba(255,255,255,0.5)', size: 2 });
    },

    // ------------------------------------------------------------ the Animals page (U, or Journal → Animals)
    // Everything that answers to you: your horse, your beasts, your dog.
    animalsHtml(game) {
      const world = game.world, pl = game.pl, pe = game.pe, Lf = ECHO.Life, T = Ti();
      const where = o => `${Math.round(U.dist(o.x, o.y, pe.x, pe.y))} leagues ${ECHO.Purpose.dirTo(world, pl, o)}`;
      const bar = (f, col) => `<span style="display:inline-block;width:120px;height:7px;background:rgba(0,0,0,.45);border-radius:3px;overflow:hidden;vertical-align:middle"><i style="display:block;height:100%;width:${Math.round(U.clamp(f, 0, 1) * 100)}%;background:${col}"></i></span>`;
      const mine = world.titans ? T.bound(world) : [];
      let h = `<p class="dim">Every animal that answers to you. <b>U</b> opens this page; <b>Y</b> switches to your next animal (your horse, then each beast in turn). One animal rides with you at a time: when a beast comes your horse goes home, and when your horse comes the beast goes back to the wild.</p>`;
      // the beasts
      h += `<h3 class="gold">Beasts (${mine.length}/${T.MAX_BOUND})</h3>`;
      if (!mine.length) {
        const near = world.titans ? T.list(world).filter(t => t.alive && !t.bound).sort((a, b) => U.dist(a.x, a.y, pe.x, pe.y) - U.dist(b.x, b.y, pe.x, pe.y)).slice(0, 3) : [];
        h += `<p class="dim">None yet. Beat a dragon or a great beast down on its range and bind it (E) — you can keep four.${near.length ? ' The nearest: ' + near.map(t => `<b>${esc(t.name)}</b> (level ${t.lvl}, ${where(t)})`).join(', ') + '.' : ''}</p>`;
      } else h += `<div class="list">${mine.map(t => {
        const sp = T.sp(t), S = SIG[t.sp] || { arts: [] }, out = pl.beastOut === t.id, rest = (t.restUntil || 0) > world.day, flying = pl.flying === t.id;
        const e = out && A.entOf(game, t.id), hp = e ? e.hp / e.maxHp : (t.hp == null ? 1 : t.hp), fights = A.effLv(game, t);
        const status = flying ? '<span class="gold">carrying you through the sky</span>' : out ? `<span class="gold">with you</span>${e ? ` · ${e.state === 'fight' ? 'fighting' : 'at your side'}` : ''}` : rest ? 'resting — it answers again tomorrow' : 'in the wild places, waiting for your call';
        const arts = S.arts.filter(a => a.tamed).map(a => esc(a.name));
        return `<div class="card"><h4>${sp.flies ? '🐉' : '🦬'} ${esc(t.name)} <span class="dim">· ${esc(t.title)}</span></h4>
          <div class="dim" style="font-size:13px">${sp.flies ? 'Dragon' : 'Great beast'} of ${esc(ELEM[sp.element] ? ELEM[sp.element].word : sp.element)} · level ${t.lvl}${fights < t.lvl ? ` (fights at ${fights} for you — it grows as you do)` : ''} · yours since day ${t.boundDay || '?'}</div>
          <div class="row" style="gap:10px;font-size:13px"><span style="width:52px">Life</span>${bar(hp, hp > 0.5 ? '#9fe08a' : hp > 0.25 ? '#e0c060' : '#e05a4a')}<span>${Math.round(hp * 100)}%</span><span class="dim">· ${status}</span></div>
          <div style="font-size:13px">${arts.length ? `Uses for you: <b>${arts.join(', ')}</b>.` : ''} ${S.passive ? `<span class="dim">${esc(S.passive)}.</span>` : ''}${sp.flies ? ' <span class="gold">It can carry you: stand beside it and press V.</span>' : ''}</div>
          <div class="row">${flying ? '' : out ? `<button class="small" data-an-dismiss="1">Send away</button>` : `<button class="small" data-an-call="${t.id}" ${rest ? 'disabled' : ''}>Call</button>`}<button class="small" data-an-free="${t.id}" ${flying ? 'disabled' : ''}>Set free…</button></div></div>`;
      }).join('')}</div>`;
      // the horse
      h += `<h3 class="gold">Horse</h3>`;
      if (!pl.horse) h += `<p class="dim">No horse yet. Stables in the towns sell them, and you can catch a loose one after knocking its rider down.</p>`;
      else {
        const H = pl.horse, B = Lf.BREEDS[H.breed] || { name: 'horse' }, T0 = Lf.bondTier(H), hz = pl.horseAt;
        const status = pl.mounted ? '<span class="gold">you are riding it</span>' : pl.horseAway ? (hz ? 'cantering off home' : 'gone home — whistle (V) and it comes') : hz ? (hz.call ? 'coming to you' : `grazing ${U.dist(hz.x, hz.y, pe.x, pe.y) < 4 ? 'beside you' : where(hz)}`) : 'nearby';
        h += `<div class="card"><h4>🐎 ${esc(H.name)} <span class="dim">· ${esc(B.name.toLowerCase())}</span></h4>
          <div class="row" style="gap:10px;font-size:13px"><span style="width:52px">Trust</span>${bar((H.bond || 0) / 100, '#f0b8c8')}<b>${esc(T0.name)}</b></div>
          <div class="row" style="gap:10px;font-size:13px"><span style="width:52px">Wind</span>${bar((H.sta == null ? 100 : H.sta) / 100, '#9fe0c8')}<span>${H.blown ? 'blown' : Math.round(H.sta == null ? 100 : H.sta) + '%'}</span></div>
          <div style="font-size:13px">${status}</div>
          <div class="row">${pl.mounted ? '' : `<button class="small" data-an-whistle="1">Whistle for ${esc(H.name)} (V)</button>`}${!pl.horseAway ? `<button class="small" data-an-home="1">Send ${esc(H.name)} home</button>` : ''}</div></div>`;
      }
      // the dog
      h += `<h3 class="gold">Dog</h3>`;
      if (!pl.pet) h += `<p class="dim">No dog yet. Strays hang about the towns — offer one food a few times and it may decide you're worth following.</p>`;
      else {
        const P0 = pl.pet, home = Lf.home ? Lf.home(world, pl) : null;
        const status = P0.stay === 'home' ? `waiting by the fire at home${home ? ' in ' + esc(home.s.name) : ''}` : P0.stay && P0.at ? `waiting where you left it, ${where(P0.at)}` : '<span class="gold">at your heel</span>';
        h += `<div class="card"><h4>🐕 ${esc(P0.name)}</h4><div style="font-size:13px">${status}</div>
          <div class="row">${P0.stay ? `<button class="small" data-an-heel="1">Call ${esc(P0.name)} to heel</button>` : ''}${home && P0.stay !== 'home' ? `<button class="small" data-an-dog-home="1">Send ${esc(P0.name)} home</button>` : ''}</div></div>`;
      }
      return h;
    },
    animalsBind(root, game, redraw) {
      const pl = game.pl, again = () => setTimeout(redraw, 60);
      const on = (sel, fn) => root.querySelectorAll(sel).forEach(b => b.addEventListener('click', () => { fn(b); again(); }));
      on('button[data-an-call]', b => A.call(game, b.dataset.anCall));
      on('button[data-an-dismiss]', () => A.dismiss(game));
      on('button[data-an-whistle]', () => ECHO.Life.callHorse(game));
      on('button[data-an-home]', () => ECHO.Life.sendHome(game));
      on('button[data-an-heel]', () => { pl.pet.stay = null; pl.pet.at = null; for (const e of game.ents) if (e.pet && e.mine && !e.dead) { e.dead = true; e.vanish = true; } ECHO.Combat.floater(game.pe.x, game.pe.y - 1.4, `you whistle for ${pl.pet.name}`, '#e8d9a0'); });
      on('button[data-an-dog-home]', () => { pl.pet.stay = 'home'; pl.pet.at = null; for (const e of game.ents) if (e.pet && e.mine && !e.dead) { e.dead = true; e.vanish = true; } UI().toast(`${pl.pet.name} trots off toward home.`, 'info', 3); });
      root.querySelectorAll('button[data-an-free]').forEach(b => b.addEventListener('click', () => {
        const t = Ti().byId(game.world, b.dataset.anFree);
        UI().modal({ title: `Set ${t.name} free?`, html: `<p>${esc(t.name)} goes back to its old range, wild again — and as strong as any wild titan. You could beat it down and bind it again.</p>`, choices: [{ label: `Set ${t.name} free`, onPick: () => { if (pl.beastOut === t.id) A.dismiss(game, true); Ti().release(game.world, t, pl); UI().openJournal('animals'); } }, { label: 'Keep it', onPick: () => UI().openJournal('animals') }] });
      }));
    },
    // ------------------------------------------------------------ the character page
    html(game) {
      const world = game.world, pl = game.pl, mine = world.titans ? Ti().bound(world) : [];
      if (!mine.length && !pl.horse && !pl.pet) return '';
      const parts = [];
      if (mine.length) parts.push(`${mine.length} beast${mine.length > 1 ? 's' : ''} (${mine.map(t => esc(t.name) + (pl.beastOut === t.id ? ' — with you' : '')).join(', ')})`);
      if (pl.horse) parts.push(`${esc(pl.horse.name)} the horse${pl.horseAway ? ' (gone home)' : ''}`);
      if (pl.pet) parts.push(`${esc(pl.pet.name)} the dog`);
      return `<h3 class="gold">Your animals</h3><div class="card"><div style="font-size:13px">${parts.join(' · ')}</div><div class="row"><button class="small" data-an-open="1">See all your animals (U)</button></div></div>`;
    },
    bindUi(root, game) {
      root.querySelectorAll('button[data-an-open]').forEach(b => b.addEventListener('click', () => UI().openJournal('animals')));
    },
  };
  A.install();
})();
