# Retomar el partido tras cerrar el navegador (1.22.0, imprescindible 4.9)

Informe: estudios/revision-juegos-voley-2026-11-21.md §4.9. Código: js/resume.js (`VB.Resume`, ui_main), main.js (startMatch, resumeMatch,
setGame, toMenu, bucle; candado de la Carrera: careerLockFix, careerLockSync, careerLockGate, concedeLive), sim.js (`Sim.concede`, solo
para la Carrera), career.js (`resumeGet/resumeSet`, candado `c.lock`, `lockResolve`, `matchSig`), ui.js (portada `#btnSeguir`, cinta
«Seguimos», pausa, `resumeGet/resumeSet`), career-ui.js (hub bloqueado: «Partido a medias»), menu-jugador.js (billete SPLAT),
matchstats.js / badges.js / retos.js (`resumeGet/resumeSet`). Prueba: `node tools/resumetest.js` (`--node` / `--browser`).

## Qué hace
- Al acabar cada punto (`point`), al resolverse un challenge (`challengeResult`) y al preparar el saque siguiente (`serveReady`) se guarda el
  partido (localStorage, solo en el aparato; account.js no lo sube). Dos claves: `make-the-cut.resume` (Partido rápido) y
  `make-the-cut.resume.career` (Carrera): un partido rápido no pisa el de la Carrera ni al revés. Partido rápido: nada antes del primer
  punto. Carrera: desde el PRIMER saque (cerrar en el primer peloteo tampoco deja repetirlo) y además al cerrarse una protesta del ambiente
  (`amb:choiceEnd`: su resultado no se puede volver a elegir). Nunca con eventos de la sim sin repartir (`g.events`, p. ej. el punto de
  castigo que el director del ambiente acaba de pitar en ese frame): se guarda en el siguiente.
- **Punto en juego (22-nov, revisión de la rama).** La foto es la de ANTES del saque con el mismo `g.rng`: cerrar a mitad de un peloteo y
  retomar dejaba repetir el punto (hasta ganarlo). Con el primer `toss` o `hit` después de la foto, la misma clave se reescribe con
  `live: 1` (el texto ya guardado con un campo más).
  - Partido rápido: retomar una foto `live` se puede, pero el partido queda con `g.rsNc = 1`: no cuenta (récord, racha, perfil, XP,
    insignias, retos; ui.js showEnd y retos.js counts, como `g.short`), las fotos siguientes llevan `nc: 1`, la cinta «Seguimos» lo dice y la
    hoja final también. Decisión provisional en notes/pendientes-ferran.md (4.9.6).
  - Carrera: ese punto es para el rival (ver «Carrera»).
- La portada enseña el billete **«Seguir el partido · 18-15 · 2º set»** (dorado, en el sitio de «¡Jugar ya!» / «Continuar carrera», que
  tapa mientras lo hay; con un partido de Carrera, «Carrera · 18-15 · 2º set», y la Carrera va primero si hay de los dos). Un toque →
  cortinilla → el partido sigue con la cinta «Seguimos · 18-15 | 2º set», sin previa.
- Partido rápido: se borra en `gameOver`, al salir al menú a mitad (abandonar), al empezar cualquier otro partido de verdad (setGame) y si la
  versión del juego no es la del guardado (o la foto no cuadra al rehacerla). Carrera: solo en `gameOver` (o al resolverse, abajo).
- No se guardan: online, demo, autopilot, espectador, Entrenamiento, la situación de la semana (22-24) ni las pruebas de fichaje (cerrar a
  mitad de una prueba la suspende: career.js trialStale, decisión de Ferran del 15-nov).

## Cómo es exacto
- La foto es `VB.Sim.serialize(g)` (la de la reparación del online): el grafo entero de la partida con el estado de `g.rng`, la rotación, el
  líbero, los cambios, el banquillo, la zona, el saque de firma, g.stats, g.aiMem… y las marcas de fuera de la sim que cuelgan de g
  (`g.short`, `g.playNow`, `g.reto`, `g.rsLock`…). Con ella van las opciones EXACTAS de `Sim.createGame` (`gOpts`, copia JSON hecha antes de
  crear) y las de `startMatch` (`opts`, sin `career` ni `kit`), la sede (`map`, también la sorteada), el partido corto (`qs`) y el marcador
  (`sc`: score, sets, setNo, `ss` = sets ya jugados, `pts`, `tw`, `one`). Al retomar no se vuelven a leer los ajustes.
- Rehacer: `Sim.createGame(gOpts)` → `Sim.deserialize(snap, g)` → `Sim.stateHash(g)` tiene que ser el guardado (`h`).
- Los módulos que cuentan durante el partido devuelven y reciben datos planos (`resumeGet(g)` / `resumeSet(o, g)`; VB.Resume cambia los
  jugadores por `{$pid}` y la partida por `{$g}`): la hoja final de ui.js, la Estadística del partido, las insignias, los retos y, en la
  Carrera, career.js. Lo de career.js va con `pack` (grafo: objetos compartidos y ciclos como `{$r}`, -0/NaN/undefined, sin funciones),
  porque la nota en directo comparte avisos entre `st.log` y `st.sanLog`, las consignas guardan instantáneas y el ambiente lleva eventos con
  jugadores. Los eventos iniciales de la partida rehecha (`newMatch`…) no se entregan (copyGame los vacía), así nada se pone a cero.
- Tamaño: ~11-15 KB en 2v2, ~40 KB en 6v6 con banquillo; Carrera ~24 KB en la playa y ~67 KB en la pista. Serializar cuesta ~1-2 ms.

## Carrera (22-nov-2026)
Decisión de Ferran: «No quiero que sea posible ir reiniciando tu progreso constantemente en los partidos del modo carrera. Cada vez que se
acabe un punto se guarda.» `VB.Resume.CAREER = true` (`?resumecareer=0` lo apaga, solo para pruebas).

**Qué partidos.** Los de la jornada (playa y pista, 2v2 y 6v6) y los de las extensiones que dan progreso: la selección (natl), el Partido
de las Estrellas (allstar) y el juvenil (pro). Nunca las pruebas de fichaje (siguen suspendiéndose al cerrar) ni los ejercicios.

**Lo que sigue igual al retomar.** career.js `resumeGet/resumeSet`: `M` entero (estadísticas de la jornada, nota en directo `VB.Rating`,
consignas `VB.Consignas` con su instantánea, director del ambiente `VB.Ambiente` con su azar, su cola, sus tarjetas y su árbitro, «Te
tienen estudiado», el deshacer del challenge). Al retomar, `newM(g)` pone las funciones nuevas (el aviso de la nota del ambiente, el módulo
del árbitro) y todo lo demás vuelve tal cual. Comprobado (resumetest C, playa y pista con ambiente): partido entero sin cortar vs. cortado
tras unos puntos y rehecho desde el JSON → el MISMO resumen de jornada (nota, estadísticas, sets) y la MISMA Carrera guardada al final.
La semilla del partido de la jornada es fija (main.js careerSeed: hash de la semilla de la Carrera y la firma del partido): cerrar en la
previa, antes de la primera foto, y volver da el mismo partido, no otro sorteo.

**Antitrampas.**
- a) Se guarda al acabar cada punto (y en el primer saque y en las protestas).
- b) **Cerrar con el punto en juego** (`live: 1`): al retomar, ese punto es para el rival, sin repetirlo. main.js `concedeLive`: si hacía
  falta, la sim avanza sin entrada hasta el saque y `Sim.concede(g, 0)` da el punto al rival (con su set y su partido si los cierra;
  silbato y equipo que saca, sin seña). `Sim.penalty` (la roja del ambiente) no valía: solo con balón muerto y nunca cierra un set.
  `Sim.concede` es nueva y no se llama en ninguna partida normal: las huellas fp-2v2 / fp-mastery / fp-salto no cambian; SIM_BASE de
  tools/fluidsimtest.js sí (cambia el texto de sim.js) y se ha regenerado. La cinta: «Seguimos · 18-15 | 2º set · Cerraste con el punto
  en juego: punto para el rival» (sale cuando ese punto ya se ha contado).
- c) **Salir al menú a mitad NO lo borra ni lo da por perdido**: se guarda y la Carrera queda bloqueada en ese partido hasta acabarlo. En la
  pausa no hay «Reiniciar» y «Salir al menú» pasa a «Salir (se guarda)»; salir lleva a la portada (billete «Seguir el partido»). Con el
  candado: «Jugar partido», «Continuar carrera» y «Seguir el partido» retoman ese partido (main.js `careerLockGate` delante de
  startCareerMatch, startCareerExt, startCareerTrial, startCareerDrill y startCareerExtDrill), el hub solo enseña «Partido a medias» con el
  marcador y «Seguir el partido» (career-ui.js `renderLock`), y career.js no deja simular, pasar de jornada (simulateNext, benchNext) ni
  cambiar la dificultad (`'match'`). Lo que había antes: salir dejaba la jornada pendiente y se podía volver a jugar de cero; ahora no.
  Las Estrellas ya castigaban más al salir (se simula sin ti, `quit`): siguen igual (`quitStrict`), sin guardarlo.
- d) **Foto que no vale** (otra versión del juego, huella distinta, foto rota) o **no hay foto** (otro aparato): descartar sería un reinicio
  gratis, así que el partido se **resuelve desde el marcador guardado** (main.js `careerLockFix` → career.js `lockResolve` o, en una
  extensión, `X.done` con el resultado simulado): lo que falta del partido, punto a punto, con la proporción de puntos que llevabas en ese
  partido suavizada con la de las medias (20 puntos de peso), estadísticas y nota de partido simulado y XP a medias, y un mensaje «Partido
  resuelto» en la bandeja. Nunca vuelve al 0-0. Se hace al arrancar el juego (antes de la portada), al abrir el hub y al intentar retomar.
  La foto de Carrera de otra versión no se tira al leerla (`VB.Resume.raw`): de ella sale el marcador.
- e) **Otras vías.**
  - El candado va también en el guardado de la Carrera (`c.lock = {cm, ext, sc, t, v}`, que account.js sube con la Carrera): al primer
    guardado del partido, al acabar cada set, al salir al menú y al irse la página a segundo plano (no en cada punto, para no subir la
    Carrera entera cada 15 s). En otro aparato sin la foto, el partido se resuelve desde ese marcador (puede ir algo por detrás: el del
    último set o el de cuando la app pasó a segundo plano). Abrir la Carrera en otro aparato no la desbloquea.
  - Recargar en la pausa entre puntos, en un cambio de set o en un tiempo muerto: vuelve la misma foto con el mismo azar → lo mismo.
  - Challenge: el resultado se guarda al resolverse; cerrar durante la revisión vuelve a la foto del punto (se puede volver a decidir si
    pedirlo, pero el resultado de la revisión es el mismo: no se gana nada).
  - Protestar / Dejarlo: se guarda al cerrarse la ficha (su resultado ya no se puede cambiar cerrando).
  - Borrar la Carrera (abandon) borra también el candado; no da ninguna ventaja.
  - **No cerrado (anotado):** volver a una copia vieja de la Carrera (la de la cuenta en la primera entrada en un aparato, el
    `make-the-cut.career.prev` a mano con tools/eval.js, o tocar localStorage con las herramientas del navegador). Es restaurar una partida
    guardada antigua: queda fuera de esto.

## No se guarda (aceptado)
- Las mejores jugadas de antes de cerrar (VB.Replay, pestaña «Jugadas»).
- Cosas de presentación: banners a medias, el plano de cámara del punto (se coloca con `CameraRig.snap`), la charanga.

## Pruebas
- `tools/resumetest.js` A) node, Partido rápido con la sim de verdad (5 formatos): las dos partidas (la que sigue y la rehecha desde el
  JSON) dan el MISMO `stateHash` en cada saque siguiente, la misma foto entera en el primero y lo mismo en insignias, retos y Estadística.
  C) node, Carrera (playa y pista, con nota, consignas, árbitro y ambiente): guardado desde el primer saque, foto en su clave, nota en
  directo igual al retomar, resumen y Carrera idénticos con y sin cortar, foto live → punto para el rival (determinista), candado (ni
  simular ni dificultad), resolución desde el marcador (nunca 0-0, «Partido resuelto»), otra versión no se tira, pack/unpack.
  B) navegador: Partido rápido (guardar, recargar, billete, retomar —también en la pausa del punto—, abandonar, otra versión, autopilot)
  y Carrera (guardar en el primer saque y el candado, pausa sin «Reiniciar» y «Salir (se guarda)», salir y volver por «Jugar partido» y
  por el billete, no se puede simular, recargar con el punto en juego → punto para el rival, otra versión → resuelto).

## Pruebas manuales que faltan (Ferran)
- En el móvil de verdad: jugar unos puntos, matar el navegador desde la multitarea, abrir de nuevo → «Seguir el partido» (también en la
  Carrera: el hub bloqueado y la cinta del punto perdido si la matas a mitad de un peloteo).
