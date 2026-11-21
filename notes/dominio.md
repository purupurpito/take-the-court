# notes/dominio.md — de Make the Cut (purupurpito.github.io/make-the-cut/) a Take the Court (takethecourt.com)

1.20.0 (nov-2026). Ferran cambia el nombre del juego a «Take the Court» (marca comprobada) y compra `takethecourt.com`. El juego pasa
a la raíz de ese dominio; la dirección antigua queda servida por un **puente** que trae las partidas.

## 1. Qué cambia y qué no

- **Todo lo que se VE** dice «Take the Court» (títulos, metas, manifest, logotipo, textos; lo hacen las pistas marca y textos).
- **La dirección**: `tools/build-pages.js` usa por defecto `https://takethecourt.com/` (canonical, og:url, og:image) y escribe
  `_site/CNAME` = `takethecourt.com` (`PAGES_URL` y `PAGES_CNAME` lo cambian; `PAGES_CNAME=` vacío no lo escribe). El resto del
  sitio va con rutas RELATIVAS (scripts, `version.json`, manifest con `id`/`start_url`/`scope` = `./`): funciona igual en la raíz
  del dominio y en `/make-the-cut/` durante la transición. No hay ningún `/make-the-cut/` escrito en el código.
- **Compartir sala** (`js/netlobby.js`, shareSite): desde takethecourt.com y desde purupurpito.github.io (https) se comparte
  `https://takethecourt.com/?sala=CÓDIGO` con «Juega conmigo a Take the Court: sala X»; en local, la página actual.
- **NO cambian** (los jugadores no los ven y cambiarlos rompería partidas y nube): las claves `make-the-cut.*` de localStorage y
  sessionStorage, el proyecto de Firebase `make-the-cut-vb` (authDomain `make-the-cut-vb.firebaseapp.com`, correo ficticio
  `@cuentas.make-the-cut.invalid`), colecciones y campos de Firestore, los ids de looks (`gorraMTC`), la semilla del reto diario
  (`'mtc-dia-'`), el BroadcastChannel `'mtc-net-'`, el emulador `'demo-mtc'`, los ids SVG `mtc*` y los nombres de variables.
- **Acta → emPat** (oculta, solo la cuenta de Ferran): solo va directa con `location.hostname === 'purupurpito.github.io'`
  (`js/ui.js`); en takethecourt.com descarga el `.json` (aceptado).

## 2. Por qué hace falta un puente

localStorage es de cada ORIGEN (esquema + host + puerto; la ruta no cuenta). Las partidas están en `https://purupurpito.github.io`
(que comparten otros proyectos: `/farolillo`, `/emPat`…). `https://takethecourt.com` es otro origen y empieza vacío. Lo único que
puede leer las partidas es una página servida en el origen viejo → el repo nuevo `purupurpito/make-the-cut` con `bridge/`.

El juego **no tiene service worker, Cache Storage ni IndexedDB** (grep de `serviceWorker`, `caches.`, `indexedDB` vacío en la 1.18.0 y en la 1.19.2;
`js/install.js` solo enseña un tutorial; el SDK de Firebase Auth se carga solo al pulsar Google y la sesión sigue por REST en
localStorage). Así que el puente no necesita `sw.js` y no hay cachés viejas que limpiar. sessionStorage (`make-the-cut.account.toast`,
`make-the-cut.online.back`) es de cada pestaña y no se trae.

## 3. Paquete (compartido por bridge/index.html y js/migrate.js)

```
#mig=1.<fmt>.<sha>.<datos>[&<hash original>]
  fmt  z = deflate (CompressionStream('deflate'), formato zlib) y base64url · j = JSON en UTF-8 y base64url (sin CompressionStream)
  sha  16 primeras cifras hex del SHA-256 del texto JSON · '0' si el navegador no pudo (sin crypto.subtle)
  JSON {v:1, from:'make-the-cut', at:ms, keys:{'make-the-cut.x': texto, …}}
```
El archivo de «Descargar mi partida» es `{"format":"take-the-court-mig","v":1,"mig":"1.z.…"}`; el código de «Copiar código» es el
paquete tal cual. El juego acepta los tres (con o sin `mig=` delante).

## 4. El puente (bridge/index.html = bridge/404.html)

- Lee las claves que empiezan por `make-the-cut.` y que casan con el patrón del juego (las demás, fuera), y las `voley3d.X` como
  `make-the-cut.X` si esa no existe. Nunca lee ni toca otras claves; nunca borra nada.
- Destino `https://takethecourt.com/` + ruta tras `/make-the-cut/` (404.html: `netlogs.html`…) + búsqueda (sin `?u=` de «Reiniciar»)
  + `#mig=…&<hash original>`. Sin partida: el mismo destino sin `#mig`. `<meta name="referrer" content="origin">`.
- Más de 900 000 caracteres: no salta; archivo, código (≤ 200 000) y `takethecourt.com/#migfile`. App instalada (standalone): no salta
  sola; pide reinstalar desde takethecourt.com.
- Pruebas, solo en localhost: `?to=<url local>` cambia el destino, `?stay=1` no salta.
- `version.json` = `{"v":"1.20.0"}`: las pestañas 1.15.1+ abiertas ven «Hay una versión nueva»; «Reiniciar» (recarga con `?u=`)
  cae en el puente.
- Despliegue y orden de pasos: `bridge/README.md`.

## 5. El juego (js/migrate.js)

Primer script tras el bloque `voley3d.*` de index.html (antes que account.js y que cualquier módulo).

1. Si el hash trae `mig=` (o `migcode` / `migfile`): lo quita al momento con `history.replaceState` (queda el resto: `?sala=`, `#foo`),
   guarda `{p, trusted}` en sessionStorage `make-the-cut.mig.raw` (si la pestaña se recarga a medias, se retoma) y saca una FOTO de
   las claves `make-the-cut.*` de este origen (antes de que ningún módulo escriba: es lo «local» de la fusión).
2. Descodifica en asíncrono (DecompressionStream, crypto.subtle) y espera a DOMContentLoaded (los módulos ya están cargados).
3. Comprueba. Cualquier fallo rechaza el paquete ENTERO, sin hoja y con `console.warn`:

| Límite | Valor |
|---|---|
| paquete en el enlace | ≤ 1 200 000 caracteres (archivo/código: ≤ 9 000 000) |
| bytes tras base64 / tras deflate | ≤ 12 000 000 (corta la descompresión al pasarse: bombas) |
| texto JSON | ≤ 6 000 000 caracteres, UTF-8 válido |
| sha | igual al calculado (si el navegador puede calcularlo) |
| forma | `v === 1`, `from === 'make-the-cut'`, `keys` objeto plano |
| claves | ≤ 200, `/^make-the-cut\.[A-Za-z0-9_.-]{1,80}$/` (fuera `__proto__`, `evil`, `farolillo.x`…) |
| valores | texto, ≤ 2 000 000 caracteres |
| se descartan sin rechazar | `make-the-cut.mig.*`, `*.migbak.*`, `make-the-cut.account.gredir`, `make-the-cut.account.rl*` |

4. **Confianza**: automática solo si `document.referrer` es de `https://purupurpito.github.io` (o, con el juego en localhost, otro
   localhost: pruebas) Y el sha cuadra. Si no (enlace de otra web, navegador o extensión que quita el referente, sha `'0'`, código o
   archivo manual): hoja SPLAT «¿Traer la partida de Make the Cut?» con el número de datos, «No» / «Sí, traerla».
   **Sin confianza nunca se trae `make-the-cut.account`** (la sesión): un enlace preparado no puede meterte en la cuenta de otro
   (login-CSRF).
5. **Idempotente**: `make-the-cut.mig.done` = los 5 últimos sha traídos; un paquete repetido (recargar, atrás) no hace nada. Una visita
   nueva al puente lleva otro `at` (otro sha), pero todo sale «igual» y no se escribe, no se recarga y no hay aviso.
6. **Fusión** (`VB.Migrate.plan`, pura):

| Caso | Qué pasa |
|---|---|
| no está aquí | se escribe |
| igual | nada |
| `make-the-cut.account` | solo con confianza, si aquí no hay sesión y es válida (uid, rt, user) |
| `make-the-cut.account.meta` | máximo por clave; horas del futuro se recortan a «ahora» |
| `make-the-cut.account.meta.up` | solo si se trajo la sesión |
| del dispositivo: devid, device, seen, install, e1tips, guided, lkHint, nethelp2, netroom, nick, retostab, role6, online.pend | se queda la de aquí |
| gym, look, legends, profile, retos | `VB.Account.mergeKey(k, aquí, traída, traídaMásNueva)` (las fusiones de account.js) |
| el resto | gana la más reciente por `account.meta` (falta = 0; empate = la de aquí) |

   Lo que se pisa se copia antes en `make-the-cut.migbak.<resto>`; lo traído que pierde, en `make-the-cut.migbak.in.<resto>` (no
   `<clave>.bak`: ya lo usan squad, gym, look, profile y retos). Las Carreras (`career`, `career6`) que pierden van además a
   `<clave>.prev` (lo de account.js). Si una copia no cabe (cuota), esa clave no se toca. Ninguna de estas va a la nube.
7. Escribe con el `Storage.prototype.setItem` ORIGINAL (capturado antes de que account.js lo envuelva): lo traído no queda con la hora
   de «ahora» y no gana a lo más nuevo de la nube.
8. Si algo cambió: `sessionStorage['make-the-cut.account.toast'] = 'Partida traída de Make the Cut'` (lo enseña account.js) y
   `location.reload()` una vez, para que todos los módulos arranquen con lo traído.

### Con la cuenta (js/account.js)
- Mientras `VB.Migrate.pending()`, account.js no sincroniza (boot espera a `whenDone`) y las horas de sus escrituras solo van a
  memoria (si no, su meta, leído antes, pisaría el que escribe migrate.js); si el traspaso no recarga, las une (máximo) y sigue.
- Con la sesión traída, tras la recarga sigue como siempre (syncDown con las horas traídas). Si luego se entra a mano, la primera
  fusión normal. migrate.js nunca abre los avisos de conflicto de la cuenta (los de Carrera los abre account.js como siempre).
- La nube solo guarda squad, career, settings, record, gym y look (S4_SYNC = false): perfil, Carrera de pista, modo de Carrera,
  Salón de la Fama y retos SOLO llegan por el puente.

## 6. Avisos

- **iPhone con la app instalada**: la app de la pantalla de inicio guarda aparte de Safari; lo que traiga el puente desde la app vieja
  puede quedar donde la app nueva no lo ve. Por eso el puente, en modo standalone, no salta solo: pide reinstalar y ofrece código y
  archivo. La cuenta en la nube es la otra salida.
- **Instalación**: la app instalada vieja tiene `scope` `/make-the-cut/` en otro origen: hay que instalar otra vez desde takethecourt.com.
- **Firebase**: `takethecourt.com` en Authorized domains y, si la clave tiene restricción por referente, también allí (ver README del puente).
- **Online**: el proyecto no cambia, así que las salas sirven entre los dos orígenes; un 1.19 contra un 1.20 ya avisa por versión.

## 7. Pruebas

- `node tools/migtest.js --node`: formatos, límites, claves hostiles, tabla de fusión (lo corre `pages.yml` antes del build).
- `node tools/migtest.js [--shots carpeta]`: con Chrome y dos servidores (puente en 127.0.0.1, juego construido en localhost, en `/` y
  en `/make-the-cut/`): traspaso de verdad, segunda visita, 404.html, paquete grande y `#migcode`, paquetes hostiles, confirmación sin
  confianza (sin sesión), sin CompressionStream.
- Regresión de la cuenta: `node tools/synctest.js`, `node tools/proftest.js`, `node tools/roomtest.js`, `node tools/abouttest.js`.
