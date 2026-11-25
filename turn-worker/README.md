# turn-worker — credenciales TURN para el online

Worker de Cloudflare que da credenciales TURN **temporales (1 h)** a los jugadores con sesión, para que el 1 contra 1 conecte también
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
4. Pide permiso al tope de gasto (ver «Los dos cortes»): si está apagado, `503 {off:true, reason}` **sin llamar a Cloudflare**.
5. Llama a `https://rtc.live.cloudflare.com/v1/turn/keys/<TURN_KEY_ID>/credentials/generate-ice-servers` con `TURN_KEY_API_TOKEN`
   y `ttl` = 3600.
6. Devuelve solo las entradas TURN (sin el puerto 53): `{ iceServers: [{urls, username, credential}], ttl, exp }`.

Errores: 401 sin sesión o token malo, 403 sin Origin o con un origen que no es el juego, 429 demasiadas, 502 Cloudflare no contesta o faltan
los secretos de TURN, 503 apagado por el tope (`reason`: `cap` tope de credenciales, `usage` corte por consumo, `stale`/`noread` sin
lectura del consumo en 6 h, `config` falta `CF_ANALYTICS_TOKEN` o `ACCOUNT_ID`, `manual` `ENABLED = "false"`, `budget` el contador no
contesta). El juego trata cualquier error (también el 503) como «sin TURN» y sigue con STUN al momento.
`GET /health` → `ok` (siempre, también apagado: es público y no dice nada más).

## Los dos cortes (para no pagar nunca)

Cloudflare Realtime TURN regala **1.000 GB al mes** y luego cobra 0,05 $/GB, y **no tiene tope de gasto propio**. Por eso el Worker
se apaga solo antes de llegar:

1. **Tope de credenciales** (al instante). Un Durable Object `TurnBudget` (con SQLite: vale en el plan gratuito de Workers) cuenta
   las credenciales dadas en el mes (UTC, clave `AAAA-MM`). Con `MAX_CREDS_MONTH` (por defecto 20000) alcanzado → 503 hasta el mes
   siguiente; el día 1 empieza de cero solo. Frena a quien pida credenciales en masa aunque aún no hayan gastado tráfico.
2. **Corte por consumo real** (cada 15 min). Un cron lee de la API GraphQL de analíticas de Cloudflare
   (`https://api.cloudflare.com/client/v4/graphql`) los bytes TURN del mes de **toda la cuenta**:
   `viewer.accounts(filter: {accountTag: ACCOUNT_ID}).callsTurnUsageAdaptiveGroups(filter: {date_geq: día 1, date_leq: hoy}) { sum { egressBytes } }`.
   `egressBytes` (de los servidores TURN a los jugadores) es lo único que Cloudflare factura. Si el mes llega a `USAGE_CUTOFF_GB`
   (por defecto 800; GB = 10⁹ bytes; aunque pongas más, el Worker no pasa de 1000) → apagado hasta el mes siguiente.
   Referencia: [Realtime › TURN › Analytics](https://developers.cloudflare.com/realtime/turn/analytics/) (dataset
   `callsTurnUsageAdaptiveGroups`, métricas `egressBytes`/`ingressBytes`, permiso «Account Analytics»).
   - **Fail-safe**: sin `CF_ANALYTICS_TOKEN` o sin `ACCOUNT_ID` → apagado. Si pasan **6 h sin una lectura buena** (la consulta falla,
     el token caduca o el cron deja de correr) → apagado; se vuelve a encender solo con la siguiente lectura buena por debajo del corte.
   - El DO guarda el último consumo leído, la hora y el último error; el cron lo escribe en el registro del Worker
     (`npx wrangler@4 tail`, o panel → Workers → `ttc-turn` → Logs) como `turn-budget {"on":true,"usageGB":…}`.
   - Las analíticas llegan con unos minutos de retraso y son muestreadas: por eso el corte está en 800 y no en 1000.

Tras un corte, las credenciales ya dadas valen como mucho 1 h más (TTL 3600). La API de Cloudflare permite revocar una credencial
(`POST …/turn/keys/<id>/credentials/<username>/revoke`), pero el Worker no lo hace: habría que guardar cada username, y con el margen de
200 GB y el TTL de 1 h no hace falta.

Apagarlo a mano sin borrar nada: `ENABLED = "false"` en `wrangler.toml` y `npx wrangler@4 deploy`.

## Pasos para ponerlo en marcha (Ferran)

Hace falta Node (ya lo tienes) y la cuenta de Cloudflare donde está `takethecourt.com`. Todo se hace desde la carpeta `turn-worker`
del repo (`cd <repo>\turn-worker`); los comandos usan `npx`, no hay que instalar nada.

### 1. Crear la clave TURN en Cloudflare

1. Panel de Cloudflare → **Realtime** (antes «Calls») → **TURN Server** → **Create** (o «Create TURN key»).
2. Nombre: `take-the-court`.
3. Copia los dos valores que salen: **Turn Token ID** y **API Token**. El API Token solo se ve una vez: guárdalo
   en el gestor de contraseñas (o cifrado en `~/.secrets`, como el token DNS), **nunca** en el repo ni en un chat.

Precio: 1.000 GB gratis al mes y luego 0,05 $/GB. Un partido online pasa por TURN solo cuando no hay otra forma y gasta muy poco
(unos 65 bytes por foto de entradas). El Worker se corta solo en 800 GB («Los dos cortes»); aun así, si el panel lo ofrece, pon
también una alerta de uso (Billing → Notifications) como segunda red.

### 1b. Crear el token de analíticas (para el corte por consumo)

1. Panel de Cloudflare → arriba a la derecha, tu perfil → **My Profile** → **API Tokens** → **Create Token** → **Create Custom Token**.
2. Nombre: `ttc-turn-analytics`.
3. Permisos: **una sola línea**: `Account` · `Account Analytics` · `Read`. Nada más (ni Workers, ni DNS, ni Realtime).
4. Account Resources: `Include` → solo la cuenta de `takethecourt.com`. Sin filtro de IP (el Worker llama desde la red de Cloudflare).
   TTL: sin caducidad, o con fecha y un recordatorio (si caduca, a las 6 h el TURN se apaga solo hasta que lo cambies).
5. **Create Token** y copia el valor (solo se ve una vez): al gestor de contraseñas o a `~/.secrets`, nunca al repo ni a un chat.
6. Apunta también el **Account ID**: panel → la cuenta → **Overview** (o Workers & Pages), columna derecha, 32 caracteres hex.
   No es secreto: va en `wrangler.toml`.

Si ese token se filtra, solo deja leer estadísticas de la cuenta: bórralo en **API Tokens**, crea otro y repite el paso 5.

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

Debe acabar en `--dry-run: exiting now.` y listar `BUDGET (TurnBudget)`, `RATE_LIMITER`, `FIREBASE_PROJECT`, `ALLOWED_ORIGINS`,
`TTL`, `ACCOUNT_ID`, `MAX_CREDS_MONTH`, `USAGE_CUTOFF_GB` y `ENABLED`.

### 4. Poner el Account ID y desplegar

En `wrangler.toml` rellena `ACCOUNT_ID = "…"` con el Account ID del paso 1b (no es secreto). Luego:

```
npx wrangler@4 deploy
```

Crea el Worker `ttc-turn` y, por `custom_domain = true` de `wrangler.toml`, **el registro DNS de `turn.takethecourt.com` y su
certificado** (no hay que crear el registro a mano; si ya existiera uno con ese nombre, bórralo antes en DNS o wrangler se queja),
el Durable Object `TurnBudget` (migración `v1`, SQLite) y el cron de cada 15 min. Hasta el paso 5 contesta 502/503 a todo: no da
credenciales sin sus secretos.

Si el despliegue protesta por el bloque `[[ratelimits]]`, borra ese bloque de `wrangler.toml` y vuelve a desplegar: el Worker usa
entonces un límite sencillo propio.

### 5. Poner los secretos

```
npx wrangler@4 secret put TURN_KEY_ID
npx wrangler@4 secret put TURN_KEY_API_TOKEN
npx wrangler@4 secret put CF_ANALYTICS_TOKEN
```

Cada uno te pide el valor (pega el Turn Token ID y el API Token del paso 1, y el token de analíticas del paso 1b). Se guardan cifrados
en Cloudflare; no quedan en ningún archivo.

Espera a la siguiente pasada del cron (como mucho 15 min) y mira que lee bien el consumo:

```
npx wrangler@4 tail
```

→ una línea `turn-budget {"on":true,…,"usageGB":0,…,"err":""}`. Si sale `"err":"graphql: …"` o `"http 403"`, el token no tiene el
permiso o es de otra cuenta; si sale `"account_id"`, revisa `ACCOUNT_ID`. (En las primeras 6 h tras desplegar da credenciales aunque
el cron aún no haya leído; después, sin una lectura buena, se apaga.)

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

→ `3600` y una lista de `turn:`/`turns:`. Si contesta `503` con `off:true`, mira `reason` (arriba, «Qué hace»).

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

1. Copia `.dev.vars.example` como `.dev.vars` y pon los valores de los pasos 1 y 1b (`.dev.vars` está en `.gitignore`). Con
   `ACCOUNT_ID` vacío en `wrangler.toml` contesta 503 `config`: para probar, pásalo con `--var ACCOUNT_ID:<id>`. El cron se prueba con
   `npx wrangler@4 dev --test-scheduled` y `curl "http://localhost:8787/__scheduled?cron=*/15+*+*+*+*"`.
2. `npx wrangler@4 dev` → `http://localhost:8787`.
3. Abre el juego desde `http://localhost:8080/?netturn=http://localhost:8787/ice` con la sesión iniciada.

## Apagarlo

- Rápido, sin tocar Cloudflare: vacía `VB.NET_TURN_URL` en `js/netconfig.js` y publica.
- Sin publicar el juego: `ENABLED = "false"` en `wrangler.toml` y `npx wrangler@4 deploy` (503 a todo; el juego sigue con STUN).
- Del todo: `npx wrangler@4 delete` (borra el Worker, su dominio y el contador) y borra la clave TURN y el token de analíticas.
- Si el API Token se filtra: borra la clave TURN en el panel, crea otra y repite el paso 5.

## Pruebas

`node tools/turntest.js` (desde la raíz del repo): el Worker con un par RSA de prueba y un Cloudflare de mentira, y el cliente con un
Worker de mentira (apagado, caché, Worker lento, errores), y el tope de gasto: el Durable Object de verdad sobre la SQLite de Node
(`node:sqlite`; si no está, un Map), tope de credenciales, cambio de mes, corte por consumo con un GraphQL de mentira, fail-safe de
6 h y que con un 503 el cliente sigue con STUN. No usa red ni claves de verdad.
