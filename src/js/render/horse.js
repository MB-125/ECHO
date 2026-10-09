// The horse: a jointed body that really walks, trots, canters and gallops.
//
// ECHO.Gait is the footfall engine shared by both renderers. A horse moves its
// legs in a fixed order that changes with speed — the four-beat walk, the
// two-beat diagonal trot, the three-beat canter and the four-beat gallop with
// a moment in the air — and a hoof on the ground travels backward exactly as
// fast as the body travels forward, so the feet never skate. Between strides
// the gait blends rather than snapping.
//
// ECHO.Horse3D builds the horse out of simple solids with real joints
// (shoulder, knee, fetlock; hip, hock, fetlock), a neck that pumps at the
// gallop and nods at the walk, a mane and tail that stream and settle, ears
// that flick, a barrel that breathes, tack that matches the breed, and reins
// that run from the bit to your hands.
(function () {
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const wrap = p => p - Math.floor(p);
  // shortest way round the circle between two phases
  const plerp = (a, b, t) => { let d = wrap(b - a + 0.5) - 0.5; return wrap(a + d * t); };

  // Leg order everywhere: left fore, right fore, left hind, right hind.
  const GAITS = {
    idle:   { off: [0.25, 0.75, 0, 0.5],    duty: 1,    freq: () => 0,               flex: 0,    bob: 0,     pitch: 0,     neck: 0,    nod: 0 },
    walk:   { off: [0.25, 0.75, 0, 0.5],    duty: 0.64, freq: v => 0.7 + v * 0.14,   flex: 0.75, bob: 0.008, pitch: 0.01,  neck: 0,    nod: 0.07 },
    trot:   { off: [0, 0.5, 0.5, 0],        duty: 0.44, freq: v => 1.2 + v * 0.05,   flex: 1.05, bob: 0.03,  pitch: 0.012, neck: 0.02, nod: 0 },
    canter: { off: [0.33, 0.6, 0, 0.33],    duty: 0.4,  freq: v => 1.45 + v * 0.03,  flex: 1.25, bob: 0.035, pitch: 0.05,  neck: 0.1,  nod: 0 },
    gallop: { off: [0.46, 0.58, 0, 0.12],   duty: 0.32, freq: v => 1.75 + v * 0.06,  flex: 1.45, bob: 0.045, pitch: 0.065, neck: 0.14, nod: 0 }
  };
  const LEG = 0.67; // shoulder to ground, in tiles

  const Gait = ECHO.Gait = {
    GAITS, LEG,
    make() { return { phase: 0, gait: 'idle', off: GAITS.idle.off.slice(), A: 0, v: 0, flex: 0, bob: 0, pitch: 0, neck: 0, nod: 0, duty: 1, freq: 0, still: 0, prevStance: [true, true, true, true], hoofDown: [] }; },
    pick(st, v) {
      // a little hysteresis so a horse at the edge of two gaits doesn't flicker between them
      const h = (g, up, dn) => st.gait === g ? dn : up;
      if (v < h('idle', 0.25, 0.12)) return 'idle';
      if (v < h('walk', 2.3, 2.6)) return 'walk';
      if (v < h('trot', 4.4, 4.8)) return 'trot';
      if (v < h('canter', 6.0, 6.4)) return 'canter';
      return 'gallop';
    },
    // Advance the gait by dt at ground speed v (tiles a second).
    update(st, v, dt) {
      st.v = v;
      const g = Gait.pick(st, v); st.gait = g;
      const G = GAITS[g], k = 1 - Math.exp(-dt * 6);
      for (let i = 0; i < 4; i++) st.off[i] = plerp(st.off[i], G.off[i], k);
      st.duty = lerp(st.duty, G.duty, k); st.flex = lerp(st.flex, G.flex, k);
      st.bob = lerp(st.bob, G.bob, k); st.pitch = lerp(st.pitch, G.pitch, k);
      st.neck = lerp(st.neck, G.neck, k); st.nod = lerp(st.nod, G.nod, k);
      const f = G.freq(v);
      st.freq = lerp(st.freq, f, k);
      // the hoof's sweep on the ground matches the distance the body covers
      const want = st.freq > 0.05 ? Math.asin(clamp(v * st.duty / (st.freq * 2 * LEG), 0, 0.72)) : 0;
      st.A = lerp(st.A, want, 1 - Math.exp(-dt * 8));
      if (g === 'idle') { st.still += dt; st.A *= Math.exp(-dt * 6); } else { st.still = 0; st.phase = wrap(st.phase + st.freq * dt); }
      // which hooves just struck the ground (for sound and dust)
      st.hoofDown.length = 0;
      for (let i = 0; i < 4; i++) {
        const p = wrap(st.phase + st.off[i]), on = g === 'idle' || p < st.duty;
        if (on && !st.prevStance[i] && g !== 'idle') st.hoofDown.push(i);
        st.prevStance[i] = on;
      }
      return st;
    },
    // One leg: hip swing (forward +), joint flexion (0 straight, 1 fully folded) and lift.
    leg(st, i) {
      if (st.gait === 'idle' && st.A < 0.01) return { hip: 0, flex: 0, heel: 0, stance: true };
      const p = wrap(st.phase + st.off[i]), d = st.duty;
      if (p < d) {
        const s = p / d;
        return { hip: st.A * (1 - 2 * s), flex: 0, heel: s > 0.75 ? (s - 0.75) / 0.25 * 0.35 : 0, stance: true };
      }
      const s = (p - d) / (1 - d);
      const e = 0.5 - 0.5 * Math.cos(Math.PI * s);
      return { hip: -st.A + 2 * st.A * e, flex: st.flex * Math.sin(Math.PI * Math.pow(s, 0.75)), heel: 0, stance: false };
    },
    // Body motion for this instant: rise, pitch (nose up +), roll, and the neck's pump.
    body(st) {
      const ph = st.phase * TAU;
      let bob = 0, pitch = 0, neck = 0, sway = 0;
      if (st.gait === 'walk') { bob = st.bob * Math.cos(ph * 2); sway = 0.02 * Math.sin(ph); neck = st.nod * Math.sin(ph * 2 + 0.6); }
      else if (st.gait === 'trot') { bob = st.bob * Math.abs(Math.sin(ph)) - st.bob * 0.5; pitch = st.pitch * Math.sin(ph * 2); neck = st.neck * Math.sin(ph * 2); }
      else if (st.gait === 'canter' || st.gait === 'gallop') {
        bob = st.bob * Math.sin(ph + 0.4);
        pitch = st.pitch * Math.sin(ph - 0.9);
        neck = -st.neck * Math.sin(ph - 0.9);   // the head goes down as the forehand comes up
      }
      return { bob, pitch, neck, sway };
    }
  };

  // ------------------------------------------------------------------ 3D
  const H3 = ECHO.Horse3D = {
    // Tack and markings by breed.
    LOOK: {
      pony:     { coat: '#7a5a3a', points: '#3a2a1a', mane: '#3a2a1a', blanket: '#3f6a3a', trim: '#c8b070', socks: [0, 0, 1, 0], feather: false, size: 1.0 },
      courser:  { coat: '#56321c', points: '#1e1612', mane: '#151010', blanket: '#8a2a24', trim: '#d8c080', socks: [1, 0, 0, 1], feather: false, size: 1.12, blaze: true },
      destrier: { coat: '#2a2420', points: '#141210', mane: '#0a0808', blanket: '#2a3a6a', trim: '#d8c080', socks: [0, 0, 1, 1], feather: true, size: 1.2, barding: true },
      grey:     { coat: '#c8c8cc', points: '#8a8a90', mane: '#ececf0', blanket: '#5a3a7a', trim: '#e8c860', socks: [0, 0, 0, 0], feather: false, size: 1.1, dapple: true }
    },
    build(breed, B) {
      const L = H3.LOOK[breed] || H3.LOOK.pony;
      const mats = [];
      const mat = (c, o = {}) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: o.r != null ? o.r : 0.85, metalness: o.m || 0, flatShading: true }); mats.push(m); return m; };
      const M = {
        coat: mat(L.coat), points: mat(L.points), mane: mat(L.mane, { r: 0.95 }), hoof: mat('#2a2622', { r: 0.6 }), sock: mat('#ece6da'),
        eye: mat('#0c0a08', { r: 0.3 }), nose: mat('#1c1614'), leather: mat('#4a2e1a', { r: 0.7 }), dark: mat('#2a1a10', { r: 0.7 }),
        blanket: mat(L.blanket), trim: mat(L.trim, { r: 0.5, m: 0.4 }), metal: mat('#9a9aa2', { r: 0.4, m: 0.6 }), white: mat('#f2eee4')
      };
      const mesh = (geo, m, parent, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; };
      const grp = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
      const blob = (r, sx, sy, sz, m, parent, x, y, z) => { const o = mesh(new THREE.IcosahedronGeometry(r, 1), m, parent, x, y, z); o.scale.set(sx, sy, sz); return o; };
      const taper = (r1, r2, h, m, parent, y, seg = 7) => mesh(new THREE.CylinderGeometry(r2, r1, h, seg), m, parent, 0, y);   // r1 at the bottom of the run, r2 at the top
      const box = (w, h, d, m, parent, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), m, parent, x, y, z);

      const root = new THREE.Group();
      const inner = grp(root); inner.rotation.y = Math.PI; // built facing +x; the game's forward is -x
      inner.scale.setScalar(L.size);
      const BY = 0.74;
      const body = grp(inner, 0, BY, 0);
      // barrel, chest, quarters and withers
      const barrel = blob(1, 0.5, 0.21, 0.18, M.coat, body, 0, 0, 0);
      blob(1, 0.2, 0.23, 0.17, M.coat, body, 0.4, 0.02, 0);
      blob(1, 0.25, 0.24, 0.185, M.coat, body, -0.39, 0.05, 0);
      blob(1, 0.16, 0.1, 0.12, M.coat, body, 0.3, 0.17, 0);
      blob(1, 0.3, 0.08, 0.17, M.coat, body, -0.02, -0.15, 0); // belly
      if (L.dapple) for (let i = 0; i < 14; i++) { const a = i * 2.4; blob(0.035, 1, 1, 0.5, M.points, body, -0.4 + (i % 7) * 0.12, -0.06 + Math.sin(a) * 0.09, (i < 7 ? 1 : -1) * 0.2); }
      // saddle and blanket
      const saddle = grp(body, 0.04, 0.2, 0);
      box(0.5, 0.02, 0.46, M.blanket, saddle, 0, 0.01, 0);
      for (const s of [-1, 1]) {
        box(0.44, 0.16, 0.014, M.blanket, saddle, 0, -0.07, s * 0.225);
        box(0.44, 0.02, 0.018, M.trim, saddle, 0, -0.15, s * 0.226);
      }
      box(0.34, 0.06, 0.28, M.leather, saddle, 0, 0.05, 0);
      box(0.06, 0.1, 0.2, M.leather, saddle, 0.16, 0.08, 0);   // pommel
      box(0.06, 0.12, 0.26, M.leather, saddle, -0.16, 0.09, 0); // cantle
      box(0.03, 0.03, 0.03, M.trim, saddle, 0.18, 0.14, 0);
      for (const s of [-1, 1]) {
        box(0.025, 0.3, 0.012, M.dark, saddle, 0.02, -0.13, s * 0.21);
        const st = box(0.07, 0.025, 0.05, M.metal, saddle, 0.02, -0.29, s * 0.22);
        st.rotation.x = 0;
      }
      // girth and breast collar
      box(0.04, 0.012, 0.42, M.dark, body, 0.12, -0.2, 0).rotation.z = 0.1;
      for (const s of [-1, 1]) box(0.04, 0.32, 0.012, M.dark, body, 0.12, -0.05, s * 0.2);
      const collar = box(0.03, 0.03, 0.36, M.leather, body, 0.56, 0.02, 0); collar.rotation.z = 0.6;
      // barding for the warhorse
      // barding for the warhorse: a cloth caparison over quarters and chest, skirts that swing
      const skirts = [];
      if (L.barding) {
        // a long caparison under the saddle, a studded peytral across the chest
        for (const sd of [-1, 1]) {
          const g = grp(body, 0.0, 0.16, sd * 0.19);
          box(0.66, 0.3, 0.012, M.blanket, g, 0, -0.14, 0);
          box(0.66, 0.025, 0.016, M.trim, g, 0, -0.29, 0);
          for (let i = 0; i < 3; i++) { const d = box(0.05, 0.05, 0.016, M.trim, g, -0.2 + i * 0.2, -0.15, sd * 0.002); d.rotation.z = Math.PI / 4; }
          g.userData.side = sd; skirts.push(g);
        }
        const pey = grp(body, 0.56, -0.02, 0); pey.rotation.y = 0;
        for (let i = 0; i < 5; i++) { const a = (i - 2) * 0.32; const b = box(0.03, 0.035, 0.035, M.metal, pey, Math.cos(a) * 0.05, -0.02, Math.sin(a) * 0.17); void b; }
        box(0.03, 0.03, 0.36, M.leather, pey, 0.02, -0.02, 0);
      }
      // ---- legs: shoulder/hip → knee/hock → fetlock → hoof
      const legs = [];
      const mkLeg = (i) => {
        const fore = i < 2, s = i % 2 === 0 ? 1 : -1;
        const top = grp(body, fore ? 0.37 : -0.4, fore ? -0.04 : 0.0, s * 0.12);
        const uLen = fore ? 0.31 : 0.38, lLen = fore ? 0.24 : 0.23, pLen = 0.1;
        const topY = (fore ? -0.04 : 0) + BY;   // height of the joint above the ground at rest
        if (fore) { blob(1, 0.09, 0.15, 0.075, M.coat, top, 0, -0.06, 0); taper(0.04, 0.07, uLen, M.coat, top, -uLen / 2); }
        else { blob(1, 0.13, 0.2, 0.09, M.coat, top, 0.0, -0.07, 0); taper(0.04, 0.08, uLen, M.coat, top, -uLen / 2 - 0.02); }
        const knee = grp(top, 0, -uLen, 0);
        blob(0.045, 1, 1, 0.9, sockMat(i), knee, 0, 0, 0);
        taper(0.033, 0.04, lLen, sockMat(i), knee, -lLen / 2);
        const fet = grp(knee, 0, -lLen, 0);
        blob(0.042, 1, 1, 0.9, sockMat(i), fet, 0, 0, 0);
        taper(0.035, 0.035, pLen * 0.6, sockMat(i), fet, -pLen * 0.3);
        if (L.feather) { const f = mesh(new THREE.ConeGeometry(0.06, 0.1, 6), M.white, fet, -0.02, -0.04, 0); f.rotation.z = Math.PI; }
        const hoof = mesh(new THREE.CylinderGeometry(0.042, 0.056, 0.065, 7), M.hoof, fet, 0.008, -pLen + 0.0, 0);
        // rest angles: the hind leg's zig-zag, with the hock sitting behind the hip
        const rest = fore ? { u: 0, k: 0, f: 0 } : { u: -0.14, k: 0.24, f: -0.1 };
        legs.push({ top, knee, fet, hoof, fore, rest, topY, uLen, lLen, pLen });
      };
      const sockMat = i => L.socks[i] ? M.sock : M.points;
      for (let i = 0; i < 4; i++) mkLeg(i);

      // ---- neck, head, mane
      const neck = grp(body, 0.48, 0.1, 0);
      neck.rotation.z = -0.62;
      const neckM = taper(0.15, 0.08, 0.54, M.coat, neck, 0.25, 8); neckM.scale.set(1.15, 1, 0.85);
      const mane = [];
      for (let i = 0; i < 8; i++) {
        const y = 0.06 + i * 0.062, r = lerp(0.15, 0.08, y / 0.54) * 1.15;
        const g = grp(neck, -r + 0.01, y, 0.0);
        const m = box(0.05, 0.07, 0.035, M.mane, g, -0.02, 0, 0.02);
        m.rotation.x = 0.3;
        mane.push(g);
      }
      if (L.barding) for (let i = 0; i < 4; i++) { const y = 0.1 + i * 0.1, r = lerp(0.15, 0.08, y / 0.54) * 1.15; const pl = box(0.03, 0.09, 0.15, M.metal, neck, -r + 0.005, y, 0); pl.rotation.z = 0.08; }
      const head = grp(neck, 0, 0.52, 0);
      head.rotation.z = -1.55;
      const skull = box(0.16, 0.2, 0.15, M.coat, head, -0.01, 0.07, 0);
      box(0.12, 0.13, 0.13, M.coat, head, 0.045, 0.04, 0); // jowl
      const muz = taper(0.075, 0.055, 0.25, M.coat, head, 0.27, 7); muz.scale.set(1, 1, 0.82);
      blob(0.05, 1, 0.9, 1.0, M.nose, head, 0.0, 0.39, 0); // soft nose
      if (L.blaze) box(0.012, 0.3, 0.05, M.white, head, -0.075, 0.2, 0).rotation.z = 0.05;
      for (const s of [-1, 1]) {
        box(0.02, 0.025, 0.02, M.eye, head, -0.045, 0.085, s * 0.077);
        box(0.015, 0.02, 0.02, M.nose, head, -0.005, 0.395, s * 0.035);
        // bridle: cheek straps, noseband, brow band
        box(0.012, 0.22, 0.01, M.dark, head, 0.0, 0.14, s * 0.079).rotation.z = 0.2;
      }
      box(0.14, 0.022, 0.16, M.dark, head, 0, 0.27, 0); // noseband
      box(0.015, 0.025, 0.16, M.dark, head, -0.08, 0.035, 0); // browband
      box(0.04, 0.05, 0.08, M.mane, head, -0.09, 0.0, 0); // forelock
      if (L.barding) { box(0.025, 0.24, 0.1, M.metal, head, -0.085, 0.18, 0); box(0.03, 0.03, 0.03, M.trim, head, -0.1, 0.1, 0); }
      const ears = [];
      for (const s of [-1, 1]) {
        const eg = grp(head, -0.07, -0.02, s * 0.045);
        const ear = mesh(new THREE.ConeGeometry(0.028, 0.09, 4), M.coat, eg, 0, 0.04, 0);
        eg.rotation.z = Math.PI / 2 + 0.25; // pointing up out of the poll
        ears.push(eg); void ear;
      }
      // the bit rings the reins run from
      const bitL = grp(head, 0.02, 0.29, 0.075), bitR = grp(head, 0.02, 0.29, -0.075);

      // ---- tail
      const tail = grp(body, -0.61, 0.13, 0);
      tail.rotation.z = -0.55;
      const tailSeg = [];
      let parent = tail;
      const TL = [0.1, 0.13, 0.13, 0.12];
      for (let i = 0; i < 4; i++) {
        const g = grp(parent, 0, i === 0 ? 0 : -TL[i - 1], 0);
        const w = i === 0 ? 0.05 : 0.05 + i * 0.018;
        const m = mesh(new THREE.CylinderGeometry(w * 0.55, i === 0 ? w * 0.5 : w * 0.7, TL[i] + 0.03, 6), i === 0 ? M.coat : M.mane, g, 0, -TL[i] / 2, 0);
        void m; tailSeg.push(g); parent = g;
      }

      // ---- reins: two thin straps stretched each frame between bit and hands
      const reinMat = M.dark;
      const reins = [0, 1].map(() => new THREE.Mesh(new THREE.BoxGeometry(1, 0.014, 0.014), reinMat)); // the renderer puts these in the scene

      const H = {
        root, inner, body, barrel, legs, skirts, neck, head, ears, mane, tail, tailSeg, saddle, bitL, bitR, reins, mats, breed, L,
        st: Gait.make(), t: Math.random() * 10, yawRate: 0, lastYaw: null, roll: 0, ear: [0, 0], earT: 2, graze: 0, grazeT: 6 + Math.random() * 6, swish: 0, swishT: 3, cock: 0, tailLift: 0,
        seat: BY + 0.27, seatX: 0.04
      };
      return H;
    },
    // Pose the horse for this frame: v = ground speed, yaw = heading (radians, game frame).
    pose(H, dt, v, yaw, o = {}) {
      const st = Gait.update(H.st, v, dt);
      H.t += dt;
      const L = H.L;
      // turning: lean into the bend and look where you're going
      if (H.lastYaw != null && dt > 0) { let d = yaw - H.lastYaw; d = Math.atan2(Math.sin(d), Math.cos(d)); H.yawRate = lerp(H.yawRate, d / dt, 1 - Math.exp(-dt * 6)); }
      H.lastYaw = yaw;
      H.roll = lerp(H.roll, clamp(-H.yawRate * v * 0.02, -0.16, 0.16), 1 - Math.exp(-dt * 5));
      const bd = Gait.body(st);
      // breathing, harder after a gallop
      H.wind = clamp((H.wind || 0) + (st.gait === 'gallop' ? dt * 0.12 : -dt * 0.04), 0, 1);
      const breath = Math.sin(H.t * (1.4 + H.wind * 2.2)) * (0.012 + H.wind * 0.02);
      H.barrel.scale.set(0.5, 0.21 * (1 + breath), 0.18 * (1 + breath * 0.8));
      // the idle horse: shifts its weight, rests a hind leg, grazes, flicks its ears and tail
      const idle = st.gait === 'idle';
      H.grazeT -= dt;
      if (idle && !o.ridden && H.grazeT <= 0) { H.grazing = !H.grazing; H.grazeT = H.grazing ? 4 + Math.random() * 6 : 5 + Math.random() * 8; }
      if (!idle || o.ridden) H.grazing = false;
      H.graze = lerp(H.graze, H.grazing ? 1 : 0, 1 - Math.exp(-dt * 2));
      H.cock = lerp(H.cock, idle && st.still > 2.5 ? 1 : 0, 1 - Math.exp(-dt * 3));

      // rearing: up on the hind legs, forelegs pawing the air
      H.rear = lerp(H.rear || 0, o.rear ? 1 : 0, 1 - Math.exp(-dt * (o.rear ? 9 : 4)));
      const rr = H.rear;
      H.body.position.y = 0.74 + bd.bob - H.cock * 0.012 - H.graze * 0.01 + rr * 0.3;
      H.body.position.x = -rr * 0.18;
      H.body.rotation.z = bd.pitch - H.graze * 0.03 + rr * 0.72;
      // a sidestep: the body swings over the outside legs, the legs cross under it
      H.side = lerp(H.side || 0, o.side || 0, 1 - Math.exp(-dt * 18));
      H.body.rotation.x = H.roll + bd.sway * 0.3 + H.side * 0.2;
      // legs
      for (let i = 0; i < 4; i++) {
        const g = H.legs[i], l = Gait.leg(st, i);
        let hip = l.hip, flex = l.flex;
        if (idle) { hip = 0; flex = 0; if (i === 3) { flex = H.cock * 0.55; hip = H.cock * 0.08; } }
        if (g.fore) {
          g.top.rotation.z = hip + g.rest.u + bd.pitch * -0.5;
          g.knee.rotation.z = -flex * 1.15 + g.rest.k;
          g.fet.rotation.z = -flex * 0.75 - l.heel + g.rest.f;
        } else {
          // the hind leg lifts by bending the hock: the thigh comes forward, the cannon tucks under
          const hf = flex * (0.35 + 0.25 * Math.min(1, st.v / 7));
          g.top.rotation.z = hip * 0.95 + g.rest.u + flex * 0.22 + bd.pitch * -0.5;
          g.knee.rotation.z = g.rest.k + hf;
          g.fet.rotation.z = g.rest.f - flex * 0.7 - l.heel;
        }
        if (rr > 0.01) {
          if (g.fore) { const paw = Math.sin(H.t * 9 + i * 1.7) * 0.35; g.top.rotation.z = lerp(g.top.rotation.z, 0.5 + paw - 0.72, rr); g.knee.rotation.z = lerp(g.knee.rotation.z, -1.6, rr); g.fet.rotation.z = lerp(g.fet.rotation.z, -0.6, rr); }
          else { g.top.rotation.z = lerp(g.top.rotation.z, -0.72 + 0.25, rr); g.knee.rotation.z = lerp(g.knee.rotation.z, 0.25, rr); g.fet.rotation.z = lerp(g.fet.rotation.z, 0.1, rr); }
        }
        g.top.rotation.x = Math.abs(H.side) > 0.02 ? -H.side * (i % 2 === 0 ? 0.32 : 0.18) * (g.fore ? 1 : 0.7) : 0;
        if (Math.abs(H.side) > 0.02) g.knee.rotation.z += (g.fore ? -0.5 : 0.35) * Math.abs(H.side) * (i % 2 === 0 ? 1 : 0.4);
        // keep the hoof flat on the ground through the stance
        g.hoof.rotation.z = -(g.top.rotation.z + g.knee.rotation.z + g.fet.rotation.z + H.body.rotation.z) * (l.stance ? 1 : 0.4);
      }
      for (let i = 0; i < H.skirts.length; i++) { const g = H.skirts[i]; g.rotation.x = g.userData.side * (0.02 + Math.min(1, v / 8) * 0.07 + Math.sin(H.t * 9 + i) * 0.025 * Math.min(1, v / 3)); }
      // neck and head
      const look = clamp(-H.yawRate * 0.12, -0.35, 0.35);
      const gallopReach = st.gait === 'gallop' ? 0.18 : st.gait === 'canter' ? 0.1 : 0;
      H.neck.rotation.z = -0.62 - gallopReach + bd.neck - bd.pitch * 0.8 - H.graze * 1.05 - rr * 0.35;
      H.neck.rotation.y = look;
      H.head.rotation.z = -1.55 + gallopReach * 0.6 + bd.neck * 0.4 - H.graze * 0.35 + (o.reined ? -0.12 : 0);
      // mane streams back with speed and ripples
      const flow = clamp(v / 8, 0, 1);
      for (let i = 0; i < H.mane.length; i++) {
        H.mane[i].rotation.z = -flow * 0.6 + Math.sin(H.t * (3 + flow * 8) - i * 0.7) * (0.06 + flow * 0.15);
        H.mane[i].rotation.x = Math.sin(H.t * 2.1 + i) * 0.05;
      }
      // ears: forward when moving, flicking now and then when still
      H.earT -= dt;
      if (H.earT <= 0) { H.earT = 1 + Math.random() * 3; H.ear = [Math.random() < 0.5 ? -0.5 : 0.2, Math.random() < 0.5 ? -0.5 : 0.2]; }
      for (let i = 0; i < 2; i++) {
        const want = idle ? H.ear[i] : st.gait === 'gallop' ? -0.25 : 0.15;
        H.ears[i].rotation.x = lerp(H.ears[i].rotation.x, want * (i ? -1 : 1) * 0.5, 1 - Math.exp(-dt * 8));
        H.ears[i].rotation.z = Math.PI / 2 + 0.25 + (st.gait === 'gallop' ? -0.35 : 0);
      }
      // tail: carried higher and streaming at speed, swishing at flies when still
      H.swishT -= dt;
      if (H.swishT <= 0) { H.swishT = 2 + Math.random() * 5; H.swish = 1; }
      H.swish = Math.max(0, H.swish - dt * 1.4);
      H.tailLift = lerp(H.tailLift, flow, 1 - Math.exp(-dt * 3));
      H.tail.rotation.z = -0.55 - H.tailLift * 0.55 + bd.pitch;
      for (let i = 0; i < H.tailSeg.length; i++) {
        const seg = H.tailSeg[i];
        seg.rotation.z = i === 0 ? 0 : -H.tailLift * 0.35 + Math.sin(H.t * 5 - i) * 0.04 * flow + (i === 1 ? 0.35 * (1 - H.tailLift) : 0);
        seg.rotation.x = Math.sin(H.t * (idle ? 6 : 3 + flow * 6) - i * 0.9) * ((idle ? H.swish * 0.45 : 0.06 + flow * 0.12) * (i + 1) / 3) + H.roll * 0.5;
      }
      return bd;
    },
    // Stretch a strap mesh between two world points.
    strap(m, a, b) {
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, len = Math.hypot(dx, dy, dz);
      m.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      m.scale.set(len, 1, 1);
      m.quaternion.setFromUnitVectors(H3._x || (H3._x = new THREE.Vector3(1, 0, 0)), new THREE.Vector3(dx / len, dy / len, dz / len));
    }
  };
})();

// ------------------------------------------------------------------ 2D
// The same horse, side on, for the classic view: legs in two joints driven by
// the same footfalls, a bobbing, pitching body, a streaming mane and tail.
(function () {
  const Gait = ECHO.Gait;
  ECHO.Horse2D = {
    // ctx is already at the horse's feet, facing +x. t: seconds. st: a Gait state.
    draw(ctx, breed, st, t, ridden) {
      const L = ECHO.Horse3D.LOOK[breed] || ECHO.Horse3D.LOOK.pony;
      const bd = Gait.body(st), PX = 16;
      const bob = bd.bob * PX, flow = Math.min(1, st.v / 8);
      const line = (c, w, pts) => { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.stroke(); };
      const ell = (c, x, y, rx, ry, rot = 0) => { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); ctx.fill(); };
      const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); const f = c => Math.max(0, Math.min(255, Math.round(c * k))); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; };
      const SC = 1.4;
      ctx.save(); ctx.scale(SC, SC);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0, 0, 11, 1.8, 0, 0, Math.PI * 2); ctx.fill();
      const by = -11.5 - bob;
      const leg = (i, far) => {
        const fore = i < 2, l = st.gait === 'idle' ? { hip: 0, flex: 0 } : Gait.leg(st, i);
        const x0 = fore ? 6 : -6, y0 = by + 1.5 + (fore ? 0 : -0.3) + (fore ? 1 : -1) * Math.sin(-bd.pitch) * 6;
        const u = fore ? 5.2 : 5.6, lo = fore ? 5.4 : 5.0;
        const a1 = l.hip + (fore ? 0 : -0.15), a2 = fore ? a1 - l.flex * 1.2 : a1 + 0.25 + l.flex * 0.9;
        const kx = x0 + Math.sin(a1) * u, ky = y0 + Math.cos(a1) * u;
        const fx = kx + Math.sin(a2) * lo, fy = Math.min(-0.3, ky + Math.cos(a2) * lo);
        const c = L.socks[i] ? '#e8e2d4' : L.points;
        line(far ? shade(L.coat, 0.7) : L.coat, fore ? 2.2 : 2.8, [x0, y0 - 1.5, kx, ky]);
        line(far ? shade(c.startsWith('#') ? c : L.points, 0.7) : c, 1.4, [kx, ky, fx, fy]);
        ctx.fillStyle = '#2a2622'; ctx.fillRect(fx - 0.9, fy - 0.6, 1.9, 1);
      };
      // far legs behind the body
      leg(1, true); leg(3, true);
      ctx.save(); ctx.translate(0, by); ctx.rotate(-bd.pitch);
      // tail
      const tl = 0.5 + flow * 0.5;
      ctx.strokeStyle = L.mane; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-9, -1.5);
      ctx.quadraticCurveTo(-12 - tl * 3, -1 + (1 - tl) * 3, -11.5 - tl * 4 + Math.sin(t * 6) * 0.6 * flow, 6 - tl * 6 + Math.sin(t * 5) * 0.5); ctx.stroke();
      // body
      ell(L.coat, 0, 0, 8.6, 3.5); ell(L.coat, 6, -0.3, 3.6, 3.6); ell(L.coat, -6.4, -0.6, 3.8, 3.8);
      ell(shade(L.coat, 0.82), 0, 2.2, 6.5, 1.3);
      // neck and head (the neck pumps at the canter and gallop)
      const nk = bd.neck * 6 + (st.gait === 'idle' && !ridden ? 0 : 0);
      ctx.fillStyle = L.coat; ctx.beginPath(); ctx.moveTo(5, -2.5); ctx.lineTo(9.5, -8 + nk); ctx.lineTo(12, -7 + nk); ctx.lineTo(9, 1); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(9.4, -9.2 + nk); ctx.lineTo(12.2, -8.6 + nk); ctx.lineTo(15.6, -4.6 + nk); ctx.lineTo(14.2, -3.4 + nk); ctx.lineTo(10.4, -5.8 + nk); ctx.closePath(); ctx.fill();
      ctx.fillStyle = L.coat; ctx.beginPath(); ctx.moveTo(9.8, -9 + nk); ctx.lineTo(10.6, -11.2 + nk); ctx.lineTo(11.2, -8.8 + nk); ctx.fill();
      ctx.fillStyle = '#100c0a'; ctx.fillRect(11.6, -7.6 + nk, 1, 1);
      ctx.fillStyle = '#2a1a10'; ctx.fillRect(13.6, -4.6 + nk, 0.9, 0.9);
      // mane, streaming with speed
      ctx.strokeStyle = L.mane; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(9.6, -9 + nk);
      for (let i = 1; i <= 4; i++) ctx.lineTo(9.6 - i * 1.15 - flow * 0.7, -9 + nk + i * 1.6 + Math.sin(t * 8 - i) * 0.4 * flow); ctx.stroke();
      // tack
      ctx.fillStyle = L.blanket; ctx.fillRect(-3.2, -3.9, 6.6, 3.6);
      ctx.fillStyle = L.trim; ctx.fillRect(-3.2, -0.6, 6.6, 0.6);
      ctx.fillStyle = '#4a2e1a'; ctx.fillRect(-2.6, -4.6, 5.2, 1.4); ctx.fillRect(1.8, -5.6, 1, 1.4); ctx.fillRect(-2.8, -5.8, 1.1, 1.6);
      if (L.barding) { ctx.fillStyle = L.blanket; ctx.fillRect(-8, -1.5, 15, 4.2); ctx.fillStyle = L.trim; ctx.fillRect(-8, 2.2, 15, 0.6); }
      // reins
      ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(13.8, -4.8 + nk); ctx.quadraticCurveTo(8, ridden ? -5 : -1.5, ridden ? 4.5 : 2.2, ridden ? -8 : -4.6); ctx.stroke();
      ctx.restore();
      leg(0, false); leg(2, false);
      ctx.restore();
      return { seat: (by - 4.6) * SC };
    }
  };
})();
