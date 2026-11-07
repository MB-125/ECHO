// The houses and halls of the peoples who do not build as Valdren does, made here from simple
// shapes (as the Blender ones are: the door on the +z side, standing on y = 0, a 3×3 house about
// 2.8 across, a 6×5 keep about 5.6 by 4.6). Every part is named for what it is made of, so a town
// colours them in its own way: wall, plaster, stone, roof, wood, darkwood, awning, banner, band,
// dome, gold, window (lit at night), flame and glow (alight).
//
//   h_ash  an Ashmere villa: white walls, a low hipped terracotta roof, a vine-hung porch
//   h_lan  a Lantern hall-house: tall, a steep roof, a lantern burning in its cupola
//   h_nor  a Norren longhouse: low timber walls under a great turf roof, carved horns at the gables
//   h_sar  a Sarrad house: flat-roofed clay, a parapet, a little dome; h_sar2, two storeys and a stair
//   h_kes  a Kesh yurt: round felt walls, a cone roof, a painted band and door
//   h_aur  an Auren house: marble, a portico of columns, a red tile pediment
//   k_ash, k_nor, k_sar, k_kes, k_aur: their palaces and halls
//   fountain, palm, cypress, brazier, lanternpost, flowers, post, npost, stall: their streets
(function () {
  ECHO.Models.townModels = function (mat) {
    const M = ECHO.Models, S = M.scenes;
    const mats = {};
    const m = (name, hex) => mats[name] || (mats[name] = mat(name, hex));
    const add = (g, geo, mt, x, y, z, rx, ry, rz) => { const me = new THREE.Mesh(geo, mt); me.position.set(x, y, z); me.rotation.set(rx || 0, ry || 0, rz || 0); g.add(me); return me; };
    // (y is where it stands, not its middle)
    const box = (g, mt, w, h, d, x, y, z, rx, ry, rz) => add(g, new THREE.BoxGeometry(w, h, d), mt, x, y + h / 2, z, rx, ry, rz);
    const cyl = (g, mt, rt, rb, h, seg, x, y, z) => add(g, new THREE.CylinderGeometry(rt, rb, h, seg), mt, x, y + h / 2, z);
    const cone = (g, mt, r, h, seg, x, y, z, ry) => add(g, new THREE.ConeGeometry(r, h, seg), mt, x, y + h / 2, z, 0, ry || 0);
    const dome = (g, mt, r, x, y, z) => add(g, new THREE.SphereGeometry(r, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), mt, x, y, z);
    const ball = (g, mt, r, x, y, z) => add(g, new THREE.SphereGeometry(r, 8, 6), mt, x, y, z);
    // a four-sided roof rising to a point (w along x, d along z)
    const hip = (g, mt, w, d, h, x, y, z) => { const c = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4); c.rotateY(Math.PI / 4); c.scale(w, h, d); return add(g, c, mt, x, y + h / 2, z); };
    // a gabled roof: its ridge along x (or along z), w by d, h high
    const gableGeo = (w, d, h) => {
      const FL = [-w / 2, 0, d / 2], FR = [w / 2, 0, d / 2], BL = [-w / 2, 0, -d / 2], BR = [w / 2, 0, -d / 2], RL = [-w / 2, h, 0], RR = [w / 2, h, 0];
      const tris = [FL, FR, RR, FL, RR, RL, BR, BL, RL, BR, RL, RR, BL, FL, RL, FR, BR, RR, FL, BL, BR, FL, BR, FR];
      const pos = new Float32Array(tris.length * 3);
      tris.forEach((p, i) => { pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2]; });
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.computeVertexNormals();
      return geo;
    };
    const gable = (g, mt, w, d, h, x, y, z, alongZ) => { const geo = gableGeo(alongZ ? d : w, alongZ ? w : d, h); if (alongZ) geo.rotateY(Math.PI / 2); return add(g, geo, mt, x, y, z); };
    const make = (name, fn) => { if (S[name]) return; const g = new THREE.Group(); fn(g); S[name] = g; };

    const WALL = () => m('wall', '#ece4d4'), PL = () => m('plaster', '#efe6d6'), ST = () => m('stone', '#cabea8'), RF = () => m('roof', '#a04a32');
    const WD = () => m('wood', '#8a6a48'), DW = () => m('darkwood', '#4a3424'), AW = () => m('awning', '#5fae84'), BN = () => m('banner', '#2b3f66');
    const BD = () => m('band', '#c84a3a'), DM = () => m('dome', '#3a7ab0'), GD = () => m('gold', '#d8b048'), WN = () => m('window', '#3a3428');
    const LV = () => m('leaves', '#4f8a3e'), TR = () => m('trunk', '#6a5034'), FL = () => m('flame', '#ffb040'), GL = () => m('glow', '#ffd890');
    const IR = () => m('iron', '#3a3a40'), WA = () => m('water', '#4f8fb8'), FW = () => m('flower', '#d8507a'), FW2 = () => m('flower2', '#f0c040');

    // ------------------------------------------------------------ houses
    make('h_ash', g => {
      box(g, ST(), 2.7, 0.18, 2.3, 0, 0, 0);
      box(g, WALL(), 2.5, 1.35, 2.05, 0, 0.18, -0.05);
      hip(g, RF(), 2.95, 2.55, 0.72, 0, 1.53, -0.05);
      box(g, DW(), 0.5, 0.86, 0.06, 0, 0.18, 0.99);
      for (const sx of [-0.78, 0.78]) { box(g, WN(), 0.36, 0.42, 0.05, sx, 0.72, 0.99); box(g, LV(), 0.46, 0.1, 0.14, sx, 0.6, 1.05); box(g, FW(), 0.36, 0.06, 0.1, sx, 0.7, 1.06); }
      for (const sz of [-0.5, 0.4]) { box(g, WN(), 0.05, 0.4, 0.34, 1.26, 0.72, sz); box(g, WN(), 0.05, 0.4, 0.34, -1.26, 0.72, sz); }
      // the porch: posts, a beam and an awning hung with vines
      for (const sx of [-0.9, 0.9]) box(g, WD(), 0.1, 1.12, 0.1, sx, 0.18, 1.32);
      box(g, WD(), 2.0, 0.08, 0.1, 0, 1.28, 1.32);
      box(g, AW(), 2.15, 0.05, 0.62, 0, 1.33, 1.08, -0.12);
      box(g, LV(), 0.16, 0.5, 0.12, -0.9, 0.86, 1.36); box(g, LV(), 0.14, 0.36, 0.12, 0.9, 0.98, 1.36);
    });
    make('h_lan', g => {
      box(g, ST(), 2.35, 0.22, 2.35, 0, 0, 0);
      box(g, PL(), 2.05, 1.75, 2.05, 0, 0.22, 0);
      box(g, GD(), 2.13, 0.1, 2.13, 0, 1.92, 0);
      hip(g, RF(), 2.55, 2.55, 1.45, 0, 2.0, 0);
      box(g, GL(), 0.3, 0.34, 0.3, 0, 3.12, 0);
      for (const [x, z] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) box(g, DW(), 0.05, 0.36, 0.05, x, 3.1, z);
      cone(g, RF(), 0.28, 0.34, 4, 0, 3.46, 0, Math.PI / 4);
      box(g, DW(), 0.52, 1.1, 0.06, 0, 0.22, 1.04);
      cone(g, DW(), 0.26, 0.2, 8, 0, 1.32, 1.04);
      for (const sx of [-0.62, 0.62]) box(g, WN(), 0.24, 0.62, 0.05, sx, 0.75, 1.04);
      for (const sz of [-0.45, 0.45]) { box(g, WN(), 0.05, 0.6, 0.24, 1.04, 0.8, sz); box(g, WN(), 0.05, 0.6, 0.24, -1.04, 0.8, sz); }
    });
    make('h_nor', g => {
      box(g, ST(), 2.85, 0.14, 1.65, 0, 0, 0);
      box(g, WALL(), 2.7, 0.72, 1.48, 0, 0.12, 0);
      gable(g, RF(), 3.05, 2.35, 1.38, 0, 0.6, 0);
      // the carved horns crossing over each gable
      for (const sx of [-1.53, 1.53]) for (const s of [-1, 1]) box(g, DW(), 0.07, 0.8, 0.07, sx, 1.5, s * 0.16, s * 0.62, 0, 0);
      box(g, DW(), 0.34, 0.12, 0.3, 0.45, 1.92, 0);
      box(g, DW(), 0.54, 0.72, 0.06, 0, 0.12, 0.76);
      box(g, DW(), 0.7, 0.08, 0.08, 0, 0.86, 0.77);
      for (const sx of [-0.85, 0.85]) add(g, new THREE.CylinderGeometry(0.17, 0.17, 0.04, 10), BD(), sx, 0.5, 0.77, Math.PI / 2, 0, 0);
      box(g, WN(), 0.2, 0.18, 0.05, -1.25, 0.5, 0.76); box(g, WN(), 0.2, 0.18, 0.05, 1.25, 0.5, 0.76);
    });
    make('h_sar', g => {
      box(g, WALL(), 2.4, 1.6, 2.3, 0, 0, 0);
      box(g, RF(), 2.3, 0.04, 2.2, 0, 1.6, 0);
      box(g, ST(), 2.5, 0.22, 0.12, 0, 1.6, 1.16); box(g, ST(), 2.5, 0.22, 0.12, 0, 1.6, -1.16); box(g, ST(), 0.12, 0.22, 2.3, 1.22, 1.6, 0); box(g, ST(), 0.12, 0.22, 2.3, -1.22, 1.6, 0);
      cyl(g, WALL(), 0.56, 0.58, 0.26, 14, -0.42, 1.62, -0.32);
      dome(g, DM(), 0.56, -0.42, 1.88, -0.32);
      cone(g, GD(), 0.05, 0.22, 6, -0.42, 2.42, -0.32);
      box(g, DW(), 0.56, 1.0, 0.06, 0.35, 0, 1.16);
      cyl(g, DW(), 0.28, 0.28, 0.06, 10, 0.35, 0.97, 1.16).rotation.x = Math.PI / 2;
      box(g, AW(), 1.0, 0.05, 0.5, 0.35, 1.18, 1.36, 0.3);
      for (const [sx, sy] of [[-0.7, 0.95], [-0.7, 0.5], [0.95, 1.1]]) box(g, WN(), 0.22, 0.22, 0.05, sx, sy, 1.16);
      box(g, WN(), 0.05, 0.22, 0.22, 1.21, 1.05, -0.4); box(g, WN(), 0.05, 0.22, 0.22, -1.21, 1.05, 0.4);
      cyl(g, ST(), 0.13, 0.16, 0.36, 8, -0.3, 0, 1.32);
    });
    make('h_sar2', g => {
      box(g, WALL(), 2.4, 1.3, 2.3, 0, 0, 0);
      box(g, RF(), 2.3, 0.04, 2.2, 0, 1.3, 0);
      box(g, ST(), 2.5, 0.2, 0.12, 0, 1.3, 1.16); box(g, ST(), 0.12, 0.2, 2.3, -1.22, 1.3, 0);
      box(g, WALL(), 1.35, 0.95, 1.35, 0.45, 1.3, -0.4);
      box(g, RF(), 1.27, 0.04, 1.27, 0.45, 2.25, -0.4);
      box(g, ST(), 1.45, 0.18, 0.1, 0.45, 2.25, 0.27); box(g, ST(), 1.45, 0.18, 0.1, 0.45, 2.25, -1.07); box(g, ST(), 0.1, 0.18, 1.35, 1.17, 2.25, -0.4); box(g, ST(), 0.1, 0.18, 1.35, -0.27, 2.25, -0.4);
      // the stair up the side to the roof
      for (let k = 0; k < 5; k++) box(g, ST(), 0.34, 0.26 * (k + 1), 0.24, 1.38, 0, 0.9 - k * 0.3);
      box(g, DW(), 0.52, 0.95, 0.06, -0.45, 0, 1.16);
      box(g, AW(), 0.9, 0.05, 0.45, -0.45, 1.06, 1.34, 0.32);
      box(g, WN(), 0.22, 0.24, 0.05, 0.45, 0.65, 1.16); box(g, WN(), 0.2, 0.22, 0.05, 0.45, 1.62, 0.29);
      box(g, AW(), 0.6, 0.04, 0.5, -0.55, 1.75, -0.35);
      for (const [x, z] of [[-0.82, -0.6], [-0.28, -0.6], [-0.82, -0.12], [-0.28, -0.12]]) box(g, WD(), 0.05, 0.42, 0.05, x, 1.32, z);
    });
    make('h_kes', g => {
      cyl(g, WALL(), 1.15, 1.17, 0.95, 18, 0, 0, 0);
      cyl(g, BD(), 1.18, 1.18, 0.13, 18, 0, 0.56, 0);
      cyl(g, DW(), 1.175, 1.175, 0.04, 18, 0, 0.26, 0);
      cone(g, RF(), 1.27, 0.72, 18, 0, 0.95, 0);
      cyl(g, WD(), 0.22, 0.24, 0.12, 10, 0, 1.6, 0);
      // a painted band round the roof, and the door
      cyl(g, BD(), 0.875, 0.875, 0.07, 18, 0, 1.15, 0);
      box(g, BD(), 0.66, 0.86, 0.06, 0, 0, 1.15);
      box(g, DW(), 0.5, 0.74, 0.07, 0, 0, 1.17);
    });
    make('h_aur', g => {
      box(g, ST(), 2.75, 0.2, 2.65, 0, 0, 0);
      box(g, ST(), 1.2, 0.1, 0.3, 0, 0, 1.4);
      box(g, WALL(), 2.25, 1.42, 1.7, 0, 0.2, -0.38);
      for (const sx of [-0.98, -0.33, 0.33, 0.98]) { cyl(g, ST(), 0.085, 0.1, 1.28, 9, sx, 0.2, 0.96); box(g, ST(), 0.24, 0.07, 0.24, sx, 1.43, 0.96); }
      box(g, ST(), 2.45, 0.17, 0.48, 0, 1.48, 0.86);
      gable(g, RF(), 2.6, 2.85, 0.56, 0, 1.62, -0.05, true);
      gable(g, ST(), 2.3, 0.06, 0.46, 0, 1.66, 1.28, true);
      box(g, DW(), 0.5, 0.95, 0.06, 0, 0.2, 0.48);
      for (const sx of [-0.72, 0.72]) box(g, WN(), 0.28, 0.42, 0.05, sx, 0.75, 0.48);
      box(g, WN(), 0.05, 0.4, 0.3, 1.13, 0.75, -0.5); box(g, WN(), 0.05, 0.4, 0.3, -1.13, 0.75, -0.5);
    });

    // ------------------------------------------------------------ the great buildings
    make('k_ash', g => {
      box(g, ST(), 5.6, 0.3, 4.4, 0, 0, 0);
      for (let k = 0; k < 3; k++) box(g, ST(), 2.2 - k * 0.2, 0.1, 0.25, 0, 0.3 - (k + 1) * 0.1, 2.32 + k * 0.22);
      box(g, WALL(), 5.0, 2.1, 3.4, 0, 0.3, -0.3);
      hip(g, RF(), 5.5, 3.9, 0.9, 0, 2.4, -0.3);
      box(g, WALL(), 1.9, 1.0, 1.9, 0, 2.4, -0.3);
      cyl(g, WALL(), 0.9, 0.95, 0.4, 16, 0, 3.4, -0.3);
      dome(g, DM(), 0.92, 0, 3.8, -0.3);
      cone(g, GD(), 0.07, 0.4, 6, 0, 4.7, -0.3);
      for (const sx of [-1.55, -0.52, 0.52, 1.55]) cyl(g, ST(), 0.13, 0.15, 1.9, 10, sx, 0.3, 1.75);
      box(g, ST(), 3.6, 0.24, 0.6, 0, 2.2, 1.65);
      gable(g, RF(), 3.6, 0.9, 0.55, 0, 2.44, 1.6, false);
      box(g, DW(), 0.85, 1.35, 0.06, 0, 0.3, 1.41);
      for (const sx of [-2.0, -1.0, 1.0, 2.0]) { box(g, WN(), 0.36, 0.55, 0.05, sx, 1.0, 1.41); box(g, WN(), 0.32, 0.36, 0.05, sx, 1.78, 1.41); }
      for (const sx of [-2.35, 2.35]) box(g, BN(), 0.42, 1.2, 0.04, sx, 0.9, 1.43);
      for (const sz of [-1.3, 0, 1.0]) { box(g, WN(), 0.05, 0.5, 0.36, 2.51, 1.1, sz); box(g, WN(), 0.05, 0.5, 0.36, -2.51, 1.1, sz); }
    });
    make('k_nor', g => {
      box(g, ST(), 5.6, 0.2, 3.3, 0, 0, 0);
      box(g, WALL(), 5.3, 1.15, 3.0, 0, 0.18, 0);
      gable(g, RF(), 5.8, 3.95, 2.25, 0, 0.95, 0);
      for (const sx of [-2.92, 2.92]) for (const s of [-1, 1]) box(g, DW(), 0.1, 1.15, 0.1, sx, 2.85, s * 0.24, s * 0.62, 0, 0);
      for (const sx of [-1.4, 0, 1.4]) box(g, DW(), 0.45, 0.16, 0.4, sx, 3.15, 0);
      // its porch
      gable(g, RF(), 1.6, 1.25, 0.75, 0, 1.25, 1.75, true);
      for (const sx of [-0.62, 0.62]) box(g, DW(), 0.12, 1.25, 0.12, sx, 0.2, 2.2);
      box(g, DW(), 0.9, 1.0, 0.07, 0, 0.18, 1.52);
      for (const sx of [-2.25, -1.55, 1.55, 2.25]) add(g, new THREE.CylinderGeometry(0.22, 0.22, 0.05, 12), BD(), sx, 0.85, 1.53, Math.PI / 2, 0, 0);
      box(g, WN(), 0.24, 0.22, 0.05, -0.95, 0.6, 1.52); box(g, WN(), 0.24, 0.22, 0.05, 0.95, 0.6, 1.52);
    });
    make('k_sar', g => {
      box(g, ST(), 5.4, 0.25, 4.4, 0, 0, 0);
      box(g, WALL(), 4.6, 2.2, 3.6, 0, 0.25, -0.2);
      box(g, RF(), 4.5, 0.04, 3.5, 0, 2.45, -0.2);
      for (let k = 0; k < 11; k++) { box(g, ST(), 0.26, 0.3, 0.14, -2.15 + k * 0.43, 2.45, 1.56); box(g, ST(), 0.26, 0.3, 0.14, -2.15 + k * 0.43, 2.45, -1.96); }
      for (let k = 0; k < 8; k++) { box(g, ST(), 0.14, 0.3, 0.26, 2.27, 2.45, -1.75 + k * 0.45); box(g, ST(), 0.14, 0.3, 0.26, -2.27, 2.45, -1.75 + k * 0.45); }
      cyl(g, WALL(), 1.2, 1.25, 0.55, 18, 0, 2.45, -0.3);
      dome(g, DM(), 1.22, 0, 3.0, -0.3);
      cone(g, GD(), 0.08, 0.5, 6, 0, 4.18, -0.3); ball(g, GD(), 0.1, 0, 4.25, -0.3);
      for (const sx of [-2.45, 2.45]) {
        cyl(g, WALL(), 0.26, 0.32, 4.3, 12, sx, 0, 1.55);
        cyl(g, ST(), 0.4, 0.4, 0.12, 12, sx, 3.2, 1.55);
        dome(g, DM(), 0.28, sx, 4.3, 1.55);
        cone(g, GD(), 0.04, 0.24, 6, sx, 4.56, 1.55);
      }
      box(g, DW(), 1.0, 1.6, 0.07, 0, 0.25, 1.42);
      add(g, new THREE.CylinderGeometry(0.5, 0.5, 0.07, 14), DW(), 0, 1.85, 1.42, Math.PI / 2, 0, 0);
      box(g, AW(), 2.4, 0.06, 0.8, 0, 2.02, 1.7, 0.22);
      for (const sx of [-1.6, -0.95, 0.95, 1.6]) { box(g, WN(), 0.3, 0.46, 0.05, sx, 1.3, 1.42); box(g, WN(), 0.24, 0.3, 0.05, sx, 0.6, 1.42); }
    });
    make('k_kes', g => {
      cyl(g, WALL(), 2.2, 2.25, 1.55, 22, 0, 0, -0.1);
      cyl(g, BD(), 2.27, 2.27, 0.24, 22, 0, 0.95, -0.1);
      cyl(g, GD(), 2.265, 2.265, 0.05, 22, 0, 0.55, -0.1);
      cone(g, RF(), 2.4, 1.35, 22, 0, 1.55, -0.1);
      cyl(g, GD(), 0.4, 0.45, 0.22, 12, 0, 2.82, -0.1);
      cyl(g, GD(), 1.66, 1.66, 0.1, 22, 0, 2.0, -0.1);
      box(g, GD(), 1.0, 1.25, 0.06, 0, 0, 2.16); box(g, DW(), 0.8, 1.1, 0.07, 0, 0, 2.18);
      // the khan's standards, and a second yurt at its side
      for (const sx of [-2.5, 2.5]) { cyl(g, DW(), 0.045, 0.05, 2.9, 6, sx, 0, 1.75); box(g, BN(), 0.04, 0.8, 0.55, sx, 1.95, 2.0); cone(g, GD(), 0.08, 0.25, 6, sx, 2.9, 1.75); }
      cyl(g, WALL(), 0.95, 1.0, 0.85, 16, 2.3, 0, -1.4); cone(g, RF(), 1.05, 0.6, 16, 2.3, 0.85, -1.4); cyl(g, BD(), 0.98, 0.98, 0.1, 16, 2.3, 0.5, -1.4);
    });
    make('k_aur', g => {
      for (let k = 0; k < 3; k++) box(g, ST(), 5.6 - k * 0.3, 0.14, 4.6 - k * 0.25, 0, k * 0.14, 0);
      box(g, WALL(), 4.0, 2.3, 3.0, 0, 0.42, -0.45);
      for (let k = 0; k < 6; k++) { const sx = -2.2 + k * 0.88; cyl(g, ST(), 0.15, 0.17, 2.3, 12, sx, 0.42, 1.75); box(g, ST(), 0.4, 0.1, 0.4, sx, 2.7, 1.75); }
      for (const sx of [-2.2, 2.2]) for (const sz of [0.8, -0.2, -1.2]) cyl(g, ST(), 0.14, 0.16, 2.3, 10, sx, 0.42, sz);
      box(g, ST(), 4.95, 0.3, 4.0, 0, 2.8, -0.25);
      gable(g, RF(), 5.05, 4.15, 0.95, 0, 3.1, -0.25, true);
      gable(g, ST(), 4.7, 0.08, 0.82, 0, 3.14, 1.78, true);
      ball(g, GD(), 0.12, 0, 4.12, 1.75);
      cyl(g, WALL(), 0.95, 1.0, 0.35, 16, 0, 3.6, -0.9); dome(g, DM(), 0.95, 0, 3.95, -0.9);
      box(g, DW(), 0.9, 1.6, 0.07, 0, 0.42, 1.06);
      for (const sx of [-1.35, 1.35]) box(g, WN(), 0.36, 0.7, 0.05, sx, 1.1, 1.06);
      for (const sx of [-2.0, 2.0]) box(g, BN(), 0.4, 1.3, 0.04, sx, 1.2, 1.9);
    });

    // ------------------------------------------------------------ the streets
    make('fountain', g => {
      cyl(g, ST(), 0.7, 0.76, 0.34, 16, 0, 0, 0);
      cyl(g, WA(), 0.62, 0.62, 0.05, 16, 0, 0.27, 0);
      cyl(g, ST(), 0.11, 0.15, 0.78, 8, 0, 0.3, 0);
      cyl(g, ST(), 0.32, 0.1, 0.14, 12, 0, 1.0, 0);
      cyl(g, WA(), 0.26, 0.26, 0.03, 12, 0, 1.12, 0);
      ball(g, ST(), 0.08, 0, 1.24, 0);
    });
    make('palm', g => {
      let x = 0, y = 0;
      for (let k = 0; k < 5; k++) { const h = 0.56; cyl(g, TR(), 0.075 - k * 0.006, 0.09 - k * 0.006, h, 7, x, y, 0).rotation.z = -0.05 - k * 0.025; x += 0.035 + k * 0.012; y += h * 0.99; }
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * Math.PI * 2 + 0.2, fr = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.03, 0.24), LV());
        fr.geometry.translate(0.5, 0, 0); fr.position.set(x, y + 0.02, 0); fr.rotation.set(0, -a, -0.42 - (k % 2) * 0.16); g.add(fr);
      }
      for (let k = 0; k < 3; k++) ball(g, TR(), 0.07, x + Math.cos(k * 2.1) * 0.1, y - 0.08, Math.sin(k * 2.1) * 0.1);
    });
    make('cypress', g => {
      cyl(g, TR(), 0.06, 0.08, 0.3, 6, 0, 0, 0);
      cone(g, LV(), 0.32, 2.5, 9, 0, 0.22, 0);
      cone(g, m('leaves2', '#24452c'), 0.26, 1.6, 8, 0.05, 1.1, 0.04);
    });
    make('brazier', g => {
      for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2; box(g, IR(), 0.05, 0.82, 0.05, Math.cos(a) * 0.16, 0, Math.sin(a) * 0.16, Math.sin(a) * 0.18, 0, -Math.cos(a) * 0.18); }
      cyl(g, IR(), 0.3, 0.18, 0.2, 10, 0, 0.76, 0);
      cone(g, FL(), 0.2, 0.42, 7, 0, 0.92, 0);
      ball(g, GL(), 0.12, 0, 1.0, 0);
    });
    make('lanternpost', g => {
      cyl(g, ST(), 0.14, 0.16, 0.18, 8, 0, 0, 0);
      cyl(g, DW(), 0.05, 0.06, 1.7, 7, 0, 0.18, 0);
      box(g, DW(), 0.38, 0.05, 0.05, 0.16, 1.72, 0);
      box(g, GL(), 0.18, 0.26, 0.18, 0.3, 1.38, 0);
      cone(g, GD(), 0.15, 0.14, 4, 0.3, 1.64, 0, Math.PI / 4);
    });
    make('flowers', g => {
      box(g, m('soil', '#5a4030'), 0.82, 0.14, 0.5, 0, 0, 0);
      for (let k = 0; k < 8; k++) { const x = -0.32 + (k % 4) * 0.21, z = k < 4 ? -0.12 : 0.12; box(g, LV(), 0.12, 0.12, 0.12, x, 0.12, z); ball(g, k % 3 ? FW() : FW2(), 0.06, x, 0.27, z); }
    });
    // a hitching post on the steppe, hung with horsehair and ribbons
    make('post', g => {
      cyl(g, DW(), 0.06, 0.07, 1.95, 7, 0, 0, 0);
      cone(g, GD(), 0.07, 0.2, 6, 0, 1.95, 0);
      cone(g, m('hair', '#2a221c'), 0.16, 0.5, 8, 0, 1.45, 0).rotation.x = Math.PI;
      for (let k = 0; k < 3; k++) box(g, k % 2 ? BD() : BN(), 0.05, 0.6, 0.02, Math.cos(k * 2.1) * 0.08, 0.95, Math.sin(k * 2.1) * 0.08);
    });
    // a Norren carved post: a face, and horns
    make('npost', g => {
      cyl(g, DW(), 0.13, 0.15, 1.75, 8, 0, 0, 0);
      box(g, WD(), 0.3, 0.32, 0.3, 0, 1.75, 0);
      box(g, BD(), 0.22, 0.05, 0.02, 0, 1.92, 0.16);
      for (const s of [-1, 1]) box(g, m('bone', '#d8ccb0'), 0.06, 0.42, 0.06, s * 0.2, 2.0, 0, 0, 0, -s * 0.5);
      for (let k = 0; k < 3; k++) cyl(g, BD(), 0.155, 0.155, 0.05, 8, 0, 0.5 + k * 0.4, 0);
    });
    // a market stall under a cloth
    make('stall', g => {
      for (const [x, z] of [[-0.42, -0.3], [0.42, -0.3], [-0.42, 0.3], [0.42, 0.3]]) box(g, WD(), 0.05, 1.05, 0.05, x, 0, z);
      box(g, AW(), 1.0, 0.04, 0.78, 0, 1.05, 0, 0.12);
      box(g, WD(), 0.9, 0.08, 0.5, 0, 0.55, 0);
      for (let k = 0; k < 3; k++) ball(g, k ? FW2() : m('red', '#b84030'), 0.09, -0.25 + k * 0.25, 0.68, 0);
    });
  };
})();
