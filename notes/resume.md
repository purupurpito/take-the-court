# Retomar el partido tras cerrar el navegador (1.22.0, imprescindible 4.9)

Informe: estudios/revision-juegos-voley-2026-11-21.md §4.9. Código: js/resume.js (`VB.Resume`, ui_main), main.js (startMatch, resumeMatch,
setGame, toMenu, bucle), ui.js (portada `#btnSeguir`, cinta «Seguimos», `resumeGet/resumeSet`), menu-jugador.js (billete SPLAT),
matchstats.js / badges.js / retos.js (`resumeGet/resumeSet`). Prueba: `node tools/resumetest.js` (`--node` / `--browser`).

## Qué hace
- En el Partido rápido (2v2, 6v6, playa, cortos, «Jugar ya», reto del día), al acabar cada punto (`point`), al resolverse un challenge
  (`challengeResult`) y al preparar el saque siguiente (`serveReady`) se guarda el partido en `make-the-cut.resume` (localStorage, solo en
  el aparato; account.js no lo sube). Nada antes del primer punto.
- La portada enseña el billete **«Seguir el partido · 18-15 · 2º set»** (dorado, en el sitio de «¡Jugar ya!» / «Continuar carrera», que
  tapa mientras lo hay). Un toque → cortinilla → el partido sigue con la cinta «Seguimos · 18-15 | 2º set», sin previa.
- Se borra: en `gameOver`, al salir al menú a mitad (abandonar), al empezar cualquier otro partido de verdad (setGame) y si la versión del
  juego no es la del guardado (o la foto no cuadra al rehacerla).
- No se guardan: online, demo, autopilot, espectador, Entrenamiento, la situación de la semana (22-24) ni nada de la Carrera (ver abajo).
  Las pruebas de fichaje siguen como antes: cerrar a mitad la suspende (career.js trialStale, decisión de Ferran del 15-nov).

## Cómo es exacto
- La foto es `VB.Sim.serialize(g)` (la de la reparación del online): el grafo entero de la partida con el estado de `g.rng`, la rotación, el
  líbero, los cambios, el banquillo, la zona, el saque de firma, g.stats, g.aiMem… y las marcas de fuera de la sim que cuelgan de g
  (`g.short`, `g.playNow`, `g.reto`…). Con ella van las opciones EXACTAS de `Sim.createGame` (`gOpts`, copia JSON hecha antes de crear) y las
  de `startMatch` (`opts`, sin `career` ni `kit`), la sede (`map`, también la sorteada) y el partido corto (`qs`). Al retomar no se vuelven a
  leer los ajustes: si cambiaste la dificultad o la duración entre medias, el partido es el de antes.
- Rehacer: `Sim.createGame(gOpts)` → `Sim.deserialize(snap, g)` → `Sim.stateHash(g)` tiene que ser el guardado (`h`); si no, se descarta.
- Los módulos que cuentan durante el partido devuelven y reciben datos planos (`resumeGet(g)` / `resumeSet(o, g)`; VB.Resume cambia los
  jugadores por `{$pid}` y la partida por `{$g}`): la hoja final de ui.js (`stats`, con el deshacer del challenge apuntando a la misma fila
  del jugador, y lo sin ver del Vestuario), la Estadística del partido (`cur.r` como índice), las insignias y los retos. Los eventos
  iniciales de la partida rehecha (`newMatch`…) no se entregan (copyGame los vacía), así nada se pone a cero.
- `tools/resumetest.js` A) en node con la sim de verdad (5 formatos): las dos partidas (la que sigue y la rehecha desde el JSON) dan el
  MISMO `stateHash` en cada saque siguiente (hasta el final del partido en 2v2, con cambio de set y gameOver), la misma foto entera en el
  primero y lo mismo en insignias, retos y Estadística del partido al final. B) en Chrome: guardar, recargar, billete, retomar (también en
  mitad de la pausa del punto), abandonar, otra versión, autopilot.
- No toca la sim: ni huellas (fp-2v2, fp-mastery, fp-salto) ni SIM_BASE. Guardar no gasta `g.rng` (solo lee).
- Tamaño: ~11-15 KB en 2v2, ~40 KB en 6v6 con banquillo; serializar cuesta ~1-2 ms.

## No se guarda (aceptado)
- Las mejores jugadas de antes de cerrar (VB.Replay, pestaña «Jugadas»).
- Cosas de presentación: banners a medias, el plano de cámara del punto (se coloca con `CameraRig.snap`), la charanga.

## Carrera: detrás del interruptor `CAREER` (apagado)
`VB.Resume.CAREER = false` (`?resumecareer=1` lo enciende para probar). Con él encendido ya funciona el camino: partido de la jornada
(nunca pruebas ni extensiones: selección, Estrellas, cesiones, juvenil…), firma del partido (`cm` = modo, temporada, fase, tipo, jornada,
ronda, rival) para no retomar uno que ya no toca, `startCareerMatch({resume})` con la foto encima. Por qué está apagado: lo que career.js
cuenta durante el partido (`M`: la nota en directo `VB.Rating`, las consignas `VB.Consignas`, el director del ambiente `VB.Ambiente` con
su propio azar y funciones dentro, los contadores de «Te tienen estudiado», los de la jornada) no se guarda todavía; al retomar empezaría
de cero y la nota y las estadísticas de la jornada saldrían incompletas. Para encenderlo: `resumeGet/resumeSet` en career.js (M sin `g`,
`rt`/`co`/`amb` con sus propios get/set de datos planos) y probarlo con careertest + una prueba de navegador como la B.

## Pruebas manuales que faltan (Ferran)
- En el móvil de verdad: jugar unos puntos, matar el navegador desde la multitarea, abrir de nuevo → «Seguir el partido».
