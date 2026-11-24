# Google Play: privacidad y borrado de la cuenta (24-nov-2026, rama playstore)

Páginas legales que pide Google Play para la ficha de la app (TWA sobre takethecourt.com).

## Qué hay
- `pages/privacidad.html` → https://takethecourt.com/privacidad.html. Política de privacidad. Español arriba (`#es`) y la misma en
  inglés abajo (`#en`) para los revisores de Play. Sin scripts ni fuentes externas.
- `pages/borrar-cuenta.html` → https://takethecourt.com/borrar-cuenta.html. La «URL para borrar la cuenta» del formulario de Play.
  Explica el camino del juego (menú principal › «Cuenta» › «Borrar la cuenta» › «Sí, borrar la cuenta»), el borrado por correo y qué
  se borra / qué se queda. Si en ese navegador hay una sesión del juego (`make-the-cut.account`, mismo origen), ofrece «Borrar mi
  cuenta» tras escribir BORRAR. Hace las mismas llamadas que `deleteAccount()` de `js/account.js` (no carga account.js porque ese
  módulo sincroniza al cargar). Orden (24-nov-2026): 0) entrada de hace 5 min como mucho (auth_time del token; si no, pide volver
  a entrar sin borrar nada); 1) lista `users/{uid}/saves` (si falla, no borra nada); 2) DELETE de lo listado, de las 11 claves de
  DOCS y de la sala propia (`rooms/{uid}/sig/offer|answer` y `rooms/{uid}`, solo si existe); si falla alguno, NO borra la cuenta
  («No se ha podido borrar todo»); 3) `accounts:delete`; 4) cierra la sesión como `signOut()`. account.js escucha además el evento
  `storage`: si otra pestaña quita la sesión, deja de subir (si no, con el token aún vigente recrearía partidas de una cuenta borrada).
- Juego: Ajustes › Info › «Privacidad» (tras «Créditos», `data-go="priv"`, `js/ui.js` `openPrivacy`). Abre la política en otra
  pestaña: en Pages (`window.__vbBuild`) la de al lado; en local la publicada.
- `tools/build-pages.js` copia las dos a `_site` (como todo `pages/`). Por defecto solo avisa si faltan o si quedan huecos `{{...}}`;
  con `STRICT_POLICY=1 node tools/build-pages.js` falla. Usarlo antes de mandar la ficha.
- `tools/policytest.js`: contenido (es/en, lo que dice la política frente al código), build con y sin STRICT_POLICY, Chrome a 360×640
  y 568×320 (sin errores, sin desplazamiento horizontal, enlaces), borrado sin sesión / con sesión (mismas llamadas que account.js en
  vm, con token vigente y caducado) / CREDENTIAL_TOO_OLD / entrada antigua / DELETE con 503 / lista con 503 / con sala propia, que
  account.js deja de subir si otra pestaña quita la sesión, y la fila del juego.

## Huecos que rellena el dueño
- `Ferran Sanchís Armesto` (nombre o razón social del responsable) en privacidad.html (es y en).
- `help@takethecourt.com` en las dos páginas (texto y `mailto:`).
Se sustituyen tal cual en los dos ficheros; luego `STRICT_POLICY=1 node tools/build-pages.js` y `node tools/policytest.js`.

## Decisiones tomadas (revisables)
- Edad mínima de la cuenta y del online: **14 años** (LOPDGDD art. 7). El juego no pide ni comprueba la edad, y la política lo dice.
  En Play Console, público objetivo sin la franja infantil.
- Bases legales: cuenta, nube y online = contrato (6.1.b); informes de red y registros = interés legítimo (6.1.f), con oposición por correo.
- Compromisos de plazo escritos en las páginas: contestar en un mes (RGPD) y borrar por correo en 30 días como mucho, informes de red incluidos.

## Si cambia el código, cambia la política
La política describe la 1.22.0 tal cual (inventario del 24-nov-2026). Hay que tocar las dos páginas (es y en) si:
- `js/netlog.js` cambia de contenido, gana un interruptor, cambia el plazo (`KEEP_MS`, hoy 90 días con TTL) o deleteAccount empieza
  a borrar `netlogs/{uid}_*` (hoy: 90 días cuando el TTL esté activo, no se borra con la cuenta, no se puede desactivar);
- se enciende el TURN (`VB.NET_TURN_URL` en js/netconfig.js; la política dice que no hay retransmisión y policytest lo vigila);
- cambia el nombre por defecto del online (netlobby.js `defaultName`, hoy «Jugador NNNN») o el filtro (js/namefilter.js), se
  añade chat, denuncias o bloqueo;
- ~~se sirven las fuentes o three.js desde el propio dominio~~ hecho el 24-nov-2026 (`vendor/`, `notes/offline.md`): la política ya no nombra Google Fonts ni cdnjs y dice que el juego guarda una copia de sus archivos para jugar sin conexión. Si un día el index vuelve a pedir algo a otra web, volver a nombrarla (policytest lo vigila);
- se añade analítica, anuncios, pagos o cualquier servicio nuevo;
- cambian `DOCS` o `deleteAccount()` de js/account.js (borrar-cuenta.html copia sus llamadas; policytest compara las dos).
