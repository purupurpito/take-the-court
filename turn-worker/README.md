# turn-worker — credenciales TURN para el online

Worker de Cloudflare que da credenciales TURN **temporales (2 h)** a los jugadores con sesión, para que el 1 contra 1 conecte también
cuando dos móviles no pueden hablar directamente (CGNAT de la operadora, redes de empresa o de la universidad). Imprescindible 4.1 del
informe del 21-nov; diseño en `notes/turn.md`.

- El juego **solo** usa el TURN si la conexión directa no sale (policy `all`): no sube el ping de quien ya conectaba.
- Las claves de Cloudflare son **secretos del Worker**: nunca van en el repo (el repo es público).
- Mientras `VB.NET_TURN_URL` de `js/netconfig.js` esté vacía, el juego no hace ninguna petición: desplegar el Worker no cambia nada
  hasta que se pone la URL.

## Qué hace

`POST https://turn.takethecourt.com/ice` con `Authorization: Bearer <ID token de Firebase>`:

1. Exige la cabecera `Origin` de uno de `ALLOWED_ORIGINS` (sin Origin → 403: corta curl y los scripts de copiar y pegar; no es
   infalible, un script puede inventársela).
2. Comprueba el ID token (firma RS256 con las claves públicas de Google, proyecto `make-the-cut-vb`, sin caducar).
3. Límite por cuenta **y por IP** (`CF-Connecting-IP`), 20 por minuto cada uno: las cuentas se crean gratis con la clave pública del
   repo, así que el límite por cuenta solo no frena a quien saca cuentas nuevas.
4. Llama a `https://rtc.live.cloudflare.com/v1/turn/keys/<TURN_KEY_ID>/credentials/generate-ice-servers` con `TURN_KEY_API_TOKEN`
   y `ttl` = 7200.
5. Devuelve solo las entradas TURN (sin el puerto 53): `{ iceServers: [{urls, username, credential}], ttl, exp }`.

Errores: 401 sin sesión o token malo, 403 sin Origin o con un origen que no es el juego, 429 demasiadas, 502 Cloudflare no contesta o faltan secretos.
`GET /health` → `ok`.

## Pasos para ponerlo en marcha (Ferran)

Hace falta Node (ya lo tienes) y la cuenta de Cloudflare donde está `takethecourt.com`. Todo se hace desde la carpeta `turn-worker`
del repo (`cd <repo>\turn-worker`); los comandos usan `npx`, no hay que instalar nada.

### 1. Crear la clave TURN en Cloudflare

1. Panel de Cloudflare → **Realtime** (antes «Calls») → **TURN Server** → **Create** (o «Create TURN key»).
2. Nombre: `take-the-court`.
3. Copia los dos valores que salen: **Turn Token ID** y **API Token**. El API Token solo se ve una vez: guárdalo
   en el gestor de contraseñas (o cifrado en `~/.secrets`, como el token DNS), **nunca** en el repo ni en un chat.

Precio: Cloudflare Realtime TURN tiene un tramo gratis al mes y luego cobra por GB. Un partido online pasa por TURN solo cuando no
hay otra forma y gasta muy poco (unos 65 bytes por foto de entradas); mira el precio actual en el panel antes de activarlo.

**Antes de desplegar, pon una alerta de gasto** (Cloudflare → Billing → Notifications / alertas de uso de Realtime, o un tope si
el panel lo ofrece). Aunque el Worker pide sesión, Origin y tiene límites por cuenta y por IP, cualquiera puede crear cuentas gratis:
un abuso con muchas IP podría usar el TURN como relé y lo que pase del tramo gratis se cobra en tu cuenta. Con la alerta te enteras
el primer día; si salta, quita la URL de `js/netconfig.js` (el juego vuelve a solo STUN) y borra la clave TURN en el panel.

### 2. Entrar con wrangler

```
npx wrangler@4 login
```

Abre el navegador; acepta con la cuenta de Cloudflare de `takethecourt.com`. (El token DNS que ya tienes no vale para desplegar
Workers: es solo de DNS.)

### 3. Probar el código sin desplegar (opcional)

```
npx wrangler@4 deploy --dry-run
```

Debe acabar en `--dry-run: exiting now.` y listar `RATE_LIMITER`, `FIREBASE_PROJECT`, `ALLOWED_ORIGINS` y `TTL`.

### 4. Desplegar

```
npx wrangler@4 deploy
```

Crea el Worker `ttc-turn` y, por `custom_domain = true` de `wrangler.toml`, **el registro DNS de `turn.takethecourt.com` y su
certificado** (no hay que crear el registro a mano; si ya existiera uno con ese nombre, bórralo antes en DNS o wrangler se queja).

Si el despliegue protesta por el bloque `[[ratelimits]]`, borra ese bloque de `wrangler.toml` y vuelve a desplegar: el Worker usa
entonces un límite sencillo propio.

### 5. Poner los secretos

```
npx wrangler@4 secret put TURN_KEY_ID
npx wrangler@4 secret put TURN_KEY_API_TOKEN
```

Cada uno te pide el valor (pega el Turn Token ID y el API Token del paso 1). Se guardan cifrados en Cloudflare; no quedan en
ningún archivo.

### 6. Comprobar

```
curl https://turn.takethecourt.com/health
```

→ `ok`. Y sin sesión tiene que decir que no:

```
curl -i -X POST https://turn.takethecourt.com/ice
```

→ `401`. Con sesión se prueba desde el juego (paso 7) o, en la consola del navegador con la cuenta abierta en takethecourt.com:

```
VB.Account.netAuth().then(a => fetch('https://turn.takethecourt.com/ice', {method: 'POST', headers: {Authorization: 'Bearer ' + a.token}})).then(r => r.json()).then(j => console.log(j.ttl, j.iceServers[0].urls))
```

→ `7200` y una lista de `turn:`/`turns:`.

### 7. Encender el TURN en el juego

En `js/netconfig.js` cambia la última línea:

```
if (!VB.NET_TURN_URL) VB.NET_TURN_URL = 'https://turn.takethecourt.com/ice';
```

y publica como siempre. Para probarlo antes sin publicar, sirve el repo en local (`npx http-server -p 8080` desde la raíz) y abre
`http://localhost:8080/?netturn=https://turn.takethecourt.com/ice` con la sesión iniciada (`?netturn` solo vale desde `file://` o
`localhost`; `ALLOWED_ORIGINS` ya incluye `http://localhost:8080`; desde `file://` el Worker contesta 403, porque el origen es `null`).

### 8. Medir

`js/netlog.js` ya apunta en cada informe de red el tipo de par (`type`: `host` / `srflx` / `relay`). Al cabo de unos días, mira
cuántos partidos salen `relay`: esos son los que antes no conectaban.

## Probar en local con «wrangler dev» (opcional)

1. Copia `.dev.vars.example` como `.dev.vars` y pon los dos valores del paso 1 (`.dev.vars` está en `.gitignore`).
2. `npx wrangler@4 dev` → `http://localhost:8787`.
3. Abre el juego desde `http://localhost:8080/?netturn=http://localhost:8787/ice` con la sesión iniciada.

## Apagarlo

- Rápido, sin tocar Cloudflare: vacía `VB.NET_TURN_URL` en `js/netconfig.js` y publica.
- Del todo: `npx wrangler@4 delete` (borra el Worker y su dominio) y borra la clave TURN en el panel.
- Si el API Token se filtra: borra la clave TURN en el panel, crea otra y repite el paso 5.

## Pruebas

`node tools/turntest.js` (desde la raíz del repo): el Worker con un par RSA de prueba y un Cloudflare de mentira, y el cliente con un
Worker de mentira (apagado, caché, Worker lento, errores). No usa red ni claves de verdad.
