/* TAKE THE COURT — sw.js (service worker; owner: ui_main; Google Play, 24-nov-2026; notes/offline.md)
 * PLANTILLA: tools/build-pages.js la copia a _site/sw.js y cambia la línea de VB_SW por la lista real (versión, caché y archivos
 * con su sha-256). En el repo (file://) no se registra nunca: lo registra js/sw-reg.js solo en https://takethecourt.com y en localhost.
 * Para qué: que el juego arranque y se juegue SIN RED después de una visita con red (la app de Google Play es una TWA sobre la web).
 *  - install: baja TODOS los archivos de la lista (index, js con ?v=, three.js, fuentes, iconos, manifest, páginas legales; los que
 *    no llevan ?v= con cache:'reload' y una marca ?sw=, que se salta la caché del navegador y la de 10 min de GitHub Pages; ver grab),
 *    comprueba el sha-256 de cada uno con el de la lista y los guarda en la caché 'ttc-<versión>-<hash>'. Si algo no cuadra (publicación a medias en la CDN), la
 *    instalación falla y el navegador lo vuelve a intentar más tarde: nunca se queda una caché mezclada.
 *  - NO hace skipWaiting al instalar: la versión nueva espera a que se cierre el juego o a que el jugador pulse «Reiniciar» en
 *    «Hay una versión nueva» (js/update.js manda {type:'skipWaiting'} y recarga). Así nunca cambia nada a mitad de partido.
 *  - activate: borra las cachés 'ttc-*' que no son la suya y toma el control de las pestañas (clients.claim).
 *  - fetch: solo contesta a peticiones GET del mismo origen que están en la lista:
 *      · páginas (index, privacidad, borrar-cuenta): primero la red (sin caché del navegador; como mucho 6 s si hay copia) y, si
 *        no hay red, la copia guardada. Lo que llega de la red NO se guarda: la copia es siempre la de esta versión;
 *      · el resto (js, three.js, fuentes, iconos): de la caché; si faltara, de la red.
 *    Todo lo demás pasa sin tocar y nunca se guarda: Firebase y Google (auth, Firestore, SDK), STUN/TURN, version.json (lo pide
 *    update.js con no-store), netlogs.html, otros orígenes y cualquier archivo que no esté en la lista.
 */
'use strict';
var VB_SW = null; /*@@VB_SW@@*/
var CACHE = VB_SW ? VB_SW.cache : 'ttc-dev';
var BASE = new URL('./', self.location.href);
var FILES = {}, PAGES = {};
(VB_SW ? VB_SW.files : []).forEach(function (f) {
  var u = new URL(f.u, BASE);
  FILES[u.pathname + u.search] = f;
  if (f.page) PAGES[u.pathname] = u.pathname + u.search;
});

function hex(buf) { var a = new Uint8Array(buf), s = ''; for (var i = 0; i < a.length; i++) s += (a[i] < 16 ? '0' : '') + a[i].toString(16); return s; }
function busted(u) { var x = new URL(u, BASE); x.searchParams.set('sw', VB_SW.hash); return x.href; }

/** Baja un archivo de la lista y comprueba su sha-256. Los que llevan ?v=<hash> (js, vendor) o un nombre fijo (woff2) se piden
 *  primero normal (si el navegador ya los tiene de esta visita, no se bajan otra vez); si no cuadran, o para el resto (index,
 *  páginas, iconos, manifest), con cache:'reload' y ?sw=<hash> (ni la caché del navegador ni la de GitHub Pages). */
function grab(f, fresh) {
  var plain = !fresh && (/[?&]v=/.test(f.u) || /\.woff2$/.test(f.u));
  return fetch(plain ? new URL(f.u, BASE).href : busted(f.u), { cache: plain ? 'default' : 'reload', credentials: 'same-origin' }).then(function (r) {
    if (!r.ok || r.status !== 200) throw new Error('sw: ' + f.u + ' ' + r.status);
    var type = r.headers.get('content-type') || '';
    return r.arrayBuffer().then(function (b) {
      return crypto.subtle.digest('SHA-256', b).then(function (d) {
        if (hex(d) !== f.h) { if (plain) return grab(f, true); throw new Error('sw: ' + f.u + ' no es el de esta versión'); }
        var h = new Headers(); if (type) h.set('content-type', type);
        return new Response(b, { status: 200, statusText: 'OK', headers: h });
      });
    });
  });
}

self.addEventListener('install', function (e) {
  if (!VB_SW) return;
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(VB_SW.files.map(function (f) {
      return grab(f, false).then(function (r) { return c.put(new URL(f.u, BASE).href, r); });
    }));
  }).catch(function (err) { return caches.delete(CACHE).then(function () { throw err; }); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return /^ttc-/.test(k) && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'skipWaiting') self.skipWaiting();
});

function fromCache(key) { return caches.open(CACHE).then(function (c) { return c.match(key); }); }

/** Página: red primero (revalidando), copia si no hay red o tarda más de 6 s y hay copia. */
function page(req, key) {
  var href = new URL(key, self.location.origin).href;
  return fromCache(href).then(function (copy) {
    var net = fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(function (r) {
      if (r.redirected) return fetch(req);           // (una respuesta redirigida no vale para una navegación)
      if (!r.ok && copy) return copy;                // 404/5xx de la web con copia buena: la copia
      return r;
    });
    if (!copy) return net;
    return new Promise(function (ok) {
      var done = false, t = setTimeout(function () { if (!done) { done = true; ok(copy); } }, 6000);
      net.then(function (r) { if (!done) { done = true; clearTimeout(t); ok(r); } },
        function () { if (!done) { done = true; clearTimeout(t); ok(copy); } });
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (!VB_SW || req.method !== 'GET') return;
  var u = new URL(req.url);
  if (u.origin !== self.location.origin) return;
  var key = u.pathname + u.search;
  if (req.mode === 'navigate') {
    var p = u.pathname; if (p.slice(-1) === '/') p += 'index.html';
    if (PAGES[p]) e.respondWith(page(req, PAGES[p]));
    return;
  }
  if (!FILES[key] || FILES[key].page) return;
  e.respondWith(fromCache(new URL(key, self.location.origin).href).then(function (r) { return r || fetch(req); }));
});
