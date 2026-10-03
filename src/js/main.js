// Boot.
(function () {
  window.addEventListener('DOMContentLoaded', async () => {
    const canvas = document.getElementById('game');
    ECHO.Input.attach(canvas);
    ECHO.Renderer.init(canvas);
    ECHO.UI.init();
    // Keep the frame loop alive behind menus so screens animate.
    ECHO.Game.running = true;
    ECHO.Game.lastFrame = performance.now();
    requestAnimationFrame(ECHO.Game.loop);
    window.addEventListener('beforeunload', () => { if (ECHO.Game.world) ECHO.Game.save(); });
    if (window.echoNative && window.echoNative.onBeforeClose) {
      window.echoNative.onBeforeClose(async () => {
        try { if (ECHO.Game.world) await ECHO.Game.save(); } catch (e) { console.error(e); }
        window.echoNative.closeNow();
      });
    }
    try { if (document.fonts) await document.fonts.load('16px "Pixelify Sans"'); } catch (e) { /* fonts optional */ }
    ECHO.Screens.title();
  });
})();
