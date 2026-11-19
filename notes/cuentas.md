# Cuentas (Firebase): diseño y estado

**Estado (10-nov-2026): hecho.** Código en `js/account.js` (VB.Account), cargado justo después de three.js y antes del resto,
para que vea todas las escrituras de los guardados.

## Cómo funciona el código
- **Detección de cambios:** envuelve `Storage.prototype.setItem` y `removeItem`. Cuando el juego escribe una de las cuatro claves
  (`make-the-cut.squad`, `make-the-cut.career`, `make-the-cut.settings`, `make-the-cut.record`), apunta la hora en `make-the-cut.account.meta` y, con sesión,
  sube ese documento a los ~1,5 s. El resto del juego no sabe nada de las cuentas.
- **Cuándo se sube:** también al ocultar la pestaña (`keepalive`) y al volver la red. En `make-the-cut.account.meta.up` queda lo que ya
  está subido.
- **Al entrar en la cuenta** se une lo de este dispositivo con lo de la cuenta, documento a documento:
  - si solo hay en uno de los dos lados, se copia al otro;
  - la primera vez en un dispositivo, el escuadrón se queda con el de más progreso y el récord con el de más partidos;
  - si hay dos Carreras distintas, se pregunta cuál quedarse;
  - si llega algo de la cuenta, la página se recarga con un aviso.
- **Al abrir el juego con sesión** (y al volver a la pestaña) se baja lo que sea más nuevo en la cuenta, comparando con la hora local.
  La recarga solo se hace en el menú, y una vez por sesión de pestaña.
- **Interfaz:** botón «Cuenta» (`#btnAcc`), solo en la página principal del menú y debajo de «Pantalla completa». Un punto indica el
  estado: turquesa sincronizado, amarillo sincronizando, rojo error. Abre el panel `#account` con:
  - sin sesión: entrar o crear cuenta;
  - con sesión: usuario, cuándo se guardó, «Sincronizar ahora», «Cerrar sesión» (lo del dispositivo se queda) y «Borrar la cuenta»
    (pide confirmación; borra los documentos y la cuenta).
- **Probado contra el Firebase real** con `tools/eval.js`:
  - crear una cuenta, subir experiencia y ver que llega;
  - entrar desde un navegador limpio y recibir el progreso;
  - dos Carreras distintas: pregunta con cuál quedarse;
  - borrar la cuenta y comprobar que ya no deja entrar.

  Las cuentas de prueba se borraron.

## Proyecto
- Proyecto Firebase **`make-the-cut-vb`** («Make the Cut»), es de la cuenta de Google de pruebas de Ferran. No escribir su correo en
  ningún fichero. No tiene Analytics.
- Firestore `(default)` en `eur3`. Acceso por usuario y contraseña (proveedor email/password).
- App web `1:676972390856:web:f3dfd69181c99fc36378fd`. La clave web es pública por diseño (va en el cliente, como en emPat Data):
  `apiKey: AIzaSyC59o9QtpUvjWT4g3ouOXinghASTuXZSes`.
- Configuración y reglas en `firebase/`. Se despliegan desde esa carpeta con `npx firebase-tools deploy --only firestore,auth`.
  Tras cambiar las reglas, esperar unos minutos a que se propaguen.

## Modelo (igual que emPat Data, pero sin cifrar)
- La app habla con Firebase por REST, sin librerías:
  - `identitytoolkit` para el alta y la entrada;
  - `securetoken` para renovar el token;
  - Firestore REST para los datos.
- Solo se pide usuario y contraseña, sin correo:
  - el correo es ficticio: `<usuario>@cuentas.make-the-cut.invalid`;
  - usuario en minúsculas, que cumpla `^[a-z0-9][a-z0-9._-]{2,29}$`.
- Documentos `users/{uid}/saves/{key}`:
  - `key` es `squad`, `career`, `settings` o `record`;
  - campos `{data: JSON en texto (≤ 400 kB), updatedAt: ms, v: int}`.
- Las reglas solo dejan leer y escribir al dueño y solo esas claves y campos (`firebase/firestore.rules`).
  Comprobado contra el Firebase real:
  - escribir y leer lo propio da 200;
  - una clave rara, otro usuario o una petición sin token dan 403.
- En el dispositivo, la sesión va en `make-the-cut.account` con `{user, uid, rt, it, ie}`. Nunca se guarda la contraseña.

## Comportamiento previsto
- **Panel «Cuenta» en el menú:** entrar, crear cuenta, cerrar sesión y borrar cuenta (borra los datos y luego la cuenta).
- **Sin cuenta o sin red**, todo sigue en local como ahora (`make-the-cut.squad`, `make-the-cut.career`, ajustes).
- **Al entrar:**
  - se une lo local con lo de la cuenta, documento a documento, y gana el `updatedAt` más reciente;
  - si los dos existen y son distintos, se pregunta cuál quedarse (sobre todo la Carrera).
- **Sincronización:**
  - se sube al acabar un partido, al subir una estadística, en la Carrera tras cada jornada o decisión, y al cambiar un ajuste;
  - con un retardo de unos 2 s y reintento al volver la red o la pestaña.
- **Contraseña olvidada:** no hay recuperación porque no hay correo. Hay que avisarlo al crear la cuenta.
- **Pruebas:** una herramienta tipo `tools/cuentatest.mjs` contra el Firebase de verdad, que borre su cuenta al acabar (como
  `t-cuenta.mjs` de emPat Data).

## Correo y Google (15-nov-2026)
- **Correo y contraseña:** el campo admite un correo de verdad (con @) o un usuario (sin @, las cuentas de antes con correo ficticio).
  Con correo hay «¿Has olvidado la contraseña?» (`accounts:sendOobCode` PASSWORD_RESET; Firebase no dice si el correo existe).
- **Google:** `account.js` carga el SDK compat de Firebase Auth 10.12.5 desde gstatic (precargado al abrir el panel de la cuenta sin
  sesión, o al pulsar «Entrar con Google» si aún no estaba), hace `signInWithPopup`, toma el uid, el id token y el refresh token y cierra
  el SDK: la sesión sigue por REST como las demás (`acc.kind = 'google'`).
- **Google en iPhone (Safari) y Firefox (19-nov-2026):** SIEMPRE ventana emergente, sin redirección. Antes, si la ventana se bloqueaba
  (se abría tras esperar al SDK y Safari/Firefox ya no lo contaban como toque), se usaba `signInWithRedirect`; con `authDomain` en
  firebaseapp.com y la página en github.io, el almacenamiento particionado de Safari 16.1+ y Firefox dejaba `getRedirectResult` vacío
  y no se entraba sin ver ningún error. Ahora:
  - con el SDK ya cargado, `signInWithPopup` se llama en el acto dentro del toque (sin await antes), y el navegador deja abrir la ventana;
  - si aun así se bloquea (`popup-blocked` u `operation-not-supported-in-this-environment`), el panel pide confirmación (vista
    `gconfirm`: «Entrar con Google», «Abrir Google» / «Cancelar»); el toque en «Abrir Google» abre la ventana en el acto;
  - si se vuelve a bloquear, se queda en la confirmación con «Tu navegador ha bloqueado la ventana de Google. Permite las ventanas
    emergentes para este sitio y vuelve a probar.»;
  - `gBack()` solo borra el indicador `make-the-cut.account.gredir` que pudiera quedar de 1.15.1 o antes (sin cargar el SDK ni
    `getRedirectResult`) y avisa de volver a probar desde «Cuenta».
  - Prueba: `node tools/googletest.js` (SDK y nube falsos, sin red; móvil 844x390 y PC 1280x720): confirmación, ventana en el acto, «Cancelar», sin redirección, y también entrar bien (vista de la cuenta, `signOut` del SDK, subida) y el conflicto de Carreras tras entrar con Google.
- **Falta en la consola de Firebase (Ferran):** 1) Authentication › Sign-in method › Google › Activar (elegir correo de asistencia);
  2) Authentication › Settings › Authorized domains › añadir `purupurpito.github.io`. Hasta entonces el botón avisa «Entrar con Google aún no
  está activado. Usa tu correo de momento.»
- Reglas de Firestore con `'look'` desplegadas el 15-nov-2026 (`LOOK_SYNC = true`).

## Sprint 2-4 (15-nov-2026, v1.2.0): sincronización y migraciones (D4, T13)

Detalle: `notes/s234/T13.md`. Contrato: CONTRACT §1 «Sprint 2-4».
- account.js: un solo interruptor nuevo `S4_SYNC = false` (profile, career6, cmode, legends y retos; con `false` van a `TRACK`). Tabla
  `MERGE` (gym, look, legends por unión top 20, profile y retos con su `mergeRaw`; el resto LWW). Cola de conflictos de Carrera (playa y
  pista, «¿Qué Carrera de pista te quedas?»), copia `.prev` de la Carrera que pierde, bajadas solo en el menú (`menuReady`), recargas sin
  bucle (ganchos `Prog._reload`, `Career.*._reset`, `VB.UI.refreshMenu`), tope de 390 000 caracteres y `pageSize` 50.
- firebase/firestore.rules: las 11 claves (`squad, career, settings, record, gym, look, profile, career6, cmode, legends, retos`).
  **Sin desplegar.** Para Ferran: desplegar (`npx firebase-tools deploy --only firestore:rules` desde `firebase/`), esperar unos minutos y,
  en una publicación mínima, `S4_SYNC = true` (`LOOK_SYNC` ya está a `true` desde el 15-nov-2026). synctest comprueba que las reglas cubren `DOCS` con todo encendido.
- Riesgo conocido: un aparato que crea su perfil con un récord ya sincronizado puede contar dos veces el relleno inicial; desaparece con
  `S4_SYNC`.
