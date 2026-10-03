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
        if (['Tab', ' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
      });
      window.addEventListener('keyup', e => {
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        In.down.delete(k); In.released.add(k);
      });
      window.addEventListener('blur', () => { In.down.clear(); In.mdown = [false, false, false]; });
      el.addEventListener('mousemove', e => { In.mx = e.clientX; In.my = e.clientY; });
      el.addEventListener('mousedown', e => { In.mdown[e.button] = true; In.mpressed[e.button] = true; });
      window.addEventListener('mouseup', e => { if (In.mdown[e.button]) In.mreleased[e.button] = true; In.mdown[e.button] = false; });
      el.addEventListener('contextmenu', e => e.preventDefault());
      el.addEventListener('wheel', e => { In.wheel += Math.sign(e.deltaY); }, { passive: true });
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
