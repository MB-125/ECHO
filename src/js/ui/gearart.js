// Pictures of gear: the sword, bow and armour you carry, drawn so that every
// upgrade shows — longer, brighter blades, jewels set for each step of honing,
// gold fittings and a glow for the rarest pieces — and a figure of you wearing it.
(function () {
  const cache = new Map();
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const ch = c => Math.max(0, Math.min(255, Math.round(f < 0 ? c * (1 + f) : c + (255 - c) * f)));
    return '#' + ((ch(n >> 16) << 16) | (ch((n >> 8) & 255) << 8) | ch(n & 255)).toString(16).padStart(6, '0');
  }
  // Draw on a small pixel grid, then a soft glow underneath for fine pieces.
  function pixels(W, H, draw, glow, glowCol) {
    const c = mk(W, H), g = c.getContext('2d');
    const R = (col, x, y, w = 1, h = 1) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    draw(R, g);
    if (!glow || glow < 0.12) return c;
    const out = mk(W, H), o = out.getContext('2d');
    o.shadowColor = glowCol; o.shadowBlur = 2 + glow * 5;
    for (let i = 0; i < 1 + Math.round(glow * 2); i++) o.drawImage(c, 0, 0);
    o.shadowBlur = 0; o.drawImage(c, 0, 0);
    return out;
  }

  const A = ECHO.GearArt = {
    shade,
    sword(L) {
      return pixels(32, 32, (R) => {
        const len = 13 + Math.min(5, L.plus) + (L.rarity === 'legendary' ? 2 : 0);
        const wide = L.rarity === 'rare' || L.rarity === 'epic' || L.rarity === 'legendary' ? 3 : 2;
        const x0 = 16 - Math.floor(wide / 2), top = 22 - len;
        R(shade(L.metal, -0.35), x0, top + 1, wide, len - 1);                      // blade
        R(L.metal, x0, top + 1, wide - 1, len - 1);
        R(shade(L.metal, 0.5), x0, top + 2, 1, len - 3);                            // edge light
        R(L.metal, 16, top - 1, 1, 2);                                              // tip
        if (L.affix) for (let i = 0; i < 4; i++) R(L.glowCol, 16, top + 4 + i * 3);  // runes
        const gw = L.rarity === 'legendary' ? 13 : L.gold ? 11 : 9, gc = L.gold ? '#f2c84a' : L.rarity === 'rare' ? '#c8d0e0' : '#8a6a3a';
        R(gc, 16 - Math.floor(gw / 2), 22, gw, 2);                                  // guard
        if (L.rarity === 'legendary') { R(gc, 10, 21, 2, 1); R(gc, 21, 21, 2, 1); }
        for (let i = 0; i < L.gems; i++) R(L.glowCol, 14 - Math.floor(L.gems / 2) + i * 1 + (i >= L.gems / 2 ? 2 : 0), 22, 1, 1);
        R('#4a3020', 15, 24, 2, 5); R('#6a4a2a', 15, 25, 2, 1); R('#6a4a2a', 15, 27, 2, 1);   // grip
        R(L.gold ? '#f2c84a' : '#8a7a6a', 14, 29, 4, 2); if (L.plus) R(L.glowCol, 15, 29, 2, 1); // pommel
      }, L.glow, L.glowCol);
    },
    axe(L) {
      return pixels(32, 32, (R) => {
        R('#4a3020', 15, 4, 2, 25); R('#6a4a2a', 15, 6, 1, 21);                          // haft
        const hw = 8 + Math.min(4, L.plus);
        R(shade(L.metal, -0.3), 17, 5, hw, 9); R(L.metal, 17, 5, hw - 1, 8); R(shade(L.metal, 0.5), 16 + hw, 6, 1, 7); // head
        R(L.gold ? '#f2c84a' : '#8a7a6a', 14, 13, 4, 2);
        for (let i = 0; i < L.gems; i++) R(L.glowCol, 19 + i, 9, 1, 1);
        if (L.affix) { R(L.glowCol, 20, 7); R(L.glowCol, 22, 11); }
        R(L.gold ? '#f2c84a' : '#8a7a6a', 15, 28, 2, 2);
      }, L.glow, L.glowCol);
    },
    spear(L) {
      return pixels(32, 32, (R) => {
        R('#6a4a2a', 15, 9, 2, 22); R('#8a6a3a', 15, 9, 1, 22);
        const tl = 6 + Math.min(4, L.plus);
        R(shade(L.metal, -0.3), 14, 9 - tl, 4, tl); R(L.metal, 15, 8 - tl, 2, tl); R(shade(L.metal, 0.5), 15, 9 - tl, 1, tl - 1);
        R(L.gold ? '#f2c84a' : '#8a7a6a', 13, 9, 6, 2);
        for (let i = 0; i < L.gems; i++) R(L.glowCol, 15, 12 + i * 2, 1, 1);
        if (L.affix) R(L.glowCol, 16, 4);
      }, L.glow, L.glowCol);
    },
    staff(L) {
      return pixels(32, 32, (R) => {
        R(L.gold ? '#8a6a2a' : '#5a3e26', 15, 9, 2, 22); R(shade(L.gold ? '#8a6a2a' : '#5a3e26', 0.25), 15, 9, 1, 22);
        R(L.gold ? '#f2c84a' : '#6a5a48', 12, 7, 8, 2); R(L.gold ? '#f2c84a' : '#6a5a48', 12, 2, 2, 6); R(L.gold ? '#f2c84a' : '#6a5a48', 18, 2, 2, 6);
        const o = 3 + Math.min(2, Math.floor(L.plus / 2));
        R(L.glowCol, 16 - Math.ceil(o / 2), 6 - o, o, o); R(shade(L.glowCol, 0.5), 16 - Math.ceil(o / 2), 6 - o, 1, 1);
        for (let i = 0; i < L.gems; i++) R(L.glowCol, 15, 12 + i * 2, 1, 1);
      }, Math.max(L.glow, 0.25), L.glowCol);
    },
    bow(L) {
      return pixels(32, 32, (R) => {
        const wood = L.wood || '#6a4a2a';
        const pts = [[20, 3], [17, 5], [15, 8], [14, 11], [13, 14], [13, 16], [13, 18], [14, 21], [15, 24], [17, 27], [20, 29]];
        for (const [x, y] of pts) { R(wood, x, y, 2, 3); R(shade(wood, 0.25), x, y, 1, 3); }
        for (let y = 4; y < 30; y++) R('#e8e2d0', 21, y);                           // string
        R(L.gold ? '#f2c84a' : shade(wood, -0.4), 19, 2, 3, 2); R(L.gold ? '#f2c84a' : shade(wood, -0.4), 19, 29, 3, 2); // tips
        R('#4a3020', 12, 14, 3, 5);                                                 // grip
        for (let i = 0; i < L.gems; i++) R(L.glowCol, 11, 14 + i, 1, 1);
        if (L.affix) { R(L.glowCol, 15, 8); R(L.glowCol, 15, 24); }
      }, L.glow, L.glowCol);
    },
    armor(L) {
      return pixels(32, 32, (R) => {
        const b = L.body, t = L.trim, m = L.gold ? '#e0b84a' : L.metal;
        R(b, 9, 7, 14, 18); R(shade(b, 0.18), 10, 8, 5, 15); R(t, 9, 24, 14, 2);    // torso
        R(t, 13, 6, 6, 2); R(shade(b, -0.3), 15, 8, 2, 16);                         // collar, seam
        R(b, 6, 8, 3, 9); R(b, 23, 8, 3, 9);                                        // sleeves
        if (L.pauldrons) { R(m, 4, 6, 7, 4); R(shade(m, 0.35), 5, 6, 5, 1); R(m, 21, 6, 7, 4); R(shade(m, 0.35), 22, 6, 5, 1); }
        R(L.gold ? '#f2c84a' : shade(t, 0.15), 9, 18, 14, 2);                     // belt
        for (let i = 0; i < Math.min(5, L.plus); i++) R(m, 11 + i * 2.5, 12, 1, 1); // rivets, one per step
        if (L.glow > 0.2 || L.crest) { R(L.glowCol, 15, 13, 2, 3); R(shade(L.glowCol, 0.4), 15, 13, 1, 1); } // emblem
        if (L.helm) { R(m, 12, 0, 8, 5); R(shade(m, 0.35), 12, 0, 8, 1); R('#1a1410', 13, 3, 6, 1); if (L.crest) R(L.glowCol, 15, -1, 2, 2); }
      }, L.glow, L.glowCol);
    },
    // A data URL for an item, cached by everything that changes its look.
    icon(it) {
      if (!it) return '';
      const L = ECHO.Gear.look(it);
      const key = [it.kind, L.wclass, L.rarity, L.plus, L.affix, L.glow.toFixed(2), L.body, L.wood, L.helm, L.pauldrons].join('|');
      if (cache.has(key)) return cache.get(key);
      const c = it.kind === 'armor' ? A.armor(L) : it.kind === 'bow' ? A.bow(L) : L.wclass === 'axe' ? A.axe(L) : L.wclass === 'spear' ? A.spear(L) : L.wclass === 'staff' ? A.staff(L) : A.sword(L);
      const url = c.toDataURL();
      cache.set(key, url);
      return url;
    },
    img(it, cls = 'gear-ic') { return it ? `<img class="${cls}" src="${A.icon(it)}" alt="">` : `<span class="${cls}"></span>`; },
    // A figure of you in your gear.
    doll(look, skin = '#e0ac85', hair = '#4a3020') {
      const key = 'doll|' + (look ? look.key : '') + skin + hair;
      if (cache.has(key)) return cache.get(key);
      const B = look && look.blade, Ar = look && look.armor, Bw = look && look.bow, rk = look && look.rank;
      const glow = Math.max(B ? B.glow : 0, Ar ? Ar.glow : 0);
      const c = pixels(30, 38, (R, g) => {
        if (rk && look.lv >= 7) { g.globalAlpha = 0.35; R(rk.color, 6, 35, 18, 2); R(rk.color, 8, 34, 14, 1); g.globalAlpha = 1; }
        const body = Ar ? Ar.body : '#2f7f86', trim = Ar ? Ar.trim : '#1f4f56', m = Ar ? (Ar.gold ? '#e0b84a' : Ar.metal) : '#8a8a92';
        R(rk ? shade(rk.color, -0.45) : '#1f4f56', 9, 12, 12, 16);                       // cape behind
        if (Bw) { R(Bw.wood || '#6a4a2a', 21, 9, 1, 14); R('#e8e2d0', 20, 10, 1, 12); }  // bow on the back
        R(trim, 11, 26, 3, 9); R(trim, 16, 26, 3, 9); R('#2a2018', 11, 34, 3, 1); R('#2a2018', 16, 34, 3, 1); // legs
        R(body, 10, 13, 10, 13); R(shade(body, 0.18), 11, 14, 3, 11); R(trim, 10, 25, 10, 1);              // body
        R(Ar && Ar.gold ? '#f2c84a' : shade(trim, 0.1), 10, 21, 10, 1);
        if (Ar) for (let i = 0; i < Math.min(5, Ar.plus); i++) R(m, 11 + i * 2, 17, 1, 1);
        if (Ar && (Ar.glow > 0.2 || Ar.crest)) R(Ar.glowCol, 14, 15, 2, 2);
        R(skin, 7, 14, 3, 8); R(skin, 20, 14, 3, 8);                                      // arms
        if (Ar && Ar.pauldrons) { R(m, 6, 12, 5, 3); R(m, 19, 12, 5, 3); R(shade(m, 0.35), 6, 12, 5, 1); R(shade(m, 0.35), 19, 12, 5, 1); }
        R(skin, 12, 5, 6, 7); R('#1a1410', 13, 8, 1, 1); R('#1a1410', 16, 8, 1, 1);         // head
        if (Ar && Ar.helm) { R(m, 11, 3, 8, 4); R(shade(m, 0.35), 11, 3, 8, 1); R(shade(m, -0.3), 11, 6, 8, 1); if (Ar.crest) R(Ar.glowCol, 14, 1, 2, 2); }
        else { R(hair, 12, 4, 6, 2); R(hair, 11, 5, 1, 3); }
        if (B) {                                                                          // sword in hand
          const len = 11 + Math.min(5, B.plus) + (B.rarity === 'legendary' ? 2 : 0);
          R(B.metal, 23, 21 - len, 1, len); R(shade(B.metal, 0.5), 23, 22 - len, 1, 2);
          R(B.gold ? '#f2c84a' : '#8a6a3a', 21, 21, 5, 1); R('#4a3020', 23, 22, 1, 2);
          for (let i = 0; i < B.gems; i++) R(B.glowCol, 23, 23 - len + 2 + i * 2);
        }
      }, glow, (B && B.glow >= (Ar ? Ar.glow : 0)) ? B.glowCol : Ar ? Ar.glowCol : '#ffffff');
      const url = c.toDataURL();
      cache.set(key, url);
      return url;
    }
  };
})();
