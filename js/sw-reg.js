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
 *  - Versión que ya corre la página: si el service worker que espera es el de este mismo build (le pregunta {type:'hash'} y lo
 *    compara con window.__vbBuild.sw, lo pone build-pages), lo activa enseguida sin recargar. Tras publicar, la carga con red trae
 *    el index nuevo; sin esto, una recarga sin red serviría el index VIEJO guardado (y su código de partidas guardadas).
 *  - Si la instalación falla (un archivo que no cuadra) y la página no tiene service worker: aviso en la consola y no se
 *    reintenta en 12 h (localStorage 'ttc.swfail'), para no bajar el index y las páginas en cada carga.
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
  var warn = function (m) { try { console.warn('[VB] service worker: ' + m); } catch (_) { } };
  // Si la instalación falló hace poco (un archivo que no cuadra: p. ej. algo que reescribe el HTML por el camino) y la página no
  // tiene service worker, no se reintenta en cada carga (bajaría el index y las páginas otra vez cada vez): como mucho cada 12 h.
  var FAILK = 'ttc.swfail', ls = function (v) { try { if (v === undefined) return +localStorage.getItem(FAILK) || 0; if (v) localStorage.setItem(FAILK, String(v)); else localStorage.removeItem(FAILK); } catch (_) { } return 0; };
  if (!N.controller && Date.now() - ls() < 12 * 3600e3) { SW.on = false; warn('la última instalación falló; se reintenta más tarde'); return; }
  // Un service worker nuevo que espera y es el de la versión que ya corre esta página (la página vino de la red tras publicar):
  // se activa enseguida, sin recargar. Si no, una recarga sin red (o la que hace Android con la app) volvería al index anterior
  // guardado. Uno de OTRA versión sigue esperando a «Reiniciar» (js/update.js → SW.apply).
  var mine = window.__vbBuild && window.__vbBuild.sw;
  var ask = function (w, cb) {
    if (!window.MessageChannel) { cb(null); return; }
    var ch = new MessageChannel(), t = setTimeout(function () { cb(null); }, 3000);
    ch.port1.onmessage = function (e) { clearTimeout(t); cb(e.data && e.data.hash); };
    try { w.postMessage({ type: 'hash' }, [ch.port2]); } catch (e) { clearTimeout(t); cb(null); }
  };
  var same = function (r) {
    var w = r.waiting; if (!w || !mine || !N.controller) return;
    ask(w, function (h) { if (h === mine && r.waiting === w) { try { w.postMessage({ type: 'skipWaiting' }); } catch (e) { } } });
  };
  var follow = function (r, w) {
    if (!w) return;
    w.addEventListener('statechange', function () {
      if (w.state === 'installed') { ls(0); same(r); }
      else if (w.state === 'redundant' && !r.waiting && !r.active) { ls(Date.now()); warn('la instalación falló (algún archivo no es el de esta versión)'); }
    });
  };
  var reg = function () {
    N.register('sw.js', { scope: './' }).then(function (r) {
      SW.reg = r;
      if (r.active && !r.installing) ls(0);
      same(r); follow(r, r.installing);
      r.addEventListener('updatefound', function () { follow(r, r.installing); });
    }, function (e) { warn(e && e.message); });
  };
  if (document.readyState === 'complete') reg(); else window.addEventListener('load', reg);
})();
