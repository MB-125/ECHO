// Keyboard and mouse state.
(function () {
  const In = ECHO.Input = {
    down: new Set(), pressed: new Set(), released: new Set(),
    mx: 0, my: 0, mdown: [false, false, false], mpressed: [false, false, false], mreleased: [false, false, false],
    wheel: 0, enabled: true,
    attach(el) {
      window.addEventListener('keydown', e => {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        if (!In.down.has(k)) In.pressed.add(k);
        In.down.add(k);
        if (['Tab', ' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F1', '/'].includes(e.key)) e.preventDefault();
      });
      window.addEventListener('keyup', e => {
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        In.down.delete(k); In.released.add(k);
      });
      window.addEventListener('blur', () => { In.down.clear(); In.mdown = [false, false, false]; });
      el.addEventListener('mousemove', e => { In.mx = e.clientX; In.my = e.clientY; });
      el.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); In.mdown[e.button] = true; In.mpressed[e.button] = true; });
      window.addEventListener('mouseup', e => { if (In.mdown[e.button]) In.mreleased[e.button] = true; In.mdown[e.button] = false; });
      el.addEventListener('contextmenu', e => e.preventDefault());
      el.addEventListener('wheel', e => { In.wheel += Math.sign(e.deltaY); }, { passive: true });
    },
    // ------------------------------------------------------------ gamepads
    // A standard controller drives the same keys and buttons as the keyboard
    // and mouse: sticks move and aim, the rest map onto actions.
    padName: null, padAim: null, padPrev: [], padKeys: new Set(),
    PAD: { 0: ' ', 1: 'e', 2: 'g', 3: 'q', 4: 'r', 5: 'Shift', 7: 'M0', 6: 'M2', 8: 'Tab', 9: 'Escape', 10: 'Control', 11: 'v', 12: 'm', 13: 'k', 14: '1', 15: 'j' },
    pollPad() {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = [...(pads || [])].find(p => p && p.connected);
      if (!gp) { if (In.padName) { In.padName = null; for (const k of In.padKeys) In.down.delete(k); In.padKeys.clear(); In.padAim = null; } return; }
      if (!In.padName) { In.padName = gp.id.replace(/\(.*\)/, '').trim() || 'Controller'; if (ECHO.UI && ECHO.UI.toast) ECHO.UI.toast(`Controller connected: ${In.padName}. Settings in the menu (Start).`, 'info', 4); }
      const ui = ECHO.UI, panel = ui && ui.panelOpen;
      // buttons
      gp.buttons.forEach((b, i) => {
        const on = b.pressed || b.value > 0.5, was = !!In.padPrev[i];
        In.padPrev[i] = on;
        let k = In.PAD[i]; if (!k) return;
        if (panel && i === 1) k = 'Escape';             // B backs out of menus
        if (on === was) return;
        if (k === 'M0' || k === 'M2') { const m = k === 'M0' ? 0 : 2; In.mdown[m] = on; if (on) In.mpressed[m] = true; else In.mreleased[m] = true; return; }
        if (k === 'Control') { if (on) { if (In.down.has('Control')) In.down.delete('Control'); else In.down.add('Control'); } return; }
        if (on) { In.pressed.add(k); In.down.add(k); In.padKeys.add(k); } else { In.down.delete(k); In.released.add(k); In.padKeys.delete(k); }
        // the modal's first choice answers to A
        if (on && i === 0 && ui && ui.modalOpen) { const btn = document.querySelector('#modal:not(.hidden) .modal-choices button'); if (btn) btn.click(); }
      });
      // left stick: movement as WASD
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0, dz = 0.35;
      const set = (k, v) => { if (v) { if (!In.down.has(k)) In.pressed.add(k); In.down.add(k); In.padKeys.add(k); } else if (In.padKeys.has(k)) { In.down.delete(k); In.padKeys.delete(k); } };
      set('a', ax < -dz); set('d', ax > dz); set('w', ay < -dz); set('s', ay > dz);
      // right stick: aim (or face where you walk)
      const rx = gp.axes[2] || 0, ry = gp.axes[3] || 0;
      if (Math.hypot(rx, ry) > 0.3) In.padAim = Math.atan2(ry, rx);
      else if (Math.hypot(ax, ay) > dz) In.padAim = Math.atan2(ay, ax);
    },
    key(k) { return In.enabled && In.down.has(k); },
    hit(k) { return In.enabled && In.pressed.has(k); },
    endFrame() {
      In.pressed.clear(); In.released.clear();
      In.mpressed = [false, false, false]; In.mreleased = [false, false, false];
      In.wheel = 0;
    },
    clear() { In.down.clear(); In.mdown = [false, false, false]; }
  };
})();
