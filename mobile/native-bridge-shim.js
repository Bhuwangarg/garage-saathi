/* Native-only glue. Loaded before db.js/sync.js/app.js in the packaged app, and never
   shipped to GitHub Pages — the web build does not include this file.

   The rule here is: adapt the platform to the app, not the app to the platform.
   app.js keeps calling navigator.geolocation; this file makes that call go through
   Capacitor so Android/iOS runtime permission prompts actually appear. */
(function () {
  'use strict';

  var Cap = window.Capacitor;
  if (!Cap || !Cap.isNativePlatform || !Cap.isNativePlatform()) return;
  var P = Cap.Plugins || {};

  /* ---- geolocation -------------------------------------------------------
     WKWebView and Android WebView both refuse navigator.geolocation unless the
     host app brokers the permission. app.js calls getCurrentPosition in three
     places (garage setup capture, attendance check-in, attendance check-out);
     rather than edit all three, replace the API with one that resolves through
     the plugin and returns the same {coords:{latitude,longitude,accuracy}} shape. */
  if (P.Geolocation) {
    var nativeGeo = {
      getCurrentPosition: function (success, error, options) {
        var opts = options || {};
        P.Geolocation.requestPermissions()
          .catch(function () { /* older plugin builds resolve permissions implicitly */ })
          .then(function () {
            return P.Geolocation.getCurrentPosition({
              enableHighAccuracy: opts.enableHighAccuracy !== false,
              timeout: opts.timeout || 10000,
              maximumAge: opts.maximumAge || 0,
            });
          })
          .then(function (pos) { success(pos); })
          .catch(function (err) {
            if (!error) return;
            // Mirror the web PositionError codes app.js may branch on.
            var msg = (err && err.message) || String(err);
            error({ code: /denied|permission/i.test(msg) ? 1 : 2, message: msg });
          });
      },
      watchPosition: function () { return 0; },
      clearWatch: function () {},
    };
    try {
      Object.defineProperty(navigator, 'geolocation', { value: nativeGeo, configurable: true });
    } catch (e) {
      // Some WebViews leave navigator.geolocation non-configurable; patching the
      // single method we use is enough.
      try { navigator.geolocation.getCurrentPosition = nativeGeo.getCurrentPosition; } catch (e2) {}
    }
  }

  /* ---- camera -------------------------------------------------------------
     Same problem as geolocation, one layer down: the attendance selfie calls
     navigator.mediaDevices.getUserMedia, and a WebView only opens the camera
     once the *app* holds the OS camera grant. Ask for it lazily — on the first
     getUserMedia rather than at launch — so opening the app does not greet the
     user with permission dialogs they have no context for yet. */
  if (P.Camera && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    var rawGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    var camAsked = false;
    navigator.mediaDevices.getUserMedia = function (constraints) {
      if (camAsked) return rawGUM(constraints);
      camAsked = true;
      return P.Camera.requestPermissions({ permissions: ['camera'] })
        .catch(function () { /* denied or unsupported — let getUserMedia report it */ })
        .then(function () { return rawGUM(constraints); });
    };
  }

  /* ---- status bar + splash ---------------------------------------------- */
  if (P.StatusBar) {
    P.StatusBar.setStyle({ style: 'DARK' }).catch(function () {});
    P.StatusBar.setBackgroundColor({ color: '#0f1720' }).catch(function () {});
  }
  window.addEventListener('load', function () {
    if (P.SplashScreen) setTimeout(function () { P.SplashScreen.hide().catch(function () {}); }, 250);
  });

  /* ---- Android hardware back --------------------------------------------
     Default Capacitor behaviour on back at the root view is to close the app.
     Garage Saathi is a single-page app driven by in-page navigation, so hand the
     button to history first and only exit when there is nothing left to pop. */
  if (P.App) {
    P.App.addListener('backButton', function (ev) {
      if (ev && ev.canGoBack) { window.history.back(); return; }
      if (window.history.length > 1) { window.history.back(); return; }
      P.App.exitApp();
    });
  }

  /* ---- surface the platform to the app ---------------------------------- */
  document.documentElement.setAttribute('data-native', Cap.getPlatform ? Cap.getPlatform() : 'native');
})();
