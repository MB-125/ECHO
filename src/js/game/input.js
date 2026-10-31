// Keyboard and mouse state.
(function () {
  const In = ECHO.Input = {
    down: new Set(), pressed: new Set(), released: new Set(),
    mx: 0, my: 0, mdown: [false, false, false], mpressed: [false, false, false], mreleased: [false, false, false],
    wheel: 0, enabled: true,
    // ---- the keys, as you have set them (menu → Keys). The game asks for an action's own key
    // ('q' for fire); the key you press is turned into it here.
    ACTIONS: [
      ['w', 'Move up'], ['a', 'Move left'], ['s', 'Move down'], ['d', 'Move right'], [' ', 'Dodge roll'], ['Shift', 'Guard · fly fast'], ['Control', 'Sneak · fly lower'],
      ['q', 'Fire (hold) · dragon dive'], ['r', 'Lock on'], ['e', 'Talk · enter · use · tame'], ['f', 'Study · dragon\'s art'], ['z', 'Relic 1'], ['x', 'Relic 2'], ['c', 'Relic 3'],
      ['1', 'Healing draught'], ['h', 'Eat'], ['g', 'Herbs'], ['b', 'Make camp'], ['v', 'Ride · fly'], ['y', 'Switch animal'], ['u', 'Tamed beasts'], ['o', 'Call your pack'], ['l', 'Taming: breath / leash / kill'],
      ['t', 'Orders for a companion'], ['p', 'Play'], ['Tab', 'Journal'], ['j', 'Guide'], ['m', 'Map'], ['k', 'Character'], ['n', 'Where to?']
    ],
    remap: new Map(), dead: new Set(),
    keyName(k) { return k === ' ' ? 'Space' : k === 'Control' ? 'Ctrl' : k.length === 1 ? k.toUpperCase() : k; },
    bound(act) { const s = (ECHO.UI && ECHO.UI.settings && ECHO.UI.settings.keys) || {}; return s[act] || act; },
    applyBinds() {
      In.remap = new Map(); In.dead = new Set();
      for (const [act] of In.ACTIONS) { const k = In.bound(act); if (k !== act) { In.remap.set(k, act); In.dead.add(act); } }
      for (const k of In.remap.keys()) In.dead.delete(k);
      In.down.clear();
    },
    // set an action's key; whatever had that key takes this one's old key
    rebind(act, key) {
      const UI = ECHO.UI, s = UI.settings.keys = UI.settings.keys || {};
      const old = In.bound(act), other = In.ACTIONS.find(([a]) => a !== act && In.bound(a) === key);
      s[act] = key; if (other) s[other[0]] = old;
      for (const k of Object.keys(s)) if (s[k] === k) delete s[k];
      try { localStorage.setItem('echo.settings', JSON.stringify(UI.settings)); } catch (e) { /* ignore */ }
      In.applyBinds();
    },
    resetBinds() { const UI = ECHO.UI; UI.settings.keys = {}; try { localStorage.setItem('echo.settings', JSON.stringify(UI.settings)); } catch (e) { /* ignore */ } In.applyBinds(); },
    logical(k) { if (In.remap.has(k)) return In.remap.get(k); if (In.dead.has(k)) return null; return k; },
    attach(el) {
      window.addEventListener('keydown', e => {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
        if (In.capture) { e.preventDefault(); e.stopImmediatePropagation(); const f = In.capture; In.capture = null; f(e.key.length === 1 ? e.key.toLowerCase() : e.key); return; }
        const k = In.logical(e.key.length === 1 ? e.key.toLowerCase() : e.key);
        if (k == null) return;
        if (!In.down.has(k)) In.pressed.add(k);
        In.down.add(k);
        if (['Tab', ' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F1', '/'].includes(e.key)) e.preventDefault();
      });
      window.addEventListener('keyup', e => {
        const k = In.logical(e.key.length === 1 ? e.key.toLowerCase() : e.key);
        if (k == null) return;
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
    CHORD: { 0: 'o', 2: 'z', 3: 'x', 1: 'c' },
    PAD: { 0: ' ', 1: 'e', 2: 'g', 3: 'q', 4: 'r', 5: 'Shift', 7: 'M0', 6: 'M2', 8: 'Tab', 9: 'Escape', 10: 'Control', 11: 'v', 12: 'm', 13: 'k', 14: '1', 15: 'j' },
    pollPad() {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = [...(pads || [])].find(p => p && p.connected);
      if (!gp) { if (In.padName) { In.padName = null; for (const k of In.padKeys) In.down.delete(k); In.padKeys.clear(); In.padAim = null; } return; }
      if (!In.padName) { In.padName = gp.id.replace(/\(.*\)/, '').trim() || 'Controller'; if (ECHO.UI && ECHO.UI.toast) ECHO.UI.toast(`Controller connected: ${In.padName}. Settings in the menu (Start).`, 'info', 4); }
      const ui = ECHO.UI, panel = ui && ui.panelOpen;
      // a menu is open: the controller walks its buttons (B and Start still go back)
      const now = performance.now(), pdt = Math.min(0.1, (now - (In._padT || now)) / 1000); In._padT = now;
      if (ECHO.PadNav && ECHO.PadNav.active()) {
        const prev = In.padPrev.slice();
        gp.buttons.forEach((b, i) => {
          const on = b.pressed || b.value > 0.5, was = !!In.padPrev[i];
          In.padPrev[i] = on;
          if (on && !was && (i === 1 || i === 9)) In.pressed.add('Escape');
          if (on && !was && i === 8 && ui.panelOpen) In.pressed.add('Escape');
        });
        for (const k of [...In.padKeys]) { In.down.delete(k); In.padKeys.delete(k); }
        In.mdown[0] = In.mdown[2] = false; In._lb = null;
        ECHO.PadNav.pad(gp, prev, pdt);
        return;
      }
      // buttons
      // LB is a shift key too: tapped alone it locks on; held, A/X/Y/B call your pack and wake your relics
      const lbOn = !!(gp.buttons[4] && (gp.buttons[4].pressed || gp.buttons[4].value > 0.5));
      gp.buttons.forEach((b, i) => {
        const on = b.pressed || b.value > 0.5, was = !!In.padPrev[i];
        In.padPrev[i] = on;
        if (i === 4 && !panel) {
          if (on && !was) In._lb = { used: false };
          if (!on && was) { if (In._lb && !In._lb.used) { In.pressed.add('r'); } In._lb = null; }
          return;
        }
        if (lbOn && !panel && In._lb && In.CHORD[i] && on && !was) { In._lb.used = true; In.pressed.add(In.CHORD[i]); return; }
        if (lbOn && !panel && In._lb && In.CHORD[i]) return;
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
