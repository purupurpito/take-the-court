# TURN de respaldo para el online (1.22.0, informe 4.1)

Estado: **preparado y apagado**. Nada desplegado, ninguna clave creada. Pasos para encenderlo: `turn-worker/README.md`.

## Por qué

Sin TURN el 1 contra 1 no conecta cuando ninguno de los dos puede recibir una conexión directa (CGNAT de muchas operadoras móviles,
redes de empresa). Hasta ahora el lobby solo podía decir «vuestras redes no lo permiten». `notes/net.md` lo dejaba pendiente
(«Queda: activar TURN con una cuenta»).

## Piezas

- **`turn-worker/`** (Worker de Cloudflare `ttc-turn`, `turn.takethecourt.com`): `POST /ice` con el ID token de Firebase →
  credenciales de Cloudflare Realtime TURN de 2 h (`generate-ice-servers`), solo las entradas TURN y sin el puerto 53. Comprueba el
  token sin SDK (RS256, claves públicas de `securetoken@system.gserviceaccount.com`, `iss`/`aud` = `make-the-cut-vb`). Secretos
  `TURN_KEY_ID` y `TURN_KEY_API_TOKEN` con `wrangler secret put` (nunca en el repo). CORS solo para takethecourt.com, el puente de
  github.io y localhost:8080; **sin Origin, 403** (22-nov-2026, revisión de la rama: antes las peticiones sin Origin pasaban con
  token). Límite por uid **y por IP** (`CF-Connecting-IP`; binding de Rate Limiting; sin él, uno sencillo por instancia): las cuentas se
  crean gratis por REST con la clave pública, así que el uid solo no frena. **Pendiente de Ferran antes de desplegar: alerta (o tope)
  de gasto de Realtime TURN en Cloudflare** (turn-worker/README.md, paso 1). No hecho: exigir antigüedad de cuenta o sala online
  activa (el ID token no trae la fecha de creación de la cuenta; haría falta Firestore o la Admin API).
- **`js/netconfig.js`**: `VB.NET_TURN_URL = ''` (apagado). Encenderlo = poner `'https://turn.takethecourt.com/ice'`.
- **`js/netrtc.js`**: `turnPrep(auth)` pide las credenciales (como mucho 2 s: si tarda, se sigue con STUN y la respuesta tardía vale
  para la siguiente negociación), las guarda en `VB.NET_ICE = {turn, relayOnly:false, exp}` y las reutiliza hasta 10 min antes de
  caducar. Tras un fallo no se reintenta en 60 s. `pcConfig` con `relayOnly:false` = TURN + STUN sin `iceTransportPolicy` (policy
  `all`): WebRTC prueba lo directo y el TURN solo gana si nada más conecta, así que no sube el ping de quien ya conectaba.
  Credenciales caducadas = sin TURN. El TURN fijo de antes (`relayOnly:true`, policy `relay`) sigue funcionando igual.
- **`js/netlobby.js`**: `withTurn(fn)` antes de cada `offer()` / `answer()` (conexión nueva, respuesta del invitado y renegociación en
  pleno partido) y `turnReady()` al abrir la sala (anfitrión) o entrar (invitado), para que las credenciales ya estén cuando llegue el
  rival. Apagado con la URL vacía, sin sesión, con `?netemu`, `?olmock` y `?netice=none` (las pruebas de siempre no cambian).
  `?netturn=URL` (solo `file://` o localhost) la pone a mano para probar con `wrangler dev`.
- `Link.offer()/answer()` de un enlace ya cerrado rechazan sin crear otra conexión (el enlace se puede cerrar mientras se esperaba al
  Worker).

## Lo que NO toca

Ni la sim, ni las huellas, ni `g.rng`, ni el guardado, ni la interfaz (no hay botones nuevos). El texto de «No se ha podido conectar»
se queda igual.

## Privacidad

Con policy `all` cada rival sigue pudiendo ver la dirección del otro dentro de la SDP (como hasta ahora; el juego nunca la enseña).
Ocultarla del todo sería `relayOnly:true` (todo por TURN): más ping y más tráfico de pago. **Decisión provisional** (informe 4.1):
TURN solo de respaldo.

## Medir

`js/netlog.js` ya guarda el tipo de par (`host` / `srflx` / `relay`) en cada informe de red: cuántos salen `relay` = cuántos partidos
no habrían conectado sin TURN.

## Pruebas

`node tools/turntest.js` (57 comprobaciones, Node, sin red): cliente apagado/encendido/caché/lento/errores, Worker con tokens buenos y
malos, CORS, límites, Cloudflare caído y que no hay secretos en el repo. `npx wrangler@4 deploy --dry-run` en `turn-worker/` valida el
`wrangler.toml` sin desplegar.
