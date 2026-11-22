# Peticiones entre paquetes (sprint online-multi)

Cada paquete apunta aquí lo que necesita en un archivo que no es suyo. Formato: **De → Para**, archivo, qué y por qué.

## P0 (bases y banco de pruebas)

- **P0 → P8 (docs)**, CONTRACT.md y notes/net.md: registrar los archivos nuevos de P0.
  - `js/nettest-links.js` (owner: net): `VB.Net.memMesh` / `VB.Net.memStar`. Solo para pruebas; index.html NO lo carga. Usa `VB.Net.Shaper`, que ahora exporta net.js.
  - `tools/net4test.js`, `tools/net12test.js` (bancos de N pares; adaptadores `precisa2` / `fluida2`; P2 y P5 añaden los suyos a `ADAPTERS`).
  - `tools/simbench.js` (coste de step / copyGame / serialize / stateHash; mide online 6v6 cuando P1 lo permita).
  - `tools/fp-6v6.json` (huella 6v6, `node tools/fingerprint6.js --variant 6v6`) de **sim**, como fp-mastery/fp-salto.
  - `VB.Net.bot(slot, seed, prof, {team})` es por hueco. La firma de siempre `bot(team, seed, prof)` da lo mismo con 2 huecos.
- **P0 → P1 y todos**: el control de regresión del brief §7 pasa a tener 4 huellas: `node tools/fingerprint6.js` (2v2), `--variant mastery`, `--variant salto` y `--variant 6v6`. La de 6v6 se grabó el 21-nov-2026 con el código de 1.21.0, antes de tocar la sim.
- **P0 → P1**: cuando `onlineOpts` acepte el 6v6, `tools/simbench.js` intenta crear `{online:true, format:'6v6', humans: 12 × {team, idx}}`. Si el formato final de `humans` es otro, cambiad `CONFIGS.online6v6.opts` en simbench.js (o decídmelo).
- **P0 → P4 (netview)**, aviso: `node tools/viewtest.js` ya falla en la base de 1.21.0 (con el net.js de antes de P0 también): «ningún campo de objeto anidado sin clasificar ["ritual.jug"]». sim.js:346 añadió `ritual.jug` (gesto «Giro») y netview.js no lo clasifica. 10 ok, 1 fallo. No lo causa P0.

## P3 (salas, reglas, señalización)

- **P3 → P6 (js/netlobby.js)**: subir `var LOBBY = 2;` (netlobby.js:39) a `3`, así un cliente 1.21.0 ve las salas nuevas como «Otra versión» (P3 no toca netlobby.js). La nueva API de `js/netroom.js` está documentada en la cabecera del archivo (bloque «ESQUEMA v3»). Resumen:
  - `rooms.open({..., mode:'vs'|'coop', cap:2|4|12, fmt:'2v2'|'6v6', lineup?})` crea una sala de varios. Sin `mode` ni `cap` (y sin `fmt:'6v6'`) se crea la sala 1v1 de siempre. Lo que no cuadra se corrige con `VB.NetRoom.multiCfg`, que sirve también para pintar la fila «Formato».
  - `rooms.join(id, gname)` se sienta en una sala de varios si la sala lo es. También existen `rooms.joinMulti` / `rooms.leaveMulti`, y `rooms.leave(id)` vale si entraste con este cliente. El anfitrión tiene `rooms.kick(uid)` y `rooms.beat({cnt, state, lineup})`.
  - Señalización por pareja: `putSig(id, kind, s, uidInvitado)`, `getSig(id, kind, uidInvitado)`, `delSig(id, uidInvitado|[uids])`. La clave es SIEMPRE el uid del invitado: el invitado pasa `rooms.uid()`.
  - Sala de varios: `{multi:true, mode, cap, seats:{uid:{n,at}}, nseat, free, cnt, lineup?}`. `list()` ya quita las coop y las que no tienen plaza libre. La coop se encuentra con `byCode` o `get(id)` (enlace).
  - Tras recargar, `bye('guest', id, true)` libera la plaza retomada; antes debe haber una llamada (p. ej. `get`), como en 1v1. `bye('host')` / `close()` borran las o_/a_ de todos los invitados vistos.
  - Si las reglas nuevas aún no están desplegadas, crear una sala de varios da `'denied'` (no `'off'`) y el 1v1 sigue igual. El lobby puede decir «Las salas de varios aún no están activadas».
- **P3 → P5**: si el modelo de 6v6 necesita su propio valor de `net` en la sala (hoy solo `'fluida'`, y solo en vs con cap 2), pedidlo: es una línea en `roomOkMulti` (firestore.rules) más otra en `multiCfg` (netroom.js).
- **P3 → P8 (docs)**: notes/net.md «Fase 2» (modelo de datos de rooms y sig) y CONTRACT.md (API de netroom) deben recoger el esquema v3. Orden de despliegue: primero las reglas (Ferran, `npx firebase-tools deploy --only firestore:rules`), luego el cliente. Las reglas NO están desplegadas.

## P1 (modelo de plazas de la sim)

Hecho en js/sim.js (bloque `/* ==== MULTI ==== */` antes de FLUIDA, con ganchos `if (g.mh…) // mh` y trozos `/*mh*/…/*hm*/`), js/ai.js, js/ai6.js. El 1 contra 1 (sin `g.mh`) no cambia: las 4 huellas idénticas y SIM_BASE `afb5ebee` igual (el separador de tools/fluidsimtest.js quita también el bloque MULTI y sus ganchos). API (cabecera del bloque MULTI en sim.js):

- `createGame({online: true, humans: [{team, idx | role, aimSet, jsetAim, attrs, badges}…], format: '2v2'|'6v6', coop, teamLv, attrs, badges, …})`. Es «de varios» (`g.mh`) con 6v6, coop, más de 2 plazas o alguna plaza con `team` distinto de su índice (`VB.Sim.isMulti(opts)`). `humans: [{},{}]` y `[{team:0},{team:1}]` siguen siendo el 1v1 de siempre.
  - `idx`: jugador en `teams[team]` (2v2: 0-1; 6v6: 0-5 = S, OH1, MB1, OPP, OH2, MB2, el orden de `ROLES6`). En 6v6, sin idx, `role: 'OH'|'S'|'OPP'|'MB'` toma el primero libre de ese puesto. Una plaza repetida pasa al hueco libre de su equipo (o al otro). Más plazas que jugadores lanza un error.
  - `coop: true`: las plazas sin `team` van todas al equipo 0.
  - `teamLv: [lv0, lv1]`, `lv = {prof: 'mate'|'easy'|'normal'|'hard'|'expert', tm: 'online'|nivel, rookie}`. Es el perfil de la IA de ese equipo y el timing de sus humanos. Por defecto `DIFF.mate` y `TIMING.online` (lo del 1v1).
  - `attrs` / `badges`: la matriz completa `[[…],[…]]` (2 o 6 por equipo) y, encima, los de cada plaza. `even` lo quita todo.
- `step(g, dt, ins)` con `ins[s]` = entrada de la plaza s. `chal` y `tmo` piden por el EQUIPO de la plaza. `skip` es por plaza (`g.skipS[s]`): la pausa se salta cuando han pulsado todas las plazas humanas (las de la IA cuentan como sí); `g.skipReq[t]` = alguna plaza del equipo t. `ai` traspasa esa plaza a la IA y vuelve en el balón muerto. Los eventos `skipReq`, `timeoutReq`, `slotAI`, `ask` y `libero` llevan `seat` además de `team` (solo con `g.mh`).
- Lecturas: `g.hum[s] = {team, idx, p, ai, tm, …}`; `useSlot(g, s)` y `slotGet(g, s, k)` por PLAZA (antes plaza = equipo); `humSlot(g, p)` / `seatOf(g, p)` → plaza o -1; `humOn(g, t)` = el equipo t tiene algún humano sin IA; `humansOf(g, t)` (array cacheado; fuera del online `[g.ctrl]` en el equipo 0); `seatRep(g, t)` = plaza que se activa para la IA de t; `seatGet(g, p, k)` = campo de la plaza del humano p (6v6: `hAct`, `ask6`, `ctrlBase`, `ctrlRole`, `ctrlOut`, la lista `SLOT_6`).
- Al acabar cada paso la plaza activa es la 0 (`fin`), como antes.

Peticiones:

- **P1 → P2 (net.js)**: las entradas van por plaza, en el orden de `g.hum` (`ins.length === g.hum.length`). Precisa-N: un anillo por plaza. `slot` del Session = índice de plaza, NO equipo: el equipo es `g.hum[slot].team`. Los bits de partido ya se reparten por equipo en la sim (no hace falta traducirlos). Online 6v6 medido con tools/simbench.js (2 semillas × 30 s, escritorio): step 79 µs (p99 175), copyGame 386 µs, foto 23.8 KB, rollback de 24 tics 2.3 ms (móvil 9-18 ms). Confirma el brief §3: nada de rollback en 6v6 en móvil.
- **P1 → P4 (netview/main/players)**: campos nuevos de g con `g.mh`: `g.mh`, `g.skipS`, y en cada plaza `team`, `idx`, `tm` (+ `SLOT_6` en 6v6). netview.js tendrá que clasificarlos (en el 1v1 no existen, así que viewtest no cambia: sigue con su único fallo previo `ritual.jug`). El giro va por `g.hum[mySeat].team`, y `v.ctrl` = `g.hum[mySeat].p`. Para «es humano», usar `S.humSlot(g, p) >= 0` / `S.humansOf(g, t)` en lugar de `p === g.ctrl`.
- **P1 → P5 (FLUIDA)**: el bloque FLUIDA no se ha tocado y sigue siendo de 2 plazas con plaza = equipo. `step()` solo entra en `stepFluid` con `g.fl`; con `g.mh` va siempre a `mhStep`. `flInit` sobre una partida con `g.mh` no está soportado: poned una guarda al generalizarlo.
- **P1 → P7 (Carrera coop)**: usad `coop: true, humans: [{idx:0, attrs, badges}, {idx:1, attrs, badges}]` (o `team: 0` explícito), `teamLv: [{prof:'mate', tm: dif, rookie}, {prof: dif, rookie}]`, `attrs/badges` matriz completa y `nums`. En 6v6 online el banquillo sigue apagado (`bench` forzado a null): «a un humano no lo cambia nadie» se cumple porque no hay cambios. Si la Carrera de pabellón coop necesita banquillo, pedidlo: hay que proteger también `canSubX` ('me') y `VB.AI6.coachPlan` / `lineupPlan` (hoy miran solo `g.ctrlBase` del equipo 0).
- **P1 → P8 (docs)**: CONTRACT.md (API de arriba) y notes/net.md. tools/mptest.js tiene la sección (f) del online de varios.


## P4 (vista y pegamento del partido)

Hecho en js/netview.js, js/main.js (sección ONLINE), js/replay.js, js/players.js (comprobaciones de «humano»), tools/viewtest.js y tools/netreplaytest.js. El 1 contra 1 no cambia: `net.me = net.slot` (número) y todo pasa por los mismos caminos (netdrive 1v1 y las pruebas de siempre, iguales). input.js y camera.js no han hecho falta: leen `g.ctrl` y el equipo 0 de la VISTA, que ya son los tuyos.

- **VB.NetView**: `mirror(view, g, me)`, `mapEvents(evs, view, me, out)`, `inputToWorld(inp, me)` con `me` = el hueco del 1 contra 1 (0|1) o `{team, seat}`. Gira si `team === 1`; con `g.mh`, además, tu plaza pasa a ser la activa de la vista (`seatView`: `g.ctrl`, su gesto, `hT = seat`). Nuevos: `seatView`, `teamOf`, `seatOf`. Clasificados `mh`, `skipS`, los campos de plaza `idx`, `tm` y SLOT_6, el evento `seat` y todo el 6v6 (rot, lineup, libero, liberoFor, roster y setPlan pasan a 'swap'; overlap, _pq6 y _sp6 'swap'; p.fx/fy/toX 'neg'; líbero y plantilla fuera de pista girados). Arreglado el fallo previo `ritual.jug`.
- **startOnline (main.js), online de varios**: `startOnline({humans: [{team, idx | role, name, look}…], seat (o slot), links: [Link…] (o link), opts, name, model, delay, expect, coop})`. Es «de varios» si `VB.Sim.isMulti({humans, format, coop})` o hay más de un enlace; si no, el 1v1 de siempre (`slot`, `link`, `rivalName`, `look: {mine, theirs}`).
- **P4 → P2 (net.js Session)**: main.js crea la sesión con `{slot: TU PLAZA, link: links[0], links, seats: [{team, idx, role, name, look}…], names: [...], opts, name, delay, epoch, expect, warm, log, onTick}`. Lo que lee (opcional; sin ello el HUD dice «Esperando a: los demás» y el ping es el del enlace): `r.waitFor` = plazas a las que se espera; `r.pings[s]` = ping por plaza (el HUD enseña el tuyo y el peor); `r.canAI`; `sess.seatGone(s)` (revancha: una plaza que se fue no hace falta). La revancha manda `sendApp({t: 'again', s: plaza})` en el de varios: el anfitrión (plaza 0) manda `go` cuando todas las demás la quieren, así que **los `app` de un invitado tienen que llegar a todos** (el anfitrión los reenvía). `result.win` debe ir por EQUIPO (`gameOver.team === g.hum[slot].team`). En 6v6 main.js pasa `switchPlayer` («¡Pídela!», sim ask6) en la entrada: falta su bit en el paquete (hoy `decode` lo pone a false).
- **P4 → P5 (6v6)**: con `model: 'host'` y `VB.NetHost.Session` cargado, main.js usa esa sesión (misma fachada que VB.Net.Session: `advance(now, inp) → r {status, g, confirmed, events, app, ping…}`, `predictedGame`, `confirmedGame`, `request`, `setAway`, `quit`, `sendApp`, `initEvents`, `stats.resyncs/rsIn`, `repaired`). Sin grabador de repeticiones (`Replay.reset(v, {fluida: true})` → 'net') y sin `onTick`. Fluida sigue siendo de 2: en el de varios main.js nunca la elige. Probado con una sesión falsa en el juego real (2v2 × 4, 6v6 × 12, coop): vista desde tu plaza, 11 etiquetas, HUD, sin errores; 6v6 en calidad baja: 34 llamadas de dibujo (≤45).
- **P4 → P6 (lobby, récord, hoja)**: el lobby llama a startOnline como arriba (tu look en `humans[seat].look` o `look.mine`; los de los demás se sanean con `NetLobby.saneLook`). `VB.NetRec.end(nombre, res, valid, sets)` recibe en el de varios los rivales en un texto («Ana y Luis», «Equipo de Ana (6)», «la IA» en el coop) y los sets por equipo; para guardar compañeros y rivales aparte, `ctx.net.cr.mates` / `ctx.net.cr.rivals` (arrays de nombres). La revancha de la hoja (ui.js) sigue leyendo `net.want` / `net.rivalWants` (en el de varios, `rivalWants` = la quieren todas las demás plazas). Textos del HUD que dependen de `result.why` en el de varios: 'rivalQuit'/'rivalGone' → «Los rivales se han ido: ganáis», 'hostGone', 'noShow' → «Faltan jugadores».
- **P4 → P7 (coop)**: `startCoopCareerMatch` puede llamar a `startOnline({coop: true, humans: [{idx: 0, name, look}, {idx: 1, name, look}], seat, links: [link], opts})`; el invitado del coop no gira (equipo 0) y su plaza es la activa de su vista. Las estadísticas de la hoja y la maestría van por equipo, y la maestría solo cuenta TUS toques (`netMine`).
- **P4 → P8 (docs y netdrive)**: CONTRACT.md / notes/net.md: la API de arriba y `#netTags` (grupo de hasta 11 etiquetas, solo `transform: translate3d`, «IA» cuando la plaza la lleva la IA, subrayado del color del equipo). `?net=bc` sigue siendo de 2 páginas (BcLink sin `to`): netdrive de N páginas es de P8. No hay aros en el suelo para los otros humanos (las etiquetas DOM no gastan llamadas de dibujo); si se quieren, un InstancedMesh en players.js.

## P2 (Precisa-N: rollback de N plazas, js/net.js)

Hecho en js/net.js (bloque «PRECISA-N», con la API en su cabecera), tools/net4test.js (adaptadores `precisaN`, `mixA`, `mixB`; secciones (d)-(m)) y tools/net12test.js (sección (d), 12 plazas en 6v6, solo corrección). La Session del 1 contra 1 no ha cambiado (nettest, net3test, netreplaytest, mptest, netdrive 1v1 Precisa y las 4 huellas, iguales): `new VB.Net.Session(o)` devuelve una `SessionN` solo si `o` trae `seats`, más de un enlace o `n > 2`.

- **P2 → P4 (main.js)**: lo que pediste ya está, con la misma llamada de `netSession`:
  - `r.waitFor` (plazas a las que se espera), `r.pings[s]` (ping de cada plaza con el anfitrión; el tuyo en tu plaza), `r.canAI`, `r.aiSeats` (plazas que lleva la IA por la red) y **`r.meAI`** (nuevo): el anfitrión lleva TU plaza con la IA. Pasa si tu conexión hace esperar a todos a ratos: te deja de ESPECTADOR (ves el partido de verdad con tu jugador llevado por la IA) y vuelves solo a los 20 s (40, 80… si se repite). Texto del HUD sugerido: «Tu conexión va lenta: te lleva la IA un rato».
  - `sess.seatGone(s)`, `sess.seatAI(s)`, `sess.team`, `sess.n`, `sess.delay` (retraso de entrada actual, adaptativo).
  - Los `app` de un invitado llegan a todos (el anfitrión los reenvía con `{d, s}`; en `r.app` llega `d`). `result.win` va por EQUIPO.
  - `result.why` en el de varios: 'over' (por equipo; `unverified` si las huellas no cuadraron), 'rivalQuit' (se ha ido todo el equipo rival: se acaba), 'rivalGone' (todo el equipo rival lleva 60 s fuera: ganas y se sigue con la IA, `r.gone`), 'hostGone' (se fue el anfitrión, centro de la estrella, sin ser el último rival: no cuenta), 'quit', 'late', 'noShow', 'cancel', 'mismatch', 'version'. Un compañero que se va NO acaba el partido: lo lleva la IA.
  - El bit de `switchPlayer` ya viaja (bit 7). `stepInputs()` da n entradas (orden de plaza) y `rec[t]` 3n valores, para replay.js.
  - `delay`: si main.js pasa `net.delay` sin definir, empieza en 2 y el anfitrión lo adapta (fórmula del brief) en cada punto confirmado; `adaptive: false` lo deja fijo.
  - `r.canAI` en el de varios: invitado que lleva 10 s sin el anfitrión (como el 1 contra 1). El anfitrión casi nunca lo verá: pasa a la IA por sí solo, a los 3 s, la plaza que no oye o que le hace esperar.
- **P2 → P6 (lobby)**: `links` del anfitrión = un enlace por invitado, en cualquier orden; la plaza de cada enlace la dice el saludo del invitado (su sesión con `slot` = su índice en `humans`). Si el lobby ya la sabe, `linkSeats[j]`. `aiSeats: [plazas]` para las que se sabe que no vienen (la IA desde el tic 0, sin esperar). Una plaza que no está lista a los 20 s empieza con la IA y puede entrar luego (resync a mitad de partido). Un invitado que reconecta con otro Link: `sess.addLink(link)` (su saludo lo ata a su plaza).
- **P2 → P8 (docs y netdrive)**: CONTRACT.md / notes/net.md: el protocolo de Precisa-N. Paquete 'in' de tipo 2 `[2|época<<4, plaza|resync<<4, nb, u32 tic, na, na×u32 ack, nb×(plaza, u32 primer tic, u32 tic de esa plaza, n, n×5 B)]`; con 2 plazas, el de tipo 1 de siempre (una SessionN de 2 juega con la Session de 1.21.0: net4test (f)). Mensajes 'ctl' nuevos: `hello{seat, n}`, `seat{s, ai, gone, why}`, `pings{p}`, `delay{d}`, `resync{s, rings, spect}`, `app{d, s}`. Constantes: SEAT_AI_MS 3 s, REJOIN_STABLE_MS 1 s, RS_GAP_MS 3 s, SLOW_MS 2,5 s en ~10 s, SLOW_BACK_MS 20 s (hasta 2 min). Pendiente: la vuelta del anfitrión que recarga (fase 6) en el de varios (un anfitrión sin opts → 'noShow'). Para netdrive de N páginas, la SessionN ya acepta `links` (un BcLink con `to` por invitado en el anfitrión).
- **P2 → P5 (6v6)**: medido con net12test (d), escritorio: Precisa-N con 12 plazas es correcto (huellas y oro), pero el anfitrión sube ~500 KB/s de carga útil y cada frame cuesta 1,5-1,9 ms de p50 (p99 3,4-4,8 ms). Confirma el brief: el 6v6 va con vuestro modelo.

## P7 (Carrera cooperativa de playa, js/career-coop.js)

Hecho en js/career-coop.js (nuevo; `VB.CareerCoop`, extensión `VB.CareerExt` id 'coop' y `VB.CareerUIExt` prefijo 'co-'; script en index.html tras career-prologue.js, así storyhelp.extFiles() la carga en careertest), js/career.js (almacén `_useStore`, gancho `coopMatch` en matchDone de playa, `extra.coop` en closeMine), js/career-ui.js (puerta del invitado en onClick, `play()` del anfitrión por `hostPlay`, clase `cr-coopg`, Intro en `#coCode`), js/career-story-ui.js (plegables del invitado en memoria), js/career-life.js (el invitado no se retira ni escribe el Salón de la Fama), js/main.js (`ctx.actions.startCoopCareerMatch`) y tools/cooptest.js. Sin usar el cooperativo no hay `c.coop` y la Carrera es idéntica (careertest con y sin NOEXT/NOWORLD, cooptest §7).

Decisiones por defecto (para que Ferran las confirme):
- La Carrera es del ANFITRIÓN y vive solo en su guardado. El invitado la ve desde un almacén en memoria (`VB.Career._useStore`): nunca en su localStorage ni en su nube. Solo guarda la copia de su jugador en `make-the-cut.coop.p2` (no se sube a la cuenta).
- El invitado es la pareja de playa (sustituye al compañero de la IA mientras dura el cooperativo) con jugador propio `c.coop.p2` (nombre, dorsal, rol, nivel, XP, puntos, insignias). Empieza con los atributos del compañero de la IA de ese momento y nivel 1. Química propia `c.coop.chem` (+5 por partido juntos; la del compañero de la IA no cambia, y tampoco su forma).
- La Carrera solo avanza cuando el anfitrión avanza. El invitado gasta SUS puntos e insignias y pulsa «Listo»; lo demás, de solo lectura. El anfitrión no puede empezar el partido cooperativo sin el «Listo» (puede simular: los simulados no dan XP a p2).
- Sin invitado conectado, el anfitrión juega con el compañero de la IA, como siempre. Si el invitado se va a mitad de partido, la IA lleva su plaza y la jornada cuenta (p2 se acredita igual).
- Solo liga y Open. Selección, Estrellas, juvenil, pruebas y demás partidos de extensión: solo el anfitrión (la tarjeta lo dice). Pista: «Pronto».
- Otra persona (otro id) que entra: p2 nuevo; el anterior se archiva en `c.coop.old` (hasta 3) y vuelve si regresa.
- v1 sin ambiente (noAmb), zona (noZone) ni «Te tienen estudiado» en el partido cooperativo.
- Hace falta la misma VB.VERSION (el «hi» la compara; si no, «Tenéis versiones distintas»).

Peticiones:
- **P7 → P4 (main.js, hoja final)**: (a) `ctx.net.coopCareer === true` en el partido de Carrera cooperativa: escondedle «Revancha» (hoy empezaría un amistoso sobre el mismo enlace; career-coop lo ignora). (b) Visto en una prueba de dos páginas (lobby falso sobre BcLink, bots, Precisa coop): al acabar, el ANFITRIÓN pasó a 'over' y el INVITADO se quedó en `ctx.state 'playing'` con `net.r.status 'over'` más de 160 s, con el cartel «SET ÚNICO» encima. Mirad `netFrame` / `isGameOver` del invitado de varios (equipo 0, plaza 1). (c) Opcional: tras el partido cooperativo el anfitrión no ve la hoja «Resumen de la jornada» (VB.UI.endCareer); el resumen está en `VB.CareerCoop._S.match.sum` hasta que se suelta la sesión (y en `c.last`, con `c.last.coop` = lo de p2).
- **P7 → P6 (lobby)**: consumo el contrato de la cabecera «CARRERA COOPERATIVA» tal cual: la fachada `link` va directa a startOnline, `onMessage` devuelve el quitador (lo uso al cortar), `VB.CareerCoop.onJoinLink(code)` existe (abre la Carrera y llama a `coop.join`). Durante el partido career-coop no manda nada (la foto viaja al soltar la sesión). Nombre del invitado: `VB.NetLobby.myName()`.
- **P7 → P8 (docs)**: CONTRACT.md «Extensiones de la Carrera»: js/career-coop.js (owner carrera; id 'coop'; método `coopMatch(c, m, res, rallies, g)` que matchDone de playa llama con `g.career.coop`; `closeMine` con `extra.coop` no toca química ni forma del compañero de la IA; `B().endMatch(g, win, [c.player, c.coop.p2])`), `VB.Career._useStore(s|null)` / `_memStore()`, `ctx.actions.startCoopCareerMatch({seat, humans})`, `VB.CareerCoop` (API en la cabecera del fichero) y `node tools/cooptest.js` en el control de regresión. Para mobaudit (ui_main): la tarjeta «Cooperativo» sale en Carrera › Partido (playa: botón, código y «Unirse»; invitado: «Listo» / «Salir»; pista: «Pronto») y en la fila de crear.
- **Pendiente (P7, después de P5)**: Carrera de pista en cooperativo (online 6v6, «me2» en slotOf/newM, meRules6 con los dos humanos en pista).

## P6 (lobby de varios, récord e informe, js/netlobby.js)

Hecho en js/netlobby.js (bloques «ONLINE DE VARIOS» y «CARRERA COOPERATIVA», con el protocolo y el contrato en sus cabeceras), js/netrec.js, js/netlog.js, js/ui.js (solo la hoja final online: onlineEndSync / onlineEndRec), tools/netlogtest.js, tools/mobaudit.js (filas online-create-2v2/6v6, online-sala-2v2/6v6/6v6-invitado/6v6-elegido, online-coop) y tools/lobbytest.js (NUEVO: varias páginas vm con netroom + netlobby contra el emulador y un WebRTC de mentira; 63 comprobaciones). El 1 contra 1 del lobby no cambia de camino (lobbytest (e) y netdrive --rtc); solo `LOBBY = 3` (un 1.21.0 ve las salas nuevas como «Otra versión»).

- Lobby: «Crear sala» con la fila Formato (1/2/6 contra 6; 6v6 fija Pabellón; Conexión: 1v1 a elegir, 2v2 Precisa, 6v6 'host'). Tickets «n/cap» + formato. Sala de espera con dos columnas de sitios (dorsal, puesto, «Tú», ping, listo); tocar = sentarse/levantarse; el anfitrión elige a alguien y lo mueve (o se cambian) o lo saca, y cambia los equipos de lado; «Empezar» cuando todos los conectados están sentados y listos. Estrella con ofertas en paralelo; con el enlace abierto todo va por 'ctl' y el invitado deja de leer Firestore; quien no conecta en CONNECT_MS se suelta (kick) y su sitio lo lleva la IA. Reglas sin desplegar → «Las salas de varios aún no están activadas».
- **P6 → P4 (main.js)**: (a) el anfitrión llama a `startOnline({humans, seat: 0, links, linkSeats, opts, name, model, format, expect: null})` con `links[j]` = enlace de la plaza `linkSeats[j]` (= j + 1); el invitado `startOnline({humans, seat, links: [hostLink], opts: null, name, model, format, expect})` (como en 1v1: las opts llegan en el saludo de la sesión). `format` va arriba porque el invitado no tiene opts y `netMultiOf` lo necesita para un 6v6 de 2 humanos. Reenviad `o.linkSeats` (y, si lo usáis, `o.aiSeats`) a la sesión en `netSession` (P2 lo acepta). (b) Sin vuelta tras recargar en el de varios (backSave lo salta): la plaza la lleva la IA. (c) La hoja final (ui.js) ya enseña «Tu equipo: tú, Ana · Rivales: …» y la revancha «Esperando a los demás (k/n)…» con `net.wants`, `net.humans`, `net.seat` y `sess.seatGone`.
- **P6 → P2**: `result.seat` (plaza de quien se fue) o `result.mate` ayudan a NetRec; ya está cubierto con vuestro 'rivalQuit' = todo el equipo rival (un compañero que se va no acaba el partido). NetRec cuenta 'mateQuit'/'mateGone' (si algún día existen) como «no cuenta».
- **P6 → P7**: el contrato `VB.NetLobby.coop` está en la cabecera «CARRERA COOPERATIVA» de js/netlobby.js (host/join/close/send/onMessage/state; onReady({link, seat, names, looks, room}); onClose(why)). `coop.host` acepta además `venue` ('beach' por defecto). La fachada `link` no deja ver a la sesión los mensajes del lobby ('lb…') ni los de la app ('cx'), y los de la app se siguen entregando durante el partido; su `close()` (netStop) devuelve el enlace al lobby. `?coop=CÓDIGO` y un código de coop escrito en «Código» llaman a `VB.CareerCoop.onJoinLink(code)`.
- **P6 → P8 (docs y netdrive)**: CONTRACT.md / notes/net.md: el protocolo del lobby de varios ('lb-hi', 'lb', 'lb-sit', 'lb-rdy', 'lb-ping'/'lb-pong', 'lb-out', 'lb-bye', 'lb-go', piezas 'lbk' de 4000 caracteres, 'cx' de la coop), `VB.NetLobby._act` / `_state().mx` / `_mx` (pruebas), `?netconnms=` (pruebas en local), `node tools/lobbytest.js` en el control de regresión, y en CONTRACT/notes que NetRec guarda `m` (compañeros) y `f` (formato) en cada entrada y NetLog `pe`/`ps`/`multi`. netdrive de N páginas por el lobby de verdad sigue pendiente (lobbytest cubre el lobby en Node, sin WebRTC ni render).

## P5 (modelo «host» del 6v6 online, js/nethost.js)

Hecho: `js/nethost.js` (`VB.NetHost.Session`, la fachada de VB.Net.Session con `model: 'host'`), ganchos en los bloques MULTI y FLUIDA de js/sim.js (`nhInit`, `nhApplyTc`, `nhToss`, `nhPose`, `nhMine`, `nhFrozen`, `nhStep`, `nhRemServe`; las 4 huellas idénticas y SIM_BASE igual), `tools/hosttest.js`, adaptadores `host6` / `host4` en tools/net4test.js (sección h) y tools/net12test.js (secciones h, i). Script en index.html detrás de js/netfluid.js. Cabecera de js/nethost.js = el diseño entero.

- **P5 → P3 (salas)**: hace falta `net: 'host'` en las salas de varios con `fmt: '6v6'` (y, si el lobby quiere la opción, en 2v2 con cap 4): una línea en `roomOkMulti` (firestore.rules) y otra en `multiCfg` (netroom.js).
- **P5 → P6 (lobby)**: para el 6v6, `startOnline({model: 'host', humans, seat, links, opts})`. El anfitrión (plaza 0) pasa TODOS los enlaces de sus invitados, en cualquier orden (cada invitado dice su plaza en su `hello`); el invitado pasa `[enlace con el anfitrión]` y su plaza. Solo estrella: no hace falta ningún enlace invitado↔invitado. La barrera de salida está en la sesión: `r.status 'connecting'` con `r.waitFor` = plazas aún no listas; a los 12 s (READY_MS) empieza igual y las plazas que faltan las lleva la IA. Requiere partida «de varios» (`VB.Sim.isMulti`): con 2 plazas 1v1, Precisa o Fluida.
- **P5 → P4 (main.js)**: lo que da la sesión: `r.pings[s]`, `r.waitFor`, `r.startIn`, `r.waitMs`, `r.result.why` ('end' | 'quit' | 'hostGone' | 'noShow' | 'cancel'), `s.seatGone(s)`, `s.hstats` (métricas). Sin `withDisplay`: el balón PINTADO del invitado se escribe en `r.g.ball` y se deshace al empezar el siguiente `advance` (main.js ya hace el espejo en el mismo frame). Los `app` de un invitado los reenvía el anfitrión a todos (con `s`). Bits de partido: `request('skip'|'chal'|'tmo')` o `inp.skip/chal/tmo`; `switchPlayer` en la entrada se manda como «¡Pídela!». `opts.timeouts` se fuerza a false (como en Fluida). Aviso: en la vista del ANFITRIÓN, un punto salvado por un invitado (su plancha llegó tarde) hace que el balón vuelva del suelo a la plancha (raro; `hstats.rescues`).
- **P5 → P8 (docs y pruebas en Chrome)**: CONTRACT.md / notes/net.md: API de arriba, protocolo 'H1' (paquete de 30 Hz de 276 B con 12 jugadores; pose del invitado de 30 B a 60 Hz; 'ctl': tc, toss, ev, fs en trozos de 15 KB, pg, rej, gone, app, bye). netdrive de N páginas con `model: 'host'` y una página con CPU frenada como anfitrión; medir el anfitrión en un móvil real (subida ~130 KB/s con 11 invitados: recomendar PC o wifi para crear la sala).

## P8 (integración y lag QA): estado de cada petición (22-nov-2026)

- P0 → P8, P1 → P8, P2 → P8, P3 → P8, P4 → P8, P5 → P8, P6 → P8, P7 → P8 (docs): HECHO en notes/net.md «Online de varios»
  (Precisa-N, modelo anfitrión, salas v3, lobby, coop, despliegue de reglas, medidas) y CONTRACT.md «Online de varios».
- P3 → P6 (`LOBBY = 3`): hecho por P6. P0 → P4 (`ritual.jug` en viewtest): arreglado por P4.
- P3 → P5 / P5 → P3 (`net: 'host'` en reglas y `multiCfg`): NO hace falta. El lobby saca la conexión del formato (`roomModel`: 6v6 →
  'host', 2v2 y coop → Precisa) y el invitado lo comprueba con el `model` del `lb-go`. Sin cambio de reglas.
- P6 → P4 (main.js reenvía `linkSeats` / `aiSeats`): HECHO (`netMultiSetup` los guarda; `netSession` los pasa; `aiSeats` solo en la
  época 0). `format` arriba ya lo leía `netMultiOf`.
- P2 → P4 (HUD de `r.meAI`): HECHO, «Tu conexión va lenta: te lleva la IA un rato».
- P7 → P4 (a) sin «Revancha» en la Carrera cooperativa: HECHO (ui.js `onlineEndButtons` la esconde y pone «Volver a la Carrera»;
  `netRematch` también la rechaza con `net.coopCareer`). (b) invitado que se quedaba en 'playing': NO se reproduce (netdrive --coop y
  --multi coop: las dos páginas llegan a la hoja final). (c) hoja «Resumen de la jornada» tras el coop: sin hacer (opcional).
- P5: el error de sintaxis de net12test.js ya no está (P5 lo arregló).
- P6 → P8 (netdrive y la ayuda por páginas): HECHO (--rtc recorre «Siguiente»; 27 ok con el Shaper a 80 ms).
- P4/P2/P5 → P8 (netdrive de N páginas): HECHO (`--multi`, `NDRTC=1`, `--coop`).
- Arreglos de lag hechos por P8 en ficheros de otros: js/nethost.js (`_pong`: reloj del invitado; `_hostPaint`; pose del invitado ya en la cuenta atrás), js/main.js
  (`netBallSmooth`, `startNetTestN`, `noDraw`), js/net.js (`BcLink` con `to`), js/netrtc.js (Shaper), js/ui.js (coop sin revancha),
  tools/cooptest.js (esperas de 50 → 400 ms: la compresión de la foto tarda ~90 ms la primera vez en Node y la prueba fallaba).

## Ronda de arreglos tras la revisión (22-nov-2026)

Hechos (14 hallazgos de la revisión; detalle en los comentarios del código):
- js/nethost.js: el anfitrión 6v6 que se queda atrás más de MAXCATCH tics ya NO mueve t0 (los invitados seguían con el t0 del 'go' y
  quedaban adelantados el resto del partido: toques rechazados y Dp inflado); salta T hacia delante como el invitado (`hstats.skips`).
  La media de retraso de `_dispDelay` lleva tope (`C.LATE_MAX` = 60 tics).
- js/net.js (Precisa-N): una plaza de espectador por conexión lenta ya no se da por ida a los 60 s de estar con la IA (la espera crece
  a 80-120 s): solo si deja de oírse 60 s (`max(aiAt, heard)`).
- js/netlobby.js: coop emparejada → el anfitrión deja de sondear la sala (`E.coopOn`; queda el latido de 20 s, que la mantiene viva
  para renegociar en pleno partido: una sala de más de 5 min sin latido la puede borrar cualquiera). Barrera de inicio: con la
  lectura que devuelve el latido `state:'play'` se levanta a todo sentado que no juega; el invitado que ve 'play' sin haber empezado
  sale con 'late'. Quien sale ('left') queda vetado 4 s (`LEFT_BAN_MS`): un sondeo en vuelo ya no le reofrece. Salir de la app antes
  de empezar: `lb-away` + `visibilitychange` (espera `AWAY_MS` = 60 s al ausente; oculta, la página no cuenta silencios). `mxDrain`
  devuelve a la cola lo que va tras un `lb-go` y el invitado con el enlace caído justo tras el `lb-go` renegocia en vez de 'hostLost'.
- js/netroom.js: `get()` calcula la edad con la hora del servidor (desfase de la última readTime / commitTime) en vez de updateTime,
  que se congela si el anfitrión muere.
- js/career-coop.js: `hostPlay` solo con la Carrera de playa en pantalla (la de pista juega su partido); tarjeta del anfitrión con
  «Terminar el cooperativo» también en la pista. Insignias del coop: el contador de VB.Badges (partida presentada, ui.js) pasa a la
  vista confirmada antes de matchDone, y `ensure` sanea p2 sobre el MISMO objeto (career.js matchDone guarda la referencia de
  c.coop.p2 antes de coopMatch: las insignias de p2 iban a un objeto huérfano). Invitado sin Carrera propia: la 1ª foto abre el hub
  aunque la Carrera esté abierta. Vista del invitado: SUS estadísticas (nuevo `c.coop.ss2` por temporada, `stats2` total) y notas.
  «Listo» solo con la foto recibida; si el invitado no puede empezar manda `nack` y el anfitrión no acredita a p2 (`noP2`).
- tools/cooptest.js: +4 comprobaciones (insignias de p2 y tuyas, estadísticas del invitado, hostPlay en pista).

Pendiente / aceptado:
- netroom (salas coop en la lista de clientes 1.21.0 en caché): ACEPTADO. Salen como «Otra versión» con el nombre del anfitrión; no
  se puede entrar (LOBBY 3). Quitarlas exige un `state` distinto de 'open' para coop en `roomOkMulti` (reglas = P3 + despliegue).
- ui.js sigue contando las insignias con la partida presentada (con retrocesos puede contar de más algún evento mal predicho); lo
  limpio sería que ui.js no las cuente con `ctx.net.coopCareer` y que career-coop las ingiera de los confirmados (petición a P4).
- El invitado que manda `nack` deja al anfitrión en su partido con la IA en la plaza 1 (no se aborta la sesión).
