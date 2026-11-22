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

## L3 (lobby, salas, reglas y móvil; 22-nov-2026)

Hecho en js/netroom.js, js/netlobby.js, firebase/firestore.rules, tools/roomtest.js y tools/mobaudit.js (solo un comentario). Las 4
huellas, idénticas; el 1 contra 1 del lobby no cambia (mismas lecturas en el ciclo de vida: 110/39/7 antes y después).
- **Salas coop fuera de las listas de 1.21.0**: una coop esperando compañero va en `state: 'coop'` (nunca 'open'); las reglas solo
  dejan 'coop' en las coop y nunca 'open' en ellas (`multiMode` en firestore.rules, con ternarios: escrito con `!=`/`||` el emulador
  da HTTP 500 al validar). Sentarse y levantarse valen en 'coop'; `byCode` busca por código y filtra 'open' | 'coop' en el cliente
  (un solo campo en la consulta). roomtest pasa otra vez las pruebas con el cliente publicado: «versión publicada» = `git merge-base
  HEAD main` (antes `HEAD`, que en esta rama ya trae el cliente de varios y se saltaban 3 pasadas): un 1.21.0 no ve la coop ni en la
  lista ni por código, ni puede entrar. Queda ACEPTADO lo de «Otra versión» solo para las vs.
- **`net: 'host'`**: `multiCfg` lo pone en todo 6v6 (y en vs 2v2 de 4 si se pide); reglas: 'host' en 6v6 o con 4 plazas, 'fluida' solo
  vs 2v2 de 2. `roomModel` (netlobby) lo lee además del formato.
- **Lecturas** (tools/roomtest.js «Ciclo de vida»: lobby de verdad, reloj virtual, emulador; `--life-ref <commit>` mide el antes):
  `rooms.beat(patch, {lite: true})` = 1 escritura sin releer; el anfitrión de varios late así (sondeo aparte), y con el partido
  empezado o la coop emparejada, una vez por minuto (`PLAY_BEAT_MS`). Sondeo del anfitrión: nada con la sala llena y todos dentro;
  cada 6 s con la pestaña oculta (`HID_POLL_MS`), y al volver una lectura y un latido en el acto. Invitado esperando la oferta: el
  anfitrión cuenta como ido con el latido de más de 65 s (antes 30 s: un anfitrión oculto sin enlaces puede quedar a 1 temporizador
  por minuto) y como mucho 95 s.
  Anfitrión (lecturas/escrituras): 2v2 × 4 todo el ciclo 165/47 → 74/28; 6v6 × 12 238/64 → 138/45; coop 120/44 → 60/22. Por minuto:
  sala llena con enlaces abiertos 33 → 0 lecturas; partido 3,1 l + 3,1 e → 0 l + 1 e; pestaña oculta esperando 33 → 11 lecturas.
  Invitados: igual que antes (0 con el enlace abierto, en todos los tipos).
- **Móvil**: online-coop 6 solapes → 0 (la hoja es modal de verdad: lo de debajo `inert` + sin toques); salas 2v2 / 6v6 / invitado /
  elegido, recortes 2-9 → 0 en los 5 tamaños, letra ≥ 12 y ningún objetivo < 44. En el móvil, la cabecera de la sala de varios lleva
  el formato, «cambiar de lado» y el código; el estado va en la barra entre «Salir» y la principal; 2v2 un sitio por fila, 6v6 dos;
  sitio estrecho (< 140 px) → nombre corto «Javi O.» (consulta de contenedor; el entero en aria/title). 6v6 en 568×320: los 12 sitios
  a la vista sin desplazar (hoja 64-244 px, equipos 70-243).
- **L3 → P8 (docs)**: notes/net.md «Salas: esquema v3» y CONTRACT.md: `state 'coop'`, `net 'host'`, `beat(patch, {lite})`,
  `VB.NetRoom.joinable`, `multiCfg` devuelve además `net` y `state`, `PLAY_BEAT_MS`/`HID_POLL_MS`/`MX_STALE_MS`/`MX_OFFER_MAX`, y
  `node tools/roomtest.js [--no-life] [--life-only] [--life-ref <ref>]`. Las reglas han vuelto a cambiar y siguen SIN desplegar
  (mismo orden: reglas y luego cliente).
- **L3 → ui_main**: lo que queda en las filas del online es del menú de debajo: «Jugar» (#btnPlay .sp-t) recortado 4 px de alto en
  667×375 y más (sale igual en la fila `home`; en online-coop se ve a través del velo); en escritorio, «DIRECTO» (#menu .live) a
  11,5 px y #btnVer de 18 px de alto.
- **L3 → dueño de tools/lobbytest.js**: «la sala pasa a «play»» falla 1 de cada 3 pasadas: lee la sala justo tras startOnline, antes
  de que llegue el latido de 'play' (esperar con `until` a que `state` sea 'play').
- **Pendiente / para decidir** (1v1, sin tocar por la regla «1v1 igual»): el latido del 1v1 también podría ir lite (30 lecturas menos
  por cada 10 min de partido) y su invitado da al anfitrión por ido con 30 s de latido viejo (el mismo caso de la pestaña oculta).

## L4 (Carrera cooperativa: pulido; 22-nov-2026)

Hecho en js/career-coop.js, js/ui.js (SOLO la puerta de `VB.Badges.ingest`), tools/cooptest.js y tools/mobaudit.js (filas
carrera-coop-*). career.js, career-ui.js: sin cambios (lo nuevo entra por los ganchos que ya había: `matchTop`/`match`, `act` con
`{tab}`). Las 4 huellas, idénticas; careertest 2248 / NOEXT 2178 / NOWORLD 2131, la misma salida que antes; badgetest 53, viewtest 29,
lobbytest 63; cooptest 70 → 118 comprobaciones.
- **(a) Insignias de lo CONFIRMADO**: ui.js ya no cuenta con `ctx.net.coopCareer`; `feed` las ingiere (anfitrión y p2) sobre la vista
  confirmada, con el `_ovr` del challenge como ui.js, siguiendo al contador si una vuelta cambia gc, y con el setPoint/matchPoint del
  último `serveReady` confirmado mientras cuenta («Sangre fría» no lee el estado de gc, que va unos tics por delante). Esto sustituye
  la petición «ui.js sigue contando las insignias con la partida presentada» de la ronda anterior: HECHA.
  Medida (coop Precisa-N de net4test, 24 partidos de un set a 21, semillas 12-17 × RTT 40/120/200/300 ms, ±15, 3 % de pérdida;
  cuentas = suma de contadores de insignias de los dos humanos frente a la partida de oro): contando lo presentado (antes), error 36
  cuentas sobre 880 (4,1 %; 0/231 a 40 ms, 6/202 a 120, 19/238 a 200 —8 %—, 11/209 a 300; peor partido 6 de 45); contando lo confirmado
  (ahora), error 0 en los 24. cooptest 5d lo comprueba con el partido de Carrera de verdad (matchOpts) y matchDone: error 0.
- **(b) Resumen de la jornada en los dos**: tras matchDone el anfitrión prepara su Resumen (tabla, barra) y manda al invitado `sum`
  (su Resumen: SU XP, nota, números e insignias; él protagonista y el anfitrión su pareja; sin vida/entreno/ofertas del anfitrión) con
  la copia nueva de su p2. Con la hoja final a la vista (ctx.state 'over'), career-coop llama a `VB.UI.endCareer(sum, vista + g.career,
  x)` en cada aparato (main.js solo lo hace con g.career, que la vista online no lleva); la hoja sigue siendo la online («Volver a la
  Carrera»). Lo que llega del otro aparato se limpia (sin «<»/«>»).
- **(c) Pantallas del invitado** (SPLAT, móvil primero): hoja modal `#coSheet` «Conectado con X. Esperando a que llegue su Carrera…»
  (Salir) y «Se ha cortado el cooperativo con X» con su jugador guardado (Entendido); con el corte en pleno partido o en la hoja final,
  la hoja espera a que la deje. Al cortarse vuelve a SU menú: su hub si tiene Carrera, el menú principal si no. En el hub, tarjeta
  arriba del todo (hueco matchTop): qué hace el anfitrión (mensaje nuevo `st` {w: 'hub'|'solo'|'menu'}, solo al cambiar: «está
  eligiendo», «está jugando un partido sin ti», «ha salido de la Carrera», «el próximo partido lo juega sin ti»), su jugador (n.º,
  nivel, puntos), «Listo», «Tu jugador» (a su ficha) y «Salir». Fuera del cooperativo, Partido › Cooperativo y «crear» enseñan su
  jugador guardado («Tu jugador en la Carrera de X: …, nivel N»).
- **(d) Invitado sin Carrera propia**: entra, recibe la Carrera, «Listo», juega (plaza 1) y al cortarse se queda sin Carrera y solo con
  make-the-cut.coop.p2 (cooptest 5c).
- **(e)** El invitado solo escribe make-the-cut.coop.p2 (también al llegar `sum`); con y sin career-coop la Carrera en piloto
  automático es idéntica (cooptest §7).
- **mobaudit** (`--area carrera --only coop`, 7 filas × 5 tamaños, 0 fallos al abrir): anfitrión, invitado, invitado con el anfitrión
  jugando, ficha del invitado, esperando, cortado, Resumen del invitado. Ningún objetivo < 44, 0 solapes (la hoja deja lo de debajo
  `inert`, como #olCoop), salida y principal dentro. Quedan cosas de debajo, no del cooperativo (ver ui_main).
- **L4 → ui_main**: en el Resumen de la jornada, la píldora de insignia nueva (`div.end-bd.rc-bd>span.l1>small`, «nueva (bronce)») va a
  11,5 px en 568×320 (sale en carrera-coop-resumen porque la muestra lleva una insignia; la fila carrera-resumen-jornada no lleva).
- **L4 → P4/ui_main (ui.js fuera de la puerta de insignias)**: `VB.Retos.ingest` sigue contando lo PRESENTADO en el cooperativo (retos de
  maestría/del día del anfitrión con retrocesos). Si se quiere exacto: saltarlo con `ctx.net.coopCareer` y que career-coop lo alimente
  en `feed` como las insignias (career-coop ya expone el sitio).
- **L4 → P4 (main.js, opcional)**: en el coop el Resumen no lleva «Lo mejor / A mejorar» (careerRtBlock) ni las sesiones de entreno de
  la semana (careerSes en careerEndX): si se exportan (p. ej. `ctx.actions.careerRtBlock(sum)`), career-coop las llama tras endCareer.
- **L4 → L3 (lobby)**: `coopBusy` pide cuenta (`noacc`) también al invitado; el invitado sin Carrera puede jugar, pero no sin cuenta.
  Si Ferran quiere invitados sin cuenta, es del lobby/reglas.
- **L4 → P8 (docs)**: CONTRACT.md / notes/net.md: mensajes `st` y `sum` de la coop; `VB.CareerCoop.{guestSum, endX, showSum, sheet,
  hostState, p2Rec, matchWatch, _demo, _tick}`; puerta de ui.js; `node tools/cooptest.js` tarda ahora ~60-80 s (5d juega 2 partidos
  Precisa-N de verdad).

## L2 (suavizado de la vista de Precisa-N y pegamento del partido, 22-nov-2026)

Hecho en js/main.js (sección ONLINE) y tools/netdrive.js. netview.js, players.js y viewtest.js no han hecho falta (el suavizado va
sobre net.view, que el espejo rehace cada frame; las etiquetas ya siguen a los jugadores suavizados). La sim no cambia; el 1 contra 1
(Precisa y Fluida) no pasa por nada de esto (netdrive 1v1 Precisa 8 ok y Fluida 9 ok).
- `netPlayersSmooth` (main.js): tras un rollback, los jugadores que no lleva esta máquina (otros humanos y la IA) se pintan con un
  desfase que se deshace en línea recta en 80-150 ms (ol × 150 ms: hasta 1 m, ≤ 0,11 m más por frame); más de 2 m = teletransporte;
  solo en 'rally'/'serve' sin cambio de modo; no toca a tu jugador (salvo con `r.meAI`) ni al que tiene el balón en la mano. Typed
  arrays, sin reservas por frame. `netBallSmooth` ya no crea un array por frame, y los dos usan el tiempo de verdad entre frames (no
  `realDt`, topado a MAX_DT: tras un parón de 1 s se pinta donde está).
- Final sin evento (P7 → P4 (b)): en el de varios, si la sesión está en 'over' y el gameOver no se presentó (final confirmado en
  silencio por un resync / foto), a los 600 ms pasa a la hoja final igual. Probado con `NDDROPGO=k` en netdrive (la página k nunca
  presenta el gameOver): llega a 'over' (2v2 × 4, partido entero).
- `r.meAI` en el HUD y sin «Revancha» con `ctx.net.coopCareer`: ya estaban (P8); comprobado.
- netdrive --multi: «retraso undefined» era el modelo host (no tiene retraso de entrada): ahora «0 (host: tu jugador sin retraso)».
  Métrica nueva por página: saltos de los jugadores que no son el tuyo, crudo (partida predicha) y pintado (net.view), > 0,15 / > 0,5 m
  y máximo; lista de parones rAF > 100 ms con su segundo; `NDFRONT=k` (página k delante); `NDDROPGO=k`.
- Parones de ~1 s en el arranque del 6v6: NO son del juego. Son de las pestañas de detrás del Chrome de netdrive (salen igual en las
  páginas sin dibujo, que no compilan nada, y duran siempre ~1000-1070 ms). Con `NDFRONT=1` el invitado 6v6 que pinta, delante, no
  tiene ninguno (máx 48 ms, también en el arranque) y los pasa a tener el anfitrión, ahora detrás. El arranque ya precalienta
  (netBuildView: prewarm + prewarmPrograms + warmDraw antes del «listo»); las 11 etiquetas son DOM y no cuestan nada. Sin cambio.

Medidas (netdrive --multi 4, 2v2 Precisa-N, escritorio, 90 s; saltos de jugadores > 0,15 m / > 0,5 m, máx):
| RTT | antes (pintado = crudo) | después, pintado (crudo en la misma prueba) |
|---|---|---|
| 80 ms | invitados 372-449 / 23-30, máx 0,84-1,33 m | 1-4 / 0, máx 0,17-0,22 m (crudo 317-448 / 10-43, máx 1,01 m) |
| 150 ms | invitados 585-732 / 205-286, máx 1,53-2,50 m | 32-51 / 0, máx 0,32-0,45 m (crudo 539-572 / 163-179, máx 1,68 m) |
| 80 ms, partido entero (~8 min) | — | 0-7 / 0, máx 0,27 m (crudo 2198-2531 / 140-214) |
Sin cambio en esperas (0), huellas, coste de sesión (p50 300-500 µs) ni fps.

Peticiones:
- **L2 → P8 (docs)**: notes/net.md «Integración y lag»: quitar de «Pendiente» «jugadores remotos sin suavizar tras un rollback» y
  apuntar lo de arriba (y que los parones de ~1 s de netdrive son de las pestañas de detrás, no del juego).

## L1 (balón continuo en el modelo anfitrión del 6v6, 22-nov-2026)

Hecho en js/nethost.js (bloque «balón pintado CONTINUO»; protocolo 'H2'), tools/hosttest.js (continuidad medida desde fuera de
nethost en TODAS las máquinas, sección (d) con el escenario objetivo y comprobaciones nuevas) y tools/net12test.js ((i) a 180 s).
js/sim.js sin cambios (igual que HEAD). Las 4 huellas idénticas; nettest, net3test, fluidtest, fluidsimtest, mptest, viewtest,
netreplaytest, net4test, net12test y hosttest OK; netdrive --multi 4 (2v2 Precisa y 6v6 host) OK: consola limpia y 0 saltos.

Qué cambia (solo lo que se PINTA; la partida del anfitrión y las reglas no cambian):
1. Horizonte de lo sabido: el reloj del balón pintado no pasa de un punto de la trayectoria en el que un jugador PODRÍA tocar sin que
   su toque haya podido llegar aún (lat por fuente aprendida de los toques de verdad). Frena antes (hasta ×0,5) para llegar a su mano
   justo cuando llega su toque, y luego recupera (hasta ×1,5; ×1,9 si viene a mí). El anfitrión pinta igual (lat de cada invitado):
   en un punto salvado el balón ya no vuelve del suelo.
2. Quién puede tocar: el reparto de la IA del anfitrión (g.jobs) y lo que declara cada invitado («voy», bit 4 de su pose → bit 64 del
   paquete) van en el paquete de 30 Hz con el F.seq de su último contacto: solo vale si es el mismo contacto que sé (por tic no:
   el toque de un invitado lleva SU tic y el anfitrión lo sabe su ida después). Los demás de ese equipo, solo en la zona de bloqueo.
3. Viene a mí: por cerca (salvo que el anfitrión se lo dé a un compañero), por su reparto o por el mío; tras tocar yo, no.
4. Lo que aún salte se reparte: ≤ 0,15 m por frame de corrección; acelerar o frenar el reloj, ≤ 0,2-0,25 m por frame.
5. Tras el punto el balón pintado termina su vuelo y luego pasa al de verdad.
6. En el invitado, el que va a tocar (y frena el balón) se pinta con el reloj del balón: su golpe y el balón llegan a la vez.

Medidas (tools/hosttest.js, 6v6, anfitrión + 11 invitados a 80-150 ms, ±15 ms, 2 % de pérdida, 4 partidos enteros, semillas 7, 8, 9, 11):
| | antes (97b295b) | después |
|---|---|---|
| saltos del balón pintado > 0,5 m (invitados) | 50 (máx 3,84 m; hasta 14 en un invitado) | 0 (máx 0,41 m) |
| ídem en el anfitrión | 10 (máx 0,70 m) | 0 (máx 0,34 m) |
| corrección por frame p99 (invitados / anfitrión) | 0,15 / 0,17 m | 0,16 / 0,17 m |
| contactos que llegan con el balón pintado ya pasado | 1794 | 432 (−76 %) |
| toques de invitado rechazados | 39 | 12 |
| balón pintado al tocar yo (tics por detrás, media / p90) | 3,6 / 8,9 | 2,7 / 7,6 |
| jugador propio (máx. por frame, sin tirones) | 0,13 m | 0,14 m |
| puntos iguales en las 12 máquinas | sí | sí |
| paquete de 30 Hz | 276 B | 279 B |
| CPU por frame, mismo escenario 150 s (anfitrión / invitado, p50-p99) | 299-1016 / 130-371 µs | 310-1120 / 134-396 µs |
La sección (d) de hosttest (semilla 11, partido entero): 0 saltos (máx 0,40 m invitados, 0,30 m anfitrión), p99 0,16 / 0,17 m.

Probado y descartado: que el reparto del anfitrión mandara también en la sim de cada invitado (nhStep). Quita casi todos los choques
de compañeros (432 → ~60 tardíos) pero el equipo del anfitrión gana 34-6 en 4 partidos (sin ello 25-21): cambia el juego, no solo
lo pintado. sim.js queda como estaba.

Peticiones:
- **L1 → P8 (docs)**: CONTRACT.md («`VB.NetHost.{Session, C, PROTO 'H1'}`» → 'H2') y notes/net.md «Modelo anfitrión del 6v6»: paquete
  de 279 B (cabecera de 15 B: [12], [13] reparto de la IA por equipo, id o 255; [14] F.seq; bit 64 de cada pose = va a por el balón;
  el invitado lo declara con el bit 4 del byte [7] de su pose), «Protocolo 'H2'», el aviso «un punto salvado hace que el balón
  vuelva del suelo a la plancha» ya no vale, y `node tools/hosttest.js` (d) en el control de regresión.

Pendiente / visto:
- Lo que queda de saltos «crudos» (antes de repartir, ~450 por partido en el peloteo) es sobre todo la propia sim en el contacto (el
  bloqueo y la plancha recolocan el balón 0,5-0,8 m; también se ve en el anfitrión) y dos invitados del mismo equipo que tocan a la vez
  (cada uno ve el balón ir a él). Se reparten: ningún frame mueve el balón más de ~0,4 m de lo que vuela.
- En el banco con 12 bots el equipo del anfitrión gana más (antes 64-66 % de los puntos; ahora 54-75 % según semillas): su colocador
  juega sin retardo. No es del balón pintado; con 4 humanos y 8 de la IA el reparto es el mismo que antes.
- El anfitrión no retrasa la pose del invitado que va a tocar (el invitado sí): en su vista el golpe se adelanta la ida de ese invitado.
- Falta la prueba en un móvil de verdad (el coste extra es ~5-10 % por frame en escritorio).

## P8 (medida final tras L1-L4): estado de las peticiones abiertas (22-nov-2026)

- L1 → P8, L2 → P8, L3 → P8, L4 → P8 (docs): HECHO. CONTRACT.md (PROTO 'H2', balón continuo, netroom `joinable`/`beat lite`/'coop'/
  'host', career-coop `st`/`sum` y API nueva, `netPlayersSmooth`, control de regresión con hosttest (d), cooptest ~60-80 s y roomtest)
  y notes/net.md (modelo anfitrión: paquete de 279 B y cabecera de 15 B, «Protocolo 'H2'», fuera el aviso del balón que volvía del
  suelo; salas: 'coop', `net: 'host'`, lecturas; coop: insignias de lo confirmado, Resumen en los dos; integración: puntos 6-8 y
  fuera de «Pendiente» los jugadores remotos sin suavizar).
- L3 → dueño de tools/lobbytest.js («la sala pasa a «play»» fallaba 1 de cada 3): HECHO. Espera hasta 5 s a que el latido deje
  `state: 'play'`. 4 pasadas seguidas OK (63 comprobaciones).
- L4 → P4/ui_main (`VB.Retos.ingest` cuenta lo presentado en el coop): NO HACE FALTA. ui.js nunca llama a `Retos.endMatch` en el online
  (`!(g && g.online)`, decisión 4 de Ferran), así que lo que cuente `ingest` en un partido online no llega a ningún sitio.
- tools/netdrive.js --multi: métricas nuevas para la tabla de medidas (línea «RESUMEN» por página): p99 del salto de los jugadores
  PINTADOS que no son el tuyo, saltos > 0,5 m del balón PINTADO (net.view, los dos modelos), rollback p99 y subida por enlace.
- Siguen abiertas (no son de integración; para Ferran o para el siguiente sprint):
  - L4 → P4 (opcional): «Lo mejor / A mejorar» y sesiones de entreno en el Resumen del coop (exportar `careerRtBlock` de main.js).
  - L4 → L3: el invitado del coop necesita cuenta (`noacc`). Decide Ferran.
  - L3/L4 → ui_main: «Jugar» recortado 4 px en 667×375, «DIRECTO» a 11,5 px, #btnVer 18 px, píldora de insignia nueva a 11,5 px en
    568×320. Son del menú y del Resumen de siempre, no del online.
  - L3 (1v1, sin tocar por «1v1 igual»): latido lite y 65 s de latido viejo también en el 1v1.
  - Reglas SIN desplegar (orden: reglas y luego cliente 1.22.0).
- **Arreglo de P8 en js/main.js (sección ONLINE, una rama)**: en el modelo host el ANFITRIÓN pasa también por `netPlayersSmooth`
  (solo su vista; los invitados ya interpolan). Pintaba a cada invitado con su última pose extrapolada y cada pose nueva con su jitter
  daba un tirón. netdrive 6v6 × 12 a 150 ms, jugadores de los demás en la vista del anfitrión (> 0,15 / > 0,5 m, máx, p99): 1137 / 45,
  0,96 m, 0,15 m → 0 / 0, 0,14 m, 0,06 m (crudo en la misma prueba 1014 / 40). A 80 ms: 874 / 3 → 0 / 0. CPU igual (200/800 µs).
  netdrive 1v1 Precisa (8 ok) y Fluida (9 ok) sin cambios.
- Visto y NO es del juego: los 1-3 «saltos» de ~1 m del balón pintado de los invitados 6v6 en netdrive caen todos en un frame de
  63-71 ms que tienen A LA VEZ todas las páginas de detrás del Chrome de pruebas (la sesión nunca pasa de 5 ms) y coinciden con un
  contacto (bloqueo a 2,9 m, Δv 15 m/s; plancha a 0,66 m, Δv 19,5 m/s): el contacto cae dentro del hueco. Con la página delante no salen.

## P8: arreglos de lag tras la medida final (22-nov-2026)

Sin git, sin push, sin despliegue. Ficheros: js/net.js (solo `NP._predict` de la SessionN y 3 líneas `_pqDirty`; la Session del 1 contra 1
no cambia), js/main.js (sección ONLINE: `netBallSmooth`, rama del modelo host y `netHostBallClock`), tools/netdrive.js (media de tics
rehechos por frame en --multi), CONTRACT.md y notes/net.md (punto 11). Cada medida, antes y después con el mismo comando (90 s, RTT ±15 ms,
2 % de pérdida, Chrome de escritorio; otra sesión corría tools/drive6.js de fondo). Las cifras de la página CPU ×4 varían de una pasada a
otra (parones de pestaña de detrás): se dan las dos pasadas cuando las hay.

1. **Predicción incremental de Precisa-N** (el coste de la sesión en el móvil lento). La partida predicha del frame anterior se reutiliza si
   las entradas que usó siguen siendo las de ahora; si no, se rehace desde gc como antes. Comprobado aparte (banco en memoria, cada 7.º
   frame se rehace también a la antigua y se comparan las huellas de estado): 4542 comparaciones, 0 distintas (2v2 × 4 a 150 y 80 ms y
   coop de 2 a 120 ms). Tics rehechos por frame: 14,1 → 5,5 (150 ms), 9,1 → 4,1 (80 ms), 6,5 → 3,0 (coop).
2. **Balón pintado de Precisa-N**: corrección como mucho a 15 m/s (≤ 0,25 m por frame) y saltos de hasta 4 m repartidos (antes 3 m, a la
   mitad cada 80 ms).
3. **Invitados del modelo host con `netPlayersSmooth`**, salvo el jugador que va con el reloj del balón de L1 (`pDel > 0` o `_capBind`):
   a ese no se le añade desfase nuevo, así su mano y el balón siguen llegando a la vez (la objeción de P8 a L1 queda resuelta así).

| prueba | antes | después |
|---|---|---|
| 2v2 × 4, 150 ms, inv1 CPU ×4 (detrás): sesión p50/p99 en la x4 | 2,3 / 5,2 ms | 0,8-1,0 / 4,7-4,8 ms |
| ídem: tics rehechos por frame en la x4 (rollback p99 sigue 24) | ~20 (todo el rollback) | 6,0-8,0 |
| ídem: jugadores pintados p99 (máx) en la x4 | 0,19-0,21 m (0,66-0,68) | 0,16-0,17 m (0,53; una pasada 2,06 = teletransporte de > 2 m tras un parón de 1 s, igual que el crudo) |
| ídem: balón pintado > 0,5 m en la x4 | 3-13 (máx 0,88-1,73) | 4 (máx 0,69-1,03) |
| ídem: invitados sin frenar, sesión p50 | 0,4 ms | 0,2 ms |
| 2v2 × 4, 150 ms, x4 DELANTE (NDFRONT=1): sesión x4, jugadores p99, balón > 0,5 | 2,4 / 4,7 ms · 0,14 m · 0 | 0,6 / 4,2 ms · 0,11 m · 1 (0,52) |
| 2v2 × 4, 80 ms, x4: jugadores p99 (máx), balón > 0,5 m en la x4 | 0,11 (0,25) · 5 (0,82) | 0,09 (0,33) · 0 (0,47); sesión x4 1,0 / 3,8 ms |
| coop 2 páginas 120 ms: sesión p50 | 0,1-0,2 ms | 0,1-0,2 ms; tics rehechos 1,6 / 2,5; jugadores 0,04 m; balón 0 |
| 6v6 × 12, 150 ms, invitados: jugadores pintados p99 (máx) | 0,16-0,17 m (0,54-0,68) | 0,09 m (0,40-0,86) |
| ídem: saltos > 0,5 m de jugadores por invitado | 2-5 | 0-2 |
| ídem: balón pintado > 0,5 m por invitado; anfitrión | 1-3 (máx ~1,0); 0 | 0-1 (máx 0,93); 0 |
| 6v6 × 12, 150 ms, subida del anfitrión | 12-13 KB/s × 11 | 12 KB/s × 11 (sin cambio, ver abajo) |

- **Lo que NO cambia**: el rollback de los invitados de 2v2 a 150 ms sigue en el tope (p99 24, p95 19-22): es el camino invitado → anfitrión
  → invitado (~300 ms de ida y vuelta) menos un retraso de 4-5 tics. Subir el retraso ya se probó (net.md punto 5) y no compensa. Lo que
  cuesta ahora es solo el frame en que una predicción falla (p99 de la sesión ~4,5 ms con CPU ×4, ~1,1 ms en un móvil de verdad
  si el ×4 se parece). Con humanos de teclado fallará menos que con los bots (que cambian el stick cada frame); con stick táctil, parecido.
- **Subida del anfitrión 6v6**: medida aparte en memoria (12 plazas, 150 ms): 12,1 KB/s por enlace a 125 fps y 13,6 a 60 fps, NO depende de
  los fps (paquete de 30 Hz por tics: 8,2 KB/s; fotos 2,4-4,0; contactos y eventos ~1,2). Lo que sí sigue los fps es el anfitrión de
  **Precisa-N 2v2** (un paquete por frame: 27,6 KB/s por enlace a 126 fps, 13,8 a 56 fps). No se ha topado: con 3 enlaces son ~40-130 KB/s
  y topar a 60 Hz añadiría hasta 8 ms al reenvío. Se mantiene la recomendación de PC o wifi para crear salas de 6v6 (~135 KB/s).
- Pruebas tras los cambios: las 4 huellas idénticas; nettest 61, net3test 61, mptest 53, viewtest 29, netreplaytest 42, net4test 88, todo OK;
  cooptest 118; netdrive 1v1 Precisa 8 ok y Fluida 9 ok; netdrive --multi 4 a 150 ms (x4 detrás y delante), a 80 ms (x4), coop 120 ms y 6v6 × 12 a 150 ms:
  todas sus comprobaciones OK (huellas iguales, resyncs 0, misma secuencia de puntos, consola limpia, 0 esperas).
- Sigue pendiente: la prueba en un teléfono de verdad (los números de CPU ×4 y los parones de 1 s son del Chrome de pruebas), CPU del
  anfitrión 6v6 en un móvil, y lo de Ferran de la lista anterior (reglas sin desplegar, cuenta del invitado coop, etc.).

## Revisión: arreglos de los hallazgos confirmados (22-nov-2026)

Sin git, sin push, sin despliegue. Huellas offline idénticas (las 4); 1 contra 1 Precisa/Fluida sin tocar (net.js, netfluid.js y la
rama 1v1 del HUD no cambian). Ficheros: js/nethost.js, js/netlobby.js, js/netroom.js, firebase/firestore.rules, js/career-coop.js,
js/career.js (3 líneas en matchDone), js/main.js (sección ONLINE: HUD del de varios, récord), js/profile.js (careers(), 1 guarda) y los
bancos tools/hosttest.js (e), tools/lobbytest.js (a2 y coop), tools/roomtest.js y tools/cooptest.js («Arreglos de la revisión»).

1. **nethost: un invitado que calla más de GONE ya puede volver.** GONE y HOST_GONE 20 → 60 s (como Precisa-N y el lobby). El invitado
   que lleva WAIT (1 s) sin oír al anfitrión repite `hello` cada REHELLO (1 s); el anfitrión lo readmite si lo había dado por ido (foto
   tele, `go`, y `{k:'back', s}` a todos: los demás borran su `gone[s]`); un `hello` repetido de una plaza que sigue dentro se ignora
   (el 'ctl' es fiable; nada de foto a mitad de peloteo). Si el invitado acaba sin noticias y la que se paró fue SU página, el resultado
   es `'lost'` (no `'hostGone'`; NetRec: no cuenta). Medido con hosttest run() (2v2 host, 120 ms, semilla 11, parón de la plaza 3 a 30 s):

   | parón | antes | después |
   |---|---|---|
   | 15 s | vuelve | vuelve |
   | 21 s | gone, IA el resto del partido, invitado 'ended' hostGone | vuelve (playing, hum[3].ai false) |
   | 45 s | ídem | vuelve |
   | 70 s | ídem | el anfitrión lo da por ido a los 60 s → `hello` → «vuelve»; playing |
   | 21 s con GONE forzado a 20 s | hostGone | «se va» → «vuelve» (8 frames en 'waiting'); los demás sin seatGone(3) |

   hosttest (e), nuevo, lo comprueba (GONE 8 s, parón de 9,5 s).
2. **nethost: foto a mitad de peloteo.** `_fsPart` vuela el balón de c.T a mi T (S.flFly en medios pasos, como nhApplyTc; en el saque con
   el balón en el aire, también tossT). Sin tele ya no borra `pend`: el eco de mi toque lo vuelve a aplicar (la foto no lo tenía) y su
   rechazo sigue devolviendo el balón al último contacto del anfitrión. Error del balón SIMULADO del invitado contra el del anfitrión en el
   mismo tic, entre la foto y el siguiente contacto (2v2 host, 120 ms ±10, semilla 11, 100 s, parón de 2,6 s de la plaza 3):
   parón a 55 s: p50 0,45 m (p95 0,50) → 0,00 (p95 0,00); a 63 s: p50 1,09 m → 0,00 (la única muestra > 0,5 m que queda, 5,15 m, es de la
   propia página parada, con su cola de 2,6 s). Sin foto: p50 0,00 antes y después.
3. **netlobby: sondeo del anfitrión ordenado.** Una lectura en vuelo (hasta 10 s) salta el turno; una respuesta más vieja que la última
   aplicada no cuenta; solo se suelta como «se fue» a quien ya estaba ofrecido cuando empezó la lectura (p.t0 < inicio). lobbytest a2
   (lectura de 3,5 s que llega tarde): antes FALLO («Se ha perdido la conexión con la sala de Wen Host.»), después ok. De paso, `cnt` se
   escribe de una en una (mxCntW): tres saludos a la vez dejaban a veces cnt 2 con 3 dentro (lobbytest a: fallaba 2 de 3 pasadas; ahora 4 de 4 ok).
4. **netlobby: coop emparejada entre partidos.** Con `E.coopOn`, una caída del enlace se renegocia como en pleno partido (anfitrión
   mxRelinkHost, invitado mxGuestListen sobre el MISMO enlace de la fachada); antes se lee la cola (un `lb-bye` cuenta). Si no vuelve en
   COOP_DOWN_MS (60 s), se acaba. lobbytest (c) «un corte del enlace se renegocia y la coop sigue»: antes FALLO (closed, gone, hostLost),
   después ok.
5. **«Sacar de la sala» = fuera de esa sala.** rooms.kick escribe `seats.<uid>` (borrado) y `ban.<uid> = true` en el mismo commit (≤ 20;
   si las reglas no lo aceptan, solo lo levanta); un join de alguien vetado → `'kicked'` («Quien creó la sala te ha sacado…»); en el lobby
   el veto de un «Sacar» dura toda la sala. Reglas: `ban` opcional (mapa ≤ 20) en roomOkMulti, y la rama de sentarse exige no estar en él.
   **Ojo, emulador en español**: cualquier forma de esa condición sin el ternario `resource == null ? true : …` da HTTP 500 en TODO (un
   upsert evalúa la rama de update sin documento y el emulador revienta al formatear el aviso en es_ES); con `-Duser.language=en` no pasa.
   roomtest: veto (cliente y reglas) y nadie más que el anfitrión toca `ban`.
6. **netroom: o_/a_ huérfanas.** Los invitados vistos se apuntan también en el almacén del navegador (`make-the-cut.netroom.pairs`,
   opción `store` de create; en Node no hay almacén) y open()/close() los borran aunque la sala vieja ya no exista. list() barre de paso
   hasta 3 caducadas de CUALQUIER estado (antes solo 'open'). roomtest: «cliente viejo barre la sala de varios y el anfitrión la reabre» y
   «también la caducada que se quedó en play».
7. **profile.js careers()**: con `VB.Career._memStore()` puesto (invitado de la coop) no cuenta ninguna Carrera. Antes (vm, coopleak):
   ach {m1,w1,t1}, car {'b:99'} y el hito 'titulo' en el perfil del invitado; después, ach {} y car {}. cooptest lo comprueba.
8. **career-coop adopt**: ss2 se archiva con el invitado y vuelve con él (antes Luis veía 1 jugado y 9 remates de Ana; ahora 0 y 0).
9. **«nack»**: `VB.CareerCoop.noP2()`, que matchDone usa: mate2 = null y extra.coop = false (química y forma del compañero de la IA como
   siempre). cooptest: sin esto, 2 fallos (insignias de p2 y química).
10. **«Listo» caducado**: el anfitrión guarda la clave del partido (temporada, fase, jornada, partidos apuntados, tipo) al llegar el
    «Listo»; si cambia (simulado, partido en solitario), lo anula y manda `{t:'rdy0'}` (el invitado lo apaga). cooptest lo comprueba.
11. **HUD del de varios** (main.js netHudMulti): esperando con canAI, «Si no vuelve en N s, el partido no cuenta» y «Seguir con la IA (no
    cuenta)»; jugando, « | Los rivales no han vuelto: ganáis (contra la IA)» o « | Contra la IA (no cuenta)»; 'hostGone' con el nombre de
    quien creó la sala (nunca «anfitrión»); 'lost', nuevo. Sin cuentas de personas: «Tu equipo contra Equipo de Luis» (también en el texto
    de rivales del récord).
12. **La Carrera coop, fuera del récord online** (netRecOn con net.coopCareer), y su botón dice «Salir del partido» (no «cuenta como derrota»).
13. Textos: tarjeta de pista «Pronto: la Carrera de pista en cooperativo. De momento, el cooperativo es de la Carrera de playa.»;
    «(o pulsa «Sacar de la sala»)»; el código de la coop con el mismo aviso que el lobby (sin 0, O, 1, I ni L).

Pruebas tras los cambios: fingerprint6 2v2 / mastery / salto / 6v6 idénticas; net4test 88 OK; hosttest 34 OK (2 nuevas); net12test 27 OK;
cooptest 125 ok (7 nuevas); lobbytest 65 OK (2 nuevas); roomtest 256 ok y los mismos 4 fallos de antes («Reglas desplegadas hoy»: el
emulador en es_ES devuelve 500 en vez de 403 con las reglas viejas; salen igual con las reglas sin tocar); nettest 61 OK; careertest
2248 OK. netdrive --multi 4 a 150 ms, Precisa-N: 5 ok (esperas 0, rb p99 10/21, jugadores pintados p99 0,04-0,11 m, balón > 0,5 m 0-2,
resyncs 0, consola limpia); modelo host 2v2: 5 ok (misma secuencia de puntos, esperas 0, balón > 0,5 m 0, sube 7,1 KB/s × 3).

Para P8 (docs: CONTRACT.md y notes/net.md):
- nethost: `C.GONE` y `C.HOST_GONE` 60 s, `C.REHELLO`, 'ctl' `back{s}`, `hello` repetido en 'waiting', `result.why 'lost'`.
- netroom: `create({…, store})`, `kick` con `ban`, error `'kicked'`, `list()` barre caducadas de cualquier estado; reglas `ban` (SIN
  desplegar; el orden de siempre: primero las reglas, luego el cliente).
- netlobby: COOP_DOWN_MS y la renegociación de la coop entre partidos; sondeo con lectura en vuelo y orden; mxCntW.
- career-coop: `noP2()`, mensaje `rdy0`, ss2 en `c.coop.old[uid]`.
- Dueño de js/profile.js: la guarda de careers() es mía (1 línea y un comentario); si preferís otra forma, decídmelo.

## Lane A (vuelta tras recargar en el de varios, telemetría «prefail», Beta del 6v6; 22-nov-2026)

Sin git, sin push, sin despliegue. Ficheros: js/netlobby.js (bloque «VUELTA TRAS RECARGAR EN EL ONLINE DE VARIOS», ganchos en pagehide /
visibilitychange / backTry / mxGuestLinkState / mxRelease / mxEnd, pegatina «Beta» y consejo del 6v6), js/main.js (sección ONLINE:
netApp `hostAway` / `hostLeft`, `netHostLeft` + `ctx.actions.netHostLeft`, netAway del anfitrión, textos de netHudMulti, `&back=1` en
startNetTestN), js/netlog.js (`prefail`, `linkDiag`), tools/lobbytest.js (sección g y comprobaciones de prefail en b) y tools/netdrive.js
(NDRELOAD en --multi y --coop, NDHOST=away|reload). net.js, nethost.js, netrtc.js, sim y reglas: SIN tocar (la readmisión del modelo
anfitrión usa su propio `bye` + `hello`). Las 4 huellas idénticas; 1 contra 1 sin cambios (netdrive 1v1 Precisa 8 ok, Fluida 9 ok,
--rtc 27 ok con las dos recargas de la fase 6).

1. **Vuelta del invitado** (2v2 Precisa-N, 6v6 anfitrión, Carrera coop): marca BACK (sessionStorage, `multi: 1`) en el pagehide y al
   ocultarse la página (el móvil puede matarla sin pagehide; al volver a verse se borra). Sin adiós ni plaza fuera. Al cargar: hoja
   «Volviendo a la partida…» con «Cancelar» (la #olCoop), motor de invitado ya empezado que contesta la siguiente oferta del relink
   del anfitrión y, con el enlace ABIERTO, sesión nueva sin opciones en su plaza (HUD «Volviendo a la partida…» con «Salir» hasta la
   foto). Modelo anfitrión: antes del saludo, `{k:'bye', why:'reload'}` de la sesión vieja → el `hello` la readmite (foto tele, `back`).
   Plazos: 55 s (Precisa-N y coop: el anfitrión da la plaza por ida a los 60 s), 120 s en el modelo anfitrión; espera del enlace 70 s.
   Sala desaparecida → «X ha cerrado la sala: el partido no cuenta» y la marca del récord se cierra como «no cuenta». Coop: vuelve al
   PARTIDO (net.coopCareer); su Carrera en memoria no vuelve y al salir de la hoja su `lb-bye` cierra la coop del anfitrión.
2. **Anfitrión**: sin vuelta en el de varios (nadie más tiene la partida entera). Su pagehide manda `{t:'hostLeft'}` por la sesión y
   los invitados acaban YA con 'hostGone' («X se ha ido: el partido no cuenta»); respaldo: invitado con el enlace caído mira la sala cada
   5 s y, si ya no existe, lo mismo. Pestaña oculta (móvil): `{t:'hostAway', a}` → «X ha salido un momento de la app. Esperando a que
   vuelva…» (y los 60 s de siempre).
3. **Telemetría prefail**: enlace del lobby de varios / coop que no llega a abrirse antes del partido → UN `netlogs/{uid}_pf…` (mismas
   reglas) con kind 'prefail', rol, fmt, cap, modo, fase, why, ms, iceState/connState/gathering/signaling, cand {loc, rem} (solo TIPO y
   transporte, «srflx/udp»), relay, env. Uno por sala y como mucho 3 por página; nunca con partido en marcha ni contra el emulador.
   El 1 contra 1 no lo lleva (regla «1v1 igual»: sería una línea en connFail).
4. **Lobby**: pegatina «Beta» (sp-chip dorada girada, la del botón Online) en los tickets de 6 contra 6 y junto a «Formato» con el 6 contra
   6 elegido (aria «beta»). Consejo «Mejor desde un ordenador o con wifi.»: nota de «Crear sala» en PC y aviso al abrir la sala de 6v6
   (en el móvil la nota de «Crear sala» no se ve).

Medidas (antes → después):
| caso | antes | después |
|---|---|---|
| invitado recarga, 2v2 Precisa-N (netdrive --multi 4, BcLink) | la IA el resto del partido (a los 60 s, ida) | jugando a los 2,3 s, plaza devuelta a los 3,0 s, huellas iguales |
| ídem 6v6 modelo anfitrión | la página nueva no podía volver | 1,8 s / 2,2 s, mismos puntos |
| ídem coop (BcLink) | — | 2,4 s / 5,1 s |
| ídem por el lobby + WebRTC (NDRTC=1), 2v2 / 6v6 | — | hoja a 1,4 s, jugando a 3,7 / 3,4 s, plaza a 4,3 / 4,4 s |
| Carrera coop de punta a punta (--coop) | — | jugando a 3,7 s, plaza a 12 s; jornada y p2 acreditados; coop cerrada al salir |
| anfitrión recarga (NDRTC=1, 2v2 y 6v6) | invitados 60 s en «Esperando…» y «no ha vuelto» | acaban a los 270 ms: «X se ha ido: el partido no cuenta» |
| anfitrión congelado 15 s (NDHOST=away) | «Esperando a: Anfi…» | «Anfi ha salido un momento de la app…»; todos siguen al volver |
| lecturas de Firestore (roomtest «ciclo de vida») | 110/39 · 74/28 · 138/45 · 60/22 | iguales |
| lobbytest | 65 | 87 comprobaciones |
| mobaudit --area online | — | igual que la base (0 recortes / 0 objetivos < 44 / letra ≥ 12); +1 texto < 14 px en create-6v6 (la pegatina, 12 px). Siguen los de antes: aviso sobre un ticket (online-aviso) y «Jugar» de debajo (online-coop) |

Pendiente / para decidir:
- Vuelta del ANFITRIÓN que recarga en el de varios: haría falta que una sesión adopte la partida de un invitado (net.js SessionN y
  nethost.js; fuera de esta lane). Hoy acaba limpio y no cuenta.
- Coop: tras la vuelta, el invitado no recupera la vista de la Carrera (vuelve al partido; luego al menú).
- netdrive NDRELOAD probado con 4 páginas (no con 12) y nada en un teléfono de verdad; mxHostChk (respaldo sin aviso) sin prueba en Chrome.
- sessionStorage = misma pestaña: si el navegador descarta la pestaña del todo (pestaña nueva), no hay vuelta.

Para P8 (docs: CONTRACT.md y notes/net.md): quitar «vuelta tras recargar en el de varios» de Pendiente y apuntar lo de arriba; mensajes
de app `hostAway {a}` / `hostLeft`; `ctx.actions.netHostLeft`; `result.left` en 'hostGone'; `VB.NetLog.{prefail, linkDiag, _pf}` y el
documento prefail; `VB.NetLobby._state().bk`; netdrive NDRELOAD / NDRELOADAT / NDHOST; `&back=1` de startNetTestN; lobbytest (g).

## Lane B (ritmo de envío, vuelta tras recargar en las sesiones, tope de predicción; 22-nov-2026)

Sin git, sin push, sin despliegue. Ficheros: js/net.js (SOLO la SessionN de Precisa-N; la Session del 1 contra 1, Fluida y el cable no
cambian), js/nethost.js, tools/net4test.js (secciones (n), (o), `--lane`, `--lane --maxpred`; `frameMs`, modelo de CPU `cpuX`/`stepUs`,
correcciones visibles `visible`), tools/hosttest.js (sección (f), `frameMs`, `reload`, `pre`). Las 4 huellas idénticas; net4test 88 → 122, hosttest 34 → 54, net12test 27, cooptest y lobbytest 87 OK; nettest 61,
net3test 61, mptest 53 y netreplaytest 42 OK (el 1 contra 1, igual).

1. **Ritmo de envío de Precisa-N** (js/net.js, `SEND_HZ` 60, `SEND_FAST_DT` 13 ms, `SEND_SIG`). Con frames de 13 ms o más de media
   (60 Hz) nada cambia: un paquete por frame y enlace (net4test (n): a 60 Hz mismos bytes y mismas huellas con y sin tope). Con pantallas
   más rápidas, crédito por enlace: como mucho 60 paquetes/s de media. No se pierde nada (cada paquete lleva todo lo no confirmado).
   Un botón nuevo sale en el acto; un cambio del stick de más de SEND_SIG (5 %) desde lo último mandado puede adelantarse un frame con
   crédito prestado. `o.pace === false` = un paquete por frame (pruebas). `stats.paced` = envíos aplazados.
   Medida (net4test (n): 2v2 × 4 a 126 fps, 150 ms ±15, 2 % de pérdida, retraso fijo 4):
   | | antes (un paquete por frame) | ahora |
   |---|---|---|
   | paquetes/s por enlace | 116-118 | 58-59 |
   | subida del anfitrión por enlace | 37 KB/s | 19 KB/s |
   | subida de cada invitado | 14,2 KB/s | 7,3 KB/s |
   | profundidad de rollback p99 (invitados) | 19-21 | 22-23 (medio frame más por tramo) |
   | micro-esperas (con el tope de predicción nuevo) | 0 | 0 |
   Con 6 semillas × 90 s: correcciones visibles de la partida predicha +20-28 % frente al MISMO aparato sin tope (los bots cambian el
   stick casi cada tic), y en la línea de un móvil de 60 Hz sin tope (corrección total 218 frente a 189 m/min; > 0,5 m 137 frente a 126
   por minuto e invitado); en la semilla 41 de (n) a 90 s, casi el doble (> 0,5 m: 99-111 → 176-185). Probado también dejar que todo
   cambio salga sin crédito (sin tope real): 81 paquetes/s y correcciones como sin tope. Es el precio de topar: un aparato de 120 Hz pasa a mandar como uno de 60 Hz. Con humanos que no mueven el
   stick a cada tic, menos.
   Modelo anfitrión (nethost): ya iba por tics (paquete de 30 Hz, pose de 60 Hz), no por frames: 126 fps → 36 / 62 paquetes/s por enlace
   (anfitrión→invitado / invitado→anfitrión), igual que a 60 Hz. Arreglado lo único que dependía del frame: tras un parón (o con frames
   largos) salían varias poses o paquetes de 30 Hz a la vez; ahora solo el último del frame (`_ftgt`). Con 30 fps y 3 % de tirones, la
   pose del invitado 63 → 33 paquetes/s (2,1 → 1,3 KB/s), sin cambiar nada más.

2. **Vuelta tras recargar en las sesiones.** Precisa-N: funcionaba ya (saludo → hello con las opts → ready → IA + resync), por el mismo
   enlace renegociado y con `addLink`. Ahora con pruebas: net4test (o) mata la página de un invitado 5 / 12 / 25 / 40 s y la vuelve con
   un contexto vm nuevo, reloj de cero, sesión sin opts, misma plaza y época; también el coop de 2 (20 s). En todos: resync aplicado
   ~0,8 s después de la página nueva, plaza humana en las 4, huellas iguales desde el resync, prueba de oro y los demás siguen (las
   esperas son solo los 3 s hasta que la IA coge la plaza, como antes).
   Modelo anfitrión: por el mismo enlace (el del lobby) ya readmitía con el `bye` reload + `hello`. Nuevo: `sess.addLink(link)` en
   nethost y, si una plaza saluda por OTRO enlace mientras el viejo lleva callado más de SILENT_AI, el viejo se retira sin avisar y entra
   como una vuelta (antes: `bye seat`); el `bye` reload por un enlace sin plaza ya no marca nada. hosttest (f): 2v2 5 / 25 s y 6v6 12 /
   40 s, mismo enlace y addLink: readmitido 0,1-0,25 s después de la página nueva; su jugador deja la IA en el siguiente balón muerto
   (5-12 s, como antes); marcador igual que el del anfitrión; nadie lo da por ido.

3. **Tope de predicción de Precisa-N: 24 → 30** (`MAXPRED_N`; el 1 contra 1 sigue con 24). Estudio: `node tools/net4test.js --lane
   --maxpred` (2v2 × 4, 5 semillas × 90 s, móvil de 60 Hz: render 9 ms + sim × 6 con 20 µs por tic y 130 µs por copia, modelo fijo sin
   el ruido del reloj de Node):
   | invitados | tope 24, K 16 (antes) | tope 30, K 16 (elegido) | tope 36 | tope 24, K 13 (+3 tics de retraso) |
   |---|---|---|---|---|
   | 150 ms: micro-esperas | 0,09 % de los frames | 0 | 0 (= 30) | 0,06 % |
   | 150 ms: saltos visibles > 0,5 m por min / corrección total | 132 / 208 m/min | 122 / 199 | = 30 | 107 / 191 |
   | 40/120/200: micro-esperas | 0,07 % | 0 | 0 (= 30) | 0,03 % |
   | 40/120/200: > 0,5 m por min / corrección total | 73 / 146 | 76 / 152 | = 30 | 50 / 128 |
   | sim del móvil p99 / máx | 3,7 / 4,4 ms | 3,8 / 4,6 ms | = 30 | 3,7 / 4,4 ms |
   | frames perdidos por CPU | 0 | 0 | 0 | 0 |
   | rollback máx | 24 | 28-30 | 28-30 | 24 |
   A 126 fps con el ritmo nuevo (3 semillas): micro-esperas 0,35 % → 0, > 0,5 m 135 → 112 por minuto. Elegido 30: quita las esperas
   sin más correcciones (diferencias dentro del ruido entre semillas, ±20 %) y cuesta 0,1-0,2 ms en el peor frame del móvil. 36 no aporta
   (nunca pasa de 30). Bajar el «- 16» del retraso (K 13) quita un 20-30 % de correcciones pero no todas las esperas y pone 25 ms más de
   retraso a TU jugador: descartado. `o.maxPred` y `o.delayK` quedan para pruebas.
   Efecto secundario arreglado: con el tope de 30, la plaza de conexión muy mala de net4test (m) (600 ms, 50 % de pérdida) ya casi no
   paraba la partida en seco, pero la FRENABA (72 % del tiempo real) y nunca llegaba a SLOW_MS, así que no pasaba a espectador (3 fallos
   en (m)). Ahora el anfitrión cuenta también el tiempo que la partida va más lenta que el reloj como espera de la plaza más atrasada en
   entradas (solo si va ≥ 15 tics atrasada): (m) vuelve a pasar (78 % del tiempo real, espectador y vuelta).

Pendiente / visto:
- El tope de 60 Hz sube un poco las correcciones crudas en pantallas de 120 Hz (ver 1); netPlayersSmooth (main.js) las reparte. Si en un
  móvil de verdad se nota, subir SEND_HZ a 90 es una línea.
- Las correcciones visibles varían ±20 % entre semillas: para afinar más hacen falta más semillas o humanos de verdad.
- Nada de esto probado en un teléfono de verdad ni con netdrive (Chrome); los números son de los bancos en Node.

Para P8 (docs): CONTRACT.md y notes/net.md: `VB.Net.{MAXPRED_N, SEND_HZ}`, opciones de SessionN `maxPred`, `delayK`, `pace`, `stats.paced`
/ `stats.copies`; nethost `addLink` y la vuelta por otro enlace; net4test `--lane [--maxpred …]`, (n), (o); hosttest (f), `--reload`.

## STRESS (matriz de red dura; 22-nov-2026)

Sin git, sin push, sin despliegue. Ficheros: js/net.js (SOLO la SessionN: `MAXPRED_N` 30 → 60, `PRED_SOFT` 30 y la cuenta de esperas de la
conexión lenta), js/main.js (sección ONLINE, solo el de varios: `netPlayersSmooth` PS_TP 2 → 4,5 m, PS_MS2 300 ms, PS_SKIP 0,5 m;
`netBallSmooth` BS_TP 4 → 8 m), tools/stresstest.js (nuevo), tools/net4test.js (`cfg.cpuOf`, comprobación de huellas de (m)),
tools/hosttest.js (`cfg.script`, `cfg.cpuOf`), tools/netdrive.js (--multi: NDJIT, NDLOSS, NDBURST y saltos pintados del que va con el
reloj del balón). nethost.js, netrtc.js, sim, reglas y la Session del 1 contra 1: SIN tocar. Las 4 huellas idénticas; nettest 61,
net3test 61, mptest 53, netreplaytest 42, viewtest 29; netdrive 1v1 Precisa 8 ok y Fluida 9 ok.

Banco: `node tools/stresstest.js [--models precisaN,host6,coop] [--nets r60,r150,r250,burst,asym,cpu4,burstcpu] [--secs 420] [--points 11]`
(r60/r150/r250 = RTT con el anfitrión ±40 ms y 5 % de pérdida; burst = 150 ms ±15, 2 % y cortes de 300 ms cada 8-12 s en cada enlace;
asym = un invitado a 250 ms y los demás a 40; cpu4 = el invitado 1 con la sim ×4 y 8 ms de render; burstcpu = las dos).

Problemas encontrados y arreglos:
1. **Congelaciones de Precisa-N con cortes cortos y con 250 ms.** Con el tope de 30 tics (250 ms), a 150 ms el camino invitado → anfitrión
   → invitado ya gasta ~24: un corte de 300 ms de UN enlace paraba a los 4 ~250 ms; a 250 ms ±40 el camino solo ya pasaba de 30. El tope
   solo actúa al llegar a él (lo normal sigue en 15-25 tics), así que subirlo a 60 cambia únicamente lo que antes era una espera: se
   sigue prediciendo esa plaza con su última entrada y se corrige al llegar (un rollback de hasta 60 tics una vez: ~5 ms con la sim ×4,
   cabe en el frame: 0 vsyncs perdidas en burstcpu). La detección de conexión lenta (SLOW_MS) contaba paradas; ahora ir más de
   PRED_SOFT (30) tics por detrás de una plaza cuenta como esperarla (net4test (m) sigue pasando a espectador y vuelve).
2. **Lo que se pinta tras esas correcciones largas.** Con el tope de 60, el jugador de la plaza cortada se corregía 2-4 m (más que
   PS_TP 2 = teletransporte: netdrive 2v2 burst, pintado máx 3,0-3,8 m) y el balón hasta 5-7 m (BS_TP 4). PS_TP 4,5 m (lo de más de 1 m
   se reparte en ol × 150 ms hasta 300 ms) y BS_TP 8 m (como BLEND_MAX del modelo host).
3. **Modelo host, invitados: todos los saltos pintados > 0,5 m que quedaban eran del jugador que va con el reloj del balón** (netdrive
   6v6 × 12 con cortes: 4-9 por página en 60 s, todos «del que va con el reloj del balón»). Ese jugador no recibía desfase nuevo (L1:
   mano y balón a la vez); ahora lo pequeño sigue sin desfase pero un salto de más de PS_SKIP (0,5 m) sí se reparte.
4. **net4test (m)**: con el tope de 60 la plaza lenta llega a confirmar con SU entrada tics que el anfitrión ya había pasado a la IA, hasta
   que le llega el resync de espectador (~300 ms). Es la carrera de siempre al pasar una plaza a la IA (también posible con 30; el resync
   la arregla). La comprobación queda: huellas iguales siempre en las 3 que siguen y en las 4 desde el primer resync de espectador.

Medidas en Node (tools/stresstest.js, semilla 3, hasta 420 s / 11 puntos; «micro» = la peor máquina, también las paradas de < 100 ms;
saltos = corrección de la partida PREDICHA antes del suavizado de main.js, por minuto e invitado):
| celda | antes | después |
|---|---|---|
| 2v2 × 4, 150 ms con cortes (48-89 cortes) | 1280 frames en espera (máx 440 en una), micro 16,1 s, rb p99 30 (tope) | 5 frames, micro 0,2 s, rb p99 49 (máx 60) |
| ídem + invitado 1 con CPU ×4 | igual que arriba | igual que arriba; 0 vsyncs perdidas |
| 2v2 × 4, 250 ms ±40, 5 % | micro 7,1 s, rb p99 30 (tope), jug > 0,5 269/min | micro 0, rb p99 33 (máx 45), 248/min |
| 2v2 × 4, 150 ms ±40, 5 % | micro 33 ms, rb p99 24 (máx 30) | micro 0, rb p99 23 (máx 33) |
| 2v2 × 4, 60 ms ±40, 5 % · asimétrico 250/40 · CPU ×4 | 0 esperas (rb p99 15 / 21 / 22) | igual (sin cambio) |
| coop, 150 ms con cortes | 46 frames en espera, micro 2,4 s, rb p99 30 | 0, 0, rb p99 33 (máx 49) |
| coop, resto de la matriz | 0 esperas | igual |
| 6v6 × 12 modelo host, toda la matriz | 0 esperas, 0 saltos del balón pintado > 0,5 m (invitados y anfitrión), jugador propio 0 | igual (nethost sin tocar) |
| desincronías / reparaciones / plazas a la IA | 0 / 0 / 0 en todas las celdas | 0 / 0 / 0 |
| puntos iguales en todas las máquinas · el partido acaba | sí · sí (6v6 a 60 ms y asimétrico no acaban en 420 s: peloteos largos) | sí · igual |

Medidas en Chrome (netdrive --multi, BcLink, 90 s salvo donde se dice; «pintado» = net.view tras el suavizado, por invitado):
| prueba | antes | después |
|---|---|---|
| 2v2 × 4, 150 ms, cortes (NDBURST=1, 25-27) | esperas 12/117/102/117 (falla «≤ 3») | 0/0/0/0; jugadores pintados > 0,5 m 0 (máx 0,29 m); balón pintado > 0,5 m 5 → 6 (máx 0,55 → 0,63) |
| ídem, con el tope de 60 SIN el arreglo 2 | — | jugadores pintados máx 3,0-3,8 m, balón 5,4 m (por eso el arreglo 2) |
| 2v2 × 4, 250 ms ±40, 5 % (NDJIT=40 NDLOSS=5) | jugadores pintados > 0,5 m 11/17/12 (máx 2,7), > 0,15 m 183/343/194 | 0/0/0 (máx 0,28), 29/26/18; balón > 0,5 m 1-2 en los dos |
| 2v2 × 4, asimétrico 250/40/40 | pintados > 0,15 m 64/46/31, > 0,5 m 1 (2,11 m) | 13/13/10, 0 |
| 2v2 × 4, 150 ms, invitado 1 CPU ×4 | esperas 0; los otros invitados > 0,15 m 27/29 | 0; 7/9 (la página ×4: balón > 0,5 m 4 → 9 con 49-57 parones de rAF de la pestaña de detrás: ruido) |
| coop 2, 150 ms, cortes | esperas 19/7 (falla «≤ 3») | 0/0; jugadores pintados 0 > 0,5 m en los dos |
| 6v6 × 12 host, 150 ms, cortes (96-99) | jugadores pintados > 0,5 m 4-10 por invitado en 90 s (máx 2,06 m) | 0-1 por invitado en 60 s (máx 0,59 m); > 0,15 m ~110-150/min → ~55-80/min; misma secuencia de puntos |

Pruebas tras los cambios: las 4 huellas idénticas; net4test 123 OK; net4test --lane 34 OK; hosttest 54 OK; net12test 27 OK; cooptest 125 ok;
lobbytest 87 OK; nettest 61, net3test 61, mptest 53, netreplaytest 42, viewtest 29; netdrive 1v1 Precisa 8 ok, Fluida 9 ok; netdrive
--multi NDRELOAD (2v2, 150 ms) 6 ok (jugando a los 2,6 s, plaza a los 3,1 s).

Pendiente / visto:
- La carrera al pasar una plaza a la IA (punto 4) se podría cerrar del todo si un invitado solo confirmara tics suyos que el anfitrión
  ya ha recibido (ack); no se ha tocado (cambia cuándo confirma el invitado). Hoy la arregla el resync.
- Los saltos crudos de Precisa-N a 250 ms siguen altos (~250/min por invitado); lo pintado queda en p99 0,11 m sin saltos > 0,5 m.
- Las métricas de Node para el modelo host (jugadores de los demás, ~14/min > 0,5 m con cortes) son ANTES del suavizado de main.js;
  en Chrome quedan 0-1 por minuto.
- No probado: NDBURST por el lobby + WebRTC (NDRTC) ni la Carrera coop de punta a punta (--coop) con cortes; nada en un teléfono.

Para P8 (docs: CONTRACT.md y notes/net.md): `VB.Net.MAXPRED_N` 60 (antes 30) y PRED_SOFT; main.js PS_TP / PS_MS2 / PS_SKIP / BS_TP;
tools/stresstest.js en el control de regresión del online de varios; netdrive NDJIT / NDLOSS / NDBURST; net4test `cfg.cpuOf`; hosttest
`cfg.script` / `cfg.cpuOf`.

## Revisión 2: arreglos de los hallazgos confirmados (22-nov-2026)

Sin git, sin push, sin despliegue. Ficheros: js/net.js (SOLO la SessionN: la cuenta `slowLost`), js/netlobby.js (`mxRelinkHost`,
`mxBackAlive` / `VB.NetLobby.backAlive`, comentarios), js/main.js (sección ONLINE, `netBgTick`: una línea), js/version.js y
bridge/version.json (1.22.0 → 1.23.0), js/netroom.js (un comentario), tools/stresstest.js (celdas asym165 / asym240 / r250h240),
tools/lobbytest.js (sección h), notes/net.md, CONTRACT.md, TRASPASO.md. Las 4 huellas idénticas; 1 contra 1 sin tocar.

1. **Conexión lenta con un anfitrión de pantalla rápida** (net.js, SessionN). `slowLost` sumaba cada frame con un tic de menos que el
   reloj (redondeo) sin restar los de uno más, y también el frenado de la ventaja de frames (`t0 += STEP_MS × 0,125`). Ahora cuenta solo
   lo que CRECE el retraso de la partida contra el reloj (`(now - t0) / STEP_MS - localTick`, sin redondear) por encima de 1 tic, con el
   retraso de antes tomado DESPUÉS del frenado. 2v2 × 4, un invitado a 300 ms (los demás a 40), 90 s, `blockAcc` máximo de esa plaza en
   el anfitrión: 60 Hz 34 ms (a 250 ms) → 0 ms (a 300 ms), 165 Hz 1215 → 0 ms, 240 Hz 2498 ms y la plaza a la IA «conexión lenta» → 0 ms, IA 0.
   stresstest (240 s) precisaN y coop en asym165 / asym240 / r250h240 / asym / burst: IA 0, desync 0, puntos iguales. net4test (m)
   (600 ms, 50 % de pérdida) sigue pasando a espectador y volviendo (ritmo 93,5 %); net4test 123 OK.
2. **El anfitrión deja de reofrecer antes de que el invitado deje de poder volver** (netlobby.js `mxRelinkHost`). Antes 7 intentos
   (~60 s, respuesta mirada hasta ~69 s) frente a los 120 s de `MX_BACK_HOST_MS`. Ahora por tiempo: plazo de vuelta del modelo
   (120 s host, 55 s Precisa-N / coop) + `RELINK_PAD` 15 s desde la PRIMERA caída del par (`p.rlT0`; un 'down' nuevo no alarga), cada
   10 s el primer minuto y luego cada 20 s (respuesta mirada 9 s / 19 s). lobbytest (h), 6v6, página muerta 80 s: antes FALLO (sin
   enlace a los 120 s), ahora vuelve a SU plaza a los 82 s.
3. **Marca de vuelta caducada si el móvil descarta la pestaña tarde** (netlobby.js `mxBackAlive`, main.js `netBgTick`). Con la página
   oculta, cada ~3 s (el Worker del pulso, que no se frena en segundo plano) la marca BACK se reapunta con la hora de ahora (solo
   invitado de varios con partido en marcha; nada si la vuelta ya está en curso). lobbytest (h): la marca avanza 1,2 s con backAlive.
4. **Choque de versión** con la rama investigacion (también 1.22.0): online de varios pasa a **1.23.0** (VERSION, CHANGELOG, cabecera,
   bridge/version.json). Al fusionar, la entrada 1.22.0 de investigacion va debajo (o se juntan si salen a la vez).

Pruebas tras los cambios (una cada vez): fingerprint6 2v2 / mastery / salto / 6v6 idénticas; net4test 123 OK; hosttest 54 OK; cooptest
125 ok; lobbytest 87 → 91 OK (h nueva, ~2 min); roomtest 260 ok; nettest 61, net3test 61, mptest 53, abouttest OK; netdrive --multi 4
(2v2 Precisa-N, 80 ms): 5 ok (esperas 0, huellas iguales, resyncs 0, consola limpia).

Pendiente / visto:
- netdrive NDRELOAD con 80 s de página muerta por el lobby de verdad (NDRTC=1) no se ha añadido: lo cubre lobbytest (h) en Node.
- El frenado de la ventaja de frames (`adv > 1,5`: `t0 += STEP_MS × 0,125` por FRAME) frena más con más fps (×4 a 240 Hz que a 60);
  está también en la Session del 1 contra 1 y no se ha tocado («1v1 igual»). Si se quiere, pasarlo a ms por tiempo transcurrido.
- Teléfonos y redes de verdad, TURN y migración del anfitrión: TRASPASO.md «To-do».
