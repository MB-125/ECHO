// Boot.
(function () {
  window.addEventListener('DOMContentLoaded', async () => {
    const canvas = document.getElementById('game');
    ECHO.Input.attach(canvas);
    ECHO.Sfx.init();
    ECHO.UI.init();
    await ECHO.chooseRenderer();
    ECHO.Renderer.init(canvas);
    if (!ECHO.render3d) document.getElementById('overlay').style.display = 'none';
    // Keep the frame loop alive behind menus so screens animate.
    ECHO.Game.running = true;
    ECHO.Game.lastFrame = performance.now();
    requestAnimationFrame(ECHO.Game.loop);
    // Save whenever the page might go away: closed, reloaded, replaced by a newer version, or hidden.
    const saveNow = () => { try { if (ECHO.Game.world && !ECHO.UI.screenOpen) ECHO.Game.save(); } catch (e) { console.error(e); } };
    window.addEventListener('beforeunload', saveNow);
    window.addEventListener('pagehide', saveNow);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });
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
