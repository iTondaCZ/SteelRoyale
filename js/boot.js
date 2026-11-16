// Classic (non-module) script that runs before the game code.
// If the game can't start, it says why on the start screen instead of
// showing "Loading…" forever.
(function () {
  var loading = document.getElementById('loading');
  var play = document.getElementById('play');
  var failed = false;

  function fail(message) {
    if (failed || window.__steelReady) return;
    failed = true;
    loading.textContent = message;
    loading.className = 'loading error';
    play.disabled = true;
  }
  window.__steelBootFail = fail;

  // Browsers refuse to run the game's JavaScript modules from a file:// page.
  if (location.protocol === 'file:') {
    fail(
      'This page was opened as a file, so the browser blocks the game code. ' +
        'Start the game with play.bat (or run: node server.js) and open http://localhost:8080',
    );
    return;
  }

  window.addEventListener('error', function (e) {
    fail('The game could not start: ' + (e && e.message ? e.message : 'unknown error'));
  });
  window.addEventListener('unhandledrejection', function (e) {
    var reason = e && e.reason;
    fail('The game could not start: ' + (reason && reason.message ? reason.message : String(reason)));
  });
})();
