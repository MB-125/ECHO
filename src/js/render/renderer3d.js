// 3D renderer (Three.js). Draws the living world with the Blender-built
// models: a sculpted, faceted landscape; instanced trees, crops and grass that
// change with the seasons (and visibly thin when vermin eat the fields);
// towns that wear their faction's colours and light their windows at night;
// animated people, beasts and bosses whose armour shows what they learned;
// a real sun and shadows, lanterns and campfires that light the dark, fog.
// The game logic is untouched — it is still a 2D world of tiles; this file
// only decides how it looks.
(function () {
  const { U } = ECHO;
  const T = ECHO.TIME;
  const TILE = ECHO.TILE;
  const CH = 16;              // chunk size in tiles
  const CHUNK_RADIUS = 2;     // chunks kept around the camera
  const MAX_LIGHTS = 8;       // point-light pool (constant count avoids shader recompiles)

  const C = hex => new THREE.Color(hex).convertSRGBToLinear();
  const lerpC = (a, b, t) => a.clone().lerp(b, U.clamp(t, 0, 1));
  const hash = (x, y, s) => ECHO.hash2(x, y, s);

  const SEASON = {
    grass: ['#5f8f40', '#4f8a3a', '#7d8a3c', '#9aa59c'],
    forest: ['#46703a', '#3c6a33', '#5c5c30', '#7e8c86'],
    oak: [['#6aa34a', '#4f8f3e'], ['#4d8a3c', '#3a6e30'], [['#c8702a', '#a8541f'], ['#d8a83a', '#b8862a']], ['#4f6a48', '#3f5a3a']],
    pine: ['#2f5c3a', '#2a5634', '#2f5236', '#8fa59a'],
    crop: [['#6fa142', '#5d8a3a', .55], ['#7ab248', '#5d9a3a', .85], ['#d6ad3a', '#e8c45a', 1.0], null]
  };

  function tileColor(t, season, x, y, seed) {
    switch (t) {
      case TILE.DEEP: return '#1a3554';
      case TILE.WATER: return '#56634a';
      case TILE.SAND: return '#d4bd88';
      case TILE.GRASS: return SEASON.grass[season];
      case TILE.FOREST: case TILE.TREE: return SEASON.forest[season];
      case TILE.HILL: return season === 3 ? '#b8c2c4' : '#7d7b58';
      case TILE.ROCK: return season === 3 && hash(x, y, seed) < 0.5 ? '#d8e0e4' : '#77736c';
      case TILE.FARM: return season === 3 ? '#7a6a58' : '#6b4d2c';
      case TILE.ROAD: return '#9a8460';
      case TILE.SWAMP: return '#43573c';
      case TILE.SNOW: return '#e6ecef';
      case TILE.RUIN: return '#7f7a71';
      case TILE.BRIDGE: return '#2c5878';
      case TILE.PLAZA: return '#8f897e';
      case TILE.RUINWALL: return '#6a665e';
      default: return '#ff00ff';
    }
  }
  const BASE_H = {
    [TILE.DEEP]: -0.75, [TILE.WATER]: -0.45, [TILE.SAND]: -0.04, [TILE.GRASS]: 0, [TILE.FOREST]: 0.03, [TILE.TREE]: 0.04,
    [TILE.HILL]: 0.45, [TILE.ROCK]: 1.7, [TILE.FARM]: -0.01, [TILE.ROAD]: -0.02, [TILE.SWAMP]: -0.08, [TILE.SNOW]: 0.55,
    [TILE.RUIN]: 0.02, [TILE.BRIDGE]: -0.45, [TILE.PLAZA]: 0.0, [TILE.RUINWALL]: 0.02
  };
  const FLAT = new Set([TILE.ROAD, TILE.PLAZA, TILE.BRIDGE, TILE.FARM, TILE.RUIN]);

  const R = ECHO.Renderer3D = {
    world: null, renderer: null, scene: null, camera: null, overlay: null, octx: null, dpr: 1, cw: 0, ch: 0,
    chunks: {}, views: new Map(), fxMeshes: new Map(), projMeshes: new Map(), lootMeshes: new Map(),
    camDist: 15, zoomExtra: 0, time: 0, sitesT: 0, frameNo: 0,

    supported() {
      try {
        const c = document.createElement('canvas');
        return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
      } catch (e) { return false; }
    },

    // ---------------------------------------------------------------- setup
    init(canvas) {
      R.canvas = canvas;
      const r = R.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
      r.outputEncoding = THREE.sRGBEncoding;
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.toneMappingExposure = 1.05;
      r.shadowMap.enabled = true;
      r.shadowMap.type = THREE.PCFSoftShadowMap;
      R.overlay = document.getElementById('overlay');
      R.octx = R.overlay.getContext('2d');
      const s = R.scene = new THREE.Scene();
      R.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 400);
      s.fog = new THREE.Fog('#a8c0d0', 20, 60);
      // Lights
      R.hemi = new THREE.HemisphereLight('#cfe2ff', '#3a3020', 0.6); s.add(R.hemi);
      R.sun = new THREE.DirectionalLight('#fff4e0', 1.2);
      R.sun.castShadow = true;
      R.sun.shadow.mapSize.set(2048, 2048);
      const sc = R.sun.shadow.camera;
      sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.near = 1; sc.far = 90;
      R.sun.shadow.bias = -0.0006;
      R.sun.shadow.normalBias = 0.03;
      s.add(R.sun); s.add(R.sun.target);
      R.moon = new THREE.DirectionalLight('#8aa4ff', 0.0); s.add(R.moon); s.add(R.moon.target);
      R.points = [];
      for (let i = 0; i < MAX_LIGHTS; i++) {
        const L = new THREE.PointLight('#ffb060', 0, 8, 1.6);
        s.add(L); R.points.push(L);
      }
      // Shared materials
      R.mat = {
        terrain: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true }),
        prop: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 }),
        glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
        window: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, emissive: new THREE.Color('#ffb860'), emissiveIntensity: 0 }),
        plank: new THREE.MeshStandardMaterial({ color: C('#7a5a36'), roughness: 0.9 }),
        loot: new THREE.MeshStandardMaterial({ color: C('#f2d47a'), emissive: C('#7a5a10'), roughness: 0.4, metalness: 0.4 })
      };
      // See-through versions for buildings that stand between the camera and the player.
      R.mat.propFade = R.mat.prop.clone(); R.mat.propFade.transparent = true; R.mat.propFade.opacity = 0.28; R.mat.propFade.depthWrite = false;
      R.mat.windowFade = R.mat.window.clone(); R.mat.windowFade.transparent = true; R.mat.windowFade.opacity = 0.28; R.mat.windowFade.depthWrite = false;
      R.groups = {};
      for (const g of ['terrain', 'props', 'towns', 'sites', 'room', 'ents', 'fx']) { R.groups[g] = new THREE.Group(); s.add(R.groups[g]); }
      R.ray = new THREE.Raycaster();
      R.v3 = new THREE.Vector3();
      R.initParticles();
      window.addEventListener('resize', R.resize);
      R.canvas.addEventListener('wheel', e => { R.zoomExtra = U.clamp(R.zoomExtra + Math.sign(e.deltaY) * 0.08, -0.35, 0.6); }, { passive: true });
      R.applyQuality();
    },
    // Graphics quality: how sharp, how far, how many lights and shadows.
    QUALITY: { low: { dpr: 0.7, chunk: 1, lights: 4, shadows: false, map: 512 }, medium: { dpr: 1, chunk: 2, lights: 6, shadows: true, map: 1024 }, high: { dpr: 1.5, chunk: 2, lights: 8, shadows: true, map: 2048 } },
    lightN: 8, chunkR: CHUNK_RADIUS,
    applyQuality() {
      const q = R.QUALITY[(ECHO.UI && ECHO.UI.settings.quality) || 'high'] || R.QUALITY.high;
      R.lightN = q.lights; R.chunkR = q.chunk; R.Q = q;
      if (!R.renderer) return;
      const was = R.renderer.shadowMap.enabled;
      R.renderer.shadowMap.enabled = q.shadows;
      if (R.sun) { R.sun.shadow.mapSize.set(q.map, q.map); if (R.sun.shadow.map) { R.sun.shadow.map.dispose(); R.sun.shadow.map = null; } }
      if (was !== q.shadows && R.scene) R.scene.traverse(o => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; });
      R.resize();
    },
    resize() {
      const q = R.QUALITY[(ECHO.UI && ECHO.UI.settings.quality) || 'high'] || R.QUALITY.high;
      R.dpr = Math.min(q.dpr, window.devicePixelRatio || 1);
      R.cw = Math.floor(window.innerWidth * R.dpr);
      R.ch = Math.floor(window.innerHeight * R.dpr);
      R.renderer.setPixelRatio(R.dpr);
      R.renderer.setSize(window.innerWidth, window.innerHeight, false);
      R.canvas.style.width = window.innerWidth + 'px'; R.canvas.style.height = window.innerHeight + 'px';
      R.overlay.width = R.cw; R.overlay.height = R.ch;
      R.overlay.style.width = window.innerWidth + 'px'; R.overlay.style.height = window.innerHeight + 'px';
      R.camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
      R.camera.updateProjectionMatrix();
      const zoomPref = (ECHO.UI && ECHO.UI.settings && ECHO.UI.settings.zoom) || 0;
      R.camDist = 15 * (1 + zoomPref * 0.15);
    },

    setWorld(world) {
      R.world = world;
      for (const k of Object.keys(R.chunks)) R.dropChunk(k);
      R.chunks = {};
      for (const g of ['towns', 'sites', 'ents', 'fx', 'room']) R.clear(R.groups[g]);
      R.roomKey = null;
      if (R.horses) for (const k of [...R.horses.keys()]) R.dropHorse(k); R.views.clear(); R.fxMeshes.clear(); R.projMeshes.clear(); R.lootMeshes.clear();
      R.towns = {};
      R.buildHeights(world);
      R.buildWater(world);
      R.sitesT = 0;
    },
    clear(group) {
      while (group.children.length) { const o = group.children[0]; group.remove(o); if (o.userData && o.userData.own && o.geometry) o.geometry.dispose(); }
    },

    // ---------------------------------------------------------------- heights
    buildHeights(world) {
      const W = world.W, H = world.H;
      const hc = R.hc = new Float32Array((W + 1) * (H + 1));
      for (let cy = 0; cy <= H; cy++) for (let cx = 0; cx <= W; cx++) {
        let s = 0, n = 0, flat = false, rocks = 0, wet = false;
        for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
          const t = ECHO.World.tile(world, cx + dx, cy + dy);
          s += BASE_H[t] != null ? BASE_H[t] : 0; n++;
          if (FLAT.has(t)) flat = true;
          if (t === TILE.ROCK) rocks++;
          if (t === TILE.WATER || t === TILE.DEEP || t === TILE.BRIDGE) wet = true;
        }
        let h = s / n;
        if (rocks === 4) h = 1.7 + hash(cx, cy, world.seed + 9) * 0.9;
        if (!flat && !wet) h += (hash(cx, cy, world.seed + 4) - 0.5) * (h > 0.3 ? 0.25 : 0.08);
        if (flat && !wet) h = Math.max(h, -0.03) * 0.5;
        hc[cy * (W + 1) + cx] = h;
      }
    },
    cornerH(cx, cy) {
      const W = R.world.W;
      cx = U.clamp(cx, 0, W); cy = U.clamp(cy, 0, R.world.H);
      return R.hc[cy * (W + 1) + cx];
    },
    groundH(x, y) {
      if (!R.hc || x >= 9000) return 0;
      const t = ECHO.World.tile(R.world, x, y);
      if (t === TILE.BRIDGE) return 0.05;
      const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
      const a = R.cornerH(ix, iy), b = R.cornerH(ix + 1, iy), c = R.cornerH(ix, iy + 1), d = R.cornerH(ix + 1, iy + 1);
      return Math.max(-0.05, U.lerp(U.lerp(a, b, fx), U.lerp(c, d, fx), fy));
    },

    // The real bed under water (groundH keeps the dry ground's floor).
    rawH(x, y) {
      if (!R.hc || x >= 9000) return 0;
      const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
      const a = R.cornerH(ix, iy), b = R.cornerH(ix + 1, iy), c = R.cornerH(ix, iy + 1), d = R.cornerH(ix + 1, iy + 1);
      return U.lerp(U.lerp(a, b, fx), U.lerp(c, d, fx), fy);
    },
    // Where something standing here has its feet: on the river bed when wading.
    standH(x, y) {
      if (!R.hc || x >= 9000) return 0;
      const t = ECHO.World.tile(R.world, x, y);
      if (t === TILE.WATER || t === TILE.DEEP) return Math.max(-0.62, Math.min(-0.05, R.rawH(x, y)));
      return R.groundH(x, y);
    },
    // ---------------------------------------------------------------- water
    buildWater(world) {
      if (R.water) { R.scene.remove(R.water); R.water.geometry.dispose(); }
      // depth under every vertex: clear and pale over the shallows, dark over the deeps, foam at the edge
      const step = R.Q && R.Q.map <= 512 ? 2 : 1;
      const g = new THREE.PlaneGeometry(world.W + 60, world.H + 60, Math.round((world.W + 60) / step), Math.round((world.H + 60) / step));
      const pos = g.attributes.position, depth = new Float32Array(pos.count);
      for (let i = 0; i < pos.count; i++) {
        const wx = pos.getX(i) + world.W / 2, wy = world.H / 2 - pos.getY(i);
        const inside = wx >= 0 && wy >= 0 && wx <= world.W && wy <= world.H;
        depth[i] = inside ? Math.max(0, -0.2 - R.rawH(wx, wy)) : 0.6;
      }
      g.setAttribute('aDepth', new THREE.BufferAttribute(depth, 1));
      const m = new THREE.MeshStandardMaterial({ color: C('#2e6a96'), roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.86, flatShading: true });
      R.waterTime = { value: 0 }; R.waterIce = { value: 0 };
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = R.waterTime; sh.uniforms.uIce = R.waterIce;
        sh.vertexShader = 'uniform float uTime;\nuniform float uIce;\nattribute float aDepth;\nvarying float vDepth;\nvarying vec2 vP;\n' + sh.vertexShader.replace('#include <begin_vertex>',
          '#include <begin_vertex>\n vDepth = aDepth; vP = position.xy;\n float calm = smoothstep(0.0, 0.25, aDepth) * (1.0 - min(1.0, uIce));\n transformed.z += (sin(position.x * 0.9 + uTime * 1.3) * 0.045 + cos(position.y * 1.1 + uTime * 1.1) * 0.045 + sin((position.x + position.y) * 2.3 + uTime * 2.6) * 0.012) * calm;');
        sh.fragmentShader = 'uniform float uTime;\nuniform float uIce;\nvarying float vDepth;\nvarying vec2 vP;\n' + sh.fragmentShader
          .replace('#include <color_fragment>', `#include <color_fragment>
            float dk = smoothstep(0.0, 0.5, vDepth);
            vec3 shallowC = vec3(0.16, 0.42, 0.46), deepC = vec3(0.04, 0.14, 0.26);
            diffuseColor.rgb = mix(shallowC, deepC, dk);
            float foam = (1.0 - smoothstep(0.0, 0.07, vDepth)) * (0.55 + 0.45 * sin(uTime * 1.7 + vP.x * 2.1 + vP.y * 1.7));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85, 0.92, 0.94), clamp(foam, 0.0, 1.0) * 0.75);
            diffuseColor.a = mix(0.45, 0.92, dk) + foam * 0.3;
            // winter ice: the shallows (or, in a bitter cold, everything) frozen white-blue, with cracks
            float ice = uIce > 1.5 ? 1.0 : uIce > 0.5 ? 1.0 - smoothstep(0.32, 0.5, vDepth) : 0.0;
            float brk = smoothstep(0.35, 0.7, sin(vP.x * 0.41 + vP.y * 0.23) * sin(vP.y * 0.37 - vP.x * 0.19) + 0.5);
            float crack = (smoothstep(0.992, 1.0, abs(sin(vP.x * 2.3 + sin(vP.y * 1.1) * 2.6))) + smoothstep(0.994, 1.0, abs(sin(vP.y * 1.9 + sin(vP.x * 0.9) * 3.1)))) * brk;
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.8, 0.88, 0.93) - crack * 0.12 + 0.03 * sin(vP.x * 0.7 + vP.y * 0.5), ice * 0.9);
            diffuseColor.a = mix(diffuseColor.a, 0.96, ice);`)
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
            // sun on the water: crossing wave trains, so the sparkle never sits in a grid
            float g1 = sin(dot(vP, vec2(6.3, 2.1)) + uTime * 2.1) * sin(dot(vP, vec2(-1.7, 5.9)) - uTime * 1.6);
            float g2 = 0.5 + 0.5 * sin(dot(vP, vec2(1.13, -0.71)) + uTime * 0.7) * sin(dot(vP, vec2(0.37, 0.93)) * 1.9 - uTime * 0.5);
            float glint = pow(max(0.0, g1), 18.0) * g2 * g2;
            totalEmissiveRadiance += vec3(0.6, 0.66, 0.7) * glint * smoothstep(0.05, 0.3, vDepth) * 0.45 * (1.0 - min(1.0, uIce));`);
      };
      const w = R.water = new THREE.Mesh(g, m);
      w.rotation.x = -Math.PI / 2;
      w.position.set(world.W / 2, -0.2, world.H / 2);
      w.receiveShadow = true;
      R.scene.add(w);
    },

    // ---------------------------------------------------------------- chunks
    chunkKey(world) { return world.day + '|' + (world._tileEpoch || 0); },
    updateChunks(game) {
      const world = game.world;
      const ccx = Math.floor(R.camTarget.x / CH), ccy = Math.floor(R.camTarget.z / CH);
      const epoch = R.chunkKey(world);
      const want = [];
      for (let dy = -R.chunkR; dy <= R.chunkR; dy++) for (let dx = -R.chunkR; dx <= R.chunkR; dx++) {
        const cx = ccx + dx, cy = ccy + dy;
        if (cx < 0 || cy < 0 || cx * CH >= world.W || cy * CH >= world.H) continue;
        want.push([cx, cy, dx * dx + dy * dy]);
      }
      want.sort((a, b) => a[2] - b[2]);
      const keep = new Set(want.map(w => w[0] + ',' + w[1]));
      for (const k of Object.keys(R.chunks)) if (!keep.has(k)) R.dropChunk(k);
      let budget = R.firstFrame ? 99 : 2;
      for (const [cx, cy] of want) {
        const k = cx + ',' + cy;
        const c = R.chunks[k];
        if (c && c.epoch === epoch) continue;
        if (budget-- <= 0) break;
        if (c) R.dropChunk(k);
        R.buildChunk(world, cx, cy, epoch);
      }
      R.firstFrame = false;
    },
    dropChunk(k) {
      const c = R.chunks[k];
      if (!c) return;
      for (const o of c.objs) { o.parent && o.parent.remove(o); if (o.geometry && o.userData.ownGeo) o.geometry.dispose(); if (o.dispose) o.dispose(); }
      delete R.chunks[k];
    },
    buildChunk(world, cx, cy, epoch) {
      const season = T.dateOf(world.day).seasonIdx;
      const objs = [];
      // --- ground
      const x0 = cx * CH, y0 = cy * CH, x1 = Math.min(world.W, x0 + CH), y1 = Math.min(world.H, y0 + CH);
      const ntile = (x1 - x0) * (y1 - y0);
      const pos = new Float32Array(ntile * 18), col = new Float32Array(ntile * 18);
      let o = 0;
      const tmp = new THREE.Color();
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const t = world.tiles[y * world.W + x];
        tmp.copy(C(tileColor(t, season, x, y, world.seed)));
        const jit = 0.9 + hash(x, y, world.seed + 2) * 0.2;
        tmp.multiplyScalar(jit);
        const a = R.cornerH(x, y), b = R.cornerH(x + 1, y), c2 = R.cornerH(x, y + 1), d = R.cornerH(x + 1, y + 1);
        const V = [[x, a, y], [x, c2, y + 1], [x + 1, b, y], [x + 1, b, y], [x, c2, y + 1], [x + 1, d, y + 1]];
        for (let i = 0; i < 6; i++) {
          pos[o] = V[i][0]; pos[o + 1] = V[i][1]; pos[o + 2] = V[i][2];
          const shade = i < 3 ? 1 : 0.97;
          col[o] = tmp.r * shade; col[o + 1] = tmp.g * shade; col[o + 2] = tmp.b * shade;
          o += 3;
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.computeVertexNormals();
      const ground = new THREE.Mesh(g, R.mat.terrain);
      ground.receiveShadow = true;
      ground.userData.ownGeo = true;
      R.groups.terrain.add(ground); objs.push(ground);
      // --- props, instanced per model+colours
      const sets = {};
      const add = (name, colors, x, y, s, rot, h) => {
        const key = name + '|' + JSON.stringify(colors || {});
        (sets[key] = sets[key] || { name, colors, list: [] }).list.push([x, y, s, rot, h]);
      };
      const regionOf = (x, y) => ECHO.World.regionAt(world, x, y);
      const oakCols = (v) => {
        const sc = SEASON.oak[season];
        if (season === 2) { const p = sc[v % 2]; return { leaves: p[0], leaves2: p[1] }; }
        return { leaves: sc[0], leaves2: sc[1] };
      };
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const t = world.tiles[y * world.W + x];
        const h1 = hash(x, y, world.seed + 31), h2 = hash(x, y, world.seed + 32), h3 = hash(x, y, world.seed + 33);
        const px = x + 0.5 + (h2 - 0.5) * 0.5, py = y + 0.5 + (h3 - 0.5) * 0.5;
        if (t === TILE.TREE) {
          const reg = regionOf(x, y);
          const pineLand = y < world.H * 0.3 || reg.hill > 0.12 || h1 < 0.18;
          const s = 0.95 + h2 * 0.45;
          if (pineLand) add('pine', { pine: SEASON.pine[season] }, px, py, s * 1.1, h1 * 6.28);
          else if (reg.swamp > 0.15 && h1 < 0.55) add('willow', { leaves: SEASON.forest[season], leaves2: SEASON.forest[season] }, px, py, s, h1 * 6.28);
          else if (season === 3 && h1 > 0.45) add('oakbare', null, px, py, s, h1 * 6.28);
          else add('oak', oakCols((h1 * 10) | 0), px, py, s, h1 * 6.28);
        } else if (t === TILE.FOREST) {
          if (h1 < 0.22) add('oak', oakCols((h1 * 10) | 0), px, py, 0.6 + h2 * 0.25, h1 * 6.28);
          else if (h1 < 0.55) add('bush', { leaves: SEASON.forest[season], leaves2: SEASON.forest[season] }, px, py, 0.8 + h2 * 0.5, h1 * 6.28);
          else if (h1 < 0.8) add('grass', { grass: SEASON.grass[season] }, px, py, 1.2, h1 * 6.28);
        } else if (t === TILE.GRASS) {
          if (h1 < 0.32) add('grass', { grass: SEASON.grass[season] }, px, py, 1 + h2 * 0.6, h1 * 6.28);
          else if (h1 < 0.335) add('rock', null, px, py, 0.5 + h2 * 0.4, h1 * 6.28);
          else if (h1 < 0.36) add('bush', { leaves: SEASON.forest[season], leaves2: SEASON.forest[season] }, px, py, 0.7, h1 * 6.28);
        } else if (t === TILE.SWAMP) {
          if (h1 < 0.55) add('reeds', null, px, py, 0.9 + h2 * 0.5, h1 * 6.28);
        } else if (t === TILE.HILL || t === TILE.SNOW) {
          if (h1 < 0.18) add('rock', season === 3 ? { rock: '#b8bec0' } : null, px, py, 0.8 + h2, h1 * 6.28);
          else if (h1 < 0.32 && t === TILE.HILL) add('grass', { grass: '#8a8a5a' }, px, py, 1, h1 * 6.28);
        } else if (t === TILE.ROCK) {
          if (h1 < 0.25) add('boulder', season === 3 ? { rock: '#c8cdd0' } : null, px, py, 0.9 + h2, h1 * 6.28);
        } else if (t === TILE.FARM) {
          const spec = SEASON.crop[season];
          if (!spec) continue;
          const crop = (regionOf(x, y).eco || {}).crop;
          const cf = crop == null ? 1 : crop;
          for (let k = 0; k < 3; k++) {
            const hk = hash(x * 3 + k, y * 7, world.seed + 5);
            if (hk > cf + 0.05) continue; // eaten by vermin
            add('crop', { crop: spec[0], straw: spec[1] }, x + 0.2 + k * 0.3, y + 0.25 + hash(x, y * 3 + k, world.seed) * 0.5, spec[2] * (0.85 + hk * 0.3), hk * 6.28);
          }
        } else if (t === TILE.RUINWALL) {
          add('ruinwall', null, x + 0.5, y + 0.5, 1, Math.floor(h1 * 4) * Math.PI / 2);
        } else if (t === TILE.RUIN) {
          const nearRuin = world.ruins.some(r => Math.abs(r.x - x) <= 6 && Math.abs(r.y - y) <= 5);
          if (nearRuin && h1 < 0.06) add('pillar', null, px, py, 0.9, h1 * 60);
          else if (h1 < 0.08) add('rock', null, px, py, 0.4, h1 * 60);
        }
      }
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
      for (const k of Object.keys(sets)) {
        const set = sets[k];
        const baked = ECHO.Models.bake(set.name, set.colors);
        if (!baked) continue;
        for (const part of ['base', 'glow']) {
          const geo = baked[part];
          if (!geo) continue;
          const im = new THREE.InstancedMesh(geo, part === 'glow' ? R.mat.glow : R.mat.prop, set.list.length);
          set.list.forEach((it, i) => {
            q.setFromAxisAngle(up, it[3]);
            sv.setScalar(it[2]);
            pv.set(it[0], R.groundH(it[0], it[1]) - 0.03, it[1]);
            m4.compose(pv, q, sv);
            im.setMatrixAt(i, m4);
          });
          im.instanceMatrix.needsUpdate = true;
          im.castShadow = part === 'base' && set.name !== 'grass' && set.name !== 'crop' && set.name !== 'reeds';
          im.receiveShadow = true;
          im.frustumCulled = false;
          R.groups.props.add(im); objs.push(im);
        }
      }
      // --- bridges
      const planks = [];
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (world.tiles[y * world.W + x] === TILE.BRIDGE) planks.push([x, y]);
      if (planks.length) {
        const im = new THREE.InstancedMesh(R.plankGeo || (R.plankGeo = new THREE.BoxGeometry(1.02, 0.12, 1.02)), R.mat.plank, planks.length);
        planks.forEach(([x, y], i) => { m4.makeTranslation(x + 0.5, 0.0, y + 0.5); im.setMatrixAt(i, m4); });
        im.castShadow = true; im.receiveShadow = true;
        R.groups.props.add(im); objs.push(im);
      }
      R.chunks[cx + ',' + cy] = { epoch, objs };
    },

    // ---------------------------------------------------------------- towns
    ROOF: { valdren: ['#4a5a78', '#6f8fc4'], ashmere: ['#9a4a35', '#5fae84'], lantern: ['#b08a3a', '#e6c06a'], ashfang: ['#5a3a2a', '#d0563c'] },
    MODEL_OF: { house: 'house', inn: 'inn', market: 'market', smithy: 'smithy', board: 'board', shrine: 'shrine', archive: 'archive', keep: 'keep', temple: 'temple', well: 'well', lamp: 'lamp', statue: 'statue', mill: 'mill', mine: 'mine', lumber: 'lumber', stocks: 'stocks' },
    updateTowns(game) {
      const world = game.world;
      for (const s of world.settlements) {
        const d = U.dist(s.x, s.y, R.camTarget.x, R.camTarget.z);
        const fac = world.factions[s.faction];
        const key = [s.faction, fac ? fac.tech.era : 0, s.buildings.length, s.buildings.filter(b => b.legend).length, s.buildings.filter(b => b.fac).map(b => b.fac.state[0]).join(''), s.works && s.works.walls ? 'W' : ''].join('|');
        const cur = R.towns[s.id];
        if (d > 48) { if (cur) { R.groups.towns.remove(cur.group); delete R.towns[s.id]; } continue; }
        if (cur && cur.key === key) continue;
        if (cur) R.groups.towns.remove(cur.group);
        const group = new THREE.Group();
        const roof = R.ROOF[s.faction] || R.ROOF.valdren;
        const lamps = [], sails = [], smokes = [];
        for (const b of s.buildings) {
          const name = R.MODEL_OF[b.type];
          if (!name) continue;
          const colors = { roof: b.legend && b.type === 'house' ? '#5a5a6e' : roof[0], banner: roof[1] };
          const lost = b.fac && (b.fac.state === 'burned' || b.fac.state === 'ruined');
          if (lost) Object.assign(colors, { wood: '#2a221c', darkwood: '#1c1814', plaster: '#3e3832', roof: '#24201d', canvas: '#3a3632', trunk: '#2a2018', stone: '#4a4640', rock: '#5a5650' });
          if (b.fac) smokes.push({ x: b.x + b.w / 2, y: b.y + b.h / 2, lost, kind: b.type, b });
          else if (b.type === 'house' || b.type === 'inn' || b.type === 'smithy') smokes.push({ x: b.x + b.w * 0.68, y: b.y + b.h * 0.4, chim: true, kind: b.type, b });
          if (b.type === 'mill' && !lost) {
            // the mill gets a live model so its sails can turn
            const inst = ECHO.Models.instance('mill', { roof: roof[0] });
            if (inst) {
              const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
              inst.root.position.set(cx, R.groundH(cx, cy), cy);
              inst.root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
              group.add(inst.root);
              sails.push({ inst, b });
              continue;
            }
          }
          if (b.type === 'lamp' && fac && fac.tech.era >= 4) colors.glow = fac.tech.path === 'arcane' ? '#bfe8ff' : '#fff0a0';
          if (fac && fac.tech.era >= 2 && (b.type === 'house' || b.type === 'inn')) colors.wall = '#b8b0a2';
          const baked = ECHO.Models.bake(name, colors);
          if (!baked) continue;
          const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
          const gy = R.groundH(cx, cy);
          for (const part of ['base', 'glow', 'window']) {
            if (!baked[part]) continue;
            const mesh = new THREE.Mesh(baked[part], part === 'base' ? R.mat.prop : part === 'glow' ? R.mat.glow : R.mat.window);
            mesh.position.set(cx, gy, cy);
            mesh.castShadow = part === 'base';
            mesh.receiveShadow = true;
            mesh.userData.occ = { x: cx, y: cy, w: b.w, h: b.h, part, tall: b.type === 'keep' || b.type === 'temple' ? 6 : b.type === 'inn' || b.type === 'archive' ? 4 : 3 };
            group.add(mesh);
          }
          if (b.type === 'lamp') lamps.push({ x: cx, y: cy, era: fac ? fac.tech.era : 0, arcane: fac && fac.tech.path === 'arcane' });
        }
        // a palisade, once the crown has paid for one: a ring of sharpened stakes with gaps for the roads
        if (s.works && s.works.walls) {
          const rad = s.kind === 'capital' ? 17 : 14.5, n = Math.round(rad * 2 * Math.PI / 0.55);
          const geo = new THREE.CylinderGeometry(0.09, 0.13, 1.9, 5); geo.translate(0, 0.95, 0);
          const mat = new THREE.MeshStandardMaterial({ color: C('#6a4a2c'), roughness: 0.95, flatShading: true });
          const im = new THREE.InstancedMesh(geo, mat, n);
          const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), pos = new THREE.Vector3();
          let k = 0;
          for (let i = 0; i < n; i++) {
            const a = i / n * Math.PI * 2, x = s.x + Math.cos(a) * rad, y = s.y + Math.sin(a) * rad;
            const t = ECHO.World.tile(world, x, y);
            if (t === TILE.ROAD || t === TILE.BRIDGE || t === TILE.WATER || t === TILE.DEEP || ECHO.World.isSolid(world, x, y)) continue;
            q.setFromAxisAngle(R.v3.set(Math.sin(a), 0, -Math.cos(a)), 0.12 * ((i % 2) - 0.5));
            sc.set(1, 0.85 + ((i * 7) % 5) * 0.06, 1);
            m4.compose(pos.set(x, R.groundH(x, y), y), q, sc);
            im.setMatrixAt(k++, m4);
          }
          im.count = k; im.castShadow = true; im.receiveShadow = true;
          group.add(im);
        }
        R.groups.towns.add(group);
        R.towns[s.id] = { key, group, lamps, sails, smokes };
      }
    },

    // ---------------------------------------------------------------- sites (camps, lairs, ruins…)
    addStatic(group, name, x, y, colors, rot = 0, scale = 1, list) {
      const baked = ECHO.Models.bake(name, colors);
      if (!baked) return null;
      const gy = R.groundH(x, y);
      let first = null;
      for (const part of ['base', 'glow', 'window']) {
        if (!baked[part]) continue;
        const mesh = new THREE.Mesh(baked[part], part === 'base' ? R.mat.prop : part === 'glow' ? R.mat.glow : R.mat.window);
        mesh.position.set(x, gy, y);
        mesh.rotation.y = rot;
        mesh.scale.setScalar(scale);
        mesh.castShadow = part === 'base';
        mesh.receiveShadow = true;
        group.add(mesh);
        if (part === 'glow' && list) list.push(mesh);
        first = first || mesh;
      }
      return first;
    },
    updateSites(game, dt) {
      R.sitesT -= dt;
      if (R.sitesT > 0) return;
      R.sitesT = 0.5;
      const world = game.world, g = R.groups.sites;
      R.clear(g);
      R.flames = [];
      R.siteLights = [];
      const near = (x, y, r = 40) => Math.abs(x - R.camTarget.x) < r && Math.abs(y - R.camTarget.z) < r;
      for (const c of world.camps) {
        if (!near(c.x, c.y)) continue;
        if (!c.alive && !c.captives.length) { R.addStatic(g, 'campfire', c.x, c.y, { flame: '#2a2a2a', glow: '#3a3a3a' }); continue; }
        const tents = [[-2.5, -1.5], [2, -2.2], [-2.8, 2], [2.4, 2.2]];
        tents.forEach(([dx, dy], i) => R.addStatic(g, 'tent', c.x + dx, c.y + dy, { tent: ['#8a3a2a', '#6a4a3a', '#7a5a3a', '#5a3a2a'][i] }, Math.atan2(dy, dx) + Math.PI / 2));
        R.addStatic(g, 'campfire', c.x, c.y, null, 0, 1, R.flames);
        R.siteLights.push({ x: c.x, y: c.y, r: 7, a: 1.2, color: '#ff9a4a', h: 0.8 });
        if (c.captives.length) R.addStatic(g, 'cage', c.x + 2.5, c.y - 1.2, null);
      }
      for (const l of world.lairs) {
        if (!near(l.x, l.y)) continue;
        for (const r of l.rocks) if (r.hp > 0) R.addStatic(g, 'boulder', r.x + 0.5, r.y + 0.5, null, r.x * 1.3, r.hp < 40 ? 0.8 : 1.15);
        for (let i = 0; i < 5; i++) R.addStatic(g, 'rock', l.x + Math.cos(i * 2.1) * 6, l.y + Math.sin(i * 2.1) * 6, { rock: '#e2dccb', darkstone: '#cfc7b4' }, i, 0.35);
      }
      for (const r of world.ruins) {
        if (!near(r.x, r.y)) continue;
        const tab = world.lang && world.lang.tablets[r.tablet];
        const lit = tab && tab.key && world.lang.vault && world.lang.vault.revealed;
        R.addStatic(g, 'tablet', r.x + 0.5, r.y - 1, { rune: lit ? '#9fd3ff' : '#4a4740' });
        if (lit) R.siteLights.push({ x: r.x + 0.5, y: r.y - 1.4, r: 4, a: 0.8, color: '#9fd3ff', h: 1.2 });
        if (r.relics.length) { R.addStatic(g, 'rock', r.x + 3, r.y + 1, null, 0, 0.7); R.siteLights.push({ x: r.x + 3, y: r.y + 1, r: 2.5, a: 0.6 + Math.sin(R.time * 3) * 0.2, color: '#fff2c0', h: 0.6 }); }
      }
      for (const st of world.structures) {
        if (!near(st.x, st.y)) continue;
        if (st.type === 'vaultstone') R.addStatic(g, 'vaultstone', st.x + 0.5, st.y + 0.5, { rune: world.lang.vault.revealed ? '#9fd3ff' : '#3e3e46' });
        if (st.type === 'vaultopen') {
          const hole = new THREE.Mesh(new THREE.CircleGeometry(0.7, 12), new THREE.MeshBasicMaterial({ color: '#05050a' }));
          hole.rotation.x = -Math.PI / 2; hole.position.set(st.x + 0.5, R.groundH(st.x + 0.5, st.y + 0.5) + 0.03, st.y + 0.5);
          g.add(hole);
          R.siteLights.push({ x: st.x + 0.5, y: st.y + 0.5, r: 3, a: 0.7, color: '#9fd3ff', h: 0.3 });
        }
      }
      // landmarks and delves
      R._siteMats = R._siteMats || {};
      const mesh = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.userData.own = true; return m; };
      const basic = (c, o = 1) => R._siteMats[c + o] || (R._siteMats[c + o] = new THREE.MeshBasicMaterial({ color: c, transparent: o < 1, opacity: o, side: THREE.DoubleSide }));
      for (const s of (ECHO.Explore ? ECHO.Explore.sites(world) : [])) {
        if (!near(s.x, s.y)) continue;
        const add = (name, dx, dy, colors, rot = 0, sc = 1) => R.addStatic(g, name, s.x + dx, s.y + dy, colors, rot, sc);
        const disc = (dx, dy, r, c, o) => { const m = mesh(new THREE.CircleGeometry(r, 18), basic(c, o)); m.rotation.x = -Math.PI / 2; m.position.set(s.x + dx, R.groundH(s.x + dx, s.y + dy) + 0.05, s.y + dy); g.add(m); };
        const hole = (dx, dy, r = 0.6) => { const m = mesh(new THREE.CircleGeometry(r, 12), basic('#05050a')); m.rotation.x = -Math.PI / 2; m.position.set(s.x + dx, R.groundH(s.x + dx, s.y + dy) + 0.04, s.y + dy); g.add(m); };
        switch (s.kind) {
          case 'stones': for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; add('pillar', Math.cos(a) * 2.3, Math.sin(a) * 2.3, { stone: '#8a867c' }, a, 0.85 + (i % 3) * 0.08); } add('tablet', 0, 0, { rune: '#4a4740' }); break;
          case 'lookout': add('boulder', -0.8, 0.2, null, 1, 1.2); add('boulder', 0.9, -0.2, null, 2, 0.9); add('standard', 0, -0.6, { banner: '#c8a85a' }, 0, 1); break;
          case 'moonwell': add('well', 0, 0, { stone: '#a8b8c8', glow: '#9fd3ff' }, 0, 1.2); break;
          case 'oak': add('oak', 0, 0, null, 1.3, 2.6); break;
          case 'battlefield': for (let i = 0; i < 7; i++) add('rock', Math.cos(i * 2.2) * 2.2, Math.sin(i * 1.7) * 1.8, { rock: '#e2dccb', darkstone: '#cfc7b4' }, i, 0.3); add('standard', 0.5, 0.3, { banner: '#5a2a22' }, 0.4, 0.9); add('rack', -1, -0.8, null, 0.7, 0.8); break;
          case 'wayshrine': add('shrine', 0, 0, null, 0, 0.42); R.siteLights.push({ x: s.x, y: s.y + 0.4, r: 3, a: 0.8, color: '#ffc070', h: 0.8 }); break;
          case 'wreck': add('cart', 0, 0, { wood: '#4a3a2a' }, 2.4, 1.1); add('barrel', 1.2, 0.6, null, 0, 0.9); add('crate', -1, 0.8, null, 0.4, 0.9); break;
          case 'barrow': add('boulder', -1.4, -0.6, { rock: '#6a7a5a', darkstone: '#5a6a4a' }, 0, 1.8); add('boulder', 1.4, -0.6, { rock: '#6a7a5a', darkstone: '#5a6a4a' }, 2, 1.8); add('pillar', -0.6, 0.2, null, 0, 0.8); add('pillar', 0.6, 0.2, null, 0, 0.8); hole(0, 0.4, 0.5); break;
          case 'cave': add('boulder', -1.3, -0.4, null, 0, 1.6); add('boulder', 1.3, -0.4, null, 2, 1.5); add('boulder', 0, -1.2, null, 1, 1.7); hole(0, 0.2, 0.7); add('rock', 1.6, 0.9, { rock: '#e2dccb', darkstone: '#cfc7b4' }, 0, 0.3); break;
          case 'hideout': add('crate', -1, 0, null, 0.3, 1); add('crate', -1.1, 0.9, null, 1.2, 0.8); add('barrel', 1, 0.2, null, 0, 1); add('tent', 0.2, -1.4, { tent: '#4a4038' }, 0, 0.8); hole(0.1, 0.6, 0.45); break;
          case 'crypt': add('ruinwall', -1.2, -0.5, null, 0, 0.9); add('ruinwall', 1.2, -0.5, null, Math.PI, 0.9); add('pillar', -0.7, 0.3, null, 0, 0.7); add('pillar', 0.7, 0.3, null, 0, 0.7); hole(0, 0.3, 0.55); break;
          case 'catacomb': {
            add('ruinwall', -1.5, -0.8, null, 0, 1.1); add('ruinwall', 1.5, -0.8, null, Math.PI, 1.1); add('pillar', -0.8, 0.4, null, 0, 1); add('pillar', 0.8, 0.4, null, 0, 1);
            for (let i = 0; i < 5; i++) add('rock', -1.8 + i * 0.9, 1.4, { rock: '#e2dccb', darkstone: '#cfc7b4' }, i, 0.28);
            hole(0, 0.2, 0.65); R.siteLights.push({ x: s.x, y: s.y + 0.2, r: 3, a: 0.6, color: '#9fe8c8', h: 0.4 }); break;
          }
          case 'warren': {
            add('boulder', -1.5, -0.6, { rock: '#7a6a4a', darkstone: '#6a5a3a' }, 0, 1.4); add('boulder', 1.4, -0.9, { rock: '#7a6a4a', darkstone: '#6a5a3a' }, 2, 1.3);
            hole(0, 0.2, 0.6); hole(-1.8, 1, 0.35); hole(1.7, 0.9, 0.3);
            add('standard', 1, 0.6, { banner: '#5a7a2a' }, 0.3, 0.8); add('rack', -1, 1.1, null, 1, 0.7); R.addStatic(g, 'campfire', s.x + 0.2, s.y + 1.8, null, 0, 0.7, R.flames);
            R.siteLights.push({ x: s.x + 0.2, y: s.y + 1.8, r: 4, a: 0.9, color: '#ff9a4a', h: 0.6 }); break;
          }
          case 'nest': {
            add('boulder', -1.3, -0.5, null, 0, 1.6); add('boulder', 1.3, -0.5, null, 2, 1.5); add('boulder', 0, -1.3, null, 1, 1.7); hole(0, 0.2, 0.7);
            const wm = basic('#f4f4ff', 0.45);
            for (let i = 0; i < 4; i++) { const m = mesh(new THREE.CircleGeometry(0.7 + i * 0.15, 7), wm); m.position.set(s.x + (i - 1.5) * 0.7, R.groundH(s.x, s.y) + 0.7 + (i % 2) * 0.4, s.y - 0.1 + (i % 2) * 0.3); m.rotation.y = i * 0.7; g.add(m); }
            disc(0, 0.9, 1.6, '#eef0ff', 0.25); break;
          }
          case 'trollden': {
            add('boulder', -1.9, -0.7, null, 0, 2.4); add('boulder', 1.9, -0.7, null, 2, 2.3); add('boulder', 0, -1.9, null, 1, 2.6); hole(0, 0.1, 0.95);
            for (let i = 0; i < 6; i++) add('rock', Math.cos(i * 1.9) * 2.4, 1 + Math.sin(i * 1.3) * 0.8, i % 2 ? { rock: '#e2dccb', darkstone: '#cfc7b4' } : null, i, 0.35 + (i % 3) * 0.12); break;
          }
          case 'sanctum': {
            add('ruinwall', -1.4, -0.6, { stone: '#4a4458' }, 0, 1); add('ruinwall', 1.4, -0.6, { stone: '#4a4458' }, Math.PI, 1); add('pillar', -0.7, 0.4, { stone: '#5a5468' }, 0, 1.1); add('pillar', 0.7, 0.4, { stone: '#5a5468' }, 0, 1.1);
            add('candles', 0, 1.2, null, 0, 1); disc(0, 0.2, 1.4, '#3a2a5a', 0.6); hole(0, 0.2, 0.55);
            R.siteLights.push({ x: s.x, y: s.y + 0.4, r: 3.5, a: 0.8, color: '#b48aff', h: 0.6 }); break;
          }
          case 'forge': {
            add('boulder', -1.7, -0.9, { rock: '#5a5458', darkstone: '#3a3438' }, 0, 2.2); add('boulder', 1.7, -0.9, { rock: '#5a5458', darkstone: '#3a3438' }, 2, 2.1);
            add('pillar', -0.8, 0.2, { stone: '#3a3438' }, 0, 1.2); add('pillar', 0.8, 0.2, { stone: '#3a3438' }, 0, 1.2); add('anvil', 1.4, 1.2, null, 0.5, 1);
            const door = mesh(new THREE.PlaneGeometry(1.3, 1.7), basic('#1a1414')); door.position.set(s.x, R.groundH(s.x, s.y) + 0.85, s.y - 0.1); g.add(door);
            disc(0, 0.7, 0.9, '#ff7a2a', 0.35); R.siteLights.push({ x: s.x, y: s.y + 0.6, r: 4, a: 1, color: '#ff7a2a', h: 0.5 }); break;
          }
          // natural wonders
          case 'falls': {
            add('boulder', -1.6, -1.4, null, 0, 2.2); add('boulder', 1.6, -1.4, null, 2, 2.1); add('boulder', 0, -2.2, null, 1, 2.4);
            const sheet = mesh(new THREE.PlaneGeometry(1.6, 2.6), basic('#dff2ff', 0.75)); sheet.position.set(s.x, R.groundH(s.x, s.y) + 1.3, s.y - 1.15); g.add(sheet);
            disc(0, 0.2, 1.5, '#3f8fb0', 0.9); break;
          }
          case 'springs': {
            for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; add('rock', Math.cos(a) * 1.6, Math.sin(a) * 1.2, null, a, 0.55); }
            disc(0, 0, 1.3, '#5fb8b0', 0.95); disc(0.2, 0.1, 0.6, '#9fe0d8', 0.6); break;
          }
          case 'grotto': {
            add('boulder', -1.4, -0.6, null, 0, 1.7); add('boulder', 1.3, -0.7, null, 2, 1.6); add('boulder', 0, -1.4, null, 1, 1.8); hole(0, 0.1, 0.55);
            for (let i = 0; i < 6; i++) { const c = mesh(new THREE.ConeGeometry(0.12 + (i % 3) * 0.04, 0.6 + (i % 3) * 0.25, 5), basic(i % 2 ? '#8ff0ff' : '#c8f8ff', 0.9)); const a = i * 1.1; c.position.set(s.x + Math.cos(a) * 0.9, R.groundH(s.x, s.y) + 0.3, s.y + 0.5 + Math.sin(a) * 0.35); c.rotation.z = (i - 2.5) * 0.15; g.add(c); }
            R.siteLights.push({ x: s.x, y: s.y + 0.4, r: 3.5, a: 0.7, color: '#8ff0ff', h: 0.6 }); break;
          }
          case 'bones': {
            const bone = basic('#ece4d0');
            for (let i = 0; i < 6; i++) { const r = mesh(new THREE.TorusGeometry(1.5 - Math.abs(i - 2.5) * 0.18, 0.09, 6, 14, Math.PI), bone); r.position.set(s.x - 2 + i * 0.75, R.groundH(s.x, s.y), s.y); r.rotation.y = Math.PI / 2; g.add(r); }
            const sk = mesh(new THREE.SphereGeometry(0.75, 10, 8), bone); sk.position.set(s.x + 2.8, R.groundH(s.x, s.y) + 0.45, s.y + 0.2); sk.scale.set(1.3, 0.9, 1); g.add(sk); break;
          }
          case 'crater': {
            disc(0, 0, 2.6, '#3a332c', 0.95); disc(0, 0, 1.8, '#2a2420', 0.95);
            for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; add('rock', Math.cos(a) * 2.8, Math.sin(a) * 2.2, null, a, 0.45); }
            if (!Object.keys(s.used).length) { const c = mesh(new THREE.OctahedronGeometry(0.28), basic('#fff0c0')); c.position.set(s.x, R.groundH(s.x, s.y) + 0.3, s.y); g.add(c); R.siteLights.push({ x: s.x, y: s.y, r: 3, a: 0.7, color: '#ffe0a0', h: 0.5 }); }
            break;
          }
          case 'ring': {
            const stem = basic('#e8e0d0'), cap = basic('#d8d0e8');
            for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; const x = s.x + Math.cos(a) * 1.9, y = s.y + Math.sin(a) * 1.9, h = R.groundH(x, y);
              const st = mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.25, 5), stem); st.position.set(x, h + 0.12, y); g.add(st);
              const c = mesh(new THREE.SphereGeometry(0.14, 7, 5, 0, Math.PI * 2, 0, Math.PI / 2), cap); c.position.set(x, h + 0.24, y); g.add(c); }
            break;
          }
        }
      }
      // hidden caches: cairns, hollow trees, loose stones
      for (const c of world.caches || []) {
        if (!near(c.x, c.y, 30)) continue;
        const add = (name, dx, dy, colors, rot = 0, sc = 1) => R.addStatic(g, name, c.x + dx, c.y + dy, colors, rot, sc);
        if (c.kind === 'cairn') { add('rock', 0, 0, null, 0, 0.5); add('rock', 0.05, 0, null, 1, 0.38); add('rock', 0, 0.02, null, 2, 0.26); }
        else if (c.kind === 'hollow') { const t = mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.9, 8), basic('#5a4028')); t.position.set(c.x, R.groundH(c.x, c.y) + 0.45, c.y); g.add(t); const h2 = mesh(new THREE.CircleGeometry(0.2, 8), basic('#120c08')); h2.position.set(c.x, R.groundH(c.x, c.y) + 0.45, c.y + 0.51); g.add(h2); }
        else for (let i = 0; i < 5; i++) add('rock', Math.cos(i * 2.4) * 0.45, Math.sin(i * 2.4) * 0.3, null, i, 0.22);
        if (c.found && c.kind !== 'hollow') add('rock', 0.6, 0.3, null, 3, 0.2);
      }
      const EX = world.expedition;
      if (EX && EX.camp && near(EX.camp.x, EX.camp.y, 30)) {
        R.addStatic(g, 'campfire', EX.camp.x, EX.camp.y, { flame: '#2a2a2a', glow: '#3a3a3a' });
        R.addStatic(g, 'tent', EX.camp.x - 1.6, EX.camp.y - 1.2, { tent: '#6a6050' }, 0.6, 0.85);
        R.addStatic(g, 'crate', EX.camp.x + 1.4, EX.camp.y - 0.6, null, 0.3, 0.8);
      }
      if (world.rift && near(world.rift.x, world.rift.y)) {
        R.rift = R.addStatic(g, 'rift', world.rift.x + 0.5, world.rift.y + 0.5, { rune: '#c8a8ff' }, 0, 1.2);
        R.siteLights.push({ x: world.rift.x + 0.5, y: world.rift.y + 0.5, r: 8, a: 1.4, color: '#b48aff', h: 1.6 });
      }
    },

    // ---------------------------------------------------------------- interiors
    // Rooms are built from their layout: a tiled floor, walls (the south wall
    // kept low so the camera can see in), windows that follow the daylight,
    // and Blender-built furniture.
    FLOORS: {
      wood: (x, y) => { const plank = (y * 3 + ((x + (y % 2) * 0.5) / 2.5 | 0)) * 7919 % 100 / 100; return ['#7a5634', '#6e4c2e', '#835c38', '#73512f'][(plank * 4) | 0]; },
      stone: (x, y) => ['#6f6a62', '#77726a', '#68635c', '#7d776d'][((x * 31 + y * 17) * 2654435761 >>> 0) % 4],
      marble: (x, y) => ((x + y) % 2 ? '#d8d2c6' : '#bfb7a8'),
      cave: (x, y) => ['#4a443c', '#524b42', '#453f37', '#5a5246'][((x * 37 + y * 11) * 2654435761 >>> 0) % 4],
      crypt: (x, y) => ['#55524c', '#5d5a53', '#4e4b45', '#625e56'][((x * 31 + y * 17) * 2654435761 >>> 0) % 4]
    },
    WALLS: { plaster: ['#cbb894', '#5a3e26'], stone: ['#7c766c', '#5a554e'], marble: ['#e0d9cc', '#a89e8c'], rock: ['#5a544a', '#3e3a33'] },
    // A dungeon floor cut from the rock: floor only where it is open, walls
    // where rock meets air (low on the side facing the camera), and the traps.
    buildCarved(game, L, g, B) {
      const W = L.W, H = L.H, bl = L.blocked;
      const isOpen = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !bl[y * W + x];
      const solidRock = (x, y) => x < 0 || y < 0 || x >= W || y >= H || L.rock[y * W + x];
      const tmp = new THREE.Color();
      const quads = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!L.rock[y * W + x]) quads.push([x, y]);
      const pos = new Float32Array(quads.length * 18), col = new Float32Array(quads.length * 18);
      let o = 0;
      const lord = L.lordRoom, tre = L.treasureRoom;
      for (const [x, y] of quads) {
        const inR = r => r && x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1;
        tmp.set(inR(lord) ? R.FLOORS[L.floor === 'cave' ? 'stone' : 'marble'](x, y) : inR(tre) ? R.FLOORS.stone(x, y) : R.FLOORS[L.floor](x, y)).convertSRGBToLinear();
        const j = 0.94 + ((x * 13 + y * 7) % 5) * 0.03;
        const X = B + x;
        for (const [qx, qy] of [[X, y], [X, y + 1], [X + 1, y], [X + 1, y], [X, y + 1], [X + 1, y + 1]]) { pos[o] = qx; pos[o + 1] = 0; pos[o + 2] = qy; col[o] = tmp.r * j; col[o + 1] = tmp.g * j; col[o + 2] = tmp.b * j; o += 3; }
      }
      const fg = new THREE.BufferGeometry();
      fg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); fg.setAttribute('color', new THREE.BufferAttribute(col, 3)); fg.computeVertexNormals();
      const floor = new THREE.Mesh(fg, R.mat.terrain); floor.receiveShadow = true; floor.userData.own = true; g.add(floor);
      const [wc, tc] = R.WALLS[L.wall] || R.WALLS.stone;
      const wallMat = new THREE.MeshStandardMaterial({ color: C(wc).multiplyScalar(1.25), roughness: 0.92, flatShading: true });
      const capMat = new THREE.MeshStandardMaterial({ color: C(tc), roughness: 0.9 });
      // walls: rock touching open floor; merged along each row
      for (let y = 0; y < H; y++) {
        let run = null;
        const flush = () => { if (!run) return; const w = run.x1 - run.x0 + 1, h = run.h; const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1), wallMat); m.position.set(B + run.x0 + w / 2, h / 2, y + 0.5); m.castShadow = true; m.receiveShadow = true; m.userData.own = true; g.add(m); const cap = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, 1.02), capMat); cap.position.set(B + run.x0 + w / 2, h + 0.04, y + 0.5); cap.userData.own = true; g.add(cap); run = null; };
        for (let x = 0; x < W; x++) {
          let wall = false;
          if (solidRock(x, y)) for (let dy = -1; dy <= 1 && !wall; dy++) for (let dx = -1; dx <= 1; dx++) if (!solidRock(x + dx, y + dy)) { wall = true; break; }
          if (!wall) { flush(); continue; }
          const h = !solidRock(x, y - 1) ? 0.45 : 1.15 + ((x * 7 + y * 3) % 3) * 0.1;
          if (run && run.h === h && run.x1 === x - 1) run.x1 = x; else { flush(); run = { x0: x, x1: x, h }; }
        }
        flush();
      }
      // the way out
      const exit = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.2), new THREE.MeshBasicMaterial({ color: '#fff0c0', transparent: true, opacity: 0.3, depthWrite: false }));
      exit.rotation.x = -Math.PI / 2; exit.position.set(L.inside.x, 0.02, L.inside.y + 0.6); exit.userData.own = true; g.add(exit);
      R.roomDoorGlow = exit; R.roomWinMat = null;
      // traps
      R.trapMeshes = [];
      const plateMat = new THREE.MeshStandardMaterial({ color: C('#3a3430'), roughness: 0.8, emissive: C('#000000') });
      const spikeMat = new THREE.MeshStandardMaterial({ color: C('#c8c4bc'), roughness: 0.4, metalness: 0.5 });
      for (const t of L.traps || []) {
        const pm = plateMat.clone();
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.9), pm); plate.position.set(B + t.x, 0.03, t.y); plate.userData.own = true; g.add(plate);
        const sp = new THREE.Group(); sp.position.set(B + t.x, 0, t.y);
        if (t.kind === 'flame') { const fl = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.4, 6), new THREE.MeshBasicMaterial({ color: '#ff9a3a', transparent: true, opacity: 0.8 })); fl.position.y = 0.7; fl.userData.own = true; sp.add(fl); }
        else for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.5, 4), spikeMat); c.position.set((i % 2 - 0.5) * 0.4, 0.25, (Math.floor(i / 2) - 0.5) * 0.4); c.userData.own = true; sp.add(c); }
        g.add(sp);
        R.trapMeshes.push({ t, plate, pm, sp });
      }
    },
    animateTraps(game) {
      for (const m of R.trapMeshes || []) {
        const st = ECHO.Quests.trapState(game, m.t);
        m.sp.visible = st === 'up';
        m.pm.emissive.set(st === 'warn' ? (m.t.kind === 'flame' ? '#a03a08' : '#6a5a3a') : '#000000');
      }
    },
    buildRoom(game, L) {
      const g = R.groups.room;
      for (const o of g.children.slice()) { g.remove(o); o.traverse(c => { if (c.geometry && c.userData.own) c.geometry.dispose(); }); }
      R.roomWindows = [];
      const B = ECHO.Interior.BASE;
      if (L.carved) R.buildCarved(game, L, g, B);
      else {
      // floor: one quad per tile, coloured by pattern
      const n = (L.W - 2) * (L.H - 2);
      const pos = new Float32Array(n * 18), col = new Float32Array(n * 18);
      const tmp = new THREE.Color();
      let o = 0;
      for (let y = 1; y < L.H - 1; y++) for (let x = 1; x < L.W - 1; x++) {
        tmp.set(R.FLOORS[L.floor](x, y)).convertSRGBToLinear();
        const j = 0.94 + ((x * 13 + y * 7) % 5) * 0.03;
        const X = B + x, quad = [[X, y], [X, y + 1], [X + 1, y], [X + 1, y], [X, y + 1], [X + 1, y + 1]];
        for (const [qx, qy] of quad) { pos[o] = qx; pos[o + 1] = 0; pos[o + 2] = qy; col[o] = tmp.r * j; col[o + 1] = tmp.g * j; col[o + 2] = tmp.b * j; o += 3; }
      }
      const fg = new THREE.BufferGeometry();
      fg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      fg.setAttribute('color', new THREE.BufferAttribute(col, 3));
      fg.computeVertexNormals();
      const floor = new THREE.Mesh(fg, R.mat.terrain); floor.receiveShadow = true; floor.userData.own = true; g.add(floor);
      // walls
      const [wc, tc] = R.WALLS[L.wall] || R.WALLS.stone;
      const wallMat = new THREE.MeshStandardMaterial({ color: C(wc), roughness: 0.92 });
      const trimMat = new THREE.MeshStandardMaterial({ color: C(tc), roughness: 0.85 });
      const box = (x, y, w, h, d, mat, yb = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, yb + h / 2, y); m.castShadow = true; m.receiveShadow = true; m.userData.own = true; g.add(m); return m; };
      const WH = L.type === 'keep' || L.type === 'temple' ? 3.4 : 2.6;
      box(B + L.W / 2, 0.5, L.W, WH, 1, wallMat);                         // north
      box(B + 0.5, L.H / 2, 1, WH, L.H, wallMat);                         // west
      box(B + L.W - 0.5, L.H / 2, 1, WH, L.H, wallMat);                   // east
      // south wall: low, with a doorway
      const dx = L.doorX;
      box(B + dx / 2, L.H - 0.5, dx, 0.45, 1, wallMat);
      box(B + dx + 1 + (L.W - dx - 1) / 2, L.H - 0.5, L.W - dx - 1, 0.45, 1, wallMat);
      box(B + dx + 0.5, L.H - 0.5, 1, 0.04, 1, trimMat);                   // threshold
      const mat = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), new THREE.MeshBasicMaterial({ color: '#fff0c0', transparent: true, opacity: 0.25, depthWrite: false }));
      mat.rotation.x = -Math.PI / 2; mat.position.set(B + dx + 0.5, 0.02, L.H - 1.2); mat.userData.own = true; g.add(mat);
      R.roomDoorGlow = mat;
      if (L.cave) {
        // rough rock instead of posts and windows
        for (let x = 1; x < L.W - 1; x += 2) box(B + x + 0.5, 1.1 + (x % 3) * 0.08, 0.9, WH * (0.7 + (x % 4) * 0.1), 0.4, trimMat);
        R.roomWinMat = null;
      }
      if (L.cave) { /* no windows below ground */ } else {
      // timber posts / pilasters and a trim along the top
      for (let x = 0; x < L.W; x += 3) box(B + x + 0.5, 1.02, 0.22, WH, 0.12, trimMat);
      for (let y = 1; y < L.H - 1; y += 3) { box(B + 1.04, y + 0.5, 0.1, WH, 0.22, trimMat); box(B + L.W - 1.04, y + 0.5, 0.1, WH, 0.22, trimMat); }
      box(B + L.W / 2, 1.04, L.W, 0.16, 0.1, trimMat, WH - 0.3);
      // windows on the north wall let the day in
      const wmat = new THREE.MeshBasicMaterial({ color: '#cfe0ff' });
      for (let x = 2.5; x < L.W - 2; x += L.W > 12 ? 4 : 3.5) {
        if (L.furn.some(f => Math.abs(f.x - x) < 1.2 && f.y < 2 && (f.model === 'hearth' || f.model === 'shelf' || f.model === 'forge' || f.model === 'throne' || f.model === 'altar'))) continue;
        const w = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.9), wmat); w.position.set(B + x, 1.55, 1.005); w.userData.own = true; g.add(w);
        box(B + x, 1.0, 1.0, 0.08, 0.14, trimMat, 1.04);
        R.roomWindows.push({ x: B + x, y: 1.4 });
      }
      R.roomWinMat = wmat;
      }
      }
      // furniture
      const stoneMat = R._stairMat || (R._stairMat = new THREE.MeshStandardMaterial({ color: C('#4a4650'), roughness: 0.95 }));
      const voidMat = R._voidMat || (R._voidMat = new THREE.MeshBasicMaterial({ color: '#020203' }));
      for (const f of L.furn) {
        if (f.model === 'frame') {
          // one of your sketches, framed on the wall
          const fr = new THREE.Group(); fr.position.set(B + f.x, 1.55, f.y); fr.rotation.y = f.rot || 0;
          const wood = R._frameMat || (R._frameMat = new THREE.MeshStandardMaterial({ color: C('#4a3020'), roughness: 0.7 }));
          const back = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.62, 0.05), wood); back.userData.own = true; fr.add(back);
          if (f.img) { const tex = new THREE.TextureLoader().load(f.img); const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })); pic.position.z = 0.03; pic.userData.own = true; fr.add(pic); }
          g.add(fr);
          continue;
        }
        if (f.model === 'door') {
          const dm = R._doorMat || (R._doorMat = new THREE.MeshStandardMaterial({ color: C('#3a3a42'), roughness: 0.5, metalness: 0.6 }));
          const d = new THREE.Mesh(new THREE.BoxGeometry(1, 1.8, 1), dm); d.position.set(B + f.x, 0.9, f.y); d.castShadow = true; d.userData.own = true; g.add(d);
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.03, 6, 10), R._keyMat || (R._keyMat = new THREE.MeshStandardMaterial({ color: C('#d8b04a'), metalness: 0.7, roughness: 0.3 }))); ring.position.set(B + f.x, 1.0, f.y + 0.52); ring.userData.own = true; g.add(ring);
          continue;
        }
        if (f.model === 'stairs') {
          // steps going down into the dark (or up toward the light)
          const up = f.action === 'delveup';
          const grp = new THREE.Group(); grp.position.set(B + f.x, 0, f.y); grp.rotation.y = f.rot || 0;
          for (let i = 0; i < 4; i++) {
            const h = up ? 0.15 + i * 0.18 : 0.02;
            const st = new THREE.Mesh(new THREE.BoxGeometry(1.6, h, 0.42), stoneMat);
            st.position.set(0, up ? h / 2 : -i * 0.16, -0.6 + i * 0.42); st.castShadow = true; st.receiveShadow = true; st.userData.own = true; grp.add(st);
          }
          if (!up) { const pit = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.8), voidMat); pit.rotation.x = -Math.PI / 2; pit.position.set(0, -0.6, 0.1); pit.userData.own = true; grp.add(pit); }
          for (const sx of [-0.95, 0.95]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.5, 1.9), stoneMat); w.position.set(sx, 0.25, 0); w.castShadow = true; w.userData.own = true; grp.add(w); }
          g.add(grp);
          continue;
        }
        const baked = ECHO.Models.bake(f.model, f.colors);
        if (!baked) continue;
        for (const part of ['base', 'glow', 'window']) {
          if (!baked[part]) continue;
          const mesh = new THREE.Mesh(baked[part], part === 'base' ? R.mat.prop : part === 'glow' ? R.mat.glow : R.mat.window);
          mesh.position.set(B + f.x, 0, f.y);
          mesh.rotation.y = f.rot;
          mesh.scale.setScalar(f.scale);
          mesh.castShadow = part === 'base'; mesh.receiveShadow = true;
          g.add(mesh);
          if (part === 'glow' && (f.model === 'hearth' || f.model === 'candles' || f.model === 'forge')) (R.roomFlames = R.roomFlames || []).push(mesh);
        }
      }
      // webs strung across a nest
      if (L.webs && L.webs.length) {
        const wm = R._webMat || (R._webMat = new THREE.MeshBasicMaterial({ color: '#eef0ff', transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide, wireframe: true }));
        for (const w of L.webs) {
          const m = new THREE.Mesh(new THREE.CircleGeometry(w.r, 8, 0, Math.PI * 2), wm);
          m.rotation.x = -Math.PI / 2; m.position.set(B + w.x, 0.04, w.y); m.userData.own = true; g.add(m);
        }
      }
      // a dark void around the room
      const under = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshBasicMaterial({ color: '#050407' }));
      under.rotation.x = -Math.PI / 2; under.position.set(B + L.W / 2, -0.02, L.H / 2); under.userData.own = true; g.add(under);
    },
    setInteriorMode(on) {
      if (R.indoors === on) return;
      R.indoors = on;
      for (const k of ['terrain', 'props', 'towns', 'sites']) R.groups[k].visible = !on;
      R.groups.room.visible = on;
      if (R.water) R.water.visible = !on;
      if (!on) { R.clear(R.groups.room); R.roomKey = null; R.roomFlames = []; R.firstFrame = true; R.sitesT = 0; }
    },
    updateInteriorLighting(game, L) {
      const world = game.world;
      const dl = L.cave ? 0 : T.daylight(world.minute);
      const B = ECHO.Interior.BASE;
      R.hemi.intensity = L.cave ? 0.14 : 0.22 + 0.18 * dl;
      R.hemi.color.set('#ffd9b0').convertSRGBToLinear();
      R.hemi.groundColor.set('#2a1c12').convertSRGBToLinear();
      // a soft key light from the windows for shadows
      R.sun.position.set(B + L.W / 2 - 4, 14, -6);
      R.sun.target.position.set(B + L.W / 2, 0, L.H / 2);
      R.sun.intensity = L.cave ? 0.06 : 0.25 + 0.55 * dl;
      R.sun.color.set(dl > 0.3 ? '#fff0dc' : '#9ab0ff').convertSRGBToLinear();
      R.sun.castShadow = true;
      R.moon.intensity = 0;
      R.scene.background = R.bgDark = R.bgDark || new THREE.Color('#050407');
      R.scene.fog.color.set('#050407'); R.scene.fog.near = 60; R.scene.fog.far = 120;
      R.renderer.toneMappingExposure = 1.15;
      R.mat.window.emissiveIntensity = 0.6;
      if (R.roomWinMat) R.roomWinMat.color.copy(lerpC(C('#1a2440'), C('#e8f0ff'), dl));
      if (R.roomDoorGlow) R.roomDoorGlow.material.opacity = 0.12 + 0.2 * dl;
      const cand = [];
      const tgt = R.camTarget;
      const push = (x, y, r, a, color, h = 1.1) => cand.push({ x, y, r, a, color, h, d: (x - tgt.x) ** 2 + (y - tgt.z) ** 2 });
      for (const l of L.lights) push(l.x, l.y, l.r, l.a, l.color, l.h);
      for (const w of R.roomWindows || []) if (dl > 0.2) push(w.x, w.y, 4, 0.7 * dl, '#cfe0ff', 1.6);
      for (const Lg of (game._updLights || game.lights || [])) push(Lg.x, Lg.y, Lg.r, Lg.a, Lg.color, 1.3);
      for (const p of ECHO.Combat.proj) { if (p.kind === 'fire') push(p.x, p.y, 3.5 + p.radius, 1.4, '#ff9a3c', 0.6); else if (p.kind === 'orb') push(p.x, p.y, 2.5, 1, p.color || '#b48aff', 0.6); }
      cand.sort((a, b) => a.d - b.d);
      const flick = 1 + Math.sin(R.time * 11) * 0.05 + Math.sin(R.time * 23) * 0.04;
      for (let i = 0; i < MAX_LIGHTS; i++) {
        const P = R.points[i], c = cand[i];
        if (!c || i >= R.lightN) { P.intensity = 0; continue; }
        P.position.set(c.x, c.h, c.y);
        P.color.copy(C(c.color));
        P.distance = c.r * 2.1;
        P.intensity = c.a * 1.7 * flick;
      }
      R.snow.visible = false; R.rain.visible = false;
      const wx = ECHO.Weather ? ECHO.Weather.here(world, L.outside.x, L.outside.y) : { today: 'clear' };
      if (ECHO.Sfx.setRain) ECHO.Sfx.setRain(wx.today === 'storm' ? 0.35 : wx.today === 'rain' ? 0.2 : 0);
      if (R.roomWinMat && (wx.today === 'rain' || wx.today === 'storm' || wx.today === 'cloudy' || wx.today === 'fog')) R.roomWinMat.color.multiplyScalar(0.6);
    },

    // ---------------------------------------------------------------- entities
    view(game, e) {
      let v = R.views.get(e);
      if (v) return v;
      let inst = null, kind = e.type;
      if (e.shape === 'spider' || e.shape === 'slime') inst = R.procMonster(e);
      else if (e.shape === 'rat') inst = ECHO.Models.instance('gnawer');
      else if (e.type === 'player' || e.type === 'person' || e.type === 'ghost' || e.humanoid) inst = ECHO.Models.instance('person');
      else if (e.type === 'creature') inst = ECHO.Models.instance(e.species === 'hind' || e.species === 'deer' ? 'stag' : e.species === 'dog' || e.species === 'fox' ? 'wolf' : e.species);
      else if (e.type === 'boss') inst = ECHO.Models.instance(e.boss.kind);
      if (!inst) return null;
      v = { inst, kind, cfgT: 0, dir: e.dir || 0, bob: Math.random() * 6 };
      // The player shows through trees and roofs as a faint silhouette.
      if (e.type === 'player') {
        const ghost = new THREE.MeshBasicMaterial({ color: '#bfe8ff', transparent: true, opacity: 0.32, depthTest: false, depthWrite: false });
        const meshes = [];
        inst.root.traverse(o => { if (o.isMesh) meshes.push(o); });
        for (const o of meshes) { const g = new THREE.Mesh(o.geometry, ghost); g.renderOrder = 20; g.userData.ghostOf = o; o.add(g); }
        v.ghostMat = ghost;
      }
      R.groups.ents.add(inst.root);
      R.views.set(e, v);
      R.configure(game, e, v);
      return v;
    },
    PROF: null,
    configure(game, e, v) {
      const M = ECHO.Models, inst = v.inst, world = game.world;
      if (e.shape) {
        if (e.shape === 'rat') { M.recolor(inst, 'rat', e.elite ? '#4a2a2a' : '#5a4a42'); inst.root.scale.setScalar(1.15 * (e.scale || 1)); }
        else inst.root.scale.setScalar(e.scale || 1);
        return;
      }
      if (e.humanoid && e.foe && e.foe.vis) {
        const V = e.foe.vis;
        M.recolor(inst, 'cloth', V.cloth); M.recolor(inst, 'cloth2', V.cloth2); M.recolor(inst, 'skin', V.skin); M.recolor(inst, 'hair', V.hair);
        M.recolor(inst, 'metal', V.metal || '#8a8a90'); M.recolor(inst, 'cape', V.cloth2);
        for (const k of ['robe', 'apron', 'cape', 'helm', 'bandana', 'hood', 'hairLong', 'beard', 'crown', 'shield', 'bow', 'spear', 'torch', 'staff', 'sword', 'hair']) M.show(inst, k, false);
        for (const k of V.show || []) M.show(inst, k, true);
        for (const m of inst.mats) { if (m.emissive) m.emissive.set(e.rage ? '#6a0c04' : e.elite ? '#3a0a08' : V.em || '#000000'); if (V.opacity) { m.transparent = true; m.opacity = V.opacity; } }
        inst.root.scale.setScalar(e.scale || 1);
        return;
      }
      if (e.humanoid) {
        // the barrow dead and the smugglers: people-shaped, but not people of this world
        const lk = e.foe ? e.foe.look : 'brigand';
        const dead = lk === 'wight' || lk === 'king';
        M.recolor(inst, 'cloth', dead ? '#7f9a8a' : lk === 'chief' ? '#5a2a22' : '#4a4038');
        M.recolor(inst, 'cloth2', dead ? '#3e4a44' : '#2a2420');
        M.recolor(inst, 'skin', e.look.skin); M.recolor(inst, 'hair', e.look.hair);
        if (dead) { M.recolor(inst, 'metal', '#9ab0a0'); M.recolor(inst, 'cape', '#4a5a50'); }
        for (const k of ['robe', 'apron', 'cape', 'helm', 'bandana', 'hood', 'hairLong', 'beard', 'crown', 'shield', 'bow', 'spear', 'torch', 'staff', 'sword']) M.show(inst, k, false);
        M.show(inst, 'sword', !e.gear.bow); M.show(inst, 'bow', !!e.gear.bow);
        if (dead) { M.show(inst, 'robe', true); M.show(inst, 'hood', lk === 'wight'); M.show(inst, 'crown', lk === 'king'); M.show(inst, 'cape', lk === 'king'); }
        else { M.show(inst, 'bandana', lk !== 'chief'); M.show(inst, 'helm', lk === 'chief'); M.show(inst, 'cape', lk === 'chief'); M.show(inst, 'hair', lk === 'chief'); M.show(inst, 'beard', !!e.look.beard); }
        if (dead) for (const m of inst.mats) if (m.emissive) m.emissive.set('#16302a');
        inst.root.scale.setScalar(e.foe && e.foe.elite ? 1.18 : 1);
        return;
      }
      if (e.species === 'deer') {
        M.recolor(inst, 'stag', e.stag ? '#7a4e2a' : '#8a5a32'); M.recolor(inst, 'cloth2', '#6e4626'); M.recolor(inst, 'white', '#efe4d0'); M.recolor(inst, 'eyeglow', '#1a1410'); M.recolor(inst, 'darkwood', '#3a2a1a');
        for (const k of ['armorMelee', 'armorFire', 'armorRanged']) M.show(inst, k, false);
        M.show(inst, 'antlers', !!e.stag);
        if (e.goat) { M.recolor(inst, 'stag', '#e4ddd0'); M.recolor(inst, 'cloth2', '#c8c0b0'); M.recolor(inst, 'darkwood', '#8a8070'); inst.root.scale.setScalar(0.34); return; }
        if (e.white) { M.recolor(inst, 'stag', '#a8784a'); M.recolor(inst, 'darkwood', '#f4f0e0'); }
        for (const m of inst.mats) { if (m.emissive) m.emissive.set('#000000'); }
        inst.root.scale.setScalar(e.stag ? 0.52 : 0.44);
        return;
      }
      if (e.species === 'hind') {
        M.recolor(inst, 'stag', '#f4f2ea'); M.recolor(inst, 'cloth2', '#e6e2d6'); M.recolor(inst, 'white', '#ffffff'); M.recolor(inst, 'eyeglow', '#bfe8ff'); M.recolor(inst, 'darkwood', '#b8b0a0');
        for (const k of ['antlers', 'armorMelee', 'armorFire', 'armorRanged']) M.show(inst, k, false);
        for (const m of inst.mats) { if (m.emissive) m.emissive.set('#3a3e48'); }
        inst.root.scale.setScalar(0.5);
        return;
      }
      if (e.type === 'creature') {
        const base = { wolf: 'fur', dog: 'fur', gnawer: 'rat', hare: 'hare' }[e.species];
        if (e.species === 'fox') { M.recolor(inst, 'fur', e.coat || '#c0642a'); M.recolor(inst, 'eyeglow', '#1a1410'); for (const m of inst.mats) if (m.emissive) m.emissive.set('#000000'); M.show(inst, 'horn', false); inst.root.scale.setScalar(0.5); return; }
        if (e.species === 'dog') { M.recolor(inst, 'fur', e.coat || '#8a5a32'); M.recolor(inst, 'eyeglow', '#1a1410'); for (const m of inst.mats) if (m.emissive) m.emissive.set('#000000'); M.show(inst, 'horn', false); inst.root.scale.setScalar(0.66 * (e.small || 1)); return; }
        const tint = e.winter ? '#eef2f8' : e.mutation === 'mirrorback' ? '#b8c4d4' : e.mutation === 'emberfur' ? '#a8502a' : e.strain === 'Ashen' ? '#8e8e8a' : e.strain === 'Ironhide' ? '#5a4632' : null;
        if (tint) M.recolor(inst, base, tint);
        if (e.mutation === 'paleshade') for (const m of inst.mats) { m.transparent = true; m.opacity = 0.5; }
        M.show(inst, 'horn', e.mutation === 'glasshorn');
        inst.root.scale.setScalar((e.species === 'wolf' ? 1.05 : 1.15) * (e.scale || 1));
        if ((e.beast || e.scale > 1.2) && !e.winter) M.recolor(inst, base, '#2e2a30');
        return;
      }
      if (e.type === 'boss') {
        const a = e.boss.armor;
        M.show(inst, 'armorMelee', a.melee > 0.05);
        M.show(inst, 'armorFire', a.fire > 0.05);
        M.show(inst, 'armorRanged', a.ranged > 0.05);
        inst.root.scale.setScalar(1.05);
        if (e.dragon) {
          for (const k of ['armorMelee', 'armorFire', 'armorRanged']) M.show(inst, k, false);
          if (e.boss.color) M.recolor(inst, 'drake', e.boss.color);
          if (e.boss.belly) M.recolor(inst, 'drakebelly', e.boss.belly);
          inst.root.scale.setScalar(1.8);
        }
        return;
      }
      // People
      const npc = e.npcId ? world.npcs[e.npcId] : null;
      const look = e.look || {};
      const prof = npc ? npc.prof : 'player';
      const S = ECHO.Sprites.PROF_COL;
      let cols = S[prof] || ['#7a8a4a', '#4a3a2a'];
      if (prof === 'guard' && npc) { const f = world.factions[npc.faction]; cols = [f ? f.color : '#6f8fc4', f ? f.banner : '#2b3f66']; }
      if (prof === 'child' && npc) { const kc = ['#c8574a', '#4a8ac8', '#d8b84a', '#6aa85a', '#9a5ac8', '#d87a3a']; cols = [kc[ECHO.hashStr(npc.id) % kc.length], '#4a3a2a']; }
      if (prof === 'farmer' && npc && ECHO.hashStr(npc.id) % 2) cols = ['#8a6a3a', '#4a3a24'];
      if (e.type === 'player') cols = ['#2f7f86', '#2a3a40'];
      if (e.isCompanion) cols = [cols[0], '#3a4a40'];
      M.recolor(inst, 'cloth', cols[0]);
      M.recolor(inst, 'cloth2', cols[1]);
      if (look.skin) M.recolor(inst, 'skin', look.skin);
      const hairCol = prof === 'elder' ? '#d8d4cc' : (look.hair || '#4a3020');
      M.recolor(inst, 'hair', hairCol);
      const gear = e.gear || {};
      const pl = game.pl;
      const helm = !!gear.helm, bandit = prof === 'bandit';
      const robe = ['priest', 'scholar', 'ruler'].includes(prof);
      M.show(inst, 'robe', robe);
      M.show(inst, 'apron', prof === 'smith');
      M.show(inst, 'cape', e.type === 'player' || (npc && npc.rank >= 2) || prof === 'wanderer');
      if (npc && npc.rank >= 2) M.recolor(inst, 'cape', cols[1]);
      M.show(inst, 'helm', helm);
      M.show(inst, 'bandana', bandit && !helm);
      M.show(inst, 'hood', !helm && !bandit && (prof === 'priest' || prof === 'herbalist' || prof === 'hunter'));
      const covered = helm || bandit || inst.parts.hood.visible;
      M.show(inst, 'hair', !covered || false);
      M.show(inst, 'hairLong', !!(look.female || look.hairStyle === 1) && !helm);
      M.show(inst, 'beard', !!look.beard);
      M.show(inst, 'crown', !!(npc && npc.prof === 'ruler' && /King|Queen/.test(npc.title || '')));
      M.show(inst, 'shield', !!gear.shield || (e.type === 'player' && pl && pl.skills.ward > 25));
      M.show(inst, 'bow', !!gear.bow);
      M.show(inst, 'spear', !!gear.spear);
      M.show(inst, 'torch', !ECHO.Interior.cur && (!!gear.torch || (e.type === 'player' && game.isNight())));
      M.show(inst, 'staff', prof === 'elder' || !!gear.staff);
      const fighter = e.type === 'player' ? !!(pl && pl.weapon) : (prof === 'guard' || bandit || prof === 'wanderer' || e.role === 'soldier' || !!e.carrying || e.isCompanion);
      M.show(inst, 'sword', fighter && !gear.spear && !gear.bow);
      if (e.carrying) {
        const it = world.items[e.carrying];
        if (it && (it.legend || it.history.some(h => h.t.includes('taken by')))) M.recolor(inst, 'metal', '#f2dc8a');
      }
      let scale = prof === 'child' ? 0.68 : prof === 'elder' ? 0.94 : 1.0;
      if (e.type === 'ghost') {
        // the dead and the long-gone: pale, robed, a little lit from within
        M.recolor(inst, 'cloth', '#cfe6ff'); M.recolor(inst, 'cloth2', '#9fc4e8'); M.recolor(inst, 'cape', '#bfe0ff'); M.recolor(inst, 'metal', '#e8f4ff');
        M.show(inst, 'robe', true); M.show(inst, 'cape', !!e.crown); M.show(inst, 'crown', !!e.crown); M.show(inst, 'torch', false); M.show(inst, 'sword', false); M.show(inst, 'shield', false); M.show(inst, 'bow', false);
        M.show(inst, 'hood', !e.crown && !(e.look && e.look.female));
        if (e.child) scale = 0.66;
      }
      if (e.type === 'player' && e.gearLook) R.dressPlayer(inst, e.gearLook);
      inst.root.scale.setScalar(scale);
    },
    // Boats on the water: yours, the ferry you ride, and ferries waiting at the jetties.
    // Things to gather: berry bushes, mushrooms, herbs, wild bees' nests, birds' nests.
    syncForage(game) {
      const nodes = ECHO.Pastimes && !ECHO.Interior.cur ? ECHO.Pastimes.nodes : [];
      R.forPool = R.forPool || {};
      const mat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, flatShading: true });
      if (!R.forMats) R.forMats = { leaf: mat('#3e6a2e'), berry: mat('#b0203a'), blue: mat('#3a3a9a'), stem: mat('#e8dcc0'), cap: mat('#b0402a'), cap2: mat('#8a5a3a'), herb: mat('#6aa84a'), flower: mat('#d8c8ff'), stump: mat('#5a3e26'), hive: mat('#c89a3a'), nest: mat('#7a6040'), egg: mat('#efe8d8') };
      const M = R.forMats;
      const make = k => {
        const g = new THREE.Group();
        const add = (geo, m, x, y, z, s) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); if (s) o.scale.set(...s); o.castShadow = true; g.add(o); return o; };
        if (k === 'berries') { add(new THREE.DodecahedronGeometry(0.32, 0), M.leaf, 0, 0.26, 0, [1, 0.8, 1]); for (let i = 0; i < 9; i++) { const a = i * 2.4, r = 0.24 + (i % 3) * 0.04; add(new THREE.SphereGeometry(0.045, 5, 4), i % 3 ? M.berry : M.blue, Math.cos(a) * r, 0.2 + (i % 4) * 0.08, Math.sin(a) * r); } }
        if (k === 'mushrooms') for (let i = 0; i < 3; i++) { const x = (i - 1) * 0.14, z = (i % 2) * 0.1, h = 0.1 + i * 0.03; add(new THREE.CylinderGeometry(0.025, 0.03, h, 5), M.stem, x, h / 2, z); add(new THREE.SphereGeometry(0.08, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), i === 1 ? M.cap : M.cap2, x, h, z); }
        if (k === 'herbs') for (let i = 0; i < 6; i++) { const a = i * 1.05; add(new THREE.ConeGeometry(0.04, 0.26, 4), M.herb, Math.cos(a) * 0.1, 0.13, Math.sin(a) * 0.1); if (i % 2) add(new THREE.SphereGeometry(0.03, 4, 3), M.flower, Math.cos(a) * 0.1, 0.27, Math.sin(a) * 0.1); }
        if (k === 'honey') { add(new THREE.CylinderGeometry(0.22, 0.26, 0.4, 7), M.stump, 0, 0.2, 0); add(new THREE.SphereGeometry(0.16, 7, 5), M.hive, 0, 0.5, 0, [1, 1.3, 1]); }
        if (k === 'eggs') { add(new THREE.TorusGeometry(0.13, 0.05, 4, 8), M.nest, 0, 0.04, 0).rotation.x = Math.PI / 2; for (let i = 0; i < 3; i++) add(new THREE.SphereGeometry(0.04, 5, 4), M.egg, (i - 1) * 0.05, 0.06, (i % 2) * 0.03, [1, 1.3, 1]); }
        R.scene.add(g); return g;
      };
      const used = {};
      for (const n of nodes) {
        const pool = R.forPool[n.k] = R.forPool[n.k] || [];
        const i = used[n.k] = (used[n.k] || 0) + 1;
        let g = pool[i - 1]; if (!g) { g = make(n.k); pool.push(g); }
        g.visible = true; g.position.set(n.x, R.groundH(n.x, n.y), n.y); g.rotation.y = (n.x * 7.3 + n.y * 3.1) % 6.28;
      }
      for (const k in R.forPool) for (let i = used[k] || 0; i < R.forPool[k].length; i++) R.forPool[k][i].visible = false;
    },
    // A dragon's shadow sweeping across the ground.
    syncFly(game) {
      const f = ECHO.Events && ECHO.Events.fly;
      if (!f || ECHO.Interior.cur) { if (R.flyMesh) R.flyMesh.visible = false; return; }
      if (!R.flyMesh) {
        const s = new THREE.Shape();
        const P = [[3.2, 0], [2.2, 0.5], [1.0, 0.7], [0.4, 1.4], [-0.4, 3.4], [-1.2, 6.8], [-1.6, 5.2], [-2.2, 4.6], [-2.4, 3.2], [-3.0, 2.6], [-2.4, 1.2], [-2.6, 0.5], [-5.0, 0.25]];
        s.moveTo(P[0][0], P[0][1]);
        for (let i = 1; i < P.length; i++) s.lineTo(P[i][0], P[i][1]);
        for (let i = P.length - 1; i >= 0; i--) s.lineTo(P[i][0], -P[i][1]);
        const geo = new THREE.ShapeGeometry(s); geo.rotateX(-Math.PI / 2);
        R.flyMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.38, depthWrite: false }));
        R.flyMesh.renderOrder = 2; R.scene.add(R.flyMesh);
      }
      const m = R.flyMesh;
      m.visible = true;
      m.position.set(f.x, R.groundH(f.x, f.y) + 0.25, f.y);
      m.rotation.y = -Math.atan2(f.dy, f.dx);
      const flap = 1 + Math.sin(f.t * 4.5) * 0.12;
      m.scale.set(1.2, 1, 1.2 * flap);
      m.material.opacity = 0.38 * Math.min(1, f.t, f.dur - f.t);
    },
    // Flocks of small birds: pecking in the grass, then bursting up and away.
    syncBirds(game, dt) {
      const fl = ECHO.Fauna && !ECHO.Interior.cur ? ECHO.Fauna.flocks : [];
      R.birdPool = R.birdPool || [];
      if (!R.birdMats) R.birdMats = { sparrow: new THREE.MeshStandardMaterial({ color: '#7a5a3a', roughness: 0.9, flatShading: true }), crow: new THREE.MeshStandardMaterial({ color: '#1e1e24', roughness: 0.7, flatShading: true }), gull: new THREE.MeshStandardMaterial({ color: '#ececE6', roughness: 0.8, flatShading: true }), beak: new THREE.MeshStandardMaterial({ color: '#c8a040', roughness: 0.8 }) };
      const make = () => {
        const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
        const torso = new THREE.Mesh(new THREE.SphereGeometry(1, 6, 4), R.birdMats.sparrow); torso.scale.set(1.5, 0.85, 0.85); body.add(torso);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.6, 6, 4), R.birdMats.sparrow); head.position.set(1.3, 0.5, 0); body.add(head);
        const beak = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 4), R.birdMats.beak); beak.rotation.z = -Math.PI / 2; beak.position.set(1.95, 0.45, 0); body.add(beak);
        const tail = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.6), R.birdMats.sparrow); tail.position.set(-1.5, 0.2, 0); tail.rotation.z = 0.25; body.add(tail);
        const wing = s => { const p = new THREE.Group(); p.position.set(0.1, 0.3, s * 0.55); const w = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 1.6), R.birdMats.sparrow); w.position.z = s * 0.8; p.add(w); body.add(p); return { p, w }; };
        const wl = wing(-1), wr = wing(1);
        torso.castShadow = true;
        R.scene.add(g);
        return { g, body, parts: [torso, head, tail, wl.w, wr.w], wl: wl.p, wr: wr.p, kind: null };
      };
      let n = 0;
      for (const f of fl) for (const b of f.birds) {
        let o = R.birdPool[n]; if (!o) { o = make(); R.birdPool.push(o); }
        if (o.kind !== f.kind) { o.kind = f.kind; for (const m of o.parts) m.material = R.birdMats[f.kind]; o.g.scale.setScalar(f.kind === 'sparrow' ? 0.055 : f.kind === 'crow' ? 0.085 : 0.095); }
        o.g.visible = true;
        const flying = f.up && !(b.delay > 0);
        o.g.position.set(b.x, R.groundH(b.x, b.y) + 0.05 + b.z, b.y);
        o.g.rotation.y = -b.dir;
        const fl2 = flying ? Math.sin(b.flap) * 1.1 : 0.08;
        o.wl.rotation.x = fl2; o.wr.rotation.x = -fl2;
        o.body.rotation.z = flying ? 0.15 : (b.peck < 0 && Math.sin(R.time * 6 + b.x * 9) > 0.4 ? -0.6 : 0);
        n++;
      }
      for (let i = n; i < R.birdPool.length; i++) R.birdPool[i].g.visible = false;
    },
    // Your own camp: the fire, a bedroll, and a spit when something's cooking.
    syncCamp(game, dt) {
      const c = ECHO.Camp && ECHO.Camp.fire;
      const show = c && !ECHO.Interior.cur;
      if (R.campObj && (!show || R.campObj.c !== c)) { R.scene.remove(R.campObj.g); R.campObj = null; }
      if (!show) return;
      if (!R.campObj) {
        const g = new THREE.Group(), flames = [];
        R.addStatic(g, 'campfire', c.x, c.y, null, 0, 0.8, flames);
        const mat = (col) => new THREE.MeshStandardMaterial({ color: col, roughness: 0.95, flatShading: true });
        const gy = R.groundH(c.bx, c.by);
        const roll = new THREE.Group(); roll.position.set(c.bx, gy, c.by); roll.rotation.y = c.rot + Math.PI / 2; g.add(roll);
        const blanket = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.09, 0.68), mat('#6a3e30')); blanket.position.y = 0.045; blanket.receiveShadow = true; blanket.castShadow = true; roll.add(blanket);
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.095, 0.7), mat('#c8a860')); stripe.position.set(0.35, 0.046, 0); roll.add(stripe);
        const pillow = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.62, 8), mat('#8a7a5a')); pillow.rotation.x = Math.PI / 2; pillow.position.set(-0.78, 0.13, 0); pillow.castShadow = true; roll.add(pillow);
        // a spit over the fire on two forked sticks
        const fy = R.groundH(c.x, c.y), wood = mat('#4a3020');
        const spit = new THREE.Group(); spit.position.set(c.x, fy, c.y); g.add(spit);
        for (const s of [-1, 1]) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.75, 5), wood); st.position.set(s * 0.42, 0.37, 0); st.rotation.z = s * 0.08; spit.add(st); }
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.0, 5), wood); bar.rotation.z = Math.PI / 2; bar.position.y = 0.7; spit.add(bar);
        const meat = new THREE.Mesh(new THREE.SphereGeometry(0.12, 7, 5), mat('#8a4a2a')); meat.scale.set(1.5, 0.9, 0.9); meat.position.y = 0.68; spit.add(meat);
        R.scene.add(g);
        R.campObj = { g, c, flames, meat };
      }
      const o = R.campObj;
      for (const f of o.flames) { f.visible = !c.out; f.scale.y = 1 + Math.sin(R.time * 13 + 1.7) * 0.18; f.scale.x = 1 + Math.sin(R.time * 9) * 0.06; }
      if (c.cookT > 0) c.cookT -= dt;
      o.meat.visible = c.cookT > 0;
      o.meat.rotation.x += dt * 1.5;
    },
    syncBoats(game, dt) {
      const Bt = ECHO.Boats, B3 = ECHO.Boat3D;
      if (!Bt || !B3) return;
      R.boatMap = R.boatMap || new Map();
      const seen = new Set();
      const put = (key, kind, x, y, dir, rowing, speed) => {
        let b = R.boatMap.get(key);
        if (!b) { b = B3.build(kind); R.scene.add(b.root); R.boatMap.set(key, b); }
        seen.add(key);
        b.root.visible = true;
        b.root.position.set(x, ECHO.Water.SURFACE - 0.06, y);
        b.root.rotation.y = Math.PI - dir;
        B3.pose(b, dt, rowing, speed);
      };
      const pe = game.pe, pl = game.pl, out = !ECHO.Interior.cur;
      if (out && pe) {
        if (pe.inBoat === 'ferry') put('ferry:ride', 'ferry', pe.x, pe.y, pe.dir, false, 3);
        else if (pe.inBoat) put('own', 'row', pe.x, pe.y, pe.dir, !!pe.rowing, Bt.row ? Math.hypot(Bt.row.vx, Bt.row.vy) : 0);
        else if (pl.boat && U.dist(pl.boat.x, pl.boat.y, pe.x, pe.y) < 60) put('own', 'row', pl.boat.x, pl.boat.y, pl.boat.dir || 0, false, 0);
        for (const d of Bt.docks || []) {
          if (!d.to.length || U.dist(d.water.x, d.water.y, pe.x, pe.y) > 45) continue;
          if (Bt.ferry && Bt.ferry.from === d) continue;
          put('dock:' + d.sid, 'ferry', d.water.x + Math.cos(d.dir) * 0.6, d.water.y + Math.sin(d.dir) * 0.6, d.dir + Math.PI / 2, false, 0);
        }
      }
      for (const [k, b] of R.boatMap) if (!seen.has(k)) { b.root.visible = false; }
      // jetties
      if (Bt._key && R._dockKey !== Bt._key) {
        R._dockKey = Bt._key;
        if (R.dockGroup) { R.scene.remove(R.dockGroup); R.dockGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
        R.dockGroup = new THREE.Group(); R.scene.add(R.dockGroup);
        const wood = new THREE.MeshStandardMaterial({ color: '#7a5a3a', roughness: 0.9, flatShading: true }), post = new THREE.MeshStandardMaterial({ color: '#4a3422', roughness: 0.9, flatShading: true });
        for (const d of Bt.docks) {
          const g = new THREE.Group(); g.position.set((d.land.x + d.water.x) / 2, 0.02, (d.land.y + d.water.y) / 2); g.rotation.y = -Math.atan2(d.water.y - d.land.y, d.water.x - d.land.x);
          const deck = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.07, 0.75), wood); deck.position.x = 0.4; deck.castShadow = true; deck.receiveShadow = true; g.add(deck);
          for (let i = 0; i < 6; i++) { const ln = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.075, 0.76), post); ln.position.set(-0.7 + i * 0.42, 0.001, 0); g.add(ln); }
          for (const [px, pz] of [[1.5, 0.34], [1.5, -0.34], [0.5, 0.34], [0.5, -0.34]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6), post); p.position.set(px, -0.2, pz); p.castShadow = true; g.add(p); }
          R.dockGroup.add(g);
        }
      }
      if (R.dockGroup) R.dockGroup.visible = !ECHO.Interior.cur;
    },
    // Footprints and hoofprints pressed into mud and snow.
    syncPrints(game) {
      if (!R.printMesh) {
        const g = new THREE.CircleGeometry(0.075, 6); g.rotateX(-Math.PI / 2);
        R.printMesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false }), 260);
        R.printMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(260 * 3), 3);
        R.printMesh.frustumCulled = false; R.printMesh.renderOrder = 1;
        R.groups.fx.add(R.printMesh);
      }
      const P = ECHO.Climate.prints, M = R.printMesh, o = R._po || (R._po = new THREE.Object3D()), c = new THREE.Color();
      let n = 0;
      for (const p of P) {
        if (n >= 260) break;
        const fade = Math.min(1, (p.life - p.t) / 8);
        o.position.set(p.x, R.groundH(p.x, p.y) + 0.012, p.y);
        o.rotation.set(0, -p.a, 0);
        o.scale.set(p.hoof ? 1.2 : 1.5, 1, p.hoof ? 1.2 : 0.8);
        o.scale.multiplyScalar(0.3 + 0.7 * fade);
        o.updateMatrix(); M.setMatrixAt(n, o.matrix);
        c.set(p.snow ? '#8f9cab' : '#2c2216'); M.setColorAt(n, c);
        n++;
      }
      M.count = n; M.instanceMatrix.needsUpdate = true; if (M.instanceColor) M.instanceColor.needsUpdate = true;
      M.visible = n > 0;
    },
    // Horses: yours (under you, or grazing where you left it) and any your companion rides.
    horseFor(key, breed) {
      R.horses = R.horses || new Map();
      let H = R.horses.get(key);
      if (!H || H.breed !== breed) {
        if (H) R.dropHorse(key);
        H = ECHO.Horse3D.build(breed, ECHO.Life.BREEDS[breed]);
        R.scene.add(H.root); for (const m of H.reins) R.scene.add(m);
        R.horses.set(key, H);
      }
      H.seen = R.frameNo;
      return H;
    },
    dropHorse(key) {
      const H = R.horses && R.horses.get(key); if (!H) return;
      R.scene.remove(H.root); for (const m of H.reins) R.scene.remove(m); for (const m of H.mats) m.dispose();
      R.horses.delete(key);
    },
    // Pose and place one horse; returns where its saddle is so a rider can sit in it.
    driveHorse(game, H, dt, x, y, yaw, spd, o) {
      const pe = game.pe, H3 = ECHO.Horse3D;
      if (H.syaw == null || o.snap) H.syaw = yaw;
      H.syaw += U.angleDiff(H.syaw, yaw) * Math.min(1, dt * 10);
      H.root.visible = true;
      const bd = H3.pose(H, dt, spd, H.syaw, o);
      const gy = R.standH(x, y), fx = Math.cos(H.syaw), fy = Math.sin(H.syaw);
      H.root.position.set(x - fx * H.seatX, gy, y - fy * H.seatX);
      H.root.rotation.y = Math.PI - H.syaw;
      H.root.updateMatrixWorld(true);
      // hoofbeats and dust
      const near = U.dist(x, y, pe.x, pe.y);
      if (H.st.hoofDown.length && near < 16) {
        const w = new THREE.Vector3();
        for (const i of H.st.hoofDown) {
          const g = H.st.gait;
          H.legs[i].hoof.getWorldPosition(w);
          const wet = ECHO.Water && !ECHO.Interior.cur && ECHO.Water.kind(game.world, w.x, w.z);
          const vol = (g === 'gallop' ? 0.75 : g === 'canter' ? 0.6 : g === 'trot' ? 0.45 : 0.3) * Math.max(0.2, 1 - near / 16) * (o.quiet ? 0.5 : 1);
          if (wet) { ECHO.Sfx.play('wade', { vol: vol * 0.8, pitch: i < 2 ? 1.1 : 0.9 }); ECHO.Water.splash(w.x, w.z, g === 'walk' ? 2 : 5, g === 'gallop' ? 1.4 : 0.8); continue; }
          ECHO.Sfx.play('hoof', { vol, pitch: (i < 2 ? 1.05 : 0.95) * (o.quiet ? 1.08 : 1) });
          if (g !== 'walk' && !ECHO.Interior.cur) {
            const n = g === 'gallop' ? 3 : 2;
            const muddy = ECHO.Climate && ECHO.Climate.mud(game.world, w.x, w.z) > 0.35;
            for (let k = 0; k < n; k++) ECHO.Combat.fx.push({ kind: 'p', x: w.x + (Math.random() - 0.5) * 0.2, y: w.z + (Math.random() - 0.5) * 0.2, vx: -fx * 0.8 + (Math.random() - 0.5) * 0.8, vy: -fy * 0.8 + (Math.random() - 0.5) * 0.8, t: 0, life: 0.45 + Math.random() * 0.3, color: muddy ? 'rgba(74,58,38,0.8)' : 'rgba(190,172,140,0.55)', size: 2 });
          }
        }
      }
      // reins from the bit to the rider's hands (or looped over the pommel)
      const a = new THREE.Vector3(), b = new THREE.Vector3(), sd = new THREE.Vector3(-fy, 0, fx);
      H.saddle.getWorldPosition(b);
      const seat = b.y + 0.07;
      for (let k = 0; k < 2; k++) {
        (k ? H.bitR : H.bitL).getWorldPosition(a);
        const hand = o.ridden ? { x: b.x + fx * 0.3 + sd.x * (k ? -0.07 : 0.07), y: seat + 0.32, z: b.z + fy * 0.3 + sd.z * (k ? -0.07 : 0.07) }
          : { x: b.x + fx * 0.17 * H.L.size + sd.x * (k ? -0.06 : 0.06), y: seat + 0.06, z: b.z + fy * 0.17 * H.L.size + sd.z * (k ? -0.06 : 0.06) };
        H3.strap(H.reins[k], a, hand); H.reins[k].visible = true;
      }
      return { seat, sx: b.x, sz: b.z, gait: H.st.gait, phase: H.st.phase, pitch: H.body.rotation.z, bob: bd.bob, rear: H.rear || 0 };
    },
    // Your own horse.
    syncHorse(game, dt, v) {
      const pl = game.pl, pe = game.pe;
      const riding = pe && pe.mounted && pl.horse && !ECHO.Interior.cur && v;
      const free = !riding && pl.horse && pl.horseAt && !ECHO.Interior.cur;
      if (!riding && !free) return null;
      const H = R.horseFor('player', pl.horse.breed);
      if (riding) {
        const R0 = ECHO.PlayerCtl.ride;
        const side = R0 && R0.sideT > 0 ? R0.sideSign * Math.sin(Math.PI * (1 - R0.sideT / 0.34)) : 0;
        return R.driveHorse(game, H, dt, v.px, v.py, v.dir, pe.rideV != null ? pe.rideV : (v.spd || 0), { ridden: true, reined: (pe.rideV || 0) < 0.3, rear: R0 && R0.rearT > 0, side });
      }
      const h = pl.horseAt;
      if (H.fx == null || Math.hypot(H.fx - h.x, H.fy - h.y) > 2) { H.fx = h.x; H.fy = h.y; }
      H.fx += (h.x - H.fx) * Math.min(1, dt * 14); H.fy += (h.y - H.fy) * Math.min(1, dt * 14);
      R.driveHorse(game, H, dt, H.fx, H.fy, h.dir, h.v || 0, { ridden: false, rear: h.rearT > 0, snap: true });
      return null;
    },
    // Hide any horse nobody used this frame.
    endHorses() {
      if (!R.horses) return;
      for (const [k, H] of R.horses) if (H.seen !== R.frameNo) { H.root.visible = false; for (const m of H.reins) m.visible = false; if (R.frameNo - H.seen > 600) R.dropHorse(k); }
    },
    // The player's gear, as it looks: finer metal, gems and glow as it is upgraded.
    dressPlayer(inst, G) {
      const M = ECHO.Models, P = inst.parts;
      if (!inst._split) {
        inst._split = true;
        const split = (part, from, to) => { if (!P[part]) return; P[part].traverse(o => { if (o.isMesh && o.material && o.material.name === from) { const m = o.material.clone(); m.name = to; o.material = m; inst.mats.push(m); } }); };
        split('sword', 'metal', 'blade'); split('sword', 'gold', 'guard'); split('bow', 'wood', 'bowwood'); split('helm', 'metal', 'helmmetal'); split('spear', 'metal', 'blade'); split('staff', 'wood', 'staffwood');
        const bladeMat = inst.mats.find(m => m.name === 'blade');
        if (P.sword && bladeMat) { const hd = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.26), bladeMat); hd.position.set(0, 0.5, 0.1); P.sword.add(hd); inst.axeHead = hd; }
        if (P.staff) { const om = new THREE.MeshBasicMaterial({ color: '#ff9a3c' }); om.name = 'orb'; inst.mats.push(om); const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 0), om); orb.position.set(0, 0.62, 0); P.staff.add(orb); inst.staffOrb = orb; }
        // shoulder plates and a crest, shown as the armour grows
        const plate = new THREE.MeshStandardMaterial({ color: '#8a8a90', roughness: 0.6, metalness: 0.35, flatShading: true }); plate.name = 'plate'; inst.mats.push(plate);
        inst.pauldrons = [];
        for (const arm of ['armL', 'armR']) if (P[arm]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.12, 0.26), plate); m.position.set(0, 0.03, arm === 'armL' ? 0.03 : -0.03); m.castShadow = true; P[arm].add(m); inst.pauldrons.push(m); }
        if (P.helm) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 5), plate); c.position.set(0, 0.95, 0); P.helm.add(c); inst.crest = c; }
      }
      const glowSet = (name, col, k) => { for (const m of inst.mats) if (m.name === name && m.emissive) { m.emissive.set(col); m.emissiveIntensity = k; } };
      const B = G.blade;
      if (B) {
        M.recolor(inst, 'blade', B.metal); glowSet('blade', B.glowCol, B.glow * 1.4);
        M.recolor(inst, 'guard', B.gold ? '#f2c84a' : B.rarity === 'rare' ? '#c8d0e0' : '#8a6a3a'); glowSet('guard', B.glowCol, B.gold ? 0.25 : 0);
        const wc = B.wclass || 'sword';
        M.show(inst, 'sword', wc === 'sword' || wc === 'axe'); M.show(inst, 'spear', wc === 'spear'); M.show(inst, 'staff', wc === 'staff');
        if (inst.axeHead) inst.axeHead.visible = wc === 'axe';
        if (inst.staffOrb) { inst.staffOrb.material.color.set(B.glowCol || '#ff9a3c'); inst.staffOrb.scale.setScalar(1 + B.plus * 0.12); }
        if (wc === 'staff') M.recolor(inst, 'staffwood', B.gold ? '#8a6a2a' : '#5a3e26');
        if (P.sword) P.sword.scale.set(1, (wc === 'axe' ? 0.8 : 1) + B.plus * 0.05 + (B.rarity === 'legendary' ? 0.1 : 0), 1);
      }
      if (G.bow) { M.recolor(inst, 'bowwood', G.bow.wood || '#6a4a2a'); glowSet('bowwood', G.bow.glowCol, G.bow.glow); }
      const A = G.armor;
      if (A) {
        M.recolor(inst, 'cloth', A.body); M.recolor(inst, 'cloth2', A.trim); M.recolor(inst, 'leather', A.trim);
        M.show(inst, 'helm', A.helm); M.show(inst, 'hair', !A.helm); M.recolor(inst, 'helmmetal', '#' + new THREE.Color(A.metal).lerp(new THREE.Color('#6a6a72'), 0.55).getHexString()); M.recolor(inst, 'plate', A.gold ? '#d8b04a' : A.metal);
        glowSet('plate', A.glowCol, A.glow * 0.6); glowSet('helmmetal', A.glowCol, A.glow * 0.4);
      } else { M.show(inst, 'helm', false); }
      for (const m of inst.pauldrons || []) m.visible = !!(A && A.pauldrons);
      if (inst.crest) inst.crest.visible = !!(A && A.crest && A.helm);
      if (G.rank) M.recolor(inst, 'cape', '#' + new THREE.Color(G.rank.color).multiplyScalar(0.62).getHexString());
    },
    animatePerson(game, e, v, dt) {
      const P = v.inst.parts;
      const moving = (v.mv || 0) > 0.5 && !e.dead;
      const ph = e.anim * 11;
      // Which way are the feet going compared with the way the body faces? Forward
      // is a walk, backward a back-step, sideways a side-step (feet open and close
      // instead of swinging), so guarding or aiming while moving reads properly.
      let fwd = 1, lat = 0;
      if (v.vdir != null && (v.mv || 0) > 0.2 && !e.mounted) {
        const rel = U.angleDiff(e.dir != null ? e.dir : 0, v.vdir);
        fwd = Math.cos(rel); lat = Math.sin(rel);
      }
      const sw = e.dead ? 0 : Math.sin(ph) * 0.65 * (v.mv || 0) * fwd;
      P.legL.rotation.z = sw; P.legR.rotation.z = -sw;
      v.strafe = e.dead ? 0 : lat * (v.mv || 0);
      let aL = -sw * 0.8, aR = sw * 0.8, aLx = 0, aRx = 0, twist = 0, lean = 0;
      const ease = t => 1 - Math.pow(1 - t, 3);
      if (e.attackT && e.attackDur) {
        const p = ease(1 - e.attackT / e.attackDur);
        switch (e.attackKind) {
          case 'back': aR = U.lerp(0.5, -2.3, p); aRx = U.lerp(0.2, -1.3, p); twist = U.lerp(0.6, -0.7, p); break;
          case 'finisher': aR = -1.55; aRx = -1.2; aL = -1.2; aLx = 1.0; twist = -p * Math.PI * 2; break;
          case 'heavy': aR = aL = U.lerp(-3.1, 0.3, p); lean = U.lerp(-0.25, 0.45, p); break;
          default: aR = U.lerp(-2.7, 0.5, p); aRx = U.lerp(-0.6, 0.5, p); twist = U.lerp(-0.6, 0.6, p); lean = 0.12 * p;
        }
      } else if (e.attackT) aR = -1.9 * (e.attackT / 0.18) - 0.2;
      if (e.state === 'windup' || e.state === 'attack') aR = -1.4;
      if (e.blocking) { aL = -1.3; aLx = 0.5; }
      if (e === game.pe) {
        const PC = ECHO.PlayerCtl;
        if (PC.drawing) { aL = -1.5; aR = -1.3; }
        if (PC.charging) { aL = -1.7 - Math.sin(R.time * 20) * 0.05; aR = -1.7; }
        if (PC.studyT > 0) { aR = -0.7; }
        if (PC.heavyHold) { const c = Math.min(1, PC.holdT / 0.75); aR = aL = -2.2 - c * 0.9 + Math.sin(R.time * 40) * 0.03 * c; lean = -0.25 * c; }
      }
      if (e.yielded) { aL = -2.6; aR = -2.6; }
      if (e.dancing) { const ph2 = R.time * 7 + e.id; aL = -2.4 + Math.sin(ph2) * 0.4; aR = -2.4 - Math.sin(ph2) * 0.4; lean = Math.sin(ph2 * 0.5) * 0.12; }
      // the work of the day, and the life of the street
      const ch = e.chore && !e.dead && !(e.state === 'windup' || e.state === 'attack' || e.state === 'flee') && (!moving || e.chore === 'carry' || e.chore === 'support' || e.chore === 'limp') ? e.chore : null;
      let choreY = 0, choreKneel = false;
      if (ch) {
        const ct = e.choreT || R.time, st = (k, lands) => { const p = (ct / k) % 1; return p < lands ? p / lands : 1 - (p - lands) / (1 - lands); };
        switch (ch) {
          case 'hoe': { const k = st(1.5, 0.62); aL = aR = U.lerp(-0.3, -2.7, 1 - Math.pow(1 - k, 2)); lean = U.lerp(0.35, -0.1, k); break; }
          case 'chop': { const k = st(1.35, 0.6); aL = aR = U.lerp(-0.5, -3.0, k); twist = U.lerp(0.5, -0.2, k); lean = U.lerp(0.3, -0.15, k); break; }
          case 'hammer': { const k = st(0.85, 0.55); aR = U.lerp(-0.9, -2.6, k); aL = -1.0; aLx = 0.3; lean = 0.15; break; }
          case 'sweep': { const w = Math.sin(R.time * 5.7 + e.id); aL = aR = -0.85; aLx = 0.3; aRx = -0.3; twist = w * 0.55; lean = 0.18; break; }
          case 'gather': { choreKneel = true; aR = -0.7 + Math.sin(R.time * 2.8 + e.id) * 0.35; aL = -0.4; break; }
          case 'draw': { const k = st(3.2, 0.5); aL = aR = U.lerp(-0.9, -1.9, k); lean = 0.1; break; }
          case 'pray': aL = aR = -1.15; aLx = 0.55; aRx = -0.55; lean = 0.12; break;
          case 'read': aL = aR = -1.0; aLx = 0.45; aRx = -0.45; lean = 0.18; break;
          case 'carry': aL = aR = -1.25; aLx = 0.35; aRx = -0.35; break;
          case 'hawk': aR = -2.0 + Math.sin(R.time * 3 + e.id) * 0.5; aL = -0.6; break;
          case 'talk': aR = -0.9 + Math.sin(R.time * 4.3 + e.id) * 0.35; aRx = Math.sin(R.time * 2.1) * 0.3; break;
          case 'point': aR = -1.65; break;
          case 'wave': aR = -2.9 + Math.sin(R.time * 11) * 0.35; aRx = 0.2; break;
          case 'cheer': { const b = Math.sin(R.time * 9 + e.id); aL = -2.75 + b * 0.25; aR = -2.75 - b * 0.25; choreY = Math.abs(b) * 0.07; break; }
          case 'mourn': aL = aR = -0.45; aLx = 0.3; aRx = -0.3; lean = 0.25; break;
          case 'bucket': aL = aR = -1.35; aLx = 0.25; aRx = -0.25; twist = Math.sin(R.time * 5.5 + e.id) * 0.45; lean = 0.12; break;
          case 'wait': aL = aR = -0.6; aLx = 0.2; aRx = -0.2; break;
          case 'support': aL = -1.3; aLx = 0.9; break;
          case 'limp': aR = -1.2; aRx = -0.9; lean = 0.22; break;
        }
      }
      if (e.type === 'ghost' && e.say && e.sayT > 0 && !e.kneel) { aR = -2.2; aL = -2.2; }
      if (e.role === 'captive') { aL = 0.4; aR = 0.4; }
      // Windups glint so you can read the attack coming.
      if (e.state === 'windup' && e !== game.pe) { lean = -0.18; v.tell = 1; } else v.tell = 0;
      const seated = (e.seated && !moving && e.indoor) || e.seatedGhost;
      if (seated) { P.legL.rotation.z = P.legR.rotation.z = -1.45; aL = aR = -0.45; }
      if (e.kneel || choreKneel) { P.legL.rotation.z = -1.5; P.legR.rotation.z = 0.2; if (!choreKneel) aL = aR = -0.3; }
      P.armL.rotation.z = aL; P.armR.rotation.z = aR;
      P.armL.rotation.x = aLx; P.armR.rotation.x = aRx;
      P.body.position.y = 0.42 + Math.abs(Math.sin(ph)) * 0.04 * (v.mv || 0) + Math.sin(R.time * 2 + v.bob) * 0.006 * (1 - (v.mv || 0));
      P.body.rotation.z = lean * 0.6;
      P.head.rotation.z = e.sayT > 0 ? Math.sin(R.time * 9) * 0.06 : 0;
      v.twist = twist;
      // side-step: the leading leg reaches out to the side, the other follows it in
      const st0 = v.strafe || 0, sp0 = Math.sin(ph);
      P.legL.rotation.x = Math.abs(st0) > 0.05 ? -st0 * 0.42 * Math.max(0, sp0) : 0;
      P.legR.rotation.x = Math.abs(st0) > 0.05 ? -st0 * 0.42 * Math.max(0, -sp0) : 0;
      if (Math.abs(st0) > 0.05 && !e.mounted) P.body.rotation.x = st0 * 0.06;
      else P.body.rotation.x = 0;
      // in the saddle: legs astride the barrel, hands on the reins, leaning
      // into the pace; rising to the trot, low and still over a gallop
      if (e.mounted && v.horse && !e.dead) {
        const hs = v.horse, g = hs.gait, ph = hs.phase * Math.PI * 2;
        P.legL.rotation.z = P.legR.rotation.z = -0.72 + (g === 'gallop' ? 0.12 : 0);
        P.legL.rotation.x = -0.52; P.legR.rotation.x = 0.52;
        const lean = g === 'gallop' ? 0.42 : g === 'canter' ? 0.24 : g === 'trot' ? 0.1 : 0.03;
        P.body.rotation.z = lean - hs.pitch * 0.6;
        P.body.position.y = 0.42 + (g === 'trot' ? Math.max(0, Math.sin(ph * 2)) * 0.05 : g === 'gallop' ? -hs.bob * 0.5 : 0);
        const rein = Math.sin(ph) * (g === 'canter' || g === 'gallop' ? 0.12 : 0.03);
        const PC = e === game.pe ? ECHO.PlayerCtl : {};
        const busy = (e.attackT > 0) || PC.drawing || PC.charging || PC.heavyHold || e.state === 'windup' || e.state === 'attack';
        P.armL.rotation.z = -0.95 - lean * 0.4 + rein; P.armL.rotation.x = 0.28;
        if (!busy) { P.armR.rotation.z = -0.95 - lean * 0.4 + rein; P.armR.rotation.x = -0.28; }
        if (PC.drawing || PC.charging) { P.armL.rotation.z = -1.5; P.armL.rotation.x = 0; }
        // rearing: lean into the neck and hold on
        if (hs.rear > 0.05) { P.body.rotation.z = lean + hs.rear * 0.35; }
        P.head.rotation.z = -lean * 0.6;
      }
      // in a boat: sitting on the thwart, pulling at the oars
      if (e.inBoat && e.inBoat !== 'ferry' && !e.dead) {
        P.legL.rotation.z = P.legR.rotation.z = -1.45; P.legL.rotation.x = -0.15; P.legR.rotation.x = 0.15;
        const ph = ((ECHO.Boats && ECHO.Boats.row && ECHO.Boats.row.stroke) || 0) * Math.PI * 2;
        if (e === game.pe && e.rowing && !(e.attackT > 0)) { P.armL.rotation.z = P.armR.rotation.z = -1.25 + Math.sin(ph) * 0.55; P.body.rotation.z = Math.sin(ph) * 0.3; }
        else if (!(e.attackT > 0)) { P.armL.rotation.z = P.armR.rotation.z = -0.5; }
        P.body.position.y = 0.42;
      }
      // swimming: stretched out, arms reaching overhead in turn, legs kicking
      if (e.swimming && !e.dead && !e.lurker) {
        const st = R.time * (e.moving ? 5 : 2.2);
        P.armL.rotation.z = -Math.PI * 0.5 - Math.sin(st) * 1.3; P.armR.rotation.z = -Math.PI * 0.5 + Math.sin(st) * 1.3;
        P.armL.rotation.x = 0.35; P.armR.rotation.x = -0.35;
        P.legL.rotation.z = Math.sin(st * 2) * 0.35; P.legR.rotation.z = -Math.sin(st * 2) * 0.35;
        P.body.rotation.z = e.moving ? 0.55 : 0.2; P.head.rotation.z = e.moving ? -0.5 : -0.2;
        P.body.position.y = 0.42;
      }
      v.inst.root.rotation.z = 0; v.yOff = 0;
      if (e.sleeping) { v.inst.root.rotation.z = Math.PI / 2; v.yOff = e.indoor && e.indoor.pose === 'bed' && !e.indoor.floor ? 0.62 : 0.18; }
      else if (e.yielded || e.role === 'captive') v.yOff = -0.18;
      else if (e.kneel || choreKneel) v.yOff = -0.22;
      else if (choreY) v.yOff = choreY;
      else if (e.seatedGhost) v.yOff = 0.15;
      else if (e.dancing) v.yOff = Math.abs(Math.sin(R.time * 7 + e.id)) * 0.08;
      else if (seated) v.yOff = e.indoor.spot && /bench/.test(e.indoor.spot.tag) ? 0 : 0.02;
      // dodge roll: tuck and tumble
      // Dodge roll: dip into a tuck, tumble over the shoulders around the body's
      // centre (not the feet), then rise out of the crouch.
      v.roll = null;
      if (e.rollT > 0) {
        const k = 1 - e.rollT / (e.rollDur || 0.38);
        const spin = k < 0.12 ? 0 : k > 0.86 ? 1 : (k - 0.12) / 0.74;
        const tuck = Math.sin(Math.min(1, k / 0.92) * Math.PI);            // 0 → 1 → 0
        const eased = spin * spin * (3 - 2 * spin);
        P.legL.rotation.z = P.legR.rotation.z = -1.7 * tuck;              // knees to chest
        P.armL.rotation.z = P.armR.rotation.z = -1.2 - 0.5 * tuck;         // arms wrapped in
        P.armL.rotation.x = 0.5 * tuck; P.armR.rotation.x = -0.5 * tuck;
        P.body.rotation.z = 0.35 * tuck;                                   // curl the back
        P.head.rotation.z = 0.4 * tuck;                                    // tuck the chin
        v.roll = { angle: eased * Math.PI * 2, tuck, k };
      }
    },
    animateCreature(game, e, v) {
      const P = v.inst.parts;
      const moving = (v.mv || 0) > 0.5 && !e.dead;
      const sp = e.species === 'gnawer' ? 22 : e.species === 'hare' ? 14 : 13;
      const ph = e.anim * sp;
      const sw = e.dead ? 0 : Math.sin(ph) * 0.7 * (v.mv || 0);
      if (P.legFL) { P.legFL.rotation.z = sw; P.legBR.rotation.z = sw; P.legFR.rotation.z = -sw; P.legBL.rotation.z = -sw; }
      if (P.tail) P.tail.rotation.y = Math.sin(R.time * 5 + v.bob) * 0.3;
      v.yOff = 0;
      if (e.species === 'hare') v.yOff = Math.abs(Math.sin(ph * 0.5)) * 0.18 * (v.mv || 0);
      if ((e.species === 'hind' || e.species === 'deer') && P.neck) { const graze = e.state === 'graze' && Math.sin(R.time * 0.7 + e.id) > 0.3; P.neck.rotation.y = U.lerp(P.neck.rotation.y || 0, graze ? -1.1 : 0, 0.08); }
      if (e.species === 'wolf' || e.species === 'fox') {
        // crouched to stalk; head down to feed, tugging at the kill
        const crouch = e.state === 'windup' ? 0.12 : e.state === 'stalk' && !e.target ? 0.09 : e.state === 'feed' ? 0.05 : 0;
        v.tell = e.state === 'windup' ? 1 : 0;
        P.body.position.y = 0.42 - crouch + Math.abs(Math.sin(ph)) * 0.03 * (v.mv || 0);
        P.head.rotation.z = e.state === 'lunge' ? 0.3 : e.state === 'windup' ? -0.15 : e.state === 'feed' ? -0.65 + Math.sin(R.time * 5 + e.id) * 0.12 : e.state === 'stalk' && !e.target ? -0.25 : 0;
      }
    },
    // Spiders and slimes are built here rather than in Blender.
    procMonster(e) {
      const root = new THREE.Group(), mats = [], parts = {};
      const mat = (c, o) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, flatShading: true, transparent: o != null, opacity: o == null ? 1 : o }); mats.push(m); return m; };
      if (e.shape === 'spider') {
        const queen = e.species === 'queen';
        const bodyM = mat(queen ? '#3a1a2a' : e.elite ? '#3a2a1a' : '#2a2228'), eyeM = new THREE.MeshBasicMaterial({ color: '#ff3a2a' });
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), bodyM); body.position.set(-0.05, 0.3, 0); root.add(body);
        const abd = new THREE.Mesh(new THREE.SphereGeometry(0.3, 9, 7), bodyM); abd.position.set(0.32, 0.36, 0); abd.scale.set(1.2, 0.9, 1); root.add(abd); parts.abd = abd;
        if (queen) { const mark = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), mat('#c83a3a')); mark.position.set(0.36, 0.6, 0); mark.scale.set(1.4, 0.3, 1); root.add(mark); }
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 7, 5), bodyM); head.position.set(-0.27, 0.3, 0); root.add(head);
        for (const z of [-0.05, 0.05]) { const ey = new THREE.Mesh(new THREE.SphereGeometry(0.03, 5, 4), eyeM); ey.position.set(-0.38, 0.35, z); root.add(ey); }
        parts.legs = [];
        for (let i = 0; i < 8; i++) {
          const side = i < 4 ? 1 : -1, k = i % 4;
          const pivot = new THREE.Group(); pivot.position.set(-0.12 + k * 0.08, 0.32, side * 0.12); root.add(pivot);
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.012, 0.55, 4), bodyM);
          leg.position.set(0, -0.12, side * 0.24); leg.rotation.x = side * 1.05; pivot.add(leg);
          pivot.rotation.y = (k - 1.5) * 0.35 * side;
          parts.legs.push(pivot);
        }
      } else {
        const col = e.species === 'slimeling' ? '#9fe8a0' : e.elite ? '#e8c84a' : '#6fd08a';
        const skin = mat(col, 0.72); skin.emissive = new THREE.Color('#0e3a1a');
        const blob = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 9, 0, Math.PI * 2, 0, Math.PI * 0.62), skin); blob.position.y = 0.05; root.add(blob); parts.blob = blob;
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), mat('#2a5a3a')); core.position.y = 0.2; root.add(core);
        for (const z of [-0.12, 0.12]) { const ey = new THREE.Mesh(new THREE.SphereGeometry(0.045, 5, 4), new THREE.MeshBasicMaterial({ color: '#102010' })); ey.position.set(-0.3, 0.3, z); root.add(ey); }
      }
      root.traverse(o => { if (o.isMesh) o.castShadow = true; });
      return { root, mats, parts };
    },
    animateProc(game, e, v, dt) {
      const P = v.inst.parts, mv = v.mv || 0;
      v.tell = e.state === 'windup' || e.state === 'cast' || e.state === 'slam' ? 1 : 0;
      if (P.legs) { const ph = R.time * 18; P.legs.forEach((g, i) => { g.rotation.z = e.dead ? 0.6 : Math.sin(ph + i * 1.7) * 0.35 * mv; }); if (P.abd) P.abd.position.y = 0.36 + Math.sin(R.time * 3) * 0.015; v.yOff = 0; }
      if (P.blob) { const q = Math.sin(R.time * (mv > 0.5 ? 9 : 3) + v.bob); P.blob.scale.set(1 + q * 0.08, 1 - q * 0.1, 1 + q * 0.08); v.yOff = mv > 0.5 ? Math.abs(Math.sin(R.time * 9)) * 0.08 : 0; }
    },
    animateBoss(game, e, v) {
      const P = v.inst.parts;
      const moving = e.moving;
      const ph = R.time * 6;
      const sw = moving ? Math.sin(ph) * 0.45 : 0;
      if (P.legFL) { P.legFL.rotation.z = sw; P.legBR.rotation.z = sw; P.legFR.rotation.z = -sw; P.legBL.rotation.z = -sw; }
      const open = (e.state === 'windup' || e.state === 'feint') ? Math.min(1, e.t * 2.5) : e.state === 'strike' ? 1 : e.state === 'roar' ? 1 : 0;
      v.tell = e.state === 'windup' ? 1 : 0;
      if (P.jaw) P.jaw.rotation.z = -0.6 * open;
      if (P.head) P.head.rotation.z = e.state === 'roar' ? -0.4 : e.state === 'windup' ? -0.2 : 0;
      if (P.wingL) { const f = e.state === 'roar' ? Math.sin(R.time * 14) * 0.6 : 0.1 * Math.sin(R.time * 2); P.wingL.rotation.x = f; P.wingR.rotation.x = -f; }
      if (P.seg0) for (let i = 0; i < 8; i++) { const s = P['seg' + i]; if (!s) continue; s.position.z = Math.sin(R.time * (moving ? 7 : 2) - i * 0.8) * (moving ? 0.35 : 0.12); }
      if (P.tail) P.tail.rotation.y = Math.sin(R.time * 2) * 0.25;
      v.yOff = 0;
      if (e.state === 'charge' && e.chargePhase === 'go') v.inst.root.rotation.z = 0.12; else v.inst.root.rotation.z = 0;
    },
    updateEntities(game, dt) {
      const seen = new Set();
      for (const e of game.ents) {
        if (e.vanish) continue;
        const v = R.view(game, e);
        if (!v) continue;
        seen.add(e);
        const root = v.inst.root;
        // people and creatures fade in and out rather than popping: newcomers,
        // folk stepping in and out of doors
        const special = e === game.pe || e.dead || e.type === 'ghost' || e.species === 'hind' || e.mutation === 'paleshade' || e.lurker;
        if (v.alpha == null) v.alpha = special || (game.noFadeUntil && game.time < game.noFadeUntil) || (R.frameNo || 0) < 5 ? 1 : 0;
        if (special) v.alpha = 1;
        else v.alpha = U.clamp(v.alpha + (e.hidden ? -1 : 1) * dt * 3.2, 0, 1);
        root.visible = v.alpha > 0.01;
        if (!special) R.fadeView(v, v.alpha);
        if (!root.visible) continue;
        v.cfgT -= dt;
        if (v.cfgT <= 0) { v.cfgT = 1; R.configure(game, e, v); v.baseScale = root.scale.x; }
        // Smooth what the eye sees: position eases toward the simulation,
        // and "walking" fades in and out instead of flickering on and off.
        if (v.px == null || Math.hypot(e.x - v.px, e.y - v.py) > 1.5 || e === game.pe) { v.px = e.x; v.py = e.y; }
        else { const kp = 1 - Math.exp(-dt * 16); v.px += (e.x - v.px) * kp; v.py += (e.y - v.py) * kp; }
        const spd = dt > 0 ? Math.hypot(e.x - (v.lx == null ? e.x : v.lx), e.y - (v.ly == null ? e.y : v.ly)) / dt : 0;
        if (spd > 0.3) v.vdir = Math.atan2(e.y - v.ly, e.x - v.lx);
        v.lx = e.x; v.ly = e.y;
        v.spd = v.spd == null ? spd : v.spd + (spd - v.spd) * Math.min(1, dt * 10);
        const wantMv = e.moving || v.spd > 0.35 ? 1 : 0;
        if (dt > 0) v.mv = (v.mv == null ? wantMv : v.mv + (wantMv - v.mv) * Math.min(1, dt * 7));
        if (e.shape === 'rat') R.animateCreature(game, { ...e, species: 'gnawer' }, v);
        else if (e.shape) R.animateProc(game, e, v, dt);
        else if (e.type === 'player' || e.type === 'person' || e.type === 'ghost' || e.humanoid) R.animatePerson(game, e, v, dt);
        else if (e.type === 'creature') R.animateCreature(game, e, v);
        else R.animateBoss(game, e, v);
        // facing: smooth turn toward e.dir
        let target = e.dir != null ? e.dir : 0;
        if (e.dead && e.deathAngle != null) target = e.deathAngle + Math.PI; // face the blow, fall away from it
        if (e.indoor && !e.moving && !e.dead && e.indoor.pose !== 'stand' && (e.seated || e.sleeping)) { target = e.indoor.dir; v.dir = target; }
        if (e.rollT > 0 && e.rollDir != null) { target = e.rollDir; v.dir = target; }
        const turn = U.angleDiff(v.dir, target);
        // NPCs ignore tiny heading wobbles and turn at a natural pace
        if (e === game.pe || e.dead || Math.abs(turn) > 0.18 || (v.mv || 0) > 0.5) v.dir += turn * Math.min(1, dt * (e.dead ? 30 : e === game.pe ? 14 : 9));
        root.rotation.y = Math.PI - v.dir + (v.twist || 0) + (e === game.pe && e.inBoat === true ? Math.PI : 0);  // a rower faces the stern
        v.twist = 0;
        // on the bed when wading; afloat, head and shoulders out, when swimming
        const sink = e.lurker ? 0.78 : (e.type === 'player' || e.type === 'person' || e.humanoid) ? 0.62 : e.type === 'boss' ? 0.8 : 0.5;
        const gy = e.inBoat ? ECHO.Water.SURFACE + (e.inBoat === 'ferry' ? 0.34 : -0.14) + Math.sin(R.time * 1.6) * 0.02 : e.swimming ? ECHO.Water.SURFACE - sink + Math.sin(R.time * 3 + (e.id || 0)) * 0.02 : R.standH(v.px, v.py);
        let hy = 0;
        if (e === game.pe) { v.horse = R.syncHorse(game, dt, e.mounted ? v : null); if (v.horse && e.mounted) hy = v.horse.seat - gy - 0.4; }
        else if (e.mounted || v.horse) {
          v.horse = e.mounted && !ECHO.Interior.cur && !e.dead ? R.driveHorse(game, R.horseFor('ent:' + (e.npcId || e.id), e.horseBreed || 'pony'), dt, v.px, v.py, v.dir, v.spd || 0, { ridden: true, quiet: true }) : null;
          if (v.horse) hy = v.horse.seat - gy - 0.4;
        }
        root.position.set(v.horse && e.mounted ? v.horse.sx : v.px, gy + (v.yOff || 0) + hy, v.horse && e.mounted ? v.horse.sz : v.py);
        // hurt: squash and recoil
        const base = v.baseScale || (v.baseScale = root.scale.x);
        const hk = e.hurtT > 0 && !e.dead ? e.hurtT / 0.18 : 0;
        root.scale.set(base * (1 + hk * 0.12), base * (1 - hk * 0.14), base * (1 + hk * 0.12));
        if (v.roll) {
          // rotate about a pivot at hip height; the body sinks into the tuck as it turns
          const c = 0.42 * base, th = v.roll.angle;
          const sink = 0.22 * base * v.roll.tuck;
          const ox = c * Math.sin(th), oy = c - c * Math.cos(th) - sink;   // pivot (0,c): feet swing up and over
          const yaw = root.rotation.y;
          root.rotation.z = th;
          root.position.x += ox * Math.cos(yaw); root.position.z -= ox * Math.sin(yaw); root.position.y += oy;
          root.scale.y *= 1 - 0.12 * v.roll.tuck;
        }
        // death: thrown backward, then sink and fade
        if (e.dead) {
          const k = Math.min(1, (e.deathT || 0) * 4);
          const fall = (1 - Math.pow(1 - k, 2)) * Math.PI / 2;
          if (e.deathAngle != null) { root.rotation.z = -fall; root.rotation.x = 0; }
          else root.rotation.x = fall * (v.bob > 3 ? 1 : -1);
          root.position.y = gy + 0.1 + Math.sin(k * Math.PI) * 0.25 - Math.max(0, (e.deathT || 0) - 1) * 0.08;
          const op = Math.max(0, 1 - Math.max(0, (e.deathT || 0) - 1.5) / 1.5);
          for (const m of v.inst.mats) { if (op < 1) { m.transparent = true; m.opacity = op; } }
        } else root.rotation.x = 0;
        // hurt flash (white-hot then red), attack tells, burning
        const flash = e.hurtT > 0 ? (e.hurtT > 0.12 ? 2 : 1) : 0;
        const tell = v.tell ? (Math.sin(R.time * 30) > 0 ? 2 : 1) : 0;
        if (flash !== v.flash || tell !== v.tellW || e.burn > 0) {
          v.flash = flash; v.tellW = tell;
          let r = 0, g2 = 0, b = 0;
          if (e.burn > 0) { r = 0.5; g2 = 0.18; }
          if (tell) { const t = tell === 2 ? 0.55 : 0.3; r = t; g2 = t * 0.8; b = t * 0.6; }
          if (flash === 2) { r = 1.4; g2 = 1.3; b = 1.2; } else if (flash === 1) { r = 0.9; g2 = 0.15; b = 0.1; }
          for (const m of v.inst.mats) if (m.emissive) m.emissive.setRGB(r, g2, b);
        }
        // ghosts and the White Hind fade in and out, and glow faintly
        if ((e.type === 'ghost' || e.species === 'hind') && !e.dead) {
          const a = Math.max(0, Math.min(1, e.alpha == null ? 1 : e.alpha)) * (e.type === 'ghost' ? 0.9 + Math.sin(R.time * 3 + e.id) * 0.1 : 1);
          for (const m of v.inst.mats) {
            m.transparent = a < 0.99; m.opacity = a; m.depthWrite = a > 0.95;
            if (m.emissive) m.emissive.set(e.type === 'ghost' ? '#3d6a96' : '#4a4e58');
          }
          root.visible = a > 0.01;
        }
        // silhouette only when trees stand between the camera and the player
        if (v.ghostMat) {
          let hid = false;
          if (!ECHO.Interior.cur) for (let dy = 0; dy <= 2 && !hid; dy++) for (let dx = -1; dx <= 1; dx++) if (ECHO.World.tile(game.world, e.x + dx, e.y + dy + 0.3) === TILE.TREE) { hid = true; break; }
          const want = hid ? 0.4 : 0;
          v.ghostMat.opacity += (want - v.ghostMat.opacity) * Math.min(1, dt * 10);
          v.ghostMat.visible = v.ghostMat.opacity > 0.02;
        }
        // stealthy player while sneaking
        if (e === game.pe) {
          const ghost = e.iframes > 0 ? 0.55 : ECHO.PlayerCtl.sneaking ? 0.75 : 1;
          if (ghost !== v.ghost) { v.ghost = ghost; for (const m of v.inst.mats) { m.transparent = ghost < 1; m.opacity = ghost; } }
        }
      }
      // loose horses whose riders fell
      if (ECHO.Riders && !ECHO.Interior.cur) for (const h of ECHO.Riders.loose) R.driveHorse(game, R.horseFor('loose:' + h.id, h.breed), dt, h.x, h.y, h.dir, h.v, { ridden: false, rear: h.rearT > 0, snap: true, quiet: true });
      R.syncBoats(game, dt);
      R.syncCamp(game, dt);
      R.syncBirds(game, dt);
      R.syncForage(game);
      R.syncFly(game);
      R.endHorses(); R.frameNo = (R.frameNo || 0) + 1;
      for (const [e, v] of R.views) {
        if (!seen.has(e)) {
          R.views.delete(e);
          // someone who just left our sight (not killed): let them fade, not blink out
          if (!e.dead && v.inst.root.visible && (v.alpha || 0) > 0.05 && !ECHO.Interior.cur === !(e.x >= 9000) && !(game.noFadeUntil && game.time < game.noFadeUntil)) { (R.fading = R.fading || []).push(v); continue; }
          R.groups.ents.remove(v.inst.root);
          for (const m of v.inst.mats) m.dispose();
        }
      }
      if (R.fading && R.fading.length) R.fading = R.fading.filter(v => {
        v.alpha -= dt * 3.2;
        if (v.alpha <= 0) { R.groups.ents.remove(v.inst.root); for (const m of v.inst.mats) m.dispose(); return false; }
        R.fadeView(v, v.alpha); return true;
      });
    },
    fadeView(v, a) {
      if (a < 0.995) { for (const m of v.inst.mats) { m.transparent = true; m.opacity = a; } v.faded = true; }
      else if (v.faded) { for (const m of v.inst.mats) { m.transparent = false; m.opacity = 1; } v.faded = false; }
    },

    // ---------------------------------------------------------------- effects
    initParticles() {
      const N = 1500;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
      R.parts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.14, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.95, depthWrite: false }));
      R.parts.frustumCulled = false;
      R.scene.add(R.parts);
      const sg = new THREE.BufferGeometry();
      const SN = 900;
      const sp = new Float32Array(SN * 3);
      for (let i = 0; i < SN; i++) { sp[i * 3] = Math.random() * 60 - 30; sp[i * 3 + 1] = Math.random() * 18; sp[i * 3 + 2] = Math.random() * 60 - 30; }
      sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
      R.snow = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.09, color: '#f0f6ff', transparent: true, opacity: 0.9, depthWrite: false }));
      R.snow.frustumCulled = false;
      R.scene.add(R.snow);
      // rain: short falling streaks around the camera
      const RN = 1400;
      const rp = new Float32Array(RN * 6);
      for (let i = 0; i < RN; i++) { const x = Math.random() * 50 - 25, y = Math.random() * 20, z = Math.random() * 50 - 25; rp.set([x, y, z, x + 0.06, y - 0.55, z + 0.03], i * 6); }
      const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
      R.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: '#a8bcd0', transparent: true, opacity: 0.45, depthWrite: false }));
      R.rain.frustumCulled = false; R.rain.visible = false;
      R.scene.add(R.rain);
      R.flashT = 0;
      // Glows: wisps, fireflies, lanterns, fallen stars — soft additive points
      const GN = 1800;
      const gg = new THREE.BufferGeometry();
      gg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(GN * 3), 3));
      gg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(GN * 3), 3));
      gg.setAttribute('size', new THREE.BufferAttribute(new Float32Array(GN), 1));
      gg.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(GN), 1));
      R.glowMat = new THREE.ShaderMaterial({
        uniforms: { scale: { value: 800 } },
        vertexShader: 'uniform float scale; attribute float size; attribute float alpha; varying vec3 vC; varying float vA; void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = min(256.0, size * scale / -mv.z); gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'varying vec3 vC; varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; if (r > 1.0) discard; float a = pow(1.0 - r, 1.8); float core = smoothstep(0.35, 0.0, r); gl_FragColor = vec4(vC * (0.8 + core * 0.9), a * vA); }',
        vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
      });
      R.glows = new THREE.Points(gg, R.glowMat);
      R.glows.frustumCulled = false; R.glows.renderOrder = 6;
      R.scene.add(R.glows);
      R.festGroup = new THREE.Group(); R.scene.add(R.festGroup); R.festKey = ''; R.festFlames = [];
    },
    // A house on fire: tongues of flame licking up over the roof, and a char on it
    // when it's done.
    updateTownFires(game, room) {
      const T = ECHO.Town;
      if (!T) return;
      if (!R.townFire) { R.townFire = new THREE.Group(); R.scene.add(R.townFire); R.townFireMat = [new THREE.MeshBasicMaterial({ color: '#ff7a10', transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }), new THREE.MeshBasicMaterial({ color: '#e8380a', transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false })]; R.townFireGeo = new THREE.ConeGeometry(0.32, 1.3, 6); R.townFireGeo.translate(0, 0.65, 0); R.townFireKey = ''; }
      const live = room ? [] : T.fires.filter(f => !f.done);
      const key = live.map(f => f.b.x + ',' + f.b.y).join('|');
      if (key !== R.townFireKey) {
        R.townFireKey = key;
        while (R.townFire.children.length) R.townFire.remove(R.townFire.children[0]);
        for (const f of live) {
          const b = f.b, n = Math.max(6, Math.round(b.w * b.h * 1.4));
          for (let i = 0; i < n; i++) {
            const m = new THREE.Mesh(R.townFireGeo, R.townFireMat[i % 2]);
            const x = b.x + 0.3 + Math.random() * (b.w - 0.6), y = b.y + 0.3 + Math.random() * (b.h - 0.6);
            // on the slope of the roof: higher toward the ridge
            const ridge = 1 - Math.abs((y - b.y) / b.h - 0.5) * 2;
            m.position.set(x, R.groundH(b.x + b.w / 2, b.y + b.h / 2) + 2.5 + ridge * 0.9, y);
            m.userData = { ph: Math.random() * 7, f, s0: 0.4 + Math.random() * 0.45 };
            R.townFire.add(m);
          }
        }
      }
      // gutted houses: a soot shell and blackened beams through the roof
      if (!R.ruinGroup) { R.ruinGroup = new THREE.Group(); R.scene.add(R.ruinGroup); R.ruinKey = ''; R.sootMat = new THREE.MeshStandardMaterial({ color: '#0e0a08', roughness: 1, transparent: true, opacity: 0.8, depthWrite: false }); R.beamMat = new THREE.MeshStandardMaterial({ color: '#0f0a07', roughness: 1 }); R.emberMat = new THREE.MeshBasicMaterial({ color: '#ff5a1a', transparent: true, opacity: 0.7 }); }
      const pe = game.pe, ruins = [];
      if (!room && pe) for (const s of game.world.settlements) { if (Math.abs(s.x - pe.x) > 70 || Math.abs(s.y - pe.y) > 70) continue; for (const b of s.buildings) if (b.gutted != null) ruins.push(b); }
      const rk = ruins.map(b => b.x + ',' + b.y).join('|');
      if (rk !== R.ruinKey) {
        R.ruinKey = rk;
        while (R.ruinGroup.children.length) { const o = R.ruinGroup.children[0]; R.ruinGroup.remove(o); if (o.geometry) o.geometry.dispose(); }
        for (const b of ruins) {
          const gy = R.groundH(b.x + b.w / 2, b.y + b.h / 2);
          // soot up the walls, and the roof fallen in: a black, broken cap where it was
          const shell = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.1, 2.75, b.h + 0.1), R.sootMat);
          shell.position.set(b.x + b.w / 2, gy + 1.375, b.y + b.h / 2); R.ruinGroup.add(shell);
          const cap = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1, 4), R.beamMat);
          cap.rotation.y = Math.PI / 4; cap.scale.set(b.w + 0.5, 1.15, b.h + 0.5);
          cap.position.set(b.x + b.w / 2, gy + 2.6 + 0.55, b.y + b.h / 2); R.ruinGroup.add(cap);
          const n = Math.max(3, Math.round(b.w * 1.3));
          for (let i = 0; i < n; i++) {
            const bh = 2.6 + (i % 3) * 0.5;
            const beam = new THREE.Mesh(new THREE.BoxGeometry(0.22, bh, 0.22), R.beamMat);
            beam.position.set(b.x + b.w * (i + 0.5) / n, gy + 2.6 + bh / 2, b.y + b.h * (0.35 + (i % 2) * 0.3));
            beam.rotation.z = ((i * 37) % 7 - 3) * 0.08; beam.rotation.x = ((i * 53) % 5 - 2) * 0.1;
            R.ruinGroup.add(beam);
            if (i % 2 === 0) { const em = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), R.emberMat); em.position.set(beam.position.x, gy + 2.6 + bh * 0.9, beam.position.z); R.ruinGroup.add(em); }
          }
        }
      }
      for (const m of R.townFire.children) {
        const u = m.userData, h = u.f.heat;
        const k = u.s0 * (0.3 + h * 0.75) * (1 + Math.sin(R.time * 11 + u.ph) * 0.18);
        m.scale.set(k * 0.9, k * (1.1 + Math.sin(R.time * 7.3 + u.ph) * 0.25), k * 0.9);
        m.visible = h > 0.03;
      }
    },
    updateGlows(game) {
      const list = (ECHO.Marvels ? ECHO.Marvels.glows : []).concat(ECHO.Fest ? ECHO.Fest.glows : [], ECHO.Quests ? ECHO.Quests.glows : [], ECHO.Patrol ? ECHO.Patrol.glows : [], ECHO.Finds ? ECHO.Finds.glows : [], ECHO.Purpose ? ECHO.Purpose.glows : [], ECHO.Progress ? ECHO.Progress.glows : [], ECHO.Jobs ? ECHO.Jobs.glows : [], ECHO.Town ? ECHO.Town.glows : []);
      const ga = R.glows.geometry.attributes;
      const n = Math.min(list.length, ga.size.count);
      const tmp = R._gc || (R._gc = new THREE.Color());
      const room = ECHO.Interior && ECHO.Interior.cur;
      let k = 0;
      if (!room) for (let i = 0; i < n; i++) {
        const g = list[i];
        ga.position.setXYZ(k, g.x, R.groundH(g.x, g.y) + g.h, g.y);
        tmp.set(g.c); ga.color.setXYZ(k, tmp.r, tmp.g, tmp.b);
        ga.size.setX(k, g.s); ga.alpha.setX(k, Math.min(1, g.a));
        k++;
      }
      R.glows.geometry.setDrawRange(0, k);
      for (const key of ['position', 'color', 'size', 'alpha']) ga[key].needsUpdate = true;
      R.glowMat.uniforms.scale.value = R.ch / (2 * Math.tan(THREE.MathUtils.degToRad(R.camera.fov / 2)));
    },
    // Festival dressing in the square, rebuilt when it changes.
    updateFestival(game) {
      const F = ECHO.Fest;
      if (!F) return;
      const near = F.near(game);
      const c = F.contest;
      const key = near.map(L => L.key + (L.live ? 'L' : '')).join(',') + '|' + (c ? c.targets.map(t => t.x.toFixed(1)).join(':') : '');
      if (key !== R.festKey) {
        R.festKey = key;
        const g = R.festGroup;
        while (g.children.length) { const m = g.children[0]; g.remove(m); m.traverse && m.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material !== R.mat.prop && o.material !== R.mat.glow) o.material.dispose(); }); }
        R.festFlames = [];
        const poleMat = new THREE.MeshStandardMaterial({ color: C('#6a4a2c'), roughness: 0.9 });
        for (const L of near) {
          for (const p of L.poles) {
            const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.6, 6), poleMat);
            m.position.set(p.x, R.groundH(p.x, p.y) + 1.3, p.y); m.castShadow = true; g.add(m);
          }
          for (let i = 0; i < L.poles.length; i++) {
            const a = L.poles[i], b = L.poles[(i + 1) % L.poles.length];
            if (U.dist(a.x, a.y, b.x, b.y) > 7) continue;
            const pts = [];
            for (let k = 0; k <= 10; k++) { const t = k / 10; const x = U.lerp(a.x, b.x, t), y = U.lerp(a.y, b.y, t); pts.push(new THREE.Vector3(x, R.groundH(x, y) + 2.5 - Math.sin(t * Math.PI) * 0.5, y)); }
            g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#2a2018' })));
          }
          // the stall: a striped awning in the festival's colours
          const st = new THREE.Group();
          const cols = L.f.colors;
          const counter = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 0.6), new THREE.MeshStandardMaterial({ color: C('#7a5634'), roughness: 0.9 }));
          counter.position.y = 0.35; counter.castShadow = true; st.add(counter);
          for (const sx of [-0.75, 0.75]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.7, 0.08), poleMat); post.position.set(sx, 0.85, -0.25); st.add(post); }
          for (let i = 0; i < 6; i++) { const aw = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.9), new THREE.MeshStandardMaterial({ color: C(cols[i % cols.length]), roughness: 0.8 })); aw.position.set(-0.75 + i * 0.3, 1.75, 0); aw.rotation.x = 0.25; st.add(aw); }
          st.position.set(L.stall.x, R.groundH(L.stall.x, L.stall.y), L.stall.y);
          g.add(st);
          if (L.live) {
            R.addStatic(g, 'campfire', L.fire.x, L.fire.y, null, 0, 1.7);
            for (const [s, col, h] of [[0.55, '#ff5a1f', 1.3], [0.36, '#ffb347', 1.0], [0.2, '#ffe28a', 0.7]]) {
              const fl = new THREE.Mesh(new THREE.ConeGeometry(s, h, 7), new THREE.MeshBasicMaterial({ color: C(col), transparent: true, opacity: 0.9 }));
              fl.position.set(L.fire.x, R.groundH(L.fire.x, L.fire.y) + 0.35 + h / 2, L.fire.y);
              fl.userData.h = h; g.add(fl); R.festFlames.push(fl);
            }
          }
        }
        if (c) for (const t of c.targets) {
          const tg = new THREE.Group();
          const tex = R.targetTex || (R.targetTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x2 = cv.getContext('2d'); const rings = ['#e8e0d0', '#c8463a', '#e8e0d0', '#c8463a', '#f2d060']; rings.forEach((col, i) => { x2.fillStyle = col; x2.beginPath(); x2.arc(64, 64, 64 - i * 12.5, 0, Math.PI * 2); x2.fill(); }); const tx = new THREE.CanvasTexture(cv); tx.encoding = THREE.sRGBEncoding; return tx; })());
          const face = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
          face.position.y = 1.0; face.rotation.x = -0.5; tg.add(face);
          const back = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.12, 20), new THREE.MeshStandardMaterial({ color: C('#c8b070'), roughness: 1 }));
          back.rotation.x = Math.PI / 2 - 0.5; back.position.set(0, 1.0, -0.07); tg.add(back);
          for (const sx of [-0.3, 0.3]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, 0.06), poleMat); leg.position.set(sx, 0.5, -0.12); tg.add(leg); }
          tg.position.set(t.x, R.groundH(t.x, t.y), t.y);
          g.add(tg);
        }
      }
      for (const fl of R.festFlames) fl.scale.set(1 + Math.sin(R.time * 11 + fl.userData.h * 5) * 0.08, 1 + Math.sin(R.time * 13 + fl.userData.h * 7) * 0.18, 1);
      R.festGroup.visible = !(ECHO.Interior && ECHO.Interior.cur);
    },
    parseColor(str) {
      const m = /rgba?\(([^)]+)\)/.exec(str || '');
      if (!m) return { c: new THREE.Color(str || '#ffffff'), a: 1 };
      const p = m[1].split(',').map(Number);
      return { c: new THREE.Color(`rgb(${p[0] | 0},${p[1] | 0},${p[2] | 0})`), a: p[3] != null ? p[3] : 1 };
    },
    updateFx(game, dt) {
      const fx = ECHO.Combat.fx;
      const live = new Set();
      // Particles
      const pa = R.parts.geometry.attributes.position, ca = R.parts.geometry.attributes.color;
      let n = 0;
      const tmp = new THREE.Color();
      for (const f of fx) {
        if (f.kind !== 'p' && f.kind !== 'smoke') continue;
        if (n >= pa.count) break;
        if (f.h0 == null) { f.h0 = f.spark ? 0.6 + Math.random() * 0.3 : 0.45 + Math.random() * 0.3; f.vz = f.spark ? 1.5 + Math.random() * 3 : 0.8 + Math.random() * 2.2; }
        let h;
        if (f.kind === 'smoke') { h = (f.sh || 1.0) + f.t * 0.7; f.x += (f.vx || 0) * dt; f.y += 0; }
        else h = Math.max(0.03, f.h0 + f.vz * f.t - 4 * f.t * f.t);
        pa.setXYZ(n, f.x, R.groundH(f.x, f.y) + h, f.y);
        const fade = 1 - f.t / f.life;
        if (f.kind === 'smoke') tmp.setRGB(0.55, 0.55, 0.55).multiplyScalar(0.4 + fade * 0.6);
        else { const pc = R.parseColor(f.color); tmp.copy(pc.c).convertSRGBToLinear().multiplyScalar(f.spark ? 1.6 * fade + 0.2 : 0.4 + 0.6 * fade); }
        ca.setXYZ(n, tmp.r, tmp.g, tmp.b);
        n++;
      }
      R.parts.geometry.setDrawRange(0, n);
      pa.needsUpdate = true; ca.needsUpdate = true;
      // Ripples on the water
      if (ECHO.Water) {
        if (!R.ripplePool) {
          R.ripplePool = [];
          const geo = new THREE.RingGeometry(0.82, 1, 32); geo.rotateX(-Math.PI / 2);
          for (let i = 0; i < 90; i++) { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#e6f4f8', transparent: true, opacity: 0, depthWrite: false })); m.visible = false; m.renderOrder = 3; R.groups.fx.add(m); R.ripplePool.push(m); }
        }
        const rs = ECHO.Interior.cur ? [] : ECHO.Water.ripples;
        for (let i = 0; i < R.ripplePool.length; i++) {
          const m = R.ripplePool[i], r = rs[i];
          if (!r) { m.visible = false; continue; }
          const k = r.t / r.life;
          m.visible = true;
          m.position.set(r.x, ECHO.Water.SURFACE + 0.04 + Math.sin(r.x * 0.9 + R.time * 1.3) * 0.02, r.y);
          m.scale.setScalar(Math.max(0.05, r.size * (0.15 + k * 0.85)));
          m.material.opacity = 0.55 * (1 - k) * (1 - k);
        }
      }
      // Fish in the shallows
      if (ECHO.WildWater) {
        if (!R.fishMesh) {
          const g = new THREE.BoxGeometry(0.2, 0.035, 0.06);
          R.fishMesh = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4, metalness: 0.3 }), 48);
          R.fishMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(48 * 3), 3);
          R.fishMesh.frustumCulled = false; R.groups.fx.add(R.fishMesh);
        }
        const F = ECHO.Interior.cur ? [] : ECHO.WildWater.fish, M = R.fishMesh, o = R._fo || (R._fo = new THREE.Object3D()), col = new THREE.Color();
        let n = 0;
        for (const f of F) {
          if (n >= 48) break;
          o.position.set(f.x, ECHO.Water.SURFACE - 0.09, f.y);
          o.rotation.set(0, -f.dir + Math.sin(R.time * (6 + f.v * 6) + f.x * 3) * 0.25, 0);
          o.scale.setScalar(f.size);
          o.updateMatrix(); M.setMatrixAt(n, o.matrix);
          col.setHSL(0.52 + f.hue * 0.08, 0.15, 0.32 + f.hue * 0.15); M.setColorAt(n, col);
          n++;
        }
        M.count = n; M.instanceMatrix.needsUpdate = true; if (M.instanceColor) M.instanceColor.needsUpdate = true; M.visible = n > 0;
      }
      // Shapes: telegraphs, slashes, rings
      for (const f of fx) {
        if (f.kind !== 'tele' && f.kind !== 'slash' && f.kind !== 'ring') continue;
        live.add(f);
        let m = R.fxMeshes.get(f);
        if (!m) { m = R.makeFxMesh(f); if (!m) continue; R.fxMeshes.set(f, m); R.groups.fx.add(m); }
        const prog = Math.min(1, f.t / f.life);
        if (f.kind === 'tele') {
          if (f.follow && !f.follow.dead && f.shape !== 'circle') { f.x = f.follow.x; f.y = f.follow.y; }
          const cx = f.shape === 'circle' ? (f.cx != null ? f.cx : f.x) : f.x, cy = f.shape === 'circle' ? (f.cy != null ? f.cy : f.y) : f.y;
          m.position.set(cx, R.groundH(cx, cy) + 0.05, cy);
          if (m.userData.inner) m.userData.inner.scale.setScalar(Math.max(0.01, prog));
          if (f.done) m.visible = false;
        } else if (f.kind === 'slash') {
          m.position.set(f.x, R.groundH(f.x, f.y) + 0.55, f.y);
          m.material.opacity = 0.95 * (1 - prog * prog);
          m.scale.setScalar(f.style === 'heavy' ? 0.6 + prog * 0.6 : 0.75 + prog * 0.3);
          if (f.style === 'finisher') m.rotation.y = -prog * 1.2;
        } else {
          m.position.set(f.x, R.groundH(f.x, f.y) + 0.08, f.y);
          m.scale.setScalar(Math.max(0.01, f.radius * (0.3 + prog * 0.7)));
          m.material.opacity = 0.9 * (1 - prog);
        }
      }
      for (const [f, m] of R.fxMeshes) if (!live.has(f) || f.done && f.kind !== 'tele') { R.groups.fx.remove(m); m.geometry.dispose(); m.material.dispose(); if (m.userData.inner) { m.userData.inner.geometry.dispose(); } R.fxMeshes.delete(f); }
      // Target-lock marker: a turning ring of four arrowheads under the target
      const lk = ECHO.PlayerCtl.lock;
      if (!R.lockMesh) {
        const g = new THREE.Group();
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.7, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff5a3c', transparent: true, opacity: 0.85, depthWrite: false }));
        g.add(ring);
        for (let i = 0; i < 4; i++) {
          const tri = new THREE.Mesh(new THREE.CircleGeometry(0.16, 3).rotateX(-Math.PI / 2), ring.material);
          const a = i * Math.PI / 2;
          tri.position.set(Math.cos(a) * 0.86, 0, Math.sin(a) * 0.86);
          tri.rotation.y = -a + Math.PI;
          g.add(tri);
        }
        g.renderOrder = 3;
        R.lockMesh = g; R.scene.add(g);
      }
      R.lockMesh.visible = !!lk;
      if (lk) {
        const sc = lk.type === 'boss' ? 2.6 : lk.species === 'gnawer' ? 0.7 : 1.05;
        R.lockMesh.position.set(lk.x, R.groundH(lk.x, lk.y) + 0.06, lk.y);
        R.lockMesh.rotation.y = R.time * 1.6;
        R.lockMesh.scale.setScalar(sc * (1 + Math.sin(R.time * 6) * 0.04));
      }
      // Projectiles
      const pl = new Set();
      for (const p of ECHO.Combat.proj) {
        pl.add(p);
        let m = R.projMeshes.get(p);
        if (!m) {
          if (p.kind === 'fire') m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16 + p.radius * 0.08, 1), new THREE.MeshBasicMaterial({ color: p.star ? '#cfeaff' : '#ffb347' }));
          else if (p.kind === 'spit') m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 0), new THREE.MeshBasicMaterial({ color: '#9ad84a' }));
          else if (p.kind === 'orb') m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 1), new THREE.MeshBasicMaterial({ color: p.color || '#b48aff' }));
          else m = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.035, 0.035), new THREE.MeshStandardMaterial({ color: p.kind === 'bolt' ? '#4a4a52' : '#d8c8a0' }));
          R.projMeshes.set(p, m); R.groups.fx.add(m);
        }
        m.position.set(p.x, R.groundH(p.x, p.y) + 0.6, p.y);
        m.rotation.y = -p.angle;
        if (p.kind === 'fire' || p.kind === 'orb') m.rotation.x += dt * 8;
      }
      for (const [p, m] of R.projMeshes) if (!pl.has(p)) { R.groups.fx.remove(m); m.geometry.dispose(); m.material.dispose(); R.projMeshes.delete(p); }
      // Loot
      const ll = new Set();
      for (const l of game.loot) {
        ll.add(l);
        let m = R.lootMeshes.get(l);
        if (!m) {
          const it = l.kind === 'item' && game.world.items[l.itemId];
          const rc = it && it.rarity ? ECHO.Gear.rarity(it.rarity).color : null;
          m = l.kind === 'item' ? new THREE.Mesh(new THREE.BoxGeometry(it && it.kind === 'armor' ? 0.4 : 0.7, it && it.kind === 'armor' ? 0.3 : 0.05, it && it.kind === 'armor' ? 0.3 : 0.08), rc ? new THREE.MeshStandardMaterial({ color: C(rc), emissive: C(rc).multiplyScalar(0.45), roughness: 0.4, metalness: 0.4 }) : R.mat.loot)
            : new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.28), new THREE.MeshStandardMaterial({ emissive: C('#2a2010'), color: C({ meat: '#c87a7a', hide: '#8a6a4a', gold: '#f2d14b', food: '#d8b86a', ore: '#8a8a92', arms: '#a8a8b0', herbs: '#7ac87a', timber: '#8a6a42' }[l.kind] || (ECHO.Gear.MATS[l.kind] || {}).color || '#ffffff'), roughness: 0.7 }));
          m.castShadow = true;
          R.lootMeshes.set(l, m); R.groups.fx.add(m);
        }
        m.position.set(l.x, R.groundH(l.x, l.y) + 0.25 + Math.sin(R.time * 3 + l.x) * 0.06, l.y);
        m.rotation.y += dt * 1.5;
      }
      for (const [l, m] of R.lootMeshes) if (!ll.has(l)) { R.groups.fx.remove(m); m.geometry.dispose(); if (m.material !== R.mat.loot) m.material.dispose(); R.lootMeshes.delete(l); }
    },
    makeFxMesh(f) {
      const flat = (geo, color, opacity) => {
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
        return m;
      };
      if (f.kind === 'tele') {
        const pc = R.parseColor(f.color);
        let geo;
        if (f.shape === 'circle') geo = new THREE.CircleGeometry(f.radius, 36);
        else if (f.shape === 'cone') geo = new THREE.CircleGeometry(f.len, 24, -f.angle - f.arc / 2, f.arc);
        else { geo = new THREE.PlaneGeometry(f.len, f.width || 0.6); geo.translate(f.len / 2, 0, 0); }
        if (f.shape === 'line') { geo.rotateX(-Math.PI / 2); geo.rotateY(-f.angle); }
        else geo.rotateX(-Math.PI / 2);
        const m = flat(geo, pc.c, Math.min(0.45, pc.a + 0.08));
        const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: pc.c, transparent: true, opacity: 0.85 }));
        m.add(edge);
        const inner = flat(geo.clone(), pc.c, 0.35);
        m.add(inner);
        m.userData.inner = inner;
        m.renderOrder = 2;
        return m;
      }
      if (f.kind === 'slash') {
        const inner = f.style === 'heavy' ? 0.3 : f.style === 'finisher' ? 0.62 : 0.55;
        const geo = new THREE.RingGeometry(f.range * inner, f.range, f.arc > 4 ? 40 : 18, 1, -f.angle - f.arc / 2, f.arc);
        geo.rotateX(-Math.PI / 2);
        const pc = R.parseColor(f.color);
        const m = flat(geo, pc.c, 0.9);
        m.material.blending = THREE.AdditiveBlending;
        return m;
      }
      if (f.kind === 'ring') {
        const geo = new THREE.RingGeometry(0.88, 1, 40);
        geo.rotateX(-Math.PI / 2);
        const pc = R.parseColor(f.color);
        return flat(geo, pc.c, 0.9);
      }
      return null;
    },

    // ---------------------------------------------------------------- lighting & sky
    updateLighting(game, dt) {
      const world = game.world;
      const dl = T.daylight(world.minute);
      const m = world.minute;
      const season = T.dateOf(world.day).seasonIdx;
      const dusk = (m > 1000 && m < 1290) ? 1 - Math.abs(m - 1150) / 140 : (m > 280 && m < 480) ? 1 - Math.abs(m - 380) / 100 : 0;
      // sun arc
      const ang = ((m - 360) / 720) * Math.PI;
      const tgt = R.camTarget;
      R.sun.position.set(tgt.x - Math.cos(ang) * 30, 8 + Math.sin(Math.max(0.15, ang)) * 34, tgt.z + 18);
      R.sun.target.position.copy(tgt);
      const wx = ECHO.Weather ? ECHO.Weather.here(world, tgt.x, tgt.z) : { today: 'clear' };
      const cloud = { clear: 1, heat: 1.08, cloudy: 0.62, fog: 0.55, rain: 0.48, storm: 0.32, snow: 0.6, blizzard: 0.38 }[wx.today] || 1;
      R.cloud = cloud; R.wx = wx;
      R.sun.intensity = 1.35 * Math.max(0, dl) * cloud;
      R.sun.color.copy(lerpC(C('#fff4e0'), C('#ff9a5a'), Math.max(dusk, 0)));
      R.sun.castShadow = dl > 0.05 && R.renderer.shadowMap.enabled;
      R.moon.position.set(tgt.x + 20, 40, tgt.z + 10); R.moon.target.position.copy(tgt);
      R.moon.intensity = 0.27 * (1 - dl);
      R.hemi.intensity = (0.2 + 0.5 * dl) * (0.75 + 0.25 * cloud);
      // lightning
      if (wx.today === 'storm' || wx.today === 'blizzard') {
        if (R.flashT <= 0 && Math.random() < dt * 0.08) { R.flashT = 0.25; setTimeout(() => ECHO.Sfx.play('thunder'), 300 + Math.random() * 1500); }
      }
      if (R.flashT > 0) { R.flashT -= dt; if (Math.sin(R.flashT * 60) > 0) R.hemi.intensity += 2.2; }
      R.hemi.color.copy(lerpC(C('#3a4a78'), C('#d6e6ff'), dl));
      R.hemi.groundColor.copy(lerpC(C('#141018'), C('#4a4030'), dl));
      let fog = lerpC(C('#0d1222'), C(season === 3 ? '#c8d4dc' : '#a9c2d4'), dl);
      if (cloud < 0.9) fog = lerpC(fog, C('#7c8690').multiplyScalar(Math.max(0.2, dl)), 0.5);
      if (wx.today === 'heat') fog = lerpC(fog, C('#e8d8b0'), 0.25 * dl);
      if (dusk > 0) fog = lerpC(fog, C('#d88a5a'), dusk * 0.45);
      R.scene.fog.color.copy(fog);
      R.scene.background = R.scene.fog.color;
      const fogK = wx.today === 'fog' ? 0.45 : wx.today === 'blizzard' ? 0.5 : wx.today === 'storm' || wx.today === 'rain' ? 0.75 : 1;
      R.scene.fog.near = R.camDistNow * 1.15 * fogK;
      R.scene.fog.far = R.camDistNow * (season === 3 ? 2.6 : 3.4) * fogK;
      R.renderer.toneMappingExposure = 1.0 + (1 - dl) * 0.22;
      R.mat.window.emissiveIntensity = R.mat.windowFade.emissiveIntensity = (1 - dl) * 1.6;
      // Point lights: game lights + scene lights, nearest first
      const cand = [];
      const push = (x, y, r, a, color, h = 1.1) => cand.push({ x, y, r, a, color, h, d: (x - tgt.x) ** 2 + (y - tgt.z) ** 2 });
      for (const L of (game._updLights || game.lights || [])) push(L.x, L.y, L.r, L.a, L.color, 1.3);
      const night = dl < 0.65;
      if (night) {
        for (const t of Object.values(R.towns)) for (const l of t.lamps) push(l.x, l.y, l.era >= 4 ? 8 : 4.5, l.era >= 4 ? 1.3 : 1.0, l.arcane && l.era >= 4 ? '#bfe8ff' : '#ffc070', 1.7);
      }
      for (const l of R.siteLights || []) push(l.x, l.y, l.r, l.a, l.color, l.h);
      for (const e of game.ents) {
        if (e.dead || e.hidden) continue;
        if (e.gear && e.gear.torch && night) push(e.x, e.y, 4.5, 0.9, '#ffb060', 1.2);
        if (e.burn > 0) push(e.x, e.y, 2.5, 0.8, '#ff7a2a', 0.6);
        if (e.type === 'boss' && night) push(e.x, e.y, 3, 0.5, '#ffcf3a', 2);
      }
      for (const p of ECHO.Combat.proj) { if (p.kind === 'fire') push(p.x, p.y, 3.5 + p.radius, 1.4, '#ff9a3c', 0.6); else if (p.kind === 'orb') push(p.x, p.y, 2.5, 1, p.color || '#b48aff', 0.6); }
      cand.sort((a, b) => a.d - b.d);
      const flick = 1 + Math.sin(R.time * 11) * 0.04 + Math.sin(R.time * 23) * 0.03;
      for (let i = 0; i < MAX_LIGHTS; i++) {
        const L = R.points[i], c = cand[i];
        if (!c || c.d > 900 || i >= R.lightN) { L.intensity = 0; continue; }
        L.position.set(c.x, R.groundH(c.x, c.y) + c.h, c.y);
        L.color.copy(C(c.color));
        L.distance = c.r * 1.9;
        L.intensity = c.a * 1.6 * flick * (night ? 1 : 0.5);
      }
      // seasons: snow
      const snowing = wx.today === 'snow' || wx.today === 'blizzard' || (season === 3 && wx.today !== 'clear' && wx.today !== 'heat');
      R.snow.visible = snowing;
      const raining = !snowing && (wx.today === 'rain' || wx.today === 'storm');
      R.rain.visible = raining; R._raining = raining;
      if (raining) {
        R.rain.position.set(tgt.x, 0, tgt.z);
        const rpos = R.rain.geometry.attributes.position, fall = dt * (wx.today === 'storm' ? 26 : 18);
        for (let i = 0; i < rpos.count; i += 2) {
          let y = rpos.getY(i) - fall;
          if (y < 0) y += 20;
          rpos.setY(i, y); rpos.setY(i + 1, y - 0.55);
          if (wx.today === 'storm') { rpos.setX(i + 1, rpos.getX(i) + 0.25); }
        }
        rpos.needsUpdate = true;
        R.rain.material.opacity = wx.today === 'storm' ? 0.6 : 0.42;
      }
      if (ECHO.Sfx.setRain) ECHO.Sfx.setRain(raining ? (wx.today === 'storm' ? 1 : 0.6) : 0);
      if (R.snow.visible) {
        const sp = R.snow.geometry.attributes.position;
        for (let i = 0; i < sp.count; i++) {
          let y = sp.getY(i) - dt * (1.2 + (i % 5) * 0.2);
          if (y < 0) y += 18;
          sp.setY(i, y);
          sp.setX(i, sp.getX(i) + Math.sin(R.time + i) * dt * 0.3);
        }
        sp.needsUpdate = true;
        R.snow.position.set(tgt.x, 0, tgt.z);
      }
    },

    // ---------------------------------------------------------------- frame
    draw(game, dt) {
      if (!R.world || R.world !== game.world) R.setWorld(game.world);
      R.time += dt;
      R.waterTime.value = R.time;
      if (ECHO.Climate && game.pe && !ECHO.Interior.cur) {
        const C = ECHO.Climate, w2 = game.world, px = game.pe.x, py = game.pe.y;
        R.waterIce.value = C.frozen(w2, px, py, true) ? 2 : C.frozen(w2, px, py, false) ? 1 : 0;
        // rain darkens and wets the ground
        const wetK = Math.min(1, C.mud(w2, px, py) * 1.2 + (R._raining ? 0.3 : 0));
        R._wetK = (R._wetK || 0) + (wetK - (R._wetK || 0)) * Math.min(1, dt * 0.5);
        R.mat.terrain.color.setScalar(1 - R._wetK * 0.22); R.mat.terrain.roughness = 0.95 - R._wetK * 0.3;
        R.syncPrints(game);
      } else if (R.mat && R.mat.terrain) { R.mat.terrain.color.setScalar(1); R.mat.terrain.roughness = 0.95; if (R.waterIce) R.waterIce.value = 0; }
      // camera
      const pe = game.pe;
      let tx = pe ? pe.x : game.cam.x, ty = pe ? pe.y : game.cam.y;
      const rm = ECHO.Interior && ECHO.Interior.cur;
      const lk = ECHO.PlayerCtl.lock;
      if (lk && pe && !rm) { tx = U.lerp(tx, lk.x, 0.3); ty = U.lerp(ty, lk.y, 0.3); }
      if (rm && !rm.carved) { // frame the room rather than the player alone
        const cx = ECHO.Interior.BASE + rm.W / 2, cy = rm.H / 2;
        tx = U.lerp(tx, cx, rm.W > 12 ? 0.25 : 0.6); ty = U.lerp(ty, cy, 0.55) + 0.6;
      }
      const gh = R.groundH(tx, ty);
      R.camTarget = R.camTarget || new THREE.Vector3(tx, gh, ty);
      if (Math.abs(R.camTarget.x - tx) + Math.abs(R.camTarget.z - ty) > 12) { R.camTarget.set(tx, gh, ty); R.firstFrame = true; R.sitesT = 0; }
      const k = Math.min(1, dt * 7);
      R.camTarget.x = U.lerp(R.camTarget.x, tx, k); R.camTarget.z = U.lerp(R.camTarget.z, ty, k); R.camTarget.y = U.lerp(R.camTarget.y, gh, k);
      const room = ECHO.Interior && ECHO.Interior.cur;
      R.setInteriorMode(!!room);
      if (room && (R.roomKey !== room || R.roomRev !== (room.rev || 0))) { const fresh = R.roomKey !== room; R.roomKey = room; R.roomRev = room.rev || 0; R.roomFlames = []; R.buildRoom(game, room); if (fresh) R.camTarget.set(tx, 0, ty); }
      const punch = game.camPunch || 0;
      const D = R.camDistNow = R.camDist * (1 + R.zoomExtra) * (room ? (room.carved ? 0.82 : U.clamp(0.5 + room.H * 0.035, 0.72, 0.95)) : 1) * (1 - Math.min(0.12, punch * 0.07));
      let sx = 0, sy = 0;
      if (game.shakeT > 0) { sx = (Math.random() - 0.5) * game.shakeA * 0.4; sy = (Math.random() - 0.5) * game.shakeA * 0.4; }
      const kk = game.camKick || { x: 0, y: 0 };
      sx += kk.x; sy += kk.y;
      R.camera.position.set(R.camTarget.x + sx, R.camTarget.y + D * 0.86, R.camTarget.z + D * 0.6 + sy);
      R.camera.lookAt(R.camTarget.x + sx, R.camTarget.y + 0.5, R.camTarget.z + sy);
      R.camera.updateMatrixWorld();
      if (!room) {
        R.updateChunks(game);
        R.updateTowns(game);
        R.updateSites(game, dt);
        for (const f of R.flames || []) { f.scale.y = 1 + Math.sin(R.time * 13 + f.position.x) * 0.15; }
        for (const t of Object.values(R.towns)) {
          for (const m of t.sails || []) if (m.inst.parts.sails && m.b.fac.state === 'working') m.inst.parts.sails.rotation.z += dt * 0.9;
          for (const sm of t.smokes || []) {
            if (sm.chim) { const cr = ECHO.Fauna ? ECHO.Fauna.chimney(game.world, sm.b) : 0; if (cr && Math.random() < dt * cr * 2.5) ECHO.Combat.fx.push({ kind: 'smoke', x: sm.x + (Math.random() - 0.5) * 0.2, y: sm.y, sh: sm.kind === 'inn' ? 3.0 : 2.4, vx: 0.12 + Math.random() * 0.1, vy: 0, t: 0, life: 3.5 + Math.random() * 1.5, size: 2.5 }); continue; }
            const rate = sm.lost && game.world.day - (sm.b.fac.lostDay || 0) < 6 ? 14 : sm.kind === 'mine' && sm.b.fac.state === 'working' ? 0.6 : 0;
            if (rate && Math.random() < dt * rate) ECHO.Combat.fx.push({ kind: 'smoke', x: sm.x + (Math.random() - 0.5) * 1.5, y: sm.y + (Math.random() - 0.5), vx: (Math.random() - 0.3) * 0.4, vy: 0, t: 0, life: 3 + Math.random() * 2, size: 3 });
            if (sm.lost && game.world.day - (sm.b.fac.lostDay || 0) < 2 && Math.random() < dt * 20) ECHO.Combat.fx.push({ kind: 'p', x: sm.x + (Math.random() - 0.5) * 1.6, y: sm.y + (Math.random() - 0.5) * 1.2, vx: 0, vy: -1.2, t: 0, life: 0.6, color: Math.random() < 0.5 ? '#ffb347' : '#ff5a1f', size: 2 });
          }
        }
        if (R.rift) R.rift.rotation.y += dt * 0.6;
        R.updateOcclusion(game);
      } else { for (const f of R.roomFlames || []) f.scale.y = f.scale.x * (1 + Math.sin(R.time * 13 + f.position.x) * 0.12); if (room.carved) R.animateTraps(game); }
      R.updateEntities(game, dt);
      R.updateFx(game, dt);
      R.updateGlows(game);
      R.updateTownFires(game, room);
      if (!room) R.updateFestival(game); else if (R.festGroup) R.festGroup.visible = false;
      if (room) R.updateInteriorLighting(game, room); else R.updateLighting(game, dt);
      R.renderer.render(R.scene, R.camera);
      R.drawOverlay(game);
    },

    // Buildings just south of the player (between player and camera) turn see-through.
    updateOcclusion(game) {
      const pe = game.pe;
      if (!pe) return;
      for (const t of Object.values(R.towns)) for (const m of t.group.children) {
        const o = m.userData.occ;
        if (!o || o.part === 'glow') continue;
        const hides = pe.y < o.y + o.h / 2 + 0.5 && pe.y > o.y - o.h / 2 - o.tall && Math.abs(pe.x - o.x) < o.w / 2 + 0.8;
        const want = hides ? (o.part === 'window' ? R.mat.windowFade : R.mat.propFade) : (o.part === 'window' ? R.mat.window : R.mat.prop);
        if (m.material !== want) { m.material = want; m.castShadow = !hides && o.part === 'base'; }
      }
    },

    // ---------------------------------------------------------------- projection helpers
    project(x, y, h) {
      R.v3.set(x, R.groundH(x, y) + (h || 0), y).project(R.camera);
      return { x: (R.v3.x * 0.5 + 0.5) * R.cw, y: (-R.v3.y * 0.5 + 0.5) * R.ch, z: R.v3.z };
    },
    toScreen(game, x, y, h) { return R.project(x, y, h); },
    screenToWorld(game, sx, sy) {
      if (!R.camera || !R.camTarget) return { x: game.cam.x, y: game.cam.y };
      const ndc = new THREE.Vector2((sx / window.innerWidth) * 2 - 1, -(sy / window.innerHeight) * 2 + 1);
      R.ray.setFromCamera(ndc, R.camera);
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(R.camTarget.y + 0.3));
      const p = new THREE.Vector3();
      if (!R.ray.ray.intersectPlane(plane, p)) return { x: game.pe ? game.pe.x : 0, y: game.pe ? game.pe.y : 0 };
      return { x: p.x, y: p.z };
    },
    onScreen(game, x, y, pad = 0) {
      if (!R.camera || !R.camTarget) return false;
      const p = R.project(x, y, 0.5);
      const m = pad * 0.06 * R.cw;
      return p.z < 1 && p.x > -m && p.y > -m && p.x < R.cw + m && p.y < R.ch + m;
    },

    SIGN_H: { keep: 6.4, temple: 6.2, inn: 4.3, archive: 4.3, smithy: 3.4, shrine: 3.6, market: 2.9, board: 2.3, mill: 4.4, mine: 2.6, lumber: 2.2 },
    drawShopSigns(game, ctx, fs) {
      const world = game.world, pe = game.pe;
      const s = ECHO.World.settlementAt(world, pe.x, pe.y, 26);
      if (!s) return;
      for (const b of s.buildings) {
        const info = ECHO.UI.shopInfo(b, s);
        if (!info) continue;
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        const d = U.dist(cx, cy, pe.x, pe.y);
        if (d > 20) continue;
        const a = d < 11 ? 1 : 1 - (d - 11) / 9;
        if (!R.onScreen(game, cx, cy)) continue;
        const p = R.project(cx, cy, R.SIGN_H[b.type] || 3);
        if (p.z > 1) continue;
        const big = Math.round(fs * 1.08), small = Math.round(fs * 0.86);
        ctx.font = `600 ${big}px "Pixelify Sans", monospace`;
        const t1 = `${info.icon} ${info.title}`;
        const w1 = ctx.measureText(t1).width;
        ctx.font = `${small}px "Pixelify Sans", monospace`;
        const w2 = ctx.measureText(info.sub).width;
        const W = Math.max(w1, w2) + 16 * R.dpr, H = big + small + 14 * R.dpr;
        const x0 = p.x - W / 2, y0 = p.y - H;
        ctx.globalAlpha = a;
        ctx.fillStyle = 'rgba(28,20,12,0.82)'; ctx.fillRect(x0, y0, W, H);
        ctx.strokeStyle = 'rgba(230,192,106,0.85)'; ctx.lineWidth = 1.5 * R.dpr; ctx.strokeRect(x0 + 0.5, y0 + 0.5, W - 1, H - 1);
        ctx.beginPath(); ctx.moveTo(p.x, y0 + H); ctx.lineTo(p.x - 5 * R.dpr, y0 + H); ctx.lineTo(p.x, y0 + H + 6 * R.dpr); ctx.lineTo(p.x + 5 * R.dpr, y0 + H); ctx.closePath(); ctx.fillStyle = 'rgba(230,192,106,0.85)'; ctx.fill();
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.font = `600 ${big}px "Pixelify Sans", monospace`; ctx.fillStyle = '#f2d47a'; ctx.fillText(t1, p.x, y0 + 4 * R.dpr);
        ctx.font = `${small}px "Pixelify Sans", monospace`; ctx.fillStyle = '#e8dcc0'; ctx.fillText(info.sub, p.x, y0 + 6 * R.dpr + big);
        ctx.globalAlpha = 1;
      }
      ctx.textBaseline = 'bottom';
      ctx.font = `${fs}px "Pixelify Sans", monospace`;
    },

    // ---------------------------------------------------------------- overlay (names, speech, numbers, prompts)
    drawOverlay(game) {
      const ctx = R.octx, world = game.world;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, R.cw, R.ch);
      const fs = Math.round(12.5 * R.dpr);
      ctx.font = `${fs}px "Pixelify Sans", monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      const mouse = game.screenToWorld(ECHO.Input.mx, ECHO.Input.my);
      const text = (t, x, y, col, bg) => {
        if (!t) return;
        const w = ctx.measureText(t).width;
        if (bg) { ctx.fillStyle = bg; ctx.fillRect(x - w / 2 - 5 * R.dpr, y - fs - 4 * R.dpr, w + 10 * R.dpr, fs + 6 * R.dpr); }
        ctx.lineWidth = 3 * R.dpr; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.strokeText(t, x, y);
        ctx.fillStyle = col; ctx.fillText(t, x, y);
      };
      // Shop signs: what each building is and what it sells
      if (!ECHO.Interior.cur && game.pe) R.drawShopSigns(game, ctx, fs);
      if (!ECHO.Interior.cur && game.pe && ECHO.Marvels) {
        ECHO.Marvels.drawSky(ctx, game, R.cw, R.ch);
        ECHO.Marvels.drawHints(ctx, game, (x, y) => R.project(x, y, 1), R.cw, R.ch);
        ctx.font = `${fs}px "Pixelify Sans", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      }
      if (ECHO.Fest) { ECHO.Fest.drawHUD(ctx, game, R.cw); ctx.font = `${fs}px "Pixelify Sans", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; }
      if (ECHO.Progress) { ctx.font = `${Math.round(fs * 0.85)}px "Pixelify Sans", monospace`; for (const ll of ECHO.Progress.lootLabels(game)) { if (!R.onScreen(game, ll.x, ll.y)) continue; const p = R.project(ll.x, ll.y, 0.75); if (p.z > 1) continue; text(ll.text, p.x, p.y, ll.color); } ctx.font = `${fs}px "Pixelify Sans", monospace`; }
      if (ECHO.Progress) for (const sl of ECHO.Progress.siteLabels(game)) { if (!R.onScreen(game, sl.x, sl.y)) continue; const p = R.project(sl.x, sl.y, 2.6); if (p.z > 1) continue; ctx.globalAlpha = sl.a; text(sl.text, p.x, p.y, sl.color); ctx.globalAlpha = 1; }
      const heights = { player: 1.25, person: 1.25, boss: 3.6 };
      for (const e of game.ents) {
        if (e.dead || e.hidden || e === game.pe) continue;
        if (!R.onScreen(game, e.x, e.y)) continue;
        const h = e.type === 'creature' ? (e.species === 'wolf' ? 1.0 : 0.65) : (heights[e.type] || 1.2);
        const p = R.project(e.x, e.y, h);
        const hover = U.dist(mouse.x, mouse.y, e.x, e.y) < 0.9;
        // health bar for wounded foes
        if (e.type !== 'boss' && (e.hp < e.maxHp || e === ECHO.PlayerCtl.lock)) {
          const w = 34 * R.dpr, bh = 4 * R.dpr;
          ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(p.x - w / 2, p.y - bh, w, bh);
          ctx.fillStyle = game.hostileTo(game.pe, e) ? '#d8463a' : '#c8b46a'; ctx.fillRect(p.x - w / 2, p.y - bh, w * Math.max(0, e.hp / e.maxHp), bh);
        }
        const ty = p.y - 6 * R.dpr;
        if (e.say && e.sayT > 0) {
          const w = ctx.measureText(e.say).width;
          ctx.fillStyle = 'rgba(250,244,228,0.95)';
          ctx.fillRect(p.x - w / 2 - 7 * R.dpr, ty - fs - 10 * R.dpr, w + 14 * R.dpr, fs + 9 * R.dpr);
          ctx.fillStyle = '#2a2420'; ctx.fillText(e.say, p.x, ty - 5 * R.dpr);
          continue;
        }
        if (e.type === 'boss') { const lb = ECHO.Progress ? ECHO.Progress.label(game, e) : { text: e.label, color: '#ffcf8a' }; text(lb.text, p.x, ty, lb.color); continue; }
        if (e.marvel) { if (e.label && U.dist(e.x, e.y, game.pe.x, game.pe.y) < 6) text(e.label, p.x, ty, '#bfe8ff'); continue; }
        if (e.yielded) { text('yields — [E] to spare', p.x, ty, '#9fe0c8'); continue; }
        if (e.sleeping && hover) { text('asleep', p.x, ty, '#9fb7d8'); continue; }
        const foeish = ECHO.Progress && (e.type === 'creature' || e.type === 'person') && e.species !== 'hare' && e.species !== 'gnawer' && e.species !== 'hind' && ECHO.Progress.counts(game, e);
        if (foeish) {
          if (hover || e === ECHO.PlayerCtl.lock || e.boss2 || e.beast || U.dist(e.x, e.y, game.pe.x, game.pe.y) < 9) {
            const lb = ECHO.Progress.label(game, e);
            text(lb.text, p.x, ty, lb.color);
            if (e.hp < e.maxHp && e.type === 'creature') { const bw = 44 * R.dpr, bh = 4 * R.dpr; ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(p.x - bw / 2, ty + 4 * R.dpr, bw, bh); ctx.fillStyle = e.boss2 ? '#ffcf5a' : '#e05a4a'; ctx.fillRect(p.x - bw / 2, ty + 4 * R.dpr, bw * Math.max(0, e.hp / e.maxHp), bh); }
          }
          continue;
        }
        if (e.type === 'person' && (hover || (e.carrying && U.dist(e.x, e.y, game.pe.x, game.pe.y) < 6))) {
          const npc = world.npcs[e.npcId];
          if (!npc) continue;
          const col = game.hostileTo(game.pe, e) ? '#ff8a7a' : e.isCompanion ? '#9fe0c8' : '#f0e6d0';
          text(ECHO.People.fullTitle(world, npc), p.x, ty, col);
          const it = e.carrying && world.items[e.carrying];
          if (it) {
            const yours = game.pl && it.history.some(hh => hh.t.includes(game.pl.first + ' ' + game.pl.last));
            text(yours ? '(carrying your sword)' : it.legend ? `(carrying ${it.name})` : '', p.x, ty + fs + 2 * R.dpr, '#f2d47a');
          }
        } else if (e.type === 'creature' && e.lvl && !e.dead) {
          if (hover || e.label || U.dist(e.x, e.y, game.pe.x, game.pe.y) < 8) {
            text(`${e.label || e.foe.name} · lv ${e.lvl}`, p.x, ty, e.boss2 ? '#ffcf5a' : e.elite ? '#ff9a7a' : '#ffb0a0');
            if (e.hp < e.maxHp) { const bw = 44 * R.dpr, bh = 4 * R.dpr; ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(p.x - bw / 2, ty + 4 * R.dpr, bw, bh); ctx.fillStyle = e.boss2 ? '#ffcf5a' : '#e05a4a'; ctx.fillRect(p.x - bw / 2, ty + 4 * R.dpr, bw * Math.max(0, e.hp / e.maxHp), bh); }
          }
        } else if (e.type === 'creature' && e.label && !e.marvel) {
          if (hover || (e.foe && e.foe.elite) || e.beast || U.dist(e.x, e.y, game.pe.x, game.pe.y) < 7) text(e.label, p.x, ty, '#ffb0a0');
        } else if (e.type === 'creature' && hover) {
          text(e.humanoid ? e.foe.name : e.fname || ECHO.Ecology.speciesName(world, world.regions[e.regionId], e.species), p.x, ty, game.hostileTo(game.pe, e) ? '#ffb0a0' : '#e0e0d0');
        }
      }
      for (const f of ECHO.Combat.floaters) {
        if (f.y0 == null) f.y0 = f.y;
        const rise = (f.y0 - f.y) * 1.2;
        const p = R.project(f.x, f.y0, 1.3 + rise);
        if (p.z > 1) continue;
        ctx.globalAlpha = Math.max(0, 1 - Math.max(0, f.t / f.life - 0.4) / 0.6);
        const pop = 1 + Math.max(0, 0.14 - f.t) * (f.big ? 6 : 4);
        ctx.font = `${Math.round(fs * (f.big ? 1.35 : 1) * pop)}px "Pixelify Sans", monospace`;
        text(f.text, p.x, p.y, f.color);
        ctx.font = `${fs}px "Pixelify Sans", monospace`;
        ctx.globalAlpha = 1;
      }
      // a chevron over the locked target
      const lkt = ECHO.PlayerCtl.lock;
      if (lkt && R.onScreen(game, lkt.x, lkt.y)) {
        const h = lkt.type === 'boss' ? 3.9 : lkt.type === 'creature' ? (lkt.species === 'wolf' ? 1.25 : 0.85) : 1.55;
        const p = R.project(lkt.x, lkt.y, h);
        const b = Math.sin(R.time * 6) * 3 * R.dpr, w = 9 * R.dpr;
        ctx.fillStyle = '#ff5a3c'; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 2 * R.dpr;
        ctx.beginPath(); ctx.moveTo(p.x - w, p.y - 14 * R.dpr + b); ctx.lineTo(p.x + w, p.y - 14 * R.dpr + b); ctx.lineTo(p.x, p.y - 2 * R.dpr + b); ctx.closePath(); ctx.stroke(); ctx.fill();
      }
      // pain: a red vignette when hit, a slow pulse when near death
      if (game.pl) {
        const low = game.pl.hp / game.pl.maxHp < 0.3 && !game.pl.capture ? 0.18 + Math.sin(R.time * 5) * 0.1 : 0;
        const a = Math.max(game.hurtFlashT ? game.hurtFlashT * 0.55 : 0, low);
        if (a > 0.01) {
          const gr = ctx.createRadialGradient(R.cw / 2, R.ch / 2, Math.min(R.cw, R.ch) * 0.3, R.cw / 2, R.ch / 2, Math.max(R.cw, R.ch) * 0.7);
          gr.addColorStop(0, 'rgba(120,0,0,0)'); gr.addColorStop(1, `rgba(150,8,8,${Math.min(0.75, a)})`);
          ctx.fillStyle = gr; ctx.fillRect(0, 0, R.cw, R.ch);
        }
      }
      // bow / flame / study gauge under the player
      if (game.pe) {
        const PC = ECHO.PlayerCtl;
        const v = PC.drawing ? PC.draw : PC.charging ? Math.min(1, PC.charge / 1.25) : PC.studyT > 0 ? Math.min(1, PC.studyT / 1.6) : -1;
        if (v >= 0) {
          const p = R.project(game.pe.x, game.pe.y, -0.1);
          const w = 44 * R.dpr, bh = 5 * R.dpr;
          ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(p.x - w / 2, p.y + 8 * R.dpr, w, bh);
          ctx.fillStyle = PC.drawing ? '#e8d9a0' : PC.charging ? (PC.charge > 1 ? '#ff5a1f' : '#ffb347') : '#9fe0c8';
          ctx.fillRect(p.x - w / 2, p.y + 8 * R.dpr, w * v, bh);
        }
      }
      if (game.pl && !ECHO.UI.blocksWorld()) {
        const its = game.interactables();
        game._interact = its[0] || null;
        if (its[0]) {
          const p = R.project(game.pe.x, game.pe.y, -0.2);
          text(`[E] ${its[0].label}`, p.x, p.y + 34 * R.dpr, '#ffe8a8', 'rgba(20,16,12,0.78)');
        }
      }
    },

    mapImage(world) { return ECHO.Renderer2D.mapImage(world); }
  };

  // Choose the renderer: 3D when WebGL and the models are available, otherwise the classic 2D one.
  ECHO.chooseRenderer = async function () {
    const want2d = ECHO.UI && ECHO.UI.settings && ECHO.UI.settings.graphics === '2d';
    let ok = false;
    if (!want2d && typeof THREE !== 'undefined' && R.supported()) {
      try { ok = await ECHO.Models.load(); } catch (e) { console.error(e); ok = false; }
    }
    ECHO.Renderer = ok ? R : ECHO.Renderer2D;
    ECHO.render3d = ok;
    return ok;
  };
})();
