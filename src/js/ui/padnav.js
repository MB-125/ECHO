// Menus with a controller: whenever a menu, a window or a title screen is open, the
// D-pad or left stick moves a lit frame from button to button (to the nearest one in
// that direction), A presses it, B goes back, LB / RB turn the page of a tabbed window
// and the right stick scrolls. The mouse is never affected: nothing is lit until the
// controller is used.
(function () {
  const PN = ECHO.PadNav = {
    cur: null, hold: null, holdT: 0, lastMove: 0,
    SEL: 'button, [data-tab], input, select, textarea, a[href], .pal-card, [data-pick], .clickable',
    active() { const UI = ECHO.UI; return !!(UI && (UI.modalOpen || UI.panelOpen || UI.screenOpen)); },
    root() {
      const UI = ECHO.UI;
      const m = document.querySelector('#modal:not(.hidden)');
      if (UI.modalOpen && m) return m;
      const p = document.querySelector('#panel:not(.hidden)');
      if (UI.panelOpen && p) return p;
      const s = document.querySelector('#screen:not(.hidden)');
      if (s) return s;
      return m || p || null;
    },
    items(root) {
      const vw = innerWidth, vh = innerHeight;
      return [...root.querySelectorAll(PN.SEL)].filter(el => {
        if (el.disabled || el.closest('.hidden') || el.getAttribute('aria-hidden') === 'true') return false;
        const r = el.getBoundingClientRect();
        return r.width > 2 && r.height > 2 && r.right > 0 && r.left < vw && r.bottom > -vh && r.top < vh * 2;
      });
    },
    valid(el) { const root = PN.root(); return !!(el && root && root.contains(el) && el.isConnected && !el.disabled && el.getBoundingClientRect().width > 2); },
    clear() { for (const el of document.querySelectorAll('.pad-focus')) el.classList.remove('pad-focus'); PN.cur = null; },
    set(el) {
      if (PN.cur && PN.cur !== el) PN.cur.classList.remove('pad-focus');
      PN.cur = el;
      if (!el) return;
      el.classList.add('pad-focus');
      try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { /* old engines */ }
      if (el.matches('input, select, textarea')) { try { el.focus({ preventScroll: true }); } catch (e) { /* fine */ } }
    },
    // the first thing worth pressing: a primary button, the chosen tab, or simply the first
    first(root) {
      const list = PN.items(root);
      const body = list.filter(b => !b.closest('header') && !b.classList.contains('close'));
      return body.find(b => b.classList.contains('primary')) || body.find(b => b.matches('.modal-choices button')) || body.find(b => b.matches('.tabs button.on')) || body.find(b => !b.closest('.tabs')) || body[0] || list[0] || null;
    },
    move(dx, dy) {
      const root = PN.root();
      if (!root) return;
      if (!PN.valid(PN.cur)) { PN.set(PN.first(root)); return; }
      const a = PN.cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
      let best = null, bs = Infinity;
      for (const el of PN.items(root)) {
        if (el === PN.cur) continue;
        const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
        const along = (x - ax) * dx + (y - ay) * dy;
        if (along <= 2) continue;
        // overlap on the cross axis counts as straight ahead
        const cross = dx ? Math.max(0, Math.max(r.top, a.top) - Math.min(r.bottom, a.bottom)) || Math.abs(y - ay) * 0.15 : Math.max(0, Math.max(r.left, a.left) - Math.min(r.right, a.right)) || Math.abs(x - ax) * 0.15;
        if (cross > along * 3 + 40) continue;   // (too far off to the side to be 'that way')
        const score = along + cross * 2.5;
        if (score < bs) { bs = score; best = el; }
      }
      if (best) { PN.set(best); if (ECHO.Sfx && ECHO.Sfx.play) try { ECHO.Sfx.play('tick'); } catch (e) { /* no tick */ } }
    },
    press() {
      const root = PN.root();
      if (!root) return false;
      if (!PN.valid(PN.cur)) { const f = PN.first(root); if (!f) return false; PN.set(f); }
      const el = PN.cur;
      if (el.matches('input[type=range]')) return true;
      if (el.matches('input, textarea')) { el.focus(); return true; }
      el.click();
      // what was pressed may have redrawn the window: find our place again
      setTimeout(() => { if (!PN.valid(PN.cur)) { const r = PN.root(); PN.clear(); if (r) PN.set(PN.first(r)); } }, 60);
      return true;
    },
    tab(step) {
      const root = PN.root();
      if (!root) return;
      const tabs = [...root.querySelectorAll('.tabs')][0];
      if (!tabs) return;
      const bs = [...tabs.querySelectorAll('button')];
      const i = bs.findIndex(b => b.classList.contains('on'));
      const nb = bs[(Math.max(0, i) + step + bs.length) % bs.length];
      if (nb) { nb.click(); setTimeout(() => { const r = PN.root(); PN.clear(); if (r) { const t = [...r.querySelectorAll('.tabs button.on')][0]; PN.set(t || PN.first(r)); } }, 60); }
    },
    scroll(v) {
      const root = PN.root();
      if (!root) return;
      const body = root.querySelector('.panel-body, .modal-body') || root;
      body.scrollTop += v;
    },
    // called by the controller poll; returns true when the menu took the input
    pad(gp, prev, dt) {
      if (!PN.active()) { if (PN.cur) PN.clear(); return false; }
      const btn = i => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5));
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      const dir = btn(12) || ay < -0.55 ? [0, -1] : btn(13) || ay > 0.55 ? [0, 1] : btn(14) || ax < -0.55 ? [-1, 0] : btn(15) || ax > 0.55 ? [1, 0] : null;
      const key = dir ? dir.join(',') : null;
      if (key !== PN.hold) { PN.hold = key; PN.holdT = 0.38; if (dir) PN.move(dir[0], dir[1]); }
      else if (dir) { PN.holdT -= dt; if (PN.holdT <= 0) { PN.holdT = 0.11; PN.move(dir[0], dir[1]); } }
      if (btn(0) && !prev[0]) PN.press();
      if (btn(4) && !prev[4]) PN.tab(-1);
      if (btn(5) && !prev[5]) PN.tab(1);
      const ry = gp.axes[3] || 0;
      if (Math.abs(ry) > 0.25) PN.scroll(ry * 900 * dt);
      return true;
    }
  };
})();
