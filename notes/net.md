# notes/net.md — modo online (especialista `net`)

Dueño: **net** (`js/net*.js`, `tools/mptest.js`, `tools/net*.js`, `tools/viewtest.js`, `tools/roomtest.js`). Diseño aprobado: rollback simétrico entre dos
pares con reparación por instantánea del anfitrión; solo viajan las entradas con su tic; WebRTC DataChannel; señalización por Firestore
REST; vista espejo para el invitado (`js/netview.js`). Decisiones de Ferran (16-nov-2026) que mandan sobre el diseño: lobby con lista de
salas, solo con cuenta, stats de la Carrera por defecto (opción «Igualado»), cada humano lleva SIEMPRE a 1 jugador, gorra «Online Beta
Tester» como única recompensa, sin pausa en juego (10 s entre sets, se salta si los dos pulsan «Continuar»), del rival solo el nombre
(nunca la IP ni el correo).

---

## Fase 0 — simulación con dos huecos humanos (16-nov-2026)

Solo Node, sin red ni interfaz. Todo va detrás de `opts.online`: sin esa opción la simulación hace exactamente lo de siempre
(`node tools/simtest.js` → «huella 2v2 idéntica», `node tools/fingerprint6.js --variant mastery` → idéntica).

### Cómo se crea y se avanza

```js
var g = VB.Sim.createGame({
  online: true, seed: 12345, venue: 'beach' | 'hall', points: 21, bestOf: 1 | 3, present: true, stats: true,
  even: false,                                   // «Igualado»: sin atributos ni insignias para nadie
  humans: [ { idx: 0, aimSet: true, attrs: {...}, badges: {...} },   // hueco 0 = equipo 0 = anfitrión
            { idx: 0, aimSet: true, attrs: {...}, badges: {...} } ]  // hueco 1 = equipo 1 = invitado
});
VB.Sim.step(g, 1 / 120, [entradaHueco0, entradaHueco1]);
```

- **Hueco = equipo.** El hueco 0 es el equipo 0 (x > 0, el anfitrión) y el hueco 1 el equipo 1. `idx` = qué jugador lleva (0 = su
  n.º 1, por defecto). Cada humano lleva siempre a UN jugador (`ctrlMode 'one'`); su compañero es la IA con `DIFF.mate`.
- **Forzado por el online:** 2v2, sin demo ni autopilot, sin Entrenamiento ni banquillo, nivel `'normal'` (lo usa el toque de red del
  bloqueo activo), sin «primer partido», maestría activada (`mastery: false` la apaga), `g.prof = [DIFF.mate, DIFF.mate]` y timing común
  `VB.TIMING.online` (= el de Normal: `assist` 0,22, `swing` 0,36, `lock` 0,09; decisión D9).
- **Partido:** a 21 por defecto (`points` acepta 11/15/21/25; la playa siempre 21). `bestOf: 3` = mejor de 3 (21-21-15); si no, **1 set**
  (`g.bo1`). El 3r set a 15 sale del `setTarget` de siempre.
- **Atributos por hueco:** `humans[s].attrs` / `.badges` van al jugador `idx` del equipo `s` (internamente `opts.attrs` /
  `opts.badges` de siempre). Los compañeros IA, neutros. `even: true` (Igualado) los ignora todos.
  - **De dónde salen (para las fases de interfaz):** por defecto, los atributos e insignias del jugador de la Carrera activa
    (`make-the-cut.career` o `make-the-cut.career6`, según `make-the-cut.career.mode`); si no hay Carrera, los del escuadrón de Partido rápido
    (`VB.Prog`, `make-the-cut.squad`); si tampoco, neutros (sin `attrs`). Cada uno manda los suyos en el apretón; la sim solo los recibe.
- **Saque:** cada equipo empieza sacando con su jugador humano (con `idx 1` en el equipo 1 el orden de saque se refleja, como `ctrlIdx`
  en el equipo 0).

### Entrada por hueco (un objeto por tic)

`{move:[x,y], hit, jump, jset, switchPlayer}` como siempre (mundo; `switchPlayer` no hace nada en el online) y los **bits de partido**:

| bit | tipo | qué hace |
|---|---|---|
| `chal` | flanco | challenge del equipo del hueco en ese tic (`challenge(g, s)`; solo vale si `canChallenge(g, s) > 0`) |
| `tmo` | flanco | **desactivado por defecto** (decisión 5 de Ferran: no hay pausa durante el juego; `g.tmoPer = 0`, `tmoLeft [0, 0]`, el bit no hace nada). Solo con `createGame({…, timeouts: true})` (opción de sala que, si Ferran la quiere, habrá que confirmar con él): `ONLINE.tmoPerSet` = 1 por set y equipo. No se puede pedir en la pausa entre sets (`g.pendingSet`) y, si el set acaba con uno pedido, se anula (`timeoutCancel`) y no pasa al set siguiente. Empieza con el balón muerto (modo `point`, o saque con el balón en la mano) **y solo cuando ya no queda ventana de challenge para nadie** (ni `cpuChal` pendiente): así el tiempo muerto de uno nunca le quita el challenge al otro. Dura `tmoDur` = 30 s y cualquiera lo reanuda con `skip` a partir de `tmoMin` = 10 s (una pulsación anterior queda apuntada) |
| `skip` | flanco | «Continuar»: queda apuntado hasta el final de la pausa; la pausa del punto (y la de **10 s entre sets**, `ONLINE.setPause`) solo se salta cuando los DOS lo han pulsado. Un hueco con la IA cuenta como «sí» |
| `ai` | nivel | mientras vale `true`, el hueco lo lleva la IA (al instante, también si sacaba con el balón en la mano: se le prepara el ritual de la CPU). Al soltarlo vuelve al humano en el siguiente balón muerto (`point`/`over`) |

No hay pausa local: la simulación online nunca se para salvo la revisión del challenge (y el tiempo muerto, si la sala lo activa).

### Eventos nuevos (solo online)

`timeoutReq {team}`, `timeout {team, dur, left:[n0, n1]}`, `timeoutEnd {team}`, `timeoutCancel {team}`, `skipReq {team}`, `slotAI {team, on}`.
`point` lleva además `text1`: el mismo texto visto desde el equipo 1 (el invitado). `text` sigue escrito desde el equipo 0 («El balón cae
en tu campo» = en el campo del equipo 0); la vista del invitado debe pintar `text1` (y `g.lastPoint.text` es el del anfitrión;
`stats.why` cuenta con el texto del anfitrión). Los demás, como siempre (`hit.human`, `toss.human`… valen para los dos equipos). `cpuChallengeDecide` solo actúa en un hueco traspasado a la IA.

### Cómo está hecho (para quien toque `sim.js` / `ai.js`)

- `g.hum[s] = {team, p, ai, aiBack, aim3, swingAim, aimIn, …SLOT_S}`: el estado del gesto de cada humano (`hitBuf, jsetQ, swingLive,
  swingShot, swingLock, swingHasAim, setWinOn, setCarry, setCarryK, setDirA, lastGrade, swingT0, swingShot0, swingSwapT, defRole, aimOn,
  aimLen, swingLen, aimSet`).
- **Hueco activo** `g.hT`: el gesto del hueco activo vive en los campos de siempre de `g` (`g.ctrl`, `g.hitBuf`, `g.aim3`…), así todo el
  código del humano sirve igual. `VB.Sim.useSlot(g, t)` cambia el activo (guarda el gesto del anterior en `g.hum`). Al acabar cada paso
  el activo es el 0 y `g.hum[0]` queda al día: `g.ctrl` es el jugador del anfitrión. Para leer el de otro hueco sin activarlo:
  `VB.Sim.slotGet(g, t, campo)`. **La interfaz y la red leen siempre con `slotGet`, nunca con `useSlot`** (useSlot cambia `g`). Por si
  acaso, `serialize` deja antes el hueco 0 activo, así la foto es canónica aunque alguien haya llamado a `useSlot` entre pasos.
- `step(g, dt, inputs)` con `g.online` va a `stepOnline` (camino aparte; el `step` de siempre no se toca). Orden de un paso: entradas de
  los dos huecos → bits → revisión → tiempo muerto → punto → saque (con el hueco del sacador activo) → peloteo: `computeJob` de cada
  equipo con su hueco activo, humano 0, humano 1 y luego la IA de cada jugador con el hueco de su equipo activo.
- Funciones compartidas con el humano generalizadas al «equipo del humano» (`ht`), idénticas con `ht = 0` fuera del online: `isHuman`,
  `jsetReady`/`altReady`/`setTurn` (la caché por paso también mira `g.ctrl` en el online), `updateDefense`, `updateAim3`, `assistMove`,
  `focusPoint`, `aimPoint`, `serveAimReset`, `stepServe`, `setAim` (colocador IA lejos del humano rival), la racha de la jugada perfecta,
  `digTight`, `checkBody` (gesto del hueco del jugador), el fin del gesto y la diana al tocar o pitar (`endSwingX`, `aimOff`: los dos
  huecos). En `ai.js`, el sesgo de `computeJob`, la batida del atacante IA ante la colocación del humano, el reparto bloqueo/defensa, la
  lectura de la finta y la lectura de la colocación en salto del humano rival (`VB.Sim.jsetHum(g, t)` + `VB.Sim.jsetHumSw`).
- `VB.Sim.humOn(g, t)` (¿el equipo t tiene humano ahora?), `VB.Sim.humSlot(g, p)` (hueco que lleva a p o -1), `VB.Sim.setSlotAI(g, s,
  on)` (lo usa el bit `ai`; también vale para la red si hace falta un traspaso inmediato).

### Foto del estado (reparación por instantánea)

- `VB.Sim.serialize(g)` → `{v: VB.Sim.SER_V, rng, o: [...]}` (JSON-able): grafo con referencias `{$r}`, perfiles y timings del módulo por
  nombre `{$c: 'DIFF.mate'}`, `-0`/`NaN`/`±Infinity` como `{$n}`, `undefined` como `{$u}`. Sin `rng` (va su estado), `events`, `replay`
  ni `opts`; **con** `stats`. `SER_V` = 2 (desde que existe `g.tmoPer`). Unos 9-11 KB en JSON (≈ 3-4 KB con gzip, estudio 1).
- `VB.Sim.deserialize(obj, dst)` → dst (creada con `createGame` y las MISMAS opts) idéntica bit a bit a la original, o `null` si la
  versión no cuadra. Usa `copyGame` sobre la foto decodificada (jugadores por id, objetos de dst). `SER_V` se sube si cambia la forma
  del estado; la red además ata la versión de protocolo a `VB.VERSION`.
- `copyGame` funciona igual entre partidas online (prueba (d)).

### Pruebas — `node tools/mptest.js` (Node, ~3 min)

(a) 20 partidos con un bot de solo entrada en cada hueco (playa y pabellón, 1 set a 21): sin excepciones, todos acaban, los dos equipos
dan toques humanos calificados y sacan como humanos, sin ritual de la CPU para un sacador humano, sin challenges de la CPU, cada toque
humano del jugador de su hueco. (b) Simetría: misma semilla con el bot fuerte en el equipo 0 y luego en el 1 (cuota de puntos y % de
perfectos ±5 %) y bots iguales (el equipo 0 gana el 50 % ±5 %). Medido: fuerte 65,4 % / 63,6 %, perfectos 73,7 % / 74,4 %; iguales
50,2 %. (c) Bits: `chal` de cada equipo (el del otro no vale y gasta solo el suyo), `skip` con uno no salta y con los dos sí (también los
10 s entre sets), `tmo` (sin `timeouts: true` no existe; con él: pedido en juego, entra en balón muerto, nadie se mueve, no antes de
10 s, 1 por set; un tiempo muerto pendiente no le quita el challenge al rival; entre sets no se puede pedir y la pausa sigue en 10 s con
el set siguiente con su tiempo muerto entero), `text1` del punto (visto desde el invitado; fuera del online no existe), `ai` (juega y saca la IA,
la entrada no cuenta, vuelve en el balón muerto). (d) `serialize → JSON → deserialize` en saque, peloteo, punto, revisión y tiempo
muerto, pabellón y playa: huella canónica exacta (bits de cada double, -0 y NaN incluidos) igual al instante y durante 2 000 pasos con
bits mezclados; `copyGame` también; la foto es la misma aunque la interfaz haya llamado a `useSlot`. 30 pruebas. (e) Atributos por hueco, Igualado, perfil común, 1 set / mejor de 3, saque del n.º 2 del equipo 1 y
que fuera del online no exista nada de esto.

### Pendiente de la fase 0 (ya resuelto o repartido)

- Bit `away` (pestaña oculta): en la red es `session.setAway(bool)` → bit `ai`. Falta conectarlo a `visibilitychange` (fase 3; ver abajo).
- Tiempos muertos: apagados. Si Ferran los quiere, será una opción de la sala (`timeouts: true`) que pasa a `createGame`.
- `text1` del punto: HECHO en `netview.mapEvents` (el invitado ve `text1` como `text`; `lastPoint.text` también se gira).

---

## Fase 1 — partida online entre dos pestañas de este PC (16-nov-2026)

Ficheros: `js/net.js` (`VB.Net`), `js/netview.js` (`VB.NetView`), rama online de `js/main.js`, `tools/nettest.js`, `tools/viewtest.js`,
`tools/netdrive.js`. Las huellas de siempre no cambian (todo lo online va por `opts.online` / `ctx.net`).

### Sesión (`js/net.js`)

```js
var s = new VB.Net.Session({ slot: 0 | 1, link, opts /* createGame; el invitado: null = adopta las del anfitrión */, delay: 2, name: 'Nombre' });
var r = s.advance(performance.now(), { move: [x, y] /* mundo canónico */, hit, jump, jset });   // una vez por frame
// r = {g (partida predicha), events (para presentar), confirmed (de gc), status, tick, gcTick, ping, waitMs, unstable, canAI, startIn, solo, valid, result,
//      rivalSolo (el rival sigue contra la IA mientras espera), gone (ya juzgado el abandono por tiempo)}
s.request('chal' | 'skip' | 'tmo'); s.setAway(true); s.vsAI(); s.quit();
```

- **Dos partidas:** `gc` (confirmada: avanza solo con las dos entradas de cada tic; de ella salen huella, estadísticas y final) y `gp`
  (predicha, la que se pinta): cada frame `copyGame(gp, gc)` y se resimula hasta el tic actual con las entradas propias reales y las del
  rival predichas (su último `move`, los flancos a falso, el bit `ai` como estaba). Sin búfer de instantáneas: `gc` es la única foto.
- **Entrada:** se cuantiza antes de usarla también en local (`move` en int16, bits `hit 1, jump 2, jset 4, chal 8, skip 16, tmo 32, ai 64`).
  La propia se aplica con `delay` = 2 tics (17 ms). Un flanco pulsado entre tics se queda apuntado hasta el primer tic que se genera
  (un tic, una entrada), **como mucho 150 ms** (`EDGE_TTL_MS`): pulsado con la partida congelada o en la cuenta atrás se descarta (nada de
  saltos o golpes «fantasma» segundos después al volver la red). Los tics `0..delay-1` son neutros para los dos (no viajan).
- **Paquete** (canal `'in'`, no fiable, cada frame): `[1, u32 primer tic, u8 n, n × (i16 x, i16 y, u8 bits), u32 ack, u32 tic del emisor]`.
  Lleva todo lo que el otro aún no ha confirmado (`ack` = cuántas entradas seguidas tiene): la redundancia cubre la pérdida sin
  retransmitir (en trozos de 255, 4 paquetes por frame como mucho). Unos 1,6 KB/s con RTT 0 y ~10 KB/s con RTT 250 y 5 % de pérdida.
- **Control** (canal `'ctl'`, fiable y en orden, JSON): `hello {v, ver, name, cfg, live}`, `ping/pong`, `ready`, `start {t0}`, `hash {t, h}`,
  `snap {t, d}`, `snapok`, `resync {T, F, d, t0, mine, fab, valid}`, `solo`, `rejoin {e}`, `invalid`, `bye {why: quit|left|gone|late|version}`. El saludo compara `PROTO` y `VB.VERSION`:
  si no coinciden, `status 'ended'`, `result.why 'version'` («Tu rival tiene otra versión del juego: recargad los dos»).
- **Reloj común:** el invitado hace 8 pings y toma la mediana del desfase de los 3 de menor RTT; el anfitrión fija `t0` = su reloj + 1,5 s
  y lo manda; cada uno calcula su tic objetivo `(now − t0) / (1000/120)`. Se pone al día por tandas de 40 tics como mucho por frame
  (sin `MAX_STEPS` ni `acc = 0`). **Ventaja de frames** (GGPO): si de media vas más de 1,5 tics por delante del rival (su tic + medio
  RTT), cedes 1/8 de tic por frame hasta igualar.
- **Espera:** la predicción llega a 24 tics (200 ms). Más allá, la partida se congela (`status 'waiting'` a los 100 ms, `waitMs`) y el
  reloj se congela con ella (al volver no hay ráfaga). `unstable` = más de 1 s sin recibir nada. `canAI` a los 10 s de espera → la
  interfaz ofrece «Seguir contra la IA» (`vsAI()`, solo en `'waiting'` y pasados 10 s: el hueco del rival lo lleva la IA en todos los
  tics que hagan falta **hasta que vuelva**) o «Abandonar». Ver «Desconexión y reconexión».
  **Límite práctico (auditoría, 17-nov-2026):** con un RTT de unos 350-400 ms (o unos 300 ms con mucha variación) el rival va unos
  22 tics por detrás, casi en el tope de 24: la variación y las pérdidas lo cruzan sin parar y la partida da tirones (unas 3 esperas
  cortas por segundo, ninguna de más de 100 ms, así que el HUD no dice nada) y va un ~10 % más lenta que el reloj. No se corrompe nada
  (huellas iguales, sin reparaciones). Arreglo barato si un día molesta: que el anfitrión suba el retraso de entrada según el ping de los
  pings del reloj (p. ej. `clamp(round(rtt/2/STEP_MS) − 16, 2, 8)` en `cfg.delay`, que ya admite hasta 8); o subir MAXPRED a 32-36
  (rollbacks más hondos). `nettest` llega hasta RTT 250.
- **Huella y reparación:** cada 120 tics confirmados (1 s) los dos se mandan `Sim.stateHash(gc)`; el anfitrión guarda además
  `Sim.serialize(gc)` de las 6 últimas. Si una huella no cuadra, el anfitrión manda la foto de ese tic; el invitado hace
  `Sim.deserialize(foto, gc)`, resimula hasta donde estaba con las entradas que ya tenía (sin presentar eventos), reenvía sus huellas
  rehechas y contesta `snapok`. Con 3 reparaciones en 60 s el partido queda «no válido» para los dos (`valid = false`).
- **Reconexión** (`resync`): si el invitado vuelve (página recargada → saludo y reloj de nuevo, la red vuelve con el anfitrión contra
  la IA, o el invitado contra la IA pide `rejoin`), el anfitrión fija la IA en el hueco del invitado hasta `F` = su tic + delay + 60, confirma lo que puede y le manda la foto de
  `gc` (tic `T`), sus entradas desde `T`, las de IA `T..F` y su `t0`. El invitado lo adopta todo y manda desde `F`. Huellas y fotos de
  antes de `T` ya no cuentan (`syncFloor`; el anfitrión borra TODAS las huellas recibidas) y lo de antes de volver no se presenta
  (`muteBefore`). El invitado borra de sus dos historiales todo lo del tic `T` en adelante (`Ring.clearFrom`: lo de su partida contra la
  IA no vale) y su `valid` pasa a ser el del anfitrión (salvo que él mismo lo anulara por reparaciones, que ya avisó con `invalid`).
- **Desconexión y reconexión** (revisión de la fase 1). Regla única: **el rival tiene 60 s desde que se perdió para volver, elija quien
  elija la IA** (`lostAt` = inicio de la espera; el contador sigue corriendo contra la IA, no solo esperando).
  - Cualquiera de los dos (o los dos, que en un corte ven la oferta a la vez) puede pulsar «Seguir contra la IA». Contra la IA no se
    mandan huellas. El invitado contra la IA no manda entradas y su partido no cuenta mientras no vuelva (`valid = false`).
  - Vuelve la red dentro de los 60 s: si el invitado esperaba, sus entradas le llegan al anfitrión contra la IA y este manda el
    `resync`; si el invitado estaba contra la IA, al oír de nuevo al anfitrión manda `rejoin {e}` (una «época» por cada vez que eligió
    la IA; el anfitrión contesta un resync por época, esté esperando o contra la IA). Los dos siguen en el MISMO partido, el del
    anfitrión. `solo` ya no acaba nada: solo avisa (`r.rivalSolo`, «Esperando a <nombre>… (sigue contra la IA)»).
  - Pasados 60 s sin volver, cada lado juzga por su cuenta y no cambia después (`gone`): el anfitrión `result {rivalGone, win: true}`
    (válido), el invitado `{hostGone, win: false}` con `valid = false` (no cuenta: no se sabe quién se cayó y «si se cae el anfitrión no
    cuenta»). Los dos pueden seguir contra la IA, sin que cambie el resultado. Se manda `bye {why: 'gone'}` (llega al volver la red). Si
    el partido contra la IA acaba antes de que el rival vuelva, se juzga igual en ese momento. Un rival que vuelve tarde recibe
    `bye {why: 'late'}` (`result {late, win: false}`, «Has tardado demasiado en volver: cuenta como abandono») salvo que ya se hubiera
    juzgado él mismo; un `resync` que llega a un invitado ya juzgado se contesta con `bye {why: 'gone'}`.
  - Comprobado (Node, `memPair` 80 ms ± 10, 2 % de pérdida, corte a los 20 s): corte de 15 s y de 40 s con IA elegida por el anfitrión,
    por el invitado o por los dos → resync, sin reparaciones, y el partido acaba con resultados complementarios (gana uno, pierde el
    otro, los dos válidos); corte de 70 s y de 120 s → anfitrión `rivalGone` (gana), invitado `hostGone` (no cuenta), sin cambios al volver.
- **Abandono:** `quit()` manda `bye {why: 'quit'}` → `result {why: 'quit', win: false}` para ti y `{why: 'rivalQuit', win: true}` para el rival.
  Tras el final (`'over'`) o ya juzgado el abandono por tiempo, `quit()` solo manda `bye {why: 'left'}` y **no toca el resultado** (main.js
  lo llama al volver al menú desde la hoja final).
- **Eventos para presentar:** salen de las dos partidas (los de `gc` al confirmar y los de `gp` al predecir) con su tic. Clave
  `(tic, tipo, jugador, equipo)`; el punto por marcador (`P` + marcador + sets + equipo; a más de 2 s de distancia es otro punto).
  Un evento ya presentado no se repite; uno que aparece «en el pasado» tras un rollback se presenta si tiene menos de 150 ms o si no es
  de solo sonido/efecto (los de marcador y partido siempre); `gameOver` solo cuando está confirmado. Lo que desaparece tras un rollback
  ya sonó (aceptado). Lo que deja huella (récord, estadísticas) debe leerse de `confirmedGame()` / `r.confirmed`.
- **Transportes:** `{send(ch, data), poll(now) → [{ch, data}], close()}`. `memPair({lag, jit, loss, seed, clock})` (Node; `down(ms)` corta la
  red: las entradas se pierden y el control llega al volver; `flush()`), `BcLink({room, slot, lag, jit, loss})` (BroadcastChannel; el
  retraso se aplica al recibir, con el reloj de cada página). `lag` = RTT en ms (ida = lag/2), `jit` = ± variación de cada sentido,
  `loss` = % de pérdida del canal de entradas. `RtcLink` (WebRTC) es de la fase 2.
- **Ganchos de prueba:** `record` (entradas confirmadas por tic), `hashLog`, `onTick(tic, gc)`; `VB.Net.bot(team, seed)` (bot de solo
  entrada; lee con `useSlot` y deja el hueco 0).

### Vista espejo (`js/netview.js`)

- `mirror(view, g, slot)`: `copyGame(view, g)` y, con `slot 1`, `flip(view)`. `view` = `Sim.createGame` con las MISMAS opciones (la
  crea main.js una vez; cada frame se copia encima, así los módulos ven siempre el mismo objeto).
- `flip` es una **involución exacta** (`flip(flip(v))` = `v` bit a bit): x → −x, y → −y en balón, jugadores (`x, y, vx, vy, jvx, jvy, lvx, lvy,
  rvx, rvy, tgx, tgy`), predicciones, `aim3`, `lastLand`, `antennaHit`, `call`, `review`, `ritual.rx/ry`; parejas por equipo
  intercambiadas (`score`, `sets`, `setScores`, `serverIdx`, `challenges`, `jobs`, `prof`, `skipReq`, `tmoLeft`…, `blockOff` además
  negado); índices de equipo 0 ↔ 1 (`serving`, `touchTeam`, `lastTeam`, `setPoint`…, `p.team`, `lastPoint.team/landSide`); `teams`
  intercambiados y `players` = teams[0] + teams[1]; `hum` intercambiado y el gesto del invitado pasa a los campos de siempre de `g`
  (`view.ctrl` = su jugador, `ctrlIdx`, `hitBuf`, `aim3`…). Los textos del árbitro que dependen de quién mira se cambian
  («El balón cae en tu campo» ↔ «…en el campo rival»).
- **Lista cerrada:** `FIELDS` (g), `PLAYER`, `NESTED` (objetos anidados) y `EVENT`. `tools/viewtest.js` falla si aparece un campo sin
  clasificar: quien añada un campo a la sim tiene que clasificarlo aquí (girar, intercambiar, equipo o tal cual).
- `mapEvents(evs, view, slot, out)`: copias de los eventos con los jugadores de la vista (por id) y, para el invitado, girados
  (`x, y, vx, vy, aim, target, dir, antenna`), equipos cambiados (`team, landSide, setPoint, matchPoint`), parejas intercambiadas
  (`score, sets, left, challenges, setScores`) y `text` ↔ `text1`.
- `inputToWorld(inp, slot)`: la entrada se construye con la cámara de la vista; el invitado gira `move` antes de mandarla.

### Rama online de `js/main.js`

- `ctx.actions.startOnline({slot, link, opts, name})` crea la sesión (`ctx.net`). Cuando hay opciones (el invitado las recibe en el
  saludo) se crea la vista, se fuerza la sede (`opts.mapId` o el tipo) y `setGame(vista)`. Cada frame `netFrame`: entrada de la vista →
  `inputToWorld` (o `ctx.netBot(gCanónica)` en pruebas) → `session.advance` → `NetView.mirror` → `mapEvents` a `frameEvents`.
  `gameOver` confirmado → `'over'`. Cualquier botón en la pausa del punto = «Continuar» (`request('skip')`); el challenge (V / LT) =
  `request('chal')`. Sin pausa (Esc alterna un botón «Abandonar» en el HUD), sin intro, sin repetición y sin `timeScale`.
- HUD `#netHud` (arriba a la izquierda, bajo el marcador): «Esperando a que entre tu rival…», «Conectando…», «Contra <nombre> · empieza
  en 1,2 s», «Contra <nombre> · 80 ms» (ámbar por encima de 150 ms), «Conexión inestable», «Esperando a <nombre>…» con «Seguir contra la
  IA» / «Abandonar» a los 10 s, y los finales («<nombre> ha abandonado: ganas tú», «Tu rival tiene otra versión del juego…»). El nombre
  se pinta siempre como texto (nunca HTML). `#netTag`: el NOMBRE del rival con una flechita encima de su jugador (proyección de su
  posición + 2,25 m), con `z-index` 2: por debajo del marcador (`#hud`, 3). `#netHud` se coloca cada medio segundo justo debajo de `#sb`
  (el marcador cambia de alto). Nunca se enseña la IP ni el correo.
- Hoja final online: hasta la revancha (fase 3) solo «Volver al menú» (ui.js `onlineEndButtons`; `endPrimary` con `ctx.net` va al menú,
  nunca a un partido offline contra la CPU).
- **Prueba en este PC:** `index.html?net=bc&slot=0` y `?net=bc&slot=1` (mismo `room`), con `&lag=80&jit=15&loss=3`, `&name=`, `&bot=1`
  (juega un bot), `&bo=3`, `&points=`, `&map=palau`. `?net=` implica `ctx.debug = 'net'` (sin récord ni XP; la pestaña oculta no pausa).
  A mano: dos VENTANAS del mismo Chrome lado a lado (no pestañas: la oculta se frena), teclado en una y mando en la otra.

### Pruebas

- `node tools/nettest.js` (Node, ~1 min; `--quick` = 90 s de partido): dos sesiones en contextos vm distintos (cada una con su Math),
  relojes desfasados 123 s, frames con tirones. (1) RTT 0/60/120/250 ms, variación, 5 % de pérdida, 5 min de partido con bots: huellas
  iguales en todos los controles, **prueba de oro** (offline con las mismas entradas = partida en red: `stateHash` cada segundo, huella
  canónica completa cada 10 s y al final), cero congelaciones hasta 120 ms. Medido: rollback máx 9/13/16/23 tics; CPU de la sesión por
  frame 0,17/0,23/0,30/0,50 ms de media (p99 0,4-1,6 ms) en Node. (2) Estado del invitado tocado → huella distinta, foto, reparado en
  249 ms y luego bit a bit igual; ruido de 1e-9 en `Math.hypot` del invitado → 3 reparaciones en 120 s y siempre vuelve a coincidir.
  (3) Corte de 3 s (los dos esperan y siguen, sin oferta de IA), de 15 s (oferta de IA a los 10,2 s, el anfitrión la elige, resync al
  volver la red y el invitado recupera su jugador), recarga del invitado (sesión nueva, saludo, reloj y resync), abandono, versión
  distinta y códec. Desde la revisión, además: corte de 15 s con la IA elegida por el invitado y por los dos (un resync, mismo
  partido, sin reparaciones, válido, = offline), corte de 70 s (anfitrión `rivalGone`, invitado `hostGone`, sin cambios al volver),
  salir tras el final (no cambia el resultado) y un salto pulsado con la partida congelada (se descarta). 61 pruebas, ~80 s. La huella
  canónica de la prueba trata una clave a `undefined` como ausente y todos los NaN como uno (copyGame no borra claves, las pone a
  `undefined`; no es estado).
- `node tools/viewtest.js` (Node, ~1 min): involución bit a bit en 2 700 fotos (saque, peloteo, punto, revisión, IA, tiempo muerto y
  final), lista cerrada sin huecos (g, jugadores, anidados y 6 000 eventos), sentido de la vista (el invitado es el equipo 0 y saca
  desde x > 0, marcador, balón, predicciones, hueco y aim3) y entrada del invitado (`inputToWorld` + espejo = la dirección pedida).
- `node tools/netdrive.js [s=120] [lag=80] [query]`: UN Chrome headless con dos páginas (`/json/new`), banderas anti-frenado, 800×450 y
  calidad baja. Medido (120 s, 80 ms ±15, 3 % de pérdida): 119 huellas iguales, 0 congelaciones, 0 reparaciones, sesión 0,21-0,23 ms
  por frame (máx 2 ms), frame JS 1-1,5 ms, consola limpia. Capturas `tools/out/netdrive-{anfitrion,invitado}-{1,2,fin}.png`.

### Pendiente (fases siguientes)

- **Fase 2:** HECHA (ver «Fase 2» más abajo).
- **Fase 3:** HECHA (ver «Fase 3» al final). Lo que se pedía: marcador y textos con el nombre del rival en vez de «CPU» («Saca la CPU», «Gana la CPU»…), hoja
  final online (estadísticas de `confirmedGame()` vistas desde tu equipo: `view.stats` NO se copia), pausa de 10 s entre sets con
  «Continuar» visible, récord online aparte y gorra «Online Beta Tester» (look.js), `visibilitychange` → `setAway` (y avanzar la
  sesión con un temporizador mientras la pestaña está oculta), stats de la Carrera por hueco (`humans[s].attrs/badges`) y opción
  «Igualado», equipaciones y looks de los dos, revancha. La partida de prueba `?net=bc` usa la sede del anfitrión (`opts.mapId`).
- **Ventaja de frames y reloj:** el desfase se mide una vez al empezar (y en cada resync); con relojes de dos máquinas reales la
  ventaja de frames corrige la deriva lenta. Medir en la fase 2 con dos ordenadores.
- **Eventos fantasma:** un punto predicho que el rollback anula puede verse un instante (aceptado; con RTT ≤ 120 ms la profundidad es
  ≤ 16 tics). Si molesta, presentar `point` solo desde `gc` (≈ medio RTT más tarde). Medido en la revisión: con RTT 200 ms, unos 6 `hit`
  por lado en 4 min que nunca se confirmaron (sonido y chispa); con 120 ms, 1-2 (`hit`, `landPlayer`). Ni dobles ni puntos fantasma.
- **Récord online (fase 3):** leer `r.result` + `r.valid` al acabar: `over` (gana/pierde), `rivalQuit`/`rivalGone` (victoria),
  `quit`/`late` (derrota), `hostGone`/`version`/`valid = false` (no cuenta).

---

## Fase 2 — transporte real y lobby (16-nov-2026)

Ficheros: `js/netroom.js` (`VB.NetRoom`, salas y señalización en Firestore por REST; sin DOM), `js/netrtc.js` (`VB.NetRtc.Link`, WebRTC),
`js/netlobby.js` (`VB.NetLobby`, la página «Online» y la conexión), `tools/roomtest.js`, `tools/netdrive.js --rtc`. Toques mínimos en
ficheros de ui_main (ver CONTRACT.md «Online, fase 2»): `index.html`, `js/ui.js`, `js/account.js`, `firebase/firestore.rules`.
Las huellas de siempre no cambian (no se toca `sim.js` ni `net.js`).

### Lo que ve el jugador (decisiones de Ferran)

- **Jugar › Online** (tarjeta «1v1» con la pastilla «Beta», `#btnOnline`; visible para todo el mundo desde la fase 4: `MENU_ON = true` en netlobby.js).
- **Sin cuenta** (decisión 2): «Necesitas una cuenta para jugar online» y el botón «Ir a Cuenta» (`VB.Account.open()`). Al entrar en la
  cuenta, la página pasa sola a la lista (`VB.Account.onChange`). No hay login anónimo.
- **Reglas sin desplegar** (decisión 7): cualquier 403 al listar, crear o buscar por código → «El online aún no está activado en el
  servidor» con «Volver a probar». Nada más se rompe (las reglas de antes siguen guardando el progreso: comprobado en roomtest).
- **Lista** (decisión 1): «Crear sala», «Tu nombre», «Entrar con código» y SALAS ABIERTAS: cada fila = nombre de quien la creó y
  «Playa | Platja Llarga | 1 set a 21 | Con sus atributos» (o «Igualado»), y «1/2» (o «Otra versión», sin poder entrar). Se refresca
  cada 8 s y con «Actualizar». Vacía: «No hay salas abiertas ahora mismo. Crea una y aparecerá aquí para los demás.»
- **Crear sala:** Escenario (Playa / Pabellón), Sede (las de `VB.Venues.list(tipo)`), Partido (1 set a 21 / Mejor de 3: 21, 21 y 15),
  Atributos («Los suyos» / «Igualado») y «Abrir sala». Se recuerda en `make-the-cut.netroom` (aparato).
- **Sala de espera:** «Tu sala» + código de 6 («Copiar código»), los dos nombres con «—» en medio (el del rival con su flechita ▼),
  la configuración y el estado: «Esperando rival. Tu sala sale en la lista de Online.» → «Conectando con <nombre>…» → «Conectados.
  Empieza el partido…». Si no conectan en 30 s: «No se ha podido conectar directamente con <nombre>: vuestras redes no lo permiten.
  Probad otra vez o desde otra red.» (el anfitrión reabre su sala; el invitado vuelve a la lista). «Salir de la sala» / Esc la cierran.
  Enlace directo: `?sala=CÓDIGO` abre Online y entra en esa sala.
- **Nombre** (decisión 6): `make-the-cut.nick` si lo has cambiado («Tu nombre», 2-16, sin controles ni `<`, `>`, comillas; nunca con @); si
  no, el nombre de tu jugador de la Carrera activa; si no, el usuario de una cuenta «usuario y contraseña»; si no, «Jugador 1234» (del
  uid). Nunca el correo (`netInfo()` no lo da). Es lo único que el rival ve de ti: en la lista, en la sala, en el HUD y en la flechita.
- **Atributos** (decisión 3): cada uno juega con los de SU jugador de la Carrera activa (`VB.Career.mode()` → `player.st` e
  `VB.Badges.forPlayer`), sin la fatiga ni la química de la Carrera; sin Carrera, los de su n.º 1 del escuadrón de Partido rápido
  (`VB.Prog.attrs()[0][0]`, `VB.Badges.forSquad()[0][0]`); si tampoco, neutros. «Igualado»: `even: true` (neutros y sin insignias).
  El invitado manda los suyos en el «pre» y el anfitrión los sanea (claves de `VB.ATTR_KEYS`, enteros 1-99; insignias `[a-z]` nivel 1-3,
  12 como mucho). **Límite conocido de la beta:** los atributos e insignias «de tu Carrera» los declara tu propio cliente y nadie los
  comprueba (no hay servidor de juego: P2P). Con la consola o un cliente modificado alguien puede jugar con todo a 99 y todas las
  insignias al máximo fuera de «Igualado», y el rival no lo ve. Lo acepta el diseño (partidas entre conocidos, sin clasificación ni
  premios más allá de la gorra); quien quiera ir a la par, «Igualado». Si un día hay clasificación, hará falta otra cosa (p. ej. que
  el anfitrión lea el guardado del rival en el servidor, o un árbitro).
  **El anfitrión manda (auditoría, 17-nov-2026):** «Igualado» protege de un INVITADO modificado, no de un anfitrión modificado. El
  invitado ya comprueba que las opciones del saludo son las que anuncia la sala (`expect`: Igualado, sets, puntos y sede; si no,
  `result.why = 'mismatch'`, «La sala no coincide con lo anunciado: no hay partido»), así que un anfitrión ingenuo no cuela un partido
  con atributos. Pero por `snap` y `resync` un anfitrión modificado puede imponer cualquier estado (también los atributos del rival):
  arreglarlo del todo exige validar las fotos o un árbitro, es decir, un servidor. Fuera de la beta.
- **Sin progreso** (decisión 4): un partido online no suma récord de Partido rápido, XP, perfil, insignias, retos ni objetos del
  Vestuario (`online` en ui.js `showEnd` y en el `gameOver` de los retos). La gorra «Online Beta Tester» es de la fase 3.

### Salas en Firestore (`js/netroom.js`)

- `rooms/{uid del anfitrión}` (una sala por cuenta) = `{code, name, gname, host, guest, fmt:'2v2', venue, map, even, bo, pts, state:
  'open'|'full'|'play', v: '<PROTO>|<VB.VERSION>', seen}`. `seen` es la hora del **servidor**: cada escritura del anfitrión va por
  `documents:commit` con la transformación `REQUEST_TIME` (las reglas exigen `seen == request.time`), así nadie depende de su reloj.
  `host`/`guest` son uid (no son datos personales; los ve cualquiera con sesión, igual que los nombres).
- **Latido:** el anfitrión renueva `seen` cada 20 s (`beat()`, solo la transformación: nunca reescribe `guest`). Una sala con latido de
  hace más de 90 s no sale en la lista ni deja entrar (reglas `live`; el margen cubre una pestaña en segundo plano más de 5 min, que
  Chrome frena a un temporizador por minuto); a los 5 min cualquiera con sesión puede borrarla (reglas
  `stale`): `list()` borra de paso hasta 3 abiertas caducadas con su señalización y `sweep()` (1 de cada 5 refrescos) las llenas o
  jugando que se quedaron sin latido. No hace falta TTL en la consola.
- **Unirse:** `join(id, nombre)` = PATCH con máscara `guest/gname/state` (las reglas: sala `open`, vacía, viva, no tuya; solo esos tres
  campos; `state 'full'`). Dos a la vez: el segundo recibe 403 → `'full'`. `leave(id)`: el invitado borra su respuesta y devuelve la sala
  a `open` antes de empezar.
- **Cerrar o recargar la pestaña** (`pagehide` en netlobby → `rooms.bye(role, id)`): `fetch` con `keepalive` y el último token, sin
  esperar respuesta. El anfitrión borra sala y señalización; el invitado borra su respuesta y suelta el hueco. Si eso no llega (sin red,
  token caducado), la sala deja de salir en la lista a los 90 s y quien entre antes, si a los 10 s (`OFFER_MS`) no tiene oferta y el
  latido de la sala va atrasado (> `BEAT_MS` + 10 s), recibe «<nombre> no responde: parece que ya no está en la sala. Prueba con otra.»
  y suelta el hueco. Con el latido al día se espera hasta 65 s (`OFFER_MAX`: anfitrión con la pestaña frenada). «Vuestras redes no lo
  permiten» solo sale si hubo oferta y la conexión no se abrió en 35 s.
- **Nombres:** `cleanName` recorta a 16 **unidades UTF-16**, como cuenta `size()` en las reglas (un emoji suele valer 2: caben 8), sin
  partir un emoji. `open()` solo devuelve `'off'` si tras un 403 al crear tampoco se puede listar; si se puede, es `'denied'` («No se
  ha podido crear la sala.»), nunca «el servidor no está activado».
- **Señalización:** `rooms/{uid}/sig/offer` = `{sdp, gen, to}` (la escribe el anfitrión; `to` = uid del invitado al que va, las reglas
  exigen que sea el `guest` de la sala) y `/answer` = `{sdp, gen, uid}` (la escribe el invitado; `uid` = el suyo). **Lectura:** la oferta,
  el anfitrión o su destinatario; la respuesta, quien la escribió o el anfitrión mientras ese siga siendo su invitado. Así quien entra
  después de que otro saliera nunca hereda la SDP (con su IP) del anterior, aunque se haya quedado en Firestore (revisión F2 n.º 1).
  `getSig` trata ese 403 como «no hay». SDP ≤ 20 000. Se borran al conectar, cuando el invitado sale o cambia (el anfitrión llama a
  `delSig`), cuando el invitado sale (`leave` borra su respuesta) y al (re)abrir la sala (`open` borra la de una sesión anterior que no
  se cerró). Borrar: los dos jugadores, quien escribió la respuesta aunque ya haya salido, o cualquiera si la sala no existe o caducó.
  `gen` sube en cada negociación (también al reconectar) y nunca baja entre recargas: `max(gen + 1, segundos desde oct-2025)`, así
  una oferta o respuesta vieja nunca pasa por nueva; el anfitrión además solo acepta una respuesta con `uid` = su invitado.
- **Estados:** `open` (en la lista) → `full` (entró alguien; el anfitrión negocia) → `play` (conectados; fuera de la lista, la sala sigue
  viva con el latido para poder reconectar) → borrada al acabar (el anfitrión al salir del partido, `close()`).

### Conexión (`js/netrtc.js` + `js/netlobby.js`)

- `Link`: `RTCPeerConnection` con STUN `stun.l.google.com:19302` y `stun.cloudflare.com:3478`, sin TURN (D4; desde «Robustez y privacidad», TURN opcional con `VB.NET_ICE`). Canales negociados
  `'in'` (id 1, `{ordered:false, maxRetransmits:0}`) y `'ctl'` (id 2, fiable). SDP completa: se espera a reunir candidatos (máx. 3,5 s).
  Mientras está caído, `'in'` se pierde (la sesión espera) y `'ctl'` se guarda en cola (400) y sale al reabrir. `close()` cierra 0,4 s
  después (sale el adiós de la sesión: el rival ve «ha abandonado» al momento). `info()` = `{type: 'host'|'srflx'|'relay', rtt}`.
- **Anfitrión:** lee su sala cada 2 s; al ver un invitado, `offer()` → `putSig('offer', gen)` → lee la respuesta cada 1 s → `accept()`.
  **Invitado:** lee la oferta cada 1 s y contesta con `answer()` → `putSig('answer', gen)`; lee la sala cada 3 s (si el anfitrión la
  cierra o le echa: «Quien creó la sala la ha cerrado.»).
- **«pre»** (por `'ctl'`, antes de la sesión): el invitado manda `{k:'pre', name, st:{attrs, badges}}`; el anfitrión construye las
  opciones del partido (`online, seed, venue, mapId, bestOf, points: 21, even, humans: [suyos, del invitado]`), contesta `{k:'pre',
  name}`, pasa la sala a `play`, borra la señalización y los dos llaman a `ctx.actions.startOnline({slot, link, opts, name})` (el
  invitado con `opts: null`: las recibe en el saludo de la sesión). Lo que llegue detrás del «pre» se devuelve a la cola del enlace.
- **Reconexión en pleno partido:** si la conexión cae (`failed`/`closed`, canal cerrado o `disconnected` más de 4 s), el anfitrión
  renegocia sobre la MISMA sala (`gen + 1`, reintento cada 10 s, 7 veces); el invitado vigila ofertas nuevas cada segundo (solo lee
  Firestore si su conexión no está abierta o la sesión está esperando). La sesión ni se entera: espera, y a los 10 s ofrece seguir
  contra la IA como siempre (fase 1). Una página recargada NO vuelve a la sala (pendiente).
- **Privacidad:** las direcciones de red solo van dentro de las SDP (cada una la lee solo su destinatario y el anfitrión; se borran al
  conectar, al salir y al reabrir) y nunca se pintan. netdrive comprueba que en pantalla no hay IP, `.local` ni `candidate:`.

### Cuotas de Firestore (plan gratuito: 50 000 lecturas y 20 000 escrituras al día)

Lobby abierto: 1 consulta cada 8 s (lecturas = salas devueltas, mínimo 1). Anfitrión esperando: 1 lectura cada 2 s + 1 escritura cada
20 s. Conexión: 2-4 escrituras (y 2 borrados) + 2-10 lecturas. Partido: 1 escritura cada 20 s (latido) y nada más salvo reconexiones. Con decenas de
personas probando a la vez sobra; si algún día hay cientos, subir `LIST_EVERY`/`ROOM_POLL` o escuchar en tiempo real.

### Reglas

**Estado (16-nov-2026): DESPLEGADAS.** Comprobado en la revisión de la fase 3 contra la API de reglas de Firebase: lo publicado en
make-the-cut-vb (15:43 UTC) es igual que `firebase/firestore.rules` sin contar comentarios (bloque ONLINE incluido). Ferran no tiene
que desplegar nada para el online mientras no cambie el fichero; si cambia: `npx firebase-tools deploy --only firestore:rules` desde `firebase/`.


El bloque ONLINE está al final de `firebase/firestore.rules` (dentro del mismo `match /databases/{database}/documents`; no cambia nada
de `users/{uid}/saves`). Desplegar desde `firebase/`: `npx firebase-tools deploy --only firestore:rules`. No hace falta índice
compuesto (la lista ordena solo por `seen`, auditoría; la búsqueda por código usa dos igualdades) ni TTL. La tarjeta del menú ya está encendida
(`MENU_ON = true`, fase 4).

### Pruebas

- `node tools/roomtest.js` (~10 s con el emulador): 67 comprobaciones (revisión F2: oferta a nombre del invitado, respuesta firmada,
  un invitado nuevo no lee la señalización del anterior ni el anfitrión la de quien ya salió, salir borra la respuesta, reabrir borra
  la señalización vieja, nombres con emojis aceptados por las reglas, 403 al crear con la lista viva = `denied`, `bye` del invitado y
  del anfitrión). Se niega a arrancar si el puerto ya está ocupado y mata el emulador con `taskkill /T` (en Windows `kill()` dejaba
  vivo el java.exe hijo con las reglas viejas y la siguiente pasada probaba contra él). Fetch simulado (403 → `off`, sin sesión, sin red, 503, filtro y
  orden de la lista, limpieza, nombres, códigos) y, con Java + el jar del emulador (`~/.cache/firebase/emulators`; con Java 17 vale
  `npx firebase-tools@13.29.1 setup:emulators:firestore` → v1.19.8), las reglas de verdad con tres cuentas: sin sesión no se lista;
  crear solo con tu uid, sin campos de más, nombre ≤ 16, `seen` del servidor; entrar una sola vez (también a mano); latido sin pisar al
  invitado; señalización solo para los dos (C no lee ni escribe; B no escribe la oferta; SDP > 20 000 no); `play` fuera de la lista;
  salir y reabrir; otra versión; sin latido no se entra; limpieza a los 5 min; cerrar; el progreso propio se sigue guardando. Y con las
  reglas de hoy (sin el bloque): listar, crear y buscar → `off`, y el progreso se sigue guardando.
- `node tools/netdrive.js --rtc [s=60]` (~1 min): UN Chrome headless con dos páginas y el emulador de Firestore (`?online=1&netemu=8091&
  netuid=…&netice=none`; `netemu` solo se acepta desde file:// o localhost, con fichas JWT sin firmar del emulador). Lista vacía, crear
  sala en la playa, la sala sale en la lista del otro con nombre, sede y partido, entrar, sala de espera con el nombre del rival,
  WebRTC (par `host`, RTT 1-14 ms), partido con bots, huellas iguales, nombres en sesión, HUD y flechita, señalización borrada, caída
  de la conexión del invitado y luego la del anfitrión (renegocian solas, misma sesión, sin reparaciones), ninguna IP en pantalla,
  abandono del anfitrión → el invitado gana al momento, sala borrada, consola limpia. Y (revisión F2 n.º 3) una sala fantasma con
  latido reciente: quien entra recibe «… no responde» a los ~10 s y el hueco queda libre; el anfitrión recarga, abre otra sala y cierra
  la pestaña: la sala desaparece al momento. 20 comprobaciones.
  Capturas: `tools/out/netrtc-{lista-vacia,sala-fantasma,crear,sala-espera,lista,anfitrion,invitado,invitado-fin}.png` (y `netrtc-sin-cuenta.png`,
  `netrtc-sin-reglas.png`, `netrtc-jugar.png`, hechas aparte).

### Pendiente

- **Publicar:** HECHO en la fase 4 (`MENU_ON = true`; ver «Fase 4»).
- **Fase 3:** HECHA (ver «Fase 3»). Era: marcador y textos con el nombre del rival en vez de «TÚ / CPU», pausa de 10 s entre sets con «Continuar», récord online
  (abandonar = derrota), gorra «Online Beta Tester» al acabar el primer partido online, revancha, equipaciones y looks de los dos.
- Volver a la sala tras recargar la página (la sesión ya sabe resincronizar a un invitado nuevo; falta guardar la sala en
  `sessionStorage` y renegociar).
- Medir con dos ordenadores en redes distintas cuántas conexiones fallan sin TURN (`Link.info().type`); si fallan a menudo, TURN (D4).
- Con mando no se puede escribir el nombre ni el código (sí entrar desde la lista, que es lo principal).

---

## Fase 3 — partido completo (16-nov-2026)

Ficheros: `js/netrec.js` (nuevo, `VB.NetRec`), `js/net.js` (época, mensajes de la interfaz), `js/netlobby.js` (looks en el «pre», récord
en la lista), rama online de `js/main.js`, y toques pedidos por el orquestador en `js/look.js`, `js/doll.js`, `js/players.js`, `js/ui.js`,
`js/arena.js` e `index.html` (ver CONTRACT.md «Online, fase 3»). Pruebas: `tools/net3test.js` (nueva), `tools/netdrive.js --guion` (nueva),
`tools/looktest.js` (actualizada). Las huellas de siempre no cambian (`sim.js` no se toca).

### Lo que ve el jugador

- **Equipaciones y looks** (solo estética, nunca en la sim): cada uno manda en el «pre» `myLook()` = sus dos looks del Vestuario (los de
  Partido rápido: `VB.Look.matchLooks({})`) y su equipación de Ajustes; quien recibe lo pasa SIEMPRE por `saneLook` (`VB.Look.sane`, 8 KB
  por look como mucho, colores de 24 bits, diseño `[a-z]`). Las equipaciones las decide `VB.Players.onlineKits(anfitrión, invitado)` con
  las reglas de siempre (la del invitado si se distingue de la del anfitrión; si no, la de la CPU más distinta): los dos lados calculan lo
  mismo y cada uno ve su equipo como el equipo 0 de su vista. El rival viste sus looks (`setKit` `st.kit1` + `st.looks1`, casillas 2 y 3
  de `LOOK_OVR` en players.js); sus jugadores sin look, el aspecto de NPC de siempre.
- **Sede, puntos y sets:** los de la sala (fase 2). **Stats** (decisión 3): por defecto los de tu jugador de la Carrera (sin Carrera, tu
  n.º 1 de Partido rápido; si tampoco, neutros); «Igualado» = neutros y sin insignias. Siempre llevas a tu n.º 1 con un compañero IA.
- **Nombres:** el marcador dice «TÚ» y las 3 primeras letras del nombre del rival («ANF»); los textos con «la CPU» pasan a «el rival»
  (`cpuTxt` con `g.netCr`), los rótulos del pabellón a «SET PARA EL RIVAL», y la hoja final «Gana <nombre>» con el antetítulo
  «Palau del Mar ◆ Online | Sets a 11». La flechita con el nombre del rival encima de su jugador sigue (fase 1). Nunca IP ni correo.
- **Sin tiempos muertos** (decisión 5: no hay pausa durante el juego): el bit `tmo` existe pero la sala no los activa (`timeouts` no se
  pasa a `createGame`); comprobado en el guion que pedirlo no para nada. **Challenge:** V / LT como siempre, viaja como bit.
- **Pausa de 10 s entre sets** con cuenta atrás y botón «Continuar» en el HUD («Siguiente set en 7 s», «…, esperando a Ana», «(Ana ya
  quiere seguir)»). Cualquier botón también vale. Se salta solo cuando los dos han pulsado. En la pausa de cada punto, igual (sin botón).
- **Pestaña oculta:** tu jugador pasa a la IA al momento (bit `ai`) y la sesión sigue avanzando sin pintar con el pulso de un Worker
  creado de un Blob (`setInterval` de 16 ms dentro del Worker; sus mensajes no se frenan como los temporizadores de la página en segundo
  plano; si no se puede crear, `setInterval` normal con hasta 150 tics por llamada, `session.maxCatch`). El rival no espera. Al volver,
  el jugador vuelve a ser tuyo en el siguiente balón muerto. Lo que pasa mientras no miras no suena ni cuenta en las estadísticas de la
  hoja (sí en el marcador); el final del partido sí llega. El HUD dice «(tu jugador lo lleva la IA)». Ventana que pierde el foco: nada.
- **Desconexión, reconexión y abandono:** los de la fase 1 (predicción hasta 200 ms, «Esperando a…», a los 10 s «Seguir contra la IA» o
  «Abandonar», 60 s para volver). **Abandonar = derrota** en el récord online.
- **Hoja final online:** el resumen de siempre (vista desde tu equipo: las estadísticas salen de los eventos presentados, ya girados para
  el invitado), «Tu récord online: 3 ganados de 5 (1 abandono)» al pie, «Nuevo en tu vestuario: Online Beta Tester» la primera vez, y
  los botones «Revancha» y «Volver al menú» (nada de partidos contra la CPU). El HUD online se esconde mientras está la hoja.
- **Revancha:** «Revancha» se pide al rival (tu botón pasa a «Esperando a Ana…»; al otro le sale «¡Revancha! (Ana quiere)»). Cuando los
  dos la quieren, quien creó la sala manda `{t:'go', e}` con la época siguiente y los dos abren una sesión nueva sobre el MISMO enlace:
  semilla nueva, mismas opciones, nombres y looks. Si el rival ya volvió al menú: «Ana se ha ido» (botón desactivado).
- **Récord online** (aparte del de Partido rápido; no da experiencia, insignias ni retos): `make-the-cut.online`, ver abajo. En la lista de
  salas sale «Tu récord online: …».
- **Gorra «Online Beta Tester»** (decisión 4): objeto `gorraMTC` del Vestuario (cabeza, vale en pista y en playa, rareza 2). Se desbloquea
  al TERMINAR tu primer partido online: final normal, el rival abandona o no vuelve, o «no cuenta» por caída del anfitrión o por
  reparaciones (lo jugaste hasta donde se pudo); NO si abandonas tú o si es otra versión. En el Vestuario: «Online: termina tu primer
  partido». Dibujo (doll.js `mtcPanel`): la gorra de siempre y en el frontal una tira de la misma copa con 13 × 5 caras pintadas por
  vértice con «MTC» (M de 5 columnas, T y C de 3; desde 1.20.0 «TTC», mismo id gorraMTC), letra clara sobre cA oscuro y oscura sobre cA claro; 130 triángulos fijos en todos los
  LOD (con menos no se lee). Capturas `tools/out/net3-gorra-{hall,beach}.png`.

### Récord online (`js/netrec.js`)

- `make-the-cut.online` = `{v:1, played, wins, losses, quits, nc, streak, best, last:[{n, w, s, t}]}` (10 últimos; `n` = NOMBRE del rival
  saneado, nunca con @; `w` 1 / 0 / −1; `s` = «2-1», «abandono», «abandonó», «no volvió», «no cuenta»). Por aparato, como el récord de
  Partido rápido (no se sube a la cuenta).
- Cómo cuenta (`outcome`): `over` → gana / pierde; `rivalQuit`, `rivalGone` → victoria; `quit`, `late` → derrota y `quits++`;
  `hostGone`, `version`, `valid = false` → `nc` (no cuenta).
- **Cerrar la pestaña en pleno partido = abandono:** al empezar se escribe `make-the-cut.online.pend` (con latido cada 10 s); al acabar se
  borra. Si al cargar el juego sigue ahí y su latido tiene más de 90 s, `boot()` lo apunta como abandono (con latido reciente es que otra
  pestaña está jugando y no se toca). Desde la revisión es una lista, una marca por página (ver «Revisión de la fase 3»).
- main.js: `netRecTick` (marca al pasar a `playing`, latido, y `netSettle` cuando el resultado ya no cambia: confirmado `over`,
  `ended`, o juzgado por tiempo `gone`), una vez por sesión. En `?net=` (depuración) solo con `&netrec=1`.

### Red (`js/net.js`)

- `Session({…, epoch})`: época de la sesión (revancha n.º k). El byte 0 del paquete de entradas es `1 | (época & 15) << 4` (época 0 = el
  `1` de siempre) y cada mensaje de control lleva `ep` (salvo la época 0); lo de otra época se ignora, así un paquete o una huella del
  partido anterior que llegue tarde no se cuela. (El campo es `ep` y no `e`: `rejoin` ya usa `e`.)
- `sendApp(obj)` → mensaje `{k:'app', d}` fiable; llega en `r.app` del otro lado (64 en cola como mucho). `r.rivalLeft`: el rival mandó
  `bye` (`left`/`quit`/`gone`/`late`): no hay revancha.
- `session.maxCatch`: tics por llamada como mucho (pestaña oculta, 150; si no, 40).
- Arreglos de esta fase: (1) con frames de menos de 8,3 ms (pantallas de 120-144 Hz, o la página del anfitrión en Chrome headless a
  128 fps) la espera «parpadeaba» (`waitStart` se borraba en los frames sin tic que hacer) y la oferta «Seguir contra la IA» nunca
  llegaba: ahora la espera solo se borra si de verdad ya no se está bloqueado (`localTick − rHave < MAXPRED`). (2) Un pong que llega
  tras un corte (> 3 s) no entra en el ping (el HUD decía «4571 ms» al volver).

### Revisión de la fase 3 (16-nov-2026)

- **Antes de empezar siempre hay salida.** `Session` en `connecting` tenía plazo infinito y el HUD no daba botón: si el rival
  desaparecía (p. ej. el invitado pide «Revancha» y pulsa «Volver al menú» antes del `go`: su `bye left` es de la época 0 y la sesión
  nueva lo ignoraba) el anfitrión se quedaba en la pista hasta recargar. Ahora: (1) un `bye` `left`/`quit`/`gone` de la época ANTERIOR
  llega a una sesión que aún no ha empezado; (2) `CONNECT_MS = 20000`: 20 s sin oír al rival (solo mensajes de esta época, `heardAt`)
  mientras se conecta; (3) un `bye` en `connecting`/`starting`. Los tres → `status 'ended'`, `result {why:'noShow'}`, `rivalLeft`.
  `quit()` antes de empezar manda `bye left` y deja `{why:'cancel'}`: no es abandono para nadie. HUD: botón «Salir» en «Conectando…»,
  «Esperando a que entre tu rival…» y en la cuenta atrás; al acabar, «X se ha ido: no hay partido» / «Tu rival no ha llegado: no hay
  partido». `NetRec.outcome` cuenta `noShow`/`cancel` como «no cuenta» (y main.js ni lo apunta: la marca solo empieza al jugar).
- **Marca de partido a medias = lista.** `make-the-cut.online.pend` es ahora `[{id, n, t}]` (una por página; el formato viejo de un objeto se
  sigue leyendo). Cada página solo toca la suya; las de otras páginas sin latido en 90 s cuentan como abandono al barrer (`boot`, `begin`,
  `beat`, `end`). Antes, reabrir antes de 90 s y empezar otro partido borraba la marca vieja y el abandono no contaba.
- **Nombre del rival limpio.** `Session({rivalName})` (main.js pasa el del lobby/«pre») manda; el del saludo solo se usa si no había y
  pasa por `VB.Net.cleanName` (igual que `NetRoom.cleanName`: sin < >, comillas ni controles, nada con @, 2-16). Antes el saludo lo sobrescribía crudo.
- **Abandonar avisa.** Abandonar SIEMPRE es derrota (no se sabe quién se cayó; si no, cortar la red y salir sería gratis). Por eso:
  «Esperando a X… Si no vuelve en N s, ganas tú» (anfitrión) / «…el partido no cuenta» (invitado), con «Seguir contra la IA» y
  «Abandonar (cuenta como derrota)»; contra la IA «puede volver (N s)»; con Esc, «Abandonar (cuenta como derrota)» o «Salir» si ya
  está juzgado (`r.gone`). `r.goneIn` = ms que le quedan al rival para volver.
- **Ping tras un corte.** Al recibir algo tras más de 1 s sin noticias, `rttFloor = ahora`: los pongs de pings mandados antes no entran
  en la media (antes, en `netdrive --guion 80`, «673 ms» unos segundos después de volver la red; sin el arreglo, 867 ms en net3test).
- **Reglas:** desplegadas (ver «Reglas» de la fase 2); CONTRACT.md y estas notas decían «sin desplegar».
- Pruebas nuevas en `tools/net3test.js` (sección 3 y dos más en la 1): 46 comprobaciones.

### Prueba en este PC (`?net=bc`)

Además de lo de la fase 1: un «pre» por el mismo BroadcastChannel antes de la sesión (looks y equipación), `&netcap=1` (tu n.º 1 con la
gorra «TTC» (id gorraMTC): las dos páginas comparten el guardado y así se distinguen), `&kitshirt=RRGGBB`, `&botprof=flojo`, `&netrec=1`.

### Pruebas

- `node tools/net3test.js` (Node, ~1,5 min, 46 comprobaciones; la sección 3 = revisión: antes de empezar, nombre, ping): récord (ganar, perder, abandonar = derrota, tardar en volver, el rival
  abandona o no vuelve, no cuenta, línea, 10 últimos, nombres sin @ ni `<`), gorra (una vez, con origen `online` y como nueva; no si
  abandonas tu primer partido ni con otra versión; sí con «no cuenta» por caída del anfitrión), marca a medias (reciente: nada; vieja:
  abandono), guardado dañado o raro; revancha sobre el mismo `memPair` (60 ms ± 10, 2 % de pérdida): partido a 11 hasta el final,
  `again` en los dos `r.app`, `go` con la época 1, sesiones nuevas con huellas iguales 60 s y sin reparaciones, otra semilla, mismos
  nombres, un paquete y una huella de la época 0 tardíos ignorados, otro final y `rivalLeft` cuando el rival sale.
- `node tools/netdrive.js --guion` (UN Chrome headless con dos páginas, ~9-11 min, 26 comprobaciones; desde la revisión también la cuenta atrás «Si no vuelve en N s, ganas tú», «Abandonar (cuenta como derrota)» y el ping del HUD por debajo de 200 ms justo al volver la red): pabellón (Palau), mejor de 3 a 11, 80 ms ± 15 y 3 %
  de pérdida, anfitrión con la gorra y camiseta roja, invitado con bot flojo. Comprueba: looks (el invitado ve la gorra en su rival),
  equipaciones iguales en las dos pantallas, marcador «TÚ / INV» y «TÚ / ANF», tiempo muerto pedido sin pausa, challenge del invitado con
  revisión en las dos partidas, página del invitado oculta (emulada: visibilidad oculta y sin requestAnimationFrame; Chrome headless
  minimiza sin ocultar la página y deja de pintarla, así que se restaura y se emula) con su jugador a la IA, el Worker avanzando y el
  anfitrión sin esperar, vuelta con el jugador recuperado, corte de 14 s con «Seguir contra la IA» y resync, pausa entre sets con un
  «Continuar» (sigue) y con los dos (se salta en ~3 s), huellas iguales en todo el partido, hoja final con «Revancha» y «Volver al
  menú», resultado en el récord de cada lado, gorra desbloqueada y en el resumen, «Tu récord online», revancha pactada (época 1, otra
  semilla, huellas iguales), flechita con el nombre, abandono (= derrota y abandono en el récord; «Invi ha abandonado: ganas tú»),
  consola limpia y capturas `tools/out/net3-*.png` (contra la IA, pausa de set en las dos, final, revancha, abandono, gorra en pista y
  playa).

### Pendiente

- **Publicar:** HECHO en la fase 4 (ver «Fase 4» y «Para Ferran»).
- Estadísticas de la hoja: salen de los eventos presentados (un toque predicho que el rollback anuló puede contar; lo de la pestaña
  oculta no cuenta). La línea de maestría (`g.stats`) no sale en el online (`view.stats` no se copia). Si molesta: calcularlas de
  `confirmedGame().stats` giradas para el invitado.
- «Mejores jugadas» y repetición: siguen apagadas en el online.
- ~~Volver a la sala tras recargar la página (fase 2) sigue pendiente~~ SUPERADO: el invitado vuelve solo (ver «Robustez y privacidad»); el anfitrión aún no.
- Intensive throttling de Chrome (pestaña oculta más de 5 min): el Worker debería seguir; no medido con un navegador de verdad.
- El récord online es por aparato (no va a la cuenta).
- ~~El marcador colgado del pabellón (arena.js) aún pone «TÚ / CPU» en el online~~ SUPERADO en «Fase 5»: «TÚ» y el nombre del rival, con el color de cada camiseta.

---

## Fase 4 — publicación (16-nov-2026)

Decisión 7 de Ferran: la entrada «Online» se ve en el menú y él pondrá gente a probarlo. No hay reglas nuevas (el bloque ONLINE de
`firebase/firestore.rules` ya está desplegado desde la fase 2; ver «Para Ferran»). Las huellas de siempre no cambian (`sim.js` no se toca).

### Lo que cambia

- **Menú:** `MENU_ON = true` en `js/netlobby.js`: Jugar › **Online** (quinta tarjeta, «1v1» sobre azul como el «6v6» y el «2v2», texto
  «Contra otra persona, con tu jugador») con la pastilla amarilla **«Beta»** (la `.md-soon` de siempre). En 1280×720 y 844×390 caben las
  cinco tarjetas en una fila; en vertical (≤ 620 px de ancho) van en lista como las demás.
- **«Cómo funciona el online»** (vista `'help'` del lobby): sale sola la PRIMERA vez que se entra en Online con sesión (también al entrar
  en la cuenta desde el aviso), antes de la lista; «Entendido» (o Esc / B) lleva a la lista y no vuelve a salir (`make-the-cut.nethelp`, por
  aparato). Luego, desde la fila «Cómo funciona» debajo de «Actualizar». Siete líneas cortas: 1 contra 1 (tu n.º 1 y la IA a tu pareja),
  tu jugador (Carrera, si no Partido rápido; «Igualado»), salas (lista o código), sin pausa (10 s entre sets, se salta si pulsáis los dos
  «Continuar»), si se corta (espera, a los 10 s la IA, 60 s para volver), récord (abandonar = derrota, sin experiencia ni insignias, la
  gorra «Online Beta Tester» al terminar el primero) y privacidad (solo se enseña tu nombre, nunca el correo; la conexión es directa,
  así que el aparato del rival conoce tu dirección de red, como en cualquier juego en línea entre jugadores: texto cambiado en la
  auditoría, antes prometía «nunca tu dirección de red», y sin TURN eso no se cumple).
- **Sala de espera:** debajo del estado, «Llevas a tu n.º 1 y la IA a tu pareja. No hay pausa durante el juego: entre sets, 10 s de
  descanso. Abandonar cuenta como derrota.» (en un teléfono apaisado no sale porque no cabe; está en «Cómo funciona»).
- **Teléfono apaisado (≤ 420 px de alto):** la página toma el ancho de las demás (560: el botón «Pantalla completa» ya no tapa el nombre)
  y las filas de sala enseñan sede y partido (antes la ayuda de las filas se escondía y con ella la configuración de la sala).
- **Filas de sala:** si una sala no trae sede, ya no dice «Playa | Playa».
- **HUD del partido** (rama online de `js/main.js`): datos con la barra fina (guía de estilo: «Contra Ana | 18 ms | Conexión inestable»,
  «Contra la IA (puede volver en 42 s)») y el aviso baja de línea si no cabe (en 844×390 «Esperando a… Si no vuelve en 50 s, ganas tú»
  con «Seguir contra la IA» y «Abandonar (cuenta como derrota)» cabe en una línea; con un nombre largo, baja).

### Repaso general

- **Textos:** castellano, género neutro («tu pareja», «tu rival», «cada persona»), sin « · » de pegamento en lo nuevo.
- **Teclado, ratón y mando** (prueba aparte, sin red: `NetRoom` simulado): Intro en la tarjeta abre «Cómo funciona» con el foco en
  «Entendido»; ↓ recorre Crear sala, Tu nombre, Entrar con código, las salas (salta la de otra versión), Actualizar y Cómo funciona; Esc
  sale a Jugar. Con mando: A entra, la cruceta ← → cambia las opciones de Crear sala, ↓ llega a «Abrir sala», A la abre, B sale de la sala y
  B otra vez vuelve a Jugar. 13 comprobaciones, consola limpia. (Escribir el nombre o el código con mando sigue sin poder hacerse.)
- **Táctil (844×390):** lobby, crear sala y sala de espera se tocan bien; en partido el HUD online queda bajo el marcador, lejos del
  joystick y los botones; el aviso de espera con sus dos botones cabe (`NDTOUCH=1`, abajo).
- **Errores de red entendibles:** sin cuenta, reglas sin desplegar, sesión caducada, sin conexión, sala llena, sala que ya no existe,
  otra versión, anfitrión que no responde, redes que no dejan conectar; en partido, espera / IA / abandono / no ha vuelto / no cuenta.
- **Privacidad:** ninguna IP, `.local` ni candidato ICE en pantalla (netdrive `--rtc`); `js/net*.js` no escriben nada en la consola;
  en Firestore solo hay nombres visibles y uid (las SDP con direcciones de red las lee solo su destinatario y se borran al conectar).
  Nunca un correo: `netInfo()` no lo da y los nombres con @ se rechazan.

### Revisión de la fase 4 (16-nov-2026)

- **La cuenta solo cambia el lobby cuando cambia quién hay en ella.** `VB.Account.onChange` avisa en cada `setStatus` (también en
  cada sincronización: al volver a la pestaña, `visibilitychange` → `syncDown`), y antes eso devolvía a la lista desde «Crear sala»
  (perdiendo lo elegido), cerraba «Tu nombre» sin guardar y cerraba «Cómo funciona». Ahora `netlobby.js` guarda `L.accKey` (`accKey()`:
  uid de la cuenta, '' sin sesión) y solo reacciona si cambia: entrar, salir o cambiar de cuenta. Prueba (sin red, salas falsas):
  «Crear sala» con Pabellón / Mejor de 3 / Igualado y una sincronización → sigue en «Crear sala» con lo mismo; «Tu nombre» abierto con
  texto → sigue abierto con el texto; cambio de uid → vuelve a la lista.
- **Navegador sin WebRTC (p. ej. iPhone en modo Aislamiento):** vista propia `nortc` («Este navegador no puede jugar online»), sin
  «Volver a probar». `noRtc()` se mira al abrir, en «Volver a probar» (desde la vista `off`), en el aviso de la cuenta y al principio de
  `createRoom`, `joinRoom` y `joinCode`: sin WebRTC nunca se abre ni se ocupa una sala.
- **HUD online (`js/main.js` `netHud`):** el nombre del rival va en los textos como la marca `\u0001` y se pinta aparte (`textContent`
  en cada `<b class="nn">`). Antes `msg.replace(who, …)` daba con la primera coincidencia, que podía estar en el texto fijo (un rival
  «en» en «Siguiente set…»), y el nombre real quedaba dentro de `innerHTML` (un & se leía como entidad).

### Pruebas de la fase

- `node tools/netdrive.js --rtc`: 22 comprobaciones (nueva: «Cómo funciona» la primera vez). Capturas `tools/out/netrtc-*.png`.
- `NDW=844 NDH=390 NDTOUCH=1 node tools/netdrive.js 40`: teléfono apaisado con pantalla táctil y un corte de 13 s; comprobación nueva
  «el aviso de espera con sus dos botones cabe en la pantalla» (las congelaciones se cuentan hasta el corte). Captura
  `tools/out/netdrive-movil-espera.png`.
- Capturas del menú y del lobby en 1280×720 y 844×390 (táctil): `tools/out/f4-{jugar,online,ayuda,lista,crear,sala}-{1280x720,844x390}.png`
  (la lista con salas falsas, sin red).

### Pendiente

- Lo de las fases anteriores: volver a la sala tras recargar, TURN si fallan muchas conexiones entre redes distintas (medirlo con los
  primeros probadores: `VB.NetLobby._state().linkInfo.type`), escribir con mando, estadísticas de maestría en la hoja online, marcador
  colgado del pabellón con «TÚ / CPU». (SUPERADO casi todo: escribir con mando en «Lobby rediseñado y teclado en pantalla»; maestría
  y marcador colgado en «Fase 5»; vuelta del invitado y soporte de TURN en «Robustez y privacidad». Queda: vuelta del anfitrión y
  activar TURN con una cuenta.)
  (22-nov-2026, 1.22.0: TURN de respaldo preparado y apagado, con Worker en turn-worker/; ver notes/turn.md.)
- Las Novedades del online las escribe la sesión principal (esta fase no toca Novedades ni Controles).

---

## Fase 5 — pulido de partido y final online (16-nov-2026)

Ficheros: `js/arena.js` (solo el marcador colgado), rama online de `js/main.js`. `net.js`, `netview.js`, `sim.js` y
`firebase/firestore.rules` sin cambios; huellas idénticas.

- **Marcador colgado del pabellón:** en el online pone «TÚ» y el nombre del rival en mayúsculas (`hungRival`: si pasa de 10 letras, la
  primera palabra; si aún pasa, 9 letras y punto; `fitFont` encoge). Colores de cada lado = las camisetas del partido (`netCr.col`, de
  `netKit()` en `netBuildView`): el invitado ya no ve su lado en rojo yendo de azul. `TEAMC` vuelve a los de siempre en el siguiente
  partido offline (`TEAMC0`). La vista ya está girada (`NetView.mirror`): tu equipo siempre a la izquierda, anfitrión e invitado igual.
  Capturas `tools/out/f5-colgado-{anf,inv}.png` y `tools/out/f5-juego-{anf,inv}-{1280x720,844x390}.png` (HUD «Contra X | ping» y
  flechita con el nombre: bien en los dos tamaños).
- **Línea de maestría en la hoja online:** `netMastery` (main.js) suma a `view.stats.mastery` los usos de TU jugador (equipo canónico
  `net.slot`, toques `human`) de los eventos CONFIRMADOS (`r.confirmed`, también con la pestaña oculta), con las reglas de sim.js
  (finta > colocado > al filo en remate o dejada; rápida al colocarla). La `g.stats` canónica no sirve: junta a los dos humanos.

### Pendiente (fase 5)

- **Resto de estadísticas de la hoja** (puntos, remates, jugadores…): las cuenta `tally()` de `ui.js` con los eventos presentados, que
  también pintan banners y efectos, así que no se pueden separar sin tocar `ui.js` (no era de esta parte). Propuesta: en `onEvents`
  saltar `tally(e)` si `e._noTally`, exportar `VB.UI.netTally(evs)` (tally + untally del challenge) y que main.js marque los
  presentados y pase `r.confirmed` mapeados (`NetView.mapEvents`). Mientras, un toque predicho que el rollback anuló puede contar.
- **«Mejores jugadas» y repetición:** siguen apagadas. `js/replay.js` graba UNA entrada humana por paso (`onStep(simIn, g)`) y resimula
  con ella; el online necesita las DOS (`Sim.step(gc, STEP, ins)`) y la sombra habría que girarla para el invitado. La sesión ya sabe
  grabar las dos (`record: true` → `rec[t]`), pero hace falta cambiar replay.js (no es de esta parte). Sin repetición, las «Mejores
  jugadas» no tienen qué enseñar.
- Hoja final online no capturada en esta fase (falta de tiempo); `node tools/netdrive.js --guion` la cubre.

---

## Lobby rediseñado y teclado en pantalla (16-nov-2026, tras el 1.5.0)

Petición de Ferran: «haz que se diferencien los lobbies de los botones del menú, hazlo un poco atractivo». Solo `js/netlobby.js`
(vistas y su CSS, que vive en la cadena `CSS` del propio fichero; `index.html` no cambia). Sin reglas nuevas; las huellas no cambian.

- **Lista = barra de acciones + cartelera.** Arriba, una barra compacta: «Crear sala» (naranja), «Código», tu nombre (lápiz y nombre
  en amarillo), actualizar (gira mientras busca) y «?» (Cómo funciona). Debajo, la cartelera: rótulo inclinado «● Salas abiertas
  N salas | Tu récord …» y una franja por sala tipo rótulo de TV (`.ol-fx`, la pieza inclinada es `.fx-in` porque el deshabilitado
  global quita las transformaciones del botón): a la izquierda la sede con su color (arena con rayas / madera con tablas) y el nombre
  de la sede si lo hay; el anfitrión grande en condensada, «VS» y el hueco «?» discontinuo (con el nombre del rival si la sala está
  llena); chips de partido (1 set a 21 / Mejor de 3, Igualado / Con sus atributos); piloto Abierta (verde) / Llena (naranja) / Otra
  versión (gris) y «Entrar», que se rellena de amarillo con el foco. Una sala nueva entra deslizándose (0,38 s, escalonadas; nada con
  `prefers-reduced-motion`). Lista vacía: franja discontinua «? VS ?  Aún no hay salas. Crea una y avisa a alguien.»
- **Sala de espera:** el mismo rótulo en grande: franja de sede arriba con «Tu sala / Sala de …» y el código; TÚ VS RIVAL en grande, el
  hueco del rival con «?» y tres puntos que laten hasta que llega, y su nombre entra deslizándose. «Copiar código» y «Salir de la sala»
  como barra de dos botones.
- **Navegación:** la barra es UNA parada en ↑↓ (solo el botón activo de la barra no lleva `data-skip`; `L.barKey`) y ←→ la recorre
  (`side()` → `rowStep`). ↓ desde la barra va a la primera sala; ↑ desde la primera sala vuelve al botón de la barra donde estabas. Esc /
  B como antes. Con ratón o Tab, el botón enfocado pasa a ser la parada (`focusin`).
- **Escribir con mando (pendiente de las fases 2-4, HECHO):** si lo último fue un mando (`ctx.inputDevice === 'gamepad'`), «Código» y tu
  nombre abren un teclado en pantalla en lugar del `<input>` (que sigue igual con teclado, ratón y táctil). Nombre: cifras, QWERTY con Ñ,
  `- . _`, mayúsculas/minúsculas (empieza en mayúscula y pasa a minúscula tras la primera letra si el nombre estaba vacío), Espacio,
  Borrar y Guardar. Código: solo las letras y cifras válidas (sin 0, O, 1, I ni L), Borrar y Entrar. Cruceta ↑↓ cambia de fila en la
  misma columna (de nuevo con `data-skip`: solo la tecla de la columna actual de cada fila entra en el recorrido de ui.js), ←→ dentro
  de la fila, A escribe, B cancela. Mientras está abierto, la cartelera se esconde (en 844×390 no caben los dos).

Pruebas: `node tools/roomtest.js` 69 ok; `bash tools/console.sh all 844 390` sin errores JS; `node tools/netdrive.js --rtc` 22 ok;
`node tools/simtest.js` «huella 2v2 idéntica». Navegación (prueba aparte en el scratchpad, `NetRoom` simulado, mando falso de
padtest): 23 comprobaciones (barra, salas, ←→, Intro/Esc en el campo, teclado en pantalla con mando: Q → W → S, escribir, Guardar
guarda el nombre, código sin caracteres prohibidos, B cierra). Capturas: `tools/out/lob-{lista0,lista1,lista1-anim,lista4,teclado,
teclado-codigo,sala-espera,sala-rival,sala-invitado}-{1280x720,844x390}.png`.

Pendiente: «Crear sala» sigue con las filas de opciones de siempre (es un formulario, como Partido rápido); en vertical (≤ 620 px de
ancho) la cartelera no se ha mirado a fondo; el teclado en pantalla no acepta teclas físicas a la vez (si se toca el teclado, al volver a
abrir sale el `<input>`).

---

## Para Ferran

### Reglas de Firestore: ya están puestas

Las reglas del online (bloque ONLINE de `firebase/firestore.rules`) **ya están desplegadas** en make-the-cut-vb desde el 16-nov-2026
(15:43 UTC), con tu permiso; la revisión de la fase 3 comprobó que lo publicado es igual que el fichero, y el fichero no ha cambiado desde
entonces. Esta fase no añade reglas. **No tienes que desplegar nada.**

Si algún día dudas (o el juego dice «El online aún no está activado en el servidor»), hay dos caminos; los dos ponen TODO el fichero
(el progreso de las cuentas y el online), así que no se pierde nada:

1. **Desde este PC:** en la carpeta `firebase/` del proyecto, `npx -y firebase-tools@13 deploy --only firestore:rules --project make-the-cut-vb`.
2. **Desde la consola web:** console.firebase.google.com › make-the-cut-vb › Firestore Database › pestaña **Reglas** › borra lo que haya,
   pega el bloque de abajo entero y pulsa **Publicar**. Tarda un par de minutos en notarse.

Bloque listo para pegar (copia exacta de `firebase/firestore.rules` a 16-nov-2026; si el fichero cambia, manda el fichero):

```
rules_version = '2';
// Make the Cut: progreso de cada cuenta. Sin cifrar; solo lo lee y lo cambia su dueño.
// users/{uid}/saves/{key}: data = JSON en texto (≤ 400 000 caracteres; js/account.js no sube más de 390 000); updatedAt = ms del dispositivo.
// Claves admitidas (11; todas desplegadas el 16-nov-2026) y qué las enciende en js/account.js:
//   squad, career, settings, record   → siempre (DOCS).                                  DESPLEGADAS.
//   gym                               → GYM_SYNC = true (12-nov-2026).                    DESPLEGADA el 12-nov-2026.
//   look                              → LOOK_SYNC = true (Vestuario, 13-nov-2026).        DESPLEGADA el 15-nov-2026.
//   profile, career6, cmode, legends, retos → S4_SYNC (S4, perfil y sincronización).       DESPLEGADAS el 16-nov-2026.
// Orden obligatorio: 1) Ferran despliega estas reglas (npx firebase-tools deploy --only firestore:rules, desde firebase/) y espera unos
// minutos; 2) en una publicación mínima, S4_SYNC = true (LOOK_SYNC ya está a true). Al revés, cada subida daría 403.
// '<clave>.bak', 'make-the-cut.career(6).prev', 'make-the-cut.devid' y 'make-the-cut.retostab' son del aparato: nunca llegan aquí.
// tools/synctest.js comprueba que cada clave de DOCS (con todos los interruptores encendidos) está en la lista de abajo.
service cloud.firestore {
  match /databases/{database}/documents {
    function owner(uid) { return request.auth != null && request.auth.uid == uid; }
    match /users/{uid}/saves/{key} {
      allow get, list, delete: if owner(uid);
      allow create, update: if owner(uid)
        && key in ['squad', 'career', 'settings', 'record', 'gym', 'look', 'profile', 'career6', 'cmode', 'legends', 'retos']
        && request.resource.data.keys().hasOnly(['data', 'updatedAt', 'v'])
        && request.resource.data.data is string && request.resource.data.data.size() <= 400000
        && request.resource.data.updatedAt is number
        && (!('v' in request.resource.data) || request.resource.data.v is int);
    }
    // ------------------------------------------------------------------------------------------------------------------------
    // ONLINE (especialista net, notes/net.md, 16-nov-2026). DESPLEGADO el 16-nov-2026. Si faltaran estas reglas, el juego diría
    // «El online aún no está activado en el servidor» al entrar en Online (403 al listar rooms) y no se rompe nada más.
    // Desplegar (desde firebase/): npx firebase-tools deploy --only firestore:rules
    //
    // rooms/{uid}: la sala que tiene abierta cada cuenta (el id del documento ES el uid del anfitrión: una sala por cuenta).
    //   Campos públicos para la lista del lobby (los ve cualquiera con sesión; nunca correos): code (6 letras/cifras, para compartir),
    //   name (nombre visible del anfitrión, 1-16), gname (el de quien entra), host/guest (uid), fmt ('2v2'), venue ('beach'|'hall'),
    //   map (id de la sede), even (Igualado), bo (1|3 sets), pts, state ('open' en la lista | 'full' con rival | 'play' jugando),
    //   v (versión del protocolo y del juego) y seen (hora del SERVIDOR del último latido del anfitrión: el cliente la manda como
    //   transformación REQUEST_TIME, así no depende del reloj de nadie).
    //   - Crear / cambiar: solo el anfitrión (doc = su uid) y con seen = hora del servidor.
    //   - Unirse: quien no es el anfitrión, a una sala 'open', vacía y viva (latido de hace < 90 s); solo toca guest/gname/state.
    //   - Salir antes de empezar: el invitado devuelve la sala a 'open'.
    //   - Borrar: el anfitrión, o cualquiera con sesión si la sala lleva más de 5 min sin latido (limpieza desde el lobby).
    // rooms/{uid}/sig/{offer|answer}: señalización de WebRTC (SDP, que lleva direcciones de red): SOLO la leen y escriben los dos
    //   jugadores de la sala (offer el anfitrión, con to = uid del invitado al que va; answer el invitado, con uid = el suyo) y cada
    //   uno solo lee lo que va dirigido a él: un invitado nuevo nunca lee la respuesta (ni la oferta) de uno anterior. El cliente la
    //   borra al conectar, al salir el invitado y al volver a abrir la sala. Nada de esto se enseña en el juego: del rival solo se ve
    //   su nombre.
    // ------------------------------------------------------------------------------------------------------------------------
    function signed() { return request.auth != null; }
    function nameOk(n) { return n is string && n.size() >= 1 && n.size() <= 16; }
    function roomOk(d) {
      return d.keys().hasOnly(['code', 'name', 'gname', 'host', 'guest', 'fmt', 'venue', 'map', 'even', 'bo', 'pts', 'state', 'v', 'seen'])
        && d.keys().hasAll(['code', 'name', 'gname', 'host', 'guest', 'fmt', 'venue', 'map', 'even', 'bo', 'pts', 'state', 'v', 'seen'])
        && d.code is string && d.code.matches('[2-9A-HJKMNP-Z]{6}')
        && nameOk(d.name) && d.gname is string && d.gname.size() <= 16
        && d.host is string && d.guest is string && d.guest.size() <= 128
        && d.fmt in ['2v2'] && d.venue in ['beach', 'hall'] && d.map is string && d.map.size() <= 40
        && d.even is bool && d.bo in [1, 3] && d.pts in [11, 15, 21, 25]
        && d.state in ['open', 'full', 'play'] && d.v is string && d.v.size() <= 40
        && d.seen == request.time;
    }
    function members(d) { return [d.host, d.guest]; }
    function live(d) { return d.seen > request.time - duration.value(90, 's'); }
    function stale(d) { return d.seen < request.time - duration.value(300, 's'); }
    match /rooms/{rid} {
      allow get: if signed();
      allow list: if signed() && request.query.limit <= 50;
      allow create: if signed() && rid == request.auth.uid && roomOk(request.resource.data)
        && request.resource.data.host == request.auth.uid && request.resource.data.guest == '' && request.resource.data.gname == ''
        && request.resource.data.state == 'open';
      allow update: if signed() && (
        // el anfitrión: lo que quiera de su sala (latido, estado, echar al invitado), siempre válida y con seen del servidor
        (rid == request.auth.uid && resource.data.host == request.auth.uid && request.resource.data.host == request.auth.uid
          && roomOk(request.resource.data))
        // entrar: una sala abierta, vacía y viva; solo guest (= quien entra), gname y state ('full')
        || (resource.data.state == 'open' && resource.data.guest == '' && resource.data.host != request.auth.uid && live(resource.data)
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['guest', 'gname', 'state'])
          && request.resource.data.guest == request.auth.uid && request.resource.data.state == 'full' && nameOk(request.resource.data.gname))
        // salir antes de empezar: el invitado deja la sala abierta y vacía
        || (resource.data.state == 'full' && resource.data.guest == request.auth.uid
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['guest', 'gname', 'state'])
          && request.resource.data.guest == '' && request.resource.data.gname == '' && request.resource.data.state == 'open'));
      allow delete: if signed() && (resource.data.host == request.auth.uid || stale(resource.data));
      match /sig/{kind} {
        function room() { return get(/databases/$(database)/documents/rooms/$(rid)).data; }
        function here() { return exists(/databases/$(database)/documents/rooms/$(rid)); }
        // leer: la oferta, el anfitrión o su destinatario (to); la respuesta, quien la escribió (uid) o el anfitrión mientras ese
        // sea su invitado. Así nadie hereda la SDP de otro (quien entra después de que alguien saliera no puede leer la suya).
        // (resource == null: el documento no existe y la lectura da 404, no 403)
        allow get: if signed() && here() && (resource == null
          || (kind == 'offer' && (room().host == request.auth.uid || resource.data.to == request.auth.uid))
          || (kind == 'answer' && (resource.data.uid == request.auth.uid
                || (room().host == request.auth.uid && resource.data.uid == room().guest))));
        allow create, update: if signed() && here() && room().state in ['full', 'play']
          && ((kind == 'offer' && room().host == request.auth.uid && request.resource.data.keys().hasOnly(['sdp', 'gen', 'to'])
                && request.resource.data.to == room().guest)
            || (kind == 'answer' && room().guest == request.auth.uid && request.resource.data.keys().hasOnly(['sdp', 'gen', 'uid'])
                && request.resource.data.uid == request.auth.uid))
          && request.resource.data.keys().hasAll(['sdp', 'gen'])
          && request.resource.data.sdp is string && request.resource.data.sdp.size() <= 20000
          && request.resource.data.gen is int && request.resource.data.gen >= 0;
        // borrar: los dos jugadores, quien escribió la respuesta aunque ya haya salido (al cerrar la pestaña el borrado y la salida
        // van a la vez) y cualquiera si la sala ya no existe o está caducada
        allow delete: if signed() && (!here() || request.auth.uid in members(room()) || stale(room())
          || (resource != null && resource.data.get('uid', '') == request.auth.uid));
      }
    }
  }
}
```

No hace falta crear índices ni TTL: las salas caducan solas (a los 90 s sin latido dejan de salir en la lista y a los 5 min cualquiera
con sesión las borra desde el lobby).

### Cómo probarlo con un amigo

1. **Los dos con cuenta** (Cuenta, en el menú). Sin cuenta el juego dice «Necesitas una cuenta para jugar online». Conviene que cada
   uno tenga su Carrera o su escuadrón de Partido rápido (si no, se juega con atributos neutros).
2. **La misma versión del juego:** recargad la página los dos (si no, la sala sale como «Otra versión» y no deja entrar).
3. Tú: **Jugar › Online** (la primera vez sale «Cómo funciona») › **Crear sala** › escenario, sede, 1 set o mejor de 3, «Los suyos» o
   «Igualado» › **Abrir sala**. En «Tu nombre» pones cómo quieres que te vean (2-16 caracteres, nunca un correo).
4. Tu amigo: **Jugar › Online** y toca tu sala en **Salas abiertas** (o «Entrar con código» con el código de 6 de tu sala, o el enlace
   del juego con `?sala=CÓDIGO` al final).
5. Se conectan solos en unos segundos y empieza el partido: cada uno lleva a su n.º 1 y la IA a su pareja. No hay pausa; entre sets,
   10 s (se salta si los dos pulsáis «Continuar»). Al final, «Revancha» o «Volver al menú».
6. **Probad también:** cortar el wifi unos segundos (debe esperar y seguir), cortarlo más de 10 s (sale «Seguir contra la IA») y que uno
   abandone (cuenta como derrota). Al terminar el primer partido, mirad la gorra «Online Beta Tester» en el Vestuario.

**Si no conectan** («vuestras redes no lo permiten»): pasa con algunas redes (datos móviles, wifi de empresa o de universidad) porque
aún no hay servidor de paso (TURN) activado (el soporte está listo: «Robustez y privacidad»). Probad desde otra red. Si a los probadores les pasa a menudo, es lo siguiente que habría que poner.
Para saber qué tipo de conexión salió, en la consola del navegador: `VB.NetLobby._state().linkInfo` (`host` = misma red, `srflx` = a
través de internet; nunca enseña la IP).

**Límites de la beta que conviene decir a los probadores:** los atributos «de tu Carrera» los manda cada uno desde su navegador (quien
quiera ir a la par, «Igualado»); recargar la página en pleno partido cuenta como abandono a los 60 s; el récord online es por aparato.

---

## Robustez y privacidad (16-nov-2026, tras el 1.5.0)

Ficheros: `js/net.js`, `js/netrec.js`, `js/netrtc.js`, `js/netconfig.js` (nuevo, una línea en `index.html` antes de netrtc.js;
`tools/build-pages.js` copia `js/` entero, no hay que tocarlo), y en `js/netlobby.js` solo un bloque aparte «VUELTA AL PARTIDO» y una
línea (`backSave()`) en el `pagehide`. **`firebase/firestore.rules` NO cambia.** `sim.js` no se toca: huella 2v2 idéntica.

### 1. Volver al partido tras recargar (solo el INVITADO)

- `pagehide` del invitado en pleno partido → `sessionStorage['make-the-cut.online.back']` = `{id sala, uid, gen, ep (época), rival, look
  del rival ya saneado, t}`. Nada de SDP ni direcciones de red. sessionStorage: misma pestaña (recargar), no otra pestaña ni otro aparato.
- Al cargar (`backTry`, un solo intento, la marca se borra al leerla): si han pasado menos de 50 s, hay sesión, el menú está libre
  y la sala sigue en `full`/`play` con este uid de invitado → `rejoin`: `NetRec.resume()`, enlace nuevo, `startOnline` con
  `opts: null` (la sesión nueva pide el saludo; el anfitrión contesta con sus opciones y, al llegar su `ready`, manda el resync con
  la foto de `Sim.serialize`), época de la revancha copiada a `ctx.net`, y `guestListen(gen)` contesta a la siguiente oferta.
- El anfitrión no cambia nada: su enlace pasa a `down` al cerrarse la página del invitado y su `relink` manda una oferta nueva
  (gen+1) a los 0,6 s y luego cada 10 s durante ~60 s. Su sesión espera («Esperando a…»), con o sin «Seguir contra la IA».
- Reglas: el invitado escribe su respuesta con la sala en `full`/`play` y el anfitrión reescribe la oferta: ya lo permitían. El
  `pagehide` del invitado en `play` intenta dejar la sala en `open` y las reglas lo rechazan (solo dejan salir desde `full`), justo lo
  que hace falta para volver (comprobado en roomtest).
- Récord: `NetRec.resume()` apunta la marca reciente de la página anterior y el `begin()` del partido recuperado la hereda (no crea
  otra). Si la vuelta no llega a jugarse, esa marca se queda sin latido y a los 90 s cuenta como abandono: recargar no sale gratis.
- **Pendiente (HECHO en la «Fase 6», con el aviso y netdrive):** recarga del ANFITRIÓN (su `pagehide` borra la sala y él tiene la partida de verdad: el invitado espera y a los 60 s
  «no cuenta»). Haría falta: no borrar la sala en `play`, que la página nueva pida la foto al invitado (el anfitrión pasaría a
  adoptarla) y reofrezca con gen+1. Tampoco hay aviso en pantalla («Volviendo al partido…»): se va directo a «Conectando…» (con
  «Salir»). Sin prueba en Chrome de la recarga (`netdrive --rtc` sin ese caso todavía).

### 2. TURN opcional (ocultar la dirección de red)

- `js/netconfig.js` define `VB.NET_ICE = null` (sin TURN: como hasta ahora, STUN y conexión directa).
- Con `VB.NET_ICE = { turn: [{ urls: ['turn:…:3478?transport=udp', 'turns:…:443?transport=tcp'], username, credential }], relayOnly: true }`
  `js/netrtc.js` (`pcConfig`) usa esos servidores más los STUN y `iceTransportPolicy: 'relay'`: el rival solo ve la dirección del TURN.
  `Link.info().type` pasa a ser `relay`. Si una conexión por TURN no llega a abrirse (falla o se sustituye antes), esa página
  deja el TURN (`relayBad`) y la siguiente negociación va en directo. Un TURN mal escrito tampoco rompe nada.
- Cómo activarlo: una cuenta de TURN (p. ej. Cloudflare Calls TURN: crear una clave de TURN en el panel; su API da credenciales
  temporales). **No pongas credenciales fijas en el repositorio (es público).** Lo correcto es servir credenciales de vida corta
  desde fuera (una función pequeña que llame a la API del proveedor) y rellenar `VB.NET_ICE` al cargar. Sin servidor propio, de
  momento no hay forma limpia: por eso queda vacío.

### 3. Anti-trampas ligero

- `Session`: `cmpOk` (huellas comparadas que cuadraron) y `cmpBad` (tic de la última distinta sin reparar; se borra con la
  reparación, el `snapok` o un resync). Al llegar el final (`gameOver`), si no cuadró ninguna o hay una distinta pendiente →
  `result.unverified = true`. `NetRec.outcome` lo cuenta como «no válido» (`kind 'unverified'`, entrada `w -1`, `s 'no válido'`,
  suma en `nc`, no en ganados ni perdidos). Sigue valiendo lo de antes: 3 reparaciones en 60 s = «no cuenta».
- Límite: sin servidor no hay árbitro. Un cliente modificado puede mandar huellas falsas que cuadren, o cortar la red antes de
  perder (abandono = derrota, eso sí). Esto solo pilla partidas que de verdad se desincronizaron al final. El récord es por aparato.

### 4. Salas fantasma

- Ya estaba: `pagehide` del anfitrión borra su sala y la señalización con `fetch keepalive` (`rooms.bye`), comprobado en roomtest
  y en `netdrive --rtc` («la sala desaparece al momento»). Si el token ya no vale o el navegador corta, la sala sale de la lista a
  los 90 s sin latido y se barre a los 5 min. Sin cambios en esta tanda.

### Pruebas

- `node tools/nettest.js` 61 ok. `node tools/net3test.js` 51 ok (nuevas: heredar la marca al volver, no volver = abandono, final
  «no válido», final normal válido en los dos, y (f) el invitado recarga: sesión nueva sin opciones sobre un enlace nuevo, resync,
  opciones del anfitrión y huellas iguales 20 s después). `node tools/roomtest.js` 69 ok con el emulador (nuevas: recarga del
  invitado en `play`: la sala sigue con él, oferta gen+1 y respuesta nuevas caben en las reglas; un tercero no lee la oferta).
  `node tools/simtest.js`: huella 2v2 idéntica.

---

## Revisión final (16-nov-2026, tanda de 2 h)

Problemas de la revisión, verificados en el código y arreglados:

- **Recarga del invitado antes de 'play'** (`js/netlobby.js`): `backSave()` devuelve si ha apuntado la vuelta. Si la ha apuntado,
  `pagehide` ya no llama a `rooms.bye('guest')`. Antes, con la sala aún en 'full', ese PATCH entraba: el invitado perdía el hueco
  y la sala volvía a la lista. Si el invitado no vuelve, el anfitrión lo vive como una desconexión normal (60 s).
- **Teclado del nombre en mayúsculas** con un nombre ya guardado: ahora abre en minúsculas (`up: !v0`). Con el nombre vacío sigue
  la mayúscula inicial automática.
- **Barra sin parada** mientras «Crear sala» está desactivado (`L.busy`): la parada pasa a «Código».
- **Pista inferior** (`js/ui.js`): en la página Online dice «↑↓←→ elegir» (barra y teclado en pantalla).
- **«No válido» en la hoja final online** (`js/ui.js`, resumen): si `NetRec.end` da `outcome.kind === 'unverified'`, sale
  «No válido: las dos partidas no cuadraban al final. No cuenta en tu récord online.».
- **Documentación:** marcadas como superadas las líneas antiguas de «TÚ / CPU», «sin TURN» y «volver tras recargar»; CONTRACT.md
  recoge `js/netconfig.js`, `NetRec.resume`, `result.unverified`, `NetRtc.relayOn/_pcConfig` y la vuelta del invitado.

Sigue pendiente (sin cambios): recarga del ANFITRIÓN, aviso «Volviendo al partido…», caso de recarga en `netdrive --rtc`,
estadísticas generales de la hoja desde la partida confirmada (hook en ui.js), repetición y «Mejores jugadas» online (replay.js),
nombres de más de 16 letras cortados, vertical ≤ 620 px del lobby, «Crear sala» con el lenguaje del rótulo, y probar con un mando
y un móvil de verdad.

---

## Fase 6 — el anfitrión también vuelve tras recargar (17-nov-2026)

Ficheros: `js/net.js`, `js/netroom.js` (`rooms.resume`), `js/netlobby.js` (solo la zona «VUELTA AL PARTIDO»: `backSave` llama a
`hostBackSave`, `backTry` reparte, `hostBackTry` y `rejoinHost` nuevos; el render no se toca) y UNA línea de `js/main.js` (texto del
HUD). `js/netrtc.js` y `js/netrec.js` sin cambios (`NetRec.resume` ya valía para los dos). **`firebase/firestore.rules` NO cambia**
(comprobado en el emulador: el anfitrión retoma su sala en 'play', late, reescribe la oferta y lee la respuesta). `sim.js` intacto.

### Cómo va

1. **pagehide del anfitrión** en pleno partido (sesión `playing`/`waiting`, con invitado, sin abandono juzgado): ya NO borra la sala.
   Apunta en `sessionStorage['make-the-cut.online.back']` `{role:'host', id, uid, gen, ep, rival, look del rival, guest, t}` (sin SDP ni
   direcciones). Si sessionStorage falla, la sala se borra como siempre.
2. **El invitado** ve caer el enlace y se queda en «Esperando a X…» (su `guestListen` ya vigila ofertas nuevas). Sus 60 s corren.
3. **Al volver** (< 50 s, misma pestaña y cuenta, menú libre): `rooms.resume()` retoma la sala (si sigue en 'full'/'play' con el
   mismo invitado y con latido de < 90 s), latido otra vez, sesión nueva de hueco 0 SIN opciones y `relink()`: oferta gen+1 al mismo
   invitado a los 0,6 s y cada 10 s. El invitado contesta y el enlace se reabre.
4. **Autoridad de la instantánea:** el anfitrión perdió su partida, así que en ESTE caso manda el invitado. La sesión adoptante
   (`adopt`) saluda con `{k:'hello', back:1}`; el invitado (si sigue en partido y no lo dio por ido) contesta con sus opciones; el
   anfitrión mide el reloj con pings (como un invitado nuevo) y manda `ready`; el invitado llama a su `_resync` (IA en el hueco del
   anfitrión 60 tics por delante, foto `Sim.serialize` de su confirmada, sus entradas) y el anfitrión lo aplica con el mismo
   `_applyResync` de siempre (ya era simétrico: `mine`/`theirs`). Desde ahí `adopt = false`: vuelve a ser un anfitrión normal
   (huellas cada segundo; las reparaciones vuelven a ir con SU foto, que ya es la misma partida). La huella cuadra después
   (net3test g: 20 comparaciones, 0 distintas, 0 reparaciones; netdrive: huellas iguales tras las dos recargas).
5. **Fuera de plazo:** si el invitado ya juzgó (más de 60 s: «no cuenta»), contesta `bye 'gone'` y el anfitrión queda en `noShow`
   (no hay partido). Si nadie contesta, la sesión adoptante espera 40 s (`ADOPT_MS`) y `noShow`. Si la marca tiene más de 50 s o la
   sala ya no es la de ese partido, la página nueva BORRA su sala (`rooms.close`) en lugar de volver.
6. Si el invitado había pulsado «Seguir contra la IA» y el anfitrión vuelve a tiempo, el partido vuelve a contar para él (como en
   la vuelta del invitado), salvo un `invalid` por reparaciones (`rivInvalid`).
7. **Revancha** tras una vuelta: `ctx.net.base` (la siembra el anfitrión) se rellena desde el lobby con las opciones adoptadas.
8. **Aviso «Volviendo al partido…»** en las DOS vueltas: el lobby pone `session.back = true`; el HUD de main.js lo enseña mientras
   la sesión se conecta (antes: «Conectando…» o, peor, «Esperando a que entre tu rival…» en el anfitrión). Se borra solo al empezar
   o al aplicar el resync.

### Pruebas

- `node tools/net3test.js` 55 ok (nuevas: g1 el anfitrión recarga y vuelve, g2 lo mismo con el invitado contra la IA, h vuelta
  fuera de plazo → `noShow` / `hostGone`, i nadie contesta → 40 s y `noShow`).
- `node tools/roomtest.js` 72 ok con el emulador (nuevas: retomar la sala y latir, oferta gen+1 y respuesta en 'play' con las
  reglas desplegadas, un tercero no la lee ni la retoma, fuera de plazo la sala se borra).
- `node tools/nettest.js` 61 ok. `node tools/simtest.js`: «huella 2v2 idéntica».
- `node tools/netdrive.js --rtc` 25 ok (nuevas: el invitado recarga y vuelve; el anfitrión recarga y vuelve, con la sala aún en el
  emulador; las dos con el aviso; huellas iguales después de las dos recargas: 13 comparaciones, 0 distintas; consola sin errores).
  Capturas `tools/out/f6-volviendo-{inv,anf}.png` (aviso) y `tools/out/f6-vuelta-{inv,anf}.png` (partido ya de vuelta).

### Pendiente (fase 6)

- Recarga en la cuenta atrás (`starting`) o con la hoja final abierta: no se apunta vuelta (el anfitrión borra la sala como antes).
- Página restaurada de la caché del navegador (bfcache) tras un pagehide del anfitrión: la sesión sigue viva y la marca de vuelta
  se queda sin usar (caduca a los 50 s). No se ha visto en la práctica.
- Si el anfitrión recarga dos veces seguidas antes de reconectar, la segunda no apunta vuelta (su sesión aún no estaba en partido):
  la sala se borra y el invitado se queda en «no cuenta» a los 60 s.
- Mientras sale «Volviendo al partido…» se ve el menú detrás (igual que pasaba con «Conectando…» en la vuelta del invitado):
  la escena del partido la monta main.js al llegar las opciones. Se podría tapar con un fundido; no era de esta parte.
- Sigue lo de antes: estadísticas de la hoja desde la confirmada (ui.js), repetición online (replay.js), vertical del lobby, mando y
  móvil de verdad.

---

## Fase 6 — repetición, «Mejores jugadas» y estadísticas de la hoja online (17-nov-2026)

Ficheros: `js/replay.js`, `js/ui.js` (solo el tally y su API), las ramas online de `js/main.js` (`netSession`, `netBuildView`,
`netConfirmed` nuevo, `netFrame` y `netBgTick`), UNA función de `js/net.js` (`stepInputs`, getter) y `tools/netreplaytest.js` (nuevo).
**`firebase/firestore.rules` NO cambia.** `sim.js` intacto: huella 2v2 idéntica.

### Repetición y «Mejores jugadas»

- **Qué se graba:** la partida CONFIRMADA (gc), no la vista ni la predicha. `netSession` pasa `onTick` a la sesión: tras cada paso
  confirmado, `Replay.onStep(s.stepInputs(), gc)` con las DOS entradas (`[hueco 0, hueco 1]`, ya decodificadas, con los bits de red
  chal/skip/tmo/ai). Cada frame, `Replay.onEvents(gc, r.confirmed)` (canónicos). `netBuildView` hace `Replay.reset(gc, {dual: true,
  slot})` (con `rpPre = v` para que `setGame` no grabe la vista). Lo mismo con la pestaña oculta (`netBgTick`).
- **`replay.js`, modo dual:** anillos aparte (`mv2` Float64 ×4 y `fl2` Uint16 ×2 por paso; se crean en el primer partido online) y
  tramos propios en cada mejor jugada (`mv2`/`fl2`, al primer uso). La resimulación (`stepG2`) llama `Sim.step(sombra, STEP, [in0, in1])`
  con las mismas entradas: el mismo resultado bit a bit que gc. El modo offline no toca nada de esto (mismos arrays, mismo formato).
- **Invitado:** se pinta una copia girada de la sombra (`RV`, `NetView.mirror` tras cada frame de la repetición), los eventos que se
  reparten salen girados (`NetView.mapEvent`) y el punto de interés de la cámara también. `list()` y los textos dan el marcador desde su
  lado, y la puntuación extra de «tu equipo» va al suyo (por eso las dos listas pueden no ser iguales).
- **Dónde se ve:** solo en la hoja final, pestaña «Jugadas (n)» (como en Partido rápido). Durante el partido no hay repetición
  automática: el reloj es de los dos y no se puede parar.
- Una reparación con foto o una vuelta (`repaired` / `resyncs` cambian) cortan el peloteo en curso (`Replay.cut()`); el salto de tiempo
  de una vuelta ya lo cortaba la comprobación de continuidad.

### Estadísticas de la hoja (puntos, remates, aces, bloqueos, jugadores, momentos)

- `ui.js`: `stats` = lo CONFIRMADO; en el online lo rellena `VB.UI.netTally(evs)` desde `netConfirmed` (main.js) con `r.confirmed`
  girados para el invitado (`NetView.mapEvents`), con el descuento del punto anulado por challenge como en `onEvents`. Lo presentado
  va a `pstats`, que solo usan los banners del partido (`liveStats(g)`). Un toque predicho que el rollback anuló ya no cuenta.

### Pruebas

- `node tools/netreplaytest.js` 30 ok (dos partidos online con bots por memPair, RTT 80 y 160 ms con pérdida, sets a 11 en pabellón):
  graban los dos lados; cada mejor jugada repetida desde lo grabado = la partida confirmada bit a bit (stateHash de la sombra = el de gc
  en el mismo tic, ~1300 comparaciones por lado), desync 0; el invitado ve una copia girada (girarla otra vez da la sombra) con eventos
  de su vista; la misma jugada sale con el marcador y el equipo girados en las dos listas; tally confirmado (código de ui.js extraído)
  = tally de la partida offline equivalente (las mismas entradas paso a paso), girado para el invitado; puntos de la hoja = sets de gc.
  Y el modo offline graba sin dual y repite con desync 0.
- `node tools/simtest.js` huella 2v2 idéntica, TODO OK. `node tools/nettest.js` 61 ok. `node tools/viewtest.js` 11 ok.
  `node tools/replaytest.js --node` TODO OK.
- Chrome (dos páginas `?net=bc&bot=1&points=11`, un solo Chrome, script de la sesión): graban los dos lados, hoja con «Jugadas (3)»,
  estadísticas confirmadas espejo (anfitrión 5-11, invitado 11-5), `playBest(0)` en los dos, invitado con `runner()` girado y su
  equipo abajo, desync 0, consola sin errores. Capturas `tools/out/f6-hoja-{anf,inv}.png` y `tools/out/f6-repe-{anf,inv}-{1,2}.png`.

### Pendiente (fase 6)

- Recargar la página (invitado o anfitrión) empieza un grabador y unas estadísticas nuevos: las jugadas y los números de antes de
  recargar se pierden (la partida sigue bien).
- Si el rival cierra justo tras el punto de partido (menos de 1,3 s), ese último punto puede no llegar a «Jugadas» (la cola no se
  confirma).
- `Badges.ingest` (ui.js) sigue recibiendo lo presentado en el online; no se ha mirado si las insignias cuentan ahí.
- `node tools/replaytest.js --cdp` (parte de Chrome de las repeticiones offline) no se ha pasado en esta tanda; la parte node sí.

---

## Fase 6 — lobby terminado: «Crear sala», vertical y «Cómo funciona» (17-nov-2026)

Solo `js/netlobby.js` (vistas y la cadena `CSS`; la zona «VUELTA AL PARTIDO» no se ha tocado). Reglas sin cambios (`pts` ya admitía
11/15/21/25); huella 2v2 idéntica y repetición offline igual (no se toca nada de la sim).

- **«Crear sala» con el lenguaje de la cartelera.** Un solo rótulo (`.ol-mk`), sin filas de menú: arriba la franja de la sede
  (arena con rayas / madera con tablas según lo elegido) con «Así sale en la lista»; debajo, la **vista previa** de tu sala tal cual
  saldrá en la lista (`fxHTML(r, {prev: true})`: la misma franja de TV con TU nombre, «VS ?», los chips, «Abierta» y «Entrar»; es un
  `div`, no se enfoca ni se pulsa); y los **selectores compactos** (`.ol-sel`, `selRow`): nombre a la izquierda en versalitas, «‹ VALOR
  ›» a la derecha en condensada cursiva; con el foco, barra amarilla a la izquierda y el valor en amarillo. Escenario, Sede, Partido,
  **Puntos** (solo en Pabellón: 11/15/21/25, como en Partido rápido; en la playa siempre 21) e Igualado (Sí/No). Una línea al pie dice
  qué supone Igualado. «Abrir sala» es un botón naranja ancho (`.ol-act.ol-new`), no una fila de menú. ↑↓ recorre los selectores y
  «Abrir sala», ←→ cambia (`side()` → `step()`), clic o toque en las flechas también; B / Esc vuelve a la lista como antes.
- **Puntos por set:** `prefs()` guarda `pts` en `make-the-cut.netroom`; `createRoom` manda `pts` (21 en la playa). Los chips salen de un
  solo sitio (`chips(r)` / `chipsHTML(r)`, también en `cfgParts`): «1 set a N» o «Mejor de 3» (+ « a N» si no es 21). La partida ya
  usaba `r.pts` (`opts.points`).
- **«Cómo funciona»:** rótulo inclinado («Cómo funciona el online», como «Salas abiertas») y una sola caja con una fila por punto
  (`dl.hp-box`, etiqueta amarilla en cursiva y el texto al lado). En un teléfono apaisado y en vertical, la etiqueta va en la misma
  línea que el texto (cabe sin pisar la cabecera). «Entendido» = el botón naranja ancho.
- **Vertical (≤ 620 px de ancho).** Barra en dos filas (Crear sala + Código; tu nombre + actualizar + ?; antes «?» quedaba fuera y el
  nombre no se veía). Franjas más estrechas: sede de 62 px sin el nombre de la sede, nombre a 21 px, el estado («Abierta», «Llena»)
  encima de «Entrar». La cartelera usa el alto que hay (`100vh - 330px`). Teclado en pantalla: «A escribe. B cancela.» bajo el campo,
  teclas de 40 px. Sala de espera: nombres a 29 px. «Cómo funciona» ya no pisa la cabecera (antes medía 769 px y subía por encima).
- Teléfono apaisado (≤ 420 px de alto): en «Crear sala» se esconde la franja de arriba (la vista previa ya lleva la sede) y la línea
  de Igualado; selectores de 30 px. Cabe todo en 844×390.

Pruebas: `node tools/roomtest.js` 72 ok; `bash tools/console.sh all 844 390` sin errores JS; `node tools/netdrive.js --rtc` 22 ok;
`node tools/simtest.js` «huella 2v2 idéntica» y «resim idéntica 100 %». Navegación (scratchpad, `NetRoom` simulado, mando falso): 32
comprobaciones, las 23 de antes más 9 de «Crear sala» (foco inicial en Escenario, → cambia la sede de la franja y de la vista previa,
Puntos solo en Pabellón, ↓ recorre hasta «Abrir sala», chips «1 set a 25» / «Mejor de 3 a 25», clic en la flecha de Igualado).
Capturas: `tools/out/lob6-{lista0,lista1,lista4,crear,crear2,ayuda,teclado,teclado-codigo,sala-espera,sala-rival,sala-invitado}-
{1280x720,844x390,390x844}.png` (390×844 con táctil), sin textos cortados salvo nombres muy largos con «…» (a propósito).

### Pendiente (lobby)

- El teclado en pantalla sigue sin aceptar teclas físicas a la vez.
- En vertical, un nombre de rival largo en la sala de espera queda muy pegado al «VS» (se corta con «…», pero justo).
- Probar con un móvil y un mando de verdad.

## Fase 6 — revisión de las tres partes (17-nov-2026)

Revisión independiente de lo de arriba (vuelta del anfitrión, repetición y hoja online, lobby). Sin cambios en el código del juego ni en
`firebase/firestore.rules`.

### Encaje
- Las tres partes conviven sin pisarse. En `js/main.js` están la línea del aviso «Volviendo al partido…» (`netHud`) y `netConfirmed`
  más el grabador dual (`netSession`, `netBuildView`), en sitios distintos. En `js/netlobby.js`, la zona «VUELTA AL PARTIDO» y el
  render nuevo van aparte. Los seis ficheros tocados pasan `node --check`.
- `rpPre = v` en `netBuildView` evita que `setGame` reinicie el grabador sobre la vista: graba la partida confirmada, como se pretendía.
- `g.online` es una clave de la sim (la copia la vista), así que `pstats` funciona y lo predicho no cuenta dos veces en la hoja.
- Las insignias y los retos siguen recibiendo lo presentado en el online, pero ninguno de los dos se cierra en el online
  (`Badges.endMatch` y `Retos.endMatch` no se llaman con `online`). No cuentan nada.

### Vuelta del anfitrión: el reloj
- Tras la vuelta, el anfitrión tiene un desfase de reloj propio y el invitado conserva el de la página vieja del anfitrión
  (`performance.now()` vuelve a 0 al recargar). He mirado si un resync posterior del anfitrión (reparación con foto o corte) deja
  mal el `t0` del invitado. Prueba en el scratchpad (`hostclock.js`): relojes de la página nueva desplazados 0, +5,5 s y −60 s, con
  una reparación forzada y con cortes de 3 s y 25 s. En todos los casos: huellas iguales, 0 distintas, sin esperas de más y gc a la
  par. La corrección de deriva de `advance` (congelar o adelantar `t0`) lo absorbe. No hace falta cambiar nada.

### Partido completo de extremo a extremo (Chrome headless, dos páginas, `?net=bc`, bots, 80 ms, 2 % de pérdida, set a 11)
- Termina 13-11 (con igualada) en unos 7 minutos. Las dos páginas llegan a la hoja final con «Resumen», «Estadísticas» y «Jugadas (3)».
- Estadísticas en espejo exacto. Anfitrión: puntos 11-13, de ataque 7-11, de bloqueo 0-0, aces 1-0, errores del rival 3-2,
  mejor racha 3-4. El invitado ve lo mismo girado. Cuadran con el marcador (7+0+1+3 = 11; 11+0+0+2 = 13). MVP por jugador, también
  en espejo.
- Maestría: cada lado ve la suya («Rápidas 2» y «Rápida 1»).
- «Mejores jugadas»: las mismas tres en los dos lados, con el marcador girado (10-8 frente a 8-10).
- Repetición: «Ver» se abre en los dos lados con el mismo paso. En el invitado, la partida que se pinta es la copia girada: balón
  (−2,88; 2,84) frente a (2,88; −2,84), y su equipo, abajo. 0 desincronizaciones. Al acabar se vuelve a la hoja.
- Revancha: los dos pulsan y empieza la época 1. Las jugadas y las estadísticas vuelven a cero. Consola sin errores en las dos páginas.
- Capturas en el scratchpad de la revisión (no en el repo).

### Lobby nuevo (capturas a 390x844 táctil, 844x390 y 1280x720)
- «Crear sala» se ve coherente con la cartelera: la vista previa es la misma franja, y los selectores son compactos y legibles.
  No tiene el aspecto «de IA» (sin tarjetas en rejilla ni degradados). Cabe entero en 390x844, sin desplazamiento horizontal.
- La sede sale tres veces seguidas: en la franja de arriba, en la vista previa y en el selector. Se puede quitar la de la franja.
- En 390x844 tu propio nombre sale cortado en la vista previa («JUGADOR…»). Es lo mismo que en la lista, pero en la vista previa extraña.
- «Cómo funciona» cabe en 390x844 (de 193 a 659 px).

### Pruebas (de una en una)
- `node tools/simtest.js`: «huella 2v2 idéntica» (150 partidas), «resim idéntica 100 %» y TODO OK.
- `node tools/nettest.js`: 61 ok. `node tools/net3test.js`: 55 ok. `node tools/roomtest.js`: 72 ok (emulador).
- `node tools/netdrive.js --rtc`: 25 ok.

### Pendiente (revisión)
- En la hoja del invitado que gana, el bloque MVP puede salir solo como «MVP rival» si hay empate a puntos con el mejor de su equipo
  (aquí, 7 y 7). Es cosmético; no he mirado si en offline pasa igual.
- La prueba `?net=bc` sin `&map=` monta un pabellón distinto en cada página. Solo pasa en la prueba: el lobby siempre manda la sede.
- Sigue sin pasar `node tools/replaytest.js --cdp` y sin captura de la hoja offline tras el cambio `stats`/`pstats`.

## Fase 6 — arreglos de la revisión (17-nov-2026)
- **MVP del Resumen con empate.** `VB.Recap.endModel` se queda con el primero de `d.pl` si hay empate a puntos. En offline tu equipo
  ya iba primero; en el online del invitado los ids del anfitrión iban antes y el empate se lo llevaba el rival. `endData` (ui.js) ordena
  ahora `pl` con tu equipo primero, en orden estable. En offline no cambia nada. La pestaña «Estadísticas» ya enseñaba los dos MVP.
- **«Crear sala».** La franja de arriba ya no repite la sede: dice «Tu sala · Así sale en la lista» y solo conserva el color de la
  sede. En vertical (≤ 620 px) la vista previa esconde la columna de la sede y «Entrar» (la sede ya está en el selector), así que tu
  nombre cabe: «JUGADORA LARGA» entra entero en 390x844.
- **Prueba `?net=bc` sin `&map=`.** El anfitrión elige ya la sede concreta (`VB.Venues.list(tipo)` con la semilla), como hace el lobby.
  Las dos páginas montan el mismo pabellón. Las huellas no cambian.
- `node tools/replaytest.js --cdp` pasa (TODO OK). Ya no queda pendiente.

### Pendiente
- (RESUELTO en la «Auditoría»: era cpuTxt, «Gan**a la CPU**» → «GANAL RIVAL».) En la captura del invitado que pierde, el rótulo grande «GANA EL RIVAL» se ve como «GANAL RIVAL» a mitad de animación. No lo he
  mirado más (puede ser el barrido del rótulo); conviene revisarlo con una captura en offline («GANA LA CPU»).
- Sigue sin captura de la hoja offline tras el cambio `stats`/`pstats` (replaytest --cdp, que sí pasa, abre la hoja offline sin errores).

## Auditoría (17-nov-2026)
Arreglos de una auditoría con verificador independiente (24 hallazgos confirmados). Por gravedad:
- **Los dos recargan a la vez** (o con menos de ~1 s de diferencia): se quedaban para siempre en «Volviendo al partido…» o los dos en
  «no hay partido» a los 40-80 s. Ahora el invitado SIN opciones que oye el saludo `back` del anfitrión contesta `bye 'gone'` y los
  dos quedan en noShow al momento (el que adopta ya acababa así con `bye 'gone'`). Además, tope absoluto de 60 s en `'connecting'`
  (`CONNECT_CAP_MS`) aunque lleguen saludos que no sirven. La marca de NetRec sigue contando como abandono («recargar no sale gratis»).
- **Mando y teclado en el HUD online.** Antes los botones de `#netHud` solo iban con ratón/dedo o Tab + Intro: con mando, tras un
  abandono del rival te quedabas atrapado. Ahora (`netHudKeys` en main.js): partido online terminado (`'ended'`) → Esc / Start /
  Intro / A / B = «Volver al menú» (también `ctx.actions.pause`); con botones a la vista, LB/RB (y la cruceta si el partido no corre)
  eligen botón y A lo pulsa. En pleno partido nunca se pulsa nada sin elegirlo antes (A sigue siendo golpear). Los botones del HUD ya no
  se rehacen cada segundo (la cuenta atrás les quitaba el foco) y se marcan con un aro blanco al enfocarlos.
- **Hoja del invitado tras una vuelta con la IA de por medio.** Le sobraban puntos (los suyos contra la IA) o le faltaban (los del
  anfitrión contra la IA). main.js guarda una copia de la hoja tras cada punto jugado con el rival presente; al aplicar un resync
  (`stats.rsIn`, `rsT` en la sesión) vuelve a esa copia y repone con el marcador de la foto los puntos que falten (sin el detalle de
  remates y aces de ese tramo). Vale también para el anfitrión que adopta (antes perdía la hoja entera; ahora al menos los puntos).
- **Rival malicioso por el DataChannel.** Invitado: inundación de `hash` (claves sin poda) + `snapok` (recorrido N×M) colgaba al
  anfitrión. Ahora `hash` solo se guarda si el tic es múltiplo de 120 y está cerca del nuestro (≤ ~55 claves) y `snapok` solo cuenta
  con una reparación en curso. Anfitrión: `resync` con `mine.length` enorme colgaba al invitado y `cfg.delay` sin tope lo congelaba;
  ahora `_applyResync` exige arrays de tamaño acotado (`≤ 3·RING`, `F − T ≤ RING`) y el retraso se limita a 0-8 también en el
  invitado. Una foto con basura (`snap` con `d.o[0] = {}`) sigue tirando la sesión (equivale a que el anfitrión se vaya).
- **Resync perdido en un segundo corte.** Lo que iba por el canal fiable de la conexión vieja se pierde al renegociar; el anfitrión se
  quedaba ~4,5 s congelado hasta una reparación con foto. Ahora cada `resync` lleva `id` y se repite cada 1,5 s (hasta 8 veces) hasta
  que el otro contesta `rsok`; el repetido se reconoce por el id y no se aplica dos veces (el invitado pone a cero su contador cuando
  vuelve un anfitrión que recargó). Lo mismo en el sentido inverso (fase 6). Otros mensajes de control en vuelo siguen pudiéndose
  perder en ese hueco; cada uno tiene su red (plazos, `repairPending`, huellas).
- **Código de sala copiado** (las reglas no exigen código único): `byCode` pide 5 y, si hay más de una sala viva con ese código, no
  entra en ninguna (`'dup'`: «Hay más de una sala con ese código: entra desde la lista o pide el enlace a quien la creó»). Al abrir una
  sala con código nuevo se comprueba que no lo use otra (se cambia). **Arreglo completo pendiente (cambia las reglas):** reservar el
  código en `codes/{code} = {uid}` (crear solo si no existe) y exigir en rooms `getAfter(codes/$(d.code)).data.uid == request.auth.uid`.
- **Lista del lobby saturable:** `list()` ya no filtra `state == 'open'` sin orden (salían las 40 de uid más bajo y 40 salas abiertas
  inútiles escondían las nuevas): pide las 50 de latido más reciente (`orderBy seen DESC`, índice automático de un campo, sin reloj del
  cliente) y filtra el estado aquí. **Límites conocidos de la beta:** las llenas y las que juegan también ocupan esos 50 huecos (con más
  de ~50 partidas a la vez la lista se queda corta; entonces, índice compuesto `(state, seen)`); alguien con muchas cuentas gratis y
  salas con latido aún puede tapar la lista (queda el código); y una misma cuenta puede entrar de invitada en varias salas a la vez (las
  reglas no lo impiden sin un documento por invitado). Las reglas no han cambiado.
- **Privacidad:** «Cómo funciona» prometía «nunca tu dirección de red»; sin TURN el rival la recibe en la negociación. Texto nuevo: «El
  juego solo enseña tu nombre, nunca tu correo. La conexión es directa entre los dos aparatos: … el aparato de tu rival conoce tu
  dirección de red».
- **«Igualado» y el anfitrión:** ver el párrafo «El anfitrión manda» de la fase 2 (el invitado comprueba las opciones contra la sala).
- **«Colocación dirigida: No» no llegaba al online:** el invitado manda su ajuste en el «pre» (`st.aimSet`) y el anfitrión lo pone en
  los dos huecos (`humans[t].aimSet`, también en «Igualado»: es una preferencia, no una ventaja). `?net=bc`: el hueco 0 con tu
  ajuste, el 1 con `&aimset1=0`.
- **Textos:** «sacal rival» / «SACAL RIVAL» / «GANAL RIVAL» (cpuTxt: `/a la CPU/` encajaba dentro de «sac**a la CPU**»; ahora con
  `\b`; también Carrera y 6v6 espectador). Sala de 1 set: el cartel y la presentación decían «Al mejor de 3 sets», la hoja «Sets a 11»
  (ahora «Un set a 11»). Revancha: «Empezando la revancha…» en vez de «Esperando a que entre tu rival…». Ayuda: «Tu rival tiene 60 s
  para volver». Abandonar en pleno partido ya no salta al menú en silencio: el HUD dice «Has abandonado [Volver al menú]».
- **Detalles de pantalla:** «Conexión inestable» parpadeaba al empezar cada partido (en la cuenta atrás no viaja nada: `lastRecv` se
  pone al día al pasar a `'playing'`). Con «Gira el móvil» delante ya no sale el aviso de red encima. Un clic en el texto del HUD ya no
  es un golpe (`data-ui`). «Crear sala» en un teléfono apaisado ya no enseña «Entrar» en la vista previa. En vertical, el nombre de la
  sala de espera pasa a dos líneas con letra de 24 px en vez de cortarse («ANFI PRUE…»); en la lista, `title` con el nombre entero.
- **Solo documentado:** RTT de 350-400 ms (párrafo «Límite práctico» de la fase 1).

### Pruebas nuevas
- `net3test`: (j) los dos recargan con 0 s y 1 s de diferencia → los dos noShow en < 2 s; (k) resync perdido en un segundo corte →
  se repite, sin reparación, espera < 3,5 s, huellas iguales; (l) RTT 300 sin pérdida → nunca «Conexión inestable» al empezar; (m) rival
  malicioso (huellas fuera de rango, snapok sin reparación, resync con `mine.length` enorme, retraso 2^31) y `mismatch` de la sala. Con el
  net.js de antes, (j), (k) y (l) fallan y (m) se cuelga.
- `netreplaytest` (5): corte de 25 s con la IA (la pide el anfitrión / el invitado) → la hoja de los dos = marcador final (usa
  `netStClone` / `netStatsResync` de main.js tal cual). Sin el arreglo, el caso del anfitrión falla (invitado 9-10 con 9-11).

### Pendiente (auditoría)
- Reglas: reserva de código (`codes/{code}`) y, si hace falta, `email_verified` para crear/entrar en salas; un documento por invitado
  para que una cuenta no ocupe varias salas.
- RTT ≥ 350 ms: retraso de entrada adaptativo (ver «Límite práctico»).
- Una foto (`snap`/`resync`) con basura sigue tirando la sesión del invitado; se podría descartar con try/catch y quedarse con la
  última buena.

## Informe de red (17-nov-2026)
Ferran: «hay gente probando el online; pon logs para comprobar cómo van las partidas, si hay mucho lag» (un probador: «70 estables
con subidas a 150»), y «lo primordial es el mejor ping; no me preocupan las trampas, pon cosas client-based».

- **Durante el partido no sale nada nuevo por la red.** `js/netlog.js` junta el informe en memoria y lo guarda UNA vez al acabar (o al
  cerrar la pestaña, con keepalive) en `netlogs/{uid}_{id}` = `{uid, ver, t, j}` (j = JSON). El partido ya era P2P (WebRTC con STUN,
  sin servidor en medio; Firestore solo en el lobby y la señalización).
- **Ventanas de 10 s:** ping de la app (pings de control por el canal fiable, procesados en frames: suma un frame de espera de cada lado,
  los tirones de las dos máquinas y las retransmisiones) y ping de la red (WebRTC `currentRoundTripTime`), [mín, media, p95, máx]; fps,
  peor frame y frames > 50 ms; esperas al rival (veces y ms); rollback (media y máximo en tics); ventaja de frames; paquetes y KB;
  ms con «conexión inestable» y con la pestaña oculta. **Sucesos:** inicio, juega, espera (> 250 ms), inestable/estable, resync,
  huella_distinta, contra_ia/vuelve_rival, abandono, resultado, ruta (cambio de tipo de candidato), fin. Entorno: navegador, sistema,
  móvil, pantalla, núcleos, memoria y `navigator.connection`. Nunca IP ni puertos (de getStats solo tipos y protocolo) ni correo.
- **HUD:** el ping que se enseña pasa a ser el de la RED (WebRTC, leído como mucho cada 2 s); el de control, con sus picos de frame,
  queda solo en el informe. Sin WebRTC (BroadcastChannel) o en los primeros segundos, el de siempre.
- **Reglas** (desplegadas el 17-nov-2026): crear/actualizar solo el propio (id `uid_xxx`, 4 campos, j ≤ 250 000); leer y listar solo
  la cuenta de Ferran (`hashing.sha256` del correo = el hash del acta en js/ui.js); nadie borra desde el cliente.
- **Visor:** https://takethecourt.com/netlogs.html (antes https://purupurpito.github.io/make-the-cut/netlogs.html) con la cuenta de Ferran abierta en ese navegador (usa la sesión del
  juego, mismo origen). Resumen, una fila por informe y detalle por ventanas al pulsar; «Copiar todo (JSON)» para pasárselo a Claude.
- En una prueba local (dos páginas en el mismo Chrome, PC cargado) ya se vio un caso típico: el invitado con frames de 1-3 s (compilando)
  y el anfitrión esperándole 0,5-0,7 s. `netdrive` «cero congelaciones» falla también en origin/main con el PC cargado (no es el informe).
- Pendiente, según lo que digan los informes: retraso de entrada adaptativo al ping, precalentar los sombreadores antes del saque
  inicial si las esperas vienen de ahí, TURN solo si hay rutas que no conectan.

## Menos parones en el online (17-nov-2026)
Ferran pidió «el 1 y el 2»: precompilar antes del saque y mandar las entradas antes. Lo medido con el informe de red y netdrive:

- **Precompilado del partido online.** `netBuildView` no precalentaba nada, a diferencia de `startMatch` y de los entrenos: el
  pabellón de la sala, los jugadores y los efectos (primer remate, onda, confeti) se compilaban en pleno partido y el rival esperaba.
  Ahora hace `prewarm('t')` + `prewarmPrograms(false)`. Además `Session` acepta `o.warm()`: el invitado no manda `ready` y el
  anfitrión no fija el arranque (`_begin`, `startPend`) hasta que SU máquina acaba de compilar (y hace `warmDraw`), con un tope de 5 s
  (`WARM_CAP_MS`). Sin `o.warm` (pruebas de Node) nada cambia.
- **Entradas antes.** Salen justo después de generar los tics del frame, antes de confirmar, predecir y presentar. Gana < 1 ms (la
  sesión entera cuesta ~0,35 ms por frame). Mandarlas entre frames no sirve si la entrada se lee por frame: haría falta leer el mando y
  el teclado por eventos (no hecho: mucho riesgo para unos ms).
- **Latido todo el partido (lo que más arregló).** El perfil de CPU del invitado en netdrive (`NDPROF=1`) mostró que sus «frames de
  1 s» eran el navegador sin darle frames, con el hilo libre: la sesión solo avanzaba en `requestAnimationFrame`, así que en ese
  segundo no mandaba nada y el anfitrión esperaba ~0,7 s. El Worker de `netTicker`, que antes solo iba con la pestaña oculta, ahora va
  todo el partido: si no hay frame en 100 ms, avanza la sesión (y con la pestaña visible sigue con el último movimiento del stick, sin
  golpes ni saltos). Pasa en la vida real con una ventana tapada por otra. netdrive «cero congelaciones»: antes fallaba ~4 de 6 veces
  (también en origin/main), ahora 3 de 3 sin una espera.
- Herramientas: `NDLOG=1|2` (informe de red y, con 2, los `[VB]` del precompilado) y `NDPROF=1` (perfil del invitado en
  `tools/out/netdrive-invitado.cpuprofile`) en netdrive.
- `tools/netreplaytest.js` falla por `msIngest is not defined` en el trozo de ui.js que extrae (viene del commit 9df2e53 de
  «Estadística del partido»; el juego no está roto). Pendiente de quien lleve ui.js.

## Online V2: conexión Fluida (17-nov-2026)
Ferran: «Haz una versión 2 del Online; en las normas de partida se puede escoger qué modelo usar». No hay servidor (Pages + Firestore),
así que los dos modelos son P2P: en «Crear sala», fila **Conexión**: **Precisa** (el rollback de siempre, por defecto) o **Fluida**
(nuevo, tipo Roblox). Especificación completa: `notes/online-v2-spec.md` (hecha con un panel de 3 diseños y 3 jueces).

- **Quién manda (Fluida):** cada máquina, siempre, en sus dos jugadores (nunca se le corrigen); el balón y la jugada, el campo donde
  está. El traspaso lo fija quien toca, en el contacto: `khAt` = medio paso común en que cambia el dueño (viaja en el `tc`), con una
  zona junto a la red que crece con la velocidad (`L = clamp(0.12·|vx|, 0.25, 0.6)`; 0,6 sin toques), así los bloqueos los juzga el
  bloqueador con su pose real. Cada punto lo decide UNA máquina (`pt`) y la otra lo aplica (`flApplyPt`); marcador comprobado con un
  resumen en cada punto (`pa`), el anfitrión repara (`sb`). Faltas de red del que no tiene el balón: `fq` al dueño.
- **Rival:** fotos binarias (`S`, 30 Hz en juego, 10 Hz parado, ~2 KB/s), pintado 50-150 ms en el pasado e interpolado; el balón que
  llega se acelera (máx. ×2) para alcanzarte en el presente; deriva de cálculo entre navegadores corregida a 3 cm.
- **Código:** `js/netfluid.js` (VB.NetFluid.Session, misma fachada que VB.Net.Session; main.js elige por `net.model`), `stepFluid` y
  la API `VB.Sim.fl*` en el bloque FLUIDA de sim.js (todo lo de dentro de funciones viejas va tras `if (g.fl`; huellas offline y
  Precisa idénticas), fila y chip en netlobby.js, campo opcional `net: 'fluida'` en las salas (reglas: solo ese valor o ausente), la
  versión de sala lleva `|L2` (un cliente viejo ve «Otra versión»). La revancha, la vuelta tras recargar y «Seguir contra la IA» van.
- **Beta, sin:** «Mejores jugadas», ojo de halcón, errores del árbitro y tiempos muertos en salas Fluidas (`opts.ref` a cero).
- **Pruebas:** `tools/fluidsimtest.js` (vuelo idéntico, khAt, catch-up, puntos aplicados, autocontrol de que cada línea nueva lleva
  `g.fl`), `tools/fluidtest.js --quick|--full|--scen` (dos sesiones por memPair con ping, jitter, pérdida, cortes, recargas, IA,
  revancha, Precisa contra Fluida), `node tools/netdrive.js 300 120 "quality=low&model=fluida&points=11"` en Chrome.
- **Revisión adversaria** (5 enfoques, 2 escépticos por hallazgo): 18 fallos confirmados y arreglados (recarga del invitado, dueño tras
  resync, validez tras adopt, balón clavado al caer, saque contra la IA, parón largo del anfitrión, versión de sala, chip en vertical…).
- **Pendiente:** afinar D/warp/zona con ping real (Ferran y amigos), repeticiones y challenges en Fluida (fase 2), récord aparte si se
  quiere (`m:'f'`), y ver con los informes de red cuál se siente mejor.

## Online V2: pulido de la Fluida (18-nov-2026)

Medido con `tools/fluidtest.js` (sensación por frame), `tools/fluidscen.js` (nuevo: jugadas difíciles junto a la red entre dos
sesiones reales, reloj virtual, deterministas) y perfil de CPU. Lo que se veía y está arreglado (todo en `js/netfluid.js` salvo lo dicho):

- **Balón a media velocidad 0,4-0,7 s tras cada defensa o bloqueo del rival**: el retraso de pintado crece con una curva suave
  (nunca por debajo de 0,65x). Frames a menos de 0,6x: del 4-10 % al 0 %.
- **Rival y balón que saltaban 1-11 m al empezar cada saque del rival**: hasta que llega su foto de saque se queda en la formación
  de `setupServe` (determinista). Si esa foto se pierde (canal sin reenvío), la primera foto viva del rally actual hace de foto de saque.
- **Saltos del balón al corregirlo un contacto del rival**: siempre mezclados; >1 m en un frame de 63/74 a 1/2 en el peor caso (250 ms);
  >3 m en rally: siempre mezclado (solo se salta lo que pasa de 3 m).
- **Remates junto a la red**: solo se salta lo que la aceleración máxima no puede absorber; mezcla de 90 ms lejos de mis jugadores.
- **Retraso del rival (Dp)** más justo: pérdida y jitter mejor estimados (p. ej. 208 → 164 ms a 60 ms de ping).
- **Bifurcaciones decididas por tiempo** (gana lo que pasó antes; empate, el anfitrión): un punto bien dado ya no se deshace porque el
  rival tocase tras el traspaso (`point()` guarda hs/lf/lfp en `g.fl.pts`, línea con `g.fl`). Red tocada cruzando un traspaso: la falta
  la pito yo. Quien pierde la bifurcación quita su contacto de los eventos (estadística igual en las dos máquinas).
- `_undoPoint` todo o nada; no deshace si ya se preparó el saque siguiente o se enseñó el final. Si el rival ganaba y ya no se puede
  deshacer: no cotejado y el anfitrión manda el marcador (`sb`).
- **Pestaña del rival oculta**: el otro ya no parpadea en «Esperando…» (espera de 1,5 s si el rival está fuera; HUD solo si > 0,3 s).
- **Rendimiento**: sin la copia entera de la partida de más por frame (`withDisplay` + `NetView.mirror` en main.js, solo Fluida;
  vista idéntica en 23.072 frames), `flKh` con atajo analítico (67 → 38 µs, mismos resultados en 200k balones), cursor de vuelo
  en `_ballAt` (comprobable con `BACHECK=1`), menos objetos por foto.

Pruebas: fingerprint6 idéntica, fluidsimtest 41, fluidscen 542/0/0, fluidtest --quick 109/0 (umbral de aceleración a 150-250 ms:
1,8; la p95 son ~10 muestras y un libre que antes era un salto de hasta 3 m ahora es un acelerón de 1,79), nettest 61,
netreplaytest 34 y `netdrive --guion` 27 (las dos pruebas viejas arregladas). `netdrive` Fluida a 150 ms falla «cero congelaciones»
con el PC cargado (invitado a 4-11 fps); la versión de antes del pulido falla igual en las mismas condiciones.

Pendiente: límite de velocidad de la cámara tras traspasos (spec §5.3); control del atacante junto a la red y coste del ×4 de
recuperación (decisiones de ajuste de Ferran); copyGame en modo diccionario (compartido). Falta la prueba de verdad: dos casas.

## Salto con impulso en el online (v1.12.0, 18-nov-2026)
- netlobby.js: `djump:true` en las opciones del anfitrión; `humans[i].jsetAim` (colocación en salto con diana, ajuste de cada jugador;
  el invitado lo manda en `'pre'` como `st.jsetAim`, también en «Igualado»). Sin `PROTO` nuevo: la versión del juego ya separa salas.
- sim.js: `SLOT_S` lleva el búfer de dirección, el arrastre de la diana y la diana de colocación (`jdF, jdS, jdM, jdT, aimCarry, jsMv,
  jsAimD, jsetAim`). `p.dj` no viaja en Fluida (no está en `FL_POSE`: `_simPose` de netfluid.js no lo manda; es solo la inclinación
  del rival y su sombra de caída, que en Fluida no salen). netview.js los clasifica (viewtest en verde). `tools/fluidsimtest.js`: `SIM_BASE` actualizada
  con `--rehash` tras comprobar que la huella 2v2 sigue idéntica (el bloque FLUIDA no cambia).

### Challenge en la Fluida (1.14.1, 18-nov-2026)
Ferran: «pon challenge en v2». La Fluida ya no fuerza `opts.ref` a cero (main.js, netlobby.js, netfluid `_setOpts`): árbitro con
errores de línea y 2 challenges por set, como en la Precisa. Tiempos muertos y repeticiones siguen fuera.
- La llamada la hace el dueño del balón en `land()` (con su azar) y viaja en el `pt` como `cl` (`Sim.flCall`); `flApplyPt` la pone en
  `g._pendCall`, así `g.call` y `g._snap` son iguales en las dos máquinas. `g.call.r` = rally de la llamada.
- Protocolo: el que perdió el punto pide (`request('chal')` → `_chalAsk`: solo si quedan más de `C.CH_MARGIN` = 0,8 s de ventana)
  `ch {r}`; la otra máquina (la que saca: la ventana acaba con SU saque) decide con `Sim.flChallenge(g, t, r)` y contesta `chok`/`chno`;
  con `chok` el que pidió aplica `flChallenge(..., force)` sin mirar la ventana. La revisión corre en las dos (empieza ~RTT/2 después
  en la del que pidió); si anula el punto, `stepFluid` lo vuelve a pitar con `g.fl.app` (sin guarda ni `pt`), `r` sube otra vez y
  `F.peer` se borra (se espera el `sr` del punto nuevo). `flMatch` lleva `challenges` (sb y deshacer bifurcación); `_undoPoint` borra `g.call`.
- `tools/fluidchaltest.js`: 6 partidos con árbitro muy fallón y 5 challenges, peticiones con retraso al azar y una tardía a mano:
  mismos puntos, revisiones y challenges restantes en las dos, fin cotejado, sbFix 0.

### Aviso de versión nueva (1.15.1, 19-nov-2026)
Ferran: «si un teléfono está en una versión anterior le salte un aviso en la pantalla de reiniciar». js/update.js (VB.Update) pide
`version.json?t=` (lo escribe tools/build-pages.js) al arrancar, al volver a la pestaña (cada 5 min como mucho) y al abrir el Online
(`check(true)`); si la publicada es más nueva, hoja SPLAT «Hay una versión nueva» con «Reiniciar» (recarga con `?u=` para saltarse la
caché de 10 min del index) y «Luego». Nunca en partido. Las salas «Otra versión» más nuevas (`room.v`) también la abren. El `bye 'version'`
lleva `ver` y el resultado `rv`: main.js dice «Tienes una versión anterior» o «Tu rival tiene una versión anterior». Pruebas: `&vnew=X.Y.Z`.
Los móviles con 1.15.0 o antes no tienen este código: el aviso les sale a partir de la primera vez que recarguen.

## Online de varios (1.23.0, sprint online-multi, 21/22-nov-2026)

Versión **1.23.0**. La rama investigacion salió antes como 1.22.0 «A tu manera» (main 34bffd4) y se fusionó aquí el 24-nov-2026; online
de varios, que estaba numerado 1.22.0 sin publicar, pasa a 1.23.0, porque el online decide si dos versiones juegan juntas solo por el
número (salas: `v = PROTO|VB.VERSION`; sesiones: el saludo compara `VB.VERSION`).

Diseño: notes/online-multi-brief.md (§3 la red, §4 salas, §5 interfaz, §6 coop). Peticiones entre paquetes y su estado:
notes/online-multi-requests.md. Reglas de Ferran: cada persona lleva UN jugador, la IA llena los sitios vacíos, el que tenga mejor
ping crea la sala, ninguna carga de servidor durante el partido, las trampas no preocupan, y la meta es «casi sin lag».

Qué hay:
- **2 contra 2 con hasta 4 personas**: conexión **Precisa-N** (rollback de N plazas, js/net.js). La fila Conexión queda fija en Precisa.
- **6 contra 6 con hasta 12 personas**, siempre en Pabellón: **modelo anfitrión** (js/nethost.js). Conexión fija «host».
- **Carrera cooperativa de playa**: el anfitrión y su pareja humana contra la IA (Precisa-N con 2 plazas en el equipo 0, js/career-coop.js).
- El 1 contra 1 (Precisa y Fluida) no cambia: `new VB.Net.Session(o)` solo da una SessionN si `o` trae `seats`, más de un enlace o `n > 2`.

### Plazas (sim.js, bloque MULTI)
`createGame({online: true, humans: [{team, idx | role, aimSet, jsetAim, attrs, badges}…], format: '2v2'|'6v6', coop, teamLv})`. Es «de
varios» (`g.mh`) con 6v6, coop, más de 2 plazas o alguna plaza con `team` distinto de su índice (`VB.Sim.isMulti(opts)`). Plaza = índice
en `g.hum` (NO el equipo: `g.hum[s].team`). Entradas por plaza (`ins.length === g.hum.length`). Lecturas: `humSlot(g, p)`, `seatOf`,
`humOn(g, t)`, `humansOf(g, t)`, `seatRep`, `seatGet`. En 6v6 online el banquillo está apagado (a un humano no lo cambia nadie).
Detalle: la cabecera del bloque MULTI de sim.js y CONTRACT.md «Online de varios».

### Precisa-N (js/net.js, bloque PRECISA-N)
Rollback de siempre con un anillo de entradas por plaza, estrella con el anfitrión de centro (reenvía las entradas de cada plaza y
los `app` de cada invitado a los demás), confirmar cuando están TODAS las plazas (las de la IA las escribe el anfitrión como `{ai}`),
huellas de todos al anfitrión y foto solo al que no cuadra, resync por plaza. Retraso adaptativo `clamp(round(maxRTT/2/STEP_MS) - 16,
2, 8)` con maxRTT = suma de los dos peores pings (camino invitado↔invitado). Una plaza que no se oye o hace esperar 3 s pasa a la IA;
con más de 2 plazas, la que hace esperar a todos a ratos pasa a espectador (`r.meAI`: HUD «Tu conexión va lenta: te lleva la IA un
rato») y vuelve sola a los 20 s (40, 80… hasta 2 min). Paquete 'in' de tipo 2 `[2|época<<4, plaza|resync<<4, nb, u32 tic, na,
na×u32 ack, nb×(plaza, u32 primer tic, u32 tic de esa plaza, n, n×5 B)]`; con 2 plazas, el de tipo 1 de siempre (una SessionN de 2
juega con una Session 1.21.0). 'ctl' nuevos: `hello{seat, n}`, `seat{s, ai, gone, why}`, `pings{p}`, `delay{d}`, `resync{s, rings,
spect}`, `app{d, s}`. Bit 7 de los botones = «¡Pídela!» (switchPlayer). `result.win` por EQUIPO; un compañero que se va lo lleva la
IA y el partido sigue; 'rivalQuit' / 'rivalGone' = se ha ido TODO el equipo rival. Sin vuelta del anfitrión que recarga.
Tope de predicción `MAXPRED_N` 60 tics (el 1v1 sigue en 24) y ritmo de envío `SEND_HZ` 60: ver «Robustez del de varios» abajo.

### Modelo anfitrión del 6v6 (js/nethost.js)
El anfitrión corre la partida de verdad (IA, balón entre toques humanos, rotación, líbero, marcador, árbitro); cada invitado simula
solo SU jugador (retraso 0) y manda su pose a 60 Hz (30 B) y sus toques con sello de tic; el anfitrión los aplica rehaciendo el balón
desde ese tic (si chocan dos, gana el anterior; plausibilidad: su jugador, a ≤ 3,5 m de su pose, mismo rally) y puede «salvar» un
punto (retiene hasta 160 ms el bote cerca de un invitado por si llega su plancha). Paquete del anfitrión a 30 Hz (279 B con 12
jugadores; cabecera de 15 B: [12]-[13] reparto de la IA por equipo (id del jugador o 255), [14] F.seq del último contacto; bit 64 de
cada pose = «va a por el balón», que el invitado declara con el bit 4 del byte [7] de su pose); 'ctl': `tc`, `toss`, `ev`, `fs` (foto
entera en trozos de 15 KB en cada cambio de modo), `pg`, `rej`, `gone`, `app`, `bye`. Protocolo 'H2'.
Los demás se pintan interpolados. **Balón pintado continuo** (L1, 22-nov-2026; solo lo pintado, la partida y las reglas no cambian):
el reloj del balón no pasa del punto de la trayectoria en el que un jugador PODRÍA tocar sin que su toque haya podido llegar aún (lat
por fuente, aprendida de los toques de verdad): frena antes (hasta ×0,5) para llegar a su mano cuando llega su toque y recupera luego
(hasta ×1,5; ×1,9 si viene a ti). Quién puede tocar: el reparto de la IA del anfitrión y el «voy» de cada invitado, atados al F.seq del
mismo contacto. Lo que aún salte se reparte (≤ 0,15 m de corrección por frame). Tras el punto el balón termina su vuelo y luego pasa
al de verdad. El anfitrión pinta igual: un punto salvado por un invitado ya NO hace volver el balón del suelo a la plancha.
Medida (tools/hosttest.js, 12 plazas a 80-150 ms ±15, 2 % de pérdida, 4 partidos): saltos del balón pintado > 0,5 m 50 → 0 en los
invitados (máx 0,41 m) y 10 → 0 en el anfitrión; contactos tardíos −76 %; toques rechazados 39 → 12; CPU +4-10 % por frame.
Regresión: `node tools/hosttest.js` sección (d) (semilla 11, partido entero, 0 saltos).
Subida del anfitrión ~130-150 KB/s con 11 invitados: mejor crear la sala desde un PC o con wifi.

### Salas: esquema v3 (js/netroom.js, firebase/firestore.rules)
Aditivo: las salas 1v1 no cambian (un 1.21.0 en caché sigue igual con ellas). Sala de varios = `{…, multi, mode: 'vs'|'coop', cap:
2|4|12, fmt: '2v2'|'6v6', seats: {uid: {n, at}}, cnt, lineup?}` (`guest`/`gname` vacíos). La coop no sale en `list()`: se entra por
código o por `?coop=CÓDIGO`. Señalización por pareja: `sig/o_<uidInvitado>` (oferta) y `sig/a_<uidInvitado>` (respuesta), que se
borran en cuanto abre el enlace. API: `rooms.open({…, mode, cap, fmt})`, `join` / `joinMulti` / `leaveMulti`, `kick(uid)`,
`beat({cnt, state, lineup})`, `putSig/getSig/delSig(id, kind, uidInvitado)`. La conexión de la sala de varios sale del formato
(`roomModel`: 6v6 → 'host', 2v2 y coop → Precisa); desde L3 además `multiCfg` pone `net: 'host'` en todo 6v6 (y en vs 2v2 de 4 si se
pide) y las reglas lo validan ('host' en 6v6 o con 4 plazas, 'fluida' solo en vs de 2); `roomModel` lo lee además del formato.
`LOBBY = 3` en netlobby.js: un 1.21.0 o un 1.22.0 ve las salas vs de un 1.23.0 como «Otra versión».
- **Coop fuera de 1.21.0** (L3): una coop esperando compañero va en `state: 'coop'` (nunca 'open'; reglas `multiMode`, escritas con
  ternarios: con `!=` o `||` de varios `&&` el emulador da HTTP 500 al validar). `byCode` busca solo por código y filtra 'open' | 'coop'
  en el cliente; `VB.NetRoom.joinable(room)`. Un 1.21.0 en caché no la ve en la lista ni por código y no puede entrar.
- **Menos lecturas** (L3): `rooms.beat(patch, {lite: true})` = 1 escritura sin releer; el anfitrión de varios late así y, con el partido
  empezado o la coop emparejada, una vez por minuto (`PLAY_BEAT_MS`). Sondeo del anfitrión: nada con la sala llena y todos dentro; cada
  6 s con la pestaña oculta (`HID_POLL_MS`). El invitado que espera la oferta da al anfitrión por ido con el latido de más de 65 s
  (`MX_STALE_MS`; como mucho 95 s, `MX_OFFER_MAX`). Anfitrión, ciclo entero (lecturas/escrituras): 2v2 × 4 165/47 → 74/28; 6v6 × 12
  238/64 → 138/45; coop 120/44 → 60/22; partido 0 lecturas + 1 escritura por minuto. Invitados: 0 con el enlace abierto. El 1v1, igual
  (110/39). Medir: `node tools/roomtest.js [--no-life] [--life-only] [--life-ref <commit>]`.

### Lobby de varios (js/netlobby.js, bloque «ONLINE DE VARIOS»)
«Crear sala» con la fila Formato (1/2/6 contra 6; 6v6 fija Pabellón; Conexión fija en 2v2 y 6v6). Tickets «n/cap» + formato. Sala de
espera con dos columnas de sitios (dorsal, puesto, «Tú», ping, listo): tocar = sentarse o levantarse; el anfitrión mueve, saca y
cambia los equipos de lado; «Empezar» cuando todos los conectados están sentados y listos. El anfitrión hace las ofertas a todos en
paralelo; con el enlace abierto todo va por 'ctl' (`lb-hi`, `lb`, `lb-sit`, `lb-rdy`, `lb-ping`/`lb-pong`, `lb-out`, `lb-bye`,
`lb-go`, piezas `lbk` de 4000 caracteres, `cx` de la coop) y el invitado deja de leer Firestore. Quien no conecta en `CONNECT_MS` se
suelta y su sitio lo lleva la IA. Vuelta del invitado tras recargar: «Robustez del de varios» abajo. Pruebas: `node tools/lobbytest.js`.

### Carrera cooperativa (js/career-coop.js, VB.CareerCoop)
Extensión de la Carrera (id 'coop'): la Carrera es del ANFITRIÓN y vive solo en su guardado; el invitado la ve desde un almacén en
memoria (`VB.Career._useStore`) y solo escribe `make-the-cut.coop.p2` (la copia de su jugador). El invitado es la pareja de playa con
su propio jugador `c.coop.p2` (XP, nivel, puntos, insignias; química propia). Solo liga y Open; v1 sin ambiente, zona ni «Te tienen
estudiado». Flujo: Carrera › Partido › tarjeta «Cooperativo» → «Jugar en cooperativo» (sala coop, código) → el invitado escribe el
código y «Unirse» → recibe la Carrera (foto gzip troceada) → «Listo» → el anfitrión «Jugar» → `ctx.actions.startCoopCareerMatch` en
los dos → partido Precisa-N de 2 plazas → solo el anfitrión cierra la jornada con los eventos CONFIRMADOS → hoja final sin «Revancha»
y con «Volver a la Carrera» → la Carrera se abre en los dos con la foto nueva. Pruebas: `node tools/cooptest.js` (~60-80 s: la
sección 5d juega dos partidos Precisa-N de verdad), `node tools/netdrive.js --coop`.
Pulido (L4, 22-nov-2026): las insignias de los dos humanos se cuentan con los eventos CONFIRMADOS (`feed`; ui.js no las cuenta con
`ctx.net.coopCareer`): error 0 en 24 partidos de prueba (antes 4,1 %, hasta 8 % a 200 ms). Tras matchDone el anfitrión manda `sum`
(el Resumen del invitado: SU XP, nota, números e insignias, más su p2 nuevo) y cada aparato abre «Resumen de la jornada»
(`VB.UI.endCareer`) sobre la hoja online. Mensaje `st` {w: 'hub'|'solo'|'menu'} = qué hace el anfitrión (tarjeta del invitado en su
hub). Hoja modal `#coSheet` del invitado (esperando la Carrera, corte con su jugador guardado). API nueva: `VB.CareerCoop.{guestSum,
endX, showSum, sheet, hostState, p2Rec, matchWatch, _demo, _tick}`. Los retos (VB.Retos) no cuentan en ningún online (ui.js no llama
a `Retos.endMatch` con `g.online`), así que su `ingest` de lo presentado no tiene efecto en el coop.

### Despliegue de las reglas (Ferran, ANTES de publicar el cliente 1.23.0)
Las reglas v3 NO están desplegadas. Orden: primero las reglas, luego el cliente.
1. `npx firebase-tools deploy --only firestore:rules` (con la sesión guardada; reglas en firebase/firestore.rules). Son aditivas: el
   1 contra 1 de 1.21.0 y 1.22.0 sigue funcionando igual con ellas.
2. Después publicar 1.23.0. Sin las reglas, crear una sala de varios da «Las salas de varios aún no están activadas» y el 1v1 va igual.
Comprobado contra el emulador con las reglas del repositorio: `node tools/roomtest.js`, `node tools/lobbytest.js` y los netdrive
`--multi` con `NDRTC=1` y `--coop` de abajo.

### Integración y lag (P8, 22-nov-2026)
Pruebas en Chrome (tools/netdrive.js; una cada vez, PC en reposo):
- `node tools/netdrive.js --multi N [segundos] [lag] [query]`: N páginas del juego real con `?net=bc&n=N&slot=k` (main.js
  `startNetTestN`; BcLink con `to`: canal y Shaper por pareja), `&norender=1` en las que no pintan (sin escena ni GPU; un punto de 1 px
  mantiene requestAnimationFrame a 60), bots, `NDCPU=4` frena una página como un móvil. `NDRTC=1` = por el lobby de verdad (sala de
  varios en el emulador, crear con Formato, entrar, sentarse, Listo, Empezar) y WebRTC local.
- `node tools/netdrive.js --coop`: la Carrera cooperativa de punta a punta (dos Chrome = dos aparatos, lobby de verdad, emulador, WebRTC).
- `node tools/netdrive.js --rtc [s] [lag] "quality=low&netlag=80&netjit=15&netloss=2"`: el 1v1 por WebRTC con el Shaper nuevo de
  js/netrtc.js (`?netlag=&netjit=&netloss=`, solo en local); `NDRTCMODEL=fluida` lo hace con la Fluida. La ayuda del lobby por páginas
  (html.ph) se recorre entera.

Medidas (escritorio, RTT 80 ms ±15, 2 % de pérdida en 'in'):
| prueba | esperas | rollback (máx/p95) | saltos del balón pintado | sesión p50/p99 |
|---|---|---|---|---|
| 2v2 × 4, Precisa-N, BcLink | 0 | anfitrión 11/6, invitados 16-17/12 | antes 4-9 por invitado en 90 s (hasta 1,75 m); con el suavizado 0-1 (≤ 0,37 m) | 0,3-0,4 / 0,6-0,7 ms |
| ídem con una página a CPU ×4 | 0 | 22/12 | 7 (1,56 m) en la frenada, sin suavizar | 1,6 / 3,3 ms en la frenada |
| 2v2 × 4 por lobby + WebRTC | 0 | 18/13 | 0-1 tras suavizar (0,31 m) | 0,4 / 0,8 ms |
| coop 2 páginas, set entero | 0 | 17/6 y 7/5 | (antes del suavizado) 18-26 en 6 min | 0,2 / 0,4 ms |
| 6v6 host, 4 páginas | 0 | — | 0 en todas (antes del arreglo del reloj: 29 por invitado sin dibujo, hasta 12 m) | 0,1-0,2 / 0,3-0,4 ms |
| 6v6 host, 12 páginas (2 pintan, 1 a CPU ×4) | 0 | — | 0 en 10 de 11 invitados; la frenada 8 (1,9 m) por sus parones | anfitrión 0,2 / 0,9 ms, sube 152 KB/s |
| 6v6 host por lobby + WebRTC, 4 | 0 | — | 0 | 0,1-0,2 / 0,3-0,4 ms |
Fps: las que pintan, 60-63 (el anfitrión, 126 en este PC); la de CPU ×4, 59-61 con 4 páginas y 22 con 12. La página a CPU ×4 tiene
parones de requestAnimationFrame de hasta 1 s (20-55 en 60-90 s) que en el resto no salen: con Chrome sin cabeza no se sabe si un
móvil de verdad haría lo mismo (falta la prueba en un teléfono).

Arreglos de lag de P8:
1. **Reloj del invitado del modelo host** (js/nethost.js `_pong`): el desfase con el anfitrión se tomaba de la PRIMERA muestra y luego
   solo se corregía 2 ms por pong. Si esa muestra venía de un parón de la página (montar el partido de 12 jugadores tarda), el
   invitado jugaba ~0,45 s adelantado todo el partido: colchón de interpolación de ~0,5 s, 30 toques «tarde» por minuto y saltos del
   balón de hasta 12 m. Ahora, antes de jugar, siempre la muestra de RTT mínimo; jugando, el 10 % del error si pasa de 40 ms (si no, 2 ms).
2. **Balón pintado del anfitrión** (nethost.js `_hostPaint`): un toque de invitado que llega tarde rehace el balón y en la vista del
   anfitrión saltaba (~10 por minuto, hasta 1,1 m): el salto se reparte en 80 ms con el mismo `_blend` del invitado. La partida no cambia.
3. **Balón pintado de Precisa-N** (main.js `netBallSmooth`): los rollbacks de 10-24 tics de los invitados (dos tramos por la estrella)
   hacían saltar el balón hasta 1,5 m; ahora la vista reparte el salto en 80 ms (solo la vista; el 1v1 no pasa por ahí).
4. **Invitados con la IA en todo el primer peloteo** (nethost.js `_guestAdvance`): en el tic 0 el anfitrión aún no tenía la pose de
   ningún invitado («sin pose = la IA») y la plaza no volvía hasta el primer balón muerto (en netdrive por el lobby, más de 20 s con
   las etiquetas «IA»). Ahora el invitado manda su pose ya en la cuenta atrás: plazas humanas desde el tic 0.
5. Retraso de entrada: probado fijo a 4 tics en 2v2 × 4 (`&delay=4`): el rollback de los invitados baja solo de p95 12 a 10-11 y los
   saltos no bajan. Se queda la fórmula (2 tics hasta ~270 ms de camino): no compensa 17 ms más de retraso.

6. **Jugadores remotos suavizados en Precisa-N** (L2, main.js `netPlayersSmooth`): tras un rollback, los jugadores que no lleva esta
   máquina se pintan con un desfase que se deshace en línea recta en 80-150 ms (hasta 1 m, ≤ 0,11 m más por frame; más de 2 m =
   teletransporte; solo en 'rally'/'serve'; no toca a tu jugador salvo con `r.meAI`). Solo la vista (net.view). netdrive --multi 4,
   saltos > 0,15 m / > 0,5 m de los jugadores de los demás en 90 s: a 80 ms 372-449 / 23-30 → 1-4 / 0 (máx 0,22 m); a 150 ms
   585-732 / 205-286 → 32-51 / 0 (máx 0,45 m). El modelo host ya interpolaba a los suyos.
7. **Final sin evento** (L2): en el de varios, sesión en 'over' sin gameOver presentado (final confirmado en silencio por un resync)
   → hoja final a los 600 ms (`NDDROPGO=k` en netdrive lo prueba).
8. Los parones de ~1 s de netdrive en el arranque del 6v6 NO son del juego: son de las pestañas de detrás del Chrome de pruebas
   (salen igual en las páginas sin dibujo; con `NDFRONT=k` la página de delante no tiene ninguno).
9. **Anfitrión del modelo host** (P8, main.js): su vista pasa por `netPlayersSmooth` (los invitados se pintaban con su última pose
   extrapolada: tirón con cada pose). 6v6 × 12 a 150 ms, jugadores en la vista del anfitrión > 0,5 m: 45 → 0 (máx 0,96 → 0,14 m).
10. Medidas finales (22-nov-2026) y la tabla: notes/online-multi-requests.md «P8 (medida final tras L1-L4)». netdrive --multi da una
   línea «RESUMEN» por página (rollback p99, jugadores pintados p99, balón pintado > 0,5 m, rAF, fps, subida por enlace).

11. **Arreglos de lag en móvil lento** (P8, 22-nov-2026, tras la medida final):
   - **Predicción incremental de Precisa-N** (js/net.js `NP._predict`): antes cada frame copiaba gc y rehacía todos los tics hasta el
     presente (20-24 a 150 ms). Ahora, si las entradas que usó la predicción del frame anterior son las que se saben ahora, sigue desde
     ella y solo da los tics nuevos; si alguna cambió, se rehace desde gc como siempre. Misma partida (prueba aparte: 4500 frames
     comparando con el rehacer de antes, 0 distintas, 2v2 × 4 a 80/150 ms y coop), tics rehechos por frame 14,1 → 5,5 de media.
     `stats.resim`. La sesión en la página a CPU ×4: p50 2,3-2,4 → 0,6-1,0 ms (el p99 sigue en ~4,5 ms: los frames con rollback entero).
   - **Balón pintado de Precisa-N** (main.js `netBallSmooth`): deshace como mucho 15 m/s (≤ 0,25 m por frame) y reparte saltos de
     hasta 4 m (antes 3 m y la mitad cada 80 ms: con CPU ×4 un rollback de 2-3 m se veía en 2-3 frames de 0,5-0,8 m).
   - **Invitados del modelo host** (main.js): también pasan por `netPlayersSmooth`, salvo el que va con el reloj del balón de L1
     (`pDel` / `_capBind`: a ese no se le añade desfase, así su mano y el balón siguen llegando a la vez). 6v6 × 12 a 150 ms, jugadores
     pintados de los demás en los invitados: p99 0,16 → 0,09 m.
   Medidas y tabla: notes/online-multi-requests.md «P8: arreglos de lag tras la medida final».

### Robustez del de varios (revisión, lanes A y B, STRESS; 22-nov-2026)
Detalle, medidas y antes/después: notes/online-multi-requests.md («Revisión», «Lane A», «Lane B», «STRESS», «Revisión 2»).
- **Vuelta del INVITADO tras recargar** (2v2 Precisa-N, 6v6 anfitrión, Carrera coop; js/netlobby.js «VUELTA TRAS RECARGAR EN EL ONLINE
  DE VARIOS»). Marca BACK en sessionStorage (`multi: 1`; sin SDP ni direcciones) en el pagehide y al ocultarse la página; con la página
  oculta, main.js (`netBgTick`, el Worker que no se frena) llama a `VB.NetLobby.backAlive()` cada ~3 s y la marca se reapunta con la hora
  de ahora (si el móvil la descarta tarde, la marca no está caducada); al volver a verse se borra. Sin adiós ni plaza fuera. Al cargar:
  hoja «Volviendo a la partida…» → la siguiente oferta del anfitrión → con el enlace abierto, sesión nueva sin opciones en su plaza.
  Plazos: 55 s (`MX_BACK_MS`, Precisa-N y coop), 120 s (`MX_BACK_HOST_MS`, modelo anfitrión); espera del enlace 70 s (`MX_BACK_WAIT`).
  **Relink del anfitrión** (`mxRelinkHost`): oferta a los 0,6 s, cada 10 s el primer minuto y luego cada 20 s, mientras el invitado aún
  pueda volver (plazo + 15 s de carga, `RELINK_PAD`; la hora de la primera caída queda en el par). Antes: 7 intentos (~60 s), y en el 6v6
  una vuelta entre los ~70 y los 120 s no conectaba nunca (lobbytest (h): antes FALLO, ahora vuelve a los 82 s).
- **Anfitrión**: no vuelve (nadie más tiene la partida entera). Al irse manda `{t:'hostLeft'}` y los invitados acaban con 'hostGone'
  (`result.left`); respaldo `mxHostChk` (sala borrada → lo mismo). Pestaña oculta: `{t:'hostAway', a}` → «X ha salido un momento…».
- **Sesiones**: Precisa-N readmite con saludo + ready (IA + resync con foto), también por otro enlace (`addLink`); nethost readmite con
  `{k:'bye', why:'reload'}` + `hello`, `addLink`, y un invitado que calla más de GONE ya puede volver (`C.GONE` = `C.HOST_GONE` = 60 s,
  `C.REHELLO` 1 s, 'ctl' `back{s}`, `result.why 'lost'` si la parada fue SU página).
- **Ritmo de envío de Precisa-N** (`VB.Net.SEND_HZ` 60): con pantallas de más de 60 Hz, como mucho 60 paquetes/s por enlace (crédito;
  un botón sale en el acto, un cambio del stick > 5 % puede adelantarse un frame). 126 fps: 116-118 → 58-59 paquetes/s, subida del
  anfitrión 37 → 19 KB/s por enlace. `o.pace === false` = uno por frame (pruebas); `stats.paced`. nethost ya iba por tics.
- **Tope de predicción** `VB.Net.MAXPRED_N` 60 (24 → 30 en lane B, 30 → 60 en STRESS): con cortes de 300 ms o 250 ms de RTT ya no se
  para; a cambio un rollback de hasta 60 tics una vez (~5 ms con CPU ×4). `o.maxPred`, `o.delayK` para pruebas.
- **Conexión lenta → espectador** (SessionN, anfitrión, más de 2 plazas): `blockAcc` (media que se olvida en ~10 s, `SLOW_TAU_MS`) suma
  el tiempo que todos esperan a esa plaza, el que se va más de `PRED_SOFT` (30) tics por detrás de ella y, si es la más atrasada, lo que
  CRECE el retraso de la partida contra el reloj por encima de 1 tic; a los `SLOW_MS` (2,5 s) pasa a la IA y a espectador (vuelve a los
  20 s, 40, 80… hasta 2 min). Revisión 2: antes esa última parte contaba cada frame con un tic de menos que el reloj sin restar los de
  uno más, y también el frenado de la ventaja de frames: con un anfitrión a 240 Hz y un invitado a 300 ms, 2,5 s en 90 s y la plaza a la
  IA «por conexión lenta» sin que nadie esperara. Ahora 0 a 60/165/240 Hz (stresstest asym165 / asym240 / r250h240: IA 0) y net4test (m)
  (600 ms, 50 % de pérdida) sigue pasando a espectador y volviendo.
- **Telemetría «prefail»** (js/netlog.js `VB.NetLog.prefail`, `linkDiag`, `_pf`): un enlace del lobby de varios / coop que no llega a
  abrirse antes del partido deja UN documento `netlogs/{uid}_pf…` (kind 'prefail', rol, formato, cap, modo, fase, why, ms, estados ICE,
  tipos de candidato `srflx/udp` sin direcciones, relay, env). Uno por sala, 3 por página como mucho; nunca jugando ni con el emulador.
  El 1v1 no lo lleva.
- Pruebas: `node tools/stresstest.js [--models precisaN,host6,coop] [--nets r60,r150,r250,burst,asym,cpu4,burstcpu,asym165,asym240,
  r250h240] [--secs 420]` (banco de medida, sin aprobado), net4test `--lane [--maxpred]`, (n), (o), (m); hosttest (e), (f); lobbytest
  (g), (h); netdrive `NDRELOAD` / `NDRELOADAT` / `NDHOST=away|reload` / `NDJIT` / `NDLOSS` / `NDBURST`; `&back=1` de startNetTestN.

Pendiente: prueba en teléfonos de verdad (anfitrión de 6v6 en móvil; rollback de Precisa-N en móvil; la vuelta tras recargar con el
móvil matando la pestaña) y en redes de verdad (4G/5G, wifi de casa con NAT, redes de empresa); TURN (sin él, una plaza que no conecta
la lleva la IA); migración del anfitrión (si se va, el partido acaba y no cuenta); Carrera de pista en cooperativo.
