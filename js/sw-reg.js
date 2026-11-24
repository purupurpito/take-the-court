/* =====================================================================
 * TAKE THE COURT — js/sw-reg.js (owner: ui_main; Google Play, 24-nov-2026; notes/offline.md)
 * Registra el service worker (sw.js, lo genera tools/build-pages.js) para jugar sin red tras una visita con red.
 *  - Solo en la web publicada (window.__vbBuild, lo pone build-pages) y solo en https://takethecourt.com o en localhost/127.0.0.1
 *    (tools/offlinetest.js). Nunca en file://, en el puente de la dirección antigua (bridge/ no carga este archivo) ni en otro dominio.
 *  - Se registra al acabar de cargar la página (no compite con la descarga del arranque). ?nosw=1 lo quita (desregistra y borra
 *    las cachés 'ttc-*'): salida de emergencia si un día una caché diera guerra.
 *  - VB.SW.apply(done): lo llama js/update.js al pulsar «Reiniciar» en «Hay una versión nueva». Si ya hay una versión nueva
 *    instalada y esperando, le dice que tome el control (skipWaiting) y espera al cambio (controllerchange, 4 s como mucho); si
 *    está bajando, la espera (10 s como mucho); si no se sabe de ella, pide al navegador que mire (update). Después llama a done()
 *    UNA vez (update.js recarga con ?u=). Sin service worker, done() enseguida. Solo recarga quien pulsó: no hay bucles.
 * API: VB.SW = { on (registrado), reg (registro o null), apply(done), state() → 'off'|'none'|'active'|'waiting'|'installing' }.
 * ===================================================================== */
(function () {
  'use strict';
  var VB = window.VB = window.VB || {};
  var SW = { on: false, reg: null };
  VB.SW = SW;
  var N = navigator.serviceWorker;
  var host = location.hostname, local = host === 'localhost' || host === '127.0.0.1';
  var allowed = !!N && !!window.__vbBuild && ((location.protocol === 'https:' && host === 'takethecourt.com') ||
    (local && /^https?:$/.test(location.protocol)));
  var Q = /[?&]nosw=1\b/.test(location.search);

  SW.state = function () {
    var r = SW.reg; if (!r) return SW.on ? 'none' : 'off';
    return r.waiting ? 'waiting' : r.installing ? 'installing' : r.active ? 'active' : 'none';
  };

  SW.apply = function (done) {
    var fired = false, fin = function () { if (fired) return; fired = true; try { done(); } catch (e) { } };
    var r = SW.reg;
    if (!r || !N || !N.controller) { fin(); return; }
    var go = function (w) {
      N.addEventListener('controllerchange', fin);
      setTimeout(fin, 4000);
      try { w.postMessage({ type: 'skipWaiting' }); } catch (e) { fin(); }
    };
    var wait = function (w) {
      var t = setTimeout(fin, 10000);
      w.addEventListener('statechange', function () {
        if (w.state === 'installed') { clearTimeout(t); go(w); } else if (w.state === 'redundant') { clearTimeout(t); fin(); }
      });
    };
    if (r.waiting) { go(r.waiting); return; }
    if (r.installing) { wait(r.installing); return; }
    var t0 = setTimeout(fin, 4000);
    r.update().then(function () {
      clearTimeout(t0);
      if (r.waiting) go(r.waiting); else if (r.installing) wait(r.installing); else fin();
    }, function () { clearTimeout(t0); fin(); });
  };

  if (!N) return;
  if (Q) {
    try {
      N.getRegistrations().then(function (rs) { rs.forEach(function (r) { r.unregister(); }); });
      if (window.caches) caches.keys().then(function (ks) { ks.forEach(function (k) { if (/^ttc-/.test(k)) caches.delete(k); }); });
    } catch (e) { }
    return;
  }
  if (!allowed) return;
  SW.on = true;
  var reg = function () {
    N.register('sw.js', { scope: './' }).then(function (r) { SW.reg = r; }, function (e) { try { console.warn('[VB] service worker: ' + (e && e.message)); } catch (_) { } });
  };
  if (document.readyState === 'complete') reg(); else window.addEventListener('load', reg);
})();
