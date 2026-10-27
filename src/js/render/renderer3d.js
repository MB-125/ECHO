// 3D renderer (Three.js). Draws the living world with the Blender-built
// models: a sculpted, faceted landscape; instanced trees, crops and grass that
// change with the seasons (and visibly thin when vermin eat the fields);
// towns that wear their faction's colours and light their windows at night;
// animated people, beasts and bosses whose armour shows what they learned;
// a real sun and shadows, lanterns and campfires that light the dark, fog.
// The game logic is a world of tiles on a flat grid; this file
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
      // Asking the driver whether each shader built cleanly makes the game wait for
      // it there and then; without the question, shaders build in the background
      // (see warmUp). ?debug brings the checks back.
      r.debug.checkShaderErrors = /[?&]debug\b/.test((window.location && window.location.search) || '');
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
      // the ground and everything built on it has a grain of its own
      R.detail(R.mat.terrain, 0.16, 1.3);
      R.groundDetail(R.mat.terrain);
      R.detail(R.mat.prop, 0.12, 2.5);
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
      if (ECHO.Post) ECHO.Post.init(R);
    },
    // Shaders, built ahead. The first time a kind of surface is drawn — a dragon
    // fading in, a spell's glow, a hidden shrine's stone — the graphics driver has
    // to build a shader for it, and on some machines that is a long stall right in
    // the middle of a ride. So, once the world is up, one of every kind we draw is
    // handed to the driver to build in the background, and kept (so the shader is
    // never thrown away and built again when the last thing using it leaves).
    warmUp() {
      R.warmed = true;
      const r = R.renderer;
      if (R._zoo) { for (const m of R._zoo.mats) m.dispose(); R._zoo = null; }
      const S = o => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.8 }, o)), Bm = o => new THREE.MeshBasicMaterial(o || {});
      const fams = [
        () => S(), () => S({ flatShading: true }), () => S({ vertexColors: true }), () => S({ vertexColors: true, flatShading: true }),
        () => R.detail(S(), 0.1, 3.5), () => R.detail(S({ vertexColors: true }), 0.12, 2.5), () => R.detail(S({ vertexColors: true, flatShading: true }), 0.34, 1.3),
        () => S({ side: THREE.DoubleSide }), () => Bm(), () => Bm({ vertexColors: true }), () => Bm({ side: THREE.DoubleSide })
      ];
      const g = R._zooGeo || (R._zooGeo = new THREE.BoxGeometry(0.01, 0.01, 0.01));
      const zoo = new THREE.Group(), mats = [];
      for (const make of fams) for (const tr of [false, true]) for (const inst of [false, true]) {
        const m = make();
        if (tr) { m.transparent = true; m.opacity = 0.5; m.depthWrite = false; }
        const o = inst ? new THREE.InstancedMesh(g, m, 1) : new THREE.Mesh(g, m);
        if (inst) o.setMatrixAt(0, new THREE.Matrix4());
        o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
        zoo.add(o); mats.push(m);
      }
      // creatures with skeletons (the dragons): their own shader, opaque and fading
      {
        const sg = new THREE.BoxGeometry(0.01, 0.01, 0.01), n = sg.attributes.position.count;
        sg.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(n * 4).fill(0), 4));
        sg.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Array(n).fill([1, 0, 0, 0]).flat(), 4));
        for (const tr of [false, true]) for (const fam of [() => R.detail(S({ flatShading: false }), 0.1, 3.5), () => Bm()]) {
          const m = fam();
          if (tr) { m.transparent = true; m.opacity = 0.5; m.depthWrite = false; }
          const bone = new THREE.Bone(), sm = new THREE.SkinnedMesh(sg, m);
          sm.add(bone); sm.bind(new THREE.Skeleton([bone]));
          sm.castShadow = true; sm.frustumCulled = false;
          zoo.add(sm); mats.push(m);
        }
      }
      // the fight's own: a sword's swing, a mark on the ground
      try {
        for (const shape of ['circle', 'line']) { const tl = R.makeTele({ kind: 'tele', shape, radius: 1, len: 1, angle: 0, color: 'rgba(255,80,60,0.3)' }); zoo.add(tl); mats.push(tl.material); }
        const sl = R.makeFxMesh({ kind: 'slash', angle: 0, arc: 1.5, range: 1, color: '#ffffff', style: 'combo' }); zoo.add(sl); mats.push(sl.material);
        const dm = new THREE.MeshBasicMaterial({ map: R.decalTex('blood'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
        zoo.add(new THREE.Mesh(g, dm)); mats.push(dm);
        // monsters of their own shape (each kind of stuff its own shader), and beyond the Rift
        for (const k of Object.values(R.MON_MODEL)) { const mi = ECHO.Models.instance(k); if (mi) { mi.root.scale.setScalar(0.001); zoo.add(mi.root); } }
        for (const vm of [R.voidFloorMat(), R.voidSkyMat(), R.voidTearMat()]) zoo.add(new THREE.Mesh(g, vm));
        const vp = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3)).setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(1), 1)), R.voidMoteMat()); vp.frustumCulled = false; zoo.add(vp);
      } catch (e) { /* drawn when first needed */ }
      for (const tr of [false, true]) { const m = new THREE.LineBasicMaterial({ transparent: tr, opacity: tr ? 0.5 : 1 }); zoo.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0.01, 0)]), m)); mats.push(m); }
      R.scene.add(zoo);
      try { r.compile(R.scene, R.camera); } catch (e) { /* a driver that won't: they build as needed, as before */ }
      R.scene.remove(zoo);
      R._zoo = { group: zoo, mats };
    },
    // Surface detail without textures: patches and grain drawn from the place
    // itself (a few octaves of noise on the world position), so a stone square,
    // a meadow or a plastered wall is never one flat colour — and a little
    // variation in how rough it is, so the light catches it unevenly.
    detail(mat, k, scale) {
      if (!mat || mat.userData.detail) return mat;
      mat.userData.detail = true;
      const key = 'detail' + k + ':' + scale;
      mat.customProgramCacheKey = () => key;
      mat.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vDetailW;')
          .replace('#include <project_vertex>', `#include <project_vertex>
          vec4 dw = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            dw = instanceMatrix * dw;
          #endif
          vDetailW = (modelMatrix * dw).xyz;`);
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
          varying vec3 vDetailW;
          float dHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float dNoise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(mix(dHash(i), dHash(i + vec2(1.0, 0.0)), u.x), mix(dHash(i + vec2(0.0, 1.0)), dHash(i + vec2(1.0, 1.0)), u.x), u.y); }`)
          .replace('#include <color_fragment>', `#include <color_fragment>
          vec2 dp = vDetailW.xz * ${scale.toFixed(2)} + vDetailW.y * 0.37;
          float dN = dNoise(dp * 0.11) * 0.5 + dNoise(dp * 0.53) * 0.3 + dNoise(dp * 2.7) * 0.2;
          diffuseColor.rgb *= 1.0 + (dN - 0.5) * ${(k * 2).toFixed(3)};`)
          .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = clamp(roughnessFactor * (0.9 + dN * 0.2), 0.04, 1.0);`);
      };
      mat.needsUpdate = true;
      return mat;
    },
    // What a monster is made of, drawn on it: bone that is pitted and cracked,
    // cloth that is woven, creased, worn and dirty at the hem, stone split into
    // plates, metal brushed and scratched with rust in the seams, leather grained,
    // and ghost-stuff that drifts and glows. Drawn from the part's own space, so
    // it moves with it; no images needed.
    SURF: { bone: 'bone', bonedark: 'bone', skin: 'skin', cloth: 'cloth', cloth2: 'cloth', rag: 'cloth', cape: 'cloth', stone: 'stone', darkstone: 'stone', obsidian: 'stone', metal: 'metal', darkmetal: 'metal', iron: 'metal', gold: 'gold', rust: 'rust', leather: 'leather', darkwood: 'wood', wood: 'wood', ghost: 'ghost', crystal: 'crystal', gnarlbark: 'bark', deadbark: 'bark', antlerdark: 'bone', wendskin: 'skin', paleskin: 'skin', gloamfur: 'fur', hairblack: 'fur', moss: 'fur', leafcloak: 'cloth', shroud: 'ghost' },
    surface(mat, kind) {
      if (!mat || mat.userData.surf) return mat;
      mat.userData.surf = kind;
      const K = ['bone', 'skin', 'cloth', 'stone', 'metal', 'gold', 'rust', 'leather', 'wood', 'ghost', 'crystal', 'bark', 'fur'].indexOf(kind);
      mat.customProgramCacheKey = () => 'surf' + K;
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = R.waterTime;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSP; varying vec3 vSN;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSP = position; vSN = normal;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
          uniform float uTime; varying vec3 vSP; varying vec3 vSN;
          float sH(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
          float sN(vec3 p) { vec3 i = floor(p), f = fract(p); vec3 u = f * f * (3.0 - 2.0 * f);
            return mix(mix(mix(sH(i), sH(i + vec3(1,0,0)), u.x), mix(sH(i + vec3(0,1,0)), sH(i + vec3(1,1,0)), u.x), u.y),
                       mix(mix(sH(i + vec3(0,0,1)), sH(i + vec3(1,0,1)), u.x), mix(sH(i + vec3(0,1,1)), sH(i + vec3(1,1,1)), u.x), u.y), u.z); }
          float sF(vec3 p) { return sN(p) * 0.55 + sN(p * 2.1) * 0.3 + sN(p * 4.3) * 0.15; }
          float sCell(vec3 p) { vec3 i = floor(p), f = fract(p); float d1 = 9.0, d2 = 9.0;
            for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) { vec3 g = vec3(float(x), float(y), float(z)); vec3 o = vec3(sH(i + g), sH(i + g + 7.1), sH(i + g + 3.3));
              float d = length(g + o - f); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
            return d2 - d1; }
          vec2 sPlane(vec3 p, vec3 n) { vec3 a = abs(n); return a.x > a.y && a.x > a.z ? p.yz : a.y > a.z ? p.xz : p.xy; }`)
          .replace('#include <color_fragment>', `#include <color_fragment>
          float sRough = 1.0; vec3 sEm = vec3(0.0);
          {
            vec3 P = vSP; vec3 Nn = normalize(vSN); int K = ${K};
            if (K == 0 || K == 1) {
              float f = sF(P * 16.0), pit = smoothstep(0.72, 0.8, sN(P * 70.0)), cr = 1.0 - smoothstep(0.0, 0.035, abs(sN(P * vec3(7.0, 3.0, 7.0)) - 0.5));
              diffuseColor.rgb *= (0.84 + 0.3 * f) * (1.0 - pit * 0.35) * (1.0 - cr * (K == 0 ? 0.45 : 0.2));
              diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.78, 0.7, 0.55), smoothstep(0.55, 0.8, sF(P * 5.0)) * 0.6);
              sRough = 0.85 + f * 0.3;
            } else if (K == 2) {
              vec2 q = sPlane(P, Nn) * 190.0;
              float weave = 0.5 + 0.5 * sin(q.x) * sin(q.y);
              float folds = sF(vec3(P.x * 9.0, P.y * 0.9, P.z * 9.0));
              float hem = smoothstep(0.32, 0.0, P.y + 0.05 * sN(P * 20.0)) * step(-0.02, P.y);
              diffuseColor.rgb *= (0.88 + weave * 0.1) * (0.84 + folds * 0.26);
              diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.55, 0.5, 0.45), hem * 0.55);
              diffuseColor.rgb *= 1.0 - smoothstep(0.68, 0.76, sN(P * 26.0)) * 0.14;
              sRough = 1.05;
            } else if (K == 3) {
              float c = sCell(P * 7.0), crack = 1.0 - smoothstep(0.02, 0.09, c), sp = sN(P * 55.0);
              diffuseColor.rgb *= (0.8 + sF(P * 9.0) * 0.38) * (1.0 - crack * 0.55) * (0.94 + sp * 0.12);
              sRough = 1.0;
            } else if (K == 4 || K == 5) {
              float br = sN(vec3(P.x * 90.0, P.y * 3.0, P.z * 90.0)), sc = 1.0 - smoothstep(0.0, 0.02, abs(sN(P * vec3(30.0, 6.0, 30.0)) - 0.5));
              float rust = smoothstep(0.62, 0.78, sF(P * 8.0)) * (K == 4 ? 0.4 : 0.2);
              diffuseColor.rgb *= 0.86 + br * 0.24 + sc * 0.3;
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.18, 0.08, 0.03), rust);
              sRough = 0.75 + rust * 0.9 - sc * 0.3;
            } else if (K == 6) {
              float b = sF(P * 14.0), pit = smoothstep(0.6, 0.75, sN(P * 45.0));
              diffuseColor.rgb *= 0.7 + b * 0.55; diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.14, 0.05), pit * 0.6); sRough = 1.1;
            } else if (K == 7) {
              float g = sN(P * 90.0), sc = sF(P * 12.0);
              diffuseColor.rgb *= 0.8 + g * 0.18 + sc * 0.15; sRough = 0.9 + g * 0.2;
            } else if (K == 8) {
              vec3 Q = vec3(P.x * 40.0, P.y * 3.0, P.z * 40.0);
              diffuseColor.rgb *= 0.72 + sF(Q) * 0.5; sRough = 1.05;
            } else if (K == 9) {
              float f = sF(P * 6.0 + vec3(0.0, -uTime * 0.7, 0.0)), w = sF(P * 13.0 + vec3(uTime * 0.3, uTime * 0.9, 0.0));
              sEm = diffuseColor.rgb * (0.35 + f * 0.9);
              diffuseColor.a *= clamp(0.25 + f * 0.75 - w * 0.25, 0.08, 1.0);
            } else if (K == 10) {
              float c = sCell(P * 9.0), edge = 1.0 - smoothstep(0.0, 0.08, c);
              sEm = diffuseColor.rgb * (0.55 + 0.45 * sin(uTime * 2.0 + P.y * 9.0)) * (0.6 + edge);
              sRough = 0.3;
            } else if (K == 11) {
              // bark: deep furrows running up the wood, ridges between, lichen in patches
              float ang = atan(P.z, P.x);
              float fur = sN(vec3(ang * 3.0, P.y * 5.0, 0.0) + sN(P * 4.0) * 1.5);
              float ridge = smoothstep(0.35, 0.65, fur), knot = smoothstep(0.75, 0.85, sN(P * 9.0));
              diffuseColor.rgb *= (0.55 + ridge * 0.6) * (0.9 + sN(P * 60.0) * 0.2) * (1.0 - knot * 0.3);
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.26, 0.12), smoothstep(0.62, 0.8, sF(P * 6.0)) * 0.5);
              sRough = 1.1;
            } else if (K == 12) {
              // fur, hair, moss: fine strands that catch the light along their length
              float s1 = sN(vec3(P.x * 140.0, P.y * 14.0, P.z * 140.0)), s2 = sN(P * 25.0);
              diffuseColor.rgb *= 0.72 + s1 * 0.42 + s2 * 0.12;
              sRough = 1.05;
            }
          }`)
          .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = clamp(roughnessFactor * sRough, 0.04, 1.0);`)
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += sEm;`);
      };
      mat.needsUpdate = true;
      return mat;
    },
    // The ground up close: crisp patterns drawn from the world position and what
    // each tile is — cobbles with mortar in the squares, pebbles in the roads,
    // tufts in the grass, furrows in the fields, ripples in the sand, cracked
    // flagstones in the ruins — so the land reads sharply instead of as soft
    // washes of colour. Edges are anti-aliased with screen-space derivatives, and
    // the patterns fade out where they would be smaller than a few pixels.
    groundDetail(mat) {
      const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey;
      mat.extensions = Object.assign(mat.extensions || {}, { derivatives: true });
      mat.customProgramCacheKey = () => prevKey.call(mat) + '|ground2';
      mat.onBeforeCompile = (sh, r) => {
        prev(sh, r);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aKind;\nvarying float vKind;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvKind = aKind;');
        sh.fragmentShader = sh.fragmentShader.replace('varying vec3 vDetailW;', `varying vec3 vDetailW;
          varying float vKind;
          float gH(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 15731.743); }
          // distance to the nearest edge of the cell, with the cell's id
          float cellEdge(vec2 p, out vec2 id) { id = floor(p); vec2 f = fract(p); return min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)); }
          float aaLine(float d, float w, float fw) { return 1.0 - smoothstep(w, w + fw * 1.5, d); }`)
          .replace('#include <color_fragment>', `#include <color_fragment>
          {
            vec2 wp = vDetailW.xz;
            float k = floor(vKind + 0.5), shade = 1.0;
            if (k == 1.0) {            // cobbles, laid in courses
              vec2 p = wp * vec2(2.1, 2.8); p.x += mod(floor(p.y), 2.0) * 0.5;
              vec2 id; float d = cellEdge(p, id), fw = fwidth(p.x) + fwidth(p.y);
              float fade = 1.0 - smoothstep(0.18, 0.45, fw);
              shade = 1.0 + ((gH(id) - 0.5) * 0.1 - aaLine(d, 0.04, fw) * 0.2 - (1.0 - smoothstep(0.04, 0.2, d)) * 0.06) * fade;
            } else if (k == 2.0) {     // packed earth and pebbles
              vec2 p = wp * 5.0; vec2 id = floor(p); vec2 c = vec2(gH(id), gH(id + 7.1)) * 0.6 + 0.2;
              float r = gH(id + 3.3) > 0.55 ? 0.13 + gH(id + 9.0) * 0.1 : 0.0, fw = fwidth(p.x) + fwidth(p.y);
              float dot1 = 1.0 - smoothstep(r - fw, r + fw, length(fract(p) - c));
              float fade = 1.0 - smoothstep(0.2, 0.5, fw);
              shade = 1.0 + (dot1 * (gH(id + 1.7) > 0.5 ? 0.16 : -0.2)) * fade;
            } else if (k == 3.0) {     // furrows
              float p = wp.y * 4.0 + sin(wp.x * 0.7) * 0.15, fw = fwidth(p);
              float t = abs(fract(p) - 0.5);
              float fade = 1.0 - smoothstep(0.2, 0.5, fw);
              shade = 1.0 + (aaLine(t, 0.12, fw) * -0.22 + (1.0 - smoothstep(0.2, 0.5, t)) * 0.06) * fade;
            } else if (k == 4.0) {     // wind ripples in sand
              float p = (wp.x * 0.6 + wp.y) * 2.2 + sin(wp.x * 1.3 + wp.y * 0.4) * 0.6, fw = fwidth(p);
              float fade = 1.0 - smoothstep(0.2, 0.5, fw);
              shade = 1.0 + (aaLine(abs(fract(p) - 0.5), 0.05, fw) * 0.1 - aaLine(abs(fract(p + 0.12) - 0.5), 0.05, fw) * 0.08) * fade;
            } else if (k == 6.0) {     // flagstones, cracked
              vec2 p = wp * 1.6; p.x += mod(floor(p.y), 2.0) * 0.37;
              vec2 id; float d = cellEdge(p, id), fw = fwidth(p.x) + fwidth(p.y);
              float crack = aaLine(abs(fract(p.x * 1.7 + p.y * 0.6 + gH(id) * 3.0) - 0.5), 0.015, fw) * step(0.6, gH(id + 2.0));
              float fade = 1.0 - smoothstep(0.15, 0.4, fw);
              shade = 1.0 + ((gH(id) - 0.5) * 0.14 - aaLine(d, 0.035, fw) * 0.3 - crack * 0.2) * fade;
            } else if (k == 7.0 || k == 8.0) {   // bare rock (and stony hillsides): irregular plates and cracks
              vec2 p = wp * (k == 7.0 ? 1.3 : 0.9); vec2 ip = floor(p), fp = fract(p);
              float f1 = 8.0, f2 = 8.0; vec2 cid = ip;
              for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
                vec2 o = vec2(float(i), float(j)), c = o + vec2(gH(ip + o), gH(ip + o + 13.7)) * 0.8 + 0.1;
                float dd = length(c - fp);
                if (dd < f1) { f2 = f1; f1 = dd; cid = ip + o; } else if (dd < f2) f2 = dd;
              }
              float fw = fwidth(p.x) + fwidth(p.y), fade = 1.0 - smoothstep(0.15, 0.4, fw);
              float crack = 1.0 - smoothstep(0.03, 0.03 + fw * 1.5, f2 - f1);
              shade = 1.0 + ((gH(cid) - 0.5) * (k == 7.0 ? 0.14 : 0.05) - crack * (k == 7.0 ? 0.22 : 0.06)) * fade;
            } else if (k == 0.0 && diffuseColor.g > diffuseColor.r * 1.05) {   // grass: short tufts
              vec2 p = wp * vec2(6.0, 6.0); vec2 id = floor(p); vec2 f = fract(p) - vec2(gH(id), gH(id + 5.0)) * 0.6 - 0.2;
              float fw = fwidth(p.x) + fwidth(p.y);
              float blade = 1.0 - smoothstep(0.02, 0.02 + fw, abs(f.x + f.y * 0.25) - 0.015) ;
              blade *= step(abs(f.y), 0.22) * step(0.35, gH(id + 2.0));
              float fade = 1.0 - smoothstep(0.25, 0.55, fw);
              shade = 1.0 + blade * (gH(id + 4.0) > 0.5 ? 0.14 : -0.16) * fade;
            }
            diffuseColor.rgb *= shade;
          }`);
      };
      mat.needsUpdate = true;
      return mat;
    },
    // Graphics quality: how sharp, how far, how many lights and shadows.
    // (dpr: how many rendered pixels per screen pixel, at most — a sharp screen, a
    // laptop at 150% or a 4K monitor, is drawn at its own sharpness, not stretched)
    QUALITY: { low: { dpr: 1, chunk: 1, lights: 4, shadows: false, map: 512, shadowEvery: 1 }, medium: { dpr: 1.5, chunk: 2, lights: 6, shadows: true, map: 2048, shadowEvery: 2 }, high: { dpr: 2, chunk: 2, lights: 8, shadows: true, map: 4096, shadowEvery: 1 } },
    lightN: 8, chunkR: CHUNK_RADIUS,
    applyQuality() {
      const q = R.QUALITY[(ECHO.UI && ECHO.UI.settings.quality) || 'high'] || R.QUALITY.high;
      R.lightN = q.lights; R.chunkR = q.chunk; R.Q = q;
      if (!R.renderer) return;
      const was = R.renderer.shadowMap.enabled;
      R.renderer.shadowMap.enabled = q.shadows;
      const mapN = Math.min(q.map, (R.renderer.capabilities.maxTextureSize || 4096) / 2);
      if (R.sun) { R.sun.shadow.mapSize.set(mapN, mapN); if (R.sun.shadow.map) { R.sun.shadow.map.dispose(); R.sun.shadow.map = null; } }
      if (was !== q.shadows && R.scene) R.scene.traverse(o => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; });
      R.resize();
      R.warmed = false;   // the shaders change with the settings: build the new set
      if (ECHO.Post && ECHO.Post.R) { ECHO.Post.aoOff = false; ECHO.Post.bloomOff = false; ECHO.Post.scale = 1; ECHO.Post.noUp = false; ECHO.Post.hist = []; ECHO.Post.setup(); }
    },
    resize() {
      const q = R.QUALITY[(ECHO.UI && ECHO.UI.settings.quality) || 'high'] || R.QUALITY.high;
      // the labels and names drawn over the world are always at the screen's own
      // sharpness (cheap); the 3D picture at what the quality setting allows
      R.dpr = Math.min(2, window.devicePixelRatio || 1);
      R.rdpr = Math.min(q.dpr, window.devicePixelRatio || 1);
      R.cw = Math.floor(window.innerWidth * R.dpr);
      R.ch = Math.floor(window.innerHeight * R.dpr);
      R.renderer.setPixelRatio(R.rdpr);
      R.renderer.setSize(window.innerWidth, window.innerHeight, false);
      R.canvas.style.width = window.innerWidth + 'px'; R.canvas.style.height = window.innerHeight + 'px';
      R.overlay.width = R.cw; R.overlay.height = R.ch;
      R.overlay.style.width = window.innerWidth + 'px'; R.overlay.style.height = window.innerHeight + 'px';
      R.camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
      R.camera.updateProjectionMatrix();
      if (ECHO.Post && ECHO.Post.active) ECHO.Post.resize();
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
      if (R.secretSeen) { for (const s of R.secretSeen.values()) R.secretGroup.remove(s.g); R.secretSeen.clear(); }
      R._camV = null; R._chunkLast = null; R.warmed = false;
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
      const big = (world.W + 60) * (world.H + 60);
      const step = (R.Q && R.Q.map <= 512 ? 2 : 1) * (big > 700000 ? 4 : big > 220000 ? 2 : 1);
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
    // The land is built in 16-tile chunks around the camera. At speed (a gallop, a
    // dragon's back) it looks ahead along the way you are going, so the ground is
    // ready before it comes into view; it lets go of what is behind only once that
    // is well out of sight (so turning back costs nothing); and each frame it builds
    // only as much as fits in a few milliseconds, so the frame rate holds.
    updateChunks(game) {
      const world = game.world, tg = R.camTarget;
      // how fast the camera is going, smoothed
      const now = performance.now(), last = R._chunkLast;
      R._chunkLast = { x: tg.x, z: tg.z, t: now };
      if (last && now > last.t) {
        const k = Math.min(1, (now - last.t) / 250), vx = (tg.x - last.x) / ((now - last.t) / 1000), vz = (tg.z - last.z) / ((now - last.t) / 1000);
        if (Math.abs(vx) < 80 && Math.abs(vz) < 80) { R._camV = R._camV || { x: 0, z: 0 }; R._camV.x += (vx - R._camV.x) * k; R._camV.z += (vz - R._camV.z) * k; }
      }
      const v = R._camV || { x: 0, z: 0 }, speed = Math.hypot(v.x, v.z);
      R.camSpeed = speed;
      // from the sky you see further
      const rad = (R.flyK || 0) > 0.3 ? Math.max(R.chunkR, 2) + 1 : R.chunkR;
      const ccx = Math.floor(tg.x / CH), ccy = Math.floor(tg.z / CH);
      // where the camera will be in a second or so
      const look = Math.min(1.4, 0.35 + speed * 0.05);
      const ax = tg.x + v.x * look, az = tg.z + v.z * look;
      const acx = Math.floor(ax / CH), acy = Math.floor(az / CH);
      const epoch = R.chunkKey(world);
      const want = new Map();
      const addAround = (ox, oy, r) => {
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          const cx = ox + dx, cy = oy + dy;
          if (cx < 0 || cy < 0 || cx * CH >= world.W || cy * CH >= world.H) continue;
          const k = cx + ',' + cy;
          // nearest the point we are heading for first
          const pd = ((cx + 0.5) * CH - (tg.x + ax) / 2) ** 2 + ((cy + 0.5) * CH - (tg.z + az) / 2) ** 2;
          if (!want.has(k) || want.get(k)[2] > pd) want.set(k, [cx, cy, pd]);
        }
      };
      addAround(ccx, ccy, rad);
      if (acx !== ccx || acy !== ccy) addAround(acx, acy, rad);
      // let go of chunks only when they are a full chunk beyond what we want
      for (const k of Object.keys(R.chunks)) {
        if (want.has(k)) continue;
        const [cx, cy] = k.split(',').map(Number);
        if (Math.max(Math.abs(cx - ccx), Math.abs(cy - ccy)) > rad + 1 && Math.max(Math.abs(cx - acx), Math.abs(cy - acy)) > rad + 1) R.dropChunk(k);
      }
      const list = [...want.values()].sort((a, b) => a[2] - b[2]);
      const t0 = performance.now(), first = R.firstFrame;
      let built = 0;
      for (const [cx, cy] of list) {
        const k = cx + ',' + cy;
        const c = R.chunks[k];
        if (c && c.epoch === epoch) continue;
        // a few ms a frame; the chunk under your feet is never left waiting
        const under = Math.abs(cx - ccx) <= 1 && Math.abs(cy - ccy) <= 1 && !c;
        if (!first && built > 0 && !under && performance.now() - t0 > 3) break;
        if (c) R.dropChunk(k);
        R.buildChunk(world, cx, cy, epoch);
        built++;
      }
      R.firstFrame = false;
      R.cullChunks();
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
      const pos = new Float32Array(ntile * 18), col = new Float32Array(ntile * 18), kind = new Float32Array(ntile * 6);
      const KIND = R.GROUND_KIND || (R.GROUND_KIND = { [TILE.PLAZA]: 1, [TILE.ROAD]: 2, [TILE.BRIDGE]: 2, [TILE.FARM]: 3, [TILE.SAND]: 4, [TILE.SNOW]: 5, [TILE.ROCK]: 7, [TILE.HILL]: 8, [TILE.RUIN]: 6, [TILE.RUINWALL]: 6 });
      let o = 0, groundTop = 0;
      const tmp = new THREE.Color();
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const t = world.tiles[y * world.W + x];
        tmp.copy(C(tileColor(t, season, x, y, world.seed)));
        const jit = 0.9 + hash(x, y, world.seed + 2) * 0.2;
        tmp.multiplyScalar(jit);
        {
          const ii = y * world.W + x, trl = world._trail ? world._trail[ii] : 0, dwt = world._wd ? world._wd[ii] : 0;
          if (trl) tmp.lerp(C(dwt ? '#3e3528' : '#9a8258'), (dwt ? 0.75 : 0.82) * (0.88 + hash(x, y, world.seed + 4) * 0.24));
          if (dwt) tmp.lerp(C(trl ? '#1a1a14' : '#121a10'), 0.3 + dwt * 0.14);
        }
        const a = R.cornerH(x, y), b = R.cornerH(x + 1, y), c2 = R.cornerH(x, y + 1), d = R.cornerH(x + 1, y + 1);
        if (a > groundTop) groundTop = a;
        const V = [[x, a, y], [x, c2, y + 1], [x + 1, b, y], [x + 1, b, y], [x, c2, y + 1], [x + 1, d, y + 1]];
        const kd = KIND[t] || 0;
        for (let i = 0; i < 6; i++) {
          kind[o / 3] = kd;
          pos[o] = V[i][0]; pos[o + 1] = V[i][1]; pos[o + 2] = V[i][2];
          const shade = i < 3 ? 1 : 0.97;
          col[o] = tmp.r * shade; col[o + 1] = tmp.g * shade; col[o + 2] = tmp.b * shade;
          o += 3;
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
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
        const ii = y * world.W + x, trl = world._trail ? world._trail[ii] : 0, dwt = world._wd ? world._wd[ii] : 0;
        // worn paths: nothing grows on them (but in the deep woods, things at the edges)
        if (trl && (t === TILE.FOREST || t === TILE.TREE)) { if (dwt && h1 < 0.05 && trl === 1) add('shrooms', null, px, py, 0.7 + h2 * 0.4, h1 * 60); else if (!dwt && h1 < 0.18) add('grass', { grass: SEASON.grass[season] }, px, py, 0.8, h1 * 6.28); continue; }
        // the deep woods: old twisted trees and dead ones, thorns, glowing caps, bones and
        // the totems of whatever hunts here
        if (dwt && (t === TILE.TREE || t === TILE.FOREST)) {
          if (t === TILE.TREE) { if (h1 < 0.45) add('gnarltree', null, px, py, 0.78 + h2 * 0.3, h1 * 6.28); else add('deadtree', null, px, py, 0.8 + h2 * 0.32, h1 * 6.28); }
          else if (h1 < 0.22) add('deadtree', null, px, py, 0.55 + h2 * 0.25, h1 * 6.28);
          else if (h1 < 0.42) add('thorns', null, px, py, 0.9 + h2 * 0.6, h1 * 6.28);
          else if (h1 < 0.52) add('shrooms', null, px, py, 0.7 + h2 * 0.6, h1 * 6.28);
          else if (h1 < 0.58) add('bones', null, px, py, 1, h1 * 6.28);
          else if (h1 < 0.6 && dwt >= 2) add('totem', null, px, py, 1, h1 * 6.28);
          else if (h1 < 0.62 && dwt >= 2) add('hangcage', null, px, py, 1, h1 * 6.28);
          else if (h1 < 0.7) add('grass', { grass: '#2a3420' }, px, py, 0.9, h1 * 6.28);
          continue;
        }
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
      for (const w of (world.wild && world.wild.woods) || []) {
        if (w.x >= x0 && w.x < x1 && w.y >= y0 && w.y < y1) {
          add('erlthrone', null, w.x + 0.4, w.y - 0.2, 1.3, 0);
          for (let k = 0; k < 6; k++) { const a = k / 6 * 6.28 + 0.3; add('totem', null, w.x + Math.cos(a) * 3.2, w.y + Math.sin(a) * 3.2, 1.15, a + Math.PI); }
        }
        for (const c of w.caches) if (c.x >= x0 && c.x < x1 && c.y >= y0 && c.y < y1) {
          if (c.kind === 'cage') add('hangcage', null, c.x + 0.75, c.y, 1, 0);
          else if (c.kind === 'camp') { add('tent', { tent: '#3a3026', canvas: '#5a5040' }, c.x, c.y - 0.4, 0.8, 0.4); add('bones', null, c.x + 0.4, c.y + 0.3, 1, 2); }
          else { add('bones', null, c.x, c.y, 1.2, 1); add('totem', null, c.x - 0.6, c.y - 0.4, 0.9, 1); }
        }
      }
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
      // each kind of plant or stone twice over: the full model for the land around
      // you and a plain one for further off, sharing one set of positions
      const hi = [], lo = [];
      let top = groundTop;
      for (const k of Object.keys(sets)) {
        const set = sets[k];
        const baked = ECHO.Models.bake(set.name, set.colors);
        if (!baked) continue;
        const far = ECHO.Models.scenes[set.name + '_lo'] ? ECHO.Models.bake(set.name + '_lo', set.colors) : null;
        for (const part of ['base', 'glow']) {
          const geo = baked[part];
          if (!geo) continue;
          const im = new THREE.InstancedMesh(geo, part === 'glow' ? R.mat.glow : R.mat.prop, set.list.length);
          set.list.forEach((it, i) => {
            q.setFromAxisAngle(up, it[3]);
            sv.setScalar(it[2]);
            const gy = R.groundH(it[0], it[1]);
            if (gy > top) top = gy;
            pv.set(it[0], gy - 0.03, it[1]);
            m4.compose(pv, q, sv);
            im.setMatrixAt(i, m4);
          });
          im.instanceMatrix.needsUpdate = true;
          im.castShadow = part === 'base' && set.name !== 'grass' && set.name !== 'crop' && set.name !== 'reeds';
          im.receiveShadow = true;
          im.frustumCulled = false;
          R.groups.props.add(im); objs.push(im);
          if (far && far[part]) {
            const im2 = new THREE.InstancedMesh(far[part], im.material, set.list.length);
            im2.instanceMatrix = im.instanceMatrix;   // the same positions, uploaded once
            im2.castShadow = im.castShadow; im2.receiveShadow = true; im2.frustumCulled = false; im2.visible = false;
            R.groups.props.add(im2); objs.push(im2);
            hi.push(im); lo.push(im2);
          }
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
      // what the camera needs to see this chunk (trees stand up to a few tiles high,
      // and throw shadows a few tiles across)
      const box = new THREE.Box3(new THREE.Vector3(x0 - 5, -2, y0 - 5), new THREE.Vector3(x1 + 5, top + 6, y1 + 5));
      R.chunks[cx + ',' + cy] = { epoch, objs, hi, lo, box, shown: true, near: true };
    },
    // Each frame: chunks out of the camera's sight are not drawn at all (nor into
    // the shadows), and those further off use the plain far models.
    cullChunks() {
      const cam = R.camera, F = R._frustum || (R._frustum = new THREE.Frustum()), M = R._pv || (R._pv = new THREE.Matrix4());
      M.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      F.setFromProjectionMatrix(M);
      const tx = R.camTarget.x, tz = R.camTarget.z, nearD = 20 + 14 * (R.flyK || 0);
      for (const c of Object.values(R.chunks)) {
        if (!c.box) continue;
        const show = F.intersectsBox(c.box);
        // how far the chunk's nearest edge is from where you stand
        const b = c.box, dx = Math.max(b.min.x + 5 - tx, 0, tx - (b.max.x - 5)), dz = Math.max(b.min.z + 5 - tz, 0, tz - (b.max.z - 5));
        const near = Math.hypot(dx, dz) < nearD;
        if (show === c.shown && near === c.near) continue;
        c.shown = show; c.near = near;
        for (const o of c.objs) o.visible = show;
        if (show) { for (const o of c.hi) o.visible = near; for (const o of c.lo) o.visible = !near; }
      }
    },

    // ---------------------------------------------------------------- towns
    ROOF: { valdren: ['#4a5a78', '#6f8fc4'], ashmere: ['#9a4a35', '#5fae84'], lantern: ['#b08a3a', '#e6c06a'], ashfang: ['#5a3a2a', '#d0563c'] },
    MODEL_OF: { house: 'house', inn: 'inn', market: 'market', smithy: 'smithy', board: 'board', shrine: 'shrine', archive: 'archive', keep: 'keep', temple: 'temple', well: 'well', lamp: 'lamp', statue: 'statue', mill: 'mill', mine: 'mine', lumber: 'lumber', stocks: 'stocks' },
    updateTowns(game) {
      const world = game.world;
      // one town built per frame at most (each is a few hundred meshes), and a town
      // you have just passed is kept a while in case you turn round
      let builtOne = false;
      const sp = R.camSpeed || 0, ahead = Math.min(30, sp * 1.2);
      const vx = R._camV ? R._camV.x : 0, vz = R._camV ? R._camV.z : 0, vl = Math.hypot(vx, vz) || 1;
      for (const s of world.settlements) {
        const d = U.dist(s.x, s.y, R.camTarget.x, R.camTarget.z);
        const cur0 = R.towns[s.id];
        if (cur0 ? d > 64 : d > 48) {
          // heading this way fast: start on it early
          const da = U.dist(s.x, s.y, R.camTarget.x + vx / vl * ahead, R.camTarget.z + vz / vl * ahead);
          if (cur0 ? d > 64 : da > 48) { if (cur0) { R.groups.towns.remove(cur0.group); delete R.towns[s.id]; } continue; }
        }
        if (cur0 && R.frameNo % 15 !== (s.id.length + s.x | 0) % 15 && cur0.key) continue;   // look for changes now and then, not every frame
        const fac = world.factions[s.faction];
        const key = [s.faction, fac ? fac.tech.era : 0, s.buildings.length, s.buildings.filter(b => b.legend).length, s.buildings.filter(b => b.fac).map(b => b.fac.state[0]).join(''), s.works && s.works.walls ? 'W' : ''].join('|');
        const cur = R.towns[s.id];
        if (cur && cur.key === key) continue;
        if (builtOne && !R.firstFrame) continue;
        builtOne = true;
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
          const geo = R._stakeGeo || (R._stakeGeo = new THREE.CylinderGeometry(0.09, 0.13, 1.9, 5).translate(0, 0.95, 0));
          const mat = R._stakeMat || (R._stakeMat = new THREE.MeshStandardMaterial({ color: C('#6a4a2c'), roughness: 0.95, flatShading: true }));
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
        if (!near(s.x, s.y) || s.secret) continue;
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
      crypt: (x, y) => ['#55524c', '#5d5a53', '#4e4b45', '#625e56'][((x * 31 + y * 17) * 2654435761 >>> 0) % 4],
      void: (x, y) => ['#2c2438', '#262032', '#302842', '#241e2e'][((x * 31 + y * 17) * 2654435761 >>> 0) % 4],
      // the worlds beyond the gates
      ember: (x, y) => ECHO.GateWorld.PAL.ember.floor[((x * 37 + y * 11) * 2654435761 >>> 0) % 4],
      abyss: (x, y) => ECHO.GateWorld.PAL.abyss.floor[((x * 37 + y * 11) * 2654435761 >>> 0) % 4],
      thorn: (x, y) => ECHO.GateWorld.PAL.thorn.floor[((x * 37 + y * 11) * 2654435761 >>> 0) % 4]
    },
    WALLS: { plaster: ['#cbb894', '#5a3e26'], stone: ['#7c766c', '#5a554e'], marble: ['#e0d9cc', '#a89e8c'], rock: ['#5a544a', '#3e3a33'], ember: ['#3a2a24', '#ff6a1a'], abyss: ['#2a4448', '#2ad8c8'], thorn: ['#2a1e30', '#9a4aff'], void: ['#1e1826', '#6a3ad0'] },
    // Many boxes as one mesh: a dungeon's walls in a single draw.
    mergeBoxes(boxes, mat) {
      const n = boxes.length, pos = new Float32Array(n * 108), nor = new Float32Array(n * 108);
      const F = [[[1, 0, 0], [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, -1], [1, 1, 1], [1, -1, 1]]], [[-1, 0, 0], [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, 1, -1], [-1, -1, -1]]],
        [[0, 1, 0], [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [-1, 1, -1], [1, 1, 1], [1, 1, -1]]], [[0, -1, 0], [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [-1, -1, 1], [1, -1, -1], [1, -1, 1]]],
        [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, -1, 1], [1, 1, 1], [-1, 1, 1]]], [[0, 0, -1], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1]]]];
      let o = 0;
      for (const b of boxes) for (const [nn, vs] of F) for (const v of vs) { pos[o] = b.x + v[0] * b.w / 2; pos[o + 1] = b.y + v[1] * b.h / 2; pos[o + 2] = b.z + v[2] * b.d / 2; nor[o] = nn[0]; nor[o + 1] = nn[1]; nor[o + 2] = nn[2]; o += 3; }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; m.userData.own = true;
      return m;
    },
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
      const VOID = L.floor === 'void';
      const lord = VOID ? null : L.lordRoom, tre = VOID ? null : L.treasureRoom;
      for (const [x, y] of quads) {
        const inR = r => r && x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1;
        tmp.set(L.fcol ? L.fcol[y * W + x] : inR(lord) ? R.FLOORS[L.floor === 'cave' ? 'stone' : 'marble'](x, y) : inR(tre) ? R.FLOORS.stone(x, y) : R.FLOORS[L.floor](x, y)).convertSRGBToLinear();
        const j = L.fcol ? 0.97 + ((x * 13 + y * 7) % 3) * 0.02 : 0.94 + ((x * 13 + y * 7) % 5) * 0.03;
        const X = B + x;
        for (const [qx, qy] of [[X, y], [X, y + 1], [X + 1, y], [X + 1, y], [X, y + 1], [X + 1, y + 1]]) { pos[o] = qx; pos[o + 1] = 0; pos[o + 2] = qy; col[o] = tmp.r * j; col[o + 1] = tmp.g * j; col[o + 2] = tmp.b * j; o += 3; }
      }
      const fg = new THREE.BufferGeometry();
      fg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); fg.setAttribute('color', new THREE.BufferAttribute(col, 3)); fg.computeVertexNormals();
      const floor = new THREE.Mesh(fg, VOID ? R.voidFloorMat() : R.mat.terrain); floor.receiveShadow = true; floor.userData.own = true; g.add(floor);
      if (VOID) { R.buildVoid(game, L, g, B, solidRock, isOpen); R.buildTraps(L, g, B); return; }
      const [wc, tc] = R.WALLS[L.wall] || R.WALLS.stone;
      const wallMat = new THREE.MeshStandardMaterial({ color: C(wc).multiplyScalar(L.type === 'gate' ? 1.6 : 1.25), roughness: 0.92, flatShading: true });
      const capMat = new THREE.MeshStandardMaterial({ color: C(tc), roughness: 0.9 });
      // walls: rock touching open floor; merged along each row, and all of it one mesh
      const walls = [], caps = [];
      const tall = L.type === 'gate' ? 1.25 : 1.15;
      for (let y = 0; y < H; y++) {
        let run = null;
        const flush = () => { if (!run) return; const w = run.x1 - run.x0 + 1, h = run.h; walls.push({ x: B + run.x0 + w / 2, y: h / 2, z: y + 0.5, w, h, d: 1 }); caps.push({ x: B + run.x0 + w / 2, y: h + 0.04, z: y + 0.5, w, h: 0.08, d: 1.02 }); run = null; };
        for (let x = 0; x < W; x++) {
          let wall = false;
          if (solidRock(x, y)) for (let dy = -1; dy <= 1 && !wall; dy++) for (let dx = -1; dx <= 1; dx++) if (!solidRock(x + dx, y + dy)) { wall = true; break; }
          if (!wall) { flush(); continue; }
          const h = !solidRock(x, y - 1) ? 0.45 : tall + ((x * 7 + y * 3) % 3) * (L.type === 'gate' ? 0.22 : 0.1);
          if (run && run.h === h && run.x1 === x - 1) run.x1 = x; else { flush(); run = { x0: x, x1: x, h }; }
        }
        flush();
      }
      if (walls.length) { g.add(R.mergeBoxes(walls, wallMat)); const cm = R.mergeBoxes(caps, L.type === 'gate' ? new THREE.MeshStandardMaterial({ color: C(wc).multiplyScalar(0.8), emissive: C(tc).multiplyScalar(0.12), roughness: 0.9 }) : capMat); cm.castShadow = false; g.add(cm); }
      // what flows in the worlds beyond the gates: fire, black water, rot — glowing
      if (L.liquid) {
        const lq = [];
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (L.liquid[y * W + x]) lq.push([x, y]);
        if (lq.length) {
          const lp = new Float32Array(lq.length * 18), lc = new Float32Array(lq.length * 18), c1 = C(L.pal.liquid), c2 = C(L.pal.liquid2);
          let k = 0;
          for (const [x, y] of lq) { const t = ((x * 13 + y * 7) % 7) / 7, cc = c1.clone().lerp(c2, t * (L.theme === 'ember' ? 0.6 : 0.25)); for (const [qx, qy] of [[B + x, y], [B + x, y + 1], [B + x + 1, y], [B + x + 1, y], [B + x, y + 1], [B + x + 1, y + 1]]) { lp[k] = qx; lp[k + 1] = 0.02; lp[k + 2] = qy; lc[k] = cc.r; lc[k + 1] = cc.g; lc[k + 2] = cc.b; k += 3; } }
          const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(lp, 3)); lg.setAttribute('color', new THREE.BufferAttribute(lc, 3));
          const lm = new THREE.Mesh(lg, new THREE.MeshBasicMaterial({ vertexColors: true })); lm.userData.own = true; g.add(lm);
          R.roomLiquid = lm;
        } else R.roomLiquid = null;
      } else R.roomLiquid = null;
      // the way out
      const exit = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.2), new THREE.MeshBasicMaterial({ color: '#fff0c0', transparent: true, opacity: 0.3, depthWrite: false }));
      exit.rotation.x = -Math.PI / 2; exit.position.set(L.inside.x, 0.02, L.inside.y + 0.6); exit.userData.own = true; g.add(exit);
      R.roomDoorGlow = exit; R.roomWinMat = null;
      R.buildTraps(L, g, B);
    },
    buildTraps(L, g, B) {
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
    // ------------------------------------------------------------ beyond the Rift
    // The floor is a slab of obsidian flagstones adrift in the void, seamed with
    // violet light that pulses; its edges break off into the abyss, where stars
    // and slow nebulae turn far below and shards of rock drift. Spires of black
    // glass and violet crystal stand along every edge, tears in the air hang at
    // the back of the halls, and motes of light rise through it all.
    voidFloorMat() {
      if (R._vfm) return R._vfm;
      const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.3 });
      m.customProgramCacheKey = () => 'voidfloor';
      m.onBeforeCompile = sh => {
        sh.uniforms.uTime = R.waterTime;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vVW;').replace('#include <project_vertex>', '#include <project_vertex>\nvVW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
          uniform float uTime; varying vec3 vVW;
          float vh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float vn(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f); return mix(mix(vh(i), vh(i + vec2(1, 0)), u.x), mix(vh(i + vec2(0, 1)), vh(i + vec2(1, 1)), u.x), u.y); }
          vec3 vcell(vec2 p) { vec2 i = floor(p), f = fract(p); float d1 = 9.0, d2 = 9.0; vec2 id = vec2(0.0);
            for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) { vec2 g = vec2(float(x), float(y)); vec2 o = vec2(vh(i + g), vh(i + g + 5.3)) * 0.85 + 0.075; float d = length(g + o - f);
              if (d < d1) { d2 = d1; d1 = d; id = i + g; } else if (d < d2) d2 = d; }
            return vec3(d2 - d1, vh(id), vh(id + 1.7)); }`)
          .replace('#include <color_fragment>', `#include <color_fragment>
          vec3 cc = vcell(vVW.xz * 1.35);
          float seam = 1.0 - smoothstep(0.025, 0.075, cc.x);
          diffuseColor.rgb *= (0.78 + cc.y * 0.4) * (1.0 - seam * 0.8) * (0.9 + vn(vVW.xz * 6.0) * 0.2);
          // only here and there does the light of the void show through the seams
          float vein = (1.0 - smoothstep(0.0, 0.035, cc.x)) * smoothstep(0.64, 0.8, vn(vVW.xz * 0.22 + 3.1));
          float crack = (1.0 - smoothstep(0.0, 0.02, abs(vn(vVW.xz * 2.3) - 0.5))) * smoothstep(0.7, 0.86, vn(vVW.xz * 0.4 + 9.0));
          float pulse = 0.55 + 0.45 * sin(uTime * 1.6 + vVW.x * 0.4 + vVW.z * 0.3);
          vec3 vEm = vec3(0.45, 0.22, 1.0) * (vein + crack * 0.7) * pulse * 0.75;
          float vRough = mix(0.22, 1.0, seam) * (0.8 + cc.z * 0.45);`)
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(vRough, 0.05, 1.0);')
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vEm;');
      };
      return (R._vfm = m);
    },
    buildVoid(game, L, g, B, solidRock, isOpen) {
      const W = L.W, H = L.H;
      let s = (ECHO.hashStr(L.id) >>> 0) || 1;
      const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
      const obs = R._voidObs || (R._voidObs = new THREE.MeshStandardMaterial({ color: C('#1c1626'), roughness: 0.2, metalness: 0.4, flatShading: true, emissive: C('#0c0618') }));
      const cry = R._voidCry || (R._voidCry = new THREE.MeshStandardMaterial({ color: C('#4a22a0'), emissive: C('#7a44ff'), emissiveIntensity: 0.85, roughness: 0.12, metalness: 0.1, flatShading: true }));
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
      // spires of black glass along every edge (low ones on the near side, so they never hide you)
      const sp = [], cr = [], rub = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (!solidRock(x, y)) continue;
        let edge = false;
        for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) if (isOpen(x + dx, y + dy)) { edge = true; break; }
        if (!edge) continue;
        const low = !solidRock(x, y - 1);
        const n = low ? 1 : 2 + (rnd() < 0.35 ? 1 : 0);
        for (let i = 0; i < n; i++) {
          const h = low ? 0.3 + rnd() * 0.35 : 0.9 + rnd() * 1.9, r = (low ? 0.16 : 0.2) + rnd() * 0.18;
          (rnd() < 0.13 && !low ? cr : sp).push([B + x + 0.15 + rnd() * 0.7, y + 0.15 + rnd() * 0.7, h, r, (rnd() - 0.5) * 0.4, rnd() * 6.28, (rnd() - 0.5) * 0.4]);
        }
        rub.push([B + x + 0.5 + (rnd() - 0.5) * 0.4, y + 0.5 + (rnd() - 0.5) * 0.4, 0.28 + rnd() * 0.2]);
      }
      const cone = R._voidCone || (R._voidCone = new THREE.ConeGeometry(1, 1, 5, 1).translate(0, 0.5, 0));
      const inst = (geo, mat, list, fn) => {
        if (!list.length) return null;
        const im = new THREE.InstancedMesh(geo, mat, list.length);
        list.forEach((a, i) => { fn(a); im.setMatrixAt(i, m4.compose(v3, q, s3)); });
        im.castShadow = true; im.receiveShadow = true; im.userData.own = false; g.add(im);
        return im;
      };
      const sx = a => { v3.set(a[0], -0.35, a[1]); q.setFromEuler(e3.set(a[4], a[5], a[6])); s3.set(a[3], a[2] + 0.35, a[3]); };
      inst(cone, obs, sp, sx); inst(cone, cry, cr, sx);
      const rock = R._voidRock || (R._voidRock = new THREE.DodecahedronGeometry(1, 0));
      inst(rock, obs, rub, a => { v3.set(a[0], -0.05, a[1]); q.setFromEuler(e3.set(a[2] * 5, a[2] * 11, 0)); s3.set(a[2], a[2] * 0.7, a[2]); });
      // the slab's broken edge, dropping away into the abyss
      const cliffs = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (!isOpen(x, y) && L.rock[y * W + x]) continue;
        if (L.rock[y * W + x]) continue;
        const d = 1.2 + ((x * 7 + y * 13) % 5) * 0.25;
        if (solidRock(x, y + 1)) cliffs.push({ x: B + x + 0.5, y: -d / 2, z: y + 1 - 0.05, w: 1.02, h: d, d: 0.1 });
        if (solidRock(x - 1, y)) cliffs.push({ x: B + x + 0.05, y: -d / 2, z: y + 0.5, w: 0.1, h: d, d: 1.02 });
        if (solidRock(x + 1, y)) cliffs.push({ x: B + x + 0.95, y: -d / 2, z: y + 0.5, w: 0.1, h: d, d: 1.02 });
      }
      if (cliffs.length) { const cm = R.mergeBoxes(cliffs, obs); cm.castShadow = false; g.add(cm); }
      // the abyss: stars and slow nebulae, far below
      const abyss = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), R.voidSkyMat());
      abyss.rotation.x = -Math.PI / 2; abyss.position.set(B + W / 2, -7, H / 2); abyss.userData.own = true; g.add(abyss);
      // rocks adrift in the void
      const drift = [];
      for (let y = -6; y < H + 6; y++) for (let x = -6; x < W + 6; x++) {
        if (!solidRock(x, y) || rnd() > 0.075) continue;
        let near = false;
        for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (isOpen(x + dx, y + dy)) { near = true; break; }
        if (near) continue;
        drift.push({ x: B + x + rnd(), z: y + rnd(), y: -0.6 - rnd() * 3.5, r: 0.18 + rnd() * 0.45, ph: rnd() * 6.28, sp: 0.2 + rnd() * 0.5, rx: rnd() * 6, ry: rnd() * 6 });
        if (drift.length > 90) break;
      }
      if (drift.length) {
        const im = new THREE.InstancedMesh(rock, obs, drift.length); im.castShadow = false; im.frustumCulled = false; g.add(im);
        R.voidDrift = { im, list: drift };
        R.animateVoid();
      }
      // tears in the air at the back of the halls
      const tearMat = R.voidTearMat();
      for (const r of L.G.rooms) {
        if (r === L.G.entrance || rnd() > 0.6) continue;
        const w = 1 + rnd() * 0.6, h = 1.8 + rnd() * 0.8;
        const t = new THREE.Mesh(R._tearGeo || (R._tearGeo = new THREE.PlaneGeometry(1, 1)), tearMat);
        t.scale.set(w, h, 1); t.position.set(B + r.x0 + 1.5 + rnd() * Math.max(0.5, r.x1 - r.x0 - 3), 0.35 + h / 2, r.y0 + 0.15); t.renderOrder = 8; g.add(t);
        L.lights.push({ x: t.position.x, y: r.y0 + 0.8, r: 4.5, a: 0.9, color: '#9a6aff', h: 1.4 });
      }
      // motes of light rising through the halls
      const open = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (isOpen(x, y)) open.push([x, y]);
      const N = Math.min(320, Math.round(open.length * 0.8)), mp = new Float32Array(N * 3), ms = new Float32Array(N);
      for (let i = 0; i < N; i++) { const o = open[Math.floor(rnd() * open.length)]; mp[i * 3] = B + o[0] + rnd(); mp[i * 3 + 1] = rnd() * 2.6; mp[i * 3 + 2] = o[1] + rnd(); ms[i] = rnd(); }
      const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(mp, 3)); mg.setAttribute('aSeed', new THREE.BufferAttribute(ms, 1));
      const motes = new THREE.Points(mg, R.voidMoteMat()); motes.frustumCulled = false; motes.userData.own = true; motes.renderOrder = 7; g.add(motes);
      // the way out
      const exit = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.2), new THREE.MeshBasicMaterial({ color: '#d8c8ff', transparent: true, opacity: 0.3, depthWrite: false }));
      exit.rotation.x = -Math.PI / 2; exit.position.set(L.inside.x, 0.02, L.inside.y + 0.6); exit.userData.own = true; g.add(exit);
      R.roomDoorGlow = exit; R.roomWinMat = null; R.roomLiquid = null;
    },
    animateVoid() {
      const D = R.voidDrift;
      if (!D) return;
      const m4 = R._vm4 || (R._vm4 = new THREE.Matrix4()), q = R._vq || (R._vq = new THREE.Quaternion()), e3 = R._ve || (R._ve = new THREE.Euler()), v3 = R._vv || (R._vv = new THREE.Vector3()), s3 = R._vs || (R._vs = new THREE.Vector3());
      const t = R.time;
      D.list.forEach((d, i) => {
        v3.set(d.x, d.y + Math.sin(t * d.sp + d.ph) * 0.35, d.z);
        q.setFromEuler(e3.set(d.rx + t * d.sp * 0.3, d.ry + t * d.sp * 0.2, 0));
        s3.set(d.r, d.r * 0.75, d.r);
        D.im.setMatrixAt(i, m4.compose(v3, q, s3));
      });
      D.im.instanceMatrix.needsUpdate = true;
    },
    voidSkyMat() {
      return R._vsky || (R._vsky = new THREE.ShaderMaterial({
        uniforms: { uTime: R.waterTime },
        vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: `uniform float uTime; varying vec3 vW;
          float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float n(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), u.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), u.x), u.y); }
          float fb(vec2 p){ return n(p) * 0.5 + n(p * 2.03) * 0.3 + n(p * 4.1) * 0.2; }
          void main(){
            vec2 p = vW.xz * 0.06;
            float a = fb(p + vec2(uTime * 0.006, 0.0)), b = fb(p * 1.7 - vec2(0.0, uTime * 0.008) + 4.0);
            vec3 c = vec3(0.012, 0.006, 0.03);
            c = mix(c, vec3(0.2, 0.07, 0.4), smoothstep(0.42, 0.9, a));
            c += vec3(0.04, 0.12, 0.28) * smoothstep(0.6, 0.95, b);
            vec2 sp = vW.xz * 1.4, id = floor(sp); float hh = h(id);
            vec2 o = fract(sp) - 0.5 - (vec2(h(id + 3.1), h(id + 7.7)) - 0.5) * 0.6;
            c += vec3(0.9, 0.85, 1.0) * smoothstep(0.07, 0.0, length(o)) * step(0.94, hh) * (0.55 + 0.45 * sin(uTime * 2.0 + hh * 40.0));
            gl_FragColor = vec4(c, 1.0);
          }`,
        depthWrite: true
      }));
    },
    voidTearMat() {
      return R._vtear || (R._vtear = new THREE.ShaderMaterial({
        uniforms: { uTime: R.waterTime },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform float uTime; varying vec2 vUv;
          float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float n(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), u.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), u.x), u.y); }
          void main(){
            vec2 c = vUv * 2.0 - 1.0; c.x *= 1.6;
            float r = length(c), a = atan(c.y, c.x);
            float sw = n(vec2(a * 2.0 + uTime * 0.8, r * 4.0 - uTime * 1.4)) * 0.6 + n(vec2(a * 5.0 - uTime, r * 9.0)) * 0.4;
            float ring = smoothstep(0.22, 0.0, abs(r - 0.68 + sw * 0.18));
            float core = smoothstep(0.62, 0.0, r);
            float halo = smoothstep(1.0, 0.55, r) * sw;
            vec3 col = vec3(0.62, 0.36, 1.0) * ring * 2.0 + vec3(0.9, 0.86, 1.0) * core * (0.25 + sw * 0.4) + vec3(0.32, 0.1, 0.7) * halo;
            float al = clamp(ring + core * 0.6 + halo * 0.4, 0.0, 1.0);
            gl_FragColor = vec4(col * al, al);
          }`,
        transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
      }));
    },
    voidMoteMat() {
      return R._vmote || (R._vmote = new THREE.ShaderMaterial({
        uniforms: { uTime: R.waterTime },
        vertexShader: `uniform float uTime; attribute float aSeed; varying float vA;
          void main(){
            vec3 p = position;
            p.y = mod(p.y + uTime * (0.12 + aSeed * 0.22), 2.8);
            p.x += sin(uTime * 0.5 + aSeed * 20.0) * 0.18; p.z += cos(uTime * 0.4 + aSeed * 31.0) * 0.18;
            vA = smoothstep(0.0, 0.4, p.y) * smoothstep(2.8, 2.0, p.y) * (0.5 + 0.5 * sin(uTime * 3.0 + aSeed * 50.0));
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = (1.2 + aSeed * 1.6) * (34.0 / -mv.z);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: 'varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); float a = smoothstep(0.5, 0.0, d) * vA; gl_FragColor = vec4(vec3(0.75, 0.55, 1.0) * a * 0.9, a); }',
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
      }));
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
      R.roomWindows = []; R.voidDrift = null;
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
      // a dark void around the room (beyond the Rift, the abyss is the void)
      if (L.floor !== 'void') {
      const under = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshBasicMaterial({ color: '#050407' }));
      under.rotation.x = -Math.PI / 2; under.position.set(B + L.W / 2, -0.02, L.H / 2); under.userData.own = true; g.add(under);
      }
    },
    setInteriorMode(on) {
      if (R.indoors === on) return;
      R.indoors = on;
      R.camSpeed = 0; R._camV = null; R._chunkLast = null;
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
      if (L.type === 'gate') {
        // another sky: dim, tinted, and close
        const P = L.pal;
        R.hemi.intensity = 0.55; R.hemi.color.set(P.hemi).convertSRGBToLinear(); R.hemi.groundColor.set(P.ground).convertSRGBToLinear();
        R.sun.intensity = 0.35; R.sun.color.set(P.hemi).convertSRGBToLinear();
        R.sun.position.set(game.pe.x - 6, 16, game.pe.y - 8); R.sun.target.position.set(game.pe.x, 0, game.pe.y);
        R.scene.background = R._gateBg || (R._gateBg = new THREE.Color()); R.scene.background.set(P.fog);
        R.scene.fog.color.set(P.fog); R.scene.fog.near = 26; R.scene.fog.far = 62;
        if (R.roomLiquid) { const k = 0.85 + Math.sin(R.time * 2) * 0.15; R.roomLiquid.material.color.setScalar(k); }
      }
      if (L.floor === 'void') {
        // beyond the Rift: a dim violet light from nowhere, and the dark of the abyss
        R.hemi.intensity = 0.42; R.hemi.color.set('#7a68c8').convertSRGBToLinear(); R.hemi.groundColor.set('#160a24').convertSRGBToLinear();
        R.sun.intensity = 0.22; R.sun.color.set('#a090ff').convertSRGBToLinear();
        R.scene.background = R._voidBg || (R._voidBg = new THREE.Color('#06030c'));
        R.scene.fog.color.set('#0a0614'); R.scene.fog.near = 24; R.scene.fog.far = 64;
      }
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
      // a crowd coming into sight at a gallop is dressed over a few frames, not all
      // in one (each figure is a few dozen parts); they fade in anyway
      const B = R._viewBudget;
      if (B && e !== game.pe && !(e.type === 'boss') && (R.frameNo || 0) > 5) {
        if (B.n > 0 && performance.now() - B.t0 > 2.5) return null;
        B.n++;
      }
      const inst = R.instFor(e), kind = e.type;
      if (!inst) return null;
      v = { inst, kind, cfgT: 0, dir: e.dir || 0, bob: Math.random() * 6, own: !!(e.humanoid && R.MON_MODEL[e.species] && inst.root && ECHO.Models.scenes[R.MON_MODEL[e.species]]), float: e.species === 'wraith' || e.species === 'bride' };
      return R.viewRest(game, e, v);
    },
    // the model a thing is drawn with
    instFor(e) {
      let inst = null;
      if (e.shape === 'spider' || e.shape === 'slime' || e.shape === 'serpent' || e.shape === 'horror') inst = R.procMonster(e);
      else if (e.shape === 'rat') inst = ECHO.Models.instance('gnawer');
      else if (e.shape === 'hound') inst = ECHO.Models.instance(e.foe && e.foe.model && ECHO.Models.scenes[e.foe.model] ? e.foe.model : 'wolf');
      else if (e.shape === 'drake') inst = ECHO.Models.instance('drake');
      else if (e.shape === 'stag') inst = ECHO.Models.instance('stag');
      else if (e.humanoid && e.foe && e.foe.vis && R.MON_MODEL[e.species] && ECHO.Models.scenes[R.MON_MODEL[e.species]]) inst = ECHO.Models.instance(R.MON_MODEL[e.species]);
      else if (e.type === 'player' || e.type === 'person' || e.type === 'ghost' || e.humanoid) inst = ECHO.Models.instance('person');
      else if (e.type === 'creature') inst = ECHO.Models.instance(e.species === 'hind' || e.species === 'deer' ? 'stag' : e.species === 'dog' || e.species === 'fox' ? 'wolf' : e.species);
      else if (e.type === 'boss') inst = ECHO.Models.instance(e.boss.kind);
      return inst;
    },
    viewRest(game, e, v) {
      const inst = v.inst;
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
    // monsters with a shape of their own (on a person's rig)
    MON_MODEL: { skeleton: 'm_skeleton', skelarcher: 'm_skeleton', wraith: 'm_wraith', cultist: 'm_cultist', necromancer: 'm_cultist', golemling: 'm_golem', golem: 'm_golem', hollowking: 'm_hollowking', wendigo: 'm_wendigo', barkhulk: 'm_treant', bride: 'm_lady', erlking: 'm_erlking' },
    PROF: null,
    PROF_COL: {
      farmer: ['#7a8a4a', '#5a4a30'], hunter: ['#5a6a3a', '#4a3a2a'], miner: ['#6a6058', '#3a3430'], woodcutter: ['#8a4a3a', '#4a3a2a'],
      smith: ['#4a4a4a', '#6a4a2a'], herbalist: ['#5a8a6a', '#4a3a2a'], merchant: ['#7a4a8a', '#3a2a4a'], innkeeper: ['#9a7a5a', '#5a4030'],
      priest: ['#e8dcc0', '#c8a85a'], scholar: ['#4a5a8a', '#2a3050'], ruler: ['#8a2a3a', '#d8b84a'], reeve: ['#6a5a3a', '#3a3020'],
      child: ['#b8885a', '#5a4a3a'], elder: ['#8a8070', '#5a5040'], bandit: ['#5a2a24', '#2a1a18'], wanderer: ['#5a5a6a', '#3a3a3a'], inventor: ['#8a6a3a', '#4a4a5a'], guard: ['#6f8fc4', '#3a3a3a']
    },
    configure(game, e, v) {
      const M = ECHO.Models, inst = v.inst, world = game.world;
      if (e.shape) {
        const Fd = e.foe || {}, em = e.rage ? '#ff3a0a' : Fd.em || null;
        const glow = () => { for (const m of inst.mats) if (m.emissive) m.emissive.set(em || '#000000').multiplyScalar(e.rage ? 0.8 : 0.45); };
        if (e.shape === 'rat') { M.recolor(inst, 'rat', e.elite ? '#4a2a2a' : '#5a4a42'); inst.root.scale.setScalar(1.15 * (e.scale || 1)); }
        else if (e.shape === 'hound') { M.recolor(inst, 'fur', Fd.col || '#2a2a2a'); M.recolor(inst, 'eyeglow', Fd.em || '#ff3a2a'); M.show(inst, 'horn', !!e.elite); glow(); inst.root.scale.setScalar(1.05 * (e.scale || 1)); }
        else if (e.shape === 'drake') { for (const k of ['armorMelee', 'armorFire', 'armorRanged']) M.show(inst, k, false); M.recolor(inst, 'drake', Fd.col || '#5a1a0a'); M.recolor(inst, 'drakebelly', Fd.belly || '#ff8a3a'); glow(); inst.root.scale.setScalar(e.scale || 1); }
        else if (e.shape === 'stag') { M.recolor(inst, 'stag', Fd.col || '#1a1420'); M.recolor(inst, 'cloth2', '#0e0a12'); M.recolor(inst, 'darkwood', Fd.em || '#c86aff'); M.recolor(inst, 'white', '#2a2030'); M.recolor(inst, 'eyeglow', Fd.em || '#c86aff'); for (const k of ['armorMelee', 'armorFire', 'armorRanged']) M.show(inst, k, false); M.show(inst, 'antlers', true); glow(); inst.root.scale.setScalar(0.52 * (e.scale || 1)); }
        else { inst.root.scale.setScalar(e.scale || 1); if (inst.mats && Fd.em) for (const m of inst.mats) if (m.emissive && !(m.userData && m.userData.keep)) m.emissive.set(e.rage ? '#ff3a0a' : Fd.em).multiplyScalar(e.rage ? 0.5 : 0.18); }
        return;
      }
      // monsters in a person's shape (goblins, ghouls, outlaws, the barrow dead): what
      // they are made of drawn on them too, not flat colour
      if (e.humanoid && !v.surfOn) { v.surfOn = true; for (const m of inst.mats) if (m.isMeshStandardMaterial && R.SURF[m.name]) R.surface(m, R.SURF[m.name]); }
      if (e.humanoid && e.foe && e.foe.vis) {
        const V = e.foe.vis;
        M.recolor(inst, 'cloth', V.cloth); M.recolor(inst, 'cloth2', V.cloth2); M.recolor(inst, 'skin', V.skin); M.recolor(inst, 'hair', V.hair);
        M.recolor(inst, 'metal', V.metal || '#8a8a90'); M.recolor(inst, 'cape', V.cloth2);
        for (const k of ['robe', 'apron', 'cape', 'helm', 'bandana', 'hood', 'hairLong', 'beard', 'crown', 'shield', 'bow', 'spear', 'torch', 'staff', 'sword', 'hair']) M.show(inst, k, false);
        for (const k of V.show || []) M.show(inst, k, true);
        for (const m of inst.mats) {
          if (m.userData && m.userData.keep) continue;   // (its own glow: ghost-stuff, crystal)
          if (m.emissive) { if (v.own && !e.rage && !e.elite) m.emissive.copy(C(V.em || '#000000')).multiplyScalar(0.35); else m.emissive.set(e.rage ? '#6a0c04' : e.elite ? '#3a0a08' : V.em || '#000000'); }
          if (V.opacity) { m.transparent = true; m.opacity = v.own ? Math.max(0.86, V.opacity) : V.opacity; }
        }
        if (v.own && e.species === 'necromancer') { M.recolor(inst, 'cloth', '#1e2a24'); M.recolor(inst, 'cloth2', '#0e1410'); M.recolor(inst, 'skin', '#b8c8b0'); }
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
        if (e.elk) { M.recolor(inst, 'stag', '#7a7872'); M.recolor(inst, 'cloth2', '#5e5c58'); M.recolor(inst, 'darkwood', '#c8c0b0'); }
        inst.root.scale.setScalar((e.stag ? 0.52 : 0.44) * (e.scale || 1));
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
        const tint = e.rare === 'golden' ? '#e8c040' : e.winter ? '#eef2f8' : e.mutation === 'mirrorback' ? '#b8c4d4' : e.mutation === 'emberfur' ? '#a8502a' : e.strain === 'Ashen' ? '#8e8e8a' : e.strain === 'Ironhide' ? '#5a4632' : null;
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
        if (e.titan) {
          for (const k of ['armorMelee', 'armorFire', 'armorRanged']) M.show(inst, k, false);
          const kd = e.boss.kind;
          if (e.boss.color) M.recolor(inst, kd, e.boss.color);
          if (e.boss.belly) M.recolor(inst, kd === 'stag' ? 'antler' : kd + 'belly', e.boss.belly);
          const el = ECHO.Apex && ECHO.Apex.ELEM[e.elem];
          if (el) M.recolor(inst, 'eyeglow', el.col);
          inst.root.scale.setScalar(1.05 * (e.tscale || 1) * (kd === 'drake' ? 1.4 : 1.1));
        }
        return;
      }
      // People
      const npc = e.npcId ? world.npcs[e.npcId] : null;
      const look = e.look || {};
      const prof = npc ? npc.prof : 'player';
      const S = R.PROF_COL;
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
      M.show(inst, 'cape', e.type === 'player' || (npc && (npc.rank >= 2 || npc.ng || npc.ngAux)) || prof === 'wanderer');
      if (npc && npc.rank >= 2) M.recolor(inst, 'cape', cols[1]);
      if (npc && (npc.ng || npc.ngAux)) M.recolor(inst, 'cape', npc.ng ? ((ECHO.Gates.def(npc) || {}).cape || '#24386e') : '#24386e');   // (the Guard's blue; each warden their own)
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
      if (e.gearLook && (e.type === 'player' || e.type === 'person')) R.dressPlayer(inst, e.gearLook);
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
    // On a dragon's back: the dragon banks, pitches and crouches as the flight
    // says, and you sit astride its back and lean with it; a soft shadow on the
    // ground below shows how high you are.
    syncDragonFlight(game, dt) {
      const pl = game.pl, F = ECHO.Apex && ECHO.Apex.fly, pe = game.pe;
      // your beast on the wing by itself banks into its turns too
      for (const [e, v] of R.views) {
        if (!e.tamed || !e.titan || e.dead || (pl && pl.flying === e.titan) || !e.pt) continue;
        const air = Math.min(1, Math.max(0, (e.alt || 0) - 0.8) / 2);
        const want = U.clamp(-(e.pt.yaw || 0) * 0.45, -0.55, 0.55) * air;
        v.bank = (v.bank || 0) + (want - (v.bank || 0)) * Math.min(1, dt * 3);
        if (Math.abs(v.bank) < 0.005) continue;
        const root = v.inst.root;
        root.rotation.order = 'YZX'; root.rotation.x = v.bank;
      }
      const blob = R.flyShadow;
      if (!pl || !pl.flying || !F || ECHO.Interior.cur) { if (blob) blob.visible = false; return; }
      let dv = null, dEnt = null;
      for (const [e, v] of R.views) if (e.tamed && e.titan === pl.flying && !e.dead) { dv = v; dEnt = e; break; }
      const pv = R.views.get(pe);
      if (!dv) return;
      const root = dv.inst.root;
      // turn, bank and pitch about the middle of its body, not its feet
      root.rotation.order = 'YZX';
      root.rotation.x = F.bank; root.rotation.z = F.pitch;
      const s = root.scale.x, mid = R._fv1 || (R._fv1 = new THREE.Vector3()), q = root.quaternion;
      root.updateMatrix();
      mid.set(0, 1.1 * s, 0).applyQuaternion(q);
      root.position.set(dv.px != null ? dv.px : dEnt.x, F.z - F.crouch * 0.35 * s, dv.py != null ? dv.py : dEnt.y);
      root.position.x += 0 - mid.x; root.position.y += 1.1 * s - mid.y; root.position.z += 0 - mid.z;
      root.updateMatrixWorld(true);
      // the rider, astride the back
      if (pv) {
        const r = pv.inst.root, seat = R._fv2 || (R._fv2 = new THREE.Vector3()), up = R._fv3 || (R._fv3 = new THREE.Vector3());
        seat.set(-0.12, 1.66, 0); root.localToWorld(seat);
        up.set(0, 1, 0).applyQuaternion(q);
        r.position.copy(seat).addScaledVector(up, -0.4);
        r.quaternion.copy(q);
        r.updateMatrixWorld(true);
      }
      // the shadow below
      if (!blob) {
        R.flyShadow = new THREE.Mesh(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.3, depthWrite: false }));
        R.flyShadow.renderOrder = 2; R.scene.add(R.flyShadow);
      }
      const b = R.flyShadow, alt = Math.max(0, F.z - R.groundH(pe.x, pe.y));
      b.visible = alt > 0.6;
      b.position.set(pe.x, R.groundH(pe.x, pe.y) + 0.08, pe.y);
      b.rotation.y = -F.dir;
      const sz = s * (1.3 + alt * 0.04);
      b.scale.set(sz * 1.6, 1, sz * 1.1);
      b.material.opacity = 0.32 * Math.max(0.15, 1 - alt / 28);
    },
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
        const helmOn = A.helm || !!(G.npc && P.helm && P.helm.visible);
        M.show(inst, 'helm', helmOn); M.show(inst, 'hair', !helmOn); M.recolor(inst, 'helmmetal', '#' + new THREE.Color(A.metal).lerp(new THREE.Color('#6a6a72'), 0.55).getHexString()); M.recolor(inst, 'plate', A.gold ? '#d8b04a' : A.metal);
        glowSet('plate', A.glowCol, A.glow * 0.6); glowSet('helmmetal', A.glowCol, A.glow * 0.4);
      } else if (!G.npc) { M.show(inst, 'helm', false); }
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
      // on a dragon's back: astride, low over its neck at speed, hands on its spines
      if (e === game.pe && game.pl && game.pl.flying && !e.dead && ECHO.Apex && ECHO.Apex.fly) {
        const Fl = ECHO.Apex.fly, lean = 0.12 + Math.min(0.45, Fl.v * 0.016) + Math.max(0, -Fl.pitch) * 0.3;
        P.legL.rotation.z = P.legR.rotation.z = -0.95; P.legL.rotation.x = -0.75; P.legR.rotation.x = 0.75;
        P.body.rotation.z = lean; P.body.position.y = 0.42 + Math.sin(R.time * (2.6 + 3.2 * Fl.flap) * 6.283) * 0.02 * Fl.flap;
        P.body.rotation.x = -Fl.bank * 0.25;
        const busy = (e.attackT > 0) || ECHO.PlayerCtl.drawing;
        P.armL.rotation.z = -1.0 - lean * 0.5; P.armL.rotation.x = 0.3;
        if (!busy) { P.armR.rotation.z = -1.0 - lean * 0.5; P.armR.rotation.x = -0.3; }
        P.head.rotation.z = -lean * 0.7;
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
      else if (v.float && !e.dead) v.yOff = 0.14 + Math.sin(R.time * 2.1 + (e.id || 0)) * 0.06;   // (a wraith drifts above the floor)
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
      if (P.legFL) { const tuck = (e.alt || 0) > 0.6 ? 0.9 : 0; P.legFL.rotation.z = sw + tuck; P.legBR.rotation.z = sw + tuck; P.legFR.rotation.z = -sw + tuck; P.legBL.rotation.z = -sw + tuck; }
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
      const Fd = e.foe || {};
      if (e.shape === 'serpent' || e.shape === 'horror') {
        const bodyM = mat(Fd.col || '#10202a'); bodyM.emissive = new THREE.Color(Fd.em || '#2ad8c8').multiplyScalar(0.18);
        const glowM = new THREE.MeshBasicMaterial({ color: Fd.em || '#2ad8c8' });
        if (e.shape === 'serpent') {
          parts.segs = [];
          for (let i = 0; i < 9; i++) { const r = 0.2 - i * 0.015; const s = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), bodyM); s.position.set(-0.3 + i * 0.22, r + 0.02, 0); s.userData.r = r; root.add(s); parts.segs.push(s); }
          for (const z of [-0.08, 0.08]) { const ey = new THREE.Mesh(new THREE.SphereGeometry(0.035, 5, 4), glowM); ey.position.set(-0.46, 0.27, z); root.add(ey); }
          for (let i = 1; i < 8; i += 2) { const fin = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 4), glowM); fin.position.set(-0.3 + i * 0.22, 0.38 - i * 0.012, 0); root.add(fin); }
        } else {
          // a hanging bulk of a body, a lure, and arms
          const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 9), bodyM); body.position.y = 0.72; body.scale.set(1, 0.85, 1); root.add(body); parts.body = body;
          const eye = new THREE.Mesh(new THREE.SphereGeometry(0.14, 9, 7), glowM); eye.position.set(-0.36, 0.78, 0); root.add(eye);
          const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.6, 4), bodyM); stalk.position.set(-0.3, 1.2, 0); stalk.rotation.z = 0.6; root.add(stalk);
          const lure = new THREE.Mesh(new THREE.SphereGeometry(0.08, 7, 5), glowM); lure.position.set(-0.52, 1.42, 0); root.add(lure); parts.lure = lure;
          parts.arms = [];
          for (let i = 0; i < 6; i++) {
            const a = i / 6 * Math.PI * 2, pv = new THREE.Group(); pv.position.set(Math.cos(a) * 0.25, 0.5, Math.sin(a) * 0.25); pv.rotation.y = -a; root.add(pv);
            const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.02, 0.62, 5), bodyM); arm.position.set(0.18, -0.24, 0); arm.rotation.z = 0.6; pv.add(arm); parts.arms.push(pv);
          }
        }
        root.traverse(o => { if (o.isMesh) o.castShadow = true; });
        return { root, mats, parts };
      }
      if (e.shape === 'spider') {
        const queen = e.species === 'queen';
        const bodyM = mat(Fd.col || (queen ? '#3a1a2a' : e.elite ? '#3a2a1a' : '#2a2228')), eyeM = new THREE.MeshBasicMaterial({ color: Fd.em || '#ff3a2a' });
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
        const col = Fd.col || (e.species === 'slimeling' ? '#9fe8a0' : e.elite ? '#e8c84a' : '#6fd08a');
        const skin = mat(col, 0.72); skin.emissive = new THREE.Color(Fd.em || '#0e3a1a'); if (Fd.em) skin.emissive.multiplyScalar(0.25);
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
      if (P.segs) { P.segs.forEach((s, i) => { s.position.z = Math.sin(R.time * (mv > 0.5 ? 9 : 2.5) - i * 0.7) * (mv > 0.5 ? 0.16 : 0.06); s.position.y = s.userData.r + 0.02 + (e.state === 'windup' || e.state === 'cast' ? Math.max(0, 0.3 - i * 0.05) : 0); }); v.yOff = 0; }
      if (P.arms) { P.arms.forEach((a, i) => { a.rotation.z = Math.sin(R.time * 3 + i * 1.1) * 0.25 + (e.state === 'windup' ? -0.4 : 0); }); if (P.body) P.body.position.y = 0.72 + Math.sin(R.time * 2 + v.bob) * 0.05; if (P.lure) P.lure.scale.setScalar(1 + Math.sin(R.time * 5) * 0.2); v.yOff = 0.05; }
    },
    animateBoss(game, e, v) {
      const P = v.inst.parts;
      const moving = e.moving;
      // the stride follows how fast it is really going: a slow amble, a trot, a
      // long run — not one fixed shuffle
      const spd = v.spd || 0, big = Math.sqrt(v.inst.root.scale.x || 1);
      v.lph = (v.lph || 0) + (R._dt || 0.016) * (1.2 + spd * 1.5) / big;
      const amp = Math.min(1, spd / 3.5) * 0.5;
      const sw = Math.sin(v.lph * 2) * amp;
      if (P.legFL) { P.legFL.rotation.z = sw; P.legBR.rotation.z = sw; P.legFR.rotation.z = -sw; P.legBL.rotation.z = -sw; }
      if (P.body) { if (v.bodyY0 == null) v.bodyY0 = P.body.position.y; P.body.position.y = v.bodyY0 + Math.abs(Math.cos(v.lph * 2)) * 0.05 * amp + Math.sin(R.time * 1.3 + (v.bob || 0)) * 0.012; }
      const open = (e.state === 'windup' || e.state === 'feint') ? Math.min(1, e.t * 2.5) : e.state === 'strike' ? 1 : e.state === 'roar' ? 1 : 0;
      v.tell = e.state === 'windup' ? 1 : 0;
      if (P.jaw) P.jaw.rotation.z = -0.6 * open;
      if (P.head) P.head.rotation.z = e.state === 'roar' ? -0.4 : e.state === 'windup' ? -0.2 : 0;
      const Fl = e.tamed && game.pl && game.pl.flying === e.titan && ECHO.Apex ? ECHO.Apex.fly : null;
      if (P.wingL && Fl) {
        // carrying you: deep beats when it works (climbing, speeding up, taking
        // off), a held glide with the wingtips raised when it cruises
        v.wph = (v.wph || 0) + (2.6 + 3.2 * Fl.flap) * 2 * Math.PI * (R._dt || 0.016);
        const amp = 0.12 + 0.8 * Fl.flap, f = Math.sin(v.wph) * amp + 0.12 * (1 - Fl.flap);
        v.wPh = v.wph; v.wAmp = amp; v.wSign = -1;
        v.fold = v.fold == null ? 0 : v.fold + ((Fl.phase === 'takeoff' && Fl.crouch > 0.5 ? 0.6 : 0) - v.fold) * 0.1;
        P.wingL.rotation.y = 0.95 * v.fold; P.wingR.rotation.y = -0.95 * v.fold;
        P.wingL.rotation.x = -f - 0.3 * v.fold; P.wingR.rotation.x = f + 0.3 * v.fold;
        if (P.legFL) { const tuck = 0.9 * Math.min(1, (e.alt || 0) / 1.5); P.legFL.rotation.z = P.legFR.rotation.z = P.legBL.rotation.z = P.legBR.rotation.z = tuck; }
        if (P.tail) P.tail.rotation.y = Math.sin(R.time * 1.6) * 0.12 - Fl.bank * 0.5;
        if (P.head) P.head.rotation.z = -Fl.pitch * 0.4;
      } else if (P.wingL) {
        const fq = (e.alt || 0) > 0.3 ? (e.moving ? 6 : 4.5) : e.state === 'roar' ? 14 : 2, fa = (e.alt || 0) > 0.3 ? 0.75 : e.state === 'roar' ? 0.6 : 0.1;
        const f = Math.sin(R.time * fq) * fa;
        v.wPh = R.time * fq; v.wAmp = fa; v.wSign = 1;
        // on the ground the wings fold back along the body and lift clear of it;
        // in the air (or roaring) they open wide
        const want = (e.alt || 0) > 0.6 || e.state === 'roar' ? 0 : 1;
        v.fold = v.fold == null ? want : v.fold + (want - v.fold) * 0.08;
        P.wingL.rotation.y = 0.95 * v.fold; P.wingR.rotation.y = -0.95 * v.fold;
        P.wingL.rotation.x = f - 0.3 * v.fold; P.wingR.rotation.x = -f + 0.3 * v.fold;
      }
      if (P.seg0) for (let i = 0; i < 8; i++) { const s = P['seg' + i]; if (!s) continue; s.position.z = Math.sin(R.time * (moving ? 7 : 2) - i * 0.8) * (moving ? 0.35 : 0.12); }
      if (P.tail && !Fl) P.tail.rotation.y = Math.sin(R.time * 2) * 0.25;
      v.yOff = 0;
      if (e.pt && !Fl) R.animatePartner(game, e, v, e.pt);
      if (P.tail1) R.animateDragon(game, e, v, Fl);
      if (e.state === 'charge' && e.chargePhase === 'go') v.inst.root.rotation.z = 0.12; else if (e.state === 'subdued') { v.inst.root.rotation.z = 0.5; v.yOff = 0.2; } else v.inst.root.rotation.z = 0;
    },
    // A dragon with a skeleton moves through its whole body: the spine bends into
    // its turns, the tail sways and trails (each bone a beat behind the one before),
    // the neck carries the head in an easy curve and bobs with the stride, the legs
    // bend at knee and ankle as they step, and the wings fold at elbow and wrist on
    // the ground and beat as a wave from shoulder to fingertip in the air.
    animateDragon(game, e, v, Fl) {
      if (Fl && v.pw) for (const k in v.pw) v.pw[k] = 0;   // (on the wing nothing of resting or sniffing lingers)
      const P = v.inst.parts, dt = R._dt || 0.016, T = R.time, pw = v.pw || {}, rest = pw.rest || 0;
      if (Fl) R.flightLook(e, v, Fl, dt);
      const spd = v.spd || 0, air = (e.alt || 0) > 0.6 || !!Fl, amp = Math.min(1, spd / 3.5);
      // how hard it is turning (from what we draw), eased; the tail answers later than the neck
      const yr = v.prevDir == null ? 0 : U.angleDiff(v.prevDir, v.dir || 0) / Math.max(dt, 1e-3);
      v.prevDir = v.dir || 0;
      const turn = U.clamp(yr * (air ? 0.18 : 0.3), -0.5, 0.5) + (Fl ? -Fl.bank * 0.5 : 0);
      v.flexN = (v.flexN || 0) + (turn - (v.flexN || 0)) * Math.min(1, dt * 5);
      v.flexT = (v.flexT || 0) + (turn - (v.flexT || 0)) * Math.min(1, dt * 2);
      const ph = (v.lph || 0) * 2;
      // ---- spine
      if (P.hips) { P.hips.rotation.y = v.flexT * 0.25; P.hips.rotation.z = Math.sin(ph) * 0.03 * amp; }
      // ---- tail: a travelling wave, larger toward the tip; curled round when it lies down;
      // streaming straight behind it in the air
      const tw = air ? 1.6 : 1.2 + spd * 0.8, ta = air ? 0.035 : 0.05 + amp * 0.06;
      const lift = e.state === 'roar' || e.state === 'windup' || e.state === 'fight' ? 0.06 : 0;
      for (let k = 0; k < 6; k++) {
        const b = P[k ? 'tail' + k : 'tail'];
        if (!b) continue;
        const a = ta * (0.6 + k * 0.45);
        b.rotation.y = Math.sin(T * tw - k * 0.75) * a + v.flexT * (0.12 + k * 0.03) + rest * 0.3;
        b.rotation.z = (k === 0 ? lift + 0.03 : -lift * 0.4 - 0.01) + (air ? Math.sin(T * 1.6 - k * 0.6) * 0.03 : 0) + (air && Fl ? Fl.pitch * 0.15 : 0);
      }
      // ---- neck: shares the look and the turn among its bones, keeps the head level
      const look = v.lookYaw || 0, into = -v.flexN * 0.7;
      const pitch = v.neckPitch || 0;      // what the pose asked of the neck (sniff, eat, rest…)
      const bob = Math.sin(ph + 1.2) * 0.04 * amp + Math.sin(T * 1.3 + (v.bob || 0)) * 0.015 * (1 - amp);
      const roar = e.state === 'roar' ? -0.12 : 0;
      const NK = [['neck', 0.3, 0.4], ['neck1', 0.35, 0.35], ['neck2', 0.25, 0.25]];
      let pz = 0;
      for (const [n, wy, wz] of NK) {
        const b = P[n];
        if (!b) continue;
        b.rotation.y = (look + into) * wy;
        b.rotation.z = pitch * wz + bob * (n === 'neck1' ? 1 : 0.4) + roar;
        pz += b.rotation.z;
      }
      if (P.head) { P.head.rotation.y = (look + into) * 0.1; P.head.rotation.z = (P.head.rotation.z || 0) - (pz - pitch) * 0.7; }
      // ---- legs: knees and ankles bend as each foot lifts and swings through
      if (!air && P.legFL2) {
        const L = [['legFL', 1, true], ['legBR', 1, false], ['legFR', -1, true], ['legBL', -1, false]];
        for (const [n, sg, front] of L) {
          const lift = Math.max(0, -Math.cos(ph) * sg) * amp;
          const knee = P[n + '2'], ank = P[n + '3'];
          if (front) { knee.rotation.z = lift * 0.9; ank.rotation.z = -lift * 0.5; }
          else { knee.rotation.z = lift * 0.7; ank.rotation.z = -lift * 0.6; }
          if (rest > 0.01) {
            P[n].rotation.z = U.lerp(P[n].rotation.z, -0.9, rest);
            knee.rotation.z = U.lerp(knee.rotation.z, front ? 1.6 : 1.2, rest);
            ank.rotation.z = U.lerp(ank.rotation.z, front ? -0.6 : -0.4, rest);
          }
        }
      } else if (P.legFL2) {
        // in the air: legs drawn up, feet trailing
        for (const n of ['legFL', 'legFR', 'legBL', 'legBR']) { P[n].rotation.z = n[3] === 'F' ? -0.35 : 0.55; P[n + '2'].rotation.z = n[3] === 'F' ? 0.9 : 0.5; P[n + '3'].rotation.z = -0.4; }
      }
      // ---- wings: folded at elbow and wrist on the ground; a wave through the wing in the air
      if (P.wingL2) {
        const fold = v.fold == null ? (air ? 0 : 1) : v.fold;
        const wa = v.wAmp || 0, wp = v.wPh || 0, sg = v.wSign || 1;
        for (const [side, s] of [['L', 1], ['R', -1]]) {
          const e2 = P['wing' + side + '2'], e3 = P['wing' + side + '3'];
          const lag1 = Math.sin(wp - 0.7) * wa * 0.45 * sg * s, lag2 = Math.sin(wp - 1.4) * wa * 0.6 * sg * s;
          e2.rotation.y = s * fold * 1.0; e3.rotation.y = s * fold * 1.05;
          e2.rotation.x = lag1 * (1 - fold); e3.rotation.x = lag2 * (1 - fold) + (air && !Fl ? 0 : 0) - s * 0.08 * (1 - fold) * (wa < 0.3 ? 1 : 0);
        }
      }
      // ---- breathing: the chest rises and falls; slow and deep at rest
      if (P.body && v.bodyY0 != null && !air) P.body.position.y += Math.sin(T * (rest > 0.5 ? 0.9 : 1.6)) * 0.01;
    },
    // Where a dragon looks with you on its back: its head leads into the turn you
    // are asking for, glances at whatever caught its eye below, and otherwise
    // looks about it — never held fixed. It lifts its head to climb and drops it
    // to dive.
    flightLook(e, v, Fl, dt) {
      const T = R.time, pt = e.pt, dir = Fl.dir != null ? Fl.dir : (v.dir || 0);
      let yaw, pitch = Fl.pitch * 0.45;
      const steering = Fl.want != null && !Fl.auto;
      if (steering) yaw = U.clamp(-U.angleDiff(dir, Fl.want) * 0.75, -0.9, 0.9);
      else yaw = Math.sin(T * 0.37 + (v.bob || 0)) * 0.32 + Math.sin(T * 0.11 + 1.7) * 0.18;
      if (pt && pt.look) {
        const a = -U.angleDiff(dir, Math.atan2(pt.look.y - e.y, pt.look.x - e.x));
        if (Math.abs(a) < 1.7) { const k = steering ? 0.3 : 0.75; yaw = U.lerp(yaw, U.clamp(a, -1, 1), k); pitch += 0.22 * k; }
      }
      if (e.state === 'roar') pitch -= 0.2;
      v.lookYaw = (v.lookYaw || 0) + (yaw - (v.lookYaw || 0)) * Math.min(1, dt * 2.6);
      v.neckPitch = (v.neckPitch || 0) + (pitch - (v.neckPitch || 0)) * Math.min(1, dt * 2.2);
    },
    // Your beast's body language: it looks at what it is looking at, lies down to
    // rest, puts its head down to sniff or eat, stretches its wings, and leans its
    // head to you — eased in and out, never snapped.
    animatePartner(game, e, v, pt) {
      const P = v.inst.parts, dt = R._dt || 0.016, w = v.pw || (v.pw = { rest: 0, sniff: 0, eat: 0, stretch: 0, nuzzle: 0 });
      for (const k in w) w[k] += ((pt.pose === k ? 1 : 0) - w[k]) * Math.min(1, dt * (k === 'rest' ? 1.6 : 3));
      const s = v.inst.root.scale.x;
      // where it looks: the neck and head turn toward it, within reason
      let yaw = 0;
      if (pt.look) yaw = U.clamp(-U.angleDiff(v.dir || 0, Math.atan2(pt.look.y - e.y, pt.look.x - e.x)), -1.0, 1.0);
      v.lookYaw = (v.lookYaw || 0) + (yaw - (v.lookYaw || 0)) * Math.min(1, dt * 3);
      if (P.neck) { P.neck.rotation.y = v.lookYaw * 0.6; if (P.head) P.head.rotation.y = v.lookYaw * 0.4; }
      else if (P.head) P.head.rotation.y = v.lookYaw * 0.8;
      // lying down: the body sinks, the legs fold under, the head rests low, the tail curls
      const r = w.rest;
      if (r > 0.01) {
        v.yOff = (v.yOff || 0) - 0.5 * s * r * (e.flies ? 1 : 0.8);
        if (P.legFL) { P.legFL.rotation.z = U.lerp(P.legFL.rotation.z, -1.25, r); P.legFR.rotation.z = U.lerp(P.legFR.rotation.z, -1.25, r); P.legBL.rotation.z = U.lerp(P.legBL.rotation.z, 1.25, r); P.legBR.rotation.z = U.lerp(P.legBR.rotation.z, 1.25, r); }
        if (P.tail) P.tail.rotation.y = U.lerp(P.tail.rotation.y, 0.7 + Math.sin(R.time * 0.5) * 0.08, r);
        if (P.body && v.bodyY0 != null) P.body.position.y = v.bodyY0 + Math.sin(R.time * 0.9) * 0.02;   // slow, deep breaths
      }
      // head down: sniffing the ground, eating, or leaning to you
      const low = Math.max(w.sniff * 0.55, w.eat * 0.75, w.nuzzle * 0.45, r * 0.45);
      if (low > 0.01) {
        const bobH = w.eat * Math.sin(R.time * 7) * 0.12 + w.sniff * Math.sin(R.time * 9) * 0.05;
        v.neckPitch = U.lerp(v.neckPitch || 0, 0.5 * low + bobH, Math.min(1, low * 1.5));
        if (P.neck) P.neck.rotation.z = v.neckPitch;
        if (P.head) P.head.rotation.z = U.lerp(P.head.rotation.z, 0.45 * low + bobH, Math.min(1, low * 1.5));
      } else { v.neckPitch = (v.neckPitch || 0) * 0.9; if (P.neck) P.neck.rotation.z = v.neckPitch; }
      if (P.jaw && w.eat > 0.05) P.jaw.rotation.z = -(0.15 + 0.25 * Math.max(0, Math.sin(R.time * 7))) * w.eat;
      // a long stretch: wings up and open, head back, a yawn
      if (w.stretch > 0.01 && P.wingL) {
        const k = w.stretch;
        v.fold = (v.fold == null ? 1 : v.fold) * (1 - k * 0.15);
        P.wingL.rotation.y *= 1 - k; P.wingR.rotation.y *= 1 - k;
        P.wingL.rotation.x = U.lerp(P.wingL.rotation.x, -0.7, k); P.wingR.rotation.x = U.lerp(P.wingR.rotation.x, 0.7, k);
        if (P.head) P.head.rotation.z = U.lerp(P.head.rotation.z, -0.35, k);
        if (P.jaw) P.jaw.rotation.z = U.lerp(P.jaw.rotation.z, -0.45, k);
      }
    },
    updateEntities(game, dt) {
      const seen = new Set();
      R._viewBudget = { n: 0, t0: performance.now() };
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
        // your own great beast turns see-through while its bulk is between the
        // camera and you, so it never hides you or the fight
        let shown = v.alpha;
        if (e.tamed && e.titan && game.pe && !(game.pl && game.pl.flying === e.titan) && !e.dead) {
          const pe = game.pe, sc = (e.tscale || 1) * 1.47;
          const pp = R.project(pe.x, pe.y, 0.9), bc = R.project(e.x, e.y, 1.1 * sc + (e.alt || 0)), br = R.project(e.x + 1.9 * sc, e.y, 1.1 * sc + (e.alt || 0));
          const rad = Math.abs(br.x - bc.x), dxy = Math.hypot(pp.x - bc.x, (pp.y - bc.y) * 1.25);
          const over = e.y > pe.y - 0.6 * sc && dxy < rad * 1.05;   // nearer the camera than you, and over you on the screen
          v.occA = (v.occA == null ? 1 : v.occA) + ((over ? 0.3 : 1) - (v.occA == null ? 1 : v.occA)) * Math.min(1, dt * 6);
          shown = Math.min(shown, v.occA);
        }
        if (!special) R.fadeView(v, shown);
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
        // (a monster drawn with an animal's model is animated as that animal: a
        // stand-in that reads through to the monster, made once rather than a fresh
        // copy of it every frame)
        const as = (k, val) => { const a = v.alias || (v.alias = Object.create(e)); a[k] = val; return a; };
        if (e.shape === 'rat') R.animateCreature(game, as('species', 'gnawer'), v);
        else if (e.shape === 'hound') R.animateCreature(game, as('species', 'wolf'), v);
        else if (e.shape === 'stag') R.animateCreature(game, as('species', 'deer'), v);
        else if (e.shape === 'drake') R.animateBoss(game, as('state', e.state === 'cast' ? 'roar' : e.state), v);
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
        root.position.set(v.horse && e.mounted ? v.horse.sx : v.px, gy + (v.yOff || 0) + hy + (e.alt || 0), v.horse && e.mounted ? v.horse.sz : v.py);
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
        // a titan's state shows on its body: shielded, laid open, or burning with its last strength
        if (e.titan && !flash && !tell && !(e.burn > 0)) {
          const c = e.shield ? [0.12, 0.3, 0.6] : (e.exposedUntil || 0) > game.time ? [0.5, 0.12, 0.02] : e.ph === 3 ? [0.22 + Math.sin(R.time * 5) * 0.08, 0.04, 0] : null;
          if (c || v.shW) { v.shW = !!c; for (const m of v.inst.mats) if (m.emissive) m.emissive.setRGB(...(c || [0, 0, 0])); }
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
          const ghost = e.iframes > 0 && !(game.pl && game.pl.flying) ? 0.55 : ECHO.PlayerCtl.sneaking ? 0.75 : 1;
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
      R.syncDragonFlight(game, dt);
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
      // Particles: soft round sprites of their own size and fade, in two layers —
      // light (sparks, flame, flashes, magic) added onto the picture so it glows,
      // and matter (blood, dust, smoke, chips) laid over it
      const mkP = (N, add) => {
        const pg = new THREE.BufferGeometry();
        pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
        pg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
        pg.setAttribute('size', new THREE.BufferAttribute(new Float32Array(N), 1));
        pg.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(N), 1));
        const mat = new THREE.ShaderMaterial({
          uniforms: { scale: { value: 800 } },
          vertexShader: 'uniform float scale; attribute float size; attribute float alpha; varying vec3 vC; varying float vA; void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = clamp(size * scale / -mv.z, 1.5, 300.0); gl_Position = projectionMatrix * mv; }',
          fragmentShader: add
            ? 'varying vec3 vC; varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; if (r > 1.0) discard; float a = pow(1.0 - r, 1.6); float core = smoothstep(0.45, 0.0, r); gl_FragColor = vec4(vC * (1.0 + core * 1.6), a * vA); }'
            : 'varying vec3 vC; varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; if (r > 1.0) discard; float a = smoothstep(1.0, 0.55, r); gl_FragColor = vec4(vC * (1.05 - r * 0.25), a * vA); }',
          vertexColors: true, transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending
        });
        const pts = new THREE.Points(pg, mat);
        pts.frustumCulled = false; pts.renderOrder = add ? 7 : 5;
        R.scene.add(pts);
        return pts;
      };
      R.parts = mkP(2600, false); R.partsAdd = mkP(2600, true);
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
    // Your homestead: tent, cabin, fence, beds of growing crops, well, coop and hens, pen, workshop, shop, barn.
    updateHomestead(game, room) {
      const H = ECHO.Homestead, s = H && game.pl && game.pl.stead;
      if (!R.steadGroup) {
        R.steadGroup = new THREE.Group(); R.scene.add(R.steadGroup); R.steadKey = ''; R.henGroup = new THREE.Group(); R.scene.add(R.henGroup);
        const m = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, flatShading: true });
        R.stM = { log: m('#7a5634'), roof: m('#5a4028'), dark: m('#1a1410'), canvas: m('#d8ccb0'), soil: m('#5a4028'), stone: m('#8a847a'), red: m('#8a3a2a'), white: m('#f0ece0'), comb: m('#c83a2a'), grey: m('#8a8070'), awn: m('#c85a3a'), awn2: m('#f0e8d8'), pole: m('#9a7a50') };
        R.stCrop = {}; for (const k in H.CROPS) R.stCrop[k] = m(H.CROPS[k].color);
      }
      const show = s && !room && Math.abs(s.x - game.pe.x) < 70 && Math.abs(s.y - game.pe.y) < 70;
      R.steadGroup.visible = R.henGroup.visible = !!show;
      if (!show) return;
      const key = JSON.stringify([Object.keys(s.builds).sort(), s.work.map(w => w.k), s.plots.map(p => p.crop ? p.crop + Math.floor(p.growth * 4) : '-'), s.animals.goats, s.animals.sheep]);
      if (key !== R.steadKey) {
        R.steadKey = key;
        while (R.steadGroup.children.length) { const c = R.steadGroup.children[0]; R.steadGroup.remove(c); c.traverse(x => { if (x.geometry) x.geometry.dispose(); }); }
        const M = R.stM, G = R.steadGroup;
        const at = (dx, dy) => ({ x: s.x + dx, y: s.y + dy, gy: R.groundH(s.x + dx, s.y + dy) });
        const box = (w, h, d, mat, x, y, z, ry = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); b.position.set(x, y, z); b.rotation.y = ry; b.castShadow = true; b.receiveShadow = true; G.add(b); return b; };
        const roof = (w, d, h, mat, x, y, z) => { const r = new THREE.Mesh(new THREE.ConeGeometry(0.71, 1, 4), mat); r.rotation.y = Math.PI / 4; r.scale.set(w, h, d); r.position.set(x, y + h / 2, z); r.castShadow = true; G.add(r); return r; };
        const B = s.builds;
        if (B.tent) { const p = at(0, 0); const t = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.4, 4), M.canvas); t.rotation.y = Math.PI / 4; t.position.set(p.x, p.gy + 0.7, p.y); t.castShadow = true; G.add(t); }
        if (B.cabin) { const p = at(0, -1.5); box(3, 1.6, 2.4, M.log, p.x, p.gy + 0.8, p.y); roof(3.6, 3.0, 1.2, M.roof, p.x, p.gy + 1.6, p.y); box(0.6, 1.0, 0.08, M.dark, p.x - 0.5, p.gy + 0.5, p.y + 1.22); box(0.35, 1.2, 0.35, M.stone, p.x + 0.8, p.gy + 2.2, p.y - 0.4); }
        if (B.fence) { const x0 = s.x - 5.2, x1 = s.x + 5.2, y0 = s.y - 6.4, y1 = s.y + 6.0; for (const [ax, ay, bx, by] of [[x0, y0, x1, y0], [x1, y0, x1, y1], [x0, y1, s.x - 0.8, y1], [s.x + 0.8, y1, x1, y1], [x0, y0, x0, y1]]) { const len = U.dist(ax, ay, bx, by), mx = (ax + bx) / 2, my = (ay + by) / 2, a = Math.atan2(by - ay, bx - ax), gy = R.groundH(mx, my); box(len, 0.08, 0.08, M.pole, mx, gy + 0.65, my, -a); box(len, 0.08, 0.08, M.pole, mx, gy + 0.35, my, -a); for (let k = 0; k <= Math.floor(len / 1.6); k++) { const t = k / Math.max(1, Math.floor(len / 1.6)); box(0.12, 0.9, 0.12, M.pole, ax + (bx - ax) * t, R.groundH(ax + (bx - ax) * t, ay + (by - ay) * t) + 0.45, ay + (by - ay) * t); } } }
        s.plots.forEach((pl0, i) => {
          const pp = H.plotPos(s, i), gy = R.groundH(pp.x, pp.y);
          box(1.25, 0.1, 1.25, M.soil, pp.x, gy + 0.05, pp.y);
          if (pl0.crop) { const g = Math.max(0.15, pl0.growth), mat = pl0.growth >= 1 ? R.stCrop[pl0.crop] : (pl0.crop === 'wheat' || pl0.crop === 'flax' ? R.stCrop.herbs : R.stCrop[pl0.crop]); for (let k = 0; k < 4; k++) { const c = new THREE.Mesh(pl0.crop === 'pumpkin' || pl0.crop === 'cabbage' ? new THREE.SphereGeometry(0.16, 6, 4) : new THREE.ConeGeometry(0.1, 0.5, 4), mat); c.scale.setScalar(g); c.position.set(pp.x - 0.3 + (k % 2) * 0.6, gy + 0.12 + 0.22 * g, pp.y - 0.3 + Math.floor(k / 2) * 0.6); G.add(c); } }
        });
        const BD = H.BUILDS;
        if (B.well) { const p = at(...BD.well.at); const w = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.7, 10), M.stone); w.position.set(p.x, p.gy + 0.35, p.y); G.add(w); box(0.08, 1.2, 0.08, M.pole, p.x - 0.45, p.gy + 1.0, p.y); box(0.08, 1.2, 0.08, M.pole, p.x + 0.45, p.gy + 1.0, p.y); roof(1.2, 0.9, 0.4, M.roof, p.x, p.gy + 1.6, p.y); }
        if (B.coop) { const p = at(...BD.coop.at); box(1.1, 0.7, 0.8, M.log, p.x, p.gy + 0.35, p.y); roof(1.3, 1.0, 0.5, M.roof, p.x, p.gy + 0.7, p.y); }
        if (B.pen) { const p = at(...BD.pen.at); for (const [dx, dy, w, d] of [[0, -1.1, 2.6, 0.08], [0, 1.1, 2.6, 0.08], [-1.3, 0, 0.08, 2.2], [1.3, 0, 0.08, 2.2]]) box(w, 0.07, d, M.pole, p.x + dx, p.gy + 0.55, p.y + dy);
          const n = s.animals.goats + s.animals.sheep; for (let i = 0; i < Math.min(6, n); i++) { const sheep = i >= s.animals.goats; const a = box(0.42, 0.3, 0.24, sheep ? M.white : M.grey, p.x - 0.8 + (i % 3) * 0.8, p.gy + 0.3, p.y - 0.4 + Math.floor(i / 3) * 0.8, i); box(0.14, 0.14, 0.14, sheep ? M.dark : M.grey, a.position.x + 0.26, p.gy + 0.45, a.position.z); } }
        if (B.workshop) { const p = at(...BD.workshop.at); box(2.0, 1.2, 1.6, M.log, p.x, p.gy + 0.6, p.y); roof(2.4, 2.0, 0.7, M.roof, p.x, p.gy + 1.2, p.y); box(0.5, 0.4, 0.3, M.dark, p.x + 0.4, p.gy + 0.2, p.y + 1.0); }
        if (B.shop) { const p = at(...BD.shop.at); box(1.6, 0.8, 0.8, M.log, p.x, p.gy + 0.4, p.y); box(0.08, 1.6, 0.08, M.pole, p.x - 0.75, p.gy + 0.8, p.y + 0.35); box(0.08, 1.6, 0.08, M.pole, p.x + 0.75, p.gy + 0.8, p.y + 0.35); for (let k = 0; k < 4; k++) box(0.42, 0.06, 1.0, k % 2 ? M.awn2 : M.awn, p.x - 0.62 + k * 0.42, p.gy + 1.62, p.y); }
        if (B.barn) { const p = at(...BD.barn.at); box(3.6, 2.0, 2.6, M.red, p.x, p.gy + 1.0, p.y); roof(4.2, 3.2, 1.3, M.roof, p.x, p.gy + 2.0, p.y); box(1.2, 1.5, 0.08, M.dark, p.x, p.gy + 0.75, p.y + 1.32); }
        // scaffolding where work is going on
        for (const w of s.work) { const off = BD[w.k].at || [0, 3]; const p = at(...off); for (const [dx, dz] of [[-0.8, -0.6], [0.8, -0.6], [-0.8, 0.6], [0.8, 0.6]]) box(0.1, 1.6, 0.1, M.pole, p.x + dx, p.gy + 0.8, p.y + dz); box(1.8, 0.08, 0.1, M.pole, p.x, p.gy + 1.5, p.y - 0.6); box(1.8, 0.08, 0.1, M.pole, p.x, p.gy + 1.5, p.y + 0.6); box(0.6, 0.3, 0.6, M.log, p.x + 1.2, p.gy + 0.15, p.y + 0.9); }
      }
      // hens about the yard
      const hens = H.birds || [];
      while (R.henGroup.children.length < hens.length) { const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.14), R.stM.white); b.position.y = 0.12; g.add(b); const c = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.04), R.stM.comb); c.position.set(0.1, 0.24, 0); g.add(c); R.henGroup.add(g); }
      R.henGroup.children.forEach((g, i) => { const b = hens[i]; g.visible = !!b; if (!b) return; g.position.set(b.x, R.groundH(b.x, b.y) + (b.peck > 0 ? -0.04 : Math.abs(Math.sin(R.time * 9 + i)) * 0.02), b.y); g.rotation.y = -b.dir; g.rotation.z = b.peck > 0 ? -0.5 : 0; });
    },
    // Caves, wayside shrines, wrecks, stone circles and hermits' huts.
    // The three gates: black pillars, a door of swirling light, a beam you can
    // see from far away, and the ring on the ground where the menace begins.
    // A titan's roost: scorched or frozen or rotted ground, boulders, the bones of what it ate.
    updateRoosts(game, room) {
      const world = game.world;
      if (!world.titans) return;
      const key = world.seed + ':' + world.titans.list.map(t => t.x + ',' + t.y + (t.bound ? 'b' : '')).join('|') + ':' + (world._tileEpoch || 0);
      if (R.roostKey !== key) {
        if (R.roostGroup) { R.scene.remove(R.roostGroup); R.roostGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
        R.roostGroup = new THREE.Group(); R.scene.add(R.roostGroup); R.roostKey = key;
        const bone = new THREE.MeshStandardMaterial({ color: C('#e0d6bc'), roughness: 0.8, flatShading: true });
        const rock = new THREE.MeshStandardMaterial({ color: C('#5a544c'), roughness: 0.95, flatShading: true });
        for (const t of world.titans.list) {
          if (t.bound) continue;
          const sp = ECHO.Titans.sp(t), el = (ECHO.Apex && ECHO.Apex.ELEM[sp.element]) || { col: '#8d8576' };
          const grp = new THREE.Group(); grp.position.set(t.x, R.groundH(t.x, t.y), t.y); R.roostGroup.add(grp);
          let h = ECHO.hashStr(t.id); const rnd = () => ((h = (h * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
          const disc = new THREE.Mesh(new THREE.CircleGeometry(4.2 + sp.scale, 28), new THREE.MeshBasicMaterial({ color: lerpC(C(el.col), C('#1a1410'), 0.6), transparent: true, opacity: 0.55, depthWrite: false }));
          disc.rotation.x = -Math.PI / 2; disc.position.y = 0.04; grp.add(disc);
          for (let i = 0; i < 7; i++) { const a = rnd() * 6.28, rr = 3.2 + rnd() * 2.6, s = 0.5 + rnd() * 0.9, m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rock); m.position.set(Math.cos(a) * rr, s * 0.45, Math.sin(a) * rr); m.rotation.set(rnd() * 3, rnd() * 3, 0); m.castShadow = true; grp.add(m); }
          for (let i = 0; i < 9; i++) { const a = rnd() * 6.28, rr = 0.8 + rnd() * 3, m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.6 + rnd() * 0.7, 5), bone); m.position.set(Math.cos(a) * rr, 0.08, Math.sin(a) * rr); m.rotation.set(Math.PI / 2, 0, rnd() * 3); grp.add(m); }
          const skull = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), bone); skull.position.set(1.2, 0.2, -0.6); grp.add(skull);
        }
      }
      R.roostGroup.visible = !room;
    },
    // ---------------------------------------------------------------- the deep woods
    // Eyes in the dark between the trees (pairs of small lights that blink, and go
    // out when you come near), and motes drifting in the still air.
    updateDeep(game, room, dt) {
      const D = ECHO.Deepwood, k = R.deepK || 0;
      if (!R.deepG) {
        const g = R.deepG = new THREE.Group(); R.scene.add(g);
        const cv = document.createElement('canvas'); cv.width = cv.height = 32;
        const cx2 = cv.getContext('2d'), gr = cx2.createRadialGradient(16, 16, 0, 16, 16, 16);
        gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.85)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        cx2.fillStyle = gr; cx2.fillRect(0, 0, 32, 32);
        const tex = new THREE.CanvasTexture(cv);
        R.eyePool = [];
        for (let i = 0; i < 28; i++) {
          const em = new THREE.SpriteMaterial({ map: tex, color: '#d8ff7a', transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
          const pr = new THREE.Group(), a = new THREE.Sprite(em), b = new THREE.Sprite(em); pr.userData.mat = em;
          a.position.x = -0.1; b.position.x = 0.1; a.scale.set(0.2, 0.13, 1); b.scale.set(0.2, 0.13, 1);
          pr.add(a, b); pr.visible = false; g.add(pr); R.eyePool.push(pr);
        }
        const N = 260, pos = new Float32Array(N * 3);
        for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 34; pos[i * 3 + 1] = Math.random() * 5; pos[i * 3 + 2] = (Math.random() - 0.5) * 34; }
        const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        R.deepMotes = new THREE.Points(mg, new THREE.PointsMaterial({ color: '#c8ffb0', size: 0.07, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
        R.deepMotes.frustumCulled = false; g.add(R.deepMotes);
      }
      const on = !room && k > 0.02 && D;
      R.deepG.visible = !!on;
      if (!on) return;
      // motes
      const tgt = R.camTarget, mp = R.deepMotes.geometry.attributes.position;
      R.deepMotes.position.set(tgt.x, R.groundH(tgt.x, tgt.z), tgt.z);
      for (let i = 0; i < mp.count; i++) {
        let y = mp.getY(i) + dt * (0.08 + (i % 5) * 0.03);
        if (y > 5) y = 0;
        mp.setY(i, y); mp.setX(i, mp.getX(i) + Math.sin(R.time * 0.4 + i) * dt * 0.08);
      }
      mp.needsUpdate = true;
      R.deepMotes.material.opacity = 0.75 * k;
      // eyes
      const cam = R.camera;
      R.eyePool.forEach((pr, i) => {
        const y = D.eyes[i];
        if (!y) { pr.visible = false; return; }
        pr.visible = true;
        pr.position.set(y.x, R.groundH(y.x, y.y) + y.h, y.y);
        pr.lookAt(cam.position);
        const fade = Math.min(1, y.t / 1.2, (y.life - y.t) / 0.4);
        const blink = (Math.sin(R.time * 1.3 + y.blink) > 0.96) ? 0.1 : 1;
        pr.scale.set(y.s, y.s * blink, y.s);
        const em = pr.userData.mat; if (em.userData.col !== y.col) { em.color.set(y.col); em.userData.col = y.col; }
        em.opacity = Math.max(0, fade);
      });
    },
    updateGates(game, room, dt) {
      const world = game.world;
      if (!world.gates) return;
      const key = world.seed + ':' + world.gates.list.map(g => g.x + ',' + g.y).join('|') + ':' + (world._tileEpoch || 0);
      if (R.gateKey !== key) {
        if (R.gateGroup) { R.scene.remove(R.gateGroup); R.gateGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
        R.gateGroup = new THREE.Group(); R.scene.add(R.gateGroup); R.gateKey = key; R.gateFx = [];
        const G = ECHO.Gates;
        for (const g of world.gates.list) {
          const th = G.THEMES[g.theme], grp = new THREE.Group(), gh = R.groundH(g.x, g.y);
          grp.position.set(g.x, gh, g.y); R.gateGroup.add(grp);
          const stone = new THREE.MeshStandardMaterial({ color: C('#16121a'), roughness: 0.55, metalness: 0.25, flatShading: true });
          const rune = new THREE.MeshBasicMaterial({ color: C(th.glow) });
          // the pillars, the lintel, the steps
          for (const sx of [-2.4, 2.4]) {
            const p = new THREE.Mesh(new THREE.BoxGeometry(1.15, 7.6, 1.15), stone); p.position.set(sx, 3.8, 0); p.castShadow = true; grp.add(p);
            const cap = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.6, 4), stone); cap.position.set(sx, 8.4, 0); cap.rotation.y = Math.PI / 4; grp.add(cap);
            for (let k = 0; k < 4; k++) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 0.04), rune); r.position.set(sx + (sx < 0 ? 0.3 : -0.3), 1.2 + k * 1.5, 0.6); grp.add(r); }
          }
          const lin = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.9, 1.4), stone); lin.position.set(0, 7.5, 0); lin.castShadow = true; grp.add(lin);
          const step = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.3, 2.4), stone); step.position.set(0, 0.15, 0.4); step.receiveShadow = true; grp.add(step);
          // the door itself: two layers of light, turning against each other
          const cv = document.createElement('canvas'); cv.width = cv.height = 128;
          const cx = cv.getContext('2d'), grd = cx.createRadialGradient(64, 64, 4, 64, 64, 64);
          grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.25, th.glow); grd.addColorStop(0.7, th.color); grd.addColorStop(1, 'rgba(0,0,0,0)');
          cx.fillStyle = grd; cx.fillRect(0, 0, 128, 128);
          cx.globalCompositeOperation = 'destination-out';
          for (let a = 0; a < 6; a++) { cx.beginPath(); for (let r = 6; r < 64; r += 2) { const t = a / 6 * Math.PI * 2 + r * 0.09; cx.lineTo(64 + Math.cos(t) * r, 64 + Math.sin(t) * r); } cx.lineWidth = 5; cx.strokeStyle = 'rgba(0,0,0,0.55)'; cx.stroke(); }
          const tex = new THREE.CanvasTexture(cv); tex.center.set(0.5, 0.5);
          const tex2 = tex.clone(); tex2.needsUpdate = true; tex2.center.set(0.5, 0.5);
          const mk = (t, o, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 6.7), new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); m.position.set(0, 3.55, z); grp.add(m); return m; };
          const back = new THREE.Mesh(new THREE.PlaneGeometry(3.7, 6.6), new THREE.MeshBasicMaterial({ color: C(th.dark) })); back.position.set(0, 3.55, -0.02); grp.add(back);
          const d1 = mk(tex, 0.95, 0.02), d2 = mk(tex2, 0.6, 0.05);
          // a beam into the sky, seen from leagues away
          const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.6, 90, 14, 1, true), new THREE.MeshBasicMaterial({ color: C(th.glow), transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
          beam.position.set(0, 45, 0); grp.add(beam);
          // stones that float round it
          const shards = [];
          for (let i = 0; i < 7; i++) { const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.22 + (i % 3) * 0.08), i % 2 ? stone : rune); grp.add(s); shards.push({ m: s, a: i / 7 * Math.PI * 2, r: 3.6 + (i % 3) * 0.7, h: 2.5 + (i % 4) * 1.6, sp: 0.3 + (i % 3) * 0.12 }); }
          // where the menace begins, and where it kills: rings that follow the ground
          const ribbon = (rad, w, col, op) => {
            const N = 96, pos = [];
            for (let i = 0; i < N; i++) {
              const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2;
              const P = (a, r) => { const x = g.x + Math.cos(a) * r, y = g.y + Math.sin(a) * r; return [x - g.x, R.groundH(x, y) - gh + 0.07, y - g.y]; };
              const a = P(a0, rad - w), b = P(a0, rad + w), c = P(a1, rad - w), d = P(a1, rad + w);
              pos.push(...a, ...b, ...c, ...c, ...b, ...d);
            }
            const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
            const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: C(col), transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide })); grp.add(m); return m;
          };
          const r1 = ribbon(G.R_HURT, 0.12, th.color, 0.55), r2 = ribbon(G.R_KILL, 0.18, th.glow, 0.75);
          // the dead ground round it
          const scorch = new THREE.Mesh(new THREE.CircleGeometry(4.6, 32), new THREE.MeshBasicMaterial({ color: C(th.dark), transparent: true, opacity: 0.7, depthWrite: false }));
          scorch.rotation.x = -Math.PI / 2; scorch.position.y = 0.05; grp.add(scorch);
          R.gateFx.push({ g, d1, d2, beam, shards, r1, r2 });
        }
      }
      R.gateGroup.visible = !room;
      R.gateLights = [];
      if (room) return;
      const pe = game.pe;
      for (const f of R.gateFx) {
        const near = Math.abs(f.g.x - pe.x) < 70 && Math.abs(f.g.y - pe.y) < 70;
        f.d1.material.map.rotation += dt * 0.9; f.d2.material.map.rotation -= dt * 1.4;
        f.d2.material.opacity = 0.45 + Math.sin(R.time * 2.3) * 0.15;
        f.beam.material.opacity = 0.16 + Math.sin(R.time * 1.3 + f.g.x) * 0.06;
        f.r1.material.opacity = 0.35 + Math.sin(R.time * 2) * 0.15; f.r2.material.opacity = 0.55 + Math.sin(R.time * 3) * 0.2;
        if (near) for (const s of f.shards) { s.a += dt * s.sp; s.m.position.set(Math.cos(s.a) * s.r, s.h + Math.sin(R.time * 1.5 + s.a * 3) * 0.3, Math.sin(s.a) * s.r * 0.6); s.m.rotation.y += dt; s.m.rotation.x += dt * 0.7; }
        if (near) R.gateLights.push({ x: f.g.x, y: f.g.y + 0.6, r: 11, a: 2.2, color: ECHO.Gates.THEMES[f.g.theme].glow, h: 3.4 });
        // the menace drifts toward the gate
        if (near && Math.random() < dt * 14) { const a = Math.random() * 6.28, r = 3 + Math.random() * (ECHO.Gates.R_HURT - 2); ECHO.Combat.fx.push({ kind: 'p', x: f.g.x + Math.cos(a) * r, y: f.g.y + Math.sin(a) * r, vx: -Math.cos(a) * 1.2, vy: -Math.sin(a) * 1.2, t: 0, life: 1.4, color: ECHO.Gates.THEMES[f.g.theme].color, size: 2 }); }
      }
    },
    updateSecrets(game, room) {
      const Sc = ECHO.Secrets, world = game.world, pe = game.pe;
      if (!Sc || !world.secrets) return;
      if (!R.secretGroup) {
        R.secretGroup = new THREE.Group(); R.scene.add(R.secretGroup); R.secretKey = '';
        const m = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, flatShading: true });
        R.secMat = { rock: m('#5a5650'), dark: m('#0a0808'), stone: m('#9a948a'), wood: m('#6a4a30'), plank: m('#8a6a48'), roof: m('#4e3e2c'), sack: m('#b8a47a'), moss: m('#5a6a3a') };
      }
      // Each hidden place is built once as it comes near and kept until it is well
      // behind you: no tearing everything down and building it again whenever one
      // place comes into range (that cost a stutter at a gallop).
      const S = R.secretSeen || (R.secretSeen = new Map());
      R.secretTick = (R.secretTick || 0) + 1;
      if (R.secretTick % 6 && !(room && S.size) && R.secretRoom === !!room) return;
      R.secretRoom = !!room;
      const live = new Set();
      let built = 0;
      if (!room) for (const o of world.secrets.list) {
        const dx = Math.abs(o.x - pe.x), dy = Math.abs(o.y - pe.y), have = S.get(o.id);
        if (have ? dx > 75 || dy > 75 : dx > 60 || dy > 60) continue;
        const sig = o.kind === 'circle' && o.done ? 'D' : '';
        if (have && have.sig === sig) { live.add(o.id); continue; }
        if (built >= 2) { if (have) live.add(o.id); continue; }   // the rest next time
        if (have) { R.secretGroup.remove(have.g); have.g.traverse(x => { if (x.geometry && x.userData.own) x.geometry.dispose(); }); }
        const g = R.buildSecret(o);
        R.secretGroup.add(g); S.set(o.id, { g, sig }); live.add(o.id); built++;
      }
      for (const [id, s] of S) if (!live.has(id)) { R.secretGroup.remove(s.g); s.g.traverse(x => { if (x.geometry && x.userData.own) x.geometry.dispose(); }); S.delete(id); }
      if (built) R.secretTick = 0;   // more may be waiting
    },
    buildSecret(o) {
      const M = R.secMat;
      const geo = R._secGeo || (R._secGeo = {});
      const boxGeo = (w, h, d) => geo['b' + w + ',' + h + ',' + d] || (geo['b' + w + ',' + h + ',' + d] = new THREE.BoxGeometry(w, h, d));
      const box = (w, h, d, mat, x, y, z, ry = 0, rz = 0) => { const b = new THREE.Mesh(boxGeo(w, h, d), mat); b.position.set(x, y, z); b.rotation.y = ry; b.rotation.z = rz; b.castShadow = true; return b; };
      {
        const g = new THREE.Group(), gy = R.groundH(o.x, o.y);
        g.position.set(o.x, gy, o.y);
        const h = ECHO.hashStr(o.id), r = k => ((h >> k) % 100) / 100;
        if (o.kind === 'cave') {
          const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.3, 0), M.rock); rock.scale.set(1.5, 0.95, 1.2); rock.position.set(0, 0.7, -0.3); rock.rotation.y = r(3) * 6; rock.castShadow = true; g.add(rock);
          const rock2 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.7, 0), M.rock); rock2.position.set(1.3, 0.35, 0.2); g.add(rock2);
          // the mouth: a black arch under an overhanging lip, facing the road you came by
          g.add(box(1.1, 1.0, 0.5, M.dark, 0, 0.5, 1.3));
          g.add(box(1.6, 0.3, 0.7, M.rock, 0, 1.1, 1.25));
          g.add(box(1.2, 0.08, 0.5, M.moss, 0, 1.55, 0.2));
        } else if (o.kind === 'shrine') {
          g.add(box(0.8, 0.35, 0.8, M.stone, 0, 0.17, 0));
          g.add(box(0.45, 0.9, 0.45, M.stone, 0, 0.8, 0));
          const roof = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.4, 4), M.roof); roof.rotation.y = Math.PI / 4; roof.position.y = 1.45; g.add(roof);
          g.add(box(0.2, 0.2, 0.06, M.dark, 0, 0.95, 0.24));
        } else if (o.kind === 'wreck') {
          if (o.boat) {
            const hull = box(2.3, 0.45, 0.9, M.plank, 0, 0.25, 0, r(2) * 3, 0.35); g.add(hull);
            for (let i = -1; i <= 1; i++) g.add(box(0.08, 0.6, 1.0, M.wood, i * 0.7, 0.35, 0, r(2) * 3, 0.35));
          } else {
            g.add(box(1.6, 0.5, 0.95, M.plank, 0, 0.5, 0, r(2) * 3, 1.15));
            const w1 = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 10), M.wood); w1.position.set(0.9, 0.06, 0.5); g.add(w1);
            const w2 = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 10), M.wood); w2.rotation.x = Math.PI / 2; w2.position.set(-0.5, 0.45, 0.6); g.add(w2);
            for (let i = 0; i < 3; i++) g.add(box(0.35, 0.3, 0.3, M.sack, 0.3 + i * 0.35, 0.15, -0.8 + r(i + 4) * 0.4, r(i) * 2));
          }
        } else if (o.kind === 'circle') {
          for (const [k, a] of [['north', -Math.PI / 2], ['east', 0], ['south', Math.PI / 2], ['west', Math.PI]]) g.add(box(0.5, 1.7, 0.38, M.stone, Math.cos(a) * 2.4, 0.85, Math.sin(a) * 2.4, a));
          g.add(box(1.1, 0.25, 0.8, M.stone, o.done ? 0.9 : 0, 0.13, o.done ? 0.6 : 0, o.done ? 0.5 : 0));
          if (o.done) g.add(box(0.7, 0.05, 0.5, M.dark, 0, 0.02, 0));
        } else if (o.kind === 'hut') {
          g.add(box(2.2, 1.3, 1.8, M.plank, 0, 0.65, 0));
          const roof = new THREE.Mesh(new THREE.ConeGeometry(1.75, 1.0, 4), M.roof); roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, 0.85); roof.position.y = 1.8; roof.castShadow = true; g.add(roof);
          g.add(box(0.5, 0.85, 0.06, M.dark, 0.3, 0.43, 0.92));
          g.add(box(0.3, 0.7, 0.3, M.stone, -0.7, 2.0, -0.3));
          g.add(box(0.6, 0.3, 0.4, M.wood, 1.4, 0.15, 0.6));
        }
        g.traverse(x => { if (x.isMesh && !Object.values(geo).includes(x.geometry)) x.userData.own = true; });
        return g;
      }
    },
    updateGlows(game) {
      const list = (ECHO.Marvels ? ECHO.Marvels.glows : []).concat(ECHO.Fest ? ECHO.Fest.glows : [], ECHO.Quests ? ECHO.Quests.glows : [], ECHO.Patrol ? ECHO.Patrol.glows : [], ECHO.Finds ? ECHO.Finds.glows : [], ECHO.Purpose ? ECHO.Purpose.glows : [], ECHO.Progress ? ECHO.Progress.glows : [], ECHO.Jobs ? ECHO.Jobs.glows : [], ECHO.Secrets ? ECHO.Secrets.glows : [], ECHO.Town ? ECHO.Town.glows : []);
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
      const pscale = Math.floor(window.innerHeight * (R.rdpr || 1) * (ECHO.Post && ECHO.Post.active ? ECHO.Post.scale : 1)) / (2 * Math.tan(THREE.MathUtils.degToRad(R.camera.fov / 2)));
      if (R.parts && R.parts.material.uniforms) { R.parts.material.uniforms.scale.value = pscale; R.partsAdd.material.uniforms.scale.value = pscale; }
      R.glowMat.uniforms.scale.value = Math.floor(window.innerHeight * (R.rdpr || 1) * (ECHO.Post && ECHO.Post.active ? ECHO.Post.scale : 1)) / (2 * Math.tan(THREE.MathUtils.degToRad(R.camera.fov / 2)));
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
    // Marks a fight leaves on the ground — blood spatter and pools, scorch, frost,
    // slime, dust, cracks — each fading away after a while.
    decalTex(kind) {
      const T = R._decalTex || (R._decalTex = {});
      if (T[kind]) return T[kind];
      const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S;
      const g = cv.getContext('2d'), rnd = (() => { let s = kind.length * 977 + 13; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
      const blob = (x, y, r, col, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col.replace('A', a)); gr.addColorStop(0.7, col.replace('A', a * 0.8)); gr.addColorStop(1, col.replace('A', 0)); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill(); };
      if (kind === 'blood' || kind === 'pool' || kind === 'slime' || kind === 'dirt') {
        const col = kind === 'slime' ? 'rgba(90,170,50,A)' : kind === 'dirt' ? 'rgba(80,64,40,A)' : 'rgba(110,14,18,A)';
        blob(64, 64, kind === 'pool' ? 40 : 24, col, 0.95);
        for (let i = 0; i < (kind === 'pool' ? 6 : 14); i++) { const a = rnd() * 6.283, d = 18 + rnd() * 38; blob(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 3 + rnd() * (kind === 'pool' ? 14 : 9), col, 0.9); }
      } else if (kind === 'scorch') {
        blob(64, 64, 60, 'rgba(18,14,12,A)', 0.85);
        for (let i = 0; i < 10; i++) { const a = rnd() * 6.283; g.strokeStyle = 'rgba(10,8,6,0.5)'; g.lineWidth = 2 + rnd() * 3; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(a) * 60, 64 + Math.sin(a) * 60); g.stroke(); }
        blob(64, 64, 14, 'rgba(255,120,40,A)', 0.35);
      } else if (kind === 'frost') {
        blob(64, 64, 58, 'rgba(225,240,255,A)', 0.75);
        g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 1.5;
        for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283 + rnd() * 0.3, d = 30 + rnd() * 28; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(a) * d, 64 + Math.sin(a) * d); g.stroke(); }
      } else if (kind === 'cracks') {
        g.strokeStyle = 'rgba(30,24,18,0.85)'; g.lineWidth = 2.5;
        for (let i = 0; i < 7; i++) { let x = 64, y = 64, a = rnd() * 6.283; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 5; k++) { a += (rnd() - 0.5) * 0.9; x += Math.cos(a) * 11; y += Math.sin(a) * 11; g.lineTo(x, y); } g.stroke(); }
        blob(64, 64, 26, 'rgba(40,32,24,A)', 0.4);
      } else blob(64, 64, 56, 'rgba(150,140,120,A)', 0.55);   // dust
      const tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding;
      return (T[kind] = tex);
    },
    syncDecals(game) {
      const D = ECHO.Combat.decals || [], pool = R._decals || (R._decals = []);
      const geo = R._decalGeo || (R._decalGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
      const room = !!ECHO.Interior.cur;
      for (let i = 0; i < Math.max(D.length, pool.length); i++) {
        const d = D[i];
        let m = pool[i];
        if (!d || room !== (d.x >= 9000)) { if (m) m.visible = false; continue; }
        if (!m) {
          m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
          m.renderOrder = 1; R.groups.fx.add(m); pool[i] = m;
        }
        if (m.userData.kind !== d.kind) { m.material.map = R.decalTex(d.kind); m.material.needsUpdate = true; m.userData.kind = d.kind; }
        const k = d.t / d.life;
        m.visible = true;
        m.position.set(d.x, R.groundH(d.x, d.y) + 0.025, d.y);
        m.rotation.y = d.rot;
        const grow = Math.min(1, d.t * 6);
        m.scale.set(d.size * (0.6 + 0.4 * grow) * 1.6, 1, d.size * (0.6 + 0.4 * grow) * 1.6);
        m.material.opacity = Math.min(1, d.t * 8) * (k < 0.65 ? 1 : 1 - (k - 0.65) / 0.35) * (d.kind === 'frost' ? 0.8 : 0.9);
      }
    },
    parseColor(str) {
      const K = R._pcc || (R._pcc = new Map());
      let r = K.get(str);
      if (r) return r;
      const m = /rgba?\(([^)]+)\)/.exec(str || '');
      if (!m) r = { c: new THREE.Color(str || '#ffffff'), a: 1 };
      else { const p = m[1].split(',').map(Number); r = { c: new THREE.Color(`rgb(${p[0] | 0},${p[1] | 0},${p[2] | 0})`), a: p[3] != null ? p[3] : 1 }; }
      r.lin = r.c.clone().convertSRGBToLinear();
      if (K.size < 4000) K.set(str, r);
      return r;
    },
    updateFx(game, dt) {
      const fx = ECHO.Combat.fx;
      const live = new Set();
      // Particles
      // particles: each moves in three dimensions — thrown up, falling under its own
      // gravity (or rising, for embers and smoke), sparks bounce, drops that land
      // stain the ground
      const L = [R.parts.geometry.attributes, R.partsAdd.geometry.attributes], cnt = [0, 0];
      const tmp = R._ptmp || (R._ptmp = new THREE.Color());
      const room = !!ECHO.Interior.cur;
      for (const f of fx) {
        if (f.kind !== 'p' && f.kind !== 'smoke') continue;
        const smoke = f.kind === 'smoke' || f.smoke;
        const glow = !smoke && (f.glow || f.spark);
        const A = L[glow ? 1 : 0], i = cnt[glow ? 1 : 0];
        if (i >= A.position.count) continue;
        const k = f.t / f.life, fade = 1 - k;
        let h;
        if (f.kind === 'smoke') { h = (f.sh || 1.0) + f.t * 0.7; f.x += (f.vx || 0) * dt; }
        else {
          if (f.h == null) { f.h = f.spark ? 0.6 + Math.random() * 0.3 : 0.45 + Math.random() * 0.3; f.vz = f.vz != null ? f.vz : f.spark ? 1.5 + Math.random() * 3 : 0.8 + Math.random() * 2.2; }
          if (f.g == null) f.g = smoke ? -0.5 : 8;
          f.vz = (f.vz || 0) - f.g * dt; f.h += f.vz * dt;
          if (f.h < 0.03) {
            if (f.bounce && f.vz < -1.2) { f.vz = -f.vz * 0.35; f.h = 0.03; f.vx *= 0.6; f.vy *= 0.6; }
            else { f.h = 0.03; f.vz = 0; f.vx *= 0.5; f.vy *= 0.5; if (f.land && !f.landed) { f.landed = true; if (Math.random() < 0.3 && !room) ECHO.Combat.decal(f.x, f.y, f.land, 0.2 + Math.random() * 0.25, 7); } }
          }
          h = f.h;
        }
        A.position.setXYZ(i, f.x, R.groundH(f.x, f.y) + h, f.y);
        const pc = R.parseColor(f.color || '#888888');
        let a = 1, s = (f.size || 2) * 0.07;
        if (smoke) { if (f.kind === 'smoke') tmp.setRGB(0.3, 0.3, 0.3); else tmp.copy(pc.lin); a = 0.5 * fade * Math.min(1, f.t * 5); s *= 1 + (f.grow || 1.2) * k; }
        else if (f.flash) { tmp.copy(pc.lin).multiplyScalar(2.6); a = fade * fade; s *= 1 + (f.grow || 0.6) * k; }
        else if (glow) { tmp.copy(pc.lin).multiplyScalar(f.spark ? 1.4 + 1.6 * fade : 1.2 + fade); a = fade; if (f.flicker) a *= 0.55 + 0.45 * Math.sin(R.time * 31 + i * 1.7); s *= f.spark ? 0.8 + 0.2 * fade : 1 - 0.4 * k; }
        else { tmp.copy(pc.lin); a = Math.min(1, fade * 1.6); s *= f.landed ? 0.8 : 1; }
        A.color.setXYZ(i, tmp.r, tmp.g, tmp.b);
        A.size.setX(i, s); A.alpha.setX(i, a);
        cnt[glow ? 1 : 0]++;
      }
      for (const [j, P] of [[0, R.parts], [1, R.partsAdd]]) {
        P.geometry.setDrawRange(0, cnt[j]);
        const A = L[j]; A.position.needsUpdate = A.color.needsUpdate = A.size.needsUpdate = A.alpha.needsUpdate = true;
      }
      R.syncDecals(game);
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
        if (f.kind !== 'tele' && f.kind !== 'slash' && f.kind !== 'ring' && f.kind !== 'zone' && f.kind !== 'wave' && f.kind !== 'beam' && f.kind !== 'rock' && f.kind !== 'arc') continue;
        live.add(f);
        let m = R.fxMeshes.get(f);
        if (!m) { m = R.makeFxMesh(f); if (!m) continue; R.fxMeshes.set(f, m); R.groups.fx.add(m); }
        const prog = Math.min(1, f.t / f.life);
        if (f.kind === 'tele') {
          if (f.follow && !f.follow.dead && f.shape !== 'circle') { f.x = f.follow.x; f.y = f.follow.y; }
          const cx = f.shape === 'circle' ? (f.cx != null ? f.cx : f.x) : f.x, cy = f.shape === 'circle' ? (f.cy != null ? f.cy : f.y) : f.y;
          m.position.set(cx, R.groundH(cx, cy), cy);
          if (m.userData.dx == null || Math.abs(m.userData.dx - cx) + Math.abs(m.userData.dz - cy) > 0.08) R.drapeTele(m);
          const u = m.material.uniforms;
          u.prog.value = prog; u.time.value = R.time; u.op.value = Math.min(1, f.t * 7);
          m.userData.f = f;
          if (f.done) m.visible = false;
        } else if (f.kind === 'zone') {
          m.position.set(f.x, R.groundH(f.x, f.y) + 0.07, f.y);
          const fade = Math.min(1, f.t * 3, (f.life - f.t) * 2);
          m.material.opacity = Math.max(0, (0.38 + Math.sin(R.time * 4 + f.x) * 0.08) * fade);
          m.userData.edge.material.opacity = 0.8 * fade;
        } else if (f.kind === 'wave') {
          m.position.set(f.x, R.groundH(f.x, f.y) + 0.12, f.y);
          m.scale.setScalar(Math.max(0.01, f.radius));
          m.material.opacity = 0.9 * (1 - 0.5 * prog);
        } else if (f.kind === 'beam') {
          m.position.set(f.x, R.groundH(f.x, f.y) + 0.9, f.y);
          m.rotation.y = -f.angle;
          m.material.opacity = 0.75 + Math.sin(R.time * 30) * 0.15;
        } else if (f.kind === 'rock') {
          m.position.set(f.x, R.groundH(f.x, f.y) + f.radius, f.y);
          m.rotation.x += dt * 6; m.rotation.z += dt * 3;
        } else if (f.kind === 'arc') {
          const P = m.geometry.attributes.position, gy = R.groundH(f.x2, f.y2) + (f.h || 0.8);
          for (let i = 0; i < 10; i++) { const k = i / 9, j = i && i < 9 ? 0.35 : 0; P.setXYZ(i, U.lerp(f.x, f.x2, k) + (Math.random() - 0.5) * j, U.lerp(R.groundH(f.x, f.y) + 0.2, gy, k) + (Math.random() - 0.5) * j, U.lerp(f.y, f.y2, k) + (Math.random() - 0.5) * j); }
          P.needsUpdate = true;
          m.material.opacity = 1 - prog;
        } else if (f.kind === 'slash') {
          m.position.set(f.x, R.groundH(f.x, f.y) + 0.55, f.y);
          if (m.material.uniforms) { m.material.uniforms.prog.value = Math.min(1, prog / 0.7); m.material.uniforms.op.value = 1 - Math.max(0, (prog - 0.55) / 0.45); }
          else m.material.opacity = 0.95 * (1 - prog * prog);
          m.scale.setScalar(f.style === 'heavy' ? 0.85 + prog * 0.25 : 0.92 + prog * 0.12);
          if (f.style === 'finisher') m.rotation.y = -prog * 1.2;
        } else {
          m.position.set(f.x, R.groundH(f.x, f.y) + 0.08, f.y);
          m.scale.setScalar(Math.max(0.01, f.radius * (0.3 + prog * 0.7)));
          m.material.opacity = 0.9 * (1 - prog);
        }
      }
      for (const [f, m] of R.fxMeshes) if (m.userData.tele && !live.has(f) && !f.done && f.t >= f.life * 0.9 && m.visible) {
        // the blow lands: the warning flashes white and fades out
        R.fxMeshes.delete(f); (R.teleFlash || (R.teleFlash = [])).push({ m, t: 0 });
      }
      if (R.teleFlash && R.teleFlash.length) R.teleFlash = R.teleFlash.filter(o => {
        o.t += dt; const u = o.m.material.uniforms, k = o.t / 0.28; o.m.scale.setScalar(1 + k * 0.05);
        u.time.value = R.time; u.prog.value = 1; u.flash.value = Math.max(0, 1 - k * 1.4); u.op.value = Math.max(0, 1 - k * k);
        if (k < 1) return true;
        R.groups.fx.remove(o.m); o.m.geometry.dispose(); o.m.material.dispose(); return false;
      });
      for (const [f, m] of R.fxMeshes) if (!live.has(f) || f.done && f.kind !== 'tele') { R.groups.fx.remove(m); m.geometry.dispose(); m.material.dispose(); if (m.userData.inner) { m.userData.inner.geometry.dispose(); } if (m.userData.edge) { m.userData.edge.geometry.dispose(); m.userData.edge.material.dispose(); } R.fxMeshes.delete(f); }
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
        if (p.kind === 'fire' || p.kind === 'orb') {
          m.rotation.x += dt * 8;
          // a fireball lights the ground it passes over and trails a glow
          (R._fxLights = R._fxLights || []).push({ x: p.x, y: p.y, r: 3, a: 0.9, color: p.kind === 'fire' ? (p.star ? '#9fd3ff' : '#ff9a3c') : (p.color || '#b48aff') });
          if (Math.random() < dt * 40) ECHO.Combat.puff(p.x, p.y, { h: 0.6, vz: 0.3, g: -0.5, life: 0.25, size: 4, color: p.kind === 'fire' ? (p.star ? '#cfeaff' : '#ffb35a') : (p.color || '#b48aff'), glow: true });
        } else if ((p.kind === 'arrow' || p.kind === 'bolt' || !p.kind) && Math.random() < dt * 30) ECHO.Combat.puff(p.x, p.y, { h: 0.6, vz: 0, g: 0, life: 0.14, size: 1.4, color: '#f4ecd8', glow: true });
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
    // A warning on the ground of where a blow will land. Drawn by one shader for
    // every shape (circle, cone, line) from coordinates in the shape's own frame:
    // a glowing rim, a charge that fills from the attacker (or the centre) out to
    // the far edge as the blow winds up, a bright front where it has reached,
    // chevrons running the way the blow will go, and a pulse that quickens as
    // the moment comes. The mesh is a grid that lies on the ground, slopes too.
    makeTele(f) {
      const shape = f.shape === 'circle' ? 0 : f.shape === 'cone' ? 2 : 1;
      const L = shape === 0 ? f.radius : f.len, W = f.width || 0.6, arc = f.arc || 1;
      const pts = [], idx = [];
      let nu, nv;
      if (shape === 1) {
        nu = Math.max(2, Math.ceil(L / 0.6)); nv = W > 1.2 ? 3 : 2;
        for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) pts.push(L * i / nu, W * (j / nv - 0.5));
      } else {
        nu = Math.max(3, Math.ceil(L / 0.7)); nv = shape === 0 ? Math.max(24, Math.min(64, Math.ceil(L * 4))) : Math.max(6, Math.ceil(arc * L * 1.6));
        const a0 = shape === 0 ? 0 : -arc / 2, da = shape === 0 ? Math.PI * 2 : arc;
        for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) { const r = L * i / nu, a = a0 + da * j / nv; pts.push(r * Math.cos(a), r * Math.sin(a)); }
      }
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a = i * (nv + 1) + j, b = a + nv + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
      const n = pts.length / 2, pos = new Float32Array(n * 3), sh = new Float32Array(pts);
      const ca = Math.cos(f.angle || 0), sa = Math.sin(f.angle || 0);
      for (let i = 0; i < n; i++) { const x = pts[i * 2], z = pts[i * 2 + 1]; pos[i * 3] = shape === 0 ? x : x * ca - z * sa; pos[i * 3 + 2] = shape === 0 ? z : x * sa + z * ca; }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('aS', new THREE.BufferAttribute(sh, 2));
      geo.setIndex(idx);
      const pc = R.parseColor(f.color);
      const hsl = {}; pc.c.getHSL(hsl);
      const col = new THREE.Color().setHSL(hsl.h, Math.max(0.55, hsl.s), Math.max(0.5, Math.min(0.62, hsl.l)));
      col.convertSRGBToLinear();
      const mat = new THREE.ShaderMaterial({
        uniforms: { col: { value: col }, prog: { value: 0 }, time: { value: 0 }, op: { value: 0 }, flash: { value: 0 }, shape: { value: shape }, L: { value: L }, W: { value: W }, arc: { value: arc }, str: { value: 0.8 + Math.min(0.6, pc.a) * 0.5 } },
        vertexShader: 'attribute vec2 aS; varying vec2 vS; void main(){ vS = aS; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: [
          'uniform vec3 col; uniform float prog, time, op, flash, shape, L, W, arc, str; varying vec2 vS;',
          'void main(){',
          '  float d, u, s; float r = length(vS);',
          '  if (shape < 0.5) { d = L - r; u = r / L; s = fract(r * 0.9 + time * 1.4); }',
          '  else if (shape < 1.5) { vec2 h = vec2(L * 0.5, W * 0.5); float cr = min(h.y * 0.85, h.x); vec2 q = abs(vS - vec2(h.x, 0.0)) - h + cr; d = cr - (length(max(q, 0.0)) + min(max(q.x, q.y), 0.0)); u = vS.x / L; s = fract((vS.x - abs(vS.y) * 1.4) * 1.1 - time * 2.0); }',
          '  else { float a = abs(atan(vS.y, vS.x)); d = min(L - r, r * sin(max(0.0, arc * 0.5 - a))); u = r / L; s = fract(r * 0.9 - time * 1.8); }',
          '  if (d < -0.02) discard;',
          '  float bw = clamp(L * 0.06, 0.08, 0.22);',
          '  float rim = smoothstep(bw, 0.0, d), hot = smoothstep(bw * 0.35, 0.0, d);',
          '  float filled = smoothstep(prog + 0.015, prog - 0.015, u);',
          '  float front = smoothstep(0.07, 0.0, abs(u - prog)) * (1.0 - smoothstep(0.97, 1.0, prog));',
          '  float chev = smoothstep(0.0, 0.07, s) * smoothstep(0.32, 0.24, s) * smoothstep(0.0, bw * 2.5, d);',
          '  float seam = smoothstep(bw * 0.55, bw * 0.8, d) * smoothstep(bw * 1.5, bw * 1.0, d);',
          '  float urg = smoothstep(0.55, 1.0, prog), pulse = 0.5 + 0.5 * sin(time * (5.0 + urg * 16.0));',
          '  float a = 0.08 + 0.2 * filled + 0.5 * rim + 0.4 * hot + 0.55 * front + chev * (0.2 - 0.08 * filled) + seam * 0.22;',
          '  a *= 0.8 + 0.2 * pulse + urg * 0.25 * pulse;',
          '  vec3 c = col * (0.55 + 0.35 * filled + 1.1 * rim + 1.6 * hot + 2.2 * front + 0.6 * chev + urg * pulse * 0.5);',
          '  c = mix(c, col * 0.18, seam * (1.0 - rim));',
          '  c = mix(c, col * 2.6 + vec3(0.25), flash * 0.8);',
          '  a = mix(a, 0.55 * (0.25 + 0.75 * rim + 0.5 * hot), flash);',
          '  gl_FragColor = vec4(c, clamp(a * str, 0.0, 1.0) * op);',
          '}'].join('\n'),
        transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3
      });
      const m = new THREE.Mesh(geo, mat);
      m.renderOrder = 2; m.frustumCulled = false;
      m.userData.tele = true;
      return m;
    },
    // lay a warning on the ground under it: each vertex at the height of the land
    drapeTele(m) {
      const P = m.geometry.attributes.position, x0 = m.position.x, z0 = m.position.z, y0 = m.position.y;
      for (let i = 0; i < P.count; i++) P.setY(i, R.groundH(x0 + P.getX(i), z0 + P.getZ(i)) - y0 + 0.06);
      P.needsUpdate = true;
      m.userData.dx = x0; m.userData.dz = z0;
    },
    makeFxMesh(f) {
      const flat = (geo, color, opacity) => {
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
        return m;
      };
      if (f.kind === 'tele') return R.makeTele(f);
      if (f.kind === 'zone') {
        const pc = R.parseColor(f.color);
        const m = flat(new THREE.CircleGeometry(f.radius, 32).rotateX(-Math.PI / 2), pc.c, 0.3);
        const edge = new THREE.Mesh(new THREE.RingGeometry(f.radius * 0.93, f.radius, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: pc.c, transparent: true, opacity: 0.8, depthWrite: false }));
        m.add(edge); m.userData.edge = edge; m.renderOrder = 2;
        return m;
      }
      if (f.kind === 'wave') {
        const pc = R.parseColor(f.color);
        const m = flat(new THREE.RingGeometry(0.9, 1, 64).rotateX(-Math.PI / 2), pc.c, 0.9);
        m.material.blending = THREE.AdditiveBlending; m.renderOrder = 3;
        return m;
      }
      if (f.kind === 'beam') {
        const pc = R.parseColor(f.color);
        const geo = new THREE.BoxGeometry(f.len, 0.5, f.width); geo.translate(f.len / 2, 0, 0);
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: pc.c, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
        return m;
      }
      if (f.kind === 'rock') {
        const m = new THREE.Mesh(new THREE.DodecahedronGeometry(f.radius, 0), new THREE.MeshStandardMaterial({ color: C(f.color), roughness: 0.95, flatShading: true }));
        m.castShadow = true;
        return m;
      }
      if (f.kind === 'slash') {
        // a swing: a bright edge sweeping round the arc, leaving a fading trail
        const inner = f.style === 'heavy' ? 0.3 : f.style === 'finisher' ? 0.62 : 0.5;
        const t0 = -f.angle - f.arc / 2;
        const geo = new THREE.RingGeometry(f.range * inner, f.range, f.arc > 4 ? 48 : 24, 2, t0, f.arc);
        const pos = geo.attributes.position, uv = geo.attributes.uv;
        for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i); let a = Math.atan2(y, x) - t0; while (a < -0.01) a += Math.PI * 2; uv.setXY(i, a / f.arc, (Math.hypot(x, y) / f.range - inner) / (1 - inner)); }
        geo.rotateX(-Math.PI / 2);
        const pc = R.parseColor(f.color);
        const mat = new THREE.ShaderMaterial({
          uniforms: { col: { value: pc.lin.clone().multiplyScalar(1.6) }, prog: { value: 0 }, op: { value: 1 } },
          vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
          fragmentShader: 'uniform vec3 col; uniform float prog; uniform float op; varying vec2 vUv; void main(){ float head = prog * 1.3; float u = vUv.x; if (u > head) discard; float trail = exp(-(head - u) * 3.2); float edge = mix(0.25, 1.0, smoothstep(0.0, 1.0, vUv.y)) * smoothstep(1.0, 0.85, vUv.y); float hot = smoothstep(0.12, 0.0, head - u); gl_FragColor = vec4(col * (1.0 + hot * 1.8) + vec3(hot * 0.6), trail * edge * op); }',
          transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
        });
        const m = new THREE.Mesh(geo, mat);
        m.renderOrder = 6;
        return m;
      }
      if (f.kind === 'arc') {
        // lightning: a jagged line, redrawn every frame
        const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.BufferAttribute(new Float32Array(10 * 3), 3));
        const m = new THREE.Line(g2, new THREE.LineBasicMaterial({ color: R.parseColor(f.color).lin.clone().multiplyScalar(3), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        m.frustumCulled = false; m.renderOrder = 7;
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
      // The shadow box follows you in whole shadow-texel steps, seen from the sun:
      // gliding it smoothly makes every shadow edge crawl and shimmer as you move,
      // and the faster you go the worse it looks.
      const off = R._sunOff || (R._sunOff = new THREE.Vector3());
      off.set(-Math.cos(ang) * 30, 8 + Math.sin(Math.max(0.15, ang)) * 34, 18);
      const st = R._sunSnap || (R._sunSnap = { d: new THREE.Vector3(), r: new THREE.Vector3(), u: new THREE.Vector3(), p: new THREE.Vector3() });
      st.d.copy(off).normalize();
      st.r.set(0, 1, 0).cross(st.d).normalize();
      st.u.copy(st.d).cross(st.r);
      const sc = R.sun.shadow.camera, texel = (sc.right - sc.left) / Math.max(1, R.sun.shadow.mapSize.x);
      const pr = tgt.dot(st.r), pu = tgt.dot(st.u);
      st.p.copy(tgt).addScaledVector(st.r, Math.round(pr / texel) * texel - pr).addScaledVector(st.u, Math.round(pu / texel) * texel - pu);
      R.sun.position.copy(st.p).add(off);
      R.sun.target.position.copy(st.p);
      const wx = ECHO.Weather ? ECHO.Weather.here(world, tgt.x, tgt.z) : { today: 'clear' };
      // the weather as it looks: eased over a quarter of a minute and blended across
      // the edges of regions, so clouds gather, rain sets in and fog rolls in and lifts
      const M = R.weatherMix(world, tgt.x, tgt.z, season, dt);
      const cloud = M.cloud;
      R.cloud = cloud; R.wx = wx;
      R.sun.intensity = 1.35 * Math.max(0, dl) * cloud;
      R.sun.color.copy(lerpC(C('#fff4e0'), C('#ff9a5a'), Math.max(dusk, 0)));
      // (switching the sun's shadow off at night would rebuild every shader in the
      // world twice a day — a long stall at dusk; instead the map just stops updating)
      R.sun.castShadow = R.renderer.shadowMap.enabled;
      R.sunDark = dl <= 0.05;
      R.moon.position.set(tgt.x + 20, 40, tgt.z + 10); R.moon.target.position.copy(tgt);
      R.moon.intensity = 0.27 * (1 - dl);
      R.hemi.intensity = (0.2 + 0.5 * dl) * (0.75 + 0.25 * cloud);
      // lightning
      if (M.storm > 0.55) {
        if (R.flashT <= 0 && Math.random() < dt * 0.08 * M.storm) { R.flashT = 0.25; setTimeout(() => ECHO.Sfx.play('thunder'), 300 + Math.random() * 1500); }
      }
      if (R.flashT > 0) { R.flashT -= dt; if (Math.sin(R.flashT * 60) > 0) R.hemi.intensity += 2.2; }
      R.hemi.color.copy(lerpC(C('#3a4a78'), C('#d6e6ff'), dl));
      R.hemi.groundColor.copy(lerpC(C('#141018'), C('#4a4030'), dl));
      let fog = lerpC(C('#0d1222'), C(season === 3 ? '#c8d4dc' : '#a9c2d4'), dl);
      fog = lerpC(fog, C('#7c8690').multiplyScalar(Math.max(0.2, dl)), 0.5 * U.clamp((1 - cloud) / 0.3, 0, 1));
      if (M.heat > 0.01) fog = lerpC(fog, C('#e8d8b0'), 0.25 * dl * M.heat);
      if (dusk > 0) fog = lerpC(fog, C('#d88a5a'), dusk * 0.45);
      // under the trees of a deep wood: the light goes, the air thickens and greens
      const dk = R.deepK = U.lerp(R.deepK || 0, ECHO.Deepwood ? ECHO.Deepwood.k : 0, Math.min(1, dt * 0.9));
      if (dk > 0.005) {
        R.sun.intensity *= 1 - 0.55 * dk;
        R.hemi.intensity *= 1 - 0.3 * dk;
        R.hemi.color.lerp(C('#5a6a52'), 0.6 * dk); R.hemi.groundColor.lerp(C('#0a0c08'), 0.7 * dk);
        fog = lerpC(fog, C(dl > 0.3 ? '#3a4a36' : '#0e140e'), 0.8 * dk);
        // (your eyes get used to the dark: what is close by can still be seen)
        if (dk > 0.25 && game.pe) R._fxLights = (R._fxLights || []).concat([{ x: game.pe.x, y: game.pe.y, r: 6.5, a: 0.55 * dk, color: '#a8c8a0' }]);
      }
      R.scene.fog.color.copy(fog);
      R.scene.background = R.scene.fog.color;
      const fogK = M.fogK;
      R.scene.fog.near = R.camDistNow * 1.15 * fogK * (1 - 0.18 * dk);
      R.scene.fog.far = R.camDistNow * (season === 3 ? 2.6 : 3.4) * fogK * (1 - 0.45 * dk);
      R.renderer.toneMappingExposure = 1.0 + (1 - dl) * 0.22;
      R.mat.window.emissiveIntensity = R.mat.windowFade.emissiveIntensity = (1 - dl) * 1.6;
      // Point lights: game lights + scene lights, nearest first
      const cand = [];
      const push = (x, y, r, a, color, h = 1.1) => cand.push({ x, y, r, a, color, h, d: (x - tgt.x) ** 2 + (y - tgt.z) ** 2 });
      for (const L of (game._updLights || game.lights || [])) push(L.x, L.y, L.r, L.a, L.color, 1.3);
      if (R._fxLights) { for (const L of R._fxLights) push(L.x, L.y, L.r, L.a, L.color, 0.7); R._fxLights.length = 0; }
      const night = dl < 0.65;
      if (night) {
        for (const t of Object.values(R.towns)) for (const l of t.lamps) push(l.x, l.y, l.era >= 4 ? 8 : 4.5, l.era >= 4 ? 1.3 : 1.0, l.arcane && l.era >= 4 ? '#bfe8ff' : '#ffc070', 1.7);
      }
      for (const l of R.siteLights || []) push(l.x, l.y, l.r, l.a, l.color, l.h);
      for (const l of R.gateLights || []) push(l.x, l.y, l.r, l.a, l.color, l.h);
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
      // rain and snow set in a few drops (flakes) at a time, and ease off the same way
      const snowing = M.snow > 0.03;
      R.snow.visible = snowing;
      if (snowing) R.snow.geometry.setDrawRange(0, Math.ceil(R.snow.geometry.attributes.position.count * Math.min(1, M.snow)));
      const raining = M.rain > 0.03;
      R.rain.visible = raining; R._raining = M.rain > 0.3;
      if (raining) {
        R.rain.position.set(tgt.x, 0, tgt.z);
        const rpos = R.rain.geometry.attributes.position, fall = dt * (18 + 8 * M.storm), slant = 0.06 + 0.19 * M.storm;
        for (let i = 0; i < rpos.count; i += 2) {
          let y = rpos.getY(i) - fall;
          if (y < 0) y += 20;
          rpos.setY(i, y); rpos.setY(i + 1, y - 0.55);
          rpos.setX(i + 1, rpos.getX(i) + slant);
        }
        rpos.needsUpdate = true;
        R.rain.geometry.setDrawRange(0, 2 * Math.ceil(rpos.count / 2 * Math.min(1, M.rain / 0.6)));
        R.rain.material.opacity = 0.3 + 0.12 * Math.min(1, M.rain / 0.6) + 0.18 * M.storm;
      }
      if (ECHO.Sfx.setRain) ECHO.Sfx.setRain(Math.min(1, M.rain));
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

    // How the weather looks, as numbers that can ease from one sky to the next.
    WXV: {
      clear: { cloud: 1, fogK: 1, rain: 0, storm: 0, snow: 0, heat: 0, grey: 0 },
      heat: { cloud: 1.08, fogK: 1, rain: 0, storm: 0, snow: 0, heat: 1, grey: 0 },
      cloudy: { cloud: 0.62, fogK: 0.95, rain: 0, storm: 0, snow: 0, heat: 0, grey: 0.3 },
      fog: { cloud: 0.55, fogK: 0.45, rain: 0, storm: 0, snow: 0, heat: 0, grey: 0.5 },
      rain: { cloud: 0.48, fogK: 0.75, rain: 0.6, storm: 0, snow: 0, heat: 0, grey: 0.6 },
      storm: { cloud: 0.32, fogK: 0.7, rain: 1, storm: 1, snow: 0, heat: 0, grey: 1 },
      snow: { cloud: 0.6, fogK: 0.8, rain: 0, storm: 0, snow: 0.6, heat: 0, grey: 0.4 },
      blizzard: { cloud: 0.38, fogK: 0.5, rain: 0, storm: 0.6, snow: 1, heat: 0, grey: 0.8 }
    },
    weatherMix(world, x, z, season, dt) {
      const V = R.WXV, Wt = ECHO.Weather, T = R._wxT || (R._wxT = {}), M = R.wxMix;
      for (const k in V.clear) T[k] = 0;
      // what the sky is doing here and a little way off on every side (regions meet softly)
      const S = R._wxS || (R._wxS = [[0, 0, 2], [14, 0, 1], [-14, 0, 1], [0, 14, 1], [0, -14, 1]]);
      let wsum = 0;
      for (const [ox, oz, w] of S) {
        const px = U.clamp(x + ox, 0, world.W - 1), pz = U.clamp(z + oz, 0, world.H - 1);
        const today = Wt ? Wt.here(world, px, pz).today : 'clear';
        let v = V[today] || V.clear;
        // in winter what falls is snow
        if (season === 3 && v.rain > 0) v = { ...v, snow: Math.max(v.snow, v.rain * 0.8), rain: 0 };
        else if (season === 3 && today !== 'clear' && today !== 'heat' && !v.snow) v = { ...v, snow: 0.35 };
        for (const k in T) T[k] += v[k] * w;
        wsum += w;
      }
      for (const k in T) T[k] /= wsum;
      if (!M || R._wxWorld !== world || dt > 5) { R.wxMix = { ...T }; R._wxWorld = world; return R.wxMix; }
      // clouds gather before the rain, and the rain eases off before the sky clears
      for (const k in M) {
        const up = T[k] > M[k], tau = k === 'rain' || k === 'snow' ? (up ? 22 : 12) : k === 'cloud' ? (up ? 20 : 12) : 16;
        M[k] += (T[k] - M[k]) * (1 - Math.exp(-dt / tau));
      }
      return M;
    },
    // ---------------------------------------------------------------- frame
    draw(game, dt) {
      if (!R.world || R.world !== game.world) R.setWorld(game.world);
      if (!R.warmed && (R.frameNo || 0) >= 3 && ECHO.Models.ready && (!ECHO.Post || !ECHO.Post.active || ECHO.Post.envT !== -1)) R.warmUp();
      R.time += dt; R._dt = dt;
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
      // on a dragon the view leads the way you are flying
      const Fa = game.pl && game.pl.flying && ECHO.Apex && ECHO.Apex.fly;
      R._lead = R._lead || { x: 0, y: 0 };
      R._lead.x += ((Fa ? Fa.vx * 0.28 : 0) - R._lead.x) * Math.min(1, dt * 1.5); R._lead.y += ((Fa ? Fa.vy * 0.22 : 0) - R._lead.y) * Math.min(1, dt * 1.5);
      tx += R._lead.x; ty += R._lead.y;
      const rm = ECHO.Interior && ECHO.Interior.cur;
      const lk = ECHO.PlayerCtl.lock;
      if (lk && pe && !rm) { tx = U.lerp(tx, lk.x, 0.3); ty = U.lerp(ty, lk.y, 0.3); }
      if (rm && !rm.carved) { // frame the room rather than the player alone
        const cx = ECHO.Interior.BASE + rm.W / 2, cy = rm.H / 2;
        tx = U.lerp(tx, cx, rm.W > 12 ? 0.25 : 0.6); ty = U.lerp(ty, cy, 0.55) + 0.6;
      }
      R.flyK = U.lerp(R.flyK || 0, game.pl && game.pl.flying ? 1 : 0, Math.min(1, dt * 2));
      const gh = R.groundH(tx, ty) + (pe && pe.alt ? pe.alt * (game.pl && game.pl.flying ? 0.95 : 0.75) : 0);   // in the air the view is on you and your dragon; the land falls away below
      R.camTarget = R.camTarget || new THREE.Vector3(tx, gh, ty);
      if (Math.abs(R.camTarget.x - tx) + Math.abs(R.camTarget.z - ty) > 24) {   // a jump (a door, a road taken in a blink), not a gallop
        R.camTarget.set(tx, gh, ty); R.firstFrame = true; R.sitesT = 0; }
      // the camera keeps up: the faster you go the tighter it follows (at a dragon's
      // pace a loose camera trails a few tiles behind and the ride feels laggy), and
      // in the air it doesn't bob over every hill passing underneath
      const k = Math.min(1, dt * (7 + Math.min(14, (R.camSpeed || 0) * 0.6)));
      R.camTarget.x = U.lerp(R.camTarget.x, tx, k); R.camTarget.z = U.lerp(R.camTarget.z, ty, k); R.camTarget.y = U.lerp(R.camTarget.y, gh, k * (game.pl && game.pl.flying ? 0.3 : 1));
      const room = ECHO.Interior && ECHO.Interior.cur;
      R.setInteriorMode(!!room);
      if (room && (R.roomKey !== room || R.roomRev !== (room.rev || 0))) { const fresh = R.roomKey !== room; R.roomKey = room; R.roomRev = room.rev || 0; R.roomFlames = []; R.buildRoom(game, room); if (fresh) R.camTarget.set(tx, 0, ty); }
      const punch = game.camPunch || 0;
      const D = R.camDistNow = R.camDist * (1 + R.zoomExtra) * (room ? (room.carved ? 0.82 : U.clamp(0.5 + room.H * 0.035, 0.72, 0.95)) : 1) * (1 - Math.min(0.12, punch * 0.07)) * (1 + (R.flyK || 0) * (1.0 + R.flyZoom()));
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
      } else { for (const f of R.roomFlames || []) f.scale.y = f.scale.x * (1 + Math.sin(R.time * 13 + f.position.x) * 0.12); if (room.carved) R.animateTraps(game); if (R.voidDrift) R.animateVoid(); }
      R.updateEntities(game, dt);
      R.updateFx(game, dt);
      R.updateGlows(game);
      R.updateTownFires(game, room);
      R.updateSecrets(game, room);
      R.updateGates(game, room, dt);
      R.updateDeep(game, room, dt);
      R.updateRoosts(game, room);
      R.updateHomestead(game, room);
      if (!room) R.updateFestival(game); else if (R.festGroup) R.festGroup.visible = false;
      if (room) R.updateInteriorLighting(game, room); else R.updateLighting(game, dt);
      // shadows: every frame on high; on medium every other frame while you stand or
      // walk (the eye does not notice; the card does), but every frame once you are
      // moving fast, or your own shadow would judder behind you
      const every = (R.Q && R.Q.shadowEvery) || 1;
      R.renderer.shadowMap.autoUpdate = false;
      const fastNow = (R.camSpeed || 0) > 4.5 || (game.pe && (game.pe.alt || 0) > 0.5);
      R.renderer.shadowMap.needsUpdate = room ? true : R.sunDark ? ((R.frameNo || 0) % 30) === 0 : (every <= 1 || fastNow || ((R.frameNo || 0) % every) === 0);
      if (ECHO.Post && ECHO.Post.R) ECHO.Post.render(game, dt); else R.renderer.render(R.scene, R.camera);
      R.drawOverlay(game);
    },

    // in the air the view opens out with height and speed
    flyZoom() {
      const F = ECHO.Apex && ECHO.Apex.fly, pe = ECHO.Game && ECHO.Game.pe;
      if (!F || !pe) return R._fz || 0;
      const want = U.clamp(((pe.alt || 0) - 8) * 0.035, 0, 0.5) + Math.min(0.3, (F.v || 0) * 0.011);
      R._fz = (R._fz || 0) + (want - (R._fz || 0)) * 0.03;
      return R._fz;
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
        let info = ECHO.UI.shopInfo(b, s);
        if (!info) continue;
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        const d = U.dist(cx, cy, pe.x, pe.y), lvl = ECHO.UI.signLevel(game, b);
        if (!lvl) continue;
        const a = d < 8 ? 1 : 1 - (d - 8) / 4;
        if (lvl < 2) info = { ...info, sub: '' };
        if (!R.onScreen(game, cx, cy)) continue;
        const p = R.project(cx, cy, R.SIGN_H[b.type] || 3);
        if (p.z > 1) continue;
        const big = Math.round(fs * 1.08), small = Math.round(fs * 0.86);
        ctx.font = `600 ${big}px "Pixelify Sans", monospace`;
        const t1 = `${info.icon} ${info.title}`;
        const w1 = ctx.measureText(t1).width;
        ctx.font = `${small}px "Pixelify Sans", monospace`;
        const w2 = ctx.measureText(info.sub).width;
        const W = Math.max(w1, w2) + 16 * R.dpr, H = info.sub ? big + small + 14 * R.dpr : big + 10 * R.dpr;
        const x0 = p.x - W / 2, y0 = p.y - H;
        if (ECHO.UI.overHud(x0, y0, x0 + W, y0 + H + 6 * R.dpr, R.dpr)) continue;
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
      const fs = Math.round(14 * R.dpr);
      ctx.font = `${fs}px "Pixelify Sans", monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      const mouse = game.screenToWorld(ECHO.Input.mx, ECHO.Input.my);
      const placed = [];
      // avoid: keep this text clear of the other labels and numbers already drawn this frame
      const text = (t, x, y, col, bg, avoid) => {
        if (!t) return;
        const w = ctx.measureText(t).width;
        if (avoid) {
          const hh = parseInt(ctx.font, 10) || fs;
          y = Math.max(y, hh + 92 * R.dpr);
          for (let k = 0; k < 8; k++) { const hit = placed.find(r => x - w / 2 - 4 < r[2] && x + w / 2 + 4 > r[0] && y - hh - 2 < r[3] && y + 2 > r[1]); if (!hit) break; y = hit[1] - 3 * R.dpr; }
          if (ECHO.UI.overHud(x - w / 2 - 6 * R.dpr, y - hh - 4 * R.dpr, x + w / 2 + 6 * R.dpr, y + 3 * R.dpr, R.dpr)) return;
          placed.push([x - w / 2, y - hh, x + w / 2, y]);
        }
        if (bg) { ctx.fillStyle = bg; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x - w / 2 - 6 * R.dpr, y - fs - 4 * R.dpr, w + 12 * R.dpr, fs + 7 * R.dpr, 5 * R.dpr); else ctx.rect(x - w / 2 - 6 * R.dpr, y - fs - 4 * R.dpr, w + 12 * R.dpr, fs + 7 * R.dpr); ctx.fill(); }
        ctx.lineJoin = 'round'; ctx.lineWidth = 4 * R.dpr; ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.strokeText(t, x, y);
        ctx.fillStyle = col; ctx.fillText(t, x, y);
      };
      // Shop signs: what each building is and what it sells
      // the trail to wherever you're headed, on the ground
      if (!ECHO.Interior.cur && game.pe && ECHO.Nav) { ECHO.Nav.drawTrail(ctx, game, (x, y) => R.project(x, y, 0.06), R.dpr); ctx.font = `${fs}px "Pixelify Sans", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; }
      if (!ECHO.Interior.cur && game.pe) R.drawShopSigns(game, ctx, fs);
      if (!ECHO.Interior.cur && game.pe && ECHO.Marvels) {
        ECHO.Marvels.drawSky(ctx, game, R.cw, R.ch);
        ECHO.Marvels.drawHints(ctx, game, (x, y) => R.project(x, y, 1), R.cw, R.ch);
        ctx.font = `${fs}px "Pixelify Sans", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      }
      if (ECHO.Fest) { ECHO.Fest.drawHUD(ctx, game, R.cw); ctx.font = `${fs}px "Pixelify Sans", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; }
      if (ECHO.Progress) { ctx.font = `${Math.round(fs * 0.85)}px "Pixelify Sans", monospace`; for (const ll of ECHO.Progress.lootLabels(game)) { if (!R.onScreen(game, ll.x, ll.y)) continue; const p = R.project(ll.x, ll.y, 0.75); if (p.z > 1) continue; text(ll.text, p.x, p.y, ll.color, null, true); } ctx.font = `${fs}px "Pixelify Sans", monospace`; }
      if (ECHO.Progress) for (const sl of ECHO.Progress.siteLabels(game)) { if (!R.onScreen(game, sl.x, sl.y)) continue; const p = R.project(sl.x, sl.y, 2.6); if (p.z > 1) continue; ctx.globalAlpha = sl.a; text(sl.text, p.x, p.y, sl.color, 'rgba(14,10,8,0.66)', true); ctx.globalAlpha = 1; }
      const heights = { player: 1.25, person: 1.25, boss: 3.6 };
      for (const e of game.ents) {
        if (e.dead || e.hidden || e === game.pe) continue;
        if (!R.onScreen(game, e.x, e.y)) continue;
        const h = (e.type === 'creature' ? (e.species === 'wolf' ? 1.0 : 0.65) : (heights[e.type] || 1.2)) * (e.titan ? (e.tscale || 1) * 0.9 : 1) + (e.alt || 0);
        const p = R.project(e.x, e.y, h);
        const hover = U.dist(mouse.x, mouse.y, e.x, e.y) < 0.9;
        // health bar for wounded foes
        if (e.type !== 'boss' && (e.hp < e.maxHp || e === ECHO.PlayerCtl.lock)) {
          const w = 34 * R.dpr, bh = 4 * R.dpr;
          ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(p.x - w / 2, p.y - bh, w, bh);
          ctx.fillStyle = game.hostileTo(game.pe, e) ? '#d8463a' : '#c8b46a'; ctx.fillRect(p.x - w / 2, p.y - bh, w * Math.max(0, e.hp / e.maxHp), bh);
        }
        const ty = p.y - 6 * R.dpr;
        if (e.say && e.sayT > 0 && ECHO.UI.bubbleOk(game, e)) {
          const w = ctx.measureText(e.say).width;
          // bubbles stack instead of covering each other
          let tyb = ty;
          for (let k = 0; k < 8; k++) { const r0 = [p.x - w / 2 - 7 * R.dpr, tyb - fs - 10 * R.dpr, p.x + w / 2 + 7 * R.dpr, tyb - 1 * R.dpr]; const hit = placed.find(r => r0[0] < r[2] && r0[2] > r[0] && r0[1] < r[3] && r0[3] > r[1]); if (!hit) break; tyb = hit[1] - 2 * R.dpr; }
          if (ECHO.UI.overHud(p.x - w / 2 - 8 * R.dpr, tyb - fs - 10 * R.dpr, p.x + w / 2 + 8 * R.dpr, tyb, R.dpr)) continue;
          placed.push([p.x - w / 2 - 7 * R.dpr, tyb - fs - 10 * R.dpr, p.x + w / 2 + 7 * R.dpr, tyb - 1 * R.dpr]);
          const ty0 = ty; { const ty = tyb; void ty0;
          ctx.fillStyle = 'rgba(250,244,228,0.95)';
          ctx.fillRect(p.x - w / 2 - 7 * R.dpr, ty - fs - 10 * R.dpr, w + 14 * R.dpr, fs + 9 * R.dpr);
          ctx.fillStyle = '#2a2420'; ctx.fillText(e.say, p.x, ty - 5 * R.dpr); }
          continue;
        }
        if (e.type === 'boss') { const lb = ECHO.Progress ? ECHO.Progress.label(game, e) : { text: e.label, color: '#ffcf8a' }; text(lb.text, p.x, ty, lb.color, 'rgba(14,10,8,0.66)', true); continue; }
        if (e.marvel) { if (e.label && U.dist(e.x, e.y, game.pe.x, game.pe.y) < 6) text(e.label, p.x, ty, '#bfe8ff'); continue; }
        if (e.yielded) { text('yields — [E] to spare', p.x, ty, '#9fe0c8'); continue; }
        if (e.sleeping && hover) { text('asleep', p.x, ty, '#9fb7d8'); continue; }
        const foeish = ECHO.Progress && (e.type === 'creature' || e.type === 'person') && e.species !== 'hare' && e.species !== 'gnawer' && e.species !== 'hind' && ECHO.Progress.counts(game, e);
        if (foeish) {
          if (hover || e === ECHO.PlayerCtl.lock || e.boss2 || e.beast || U.dist(e.x, e.y, game.pe.x, game.pe.y) < 9) {
            const lb = ECHO.Progress.label(game, e);
            text(lb.text, p.x, ty, lb.color, 'rgba(14,10,8,0.66)', true);
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
            text(`${e.label || e.foe.name} · Lv ${e.lvl}`, p.x, ty, e.boss2 ? '#ffcf5a' : e.elite ? '#ff9a7a' : '#ffb0a0', 'rgba(14,10,8,0.66)', true);
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
        ctx.font = `${Math.round(fs * (f.big ? 1.6 : 1.25) * pop)}px "Pixelify Sans", monospace`;
        text(f.text, p.x, p.y, f.color, null, true);
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

    // A head-and-shoulders picture of someone, from their own 3D model in their own clothes and gear.
    // A beast, monster or lord, whole, at three-quarters — for the page of your tamed beasts.
    beastPortrait(game, e, w, h) {
      try {
        const P = R._bport || (R._bport = (() => {
          const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
          r.outputEncoding = THREE.sRGBEncoding; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.15;
          const sc = new THREE.Scene();
          sc.add(new THREE.HemisphereLight('#fff2e0', '#30261c', 0.9));
          const key = new THREE.DirectionalLight('#ffe8c8', 1.4); key.position.set(2, 3, 2.6); sc.add(key);
          const rim = new THREE.DirectionalLight('#9fc0ff', 0.8); rim.position.set(-2.4, 2, -2.2); sc.add(rim);
          return { r, sc, cam: new THREE.PerspectiveCamera(30, 1, 0.05, 200) };
        })());
        if (P.w !== w || P.h !== h) { P.r.setSize(w, h, false); P.cam.aspect = w / h; P.cam.updateProjectionMatrix(); P.w = w; P.h = h; }
        const inst = R.instFor(e);
        if (!inst) return null;
        const v = { inst, kind: e.type, cfgT: 0, dir: 0, bob: 0, own: !!(e.humanoid && R.MON_MODEL[e.species] && inst.root && ECHO.Models.scenes[R.MON_MODEL[e.species]]), float: e.species === 'wraith' || e.species === 'bride' };
        R.configure(game, { ...e, dead: false, hurtT: 0, rage: false }, v);
        for (const k of ['torch', 'lantern']) if (ECHO.Models.show) ECHO.Models.show(inst, k, false);
        inst.root.position.set(0, 0, 0); inst.root.rotation.set(0, Math.PI / 2 + 0.6, 0);
        P.sc.add(inst.root);
        inst.root.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(inst.root), c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
        const R0 = Math.max(sz.x, sz.y * 1.1, sz.z) * 0.47 + 0.04, dist = R0 / Math.sin(THREE.MathUtils.degToRad(15));
        P.cam.position.set(c.x + dist * 0.18, c.y + dist * 0.32, c.z + dist * 0.93); P.cam.lookAt(c.x, c.y, c.z);
        P.cam.near = Math.max(0.01, dist / 50); P.cam.far = dist * 4; P.cam.updateProjectionMatrix();
        P.r.render(P.sc, P.cam);
        P.sc.remove(inst.root);
        return P.r.domElement;
      } catch (err) { console.error(err); return null; }
    },
    portrait(game, e, w, h) {
      try {
        const P = R._port || (R._port = (() => {
          const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
          r.outputEncoding = THREE.sRGBEncoding; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.1;
          const sc = new THREE.Scene();
          sc.add(new THREE.HemisphereLight('#fff2e0', '#30261c', 0.8));
          const key = new THREE.DirectionalLight('#ffe8c8', 1.3); key.position.set(1.6, 2.6, 2.4); sc.add(key);
          const rim = new THREE.DirectionalLight('#9fc0ff', 0.7); rim.position.set(-2, 2.2, -2); sc.add(rim);
          return { r, sc, cam: new THREE.PerspectiveCamera(28, 1, 0.05, 40) };
        })());
        if (P.w !== w || P.h !== h) { P.r.setSize(w, h, false); P.cam.aspect = w / h; P.cam.updateProjectionMatrix(); P.w = w; P.h = h; }
        const inst = ECHO.Models.instance('person');
        R.configure(game, { ...e, dead: false, hurtT: 0 }, { inst, kind: e.type, cfgT: 0, dir: 0, bob: 0 });
        for (const k of ['torch', 'lantern']) ECHO.Models.show(inst, k, false);
        inst.root.position.set(0, 0, 0); inst.root.rotation.set(0, Math.PI / 2 + 0.38, 0);
        P.sc.add(inst.root);
        inst.root.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(inst.root), top = box.max.y, H = top - box.min.y;
        const fy = top - H * 0.24;
        P.cam.position.set(0.2, fy + H * 0.04, H * 1.3); P.cam.lookAt(0, fy - H * 0.02, 0);
        P.r.render(P.sc, P.cam);
        P.sc.remove(inst.root);
        return P.r.domElement;
      } catch (err) { console.error(err); return null; }
    }
  };

  // ECHO is drawn in 3D only: WebGL and the models must load.
  ECHO.chooseRenderer = async function () {
    let ok = false;
    if (typeof THREE !== 'undefined' && R.supported()) {
      try { ok = await ECHO.Models.load(); } catch (e) { console.error(e); ok = false; }
    }
    ECHO.Renderer = R;
    ECHO.render3d = ok;
    return ok;
  };
})();
