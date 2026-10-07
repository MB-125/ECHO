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
      for (const g of ['terrain', 'props', 'towns', 'sites', 'room', 'ents', 'fx']) { R.groups[g] = new THREE.Group(); s.add(R.groups[g]); }
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
      for (const g of ['towns', 'sites', 'ents', 'fx', 'room']) R.clear(R.groups[g]);
      R.roomKey = null;
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
      if (!R.hc || x >= 9000) return 0;
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
      for (const s of (ECHO.Explore ? ECHO.Explore.sites(world) : [])) {
        if (!near(s.x, s.y)) continue;
        const add = (name, dx, dy, colors, rot = 0, sc = 1) => R.addStatic(g, name, s.x + dx, s.y + dy, colors, rot, sc);
        const hole = (dx, dy, r = 0.6) => { const m = new THREE.Mesh(new THREE.CircleGeometry(r, 12), new THREE.MeshBasicMaterial({ color: '#05050a' })); m.rotation.x = -Math.PI / 2; m.position.set(s.x + dx, R.groundH(s.x + dx, s.y + dy) + 0.04, s.y + dy); g.add(m); };
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
        }
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
    buildRoom(game, L) {
      const g = R.groups.room;
      for (const o of g.children.slice()) { g.remove(o); if (o.geometry && o.userData.own) o.geometry.dispose(); }
      R.roomWindows = [];
      const B = ECHO.Interior.BASE;
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
      // furniture
      for (const f of L.furn) {
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
      for (const p of ECHO.Combat.proj) if (p.kind === 'fire') push(p.x, p.y, 3.5 + p.radius, 1.4, '#ff9a3c', 0.6);
      cand.sort((a, b) => a.d - b.d);
      const flick = 1 + Math.sin(R.time * 11) * 0.05 + Math.sin(R.time * 23) * 0.04;
      for (let i = 0; i < MAX_LIGHTS; i++) {
        const P = R.points[i], c = cand[i];
        if (!c) { P.intensity = 0; continue; }
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
      if (e.type === 'player' || e.type === 'person' || e.type === 'ghost' || e.humanoid) inst = ECHO.Models.instance('person');
      else if (e.type === 'creature') inst = ECHO.Models.instance(e.species === 'hind' ? 'stag' : e.species);
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
      if (e.species === 'hind') {
        M.recolor(inst, 'stag', '#f4f2ea'); M.recolor(inst, 'cloth2', '#e6e2d6'); M.recolor(inst, 'white', '#ffffff'); M.recolor(inst, 'eyeglow', '#bfe8ff'); M.recolor(inst, 'darkwood', '#b8b0a0');
        for (const k of ['antlers', 'armorMelee', 'armorFire', 'armorRanged']) M.show(inst, k, false);
        for (const m of inst.mats) { if (m.emissive) m.emissive.set('#3a3e48'); }
        inst.root.scale.setScalar(0.5);
        return;
      }
      if (e.type === 'creature') {
        const base = { wolf: 'fur', gnawer: 'rat', hare: 'hare' }[e.species];
        const tint = e.mutation === 'mirrorback' ? '#b8c4d4' : e.mutation === 'emberfur' ? '#a8502a' : e.strain === 'Ashen' ? '#8e8e8a' : e.strain === 'Ironhide' ? '#5a4632' : null;
        if (tint) M.recolor(inst, base, tint);
        if (e.mutation === 'paleshade') for (const m of inst.mats) { m.transparent = true; m.opacity = 0.5; }
        M.show(inst, 'horn', e.mutation === 'glasshorn');
        inst.root.scale.setScalar((e.species === 'wolf' ? 1.05 : 1.15) * (e.scale || 1));
        if (e.beast || e.scale > 1.2) M.recolor(inst, base, '#2e2a30');
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
      M.show(inst, 'torch', !ECHO.Interior.cur && (!!gear.torch || (e.type === 'player' && game.isNight())));
      M.show(inst, 'staff', prof === 'elder');
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
      inst.root.scale.setScalar(scale);
    },
    animatePerson(game, e, v, dt) {
      const P = v.inst.parts;
      const moving = (v.mv || 0) > 0.5 && !e.dead;
      const ph = e.anim * 11;
      const sw = e.dead ? 0 : Math.sin(ph) * 0.65 * (v.mv || 0);
      P.legL.rotation.z = sw; P.legR.rotation.z = -sw;
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
      if (e.type === 'ghost' && e.say && e.sayT > 0 && !e.kneel) { aR = -2.2; aL = -2.2; }
      if (e.role === 'captive') { aL = 0.4; aR = 0.4; }
      // Windups glint so you can read the attack coming.
      if (e.state === 'windup' && e !== game.pe) { lean = -0.18; v.tell = 1; } else v.tell = 0;
      const seated = (e.seated && !moving && e.indoor) || e.seatedGhost;
      if (seated) { P.legL.rotation.z = P.legR.rotation.z = -1.45; aL = aR = -0.45; }
      if (e.kneel) { P.legL.rotation.z = -1.5; P.legR.rotation.z = 0.2; aL = aR = -0.3; }
      P.armL.rotation.z = aL; P.armR.rotation.z = aR;
      P.armL.rotation.x = aLx; P.armR.rotation.x = aRx;
      P.body.position.y = 0.42 + Math.abs(Math.sin(ph)) * 0.04 * (v.mv || 0) + Math.sin(R.time * 2 + v.bob) * 0.006 * (1 - (v.mv || 0));
      P.body.rotation.z = lean * 0.6;
      P.head.rotation.z = e.sayT > 0 ? Math.sin(R.time * 9) * 0.06 : 0;
      v.twist = twist;
      v.inst.root.rotation.z = 0; v.yOff = 0;
      if (e.sleeping) { v.inst.root.rotation.z = Math.PI / 2; v.yOff = e.indoor && e.indoor.pose === 'bed' && !e.indoor.floor ? 0.62 : 0.18; }
      else if (e.yielded || e.role === 'captive') v.yOff = -0.18;
      else if (e.kneel) v.yOff = -0.22;
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
      if (e.species === 'hind' && P.neck) { const graze = e.state === 'graze' && Math.sin(R.time * 0.7 + e.id) > 0.3; P.neck.rotation.y = U.lerp(P.neck.rotation.y || 0, graze ? -1.1 : 0, 0.08); }
      if (e.species === 'wolf') {
        const crouch = e.state === 'windup' ? 0.12 : 0;
        v.tell = e.state === 'windup' ? 1 : 0;
        P.body.position.y = 0.42 - crouch + Math.abs(Math.sin(ph)) * 0.03 * (v.mv || 0);
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
        root.visible = !e.hidden;
        if (e.hidden) continue;
        v.cfgT -= dt;
        if (v.cfgT <= 0) { v.cfgT = 1; R.configure(game, e, v); v.baseScale = root.scale.x; }
        // Smooth what the eye sees: position eases toward the simulation,
        // and "walking" fades in and out instead of flickering on and off.
        if (v.px == null || Math.hypot(e.x - v.px, e.y - v.py) > 1.5 || e === game.pe) { v.px = e.x; v.py = e.y; }
        else { const kp = 1 - Math.exp(-dt * 16); v.px += (e.x - v.px) * kp; v.py += (e.y - v.py) * kp; }
        const spd = dt > 0 ? Math.hypot(e.x - (v.lx == null ? e.x : v.lx), e.y - (v.ly == null ? e.y : v.ly)) / dt : 0;
        v.lx = e.x; v.ly = e.y;
        v.spd = v.spd == null ? spd : v.spd + (spd - v.spd) * Math.min(1, dt * 10);
        const wantMv = e.moving || v.spd > 0.35 ? 1 : 0;
        if (dt > 0) v.mv = (v.mv == null ? wantMv : v.mv + (wantMv - v.mv) * Math.min(1, dt * 7));
        if (e.type === 'player' || e.type === 'person' || e.type === 'ghost' || e.humanoid) R.animatePerson(game, e, v, dt);
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
        root.rotation.y = Math.PI - v.dir + (v.twist || 0);
        v.twist = 0;
        const gy = R.groundH(v.px, v.py);
        root.position.set(v.px, gy + (v.yOff || 0), v.py);
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
    updateGlows(game) {
      const list = (ECHO.Marvels ? ECHO.Marvels.glows : []).concat(ECHO.Fest ? ECHO.Fest.glows : [], ECHO.Quests ? ECHO.Quests.glows : []);
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
        if (f.kind === 'smoke') { h = 1.0 + f.t * 0.7; f.x += (f.vx || 0) * dt; f.y += 0; }
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
      R.sun.castShadow = dl > 0.05;
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
      const snowing = wx.today === 'snow' || wx.today === 'blizzard' || (season === 3 && wx.today !== 'clear' && wx.today !== 'heat');
      R.snow.visible = snowing;
      const raining = !snowing && (wx.today === 'rain' || wx.today === 'storm');
      R.rain.visible = raining;
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
      // camera
      const pe = game.pe;
      let tx = pe ? pe.x : game.cam.x, ty = pe ? pe.y : game.cam.y;
      const rm = ECHO.Interior && ECHO.Interior.cur;
      const lk = ECHO.PlayerCtl.lock;
      if (lk && pe && !rm) { tx = U.lerp(tx, lk.x, 0.3); ty = U.lerp(ty, lk.y, 0.3); }
      if (rm) { // frame the room rather than the player alone
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
      if (room && R.roomKey !== room) { R.roomKey = room; R.roomFlames = []; R.buildRoom(game, room); R.camTarget.set(tx, 0, ty); }
      const punch = game.camPunch || 0;
      const D = R.camDistNow = R.camDist * (1 + R.zoomExtra) * (room ? U.clamp(0.5 + room.H * 0.035, 0.72, 0.95) : 1) * (1 - Math.min(0.12, punch * 0.07));
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
            const rate = sm.lost && game.world.day - (sm.b.fac.lostDay || 0) < 6 ? 14 : sm.kind === 'mine' && sm.b.fac.state === 'working' ? 0.6 : 0;
            if (rate && Math.random() < dt * rate) ECHO.Combat.fx.push({ kind: 'smoke', x: sm.x + (Math.random() - 0.5) * 1.5, y: sm.y + (Math.random() - 0.5), vx: (Math.random() - 0.3) * 0.4, vy: 0, t: 0, life: 3 + Math.random() * 2, size: 3 });
            if (sm.lost && game.world.day - (sm.b.fac.lostDay || 0) < 2 && Math.random() < dt * 20) ECHO.Combat.fx.push({ kind: 'p', x: sm.x + (Math.random() - 0.5) * 1.6, y: sm.y + (Math.random() - 0.5) * 1.2, vx: 0, vy: -1.2, t: 0, life: 0.6, color: Math.random() < 0.5 ? '#ffb347' : '#ff5a1f', size: 2 });
          }
        }
        if (R.rift) R.rift.rotation.y += dt * 0.6;
        R.updateOcclusion(game);
      } else for (const f of R.roomFlames || []) f.scale.y = f.scale.x * (1 + Math.sin(R.time * 13 + f.position.x) * 0.12);
      R.updateEntities(game, dt);
      R.updateFx(game, dt);
      R.updateGlows(game);
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
        if (e.type === 'boss') { text(e.label, p.x, ty, '#ffcf8a'); continue; }
        if (e.marvel) { if (e.label && U.dist(e.x, e.y, game.pe.x, game.pe.y) < 6) text(e.label, p.x, ty, '#bfe8ff'); continue; }
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
        } else if (e.type === 'creature' && e.label && !e.marvel) {
          if (hover || (e.foe && e.foe.elite) || e.beast || U.dist(e.x, e.y, game.pe.x, game.pe.y) < 7) text(e.label, p.x, ty, '#ffb0a0');
        } else if (e.type === 'creature' && hover) {
          text(e.humanoid ? e.foe.name : ECHO.Ecology.speciesName(world, world.regions[e.regionId], e.species), p.x, ty, game.hostileTo(game.pe, e) ? '#ffb0a0' : '#e0e0d0');
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
