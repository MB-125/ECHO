// Loads the Blender-built models and prepares them for the 3D renderer.
//  • bake(name, colors)  → merged, vertex-coloured geometries for instancing
//    static things (trees, buildings, crops). Glowing parts and windows are
//    kept in their own geometries so they can light up at night.
//  • instance(name)      → a full clone with its named parts, for animated
//    characters, creatures and bosses (each gets its own materials).
(function () {
  const GLOW = new Set(['glow', 'flame', 'eyeglow', 'rune', 'voidglow', 'shroomglow', 'sicklight']);

  const M = ECHO.Models = {
    scenes: {}, baked: {}, ready: false, failed: null,

    srgb(hex) { return new THREE.Color(hex).convertSRGBToLinear(); },

    async load() {
      if (M.ready) return true;
      if (typeof THREE === 'undefined' || !THREE.GLTFLoader || !ECHO.MODEL_DATA) { M.failed = 'three.js or model data missing'; return false; }
      const loader = new THREE.GLTFLoader();
      const jobs = Object.entries(ECHO.MODEL_DATA).map(([name, b64]) => new Promise((resolve) => {
        const bin = atob(b64);
        const buf = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        loader.parse(buf.buffer, '', (gltf) => { M.scenes[name] = gltf.scene; gltf.scene.traverse(o => { if (o.isSkinnedMesh) gltf.scene.userData.skinned = true; }); resolve(); }, (err) => { console.error('model', name, err); resolve(); });
      }));
      await Promise.all(jobs);
      try { M.procedural(); } catch (err) { console.error('model: procedural', err); }
      M.ready = Object.keys(M.scenes).length > 0;
      if (!M.ready) M.failed = 'no models parsed';
      return M.ready;
    },

    // A few small things made here rather than in Blender: what is left of a felled tree.
    procedural() {
      const mat = (name, hex) => { const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(hex).convertSRGBToLinear() }); m.name = name; return m; };
      // (the houses and halls of the other peoples: render/townmodels.js)
      if (M.townModels) { try { M.townModels(mat); } catch (err) { console.error('model: town models', err); } }
      if (!M.scenes.stump) {
        const g = new THREE.Group(), bark = mat('bark', '#5a4330'), cut = mat('cutwood', '#d8b684'), ring = mat('heart', '#a27a4a');
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.19, 0.26, 9), bark); trunk.position.y = 0.13; g.add(trunk);
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.137, 0.137, 0.02, 9), cut); top.position.y = 0.265; top.rotation.z = 0.07; g.add(top);
        const heart = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.014, 7), ring); heart.position.y = 0.279; heart.rotation.z = 0.07; g.add(heart);
        // the roots going into the ground
        for (let k = 0; k < 4; k++) {
          const a = k / 4 * Math.PI * 2 + 0.4, r = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.08), bark);
          r.position.set(Math.cos(a) * 0.17, 0.03, Math.sin(a) * 0.17); r.rotation.set(0, -a, -0.35); g.add(r);
        }
        // and the chips the axe threw
        for (let k = 0; k < 4; k++) {
          const a = k * 2.3 + 1, c = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.045), cut);
          c.position.set(Math.cos(a) * (0.3 + k * 0.03), 0.01, Math.sin(a) * (0.28 + k * 0.04)); c.rotation.y = a * 1.7; g.add(c);
        }
        M.scenes.stump = g;
      }
      // the loose things that lie about the towns, the fields and the ruins (game/loose.js);
      // each stands on its base, its foot at 0, as tall as the game takes it to be
      const lathe = (pts, m, seg = 12) => new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), m);
      if (!M.scenes.pot) {
        const g = new THREE.Group(), clay = mat('clay', '#a85a32'), dark = mat('claydark', '#6a3018');
        g.add(lathe([[0, 0], [0.085, 0], [0.125, 0.04], [0.15, 0.13], [0.14, 0.22], [0.095, 0.29], [0.075, 0.31], [0.088, 0.34], [0.07, 0.34], [0.055, 0.31]], clay));
        const band = lathe([[0.151, 0.15], [0.153, 0.17], [0.148, 0.19]], dark); g.add(band);
        const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.062, 10), dark); mouth.rotation.x = -Math.PI / 2; mouth.position.y = 0.305; g.add(mouth);
        M.scenes.pot = g;
      }
      if (!M.scenes.urn) {
        const g = new THREE.Group(), clay = mat('urnclay', '#a8957a'), dark = mat('urnband', '#5a4a3a');
        g.add(lathe([[0, 0], [0.07, 0], [0.1, 0.03], [0.16, 0.14], [0.18, 0.24], [0.14, 0.35], [0.075, 0.42], [0.062, 0.45], [0.088, 0.48], [0.07, 0.48], [0.05, 0.45]], clay, 14));
        g.add(lathe([[0.176, 0.2], [0.181, 0.23], [0.176, 0.26]], dark, 14));
        for (const s of [-1, 1]) { const h = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 5, 10, Math.PI), dark); h.position.set(s * 0.1, 0.39, 0); h.rotation.set(0, 0, s * -Math.PI / 2); g.add(h); }
        const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.06, 10), mat('urnin', '#2a2018')); mouth.rotation.x = -Math.PI / 2; mouth.position.y = 0.455; g.add(mouth);
        M.scenes.urn = g;
      }
      if (!M.scenes.sack) {
        const g = new THREE.Group(), cloth = mat('sacking', '#b8a47a'), tw = mat('twine', '#6a5236');
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 9), cloth); body.scale.set(1, 0.72, 0.9); body.position.y = 0.16; g.add(body);
        const neck = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.12, 8), cloth); neck.position.y = 0.3; neck.rotation.x = Math.PI; g.add(neck);
        const tie = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.025, 8), tw); tie.position.y = 0.3; g.add(tie);
        const top = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.06, 8), cloth); top.position.y = 0.33; g.add(top);
        M.scenes.sack = g;
      }
      if (!M.scenes.hay) {
        const g = new THREE.Group(), hay = mat('hay', '#c8a850'), end = mat('hayend', '#a8883a'), tw = mat('haytwine', '#8a6a3a');
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.6, 18, 1, true), hay); body.position.y = 0.3; g.add(body);
        for (const y of [0.002, 0.598]) { const e = new THREE.Mesh(new THREE.CircleGeometry(0.355, 18), end); e.rotation.x = y < 0.3 ? Math.PI / 2 : -Math.PI / 2; e.position.y = y; g.add(e); }
        for (const y of [0.15, 0.3, 0.45]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.364, 0.364, 0.018, 18, 1, true), tw); b.position.y = y; g.add(b); }
        M.scenes.hay = g;
      }
      if (!M.scenes.pumpkin) {
        const g = new THREE.Group(), pk = mat('pumpkin', '#d8721e'), st = mat('stem', '#5a6a30');
        const geo = new THREE.SphereGeometry(0.2, 16, 10), pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), a = Math.atan2(z, x), k = 1 + Math.cos(a * 8) * 0.06 * Math.sqrt(Math.max(0, 1 - (y / 0.2) * (y / 0.2))); pos.setXYZ(i, x * k, y * 0.75, z * k); }
        geo.computeVertexNormals();
        const body = new THREE.Mesh(geo, pk); body.position.y = 0.15; g.add(body);
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.026, 0.07, 6), st); stem.position.set(0.005, 0.32, 0); stem.rotation.z = 0.25; g.add(stem);
        M.scenes.pumpkin = g;
      }
      if (!M.scenes.stone) {
        const g = new THREE.Group(), sm = mat('looserock', '#8a847a');
        const geo = new THREE.IcosahedronGeometry(0.15, 1), pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), k = 0.85 + (Math.sin(x * 37.1 + y * 11.3) * 0.5 + 0.5) * 0.25; pos.setXYZ(i, x * k, y * k * 0.85, z * k); }
        geo.computeVertexNormals();
        const s = new THREE.Mesh(geo, sm); s.position.y = 0.13; g.add(s);
        M.scenes.stone = g;
      }
    },

    // ---------------------------------------------------------------- baking
    bake(name, colors) {
      colors = colors || {};
      const key = name + '|' + JSON.stringify(colors);
      if (M.baked[key]) return M.baked[key];
      const scene = M.scenes[name];
      if (!scene) return null;
      scene.updateMatrixWorld(true);
      const buckets = { base: [], glow: [], window: [] };
      scene.traverse(o => {
        if (!o.isMesh) return;
        const mname = o.material.name;
        const bucket = GLOW.has(mname) || mname === 'crystal' ? 'glow' : mname === 'window' ? 'window' : 'base';
        let g = o.geometry.clone();
        g.applyMatrix4(o.matrixWorld);
        if (g.index) g = g.toNonIndexed();
        const col = colors[mname] ? M.srgb(colors[mname]) : o.material.color;
        const n = g.attributes.position.count;
        const c = new Float32Array(n * 3);
        // Tiny per-face variation keeps large flat surfaces from looking plastic.
        for (let i = 0; i < n; i += 3) {
          const j = 1 + (((i * 2654435761) >>> 0) % 1000 / 1000 - 0.5) * 0.08;
          for (let k = 0; k < 3; k++) { c[(i + k) * 3] = col.r * j; c[(i + k) * 3 + 1] = col.g * j; c[(i + k) * 3 + 2] = col.b * j; }
        }
        buckets[bucket].push({ pos: g.attributes.position.array, nor: g.attributes.normal ? g.attributes.normal.array : null, col: c });
      });
      const merge = (list) => {
        if (!list.length) return null;
        let n = 0;
        for (const p of list) n += p.pos.length;
        const pos = new Float32Array(n), col = new Float32Array(n), nor = new Float32Array(n);
        let o = 0, haveN = list.every(p => p.nor);
        for (const p of list) { pos.set(p.pos, o); col.set(p.col, o); if (haveN) nor.set(p.nor, o); o += p.pos.length; }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        // the normals the model was made with: smooth where it is round, sharp at its creases
        if (haveN) g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); else g.computeVertexNormals();
        g.computeBoundingSphere();
        return g;
      };
      const res = { base: merge(buckets.base), glow: merge(buckets.glow), window: merge(buckets.window) };
      M.baked[key] = res;
      return res;
    },

    // ---------------------------------------------------------------- instances
    instance(name, colors) {
      const src = M.scenes[name];
      if (!src) return null;
      // a creature with a skeleton needs its own bones, not a copy pointing at the original's
      const root = src.userData.skinned && THREE.SkeletonUtils ? THREE.SkeletonUtils.clone(src) : src.clone(true);
      const parts = {};
      const mats = [];
      root.traverse(o => {
        if (o.name && !parts[o.name]) parts[o.name] = o;
        if (o.isMesh) {
          const base = o.material;
          const mname = base.name;
          let m;
          if (GLOW.has(mname)) {
            m = new THREE.MeshBasicMaterial({ color: base.color.clone() });
            m.color.multiplyScalar(1.4);
          } else {
            m = new THREE.MeshStandardMaterial({ color: base.color.clone(), roughness: Math.max(0.5, base.roughness || 0.85), metalness: ({ metal: 0.5, darkmetal: 0.45, gold: 0.6, iron: 0.4 })[mname] || 0, flatShading: false });
          }
          m.name = mname;
          if (colors && colors[mname]) m.color.copy(M.srgb(colors[mname]));
          const R3 = ECHO.Renderer3D;
          // a monster of its own shape: what it is made of drawn on it; ghost-stuff
          // drifts and shows through, crystal glows
          if (m.isMeshStandardMaterial && R3 && R3.surface && name.startsWith('m_') && R3.SURF[mname]) {
            if (mname === 'ghost' || mname === 'shroud') { m.transparent = true; m.opacity = 0.8; m.depthWrite = false; m.emissive = base.color.clone().multiplyScalar(0.25); m.userData.keep = true; }
            if (mname === 'crystal') { m.emissive = base.color.clone().multiplyScalar(0.5); m.roughness = 0.25; m.userData.keep = true; }
            R3.surface(m, R3.SURF[mname]);
          } else if (m.isMeshStandardMaterial && R3 && R3.detail) R3.detail(m, 0.1, 3.5);
          o.material = m;
          o.castShadow = true;
          o.receiveShadow = false;
          if (o.isSkinnedMesh) o.frustumCulled = false;   // (its bounds move with its bones)
          mats.push(m);
        }
      });
      return { root, parts, mats };
    },
    recolor(inst, mname, hex) {
      const c = M.srgb(hex);
      for (const m of inst.mats) if (m.name === mname) m.color.copy(c);
    },
    show(inst, part, on) {
      const p = inst.parts[part];
      if (p) p.visible = !!on;
    }
  };
})();
