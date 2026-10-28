// Boot.
(function () {
  // anything that goes wrong in a button or a page is shown, not swallowed (so it can be reported)
  window.addEventListener('error', ev => { try { if (ECHO.UI && ECHO.UI.error) ECHO.UI.error(ev.error || ev.message); } catch (e) { /* (nothing more to do) */ } });
  window.addEventListener('DOMContentLoaded', async () => {
    const canvas = document.getElementById('game');
    ECHO.Input.attach(canvas);
    ECHO.Sfx.init();
    ECHO.UI.init();
    if (!(await ECHO.chooseRenderer())) {
      // no WebGL (or the models failed to load): ECHO is a 3D game and cannot run here
      const el = document.createElement('div');
      el.className = 'screen';
      el.innerHTML = '<div class="scr" style="max-width:560px;margin:12vh auto;text-align:center"><h1>ECHO</h1><p class="prose">ECHO needs 3D graphics (WebGL), and this browser or computer is not giving it any.</p><p class="dim">Turn on hardware acceleration in your browser settings, update your graphics drivers, or try another browser, then reload. Your worlds are safe and will be here when you come back.</p></div>';
      document.body.appendChild(el);
      return;
    }
    ECHO.Renderer.init(canvas);
    // Keep the frame loop alive behind menus so screens animate.
    ECHO.Game.running = true;
    ECHO.Game.lastFrame = performance.now();
    requestAnimationFrame(ECHO.Game.loop);
    // Save whenever the page might go away: closed, reloaded, replaced by a newer version, or hidden.
    const saveNow = () => { try { if (ECHO.Game.world && !ECHO.UI.screenOpen) ECHO.Game.save(); } catch (e) { console.error(e); } };
    window.addEventListener('beforeunload', saveNow);
    window.addEventListener('pagehide', saveNow);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });
    // switch away from the game and it waits for you (a setting in the menu)
    window.addEventListener('blur', () => {
      const UI = ECHO.UI;
      if (!ECHO.Game.world || !ECHO.Game.pl || UI.screenOpen || UI.pauseOpen || UI.panelOpen || UI.modalOpen || (UI.settings && UI.settings.autoPause === 'off')) return;
      try { ECHO.Screens.openPause(); } catch (e) { console.error(e); }
    });
    if (window.echoNative && window.echoNative.onBeforeClose) {
      window.echoNative.onBeforeClose(async () => {
        try { if (ECHO.Game.world) await ECHO.Game.save(); } catch (e) { console.error(e); }
        window.echoNative.closeNow();
      });
    }
    try { if (document.fonts) await document.fonts.load('16px "Pixelify Sans"'); } catch (e) { /* fonts optional */ }
    ECHO.Screens.title();
    if (ECHO.Updates) ECHO.Updates.init();
    if (window.echoNative && window.echoNative.ready) window.echoNative.ready().catch(() => {});
  });
})();
