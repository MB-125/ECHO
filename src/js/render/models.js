// Loads the Blender-built models and prepares them for the 3D renderer.
//  • bake(name, colors)  → merged, vertex-coloured geometries for instancing
//    static things (trees, buildings, crops). Glowing parts and windows are
//    kept in their own geometries so they can light up at night.
//  • instance(name)      → a full clone with its named parts, for animated
//    characters, creatures and bosses (each gets its own materials).
(function () {
  const GLOW = new Set(['glow', 'flame', 'eyeglow', 'rune']);

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
      M.ready = Object.keys(M.scenes).length > 0;
      if (!M.ready) M.failed = 'no models parsed';
      return M.ready;
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
        const bucket = GLOW.has(mname) ? 'glow' : mname === 'window' ? 'window' : 'base';
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
          if (m.isMeshStandardMaterial && ECHO.Renderer3D && ECHO.Renderer3D.detail) ECHO.Renderer3D.detail(m, 0.1, 3.5);
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
