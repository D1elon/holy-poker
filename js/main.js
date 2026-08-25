// ============ HOLY POKER — bootstrap ============
(async function () {
  HP.save.load();

  // wait for pixel fonts so canvas text sprites render crisp
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('17px PressStart'),
        document.fonts.load('20px VT323'),
      ]),
      HP.util.wait(1500),
    ]);
  } catch (e) { /* fall back to system fonts */ }

  HP.scene.init(document.getElementById('game-canvas'));
  HP.game.bindScene();
  HP.ui.init();
  HP.scene.menuMode();
  HP.ui.refreshMenu();
  HP.ui.showScreen('menu');

  // iOS reports stale dimensions right at orientationchange — resize after settle
  window.addEventListener('orientationchange', () => {
    setTimeout(HP.scene.applySize, 350);
  });

  // iOS long-press: block the selection highlight / magnifier / callout on the
  // game canvas (long-press is our "inspect card" gesture)
  const gc = document.getElementById('game-canvas');
  gc.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
  gc.addEventListener('contextmenu', e => e.preventDefault());

  // offline home-screen play (http(s) only; the Electron build loads via file://).
  // Skipped on localhost so dev edits are never served from a stale cache —
  // the phone reaches us via the LAN IP and still gets full offline caching.
  const isLocalDev = ['localhost', '127.0.0.1'].includes(location.hostname);
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    if (isLocalDev) {
      navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
      if (window.caches) caches.keys().then(ks => ks.forEach(k => caches.delete(k)));
    } else {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }
})();
