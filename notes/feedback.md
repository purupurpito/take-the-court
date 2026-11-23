# notes/feedback.md — Sugerencias y bugs de los jugadores (1.22.1, 23-nov-2026; owner ui_main)

Petición de Ferran: «crea un boton de sugerencias y otro de bugs, que guarde el feedback de los usuarios para poder resolverlo cuando
toque». Rama `feedback` (desde main 1.22.0 = 34bffd4). La 1.23.0 queda reservada para el online multi.

## Dónde están los botones (y por qué)
- **Ajustes › Info** (desde la portada y desde la pausa, que también abre Ajustes): dos filas «Sugerir una mejora» y «Avisar de un
  bug», junto a Novedades, Créditos y «Traer tu partida». Es donde ya vive lo que no es jugar (versión, novedades, créditos): no
  ensucia la portada, que el sistema SPLAT quiere con pocas entradas grandes (notes/splat.md §1), y se llega con las mismas teclas,
  mando y toques que al resto de filas `.opt-go` (ui.js `goRow`). Abiertas desde aquí se apilan: Volver regresa a Ajustes › Info con
  el foco en la fila.
- **Pausa del partido**: una fila de dos manchas pequeñas (`#btnPSug` turquesa con bombilla, `#btnPBug` crema con bicho) debajo de
  Reiniciar / Salir en PC; en el móvil apaisado, en la columna del marcador (fila 4 de la rejilla de la pausa, encima de «Cambios»),
  sin tocar el 2×2 ni «Seguir jugando». El bug se recuerda mejor en caliente, en el partido; por eso aquí hay acceso directo (un
  toque) y no solo por Ajustes. Desde la pausa, «¿Dónde pasó?» sale ya marcado (Partido, Carrera u Online según el partido).
- **Buzón de opiniones** (el visor): tercera fila de Ajustes › Info, oculta salvo con la cuenta de Ferran (misma huella SHA-256 del
  correo que el acta, `ACTA_ALLOW` en ui.js; `fbVis()` la recalcula al entrar o salir de la cuenta). Abre `feedback.html` en otra
  pestaña.

## Formulario (panel 'fb', `#pnFb`, sistema SPLAT)
- Tipo en trazos de pincel (`.sp-tab` con `role=radio`): Sugerencia | Bug, preseleccionado por el botón; cambiar de tipo conserva el
  borrador de cada uno (en memoria hasta enviarlo). El título del panel cambia: «Tu sugerencia» / «Avisar de un bug».
- Texto obligatorio, 5-2000 caracteres (contador; aviso si es corto). En los bugs, «¿Dónde pasó? (si quieres)»: Partido, Carrera,
  Online, Menús, Otro (opcional; tocar el elegido lo quita).
- Una línea con lo que se adjunta («Se adjunta: versión 1.22.1, Chrome 131 en Android 14, pantalla 844×390, calidad media, dónde estabas
  [y los últimos errores del juego (n)]. Nada personal: ni correo ni nombre.»).
- Cancelar (crema) / Enviar (equipación) abajo a la derecha; al enviar, la hoja dice «¡Gracias! Enviado» o «Guardado: se enviará en
  cuanto se pueda» con «Hecho».
- Teclado y mando: todo es `<button>` en `[data-nav]` (filas con `data-sp-row`) y el cuadro de texto lleva `data-focus` (entra en
  ↑/↓ del mando y en Tab). Mientras se escribe, el cuadro para la propagación de las teclas (salvo Tab): Q/E, F (pantalla completa), I…
  no llegan al juego. Esc en el cuadro cierra el panel; Ctrl+Intro envía. Doble toque en el cuadro: main.js ya no lo anula (selector
  de controles del `touchend` con `textarea`).
- Móvil: rejilla de los paneles (tipo = strip, hoja = body, botones = dock), letra del cuadro ≥ 16 px (iPhone no amplía la página).

## Qué se guarda
Firestore REST, `feedback/{id}` (id aleatorio de 20 letras y cifras) con `documents:commit`: `t` con la transformación REQUEST_TIME
(hora del servidor) y `currentDocument.exists = false`. Sin sesión, sin cabecera Authorization.

| campo | qué |
|---|---|
| kind | 'sug' \| 'bug' |
| text | 5-2000, recortado y sin caracteres de control |
| where | solo bugs y si se elige: 'partido' \| 'carrera' \| 'online' \| 'menus' \| 'otro' |
| ver | VB.VERSION |
| ctx | JSON ≤ 8000: `env` (navegador y versión, sistema, móvil, táctil, pantalla@dpr, ventana, núcleos, memoria, app instalada, html.ph), `q` (calidad del ajuste y la de ahora), `lang`, `screen` (dónde estaba: «menú > set:info», «pausa»…), `mode` (en partido: «carrera 2v2, set 1 3-2»), `sha` (build de Pages), `host`; en los bugs `errs` (≤ 5) |
| uid | el de la cuenta si hay sesión; '' sin sesión |
| t | hora del servidor |
| state | 'nuevo' al crear; el visor lo pasa a 'visto' \| 'hecho' \| 'descartado' |
| note | solo desde el visor (≤ 1000) |

**Nunca**: correo, IP, nombre (ni el visible), red. Los errores se recortan a 300 caracteres y las rutas al nombre del fichero
(`file:///C:/Users/…/js/ui.js:12` → `ui.js:12`).

**Búfer de errores** (js/feedback.js, cargado justo después de version.js): `addEventListener('error')` (sin los recursos que no cargan),
`'unhandledrejection'` y los `console.error('[VB][ERROR] …')` de main.js/ui.js (envoltura de console.error que llama siempre a la
original con los mismos argumentos). Los 5 últimos; repetidos seguidos se cuentan (`n`).

## Sin conexión, reglas sin desplegar y límites
- Cola `make-the-cut.feedbackq` (máx. 20, las más nuevas) y límites `make-the-cut.feedbackl` = {d: AAAAMMDD, n, last}. Son del aparato:
  nunca van a DOCS ni a TRACK de account.js.
- El envío entra primero en la cola (si se cierra la pestaña a mitad no se pierde). 2xx o 409 (ya estaba) = enviado; 400/413 = se descarta
  (nunca pasará las reglas); 401/403 (reglas sin desplegar), 404, 429, 5xx o sin red = se queda. Reintento a los 4 s de cargar y al
  volver la conexión (`online`).
- Límite en el cliente: 1 envío cada 30 s y 10 al día (también los que se quedan en la cola).

## Reglas (firebase/firestore.rules, bloque FEEDBACK) — SIN DESPLEGAR
- Crear con o sin sesión (sin sesión `uid == ''`; con sesión `uid == request.auth.uid`), `hasOnly`/`hasAll` de los campos, tamaños de
  la tabla, `t == request.time`, `state == 'nuevo'`, id `[A-Za-z0-9]{16,32}`.
- get/list: solo `admin()`. update: solo `admin()` y solo `state` (de la lista) y `note` (≤ 1000). Nadie borra desde el cliente.
- `admin()` sale de netlogs a nivel global (antes de netlogs, tras el bloque ONLINE: tools/roomtest.js prueba también las reglas sin ese
  bloque y una función sin usar hace que el emulador, con Java en castellano, dé 500). Mismo resultado; ahora con
  `token.get('email', null)`: una cuenta sin correo da false en vez de un error de evaluación.
- **Para Ferran**: desde `firebase/`, `npx firebase-tools deploy --only firestore:rules` y esperar unos minutos. Hasta entonces el juego
  guarda todo en la cola de cada aparato y lo manda solo cuando las reglas estén.

## Visor (pages/feedback.html → feedback.html en Pages)
Como netlogs.html: usa la sesión de la cuenta guardada en el mismo navegador (mismo origen que el juego). Lista (lo más nuevo primero,
hasta 1000), filtros por tipo y estado, resumen, texto, contexto legible (y entero desplegable), errores, cambiar estado y nota
(PATCH con updateMask state/note) y «Descargar todo (JSON)» (`opiniones-AAAA-MM-DD.json`, para pasárselo a Claude).

## Pruebas
- `node tools/feedbacktest.js [--no-emu] [--port 8095]` (NOCDP=1 sin navegador): node con fetch simulado (envío, cola, 403/400/409,
  tope, límites, contexto), emulador de Firestore con la huella de admin cambiada SOLO en una copia temporal (crear con y sin sesión,
  campos de más, tamaños, hora del cliente, leer/listar/cambiar solo admin, nadie borra, netlogs igual) y navegador (Ajustes › Info y
  pausa, teclas en el cuadro, Tab, Esc, cola sin red y con 403, flush, reintento al arrancar, móvil 844×390, mando, fila del visor oculta).
  En el navegador Firestore NUNCA se toca: un script inicial sustituye `fetch` para firestore.googleapis.com.
- tools/roomtest.js: casos de feedback en el banco de reglas (crear sin sesión, con sesión, campos de más, uid de otro, leer sin admin).
- tools/mobaudit.js: filas `opiniones-sug`, `opiniones-bug` y `pausa-bug`.

## Pendiente / ideas
- Desplegar las reglas (Ferran).
- Probar en un iPhone y un Android de verdad el teclado del sistema sobre el panel (en headless no hay teclado virtual).
- Si un día hace falta, un aviso al jugador cuando su bug pase a «hecho» (ahora no hay vuelta: es anónimo salvo el uid).
