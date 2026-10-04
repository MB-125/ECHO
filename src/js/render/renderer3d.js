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
      case TILE.WATER: return '#2c5878';
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
    camDist: 15, zoomExtra: 0, time: 0, sitesT: 0,

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
      for (const g of ['terrain', 'props', 'towns', 'sites', 'ents', 'fx']) { R.groups[g] = new THREE.Group(); s.add(R.groups[g]); }
      R.ray = new THREE.Raycaster();
      R.v3 = new THREE.Vector3();
      R.initParticles();
      window.addEventListener('resize', R.resize);
      R.canvas.addEventListener('wheel', e => { R.zoomExtra = U.clamp(R.zoomExtra + Math.sign(e.deltaY) * 0.08, -0.35, 0.6); }, { passive: true });
      R.resize();
    },
    resize() {
      R.dpr = Math.min(1.5, window.devicePixelRatio || 1);
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
      for (const g of ['towns', 'sites', 'ents', 'fx']) R.clear(R.groups[g]);
      R.views.clear(); R.fxMeshes.clear(); R.projMeshes.clear(); R.lootMeshes.clear();
      R.towns = {};
      R.buildHeights(world);
      R.buildWater(world);
      R.sitesT = 0;
    },
    clear(group) {
      while (group.children.length) group.remove(group.children[0]);
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
      if (!R.hc) return 0;
      const t = ECHO.World.tile(R.world, x, y);
      if (t === TILE.BRIDGE) return 0.05;
      const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
      const a = R.cornerH(ix, iy), b = R.cornerH(ix + 1, iy), c = R.cornerH(ix, iy + 1), d = R.cornerH(ix + 1, iy + 1);
      return Math.max(-0.05, U.lerp(U.lerp(a, b, fx), U.lerp(c, d, fx), fy));
    },

    // ---------------------------------------------------------------- water
    buildWater(world) {
      if (R.water) { R.scene.remove(R.water); R.water.geometry.dispose(); }
      const g = new THREE.PlaneGeometry(world.W + 60, world.H + 60, Math.round((world.W + 60) / 1.5), Math.round((world.H + 60) / 1.5));
      const m = new THREE.MeshStandardMaterial({ color: C('#2e6a96'), roughness: 0.12, metalness: 0.15, transparent: true, opacity: 0.82, flatShading: true });
      R.waterTime = { value: 0 };
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = R.waterTime;
        sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
          '#include <begin_vertex>\n transformed.z += sin(position.x * 0.9 + uTime * 1.3) * 0.045 + cos(position.y * 1.1 + uTime * 1.1) * 0.045;');
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
      for (let dy = -CHUNK_RADIUS; dy <= CHUNK_RADIUS; dy++) for (let dx = -CHUNK_RADIUS; dx <= CHUNK_RADIUS; dx++) {
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
    MODEL_OF: { house: 'house', inn: 'inn', market: 'market', smithy: 'smithy', board: 'board', shrine: 'shrine', archive: 'archive', keep: 'keep', temple: 'temple', well: 'well', lamp: 'lamp', statue: 'statue' },
    updateTowns(game) {
      const world = game.world;
      for (const s of world.settlements) {
        const d = U.dist(s.x, s.y, R.camTarget.x, R.camTarget.z);
        const fac = world.factions[s.faction];
        const key = [s.faction, fac ? fac.tech.era : 0, s.buildings.length, s.buildings.filter(b => b.legend).length].join('|');
        const cur = R.towns[s.id];
        if (d > 48) { if (cur) { R.groups.towns.remove(cur.group); delete R.towns[s.id]; } continue; }
        if (cur && cur.key === key) continue;
        if (cur) R.groups.towns.remove(cur.group);
        const group = new THREE.Group();
        const roof = R.ROOF[s.faction] || R.ROOF.valdren;
        const lamps = [];
        for (const b of s.buildings) {
          const name = R.MODEL_OF[b.type];
          if (!name) continue;
          const colors = { roof: b.legend && b.type === 'house' ? '#5a5a6e' : roof[0], banner: roof[1] };
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
        R.groups.towns.add(group);
        R.towns[s.id] = { key, group, lamps };
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
      if (world.rift && near(world.rift.x, world.rift.y)) {
        R.rift = R.addStatic(g, 'rift', world.rift.x + 0.5, world.rift.y + 0.5, { rune: '#c8a8ff' }, 0, 1.2);
        R.siteLights.push({ x: world.rift.x + 0.5, y: world.rift.y + 0.5, r: 8, a: 1.4, color: '#b48aff', h: 1.6 });
      }
    },

    // ---------------------------------------------------------------- entities
    view(game, e) {
      let v = R.views.get(e);
      if (v) return v;
      let inst = null, kind = e.type;
      if (e.type === 'player' || e.type === 'person') inst = ECHO.Models.instance('person');
      else if (e.type === 'creature') inst = ECHO.Models.instance(e.species);
      else if (e.type === 'boss') inst = ECHO.Models.instance(e.boss.kind);
      if (!inst) return null;
      v = { inst, kind, cfgT: 0, dir: e.dir || 0, bob: Math.random() * 6 };
      R.groups.ents.add(inst.root);
      R.views.set(e, v);
      R.configure(game, e, v);
      return v;
    },
    PROF: null,
    configure(game, e, v) {
      const M = ECHO.Models, inst = v.inst, world = game.world;
      if (e.type === 'creature') {
        const base = { wolf: 'fur', gnawer: 'rat', hare: 'hare' }[e.species];
        const tint = e.mutation === 'mirrorback' ? '#b8c4d4' : e.mutation === 'emberfur' ? '#a8502a' : e.strain === 'Ashen' ? '#8e8e8a' : e.strain === 'Ironhide' ? '#5a4632' : null;
        if (tint) M.recolor(inst, base, tint);
        if (e.mutation === 'paleshade') for (const m of inst.mats) { m.transparent = true; m.opacity = 0.5; }
        M.show(inst, 'horn', e.mutation === 'glasshorn');
        inst.root.scale.setScalar(e.species === 'wolf' ? 1.05 : 1.15);
        return;
      }
      if (e.type === 'boss') {
        const a = e.boss.armor;
        M.show(inst, 'armorMelee', a.melee > 0.05);
        M.show(inst, 'armorFire', a.fire > 0.05);
        M.show(inst, 'armorRanged', a.ranged > 0.05);
        inst.root.scale.setScalar(1.05);
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
      M.show(inst, 'torch', !!gear.torch || (e.type === 'player' && game.isNight()));
      M.show(inst, 'staff', prof === 'elder');
      const fighter = e.type === 'player' ? !!(pl && pl.weapon) : (prof === 'guard' || bandit || prof === 'wanderer' || e.role === 'soldier' || !!e.carrying || e.isCompanion);
      M.show(inst, 'sword', fighter && !gear.spear && !gear.bow);
      if (e.carrying) {
        const it = world.items[e.carrying];
        if (it && (it.legend || it.history.some(h => h.t.includes('taken by')))) M.recolor(inst, 'metal', '#f2dc8a');
      }
      const scale = prof === 'child' ? 0.68 : prof === 'elder' ? 0.94 : 1.0;
      inst.root.scale.setScalar(scale);
    },
    animatePerson(game, e, v, dt) {
      const P = v.inst.parts;
      const moving = e.moving && !e.dead;
      const ph = e.anim * 11;
      const sw = moving ? Math.sin(ph) * 0.65 : 0;
      P.legL.rotation.z = sw; P.legR.rotation.z = -sw;
      let aL = -sw * 0.8, aR = sw * 0.8, aLx = 0, aRx = 0;
      if (e.attackT) aR = -1.9 * (e.attackT / 0.18) - 0.2;
      if (e.state === 'windup' || e.state === 'attack') aR = -1.4;
      if (e.blocking) { aL = -1.3; aLx = 0.5; }
      if (e === game.pe) {
        const PC = ECHO.PlayerCtl;
        if (PC.drawing) { aL = -1.5; aR = -1.3; }
        if (PC.charging) { aL = -1.7 - Math.sin(R.time * 20) * 0.05; aR = -1.7; }
        if (PC.studyT > 0) { aR = -0.7; }
      }
      if (e.yielded) { aL = -2.6; aR = -2.6; }
      if (e.role === 'captive') { aL = 0.4; aR = 0.4; }
      P.armL.rotation.z = aL; P.armR.rotation.z = aR;
      P.armL.rotation.x = aLx; P.armR.rotation.x = aRx;
      P.body.position.y = 0.42 + (moving ? Math.abs(Math.sin(ph)) * 0.04 : Math.sin(R.time * 2 + v.bob) * 0.006);
      P.head.rotation.z = e.sayT > 0 ? Math.sin(R.time * 9) * 0.06 : 0;
      if (e.sleeping) { v.inst.root.rotation.z = Math.PI / 2; v.yOff = 0.18; }
      else if (e.yielded || e.role === 'captive') { v.inst.root.rotation.z = 0; v.yOff = -0.18; }
      else { v.inst.root.rotation.z = 0; v.yOff = 0; }
    },
    animateCreature(game, e, v) {
      const P = v.inst.parts;
      const moving = e.moving && !e.dead;
      const sp = e.species === 'gnawer' ? 22 : e.species === 'hare' ? 14 : 13;
      const ph = e.anim * sp;
      const sw = moving ? Math.sin(ph) * 0.7 : 0;
      if (P.legFL) { P.legFL.rotation.z = sw; P.legBR.rotation.z = sw; P.legFR.rotation.z = -sw; P.legBL.rotation.z = -sw; }
      if (P.tail) P.tail.rotation.y = Math.sin(R.time * 5 + v.bob) * 0.3;
      v.yOff = 0;
      if (e.species === 'hare' && moving) v.yOff = Math.abs(Math.sin(ph * 0.5)) * 0.18;
      if (e.species === 'wolf') {
        const crouch = e.state === 'windup' ? 0.12 : 0;
        P.body.position.y = 0.42 - crouch + (moving ? Math.abs(Math.sin(ph)) * 0.03 : 0);
        P.head.rotation.z = e.state === 'lunge' ? 0.3 : e.state === 'windup' ? -0.15 : 0;
      }
    },
    animateBoss(game, e, v) {
      const P = v.inst.parts;
      const moving = e.moving;
      const ph = R.time * 6;
      const sw = moving ? Math.sin(ph) * 0.45 : 0;
      if (P.legFL) { P.legFL.rotation.z = sw; P.legBR.rotation.z = sw; P.legFR.rotation.z = -sw; P.legBL.rotation.z = -sw; }
      const open = (e.state === 'windup' || e.state === 'feint') ? Math.min(1, e.t * 2.5) : e.state === 'strike' ? 1 : e.state === 'roar' ? 1 : 0;
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
        root.visible = !e.hidden;
        if (e.hidden) continue;
        v.cfgT -= dt;
        if (v.cfgT <= 0) { v.cfgT = 1; R.configure(game, e, v); }
        if (e.type === 'player' || e.type === 'person') R.animatePerson(game, e, v, dt);
        else if (e.type === 'creature') R.animateCreature(game, e, v);
        else R.animateBoss(game, e, v);
        // facing: smooth turn toward e.dir
        const target = e.dir != null ? e.dir : 0;
        v.dir += U.angleDiff(v.dir, target) * Math.min(1, dt * 14);
        root.rotation.y = Math.PI - v.dir;
        const gy = R.groundH(e.x, e.y);
        root.position.set(e.x, gy + (v.yOff || 0), e.y);
        // death
        if (e.dead) {
          const k = Math.min(1, (e.deathT || 0) * 3);
          root.rotation.x = k * Math.PI / 2 * (v.bob > 3 ? 1 : -1);
          root.position.y = gy + 0.1 - (e.deathT || 0) * 0.08;
          const op = Math.max(0, 1 - Math.max(0, (e.deathT || 0) - 1.5) / 1.5);
          for (const m of v.inst.mats) { if (op < 1) { m.transparent = true; m.opacity = op; } }
        } else root.rotation.x = 0;
        // hurt flash & burning
        const flash = e.hurtT > 0 ? 1 : 0;
        if (flash !== v.flash || e.burn > 0) {
          v.flash = flash;
          for (const m of v.inst.mats) if (m.emissive) { m.emissive.setRGB(flash ? 0.9 : (e.burn > 0 ? 0.5 : 0), flash ? 0.15 : (e.burn > 0 ? 0.18 : 0), flash ? 0.1 : 0); }
        }
        // stealthy player while sneaking
        if (e === game.pe) {
          const ghost = e.iframes > 0 ? 0.55 : ECHO.PlayerCtl.sneaking ? 0.75 : 1;
          if (ghost !== v.ghost) { v.ghost = ghost; for (const m of v.inst.mats) { m.transparent = ghost < 1; m.opacity = ghost; } }
        }
      }
      for (const [e, v] of R.views) {
        if (!seen.has(e)) {
          R.groups.ents.remove(v.inst.root);
          for (const m of v.inst.mats) m.dispose();
          R.views.delete(e);
        }
      }
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
        if (f.h0 == null) { f.h0 = 0.45 + Math.random() * 0.3; f.vz = 0.8 + Math.random() * 2.2; }
        let h;
        if (f.kind === 'smoke') { h = 1.0 + f.t * 0.7; f.x += (f.vx || 0) * dt; f.y += 0; }
        else h = Math.max(0.03, f.h0 + f.vz * f.t - 4 * f.t * f.t);
        pa.setXYZ(n, f.x, R.groundH(f.x, f.y) + h, f.y);
        const fade = 1 - f.t / f.life;
        if (f.kind === 'smoke') tmp.setRGB(0.55, 0.55, 0.55).multiplyScalar(0.4 + fade * 0.6);
        else { const pc = R.parseColor(f.color); tmp.copy(pc.c).convertSRGBToLinear().multiplyScalar(0.4 + 0.6 * fade); }
        ca.setXYZ(n, tmp.r, tmp.g, tmp.b);
        n++;
      }
      R.parts.geometry.setDrawRange(0, n);
      pa.needsUpdate = true; ca.needsUpdate = true;
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
          m.material.opacity = 0.9 * (1 - prog);
          m.scale.setScalar(0.75 + prog * 0.3);
        } else {
          m.position.set(f.x, R.groundH(f.x, f.y) + 0.08, f.y);
          m.scale.setScalar(Math.max(0.01, f.radius * (0.3 + prog * 0.7)));
          m.material.opacity = 0.9 * (1 - prog);
        }
      }
      for (const [f, m] of R.fxMeshes) if (!live.has(f) || f.done && f.kind !== 'tele') { R.groups.fx.remove(m); m.geometry.dispose(); m.material.dispose(); if (m.userData.inner) { m.userData.inner.geometry.dispose(); } R.fxMeshes.delete(f); }
      // Projectiles
      const pl = new Set();
      for (const p of ECHO.Combat.proj) {
        pl.add(p);
        let m = R.projMeshes.get(p);
        if (!m) {
          if (p.kind === 'fire') m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16 + p.radius * 0.08, 1), new THREE.MeshBasicMaterial({ color: p.star ? '#cfeaff' : '#ffb347' }));
          else if (p.kind === 'spit') m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 0), new THREE.MeshBasicMaterial({ color: '#9ad84a' }));
          else m = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.035, 0.035), new THREE.MeshStandardMaterial({ color: p.kind === 'bolt' ? '#4a4a52' : '#d8c8a0' }));
          R.projMeshes.set(p, m); R.groups.fx.add(m);
        }
        m.position.set(p.x, R.groundH(p.x, p.y) + 0.6, p.y);
        m.rotation.y = -p.angle;
        if (p.kind === 'fire') m.rotation.x += dt * 8;
      }
      for (const [p, m] of R.projMeshes) if (!pl.has(p)) { R.groups.fx.remove(m); m.geometry.dispose(); m.material.dispose(); R.projMeshes.delete(p); }
      // Loot
      const ll = new Set();
      for (const l of game.loot) {
        ll.add(l);
        let m = R.lootMeshes.get(l);
        if (!m) {
          m = l.kind === 'item' ? new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.08), R.mat.loot)
            : new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.18), new THREE.MeshStandardMaterial({ color: C({ meat: '#c87a7a', hide: '#8a6a4a', gold: '#f2d14b', food: '#d8b86a', ore: '#8a8a92', arms: '#a8a8b0', herbs: '#7ac87a', timber: '#8a6a42' }[l.kind] || '#ffffff'), roughness: 0.7 }));
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
        const geo = new THREE.RingGeometry(f.range * 0.55, f.range, 18, 1, -f.angle - f.arc / 2, f.arc);
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
      R.sun.intensity = 1.35 * Math.max(0, dl);
      R.sun.color.copy(lerpC(C('#fff4e0'), C('#ff9a5a'), Math.max(dusk, 0)));
      R.sun.castShadow = dl > 0.05;
      R.moon.position.set(tgt.x + 20, 40, tgt.z + 10); R.moon.target.position.copy(tgt);
      R.moon.intensity = 0.32 * (1 - dl);
      R.hemi.intensity = 0.28 + 0.42 * dl;
      R.hemi.color.copy(lerpC(C('#3a4a78'), C('#d6e6ff'), dl));
      R.hemi.groundColor.copy(lerpC(C('#141018'), C('#4a4030'), dl));
      let fog = lerpC(C('#0d1222'), C(season === 3 ? '#c8d4dc' : '#a9c2d4'), dl);
      if (dusk > 0) fog = lerpC(fog, C('#d88a5a'), dusk * 0.45);
      R.scene.fog.color.copy(fog);
      R.scene.background = R.scene.fog.color;
      R.scene.fog.near = R.camDistNow * 1.15;
      R.scene.fog.far = R.camDistNow * (season === 3 ? 2.6 : 3.4);
      R.renderer.toneMappingExposure = 1.0 + (1 - dl) * 0.35;
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
      for (const p of ECHO.Combat.proj) if (p.kind === 'fire') push(p.x, p.y, 3.5 + p.radius, 1.4, '#ff9a3c', 0.6);
      cand.sort((a, b) => a.d - b.d);
      const flick = 1 + Math.sin(R.time * 11) * 0.04 + Math.sin(R.time * 23) * 0.03;
      for (let i = 0; i < MAX_LIGHTS; i++) {
        const L = R.points[i], c = cand[i];
        if (!c || c.d > 900) { L.intensity = 0; continue; }
        L.position.set(c.x, R.groundH(c.x, c.y) + c.h, c.y);
        L.color.copy(C(c.color));
        L.distance = c.r * 1.9;
        L.intensity = c.a * 1.6 * flick * (night ? 1 : 0.5);
      }
      // seasons: snow
      R.snow.visible = season === 3;
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
      // camera
      const pe = game.pe;
      const tx = pe ? pe.x : game.cam.x, ty = pe ? pe.y : game.cam.y;
      const gh = R.groundH(tx, ty);
      R.camTarget = R.camTarget || new THREE.Vector3(tx, gh, ty);
      if (Math.abs(R.camTarget.x - tx) + Math.abs(R.camTarget.z - ty) > 12) { R.camTarget.set(tx, gh, ty); R.firstFrame = true; R.sitesT = 0; }
      const k = Math.min(1, dt * 7);
      R.camTarget.x = U.lerp(R.camTarget.x, tx, k); R.camTarget.z = U.lerp(R.camTarget.z, ty, k); R.camTarget.y = U.lerp(R.camTarget.y, gh, k);
      const D = R.camDistNow = R.camDist * (1 + R.zoomExtra);
      let sx = 0, sy = 0;
      if (game.shakeT > 0) { sx = (Math.random() - 0.5) * game.shakeA * 0.4; sy = (Math.random() - 0.5) * game.shakeA * 0.4; }
      R.camera.position.set(R.camTarget.x + sx, R.camTarget.y + D * 0.86, R.camTarget.z + D * 0.6 + sy);
      R.camera.lookAt(R.camTarget.x + sx, R.camTarget.y + 0.5, R.camTarget.z + sy);
      R.camera.updateMatrixWorld();
      R.updateChunks(game);
      R.updateTowns(game);
      R.updateSites(game, dt);
      for (const f of R.flames || []) { f.scale.y = 1 + Math.sin(R.time * 13 + f.position.x) * 0.15; }
      if (R.rift) R.rift.rotation.y += dt * 0.6;
      R.updateOcclusion(game);
      R.updateEntities(game, dt);
      R.updateFx(game, dt);
      R.updateLighting(game, dt);
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
      const heights = { player: 1.25, person: 1.25, boss: 3.6 };
      for (const e of game.ents) {
        if (e.dead || e.hidden || e === game.pe) continue;
        if (!R.onScreen(game, e.x, e.y)) continue;
        const h = e.type === 'creature' ? (e.species === 'wolf' ? 1.0 : 0.65) : (heights[e.type] || 1.2);
        const p = R.project(e.x, e.y, h);
        const hover = U.dist(mouse.x, mouse.y, e.x, e.y) < 0.9;
        // health bar for wounded foes
        if (e.type !== 'boss' && e.hp < e.maxHp) {
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
        if (e.type === 'boss') { text(e.label, p.x, ty, '#ffcf8a'); continue; }
        if (e.yielded) { text('yields — [E] to spare', p.x, ty, '#9fe0c8'); continue; }
        if (e.sleeping && hover) { text('asleep', p.x, ty, '#9fb7d8'); continue; }
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
        } else if (e.type === 'creature' && hover) {
          text(ECHO.Ecology.speciesName(world, world.regions[e.regionId], e.species), p.x, ty, game.hostileTo(game.pe, e) ? '#ffb0a0' : '#e0e0d0');
        }
      }
      for (const f of ECHO.Combat.floaters) {
        if (f.y0 == null) f.y0 = f.y;
        const rise = (f.y0 - f.y) * 1.2;
        const p = R.project(f.x, f.y0, 1.3 + rise);
        if (p.z > 1) continue;
        ctx.globalAlpha = Math.max(0, 1 - f.t / f.life);
        if (f.big) ctx.font = `${Math.round(fs * 1.35)}px "Pixelify Sans", monospace`;
        text(f.text, p.x, p.y, f.color);
        if (f.big) ctx.font = `${fs}px "Pixelify Sans", monospace`;
        ctx.globalAlpha = 1;
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
