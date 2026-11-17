DISEÑO FINAL: prueba con partidillo y petos, y entrenos Rápido/Manual (Make the Cut)
Base: el diseño «mínimo», que es el que menos riesgo tiene: conserva trainWeek, del que dependen TRAIN_COACH y career-life.js:482/775. Le añado del diseño «jugador» la pantalla previa con objetivos, «Simular jornada», la pantalla de nota y la idea de reutilizar el partidillo. Del diseño «fiel» tomo el desempate en C con la tirada y la regla de que el Rápido nunca da oro. Lo he cotejado con el código real: sim.js:236-238, 299 y 1993; career.js:112-128, 555-717 y 1128-1146; main.js:520-560; career-ui.js:900-912; careertest:1955-1975; version.js:18 (VB.VERSION='1.1.1'). No he editado nada.

====================================================================
(A) RESUMEN PARA FERRAN
====================================================================
- Las pruebas ya no son una tirada de dados. Juegas un partidillo de un solo set a 15, con petos naranja y lima puestos encima de la camiseta de entreno. En playa juegas con tu futura pareja contra la pareja del club. En pista juegas con los suplentes contra los titulares.
- Antes de saltar a la pista, el entrenador te pone 3 objetivos según tu puesto (por ejemplo: 2 recepciones perfectas, 2 ataques ganados, como mucho 2 errores de saque).
- Al terminar te dan una nota con letra (A+ a F). Con A+, A o B te fichan. Con C decide un poco la suerte. Con D o F no te quedas. Si abandonas o reinicias, no pierdes la prueba.
- Puedes «Simular la prueba», pero sale peor (70 % de la probabilidad de hoy). Igual que en EA FC, jugarla siempre compensa.
- Entrenos: siguen las 3 sesiones por jornada, y cada una puede ser Jugar (los ejercicios que ya existen), Rápido o Descansar.
- Regla del EA FC: el Rápido te da tu mejor nota jugando en ese ejercicio, sin llegar nunca al oro. Si no lo has jugado nunca, te da una D. Jugar da un 25 % más, y la primera vez que juegas cada ejercicio, un 50 % extra.
- El «Enfoque de la semana» se convierte en el «Plan del entrenador», con un solo selector. El entrenador te recomienda uno, prepara las 3 sesiones y tiene el botón «Simular jornada».
- Hay una casilla «Entreno automático»: quien solo juega partidos sigue mejorando un poco, sin pasarse de fatiga.
- Al acabar un ejercicio sale una pantalla con la letra grande, «Récord: B → A» y la barra del atributo subiendo.
- Los ejercicios de la Carrera se juegan en tu sede (playa o pabellón) y con peto de entreno.

====================================================================
(B) ESPECIFICACIÓN TÉCNICA POR PARTES
====================================================================
Orden: P1 y P2 son independientes entre sí. P3 necesita P1. P4 necesita P1, P2 y P3. P5 es independiente. P6 necesita P5. P7 es opcional y necesita P4. P8 va al final.

--- P1. Partido a un solo set (js/sim.js) ---
- createGame:
  - Si `opts.sets === 1`, poner `g.toWin = 1`. Si no, NO crear el campo, para que la huella no cambie.
  - Puntos: `points: (beach && !(opts.sets===1)) ? 21 : SET_POINTS.indexOf(+opts.points) >= 0 ? +opts.points : (beach ? 21 : 25)`. Con sets 1 se aceptan 11 o 15 también en playa.
- Línea 1993: `matchWon = setWon && g.sets[w] === (g.toWin || 2) - 1`. Con un solo set nunca hay 3r set, así que setTarget y el cambio de campo a los 8 no cambian.
- El cambio de campo cada BEACH.swap puntos de la playa no se toca.
- Comprobar en sim.js qué más mira «partido al mejor de 3»: `grep -n "sets\[" js/sim.js` (hoja final, marcador y presentación del set decisivo).
- La hoja final y el HUD tienen que pintar bien «1-0».

--- P2. Petos (js/players.js, js/doll.js, tools/kittest.js) ---
- Constantes en players.js: `BIB = { a:'#ff7a1a', b:'#9be52e', alt:['#ffd21a','#2e8bff'], num:'#1b1b1b' }`.
- Modo nuevo en `setKit(st)`: `st.scrim = { base, shorts, bib0, bib1 }`.
  - Con él, TEAMS[t] = `mkKit(base, accentApagado, shorts, 'peto')` más `bib: bibT` y `numFill: BIB.num`.
  - Se SALTA rivalPick. Si no, al ser el mismo club, daría la equipación de la CPU.
  - Si kitDist(base, bib) < 1,1, se usa BIB.alt para ese equipo.
- `base` es la camiseta de entreno: el color del club mezclado al 55 % con gris #8a8f98, la misma para los dos equipos. `shorts` son los del club.
- kitOf(p): si TEAMS[team].bib existe, el líbero lleva el peto de su equipo y no se llama a liberoKit.
- `sig` (:177) incluye `scrim` serializado. kitFrom lo deja pasar.
- doll.js:
  - Añadir 'bib' a TC_ATLAS. TC_GEO no cambia: el peto va en el atlas y no hay que rehacer la malla.
  - paintBody: `pat === 'peto'` en las dos ramas.
  - Pabellón: fondo tc.base. Paneles delante y detrás en tc.bib dentro de TR_R, con los costados abiertos (franja de base de ±0,04 en u≈0,25 y 0,75). Escote redondo con ribete tc.dark. Dorsal grande en numFill.
  - Playa (rama de tirantes :400): el panel del peto va sobre la camiseta de tirantes, con el mismo hueco en los costados.
  - Mangas y brazos sin cambios (paintLimbs con base).
- Coste: 0 dibujos y 0 programas nuevos.

--- P3. Lógica de la prueba (js/career.js; BEACH y HALL) ---
Constantes:
- `TRIAL_PTS=15`, `TRIAL_SIM=0.7`, `TRIAL_C_BONUS=0.15`, `TRIAL_GOAL=0.25`.
- `TRIAL_CUT = [['A+',8.0],['A',7.2],['B',6.5],['C',5.8],['D',5.0]]`. Por debajo, F.

Datos guardados:
- `c.pick.trial = { club, offer:i, goals:[...], tries:n }` mientras está pendiente.
- `c.pick.res = { letter, nota, pass, goals:[{id,ok}], sim:bool }` como último resultado, para la UI.
- Migración: sessSane no interviene. En la fase pick, si falta c.pick.trial se toma como «no pendiente». Las partidas viejas en fase pick siguen funcionando, porque la oferta con o.trial y o.chance no cambia.

Funciones:
1) `trialGoals(c, o)`: 3 objetivos deterministas según el puesto, a partir de `c.player.roleKey`. Formato: `{id, txt, stat, op:'>='|'<=', n}`.
  - Playa atk: `kills>=2`, `blocks>=1`, `errors<=2`.
  - Playa cr: `perfect>=2`, `digs>=3`, `errors<=2`.
  - Playa uni: `kills>=2`, `perfect>=2`, `errors<=2`.
  - Pista OH: `kills>=2`, `recvP>=2`, `errors<=2`.
  - Pista OPP: `kills>=3`, `errors<=2`, `aces>=1`.
  - Pista MB: `blocks>=1`, `kills>=1`, `errors<=1`.
  - Pista S: `assists>=4`, `errors<=1`, `aces>=1`.
  - Pista L: `perfect>=2`, `digs>=3`, `poor<=2`.
  - Hay que confirmar los nombres de cada stat con lo que cuenta ingest (career.js:1068-1126).
2) `trialSetup(c,i)` (BEACH):
  - Copia el núcleo de matchSetup (:1021-1052): tus atributos más `o.mateP` contra una pareja del club `club(c,o.club)` hecha con genSt(clubOvr(k)) y semilla `hash(c.seed,'trialp',o.club,c.pick.round)`.
  - Devuelve `{sets:1, points:TRIAL_PTS, venue:'beach', ref:sin challenge, scrim:{...}, career:{trial:true, mode:'beach', club:o.club, offer:i, goals, ...los campos de career que lee el HUD}}`.
  - Reinicia el acumulador M igual que matchSetup.
  - NO llama a `life(c,'setup')`.
  - Guarda c.pick.trial.
3) `trialSetup6(c,i)` (HALL):
  - Igual, sobre el núcleo de matchSetup6 (:2367-2410). Tu equipo: tú en ctrlRole más suplentes a `k.ovr-4`. Rival: titulares a `k.ovr`.
  - Si el mundo ya tiene la plantilla real de ese club, se usa (titulares de lineup6 contra el resto). Si no, cada puesto se genera con genSt y una semilla 'trial6p', con nombres del generador de siempre.
  - points 15 y sets 1. Un set a 15 siempre pasa de NOTA_MIN_R=12.
4) `trialGrade(c, me, res, rallies)`:
  - `kmul = max(24,R)/max(15,R)`; en pista se multiplica además por RATE6[rol].
  - `nota = rating(me, res, R, kmul) + TRIAL_GOAL * objetivosCumplidos`, con tope 10.
  - La letra sale de TRIAL_CUT.
5) `trialResolve(c, i, pass, info)`: es el bloque que hoy está en acceptOffer :1471-1480 y acceptOffer6 :2838.
  - Si apruebas: mensaje del agente «¡Prueba superada! (nota B)», joinClub o joinClub6.
  - Si suspendes: `splice`, `pick.fail`, mensaje y, si no quedan ofertas, `genStartOffers(++round)`.
  - Limpia c.pick.trial y guarda c.pick.res.
6) `trialDone(i, res, g)`:
  - Se usa ingest más M.p[0], como siempre, sin closeMine: no hay XP, ni jornada, ni entrenador.
  - `pass = letra en {A+,A,B}`. Si la letra es C: `rng(hash(c.seed,'trial',o.club,c.pick.round))() < o.chance + TRIAL_C_BONUS`. En pista la clave es 'trial6'.
  - Llama a trialResolve. Devuelve `{letter, nota, pass, goals, club, left: n ofertas}`.
7) `trialSim(i)`: la tirada de hoy con `o.chance * TRIAL_SIM`, que sigue siendo determinista. El informe muestra C si apruebas y D si no. Llama a trialResolve.
8) `acceptOffer` y `acceptOffer6`, cuando la oferta es de prueba: llaman a trialSim. Así careertest y autoClub no se rompen.

Fachada BEACH (:2985) y HALL (:2953): `trialSetup`, `trialDone`, `trialSim`, `trialGoals`.
`VB.Career.trialDone(mode,i,res,g)` despacha por modo, como drillDone (:3014).

--- P4. Flujo de la prueba (js/main.js, js/career-ui.js) ---
main.js:
- `ctx.actions.startCareerTrial(i)`: copia de startCareerMatch (:582-600).
  - Usa `K.trialSetup(i)` y pasa `sets`, `points` y `kit: {scrim}` a startMatch, y de ahí a createGame y setGame.
  - startMatch (:489-499) tiene que reenviar `opts.sets` a Sim.createGame.
- careerEvents (:1072): si `g.career.trial` y el partido ha terminado, `careerEnd = K.trialDone(mode, offer, {sets,setScores,win}, g)`. NO se llama a matchDone.
- careerEndSheet (:624): variante de prueba con la letra grande, los 3 objetivos con su marca y el veredicto: «¡Te fichan!» o «Esta vez no: te quedan N ofertas». Usa `plural`, no muestra XP y usa sep o sepHTML para separar.
- toMenu (:688):
  - Prueba sin resolver (abandono): no se consume nada y se vuelve a `CareerUI.open('pick')`.
  - Prueba resuelta: si has aprobado, abre el hub con `{fresh:true}`; si no, `open('pick',{trialRes})`.
- restart (:720): con `g.career.trial` vuelve a llamar a startCareerTrial(i) sin consumir la prueba.
- abortMatch: con una prueba no se toca la fixture (no hay ninguna).

career-ui.js:
- Manejador 'offer' (:1462): si la oferta lleva o.trial, abre una subpantalla `sub.trial = i` en lugar de aceptar.
- Pantalla previa a la prueba (renderTrialPre):
  - Tarjeta del club y «El cuerpo técnico de X te observa».
  - Formato: «1 set a 15» sepHTML «con petos».
  - Los 3 objetivos.
  - Botón principal «Saltar a la pista» (`data-act="trial-play"`) y botón secundario «Simular (prob. N %)» (`data-act="trial-sim"`, N = round(o.chance×70)).
- offerCard (:753) y offerCard6 (:1227): el texto pasa a «Partidillo de prueba: hace falta nota B (con C decide la suerte)». El botón dice «Hacer la prueba».
- renderPick: muestra c.pick.res si existe. El aviso de :1312 se queda.
- Petos en el HUD: no hay que tocar nada, porque el color del equipo sale de TEAMS.

--- P5. Entrenos: notas, Rápido = récord, plan y automático (js/career.js) ---
No se crea ningún sistema nuevo. Se amplía el bloque de sesiones (:579-717) y el selector c.train pasa a ser el «Plan».

Constantes:
- `SESS_GRADE = [['A+',1.0],['A',0.85],['B',0.70],['C',0.55],['D',0.35]]`. Por debajo, F. Se calculan sobre `q = total / m[2]`, con m[2] = oro del ejercicio.
- `SESS_PLAY_K=1.25`. Por la regla de compatibilidad de abajo, en la práctica se aplica como «Rápido ×0,8».
- `SESS_FIRST=1.5`, `SESS_FOCUS=1.2`, `SESS_QUICK_K=0.8`, `SESS_QUICK_D=0.45`, `SESS_REST=8`, `SESS_AUTO_FAT=FAT_FREE` (40).

Regla de compatibilidad:
- «Jugar» conserva la ganancia de hoy (×1). El Rápido baja a ×0,8 y el primer partido sube a ×1,5. Así se cumplen las aserciones de careertest:1955-1957 (dS 3-7 con oro).

Datos guardados en c.ts (sessSane los sanea; en guardados viejos salen vacíos):
- `t.best = {id: total}` (0-30): el mejor total jugando.
- `t.seen = {id: 1}`.
- `t.auto` (bool): true por defecto si falta.
- `t.wkLog = []`: las sesiones de la jornada, para el resumen. Se vacía en sessClose.

Funciones:
- `sessGrade(id,total)`: devuelve la letra.
- `sessQuick(c,id)`:
  - Si existe `t.best[id]`: `min(t.best[id], m[2]-1)`, menos 1 por cada punto de fatigueMalus. Nunca llega al oro y no tiene variación aleatoria.
  - Si no: `min(fórmula de hoy, floor(m[2]*SESS_QUICK_D))`, es decir, D como mucho. Sigue siendo determinista.
- `sessDo(c,id,how,total,opt)`:
  - Fórmula de hoy × (quick ? SESS_QUICK_K : 1) × (jugado por primera vez ? SESS_FIRST : 1) × (D.g coincide con el grupo del foco c.train ? SESS_FOCUS : 1).
  - Si es jugado: actualiza best y seen, y añade `res.grade`, `res.best0`, `res.best`, `res.first`.
  - La impresión con quick avanza a la mitad (`SESS_IMP_A*0.5`).
  - La fatiga es SESS_FAT, como hoy, sea cual sea la nota.
  - Con `opt.auto` se salta la comprobación de sessFixture.
- `how === 'rest'`: gasta la sesión y hace `fatigue -= SESS_REST`. No sube stats ni toca la impresión.
- `sessPlan(c)`: devuelve 3 ids.
  - Primero, los ejercicios de sessDrills cuyo grupo coincide con el foco (atk: serve, set, atk; def: recv, block), ordenados por el atributo más bajo.
  - Después se completa con el orden del puesto. Se puede repetir un ejercicio.
  - Con foco phys o bal, solo vale el orden del puesto. Con rest, `['rest','rest','rest']`.
- `sessRecommend(c)`:
  - Si fatiga > 60: 'rest'.
  - Si no, el grupo del rol: atk, OPP, OH → 'atk'; cr, L, MB → 'def'; S → 'atk'. Si el hueco del grupo más flojo respecto a la media del jugador es ≥ 6, gana ese grupo.
- `sessSimDay(c)`: hace en Rápido las sesiones que quedan de sessPlan y devuelve el resumen.
- `sessAuto(c)`: se llama en closeMine (:1223, justo ANTES de trainWeek) y en su equivalente de pista; buscar con grep las llamadas a sessClose.
  - Si `t.auto` y la jornada no es un descanso (bye): rellena las sesiones libres con Rápido del plan, solo mientras `fatigue + SESS_FAT[n] <= SESS_AUTO_FAT`. Así el automático nunca te mete en la resta por fatiga.
  - Va en silencio, con un solo mensaje resumen como mucho.
- trainWeek y TRAIN se quedan como progreso de fondo, guiados por el mismo c.train. No se toca TRAIN_COACH ni career-life.
- drillSetup (:706): añade `venue: isHallC(c) ? 'hall' : 'beach'` y `scrim: {base:entreno, shorts, bib0: kt.shirt, bib1: BIB.b}`.
- Fachada: `trainPlan`, `trainRecommend`, `trainSimDay`, `setTrainAuto(b)`, `trainGrade`, y `trainSession(id,'rest')`.

--- P6. Entrenos: UI (js/career-ui.js, js/ui.js, js/main.js) ---
- trainCard (:616-638) pasa a ser el «Plan del entrenador»:
  - Tira de foco con los 5 botones de TRAIN_KEYS, que reutilizan `data-act="train"` (:1421). El recomendado lleva la etiqueta «Recomendado».
  - 3 casillas, una por sesión, con el ejercicio del plan (se puede cambiar con un desplegable), el récord en letra y «Rápido = B».
  - En cada casilla, los botones Jugar (`tr-play`), Rápido (`tr-quick`) y Descansar (`tr-rest`).
  - Debajo: barra de fatiga, impresión o confianza (más trainFight6 en pista), botón «Simular jornada» (`tr-simday`) y casilla «Entreno automático» (`tr-auto`).
  - Móvil primero: las casillas se apilan por debajo de 480 px.
- renderTrain (:903) en Jugador › Entreno: se quita la rejilla del «Enfoque de la semana» (:904-911) y en su lugar va un enlace «Plan del entrenador» a la pestaña Partido. Las barras de progreso por grupo se quedan, porque siguen siendo de trainWeek.
- ui.js careerDrillRec y gymEndShow (:4561-4610):
  - Letra grande (res.grade) y «Récord: B → A» si sube.
  - Barra del atributo animada de prog0 a prog (+gain), con «+1 Recepción (64)» si sube.
  - Fatiga antes y después, y la marca «¡Primera vez! +50 %».
  - Botones: «Volver a la Carrera» y, si quedan sesiones y la fatiga lo permite, «Siguiente sesión», que llama a startCareerDrill con el siguiente id del plan.
- main.js startDrill (:525):
  - `venue: cd && cd.venue ? cd.venue : venueNow()`, y forceVenue en lugar de unforceVenue cuando hay cd.
  - `setGame(g, cd ? Object.assign({}, cd.kit, {scrim: cd.scrim}) : null)`.
  - Ojo: los ejercicios siguen siendo 2v2 también en pista (sim.js:245). En el pabellón se ven 2v2, y eso es aceptable.

--- P7 (opcional, fase 3). Partidillo de equipo sorpresa ---
- Más o menos 1 de cada 4 jornadas (rng con hash(seed,'scrimwk',season,sessKey)) aparece «Partidillo de equipo» en trainCard. No gasta sesión.
- Reutiliza trialSetup y trialSetup6 con el club propio, `career:{scrim:true}` y points 11.
- Calcula la letra con trialGrade y da `SESS_MAX*2*GM` repartido en t.p entre los atributos del rol, más la impresión entera.
- Simularlo da C.
- Dato: `t.scrim = {wk, done}`.

--- P8. Cierre ---
- VB.VERSION pasa de '1.1.1' a '1.2.0', con una entrada en VB.CHANGELOG en castellano, sin créditos.
- Actualizar notes/carrera.md §Sesiones (:852-908), TRASPASO.md :241-246 y SIGUIENTE.md.
- Textos: ordinales con ordn («1r», «2º»), separadores con sep o sepHTML (nunca «·») y género neutro («Te fichan», «Superas la prueba»; nunca «Fichado/a»).
- Nombres de clubes inventados, los de siempre.

====================================================================
(C) PRUEBAS
====================================================================
- tools/careertest.js:
  - :71-82 se rehace.
    - Vía simulada (acceptOffer con prueba, que llama a trialSim): 30 semillas, `passN>0 && failN>passN`, y la tasa de aprobados queda por debajo de la de hoy.
    - Vía jugada: trialSetup devuelve sets 1, points 15, scrim y 3 goals. Con eventos falsos (modelo :142): una A → phase league y lvl 1; una F → se quita la oferta y `pick.fail>=0`; una C → resultado determinista con la misma semilla.
    - Abandonar a medias (trialSetup sin trialDone) deja la oferta y c.pick.trial intactos.
    - trialSetup no llama a life() ni toca la jornada, la XP ni el entrenador.
  - Pista (:624): lo mismo con trialSetup6 y 'trial6'. La nota no puede ser null con R≥15.
  - §Sesiones (:1887-1975):
    - Rápido sin récord ≤ floor(oro×0,45), con letra D o peor.
    - Con récord de oro jugado: Rápido = oro−1, nunca oro (la aserción :1964 sigue en pie).
    - El primer partido da ×1,5 y el segundo no.
    - El foco que coincide da ×1,2.
    - 'rest' baja 8 de fatiga.
    - sessPlan respeta el foco.
    - sessAuto nunca deja la fatiga por encima de 40 y no actúa en jornadas de descanso.
    - Los guardados viejos sin best, seen o auto se sanean.
    - Las aserciones de dS 3-7 y dQ<dS siguen valiendo.
  - BAD_TXT: sin «·» y sin ordinales con punto en los textos nuevos.
- tools/kittest.js:
  - En modo scrim, los dos equipos tienen el mismo base y bib distintos, y kitDist(bib0,bib1) ≥ 1,1.
  - Se usa la reserva BIB.alt cuando choca con el club.
  - El líbero lleva peto.
  - La huella de 400 casos sin kitLibero sale idéntica.
- tools/simtest.js: «huella 2v2 idéntica», `fingerprint6.js` y `--variant mastery` idénticas. Caso nuevo: createGame con sets 1 y points 15 en playa y en pista; el partido termina en 1-0 o 0-1 sin 3r set.
- Navegador:
  - Escena de depuración `trial` en main.js (al estilo de drill_end :1373).
  - Capturas con `tools/shot.js trial 390 844` y en 1280×720, en playa y pista, para ver los petos.
  - `tools/perf.js` (6v6 ≤45 dibujos), VB.Doll.lookSelfTest, drive.js, drive6.js y `bash tools/console.sh all`.
  - gymtest.js con `?drill=recv` sin regresiones.
- tools/abouttest.js: versión y changelog.

====================================================================
(D) RIESGOS Y DECISIONES ABIERTAS PARA FERRAN
====================================================================
1. Los cortes de la letra de prueba (B ≥ 6,5) están estimados con la calibración de rating: novato ~6,3 en un partido completo, y ganar el set suma +0,9. Hay que medirlos con los bots de simtest para que un jugador recién creado apruebe más o menos la mitad de las veces jugando bien. Es un riesgo de equilibrio.
2. Reiniciar o abandonar no gasta la prueba, y eso permite repetirla hasta aprobar. Opciones: dejarlo así (como los partidos de Carrera) o limitarlo a 2 reinicios, y que al 3º solo quede jugar a fondo o simular.
3. Petos: ¿naranja contra lima fijos, o un peto del color del club para tu equipo? Para los ejercicios propongo el color del club.
4. ¿«Entreno automático» activado por defecto, también en partidas ya empezadas? Propongo que sí, con el tope de fatiga 40. Cambia un poco la progresión de quien no entrenaba.
5. Los ejercicios siguen siendo 2v2 también en pista (la sim no tiene ejercicios 6v6). Hacer ejercicios de pista propios (pipe, primer tiempo) sería otro sprint.
6. Pista: si el mundo no guarda la plantilla real del club de la prueba, los dos equipos se generan. Cuando los titulares sean jugadores con nombre, ¿deben coincidir con los que verás después en el club?
7. El partidillo sorpresa del entrenador (P7) queda para una fase 3: ¿se hace ya o después?
8. ¿Se quita del todo la rejilla «Enfoque de la semana» de Jugador › Entreno (propuesta) o se deja duplicada a propósito?
9. La sim con `sets:1` es el único cambio en sim.js. Si alguna huella cambia, se para y se revisa antes de seguir.

Ficheros afectados (repo C:/Users/Puru/FCVBARB/carpetas/voley-3d-pruebas):
- js/sim.js
- js/players.js
- js/doll.js
- js/career.js
- js/main.js
- js/career-ui.js
- js/ui.js
- js/version.js
- tools/careertest.js
- tools/kittest.js
- tools/simtest.js
- notes/carrera.md
- TRASPASO.md
- SIGUIENTE.md

Los agentes no hacen commit.
====================================================================
DECISIONES TOMADAS (por defecto, revisables por Ferran)
====================================================================
- Petos de la prueba: naranja (#ff7a1a) contra lima (#9be52e), con BIB.alt si chocan. En los ejercicios de entreno: peto del color del club (bib0 = color de la camiseta del club).
- Reiniciar o abandonar la prueba NO la gasta (como los partidos de Carrera).
- «Entreno automático» activado por defecto (también en guardados viejos), tope de fatiga 40.
- P7 (partidillo sorpresa) NO se hace ahora: queda en el backlog.
- La rejilla «Enfoque de la semana» de Jugador › Entreno se quita y se sustituye por un enlace al Plan del entrenador.
- La versión y el changelog (P8) los hace la sesión principal, no los agentes.
