// Dungeon floors: rooms cut from the rock and joined by corridors.
//
// Each floor is a grid of chambers linked by a winding tree of passages (with
// a loop or two so you can circle round a fight). The far end holds the way
// down — or, on the deepest floor, the lord's chamber — behind an iron door
// whose key one of the monsters carries. Dead ends hide treasure rooms. Pressure
// plates in the passages throw up spikes, or jets of fire in the hotter places.
(function () {
  const { U } = ECHO;

  const D = ECHO.DGen = {
    // Cut a floor: returns { W, H, rooms, links, entrance, far, treasure, gap }.
    carve(rng, cols, rows) {
      const CW = 12, CH = 10;
      const W = cols * CW + 2, H = rows * CH + 3;
      const blocked = new Uint8Array(W * H).fill(1);
      const open = (x, y) => { if (x > 0 && y > 0 && x < W - 1 && y < H - 1) blocked[y * W + x] = 0; };
      const rooms = [];
      for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
        const w = 7 + rng.int(0, 3), h = 6 + rng.int(0, 2);
        const x0 = 1 + cx * CW + 1 + rng.int(0, CW - w - 2), y0 = 1 + cy * CH + 1 + rng.int(0, CH - h - 2);
        const r = { i: rooms.length, cx, cy, x0, y0, x1: x0 + w, y1: y0 + h, links: [] };
        r.mx = (r.x0 + r.x1) / 2; r.my = (r.y0 + r.y1) / 2;
        rooms.push(r);
        for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) open(x, y);
      }
      const at = (cx, cy) => rooms[cy * cols + cx];
      // the entrance: bottom row, middle
      const entrance = at(Math.floor(cols / 2), rows - 1);
      // a random tree from the entrance
      const seen = new Set([entrance.i]), stack = [entrance], links = [];
      while (stack.length) {
        const r = stack[stack.length - 1];
        const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => (r.cx + dx >= 0 && r.cx + dx < cols && r.cy + dy >= 0 && r.cy + dy < rows) ? at(r.cx + dx, r.cy + dy) : null).filter(n => n && !seen.has(n.i));
        if (!nb.length) { stack.pop(); continue; }
        const n = nb[rng.int(0, nb.length - 1)];
        seen.add(n.i); links.push([r, n]); r.links.push(n); n.links.push(r); stack.push(n);
      }
      // how far each room is from the entrance
      const dist = new Map([[entrance.i, 0]]), q = [entrance];
      while (q.length) { const r = q.shift(); for (const n of r.links) if (!dist.has(n.i)) { dist.set(n.i, dist.get(r.i) + 1); q.push(n); } }
      for (const r of rooms) r.depth = dist.get(r.i) || 0;
      // the far room: the deepest dead end
      const leaves = rooms.filter(r => r.links.length === 1 && r !== entrance);
      const far = (leaves.length ? leaves : rooms.filter(r => r !== entrance)).sort((a, b) => b.depth - a.depth)[0];
      const treasure = leaves.filter(r => r !== far).sort((a, b) => b.depth - a.depth)[0] || null;
      // a loop or two, never into the far room or the treasure room
      for (let k = 0; k < 1 + Math.floor(rooms.length / 4); k++) {
        const a = rooms[rng.int(0, rooms.length - 1)];
        if (a === far || a === treasure) continue;
        const nbs = [[1, 0], [0, 1]].map(([dx, dy]) => (a.cx + dx < cols && a.cy + dy < rows) ? at(a.cx + dx, a.cy + dy) : null).filter(n => n && n !== far && n !== treasure && !a.links.includes(n));
        if (nbs.length) { const n = nbs[0]; links.push([a, n]); a.links.push(n); n.links.push(a); }
      }
      // passages, two tiles wide, from centre to centre with one bend
      const corridor = (a, b) => {
        const ax = Math.floor(a.mx), ay = Math.floor(a.my), bx = Math.floor(b.mx), by = Math.floor(b.my);
        const horizFirst = rng.next() < 0.5;
        const hline = (y, x0, x1) => { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) { open(x, y); open(x, y + 1); } };
        const vline = (x, y0, y1) => { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) { open(x, y); open(x + 1, y); } };
        if (horizFirst) { hline(ay, ax, bx); vline(bx, ay, by); } else { vline(ax, ay, by); hline(by, ax, bx); }
      };
      for (const [a, b] of links) corridor(a, b);
      // the way in: a short passage down to the bottom edge
      const doorX = Math.floor(entrance.mx);
      for (let y = entrance.y1; y < H - 1; y++) { open(doorX, y); open(doorX + 1, y); }
      // where the passage meets the far room (the iron door goes here)
      const gap = [];
      for (let y = far.y0 - 1; y <= far.y1; y++) for (let x = far.x0 - 1; x <= far.x1; x++) {
        const inside = x >= far.x0 && x < far.x1 && y >= far.y0 && y < far.y1;
        if (inside || blocked[y * W + x]) continue;
        const edge = (x === far.x0 - 1 || x === far.x1) !== (y === far.y0 - 1 || y === far.y1);
        if (edge) gap.push({ x, y });
      }
      return { W, H, blocked, rooms, links, entrance, far, treasure, gap, doorX };
    },
    roomOf(G, x, y) { return G.rooms.find(r => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1) || null; },
    // Open tiles in a room, away from its walls.
    tiles(G, r, margin = 1) {
      const out = [];
      for (let y = r.y0 + margin; y < r.y1 - margin; y++) for (let x = r.x0 + margin; x < r.x1 - margin; x++) if (!G.blocked[y * G.W + x]) out.push({ x, y });
      return out;
    },
    // Corridor tiles (open, not inside any room).
    corridorTiles(G) {
      const out = [];
      for (let y = 1; y < G.H - 1; y++) for (let x = 1; x < G.W - 1; x++) if (!G.blocked[y * G.W + x] && !D.roomOf(G, x, y) && y < G.H - 3) out.push({ x, y });
      return out;
    }
  };
})();
