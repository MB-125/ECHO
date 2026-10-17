// The finishing pass: what turns a rendered frame into a picture.
//
// Done the way big engines do it, inside ECHO's own renderer:
//   · the scene is drawn into a high-precision buffer (multisampled where the
//     machine allows, so edges stay clean),
//   · bright things bloom — lanterns, fires, windows at night, spells, the
//     gates, a titan's breath,
//   · ambient occlusion darkens the creases where things meet the ground and
//     each other, so the world sits together instead of floating,
//   · a filmic tone curve, then colour grading that follows the hour and the
//     weather — warm at dawn and dusk, cool and quiet at night, grey in a
//     storm, close and amber indoors — and a soft vignette,
//   · the sky lights the world as well as the sun (image-based lighting),
//     so metal and wet stone pick up the colour of the day.
// And it watches the clock: if frames start to take too long it lowers the
// rendering resolution a step at a time (and, if that is not enough, drops
// the costliest effects) so the game keeps moving smoothly; when there is
// room again it climbs back up.
(function () {
  const { U } = ECHO;

  const GRADE = {
    uniforms: {
      tDiffuse: { value: null }, tDepth: { value: null }, resolution: { value: new THREE.Vector2(1, 1) },
      cameraNear: { value: 0.5 }, cameraFar: { value: 400 }, aoOn: { value: 1 }, aoStrength: { value: 0.42 }, aoRadius: { value: 26 },
      exposure: { value: 1.05 }, lift: { value: new THREE.Vector3(0, 0, 0) }, gain: { value: new THREE.Vector3(1, 1, 1) },
      saturation: { value: 1.08 }, contrast: { value: 1.04 }, vignette: { value: 0.32 }, grain: { value: 0.012 }, time: { value: 0 }, fxaa: { value: 0 }
    },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      #include <packing>
      uniform sampler2D tDiffuse; uniform sampler2D tDepth; uniform vec2 resolution;
      uniform float cameraNear, cameraFar, aoOn, aoStrength, aoRadius, exposure, saturation, contrast, vignette, grain, time, fxaa;
      uniform vec3 lift, gain;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float dist(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, cameraNear, cameraFar); }
      vec3 RRTAndODTFit(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
      vec3 aces(vec3 c) {
        const mat3 I = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
        const mat3 O = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
        c *= exposure / 0.6; c = I * c; c = RRTAndODTFit(c); c = O * c; return clamp(c, 0.0, 1.0);
      }
      vec3 toSRGB(vec3 c) { return mix(pow(c, vec3(0.41666)) * 1.055 - vec3(0.055), c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308)))); }
      vec3 fetch(vec2 uv) { return texture2D(tDiffuse, uv).rgb; }
      void main() {
        vec3 col = fetch(vUv);
        // a light edge smoothing where the buffer could not be multisampled
        if (fxaa > 0.5) {
          vec2 px = 1.0 / resolution;
          vec3 n = fetch(vUv + vec2(0.0, px.y)), s = fetch(vUv - vec2(0.0, px.y)), e = fetch(vUv + vec2(px.x, 0.0)), w = fetch(vUv - vec2(px.x, 0.0));
          vec3 L = vec3(0.299, 0.587, 0.114);
          float lc = dot(col, L), ln = dot(n, L), ls = dot(s, L), le = dot(e, L), lw = dot(w, L);
          float range = max(max(max(ln, ls), max(le, lw)), lc) - min(min(min(ln, ls), min(le, lw)), lc);
          if (range > 0.04) col = mix(col, (n + s + e + w + col) * 0.2, clamp(range * 2.5, 0.0, 0.6));
        }
        // ambient occlusion: creases and contact shadows, from the depth alone
        if (aoOn > 0.5) {
          float z = dist(vUv);
          if (z < cameraFar * 0.9) {
            float r = aoRadius / z, occ = 0.0, j = hash(vUv * resolution) * 6.2831;
            for (int i = 0; i < 10; i++) {
              float fi = float(i), a = fi * 2.39996 + j, rr = r * (0.25 + 0.75 * fract(fi * 0.618 + 0.13));
              vec2 o = vec2(cos(a), sin(a)) * rr * vec2(resolution.y / resolution.x, 1.0) * 0.01;
              float dz = z - dist(vUv + o);
              occ += smoothstep(0.04, 0.35, dz) * (1.0 - smoothstep(0.9, 2.6, dz));
            }
            col *= 1.0 - aoStrength * occ / 10.0;
          }
        }
        // a filmic curve, then the grade of the hour
        col = aces(col);
        col = col * gain + lift * (1.0 - col);
        float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col = mix(vec3(l), col, saturation);
        col = clamp(0.18 * pow(max(col, vec3(1e-5)) / 0.18, vec3(contrast)), 0.0, 1.0);   // contrast about middle grey, so shadows keep their detail
        vec2 d = vUv - 0.5; col *= 1.0 - vignette * dot(d, d) * 1.8;
        col = toSRGB(col);
        col += (hash(vUv * resolution + time) - 0.5) * grain;
        gl_FragColor = vec4(col, 1.0);
      }`
  };

  const P = ECHO.Post = {
    active: false, scale: 1, lock: false, slowT: 0, fastT: 0, ema: 16, last: 0, aoOff: false, bloomOff: false, envT: -1,
    QUAL: { low: null, medium: { samples: 2, bloom: true, ao: false, env: true, bloomRes: 0.5 }, high: { samples: 4, bloom: true, ao: true, env: true, bloomRes: 0.5 } },
    init(R) {
      P.R = R;
      P.setup();
    },
    // (re)build for the chosen quality
    setup() {
      const R = P.R, r = R.renderer;
      const q = P.QUAL[(ECHO.UI && ECHO.UI.settings.quality) || 'high'];
      P.dispose();
      P.q = q;
      if (!q || !THREE.EffectComposer || !THREE.UnrealBloomPass) { P.active = false; r.toneMapping = THREE.ACESFilmicToneMapping; if (R.scene) R.scene.environment = null; return; }
      try {
        const gl2 = r.capabilities.isWebGL2;
        const w = Math.max(1, Math.floor(window.innerWidth * R.dpr)), h = Math.max(1, Math.floor(window.innerHeight * R.dpr));
        const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: gl2 ? q.samples : 0 });
        rt.depthTexture = new THREE.DepthTexture(w, h);
        rt.depthTexture.type = THREE.UnsignedIntType;
        const C = P.composer = new THREE.EffectComposer(r, rt);
        C.setPixelRatio(1);
        C.addPass(new THREE.RenderPass(R.scene, R.camera));
        if (q.bloom && !P.bloomOff) {
          P.bloom = new THREE.UnrealBloomPass(new THREE.Vector2(Math.floor(w * q.bloomRes), Math.floor(h * q.bloomRes)), 0.4, 0.5, 1.0);
          C.addPass(P.bloom);
        }
        P.grade = new THREE.ShaderPass(GRADE);
        P.grade.uniforms.tDepth.value = rt.depthTexture;
        P.grade.uniforms.fxaa.value = gl2 && q.samples ? 0 : 1;
        C.addPass(P.grade);
        P.active = true;
        r.toneMapping = THREE.NoToneMapping;   // the grade does it now
        P.resize();
      } catch (err) { console.error('ECHO: post-processing unavailable, drawing plain', err); P.dispose(); P.active = false; r.toneMapping = THREE.ACESFilmicToneMapping; }
      P.envT = -1;
    },
    dispose() {
      if (P.composer) { try { P.composer.renderTarget1.dispose(); P.composer.renderTarget2.dispose(); if (P.bloom) P.bloom.dispose(); } catch (e) { /* gone */ } }
      P.composer = null; P.bloom = null; P.grade = null;
    },
    resize() {
      if (!P.composer) return;
      const R = P.R, w = Math.max(1, Math.floor(window.innerWidth * R.dpr * P.scale)), h = Math.max(1, Math.floor(window.innerHeight * R.dpr * P.scale));
      P.composer.setSize(w, h);
      if (P.composer.renderTarget1.depthTexture) { P.composer.renderTarget1.depthTexture.image.width = w; P.composer.renderTarget1.depthTexture.image.height = h; }
      P.grade.uniforms.resolution.value.set(w, h);
      // what is drawn at a lower resolution is stretched to fill the window
      R.renderer.setPixelRatio(R.dpr * P.scale);
      R.renderer.setSize(window.innerWidth, window.innerHeight, false);
    },
    // ------------------------------------------------------------ the sky as a light
    env(game) {
      const R = P.R;
      if (!P.q || !P.q.env) { R.scene.environment = null; return; }
      const m = game.world ? game.world.minute : 720, k = Math.floor(m / 30) + (ECHO.Interior.cur ? 1000 : 0);
      if (k === P.envT) return;
      P.envT = k;
      const dl = ECHO.TIME ? ECHO.TIME.daylight(m) : 1;
      const sky = new THREE.Color().setHSL(0.58, 0.45, 0.015 + dl * 0.05), ground = new THREE.Color().setHSL(0.1, 0.3, 0.008 + dl * 0.02);
      if (ECHO.Interior.cur) { sky.setHSL(0.08, 0.5, 0.05); ground.setHSL(0.07, 0.4, 0.02); }
      const sc = new THREE.Scene();
      const geo = new THREE.SphereGeometry(10, 16, 12), cols = [];
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) { const t = U.clamp(pos.getY(i) / 10 * 0.5 + 0.5, 0, 1); const c = ground.clone().lerp(sky, Math.pow(t, 0.8)); cols.push(c.r, c.g, c.b); }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      sc.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
      const pm = P.pmrem || (P.pmrem = new THREE.PMREMGenerator(R.renderer));
      const rt = pm.fromScene(sc, 0.02);
      if (P.envRT) P.envRT.dispose();
      P.envRT = rt;
      R.scene.environment = rt.texture;
      geo.dispose();
    },
    // ------------------------------------------------------------ the grade of the hour
    gradeFor(game) {
      const G = P.grade.uniforms, world = game.world, room = ECHO.Interior.cur;
      const m = world ? world.minute : 720, dl = ECHO.TIME ? ECHO.TIME.daylight(m) : 1;
      const dusk = (m > 1000 && m < 1290) ? 1 - Math.abs(m - 1150) / 140 : (m > 280 && m < 480) ? 1 - Math.abs(m - 380) / 100 : 0;
      const wx = P.R.wx ? P.R.wx.today : 'clear', grey = { storm: 1, rain: 0.6, blizzard: 0.8, fog: 0.5, cloudy: 0.3 }[wx] || 0;
      let gain = [1, 1, 1], lift = [0, 0, 0], sat = 1.08, con = 1.04, vig = 0.3;
      if (room) { gain = [1.06, 0.98, 0.88]; lift = [0.012, 0.006, 0]; sat = 1.02; vig = 0.45; con = 1.06; }
      else {
        const night = 1 - dl;
        gain = [1 + 0.05 * dusk - 0.06 * night, 1 - 0.03 * night, 1 - 0.05 * dusk + 0.05 * night];
        lift = [0.006 * dusk, 0.002, 0.012 * night];
        sat = 1.06 - 0.03 * dusk - 0.12 * night - 0.1 * grey;
        con = 1.06 - 0.03 * dusk - 0.02 * grey;
        vig = 0.28 + 0.15 * night;
      }
      if (game.pe && game.pe.hp < game.pe.maxHp * 0.3) { sat *= 0.75; vig += 0.15; }   // the world dims as you weaken
      G.gain.value.set(...gain); G.lift.value.set(...lift); G.saturation.value = sat; G.contrast.value = con; G.vignette.value = vig;
      G.exposure.value = room ? 1.08 : 0.98;
      G.time.value = (G.time.value + 0.37) % 100;
      G.aoOn.value = P.q.ao && !P.aoOff ? 1 : 0;
      const cam = P.R.camera; G.cameraNear.value = cam.near; G.cameraFar.value = cam.far;
      // only what truly glows blooms: flames, lanterns, windows at night, spells, the gates
      if (P.bloom) { P.bloom.strength = room ? 0.55 : 0.35 + 0.35 * (1 - dl); P.bloom.threshold = room ? 0.95 : 1.05 - 0.15 * (1 - dl); }
    },
    // ------------------------------------------------------------ smooth, first
    adapt(now) {
      const dtf = P.last ? now - P.last : 16;
      P.last = now;
      if (dtf > 250) return;                    // a hitch (loading, a tab switch) is not a trend
      P.ema += (dtf - P.ema) * 0.06;
      if (P.lock) return;
      P.cool = (P.cool || 0) - dtf;
      if (P.cool > 0) return;
      if (P.ema > 24) {
        if (P.scale > 0.62) { P.scale = Math.max(0.6, P.scale - 0.1); P.resize(); P.cool = 1500; }
        else if (P.q && P.q.ao && !P.aoOff) { P.aoOff = true; P.cool = 2000; }
        else if (P.bloom && !P.bloomOff) { P.bloomOff = true; P.setup(); P.cool = 2000; }
      } else if (P.ema < 14 && P.scale < 1) { P.scale = Math.min(1, P.scale + 0.05); P.resize(); P.cool = 3000; }
    },
    render(game, dt) {
      const R = P.R;
      P.adapt(performance.now());
      if (!P.active) { R.renderer.render(R.scene, R.camera); return; }
      P.env(game);
      P.gradeFor(game);
      P.composer.render(dt);
    }
  };
})();
