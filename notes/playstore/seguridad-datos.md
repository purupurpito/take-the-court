# Seguridad de los datos (Data safety) — Take the Court (1.22.0)

Respuestas al formulario de Play Console › **Política › Contenido de la app › Seguridad de los datos**, pregunta por pregunta y
en el orden de la Consola. Cada respuesta va justificada con el código (archivo:línea de la rama playstore, 1.22.0).

La Consola puede cambiar el texto o el orden de las preguntas: si algo no cuadra, **comprobar en la Consola** y en la ayuda
«Proporcionar información para la sección Seguridad de los datos» de Google Play.

---

## 0. Antes de rellenar: requisitos previos

El formulario tiene que decir la verdad el día que se envía. Había tres cosas que impedían contestar «sí» con la conciencia
tranquila en la parte de borrado; la 2 y la 3 se arreglaron el 24-nov-2026 (ver abajo). Queda la 1, que decide el dueño:

1. **Los netlogs no se borran nunca.** `netlogs/{uid}_*` no tiene regla `delete` (firebase/firestore.rules:107-124) y
   `deleteAccount()` no los toca (js/account.js:472-483). Llevan el nombre propio y el del rival, y datos del dispositivo.
   Opciones: (a) Cloud Function al borrar el usuario de Auth que borre `netlogs/{uid}_*` y `rooms/{uid}`; (b) política TTL de
   Firestore en `netlogs` (p. ej. 90 días) y borrado manual de los del usuario cuando lo pida por la página de borrado;
   (c) las dos. Lo que se elija hay que contarlo igual en privacidad.html y en borrar-cuenta.html.
2. ~~`rooms/{uid}` puede quedarse~~ **Arreglado (24-nov-2026):** `deleteAccount()` borra también `rooms/{uid}` y su `sig/` si existe.
3. ~~Errores ignorados al borrar documentos~~ **Arreglado (24-nov-2026):** si falla la lista o cualquier DELETE, no se borra la
   cuenta y el juego (y borrar-cuenta.html) dicen «No se ha podido borrar todo. La cuenta sigue: prueba otra vez.». Antes de borrar
   nada se mira que la entrada sea de hace 5 min como mucho (auth_time del token). Una pestaña del juego abierta deja de subir
   en cuanto otra pestaña quita la sesión (evento `storage`). Queda un hueco que solo arregla una Cloud Function: otro dispositivo
   con la sesión abierta puede volver a subir partidas durante una hora como mucho (borrar-cuenta.html lo avisa).

Play permite conservar algunos datos tras borrar la cuenta solo por motivos legítimos (seguridad, prevención del fraude,
obligación legal) y **si se explica**. Los diagnósticos de red no entran en esos motivos. Si se publica sin arreglarlo, la página
de borrado y la política tienen que decir claramente que los informes de red se conservan X días y cómo pedir que se borren.

Además, si se cambia algo del código de la lista (por ejemplo, se quita el uid de las salas, se añade un interruptor del netlog o
se enciende el TURN), **hay que volver a revisar este formulario**.

---

## 1. Recogida y seguridad de los datos

### 1.1 ¿Tu app recoge o comparte alguno de los tipos de datos de usuario obligatorios?

**Sí.**

- Con cuenta (opcional) salen del dispositivo: correo o nombre de usuario, uid, progreso del juego y el nombre del personaje
  (js/account.js:377-389 y :141-157; firestore.rules:15-23).
- En el online: nombre visible en las salas (js/netroom.js:173-177) y el informe de red con datos del dispositivo
  (js/netlog.js:41-56 y :171-183).
- Sin cuenta, el juego no envía nada a servidores propios: todo vive en el localStorage del dispositivo.

> Nota de Google: «recoger» es transmitir datos fuera del dispositivo, aunque sea a un proveedor. Los datos que solo se procesan
> en el dispositivo (ajustes, récord online local, estadística del partido: inventario §E) **no se declaran**.

### 1.2 ¿Todos los datos de usuario que recoge tu app están cifrados en tránsito?

**Sí.**

- Todo el tráfico con Firebase (Auth y Firestore), GitHub Pages, cdnjs y Google Fonts va por HTTPS (js/account.js:103 y :114).
- El canal entre jugadores es WebRTC, que siempre cifra con DTLS/SRTP (js/netrtc.js).
- Si un día se enciende el TURN, el Worker va por HTTPS y el tráfico retransmitido sigue cifrado con DTLS.

### 1.3 ¿Qué métodos de cuenta permite tu app? / ¿Permite crear una cuenta?

**Sí, se puede crear una cuenta.** Métodos (marcar los que la Consola ofrezca):

- **Nombre de usuario y contraseña**: cuentas «usuario y contraseña» (correo ficticio `@cuentas.make-the-cut.invalid`,
  js/account.js:3-4, :37 y :383).
- **Correo y contraseña** (en la Consola suele estar dentro de «Nombre de usuario y contraseña» o «Nombre de usuario y otra
  autenticación»; comprobar la opción exacta) (js/account.js:377-385).
- **OAuth**: «Entrar con Google» (js/account.js:402-458).

### 1.4 Enlace para eliminar la cuenta (obligatorio si se pueden crear cuentas)

```text
https://takethecourt.com/borrar-cuenta.html
```

La página tiene que: nombrar la app («Take the Court») tal y como sale en la ficha, explicar los pasos dentro del juego
(Cuenta › «Borrar la cuenta» › «Sí, borrar la cuenta», js/account.js:702-708 y :740-741), dar una vía para pedirlo sin la app
(correo a `help@takethecourt.com` desde la dirección de la cuenta, o con el nombre de usuario), y decir **qué se borra, qué se
conserva y durante cuánto tiempo** (ver §0).

### 1.5 ¿Ofreces una forma de pedir que se borren algunos o todos los datos sin tener que borrar la cuenta?

**No** (respuesta recomendada hoy). No hay ningún botón para borrar solo los datos de la nube manteniendo la cuenta.
«Borrar carrera» (Ajustes › Info, CHANGELOG 1.3.1) borra una Carrera concreta, pero no está pensado como solicitud de borrado de
datos. Si se quiere contestar «Sí», la página borrar-cuenta.html tendría que ofrecer también pedir por correo que se borren solo
los netlogs o el progreso en la nube.

### 1.6 Revisión de seguridad independiente (MASA) / Compromiso con la política de Familias

- Revisión independiente: **No** (no se ha hecho).
- Política de Familias: no aplica (público objetivo 16+ o 13+, ver clasificacion.md).

---

## 2. Tipos de datos

Para cada tipo marcado como **recogido**, la Consola pregunta:

1. ¿Se recoge, se comparte o las dos cosas?
2. ¿Se procesa de forma efímera?
3. ¿Es obligatorio o los usuarios pueden decidir si se recoge (opcional)?
4. ¿Para qué se usa? (Funcionalidad de la app, Analíticas, Comunicaciones del desarrollador, Publicidad o marketing,
   Prevención de fraudes, seguridad y cumplimiento, Personalización, Gestión de la cuenta)

### Qué NO es «compartir» (reglas de Google)

Según la ayuda de Play, **no cuenta como compartir**:

- enviar datos a un **proveedor de servicios** que los trata en tu nombre (aquí: Google Firebase Auth y Firestore, GitHub Pages,
  Cloudflare si se usa, servidores STUN). Por eso Firebase **no** se declara como «compartido»;
- las transferencias **iniciadas por el usuario** en las que espera que se compartan (aquí: jugar online contra otra persona, que
  ve tu nombre visible; compartir el enlace de la semana o el código de sala con el menú del sistema);
- las transferencias por obligación legal.

Con eso, la respuesta a «¿se comparte?» es **No** en todos los tipos. Hay un caso dudoso (el uid en las salas), explicado en
§2.1.

### Por qué se marca «opcional» en todo

Sin cuenta se juega a todo menos al online (js/account.js:13; js/netlobby.js:7 y :1038). Nada de lo que sale del dispositivo
se recoge sin una cuenta, que es opcional. Google dice que un dato es opcional si el usuario puede decidir si se recoge; crear
una cuenta y entrar en el online son decisiones del usuario.

Matiz honesto: dentro del online, el informe de red (netlog) **no se puede apagar** (inventario §D). Si se quiere ser más
estricto, marcar como **obligatorios** los tipos que solo vienen del netlog (Diagnósticos) o, mejor, añadir un interruptor
«Enviar informes de conexión» y dejarlo en opcional.

---

### 2.1 Información personal

| Tipo | ¿Recogido? | ¿Compartido? | ¿Efímero? | Obligatorio/opcional | Finalidades |
|---|---|---|---|---|---|
| **Nombre** | **Sí** | No | No | Opcional | Funcionalidad de la app, Analíticas |
| **Dirección de correo** | **Sí** | No | No | Opcional | Gestión de la cuenta, Funcionalidad de la app |
| **IDs de usuario** | **Sí** | No (ver nota) | No | Opcional | Gestión de la cuenta, Funcionalidad de la app, Analíticas |
| Dirección | No | | | | |
| Número de teléfono | No | | | | |
| Raza y etnia | No | | | | |
| Creencias políticas o religiosas | No | | | | |
| Orientación sexual | No | | | | |
| Otra información | No | | | | |

Justificación:

- **Nombre**: Google incluye los apodos («cómo se llama a sí mismo el usuario, como su nombre o apodo»).
  - Nombre visible del online en `rooms/{uid}` (`name`/`gname`, js/netroom.js:173-177; firestore.rules:30-82) → funcionalidad.
  - Nombre del personaje de la Carrera («Tu nombre», js/career-ui.js:2699 y :2862) dentro de las partidas en la nube
    (js/account.js:41-60) → funcionalidad.
  - Nombre propio y del rival en el netlog (js/netlog.js:175) → analíticas (rendimiento del online).
  - El perfil de Google trae el nombre (`displayName`), que el juego usa solo si no hay correo (js/account.js:424).
- **Correo**: Firebase Auth (js/account.js:377-385 y :402-458) y el correo para cambiar la contraseña (js/account.js:397-401).
  En las cuentas de usuario y contraseña es el nombre de usuario dentro de un correo ficticio: se declara igual.
- **IDs de usuario**: el uid de Firebase va en cada ruta de Firestore (js/account.js:141 y :388) y en el netlog
  (js/netlog.js:171-183).
- **Nota sobre el uid en las salas**: las salas guardan `host` y `guest` con el uid, y **cualquier usuario con sesión puede listar
  las salas** (firestore.rules:30-32 y :65-66), en cualquier estado (abiertas, llenas y en juego: la regla `list` no filtra por
  `state` y el lobby filtra en el cliente, js/netroom.js:146-150); privacidad.html ya lo dice así. Es un efecto técnico del lobby (el usuario crea la sala para que otros la vean),
  así que encaja en «transferencia iniciada por el usuario» y la respuesta es **No compartido**. Aun así, lo más limpio es no
  exponer el uid a desconocidos (por ejemplo, usar el `code` de la sala como identificador visible). Contarlo en la política.
- **Foto de perfil de Google**: el juego no la usa ni la guarda (js/account.js:424). No se declara.

### 2.2 Ubicación

| Tipo | ¿Recogido? |
|---|---|
| Ubicación aproximada | **No** |
| Ubicación precisa | **No** |

- El juego no pide permisos de ubicación ni usa la API de geolocalización (inventario §F).
- **Direcciones IP**: no se usan para sacar la ubicación. Ver §3.

### 2.3 Información financiera

Todo **No** (información de pago, historial de compras, puntuación de crédito, otra). No hay pagos ni compras: la «Tienda» usa el
sueldo ficticio de la Carrera (js/career.js:136 y :2640; js/career-life.js:762-783).

### 2.4 Salud y actividad física

Todo **No**. Las lesiones son de un personaje ficticio (js/career-injury.js).

### 2.5 Mensajes

Todo **No** (correos, SMS o MMS, otros mensajes en la app).

- No hay chat de texto ni de voz entre jugadores. Lo que viaja por el canal son mensajes de control del juego
  (js/net.js, js/netfluid.js, js/netlobby.js:429).
- Los «mensajes» de la Carrera son textos del juego con personajes ficticios, generados en el dispositivo.

### 2.6 Fotos y vídeos

Todo **No**.

### 2.7 Archivos de audio

Todo **No** (grabaciones de voz, archivos de música, otro audio). El sonido se genera en el dispositivo y no hay micrófono.

### 2.8 Archivos y documentos

**No.** El acta del partido solo se descarga en el dispositivo y está oculta (js/ui.js:3924-3975).

### 2.9 Calendario

**No.**

### 2.10 Contactos

**No.**

### 2.11 Actividad en la app

| Tipo | ¿Recogido? | ¿Compartido? | ¿Efímero? | Obligatorio/opcional | Finalidades |
|---|---|---|---|---|---|
| Interacciones con la app | No (ver nota) | | | | |
| Historial de búsqueda en la app | No | | | | |
| Apps instaladas | No | | | | |
| Otro contenido generado por el usuario | No (ver nota) | | | | |
| **Otras acciones** | **Sí** | No | No | Opcional | Funcionalidad de la app, Analíticas |

- **Otras acciones**: Google pone como ejemplo el juego («gameplay»). Es el progreso que se sincroniza en
  `users/{uid}/saves/{key}`: escuadrón, Carreras, Vestuario, récord, retos, perfil, ajustes (js/account.js:41-60 y :152-157;
  firestore.rules:19-23) → funcionalidad. Y el resultado y los sucesos del partido online en el netlog (js/netlog.js:171-183)
  → analíticas.
- **Interacciones con la app**: el juego no registra toques ni pantallas vistas. Si se quiere ser muy estricto con el netlog
  (opciones del partido, rol), se puede marcar también con finalidad Analíticas; no es necesario.
- **Otro contenido generado por el usuario**: el único texto libre es el nombre, que ya va en «Nombre».

### 2.12 Navegación web

**No.**

### 2.13 Información y rendimiento de la app

| Tipo | ¿Recogido? | ¿Compartido? | ¿Efímero? | Obligatorio/opcional | Finalidades |
|---|---|---|---|---|---|
| Registros de fallos | No | | | | |
| **Diagnósticos** | **Sí** | No | No | Opcional (ver §2 «Por qué opcional») | Analíticas |
| Otros datos de rendimiento | **Sí** (recomendado) | No | No | Opcional | Analíticas |

- **Diagnósticos**: el netlog guarda ping, fps, peor frame, esperas, rollback, paquetes, tipo de candidato ICE y protocolo
  (js/netlog.js:171-183), una vez por partido online y jugador (js/netlog.js:11-14 y :185-201).
- **Otros datos de rendimiento**: en el mismo netlog van el navegador y su versión, el sistema y su versión, si es móvil,
  pantalla, núcleos, memoria y la red (`type`, `effectiveType`, `rtt`, `downlink`, `saveData`) (js/netlog.js:41-56).
- **Registros de fallos**: no hay informes de errores (búsqueda de sentry, onerror y beacon sin resultados).

### 2.14 Dispositivo u otros IDs

| Tipo | ¿Recogido? | ¿Compartido? | ¿Efímero? | Obligatorio/opcional | Finalidades |
|---|---|---|---|---|---|
| **Dispositivo u otros IDs** | **Sí** | No | No | Opcional | Funcionalidad de la app |

- El perfil sincronizado lleva un **id aleatorio de dispositivo** como clave del mapa `dev` (js/profile.js:8, :17 y :291-297;
  formato `'d'+fecha36+aleatorio`). Sirve para juntar el progreso de varios dispositivos. **El comentario de js/profile.js:8 dice
  que «NUNCA sube», pero sí sube** dentro del perfil. O se declara (respuesta de esta tabla) o se cambia el código para que no
  suba y se vuelve a revisar el formulario.
- No hay id de publicidad, IMEI ni MAC.

---

## 3. Direcciones IP y el online entre pares (WebRTC)

**Qué pasa**: en el online 1 contra 1 la conexión es directa entre los dos móviles. Para negociarla, cada lado consulta servidores
STUN (`stun.l.google.com`, `stun.cloudflare.com`, js/netrtc.js:25) y manda al otro una SDP con sus direcciones IP y puertos a
través de Firestore (`rooms/{uid}/sig/{offer,answer}`, js/netroom.js:11-12; js/netrtc.js:9 y :17-18). Así, **el rival recibe tu
IP pública** (y la local, salvo que Chrome la oculte con mDNS, que es lo normal). El juego nunca la enseña (js/netconfig.js:3-4).
Las SDP se borran al conectar, al salir y al reabrir (firestore.rules:43; js/netroom.js:238 y :290).

**Cómo contestar (recomendado)**:

- **No** marcar «Ubicación aproximada»: la IP no se usa para localizar a nadie.
- **No** declararla como «compartida»: llega al rival como parte técnica de una función que el usuario inicia a propósito
  (jugar contra otra persona), y a los STUN como proveedores del servicio de conexión.
- **No** hace falta un tipo «IP» aparte: Play no tiene ese tipo, y el desarrollador no la guarda (el netlog no guarda IP ni
  puertos, js/netlog.js:15-16). Las SDP en Firestore son temporales.
- **Sí** contarlo con claridad en la política de privacidad: «En el online la conexión es directa entre jugadores: tu rival y los
  servidores de conexión reciben tu dirección IP. El juego no la guarda ni la enseña.»

**Alternativa conservadora**: si el revisor pregunta, se puede marcar «Dispositivo u otros IDs» con «procesado de forma efímera»
para las SDP. No parece necesario. Si se quiere evitar del todo que el rival vea la IP, la opción es el TURN con `relayOnly`
(js/netconfig.js:26; js/netrtc.js:27-29), que hoy está apagado y tiene coste.

**Si se enciende el TURN** (`VB.NET_TURN_URL` no vacío): el Worker recibe el ID token (uid) y la IP (`CF-Connecting-IP`,
turn-worker/src/worker.mjs:133) solo para limitar peticiones, en memoria. Cloudflare actúa como proveedor: no cambia las
respuestas de arriba, pero hay que añadirlo a la política.

---

## 4. Resumen que verá la gente en la ficha (comprobar la vista previa de la Consola)

- **No se comparten datos con terceros.**
- **Se recogen**: información personal (nombre, correo, IDs de usuario), actividad en la app (otras acciones), información y
  rendimiento de la app (diagnósticos, otros datos de rendimiento), dispositivo u otros IDs.
- **Los datos se cifran en tránsito.**
- **Puedes pedir que se borren los datos.**

---

## 5. Tabla rápida para pegar

| Categoría › tipo | Recogido | Compartido | Efímero | Opcional | Finalidades |
|---|---|---|---|---|---|
| Información personal › Nombre | Sí | No | No | Sí | Funcionalidad, Analíticas |
| Información personal › Correo | Sí | No | No | Sí | Gestión de la cuenta, Funcionalidad |
| Información personal › IDs de usuario | Sí | No | No | Sí | Gestión de la cuenta, Funcionalidad, Analíticas |
| Actividad en la app › Otras acciones | Sí | No | No | Sí | Funcionalidad, Analíticas |
| Info y rendimiento › Diagnósticos | Sí | No | No | Sí | Analíticas |
| Info y rendimiento › Otros datos de rendimiento | Sí | No | No | Sí | Analíticas |
| Dispositivo u otros IDs | Sí | No | No | Sí | Funcionalidad |
| Todo lo demás | No | — | — | — | — |

Preguntas generales: recoge o comparte **Sí** · cifrado en tránsito **Sí** · se pueden crear cuentas **Sí** (usuario y
contraseña, correo y contraseña, Google) · URL de borrado `https://takethecourt.com/borrar-cuenta.html` · borrar datos sin borrar
la cuenta **No** · revisión independiente **No**.
