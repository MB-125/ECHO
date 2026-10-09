// Boats in 3D: a clinker-built rowboat with oars that pull, and the broader
// ferry with its ferryman poling at the stern. Built facing +x like the horse.
(function () {
  ECHO.Boat3D = {
    build(kind) {
      const ferry = kind === 'ferry';
      const L = ferry ? 2.9 : 1.9, Wd = ferry ? 1.05 : 0.72, Hh = ferry ? 0.34 : 0.28;
      const mats = [];
      const mat = (c, o = {}) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: o.r || 0.8, metalness: 0, flatShading: true, side: o.ds ? THREE.DoubleSide : THREE.FrontSide }); mats.push(m); return m; };
      const wood = mat(ferry ? '#4e3420' : '#5e3e24'), dark = mat('#2e1f12'), plank = mat('#8a6a46'), rope = mat('#c8b080');
      const root = new THREE.Group(), inner = new THREE.Group(); root.add(inner); inner.rotation.y = Math.PI;
      // hull: the outline of a boat from above, pointed at both ends, extruded up
      const sh = new THREE.Shape();
      sh.moveTo(-L / 2, 0);
      sh.bezierCurveTo(-L * 0.32, Wd * 0.55, L * 0.25, Wd * 0.55, L / 2, 0);
      sh.bezierCurveTo(L * 0.25, -Wd * 0.55, -L * 0.32, -Wd * 0.55, -L / 2, 0);
      const hullG = new THREE.ExtrudeGeometry(sh, { depth: Hh, bevelEnabled: false, curveSegments: 10 });
      hullG.rotateX(-Math.PI / 2);   // extrude upward
      const hull = new THREE.Mesh(hullG, wood); hull.castShadow = true; hull.receiveShadow = true; inner.add(hull);
      // the hollow inside: a slightly smaller dark floor just under the gunwale
      const inS = new THREE.Shape();
      const s = 0.86;
      inS.moveTo(-L / 2 * s, 0);
      inS.bezierCurveTo(-L * 0.32 * s, Wd * 0.55 * s, L * 0.25 * s, Wd * 0.55 * s, L / 2 * s, 0);
      inS.bezierCurveTo(L * 0.25 * s, -Wd * 0.55 * s, -L * 0.32 * s, -Wd * 0.55 * s, -L / 2 * s, 0);
      const floorG = new THREE.ShapeGeometry(inS, 10); floorG.rotateX(-Math.PI / 2);
      const floor = new THREE.Mesh(floorG, dark); floor.position.y = Hh + 0.005; inner.add(floor);
      // strakes along the sides
      // thwarts (seats)
      const thw = [];
      for (const x of ferry ? [-0.8, 0, 0.8] : [-0.42, 0.28]) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, Wd * 0.86), plank); t.position.set(x, Hh * 0.92, 0); t.castShadow = true; inner.add(t); thw.push(t); }
      // oars, pivoting at the oarlocks
      const oars = [];
      if (!ferry) for (const sd of [-1, 1]) {
        const piv = new THREE.Group(); piv.position.set(0.15, Hh + 0.02, sd * Wd * 0.47); inner.add(piv);
        const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 1.25), plank); shaft.position.z = sd * 0.42; piv.add(shaft);
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.32), plank); blade.position.z = sd * 1.0; piv.add(blade);
        piv.userData.side = sd; oars.push(piv);
      }
      // the ferry: a coil of rope and a ferryman with his pole
      let man = null, pole = null;
      if (ferry) {
        const coil = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.035, 6, 12), rope); coil.rotation.x = Math.PI / 2; coil.position.set(1.0, Hh + 0.04, 0.2); inner.add(coil);
        const inst = ECHO.Models && ECHO.Models.instance('person');
        if (inst) {
          man = inst; inst.root.position.set(-1.05, Hh - 0.02, 0); inst.root.rotation.y = Math.PI / 2 * 0; inst.root.scale.setScalar(1);
          ECHO.Models.recolor(inst, 'cloth', '#5a4a3a'); ECHO.Models.recolor(inst, 'cloth2', '#3a3028');
          for (const k of ['sword', 'shield', 'bow', 'spear', 'torch', 'crown', 'cape', 'robe', 'apron', 'helm', 'hairLong', 'bandana']) ECHO.Models.show(inst, k, false);
          ECHO.Models.show(inst, 'hood', true); ECHO.Models.show(inst, 'beard', true);
          inner.add(inst.root);
          inst.root.rotation.y = 0;
        }
        pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.6, 5), plank); pole.position.set(-1.2, Hh + 0.6, 0.25); pole.rotation.z = 0.5; inner.add(pole);
      }
      return { root, inner, oars, man, pole, mats, kind, Hh, t: Math.random() * 10 };
    },
    // Each frame: bob on the water, roll a little, pull the oars.
    pose(B, dt, rowing, speed) {
      B.t += dt;
      const bob = Math.sin(B.t * 1.6) * 0.02 + Math.sin(B.t * 2.3 + 1) * 0.012;
      B.inner.position.y = bob;
      B.inner.rotation.x = Math.sin(B.t * 1.3) * 0.03 + (B.roll || 0);
      B.inner.rotation.z = Math.sin(B.t * 1.1 + 0.5) * 0.02 - Math.min(0.06, speed * 0.015);
      if (rowing) B.stroke = (B.stroke || 0) + dt * 2.2;
      const ph = (B.stroke || 0) * Math.PI * 2;
      for (const o of B.oars) {
        const sd = o.userData.side;
        // sweep back through the water, lift, swing forward
        o.rotation.y = (rowing ? Math.sin(ph) * 0.55 : 0.1) * sd * -1;
        o.rotation.x = (rowing ? (Math.cos(ph) > 0 ? -0.05 : 0.18) : 0.12) * sd;
      }
      if (B.pole) { B.pole.rotation.z = 0.5 + Math.sin(B.t * 1.4) * 0.25; B.pole.position.y = B.Hh + 0.6 + Math.sin(B.t * 1.4) * 0.15; }
      if (B.man) {
        const P = B.man.parts, w = Math.sin(B.t * 1.4);
        if (P.armR) P.armR.rotation.z = -1.6 + w * 0.4; if (P.armL) P.armL.rotation.z = -1.4 + w * 0.4;
        if (P.body) P.body.rotation.z = 0.15 + w * 0.12;
      }
      return { bob };
    }
  };
})();
