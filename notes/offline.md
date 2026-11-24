# Jugar sin red (service worker) — 24-nov-2026, rama playstore

Para la app de Google Play (TWA sobre https://takethecourt.com, `notes/playstore/`): después de UNA visita con red, el juego arranca
y se juega sin conexión (Partido rápido, Carrera, Entrenamiento, todo menos el online y la cuenta). Antes no cargaba sin red.

## Piezas

| Archivo | Qué hace |
|---|---|
| `vendor/` | three.js r149 y las fuentes, servidas por el juego (antes cdnjs y Google Fonts). Ver `vendor/README.md`. |
| `sw.js` | PLANTILLA del service worker. En el repo no hace nada (`VB_SW = null`). |
| `tools/build-pages.js` | Copia `vendor/` y escribe `_site/sw.js` con la lista de archivos (index, js del index con `?v=`, vendor, woff2 de `fonts.css`, iconos, manifest, `privacidad.html`, `borrar-cuenta.html`) y el sha-256 de cada uno. Caché `ttc-<VB.VERSION>-<hash de la lista>` (cada build estrena caché: el index lleva la fecha del build). |
| `js/sw-reg.js` | Registra `sw.js` al acabar de cargar, SOLO en la web publicada (`window.__vbBuild`) y en `https://takethecourt.com` o `localhost`/`127.0.0.1`. Nunca en file://. `?nosw=1` lo desregistra y borra las cachés `ttc-*` (salida de emergencia). API `VB.SW`. |
| `js/update.js` | «Reiniciar» de «Hay una versión nueva» llama a `VB.SW.apply()` antes de recargar con `?u=`. |
| `tools/offlinetest.js` | La prueba (ver abajo). |

## Cómo se comporta

- **Instalar**: baja la lista entera y comprueba el sha-256 de cada archivo. Los que llevan `?v=` (y los woff2) se piden normal
  (si ya están en la caché del navegador no se bajan otra vez); el resto, con `cache:'reload'` y `?sw=<hash>` para saltarse la caché
  de 10 min de GitHub Pages. Si un archivo no cuadra (publicación a medias en la CDN), la instalación falla y se borra esa caché; el
  navegador lo reintenta en la siguiente visita. Nunca queda una caché mezclada.
- **Sin skipWaiting al instalar**: la versión nueva espera. Se activa al cerrar el juego (en la app, cuando Android la cierra) o al
  pulsar «Reiniciar» (`VB.SW.apply`: manda `{type:'skipWaiting'}` a la que espera, o la espera si está bajando, o pide `update()`;
  después de `controllerchange` o 4 s, recarga una sola vez). update.js ya no enseña la hoja durante un partido, así que nada cambia
  a mitad de partido. Nadie más recarga: no hay bucles.
- **activate**: borra las cachés `ttc-*` que no son la suya y hace `clients.claim()`.
- **fetch**: solo contesta GET del mismo origen que están en la lista.
  - Páginas (index, privacidad, borrar-cuenta; cualquier `?…`, p. ej. `?u=` o `?sala=`): primero la red con `cache:'no-cache'`
    (revalida); si no hay red, falla o tarda más de 6 s, la copia guardada. Lo que llega de la red NO se guarda: la copia es siempre
    la de su versión. Si con red llega un index más nuevo que el service worker activo, sus js con `?v=` nuevos van a la red (no
    están en la caché vieja) y los iguales salen de la caché: siempre una versión entera.
  - El resto de la lista: de la caché (y de la red si faltara).
  - Todo lo demás pasa sin tocar y NUNCA se guarda: Firebase/Google (auth, Firestore, SDK de gstatic), STUN/TURN (no son HTTP),
    `version.json` (update.js lo pide con `no-store`), `netlogs.html`, `.well-known/`, otros orígenes, respuestas que no son 200.
- **El puente** (`bridge/`, purupurpito.github.io/make-the-cut) no carga `sw-reg.js` y no tiene `sw.js`; es otro origen.

## Qué sigue necesitando red

El online, la cuenta y la nube (Firebase), «Entrar con Google» (SDK de gstatic, se carga al pulsar) y el aviso de versión nueva.
Sin red todo eso falla como antes, con sus mensajes.

## Prueba

`node tools/offlinetest.js` (unos 2 min): dos builds (la del repo y otra con una versión falsa más nueva), servidor local tipo
Pages (`max-age=600`), Chrome con todo lo que no es localhost bloqueado. Comprueba: lista y caché, nada de fuera al arrancar,
SIN RED (servidor apagado + `Network.emulateNetworkConditions`) menú, Ajustes, partido rápido 6 s, partido de Carrera,
privacidad.html, version.json y Firestore que fallan (no salen de la caché), sin errores; publicación: sin aviso durante el
partido, aviso en el menú, «Reiniciar» → versión nueva, caché vieja borrada, sin bucles, version.json y otro origen nunca desde el
service worker; y sin red otra vez con la nueva.

## Si algo va mal en producción

- Publicar una versión que arregle: el service worker se actualiza solo (el navegador mira `sw.js` en cada navegación, sin caché).
- Para quitarlo del todo: cambiar la plantilla `sw.js` por una que en `activate` borre las cachés `ttc-*` y haga
  `self.registration.unregister()`, y quitar `js/sw-reg.js` del index. Un jugador concreto: abrir `https://takethecourt.com/?nosw=1`.
